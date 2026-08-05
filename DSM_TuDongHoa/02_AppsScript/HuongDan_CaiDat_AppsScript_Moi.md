# HƯỚNG DẪN CÀI APPS SCRIPT (sheet mới "Lowes, THD - Xuan Follow")

Vì tất cả script giờ mở sheet bằng `openById` (KHÔNG bám theo sheet nào), ta dùng **1 project Apps Script ĐỘC LẬP** do **info@** sở hữu. Không cần gắn script vào sheet của Xuan (tránh rắc rối quyền sở hữu).

⚠️ Điều kiện tiên quyết:
- **info@** có quyền **Edit** sheet Xuan (`1Fzwr2GDHOHxMgqPNf-Ksf6qJ5IIl3mNzrOQrHqH57fo`).
- **b2b@** cũng có quyền **Edit** sheet Xuan (vì `checkMarioPro` chạy bằng b2b@ và ghi cột **N**).
- **rithumgetorder@gmail.com** cũng có quyền **Edit** sheet Xuan (vì `checkRithumOrders` chạy bằng tài khoản này và ghi cột A/B).
- b2b@ là alias "Send mail as" đã xác minh của info@ (đã có từ trước).

---

## PHẦN 1 — Tạo project & dán code (đăng nhập **info@**)

1. Mở **https://script.google.com** → **New project**. Đặt tên vd `AFW-DSM`.
2. Xoá file `Code.gs` mặc định. Tạo **4 file** (biểu tượng **+** ▸ Script), dán nội dung tương ứng:
   - `NhanFile_Drive_WebApp.gs`
   - `CheckRithum.gs`
   - `TraPRO.gs`
   - `CheckMail_PRO.gs`
   (Copy y nguyên từ thư mục `02_AppsScript`.)

   > ⚠️ **KHÔNG dán `GuiMail_BOL.gs`.** Mail báo kho đã bỏ từ 01/08/2026; file này chuyển sang
   > `06_File_Cu_KHONG_DUNG/` và **chỉ giữ để dự phòng**. Dán vào project sẽ làm hàm `processOrders`
   > xuất hiện lại trong danh sách Run và rất dễ chạy nhầm → kho nhận mail không mong muốn.
   > Nó còn mang `PARENT_FOLDER_ID` cũ (`1ER7RWu...`, cấu trúc phẳng đã bỏ).
   > Muốn bật lại mail: dán file, **sửa `PARENT_FOLDER_ID` sang `1hsWarcdjtK63CD8As9CtXqJTcUPg8oAw`
   > và sửa logic tìm file theo cây `<ngày>/PO - <po>/`** trước, vì cấu trúc Drive đã đổi.
3. **Save** (Ctrl+S).

## PHẦN 2 — Bật Advanced Drive Service (cho OCR của CheckMail)

4. Bên trái, mục **Services** ▸ **+** ▸ chọn **Drive API** ▸ **Add**. (Không có bước này thì OCR PRO của CheckMail lỗi.)

## PHẦN 3 — Cấp quyền (đăng nhập **info@**)

5. Ô chọn hàm (cạnh Run) → chọn **`authorizeScopes`** → **Run** → **Review permissions** → chọn info@ → **Advanced** ▸ **Go to … (unsafe)** ▸ **Allow**.
   - Log hiện "OK: có quyền Drive + Spreadsheets + mở được sheet Xuan." là đạt.
   - Nếu báo không mở được sheet → info@ chưa có quyền Edit sheet Xuan (xin quyền rồi chạy lại).

## PHẦN 4 — Deploy Web App (đăng nhập **info@**)

6. Góc phải **Deploy** ▸ **New deployment** ▸ bánh răng ▸ **Web app**.
7. Đặt: **Execute as = Me (info@)**, **Who has access = Anyone**. ▸ **Deploy** ▸ Authorize nếu hỏi.
8. **COPY Web app URL** (kết thúc `/exec`).
   ⚠️ **Đây là URL MỚI, khác URL cũ.** GỬI URL này cho Claude để cập nhật các lệnh POST (makeFolder/fillRow/upload) và guide. Trước khi cập nhật, luồng tạo đơn sẽ chưa chạy đúng.

## PHẦN 5 — Cài trigger chạy tự động

