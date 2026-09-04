// Тест на EMIN_Nesting_Lab_v2.1.html през DOM mock:  node --test test_nesting_lab.node.js
// 1) целият скрипт минава init без runtime грешки; 2) computeNesting -> buildUD6Sheet -> ud6_decode.py;
// 3) ZIP с binary .ud6 през python zipfile; 4) вграденият модул == ud6_write.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const J = v => JSON.parse(JSON.stringify(v));   // масивите от vm контекста са друг realm
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');

const HTML_PATH = path.join(__dirname, 'EMIN_Nesting_Lab_v2.1.html');
const html = fs.readFileSync(HTML_PATH, 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'nest-'));

// ---------------------------------------------------------------- DOM mock
function makeEl(id) {
  const el = {
    id, style: {}, dataset: {}, value: '', textContent: '', innerHTML: '', disabled: false, checked: false,
    children: [], _listeners: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
    appendChild(c) { this.children.push(c); return c; },
    removeChild() {}, querySelectorAll() { return []; }, querySelector() { return makeEl(''); },
    select() {}, click() {}, setAttribute() {}, get outerHTML() { return ''; }, set outerHTML(v) {},
  };
  return el;
}
function makeWindow() {
  const els = {};
  const document = {
    readyState: 'complete', body: makeEl('body'),
    getElementById(id) { return els[id] || (els[id] = makeEl(id)); },
    querySelector(sel) { return makeEl(sel); }, querySelectorAll() { return []; },
    createElement(tag) { return makeEl(tag); }, addEventListener() {}, execCommand() { return true; },
  };
  const store = {};
  const w = {
    document, console, setTimeout, clearTimeout, Math, Date, JSON, Number, String, Array, Object, Uint8Array, Blob: function () {},
    BigInt, Infinity, NaN, isNaN, parseFloat, parseInt, Error, Proxy, Reflect, Buffer,
    URL: { createObjectURL() { return 'blob:x'; }, revokeObjectURL() {} },
    localStorage: {
      getItem(k) { return k in store ? store[k] : null; },
      setItem(k, v) { store[k] = String(v); },
      removeItem(k) { delete store[k]; },
      key(i) { return Object.keys(store)[i]; },
      get length() { return Object.keys(store).length; },
    },
    navigator: {}, confirm() { return true; }, FileReader: function () {},
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    _els: els,
  };
  w.window = w; w.self = w; w.globalThis = w;
  return w;
}
function boot() {
  const w = makeWindow();
  for (const [id, v] of Object.entries({ sw: '1500', sh: '1500', mg: '5', gp: '2', kf: '1', ki: '1', ov: '3', sp: '20', rs: '0', thA: '1400', thB: '1500', thS: '10', mW: '1500', mH: '1500',
       oNum: 'R0006489', oQty: '270', oCli: 'ОЙ Бринолф Гронмарк', oMat: 'модиф. ПТФЕ с барий', oThk: '1.5' }))
    w.document.getElementById(id).value = v;
  vm.createContext(w);
  vm.runInContext(script, w, { filename: 'nesting_lab.js' });
  return w;
}

// ---------------------------------------------------------------- тестове
function boot2() { const w = boot(); w.state.remaining = w.state.remaining || {}; return w; }
test('целият скрипт минава init без грешки; версия 1.1', () => {
  const w = boot();
  assert.equal(typeof w.computeNesting, 'function');
  assert.equal(typeof w.buildUD6Sheet, 'function');
  assert.equal(typeof w.UD6.buildUD6, 'function');
  assert.match(html, /<span class="badge mono" id="ver">v2\.1<\/span>/);
  assert.match(html, /<title>EMIN Nesting Lab v2\.1/);
  assert.ok(w._els.ud61 && w._els.ud6All && w._els.ud6Hint, 'нови елементи');
  assert.ok(w._els.oNum && w._els.oQty && w._els.addPart && w._els.ptab, 'карта Поръчка + позиции');
  assert.equal(w._els.hdrOrder.textContent, 'поръчка R0006489');
  assert.ok(w._els.ud61._listeners.click && w._els.ud6All._listeners.click, 'click handlers');
  assert.equal(w._els.ud61.disabled, true);
});

test('вграденият UD6 модул е идентичен с ud6_write.js', () => {
  const js = fs.readFileSync(path.join(__dirname, 'ud6_write.js'), 'utf8');
  const body = js.slice(js.indexOf('(function (root, factory)')).trimEnd();
  const a = script.indexOf('/* ================= UD6 писач'), b = script.indexOf('/* ================= /ud6_write.js');
  const embedded = script.slice(script.indexOf('\n', a) + 1, b).trimEnd();
  assert.equal(embedded, body);
});

test('circlePoly: CCW, старт отгоре, хорда <= 0.5 mm, >= 64 сегмента', () => {
  const w = boot();
  const P = w.circlePoly(100, 200, 152, 0.5);
  assert.ok(P.length >= Math.ceil(2 * Math.PI * 152 / 0.5));
  assert.deepEqual(J(P[0].map(v => +v.toFixed(6))), [100, 352]);
  let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; }
  assert.ok(a > 0);
  assert.equal(w.circlePoly(0, 0, 1).length, 64);
  // застъпване: отворен път, минава през старта и продължава >= overlap
  const O = w.circlePoly(100, 200, 50, 0.5, 3);
  assert.equal(O.closed, false);
  const n = w.circlePoly(100, 200, 50, 0.5).length, step = 2 * Math.PI * 50 / n;
  assert.equal(O.pts.length, n + Math.ceil(3 / step));
  assert.deepEqual(J(O.pts[n].map(v => +v.toFixed(6))), J(O.pts[0].map(v => +v.toFixed(6))));
  assert.deepEqual(J(w.circlePoly(100, 200, 50, 0.5, 0)).length, n);
});

