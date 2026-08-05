/**
 * ============================================================
 *  LẤY PRO TỪ MAIL MARIO (OCR file scan)  — Google Apps Script
 * ------------------------------------------------------------
 *  Cho các carrier KHÔNG tra online (SEFL, CTII, FXFE, ABFS, EXLA):
 *  Mario (mariop@notslogistics.com) reply lại mail đơn hàng, đính 1 file PDF (scan/ảnh)
 *  chứa số PRO. Script: tìm mail reply theo PO -> OCR file -> lấy PRO -> ghi cột D.
 *
 *  Sheet: A=PO | B=Carrier | C=Status | D=PRO | E=Qty
 *
 *  ⚠️ CHẠY BẰNG b2b@allforwood.com (mail Mario reply về inbox b2b@).
 *  ⚠️ PHẢI bật Advanced Service "Drive" (Services ▸ + ▸ Drive API) để OCR PDF.
 *  ⚠️ Phần trích PRO (extractPro_) CẦN CALIB theo file mẫu của Mario — xem TODO.
 *
 *  KHÔNG có onOpen (tránh trùng GuiMail_BOL.gs). Chạy tay checkMarioPro, hoặc bật trigger.
 * ============================================================
 */

var MPRO_CFG = {
  SHEET_ID: '1Fzwr2GDHOHxMgqPNf-Ksf6qJ5IIl3mNzrOQrHqH57fo',   // sheet "Lowes, THD - Xuan Follow"
  SHEET_NAME: 'Order List',
  HEADER_ROWS: 6,   // dữ liệu từ hàng 7
  COL_PO: 2,        // B
  COL_CARRIER: 3,   // C
  COL_PRO: 14,      // N  (PRO # / SHIPPING #)
  CARRIERS: ['SEFL', 'CTII', 'FXFE', 'ABFS', 'EXLA'], // chờ Mario gửi PRO
  MARIO_EMAIL: 'mariop@notslogistics.com',
  SEARCH_NEWER_THAN: '30d',
  TRIGGER_MINUTES: 15
};

// Cách lấy PRO (chung cho mọi carrier check qua mail) — xem extractPro_ bên dưới:
//   1) NEO nhãn "Pro number" -> lấy số ngay sau (ưu tiên, ổn định nhất).
//   2) Fallback: vùng "SHIP TO".."Freight Charge", bỏ SĐT & bỏ số PO, lấy dãy số dài nhất (>=7).
//   Bắt số chịu khoảng trắng + gạch ngang. Quét cả NỘI DUNG mail lẫn OCR file đính kèm.
//   Vd: CTII -> 496401068 ; SEFL -> 50597918-7 ; EXLA -> 101-1234567.


function installMproTrigger() {
  removeMproTrigger();
  ScriptApp.newTrigger('checkMarioPro').timeBased()
    .everyMinutes(MPRO_CFG.TRIGGER_MINUTES).create();
  _mproToast('Đã bật tự động lấy PRO từ mail Mario mỗi ' + MPRO_CFG.TRIGGER_MINUTES + ' phút.');
}

function removeMproTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'checkMarioPro') ScriptApp.deleteTrigger(t);
  });
}


/** HÀM CHÍNH. */
function checkMarioPro() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    var ss = SpreadsheetApp.openById(MPRO_CFG.SHEET_ID);
    var sheet = ss.getSheetByName(MPRO_CFG.SHEET_NAME);
    if (!sheet) throw new Error('Không thấy sheet "' + MPRO_CFG.SHEET_NAME + '"');
    var startRow = MPRO_CFG.HEADER_ROWS + 1;
    var lastRow = sheet.getLastRow();
    if (lastRow < startRow) return;

    var maxCol = Math.max(MPRO_CFG.COL_PO, MPRO_CFG.COL_CARRIER, MPRO_CFG.COL_PRO);
    var values = sheet.getRange(startRow, 1, lastRow - MPRO_CFG.HEADER_ROWS, maxCol).getValues();
    var filled = 0;

    for (var i = 0; i < values.length; i++) {
      var rowNum = startRow + i;
      var po = String(values[i][MPRO_CFG.COL_PO - 1]).trim();
      var carrier = String(values[i][MPRO_CFG.COL_CARRIER - 1] || '').trim().toUpperCase();
      var proCell = String(values[i][MPRO_CFG.COL_PRO - 1] || '').trim();

      if (!po) continue;
      if (MPRO_CFG.CARRIERS.indexOf(carrier) === -1) continue;   // chỉ nhóm chờ Mario
      if (/^\d[\d\- ]*$/.test(proCell)) continue;                 // đã có PRO thật (số/gạch) -> bỏ qua
      // (proCell rỗng hoặc là marker 'CHECK PRO...' -> vẫn thử lại)

      var res = getProFromSignedFolder(po, carrier);
      if (res.pro) {
        sheet.getRange(rowNum, MPRO_CFG.COL_PRO).setValue(res.pro); filled++;
      } else if (res.sawFile) {
        // Kho ĐÃ bỏ file vào SIGNED PRO# nhưng OCR chưa đọc được số -> đánh dấu để kiểm tay
        sheet.getRange(rowNum, MPRO_CFG.COL_PRO).setValue('CHECK PRO: có file, chưa đọc được số');
      }
      // Folder SIGNED PRO# còn trống -> ĐỂ TRỐNG, lần sau tự thử lại.
    }
    if (filled > 0) _mproToast('Đã lấy PRO cho ' + filled + ' đơn (từ folder SIGNED PRO#).');
  } catch (e) {
    _mproToast('Lỗi lấy PRO: ' + e.message);
    throw e;
  } finally {
    lock.releaseLock();
  }
}


