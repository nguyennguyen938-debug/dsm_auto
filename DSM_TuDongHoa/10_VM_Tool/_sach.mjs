import { chromium } from 'playwright';
import * as F from './ups-form.mjs';
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const ctx = b.contexts()[0];
const p = ctx.pages().find(x=>/ups\.com/.test(x.url())) || ctx.pages()[0];
const bat = [];
p.on('response', async r => {
  if (!/ValidateAccounts|UpdateShippingContext/.test(r.url())) return;
  try { bat.push(r.url().split('/').pop().split('?')[0] + ' -> ' + (await r.text()).slice(0,240)); } catch {}
});
try {
  console.log('1. mo shipment MOI tu dashboard...');
  await p.goto('https://www.ups.com/ppc/dashboard.html?loc=en_US#/companyDashboard',{waitUntil:'domcontentloaded',timeout:90000});
  await p.waitForTimeout(14000);
  await p.locator('a', { hasText: /Create a Shipment/i }).first().click({timeout:25000});
  await p.waitForTimeout(28000);
  console.log('   ->', p.url().slice(0,80));
  if (!/\/ship\/guided\//.test(p.url())) { console.log('   ❌ ra giao dien MOI, can bam tay ve giao dien cu'); await b.close(); process.exit(1); }

  console.log('2. Muc 1 Where');
  console.log('   ', JSON.stringify(await F.dienNoiNhan(p, {
    tenKhach:'THD TEST RECIPIENT', diaChi1:'1234 MAIN ST', diaChi2:'',
    city:'AUSTIN', zip:'78701', state:'TX', dienThoai:'5125551234' })));
  console.log('3. residential + Continue');
  console.log('   ', JSON.stringify(await F.xacNhanResidential(p, true)));
  console.log('4. Muc 2 What');
  console.log('   ', JSON.stringify(await F.dienPackage(p, 0, { qty:1, lb:31, L:26, W:26, H:3, po:'02562579' })));
  await p.locator('button#nbsBackForwardNavigationContinueButton').click({timeout:25000});
  await p.waitForTimeout(26000);
  console.log('5. Muc 3 How ->', p.url().slice(0,70));
  console.log('   ', JSON.stringify(await F.dienPickup(p, { ngay:'8/10/2026', po:'02562579' })));
  await p.locator('button#nbsBackForwardNavigationContinueButton').click({timeout:25000});
  await p.waitForTimeout(26000);
  console.log('6. Muc 4 Details -> Continue (', p.url().slice(30,60), ')');
  await p.locator('button#nbsBackForwardNavigationContinueButton').click({timeout:25000});
  await p.waitForTimeout(26000);
  console.log('7. Muc 5 Payment ->', p.url().slice(0,70));
  console.log('   ', JSON.stringify(await F.dienThanhToan(p)));
  console.log('8. bam Review (DUNG truoc Pay and Get Labels)');
  await p.locator('button#nbsBackForwardNavigationReviewPrimaryButton').click({timeout:25000});
  await p.waitForTimeout(32000);
  const r = await p.evaluate(()=>({url:location.href.slice(0,80),
    loi:(document.body.innerText.match(/Please correct the following:[\s\S]{0,150}/)||[''])[0].replace(/\s+/g,' '),
    nut:[...document.querySelectorAll('button')].filter(e=>(e.offsetParent||e.getClientRects().length)&&/pay and get|get label/i.test(e.innerText||'')).map(e=>e.innerText.trim().slice(0,30))}));
  console.log('\nKET QUA:', r.url);
  console.log('LOI  :', r.loi || '✅ KHONG CO LOI');
  console.log('NUT tra tien:', JSON.stringify(r.nut));
} catch(e){ console.log('LOI:', e.message.split('\n')[0].slice(0,130)); }
console.log('\nAPI bat duoc:'); bat.slice(-4).forEach(x=>console.log('  ', x.replace(/\s+/g,' ')));
await b.close();
