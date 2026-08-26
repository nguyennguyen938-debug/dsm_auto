/**
 * ============================================================================
 *  ground-tra.mjs — tra cứu cho nhánh đơn GROUND (UPS + Lecangs)
 * ----------------------------------------------------------------------------
 *  Thuần dữ liệu, không đụng mạng. Xem `01_HuongDan_VanHanh/7_QuyTrinh_Ground_UPS.md`.
 * ==========================================================================*/

import fs from 'node:fs/promises';
import path from 'node:path';

const GOC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/**
 * 4 chuỗi LUÔN đi kho Calhoun và KHÔNG qua Lecangs.
 * So khớp **TUYỆT ĐỐI cả chuỗi** — mỗi biến thể hậu tố là một dòng riêng.
 */
export const SKU_NGOAI_LE = new Set(['836390', '836390-B', '838390', '838390-B']);

/**
 * 🔴 KHỚP **TUYỆT ĐỐI CẢ CHUỖI**, kể cả hậu tố — người dùng chốt 12/08/2026.
 *
 * Trước đó khớp theo phần số đầu (`816390-B` tính là `816390`), nên mọi biến thể hậu tố
 * đều dính. Nay mỗi biến thể phải được liệt kê rõ: `836390` và `836390-B` là hai dòng
 * riêng trong danh sách.
 *
 * ⚠️ Hệ quả của việc chốt danh sách: `816390`, `818390` và các biến thể `-B` của chúng
 *    KHÔNG còn thuộc kho Calhoun. Chúng rơi về luật thường — Ground thì B2C, Misc thì B2B.
 *    Đây là thay đổi có chủ ý, không phải sót.
 */
export const laSkuNgoaiLe = model => SKU_NGOAI_LE.has(String(model).trim().toUpperCase());

/**
 * 🔴 4 SKU LUÔN VỀ **B2B** — người dùng chốt 12/08/2026.
 *
 * Hàng nằm ở kho **Calhoun**, và slip của chúng thường ghi `Ship Via: Ground` (tức B2C).
 * Bất kể slip ghi gì, chúng về sheet **B2B**. Đây là luật MẠNH NHẤT, thắng cả Ship Via.
 *
 * Danh sách này thay cho `SKU_LUON_UPS` cũ (đã bỏ 12/08): danh sách đó ép carrier `UPS`
 * cho đúng bốn SKU mà luật mới bảo phải về B2B — hai luật ngược nhau, giữ cả hai thì
 * đơn vừa được ép đi UPS vừa bị xếp vào luồng dựng BOL.
 */
export const SKU_B2B = SKU_NGOAI_LE;

/**
 * 4 SKU **ưu tiên B2C**, nhưng **hết tồn Lecangs thì rơi về B2B** (chốt 12/08/2026).
 *
 * Khớp **TUYỆT ĐỐI cả chuỗi** — `838250` và `838250-B` là hai dòng riêng.
 * ⚠️ ĐỪNG nhầm với `maLecangs()`: hàm đó BỎ hậu tố khi **tra tồn kho**. Hai việc khác
 *    nhau — phân loại thì phân biệt hậu tố, tra tồn kho thì gộp.
 */
export const SKU_B2C_UU_TIEN = new Set(['838250', '838250-B', '818250', '818250-B']);

/** Khớp TUYỆT ĐỐI cả chuỗi, cùng luật với `laSkuNgoaiLe` ở trên. */
export const laSkuB2CUuTien = model =>
  SKU_B2C_UU_TIEN.has(String(model).trim().toUpperCase());

/**
 * ☑️ NƠI DUY NHẤT quyết định một dòng hàng thuộc **B2B** hay **B2C**.
 *
 * Trước 12/08/2026 mỗi tool tự phán đoán bằng luật riêng, và hai tool đã bất đồng về
 * cùng một đơn (xem `00_SoatLoi_12082026.md` lỗi L1). Gom về một hàm để chuyện đó không
 * lặp lại: sửa luật thì sửa đúng một chỗ.
 *
 * @param model    Model Number nguyên vẹn trên slip (giữ hậu tố)
 * @param conHang  Kết quả tra tồn Lecangs cho SKU nhóm ưu tiên B2C:
 *                   `true`  — có kho đủ số lượng   -> B2C
 *                   `false` — không kho nào đủ     -> B2B
 *                   `undefined` — CHƯA tra được (phiên Lecangs chết)
 *                      -> **mặc định B2C** (người dùng chốt 12/08). Chọn B2C vì đó là
 *                         luồng vốn có của chúng; đoán sang B2B sẽ dựng BOL cho hàng
 *                         parcel, sai nặng hơn.
 * @param laGround `Ship Via` trên slip có phải Ground không — chỉ dùng cho SKU thường
 * @returns 'B2B' | 'B2C'
 */
