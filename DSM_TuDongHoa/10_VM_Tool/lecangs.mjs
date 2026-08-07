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
 *
 *  6. **Danh sách `Carrier` RỖNG nếu chưa chọn `Delivery Warehouse`.** Đo 07/08: mở ô
 *     Carrier khi chưa chọn kho -> `.ant-select-item-empty`, không một dòng nào.
 *     Nên thứ tự điền KHÔNG ĐƯỢC ĐẢO: kho trước, carrier sau.
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
  tracking:   'form_item_omsTocOrderExpressInfoVo_trackingNo',
  fileLabel:  'form_item_planningNo',      // nhãn "Upload the Label" — KHÔNG phải omsTocFiles
  fileDinhKem:'form_item_omsTocFiles'      // nhãn "Attachments" — không dùng
};

/**
 * Điền dòng hàng vừa thêm bằng "Add the goods".
 * Quy trình: **Shipment Qty LUÔN = 1**, HS code để trống.
 * Mỗi Tracking Number là một đơn riêng nên mỗi đơn chỉ có đúng một dòng.
 */
async function dienDongHang(page, sku) {
  await dongPopup(page);
  const bang = page.locator('table:has(th:text-is("Shipment Qty"))').first();
  if (!await bang.count()) throw new Error('Lecangs: khong thay bang hang sau khi bam "Add the goods"');
  const dong = bang.locator('tbody tr').last();

  /* 🔴 Ô SKU trong dòng hàng cũng là **Ant Select**, không phải ô nhập thường.
   *    Còn `Shipment Qty` thì LÀ ô thường (placeholder "Shipment Qty").
   *    Đo 07/08 — trước đó tôi tưởng cả hai đều là input nên click treo 30 s. */
  const voSku = dong.locator('td').first().locator('.ant-select-selector').first();
  await voSku.click({ timeout: 20000 });
  await page.waitForTimeout(1200);
  await page.keyboard.press('Control+A');
  await page.keyboard.type(String(sku), { delay: 60 });
  await page.waitForTimeout(3000);

  const opt = page.locator('.ant-select-item-option-content');
  const n = await opt.count();
  if (!n) throw new Error(`Lecangs: go SKU "${sku}" nhung danh sach rong — SKU nay co trong kho da chon khong?`);
  let daChon = null;
  for (let i = 0; i < n; i++) {
    const t = (await opt.nth(i).innerText()).trim();
    if (t === String(sku) || t.startsWith(String(sku) + ' ')) { await opt.nth(i).click(); daChon = t; break; }
  }
  if (!daChon) {
    const ds = [];
    for (let i = 0; i < Math.min(n, 5); i++) ds.push((await opt.nth(i).innerText()).trim());
    throw new Error(`Lecangs: khong dong nao khop SKU "${sku}" — thay: ${JSON.stringify(ds)}`);
  }
  await page.waitForTimeout(2500);
  await dongDropdown(page);

  // Shipment Qty LUÔN = 1 (quy trình: mỗi Tracking Number một đơn riêng)
  const oQty = dong.locator('input[placeholder="Shipment Qty"]').first();
  if (!await oQty.count()) throw new Error('Lecangs: khong thay o "Shipment Qty" trong dong hang');
  await oQty.click({ timeout: 15000 });
  await oQty.fill('1');
  await page.waitForTimeout(1500);

  return { sku: daChon, qty: await oQty.inputValue() };
}

/** Popup đã biết là quảng cáo, tắt đi không mất gì. Thêm dòng mới khi gặp cái khác. */
const POPUP_VO_HAI = [/^Try New Feature$/i];

/**
 * Đóng popup quảng cáo của Lecangs.
 *
 * 🔴 THỦ PHẠM THẬT của mọi `Timeout 30000ms` khi điền form (tìm ra 07/08 sau nhiều vòng
 *    đoán sai). Lecangs bật một hộp thoại **"Try New Feature"** (`.ant-modal-wrap`) vài
 *    giây sau khi tải trang. Nó **phủ kín form**: `elementFromPoint` ngay trên ô
 *    Delivery Warehouse trả về `DIV.ant-modal-wrap`.
 *    Vì nó bật lên CHẬM và KHÔNG cố định thời điểm, mỗi lần chạy lại chết ở một ô khác —
 *    nên tôi đã lần lượt đổ nhầm cho dropdown treo, cho lớp phủ Ant Select, cho React.
 *    → Gọi hàm này sau khi vào trang VÀ trước các bước dài.
 */
