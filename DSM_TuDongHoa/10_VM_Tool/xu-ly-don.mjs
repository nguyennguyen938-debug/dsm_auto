#!/usr/bin/env node
/**
 * ============================================================================
 *  xu-ly-don.mjs — nối tiếp run.mjs: slip -> BOL -> Drive -> sheet
 * ----------------------------------------------------------------------------
 *  Ba nhánh, mức rủi ro KHÁC HẲN nhau:
 *    SEFL·XGSI·BXID·FXFE·ABFS — form BOL chung, không cần trình duyệt. Sai thì sửa được.
 *    AACT                     — ⛔ Finalize trên aaacooper.com tạo BOL#/PRO# THẬT.
 *    UPS (Ground) · CTII      — 🔄 **CHỈ ĐIỀN SHEET** (chốt 09/08/2026). Chưa tạo BOL,
 *                               chưa tạo ShippingLabel, chưa tạo folder Drive.
 *                               Cột P để trống; cột J KHÔNG đánh X (chưa có giấy tờ nào).
 *                               Vẫn TUYỆT ĐỐI không đụng centraltransport.com — submit ở
 *                               đó tạo lệnh pickup thật, không huỷ được.
 *
 *    node xu-ly-don.mjs --dry          # chỉ liệt kê sẽ làm gì, KHÔNG ghi gì
 *    node xu-ly-don.mjs                # chạy thật
 *    node xu-ly-don.mjs --only 123     # giới hạn PO
 *    node xu-ly-don.mjs --max 10       # trần số đơn mỗi lần chạy
 *
 *  ⛔ Chạy thật GHI VÀO SHEET, TẠO FILE trên Drive, và với AACT thì TẠO BOL THẬT.
 *     Không tạo lệnh pickup nào (chỉ CTII mới tạo, mà CTII không nằm trong script này).
 *
 *  🔴 Với AACT, thứ tự trong mỗi đơn KHÔNG ĐƯỢC ĐẢO:
 *       Finalize -> GHI NGAY BOL#/PRO# ra 11_TaiVe/aact/<PO>.json -> tải file -> Drive -> sheet
 *     Finalize không hoàn tác được, mọi bước sau làm lại được. File đó là bằng chứng
 *     "đơn này đã có BOL"; thiếu nó thì lần chạy sau tạo BOL THỨ HAI.
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
import * as G from './ground-tra.mjs';
import * as AACT from './aact.mjs';

const GOC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SLIPDIR = process.env.DSM_SLIP || path.join(GOC, '11_TaiVe', 'packingslip');
const BOLDIR = process.env.DSM_BOL || path.join(GOC, '11_TaiVe', 'bol');

/** Carrier dựng BOL bằng form chung — KHÔNG cần trình duyệt, không cần đăng nhập. */
const KHONG_WEB = new Set(['SEFL', 'XGSI', 'BXID', 'FXFE', 'ABFS']);

/**
 * AACT — cần trình duyệt + đăng nhập, và **Finalize tạo BOL#/PRO# THẬT**.
 * CTII vẫn KHÔNG nằm đây: submit CTII tạo lệnh pickup thật, người dùng đã chốt
 * phải dừng trước Submit nên không tự động hoá được.
 */
const CAN_AACT = 'AACT';

/**
 * Nơi ghi BOL#/PRO# NGAY sau Finalize.
 *
 * 🔴 VÌ SAO CẦN: Finalize không hoàn tác được, còn upload/fillRow thì có. Nếu tạo
 *    BOL xong mà bước sau hỏng, cột C vẫn trống -> lần chạy tới sẽ tạo BOL LẦN NỮA
 *    = BOL rác + PRO rác. File này là bằng chứng "đơn đã có BOL rồi", đọc trước khi
 *    quyết định tạo. Cùng nguyên tắc với manifest ở run.mjs.
 */
/**
 * Số lượng thật lấy từ DSM lúc submit reprint (`dsm.submitReprint` ghi ra).
 *
 * 🔴 VÌ SAO PHẢI ĐỐI CHIẾU: BOL tính weight và class từ `qty` ĐỌC TRÊN SLIP. Nếu slip
 *    in sai số lượng thì mọi con số phía sau đều sai mà KHÔNG CÓ GÌ BÁO — giấy tờ vẫn
 *    khớp nhau, chỉ hàng là thiếu. Đúng chuyện xảy ra 11/08/2026: 5/30 đơn in slip
 *    `Qty 1` trong khi DSM ghi `Quantity Ordered 2` (PO 81827440, 25567870, …),
 *    kéo theo BOL ghi 183 lb / class 92.5 thay vì 311 lb / class 77.5.
 */
const QTYDIR = process.env.DSM_QTY || path.join(GOC, '11_TaiVe', 'qty');

/**
 * Kết quả tra tồn do `xu-ly-ground.mjs` ghi ra — script này KHÔNG có trình duyệt nên
 * không tự tra được. Thiếu file thì `phanLoaiSku()` mặc định B2C, tức SKU nhóm ưu tiên
 * sẽ không được luồng B2B nhận. Đó là chủ ý: thà để đơn chờ còn hơn đoán sai chiều.
 */
