# PLAN — Tool tự tải Packing Slip từ DSM (Rithum)

Lập 28/07/2026 · **chốt 04/08/2026** · Trạng thái: thiết kế xong, **chưa code** (chờ khảo sát giai đoạn 0)

---

## 1. QUYẾT ĐỊNH ĐÃ CHỐT

| Hạng mục | Chốt | Ngày |
|---|---|---|
| Nơi chạy | **JS trong tab DSM đang đăng nhập** — dùng sẵn session, không lưu mật khẩu | 28/07 |
| Phạm vi PO | Hàng có **cột C (Carrier) trống VÀ cột D (PIC) trống**. Một trong hai có dữ liệu = có người làm tay → bỏ qua | 04/08 |
| Tool làm gì | **Submit cả lô rồi tải MỘT file PDF gộp.** Không tách, không đặt tên, không bóc text, không OCR | 04/08 |
| Tool lưu ở đâu | **`_INBOX`, một file duy nhất tên `<fid>.pdf`** — không tách, không đổi tên | 05/08 |
| Đọc & phân loại | **Claude**, đọc file gộp từ Drive bằng `read_file_content` | 05/08 |
| Lọc Ground | **KHÔNG lọc** — đơn Ground cũng cứ lưu vào Drive | 05/08 |

### ⚠️ PHẢI KIỂM: extension Chrome có ở CÙNG MÁY với sandbox không

Sự cố 05/08/2026: tải file mãi không thấy trên đĩa, tưởng lỗi cấu hình Chrome. Thật ra
**extension đang chạy ở một máy khác** với máy chạy Cowork. Khi đó:

| Cách | Kết quả |
|---|---|
| Mount folder Downloads | ❌ File nằm trên đĩa **máy chạy Chrome** |
| Kéo file vào chat | ❌ File ở máy kia |
| Blob + `<a download>` / navigate tới `downloadFile.do` | ❌ JS báo thành công, đĩa không có file |
| `download_file_content` từ Drive | ⚠️ Chạy được nhưng base64 **qua ngữ cảnh**: 2 slip ~43.000 token · 16 slip ≈ **~346.000 token** → vượt ngữ cảnh |

**Cách kiểm nhanh — làm ĐẦU MỖI PHIÊN trước khi tin vào việc tải file:**
1. `list_connected_browsers` → nếu có nhiều hơn 1, `switch_browser` để bạn tự bấm Connect ở đúng máy.
2. Mở `https://example.com`, chạy JS tạo Blob rồi `<a download>` một file `.txt` bất kỳ.
3. Kiểm trong folder đã mount. **Thấy file = cùng máy.** Không thấy = khác máy.

Kiểm 05/08/2026 sau khi chuyển sang trình duyệt tên **"comfirm đơn"**: ✅ **cùng máy** —
file test xuất hiện ngay trong `C:\Users\Lenovo\Downloads`.

**Khi cùng máy** thì mở lại được đường rẻ nhất: tool tải file gộp xuống đĩa → Claude tách bằng
`qpdf`/`pdfseparate`/`pdftotext` trong sandbox, **không tốn token, không cần pdf-lib trong trình duyệt**.
**Khi khác máy** thì bắt buộc đi đường `_INBOX` + `read_file_content` (chỉ trả text, rất nhẹ).

> ⚠️ Mỗi trình duyệt có **session đăng nhập riêng**. Đổi trình duyệt là phải **đăng nhập lại DSM**
> (kiểm 05/08: trình duyệt mới vào `gotoHome.do` bị đẩy sang `sso.auth.commercehub.com`).
| Điều khoản CommerceHub | **Không cấm tự động hoá** (người dùng xác nhận) | 04/08 |

## 2. LUỒNG — SUBMIT CẢ LÔ TRƯỚC, TẢI MỘT LẦN SAU

Người dùng xác nhận 04/08/2026: **nếu chưa bấm Download mà tiếp tục Submit thêm đơn, thì tất cả
packing slip dồn vào MỘT file duy nhất; tải một lần là được hết.** Vì vậy quy trình chốt:

