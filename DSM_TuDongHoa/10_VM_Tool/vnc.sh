#!/usr/bin/env bash
# ============================================================================
#  vnc.sh — dựng / tắt màn hình ảo để đăng nhập tay vào các site
# ----------------------------------------------------------------------------
#    ./vnc.sh bat      dựng Xvfb + fluxbox + x11vnc + noVNC, in mật khẩu
#    ./vnc.sh trinhduyet   mở Chromium dùng PROFILE CỐ ĐỊNH trong màn hình đó
#    ./vnc.sh tat      tắt sạch
#    ./vnc.sh trangthai
#
#  🔴 GIẾT TIẾN TRÌNH THEO PID ĐÃ GHI, KHÔNG theo tên.
#     Máy này chạy chung với /opt/wayfair — bên đó CŨNG dùng Xvfb/x11vnc/websockify.
#     Ngày 07/08 đã lỡ giết x11vnc của họ vì dùng `pgrep -x x11vnc` rồi kill hàng loạt
#     (log của họ ghi `caught signal: 15`). Xem quy tắc #10 trong CLAUDE.md.
#
#  ⚠️ x11vnc CHỈ nghe 127.0.0.1 — bắt buộc vào qua SSH tunnel, không phơi ra mạng.
# ==========================================================================*/
set -uo pipefail

GOC="/home/Lenovo/dsm_auto/DSM_TuDongHoa"
RUN="$GOC/11_TaiVe/.vnc-run"          # nơi ghi PID + mật khẩu phiên
PROFILE="$GOC/11_TaiVe/.profile-ground"
MAN=":99"
LOG="$GOC/11_TaiVe/logs"

mkdir -p "$RUN" "$LOG" "$PROFILE"

pidFile() { echo "$RUN/$1.pid"; }

# Chỉ giết đúng PID mình đã ghi, và chỉ khi tên tiến trình khớp — phòng trường hợp
# PID đã được hệ điều hành cấp lại cho tiến trình khác.
giet() {
  local ten="$1" f; f=$(pidFile "$ten")
  [ -f "$f" ] || return 0
  local pid; pid=$(cat "$f" 2>/dev/null)
  if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
    local that; that=$(ps -p "$pid" -o comm= 2>/dev/null || echo '')
    if [ "$that" = "$ten" ] || [ "${that:0:8}" = "${ten:0:8}" ]; then
      kill "$pid" 2>/dev/null && echo "  da dung $ten (pid $pid)"
      sleep 1; kill -9 "$pid" 2>/dev/null
    else
      echo "  BO QUA $ten: pid $pid nay la '$that' — KHONG phai cua minh"
    fi
  fi
  rm -f "$f"
}

khoiDong() {   # khoiDong <ten> <lenh...>
  local ten="$1"; shift
  setsid "$@" </dev/null >"$LOG/$ten.log" 2>&1 &
  local pid=$!
  disown 2>/dev/null || true
  echo "$pid" > "$(pidFile "$ten")"
  echo "  $ten pid $pid"
}

case "${1:-trangthai}" in

bat)
  echo "=== dung man hinh ao $MAN ==="
  khoiDong Xvfb Xvfb "$MAN" -screen 0 1600x950x24
  sleep 3
  DISPLAY=$MAN khoiDong fluxbox fluxbox
  sleep 2
  MK=$(head -c 12 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 10)
  mkdir -p "$HOME/.vnc"
  x11vnc -storepasswd "$MK" "$HOME/.vnc/passwd" >/dev/null 2>&1
  chmod 600 "$HOME/.vnc/passwd"
  echo "$MK" > "$RUN/matkhau"; chmod 600 "$RUN/matkhau"
  khoiDong x11vnc x11vnc -display "$MAN" -rfbauth "$HOME/.vnc/passwd" \
      -localhost -rfbport 5900 -forever -shared -noxdamage
  sleep 3
  khoiDong websockify websockify --web=/usr/share/novnc 127.0.0.1:6080 localhost:5900
  sleep 3
  echo
  echo "  MAT KHAU VNC: $MK"
  echo
  echo "  Tren may ban:"
  echo "    ssh -i C:\\Users\\Lenovo\\.ssh\\google_compute_engine -L 6080:localhost:6080 Lenovo@136.111.186.129"
  echo "    roi mo Chrome:  http://localhost:6080/vnc.html"
  ;;

