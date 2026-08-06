/**
 * ============================================================================
 *  aact.mjs — đăng nhập aaacooper.com và TẢI file của BOL ĐÃ CÓ
 * ----------------------------------------------------------------------------
 *  ⛔ File này KHÔNG tạo BOL. Không có hàm nào bấm Finalize.
 *     Tạo BOL trên AACT sinh ra BOL# và PRO# THẬT; tạo lại một đơn đã có =
 *     BOL rác + PRO rác (xem 3_QuyTrinh_AACT.md). Chỉ tải file của BOL đã tồn tại.
 *
 *  Đăng nhập: form ASP.NET thuần (user + password), không SSO, không MFA,
 *  không CAPTCHA — khảo sát 05/08/2026. Khác hẳn DSM nên tự động hoá được.
 *
 *  🔴 Mật khẩu đọc từ `11_TaiVe/creds.json` (chmod 600, đã .gitignore).
 *     KHÔNG in ra log, KHÔNG ghi vào đâu khác, KHÔNG truyền đi đâu ngoài form.
 * ==========================================================================*/

import fs from 'node:fs/promises';
import path from 'node:path';

const GOC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const CREDS = process.env.DSM_CREDS || path.join(GOC, '11_TaiVe', 'creds.json');

export const URL_LOGIN = 'https://www.aaacooper.com/pwb/Account/LogOn.aspx';
export const urlBolPdf = bol => `https://www.aaacooper.com/workspace/bol/${bol}/pdf`;
export const urlLabel  = bol => `https://www.aaacooper.com/workspace/shipping-label?sourceBolNumber=${bol}`;

async function docCreds() {
  let o;
  try { o = JSON.parse(await fs.readFile(CREDS, 'utf8')); }
  catch (e) { throw new Error(`khong doc duoc ${CREDS}: ${e.message}`); }
  const a = o.aact || {};
  if (!a.user || !a.pass) throw new Error(`${CREDS} thieu aact.user hoac aact.pass`);
  return a;
}

/** Tắt hộp thoại chấp thuận cookie (Cookiebot) — nó che mất form. */
async function tatCookiebot(page) {
  for (const sel of ['#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
                     '#CybotCookiebotDialogBodyButtonAccept',
                     '#CybotCookiebotDialogBodyLevelButtonAccept']) {
    const n = await page.locator(sel).count().catch(() => 0);
    if (n) { await page.click(sel).catch(() => {}); await page.waitForTimeout(800); return sel; }
  }
  return null;
}

/* ID thật của form đăng nhập — khảo sát 06/08/2026.
 * 🔴 ĐỪNG lấy "ô text đầu tiên": trong CÙNG form `aspnetForm` còn một ô tìm kiếm
 *    site-wide `placeholder="Enter City, State, Zip"` ĐỨNG TRƯỚC ô user. Lấy nhầm
 *    ô đó thì mật khẩu vẫn điền đúng chỗ nhưng user rỗng -> đăng nhập lặng lẽ hỏng
 *    và trang chỉ hiện lại chính nó. Đã sập đúng lỗi này lần chạy đầu. */
const O_USER = '#AAACooperMasterPage_bodyContent_txtUserId';
const O_PASS = '#AAACooperMasterPage_bodyContent_txtPassword';
const NUT_SIGNIN = '#AAACooperMasterPage_bodyContent_btnSignIn';

/** Đăng nhập. Trả { ok, noiDen }. KHÔNG bao giờ đưa mật khẩu vào thông báo lỗi. */
export async function dangNhap(page) {
  const cr = await docCreds();
  await page.goto(URL_LOGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  await tatCookiebot(page);

  for (const [ten, sel] of [['user', O_USER], ['password', O_PASS], ['nut Sign In', NUT_SIGNIN]]) {
    if (!await page.locator(sel).count()) {
      return { ok: false, noiDen: `khong thay o ${ten} (${sel}) — AACT co the da doi layout` };
    }
  }

  await page.fill(O_USER, cr.user);
  await page.fill(O_PASS, cr.pass);
  await Promise.all([
    page.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => {}),
    page.click(NUT_SIGNIN)
  ]);
  await page.waitForTimeout(4000);

  const url = page.url();
  const conFormPass = await page.locator('input[type=password]').count().catch(() => 0);
  // Còn ô password = chưa qua được trang đăng nhập
  const ok = !/LogOn\.aspx/i.test(url) && conFormPass === 0;
  return { ok, noiDen: ok ? url.slice(0, 90) : `van o trang dang nhap (${url.slice(0, 70)})` };
}

