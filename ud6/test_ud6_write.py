"""
pytest за ud6_write.py — пуска се от папка ud6/:  python3 -m pytest -q
"""
import os, math, io, sys, subprocess
import pytest
sys.path.insert(0, os.path.dirname(__file__))
from ud6_write import (Template, write_ud6, tokenize, untokenize, enc35, enc14, dec35,
                       normalize, header_records, XOR)
from ud6_decode import decode, s35, s14

HERE = os.path.dirname(os.path.abspath(__file__))
S = lambda n: os.path.join(HERE, 'samples', n)
T4 = S('T4_order_ABC.UD6'); T1 = S('T1_ring_circles.UD6')
ALL = ['T1_ring_circles.UD6', 'T2_ring_polylines.UD6', 'T3_two_layers.UD6', 'T4_order_ABC.UD6']

def rd(p): return open(p, 'rb').read()
def hdr(d): return {rid: p for rid, p in d['header'].items()}
def rec2(d, i): p = d['header'][i]; return s35(p[-10:-5]), s35(p[-5:])
def rec1(d, i): return s35(d['header'][i][1:6])

# ---------------------------------------------------------------- кодиране
@pytest.mark.parametrize('v', [0, 1, -1, 8191, -8191, 8000, -8000])
def test_enc14_roundtrip(v):
    assert s14(list(enc14(v))) == v

@pytest.mark.parametrize('v', [0, 1, -1, 340000, -39999, (1 << 34) - 1, -(1 << 34)])
def test_enc35_roundtrip(v):
    assert dec35(enc35(v)) == v and s35(list(enc35(v))) == v

def test_enc14_overflow():
    with pytest.raises(ValueError): enc14(8192)

@pytest.mark.parametrize('name', ALL)
def test_tokenize_lossless(name):
    data = rd(S(name)); assert untokenize(tokenize(data)) == data

# ---------------------------------------------------------------- шаблон
def test_template_sections():
    t = Template.load(T4)
    assert [op for op, p in t.layer] == [0xB7] * 5 + [0xB4] * 2 + [0xB5] * 2 + [0xB1] * 2
    assert [p[0] ^ XOR for op, p in t.layer_prefix] == [0x12, 0x13]
    assert t.trailer[0] == (0x94, bytes([0 ^ XOR])) and t.trailer[-1][0] == 0xAC
    assert {op for op, p in t.trailer} >= {0xA4, 0xA5, 0xAD, 0xAE, 0xAF, 0xA2, 0xA1}
    assert t.field_w == 1520000 and t.rec18_flag == 0 and t.rec9_second == 1495000

def test_template_selfrebuild_bytes_identical():
    """header + layer + layer_prefix + оригиналните контурни токени + trailer == шаблонът."""
    t = Template.load(T4); T = tokenize(t.data)
    i0 = len(t.header) + len(t.layer) + len(t.layer_prefix)
    body = T[i0:len(T) - len(t.trailer)]
    assert untokenize(t.header + t.layer + t.layer_prefix + body + t.trailer) == t.data

# ---------------------------------------------------------------- header формули срещу образците
@pytest.mark.parametrize('name', ALL)
def test_header_formulas_match_samples(name):
    """Записи 3/5/17/18/21 се възпроизвеждат точно от геометрията на всеки образец;
    4/24 (W,H) — точно за T3/T4, до 3 µm за T1/T2 (float bbox в TroCutCAD)."""
    d = decode(rd(S(name))); t = Template.load(T4)
    pts = [p for c in d['contours'] for p in c['pts']]
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    xmax, ymin = max(xs), min(ys)
    W, H = rec2(d, 24)                      # W/H в образеца (float bbox, не от точките)
    nseg = sum(d['counts'][k] for k in ('dd', 'dc', 'de', 'df'))
    R = header_records(t, W, H, xmax, ymin, nseg)
    assert s35(R[5]) == rec1(d, 5)
    assert (s35(R[3][:5]), s35(R[3][5:])) == rec2(d, 3)
    assert (s35(R[17][:5]), s35(R[17][5:])) == rec2(d, 17)
    assert s35(R[18][:5]) == rec2(d, 18)[0]
    assert (s35(R[21][:5]), s35(R[21][5:])) == rec2(d, 21)
    assert (s35(R[24][:5]), s35(R[24][5:])) == (W, H)
    Wp, Hp = xmax - min(xs), max(ys) - ymin  # W/H от точките
    assert abs(Wp - W) <= 3 and abs(Hp - H) <= 3
    # rec9 хипотеза (центриране в поле 1520 mm): T1/T3/T4 точно, T2 ±7 µm
    tol = 7 if name.startswith('T2') else 0
    assert abs(s35(R[9][:5]) - rec2(d, 9)[0]) <= tol

