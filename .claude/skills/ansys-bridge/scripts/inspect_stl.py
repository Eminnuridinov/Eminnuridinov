#!/usr/bin/env python3
"""Оглед на STL модел — размери, обем, тегло, център на тежестта, равнини, SVG изгледи.

Работи само със стандартния Python (без numpy, matplotlib и каквото и да е друго),
за да може да се пусне навсякъде без инсталации.

Употреба:
    python3 inspect_stl.py model.stl --density 7850 --out ./ogled

STL няма мерни единици — приема се, че координатите са в милиметри.
Плътността се подава в kg/m3 (стомана 7850, алуминий 2700, месинг 8470).

Най-полезната част от изхода са равнините: най-големите плоски повърхнини
с площта и позицията си. Те са кандидатите за закрепване и товар, и за
всяка осева равнина се изписва готовата команда за избор в MAPDL.
"""

import argparse
import math
import os
import struct
import sys


# ---------------------------------------------------------------- четене

def read_stl(path):
    """Връща списък от триъгълници [(v0, v1, v2), ...], всеки връх — кортеж (x, y, z)."""
    size = os.path.getsize(path)
    with open(path, "rb") as f:
        head = f.read(84)

    if len(head) >= 84:
        n_tri = struct.unpack("<I", head[80:84])[0]
        if size == 84 + 50 * n_tri:
            return _read_binary(path, n_tri)

    if head[:5].lower() == b"solid":
        return _read_ascii(path)

    # Последен опит — може заглавието да лъже за броя.
    return _read_binary(path, (size - 84) // 50)


def _read_binary(path, n_tri):
    tris = []
    with open(path, "rb") as f:
        f.seek(84)
        for _ in range(n_tri):
            data = f.read(50)
            if len(data) < 50:
                break
            v = struct.unpack("<12fH", data)
            tris.append(((v[3], v[4], v[5]),
                         (v[6], v[7], v[8]),
                         (v[9], v[10], v[11])))
    return tris


def _read_ascii(path):
    tris, verts = [], []
    with open(path, "r", errors="ignore") as f:
        for line in f:
            parts = line.split()
            if len(parts) == 4 and parts[0] == "vertex":
                verts.append((float(parts[1]), float(parts[2]), float(parts[3])))
                if len(verts) == 3:
                    tris.append(tuple(verts))
                    verts = []
            elif parts and parts[0] == "endfacet":
                verts = []
    return tris


# ---------------------------------------------------------------- вектори

def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def norm(a):
    return math.sqrt(dot(a, a))


def unit(a):
    n = norm(a)
    return (a[0] / n, a[1] / n, a[2] / n) if n > 1e-12 else (0.0, 0.0, 0.0)


# ---------------------------------------------------------------- геометрия

def analyse(tris):
    """Обем, площ, габарити, център на тежестта.

    Обемът се смята като сума от знакови тетраедри между началото на
    координатната система и всеки триъгълник — за затворена повърхнина
    добавките извън тялото се съкращават взаимно.
    """
    vol = 0.0
    area = 0.0
    cx = cy = cz = 0.0
    lo = [float("inf")] * 3
    hi = [float("-inf")] * 3

    for a, b, c in tris:
        n = cross(sub(b, a), sub(c, a))
        area += 0.5 * norm(n)
        v = dot(a, cross(b, c)) / 6.0
        vol += v
        cx += v * (a[0] + b[0] + c[0]) / 4.0
        cy += v * (a[1] + b[1] + c[1]) / 4.0
        cz += v * (a[2] + b[2] + c[2]) / 4.0
        for p in (a, b, c):
            for i in range(3):
                lo[i] = min(lo[i], p[i])
                hi[i] = max(hi[i], p[i])

    if abs(vol) > 1e-9:
        cog = (cx / vol, cy / vol, cz / vol)
    else:
        cog = (0.0, 0.0, 0.0)

    return {
        "volume": abs(vol),
        "area": area,
        "bbox_min": tuple(lo),
        "bbox_max": tuple(hi),
        "dims": tuple(hi[i] - lo[i] for i in range(3)),
        "cog": cog,
        "n_tri": len(tris),
    }


def find_planes(tris, min_area_frac=0.01):
    """Групира триъгълниците по равнина (нормала + отстояние).

    Извитите повърхнини имат постоянно менящи се нормали и не се групират —
    точно затова остават само истинските равнини, които търсим.
    """
    groups = {}
    total_area = 0.0

    for a, b, c in tris:
        raw = cross(sub(b, a), sub(c, a))
        tri_area = 0.5 * norm(raw)
        if tri_area < 1e-12:
            continue
        total_area += tri_area
        n = unit(raw)
        key = (round(n[0], 2), round(n[1], 2), round(n[2], 2),
               round(dot(n, a), 1))
        g = groups.setdefault(key, {"area": 0.0, "n": n, "d": dot(n, a),
                                    "lo": [float("inf")] * 3,
                                    "hi": [float("-inf")] * 3})
        g["area"] += tri_area
        for p in (a, b, c):
            for i in range(3):
                g["lo"][i] = min(g["lo"][i], p[i])
                g["hi"][i] = max(g["hi"][i], p[i])

    out = [g for g in groups.values() if g["area"] >= min_area_frac * total_area]
    out.sort(key=lambda g: -g["area"])
    return out


AXES = "XYZ"


def axis_of(n, tol=0.02):
    """Ако нормалата съвпада с координатна ос, връща (име, знак); иначе None."""
    for i in range(3):
        others = [abs(n[j]) for j in range(3) if j != i]
        if abs(abs(n[i]) - 1.0) < tol and max(others) < tol:
            return AXES[i], (1 if n[i] > 0 else -1)
    return None


# ---------------------------------------------------------------- рисуване

VIEWS = {
    "otpred": ((1, 0, 0), (0, 0, 1), (0, 1, 0)),    # гледаме по +Y
    "otgore": ((1, 0, 0), (0, 1, 0), (0, 0, -1)),   # гледаме по -Z
    "otdqsno": ((0, 1, 0), (0, 0, 1), (-1, 0, 0)),  # гледаме по -X
}


def iso_basis():
    """Изометричен изглед — завъртане на 45° около Z, после наклон надолу."""
    a = math.radians(45.0)
    b = math.radians(35.264)
    view = unit((-math.cos(b) * math.cos(a), -math.cos(b) * math.sin(a), -math.sin(b)))
    right = unit(cross((0, 0, 1), view))
    up = unit(cross(view, right))
    return right, up, view


def render_svg(tris, basis, path, width=760, height=560, title=""):
    right, up, view = basis
    light = unit((-0.4, -0.5, -0.75))

    faces = []
    for a, b, c in tris:
        raw = cross(sub(b, a), sub(c, a))
        n = unit(raw)
        if dot(n, view) > -1e-6:      # обърнат настрани или назад — не се вижда
            continue
        pts = [(dot(p, right), dot(p, up)) for p in (a, b, c)]
        depth = (dot(a, view) + dot(b, view) + dot(c, view)) / 3.0
        shade = max(0.0, -dot(n, light))
        faces.append((depth, pts, shade))

    if not faces:
        return False

    faces.sort(key=lambda f: -f[0])   # най-далечните първи

    xs = [p[0] for _, pts, _ in faces for p in pts]
    ys = [p[1] for _, pts, _ in faces for p in pts]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    pad = 30
    sx = (width - 2 * pad) / max(x1 - x0, 1e-9)
    sy = (height - 2 * pad) / max(y1 - y0, 1e-9)
    s = min(sx, sy)
    ox = pad + ((width - 2 * pad) - (x1 - x0) * s) / 2.0
    oy = pad + ((height - 2 * pad) - (y1 - y0) * s) / 2.0

    def to_px(p):
        return (ox + (p[0] - x0) * s, height - (oy + (p[1] - y0) * s))

    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">',
        f'<rect width="{width}" height="{height}" fill="#0f1115"/>',
    ]
    for _, pts, shade in faces:
        r = int(40 + 150 * shade)
        g = int(70 + 175 * shade)
        b = int(80 + 165 * shade)
        d = " ".join(f"{x:.1f},{y:.1f}" for x, y in (to_px(p) for p in pts))
        out.append(f'<polygon points="{d}" fill="rgb({r},{g},{b})"/>')

    if title:
        out.append(
            f'<text x="16" y="28" font-family="monospace" font-size="15" '
            f'fill="#2dd4bf">{title}</text>')
    # мащабна отсечка
    bar_mm = nice_step((x1 - x0) / 4.0)
    bar_px = bar_mm * s
    out.append(
        f'<line x1="16" y1="{height-22}" x2="{16+bar_px:.1f}" y2="{height-22}" '
        f'stroke="#8a93a0" stroke-width="2"/>'
        f'<text x="16" y="{height-30}" font-family="monospace" font-size="12" '
        f'fill="#8a93a0">{fmt(bar_mm)} mm</text>')
    out.append("</svg>")

    with open(path, "w") as f:
        f.write("\n".join(out))
    return True