/* ============================================================
 *  LẤY PRO TỪ FOLDER  SIGNED PRO#   (đổi từ mail sang Drive — 01/08/2026)
 * ------------------------------------------------------------
 *  Cây folder:  THD Orders / <DD Mon YYYY> / PO - <số PO> / SIGNED PRO#
 *  Kho scan BOL đã ký (có tem PRO dán) rồi bỏ file vào SIGNED PRO#,
 *  thay cho việc reply mail như trước.
 *
 *  Trả { pro:'<số hoặc rỗng>', sawFile:<folder đã có file chưa> }
 *   -> phân biệt: kho chưa bỏ file (sawFile=false) vs có file mà OCR không ra (sawFile=true, pro='').
 * ============================================================ */
var THD_ORDERS_ROOT = '1hsWarcdjtK63CD8As9CtXqJTcUPg8oAw';   // folder "THD Orders"

/** Tìm folder 'SIGNED PRO#' của một PO. Duyệt mọi folder ngày dưới THD Orders. */
function findSignedProFolder_(po) {
  var target = 'PO - ' + String(po).trim();
  var root = DriveApp.getFolderById(THD_ORDERS_ROOT);
  var days = root.getFolders();
  while (days.hasNext()) {
    var day = days.next();
    var pos = day.getFolders();
    while (pos.hasNext()) {
      var p = pos.next();
      if (p.getName().trim() !== target) continue;            // tên có thể dính dấu cách thừa
      var sg = p.getFolders();
      while (sg.hasNext()) {
        var s = sg.next();
        if (s.getName().trim().toUpperCase() === 'SIGNED PRO#') return s;
      }
      return null;                                            // có PO folder nhưng chưa có SIGNED PRO#
    }
  }
  return null;
}

function getProFromSignedFolder(po, carrier) {
  var sg = findSignedProFolder_(po);
  if (!sg) return { pro: '', sawFile: false };
  var files = sg.getFiles();
  var sawFile = false;
  while (files.hasNext()) {
    var f = files.next();
    sawFile = true;
    // 1) số PRO có sẵn trong TÊN file thì lấy luôn, khỏi OCR
    var byName = extractPro_(f.getName(), carrier, po);
    if (byName) return { pro: byName, sawFile: true };
    // 2) OCR nội dung file — dùng lại đúng logic đọc tem như bản mail cũ
    try {
      var txt = ocrToText_(f.getBlob());
      var pro = extractPro_(txt, carrier, po);
      if (pro) return { pro: pro, sawFile: true };
    } catch (e) { /* file không OCR được -> thử file kế tiếp */ }
  }
  return { pro: '', sawFile: sawFile };
}

/**
 * [KHÔNG CÒN DÙNG — giữ để tham khảo]
 * Tìm mail Mario reply theo PO -> lấy PRO từ (1) nội dung mail, (2) OCR file đính kèm.
 */
function getProFromMario(po, carrier) {
  // KHÔNG bắt buộc has:attachment (Mario có thể gõ thẳng PRO trong nội dung reply).
  var q = 'from:' + MPRO_CFG.MARIO_EMAIL + ' subject:' + po +
          ' newer_than:' + MPRO_CFG.SEARCH_NEWER_THAN;
  var threads = GmailApp.search(q, 0, 8);
  var sawMail = false;
  for (var t = 0; t < threads.length; t++) {
    var msgs = threads[t].getMessages();
    for (var m = msgs.length - 1; m >= 0; m--) { // mail mới nhất trước
      if (msgs[m].getFrom().toLowerCase().indexOf(MPRO_CFG.MARIO_EMAIL.toLowerCase()) === -1) continue;
      sawMail = true;  // đã có mail từ Mario cho PO này

      // (1) Thử NỘI DUNG mail trước (nhanh, không cần OCR)
      var proBody = extractPro_(msgs[m].getPlainBody() || '', carrier, po);
      if (proBody) return { pro: proBody, sawMail: true };

      // (2) OCR từng file đính kèm (PDF scan / ảnh)
      var atts = msgs[m].getAttachments();
      for (var a = 0; a < atts.length; a++) {
        var blob = atts[a];
        var ct = blob.getContentType() || '';
        if (ct.indexOf('pdf') === -1 && ct.indexOf('image') === -1) continue;
        var text = ocrToText_(blob);
        var pro = extractPro_(text, carrier, po);
        if (pro) return { pro: pro, sawMail: true };
      }
    }
  }
  return { pro: '', sawMail: sawMail };
}


