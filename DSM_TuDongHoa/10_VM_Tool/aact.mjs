/**
 * ============================================================================
 *  aact.mjs — đăng nhập aaacooper.com, TẠO BOL và TẢI file
 * ----------------------------------------------------------------------------
 *  Hai nhóm hàm, mức rủi ro KHÁC HẲN nhau:
 *
 *   AN TOÀN — chỉ đọc:   dangNhap · taiTuViewer · taiShippingLabel · taiBolVaLabel
 *      Tải file của BOL ĐÃ CÓ. Không tạo gì.
 *
 *   ⛔ KHÔNG HOÀN TÁC:   taoBOL(..., { finalize: true })
 *      Finalize sinh ra BOL# và PRO# THẬT. Tạo lại một đơn đã có = BOL rác +
 *      PRO rác (xem 3_QuyTrinh_AACT.md). AACT KHÔNG đặt lịch pickup — nhẹ hơn
 *      CTII — nhưng số vẫn là số thật và vào sheet.
 *      `finalize` mặc định **false**: điền xong thì DỪNG để người xem.
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

/* ============================================================================
 *  TẠO BOL — ⛔ THAO TÁC KHÔNG HOÀN TÁC ĐƯỢC
 * ----------------------------------------------------------------------------
 *  Finalize sinh ra **BOL# và PRO# THẬT**. Tạo lại một đơn đã có = BOL rác + PRO rác
 *  (AACT không đặt lịch pickup — xem quy tắc #2 — nhưng số vẫn là số thật).
 *  Vì vậy `finalize` mặc định **false**: hàm điền xong rồi DỪNG, trả ảnh chụp để
 *  người xem. Chỉ truyền `finalize:true` khi thật sự muốn tạo.
 *
 *  KHẢO SÁT 06/08/2026 — ba bẫy:
 *   1. ID mặt hàng có **hậu tố GUID đổi mỗi phiên** (`Weight_bb09a55b-…`).
 *      Phải chọn theo TIỀN TỐ `[id^="Weight_"]`, không hard-code được.
 *   2. `IsHazmat_*` **mặc định ĐANG TÍCH** → phải chủ động BỎ tích
 *      (tài liệu ghi "Shipment contains: bỏ tích" — dễ đọc nhầm thành "để nguyên").
 *   3. `Name_ShipmentPartyConsignee` xuất hiện **2 lần** (Company Name và Contact).
 *      nth(0) = Company, nth(1) = Contact. getElementById chỉ thấy cái đầu.
 *   4. Nhập zip **KHÔNG tự điền** city/state như tài liệu mô tả (thử 06/08: vẫn rỗng)
 *      → phải điền tay cả ba.
 * ==========================================================================*/

export const URL_BOL_MOI = 'https://www.aaacooper.com/workspace/bol?sourceBolTemplateId=50357';

/**
 * @param dl {po, customerOrder, consignee:{ten,diaChi,city,bang,zip,phone}, tinh:{qty,weight,cls}, moTa}
 * @param finalize false = điền xong rồi DỪNG (mặc định). true = bấm Finalize THẬT.
 */
