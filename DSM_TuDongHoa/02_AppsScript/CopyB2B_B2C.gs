/**
 * ============================================================================
 *  CopyB2B_B2C.gs — tự động tách đơn từ `Order List` sang hai sheet B2B / B2C
 * ----------------------------------------------------------------------------
 *  Luật phân loại (người dùng chốt 09/08/2026):
 *      carrier === 'UPS'  ->  sheet **B2C**
 *      carrier khác UPS   ->  sheet **B2B**   (kể cả chuỗi `NULL`)
 *      carrier TRỐNG      ->  BỎ QUA, chờ lần quét sau
 *
 *  Còn **chép những cột nào** thì lại là chuyện khác, ba mức — xem bảng ở
 *  `CB_COT_KHONG_COPY` / `CB_COT_COPY_NULL` bên dưới.
 *
 *  Chạy bằng **trigger định kỳ 10–15 phút** (không phải web app), nên chỉ cần
 *  Save là có hiệu lực — KHÔNG phải Deploy ▸ New version.
 *  Cài trigger: Apps Script ▸ Triggers ▸ Add Trigger ▸ `copyB2B_B2C`
 *               ▸ Time-driven ▸ Minutes timer ▸ Every 15 minutes.
 *
 *  🔴 BỐN ĐIỀU PHẢI GIỮ, mỗi điều là một lỗi đã trả giá trong dự án này:
 *
 *  1. **PO và ngày phải ghi dạng TEXT.** `setNumberFormat('@')` rồi `setValue`
 *     KHÔNG ĐỦ — bằng chứng 06/08/2026: gửi chuỗi `'08/07/2026'`, đọc lại ra kiểu
 *     Date. Phải: áp định dạng -> flush -> ghi -> flush -> **đọc lại kiểm** -> sai
 *     thì ghi lại kèm dấu nháy đầu. Xem `_ghiTextVung_()` bên dưới.
 *     Mất số 0 đầu của PO là lệch tên folder Drive và `fillRow` không tìm thấy hàng.
 *
 *  2. **Đổi carrier phải XOÁ khỏi sheet cũ.** Đơn Ground lúc đầu trống cột C, sau
 *     điền `UPS`; hoặc người dùng sửa `SEFL` thành `UPS`. Không xoá thì đơn nằm ở
 *     CẢ HAI sheet, và người đọc sheet sẽ làm trùng.
 *
 *  3. **So PO bằng chuỗi đã `.trim()`.** Thực tế có ô dính dấu cách thừa (đã gặp với
 *     tên folder Drive `"PO - 02562579 "`). So bằng số sẽ mất số 0 đầu.
 *
 *  4. **Không dùng `getSheetByName`** — người dùng đưa gid, mà tên sheet thì đổi
 *     lúc nào không biết. Tra theo gid ổn định hơn.
 * ==========================================================================*/

var CB_SS_ID     = '1Fzwr2GDHOHxMgqPNf-Ksf6qJ5IIl3mNzrOQrHqH57fo';
var CB_TAB_GOC   = 'Order List';
var CB_HANG_HEAD = 6;            // header ở hàng 6, data từ hàng 7
var CB_SO_COT    = 17;           // A..Q — vùng copy chính

/**
 * 🔄 CỘT T = "B2B and B2C" — người dùng chốt 11/08/2026.
 *
 * Đơn có **SKU hỗn hợp** (một phần thuộc luồng B2B, một phần B2C — ví dụ một SKU lấy
 * ở kho Calhoun còn SKU kia ở kho Lecangs) thì KHÔNG xử lý, chỉ tích `X` vào cột T.
 * Gặp dấu X, hàm này copy đơn sang **CẢ HAI** sheet và **chỉ chép A, B, T**.
 *
 * 🔴 Cột T phải được kiểm TRƯỚC cột C. Đơn hỗn hợp không được xử lý nên cột C của nó
 *    TRỐNG, mà luật cũ "cột C trống -> bỏ qua, chờ lượt sau" sẽ nuốt mất nó vĩnh viễn.
 *
 * ⚠️ T là cột thứ **20**, không phải 18 — R và S bỏ trống. Vùng copy chính vẫn là
 *    A..Q (17 cột), cột T đọc/ghi riêng, nên R/S không bao giờ bị chạm tới.
 */
var CB_COT_T    = 20;
var CB_TEN_COT_T = 'B2B and B2C';

