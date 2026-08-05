/* ============================================================================
 *  TOOL TẢI PACKING SLIP TỪ DSM (Rithum OrderStream)
 *  ĐÃ TEST CHẠY THẬT 05/08/2026 trên PO 78784022 — toàn bộ là HTTP thuần,
 *  không click DOM, không phụ thuộc toạ độ hay nút nào trên trang.
 * ----------------------------------------------------------------------------
 *  PHẠM VI: tool CHỈ tải về **bản thô** — một file PDF gộp — rồi lưu vào Drive
 *  `_INBOX` với tên `<fid>.pdf`.
 *    ❌ KHÔNG tách trang.  ❌ KHÔNG đặt tên theo PO.  ❌ KHÔNG tạo folder ngày.
 *  Việc đọc, phân loại, tách (nếu cần) do Claude làm ở bước sau.
 *
 *  ⚠️ Bước Submit KHÔNG HOÀN TÁC ĐƯỢC ("All actions taken on orders are final").
 *     Lỗi thì KHÔNG gọi lại.
 *  ⚠️ Viết JS đồng bộ hoặc ghi kết quả vào window.__x rồi đọc ở lệnh sau —
 *     javascript_tool trả {} với hàm async.
 *  ⚠️ Đừng trả URL/HTML thô trong kết quả — sẽ bị [BLOCKED: Cookie/query string data].
 * ==========================================================================*/

var DSM = {
  R: 'https://dsm.commercehub.com/dsm/',
  SHEET_CSV: 'https://docs.google.com/spreadsheets/d/1Fzwr2GDHOHxMgqPNf-Ksf6qJ5IIl3mNzrOQrHqH57fo/gviz/tq?tqx=out:csv&gid=1872401054',
  WEBAPP: 'https://script.google.com/macros/s/AKfycbzzJCEgWBcO76OcbhJIdiHGlJEgbWxq7FFEGbIwwpQe2gmtOalVOXziJXFyuI1Ckrtn-Q/exec',
  INBOX: '18rFktqm_K_a9-RPW5S0o2fTkmmHITGKO',
  SHIP_QTY: '1'      // CỜ 0/1 — không phải số lượng đơn
};

/* ============================================================================
 *  ENDPOINT — đã xác minh 04–05/08/2026
 * ----------------------------------------------------------------------------
 *  POST  <action của form dsmQuickSearchForm>   -> redirect gotoOrderRealmDisplay.do?orderid=<id>
 *  GET   gotoOrderRealmForm.do?orderid=<id>&action=web_packslip_reprint&Go=Go
 *  POST  handleOrderRealmFormSubmission.do      -> "successfully applied"
 *  GET   gotoViewPackslipReprint.do             -> tên file <fid>.pdf + số slip
 *  GET   gotoViewFileContents.do?FID=<fid>&FNAME=<fid>.pdf
 *          -> HTML liệt kê PO trong file; mỗi dòng có link Hub_PO=<orderid>
 *  GET   downloadFile.do?fileId=<fid>           -> application/pdf  ✅
 *  ❌    downloadFile.do?fileId=<fid>&isLive=true -> text/html (KHÔNG phải PDF)
 *
 *  Không có CSRF token — chỉ cần session cookie (credentials:'include').
 * ==========================================================================*/

/* ---------------------------------------------------------------------------
 *  BƯỚC 1 — QUÉT SHEET
 *
 *  ⭐ CÁCH MỚI (dùng cho cả bản trong tab lẫn bản VM tự động):
 *       GET  <WEBAPP>/exec?action=needSlip
 *       -> { ok, count, pos:[...], skipped:[...] }
 *     Web app chạy dưới quyền info@ nên bên gọi KHÔNG cần đăng nhập Google,
 *     KHÔNG cần ở tab docs.google.com, KHÔNG vướng cross-origin.
 *     Thêm &checkSlip=1 để bỏ PO đã có "<PO>_PackingSlip.pdf" trên Drive (dedup).
 *     ⚠️ Kiểm o.pos, KHÔNG kiểm o.ok.
 *
 *  T1_scanSheet() dưới đây là cách CŨ — đọc CSV, phải ở tab docs.google.com.
 *  Giữ lại làm phương án dự phòng nếu web app hỏng.
 * ------------------------------------------------------------------------- */
