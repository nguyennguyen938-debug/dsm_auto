#!/usr/bin/env node
/**
 * ============================================================================
 *  xu-ly-ground.mjs — nối trọn nhánh đơn GROUND: slip -> UPS -> Drive -> sheet
 * ----------------------------------------------------------------------------
 *  Quy trình: `01_HuongDan_VanHanh/7_QuyTrinh_Ground_UPS.md`.
 *  Song song với `xu-ly-don.mjs` (nhánh Misc/LTL), KHÔNG thay thế nó.
 *  `xu-ly-don.mjs` vẫn bỏ qua đơn Ground ở tầng lọc — đúng thiết kế.
 *
 *    node xu-ly-ground.mjs --dry                 # chi liet ke, KHONG goi UPS, khong ghi gi
 *    node xu-ly-ground.mjs --only 79794505       # gioi han PO (NEN dung cho lan dau)
 *    DSM_UPS_ENV=prod node xu-ly-ground.mjs --that --only 79794505
 *
 *  ⛔ BA CỔNG AN TOÀN, cố ý làm khó:
 *    1. Không có `--that` thì chỉ chạy trên **CIE** (label giả, không mất tiền).
 *    2. `--that` mà thiếu `DSM_UPS_ENV=prod` thì script DỪNG — hai thứ phải khớp nhau,
 *       để không ai vô tình chạy thật vì gõ thiếu một chỗ.
 *    3. Bước Lecangs `Save & Submit` **luôn tắt** trừ khi có `--lecangs-that`.
 *
 *  🔴 THỨ TỰ TRONG MỖI ĐƠN KHÔNG ĐƯỢC ĐẢO:
 *
 *      taoShipment  ->  GHI NGAY 11_TaiVe/ups/<PO>.json  ->  pickup -> Drive -> sheet
 *
 *    `taoShipment` trên production **tính tiền và tạo vận đơn thật**; mọi bước sau đều
 *    làm lại được. File `<PO>.json` là bằng chứng "đơn này đã có label rồi" — lần chạy
 *    sau đọc thấy thì DÙNG LẠI, không tạo shipment thứ hai.
 *    Đây đúng là cơ chế đã cứu nhánh AACT (`11_TaiVe/aact/<PO>.json`, xem `xu-ly-don.mjs`)
 *    và cơ chế manifest của `run.mjs`. Ba nơi cùng một bài học: **việc không hoàn tác
 *    được thì phải để lại dấu vết NGAY, trước khi làm bất cứ việc gì khác.**
 *
 *  ⛔ MỖI ĐƠN MỘT PICKUP RIÊNG (người dùng chốt 08/08). Đừng gộp, kể cả cùng kho cùng ngày.
 * ==========================================================================*/

import fs from 'node:fs/promises';
import path from 'node:path';
import { docSlip } from './doc-slip.mjs';
import * as G from './ground-tra.mjs';
import { chiaTheoKho, nangBangChungDoiCu, chuanTen } from './ground-tra.mjs';
import * as SHIP from './ups-ship.mjs';
import * as PICKUP from './ups-pickup.mjs';
import * as U from './ups-api.mjs';
import * as W from './webapp.mjs';
import { traTonKho, chonKho, taoDonParcel } from './lecangs.mjs';
import { moContext, vaoLecangs } from './phien.mjs';

const GOC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SLIPDIR = process.env.DSM_SLIP || path.join(GOC, '11_TaiVe', 'packingslip');
const UPSDIR = process.env.DSM_UPS_OUT || path.join(GOC, '11_TaiVe', 'ups');
/** Bằng chứng "đã tạo đơn parcel trên Lecangs" — một file mỗi tracking. */
const LECDIR = process.env.DSM_LEC_OUT || path.join(GOC, '11_TaiVe', 'lecangs');
/**
 * Kết quả tra tồn dùng để PHÂN LOẠI, ghi ra đĩa cho `xu-ly-don.mjs` đọc lại.
 *
 * 🔴 Vì sao cần: từ 12/08/2026 bốn SKU `838250`/`818250` thuộc B2C hay B2B là do **tồn
 *    kho** quyết định. Chỉ script này có trình duyệt để tra; `xu-ly-don.mjs` thì không.
 *    Không có cầu nối thì đơn hết tồn sẽ kẹt: bên này bỏ vì "thuộc B2B", bên kia bỏ vì
 *    "thuộc B2C" — không ai làm, mà log hai bên đều sạch.
 */
const PLDIR = process.env.DSM_PL_OUT || path.join(GOC, '11_TaiVe', 'phanloai');
/**
 * Bằng chứng shipment, **tách hẳn theo môi trường**:
 *   `<PO>.json`      — production, tracking THẬT, là thứ không được mất
 *   `<PO>.cie.json`  — test, tracking giả
 *
 * 🔴 Nếu dùng chung một tên file thì một lần chạy CIE sau đó sẽ **ghi đè mất bằng chứng
 *    của đơn thật** — và bằng chứng đó là thứ duy nhất ngăn lần chạy sau tạo shipment
 *    thứ hai (tức mất tiền lần hai). Tách tên là cách rẻ nhất để chuyện đó không xảy ra.
 */
/**
 * 🔴 TÁCH THEO CẢ **CHẾ ĐỘ** nữa (12/08/2026), không chỉ theo môi trường.
 *
 * Một PO hỗn hợp có hai phần chạy ở hai luồng khác nhau. Dùng chung một tên file thì
 * lượt `--sheet b2c` đọc thấy bằng chứng của phần B2B, kết luận "đơn này đã có vận đơn
 * rồi", và **bỏ qua trong khi phần B2C chưa hề có nhãn nào** — rồi vẫn ghi cái tracking
 * của SKU khác vào sheet B2C. Sai kiểu im lặng, không có lỗi nào bật lên.
 */
