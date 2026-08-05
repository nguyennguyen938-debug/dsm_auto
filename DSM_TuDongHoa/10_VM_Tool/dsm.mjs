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

/** Danh sách PO nằm trong một file chờ. */
async function poTrongFile(req, fid) {
  const h = await (await req.get(`${R}gotoViewFileContents.do?FID=${fid}&FNAME=${fid}.pdf`)).text();
  const pos = [];
  for (const td of h.match(/<td\b[\s\S]*?<\/td>/gi) || []) {
    const t = td.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (/^\d{8}$/.test(t)) pos.push(t);
  }
  return pos;
}

/**
 * TẤT CẢ file đang chờ, không chỉ file đầu tiên.
 *
 * 🔴 05/08/2026 — BẰNG CHỨNG THỰC TẾ, sửa lại mô tả cũ:
 * Tài liệu từng ghi "file reprint là MỘT file chờ dồn tích". KHÔNG ĐÚNG HẲN.
 * Lô 05/08 submit 2 PO liền nhau (cách 5 giây) thì DSM tạo **HAI file riêng**:
 *   22576343885 -> 78784022 · 22576391163 -> 78821006
 * Bản cũ của hàm này `break` ngay ở file đầu tiên, nên tải xong file 1 là dừng;
 * slip của PO thứ hai nằm lại trong file 2 và KHÔNG AI TẢI. Submit thì đã gửi rồi,
 * không hoàn tác được -> lần chạy sau sẽ submit lại chính PO đó = lệnh reprint trùng.
 *
 * Vì vậy: LUÔN duyệt hết danh sách. Đừng bao giờ giả định chỉ có một file.
 */
export async function pendingFiles(req) {
  const h1 = await (await req.get(R + 'gotoViewPackslipReprint.do')).text();
  const ds = [];
  for (const tr of h1.match(/<tr\b[\s\S]*?<\/tr>/gi) || []) {
    const td = cells(tr);
    if (td.length < 5) continue;
    const m = (td[1] || '').match(/^(\d+)\.pdf$/i);
    if (m) ds.push({ fid: m[1], soSlip: td[3] });
  }
  for (const f of ds) f.pos = await poTrongFile(req, f.fid);
  return ds;
}

/** Giữ lại cho tương thích: chỉ trả file chờ đầu tiên. Lô nhiều PO thì dùng pendingFiles(). */
export async function pendingFile(req) {
  const ds = await pendingFiles(req);
  return ds[0] || null;
}

/**
 * Đợi tới khi mọi PO trong `canCo` đều xuất hiện ở một file chờ nào đó.
 * DSM không sinh file tức thì — lô 05/08 thấy độ trễ vài giây.
 * Hết `hanMs` mà vẫn thiếu thì TRẢ VỀ NGUYÊN TRẠNG, để bên gọi quyết định (đừng tự ý tải).
 */
export async function doiDuSlip(req, canCo, { hanMs = 60000, nhipMs = 5000, log = () => {} } = {}) {
  const t0 = Date.now();
  let ds = [];
  for (;;) {
    ds = await pendingFiles(req);
    const co = new Set(ds.flatMap(f => f.pos));
    const thieu = canCo.filter(p => !co.has(p));
    if (!thieu.length) return { ds, thieu: [], doiMs: Date.now() - t0 };
    if (Date.now() - t0 >= hanMs) return { ds, thieu, doiMs: Date.now() - t0 };
    log(`cho them ${thieu.length} slip (${thieu.join(', ')}) — da doi ${Math.round((Date.now() - t0) / 1000)}s`);
    await new Promise(s => setTimeout(s, nhipMs));
  }
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
  return uploadRawToInbox(req, filename, buf.toString('base64'), 'application/pdf');
}