/**
 * 🔄 CHỈ QUÉT N ĐƠN CUỐI — người dùng chốt 11/08/2026.
 *
 * Trước đây quét toàn bộ sheet (273 đơn) mỗi 15 phút. Apps Script cắt ở 6 phút, mà
 * mỗi hàng cập nhật phải `flush()` vài lần để ép TEXT -> chạy lâu và phần lớn là làm
 * lại việc cũ, vì đơn cũ gần như không đổi nữa.
 *
 * ⚠️ ĐÁNH ĐỔI PHẢI BIẾT: đơn nằm ngoài 40 hàng cuối sẽ KHÔNG được cập nhật nữa.
 *    Nếu PRO về muộn (cột N) hay ai sửa tay ở `Order List` cho một đơn cũ, hai sheet
 *    B2B/B2C sẽ giữ số liệu cũ. Cần đồng bộ lại toàn bộ thì đặt `CB_SO_DON_QUET = 0`
 *    rồi chạy tay `copyB2B_B2C` một lần.
 */
var CB_SO_DON_QUET = 40;      // 0 = quét hết

var CB_GID_B2B = 1948139859;
var CB_GID_B2C = 768845312;

/** Cột (1-based) trong vùng A..Q cần ép TEXT: B = PO, K = Pickup Schedule, N = PRO/Tracking. */
var CB_COT_TEXT = [2, 11, 14];

/**
 * 🔴 BA MỨC COPY KHÁC NHAU — người dùng chốt 11/08/2026 (bản chiều).
 *
 * Cột nào được chép sang sheet đích phụ thuộc vào **cột C của sheet gốc**:
 *
 * | Cột C ở `Order List` | Sheet đích | Chép những cột nào |
 * |---|---|---|
 * | `UPS`                | B2C | **TOÀN BỘ 17 cột** — không giữ lại gì |
 * | `NULL`               | B2B | **CHỈ A, B, P** (xem `CB_COT_COPY_NULL`) |
 * | carrier thật khác UPS| B2B | toàn bộ TRỪ C/L/N/O (`CB_COT_KHONG_COPY`) |
 *
 * Vì sao `NULL` lại hẹp đến thế: khâu chọn carrier cho đơn B2B đang tạm ngưng, nên
 * cột C ghi chuỗi `NULL` và phần lớn cột còn lại (carrier, lịch pickup, PRO#, pickup#)
 * chưa có nghĩa. Chép sang chỉ tổ đè lên những gì người dùng vừa nhập bên sheet đích,
 * cứ 15 phút một lần.
 *
 * Hàng ĐÃ CÓ bên sheet đích thì cột không-được-chép **giữ nguyên giá trị đang có**
 * (dù trống hay đã điền); hàng MỚI thì để trống.
 */
var CB_COT_KHONG_COPY = [3, 12, 14, 15];


/**
 * Với đơn `NULL`: **chỉ ba cột này** được chép — A (Order Date) · B (PO) · P (Link Drive).
 *
 * ⚠️ Cột P chỉ được chép **khi sheet gốc đã có link** ("link Drive sau khi tạo").
 *    Gốc trống mà vẫn chép thì sẽ xoá mất link bên sheet đích trong quãng thời gian
 *    giữa hai lần chạy — mà tool điền cột P sau khi `makeFolder` xong, nên quãng đó
 *    có thật. Cùng lý do đó áp cho A và B: trống thì giữ cũ, không ghi đè bằng rỗng.
 */
var CB_COT_COPY_NULL = [1, 2, 16];

/* ------------------------------------------------------------------ tiện ích --- */

function _cbSheetTheoGid_(ss, gid) {
  var ds = ss.getSheets();
  for (var i = 0; i < ds.length; i++) if (ds[i].getSheetId() === gid) return ds[i];
  throw new Error('Khong tim thay sheet co gid ' + gid +
                  '. Cac sheet hien co: ' + ds.map(function (s) { return s.getName() + '(' + s.getSheetId() + ')'; }).join(', '));
}

var _cbChuan_ = function (v) { return String(v === null || v === undefined ? '' : v).trim(); };

/**
 * Ghi một vùng 2 chiều, ép các cột trong `CB_COT_TEXT` thành TEXT thật.
 *
 * 🔴 Vì sao rườm rà thế này: xem điều 1 ở đầu file. Sheets ép kiểu ngay cả khi đã
 *    `setNumberFormat('@')`, vì định dạng chưa kịp áp trước lúc ghi. Đọc lại rồi
 *    sửa là cách duy nhất đã kiểm chứng.
 */