const fileBangChung = po =>
  path.join(UPSDIR, `${po}${LA_B2C ? '.b2c' : ''}${U.LA_THAT ? '' : '.cie'}.json`);

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const THAT = argv.includes('--that');
const LECANGS_THAT = argv.includes('--lecangs-that');
const ONLY = (() => { const i = argv.indexOf('--only'); return i >= 0 ? (argv[i + 1] || '').split(',').filter(Boolean) : null; })();
const MAX = (() => { const i = argv.indexOf('--max'); return i >= 0 ? parseInt(argv[i + 1], 10) || 0 : 0; })();
/** Chờ người dùng chốt `01` hay `04` — xem đầu `ups-pickup.mjs`. */
const PT_TRA = (() => { const i = argv.indexOf('--tra'); return i >= 0 ? argv[i + 1] : '01'; })();

/**
 * 🔴 KHÔNG ĐẶT PICKUP — người dùng xác nhận 11/08/2026.
 *
 * Kho không cần mình gọi xe (xe UPS vốn đã ghé), nên luồng chỉ cần tạo label + tracking.
 * Bỏ được bước này là bỏ luôn:
 *   · phí on-call 12–20 USD mỗi lần, khoản mà Home Depot ĐÃ TỪ CHỐI trả
 *     ("Home Depot does not cover pickup fees. Suppliers are responsible." — 10/08)
 *   · một lời gọi API có thể hỏng giữa chừng, để lại đơn có nhãn mà không ai tới lấy
 *
 * Bật lại bằng cờ `--pickup` khi thật sự cần gọi xe cho một kho nào đó.
 * `ups-pickup.mjs` giữ nguyên, không xoá.
 */
const TAO_PICKUP = argv.includes('--pickup');

/**
 * Ép kho, bỏ qua bước tra tồn kho Lecangs. Dùng khi phiên Lecangs chết mà vẫn cần chạy.
 * ⚠️ Ép kho hết hàng thì UPS vẫn in label bình thường, nhưng kho không có gì để gửi —
 *    lỗi chỉ lộ ra khi hàng không tới. Chỉ dùng khi đã tự kiểm tồn kho bằng mắt.
 */
const KHO_EP = (() => { const i = argv.indexOf('--kho'); return i >= 0 ? argv[i + 1] : null; })();

/**
 * ⛔ CHỈ ĐỂ TEST. Vượt tầng lọc cột C/D — tức làm lại đơn mà người khác đang/đã làm.
 *    Trên production việc này TẠO VẬN ĐƠN THỨ HAI. Đừng bao giờ đặt cờ này trong cron.
 */
const BO_LOC = argv.includes('--test-bo-loc-cot-CD');

/**
 * 🔀 BA TẦNG XỬ LÝ — người dùng chốt 11/08/2026.
 *
 *   (mặc định)      tool của **sheet chính** `Order List`. Xử lý mọi đơn thường;
 *                   gặp đơn HỖN HỢP thì **chỉ tích `X` cột T** rồi thôi.
 *   `--sheet b2c`   tool của **sheet B2C**. Chỉ nhận đơn đã tích `X`, làm phần
 *                   **kho Lecangs**, ghi kết quả thẳng vào sheet B2C.
 *
 * Phần kho Calhoun là việc của `xu-ly-don.mjs --sheet b2b`.
 * Tách ra vì mỗi sheet có người theo dõi riêng, và vì phần B2B/B2C của cùng một PO
 * không nên tranh nhau một hàng.
 */
const CHE_DO = (() => {
  const i = argv.indexOf('--sheet');
  const v = i >= 0 ? String(argv[i + 1] || '').toLowerCase() : 'chinh';
  if (!['chinh', 'b2c'].includes(v)) {
    console.error(`\n⛔ --sheet chi nhan "b2c" (hoac bo di = sheet chinh). Nhan duoc: "${v}"\n`);
    process.exit(2);
  }
  return v;
})();
const LA_B2C = CHE_DO === 'b2c';

const log = (...a) => console.log(new Date().toLocaleTimeString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }), ...a);

/**
 * Đọc bằng chứng "đơn này đã có shipment".
 *
 * 🔴 PHẢI KIỂM `moiTruong`. Bằng chứng của CIE mang tracking GIẢ
 *    (`1ZXXXXXXXXXXXXXXXX`). Không kiểm thì lần chạy production sau đọc thấy file cũ,
 *    kết luận "đã có shipment rồi", và đi tiếp với tracking giả — cột N của sheet nhận
 *    số vô nghĩa, Lecangs nhận số vô nghĩa, mà đơn thì **chưa hề có vận đơn nào**.
 *    Lỗi này lọt qua vòng đầu vì lúc viết chỉ nghĩ tới ca "chạy lại cùng môi trường".
 *    (Cùng bài học với `ups-api.layToken()`: token cũng phải đệm kèm `env`.)
 */
async function docBangChung(po) {
  let o;
  try { o = JSON.parse(await fs.readFile(fileBangChung(po), 'utf8')); } catch { return null; }
  const env = U.LA_THAT ? 'prod' : 'cie';
  if (o.moiTruong !== env) {
    log(`${po}: co bang chung cua moi truong "${o.moiTruong}" nhung dang chay "${env}" — BO QUA, coi nhu chua co`);
    return null;
  }
  return o;
}

/** Cổng an toàn 2: `--that` và `DSM_UPS_ENV=prod` phải đi cùng nhau. */
function kiemCong() {
  if (THAT && !U.LA_THAT) {
    console.error('\n⛔ Co --that nhung DSM_UPS_ENV khong phai "prod".\n' +
                  '   Chay that: DSM_UPS_ENV=prod node xu-ly-ground.mjs --that ...\n');
    process.exit(2);
  }
  if (!THAT && U.LA_THAT) {
    console.error('\n⛔ DSM_UPS_ENV=prod nhung thieu --that.\n' +
                  '   Hai thu phai khop — them --that neu that su muon tao shipment THAT.\n');
    process.exit(2);
  }
}

