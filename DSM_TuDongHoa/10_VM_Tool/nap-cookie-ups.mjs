#!/usr/bin/env node
/**
 * ============================================================================
 *  nap-cookie-ups.mjs — nạp phiên UPS từ máy người dùng vào profile trên VM
 * ----------------------------------------------------------------------------
 *    node nap-cookie-ups.mjs <duong-dan-file-cookie>
 *
 *  File đầu vào: dán **nguyên chuỗi sau `-b '` trong lệnh Copy as cURL**, hoặc dán cả
 *  lệnh cURL cũng được (script tự tách).
 *
 *  🔴 VÌ SAO CẦN CÁI NÀY (đo 07–08/08/2026):
 *     Akamai chặn **riêng** `www.ups.com/lasso/login` với trình duyệt trên VM. Đã loại
 *     trừ hết: profile Chrome trắng, xoá cookie Akamai trên đĩa, bỏ cổng CDP, và cả
 *     **Firefox 153** — đều bị chặn; `curl` không cookie thì `302` bình thường.
 *     → Không đăng nhập được từ VM. Nhưng **phiên UPS KHÔNG ràng buộc theo IP**: cookie
 *       tạo ở máy người dùng (IP nhà) dùng tốt trên VM (IP Google Cloud). Và khi đã có
 *       phiên thì không bao giờ chạm `/lasso/login`, nên chặn kia thành vô hại.
 *
 *  ⏱️ **Phiên chỉ sống khoảng 30 phút** (đo 08/08: nạp 00:05, chết 00:32 — trong lúc
 *     ĐANG thao tác liên tục, nên không phải hết hạn do để không).
 *     → Nạp xong là CHẠY NGAY việc cần làm. Đừng khảo sát, đừng thử nghiệm trước.
 *
 *  ⚠️ Chuỗi cookie chính là phiên đăng nhập. File đầu vào nên `chmod 600` và xoá sau khi
 *     dùng. Script không in giá trị cookie ra màn hình.
 * ==========================================================================*/

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const CONG = process.env.DSM_CDP || 'http://127.0.0.1:9223';
const DASHBOARD = 'https://www.ups.com/ppc/dashboard.html?loc=en_US#/companyDashboard';

const duongDan = process.argv[2];
if (!duongDan) {
  console.log('dung: node nap-cookie-ups.mjs <duong-dan-file-cookie>');
  process.exit(2);
}

let raw = (await fs.readFile(duongDan, 'utf8')).trim();
// chấp nhận cả lệnh cURL đầy đủ: lấy phần trong -b '...'
const m = raw.match(/-b\s+'([^']+)'/s);
if (m) raw = m[1];
raw = raw.replace(/\s*\\\s*\n\s*/g, ' ').trim();

const ck = raw.split(/;\s*/).map(s => {
  const i = s.indexOf('=');
  return i < 1 ? null : { name: s.slice(0, i).trim(), value: s.slice(i + 1), domain: '.ups.com', path: '/' };
}).filter(Boolean);

if (!ck.length) { console.log('KHONG doc duoc cookie nao tu file'); process.exit(3); }
const coPhien = ck.some(c => /^(session_ups_com|com\.ups\.ims\.lasso)/.test(c.name));
console.log(`doc duoc ${ck.length} cookie` + (coPhien ? ' (co cookie phien ✅)' : ' ⚠️ KHONG thay cookie phien — co dung trang dashboard khong?'));

const b = await chromium.connectOverCDP(CONG);
const ctx = b.contexts()[0];
const p = ctx.pages().find(x => /ups\.com/.test(x.url())) || ctx.pages()[0];

// Xoá cookie ups.com cũ (phiên chết) rồi nạp bộ mới. Xoá TỪNG cái qua CDP —
// `clearCookies()` xoá sạch mọi domain, hỏng luôn phiên Lecangs.
const cu = (await ctx.cookies()).filter(c => /ups\.com/.test(c.domain));
const cdp = await ctx.newCDPSession(p);
for (const c of cu) await cdp.send('Network.deleteCookies', { name: c.name, domain: c.domain }).catch(() => {});
await ctx.addCookies(ck);
console.log(`da xoa ${cu.length} cookie cu, nap ${(await ctx.cookies()).filter(c => /ups\.com/.test(c.domain)).length} cookie moi`);

await p.goto(DASHBOARD, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
await p.waitForTimeout(18000);
const r = await p.evaluate(() => ({ tt: document.title, url: location.href }));
const ok = !/Access Denied/i.test(r.tt) && !/\/lasso\/(login|error)/.test(r.url);
console.log(ok ? `✅ VAO DUOC — ${r.tt.slice(0, 45)}` : `❌ KHONG VAO DUOC — ${r.tt.slice(0, 45)} @ ${r.url.slice(0, 70)}`);
console.log(`gio nap: ${new Date().toLocaleString('vi-VN')}`);
if (ok) console.log('⏱️ Phien chi song ~30 phut — chay ngay viec can lam.');
await b.close();
process.exit(ok ? 0 : 1);