const PLDIR = process.env.DSM_PL_OUT || path.join(GOC, '11_TaiVe', 'phanloai');
async function docPhanLoai(po) {
  try { return (JSON.parse(await fs.readFile(path.join(PLDIR, `${po}.json`), 'utf8'))).conHang || {}; }
  catch { return {}; }
}

const AACTDIR = process.env.DSM_AACT || path.join(GOC, '11_TaiVe', 'aact');
const fileAact = po => path.join(AACTDIR, `${po}.json`);

/**
 * Đối chiếu qty trên slip với qty DSM ghi nhận. Lệch -> ném lỗi để đơn rơi vào
 * danh sách "chờ người xem" thay vì lặng lẽ dựng BOL sai.
 * Chưa có file (slip tải trước 11/08) -> KHÔNG chặn, chỉ cảnh báo: chặn hết thì
 * mọi đơn cũ đứng lại, mà phần lớn trong số đó vốn đúng.
 */
async function kiemQty(po, qtySlip) {
  let f = null;
  try { f = JSON.parse(await fs.readFile(path.join(QTYDIR, `${po}.json`), 'utf8')); }
  catch { return { co: false }; }
  const tong = Number(f.tong);
  if (!Number.isFinite(tong) || tong < 1) return { co: false };
  if (tong !== Number(qtySlip)) {
    throw new Error(`SO LUONG LECH — slip ghi ${qtySlip} nhung DSM ghi nhan ${tong} ` +
      `(Quantity Ordered ${JSON.stringify(f.qtyDat)}). BOL se sai ca weight lan class. ` +
      `Tai lai slip voi so dung truoc khi dung BOL.`);
  }
  return { co: true, tong };
}

async function docDaTaoBOL(po) {
  try { return JSON.parse(await fs.readFile(fileAact(po), 'utf8')); } catch { return null; }
}

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
/**
 * ⛔ CHỈ DÙNG ĐỂ TEST. Vượt tầng lọc cột C/D — tức là làm lại đơn mà NGƯỜI KHÁC
 *    ĐANG hoặc ĐÃ làm tay. Với nhóm carrier này thì không tạo lệnh pickup, nhưng
 *    fillRow sẽ GHI ĐÈ dòng sheet đã có (rõ nhất là cột K mất mốc cũ).
 *    Đừng bao giờ đặt cờ này trong cron.
 */
const BO_LOC = argv.includes('--test-bo-loc-cot-CD');

/**
 * 🔀 BA TẦNG XỬ LÝ — người dùng chốt 11/08/2026.
 *
 *   (mặc định)      tool của **sheet chính** `Order List`. Xử lý mọi đơn thường;
 *                   gặp đơn HỖN HỢP thì **chỉ tích `X` cột T** rồi thôi.
 *   `--sheet b2b`   tool của **sheet B2B**. Chỉ nhận đơn đã tích `X`, làm phần
 *                   **kho Calhoun** (4 SKU ngoại lệ), ghi thẳng vào sheet B2B.
 *
 * Phần kho Lecangs là việc của `xu-ly-ground.mjs --sheet b2c`.
 *
 * 🔴 PHÂN LOẠI THEO **KHO**, không theo hãng vận chuyển — tôi đã gán ngược một lần:
 *      kho Calhoun (SKU ngoại lệ) -> **B2B**  ·  kho Lecangs -> **B2C**
 */
const CHE_DO = (() => {
  const i = argv.indexOf('--sheet');
  const v = i >= 0 ? String(argv[i + 1] || '').toLowerCase() : 'chinh';
  if (!['chinh', 'b2b'].includes(v)) {
    console.error(`\n⛔ --sheet chi nhan "b2b" (hoac bo di = sheet chinh). Nhan duoc: "${v}"\n`);
    process.exit(2);
  }
  return v;
})();
const LA_B2B = CHE_DO === 'b2b';
const ONLY = (() => { const i = argv.indexOf('--only'); return i >= 0 ? (argv[i + 1] || '').split(',').filter(Boolean) : null; })();
/** Trần số đơn dựng BOL mỗi lần chạy — chặn khi sheet có sự cố sinh ra hàng loạt. */
const MAX = (() => { const i = argv.indexOf('--max'); return i >= 0 ? parseInt(argv[i + 1], 10) || 0 : 0; })();

/**
 * 🔴 TẠM NGƯNG TỰ ĐIỀN CỘT K CHO ĐƠN **MISC** — người dùng chốt 09/08/2026.
 *
 * Đơn Ground (UPS) VẪN điền bình thường. Chỉ nhóm Misc — tức SEFL·XGSI·BXID·FXFE·ABFS,
 * AACT và CTII — là để cột K trống cho người tự điền.
 *
 * ⚠️ `makeFolder` VẪN nhận ngày pickup như cũ, vì tên folder trên Drive là
 *    `THD Orders / <DD Mon YYYY> / PO - <po>` — bỏ ngày đi thì không tạo được folder.
 *    Thay đổi ở đây chỉ là KHÔNG gửi `pickupSchedule` sang `fillRow`, nên Drive vẫn
 *    xếp đúng ngày còn sheet thì để trống. Hai thứ đó độc lập nhau.
 *
 * Bỏ cờ này (đặt `false`) là quay lại hành vi cũ, không cần sửa gì thêm.
 */
const NGUNG_DIEN_K_CHO_MISC = true;

