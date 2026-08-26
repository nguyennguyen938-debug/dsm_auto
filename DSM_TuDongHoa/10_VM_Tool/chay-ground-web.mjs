#!/usr/bin/env node
/**
 * ============================================================================
 *  chay-ground-web.mjs — làm MỘT đơn Ground bằng FORM WEB, ghi lại mọi lời gọi API
 * ----------------------------------------------------------------------------
 *  🎯 MỤC ĐÍCH: trả lời dứt điểm câu hỏi **ai trả phí pickup**.
 *
 *     Hoá đơn thật cho thấy tuần 38 kiện trải trên **19 tổ hợp (ngày × kho)** mà chỉ
 *     có **2 dòng phí** `On-Call Pickup`. Người vận hành xác nhận đơn nào cũng bấm
 *     "Schedule a new pickup". Giả thuyết của họ: pickup tạo TRONG luồng shipment thì
 *     phí đi theo billing của shipment (Home Depot trả); tạo RIÊNG thì người gửi trả.
 *     Nếu đúng, đường API — vốn bắt buộc tách hai lời gọi — sẽ làm MỌI đơn phát sinh
 *     phí, tức đắt hơn hẳn cách làm tay hiện nay.
 *
 *     Script này chạy đúng luồng web mà người vận hành vẫn làm, đồng thời **ghi lại
 *     mọi request POST**. Sau đó so với payload mà `ups-pickup.datPickup()` gửi.
 *
 *  ⛔ CHẠY THẬT. Bấm `Pay and Get Label(s)` tạo vận đơn thật, tính tiền thật, và đặt
 *     lệnh lấy hàng thật. Bắt buộc truyền `--that` VÀ `--po <so>`; thiếu là không chạy.
 *
 *  ⏱️ Phiên UPS từ cookie chỉ sống **20–35 phút**. Nạp cookie xong CHẠY NGAY.
 *     Trình tự: `nap-cookie-ups.mjs <file>` -> chạy script này ngay lập tức.
 *
 *      node chay-ground-web.mjs --po 79850310 --dry     # chi in du lieu se dien
 *      node chay-ground-web.mjs --po 79850310 --that    # CHAY THAT
 * ==========================================================================*/

import fs from 'node:fs/promises';
import path from 'node:path';
import { trang, donTab } from './cdp.mjs';
import { docSlip } from './doc-slip.mjs';
import * as G from './ground-tra.mjs';
import { traTonKho, chonKho } from './lecangs.mjs';
import { chayFormUps, conPhien, batPost, bamPay } from './ups-form.mjs';

const GOC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SLIPDIR = process.env.DSM_SLIP || path.join(GOC, '11_TaiVe', 'packingslip');

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const THAT = argv.includes('--that');
const PO = (() => { const i = argv.indexOf('--po'); return i >= 0 ? argv[i + 1] : null; })();
/** Bỏ qua bước tra tồn kho Lecangs, chỉ định kho thẳng (khi phiên Lecangs chết). */
const KHO_EP = (() => { const i = argv.indexOf('--kho'); return i >= 0 ? argv[i + 1] : null; })();
/**
 * Ép ngày pickup `M/D/YYYY`, bỏ qua `ngayPickupGround()`.
 *
 * 🔴 Vì sao cần: quy tắc ±15:00 trong tài liệu rất dễ cho ra **đúng hôm nay**, mà UPS
 *    tính ngày hôm nay là **Same Day Pickup** — hoá đơn thật: 15.75 + 4.13 fuel = 19.88,
 *    so với **Future Day** 9.65 + 2.53 = 12.18. Chênh 7.70 mỗi chuyến.
 *    Không tự dời ngày trong code: ngày pickup là cam kết với kho, đổi ngầm thì xe đến
 *    sai ngày. Muốn đổi thì người dùng phải nói rõ bằng cờ này.
 */
const NGAY_EP = (() => { const i = argv.indexOf('--ngay'); return i >= 0 ? argv[i + 1] : null; })();

const log = (...a) => console.log(new Date().toLocaleTimeString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }), ...a);

if (!PO) { console.error('\n⛔ Thieu --po <so PO>. Vi du: --po 79850310\n'); process.exit(2); }
if (!DRY && !THAT) {
  console.error('\n⛔ Phai co --that de chay that (tao van don + goi xe), hoac --dry de chi xem.\n');
  process.exit(2);
}

