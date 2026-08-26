/**
 * ============================================================================
 *  ups-api.mjs — gọi UPS REST API (thay cho điều khiển trình duyệt)
 * ----------------------------------------------------------------------------
 *  🎯 VÌ SAO CÓ FILE NÀY. Nhánh Ground trước đây điều khiển form web UPS
 *     (`ups-form.mjs`). Đường đó có ba khuyết tật không sửa được:
 *       · `www.ups.com/lasso/login` bị Akamai chặn với mọi trình duyệt trên VM
 *         -> phải xin cookie từ máy người dùng mỗi lần
 *       · phiên cookie chỉ sống **20–35 phút**, và luôn chết giữa lúc thao tác
 *       · form Angular đua tranh với script, mỗi ô phải ghi-rồi-đọc-lại 3 lần
 *     API không dính cái nào: token sống **4 tiếng** và **tự lấy lại được**.
 *
 *  ✅ ĐO THẬT 08/08/2026 TỪ CHÍNH VM NÀY:
 *       onlinetools.ups.com  (production) -> token, status "approved"
 *       wwwcie.ups.com       (test/CIE)   -> token, status "approved"
 *     Akamai chỉ chặn TRANG ĐĂNG NHẬP, **không** chặn host API. TLS bắt tay 40 ms.
 *     Entitlement đủ 4 API (payload rỗng -> `400 Missing...`, không phải 401/403):
 *       Rating `9110003` · Shipping `9120004` · Pickup `9500554` · Tracking `200`
 *
 *  🔴 MẶC ĐỊNH LÀ **CIE (test)** — CỐ Ý.
 *     CIE tạo label giả: không tốn tiền, không gọi xe. Muốn chạy thật phải đặt
 *     `DSM_UPS_ENV=prod` một cách có ý thức. Đây là thứ đường trình duyệt không
 *     bao giờ có: nghiệm thu trọn luồng trước khi tiêu một đồng nào.
 *
 *  ⚠️ `11_TaiVe/ups-api.txt` chứa client_id/secret — đã `.gitignore`, chmod 600.
 *     File này KHÔNG in hai giá trị đó ra log trong bất kỳ nhánh lỗi nào.
 * ==========================================================================*/

import fs from 'node:fs/promises';
import path from 'node:path';

const GOC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FILE_CREDS = process.env.DSM_UPS_CREDS || path.join(GOC, '11_TaiVe', 'ups-api.txt');
const FILE_TOKEN = process.env.DSM_UPS_TOKEN || path.join(GOC, '11_TaiVe', '.ups-token.json');

/** `prod` mới đụng tiền thật. Mặc định CIE — xem khối đầu file. */
export const LA_THAT = (process.env.DSM_UPS_ENV || 'cie').toLowerCase() === 'prod';
export const HOST = LA_THAT ? 'https://onlinetools.ups.com' : 'https://wwwcie.ups.com';

/** Đọc client_id/client_secret. Trả về object — ĐỪNG log nội dung. */
async function docCreds() {
  let txt;
  try { txt = await fs.readFile(FILE_CREDS, 'utf8'); }
  catch { throw new Error(`khong doc duoc ${FILE_CREDS} — dan client_id/client_secret vao do truoc`); }
  const ra = {};
  for (const dong of txt.split(/\r?\n/)) {
    const i = dong.indexOf('=');
    if (i > 0) ra[dong.slice(0, i).trim()] = dong.slice(i + 1).trim();
  }
  for (const k of ['client_id', 'client_secret']) {
    if (!ra[k]) throw new Error(`${FILE_CREDS} thieu "${k}" (khuon: ${k}=...)`);
  }
  return ra;
}