```
① Quét sheet "Order List" từ hàng 7
      lấy PO có cột C (Carrier) TRỐNG **VÀ** cột D (PIC) TRỐNG
      bỏ PO đã có <PO>_PackingSlip.pdf trong _INBOX hoặc trong cây ngày
   ▼
② VÒNG LẶP SUBMIT — CHƯA TẢI GÌ
      với từng PO:  search -> lấy orderid
                    GET  gotoOrderRealmForm.do?orderid=<id>&action=web_packslip_reprint&Go=Go
                    POST GeneralOrderRealmForm  (ship qty = 1)
                    chờ "successfully applied"
      ⛔ KHÔNG bấm Download giữa lô — bấm là cắt lô, các PO sau sẽ rơi vào file khác
   ▼
③ SAU KHI SUBMIT HẾT: mở gotoViewPackslipReprint.do -> lấy <fid> (tên file bỏ .pdf)
   ▼
④ gotoViewFileContents.do?FID=<fid>&FNAME=<fid>.pdf
      -> đối chiếu danh sách PO trong file với danh sách đã submit
      -> thiếu PO nào thì báo ngay, đừng tải rồi mới phát hiện
   ▼
⑤ MỘT lần  downloadFile.do?fileId=<fid>   -> 1 file PDF cho cả lô
      kiểm 2 lớp: blob.type có 'pdf' VÀ 5 byte đầu là '%PDF'
   ▼
⑥ Tool `fetch` PDF (kiểm `%PDF`) -> base64 -> POST lên **`_INBOX`** tên `<fid>.pdf`
   ▼  HẾT PHẦN VIỆC CỦA TOOL. Không tách, không đổi tên, không tải xuống đĩa.
   ▼
⑦ CLAUDE `read_file_content` trên file gộp trong `_INBOX` -> đọc field từng PO
      -> chọn carrier -> tạo BOL -> makeFolder(po, pickupSchedule)
      -> upload BOL + PackingSlip [+ Label] -> fillRow
```

### Phân chia trách nhiệm (chốt 05/08/2026)

| Việc | Ai làm |
|---|---|
| Quét sheet, Submit cả lô, tải PDF gộp, **upload nguyên file vào `_INBOX`** | **Tool** |
| Đọc nội dung, nhận diện từng PO, phân loại | **Claude** (`read_file_content`) |
| Chọn carrier, tạo BOL | **Claude** |
| Tạo folder ngày + upload file vào đó | **Claude** (`makeFolder` → upload) |

Tool **không** tách file, **không** đặt tên theo PO, **không** cần biết folder ngày.

**Vì sao thứ tự này quan trọng:** mỗi lần Submit là một hành động không hoàn tác. Nếu tải giữa lô,
lô bị chia thành nhiều file, phải tải nhiều lần và dễ bỏ sót đơn — mà không thể Submit lại để sửa.

### Đã kiểm chứng 04/08/2026

`read_file_content` trên `77860619_PackingSlip.pdf` (44 KB, trong Drive) trả về:

```
WH40265828  77860619  8/2/26  Misc. Common Carrier
James Neblett  1055 E Us Hwy 80 Unit 3  Pooler, GA 31322  (757) 710-1794
Address Type: Commercial
832250-B  700203712  Unfinished Acacia Butcher Block Countertop - 12ft x 25in x 1.5in   Qty 2
```

Đủ mọi field cần: PO · Customer Order · ngày · Ship Via · Ship To + phone · Address Type · Model · Qty.
Đây là **lớp text thật của PDF**, không phải OCR.

### Vì sao tool KHÔNG bóc text

- Text lấy từ PDF bị **đảo bố cục**: nhãn `Date: Ship Via:` nằm cách xa giá trị của nó; dòng đầu dính liền
  `WH40265828 77860619 8/2/26Misc. Common Carrier`. Regex máy móc sẽ sai chỗ này, Claude đọc thì hiểu.
- Bỏ được OCR — thứ **thật sự chậm** trong bản plan cũ: `Drive.Files.insert({ocr:true})` phải tạo một
  Google Doc rồi xoá, vài giây **mỗi file**; 20 đơn là phần lớn thời gian chạy.
