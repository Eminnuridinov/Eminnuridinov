#!/usr/bin/env python3
"""
ud6_decode.py — референтен декодер за Trocen .ud6 (TroCutCAD / TC-68xx oscillating knife)

Употреба:
    python3 ud6_decode.py FILE.ud6            # резюме + контури
    python3 ud6_decode.py FILE.ud6 --dump     # всички токени
    python3 ud6_decode.py FILE.ud6 --svg out.svg

Разбито от образци (Sep 2026). Виж UD6_FORMAT_SPEC.md за пълното описание.
"""
import sys, math

XOR = 0x7C

def tokenize(data: bytes):
    """Байт >= 0x80 е опкод; следващите байтове < 0x80 са неговият payload."""
    out = []; op = None; pay = []
    for b in data:
        if b >= 0x80:
            if op is not None: out.append((op, pay))
            op, pay = b, []
        elif op is not None:
            pay.append(b)
    if op is not None: out.append((op, pay))
    return out

def u7(p):  return [b ^ XOR for b in p]           # разкодирани 7-битови групи
def s35(p):                                       # 5 байта -> signed 35-bit, µm
    v = 0
    for b in p: v = (v << 7) | (b ^ XOR)
    return v - (1 << 35) if v >= (1 << 34) else v
def s14(p):                                       # 2 байта -> signed 14-bit, µm
    v = ((p[0] ^ XOR) << 7) | (p[1] ^ XOR)
    return v - 16384 if v >= 8192 else v

def decode(data: bytes):
    """Връща dict: header records, layers, contours (списък от точки в mm), trailer."""
    T = tokenize(data)
    contours = []; cur = None; x = y = 0; pending_bbox = {}
    layer_blocks = []; cur_layer = []
    counts = dict(dd=0, dc=0, de=0, df=0, fd=0, fc=0)
    for op, p in T:
        if op == 0xFC:                       # MOVE абсолютно -> начало на контур
            x, y = s35(p[0:5]), s35(p[5:10]); counts['fc'] += 1
            cur = dict(pts=[(x, y)], ops=[], bbox=pending_bbox or None, idx=None, layer=len(layer_blocks))
            pending_bbox = {}
            contours.append(cur)
        elif op == 0xDC:                     # LINE абсолютно
            x, y = s35(p[0:5]), s35(p[5:10]); counts['dc'] += 1
            cur['pts'].append((x, y)); cur['ops'].append('dc')
        elif op == 0xDD:                     # LINE относително dx,dy
            x += s14(p[0:2]); y += s14(p[2:4]); counts['dd'] += 1
            cur['pts'].append((x, y)); cur['ops'].append('dd')
        elif op == 0xDE:                     # LINE относително само X
            x += s14(p[0:2]); counts['de'] += 1
            cur['pts'].append((x, y)); cur['ops'].append('de')
        elif op == 0xDF:                     # LINE относително само Y
            y += s14(p[0:2]); counts['df'] += 1
            cur['pts'].append((x, y)); cur['ops'].append('df')
        elif op == 0xFD:                     # ъглова фаска (relative dx,dy), не влиза в брояча
            x += s14(p[0:2]); y += s14(p[2:4]); counts['fd'] += 1
            cur['pts'].append((x, y)); cur['ops'].append('fd')
        elif op == 0xB0 and len(p) == 11:        # bbox блок: стои ПРЕДИ 0xFC на контура
            rid = p[0] ^ XOR
            a, b = s35(p[1:6]), s35(p[6:11])
            if rid == 0x14: pending_bbox['ymin'], pending_bbox['ymax'] = a, b
            if rid == 0x15: pending_bbox['xmin'], pending_bbox['xmax'] = a, b
        elif op == 0xB0 and len(p) == 6 and (p[0] ^ XOR) == 0x23 and cur is not None:
            cur['idx'] = s35(p[1:6])
        elif op in (0xB7, 0xB4, 0xB5, 0xB1) and len(p) > 1:
            cur_layer.append((op, u7(p)))
            if op == 0xB1 and (p[0] ^ XOR) == 2:   # последният запис от блока на слоя
                layer_blocks.append(cur_layer); cur_layer = []
    hdr = {(p[0] ^ XOR): p for op, p in T if op == 0x94 and p}
    a4 = [s35(p[1:6]) for op, p in T if op == 0xA4 and len(p) == 6]
    return dict(tokens=T, contours=contours, layers=layer_blocks, header=hdr,
                counts=counts, a4=a4[0] if a4 else None)

