/**
 * ============================================================
 *  CHECK ĐƠN MỚI TỪ MAIL RITHUM  (Google Apps Script)
 * ------------------------------------------------------------
 *  Mail alert Rithum được FORWARD tới hộp rithumgetorder@gmail.com.
 *  -> Script quét mail trong **3 NGÀY GẦN NHẤT** có subject "Rithum New Order Alert"
 *     trong hộp thư của TÀI KHOẢN CHẠY SCRIPT (phải là rithumgetorder@gmail.com).
 *  -> KHÔNG dùng is:unread nữa: mail lỡ bị mở tay vẫn được xử lý.
 *     Chống trùng hoàn toàn dựa vào danh sách PO đã có ở cột B (không markRead).
 *  -> Dùng in:anywhere để quét cả SPAM (mail có thể bị để trong Spam).
 *
 *  Nội dung mail (giống bản cũ) có bảng HTML:
 *    <table border="1"><tr><th>PO Number</th><th>Merchant Name</th><th>Order Date</th></tr>
 *      <tr><td>20581862</td><td>The Home Depot Inc</td><td>07/23/2026</td></tr> ... </table>
 *
 *  Với mỗi đơn: nếu PO CHƯA có ở cột B -> thêm HÀNG MỚI vào sheet "Order List":
 *    A = Order Date, B = PO Number.   (BỎ Merchant Name — không ghi.)
 *    KHÔNG đụng cột khác.
 *  Chạy lặp lại vô hại: PO đã có trong cột B sẽ bị bỏ qua.
 * ============================================================
 */

var RITHUM = {
  SHEET_ID: '1Fzwr2GDHOHxMgqPNf-Ksf6qJ5IIl3mNzrOQrHqH57fo',
  SHEET_NAME: 'Order List',
  HEADER_ROWS: 6,
  COL_ORDERDATE: 1, // A
  COL_PO: 2,        // B
  SUBJECT: 'Rithum New Order Alert',
  SEARCH_DAYS: 3,          // quét mail trong 3 ngày gần nhất (KHÔNG phụ thuộc đã đọc/chưa đọc)
  TRIGGER_MINUTES: 10
};

function installRithumTrigger() {
  removeRithumTrigger();
  ScriptApp.newTrigger('checkRithumOrders').timeBased()
    .everyMinutes(RITHUM.TRIGGER_MINUTES).create();
}
function removeRithumTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'checkRithumOrders') ScriptApp.deleteTrigger(t);
  });
}

