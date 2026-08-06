# HƯỚNG DẪN XỬ LÝ ĐƠN — CARRIER AACT (AAA Cooper)

Áp dụng khi đơn được phân loại carrier = **AACT**. Ví dụ minh họa dùng đơn **PO 71648792**.

---

## BƯỚC 1 — Trích xuất thông tin từ Packing Slip
Đọc file packing (`<PO>_packing.pdf`) và lấy:
- **Customer Order #** và **Purchase Order # (số PO)**
- **Ship Via** (Misc = pallet)
- **Ship To**: dòng 1 = tên (người/cửa hàng); nếu cửa hàng dòng 2 có "C/O"; kế tiếp là địa chỉ đường phố; rồi City, State, Zip; cuối là số điện thoại
- **Item Description**
- **Qty Shipped**

Ví dụ PO 71648792: Customer Order WH38519362; Ship Via Misc; Ship To = NATALIE ROCHE (người), 6915 BROAD RIVER AVE, LAND O LAKES, FL 34638, (314) 817-6221; Item = Unfinished Acacia Butcher Block Countertop 12ft x 25in x 1.5in; Qty = 1.

---

## BƯỚC 2 — Mở trang tạo BOL của AACT
Truy cập: `https://www.aaacooper.com/workspace/bol?sourceBolTemplateId=50357`

---

## BƯỚC 3 — Điền BOL

### Trang 1
**Shipper:** giữ nguyên.

**Consignee:**
- **Company Name:** nếu Ship To là **người** → dùng dòng 1. Nếu là **cửa hàng** → dùng cả dòng 1 và dòng 2.
- **Address:** địa chỉ đường phố.
- **Location:** chỉ nhập **Zip** (địa chỉ city/state sẽ tự duyệt sau khi nhập zip).
- **Phone:** số điện thoại.

**Bill to:** giữ nguyên.
**Notify if problem:** giữ nguyên.
→ Ấn **Next**.

### Trang 2 — COMMODITY # 1
- **Unit Count:** = Qty Shipped.
- **Weight:** tra theo **SKU** trong file pallet. SKU = **Model Number** trên packing, **chỉ lấy phần SỐ** (vd `832250-B` → `832250`) → khớp đúng dòng ở cột **A (SKU)** → lấy số ở cột **K** ("Packaged Gross Weight") của dòng đó. **Weight = số đó + 55.**
- **Description:** = Item Description.
- **Class:** tính theo PCF (xem công thức bên dưới).
- **Shipment contains:** bỏ tích.

**EMERGENCY RESPONSE:** giữ nguyên.
**SPECIAL INSTRUCTIONS:** điền `PO Number <số PO>`.
**Full Value Coverage (FVC):** điền `200`.
**Pickup / Delivery / Other Accessorials:** giữ nguyên.

**Reference Numbers:**
- Tích ô **Generate PRO # for BOL**.
- **Shipper BOL #:** số PO.
- **Shipper Reference #1:** số PO.
- **Consignee Reference (PO) #1:** Customer Order #.

→ Ấn **Finalize**.

---

### ⚠️ WEIGHT khi Qty Shipped > 1 (chốt 28/07/2026)
**Weight = (cột K) × Qty Shipped + 55.** Chỉ cộng **55 một lần** (pallet), phần cột K nhân theo số tấm.
- Qty = 1 → `K + 55` (các ví dụ cũ trong tài liệu đều là trường hợp này).
- Ví dụ PO 31579451, SKU 812250, Qty 3: `128 × 3 + 55 = 439` (KHÔNG phải 183).
- H vẫn `= 6 + 2 × Qty` → Qty 3 thì H = 12. PCF = 1728×439/(144×25×12) = 17.56 → **Class 70**.
- Description/Special Instructions vẫn theo mẫu `<Qty> pallet - <L>″ x <W>″ x <T>″ - <Weight> lbs`.

### Công thức tính CLASS
1. Xác định 3 kích thước (từ ĐÚNG dòng SKU đã tra):
   - **L** = cột C (length).
   - **W** = cột D (width).
   - **H = 6 + 2 × Qty Shipped**  (KHÔNG dùng cột E).
