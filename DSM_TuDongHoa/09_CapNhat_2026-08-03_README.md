# CẬP NHẬT 03/08/2026 — 5 file thay đổi so với gói `08_CapNhat_2026-07-30`

Copy 5 file trong gói này đè lên vị trí tương ứng trong thư mục gốc `DSM_TuDongHoa`.
Gói này **tiếp nối** gói 30/07 — phải áp gói 30/07 trước.

| File | Vị trí đích | Thay đổi |
|---|---|---|
| `02_AppsScript/NhanFile_Drive_WebApp.gs` | `02_AppsScript/` | Cấu trúc Drive mới, trần 20, `lookup`, `skipCap` — **PHẢI DEPLOY** |
| `02_AppsScript/CheckMail_PRO.gs` | `02_AppsScript/` | PRO đọc từ folder `SIGNED PRO#` thay vì mail — chỉ cần Save |
| `02_AppsScript/HuongDan_CaiDat_AppsScript_Moi.md` | `02_AppsScript/` | +82 dòng: cấu trúc Drive, thứ tự gọi, PRO từ folder, bỏ mail |
| `01_HuongDan_VanHanh/5_QuyTrinh_CarrierKhac.md` | `01_HuongDan_VanHanh/` | +52 dòng: bẫy `Receiver alive`, lỗi trả HTML |
| `01_HuongDan_VanHanh/6_QuyTrinh_CTII.md` | `01_HuongDan_VanHanh/` | +53 dòng: 4 khối địa chỉ, xung đột trần vs ngày CTII, fetch same-origin |

---

## 1. Cấu trúc Drive mới — ĐÃ DEPLOY VÀ ĐANG CHẠY

Folder gốc đổi từ `1ER7RWu-66baF1uvB4AuBByN7OS-FJdAI` (phẳng) sang
**"THD Orders"** `1hsWarcdjtK63CD8As9CtXqJTcUPg8oAw`:

```
THD Orders/
└── 06 Aug 2026/                     ← theo cột K, tên "DD Mon YYYY"
    └── PO - 77860619/
        ├── 77860619_BOL.pdf
        ├── 77860619_PackingSlip.pdf
        ├── 77860619_ShippingLabel.pdf   (chỉ AACT & CTII)
        └── SIGNED PRO#/                 ← rỗng, kho bỏ BOL đã ký vào
```

Tên file giữ nguyên `<PO>_BOL.pdf` / `<PO>_PackingSlip.pdf` / `<PO>_ShippingLabel.pdf`.
So tên folder bằng `.trim()` vì thực tế có folder `"PO - 02562579 "` dính dấu cách thừa.

### Thứ tự gọi ĐỔI — quan trọng
Tên folder ngày phụ thuộc ngày pickup, mà ngày pickup có thể bị trần dời.
Nên `makeFolder` **chốt ngày trước**, `fillRow` dùng lại ngày đó kèm `skipCap:true`:

```js
mk = POST {action:'makeFolder', po, pickupSchedule:'08/04/2026'}
     -> {folderId, url, signedProFolderId, dayFolder:'06 Aug 2026', pickupSchedule:'08/06/2026', pickupMoved:true}
     POST {folderId: mk.folderId, filename:'<PO>_*.pdf', base64, mimeType:'application/pdf'}
     POST {action:'fillRow', po, ..., pickupSchedule: mk.pickupSchedule, skipCap:true, linkDrive: mk.url}
```
`skipCap:true` cũng dùng cho **CTII** khi lịch pickup đã cam kết với carrier.

## 2. PRO lấy từ folder, không còn đọc mail
`CheckMail_PRO.gs` quét `THD Orders / <ngày> / PO - <po> / SIGNED PRO#`, đọc số PRO từ
**tên file** trước, không ra thì **OCR** (dùng lại `ocrToText_` + `extractPro_` cũ).
Áp dụng cho **SEFL / CTII / FXFE / ABFS / EXLA**. XGSI/BXID vẫn dùng `TraPRO.gs`; AACT có PRO ngay khi Finalize.
Folder rỗng → để trống N. Có file mà OCR không ra → ghi `CHECK PRO: có file, chưa đọc được số`.
`getProFromMario()` giữ lại nhưng không còn được gọi.

> ⚠️ **ĐÃ BỎ MAIL BÁO KHO.** `GuiMail_BOL.gs` không dùng nữa.
> **Phải xoá trigger `processOrders`**, nếu không nó vẫn gửi mail.
> Hệ quả: **cột M không còn ai ghi tự động** — chưa quyết định thay bằng gì.

---

## 3. HAI BẪY MỚI PHÁT HIỆN 03/08 — đọc kỹ

### `{"ok":true,"msg":"Receiver alive"}` = doPost KHÔNG chạy
Đó là output của `doGet`: POST bị chuyển thành GET, sheet **không được ghi gì**, nhưng `ok === true`
nên vòng lặp báo thành công. Gặp ngẫu nhiên ~1/10 lần. Đơn 51555723 dính đúng lỗi này.

