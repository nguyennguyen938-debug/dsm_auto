/**
 * ============================================================================
 *  ups-pickup.mjs — đặt lịch xe UPS tới lấy hàng (nhánh GROUND)
 * ----------------------------------------------------------------------------
 *  ⛔⛔ ĐÂY LÀ THAO TÁC GỌI XE TẢI. Trên `DSM_UPS_ENV=prod` nó đặt **lệnh lấy hàng
 *      THẬT** tại kho — cùng loại hậu quả với Submit của CTII. Không tự chạy lại
 *      khi lỗi: gọi hai lần là **hai chuyến xe**.
 *      Huỷ phải dùng Pickup Cancel API hoặc gọi UPS; file này CHƯA làm chức năng huỷ.
 *
 *  🔴 KHÁC BIỆT LỚN NHẤT so với đường form web — PHẢI HIỂU TRƯỚC KHI DÙNG:
 *     Trên web, "Schedule a new pickup" nằm TRONG Mục 3 của cùng một shipment, nên
 *     shipment và pickup là MỘT lượt. Qua API chúng là **HAI lời gọi độc lập**:
 *       1. `ups-ship.taoShipment()`  -> label + tracking
 *       2. `datPickup()` (file này)  -> PRN, xe tới lấy
 *     Hệ quả: **tạo label xong mà pickup lỗi thì hàng có nhãn nhưng không ai tới lấy.**
 *     Nơi gọi phải xử lý được ca đó, đừng coi hai bước là một giao dịch.
 *
 *  ✅ ĐO THẬT 08/08/2026 trên CIE:
 *     · `PaymentMethod` `01` và `00` đều được; `03` đòi thẻ (`9510166`), `06` sai (`9500554`).
 *       Dùng `01` = tính vào tài khoản người gửi.
 *     · `PickupPoint` **được UPS xác thực**: `Warehouse` ✅ · `Front Door` ✅ ·
 *       giá trị bịa -> `400 9500535 Invalid PickupPoint`. Vậy chữ `Warehouse` mà tài
 *       liệu quy trình ghi đúng là giá trị UPS hiểu, không phải chữ tuỳ tiện.
 *     · Pickup **CÓ PHÍ**: `RateResult.GrandTotalOfAllCharge` = 9.65 USD (số của CIE).
 *
 *  ✅ XÁC MINH BẰNG SPEC CHÍNH THỨC (`github.com/UPS-API/api-documentation`, `Pickup.yaml`):
 *     `RatePickupIndicator` = *"Y = Rate this pickup / N = Do not rate this pickup"* —
 *     nó chỉ quyết định response CÓ KÈM GIÁ hay không, **vẫn đặt xe trong cả hai ca**.
 *     Không có chế độ "chỉ hỏi giá, chưa đặt". Đừng dùng cờ này để xem giá trước.
 *
 *  🔴 KHÔNG GỘP ĐƯỢC SHIPMENT + PICKUP — đã kiểm cả hai đường 08/08/2026:
 *     · `Shipping.yaml` không có trường đặt lịch xe nào. Chữ `Pickup` trong đó chỉ
 *       thuộc `TradeDirect.Master` (gom hàng quốc tế tới CFS) và `TrackingCandidate`.
 *     · `ShipmentResults` trả về đúng 4 trường, không có `PRN`.
 *     ⚠️ Nhét đại một khối pickup vào `ShipmentRequest` thì UPS trả `200` — NHƯNG nhét
 *       một trường **bịa hoàn toàn** cũng trả `200`. UPS im lặng bỏ qua trường lạ, nên
 *       `200` ở đây KHÔNG chứng minh gì. (Phép đo thứ hai này là thứ chặn một kết luận sai.)
 *
 *  ⛔⛔ **MỖI ĐƠN MỘT PICKUP RIÊNG — NGƯỜI DÙNG CHỐT 08/08/2026.**
 *     KHÔNG gộp nhiều đơn vào một lần gọi xe, kể cả khi chúng cùng kho và cùng ngày.
 *     Về mặt kỹ thuật thì gộp được (`PickupPiece` là mảng, `TrackingData` nhận tới 30
 *     tracking, và phí tính theo lần gọi xe nên gộp sẽ rẻ hơn) — **nhưng đừng làm.**
 *     Đây là quyết định nghiệp vụ, không phải chỗ để tối ưu. Ghi lại vì bản trước của
 *     chính file này từng khuyên gộp, và đó là lời khuyên SAI.
 *
 *  💰 AI TRẢ PHÍ PICKUP — ĐÃ ĐÓNG HỒ SƠ, đo trên **production** 09/08/2026. ĐỪNG THỬ LẠI:
 *     Phí pickup **luôn thuộc `1741XG` (AllForWood)**. Không đẩy sang Home Depot được.
 *       · `Shipper.Account = 12C8D2` -> `9510154 account does not belong to the user`
 *       · `PaymentMethod 04` + **tracking THẬT** -> `9510127 Tracking number does not
 *         accept pickup charge`. Lý do: shipment đã bill third party sang Home Depot rồi,
 *         UPS không cho gán thêm khoản thứ hai vào cùng tracking.
 *     Cả hai phép thử đều trả `400` nên **không tạo pickup nào, không mất phí**.
 *     -> Dùng `PaymentMethod 01`. Đây không phải lựa chọn, đây là thứ duy nhất chạy được.
 *     (Phân biệt: **cước vận chuyển** do `PaymentInformation` trong ShipmentRequest quyết
 *     định, đã bill `12C8D2` — hoá đơn thật cho thấy 41 kiện đều `Billed Charge 0.00`,
 *     Home Depot trả 100%. Chỉ riêng phí gọi xe là của AllForWood.)
 *
 *  🚚 UPS TỰ GỘP CÁC PICKUP CÙNG NGÀY + CÙNG ĐỊA ĐIỂM — đừng tự tối ưu:
 *     Người vận hành xác nhận **đơn nào cũng bấm "Schedule a new pickup"** trên form.
 *     Vậy mà hoá đơn tuần 41 kiện chỉ có **2 dòng phí** (24–32 USD), thay vì 41 × 9.65 ≈ 395.
 *     Mỗi dòng phí mang nhiều PO (`2nd ref: 92562982, 49563450, 35980347`).
 *     -> Phí tính theo **chuyến xe thực chạy**, không theo số lần gọi. Gọi mỗi đơn một lần
 *        là ĐÚNG quy trình và KHÔNG làm tăng tiền.
 *     ⚠️ Bản trước của file này suy từ "2 dòng phí" ra "hầu như không ai gọi xe" — SAI,
 *        vì nhầm *số lần bị tính tiền* với *số lần gọi*.
 *     2. **Smart Pickup (GWN — "Green When Needed")**: `PickupTriggerGWNRequest`, chỉ cần
 *        `AccountNumber` (6 ký tự) + `ServiceDateOption` (`01` hôm nay / `02` ngày làm việc
 *        kế), địa chỉ lấy từ cấu hình sẵn của tài khoản. Response có
 *        `TriggerStatus: EXISTING` khi đã có pickup -> **gọi lại KHÔNG sinh chuyến xe thứ hai**.
 *        ⛔ Đo 08/08 trên CIE với `1741XG`: `9510029 GWN Pickup is not available on this
 *        account` — tài khoản CHƯA bật. Muốn dùng phải đăng ký Smart Pickup với UPS.
 *        **KHÔNG đo lại việc này trên production**: nếu tài khoản có bật thật thì chính
 *        lời gọi thăm dò đó sẽ gọi xe.
 * ==========================================================================*/

