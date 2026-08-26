/* Test CopyB2B_B2C.gs bang sheet gia — kiem 3 muc copy.
 * Chay: node test-copy.js */
const fs = require('fs');

/* ---------------- stub Apps Script ---------------- */
const LOG = [];
global.Logger = { log: s => LOG.push(String(s)) };

function Sheet(name, gid, rows) {
  this._n = name; this._g = gid;
  this._d = rows.map(r => r.slice());          // mang 2 chieu, index 0 = hang 1
}
Sheet.prototype.getName = function () { return this._n; };
Sheet.prototype.getSheetId = function () { return this._g; };
Sheet.prototype.getLastRow = function () {
  let last = 0;
  for (let i = 0; i < this._d.length; i++)
    if ((this._d[i] || []).some(v => String(v == null ? '' : v).trim())) last = i + 1;
  return last;
};
Sheet.prototype._o = function (r, c) {
  while (this._d.length < r) this._d.push([]);
  const row = this._d[r - 1];
  while (row.length < c) row.push('');
  return row;
};
Sheet.prototype.getRange = function (r, c, nr, nc) {
  nr = nr || 1; nc = nc || 1;
  const sh = this;
  return {
    getValues() {
      const out = [];
      for (let i = 0; i < nr; i++) {
        const row = sh._o(r + i, c + nc - 1), one = [];
        for (let j = 0; j < nc; j++) one.push(row[c + j - 1] === undefined ? '' : row[c + j - 1]);
        out.push(one);
      }
      return out;
    },
    setValues(v) {
      for (let i = 0; i < nr; i++) {
        const row = sh._o(r + i, c + nc - 1);
        for (let j = 0; j < nc; j++) row[c + j - 1] = v[i][j];
      }
      return this;
    },
    getValue() { const row = sh._o(r, c); return row[c - 1] === undefined ? '' : row[c - 1]; },
    setValue(v) { sh._o(r, c)[c - 1] = v; return this; },
    setNumberFormat() { return this; },
    setFontWeight() { return this; },
  };
};
Sheet.prototype.deleteRow = function (r) { this._d.splice(r - 1, 1); };

function SS(sheets) { this._s = sheets; }
SS.prototype.getSheets = function () { return this._s; };
SS.prototype.getSheetByName = function (n) { return this._s.filter(s => s._n === n)[0] || null; };

/* ---------------- du lieu goc ---------------- */
const HEAD = ['Order Date', 'PO', 'Carrier', 'PIC', 'Cust Order', 'ShipTo', 'SKU',
  'Product', 'Qty', 'BOL', 'Pickup Sched', 'Rithum', 'Warehouse', 'PRO#', 'Pickup#',
  'Link Drive', 'Note'];

/** Hang goc 17 cot, dien du de phan biet cot nao bi chep. */
const hangGoc = (po, carrier, link) => ([
  '08/11/2026', po, carrier, '', 'CO-' + po, 'Ten khach', '812250-B', 'San pham', '2',
  'X', '08/13/2026', '', 'X', 'PRO-' + po, 'PU-' + po, link, 'ghi chu goc']);

const goc = new Sheet('Order List', 1, []);
goc.getRange(6, 1, 1, 17).setValues([HEAD]);
goc.getRange(7, 1, 6, 17).setValues([
  hangGoc('81000001', 'NULL', 'https://drive/moi-null'),      // NULL, hang MOI
  hangGoc('81000002', 'NULL', ''),                            // NULL, da co ben dich, goc CHUA co link
  hangGoc('81000003', 'UPS', 'https://drive/ups'),            // UPS, da co ben dich
  hangGoc('81000004', 'SEFL', 'https://drive/sefl'),          // carrier that, da co ben dich
  hangGoc('81000005', '', 'https://drive/hon-hop'),           // cot T=X, cot C TRONG  -> ca hai sheet
  hangGoc('81000006', 'UPS', 'https://drive/hon-hop-2'),      // cot T=X, da nam san o B2B
]);
/* Cot T (thu 20) — chi hai don cuoi duoc tich X. */
goc.getRange(6, 20).setValue('B2B and B2C');
goc.getRange(11, 20).setValue('X');
goc.getRange(12, 20).setValue('x');   // chu THUONG — phai nhan luon

