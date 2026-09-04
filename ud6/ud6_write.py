#!/usr/bin/env python3
"""
ud6_write.py — референтен писач за Trocen .ud6 (TroCutCAD / TC-68xx oscillating knife)

    write_ud6(contours, template_path, **opts) -> bytes

`contours` е списък от затворени полигони в mm: [[(x, y), ...], ...], в произволна
координатна система (DXF: Y нагоре). Редът на рязане = редът на списъка; стартовата
точка на всеки контур = първата му точка (и при обръщане CW -> CCW).

Всичко служебно (header, layer block, trailer) се взима от шаблон — samples/template_red.ud6
(T4_order_ABC от TroCutCAD с червения слой от T1, вж. make_template_red.py). Преизчисляват се
само полетата, които зависят от геометрията (UD6_FORMAT_SPEC.md §5) и preview bitmap-ите.

CLI:
    python3 ud6_write.py IN.dxf OUT.ud6 [--template T.ud6] [--no-corner-marks]
"""
import math, sys

XOR = 0x7C
# шаблон по подразбиране: червен слой (ножът); синият (T4) е за друг модул — вж. make_template_red.py
DEFAULT_TEMPLATE = __import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), 'samples', 'template_red.ud6')
ABS_THRESHOLD_UM = 8000          # ръб > 8.000 mm -> 0xDC абсолютно, иначе относително
REL14_MAX = 8191                 # обхват на rel14 (±8.191 mm) — 8000 оставя резерв


# ---------------------------------------------------------------- кодиране
def enc7(vals):
    """Списък 7-битови стойности -> XOR-нати байтове."""
    return bytes((v & 0x7F) ^ XOR for v in vals)

def enc35(v):
    v &= (1 << 35) - 1
    return bytes((((v >> (7 * i)) & 0x7F) ^ XOR) for i in (4, 3, 2, 1, 0))

def enc14(v):
    if not -REL14_MAX <= v <= REL14_MAX:
        raise ValueError(f"rel14 overflow: {v} µm")
    v &= 0x3FFF
    return bytes((((v >> 7) & 0x7F) ^ XOR, (v & 0x7F) ^ XOR))

def dec35(p):
    v = 0
    for b in p: v = (v << 7) | (b ^ XOR)
    return v - (1 << 35) if v >= (1 << 34) else v

def tok(op, payload=b''):
    return (op, bytes(payload))

def tokenize(data):
    """Байт >= 0x80 е опкод; следващите байтове < 0x80 са неговият payload."""
    out = []; op = None; pay = bytearray()
    for b in data:
        if b >= 0x80:
            if op is not None: out.append((op, bytes(pay)))
            op, pay = b, bytearray()
        elif op is not None:
            pay.append(b)
    if op is not None: out.append((op, bytes(pay)))
    return out

def untokenize(tokens):
    out = bytearray()
    for op, p in tokens:
        out.append(op); out += p
    return bytes(out)

def rec_id(p):
    return p[0] ^ XOR if p else None

def um(v_mm):
    """mm -> µm, закръгляне half-up (еднакво с Math.floor(v*1000+0.5) в JS)."""
    return int(math.floor(v_mm * 1000.0 + 0.5))


