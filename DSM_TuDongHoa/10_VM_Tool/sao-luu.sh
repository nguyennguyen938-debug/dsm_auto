#!/usr/bin/env bash
# ============================================================================
#  sao-luu.sh — dong goi nhung thu KHONG nam trong git
# ----------------------------------------------------------------------------
#  `.gitignore` loai ca `11_TaiVe/**`, trong do co thu quan trong nhat:
#  bang chung chong trung (mat = mua nhan lan hai, xuat kho lan hai) va phien
#  dang nhap. File nay dong goi chung lai de tai ve may ca nhan.
#
#      bash 10_VM_Tool/sao-luu.sh
#
#  🔴 File tao ra CO COOKIE PHIEN, MAT KHAU VA DIA CHI KHACH HANG.
#     Coi nhu mat khau. DUNG day len GitHub (repo dang PUBLIC).
#
#  Phuc hoi tren may moi:  tar xzf <file>.tar.gz -C DSM_TuDongHoa/
# ==========================================================================
set -uo pipefail
GOC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$GOC"

TEN="dsm-sao-luu-$(TZ=Asia/Ho_Chi_Minh date '+%Y%m%d-%H%M').tar.gz"
RA="11_TaiVe/$TEN"

# Bang chung chong trung + phien + khoa. KHONG kem: packingslip, bol, logs,
# .profile-ground (96M) — tai lai duoc hoac qua nang.
CO=()
for m in ups lecangs drive aact qty phanloai storageState.json creds.json ups-api.txt; do
  [ -e "11_TaiVe/$m" ] && CO+=("11_TaiVe/$m")
done
[ -f 10_VM_Tool/crontab.txt ] || crontab -l > 10_VM_Tool/crontab.txt 2>/dev/null
CO+=("10_VM_Tool/crontab.txt")

if [ ${#CO[@]} -eq 0 ]; then echo "khong co gi de sao luu"; exit 1; fi

tar czf "$RA" "${CO[@]}" 2>/dev/null
chmod 600 "$RA"

echo "=== da sao luu ==="
echo "  file: $RA  ($(du -h "$RA" | cut -f1))"
echo "  gom:"
for m in "${CO[@]}"; do
  n=$([ -d "$m" ] && ls "$m" 2>/dev/null | wc -l || echo 1)
  printf "    %-34s %s muc\n" "$m" "$n"
done
echo
echo "  ⛔ File nay co cookie phien + mat khau + dia chi khach. DUNG day len GitHub."
