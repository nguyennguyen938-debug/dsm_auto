#!/usr/bin/env node
/**
 * ============================================================================
 *  giu-session.mjs — chạm nhẹ vào DSM để session khỏi hết hạn vì nằm im
 * ----------------------------------------------------------------------------
 *  node giu-session.mjs
 *
 *  Mỗi lần chạy: một GET `gotoHome.do` duy nhất. KHÔNG submit, KHÔNG tải,
 *  KHÔNG đụng sheet hay Drive. Chạy sai cũng không hỏng dữ liệu gì.
 *
 *  🔴 CHƯA BIẾT CÓ TÁC DỤNG KHÔNG. Hai kiểu hết hạn cho kết quả ngược nhau:
 *     - theo thời gian NẰM IM (sliding) -> giữ được, có thể vô hạn
 *     - TUYỆT ĐỐI từ lúc đăng nhập      -> vô ích, chỉ tốn request
 *     Đo 05/08 (đăng nhập 10:53, chết trước 15:46, không hoạt động ở giữa) KHÔNG
 *     phân biệt được hai kiểu. Vì vậy script ghi **tuổi session** mỗi lần kiểm:
 *       - tuổi lớn dần vượt xa 5 tiếng  -> sliding, giữ được, giữ nguyên cron này
 *       - luôn chết quanh cùng một mốc  -> tuyệt đối, BỎ cron này đi cho đỡ request
 *     Xem nhanh:  grep 'CHET' ../11_TaiVe/logs/giu-session.log | tail
 *
 *  Cookie mới (nếu DSM có gia hạn) được ghi đè lại storageState.json theo kiểu
 *  ghi-tạm-rồi-đổi-tên, để run.mjs không bao giờ đọc phải file viết dở.
 * ==========================================================================*/

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import * as D from './dsm.mjs';

const STATE = process.env.DSM_STATE || './storageState.json';
const INFO = STATE + '.info.json';

const gio = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });

function doiSang(ms) {
  if (ms == null || !isFinite(ms)) return '?';
  const p = Math.floor(ms / 60000);
  return `${Math.floor(p / 60)}h${String(p % 60).padStart(2, '0')}m`;
}

const main = async () => {
  try { await fs.access(STATE); }
  catch { console.log(`${gio()} | BO QUA | chua co ${STATE}, can dang nhap`); process.exit(2); }

  // tuổi session = từ lúc login.mjs ghi file info (KHÔNG dùng mtime của storageState:
  // chính script này ghi đè nó, mtime sẽ luôn là vài phút trước)
  let dangNhapLuc = null;
  try { dangNhapLuc = JSON.parse(await fs.readFile(INFO, 'utf8')).dangNhapLuc; } catch { /* ban cu */ }
  const tuoi = dangNhapLuc ? doiSang(Date.now() - Date.parse(dangNhapLuc)) : '?';

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: STATE });
  try {
    const s = await D.checkSession(ctx.request);
    if (!s.ok) {
      console.log(`${gio()} | CHET  | tuoi ${tuoi} | ${s.noiDen}`);
      process.exitCode = 3;
      return;
    }

    // Session còn sống -> lưu lại cookie có thể đã được gia hạn.
    // Chỉ ghi khi thực sự khác, tránh đụng file vô ích.
    const moi = JSON.stringify(await ctx.storageState());
    let cu = '';
    try { cu = await fs.readFile(STATE, 'utf8'); } catch { /* ke */ }
    let ghi = 'cookie khong doi';
    if (moi !== cu) {
      const tam = STATE + '.tmp';
      await fs.writeFile(tam, moi, { mode: 0o600 });
      await fs.rename(tam, STATE);                  // đổi tên là thao tác nguyên tử
      ghi = 'da cap nhat cookie';
    }
    console.log(`${gio()} | SONG  | tuoi ${tuoi} | ${ghi}`);
  } finally {
    await ctx.close();
    await browser.close();
  }
};

main().catch(e => { console.log(`${gio()} | LOI   | ${e.message.slice(0, 120)}`); process.exit(1); });
