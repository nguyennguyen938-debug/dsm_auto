# HƯỚNG DẪN XỬ LÝ ĐƠN — Carrier KHÁC AACT
# (SEFL · XGSI · BXID · CTII · FXFE · ABFS)

Áp dụng cho các carrier trên (dùng **form BOL chung** `04_BOL_Form/BOL_Form.html`, KHÁC AACT — AACT điền trên web aaacooper.com).
Thực hiện SAU khi đã trích xuất thông tin từ packing slip (theo `1_DocPackingSlip.md`) và chọn carrier (theo `2_ChonCarrier.md`).

---

## BƯỚC 1 — Điền form BOL

> 🔄 **FORM ĐÃ ĐỔI 29/07/2026.** Cách điền cũ (SPECIAL INSTRUCTIONS có dòng kích thước pallet, `# PKGS`/`QTY` = Qty Shipped, mô tả = Item Description dài) **KHÔNG dùng nữa**. Xem bảng dưới.

Cách nhanh nhất: **để `fill_bol.py` tự làm**, chỉ cần đưa danh sách SKU + Qty, script tự tra `pallet.csv`:

```bash
echo '{"date":"07/29/2026","po":"<PO>","carrier":"BXID",
 "ship_name":"...","ship_address":"...","ship_csz":"City, ST 12345","phone":"(000) 000-0000",
 "cust_order_num":"<Customer Order #> (PO <PO>)",
 "items":[{"model":"812250-B","qty":2},{"model":"810250-B","qty":2}]}' \
 | python3 fill_bol.py BOL_Form.html .
```

### Quy tắc điền hiện hành

| Ô | Giá trị |
|---|---|
| **Date** | ngày viết form (hôm nay) |
| **Bill of Lading Number** · **Pick Up #** | số **PO** |
| **SHIP FROM / Name** | **`HomeDepot.com #8119`** (đổi 31/07/2026 — trước là `NOTS Logistics / All For Wood`). Address/City/Contact **giữ nguyên** Calhoun GA |
| **CARRIER NAME** | **TÊN ĐẦY ĐỦ** tra từ `05_TraCuu/carrier_name.csv` — vd `AACT` → `AAA Cooper Transportation` |
| **SCAC** | **MÃ carrier** — `AACT`, `BXID`, `XGSI`… |
| **SHIP TO / Name** | Store → **`To The Care of <tên, BỎ phần C/O>`** · Khách lẻ → **`<tên khách>`** |
| **SHIP TO / Location** | Store → **`THD Store <mã số store>`** · Khách lẻ → **để trống** |
| **Address** | địa chỉ đường phố |
| **City/State/Zip** | `<Thành phố>, <Bang> <Zip>` — vd `Augusta, ME 04330` |
| **Customer Phone Number** | số điện thoại |
| **SPECIAL INSTRUCTIONS** | ⛔ **CHỈ 3 dòng cố định của Home Depot. BỎ dòng thứ 4** (dòng `<Qty> pallet - L″ x W″ x T″ - <weight> lbs`) — bỏ từ 29/07/2026 |
| **CUSTOMER ORDER NUMBER** | `<Customer Order #> (PO <số PO>)` |
| **# PKGS** (cả ô dòng dữ liệu lẫn **GRAND TOTAL**) | **luôn = 1** |
| **HANDLING UNIT / QTY** (cả 2 ô) | **luôn = 1** |
| **PACKAGE / QTY** (Pieces, cả 2 ô) | **tổng Qty Shipped của mọi SKU** |
| **WEIGHT** (cả 4 ô) | **Σ(cột K × Qty) của mọi SKU, rồi +55 MỘT lần** |
| **ADDITIONAL SHIPPER INFO** *và* **COMMODITY DESCRIPTION** | cấu trúc SKU bên dưới — **hai cột nội dung giống hệt nhau** |

### Cấu trúc dòng mô tả SKU
```
SKU-<Model Number> Unfinished <LOẠI GỖ VIẾT HOA> <độ dài> FT
```
- **Model Number** = nguyên vẹn, gồm cả hậu tố chữ (`812250-B`).
- **Loại gỗ** = chữ ngay sau `Unfinished` trong cột B của `pallet.csv`, **viết HOA** (`HEVEA`, `ACACIA`).
- **Độ dài** = cột **C** (Product Length, inch) ÷ 12 → số feet. `144` → `12`, `120` → `10`, `96` → `8`.
- **Nhiều SKU → mỗi SKU MỘT DÒNG.**

