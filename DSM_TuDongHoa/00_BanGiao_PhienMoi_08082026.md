# BÀN GIAO — phiên ngày 07–08/08/2026

Đọc file này **sau** `CLAUDE.md`. Đây là những gì thay đổi trong hai ngày qua và những gì
đang dở dang.

---

## 0. KẾT NỐI

| | |
|---|---|
| SSH | `ssh -i <khoa> Lenovo@136.111.186.129` — port **22** |
| Hostname | `wayfair-auto-01` |
| Thư mục làm việc | `/home/Lenovo/dsm_auto/DSM_TuDongHoa` |
| VNC | `10_VM_Tool/vnc.sh bat` → tunnel `-L 6080:localhost:6080` → `http://localhost:6080/vnc.html` |

⚠️ **Máy dùng chung với `/opt/wayfair`** — xem quy tắc #10 trong `CLAUDE.md`. Giết tiến trình
theo PID, không `pkill`/`pgrep`.

---

## 1. ĐANG CHẠY TỰ ĐỘNG — KHÔNG ĐỤNG VÀO

| Cron | Lịch | Ghi chú |
|---|---|---|
| `chay-dinh-ky.sh` | `*/5 7-19 * * *` | 🔄 **đổi 08/08: chạy CẢ 7 NGÀY** (trước là T2–T6) |
| `giu-session.sh` | `2-59/5 * * * *` | giữ phiên DSM, đang sống 47 tiếng |
| `don-dep.sh` | `25 * * * *` | dọn `_INBOX` |

✅ **`xu-ly-don.mjs` đã xử lý đơn thật lần đầu (08/08)** — trước đó chỉ chạy `--dry`.
Đơn `25567870`: tải slip → BOL thật trên AACT (`BOL# 4181293`) → PRO `39006147` → Drive → sheet.
Mất 2 phút 40 giây, không lỗi.

---

## 2. NHÁNH GROUND — TÌNH TRẠNG

| Phần | File | Trạng thái |
|---|---|---|
| Tra kho theo bang, dims, ngày pickup | `ground-tra.mjs` | ✅ **25/25 test** — `node 10_VM_Tool/test-ground-tra.mjs` |
| Tra tồn kho Lecangs + chọn kho | `lecangs.mjs` | ✅ chạy thật |
| Tạo đơn parcel Lecangs | `lecangs.mjs` | ✅ điền 16/16 ô — **chưa Save & Submit lần nào** |
| UPS: chọn kho → Mục 1–5 → Review | `ups-form.mjs` | ✅ chạy thật, `chayFormUps()` |
| **UPS: `Pay and Get Label(s)` → PDF + Tracking** | — | ❌ **CHƯA LÀM** |
| Lấy mã MFA từ Gmail | `phien.mjs → layMaUps()` | ✅ chạy thật |

**Bốn đơn Ground đang chờ** (hàng 281–284, sheet trống hoàn toàn):

| PO | Nơi nhận | SKU | Kích thước | Kho |
|---|---|---|---|---|
| 79794505 | Samuel Oates, Winston Salem NC 27127 | 833250 ×1 | 54 lb · 40×29×4 | *(tra lại)* |
| 79850310 | Larue TX 75770 | 814300 ×1 | 59 lb · 51×33×4 | CAP |
| 79858751 | Richard Beattie, Summerfield FL 34491 | 833250 ×1 | 54 lb · 40×29×4 | SAV |
| 79882730 | Carter Tuttle, Alexandria VA 22303 | 833250 ×1 | 54 lb · 40×29×4 | NJF02 |

Cả bốn đều **khách lẻ**, 1 SKU × 1.
✅ **Người dùng ĐÃ cho phép bấm `Pay and Get Label(s)`** cho một đơn (`79794505`) để nghiệm thu.

---

## 3. 🔴 ĐĂNG NHẬP UPS — ĐỌC KỸ, ĐỪNG LÀM LẠI VIỆC ĐÃ LÀM

`www.ups.com/lasso/login` bị Akamai chặn với **mọi trình duyệt trên VM**, hơn 12 tiếng chưa hết.
Đã loại trừ: chặn IP (curl cùng IP vẫn `302`), cookie bẩn, cổng CDP, Firefox 153,
**Chromium Debian thật**, thiếu WebGL. Chi tiết trong `7_QuyTrinh_Ground_UPS.md`.

⛔ **Người dùng có hỏi "vá dấu vết trình duyệt được không" — ĐÃ TỪ CHỐI.** Giả mạo WebGL/CPU/
âm thanh là né cơ chế chống bot. Đừng làm, kể cả khi được hỏi lại.

### Cách làm chính thức: nạp cookie từ máy người dùng

```bash
node 10_VM_Tool/nap-cookie-ups.mjs <file-cookie>
```
Người dùng: mở dashboard UPS → F12 → Network → tải lại → dòng đầu → **Copy as cURL** → dán vào
file. Script tự tách phần `-b '...'`.

⏱️ **Phiên chỉ sống ~20–35 phút.** Ba lần đo: 27, 34, 21 phút — và **luôn chết trong lúc đang
thao tác**, nên không phải hết hạn do để không, và **ping giữ nhịp không cứu được**.
→ Nạp xong **chạy ngay**, đừng khảo sát trước.

`10_VM_Tool/do-phien-ups.mjs` là script đo tuổi phiên (kiểm dashboard mỗi N phút).

---

## 4. 🎯 HƯỚNG ĐI ĐÃ CHỐT: UPS API

