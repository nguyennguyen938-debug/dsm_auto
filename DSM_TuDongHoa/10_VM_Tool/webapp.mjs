/**
 * ============================================================================
 *  webapp.mjs — gọi web app Apps Script
 * ----------------------------------------------------------------------------
 *  Gói lại 3 luật đã trả giá mới có (xem CLAUDE.md mục 4). Mọi nơi gọi web app
 *  phải đi qua đây, đừng tự `fetch` để khỏi quên luật nào:
 *
 *   1. KHÔNG kèm `headers`. Đặt Content-Type: text/plain làm lỗi
 *      {"ok":true,"msg":"Receiver alive"} xảy ra LIÊN TỤC.
 *   2. KHÔNG kiểm `o.ok`. "Receiver alive" là output của doPost KHÔNG chạy —
 *      sheet không được ghi gì nhưng ok===true. Phải kiểm field cụ thể.
 *   3. Apps Script thỉnh thoảng trả nguyên trang HTML -> phải gọi lại vài lần.
 *
 *  Mọi action đều idempotent nên gọi lại là an toàn.
 * ==========================================================================*/

export const WEBAPP = 'https://script.google.com/macros/s/AKfycbzzJCEgWBcO76OcbhJIdiHGlJEgbWxq7FFEGbIwwpQe2gmtOalVOXziJXFyuI1Ckrtn-Q/exec';
export const INBOX_FOLDER_ID = '18rFktqm_K_a9-RPW5S0o2fTkmmHITGKO';

const nghi = ms => new Promise(s => setTimeout(s, ms));

/**
 * POST và đợi tới khi `kiemField` có mặt trong kết quả.
 * @param kiemField tên field BẮT BUỘC phải có — KHÔNG dùng 'ok'.
 */
export async function post(body, kiemField, { lanToiDa = 4, gian = 2500 } = {}) {
  if (kiemField === 'ok') throw new Error('khong duoc kiem o.ok — xem bay "Receiver alive"');
  const data = JSON.stringify(body);
  let cuoi = '';
  for (let lan = 1; lan <= lanToiDa; lan++) {
    let t = '';
    try { t = await (await fetch(WEBAPP, { method: 'POST', body: data, redirect: 'follow' })).text(); }
    catch (e) { cuoi = 'loi mang: ' + e.message; await nghi(gian); continue; }
    let o = null;
    try { o = JSON.parse(t); } catch { cuoi = /^\s*</.test(t) ? 'tra HTML' : 'khong phai JSON'; }
    if (o && o[kiemField] != null) return o;
    if (o) cuoi = o.error ? `loi: ${o.error}` : `thieu field "${kiemField}" (${t.slice(0, 90)})`;
    await nghi(gian);
  }
  throw new Error(`web app: sau ${lanToiDa} lan van khong co "${kiemField}" — ${cuoi}`);
}

export async function get(qs, kiemField, { lanToiDa = 4, gian = 2500 } = {}) {
  for (let lan = 1; lan <= lanToiDa; lan++) {
    let t = '';
    try { t = await (await fetch(`${WEBAPP}?${qs}`)).text(); }
    catch { await nghi(gian); continue; }
    let o = null;
    try { o = JSON.parse(t); } catch { /* HTML tam thoi */ }
    if (o && o[kiemField] != null) return o;
    await nghi(gian);
  }
  throw new Error(`web app GET ?${qs}: sau ${lanToiDa} lan van khong co "${kiemField}"`);
}

/** Tra trạng thái các PO trong sheet. Trả { '<po>': {carrier, pic, ...} }. */
export async function lookup(pos) {
  if (!pos.length) return {};
  const o = await get(`action=lookup&pos=${pos.join(',')}`, 'rows');
  return o.rows;
}

/**
 * Chốt ngày pickup + tạo cây folder. PHẢI gọi TRƯỚC fillRow.
 * @param boQuaTran true cho đơn GROUND — không áp trần 20 đơn/ngày. Trần đó để
 *   giới hạn số đơn LTL mỗi chuyến xe; đơn Ground đi UPS nên không liên quan.
 *   Web app KHÔNG tự đoán được đơn nào là Ground, bên gọi phải truyền.
 */
export const makeFolder = (po, pickupSchedule, boQuaTran = false) =>
  post({ action: 'makeFolder', po, pickupSchedule, boQuaTran }, 'folderId');

/** HTML -> PDF, lưu thẳng vào folder. */
export const uploadHtml = (folderId, filename, html) =>
  post({ folderId, filename, html }, 'id');

/** base64 -> file. */
export const uploadFile = (folderId, filename, buf, mimeType = 'application/pdf') =>
  post({ folderId, filename, base64: buf.toString('base64'), mimeType }, 'id');

/** Điền sheet. LUÔN kèm skipCap khi ngày đã do makeFolder chốt. */
export const fillRow = body => post({ action: 'fillRow', ...body }, 'row');
