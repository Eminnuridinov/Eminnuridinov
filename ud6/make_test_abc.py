#!/usr/bin/env python3
"""
make_test_abc.py — генерира test_ABC.ud6: три квадрата 40×40 в ред A(x=0) → B(x=300) → C(x=150).

Ако има tests/T4_order_ABC.dxf — квадратите се четат от него и се подреждат по X
(A, B, C = 0, 300, 150); иначе — от координатите на образеца T4 (същата геометрия).
Стартова точка горе-вляво (start='topleft') — както TroCutCAD в T4.
Пише и test_ABC_nomarks.ud6 (без 0xB5 [0x30] по ъглите — стилът на T4) за избор на машината.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ud6_write import write_ud6

HERE = os.path.dirname(os.path.abspath(__file__))
dxf = os.path.join(HERE, 'tests', 'T4_order_ABC.dxf')
if os.path.exists(dxf):
    from dxf_read import read_dxf
    C = read_dxf(dxf)
    byx = {round(min(p[0] for p in c)): c for c in C}
    src = f'tests/T4_order_ABC.dxf ({len(C)} контура, X-min {sorted(byx)})'
else:
    sq = lambda x0: [(x0, 40), (x0, 0), (x0 + 40, 0), (x0 + 40, 40)]    # старт горе-вляво, надолу — както в T4
    byx = {0: sq(0), 150: sq(150), 300: sq(300)}
    src = 'координати на образеца T4 (DXF липсва)'
order = [byx[0], byx[300], byx[150]]                        # A → B → C, без сортиране
for name, marks in (('test_ABC.ud6', True), ('test_ABC_nomarks.ud6', False)):
    data = write_ud6(order, os.path.join(HERE, 'samples', 'T4_order_ABC.UD6'), corner_marks=marks, start='topleft')
    with open(os.path.join(HERE, name), 'wb') as f: f.write(data)
    print(f'{name}: {len(data)} байта  <- {src}')
