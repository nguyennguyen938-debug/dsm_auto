# GÓI CẬP NHẬT DSM — 28→30/07/2026

Gói này chứa **11 file đã sửa** trong phiên làm việc 28–30/07/2026.
Mục đích: chép đè lên folder `DSM_TuDongHoa` trên máy/phiên Claude khác để đồng bộ kinh nghiệm.

---

## 1. CÁCH CÀI

Chép đè, **giữ nguyên cấu trúc thư mục**:

```
08_CapNhat_2026-07-30/00_README.md                          ->  DSM_TuDongHoa/00_README.md
08_CapNhat_2026-07-30/00_BanGiao_MayMoi.md                  ->  DSM_TuDongHoa/00_BanGiao_MayMoi.md
08_CapNhat_2026-07-30/01_HuongDan_VanHanh/*.md              ->  DSM_TuDongHoa/01_HuongDan_VanHanh/
08_CapNhat_2026-07-30/02_AppsScript/HuongDan_CaiDat_*.md    ->  DSM_TuDongHoa/02_AppsScript/
08_CapNhat_2026-07-30/04_BOL_Form/BOL_Form.html             ->  DSM_TuDongHoa/04_BOL_Form/
08_CapNhat_2026-07-30/04_BOL_Form/fill_bol.py               ->  DSM_TuDongHoa/04_BOL_Form/
```

**KHÔNG có gì phải đổi trên Google** — không sửa file `.gs`, không đổi trigger, không redeploy web app.
Toàn bộ thay đổi chỉ là **tài liệu + form BOL cục bộ**.

---

## 2. BỐN THAY ĐỔI QUAN TRỌNG NHẤT

Nếu chỉ đọc được 4 dòng thì đọc 4 dòng này:

1. **Bảng cột sheet là 17 cột** (A…Q). Mọi chỗ ghi bảng 13 cột cũ đều đã sai và đã sửa.
   `M` = Warehouse Notif · `N` = PRO · `O` = Pickup# · `P` = Link Drive.
2. **Một file PDF packing slip thường chứa NHIỀU đơn** — mỗi trang một PO. Phải tách trước khi làm.
3. **Form BOL chung đã đổi mẫu** (29/07): `# PKGS` và `HANDLING UNIT QTY` luôn = 1, mô tả theo cấu trúc
   `SKU-<model> Unfinished <GỖ> <độ dài> FT`, bỏ dòng kích thước pallet trong SPECIAL INSTRUCTIONS.
4. **Kiểm cột D (PIC) trước khi làm.** Có tên người (Eric/Kap/…) = họ đang làm tay → BỎ QUA,
   nếu không sẽ tạo BOL và lệnh pickup TRÙNG.

---

## 3. CHI TIẾT TỪNG FILE

### `00_README.md`
- Sửa toàn bộ ánh xạ cột sang **bản 17 cột** (trước ghi `X cột I`, `pro→J`, `pickupNum→K` — đều sai).
- `checkRithumOrders` chạy bằng **rithumgetorder@**, không phải b2b@.
- Tên tab sheet là **`Order List`** (tên cũ *"Order List as of 07/19"* đã bỏ).
- CTII đã có quy trình đầy đủ (trước ghi "chưa code").
- Ghi rõ đang ở chế độ TEST: `WAREHOUSE_TO` trỏ địa chỉ test.

### `00_BanGiao_MayMoi.md`
- **Bẫy #1**: ghi nhận `AACT auto` **vẫn còn 3 trigger sống** (processOrders, fillPro, checkMarioPro) — chưa xoá.
  Kèm cảnh báo: `DIAG_mail` chỉ đếm trigger trong project AFW-DSM nên **không phát hiện được** trigger project khác.
- Nhật ký chạy checklist mục 4 ngày 28/07.
- Mẹo thao tác Apps Script bằng Claude in Chrome: ô chọn hàm không nghe `find`/ref, bấm Enter thì reset về
  `onOpen` và chạy nhầm — phải click chữ → screenshot xác nhận → click toạ độ dòng hàm → mới bấm Run.

### `01_HuongDan_VanHanh/1_DocPackingSlip.md`
- Thêm **BƯỚC 0 — ĐẾM SỐ PACKING SLIP TRONG FILE**, làm trước mọi thứ.
  Lệnh `pdfinfo` / `pdftotext -f -l` / `pdfseparate`, đặt tên `<PO>_PackingSlip.pdf`.
  Lọc Ground, đối chiếu sheet, kiểm PO trùng và PO đủ 8 chữ số.
- Lý do: 28/07 nhận 4 file, chỉ đọc trang đầu mỗi file nên báo "4 đơn" — thực tế **42 packing slip**
  (một file 27 trang). Suýt bỏ sót 38 đơn.

### `01_HuongDan_VanHanh/2_ChonCarrier.md`
- **Kiểm cột D (PIC) trước khi làm** — có tên người thì bỏ qua. Dấu hiệu người làm tay:
  `x` **viết thường** ở cột J/M (script luôn ghi `X` HOA) và **cột P trống**.