async function main() {
  const thuMuc = path.join(GOC, '11_TaiVe', 'ups-web', PO);

  // --- 1. đọc slip, tra dims, tách địa chỉ --------------------------------
  const d = await docSlip(path.join(SLIPDIR, `${PO}_PackingSlip.pdf`));
  if (d.loai !== 'Ground') throw new Error(`${PO}: Ship Via = ${d.loai}, khong phai Ground`);
  const model = d.items[0].model;
  const dm = G.traDims(await G.docDims(), model);
  const noiNhan = G.diaChiGiao(d.shipTo);
  const npTu = G.ngayPickupGround();
  const np = NGAY_EP ? { mdy: NGAY_EP, gioVN: npTu.gioVN, truoc15h: npTu.truoc15h, epBoi: 'nguoi dung' } : npTu;
  const uu = G.khoUuTien(await G.docKhoTheoBang(), d.shipTo.bang, model);

  log(`${PO} | ${d.shipTo.laStore ? 'store' : 'khach le'} ${d.shipTo.bang}` +
      ` | ${d.items[0].qty}x ${model} | ${dm.lb} lb ${dm.L}x${dm.W}x${dm.H}`);
  log(`ngay pickup: ${np.mdy}` + (NGAY_EP ? `  (EP bang --ngay; quy tac tinh ra ${npTu.mdy})` : ` (gio VN ${np.gioVN}, truoc 15h: ${np.truoc15h})`));
  {
    const vn = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    const homNay = `${vn.getMonth() + 1}/${vn.getDate()}/${vn.getFullYear()}`;
    if (np.mdy === homNay) {
      log(`⚠️  ngay pickup la HOM NAY -> UPS tinh SAME DAY (~19.88) thay vi FUTURE DAY (~12.18).`);
      log(`    Muon doi: them --ngay <M/D/YYYY>`);
    }
  }

  // --- 2. gắn vào Chrome đang mở ------------------------------------------
  const { b, ctx, p } = await trang();
  let page = p;
  await donTab(ctx, page);

  // --- 3. chọn kho --------------------------------------------------------
  let kho = KHO_EP;
  if (!kho) {
    log('tra ton kho Lecangs...');
    const { hang } = await traTonKho(page, model);
    kho = chonKho(uu.ds, hang, d.items[0].qty).kho;
    log(`kho chon: ${kho} (uu tien: ${uu.ds.join('>')})`);
  } else {
    log(`kho do nguoi dung chi dinh: ${kho}`);
  }

  if (DRY) {
    log('--dry: dung o day. Du lieu se dien:');
    console.log(JSON.stringify({ kho, noiNhan, kien: { qty: d.items[0].qty, ...dm }, pickup: { ngay: np.mdy, po: PO } }, null, 1));
    await b.close();
    return;
  }

  // --- 4. kiểm phiên NGAY TRƯỚC khi làm -----------------------------------
  //     Phiên chỉ sống 20–35 phút; chết giữa chừng thì đơn dở dang.
  const ph = await conPhien(page);
  if (!ph.song) {
    throw new Error(`Phien UPS da chet (${ph.tt} @ ${ph.url}). Nap cookie moi roi chay LAI NGAY: ` +
                    'node 10_VM_Tool/nap-cookie-ups.mjs <file-cookie>');
  }
  log('phien UPS: con song');

  // --- 5. GHI LẠI MỌI REQUEST kể từ đây ------------------------------------
  const bat = batPost(page);

  // --- 6. Mục 1 → Review ---------------------------------------------------
  const r = await chayFormUps(page, {
    kho,
    laKhachLe: !d.shipTo.laStore,
    noiNhan,
    kien: { qty: d.items[0].qty, lb: dm.lb, L: dm.L, W: dm.W, H: dm.H, po: PO },
    pickup: { ngay: np.mdy, po: PO }
  }, { log, lanToiDa: 1 });
  /* 🔴 CHỈ THỬ MỘT LẦN. Mỗi vòng điền form mất ~3 phút, mà phiên cookie chỉ sống
   *    20–35 phút. Thử 3 lần là đốt 10 phút rồi hết phiên mà chưa tới được nút Pay
   *    (đúng chuyện đã xảy ra 09/08). Lỗi thì sửa rồi chạy lại, nhanh hơn nhiều. */
  page = r.page;

  /* `chayFormUps` có thể trả về TAB MỚI -> bộ bắt request đang gắn vào tab cũ.
   * Gắn lại vào tab đang dùng, nếu không sẽ mất đúng những request quan trọng nhất. */
  let bat2 = null;
  if (page !== p) { bat.dung(); bat2 = batPost(page); log('doi tab -> gan lai bo bat request'); }
  const dsBat = () => [...bat.ds, ...(bat2 ? bat2.ds : [])];

  // --- 7. ⛔ BẤM PAY -------------------------------------------------------
  const kq = await bamPay(page, { thuMuc, log });

  // --- 8. đổ bằng chứng ra đĩa --------------------------------------------
  const ghi = dsBat();
  await fs.writeFile(path.join(thuMuc, 'requests.json'), JSON.stringify(ghi, null, 1));
  await fs.writeFile(path.join(thuMuc, 'ket-qua.json'), JSON.stringify({
    po: PO, kho, ngayPickup: np.mdy, trackings: kq.trackings, url: kq.url,
    soRequest: ghi.length, luc: new Date().toISOString()
  }, null, 1));

  log('---');
  log(`✅ xong. ${ghi.length} request da ghi -> ${thuMuc}/requests.json`);
  log(`   tracking: ${kq.trackings.join(', ') || '(doc tay trong sau-pay.html)'}`);
  log('   URL cac request POST:');
  for (const x of ghi) log(`     ${x.method} ${x.url.slice(0, 110)}`);

  await b.close();
}

main().catch(e => { console.error('\n❌ ' + e.stack + '\n'); process.exit(1); });
