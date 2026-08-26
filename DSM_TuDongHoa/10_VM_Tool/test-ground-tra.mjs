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
  docDims, traDims, ngayPickupGround, diaChiGiao,
  docKhoDiaChi, traKho, chuanKho,
  phanLoaiSku, canTraTonDePhanLoai, SKU_B2C_UU_TIEN,
  chiaTheoKho, nangBangChungDoiCu
} from './ground-tra.mjs';
import * as B from './bol-tinh.mjs';

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
/* 🔴 KHỚP TUYỆT ĐỐI CẢ CHUỖI — người dùng chốt 12/08/2026. Trước đó khớp theo phần số
 *    đầu nên mọi hậu tố đều dính; nay mỗi biến thể phải có tên trong danh sách.
 *    Kèm theo là thu hẹp phạm vi: 816390 và 818390 KHÔNG còn thuộc kho Calhoun. */
ck('nhom Calhoun dung 4 chuoi', [...SKU_NGOAI_LE].sort(),
   ['836390', '836390-B', '838390', '838390-B']);
ck('836390-B la Calhoun', laSkuNgoaiLe('836390-B'), true);
ck('836390 (khong hau to) cung la Calhoun', laSkuNgoaiLe('836390'), true);
ck('816390-B KHONG con la Calhoun', laSkuNgoaiLe('816390-B'), false);
ck('818390-B KHONG con la Calhoun', laSkuNgoaiLe('818390-B'), false);
ck('hau to la khong dinh nham', laSkuNgoaiLe('836390-WL'), false);
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

/* -------------------------------------------------- địa chỉ kho gửi (API) ---- */
/* Dữ liệu này CHỈ đường API cần: form web chọn kho bằng dropdown "My Addresses",
 * API thì đòi địa chỉ đầy đủ trong ShipFrom/Shipper. */
const khoDC = await docKhoDiaChi();

ck('doc du 6 kho', Object.keys(khoDC).length, 6);

/* 🔴 UPS ghi `MEM R` (dấu cách), CSV ghi `MEM-R` (gạch nối), Lecangs ghi `MEM-R`.
 *    Ba nguồn hai cách viết -> mọi phép tra phải đi qua chuanKho(). */
ck('chuanKho gop MEM-R / MEM R / memr',
   [chuanKho('MEM-R'), chuanKho('MEM R'), chuanKho('memr')], ['MEMR', 'MEMR', 'MEMR']);
ck('traKho tim duoc bang ten UPS viet ("MEM R")', traKho(khoDC, 'MEM R').kho, 'MEM-R');
ck('traKho tim duoc bang ten CSV viet ("MEM-R")', traKho(khoDC, 'MEM-R').kho, 'MEM-R');

/* Mọi kho phải đủ trường, nếu không UPS từ chối tạo label (Name rỗng) hoặc
 * đặt pickup (thiếu Phone). CAP từng thiếu ten_cong_ty và đã bị chặn đúng. */
for (const ten of ['Calhoun', 'MEM-R', 'SAV', 'HOU07', 'NJF02', 'CAP']) {
  const k = traKho(khoDC, ten);
  ck(`kho ${ten} du truong bat buoc`,
     [!!k.tenCongTy, !!k.duong, !!k.city, !!k.state, !!k.zip, !!k.phone],
     [true, true, true, true, true, true]);
}

await nem('kho khong co trong bang -> nem loi', async () => traKho(khoDC, 'KHONG-CO-KHO-NAY'));

/* Calhoun là kho riêng (NOTS Logistics), KHÔNG nằm trong 54 kho của Lecangs —
 * đo 08/08. Đó là lý do 4 SKU ngoại lệ vừa ép kho Calhoun vừa không qua Lecangs. */
ck('Calhoun co trong bang dia chi (du khong phai kho Lecangs)', !!traKho(khoDC, 'Calhoun'), true);

/* ---- bảng thứ tự kho: ba bất biến -------------------------------------------
 *
 * 🔴 Người dùng sửa lại toàn bộ bảng ngày 11/08/2026. Bản trước đó **sai ở cả 50 bang**:
 *    MEM-R nằm rải khắp vị trí 1–4, trong đó **11 bang** lấy MEM-R làm kho gần nhất
 *    (AR · IA · IL · KS · MN · MO · MS · ND · NE · SD · WI).
 *    Luật thật: **MEM-R LUÔN ở vị trí 6**, xa nhất, không ngoại lệ.
 *
 * Sai thứ tự kho không làm gì đổ vỡ ngay — script vẫn in label bình thường, chỉ là
 * gửi từ kho xa hơn cần thiết. Nên nó không tự lộ ra; phải có test canh. */
{
  const bangKho = await docKhoTheoBang();
  const ten = Object.keys(bangKho);
  ck('bang thu tu kho: du 50 bang', ten.length, 50);
  ck('bang thu tu kho: MEM-R LUON o vi tri 6 (xa nhat)',
     ten.filter(b => bangKho[b][5] !== 'MEM-R'), []);
  ck('bang thu tu kho: moi bang du 6 kho, khong trung',
     ten.filter(b => bangKho[b].length !== 6 || new Set(bangKho[b]).size !== 6), []);
}

