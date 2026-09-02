# KHỞI ĐỘNG PHIÊN MỚI — đọc file này TRƯỚC

Cập nhật **26/08/2026**. Viết cho trường hợp đổi phiên Claude, đổi máy, hoặc VM mất.

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
| **Google Drive** folder `1mVndvxy60i1pbASMKeS2VuHizou3XCqo` | 🔴 **gói sao lưu** `dsm-sao-luu-*.tar.gz` — bằng chứng + phiên + crontab | đây là bản cứu hộ, xem mục 4 |
| **VM** `wayfair-auto-01` thư mục `11_TaiVe/` | bản đang chạy của những thứ trên | có gói sao lưu là dựng lại được |

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
| `invoice/` | đã gửi hoá đơn cho lô nào | **gửi hoá đơn lần hai** cho Home Depot |
| `phanloai/` | kết quả tra tồn (cầu nối hai luồng) | đơn kẹt giữa hai luồng |
| `storageState.json` | phiên DSM | phải đăng nhập lại |
| `.profile-ground/` | phiên Lecangs + UPS | phải đăng nhập lại qua VNC |
| `creds.json`, `ups-api.txt` | tài khoản, khoá API UPS | phải xin lại |

Bảy thư mục bằng chứng đầu chỉ khoảng **1.5 MB** — nhỏ, nhưng là thứ duy nhất ngăn hệ
thống làm lại những việc không hoàn tác được.

**Sao lưu — hai mức:**

```bash
bash 10_VM_Tool/sao-luu.sh              # GON  (~2 MB)  — chay hang ngay
bash 10_VM_Tool/sao-luu.sh --day-du     # DAY DU (~18 MB) — truoc khi bo VM
```

**Gọn** = bằng chứng + phiên + khoá + crontab. Đủ để máy mới không làm lại việc tốn tiền.
**Đầy đủ** = thêm profile Chrome (chỉ phần trạng thái ~350 KB, bỏ 96 MB cache), packing
slip, BOL, log, ảnh. Đủ để máy mới **giống hệt** máy cũ. Đưa lên **Drive folder
`1mVndvxy60i1pbASMKeS2VuHizou3XCqo`** — đó là bản cứu hộ khi VM mất.

⛔ **Đừng đẩy lên GitHub** (repo PUBLIC). Và kiểm folder Drive đang ở chế độ hạn chế,
không phải *"Anyone with the link"* — gói này có cookie phiên và khoá API UPS.

**Nên chạy lại sau mỗi lần chạy nhánh Ground thật**, vì lúc đó sinh thêm bằng chứng
nhãn UPS và đơn Lecangs.

---

## 4. Dựng lại trên máy mới — từng bước

> 🖥️ Nếu người làm là **AI agent trên máy trắng**, dùng `00_TAI_LAP_VM_MOI.md` thay cho
> mục này — cùng nội dung nhưng có điểm kiểm chứng sau mỗi bước và 4 chỗ phải dừng hỏi.

Đã kiểm trên **Debian 13** · Node **24** · npm **11** · Python **3.13**.
Máy tối thiểu: 2 nhân, 4 GB RAM, 30 GB đĩa (VM hiện tại là `e2-medium`).

### 4.1. Lấy hai thứ trước khi bắt đầu

1. **Code** — GitHub `nguyennguyen938-debug/dsm_auto`
2. **Gói sao lưu** — Drive, file `dsm-sao-luu-<ngày>.tar.gz` mới nhất

Thiếu gói sao lưu thì code chạy được nhưng **mất hết bằng chứng chống trùng** — hệ thống
sẽ mua nhãn UPS lần hai, cho kho xuất hàng lần hai. Xem mục 3.

### 4.2. Cài phần mềm nền

```bash
sudo apt update
sudo apt install -y git curl python3 xvfb fluxbox x11vnc websockify novnc
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
```

`xvfb`/`fluxbox`/`x11vnc`/`websockify`/`novnc` chỉ cần cho VNC — dùng khi đăng nhập
Lecangs bằng tay. Bỏ qua được nếu chưa cần nhánh Ground.

