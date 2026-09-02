# TÁI LẬP TRÊN VM MỚI — hướng dẫn cho AI agent

Viết 02/09/2026 cho phiên Claude làm việc trên **máy trắng**. Mọi lệnh dưới đây đã chạy
thật trên VM cũ, không phải viết theo trí nhớ.

> **Đọc hết file này trước khi gõ lệnh đầu tiên.** Có bốn chỗ phải DỪNG hỏi người dùng;
> bỏ qua chúng là làm hỏng thứ không sửa được.

---

## 0. Ba ràng buộc — áp dụng suốt phiên

1. **Không `pkill` / `pgrep`.** Máy có thể chạy chung với dự án khác. Giết tiến trình
   phải theo PID đã ghi lại lúc tạo. Đã sập ba lần vì quy tắc này bị bỏ qua.
2. **Đo trước, kết luận sau.** Nhiều phiên trước sai vì suy từ một dấu hiệu.
3. **Đây là hệ thống chạy thật.** Có thao tác tốn tiền và không hoàn tác được — xem mục 7.

---

## 1. Trước khi bắt đầu — xin người dùng hai thứ

| Cần | Vì sao |
|---|---|
| **Gói sao lưu** `dsm-sao-luu-daydu-*.tar.gz` | trên Drive folder `1mVndvxy60i1pbASMKeS2VuHizou3XCqo`. Không có nó thì hệ thống **mua nhãn UPS lần hai, gửi hoá đơn lần hai** |
| **Xác nhận VM cũ đã chết hẳn** | hai VM cùng chạy cron = mọi việc làm hai lần |

🛑 **DỪNG 1** — chưa có gói sao lưu thì **không đi tiếp**. Dựng code không thôi rồi bật
cron là hệ thống làm lại từ đầu mọi đơn đã xử lý.

---

## 2. Cài phần mềm nền

```bash
sudo apt update
sudo apt install -y git curl python3 xvfb fluxbox x11vnc websockify novnc
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
```

**Kiểm:** `node -v` ra `v24.x`, `python3 -V` ra `3.11+`.

Bốn gói `xvfb fluxbox x11vnc websockify novnc` chỉ cần khi đăng nhập Lecangs bằng tay
(mục 6). Bỏ qua được nếu chưa dùng nhánh Ground.

---

## 3. Lấy code

```bash
git clone https://github.com/nguyennguyen938-debug/dsm_auto.git
cd dsm_auto/DSM_TuDongHoa
```

**Kiểm:** `ls` phải thấy `CLAUDE.md`, `10_VM_Tool/`, `02_AppsScript/`.

Muốn **push** được (không bắt buộc để chạy):

```bash
ssh-keygen -t ed25519 -C "vm-moi" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

Đưa chuỗi in ra cho người dùng dán vào https://github.com/settings/keys ▸ **New SSH key**.
Đó là **nội dung dán vào ô trên web**, không phải lệnh để gõ — nói rõ kẻo họ dán vào
terminal (đã xảy ra). Xong thì:

```bash
git remote set-url origin git@github.com:nguyennguyen938-debug/dsm_auto.git
ssh -T git@github.com    # phai thay "Hi <ten>! You've successfully authenticated"
```

---

## 4. Cài thư viện

```bash
cd 10_VM_Tool
npm install
npx playwright install chromium
npx playwright install-deps chromium
cd ..
```

**Kiểm:** `node -e "import('playwright').then(()=>console.log('ok'))"` in `ok`.

⚠️ Thiếu `install-deps` thì Chromium không chạy, mà lỗi báo ra rất khó đoán.

⚠️ **Không cài WeasyPrint.** `fill_bol.py` có dòng gợi ý cài nó ở đầu file, nhưng luồng
thật dùng `bol_html.py` sinh HTML rồi web app Apps Script đổi sang PDF.

---

## 5. Khôi phục — một lệnh

```bash
bash 10_VM_Tool/khoi-phuc.sh <đường-dẫn-gói.tar.gz>
```

Script tự: giải nén → kiểm 7 nhóm bằng chứng → kiểm phiên và khoá → dựng profile Chrome
→ tạo thư mục làm việc → chạy bộ test → báo phiên DSM còn sống không.

**Kiểm:** dòng cuối phải là **`0 muc loi`**, và trong đó có `bo test: 97 pass, 0 fail`.

Nếu báo thiếu `storageState.json` / `creds.json` / `ups-api.txt` → gói sai hoặc cũ, hỏi
người dùng gói mới. Đừng tự tạo file thay thế.

---

## 6. Đăng nhập lại

**DSM** — phiên trong gói thường còn sống. Kiểm:

```bash
DSM_STATE="$PWD/11_TaiVe/storageState.json" node 10_VM_Tool/giu-session.mjs
```

`SONG` là xong. `CHET` thì `node 10_VM_Tool/login.mjs` rồi **để người dùng tự gõ mật khẩu**.

**UPS** — không phải làm gì, token API tự xin lại. ⛔ **Đừng mở `ups.com/lasso/login`** —
Akamai chặn VM, mỗi lần chạm có thể kéo dài thời gian bị chặn.

**Lecangs** — nếu `node 10_VM_Tool/kiem-phien-lecangs.mjs` báo `HET`:

```bash
bash 10_VM_Tool/vnc.sh bat        # in ra mat khau VNC
```

Đưa người dùng mật khẩu đó và lệnh SSH tunnel:
`ssh -L 6080:localhost:6080 <user>@<IP-VM>` rồi mở `http://localhost:6080/vnc.html`.
Mở Chrome tới `app.lecangs.com` **bằng profile cố định**, để họ tự đăng nhập, tích
*Remember me*.

