/* Gan vao trinh duyet DANG MO — khong goto, khong dang nhap lai. */
import { chromium } from 'playwright';
export async function trang() {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const p = b.contexts()[0].pages().find(x=>/lecangs/.test(x.url())) || b.contexts()[0].pages()[0];
  return { b, p };
}
