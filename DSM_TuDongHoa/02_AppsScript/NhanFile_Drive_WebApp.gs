/**
 * ============================================================
 *  WEB APP — nhận file vào Drive + thao tác Sheet "Order List"
 * ------------------------------------------------------------
 *  POST (JSON body). Các chế độ:
 *
 *  A) HTML -> PDF  : { folderId, filename, html }
 *  B) base64 file  : { folderId, filename, base64, mimeType }
 *       (folderId = folder <PO> con, tạo bằng makeFolder trước)
 *
 *  C) TẠO FOLDER <PO> : { action:'makeFolder', po }
 *       -> tạo (hoặc lấy) folder tên = PO trong PARENT, set "Anyone with link - Viewer",
 *          trả { folderId, url }.
 *
 *  D) ĐIỀN HÀNG SHEET : { action:'fillRow', po, carrier, customerOrder, shipTo, sku, productName, qty,
 *                         pickupSchedule, pro, pickupNum, linkDrive }
 *       -> TÌM số PO ở cột B (data từ hàng 7); điền:
 *          C=carrier · E=customerOrder · F=shipTo · G=sku · H=productName · I=qty · J='X'
 *          K=pickupSchedule · N=pro(nếu có) · O=pickupNum(nếu có) · P=linkDrive
 *          KHÔNG thấy PO -> thêm HÀNG MỚI (ghi B=po).
 *          KHÔNG đụng: A(Order Date), D(PIC), L(Rithum Confirm), M(WH Notif), Q(Note).
 * ============================================================
 */

// 📁 Folder gốc "THD Orders" — đổi 01/08/2026.
//    Cũ: 1ER7RWu-66baF1uvB4AuBByN7OS-FJdAI (phẳng, mỗi PO một folder ngay dưới gốc).
//    Mới: THD Orders / <DD Mon YYYY> / PO - <số PO> / SIGNED PRO#
var PARENT_FOLDER_ID = '1hsWarcdjtK63CD8As9CtXqJTcUPg8oAw';   // "THD Orders"

// _INBOX — nơi run.mjs để file PDF gộp thô <fid>.pdf VÀ file <fid>_manifest.json đi kèm.
// Manifest là bằng chứng "PO này đã lấy slip rồi" ở thời điểm SỚM NHẤT có thể (ngay sau khi
// tải), nên dedup không còn phụ thuộc bước tách file làm tay. Xem _poDaLaySlip_().
var INBOX_FOLDER_ID = '18rFktqm_K_a9-RPW5S0o2fTkmmHITGKO';
var MANIFEST_SUFFIX = '_manifest.json';

// ⚙️ TRẦN SỐ ĐƠN MỖI NGÀY PICKUP
//    Cột K đã có đủ MAX_PER_DAY hàng cho một ngày -> đơn tiếp theo dời sang ngày làm việc kế.
//    Đếm MỌI hàng có ngày đó ở cột K (kể cả Ground, đơn người khác điền, đơn đã gửi mail).
//    31/07/2026: đặt 15.
//    01/08/2026: người dùng nâng lên 20.
var MAX_PER_DAY = 20;

