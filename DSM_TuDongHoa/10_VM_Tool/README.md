# 10_VM_Tool — Tool tải Packing Slip chạy tự động (Node + Playwright)

Bản chạy **không cần Claude in Chrome**. Dùng được trên máy cá nhân hoặc VM.

Trạng thái **05/08/2026: ĐÃ CHẠY THẬT trên VM.** Lô đầu tiên (2 PO `78784022`, `78821006`)
đi trọn từ submit tới Drive. Lô đó cũng lộ ra bug "chỉ tải file chờ đầu tiên" — xem mục
*Một lô có thể sinh NHIỀU file chờ* bên dưới.

**Lô 2 (16:01 ngày 05/08) — 4 PO, đã kiểm chứng nốt phần còn thiếu.** DSM lần này **gộp cả 4 PO
vào MỘT file** `22576648112` (4 trang, 241 KB), ngược với lô 1 tách thành 2 file. Xác nhận cả hai
hành vi đều có thật, không đoán trước được. `tachTheoPO` cắt đúng 4 mảnh; số ký tự mỗi mảnh khớp
tuyệt đối với trang nguồn (3211 · 3234 · 3222 · 3217).

Vòng đời dedup cũng đã chạy đủ trên hệ thống thật: chặn bằng manifest → xoá manifest bằng
`donDepManifest` → **vẫn chặn** bằng `<PO>_PackingSlip.pdf`. Lý do bỏ qua tự đổi giữa hai nguồn.

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

VM headless thì chạy `login.mjs` trên máy cá nhân rồi **copy `storageState.json` lên VM**,
hoặc dựng màn hình ảo ngay trên VM — **cách đang dùng**, xem `../11_TaiVe/README.md`.

> `storageState.json` chứa cookie phiên — coi như mật khẩu. Đừng commit, đừng chia sẻ.

### Giữ session (thêm 05/08/2026) — CHƯA BIẾT CÓ TÁC DỤNG KHÔNG

`giu-session.sh` chạy mỗi 5 phút, mỗi lần một `GET gotoHome.do` duy nhất. Không submit, không tải,
không đụng sheet hay Drive. Cookie được gia hạn (nếu có) thì ghi đè lại `storageState.json` kiểu
ghi-tạm-rồi-đổi-tên. Dùng **chung khoá** với `chay-dinh-ky.sh` nên không bao giờ chạy chồng.

Hai kiểu hết hạn cho kết quả ngược nhau, và ta **chưa phân biệt được**:

| Kiểu | Kết quả |
|---|---|
| Theo thời gian **nằm im** (sliding) | Giữ được, có thể vô hạn → giữ nguyên cron 5 phút |
| **Tuyệt đối** từ lúc đăng nhập | Vô ích, chỉ tốn request → **bỏ cron này đi** |

Vì vậy log ghi **tuổi session** mỗi lần kiểm. Đọc kết luận sau một ngày:

```bash
grep CHET ../11_TaiVe/logs/giu-session.log | tail
```

Tuổi lúc chết **vượt xa 5 tiếng** → sliding, đang có tác dụng. Luôn chết quanh **cùng một mốc**
bất kể tương tác → tuyệt đối, gỡ cron.

Mốc đăng nhập lấy từ `storageState.json.info.json` do `login.mjs` ghi — **không** dùng mtime của
`storageState.json`, vì chính `giu-session.mjs` ghi đè file đó mỗi khi cookie đổi.

⚠️ **Session DSM chỉ sống vài tiếng.** Đo 05/08: đăng nhập 10:53, tới 15:46 đã chết sau khi
nằm im. Đăng nhập lại **bắt buộc có người** (`sso.auth.commercehub.com` là OAuth/Frontegg,
không có API key). Nên cron sẽ ghi `ma 3` phần lớn thời gian — **đó là bình thường, không phải bug.**
Chưa rõ hoạt động định kỳ có gia hạn được session không; chạy vài ngày sẽ biết.

## Chạy

```bash
node run.mjs --dry                 # CHỈ liệt kê PO, không submit gì — chạy cái này TRƯỚC
node run.mjs                       # chạy thật
node run.mjs --dedup               # bỏ PO đã lấy slip (manifest + <PO>_PackingSlip.pdf)
node run.mjs --only 78821006       # chỉ 1 PO (nhiều PO thì cách nhau bằng dấu phẩy)
node run.mjs --max 10              # giới hạn số PO mỗi lô
```

Biến môi trường: `DSM_STATE` (mặc định `./storageState.json`) · `DSM_OUT` (mặc định `./downloads`) ·
`DSM_SLIP` (mặc định `<DSM_OUT>/../packingslip`, nơi để file đã tách).

## Nó làm gì