test('sheetContours: ред = дърво по дърво, вложеният преди хоста, ID преди OD', () => {
  const w = boot();
  const rings = [
    { type: 'A', od: 305, odn: 304, idd: 289, x: 200, y: 200, depth: 0, treeId: 7 },
    { type: 'B', od: 193, odn: 192, idd: 181, x: 200, y: 200, depth: 1, treeId: 7 },
    { type: 'C', od: 47, odn: 46, idd: 34, x: 200, y: 200, depth: 2, treeId: 7 },
    { type: 'D', od: 55, odn: 54, idd: 37, x: 600, y: 600, depth: 0, treeId: 9 },
  ];
  const C = w.sheetContours(rings, 1);
  assert.deepEqual(J(C.map(c => c.type + ':' + c.layer)), ['C:CUT_ID', 'C:CUT_OD', 'B:CUT_ID', 'B:CUT_OD', 'A:CUT_ID', 'A:CUT_OD', 'D:CUT_ID', 'D:CUT_OD']);
  assert.deepEqual(J(C.map(c => c.d)), [35, 47, 182, 193, 290, 305, 38, 55]);          // ID + kerfId
  assert.deepEqual(J(w.sheetContours(rings).map(c => c.d)), [34, 47, 181, 193, 289, 305, 37, 55]);
  const P = w.ptsOf(w.sheetContours(rings, 1)[0].pts); const xs = P.map(p => p[0]);
  assert.equal(w.sheetContours(rings, 1, 3)[0].pts.closed, false);
  assert.ok(Math.abs((Math.max(...xs) - Math.min(...xs)) - 35) < 0.01);
});

