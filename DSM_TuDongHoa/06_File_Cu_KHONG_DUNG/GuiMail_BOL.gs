/**
 * ============================================================
 *  TỰ ĐỘNG GỬI MAIL KHO (Google Apps Script)
 * ------------------------------------------------------------
 *  Sheet "Order List" (data từ hàng 7):
 *    B=PO | C=Carrier | I=Quantity | K=PICK UP SCHEDULE | M=WAREHOUSE NOTIFICATION
 *
 *  Mỗi hàng có Carrier & CHƯA gửi (L != 'X'):
 *    - Tìm folder tên = PO trong PARENT_FOLDER_ID.
 *    - Kiểm đủ file: AACT & CTII cần BOL+PackingSlip+ShippingLabel (3);
 *      carrier khác cần BOL+PackingSlip (2).
 *    - Đủ -> gửi MAIL KHO (đính kèm file trong folder), ngày pickup đọc từ cột K.
 *      -> đánh 'X' vào cột M. Thiếu file -> bỏ qua (thử lại lần sau).
 *
 *  ⚠️ CHỈ gửi mail kho (đã bỏ mail carrier). CHẠY BẰNG info@ (From alias b2b@).
 * ============================================================
 */

var CONFIG = {
  SHEET_ID: '1Fzwr2GDHOHxMgqPNf-Ksf6qJ5IIl3mNzrOQrHqH57fo',
  SHEET_NAME: 'Order List',
  HEADER_ROWS: 6,
  COL_PO: 2,          // B
  COL_CARRIER: 3,     // C
  COL_QTY: 9,         // I  Quantity
  COL_PICKUP: 11,     // K  PICK UP SCHEDULE (nguồn duy nhất cho ngày trong mail)
  COL_WHNOTIF: 13,    // M  WAREHOUSE NOTIFICATION (đánh 'X' khi đã gửi)

  PARENT_FOLDER_ID: '1ER7RWu-66baF1uvB4AuBByN7OS-FJdAI',
  SUFFIX: { BOL: '_BOL', SLIP: '_PackingSlip', LABEL: '_ShippingLabel' },
  LABEL_CARRIERS: ['AACT', 'CTII'],   // cần thêm ShippingLabel (đủ 3 file)

  // ⚠️ TEST: gửi về mail test. Khi chạy thật đổi lại: 'mariop@notslogistics.com'
  WAREHOUSE_TO: 'nguyen.nguyen938@hcmut.edu.vn',
  FROM_ADDRESS: 'b2b@allforwood.com',
  CC: ['sue.nguyen@allforwood.com', 'tony.nguyen@allforwood.com', 'b2b@allforwood.com'],
  SENDER_NAME: 'AllForWood',
  TRIGGER_MINUTES: 5
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('📦 Gửi mail kho')
    .addItem('▶ Chạy ngay', 'processOrders')
    .addSeparator()
    .addItem('⏱ Bật tự động (' + CONFIG.TRIGGER_MINUTES + ' phút)', 'installTrigger')
    .addItem('⏹ Tắt tự động', 'removeTriggers')
    .addToUi();
}
function installTrigger() {
  removeTriggers();
  ScriptApp.newTrigger('processOrders').timeBased().everyMinutes(CONFIG.TRIGGER_MINUTES).create();
  Logger.log('✅ Đã tạo trigger processOrders mỗi ' + CONFIG.TRIGGER_MINUTES +
             ' phút, chủ sở hữu = ' + Session.getActiveUser().getEmail() +
             '. Tổng trigger của tài khoản này: ' + ScriptApp.getProjectTriggers().length);
}
function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processOrders') ScriptApp.deleteTrigger(t);
  });
}

