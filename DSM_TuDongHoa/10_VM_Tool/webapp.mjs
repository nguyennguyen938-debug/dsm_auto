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

import fs from 'node:fs/promises';
import path from 'node:path';

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

/**
 * Ba sheet trong cùng một file, tra theo **gid** vì tên tab đổi lúc nào không biết.
 * Header: `Order List` ở hàng 6, hai sheet con ở hàng 1 — sai chỗ này là đọc lệch
 * cả bảng mà không có lỗi nào bật lên.
 */
export const SHEET = {
  ORDER: { gid: null, headerRows: 6 },            // null = mặc định của web app
  B2B:   { gid: 1948139859, headerRows: 1 },
  B2C:   { gid: 768845312, headerRows: 1 }
};

/** Tra trạng thái các PO. `sheet` mặc định `Order List`; truyền `SHEET.B2B`/`SHEET.B2C` để đọc sheet con. */
export async function lookup(pos, sheet = SHEET.ORDER) {
  if (!pos.length) return {};
  const them = sheet.gid ? `&sheetGid=${sheet.gid}&headerRows=${sheet.headerRows}` : '';
  const o = await get(`action=lookup&pos=${pos.join(',')}${them}`, 'rows');
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

/**
 * Đánh dấu đơn "vừa B2B vừa B2C" — ghi `X` vào **cột T**, không chạm cột nào khác.
 *
 * Dùng cho packing slip có SKU hỗn hợp (một phần đi luồng B2B, phần kia B2C). Những
 * đơn này chưa xử lý: không BOL, không folder Drive, không carrier. `CopyB2B_B2C.gs`
 * thấy X thì copy sang cả hai sheet, chỉ chép A, B, T.
 */
export const danhDauB2B_B2C = po =>
  post({ action: 'danhDauB2B_B2C', po }, 'row');

/** HTML -> PDF, lưu thẳng vào folder. */
export const uploadHtml = (folderId, filename, html) =>
  post({ folderId, filename, html }, 'id');

/** base64 -> file. */
export const uploadFile = (folderId, filename, buf, mimeType = 'application/pdf') =>
  post({ folderId, filename, base64: buf.toString('base64'), mimeType }, 'id');

/** Điền sheet. LUÔN kèm skipCap khi ngày đã do makeFolder chốt. */
export const fillRow = body => post({ action: 'fillRow', ...body }, 'row');

/* ===========================================================================
 *  🔴 BẰNG CHỨNG "ĐƠN NÀY ĐÃ CÓ FOLDER DRIVE" — thêm 13/08/2026
 * ---------------------------------------------------------------------------
 *  Vì sao cần: `makeFolder` tìm folder theo **NGÀY** rồi mới tìm `PO - <po>` bên trong.
 *  Chạy lại vào ngày khác là tạo folder ở ngày mới, và `fillRow` ghi đè cột P bằng link
 *  mới — folder cũ thành mồ côi, người xem sheet không biết còn một bản nữa.
 *
 *  Đã xảy ra thật: PO `07587667` có folder ở **cả 11 Aug lẫn 12 Aug**, `81827440` cũng vậy.
 *  Bảy PO bị `fillRow` 2–3 lần. Log cho thấy ba lượt liền bỏ qua đúng ("cột C đã có
 *  carrier NULL") rồi lượt sau lại làm từ đầu — cột C có lúc trống trở lại. Nguyên nhân
 *  chưa xác định; người dùng chốt 13/08 "đừng bận tâm, cứ thêm chốt chặn".
 *
 *  Cột C là chốt chặn DUY NHẤT của nhánh BOL, mà nó nằm trên sheet — nơi nhiều người sửa.
 *  File này là chốt chặn thứ hai, nằm trên đĩa, không ai sửa nhầm.
 *
 *  Cùng cơ chế với `aact/<PO>.json` và `ups/<PO>.json`: **việc không hoàn tác được thì
 *  phải để lại dấu vết NGAY**. Khác một điểm — bằng chứng này không chặn đơn chạy lại,
 *  nó **cho dùng lại đúng folder cũ**, nên chạy lại vẫn sửa được lỗi ở các bước sau.
 *
 *  KHÔNG tách tên theo `--sheet`: một PO chỉ có MỘT folder Drive. Đơn hỗn hợp chỉ được
 *  dựng BOL ở chế độ `--sheet b2b`, chế độ chính chỉ tích X, nên không có hai bên cùng tạo.
 * ======================================================================== */

const DRIVEDIR = process.env.DSM_DRIVE ||
  path.join(path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), '11_TaiVe', 'drive');
const fileDrive = po => path.join(DRIVEDIR, `${po}.json`);

export async function docFolderDaTao(po) {
  try {
    const o = JSON.parse(await fs.readFile(fileDrive(po), 'utf8'));
    return o && o.folderId ? o : null;
  } catch { return null; }
}

/**
 * Gọi `makeFolder` MỘT lần cho mỗi PO; lần sau dùng lại folder đã ghi ra đĩa.
 * Trả về cùng hình dạng `makeFolder` ở phần các bước sau cần: `folderId`, `url`,
 * `dayFolder`, `pickupSchedule`, `pickupMoved`.
 */
export async function layFolder(po, pickupSchedule, boQuaTran = false, ghiLog = null) {
  const da = await docFolderDaTao(po);
  if (da) {
    ghiLog?.(`${po}: da co folder Drive tu ${da.luc} (${da.dayFolder}) — KHONG tao lai`);
    return da;
  }
  const mk = await makeFolder(po, pickupSchedule, boQuaTran);
  const bc = {
    folderId: mk.folderId, url: mk.url, dayFolder: mk.dayFolder,
    pickupSchedule: mk.pickupSchedule, pickupMoved: !!mk.pickupMoved,
    luc: new Date().toISOString()
  };
  await fs.mkdir(DRIVEDIR, { recursive: true });
  await fs.writeFile(fileDrive(po), JSON.stringify(bc, null, 1));   // GHI NGAY
  return bc;
}