function _ghiTextVung_(sheet, hangDau, giaTri) {
  if (!giaTri.length) return;
  var vung = sheet.getRange(hangDau, 1, giaTri.length, CB_SO_COT);

  // 1) áp định dạng TEXT cho các cột nhạy cảm TRƯỚC khi ghi
  for (var i = 0; i < CB_COT_TEXT.length; i++) {
    sheet.getRange(hangDau, CB_COT_TEXT[i], giaTri.length, 1).setNumberFormat('@');
  }
  SpreadsheetApp.flush();

  // 2) ghi
  vung.setValues(giaTri);
  SpreadsheetApp.flush();

  // 3) ĐỌC LẠI KIỂM — ô nào bị Sheets ép sang Date/Number thì ghi lại kèm dấu nháy
  var doc = vung.getValues();
  var suaGi = [];
  for (var r = 0; r < doc.length; r++) {
    for (var k = 0; k < CB_COT_TEXT.length; k++) {
      var c = CB_COT_TEXT[k] - 1;
      var mong = _cbChuan_(giaTri[r][c]);
      var that = doc[r][c];
      if (!mong) continue;
      if (that instanceof Date || _cbChuan_(that) !== mong) {
        sheet.getRange(hangDau + r, c + 1).setNumberFormat('@').setValue("'" + mong);
        suaGi.push('hang ' + (hangDau + r) + ' cot ' + (c + 1));
      }
    }
  }
  if (suaGi.length) {
    SpreadsheetApp.flush();
    Logger.log('_ghiTextVung_: da sua ep kieu tai ' + suaGi.join(', '));
  }
}

/** Đọc sheet đích -> { hangHeader, hangDauData, mapPO: {po: soHang} }. */
function _cbDocDich_(sheet, header) {
  var soHang = sheet.getLastRow();

  // Dò hàng header trong 10 hàng đầu: hàng nào có ô khớp tiêu đề cột B của sheet gốc.
  var hangHeader = 0;
  if (soHang > 0) {
    var dau = sheet.getRange(1, 1, Math.min(10, soHang), CB_SO_COT).getValues();
    for (var i = 0; i < dau.length; i++) {
      for (var j = 0; j < dau[i].length; j++) {
        if (_cbChuan_(dau[i][j]).toUpperCase() === _cbChuan_(header[1]).toUpperCase() && _cbChuan_(header[1])) {
          hangHeader = i + 1; break;
        }
      }
      if (hangHeader) break;
    }
  }

  // Chưa có header -> tạo ở hàng 1, giữ đúng thứ tự cột của sheet gốc.
  if (!hangHeader) {
    sheet.getRange(1, 1, 1, CB_SO_COT).setValues([header]).setFontWeight('bold');
    SpreadsheetApp.flush();
    hangHeader = 1;
  }

  // Tiêu đề cột T — bổ sung nếu sheet đích chưa có (sheet cũ chỉ tới cột Q).
  if (!_cbChuan_(sheet.getRange(hangHeader, CB_COT_T).getValue())) {
    sheet.getRange(hangHeader, CB_COT_T).setValue(CB_TEN_COT_T).setFontWeight('bold');
  }

  var hangDauData = hangHeader + 1;
  var mapPO = {}, hangCu = {};
  if (soHang >= hangDauData) {
    /* Đọc NGUYÊN hàng A..Q của sheet đích (không chỉ cột B) — cần giữ lại giá trị của
     * các cột trong `CB_COT_KHONG_COPY`. Một lần đọc cho cả vùng, không tốn thêm lượt. */
    var vung = sheet.getRange(hangDauData, 1, soHang - hangDauData + 1, CB_SO_COT).getValues();
    for (var r = 0; r < vung.length; r++) {
      var po = _cbChuan_(vung[r][1]);          // cột B
      if (po) { mapPO[po] = hangDauData + r; hangCu[po] = vung[r]; }
    }
  }
  return { hangHeader: hangHeader, hangDauData: hangDauData, mapPO: mapPO, hangCu: hangCu };
}

