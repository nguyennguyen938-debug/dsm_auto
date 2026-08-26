#!/usr/bin/env node
/**
 * ============================================================================
 *  invoice.mjs — tự động tạo invoice hàng loạt trên DSM ("Needs Invoicing")
 * ----------------------------------------------------------------------------
 *      node invoice.mjs --dry            # dien het NHUNG KHONG submit — chay cai nay TRUOC
 *      node invoice.mjs --that           # ⛔ SUBMIT THAT
 *      node invoice.mjs --that --max 1   # chi lam 1 trang roi dung
 *
 *  ⛔⛔ TRANG NÀY GHI RÕ: *"All actions taken on orders are final and cannot be changed
 *      once submitted."* Submit xong KHÔNG sửa được, KHÔNG huỷ được. Đây là hoá đơn
 *      gửi cho Home Depot, không phải nháp.
 *
 *  Vì vậy mặc định là `--dry`, và `--that` phải gõ tay. Không bao giờ đặt `--that`
 *  trong cron cho tới khi người dùng cho phép rõ ràng.
 *
 *  ── Trang nằm ở đâu ────────────────────────────────────────────────────────
 *  Link "Needs Invoicing" trên Order Summary:
 *      gotoOrderRealmForm.do?action=web_quickinvoice&tabContext=web_quickinvoice&merchant=thehomedepot
 *  Form tên `GeneralOrderRealmForm`, submit về `handleOrderRealmFormSubmission.do`
 *  (cùng endpoint với packing-slip reprint — đừng nhầm hai luồng).
 *
 *  ── Tên trường, đo thật 12/08/2026 ─────────────────────────────────────────
 *      order(<orderid>).shipflag                    checkbox chọn PO
 *      order(<orderid>).invoicenumber               ô Invoice Number
 *      order(<orderid>).invoicenumber.autofill      nút Auto Fill
 *      order(<orderid>).termsnetdaysdue             ô Terms Net Days Due
 *      order(<orderid>).item(<itemid>).invoiced     ô INVOICE QUANTITY
 *      input[name=confirmbtn]                       nút Submit (một nút cho CẢ TRANG)
 *
 *  🔴 BỐN ĐIỀU PHẢI BIẾT
 *
 *  1. **Auto Fill tự tích checkbox.** `onclick` của nó là
 *     `checkOrder(<orderid>); document.getElementById(...).value='<so>'`
 *     — tức vừa chọn PO vừa điền số hoá đơn. Tích checkbox thêm lần nữa là **bỏ chọn**.
 *
 *  2. **QUANTITY REMAINING không phải input**, nó là chữ trong bảng. Phải đọc theo
 *     từng hàng `<tr>` chứa ô `.invoiced`, không đoán theo thứ tự.
 *
 *  3. **Một nút Submit cho CẢ TRANG**, không phải mỗi PO một nút. Bấm là gửi mọi PO
 *     đang được tích. PO nào điền dở mà vẫn được tích thì cũng đi luôn.
 *
 *  4. **Submit xong danh sách tự ngắn lại** — PO đã invoice biến khỏi "Needs Invoicing".
 *     Nên vòng lặp là "mở lại trang cho tới khi hết", không phải "sang trang 2".
 *     Đi theo số trang sẽ bỏ sót: sau khi trang 1 rỗng đi, trang 2 cũ đã thành trang 1.
 * ==========================================================================*/

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const GOC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const STATE = process.env.DSM_STATE || path.join(GOC, '11_TaiVe', 'storageState.json');
/** Bằng chứng "PO này đã gửi invoice" — ghi TRƯỚC khi bấm Submit. */
const INVDIR = process.env.DSM_INV_OUT || path.join(GOC, '11_TaiVe', 'invoice');

const URL_TRANG = 'https://dsm.commercehub.com/dsm/gotoOrderRealmForm.do' +
                  '?action=web_quickinvoice&tabContext=web_quickinvoice&merchant=thehomedepot';

const argv = process.argv.slice(2);
const DRY = !argv.includes('--that');
const MAX_LO = (() => { const i = argv.indexOf('--max'); return i >= 0 ? parseInt(argv[i + 1], 10) || 0 : 0; })();
/** Terms Net Days Due — người dùng chốt 12/08/2026: luôn điền `2`. */
const NET_DAYS = (() => { const i = argv.indexOf('--net'); return i >= 0 ? String(argv[i + 1]) : '2'; })();

const log = (...a) => console.log(new Date().toLocaleTimeString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }), ...a);

/**
 * Đọc mọi PO trên trang + số lượng còn lại của từng dòng hàng.
 * Thuần ĐỌC, không chạm vào ô nào.
 */