/* ---- phanLoaiSku: NƠI DUY NHẤT quyết định B2B/B2C ----------------------------
 *
 * 🔴 Luật người dùng chốt 12/08/2026. Trước đó hai tool tự phán đoán bằng luật riêng và
 *    đã bất đồng về cùng một đơn (`00_SoatLoi_12082026.md` lỗi L1). Bộ test này là thứ
 *    giữ cho chuyện đó không lặp lại — sai một dòng ở đây là đơn đi nhầm sheet, mà nhầm
 *    sheet thì hoặc dựng BOL cho hàng parcel, hoặc in nhãn UPS cho hàng pallet. */
{
  const pl = (m, o) => phanLoaiSku(m, o);

  // Luật 1 — kho Calhoun, MẠNH NHẤT, thắng cả Ship Via
  ck('836390-B: B2B du slip ghi Ground', pl('836390-B', { laGround: true }), 'B2B');
  ck('838390:   B2B du slip ghi Ground', pl('838390', { laGround: true }), 'B2B');
  /* 816390/818390 khong con thuoc Calhoun -> roi ve luat thuong theo Ship Via. */
  ck('816390-B + Ground -> B2C (theo luat thuong)', pl('816390-B', { laGround: true }), 'B2C');
  ck('818390-B + Misc   -> B2B (theo luat thuong)', pl('818390-B', { laGround: false }), 'B2B');

  // Luật 2 — ưu tiên B2C, hết tồn thì rơi về B2B
  ck('838250-B con hang -> B2C', pl('838250-B', { laGround: true, conHang: true }), 'B2C');
  ck('838250-B HET hang -> B2B', pl('838250-B', { laGround: true, conHang: false }), 'B2B');
  ck('818250   con hang -> B2C', pl('818250', { laGround: false, conHang: true }), 'B2C');
  ck('818250   HET hang -> B2B', pl('818250', { laGround: false, conHang: false }), 'B2B');
  /* Phiên Lecangs chết -> `conHang` là `undefined`. Người dùng chốt: mặc định **B2C**.
   * Đừng đổi thành B2B: đoán sang B2B sẽ dựng BOL pallet cho hàng parcel, sai nặng hơn. */
  ck('838250-B CHUA tra duoc -> mac dinh B2C', pl('838250-B', { laGround: true }), 'B2C');
  ck('818250-B CHUA tra duoc -> mac dinh B2C', pl('818250-B', {}), 'B2C');

  // Luật 3 — SKU thường, theo Ship Via như cũ
  ck('833250 + Ground -> B2C', pl('833250', { laGround: true }), 'B2C');
  ck('833250 + Misc   -> B2B', pl('833250', { laGround: false }), 'B2B');
  ck('812250-B + Misc -> B2B', pl('812250-B', { laGround: false }), 'B2B');
  /* SKU thường KHÔNG bị tồn kho chi phối — chỉ 4 SKU nhóm 2 mới có luật đó. */
  ck('833250 het hang van theo Ship Via', pl('833250', { laGround: true, conHang: false }), 'B2C');

  /* 🔴 LUẬT 0 — AK/HI luôn về B2B, mạnh hơn mọi luật khác (chốt 12/08/2026).
   * Bảng thứ tự kho chỉ phủ 48 bang lục địa, nên đơn Ground đi hai bang này không chọn
   * được kho gửi và trước đây nằm im trong danh sách chờ. */
  ck('HI + Ground -> B2B', pl('833250', { laGround: true, bang: 'HI' }), 'B2B');
  ck('AK + Ground -> B2B', pl('833250', { laGround: true, bang: 'AK' }), 'B2B');
  ck('AK/HI thang ca luat ton kho', pl('838250-B', { laGround: true, bang: 'HI', conHang: true }), 'B2B');
  ck('AK/HI thang ca luat kho Calhoun', pl('836390-B', { laGround: true, bang: 'AK' }), 'B2B');
  ck('bang thuong khong bi anh huong', pl('833250', { laGround: true, bang: 'TX' }), 'B2C');
  ck('khong biet bang -> nhu cu', pl('833250', { laGround: true }), 'B2C');

  ck('canTraTonDePhanLoai chi dung voi nhom 2',
     ['838250-B', '818250', '833250', '836390-B'].map(canTraTonDePhanLoai),
     [true, true, false, false]);
  ck('nhom uu tien B2C dung 4 chuoi', [...SKU_B2C_UU_TIEN].sort(),
     ['818250', '818250-B', '838250', '838250-B']);
}