var SHEET_CFG = {
  SHEET_ID: '1Fzwr2GDHOHxMgqPNf-Ksf6qJ5IIl3mNzrOQrHqH57fo',
  SHEET_NAME: 'Order List',
  HEADER_ROWS: 6,          // dữ liệu bắt đầu ở hàng 7
  COL_ORDERDATE: 1,  // A
  COL_PO: 2,         // B
  COL_CARRIER: 3,    // C
  COL_PIC: 4,        // D (người dùng tự điền)
  COL_CUSTORDER: 5,  // E
  COL_SHIPTO: 6,     // F
  COL_SKU: 7,        // G
  COL_PRODUCT: 8,    // H  Product name
  COL_QTY: 9,        // I  Quantity
  COL_BOLLABEL: 10,  // J  BOL/SHIPPING LABEL (X)
  COL_PICKUP: 11,    // K  PICK UP SCHEDULE
  COL_RITHUM: 12,    // L  (người dùng tự điền)
  COL_WHNOTIF: 13,   // M  WAREHOUSE NOTIFICATION (GuiMail ghi X)
  COL_PRO: 14,       // N  PRO # / SHIPPING #
  COL_PICKUPNUM: 15, // O  PICKUP #
  COL_LINKDRIVE: 16, // P  Link Drive
  COL_NOTE: 17       // Q  (người dùng tự điền)
};

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.action === 'makeFolder') return _makeFolder(body);
    if (body.action === 'fillRow')    return _fillRow(body);
    if (body.action === 'lookup')     return _lookup(body);
    if (body.action === 'needSlip')   return _needSlip(body);
    if (body.action === 'donDepManifest') return _donDepManifest(body);

    // ---- chế độ nhận file ----
    if (!body.folderId || !body.filename) throw new Error('Thiếu folderId/filename');
    var folder = DriveApp.getFolderById(body.folderId);
    var dup = folder.getFilesByName(body.filename);
    while (dup.hasNext()) dup.next().setTrashed(true);

    var blob;
    if (body.html) {
      blob = Utilities.newBlob(body.html, 'text/html', body.filename).getAs('application/pdf');
      blob.setName(body.filename);
    } else if (body.base64) {
      var bytes = Utilities.base64Decode(body.base64);
      blob = Utilities.newBlob(bytes, body.mimeType || 'application/pdf', body.filename);
    } else {
      throw new Error('Thiếu html hoặc base64');
    }
    var file = folder.createFile(blob);
    return _json({ ok: true, id: file.getId(), name: file.getName() });
  } catch (err) {
    return _json({ ok: false, error: err.message });
  }
}

/* C) Tạo/lấy cây folder — CẤU TRÚC MỚI 01/08/2026
 * ------------------------------------------------------------
 *   THD Orders /  <DD Mon YYYY>  /  PO - <số PO>  /  SIGNED PRO#
 *                 ^ theo PICK UP SCHEDULE           ^ folder rỗng, kho bỏ BOL đã ký vào đây
 *
 *  { action:'makeFolder', po, pickupSchedule }
 *   -> tự áp TRẦN MAX_PER_DAY để chốt ngày TRƯỚC khi tạo folder,
 *      trả về ngày cuối cùng để fillRow dùng lại (gọi kèm skipCap:true).
 */
