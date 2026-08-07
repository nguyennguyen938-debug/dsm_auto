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


/* ==========================================================================
 *  TẠO ĐƠN PARCEL — Phần 2 của `7_QuyTrinh_Ground_UPS.md`
 * ------------------------------------------------------------------------
 *  🔴 NĂM ĐIỀU ĐO THẬT 07/08/2026:
 *
 *  1. **`Type` là nhóm TAB, không phải radio.** Ba tab: `Fulfill by Lecangs` ·
 *     `Bill to 3rd party` · `Upload`. Phải bấm tab **`Upload`** thì ô `Carrier` và
 *     `Tracking #` mới hiện ra. Trước đó chúng KHÔNG tồn tại trong DOM.
 *
 *  2. `Address Line1/2` là **`<textarea>`**, không phải `<input>`.
 *
 *  3. Các ô chọn là **Ant Design Select** — phải gõ vào ô tìm rồi bấm dòng trong
 *     danh sách bật ra, `selectOption()` KHÔNG dùng được.
 *
 *  4. ⛔ **`Save & Submit` TẠO ĐƠN THẬT trên Lecangs.** Hàm này mặc định DỪNG trước
 *     nút đó. Muốn gửi thật phải truyền `guiThat: true` — cố ý làm khó.
 *
 *  5. Quy trình: **mỗi Tracking Number = MỘT đơn Lecangs riêng**, `Shipment Qty`
 *     luôn `1`. Đơn có 3 tracking number thì lặp hàm này 3 lần.
 * ======================================================================== */

const TRANG_TAO = 'https://app.lecangs.com/oms/parcelOrder/add?type=add';

const F = {
  kho:        'form_item_warehouseCode',
  platform:   'form_item_platform',
  po:         'form_item_poNo',
  platformNo: 'form_item_platformNo',
  ten:        'form_item_name',
  dienThoai:  'form_item_phone',
  quocGia:    'form_item_countryCode',
  bang:       'form_item_province',
  city:       'form_item_city',
  zip:        'form_item_postalCode',
  diaChi1:    'form_item_street1',
  diaChi2:    'form_item_street2',
  carrier:    'form_item_omsTocOrderExpressInfoVo_carrierName',
  tracking:   'form_item_omsTocOrderExpressInfoVo_trackingNo'
};

/** Gõ vào ô thường rồi ĐỌC LẠI KIỂM (cùng lý do với `go()` bên ups-form.mjs). */
async function dien(page, id, giaTri) {
  const o = page.locator(`#${id}`).first();
  const mong = String(giaTri ?? '');
  for (let i = 0; i < 3; i++) {
    await o.click(); await o.fill('');
    if (mong) await o.pressSequentially(mong, { delay: 40 });
    await page.waitForTimeout(900);
    if ((await o.inputValue()) === mong) return;
  }
  throw new Error(`Lecangs: o "${id}" ghi 3 lan van sai (muon "${mong}", dang "${await o.inputValue()}")`);
}

/**
 * Ant Select: bấm mở, gõ tìm, rồi bấm dòng khớp TUYỆT ĐỐI trong danh sách bật ra.
 *
 * 🔴 PHẢI bấm vào **vỏ** `.ant-select-selector`, KHÔNG bấm vào `input#...` bên trong:
 *    ô input đó bị lớp phủ của Ant che, Playwright chờ mãi rồi timeout 30 s.
 *    (Gặp 07/08 — `locator.click: Timeout 30000ms exceeded` ở ô Delivery Warehouse.)
 */
async function chon(page, id, nhan, { khopRieng = null } = {}) {
  const vo = page.locator(`.ant-select:has(#${id}) .ant-select-selector`).first();
  await vo.click({ timeout: 20000 });
  await page.waitForTimeout(1200);
  await page.locator(`#${id}`).fill('');
  await page.locator(`#${id}`).pressSequentially(nhan, { delay: 60 });
  await page.waitForTimeout(2500);
  const dong = page.locator('.ant-select-item-option-content').filter({ hasText: nhan });
  const n = await dong.count();
  if (!n) throw new Error(`Lecangs: chon "${id}" — khong thay dong nao khop "${nhan}"`);
  // khớp TUYỆT ĐỐI, hoặc theo luật riêng nếu bên gọi truyền vào
  for (let i = 0; i < n; i++) {
    const t = (await dong.nth(i).innerText()).trim();
    if (khopRieng ? khopRieng(t) : t === nhan) { await dong.nth(i).click(); await page.waitForTimeout(1500); return t; }
  }
  const ds = [];
  for (let i = 0; i < Math.min(n, 5); i++) ds.push((await dong.nth(i).innerText()).trim());
  throw new Error(`Lecangs: "${id}" co ${n} dong chua "${nhan}" nhung KHONG dong nao khop — thay: ${JSON.stringify(ds)}`);
}