- **`carrier.csv` thiếu `AK` và `HI`** (chỉ có 48 bang lục địa + NCA + SCA). Gặp thì dừng, hỏi người dùng.
- **NCA và SCA cho kết quả giống hệt nhau** → đơn California không cần phân vùng Bắc/Nam.

### `01_HuongDan_VanHanh/3_QuyTrinh_AACT.md`
- **WEIGHT khi Qty > 1**: `(cột K) × Qty + 55` — cộng 55 **một lần** cho pallet. Qty=1 thì thành `K+55`.
- Sửa cột: `pro`→**N**, ngày mail lấy từ **K**, đánh X vào **M**.
- Thêm mục **"NẾU KHÔNG TẢI ĐƯỢC BOL / SHIPPING LABEL"** — bản rút gọn của quy trình reload.

### `01_HuongDan_VanHanh/4_Playbook_AACT.md`  ← sửa nhiều nhất
- Thay **toàn bộ bảng cột 13 cột cũ** bằng bảng 17 cột; sửa mục 6 và mục 9.
- **Lỗi #18 — AACT không sinh được PDF.** Kèm quy trình 4 bước: lưu số → vòng lặp reload (6–7 vòng,
  mỗi vòng phải **cài lại hook blob**) → chẩn đoán phạm vi bằng BOL cũ → nhờ người dùng tải tay.
  Số liệu thực tế: có lần hồi sau 4 phút, có lần >30 phút, có lần hồi ở **vòng 6**.
  **BOL PDF và Shipping Label không hồi cùng lúc** — lấy được BOL rồi Label vẫn có thể kẹt thêm ~10 phút.
- **Lỗi #19 — nút `Finalize` không ăn JS click.** Phải `find` → click theo ref. Không nhất quán.
- **Lỗi #20 — ô Class set bằng JS xong dropdown VẪN MỞ**, giống lỗi city của CTII. Phải screenshot kiểm rồi
  click chọn thật. Đọc `.value` ra đúng nhưng chưa commit.
- **`Create Label PDF`**: JS click không bao giờ ăn; có lúc click theo **ref** cũng không ăn, phải
  **click theo TOẠ ĐỘ**. Thứ tự thử: JS → ref → toạ độ.

### `01_HuongDan_VanHanh/5_QuyTrinh_CarrierKhac.md`
- Viết lại **BƯỚC 1** theo mẫu form BOL mới (xem mục 4 bên dưới).
- Thêm mục **chạy nhiều đơn cùng lúc**: dựng tất cả PDF bằng WeasyPrint → tạo folder trong 1 lệnh JS →
  **upload nhiều file bằng 1 input `multiple`** (giới hạn 10 MB/lần), map file→folder qua `po = f.name.slice(0,8)`.
  4 đơn trong ~2 phút.
- Hai lỗi khi gom lô: `javascript_tool` trả `[BLOCKED: Cookie/query string data]` nếu kết quả chứa URL Drive
  (đừng trả URL); CDP timeout 45s khi lặp `fillRow` nhưng **POST vẫn chạy hết** và `fillRow` là **idempotent**.
- Nhắc kiểm `04_BOL_Form/` xem `<PO>_BOL.pdf` đã có sẵn chưa trước khi dựng lại.

### `01_HuongDan_VanHanh/6_QuyTrinh_CTII.md`
- Sửa cột: Pickup#→**O**, PRO→**N**, X→**M**, ngày từ **K**.
- **Form nay có 4 khối địa chỉ, không phải 3** — khối thứ tư là **COD**. Index [0][1][2] vẫn đúng.
  Kèm đoạn JS đối chiếu định danh Angular scope để xác minh chắc chắn thay vì đếm vị trí.
- Thêm đoạn **VERIFY TỔNG bằng Angular scope** (`items` phải đúng 1 phần tử, `paymentTerm:"2"`, `cities.tp:"ATLANTA"`).
- Lỗi city viết tắt (zip 30339 → `ATL`) đã tái hiện đúng như mô tả — cách sửa cũ vẫn dùng được.

### `02_AppsScript/HuongDan_CaiDat_AppsScript_Moi.md`
- Đánh dấu mục 5a/5b cũ là **SAI** ở chỗ `checkRithumOrders`; thêm mục **5c** cho `rithumgetorder@`.
- Thêm **BẢNG CỘT CHUẨN 17 cột** kèm cột "ai ghi" — nguồn đúng là `SHEET_CFG` trong `NhanFile_Drive_WebApp.gs`.
- Cách tự kiểm: `DIAG_mail` phải ra `WHNotif=13 ✅`, `DIAG_pro` phải ra `PRO=14 ✅ (N)`.

### `04_BOL_Form/BOL_Form.html`
- Bảng **CUSTOMER ORDER INFORMATION** và **CARRIER INFORMATION**: bỏ 2 hàng trống, còn **1 hàng cao hơn**
  (78px / 70px), `textarea rows="4"` để chứa nhiều dòng SKU.