async function main() {
  kiemCong();
  await fs.mkdir(UPSDIR, { recursive: true });
  await fs.mkdir(LECDIR, { recursive: true });
  await fs.mkdir(PLDIR, { recursive: true });

  log(`moi truong UPS: ${U.LA_THAT ? '⛔ PRODUCTION — TAO VAN DON THAT, TINH TIEN THAT' : 'CIE (test, khong mat tien)'}`);

  // --- 1. slip trên đĩa ----------------------------------------------------
  let tep;
  try { tep = (await fs.readdir(SLIPDIR)).filter(f => /^\d{8}_PackingSlip\.pdf$/.test(f)); }
  catch { console.error(`\n❌ Khong doc duoc ${SLIPDIR}. Chay run.mjs truoc.\n`); process.exit(2); }
  let pos = tep.map(f => f.slice(0, 8));
  if (ONLY) pos = pos.filter(p => ONLY.includes(p));
  if (!pos.length) { log('khong co packing slip nao — ket thuc.'); return; }

  // --- 2. trạng thái sheet, lấy NGAY trước khi làm -------------------------
  //     Nhiều người sửa sheet cùng lúc; ai đó có thể vừa nhận đơn bằng tay.
  /* Chế độ B2C đọc/ghi ngay trên sheet B2C: trạng thái "đơn này làm chưa" nằm ở đó,
   * `Order List` chỉ giữ A, B và dấu X. */
  const rows = await W.lookup(pos, LA_B2C ? W.SHEET.B2C : W.SHEET.ORDER);
  // Cột T luôn đọc từ `Order List` — đó là nơi dấu X được đặt xuống đầu tiên.
  const rowsGoc = LA_B2C ? await W.lookup(pos) : rows;

  const bangKho = await G.docKhoTheoBang();
  const dims = await G.docDims();
  const khoDC = await G.docKhoDiaChi();

  const lam = [], boQua = [], cho = [], chiTich = [];

  /* --- VÒNG 1: đọc slip, lọc thô. CHƯA phân loại B2B/B2C ---------------------
   *
   * 🔴 Từ 12/08/2026 việc phân loại **phụ thuộc tồn kho Lecangs**, mà tra tồn kho thì
   *    cần trình duyệt. Nên phải tách hai vòng: vòng này chỉ đọc slip và lọc những đơn
   *    chắc chắn không phải việc của luồng Ground; mở trình duyệt xong mới phân loại. */
  const dsSlip = [];
  for (const po of pos.sort()) {
    const r = rows[po] || {};
    /* 🔀 Ở sheet con, cột C KHÔNG còn là dấu "có người làm tay": bên B2C nó do lượt copy
     * chép sang, bên B2B thì cố ý để trống. Dấu "đã xử lý" của sheet con là **cột P**
     * (kiểm riêng bên dưới). Cột D (PIC) thì vẫn là người thật, giữ nguyên phép kiểm. */
    /* 🔴 `UPS` Ở CỘT C KHÔNG PHẢI DẤU "CÓ NGƯỜI LÀM TAY" — sửa 12/08/2026.
     *
     * Cổng này sinh ra để chặn đơn mà **người thật** đã nhận và tự điền hãng vận chuyển;
     * làm tiếp là tạo BOL trùng hoặc gọi xe trùng. Nhưng nó chỉ hỏi "cột C có chữ gì
     * không", không hỏi "ai viết chữ đó".
     *
     * Mà chữ `UPS` lại do **chính hệ thống** ghi: `xu-ly-don.mjs` gặp đơn Ground thì điền
     * sheet ngay với `carrier = UPS` (để người khác không nhận nhầm), rồi để script này
     * lo phần nhãn. Kết quả là một vòng khoá tự tạo:
     *
     *     xu-ly-don ghi "UPS"  →  script này thấy cột C có chữ  →  bỏ qua
     *
     * Đơn Ground vì thế KHÔNG BAO GIỜ được tạo nhãn, mà log hai bên đều sạch — bên kia
     * báo "đã điền sheet", bên này báo "đã có carrier". Đó là lý do mọi đơn Ground chạy
     * ngày 11–12/08 đều phải thêm `--test-bo-loc-cot-CD`, một cờ vốn chỉ dành cho test.
     *
     * ⚠️ Chỉ miễn trừ ĐÚNG chuỗi `UPS`. Mọi giá trị khác (`AACT`, `SEFL`, `NULL`, tên
     *    người…) vẫn chặn như cũ, và cột D (PIC) thì không đổi gì.
     *    Rủi ro còn lại: nếu ai đó tự gõ `UPS` vào cột C để đánh dấu mình đang làm, script
     *    sẽ không nhận ra. Lúc đó `ups/<PO>.json` vẫn là lớp chặn cuối — nó ngăn tạo vận
     *    đơn thứ hai, dù không ngăn được việc hai người cùng làm một đơn. */
    const cotC = (r.carrier || '').trim().toUpperCase();
    if (!BO_LOC) {
      if (!LA_B2C && cotC && cotC !== 'UPS') { boQua.push({ po, ly_do: `cot C da co carrier ${r.carrier}` }); continue; }
      if ((r.pic || '').trim()) { boQua.push({ po, ly_do: `cot D co PIC ${r.pic}` }); continue; }
    } else if ((r.carrier || '').trim() || (r.pic || '').trim()) {
      log(`   ⛔ ${po}: VUOT LOC — cot C="${r.carrier || ''}" cot D="${r.pic || ''}"`);
    }

    let d;
    try { d = await docSlip(path.join(SLIPDIR, `${po}_PackingSlip.pdf`)); }
    catch (e) { cho.push({ po, ly_do: 'doc slip: ' + e.message }); continue; }

    // Script NÀY chỉ làm Ground. Đơn Misc là việc của `xu-ly-don.mjs`.
    if (d.loai !== 'Ground') { boQua.push({ po, ly_do: `Ship Via = ${d.loai}, khong phai Ground` }); continue; }

    dsSlip.push({ po, d, r });
  }

  /* --- Mở trình duyệt TRƯỚC khi phân loại ------------------------------------
   * Cần cho hai việc: tra tồn để biết SKU nhóm ưu tiên thuộc sheet nào, và chọn kho.
   * Không mở khi mọi đơn đều toàn SKU Calhoun (chúng không qua Lecangs) hoặc khi ép kho. */
  const canLecangs = !KHO_EP && dsSlip.some(x => !x.d.items.every(i => G.laSkuNgoaiLe(i.model)));
  let ctx = null, page = null;
  if (canLecangs) {          // kể cả --dry: tra tồn chỉ ĐỌC, không tra thì --dry phân loại sai
    try {
      log('mo trinh duyet de tra ton kho Lecangs...');
      ctx = await moContext({ headless: true });
      page = ctx.pages()[0] || await ctx.newPage();
      await vaoLecangs(page);
    } catch (e) {
      /* Phiên chết KHÔNG dừng cả lô: người dùng chốt 12/08 — SKU nhóm ưu tiên
       * **mặc định B2C** khi chưa tra được. Đơn nào thật sự cần chọn kho thì sẽ
       * chết ở `lamMotDon` với thông báo riêng, không phải đoán mò ở đây. */
      log(`⚠️ khong mo duoc phien Lecangs (${e.message.slice(0, 80)}) — SKU nhom uu tien se mac dinh B2C`);
      if (ctx) { await ctx.close().catch(() => {}); ctx = null; }
      page = null;
    }
  }

  /* Tra tồn MỘT lần cho mỗi model, dùng lại cho cả phân loại lẫn chọn kho.
   * `undefined` = chưa tra được (không có trình duyệt) — khác hẳn "tra rồi, hết hàng". */
  const tonCache = new Map();
  async function traTonMotLan(model) {
    if (tonCache.has(model)) return tonCache.get(model);
    if (!page) { tonCache.set(model, undefined); return undefined; }
    try {
      const { hang } = await traTonKho(page, model);
      tonCache.set(model, hang);
      return hang;
    } catch (e) {
      log(`   ⚠️ tra ton "${model}" loi: ${e.message.slice(0, 80)} — coi nhu chua tra duoc`);
      tonCache.set(model, undefined);
      return undefined;
    }
  }

  /* --- VÒNG 2: phân loại từng dòng hàng rồi quyết định ------------------------ */
  for (const x of dsSlip) {
    const { po, d } = x;

    /* 🔒 ĐÃ TẠO LABEL Ở B2C THÌ KHOÁ Ở B2C (người dùng chốt 12/08).
     * Tồn kho đổi theo giờ: sáng còn hàng -> B2C và đã có vận đơn; chiều hết hàng ->
     * cùng đơn đó lại "thuộc B2B". Không khoá thì đơn nhảy sheet trong khi nhãn đã in. */
    const daCoLabel = !!(await docBangChung(po));

    // Tra tồn cho các SKU mà tồn kho quyết định sheet — chỉ những SKU đó.
    const conHangTheoSku = new Map();
    for (const it of d.items) {
      if (!G.canTraTonDePhanLoai(it.model)) continue;
      if (daCoLabel) { conHangTheoSku.set(it.model, true); continue; }   // khoá B2C
      const hang = await traTonMotLan(it.model);
      if (hang === undefined) { conHangTheoSku.set(it.model, undefined); continue; }
      const du = hang.some(h => Number(h.con) >= Number(it.qty));
      conHangTheoSku.set(it.model, du);
      log(`   ${po}: ton "${it.model}" -> ${hang.map(h => `${h.kho}=${h.con}`).join(' · ') || '(khong co)'}` +
          ` | can ${it.qty} -> ${du ? 'B2C' : 'HET HANG -> B2B'}`);
    }

    const laGround = d.loai === 'Ground';
    const nhan = d.items.map(it => G.phanLoaiSku(it.model, {
      conHang: conHangTheoSku.get(it.model), laGround, bang: d.shipTo.bang
    }));

    /* Ghi kết quả tra tồn ra đĩa — CHỈ khi thật sự tra được (không ghi khi phiên chết,
     * vì `undefined` là "chưa biết", không phải một kết luận). */
    const daTra = [...conHangTheoSku.entries()].filter(([, v]) => v !== undefined);
    if (daTra.length) {
      await fs.writeFile(path.join(PLDIR, `${po}.json`), JSON.stringify({
        luc: new Date().toISOString(), po,
        conHang: Object.fromEntries(daTra),
        nhan: Object.fromEntries(d.items.map((it, i) => [it.model, nhan[i]]))
      }, null, 1)).catch(() => {});
    }
    const items = d.items.filter((_, i) => nhan[i] === 'B2C');
    const boLai = d.items.filter((_, i) => nhan[i] === 'B2B');

    if (!items.length) {
      boQua.push({ po, ly_do: `moi SKU deu thuoc B2B (${boLai.map(i => i.model).join(', ')}) — viec cua xu-ly-don.mjs` });
      continue;
    }

    let kien, uuTien;
    try {
      kien = items.map(it => {
        const dm = G.traDims(dims, it.model);            // model NGUYÊN VẸN, giữ hậu tố -B
        return { model: it.model, qty: it.qty, lb: dm.lb, L: dm.L, W: dm.W, H: dm.H };
      });
      uuTien = G.khoUuTien(bangKho, d.shipTo.bang, items[0].model);
    } catch (e) { cho.push({ po, ly_do: e.message }); continue; }

    const laHonHop = boLai.length > 0;
    const coX = /^x$/i.test(String(rowsGoc[po]?.b2bB2c || '').trim());

    if (!LA_B2C) {
      if (laHonHop) { chiTich.push({ po, boLai, items }); continue; }
    } else {
      if (!laHonHop) { boQua.push({ po, ly_do: 'khong phai don hon hop — viec cua tool sheet chinh' }); continue; }
      if (!coX && !BO_LOC) { boQua.push({ po, ly_do: 'chua co X o cot T cua Order List — cho tool sheet chinh tich truoc' }); continue; }
      if (!BO_LOC && (x.r.link || '').trim()) {
        boQua.push({ po, ly_do: 'phan B2C da xu ly (sheet B2C da co link Drive)' }); continue;
      }
    }

    /* Cột K đã có trên sheet (nếu `xu-ly-don.mjs` điền trước) — mang theo để KHÔNG
     * tính lại ngày. Xem `pickupCu` chỗ gọi `makeFolder`. */
    lam.push({ po, d, items, boLai, kien, uuTien, ngoaiLe: uuTien.ngoaiLe, laHonHop,
               pickupCu: String(x.r?.pickup || '').trim() });
  }

  /* Đơn hỗn hợp gặp ở tool sheet chính: chỉ đặt dấu X rồi thôi. Đặt dấu là việc DUY NHẤT
   * ở đây, nên làm ngay, không chờ tới lượt xử lý nào cả. */
  for (const c of chiTich) {
    log(`   🔀 ${c.po} — don hon hop: B2C ${c.items.map(i => i.model).join('+')} · ` +
        `B2B ${c.boLai.map(i => i.model).join('+')} -> chi tich cot T`);
    if (!DRY) {
      const o = await W.danhDauB2B_B2C(c.po);
      log(`   🔀 ${c.po}: cot T = X (hang ${o.row}) — hai sheet con se lo phan cua minh`);
    }
  }

  log(`se lam ${lam.length} | bo qua ${boQua.length} | cho nguoi xem ${cho.length}`);
  for (const b of boQua) log('   bo qua', b.po, '-', b.ly_do);
  for (const c of cho) log('   ⚠️ CHO', c.po, '-', c.ly_do);
  for (const x of lam) {
    log(`   -> ${x.po} | ${x.d.shipTo.laStore ? 'store' : 'khach le'} ${x.d.shipTo.bang}` +
        ` | ` + x.kien.map(k => `${k.qty}x ${k.model} (${k.lb} lb ${k.L}x${k.W}x${k.H})`).join(' + ') +
        ` | kho uu tien: ${x.uuTien.ds.join('>')}${x.ngoaiLe ? ' (SKU ngoai le -> Calhoun)' : ''}`);
    if (x.boLai.length) {
      log(`      🔀 don hon hop — CHI lam phan B2C. De lai cho luong B2B: ` +
          x.boLai.map(i => `${i.qty}x ${i.model}`).join(' + '));
    }
  }

  if (DRY) { log('--dry: khong goi UPS, khong ghi gi.'); if (ctx) await ctx.close().catch(() => {}); return; }
  if (MAX > 0 && lam.length > MAX) {
    log(`--max ${MAX}: lam ${MAX} don, ${lam.length - MAX} don de lan sau`);
    lam.length = MAX;
  }

  // Trình duyệt đã mở từ TRƯỚC vòng phân loại (tra tồn quyết định sheet), dùng tiếp ở đây.
  let xong = 0;
  try {
  for (const x of lam) {
    try { await lamMotDon(x, page, tonCache); xong++; }
    catch (e) {
      process.exitCode = 5;
      console.error(`\n❌ ${x.po}: ${e.message}\n` +
                    `   Neu shipment DA tao thi so nam o ${fileBangChung(x.po)} —\n` +
                    `   chay lai se DUNG LAI so do, khong tao shipment thu hai.\n`);
    }
  }
  } finally {
    // Profile chỉ được ghi đầy đủ khi đóng sạch — xem chú thích ở `phien.moContext`.
    if (ctx) await ctx.close().catch(() => {});
  }
  log('---');
  log(`xong ${xong}/${lam.length}`);
}