/**
 * Ghi một đơn "vừa B2B vừa B2C" sang một sheet: **chỉ A, B và T**.
 * Hàng đã có thì không đụng cột nào khác; hàng mới thì các cột còn lại để trống.
 * Trả về số hàng đã ghi.
 */
function _cbGhiCaHai_(sheet, dich, header, po, ngay) {
  var row = dich.mapPO[po];
  if (!row) {
    row = Math.max(sheet.getLastRow() + 1, dich.hangDauData);
    var moi = [];
    for (var i = 0; i < CB_SO_COT; i++) moi.push('');
    moi[0] = ngay; moi[1] = po;
    _ghiTextVung_(sheet, row, [moi]);
    dich.mapPO[po] = row;
    dich.hangCu[po] = moi;
    sheet.getRange(row, CB_COT_T).setValue('X');
    return row;
  }

  /* 🔴 HÀNG ĐÃ CÓ: CHỈ chạm ĐÚNG hai ô — A (khi đang trống) và T. KHÔNG ghi lại cả hàng.
   *
   * Người dùng chốt 11/08/2026: tool xử lý đơn ghi kết quả THẲNG vào sheet B2B/B2C
   * (tracking, link Drive, BOL…), nên hàm này tuyệt đối không được đè lên đó.
   *
   * Bản trước ghi lại nguyên hàng bằng `dich.hangCu[po]` — giá trị đọc từ ĐẦU lượt chạy.
   * Nghe thì vô hại vì "ghi lại đúng cái đang có", nhưng nếu tool xử lý vừa ghi tracking
   * vào giữa lúc hàm này đang chạy thì nó **ghi đè bằng bản cũ hơn** và tracking biến mất.
   * Một lượt quét 40 đơn mất vài chục giây — thừa thời gian để chuyện đó xảy ra.
   * Chạm đúng ô cần chạm thì không có cửa cho lỗi ấy. */
  if (_cbChuan_(ngay) && !_cbChuan_(sheet.getRange(row, 1).getValue())) {
    sheet.getRange(row, 1).setNumberFormat('@').setValue(ngay);
  }
  sheet.getRange(row, CB_COT_T).setValue('X');
  return row;
}

/* --------------------------------------------------------------- hàm chính --- */

/**
 * Quét `Order List`, đẩy từng đơn sang B2B hoặc B2C theo cột C.
 * Chạy lại bao nhiêu lần cũng được (idempotent): đơn đã có thì cập nhật, chưa có thì thêm.
 */
/** Dấu nhận dạng bản code — đổi mỗi lần sửa, để đọc log là biết đang chạy bản nào. */
var CB_BAN = '2026-08-11f  (cot T=X -> CA HAI sheet chi A,B,T | NULL: A,B,P | UPS: toan bo)';