# ---------------------------------------------------------------- шаблон
class Template:
    """Разрязва шаблонен .ud6 по структурни маркери (не по офсети)."""

    def __init__(self, data):
        self.data = data
        T = tokenize(data)
        if untokenize(T) != data:
            raise ValueError("шаблонът не се токенизира без загуба")
        # header: всичко до първия 0xB7 (начало на layer block)
        i_b7 = next(i for i, (op, p) in enumerate(T) if op == 0xB7)
        self.header = T[:i_b7]
        # layer block: от 0xB7 до 0xB1 [2, ...] включително
        i_b1 = next(i for i, (op, p) in enumerate(T) if i > i_b7 and op == 0xB1 and rec_id(p) == 2)
        self.layer = T[i_b7:i_b1 + 1]
        # 0xB0 [0x12], [0x13]: стоят ВЕДНЪЖ след layer block-а (преди първия контур),
        # не пред всеки контур — спецификацията §4 греши; проверено в T1..T4
        i_fc = next(i for i, (op, p) in enumerate(T) if op == 0xFC)
        self.layer_prefix = [t for t in T[i_b1 + 1:i_fc]
                             if not (t[0] == 0xB0 and rec_id(t[1]) in (0x14, 0x15))]
        # суфикс: 0xB0 [0x22] (между последния 0xB5 [0x30] и 0xB0 [0x23])
        i_23 = [i for i, (op, p) in enumerate(T) if op == 0xB0 and rec_id(p) == 0x23]
        self.contour_suffix = [t for t in T[i_23[0] - 1:i_23[0]] if t[0] == 0xB0 and rec_id(t[1]) == 0x22]
        if len(self.contour_suffix) != 1:
            raise ValueError("не намирам 0xB0 [0x22] преди 0xB0 [0x23]")
        # trailer: от 0x94 [0] след последния контур до края (вкл. 0xAE/0xAF блокове)
        self.trailer = T[i_23[-1] + 1:]
        if self.trailer[0] != (0x94, enc7([0])) or self.trailer[-1][0] != 0xAC:
            raise ValueError("trailer не започва с 0x94 [0] / не свършва с 0xAC")
        self.n_layers_in_template = sum(1 for op, p in T if op == 0xB7 and rec_id(p) == 4)

        hdr = {rec_id(p): p for op, p in self.header if op == 0x94 and p}
        self.rec4_prefix = hdr[4][1:-10]            # [0,1,0,1] — значение неизвестно, копира се
        self.rec18_flag = dec35(hdr[18][6:11])      # малък флаг 0/1/2 — неизвестен (§7), копира се
        self.rec9_second = dec35(hdr[9][6:11])      # 1495000 — неизвестно (§7), копира се
        W_t = dec35(hdr[24][1:6])
        # Хипотеза за 0x94 [9] първа стойност: (FIELD_W − W)/2, т.е. центриране на
        # задачата в поле с ширина FIELD_W. Извежда се от шаблона: 2·590000+340000 = 1 520 000.
        # Съвпада точно с T1, T3, T4; T2 се разминава със 7 µm. Непотвърдено на машината.
        self.field_w = 2 * dec35(hdr[9][1:6]) + W_t

    @classmethod
    def load(cls, path):
        with open(path, 'rb') as f:
            return cls(f.read())


# ---------------------------------------------------------------- геометрия
def signed_area2(pts):
    """Двойна ориентирана площ (shoelace); > 0 = CCW в координатната система на файла."""
    a = 0
    n = len(pts)
    for i in range(n):
        x0, y0 = pts[i]; x1, y1 = pts[(i + 1) % n]
        a += x0 * y1 - x1 * y0
    return a

def normalize(contours_mm, start='keep'):
    """mm -> µm (int); премества min X = 0, max Y = 0; CCW; без дублирани/нулеви точки.
    start='keep'    — стартова точка = първата подадена (и след обръщане CW -> CCW)
    start='topleft' — стартова точка = върхът с max Y, при равни — min X (както TroCutCAD в T4)"""
    if not contours_mm:
        raise ValueError("няма контури")
    raw = [[(um(x), um(y)) for x, y in c] for c in contours_mm]
    minx = min(x for c in raw for x, y in c)
    maxy = max(y for c in raw for x, y in c)
    out = []
    for k, c in enumerate(raw):
        pts = [(x - minx, y - maxy) for x, y in c]
        clean = []
        for p in pts:
            if not clean or p != clean[-1]:
                clean.append(p)
        if len(clean) > 1 and clean[0] == clean[-1]:
            clean.pop()
        if len(clean) < 3:
            raise ValueError(f"контур #{k + 1}: по-малко от 3 различни точки")
        if signed_area2(clean) < 0:                      # CW -> CCW, стартовата точка се запазва
            clean = [clean[0]] + clean[:0:-1]
        if start == 'topleft':
            s0 = min(range(len(clean)), key=lambda i: (-clean[i][1], clean[i][0]))
            clean = clean[s0:] + clean[:s0]
        out.append(clean)
    return out