var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Date -> '04 Aug 2026' */
function _dateFolderName(d) {
  return ('0' + d.getDate()).slice(-2) + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

/** Lấy folder con theo tên (bỏ qua dấu cách thừa), không có thì tạo. */
function _childFolder(parent, name) {
  var target = String(name).trim();
  var it = parent.getFolders();
  while (it.hasNext()) {
    var f = it.next();
    if (f.getName().trim() === target) return f;      // khớp cả khi tên có dấu cách thừa
  }
  return parent.createFolder(target);
}

function _makeFolder(body) {
  var po = String(body.po || '').trim();
  if (!po) throw new Error('makeFolder: thiếu po');

  var sh = SpreadsheetApp.openById(SHEET_CFG.SHEET_ID).getSheetByName(SHEET_CFG.SHEET_NAME);
  var wanted = String(body.pickupSchedule || '').trim();
  if (!wanted) throw new Error('makeFolder: thiếu pickupSchedule (cần để đặt tên folder ngày)');
  var pk = _resolvePickupDate(sh, wanted, 0);          // áp trần MAX_PER_DAY ngay tại đây
  var d = _keyToDate(_dayKey(pk.date));

  var root = DriveApp.getFolderById(PARENT_FOLDER_ID);
  var dayF = _childFolder(root, _dateFolderName(d));
  var poF  = _childFolder(dayF, 'PO - ' + po);
  var sgF  = _childFolder(poF, 'SIGNED PRO#');
  try { poF.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}

  return _json({
    ok: true,
    folderId: poF.getId(), url: poF.getUrl(),
    signedProFolderId: sgF.getId(),
    dayFolder: _dateFolderName(d), dayFolderId: dayF.getId(),
    pickupSchedule: pk.date,                 // NGÀY CHỐT — truyền lại cho fillRow
    pickupRequested: wanted, pickupMoved: pk.moved
  });
}

// D) Tìm PO ở cột B rồi điền; không thấy -> thêm hàng mới
function _fillRow(body) {
  var po = String(body.po || '').trim();
  var carrier = String(body.carrier || '').trim().toUpperCase();
  if (!po) throw new Error('fillRow: thiếu po');

  var ss = SpreadsheetApp.openById(body.sheetId || SHEET_CFG.SHEET_ID);
  var sh = ss.getSheetByName(body.sheetName || SHEET_CFG.SHEET_NAME);
  if (!sh) throw new Error('Không thấy sheet "' + (body.sheetName || SHEET_CFG.SHEET_NAME) + '"');

  var lock = LockService.getScriptLock(); lock.tryLock(15000);
  try {
    var start = SHEET_CFG.HEADER_ROWS + 1;
    var last = sh.getLastRow();
    var found = 0;
    if (last >= start) {
      var col = sh.getRange(start, SHEET_CFG.COL_PO, last - SHEET_CFG.HEADER_ROWS, 1).getValues();
      var key = _poKey(po);
      for (var i = 0; i < col.length; i++) {
        var cell = String(col[i][0]).trim();
        // so cả dạng thô và dạng đệm 0 -> vẫn tìm được hàng dù ô cũ đã bị mất số 0 đầu
        if (cell === po || _poKey(cell) === key) { found = start + i; break; }
      }
    }
    var row = found || (last < start ? start : last + 1);
    if (!found) {
      // ⚠️ định dạng TEXT trước khi ghi, nếu không "08576180" sẽ thành số 8576180
      sh.getRange(row, SHEET_CFG.COL_PO).setNumberFormat('@').setValue(po);
    }

    function set(c, v) { if (v != null && String(v).trim() !== '') sh.getRange(row, c).setValue(v); }
    if (carrier) sh.getRange(row, SHEET_CFG.COL_CARRIER).setValue(carrier);   // C
    set(SHEET_CFG.COL_CUSTORDER, body.customerOrder);                        // E
    set(SHEET_CFG.COL_SHIPTO, body.shipTo);                                  // F
    set(SHEET_CFG.COL_SKU, body.sku);                                        // G (nguyên Model Number)
    set(SHEET_CFG.COL_PRODUCT, body.productName);                            // H (Item Description)
    set(SHEET_CFG.COL_QTY, body.qty);                                        // I
    sh.getRange(row, SHEET_CFG.COL_BOLLABEL).setValue('X');                  // J mặc định X

    // K — áp TRẦN 15 ĐƠN/NGÀY: dời sang ngày làm việc kế nếu ngày mong muốn đã đầy
    var pk = null;
    if (body.pickupSchedule != null && String(body.pickupSchedule).trim() !== '') {
      var wantK = String(body.pickupSchedule).trim();
      // skipCap = true  -> GHI ĐÚNG ngày truyền vào, không áp trần nữa.
      //   Dùng khi ngày đã được chốt ở nơi khác (makeFolder đã đặt tên folder theo ngày đó,
      //   hoặc lịch pickup đã cam kết với carrier như CTII) — tránh sheet lệch với thực tế.
      pk = body.skipCap ? { date: wantK, moved: false }
                        : _resolvePickupDate(sh, wantK, row);
      sh.getRange(row, SHEET_CFG.COL_PICKUP).setNumberFormat('@').setValue(pk.date);
    }
    set(SHEET_CFG.COL_PRO, body.pro);                                        // N (AACT gửi kèm)
    set(SHEET_CFG.COL_PICKUPNUM, body.pickupNum);                            // O (CTII)
    set(SHEET_CFG.COL_LINKDRIVE, body.linkDrive);                            // P
    SpreadsheetApp.flush();
    return _json({
      ok: true, row: row, added: !found, po: po, carrier: carrier,
      pickupSchedule: pk ? pk.date : null,          // ngày THỰC SỰ đã ghi vào cột K
      pickupRequested: body.pickupSchedule || null, // ngày bên gọi đề nghị
      pickupMoved: pk ? pk.moved : false            // true = đã bị dời vì ngày kia đủ 15
    });
  } finally { lock.releaseLock(); }
}

// CHẠY 1 LẦN (bằng info@) để cấp quyền Drive + Spreadsheets. Chọn hàm này -> Run -> Allow.
/* ============================================================
 *  TRẦN 15 ĐƠN / NGÀY PICKUP  (thêm 31/07/2026)
 * ------------------------------------------------------------
 *  Quy tắc người dùng chốt:
 *   - Ngày pickup gốc do bên gọi truyền vào (hôm nay + Thứ Sáu +3 / Thứ Bảy +2 / còn lại +1).
 *   - Nếu ngày đó đã có >= MAX_PER_DAY hàng ở cột K -> dời sang ngày kế, LẶP cho tới khi còn chỗ.
 *   - BỎ QUA Thứ Bảy & Chủ Nhật khi dời.
 *   - Đếm theo SỐ HÀNG (mỗi PO tính 1), không theo Quantity.
 *   - Đếm MỌI hàng có ngày đó, không lọc carrier/trạng thái.
 * ============================================================ */

/** Chuẩn hoá 1 ô cột K về khoá 'yyyy-mm-dd'. Trả '' nếu không phải ngày. */
function _dayKey(v) {
  if (v instanceof Date && !isNaN(v)) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v == null ? '' : v).trim();
  if (!s) return '';
  // chấp nhận m/d/yyyy, mm/dd/yyyy, m/d/yy — bỏ qua text rác kèm theo
  var m = s.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})/);
  if (!m) return '';
  var mo = parseInt(m[1], 10), da = parseInt(m[2], 10), yr = parseInt(m[3], 10);
  if (yr < 100) yr += 2000;
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return '';
  return yr + '-' + ('0' + mo).slice(-2) + '-' + ('0' + da).slice(-2);
}