/** OCR 1 blob (PDF scan/ảnh) -> text, bằng Advanced Drive Service. */
function ocrToText_(blob) {
  var fileId = null;
  try {
    var res;
    if (typeof Drive.Files.create === 'function') {
      // Drive API v3
      res = Drive.Files.create(
        { name: 'ocr_temp_' + Date.now(), mimeType: 'application/vnd.google-apps.document' },
        blob,
        { ocrLanguage: 'en' }
      );
    } else {
      // Drive API v2
      res = Drive.Files.insert(
        { title: 'ocr_temp_' + Date.now(), mimeType: 'application/vnd.google-apps.document' },
        blob,
        { ocr: true, ocrLanguage: 'en' }
      );
    }
    fileId = res.id;
    var text = DocumentApp.openById(fileId).getBody().getText();
    Logger.log('OCR text (calib):\n' + text);  // xem log để chốt regex PRO
    return text;
  } catch (e) {
    Logger.log('OCR lỗi: ' + e.message);
    return '';
  } finally {
    if (fileId) { try { Drive.Files.remove(fileId); } catch (e2) {} }
  }
}


/**
 * Trích PRO từ text (OCR hoặc nội dung mail). Chung cho MỌI carrier — dựa vào VỊ TRÍ, không cần tên hãng.
 *
 * ⭐ THỰC TẾ: gần như MỌI số PRO Mario gửi qua mail đều ở dạng TEM DÁN đè lên BOL, nằm trong VÙNG carrier
 *   (bên phải ô SHIP TO, quanh "Pro number".."Freight Charge"); ô "Pro number" thường ĐỂ TRỐNG.
 *
 * ƯU TIÊN 1 — ô "Pro number" nếu CÓ điền sẵn số: lấy luôn.
 * ƯU TIÊN 2 — VÙNG tem: khoanh "Pro number"|"SCAC"|"SHIP TO" .. "Freight Charge", bỏ SĐT + số có nhãn
 *   không-PRO (Pick Up#/BOL#/Trailer/Seal/SID/CID/NMFC/CFR/USC) + số PO, lấy dãy DÀI NHẤT còn lại (>=7 số).
 *   -> số PRO trên tem (dài nhất) thắng, không bị nhầm với Pick Up#/SĐT/tariff. Áp dụng MỌI carrier.
 * ƯU TIÊN 3 (dự phòng) — neo theo chữ "SHIPPER LABEL"/"Central Transport" nếu không khoanh được vùng.
 *
 * Bắt số chịu khoảng trắng + gạch ngang (-, –, —): "50597918 - 7" -> "50597918-7"; "101-1234567"; "496401068".
 * Không tìm được -> '' (WAIT, KHÔNG đoán bừa).
 *
 * ⚠️ GIỚI HẠN OCR: số PRO in trên tem (nhất là nền vàng Central Transport) đôi khi OCR đọc SAI chữ số.
 *   Nếu sai, chạy TEST_ocrFile để xem text OCR thật của Drive rồi tinh chỉnh, hoặc nhập tay số đó.
 */