/* ===========================================================================
 *  tinhBOL — đơn NHIỀU MÃ HÀNG, xếp chung một pallet (cách A, chốt 12/08/2026)
 * ======================================================================== */
{
  const pallet = await B.docPallet(new URL('../05_TraCuu/pallet.csv', import.meta.url).pathname);
  const bangClass = await B.docClass(new URL('../05_TraCuu/class.csv', import.meta.url).pathname);
  const t = items => B.tinhBOL(items, pallet, bangClass);

  /* Truyền một dòng hàng phải ra y hệt bản trước 12/08 — mọi đơn đã chạy đều một mã,
   * đổi kết quả của chúng là đổi giấy tờ đã gửi đi. */
  const mot = t({ model: '818250-B', qty: 2 });
  ck('1 ma: weight = K x qty + 55', mot.weight, 86 * 2 + 55);
  ck('1 ma: qty giu nguyen', mot.qty, 2);
  ck('1 ma: truyen mang 1 phan tu ra y het',
     [mot.weight, mot.qty, mot.cls, mot.moTa],
     (r => [r.weight, r.qty, r.cls, r.moTa])(t([{ model: '818250-B', qty: 2 }])));

  /* Ví dụ thật dùng trên trang hỏi người vận hành. Con số ở đó phải khớp code,
   * nếu không là hỏi một đằng làm một nẻo. */
  const hai = t([{ model: '818250-B', qty: 1 }, { model: '816390-B', qty: 1 }]);
  ck('2 ma: +55 dung MOT lan', hai.weight, 86 + 101 + 55);
  ck('2 ma: qty la TONG so tam', hai.qty, 2);
  ck('2 ma: class 92.5 (khop trang hoi)', hai.cls, '92.5');

  /* 🔴 L/W lấy LỚN NHẤT theo từng chiều, không lấy của mã đầu.
   * 818250 rộng 25″, 816390 rộng 39″ — pallet rộng 25″ không chở được tấm 39″.
   * Lấy nhầm ra class 70 thay vì 92.5, tức sai tiền cước. */
  ck('2 ma: doi thu tu KHONG doi ket qua',
     [hai.weight, hai.cls, hai.pcf],
     (r => [r.weight, r.cls, r.pcf])(t([{ model: '816390-B', qty: 1 }, { model: '818250-B', qty: 1 }])));
  ck('2 ma: mo ta dung kich thuoc BAO NGOAI', hai.moTa, '2 pallet - 98″ x 41″ x 8″ - 242 lbs');

  /* H = 6 + 2 × TỔNG số tấm — người dùng xác nhận công thức +2″/tấm vẫn đúng khi
   * chồng khác loại (câu 2, 12/08/2026). 3 tấm -> H = 12. */
  const ba = t([{ model: '818250', qty: 1 }, { model: '830250', qty: 1 }, { model: '836390', qty: 1 }]);
  ck('3 ma: weight cong het, +55 mot lan', ba.weight, 86 + 108 + 101 + 55);
  ck('3 ma: qty = tong', ba.qty, 3);
  ck('3 ma: moi ma mot dong mo ta', ba.itemDescs.length, 3);
  ck('3 ma: skus giu du thu tu', ba.skus, ['818250', '830250', '836390']);

  ck('qty > 1 tren nhieu ma cong dung',
     t([{ model: '818250', qty: 2 }, { model: '836390', qty: 3 }]).weight, 86 * 2 + 101 * 3 + 55);

  await nem('SKU ngoai pallet.csv -> NEM LOI', async () => t([{ model: '814300', qty: 1 }]));
  await nem('mot ma hop le + mot ma la -> van NEM LOI',
            async () => t([{ model: '818250', qty: 1 }, { model: '833250', qty: 1 }]));
  await nem('qty = 0 -> NEM LOI', async () => t([{ model: '818250', qty: 0 }]));
  await nem('mang rong -> NEM LOI', async () => t([]));
}

