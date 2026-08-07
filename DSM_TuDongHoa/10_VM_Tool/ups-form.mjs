/**
 * ============================================================================
 *  ups-form.mjs — điền form Create a Shipment trên UPS (nhánh đơn GROUND)
 * ----------------------------------------------------------------------------
 *  Quy trình: `01_HuongDan_VanHanh/7_QuyTrinh_Ground_UPS.md`.
 *
 *  🔴 SÁU ĐIỀU BẮT BUỘC — đo thật 07/08/2026:
 *
 *  1. **DÙNG GIAO DIỆN CŨ** (người dùng chốt 07/08). `ups.com/ship` nay mở giao diện MỚI
 *     (5 mục dồn một trang). Phải bấm `button#go-back-to-previous-experience-btn` rồi
 *     xác nhận **Yes** để về `/ship/guided/destination`.
 *     ⛔ Hộp thoại xác nhận dùng **shadow DOM đóng** — `querySelectorAll`, `getByRole`,
 *        `getByText` đều KHÔNG thấy nút Yes. **Chưa bấm được bằng code, phải bấm tay
 *        trong VNC.** `vaoFormCu()` dừng và báo rõ khi gặp.
 *
 *  2. URL chứa `?tx=<mã phiên>` — **KHÔNG hard-code**, luôn đi từ dashboard vào.
 *
 *  3. **ZIP / City / State chỉ hiện sau khi bấm `Edit Address - Add Suite/Apt.`**
 *     (`button#destination-singleLineAddressEditButton`). Trước đó form chỉ có một ô
 *     gộp `cac_singleLineAddress`. Không bấm là không bao giờ thấy ô ZIP.
 *
 *  4. **`id` CÓ THỂ TRÙNG.** `#go-back-to-previous-experience-btn` khớp 2 phần tử (thẻ bọc
 *     Angular + button thật). Luôn ghi rõ thẻ: `button#...`. Đây là lần thứ ba dự án gặp
 *     họ bẫy này (2 nút `Continue` ở Auth0, 3 phần tử "Go" trên DSM).
 *
 *  5. **PHẢI chạy qua `moContextCDP()`** — Playwright tự khởi chạy thì Akamai chặn.
 *     Và **KHÔNG gọi `xoaCookieAkamai()` khi phiên đang sống** — nó xoá luôn cookie phiên.
 *
 *  6. Điền xong Mục 1 mới bấm `button#nbsBackForwardNavigationContinueButton`.
 *     ⚠️ Sau Continue hiện bảng *"Is this a residential address?"* — CHƯA KHẢO SÁT.
 * ==========================================================================*/

/* --- Mục 1 "Where": id lấy từ nhãn thật trên trang, khớp đúng tài liệu --- */
const O = {
  savedAddresses: 'select#destination-agent_savedAddresses',   // Saved Addresses
  country:        'select#destination-cac_country',            // Country or Territory
  tenKhach:       'input#destination-cac_companyOrName',       // Full Name or Company Name
  tenLienHe:      'input#destination-cac_contactName',         // Contact Name
  diaChi1:        'input#destination-cac_addressLine1',
  diaChi2:        'input#destination-cac_addressLine2',
  zip:            'input#destination-cac_postalCode',
  city:           'input#destination-cac_city',
  state:          'select#destination-cac_state',
  dienThoai:      'input#destination-cac_recipient_phone',
  moRongDiaChi:   'button#destination-singleLineAddressEditButton',
  suaKhoGui:      'button#nbsDestinationPageEditOriginAndReturnButton',
  tiepTuc:        'button#nbsBackForwardNavigationContinueButton',
  huy:            'button#nbsBackForwardNavigationCancelShipmentButton'
};

const DASHBOARD = 'https://www.ups.com/ppc/dashboard.html?loc=en_US#/companyDashboard';

/** Gõ như người — form Angular của UPS không phải lúc nào cũng nhận `fill()`. */
async function go(page, chon, giaTri) {
  const o = page.locator(chon).first();
  await o.click();
  await o.fill('');
  if (giaTri) await o.pressSequentially(String(giaTri), { delay: 45 });
}

/**
 * Đưa trình duyệt tới form CŨ `/ship/guided/destination`.
 * Ném lỗi kèm hướng dẫn nếu rơi vào giao diện mới (vì hộp thoại xác nhận
 * dùng shadow DOM đóng, chưa bấm được bằng code — xem điều 1 ở đầu file).
 */
