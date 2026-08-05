# DSM — Tự động hoá hoàn thiện đơn dropship (CommerceHub / Home Depot)

Cập nhật **04/08/2026**. Mục lục toàn bộ tài liệu & script. Đọc theo thứ tự số.

---

## ⭐ LUỒNG HIỆN HÀNH (chốt 04/08/2026) — đọc mục này trước

### Một đơn đi qua 5 bước

```
① Đọc packing slip        (nhiều đơn / 1 file PDF -> TÁCH TRƯỚC, xem 1_DocPackingSlip.md BƯỚC 0)
② Chọn carrier            (carrier.csv: cột A = store có "C/O", cột B = customer)
③ Tạo BOL                 AACT -> aaacooper.com · CTII -> centraltransport.com · còn lại -> BOL_Form.html + fill_bol.py
④ makeFolder -> upload -> fillRow      (THỨ TỰ NÀY BẮT BUỘC, xem dưới)
⑤ PRO tự về               AACT: có ngay khi Finalize · XGSI/BXID: TraPRO · còn lại: CheckMail đọc folder SIGNED PRO#
```

### Trước khi làm bất cứ đơn nào — LỌC

| Điều kiện | Xử lý |
|---|---|
| Ship Via = **Ground** | **BỎ QUA** — người dùng tự làm |
| **Cột C (Carrier) đã có** hoặc **cột D (PIC) có tên người** (Eric/Kap/…) | **BỎ QUA** — đang có người làm tay, làm nữa là **lệnh pickup trùng** |
| Bang **AK / HI** | **DỪNG, HỎI NGƯỜI DÙNG** — `carrier.csv` chỉ có 48 bang lục địa + NCA/SCA |

### ④ Thứ tự gọi web app — KHÔNG được đảo

Tên folder ngày phụ thuộc ngày pickup, mà ngày pickup có thể bị **trần 20 đơn/ngày** dời đi.
Nên `makeFolder` **chốt ngày trước**, `fillRow` dùng lại đúng ngày đó với `skipCap:true`:

```js
// 1) chốt ngày + tạo cây folder
mk = POST { action:'makeFolder', po, pickupSchedule:'08/04/2026' }
//   -> { folderId, url, signedProFolderId, dayFolder:'06 Aug 2026',
//        pickupSchedule:'08/06/2026', pickupMoved:true }

// 2) upload từng file vào mk.folderId
POST { folderId: mk.folderId, filename:'<PO>_BOL.pdf',          base64, mimeType:'application/pdf' }
POST { folderId: mk.folderId, filename:'<PO>_PackingSlip.pdf',  base64, mimeType:'application/pdf' }
POST { folderId: mk.folderId, filename:'<PO>_ShippingLabel.pdf', base64, mimeType:'application/pdf' }  // chỉ AACT & CTII

// 3) điền sheet — DÙNG LẠI ngày đã chốt
POST { action:'fillRow', po, carrier, customerOrder, shipTo, sku, productName, qty,
       pickupSchedule: mk.pickupSchedule, skipCap:true, linkDrive: mk.url,
       pro,        // chỉ AACT
       pickupNum } // chỉ CTII
```

`skipCap:true` cũng dùng cho **CTII** khi lịch pickup đã cam kết với carrier.

### ⚠️ Hai bẫy khi POST — đã mất đơn vì cái này

1. **`{"ok":true,"msg":"Receiver alive"}` nghĩa là `doPost` KHÔNG chạy.** Đó là output của `doGet`:
   POST bị biến thành GET, **sheet không được ghi gì**, nhưng `ok === true` nên vòng lặp báo thành công.
   Gặp ngẫu nhiên ~1/10 lần (đơn 51555723 đã dính).
   → **Đừng kiểm `o.ok`.** `fillRow` kiểm **`o.row`** · `makeFolder` kiểm **`o.folderId`** · upload kiểm **`o.id`**.
   → **Bỏ hẳn `headers`** khi `fetch` tới web app. Đặt `Content-Type:'text/plain'` làm lỗi xảy ra **liên tục**.
2. **Apps Script thỉnh thoảng trả nguyên trang HTML** → `JSON.parse` ném `Unexpected token '<'`.
   Lỗi tạm thời: `try/catch` rồi gọi lại 3–4 lần, giãn 2–3 giây.

Mọi action đều **idempotent** — gặp lỗi thì cứ gọi lại.

### Cấu trúc Drive (đổi 01/08/2026)

```
THD Orders  (1hsWarcdjtK63CD8As9CtXqJTcUPg8oAw)
└── 06 Aug 2026/                      ← theo cột K, định dạng "DD Mon YYYY"
    └── PO - 77860619/
        ├── 77860619_BOL.pdf
        ├── 77860619_PackingSlip.pdf
        ├── 77860619_ShippingLabel.pdf     (chỉ AACT & CTII)
        └── SIGNED PRO#/                   ← rỗng; kho bỏ BOL đã ký vào đây
```

