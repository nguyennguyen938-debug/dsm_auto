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
 * 4 SKU LUÔN đi kho Calhoun và KHÔNG qua Lecangs.
 * So khớp theo phần SỐ của Model Number (`816390-B` và `816390` đều tính).
 */
export const SKU_NGOAI_LE = new Set(['838390', '836390', '816390', '818390']);

export const laSkuNgoaiLe = model => SKU_NGOAI_LE.has(String(model).match(/^(\d+)/)?.[1] ?? '');

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
