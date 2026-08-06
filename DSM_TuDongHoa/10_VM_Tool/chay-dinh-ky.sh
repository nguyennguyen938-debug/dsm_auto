#!/usr/bin/env bash
# ============================================================================
#  chay-dinh-ky.sh — bọc run.mjs để cron gọi. KHÔNG gọi run.mjs thẳng từ cron.
# ----------------------------------------------------------------------------
#  Script này thêm 4 thứ mà cron cần còn run.mjs không tự lo:
#    1. flock  — hai lần chạy chồng nhau sẽ submit trùng. Lần sau bỏ qua, không xếp hàng.
#    2. --max  — chặn số PO mỗi lô, phòng khi sheet có sự cố sinh ra hàng loạt PO.
#               DSM_MAX cho khâu tải slip, DSM_MAX_BOL cho khâu dựng BOL.
#    3. log    — ghi mốc giờ ICT. (run.mjs tự in giờ UTC, lệch 7 tiếng, đừng nhầm.)
#    4. dịch mã thoát ra tiếng người, nhất là mã 3 (session chết) và 8 (thiếu slip).
#
#  Hai khâu, chạy nối tiếp:
#    1. run.mjs      — tải + tách packing slip. CẦN session DSM.
#    2. xu-ly-don.mjs — dựng BOL cho đơn không cần web. KHÔNG cần session DSM,
#                       nên vẫn chạy khi khâu 1 báo hết session.
#
#  ⛔ Khâu 1 SUBMIT THẬT lên DSM, không hoàn tác được.
#     Khâu 2 ghi sheet + tạo file Drive, KHÔNG tạo lệnh pickup — sai thì sửa được.
#     Muốn chạy thử cả hai mà không ghi gì: DSM_DRY=1 ./chay-dinh-ky.sh
# ==========================================================================*/
set -uo pipefail

GOC="/home/Lenovo/dsm_auto/DSM_TuDongHoa"
export DSM_STATE="$GOC/11_TaiVe/storageState.json"
export DSM_OUT="$GOC/11_TaiVe/dsm_raw"
LOG_DIR="$GOC/11_TaiVe/logs"
LOG="$LOG_DIR/dsm-tool.log"
KHOA="$LOG_DIR/.chay-dinh-ky.lock"
MAX="${DSM_MAX:-15}"
MAX_BOL="${DSM_MAX_BOL:-10}"   # tran so don dung BOL moi lan chay

mkdir -p "$LOG_DIR" "$DSM_OUT"

gio() { date '+%Y-%m-%d %H:%M:%S %Z'; }
ghi() { echo "[$(gio)] $*" >> "$LOG"; }

# --- flock: đang chạy dở thì BỎ QUA lượt này, không đợi ---------------------
exec 9>"$KHOA"
if ! flock -n 9; then
  ghi "BO QUA — lan chay truoc chua xong (khoa $KHOA)"
  exit 0
fi

# --- chưa đăng nhập thì đừng chạy, và nói rõ cách sửa ------------------------
if [ ! -f "$DSM_STATE" ]; then
  ghi "DUNG — khong co $DSM_STATE. Can dang nhap lai DSM (xem 11_TaiVe/README.md)."
  exit 2
fi

CO_DRY=""
[ "${DSM_DRY:-}" = "1" ] && CO_DRY="--dry"

ghi "=== bat dau ${CO_DRY:-(chay that)} --dedup --max $MAX ==="
node "$GOC/10_VM_Tool/run.mjs" $CO_DRY --dedup --max "$MAX" >> "$LOG" 2>&1
MA=$?

# --- Khau 2: dung BOL cho slip da co tren dia ------------------------------
#  CHAY BAT KE khau 1 ra sao — ke ca ma 3 (session DSM het). xu-ly-don.mjs
#  KHONG dung toi DSM, chi noi chuyen voi web app. Nen session chet thi khau tai
#  slip dung, con khau dung BOL van chay tiep cho nhung slip da tai ve tu truoc.
#  Chi bo qua khi khau 1 chet vi ly do khong lien quan session (ma 1 = loi la).
if [ "$MA" != "1" ]; then
  ghi "--- xu-ly-don ${CO_DRY:-(chay that)} --max $MAX_BOL ---"
  node "$GOC/10_VM_Tool/xu-ly-don.mjs" $CO_DRY --max "$MAX_BOL" >> "$LOG" 2>&1
  MA_BOL=$?
  case "$MA_BOL" in
    0) : ;;
    2) ghi "!!! xu-ly-don ma 2 — chua co thu muc packingslip. Chay run.mjs truoc." ;;
    5) ghi "!!! xu-ly-don ma 5 — co don loi giua chung. KHONG tao lenh pickup nao; doc log ben tren." ;;
    *) ghi "!!! xu-ly-don ma $MA_BOL — loi khong luong truoc." ;;
  esac
  # KHÔNG gán MA="$MA_BOL": hai script dùng cùng con số cho nghĩa khác nhau
  # (vd 5: run.mjs = "khong co file cho", xu-ly-don = "co don loi"). Dùng mã
  # riêng 10 để bảng dịch bên dưới không nói sai.
  [ "$MA" = "0" ] && [ "$MA_BOL" != "0" ] && MA=10
fi

case "$MA" in
  0) ghi "=== xong (ma 0) ===" ;;
  2) ghi "!!! ma 2 — chua co storageState.json. Dang nhap lai DSM." ;;
  3) ghi "!!! ma 3 — SESSION DSM DA HET. Tu gio moi lan chay deu that bai cho toi khi dang nhap lai. Xem 11_TaiVe/README.md muc dung lai VNC." ;;
  4) ghi "!!! ma 4 — khong PO nao submit duoc, khong tai gi." ;;
  5) ghi "!!! ma 5 — khong co file cho nao trong danh sach reprint." ;;
  6) ghi "!!! ma 6 — tai duoc nhung KHONG upload duoc len Drive. File con o $DSM_OUT." ;;
  7) ghi "!!! ma 7 — PDF da len Drive nhung KHONG ghi duoc manifest. CHAY LAI SE SUBMIT TRUNG. Doc log ben tren de biet PO nao." ;;
  8) ghi "!!! ma 8 — co PO DA SUBMIT nhung slip khong xuat hien. Kiem tay danh sach reprint tren DSM TRUOC KHI chay lai." ;;
  10) ghi "!!! ma 10 — tai slip OK nhung khau DUNG BOL loi (xu-ly-don ma $MA_BOL). Khong tao lenh pickup nao." ;;
  *) ghi "!!! ma $MA — loi khong luong truoc, doc log ben tren." ;;
esac

# --- giữ log gọn: quá 5 MB thì cắt còn 2000 dòng cuối -----------------------
if [ -f "$LOG" ] && [ "$(stat -c%s "$LOG")" -gt 5242880 ]; then
  tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
  ghi "(da cat bot log cu)"
fi

exit "$MA"
