#!/usr/bin/env bash
# ============================================================================
#  sao-luu.sh — dong goi moi thu KHONG nam trong git
# ----------------------------------------------------------------------------
#      bash 10_VM_Tool/sao-luu.sh              # goi GON (~2 MB) — chay hang ngay
#      bash 10_VM_Tool/sao-luu.sh --day-du     # goi DAY DU (~10 MB) — truoc khi bo VM
#
#  Goi GON  = bang chung chong trung + phien + khoa + crontab.
#             Du de may moi khong lam lai viec ton tien.
#  Goi DAY DU = them profile Chrome (chi phan trang thai), slip, BOL, log, anh.
#             Du de may moi GIONG HET may cu.
#
#  🔴 File tao ra CO COOKIE PHIEN, MAT KHAU, KHOA API VA DIA CHI KHACH HANG.
#     Coi nhu mat khau. DUNG day len GitHub (repo dang PUBLIC).
#
#  Phuc hoi:  bash 10_VM_Tool/khoi-phuc.sh <file.tar.gz>
# ==========================================================================
set -uo pipefail
GOC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$GOC"

DAY_DU=0
[ "${1:-}" = "--day-du" ] && DAY_DU=1

HAU=$([ $DAY_DU = 1 ] && echo "-daydu" || echo "")
RA="11_TaiVe/dsm-sao-luu$HAU-$(TZ=Asia/Ho_Chi_Minh date '+%Y%m%d-%H%M').tar.gz"

# ---- 1. Bang chung chong trung — MAT LA LAM LAI VIEC TON TIEN --------------
#  ups      da mua nhan UPS        lecangs  da tao don xuat kho
#  aact     da tao BOL             drive    da tao folder Drive
#  invoice  da gui hoa don         qty      so luong that DSM ghi nhan
#  phanloai ket qua tra ton (cau noi giua hai luong)
CO=()
for m in ups lecangs drive aact qty phanloai invoice; do
  [ -d "11_TaiVe/$m" ] && CO+=("11_TaiVe/$m")
done

# ---- 2. Phien va khoa ------------------------------------------------------
for m in storageState.json storageState.json.info.json creds.json ups-api.txt; do
  [ -f "11_TaiVe/$m" ] && CO+=("11_TaiVe/$m")
done

# ---- 3. Lich chay ----------------------------------------------------------
crontab -l > 10_VM_Tool/crontab.txt 2>/dev/null && CO+=("10_VM_Tool/crontab.txt")

# ---- 4. Chi trong goi DAY DU ----------------------------------------------
if [ $DAY_DU = 1 ]; then
  #  Profile Chrome: CHI lay phan trang thai (~350 KB). 96 MB con lai la cache,
  #  Safe Browsing DB, metrics — Chrome tu dung lai het.
  #  Cookie tren Linux ma hoa bang key trong "Local State"; VM khong co keyring
  #  nen dung key mac dinh -> chep sang may khac VAN giai ma duoc.
  for f in "Local State" "Default/Cookies" "Default/Cookies-journal" \
           "Default/Login Data" "Default/Login Data-journal" \
           "Default/Preferences" "Default/Secure Preferences" "Default/Web Data"; do
    [ -e "11_TaiVe/.profile-ground/$f" ] && CO+=("11_TaiVe/.profile-ground/$f")
  done
  #  Slip va BOL: khong bat buoc (manifest chong reprint nam TREN DRIVE, khong
  #  phai tren VM) nhung giu lai thi may moi khoi tai lai tu dau.
  for m in packingslip bol dsm_raw anh luutru-truoc-lam-lai-20260811-0220 logs; do
    [ -d "11_TaiVe/$m" ] && CO+=("11_TaiVe/$m")
  done
fi

[ ${#CO[@]} -eq 0 ] && { echo "khong co gi de sao luu"; exit 1; }

tar czf "$RA" "${CO[@]}" 2>/dev/null
chmod 600 "$RA"

echo "=== da sao luu ($([ $DAY_DU = 1 ] && echo 'DAY DU' || echo 'GON')) ==="
echo "  file: $RA  ($(du -h "$RA" | cut -f1))"
for m in "${CO[@]}"; do
  n=$([ -d "$m" ] && find "$m" -type f | wc -l || echo 1)
  printf "    %-46s %s file\n" "$m" "$n"
done
echo
echo "  Phuc hoi:  bash 10_VM_Tool/khoi-phuc.sh $(basename "$RA")"
echo "  ⛔ Co cookie phien + mat khau + dia chi khach. DUNG day len GitHub."
[ $DAY_DU = 0 ] && echo "  ℹ️  Truoc khi bo VM, chay them: bash 10_VM_Tool/sao-luu.sh --day-du" || true

exit 0