/**
 * Tải một URL trong PHIÊN ĐÃ ĐĂNG NHẬP rồi trả Buffer.
 * Dùng APIRequestContext của chính context -> cookie tự đi kèm, không cần
 * hook blob hay chờ viewer render (bài học mục #18 của playbook AACT).
 */
export async function taiFile(ctx, url) {
  const r = await ctx.request.get(url, { timeout: 90000 });
  const buf = Buffer.from(await r.body());
  const ct = (r.headers()['content-type'] || '').toLowerCase();
  const laPdf = buf.subarray(0, 5).toString('latin1') === '%PDF-';
  return { ok: laPdf, buf, ct, kb: Math.round(buf.length / 1024), status: r.status() };
}

/**
 * Tải PDF từ trang viewer của AACT.
 *
 * 🔴 KHẢO SÁT 06/08/2026 — TRẢ LỜI CÂU HỎI ĐỂ NGỎ TRONG TÀI LIỆU:
 *    **AACT KHÔNG có endpoint PDF trực tiếp.** `fetch` thẳng
 *    `/workspace/bol/<n>/pdf` trả `text/html` 81 KB, không phải PDF.
 *    Workspace là ứng dụng **Blazor WebAssembly**; PDF được dựng NGAY TRONG
 *    TRÌNH DUYỆT bằng Telerik (`Telerik.Documents.Fixed.wasm` ~2.8 MB).
 *    Vì vậy phải để WASM chạy xong rồi bấm nút Download thật — không có URL nào
 *    để tải thẳng, và đây cũng là lý do playbook cũ thấy `canvas:0` rồi bó tay.
 *
 * Nút Download nhận diện qua icon `k-svg-i-download` trong `.k-pdf-viewer`
 * (nút còn lại là `k-svg-i-print`). Nút KHÔNG có chữ nên tìm theo text sẽ trượt.
 *
 * WASM nặng nên phải chờ; `choMs` mặc định 60 s.
 */
export async function taiTuViewer(page, url, { choMs = 60000 } = {}) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });

  const viewer = page.locator('.k-pdf-viewer .k-toolbar-button');
  const t0 = Date.now();
  while (Date.now() - t0 < choMs) {
    if (await viewer.count().catch(() => 0)) break;
    await page.waitForTimeout(2500);
  }
  if (!await viewer.count()) return { ok: false, ly_do: `khong thay viewer sau ${choMs / 1000}s`, url };

  const nut = await page.evaluate(() =>
    [...document.querySelectorAll('.k-pdf-viewer .k-toolbar-button')].map(e =>
      ([...e.querySelectorAll('span')].map(s => String(s.className || '')).join(' ').match(/k-svg-i-[\w-]+/g) || []).join(',')));
  const i = nut.findIndex(c => /download|save/i.test(c));
  if (i < 0) return { ok: false, ly_do: `khong thay nut download (icon: ${JSON.stringify(nut)})`, url };

  const cho = page.waitForEvent('download', { timeout: 60000 }).catch(() => null);
  await viewer.nth(i).click();
  const dl = await cho;
  if (!dl) return { ok: false, ly_do: 'bam Download nhung khong co su kien tai ve', url };

  const luong = await dl.createReadStream();
  const manh = [];
  for await (const c of luong) manh.push(c);
  const buf = Buffer.concat(manh);
  const laPdf = buf.subarray(0, 5).toString('latin1') === '%PDF-';
  return { ok: laPdf, buf, ten: dl.suggestedFilename(), kb: Math.round(buf.length / 1024),
           ly_do: laPdf ? null : 'tai duoc nhung khong phai %PDF' };
}