### ⚠️ QUY TẮC VÀNG VỀ TRIGGER (đọc trước khi làm)
- **Trigger chạy dưới quyền tài khoản ĐÃ TẠO RA NÓ**, không phải chủ project.
- Ở màn hình **Triggers**, mỗi tài khoản **chỉ nhìn thấy trigger của chính mình** → muốn xoá trigger của tài khoản khác thì **phải đăng nhập tài khoản đó**.
- Hàm nào **đọc Gmail** thì trigger phải thuộc đúng hộp thư chứa mail:
  | Hàm | Đọc hộp thư | Trigger phải tạo bằng |
  |---|---|---|
  | ~~`processOrders` (gửi mail kho)~~ | — | **ĐÃ XOÁ 04/08/2026 — không tạo lại** |
  | `fillPro` (PRO XGSI/BXID) | — (tra web) | **info@** |
  | `checkMarioPro` (PRO từ tem) | b2b@ | **b2b@** |
  | `checkRithumOrders` (đơn mới) | rithumgetorder@ | **rithumgetorder@gmail.com** |

### 🔄 CÀI LẠI TRIGGER TỪ ĐẦU (làm khi nghi trigger sai chủ / chạy code cũ)

**B0. Dán code mới + Save** cả 5 file, rồi **Deploy ▸ Manage deployments ▸ ✏️ ▸ New version ▸ Deploy** (web app).
> Trigger luôn chạy bản code **mới nhất đã Save** (deployment "Head"), nên chỉ cần Save là trigger dùng code mới; Deploy chỉ cần cho **web app**.

**B1. XOÁ trigger cũ — lặp lại cho TỪNG tài khoản** (info@, b2b@, rithumgetorder@):
1. Đăng nhập tài khoản đó → mở project **AFW-DSM**.
2. Bên trái chọn ⏰ **Triggers**.
3. Với mỗi dòng: bấm **⋮** ▸ **Delete trigger**. Xoá hết cho tới khi danh sách trống.
> Nếu tài khoản chưa từng mở project: info@ vào **Share** thêm tài khoản đó quyền **Editor** trước.

**B2. TẠO LẠI — bằng info@** (⏰ Triggers ▸ **+ Add Trigger**), tạo **1 cái**:
| Choose which function | Deployment | Event source | Type | Interval |
|---|---|---|---|---|
| `fillPro` | Head | Time-driven | Minutes timer | **Every 15 minutes** |
→ Save. Nếu hỏi quyền: **Review permissions ▸ Advanced ▸ Go to… ▸ Allow**.

> ⛔ **KHÔNG tạo trigger `processOrders`.** Mail báo kho đã bỏ; trigger này đã được xoá ngày 04/08/2026.
> Tạo lại là kho nhận mail không mong muốn. Xem mục "PRO LẤY TỪ FOLDER, KHÔNG CÒN ĐỌC MAIL".

**B3. TẠO LẠI — bằng b2b@**: đăng nhập b2b@ → mở project → Add Trigger:
| `checkMarioPro` | Head | Time-driven | Minutes timer | **Every 15 minutes** |
→ Allow bằng b2b@.

**B4. TẠO LẠI — bằng rithumgetorder@gmail.com**:
- info@ **Share** project cho `rithumgetorder@gmail.com` quyền **Editor**; chia sẻ **sheet Xuan** quyền **Editor** cho tài khoản này.
- Đăng nhập `rithumgetorder@gmail.com` → mở project → Add Trigger:
| `checkRithumOrders` | Head | Time-driven | Minutes timer | **Every 10 minutes** |
→ Allow.

**B5. KIỂM TRA**
- Mỗi tài khoản mở ⏰ Triggers, xác nhận **chỉ có đúng hàm của mình** (info@: 2 · b2b@: 1 · rithumgetorder@: 1).
- Mở **Executions** (biểu tượng ☰ bên trái) xem log chạy: cột **Status** phải là *Completed*. Nếu *Failed* → bấm vào xem lỗi.
- Chạy tay 1 lần để test ngay: chọn hàm ▸ **Run** (nhớ: chạy tay bằng tài khoản đang đăng nhập — muốn test `checkRithumOrders` thì phải đang là rithumgetorder@).



> ⚠️ Mục 5a/5b bên dưới là **BẢN CŨ, ĐÃ SAI** ở chỗ `checkRithumOrders`. Làm theo **B1–B5** ở trên.
> Đúng: `checkRithumOrders` chạy bằng **rithumgetorder@gmail.com** (mail Rithum forward về hộp đó, xem `RITHUM` trong `CheckRithum.gs`), KHÔNG phải b2b@.

