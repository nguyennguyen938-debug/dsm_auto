/**
 * ============================================================================
 *  lecangs.mjs — tra tồn kho trên app.lecangs.com (nhánh đơn GROUND)
 * ----------------------------------------------------------------------------
 *  Quy trình: `01_HuongDan_VanHanh/7_QuyTrinh_Ground_UPS.md` Phần 1 Bước 2.
 *
 *  🔴 BỐN ĐIỀU ĐO ĐƯỢC 07/08/2026, đừng sửa nếu chưa đo lại:
 *
 *  1. Cột tồn kho tên thật là **`Avaliable Stock Quantity`** — Lecangs **viết sai chính tả**
 *     (`Avaliable`, thiếu chữ `i`). Tài liệu quy trình ghi "Available Stock" là ghi theo trí nhớ.
 *     → Dò tên cột phải chấp nhận CẢ HAI cách viết, không thì không bao giờ tìm thấy cột.
 *
 *  2. Trang dùng **Ant Design**, không có `id` ổn định. Ô SKU nhận ra bằng
 *     `placeholder="SKU"`, nút bấm nhận ra bằng chữ.
 *
 *  3. Tra bằng **Model Number NGUYÊN VẸN, GIỮ hậu tố `-B`**. `812250` và `812250-B` là
 *     HAI sản phẩm khác nhau (tấm 2 ft 31 lb vs tấm 12 ft 128 lb). Bỏ hậu tố là sai gấp 4 lần.
 *
 *  4. Bảng còn nguyên kết quả của lần tra TRƯỚC trong lúc đang tải kết quả mới.
 *     → `traTonKho()` phải đợi bảng thực sự đổi, không thì đọc nhầm SKU trước đó.
 * ==========================================================================*/

const TRANG_KHO = 'https://app.lecangs.com/oms/inventory';

/** Chấp nhận cả `Avaliable` (Lecangs viết sai) lẫn `Available` (viết đúng). */
const COT_TON = /ava[il]+able\s*stock/i;
const COT_KHO = /^w\.?h\.?$/i;
const COT_SKU = /^sku$/i;

/** Đọc bảng đang hiện -> [{ sku, kho, con, ten }]. */
async function docBang(page) {
  return page.evaluate(({ sTon, sKho, sSku }) => {
    const reTon = new RegExp(sTon, 'i'), reKho = new RegExp(sKho, 'i'), reSku = new RegExp(sSku, 'i');
    const dau = [...document.querySelectorAll('th')].map(e => (e.innerText || '').trim());
    const iTon = dau.findIndex(t => reTon.test(t));
    const iKho = dau.findIndex(t => reKho.test(t));
    const iSku = dau.findIndex(t => reSku.test(t));
    const iTen = dau.findIndex(t => /name of goods\(en\)/i.test(t));
    if (iTon < 0 || iKho < 0 || iSku < 0) return { loi: 'khong thay du cot', dau };
    const hang = [...document.querySelectorAll('tbody tr')].map(tr => {
      const o = [...tr.querySelectorAll('td')].map(td => (td.innerText || '').trim());
      if (!o.length) return null;
      return { sku: o[iSku] || '', kho: o[iKho] || '', ten: iTen >= 0 ? (o[iTen] || '') : '',
               con: Number(String(o[iTon]).replace(/[^0-9.-]/g, '')) };
    }).filter(Boolean);
    return { hang, dau };
  }, { sTon: COT_TON.source, sKho: COT_KHO.source, sSku: COT_SKU.source });
}

/**
 * Tra tồn kho của MỘT model.
 *
 * @param page  trang đã đăng nhập Lecangs (dùng `phien.vaoLecangs` trước)
 * @param model Model Number NGUYÊN VẸN, ví dụ `812250-B` — KHÔNG bỏ hậu tố
 * @returns { model, hang: [{sku, kho, con, ten}] }  — `con` là số lượng còn dùng được
 */
