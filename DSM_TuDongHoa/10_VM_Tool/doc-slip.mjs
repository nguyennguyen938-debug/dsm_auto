/**
 * ============================================================================
 *  doc-slip.mjs — đọc <PO>_PackingSlip.pdf ra dữ liệu có cấu trúc
 * ----------------------------------------------------------------------------
 *  THẤT BẠI TO CÒN HƠN ĐOÁN SAI. Mọi trường đều có khuôn bắt buộc; lệch khuôn
 *  thì ném lỗi để đơn bị gạt sang danh sách chờ người xem, KHÔNG trả giá trị
 *  "hợp lý" rồi để BOL đi sai địa chỉ.
 *
 *  KHẢO SÁT 05/08/2026 — trang packing slip bị XOAY 90°:
 *    - Cái trông như trục X mới là trục "dòng"; trục Y là vị trí ngang.
 *    - Nhãn và giá trị khớp nhau theo **cùng toạ độ x**, giá trị có y lớn hơn:
 *        y=267 x=94  "Purchase Order #:"   ->  y=344 x=94  "48559271"
 *        y=267 x=122 "Ship Via:"           ->  y=306 x=122 "Misc. Common Carrier"
 *    - Khối "Ordered By" và "Ship To" nằm CẠNH nhau ở cùng y, phân biệt bằng x.
 *      Gom theo y sẽ dính hai khối làm một -> lấy nhầm tên người nhận.
 * ==========================================================================*/

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'node:fs/promises';

/** Bang hợp lệ — đúng 49 mã trong carrier.csv. AK/HI CỐ Ý không có: gặp thì phải hỏi người. */
export const BANG_HOP_LE = new Set(('AL AR AZ CO CT DC DE FL GA IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT ' +
  'NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY CA').split(' '));

const chuan = s => String(s).replace(/\s+/g, ' ').trim();

async function docItems(duongDan) {
  const doc = await getDocument({
    data: new Uint8Array(await fs.readFile(duongDan)), useSystemFonts: true
  }).promise;
  if (doc.numPages !== 1) {
    throw new Error(`file co ${doc.numPages} trang — mong doi 1 (da tach chua?)`);
  }
  const tc = await (await doc.getPage(1)).getTextContent();
  return tc.items
    .filter(i => i.str.trim())
    .map(i => ({ x: Math.round(i.transform[4]), y: Math.round(i.transform[5]), s: chuan(i.str) }));
}

/** Tìm ĐÚNG MỘT phần tử có nội dung khớp. Không có hoặc có nhiều -> ném lỗi. */
function nhan(items, text) {
  const ds = items.filter(i => i.s === text);
  if (ds.length !== 1) throw new Error(`nhan "${text}": thay ${ds.length} chỗ, mong doi dung 1`);
  return ds[0];
}

/** Giá trị của một nhãn ở khối đầu: cùng x (±2), y lớn hơn, lấy cái gần nhất. */
function giaTriTheoCot(items, lb) {
  const ds = items.filter(i => Math.abs(i.x - lb.x) <= 2 && i.y > lb.y).sort((a, b) => a.y - b.y);
  if (!ds.length) throw new Error(`khong thay gia tri duoi nhan tai x=${lb.x}`);
  return ds[0].s;
}

/**
 * Giá trị trong BẢNG MẶT HÀNG — quy tắc khác khối đầu.
 * Ở đây nhãn và giá trị nằm ở HAI CỘT x cạnh nhau, còn y thì xê dịch:
 *   y=375 x=299 "Qty Shipped"      -> y=398 x=312 "1"          (y lệch +23)
 *   y=197 x=299 "Item Description" -> y=192 x=312 "..."        (y lệch  -5)
 *   y=106 x=299 "Internet Number"  -> y=106 x=312 "700203654"  (y lệch   0)
 * Nên: lọc theo cột x kế bên rồi lấy phần tử có y GẦN NHẤT. Các nhãn cách nhau
 * xa về y (375/197/106/25) nên "gần nhất" không nhập nhằng.
 */
function giaTriTrongBang(items, lb) {
  const ds = items.filter(i => i.x > lb.x + 5 && i.x < lb.x + 30);
  if (!ds.length) return null;
  return ds.sort((a, b) => Math.abs(a.y - lb.y) - Math.abs(b.y - lb.y))[0].s;
}

