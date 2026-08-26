/**
 * ============================================================================
 *  phien.mjs — mở trình duyệt dùng PROFILE CỐ ĐỊNH, và tự vào lại khi hết phiên
 * ----------------------------------------------------------------------------
 *  Mọi thao tác web của nhánh GROUND (UPS + Lecangs) đi qua đây.
 *
 *  🔴 BA ĐIỀU BẮT BUỘC, đều là kết quả đo thật ngày 07/08/2026:
 *
 *  1. PHẢI dùng `launchPersistentContext` trỏ vào `11_TaiVe/.profile-ground`.
 *     Phiên Lecangs, phiên UPS, và dấu "Remember this device 30 days" của UPS
 *     đều nằm trong profile — mở context tạm là mất hết.
 *
 *  2. PHẢI chạy HEADFUL trên màn hình ảo (`DISPLAY=:99`).
 *     Akamai của UPS chặn headless: `ERR_HTTP2_PROTOCOL_ERROR`. Đặt `userAgent`
 *     thật KHÔNG cứu được — đã thử. `curl` trần cũng bị chặn, `curl` kèm
 *     `sec-ch-ua`/`sec-fetch-mode` thì qua. Lecangs và AACT thì headless vẫn chạy,
 *     nhưng dùng chung một đường cho gọn.
 *
 *  3. Vào lại Lecangs bằng **mật khẩu Chrome đã lưu**, KHÔNG phải `creds.json`.
 *     Chrome tự điền sẵn cả user lẫn pass khi mở trang đăng nhập trong profile này;
 *     chỉ việc bấm Sign in (kiểm 07/08: API trả `success:true`).
 *     `creds.json` để trống `lecangs.pass` có chủ ý — mật khẩu từng điền vào đó bị
 *     báo sai, và thử nhiều lần dễ khoá tài khoản thật.
 * ==========================================================================*/

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const GOC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const PROFILE = process.env.DSM_PROFILE || path.join(GOC, '11_TaiVe', '.profile-ground');
const CREDS = process.env.DSM_CREDS || path.join(GOC, '11_TaiVe', 'creds.json');
const MAN_HINH = process.env.DISPLAY || ':99';

/** Màn hình ảo có sẵn chưa? Không có thì mọi thứ headful sẽ chết. */
export async function coManHinh() {
  const { execFile } = await import('node:child_process');
  return new Promise(ok => execFile('xdpyinfo', ['-display', MAN_HINH], e => ok(!e)));
}

/**
 * Mở context. NHỚ gọi `await ctx.close()` — profile chỉ được ghi đầy đủ khi đóng sạch.
 * @param headless chỉ đặt true khi CHẮC CHẮN không đụng ups.com.
 */
/**
 * Dọn `SingletonLock` — nhưng CHỈ khi nó là khoá sót của tiến trình đã chết.
 *
 * 🔴 Nền: Chrome đặt khoá này để hai tiến trình không mở cùng profile. Lần chạy trước
 *    thoát không sạch thì khoá ở lại, và `launchPersistentContext` mở profile nhưng
 *    **KHÔNG nạp được cookie** -> `vaoLecangs()` thấy trang đăng nhập rồi báo "hết
 *    phiên", trong khi `OMS-Token` vẫn còn hạn tới 18/08. Mất cả buổi 11/08 vì tưởng
 *    phiên chết thật và suýt đăng nhập lại — mà đăng nhập lại chính là thứ nguy hiểm
 *    với tài khoản đã có 6 lần sai.
 *
 * 🔴 Nhưng bản 11/08 xoá khoá VÔ ĐIỀU KIỆN, và thế là mất luôn tác dụng bảo vệ:
 *    hai tiến trình cùng mở profile thì cái thứ hai đè cái thứ nhất thay vì bị chặn.
 *    Chạy tay `nap-cookie.mjs` hay `kiem-phien-lecangs.mjs` đúng lúc cron đang chạy
 *    là hỏng phiên — mà xin lại cookie Lecangs phải nhờ người dùng.
 *    -> Đọc PID trong khoá, còn sống thì DỪNG, chết rồi mới xoá. (Sửa 13/08/2026.)
 *
 * ⛔ KHÔNG dùng `pgrep`/`pkill` ở đây — máy này chạy chung với `/opt/wayfair`, xem
 *    CLAUDE.md quy tắc 10. `process.kill(pid, 0)` chỉ HỎI tiến trình còn sống không,
 *    không gửi tín hiệu gì.
 */