function extractPro_(text, carrier, po) {
  if (!text) return '';
  var t = text.replace(/[\r\n]+/g, ' ');
  // Loại nhiễu placeholder "B A R C O D E   S P A C E" (hay xen giữa nhãn và số)
  t = t.replace(/B\s*A\s*R\s*C\s*O\s*D\s*E\s*S\s*P\s*A\s*C\s*E/gi, ' ');

  function clean(s) { return s.replace(/\s+/g, '').replace(/[–—]/g, '-').replace(/-+/g, '-'); }
  function nDigits(s) { return s.replace(/\D/g, '').length; }
  var NUM = '[0-9]{3,}(?:\\s*[-–—]\\s*[0-9]+)*';   // dãy số, cho phép gạch ngang có/không khoảng trắng

  // Chọn PRO trong 1 đoạn text: bỏ SĐT + số CÓ NHÃN không-PRO (Pick Up#/BOL#/Trailer/Seal/SID/CID/NMFC/CFR/USC) + số PO,
  // rồi lấy dãy số DÀI NHẤT (>=7 số). Số PRO trên tem luôn là dãy dài nhất còn lại trong vùng.
  function pickPro(seg) {
    if (!seg) return '';
    seg = seg.replace(/(?:phone|ph|tel)[^0-9]{0,15}\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/gi, ' ');
    seg = seg.replace(/(?:pick\s*up|pickup|bill\s*of\s*lading(?:\s*number)?|trailer(?:\s*number)?|seal(?:\s*number)?s?|sid|cid|nmfc|cfr|u\.?s\.?c\.?)\s*#?[^0-9]{0,12}[0-9]{2,}(?:-[0-9]+)*/gi, ' ');
    if (po) seg = seg.split(String(po)).join(' ');
    var arr = seg.match(new RegExp(NUM, 'g')) || [], best = '', bestLen = -1;
    arr.forEach(function (s) { var c = clean(s), d = nDigits(c); if (d >= 7 && d > bestLen) { bestLen = d; best = c; } });
    return best;
  }

  // ƯU TIÊN 1: ô "Pro number" có ĐIỀN SẴN số -> lấy luôn (cho phép <=15 ký tự không-số xen giữa).
  var mm = t.match(new RegExp('pro\\s*(?:bill\\s*)?(?:number|numbe?r|no\\.?|nbr|num|#)[^0-9]{0,15}(' + NUM + ')', 'i'));
  if (mm) { var cand = clean(mm[1]); if (nDigits(cand) >= 6) return cand; }

  // ƯU TIÊN 2: TEM DÁN PRO trong VÙNG carrier (bên phải SHIP TO).
  //   ⭐ MỌI số PRO Mario gửi qua mail đều ở dạng TEM DÁN nằm trong vùng này; ô "Pro number" thường TRỐNG.
  //   Khoanh vùng: đầu = "Pro number" | "SCAC" | "SHIP TO" (chọn cái tìm thấy trước theo thứ tự hẹp dần);
  //   cuối = "Freight Charge" (hoặc +700 ký tự). pickPro() trong vùng -> dãy dài nhất còn lại = PRO trên tem.
  var startIdx = -1, starts = [/pro\s*number/i, /\bscac\b/i, /ship\s*to/i];
  for (var i = 0; i < starts.length && startIdx < 0; i++) { var mS = t.match(starts[i]); if (mS) startIdx = mS.index; }
  if (startIdx < 0) startIdx = 0;
  var endM = t.slice(startIdx).match(/freight\s*charge/i);
  var region = t.substr(startIdx, endM ? endM.index + 15 : 700);
  var p = pickPro(region);
  if (p) return p;

  // ƯU TIÊN 3 (dự phòng): neo theo chữ trên tem nếu vùng trên không khoanh được.
  var ks = t.match(/shipper\s*label|acknowledges\s+receipt\s+of\s+freight|central\s*transport|centraltransport/i);
  if (ks) return pickPro(t.substr(Math.max(0, ks.index - 120), 400));

  return '';
}

function _mproToast(msg) {
  try { SpreadsheetApp.getActive().toast(msg, '📧 PRO Mario', 5); } catch (e) {}
}


// =============== TEST (không cần chờ mail thật) ===============
// Cách dùng: tải 1 file mẫu Mario lên Drive -> lấy fileId (trong URL .../d/<ID>/view)
// -> dán vào TEST_FILE_ID -> Save -> chọn hàm TEST_ocrFile -> Run -> xem Execution log.
// Kỳ vọng: CTII -> 496401068 ; SEFL -> 50597918-7.
var TEST_FILE_ID = 'PASTE_DRIVE_FILE_ID_HERE';
var TEST_CARRIER = 'CTII';   // đổi thành carrier của file test (CTII / SEFL / ...)
var TEST_PO      = '';       // (tùy chọn) số PO của file test — giúp fallback loại đúng số PO

function TEST_ocrFile() {
  var blob = DriveApp.getFileById(TEST_FILE_ID).getBlob();
  var text = ocrToText_(blob);                 // ocrToText_ đã Logger.log nguyên văn text OCR
  Logger.log('====> PRO trích được: "' + extractPro_(text, TEST_CARRIER, TEST_PO) + '"');
}

// Test nhanh extractPro_ với chuỗi text tự nhập (không cần OCR) — dán text mẫu vào để thử regex.
function TEST_extractFromText() {
  var samples = [
    { po: '25588834', carrier: 'CTII', text: 'CARRIER NAME: Central Transport SCAC: CTII Pro number: 496401068  Freight Charge Terms' },
    { po: '23456789', carrier: 'SEFL', text: 'SCAC: SEFL Pro number: 50597918 - 7  BARCODE SPACE' },
    { po: '23456789', carrier: 'EXLA', text: 'SCAC: EXLA Pro number: 101-1234567 CID#' }
  ];
  samples.forEach(function (s) {
    Logger.log(s.carrier + ' -> "' + extractPro_(s.text, s.carrier, s.po) + '"');
  });
}