- **Đừng bao giờ chỉ kiểm `o.ok`.** `fillRow` phải kiểm **`o.row`**; `makeFolder` kiểm **`o.folderId`**.
- Gọi kèm `headers:{'Content-Type':'text/plain;charset=utf-8'}` làm lỗi xảy ra **liên tục**.
  **Bỏ hẳn `headers`** khi POST cho web app — `fetch` mặc định vẫn là simple request, không preflight.
- Gặp thì gọi lại, mọi action đều idempotent.

### Apps Script thỉnh thoảng trả nguyên trang HTML
`JSON.parse` ném `Unexpected token '<'`. Lỗi tạm thời — `try/catch` rồi gọi lại 3–4 lần, giãn 2–3 giây.
Gặp ở cả `lookup` lẫn upload base64.

---

## 4. Kinh nghiệm chạy web AACT 03/08

- **`form_input` KHÔNG ghi đè được ô Weight và FVC.** Báo `Set 185 (previous 185)` dù truyền 183; FVC thì
  ghi thành rỗng. Cách chạy được: đặt bằng JS với native setter + dispatch `input`/`change`/`blur`.
- **Popup City Lookup hay không chịu mở.** Thay vì bấm kính lúp, **gõ thẳng City + State** vào 2 ô cạnh Zip
  bằng JS — AACT tự chuẩn hoá tên (`EAST ELLIJAY` → `ELLIJAY`) và Next vẫn qua.
- **Nút Next/Finalize: click bằng ref hay trượt.** Dùng
  `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Next').click()`.
- **Cửa sổ Chrome tự đổi kích thước giữa các bước** → toạ độ chụp trước đó lệch hết. Ưu tiên ref/JS, hạn chế toạ độ.
- Vị trí ô Consignee trang 1 (theo thứ tự `document.querySelectorAll('input')`, lấy `z` = index ô
  `placeholder="Zip"` còn rỗng): `z-2`=Company Name, `z-1`=Address, `z`=Zip, `z+1`=City, `z+2`=State, `z+5`=Phone.

---

## 5. TRẠNG THÁI ĐƠN NGÀY 03/08

**Xong đủ (BOL + PackingSlip + folder + sheet):** 10 đơn form BOL chung, pickup 05/08
02561509 · 27567388 · 69587138 · 75551347 (XGSI) — 19585303 · 51555723 · 77849561 (BXID) — 77770008 · 77817286 · 77834379 (FXFE)

**5 đơn AACT — đã có BOL/PRO, đã vào sheet + Drive, CÒN THIẾU 2 file PDF:**

| PO | BOL # | PRO # | Dòng | Pickup |
|---|---|---|---|---|
| 20565416 | 4175339 | 39002671 | 250 | 06/08 |
| 77754043 | 4175356 | 39002678 | 232 | 06/08 |
| 77799452 | 4175494 | 39002761 | 236 | 05/08 |
| 77850772 | 4175500 | 39002764 | 249 | 06/08 |
| 77860619 | 4175504 | 39002768 | 252 | 06/08 |

Viewer PDF của AACT `canvas=0`, không sinh blob. Đã kiểm BOL cũ 4162556 → cũng hỏng ⇒ **sự cố toàn site**.
Tải tay tại `aaacooper.com/workspace/bol/<BOL#>/pdf` và
`aaacooper.com/workspace/shipping-label?sourceBolNumber=<BOL#>`.
⛔ **KHÔNG tạo lại BOL** — BOL và PRO đã tồn tại thật, tạo lại = lệnh pickup trùng.

**Chưa làm:** CTII 77880806 (Weldon Read, Howardwick TX 79226, 183 lb, Class 92.5) — cần chốt khung giờ pickup với carrier trước.

---

## 6. VIỆC CÒN TREO

- Xoá trigger `processOrders`; quyết định cột M từ nay ai ghi.
- 13 đơn Misc đã có PIC (Kap/Eric) nhưng chưa dựng BOL: 77629973, 77630685, 77664441, 08572898,
  12552361, 64570316, 77676952, 77678237, 73575906, 71563625, 77698915, 52562059, 77755205.
- 6 đơn Ground trống hoàn toàn (không carrier/PIC/pickup): 02557102, 04587353, 77809964, 77819206, 77836842, 77849585.
- 1 đơn AK: 04587352 — `carrier.csv` không có dòng AK.
- **Cột K lưu không thống nhất**: cùng một đoạn code, dòng 250 ra text `08/06/2026`, còn 232/236/249/252
  thành kiểu Date. Chưa tìm ra nguyên nhân.
- **Sheet đang có người khác sửa cùng lúc** — số đơn/ngày thay đổi giữa các lần đọc (03/08 lúc đầu 33, sau còn 20),
  nên ngày pickup do trần quyết định phụ thuộc thời điểm chạy.
- Folder cũ dưới `1ER7RWu...` chưa dọn.
- `Bang_Cost_AllForWood.xlsx` vẫn chờ công thức thật.

## 7. KHÔNG nằm trong gói này
- 10 file `<PO>_BOL.pdf` mới trong `04_BOL_Form/` — là kết quả chạy, đã nằm trên Drive rồi.
- `07_Upload_Tam/` — thư mục tạm để Chrome lấy file, xoá được.