- Không phụ thuộc CDN (pdf.js), không lo PDF ảnh scan (Claude đọc được bằng thị giác).
- Ít code = ít chỗ hỏng.

Đánh đổi: Claude tốn **1 lượt gọi mỗi đơn** để đọc. Lô ≤ 10 đơn không đáng kể.

### Về base64 — vì sao vẫn còn

`doPost` của Apps Script nhận thân request qua `e.postData.contents`, **kiểu string**. Byte thô của PDF
không phải UTF-8 hợp lệ nên nhét thẳng vào JSON là file hỏng. Base64 đổi mỗi 3 byte thành 4 ký tự an toàn
(`A–Z a–z 0–9 + /`) → đi qua JSON nguyên vẹn. Giá: **phình 33%** (70 KB → ~93 KB, trần 10 MB/lần).

Hai đường bỏ được base64, **cả hai đều không dùng cho tool này**:

| Cách | Vì sao không dùng |
|---|---|
| Apps Script tự `UrlFetchApp.fetch` file PDF | Phải chuyển cookie phiên DSM vào Apps Script; cookie sẽ nằm trong Execution log. Người dùng đã loại vì rủi ro bảo mật |
| Trang `HtmlService` + `google.script.run` (nhận Blob thật) | `google.script.run` **chỉ chạy trong trang do web app phục vụ**. Script này phải chạy trong tab DSM để dùng session DSM. `doPost` cũng không bóc được `multipart/form-data` |

Với file 45–70 KB, mã hoá base64 mất phần nghìn giây — **nó chưa bao giờ là chỗ chậm.**

---

## 3. LUỒNG UI TRÊN DSM — người dùng cung cấp 04/08/2026

Ràng buộc số một: **mỗi đơn chỉ tải MỘT LẦN.** Bước Submit ở dưới là hành động **không thể hoàn tác**
(trang ghi rõ: *"All actions taken on orders are final and cannot be changed once submitted"*).
Nên **phải kiểm trùng TRƯỚC khi Submit**, và **không được retry mù** ở bước đó.

### 7 bước bằng tay

| # | Trang | Thao tác |
|---|---|---|
| 1 | Sheet | Tìm PO có **cột C (Carrier) trống VÀ cột D (PIC) trống** |
| 2 | `https://dsm.commercehub.com/dsm/gotoHome.do` | Mở trang chủ OrderStream |
| 3 | Thanh Search trên cùng | Dropdown **`Orders - Purchase Order Number`** + **`Starting With`** → gõ số PO vào ô text → **Go**. Mở ra tab `Order Detail - <PO>` |
| 4 | `Order Detail - <PO>` | Dropdown **Action** (góc phải) → chọn **`Packing Slip Reprint Request`** → **Go** |
| 5 | `Revised Packing Slip Request` | Ô **`SHIP QUANTITY ON PACKING SLIP`** → điền **`1`** → **Submit** ⚠️ **KHÔNG HOÀN TÁC ĐƯỢC** |

> ⚠️ **`SHIP QUANTITY ON PACKING SLIP` là CỜ, không phải số lượng.** Chỉ nhận **0 hoặc 1** —
> nghĩa là "có in dòng này lên packing slip hay không", **không liên quan gì tới Qty của đơn**.
> Nên **luôn điền `1`**, kể cả đơn Qty 2, 5, 10. Người dùng chốt 04/08/2026.
> (Tôi từng hiểu sai đây là số lượng và định bắt kiểm chứng đơn Qty ≥ 2 — giả định đó **sai**, đã bỏ.)
| 6 | **Files ▸ Downloads** | Dòng **`Packing Slip Reprint`** → click vào **con số** ở cột *Number of Files* |
| 7 | `Packing Slip Reprints` | Bảng có `FILE NAME` · `FILE CREATION DATE/TIME` · **`NUMBER OF PACKING SLIPS`** · Action **View / Download** → bấm **Download** |

### Ghi nhận từ ảnh chụp

