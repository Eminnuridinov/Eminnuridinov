#!/usr/bin/env python3
"""
ud6_tokdiff.py A.ud6 B.ud6 — показва само различаващите се токени (структурен diff).

Поредици от сегментни токени (0xDC/0xDD/0xDE/0xDF/0xFD) се свиват до един ред със
статистика, за да е четимо. Големите блокове 0xAE/0xAF се сравняват като цяло.
"""
import sys, difflib
from collections import Counter
from ud6_write import tokenize, dec35, XOR

SEG = (0xDC, 0xDD, 0xDE, 0xDF, 0xFD)

def lines(data):
    T = tokenize(data); out = []; i = 0
    while i < len(T):
        op, p = T[i]
        if op in SEG:
            j = i
            while j < len(T) and T[j][0] in SEG: j += 1
            c = Counter(f"{T[k][0]:02x}" for k in range(i, j))
            out.append(f"  <{j - i} segments: {' '.join(f'{k}×{v}' for k, v in sorted(c.items()))}>")
            i = j; continue
        if op in (0xAE, 0xAF):
            out.append(f"{op:02x} <{len(p)} bytes, sum={sum(p)}>")
        elif op == 0xFC:
            out.append(f"fc MOVE ({dec35(p[:5])}, {dec35(p[5:10])})")
        elif op == 0xB0 and len(p) == 11:
            out.append(f"b0 [{p[0] ^ XOR:#x}] {dec35(p[1:6])} {dec35(p[6:11])}")
        elif op == 0x94 and len(p) == 11:
            out.append(f"94 id={p[0] ^ XOR} {dec35(p[1:6])} {dec35(p[6:11])}")
        elif op == 0x94 and len(p) == 15:
            out.append(f"94 id={p[0] ^ XOR} {[b ^ XOR for b in p[1:5]]} {dec35(p[5:10])} {dec35(p[10:15])}")
        elif op in (0x94, 0xB0, 0xA4) and len(p) == 6:
            out.append(f"{op:02x} [{p[0] ^ XOR:#x}] {dec35(p[1:6])}")
        else:
            out.append(f"{op:02x} {[b ^ XOR for b in p]}")
        i += 1
    return out

if __name__ == '__main__':
    A = lines(open(sys.argv[1], 'rb').read()); B = lines(open(sys.argv[2], 'rb').read())
    n = 0
    for l in difflib.unified_diff(A, B, sys.argv[1], sys.argv[2], n=0, lineterm=''):
        print(l); n += 1
    if n == 0: print("токените са идентични")