export async function donKhoaSot() {
  const khoa = path.join(PROFILE, 'SingletonLock');
  let dich;
  try { dich = await fs.readlink(khoa); }
  catch { return; }                       // không có khoá, hoặc không phải symlink -> kệ

  // Chrome ghi symlink dạng `<hostname>-<pid>`
  const m = /-(\d+)$/.exec(dich);
  const pid = m ? Number(m[1]) : NaN;
  if (Number.isFinite(pid) && pid > 0) {
    let song = false;
    try { process.kill(pid, 0); song = true; }         // chỉ hỏi, KHÔNG giết
    catch (e) { song = e.code === 'EPERM'; }           // EPERM = còn sống, của user khác
    if (song) {
      throw new Error(
        `profile ${PROFILE} dang bi tien trinh ${pid} giu (SingletonLock -> ${dich}).\n` +
        `   Doi no xong roi chay lai. Neu chac chan tien trinh do da treo, tat no theo PID ` +
        `roi chay lai — DUNG xoa tay file SingletonLock khi Chrome con song.`);
    }
  }
  await fs.rm(khoa, { force: true }).catch(() => {});
}

export async function moContext({ headless = false } = {}) {
  if (!headless && !await coManHinh()) {
    throw new Error(`khong co man hinh ${MAN_HINH} — chay "10_VM_Tool/vnc.sh bat" truoc`);
  }
  await donKhoaSot();

  return chromium.launchPersistentContext(PROFILE, {
    headless,
    viewport: { width: 1500, height: 950 },
    acceptDownloads: true,
    env: { ...process.env, DISPLAY: MAN_HINH }
  });
}

/**
 * Mở context bằng cách KHỞI CHẠY CHROME TRẦN rồi gắn qua CDP.
 *
 * 🔴 Vì sao phải có đường này bên cạnh `moContext()` — đo 07/08/2026:
 *    Akamai của UPS chặn trình duyệt do **Playwright tự khởi chạy** (`Access Denied`
 *    trên `/lasso/login`), kể cả khi đã xoá cookie `_abck`. Cùng profile đó, khởi chạy
 *    chrome trần rồi `connectOverCDP` thì VÀO ĐƯỢC. Playwright thêm một loạt cờ
 *    (`--enable-automation`, `--disable-popup-blocking`, …) mà Akamai nhận ra.
 *    Lecangs/AACT không quan tâm — chỉ UPS mới cần đường này.
 *
 * ⚠️ `ctx.close()` KHÔNG tắt chrome (mình không khởi chạy nó qua Playwright).
 *    Dùng `ket.dong()` để tắt đúng PID.
 */
export async function moContextCDP({ cong = 9222 } = {}) {
  if (!await coManHinh()) throw new Error(`khong co man hinh ${MAN_HINH} — chay "10_VM_Tool/vnc.sh bat" truoc`);
  const { execFile, spawn } = await import('node:child_process');
  const os = await import('node:os');

  const ds = await fs.readdir(path.join(os.homedir(), '.cache', 'ms-playwright'));
  const thuMuc = ds.filter(d => d.startsWith('chromium-')).sort().pop();
  if (!thuMuc) throw new Error('khong thay chromium cua playwright');
  const CHROME = path.join(os.homedir(), '.cache', 'ms-playwright', thuMuc, 'chrome-linux64', 'chrome');

  // brunhild.challenges.cloudflare.com CHI co ban ghi AAAA ma VM khong co IPv6.
  // Ep no ve IPv4 cua Cloudflare, khong thi Turnstile bao ERR_ADDRESS_UNREACHABLE.
  let ip4 = '';
  try {
    const dns = await import('node:dns/promises');
    ip4 = (await dns.resolve4('challenges.cloudflare.com'))[0] || '';
  } catch { /* khong sao, chi mat mot nguyen nhan */ }

  await donKhoaSot();
  const cha = spawn(CHROME, [
    `--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${cong}`, '--window-size=1500,950',
    ...(ip4 ? [`--host-resolver-rules=MAP brunhild.challenges.cloudflare.com ${ip4}`] : []),
    'about:blank'
  ], { detached: true, stdio: 'ignore', env: { ...process.env, DISPLAY: MAN_HINH } });
  cha.unref();

  const { chromium } = await import('playwright');
  let b = null;
  for (let i = 0; i < 30 && !b; i++) {
    await new Promise(r => setTimeout(r, 2000));
    b = await chromium.connectOverCDP(`http://127.0.0.1:${cong}`).catch(() => null);
  }
  if (!b) { try { process.kill(cha.pid); } catch {} throw new Error('chrome khong len CDP sau 60s'); }

  const ctx = b.contexts()[0];
  return { ctx, page: ctx.pages()[0] || await ctx.newPage(), pid: cha.pid,
           dong: async () => { await b.close().catch(() => {}); try { process.kill(cha.pid); } catch {} } };
}