export function phanLoaiSku(model, { conHang, laGround, bang } = {}) {
  /* 🔴 LUẬT 0 — ALASKA VÀ HAWAII LUÔN VỀ B2B (người dùng chốt 12/08/2026).
   *
   * Mạnh hơn cả luật kho Calhoun, vì đây là ràng buộc về **nơi giao**, không phải về hàng.
   * Lý do: bảng thứ tự kho chỉ phủ 48 bang lục địa. Đơn Ground đi AK/HI vì thế không chọn
   * được kho gửi và trước đây rơi vào danh sách chờ người xem — nằm im vô thời hạn.
   *
   * Đưa về B2B thì chúng đi đường Misc quen thuộc: dựng BOL với ô hãng để trống, cột C
   * ghi `NULL`. Khi bật lại khâu chọn hãng, hai bang này vẫn giữ `NULL` và ô hãng trên
   * BOL vẫn trống, vì `carrier.csv` cũng không có AK/HI. */
  if (BANG_LUON_B2B.has(String(bang || '').trim().toUpperCase())) return 'B2B';
  if (laSkuNgoaiLe(model)) return 'B2B';                       // luật 1 — kho Calhoun
  if (laSkuB2CUuTien(model)) return conHang === false ? 'B2B' : 'B2C';   // luật 2 — theo tồn kho
  return laGround ? 'B2C' : 'B2B';                             // luật 3 — theo Ship Via
}

/**
 * Hai bang mà **không bảng tra nào phủ tới**: `warehouse_ranking_by_state.csv` chỉ có 48
 * bang lục địa + NCA/SCA, `carrier.csv` cũng vậy. Nên chúng luôn đi luồng B2B.
 */
export const BANG_LUON_B2B = new Set(['AK', 'HI']);

/** SKU nào cần tra tồn kho TRƯỚC khi biết nó thuộc sheet nào. */
export const canTraTonDePhanLoai = model => laSkuB2CUuTien(model);

/* ---------------------------------------------------------------- kho ---- */

/** `warehouse_ranking_by_state.csv` -> { AL: ['Calhoun','MEM-R',...] } (gần → xa). */
export async function docKhoTheoBang(duongDan = path.join(GOC, '05_TraCuu', 'warehouse_ranking_by_state.csv')) {
  const txt = await fs.readFile(duongDan, 'utf8');
  const ra = {};
  for (const dong of txt.split(/\r?\n/).slice(1)) {
    const c = dong.split(',').map(s => s.trim());
    // 2–3 chữ: 48 bang lục địa + NCA/SCA. KHÔNG có AK/HI — giống carrier.csv.
    if (c.length < 2 || !/^[A-Z]{2,3}$/.test(c[0])) continue;
    ra[c[0]] = c.slice(1).filter(Boolean);
  }
  return ra;
}

/**
 * Danh sách kho ưu tiên cho một đơn.
 * SKU ngoại lệ -> ['Calhoun'] và hết, không cần tra tồn kho.
 */
export function khoUuTien(bangKho, bang, model) {
  if (laSkuNgoaiLe(model)) return { ds: ['Calhoun'], ngoaiLe: true };
  const b = String(bang).toUpperCase();
  // Bảng dùng NCA/SCA cho California, còn packing slip chỉ ghi "CA".
  // Kiểm 07/08: NCA và SCA cho THỨ TỰ KHO GIỐNG HỆT nhau, nên CA không cần
  // phân vùng Bắc/Nam — đúng như kết luận đã có với carrier.csv.
  const ds = bangKho[b] || (b === 'CA' ? bangKho.NCA : null);
  if (!ds || !ds.length) {
    throw new Error(`khong co bang "${bang}" trong warehouse_ranking_by_state.csv ` +
                    `(file chi co 48 bang luc dia + NCA/SCA — KHONG co AK/HI)`);
  }
  return { ds, ngoaiLe: false };
}

/* ------------------------------------------------------- địa chỉ kho gửi ---- */

