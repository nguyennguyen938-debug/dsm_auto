#!/usr/bin/env bash
# ============================================================================
#  don-dep.sh — gọi donDepManifest để dọn _INBOX
# ----------------------------------------------------------------------------
#  Xoá (setTrashed, khôi phục được 30 ngày) ba thứ đã hết việc:
#    <fid>_manifest.json · <fid>.pdf (gộp) · <PO>_PackingSlip.pdf đã vào folder PO
#
#  Mỗi thứ có cổng điều kiện riêng, xem `02_AppsScript/NhanFile_Drive_WebApp.gs`.
#  Đơn GROUND luôn được giữ vì không bao giờ có folder `PO - <po>` — đó là chủ ý.
#
#  Chạy 1 giờ/lần là đủ: đây là dọn rác, không phải việc gấp. Đặt 5 phút/lần chỉ
#  tốn request mà không sớm hơn được bao nhiêu.
#
#  Chạy thử KHÔNG xoá gì:  DON_DEM=1 ./don-dep.sh
# ==========================================================================*/
set -uo pipefail

GOC="/home/Lenovo/dsm_auto/DSM_TuDongHoa"
LOG_DIR="$GOC/11_TaiVe/logs"
LOG="$LOG_DIR/don-dep.log"
WEBAPP="https://script.google.com/macros/s/AKfycbzzJCEgWBcO76OcbhJIdiHGlJEgbWxq7FFEGbIwwpQe2gmtOalVOXziJXFyuI1Ckrtn-Q/exec"

mkdir -p "$LOG_DIR"
ghi() { echo "[$(date '+%Y-%m-%d %H:%M:%S %Z')] $*" >> "$LOG"; }

# DON_DEM=1 -> chỉ đếm, không xoá
QS="action=donDepManifest"
[ "${DON_DEM:-}" = "1" ] || QS="$QS&thatSu=1"

# Apps Script thỉnh thoảng trả nguyên trang HTML -> gọi lại vài lần
KQ=""
for lan in 1 2 3 4; do
  KQ=$(curl -sL --max-time 120 "$WEBAPP?$QS" 2>/dev/null)
  case "$KQ" in
    '{'*) break ;;                       # có vẻ là JSON -> nhận
    *) sleep 3 ;;
  esac
done

case "$KQ" in
  '{'*)
    # Rút vài con số cho log gọn; log đầy đủ vẫn ghi nguyên JSON
    TOM=$(printf '%s' "$KQ" | python3 -c "
import json,sys
try: d=json.load(sys.stdin)
except Exception: print('(khong parse duoc)'); raise SystemExit
print('manifest+gop xoa=%s giu=%s loi=%s | slip xoa=%s giu=%s' % (
  d.get('daXoa',0)+d.get('seXoa',0), len(d.get('giu',[])), len(d.get('loi',[])),
  len(d.get('slipDaVaoFolderPO',[])), len(d.get('slipConGiuOInbox',[]))))" 2>/dev/null)
    ghi "${DON_DEM:+[chi dem] }$TOM"
    # Manifest hỏng JSON là dấu hiệu run.mjs ghi lỗi -> phải thấy được, đừng nuốt
    printf '%s' "$KQ" | grep -q '"loi":\[\]' || ghi "!!! co manifest hong: $KQ"
    ;;
  *)
    ghi "!!! khong goi duoc web app sau 4 lan: $(printf '%s' "$KQ" | head -c 120)"
    exit 1
    ;;
esac
