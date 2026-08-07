import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const p = b.contexts()[0].pages()[0];
const hong = [], ma = [];
p.on('requestfailed', r => { if (/cloudflare/.test(r.url())) hong.push(`${r.failure()?.errorText} ${r.url().replace(/^https:\/\//,'').slice(0,70)}`); });
p.on('response', r => { if (/cloudflare/.test(r.url()) && r.status() >= 400) ma.push(`${r.status()} ${r.url().replace(/^https:\/\//,'').slice(0,70)}`); });
console.log('trang dang o:', p.url().slice(0,110));
await p.goto('https://www.ups.com/lasso/login?loc=en_US', { waitUntil:'domcontentloaded', timeout:90000 }).catch(e=>console.log('goto:', e.message.split('\n')[0]));
await p.waitForTimeout(28000);
console.log('YEU CAU HONG :', hong.length ? hong : '(khong co) ✅');
console.log('MA LOI >=400 :', ma.length ? ma : '(khong co) ✅');
const r = await p.evaluate(() => ({
  tt: document.title,
  coTs: typeof window.turnstile !== 'undefined',
  tok: (document.querySelector('input[name=captcha]')?.value || '').length,
  iframeCf: [...document.querySelectorAll('iframe')].map(f=>f.src).filter(s=>/cloudflare/.test(s)).map(s=>s.slice(30,90)),
  loi: [...document.querySelectorAll('[role=alert]')].filter(e=>e.offsetParent||e.getClientRects().length).map(e=>e.innerText.trim()).filter(Boolean)
}));
console.log('title:', r.tt, '| window.turnstile:', r.coTs, '| token:', r.tok);
console.log('iframe cloudflare:', JSON.stringify(r.iframeCf));
console.log('loi hien:', JSON.stringify(r.loi));
await b.close();
