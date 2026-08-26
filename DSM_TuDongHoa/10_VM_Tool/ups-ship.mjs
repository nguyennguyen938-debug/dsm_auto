/**
 * ============================================================================
 *  ups-ship.mjs — tạo shipment + lấy shipping label qua UPS API (nhánh GROUND)
 * ----------------------------------------------------------------------------
 *  Thay cho `ups-form.mjs` (điều khiển form web). Xem `ups-api.mjs` để biết vì sao đổi.
 *
 *  🔴 SÁU ĐIỀU ĐO THẬT 08/08/2026 trên CIE, đừng đổi nếu chưa đo lại:
 *
 *  1. **UPS trả PDF trực tiếp.** `LabelImageFormat.Code = 'PDF'` -> `GraphicImage`
 *     base64 có 5 byte đầu `%PDF-`. GIF và PNG cũng được; **ZPL thì KHÔNG** (đòi thêm
 *     `LabelStockSize`: `9120244`). Nghiệp vụ cần PDF nên dùng thẳng PDF, không phải
 *     chuyển đổi ảnh — bớt hẳn một khâu có thể hỏng.
 *
 *  2. **Vẫn kiểm 5 byte đầu là `%PDF`.** Cùng bài học với `downloadFile.do` của DSM:
 *     ở đó server trả HTML 59 KB mà vẫn mang tên `.pdf`, và có lần đã lưu nhầm lên
 *     Drive. Định dạng do người khác trả về thì phải tự kiểm, đừng tin nhãn.
 *
 *  3. **`Qty > 1` = NHIỀU phần tử trong mảng `Package`**, mỗi phần tử một kiện và
 *     UPS trả **một tracking number cho mỗi kiện**. Đúng như tài liệu mô tả ở đường
 *     form web ("Total Identical Packages"), nhưng ở API phải tự nhân bản.
 *
 *  4. **`PackageResults` có thể là OBJECT khi chỉ một kiện, MẢNG khi nhiều kiện.**
 *     Không bọc `[].concat()` là `.map` ném lỗi đúng vào ca một-kiện — tức là ca
 *     thường gặp nhất. (Cùng họ bẫy với `RatedShipment` bên Rating.)
 *
 *  5. **`ShipperNumber` bắt buộc** (`1741XG`, người dùng chốt 08/08). Form web để mặc
 *     định nên không ai phải nghĩ tới; API không có "mặc định" nào cả.
 *
 *  6. Bên trả tiền vẫn là **third party `12C8D2` / ZIP `92571`**. Ghi chú: `92571` chính
 *     là ZIP của kho **CAP** (PERRIS CA) — nay đã rõ nguồn gốc con số này.
 *
 *  ⛔ MẶC ĐỊNH CHẠY TRÊN CIE (test). `DSM_UPS_ENV=prod` mới tạo shipment THẬT và
 *     TÍNH TIỀN THẬT. Xem `ups-api.mjs`.
 * ==========================================================================*/

import * as U from './ups-api.mjs';

/** Hằng số của AllForWood — tài liệu ghi "LUÔN", người dùng xác nhận lại 08/08. */
export const TAI_KHOAN_GUI = '1741XG';
export const TRA_TIEN = { soTaiKhoan: '12C8D2', zip: '92571' };
/** UPS Ground. Chọn theo MÃ ở API — không có chuyện bấm nhầm ô như trên web. */
export const MA_UPS_GROUND = '03';

/** Khối địa chỉ kho gửi, dùng chung cho `Shipper` và `ShipFrom`. */
function khoiKho(kho) {
  return {
    Name: kho.tenCongTy,
    AttentionName: kho.lienHe || kho.tenCongTy,
    Phone: { Number: String(kho.phone).replace(/\D/g, '') },
    Address: {
      AddressLine: [kho.duong],
      City: kho.city,
      StateProvinceCode: kho.state,
      PostalCode: String(kho.zip),
      CountryCode: 'US'
    }
  };
}

/**
 * Khối người nhận.
 *
 * ⚠️ `diaChi2` chỉ thêm vào khi CÓ nội dung. Gửi `AddressLine: [x, '']` thì UPS coi
 *    dòng rỗng là một dòng địa chỉ thật và in ra label một dòng trắng.
 *    Luật store/khách lẻ nằm ở `ground-tra.diaChiGiao()`, file này không lặp lại.
 */
function khoiNhan(noiNhan, laKhachLe) {
  const dong = [noiNhan.diaChi1];
  if (noiNhan.diaChi2) dong.push(noiNhan.diaChi2);
  return {
    Name: noiNhan.tenKhach,
    AttentionName: noiNhan.tenLienHe || noiNhan.tenKhach,
    ...(noiNhan.dienThoai ? { Phone: { Number: String(noiNhan.dienThoai).replace(/\D/g, '') } } : {}),
    Address: {
      AddressLine: dong,
      City: noiNhan.city,
      StateProvinceCode: noiNhan.state,
      PostalCode: String(noiNhan.zip),
      CountryCode: 'US',
      // Tài liệu: Yes nếu khách lẻ, No nếu store. Ở API là có/không có trường này.
      ...(laKhachLe ? { ResidentialAddressIndicator: 'Y' } : {})
    }
  };
}

