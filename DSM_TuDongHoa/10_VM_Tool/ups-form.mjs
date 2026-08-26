/**
 * ============================================================================
 *  ups-form.mjs — điền form Create a Shipment trên UPS (nhánh đơn GROUND)
 * ----------------------------------------------------------------------------
 *  Quy trình: `01_HuongDan_VanHanh/7_QuyTrinh_Ground_UPS.md`.
 *
 *  🔴 SÁU ĐIỀU BẮT BUỘC — đo thật 07/08/2026:
 *
 *  1. **DÙNG GIAO DIỆN CŨ** (người dùng chốt 07/08). `ups.com/ship` nay mở giao diện MỚI
 *     (5 mục dồn một trang). `vaoFormCu()` tự chuyển: bấm
 *     `button#go-back-to-previous-experience-btn` rồi `button#prevExperience` trong hộp
 *     xác nhận -> về `/ship/guided/destination`.
 *     ⚠️ Trang có RẤT NHIỀU `[role=dialog]` dựng sẵn trong DOM (Shipping Assistant, Find a
 *        Location, Timed Out, Take a Tour…). **Phải lọc hộp theo NỘI DUNG**, lấy cái đầu
 *        tiên là bắt nhầm sang hộp "Are you sure you want to cancel?".
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
  huy:            'button#nbsBackForwardNavigationCancelShipmentButton',

  /* Hộp "Please tell us a little more about your destination address."
   * 🔴 `id` CHỨA DẤU CHẤM — `#vm.residentialAddressControlId` bị CSS hiểu thành
   *    id `vm` + class `residentialAddressControlId`, KHÔNG khớp gì cả.
   *    Bắt buộc dùng bộ chọn thuộc tính. */
  residential:    'input[id="vm.residentialAddressControlId"]',
  residentialOK:  'button#nbsAddressClassificationContinue'
};

const DASHBOARD = 'https://www.ups.com/ppc/dashboard.html?loc=en_US#/companyDashboard';

/* --- Ship From: chọn kho gửi --- */
const KHO = {
  moSua:   'button#nbsDestinationPageEditOriginAndReturnButton',  // nút Edit canh "Ship From"
  chon:    'select#origin-agent_myAddresses',                     // "My Addresses"
  taiKhoan:'select#nbsShipperAccountListSwitcherOrigin',
  tiepTuc: 'button#nbsBackForwardNavigationContinueButton'
};

/** So tên kho bỏ qua khác biệt `-` / khoảng trắng / hoa thường. */
const chuanKho = t => String(t).toUpperCase().replace(/[\s_-]+/g, '');

/**
 * Gõ vào một ô rồi **ĐỌC LẠI KIỂM**, sai thì gõ lại (tối đa 3 lần).
 *
 * 🔴 VÌ SAO PHẢI KIỂM — bằng chứng thật 07/08/2026:
 *    Điền `128` vào ô Weight, đọc lại ra **`8`** — mất hai chữ số đầu. Gõ lại bằng cả 4
 *    cách (pressSequentially 45ms/200ms, fill(), keyboard.type) thì đều ra `128`, tức
 *    KHÔNG phải lỗi cách gõ mà là **đua tranh với Angular**: form đang dựng lại thì
 *    ký tự đầu rơi mất. Ghi một lần rồi tin là sai — cân nặng `128` thành `8` sẽ
 *    tạo shipping label sai mà không ai biết.
 *    (Cùng bài học với `_ghiText_()` bên Apps Script: ghi → flush → ĐỌC LẠI → sửa.)
 */
async function go(page, chon, giaTri, { lan = 3 } = {}) {
  const o = page.locator(chon).first();
  const mong = giaTri === undefined || giaTri === null ? '' : String(giaTri);
  for (let i = 0; i < lan; i++) {
    await o.click();
    await o.fill('');
    if (mong) await o.pressSequentially(mong, { delay: 45 });
    await page.waitForTimeout(1200);
    if ((await o.inputValue()) === mong) return mong;
  }
  const that = await o.inputValue();
  throw new Error(`UPS: o "${chon}" ghi ${lan} lan van khong dung — muon "${mong}", dang "${that}"`);
}

/**
 * Đưa trình duyệt tới form CŨ `/ship/guided/destination`.
 * Ném lỗi kèm hướng dẫn nếu rơi vào giao diện mới (vì hộp thoại xác nhận
 * dùng shadow DOM đóng, chưa bấm được bằng code — xem điều 1 ở đầu file).
 */