/** Lõi chung của mọi lần POST base64 lên _INBOX. Kiểm o.id, KHÔNG kiểm o.ok. */
async function uploadRawToInbox(req, filename, base64, mimeType) {
  const payload = JSON.stringify({
    folderId: CFG.INBOX_FOLDER_ID, filename, base64, mimeType
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

/* --- BƯỚC 7b: tách file gộp thành từng packing slip -------------------- */

/**
 * Tách PDF gộp thành [{po, buf}] — mỗi PO một file.
 *
 * KHẢO SÁT 05/08/2026 trên 11 file thật (9 file đã tách tay + 2 file tải hôm nay):
 * mỗi packing slip đúng **1 trang**, mỗi trang chứa đúng **một** số 8 chữ số và số đó
 * chính là PO. Không có trang nào mơ hồ.
 *
 * Dù vậy code vẫn KHÔNG giả định 1 trang/PO: trang nào không đọc ra PO thì gộp vào PO
 * của trang trước (slip nhiều trang). Giả định sai ở đây nghĩa là **gửi nhầm packing
 * slip cho đơn khác** — sai lầm đắt hơn nhiều so với việc viết thêm mấy dòng phòng xa.
 *
 * `poMongDoi` (lấy từ pendingFiles) là mạng an toàn chính:
 *   - lọc ứng viên 8 chữ số về đúng những PO đáng lẽ có trong file
 *   - đối chiếu tập đọc được với tập mong đợi; LỆCH LÀ NÉM LỖI, không trả kết quả nửa vời
 */
export async function tachTheoPO(buf, poMongDoi = null) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { PDFDocument } = await import('pdf-lib');

  const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const mong = poMongDoi ? new Set(poMongDoi.map(String)) : null;

  // 1) đọc PO của từng trang
  const poTrang = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    const txt = tc.items.map(x => x.str).join(' ');
    let ung = [...new Set(txt.match(/\b\d{8}\b/g) || [])];
    if (mong) {
      const loc = ung.filter(x => mong.has(x));
      if (loc.length) ung = loc;                  // ưu tiên PO đang chờ, bỏ số 8 chữ số lạ
    }
    poTrang.push(ung.length === 1 ? ung[0] : null);   // 0 hoặc nhiều -> chưa xác định
  }

  // 2) trang chưa xác định -> thuộc về PO của trang trước
  for (let i = 0; i < poTrang.length; i++) {
    if (!poTrang[i] && i > 0) poTrang[i] = poTrang[i - 1];
  }
  if (!poTrang[0]) throw new Error('tachTheoPO: trang dau khong doc ra PO — khong tach duoc');

  // 3) đối chiếu với danh sách mong đợi TRƯỚC khi cắt
  if (mong) {
    const thay = new Set(poTrang);
    const thieu = [...mong].filter(p => !thay.has(p));
    const la = [...thay].filter(p => !mong.has(p));
    if (thieu.length || la.length) {
      throw new Error('tachTheoPO: PO doc duoc KHONG khop danh sach cho' +
        (thieu.length ? ` | thieu: ${thieu.join(', ')}` : '') +
        (la.length ? ` | la: ${la.join(', ')}` : ''));
    }
  }

  // 4) cắt theo nhóm trang liền nhau cùng PO
  const goc = await PDFDocument.load(buf);
  const nhom = [];
  for (let i = 0; i < poTrang.length; i++) {
    const cuoi = nhom[nhom.length - 1];
    if (cuoi && cuoi.po === poTrang[i]) cuoi.trang.push(i);
    else nhom.push({ po: poTrang[i], trang: [i] });
  }

  const ra = [];
  for (const n of nhom) {
    const moi = await PDFDocument.create();
    const trang = await moi.copyPages(goc, n.trang);
    for (const t of trang) moi.addPage(t);
    ra.push({ po: n.po, soTrang: n.trang.length, buf: Buffer.from(await moi.save()) });
  }
  return ra;
}

/* --- BƯỚC 8: ghi manifest — ĐÂY LÀ THỨ BỊT LỖ SUBMIT TRÙNG ------------- */

/**
 * Ghi <fid>_manifest.json vào _INBOX, liệt kê PO NẰM TRONG file vừa tải.
 *
 * ⚠️ PHẢI gọi SAU khi upload <fid>.pdf thành công, KHÔNG được gọi trước.
 *    Manifest có mà PDF chưa lên = lần chạy sau bỏ qua những PO đó trong khi slip
 *    chưa hề được lưu -> MẤT ĐƠN. Ngược lại (PDF có, manifest thiếu) chỉ dẫn tới
 *    submit trùng — phiền, nhưng còn cứu được.
 *
 * Ghi `pos` lấy từ pendingFile() chứ KHÔNG lấy danh sách đã submit: chỉ PO thật sự
 * nằm trong file tải về mới được coi là đã có slip.
 */
export async function writeManifest(req, fid, pos, extra = {}) {
  const doc = JSON.stringify({
    fid: String(fid),
    taiLuc: new Date().toISOString(),
    pos: pos.map(String),
    ...extra
  }, null, 1);
  return uploadRawToInbox(req, `${fid}_manifest.json`,
                          Buffer.from(doc, 'utf8').toString('base64'),
                          'application/json');
}