/**
 * 🔴 TẠM NGƯNG CHỌN CARRIER CHO ĐƠN B2B — người dùng chốt 11/08/2026.
 *
 * Mọi đơn KHÔNG phải Ground và KHÔNG thuộc `SKU_LUON_UPS` đều coi là **B2B**:
 *   · KHÔNG tra `carrier.csv` nữa
 *   · VẪN dựng BOL bằng form chung, nhưng hai ô CARRIER NAME / SCAC để TRỐNG
 *   · cột C của sheet ghi chuỗi `NULL` (không phải ô trống — xem lý do bên dưới)
 *
 * ⚠️ HỆ QUẢ PHẢI BIẾT: vì không tra carrier nên script KHÔNG còn nhận ra AACT,
 *    tức nhánh Finalize thật trên aaacooper.com **không chạy nữa** -> PRO của AACT
 *    sẽ không tự về. Đây là chủ ý (giảm rủi ro trong lúc rà soát), không phải sót.
 *    `lamAACT()` giữ nguyên trong file để bật lại khi cần.
 *
 * ⚠️ VÌ SAO GHI `NULL` MÀ KHÔNG ĐỂ TRỐNG: cột C trống là tín hiệu "chưa ai xử lý"
 *    — chính nó khiến `needSlip` và tầng lọc coi đơn là chưa làm, rồi lần chạy sau
 *    dựng BOL lần nữa. `NULL` cho biết "đã xử lý, carrier chờ điền tay".
 */
const NGUNG_CHON_CARRIER_B2B = true;
const CARRIER_TRONG = 'NULL';

/**
 * 🔴 `SKU_LUON_UPS` ĐÃ BỎ — người dùng chốt 12/08/2026.
 *
 * Danh sách đó ép carrier `UPS` cho đúng bốn SKU (`836390`/`838390` ± `-B`) mà luật mới
 * bảo phải về **B2B** (kho Calhoun). Giữ cả hai thì một đơn vừa bị ép đi UPS vừa bị xếp
 * vào luồng dựng BOL — hai luật ngược nhau.
 *
 * Nay chỉ còn MỘT nơi phân loại: `ground-tra.phanLoaiSku()`.
 */

/**
 * ĐƠN "VỪA B2B VỪA B2C" — có ít nhất một dòng hàng về mỗi bên.
 *
 * Phân loại từng SKU bằng `G.phanLoaiSku()` — **nơi duy nhất** giữ luật, dùng chung với
 * `xu-ly-ground.mjs`. Trước 12/08 mỗi tool tự phán đoán và hai bên đã bất đồng về cùng
 * một đơn (xem `00_SoatLoi_12082026.md` lỗi L1).
 *
 * @param conHang  map model -> true/false, đọc từ `11_TaiVe/phanloai/<PO>.json` do
 *                 `xu-ly-ground.mjs` ghi. Thiếu thì `phanLoaiSku` mặc định B2C.
 */
function nhanTungSku(items, laGround, conHang = {}, bang) {
  return items.map(i => G.phanLoaiSku(i.model, { conHang: conHang[i.model], laGround, bang }));
}

function laDonHonHop(items, laGround, conHang, bang) {
  if (items.length < 2) return null;
  const nhan = nhanTungSku(items, laGround, conHang, bang);
  const coB2B = nhan.includes('B2B'), coB2C = nhan.includes('B2C');
  if (!coB2B || !coB2C) return null;
  return `hon hop: B2B ${items.filter((_, i) => nhan[i] === 'B2B').map(i => i.model).join('+')}` +
         ` · B2C ${items.filter((_, i) => nhan[i] === 'B2C').map(i => i.model).join('+')}`;
}

/* ✅ Đơn nhiều dòng hàng — LÀM ĐƯỢC từ 12/08/2026.
 *
 * Chốt chặn `lyDoNhieuSku` cũ đã bỏ. Nó tồn tại vì khâu dựng BOL và điền sheet chỉ đọc
 * `d.items[0]`, nên đơn nhiều SKU sẽ **âm thầm dựng BOL cho mỗi mã đầu tiên** rồi đánh X
 * cột J như thể đã xong. Nay ba chỗ đó đọc hết `d.items`:
 *   · `tinhBOL(d.items)` — cân nặng và class tính cho cả pallet chung (cách A)
 *   · `dungHtmlBOL({items})` — `fill_bol.py` in mỗi mã một dòng mô tả
 *   · `fillRow` — cột G/H/I ghi nhiều dòng, giống nhánh Ground
 */