test('пълен лист: computeNesting -> buildUD6Sheet -> ud6_decode.py', () => {
  const w = boot();
  const list = w.PARTS.map(p => ({ id: p.id, od: p.od, idd: p.idd, qty: p.qty }));
  const cfg = { W: 1500, H: 1500, margin: 5, gap: 2, kerf: 1, kerfId: 1, overlap: 3, nest: 1, zones: [], maxSheets: 1 };
  const res = w.computeNesting(list, cfg);
  const sh = res.sheets[0];
  assert.ok(sh.length > 10, 'лист с ' + sh.length + ' пръстена');
  const C = w.sheetContours(sh, cfg.kerfId, cfg.overlap);
  const data = w.buildUD6Sheet(sh, cfg.kerfId, cfg.overlap);
  const f = path.join(TMP, 'sheet1.ud6'); fs.writeFileSync(f, data);
  const out = cp.execFileSync('python3', [path.join(__dirname, 'ud6_decode.py'), f], { encoding: 'utf8' });
  assert.match(out, new RegExp(`: ${2 * sh.length} contours, 1 layer block`));
  assert.match(out, /dc=0 .* fd=0/);                                     // без 0xDC/0xFD (хорди <= 0.5 mm)
  const lines = out.split('\n').filter(l => /^\s+#\d+ idx=/.test(l));
  assert.equal(lines.length, 2 * sh.length);
  lines.forEach((l, i) => { assert.match(l, new RegExp(`#${i + 1} idx=${i + 1} `)); assert.match(l, /CCW/); });
  // диаметрите по bbox-а на всеки контур съвпадат с реда ID/OD (полигонът е вписан: до ~4 µm по-тесен)
  const widths = lines.map(l => { const m = l.match(/X ([\d.-]+)\.\.([\d.-]+)/); return +m[2] - +m[1]; });
  widths.forEach((wd, i) => assert.ok(Math.abs(wd - C[i].d) < 0.01, `контур ${i + 1}: ${wd} vs ${C[i].d}`));
  // rec5 = брой сегменти: отворени пътища -> точки − 1 (застъпване), без затварящ сегмент
  const nseg = C.reduce((s, c) => s + w.ptsOf(c.pts).length - 1, 0);
  assert.ok(C.every(c => c.pts.closed === false));
  assert.match(out, new RegExp(`rec5 \\(segment count\\) = ${nseg} `));
  // origin hint
  const o = w.ud6Origin(sh, cfg);
  assert.ok(o.dx >= 5 - 1e-9 && o.dy >= 5 - 1e-9, 'origin вътре в ръба: ' + JSON.stringify(o));
  const m = out.match(/rec24 \(W, H\)\s+= ([\d.]+), ([\d.]+)/);
  assert.ok(+m[1] <= 1490 + 0.01 && +m[2] <= 1490 + 0.01);
});

test('ZIP с binary .ud6 през python zipfile', () => {
  const w = boot();
  const sh = [{ type: '46/34', od: 47, odn: 46, idd: 34, x: 100, y: 100, depth: 0, treeId: 1 }];
  const files = [{ name: 'a_list1.ud6', data: w.buildUD6Sheet(sh, 1, 3) }, { name: 'a.csv', data: 'x;y\r\n1;2\r\n' }];
  const z = path.join(TMP, 'x.zip'); fs.writeFileSync(z, w.makeZip(files));
  const py = `import zipfile,sys
z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None, z.testzip()
names=z.namelist(); print(names)
d=z.read('a_list1.ud6'); print(len(d), d[0], d[-1])`;
  const out = cp.execFileSync('python3', ['-c', py, z], { encoding: 'utf8' });
  assert.match(out, /\['a_list1.ud6', 'a.csv'\]/);
  assert.match(out, new RegExp(`^${files[0].data.length} 164 172$`, 'm'));   // 0xA4 ... 0xAC
});

test('UI поток: run() -> бутоните UD6 се активират, hint се попълва', async () => {
  const w = boot();
  w.state.mode = 'all';
  w.run();
  await new Promise(r => setTimeout(r, 200));
  assert.ok(w.state.res && w.state.res.sheets.length > 0);
  assert.equal(w._els.ud61.disabled, false);
  assert.equal(w._els.ud6All.disabled, false);
  assert.match(w._els.ud6Hint.textContent, /^\.ud6 origin = .* mm надясно, .* mm надолу · \d+ контура$/);
  // click -> download без грешка (Blob/URL са mock-нати)
  w._els.ud61._listeners.click[0]();
  w._els.ud6All._listeners.click[0]();
});


// ---------------------------------------------------------------- поръчка и позиции (v1.5)
test('addPart: нова позиция с уникално означение и свободен цвят', () => {
  const w = boot();
  const n = w.PARTS.length, cols = new Set(w.PARTS.map(p => p.col));
  w.addPart();
  assert.equal(w.PARTS.length, n + 1);
  const p = w.PARTS[n];
  assert.equal(p.pos, n + 1);
  assert.equal(p.id, w.partId(p.od, p.idd));
  assert.equal(new Set(w.PARTS.map(x => x.id)).size, n + 1, 'означенията са уникални');
  assert.ok(!cols.has(p.col), 'цветът е свободен');
  assert.equal(w.state.remaining[p.id], 0);
  w.addPart();
  assert.notEqual(w.PARTS[n].id, w.PARTS[n + 1].id);
});

test('смяна на размер: журналът и остатъците следват новото означение', () => {
  const w = boot();
  const p = w.PARTS[0], old = p.id;
  w.state.remaining[old] = 7;
  w.state.journal.push({ n: 1, date: '2026-09-04', W: 1500, H: 1500, counts: { [old]: 5 }, total: 5 });
  p.od = 200; p.id = w.partId(p.od, p.idd); w.rekey(old, p.id);
  assert.equal(w.state.remaining[p.id], 7);
  assert.ok(!(old in w.state.remaining));
  assert.equal(w.state.journal[0].counts[p.id], 5);
  assert.ok(!(old in w.state.journal[0].counts));
});

test('validate: дублирани размери = грешка; разлика с шапката = предупреждение', () => {
  const w = boot();
  w.PARTS[1].od = w.PARTS[0].od; w.PARTS[1].idd = w.PARTS[0].idd; w.PARTS[1].id = w.PARTS[0].id;
  assert.equal(w.validate(), false);
  assert.match(w._els.warn.innerHTML, /еднакви размери/);
  const w2 = boot();
  w2._els.oQty.value = '999'; w2.readMeta();
  assert.equal(w2.validate(), true);
  assert.match(w2._els.warn.innerHTML, /Сборът по редове е 270 бр, а по шапка 999 бр/);
});

test('празна поръчка се отказва', () => {
  const w = boot();
  w.PARTS.length = 0;
  assert.equal(w.validate(), false);
  assert.match(w._els.warn.innerHTML, /Няма нито една позиция/);
  assert.equal(w._els.run.disabled, true);
});

test('смяна на номера: отделен журнал за всяка поръчка, нищо не се трие', () => {
  const w = boot();
  w.state.journal.push({ n: 1, date: '2026-09-04', W: 1500, H: 1500, counts: { [w.PARTS[0].id]: 3 }, total: 3 });
  w.saveLS();
  w._els.oNum.value = 'M0001317'; w.switchOrder();
  assert.equal(w.state.journal.length, 0, 'нова поръчка = празен журнал');
  assert.equal(w._els.hdrOrder.textContent, 'поръчка M0001317');
  w.addPart(); w.saveLS();
  const nNew = w.PARTS.length;
  w._els.oNum.value = 'R0006489'; w.switchOrder();
  assert.equal(w.state.journal.length, 1, 'старият журнал се връща');
  w._els.oNum.value = 'M0001317'; w.switchOrder();
  assert.equal(w.PARTS.length, nNew, 'позициите на другата поръчка също се пазят');
  assert.equal(w.state.journal.length, 0);
});

test('JSON: реквизити + позиции се възстановяват', () => {
  const w = boot();
  w.addPart(); w.PARTS[0].qty = 11;
  w.state.journal.push({ n: 1, date: '2026-09-04', W: 1490, H: 1500, counts: { [w.PARTS[0].id]: 4 }, total: 4 });
  const dump = { order: 'X1', meta: w.metaObj(), parts: w.PARTS.map(p => ({ id: p.id, od: p.od, idd: p.idd, qty: p.qty, col: p.col })),
                 journal: w.state.journal, remaining: w.state.remaining };
  dump.meta.order = 'X1'; dump.meta.client = 'Друг клиент'; dump.meta.material = 'ePTFE'; dump.meta.thickness = 2;
  const w2 = boot();
  w2.applyImport(JSON.parse(JSON.stringify(dump)));
  assert.equal(w2.PARTS.length, dump.parts.length);
  assert.deepEqual(J(w2.PARTS.map(p => p.id)), J(dump.parts.map(p => p.id)));
  assert.deepEqual(J(w2.PARTS.map(p => p.pos)), J(dump.parts.map((_, i) => i + 1)));
  assert.equal(w2._els.oNum.value, 'X1');
  assert.equal(w2._els.oThk.value, 2);
  assert.equal(w2.state.journal.length, 1);
  assert.equal(w2._els.hdrOrder.textContent, 'поръчка X1');
});

test('блокът за Claude носи материала и дебелината от полетата', () => {
  const w = boot();
  w._els.oCli.value = 'Тест ЕООД'; w._els.oMat.value = 'ePTFE'; w._els.oThk.value = '2'; w.readMeta();
  w.renderJournal();
  const first = w._els.claudeBlock.value.split('\n')[0];
  assert.equal(first, 'Разкрой — поръчка R0006489 (Тест ЕООД, ePTFE t2)');
});

test('нова поръчка от нула: изчислява и изнася .ud6', async () => {
  const w = boot();
  w._els.oNum.value = 'M0001317'; w.switchOrder();
  w.PARTS.length = 0;
  w.addPart(); w.PARTS[0].od = 218; w.PARTS[0].idd = 169; w.PARTS[0].id = w.partId(218, 169); w.PARTS[0].qty = 12;
  w.addPart(); w.PARTS[1].od = 142; w.PARTS[1].idd = 90; w.PARTS[1].id = w.partId(142, 90); w.PARTS[1].qty = 8;
  w.state.remaining = { [w.PARTS[0].id]: 12, [w.PARTS[1].id]: 8 };
  w._els.oQty.value = '20'; w.readMeta();
  assert.equal(w.validate(), true, w._els.warn.innerHTML);
  w.state.mode = 'all';
  w.run();
  await new Promise(r => setTimeout(r, 300));
  assert.ok(w.state.res && w.state.res.sheets.length > 0);
  const data = w.buildUD6Sheet(w.state.res.sheets[0], 1, 3);
  assert.ok(data.length > 60000 && data[0] === 0xA4 && data[data.length - 1] === 0xAC);
});


// ---------------------------------------------------------------- разкрой (v1.6)
test('шест стратегии за поставяне, всяка дава валиден лист', () => {
  const w = boot();
  assert.deepEqual(J(w.STRATEGIES), ['bl', 'contact', 'tl', 'corner', 'edge', 'edgeContact']);
  const items = Array.from({ length: 30 }, (_, i) => ({ uid: i, type: 'x', od: 305, idd: 289 }));
  for (const s of w.STRATEGIES) {
    const p = w.packOneSheet(items, 1500, 1500, 5, 2, s, []);
    assert.ok(p.length > 0, s);
    for (let i = 0; i < p.length; i++) {
      assert.ok(p[i].x - 152.5 >= 5 - 1e-6 && p[i].x + 152.5 <= 1495 + 1e-6, s + ' в листа');
      for (let j = i + 1; j < p.length; j++)
        assert.ok(Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y) >= 307 - 1e-6, s + ' без застъпване');
    }
  }
});