export async function dongPopup(page) {
  for (let lan = 0; lan < 3; lan++) {
    const hop = await page.evaluate(() => {
      const m = document.querySelector('.ant-modal-wrap:not([style*="display: none"])');
      if (!m) return null;
      return { tieuDe: (m.querySelector('.ant-modal-title')?.textContent || '').trim(),
               chu: (m.innerText || '').replace(/\s+/g, ' ').slice(0, 200) };
    });
    if (!hop) return lan > 0;

    /* ⛔ CHỈ đóng đúng popup ĐÃ BIẾT là vô hại.
     * Bản đầu đóng BẤT KỲ `.ant-modal-wrap` nào — nếu Lecangs bật một hộp XÁC NHẬN
     * ("đơn này trùng, có tiếp tục không?") thì hàm sẽ bấm tắt nó mà không ai biết,
     * rồi chạy tiếp như không có gì. Đó là lỗi nguy hiểm hơn hẳn một cái timeout. */
    if (!POPUP_VO_HAI.some(re => re.test(hop.tieuDe))) {
      throw new Error(`Lecangs: hop thoai LA dang chan form — tieu de "${hop.tieuDe}". ` +
                      `Noi dung: ${hop.chu} -> DUNG va HOI NGUOI DUNG, khong tu dong tat.`);
    }
    await page.locator('.ant-modal-close').first().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }
  return true;
}

/**
 * Đóng mọi dropdown Ant còn treo.
 *
 * 🔴 `page.keyboard.press('Escape')` KHÔNG đóng được — đo 07/08: sau Escape vẫn còn
 *    `.ant-select-dropdown:not(.ant-select-dropdown-hidden)` và nó ĐÈ lên ô bên dưới,
 *    làm `fill()` treo đủ 30 s rồi timeout. Phải bấm ra vùng trống cho nó mất focus.
 */
