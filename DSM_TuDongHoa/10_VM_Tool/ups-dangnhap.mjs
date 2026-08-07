/**
 * ============================================================================
 *  ups-dangnhap.mjs — đăng nhập UPS tự động (Auth0 Universal Login) + điền mã MFA
 * ----------------------------------------------------------------------------
 *  Chạy thử:   node ups-dangnhap.mjs --thu      (dùng profile .profile-thu)
 *  Thật:       import { dangNhapUps } from './ups-dangnhap.mjs'
 *
 *  🔴 ĐỌC TRƯỚC KHI SỬA — bốn thứ đo được ngày 07/08/2026, mỗi thứ tốn một vòng thử:
 *
 *  1. Trang đăng nhập KHÔNG nằm ở `www.ups.com`. `/lasso/login` chỉ là stub, nó 302
 *     sang **`id.ups.com/authorize`** rồi tới `id.ups.com/u/login/identifier` (Auth0).
 *
 *  2. `Access Denied` của Akamai là do **COOKIE `_abck` BỊ ĐÁNH DẤU BOT**, KHÔNG phải
 *     do IP, không phải do headless, không phải do `navigator.webdriver`.
 *     Đã loại trừ từng cái: chrome trần + CDP (webdriver=false) vẫn bị chặn; curl kèm
 *     đủ header thì qua. Xoá nhóm cookie Akamai là vào được ngay.
 *     → `xoaCookieAkamai()` phải chạy TRƯỚC khi mở trang đăng nhập.
 *
 *  3. Có **HAI nút `Continue`** cùng `name=action`. Cái nhỏ 56×14 là
 *     `ulp-hidden-form-submit-button` (`opacity:0; pointer-events:none`) — bấm vào
 *     KHÔNG có tác dụng và cũng không báo lỗi. Cái thật 332×52.
 *     → `bamNut()` chọn theo KÍCH THƯỚC, đừng bao giờ dùng `.first()`.
 *     (Đúng họ với bẫy "3 phần tử chữ Go" trên DSM — xem CLAUDE.md mục 5.)
 *
 *  4. ⛔ **CHẶN THẬT, CHƯA VƯỢT ĐƯỢC: Cloudflare Turnstile.**
 *     Form có `input[name=captcha]`; Auth0 chỉ đi tiếp khi ô đó có token. Trên VM này
 *     Turnstile chạy nhưng KHÔNG sinh ra token (`captcha` rỗng), nên bấm Continue là
 *     im lặng đứng yên — KHÔNG có thông báo lỗi nào hiện ra.
 *     Một phần nguyên nhân: `brunhild.challenges.cloudflare.com` **chỉ có bản ghi AAAA**
 *     mà VM không có IPv6 → `ERR_ADDRESS_UNREACHABLE`. Ép về IPv4 bằng
 *     `--host-resolver-rules` thì hết lỗi mạng đó nhưng token VẪN rỗng.
 *     → Hàm này DỪNG và báo rõ khi gặp, để người dùng đăng nhập tay qua VNC.
 *        KHÔNG viết thêm gì để né Turnstile.
 *
 *  Hệ quả: bước 1 (tên đăng nhập) đã kiểm chứng tới tận nút bấm. Bước 2 (mật khẩu) và
 *  bước 3 (mã MFA) **chưa chạy qua được lần nào** vì bị Turnstile chặn trước đó, nên
 *  chúng được viết theo lối DÒ TẠI CHỖ + ghi log, không hard-code selector chưa thấy.
 * ==========================================================================*/

import fs from 'node:fs/promises';
import path from 'node:path';
import { docCreds, layMaUps } from './phien.mjs';

/* 🔴 CANH BAO — LOI DA GAY THIET HAI THAT, 07/08/2026.
 * `phien.mjs` tinh hang `PROFILE` NGAY LUC NAP MODULE:
 *     export const PROFILE = process.env.DSM_PROFILE || <mac dinh .profile-ground>
 * Dat `process.env.DSM_PROFILE` SAU cau `import` la VO NGHIA — import da chay xong.
 * Vi loi nay, `node ups-dangnhap.mjs --thu` tuong chay tren ban sao `.profile-thu`
 * nhung THUC TE chay tren `.profile-ground` that, va `xoaCookieAkamai()` xoa luon
 * cookie phien UPS dang song. Phai khoi phuc tu ban sao luu.
 * -> Doi profile PHAI lam bang bien moi truong TU BEN NGOAI:
 *        DSM_PROFILE=/duong/dan/.profile-thu node ups-dangnhap.mjs
 *    KHONG bao gio dat lai trong code sau khi da import phien.mjs. */

const GOC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const LOG = path.join(GOC, '11_TaiVe', 'logs');

const DANG_NHAP = 'https://www.ups.com/lasso/login?loc=en_US';
const BANG = 'https://www.ups.com/ppc/dashboard.html?loc=en_US#/companyDashboard';