test('spotInHole: първият детайл ляга до стената, вторият се побира до него', () => {
  const w = boot();
  const R = 140.5, r = 30.5;
  const a = w.spotInHole(r, [], R, 2);
  assert.ok(Math.abs(Math.hypot(a.x, a.y) - (R - r)) < 1e-6, 'до стената, а не в центъра');
  const b = w.spotInHole(r, [{ x: a.x, y: a.y, r }], R, 2);
  assert.ok(b, 'второто дете се побира');
  assert.ok(Math.hypot(b.x - a.x, b.y - a.y) >= 2 * r + 2 - 1e-6, 'без застъпване');
  assert.ok(Math.hypot(b.x, b.y) + r <= R + 1e-6, 'в отвора');
  assert.equal(w.spotInHole(200, [], R, 2), null, 'по-голямо от отвора се отказва');
});

test('treeSizes: бройките в дървото', () => {
  const w = boot();
  const inst = [{ uid: 0, kids: [1, 2] }, { uid: 1, kids: [3] }, { uid: 2, kids: [] }, { uid: 3, kids: [] }];
  assert.deepEqual(J(w.treeSizes(inst)), { 0: 4, 1: 2, 2: 1, 3: 1 });
});

test('новият разкрой не е по-лош от стария при никой размер', () => {
  const w = boot();
  const list = w.PARTS.map(p => ({ id: p.id, od: p.od, idd: p.idd, qty: p.qty }));
  // долни граници: v1.5 вадеше 120/126/128/130/130/130, v1.9 — 120/126/128/135/134/138
  const было = { 1400: 140, 1430: 145, 1440: 150, 1470: 160, 1490: 160, 1500: 165 };
  for (const W of [1400, 1430, 1440, 1470, 1490, 1500]) {
    const r = w.computeNesting(list, { W, H: W, margin: 5, gap: 2, kerf: 1, nest: 1, zones: [], maxSheets: 1 });
    assert.ok(r.sheets[0].length >= было[W], W + ': ' + r.sheets[0].length + ' < ' + было[W]);
  }
  const r = w.computeNesting(list, { W: 1485, H: 1500, margin: 5, gap: 2, kerf: 1, nest: 1, zones: [], maxSheets: 1 });
  assert.ok(r.sheets[0].length >= 165, 'реалният лист 1485×1500: ' + r.sheets[0].length);
});

test('геометрията е валидна: без застъпване, в листа, децата в отвора си', () => {
  const w = boot();
  const list = w.PARTS.map(p => ({ id: p.id, od: p.od, idd: p.idd, qty: p.qty }));
  const cfg = { W: 1500, H: 1500, margin: 5, gap: 2, kerf: 1, nest: 1, zones: [] };
  const r = w.computeNesting(list, cfg);
  w.PARTS.forEach(p => assert.equal(r.counts[p.id] || 0, p.qty, 'брой ' + p.id));
  for (const sh of r.sheets) {
    for (let i = 0; i < sh.length; i++) {
      const a = sh[i];
      assert.ok(a.x - a.od / 2 >= cfg.margin - 1e-6 && a.x + a.od / 2 <= cfg.W - cfg.margin + 1e-6, 'в листа X');
      assert.ok(a.y - a.od / 2 >= cfg.margin - 1e-6 && a.y + a.od / 2 <= cfg.H - cfg.margin + 1e-6, 'в листа Y');
      for (let j = i + 1; j < sh.length; j++) {
        const b = sh[j];
        if (a.treeId === b.treeId) continue;
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.od / 2 + b.od / 2 + cfg.gap - 1e-6,
          'застъпване ' + a.type + '/' + b.type);
      }
    }
    const byTree = {};
    sh.forEach(x => { (byTree[x.treeId] = byTree[x.treeId] || []).push(x); });
    for (const t of Object.values(byTree))
      for (const ch of t) {
        if (!ch.depth) continue;
        const host = t.find(x => x.depth === ch.depth - 1 && x.type === ch.host);
        if (!host) continue;
        assert.ok(Math.hypot(ch.x - host.x, ch.y - host.y) + ch.od / 2 <= host.idd / 2 - cfg.gap + 1e-6,
          ch.type + ' излиза от отвора на ' + host.type);
      }
  }
});