/**
 * Một đơn, trọn vòng.
 *
 * ⚠️ CHỌN KHO: script này CHƯA tra tồn kho Lecangs (việc đó cần trình duyệt, xem
 *    `lecangs.traTonKho`). Hiện lấy **kho gần nhất** trong bảng ưu tiên. Kho gần nhất
 *    mà hết hàng thì phải đổi — nên **lô đầu bắt buộc chạy `--only` từng đơn và xem tay**.
 *    Nối Lecangs vào đây là việc kế tiếp.
 */
async function lamMotDon(x, page, tonCache = new Map()) {
  /* `items` = các dòng hàng THUỘC LUỒNG NÀY. Với đơn hỗn hợp nó đã bị lọc còn phần
   * B2C (xem chỗ dựng `lam`); mọi chỗ dưới đây phải dùng nó, KHÔNG dùng `d.items`. */
  const { po, d, items, kien } = x;

  /* --- CHỌN KHO ------------------------------------------------------------
   * 🔴 Phải tra TỒN KHO thật, không lấy bừa kho gần nhất.
   *    Đo 09/08 trên 4 đơn chờ: đơn 79850310 (TX) có thứ tự ưu tiên
   *    `HOU07 > MEM-R > Calhoun > SAV > CAP > NJF02`, nhưng bốn kho đầu KHÔNG HỀ CÓ
   *    SKU 814300 — chỉ CAP (53) và NJF02 (7) có. Lấy kho gần nhất là in label cho
   *    một kho không có hàng, và lỗi chỉ lộ ra khi hàng không tới tay khách.
   *
   * 4 SKU ngoại lệ thì `khoUuTien()` đã ép Calhoun và KHÔNG qua Lecangs (tài liệu
   * Phần 3) — bỏ qua bước tra tồn kho cho chúng. */
  let nhomKho;                       // [{ tenKho, kien: [...] }] — mỗi phần tử một shipment
  if (KHO_EP) {
    nhomKho = [{ tenKho: KHO_EP, kien }];
    log(`${po}: kho do nguoi dung ep = ${KHO_EP} (BO QUA tra ton kho)`);
  } else if (x.ngoaiLe) {
    nhomKho = [{ tenKho: x.uuTien.ds[0], kien }];   // Calhoun
    log(`${po}: SKU ngoai le -> kho ${x.uuTien.ds[0]}, khong tra Lecangs`);
  } else {
    if (!page) throw new Error(`${po}: can tra ton kho Lecangs nhung khong mo duoc trinh duyet`);
    const tonTheoSku = [];
    for (const k of kien) {
      /* Dùng lại kết quả đã tra ở bước phân loại — cùng lô, cùng phiên, tra lại chỉ
       * tốn thêm một vòng trình duyệt và có thể ra số khác nếu kho vừa xuất hàng. */
      let hang = tonCache.get(k.model);
      if (hang === undefined) {
        ({ hang } = await traTonKho(page, k.model));
        tonCache.set(k.model, hang);
      }
      log(`${po}: ton kho ${k.model}: ${hang.map(h => `${h.kho}=${h.con}`).join(' · ')}`);
      tonTheoSku.push({ k, hang });
    }
    nhomKho = chiaTheoKho(po, tonTheoSku, x.uuTien.ds);
    if (nhomKho.length === 1) {
      log(`${po}: -> chon ${nhomKho[0].tenKho} (du hang cho ca ${kien.length} SKU) | uu tien ${x.uuTien.ds.join('>')}`);
    } else {
      log(`${po}: ⚠️  KHONG kho nao du ca ${kien.length} SKU -> TACH ${nhomKho.length} shipment: ` +
          nhomKho.map(n => `${n.tenKho}(${n.kien.map(k => k.model).join('+')})`).join(' · '));
    }
  }

  const bangKhoDc = await G.docKhoDiaChi();
  const noiNhan = G.diaChiGiao(d.shipTo);

  /* 🔴 NGÀY PICKUP: DÙNG LẠI cột K nếu sheet đã có — sửa 13/08/2026.
   *
   * `xu-ly-don.mjs` điền cột K cho đơn Ground lúc T0, script này chạy lúc T1 và
   * trước đây tính lại `ngayPickupGround()`. Cùng công thức, nhưng công thức phụ
   * thuộc mốc **15:00 giờ VN** — hai lượt vắt qua mốc đó cho HAI ngày khác nhau,
   * và ngày thứ hai vừa ghi đè cột K vừa quyết định tên folder Drive theo ngày.
   * Kho nhận mail báo một ngày mà giấy tờ nằm ở folder ngày khác.
   * -> Sheet đã chốt ngày thì tôn trọng ngày đó; chỉ tính mới khi cột K còn trống. */
  const np = x.pickupCu && /^\d{2}\/\d{2}\/\d{4}$/.test(x.pickupCu)
    ? { mmddyyyy: x.pickupCu, d: new Date(x.pickupCu), tuSheet: true }
    : G.ngayPickupGround();
  if (np.tuSheet) log(`${po}: dung lai ngay pickup da co tren sheet: ${np.mmddyyyy}`);

  /* --- shipment: đọc bằng chứng trước, LÔ NÀO ĐÃ TẠO thì KHÔNG tạo lại ------
   *
   * 🔄 12/08/2026: một PO có thể sinh **nhiều shipment**, mỗi kho một cái (người dùng
   * chốt "tách làm 2 shipment, mỗi lần 1 kho, điền giống PO number"). Nên bằng chứng
   * phải ghi theo **từng lô**, và ghi NGAY sau mỗi lô: tạo được lô 1 rồi hỏng ở lô 2
   * mà chưa ghi thì lần chạy sau mua lại nhãn của lô 1 — tốn tiền thật.
   *
   * `bc.kien` vẫn là mảng PHẲNG mọi kiện của cả PO, đúng như trước, để các bước phía
   * dưới (upload label, cột N, Lecangs) không phải đổi gì. `bc.lo` là phần thêm.
   * File bằng chứng đời cũ chỉ có `shipmentId`/`kho` ở gốc — `nangDoiCu()` dựng lại
   * `lo` cho chúng, nếu không đơn cũ sẽ bị coi là chưa tạo lô nào. */
  let bc = nangBangChungDoiCu(await docBangChung(po));
  if (!bc) {
    bc = { luc: new Date().toISOString(), moiTruong: U.LA_THAT ? 'prod' : 'cie', lo: [], kien: [] };
  }

  /** Tên file label. Nhiều lô thì chèn tên kho — hai lô có thể chứa cùng một model. */
  const tenLabel = (k, i) => {
    const g = `${k.model || kien[0].model}_${k.thuTu || i + 1}_ShippingLabel.pdf`;
    return bc.lo.length > 1 && k.kho ? `${k.model || kien[0].model}_${k.kho}_${k.thuTu || i + 1}_ShippingLabel.pdf` : g;
  };
  for (const nhom of nhomKho) {
    const daCo = bc.lo.find(l => chuanTen(l.kho) === chuanTen(nhom.tenKho));
    if (daCo) {
      log(`${po}: lo ${nhom.tenKho} da co shipment ${daCo.shipmentId} tu ${bc.luc} — KHONG tao lai`);
      continue;
    }
    const kho = G.traKho(bangKhoDc, nhom.tenKho);
    const sh = await SHIP.taoShipment({
      po, kho, noiNhan, laKhachLe: !d.shipTo.laStore,
      kien: nhom.kien, moTa: items[0].moTa
    }, { log });

    // 🔴 GHI NGAY, trước mọi bước khác. Label nằm trong file luôn, vì lấy lại
    //    label sau này nghĩa là gọi LabelRecovery — thêm một đường có thể hỏng.
    bc.lo.push({ kho: kho.kho, shipmentId: sh.shipmentId, cuoc: sh.cuoc,
                 soKien: sh.kien.length });
    bc.kien.push(...sh.kien.map(k => ({ tracking: k.tracking, model: k.model, thuTu: k.thuTu,
                                        kho: kho.kho, pdfBase64: k.pdf.toString('base64') })));
    await fs.writeFile(fileBangChung(po), JSON.stringify(bc, null, 1), { mode: 0o600 });
    log(`${po}: ✅ lo ${kho.kho}: ${sh.kien.length} tracking, da ghi bang chung`);
  }
  if (!bc.kien.length) throw new Error(`${po}: khong tao duoc kien nao`);

  const trackings = bc.kien.map(k => k.tracking);
  const nhan = bc.kien.map(k => Buffer.from(k.pdfBase64, 'base64'));

  /* --- pickup: MỘT LÔ một pickup (mặc định TẮT, xem TAO_PICKUP) -------------
   * Đơn tách kho thì mỗi kho một xe riêng — không có cách nào một xe ghé hai kho.
   * PRN ghi vào từng `bc.lo[i]`, nên hỏng giữa chừng chạy lại chỉ đặt nốt lô còn thiếu.
   * ⚠️ Nhánh này CHƯA chạy thật lần nào (Home Depot từ chối trả phí pickup). */
  if (!TAO_PICKUP) {
    log(`${po}: ⏭️  bo qua pickup (kho da co xe UPS ghe san). Them --pickup neu can goi xe.`);
  } else {
    for (const lo of bc.lo) {
      if (lo.prn) { log(`${po}: lo ${lo.kho} da co PRN ${lo.prn} — khong dat xe lan nua`); continue; }
      const cuaLo = bc.kien.filter(k => chuanTen(k.kho || lo.kho) === chuanTen(lo.kho));
      const kienLo = kien.filter(k => cuaLo.some(z => z.model === k.model));
      const pk = await PICKUP.datPickup({
        po, kho: G.traKho(bangKhoDc, lo.kho), ngay: np.d,
        soKien: kienLo.reduce((a, k) => a + Number(k.qty), 0),
        tongCanNang: kienLo.reduce((a, k) => a + Number(k.lb) * Number(k.qty), 0),
        trackings: cuaLo.map(k => k.tracking)
      }, { log, phuongThucTra: PT_TRA });
      lo.prn = pk.prn; lo.phiPickup = pk.phi;
      await fs.writeFile(fileBangChung(po), JSON.stringify(bc, null, 1), { mode: 0o600 });
      log(`${po}: lo ${lo.kho}: PRN ${pk.prn}`);
    }
  }

  /* 🔴 CỔNG 4 — CIE KHÔNG ĐƯỢC GHI VÀO SHEET/DRIVE THẬT.
   * Sheet và Drive chỉ có MỘT bản, không có "môi trường test". Chạy trên CIE mà vẫn
   * `fillRow` thì cột N nhận tracking giả `1ZXXXXXXXXXXXXXXXX` — dữ liệu rác nằm giữa
   * dữ liệu thật, và người khác sẽ tưởng đơn đã xong.
   * Lần đầu viết hàm này tôi quên mất chuyện đó: `--dry` thì an toàn, `--that` thì an
   * toàn, nhưng đúng ca ở giữa (CIE + không dry) lại ghi bậy. Thêm cổng riêng cho nó.
   * Muốn kiểm cả đường Drive/sheet bằng dữ liệu CIE thì phải nói rõ: `--ghi-sheet`. */
  if (!U.LA_THAT && !argv.includes('--ghi-sheet')) {
    const noi = path.join(UPSDIR, `${po}_label_1.pdf`);
    await fs.writeFile(noi, nhan[0]);
    log(`${po}: ⏸️  DUNG truoc Drive/sheet vi dang o CIE (tracking gia). ` +
        `Label luu tam: ${noi}. Them --ghi-sheet neu that su muon ghi.`);
    return;
  }

  // --- Drive + sheet: từ đây mọi thứ đều làm lại được ----------------------
  // Ground KHÔNG áp trần 20 đơn/ngày -> boQuaTran = true (xem CLAUDE.md muc 4).
  // Qua `layFolder`: PO da co folder thi DUNG LAI, khong tao folder o ngay moi
  // (cung ly do voi nhanh BOL — xem webapp.mjs).
  const mk = await W.layFolder(po, np.mmddyyyy, true, log);
  log(`${po}: folder ${mk.dayFolder}`);

  /* Tên file `<SKU>_<số thứ tự trong SKU đó>_ShippingLabel.pdf` — tài liệu ghi rõ số
   * thứ tự để phân biệt khi một SKU có Qty > 1, và khi đơn có SKU trùng nhau. */
  for (let i = 0; i < nhan.length; i++) {
    const kk = bc.kien[i];
    await W.uploadFile(mk.folderId, tenLabel(kk, i), nhan[i]);
  }
  // 4 SKU ngoại lệ: lưu THÊM packing slip vào cùng folder (tài liệu Phần 3).
  if (x.ngoaiLe) {
    const slip = await fs.readFile(path.join(SLIPDIR, `${po}_PackingSlip.pdf`));
    await W.uploadFile(mk.folderId, `${po}_PackingSlip.pdf`, slip);
  }


  /* 🔀 ĐƠN HỖN HỢP GHI THẲNG VÀO SHEET **B2C**, không ghi `Order List`.
   *
   * Người dùng chốt 11/08/2026: mỗi sheet có luồng riêng, `Order List` chỉ còn là danh
   * sách đầu vào (A, B và `X` ở cột T). Nhờ vậy phần B2C và phần B2B của cùng một PO
   * nằm ở hai nơi, không tranh nhau một hàng.
   *
   * An toàn được là nhờ luật copy: với đơn `T = X`, `copyB2B_B2C` chỉ chạm đúng ô A và
   * ô T ở sheet đích — mọi thứ ghi dưới đây không bị lượt copy sau đè mất. */
  const dich = LA_B2C ? W.SHEET.B2C : W.SHEET.ORDER;
  if (dich.gid) log(`${po}: ghi vao sheet B2C (gid ${dich.gid}), KHONG ghi Order List`);

  const fr = await W.fillRow({
    ...(dich.gid ? { sheetGid: dich.gid, headerRows: dich.headerRows } : {}),
    po, carrier: 'UPS', customerOrder: d.customerOrder,
    shipTo: d.shipTo.ten,                 // TÊN, bỏ phần "C/O ..."
    /* 🔴 `kien` là MẢNG — `kien.model` / `kien.qty` là `undefined`.
     *
     * Bug thật, người dùng phát hiện 11/08/2026: cột I của mọi đơn Ground ghi chuỗi
     * `"undefined"`, cột G bỏ trống. Lý do hai cột hỏng theo hai kiểu khác nhau nằm ở
     * `fillRow`: nó bỏ qua giá trị `null`/rỗng, nên `sku: undefined` không được ghi,
     * còn `String(undefined)` ra chuỗi `"undefined"` — không rỗng, nên được ghi thật.
     *
     * Mỗi dòng hàng một dòng trong ô, cùng quy ước với cột N (mỗi tracking một dòng)
     * để đọc theo hàng ngang là khớp nhau. */
    sku: kien.map(k => k.model).join('\n'),
    productName: items.map(i => i.moTa).join('\n'),   // mô tả trên SLIP
    qty: kien.map(k => k.qty).join('\n'),
    pickupSchedule: mk.pickupSchedule,
    skipCap: true, linkDrive: mk.url,
    // Cột N: TẤT CẢ tracking trong CÙNG MỘT Ô, mỗi số một dòng (tài liệu chốt 06/08).
    pro: trackings.join('\n')
  });
  log(`${po}: ✅ hang ${fr.row} | pickup ${fr.pickupSchedule} | ${nhan.length} label | ${mk.url}`);


  /* --- LECANGS: mỗi Tracking Number MỘT đơn parcel ------------------------
   *
   * ⚠️ 4 SKU ngoại lệ KHÔNG qua Lecangs (tài liệu Phần 3) — với chúng thì luồng
   *    đã trọn vẹn ở bước trên.
   *
   * ⛔ `Save & Submit` chỉ chạy khi có `--lecangs-that`. Không có cờ thì chỉ ĐIỀN
   *    form rồi dừng, để người xem lại trước — bước này chưa từng chạy thật trong
   *    cả dự án, và chưa ai xác nhận đơn Lecangs tạo nhầm có huỷ được không.
   */
  if (x.ngoaiLe) {
    log(`${po}: SKU ngoai le -> KHONG qua Lecangs (tai lieu Phan 3). Xong.`);
    return;
  }
  if (!page) {
    log(`${po}: ⏸️  khong co trinh duyet -> bo qua Lecangs. Con ${trackings.length} don parcel phai tao.`);
    return;
  }

  const noiNhanLc = G.diaChiGiao(d.shipTo);
  for (let i = 0; i < trackings.length; i++) {
    const tn = trackings[i];
    // File label phải ĐÚNG cái chứa tracking đang điền — tài liệu nhấn mạnh "bắt buộc".
    const kkL = bc.kien[i];
    const fLabel = path.join(UPSDIR, `${po}_${tenLabel(kkL, i)}`);
    await fs.writeFile(fLabel, nhan[i]);

    /* 🔴 BẰNG CHỨNG CHỐNG TRÙNG — mỗi tracking một file, ghi NGAY sau khi Submit.
     *    Lecangs không có bước "kiểm đã tồn tại chưa", nên chạy lại mà không có cổng
     *    này là tạo đơn xuất kho thứ hai cho cùng một vận đơn. Đúng cơ chế đã cứu
     *    nhánh AACT và `run.mjs` — nơi nào không hoàn tác được, nơi đó phải có dấu vết. */
    const fBc = path.join(LECDIR, `${po}_${tn}.json`);
    if (await fs.access(fBc).then(() => true).catch(() => false)) {
      log(`${po}: Lecangs ${i + 1}/${trackings.length} — DA tao don cho ${tn} truoc do, BO QUA`);
      continue;
    }

    log(`${po}: Lecangs don ${i + 1}/${trackings.length} — tracking ${tn}` +
        (LECANGS_THAT ? ' ⛔ SE SUBMIT THAT' : ' (chi dien, KHONG submit)'));
    const r = await taoDonParcel(page, {
      kho: kho.kho, po,
      tenKhach: noiNhanLc.tenKhach,
      dienThoai: noiNhanLc.dienThoai,
      bang: d.shipTo.bang, city: noiNhanLc.city, zip: noiNhanLc.zip,
      diaChi1: noiNhanLc.diaChi1, diaChi2: noiNhanLc.diaChi2,
      tracking: tn, duongDanLabel: fLabel, sku: (bc.kien[i].model || kien[0].model)
    }, { guiThat: LECANGS_THAT, log: (m) => log(`   ${m}`) });

    if (r.daGui) {
      if (r.anh) await fs.writeFile(path.join(LECDIR, `${po}_${tn}.png`), r.anh);
      const { anh, ...luu } = r;
      await fs.writeFile(fBc, JSON.stringify({ luc: new Date().toISOString(), po, tracking: tn, ...luu }, null, 1),
                         { mode: 0o600 });
      log(`${po}: ✅ da ghi bang chung Lecangs ${fBc}`);
    } else if (LECANGS_THAT) {
      // Bấm rồi mà không rời trang: KHÔNG ghi bằng chứng, và nói thẳng là chưa chắc.
      log(`${po}: ⚠️ ${r.ghiChu}`);
    }
    const { anh: _bo, ...goN } = r;
    log(`${po}: Lecangs ${i + 1}/${trackings.length} -> ${JSON.stringify(goN)}`);
  }
}

main().catch(e => { console.error('\n❌ ' + e.stack + '\n'); process.exit(1); });