/* --------------------------------------------------------------- Lecangs ---- */

const LEC_TRANG_CHU = 'https://app.lecangs.com/oms/inventory';
const LEC_DANG_NHAP = 'https://app.lecangs.com/oms?redirect=/oms/inventory';

/**
 * Đảm bảo đã đăng nhập Lecangs. Còn phiên thì thôi; hết thì để Chrome tự điền
 * rồi bấm Sign in.
 * ⚠️ Chỉ thử ĐÚNG MỘT LẦN. Sai thì ném lỗi, KHÔNG lặp — Lecangs đã có 6 lần
 *    đăng nhập sai trong lịch sử, thử thêm dễ khoá tài khoản.
 */
export async function vaoLecangs(page) {
  await page.goto(LEC_TRANG_CHU, { waitUntil: 'domcontentloaded', timeout: 70000 });
  await page.waitForTimeout(7000);
  if (!await page.locator('#form_item_password').count()) return { ok: true, daDangNhapLai: false };

  // Hết phiên -> trang đăng nhập. Mở lại đúng URL đăng nhập để Chrome tự điền.
  await page.goto(LEC_DANG_NHAP, { waitUntil: 'domcontentloaded', timeout: 70000 });
  await page.waitForTimeout(8000);

  const dien = await page.evaluate(() => ({
    user: (document.getElementById('form_item_username') || {}).value || '',
    soKyTu: ((document.getElementById('form_item_password') || {}).value || '').length
  }));
  if (!dien.user || !dien.soKyTu) {
    throw new Error('Lecangs het phien va Chrome KHONG tu dien duoc. Vao VNC dang nhap tay ' +
                    '(10_VM_Tool/vnc.sh bat). DUNG doan mat khau — tai khoan de bi khoa.');
  }

  let api = null;
  const nghe = async r => {
    if (!/\/api\/auth\/oauth\/token/.test(r.url())) return;
    try { const o = JSON.parse(await r.text()); api = o.success === true ? null : (o.message || `code ${o.code}`); }
    catch { /* khong phai JSON */ }
  };
  page.on('response', nghe);
  await page.locator('button:has-text("Sign in")').first().click({ timeout: 20000 });
  await page.waitForTimeout(11000);
  page.off('response', nghe);

  if (api) throw new Error(`Lecangs tu dang nhap lai THAT BAI: ${api}. KHONG thu lai — de khoa tai khoan.`);
  if (await page.locator('#form_item_password').count()) {
    throw new Error('Lecangs: bam Sign in xong van o trang dang nhap');
  }
  return { ok: true, daDangNhapLai: true, user: dien.user };
}

/* ------------------------------------------------------------------- UPS ---- */

const UPS_BANG = 'https://www.ups.com/ppc/dashboard.html?loc=en_US#/companyDashboard';
const WEBAPP = process.env.DSM_WEBAPP ||
  'https://script.google.com/macros/s/AKfycbzzJCEgWBcO76OcbhJIdiHGlJEgbWxq7FFEGbIwwpQe2gmtOalVOXziJXFyuI1Ckrtn-Q/exec';

/**
 * Lấy mã MFA của UPS từ hộp thư `info@allforwood.com`, qua web app Apps Script
 * (action `maUps` trong `02_AppsScript/MaDangNhap_UPS.gs`). Không cần mật khẩu Gmail.
 *
 * 🔴 BA ĐIỀU PHẢI NHỚ:
 *  1. Mã trả về là **CHUỖI**, có thể bắt đầu bằng số 0 (đã gặp `061310`).
 *     Đừng parseInt, đừng Number() — mất số 0 đầu là mã sai.
 *  2. Web app chỉ nhìn lại 5 phút, đúng bằng hạn UPS ghi trong thư. Nên PHẢI
 *     bấm "gửi mã" TRƯỚC rồi mới gọi hàm này, không phải ngược lại.
 *  3. Thư đến chậm vài chục giây. Hàm tự hỏi lại mỗi `nhip` giây cho tới `choToiDa`.
 *
 * @param maCu mã của lần trước (nếu có) — để không nhận nhầm lại mã cũ chưa hết hạn.
 * @returns chuỗi mã, hoặc ném lỗi nếu quá hạn chờ.
 */