/* Sheet dich: hang da co, nguoi dung DA DIEN tay vai cot. */
const cuB2B = (po, link) => ([
  'CU-date', po, 'AACT-taydien', 'PIC-tay', 'CU-co', 'CU-shipto', 'CU-sku', 'CU-sp', '9',
  'CU-bol', 'CU-pickup', 'L-taydien', 'CU-wh', 'N-taydien', 'O-taydien', link, 'CU-note']);

const b2b = new Sheet('B2B', 1948139859, []);
b2b.getRange(1, 1, 1, 17).setValues([HEAD]);
b2b.getRange(2, 1, 3, 17).setValues([
  cuB2B('81000002', 'https://drive/link-cu-b2b'),
  cuB2B('81000004', 'https://drive/link-cu-sefl'),
  cuB2B('81000006', 'https://drive/link-cu-honhop2'),   // don T=X nay DA nam san o B2B
]);

const b2c = new Sheet('B2C', 768845312, []);
b2c.getRange(1, 1, 1, 17).setValues([HEAD]);
b2c.getRange(2, 1, 1, 17).setValues([cuB2B('81000003', 'https://drive/link-cu-b2c')]);

global.SpreadsheetApp = {
  openById: () => new SS([goc, b2b, b2c]),
  flush: () => {},
};

/* ---------------- nap code that ---------------- */
eval(fs.readFileSync(__dirname + '/CopyB2B_B2C.gs', 'utf8')
  .replace(/^﻿/, ''));

copyB2B_B2C();

/* ---------------- kiem ---------------- */
const doc = (sh, po) => {
  for (let i = 1; i < sh._d.length + 1; i++) {
    const v = sh.getRange(i, 1, 1, 17).getValues()[0];
    if (String(v[1]).trim() === po) return v;
  }
  return null;
};

let loi = 0;
const ok = (dk, mo, thuc) => {
  if (dk) console.log('  ✅ ' + mo);
  else { console.log('  ❌ ' + mo + '   -> thuc te: ' + JSON.stringify(thuc)); loi++; }
};

console.log('\n--- 1. NULL, hang MOI (81000001) -> chi A, B, P ---');
{
  const r = doc(b2b, '81000001');
  ok(r && r[0] === '08/11/2026', 'A = ngay goc', r && r[0]);
  ok(r && r[1] === '81000001', 'B = PO goc', r && r[1]);
  ok(r && r[15] === 'https://drive/moi-null', 'P = link goc', r && r[15]);
  const khac = r ? [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16].filter(i => String(r[i]).trim()) : ['(khong thay hang)'];
  ok(khac.length === 0, 'moi cot khac deu TRONG', khac.map(i => i + '=' + r[i]));
}

console.log('\n--- 2. NULL, hang DA CO, goc CHUA co link (81000002) ---');
{
  const r = doc(b2b, '81000002');
  ok(r && r[0] === '08/11/2026', 'A cap nhat theo goc', r && r[0]);
  ok(r && r[15] === 'https://drive/link-cu-b2b', 'P GIU link cu (goc trong -> khong xoa)', r && r[15]);
  ok(r && r[2] === 'AACT-taydien', 'C giu nguyen tay dien', r && r[2]);
  ok(r && r[11] === 'L-taydien', 'L giu nguyen', r && r[11]);
  ok(r && r[13] === 'N-taydien', 'N giu nguyen', r && r[13]);
  ok(r && r[14] === 'O-taydien', 'O giu nguyen', r && r[14]);
  ok(r && r[10] === 'CU-pickup', 'K giu nguyen (khong con bi de len)', r && r[10]);
  ok(r && r[8] === '9', 'I (Qty) giu nguyen ben dich', r && r[8]);
}

console.log('\n--- 3. UPS (81000003) -> chep TOAN BO ---');
{
  const r = doc(b2c, '81000003');
  const mong = hangGoc('81000003', 'UPS', 'https://drive/ups');
  const lech = r ? mong.map((v, i) => [i, v, r[i]]).filter(x => String(x[1]) !== String(x[2])) : [['(khong thay hang)']];
  ok(lech.length === 0, 'ca 17 cot khop sheet goc', lech);
}