function copyB2B_B2C() {
  Logger.log('=== copyB2B_B2C  ban ' + CB_BAN + ' ===');
  var ss = SpreadsheetApp.openById(CB_SS_ID);
  var goc = ss.getSheetByName(CB_TAB_GOC);
  if (!goc) throw new Error('Khong thay tab "' + CB_TAB_GOC + '"');

  var soHang = goc.getLastRow();
  if (soHang <= CB_HANG_HEAD) { Logger.log('Sheet goc chua co du lieu'); return; }

  var header = goc.getRange(CB_HANG_HEAD, 1, 1, CB_SO_COT).getValues()[0];

  /* 🔴 KHÔNG TIN `getLastRow()` ĐỂ ĐỊNH VỊ ĐƠN CUỐI.
   *    Nó trả hàng cuối CÓ DỮ LIỆU, mà "dữ liệu" gồm cả ô từng gõ rồi xoá, ô chỉ có
   *    định dạng, hay công thức trả chuỗi rỗng. Sheet này có nhiều hàng trống phía dưới,
   *    nên `getLastRow()` dễ nhảy xuống xa hơn PO cuối cùng rất nhiều.
   *    Hậu quả nếu tin nó: "40 hàng cuối" rơi trúng vùng trống -> KHÔNG copy được đơn
   *    nào, mà log vẫn báo chạy bình thường. Lỗi im lặng, không ai biết.
   *    -> Quét ngược cột B (PO) từ dưới lên, lấy hàng cuối THỰC SỰ có PO. */
  var hangCuoiCoPO = 0;
  {
    var dauB = CB_HANG_HEAD + 1;
    if (soHang >= dauB) {
      var cotB = goc.getRange(dauB, 2, soHang - CB_HANG_HEAD, 1).getValues();
      for (var z = cotB.length - 1; z >= 0; z--) {
        if (_cbChuan_(cotB[z][0])) { hangCuoiCoPO = dauB + z; break; }
      }
    }
  }
  if (!hangCuoiCoPO) { Logger.log('Sheet goc khong co PO nao'); return; }
  if (hangCuoiCoPO !== soHang) {
    Logger.log('⚠️ getLastRow()=' + soHang + ' nhung PO cuoi cung o hang ' + hangCuoiCoPO +
               ' -> co ' + (soHang - hangCuoiCoPO) + ' hang trong phia duoi, da bo qua');
  }

  /* Chỉ lấy N hàng CUỐI (đơn mới nhất). `Math.max` để không đọc ngược lên vùng header
   * khi sheet còn ít hơn N đơn. */
  var hangDau = CB_HANG_HEAD + 1;
  if (CB_SO_DON_QUET > 0) hangDau = Math.max(hangDau, hangCuoiCoPO - CB_SO_DON_QUET + 1);
  var soDoc = hangCuoiCoPO - hangDau + 1;
  if (soDoc < 1) { Logger.log('Khong co hang nao de quet'); return; }
  var data = goc.getRange(hangDau, 1, soDoc, CB_SO_COT).getValues();
  var cotT = goc.getRange(hangDau, CB_COT_T, soDoc, 1).getValues();   // đọc riêng, xem CB_COT_T
  Logger.log('Quet ' + soDoc + ' hang (' + hangDau + '–' + hangCuoiCoPO + ')' +
             (CB_SO_DON_QUET > 0 ? ' — gioi han ' + CB_SO_DON_QUET + ' don cuoi' : ' — TOAN BO'));

  var shB2B = _cbSheetTheoGid_(ss, CB_GID_B2B);
  var shB2C = _cbSheetTheoGid_(ss, CB_GID_B2C);
  var dB2B  = _cbDocDich_(shB2B, header);
  var dB2C  = _cbDocDich_(shB2C, header);

  var themB2B = [], themB2C = [];
  var suaB2B = [], suaB2C = [];
  var boQua = 0, xoaNham = 0, caHai = 0;

  for (var i = 0; i < data.length; i++) {
    var hang = data[i];
    var po = _cbChuan_(hang[1]);          // cột B
    var carrier = _cbChuan_(hang[2]).toUpperCase();   // cột C
    if (!po) continue;

    /* 🔴 CỘT T TRƯỚC CỘT C. Đơn hỗn hợp chưa được xử lý nên cột C của nó TRỐNG; nếu
     * để luật "cột C trống -> bỏ qua" chạy trước thì đơn này không bao giờ được copy. */
    if (_cbChuan_(cotT[i][0]).toUpperCase() === 'X') {
      var ngayGoc = hang[0];
      _cbGhiCaHai_(shB2B, dB2B, header, po, ngayGoc);
      _cbGhiCaHai_(shB2C, dB2C, header, po, ngayGoc);
      Logger.log('   ' + po + ' [cot T = X: vao CA HAI sheet, chi A,B,T]');
      caHai++;
      continue;                            // KHÔNG xoá khỏi sheet nào — phải nằm ở cả hai
    }

    if (!carrier) { boQua++; continue; }  // chưa biết xếp vào đâu — chờ lần sau

    /* 🔄 `NULL` — thêm 11/08/2026 (TẠM THỜI).
     * Người dùng tạm ngưng khâu chọn carrier cho đơn B2B: `xu-ly-don.mjs` vẫn dựng BOL
     * nhưng ghi chuỗi `NULL` vào cột C thay cho mã hãng.
     *   · `NULL` là đơn B2B  -> copy sang sheet B2B như thường
     *   · nhưng cột Carrier bên sheet đích phải ĐỂ TRỐNG, không chép chữ "NULL" sang
     * Lý do cột C vẫn phải có chữ gì đó: ô trống là tín hiệu "chưa ai xử lý", để trống
     * thì tool sẽ dựng BOL lại lần nữa ở lượt chạy sau. */
    var laNull = (carrier === 'NULL');
    var laB2C = (carrier === 'UPS');
    var dich  = laB2C ? dB2C : dB2B;
    var nham  = laB2C ? dB2B : dB2C;      // sheet mà đơn KHÔNG được phép nằm

    /* 🔴 Đơn từng ở sheet kia (carrier vừa đổi, ví dụ trống -> UPS, hay SEFL -> UPS)
     *    thì phải XOÁ, nếu không nó nằm ở cả hai nơi và người đọc sheet sẽ làm trùng.
     *    Xoá NGAY từng hàng: số hàng của các đơn phía dưới sẽ đổi, nên phải đọc lại
     *    map sau khi xoá — làm gọn bằng cách xoá xong thì cập nhật lại map. */
    if (nham.mapPO[po]) {
      var shNham = laB2C ? shB2B : shB2C;
      shNham.deleteRow(nham.mapPO[po]);
      SpreadsheetApp.flush();
      var moi = _cbDocDich_(shNham, header);
      if (laB2C) dB2B = moi; else dB2C = moi;
      nham = laB2C ? dB2B : dB2C;
      xoaNham++;
    }

    /* Dựng hàng sẽ ghi sang sheet đích, theo BA MỨC COPY ở đầu file.
     *
     * Chép sang bản SAO rồi mới sửa: đụng thẳng `hang` là sửa luôn mảng đọc từ sheet
     * gốc, vòng lặp sau đọc lại sẽ thấy dữ liệu đã bị đổi.
     */
    var ghi  = hang.slice();
    var daCo = dich.mapPO[po];
    var cu   = daCo ? dich.hangCu[po] : null;

    if (laB2C) {
      // UPS -> chép TOÀN BỘ, không giữ lại cột nào.

    } else if (laNull) {
      /* NULL -> chỉ A, B, P. Mọi cột khác giữ nguyên bên đích (hàng mới thì trống).
       * Cột được phép chép mà GỐC ĐANG TRỐNG cũng giữ cũ — cột P chỉ có giá trị
       * sau khi `makeFolder` chạy xong, chép rỗng đè lên là mất link. */
      for (var ic = 0; ic < CB_SO_COT; ic++) {
        var duocChep = CB_COT_COPY_NULL.indexOf(ic + 1) >= 0;
        if (duocChep && _cbChuan_(hang[ic])) continue;         // gốc có -> chép
        ghi[ic] = cu ? cu[ic] : '';                            // còn lại -> giữ cũ / trống
      }

    } else {
      // Carrier thật khác UPS -> luật cũ: chép hết trừ C/L/N/O.
      for (var q = 0; q < CB_COT_KHONG_COPY.length; q++) {
        var ik = CB_COT_KHONG_COPY[q] - 1;                     // 1-based -> index
        ghi[ik] = cu ? cu[ik] : '';
      }
    }

    if (daCo) {
      Logger.log('   ' + po + ' [' + (laB2C ? 'UPS/B2C: chep toan bo'
                                    : laNull ? 'NULL/B2B: chi A,B,P'
                                             : carrier + '/B2B: tru C,L,N,O') + ']');
      (laB2C ? suaB2C : suaB2B).push({ hangDich: daCo, gt: ghi });
    } else {
      (laB2C ? themB2C : themB2B).push(ghi);
    }
  }

  // --- cập nhật hàng đã có (người dùng chốt: giữ hai sheet luôn khớp sheet gốc) ---
  _cbGhiSua_(shB2B, suaB2B);
  _cbGhiSua_(shB2C, suaB2C);

  // --- thêm hàng mới vào cuối ---
  if (themB2B.length) _ghiTextVung_(shB2B, Math.max(shB2B.getLastRow() + 1, dB2B.hangDauData), themB2B);
  if (themB2C.length) _ghiTextVung_(shB2C, Math.max(shB2C.getLastRow() + 1, dB2C.hangDauData), themB2C);

  Logger.log('copyB2B_B2C: B2B +' + themB2B.length + ' moi, ' + suaB2B.length + ' cap nhat | ' +
             'B2C +' + themB2C.length + ' moi, ' + suaB2C.length + ' cap nhat | ' +
             caHai + ' don cot T=X (ca hai sheet) | ' +
             boQua + ' don chua co carrier (bo qua) | ' + xoaNham + ' don doi sheet');
}