### `04_BOL_Form/fill_bol.py`  ← viết lại
- Nhận `items: [{"model":"812250-B","qty":2}, ...]`, **tự tra `pallet.csv`** để ra dòng SKU, weight, pieces.
  Không phải tự tính tay nữa.
- `# PKGS` = 1 (cả 2 ô) · `HANDLING UNIT QTY` = 1 (cả 2 ô) · `PACKAGE QTY` = tổng Qty · `WEIGHT` = Σ(K×Qty)+55.
- **Bỏ dòng thứ 4 của SPECIAL INSTRUCTIONS** (dòng kích thước pallet). Ô input vẫn còn trong HTML,
  chỉ là không điền — in ra trống.
- `ADDITIONAL SHIPPER INFO` và `COMMODITY DESCRIPTION` dùng **cùng nội dung**, mỗi SKU một dòng.

Ví dụ chạy:
```bash
pip install weasyprint --break-system-packages     # 1 lần mỗi phiên sandbox
cd 04_BOL_Form
echo '{"date":"07/30/2026","po":"12345678","carrier":"BXID",
 "ship_name":"...","ship_address":"...","ship_csz":"City, ST 12345","phone":"(000) 000-0000",
 "cust_order_num":"WK123 (PO 12345678)",
 "items":[{"model":"812250-B","qty":2},{"model":"810250-B","qty":2}]}' \
 | python3 fill_bol.py BOL_Form.html .
# -> weight=527  pieces=4
#    SKU-812250-B Unfinished HEVEA 12 FT
#    SKU-810250-B Unfinished HEVEA 10 FT
```

---

## 4. MẪU FORM BOL MỚI (chốt 29/07/2026)

| Ô | Trước | **Nay** |
|---|---|---|
| SPECIAL INSTRUCTIONS dòng 4 | `1 pallet - 146″ x 27″ x 8″ - 183 lbs` | **bỏ trống** |
| `# PKGS` (2 ô) | = Qty Shipped | **luôn = 1** |
| `HANDLING UNIT / QTY` (2 ô) | = Qty Shipped | **luôn = 1** |
| `PACKAGE / QTY` (2 ô) | = Qty Shipped | **tổng Qty mọi SKU** |
| `WEIGHT` (4 ô) | (K × Qty) + 55 | không đổi — Σ(K×Qty) + 55 |
| `ADDITIONAL SHIPPER INFO` | Item Description dài | `SKU-<model> Unfinished <GỖ> <ft> FT` |
| `COMMODITY DESCRIPTION` | Item Description dài | **giống hệt** cột trên |
| Số hàng dữ liệu | 3 hàng (2 hàng trống) | **1 hàng, cao hơn** |

Quy tắc dòng SKU: **loại gỗ** = chữ ngay sau `Unfinished` trong cột B của `pallet.csv`, viết HOA
(`HEVEA`, `ACACIA`). **Độ dài** = cột C (inch) ÷ 12. Nhiều SKU → mỗi SKU một dòng.

> ⚠️ `818390` là Hevea **Island** nhưng theo quy tắc vẫn ra `Unfinished HEVEA 8 FT` — không phân biệt Island.

---

## 5. VIỆC CÒN TREO (chưa xong tính tới 30/07/2026)

| Việc | Trạng thái |
|---|---|
| Xoá 3 trigger project **`AACT auto`** | ⏳ chưa xoá — gây chạy `processOrders`/`fillPro` **2 lần mỗi chu kỳ** |
| `WAREHOUSE_TO` đổi về `mariop@notslogistics.com` | ⏳ vẫn là `nguyen.nguyen938@hcmut.edu.vn` (chế độ TEST) |
| `DIAG_rithum` | ⏳ chưa chạy — cần đăng nhập `rithumgetorder@gmail.com` |
| Đơn **75708556** | ⏳ Kap đã đánh `DONE` nhưng BOL `4170150` / PRO `36999612` của Claude không có trong sheet — **có thể đang có 2 lệnh pickup**, chờ xác minh với Kap |
| Đơn `52565756`, `73721188`, `73799477` | ⏳ có carrier từ 17–23/07 nhưng chưa có BOL/Drive/mail — thiếu packing slip |

---

## 6. GHI CHÚ CHO CLAUDE ĐỌC GÓI NÀY

- Toàn bộ số liệu lỗi trong tài liệu là **quan sát thực tế**, không phải suy đoán. Khi gặp lại triệu chứng
  giống hệt thì tin vào cách xử lý đã ghi.
- Thứ tự click trên web carrier, rút ra sau nhiều lần sập:
  **JS click** (nhanh nhất, nhưng nút mở tab mới thì không bao giờ ăn) → **click theo ref** → **click theo toạ độ**.
- Sau khi set giá trị bằng JS vào ô có autocomplete (Class của AACT, City của CTII), **phải screenshot kiểm**
  xem danh sách gợi ý đã đóng chưa. Đọc `.value` không đủ.
- Khi thao tác web carrier, **chụp màn hình ở các mốc chính và để nguyên trang** — đừng làm chìm hoàn toàn
  bằng JS rồi điều hướng đi, người dùng không xem lại được.