```
1. checkSession        -> hết session thì DỪNG LÔ, exit 3. Không chạy tiếp.
2. needSlip (GET)      -> PO có cột C và D đều trống
3. submitReprint từng PO, nghỉ 1,5 s      ⛔ KHÔNG tải gì giữa lô
4. doiDuSlip           -> đợi tới khi MỌI PO đã submit đều có slip (tối đa 60 s)
5. pendingFiles        -> TẤT CẢ file chờ, không phải chỉ file đầu tiên
6. với TỪNG file: downloadPdf (kiểm %PDF) -> uploadToInbox -> writeManifest
7. tachTheoPO       -> cắt file gộp thành <PO>_PackingSlip.pdf, đẩy lên _INBOX
```

### Tách file tự động (thêm 05/08/2026)

Trước đây phải tách tay, và chính khoảng chờ đó là lý do phải có manifest.

**Khảo sát 11 file thật:** mỗi packing slip đúng **1 trang**, mỗi trang chứa đúng **một** số
8 chữ số và số đó là PO. Dù vậy `tachTheoPO()` không giả định 1 trang/PO — trang nào không đọc
ra PO thì gộp vào PO của trang trước. Đoán sai ở đây nghĩa là **gửi nhầm packing slip cho đơn
khác**, đắt hơn nhiều so với vài dòng phòng xa.

**Mạng an toàn:** `pendingFiles()` đã cho biết file chứa PO nào. `tachTheoPO()` đối chiếu tập PO
đọc được với tập mong đợi; **lệch là ném lỗi**, không trả kết quả nửa vời. Lỗi tách **không làm
mất đơn** vì manifest đã ghi xong trước đó — lần chạy sau vẫn không submit trùng, và file gốc
vẫn còn cả trên đĩa lẫn Drive để tách tay.

File tách vào thẳng **`_INBOX`**, chưa vào `PO - <po>`, vì ở bước này chưa biết carrier nên chưa
có ngày pickup, mà `makeFolder` cần ngày pickup mới tạo được folder. Dedup vì vậy chấp nhận
`<PO>_PackingSlip.pdf` ở **`_INBOX` hoặc `PO - <po>`** — cả hai đều là vị trí chính xác.

**File gộp `<fid>.pdf` không bị xoá trong `run.mjs`** — nó là bản gốc duy nhất để đối chiếu nếu
một file tách bị nghi gán nhầm PO, mà lấy lại từ DSM đồng nghĩa submit reprint lần nữa.
`donDepManifest` xoá nó sau, cùng lúc và cùng điều kiện với manifest (mọi PO trong lô đã có file
tách). Sau đó bản gốc **chỉ còn trên đĩa VM** ở `../11_TaiVe/dsm_raw/`, không được sao lưu.

⚠️ Xoá manifest sớm bằng tay sẽ khiến `<fid>.pdf` **mồ côi** — không còn manifest nào trỏ tới nó
nên `donDepManifest` sẽ không bao giờ dọn. Lúc đó phải xoá tay.

### ⚠️ Một lô có thể sinh NHIỀU file chờ (sửa 05/08/2026)

Tài liệu cũ nói file reprint là *một* file dồn tích. **Sai.** Chạy thật 05/08: submit 2 PO cách
nhau 5 giây thì DSM tạo **hai file riêng** (`22576343885` → 78784022, `22576391163` → 78821006).

Bản cũ của `pendingFile()` `break` ngay ở file đầu tiên → tải file 1 xong là dừng, slip trong
file 2 **không ai tải**. Submit thì đã gửi, không hoàn tác được, nên lần chạy sau sẽ submit lại
đúng PO đó = **lệnh reprint trùng**.

Dùng `pendingFiles()` (số nhiều). `pendingFile()` giữ lại chỉ để tương thích — **đừng dùng cho lô**.

**Không** tạo folder ngày, **không** điền sheet — hai việc đó thuộc bước ④, xem `../00_README.md`.

### Manifest — thứ giữ cho không submit trùng (thêm 05/08/2026)

Dedup cũ tra tên `<PO>_PackingSlip.pdf`, mà file đó chỉ ra đời **sau bước tách file làm tay**.
Khoảng giữa "đã tải file gộp" và "đã tách xong" là **mù hoàn toàn** — chạy lại trong khoảng đó
sẽ submit reprint lần nữa, mà **Submit không hoàn tác được**.

`writeManifest` ghi `<fid>_manifest.json` vào `_INBOX` ngay sau khi tải, liệt kê PO **thật sự
nằm trong file** (lấy từ `pendingFiles`, không lấy danh sách đã submit). `needSlip&checkSlip=1`
đọc các manifest này nên biết ngay, không phải đợi tách file.

**Thứ tự upload PDF trước, manifest sau — không được đảo:**

