#!/usr/bin/env node
/**
 * kiem-dang-nhap.mjs — thử đăng nhập từng site, báo đúng/sai. KHÔNG làm gì khác.
 *
 *   node kiem-dang-nhap.mjs           # thử mọi site có trong creds.json
 *   node kiem-dang-nhap.mjs lecangs
 *
 * ⚠️ Mật khẩu KHÔNG bao giờ được in ra, kể cả trong thông báo lỗi.
 * ⚠️ Sai mật khẩu thì DỪNG NGAY, không thử lại — nhiều lần sai dễ khoá tài khoản thật.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import * as AACT from './aact.mjs';

const GOC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CREDS = process.env.DSM_CREDS || path.join(GOC, '11_TaiVe', 'creds.json');

async function thuLecangs(browser, cr) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  let ketQua = null;
  // Bắt thẳng response của API đăng nhập — chắc chắn hơn đoán qua DOM
  p.on('response', async r => {
    if (!/\/api\/auth\/oauth\/token/.test(r.url())) return;
    try {
      const o = JSON.parse(await r.text());
      ketQua = o.success === true ? { ok: true } : { ok: false, ly_do: o.message || `code ${o.code}` };
    } catch { /* khong phai JSON */ }
  });
  try {
    await p.goto('https://app.lecangs.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForTimeout(6000);
    await p.fill('#form_item_username', cr.user);
    await p.fill('#form_item_password', cr.pass);
    await p.locator('button:has-text("Sign in")').first().click({ timeout: 20000 });
    await p.waitForTimeout(9000);
    if (ketQua) return ketQua;
    const conPass = await p.locator('input[type=password]').count();
    return conPass === 0 ? { ok: true } : { ok: false, ly_do: 'van o trang dang nhap (khong bat duoc API)' };
  } catch (e) {
    return { ok: false, ly_do: e.message.split('\n')[0].slice(0, 90) };
  } finally { await ctx.close(); }
}

async function thuAact(browser, _cr) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  try {
    const r = await AACT.dangNhap(p);
    return r.ok ? { ok: true } : { ok: false, ly_do: r.noiDen };
  } catch (e) {
    return { ok: false, ly_do: e.message.split('\n')[0].slice(0, 90) };
  } finally { await ctx.close(); }
}

/** UPS có MFA — không tự đăng nhập được, chỉ báo đã có mật khẩu hay chưa. */
async function thuUps(_browser, cr) {
  return { ok: null,
           ly_do: `co user + pass (${cr.pass.length} ky tu) nhung UPS CO MFA — ` +
                  `phai dang nhap tay 1 lan trong profile co dinh, tich "Remember this device for 30 days"` };
}

const THU = { aact: thuAact, lecangs: thuLecangs, ups: thuUps };

const creds = JSON.parse(await fs.readFile(CREDS, 'utf8'));
const chon = process.argv.slice(2).filter(a => THU[a]);
const ds = (chon.length ? chon : Object.keys(THU)).filter(k => creds[k]?.user && creds[k]?.pass);

if (!ds.length) { console.log('Khong co site nao du user+pass trong creds.json.'); process.exit(2); }

const browser = await chromium.launch({ headless: true });
let hong = 0;
try {
  for (const k of ds) {
    process.stdout.write(`${k.padEnd(9)} ... `);
    const r = await THU[k](browser, creds[k]);
    if (r.ok === true) console.log('✅ dang nhap OK');
    else if (r.ok === null) { console.log(`⏸  ${r.ly_do}`); }
    else { hong++; console.log(`❌ ${r.ly_do}`); }
  }
} finally { await browser.close(); }

if (hong) {
  console.log(`\n⚠️  ${hong} site sai mat khau. DUNG chay lai nhieu lan — de khoa tai khoan.`);
  console.log('   Sua bang:  python3 dat-mat-khau.py <site>');
}
process.exit(hong ? 1 : 0);
