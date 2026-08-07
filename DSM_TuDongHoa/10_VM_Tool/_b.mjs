import { chromium } from 'playwright';
export async function trang(loc = /\/ship\b/) {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const ctx = b.contexts()[0];
  const p = ctx.pages().find(x => loc.test(x.url()))
         || ctx.pages().find(x => /ups\.com/.test(x.url()))
         || ctx.pages()[0];
  return { b, ctx, p };
}