async function docTrang(page) {
  return page.evaluate(() => {
    const f = document.forms['GeneralOrderRealmForm'];
    if (!f) return { loi: 'khong thay form GeneralOrderRealmForm' };

    const donIds = [...new Set([...f.elements]
      .map(e => (e.name || '').match(/^order\((\d+)\)\.shipflag$/)?.[1])
      .filter(Boolean))];

    const dsDon = donIds.map(id => {
      // Số PO nằm ở dòng tiêu đề "PO Number: <so>" của khối
      const cb = f.elements[`order(${id}).shipflag`];
      const khoi = cb ? cb.closest('table') || cb.closest('div') : null;
      const chu = khoi ? (khoi.innerText || '') : '';
      const po = (chu.match(/PO Number:\s*(\S+)/) || [])[1] || null;

      // Mỗi ô .invoiced là một dòng hàng. QUANTITY REMAINING nằm cùng <tr>.
      const dong = [...f.elements]
        .filter(e => new RegExp(`^order\\(${id}\\)\\.item\\((\\d+)\\)\\.invoiced$`).test(e.name || ''))
        .map(inp => {
          const tr = inp.closest('tr');
          const o = tr ? [...tr.children].map(td => (td.innerText || '').trim()) : [];
          /* Cột "QUANTITY REMAINING" đứng NGAY TRƯỚC ô nhập. Tìm theo vị trí ô nhập
           * thay vì đếm cột từ trái: bảng có thể thêm cột lúc nào không biết. */
          const iTd = tr ? [...tr.children].findIndex(td => td.contains(inp)) : -1;
          const conLai = iTd > 0 ? o[iTd - 1] : '';
          return {
            itemId: (inp.name.match(/item\((\d+)\)/) || [])[1],
            ten: inp.name,
            conLai,
            sku: o[2] || '',
            daDien: inp.value || ''
          };
        });

      return { orderId: id, po, dong, daTich: !!(cb && cb.checked) };
    });

    return {
      dsDon,
      tong: (document.body.innerText.match(/Displaying[^\n]*/) || [''])[0].trim(),
      coSubmit: !!f.querySelector('input[name=confirmbtn]')
    };
  });
}

/** Điền một PO: Auto Fill -> Net Days -> Invoice Quantity từng dòng. KHÔNG submit. */
async function dienMotDon(page, don) {
  const { orderId, po } = don;

  /* Auto Fill: tự tích checkbox + sinh số hoá đơn. Bấm bằng `click()` của trình duyệt
   * để `onclick` chạy đúng — gọi `checkOrder()` bằng tay thì bỏ mất phần điền số. */
  await page.locator(`input[name="order(${orderId}).invoicenumber.autofill"]`).first().click({ timeout: 15000 });
  await page.waitForTimeout(300);

  await page.locator(`input[name="order(${orderId}).termsnetdaysdue"]`).first().fill(NET_DAYS);

  for (const d of don.dong) {
    const so = String(d.conLai || '').trim();
    if (!/^\d+$/.test(so)) {
      throw new Error(`${po}: doc "QUANTITY REMAINING" ra "${d.conLai}" — khong phai so. DUNG, khong doan.`);
    }
    await page.locator(`input[name="${d.ten}"]`).first().fill(so);
  }
  await page.waitForTimeout(200);
}

/**
 * Đọc lại toàn bộ giá trị vừa điền và đối chiếu.
 *
 * 🔴 Không bỏ bước này. Submit không hoàn tác được, mà form của DSM từng có chuyện
 *    "điền 128, đọc lại ra 8" (xem `ups-form.go()`); ở đây sai một số là hoá đơn sai
 *    số lượng gửi cho Home Depot.
 */
async function kiemTruocKhiGui(page, dsDon) {
  const loi = [];
  for (const don of dsDon) {
    const kq = await page.evaluate(({ id, dong }) => {
      const f = document.forms['GeneralOrderRealmForm'];
      const g = n => (f.elements[n] || {}).value ?? null;
      return {
        tich: !!(f.elements[`order(${id}).shipflag`] || {}).checked,
        soHd: g(`order(${id}).invoicenumber`),
        net: g(`order(${id}).termsnetdaysdue`),
        qty: dong.map(d => ({ ten: d.ten, val: g(d.ten), mong: d.conLai }))
      };
    }, { id: don.orderId, dong: don.dong });

    if (!kq.tich) loi.push(`${don.po}: checkbox CHUA duoc tich`);
    if (!String(kq.soHd || '').trim()) loi.push(`${don.po}: Invoice Number trong (Auto Fill khong an?)`);
    if (String(kq.net).trim() !== NET_DAYS) loi.push(`${don.po}: Terms Net Days = "${kq.net}", mong "${NET_DAYS}"`);
    for (const q of kq.qty) {
      if (String(q.val).trim() !== String(q.mong).trim()) {
        loi.push(`${don.po}: ${q.ten} = "${q.val}", mong "${q.mong}"`);
      }
    }
  }
  return loi;
}