/** Cookie do Akamai đặt. Xoá hết nhóm này là reset "lý lịch bot" của profile. */
const COOKIE_AKAMAI = /^(_abck|bm_sz|bm_sv|bm_s|bm_so|bm_lso|ak_bmsc|AKA_A2)$/;

export async function xoaCookieAkamai(ctx) {
  const cu = await ctx.cookies();
  await ctx.clearCookies();
  await ctx.addCookies(cu.filter(c => !COOKIE_AKAMAI.test(c.name)));
  return cu.length - (await ctx.cookies()).length;
}

/** Ghi lại trạng thái trang để soi khi hỏng. Trả về object đã ghi. */
async function ghiHienTrang(page, ten) {
  const r = await page.evaluate(() => ({
    url: location.href, tieuDe: document.title,
    o: [...document.querySelectorAll('input')]
        .filter(e => e.offsetParent || e.getClientRects().length)
        .map(e => ({ type: e.type, id: e.id || '', name: e.name || '', ph: e.placeholder || '' })),
    nut: [...document.querySelectorAll('button,input[type=submit]')]
        .filter(e => e.offsetParent || e.getClientRects().length)
        .map(e => { const b = e.getBoundingClientRect();
          return { name: e.name || '', txt: (e.innerText || e.value || '').trim().slice(0, 30),
                   kt: `${Math.round(b.width)}x${Math.round(b.height)}` }; }),
    loi: [...document.querySelectorAll('[role=alert]')]
        .filter(e => e.offsetParent || e.getClientRects().length)
        .map(e => (e.innerText || '').trim()).filter(Boolean),
    chu: document.body.innerText.replace(/\s+/g, ' ').slice(0, 400)
  }));
  await fs.mkdir(LOG, { recursive: true }).catch(() => {});
  await fs.writeFile(path.join(LOG, `ups-${ten}.json`), JSON.stringify(r, null, 1)).catch(() => {});
  await page.screenshot({ path: path.join(LOG, `ups-${ten}.png`) }).catch(() => {});
  return r;
}

/**
 * Bấm nút theo chữ, CHỌN THEO KÍCH THƯỚC.
 * Auth0 để một nút submit ẩn (56×14, opacity 0) cùng tên với nút thật (332×52).
 * Bấm nhầm nút ẩn thì không có gì xảy ra và cũng không có lỗi — rất khó lần ra.
 */
async function bamNut(page, chu, { rongToiThieu = 150, caoToiThieu = 30 } = {}) {
  const l = page.locator('button[name=action], button[type=submit]').filter({ hasText: chu });
  const n = await l.count();
  for (let i = 0; i < n; i++) {
    const b = await l.nth(i).boundingBox();
    if (b && b.width >= rongToiThieu && b.height >= caoToiThieu) {
      await l.nth(i).click({ timeout: 25000 });
      return true;
    }
  }
  return false;
}

/** Gõ như người: fill() không phải lúc nào cũng kích hoạt sự kiện của Auth0. */
async function go(page, chon, giaTri) {
  const o = page.locator(chon).first();
  await o.click();
  await o.fill('');
  await o.pressSequentially(giaTri, { delay: 80 });
}

/** Turnstile đã sinh token chưa? -1 = không có ô captcha, 0 = có mà rỗng. */
async function tokenCaptcha(page) {
  return page.evaluate(() => {
    const t = document.querySelector('input[name=captcha], input[name*="cf-turnstile"]');
    return t ? (t.value || '').length : -1;
  });
}

/**
 * Đăng nhập UPS đầy đủ. Ném lỗi kèm hướng dẫn nếu không qua được.
 *
 * @param page  trang Playwright trong profile cố định (headful, DISPLAY=:99)
 * @param ctx   context — cần để xoá cookie Akamai
 */
