#!/usr/bin/env python3
"""
dxf_read.py — минимален DXF четец (ASCII R12/R2000+) без зависимости.

    read_dxf(path, seg_len=0.6, min_segs=64) -> [[(x, y), ...], ...]   (mm, Y нагоре)

Поддържа LWPOLYLINE (с bulge), POLYLINE/VERTEX (с bulge), CIRCLE, ARC и LINE
(отделни LINE се навързват в затворени контури по съвпадащи краища, 1 µm толеранс).
Редът на контурите = редът на ентитетите във файла. Отворени вериги се пропускат с
предупреждение — .ud6 контурът е винаги затворен.
"""
import math, sys

def _pairs(path):
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        lines = [l.rstrip('\r\n') for l in f]
    return [(int(lines[i].strip()), lines[i + 1].strip()) for i in range(0, len(lines) - 1, 2)]

def _entities(pairs):
    """Списък от (type, [(code, value), ...]) само от секция ENTITIES."""
    ents = []; cur = None; in_ent = False
    for code, val in pairs:
        if code == 0 and val == 'SECTION': sec = None
        if code == 2 and cur is None and not in_ent: sec = val
        if code == 0 and val == 'ENDSEC': in_ent = False; cur = None
        if code == 0 and in_ent:
            cur = [val, []]; ents.append(cur)
        if code == 2 and val == 'ENTITIES' and not in_ent:
            in_ent = True; continue
        if cur is not None and code != 0:
            cur[1].append((code, val))
    return [(t, g) for t, g in ents]

def _arc_pts(cx, cy, r, a0, a1, seg_len, min_segs):
    """Точки по дъга от ъгъл a0 до a1 (rad, CCW ако a1 > a0), без крайната."""
    sweep = a1 - a0
    n = max(int(math.ceil(abs(sweep) * r / seg_len)), int(math.ceil(min_segs * abs(sweep) / (2 * math.pi))), 1)
    return [(cx + r * math.cos(a0 + sweep * i / n), cy + r * math.sin(a0 + sweep * i / n)) for i in range(n)]

def _bulge_pts(p0, p1, bulge, seg_len, min_segs):
    """Точки от p0 (вкл.) до p1 (без) по дъга с bulge = tan(θ/4)."""
    if abs(bulge) < 1e-12:
        return [p0]
    x0, y0 = p0; x1, y1 = p1
    theta = 4 * math.atan(bulge)
    d = math.hypot(x1 - x0, y1 - y0)
    r = d / (2 * math.sin(abs(theta) / 2))
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    h = math.sqrt(max(r * r - (d / 2) ** 2, 0.0))
    nx, ny = -(y1 - y0) / d, (x1 - x0) / d
    s = 1 if bulge > 0 else -1
    cx, cy = mx - s * nx * h, my - s * ny * h
    a0 = math.atan2(y0 - cy, x0 - cx)
    return _arc_pts(cx, cy, r, a0, a0 + theta, seg_len, min_segs)

def _poly(verts, bulges, closed, seg_len, min_segs):
    pts = []
    n = len(verts)
    last = n if closed else n - 1
    for i in range(last):
        p0, p1 = verts[i], verts[(i + 1) % n]
        pts += _bulge_pts(p0, p1, bulges[i], seg_len, min_segs)
    if not closed:
        pts.append(verts[-1])
    return pts

def _chain_lines(lines, tol=1e-3):
    """Навързва LINE сегменти в затворени контури (в реда на срещане)."""
    loops = []; used = [False] * len(lines)
    for i in range(len(lines)):
        if used[i]: continue
        used[i] = True
        chain = [lines[i][0], lines[i][1]]
        while True:
            end = chain[-1]
            if math.hypot(end[0] - chain[0][0], end[1] - chain[0][1]) <= tol and len(chain) > 2:
                chain.pop(); loops.append(chain); break
            found = False
            for j in range(len(lines)):
                if used[j]: continue
                a, b = lines[j]
                if math.hypot(end[0] - a[0], end[1] - a[1]) <= tol: chain.append(b); used[j] = True; found = True; break
                if math.hypot(end[0] - b[0], end[1] - b[1]) <= tol: chain.append(a); used[j] = True; found = True; break
            if not found:
                print(f"dxf_read: отворена LINE верига ({len(chain)} точки) — пропусната", file=sys.stderr)
                break
    return loops

def read_dxf(path, seg_len=0.6, min_segs=64):
    contours = []; lines = []
    ents = _entities(_pairs(path))
    i = 0
    while i < len(ents):
        t, g = ents[i]; i += 1
        d = {}
        for c, v in g: d.setdefault(c, []).append(v)
        F = lambda c, k=0, dflt=0.0: float(d[c][k]) if c in d and len(d[c]) > k else dflt
        if t == 'LWPOLYLINE':
            xs, ys = d.get(10, []), d.get(20, [])
            verts = [(float(x), float(y)) for x, y in zip(xs, ys)]
            # bulge (42) се отнася към върха, след който стои; подравняваме по позиция в групата
            bulges = [0.0] * len(verts); vi = -1
            for c, v in g:
                if c == 10: vi += 1
                elif c == 42 and vi >= 0: bulges[vi] = float(v)
            closed = int(F(70)) & 1 == 1
            contours.append(_poly(verts, bulges, closed, seg_len, min_segs))
        elif t == 'POLYLINE':
            closed = int(F(70)) & 1 == 1
            verts = []; bulges = []
            while i < len(ents) and ents[i][0] == 'VERTEX':
                vd = {}
                for c, v in ents[i][1]: vd.setdefault(c, []).append(v)
                verts.append((float(vd[10][0]), float(vd[20][0]))); bulges.append(float(vd.get(42, ['0'])[0]))
                i += 1
            if i < len(ents) and ents[i][0] == 'SEQEND': i += 1
            contours.append(_poly(verts, bulges, closed, seg_len, min_segs))
        elif t == 'CIRCLE':
            cx, cy, r = F(10), F(20), F(40)
            contours.append(_arc_pts(cx, cy, r, 0.0, 2 * math.pi, seg_len, min_segs))
        elif t == 'ARC':
            cx, cy, r = F(10), F(20), F(40)
            a0, a1 = math.radians(F(50)), math.radians(F(51))
            if a1 <= a0: a1 += 2 * math.pi
            pts = _arc_pts(cx, cy, r, a0, a1, seg_len, min_segs) + [(cx + r * math.cos(a1), cy + r * math.sin(a1))]
            lines += [(pts[k], pts[k + 1]) for k in range(len(pts) - 1)]
        elif t == 'LINE':
            lines.append(((F(10), F(20)), (F(11), F(21))))
    if lines:
        contours += _chain_lines(lines)
    # отворени полилинии не са контури за нож
    out = []
    for c in contours:
        if len(c) >= 3: out.append(c)
        else: print("dxf_read: контур с < 3 точки — пропуснат", file=sys.stderr)
    return out

if __name__ == '__main__':
    for c in read_dxf(sys.argv[1]):
        xs = [p[0] for p in c]; ys = [p[1] for p in c]
        print(f"{len(c):4d} pts  X {min(xs):.3f}..{max(xs):.3f}  Y {min(ys):.3f}..{max(ys):.3f}")