function T1_needSlip() {
  window.__t1 = 'running';
  (async function () {
    try {
      var r = await fetch(DSM.WEBAPP + '?action=needSlip');   // GET, khong kem headers
      var t = await r.text();
      var o = null; try { o = JSON.parse(t); } catch (e) {}
      if (!o || !o.pos) { window.__t1 = 'ERR khong co o.pos (Apps Script tra HTML? goi lai). ' + t.slice(0, 120); return; }
      window.__t1 = JSON.stringify({ count: o.count, pos: o.pos, boQua: o.skipped });
    } catch (e) { window.__t1 = 'ERR ' + e.message; }
  })();
  return 'da chay, doc window.__t1';
}

/* --- CÁCH CŨ: đọc CSV, phải ở tab docs.google.com ------------------------- */
function T1_scanSheet() {
  window.__t1 = 'running';
  (async function () {
    try {
      var res = await fetch(DSM.SHEET_CSV, { credentials: 'include' });
      if (res.status !== 200) { window.__t1 = 'ERR http ' + res.status + ' (chua dang nhap Google?)'; return; }
      var t = await res.text();
      function row(l) {
        var o = [], c = '', q = false;
        for (var i = 0; i < l.length; i++) {
          var ch = l[i];
          if (ch === '"') { if (q && l[i + 1] === '"') { c += '"'; i++; } else q = !q; }
          else if (ch === ',' && !q) { o.push(c); c = ''; }
          else c += ch;
        }
        o.push(c); return o;
      }
      var L = t.split(/\r?\n/), need = [], tong = 0;
      for (var i = 0; i < L.length; i++) {
        if (!L[i].trim()) continue;
        var r = row(L[i]);
        var po = (r[1] || '').trim(), ca = (r[2] || '').trim(), pic = (r[3] || '').trim();
        if (!/^\d{8}$/.test(po)) continue;
        tong++;
        if (ca === '' && pic === '') need.push(po);
      }
      window.__t1 = JSON.stringify({ tongDongCoPO: tong, canLam: need.length, pos: need });
    } catch (e) { window.__t1 = 'ERR ' + e.message; }
  })();
  return 'da chay, doc window.__t1';
}

/* ---------------------------------------------------------------------------
 *  BƯỚC 2-4 — SUBMIT REPRINT CHO CẢ LÔ   (chạy trên tab dsm.commercehub.com)
 *  ⛔ KHÔNG tải gì giữa lô — tải giữa lô là CẮT LÔ, các PO sau rơi vào file khác.
 *  ⛔ Session chết -> dừng ngay, đừng chạy tiếp.
 * ------------------------------------------------------------------------- */