Ví dụ đơn 2 SKU (812250-B ×2 + 810250-B ×2):
```
SKU-812250-B Unfinished HEVEA 12 FT
SKU-810250-B Unfinished HEVEA 10 FT
```
→ `# PKGS = 1` · `HANDLING UNIT QTY = 1` · `PACKAGE QTY = 4` · `WEIGHT = 128×2 + 108×2 + 55 = 527`

### Bố cục bảng
Hai bảng **CUSTOMER ORDER INFORMATION** và **CARRIER INFORMATION** nay chỉ còn **1 hàng dữ liệu** (đã bỏ 2 hàng trống), hàng đó **cao hơn** để chứa nhiều dòng SKU.

### 🔄 CẬP NHẬT 31/07/2026 — Ship From, Ship To, CARRIER NAME, SCAC
Theo mẫu **"Ship to Store Example"** của Home Depot:

| | Store | Khách lẻ |
|---|---|---|
| SHIP TO **Name** | `To The Care of Scott Doering` | `Ali Tanveer` |
| SHIP TO **Location** | `THD Store 0475` | *(để trống)* |

- `fill_bol.py` **tự tách** từ chuỗi Ship To gốc. Vẫn truyền nguyên `"Scott Doering C/O THD Ship to Store #0475"`,
  script tự cắt ra Name + Location. Không phải tự soạn.
- Muốn ghi đè thì truyền thêm khoá `location` trong JSON.
- **CARRIER NAME** = tên đầy đủ, **SCAC** = mã. Script tra `carrier_name.csv`; mã không có trong bảng thì **dừng và báo lỗi**,
  không tự bịa.

Bảng `05_TraCuu/carrier_name.csv` (8 mã):

| Mã | Tên đầy đủ |
|---|---|
| AACT | AAA Cooper Transportation |
| SEFL | Southeastern Freight Lines |
| XGSI | Xpress Global Systems |
| BXID | Braun's Express |
| CTII | Central Transport |
| FXFE | FedEx Freight |
| ABFS | ABF Freight |
| EXLA | Estes Express |

⚠️ **Mẫu của Home Depot đặt `Location` TRƯỚC `Name`**; theo yêu cầu người dùng 31/07 thì đặt **SAU `Name`**.
Nếu HD bắt bẻ thứ tự thì đổi lại trong `BOL_Form.html` (khối SHIP TO body).

⚠️ **`818390` là Hevea *Island*, không phải Butcher Block** — theo quy tắc trên vẫn ra `Unfinished HEVEA 8 FT`, không phân biệt Island. Người dùng đã chốt như vậy 29/07/2026.

*(Các ô khác không nêu ở trên: để trống/mặc định.)*

---

## BƯỚC 2 — Tạo folder `<PO>` & đưa BOL + PackingSlip vào folder đó

**2.0 — Tạo folder `<PO>` (LÀM TRƯỚC):**
POST web app `{action:'makeFolder', po:'<PO>'}` → trả `{folderId, url}`.
- **LƯU `folderId`** (dùng để upload file) và **`url`** (điền cột **P** ở Bước 3).
- Folder được đặt tên = số PO, trong folder cha `1ER7RWu...`, tự set "Anyone with link – Viewer".

**2.1 — BOL PDF (HTML→PDF, KHÔNG base64):**
Sandbox dựng HTML = `fill_bol.to_static(fill_bol.build(template, values))` (`fill_bol.py`; values: date, po, carrier, ship_name, ship_address, ship_csz, phone, special, cust_order_num, qty, weight, item_desc).
POST từ tab `example.com`: `{folderId:'<folderId vừa tạo>', filename:'<PO>_BOL.pdf', html}` → web app tạo PDF & lưu vào folder `<PO>`.
- ⚠️ **POST HTML PHẢI ĐẦY ĐỦ** (cả footer: pháp lý + Shipper/Carrier Signature, Trailer Loaded). Dùng đúng HTML `fill_bol.to_static(...)` sinh ra.

**2.2 — PackingSlip:** chèn input vào `example.com` → `file_upload` → FileReader→base64 **trong trình duyệt** → POST `{folderId:'<folderId>', filename:'<PO>_PackingSlip.pdf', base64, mimeType:'application/pdf'}`.

→ Đủ **BOL + PackingSlip** trong folder `<PO>` TRƯỚC khi fillRow. (Dự phòng: `fill_bol.py` xuất PDF WeasyPrint.)