- Tên file tải về là **dãy số ngẫu nhiên**: `22571656036.pdf` (và trước đó `22540580740.pdf`).
  **Không mang số PO** → sau khi tải phải mở ra đọc PO bên trong mới biết là đơn nào.
- Cột **`NUMBER OF PACKING SLIPS`** cho biết file chứa **bao nhiêu** packing slip. Ảnh hiện `1`.
  File `22540580740.pdf` từng có **27 trang = 27 đơn** ⇒ **DSM có gộp nhiều đơn vào một file.**
  Cơ chế gộp (theo lô? theo mốc thời gian?) **chưa rõ** — phải quan sát khi chạy thật nhiều PO.
- Trang `Order Detail` còn có Action khác: `Cancel`, `Ship`, `Ship with SSCC-IDs (LPN)`.
  **Tuyệt đối không chọn nhầm** — `Ship` và `Cancel` đều là hành động thật trên đơn.
- Ở Downloads có **2 dòng khác nhau**: `Packing Slip` (bản gốc) và `Packing Slip Reprint` (bản in lại).
  **Đơn mới KHÔNG tự có bản gốc** → luôn phải đi đường **Reprint** (người dùng chốt 04/08).
  Nghĩa là **không tránh được bước Submit không hoàn tác**, nên khâu kiểm trùng là bắt buộc.
- Trang `Revised Packing Slip Request` hiện sẵn `QUANTITY ORDERED`, `QUANTITY SHIPPED`, `QUANTITY REMAINING`,
  Ship To, Bill To, Merchant SKU, Vendor SKU, Description — đọc được ngay từ DOM.
  > ❌ **KHÔNG dùng DOM thay cho PDF** (người dùng chốt 04/08). **Vẫn đọc packing slip PDF** để đúng quy trình.
  > Nguồn dữ liệu duy nhất có thẩm quyền là **PDF** — cũng là file kho nhận được, nên mọi quyết định phải
  > khớp với nó. DOM chỉ được dùng để **đối chiếu chéo**, không được dùng để bỏ bước đọc PDF.

---

## 3b. API DSM — KHẢO SÁT THẬT 04/08/2026 trên PO `14567104`

Tất cả dưới đây là **quan sát thực tế**, không suy đoán.

### Bước 3 — tìm PO
Form `dsmQuickSearchForm` (id `quickSearchForm`), **POST**. Ba trường:

| Phần tử | Cách chọn |
|---|---|
| `select#quicksearchOneLineSearchName` | option có text `Orders - Purchase Order Number` |
| `select#criteriaOperator` | option có text `Starting With` |
| `input[name=quicksearchCriteria]` | gõ số PO |
| Nút Go | `input[type=submit][value=Go]` **đang hiển thị** trong form |

> 🔴 **BẪY ĐÃ SẬP**: `input[name=quicksearchbtn]` **KHÔNG phải nút Go** — nó là nút **Expand/Hide**
> mở bảng tìm kiếm nâng cao. Bấm nó xong bảng mở ra và nút Go của one-line search bị **ẩn**
> (`offsetParent === null`), phải bấm `quicksearchbtn` lần nữa để thu lại. Giá trị đã gõ vẫn giữ.

### Bước 3 → 4: LẤY ĐƯỢC `orderid` NỘI BỘ
Sau khi Go, trang chuyển tới:
```
gotoOrderRealmDisplay.do?orderid=<orderid>&action=web_view
```
`14567104` → `orderid=3782058958`. **Đây là cách duy nhất map PO → orderid.**

### Bước 4 — chọn Action
`select#action` (name `action`). Nút Go là **`input#GoButton[name=Go].chub-button`**.

> 🔴 **BẪY ĐÃ SẬP**: trang có **3 phần tử chữ "Go"** (thanh Search · Action · một cái ẩn).
> Lấy "Go" đầu tiên là bấm nhầm Search → nhảy sang `gotoGenericSearchResults.do` liệt kê **toàn bộ đơn**.
> Phải tìm `#GoButton` **trong cùng phần tử cha với `select#action`**.

Với đơn `14567104` (status *Undelivered*) dropdown chỉ có 2 option: `""` và `Packing Slip Reprint Request`
— **không** có `Ship`/`Cancel`. Nhưng đơn khác thì có, nên luật chọn theo text tuyệt đối vẫn giữ.