function T2_submitBatch(pos) {
  window.__t2 = 'running';
  (async function () {
    var out = [];
    try {
      if (location.hostname !== 'dsm.commercehub.com' ||
          !document.getElementById('quicksearchOneLineSearchName')) {
        window.__t2 = 'ERR chua dang nhap DSM (host=' + location.hostname + ')'; return;
      }
      var f = document.getElementById('quickSearchForm');
      var kind = document.getElementById('quicksearchOneLineSearchName'), kv = '';
      for (var i = 0; i < kind.options.length; i++)
        if ((kind.options[i].textContent || '').trim() === 'Orders - Purchase Order Number') kv = kind.options[i].value;
      var op = document.getElementById('criteriaOperator'), ov = '';
      for (var j = 0; j < op.options.length; j++)
        if ((op.options[j].textContent || '').trim() === 'Starting With') ov = op.options[j].value;
      var act = f.getAttribute('action') || '';
      var searchUrl = act ? (act.indexOf('http') === 0 ? act : DSM.R + act.replace(/^\/?dsm\//, '')) : location.href;

      for (var n = 0; n < pos.length; n++) {
        var po = String(pos[n]);
        try {
          // --- tim PO -> orderid
          var fd = new URLSearchParams();
          [].forEach.call(f.querySelectorAll('input[type=hidden]'), function (h) { if (h.name) fd.append(h.name, h.value || ''); });
          fd.append('quicksearchOneLineSearchName', kv);
          fd.append('criteriaOperator', ov);
          fd.append('quicksearchCriteria', po);
          var r1 = await fetch(searchUrl, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: fd.toString(), redirect: 'follow'
          });
          var m = (r1.url || '').match(/orderid=(\d+)/);
          if (!m) { out.push({ po: po, ok: false, ly_do: 'search khong ra orderid' }); continue; }
          var oid = m[1];

          // --- lay form reprint
          var h = await (await fetch(DSM.R + 'gotoOrderRealmForm.do?orderid=' + oid +
                        '&action=web_packslip_reprint&Go=Go', { credentials: 'include' })).text();
          var doc = new DOMParser().parseFromString(h, 'text/html');
          var form = doc.querySelector('form[name=GeneralOrderRealmForm]');
          if (!form) { out.push({ po: po, ok: false, ly_do: 'khong thay form' }); continue; }
          var qty = form.querySelector('input[name$=".shipped"]');
          if (!qty) { out.push({ po: po, ok: false, ly_do: 'khong thay o .shipped' }); continue; }

          // --- SUBMIT (khong hoan tac duoc)
          var p = new URLSearchParams();
          [].forEach.call(form.querySelectorAll('input[type=hidden]'), function (x) { if (x.name) p.append(x.name, x.value || ''); });
          p.append(qty.name, DSM.SHIP_QTY);
          p.append('confirmreprintbtn', 'Submit');
          var r2 = await fetch(DSM.R + 'handleOrderRealmFormSubmission.do', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: p.toString()
          });
          var t2 = await r2.text();
          out.push({ po: po, orderid: oid, ok: /successfully applied/i.test(t2) });
        } catch (e) { out.push({ po: po, ok: false, ly_do: e.message.slice(0, 60) }); }
        await new Promise(function (s) { setTimeout(s, 1500); });   // nghi giua cac PO
      }
      window.__t2 = JSON.stringify(out);
    } catch (e) { window.__t2 = 'ERR ' + e.message; }
  })();
  return 'da chay, doc window.__t2';
}

/* ---------------------------------------------------------------------------
 *  BƯỚC 5-7 — LẤY FILE GỘP RỒI LƯU BẢN THÔ VÀO _INBOX
 *  Chỉ gọi SAU KHI đã submit hết lô.
 * ------------------------------------------------------------------------- */
function T3_fetchAndStore() {
  window.__t3 = 'running';
  (async function () {
    try {
      // --- lay fid
      var h1 = await (await fetch(DSM.R + 'gotoViewPackslipReprint.do', { credentials: 'include' })).text();
      var d1 = new DOMParser().parseFromString(h1, 'text/html');
      var fid = null, slips = null;
      [].forEach.call(d1.querySelectorAll('tr'), function (tr) {
        var t = tr.querySelectorAll('td'); if (t.length < 5 || fid) return;
        var m = (t[1].textContent || '').trim().match(/^(\d+)\.pdf$/i);
        if (m) { fid = m[1]; slips = (t[3].textContent || '').trim(); }
      });
      if (!fid) { window.__t3 = 'ERR khong co file cho trong danh sach reprint'; return; }

      // --- xem file gom PO nao (doi chieu voi lo da submit)
      var h2 = await (await fetch(DSM.R + 'gotoViewFileContents.do?FID=' + fid + '&FNAME=' + fid + '.pdf',
                     { credentials: 'include' })).text();
      var d2 = new DOMParser().parseFromString(h2, 'text/html');
      var pos = [];
      [].forEach.call(d2.querySelectorAll('td'), function (td) {
        var t = (td.textContent || '').trim(); if (/^\d{8}$/.test(t)) pos.push(t);
      });

      // --- tai PDF  (KHONG isLive)
      var r = await fetch(DSM.R + 'downloadFile.do?fileId=' + fid, { credentials: 'include' });
      var buf = await r.arrayBuffer();
      var magic = new TextDecoder().decode(new Uint8Array(buf).slice(0, 5));
      if (magic.indexOf('%PDF') !== 0) {
        window.__t3 = 'ERR khong phai PDF (' + Math.round(buf.byteLength / 1024) +
                      ' KB) — kiem lai URL, DUNG dung isLive=true';
        return;
      }
      var blob = new Blob([buf], { type: 'application/pdf' });

      // --- luu ban tho xuong dia (chi thay duoc neu extension o CUNG MAY voi sandbox)
      var u = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = u; a.download = 'DSM_' + fid + '.pdf';
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 4000);

      // --- luu ban tho len Drive _INBOX, ten <fid>.pdf
      var b64 = await new Promise(function (res, rej) {
        var fr = new FileReader();
        fr.onload = function () { res(String(fr.result).split(',')[1]); };
        fr.onerror = rej; fr.readAsDataURL(blob);
      });
      // ⚠️ PHẢI CÓ VÒNG LẶP LẠI. Test 05/08: lần POST đầu Apps Script trả HTML
      //    -> upload thất bại trong im lặng. Gọi lại là được ngay.
      var lan = 0, ok = false, note = '';
      while (lan < 4 && !ok) {
        lan++;
        var resp = await fetch(DSM.WEBAPP, {        // KHONG kem headers
          method: 'POST',
          body: JSON.stringify({ folderId: DSM.INBOX, filename: fid + '.pdf',
                                 base64: b64, mimeType: 'application/pdf' })
        });
        var txt = await resp.text();
        var o = null; try { o = JSON.parse(txt); } catch (e) {}
        if (o && o.id) { ok = true; note = 'ok lan ' + lan; }
        else {
          note = 'lan ' + lan + (/^\s*</.test(txt) ? ' tra HTML' : ' khong co id');
          await new Promise(function (s) { setTimeout(s, 2500); });
        }
      }

      window.__t3 = JSON.stringify({
        fid: fid, soSlipTrenTrang: slips, poTrongFile: pos,
        kb: Math.round(buf.byteLength / 1024),
        luuDrive: ok,                             // kiem o.id, KHONG kiem o.ok
        ghiChu: note,
        taiVeDia: 'DSM_' + fid + '.pdf'
      });
    } catch (e) { window.__t3 = 'ERR ' + e.message; }
  })();
  return 'da chay, doc window.__t3';
}