function processOrders() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) throw new Error('Không thấy sheet "' + CONFIG.SHEET_NAME + '"');
    var start = CONFIG.HEADER_ROWS + 1;
    var last = sheet.getLastRow();
    if (last < start) return;

    var maxCol = Math.max(CONFIG.COL_PO, CONFIG.COL_CARRIER, CONFIG.COL_QTY,
                          CONFIG.COL_PICKUP, CONFIG.COL_WHNOTIF);
    var vals = sheet.getRange(start, 1, last - CONFIG.HEADER_ROWS, maxCol).getValues();
    var parent = DriveApp.getFolderById(CONFIG.PARENT_FOLDER_ID);
    var sent = 0;

    for (var i = 0; i < vals.length; i++) {
      var rowNum = start + i;
      var po = String(vals[i][CONFIG.COL_PO - 1]).trim();
      var carrier = String(vals[i][CONFIG.COL_CARRIER - 1] || '').trim().toUpperCase();
      var whNotif = String(vals[i][CONFIG.COL_WHNOTIF - 1] || '').trim().toUpperCase();
      var qty = String(vals[i][CONFIG.COL_QTY - 1] || '').trim() || '1';
      var pickupRaw = vals[i][CONFIG.COL_PICKUP - 1];

      if (!po || !carrier) continue;
      if (whNotif === 'X') continue;                       // đã gửi

      var fit = parent.getFoldersByName(po);
      if (!fit.hasNext()) continue;                        // chưa có folder -> chờ
      var folder = fit.next();

      var need = (CONFIG.LABEL_CARRIERS.indexOf(carrier) !== -1)
        ? ['BOL', 'SLIP', 'LABEL'] : ['BOL', 'SLIP'];
      var atts = [], ok = true;
      need.forEach(function (k) {
        var f = _findFile(folder, po, CONFIG.SUFFIX[k]);
        if (f) atts.push(f.getAs('application/pdf')); else ok = false;
      });
      if (!ok) continue;                                   // thiếu file -> chờ

      _sendWarehouse(po, carrier, qty, _monthDay(pickupRaw), atts);
      sheet.getRange(rowNum, CONFIG.COL_WHNOTIF).setValue('X');
      sent++;
    }
    if (sent > 0) _toast('Đã gửi ' + sent + ' mail kho.');
  } catch (e) {
    _toast('Lỗi: ' + e.message); throw e;
  } finally { lock.releaseLock(); }
}

/** Ngày ở cột J (Date hoặc chuỗi mm/dd/yyyy) -> "July 28". '' nếu không đọc được. */
function _monthDay(v) {
  var d = null;
  if (v instanceof Date) {
    d = v;
  } else {
    var s = String(v || '').trim();
    if (!s) return '';
    var m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);   // mm/dd/yyyy
    if (m) {
      var yr = m[3].length === 2 ? ('20' + m[3]) : m[3];
      d = new Date(Number(yr), Number(m[1]) - 1, Number(m[2]));
    } else {
      var p = new Date(s);
      if (!isNaN(p.getTime())) d = p;
    }
  }
  if (!d || isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'MMMM d');
}

function _sendWarehouse(po, carrier, qty, monthDay, attachments) {
  var body =
    'Hi Mario,\n' +
    '\n' +
    'We have a Home Depot order that requires pickup.\n' +
    'This order will be picked up by ' + carrier + ' (see attached PACKING LIST).\n' +
    '\n' +
    'PALLET NEEDED – please pack the ' + qty + ' piece on a pallet.\n' +
    '\n' +
    'Please shrink-wrap the product to protect it during transit.\n' +
    'Please attach the shipping label and packing list to the product.\n' +
    '\n' +
    'Pickup is scheduled for ' + monthDay + '.\n';
  GmailApp.sendEmail(CONFIG.WAREHOUSE_TO, '[BY PIECE ] (PALLET NEEDED) PO# ' + po, body, {
    from: CONFIG.FROM_ADDRESS,
    cc: CONFIG.CC.join(','),
    name: CONFIG.SENDER_NAME,
    attachments: attachments
  });
}

/**
 * 🔎 CHẨN ĐOÁN GỬI MAIL — KHÔNG gửi, KHÔNG ghi gì. Chạy bằng info@.
 * In ra: tài khoản đang chạy · trigger hiện có · mapping cột đang dùng ·
 *        và LÝ DO CỤ THỂ vì sao từng hàng được gửi / bị bỏ qua.
 */