function checkRithumOrders() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    // Quét mail trong N ngày gần nhất — KHÔNG dùng is:unread (mail bị mở tay vẫn xử lý được).
    // KHÔNG lọc from: (mail là bản forward, From có thể là noreply@rithum.com hoặc b2b@).
    // in:anywhere -> gồm cả SPAM/Trash. Chống trùng bằng danh sách PO đã có ở cột B.
    var q = 'subject:"' + RITHUM.SUBJECT + '" newer_than:' + RITHUM.SEARCH_DAYS + 'd in:anywhere';
    var threads = GmailApp.search(q, 0, 200);   // 200 THREAD (mỗi thread có thể chứa nhiều mail — đều được duyệt)
    if (!threads.length) return;

    var ss = SpreadsheetApp.openById(RITHUM.SHEET_ID);
    var sh = ss.getSheetByName(RITHUM.SHEET_NAME);
    if (!sh) throw new Error('Không thấy sheet "' + RITHUM.SHEET_NAME + '"');
    var start = RITHUM.HEADER_ROWS + 1;

    // tập PO đã có (cột B)
    var existing = {};
    var last = sh.getLastRow();
    if (last >= start) {
      sh.getRange(start, RITHUM.COL_PO, last - RITHUM.HEADER_ROWS, 1).getValues()
        .forEach(function (r) {
          var p = String(r[0]).trim(); if (!p) return;
          existing[p] = true;
          existing[_poKey(p)] = true;   // khớp cả khi ô cũ đã bị mất số 0 đầu (số 8576180 vs "08576180")
        });
    }

    // GOM tất cả đơn mới rồi ghi 1 LẦN.
    // ⚠️ KHÔNG gọi sh.getLastRow() trong vòng lặp: setValue chưa flush -> getLastRow() trả số CŨ
    //    -> đơn sau GHI ĐÈ đơn trước (bug đã gặp: mail có 17560143 + 17560144, sheet chỉ còn 17560144).
    var toAdd = [];
    for (var t = 0; t < threads.length; t++) {
      var msgs = threads[t].getMessages();
      for (var m = 0; m < msgs.length; m++) {
        var msg = msgs[m];
        if (String(msg.getSubject() || '').indexOf(RITHUM.SUBJECT) === -1) continue;

        var rows = _parseRithumRows(msg.getBody());
        rows.forEach(function (o) {
          if (!o.po || existing[o.po] || existing[_poKey(o.po)]) return;   // bỏ PO trùng / rỗng
          toAdd.push([o.date, o.po]);              // A = Order Date, B = PO Number
          existing[o.po] = true;                   // chống trùng trong cùng lượt chạy
        });
        // KHÔNG markRead: chống trùng đã dựa vào PO ở cột B, giữ nguyên trạng thái mail.
      }
    }

    var added = toAdd.length;
    if (added > 0) {
      var nextRow = Math.max(sh.getLastRow() + 1, start);
      // ⚠️ PHẢI đặt định dạng TEXT ('@') cho cột PO TRƯỚC khi ghi.
      //    Nếu không, Sheets "diễn giải như người gõ" -> "08576180" thành số 8576180, MẤT số 0 đầu,
      //    làm lệch mọi chỗ so PO (tên folder Drive, fillRow, GuiMail, TraPRO).
      sh.getRange(nextRow, RITHUM.COL_PO, added, 1).setNumberFormat('@');
      sh.getRange(nextRow, RITHUM.COL_ORDERDATE, added, 2).setValues(toAdd);  // ghi A:B một lần
      SpreadsheetApp.flush();
      _rToast('Đã thêm ' + added + ' đơn mới từ Rithum.');
    }
  } catch (e) {
    _rToast('Lỗi Rithum: ' + e.message); throw e;
  } finally { lock.releaseLock(); }
}

/**
 * Chuẩn hoá PO để SO SÁNH (không phải để ghi): đệm 0 cho đủ 8 ký tự.
 * Dùng khi ô trong sheet đã bị Sheets ép thành số và mất số 0 đầu (8576180 -> "08576180").
 * Hàm này khai báo 1 lần ở đây; các file .gs khác trong cùng project gọi được trực tiếp.
 */
function _poKey(v) {
  var s = String(v == null ? '' : v).trim();
  return /^\d+$/.test(s) && s.length < 8 ? ('00000000' + s).slice(-8) : s;
}

/**
 * 🛠 SỬA CÁC Ô PO CŨ ĐÃ MẤT SỐ 0 ĐẦU (cột B). Chạy bằng info@.
 * Chỉ chạm vào ô đang lưu dưới dạng SỐ; ô đã là text thì bỏ qua.
 * GIẢ ĐỊNH: mọi PO đều dài 8 chữ số. In ra từng thay đổi để bạn kiểm lại.
 * Đặt DRY_RUN = true để chỉ xem trước, không ghi.
 */
function FIX_poLeadingZero() {
  var DRY_RUN = false;

  var sh = SpreadsheetApp.openById(RITHUM.SHEET_ID).getSheetByName(RITHUM.SHEET_NAME);
  if (!sh) { Logger.log('❌ Không thấy sheet "' + RITHUM.SHEET_NAME + '"'); return; }
  var start = RITHUM.HEADER_ROWS + 1, last = sh.getLastRow();
  if (last < start) { Logger.log('Sheet chưa có dữ liệu.'); return; }

  var rng = sh.getRange(start, RITHUM.COL_PO, last - RITHUM.HEADER_ROWS, 1);
  var vals = rng.getValues(), fixed = 0, skipped = 0;

  for (var i = 0; i < vals.length; i++) {
    var v = vals[i][0];
    if (v === '' || v === null) continue;
    if (typeof v !== 'number') { skipped++; continue; }        // đã là text -> để yên
    var padded = ('00000000' + String(v)).slice(-8);
    Logger.log('Hàng ' + (start + i) + ': số ' + v + ' -> text "' + padded + '"' +
               (String(v).length === 8 ? '  (đủ 8 chữ số, chỉ đổi sang text)' : '  ⬅ THÊM số 0 đầu'));
    if (!DRY_RUN) {
      var cell = sh.getRange(start + i, RITHUM.COL_PO);
      cell.setNumberFormat('@');
      cell.setValue(padded);
    }
    fixed++;
  }
  Logger.log((DRY_RUN ? '[XEM TRƯỚC] ' : '') + 'Ô dạng số đã xử lý: ' + fixed + ' | ô đã là text, bỏ qua: ' + skipped);
}