**5a. Bằng info@** (biểu tượng đồng hồ ⏰ **Triggers** ▸ **Add Trigger**), tạo 2 trigger:
   - `processOrders` — Time-driven ▸ mỗi 5 phút. (gửi mail kho — không đọc hộp thư)
   - `fillPro` — Time-driven ▸ mỗi 15 phút. (PRO XGSI/BXID tra online — không đọc hộp thư)

**5b. Bằng b2b@** (hàm này ĐỌC hộp thư b2b@ nên PHẢI chạy bằng b2b@):
   - Ở project (info@) → **Share** (nút chia sẻ project) → thêm **b2b@** quyền **Editor**.
   - **Đăng nhập b2b@** → mở lại project → **Triggers** ▸ Add Trigger:
     - `checkMarioPro` — mỗi 15 phút. (Mario reply PRO về b2b@)
   - → Authorize (Allow) bằng b2b@.

**5c. Bằng rithumgetorder@gmail.com:**
   - Share project + **sheet Xuan** quyền **Editor** cho tài khoản này.
   - Đăng nhập → Add Trigger: `checkRithumOrders` — mỗi 10 phút. → Allow.
   - ⚠️ Kiểm cột **Owner**: `processOrders` & `fillPro` = **info@** · `checkMarioPro` = **b2b@** · `checkRithumOrders` = **rithumgetorder@**.

---

## KIỂM TRA NHANH
- Mở `.../exec` trên trình duyệt (GET) → thấy `{"ok":true,"msg":"Receiver alive"}`.
- Chạy tay `TEST_parseRithum` (CheckRithum) → log ra 2 đơn mẫu.
- Chạy tay `checkRithumOrders` (**b2b@**) → nếu có mail Rithum chưa đọc (kể cả trong Spam), đơn mới xuất hiện ở sheet.

## ⚠️ QUY TẮC: PO LUÔN LÀ 8 CHỮ SỐ, LUÔN LÀ TEXT

PO Home Depot **luôn 8 chữ số** và nhiều số bắt đầu bằng 0 (`08576180`, `07561121`).

- Mọi chỗ ghi PO vào sheet **phải** `setNumberFormat('@')` **trước** khi `setValue/setValues`. Nếu không, Sheets diễn giải như người gõ → `"08576180"` thành **số** 8576180, mất số 0 đầu.
- Hậu quả khi mất số 0: lệch tên folder Drive `<PO>`, `fillRow` không tìm thấy hàng, GuiMail không gửi, TraPRO tra sai.
- So sánh PO thì dùng `_poKey(v)` (đệm 0 cho đủ 8) thay vì `String(v).trim()`, để vẫn khớp các ô cũ đã bị hỏng. `_poKey` khai báo **một lần** trong `CheckRithum.gs`; file `.gs` khác cùng project gọi trực tiếp — **không copy sang file khác** (trùng tên sẽ đè nhau).
- Sửa dữ liệu cũ: chạy `FIX_poLeadingZero()` bằng info@ (chỉ chạm ô đang lưu dạng số, log từng thay đổi).

## ⚠️ QUY TẮC: XGSI TRA PRO BẰNG type=bol

`api.xgsi.com/shipments/track?type=**bol**&trackNumber=<PO>` — **không** dùng `type=po`.
Trường `PO_NUMBER` của XGS là PO của mill (vd `MN65516943`); PO Home Depot của ta nằm ở trường `BOL` vì khi tạo BOL ta đặt Shipper BOL# = PO.
Kiểm chứng 28/07/2026: `type=po` → 404 *"No data was found"*; `type=bol` → 200, `PROBILL: 18621459`.

## GHI NHỚ
- Mail kho đang gửi về **test** `nguyen.nguyen938@hcmut.edu.vn` (đổi `WAREHOUSE_TO` trong GuiMail khi chạy thật = `mariop@notslogistics.com`).
- **URL web app mới phải gửi cho Claude** để cập nhật luồng tạo đơn.
- Trigger owner: `processOrders` & `fillPro` = **info@** · `checkMarioPro` = **b2b@** · `checkRithumOrders` = **rithumgetorder@gmail.com**.

