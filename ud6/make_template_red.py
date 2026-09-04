#!/usr/bin/env python3
"""
make_template_red.py — сглобява samples/template_red.ud6: T4_order_ABC (header, геометрия, trailer)
с ЧЕРВЕНИЯ слой от T1_ring_circles (0xB7 [4,1] / [2,0,1], 0xB4 [2, 100000]).

Синият слой (цвят 2, единственият в T4) е за друг модул на машината; ножът работи на червения
(потвърдено на контролера, Sep 2026). Слоят влече три места във файла:
  - layer block (0xB7 ×5, 0xB4 ×2, 0xB5 ×2, 0xB1 ×2)
  - 0xAD [R,G,B] в trailer-а — цветът на слоя: червен [31,0,0], син [0,0,31]
  - 0xA1 групата в trailer-а ([0,0,M] … [127]) — M=1 червен, M=3 син
Червеният блок и групата са байт-идентични в T1, T2 и T3.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ud6_write import tokenize, untokenize, rec_id, enc7, XOR

HERE = os.path.dirname(os.path.abspath(__file__)); S = os.path.join(HERE, 'samples')
T4 = tokenize(open(os.path.join(S, 'T4_order_ABC.UD6'), 'rb').read())
T1 = tokenize(open(os.path.join(S, 'T1_ring_circles.UD6'), 'rb').read())

def layer_blocks(T):
    out = []; cur = None
    for op, p in T:
        if cur is None and op == 0xB7 and rec_id(p) == 1 and (p[1] ^ XOR) == 0: cur = []
        if cur is not None:
            cur.append((op, p))
            if op == 0xB1 and rec_id(p) == 2: out.append(cur); cur = None
    return out
def a1_groups(T):
    out = []; cur = None
    for op, p in T:
        if op == 0xA1:
            if rec_id(p) == 0: cur = []; out.append(cur)
            cur.append((op, p))
    return out
color_of = lambda blk: blk[1][1][1] ^ XOR          # 0xB7 [4, L]

red_layer = [b for b in layer_blocks(T1) if color_of(b) == 1][0]
red_a1 = [g for g in a1_groups(T1) if (g[0][1][2] ^ XOR) == 1][0]
[blue_layer] = layer_blocks(T4)
assert color_of(blue_layer) == 2 and len(red_layer) == len(blue_layer) == 11 and len(red_a1) == 13

i0 = T4.index(blue_layer[0]); i1 = i0 + len(blue_layer)
out = T4[:i0] + red_layer + T4[i1:]
out = [(op, enc7([31, 0, 0]) if op == 0xAD else p) for op, p in out]
a1_start = next(i for i, (op, p) in enumerate(out) if op == 0xA1)
a1_end = max(i for i, (op, p) in enumerate(out) if op == 0xA1) + 1
assert a1_end - a1_start == 13
out = out[:a1_start] + red_a1 + out[a1_end:]

data = untokenize(out)
open(os.path.join(S, 'template_red.ud6'), 'wb').write(data)
print('samples/template_red.ud6:', len(data), 'байта')