/**
 * Dựng payload ShipmentRequest.
 *
 * @param don {po, kho, noiNhan, laKhachLe, kien:{model,qty,lb,L,W,H}, moTa}
 *        `kho`     — từ `ground-tra.traKho()`
 *        `noiNhan` — từ `ground-tra.diaChiGiao()`
 *        `kien`    — `qty` từ slip, `lb/L/W/H` từ `ground-tra.traDims()`
 */
export function dungPayload(don, { dinhDangLabel = 'PDF' } = {}) {
  const { po, kho, noiNhan, kien, moTa } = don;
  if (typeof don.laKhachLe !== 'boolean') {
    throw new Error('dungPayload: phai truyen ro laKhachLe (true = khach le, false = store)');
  }
  for (const [ten, v] of [['po', po], ['kho', kho], ['noiNhan', noiNhan], ['kien', kien]]) {
    if (!v) throw new Error(`dungPayload: thieu "${ten}"`);
  }
  /* 🔴 NHẬN CẢ MỘT KIỆN LẪN NHIỀU KIỆN.
   *    Tài liệu: **mỗi SKU = MỘT package** (trên web là nút "Add Another Package").
   *    Đơn 2 SKU đầu tiên gặp được là PO 81944554 (`816390-B` + `818250-B`) — trước
   *    11/08/2026 parser chỉ đọc SKU đầu nên chỗ này chưa bao giờ chạy với >1 SKU.
   *    Giữ dạng object cũ để không phá nơi gọi đã có. */
  const dsKien = Array.isArray(kien) ? kien : [kien];
  if (!dsKien.length) throw new Error('dungPayload: khong co kien nao');

  const goi = [], skuTheoKien = [];
  for (const k of dsKien) {
    const qty = Number(k.qty);
    if (!Number.isInteger(qty) || qty < 1) throw new Error(`dungPayload: qty "${k.qty}" khong hop le (SKU ${k.model})`);
    for (const [ten, v] of [['lb', k.lb], ['L', k.L], ['W', k.W], ['H', k.H]]) {
      if (!Number.isFinite(Number(v)) || Number(v) <= 0) {
        throw new Error(`dungPayload: SKU ${k.model} co ${ten} = ${v} — KHONG duoc gui 0 len UPS`);
      }
    }
    // Qty > 1 -> nhân bản kiện; UPS trả một tracking number cho MỖI kiện (điều 3).
    for (let i = 0; i < qty; i++) {
      goi.push({
        Description: `SKU ${k.model}`,
        Packaging: { Code: '02' },                       // customer supplied package
        Dimensions: {
          UnitOfMeasurement: { Code: 'IN' },
          Length: String(k.L), Width: String(k.W), Height: String(k.H)
        },
        PackageWeight: { UnitOfMeasurement: { Code: 'LBS' }, Weight: String(k.lb) },
        ReferenceNumber: [{ Code: 'PO', Value: String(po) }]   // Reference #1 = số PO
      });
      skuTheoKien.push({ model: k.model, thuTu: i + 1 });      // để đặt tên file label
    }
  }

  const kh = khoiKho(kho);
  const payload = {
    ShipmentRequest: {
      Request: {
        RequestOption: 'nonvalidate',
        TransactionReference: { CustomerContext: String(po) }
      },
      Shipment: {
        Description: (moTa || dsKien.map(k => k.model).join(' + ')).slice(0, 50),
        Shipper: { ...kh, ShipperNumber: TAI_KHOAN_GUI },
        ShipFrom: kh,
        ShipTo: khoiNhan(noiNhan, don.laKhachLe),
        PaymentInformation: {
          ShipmentCharge: {
            Type: '01',                              // transportation
            BillThirdParty: {
              AccountNumber: TRA_TIEN.soTaiKhoan,
              Address: { PostalCode: TRA_TIEN.zip, CountryCode: 'US' }
            }
          }
        },
        Service: { Code: MA_UPS_GROUND, Description: 'UPS Ground' },
        Package: goi
      },
      LabelSpecification: {
        LabelImageFormat: { Code: dinhDangLabel },
        /* 🔴 KHỔ 4×6 — thêm 11/08/2026 sau khi Lecangs chặn đơn đầu tiên.
         *
         * Thiếu `LabelStockSize` thì UPS trả label nằm giữa **khổ giấy lớn**, và khi
         * upload lên Lecangs nó chặn bằng hộp thoại:
         *   "The blank part of the file is too large, please download the standard
         *    label or force submission"
         * Không ai bấm qua hộp đó thì đơn **nằm lại ở trạng thái Draft** — kho không
         * bao giờ thấy, mà log thì trông như đã xong.
         *
         * 4×6 inch là khổ tem vận đơn chuẩn, cũng là khổ máy in tem của kho dùng.
         * ⚠️ Label ĐÃ tạo trước mốc này vẫn là khổ cũ; chúng vẫn phải force submit. */
        LabelStockSize: { Height: '6', Width: '4' },
        HTTPUserAgent: 'Mozilla/5.0'
      }
    }
  };
  // `skuTheoKien` đi kèm payload để nơi gọi biết kiện thứ i là SKU nào — cần cho
  // tên file `<SKU>_<n>_ShippingLabel.pdf` và cho bước Lecangs (mỗi tracking một đơn).
  Object.defineProperty(payload, '_sku', { value: skuTheoKien, enumerable: false });
  return payload;
}


