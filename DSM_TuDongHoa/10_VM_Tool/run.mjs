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

    // --- 3. doi DU slip roi moi lay danh sach file cho
    //     DSM co the tao NHIEU file cho mot lo (05/08: 2 PO -> 2 file rieng), va sinh file
    //     co do tre. Phai doi du roi tai HET, khong duoc lay moi file dau tien.
    const { ds: files, thieu, doiMs } = await D.doiDuSlip(req, ok, { log });
    if (!files.length) { console.error('\n❌ Khong co file cho trong danh sach reprint.\n'); process.exit(5); }
    log(`${files.length} file cho (doi ${Math.round(doiMs / 1000)}s):`);
    for (const f of files) log(`   ${f.fid} — ${f.soSlip} slip — PO: ${f.pos.join(', ')}`);

    const tatCaPo = files.flatMap(f => f.pos);
    const la = tatCaPo.filter(p => !ok.includes(p));
    if (la.length) log('ℹ️  file con chua PO cua lo truoc:', la.join(', '));
    if (thieu.length) {
      process.exitCode = 8;
      console.error(
        `\n⚠️  ${thieu.length} PO DA SUBMIT nhung slip KHONG xuat hien sau ${Math.round(doiMs / 1000)}s:\n` +
        `   ${thieu.join(', ')}\n` +
        `   Submit da gui roi, KHONG hoan tac duoc. Cac PO nay se KHONG vao manifest,\n` +
        `   nen lan chay sau se SUBMIT LAI chung -> lenh reprint TRUNG.\n` +
        `   -> Kiem tay danh sach reprint tren DSM truoc khi chay lai.\n`);
    }

    // --- 4-6. tung file: tai -> _INBOX -> manifest
    let soFileXong = 0;
    for (const f of files) {
      const buf = await D.downloadPdf(req, f.fid);
      const local = path.join(OUTDIR, `${f.fid}.pdf`);
      await fs.writeFile(local, buf);
      log(`tai ve: ${local} — ${Math.round(buf.length / 1024)} KB`);

      const up = await D.uploadToInbox(req, `${f.fid}.pdf`, buf);
      log(up.ok ? `✅ len Drive _INBOX (${up.ghiChu})` : `❌ khong len duoc Drive (${up.ghiChu})`);
      if (!up.ok) { process.exitCode = 6; log('bo qua manifest vi PDF chua len duoc Drive'); continue; }

      // manifest CHI ghi khi PDF da len Drive. Thu tu nay KHONG duoc dao:
      // manifest co ma PDF chua len = lan sau bo qua nhung PO do -> MAT DON.
      const mf = await D.writeManifest(req, f.fid, f.pos, { soSlip: f.soSlip });
      if (mf.ok) {
        soFileXong++;
        log(`✅ manifest ${f.fid}_manifest.json (${mf.ghiChu}) — ${f.pos.length} PO da chot`);
      } else {
        process.exitCode = 7;
        console.error(
          `\n⚠️  KHONG ghi duoc manifest cho ${f.fid} (${mf.ghiChu}).\n` +
          `   File PDF DA len Drive, nhung dedup se KHONG thay lo nay.\n` +
          `   -> CHAY LAI run.mjs luc nay se SUBMIT TRUNG cac PO: ${f.pos.join(', ')}\n` +
          `   Cach xu ly: tach file thanh <PO>_PackingSlip.pdf nhu thuong le, hoac tu tay\n` +
          `   tao ${f.fid}_manifest.json trong _INBOX voi noi dung {"fid":"${f.fid}","pos":[...]}\n`);
      }
    }

    // --- tong ket
    log('---');
    log(`submit OK ${ok.length}/${pos.length}` + (fail.length ? ` | loi ${fail.length}` : ''));
    for (const f of fail) log('   loi', f.po, '-', f.ly_do);
    log(`file xong ${soFileXong}/${files.length} | PO co slip: ${tatCaPo.length}` +
        (thieu.length ? ` | ⚠️ THIEU ${thieu.length}: ${thieu.join(', ')}` : ''));
  } finally {
    await ctx.close();
    await browser.close();
  }
}

main().catch(e => { console.error('\n❌ ' + e.stack + '\n'); process.exit(1); });