import * as U from './ups-api.mjs';

/** Tài liệu quy trình: Earliest LUÔN 1:00 PM, Latest mặc định 5:00 PM. */
export const GIO_SOM_NHAT = '1300';
export const GIO_MUON_NHAT = '1700';
/** Preferred Pickup Location — UPS xác thực chuỗi này, xem khối đầu file. */
export const VI_TRI = 'Warehouse';
/** UPS Ground trong `PickupPiece`. */
export const MA_DICH_VU_GROUND = '003';
export const TAI_KHOAN_GUI = '1741XG';

/** `Date` -> `YYYYMMDD`, dạng UPS đòi cho `PickupDate`. */
export const ngayUps = d =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

/**
 * Đặt lịch lấy hàng cho **MỘT đơn**.
 *
 * ⛔ Đúng một đơn mỗi lần gọi — người dùng chốt 08/08, xem khối đầu file.
 *
 * @param don {po, kho, ngay, soKien, tongCanNang, trackings?}
 *        `kho`       — từ `ground-tra.traKho()`
 *        `ngay`      — `Date` (dùng `ground-tra.ngayPickupGround().d`) hoặc `YYYYMMDD`
 *        `soKien` / `tongCanNang` — tổng của **đơn này**
 *        `trackings` — bắt buộc khi `phuongThucTra='04'`: tracking của chính đơn này,
 *                      lấy từ `ups-ship.taoShipment().kien[].tracking`
 * @param phuongThucTra `'01'` — thứ duy nhất dùng được, xem khối đầu file. `'04'` đã bị
 *        UPS từ chối trên production với tracking thật; giữ nhánh code lại làm tư liệu.
 * @returns { prn, phi, ngay, laSameDay }
 */