/**
 * Trích các dòng PO | Merchant | Order Date.
 * ⚠️ Mail forward/bọc lại thường đổi `<tr>` thành `<tr style="...">`, `<td class=...>` → regex PHẢI cho phép thuộc tính.
 * 2 tầng:
 *   1) HTML: <tr ...><td ...>PO</td><td ...>Merchant</td><td ...>Date</td>   (KHÔNG bắt buộc </tr>)
 *   2) Fallback TEXT: dòng "17560143  The Home Depot Inc  07/27/2026" (khi mail bị chuyển thành text thuần)
 */
function _parseRithumRows(html) {
  if (!html) return [];
  function clean(s) {
    return String(s).replace(/<[^>]*>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  var out = [], seen = {}, m;

  // --- Tầng 1: KHOANH VÙNG bảng chứa tiêu đề "PO Number" rồi mới parse ---
  // ⚠️ BẮT BUỘC khoanh vùng: mail Rithum lồng bảng PO trong nhiều <table> layout.
  //    Nếu quét cả body, regex khớp NHẦM <tr><td> của table ngoài và lastIndex NHẢY QUA
  //    vùng bảng PO -> mất sạch dữ liệu (bug thật: 3 mail ngày 28/07 ra 0 PO).
  var scopes = [], idx = html.indexOf('PO Number');
  while (idx >= 0) {
    var end = html.indexOf('</table>', idx);
    scopes.push(html.substring(idx, end >= 0 ? end : Math.min(html.length, idx + 5000)));
    idx = html.indexOf('PO Number', idx + 9);
  }
  scopes.forEach(function (sc) {
    var re = /<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
    var mm;
    while ((mm = re.exec(sc)) !== null) {
      var po = clean(mm[1]), merchant = clean(mm[2]), date = clean(mm[3]);
      if (/^\d{5,}$/.test(po) && !seen[po]) { seen[po] = 1; out.push({ po: po, merchant: merchant, date: date }); }
    }
  });
  if (out.length) return out;

  // --- Tầng 2: fallback text thuần ---
  var txt = String(html).replace(/<[^>]*>/g, '\n').replace(/&nbsp;/g, ' ');
  var re2 = /(\d{5,10})\s*[\|\t ]+\s*([A-Za-z][^\n\r|]{2,40}?)\s*[\|\t ]+\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/g;
  while ((m = re2.exec(txt)) !== null) {
    var po2 = m[1].trim();
    if (!seen[po2]) { seen[po2] = 1; out.push({ po: po2, merchant: m[2].trim(), date: m[3].trim() }); }
  }
  return out;
}

function _rToast(msg) { try { SpreadsheetApp.getActive().toast(msg, '📥 Rithum', 5); } catch (e) {} }

/**
 * 🔎 CHẨN ĐOÁN — CHẠY BẰNG rithumgetorder@gmail.com (hoặc tài khoản nghi ngờ).
 * KHÔNG ghi gì vào Sheet. In ra Execution log:
 *   - Đang chạy bằng email nào (rất hay sai chỗ này!)
 *   - Số thread / số mail quét được, mail cũ nhất & mới nhất
 *   - TỔNG số PO parse được, PO nào ĐÃ có trong sheet, PO nào CÒN THIẾU
 *   - Mail nào không parse ra PO nào (nghi đổi format)
 */
function DIAG_rithum() {
  var me = Session.getActiveUser().getEmail();
  var q = 'subject:"' + RITHUM.SUBJECT + '" newer_than:' + RITHUM.SEARCH_DAYS + 'd in:anywhere';
  var threads = GmailApp.search(q, 0, 200);

  var ss = SpreadsheetApp.openById(RITHUM.SHEET_ID);
  var sh = ss.getSheetByName(RITHUM.SHEET_NAME);
  var existing = {};
  if (sh) {
    var start = RITHUM.HEADER_ROWS + 1, last = sh.getLastRow();
    if (last >= start) sh.getRange(start, RITHUM.COL_PO, last - RITHUM.HEADER_ROWS, 1).getValues()
      .forEach(function (r) { var p = String(r[0]).trim(); if (p) existing[p] = true; });
  }

  var msgCount = 0, allPo = {}, missing = {}, noParse = [], oldest = null, newest = null, sample = null;
  threads.forEach(function (th) {
    th.getMessages().forEach(function (m) {
      if (String(m.getSubject() || '').indexOf(RITHUM.SUBJECT) === -1) return;
      msgCount++;
      var d = m.getDate();
      if (!oldest || d < oldest) oldest = d;
      if (!newest || d > newest) newest = d;
      var body = m.getBody();
      var rows = _parseRithumRows(body);
      if (!rows.length) {
        noParse.push(Utilities.formatDate(d, Session.getScriptTimeZone(), 'MM/dd HH:mm'));
        if (!sample) {   // lưu mẫu mail ĐẦU TIÊN không parse được để soi format
          var i = body.indexOf('PO Number');
          sample = (i >= 0) ? body.substr(Math.max(0, i - 200), 900)
                            : ('KHÔNG THẤY "PO Number". Đầu body: ' + body.substr(0, 600));
        }
      }
      rows.forEach(function (o) { allPo[o.po] = true; if (!existing[o.po]) missing[o.po] = o.date; });
    });
  });

  var miss = Object.keys(missing);
  Logger.log('ĐANG CHẠY BẰNG: ' + me);
  Logger.log('Sheet "' + RITHUM.SHEET_NAME + '": ' + (sh ? 'OK' : '❌ KHÔNG THẤY'));
  Logger.log('Query: ' + q);
  Logger.log('Threads: ' + threads.length + ' | Mail khớp subject: ' + msgCount);
  if (oldest) Logger.log('Mail cũ nhất: ' + oldest + ' | mới nhất: ' + newest);
  Logger.log('Tổng PO trong mail: ' + Object.keys(allPo).length + ' | Đã có trong sheet: ' + (Object.keys(allPo).length - miss.length));
  Logger.log('❗ PO CÒN THIẾU (' + miss.length + '): ' + (miss.join(', ') || 'không có'));
  if (noParse.length) {
    Logger.log('⚠️ Mail KHÔNG parse ra PO (' + noParse.length + '): ' + noParse.join(', '));
    Logger.log('----- MẪU BODY MAIL KHÔNG PARSE ĐƯỢC (soi format) -----');
    Logger.log(sample);
  }
}

/**
 * 🧪 KIỂM PARSER ĐANG CHẠY LÀ BẢN NÀO (chạy khi DIAG báo "không parse ra PO" mà body lại chuẩn).
 * Nguyên nhân điển hình: project có FILE KHÁC cũng định nghĩa _parseRithumRows -> bản kia ĐÈ bản mới.
 */
function DIAG_parser() {
  var src = _parseRithumRows.toString();
  var isNew = src.indexOf('<tr[^>]*>') >= 0;          // bản mới cho phép thuộc tính trong <tr>
  Logger.log('Parser đang chạy: ' + (isNew ? '✅ BẢN MỚI' : '❌ BẢN CŨ (có file khác đè!)'));
  Logger.log('--- 300 ký tự đầu của hàm đang chạy ---');
  Logger.log(src.substr(0, 300));

  var sample = '<table border="1"><tr><th>PO Number</th><th>Merchant Name</th><th>Order Date</th></tr> ' +
               '<tr><td>31579451</td><td>The Home Depot Inc</td><td>07/27/2026</td></tr> </table>';
  var r = _parseRithumRows(sample);
  Logger.log('Test trên mẫu body thật -> ' + r.length + ' PO: ' + r.map(function (x) { return x.po; }).join(', '));
  if (!r.length) Logger.log('❗ Parser KHÔNG khớp cả HTML chuẩn -> chắc chắn đang chạy bản lỗi/bị đè.');
}

// TEST parser (không cần mail)
function TEST_parseRithum() {
  var html = '<table border="1"><tr><th>PO Number</th><th>Merchant Name</th><th>Order Date</th></tr>' +
    '<tr><td>20581862</td><td>The Home Depot Inc</td><td>07/23/2026</td></tr>' +
    '<tr><td>73761050</td><td>The Home Depot Inc</td><td>07/23/2026</td></tr></table>';
  Logger.log(JSON.stringify(_parseRithumRows(html)));
}
