// Тест на EMIN_Nesting_R0006489_v1.1.html през DOM mock:  node --test test_nesting_lab.node.js
// 1) целият скрипт минава init без runtime грешки; 2) computeNesting -> buildUD6Sheet -> ud6_decode.py;
// 3) ZIP с binary .ud6 през python zipfile; 4) вграденият модул == ud6_write.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const J = v => JSON.parse(JSON.stringify(v));   // масивите от vm контекста са друг realm
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');

const HTML_PATH = path.join(__dirname, 'EMIN_Nesting_R0006489_v1.1.html');
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
    localStorage: { getItem(k) { return k in store ? store[k] : null; }, setItem(k, v) { store[k] = String(v); }, removeItem(k) { delete store[k]; } },
    navigator: {}, confirm() { return true; }, FileReader: function () {},
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    _els: els,
  };
  w.window = w; w.self = w; w.globalThis = w;
  return w;
}
function boot() {
  const w = makeWindow();
  for (const [id, v] of Object.entries({ sw: '1500', sh: '1500', mg: '5', gp: '2', kf: '1', mW: '1500', mH: '1500' }))
    w.document.getElementById(id).value = v;
  vm.createContext(w);
  vm.runInContext(script, w, { filename: 'nesting_lab.js' });
  return w;
}

// ---------------------------------------------------------------- тестове
test('целият скрипт минава init без грешки; версия 1.1', () => {
  const w = boot();
  assert.equal(typeof w.computeNesting, 'function');
  assert.equal(typeof w.buildUD6Sheet, 'function');
  assert.equal(typeof w.UD6.buildUD6, 'function');
  assert.match(html, /<span class="badge mono" id="ver">v1\.1<\/span>/);
  assert.match(html, /<title>EMIN Nesting Lab v1\.1/);
  assert.ok(w._els.ud61 && w._els.ud6All && w._els.ud6Hint, 'нови елементи');
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
});

test('sheetContours: ред = дърво по дърво, вложеният преди хоста, ID преди OD', () => {
  const w = boot();
  const rings = [
    { type: 'A', od: 305, odn: 304, idd: 289, x: 200, y: 200, depth: 0, treeId: 7 },
    { type: 'B', od: 193, odn: 192, idd: 181, x: 200, y: 200, depth: 1, treeId: 7 },
    { type: 'C', od: 47, odn: 46, idd: 34, x: 200, y: 200, depth: 2, treeId: 7 },
    { type: 'D', od: 55, odn: 54, idd: 37, x: 600, y: 600, depth: 0, treeId: 9 },
  ];
  const C = w.sheetContours(rings);
  assert.deepEqual(J(C.map(c => c.type + ':' + c.layer)), ['C:CUT_ID', 'C:CUT_OD', 'B:CUT_ID', 'B:CUT_OD', 'A:CUT_ID', 'A:CUT_OD', 'D:CUT_ID', 'D:CUT_OD']);
  assert.deepEqual(J(C.map(c => c.d)), [34, 47, 181, 193, 289, 305, 37, 55]);
});

test('пълен лист: computeNesting -> buildUD6Sheet -> ud6_decode.py', () => {
  const w = boot();
  const list = w.PARTS.map(p => ({ id: p.id, od: p.od, idd: p.idd, qty: p.qty }));
  const cfg = { W: 1500, H: 1500, margin: 5, gap: 2, kerf: 1, nest: 1, zones: [], maxSheets: 1 };
  const res = w.computeNesting(list, cfg);
  const sh = res.sheets[0];
  assert.ok(sh.length > 10, 'лист с ' + sh.length + ' пръстена');
  const C = w.sheetContours(sh);
  const data = w.buildUD6Sheet(sh);
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
  // rec5 = брой сегменти = сума на точките
  const nseg = C.reduce((s, c) => s + c.pts.length, 0);
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
  const files = [{ name: 'a_list1.ud6', data: w.buildUD6Sheet(sh) }, { name: 'a.csv', data: 'x;y\r\n1;2\r\n' }];
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