# ---------------------------------------------------------------- контур -> токени
B5_30 = tok(0xB5, enc7([0x30]))

def encode_contour(pts, idx, corner_marks=True):
    """Връща (tokens, брой_сегменти). pts: затворен CCW полигон в µm без повторена крайна точка."""
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    T = [
        tok(0xB0, enc7([0x14]) + enc35(min(ys)) + enc35(max(ys))),
        tok(0xB0, enc7([0x15]) + enc35(min(xs)) + enc35(max(xs))),
        tok(0xFC, enc35(pts[0][0]) + enc35(pts[0][1])),
    ]
    nseg = 0
    n = len(pts)
    for i in range(n):
        x0, y0 = pts[i]; x1, y1 = pts[(i + 1) % n]
        dx, dy = x1 - x0, y1 - y0
        if math.hypot(dx, dy) > ABS_THRESHOLD_UM:
            T.append(tok(0xDC, enc35(x1) + enc35(y1)))
            if corner_marks and i != n - 1:
                T.append(B5_30)            # 0xB5 [0x30] след всяка 0xDC (правило от промпта)
        elif dy == 0:
            T.append(tok(0xDE, enc14(dx)))
        elif dx == 0:
            T.append(tok(0xDF, enc14(dy)))
        else:
            T.append(tok(0xDD, enc14(dx) + enc14(dy)))
        nseg += 1
    T.append(B5_30)                        # веднъж в края на контура
    return T, nseg


# ---------------------------------------------------------------- preview bitmap (0xAE / 0xAF)
PREVIEW_BG = 127        # фон
PREVIEW_INK = 0         # стойност за (единствения) слой; в двуслойните образци вторият слой е 1

def render_preview(polys, N):
    """N×N bitmap на задачата (0xAE: N=208, 0xAF: N=136), както го рисува TroCutCAD.

    Калибрирано по T4 (квадрати) и T3 (правоъгълник + кръг), пиксел по пиксел:
      s = N / max(W, H);  X е ОГЛЕДАЛНО: px = round((W − x)·s), ограничено до N−1;
      късата ос е центрирана: off = round((N − L·s)/2), py = off + round(−y·s).
    Линиите са 1 px (Bresenham). Стойности: 127 фон, 0 контур."""
    allx = [x for c in polys for x, y in c]; ally = [y for c in polys for x, y in c]
    W = max(allx) - min(allx); H = max(ally) - min(ally)
    L = max(W, H, 1)
    s = N / L
    rnd = lambda v: int(math.floor(v + 0.5))
    offx = rnd((N - W * s) / 2) if W < L else 0
    offy = rnd((N - H * s) / 2) if H < L else 0
    clamp = lambda v: max(0, min(N - 1, v))
    bm = bytearray([PREVIEW_BG]) * (N * N)
    def plot(px, py): bm[clamp(py) * N + clamp(px)] = PREVIEW_INK
    def line(x0, y0, x1, y1):
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            plot(x0, y0)
            if x0 == x1 and y0 == y1: break
            e2 = 2 * err
            if e2 >= dy: err += dy; x0 += sx
            if e2 <= dx: err += dx; y0 += sy
    for c in polys:
        P = [(offx + rnd((W - x) * s), offy + rnd(-y * s)) for x, y in c]
        for i in range(len(P)):
            (x0, y0), (x1, y1) = P[i], P[(i + 1) % len(P)]
            line(x0, y0, x1, y1)
    return bytes(bm)


# ---------------------------------------------------------------- header
GEOM_RECS = (3, 4, 5, 9, 17, 18, 21, 24)