async function dongDropdown(page) {
  for (let i = 0; i < 3; i++) {
    const con = await page.evaluate(() =>
      document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').length);
    if (!con) return;
    await page.mouse.click(8, 8);          // góc trên trái, ngoài mọi ô nhập
    await page.waitForTimeout(1200);
  }
}

/** Gõ vào ô thường rồi ĐỌC LẠI KIỂM (cùng lý do với `go()` bên ups-form.mjs). */
async function dien(page, id, giaTri) {
  await dongPopup(page);
  const o = page.locator(`#${id}`).first();
  const mong = String(giaTri ?? '');

  // Cách thường: gõ như người.
  for (let i = 0; i < 2; i++) {
    try {
      await o.click({ timeout: 8000 });
      await o.fill('', { timeout: 8000 });
      if (mong) await o.pressSequentially(mong, { delay: 40 });
      await page.waitForTimeout(900);
      if ((await o.inputValue()) === mong) return;
    } catch { /* bi che -> thu cach duoi */ }
  }

  /* 🔴 ĐƯỜNG DỰ PHÒNG — đặt giá trị bằng JS.
   * Một số ô của Lecangs bị lớp phủ Ant che đúng lúc, `fill()` treo đủ 30 s rồi timeout
   * (gặp 07/08 ở ô `Tracking #`, ngay sau khi chọn Carrier). Bấm Escape và bấm ra vùng
   * trống đều KHÔNG cứu được.
   * React không nhận `el.value = x` trần — phải gọi setter gốc của prototype rồi bắn
   * sự kiện `input`, nếu không state của React vẫn là chuỗi rỗng và giá trị bị xoá lại. */
  await page.evaluate(({ i, v }) => {
    const e = document.getElementById(i);
    if (!e) throw new Error('khong thay o ' + i);
    const setter = Object.getOwnPropertyDescriptor(
      e.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
                               : window.HTMLInputElement.prototype, 'value').set;
    setter.call(e, v);
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
  }, { i: id, v: mong });
  await page.waitForTimeout(1500);

  const that = await o.inputValue();
  if (that !== mong) throw new Error(`Lecangs: o "${id}" ghi khong duoc (muon "${mong}", dang "${that}")`);
}

/**
 * Ant Select: bấm mở, gõ tìm, rồi bấm dòng khớp TUYỆT ĐỐI trong danh sách bật ra.
 *
 * 🔴 PHẢI bấm vào **vỏ** `.ant-select-selector`, KHÔNG bấm vào `input#...` bên trong:
 *    ô input đó bị lớp phủ của Ant che, Playwright chờ mãi rồi timeout 30 s.
 *    (Gặp 07/08 — `locator.click: Timeout 30000ms exceeded` ở ô Delivery Warehouse.)
 */
async function chon(page, id, nhan, { khopRieng = null } = {}) {
  await dongPopup(page);      // popup co the bat len bat cu luc nao
  const vo = page.locator(`.ant-select:has(#${id}) .ant-select-selector`).first();
  await vo.click({ timeout: 20000 });
  await page.waitForTimeout(1200);
  /* 🔴 KHONG dung `page.locator('#id').fill()` o day: o tim ben trong Ant Select bi lop phu
   * che, `fill()` treo du 30 s roi timeout (gap 07/08 o o Carrier — va toi da doc nham
   * thanh loi cua o Tracking # ben duoi, mat mot vong sua sai cho).
   * Mo select xong thi con tro da nam trong o tim -> go thang bang ban phim. */
  await page.keyboard.press('Control+A');
  await page.keyboard.type(nhan, { delay: 60 });
  await page.waitForTimeout(2500);
  const dong = page.locator('.ant-select-item-option-content').filter({ hasText: nhan });
  const n = await dong.count();
  if (!n) throw new Error(`Lecangs: chon "${id}" — khong thay dong nao khop "${nhan}"`);
  // khớp TUYỆT ĐỐI, hoặc theo luật riêng nếu bên gọi truyền vào
  for (let i = 0; i < n; i++) {
    const t = (await dong.nth(i).innerText()).trim();
    if (khopRieng ? khopRieng(t) : t === nhan) {
      await dong.nth(i).click();
      await page.waitForTimeout(1500);
      await dongDropdown(page);       // xem chú thích hàm — Escape KHÔNG đủ
      return t;
    }
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
  if (await dongPopup(page)) log('da dong popup "Try New Feature"');

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
  await dongDropdown(page);
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

  // --- Upload file shipping label ---
  // 🔴 Trang có HAI ô file. Chọn đúng ô nhãn "Upload the Label":
  //      #form_item_planningNo   accept ".png,.pdf,.jpg,.jpeg,.gif,.zpl"  <- ĐÚNG
  //      #form_item_omsTocFiles  accept ".pdf"  nhãn "Attachments"        <- SAI
  //    Dùng setInputFiles thẳng vào input ẩn, không cần bấm "Click on the Upload".
  if (don.duongDanLabel) {
    log('upload label');
    await page.setInputFiles(`#${F.fileLabel}`, don.duongDanLabel);
    await page.waitForTimeout(9000);
  }

  // --- Add the goods: thêm MỘT dòng hàng ---
  // Không phải hộp thoại mà là DÒNG trong bảng: SKU · Name of Goods · Available Quantity ·
  // Shipment Qty · Unit Price · HS Code · Action.
  let hang = null;
  if (don.sku) {
    log('add the goods');
    await page.locator('button').filter({ hasText: 'Add the goods' }).first().click({ timeout: 20000 });
    await page.waitForTimeout(7000);
    hang = await dienDongHang(page, don.sku);   // Shipment Qty LUÔN = 1 (quy trình)
  }

  /* 🔴 Đọc lại cho ĐÚNG: với ô Ant Select, `input.value` LUÔN RỖNG — đó chỉ là ô tìm.
   *    Giá trị đã chọn nằm ở `.ant-select-selection-item`. Đọc nhầm chỗ sẽ báo "trống"
   *    cho cả 5 ô kho/platform/country/state/carrier dù chúng đã điền đúng. */
  const daDien = await page.evaluate(f => {
    const doc = i => {
      const e = document.getElementById(i);
      if (!e) return null;
      const sel = e.closest('.ant-select');
      if (sel) return (sel.querySelector('.ant-select-selection-item')?.textContent || '').trim();
      if (e.type === 'file') return e.files?.length ? e.files[0].name : '';
      return e.value ?? null;
    };
    return Object.fromEntries(Object.entries(f).map(([k, i]) => [k, doc(i)]));
  }, F);

  if (!guiThat) {
    return { daDien, hang, daGui: false,
      ghiChu: 'Da dien XONG toan bo. CHUA bam "Save & Submit" — do la buoc tao don THAT ' +
              'tren Lecangs. Truyen guiThat:true khi that su muon gui.' };
  }
  /* ⛔ Bấm nút này là TẠO ĐƠN THẬT trên Lecangs. */
  log('SAVE & SUBMIT (tao don THAT)');
  await dongPopup(page);
  await page.locator('button').filter({ hasText: /^Save & Submit$/ }).first().click({ timeout: 25000 });
  await page.waitForTimeout(12000);
  return { daDien, hang, daGui: true, url: page.url() };
}

export { F as O_LECANGS };
