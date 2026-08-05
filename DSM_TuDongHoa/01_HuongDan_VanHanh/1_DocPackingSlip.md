# Cách đọc file Packing Slip (Home Depot) — trích xuất thông tin

## 🔴 BƯỚC 0 — ĐẾM SỐ PACKING SLIP TRONG FILE (LÀM TRƯỚC MỌI THỨ)

**Một file PDF thường chứa NHIỀU packing slip — mỗi trang là MỘT đơn khác nhau.** Đừng bao giờ giả định 1 file = 1 đơn.

> ⚠️ **Đã sập 28/07/2026:** người dùng gửi 4 file, Claude chỉ đọc trang đầu mỗi file và báo "có 4 đơn". Thực tế **42 packing slip** (một file 27 trang). Suýt bỏ sót 38 đơn.

**Quy trình bắt buộc:**

1. Đếm số trang từng file: `pdfinfo <file>.pdf | grep Pages`
2. Tách mỗi trang thành 1 file, đặt tên theo PO của chính trang đó:
   ```bash
   pdftotext -layout -f <p> -l <p> <file>.pdf -   # đọc PO của trang p
   pdfseparate -f <p> -l <p> <file>.pdf <PO>_PackingSlip.pdf
   ```
3. Lập bảng: `PO · Customer Order · Ship Via · file nguồn:trang`.
4. **Lọc bỏ Ship Via = Ground** (người dùng tự xử lý).
5. **Đối chiếu từng PO còn lại với sheet "Order List"** trước khi làm — xem cột **J** (BOL/Label), **M** (WH Notif), **P** (Link Drive). Nếu đã có dấu → **đơn đã xử lý, KHÔNG làm lại** (làm lại = BOL trùng + đặt pickup lần hai).
6. Nếu cột **D (PIC)** có tên người (vd `Kap`) → **người khác đang làm tay**, hỏi trước khi động vào.
7. Báo người dùng bảng tổng kết rồi mới bắt đầu xử lý.

**Kiểm tra nhanh khi tách xong:** số file tách ra phải bằng tổng số trang; không có PO trùng; mọi PO phải đúng **8 chữ số**.

---

Sau khi tách xong, với **từng** packing slip, trích xuất các trường sau:

## 1. Customer Order # và Purchase Order # (số PO)
- Nằm ở khối đầu trang, cạnh ngày và Ship Via.
- `Customer Order #` (dạng WHxxxxxxxx) và `Purchase Order #` = **số PO** (dạng số).

## 2. Ship Via
- Phương thức vận chuyển (ví dụ: "Misc. Common Carrier", kèm ghi chú "Consult routing guide for LTL carrier").
- **Phân loại pallet theo Ship Via:**
  - Nếu chứa **"Misc"** → ship có **pallet** (LTL/Pallet).
  - Nếu là **"Ground"** → ship **không cần pallet** (Ground).

## 3. Ship To — đọc theo thứ tự dòng
1. **Dòng đầu tiên** = tên người hoặc cửa hàng.
   - Nếu là **người** → dòng thứ hai là **địa chỉ đường phố**.
   - Nếu là **cửa hàng** → dòng thứ hai chứa **"C/O"** (care of).
2. Sau tên: **dòng địa chỉ đường phố**.
3. Tiếp theo: **Thành phố, Bang, Mã bưu điện** (định dạng `CITY, ST ZIP`).
   - Tách bằng dấu phẩy: phần trước phẩy = Thành phố; sau phẩy = Bang (2 chữ) + Mã bưu điện.
4. **Dòng cuối** = số điện thoại.
- (Có thể kèm `Address Type: Residential/Commercial`.)

## 3b. Chọn Carrier (tra Routing Guide — Sheet3)
Sheet có 3 cột:
- **Cột A** = Carrier khi ship đến **store** (Ship To **có C/O**) — "Supplier IB to DC/Store Carrier".
- **Cột B** = Carrier khi ship đến **customer** (Ship To **không có C/O** / Residential) — "Residential Delivery Carrier (Hd.com)".
- **Cột C** = **Bang** (Destination Zip/State).

**Cách chọn:**
1. Xác định Ship To là store (có C/O) hay customer (không C/O) → chọn cột A hoặc B.
2. Lấy Bang từ Ship To → tìm hàng có Bang đó ở cột C.
3. Giao của (cột A hoặc B) × (hàng theo Bang) = mã carrier cần dùng.

Ví dụ: customer + FL → cột B, hàng FL = **AACT**. Store + IL → cột A, hàng IL = **BXID**.

## 4. Item Description
- Trong bảng: mô tả mặt hàng (kèm Model Number, Internet Number).

## 5. Qty Shipped
- Cột số lượng đã gửi trong bảng mặt hàng.

---
### Ví dụ đã áp dụng (file 71648792_packing.pdf)
- Customer Order #: WH38519362
- Purchase Order # (PO): 71648792
- Ship Via: Misc. Common Carrier
- Ship To: NATALIE ROCHE (người) — 6915 BROAD RIVER AVE — LAND O LAKES, FL 34638 — (314) 817-6221 — Residential
  - Thành phố: LAND O LAKES | Bang: FL | Mã bưu điện: 34638
- Item Description: Unfinished Acacia Butcher Block Countertop - 12ft x 25in x 1.5in (Model 832250-B, Internet 700203712)
- Qty Shipped: 1