def header_records(tpl, W, H, xmax, ymin, nseg, rec9_mode='center'):
    """Payload-и на 0x94 записите, зависещи от геометрията (§5). Стойности в µm.

    Емпирични правила от 4 образеца (T1..T4), не от документация:
      rec3  = (W, −(H−1))        4/4      rec17 = (0, Ymin+1)   4/4
      rec18 = (Xmax, флаг)       4/4      rec21 = (0, Xmax)     4/4
      rec4/24 = (W, H)           T3,T4 точно; T1/T2 се разминават с 1–2 µm
                                 (float bbox на оригинала, вж. доклада)
      rec5  = брой сегменти (DC+DD+DE+DF, без FD)   4/4
    """
    if rec9_mode == 'center':
        rec9_first = (tpl.field_w - W) // 2
    else:
        rec9_first = None   # копие от шаблона
    R = {
        3:  enc35(W) + enc35(-(H - 1)),
        4:  bytes(tpl.rec4_prefix) + enc35(W) + enc35(H),
        5:  enc35(nseg),
        17: enc35(0) + enc35(ymin + 1),
        18: enc35(xmax) + enc35(tpl.rec18_flag),      # флагът е неизвестен (§7)
        21: enc35(0) + enc35(xmax),
        24: enc35(W) + enc35(H),
    }
    if rec9_first is not None:
        R[9] = enc35(rec9_first) + enc35(tpl.rec9_second)   # втората стойност е неизвестна (§7)
    return R


# ---------------------------------------------------------------- писач
def write_ud6(contours, template_path=None, corner_marks=True, rec9_mode='center', start='keep', preview='render'):
    if template_path is None: template_path = DEFAULT_TEMPLATE
    tpl = template_path if isinstance(template_path, Template) else Template.load(template_path)
    polys = normalize(contours, start)

    body = list(tpl.layer_prefix)
    nseg_total = 0
    for k, pts in enumerate(polys):
        segs, nseg = encode_contour(pts, k + 1, corner_marks)
        body += segs
        body += tpl.contour_suffix
        body.append(tok(0xB0, enc7([0x23]) + enc35(k + 1)))   # пореден номер в реда на записване
        nseg_total += nseg

    allx = [x for c in polys for x, y in c]; ally = [y for c in polys for x, y in c]
    xmax, ymin = max(allx), min(ally)
    W, H = xmax - min(allx), max(ally) - ymin           # min X = 0, max Y = 0 след normalize

    recs = header_records(tpl, W, H, xmax, ymin, nseg_total, rec9_mode)
    header = []
    for op, p in tpl.header:
        rid = rec_id(p) if op == 0x94 else None
        if rid in recs:
            header.append(tok(0x94, enc7([rid]) + recs[rid]))
        else:
            header.append((op, p))        # всички останали записи — дословно от шаблона

    # trailer: 0x94 [0], 0xA4 [0x10, ???], 0xA5, 0xAD, 0xAE, 0xAF, 0xA2, 0xA1×13, 0xAC —
    # копира се дословно; 0xA4 [0x10] и 0xAD са НЕИЗВЕСТНИ (§7).
    # 0xAE/0xAF са preview bitmap-и (208², 136²) — рендват се от геометрията (preview='render')
    # или се копират от шаблона (preview='copy' — показва квадратите на T4).
    trailer = []
    for op, p in tpl.trailer:
        if preview == 'render' and op in (0xAE, 0xAF):
            N = 208 if op == 0xAE else 136
            p = enc7(render_preview(polys, N))
        trailer.append((op, p))
    return untokenize(header + tpl.layer + body + trailer)


# ---------------------------------------------------------------- CLI
if __name__ == '__main__':
    import argparse, os
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('dxf'); ap.add_argument('out')
    ap.add_argument('--template', default=DEFAULT_TEMPLATE)
    ap.add_argument('--no-corner-marks', action='store_true', help='без 0xB5 [0x30] след 0xDC (стил T4)')
    ap.add_argument('--rec9', choices=('center', 'copy'), default='center')
    ap.add_argument('--start', choices=('keep', 'topleft'), default='keep', help='стартова точка на контура')
    ap.add_argument('--preview', choices=('render', 'copy'), default='render', help='0xAE/0xAF preview bitmap')
    a = ap.parse_args()
    from dxf_read import read_dxf
    contours = read_dxf(a.dxf)
    data = write_ud6(contours, a.template, corner_marks=not a.no_corner_marks, rec9_mode=a.rec9, start=a.start, preview=a.preview)
    with open(a.out, 'wb') as f: f.write(data)
    print(f"{a.out}: {len(contours)} контура, {len(data)} байта")
