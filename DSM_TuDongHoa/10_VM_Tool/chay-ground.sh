#!/usr/bin/env bash
# ============================================================================
#  chay-ground.sh — bọc nhánh GROUND/UPS cho cron. SOẠN SẴN, CHƯA BẬT.
# ----------------------------------------------------------------------------
#  Ba khâu, mỗi khâu một mức rủi ro khác hẳn nhau. Đọc kỹ trước khi bật:
#
#    1. xu-ly-ground.mjs                  Ground thường  ⛔ TẠO VẬN ĐƠN THẬT + đơn Lecangs
#    2. xu-ly-ground.mjs --sheet b2c      phần B2C của đơn hỗn hợp   ⛔ như trên
#    3. xu-ly-don.mjs   --sheet b2b       phần B2B của đơn hỗn hợp   — chỉ BOL + Drive + sheet
#
#  Khâu 3 KHÔNG tạo vận đơn, KHÔNG cần Lecangs, không tốn tiền — sai thì sửa được.
#  Khâu 1 và 2 thì ngược lại: mỗi lượt chạy sinh vận đơn UPS thật và lệnh xuất kho
#  thật trên Lecangs. Hai khâu đó vì vậy **mặc định TẮT**, phải bật bằng biến môi trường.
#
#  ⚠️ PHIÊN LECANGS SỐNG ~4 TIẾNG và phải xin cookie TAY (`nap-cookie.mjs`).
#     Không có cách nào tự đăng nhập lại — mật khẩu bị server từ chối (đo 12/08/2026).
#     Nên khâu 1–2 sẽ đứng phần lớn thời gian. Đó là lý do chúng tắt mặc định:
#     một job "chạy mỗi 15 phút nhưng hầu như luôn thất bại" chỉ tạo nhiễu log.
#
#  Bật từng khâu:
#      DSM_GROUND_THUONG=1   ./chay-ground.sh     # khâu 1
#      DSM_GROUND_B2C=1      ./chay-ground.sh     # khâu 2
#      DSM_GROUND_B2B=1      ./chay-ground.sh     # khâu 3  (an toàn nhất, bật trước)
#      DSM_DRY=1             ./chay-ground.sh     # chỉ liệt kê, không ghi gì
#
#  Khoá RIÊNG, không dùng chung với chay-dinh-ky.sh: hai job đụng cùng sheet nhưng
#  khác PO, và dùng chung khoá thì job 5 phút sẽ bỏ đói job này (đã xảy ra 06/08 với
#  giu-session.sh).
# ==========================================================================*/
set -uo pipefail

GOC="/home/Lenovo/dsm_auto/DSM_TuDongHoa"
LOG_DIR="$GOC/11_TaiVe/logs"
LOG="$LOG_DIR/ground.log"
# 🔴 DUNG CHUNG khoa voi chay-dinh-ky.sh — doi 13/08/2026.
#    Truoc do moi script mot khoa rieng, nen hai luot CO THE chay song song:
#    run.mjs ghi thang file slip (khong ghi tam roi doi ten) trong khi xu-ly-ground
#    doc cung thu muc, va ca hai cung goi fillRow cho mot PO.
#    Chua gay su co vi chay-ground chua vao cron, nhung se gay ngay khi bat.
KHOA="$LOG_DIR/.chay-dinh-ky.lock"
MAX="${DSM_GROUND_MAX:-5}"          # tran so don moi luot — thap co y, day la van don THAT

mkdir -p "$LOG_DIR"
gio() { date '+%Y-%m-%d %H:%M:%S %Z'; }
ghi() { echo "[$(gio)] $*" >> "$LOG"; }

exec 9>"$KHOA"
if ! flock -n 9; then
  ghi "BO QUA — lan chay truoc chua xong (khoa $KHOA)"
  exit 0
fi

CO_DRY=""
[ "${DSM_DRY:-}" = "1" ] && CO_DRY="--dry"

# --- Khâu 3 TRƯỚC: rẻ, an toàn, không cần Lecangs ---------------------------
#     Đặt trước khâu 1–2 có chủ ý: nếu phiên Lecangs chết thì khâu này vẫn xong
#     việc của nó, thay vì bị hai khâu kia làm hỏng cả lượt chạy.
MA=0
if [ "${DSM_GROUND_B2B:-0}" = "1" ]; then
  ghi "--- [3] xu-ly-don --sheet b2b ${CO_DRY:-(chay that)} --max $MAX ---"
  node "$GOC/10_VM_Tool/xu-ly-don.mjs" --sheet b2b $CO_DRY --max "$MAX" >> "$LOG" 2>&1
  M=$?; [ "$M" != "0" ] && { ghi "!!! khau 3 ma $M"; MA=$M; }
fi

# --- Kiểm phiên Lecangs MỘT lần cho cả hai khâu sau -------------------------
#     Kiểm trước để khỏi chạy vào rồi mới chết giữa chừng — chết giữa chừng ở
#     khâu 1 nghĩa là đã có vận đơn UPS mà chưa có đơn Lecangs, phải dọn tay.
CAN_LEC=0
[ "${DSM_GROUND_THUONG:-0}" = "1" ] && CAN_LEC=1
[ "${DSM_GROUND_B2C:-0}" = "1" ] && CAN_LEC=1

if [ "$CAN_LEC" = "1" ]; then
  if ! node "$GOC/10_VM_Tool/kiem-phien-lecangs.mjs" >> "$LOG" 2>&1; then
    ghi "DUNG khau 1-2 — phien Lecangs da het. Xin cookie moi roi chay: node 10_VM_Tool/nap-cookie.mjs <file> --domain app.lecangs.com"
    exit "$MA"
  fi
fi

# --- Khâu 1: đơn Ground thường ---------------------------------------------
if [ "${DSM_GROUND_THUONG:-0}" = "1" ]; then
  ghi "--- [1] xu-ly-ground ${CO_DRY:-⛔ CHAY THAT} --max $MAX ---"
  DSM_UPS_ENV=prod node "$GOC/10_VM_Tool/xu-ly-ground.mjs" \
    --that --lecangs-that $CO_DRY --max "$MAX" >> "$LOG" 2>&1
  M=$?; [ "$M" != "0" ] && { ghi "!!! khau 1 ma $M"; MA=$M; }
fi

# --- Khâu 2: phần B2C của đơn hỗn hợp --------------------------------------
if [ "${DSM_GROUND_B2C:-0}" = "1" ]; then
  ghi "--- [2] xu-ly-ground --sheet b2c ${CO_DRY:-⛔ CHAY THAT} --max $MAX ---"
  DSM_UPS_ENV=prod node "$GOC/10_VM_Tool/xu-ly-ground.mjs" \
    --sheet b2c --that --lecangs-that $CO_DRY --max "$MAX" >> "$LOG" 2>&1
  M=$?; [ "$M" != "0" ] && { ghi "!!! khau 2 ma $M"; MA=$M; }
fi

[ "$MA" = "0" ] && ghi "=== xong (ma 0) ==="

if [ -f "$LOG" ] && [ "$(stat -c%s "$LOG")" -gt 5242880 ]; then
  tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
  ghi "(da cat bot log cu)"
fi

exit "$MA"