**Đi tắt được**: bước 4 chỉ là một **GET**:
```
gotoOrderRealmForm.do?orderid=<orderid>&action=web_packslip_reprint&Go=Go
```

### Bước 5 — Submit
Form `GeneralOrderRealmForm`, **POST**. Tên trường **động theo id**:

| Trường | Tên |
|---|---|
| Ship Quantity | `order(<orderid>).item(<itemid>).shipped` |
| hidden | `order(<orderid>).id` · `order(<orderid>).item(<itemid>).id` |
| Nút Submit | `input#confirmreprintbtn[value=Submit]` |

`14567104` → `itemid=3880504445`.
Thành công → `gotoOrderRealmSuccessMessage.do` + *"Your requested transaction was successfully applied."*

> ✅ Đơn này có **QUANTITY REMAINING = 0** mà Submit **vẫn thành công**. Vậy remaining = 0 không phải rào cản.

### Bước 6 — Downloads
| Menu | URL |
|---|---|
| Downloads | `gotoFileSummary.do` |
| Upload Files | `gotoUploadFile.do` |
| File History | `gotoFileHistory.do` |
| File Error Summary | `gotoFileErrorSummary.do` |

Trang `gotoFileSummary.do`: con số ở cột *Number of Files* là link.
- dòng **Packing Slip** (gốc) → `gotoViewPackslips.do`
- dòng **Packing Slip Reprint** → `gotoViewPackslipReprint.do`

> Link nằm trong `<td>` đầu; lọc theo text `/Packing Slip Reprint/` **không đáng tin** vì dễ trúng dòng gốc.
> An toàn hơn: click theo toạ độ sau khi screenshot, hoặc mở thẳng `gotoViewPackslipReprint.do`.

### Bước 7 — nút View và Download là `<button>`, KHÔNG có href
Cả hai là `<button>` gắn listener bằng JS, **không** `href`, **không** `onclick` attribute → không suy ra URL
tĩnh được, phải `.click()` rồi bắt network.

**View** → `gotoViewFileContents.do?FID=<fid>&FNAME=<fid>.pdf`
⚠️ Đây là **trang HTML liệt kê PO trong file**, KHÔNG phải PDF (fetch trả `text/html`, 57 KB).
⭐ Nhưng cực hữu ích **gấp đôi so với dự kiến**: mỗi dòng PO là một link
`gotoOrderDetail.do?Hub_PO=<orderid>&PID=thehomedepot&FID=<fid>&FNAME=<fid>.pdf`
→ **có sẵn map PO → orderid** ngay trong trang này. Kiểm 04/08: `08572898 → 3781490168`,
`14567104 → 3782058958` (khớp orderid lấy được từ search).
→ Với các PO đã nằm trong file, **không cần search từng PO nữa**.

**Download** → hai request liên tiếp:
```
getFileType.do?fileId=<fid>                  -> {"type":"PL_FILE"}  (không cần dùng)
downloadFile.do?fileId=<fid>&isLive=true
```

> 🔴 **BẪY QUAN TRỌNG NHẤT — `isLive=true` KHÔNG trả PDF.**
> Nút Download trên trang gọi kèm `isLive=true`, nhưng URL đó trả **`text/html` 59 KB**.
> Đã thử 4 biến thể (kiểm 04/08/2026, HTTP 200 cả 4):
>
> | URL | Content-Type | Kích thước | `%PDF` |
> |---|---|---|---|
> | `downloadFile.do?fileId=<fid>&isLive=true` | text/html | 59 KB | ❌ |
> | `downloadFile.do?fileId=<fid>&isLive=true&fileType=PL_FILE` | text/html | 59 KB | ❌ |
> | **`downloadFile.do?fileId=<fid>&isLive=false`** | **application/pdf** | **127 KB** | ✅ |
> | **`downloadFile.do?fileId=<fid>`** (bỏ hẳn isLive) | **application/pdf** | **127 KB** | ✅ |
>
> → **Dùng `downloadFile.do?fileId=<fid>`, đừng bắt chước tham số của nút trên trang.**

