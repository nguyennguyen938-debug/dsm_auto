/**
 * ============================================================
 *  TỰ ĐỘNG TRA MÃ PRO theo CARRIER  (Google Apps Script)
 *  (Gộp XGSI + BXID. Thay cho TraPRO_XGSI.gs — dùng file này, bỏ file cũ.)
 * ------------------------------------------------------------
 *  Với hàng có Carrier hỗ trợ (XGSI, BXID) & cột PRO (D) chưa có số:
 *    tra theo số PO -> lấy mã PRO -> ghi vào cột PRO.
 *
 *  Nguồn tra theo carrier:
 *   • XGSI: JSON API (CORS *)
 *       GET https://api.xgsi.com/shipments/track?type=bol&trackNumber=<PO>
 *       -> data[0].PROBILL
 *       (type=bol vì ta đặt Shipper BOL# = PO. type=po SẼ 404 — xem chú thích PRO_SOURCES.)
 *   • BXID (Braun's Express): trang HTML server-render (parse text)
 *       GET https://www.braunsexpress.com/customer-tools/shipment-tracking/?tracking_number=<PO>
 *       -> lấy số sau "Pro No:" (Braun's Pro No). Tra được vì ta đặt Shipper BOL# = PO.
 *   • AACT: KHÔNG tra ở đây (PRO có ngay khi tạo BOL trên web).
 *
 *  Sheet: A=PO | B=Carrier | C=Status | D=PRO  (thêm tiêu đề "PRO" ở D1)
 *  Chưa có PRO (chưa tender / chưa manifest) -> ghi "WAIT", lần sau tự thử lại.
 *
 *  LƯU Ý: file này KHÔNG có onOpen (tránh trùng với GuiMail_BOL.gs).
 *  Chạy tay hàm fillPro, hoặc bật tự động bằng installProTrigger.
 * ============================================================
 */

var PRO_CFG = {
  SHEET_ID: '1Fzwr2GDHOHxMgqPNf-Ksf6qJ5IIl3mNzrOQrHqH57fo',   // sheet "Lowes, THD - Xuan Follow"
  SHEET_NAME: 'Order List',
  HEADER_ROWS: 6,   // dữ liệu từ hàng 7
  COL_PO: 2,        // B
  COL_CARRIER: 3,   // C
  COL_PRO: 14,      // N  (PRO # / SHIPPING #)
  TRIGGER_MINUTES: 15
};

// Nguồn tra PRO theo carrier. type: 'json' hoặc 'html'.
var PRO_SOURCES = {
  // ⚠️ PHẢI dùng type=bol, KHÔNG dùng type=po.
  // Trường PO_NUMBER của XGS là PO của mill (vd "MN65516943"), KHÔNG phải PO Home Depot.
  // Số PO của ta nằm ở trường BOL (vì ta đặt Shipper BOL# = PO khi tạo BOL).
  // Kiểm chứng 28/07/2026: type=po -> HTTP 404 "No data was found";
  //                        type=bol -> 200, PROBILL = 18621459 cho BOL 07561121.
  XGSI: { type: 'json', url: 'https://api.xgsi.com/shipments/track?type=bol&trackNumber=' },
  BXID: { type: 'html', url: 'https://www.braunsexpress.com/customer-tools/shipment-tracking/?tracking_number=' }
};


function installProTrigger() {
  removeProTrigger();
  ScriptApp.newTrigger('fillPro').timeBased()
    .everyMinutes(PRO_CFG.TRIGGER_MINUTES).create();
  _proToast('Đã bật tự động tra PRO mỗi ' + PRO_CFG.TRIGGER_MINUTES + ' phút.');
}

function removeProTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'fillPro') ScriptApp.deleteTrigger(t);
  });
}


/** HÀM CHÍNH: điền PRO cho các hàng carrier được hỗ trợ, cột PRO còn trống. */
function fillPro() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    var ss = SpreadsheetApp.openById(PRO_CFG.SHEET_ID);
    var sheet = ss.getSheetByName(PRO_CFG.SHEET_NAME);
    if (!sheet) throw new Error('Không thấy sheet "' + PRO_CFG.SHEET_NAME + '"');
    var startRow = PRO_CFG.HEADER_ROWS + 1;
    var lastRow = sheet.getLastRow();
    if (lastRow < startRow) return;

    var maxCol = Math.max(PRO_CFG.COL_PO, PRO_CFG.COL_CARRIER, PRO_CFG.COL_PRO);
    var values = sheet.getRange(startRow, 1, lastRow - PRO_CFG.HEADER_ROWS, maxCol).getValues();
    var filled = 0;

    for (var i = 0; i < values.length; i++) {
      var rowNum = startRow + i;
      var po = String(values[i][PRO_CFG.COL_PO - 1]).trim();
      var carrier = String(values[i][PRO_CFG.COL_CARRIER - 1] || '').trim().toUpperCase();
      var proCell = String(values[i][PRO_CFG.COL_PRO - 1] || '').trim();

      if (!po) continue;
      if (!PRO_SOURCES[carrier]) continue;   // carrier không tra tự động ở đây (vd AACT/CTII...)
      if (proCell) continue;                 // cột J đã có gì đó -> bỏ qua (không đè)

      var pro = getPro(carrier, po);
      if (pro) { sheet.getRange(rowNum, PRO_CFG.COL_PRO).setValue(pro); filled++; }
      // không tìm thấy -> ĐỂ TRỐNG (không ghi WAIT vào sheet chung), lần sau tự thử lại
    }
    if (filled > 0) _proToast('Đã điền PRO cho ' + filled + ' đơn.');
  } catch (e) {
    _proToast('Lỗi tra PRO: ' + e.message);
    throw e;
  } finally {
    lock.releaseLock();
  }
}


