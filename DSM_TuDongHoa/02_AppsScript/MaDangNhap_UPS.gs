/**
 * ============================================================
 *  MaDangNhap_UPS.gs — lấy mã MFA của UPS từ Gmail
 * ------------------------------------------------------------
 *  UPS gửi mã xác minh về hộp thư khi đăng nhập từ thiết bị lạ.
 *  File này cho phép tool trên VM lấy mã đó mà KHÔNG cần ai đưa
 *  mật khẩu Gmail.
 *
 *  ⛔ AN TOÀN — đây là endpoint phát MÃ ĐĂNG NHẬP, phải chặn kỹ:
 *   1. Bắt buộc có KHOÁ BÍ MẬT (`?khoa=...`). Khoá nằm trong
 *      Script Properties, KHÔNG nằm trong code nên không vào git.
 *   2. Chỉ nhận thư từ đúng `noreply@id.ups.com`.
 *   3. Chỉ trả mã của thư đến trong `PHUT_TOI_DA` phút gần nhất
 *      (mặc định 10). Mã cũ hơn coi như đã hết hạn.
 *   4. KHÔNG trả nội dung thư, chỉ trả đúng dãy số.
 *
 *  CÀI 1 LẦN: chạy `TAO_KHOA_UPS()` rồi lưu khoá in ra vào
 *  `11_TaiVe/creds.json` mục `upsMa.khoa` trên VM.
 *
 *  ⚠️ Web app phải deploy dạng **Execute as: Me (info@allforwood.com)**
 *     thì GmailApp mới đọc đúng hộp thư nhận mã.
 *     Chạy `DIAG_maUps()` để biết đang chạy dưới tài khoản nào.
 * ============================================================
 */

var UPS_NGUOI_GUI = 'noreply@id.ups.com';
var UPS_PHUT_TOI_DA = 10;          // mã cũ hơn ngần này phút -> bỏ
var UPS_KHOA_PROP = 'UPS_MA_KHOA'; // tên thuộc tính chứa khoá bí mật

/** CHẠY 1 LẦN — sinh khoá bí mật, in ra để chép sang VM. */
function TAO_KHOA_UPS() {
  var k = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  PropertiesService.getScriptProperties().setProperty(UPS_KHOA_PROP, k);
  Logger.log('KHOA UPS (chep vao creds.json muc upsMa.khoa):\n' + k);
  return k;
}

/**
 * Rút mã từ nội dung thư.
 *
 * ⚠️ CHƯA BIẾT CHẮC UPS viết mã ra sao — chạy `DIAG_maUps()` để xem thư thật rồi
 *    chỉnh lại hàm này nếu cần. Hiện tại:
 *      - ưu tiên số 4–8 chữ số đứng NGAY SAU chữ gợi ý (code / verification / PIN…)
 *      - không thấy thì lấy số 6 chữ số ĐỨNG MỘT MÌNH đầu tiên
 *    Cố ý KHÔNG vơ mọi dãy số: thư còn số điện thoại, mã vùng, năm…
 */
function _rutMaUps(text) {
  if (!text) return '';
  var t = String(text).replace(/\s+/g, ' ');

  var goiY = /(?:verification code|security code|one[- ]time|access code|passcode|\bcode\b|\bPIN\b)[^0-9]{0,40}(\d{4,8})/i;
  var m = t.match(goiY);
  if (m) return m[1];

  // 6 chữ số đứng một mình (không dính chữ/số khác hai bên)
  m = t.match(/(?:^|[^0-9A-Za-z])(\d{6})(?![0-9A-Za-z])/);
  return m ? m[1] : '';
}