console.log('\n--- 4. carrier that khac UPS (81000004) -> tru C/L/N/O ---');
{
  const r = doc(b2b, '81000004');
  ok(r && r[2] === 'AACT-taydien', 'C giu cu', r && r[2]);
  ok(r && r[11] === 'L-taydien', 'L giu cu', r && r[11]);
  ok(r && r[13] === 'N-taydien', 'N giu cu', r && r[13]);
  ok(r && r[14] === 'O-taydien', 'O giu cu', r && r[14]);
  ok(r && r[10] === '08/13/2026', 'K chep tu goc', r && r[10]);
  ok(r && r[15] === 'https://drive/sefl', 'P chep tu goc', r && r[15]);
}

console.log('\n--- 5. cot T=X, cot C TRONG (81000005) -> CA HAI sheet, chi A,B,T ---');
{
  for (const [ten, sh] of [['B2B', b2b], ['B2C', b2c]]) {
    const r = doc(sh, '81000005');
    ok(!!r, ten + ': co mat', r);
    if (!r) continue;
    ok(r[0] === '08/11/2026', ten + ': A = ngay goc', r[0]);
    const t = sh.getRange(sh._d.findIndex(x => String(x[1]).trim() === '81000005') + 1, 20).getValues()[0][0];
    ok(String(t).toUpperCase() === 'X', ten + ': cot T = X', t);
    const khac = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].filter(i => String(r[i]).trim());
    ok(khac.length === 0, ten + ': moi cot khac TRONG (ke ca P)', khac.map(i => i + '=' + r[i]));
  }
}

console.log('\n--- 6. cot T=x thuong, DA nam o B2B (81000006) ---');
{
  const rb = doc(b2b, '81000006');
  ok(rb && rb[2] === 'AACT-taydien', 'B2B: du lieu cu KHONG bi xoa', rb && rb[2]);
  const tb = b2b.getRange(b2b._d.findIndex(x => String(x[1]).trim() === '81000006') + 1, 20).getValues()[0][0];
  ok(String(tb).toUpperCase() === 'X', 'B2B: cot T = X', tb);
  const rc = doc(b2c, '81000006');
  ok(!!rc, 'B2C: da duoc them (khong bi xoa khoi B2B)', rc);
  ok(rc && !String(rc[2]).trim(), 'B2C: cot C trong (hang moi chi A,B,T)', rc && rc[2]);
}

console.log('\n--- 7. hang T=X DA CO du lieu do tool xu ly ghi -> KHONG duoc de ---');
{
  // Mo phong: tool xu ly da ghi tracking + link vao sheet B2C cho don 81000006
  const r0 = doc(b2c, '81000006');
  ok(!!r0, 'B2C: hang ton tai truoc khi chay lai', r0);
  const iRow = b2c._d.findIndex(x => String(x[1]).trim() === '81000006') + 1;
  b2c.getRange(iRow, 14).setValue('1Z-TOOL-GHI');       // N = tracking
  b2c.getRange(iRow, 16).setValue('https://drive/tool'); // P = link
  b2c.getRange(iRow, 3).setValue('UPS');                 // C = carrier
  LOG.length = 0;
  copyB2B_B2C();                                          // chay lai lan hai
  const r = doc(b2c, '81000006');
  ok(r && r[13] === '1Z-TOOL-GHI', 'N (tracking) con nguyen sau khi copy chay lai', r && r[13]);
  ok(r && r[15] === 'https://drive/tool', 'P (link Drive) con nguyen', r && r[15]);
  ok(r && r[2] === 'UPS', 'C (carrier) con nguyen', r && r[2]);
}

console.log('\n--- log ---');
LOG.forEach(l => console.log('  ' + l));
console.log(loi ? '\n❌ ' + loi + ' kiem tra THAT BAI\n' : '\n✅ TAT CA kiem tra dat\n');
process.exit(loi ? 1 : 0);
