# HƯỚNG DẪN CHỌN CARRIER

Áp dụng khi nhận một Packing Slip mới. Mục tiêu: xác định carrier để chuyển sang file hướng dẫn của carrier đó.

---

## Bước 1 — Kiểm tra Ship Via (phân loại pallet)
Đọc packing slip, xem mục **Ship Via**:
- Có chữ **"Misc"** → đơn ship **có pallet** → tiếp tục các bước dưới.
- (Nếu là **"Ground"** → đơn **không pallet** — xử lý theo quy trình riêng, chưa nằm trong hướng dẫn này.)

---

## Bước 2 — Xác định store hay customer (đọc Ship To)
Trong mục **Ship To**:
- **Dòng đầu tiên** = tên.
- **Dòng thứ hai:**
  - Không có **"C/O"** → đơn gửi đến **customer**.
  - Có **"C/O"** → đơn gửi đến **store**.

---

## Bước 3 — Lấy Bang (State)
- Phía dưới tên (và dòng C/O nếu có) là **địa chỉ đường phố**.
- Phía dưới địa chỉ đường phố là dòng **Thành phố / Bang / Zip**.
- Lấy phần **Bang** (mã 2 chữ, vd FL, GA, TX).

---

## Bước 4 — Đối chiếu file carrier
Mở `carrier.csv` và tìm hàng có **Destination Zip = Bang** vừa lấy:
- **Cột A** = carrier khi giao đến **store** (Supplier IB to DC/Store Carrier).
- **Cột B** = carrier khi giao đến **customer** (Residential Delivery Carrier – Hd.com).

Chọn cột theo kết quả Bước 2:
- Đơn **store** → lấy carrier ở **cột A**.
- Đơn **customer** → lấy carrier ở **cột B**.

---

## Bước 5 — Chuyển sang hướng dẫn của carrier
Có mã carrier (vd AACT, BXID, XGSI...) → tiếp tục theo **file hướng dẫn riêng của carrier đó**
(hiện có: `HuongDan_Carrier_AACT.md`).

---

## Ví dụ (PO 71648792)
- Ship Via: **Misc** → có pallet.
- Ship To dòng 1: NATALIE ROCHE; dòng 2: 6915 BROAD RIVER AVE (không có C/O) → **customer**.
- Bang: **FL**.
- Tra carrier.csv hàng FL → cột A = XGSI, cột B = AACT. Đơn customer → **cột B = AACT**.
- → Dùng hướng dẫn carrier **AACT**.

---

## Bảng tra nhanh (carrier.csv)
| Bang | Store (cột A) | Customer (cột B) |
|------|---------------|------------------|
| AL | AACT | AACT |
| AR | SEFL | CTII |
| AZ | XGSI | FXFE |
| CO | XGSI | FXFE |
| CT | BXID | BXID |
| DC | BXID | BXID |
| DE | BXID | BXID |
| FL | XGSI | AACT |
| GA | AACT | AACT |
| IA | XGSI | BXID |
| ID | XGSI | FXFE |
| IL | BXID | BXID |
| IN | XGSI | BXID |
| KS | XGSI | FXFE |
| KY | XGSI | CTII |
| LA | AACT | AACT |
| MA | BXID | BXID |
| MD | BXID | BXID |
| ME | BXID | BXID |
| MI | XGSI | CTII |
| MN | BXID | BXID |
| MO | XGSI | FXFE |
| MS | AACT | AACT |
| MT | XGSI | FXFE |
| NC | AACT | AACT |
| NCA | XGSI | AACT |
| ND | AACT | BXID |
| NE | XGSI | ABFS |
| NH | BXID | BXID |
| NJ | BXID | BXID |
| NM | XGSI | FXFE |
| NV | XGSI | FXFE |
| NY | BXID | BXID |
| OH | XGSI | CTII |
| OK | XGSI | CTII |
| OR | XGSI | AACT |
| PA | BXID | BXID |
| RI | BXID | BXID |
| SC | AACT | AACT |
| SCA | XGSI | AACT |
| SD | BXID | BXID |
| TN | AACT | AACT |
| TX | AACT | CTII |
| UT | XGSI | FXFE |
| VA | SEFL | FXFE |
| VT | BXID | BXID |
| WA | XGSI | AACT |
| WI | BXID | BXID |
| WV | XGSI | FXFE |
| WY | XGSI | FXFE |

> Lưu ý: NCA/SCA là mã vùng (Bắc/Nam California) — nếu gặp cần xác định đúng vùng thay vì chỉ mã bang CA.
> 💡 **Thực tế 29/07/2026:** NCA và SCA cho **kết quả GIỐNG HỆT nhau** (store→XGSI, customer→AACT), nên với đơn CA **không cần phân vùng Bắc/Nam**. Đã kiểm với đơn 75865702 (Sacramento).

## ⚠️ BANG KHÔNG CÓ TRONG BẢNG
`carrier.csv` chỉ có **49 mã**: 48 bang lục địa + NCA + SCA. **THIẾU `AK` (Alaska) và `HI` (Hawaii).**

Gặp đơn Misc đi AK/HI → **KHÔNG tự chọn carrier, KHÔNG suy đoán**. Dừng lại và hỏi người dùng.
- Đã gặp 29/07/2026: PO `75917307`, Nicholas Delaney, bang **AK**. Người dùng chốt: **đơn AK do người dùng tự xử lý**, Claude bỏ qua như đơn Ground.

## ⚠️ KIỂM CỘT D (PIC) TRƯỚC KHI LÀM
Nếu hàng trong sheet đã có tên người ở cột **D** (`Eric`, `Kap`, …) thì **người đó đang làm tay** — Claude **BỎ QUA**, đừng đụng.
Làm lại sẽ tạo **BOL và lệnh pickup TRÙNG** trên AACT/CTII, không huỷ được.
- Đã gặp 29/07/2026: 10/12 đơn Misc trong một lô đã có PIC là Eric hoặc Kap (J và M đã đánh dấu nhưng **chưa có link Drive**) → người dùng chốt bỏ qua hết.
- Dấu hiệu nhận biết người làm tay: **`x` viết thường** ở cột J/M (script luôn ghi `X` HOA) và **cột P trống**.