export async function traTonKho(page, model) {
  const ma = String(model).trim();
  if (!ma) throw new Error('traTonKho: thieu model');

  if (!/\/oms\/inventory/.test(page.url())) {
    await page.goto(TRANG_KHO, { waitUntil: 'domcontentloaded', timeout: 70000 });
    await page.waitForTimeout(9000);
  }

  const o = page.locator('input[placeholder="SKU"]').first();
  if (!await o.count()) throw new Error('Lecangs: khong thay o nhap SKU — con phien khong?');

  // Chụp lại bảng cũ để biết khi nào bảng THẬT SỰ đổi (bẫy số 4).
  const truoc = JSON.stringify((await docBang(page)).hang || []);

  await o.click();
  await o.fill('');
  await o.pressSequentially(ma, { delay: 60 });

  const nut = page.locator('button').filter({ hasText: /^Search$/ }).first();
  if (!await nut.count()) throw new Error('Lecangs: khong thay nut Search');
  await nut.click({ timeout: 20000 });

  // đợi bảng đổi, tối đa 30 s
  let kq = null;
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(2000);
    kq = await docBang(page);
    if (kq.loi) continue;
    if (JSON.stringify(kq.hang) !== truoc) break;
  }
  if (!kq || kq.loi) throw new Error(`Lecangs: doc bang hong (${kq?.loi}). Cot thay: ${JSON.stringify(kq?.dau)}`);

  // Bảng Ant Design có một dòng đo vô hình (mọi ô rỗng) — bỏ đi.
  const thuc = kq.hang.filter(h => h.sku);

  // Ô Search tìm GẦN ĐÚNG. Chỉ nhận khớp TUYỆT ĐỐI.
  const hang = thuc.filter(h => h.sku.toUpperCase() === ma.toUpperCase());

  // 🔴 Lecangs đặt SKU có hậu tố riêng, KHÁC với Model Number trên packing slip:
  //    `812250-B` -> Lecangs có `812250-B-PALLET`; còn thấy cả `-WL`.
  //    CHƯA BIẾT hậu tố đó nghĩa là gì và có phải cùng sản phẩm không, nên KHÔNG tự khớp.
  //    Thà dừng và hỏi còn hơn chọn nhầm kho cho một sản phẩm khác.
  if (!hang.length && thuc.length) {
    throw new Error(`Lecangs: khong co SKU dung "${ma}", nhung co cac ma gan giong: ` +
      thuc.map(h => `${h.sku}@${h.kho}(${h.con})`).join(', ') +
      ` -> DUNG va HOI NGUOI DUNG: ma nao la dung san pham nay?`);
  }
  return { model: ma, hang };
}

/**
 * Chọn kho theo quy trình: kho GẦN NHẤT mà CÒN HÀNG.
 *
 * @param uuTien  danh sách kho gần→xa, lấy từ `ground-tra.khoUuTien()`
 * @param hang    kết quả `traTonKho().hang`
 * @param canBaoNhieu  số lượng cần (Qty Shipped)
 * @returns { kho, con } — hoặc ném lỗi nếu không kho nào đủ hàng
 *
 * ❗ Không kho nào còn hàng thì DỪNG và HỎI NGƯỜI DÙNG (quy trình chốt 06/08).
 *    Tuyệt đối không tự chọn kho hết hàng.
 */
export function chonKho(uuTien, hang, canBaoNhieu = 1) {
  const co = new Map(hang.map(h => [h.kho.trim().toUpperCase(), h.con]));
  for (const k of uuTien) {
    const con = co.get(k.trim().toUpperCase());
    if (Number.isFinite(con) && con >= canBaoNhieu) return { kho: k, con };
  }
  const tom = hang.map(h => `${h.kho}=${h.con}`).join(', ') || '(khong co dong nao)';
  throw new Error(`KHONG kho nao du hang (can ${canBaoNhieu}). Ton kho hien co: ${tom}. ` +
                  `Thu tu uu tien: ${uuTien.join(' > ')}. -> DUNG va HOI NGUOI DUNG.`);
}