Ghi chú: lần bấm nút đầu tiên `downloadFile.do` trả **503** (các request Google Analytics cùng lúc cũng 503)
→ lỗi tạm thời, thử lại là được.

### ⭐ CƠ CHẾ GỘP FILE — ĐÃ XÁC MINH
File reprint là **một file chờ dồn tích**, không phải mỗi lần Submit một file:

| Mốc | File | Number of packing slips |
|---|---|---|
| Trước khi Submit `14567104` | `22571656036.pdf` (tạo 08/03 11:07 PM) | **1** |
| Sau khi Submit `14567104` | **cùng file đó, cùng mốc thời gian** | **2** |

`View` xác nhận file chứa đúng **`08572898`** và **`14567104`**.
File packing slip **gốc** `22567785321.pdf` chứa **16** packing slip.

**Hệ quả cho thiết kế — đây là điều quan trọng nhất thu được:**
> Submit reprint cho **N** đơn → chỉ cần **MỘT** lần `downloadFile.do` → tách trang theo PO.
> Đúng như phương án tối ưu đã dự đoán. Không phải tải N file.
> Và `gotoViewFileContents.do` cho biết trước file gồm PO nào để đối chiếu sau khi tách.

### 🔴 SỰ CỐ ĐÃ XẢY RA THẬT 04/08/2026 — HTML lưu dưới tên .pdf

Lần upload đầu dùng `gotoViewFileContents.do` (tưởng là URL PDF) → Drive nhận file
`22571656036.pdf` **57.944 byte**, nội dung là **trang HTML** của DSM. Web app trả `ok:true` + có `id`,
nên **không có gì báo lỗi**. Chỉ phát hiện khi đọc lại nội dung file từ Drive.

**Luật rút ra — tool phải kiểm 2 lớp trước khi POST:**
1. `blob.type` phải chứa `pdf`.
2. 5 byte đầu phải là `%PDF` (đọc bằng `TextDecoder` trên `arrayBuffer`).
Không thoả → **báo lỗi, đừng upload**. Kích thước cũng là dấu hiệu: HTML ~57–59 KB, PDF ~127 KB.

### Đã trả lời xong toàn bộ

| Câu hỏi | Kết luận |
|---|---|
| Token CSRF | **Không có** — chỉ cần session cookie (`credentials:'include'`) |
| Map PO → orderid | Từ URL sau search, hoặc từ link `Hub_PO` trong `gotoViewFileContents.do` |
| URL PDF thật | `downloadFile.do?fileId=<fid>` — **bỏ `isLive`** |
| Cơ chế gộp | Dồn tích: chưa Download thì Submit thêm vẫn vào **cùng một file** |
| Thứ tự đúng | **Submit hết cả lô → rồi mới Download một lần** |

### ⏳ Còn 1 mục cần quan sát khi chạy lô thật

Sau khi Download, dòng `Packing Slip Reprint` ở `gotoFileSummary.do` có về **0** không?
- Nếu **về 0** → mỗi lô sạch sẽ, không cần lọc gì thêm.
- Nếu **vẫn còn** → file cũ sẽ lẫn vào lô sau. Khi đó bước ⑥ phải **chỉ lấy những trang có PO nằm
  trong danh sách vừa submit**, các trang khác bỏ qua (không xoá, không ghi đè).

Cách xử lý an toàn cho cả hai trường hợp: **luôn** đối chiếu PO đọc được trong từng trang với danh sách
đã submit ở bước ④, thay vì tin rằng file chỉ chứa đúng lô của mình.

---

## 4. GIAI ĐOẠN 1 — Thêm 2 action vào web app

Thêm vào `NhanFile_Drive_WebApp.gs`, **không phá action cũ**. Sửa xong phải **Deploy ▸ New version**.

### `{ action: 'needSlip' }`
- Quét `Order List` từ hàng 7: lấy PO ở cột B mà **cột C trống VÀ cột D trống**.
- Đã có `<PO>_PackingSlip.pdf` trong `_INBOX` hoặc trong cây ngày → **bỏ qua** (chạy lại nhiều lần vẫn an toàn).
- Trả `{ ok:true, pos:[...] }`. Bên gọi kiểm **`o.pos`**.