/**
 * `kho_dia_chi.csv` -> { SAV: {kho,tenCongTy,duong,city,state,zip,lienHe,phone} }
 *
 * 🔴 VÌ SAO CÓ FILE NÀY (08/08/2026). Form web chọn kho gửi bằng dropdown
 *    "My Addresses" — chỉ cần TÊN kho, địa chỉ do UPS tự điền. **API không có
 *    dropdown**: nó đòi địa chỉ ĐẦY ĐỦ trong `ShipFrom`/`Shipper`. Đây là dữ liệu
 *    duy nhất mà đường API cần thêm so với đường trình duyệt.
 *
 * ⚠️ Lecangs KHÔNG cho địa chỉ kho — đã đo 08/08, cả hai endpoint mà UI của họ dùng
 *    (`selectEnabledWarehouse`, `getWarehouseInfo`) chỉ trả mã kho. Số liệu trong file
 *    này do người dùng lấy từ sổ địa chỉ UPS, tức đúng cái form web vẫn dùng.
 *
 * Khoá tra dùng `chuanKho()` nên `MEM-R` / `MEM R` / `memr` đều tìm ra một dòng.
 */
export async function docKhoDiaChi(duongDan = path.join(GOC, '05_TraCuu', 'kho_dia_chi.csv')) {
  const txt = await fs.readFile(duongDan, 'utf8');
  const ra = {};
  for (const dong of txt.split(/\r?\n/).slice(1)) {
    const c = tachCsv(dong);
    if (c.length < 6 || !c[0]) continue;
    ra[chuanKho(c[0])] = { kho: c[0], tenCongTy: c[1], duong: c[2], city: c[3],
                           state: c[4], zip: c[5], lienHe: c[6] || '', phone: c[7] || '' };
  }
  return ra;
}

/** So tên kho bỏ qua `-`, khoảng trắng, hoa thường: UPS ghi `MEM R`, CSV ghi `MEM-R`. */
export const chuanKho = t => String(t).toUpperCase().replace(/[\s_-]+/g, '');

/**
 * Tra một kho. Thiếu trường bắt buộc thì NÉM LỖI — UPS từ chối `Name` rỗng, và
 * label ghi sai bên gửi thì hàng về nhầm chỗ khi bị trả.
 */
export function traKho(bangKhoDiaChi, kho) {
  const k = bangKhoDiaChi[chuanKho(kho)];
  if (!k) {
    throw new Error(`kho "${kho}" khong co trong kho_dia_chi.csv (co: ` +
      Object.values(bangKhoDiaChi).map(x => x.kho).join(', ') + ')');
  }
  for (const [ten, v] of [['ten_cong_ty', k.tenCongTy], ['duong', k.duong], ['city', k.city],
                          ['state', k.state], ['zip', k.zip], ['dien_thoai', k.phone]]) {
    if (!v) throw new Error(`kho "${k.kho}": thieu "${ten}" trong kho_dia_chi.csv`);
  }
  return k;
}

/* -------------------------------------------------------------- kích thước ---- */

/** `dims_sku.csv` -> { '812250-B': {desc,L,W,H,lb} }. Khoá là Model Number NGUYÊN VẸN. */
export async function docDims(duongDan = path.join(GOC, '05_TraCuu', 'dims_sku.csv')) {
  const txt = await fs.readFile(duongDan, 'utf8');
  const ra = {};
  for (const dong of txt.split(/\r?\n/).slice(1)) {
    const c = tachCsv(dong);
    if (c.length < 6 || !c[0]) continue;
    ra[c[0]] = { desc: c[1], L: +c[2], W: +c[3], H: +c[4], lb: +c[5] };
  }
  return ra;
}

function tachCsv(dong) {
  const ra = []; let cur = '', ngoac = false;
  for (const ch of dong) {
    if (ch === '"') ngoac = !ngoac;
    else if (ch === ',' && !ngoac) { ra.push(cur); cur = ''; }
    else cur += ch;
  }
  ra.push(cur);
  return ra.map(s => s.trim());
}

/**
 * Tra kích thước + cân nặng THÙNG cho UPS.
 *
 * 🔴 TRA BẰNG MODEL NUMBER NGUYÊN VẸN, GIỮ HẬU TỐ `-B`.
 *    Bỏ hậu tố rồi tra bản số là lấy **sản phẩm khác**:
 *      812250    26x26x3   31 lb  "Counter Top - 2FTx25"   <- tấm 2 ft
 *      812250-B 146x27x2  128 lb  "12Ft Unfinished"        <- tấm 12 ft
 *    `skuTuModel()` trong `bol-tinh.mjs` CÓ bỏ hậu tố — đúng cho `pallet.csv`,
 *    SAI cho file này. Đừng dùng lại nó ở đây.
 *
 * 🔴 KHÔNG cộng 55. `+55` trong công thức BOL của đơn Misc là **cái pallet**;
 *    đơn Ground đi UPS từng thùng lẻ nên không có pallet.
 *    (Đối chiếu 07/08: Carton Weight = đúng cột K của `pallet.csv`.)
 *
 * Còn 125/523 SKU trong file để `0` — không thuộc nhóm dự án dùng. Gặp thì NÉM LỖI
 * để đơn bị gạt sang danh sách chờ, KHÔNG gửi `0` lên UPS.
 */