export async function taoBOL(page, dl, { finalize = false, anh = null } = {}) {
  const nk = [];
  const ghi = (b, v) => nk.push(`${b}: ${v}`);

  await page.goto(URL_BOL_MOI, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(18000);                    // Blazor WASM nạp chậm

  // ---- Trang 1: Consignee. Shipper/Bill-to đã có sẵn trong template 50357 ----
  const dat = async (sel, val, i = 0) => {
    const l = page.locator(sel).nth(i);
    if (!await l.count()) throw new Error(`khong thay ${sel} #${i}`);
    await l.fill(String(val ?? ''));
    await page.waitForTimeout(400);
  };
  // store thì Company Name gồm CẢ dòng C/O (tài liệu bước 3, trang 1)
  const tenCty = dl.consignee.co ? `${dl.consignee.ten} ${dl.consignee.co}` : dl.consignee.ten;
  await dat('#Name_ShipmentPartyConsignee', tenCty, 0);
  await dat('#StreetAddress_ShipmentPartyConsignee', dl.consignee.diaChi, 0);
  await dat('#zip_Location_ShipmentPartyConsignee', dl.consignee.zip, 0);
  await page.waitForTimeout(2500);
  // zip KHÔNG tự điền city/state -> điền tay
  await dat('#city_Location_ShipmentPartyConsignee', dl.consignee.city, 0);
  await dat('#state_Location_ShipmentPartyConsignee', dl.consignee.bang, 0);
  if (dl.consignee.phone) await dat('#Phone_ShipmentPartyConsignee', dl.consignee.phone, 0);
  ghi('trang 1', `${tenCty} | ${dl.consignee.city}, ${dl.consignee.bang} ${dl.consignee.zip}`);

  await page.locator('button:has-text("Next")').first().click();
  await page.waitForTimeout(12000);

  // ---- Trang 2: COMMODITY #1 + Reference Numbers ---------------------------
  const datTien = async (tienTo, val) => {
    const l = page.locator(`[id^="${tienTo}"]`).first();
    if (!await l.count()) throw new Error(`khong thay o [id^="${tienTo}"]`);
    await l.fill(String(val));
    await page.waitForTimeout(400);
  };
  await datTien('HandlingUnitsCount_', dl.tinh.qty);
  await datTien('Weight_', dl.tinh.weight);
  await datTien('Description_', dl.moTa);
  await datTien('Class_', dl.tinh.cls);

  // IsHazmat mặc định ĐANG TÍCH -> bỏ tích
  const haz = page.locator('[id^="IsHazmat_"]').first();
  if (await haz.count() && await haz.isChecked()) { await haz.uncheck(); await page.waitForTimeout(500); }
  ghi('hazmat', await haz.count() ? (await haz.isChecked() ? 'VAN TICH ⚠️' : 'da bo tich') : 'khong thay o');

  await dat('#SpecialInstructions', `PO Number ${dl.po}`);
  await dat('#fvcAmount', '200');

  const pro = page.locator('#generate-pro-number');
  if (await pro.count() && !await pro.isChecked()) { await pro.check(); await page.waitForTimeout(500); }
  ghi('generate PRO', await pro.count() ? (await pro.isChecked() ? 'da tich' : 'CHUA TICH ⚠️') : 'khong thay o');

  await dat('#customer-bol-number', dl.po);              // Shipper BOL #
  await dat('#shipper-reference-number-0', dl.po);       // Shipper Reference #1
  await dat('#purchase-order-number-0', dl.customerOrder); // Consignee Reference (PO) #1
  ghi('trang 2', `${dl.tinh.qty} unit | ${dl.tinh.weight} lb | class ${dl.tinh.cls}`);

  if (anh) await page.screenshot({ path: anh, fullPage: true });

  if (!finalize) {
    ghi('FINALIZE', 'BO QUA — dien xong roi dung (finalize=false)');
    return { ok: true, daTao: false, nhatKy: nk };
  }

  // ---- ⛔ ĐIỂM KHÔNG QUAY LẠI ĐƯỢC ----------------------------------------
  await page.locator('button:has-text("Finalize Bill of Lading")').first().click();
  await page.waitForTimeout(15000);

  const so = await page.evaluate(() => {
    const t = (document.body.innerText || '').replace(/\s+/g, ' ');
    return { bol: (t.match(/BOL\s*#?\s*:?\s*(\d{6,9})/i) || [])[1] || null,
             pro: (t.match(/PRO\s*(?:Number)?\s*#?\s*:?\s*(\d{7,10})/i) || [])[1] || null,
             url: location.href.slice(0, 100) };
  });
  ghi('FINALIZE', `BOL#=${so.bol} PRO#=${so.pro}`);
  // Trang /workspace/bol/<id> chết sau khi rời đi (lỗi #16) -> mất số là mất luôn
  if (!so.bol || !so.pro) {
    return { ok: false, daTao: true, nhatKy: nk,
             ly_do: 'DA FINALIZE nhung KHONG doc duoc BOL#/PRO# — LAY TAY NGAY, trang se chet' };
  }
  return { ok: true, daTao: true, bolNumber: so.bol, pro: so.pro, nhatKy: nk };
}
