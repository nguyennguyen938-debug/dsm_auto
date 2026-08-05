#!/usr/bin/env node
/**
 * ============================================================================
 *  run.mjs — Chạy trọn lô: needSlip -> submit cả lô -> tải 1 file -> _INBOX
 * ----------------------------------------------------------------------------
 *  node run.mjs                  # chạy thật
 *  node run.mjs --dry            # CHỈ liệt kê PO, KHÔNG submit gì
 *  node run.mjs --dedup          # bỏ PO đã có <PO>_PackingSlip.pdf tren Drive
 *  node run.mjs --only 78821006  # chỉ làm 1 PO (cách nhau bằng dấu phẩy)
 *  node run.mjs --max 10         # giới hạn số PO mỗi lô
 *
 *  ⛔ Submit KHÔNG HOÀN TÁC ĐƯỢC. Chạy --dry trước để xem sẽ làm gì.
 *  ⛔ KHÔNG tải file giữa lô — script đã làm đúng thứ tự, đừng sửa thành tải sớm.
 * ==========================================================================*/

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as D from './dsm.mjs';

const STATE = process.env.DSM_STATE || './storageState.json';
const OUTDIR = process.env.DSM_OUT || './downloads';

const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const val = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

const DRY = has('--dry');
const DEDUP = has('--dedup');
const ONLY = (val('--only') || '').split(',').map(s => s.trim()).filter(Boolean);
const MAX = parseInt(val('--max') || '0', 10);

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function main() {
  try { await fs.access(STATE); }
  catch {
    console.error(`\n❌ Khong thay ${STATE}.\n   Chay truoc:  node login.mjs\n   (dang nhap DSM mot lan bang tay, script luu cookie lai)\n`);
    process.exit(2);
  }
  await fs.mkdir(OUTDIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: STATE });
  const req = ctx.request;

  try {
    // --- 0. session con song khong?
    const s = await D.checkSession(req);
    log('session:', s.ok ? '✅ con hieu luc' : '❌ ' + s.noiDen);
    if (!s.ok) {
      console.error('\n❌ DUNG LO. Session DSM da het — chay lai: node login.mjs\n' +
                    '   Day la tinh huong BINH THUONG, khong phai bug.\n');
      process.exit(3);
    }

    // --- 1. danh sach PO  (LUON lay ngay truoc khi submit — sheet co nhieu nguoi sua)
    let pos;
    if (ONLY.length) {
      pos = ONLY;
      log('dung --only:', pos.join(', '));
    } else {
      const ns = await D.needSlip(req, { checkSlip: DEDUP });
      pos = ns.pos;
      log(`needSlip: ${ns.count} PO can lam` + (DEDUP ? ' (da dedup)' : ' (CHUA dedup)'));
      for (const sk of ns.skipped || []) log('   bo qua', sk.po, '-', sk.ly_do);
    }
    if (MAX > 0 && pos.length > MAX) { log(`gioi han --max ${MAX}`); pos = pos.slice(0, MAX); }
    if (!pos.length) { log('khong co PO nao — ket thuc.'); return; }

    if (DRY) {
      log('--dry: SE submit cho', pos.length, 'PO:', pos.join(', '));
      log('--dry: khong submit gi ca. Bo --dry de chay that.');
      return;
    }

    // --- 2. SUBMIT ca lo. Loi 1 PO khong lam dung lo. KHONG retry Submit.
    const ok = [], fail = [];
    for (const po of pos) {
      try {
        const r = await D.submitReprint(req, po);
        (r.ok ? ok : fail).push(r.ok ? po : { po, ly_do: 'khong thay "successfully applied"' });
        log(r.ok ? '✅ submit' : '⚠️  submit ?', po, 'orderid=' + r.orderid);
      } catch (e) {
        fail.push({ po, ly_do: e.message.slice(0, 90) });
        log('❌ submit', po, '-', e.message.slice(0, 90));
      }
      await new Promise(s => setTimeout(s, D.CFG.DELAY_MS));
    }
    if (!ok.length) { console.error('\n❌ Khong PO nao submit duoc — khong tai gi ca.\n'); process.exit(4); }

    // --- 3. file cho + doi chieu PO
    const pf = await D.pendingFile(req);
    if (!pf) { console.error('\n❌ Khong co file cho trong danh sach reprint.\n'); process.exit(5); }
    log(`file cho: ${pf.fid} — ${pf.soSlip} slip — chua PO: ${pf.pos.join(', ')}`);

    const thieu = ok.filter(p => !pf.pos.includes(p));
    const la = pf.pos.filter(p => !ok.includes(p));
    if (thieu.length) log('⚠️  PO da submit nhung KHONG thay trong file:', thieu.join(', '));
    if (la.length)    log('ℹ️  file con chua PO cua lo truoc:', la.join(', '));

    // --- 4. tai MOT file cho ca lo
    const buf = await D.downloadPdf(req, pf.fid);
    const local = path.join(OUTDIR, `${pf.fid}.pdf`);
    await fs.writeFile(local, buf);
    log(`tai ve: ${local} — ${Math.round(buf.length / 1024)} KB`);

    // --- 5. luu ban tho len Drive _INBOX
    const up = await D.uploadToInbox(req, `${pf.fid}.pdf`, buf);
    log(up.ok ? `✅ len Drive _INBOX (${up.ghiChu})` : `❌ khong len duoc Drive (${up.ghiChu})`);
    if (!up.ok) process.exitCode = 6;

    // --- tong ket
    log('---');
    log(`submit OK ${ok.length}/${pos.length}` + (fail.length ? ` | loi ${fail.length}` : ''));
    for (const f of fail) log('   loi', f.po, '-', f.ly_do);
    log(`file: ${pf.fid}.pdf | PO trong file: ${pf.pos.length}`);
  } finally {
    await ctx.close();
    await browser.close();
  }
}

main().catch(e => { console.error('\n❌ ' + e.stack + '\n'); process.exit(1); });
