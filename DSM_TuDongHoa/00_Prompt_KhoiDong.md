# PROMPT KHỞI ĐỘNG — dán vào tin nhắn đầu tiên trên máy mới

Cách dùng: mở Claude Cowork → chọn (mount) folder `DSM_TuDongHoa` → copy toàn bộ khối dưới đây, dán làm tin nhắn đầu tiên.

---

Tôi là AllForWood (info@allforwood.com). Tôi vừa chuyển dự án này sang máy mới. Folder `DSM_TuDongHoa` tôi đã mount là toàn bộ bộ nhớ của dự án — bạn không có lịch sử hội thoại cũ, mọi thứ cần biết đều nằm trong folder.

**Việc đầu tiên: đọc trước khi làm.** Đọc theo thứ tự và đừng bắt đầu tác vụ nào cho tới khi đọc xong:

1. `00_README.md`
2. `00_BanGiao_MayMoi.md` (ID, bảng trigger ↔ tài khoản, 7 bẫy đã từng sập)
3. `01_HuongDan_VanHanh/` — toàn bộ: đọc packing slip, chọn carrier, quy trình AACT, playbook AACT, carrier khác, quy trình CTII
4. `02_AppsScript/HuongDan_CaiDat_AppsScript_Moi.md`

Đọc xong, tóm tắt lại cho tôi trong 10 dòng: luồng xử lý một đơn từ đầu tới cuối, và những gì đang ở chế độ test. Nếu có chỗ nào trong tài liệu mâu thuẫn hoặc thiếu, nói ngay thay vì tự suy luận.

## Bối cảnh công việc

Tôi làm dropship cho Home Depot qua CommerceHub DSM. Mỗi đơn LTL/pallet cần: đọc packing slip → chọn carrier → tạo BOL (+ shipping label nếu AACT/CTII) → tạo folder Drive tên `<PO>` → upload file → điền sheet → script tự gửi mail cho kho → script tự tra số PRO.

Phần tự động chạy trên Google (Apps Script `AFW-DSM` + 4 trigger + 1 web app), không phụ thuộc máy tôi. Phần bạn làm là phần thủ công: đọc packing slip, điền form trên web carrier, gọi web app.

Đơn **Ground** (Ship Via = Ground) tôi tự xử lý — bỏ qua, đừng làm.

## Quy tắc bắt buộc

1. **Mọi điểm chưa chắc chắn phải hỏi tôi.** Không suy diễn, không đoán mò, không bịa. Nếu tài liệu không nói, hỏi. Nếu tool trả kết quả lạ, báo nguyên văn cho tôi thay vì tự giải thích.
2. **Trên web Central Transport (CTII): TUYỆT ĐỐI không bấm Submit** khi đang test — sẽ tạo BOL và lệnh pickup thật, không huỷ được. Điền form thoải mái, chỉ không submit.
3. **PO luôn 8 chữ số và luôn phải ghi dạng TEXT** vào sheet. Nhiều PO bắt đầu bằng 0. Ghi sai định dạng là mất số 0 đầu, kéo theo lệch tên folder Drive, `fillRow` không tìm thấy hàng, mail không gửi.
4. **Sửa web app phải Deploy ▸ Manage deployments ▸ New version.** Trigger dùng code Head nên Save là đủ, web app thì không.
5. **Đừng bao giờ dán file trong `06_File_Cu_KHONG_DUNG/` lên Apps Script.** Trùng tên hàm sẽ đè code mới, Apps Script không báo lỗi mà chỉ chạy sai.
6. **Không nhập mật khẩu và không lưu mật khẩu.** Web carrier tôi tự đăng nhập.
7. Trả lời **ngắn gọn, tiếng Việt**, không giải thích dài dòng. Có bug thì nói nguyên nhân + cách sửa, không kể lại quá trình.
8. Khi phát hiện bug hoặc tìm ra cách làm nhanh hơn, **ghi vào file hướng dẫn tương ứng** trong folder này — đó là cách dự án không mất kinh nghiệm khi đổi máy.

## Chẩn đoán, đừng đoán

Hệ thống đã có sẵn các hàm chẩn đoán. Khi có sự cố, chạy hàm tương ứng và đọc log thay vì suy đoán:

| Hiện tượng | Chạy hàm | Chạy bằng |
|---|---|---|
| Mail kho không gửi | `DIAG_mail` | info@ |
| Không lấy được số PRO | `DIAG_pro` | info@ |
| Đơn mới không vào sheet | `DIAG_rithum`, `DIAG_parser` | rithumgetorder@ |
| PO mất số 0 đầu | `FIX_poLeadingZero` | info@ |

Nếu cần một loại chẩn đoán chưa có, viết thêm một hàm `DIAG_*` mới — chỉ đọc và log, không ghi, không gửi.

## Việc cần làm ngay trong phiên đầu tiên

1. Đọc tài liệu và tóm tắt như trên.
2. Chạy checklist mục 4 của `00_BanGiao_MayMoi.md` để xác nhận hệ thống còn nguyên: `DIAG_mail`, `DIAG_pro`, `DIAG_rithum`, mở URL `/exec`, và kiểm `script.google.com/home/triggers` xem **mọi trigger có đúng thuộc project `AFW-DSM`** (project `AACT auto` chứa code cũ, từng gây gửi mail trùng).
3. Báo cho tôi 2 việc còn treo: đã xoá trigger của `AACT auto` chưa, và `WAREHOUSE_TO` đã đổi về `mariop@notslogistics.com` chưa (đang trỏ địa chỉ test).

Nếu tôi gửi kèm packing slip PDF ngay ở tin nhắn này thì cứ đọc tài liệu trước, rồi mới xử lý đơn.
