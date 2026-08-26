#!/usr/bin/env node
/**
 * ============================================================================
 *  kiem-phien-lecangs.mjs — phiên Lecangs còn sống không?
 * ----------------------------------------------------------------------------
 *      node kiem-phien-lecangs.mjs        # thoát 0 = còn sống, 3 = hết phiên
 *
 *  Dùng trong `chay-ground.sh` để **chặn trước** khâu tạo vận đơn. Vì sao phải
 *  chặn trước thay vì để nó chết giữa chừng: nếu phiên chết SAU khi UPS đã tạo
 *  nhãn nhưng TRƯỚC khi tạo đơn Lecangs, ta có một vận đơn thật mà kho không hề
 *  biết — phải dọn tay. Kiểm 10 giây ở đây rẻ hơn nhiều.
 *
 *  Chỉ ĐỌC: mở trang, xem có bị đá về form đăng nhập không. Không điền gì.
 * ==========================================================================*/

import { moContext, vaoLecangs } from './phien.mjs';

const gio = () => new Date().toLocaleTimeString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });

const ctx = await moContext({ headless: true });
try {
  const p = ctx.pages()[0] || await ctx.newPage();
  await vaoLecangs(p);
  console.log(`${gio()} phien Lecangs: CON SONG`);
  process.exitCode = 0;
} catch (e) {
  console.log(`${gio()} phien Lecangs: HET — ${e.message.slice(0, 140)}`);
  process.exitCode = 3;
} finally {
  await ctx.close();
}