---

## BƯỚC 3 — Điền Sheet qua WEB APP (`fillRow`) — sheet **"Order List"**
POST cho web app (từ tab `example.com`):
```js
fetch(WEBAPP_URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
  body: JSON.stringify({ action:'fillRow',
    po:'<PO>', carrier:'<MÃ>', customerOrder:'<Customer Order #>', shipTo:'<Tên>',
    sku:'<Model Number nguyên, vd 832250-B>', productName:'<Item Description>', qty:'<Qty Shipped>',
    pickupSchedule:'<mm/dd/yyyy>', linkDrive:'<url folder từ makeFolder>' }) })
```
Ánh xạ cột (App Script tìm PO ở **cột B**, không thấy → thêm hàng mới):
- `carrier`→**C** · `customerOrder`→**E** · `shipTo`→**F** · `sku`→**G** · `productName`→**H** · `qty`→**I** · **J = X** (tự) · `pickupSchedule`→**K** · `linkDrive`→**P**.
- KHÔNG đụng: A(Order Date) · D(PIC) · L(Rithum Confirm) · M(WH Notif) · Q(Note).
- **`shipTo` = TÊN, BỎ phần "C/O ..."** Vd `Chad Leyshon C/O THD Ship to Store #3883` → `Chad Leyshon`.
- **`sku`** = **nguyên Model Number** (gồm cả phần chữ): `832250-B`.
- **`pickupSchedule`** = **mm/dd/yyyy** = hôm nay + (Thứ Sáu +3, Thứ Bảy +2, còn lại +1). Vd Thứ Hai 07/27/2026 → **07/28/2026**.
  > ⚙️ **Từ 31/07/2026 `fillRow` có thể DỜI ngày này.** Nếu cột K đã có **≥15 hàng** cho ngày đó, web app tự đẩy sang
  > ngày làm việc kế (bỏ Thứ Bảy/Chủ Nhật) rồi mới ghi. **Luôn đọc `pickupSchedule` trong response** để biết ngày thật:
  > `{"pickupSchedule":"07/31/2026","pickupRequested":"07/29/2026","pickupMoved":true}`.
  > Ngày báo lại cho người dùng phải là `pickupSchedule`, không phải ngày mình đề nghị.
- **`carrier`** = MÃ CHUẨN: `XGSI` / `BXID` / `CTII` / `SEFL` / `FXFE` / `ABFS`.
- **KHÔNG gửi `pro`** ở nhóm này — PRO (cột **N**) do `TraPRO.gs` (XGSI/BXID) hoặc `CheckMail_PRO.gs` (SEFL/CTII/FXFE/ABFS) tự điền. Riêng **CTII** gửi thêm `pickupNum` → cột **O**.
- Kỳ vọng `{ok:true, row, added}`.

Sau khi đủ file trong folder `<PO>` (CTII cần 3 file — xem `6_QuyTrinh_CTII.md`), **GuiMail tự gửi mail kho** (đính kèm file, ngày trong mail lấy từ cột **K**) và đánh **X vào cột M**.

---

## ⚡ CHẠY NHIỀU ĐƠN CÙNG LÚC (đã test OK 28/07/2026 — 4 đơn trong ~2 phút)

Nhóm carrier này KHÔNG đụng web carrier nên gom lô được. Nhanh hơn nhiều so với làm tuần tự:

1. **Dựng tất cả PDF một lượt bằng WeasyPrint** (không cần POST HTML cho web app):
   ```bash
   pip install weasyprint --break-system-packages     # 1 lần mỗi phiên sandbox
   cd 04_BOL_Form && for j in '<JSON đơn 1>' '<JSON đơn 2>' ...; do echo "$j" | python3 fill_bol.py BOL_Form.html . ; done
   ```
   Verify ngay bằng `pdftotext -layout <PO>_BOL.pdf -` — rẻ hơn nhiều so với mở Drive xem.
2. **Tạo tất cả folder trong 1 lệnh JS** (vòng lặp `makeFolder`), lưu vào `window.__folders`.
3. **Upload TẤT CẢ file bằng 1 input `multiple`:**
   ```js
   document.body.innerHTML='<input type="file" id="multi" accept="application/pdf" multiple>';
   ```
   → `find` ô input → **`file_upload` với mảng nhiều đường dẫn cùng lúc** (giới hạn tổng **10 MB**/lần).
   → 1 lệnh JS duyệt `files`, lấy `po = f.name.slice(0,8)` để tra đúng `folderId`, POST từng file, `setTimeout 400ms` giữa các lần.
   Nhờ **quy ước tên `<PO>_BOL.pdf` / `<PO>_PackingSlip.pdf`** mà map file→folder tự động được.
