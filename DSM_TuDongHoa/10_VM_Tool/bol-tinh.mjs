/**
 * ============================================================================
 *  bol-tinh.mjs — tính Weight / Class / Description cho BOL
 * ----------------------------------------------------------------------------
 *  Dùng chung cho AACT, CTII và form BOL chung. Công thức chốt trong
 *  `01_HuongDan_VanHanh/3_QuyTrinh_AACT.md` (mục CLASS) và `6_QuyTrinh_CTII.md`.
 *
 *  🔴 HAI BỘ KÍCH THƯỚC KHÁC NHAU, RẤT DỄ NHẦM:
 *    - Tính CLASS  -> Product Dimension: L = cột C, W = cột D, H = 6 + 2×Qty
 *                     (KHÔNG dùng cột E, và KHÔNG dùng kích thước pallet)
 *    - Viết MÔ TẢ  -> Pallet Dimension : cột F × G × H
 *  Lấy nhầm bộ nào cũng ra số trông hợp lý nhưng sai.
 *
 *  WEIGHT = (cột K) × Qty + 55. Cộng 55 **một lần** cho pallet, không nhân theo Qty.
 * ==========================================================================*/

import fs from 'node:fs/promises';
import { parse } from 'node:path';

/** pallet.csv -> { '812250': {desc, L, W, T, palL, palW, palH, K} } */
export async function docPallet(duongDan) {
  const txt = await fs.readFile(duongDan, 'utf8');
  const ra = {};
  for (const dong of txt.split(/\r?\n/)) {
    const c = tachCsv(dong);
    if (!c.length || !/^\d+$/.test((c[0] || '').trim())) continue;
    ra[c[0].trim()] = {
      desc: c[1], L: +c[2], W: +c[3], T: +c[4],
      palL: +c[5], palW: +c[6], palH: +c[7], K: +c[10]
    };
  }
  return ra;
}

/** class.csv -> [{cls, min, max}] . Max rỗng = không giới hạn trên. */
export async function docClass(duongDan) {
  const txt = await fs.readFile(duongDan, 'utf8');
  const ra = [];
  for (const dong of txt.split(/\r?\n/)) {
    const c = tachCsv(dong);
    if (c.length < 2 || !/^[\d.]+$/.test((c[0] || '').trim())) continue;
    ra.push({ cls: c[0].trim(), min: parseFloat(c[1]), max: c[2] === '' ? Infinity : parseFloat(c[2]) });
  }
  if (!ra.length) throw new Error('class.csv: khong doc duoc dong nao');
  return ra;
}

function tachCsv(dong) {
  const ra = []; let cur = '', trongNgoac = false;
  for (const ch of dong) {
    if (ch === '"') trongNgoac = !trongNgoac;
    else if (ch === ',' && !trongNgoac) { ra.push(cur); cur = ''; }
    else cur += ch;
  }
  ra.push(cur);
  return ra.map(s => s.trim());
}

/** Model Number -> SKU: bỏ hậu tố chữ. '812250-B' -> '812250'. */
export function skuTuModel(model) {
  const m = String(model).match(/^(\d+)/);
  if (!m) throw new Error(`Model "${model}" khong bat dau bang so`);
  return m[1];
}

/**
 * Tính toàn bộ số liệu BOL cho MỘT đơn.
 *
 * Nhận **một** dòng hàng `{model, qty}` hoặc **mảng** nhiều dòng hàng.
 *
 * 🔄 Nhận mảng từ 12/08/2026, sau khi người dùng chốt **cách A — xếp chung một pallet**:
 * nhiều mã hàng trên cùng phiếu thì kho chồng lên một pallet, không tách. Hệ quả:
 *   · WEIGHT  = Σ(cột K × Qty của mọi mã) **+ 55 một lần** — một pallet thì một lần
 *   · H       = 6 + 2 × **tổng** số tấm (người dùng xác nhận công thức +2″/tấm vẫn đúng
 *               khi chồng khác loại)
 *   · L, W    = **lớn nhất** theo từng chiều — pallet phải bao được tấm rộng nhất.
 *               Lấy L/W của mã đầu tiên là sai: tấm rộng 39″ không nằm vừa pallet rộng 25″.
 * Truyền một dòng hàng thì kết quả y hệt bản cũ.
 *
 * Ném lỗi nếu SKU không có trong pallet.csv hoặc PCF không rơi vào khoảng nào —
 * thà dừng còn hơn ghi BOL sai cân, sai class.
 */
