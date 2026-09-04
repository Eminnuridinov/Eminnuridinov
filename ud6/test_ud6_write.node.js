// Огледални тестове за ud6_write.js:  node --test test_ud6_write.node.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const U = require('./ud6_write.js');

const F = path.join(__dirname, 'fixtures');
const cases = JSON.parse(fs.readFileSync(path.join(F, 'cases.json')));
const T1 = JSON.parse(fs.readFileSync(path.join(F, 'T1_points.json')));
const T4 = new Uint8Array(fs.readFileSync(path.join(__dirname, 'samples', 'T4_order_ABC.UD6')));

// мини-декодер (същата логика като ud6_decode.py) — контури в µm + header записи
function decode(data) {
  const T = U.tokenize(data);
  const s14 = (p, o) => { let v = ((p[o] ^ U.XOR) << 7) | (p[o + 1] ^ U.XOR); return v >= 8192 ? v - 16384 : v; };
  const contours = []; let cur = null, x = 0, y = 0, bbox = {}, layers = 0;
  const counts = { dd: 0, dc: 0, de: 0, df: 0, fd: 0, fc: 0 }, header = {};
  for (const [op, p] of T) {
    if (op === 0xFC) { x = U.dec35(p, 0); y = U.dec35(p, 5); counts.fc++; cur = { pts: [[x, y]], bbox, idx: null }; bbox = {}; contours.push(cur); }
    else if (op === 0xDC) { x = U.dec35(p, 0); y = U.dec35(p, 5); counts.dc++; cur.pts.push([x, y]); }
    else if (op === 0xDD) { x += s14(p, 0); y += s14(p, 2); counts.dd++; cur.pts.push([x, y]); }
    else if (op === 0xDE) { x += s14(p, 0); counts.de++; cur.pts.push([x, y]); }
    else if (op === 0xDF) { y += s14(p, 0); counts.df++; cur.pts.push([x, y]); }
    else if (op === 0xB0 && p.length === 11) { const r = p[0] ^ U.XOR; if (r === 0x14) { bbox.ymin = U.dec35(p, 1); bbox.ymax = U.dec35(p, 6); } if (r === 0x15) { bbox.xmin = U.dec35(p, 1); bbox.xmax = U.dec35(p, 6); } }
    else if (op === 0xB0 && p.length === 6 && (p[0] ^ U.XOR) === 0x23) cur.idx = U.dec35(p, 1);
    else if (op === 0xB7 && (p[0] ^ U.XOR) === 4) layers++;
    else if (op === 0x94 && p.length) header[p[0] ^ U.XOR] = p;
  }
  return { tokens: T, contours, counts, header, layers };
}
const rec2 = (d, i) => [U.dec35(d.header[i], d.header[i].length - 10), U.dec35(d.header[i], d.header[i].length - 5)];
const rec1 = (d, i) => U.dec35(d.header[i], 1);
const area2 = P => P.reduce((a, p, i) => { const q = P[(i + 1) % P.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);

// ------------------------------------------------------------ байтова идентичност с Python
for (const [name, c] of Object.entries(cases)) {
  test(`byte-identical with ud6_write.py: ${name}`, () => {
    const exp = new Uint8Array(fs.readFileSync(path.join(F, 'expected', name + '.ud6')));
    const got = U.buildUD6(c.contours, c.opts);
    assert.equal(got.length, exp.length);
    assert.deepEqual(Buffer.from(got), Buffer.from(exp));
  });
}

// ------------------------------------------------------------ кодиране
test('enc14/enc35 roundtrip', () => {
  for (const v of [0, 1, -1, 8191, -8191]) { const p = U.enc14(v); const u = ((p[0] ^ U.XOR) << 7) | (p[1] ^ U.XOR); assert.equal(u >= 8192 ? u - 16384 : u, v); }
  for (const v of [0, 1, -1, 340000, -39999, 2 ** 34 - 1, -(2 ** 34)]) assert.equal(U.dec35(U.enc35(v), 0), v);
  assert.throws(() => U.enc14(8192));
});

test('tokenize is lossless on T4', () => {
  const T = U.tokenize(T4); let n = 0; for (const [op, p] of T) n += 1 + p.length;
  assert.equal(n, T4.length); assert.equal(T[0][0], 0xA4); assert.equal(T[T.length - 1][0], 0xAC);
});

// ------------------------------------------------------------ структура на изхода
test('ABC: order A→B→C, CCW, header records, corner marks, single layer', () => {
  const sq = x => [[x, 0], [x + 40, 0], [x + 40, 40], [x, 40]];
  const d = decode(U.buildUD6([sq(0), sq(300), sq(150)], { start: 'topleft' }));
  assert.deepEqual(d.contours.map(c => c.idx), [1, 2, 3]);
  assert.deepEqual(d.contours.map(c => c.bbox.xmin), [0, 300000, 150000]);
  assert.deepEqual(d.contours.map(c => c.pts[0]), [[0, 0], [300000, 0], [150000, 0]]);
  for (const c of d.contours) { assert.ok(area2(c.pts.slice(0, 4)) > 0); assert.deepEqual(c.pts[4], c.pts[0]); }
  assert.equal(d.counts.dc, 12); assert.equal(rec1(d, 5), 12);
  assert.deepEqual(rec2(d, 3), [340000, -39999]); assert.deepEqual(rec2(d, 24), [340000, 40000]);
  assert.deepEqual(rec2(d, 17), [0, -39999]); assert.deepEqual(rec2(d, 18), [340000, 0]); assert.deepEqual(rec2(d, 21), [0, 340000]);
  assert.deepEqual(rec2(d, 9), [590000, 1495000]);
  assert.equal(d.tokens.filter(([op, p]) => op === 0xB5 && p.length === 1 && (p[0] ^ U.XOR) === 0x30).length, 12);
  assert.equal(d.layers, 1);
});

test('short edges -> relative opcodes', () => {
  const d = decode(U.buildUD6([[[0, 0], [5, 0], [5, 3]]]));
  assert.deepEqual(d.counts, { dd: 1, dc: 0, de: 1, df: 1, fd: 0, fc: 1 });
  assert.deepEqual(d.contours[0].pts, [[0, -3000], [5000, -3000], [5000, 0], [0, -3000]]);
});

test('roundtrip T1: geometry exact vs normalized input, ≤2 µm vs raw sample', () => {
  const out = U.buildUD6(T1);
  const d = decode(out);
  const ref = U.normalize(T1, 'keep');
  assert.equal(d.contours.length, 2);
  d.contours.forEach((c, i) => { assert.deepEqual(c.pts.slice(0, -1), ref[i].pts); assert.deepEqual(c.pts[c.pts.length - 1], ref[i].pts[0]); });
  let worst = 0;
  d.contours.forEach((c, i) => c.pts.slice(0, -1).forEach((p, j) => { worst = Math.max(worst, Math.abs(p[0] - Math.floor(T1[i][j][0] * 1000 + 0.5)), Math.abs(p[1] - Math.floor(T1[i][j][1] * 1000 + 0.5))); }));
  assert.ok(worst <= 2, 'worst=' + worst);
  assert.equal(rec1(d, 5), 844);                            // = rec5 на оригинала (T1 няма 0xFD)
  assert.deepEqual(rec2(d, 21), [0, 100000]); assert.equal(rec2(d, 18)[0], 100000);
});

test('preview 0xAE/0xAF byte-identical to T4 for its own geometry', () => {
  const sq = x => [[x, 0], [x, -40], [x + 40, -40], [x + 40, 0]];
  const polys = U.normalize([sq(0), sq(150), sq(300)], 'keep');
  const ref = op => U.tokenize(T4).find(t => t[0] === op)[1].map(b => b ^ U.XOR);
  assert.deepEqual(Array.from(U.renderPreview(polys, 208)), Array.from(ref(0xAE)));
  assert.deepEqual(Array.from(U.renderPreview(polys, 136)), Array.from(ref(0xAF)));
});

test('open path (overlap): no closing segment, rec5 = n-1', () => {
  const n = 72, r = 20;
  const circ = Array.from({ length: n }, (_, i) => [r * Math.cos(Math.PI / 2 + 2 * Math.PI * i / n), r * Math.sin(Math.PI / 2 + 2 * Math.PI * i / n)]);
  const over = circ.concat(circ.slice(0, 6));
  const d = decode(U.buildUD6([{ pts: over, closed: false }]));
  const c = d.contours[0];
  assert.equal(c.pts.length, over.length); assert.equal(rec1(d, 5), over.length - 1);
  assert.deepEqual(c.pts[0], c.pts[n]); assert.notDeepEqual(c.pts[c.pts.length - 1], c.pts[0]);
  const d2 = decode(U.buildUD6([circ]));
  assert.equal(rec1(d2, 5), n);
});

test('accepts {x,y} points and rejects degenerate contours', () => {
  const a = U.buildUD6([[{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }]]);
  const b = U.buildUD6([[[0, 0], [40, 0], [40, 40]]]);
  assert.deepEqual(Buffer.from(a), Buffer.from(b));
  assert.throws(() => U.buildUD6([[[0, 0], [1, 1], [0, 0]]]));
  assert.throws(() => U.buildUD6([]));
});