export async function dangNhapUps(page, ctx) {
  const cr = await docCreds('ups');
  if (!cr.user || !cr.pass) throw new Error('creds.json thieu ups.user / ups.pass');

  const soXoa = await xoaCookieAkamai(ctx);
  console.log(`  da xoa ${soXoa} cookie Akamai (chong "Access Denied")`);

  await page.goto(DANG_NHAP, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(18000);

  let ht = await ghiHienTrang(page, 'b1-ten');
  if (/Access Denied/i.test(ht.tieuDe)) {
    throw new Error('UPS: Akamai van tra Access Denied sau khi da xoa cookie. ' +
                    'Xem 11_TaiVe/logs/ups-b1-ten.png. Dang nhap tay qua VNC.');
  }

  /* ---- Bước 1: tên đăng nhập (ĐÃ KIỂM CHỨNG tới nút bấm) ---- */
  if (!ht.o.some(x => x.id === 'username')) {
    throw new Error(`UPS: khong thay o #username. Trang dang o: ${ht.url.slice(0, 90)}`);
  }
  await go(page, '#username', cr.user);
  await page.waitForTimeout(8000);

  const tok = await tokenCaptcha(page);
  if (tok === 0) {
    // ⛔ Đây là chỗ chặn thật, gặp 07/08/2026. Bấm Continue lúc này KHÔNG báo lỗi,
    //    trang chỉ đứng yên — nên phải chặn ở đây, không thì rất khó chẩn đoán.
    throw new Error(
      'UPS: Cloudflare Turnstile chua sinh duoc token (o captcha rong) — bam Continue se ' +
      'IM LANG dung yen, khong bao loi. Day la co che chong bot cua UPS, KHONG ne. ' +
      'Cach lam: dang nhap tay qua VNC (10_VM_Tool/vnc.sh bat && ./vnc.sh trinhduyet), ' +
      'phien se nam trong profile va moi thu con lai chay tu dong.');
  }

  if (!await bamNut(page, 'Continue')) {
    throw new Error('UPS: khong thay nut Continue du to (nut an 56x14 khong tinh). ' +
                    'Xem 11_TaiVe/logs/ups-b1-ten.json');
  }
  await page.waitForTimeout(15000);

  /* ---- Bước 2: mật khẩu — CHƯA CHẠY QUA LẦN NÀO, dò tại chỗ ---- */
  ht = await ghiHienTrang(page, 'b2-matkhau');
  if (!ht.o.some(x => x.type === 'password')) {
    throw new Error(`UPS buoc 2: khong thay o mat khau. url=${ht.url.slice(0, 90)} ` +
                    `loi=${JSON.stringify(ht.loi)}. Xem 11_TaiVe/logs/ups-b2-matkhau.png`);
  }
  await go(page, 'input[type=password]', cr.pass);
  await page.waitForTimeout(3000);
  if (!await bamNut(page, 'Continue') && !await bamNut(page, 'Log In') && !await bamNut(page, 'Sign In')) {
    throw new Error('UPS buoc 2: khong bam duoc nut gui mat khau. Xem log ups-b2-matkhau.json');
  }
  await page.waitForTimeout(18000);

  /* ---- Bước 3: mã MFA — CHƯA CHẠY QUA LẦN NÀO ---- */
  ht = await ghiHienTrang(page, 'b3-ma');
  const oMa = ht.o.find(x => /code|otp|passcode|mfa/i.test(`${x.id} ${x.name} ${x.ph}`));
  if (oMa) {
    console.log(`  UPS hoi ma MFA (o "${oMa.id || oMa.name}") — dang doi thu ve...`);
    const ma = await layMaUps({ choToiDa: 150 });          // CHUỖI, có thể có số 0 đầu
    console.log(`  lay duoc ma ${ma.length} chu so`);
    await go(page, oMa.id ? `#${oMa.id}` : `input[name="${oMa.name}"]`, ma);
    await page.waitForTimeout(2500);
    // "Remember this device" — tích nếu có, để lần sau đỡ phải hỏi mã
    const nho = page.locator('input[type=checkbox]').first();
    if (await nho.count() && !await nho.isChecked().catch(() => true)) {
      await nho.check({ timeout: 8000 }).catch(() => {});
    }
    if (!await bamNut(page, 'Continue') && !await bamNut(page, 'Verify') && !await bamNut(page, 'Submit')) {
      throw new Error('UPS buoc 3: khong bam duoc nut xac nhan ma. Xem log ups-b3-ma.json');
    }
    await page.waitForTimeout(20000);
  }

  /* ---- Kiểm kết quả ---- */
  await page.goto(BANG, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(14000);
  const cuoi = await ghiHienTrang(page, 'b4-ketqua');
  const xong = !/Access Denied/i.test(cuoi.tieuDe) && !cuoi.o.some(x => x.type === 'password');
  if (!xong) throw new Error(`UPS: dang nhap xong nhung van chua vao duoc bang dieu khien. ` +
                             `title=${cuoi.tieuDe} url=${cuoi.url.slice(0, 90)}`);
  return { ok: true, url: cuoi.url };
}

/* ------------------------------------------------------------- chạy thử ---- */
if (import.meta.url === `file://${process.argv[1]}`) {
  // KHONG dat process.env.DSM_PROFILE o day — xem canh bao dau file. Phai truyen tu ngoai.
  const { PROFILE } = await import('./phien.mjs');
  console.log(`profile dang dung THAT SU: ${PROFILE}`);
  if (process.argv.includes('--thu') && /\.profile-ground$/.test(PROFILE)) {
    console.log('DUNG LAI: --thu nhung dang tro vao .profile-ground (profile THAT).\n' +
                'Chay dung cach:  DSM_PROFILE=<duong/dan>/.profile-thu node ups-dangnhap.mjs --thu');
    process.exit(2);
  }
  // PHAI di duong CDP: Playwright tu khoi chay thi Akamai chan — xem chu thich moContextCDP
  const { moContextCDP } = await import('./phien.mjs');
  const ket = await moContextCDP();
  try {
    console.log(JSON.stringify(await dangNhapUps(ket.page, ket.ctx)));
  } catch (e) {
    console.log('THAT BAI:', e.message);
    process.exitCode = 1;
  } finally { await ket.dong(); }
}
