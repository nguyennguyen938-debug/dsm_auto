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
  /* 🔄 ĐỔI 11/08/2026: dùng danh sách LOẠI TRỪ thay cho danh sách trắng.
   * Người dùng chốt: lấy PRO qua mail cho MỌI carrier, trừ ba cái dưới đây.
   * Danh sách trắng cũ (`SEFL/CTII/FXFE/ABFS/EXLA`) bỏ sót các mã người nhập tay
   * đang có thật trong sheet: `XGS` · `AAA` · `LTL` · `BRAUNS EXP`.
   * Cách này còn tự phủ luôn carrier mới mà không phải sửa code. */
  CARRIERS_BO_QUA: [
    'AACT',   // PRO có ngay lúc Finalize trên aaacooper.com
    'AAA',    // thực chất là AACT, người nhập viết tắt khác (chốt 11/08)
    'CTII',   // PRO có sẵn khi tạo BOL
    'UPS',    // đơn Ground — số là tracking UPS, không do Mario gửi
    'XGSI',   // đã có TraPRO.gs tra online (trigger 15')
    'XGS',    // biến thể người nhập tay của XGSI
    'BXID',   // đã có TraPRO.gs tra online (trigger 15')
    'BRAUNS EXP'  // chốt 11/08 — không lấy PRO qua mail
  ],
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
    var coMailChuaDoc = [], chuaCoMail = [];

    for (var i = 0; i < values.length; i++) {
      var rowNum = startRow + i;
      var po = String(values[i][MPRO_CFG.COL_PO - 1]).trim();
      var carrier = String(values[i][MPRO_CFG.COL_CARRIER - 1] || '').trim().toUpperCase();
      var proCell = String(values[i][MPRO_CFG.COL_PRO - 1] || '').trim();

      if (!po) continue;
      if (!carrier) continue;                                        // chưa có carrier -> chưa biết
      if (MPRO_CFG.CARRIERS_BO_QUA.indexOf(carrier) !== -1) continue;  // nhóm KHÔNG qua mail
      if (/^\d[\d\- ]*$/.test(proCell)) continue;                 // đã có PRO thật (số/gạch) -> bỏ qua
      // (proCell rỗng hoặc là marker 'CHECK PRO...' -> vẫn thử lại)

      /* 🔄 ĐỔI LẠI VỀ ĐỌC MAIL — người dùng chốt 09/08/2026.
       * Từ 01/08 script đọc PRO từ folder Drive `SIGNED PRO#`; nay quay lại đọc mail
       * Mario reply về b2b@allforwood.com. **Thay hẳn**, không còn đọc Drive nữa
       * (người dùng chốt rõ: "không cần check trong drive").
       * `getProFromSignedFolder()` giữ lại làm tư liệu, xem chú thích ở hàm đó. */
      var res = getProFromMario(po, carrier);
      if (res.pro) {
        _mproGhiPro_(sheet, rowNum, res.pro); filled++;
        Logger.log('✅ ' + po + ' (' + carrier + ') hang ' + rowNum + ' -> PRO "' + res.pro + '"');
      } else if (res.sawMail) {
        // Mario ĐÃ reply nhưng chưa đọc được số -> đánh dấu để người kiểm tay
        _mproGhiPro_(sheet, rowNum, 'CHECK PRO: có mail, chưa đọc được số');
        coMailChuaDoc.push(po + ' (' + carrier + ')');
        Logger.log('⚠️ ' + po + ' (' + carrier + ') CO MAIL nhung KHONG doc duoc so');
      } else {
        chuaCoMail.push(po + ' (' + carrier + ')');
      }
      // Chưa có mail nào từ Mario -> ĐỂ TRỐNG, lần sau tự thử lại.
    }

    /* 🔴 LOG KẾT QUẢ, đừng chỉ toast.
     * `_mproToast` chỉ hiện khi có người đang MỞ sheet — mà hàm này chạy bằng trigger
     * 15 phút, tức gần như luôn chạy lúc không ai nhìn. Không log thì mỗi lần chạy chỉ
     * thấy một đống text OCR rồi hết, không biết đã điền được đơn nào (gặp 11/08). */
    Logger.log('--- checkMarioPro: dien ' + filled + ' | co mail chua doc duoc ' +
               coMailChuaDoc.length + ' | chua co mail ' + chuaCoMail.length + ' ---');
    if (coMailChuaDoc.length) Logger.log('   CAN XEM TAY: ' + coMailChuaDoc.join(', '));
    if (chuaCoMail.length) Logger.log('   cho Mario reply: ' + chuaCoMail.join(', '));
    if (filled > 0) _mproToast('Đã lấy PRO cho ' + filled + ' đơn (từ mail Mario).');
  } catch (e) {
    _mproToast('Lỗi lấy PRO: ' + e.message);
    throw e;
  } finally {
    lock.releaseLock();
  }
}