# ---------------------------------------------------------------- normalize
def test_normalize_shift_ccw_start():
    sq_cw = [(10, 10), (10, 50), (50, 50), (50, 10), (10, 10)]     # CW, затворен, с отместване
    P = normalize([sq_cw])[0]
    assert P[0] == (0, -40000)                                       # стартовата точка се запазва
    assert min(x for x, y in P) == 0 and max(y for x, y in P) == 0
    assert len(P) == 4 and P == [(0, -40000), (40000, -40000), (40000, 0), (0, 0)]

def test_normalize_topleft_start():
    P = normalize([[(0, 0), (40, 0), (40, 40), (0, 40)]], start='topleft')[0]
    assert P == [(0, 0), (0, -40000), (40000, -40000), (40000, 0)]        # старт горе-вляво, надолу (T4)

def test_dxf_T4_order_ABC():
    from dxf_read import read_dxf
    C = read_dxf(os.path.join(HERE, 'tests', 'T4_order_ABC.dxf'))
    assert [round(min(x for x, y in c)) for c in C] == [0, 300, 150] and all(len(c) == 4 for c in C)
    d = decode(write_ud6(C, T4, start='topleft'))
    assert [c['bbox']['xmin'] for c in d['contours']] == [0, 300000, 150000]
    assert [c['pts'][0] for c in d['contours']] == [(0, 0), (300000, 0), (150000, 0)]

def test_normalize_rejects_degenerate():
    with pytest.raises(ValueError): normalize([[(0, 0), (1, 1), (0, 0)]])

# ---------------------------------------------------------------- писач
def test_abc_order_and_segments():
    sq = lambda x0: [(x0, 0), (x0 + 40, 0), (x0 + 40, 40), (x0, 40)]
    out = write_ud6([sq(0), sq(300), sq(150)], T4)
    d = decode(out)
    assert [c['idx'] for c in d['contours']] == [1, 2, 3]
    assert [c['bbox']['xmin'] for c in d['contours']] == [0, 300000, 150000]   # A, B, C — без сортиране
    assert d['counts']['dc'] == 12 and rec1(d, 5) == 12
    assert rec2(d, 3) == (340000, -39999) and rec2(d, 24) == (340000, 40000)
    assert rec2(d, 18) == (340000, 0) and rec2(d, 21) == (0, 340000) and rec2(d, 17) == (0, -39999)
    for c in d['contours']:
        A = sum(c['pts'][i][0] * c['pts'][(i + 1) % 4][1] - c['pts'][(i + 1) % 4][0] * c['pts'][i][1] for i in range(4))
        assert A > 0                                                  # CCW
    T = tokenize(out)
    b5_30 = (0xB5, bytes([0x30 ^ XOR]))
    assert T.count(b5_30) == 12                                       # след всяка 0xDC (вкл. края)
    assert d['layers'] and len(d['layers']) == 1

def test_short_edges_use_relative():
    tri = [(0, 0), (5, 0), (5, 3)]                                    # 5, 3 и 5.83 mm
    d = decode(write_ud6([tri], T4))
    assert d['counts'] == dict(dd=1, dc=0, de=1, df=1, fd=0, fc=1)
    assert d['contours'][0]['pts'] == [(0, -3000), (5000, -3000), (5000, 0), (0, -3000)]

def test_edge_at_threshold():
    d = decode(write_ud6([[(0, 0), (8, 0), (8, 8.001)]], T4))
    assert d['counts']['de'] == 1 and d['counts']['dc'] == 2        # 8.000 -> rel, 8.001 и диагоналът -> abs

def test_t4_selfrebuild_diff_only_segments():
    """Собствената геометрия на T4 -> писач: всичко освен сегментите и rec5 е еднакво."""
    d0 = decode(rd(T4))
    sq = lambda x0: [(x0, 0), (x0 + 40, 0), (x0 + 40, -40), (x0, -40)]
    out = write_ud6([sq(0), sq(150), sq(300)], T4, corner_marks=False)
    A = tokenize(rd(T4)); B = tokenize(out)
    seg = (0xDC, 0xDD, 0xDE, 0xDF, 0xFD)
    A1 = [t for t in A if t[0] not in seg and not (t[0] == 0x94 and t[1][0] ^ XOR == 5)]
    B1 = [t for t in B if t[0] not in seg and not (t[0] == 0x94 and t[1][0] ^ XOR == 5)]
    assert A1 == B1
    d = decode(out)
    assert [c['bbox'] for c in d['contours']] == [c['bbox'] for c in d0['contours']]