def nice_step(v):
    if v <= 0:
        return 1.0
    e = math.floor(math.log10(v))
    base = v / (10 ** e)
    for c in (1, 2, 5, 10):
        if base <= c:
            return c * (10 ** e)
    return 10 ** (e + 1)


def fmt(v):
    if abs(v) < 1e-9:
        return "0"
    if abs(v) >= 100:
        return f"{v:.0f}"
    if abs(v) >= 1:
        return f"{v:.1f}"
    return f"{v:.3f}"


POSOKI = {("X", 1): "надясно", ("X", -1): "наляво",
          ("Y", 1): "назад", ("Y", -1): "напред",
          ("Z", 1): "нагоре", ("Z", -1): "надолу"}


# ---------------------------------------------------------------- отчет

def report(info, planes, density, svg_files):
    L = []
    dx, dy, dz = info["dims"]
    lo, hi = info["bbox_min"], info["bbox_max"]
    vol = info["volume"]

    L.append("=" * 62)
    L.append("ОГЛЕД НА МОДЕЛА  (координатите се приемат в mm)")
    L.append("=" * 62)
    L.append("")
    L.append(f"триъгълници      : {info['n_tri']}")
    L.append(f"габарити         : {fmt(dx)} x {fmt(dy)} x {fmt(dz)} mm")
    L.append(f"обхват X         : {fmt(lo[0])} ... {fmt(hi[0])}")
    L.append(f"обхват Y         : {fmt(lo[1])} ... {fmt(hi[1])}")
    L.append(f"обхват Z         : {fmt(lo[2])} ... {fmt(hi[2])}")
    L.append(f"обем             : {fmt(vol)} mm3  ({vol/1000.0:.2f} cm3)")
    L.append(f"повърхнина       : {fmt(info['area'])} mm2")
    if density:
        L.append(f"маса             : {vol * density / 1e9:.3f} kg  "
                 f"(при {density:.0f} kg/m3)")
    c = info["cog"]
    L.append(f"център на тежест : X={fmt(c[0])}  Y={fmt(c[1])}  Z={fmt(c[2])}")

    # Груба оценка на мрежата спрямо тавана на студентската версия
    L.append("")
    h_min = (6.0 * vol / 85000.0) ** (1.0 / 3.0) if vol > 0 else 0.0
    h_start = max(info["dims"]) / 20.0
    L.append(f"минимален размер на елемента при таван 128k възела : "
             f"~{fmt(h_min)} mm")
    L.append(f"препоръчан размер за първо смятане                 : "
             f"~{fmt(h_start)} mm")

    L.append("")
    L.append("-" * 62)
    L.append("РАВНИНИ (кандидати за закрепване и товар)")
    L.append("-" * 62)
    if not planes:
        L.append("Няма ясно изразени равнини — моделът е предимно извит.")
    for i, g in enumerate(planes[:10], start=1):
        n, d = g["n"], g["d"]
        ext = [g["hi"][k] - g["lo"][k] for k in range(3)]
        ax = axis_of(n)
        L.append("")
        L.append(f"{i}. площ {fmt(g['area'])} mm2   нормала "
                 f"({n[0]:+.2f}, {n[1]:+.2f}, {n[2]:+.2f})")
        L.append(f"   размери {fmt(ext[0])} x {fmt(ext[1])} x {fmt(ext[2])} mm")
        if ax:
            axis, sign = ax
            pos = d * sign + 0.0
            L.append(f"   равнина {axis} = {fmt(pos)}  "
                     f"(гледа {POSOKI[(axis, sign)]})")
            L.append(f"   MAPDL: mapdl.nsel(\"S\", \"LOC\", \"{axis}\", {fmt(pos)})")
        else:
            L.append("   наклонена равнина — избира се по име, не по координата")

    if svg_files:
        L.append("")
        L.append("-" * 62)
        L.append("ИЗГЛЕДИ")
        L.append("-" * 62)
        for f in svg_files:
            L.append(f"  {f}")

    return "\n".join(L)


