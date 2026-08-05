/**
 * ============================================================================
 *  dsm.mjs — Thư viện gọi DSM (Rithum OrderStream), không cần điều khiển trình duyệt
 * ----------------------------------------------------------------------------
 *  Dùng APIRequestContext của Playwright để cookie phiên tự đi kèm.
 *  Toàn bộ endpoint dưới đây ĐÃ KIỂM CHỨNG THẬT ngày 04–05/08/2026.
 *  KHÔNG có CSRF token — chỉ cần session cookie.
 * ==========================================================================*/

export const R = 'https://dsm.commercehub.com/dsm/';

export const CFG = {
  WEBAPP: 'https://script.google.com/macros/s/AKfycbzzJCEgWBcO76OcbhJIdiHGlJEgbWxq7FFEGbIwwpQe2gmtOalVOXziJXFyuI1Ckrtn-Q/exec',
  INBOX_FOLDER_ID: '18rFktqm_K_a9-RPW5S0o2fTkmmHITGKO',
  SHIP_QTY: '1',          // CỜ 0/1 — KHÔNG phải số lượng đơn
  DELAY_MS: 1500          // nghỉ giữa các PO, tránh bị coi là bot
};

/* --- helper parse HTML bằng regex (khỏi phụ thuộc cheerio) ---------------- */

function attr(tag, name) {
  const m = tag.match(new RegExp(name + '\\s*=\\s*"([^"]*)"', 'i')) ||
            tag.match(new RegExp(name + "\\s*=\\s*'([^']*)'", 'i'));
  return m ? m[1] : null;
}