/**
 * Tạo MỘT đơn parcel Lecangs cho MỘT Tracking Number.
 *
 * @param don {kho, po, tenKhach, dienThoai, bang, city, zip, diaChi1, diaChi2,
 *             tracking, duongDanLabel, sku}
 * @param guiThat  ⛔ `true` mới bấm `Save & Submit`. Mặc định `false` = chỉ điền rồi dừng.
 */
export async function taoDonParcel(page, don, { guiThat = false, log = () => {} } = {}) {
  for (const k of ['kho', 'po', 'tenKhach', 'bang', 'city', 'zip', 'diaChi1', 'tracking']) {
    if (!don[k]) throw new Error(`taoDonParcel: thieu "${k}"`);
  }
  await page.goto(TRANG_TAO, { waitUntil: 'domcontentloaded', timeout: 70000 });
  await page.waitForTimeout(14000);

  log('chon kho'); await chon(page, F.kho, don.kho);
  log('chon platform'); await chon(page, F.platform, 'The Home Depot');   // tài liệu: LUÔN
  log('dien po'); await dien(page, F.po, don.po);
  log('dien platformNo'); await dien(page, F.platformNo, don.po);   // tài liệu: cũng là số PO

  log('dien ten'); await dien(page, F.ten, don.tenKhach);
  if (don.dienThoai) await dien(page, F.dienThoai, don.dienThoai);
  log('chon quocGia'); await chon(page, F.quocGia, 'United States (the)');  // tài liệu: đúng chuỗi này
  // 🔴 CHỌN COUNTRY XONG, ô `State` BIẾN THÀNH Ant Select (City/Zip vẫn là ô thường).
  //    Đo 07/08: trước khi chọn nước, `form_item_province` là INPUT thường; sau khi chọn
  //    "United States (the)" nó bị bọc `.ant-select` và bị `.ant-select-selection-item` che
  //    -> `fill()` treo 30 s rồi timeout. Phải dùng `chon()`, không dùng `dien()`.
  //    Cũng còn một dropdown treo lại (`lopPhu: 1`) — bấm Escape cho rơi xuống.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  const bangLaSelect = await page.evaluate(i => !!document.getElementById(i)?.closest('.ant-select'), F.bang);
  log('dien bang (' + (bangLaSelect ? 'select' : 'o thuong') + ')');
  // 🔴 Nhãn bang trên Lecangs là dạng `Texas【TX】` — ngoặc vuông TOÀN RỘNG 【】,
  //    không phải `TX` trần. Khớp theo mã trong ngoặc.
  if (bangLaSelect) await chon(page, F.bang, don.bang, { khopRieng: t => t.endsWith(`\u3010${don.bang}\u3011`) });
  else              await dien(page, F.bang, don.bang);
  log('dien city'); await dien(page, F.city, don.city);
  log('dien zip');  await dien(page, F.zip,  don.zip);
  log('dien diaChi1'); await dien(page, F.diaChi1, don.diaChi1);
  await dien(page, F.diaChi2, don.diaChi2 || '');

  // Type: PHẢI bấm tab Upload thì Carrier/Tracking mới hiện — điều 1 ở đầu khối
  log('bam tab Upload'); await page.locator('.ant-tabs-tab-btn').filter({ hasText: /^Upload$/ }).first().click({ timeout: 20000 });
  await page.waitForTimeout(6000);
  log('chon carrier'); await chon(page, F.carrier, 'UPS');   // tài liệu: LUÔN
  log('dien tracking'); await dien(page, F.tracking, don.tracking);

  const daDien = await page.evaluate(f => {
    const v = i => (document.getElementById(i) || {}).value ?? null;
    return Object.fromEntries(Object.entries(f).map(([k, i]) => [k, v(i)]));
  }, F);

  if (!guiThat) {
    return { daDien, daGui: false,
      ghiChu: 'CHUA bam "Save & Submit" — con thieu: upload file label, "Add the goods" ' +
              '(SKU + Shipment Qty = 1). Truyen guiThat:true khi da san sang tao don THAT.' };
  }
  throw new Error('taoDonParcel: guiThat=true nhung buoc upload file va "Add the goods" CHUA VIET — khong duoc submit thieu du lieu');
}

export { F as O_LECANGS };
