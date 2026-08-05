# Hướng dẫn tạo Google Apps Script gửi mail BOL

## Bước 0 — Chuẩn bị Sheet
Mở Google Sheet chứa đơn (tab tên **Orders**), chỉ **3 cột**:

| A | B | C |
|---|---|---|
| PO | Carrier | Status (để trống) |

Hàng 1 là tiêu đề, dữ liệu từ hàng 2. **Khi nhập chỉ điền A=PO và B=Carrier** (vd AACT); cột C do script tự ghi. KHÔNG có cột email — email lấy theo cấu hình carrier trong code.

## Bước 1 — Mở trình soạn Apps Script
Trong Google Sheet: menu **Extensions** (Tiện ích) ▸ **Apps Script**.
Một tab mới mở ra với file `Code.gs`.

## Bước 2 — Dán code
1. Xóa hết nội dung mẫu trong `Code.gs`.
2. Mở file `GuiMail_BOL.gs` (tôi đã tạo), copy toàn bộ, dán vào.
3. Bấm biểu tượng **💾 Save** (hoặc Ctrl+S).

## Bước 3 — Chỉnh cấu hình carrier (khối `CARRIERS` trong code)
- Mỗi carrier là 1 khối, vd `AACT`:
  - `folderId`: ID folder Drive chứa file của carrier đó (lấy từ URL `.../folders/ID`).
  - `carrierEmail`: email carrier nhận (BOL + Packing). **Hiện để tạm email test — sửa thành email thật khi có.**
  - `warehouseEmail`: email kho nhận (Label + BOL + Packing). **Hiện để tạm email test.**
- Thêm carrier mới = thêm 1 khối tương tự (BXID, XGSI...).
- `SHEET_NAME`: đúng tên tab (mặc định 'Orders').

## Bước 4 — Cấp quyền (chạy thử 1 lần)
1. Ở thanh trên, chọn hàm **processOrders** trong ô dropdown.
2. Bấm **▶ Run**.
3. Google hiện popup xin quyền → **Review permissions** → chọn tài khoản Google của bạn.
4. Nếu thấy "Google hasn't verified this app": bấm **Advanced** ▸ **Go to (tên project) (unsafe)** → **Allow**.
   (An toàn vì đây là script của chính bạn.)

## Bước 5 — Bật menu & tự động
1. Quay lại Google Sheet, **reload trang** (F5).
2. Xuất hiện menu mới **📦 Gửi BOL** trên thanh menu.
3. Bấm **📦 Gửi BOL ▸ ⏱ Bật tự động** → script tự quét mỗi 5 phút.
4. Muốn chạy ngay: **📦 Gửi BOL ▸ ▶ Chạy gửi ngay**.

## Kiểm tra
- Bỏ 3 file `<PO>_BOL.pdf`, `<PO>_ShippingLabel.pdf`, `<PO>_PackingSlip.pdf` vào folder Drive của carrier TRƯỚC.
- Thêm 1 hàng vào Sheet: chỉ **A=PO, B=Carrier** (vd AACT) SAU.
- Chạy → carrier nhận 2 file, kho nhận 3 file, cột C ghi `SENT ...`.

## Xử lý lỗi thường gặp
- **Không thấy menu 📦**: chưa reload Sheet, hoặc `onOpen` chưa lưu → Save lại + reload.
- **"Không tìm thấy thư mục"**: đặt `FOLDER_ID` thay vì dựa theo tên.
- **Cột C ghi WAIT: thiếu ...**: file chưa có/đặt sai tên trong Drive. Kiểm tra tên đúng `<PO>_BOL.pdf` v.v.
- **Trigger không chạy**: vào Apps Script ▸ đồng hồ ⏰ **Triggers** kiểm tra trigger `processOrders` còn bật.