export function tinhBOL(hangHoa, pallet, bangClass) {
  const ds = Array.isArray(hangHoa) ? hangHoa : [hangHoa];
  if (!ds.length) throw new Error('tinhBOL: khong co dong hang nao');

  let wsum = 0, tongQty = 0;
  let L = 0, W = 0, palL = 0, palW = 0, palH = 0;
  const skus = [], itemDescs = [];

  for (const { model, qty } of ds) {
    const sku = skuTuModel(model);
    const p = pallet[sku];
    if (!p) throw new Error(`SKU ${sku} (tu model ${model}) KHONG CO trong pallet.csv`);
    if (!Number.isFinite(p.K) || p.K <= 0) throw new Error(`SKU ${sku}: cot K khong hop le (${p.K})`);
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) throw new Error(`SKU ${sku}: qty khong hop le (${qty})`);

    wsum += p.K * q;
    tongQty += q;
    L = Math.max(L, p.L);  W = Math.max(W, p.W);          // pallet bao ngoài
    palL = Math.max(palL, p.palL);
    palW = Math.max(palW, p.palW);
    palH = Math.max(palH, p.palH);
    skus.push(sku);
    itemDescs.push(p.desc);
  }

  const weight = wsum + 55;                         // +55 MỘT lần cho pallet chung
  const H = 6 + 2 * tongQty;                        // KHÔNG dùng cột E
  const pcf = (1728 * weight) / (L * W * H);        // Product Dimension

  const d = bangClass.find(r => pcf >= r.min && pcf < r.max);
  if (!d) throw new Error(`PCF ${pcf.toFixed(2)} khong roi vao khoang nao trong class.csv`);

  return {
    sku: skus[0], skus, weight, qty: tongQty, pcf: Math.round(pcf * 100) / 100, cls: d.cls,
    // Mô tả dùng PALLET Dimension (F/G/H) — khác bộ dùng để tính class
    moTa: `${tongQty} pallet - ${palL}″ x ${palW}″ x ${palH}″ - ${weight} lbs`,
    itemDesc: itemDescs[0], itemDescs
  };
}

/** Mã bang 2 chữ -> tên đầy đủ (select của CTII dùng tên đầy đủ). */
export const TEN_BANG = {
  AL:'ALABAMA', AK:'ALASKA', AZ:'ARIZONA', AR:'ARKANSAS', CA:'CALIFORNIA', CO:'COLORADO',
  CT:'CONNECTICUT', DE:'DELAWARE', DC:'DISTRICT OF COLUMBIA', FL:'FLORIDA', GA:'GEORGIA',
  HI:'HAWAII', ID:'IDAHO', IL:'ILLINOIS', IN:'INDIANA', IA:'IOWA', KS:'KANSAS', KY:'KENTUCKY',
  LA:'LOUISIANA', ME:'MAINE', MD:'MARYLAND', MA:'MASSACHUSETTS', MI:'MICHIGAN', MN:'MINNESOTA',
  MS:'MISSISSIPPI', MO:'MISSOURI', MT:'MONTANA', NE:'NEBRASKA', NV:'NEVADA', NH:'NEW HAMPSHIRE',
  NJ:'NEW JERSEY', NM:'NEW MEXICO', NY:'NEW YORK', NC:'NORTH CAROLINA', ND:'NORTH DAKOTA',
  OH:'OHIO', OK:'OKLAHOMA', OR:'OREGON', PA:'PENNSYLVANIA', RI:'RHODE ISLAND',
  SC:'SOUTH CAROLINA', SD:'SOUTH DAKOTA', TN:'TENNESSEE', TX:'TEXAS', UT:'UTAH', VT:'VERMONT',
  VA:'VIRGINIA', WA:'WASHINGTON', WV:'WEST VIRGINIA', WI:'WISCONSIN', WY:'WYOMING'
};

/** Ngày pickup: hôm nay + (Thứ Sáu +3 · Thứ Bảy +2 · còn lại +1). */
export function ngayPickup(homNay = new Date()) {
  const t = homNay.getDay();                       // 0=CN 5=T6 6=T7
  const them = t === 5 ? 3 : t === 6 ? 2 : 1;
  const d = new Date(homNay.getFullYear(), homNay.getMonth(), homNay.getDate() + them);
  return { d, mdy: `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`,
           mmddyyyy: `${String(d.getMonth() + 1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}` };
}