/**
 * Tạo shipment thật và lấy label.
 *
 * ⛔ Với `DSM_UPS_ENV=prod` thì đây là thao tác **TÍNH TIỀN**, tương đương bấm
 *    `Pay and Get Label(s)` trên form web. Huỷ phải làm trên trang UPS —
 *    `huy-ups-thua.mjs` đã bỏ 12/08/2026 theo yêu cầu người dùng.
 *
 * 🔴 KHÔNG tự thử lại khi lỗi. Không biết chắc UPS đã tạo shipment hay chưa thì thử
 *    lại có thể sinh **hai shipment và hai lần tính tiền** — cùng nguyên tắc với
 *    "Submit reprint không retry" của DSM và Finalize của AACT.
 *
 * @returns { shipmentId, kien: [{ tracking, pdf: Buffer }], cuoc }
 */
export async function taoShipment(don, { dinhDangLabel = 'PDF', log = () => {} } = {}) {
  const payload = dungPayload(don, { dinhDangLabel });
  const dsKien = Array.isArray(don.kien) ? don.kien : [don.kien];
  log(`${don.po}: tao shipment tren ${U.LA_THAT ? 'PRODUCTION (TINH TIEN)' : 'CIE (test)'}` +
      ` | kho ${don.kho.kho} | ` + dsKien.map(k => `${k.qty}x ${k.model} (${k.lb} lb)`).join(' + '));

  const kq = await U.goi('POST', '/api/shipments/v1/ship', payload);
  const res = kq.body?.ShipmentResponse?.ShipmentResults;
  if (kq.code !== 200 || !res) {
    throw new Error(`UPS tao shipment that bai (HTTP ${kq.code}): ${U.docLoi(kq)} ` +
                    '-> KHONG tu chay lai, kiem tren ups.com xem shipment da tao chua.');
  }

  // Điều 4: một kiện -> object, nhiều kiện -> mảng.
  const goi = [].concat(res.PackageResults || []);
  if (!goi.length) throw new Error('UPS tra ve 0 kien — khong co tracking number nao');

  const kien = goi.map((g, i) => {
    const tracking = g.TrackingNumber;
    const b64 = g.ShippingLabel?.GraphicImage;
    if (!tracking) throw new Error(`kien ${i + 1}: khong co TrackingNumber`);
    if (!b64) throw new Error(`kien ${i + 1} (${tracking}): khong co anh label`);
    const pdf = Buffer.from(b64, 'base64');
    // Điều 2 — tự kiểm định dạng, đừng tin nhãn.
    if (dinhDangLabel === 'PDF' && pdf.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new Error(`kien ${i + 1} (${tracking}): UPS bao la PDF nhung 5 byte dau la ` +
                      `"${pdf.subarray(0, 5).toString('latin1')}" — KHONG luu file nay`);
    }
    const sku = payload._sku[i] || {};
    return { tracking, pdf, model: sku.model, thuTu: sku.thuTu };
  });

  const cuoc = res.ShipmentCharges?.TotalCharges;
  log(`${don.po}: ✅ ${kien.length} tracking | ${kien.map(k => k.tracking).join(', ')}` +
      (cuoc ? ` | ${cuoc.MonetaryValue} ${cuoc.CurrencyCode}` : ''));

  return {
    shipmentId: res.ShipmentIdentificationNumber,
    kien,
    cuoc: cuoc ? `${cuoc.MonetaryValue} ${cuoc.CurrencyCode}` : null
  };
}

/**
 * Tên file label theo quy trình: `<SKU>_<số thứ tự từ 1>_ShippingLabel.pdf`.
 * Số thứ tự giải quyết ca `Qty > 1` (mỗi kiện một label, một tracking) và ca đơn
 * có hai dòng cùng SKU.
 */
export const tenFileLabel = (sku, i) => `${sku}_${i + 1}_ShippingLabel.pdf`;