test('дефектната зона се спазва и в новия разкрой', () => {
  const w = boot();
  const list = w.PARTS.map(p => ({ id: p.id, od: p.od, idd: p.idd, qty: p.qty }));
  const zones = [{ x: 0, y: 1300, w: 200, h: 200 }];
  const r = w.computeNesting(list, { W: 1485, H: 1500, margin: 5, gap: 2, kerf: 1, nest: 1, zones, maxSheets: 1 });
  for (const ring of r.sheets[0]) assert.ok(!w.hitsZone(ring.x, ring.y, ring.od / 2, zones, 2), ring.type + ' в дефекта');
  assert.ok(r.sheets[0].length >= 140);
});


// ---------------------------------------------------------------- v1.7
test('машинно време: π×(режещ OD + режещ ID) + застъпване, при зададена скорост', () => {
  const w = boot();
  const sh = [{ type: 'a', od: 219, odn: 218, idd: 169, x: 0, y: 0, depth: 0, treeId: 1 }];
  // без kerf по ID и без застъпване → закованата формула π×(OD+ID)
  let c = { kerfId: 0, overlap: 0, speed: 20 };
  const L = w.cutLength(sh, c);
  assert.ok(Math.abs(L - Math.PI * (219 + 169)) < 1e-6);
  const t = w.machineTime(sh, c);
  assert.ok(Math.abs(t.sec - L / 20) < 1e-6);
  assert.equal(t.pierces, 2);
  // Ø218/169 ≈ 1,216 m ≈ 61 s (числото от документа, при номинални размери)
  const nom = w.cutLength([{ od: 218, idd: 169 }], { kerfId: 0, overlap: 0 });
  assert.ok(Math.abs(nom / 1000 - 1.216) < 0.001, nom);
  assert.ok(Math.abs(nom / 20 - 60.8) < 0.1);
  // застъпването добавя по толкова на всеки от двата контура
  c = { kerfId: 1, overlap: 3, speed: 20 };
  assert.ok(Math.abs(w.cutLength(sh, c) - (Math.PI * (219 + 170) + 6)) < 1e-6);
  assert.equal(w.fmtTime(61), '1 мин 01 с');
  assert.equal(w.fmtTime(45), '45 с');
});

test('какво още се побира: брои само в свободното място и спазва зоните', () => {
  const w = boot();
  const c = { W: 1000, H: 1000, margin: 5, gap: 2, kerf: 1, zones: [] };
  // празен лист: колко Ø304 се събират
  const empty = w.extraFit([], c);
  const big = empty.find(e => e.id === '304/289');
  assert.ok(big && big.n >= 4, JSON.stringify(big));
  // след като листът е пълен с един голям, остава по-малко
  const one = [{ type: '304/289', od: 305, idd: 289, x: 500, y: 500, depth: 0, treeId: 1 }];
  const after = w.extraFit(one, c).find(e => e.id === '304/289');
  assert.ok(after.n < big.n, 'заетото място намалява резерва');
  // дефектна зона намалява още
  const withZone = w.extraFit(one, Object.assign({}, c, { zones: [{ x: 0, y: 0, w: 500, h: 500 }] }))
    .find(e => e.id === '304/289');
  assert.ok(withZone.n < after.n, 'дефектът намалява резерва');
});

test('прагове: една стъпка връща бройки и резове', () => {
  const w = boot();
  const list = w.PARTS.map(p => ({ id: p.id, od: p.od, idd: p.idd, qty: p.qty }));
  const c = { margin: 5, gap: 2, kerf: 1, nest: 1 };
  const a = w.thresholdRow(1400, c, list), b = w.thresholdRow(1500, c, list);
  assert.ok(a.pieces > 0 && b.pieces > a.pieces, a.pieces + ' → ' + b.pieces);
  assert.ok(a.cuts > 0 && a.cuts <= a.pieces);
});

test('история: текущата поръчка се вижда веднага, без нищо да е записвано', () => {
  const w = boot();
  const L = w.listSaved();
  assert.equal(L.length, 1);
  assert.equal(L[0].order, 'R0006489');
  assert.equal(L[0].sheets, 0);
});

test('история: списък по поръчки, архив и връщане от архив', () => {
  const w = boot();
  w.state.journal.push({ n: 1, date: '2026-09-04', W: 1500, H: 1500, counts: {}, total: 3 });
  w.saveLS();
  w._els.oNum.value = 'M0001317'; w.switchOrder(); w.saveLS();
  const L = w.listSaved();
  assert.equal(L.length, 2);
  assert.deepEqual(J(L.map(x => x.order).sort()), ['M0001317', 'R0006489']);
  const r = L.find(x => x.order === 'R0006489');
  assert.equal(r.sheets, 1);
  assert.ok(r.updated, 'има дата на промяна');
  // архив → изтриване → връщане
  const arch = w.exportAll();
  assert.ok(arch.orders['R0006489'] && arch.orders['M0001317']);
  w.localStorage.removeItem('EMIN_NEST_R0006489');
  assert.equal(w.listSaved().length, 1);
  assert.equal(w.importAll(JSON.parse(JSON.stringify(arch))), 2);
  assert.equal(w.listSaved().length, 2);
  assert.throws(() => w.importAll({ nonsense: 1 }));
});

test('историята се рисува и показва текущата поръчка', () => {
  const w = boot();
  w.saveLS(); w.renderHistory();
  assert.match(w._els.histBox.innerHTML, /R0006489/);
  assert.match(w._els.histBox.innerHTML, /текуща/);
});

test('машинното време влиза в журнала и в блока за Claude', async () => {
  const w = boot();
  w.state.mode = 'one';
  w.run();
  await new Promise(r => setTimeout(r, 400));
  w.commit();
  const e = w.state.journal[0];
  assert.ok(e.sec > 0, 'записано време');
  assert.equal(e.speed, 20);
  assert.match(w._els.claudeBlock.value, /Машинно време: 1\)/);
});

