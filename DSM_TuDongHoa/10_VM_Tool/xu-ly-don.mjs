#!/usr/bin/env node
/**
 * ============================================================================
 *  xu-ly-don.mjs — nối tiếp run.mjs: slip -> BOL -> Drive -> sheet
 * ----------------------------------------------------------------------------
 *  CHỈ làm nhóm carrier KHÔNG cần web: SEFL · XGSI · BXID · FXFE · ABFS.
 *  AACT và CTII phải điền trên web carrier -> để nhánh riêng, script này BỎ QUA.
 *
 *    node xu-ly-don.mjs --dry          # chỉ liệt kê sẽ làm gì, KHÔNG ghi gì
 *    node xu-ly-don.mjs                # chạy thật
 *    node xu-ly-don.mjs --only 123     # giới hạn PO
 *    node xu-ly-don.mjs --max 10       # trần số đơn mỗi lần chạy
 *
 *  ⛔ Chạy thật sẽ GHI VÀO SHEET và TẠO FILE trên Drive. Không tạo lệnh pickup,
 *     không đụng web carrier — nên sai thì sửa được: xoá file, sửa dòng sheet.
 *
 *  Thứ tự makeFolder -> upload -> fillRow KHÔNG ĐƯỢC ĐẢO (xem CLAUDE.md mục 4):
 *  tên folder ngày phụ thuộc ngày pickup, mà ngày pickup có thể bị trần 20 đơn/ngày
 *  dời đi. makeFolder chốt ngày trước, fillRow dùng LẠI đúng ngày đó với skipCap.
 * ==========================================================================*/

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { docSlip, chonCarrier, docBangCarrier } from './doc-slip.mjs';
import * as B from './bol-tinh.mjs';
import * as W from './webapp.mjs';

const GOC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SLIPDIR = process.env.DSM_SLIP || path.join(GOC, '11_TaiVe', 'packingslip');
const BOLDIR = process.env.DSM_BOL || path.join(GOC, '11_TaiVe', 'bol');

/** Carrier script này tự làm được. AACT/CTII cần web carrier -> không nằm đây. */
const TU_LAM = new Set(['SEFL', 'XGSI', 'BXID', 'FXFE', 'ABFS']);

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
/**
 * ⛔ CHỈ DÙNG ĐỂ TEST. Vượt tầng lọc cột C/D — tức là làm lại đơn mà NGƯỜI KHÁC
 *    ĐANG hoặc ĐÃ làm tay. Với nhóm carrier này thì không tạo lệnh pickup, nhưng
 *    fillRow sẽ GHI ĐÈ dòng sheet đã có (rõ nhất là cột K mất mốc cũ).
 *    Đừng bao giờ đặt cờ này trong cron.
 */
const BO_LOC = argv.includes('--test-bo-loc-cot-CD');
const ONLY = (() => { const i = argv.indexOf('--only'); return i >= 0 ? (argv[i + 1] || '').split(',').filter(Boolean) : null; })();
/** Trần số đơn dựng BOL mỗi lần chạy — chặn khi sheet có sự cố sinh ra hàng loạt. */
const MAX = (() => { const i = argv.indexOf('--max'); return i >= 0 ? parseInt(argv[i + 1], 10) || 0 : 0; })();

const log = (...a) => console.log(new Date().toLocaleTimeString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }), ...a);

/** Gọi bol_html.py -> HTML của BOL. Toàn bộ luật điền nằm ở fill_bol.py. */
function dungHtmlBOL(v) {
  return new Promise((ok, that) => {
    const p = spawn('python3', [path.join(GOC, '04_BOL_Form', 'bol_html.py')], { stdio: ['pipe', 'pipe', 'pipe'] });
    let ra = '', loi = '';
    p.stdout.on('data', d => ra += d);
    p.stderr.on('data', d => loi += d);
    p.on('close', ma => ma === 0 && ra.trim()
      ? ok(ra)
      : that(new Error(`bol_html.py ma ${ma}: ${(loi || ra).trim().slice(0, 200)}`)));
    p.stdin.end(JSON.stringify(v));
  });
}