## ⚠️ BẢNG CỘT CHUẨN (nguồn đúng = `SHEET_CFG` trong `NhanFile_Drive_WebApp.gs`)
Sheet `1Fzwr2GDHOHxMgqPNf-Ksf6qJ5IIl3mNzrOQrHqH57fo`, tab **"Order List"**, header hàng 6, data từ hàng 7.

| Cột | # | Nội dung | Ai ghi |
|---|---|---|---|
| A | 1 | Order Date | CheckRithum |
| B | 2 | PO Number (**TEXT, 8 chữ số**) | CheckRithum / fillRow |
| C | 3 | Carrier | fillRow |
| D | 4 | PIC | tay |
| E | 5 | Customer Order Number | fillRow |
| F | 6 | ShipTo Name (bỏ `C/O …`) | fillRow |
| G | 7 | SKU (nguyên Model Number) | fillRow |
| H | 8 | Product name | fillRow |
| I | 9 | Quantity | fillRow |
| J | 10 | BOL/SHIPPING LABEL (X) | fillRow (tự) |
| K | 11 | PICK UP SCHEDULE | fillRow — **nguồn ngày cho mail kho** |
| L | 12 | RITHUM CONFIRM | tay |
| M | 13 | WAREHOUSE NOTIFICATION (X) | **GuiMail** |
| N | 14 | PRO # / SHIPPING # | AACT qua `pro` · TraPRO · CheckMail_PRO |
| O | 15 | PICKUP # | fillRow qua `pickupNum` (chỉ CTII) |
| P | 16 | Link Drive | fillRow |
| Q | 17 | Note | tay |

Cách tự kiểm nhanh: chạy `DIAG_mail` phải ra `WHNotif=13 ✅ BẢN MỚI`, `DIAG_pro` phải ra `PRO=14 ✅ BẢN MỚI (N)`.

## 📁 CẤU TRÚC DRIVE MỚI (đổi 01/08/2026)

Folder gốc đổi sang **"THD Orders"** `1hsWarcdjtK63CD8As9CtXqJTcUPg8oAw`
(cũ: `1ER7RWu-66baF1uvB4AuBByN7OS-FJdAI`, phẳng, mỗi PO một folder ngay dưới gốc).

```
THD Orders/
└── 04 Aug 2026/            ← theo PICK UP SCHEDULE (cột K), có áp trần MAX_PER_DAY
    └── PO - 76965179/
        ├── 76965179_BOL.pdf
        ├── 76965179_PackingSlip.pdf
        ├── 76965179_ShippingLabel.pdf     (chỉ AACT & CTII)
        └── SIGNED PRO#/                   ← rỗng; kho bỏ BOL đã ký vào đây
```

- Tên folder ngày: `DD Mon YYYY` — `04 Aug 2026`, `25 Dec 2026`. Tháng viết tắt tiếng Anh 3 chữ.
- Tên folder PO: **`PO - <số PO>`** (có dấu cách hai bên gạch ngang).
- **Tên file giữ nguyên quy ước cũ** `<PO>_BOL.pdf` / `<PO>_PackingSlip.pdf` / `<PO>_ShippingLabel.pdf`.
  ⚠️ Có người từng đặt theo tên carrier (`Bol-4173595.pdf`, `Packing List-<PO>.pdf`) — **không dùng kiểu đó**.
- Code so tên folder bằng `.trim()` vì thực tế đã gặp folder `"PO - 02562579 "` dính dấu cách thừa.

### ⚠️ THỨ TỰ GỌI ĐỔI RỒI
Tên folder ngày phụ thuộc ngày pickup, mà ngày pickup có thể bị trần dời. Nên **`makeFolder` chốt ngày trước**:

```js
// 1) makeFolder tự áp trần, tạo cây folder, TRẢ VỀ ngày đã chốt
{ action:'makeFolder', po:'76965179', pickupSchedule:'08/04/2026' }
//    -> { folderId, url, signedProFolderId, dayFolder:'04 Aug 2026', pickupSchedule:'08/04/2026', pickupMoved:false }

// 2) fillRow dùng LẠI ngày đó + skipCap:true  (nếu không sẽ bị dời lần nữa -> sheet lệch tên folder)
{ action:'fillRow', po:'76965179', pickupSchedule:'<ngày từ bước 1>', skipCap:true, ... }
```