test('праговете са монотонни: по-голям лист не дава по-малко', async () => {
  const w = boot();
  w._els.thA.value = '1400'; w._els.thB.value = '1500'; w._els.thS.value = '10';
  w.runThresholds();
  await new Promise(r => setTimeout(r, 4000));
  const rows = [...w._els.thBox.innerHTML.matchAll(/<b>(\d+)<\/b>/g)].map(m => +m[1]);
  assert.ok(rows.length >= 10, 'има редове: ' + rows.length);
  for (let i = 1; i < rows.length; i++)
    assert.ok(rows[i] >= rows[i - 1], 'спад при ред ' + i + ': ' + rows[i - 1] + ' → ' + rows[i]);
  assert.match(w._els.thBox.innerHTML, /Прагове: \d+ скока/);
});


// ---------------------------------------------------------------- v1.8
test('дефектна зона на произволно място, не само в ъгъл', () => {
  const w = boot();
  assert.deepEqual(J(Object.keys(w.CORNERS)), ['dl', 'dd', 'gl', 'gd', 'free']);
  w.state.zones.push({ corner: 'free', w: 120, h: 80, x: 600, y: 700 });
  const z = w.zonesAbs();
  assert.deepEqual(J(z[0]), { x: 600, y: 700, w: 120, h: 80, corner: 'free' });
  // ъглите продължават да работят
  w.state.zones.push({ corner: 'gd', w: 100, h: 100, x: 0, y: 0 });
  const z2 = w.zonesAbs()[1];
  assert.deepEqual(J([z2.x, z2.y]), [1400, 1400]);
  // разкроят я спазва
  const list = w.PARTS.map(p => ({ id: p.id, od: p.od, idd: p.idd, qty: p.qty }));
  const zones = [{ x: 600, y: 700, w: 300, h: 300 }];
  const r = w.computeNesting(list, { W: 1500, H: 1500, margin: 5, gap: 2, kerf: 1, nest: 1, zones, maxSheets: 1 });
  for (const ring of r.sheets[0]) assert.ok(!w.hitsZone(ring.x, ring.y, ring.od / 2, zones, 2), ring.type + ' в дефекта');
});

test('зона извън листа е грешка', () => {
  const w = boot();
  w.state.zones.push({ corner: 'free', w: 200, h: 200, x: 1400, y: 100 });
  assert.equal(w.validate(), false);
  assert.match(w._els.warn.innerHTML, /извън листа/);
});

test('ред на рязане: дървото е неделимо, отвор преди контур, вложеният преди хоста', () => {
  const w = boot();
  const rings = [
    { type: 'A', od: 305, odn: 304, idd: 289, x: 200, y: 200, depth: 0, treeId: 7 },
    { type: 'B', od: 193, odn: 192, idd: 181, x: 200, y: 200, depth: 1, treeId: 7 },
    { type: 'D', od: 55, odn: 54, idd: 37, x: 1200, y: 1200, depth: 0, treeId: 9 },
  ];
  const C = w.sheetContours(rings, 1, 3);
  const tags = C.map(c => c.type + ':' + c.layer);
  // за всяко дърво: B преди A, и ID преди OD
  assert.ok(tags.indexOf('B:CUT_ID') < tags.indexOf('B:CUT_OD'));
  assert.ok(tags.indexOf('A:CUT_ID') < tags.indexOf('A:CUT_OD'));
  assert.ok(tags.indexOf('B:CUT_OD') < tags.indexOf('A:CUT_ID'), 'вложеният излиза преди хоста');
  assert.ok(tags.indexOf('D:CUT_ID') < tags.indexOf('D:CUT_OD'));
  assert.equal(C.length, 6);
});

test('подреждането по път скъсява празния ход', () => {
  const w = boot();
  const list = w.PARTS.map(p => ({ id: p.id, od: p.od, idd: p.idd, qty: p.qty }));
  const cfg = { W: 1485, H: 1500, margin: 5, gap: 2, kerf: 1, kerfId: 1, overlap: 3, nest: 1, zones: [], maxSheets: 1 };
  const sh = w.computeNesting(list, cfg).sheets[0];
  const was = w.travelOf(w.sheetContours(sh, 1, 3, true));
  const now = w.travelOf(w.sheetContours(sh, 1, 3));
  assert.ok(now < was * 0.6, (now / 1000).toFixed(2) + ' m срещу ' + (was / 1000).toFixed(2) + ' m');
  // същите контури, само пренаредени
  const a = w.sheetContours(sh, 1, 3, true).map(c => c.type + c.layer + c.d).sort();
  const b = w.sheetContours(sh, 1, 3).map(c => c.type + c.layer + c.d).sort();
  assert.deepEqual(J(a), J(b));
});

test('празен ход при един контур и при празен лист не гърми', () => {
  const w = boot();
  assert.equal(w.sheetContours([], 1, 3).length, 0);
  assert.equal(w.travelOf([]), 0);
  const one = [{ type: 'A', od: 55, odn: 54, idd: 37, x: 100, y: 100, depth: 0, treeId: 1 }];
  assert.equal(w.sheetContours(one, 1, 3).length, 2);
  assert.ok(w.travelOf(w.sheetContours(one, 1, 3)) >= 0);
});


// ---------------------------------------------------------------- v1.9
test('остатък: намира парчето, отказва ивиците, спазва зоните', () => {
  const w = boot();
  const c = { W: 1500, H: 1500, margin: 5, gap: 2, zones: [] };
  // празен лист → почти целият е свободен
  const empty = w.freeRect([], c);
  assert.ok(empty.w > 1400 && empty.h > 1400, JSON.stringify(empty));
  // един голям кръг в средата → парчето е отстрани
  const one = [{ od: 900, idd: 800, x: 750, y: 750, depth: 0, treeId: 1 }];
  const r = w.freeRect(one, c);
  assert.ok(r && Math.min(r.w, r.h) >= 100);
  assert.ok(r.x + r.w <= 1495 + 1e-6 && r.y + r.h <= 1495 + 1e-6, 'в границите');
  // правоъгълникът не се застъпва с кръга
  const cx = 750, cy = 750;
  const near = Math.hypot(Math.max(r.x, Math.min(cx, r.x + r.w)) - cx, Math.max(r.y, Math.min(cy, r.y + r.h)) - cy);
  assert.ok(near >= 450 - 8, 'разстояние до кръга ' + near.toFixed(1));
  // зоната се изключва
  const withZone = w.freeRect([], Object.assign({}, c, { zones: [{ x: 0, y: 0, w: 1400, h: 1400 }] }));
  assert.ok(!withZone || withZone.area < 1400 * 1400, 'зоната се спазва');
});

