/**
 * ============================================================
 *  TRACK PRO — Tự động tra số PRO theo carrier (Apps Script)
 * ------------------------------------------------------------
 *  Gọi getPRO(carrier, trackNumber) -> object:
 *    { ok, pro, status, eta, bol, from, to, reason, raw }
 *
 *  - XGSI : GET api.xgsi.com/shipments/track  (JSON công khai, KHÔNG cần login)
 *           PROBILL = số PRO của XGS.
 *  - BXID : GET braunsexpress.com/customer-tools/shipment-tracking/ (HTML render sẵn)
 *           *** CHƯA hoàn thiện parser — cần 1 mã Braun's hợp lệ để chốt (xem TODO). ***
 *  - AACT : PRO có ngay lúc tạo BOL trên web -> không cần tra ở đây.
 *           (Có thể bổ sung AAA Cooper Tracking Web Service API sau — cần API token.)
 *
 *  trackNumber truyền vào = số PO / Shipper BOL (mã bạn dùng khi tạo BOL).
 * ============================================================
 */

// ---------- Dispatcher ----------
function getPRO(carrier, trackNumber) {
  carrier = String(carrier || '').trim().toUpperCase();
  trackNumber = String(trackNumber || '').trim();
  if (!trackNumber) return { ok: false, reason: 'Thiếu trackNumber' };

  switch (carrier) {
    case 'XGSI': return trackXGS_(trackNumber);
    case 'BXID': return trackBrauns_(trackNumber);
    case 'AACT': return { ok: false, reason: 'AACT: PRO lấy lúc tạo BOL, không tra web' };
    default:     return { ok: false, reason: 'Carrier chưa hỗ trợ tra tự động: ' + carrier };
  }
}


// ---------- XGS (XGSI) ----------
// Endpoint xác nhận thực tế: https://api.xgsi.com/shipments/track?trackNumber=<PO>&type=po
// Response: { data: [ { result, PROBILL, humanReadableStatus, humanReadableETA, BOL, ... } ] }
function trackXGS_(trackNumber) {
  var url = 'https://api.xgsi.com/shipments/track?trackNumber=' +
            encodeURIComponent(trackNumber) + '&type=po';
  var res;
  try {
    res = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
  } catch (e) {
    return { ok: false, reason: 'XGS fetch lỗi: ' + e.message };
  }

  var code = res.getResponseCode();
  if (code === 404) return { ok: false, pro: '', status: '', reason: 'XGS: chưa có dữ liệu (404)' };
  if (code !== 200) return { ok: false, reason: 'XGS HTTP ' + code };

  var json;
  try { json = JSON.parse(res.getContentText()); }
  catch (e) { return { ok: false, reason: 'XGS: JSON không hợp lệ' }; }

  var d = (json && json.data && json.data[0]) ? json.data[0] : null;
  if (!d || d.result !== true || !d.PROBILL) {
    return { ok: false, reason: 'XGS: không có PROBILL trong kết quả' };
  }

  return {
    ok: true,
    pro: String(d.PROBILL),
    status: d.humanReadableStatus || d.STATUS || '',
    eta: d.humanReadableETA || _fmtYmd_(d.DELIVERBYDATE),
    bol: d.BOL || d.PO_NUMBER || '',
    from: d.shipmentOrigin ? (d.shipmentOrigin.city + ', ' + d.shipmentOrigin.state) : (d.ORIGIN || ''),
    to:   d.shipmentDestination ? (d.shipmentDestination.city + ', ' + d.shipmentDestination.state) : (d.SERVICECENTER || ''),
    raw: d
  };
}


// ---------- Braun's Express (BXID) ----------
// Endpoint: https://www.braunsexpress.com/customer-tools/shipment-tracking/?tracking_number=<PO>
// Trang render kết quả SẴN vào HTML (server-side), không cần JS/login.
// Kết quả nằm trong <table class="shipping-record"> gồm các dòng:
//   <th scope=row>Nhãn:</th><td>Giá trị</td>
// Nhãn gồm: Braun's Pro No / BL No / Fr / PO No / To / Sidemark / Status /
//           Last Update / Shipped On / Delivered On.
// Mã không hợp lệ -> HTML chứa "No Records Found".
function trackBrauns_(trackNumber) {
  var url = 'https://www.braunsexpress.com/customer-tools/shipment-tracking/?tracking_number=' +
            encodeURIComponent(trackNumber);
  var res;
  try {
    res = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true, followRedirects: true });
  } catch (e) {
    return { ok: false, reason: "Braun's fetch lỗi: " + e.message };
  }

  if (res.getResponseCode() !== 200) return { ok: false, reason: "Braun's HTTP " + res.getResponseCode() };

  var html = res.getContentText();
  if (/No\s*Records\s*Found/i.test(html)) {
    return { ok: false, pro: '', status: '', reason: "Braun's: No Records Found" };
  }

  // Bóc các cặp <th>Nhãn:</th><td>Giá trị</td> thành map
  var map = {}, re = /<th[^>]*>\s*([^<]*?)\s*:?\s*<\/th>\s*<td>\s*([^<]*?)\s*<\/td>/gi, m;
  while ((m = re.exec(html)) !== null) { map[m[1].trim()] = m[2].trim(); }

  function get(k) {
    for (var key in map) { if (key.toLowerCase().indexOf(k.toLowerCase()) !== -1) return map[key]; }
    return '';
  }

  var pro = get('Pro No');
  if (!pro) return { ok: false, reason: "Braun's: có dữ liệu nhưng không thấy Pro No", raw: map };

  return {
    ok: true,
    pro: pro,
    status: get('Status'),
    eta: '',                       // Braun's không trả ETA; có Delivered On khi đã giao
    bol: get('BL No'),
    po: get('PO No'),
    from: get('Fr'),
    to: get('To'),
    shipped: get('Shipped On'),
    delivered: get('Delivered On'),
    lastUpdate: get('Last Update'),
    raw: map
  };
}


// ---------- Helpers ----------
// 'YYYYMMDD' -> 'MM/DD/YYYY'
function _fmtYmd_(s) {
  s = String(s || '');
  if (!/^\d{8}$/.test(s)) return '';
  return s.slice(4, 6) + '/' + s.slice(6, 8) + '/' + s.slice(0, 4);
}


// ---------- Test nhanh (chạy tay trong Apps Script editor) ----------
function _test_getPRO() {
  Logger.log(getPRO('XGSI', '36572474'));   // -> PRO 18621460, status "Picked Up"
  Logger.log(getPRO('BXID', '52565756'));   // -> PRO 72525487, status "WAITING TO BE MANIFESTED..."
  Logger.log(getPRO('AACT', '71648792'));   // -> AACT lấy lúc tạo BOL
}