/**
 * Shipping Label KHÔNG phải trang viewer như BOL — nó là FORM NHIỀU BƯỚC,
 * điền sẵn từ BOL nguồn: `Next` -> `Create Label PDF` -> mở TAB MỚI chứa viewer.
 * (Khớp mô tả ở `3_QuyTrinh_AACT.md` bước 4.)
 * Đừng gọi taiTuViewer thẳng vào URL này — sẽ chờ viewer mãi không thấy.
 */
export async function taiShippingLabel(page, bolNumber, { choMs = 60000 } = {}) {
  await page.goto(urlLabel(bolNumber), { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(12000);                       // form điền sẵn từ BOL nguồn

  const bam = async (nhan) => {
    const l = page.locator(`button:has-text("${nhan}"), input[type=submit][value*="${nhan}"]`).first();
    if (!await l.count()) return false;
    await l.scrollIntoViewIfNeeded().catch(() => {});
    await l.click();
    return true;
  };

  if (!await bam('Next')) return { ok: false, ly_do: 'khong thay nut Next tren trang shipping-label' };
  await page.waitForTimeout(8000);

  // "Create Label PDF" mở tab mới -> phải bắt popup TRƯỚC khi bấm
  const ctx = page.context();
  const choTab = ctx.waitForEvent('page', { timeout: 60000 }).catch(() => null);
  if (!await bam('Create Label PDF')) return { ok: false, ly_do: 'khong thay nut "Create Label PDF" sau khi bam Next' };

  const tab = await choTab;
  const trang = tab || page;                              // có bản mở cùng tab
  if (tab) await tab.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => {});

  const r = await taiTuViewerTaiCho(trang, choMs);
  if (tab) await tab.close().catch(() => {});
  return r;
}

/** Phần bấm Download của taiTuViewer, tách ra để dùng lại cho tab popup. */
async function taiTuViewerTaiCho(page, choMs) {
  const viewer = page.locator('.k-pdf-viewer .k-toolbar-button');
  const t0 = Date.now();
  while (Date.now() - t0 < choMs) {
    if (await viewer.count().catch(() => 0)) break;
    await page.waitForTimeout(2500);
  }
  if (!await viewer.count()) return { ok: false, ly_do: `khong thay viewer sau ${choMs / 1000}s` };

  const nut = await page.evaluate(() =>
    [...document.querySelectorAll('.k-pdf-viewer .k-toolbar-button')].map(e =>
      ([...e.querySelectorAll('span')].map(s => String(s.className || '')).join(' ').match(/k-svg-i-[\w-]+/g) || []).join(',')));
  const i = nut.findIndex(c => /download|save/i.test(c));
  if (i < 0) return { ok: false, ly_do: `khong thay nut download (icon: ${JSON.stringify(nut)})` };

  const cho = page.waitForEvent('download', { timeout: 60000 }).catch(() => null);
  await viewer.nth(i).click();
  const dl = await cho;
  if (!dl) return { ok: false, ly_do: 'bam Download nhung khong co su kien tai ve' };

  const manh = [];
  for await (const c of await dl.createReadStream()) manh.push(c);
  const buf = Buffer.concat(manh);
  const laPdf = buf.subarray(0, 5).toString('latin1') === '%PDF-';
  return { ok: laPdf, buf, ten: dl.suggestedFilename(), kb: Math.round(buf.length / 1024),
           ly_do: laPdf ? null : 'tai duoc nhung khong phai %PDF' };
}

/** Tải cả BOL lẫn Shipping Label của một BOL# ĐÃ CÓ. KHÔNG tạo BOL mới. */
export async function taiBolVaLabel(page, bolNumber) {
  return {
    bol: await taiTuViewer(page, urlBolPdf(bolNumber)),
    lbl: await taiShippingLabel(page, bolNumber)
  };
}