test('остатък: пълен лист връща null', () => {
  const w = boot();
  const list = w.PARTS.map(p => ({ id: p.id, od: p.od, idd: p.idd, qty: p.qty }));
  const cfg = { W: 1500, H: 1500, margin: 5, gap: 2, kerf: 1, nest: 1, zones: [], maxSheets: 1 };
  const sh = w.computeNesting(list, cfg).sheets[0];
  assert.equal(w.freeRect(sh, cfg), null, 'пълният лист няма цяло парче');
});

test('преглед на .ud6: чете се от самия файл и съвпада с разкроя', () => {
  const w = boot();
  const list = w.PARTS.map(p => ({ id: p.id, od: p.od, idd: p.idd, qty: p.qty }));
  const cfg = { W: 1485, H: 1500, margin: 5, gap: 2, kerf: 1, kerfId: 1, overlap: 3, nest: 1, zones: [], maxSheets: 1 };
  const sh = w.computeNesting(list, cfg).sheets[0];
  const V = w.ud6View(sh, cfg);
  // по два контура на пръстен
  assert.equal(V.contours.length, sh.length * 2);
  // поредните номера са 1..N в реда на рязане
  assert.deepEqual(J(V.contours.map(k => k.idx)), J(V.contours.map((_, i) => i + 1)));
  // празният ход от файла съвпада с този от разкроя (до 1 mm)
  const fromPlan = w.travelOf(w.sheetContours(sh, cfg.kerfId, cfg.overlap));
  assert.ok(Math.abs(V.travel - fromPlan) < 1, 'от файла ' + V.travel.toFixed(1) + ' срещу от разкроя ' + fromPlan.toFixed(1));
  // всички точки са в границите на листа
  for (const k of V.contours) for (const q of k.pts)
    assert.ok(q[0] >= -1 && q[0] <= cfg.W + 1 && q[1] >= -1 && q[1] <= cfg.H + 1, 'точка извън листа ' + q);
  assert.ok(V.segments > 0 && V.bytes > 60000);
});

test('бърз ход влиза във времето само ако е зададен', () => {
  const w = boot();
  const sh = [{ type: 'a', od: 219, odn: 218, idd: 169, x: 300, y: 300, depth: 0, treeId: 1 },
              { type: 'a', od: 219, odn: 218, idd: 169, x: 900, y: 900, depth: 0, treeId: 2 }];
  w.state.res = { sheets: [sh], sheetCount: 1, counts: {}, kim: 0 };
  w.state.cur = 0;
  w.state.cfg = { W: 1500, H: 1500, margin: 5, gap: 2, kerf: 1, kerfId: 1, overlap: 3, speed: 20, rapid: 0, zones: [] };
  w.renderMTime !== undefined;
  w.drawSheet();
  assert.doesNotMatch(w._els.mtime.textContent, /празен ход =/);
  assert.match(w._els.mtime.textContent, /задай бърз ход/);
  w.state.cfg.rapid = 300;
  w.drawSheet();
  assert.match(w._els.mtime.textContent, /\+ .* празен ход = /);
  assert.match(w._els.mtime.textContent, /при 300 mm\/s/);
});

test('печатното заглавие носи поръчка, лист и параметри', () => {
  const w = boot();
  w.state.mode = 'all';
  const list = w.PARTS.map(p => ({ id: p.id, od: p.od, idd: p.idd, qty: p.qty }));
  const cfg = { W: 1490, H: 1490, margin: 5, gap: 2, kerf: 1, kerfId: 1, overlap: 3, speed: 20, rapid: 0, nest: 1, zones: [], maxSheets: 1 };
  w.state.res = w.computeNesting(list, cfg); w.state.cfg = cfg; w.state.cur = 0;
  w.drawSheet();
  const h = w._els.printHead.textContent;
  assert.match(h, /R0006489/); assert.match(h, /1490×1490/); assert.match(h, /ръб 5/);
});


// ---------------------------------------------------------------- v2.0
test('четирите начина на влагане; „най-големият пръв" не е най-добрият', () => {
  const w = boot();
  assert.deepEqual(J(w.NEST_MODES), ['single', 'big', 'count', 'area']);
  const list = w.PARTS.map(p => ({ id: p.id, od: p.od, idd: p.idd, qty: p.qty }));
  const V = w.prepareNesting(list, 1, 2, true);
  assert.equal(V.length, 4);
  const per = {};
  for (const v of V) {
    const s = w.packSheets(v.free, 1485, 1500, 5, 2, null, [], 1, v.size);
    per[v.mode] = s[0].reduce((a, p) => a + v.size[p.uid], 0);
  }
  // всеки многодетен вариант бие концентричния; кой точно печели зависи от поръчката
  for (const m of ['big', 'count', 'area'])
    assert.ok(per[m] >= per.single, m + ' ' + per[m] + ' < single ' + per.single);
  const best = Math.max(...Object.values(per));
  assert.ok(best > per.single, 'най-добрият ' + best + ' vs single ' + per.single);
  // computeNesting взима най-добрия
  const r = w.computeNesting(list, { W: 1485, H: 1500, margin: 5, gap: 2, kerf: 1, nest: 1, zones: [], maxSheets: 1 });
  assert.equal(r.sheets[0].length, best, JSON.stringify(per));
});

