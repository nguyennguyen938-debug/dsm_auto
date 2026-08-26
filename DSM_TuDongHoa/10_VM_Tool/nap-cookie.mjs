#!/usr/bin/env node
/**
 * ============================================================================
 *  nap-cookie.mjs — nạp cookie từ máy người dùng vào profile trên VM
 * ----------------------------------------------------------------------------
 *  Dùng chung cho mọi site. Trước đây chỉ có `nap-cookie-ups.mjs` (chỉ UPS), nhưng
 *  11/08/2026 phiên **Lecangs** cũng chết và cần đúng cách làm đó — nên tách ra
 *  bản dùng chung thay vì chép file thứ hai.
 *
 *      node nap-cookie.mjs <file-curl> [--domain app.lecangs.com]
 *      node nap-cookie.mjs --stdin --domain app.lecangs.com   < file
 *
 *  Người dùng lấy cookie: mở site đã đăng nhập → F12 → Network → tải lại trang →
 *  dòng đầu tiên → Copy → **Copy as cURL**. Script tự tách phần `-b '...'`
 *  hoặc `-H 'Cookie: ...'`.
 *
 *  🔴 BA ĐIỀU:
 *   1. **Không in cookie ra màn hình.** Nó tương đương mật khẩu; log là nơi người
 *      khác đọc được.
 *   2. **Đóng Chrome đang mở profile TRƯỚC KHI chạy.** Hai tiến trình cùng profile
 *      thì cookie ghi vào có thể bị bản trong bộ nhớ của tiến trình kia đè lại.
 *   3. **Xoá `SingletonLock` trước khi mở** — khoá sót lại làm profile mở ra mà
 *      KHÔNG nạp được cookie, rồi mọi thứ báo "hết phiên" trong khi cookie vẫn còn.
 *      Mất một buổi vì chuyện này (11/08); `moContext()` nay cũng đã tự xoá.
 * ==========================================================================*/

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { donKhoaSot } from './phien.mjs';

const GOC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PROFILE = process.env.DSM_PROFILE || path.join(GOC, '11_TaiVe', '.profile-ground');

const argv = process.argv.slice(2);
const domainCo = (() => { const i = argv.indexOf('--domain'); return i >= 0 ? argv[i + 1] : null; })();
const tepCurl = argv.find(a => !a.startsWith('--') && a !== domainCo);

/** Tách chuỗi cookie từ lệnh cURL (`-b '...'` hoặc `-H 'Cookie: ...'`). */
function tachCookie(vanBan) {
  let m = vanBan.match(/-b\s+'([^']*)'/s) || vanBan.match(/-b\s+"([^"]*)"/s);
  if (!m) m = vanBan.match(/-H\s+'cookie:\s*([^']*)'/is) || vanBan.match(/-H\s+"cookie:\s*([^"]*)"/is);
  // Không phải cURL mà dán thẳng chuỗi cookie cũng chấp nhận.
  if (!m && /=/.test(vanBan) && !/^\s*curl/i.test(vanBan)) return vanBan.trim();
  return m ? m[1] : null;
}

/** Đoán domain từ chính lệnh cURL nếu người dùng không truyền `--domain`. */
function doanDomain(vanBan) {
  const m = vanBan.match(/--url\s+'https?:\/\/([^/'"]+)/i) || vanBan.match(/'https?:\/\/([^/'"]+)/i);
  return m ? m[1] : null;
}

