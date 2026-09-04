/*
 * ud6_write.js — Trocen .ud6 писач в чист JavaScript (без зависимости), огледало на ud6_write.py.
 *
 *   buildUD6(contours, opts) -> Uint8Array
 *
 * contours: масив от полигони в mm, всеки [[x, y], ...] / [{x, y}, ...] (затворен) или
 *           {pts: [...], closed: false} за отворен път (окръжност със застъпване след старта).
 *           Произволна координатна система (DXF: Y нагоре). Редът = ред на рязане.
 * opts:     cornerMarks (true)   — 0xB5 [0x30] след всяка 0xDC (false = само в края, стил T4)
 *           start ('keep')      — 'keep' = първата точка; 'topleft' = max Y / min X (както TroCutCAD)
 *           rec9 ('center')     — 'center' = (1520000 − W)/2 (хипотеза, вж. Python); 'copy' = от шаблона
 *
 * Шаблонът е samples/template_red.ud6 (червен слой = ножът; синият е за друг модул) с изпразнени
 * 0xAE/0xAF — preview bitmap-ите се рендват от геометрията. Браузър (single-file) и Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UD6 = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const XOR = 0x7C;
  const ABS_THRESHOLD_UM = 8000;   // ръб > 8.000 mm -> 0xDC абсолютно
  const REL14_MAX = 8191;
  const PREVIEW_BG = 127, PREVIEW_INK = 0;

  // samples/template_red.ud6 (T4 с червения слой на ножа) без payload-ите на 0xAE/0xAF (2841 байта)
  const TEMPLATE_B64 = 'pHyofZR5fHx8eliUenx8fHx8fHx8fHyUbHx8fHx8lGp8fHx8fJR1fHxYfUx8fCdjJJR/fHxoHFwDAwE7PZR7fHx8fHx8fHx8fJRtfHx8fHwDAwE7PZRufHxoHFx8fHx8fJR4fH18fXx8aBxcfHx+RDyUZHx8aBxcfHx+RDyUb3x8fHx8fHx8fHyUaHyUZXyUaXx8fHx8fHxoHFyUazZ8fHx8fLd9fLd4fbd+fH23fWy3fW60fnx8enFctH98fHx8fLV9T2W1fjx8sX1PZbF+PHywbnx8fHx8sG98fHx8fLBoAwMBOzx8fHx8fLBpfHx8fHx8fH5EPPx8fHx8fHx8fHx83wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wdU3wAM3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3ngk3n9s33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk33gk339s3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gdU3gAMtUywXrBffHx8fH2waAMDATs8fHx8fHywaXx8dW8MfHx3MEz8fHx1bwx8fHx8fN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8HVN8ADN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN54JN5/bN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN94JN9/bN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4HVN4ADLVMsF6wX3x8fHx+sGgDAwE7PHx8fHx8sGl8fG5bHHx8aBxc/Hx8blscfHx8fHzfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfB1TfAAzeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTeeCTef2zfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTfeCTff2zeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeB1TeAAy1TLBesF98fHx8f5R8pGx8fHNhbaWtY3x8rq+ioXx8faF7fKF9Y3x8oX57FKF/fwiheH9soXl/CKF6f2yhb38IoWh/bKFpfwihan9soQOs';

  // ------------------------------------------------------------ кодиране
  function enc7(vals) { const o = new Uint8Array(vals.length); for (let i = 0; i < vals.length; i++) o[i] = (vals[i] & 0x7F) ^ XOR; return o; }
  function enc35(v) {
    // 35-битово two's complement, big-endian 7-битови групи; BigInt заради 35 бита
    let u = BigInt.asUintN(35, BigInt(v));
    const o = new Uint8Array(5);
    for (let i = 4; i >= 0; i--) { o[4 - i] = Number((u >> BigInt(7 * i)) & 0x7Fn) ^ XOR; }
    return o;
  }
  function enc14(v) {
    if (v < -REL14_MAX || v > REL14_MAX) throw new Error('rel14 overflow: ' + v + ' µm');
    const u = v & 0x3FFF;
    return Uint8Array.of(((u >> 7) & 0x7F) ^ XOR, (u & 0x7F) ^ XOR);
  }
  function dec35(p, o) {
    let v = 0n;
    for (let i = 0; i < 5; i++) v = (v << 7n) | BigInt(p[o + i] ^ XOR);
    return Number(BigInt.asIntN(35, v));
  }
  function um(mm) { return Math.floor(mm * 1000 + 0.5); }
  function cat(parts) {
    let n = 0; for (const p of parts) n += p.length;
    const o = new Uint8Array(n); let k = 0;
    for (const p of parts) { o.set(p, k); k += p.length; }
    return o;
  }
  function tok(op, payload) { const o = new Uint8Array(1 + (payload ? payload.length : 0)); o[0] = op; if (payload) o.set(payload, 1); return o; }

  function tokenize(data) {
    const out = []; let op = -1, start = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] >= 0x80) { if (op >= 0) out.push([op, data.subarray(start, i)]); op = data[i]; start = i + 1; }
    }
    if (op >= 0) out.push([op, data.subarray(start)]);
    return out;
  }
  const rid = p => p.length ? p[0] ^ XOR : -1;

  function b64decode(s) {
    if (typeof atob === 'function') { const b = atob(s); const o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; }
    return new Uint8Array(Buffer.from(s, 'base64'));
  }

  // ------------------------------------------------------------ шаблон
  let TPL = null;
  function template() {
    if (TPL) return TPL;
    const T = tokenize(b64decode(TEMPLATE_B64));
    const iB7 = T.findIndex(t => t[0] === 0xB7);
    const iB1 = T.findIndex((t, i) => i > iB7 && t[0] === 0xB1 && rid(t[1]) === 2);
    const iFC = T.findIndex(t => t[0] === 0xFC);
    const i23 = T.map((t, i) => (t[0] === 0xB0 && rid(t[1]) === 0x23) ? i : -1).filter(i => i >= 0);
    const hdr = {};
    for (const [op, p] of T.slice(0, iB7)) if (op === 0x94 && p.length) hdr[rid(p)] = p;
    const W_t = dec35(hdr[24], 1);
    TPL = {
      header: T.slice(0, iB7),
      layer: T.slice(iB7, iB1 + 1),
      layerPrefix: T.slice(iB1 + 1, iFC).filter(t => !(t[0] === 0xB0 && (rid(t[1]) === 0x14 || rid(t[1]) === 0x15))),
      contourSuffix: T.slice(i23[0] - 1, i23[0]).filter(t => t[0] === 0xB0 && rid(t[1]) === 0x22),
      trailer: T.slice(i23[i23.length - 1] + 1),
      rec4Prefix: hdr[4].subarray(1, hdr[4].length - 10),
      rec18Flag: dec35(hdr[18], 6),          // неизвестен флаг (§7)
      rec9Second: dec35(hdr[9], 6),          // неизвестно (§7)
      fieldW: 2 * dec35(hdr[9], 1) + W_t,    // 1 520 000 — хипотеза за центриране
    };
    return TPL;
  }

  // ------------------------------------------------------------ геометрия
  function area2(P) { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a; }

  function split(c) { return Array.isArray(c) ? { pts: c, closed: true } : { pts: c.pts, closed: c.closed !== false }; }

  /* -> [{pts, closed}]: µm, min X = 0, max Y = 0, CCW; отворен път — без затварящ сегмент, стартът не се мести */
  function normalize(contours, start) {
    if (!contours || !contours.length) throw new Error('няма контури');
    const raw = contours.map(c => { const s = split(c); return { pts: s.pts.map(p => Array.isArray(p) ? [um(p[0]), um(p[1])] : [um(p.x), um(p.y)]), closed: s.closed }; });
    let minx = Infinity, maxy = -Infinity;
    for (const c of raw) for (const [x, y] of c.pts) { if (x < minx) minx = x; if (y > maxy) maxy = y; }
    return raw.map((c, k) => {
      let P = [];
      for (const [x, y] of c.pts) { const q = [x - minx, y - maxy]; if (!P.length || P[P.length - 1][0] !== q[0] || P[P.length - 1][1] !== q[1]) P.push(q); }
      if (c.closed && P.length > 1 && P[0][0] === P[P.length - 1][0] && P[0][1] === P[P.length - 1][1]) P.pop();
      if (P.length < 3) throw new Error('контур #' + (k + 1) + ': по-малко от 3 различни точки');
      if (area2(P) < 0) P = c.closed ? [P[0]].concat(P.slice(1).reverse()) : P.slice().reverse();   // CW -> CCW
      if (start === 'topleft' && c.closed) {
        let s0 = 0;
        for (let i = 1; i < P.length; i++) if (P[i][1] > P[s0][1] || (P[i][1] === P[s0][1] && P[i][0] < P[s0][0])) s0 = i;
        P = P.slice(s0).concat(P.slice(0, s0));
      }
      return { pts: P, closed: c.closed };
    });
  }

  // ------------------------------------------------------------ контур -> байтове
  const B5_30 = tok(0xB5, enc7([0x30]));

  function encodeContour(P, cornerMarks, closed) {
    let ymin = Infinity, ymax = -Infinity, xmin = Infinity, xmax = -Infinity;
    for (const [x, y] of P) { if (x < xmin) xmin = x; if (x > xmax) xmax = x; if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
    const out = [
      tok(0xB0, cat([enc7([0x14]), enc35(ymin), enc35(ymax)])),
      tok(0xB0, cat([enc7([0x15]), enc35(xmin), enc35(xmax)])),
      tok(0xFC, cat([enc35(P[0][0]), enc35(P[0][1])])),
    ];
    const n = P.length, nsegTotal = closed ? n : n - 1; let nseg = 0;
    for (let i = 0; i < nsegTotal; i++) {
      const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % n];
      const dx = x1 - x0, dy = y1 - y0;
      if (Math.hypot(dx, dy) > ABS_THRESHOLD_UM) {
        out.push(tok(0xDC, cat([enc35(x1), enc35(y1)])));
        if (cornerMarks && i !== nsegTotal - 1) out.push(B5_30);
      } else if (dy === 0) out.push(tok(0xDE, enc14(dx)));
      else if (dx === 0) out.push(tok(0xDF, enc14(dy)));
      else out.push(tok(0xDD, cat([enc14(dx), enc14(dy)])));
      nseg++;
    }
    out.push(B5_30);
    return { bytes: cat(out), nseg };
  }

  // ------------------------------------------------------------ preview bitmap (0xAE 208², 0xAF 136²)
  function renderPreview(polys, N) {
    const items = polys.map(split);
    let W = 0, H = 0;
    for (const c of items) for (const [x, y] of c.pts) { if (x > W) W = x; if (-y > H) H = -y; }
    const L = Math.max(W, H, 1), s = N / L;
    const rnd = v => Math.floor(v + 0.5);
    const offx = W < L ? rnd((N - W * s) / 2) : 0, offy = H < L ? rnd((N - H * s) / 2) : 0;
    const bm = new Uint8Array(N * N).fill(PREVIEW_BG);
    const clamp = v => Math.max(0, Math.min(N - 1, v));
    const plot = (x, y) => { bm[clamp(y) * N + clamp(x)] = PREVIEW_INK; };
    function line(x0, y0, x1, y1) {
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        plot(x0, y0);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    }
    for (const c of items) {
      const P = c.pts.map(([x, y]) => [offx + rnd((W - x) * s), offy + rnd(-y * s)]);   // X огледално
      for (let i = 0; i < (c.closed ? P.length : P.length - 1); i++) { const a = P[i], b = P[(i + 1) % P.length]; line(a[0], a[1], b[0], b[1]); }
    }
    return bm;
  }

  // ------------------------------------------------------------ header
  function headerRecords(tpl, W, H, xmax, ymin, nseg, rec9) {
    const R = {
      3: cat([enc35(W), enc35(-(H - 1))]),
      4: cat([tpl.rec4Prefix, enc35(W), enc35(H)]),
      5: enc35(nseg),
      17: cat([enc35(0), enc35(ymin + 1)]),
      18: cat([enc35(xmax), enc35(tpl.rec18Flag)]),
      21: cat([enc35(0), enc35(xmax)]),
      24: cat([enc35(W), enc35(H)]),
    };
    if (rec9 === 'center') R[9] = cat([enc35(Math.floor((tpl.fieldW - W) / 2)), enc35(tpl.rec9Second)]);
    return R;
  }

  // ------------------------------------------------------------ писач
  function buildUD6(contours, opts) {
    opts = opts || {};
    const cornerMarks = opts.cornerMarks !== false;
    const tpl = template();
    const polys = normalize(contours, opts.start || 'keep');

    const parts = [];
    for (const [op, p] of tpl.layerPrefix) parts.push(tok(op, p));
    let nsegTotal = 0;
    polys.forEach((c, k) => {
      const e = encodeContour(c.pts, cornerMarks, c.closed);
      parts.push(e.bytes);
      for (const [op, p] of tpl.contourSuffix) parts.push(tok(op, p));
      parts.push(tok(0xB0, cat([enc7([0x23]), enc35(k + 1)])));
      nsegTotal += e.nseg;
    });

    let xmax = -Infinity, ymin = Infinity, xmin = Infinity, ymax = -Infinity;
    for (const c of polys) for (const [x, y] of c.pts) { if (x > xmax) xmax = x; if (x < xmin) xmin = x; if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
    const W = xmax - xmin, H = ymax - ymin;
    const recs = headerRecords(tpl, W, H, xmax, ymin, nsegTotal, opts.rec9 || 'center');

    const head = [];
    for (const [op, p] of tpl.header) {
      const r = op === 0x94 ? rid(p) : -1;
      head.push(r in recs ? tok(0x94, cat([enc7([r]), recs[r]])) : tok(op, p));
    }
    const layer = tpl.layer.map(([op, p]) => tok(op, p));
    const trailer = tpl.trailer.map(([op, p]) => {
      if (op === 0xAE) return tok(op, enc7(renderPreview(polys, 208)));
      if (op === 0xAF) return tok(op, enc7(renderPreview(polys, 136)));
      return tok(op, p);       // 0xA4 [0x10], 0xAD, 0xA1… — НЕИЗВЕСТНИ, копие от шаблона (§7)
    });
    return cat(head.concat(layer, parts, trailer));
  }

  return { buildUD6, normalize, renderPreview, tokenize, enc35, enc14, dec35, XOR };
}));
