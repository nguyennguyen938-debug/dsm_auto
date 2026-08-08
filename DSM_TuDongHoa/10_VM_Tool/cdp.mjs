/**
 * cdp.mjs — gắn vào trình duyệt ĐANG MỞ qua CDP.
 *
 * 🔴 DÙNG CÁI NÀY, ĐỪNG DÙNG `moContext()` KHI ĐANG SOI/SỬA.
 *    Bài học 08/08: mỗi lần thử một bước tôi lại chạy cả script từ đầu (mở context mới →
 *    kiểm đăng nhập → `goto` → chờ 15 s → điền lại 11 ô) chỉ để đo đúng bước đang hỏng.
 *    Lặp 6–7 lần, người dùng phải nhắc "sao bạn cứ load lại trang liên tục vậy".
 *    Giữ một Chrome mở sẵn kèm `--remote-debugging-port=9223` rồi gắn vào mà thao tác —
 *    nhanh hơn hẳn và không nã request vào site của họ.
 *
 * Mở Chrome:
 *    chromium --user-data-dir=11_TaiVe/.profile-ground --remote-debugging-port=9223 \
 *             --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader
 *    (phải có DISPLAY=:99 — xem `vnc.sh trinhduyet`)
 */
import { chromium } from 'playwright';

export async function trang(loc = /ups\.com|lecangs/) {
  const b = await chromium.connectOverCDP(process.env.DSM_CDP || 'http://127.0.0.1:9223');
  const ctx = b.contexts()[0];
  const p = ctx.pages().find(x => loc.test(x.url())) || ctx.pages()[0];
  return { b, ctx, p };
}

/** Đóng mọi tab trừ một — VM 2 nhân, quá 10 tab là CDP timeout. */
export async function donTab(ctx, giu) {
  for (const t of ctx.pages()) if (t !== giu) await t.close().catch(() => {});
}