### `{ action: 'saveSlip', po, base64, mimeType }`
**Không nhận `pickupSchedule`** — lúc này carrier chưa chọn, cột K còn trống, chưa biết folder ngày.

```js
var INBOX_FOLDER_ID = '18rFktqm_K_a9-RPW5S0o2fTkmmHITGKO';  // _INBOX, nằm trực tiếp trong "THD Orders"
```

1. `DriveApp.getFolderById(INBOX_FOLDER_ID)` → `_childFolder(inbox, 'PO - ' + po)`.
2. Lưu `<PO>_PackingSlip.pdf`, trùng tên thì ghi đè.
3. Trả `{ ok:true, po, id, url }`. Bên gọi kiểm **`o.id`**.

> Dùng **ID cố định**, không `_childFolder(root,'_INBOX')` — nếu ai đổi tên folder, cách dò theo tên sẽ
> âm thầm tạo ra một `_INBOX` thứ hai rồi ghi file vào chỗ không ai nhìn.

### Sửa `_makeFolder` — tự dọn `_INBOX`

Sau khi tạo/lấy `THD Orders/<ngày>/PO - <po>/`:

1. Tìm `PO - <po>` trong `INBOX_FOLDER_ID`. Không có thì thôi.
2. Có thì **`file.moveTo(poF)`** từng file; trùng tên thì bỏ file cũ ở đích trước.
3. Xoá folder `_INBOX/PO - <po>` khi đã rỗng (`setTrashed(true)`); **giữ lại** `_INBOX`.
4. Trả thêm `movedFromInbox: <số file>`.

Nhờ vậy **thứ tự gọi ở luồng chính không đổi**: `makeFolder` → upload BOL/Label → `fillRow`.
Packing slip đã nằm sẵn trong folder, không upload lại.

> `moveTo`, **không** copy-rồi-xoá — copy đổi file ID và làm mất link đã chia sẻ.
> `_INBOX` không set ANYONE_WITH_LINK; chỉ folder ngày mới set.

### Luật bắt buộc khi POST

- **KHÔNG kèm `headers`.** `fetch` mặc định đã là simple request. Đặt `Content-Type:'text/plain'` làm lỗi
  `Receiver alive` xảy ra **liên tục** (kiểm 03/08).
- **Không kiểm `o.ok`** — `{"ok":true,"msg":"Receiver alive"}` là output của `doGet`, nghĩa là POST bị biến
  thành GET và **không ghi gì**. Kiểm field cụ thể: `needSlip`→`o.pos` · `saveSlip`→`o.id` · `makeFolder`→`o.folderId` · `fillRow`→`o.row`.
- Apps Script thỉnh thoảng trả nguyên trang HTML → `try/catch` `JSON.parse` rồi gọi lại 3–4 lần, giãn 2–3 s.
- Mọi action **idempotent** — lỗi thì cứ gọi lại.

---

## 5. GIAI ĐOẠN 2 — Script chạy trong tab DSM

Bookmarklet hoặc đoạn Claude chạy bằng `javascript_tool`. Yêu cầu:

- Gọi `needSlip` → nhận danh sách PO.
- Mỗi PO: tìm đơn → `fetch` PDF → `Blob` → `FileReader` → base64 → POST `saveSlip`.
- **Nghỉ 1–2 giây giữa các PO.**
- **Lỗi 1 PO không làm dừng cả lô** — ghi `{po, error}` rồi đi tiếp.
- Kết thúc bằng **một JSON gọn** `[{po, fileId, url}]` — chính là giá trị `javascript_tool` trả về cho Claude,
  không phải copy tay.
- **Viết JS đồng bộ.** `javascript_tool` trả `{}` với hàm `async` có `await setTimeout` (code vẫn chạy nhưng
  không nhận được kết quả).
- Không log cookie, token, mật khẩu.

Toàn bộ base64 sinh ra và biến mất **bên trong trình duyệt** — không đi qua Claude.