/**
 * Token OAuth, có nhớ đệm ra đĩa.
 *
 * 🔴 NHỚ ĐỆM RA ĐĨA chứ không giữ trong RAM: mỗi lần chạy script là một tiến trình
 *    mới. Giữ trong biến thì cứ chạy lại là xin token mới — UPS có giới hạn số lần
 *    xin token, và đó đúng là kiểu hành vi làm nhà cung cấp để ý tới mình.
 *
 * 🔴 Đệm ghi kèm `env`: token của CIE KHÔNG dùng được ở production và ngược lại.
 *    Thiếu trường này thì đổi `DSM_UPS_ENV` xong sẽ dùng nhầm token cũ và nhận
 *    `401` khó hiểu.
 *
 * Xin lại khi còn dưới 5 phút — đủ để một lời gọi dài nhất chạy xong.
 */
export async function layToken({ epBuoc = false } = {}) {
  const env = LA_THAT ? 'prod' : 'cie';
  if (!epBuoc) {
    try {
      const c = JSON.parse(await fs.readFile(FILE_TOKEN, 'utf8'));
      if (c.env === env && c.token && c.hetLuc - Date.now() > 5 * 60 * 1000) return c.token;
    } catch { /* chua co dem, hoac dem hong -> xin moi */ }
  }

  const { client_id, client_secret } = await docCreds();
  const r = await fetch(`${HOST}/security/v1/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${client_id}:${client_secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  const t = await r.text();
  let o = null;
  try { o = JSON.parse(t); } catch { /* de nguyen */ }

  if (!r.ok || !o?.access_token) {
    // ⚠️ In mã lỗi của UPS, TUYỆT ĐỐI không in lại credential.
    const ly = o ? JSON.stringify(o.response?.errors || o).slice(0, 200) : t.slice(0, 150);
    throw new Error(`UPS OAuth ${env} that bai (HTTP ${r.status}): ${ly}`);
  }

  const hetLuc = Date.now() + (Number(o.expires_in) || 14399) * 1000;
  await fs.writeFile(FILE_TOKEN, JSON.stringify({ env, token: o.access_token, hetLuc }), { mode: 0o600 });
  return o.access_token;
}

/**
 * Gọi một endpoint API.
 *
 * 🔴 KHÔNG kiểm `r.ok` rồi thôi. UPS trả lỗi nghiệp vụ **kèm HTTP 200** trong một số
 *    ca (cảnh báo trong `response.alert`), và trả `400` với thân JSON đầy đủ trong ca
 *    khác. Hàm này luôn trả cả `code`, `body` để nơi gọi tự quyết — cùng bài học với
 *    `{"ok":true,"msg":"Receiver alive"}` của web app Apps Script: **đừng tin một cờ**.
 *
 * 🔴 Tự làm mới token đúng MỘT lần khi gặp 401. Lặp vô hạn khi credential sai là cách
 *    nhanh nhất để bị khoá — cùng lý do `vaoLecangs()` chỉ thử đăng nhập một lần.
 */
export async function goi(method, duongDan, body = null, { thuLai401 = true } = {}) {
  const token = await layToken();
  const r = await fetch(HOST + duongDan, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      transId: `dsm-${Date.now()}`,
      transactionSrc: 'allforwood-dsm'
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const txt = await r.text();
  let o = null;
  try { o = JSON.parse(txt); } catch { /* co the la HTML khi loi ha tang */ }

  if (r.status === 401 && thuLai401) {
    await layToken({ epBuoc: true });
    return goi(method, duongDan, body, { thuLai401: false });
  }
  return { code: r.status, body: o, tho: o ? null : txt.slice(0, 300) };
}

/** Lỗi UPS -> chuỗi đọc được. UPS lồng lỗi ở vài chỗ khác nhau tuỳ API. */
export function docLoi(kq) {
  const e = kq.body?.response?.errors || kq.body?.errors ||
            kq.body?.ShipmentResponse?.Response?.Error;
  if (Array.isArray(e) && e.length) return e.map(x => `${x.code}: ${x.message}`).join(' | ');
  return kq.tho || JSON.stringify(kq.body || {}).slice(0, 200);
}