/** Ghi đè từng hàng đã tồn tại. Ghi từng hàng vì chúng nằm rải rác, không liền nhau. */
function _cbGhiSua_(sheet, ds) {
  for (var i = 0; i < ds.length; i++) _ghiTextVung_(sheet, ds[i].hangDich, [ds[i].gt]);
}

/* ----------------------------------------------------------------- trigger --- */

/**
 * Tạo trigger chạy `copyB2B_B2C` mỗi 15 phút.
 *
 * 🔴 XOÁ TRIGGER CŨ TRƯỚC KHI TẠO. Apps Script cho phép gắn NHIỀU trigger vào cùng
 *    một hàm mà không cảnh báo gì. Bấm Run hàm này hai lần là có hai trigger cùng
 *    chạy `copyB2B_B2C` song song -> hai lượt ghi đè lẫn nhau trên cùng dòng sheet.
 *    Vì vậy hàm này dọn sạch trước rồi mới tạo, và chạy lại bao nhiêu lần cũng an toàn.
 *
 * ⚠️ `everyMinutes()` chỉ nhận 1, 5, 10, 15, 30 — số khác Apps Script sẽ ném lỗi.
 *
 * Lần chạy đầu Google sẽ hỏi cấp quyền (script cần quyền quản lý trigger) — bấm
 * Review permissions và cho phép.
 */