async function main() {
  await fs.mkdir(BOLDIR, { recursive: true });

  // --- 1. slip có sẵn trên đĩa (run.mjs đã tách và tải về) ----------------
  let tep;
  try { tep = (await fs.readdir(SLIPDIR)).filter(f => /^\d{8}_PackingSlip\.pdf$/.test(f)); }
  catch { console.error(`\n❌ Khong doc duoc ${SLIPDIR}. Chay run.mjs truoc.\n`); process.exit(2); }
  let pos = tep.map(f => f.slice(0, 8));
  if (ONLY) pos = pos.filter(p => ONLY.includes(p));
  if (!pos.length) { log('khong co packing slip nao — ket thuc.'); return; }
  log(`${pos.length} slip tren dia`);

  // --- 2. trạng thái trong sheet — LẤY NGAY TRƯỚC KHI LÀM ------------------
  //     Sheet có nhiều người sửa cùng lúc; ai đó có thể vừa nhận đơn bằng tay.
  const rows = await W.lookup(pos);

  const bangCarrier = await docBangCarrier(path.join(GOC, '05_TraCuu', 'carrier.csv'));
  const pallet = await B.docPallet(path.join(GOC, '05_TraCuu', 'pallet.csv'));
  const bangClass = await B.docClass(path.join(GOC, '05_TraCuu', 'class.csv'));
  const np = B.ngayPickup();

  const lam = [], boQua = [], cho = [];

  for (const po of pos.sort()) {
    const r = rows[po] || {};
    // Luật lọc: cột C có carrier hoặc cột D có PIC -> có người đang làm tay.
    // Làm nữa = BOL trùng. Kiểm LẠI ở đây dù needSlip đã lọc, vì PIC có thể
    // được điền SAU khi slip đã tải.
    if (!BO_LOC) {
      if ((r.carrier || '').trim()) { boQua.push({ po, ly_do: `cot C da co carrier ${r.carrier}` }); continue; }
      if ((r.pic || '').trim()) { boQua.push({ po, ly_do: `cot D co PIC ${r.pic}` }); continue; }
    } else if ((r.carrier || '').trim() || (r.pic || '').trim()) {
      log(`   ⛔ ${po}: VUOT LOC — cot C="${r.carrier || ''}" cot D="${r.pic || ''}" se bi GHI DE`);
    }

    let d;
    try { d = await docSlip(path.join(SLIPDIR, `${po}_PackingSlip.pdf`)); }
    catch (e) { cho.push({ po, ly_do: 'doc slip: ' + e.message }); continue; }

    if (d.po !== po) { cho.push({ po, ly_do: `PO trong slip la ${d.po}, lech ten file` }); continue; }
    if (d.loai === 'Ground') { boQua.push({ po, ly_do: 'Ground — dung o muc co slip tren Drive' }); continue; }

    let carrier;
    try { carrier = chonCarrier(bangCarrier, d.shipTo.bang, d.shipTo.laStore); }
    catch (e) { cho.push({ po, ly_do: e.message }); continue; }

    if (!TU_LAM.has(carrier)) { boQua.push({ po, ly_do: `${carrier} — can web carrier, de nhanh rieng` }); continue; }

    let tinh;
    try { tinh = B.tinhBOL(d.items[0], pallet, bangClass); }
    catch (e) { cho.push({ po, ly_do: e.message }); continue; }

    lam.push({ po, d, carrier, tinh });
  }

  log(`se lam ${lam.length} | bo qua ${boQua.length} | cho nguoi xem ${cho.length}`);
  for (const b of boQua) log('   bo qua', b.po, '-', b.ly_do);
  for (const c of cho) log('   ⚠️ CHO', c.po, '-', c.ly_do);

  if (!lam.length) return;
  for (const x of lam) {
    log(`   -> ${x.po} ${x.carrier} | ${x.d.shipTo.laStore ? 'store' : 'khach'} ${x.d.shipTo.bang}` +
        ` | ${x.tinh.qty}x ${x.d.items[0].model} | ${x.tinh.weight} lb | class ${x.tinh.cls}`);
  }

  if (DRY) { log('--dry: khong ghi gi ca. Bo --dry de chay that.'); return; }

  if (MAX > 0 && lam.length > MAX) {
    log(`gioi han --max ${MAX}: lam ${MAX} don lan nay, ${lam.length - MAX} don de lan sau`);
    lam.length = MAX;
  }

  // --- 3. từng đơn: BOL -> folder -> upload -> fillRow ---------------------
  let xong = 0;
  for (const x of lam) {
    try {
      const html = await dungHtmlBOL({
        date: np.mmddyyyy, po: x.po, carrier: x.carrier,
        ship_name: x.d.shipTo.co ? `${x.d.shipTo.ten} ${x.d.shipTo.co}` : x.d.shipTo.ten,
        ship_address: x.d.shipTo.diaChi,
        ship_csz: `${x.d.shipTo.city}, ${x.d.shipTo.bang} ${x.d.shipTo.zip}`,
        phone: x.d.shipTo.phone || '',
        cust_order_num: `${x.d.customerOrder} (PO ${x.po})`,
        items: [{ model: x.d.items[0].model, qty: x.tinh.qty }]
      });
      await fs.writeFile(path.join(BOLDIR, `${x.po}_BOL.html`), html);

      // makeFolder CHỐT NGÀY trước — fillRow dùng lại đúng ngày này
      const mk = await W.makeFolder(x.po, np.mmddyyyy);
      log(`${x.po}: folder ${mk.dayFolder}${mk.pickupMoved ? ' (ngay bi doi vi tran)' : ''}`);

      await W.uploadHtml(mk.folderId, `${x.po}_BOL.pdf`, html);
      const slip = await fs.readFile(path.join(SLIPDIR, `${x.po}_PackingSlip.pdf`));
      await W.uploadFile(mk.folderId, `${x.po}_PackingSlip.pdf`, slip);

      const fr = await W.fillRow({
        po: x.po, carrier: x.carrier, customerOrder: x.d.customerOrder,
        shipTo: x.d.shipTo.ten,                 // TÊN, BỎ phần "C/O ..."
        sku: x.d.items[0].model,                // nguyên Model Number
        // Cột H lấy mô tả trên SLIP, KHÔNG phải mô tả trong pallet.csv —
        // hai chuỗi khác nhau, lấy nhầm là sheet ghi tên hàng lệch giấy tờ.
        productName: x.d.items[0].moTa,
        qty: String(x.tinh.qty),
        pickupSchedule: mk.pickupSchedule,      // DÙNG LẠI ngày makeFolder đã chốt
        skipCap: true, linkDrive: mk.url
        // KHÔNG gửi `pro` — TraPRO/CheckMail_PRO điền cột N sau
      });
      log(`${x.po}: ✅ hang ${fr.row} | pickup ${fr.pickupSchedule} | ${mk.url}`);
      xong++;
    } catch (e) {
      process.exitCode = 5;
      console.error(`\n❌ ${x.po}: ${e.message}\n   Khong tao lenh pickup nao — sua roi chay lai duoc.\n`);
    }
  }
  log('---');
  log(`xong ${xong}/${lam.length}` + (cho.length ? ` | ${cho.length} don cho nguoi xem` : ''));
}

main().catch(e => { console.error('\n❌ ' + e.stack + '\n'); process.exit(1); });