function DIAG_mail() {
  Logger.log('ĐANG CHẠY BẰNG: ' + Session.getActiveUser().getEmail());

  // 1) Trigger của TÀI KHOẢN NÀY (không thấy trigger của tài khoản khác)
  var trg = ScriptApp.getProjectTriggers().map(function (t) {
    return t.getHandlerFunction() + ' [' + t.getEventType() + ']';
  });
  Logger.log('Trigger của tài khoản này (' + trg.length + '): ' + (trg.join(' | ') || '❌ KHÔNG CÓ TRIGGER NÀO'));
  if (trg.indexOf('processOrders') === -1 && trg.join(' ').indexOf('processOrders') === -1) {
    Logger.log('❗ CHƯA CÓ trigger processOrders -> mail sẽ KHÔNG tự gửi. Chạy installTrigger() để tạo.');
  }

  // 2) Mapping cột đang dùng (phát hiện code cũ)
  Logger.log('Cột đang dùng: PO=' + CONFIG.COL_PO + ' Carrier=' + CONFIG.COL_CARRIER +
             ' Qty=' + CONFIG.COL_QTY + ' Pickup=' + CONFIG.COL_PICKUP + ' WHNotif=' + CONFIG.COL_WHNOTIF +
             (CONFIG.COL_WHNOTIF === 13 ? '  ✅ BẢN MỚI' : '  ❌ BẢN CŨ (phải là 13)'));

  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) { Logger.log('❌ KHÔNG THẤY sheet "' + CONFIG.SHEET_NAME + '"'); return; }
  var start = CONFIG.HEADER_ROWS + 1, last = sheet.getLastRow();
  if (last < start) { Logger.log('Sheet chưa có dữ liệu.'); return; }

  var maxCol = Math.max(CONFIG.COL_PO, CONFIG.COL_CARRIER, CONFIG.COL_QTY, CONFIG.COL_PICKUP, CONFIG.COL_WHNOTIF);
  var vals = sheet.getRange(start, 1, last - CONFIG.HEADER_ROWS, maxCol).getValues();
  var parent = DriveApp.getFolderById(CONFIG.PARENT_FOLDER_ID);
  var willSend = [];

  for (var i = 0; i < vals.length; i++) {
    var rowNum = start + i;
    var po = String(vals[i][CONFIG.COL_PO - 1]).trim();
    var carrier = String(vals[i][CONFIG.COL_CARRIER - 1] || '').trim().toUpperCase();
    var wh = String(vals[i][CONFIG.COL_WHNOTIF - 1] || '').trim().toUpperCase();
    if (!po) continue;                                   // hàng trống -> im lặng
    if (!carrier) { Logger.log('Hàng ' + rowNum + ' (' + po + '): ⏭ BỎ QUA — cột C Carrier TRỐNG'); continue; }
    if (wh === 'X') { Logger.log('Hàng ' + rowNum + ' (' + po + '): ⏭ BỎ QUA — cột ' + CONFIG.COL_WHNOTIF + ' đã có X (đã gửi)'); continue; }

    var it = parent.getFoldersByName(po);
    if (!it.hasNext()) { Logger.log('Hàng ' + rowNum + ' (' + po + '): ⏭ BỎ QUA — KHÔNG có folder Drive tên "' + po + '"'); continue; }
    var folder = it.next();
    var need = (CONFIG.LABEL_CARRIERS.indexOf(carrier) !== -1) ? ['BOL', 'SLIP', 'LABEL'] : ['BOL', 'SLIP'];
    var missing = [];
    need.forEach(function (k) { if (!_findFile(folder, po, CONFIG.SUFFIX[k])) missing.push(k); });
    if (missing.length) { Logger.log('Hàng ' + rowNum + ' (' + po + ', ' + carrier + '): ⏭ BỎ QUA — THIẾU FILE: ' + missing.join(', ')); continue; }

    willSend.push(rowNum + ':' + po + '(' + carrier + ')');
  }
  Logger.log('✅ SẼ GỬI (' + willSend.length + '): ' + (willSend.join(' | ') || 'không có hàng nào'));
  Logger.log('→ Muốn gửi ngay: chạy processOrders. Muốn bật tự động: chạy installTrigger.');
}

function _findFile(folder, po, suffix) {
  var target = (po + suffix).toLowerCase();
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    if (f.getName().toLowerCase().indexOf(target) !== -1) return f;
  }
  return null;
}

function _toast(msg) { try { SpreadsheetApp.getActive().toast(msg, '📦 Mail kho', 5); } catch (e) {} }

// TEST nhanh mẫu mail (không gửi) — xem log để kiểm khoảng cách dòng
function TEST_mailBody() {
  Logger.log('SUBJECT: [BY PIECE ] (PALLET NEEDED) PO# 07562145');
  Logger.log('BODY:\n' +
    'Hi Mario,\n\nWe have a Home Depot order that requires pickup.\n' +
    'This order will be picked up by AACT (see attached PACKING LIST).\n\n' +
    'PALLET NEEDED – please pack the 1 piece on a pallet.\n\n' +
    'Please shrink-wrap the product to protect it during transit.\n' +
    'Please attach the shipping label and packing list to the product.\n\n' +
    'Pickup is scheduled for ' + _monthDay('07/28/2026') + '.\n');
}
