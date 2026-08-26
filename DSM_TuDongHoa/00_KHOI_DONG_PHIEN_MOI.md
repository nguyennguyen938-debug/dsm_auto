# KHỞI ĐỘNG PHIÊN MỚI — đọc file này TRƯỚC

Cập nhật **25/08/2026**. Viết cho trường hợp đổi phiên Claude, đổi máy, hoặc VM mất.

---

## 1. Ba câu ràng buộc — nói lại với Claude ở đầu phiên

> 1. Máy này chạy chung với dự án khác (`/opt/wayfair`) — **tuyệt đối không `pkill`/`pgrep`**,
>    giết tiến trình phải theo PID đã ghi.
> 2. **Đo trước, kết luận sau.** Nhiều phiên trước đã sai vì suy từ một dấu hiệu.
> 3. Đây là hệ thống **chạy thật**, có thao tác tốn tiền và không hoàn tác được.

Rồi bảo Claude đọc theo thứ tự: `CLAUDE.md` → file này → `00_BanGiao_PhienMoi_08082026.md`
→ `10_VM_Tool/README.md`.

---

## 2. Toàn bộ dự án nằm ở đâu

| Nơi | Có gì | Mất thì sao |
|---|---|---|
| **GitHub** `nguyennguyen938-debug/dsm_auto` | toàn bộ **code + tài liệu + bảng tra** | lấy lại bằng `git clone` |
| **Google Apps Script** dự án `AFW-DSM` | 5 file `.gs` **đang chạy trên server Google** — không phụ thuộc VM | bản sao nằm trong `02_AppsScript/` |
| **Google Sheet** `1Fzwr2GDHOHxMgqPNf-Ksf6qJ5IIl3mNzrOQrHqH57fo` | dữ liệu đơn hàng thật | không nằm trên VM, an toàn |
| **Google Drive** `THD Orders` | BOL, packing slip, shipping label đã tạo | không nằm trên VM, an toàn |
| **VM** `wayfair-auto-01` thư mục `11_TaiVe/` | 🔴 **bằng chứng chống trùng + phiên đăng nhập** | **KHÔNG có ở đâu khác** — xem mục 3 |

> ⚠️ Repo GitHub đang **PUBLIC**. Không bao giờ đẩy `storageState.json`, `creds.json`,
> `ups-api.txt`, `.profile-ground`, hay file trong `11_TaiVe/ups/` (nhãn có địa chỉ khách).

---

## 3. 🔴 Thứ KHÔNG nằm trong git — phải sao lưu tay

`.gitignore` loại cả `11_TaiVe/**`. Trong đó:

| Thư mục | Là gì | Mất thì hậu quả |
|---|---|---|
| `ups/` | đã mua nhãn UPS cho PO nào | chạy lại **mua nhãn lần hai** — tiền thật |
| `lecangs/` | đã tạo đơn xuất kho | kho **xuất hàng lần hai** |
| `aact/` | đã tạo BOL trên AACT | BOL thứ hai trong hệ thống họ |
| `drive/` | đã tạo folder Drive cho PO nào | folder trùng, ghi đè cột P |
| `qty/` | số lượng thật DSM ghi nhận | mất đối chiếu, BOL có thể sai cân |
| `phanloai/` | kết quả tra tồn (cầu nối hai luồng) | đơn kẹt giữa hai luồng |
| `storageState.json` | phiên DSM | phải đăng nhập lại |
| `.profile-ground/` | phiên Lecangs + UPS | phải đăng nhập lại qua VNC |
| `creds.json`, `ups-api.txt` | tài khoản, khoá API UPS | phải xin lại |

Sáu thư mục bằng chứng đầu chỉ khoảng **1.5 MB** — nhỏ, nhưng là thứ duy nhất ngăn hệ
thống làm lại những việc không hoàn tác được.

**Sao lưu:** `bash 10_VM_Tool/sao-luu.sh` → tạo file `.tar.gz` trong `11_TaiVe/`.
Tải về máy cá nhân, **đừng đẩy lên GitHub**.

---

## 4. Dựng lại trên máy mới