So tên folder bằng `.trim()` — thực tế có folder `"PO - 02562579 "` dính dấu cách thừa.
Folder gốc cũ `1ER7RWu-66baF1uvB4AuBByN7OS-FJdAI` (cấu trúc phẳng): **để nguyên làm lưu trữ, không dọn, không dùng nữa.**

### Ai ghi cột nào

| Cột | Ai ghi |
|---|---|
| A, B | `CheckRithum` (đơn mới từ mail Rithum) |
| C, E, F, G, H, I, J=X, K, P | `fillRow` |
| N (PRO) | AACT → `fillRow` · XGSI/BXID → `TraPRO` · SEFL/CTII/FXFE/ABFS/EXLA → `CheckMail_PRO` |
| O (Pickup #) | `fillRow`, chỉ CTII |
| **D, L, M, Q** | **NGƯỜI DÙNG tự ghi** — script không đụng |

> **Cột M (Warehouse Notification) nay do người dùng ghi tay** (chốt 04/08/2026).
> Mail báo kho đã bỏ từ 01/08 nên không còn gì đánh X tự động.

---

## 01_HuongDan_VanHanh — Quy trình vận hành (đọc/làm theo)
| File | Nội dung |
|------|----------|
| `1_DocPackingSlip.md` | **BƯỚC 0: đếm số packing slip trong file trước đã** (một file từng chứa 27 trang = 27 đơn). Rồi đọc PO, Ship Via (Misc=pallet), Ship To, Item, Qty. |
| `2_ChonCarrier.md` | Chọn carrier theo Bang + store/customer. Kèm luật lọc cột C/D và cảnh báo thiếu AK/HI. |
| `3_QuyTrinh_AACT.md` | Quy trình AACT trên aaacooper.com. WEIGHT khi Qty>1 = `(cột K × Qty) + 55` (cộng 55 **một lần**). Không confirm DSM. |
| `4_Playbook_AACT.md` | **Kinh nghiệm thực chiến** — đọc TRƯỚC khi chạy tay bằng Claude in Chrome. Lỗi #12–#20, cách xử lý khi AACT không sinh được PDF. |
| `5_QuyTrinh_CarrierKhac.md` | SEFL/XGSI/BXID/FXFE/ABFS: form BOL chung → makeFolder → upload → fillRow. Kèm cách chạy nhiều đơn một lượt. |
| `6_QuyTrinh_CTII.md` | CTII trên `centraltransport.com/shipment/bol`. 4 khối địa chỉ (khối 4 là COD). Bẫy city viết tắt. **Không bấm Submit khi test.** |

## 02_AppsScript — Code Google Apps Script + hướng dẫn cài
**4 file đang chạy:**

| File | Nội dung |
|------|----------|
| `NhanFile_Drive_WebApp.gs` | Web app: (A) HTML→PDF · (B) base64 ghi file · (C) `makeFolder` tạo cây `<ngày>/PO - <po>/SIGNED PRO#` + áp trần 20 đơn/ngày · (D) `fillRow` điền C/E/F/G/H/I/J=X/K/P (+N nếu có `pro`, +O nếu có `pickupNum`) · (E) `lookup` tra trạng thái đơn. **Sửa file này PHẢI Deploy ▸ New version.** |
| `CheckRithum.gs` | Quét mail "Rithum New Order Alert" **3 ngày gần nhất** trong hộp `rithumgetorder@gmail.com` (cả Spam, `in:anywhere`) → thêm hàng **A=Order Date, B=PO**. Chứa `_poKey()` và `FIX_poLeadingZero()`. Chạy bằng **rithumgetorder@**. Trigger 10′. |
| `TraPRO.gs` | Tra PRO → cột **N**: XGSI (JSON, **`type=bol`**), BXID (HTML). Có `DIAG_pro()`. Chạy **info@**. Trigger 15′. |
| `CheckMail_PRO.gs` | PRO cho SEFL/CTII/FXFE/ABFS/EXLA → cột **N**: quét folder **`SIGNED PRO#`**, đọc số từ **tên file** trước, không ra thì **OCR**. Folder rỗng → để trống N. Có file mà không đọc được → ghi `CHECK PRO: có file, chưa đọc được số`. Cần **Advanced Drive Service**. Trigger 15′. |
| `HuongDan_CaiDat_AppsScript_Moi.md` | Cài từ đầu: project độc lập info@, Advanced Drive Service, deploy, trigger. Kèm bảng 17 cột và 2 quy tắc vàng (PO 8 chữ số/text · XGSI `type=bol`). |

**Đã ngừng dùng:** `GuiMail_BOL.gs` → chuyển sang `06_File_Cu_KHONG_DUNG/`, giữ để dự phòng.
Mail báo kho bỏ từ 01/08; trigger `processOrders` **đã xoá 04/08 — không tạo lại**.

## 04_BOL_Form — Mẫu BOL
| File | Nội dung |
|------|----------|
| `BOL_Form.html` | Form BOL 1 trang dùng chung: SEFL, XGSI, BXID, CTII, FXFE, ABFS. |
| `fill_bol.py` | Nhận JSON `items:[{model,qty}]` → **tự tra `pallet.csv`** ra dòng SKU/weight/pieces → xuất `<PO>_BOL.pdf` (WeasyPrint). |

**Mẫu BOL chốt 29/07/2026:** `# PKGS` = 1 · `HANDLING UNIT QTY` = 1 · `PACKAGE QTY` = tổng Qty · `WEIGHT` = Σ(K×Qty)+55 ·
`ADDITIONAL SHIPPER INFO` = `COMMODITY DESCRIPTION` = `SKU-<model> Unfinished <GỖ> <độ dài> FT`, mỗi SKU một dòng ·
**bỏ trống dòng 4 SPECIAL INSTRUCTIONS** (kích thước pallet).

## 05_TraCuu — Bảng tra cứu
| File | Nội dung |
|------|----------|
| `pallet.csv` | A=SKU · C/D/E=Product Dim · F/G/H=Pallet Dim · **K=Packaged Gross Weight**. Loại gỗ = chữ sau `Unfinished` ở cột B (viết HOA). Độ dài = cột C ÷ 12. |
| `class.csv` | Freight Class theo PCF (Min ≤ PCF < Max). |
| `carrier.csv` | Carrier theo Bang. Cột A = store (có C/O) · cột B = customer. **Thiếu AK và HI.** NCA và SCA cho kết quả giống nhau. |

## 03_TienDo_NhatKy · 06_File_Cu_KHONG_DUNG · 07/08/09
- `03_TienDo_NhatKy/` — nhật ký chạy đơn, packing slip đã tách.
- `06_File_Cu_KHONG_DUNG/` — ⚠️ **ĐỪNG dán lên Apps Script**: `GuiMail_BOL.gs`, `TraPRO_XGSI.gs`, `TrackPRO.gs`. Trùng tên hàm sẽ đè code mới, Apps Script không báo lỗi.
- `07_Plan_AutoPackingSlip.md` — plan tool tự tải packing slip từ DSM.
- `08_CapNhat_2026-07-30_README.md`, `09_CapNhat_2026-08-03_README.md` — nhật ký 2 gói cập nhật.
- `00_BanGiao_MayMoi.md`, `00_Prompt_KhoiDong.md` — bàn giao sang máy khác.

---

## Hằng số hệ thống (copy nhanh)

| Khoá | Giá trị |
|---|---|
| Drive gốc | `1hsWarcdjtK63CD8As9CtXqJTcUPg8oAw` — "THD Orders" |
| Drive `_INBOX` | `18rFktqm_K_a9-RPW5S0o2fTkmmHITGKO` — lưu **file PDF gộp thô** tải từ DSM, nằm trực tiếp trong "THD Orders" |
| Folder mount | `C:\Users\Lenovo\Downloads` — Claude đọc file DSM vừa tải **từ đĩa** (không tải qua Drive, xem `07_Plan_AutoPackingSlip.md`) |
| Web app | `https://script.google.com/macros/s/AKfycbzzJCEgWBcO76OcbhJIdiHGlJEgbWxq7FFEGbIwwpQe2gmtOalVOXziJXFyuI1Ckrtn-Q/exec` |
| Sheet | `1Fzwr2GDHOHxMgqPNf-Ksf6qJ5IIl3mNzrOQrHqH57fo`, tab **"Order List"** (header hàng 6, data hàng 7) |
| Trần đơn/ngày | `MAX_PER_DAY = 20` |
| BOL template AACT | `https://www.aaacooper.com/workspace/bol?sourceBolTemplateId=50357` |
| Tải tay PDF AACT | `aaacooper.com/workspace/bol/<BOL#>/pdf` · `aaacooper.com/workspace/shipping-label?sourceBolNumber=<BOL#>` |
| DSM search | `https://dsm.commercehub.com/dsm/gotoGenericSearchResults.do?uniqueTabId=3527` |

**17 cột:** `A=Order Date · B=PO · C=Carrier · D=PIC(tay) · E=Customer Order Number · F=ShipTo Name · G=SKU · H=Product name · I=Quantity · J=BOL/SHIPPING LABEL(X) · K=PICK UP SCHEDULE · L=RITHUM CONFIRM(tay) · M=WAREHOUSE NOTIFICATION(tay) · N=PRO#/SHIPPING# · O=PICKUP# · P=Link Drive · Q=Note(tay)`

**Mã carrier (cột C):** AACT / XGSI / BXID / CTII / SEFL / FXFE / ABFS. SKU (G) ghi **nguyên Model Number** (`832250-B`).

## Trạng thái hiện tại
- **Không còn mail báo kho.** Kho tự vào Drive xem; cột M người dùng ghi tay.
- Trigger đang chạy: `fillPro` (**info@**, 15′) · `checkMarioPro` (**b2b@**, 15′) · `checkRithumOrders` (**rithumgetorder@**, 10′). Cả ba tài khoản cần quyền Edit sheet.
- Nhánh **Ground**: người dùng tự xử lý.
- **Sheet có nhiều người sửa cùng lúc** — số đơn/ngày thay đổi giữa các lần đọc, nên ngày pickup do trần quyết định phụ thuộc thời điểm chạy. Luôn lấy ngày từ `mk.pickupSchedule` trả về, đừng tự tính lại.
