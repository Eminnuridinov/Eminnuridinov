#!/usr/bin/env python3
"""
make_fixtures.py — еталони за огледалните Node тестове (fixtures/).
  T1_points.json     — декодираните контури на samples/T1_ring_circles.UD6 (mm)
  cases.json         — входове за всеки случай; expected/<case>.ud6 — изходът на ud6_write.py
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ud6_write import write_ud6, DEFAULT_TEMPLATE
from ud6_decode import decode
from dxf_read import read_dxf

HERE = os.path.dirname(os.path.abspath(__file__)); F = os.path.join(HERE, 'fixtures'); T4 = DEFAULT_TEMPLATE
os.makedirs(os.path.join(F, 'expected'), exist_ok=True)

d = decode(open(os.path.join(HERE, 'samples', 'T1_ring_circles.UD6'), 'rb').read())
t1 = [[[x / 1000.0, y / 1000.0] for x, y in c['pts'][:-1]] for c in d['contours']]
json.dump(t1, open(os.path.join(F, 'T1_points.json'), 'w'))

sq = lambda x0: [[x0, 0], [x0 + 40, 0], [x0 + 40, 40], [x0, 40]]
cases = {
    'abc_marks':    dict(contours=[sq(0), sq(300), sq(150)], opts=dict(start='topleft')),
    'abc_nomarks':  dict(contours=[sq(0), sq(300), sq(150)], opts=dict(start='topleft', cornerMarks=False)),
    'abc_keep':     dict(contours=[sq(0), sq(300), sq(150)], opts={}),
    'abc_dxf':      dict(contours=read_dxf(os.path.join(HERE, 'tests', 'T4_order_ABC.dxf')), opts=dict(start='topleft')),
    't1_roundtrip': dict(contours=t1, opts={}),
    'tri_short':    dict(contours=[[[0, 0], [5, 0], [5, 3]]], opts={}),
    'threshold':    dict(contours=[[[0, 0], [8, 0], [8, 8.001]]], opts={}),
    'tall_offset':  dict(contours=[[[10, 10], [10, 110], [30, 110], [30, 10]]], opts={}),
    'cw_input':     dict(contours=[[[0, 0], [0, 40], [40, 40], [40, 0]]], opts={}),
    'rec9_copy':    dict(contours=[[[0, 0], [100, 0], [100, 30]]], opts=dict(rec9='copy')),
}
py_opts = lambda o: dict(corner_marks=o.get('cornerMarks', True), start=o.get('start', 'keep'), rec9_mode=o.get('rec9', 'center'))
for name, c in cases.items():
    out = write_ud6(c['contours'], T4, **py_opts(c['opts']))
    open(os.path.join(F, 'expected', name + '.ud6'), 'wb').write(out)
    print(f'{name}: {len(out)} байта')
json.dump(cases, open(os.path.join(F, 'cases.json'), 'w'))