function BAT_trigger() {   // = CAI_trigger, xem bí danh cuối file

  var cu = ScriptApp.getProjectTriggers();
  var daXoa = 0;
  for (var i = 0; i < cu.length; i++) {
    if (cu[i].getHandlerFunction() === 'copyB2B_B2C') { ScriptApp.deleteTrigger(cu[i]); daXoa++; }
  }
  ScriptApp.newTrigger('copyB2B_B2C').timeBased().everyMinutes(15).create();
  Logger.log('Da xoa ' + daXoa + ' trigger cu, tao 1 trigger moi: copyB2B_B2C moi 15 phut.');
  LIET_KE_trigger();
}

/**
 * TẮT đồng bộ: gỡ trigger của `copyB2B_B2C`.
 *
 * ⚠️ Tên cũ là `GO_trigger` ("gỡ" tiếng Việt) — đọc theo tiếng Anh thành "go/chạy",
 *    ngược hẳn việc nó làm. Đổi thành `TAT_trigger` cho khỏi bấm nhầm; giữ `GO_trigger`
 *    làm bí danh vì có thể đã quen tay.
 */
function TAT_trigger() {
  var cu = ScriptApp.getProjectTriggers(), n = 0;
  for (var i = 0; i < cu.length; i++) {
    if (cu[i].getHandlerFunction() === 'copyB2B_B2C') { ScriptApp.deleteTrigger(cu[i]); n++; }
  }
  Logger.log('Da GO (tat) ' + n + ' trigger cua copyB2B_B2C. Dong bo B2B/B2C DA DUNG.');
  LIET_KE_trigger();
}

/** Bí danh của `TAT_trigger` — giữ lại cho khỏi hụt tay. */
function GO_trigger() { TAT_trigger(); }

/** Bí danh cũ của `BAT_trigger`. */
function CAI_trigger() { BAT_trigger(); }

/** Xem project đang có những trigger nào — dùng để chắc không bị trùng. */
function LIET_KE_trigger() {
  var ds = ScriptApp.getProjectTriggers();
  if (!ds.length) { Logger.log('Project chua co trigger nao.'); return; }
  for (var i = 0; i < ds.length; i++) {
    Logger.log((i + 1) + '. ' + ds[i].getHandlerFunction() + '  [' + ds[i].getEventType() + ']');
  }
}

/**
 * 🔎 SO CẤU TRÚC CỘT của ba sheet. KHÔNG ghi gì.
 *
 * Cấu trúc chuẩn mà tool đang giả định:
 *   A..Q = 17 cột dữ liệu · R, S bỏ trống · T = "B2B and B2C"
 *
 * Sheet đích có cột lạ hoặc lệch thứ tự là hỏng lặng: `_ghiTextVung_` ghi theo **vị trí**
 * chứ không theo tên, nên một cột chèn thêm ở giữa sẽ đẩy mọi thứ sang phải một ô —
 * tracking rơi vào ô Pickup#, link Drive rơi vào Note, mà không có lỗi nào bật lên.
 */