function _keyToDate(k) {
  var p = k.split('-');
  return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
}

function _fmtMDY(d) {
  return ('0' + (d.getMonth() + 1)).slice(-2) + '/' + ('0' + d.getDate()).slice(-2) + '/' + d.getFullYear();
}

/** Ngày làm việc kế tiếp (bỏ Thứ Bảy = 6, Chủ Nhật = 0). */
function _nextWorkday(d) {
  var n = new Date(d.getTime());
  do { n.setDate(n.getDate() + 1); } while (n.getDay() === 0 || n.getDay() === 6);
  return n;
}

/**
 * Dời ngày pickup tới ngày làm việc đầu tiên còn dưới MAX_PER_DAY hàng.
 * @param sh        sheet
 * @param wanted    chuỗi ngày mong muốn (mm/dd/yyyy)
 * @param selfRow   hàng đang ghi — KHÔNG tự đếm chính nó (0 nếu là hàng mới)
 * @return { date: 'mm/dd/yyyy', moved: bool, counts: {...}, tried: n }
 */
function _resolvePickupDate(sh, wanted, selfRow) {
  var key0 = _dayKey(wanted);
  if (!key0) return { date: wanted, moved: false, counts: {}, tried: 0 };  // không parse được -> giữ nguyên

  var start = SHEET_CFG.HEADER_ROWS + 1;
  var last = sh.getLastRow();
  var counts = {};
  if (last >= start) {
    var vals = sh.getRange(start, SHEET_CFG.COL_PICKUP, last - SHEET_CFG.HEADER_ROWS, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (start + i === selfRow) continue;           // bỏ chính hàng đang ghi
      var k = _dayKey(vals[i][0]);
      if (k) counts[k] = (counts[k] || 0) + 1;
    }
  }

  var d = _keyToDate(key0), tried = 0;
  // nếu ngày gốc rơi vào cuối tuần thì đẩy sang thứ Hai trước đã
  while (d.getDay() === 0 || d.getDay() === 6) d = _nextWorkday(d);
  while ((counts[Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd')] || 0) >= MAX_PER_DAY) {
    d = _nextWorkday(d);
    if (++tried > 60) break;                          // chặn vòng lặp vô hạn
  }
  var out = _fmtMDY(d);
  return { date: out, moved: out !== String(wanted).trim(), counts: counts, tried: tried };
}

/* ============================================================
 *  E) TRA HÀNG THEO PO  { action:'lookup', pos:['12345678', ...] }
 * ------------------------------------------------------------
 *  Trả về trạng thái từng PO để bên gọi biết đơn nào đã có người làm.
 *  Sinh ra vì `read_file_content` của Drive connector bị cắt bớt,
 *  không bao giờ đọc tới tab "Order List" (sheet quá lớn).
 *  Kèm luôn tải pickup từng ngày để khỏi phải đọc sheet lần nữa.
 * ============================================================ */
function _lookup(body) {
  var sh = SpreadsheetApp.openById(SHEET_CFG.SHEET_ID).getSheetByName(SHEET_CFG.SHEET_NAME);
  if (!sh) throw new Error('Không thấy sheet "' + SHEET_CFG.SHEET_NAME + '"');
  var want = {};
  (body.pos || []).forEach(function (p) { want[_poKey(String(p).trim())] = String(p).trim(); });

  var start = SHEET_CFG.HEADER_ROWS + 1;
  var last = sh.getLastRow();
  var res = {}, load = {};
  if (last >= start) {
    var vals = sh.getRange(start, 1, last - SHEET_CFG.HEADER_ROWS, SHEET_CFG.COL_NOTE).getValues();
    for (var i = 0; i < vals.length; i++) {
      var row = vals[i];
      var k = _dayKey(row[SHEET_CFG.COL_PICKUP - 1]);
      if (k) load[k] = (load[k] || 0) + 1;
      var poCell = String(row[SHEET_CFG.COL_PO - 1]).trim();
      var key = _poKey(poCell);
      if (want[key] !== undefined) {
        res[want[key]] = {
          row: start + i,
          carrier: String(row[SHEET_CFG.COL_CARRIER - 1] || '').trim(),   // C
          pic:     String(row[SHEET_CFG.COL_PIC - 1] || '').trim(),       // D  <-- quan trọng
          bolLbl:  String(row[SHEET_CFG.COL_BOLLABEL - 1] || '').trim(),  // J
          pickup:  String(row[SHEET_CFG.COL_PICKUP - 1] || '').trim(),    // K
          whNotif: String(row[SHEET_CFG.COL_WHNOTIF - 1] || '').trim(),   // M
          pro:     String(row[SHEET_CFG.COL_PRO - 1] || '').trim(),       // N
          link:    String(row[SHEET_CFG.COL_LINKDRIVE - 1] || '').trim()  // P
        };
      }
    }
  }
  (body.pos || []).forEach(function (p) { if (!res[String(p).trim()]) res[String(p).trim()] = null; });
  return _json({ ok: true, maxPerDay: MAX_PER_DAY, rows: res, pickupLoad: load });
}

/** Chẩn đoán: xem hiện mỗi ngày pickup đang có bao nhiêu hàng. */
function DIAG_pickupLoad() {
  var sh = SpreadsheetApp.openById(SHEET_CFG.SHEET_ID).getSheetByName(SHEET_CFG.SHEET_NAME);
  if (!sh) { Logger.log('❌ Không thấy sheet'); return; }
  var r = _resolvePickupDate(sh, _fmtMDY(new Date()), 0);
  var keys = Object.keys(r.counts).sort();
  Logger.log('TRẦN MỖI NGÀY = ' + MAX_PER_DAY);
  for (var i = 0; i < keys.length; i++) {
    Logger.log(keys[i] + '  ' + r.counts[keys[i]] + ' hàng' +
               (r.counts[keys[i]] >= MAX_PER_DAY ? '   ⛔ ĐÃ ĐẦY' : ''));
  }
}

function authorizeScopes() {
  DriveApp.getFolderById(PARENT_FOLDER_ID).getName();
  var ss = SpreadsheetApp.openById(SHEET_CFG.SHEET_ID);
  var sh = ss.getSheetByName(SHEET_CFG.SHEET_NAME);
  Logger.log('Drive OK. Sheet "' + SHEET_CFG.SHEET_NAME + '": ' + (sh ? 'OK' : 'KHÔNG THẤY!'));
}

/* ============================================================================
 *  F) needSlip — LIỆT KÊ PO CẦN LẤY PACKING SLIP
 * ----------------------------------------------------------------------------
 *  Điều kiện: cột B có PO 8 chữ số, **cột C (Carrier) TRỐNG và cột D (PIC) TRỐNG**.
 *  KHÔNG lọc Ground — đơn Ground cũng lấy (người dùng chốt 05/08/2026).
 *
 *  Gọi được BẰNG CẢ HAI CÁCH — quan trọng cho bản chạy tự động trên VM:
 *    POST  { action:'needSlip' }
 *    GET   <webapp>/exec?action=needSlip
 *  Nhờ có GET, script trên VM (hoặc bất cứ HTTP client nào) lấy được danh sách PO
 *  mà KHÔNG cần đăng nhập Google — web app chạy dưới quyền info@.
 *
 *  Tuỳ chọn dedup (mặc định TẮT vì đang giai đoạn test):
 *    &checkSlip=1   -> bỏ PO đã lấy slip. Kiểm THEO HAI NGUỒN, thứ tự rẻ trước:
 *                      1. <fid>_manifest.json trong _INBOX  (run.mjs ghi NGAY sau khi tải)
 *                      2. <PO>_PackingSlip.pdf trong folder "PO - <po>"  (sau khi tách tay)
 *                      Nguồn 1 bịt khoảng mù giữa "đã tải" và "đã tách" — xem _poDaLaySlip_().
 *                      Nguồn 2 chậm: mỗi PO một lần tìm file.
 *
 *  Trả: { ok:true, count, pos:[...], skipped:[{po, ly_do}], checkedSlip }
 *  ⚠️ Bên gọi kiểm **o.pos**, KHÔNG kiểm o.ok — xem bẫy "Receiver alive".
 * ==========================================================================*/
function _needSlip(body) {
  var checkSlip = !!(body && (body.checkSlip === true || body.checkSlip === '1' || body.checkSlip === 1));

  var sh = SpreadsheetApp.openById(SHEET_CFG.SHEET_ID).getSheetByName(SHEET_CFG.SHEET_NAME);
  if (!sh) throw new Error('Không thấy sheet "' + SHEET_CFG.SHEET_NAME + '"');

  var start = SHEET_CFG.HEADER_ROWS + 1;
  var last = sh.getLastRow();
  var pos = [], skipped = [];
  if (last >= start) {
    var vals = sh.getRange(start, 1, last - SHEET_CFG.HEADER_ROWS, SHEET_CFG.COL_PIC).getValues();
    for (var i = 0; i < vals.length; i++) {
      var po = String(vals[i][SHEET_CFG.COL_PO - 1]).trim();
      if (!/^\d{8}$/.test(_poKey(po))) continue;            // đệm 0 rồi mới kiểm 8 chữ số
      po = _poKey(po);
      var carrier = String(vals[i][SHEET_CFG.COL_CARRIER - 1] || '').trim();
      var pic     = String(vals[i][SHEET_CFG.COL_PIC - 1] || '').trim();
      if (carrier !== '') { continue; }                     // đã có carrier -> đang/đã xử lý
      if (pic !== '')     { skipped.push({ po: po, ly_do: 'cot D co PIC: ' + pic }); continue; }
      pos.push(po);
    }
  }

  if (checkSlip && pos.length) {
    var daLay = _poDaLaySlip_();          // đọc manifest MỘT lần cho cả lô
    var con = [];
    for (var k = 0; k < pos.length; k++) {
      if (daLay[pos[k]]) {
        skipped.push({ po: pos[k], ly_do: 'da co trong manifest ' + daLay[pos[k]] });
      } else if (_coFilePackingSlip_(pos[k])) {
        skipped.push({ po: pos[k], ly_do: 'da co <PO>_PackingSlip.pdf (trong _INBOX hoac folder PO - <po>)' });
      } else {
        con.push(pos[k]);
      }
    }
    pos = con;
  }

  return _json({ ok: true, count: pos.length, pos: pos, skipped: skipped, checkedSlip: checkSlip });
}

/**
 * Đọc mọi <fid>_manifest.json trong _INBOX -> { po: '<fid>' }.
 *
 * VÌ SAO CẦN: dedup cũ chỉ tra '<PO>_PackingSlip.pdf' — file đó chỉ ra đời SAU bước tách
 * file làm tay. Khoảng giữa "đã tải file gộp" và "đã tách xong" là mù hoàn toàn: chạy lại
 * trong khoảng đó sẽ submit reprint lần nữa, mà Submit KHÔNG HOÀN TÁC ĐƯỢC.
 * Manifest do run.mjs ghi ngay sau khi tải, nên bịt đúng khoảng mù đó.
 *
 * Manifest hỏng thì BỎ QUA file đó, không ném lỗi: thà dedup sót (submit trùng — phiền)
 * còn hơn _needSlip chết hẳn (cả lô đứng).
 */
function _poDaLaySlip_() {
  var out = {};
  try {
    var it = DriveApp.getFolderById(INBOX_FOLDER_ID).getFiles();
    while (it.hasNext()) {
      var f = it.next();
      if (f.isTrashed()) continue;
      var ten = f.getName();
      if (ten.indexOf(MANIFEST_SUFFIX) !== ten.length - MANIFEST_SUFFIX.length) continue;
      try {
        var m = JSON.parse(f.getBlob().getDataAsString());
        var ds = (m && m.pos) || [];
        for (var i = 0; i < ds.length; i++) {
          var po = _poKey(String(ds[i]).trim());
          if (/^\d{8}$/.test(po)) out[po] = m.fid || ten;
        }
      } catch (e) { /* manifest hỏng -> bỏ qua đúng file này */ }
    }
  } catch (e) { /* không mở được _INBOX -> coi như chưa có manifest nào */ }
  return out;
}

/**
 * Có '<PO>_PackingSlip.pdf' ở một trong HAI vị trí hợp lệ không?
 *
 *   a) `_INBOX`            — run.mjs tự tách file gộp rồi đẩy vào đây (bước 7)
 *   b) folder `PO - <po>`  — sau khi đã dọn vào cây THD Orders ở bước ④
 *
 * Cả hai đều là vị trí CHÍNH XÁC, không phải "bất kỳ đâu trong Drive".
 * `getFilesByName` quét toàn bộ Drive của info@, nên nếu nhận bừa thì một file trùng tên
 * nằm lạc (bản nháp, thư mục cá nhân) sẽ làm dedup tưởng đã có slip -> BỎ SÓT ĐƠN THẬT.
 *
 * Cũng bỏ file trong Thùng rác: getFilesByName TRẢ CẢ FILE ĐÃ XOÁ, nhận vào thì PO từng
 * xoá file sẽ bị coi là "đã có" -> cũng bỏ sót đơn.
 *
 * ⚠️ Hàm này là điều kiện dùng CHUNG cho dedup (_needSlip) và cho việc xoá manifest
 *    (_donDepManifest). Sửa nó là sửa cả hai — đó là chủ ý, đừng tách ra làm hai bản.
 */
function _coFilePackingSlip_(po) {
  var it = DriveApp.getFilesByName(po + '_PackingSlip.pdf');
  while (it.hasNext()) {
    var f = it.next();
    if (f.isTrashed()) continue;
    var ps = f.getParents();
    while (ps.hasNext()) {
      var cha = ps.next();
      if (cha.getId() === INBOX_FOLDER_ID) return true;             // (a)
      // .trim(): thực tế có folder "PO - 02562579 " dính dấu cách thừa.
      // _poKey: folder cũ có thể mất số 0 đầu ("PO - 2562579") — vẫn phải khớp.
      var m = cha.getName().trim().match(/^PO\s*-\s*(\d+)$/);        // (b)
      if (m && _poKey(m[1]) === po) return true;
    }
  }
  return false;
}

/* ============================================================================
 *  G) donDepManifest — XOÁ MANIFEST ĐÃ HẾT VIỆC
 * ----------------------------------------------------------------------------
 *  Manifest chỉ là dấu TẠM, lấp khoảng trống từ lúc tải file gộp tới lúc tách
 *  xong thành <PO>_PackingSlip.pdf. Tách xong rồi thì nó là rác.
 *
 *  🔴 ĐIỀU KIỆN XOÁ PHẢI TRÙNG KHÍT VỚI ĐIỀU KIỆN DEDUP — nếu không sẽ hở:
 *     xoá manifest theo luật lỏng (có file ở bất kỳ đâu trong Drive) trong khi
 *     dedup đòi luật chặt (file phải nằm trong folder 'PO - <po>') thì PO rơi
 *     khỏi cả hai nguồn -> lần chạy sau SUBMIT TRÙNG.
 *     Vì vậy ở đây gọi thẳng _coFilePackingSlip_() — đúng hàm dedup đang dùng.
 *     Đừng viết lại logic tương đương, hai bên sẽ lệch nhau khi có người sửa.
 *
 *  Chỉ xoá khi MỌI PO trong manifest đều đã có file. Thiếu một PO -> giữ nguyên.
 *
 *    GET  <webapp>/exec?action=donDepManifest            -> CHỈ ĐẾM, không xoá
 *    GET  <webapp>/exec?action=donDepManifest&thatSu=1   -> xoá thật
 *
 *  Xoá = setTrashed(true) (vào Thùng rác, khôi phục được 30 ngày), KHÔNG xoá vĩnh viễn.
 * ==========================================================================*/
function _donDepManifest(body) {
  var thatSu = !!(body && (body.thatSu === true || body.thatSu === '1' || body.thatSu === 1));
  var xoa = [], giu = [], loi = [];

  var it = DriveApp.getFolderById(INBOX_FOLDER_ID).getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.isTrashed()) continue;
    var ten = f.getName();
    if (ten.indexOf(MANIFEST_SUFFIX) !== ten.length - MANIFEST_SUFFIX.length) continue;

    var ds;
    try {
      var m = JSON.parse(f.getBlob().getDataAsString());
      ds = (m && m.pos) || [];
    } catch (e) {
      // Manifest hỏng: _poDaLaySlip_ cũng bỏ qua nó, tức nó KHÔNG bảo vệ PO nào.
      // Nhưng vẫn không tự xoá — để người xem, vì nó là dấu hiệu run.mjs ghi lỗi.
      loi.push({ ten: ten, ly_do: 'JSON hong' });
      continue;
    }

    var chuaCo = [];
    for (var i = 0; i < ds.length; i++) {
      var po = _poKey(String(ds[i]).trim());
      if (!/^\d{8}$/.test(po)) continue;
      if (!_coFilePackingSlip_(po)) chuaCo.push(po);
    }

    if (chuaCo.length) {
      giu.push({ ten: ten, con_thieu: chuaCo });
    } else {
      xoa.push({ ten: ten, so_po: ds.length });
      if (thatSu) f.setTrashed(true);
    }
  }

  return _json({
    ok: true, thatSu: thatSu,
    daXoa: thatSu ? xoa.length : 0, seXoa: thatSu ? 0 : xoa.length,
    xoa: xoa, giu: giu, loi: loi
  });
}

/* GET: mặc định trả "alive"; có ?action= thì phục vụ luôn (dùng cho VM/HTTP client). */
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.action === 'needSlip') return _needSlip(p);
    if (p.action === 'donDepManifest') return _donDepManifest(p);
    if (p.action === 'lookup' && p.pos) {
      return _lookup({ pos: String(p.pos).split(',').map(function (x) { return x.trim(); }) });
    }
    return _json({ ok: true, msg: 'Receiver alive' });
  } catch (err) {
    return _json({ ok: false, error: err.message });
  }
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