export async function vaoFormCu(page) {
  if (/\/ship\/guided\//.test(page.url())) return { ok: true, daSan: true };

  await page.goto(DASHBOARD, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(12000);
  const nut = page.locator('a', { hasText: /Create a Shipment/i }).first();
  if (!await nut.count()) throw new Error('UPS: khong thay nut "Create a Shipment" tren dashboard — con phien khong?');
  await nut.click({ timeout: 25000 });
  await page.waitForTimeout(25000);

  if (/\/ship\/guided\//.test(page.url())) return { ok: true, daSan: false };

  throw new Error(
    'UPS mo GIAO DIEN MOI (' + page.url().slice(0, 70) + '). Phai chuyen ve giao dien cu, ' +
    'nhung hop thoai xac nhan dung SHADOW DOM DONG nen KHONG bam duoc bang code. ' +
    '-> Vao VNC bam tay: nut "Go to Previous Experience" roi bam "Yes". Xong chay lai.');
}

/**
 * Mục 1 — Where: điền địa chỉ người nhận.
 *
 * @param don {tenKhach, tenLienHe, diaChi1, diaChi2, city, zip, state, dienThoai}
 *        Luật `diaChi1`/`diaChi2` KHÁC nhau giữa store và khách lẻ — xem tài liệu:
 *          store    : diaChi1 = phần "C/O ...", diaChi2 = địa chỉ đường phố
 *          khách lẻ : diaChi1 = địa chỉ đường phố, diaChi2 = trống
 *        `ground-tra.diaChiGiao()` đã tách sẵn theo luật này.
 *
 * ⚠️ City LUÔN ghi đè bằng City trong packing slip. Điền ZIP xong UPS tự điền City,
 *    nhưng tài liệu chốt: cứ ghi đè, không cần kiểm đúng sai.
 */
export async function dienNoiNhan(page, don) {
  if (!/\/ship\/guided\/destination/.test(page.url())) {
    throw new Error(`dienNoiNhan: dang khong o trang destination (${page.url().slice(0, 70)})`);
  }
  for (const k of ['tenKhach', 'diaChi1', 'city', 'zip', 'state', 'dienThoai']) {
    if (!don[k]) throw new Error(`dienNoiNhan: thieu "${k}"`);
  }

  // ZIP/City/State chỉ hiện sau khi mở rộng — điều 3 ở đầu file.
  if (!await page.locator(O.zip).count()) {
    await page.locator(O.moRongDiaChi).click({ timeout: 25000 });
    await page.waitForTimeout(7000);
  }
  if (!await page.locator(O.zip).count()) {
    throw new Error('UPS: bam "Edit Address - Add Suite/Apt." roi ma van khong thay o ZIP');
  }

  await go(page, O.tenKhach,  don.tenKhach);
  await go(page, O.tenLienHe, don.tenLienHe || don.tenKhach);   // tài liệu: giống Full Name
  await go(page, O.diaChi1,   don.diaChi1);
  await go(page, O.diaChi2,   don.diaChi2 || '');
  await go(page, O.zip,       don.zip);
  await page.waitForTimeout(4000);        // UPS tự điền City sau khi có ZIP
  await go(page, O.city,      don.city);  // rồi mình GHI ĐÈ bằng City trên slip
  await page.selectOption(O.state, don.state).catch(async () => {
    // một số bang UPS dùng tên đầy đủ thay vì mã 2 chữ
    await page.selectOption(O.state, { label: don.state });
  });
  await go(page, O.dienThoai, don.dienThoai);

  return docLaiNoiNhan(page);
}

/** Đọc lại những gì vừa điền — để đối chiếu trước khi bấm Continue. */
export async function docLaiNoiNhan(page) {
  return page.evaluate(o => {
    const v = s => (document.querySelector(s) || {}).value ?? null;
    return { tenKhach: v(o.tenKhach), tenLienHe: v(o.tenLienHe), diaChi1: v(o.diaChi1),
             diaChi2: v(o.diaChi2), zip: v(o.zip), city: v(o.city), state: v(o.state),
             dienThoai: v(o.dienThoai) };
  }, O);
}

export { O as O_UPS };