test('в отвор Ø289 влизат две Ø140, а не само едно Ø193', () => {
  const w = boot();
  const R = 289 / 2 - 2, r = 140 / 2;
  const a = w.spotInHole(r, [], R, 2);
  const b = w.spotInHole(r, [{ x: a.x, y: a.y, r }], R, 2);
  assert.ok(b, 'второто Ø140 се побира');
  assert.ok(Math.hypot(b.x - a.x, b.y - a.y) >= 140 + 2 - 1e-6);
  assert.ok(Math.hypot(b.x, b.y) + r <= R + 1e-6);
  // Ø193 се побира само едно
  const c = w.spotInHole(193 / 2, [], R, 2);
  assert.ok(c && !w.spotInHole(193 / 2, [{ x: c.x, y: c.y, r: 193 / 2 }], R, 2));
});

test('многодетното влагане пази геометрията: децата в отвора, без застъпване', () => {
  const w = boot();
  const list = w.PARTS.map(p => ({ id: p.id, od: p.od, idd: p.idd, qty: p.qty }));
  for (const V of w.prepareNesting(list, 1, 2, true)) {
    const byUid = {}; V.inst.forEach(i => byUid[i.uid] = i);
    for (const h of V.inst) {
      for (const k of h.kids) {
        const c = byUid[k];
        assert.ok(Math.hypot(c.ox, c.oy) + c.od / 2 <= h.idd / 2 - 2 + 1e-6,
          V.mode + ': ' + c.type + ' извън отвора на ' + h.type);
      }
      for (let i = 0; i < h.kids.length; i++) for (let j = i + 1; j < h.kids.length; j++) {
        const a = byUid[h.kids[i]], b = byUid[h.kids[j]];
        assert.ok(Math.hypot(a.ox - b.ox, a.oy - b.oy) >= a.od / 2 + b.od / 2 + 2 - 1e-6,
          V.mode + ': застъпване в ' + h.type);
      }
    }
    // всеки детайл е точно на едно място и няма цикли
    let nested = 0;
    for (const i of V.inst) { if (i.parent !== null) nested++; let c = i, n = 0; while (c.parent !== null) { c = byUid[c.parent]; assert.ok(++n < 60, 'цикъл'); } }
    assert.equal(nested + V.free.length, V.inst.length);
  }
});

test('кешът на влагането не мени резултата и ускорява праговете', () => {
  const w = boot();
  const list = w.PARTS.map(p => ({ id: p.id, od: p.od, idd: p.idd, qty: p.qty }));
  const cfg = { W: 1485, H: 1500, margin: 5, gap: 2, kerf: 1, nest: 1, zones: [], maxSheets: 1 };
  const a = w.computeNesting(list, cfg).sheets[0].length;
  const b = w.computeNesting(list, cfg).sheets[0].length;
  assert.equal(a, b);
  // смяна на kerf-а вдига нов кеш
  const c = w.computeNesting(list, Object.assign({}, cfg, { kerf: 3 })).sheets[0].length;
  assert.equal(w.computeNesting(list, cfg).sheets[0].length, a, 'старият вход дава стария резултат');
  assert.ok(c > 0);
});


// ---------------------------------------------------------------- v2.1
test('изтриване на ред от журнала връща бройките и преномерира', () => {
  const w = boot();
  const a = w.PARTS[0].id, b = w.PARTS[1].id;
  const left0 = { a: w.state.remaining[a], b: w.state.remaining[b] };
  w.state.journal.push({ n: 1, date: '2026-09-04', W: 1500, H: 1500, counts: { [a]: 5, [b]: 3 }, total: 8 });
  w.state.journal.push({ n: 2, date: '2026-09-04', W: 1490, H: 1490, counts: { [a]: 4 }, total: 4 });
  w.state.remaining[a] -= 9; w.state.remaining[b] -= 3;
  assert.equal(w.removeSheet(1), true);
  assert.equal(w.state.journal.length, 1);
  assert.equal(w.state.journal[0].n, 1, 'преномериран');
  assert.equal(w.state.journal[0].W, 1490, 'останал е вторият лист');
  assert.equal(w.state.remaining[a], left0.a - 4, 'върнати са само бройките на изтрития');
  assert.equal(w.state.remaining[b], left0.b);
  assert.equal(w.removeSheet(9), false, 'несъществуващ ред');
});

test('изтриване не качва „Остават" над поръчаното', () => {
  const w = boot();
  const p = w.PARTS[0];
  w.state.remaining[p.id] = p.qty;                       // нищо не е рязано
  w.state.journal.push({ n: 1, date: 'x', W: 1500, H: 1500, counts: { [p.id]: 5 }, total: 5 });
  w.removeSheet(1);
  assert.equal(w.state.remaining[p.id], p.qty, 'таванът е количеството по поръчка');
});

test('пълен цикъл: изчисли → впиши → изтрий връща изходното състояние', async () => {
  const w = boot();
  const before = JSON.stringify(w.state.remaining);
  w.state.mode = 'one';
  w.run();
  await new Promise(r => setTimeout(r, 2500));
  w.commit();
  assert.equal(w.state.journal.length, 1);
  assert.notEqual(JSON.stringify(w.state.remaining), before, 'бройките са смъкнати');
  w.removeSheet(1);
  assert.equal(w.state.journal.length, 0);
  assert.equal(JSON.stringify(w.state.remaining), before, 'върнато е изходното');
});

test('нова поръчка казва, че позициите са пренесени', () => {
  const w = boot();
  w.saveLS();
  w._els.oNum.value = 'НОВА-1'; w.switchOrder();
  assert.match(w._els.oMsg.innerHTML, /msg warn/);
  assert.match(w._els.oMsg.innerHTML, /пренесени от предишната/);
  // връщане към позната поръчка — зелено съобщение
  w._els.oNum.value = 'R0006489'; w.switchOrder();
  assert.match(w._els.oMsg.innerHTML, /msg ok/);
  assert.doesNotMatch(w._els.oMsg.innerHTML, /пренесени/);
});
