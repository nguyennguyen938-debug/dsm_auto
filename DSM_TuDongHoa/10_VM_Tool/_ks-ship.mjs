import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const ctx = b.contexts()[0];
const p = ctx.pages().find(x=>/ups\.com\/ppc\/dashboard/.test(x.url())) || ctx.pages()[0];
try {
  await p.goto('https://www.ups.com/ship?loc=en_US', { waitUntil:'domcontentloaded', timeout:90000 });
  await p.waitForTimeout(28000);
  const r = await p.evaluate(() => ({
    url: location.href.slice(0,110), tt: document.title,
    o: [...document.querySelectorAll('input,select,textarea')]
        .filter(e=>e.offsetParent||e.getClientRects().length)
        .map(e=>({tag:e.tagName,type:e.type||'',id:e.id||'',name:e.name||'',ph:e.placeholder||'',
                  lb:(e.getAttribute('aria-label')||'').slice(0,45)})).slice(0,40),
    nut: [...document.querySelectorAll('button,a[role=button]')]
        .filter(e=>(e.offsetParent||e.getClientRects().length)&&(e.innerText||'').trim())
        .map(e=>{const q=e.getBoundingClientRect();return {txt:e.innerText.trim().slice(0,28),id:e.id||'',kt:Math.round(q.width)+'x'+Math.round(q.height)};}).slice(0,18),
    chu: document.body.innerText.replace(/\s+/g,' ').slice(0,500)
  }));
  console.log('url:', r.url, '\ntitle:', r.tt);
  console.log('\nCHU:', r.chu);
  console.log('\nO NHAP:'); r.o.forEach(x=>console.log('  ',JSON.stringify(x)));
  console.log('\nNUT:'); r.nut.forEach(x=>console.log('  ',JSON.stringify(x)));
  await p.screenshot({ path:'../11_TaiVe/logs/ups-ship-where.png' });
} catch(e){ console.log('LOI:', e.message.split('\n')[0]); }
await b.close();
