#!/usr/bin/env bash
# ============================================================================
#  giu-session.sh — bọc giu-session.mjs cho cron. Mỗi 5 phút một GET nhẹ.
# ----------------------------------------------------------------------------
#  Dùng CHUNG khoá với chay-dinh-ky.sh: hai script cùng ghi storageState.json,
#  chạy chồng nhau có thể làm run.mjs đọc phải file viết dở. Đang chạy lô thì
#  bỏ qua lượt giữ session — mất một lượt không sao, lô đang chạy chính là
#  hoạt động giữ session rồi.
#
#  Log riêng, KHÔNG ghi chung với dsm-tool.log: 5 phút một dòng sẽ nhấn chìm
#  log của lô chạy thật.
# ==========================================================================*/
set -uo pipefail

GOC="/home/Lenovo/dsm_auto/DSM_TuDongHoa"
export DSM_STATE="$GOC/11_TaiVe/storageState.json"
LOG_DIR="$GOC/11_TaiVe/logs"
LOG="$LOG_DIR/giu-session.log"
KHOA="$LOG_DIR/.chay-dinh-ky.lock"

mkdir -p "$LOG_DIR"

exec 9>"$KHOA"
flock -n 9 || exit 0          # đang chạy lô -> bỏ qua lượt này, im lặng

node "$GOC/10_VM_Tool/giu-session.mjs" >> "$LOG" 2>&1
MA=$?

# giữ log gọn: 5 phút/dòng ~ 170 dòng/ngày
if [ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 4000 ]; then
  tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

exit "$MA"