export async function layMaUps({ maCu = null, choToiDa = 150, nhip = 10 } = {}) {
  const khoa = (await docCreds('upsMa')).khoa;
  if (!khoa) throw new Error('creds.json thieu upsMa.khoa — chay TAO_KHOA_UPS() trong Apps Script');

  const hetLuc = Date.now() + choToiDa * 1000;
  let lanCuoi = '(chua goi)';
  while (Date.now() < hetLuc) {
    const u = `${WEBAPP}?action=maUps&khoa=${encodeURIComponent(khoa)}&phut=5`;
    let o = null;
    try {
      const r = await fetch(u, { redirect: 'follow' });
      const t = await r.text();
      // Apps Script thinh thoang tra nguyen trang HTML — bo qua, vong sau goi lai
      if (t.trim().startsWith('<')) { lanCuoi = 'web app tra HTML'; }
      else o = JSON.parse(t);
    } catch (e) { lanCuoi = e.message.slice(0, 80); }

    if (o) {
      if (o.ok === false) throw new Error(`maUps tu choi: ${o.error}`);   // khoa sai -> dung han
      if (o.ma && o.ma !== maCu) return String(o.ma);
      lanCuoi = o.ma ? `van la ma cu ${o.ma}` : (o.ghiChu || 'chua co thu');
    }
    await new Promise(r => setTimeout(r, nhip * 1000));
  }
  throw new Error(`khong lay duoc ma UPS sau ${choToiDa}s (lan cuoi: ${lanCuoi}). ` +
                  'Kiem: da bam gui ma chua, va thu co ve info@allforwood.com khong.');
}

/**
 * Đảm bảo đã đăng nhập UPS.
 * Còn phiên thì thôi. Hết phiên thì BÁO LỖI chứ không tự đăng nhập.
 *
 * ⚠️ Mã MFA giờ đã lấy tự động được (`layMaUps()`), nhưng vẫn CỐ Ý không tự đăng nhập:
 *    `creds.json` ghi `ups.user = info@allforwood.com`, còn CLAUDE.md mục 8 ghi tên
 *    đăng nhập thật là `allforwood`. Hai nguồn nói khác nhau, chưa ai xác nhận cái nào
 *    đúng. Đăng nhập sai tên là đúng con đường đã làm hỏng tài khoản Lecangs
 *    (6 lần sai). Chốt được tên đăng nhập rồi mới nối `layMaUps()` vào đây.
 */
export async function vaoUps(page) {
  await page.goto(UPS_BANG, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(10000);
  const r = await page.evaluate(() => ({
    url: location.href,
    tieuDe: document.title,
    coNutLogIn: /\bLog In\b/.test(document.body.innerText.slice(0, 2000)),
    coOPass: document.querySelectorAll('input[type=password]').length > 0
  }));
  // 🔴 Trang "Access Denied" của Akamai KHONG co chu "Log In" va KHONG co o mat khau,
  //    nen hai dieu kien duoi day deu dung -> ham nay tung bao ok:true khi that ra da
  //    mat phien (gap 07/08/2026, bao nham roi chay tiep xuong form). Phai kiem CA URL.
  const biday = /\/lasso\/login|\/lasso\/error/.test(r.url);
  const chan = /Access Denied/i.test(r.tieuDe);
  if (chan) throw new Error('UPS: Akamai tra "Access Denied" — cookie _abck bi danh dau bot. ' +
                            'Dang nhap tay qua VNC: 10_VM_Tool/vnc.sh bat && ./vnc.sh trinhduyet');
  if (!biday && !r.coNutLogIn && !r.coOPass) return { ok: true };
  throw new Error('UPS het phien. Vao VNC dang nhap tay: 10_VM_Tool/vnc.sh bat && ./vnc.sh trinhduyet. ' +
                  'Tai khoan la "allforwood" (KHONG phai email). Nho tich "Remember this device for 30 days".');
}

/** Đọc creds — chỉ dùng cho site nào thật sự cần (hiện: AACT, UPS). */
export async function docCreds(site) {
  const d = JSON.parse(await fs.readFile(CREDS, 'utf8'));
  return d[site] || {};
}