🛑 **DỪNG 2** — không tự đoán mật khẩu Lecangs. Tài khoản từng bị khoá sau 6 lần sai.

Đăng nhập xong, đóng Chrome bằng **SIGTERM theo PID** (không phải dấu X, không `kill -9`)
để profile được ghi xuống đĩa.

---

## 7. Đặt lại lịch chạy — CHỖ NGUY HIỂM NHẤT

```bash
cat 10_VM_Tool/crontab.txt      # XEM TRUOC, dung dat ngay
```

🛑 **DỪNG 3** — trước khi đặt cron, kiểm hai điều và **hỏi người dùng**:

1. **Dòng `/opt/wayfair`** — của dự án khác. Máy mới không có dự án đó thì **xoá dòng ấy**.
2. **VM cũ đã tắt chưa?** Hai máy cùng cron = mọi đơn xử lý hai lần.

Rồi mới:

```bash
crontab - < 10_VM_Tool/crontab.txt
crontab -l | head
```

🔴 Phải là `crontab - < file`, **không phải** `crontab file` — đường dẫn bị cắt ở 100 ký tự.

⛔ **`chay-ground.sh` CỐ Ý không có trong crontab.** Bật nó là **mua nhãn UPS thật** và
tạo đơn xuất kho Lecangs. Người dùng chưa duyệt. Đừng tự thêm.

---

## 8. Kiểm máy mới chạy đúng

Bốn phép, không phép nào tốn tiền hay ghi gì:

```bash
node 10_VM_Tool/test-ground-tra.mjs            # 97 pass, 0 fail
node 10_VM_Tool/run.mjs --dry                  # "session: con hieu luc"
node 10_VM_Tool/xu-ly-don.mjs --dry            # liet ke, khong ghi
node 10_VM_Tool/kiem-phien-lecangs.mjs         # SONG hoac HET
```

`run.mjs` cần biến môi trường như cron đặt:

```bash
export DSM_STATE="$PWD/11_TaiVe/storageState.json"
export DSM_OUT="$PWD/11_TaiVe/dsm_raw"
```

Rồi đợi một lượt cron (5 phút) và xem `11_TaiVe/logs/dsm-tool.log` có dòng mới.

**Kiểm cuối:** một PO đã xử lý trên máy cũ phải bị bỏ qua, không làm lại:

```bash
node 10_VM_Tool/xu-ly-don.mjs --dry 2>&1 | grep "bo qua" | head -3
```

Thấy `bo qua <PO> - cot C da co carrier ...` là bằng chứng bằng chứng chống trùng đã về đúng chỗ.

---

## 9. Sao lưu lại ngay

Máy mới chạy được rồi thì tạo gói mới, đừng dựa vào gói cũ:

```bash
bash 10_VM_Tool/sao-luu.sh --day-du
```

Rồi upload lên Drive folder `1mVndvxy60i1pbASMKeS2VuHizou3XCqo`:

```bash
node --input-type=module -e "
import fs from 'node:fs/promises'; import * as W from './10_VM_Tool/webapp.mjs';
const p=process.argv[1];
console.log((await W.uploadFile('1mVndvxy60i1pbASMKeS2VuHizou3XCqo', p.split('/').pop(),
             await fs.readFile(p), 'application/gzip')).id);
" 11_TaiVe/dsm-sao-luu-daydu-<ngày>.tar.gz
```

---

## 10. Năm việc không lấy lại được

Mỗi việc có file bằng chứng chặn làm lại. Bằng chứng nằm trong gói sao lưu — đó là lý do
mục 5 phải xong trước mục 7.

| Việc | Bằng chứng | Chạy hai lần thì |
|---|---|---|
| Submit reprint trên DSM | manifest **trên Drive** | hai lệnh in |
| Finalize BOL trên `aaacooper.com` | `11_TaiVe/aact/<PO>.json` | hai số BOL/PRO |
| Mua nhãn UPS | `11_TaiVe/ups/<PO>.json` | **hai nhãn, tiền thật** |
| `Save & Submit` Lecangs | `11_TaiVe/lecangs/<PO>_<tracking>.json` | kho xuất hai lần |
| Gửi hoá đơn | `11_TaiVe/invoice/lo-*.json` | Home Depot nhận hai hoá đơn |

⛔ Riêng `centraltransport.com` (CTII): submit tạo **lệnh pickup thật, xe đến kho, không
huỷ được**, mà form mở công khai không cần đăng nhập. `xu-ly-don.mjs` cố ý bỏ qua mọi đơn
CTII — giữ nguyên như vậy.

🛑 **DỪNG 4** — trước khi chạy bất cứ lệnh nào có `--that`, `--lecangs-that`, `--pickup`,
hoặc `DSM_UPS_ENV=prod`, phải hỏi người dùng.

---

## 11. Sau khi xong — báo cáo gì cho người dùng

- Kết quả `khoi-phuc.sh` (số mục tốt / lỗi)
- Bộ test bao nhiêu pass
- Phiên nào sống, phiên nào cần đăng nhập lại
- Cron đã đặt mấy dòng, có dòng `/opt/wayfair` không
- Đã sao lưu lại và upload chưa

Rồi đọc `CLAUDE.md` mục 8 để biết bốn việc còn treo.