export function hiddenInputs(html) {
  const out = [];
  for (const t of html.match(/<input\b[^>]*>/gi) || []) {
    if (!/type\s*=\s*["']?hidden/i.test(t)) continue;
    const n = attr(t, 'name');
    if (n) out.push({ name: n, value: attr(t, 'value') ?? '' });
  }
  return out;
}

/** Tìm name của ô Ship Quantity: order(<orderid>).item(<itemid>).shipped */
export function shippedFieldName(html) {
  for (const t of html.match(/<input\b[^>]*>/gi) || []) {
    const n = attr(t, 'name');
    if (n && /\.shipped$/.test(n)) return n;
  }
  return null;
}

export function formAction(html, formName) {
  const re = new RegExp('<form\\b[^>]*name\\s*=\\s*["\']' + formName + '["\'][^>]*>', 'i');
  const m = html.match(re);
  return m ? attr(m[0], 'action') : null;
}

export function absUrl(action) {
  if (!action) return null;
  if (action.startsWith('http')) return action;
  return R + action.replace(/^\/?dsm\//, '').replace(/^\//, '');
}

function cells(trHtml) {
  return (trHtml.match(/<td\b[\s\S]*?<\/td>/gi) || [])
    .map(td => td.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim());
}

/* --- kiểm session -------------------------------------------------------- */

/**
 * Session chết là TRẠNG THÁI BÌNH THƯỜNG. Gọi trước mỗi lô và DỪNG nếu !ok —
 * đừng chạy tiếp rồi ghi nhận sai.
 */
export async function checkSession(req) {
  const r = await req.get(R + 'gotoHome.do');
  const url = r.url() || '';
  const body = await r.text();
  const ok = url.includes('dsm.commercehub.com') && body.includes('quicksearchOneLineSearchName');
  return { ok, noiDen: ok ? 'dsm' : (url.includes('sso.auth') ? 'SSO-LOGIN (het session)' : url.slice(0, 70)) };
}

/* --- BƯỚC 1: danh sách PO cần lấy slip ----------------------------------- */

/**
 * GET web app — KHÔNG cần đăng nhập Google (web app chạy dưới quyền info@).
 * checkSlip=true -> bỏ PO đã có "<PO>_PackingSlip.pdf" trên Drive.
 * ⚠️ Kiểm o.pos, KHÔNG kiểm o.ok. Có vòng lặp vì Apps Script thỉnh thoảng trả HTML.
 */
export async function needSlip(req, { checkSlip = false } = {}) {
  const url = CFG.WEBAPP + '?action=needSlip' + (checkSlip ? '&checkSlip=1' : '');
  for (let lan = 1; lan <= 4; lan++) {
    const t = await (await req.get(url)).text();
    let o = null;
    try { o = JSON.parse(t); } catch { /* HTML tam thoi */ }
    if (o && o.pos) return o;
    await new Promise(s => setTimeout(s, 2500));
  }
  throw new Error('needSlip: khong lay duoc o.pos sau 4 lan');
}

/* --- BƯỚC 2: PO -> orderid ---------------------------------------------- */

export async function poToOrderId(req, po) {
  const home = await (await req.get(R + 'gotoHome.do')).text();

  // lấy value của dropdown theo TEXT, không theo index
  const pick = (selId, text) => {
    const sel = home.match(new RegExp('<select\\b[^>]*id\\s*=\\s*["\']' + selId + '["\'][\\s\\S]*?</select>', 'i'));
    if (!sel) return null;
    for (const o of sel[0].match(/<option\b[^>]*>[\s\S]*?<\/option>/gi) || []) {
      const label = o.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      if (label === text) return attr(o.match(/<option\b[^>]*>/i)[0], 'value') ?? '';
    }
    return null;
  };
  const kv = pick('quicksearchOneLineSearchName', 'Orders - Purchase Order Number');
  const ov = pick('criteriaOperator', 'Starting With');
  if (kv === null) throw new Error('poToOrderId: khong thay option "Orders - Purchase Order Number"');

  const form = home.match(/<form\b[^>]*id\s*=\s*["']quickSearchForm["'][\s\S]*?<\/form>/i);
  const scope = form ? form[0] : home;

  const body = {};
  for (const h of hiddenInputs(scope)) body[h.name] = h.value;
  body['quicksearchOneLineSearchName'] = kv;
  if (ov !== null) body['criteriaOperator'] = ov;
  body['quicksearchCriteria'] = String(po);

  const action = absUrl(formAction(scope, 'dsmQuickSearchForm')) || (R + 'gotoHome.do');
  const r = await req.post(action, { form: body });
  const m = (r.url() || '').match(/orderid=(\d+)/);
  if (!m) {
    const doName = ((r.url() || '').match(/\/([A-Za-z]+)\.do/) || [])[1] || '?';
    throw new Error(`poToOrderId(${po}): khong ra orderid, den ${doName}`);
  }
  return m[1];
}

/* --- BƯỚC 3-4: submit reprint  ⛔ KHÔNG HOÀN TÁC ĐƯỢC ------------------- */

/** Lỗi thì KHÔNG gọi lại — mỗi lần Submit là một yêu cầu reprint thật. */
export async function submitReprint(req, po) {
  const orderid = await poToOrderId(req, po);
  const html = await (await req.get(
    `${R}gotoOrderRealmForm.do?orderid=${orderid}&action=web_packslip_reprint&Go=Go`)).text();

  const formHtml = (html.match(/<form\b[^>]*name\s*=\s*["']GeneralOrderRealmForm["'][\s\S]*?<\/form>/i) || [])[0];
  if (!formHtml) throw new Error(`submitReprint(${po}): khong thay form GeneralOrderRealmForm`);
  const qtyName = shippedFieldName(formHtml);
  if (!qtyName) throw new Error(`submitReprint(${po}): khong thay o .shipped`);

  const body = {};
  for (const h of hiddenInputs(formHtml)) body[h.name] = h.value;
  body[qtyName] = CFG.SHIP_QTY;
  body['confirmreprintbtn'] = 'Submit';

  const post = absUrl(formAction(formHtml, 'GeneralOrderRealmForm')) ||
               (R + 'handleOrderRealmFormSubmission.do');
  const t = await (await req.post(post, { form: body })).text();
  return { po, orderid, ok: /successfully applied/i.test(t) };
}

/* --- BƯỚC 5: file chờ + PO bên trong ----------------------------------- */

export async function pendingFile(req) {
  const h1 = await (await req.get(R + 'gotoViewPackslipReprint.do')).text();
  let fid = null, soSlip = null;
  for (const tr of h1.match(/<tr\b[\s\S]*?<\/tr>/gi) || []) {
    const td = cells(tr);
    if (td.length < 5) continue;
    const m = (td[1] || '').match(/^(\d+)\.pdf$/i);
    if (m) { fid = m[1]; soSlip = td[3]; break; }
  }
  if (!fid) return null;

  const h2 = await (await req.get(`${R}gotoViewFileContents.do?FID=${fid}&FNAME=${fid}.pdf`)).text();
  const pos = [];
  for (const td of h2.match(/<td\b[\s\S]*?<\/td>/gi) || []) {
    const t = td.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (/^\d{8}$/.test(t)) pos.push(t);
  }
  return { fid, soSlip, pos };
}

/* --- BƯỚC 6: tải PDF -------------------------------------------------- */

/**
 * ⚠️ KHÔNG dùng isLive=true — nó trả text/html ~59 KB, KHÔNG phải PDF.
 * Kiểm 2 lớp: content-type có 'pdf' VÀ 5 byte đầu là '%PDF'.
 */
export async function downloadPdf(req, fid) {
  const r = await req.get(`${R}downloadFile.do?fileId=${fid}`);
  const buf = Buffer.from(await r.body());
  const ct = (r.headers()['content-type'] || '').toLowerCase();
  if (!buf.subarray(0, 5).toString('latin1').startsWith('%PDF')) {
    throw new Error(`downloadPdf(${fid}): KHONG phai PDF (${Math.round(buf.length / 1024)} KB, ct=${ct}). ` +
                    `Kiem lai URL — DUNG dung isLive=true.`);
  }
  return buf;
}

/* --- BƯỚC 7: upload lên Drive _INBOX ---------------------------------- */

/**
 * POST base64 lên web app. KHÔNG set headers. Kiểm o.id, KHÔNG kiểm o.ok.
 * PHẢI có vòng lặp: test 05/08 lần POST đầu Apps Script trả HTML -> thất bại im lặng.
 */
export async function uploadToInbox(req, filename, buf) {
  const payload = JSON.stringify({
    folderId: CFG.INBOX_FOLDER_ID,
    filename,
    base64: buf.toString('base64'),
    mimeType: 'application/pdf'
  });
  let note = '';
  for (let lan = 1; lan <= 4; lan++) {
    const t = await (await req.post(CFG.WEBAPP, { data: payload })).text();
    let o = null;
    try { o = JSON.parse(t); } catch { /* HTML */ }
    if (o && o.id) return { ok: true, id: o.id, ghiChu: `ok lan ${lan}` };
    note = `lan ${lan}` + (/^\s*</.test(t) ? ' tra HTML' : ' khong co id');
    await new Promise(s => setTimeout(s, 2500));
  }
  return { ok: false, ghiChu: note };
}
