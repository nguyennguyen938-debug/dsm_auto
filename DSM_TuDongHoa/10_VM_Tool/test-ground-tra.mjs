#!/usr/bin/env node
/**
 * test-ground-tra.mjs — kiểm `ground-tra.mjs`. Thuần dữ liệu, KHÔNG đụng mạng.
 *
 *     node 10_VM_Tool/test-ground-tra.mjs
 *
 * Viết lại 08/08 vì bộ test cũ chạy inline lúc phát triển rồi mất, trong khi tài liệu
 * vẫn ghi "22/22 test" — phiên sau không có cách nào chạy lại để tin con số đó.
 *
 * Mỗi ca dưới đây đều là **một lỗi thật đã gặp**, không phải test cho có.
 */

import {
  SKU_NGOAI_LE, laSkuNgoaiLe, docKhoTheoBang, khoUuTien,
  docDims, traDims, ngayPickupGround, diaChiGiao
} from './ground-tra.mjs';

let pass = 0, fail = 0;
const ck = (ten, thuc, mong) => {
  const ok = JSON.stringify(thuc) === JSON.stringify(mong);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${ten}` +
    (ok ? '' : `\n        ra   = ${JSON.stringify(thuc)}\n        mong = ${JSON.stringify(mong)}`));
};
const nem = async (ten, fn) => {
  try { await fn(); fail++; console.log(`FAIL  ${ten} — dang le phai NEM LOI`); }
  catch { pass++; console.log(`PASS  ${ten}`); }
};

/* ---------------------------------------------------------- SKU ngoại lệ ---- */
ck('4 SKU ngoai le dung danh sach', [...SKU_NGOAI_LE].sort(),
   ['816390', '818390', '836390', '838390']);
ck('nhan dien SKU ngoai le co hau to -B', laSkuNgoaiLe('816390-B'), true);
ck('SKU thuong khong bi nham la ngoai le', laSkuNgoaiLe('833250'), false);

/* ----------------------------------------------------------------- kho ---- */
const bangKho = await docKhoTheoBang();
ck('doc du 50 ma bang (48 luc dia + NCA/SCA)', Object.keys(bangKho).length, 50);
ck('co NCA va SCA', [!!bangKho.NCA, !!bangKho.SCA], [true, true]);
ck('KHONG co AK/HI', [!!bangKho.AK, !!bangKho.HI], [false, false]);

// 🔴 Regex `^[A-Z]{2}$` từng loại mất NCA/SCA -> chỉ đọc được 48/50 mã.
ck('NCA va SCA cho THU TU KHO giong het nhau',
   JSON.stringify(bangKho.NCA) === JSON.stringify(bangKho.SCA), true);
ck('CA duoc anh xa sang NCA (slip chi ghi "CA")',
   khoUuTien(bangKho, 'CA', '833250').ds, bangKho.NCA);

ck('SKU ngoai le -> ep Calhoun, khong tra ton kho',
   khoUuTien(bangKho, 'TX', '838390'), { ds: ['Calhoun'], ngoaiLe: true });
ck('TX uu tien kho gan nhat truoc', khoUuTien(bangKho, 'TX', '833250').ds[0], 'HOU07');
await nem('bang khong co trong bang tra (AK) -> nem loi',
          async () => khoUuTien(bangKho, 'AK', '833250'));

/* ------------------------------------------------------------ kích thước ---- */
const dims = await docDims();

/* 🔴 BẪY ĐẮT NHẤT: `812250` và `812250-B` là HAI SAN PHAM KHAC NHAU.
 *    812250   = tấm 2 ft, 31 lb
 *    812250-B = tấm 12 ft, 128 lb
 *    Bỏ hậu tố `-B` rồi tra bản số là sai gấp hơn 4 lần cân nặng. */
const a = traDims(dims, '812250'), b = traDims(dims, '812250-B');
ck('812250 va 812250-B KHAC nhau', a.lb !== b.lb, true);
ck('812250 la tam 2ft ~31 lb', a.lb, 31);
ck('812250-B la tam 12ft ~128 lb', b.lb, 128);
ck('tra dung 833250', [traDims(dims, '833250').lb, traDims(dims, '833250').L], [54, 40]);

await nem('SKU khong co trong bang -> nem loi',
          async () => traDims(dims, 'KHONG-TON-TAI-999'));

/* 125/523 SKU trong file để số 0 — gửi 0 lên UPS là tạo label sai. */
const soKhong = Object.values(dims).filter(d => !d.lb || !d.L || !d.W || !d.H).length;
ck('van con SKU de 0 (phai chan, khong duoc gui len UPS)', soKhong > 0, true);

/* -------------------------------------------------------- ngày pickup ---- */
/* Quy tắc: sau 15:00 giờ VN dùng công thức Misc (T6 +3 / T7 +2 / còn lại +1);
 * trước hoặc đúng 15:00 thì công thức đó RỒI TRỪ 1 NGÀY.
 * ✅ Chốt 06/08: KHÔNG bỏ Thứ Bảy/Chủ Nhật sau khi trừ — ngày chọn theo giờ Mỹ,
 *    trừ 1 ngày chỉ để bù chênh múi giờ. */
const t = (iso) => ngayPickupGround(new Date(iso));

// Thứ Sáu 07/08/2026, 10:00 giờ VN (03:00 UTC) -> +3 = Thứ Hai 10/08, −1 = Chủ Nhật 09/08
ck('T6 truoc 15h -> CHU NHAT (khong bo cuoi tuan)', t('2026-08-07T03:00:00Z').mdy, '8/9/2026');
// Thứ Sáu 07/08, 16:00 giờ VN (09:00 UTC) -> +3, không trừ
ck('T6 sau 15h -> Thu Hai', t('2026-08-07T09:00:00Z').mdy, '8/10/2026');
ck('co co truoc15h dung', [t('2026-08-07T03:00:00Z').truoc15h, t('2026-08-07T09:00:00Z').truoc15h],
   [true, false]);
ck('tra ve ca dang mm/dd/yyyy cho fillRow', /^\d{2}\/\d{2}\/\d{4}$/.test(t('2026-08-07T09:00:00Z').mmddyyyy), true);

/* ------------------------------------------------------------- địa chỉ ---- */
/* store   : Address Line 1 = "C/O ...", Line 2 = đường phố
 * khách lẻ: Line 1 = đường phố,        Line 2 = trống */
const store = diaChiGiao({ ten: 'THE HOME DEPOT 1234', co: 'C/O JOHN DOE',
                           laStore: true, diaChi: '100 MAIN ST' });
ck('store: Line1 la C/O, Line2 la duong pho', [store.diaChi1, store.diaChi2],
   ['C/O JOHN DOE', '100 MAIN ST']);
ck('store: Full Name KHONG kem C/O', store.tenKhach, 'THE HOME DEPOT 1234');
const le = diaChiGiao({ ten: 'Samuel Oates', co: null, laStore: false,
                        diaChi: '3078 Old Salisbury Rd' });
ck('khach le: Line1 la duong pho, Line2 trong', [le.diaChi1, le.diaChi2],
   ['3078 Old Salisbury Rd', '']);

/* Khớp trực tiếp với `ups-form.dienNoiNhan()` — nó ném lỗi nếu thiếu trường nào. */
const day = diaChiGiao({ ten: 'Samuel Oates', co: null, laStore: false,
  diaChi: '3078 Old Salisbury Rd', city: 'Winston Salem', bang: 'NC',
  zip: '27127', phone: '(336) 287-3362' });
ck('tra du truong ma dienNoiNhan() doi',
   ['tenKhach','diaChi1','city','zip','state','dienThoai'].every(k => day[k]), true);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