# ---------------------------------------------------------------- главна

def main():
    ap = argparse.ArgumentParser(description="Оглед на STL модел за подготовка на FEA")
    ap.add_argument("stl", help="път до .stl файла")
    ap.add_argument("--density", type=float, default=7850.0,
                    help="плътност в kg/m3 (стомана 7850, алуминий 2700)")
    ap.add_argument("--out", default=None, help="папка за SVG изгледите")
    ap.add_argument("--no-svg", action="store_true", help="само числа, без картинки")
    args = ap.parse_args()

    if not os.path.exists(args.stl):
        sys.exit(f"Няма такъв файл: {args.stl}")

    tris = read_stl(args.stl)
    if not tris:
        sys.exit("Файлът не съдържа триъгълници — не е валиден STL.")

    info = analyse(tris)
    planes = find_planes(tris)

    svg_files = []
    if not args.no_svg:
        out_dir = args.out or os.path.dirname(os.path.abspath(args.stl))
        os.makedirs(out_dir, exist_ok=True)
        base = os.path.splitext(os.path.basename(args.stl))[0]
        views = dict(VIEWS)
        views["izo"] = iso_basis()
        for name, basis in views.items():
            path = os.path.join(out_dir, f"{base}_{name}.svg")
            if render_svg(tris, basis, path, title=f"{base} — {name}"):
                svg_files.append(path)

    print(report(info, planes, args.density, svg_files))


if __name__ == "__main__":
    main()