/** Cột G/H/I: nhiều dòng hàng thì mỗi mã một dòng trong cùng ô — giống `xu-ly-ground.mjs`. */
const ghepCot = (items, lay) => items.map(lay).join('\n');

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
  await fs.mkdir(AACTDIR, { recursive: true });
  

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
  /* Chế độ B2B đọc/ghi ngay trên sheet B2B. Cột C bên đó để TRỐNG theo yêu cầu, nên
   * dấu hiệu "đã xử lý" là **cột P có link Drive**, không phải cột C. */
  const rows = await W.lookup(pos, LA_B2B ? W.SHEET.B2B : W.SHEET.ORDER);
  // Cột T luôn đọc từ `Order List` — nơi dấu X được đặt xuống đầu tiên.
  const rowsGoc = LA_B2B ? await W.lookup(pos) : rows;

  const bangCarrier = await docBangCarrier(path.join(GOC, '05_TraCuu', 'carrier.csv'));
  const pallet = await B.docPallet(path.join(GOC, '05_TraCuu', 'pallet.csv'));
  const bangClass = await B.docClass(path.join(GOC, '05_TraCuu', 'class.csv'));
  const np = B.ngayPickup();

  const lam = [], boQua = [], cho = [], honHop = [];

  for (const po of pos.sort()) {
    const r = rows[po] || {};
    // Luật lọc: cột C có carrier hoặc cột D có PIC -> có người đang làm tay.
    // Làm nữa = BOL trùng. Kiểm LẠI ở đây dù needSlip đã lọc, vì PIC có thể
    // được điền SAU khi slip đã tải.
    /* 🔀 Ở sheet con, cột C KHÔNG còn là dấu "có người làm tay": bên B2C nó do lượt copy
     * chép sang, bên B2B thì cố ý để trống. Dấu "đã xử lý" của sheet con là **cột P**
     * (kiểm riêng bên dưới). Cột D (PIC) thì vẫn là người thật, giữ nguyên phép kiểm. */
    if (!BO_LOC) {
      if (!LA_B2B && (r.carrier || '').trim()) { boQua.push({ po, ly_do: `cot C da co carrier ${r.carrier}` }); continue; }
      if ((r.pic || '').trim()) { boQua.push({ po, ly_do: `cot D co PIC ${r.pic}` }); continue; }
    } else if ((r.carrier || '').trim() || (r.pic || '').trim()) {
      log(`   ⛔ ${po}: VUOT LOC — cot C="${r.carrier || ''}" cot D="${r.pic || ''}" se bi GHI DE`);
    }

    let d;
    try { d = await docSlip(path.join(SLIPDIR, `${po}_PackingSlip.pdf`)); }
    catch (e) { cho.push({ po, ly_do: 'doc slip: ' + e.message }); continue; }

    if (d.po !== po) { cho.push({ po, ly_do: `PO trong slip la ${d.po}, lech ten file` }); continue; }

    /* Phân loại đơn NHIỀU DÒNG HÀNG — phải đứng trước mọi luật carrier bên dưới.
     * Đơn trộn B2B với B2C thì mỗi luồng chỉ làm phần của mình, nên phải biết
     * nhãn từng dòng hàng TRƯỚC khi chọn carrier cho cả đơn. */
    const conHang = await docPhanLoai(po);
    const laGroundSlip = d.loai === 'Ground';
    const lyDoHonHop = laDonHonHop(d.items, laGroundSlip, conHang, d.shipTo.bang);
    /* Tổng qty của **cả đơn**, chốt TRƯỚC khi lọc. `kiemQty` đối chiếu với con số DSM
     * ghi nhận cho cả PO, nên đem qty của riêng phần B2B đi so là sai — đơn hỗn hợp nào
     * cũng sẽ báo "SO LUONG LECH" oan (gặp thật với 81944554: 1 so với 2). */
    const qtyTongSlip = d.items.reduce((t, i) => t + Number(i.qty), 0);
    let itemsB2B = d.items, laHonHop = false;
    if (lyDoHonHop) {
      /* 🔀 ĐƠN HỖN HỢP — phần của luồng này là **kho Calhoun** (4 SKU ngoại lệ = B2B).
       * Phần kho Lecangs (B2C) do `xu-ly-ground.mjs --sheet b2c` lo. */
      itemsB2B = d.items.filter((_, i) => nhanTungSku(d.items, laGroundSlip, conHang, d.shipTo.bang)[i] === 'B2B');
      laHonHop = true;
      if (!itemsB2B.length) { boQua.push({ po, ly_do: `${lyDoHonHop} — phan B2B (Calhoun) rong` }); continue; }

      if (!LA_B2B) {
        // Tool sheet CHÍNH: chỉ tích X rồi thôi, hai sheet con tự lo phần của mình.
        honHop.push({ po, ly_do: lyDoHonHop, d, boLai: itemsB2B });
        continue;
      }
      // Tool sheet B2B: chỉ nhận đơn ĐÃ được tích X, và chưa xử lý (cột P còn trống).
      if (!/^x$/i.test(String(rowsGoc[po]?.b2bB2c || '').trim()) && !BO_LOC) {
        boQua.push({ po, ly_do: 'chua co X o cot T cua Order List — cho tool sheet chinh tich truoc' }); continue;
      }
      if (!BO_LOC && (rows[po]?.link || '').trim()) {
        boQua.push({ po, ly_do: 'phan B2B da xu ly (sheet B2B da co link Drive)' }); continue;
      }
    } else if (LA_B2B) {
      boQua.push({ po, ly_do: 'khong phai don hon hop — viec cua tool sheet chinh' }); continue;
    }
    // Từ đây trở xuống chỉ làm việc với phần thuộc luồng này.
    if (laHonHop) d = { ...d, items: itemsB2B };

    /* --- ĐƠN GROUND: về B2C hay B2B? -----------------------------------------
     *
     * 🔄 ĐỔI 12/08/2026. Trước đây `Ship Via = Ground` là quyết định cuối cùng — mọi đơn
     * Ground đều mang carrier `UPS` và chờ `xu-ly-ground.mjs` tạo nhãn. Nay **kho** mới
     * là thứ quyết định, và kho Calhoun thuộc **B2B** dù slip ghi Ground.
     *
     * Cả hai nhánh dưới đây đều `chiDienSheet` — chưa dựng BOL, chưa tạo file nào:
     *   · mọi SKU về B2C -> carrier `UPS`, `xu-ly-ground.mjs` lo phần nhãn
     *   · mọi SKU về B2B -> carrier `NULL`, để `copyB2B_B2C` đẩy sang **sheet B2B**
     *     (người dùng chốt "trước mắt chỉ điền sheet" — hàng Ground đi parcel, dựng BOL
     *      pallet cho nó là sai bản chất)
     *
     * Ghi `UPS` cho nhánh B2B thì lượt copy sẽ đẩy nhầm sang sheet B2C — cột C chính là
     * thứ `copyB2B_B2C` dùng để chia sheet. */
    if (laGroundSlip) {
      if (laHonHop) {
        /* Chế độ `--sheet b2b`: phần Calhoun của một đơn Ground. Hàng đi **parcel**, nên
         * KHÔNG dựng BOL — người dùng chốt 12/08 "trước mắt chỉ điền sheet". Cột C để
         * trống vì sheet B2B là nơi người dùng tự điền hãng. */
        lam.push({ po, d, carrier: '', tinh: null, chiDienSheet: true,
                   laHonHop, ghiChuNhan: 'Ground/B2B -> chi dien sheet, KHONG dung BOL' });
        continue;
      }
      const nhanG = nhanTungSku(d.items, true, conHang, d.shipTo.bang);
      const toanB2B = nhanG.every(n => n === 'B2B');
      lam.push({ po, d, carrier: toanB2B ? CARRIER_TRONG : 'UPS', tinh: null, chiDienSheet: true,
                 ghiChuNhan: toanB2B ? 'Ground nhung kho Calhoun -> B2B' : null });
      continue;
    }

    let carrier;
    if (NGUNG_CHON_CARRIER_B2B) {
      // Không tra carrier.csv nữa — mọi đơn Misc đều là B2B, BOL để trống carrier.
      // Đơn hỗn hợp: cột C để TRỐNG hẳn (người dùng chốt "không điền gì, giống luật copy").
      carrier = laHonHop ? '' : CARRIER_TRONG;
    } else {
      try { carrier = chonCarrier(bangCarrier, d.shipTo.bang, d.shipTo.laStore); }
      catch (e) { cho.push({ po, ly_do: e.message }); continue; }

      /* CTII: cùng chính sách với Ground — chỉ điền sheet. Vẫn KHÔNG đụng
       * centraltransport.com (submit ở đó tạo lệnh pickup thật, không huỷ được). */
      if (carrier === 'CTII') {
        lam.push({ po, d, carrier: 'CTII', tinh: null, chiDienSheet: true });
        continue;
      }
      if (carrier !== CAN_AACT && !KHONG_WEB.has(carrier)) {
        boQua.push({ po, ly_do: `${carrier} — can web carrier, chua tu dong` });
        continue;
      }
    }

    // Đối chiếu số lượng TRƯỚC khi tính BOL — sai qty là sai cả weight lẫn class.
    try { await kiemQty(po, qtyTongSlip); }
    catch (e) { cho.push({ po, ly_do: e.message }); continue; }

    let tinh;
    try { tinh = B.tinhBOL(d.items, pallet, bangClass); }
    catch (e) { cho.push({ po, ly_do: e.message }); continue; }

    lam.push({ po, d, carrier, tinh, laHonHop,
               laAact: !NGUNG_CHON_CARRIER_B2B && carrier === CAN_AACT });
  }

  log(`se lam ${lam.length} | bo qua ${boQua.length} | cho nguoi xem ${cho.length}` +
      ` | vua B2B vua B2C ${honHop.length}`);
  for (const b of boQua) log('   bo qua', b.po, '-', b.ly_do);
  for (const c of cho) log('   ⚠️ CHO', c.po, '-', c.ly_do);
  for (const h of honHop) log('   🔀 B2B+B2C', h.po, '-', h.ly_do,
                             '|', h.d.items.map(i => `${i.qty}x ${i.model}`).join(' + '));

  /* Tích `X` cột T — chạy TRƯỚC nhóm `lam`, thứ tự này không được đảo.
   *
   * 🔄 Từ 11/08/2026 đơn hỗn hợp KHÔNG còn bị bỏ qua: luồng này xử lý **phần B2B**
   * (BOL + Drive + sheet B2B), luồng Ground lo phần B2C. `X` ở cột T là thứ duy nhất
   * cho biết đơn cần cả hai luồng, nên phải đặt xuống trước khi ghi bất cứ dữ liệu nào —
   * ghi trước mà tích X hỏng thì nửa kia của đơn mất dấu. */
  if (!DRY) {
    for (const h of honHop) {
      try {
        const o = await W.danhDauB2B_B2C(h.po);
        log(`   🔀 ${h.po}: cot T = X (hang ${o.row}${o.themMoi ? ', hang moi' : ''})`);
      } catch (e) {
        log(`   ❌ ${h.po}: khong danh dau duoc cot T — ${e.message}`);
      }
    }
  }

  if (!lam.length) { if (DRY && honHop.length) log('--dry: khong ghi gi ca.'); return; }
  for (const x of lam) {
    const chung = `   -> ${x.po} ${x.carrier}${x.laAact ? ' [web]' : ''}` +
                  ` | ${x.d.shipTo.laStore ? 'store' : 'khach'} ${x.d.shipTo.bang}`;
    const dsHang = x.d.items.map(i => `${i.qty}x ${i.model}`).join(' + ');
    log(x.chiDienSheet
      ? `${chung} | ${dsHang} | CHI DIEN SHEET (khong BOL, khong Drive)` +
        (x.ghiChuNhan ? `  [${x.ghiChuNhan}]` : '')
      : `${chung} | ${dsHang} | ${x.tinh.weight} lb | class ${x.tinh.cls}` +
        (x.d.items.length > 1 ? `  [${x.d.items.length} ma, xep chung 1 pallet]` : ''));
  }

  if (DRY) { log('--dry: khong ghi gi ca. Bo --dry de chay that.'); return; }

  if (MAX > 0 && lam.length > MAX) {
    log(`gioi han --max ${MAX}: lam ${MAX} don lan nay, ${lam.length - MAX} don de lan sau`);
    lam.length = MAX;
  }

  let xong = 0;

  /* --- 3a. nhóm CHỈ ĐIỀN SHEET: UPS (Ground) và CTII ----------------------
   *
   * Người dùng chốt 09/08/2026: hai loại này CHƯA tạo BOL/ShippingLabel, nhưng VẪN
   * điền thông tin vào sheet — **trừ cột P (link Drive)** vì chưa tạo folder.
   *
   * 🔴 KHÔNG gọi `makeFolder`. Hệ quả phải nhớ:
   *    · không có `linkDrive` -> cột P để trống (đúng yêu cầu)
   *    · ngày pickup KHÔNG được `makeFolder` chốt nữa, nên script tự tính:
   *        Ground -> `ngayPickupGround()` (quy tắc ±15:00 giờ VN, chỉ dành cho Ground)
   *        CTII   -> `ngayPickup()` như đơn Misc
   *    · gửi `skipCap: true` để web app ghi ĐÚNG ngày vừa tính. Trần đơn/ngày vốn để
   *      giới hạn số đơn LTL mỗi chuyến xe; ở đây chưa đặt xe nên chưa áp. Khi nào
   *      thực sự tạo BOL/pickup thì bước đó sẽ chốt lại ngày.
   *    · gửi `chuaCoBOL: true` để web app KHÔNG đánh X vào cột J — chưa có giấy tờ nào.
   */
  const dsSheet = lam.filter(v => v.chiDienSheet);
  for (const x of dsSheet) {
    try {
      const laGround = x.d.loai === 'Ground';
      const ngay = laGround ? G.ngayPickupGround().mmddyyyy : np.mmddyyyy;
      // Misc -> KHONG gui pickupSchedule (xem NGUNG_DIEN_K_CHO_MISC). Ground van gui.
      const dienK = laGround || !NGUNG_DIEN_K_CHO_MISC;
      /* 🔴 NHÁNH NÀY CŨNG PHẢI TÔN TRỌNG `--sheet b2b`.
       *
       * Bản trước không truyền `sheetGid`, nên nó **luôn ghi vào `Order List`** kể cả khi
       * chạy ở chế độ sheet con. Chưa sai cho tới 12/08 — lúc đó phần B2B của đơn hỗn hợp
       * đi nhánh dựng BOL (nhánh đó có truyền). Nhưng khi người dùng chốt "hàng Ground về
       * B2B thì trước mắt chỉ điền sheet", phần Calhoun rơi vào đúng nhánh này và ghi
       * nhầm chỗ: đáng lẽ sheet B2B, thực tế `Order List`.
       *
       * Sai kiểu im lặng — `fillRow` vẫn trả về số hàng, log vẫn báo thành công. */
      const dichSheet = LA_B2B ? W.SHEET.B2B : W.SHEET.ORDER;
      const fr = await W.fillRow({
        ...(dichSheet.gid ? { sheetGid: dichSheet.gid, headerRows: dichSheet.headerRows } : {}),
        po: x.po, carrier: x.carrier, customerOrder: x.d.customerOrder,
        shipTo: x.d.shipTo.ten,
        sku: ghepCot(x.d.items, i => i.model),
        productName: ghepCot(x.d.items, i => i.moTa),
        qty: ghepCot(x.d.items, i => i.qty),
        ...(dienK ? { pickupSchedule: ngay } : {}),
        skipCap: true,
        chuaCoBOL: true
        // KHÔNG gửi linkDrive (chưa có folder) và KHÔNG gửi pro (chưa có tracking)
      });
      log(`${x.po}: ✅ hang ${fr.row} | ${x.carrier} | pickup ${dienK ? fr.pickupSchedule : '(KHONG dien — don Misc)'} | chua co BOL/Drive`);
      xong++;
    } catch (e) {
      process.exitCode = 5;
      console.error(`\n❌ ${x.po} (${x.carrier}): ${e.message}\n   Chi dien sheet, khong tao gi — sua roi chay lai duoc.\n`);
    }
  }

  // --- 3b. nhóm KHÔNG cần web: dựng BOL, rẻ, không cần trình duyệt --------
  for (const x of lam.filter(v => !v.laAact && !v.chiDienSheet)) {
    try {
      const html = await dungHtmlBOL({
        date: np.mmddyyyy, po: x.po,
        // 'NULL' -> bol_html.py để trống hai ô CARRIER NAME / SCAC
        carrier: x.carrier === CARRIER_TRONG ? '' : x.carrier,
        ship_name: x.d.shipTo.co ? `${x.d.shipTo.ten} ${x.d.shipTo.co}` : x.d.shipTo.ten,
        ship_address: x.d.shipTo.diaChi,
        ship_csz: `${x.d.shipTo.city}, ${x.d.shipTo.bang} ${x.d.shipTo.zip}`,
        phone: x.d.shipTo.phone || '',
        cust_order_num: `${x.d.customerOrder} (PO ${x.po})`,
        // Cả mảng — fill_bol.py tự tra pallet.csv, in mỗi mã một dòng và cộng 55 một lần
        items: x.d.items.map(i => ({ model: i.model, qty: i.qty }))
      });
      await fs.writeFile(path.join(BOLDIR, `${x.po}_BOL.html`), html);

      // makeFolder CHỐT NGÀY trước — fillRow dùng lại đúng ngày này.
      // Qua `layFolder`: PO đã có folder thì DÙNG LẠI, không tạo folder ở ngày mới.
      const mk = await W.layFolder(x.po, np.mmddyyyy, false, log);
      log(`${x.po}: folder ${mk.dayFolder}${mk.pickupMoved ? ' (ngay bi doi vi tran)' : ''}`);

      await W.uploadHtml(mk.folderId, `${x.po}_BOL.pdf`, html);
      const slip = await fs.readFile(path.join(SLIPDIR, `${x.po}_PackingSlip.pdf`));
      await W.uploadFile(mk.folderId, `${x.po}_PackingSlip.pdf`, slip);

      /* 🔀 Đơn hỗn hợp ghi thẳng vào **sheet B2B**, không ghi `Order List` — người dùng
       * chốt 11/08/2026. Cột C để TRỐNG (`x.carrier` đã là '' cho ca này). */
      const dich = LA_B2B ? W.SHEET.B2B : W.SHEET.ORDER;
      if (dich.gid) log(`${x.po}: ghi vao sheet B2B (gid ${dich.gid}), KHONG ghi Order List`);

      const fr = await W.fillRow({
        ...(dich.gid ? { sheetGid: dich.gid, headerRows: dich.headerRows } : {}),
        po: x.po, carrier: x.carrier, customerOrder: x.d.customerOrder,
        shipTo: x.d.shipTo.ten,                 // TÊN, BỎ phần "C/O ..."
        sku: ghepCot(x.d.items, i => i.model),  // nguyên Model Number, mỗi mã một dòng
        // Cột H lấy mô tả trên SLIP, KHÔNG phải mô tả trong pallet.csv —
        // hai chuỗi khác nhau, lấy nhầm là sheet ghi tên hàng lệch giấy tờ.
        productName: ghepCot(x.d.items, i => i.moTa),
        qty: ghepCot(x.d.items, i => i.qty),
        // Misc -> tam NGUNG dien cot K (NGUNG_DIEN_K_CHO_MISC). Folder Drive van theo
        // dung ngay mk.pickupSchedule, chi sheet la de trong.
        ...(NGUNG_DIEN_K_CHO_MISC ? {} : { pickupSchedule: mk.pickupSchedule }),
        skipCap: true, linkDrive: mk.url
        // KHÔNG gửi `pro` — TraPRO/CheckMail_PRO điền cột N sau
      });
      log(`${x.po}: ✅ hang ${fr.row} | pickup ${fr.pickupSchedule || '(KHONG dien — don Misc)'} | folder ${mk.dayFolder} | ${mk.url}`);
      xong++;
    } catch (e) {
      process.exitCode = 5;
      console.error(`\n❌ ${x.po}: ${e.message}\n   Khong tao lenh pickup nao — sua roi chay lai duoc.\n`);
    }
  }

  // --- 4. nhóm AACT: cần trình duyệt + đăng nhập ---------------------------
  const dsAact = lam.filter(v => v.laAact);
  if (dsAact.length) xong += await lamAACT(dsAact, np);

  log('---');
  log(`xong ${xong}/${lam.length}` + (cho.length ? ` | ${cho.length} don cho nguoi xem` : ''));
}