Người dùng muốn **luồng tự động không cần người**. Điều khiển trình duyệt không đạt được
(cookie tay + phiên 25 phút). Đang đăng ký **UPS Shipping API** tại `developer.ups.com`.

Đã hướng dẫn người dùng chọn:
- *"I want to integrate UPS technology into my business"*
- Tài khoản: **`1741XG`** (khớp mặc định trên form shipment)
- API cần: **Shipping · Rating · Tracking · Pickup**

Khi có **Client ID + Secret** (người dùng ghi vào `11_TaiVe/ups-api.txt`, đã `.gitignore`):
→ viết lại nhánh UPS bằng API, **bỏ hẳn `ups-form.mjs`**.
→ `ground-tra.mjs` và `lecangs.mjs` **dùng nguyên**, không liên quan trình duyệt.

---

## 5. VIỆC CÒN TREO

1. **CTII — tạm không xử lý** (chốt 07/08). `xu-ly-don.mjs` bỏ qua ở dòng 143. **Đừng tự bật.**
2. **Đổi check PRO từ Drive về đọc mail** — `getProFromMario()` còn nguyên ở `CheckMail_PRO.gs`
   dòng 158. Cần chốt: mail thay hẳn Drive, hay thử mail trước rồi Drive?
3. **Lecangs `Save & Submit` chưa chạy lần nào** — đường tạo đơn thật chưa kiểm.
   Cũng chưa kiểm: đơn nhiều SKU, địa chỉ store có `C/O`, SKU hết hàng.
4. **SKU Lecangs có hậu tố lạ** — `812250-B` → Lecangs chỉ có `812250-B-PALLET` @ kho `GAE`
   (kho này KHÔNG có trong `warehouse_ranking_by_state.csv`). Còn thấy `-WL`.
   `traTonKho()` ném lỗi liệt kê thay vì tự khớp. **Cần người dùng giải thích hậu tố.**
5. 4 số PRO mất khỏi sheet 06/08 — chưa khôi phục, chờ xác nhận cố ý hay vô tình.

---

## 6. BẨY MỚI GẶP — ĐỀU ĐÃ CHẶN TRONG CODE

| Bẫy | Nơi |
|---|---|
| **Nhiều phần tử trùng** — 3 link "Create a Shipment" (2 ẩn), 2 nút `Continue` ở Auth0, 2 thẻ trùng `id` `#go-back-to-previous-experience-btn`, 3 phần tử "Go" trên DSM | khắp nơi — **luôn đếm số khớp và lọc cái nhìn thấy được** |
| Điền `128` vào ô Weight, đọc lại ra `8` — đua tranh với Angular | `ups-form.go()` ghi xong **đọc lại kiểm**, sai thì ghi lại 3 lần |
| Popup **"Try New Feature"** của Lecangs phủ kín form → mọi thao tác timeout 30 s | `lecangs.dongPopup()` — **chỉ đóng popup đã biết**, hộp lạ thì DỪNG và hỏi |
| Chọn Country xong ô **State biến thành Ant Select** | `lecangs` tự kiểm rồi chọn cách điền |
| Nhãn bang Lecangs là `Texas【TX】` (ngoặc **toàn rộng**) | khớp theo mã trong ngoặc |
| UPS ghi `MEM R` (dấu cách), CSV ghi `MEM-R` (gạch nối) | `chuanKho()` bỏ qua `-`/khoảng trắng |
| `id` chứa dấu chấm `vm.residentialAddressControlId` | phải dùng `input[id="..."]`, không dùng `#` |
| `select` Angular có value `"901: 2"`, `"1: Object"` | **chọn theo NHÃN**, không theo value |
| Mỗi lần mở shipment sinh **tab mới** → 13 tab làm nghẹt CDP trên VM 2 nhân | `chayFormUps()` dọn tab trước mỗi vòng |
| `kill -9` Chrome → cookie **không kịp ghi xuống đĩa** | luôn `SIGTERM` rồi chờ |

---

## 7. LỖI TÔI ĐÃ MẮC — ĐỪNG LẶP LẠI

- **Kết luận vội 4 lần về cùng một triệu chứng timeout** (đổ cho dropdown, lớp phủ Ant, React)
  trước khi tìm ra popup quảng cáo. → Đo trước, đoán sau.
- **Đổ lỗi `250002` cho tài khoản `12C8D2`** — sai, đó là **phiên hết hạn**. Người dùng phản bác
  và người dùng đúng. `ValidateAccounts` sau đó trả `isValid:true`.
- **Chạy lại cả script cho mỗi lần thử** (goto + đăng nhập + điền 11 ô) chỉ để đo một bước —
  người dùng phải nhắc *"sao bạn cứ load lại trang liên tục vậy"*.
  → Giữ một trình duyệt CDP mở sẵn, gắn vào mà thao tác.
- **Đặt `process.env.DSM_PROFILE` SAU câu `import`** → `--thu` chạy nhầm trên profile thật và
  **xoá mất phiên UPS đang sống**. `phien.mjs` tính `PROFILE` lúc nạp module.
- **`vaoUps()` báo `ok:true` khi đã mất phiên** — trang "Access Denied" không có chữ "Log In"
  cũng không có ô mật khẩu. Đã sửa: kiểm cả URL và title.

---

## 8. SAO LƯU

`11_TaiVe/.profile-ground-backup-<ngày>.tar.gz` — profile trình duyệt chứa phiên Lecangs.
**Mất profile là mất phiên Lecangs**, phải đăng nhập tay qua VNC. Nên sao lưu lại sau mỗi lần
đăng nhập mới.