export function traDims(dims, model) {
  const m = String(model).trim();
  const d = dims[m];
  if (!d) throw new Error(`Model "${m}" khong co trong dims_sku.csv (tra nguyen ven, KHONG bo hau to -B)`);
  for (const [ten, v] of [['Carton Len', d.L], ['Carton Wid', d.W], ['Carton Hgt', d.H], ['Carton Weight', d.lb]]) {
    if (!Number.isFinite(v) || v <= 0) {
      throw new Error(`Model "${m}": ${ten} = ${v} — thieu so lieu, KHONG duoc gui 0 len UPS`);
    }
  }
  return { model: m, ...d };
}

/* ------------------------------------------------------------ ngày pickup ---- */

/**
 * Ngày pickup cho đơn GROUND — KHÁC đơn Misc.
 *
 * Theo **giờ Việt Nam** lúc điền đơn:
 *   sau 15:00        -> quy tắc Misc (hôm nay + T6 +3 / T7 +2 / còn lại +1)
 *   trước/đúng 15:00 -> quy tắc Misc **rồi TRỪ 1 ngày**
 *
 * ⚠️ KHÔNG bỏ Thứ Bảy/Chủ Nhật sau khi trừ (chốt 06/08). Ngày chọn theo **giờ Mỹ**
 *    để phía Mỹ kịp chuẩn bị; trừ 1 là bù chênh múi giờ, không phải quy tắc nghiệp vụ.
 *    VD Thứ Sáu trước 15:00 VN: +3 -> Thứ Hai, −1 -> **Chủ Nhật**. Vẫn lấy Chủ Nhật.
 *
 * ⚠️ Quy tắc ±15:00 này CHỈ cho Ground. Đơn Misc giữ `ngayPickup()` ở `bol-tinh.mjs`
 *    (chốt 07/08 — không áp cho Misc).
 */
