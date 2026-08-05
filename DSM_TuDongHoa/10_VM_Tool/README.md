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
node run.mjs --dedup               # bỏ PO đã lấy slip (manifest + <PO>_PackingSlip.pdf)
node run.mjs --only 78821006       # chỉ 1 PO (nhiều PO thì cách nhau bằng dấu phẩy)
node run.mjs --max 10              # giới hạn số PO mỗi lô
```

Biến môi trường: `DSM_STATE` (mặc định `./storageState.json`) · `DSM_OUT` (mặc định `./downloads`).

## Nó làm gì

```
1. checkSession        -> hết session thì DỪNG LÔ, exit 3. Không chạy tiếp.
2. needSlip (GET)      -> PO có cột C và D đều trống
3. submitReprint từng PO, nghỉ 1,5 s      ⛔ KHÔNG tải gì giữa lô
4. doiDuSlip           -> đợi tới khi MỌI PO đã submit đều có slip (tối đa 60 s)
5. pendingFiles        -> TẤT CẢ file chờ, không phải chỉ file đầu tiên
6. với TỪNG file: downloadPdf (kiểm %PDF) -> uploadToInbox -> writeManifest
```

### ⚠️ Một lô có thể sinh NHIỀU file chờ (sửa 05/08/2026)

Tài liệu cũ nói file reprint là *một* file dồn tích. **Sai.** Chạy thật 05/08: submit 2 PO cách
nhau 5 giây thì DSM tạo **hai file riêng** (`22576343885` → 78784022, `22576391163` → 78821006).

Bản cũ của `pendingFile()` `break` ngay ở file đầu tiên → tải file 1 xong là dừng, slip trong
file 2 **không ai tải**. Submit thì đã gửi, không hoàn tác được, nên lần chạy sau sẽ submit lại
đúng PO đó = **lệnh reprint trùng**.

Dùng `pendingFiles()` (số nhiều). `pendingFile()` giữ lại chỉ để tương thích — **đừng dùng cho lô**.

**Không** tách trang, **không** đặt tên theo PO, **không** tạo folder ngày —
việc đọc và phân loại do Claude làm ở bước sau.

### Manifest — thứ giữ cho không submit trùng (thêm 05/08/2026)

Dedup cũ tra tên `<PO>_PackingSlip.pdf`, mà file đó chỉ ra đời **sau bước tách file làm tay**.
Khoảng giữa "đã tải file gộp" và "đã tách xong" là **mù hoàn toàn** — chạy lại trong khoảng đó
sẽ submit reprint lần nữa, mà **Submit không hoàn tác được**.

`writeManifest` ghi `<fid>_manifest.json` vào `_INBOX` ngay sau khi tải, liệt kê PO **thật sự
nằm trong file** (lấy từ `pendingFile`, không lấy danh sách đã submit). `needSlip&checkSlip=1`
đọc các manifest này nên biết ngay, không phải đợi tách file.

**Thứ tự upload PDF trước, manifest sau — không được đảo:**

| Tình huống | Hậu quả |
|---|---|
| PDF lên, manifest lên | ✅ bình thường |
| PDF lên, manifest hỏng | submit trùng ở lần chạy sau — phiền, còn cứu được. Script **exit 7** và in rõ PO nào bị ảnh hưởng |
| manifest lên, PDF hỏng | ⛔ **MẤT ĐƠN** — lần sau bỏ qua những PO đó trong khi slip chưa hề được lưu |

Ô cuối cùng là lý do thứ tự này cố định trong code, đừng "tối ưu" lại.

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
| 7 | PDF đã lên Drive nhưng **không ghi được manifest** → chạy lại sẽ **submit trùng**, xem log để biết PO nào |
| 8 | Có PO **đã submit nhưng slip không xuất hiện** sau 60 s → kiểm tay danh sách reprint trên DSM **trước khi** chạy lại |

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