/**
 * Nhánh AACT. Mở trình duyệt MỘT lần cho cả lô — đăng nhập lại từng đơn thì chậm
 * và dễ bị coi là bot.
 *
 * ⛔ Thứ tự trong mỗi đơn KHÔNG ĐƯỢC ĐẢO:
 *      taoBOL(finalize) -> GHI NGAY BOL#/PRO# ra đĩa -> tải file -> Drive -> sheet
 *    Finalize không hoàn tác được, mọi bước sau đều làm lại được. Ghi số ra đĩa
 *    TRƯỚC khi làm bất cứ việc gì khác, vì trang /workspace/bol/<id> chết sau khi
 *    rời đi (lỗi #16) — mất số là mất luôn, và lần chạy sau sẽ tạo BOL thứ hai.
 */
async function lamAACT(ds, np) {
  const { chromium } = await import('playwright');
  let xong = 0;
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  try {
    const dn = await AACT.dangNhap(page);
    if (!dn.ok) {
      process.exitCode = 6;
      console.error(`\n❌ Khong dang nhap duoc AACT: ${dn.noiDen}\n   Bo qua ${ds.length} don AACT, KHONG tao BOL nao.\n`);
      return 0;
    }
    log(`AACT: dang nhap OK, ${ds.length} don`);

    for (const x of ds) {
      try {
        // Đã tạo BOL ở lần chạy trước mà chưa xong các bước sau -> DÙNG LẠI, đừng tạo nữa
        let da = await docDaTaoBOL(x.po);
        if (da) {
          log(`${x.po}: da co BOL# ${da.bolNumber} tu ${da.luc} — KHONG tao lai`);
        } else {
          const r = await AACT.taoBOL(page, {
            po: x.po, customerOrder: x.d.customerOrder, consignee: x.d.shipTo,
            // Form AACT chỉ có MỘT ô Description cho COMMODITY #1 -> gộp các mã lại
            tinh: x.tinh, moTa: x.d.items.map(i => i.moTa).join(' + ')
          }, { finalize: true });

          if (r.daTao && (!r.bolNumber || !r.pro)) {
            process.exitCode = 7;
            console.error(`\n⛔ ${x.po}: DA FINALIZE nhung khong doc duoc BOL#/PRO#.\n` +
                          `   BOL DA TON TAI tren AACT. Vao aaacooper.com lay so BANG TAY roi\n` +
                          `   tao ${fileAact(x.po)} voi {"bolNumber":"...","pro":"..."} truoc khi chay lai,\n` +
                          `   neu khong lan sau se tao BOL THU HAI.\n`);
            continue;
          }
          if (!r.ok) throw new Error(r.ly_do || 'taoBOL that bai');

          // GHI NGAY, trước mọi bước khác
          da = { bolNumber: r.bolNumber, pro: r.pro, luc: new Date().toISOString() };
          await fs.writeFile(fileAact(x.po), JSON.stringify(da, null, 1));
          log(`${x.po}: ✅ BOL# ${da.bolNumber} | PRO# ${da.pro} (da ghi ra dia)`);
        }

        // Từ đây trở đi mọi thứ đều làm lại được
        const fBol = await AACT.taiTuViewer(page, AACT.urlBolPdf(da.bolNumber));
        if (!fBol.ok) throw new Error('tai BOL: ' + fBol.ly_do);
        const fLbl = await AACT.taiShippingLabel(page, da.bolNumber);
        if (!fLbl.ok) throw new Error('tai ShippingLabel: ' + fLbl.ly_do);
        await fs.writeFile(path.join(BOLDIR, `${x.po}_BOL.pdf`), fBol.buf);
        await fs.writeFile(path.join(BOLDIR, `${x.po}_ShippingLabel.pdf`), fLbl.buf);

        const mk = await W.layFolder(x.po, np.mmddyyyy, false, log);
        await W.uploadFile(mk.folderId, `${x.po}_BOL.pdf`, fBol.buf);
        await W.uploadFile(mk.folderId, `${x.po}_ShippingLabel.pdf`, fLbl.buf);
        const slip = await fs.readFile(path.join(SLIPDIR, `${x.po}_PackingSlip.pdf`));
        await W.uploadFile(mk.folderId, `${x.po}_PackingSlip.pdf`, slip);

        // Cũng tôn trọng `--sheet b2b` như hai nhánh kia. Nhánh AACT hiện KHÔNG chạy
        // (`NGUNG_CHON_CARRIER_B2B = true`), nhưng để nguyên thì bật lại là lỗi tái diễn.
        const dichAact = LA_B2B ? W.SHEET.B2B : W.SHEET.ORDER;
        const fr = await W.fillRow({
          ...(dichAact.gid ? { sheetGid: dichAact.gid, headerRows: dichAact.headerRows } : {}),
          po: x.po, carrier: 'AACT', customerOrder: x.d.customerOrder,
          shipTo: x.d.shipTo.ten, sku: ghepCot(x.d.items, i => i.model),
          productName: ghepCot(x.d.items, i => i.moTa),
          qty: ghepCot(x.d.items, i => i.qty),
          ...(NGUNG_DIEN_K_CHO_MISC ? {} : { pickupSchedule: mk.pickupSchedule }),
          skipCap: true, linkDrive: mk.url,
          pro: da.pro          // AACT la carrier DUY NHAT gui pro ngay
        });
        log(`${x.po}: ✅ hang ${fr.row} | pickup ${fr.pickupSchedule || '(KHONG dien — don Misc)'} | folder ${mk.dayFolder} | 3 file | PRO ${da.pro}`);
        xong++;
      } catch (e) {
        process.exitCode = 5;
        console.error(`\n❌ ${x.po}: ${e.message}\n` +
                      `   Neu BOL da tao thi so nam o ${fileAact(x.po)} — chay lai se DUNG LAI so do,\n` +
                      `   khong tao BOL thu hai.\n`);
      }
    }
  } finally { await ctx.close(); await b.close(); }
  return xong;
}

main().catch(e => { console.error('\n❌ ' + e.stack + '\n'); process.exit(1); });