/**
 * Giá trị NHIỀU MẨU trong bảng — dùng cho Item Description khi bị ngắt dòng:
 *   y=192 x=312 "Unfinished Hevea Butcher Block"
 *   y=192 x=324 "Countertop - 10ft x 25in x 1.5in"
 * Gộp mọi mẩu cùng y (±3) trong cột giá trị, xếp theo x.
 */
function nhieuManhTrongBang(items, lb) {
  const gan = items.filter(i => i.x > lb.x + 5 && i.x < lb.x + 30);
  if (!gan.length) return null;
  const yGoc = gan.sort((a, b) => Math.abs(a.y - lb.y) - Math.abs(b.y - lb.y))[0].y;
  return gan.filter(i => Math.abs(i.y - yGoc) <= 3).sort((a, b) => a.x - b.x).map(i => i.s).join(' ');
}

export async function docSlip(duongDan) {
  const items = await docItems(duongDan);

  // ---- khối đầu: nhãn và giá trị khớp theo cột x -------------------------
  const customerOrder = giaTriTheoCot(items, nhan(items, 'Customer Order #:'));
  const po            = giaTriTheoCot(items, nhan(items, 'Purchase Order #:'));
  const ngay          = giaTriTheoCot(items, nhan(items, 'Date:'));
  const shipVia       = giaTriTheoCot(items, nhan(items, 'Ship Via:'));
  let addressType = null;
  try { addressType = giaTriTheoCot(items, nhan(items, 'Address Type:')); } catch { /* khong phai slip nao cung co */ }

  if (!/^\d{8}$/.test(po)) throw new Error(`PO "${po}" khong phai 8 chu so`);

  // Đối chiếu chéo: PO và Customer Order còn xuất hiện lần nữa ở cuối trang.
  // Hai chỗ lệch nhau = đọc sai cột -> dừng, đừng tin chỗ nào.
  const duoi = items.map(i => i.s).join(' | ');
  const poDuoi = duoi.match(/PO #\s*(\d{8})/);
  if (poDuoi && poDuoi[1] !== po) throw new Error(`PO khong khop: dau trang "${po}", cuoi trang "${poDuoi[1]}"`);
  const coDuoi = duoi.match(/Customer Order #:\s*(WH\d+)/);
  if (coDuoi && coDuoi[1] !== customerOrder) {
    throw new Error(`Customer Order khong khop: "${customerOrder}" vs "${coDuoi[1]}"`);
  }

  // ---- Ship Via: chỉ chấp nhận hai dạng ĐÃ BIẾT ---------------------------
  let loai;
  if (/^Misc/i.test(shipVia)) loai = 'Misc';
  else if (/^Ground/i.test(shipVia)) loai = 'Ground';
  else throw new Error(`Ship Via la "${shipVia}" — chua tung gap, khong doan`);

  // ---- Ship To: tách theo x, KHÔNG gom theo y -----------------------------
  const lbOrderedBy = nhan(items, 'Ordered By:');
  const lbShipTo    = nhan(items, 'Ship To:');
  const dongShipTo = items
    .filter(i => Math.abs(i.y - lbShipTo.y) <= 4 && i.x > lbShipTo.x)
    .sort((a, b) => a.x - b.x)
    .map(i => i.s);
  if (dongShipTo.length < 4) throw new Error(`khoi Ship To chi co ${dongShipTo.length} dong, mong doi >= 4`);

  const orderedBy = items
    .filter(i => Math.abs(i.y - lbOrderedBy.y) <= 4 && i.x > lbOrderedBy.x && i.x < lbShipTo.x)
    .sort((a, b) => a.x - b.x).map(i => i.s)[0] || null;

  // dòng 1 = tên; dòng 2 CÓ "C/O" -> gửi store; phone là dòng cuối
  const ten = dongShipTo[0];
  const laStore = /\bC\/O\b/i.test(dongShipTo[1] || '');
  const co = laStore ? dongShipTo[1] : null;
  const conLai = dongShipTo.slice(laStore ? 2 : 1);

  const iCsz = conLai.findIndex(d => /^(.+),\s*([A-Z]{2})\s+(\d{5})(-\d{4})?$/.test(d));
  if (iCsz < 0) throw new Error(`khong thay dong "City, ST ZIP" trong: ${JSON.stringify(conLai)}`);
  const m = conLai[iCsz].match(/^(.+),\s*([A-Z]{2})\s+(\d{5})(-\d{4})?$/);
  const [, city, bang, zip] = m;
  const diaChi = conLai.slice(0, iCsz).join(', ');
  const phone = conLai.slice(iCsz + 1).find(d => /\d{3}.*\d{4}/.test(d)) || null;

  if (!diaChi) throw new Error('khong thay dong dia chi duong pho');
  if (!BANG_HOP_LE.has(bang)) throw new Error(`bang "${bang}" khong co trong carrier.csv — DUNG, hoi nguoi dung`);

  // ---- mặt hàng ----------------------------------------------------------
  // Nhiều SKU: CHƯA CÓ MẪU THẬT nào để kiểm. Phát hiện thì dừng, không đoán —
  // đọc sót một dòng SKU nghĩa là BOL ghi thiếu cân.
  // "Model Number" xuất hiện 2 lần (phần trả hàng + phần packing slip).
  // Cả hai phải cho CÙNG một mã — lệch nghĩa là đọc nhầm cột, dừng ngay.
  const lbModel = items.filter(i => i.s === 'Model Number');
  if (!lbModel.length) throw new Error('khong thay nhan "Model Number"');
  const models = lbModel.map(lb => giaTriTrongBang(items, lb)).filter(Boolean);
  const modelDuyNhat = [...new Set(models)];
  if (modelDuyNhat.length === 0) throw new Error('khong doc duoc Model Number');
  if (modelDuyNhat.length > 1) {
    throw new Error(`Model Number doc ra ${modelDuyNhat.length} gia tri khac nhau ` +
                    `(${modelDuyNhat.join(', ')}) — hoac don nhieu SKU, hoac doc nham cot. ` +
                    `Chua co mau that de phan biet, KHONG tu xu ly`);
  }

  const qtyStr = giaTriTrongBang(items, nhan(items, 'Qty Shipped'));
  const qty = parseInt(qtyStr, 10);
  if (!Number.isInteger(qty) || qty < 1) throw new Error(`Qty Shipped "${qtyStr}" khong hop le`);

  // Item Description — cột H của sheet lấy chuỗi NÀY (mô tả trên slip),
  // KHÔNG phải mô tả trong pallet.csv. Hai chuỗi khác nhau; lấy nhầm là sheet
  // ghi tên hàng không khớp giấy tờ gửi khách.
  // Nhãn xuất hiện 2 lần (phần trả hàng + phần slip) -> lấy bản DÀI hơn, vì
  // bản trong phần trả hàng thường bị cắt ngắn.
  const moTaHang = items.filter(i => i.s === 'Item Description')
    .map(lb => nhieuManhTrongBang(items, lb))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] || null;
  if (!moTaHang) throw new Error('khong doc duoc Item Description');

  return {
    po, customerOrder, ngay, shipVia, loai, addressType, orderedBy,
    shipTo: { ten, co, laStore, diaChi, city, bang, zip, phone },
    items: [{ model: modelDuyNhat[0], qty, moTa: moTaHang }]
  };
}

/** Tra carrier: cột A khi gửi store (có C/O), cột B khi gửi customer. */
export function chonCarrier(bangCarrier, bang, laStore) {
  const h = bangCarrier[bang];
  if (!h) throw new Error(`carrier.csv khong co bang "${bang}" — DUNG, hoi nguoi dung`);
  const ma = laStore ? h.store : h.customer;
  if (!ma) throw new Error(`carrier.csv thieu ma cho ${bang} (${laStore ? 'store' : 'customer'})`);
  return ma;
}

export async function docBangCarrier(duongDan) {
  const txt = await fs.readFile(duongDan, 'utf8');
  const ra = {};
  for (const dong of txt.split(/\r?\n/)) {
    const c = dong.split(',').map(x => x.replace(/^"|"$/g, '').trim());
    if (c.length < 3) continue;
    const bang = (c[2] || '').toUpperCase();
    if (/^[A-Z]{2,3}$/.test(bang) && bang !== 'ZIP') ra[bang] = { store: c[0], customer: c[1] };
  }
  return ra;
}
