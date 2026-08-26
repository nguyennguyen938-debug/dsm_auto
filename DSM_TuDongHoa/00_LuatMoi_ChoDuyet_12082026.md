# LUẬT PHÂN LOẠI B2B/B2C — bản mới, CHỜ DUYỆT

Viết theo cập nhật của người dùng 12/08/2026. **Chưa sửa dòng code nào.**

---

## 1. LUẬT PHÂN LOẠI TỪNG DÒNG HÀNG

Xét **từng SKU** trên packing slip, theo thứ tự:

| # | Điều kiện | Về sheet | Ghi chú |
|---|---|---|---|
| 1 | SKU ∈ `836390-B` `838390-B` `836390` `838390` | **B2B** | kho Calhoun. **Bất kể** slip ghi Ship Via = Ground |
| 2 | SKU ∈ `838250-B` `838250` `818250-B` `818250` | **B2C**, trừ khi hết tồn → **B2B** | phải tra Lecangs mới biết |
| 3 | Còn lại | như hiện tại | Ground → B2C · Misc → B2B |

**"Hết tồn"** = *không kho Lecangs nào đủ số lượng đơn cần*.
Ví dụ đơn cần 2, mọi kho chỉ còn 1 → coi là hết → đẩy sang B2B.

**Tra tồn kho bỏ hậu tố:** `838250-B` → tra `838250`, gộp mọi biến thể (`-B`, `-WL`,
`-B-PALLET`). Đây là luật đã có trong `maLecangs()`.

---

## 2. ĐƠN HỖN HỢP — ĐỊNH NGHĨA MỚI

> Đơn có **ít nhất một** SKU về B2B **và** ít nhất một SKU về B2C.

🔴 **Khác căn bản với hiện tại:** phân loại giờ phụ thuộc **tồn kho động**, nên
**phải tra Lecangs TRƯỚC** rồi mới biết đơn có hỗn hợp hay không.

---

## 3. VIỆC CỦA MỖI SHEET

| Sheet | Làm gì |
|---|---|
| **B2B** | Dựng BOL, ô carrier **để trống**, tạo folder Drive, điền sheet B2B |
| **B2C** | Tra tồn kho → chọn kho → label UPS → Drive → sheet B2C → đơn parcel Lecangs |
| `Order List` | Đơn hỗn hợp: **chỉ** tích `X` cột T |

---

## 4. ⚠️ BỐN RỦI RO CỦA LUẬT MỚI — cần anh biết

**4.1. Phân loại phụ thuộc phiên Lecangs.**
Trước đây đọc slip là biết ngay đơn thuộc luồng nào. Nay đơn chứa 4 SKU nhóm 2 **bắt buộc
phải tra Lecangs** chỉ để quyết định sheet. Phiên sống ~4 tiếng và hiện không đăng nhập
được → phần lớn thời gian trong ngày tool **không phân loại nổi** những đơn này.

❓ Phiên chết thì đơn nhóm 2 nên **nằm chờ**, hay **mặc định coi là B2C**?

**4.2. Kết quả đổi theo thời điểm chạy.**
Cùng một PO: sáng còn hàng → B2C; chiều hết hàng → B2B. Nếu sáng đã tạo label UPS rồi,
chiều chạy lại sẽ thấy nó "thuộc B2B" — trong khi vận đơn đã tồn tại.

❓ Đã xử lý ở B2C rồi thì **khoá luôn** ở B2C chứ? (tôi đề nghị: có, dựa vào
`11_TaiVe/ups/<PO>.json`)

**4.3. Hàng Ground nhưng dựng BOL.**
Nhóm Calhoun và nhóm hết-tồn đều về B2B và **dựng BOL** — dù slip ghi Ship Via = Ground,
tức hàng đi parcel chứ không phải pallet LTL. BOL sẽ ghi `HANDLING UNIT = 1` (một pallet)
cho món hàng lẽ ra đi bằng kiện.

❓ Đúng ý anh chứ? Hay hàng Ground về B2B thì **chỉ điền sheet**, không dựng BOL?

**4.4. `SKU_LUON_UPS` mất chỗ đứng.**
Danh sách này (4 SKU y hệt nhóm Calhoun) hiện dùng để **ép carrier UPS** cho đơn Misc.
Nhưng luật mới nói chính 4 SKU đó luôn về **B2B**. Hai luật ngược nhau.

❓ Bỏ hẳn `SKU_LUON_UPS` chứ?

---

## 5. NHỮNG GÌ TÔI SẼ SỬA, NẾU ANH DUYỆT

| # | File | Việc |
|---|---|---|
| 1 | `ground-tra.mjs` | Thêm `phanLoaiSku()` — một chỗ duy nhất quyết định B2B/B2C |
| 2 | `xu-ly-ground.mjs` | Tra tồn kho **trước** khi phân loại; nhóm Calhoun → bỏ qua |
| 3 | `xu-ly-don.mjs` | Nhận đơn Ground thuần Calhoun; dùng chung `phanLoaiSku()` |
| 4 | `CopyB2B_B2C.gs` | Cho copy cột **N** sang B2C (vẫn chặn ở B2B) |
| 5 | `huy-ups-thua.mjs` | Bỏ — ❓ **xoá hẳn hay giữ làm tư liệu?** |
| 6 | — | Bốn lỗi nhẹ trong `00_SoatLoi_12082026.md` (L4–L8) |

---

## 6. NĂM CÂU CHỜ ANH TRẢ LỜI

1. Phiên Lecangs chết → đơn nhóm 2 **nằm chờ** hay **mặc định B2C**?
2. Đã tạo label ở B2C rồi thì **khoá** ở B2C chứ?
3. Hàng Ground về B2B: **dựng BOL** hay **chỉ điền sheet**?
4. Bỏ hẳn `SKU_LUON_UPS` chứ?
5. `huy-ups-thua.mjs`: **xoá hẳn** hay **giữ lại** không dùng?