`skipCap:true` cũng dùng cho **CTII** khi lịch pickup đã cam kết với carrier.

## 📦 PRO LẤY TỪ FOLDER, KHÔNG CÒN ĐỌC MAIL (đổi 01/08/2026)

`CheckMail_PRO.gs` nay quét **`SIGNED PRO#`** thay vì hộp thư b2b@:
`findSignedProFolder_(po)` duyệt mọi folder ngày → `PO - <po>` → `SIGNED PRO#`.

- Áp dụng cho **SEFL / CTII / FXFE / ABFS / EXLA** (đúng nhóm trước đây chờ mail Mario).
  **XGSI/BXID** vẫn tra online qua `TraPRO.gs`; **AACT** vẫn có PRO ngay khi Finalize.
- Thứ tự đọc: (1) số PRO trong **tên file**, (2) **OCR nội dung** — dùng lại `ocrToText_` + `extractPro_` cũ.
- Folder rỗng → để trống cột N, lần sau thử lại. Có file mà OCR không ra → ghi
  `CHECK PRO: có file, chưa đọc được số`.
- Hàm `getProFromMario()` giữ lại trong file nhưng **không còn được gọi**.

> ⚠️ **ĐÃ BỎ MAIL BÁO KHO.** `GuiMail_BOL.gs` không dùng nữa — kho tự vào Drive xem.
> Phải **xoá trigger `processOrders`**, nếu không nó vẫn gửi mail. Hệ quả: **cột M không còn ai ghi tự động**.

## ⚙️ TRẦN 15 ĐƠN / NGÀY PICKUP (thêm 31/07/2026)

Nằm trong **`NhanFile_Drive_WebApp.gs`**, hằng số `MAX_PER_DAY = 15` ở đầu file.

**Quy tắc:** `fillRow` nhận `pickupSchedule` (ngày gốc = hôm nay + Thứ Sáu +3 / Thứ Bảy +2 / còn lại +1).
Nếu cột **K** đã có **≥ 15 hàng** cho ngày đó → **dời sang ngày làm việc kế**, lặp tới khi còn chỗ.

- **Bỏ Thứ Bảy & Chủ Nhật** khi dời. Ngày gốc rơi vào cuối tuần cũng bị đẩy sang Thứ Hai.
- Đếm theo **SỐ HÀNG** (mỗi PO tính 1), **không** theo cột I Quantity.
- Đếm **MỌI hàng** có ngày đó ở cột K — kể cả đơn Ground, đơn người khác điền tay, đơn đã gửi mail.
- **Không tự đếm chính hàng đang ghi** (tránh lệch 1 khi cập nhật lại đơn cũ).
- Chặn vòng lặp: tối đa 60 lần dời.

**Chuẩn hoá ngày:** `_dayKey()` nhận cả ô kiểu Date lẫn chuỗi `m/d/yyyy`, `mm/dd/yyyy`, `m/d/yy`, và **bỏ qua text rác**.
Cần thiết vì cột K đang lẫn `07/29/2026`, `7/29/2026`, `07/21/26`, `Email to request pick up 07/19`, `X`…
Nếu đếm theo chuỗi thô thì cùng một ngày sẽ bị tính thành nhiều nhóm.

**`fillRow` trả thêm 3 trường** để bên gọi biết ngày có bị dời không:
```json
{ "pickupSchedule": "07/31/2026", "pickupRequested": "07/29/2026", "pickupMoved": true }
```

**Chẩn đoán:** chạy `DIAG_pickupLoad` (info@) → log số hàng từng ngày, đánh dấu `⛔ ĐÃ ĐẦY`.

> ⚠️ **Sửa file này là sửa WEB APP** → bắt buộc **Deploy ▸ Manage deployments ▸ New version**.
> Chọn **New version** trên deployment đang có, KHÔNG tạo **New deployment** (URL sẽ đổi, cả hệ thống chết).

> 📌 Mail gửi Mario đọc ngày từ cột K nên **tự động khớp** — không phải sửa `GuiMail_BOL.gs`.

> ⚠️ **Chỉ áp cho đơn MỚI.** Các hàng cũ đã vượt trần (khi thêm quy tắc: 07/28 có 18, 07/29 có 17, 07/30 có 24)
> **không bị dời lại**. Muốn dồn lại thì phải sửa tay.