/**
 * Ghi PRO vào cột N dưới dạng TEXT.
 *
 * 🔴 KHÔNG dùng `setValue` trần. Cột N từng là chỗ duy nhất trong file này chưa ép
 *    kiểu, và PRO của nhiều carrier có dạng dễ bị Sheets nuốt:
 *      · số 0 đầu   `0123456`     -> thành `123456`
 *      · có gạch    `50597918-7`  -> có thể bị hiểu là công thức/ngày
 *    Cách đã kiểm chứng trong dự án (xem `_ghiText_` bên `NhanFile_Drive_WebApp.gs`):
 *    áp định dạng -> flush -> ghi -> flush -> ĐỌC LẠI KIỂM -> sai thì ghi lại kèm nháy đầu.
 *    Sai một chữ số PRO là tra cứu vận đơn ra rỗng, mà không ai biết.
 */
function _mproGhiPro_(sheet, rowNum, giaTri) {
  var o = sheet.getRange(rowNum, MPRO_CFG.COL_PRO);
  var mong = String(giaTri);
  o.setNumberFormat('@');
  SpreadsheetApp.flush();
  o.setValue(mong);
  SpreadsheetApp.flush();
  var that = o.getValue();
  if (that instanceof Date || String(that).trim() !== mong.trim()) {
    o.setNumberFormat('@').setValue("'" + mong);
    SpreadsheetApp.flush();
    Logger.log('_mproGhiPro_: hang ' + rowNum + ' bi ep kieu, da ghi lai kem nhay dau');
  }
}


/* ============================================================
 *  [KHÔNG CÒN DÙNG TỪ 09/08/2026 — giữ để tham khảo]
 *  LẤY PRO TỪ FOLDER  SIGNED PRO#   (đổi từ mail sang Drive — 01/08/2026)
 *
 *  ⚠️ Người dùng đã chốt quay lại đọc MAIL, bỏ hẳn đường Drive. Đừng gọi lại
 *     `getProFromSignedFolder()` trong `checkMarioPro()` nếu không có yêu cầu mới —
 *     hai nguồn cùng ghi cột N sẽ đè lên nhau.
 * ------------------------------------------------------------
 *  Cây folder:  THD Orders / <DD Mon YYYY> / PO - <số PO> / SIGNED PRO#
 *  Kho scan BOL đã ký (có tem PRO dán) rồi bỏ file vào SIGNED PRO#,
 *  thay cho việc reply mail như trước.
 *
 *  Trả { pro:'<số hoặc rỗng>', sawFile:<folder đã có file chưa> }
 *   -> phân biệt: kho chưa bỏ file (sawFile=false) vs có file mà OCR không ra (sawFile=true, pro='').
 * ============================================================ */