/**
 * 🔎 CHẨN ĐOÁN TRA PRO — KHÔNG ghi gì vào sheet. Chạy bằng info@.
 * In ra từng hàng XGSI/BXID đang trống PRO: HTTP code + có ra số hay không.
 */
function DIAG_pro() {
  Logger.log('ĐANG CHẠY BẰNG: ' + Session.getActiveUser().getEmail());
  var trg = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'fillPro'; });
  Logger.log('Trigger fillPro của tài khoản này: ' + (trg.length ? trg.length + ' cái' : '❌ KHÔNG CÓ'));
  Logger.log('Cột đang dùng: PO=' + PRO_CFG.COL_PO + ' Carrier=' + PRO_CFG.COL_CARRIER +
             ' PRO=' + PRO_CFG.COL_PRO + (PRO_CFG.COL_PRO === 14 ? '  ✅ BẢN MỚI (N)' : '  ❌ SAI CỘT (phải là 14)'));

  var sheet = SpreadsheetApp.openById(PRO_CFG.SHEET_ID).getSheetByName(PRO_CFG.SHEET_NAME);
  if (!sheet) { Logger.log('❌ KHÔNG THẤY sheet "' + PRO_CFG.SHEET_NAME + '"'); return; }
  var start = PRO_CFG.HEADER_ROWS + 1, last = sheet.getLastRow();
  if (last < start) { Logger.log('Sheet chưa có dữ liệu.'); return; }

  var maxCol = Math.max(PRO_CFG.COL_PO, PRO_CFG.COL_CARRIER, PRO_CFG.COL_PRO);
  var vals = sheet.getRange(start, 1, last - PRO_CFG.HEADER_ROWS, maxCol).getValues();
  var todo = [], hit = 0, miss = 0;

  for (var i = 0; i < vals.length; i++) {
    var po = String(vals[i][PRO_CFG.COL_PO - 1]).trim();
    var carrier = String(vals[i][PRO_CFG.COL_CARRIER - 1] || '').trim().toUpperCase();
    var proCell = String(vals[i][PRO_CFG.COL_PRO - 1] || '').trim();
    if (!po || !PRO_SOURCES[carrier] || proCell) continue;
    todo.push({ row: start + i, po: po, carrier: carrier });
  }
  Logger.log('Số hàng CẦN tra (XGSI/BXID, cột N trống): ' + todo.length);

  // Chỉ tra 10 hàng gần nhất để log không quá dài / không hết quota UrlFetch
  todo.slice(-10).forEach(function (r) {
    var src = PRO_SOURCES[r.carrier], code = '?', pro = '';
    try {
      var resp = UrlFetchApp.fetch(src.url + encodeURIComponent(r.po), {
        method: 'get', muteHttpExceptions: true, followRedirects: true,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      code = resp.getResponseCode();
      pro = getPro(r.carrier, r.po);
    } catch (e) { code = 'EXCEPTION: ' + e.message; }
    if (pro) { hit++; Logger.log('Hàng ' + r.row + ' ' + r.po + ' [' + r.carrier + '] HTTP ' + code + ' -> ✅ PRO = ' + pro); }
    else { miss++; Logger.log('Hàng ' + r.row + ' ' + r.po + ' [' + r.carrier + '] HTTP ' + code + ' -> ⏳ chưa có PRO (carrier chưa manifest / tra không ra)'); }
  });
  Logger.log('KẾT QUẢ: ra số ' + hit + ' | chưa ra ' + miss +
             '  → HTTP 200 mà toàn "chưa có PRO" là bình thường với đơn chưa tới ngày pickup; HTTP khác 200 mới là hỏng nguồn tra.');
}


/** Tra PRO 1 đơn. Trả string PRO, hoặc '' nếu chưa có/không tìm thấy. */
function getPro(carrier, po) {
  var src = PRO_SOURCES[carrier];
  if (!src) return '';
  var resp = UrlFetchApp.fetch(src.url + encodeURIComponent(po), {
    method: 'get', muteHttpExceptions: true,
    followRedirects: true,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  if (resp.getResponseCode() !== 200) return '';
  var body = resp.getContentText();

  if (src.type === 'json') {
    var json; try { json = JSON.parse(body); } catch (e) { return ''; }
    var d = json && json.data && json.data[0];
    if (!d || d.result !== true) return '';
    return d.PROBILL ? String(d.PROBILL).trim() : '';
  }

  // type === 'html': bỏ thẻ, giải mã vài entity, tìm số sau "Pro No"
  var text = body.replace(/<[^>]+>/g, ' ')
                 .replace(/&#0?39;|&#8217;|&apos;/g, "'")
                 .replace(/&nbsp;/g, ' ')
                 .replace(/\s+/g, ' ');
  // "Braun's Pro No: 72525487" (KHÔNG khớp "PO No" vì đó là "PO No" chứ không phải "Pro No")
  var m = text.match(/Pro No\s*:?\s*([0-9]{4,})/i);
  return m ? m[1] : '';
}

function _proToast(msg) {
  try { SpreadsheetApp.getActive().toast(msg, '🔎 PRO', 5); } catch (e) {}
}