| Tình huống | Hậu quả |
|---|---|
| PDF lên, manifest lên | ✅ bình thường |
| PDF lên, manifest hỏng | submit trùng ở lần chạy sau — phiền, còn cứu được. Script **exit 7** và in rõ PO nào bị ảnh hưởng |
| manifest lên, PDF hỏng | ⛔ **MẤT ĐƠN** — lần sau bỏ qua những PO đó trong khi slip chưa hề được lưu |

Ô cuối cùng là lý do thứ tự này cố định trong code, đừng "tối ưu" lại.

## Nhánh KHÔNG cần web — `xu-ly-don.mjs` (thêm 06/08/2026)

Nối tiếp `run.mjs`. Chỉ làm **SEFL · XGSI · BXID · FXFE · ABFS**; AACT/CTII phải điền trên web
carrier nên script này bỏ qua, để dành nhánh riêng.

```bash
node xu-ly-don.mjs --dry     # chỉ liệt kê, KHÔNG ghi gì — chạy cái này TRƯỚC
node xu-ly-don.mjs           # chạy thật
node xu-ly-don.mjs --only 48559271
```

```
slip trên đĩa -> lookup sheet -> lọc -> đọc slip -> chọn carrier -> tính BOL
   -> bol_html.py -> makeFolder -> upload BOL + slip -> fillRow
```

**Bốn tầng lọc**, đơn nào không qua thì dừng, không đoán:

| Điều kiện | Xử lý |
|---|---|
| Cột C có carrier **hoặc** cột D có PIC | bỏ qua — có người làm tay, làm nữa = BOL trùng |
| Ship Via = Ground | bỏ qua — dừng ở mức có slip trên Drive |
| Carrier ra AACT/CTII | bỏ qua — cần web carrier |
| Đọc slip lỗi · bang AK/HI · SKU lạ · nhiều SKU | **danh sách chờ người xem**, không tự xử |

Cột C/D được kiểm **lại** ở đây dù `needSlip` đã lọc, vì PIC có thể được điền **sau** khi slip đã tải.

`makeFolder` chốt ngày trước rồi `fillRow` dùng lại đúng ngày đó với `skipCap:true` — thứ tự này
không được đảo, xem `CLAUDE.md` mục 4.

**Không tạo lệnh pickup, không đụng web carrier.** Sai thì sửa được: xoá file, sửa dòng sheet.

`bol_html.py` chỉ xuất HTML rồi để web app dựng PDF — WeasyPrint cần pango/cairo mà VM không có.
Mọi luật điền vẫn nằm ở `fill_bol.py`, file kia không lặp lại luật nào.

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
| 9 | **Tách file thất bại** (hoặc file tách không lên được Drive). Không mất đơn — manifest đã ghi. Tách tay file gốc trong `_INBOX` |

## Cron — ĐANG CHẠY

Gọi qua `chay-dinh-ky.sh`, **đừng gọi `run.mjs` thẳng từ cron** (thiếu flock, thiếu `--max`,
thiếu dịch mã thoát):

```cron
*/30 7-19 * * 1-5 /home/Lenovo/dsm_auto/DSM_TuDongHoa/10_VM_Tool/chay-dinh-ky.sh
*/5  6-20 * * 1-5 /home/Lenovo/dsm_auto/DSM_TuDongHoa/10_VM_Tool/giu-session.sh
```

Log: `../11_TaiVe/logs/dsm-tool.log`. Chạy thử không submit: `DSM_DRY=1 ./chay-dinh-ky.sh`.

⚠️ Mốc giờ trong log **lệch nhau**: dòng của wrapper là ICT, dòng của `run.mjs` là UTC (chênh 7 tiếng).

Đáng gắn cảnh báo cho mã **6, 7, 8, 9** — bốn mã này im lặng thì lô thiếu file mà không ai biết.
Mã **3** thì gặp thường xuyên (session hết hạn), cảnh báo mỗi lần sẽ thành nhiễu.

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
6. **Một lô có thể sinh NHIỀU file chờ** — xem mục riêng ở trên. Vẫn submit hết lô rồi mới tải,
   nhưng phải tải **hết** file chờ, đừng chỉ lấy file đầu tiên.
7. **Sheet có nhiều người sửa cùng lúc** — luôn gọi `needSlip` ngay trước khi submit.

## Chưa làm

- [x] ~~Chạy thật trên VM~~ — xong 05/08/2026.
- [ ] Chuyển `<PO>_PackingSlip.pdf` từ `_INBOX` vào `PO - <po>` ở bước ④.
- [ ] Tự phát hiện session sắp hết để đăng nhập lại — hiện chỉ dừng và báo. Bị chặn bởi SSO
      (OAuth/Frontegg, không có API key), nhiều khả năng **không tự động hoá được**.
- [ ] Phần điền form carrier (AACT/CTII) bằng Playwright. Đây là phần giòn nhất,
      xem `../01_HuongDan_VanHanh/4_Playbook_AACT.md` lỗi #12–#20 trước khi bắt đầu.