async function main() {
  const vanBan = tepCurl ? await fs.readFile(tepCurl, 'utf8')
                         : await new Promise(ok => { let s = ''; process.stdin.on('data', d => s += d); process.stdin.on('end', () => ok(s)); });

  const chuoi = tachCookie(vanBan);
  if (!chuoi) {
    console.error('\n❌ Khong tach duoc cookie. Lenh cURL phai co doan -b \'...\' hoac -H \'Cookie: ...\'.\n' +
                  '   Copy as cURL o dong DOCUMENT (trang html), khong phai request phu.\n');
    process.exit(2);
  }
  const domain = domainCo || doanDomain(vanBan);
  if (!domain) { console.error('\n❌ Khong biet domain. Them --domain <host>.\n'); process.exit(2); }

  /* 🔴 PHẢI ĐẶT `expires`, nếu không cookie là SESSION COOKIE và bị xoá sạch ngay khi
   *    `ctx.close()` — nạp xong mở lại thấy profile rỗng, rồi tưởng cookie sai.
   *    (Đo 11/08: nạp 3 cookie Lecangs, mở lại còn 0.)
   *
   *    Hạn lấy từ chính JWT nếu đọc được (`exp` trong payload), vì cookie phiên của
   *    Lecangs mang token có hạn thật; đọc được thì khỏi đoán. Không đọc được thì
   *    mặc định 7 ngày — dài hơn hạn thật cũng vô hại, server vẫn là bên quyết định. */
  const hanTuJwt = (v) => {
    try {
      const t = decodeURIComponent(v).replace(/^Bearer\s+/i, '');
      const p = JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString('utf8'));
      return Number.isFinite(p.exp) ? p.exp : null;
    } catch { return null; }
  };
  const macDinh = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  const host = domain.replace(/^\./, '');

  const ds = chuoi.split(';').map(s => s.trim()).filter(Boolean).map(kv => {
    const i = kv.indexOf('=');
    const name = kv.slice(0, i).trim(), value = kv.slice(i + 1).trim();
    return { name, value, domain: host, path: '/',
             expires: hanTuJwt(value) || macDinh, httpOnly: false, secure: true };
  }).filter(c => c.name && c.value);

  if (!ds.length) { console.error('\n❌ Chuoi cookie rong.\n'); process.exit(2); }
  // Chỉ in TÊN cookie, không in giá trị (điều 1 ở đầu file).
  console.log(`doc duoc ${ds.length} cookie cho ${domain}: ${ds.map(c => c.name).join(', ')}`);

  await donKhoaSot();   // dung neu profile dang bi tien trinh khac giu (xem phien.mjs)
  const ctx = await chromium.launchPersistentContext(PROFILE, { headless: true });
  try {
    const cu = (await ctx.cookies()).filter(c => (c.domain || '').includes(domain.replace(/^\./, '')));
    console.log(`profile dang co ${cu.length} cookie cua ${domain}`);
    await ctx.addCookies(ds);
    const moi = (await ctx.cookies()).filter(c => (c.domain || '').includes(host));
    console.log(`da nap — trong phien nay co ${moi.length} cookie`);
  } finally {
    // Profile chỉ ghi đầy đủ khi đóng sạch; đóng bằng kill là mất cookie vừa nạp.
    await ctx.close();
  }

  /* KIỂM LẠI BẰNG MỘT CONTEXT MỚI. Kiểm ngay trước khi đóng thì luôn thấy đủ, kể cả
   * khi cookie là session và sắp bị vứt — đúng cái đã lừa tôi ở lần chạy trước. */
  await donKhoaSot();   // dung neu profile dang bi tien trinh khac giu (xem phien.mjs)
  const ctx2 = await chromium.launchPersistentContext(PROFILE, { headless: true });
  const conLai = (await ctx2.cookies()).filter(c => (c.domain || '').includes(host));
  await ctx2.close();
  if (!conLai.length) {
    console.error(`\n❌ Mo lai profile thi KHONG con cookie nao cua ${host} — nap that bai.\n`);
    process.exit(3);
  }
  console.log(`✅ mo lai profile van con ${conLai.length} cookie: ${conLai.map(c => c.name).join(', ')}`);
  console.log('\n⏱️ Nap xong thi CHAY NGAY viec can lam — phien co han.');
}

main().catch(e => { console.error('\n❌ ' + e.message + '\n'); process.exit(1); });