4. `fillRow` cho từng đơn trong 1 vòng lặp JS.

⚠️ **BẪY `{"ok":true,"msg":"Receiver alive"}` (gặp 03/08/2026 — đơn 51555723).**
Đó là output của **`doGet`**, nghĩa là POST đã bị chuyển thành GET và **`doPost` KHÔNG hề chạy** — sheet không được ghi
gì cả, nhưng `o.ok === true` nên vòng lặp báo thành công. Đã thấy xảy ra ngẫu nhiên ~1/10 lần gọi.
- **Đừng bao giờ chỉ kiểm `o.ok`.** Với `fillRow` phải kiểm **`o.row`** có giá trị; với `makeFolder` kiểm **`o.folderId`**.
- Nguyên nhân đã loại trừ: KHÔNG phải do payload lớn (xảy ra cả với `fillRow` chỉ vài trăm byte).
- Có liên quan tới header: gọi kèm `headers:{'Content-Type':'text/plain;charset=utf-8'}` (như `Upload_PackingSlip.html` đang
  viết) làm lỗi này xảy ra **liên tục**; **bỏ hẳn `headers`** thì `fetch` mặc định vẫn là simple request, không preflight,
  và tỉ lệ hỏng giảm còn thi thoảng. → **Không truyền `headers` khi POST cho web app.**
- Gặp thì gọi lại — mọi action đều idempotent.

⚠️ **Apps Script thỉnh thoảng trả về nguyên trang HTML** thay vì JSON (`JSON.parse` ném `Unexpected token '<'`).
Cũng là lỗi tạm thời, cứ `try/catch` rồi gọi lại 3–4 lần, giãn 2–3 giây. Gặp cả ở `lookup` lẫn upload base64.

⚠️ **Hai lỗi gặp khi gom lô:**
- **`javascript_tool` trả `[BLOCKED: Cookie/query string data]`** khi kết quả chứa URL Drive → **đừng trả URL**, chỉ trả `po + row + ok`.
- **CDP timeout 45s** khi vòng lặp gọi nhiều `fillRow` → POST **vẫn chạy hết** (lỗi #6). Đừng bắn lại mù; `fillRow` tìm PO ở cột B nên chạy lại là **idempotent** (đơn chưa có trong sheet cũng chỉ thêm 1 hàng, không nhân đôi — đã kiểm với PO 89577503).

📌 **Trước khi dựng BOL, kiểm `04_BOL_Form/` xem `<PO>_BOL.pdf` đã có sẵn chưa** — phiên trước có thể đã dựng mà chưa upload. Đối chiếu nội dung bằng `pdftotext`, khớp thì dùng lại, khỏi dựng.

## Ghi chú
- Khác AACT: các carrier này KHÔNG điền BOL trên web carrier mà dùng form HTML chung; KHÔNG confirm DSM.
- Weight & Pallet Dimension đều tra từ file pallet theo **SKU** (Model Number, chỉ lấy phần số).
- Packing slip: up tự động (KHÔNG base64 qua Claude). **⚠️ `file://` bị Chrome chặn** → KHÔNG mở `Upload_PackingSlip.html` cục bộ được. Dùng cách chèn input vào trang https (đã test OK đơn 04564611):
  1. `navigate` tới `https://example.com`.
  2. `javascript_tool`: chèn `<input type=file id=fileInput accept=application/pdf>` vào body.
  3. `find` ô input → `file_upload` đẩy file packing slip (đường dẫn uploads) vào ref.
  4. `javascript_tool`: đọc `files[0]` → FileReader→base64 **trong trình duyệt** → `fetch` POST `{folderId:'<folderId folder <PO>>', filename:'<PO>_PackingSlip.pdf', base64, mimeType:'application/pdf'}` tới WEBAPP_URL (header `Content-Type: text/plain` để né preflight). CHỈ trả về response text (KHÔNG trả base64). **folderId = folder `<PO>` tạo bằng makeFolder** (KHÔNG dùng folder cha).
  5. Kỳ vọng `{"ok":true,...}`; verify bằng Drive `search_files` theo tên file.
  *(`Upload_PackingSlip.html` chỉ để tham chiếu logic; web app dùng lại nhánh base64 sẵn có, không redeploy.)*