/** Bật để `ocrToText_` không in text OCR — dùng khi quét hàng loạt. */
var MPRO_IM_LANG = false;

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
 * ✅ ĐANG DÙNG (bật lại 09/08/2026).
 * Tìm mail Mario reply theo PO -> lấy PRO từ (1) nội dung mail, (2) OCR file đính kèm.
 *
 * ⚠️ Điều kiện để chạy đúng:
 *   · Script phải chạy bằng tài khoản nhận mail (`b2b@allforwood.com`) — Gmail chỉ
 *     tìm được trong hộp thư của chính tài khoản đang chạy script.
 *   · Chỉ tìm mail trong `MPRO_CFG.SEARCH_NEWER_THAN` (mặc định 30 ngày). Đơn cũ hơn
 *     sẽ không bao giờ lấy được PRO — đó là chủ ý, để khỏi quét cả hộp thư mỗi 15 phút.
 *   · Cần bật Advanced Service **Drive** (Services ▸ + ▸ Drive API) cho phần OCR.
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
      // `true` = CHẶT CHẼ: chỉ lấy khi mail ghi rõ "Pro number: <số>". Xem extractPro_.
      var proBody = extractPro_(msgs[m].getPlainBody() || '', carrier, po, true);
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
    // Chạy hàng loạt thì mỗi file in cả trang text -> tràn log, không đọc nổi kết quả.
    if (!MPRO_IM_LANG) Logger.log('OCR text (calib):\n' + text);
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
function extractPro_(text, carrier, po, chatChe) {
  if (!text) return '';
  var t = text.replace(/[\r\n]+/g, ' ');
  // Loại nhiễu placeholder "B A R C O D E   S P A C E" (hay xen giữa nhãn và số)
  t = t.replace(/B\s*A\s*R\s*C\s*O\s*D\s*E\s*S\s*P\s*A\s*C\s*E/gi, ' ');

  function clean(s) { return s.replace(/\s+/g, '').replace(/[–—]/g, '-').replace(/-+/g, '-'); }
  function nDigits(s) { return s.replace(/\D/g, '').length; }
  var NUM = '[0-9]{3,}(?:\\s*[-–—]\\s*[0-9]+)*';   // dãy số, cho phép gạch ngang có/không khoảng trắng

  // Chọn PRO trong 1 đoạn text: bỏ SĐT + số CÓ NHÃN không-PRO (Pick Up#/BOL#/Trailer/Seal/SID/CID/NMFC/CFR/USC) + số PO,
  // rồi lấy dãy số DÀI NHẤT (>=7 số). Số PRO trên tem luôn là dãy dài nhất còn lại trong vùng.
  /* ⚠️ BẪY của bộ lọc "bỏ số có nhãn": nhãn `pick up` cho phép tối đa 12 ký tự không-số
   *    xen giữa, nên nếu chuỗi "CARRIER SIGNATURE/PICKUP DATE" nằm SÁT số PRO thì cả số
   *    PRO cũng bị xoá theo. Trên BOL thật hai thứ đó cách nhau một đoạn dài (câu
   *    "Carrier acknowledges receipt of packages...") nên không xảy ra — nhưng nếu đổi
   *    mẫu BOL mà PRO rơi ngay sau "PICKUP DATE" thì đây là chỗ sẽ hỏng trước tiên. */
  function pickPro(seg) {
    if (!seg) return '';
    seg = seg.replace(/(?:phone|ph|tel)[^0-9]{0,15}\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/gi, ' ');
    /* 🔴 SỐ ĐIỆN THOẠI KHÔNG PHẢI LÚC NÀO CŨNG CÓ NHÃN "phone".
     *    Đo thật 11/08/2026, đơn FXFE 77834379: BOL ghi
     *        "Contact: Mario-(762) 231-7977-info@allforwood.com"
     *    Bộ lọc trên đòi chữ phone/ph/tel nên không đụng tới, và vì ô Pro number trống
     *    + tem không đọc được, `231-7977` (7 chữ số) thành dãy dài nhất còn lại -> thắng.
     *    Số này in trên MỌI BOL của Mario, nên đây là lỗi hệ thống chứ không phải cá biệt.
     *    -> Loại theo DẠNG điện thoại, không cần nhãn. Chỉ nhận dạng có dấu hiệu rõ
     *       (ngoặc quanh mã vùng, hoặc đủ hai dấu phân cách) để không đụng nhầm số PRO
     *       10 chữ số viết liền. */
    seg = seg.replace(/\(\s*\d{3}\s*\)\s*\d{3}\s*[-.\s]\s*\d{4}/g, ' ');   // (762) 231-7977
    seg = seg.replace(/\b\d{3}[-.]\d{3}[-.]\d{4}\b/g, ' ');                    // 762-231-7977
    // Số đứng ngay sau "Contact:" — dòng này trên BOL luôn là người + điện thoại.
    seg = seg.replace(/contact\s*:?[^0-9]{0,25}[\d\s\-().]{7,22}/gi, ' ');
    seg = seg.replace(/(?:pick\s*up|pickup|bill\s*of\s*lading(?:\s*number)?|trailer(?:\s*number)?|seal(?:\s*number)?s?|sid|cid|nmfc|cfr|u\.?s\.?c\.?)\s*#?[^0-9]{0,12}[0-9]{2,}(?:-[0-9]+)*/gi, ' ');
    // Số đơn hàng của khách — KHÔNG phải PRO, và cũng dài 8–12 số nên rất dễ thắng nhầm.
    seg = seg.replace(/(?:customer\s*order(?:\s*number)?|order\s*number|internet\s*number|reference\s*number)\s*#?[^0-9]{0,12}[A-Za-z]?[0-9]{2,}(?:-[0-9]+)*/gi, ' ');
    /* 🔴 Xoá token dạng CHỮ+SỐ (`H1804-372261`, `WN65485409`, `0721CHA158139`).
     *    Bằng chứng 11/08/2026, BOL FedEx đơn 04577133: Customer Order là `H1804-372261`
     *    -> phần `1804-372261` cũng 10 chữ số, ĐÚNG BẰNG số PRO thật `667123370-4`.
     *    Cái nào đứng trước trong text OCR thì cái đó thắng, tức kết quả tuỳ may rủi.
     *    ⚠️ Cố ý KHÔNG dùng lookbehind `(?<!...)` — cú pháp đó chỉ chạy trên runtime V8,
     *       gặp Rhino là hỏng cả file ngay lúc parse. Cách này chạy trên mọi runtime.
     *    An toàn với tem: số PRO luôn đứng tách khỏi chữ (`FedEx Freight 667123370-4`). */
    seg = seg.replace(/[A-Za-z]+[0-9][0-9\-–—]*/g, ' ');
    if (po) seg = seg.split(String(po)).join(' ');
    var arr = seg.match(new RegExp(NUM, 'g')) || [], best = '', bestLen = -1;
    // Trần 12 chữ số: dài hơn thế gần như chắc chắn là mã vạch hoặc số bị ghép.
    /* Ngưỡng 8–12 chữ số. Mọi số PRO thật gặp trong dự án đều >= 8:
     *   667123370-4(10) · 038-2942318(10) · 7258674345(10) · 496401068(9)
     *   50597918-7(9) · 36994324(8) · 036932957-5(10) · 101-1234567(10)
     * Ngưỡng 7 cũ để lọt đúng `231-7977` — phần đuôi số điện thoại của Mario. */
    arr.forEach(function (s) { var c = clean(s), d = nDigits(c); if (d >= 8 && d <= 12 && d > bestLen) { bestLen = d; best = c; } });
    return best;
  }

  /* ƯU TIÊN 1: ô "Pro number" có ĐIỀN SẴN số -> lấy luôn.
   *
   * 🔴 OCR HAY TÁCH RỜI TỪNG CHỮ SỐ — bằng chứng thật 09/08/2026, đơn FXFE 72691905:
   *      OCR ra:  "Pro number: 725 8 6 7 4 3 4 5"
   *      số thật: 7258674345
   *    Regex cũ đòi >=3 chữ số LIỀN NHAU nên chỉ bắt được "725", rồi loại vì <6 số,
   *    và đơn đó không bao giờ lấy được PRO dù mail có đủ thông tin.
   *    -> Sau nhãn "Pro number", gom MỌI chữ số kèm khoảng trắng/gạch cho tới khi gặp
   *       chữ cái. Gặp chữ cái là dừng, nên không nuốt sang số của dòng kế tiếp. */
  var mm = t.match(/pro\s*(?:bill\s*)?(?:number|numbe?r|no\.?|nbr|num|#)\s*[:.]?\s*((?:[0-9][\s\-–—]*){6,25})/i);
  if (mm) {
    var cand = clean(mm[1]);
    /* 🔴 TRẦN 12 CHỮ SỐ. Regex trên cố ý gom chữ số kèm khoảng trắng để cứu ca OCR
     *    tách rời (`725 8 6 7 4 3 4 5` -> `7258674345`). Nhưng khi TEM IN SỐ HAI LẦN
     *    thì nó gom luôn cả hai:
     *      đo thật 11/08/2026, đơn AAA 69766619 -> "3699432436994324-6" (17 chữ số)
     *      thực chất là "36994324" in liền "36994324-6".
     *    Không số PRO nào dài quá 12 chữ số -> quá trần thì đây chắc chắn là ghép bậy,
     *    bỏ và để các ưu tiên bên dưới xử lý. */
    if (nDigits(cand) >= 6 && nDigits(cand) <= 12) return cand;
  }

  // Dự phòng: dạng cũ (số liền nhau), phòng khi nhãn viết lạ mà regex trên trượt.
  var mm2 = t.match(new RegExp('pro\\s*(?:bill\\s*)?(?:number|numbe?r|no\\.?|nbr|num|#)[^0-9]{0,15}(' + NUM + ')', 'i'));
  // Cùng trần 12 chữ số như nhánh trên — nếu không, mã vạch 15 số vẫn lọt qua đây.
  if (mm2) { var cand2 = clean(mm2[1]); if (nDigits(cand2) >= 6 && nDigits(cand2) <= 12) return cand2; }

  /* 🔴 `chatChe` — DỪNG Ở ĐÂY, không suy đoán tiếp.
   *
   *    Dùng cho NỘI DUNG MAIL (body). Body không có cấu trúc BOL: không có ô
   *    "Pro number", không có tem, nhưng LẠI CÓ chữ ký của Mario kèm số điện thoại
   *    và đủ thứ số khác. Mọi luật dò vùng/tem bên dưới vì thế chỉ moi ra rác.
   *
   *    Bằng chứng thật 11/08/2026 — `TEST_taiCaPO` cho BA đơn khác nhau cùng ra
   *    `339-7275`:
   *        56560736 (SEFL) · 69970083 (CTII) · 71704813 (FXFE)
   *    Ba đơn khác hãng, khác BOL, không thể trùng số PRO. Nó đến từ chỗ giống nhau
   *    trong mọi mail — tức chữ ký, không phải BOL.
   *    Và vì body được thử TRƯỚC file đính kèm, số rác đó thắng luôn số PRO thật.
   *
   *    -> Body: chỉ nhận khi có nhãn "Pro number" rõ ràng. File OCR: dùng đủ 4 ưu tiên. */
  if (chatChe) return '';

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

  /* ƯU TIÊN 3: neo theo chữ trên TEM nếu vùng ở ưu tiên 2 không chứa số.
   *
   * 🔴 Tem dán KHÔNG phải lúc nào cũng nằm giữa "Pro number" và "Freight Charge".
   *    Bằng chứng thật 11/08/2026 (BOL FedEx, đơn 04577133): ô `Pro number` để TRỐNG,
   *    còn số thật `667123370-4` in trên tem FedEx ở góc phải — OCR đọc nó ra ngoài
   *    vùng khoanh, nên ưu tiên 2 trả rỗng.
   *    -> Neo thêm theo TÊN HÃNG in trên tem. Mỗi hãng một kiểu tem, nhưng tem nào
   *       cũng có logo/tên hãng ngay cạnh số. */
  var neo = /shipper\s*label|acknowledges\s+receipt\s+of\s+freight|central\s*transport|centraltransport|fed\s*ex|fedex|estes|saia|xpo|old\s*dominion|southeastern\s*freight|a\.?b\.?f\.?\s*freight|r\s*\+\s*l\s*carriers|ward\s*trucking|dayton\s*freight/gi;
  var m3, ungVien = [];
  while ((m3 = neo.exec(t)) !== null) {
    var p3 = pickPro(t.substr(Math.max(0, m3.index - 150), 450));
    if (p3) ungVien.push(p3);
  }
  if (ungVien.length) {
    // Nhiều neo có thể trỏ về cùng một số — lấy số xuất hiện quanh NHIỀU neo nhất,
    // hoà thì lấy số dài nhất. (Tên hãng thường in 2 lần: dòng CARRIER NAME và trên tem.)
    var dem = {};
    ungVien.forEach(function (v) { dem[v] = (dem[v] || 0) + 1; });
    var tot = '', diem = -1;
    Object.keys(dem).forEach(function (v) {
      var d = dem[v] * 100 + nDigits(v);
      if (d > diem) { diem = d; tot = v; }
    });
    return tot;
  }

  /* ƯU TIÊN 4 (cuối cùng): quét TOÀN BỘ text.
   *
   * ⚠️ Rộng nhất nên cũng dễ sai nhất — chỉ chạy khi ba bước trên đều trắng tay.
   *    An toàn nhờ `pickPro()` đã loại: SĐT, số PO, số có nhãn (Pick Up#/BOL#/Trailer/
   *    Seal/SID/CID/NMFC/USC/Customer Order), và `NUM` không bắt phần số của mã có chữ
   *    đứng trước. Còn lại thường chỉ mỗi số trên tem là dài >= 7.
   *    Vẫn có thể nhầm nếu BOL xuất hiện một dãy số lạ dài hơn — chấp nhận, vì đằng nào
   *    bỏ trống thì đơn cũng bị bỏ quên, mà số sai thì người kiểm sheet nhìn ra ngay. */
  return pickPro(t);
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

/**
 * DIAG — kiểm đường mail có hoạt động không, KHÔNG ghi gì vào sheet.
 * Chạy cái này TRƯỚC khi bật lại trigger, để chắc script tìm được mail Mario.
 */
function DIAG_mailMario() {
  var ss = SpreadsheetApp.openById(MPRO_CFG.SHEET_ID);
  var sheet = ss.getSheetByName(MPRO_CFG.SHEET_NAME);
  var startRow = MPRO_CFG.HEADER_ROWS + 1;
  var lastRow = sheet.getLastRow();
  var maxCol = Math.max(MPRO_CFG.COL_PO, MPRO_CFG.COL_CARRIER, MPRO_CFG.COL_PRO);
  var values = sheet.getRange(startRow, 1, lastRow - MPRO_CFG.HEADER_ROWS, maxCol).getValues();

  // 1) Hộp thư có mail nào từ Mario không (không lọc theo PO)
  var q = 'from:' + MPRO_CFG.MARIO_EMAIL + ' newer_than:' + MPRO_CFG.SEARCH_NEWER_THAN;
  var th = GmailApp.search(q, 0, 20);
  Logger.log('Tai khoan dang chay: ' + Session.getActiveUser().getEmail());
  Logger.log('Tim "' + q + '" -> ' + th.length + ' thread');

  // 2) Đếm đơn đang chờ PRO, và thử 3 đơn đầu xem có mail khớp PO không
  var cho = [];
  for (var i = 0; i < values.length; i++) {
    var po = String(values[i][MPRO_CFG.COL_PO - 1]).trim();
    var carrier = String(values[i][MPRO_CFG.COL_CARRIER - 1] || '').trim().toUpperCase();
    var proCell = String(values[i][MPRO_CFG.COL_PRO - 1] || '').trim();
    if (!po || !carrier || MPRO_CFG.CARRIERS_BO_QUA.indexOf(carrier) !== -1) continue;
    if (/^\d[\d\- ]*$/.test(proCell)) continue;
    cho.push({ po: po, carrier: carrier });
  }
  Logger.log('Dang cho PRO: ' + cho.length + ' don (carrier ' + 'moi carrier tru ' + MPRO_CFG.CARRIERS_BO_QUA.join('/') + ')');
  for (var k = 0; k < Math.min(3, cho.length); k++) {
    var r = getProFromMario(cho[k].po, cho[k].carrier);
    Logger.log('  PO ' + cho[k].po + ' (' + cho[k].carrier + ') -> co mail: ' + r.sawMail +
               ' | PRO doc duoc: "' + r.pro + '"');
  }
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

/**
 * DIAG — thử ĐÚNG MỘT PO, không ghi gì vào sheet.
 * Đổi hai giá trị dưới rồi Run, xem Execution log.
 * Log sẽ in cả text OCR thật (dòng "OCR text (calib)") — nếu PRO đọc ra sai,
 * gửi đoạn text đó đi thì chỉnh được trúng, khỏi phải đoán.
 */
var DIAG_PO      = '04577133';
var DIAG_CARRIER = 'FXFE';

function DIAG_motPO() {
  var r = getProFromMario(DIAG_PO, DIAG_CARRIER);
  Logger.log('PO ' + DIAG_PO + ' (' + DIAG_CARRIER + ')');
  Logger.log('   co mail tu Mario : ' + r.sawMail);
  Logger.log('   PRO doc duoc     : "' + r.pro + '"');
}


/* ============================================================================
 *  TEST_taiCaPO — quét MỌI đơn thuộc nhóm lấy PRO qua mail, KHÔNG GHI GÌ.
 * ----------------------------------------------------------------------------
 *  Khác `checkMarioPro` ở chỗ quan trọng nhất: hàm chính **bỏ qua đơn đã có PRO**,
 *  nên nó không bao giờ phát hiện được ca tool đọc ra số KHÁC với số người điền tay.
 *  Hàm này kiểm cả những đơn đó -> đối chiếu được độ chính xác thật.
 *
 *  Năm nhóm kết quả:
 *    ✅ KHOP        cột N đã có số, tool đọc ra ĐÚNG số đó      -> yên tâm
 *    🔴 LECH        cột N có số, tool đọc ra SỐ KHÁC            -> NGUY HIỂM, xem ngay
 *    🆕 SE DIEN     cột N trống/marker, tool đọc được           -> chạy checkMarioPro là xong
 *    ⚠️ KHONG DOC   có mail Mario nhưng không moi ra số         -> cần chỉnh extractPro_
 *    ⏳ CHUA CO MAIL Mario chưa reply                            -> bình thường, chờ
 *
 *  ⏱️ Apps Script chết ở 6 phút, mà mỗi lần OCR mất ~5 giây. Vì vậy chạy THEO LÔ:
 *     đặt `TEST_TU = 0` chạy lần đầu, log sẽ báo số bắt đầu cho lô kế tiếp.
 * ==========================================================================*/

var TEST_TU       = 0;    // bắt đầu từ đơn thứ mấy (0 = đầu danh sách)
var TEST_MOI_LUOT = 12;   // số đơn mỗi lượt — giảm xuống nếu bị "Exceeded maximum execution time"

function TEST_taiCaPO() {
  var batDau = new Date().getTime();
  MPRO_IM_LANG = true;                       // đừng in text OCR, sẽ tràn log
  try {
    var sheet = SpreadsheetApp.openById(MPRO_CFG.SHEET_ID).getSheetByName(MPRO_CFG.SHEET_NAME);
    var startRow = MPRO_CFG.HEADER_ROWS + 1;
    var lastRow = sheet.getLastRow();
    var maxCol = Math.max(MPRO_CFG.COL_PO, MPRO_CFG.COL_CARRIER, MPRO_CFG.COL_PRO);
    var values = sheet.getRange(startRow, 1, lastRow - MPRO_CFG.HEADER_ROWS, maxCol).getValues();

    // Lấy MỌI đơn thuộc nhóm mail, kể cả đơn đã có PRO.
    var ds = [];
    for (var i = 0; i < values.length; i++) {
      var po = String(values[i][MPRO_CFG.COL_PO - 1]).trim();
      var carrier = String(values[i][MPRO_CFG.COL_CARRIER - 1] || '').trim().toUpperCase();
      if (!po || !carrier || MPRO_CFG.CARRIERS_BO_QUA.indexOf(carrier) !== -1) continue;
      ds.push({ po: po, carrier: carrier, row: startRow + i,
                proCu: String(values[i][MPRO_CFG.COL_PRO - 1] || '').trim() });
    }

    Logger.log('TONG CONG ' + ds.length + ' don thuoc nhom lay PRO qua mail (' +
               'moi carrier tru ' + MPRO_CFG.CARRIERS_BO_QUA.join('/') + ')');
    var het = Math.min(TEST_TU + TEST_MOI_LUOT, ds.length);
    Logger.log('Lo nay: don ' + (TEST_TU + 1) + '–' + het + '\n');

    var khop = [], lech = [], lechDang = [], seDien = [], khongDoc = [], chuaMail = [];
    var dungSom = false;

    for (var k = TEST_TU; k < het; k++) {
      // Dừng sớm ở 4.5 phút để kịp in báo cáo trước khi Apps Script cắt ở 6 phút.
      if (new Date().getTime() - batDau > 270000) { dungSom = true; het = k; break; }

      var x = ds[k];
      var r = getProFromMario(x.po, x.carrier);
      var coSoCu = /^\d[\d\- ]*$/.test(x.proCu);       // cột N đang là số thật (không phải marker)

      if (r.pro && coSoCu) {
        /* So SỐ, không so định dạng. `50597922-5` và `505979225` là CÙNG một PRO,
         * chỉ khác chỗ đặt dấu gạch — gộp chung với lệch số thật thì báo cáo đầy
         * nhiễu và che mất ca thực sự sai (gặp 11/08: 2/7 "lệch" chỉ là dấu gạch). */
        var soTool = r.pro.replace(/\D/g, ''), soCu = x.proCu.replace(/\D/g, '');
        if (soTool === soCu) {
          if (r.pro.replace(/\s/g, '') === x.proCu.replace(/\s/g, '')) khop.push(x.po);
          else lechDang.push(x.po + ' (' + x.carrier + ') hang ' + x.row +
                             ': sheet "' + x.proCu + '"  vs  tool "' + r.pro + '"  (CUNG SO)');
        } else {
          lech.push(x.po + ' (' + x.carrier + ') hang ' + x.row +
                    ': sheet "' + x.proCu + '"  vs  tool "' + r.pro + '"');
        }
      } else if (r.pro) {
        seDien.push(x.po + ' (' + x.carrier + ') -> "' + r.pro + '"');
      } else if (r.sawMail) {
        khongDoc.push(x.po + ' (' + x.carrier + ')' + (coSoCu ? ' [sheet dang co "' + x.proCu + '"]' : ''));
      } else {
        chuaMail.push(x.po + ' (' + x.carrier + ')');
      }
    }

    Logger.log('================ KET QUA ================');
    Logger.log('✅ KHOP        : ' + khop.length);
    Logger.log('🟡 LECH DANG   : ' + lechDang.length + '   (cung so, khac dau gach)');
    Logger.log('🔴 LECH SO     : ' + lech.length + '   <-- chi cai nay moi dang lo');
    Logger.log('🆕 SE DIEN     : ' + seDien.length);
    Logger.log('⚠️ KHONG DOC   : ' + khongDoc.length);
    Logger.log('⏳ CHUA CO MAIL: ' + chuaMail.length);
    if (lech.length)     { Logger.log('\n🔴 LECH SO — XEM NGAY:');   lech.forEach(function (v) { Logger.log('   ' + v); }); }
    if (lechDang.length) { Logger.log('\n🟡 Khac dau gach (cung so):'); lechDang.forEach(function (v) { Logger.log('   ' + v); }); }
    if (khongDoc.length) { Logger.log('\n⚠️ CO MAIL MA KHONG DOC DUOC:'); khongDoc.forEach(function (v) { Logger.log('   ' + v); }); }
    if (seDien.length)   { Logger.log('\n🆕 SE DIEN duoc:');          seDien.forEach(function (v) { Logger.log('   ' + v); }); }
    if (chuaMail.length) Logger.log('\n⏳ Cho Mario reply: ' + chuaMail.join(', '));

    if (het < ds.length) {
      Logger.log('\n➡️ CON ' + (ds.length - het) + ' don. Dat TEST_TU = ' + het + ' roi Run lai.' +
                 (dungSom ? '  (lo nay dung som vi gan het 6 phut)' : ''));
    } else {
      Logger.log('\n✅ DA QUET HET ' + ds.length + ' don.');
    }
  } finally {
    MPRO_IM_LANG = false;      // trả lại mặc định, kẻo DIAG sau này không thấy text OCR
  }
}

/** In text OCR của MỘT đơn — dùng khi TEST_taiCaPO báo "KHONG DOC" hoặc "LECH". */
function TEST_xemOcrMotPO() {
  MPRO_IM_LANG = false;
  var r = getProFromMario(DIAG_PO, DIAG_CARRIER);
  Logger.log('==> PO ' + DIAG_PO + ' | co mail: ' + r.sawMail + ' | PRO: "' + r.pro + '"');
}