```bash
git clone https://github.com/nguyennguyen938-debug/dsm_auto.git
cd dsm_auto/DSM_TuDongHoa/10_VM_Tool && npm install && npx playwright install chromium
cd .. && mkdir -p 11_TaiVe
tar xzf <file-sao-luu>.tar.gz -C .          # tra lai bang chung + phien
crontab - < 10_VM_Tool/crontab.txt          # KHONG dung "crontab <file>"
```

Rồi đăng nhập lại DSM (`node 10_VM_Tool/login.mjs`) và Lecangs (qua VNC, xem mục 6).

---

## 5. Đang chạy tự động những gì

| Việc | Lịch | Ở đâu |
|---|---|---|
| `CheckRithum` nạp đơn mới → cột A/B | 10 phút | server Google |
| `TraPRO` / `CheckMail_PRO` → cột N | 15 phút | server Google |
| `copyB2B_B2C` chép sang sheet con | trigger | server Google |
| `chay-dinh-ky.sh` = tải slip + dựng BOL | 5 phút, 7 ngày/tuần | **VM** |
| `giu-session.sh` giữ phiên DSM | 5 phút, 24/7 | **VM** |
| `don-dep.sh` dọn `_INBOX` | mỗi giờ | **VM** |

⛔ **`chay-ground.sh` CỐ Ý chưa vào cron** — bật là mua nhãn UPS thật và tạo đơn xuất kho
Lecangs. Người dùng chưa duyệt. Hiện có **12 đơn Ground treo** (cột C = `UPS`, chưa có nhãn).

---

## 6. Phiên đăng nhập — cái nào tự sống, cái nào phải làm tay

| Phiên | Tự gia hạn | Khi hết thì |
|---|---|---|
| **DSM** | ✅ `giu-session.sh` chạm nhẹ mỗi 5 phút (đã sống 19 ngày liền) | `node 10_VM_Tool/login.mjs` |
| **UPS API** | ✅ token OAuth 4 tiếng, tool tự xin lại | không cần làm gì |
| **Lecangs** | ❌ **không có gì giữ** | mở VNC đăng nhập tay |

**Đăng nhập Lecangs:**
```bash
bash 10_VM_Tool/vnc.sh bat          # in ra mat khau VNC
```
Trên máy cá nhân: `ssh -L 6080:localhost:6080 Lenovo@<IP-VM>` rồi mở
`http://localhost:6080/vnc.html`. Mở Chrome tới `app.lecangs.com`, đăng nhập, tích
*Remember me*. **Đừng đóng bằng dấu X** — báo Claude đóng bằng SIGTERM để profile được ghi.

⛔ **Đừng mở `ups.com/lasso/login`** — Akamai chặn VM, mỗi lần chạm có thể gia hạn thời
gian bị chặn. Nhánh UPS dùng API, không cần đăng nhập web.

---

## 7. Năm việc không lấy lại được — luôn hỏi trước khi chạy

1. Submit reprint trên DSM
2. Finalize BOL trên `aaacooper.com`
3. Mua nhãn UPS (`--that` + `DSM_UPS_ENV=prod`)
4. `Save & Submit` trên Lecangs (`--lecangs-that`)
5. Gửi hoá đơn (`invoice.mjs --that`)

Mỗi việc đều có file bằng chứng chặn làm lại. **Đó là lý do `11_TaiVe/` phải được sao lưu.**

⛔ Riêng `centraltransport.com` (CTII): submit tạo **lệnh pickup thật, xe đến kho, không huỷ
được**, mà form lại mở công khai không cần đăng nhập. `xu-ly-don.mjs` cố ý bỏ qua mọi đơn CTII.

---

## 8. Việc còn treo — chờ người dùng quyết

1. **12 đơn Ground treo** — chưa bật cron nhánh Ground
2. **Đổi PRO về đọc mail** thay vì đọc Drive (code cũ còn nguyên, chỉ đổi lời gọi)
3. **Đơn Ground đi AK/HI có dựng BOL không** — hiện chỉ điền sheet
4. **Nguyên nhân cột C tự trống** chưa tìm ra — đã có chốt chặn `drive/<PO>.json` ngăn hậu quả

Chi tiết trong `CLAUDE.md` mục 8.
