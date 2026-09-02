#!/usr/bin/env bash
# ============================================================================
#  khoi-phuc.sh — dung lai toan bo he thong tren MAY MOI
# ----------------------------------------------------------------------------
#      bash 10_VM_Tool/khoi-phuc.sh <duong-dan-goi.tar.gz>
#
#  Chay SAU khi da `git clone` va `npm install`. Script nay lo phan con lai:
#  tra bang chung, tra phien, dung lai profile Chrome, dat lai cron, roi kiem.
#
#  Khong lam gi ton tien, khong goi UPS, khong ghi sheet.
# ==========================================================================
set -uo pipefail
GOC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$GOC"

GOI="${1:-}"
[ -f "$GOI" ] || { echo "dung: bash 10_VM_Tool/khoi-phuc.sh <goi.tar.gz>"; exit 2; }
GOI="$(cd "$(dirname "$GOI")" && pwd)/$(basename "$GOI")"

ok=0; loi=0
buoc() { echo; echo "── $* ──"; }
tot()  { echo "   ✅ $*"; ok=$((ok+1)); }
xau()  { echo "   ❌ $*"; loi=$((loi+1)); }

buoc "1. Giai nen goi"
mkdir -p 11_TaiVe
tar xzf "$GOI" -C . && tot "da giai nen $(basename "$GOI")" || { xau "giai nen that bai"; exit 1; }

buoc "2. Bang chung chong trung"
for m in ups lecangs drive aact qty phanloai invoice; do
  n=$(find "11_TaiVe/$m" -type f 2>/dev/null | wc -l)
  [ "$n" -gt 0 ] && tot "$m: $n file" || echo "   ⚠️  $m: trong (co the chua tung chay den buoc do)"
done

buoc "3. Phien va khoa"
for f in storageState.json creds.json ups-api.txt; do
  [ -f "11_TaiVe/$f" ] && tot "$f" || xau "THIEU $f — phai dang nhap/xin lai"
done

buoc "4. Profile Chrome (phien Lecangs)"
if [ -f "11_TaiVe/.profile-ground/Default/Cookies" ]; then
  tot "co cookie — Chrome se tu dung lai phan cache khi mo lan dau"
else
  echo "   ⚠️  khong co profile — phai dang nhap Lecangs tay qua VNC (xem muc 6 file huong dan)"
fi

buoc "5. File lam viec (chi co trong goi --day-du)"
for m in packingslip bol logs; do
  n=$(find "11_TaiVe/$m" -type f 2>/dev/null | wc -l)
  [ "$n" -gt 0 ] && tot "$m: $n file" || echo "   ℹ️  $m: trong (goi GON khong kem — khong sao)"
done

buoc "5b. Thu muc lam viec"
mkdir -p 11_TaiVe/{packingslip,bol,logs,dsm_raw,ups,lecangs,drive,aact,qty,phanloai,invoice}
tot "da tao du thu muc"

buoc "6. Lich chay (cron)"
if [ -f 10_VM_Tool/crontab.txt ]; then
  echo "   Cron hien tai co $(crontab -l 2>/dev/null | grep -vc '^#\|^$') dong."
  echo "   De dat lai:  crontab - < 10_VM_Tool/crontab.txt"
  echo "   ⚠️  KHONG tu chay lenh do — file co the chua dong cua du an khac"
  echo "      (/opt/wayfair). Xem truoc roi hay dat."
else
  xau "khong co crontab.txt trong goi"
fi

buoc "7. Kiem — khong ton tien, khong ghi gi"
if node 10_VM_Tool/test-ground-tra.mjs >/dev/null 2>&1; then
  tot "bo test: $(node 10_VM_Tool/test-ground-tra.mjs 2>/dev/null | tail -1)"
else
  xau "bo test KHONG qua — kiem 'npm install' da chay chua"
fi
# giu-session.mjs mac dinh tim ./storageState.json — phai chi dung duong dan,
# giong cach chay-dinh-ky.sh lam. Thieu dong nay se bao "het phien" oan.
export DSM_STATE="$GOC/11_TaiVe/storageState.json"
if node 10_VM_Tool/giu-session.mjs 2>&1 | grep -q SONG; then
  tot "phien DSM: con song"
else
  echo "   ⚠️  phien DSM da het — chay: node 10_VM_Tool/login.mjs"
fi

echo
echo "════════════════════════════════════════"
echo "  $ok muc tot, $loi muc loi"
[ $loi -eq 0 ] && echo "  San sang. Dat cron o buoc 6 la he thong chay lai." \
               || echo "  Con loi — doc lai muc 4 trong 00_KHOI_DONG_PHIEN_MOI.md"
echo "════════════════════════════════════════"
exit 0