---

## 6. GIAI ĐOẠN 3 — KIỂM CHỨNG (đừng bỏ)

| # | Cách kiểm | Đạt khi |
|---|---|---|
| 1 | Chạy 1 PO thật (`14567104`, 04/08/2026) | file vào `_INBOX`, `read_file_content` đọc ra PO khớp `14567104` |
| 2 | Chạy 3 PO | 3 folder trong `_INBOX`, đọc được đủ field |
| 3 | Chạy lại y nguyên lô đó | **bỏ qua hết**, không tải trùng |
| 4 | Cắt mạng giữa lô | PO đã xong vẫn còn, PO lỗi được liệt kê |
| 5 | Làm BOL cho PO đã có slip trong `_INBOX` | `makeFolder` trả `movedFromInbox:1`; file nằm trong folder ngày; `_INBOX/PO - <po>` biến mất, `_INBOX` còn |
| 6 | Làm BOL cho PO **chưa** có slip | `movedFromInbox:0`, không lỗi |

---

## 7. RỦI RO

| Rủi ro | Xử lý |
|---|---|
| **Submit Reprint không hoàn tác được** | Kiểm trùng **trước** Submit (`needSlip` đã lọc); **không retry** bước Submit khi lỗi — ghi PO đó ra để người dùng xem, đừng bấm lại |
| **Chọn nhầm Action** (`Ship` / `Cancel` nằm ngay cạnh `Packing Slip Reprint Request`) | Chọn option **theo text tuyệt đối** `=== 'Packing Slip Reprint Request'`, không theo index; screenshot xác nhận trước khi bấm Go |
| **Tên file không mang số PO** (`22571656036.pdf`) | Đọc PO **bên trong** từng trang; nếu file gộp nhiều đơn thì tách trang rồi đặt tên `<PO>_PackingSlip.pdf` |
| DSM có CSRF token / chặn fetch tự động | Lấy token từ DOM trong cùng session; bị chặn thì lùi về Claude điều khiển Chrome bấm tay |
| PO ≠ `orderId` nội bộ | Giải quyết ở giai đoạn 0 |
| Đọc sai PO | PO bóc ra phải khớp regex **8 chữ số** *và* khớp PO đã yêu cầu; lệch thì báo lỗi, **không ghi** |
| Lô 20+ đơn tốn nhiều lượt đọc | Chia nhỏ lô; hoặc xét lại phương án **pdf.js bóc text trong tab** (1 lượt cho cả lô, nhưng phải tự viết parser cho bố cục đảo lộn) |
| Quota Drive/UrlFetch | Giới hạn ≤ 20 PO mỗi lượt |
| Sheet có người khác sửa cùng lúc | Chấp nhận; `needSlip` chạy lại là ra danh sách mới |

---

## 8. SẢN PHẨM GIAO

1. `NhanFile_Drive_WebApp.gs` — thêm `needSlip` + `saveSlip`, sửa `_makeFolder` dọn `_INBOX` → **Deploy New version**
2. `08_Bookmarklet_TaiPackingSlip.js` — script chạy trong tab DSM
3. Mục "API DSM" trong file này — kết quả khảo sát giai đoạn 0
4. Cập nhật `01_HuongDan_VanHanh/1_DocPackingSlip.md` — nhận đầu vào từ `_INBOX` thay vì file người dùng gửi

**Bước kế tiếp:** người dùng mở DSM tới trang có nút tải packing slip → khảo sát giai đoạn 0.

---

## 9. VIỆC RIÊNG, KHÔNG THUỘC PLAN NÀY

`04_BOL_Form/Upload_PackingSlip.html` (trang upload tay) hiện cũng dùng base64 và phải nhét URL web app vào
file HTML rời, từng bị Chrome chặn khi mở bằng `file://`. Có thể viết lại thành trang **`HtmlService` do
chính web app phục vụ** — `google.script.run` nhận Blob thật, không base64, không lo chặn `file://`.
Chỉ áp dụng cho **upload tay**, không dùng được cho tool DSM. Chưa làm, chờ người dùng quyết.
