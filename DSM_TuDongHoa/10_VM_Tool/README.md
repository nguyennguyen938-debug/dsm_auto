# 10_VM_Tool — Tool tải Packing Slip chạy tự động (Node + Playwright)

Bản chạy **không cần Claude in Chrome**. Dùng được trên máy cá nhân hoặc VM.
Trạng thái: **đã viết, CHƯA chạy thật trên VM.** Logic đã kiểm chứng qua bản chạy-trong-tab
(xem `../07_Plan_AutoPackingSlip.md`).

## Cài

```bash
cd 10_VM_Tool
npm install
npx playwright install chromium        # thêm --with-deps trên Ubuntu sạch
```

## Đăng nhập một lần

```bash
node login.mjs
```

Mở Chromium có giao diện, **bạn tự nhập mật khẩu**. Script chỉ lưu cookie vào
`storageState.json` (chmod 600). Không đọc, không lưu mật khẩu.

VM headless thì chạy `login.mjs` trên máy cá nhân rồi **copy `storageState.json` lên VM**
(hoặc dùng xvfb + VNC).

> `storageState.json` chứa cookie phiên — coi như mật khẩu. Đừng commit, đừng chia sẻ.

## Chạy

```bash
node run.mjs --dry                 # CHỈ liệt kê PO, không submit gì — chạy cái này TRƯỚC
node run.mjs                       # chạy thật
node run.mjs --dedup               # bỏ PO đã có <PO>_PackingSlip.pdf trên Drive
node run.mjs --only 78821006       # chỉ 1 PO (nhiều PO thì cách nhau bằng dấu phẩy)
node run.mjs --max 10              # giới hạn số PO mỗi lô
```

Biến môi trường: `DSM_STATE` (mặc định `./storageState.json`) · `DSM_OUT` (mặc định `./downloads`).

## Nó làm gì

```
1. checkSession        -> hết session thì DỪNG LÔ, exit 3. Không chạy tiếp.
2. needSlip (GET)      -> PO có cột C và D đều trống
3. submitReprint từng PO, nghỉ 1,5 s      ⛔ KHÔNG tải gì giữa lô
4. pendingFile         -> fid + danh sách PO trong file, đối chiếu với lô đã submit
5. downloadPdf         -> 1 file cho cả lô, kiểm %PDF, ghi ra ./downloads/<fid>.pdf
6. uploadToInbox       -> Drive _INBOX tên <fid>.pdf, có vòng lặp lại
```

**Không** tách trang, **không** đặt tên theo PO, **không** tạo folder ngày —
việc đọc và phân loại do Claude làm ở bước sau.

## Mã thoát

| Mã | Nghĩa |
|---|---|
| 0 | Xong |
| 1 | Lỗi không lường trước (in stack) |
| 2 | Chưa có `storageState.json` → chạy `login.mjs` |
| 3 | **Session DSM hết** → chạy lại `login.mjs`. Tình huống bình thường, không phải bug |
| 4 | Không PO nào submit được → không tải gì |
| 5 | Không có file chờ trong danh sách reprint |
| 6 | Tải được nhưng **không upload được lên Drive** |

## Cron

```cron
# 07:00 mỗi ngày làm việc
0 7 * * 1-5 cd /opt/dsm-tool && /usr/bin/node run.mjs --dedup >> /var/log/dsm-tool.log 2>&1
```

Nên gắn cảnh báo khi exit code **3** (hết session) và **6** (không lên Drive) — hai lỗi này
im lặng thì lô sẽ thiếu file mà không ai biết.

## Điều PHẢI biết trước khi sửa code

1. **Submit KHÔNG HOÀN TÁC ĐƯỢC.** Lỗi thì đừng retry bước Submit.
2. **`downloadFile.do?...&isLive=true` KHÔNG trả PDF** — trả HTML ~59 KB. Nút Download trên trang
   gọi kèm tham số đó; đừng bắt chước. Đã có lần lưu HTML vào Drive dưới tên `.pdf`.
3. **Không kiểm `o.ok` của web app.** `{"ok":true,"msg":"Receiver alive"}` nghĩa là `doPost`
   không chạy. Kiểm field cụ thể: `o.pos` · `o.id` · `o.folderId` · `o.row`.
4. **Không set `headers` khi POST web app.** Đặt `Content-Type:'text/plain'` làm lỗi
   "Receiver alive" xảy ra liên tục.
5. **Apps Script thỉnh thoảng trả HTML** → phải có vòng lặp gọi lại. Đã có trong `uploadToInbox`
   và `needSlip`.
6. **File reprint dồn tích**: chưa Download thì Submit thêm vẫn vào cùng file. Vì vậy phải
   submit hết lô rồi mới tải một lần.
7. **Sheet có nhiều người sửa cùng lúc** — luôn gọi `needSlip` ngay trước khi submit.

## Chưa làm

- [ ] Chạy thật trên VM (chưa test lần nào ngoài môi trường Cowork).
- [ ] Tự phát hiện session sắp hết để đăng nhập lại — hiện chỉ dừng và báo.
- [ ] Phần điền form carrier (AACT/CTII) bằng Playwright. Đây là phần giòn nhất,
      xem `../01_HuongDan_VanHanh/4_Playbook_AACT.md` lỗi #12–#20 trước khi bắt đầu.