function DIAG_soCot() {
  var ss = SpreadsheetApp.openById(CB_SS_ID);
  var goc = ss.getSheetByName(CB_TAB_GOC);
  var hGoc = goc.getRange(CB_HANG_HEAD, 1, 1, CB_COT_T).getValues()[0];

  Logger.log('=== "' + CB_TAB_GOC + '" (header hang ' + CB_HANG_HEAD + ') ===');
  for (var i = 0; i < hGoc.length; i++) {
    var t = _cbChuan_(hGoc[i]);
    if (t) Logger.log('  cot ' + (i + 1) + ' (' + String.fromCharCode(65 + i) + '): ' + t);
  }
  Logger.log('  -> so cot co tieu de: ' + hGoc.filter(function (x) { return _cbChuan_(x); }).length);

  [[CB_GID_B2B, 'B2B'], [CB_GID_B2C, 'B2C']].forEach(function (c) {
    var sh = _cbSheetTheoGid_(ss, c[0]);
    // dò hàng header: hàng đầu trong 10 hàng đầu có ô khớp tiêu đề cột B của sheet gốc
    var soHang = sh.getLastRow(), hh = 0;
    if (soHang > 0) {
      var dau = sh.getRange(1, 1, Math.min(10, soHang), CB_COT_T).getValues();
      for (var r = 0; r < dau.length && !hh; r++)
        for (var j = 0; j < dau[r].length; j++)
          if (_cbChuan_(dau[r][j]).toUpperCase() === _cbChuan_(hGoc[1]).toUpperCase()) { hh = r + 1; break; }
    }
    Logger.log('=== "' + sh.getName() + '" (gid ' + c[0] + ', header hang ' + (hh || '?') + ') ===');
    if (!hh) { Logger.log('  ⚠️ KHONG do duoc hang header'); return; }

    var h = sh.getRange(hh, 1, 1, sh.getMaxColumns()).getValues()[0];
    var lech = [];
    for (var k = 0; k < h.length; k++) {
      var ten = _cbChuan_(h[k]);
      if (!ten) continue;
      var chuan = k < CB_SO_COT ? _cbChuan_(hGoc[k]) : (k + 1 === CB_COT_T ? CB_TEN_COT_T : '');
      var dau2 = (ten.toUpperCase() === chuan.toUpperCase()) ? '   ' : ' ⚠️';
      Logger.log(dau2 + ' cot ' + (k + 1) + ': "' + ten + '"' +
                 (dau2 === ' ⚠️' ? '   <- goc: "' + (chuan || '(trong)') + '"' : ''));
      if (dau2 === ' ⚠️') lech.push(k + 1);
    }
    Logger.log('  -> ' + (lech.length ? '⚠️ LECH o cot: ' + lech.join(', ') : '✅ khop cau truc chuan'));
  });
}

/**
 * Chạy tay để kiểm trước khi bật trigger. KHÔNG ghi gì, chỉ đếm.
 * Chạy cái này TRƯỚC `copyB2B_B2C()` để chắc gid đúng và luật phân loại đúng ý.
 */
function DIAG_copyB2B_B2C() {
  var ss = SpreadsheetApp.openById(CB_SS_ID);
  var goc = ss.getSheetByName(CB_TAB_GOC);
  var soHang = goc.getLastRow();
  var data = goc.getRange(CB_HANG_HEAD + 1, 1, soHang - CB_HANG_HEAD, CB_SO_COT).getValues();

  var b2b = 0, b2c = 0, trong = 0, dsCarrier = {};
  for (var i = 0; i < data.length; i++) {
    var po = _cbChuan_(data[i][1]);
    var c  = _cbChuan_(data[i][2]).toUpperCase();
    if (!po) continue;
    if (!c) { trong++; continue; }
    dsCarrier[c] = (dsCarrier[c] || 0) + 1;
    if (c === 'UPS') b2c++; else b2b++;
  }

  var sB2B = _cbSheetTheoGid_(ss, CB_GID_B2B);
  var sB2C = _cbSheetTheoGid_(ss, CB_GID_B2C);

  Logger.log('Sheet B2B (gid ' + CB_GID_B2B + ') = "' + sB2B.getName() + '", dang co ' + sB2B.getLastRow() + ' hang');
  Logger.log('Sheet B2C (gid ' + CB_GID_B2C + ') = "' + sB2C.getName() + '", dang co ' + sB2C.getLastRow() + ' hang');
  Logger.log('Se copy: B2B ' + b2b + ' don | B2C ' + b2c + ' don | bo qua (cot C trong) ' + trong);
  Logger.log('Carrier dang co: ' + JSON.stringify(dsCarrier));
}