export async function vaoFormCu(page, { batBuocMoi = false } = {}) {
  /* `batBuocMoi` = bỏ shipment đang dở, mở một cái MỚI (`tx` mới).
   * 🔴 Cần cho đường thử lại: URL mang `?tx=<mã phiên shipment>`. Nếu lần trước hỏng giữa
   *    chừng thì chính `tx` đó đã hỏng — dùng lại nó thì lần nào cũng chết đúng chỗ cũ.
   *    (Đo 08/08: retry tái dùng `tx` cũ -> cả 3 lần cùng timeout một chỗ.) */
  if (!batBuocMoi && /\/ship\/guided\//.test(page.url())) return { ok: true, page, daSan: true };

  /* 🔴 Nút "Create a Shipment" trên dashboard mở TAB MỚI (`target=_blank`).
   *    Trang cũ ở lại dashboard -> mọi thao tác sau đó tác động NHẦM TRANG và timeout
   *    một cách khó hiểu (gặp 08/08). Phải bắt tab mới rồi làm việc trên nó.
   *    Vì vậy hàm này TRẢ VỀ `page` — bên gọi phải dùng trang trả về, không dùng lại
   *    trang đã truyền vào. */
  if (batBuocMoi || !/\/ship\b/.test(page.url())) {
    await page.goto(DASHBOARD, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(12000);
    /* 🔴 Dashboard co BA link "Create a Shipment", HAI cai DAU BI AN.
     *    `.first()` bat phai cai an -> click timeout (gap 08/08). Lay cai NHIN THAY DUOC.
     *    Day la lan thu tu du an gap ho bay nay: 2 nut Continue o Auth0, 2 the trung id
     *    #go-back-to-previous-experience-btn, 3 phan tu "Go" tren DSM. */
    const dsNut = page.locator('a', { hasText: /Create a Shipment/i });
    let nut = null;
    for (let i = 0; i < await dsNut.count(); i++) {
      if (await dsNut.nth(i).isVisible().catch(() => false)) { nut = dsNut.nth(i); break; }
    }
    if (!nut) throw new Error('UPS: khong thay link "Create a Shipment" NHIN THAY DUOC tren dashboard — con phien khong?');
    const ctx = page.context();
    const [moi] = await Promise.all([
      ctx.waitForEvent('page', { timeout: 40000 }).catch(() => null),
      nut.click({ timeout: 25000 })
    ]);
    if (moi) { page = moi; await page.waitForLoadState('domcontentloaded').catch(() => {}); }
    await page.waitForTimeout(25000);
  }

  if (/\/ship\/guided\//.test(page.url())) return { ok: true, page, daSan: false };

  /* Rơi vào GIAO DIỆN MỚI -> chuyển về giao diện cũ.
   *
   * 🔴 Bản trước ghi "hộp thoại xác nhận dùng shadow DOM đóng, không bấm được bằng code".
   *    SAI — sửa 08/08. Hai chỗ tôi nhầm:
   *      · tìm nút chữ "Yes"/"No", trong khi nút thật ghi "Return to Previous Experience"
   *      · bắt nhầm sang hộp "Are you sure you want to cancel?" (trang có RẤT NHIỀU
   *        `[role=dialog]` ẩn sẵn trong DOM — phải lọc theo NỘI DUNG, không lấy cái đầu)
   *    Nút thật: `button#prevExperience`, nằm ngay trong DOM thường. */
  // Bấm thẳng theo id — lồng locator qua `[role=dialog]` bị treo (Playwright coi hộp là
  // chưa ổn định). Kiểm nội dung hộp riêng để chắc đúng hộp, rồi bấm nút bằng id.
  /* Giao dien MOI bat hop "Take a Tour of the Updated Shipping Experience" ngay khi vao,
   * no CHE nut chuyen giao dien -> click timeout 25 s (gap 08/08). Dong no truoc. */
  for (const ch of ['button#upsModal--close', 'button:has-text("Skip Tour")']) {
    const n = page.locator(ch).first();
    if (await n.count() && await n.isVisible().catch(() => false)) {
      await n.click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(3000);
    }
  }
  const timHop = () => page.locator('button#prevExperience');
  // Hộp có thể ĐANG MỞ SẴN (lần chạy trước bỏ dở). Lúc đó nó CHE mất nút bên dưới,
  // bấm nút sẽ timeout — nên kiểm hộp trước, có rồi thì dùng luôn.
  if (!await timHop().count()) {
    await page.locator('button#go-back-to-previous-experience-btn').click({ timeout: 25000 });
    await page.waitForTimeout(9000);
  }
  const dungHop = await page.evaluate(() => [...document.querySelectorAll('[role=dialog]')]
    .some(e => /return to the previous shipping experience/i.test(e.innerText || '')));
  if (!dungHop) throw new Error('UPS: khong thay hop xac nhan doi giao dien');
  /* Bấm bằng JS: `click()` của Playwright — kể cả `force:true` — vẫn rơi vào lớp phủ của
   * hộp thoại nên handler không chạy (đo 08/08: bấm xong hộp vẫn mở nguyên).
   * `el.click()` gọi thẳng handler, không qua hit-test. */
  await page.evaluate(() => document.getElementById('prevExperience')?.click());
  await page.waitForTimeout(26000);

  if (/\/ship\/guided\//.test(page.url())) return { ok: true, page, daSan: false, daChuyen: true };
  throw new Error('UPS: da bam "Return to Previous Experience" nhung van o ' + page.url().slice(0, 70));
}

/**
 * Mục 1 — Where: điền địa chỉ người nhận.
 *
 * @param don {tenKhach, tenLienHe, diaChi1, diaChi2, city, zip, state, dienThoai}
 *        Luật `diaChi1`/`diaChi2` KHÁC nhau giữa store và khách lẻ — xem tài liệu:
 *          store    : diaChi1 = phần "C/O ...", diaChi2 = địa chỉ đường phố
 *          khách lẻ : diaChi1 = địa chỉ đường phố, diaChi2 = trống
 *        ✅ `ground-tra.diaChiGiao(slip.shipTo)` trả về ĐÚNG object này — truyền thẳng vào.
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

/**
 * Bấm Continue ở Mục 1, rồi trả lời hộp "Is this a residential address?".
 *
 * 🔴 Đó KHÔNG phải radio Yes/No mà là **công tắc gạt**: một `<input type=checkbox>` ẩn,
 *    hai chữ Yes/No chỉ là nhãn trang trí (`.ups-lever_switch_yes/_no`).
 *    Đã CHỤP ẢNH cả hai trạng thái để xác minh, không suy đoán:
 *        checked = false -> hiện **No**  (mặc định)
 *        checked = true  -> hiện **Yes**
 *    Tài liệu: `Yes` nếu khách lẻ, `No` nếu store.
 *
 * @param laKhachLe true = khách lẻ (residential), false = store
 */
export async function xacNhanResidential(page, laKhachLe) {
  if (typeof laKhachLe !== 'boolean') {
    throw new Error('xacNhanResidential: phai truyen ro true (khach le) hay false (store)');
  }
  await page.locator(O.tiepTuc).click({ timeout: 25000 });
  await page.waitForTimeout(18000);

  const cong = page.locator(O.residential);
  if (!await cong.count()) {
    /* 🔴 HỘP NÀY KHÔNG PHẢI LÚC NÀO CŨNG HIỆN — đo thật 09/08/2026.
     * Với đơn khách lẻ TX (79850310), bấm Continue xong UPS đi thẳng sang Mục 2
     * (`/ship/guided/package`) mà không hỏi gì. Nhiều khả năng UPS đã tự phân loại
     * được địa chỉ nên bỏ qua bước xác nhận.
     * Bản trước ném lỗi ở đây -> `chayFormUps` thử lại đủ 3 lần, mỗi lần ~3 phút,
     * đốt 10 phút của một phiên chỉ sống 30 phút. Sang được Mục 2 nghĩa là ĐÃ XONG
     * Mục 1, không có gì sai cả. */
    if (/\/ship\/guided\/package/.test(page.url())) {
      return { residential: null, boQua: true, url: page.url(),
               ghiChu: 'UPS khong hoi residential, da sang Muc 2 — coi nhu xong' };
    }
    throw new Error('UPS: bam Continue xong khong thay hop "Is this a residential address?" ' +
                    `va cung KHONG sang Muc 2. Dang o: ${page.url().slice(0, 80)}`);
  }
  // force: input bi che boi lop trang tri nen Playwright coi la khong nhin thay
  if (laKhachLe) await cong.check({ force: true });
  else           await cong.uncheck({ force: true });
  await page.waitForTimeout(2500);

  const that = await cong.isChecked();
  if (that !== laKhachLe) throw new Error(`UPS: dat cong tac residential that bai (muon ${laKhachLe}, dang ${that})`);

  await page.locator(O.residentialOK).click({ timeout: 25000 });
  await page.waitForTimeout(20000);
  return { residential: that, url: page.url() };
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

/* --- Mục 2 "What": mỗi SKU = MỘT package. Hậu tố số = chỉ số package (0,1,2...) --- */
const P = i => ({
  loaiThung:  `select#nbsPackagePackagingTypeDropdown0`.replace('0', i),   // Packaging Type
  soKien:     `select#nbsMultipleIdenticalPackagesDropdown${i}`,           // Total Identical Packages
  canNang:    `input#nbsPackagePackageWeightField${i}`,                    // Weight per Package
  dai:        `input#nbsPackagePackageLengthField${i}`,
  rong:       `input#nbsPackagePackageWidthField${i}`,
  cao:        `input#nbsPackagePackageHeightField${i}`,
  giaTri:     `input#nbsPackageDeclaredValueField${i}`                     // Total Package Value — ĐỂ TRỐNG
});
const REF = {
  bat:  'input#nbsReferenceNumbersBaseOptionSwitch',   // "Add reference numbers" — công tắc gạt
  ref1: 'input#nbsReferenceNumberReference1',          // Reference #1 = số PO
  ref1MoiKien: 'input#nbsReference1CheckboxAllPackages'
};

/**
 * Mục 2 — What: điền một package.
 *
 * Tài liệu: **mỗi SKU = MỘT package**; đơn nhiều SKU thì bấm *Add Another Package*.
 *   Total Identical Packages = Qty Shipped của SKU đó
 *   Weight per Package       = `Carton Weight (lb)` trong `dims_sku.csv` — **KHÔNG cộng 55**
 *                              (55 là pallet của đơn Misc; Ground đi UPS từng thùng lẻ)
 *   Length/Width/Height      = `Carton Len/Wid/Hgt (in)` cùng file
 *   Total Package Value      = ĐỂ TRỐNG
 *   Reference #1             = số PO
 *
 * ⚠️ `Reference #1` chỉ hiện khi công tắc **"Add reference numbers"** đang bật.
 * ⚠️ `traDims()` ném lỗi nếu số liệu = 0 — 125/523 SKU trong file vẫn để 0.
 *    **Đừng bao giờ gửi 0 lên UPS.**
 */
export async function dienPackage(page, i, kien) {
  const o = P(i);
  for (const k of ['soKien', 'canNang', 'dai', 'rong', 'cao']) {
    const v = { soKien: kien.qty, canNang: kien.lb, dai: kien.L, rong: kien.W, cao: kien.H }[k];
    if (v === undefined || v === null || v === '' || Number(v) === 0) {
      throw new Error(`dienPackage[${i}]: "${k}" khong hop le (${v}). Khong gui 0 len UPS.`);
    }
  }
  // 🔴 value cua option la dang Angular "501: 2", KHONG phai "2" -> chon theo NHAN.
  await page.selectOption(o.soKien, { label: String(kien.qty) });
  await go(page, o.canNang, kien.lb);
  await go(page, o.dai,     kien.L);
  await go(page, o.rong,    kien.W);
  await go(page, o.cao,     kien.H);
  // Total Package Value: cố ý KHÔNG điền

  if (kien.po) {
    const bat = page.locator(REF.bat);
    if (await bat.count() && !await bat.isChecked()) {
      await bat.check({ force: true });
      await page.waitForTimeout(3000);
    }
    await go(page, REF.ref1, kien.po);
  }
  return page.evaluate(x => {
    const v = s => (document.querySelector(s) || {}).value ?? null;
    return { soKien: v(x.o.soKien), canNang: v(x.o.canNang), dai: v(x.o.dai),
             rong: v(x.o.rong), cao: v(x.o.cao), giaTri: v(x.o.giaTri), ref1: v(x.ref1) };
  }, { o, ref1: REF.ref1 });
}

/* --- Mục 3 "How": dịch vụ + lịch pickup --- */
const H = {
  lyPickup:   'input#nbsShipmentServicesDropOffPickupViewToggleOption2InputId', // "Schedule a new pickup."
  lyDropOff:  'input#nbsShipmentServicesDropOffPickupViewToggleOption1InputId',
  giaoTanNoi: 'input#nbsShipmentServicesAccessPointViewToggleOption1InputId',   // "No, deliver to receiver."
  suaChiTiet: 'button#nbsPickupToggleEditPickupDetails',
  ngay:       'input#nbsPickupSelectionDatePicker',      // Pickup Date
  somNhat:    'select#nbsPickupEarliestArrivalTime',     // Earliest Pickup Time — LUÔN 1:00 PM
  muonNhat:   'select#nbsPickupLatestArrivalTime',       // Latest Pickup Time — mặc định 5:00 PM
  viTri:      'select#nbsPickupOnSiteLocation',          // Preferred Pickup Location — Warehouse
  thamChieu:  'input#nbsPickupReference'                 // Pickup Reference — số PO
};

/**
 * Mục 3 — How: chọn `Schedule a new pickup`, dịch vụ **UPS Ground**, và lịch pickup.
 *
 * 🔴 **CHỌN UPS GROUND THEO NHÃN, KHÔNG THEO id.** Các ô dịch vụ có id kiểu
 *    `nbsServiceTileServiceRadio<nhóm>_0_<vị trí>` — **phụ thuộc vị trí trong danh sách**,
 *    mà danh sách đổi theo điểm đến và cân nặng. Hôm khảo sát UPS Ground rơi vào
 *    `...Radio3_0_1`, đơn khác sẽ khác. Bám vào id là có ngày chọn nhầm **UPS 3 Day Select**
 *    ở ngay bên cạnh (cùng ngày giao, giá khác hẳn).
 *
 * 🔴 Mấy ô `select` ở đây có value dạng Angular (`"1: Object"`, `"0: 1"`) — **chọn theo NHÃN**.
 *
 * @param ngay   Pickup Date `M/D/YYYY` — tính bằng `ground-tra.ngayPickupGround()`
 * @param po     Pickup Reference
 */
export async function dienPickup(page, { ngay, po }) {
  if (!ngay || !po) throw new Error('dienPickup: thieu ngay hoac po');

  await page.locator(H.lyPickup).check({ force: true });
  await page.waitForTimeout(14000);

  // UPS Ground — tra theo NHÃN, xem cảnh báo ở trên
  const id = await page.evaluate(() => {
    const l = [...document.querySelectorAll('label')]
      .filter(e => /\bUPS Ground\b/i.test(e.innerText || ''))
      .filter(e => /^nbsServiceTileServiceRadio/.test(e.htmlFor || ''));
    return l.length === 1 ? l[0].htmlFor : (l.length ? 'NHIEU:' + l.length : null);
  });
  if (!id) throw new Error('UPS: khong thay o dich vu "UPS Ground" trong danh sach');
  if (id.startsWith('NHIEU:')) throw new Error(`UPS: co ${id.slice(6)} o ghi "UPS Ground" — dung va hoi, khong doan`);
  await page.locator('input#' + id).check({ force: true });
  await page.waitForTimeout(12000);

  await page.locator(H.suaChiTiet).click({ timeout: 25000 });
  await page.waitForTimeout(10000);

  await go(page, H.ngay, ngay);
  await page.selectOption(H.somNhat, { label: '1:00 PM' });   // tài liệu: LUÔN 1:00 PM
  await page.selectOption(H.viTri,   { label: 'Warehouse' });
  await go(page, H.thamChieu, po);

  return page.evaluate(h => {
    const v = s => (document.querySelector(s) || {}).value ?? null;
    const nhan = s => { const e = document.querySelector(s); return e && e.selectedOptions ? e.selectedOptions[0]?.text : null; };
    return { ngay: v(h.ngay), somNhat: nhan(h.somNhat), muonNhat: nhan(h.muonNhat),
             viTri: nhan(h.viTri), thamChieu: v(h.thamChieu) };
  }, H);
}

/* --- Mục 5 "Payment" --- */
const PAY = {
  oBillOther:  'label[for="bill-someone-else-tile"]',                        // ô "Bill Other Account"
  thirdParty:  'input#nbsBillSomeoneElsePaymentMethodRadioList1',            // "Third Party"
  soTaiKhoan:  'input#nbsPaymentAccountTransportationThirdPartyAccountNumberInput',
  zip:         'input#nbsPaymentAccountTransportationThirdPartyPostalCodeInput',
  luuTaiKhoan: 'input#nbsBillSomeoneElseSaveAccountSwitch',                  // để NGUYÊN (không lưu)
  review:      'button#nbsBackForwardNavigationReviewPrimaryButton'
};

/** Hằng số cố định của AllForWood — tài liệu ghi "LUÔN". */
export const TT_TRA_TIEN = { soTaiKhoan: '12C8D2', zip: '92571' };

/**
 * Mục 5 — Payment. `Bill Other Account` + `Third Party` **mặc định đã tích sẵn**
 * (xác nhận 07/08), hàm vẫn kiểm lại chứ không tin.
 *
 * ⚠️ Tài khoản gửi có HAI lựa chọn: `1741XB` và `1741XG` (đang mặc định `1741XG`).
 *    Tài liệu KHÔNG nói dùng cái nào -> hàm này **không đụng vào**, giữ nguyên mặc định.
 *    Cần người dùng chốt.
 *
 * ⛔ Hàm DỪNG ở nút **Review**. KHÔNG bấm `Pay and Get Label(s)` —
 *    đó mới là lúc UPS tạo shipment thật và tính tiền.
 */
export async function dienThanhToan(page, { soTaiKhoan, zip } = TT_TRA_TIEN) {
  const tp = page.locator(PAY.thirdParty);
  if (!await tp.count()) throw new Error('UPS Muc 5: khong thay lua chon "Third Party"');
  if (!await tp.isChecked()) { await tp.check({ force: true }); await page.waitForTimeout(5000); }

  await go(page, PAY.soTaiKhoan, soTaiKhoan);
  await go(page, PAY.zip,        zip);

  return page.evaluate(x => {
    const v = s => (document.querySelector(s) || {}).value ?? null;
    const c = s => !!(document.querySelector(s) || {}).checked;
    return { thirdParty: c(x.thirdParty), soTaiKhoan: v(x.soTaiKhoan), zip: v(x.zip),
             luuTaiKhoan: c(x.luuTaiKhoan) };
  }, PAY);
}

/**
 * Chọn **kho gửi** (Ship From) — mắt xích nối với `lecangs.chonKho()`.
 *
 * 🔴 BA ĐIỀU ĐO THẬT 08/08/2026:
 *
 *  1. Khi ĐÃ ĐĂNG NHẬP, shipment mới vào thẳng `/destination` (UPS tự dùng địa chỉ gửi
 *     mặc định) — KHÔNG dừng ở `/origin`. Muốn đổi kho phải bấm nút **Edit** cạnh
 *     "Ship From" (`#nbsDestinationPageEditOriginAndReturnButton`) để sang `/origin`.
 *     (Khi CHƯA đăng nhập thì mới rơi vào `/origin` ở chế độ khách — không dùng được.)
 *
 *  2. Dropdown là `select#origin-agent_myAddresses` ("My Addresses"), có đúng 6 kho:
 *     `Calhoun · CAP · HOU07 · MEM R · NJF02 · SAV` (+ `Enter New Address`,
 *     `My Default Address`, `ALL FOR WOOD`).
 *
 *  3. ⚠️ **UPS ghi `MEM R` (DẤU CÁCH), `warehouse_ranking_by_state.csv` ghi `MEM-R`
 *     (GẠCH NỐI).** So chuỗi thẳng sẽ trượt đúng một kho. `chuanKho()` bỏ qua khác biệt
 *     này. Tài liệu ghi "Lecangs và UPS nay dùng tên giống nhau" — đúng với 5 kho kia.
 *
 * @param kho tên kho từ `lecangs.chonKho()`, ví dụ `NJF02` hoặc `MEM-R`
 */
export async function dienKhoGui(page, kho) {
  if (!kho) throw new Error('dienKhoGui: thieu ten kho');

  if (!/\/ship\/guided\/origin/.test(page.url())) {
    await page.locator(KHO.moSua).click({ timeout: 25000 });
    await page.waitForTimeout(16000);
  }
  const ds = page.locator(KHO.chon);
  if (!await ds.count()) throw new Error('UPS: khong thay dropdown kho "My Addresses" o buoc Ship From');

  const opts = await ds.evaluate(e => [...e.options].map(o => o.text.trim()));
  const dung = opts.find(o => chuanKho(o) === chuanKho(kho));
  if (!dung) {
    throw new Error(`UPS: khong co kho "${kho}" trong danh sach. Co: ${JSON.stringify(opts)} ` +
                    '-> DUNG va HOI NGUOI DUNG, khong chon bua.');
  }
  await page.selectOption(KHO.chon, { label: dung });
  await page.waitForTimeout(9000);

  const that = await ds.evaluate(e => e.selectedOptions[0]?.text.trim());
  if (chuanKho(that) !== chuanKho(kho)) throw new Error(`UPS: chon kho that bai (muon ${kho}, dang ${that})`);

  await page.locator(KHO.tiepTuc).click({ timeout: 25000 });
  await page.waitForTimeout(24000);
  return { kho: that, url: page.url() };
}

export { O as O_UPS, P as O_PACKAGE, REF as O_REF, H as O_PICKUP, PAY as O_PAY, KHO as O_KHO };


/* ==========================================================================
 *  CHẠY TRỌN Mục 1 → Review, tự thử lại khi gặp 250002
 * ======================================================================== */

/** Phiên UPS còn sống không? Dựa vào dashboard, KHÔNG đụng `/lasso/login`. */
export async function conPhien(page) {
  const cu = page.url();
  await page.goto(DASHBOARD, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(12000);
  const r = await page.evaluate(() => ({ url: location.href, tt: document.title }));
  const song = !/Access Denied/i.test(r.tt) && !/\/lasso\/(login|error)/.test(r.url);
  return { song, url: r.url.slice(0, 80), tt: r.tt.slice(0, 40), truoc: cu };
}

/**
 * Điền trọn Mục 1 → Review cho MỘT đơn Ground. **DỪNG trước `Pay and Get Label(s)`.**
 *
 * Tự thử lại khi Review trả `250002`.
 *
 * 🔴 NHƯNG KHÔNG THỬ LẠI MÙ QUÁNG. Đo 07–08/08: `250002` có `description` là
 *    **"Invalid Authentication Information"**, tức **PHIÊN ĐÃ HẾT HẠN**. Phiên chết thì
 *    tải lại trang và làm lại từ đầu sẽ hỏng y hệt — chỉ tốn request và làm Akamai hạ
 *    điểm tín nhiệm, đúng thứ đã khoá `/lasso/login` cả ngày 07/08.
 *    → Trước mỗi lần thử lại, `conPhien()` kiểm dashboard. Phiên chết thì **DỪNG NGAY**
 *      và báo cách khắc phục, không lặp.
 *
 * @param don {noiNhan, kien, pickup, laKhachLe}
 * @returns { ok, page, lan, daDien } — hoặc ném lỗi kèm lý do rõ ràng
 */
/* ==========================================================================
 *  GHI LẠI MỌI LỜI GỌI API CỦA CHÍNH FORM WEB
 * ------------------------------------------------------------------------
 *  🎯 Vì sao cần: hoá đơn cho thấy phí `On-Call Pickup` chỉ xuất hiện ở vài đơn,
 *     dù người vận hành bấm "Schedule a new pickup" cho MỌI đơn. Giả thuyết của
 *     người vận hành: pickup tạo TRONG luồng shipment thì phí đi theo billing của
 *     shipment (Home Depot trả), tạo RIÊNG thì người gửi trả.
 *     Đường API bắt buộc tách hai lời gọi -> nếu giả thuyết đúng, chuyển sang API
 *     sẽ khiến MỌI đơn phát sinh phí. Đây là câu hỏi tiền bạc, phải đo chứ không đoán.
 *
 *  🔴 ĐỪNG lọc theo chữ "pickup" trong URL — trang UPS bắn rất nhiều beacon
 *     analytics dạng `ups?T=B&u=<url-trang>` và `a`, chúng chứa chữ "pickup" trong
 *     tham số `u=` nên lọt lưới hết. Lọc theo **có postData** và **bỏ host analytics**.
 * ======================================================================== */

/** Host chỉ dùng cho đo đạc/quảng cáo — không phải API nghiệp vụ. */
const HOST_RAC = /omtrdc\.net|demdex\.net|doubleclick|googletagmanager|google-analytics|adobedtm|qualtrics|tiqcdn|fullstory|dynatrace|newrelic/i;

/**
 * Bắt đầu ghi mọi request POST/PUT có thân. Trả về { ds, dung() }.
 * `ds` được bồi thêm theo thời gian thực; gọi `dung()` để thôi lắng nghe.
 */
export function batPost(page) {
  const ds = [];
  const nghe = req => {
    try {
      const m = req.method();
      if (m !== 'POST' && m !== 'PUT') return;
      const url = req.url();
      if (HOST_RAC.test(url)) return;
      const body = req.postData();
      if (!body) return;                       // beacon thường không có thân
      ds.push({ luc: new Date().toISOString(), method: m, url, body });
    } catch { /* bo qua */ }
  };
  page.on('request', nghe);
  return { ds, dung: () => page.off('request', nghe) };
}

/**
 * ⛔⛔ BẤM `Pay and Get Label(s)` — TẠO VẬN ĐƠN THẬT, TÍNH TIỀN THẬT,
 *      VÀ ĐẶT LỆNH LẤY HÀNG THẬT nếu Mục 3 đã chọn "Schedule a new pickup".
 *      Không hoàn tác được bằng code. Chỉ gọi khi người dùng đã cho phép đích danh.
 *
 * Lần chạy đầu chưa biết trang kết quả trông thế nào, nên hàm này **ưu tiên lưu
 * bằng chứng hơn là tự động hoá**: lưu HTML + ảnh màn hình + toàn bộ request đã bắt,
 * rồi mới cố đọc tracking. Thiếu tracking thì vẫn còn file để đọc tay — thà vậy còn
 * hơn bấm xong mà không biết chuyện gì đã xảy ra.
 *
 * @param thuMuc nơi đổ bằng chứng
 * @returns { trackings, tep, url }
 */
export async function bamPay(page, { thuMuc, log = () => {} } = {}) {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  await fs.mkdir(thuMuc, { recursive: true });
  const luu = async (ten, noiDung) => {
    const p = path.join(thuMuc, ten);
    await fs.writeFile(p, noiDung);
    return p;
  };

  /* Nút Pay: tìm theo CHỮ, không theo id. Trang này chưa từng khảo sát nên chưa biết
   * id, mà id của UPS lại hay trùng (đã gặp 3 lần). Đếm số khớp và chỉ lấy cái NHÌN
   * THẤY ĐƯỢC — đúng bài học "3 link Create a Shipment, 2 cái bị ẩn". */
  const timNut = async (re) => {
    const ds = page.locator('button, input[type=submit], a');
    const n = await ds.count();
    const hop = [];
    for (let i = 0; i < n; i++) {
      const e = ds.nth(i);
      const t = ((await e.innerText().catch(() => '')) || (await e.getAttribute('value').catch(() => '')) || '').trim();
      if (re.test(t) && await e.isVisible().catch(() => false)) hop.push({ e, t });
    }
    return hop;
  };

  const nut = await timNut(/pay and get label/i);
  log(`tim nut "Pay and Get Label(s)": ${nut.length} cai nhin thay duoc`);
  if (nut.length !== 1) {
    await luu('truoc-pay.html', await page.content());
    await page.screenshot({ path: path.join(thuMuc, 'truoc-pay.png'), fullPage: true }).catch(() => {});
    throw new Error(`bamPay: mong doi DUNG 1 nut, thay ${nut.length} -> DUNG, khong bam bua. ` +
                    `Xem ${thuMuc}/truoc-pay.png`);
  }

  await page.screenshot({ path: path.join(thuMuc, 'truoc-pay.png'), fullPage: true }).catch(() => {});
  log('⛔ BAM PAY — tao van don THAT');
  await nut[0].e.click({ timeout: 30000 });
  await page.waitForTimeout(35000);

  // Sau Pay thường còn một bước "Get Labels" nữa (tài liệu quy trình có ghi).
  const nut2 = await timNut(/^get labels?$/i);
  if (nut2.length === 1) {
    log('bam "Get Labels"');
    await nut2[0].e.click({ timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(20000);
  } else if (nut2.length > 1) {
    log(`⚠️ thay ${nut2.length} nut "Get Labels" — khong bam, luu bang chung de xem tay`);
  }

  const tep = {};
  tep.html = await luu('sau-pay.html', await page.content());
  await page.screenshot({ path: path.join(thuMuc, 'sau-pay.png'), fullPage: true }).catch(() => {});
  tep.anh = path.join(thuMuc, 'sau-pay.png');

  /* Tracking number: 1Z + 16 ký tự. Quét cả trang, lọc trùng, giữ nguyên thứ tự.
   * KHÔNG dựa vào một vùng DOM cụ thể vì chưa khảo sát trang này lần nào. */
  const trackings = await page.evaluate(() =>
    [...new Set((document.body.innerText.match(/\b1Z[0-9A-Z]{16}\b/g) || []))]);
  log(`tracking doc duoc: ${trackings.length ? trackings.join(', ') : '(khong thay — doc tay trong file HTML)'}`);

  return { trackings, tep, url: page.url() };
}

export async function chayFormUps(page, don, { lanToiDa = 3, log = () => {} } = {}) {
  if (typeof don.laKhachLe !== 'boolean') {
    throw new Error('chayFormUps: phai truyen ro laKhachLe (true = khach le, false = store)');
  }
  let loiCuoi = null;

  for (let lan = 1; lan <= lanToiDa; lan++) {
    log(`--- lan ${lan}/${lanToiDa} ---`);
    let ma250002 = false;
    const nghe = async r => {
      if (!/ValidateAccounts|UpdateShippingContext/.test(r.url())) return;
      try { if (/"250002"/.test(await r.text())) ma250002 = true; } catch { /* bo qua */ }
    };

    try {
      /* 🔴 DON TAB THUA TRUOC. Moi lan mo shipment lai sinh mot tab moi ("Create a
       * Shipment" co target=_blank). VM chi co 2 nhan / 4 GB — 13 tab UPS lam nghet
       * CDP, `connectOverCDP` va `goto` deu timeout, va nguoi dung thay may lag han.
       * (Gap 08/08 sau vai vong retry.) */
      const ctx = page.context();
      for (const t of ctx.pages()) if (t !== page) await t.close().catch(() => {});

      /* LUON mo shipment MOI — ke ca lan dau. Trang co the dang o bat ky trang thai nao
       * (Review cua lan chay truoc, form dien do...), tai dung lai la chet kho hieu. */
      const v = await vaoFormCu(page, { batBuocMoi: true });
      page = v.page;                       // vaoFormCu co the tra ve TAB MOI
      page.on('response', nghe);

      if (don.kho) { log(`Ship From: kho ${don.kho}`); await dienKhoGui(page, don.kho); }
      log('Muc 1 Where');   const noiNhan = await dienNoiNhan(page, don.noiNhan);
      log('residential');   await xacNhanResidential(page, don.laKhachLe);
      log('Muc 2 What');    const kien = await dienPackage(page, 0, don.kien);
      await page.locator(O.tiepTuc).click({ timeout: 25000 }); await page.waitForTimeout(26000);
      log('Muc 3 How');     const pickup = await dienPickup(page, don.pickup);
      await page.locator(O.tiepTuc).click({ timeout: 25000 }); await page.waitForTimeout(26000);
      log('Muc 4 Details'); await page.locator(O.tiepTuc).click({ timeout: 25000 }); await page.waitForTimeout(26000);
      log('Muc 5 Payment'); const traTien = await dienThanhToan(page);
      log('Review');
      await page.locator(PAY.review).click({ timeout: 25000 });
      await page.waitForTimeout(34000);

      const kq = await page.evaluate(() => ({
        url: location.href,
        loi: (document.body.innerText.match(/Please correct the following:[\s\S]{0,120}/) || [''])[0].replace(/\s+/g, ' '),
        coNutTra: [...document.querySelectorAll('button')]
          .some(e => e.offsetParent && /pay and get label/i.test(e.innerText || ''))
      }));
      page.off('response', nghe);

      if (kq.coNutTra && !kq.loi) {
        return { ok: true, page, lan, daDien: { noiNhan, kien, pickup, traTien }, url: kq.url };
      }
      loiCuoi = kq.loi || 'khong thay nut "Pay and Get Label(s)"';
    } catch (e) {
      page.off('response', nghe);
      loiCuoi = e.message.split('\n')[0];
    }

    log(`that bai: ${String(loiCuoi).slice(0, 90)}`);
    if (lan === lanToiDa) break;

    if (ma250002) {
      /* 250002 co HAI nguyen nhan khac han nhau, phai phan biet:
       *  - phien DANG NHAP chet   -> thu lai vo ich, chi ton request va lam Akamai ha diem
       *  - `tx` shipment hong     -> mo shipment MOI la xong (batBuocMoi o vong sau) */
      const ph = await conPhien(page);
      if (!ph.song) {
        throw new Error(
          'UPS: loi 250002 = "Invalid Authentication Information" VA phien DANG NHAP da chet ' +
          `(${ph.tt} @ ${ph.url}). Thu lai se hong y het — DUNG. ` +
          'Khac phuc: dang nhap tren may nguoi dung -> DevTools > Network > Copy as cURL -> ' +
          'nap header Cookie vao 11_TaiVe/.profile-ground. Xem 7_QuyTrinh_Ground_UPS.md.');
      }
      log('250002 nhung phien dang nhap VAN SONG -> `tx` hong, mo shipment MOI');
    }
    await page.waitForTimeout(8000);
  }

  throw new Error(`UPS: that bai sau ${lanToiDa} lan. Loi cuoi: ${loiCuoi}`);
}