/* ============================================================================
 *  CÁCH GỌI
 * ----------------------------------------------------------------------------
 *  1. Tab DSM (hoặc bất kỳ) ->  T1_needSlip()        -> doc window.__t1
 *  2. Tab dsm.commercehub.com -> T2_submitBatch(pos) -> doc window.__t2
 *  3. Cùng tab DSM         ->  T3_fetchAndStore()    -> doc window.__t3
 *
 *  ⭐ Nhờ `needSlip` gọi được bằng GET, cả 3 bước giờ chạy trên MỘT tab DSM —
 *     không phải đổi qua docs.google.com nữa. Đây là điều kiện để gộp thành
 *     một script chạy một lệnh, và cũng là điều kiện để chạy trên VM.
 *
 *  KIỂM ĐẦU PHIÊN: list_connected_browsers; nhiều hơn 1 thì switch_browser.
 *  Rồi tải thử 1 file .txt bằng Blob trên example.com, xem folder mount có
 *  thấy không -> biết extension có cùng máy với sandbox hay không.
 *
 *  ĐÃ TEST 05/08/2026:
 *   Lần 1 (PO 78784022): scan CSV 265 dòng -> 1 PO | orderid 3782541077 | submit OK
 *     fid 22576141945, 1 slip | PDF 69 KB %PDF | xuống đĩa 70.556 byte
 *   Lần 2 (PO 78821006, dùng needSlip qua GET): count=2, bỏ 04587352 vì cột D có PIC
 *     orderid 3782611514 | submit OK | fid 22576190328, 1 slip
 *     PDF 69 KB | xuống đĩa 70.550 byte | upload Drive: lần đầu TRẢ HTML, gọi lại thì OK
 *     -> đó là lý do T3 phải có vòng lặp lại
 *   Ghi chú: cả 2 đơn đều Ship Via = "Ground (carrier not specified)". Hiện các đơn
 *   không-Ground trong sheet đều đã có Carrier/PIC nên needSlip chủ yếu ra đơn Ground.
 *
 *  CHƯA CÓ:
 *    [ ] Dedup — lô thật sẽ submit trùng nếu PO đã lấy slip trước đó.
 *        (Người dùng: chưa cần khi đang test.)
 *    [ ] Gộp 3 bước thành 1 lệnh — hiện phải gọi tay vì cần đổi tab
 *        giữa docs.google.com và dsm.commercehub.com.
 * ==========================================================================*/