/** Thư UPS mới nhất trong N phút gần đây -> { ma, luc, tieuDe } hoặc null. */
function _timMaUps(phut) {
  var gioiHan = new Date(Date.now() - phut * 60 * 1000);
  // in:anywhere để không sót khi thư rơi vào Spam
  var q = 'from:' + UPS_NGUOI_GUI + ' newer_than:1d in:anywhere';
  var ds = GmailApp.search(q, 0, 20);
  var tot = null;

  for (var i = 0; i < ds.length; i++) {
    var tin = ds[i].getMessages();
    for (var j = 0; j < tin.length; j++) {
      var m = tin[j];
      var luc = m.getDate();
      if (luc < gioiHan) continue;
      // chỉ nhận đúng người gửi, không nhận thư giả danh trong tiêu đề
      if (String(m.getFrom()).toLowerCase().indexOf(UPS_NGUOI_GUI) === -1) continue;
      var ma = _rutMaUps(m.getPlainBody()) || _rutMaUps(m.getSubject());
      if (!ma) continue;
      if (!tot || luc > tot.luc) tot = { ma: ma, luc: luc, tieuDe: m.getSubject() };
    }
  }
  return tot;
}

/**
 * Action web app: `?action=maUps&khoa=<KHOA>[&phut=10]`
 * Trả { ma, tuoiGiay } — KHÔNG trả nội dung thư.
 */
function _maUps(body) {
  var khoaThat = PropertiesService.getScriptProperties().getProperty(UPS_KHOA_PROP);
  if (!khoaThat) {
    return _json({ ok: false, error: 'chua tao khoa — chay TAO_KHOA_UPS() mot lan' });
  }
  var khoa = String((body && body.khoa) || '');
  // so sánh đủ dài mới tính, tránh lộ độ dài qua lỗi
  if (khoa.length < 16 || khoa !== khoaThat) {
    Utilities.sleep(1500);                       // làm chậm việc dò khoá
    return _json({ ok: false, error: 'khoa khong dung' });
  }

  var phut = parseInt((body && body.phut) || UPS_PHUT_TOI_DA, 10);
  if (!(phut > 0 && phut <= 30)) phut = UPS_PHUT_TOI_DA;

  var kq = _timMaUps(phut);
  if (!kq) {
    return _json({ ok: true, ma: null,
      ghiChu: 'khong co thu tu ' + UPS_NGUOI_GUI + ' trong ' + phut + ' phut gan day',
      chayDuoi: Session.getEffectiveUser().getEmail() });
  }
  return _json({ ok: true, ma: kq.ma, tuoiGiay: Math.round((Date.now() - kq.luc.getTime()) / 1000) });
}

/**
 * 🔎 Chạy TAY trong trình soạn Apps Script để kiểm.
 * In ra tài khoản đang chạy + các thư UPS gần đây và mã rút được.
 * Dùng khi `_rutMaUps` không ra mã: xem thư thật viết thế nào rồi sửa lại regex.
 */
function DIAG_maUps() {
  Logger.log('Dang chay duoi tai khoan: ' + Session.getEffectiveUser().getEmail());
  Logger.log('(Neu KHONG phai hop thu nhan ma UPS thi phai deploy lai voi Execute as dung tai khoan do.)');
  var ds = GmailApp.search('from:' + UPS_NGUOI_GUI + ' newer_than:7d in:anywhere', 0, 10);
  Logger.log('So luong thu 7 ngay gan day: ' + ds.length);
  for (var i = 0; i < ds.length; i++) {
    var tin = ds[i].getMessages();
    for (var j = 0; j < tin.length; j++) {
      var m = tin[j];
      var body = m.getPlainBody() || '';
      Logger.log('--- ' + m.getDate() + ' | ' + m.getSubject());
      Logger.log('    rut duoc: ' + JSON.stringify(_rutMaUps(body) || _rutMaUps(m.getSubject())));
      Logger.log('    200 ky tu dau: ' + body.replace(/\s+/g, ' ').slice(0, 200));
    }
  }
  if (!ds.length) {
    Logger.log('KHONG co thu nao. Dang nhap UPS mot lan de sinh ma roi chay lai ham nay.');
  }
}