export async function datPickup(don, { log = () => {}, phuongThucTra = '01' } = {}) {
  const { po, kho, ngay, soKien, tongCanNang } = don;
  for (const [ten, v] of [['po', po], ['kho', kho], ['ngay', ngay],
                          ['soKien', soKien], ['tongCanNang', tongCanNang]]) {
    if (!v) throw new Error(`datPickup: thieu "${ten}"`);
  }
  const ngayStr = typeof ngay === 'string' ? ngay : ngayUps(ngay);
  if (!/^\d{8}$/.test(ngayStr)) throw new Error(`datPickup: ngay "${ngayStr}" phai dang YYYYMMDD`);

  if (phuongThucTra === '04') {
    if (!Array.isArray(don.trackings) || !don.trackings.length) {
      throw new Error('datPickup: PaymentMethod 04 doi "trackings" — tracking cua chinh don nay');
    }
    // UPS đòi đúng 18 ký tự; sai độ dài thì lỗi trả về là "check digit", đọc rất khó hiểu.
    const hong = don.trackings.filter(t => !/^1Z[0-9A-Z]{16}$/.test(String(t)));
    if (hong.length) {
      throw new Error(`datPickup: tracking khong dung dang 1Z + 16 ky tu: ${hong.join(', ')}`);
    }
  }

  /* 🔴 UPS KHÔNG CHẶN NGÀY QUÁ KHỨ — đo 08/08/2026: `PickupDate: 20260101` trả về
   * `200` kèm PRN bình thường. Tức là một lỗi tính ngày sẽ đi thẳng qua API mà không
   * ai biết, rồi xe không bao giờ tới. Tự chặn ở đây.
   * Mốc so là hôm nay theo **giờ Việt Nam**, cùng múi giờ mà `ngayPickupGround()` dùng
   * để tính; công thức của nó luôn cho ra >= hôm nay nên rào này không chặn nhầm ca đúng. */
  const vn = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const homNay = ngayUps(vn);
  if (ngayStr < homNay) {
    throw new Error(`datPickup: ngay pickup ${ngayStr} nam TRUOC hom nay (${homNay}). ` +
                    'UPS van nhan ngay qua khu ma khong bao loi, nen phai chan o day. ' +
                    'Kiem lai ngayPickupGround().');
  }

  /* 💵 SAME DAY DAT GAP RUOI FUTURE DAY — doc tu hoa don that (Aug 01 2026):
   *      Same Day Pickup   15.75 + 4.13 fuel = 19.88
   *      Future Day Pickup  9.65 + 2.53 fuel = 12.18
   *    Chenh 7.70 moi chuyen. Quy tac ngayPickupGround() (truoc 15:00 gio VN thi tru
   *    1 ngay) rat de cho ra DUNG HOM NAY -> UPS tinh la Same Day.
   *    Khong tu doi ngay: ngay pickup la cam ket voi kho, doi ngam la xe den sai ngay.
   *    Chi BAO to de nguoi dung biet ma quyet. */
  const laSameDay = ngayStr === homNay;
  if (laSameDay) {
    log(`⚠️  ${po}: ngay pickup ${ngayStr} la HOM NAY -> UPS tinh SAME DAY (~19.88) ` +
        `thay vi FUTURE DAY (~12.18), dat hon ~7.70.`);
  }

  const than = {
    PickupCreationRequest: {
      /* 'N': chỉ đặt, không kèm báo giá. Xem cảnh báo ở khối đầu file — 'Y' KHÔNG
       * phải chế độ xem trước, nó vẫn đặt xe. */
      RatePickupIndicator: 'N',
      Shipper: { Account: { AccountNumber: TAI_KHOAN_GUI, AccountCountryCode: 'US' } },
      PickupDateInfo: {
        CloseTime: GIO_MUON_NHAT,
        ReadyTime: GIO_SOM_NHAT,
        PickupDate: ngayStr
      },
      PickupAddress: {
        CompanyName: kho.tenCongTy,
        ContactName: kho.lienHe || kho.tenCongTy,
        AddressLine: kho.duong,
        City: kho.city,
        StateProvince: kho.state,
        PostalCode: String(kho.zip),
        CountryCode: 'US',
        ResidentialIndicator: 'N',          // kho, không phải nhà dân
        Phone: { Number: String(kho.phone).replace(/\D/g, '') },
        PickupPoint: VI_TRI
      },
      AlternateAddressIndicator: 'N',
      PickupPiece: [{
        ServiceCode: MA_DICH_VU_GROUND,
        Quantity: String(soKien),
        DestinationCountryCode: 'US',
        ContainerCode: '01'
      }],
      TotalWeight: { Weight: String(tongCanNang), UnitOfMeasurement: 'LBS' },
      OverweightIndicator: 'N',
      PaymentMethod: phuongThucTra,
      /* `04` = trả bằng 1Z tracking. Spec: *"tracking number(s) that have been previously
       * used to pay for on-call pickup cannot be used again"* — tức UPS TỰ CHẶN việc gọi
       * pickup hai lần cho cùng một shipment. Đó là hàng rào chống trùng sẵn có, quý hơn
       * bất cứ cờ nào mình tự viết. */
      ...(phuongThucTra === '04'
        ? { TrackingData: don.trackings.map(t => ({ TrackingNumber: t })) }
        : {}),
      ReferenceNumber: String(po)          // Pickup Reference = số PO
    }
  };

  log(`${po}: dat pickup ${U.LA_THAT ? '⛔ PRODUCTION — GOI XE THAT' : 'CIE (test)'}` +
      ` | kho ${kho.kho} | ${ngayStr} ${GIO_SOM_NHAT}-${GIO_MUON_NHAT} | ${soKien} kien ${tongCanNang} lb`);

  const kq = await U.goi('POST', '/api/pickupcreation/v1/pickup', than);
  const r = kq.body?.PickupCreationResponse;
  if (kq.code !== 200 || !r?.PRN) {
    throw new Error(`UPS dat pickup that bai (HTTP ${kq.code}): ${U.docLoi(kq)} ` +
                    '-> KHONG tu chay lai. Kiem tren ups.com xem pickup da tao chua, ' +
                    'goi lai la HAI chuyen xe.');
  }

  const phi = r.RateResult?.GrandTotalOfAllCharge
    ? `${r.RateResult.GrandTotalOfAllCharge} ${r.RateResult.CurrencyCode}` : null;
  /* Con so `phi` nay la gia DANH NGHIA cho rieng loi goi nay. Tien THAT TRA it hon
   * nhieu vi UPS gop cac pickup cung ngay + cung kho thanh mot chuyen (xem dau file).
   * Dung cong don `phi` cua tung don roi bao cao la chi phi cua lo — se sai rat xa. */
  log(`${po}: ✅ PRN ${r.PRN}${phi ? ` | phi danh nghia ${phi}` : ''}`);
  return { prn: r.PRN, phi, ngay: ngayStr, laSameDay };
}