export function ngayPickupGround(bayGio = new Date()) {
  // giờ Việt Nam bất kể máy đặt múi giờ nào
  const vn = new Date(bayGio.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const thu = vn.getDay();                                  // 0=CN 5=T6 6=T7
  const them = thu === 5 ? 3 : thu === 6 ? 2 : 1;
  const truoc = vn.getHours() < 15 || (vn.getHours() === 15 && vn.getMinutes() === 0);
  const d = new Date(vn.getFullYear(), vn.getMonth(), vn.getDate() + them - (truoc ? 1 : 0));
  return {
    d,
    mdy: `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`,
    mmddyyyy: `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`,
    truoc15h: truoc,
    gioVN: `${String(vn.getHours()).padStart(2, '0')}:${String(vn.getMinutes()).padStart(2, '0')}`
  };
}

/* ------------------------------------------------------- địa chỉ giao ---- */

/**
 * Hai dòng địa chỉ — luật KHÁC nhau giữa store và khách lẻ, dùng chung cho cả
 * UPS lẫn Lecangs:
 *   store    -> dòng 1 = phần `C/O ...`, dòng 2 = địa chỉ đường phố
 *   khách lẻ -> dòng 1 = địa chỉ đường phố, dòng 2 trống
 * Còn ô TÊN thì **cả hai đều BỎ phần `C/O ...`** (khác BOL của đơn Misc — ở đó
 * store phải ghi cả dòng C/O vào Company Name).
 */
export function diaChiGiao(shipTo) {
  /* 🔴 TRẢ VỀ ĐÚNG TÊN TRƯỜNG MÀ `ups-form.dienNoiNhan()` ĐỌC.
   * Bản trước trả `{ten, d1, d2}` trong khi `dienNoiNhan()` đọc
   * `{tenKhach, diaChi1, diaChi2}` — nối hai module vào là gãy ngay với lỗi
   * "dienNoiNhan: thieu diaChi1". Chưa ai gọi nên chưa nổ, nhưng chú thích bên
   * `ups-form.mjs` lại bảo "đã tách sẵn" nên rất dễ tin nhầm. Phát hiện 08/08 khi
   * viết `test-ground-tra.mjs`.
   *
   * Luật (tài liệu Phần 1 Mục 1):
   *   store    : Address Line 1 = phần `C/O ...`, Line 2 = địa chỉ đường phố
   *   khách lẻ : Address Line 1 = địa chỉ đường phố, Line 2 = trống
   * ⚠️ Store thì **KHÔNG** điền phần `C/O ...` vào Full Name — chỉ tên cửa hàng. */
  const { ten, co, laStore, diaChi, city, bang, zip, phone } = shipTo;
  return {
    tenKhach:  ten,
    tenLienHe: ten,                       // tài liệu: giống Full Name
    diaChi1:   laStore ? co : diaChi,
    diaChi2:   laStore ? diaChi : '',
    city, zip,
    state:     bang,                      // slip gọi `bang`, form UPS gọi `state`
    dienThoai: phone || ''
  };
}

/* ===========================================================================
 *  Chia lô theo kho — dùng bởi `xu-ly-ground.mjs`
 *  Đặt ở đây vì `xu-ly-ground.mjs` gọi `main()` ngay khi import nên không test
 *  được từ ngoài, còn hai hàm này là logic thuần, không chạm mạng.
 * ======================================================================== */

export const chuanTen = s => String(s || '').trim().toUpperCase();

/**
 * Chia các dòng hàng thành các lô theo kho — mỗi lô sẽ thành MỘT shipment.
 *
 * Người dùng chốt 12/08/2026: đơn mà không kho nào còn đủ mọi mã thì **tách 2 shipment,
 * mỗi lần 1 kho, điền giống PO number**. Trước đó tool dừng và báo người.
 *
 * Thứ tự xét — không đảo:
 *   1. Còn kho nào đủ **mọi** mã thì dùng kho đó, một shipment. Gộp vẫn hơn tách:
 *      khách nhận một lần, và ta không tạo thêm đơn xuất kho nào.
 *   2. Không có thì mỗi mã lấy ở kho ưu tiên cao nhất còn đủ **mã đó**, rồi gộp các mã
 *      trùng kho lại. Ưu tiên theo bang giao, dùng lại `x.uuTien.ds`.
 *   3. Mã nào không kho nào đủ -> NÉM LỖI. Không tách nhỏ qty của một mã ra hai kho:
 *      "mỗi mã một kho" là điều đã được chốt, tách sâu hơn thì chưa ai duyệt.
 */
export function chiaTheoKho(po, tonTheoSku, dsUuTien) {
  const conO = (hang, tenKho, qty) => {
    const h = hang.find(z => chuanTen(z.kho) === chuanTen(tenKho));
    return !!h && h.con >= qty;
  };

  const duMoiSku = dsUuTien.filter(tenKho =>
    tonTheoSku.every(({ k, hang }) => conO(hang, tenKho, k.qty)));
  if (duMoiSku.length) return [{ tenKho: duMoiSku[0], kien: tonTheoSku.map(t => t.k) }];

  const thieu = [], theoKho = new Map();
  for (const { k, hang } of tonTheoSku) {
    const tenKho = dsUuTien.find(z => conO(hang, z, k.qty));
    if (!tenKho) {
      thieu.push(`${k.model} x${k.qty} (ton: ${hang.map(h => `${h.kho}=${h.con}`).join(' · ') || 'khong kho nao co'})`);
      continue;
    }
    if (!theoKho.has(tenKho)) theoKho.set(tenKho, []);
    theoKho.get(tenKho).push(k);
  }
  if (thieu.length) {
    throw new Error(`${po}: KHONG kho nao du hang cho ${thieu.join(' | ')}. ` +
      `Uu tien: ${dsUuTien.join('>')}. -> DUNG, hoi nguoi dung.`);
  }
  // Giữ đúng thứ tự ưu tiên để log và tên file ổn định giữa các lần chạy.
  return dsUuTien.filter(z => theoKho.has(z)).map(z => ({ tenKho: z, kien: theoKho.get(z) }));
}

/**
 * Bằng chứng đời cũ (trước 12/08/2026) để `shipmentId`/`kho` ngay ở gốc, chưa có `lo`.
 * Dựng `lo` cho chúng, nếu không đơn đã chạy sẽ bị coi là chưa tạo shipment nào và
 * lần chạy sau **mua lại nhãn** cho đúng đơn đó.
 */
export function nangBangChungDoiCu(bc) {
  if (!bc) return null;
  if (Array.isArray(bc.lo)) return bc;
  return { ...bc, lo: [{ kho: bc.kho, shipmentId: bc.shipmentId, cuoc: bc.cuoc,
                         soKien: (bc.kien || []).length }] };
}
