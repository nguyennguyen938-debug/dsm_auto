#!/usr/bin/env node
/**
 * ============================================================================
 *  login.mjs — Đăng nhập DSM MỘT LẦN bằng tay, lưu cookie vào storageState.json
 * ----------------------------------------------------------------------------
 *  node login.mjs
 *
 *  Mở Chromium có giao diện. **BẠN tự nhập mật khẩu** — script không đọc,
 *  không lưu mật khẩu, chỉ lưu cookie phiên sau khi đăng nhập xong.
 *
 *  ⚠️ CHẠY TRÊN MÁY CÓ MÀN HÌNH. VM headless thì:
 *     - hoặc chạy file này trên máy cá nhân rồi copy storageState.json lên VM,
 *     - hoặc dùng X11 forwarding / xvfb + VNC.
 *
 *  ⚠️ storageState.json CHỨA COOKIE PHIÊN — coi như mật khẩu.
 *     chmod 600, không commit vào git, không chia sẻ.
 * ==========================================================================*/

import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const STATE = process.env.DSM_STATE || './storageState.json';
const HOME = 'https://dsm.commercehub.com/dsm/gotoHome.do';
const TIMEOUT_MS = 5 * 60 * 1000;     // 5 phút cho bạn đăng nhập

const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext();
const page = await ctx.newPage();

console.log('\n→ Dang mo DSM. Hay dang nhap trong cua so vua mo.');
console.log('  Script tu phat hien khi da vao duoc trang chu, roi luu cookie.\n');

await page.goto(HOME);

const t0 = Date.now();
let ok = false;
while (Date.now() - t0 < TIMEOUT_MS) {
  const url = page.url();
  if (url.includes('dsm.commercehub.com')) {
    const co = await page.locator('#quicksearchOneLineSearchName').count().catch(() => 0);
    if (co > 0) { ok = true; break; }
  }
  await page.waitForTimeout(2000);
}

if (!ok) {
  console.error('\n❌ Het 5 phut ma chua vao duoc trang chu DSM. Khong luu gi ca.\n');
  await browser.close();
  process.exit(1);
}

await ctx.storageState({ path: STATE });
await fs.chmod(STATE, 0o600).catch(() => {});

// Mốc đăng nhập, để giu-session.mjs tính được TUỔI session.
// Không dùng mtime của STATE: giu-session.mjs ghi đè file đó mỗi khi cookie thay đổi.
await fs.writeFile(STATE + '.info.json',
  JSON.stringify({ dangNhapLuc: new Date().toISOString() }, null, 1), { mode: 0o600 }).catch(() => {});

console.log(`\n✅ Da luu ${STATE} (chmod 600).`);
console.log('   Kiem thu:  node run.mjs --dry\n');

await browser.close();
