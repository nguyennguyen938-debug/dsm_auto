#!/usr/bin/env node
/**
 * ============================================================================
 *  do-phien-ups.mjs — đo phiên UPS sống được bao lâu
 * ----------------------------------------------------------------------------
 *    node do-phien-ups.mjs [phut-nhip] [gio-toi-da]
 *    mặc định: kiểm mỗi 2 phút, bỏ cuộc sau 12 tiếng
 *
 *  Ghi log ra `11_TaiVe/logs/do-phien-ups.log`, dừng ngay khi phiên chết và in
 *  ra sống được bao lâu.
 *
 *  🔴 CÂU HỎI CẦN TRẢ LỜI (chưa biết, tính tới 08/08/2026):
 *     Phiên nạp lúc 00:05 chết lúc 00:32 — khoảng 30 phút. Nhưng lúc đó tôi ĐANG
 *     thao tác liên tục, nên **không phải hết hạn do để không**. Còn hai khả năng
 *     chưa phân biệt được:
 *
 *       a) HẠN TUYỆT ĐỐI ~30 phút kể từ lúc đăng nhập -> không giữ được, phải cấp lại
 *       b) DÙNG CÙNG LÚC TỪ HAI IP (máy người dùng + VM) khiến UPS tự huỷ
 *          -> chỉ cần người dùng đóng tab UPS bên máy mình là xong, khỏi cấp lại
 *
 *  ⚠️ ĐỂ ĐO CHO ĐÚNG, NGƯỜI DÙNG PHẢI **ĐÓNG HẲN TAB UPS TRÊN MÁY MÌNH** trong suốt
 *     thời gian đo. Không thì không phân biệt được (a) với (b).
 *
 *  Cách đọc kết quả:
 *     chết sau ~30 phút dù người dùng không đụng  -> (a) hạn tuyệt đối
 *     sống lâu hơn hẳn                            -> (b) do dùng cùng lúc
 *
 *  Script CHỈ mở trang dashboard, không bấm gì — để không tự làm hỏng phiên, và để
 *  giữ số request ở mức thấp nhất (Akamai đã hạ điểm tín nhiệm IP này ngày 07/08).
 * ==========================================================================*/

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const GOC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const LOG = path.join(GOC, '11_TaiVe', 'logs', 'do-phien-ups.log');
const CONG = process.env.DSM_CDP || 'http://127.0.0.1:9223';
const DASHBOARD = 'https://www.ups.com/ppc/dashboard.html?loc=en_US#/companyDashboard';

const nhip = Number(process.argv[2] || 2) * 60 * 1000;
const toiDa = Number(process.argv[3] || 12) * 60 * 60 * 1000;

const gio = () => new Date().toLocaleTimeString('vi-VN', { hour12: false });
async function ghi(dong) {
  const s = `${gio()}  ${dong}`;
  console.log(s);
  await fs.appendFile(LOG, s + '\n').catch(() => {});
}

const batDau = Date.now();
await ghi(`=== BAT DAU DO — nhip ${nhip / 60000} phut, toi da ${toiDa / 3600000} gio ===`);
await ghi('LUU Y: nguoi dung phai DONG HAN tab UPS tren may minh, khong thi ket qua vo nghia');

let lan = 0;
while (Date.now() - batDau < toiDa) {
  lan++;
  let song = null, chiTiet = '';
  try {
    const b = await chromium.connectOverCDP(CONG);
    const ctx = b.contexts()[0];
    const p = ctx.pages().find(x => /ups\.com/.test(x.url())) || await ctx.newPage();
    await p.goto(DASHBOARD, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    await p.waitForTimeout(14000);
    const r = await p.evaluate(() => ({ tt: document.title, url: location.href }));
    song = !/Access Denied/i.test(r.tt) && !/\/lasso\/(login|error)/.test(r.url);
    chiTiet = `${r.tt.slice(0, 38)}`;
    await b.close();
  } catch (e) {
    chiTiet = 'LOI: ' + e.message.split('\n')[0].slice(0, 70);
  }

  const phut = Math.round((Date.now() - batDau) / 60000);
  if (song === true)  await ghi(`lan ${String(lan).padStart(3)}  +${String(phut).padStart(4)} phut  ✅ CON SONG   ${chiTiet}`);
  else if (song === false) {
    await ghi(`lan ${String(lan).padStart(3)}  +${String(phut).padStart(4)} phut  ❌ DA CHET    ${chiTiet}`);
    await ghi(`=== KET LUAN: phien song duoc ~${phut} phut ===`);
    await ghi(phut < 60 ? '-> gan voi 30 phut: nghieng ve HAN TUYET DOI, phai cap cookie lai'
                        : '-> lau hon han 30 phut: nghieng ve DUNG CUNG LUC 2 IP la thu pham');
    process.exit(0);
  } else await ghi(`lan ${String(lan).padStart(3)}  +${String(phut).padStart(4)} phut  ⚠️ khong ro   ${chiTiet}`);

  await new Promise(r => setTimeout(r, nhip));
}
await ghi(`=== HET ${toiDa / 3600000} gio ma phien VAN SONG — tin rat tot ===`);