trinhduyet)
  # PROFILE CỐ ĐỊNH — đây mới là điểm mấu chốt.
  # UPS "Remember this device for 30 days" và Lecangs "Remember me" đều gắn với
  # profile trình duyệt. Mở context tạm thời là mất, lần sau MFA hỏi lại.
  # Script tự động về sau phải dùng ĐÚNG thư mục này:
  #     chromium.launchPersistentContext('11_TaiVe/.profile-ground', {...})
  echo "=== mo Chromium voi profile co dinh ==="
  echo "  profile: $PROFILE"
  CHROME=$(ls -d "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux64/chrome 2>/dev/null | tail -1)
  [ -x "$CHROME" ] || { echo "  ❌ khong thay chromium cua playwright"; exit 3; }

  # 🔴 BAT BUOC cho trang dang nhap UPS — do that 07/08/2026:
  #   Cloudflare Turnstile ("Verify you are human") goi
  #   brunhild.challenges.cloudflare.com, host do CHI co ban ghi AAAA (IPv6) ma VM
  #   nay KHONG co IPv6 -> ERR_ADDRESS_UNREACHABLE -> o tick khong bao gio xanh,
  #   KE CA khi nguoi that ngoi bam. Ep no ve IPv4 cua Cloudflare thi moi giai duoc.
  IP4=$(python3 -c "import socket;print(socket.getaddrinfo('challenges.cloudflare.com',443,socket.AF_INET)[0][4][0])" 2>/dev/null)
  MAP=""
  [ -n "$IP4" ] && MAP="--host-resolver-rules=MAP brunhild.challenges.cloudflare.com $IP4"
  echo "  ep brunhild.challenges.cloudflare.com -> ${IP4:-(khong tra duoc, Turnstile co the hong)}"

  # 🔴 BAT WEBGL BANG PHAN MEM — do that 07/08/2026:
  #   Duoi Xvfb khong co GPU, Chrome 151 tra "KHONG CO WEBGL". Trinh duyet that gan nhu
  #   LUON co WebGL, nen thieu no la dau hieu rat manh de Cloudflare Turnstile cham la bot
  #   -> o "Verify you are human" khong bao gio tick duoc, KE CA nguoi that bam.
  #   Tu Chrome 130 tro len, SwiftShader phai bat bang --enable-unsafe-swiftshader.
  GL="--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader"

  DISPLAY=$MAN khoiDong chrome "$CHROME" \
      --user-data-dir="$PROFILE" --no-first-run --no-default-browser-check \
      --window-size=1580,930 --window-position=0,0 $MAP $GL \
      "https://www.ups.com/lasso/login?loc=en_US"
  sleep 4
  echo
  echo "  Trong cua so VNC, dang nhap CA HAI site (mo tab moi cho site thu 2):"
  echo "    1. https://app.lecangs.com          tich 'Remember me'"
  echo "    2. https://www.ups.com/ppc/dashboard.html?loc=en_US#/companyDashboard"
  echo "       -> Verify Your Identity -> Email -> lay ma tu noreply@id.ups.com"
  echo "       -> BAT BUOC tich 'Remember this device for 30 days'"
  echo
  echo "  Xong thi bao Claude. DUNG dong trinh duyet bang dau X —"
  echo "  dung './vnc.sh tat' de profile duoc ghi xuong dia day du."
  ;;

tat)
  echo "=== tat ==="
  for t in chrome websockify x11vnc fluxbox Xvfb; do giet "$t"; done
  rm -f "$HOME/.vnc/passwd" "$RUN/matkhau"
  rmdir "$HOME/.vnc" 2>/dev/null
  echo "  profile GIU LAI: $PROFILE"
  ;;

trangthai)
  echo "=== trang thai ==="
  for t in Xvfb fluxbox x11vnc websockify chrome; do
    f=$(pidFile "$t"); pid=$(cat "$f" 2>/dev/null || echo '')
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then echo "  $t: dang chay (pid $pid)"
    else echo "  $t: khong chay"; fi
  done
  echo "  cong:"; ss -tln 2>/dev/null | grep -E ':5900|:6080' | sed 's/^/    /' || echo "    (khong co)"
  [ -f "$RUN/matkhau" ] && echo "  mat khau VNC: $(cat "$RUN/matkhau")"
  echo "  profile: $PROFILE ($(du -sh "$PROFILE" 2>/dev/null | cut -f1))"
  ;;

*) echo "dung: $0 {bat|trinhduyet|tat|trangthai}"; exit 1 ;;
esac