/* ===========================================================================
 *  chiaTheoKho — đơn nhiều mã mà không kho nào đủ cả thì TÁCH shipment
 *  (người dùng chốt 12/08/2026: "tách làm 2 shipment, mỗi lần 1 kho")
 * ======================================================================== */
{
  const UT = ['HOU07', 'Calhoun', 'SAV', 'CAP', 'NJF02', 'MEM-R'];
  const gon = r => r.map(n => `${n.tenKho}:${n.kien.map(k => k.model).join('+')}`);
  const chia = (dsTon) => gon(chiaTheoKho('P', dsTon, UT));
  const ton = (model, qty, ...kho) => ({ k: { model, qty }, hang: kho.map(([t, c]) => ({ kho: t, con: c })) });

  // --- Luật 1: gộp vẫn hơn tách -------------------------------------------
  ck('1 kho du ca 2 ma -> 1 shipment',
     chia([ton('A', 1, ['HOU07', 5], ['CAP', 5]), ton('B', 1, ['HOU07', 5], ['CAP', 5])]),
     ['HOU07:A+B']);
  ck('kho uu tien dau khong du -> lui xuong kho sau, van 1 shipment',
     chia([ton('A', 3, ['HOU07', 1], ['CAP', 9]), ton('B', 3, ['HOU07', 9], ['CAP', 9])]),
     ['CAP:A+B']);
  /* Có kho đủ cả hai thì KHÔNG tách, kể cả khi một mã lẻ có thể lấy ở kho gần hơn.
   * Tách thêm là thêm một đơn xuất kho và một gói nữa tới tay khách. */
  ck('co kho du ca hai -> GOP, du ma le co the o kho gan hon',
     chia([ton('A', 1, ['HOU07', 1], ['CAP', 9]), ton('B', 9, ['HOU07', 1], ['CAP', 9])]),
     ['CAP:A+B']);

  // --- Luật 2: phải tách ---------------------------------------------------
  ck('moi ma mot kho -> 2 shipment',
     chia([ton('A', 1, ['CAP', 5]), ton('B', 1, ['NJF02', 5])]),
     ['CAP:A', 'NJF02:B']);
  ck('3 ma 2 kho -> gop ma trung kho',
     chia([ton('A', 1, ['CAP', 5]), ton('B', 1, ['NJF02', 5]), ton('C', 1, ['CAP', 5])]),
     ['CAP:A+C', 'NJF02:B']);
  /* Lô sắp theo THỨ TỰ ƯU TIÊN chứ không theo thứ tự SKU trên slip — để tên file label
   * và log không đổi giữa hai lần chạy cùng một đơn. */
  ck('lo sap theo thu tu uu tien, khong theo thu tu SKU',
     chia([ton('A', 1, ['NJF02', 5]), ton('B', 1, ['HOU07', 5])]),
     ['HOU07:B', 'NJF02:A']);
  ck('phai tach -> moi ma lay kho uu tien nhat con du cho no',
     chia([ton('A', 1, ['HOU07', 5], ['NJF02', 5]), ton('B', 1, ['CAP', 5])]),
     ['HOU07:A', 'CAP:B']);

  // --- Luật 3: thiếu thật thì vẫn DỪNG ------------------------------------
  await nem('mot ma khong kho nao du -> NEM LOI',
            async () => chiaTheoKho('P', [ton('A', 1, ['CAP', 5]), ton('B', 99, ['CAP', 5])], UT));
  await nem('ma khong co o kho nao -> NEM LOI',
            async () => chiaTheoKho('P', [ton('B', 1)], UT));
  /* KHÔNG xé nhỏ qty của một mã ra hai kho — "mỗi mã một kho" là điều đã chốt,
   * tách sâu hơn thì chưa ai duyệt. */
  await nem('KHONG tach nho qty cua MOT ma ra 2 kho',
            async () => chiaTheoKho('P', [ton('A', 5, ['CAP', 3], ['NJF02', 3])], UT));

  ck('ten kho lech hoa-thuong van khop',
     chia([ton('A', 1, [' cap ', 5]), ton('B', 1, ['CAP', 5])]),
     ['CAP:A+B']);

  /* Bằng chứng đời cũ (trước 12/08) không có `lo`. Không nâng thì đơn đã chạy bị coi
   * là chưa có shipment nào -> lần sau MUA LẠI NHÃN, tốn tiền thật. */
  const bcCu = { luc: 'x', moiTruong: 'prod', shipmentId: '1Z9', cuoc: '12', kho: 'CAP',
                 kien: [{ tracking: '1Z1' }, { tracking: '1Z2' }] };
  ck('bang chung doi cu -> dung lai lo[0], KHONG mua lai nhan',
     (r => [r.lo.length, r.lo[0].kho, r.lo[0].shipmentId, r.lo[0].soKien, r.kien.length])(nangBangChungDoiCu(bcCu)),
     [1, 'CAP', '1Z9', 2, 2]);
  ck('bang chung doi moi giu nguyen', nangBangChungDoiCu({ lo: [{ kho: 'A' }], kien: [] }).lo.length, 1);
  ck('khong co bang chung -> null', nangBangChungDoiCu(null), null);
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