### 4.3. Lấy code

```bash
git clone https://github.com/nguyennguyen938-debug/dsm_auto.git
cd dsm_auto/DSM_TuDongHoa
```

Dùng HTTPS vì máy mới chưa có khoá SSH. Muốn **push** được thì làm thêm:

```bash
ssh-keygen -t ed25519 -C "may-moi" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

Dán chuỗi in ra vào https://github.com/settings/keys ▸ **New SSH key**, rồi:

```bash
git remote set-url origin git@github.com:nguyennguyen938-debug/dsm_auto.git
ssh -T git@github.com          # phai thay "Hi <ten>! You've successfully authenticated"
```

### 4.4. Cài thư viện

```bash
cd 10_VM_Tool
npm install                    # playwright · pdfjs-dist · pdf-lib
npx playwright install chromium
npx playwright install-deps chromium
cd ..
```

⚠️ **Không cần WeasyPrint.** Luồng thật dùng `bol_html.py` sinh HTML rồi web app
Apps Script chuyển thành PDF. `fill_bol.py` có đường xuất PDF thẳng cần WeasyPrint,
nhưng đường đó không dùng trong cron.

### 4.5. Trả lại bằng chứng và phiên — MỘT LỆNH

```bash
bash 10_VM_Tool/khoi-phuc.sh ~/dsm-sao-luu-daydu-<ngày>.tar.gz
```

Script tự làm: giải nén → kiểm đủ 7 nhóm bằng chứng → kiểm phiên và khoá → dựng lại
profile Chrome → tạo thư mục làm việc → chạy bộ test → báo phiên DSM còn sống không.

Kết thúc phải thấy **`0 muc loi`**. Nó **không** tự đặt cron (bước 4.6) vì file crontab
có thể chứa dòng của dự án khác — bạn xem rồi tự đặt.

Đã kiểm thật 02/09/2026: giải nén vào thư mục trắng, chạy ra `18 muc tot, 0 muc loi`,
bộ test 97 pass, phiên DSM còn sống.

### 4.6. Đặt lại lịch chạy

```bash
crontab - < 10_VM_Tool/crontab.txt
crontab -l | head -5
```

🔴 **Phải là `crontab - < file`**, không phải `crontab file` — đường dẫn bị cắt ở 100 ký tự.

⚠️ File crontab có **dòng của dự án khác** (`/opt/wayfair`). Máy mới không có dự án đó thì
xoá dòng ấy đi; máy cũ thì **giữ nguyên**.

### 4.7. Đăng nhập lại

**DSM** — phiên trong gói sao lưu thường vẫn sống (cron giữ nó suốt). Kiểm:

```bash
node 10_VM_Tool/giu-session.mjs
```

Báo `SONG` là xong. Báo `CHET` thì `node 10_VM_Tool/login.mjs` rồi đăng nhập tay.

**UPS** — không phải làm gì, token API tự xin lại.

**Lecangs** — xem mục 6.

### 4.8. Kiểm máy mới chạy đúng

Bốn phép, không cái nào tốn tiền hay ghi gì:

```bash
node 10_VM_Tool/test-ground-tra.mjs            # phai ra 97 pass, 0 fail
node 10_VM_Tool/run.mjs --dry                  # phai thay "session: con hieu luc"
node 10_VM_Tool/xu-ly-don.mjs --dry            # liet ke, khong ghi gi
node 10_VM_Tool/kiem-phien-lecangs.mjs         # bao SONG hoac HET
```

Rồi đợi một lượt cron (5 phút) và xem `11_TaiVe/logs/dsm-tool.log` có dòng mới.

### 4.9. Những thứ KHÔNG cần chép sang

`node_modules` (111 MB), trình duyệt Playwright (957 MB), `.profile-ground` (96 MB),
`packingslip/`, `bol/`, `logs/` — cài lại hoặc tải lại được, đừng nhét vào gói sao lưu.

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