2. **PCF = (1728 × Weight) / (L × W × H)**  — Weight = (giá trị cột K) + 55.
3. Tra PCF trong `class.csv`: chọn hàng thỏa **Min PCF ≤ PCF < Max PCF** → lấy số **Freight Class** tương ứng.

**Ví dụ PO 71648792 (Model `832250-B` → SKU `832250`, Acacia Butcher Block 12' × 25"):**
- Cột K của dòng 832250 = 128 → **Weight = 128 + 55 = 183**.
- L = 144, W = 25, H = 6 + 2×1 = 8.
- PCF = 1728 × 183 / (144 × 25 × 8) = **10.98**.
- 10.5 ≤ 10.98 < 12 → **Class = 92.5**.

> Lưu ý cấu trúc file: A=SKU, B=Description, C/D/E=Product Dimension (L/W/T), F/G/H=Pallet Dimension (L/W/T), I=Cost, J=RRP, **K=Packaged Gross Weight**. Class hiện dùng **Product Dimension** (L=C, W=D) + H=6+2×Qty. (Nếu muốn đổi sang Pallet Dimension F/G/H thì báo.)

---

## BƯỚC 4 — Lấy file
1. Ấn **Print ▸ BOL PDF** → mở tab mới → ấn nút tải → đổi tên file thành **`<số PO>_BOL`** → đóng tab tải BOL.
2. Về trang cũ → **Print ▸ Shipping Labels** → kéo xuống ấn **Next** → **Create Label PDF** → mở tab mới → ấn nút tải → đổi tên file thành **`<số PO>_ShippingLabel`** → đóng tab.

> Ghi chú: nút tải của trình duyệt lưu tên ngẫu nhiên; đổi tên sau khi tải (hoặc để Claude đổi tên khi đưa lên Drive).

### ✅ TỰ ĐỘNG TẢI ĐƯỢC BẰNG PLAYWRIGHT (giải xong 06/08/2026) — `10_VM_Tool/aact.mjs`

**Câu hỏi để ngỏ từ 01/08 ("AACT có endpoint PDF trực tiếp không?") — trả lời: KHÔNG.**
`fetch` thẳng `/workspace/bol/<n>/pdf` trả `text/html` 81 KB. Workspace là ứng dụng
**Blazor WebAssembly**; PDF được dựng **ngay trong trình duyệt** bằng Telerik
(`Telerik.Documents.Fixed.wasm` ~2,8 MB). Không có URL nào tải thẳng được — và đó chính là
lý do playbook cũ thấy `canvas:0` rồi bó tay, chứ không phải "sự cố toàn site".

Cách chạy được: để WASM dựng xong rồi **bấm nút Download thật**.
Nút nhận diện qua icon **`k-svg-i-download`** trong `.k-pdf-viewer` (nút kia là `k-svg-i-print`) —
nút KHÔNG có chữ nên tìm theo text sẽ trượt. Bắt bằng sự kiện `download` của Playwright.

| | Cách lấy |
|---|---|
| **BOL** | `/workspace/bol/<BOL#>/pdf` → là trang viewer → bấm Download |
| **Shipping Label** | `/workspace/shipping-label?sourceBolNumber=<BOL#>` → **KHÔNG phải viewer**, là FORM: `Next` → `Create Label PDF` → **mở TAB MỚI** chứa viewer → bấm Download |

Đã tải thật 06/08 cho PO 77860619 (BOL 4175504): `Bol-4175504.pdf` 92 KB ·
`ShippingLabel-180625.pdf` 128 KB, cả hai `%PDF` hợp lệ.

⚠️ Đăng nhập: ô user là `#AAACooperMasterPage_bodyContent_txtUserId`. **ĐỪNG lấy "ô text đầu
tiên"** — trong cùng form còn ô tìm kiếm `placeholder="Enter City, State, Zip"` đứng TRƯỚC nó;
lấy nhầm thì user rỗng, đăng nhập lặng lẽ hỏng và trang chỉ hiện lại chính nó.

### ✅ TẠO BOL TỰ ĐỘNG ĐƯỢC — `aact.mjs` hàm `taoBOL()` (nghiệm thu 06/08/2026)

Đã chạy Finalize THẬT một lần để nghiệm thu → **BOL# `4178975` · PRO# `39004838`**.
⚠️ **Đây là BOL RÁC cố ý** (PO `00000000`, consignee `TEST - DO NOT SHIP`, giao về chính kho
Calhoun). Người dùng duyệt tạo để kiểm chứng đường Finalize. **Đừng dùng, đừng xoá nhầm BOL thật.**

`finalize` mặc định **false** — điền xong thì dừng và chụp ảnh. Chỉ truyền `true` khi thật sự tạo.

**Bốn bẫy trên form, khảo sát 06/08:**

| Bẫy | Hệ quả nếu bỏ qua |
|---|---|
| ID mặt hàng có **hậu tố GUID đổi mỗi phiên** (`Weight_bb09a55b-…`) | Hard-code ID là hỏng ngay phiên sau. Phải chọn `[id^="Weight_"]` |
| **`IsHazmat_*` mặc định ĐANG TÍCH** | Tài liệu ghi "Shipment contains: bỏ tích" — dễ đọc nhầm thành "để nguyên". Không bỏ tích thì BOL khai hàng nguy hiểm |
| `Name_ShipmentPartyConsignee` xuất hiện **2 lần** (Company + Contact) | `getElementById` chỉ thấy cái đầu → điền nhầm ô |
| Nhập zip **KHÔNG tự điền** city/state (trái với mô tả cũ ở bước 3) | Để trống là BOL thiếu địa chỉ. Phải điền tay cả ba |

Ô Reference: `#generate-pro-number` (phải TÍCH) · `#customer-bol-number` = PO ·
`#shipper-reference-number-0` = PO · `#purchase-order-number-0` = Customer Order #.

⚠️ **Đọc BOL#/PRO# NGAY sau Finalize và ghi ra file.** Trang `/workspace/bol/<id>` chết sau khi
rời đi (lỗi #16) — mất số là mất luôn. `taoBOL()` trả cả hai số và ghi log ngay.

### 🔴 NẾU KHÔNG TẢI ĐƯỢC BOL / SHIPPING LABEL
Triệu chứng: viewer PDF hiện thanh công cụ + "Page 1 of 1" nhưng **spinner quay mãi**, `canvas = 0`; `Create Label PDF` bấm không mở tab mới. Trang **không báo lỗi gì**.

**Làm theo đúng thứ tự — chi tiết ở `4_Playbook_AACT.md` mục #18:**

1. **LƯU NGAY `BOL#` + `PRO#`.** Trang `/workspace/bol/<id>` chết sau khi rời đi (lỗi #16), mất số là mất luôn.
2. **RELOAD lặp lại** `https://www.aaacooper.com/workspace/bol/<BOL_ID>/pdf` — tối đa **5 vòng**, giãn dần **10s → 30s → 60s → 2 phút → 5 phút**. Mỗi vòng phải **cài lại hook blob** (reload là mất hook).
3. Vẫn hỏng → **mở PDF một BOL cũ** để biết phạm vi. BOL cũ cũng `canvas:0` = **sự cố toàn site AACT** → đừng chờ nữa.
4. → **NHỜ NGƯỜI DÙNG tải tay** 2 file rồi gửi lại, Claude đưa lên Drive. Kèm theo `BOL#`, `PRO#` và 2 link:
   - `https://www.aaacooper.com/workspace/bol/<BOL_ID>/pdf`
   - `https://www.aaacooper.com/workspace/shipping-label?sourceBolNumber=<BOL_ID>`

⛔ **TUYỆT ĐỐI KHÔNG tạo lại BOL.** BOL và PRO đã tồn tại thật; tạo lại = **BOL rác + PRO rác**.

> 🔧 **Sửa 05/08/2026:** dòng này trước ghi "lệnh pickup trùng" — **sai**. AACT **chỉ tạo BOL,
> KHÔNG đặt lịch pickup** (người dùng xác nhận; khớp với `6_QuyTrinh_CTII.md` mục xung đột trần).
> Chỉ **CTII** mới tạo lệnh pickup thật. Cái sai này từng khiến tự chặn việc mình được phép làm.

✅ **Trong lúc chờ, vẫn làm được:** `makeFolder` → upload `<PO>_PackingSlip.pdf` → `fillRow` **kèm `pro`**. Mail kho sẽ không tự gửi vì thiếu file (AACT cần đủ 3) — an toàn. Khi có đủ 2 file còn lại, mail tự chạy.

---

## BƯỚC 5 — Tạo folder `<PO>`, đưa 3 file vào folder, rồi fillRow

**5.1 — Tạo folder `<PO>`:** POST web app `{action:'makeFolder', po:'<PO>'}` → trả `{folderId, url}`. Lưu `folderId` + `url`.

**5.2 — Đưa CẢ 3 FILE vào folder `<PO>`** (folderId ở trên):
   - `<PO>_BOL.pdf` và `<PO>_ShippingLabel.pdf`: đã tải từ web AACT (blob hook → example.com → POST base64, xem `4_Playbook_AACT.md` mục 4) — POST với `folderId` = folder `<PO>`.
   - `<PO>_PackingSlip.pdf`: chèn input vào `example.com` → `file_upload` → FileReader→base64 trong trình duyệt → POST `{folderId:'<folderId>', filename:'<PO>_PackingSlip.pdf', base64, mimeType:'application/pdf'}`.
   - Verify bằng Drive `search_files` (đủ 3 file trong folder `<PO>`).

**5.3 — Điền Sheet qua WEB APP (`fillRow`) — sheet "Order List":** từ tab `example.com`, POST:
   > 🔴 **Sửa 05/08/2026 — ví dụ dưới đây trước có `headers:{'Content-Type':'text/plain'}`. BỎ ĐI.**
   > Đặt header đó làm lỗi `{"ok":true,"msg":"Receiver alive"}` (doPost KHÔNG chạy, sheet không được
   > ghi gì nhưng `ok===true`) xảy ra **liên tục**. File này viết trước khi phát hiện điều đó ngày 03/08.
   > Xem `CLAUDE.md` mục 4. Và **đừng kiểm `o.ok`** — `fillRow` kiểm `o.row`.

   ```js
   fetch(WEBAPP_URL, { method:'POST',
     body: JSON.stringify({ action:'fillRow',
       po:'<PO>', carrier:'AACT', customerOrder:'<Customer Order #>', shipTo:'<Tên>',
       sku:'<Model Number nguyên, vd 832250-B>', productName:'<Item Description>', qty:'<Qty Shipped>',
       pickupSchedule:'<mm/dd/yyyy>', linkDrive:'<url folder>',
       pro:'<PRO# AACT từ Finalize>' }) })
   ```
   Ánh xạ cột: carrier→**C**, customerOrder→**E**, shipTo→**F**, sku→**G**, productName→**H**, qty→**I**, **J=X**, pickupSchedule→**K**, **pro→N**, linkDrive→**P**. Tìm PO ở cột B; không thấy → thêm hàng mới. KHÔNG đụng A/D/L/M/Q.
   - **shipTo = TÊN, BỎ "C/O ..."** Vd `Chad Leyshon C/O THD Ship to Store #3883` → `Chad Leyshon`.
   - **sku** = nguyên Model Number (`832250-B`).
   - **pickupSchedule** = mm/dd/yyyy = hôm nay + (Thứ Sáu +3, Thứ Bảy +2, còn lại +1). Vd Thứ Hai 07/27/2026 → 07/28/2026.
   - **pro** = PRO# AACT (Bước 3 khi Finalize, vd `36997748`) → cột **N**. (AACT KHÔNG confirm DSM.)
   - Kỳ vọng `{ok:true, row, added}`.

> **AACT cần đủ 3 file** (BOL + ShippingLabel + PackingSlip) trong folder `<PO>`. Khi đủ, **GuiMail tự gửi MAIL KHO** (đính kèm 3 file, ngày trong mail lấy từ cột **K**) và đánh **X vào cột M**. **ĐÃ BỎ mail gửi carrier.**