def summary(d, name=''):
    c = d['counts']; H = d['header']
    print(f"== {name}: {len(d['contours'])} contours, {len(d['layers'])} layer block(s), "
          f"segments dd={c['dd']} dc={c['dc']} de={c['de']} df={c['df']} fd={c['fd']}")
    if 5 in H: print(f"   header rec5 (segment count) = {s35(H[5][1:6])}   check dd+dc+de+df = {c['dd']+c['dc']+c['de']+c['df']}")
    if 3 in H: print(f"   header rec3 (Xmax, Ymin)    = {s35(H[3][1:6])/1000:.3f}, {s35(H[3][6:11])/1000:.3f} mm")
    if 24 in H: print(f"   header rec24 (W, H)         = {s35(H[24][1:6])/1000:.3f}, {s35(H[24][6:11])/1000:.3f} mm")
    if d['a4'] is not None: print(f"   a4[0x10] (unknown)          = {d['a4']}")
    for i, k in enumerate(d['contours'], 1):
        pts = k['pts']; xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        A = 0.5 * sum(pts[j][0]*pts[(j+1) % len(pts)][1] - pts[(j+1) % len(pts)][0]*pts[j][1] for j in range(len(pts)))
        bb = k['bbox'] or {}
        print(f"   #{i} idx={k['idx']} layer={k['layer']} pts={len(pts)} "
              f"X {min(xs)/1000:.3f}..{max(xs)/1000:.3f}  Y {min(ys)/1000:.3f}..{max(ys)/1000:.3f}  "
              f"{'CCW' if A > 0 else 'CW'}  bbox-rec={ {q: round(v/1000,3) for q, v in bb.items()} }")

def to_svg(d, path):
    pts_all = [p for k in d['contours'] for p in k['pts']]
    xs = [p[0] for p in pts_all]; ys = [p[1] for p in pts_all]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    W, Hh = (x1 - x0) / 1000, (y1 - y0) / 1000
    paths = []
    for k in d['contours']:
        s = ' '.join(f"{'M' if i == 0 else 'L'}{(x - x0)/1000:.3f},{(-(y) + y1)/1000:.3f}" for i, (x, y) in enumerate(k['pts']))
        paths.append(f'<path d="{s}" fill="none" stroke="#2dd4bf" stroke-width="0.3"/>')
    open(path, 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 -5 {W+10:.1f} {Hh+10:.1f}" '
                          f'style="background:#0f1115">{"".join(paths)}</svg>')

if __name__ == '__main__':
    if len(sys.argv) < 2: print(__doc__); sys.exit(1)
    data = open(sys.argv[1], 'rb').read()
    d = decode(data)
    summary(d, sys.argv[1])
    if '--dump' in sys.argv:
        x = y = 0
        for op, p in d['tokens']:
            if op in (0xFC, 0xDC): x, y = s35(p[0:5]), s35(p[5:10]); print(f"{hex(op)} ABS  ({x/1000:.3f}, {y/1000:.3f})")
            elif op in (0xDD, 0xFD): dx, dy = s14(p[0:2]), s14(p[2:4]); x += dx; y += dy; print(f"{hex(op)} REL  ({dx/1000:+.3f}, {dy/1000:+.3f}) -> ({x/1000:.3f}, {y/1000:.3f})")
            elif op == 0xDE: dx = s14(p[0:2]); x += dx; print(f"0xde  REL X {dx/1000:+.3f} -> ({x/1000:.3f}, {y/1000:.3f})")
            elif op == 0xDF: dy = s14(p[0:2]); y += dy; print(f"0xdf  REL Y {dy/1000:+.3f} -> ({x/1000:.3f}, {y/1000:.3f})")
            elif op in (0xAE, 0xAF): print(f"{hex(op)} <{len(p)} bytes>")
            else: print(f"{hex(op)} {u7(p)}")
    if '--svg' in sys.argv:
        to_svg(d, sys.argv[sys.argv.index('--svg') + 1])