async function main() {
  await fs.mkdir(INVDIR, { recursive: true });
  log(DRY ? '🔍 --dry: se dien het NHUNG KHONG submit'
          : '⛔ CHAY THAT — submit tao hoa don, KHONG HOAN TAC');

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: STATE });
  const page = await ctx.newPage();

  let lo = 0, tongDon = 0;
  try {
    while (true) {
      if (MAX_LO > 0 && lo >= MAX_LO) { log(`--max ${MAX_LO}: dung lai`); break; }

      await page.goto(URL_TRANG, { waitUntil: 'domcontentloaded', timeout: 70000 });
      await page.waitForTimeout(4000);

      const t = await docTrang(page);
      if (t.loi) {
        /* 🔴 KHÔNG có form thì có HAI lý do hoàn toàn khác nhau, đừng gộp:
         *   · hết việc  — DSM trả trang "No order(s) found that match..." và BỎ LUÔN form
         *   · hết phiên — bị đá về trang đăng nhập
         * Bản đầu coi cả hai là "hết phiên DSM?" và thoát mã 3, nên lượt chạy thành công
         * trọn vẹn 294 PO vẫn kết thúc bằng một dòng đỏ và mã lỗi (gặp thật 12/08/2026). */
        const trang = await page.evaluate(() => ({
          rong: /No\s+order\(s\)\s+found/i.test(document.body.innerText),
          doiDangNhap: !!document.querySelector('input[type=password]')
        }));
        if (trang.rong) { log('✅ DSM bao "No order(s) found" — het PO can invoice, xong.'); break; }
        log(`❌ ${t.loi} — ${trang.doiDangNhap ? 'DA BI DA VE TRANG DANG NHAP' : 'trang la, chua ro'}`);
        process.exitCode = 3;
        break;
      }
      if (!t.dsDon.length) { log('✅ Khong con PO nao can invoice — xong.'); break; }

      lo++;
      log(`--- lo ${lo} | ${t.tong} | ${t.dsDon.length} PO tren trang ---`);
      for (const d of t.dsDon) {
        log(`   ${d.po} (order ${d.orderId}) | ${d.dong.length} dong hang | con lai: ` +
            d.dong.map(x => `${x.sku}=${x.conLai}`).join(' · '));
      }

      for (const d of t.dsDon) await dienMotDon(page, d);

      const loi = await kiemTruocKhiGui(page, t.dsDon);
      if (loi.length) {
        log('❌ KHONG submit — kiem lai thay lech:');
        for (const l of loi) log('     ' + l);
        process.exitCode = 5;
        break;
      }
      log(`   ✅ da dien va doi chieu xong ${t.dsDon.length} PO`);

      if (DRY) {
        log('--dry: DUNG o day, khong bam Submit. Them --that de gui that.');
        break;
      }

      /* 🔴 GHI BẰNG CHỨNG TRƯỚC KHI BẤM. Submit không hoàn tác; nếu trình duyệt chết
       * giữa chừng mà chưa có file này thì không ai biết lô vừa rồi đã gửi hay chưa. */
      const tep = path.join(INVDIR, `lo-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
      await fs.writeFile(tep, JSON.stringify({
        luc: new Date().toISOString(),
        netDays: NET_DAYS,
        don: t.dsDon.map(d => ({ po: d.po, orderId: d.orderId,
                                 dong: d.dong.map(x => ({ sku: x.sku, soLuong: x.conLai })) }))
      }, null, 1), { mode: 0o600 });
      log(`   📝 bang chung: ${tep}`);

      await page.locator('input[name=confirmbtn]').first().click({ timeout: 20000 });
      await page.waitForTimeout(9000);
      tongDon += t.dsDon.length;
      log(`   ⛔ DA SUBMIT ${t.dsDon.length} PO`);
    }
  } finally {
    await ctx.close().catch(() => {});
    await browser.close().catch(() => {});
  }
  log('---');
  log(`${DRY ? '[dry] ' : ''}xong ${lo} lo, ${tongDon} PO da gui`);
}

main().catch(e => { console.error('\n❌ ' + e.stack + '\n'); process.exit(1); });