# ---------------------------------------------------------------- roundtrip T1
def test_roundtrip_T1():
    orig = decode(rd(T1))
    contours_mm = [[(x / 1000.0, y / 1000.0) for x, y in c['pts'][:-1]] for c in orig['contours']]
    # (последната точка на декодирания контур е стартът след затваряне — махаме я)
    out = write_ud6(contours_mm, T4)
    d = decode(out)
    assert len(d['contours']) == len(orig['contours']) == 2
    # геометрия: точно спрямо подадения вход след нормализация (µm)
    ref = normalize(contours_mm)
    for c, r in zip(d['contours'], ref):
        assert c['pts'][:-1] == r
        assert c['pts'][-1] == r[0]
    # спрямо суровия оригинал: T1 е с ymax = +2 µm (дрейф на 0xDD в самия образец) -> <= 2 µm
    worst = max(abs(a - b) for c, o in zip(d['contours'], orig['contours'])
                for (ax, ay), (bx, by) in zip(c['pts'][:-1], o['pts'][:-1]) for a, b in ((ax, bx), (ay, by)))
    assert worst <= 2
    # header записи
    assert rec1(d, 5) == rec1(orig, 5) + orig['counts']['fd']          # FD не се брои в оригинала
    assert rec2(d, 18)[0] == rec2(orig, 18)[0] and rec2(d, 21) == rec2(orig, 21)
    # 17 и 3/4/24 зависят от Ymin/W/H: оригиналът е (99998, 99997) от float bbox,
    # ние (100000, 100000) от точките (T1 има ymax = +2 µm и xmax = 100000 при bbox-запис 99999)
    assert rec2(d, 17)[0] == 0 and abs(rec2(d, 17)[1] - rec2(orig, 17)[1]) <= 3
    for i in (3, 24):
        a, b = rec2(d, i), rec2(orig, i)
        assert abs(a[0] - b[0]) <= 3 and abs(a[1] - b[1]) <= 3, (i, a, b)
    assert abs(rec2(d, 4)[0] - rec2(orig, 4)[0]) <= 3 and abs(rec2(d, 4)[1] - rec2(orig, 4)[1]) <= 3
    # trailer/AE/AF — от шаблона T4
    assert d['a4'] == decode(rd(T4))['a4']

# ---------------------------------------------------------------- декодерът чете изхода
def test_decoder_cli_reads_output(tmp_path):
    out = tmp_path / 'x.ud6'
    out.write_bytes(write_ud6([[(0, 0), (30, 0), (30, 20)]], T4))
    r = subprocess.run([sys.executable, os.path.join(HERE, 'ud6_decode.py'), str(out)], capture_output=True, text=True)
    assert r.returncode == 0 and '1 contours' in r.stdout

# ---------------------------------------------------------------- DXF четец
def test_dxf_reader_roundtrip_ezdxf(tmp_path):
    ezdxf = pytest.importorskip('ezdxf')
    from dxf_read import read_dxf
    doc = ezdxf.new('R12'); msp = doc.modelspace()
    msp.add_polyline2d([(0, 0), (40, 0), (40, 40), (0, 40)], close=True)      # R12: POLYLINE/VERTEX
    doc2 = ezdxf.new('R2000'); msp2 = doc2.modelspace()
    msp2.add_lwpolyline([(0, 0), (40, 0), (40, 40), (0, 40)], close=True)
    msp.add_circle((100, 20), 10)
    msp.add_line((200, 0), (240, 0)); msp.add_line((240, 0), (240, 40)); msp.add_line((240, 40), (200, 40)); msp.add_line((200, 40), (200, 0))
    p = tmp_path / 'a.dxf'; doc.saveas(p)
    p2 = tmp_path / 'b.dxf'; doc2.saveas(p2)
    assert len(read_dxf(str(p2))) == 1 and len(read_dxf(str(p2))[0]) == 4
    C = read_dxf(str(p))
    assert len(C) == 3 and len(C[0]) == 4 and len(C[2]) == 4
    xs = [x for x, y in C[1]]; assert abs(max(xs) - 110) < 0.01 and abs(min(xs) - 90) < 0.01 and len(C[1]) >= 64
