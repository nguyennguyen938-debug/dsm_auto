# ĐƠN NHIỀU MÃ HÀNG — ĐÃ CÓ ĐỦ CÂU TRẢ LỜI, ĐÃ LÀM XONG

Người dùng trả lời 12/08/2026. File này giữ lại làm hồ sơ quyết định.

📄 Trang đã dùng để hỏi: https://claude.ai/code/artifact/f962da01-95ad-4314-b9c5-69949d005ae0

---

## Bốn câu trả lời

| # | Câu hỏi | Trả lời |
|---|---|---|
| 1 | Xếp mấy pallet? | **Cách A — xếp chung một pallet** |
| 2 | Công thức chiều cao còn đúng khi chồng khác loại? | **Còn đúng — `6″ + 2″ mỗi tấm`** |
| 3 | Hàng chuyển phát, không kho nào đủ cả — tách kho được không? | **Được — tách 2 shipment, mỗi lần 1 kho, cùng PO number, thông tin điền giống hết** |
| 4 | Có gặp phiếu xe tải nhiều mã không? | **Có, thi thoảng** |

---

## Đã làm theo bốn câu đó

### Nhánh xe tải — `tinhBOL()` nhận mảng
> `10_VM_Tool/bol-tinh.mjs`

| | Cách tính |
|---|---|
| `WEIGHT` | Σ(cột K × Qty mọi mã) **+ 55 một lần** |
| `H` | `6 + 2 × TỔNG số tấm` |
| `L`, `W` | **LỚN NHẤT** theo từng chiều |
| mô tả | mỗi mã một dòng, `fill_bol.py` tự sinh |

Chốt chặn `lyDoNhieuSku` trong `xu-ly-don.mjs` đã bỏ. Bảy chỗ đọc `items[0]` đã sửa —
cột G/H/I nay ghi mỗi mã một dòng, giống nhánh Ground.

### Nhánh chuyển phát — `chiaTheoKho()`
> `10_VM_Tool/ground-tra.mjs`

1. Có kho đủ **mọi** mã → dùng kho đó, một shipment (gộp hơn tách)
2. Không có → mỗi mã lấy kho ưu tiên cao nhất còn đủ mã đó, gộp mã trùng kho → nhiều shipment
3. Mã nào không kho nào đủ → **vẫn dừng**. Không xé nhỏ Qty một mã ra hai kho.

Bằng chứng ghi theo **từng lô** (`bc.lo[]`), ghi ngay sau mỗi shipment.
File đời cũ được `nangBangChungDoiCu()` nâng lên — không nâng thì đơn đã chạy sẽ bị mua lại nhãn.

### Đã kiểm
- Bộ test `10_VM_Tool/test-ground-tra.mjs`: **97 pass, 0 fail**
- Hồi quy 1 mã: **240 ca** đều ra kết quả y hệt bản cũ
- Kiểm chéo JS ↔ Python: **137/137 khớp** weight và pieces
- Dựng thử BOL 2 mã: HTML ra đúng 2 dòng mô tả, 242 lb

### Còn hở
- **Chưa gặp đơn Misc nhiều mã nào trên thực địa** (57 slip gần nhất chỉ có 1 đơn nhiều mã,
  và nó đi Ground). Nhánh BOL nhiều mã mới chỉ qua test và một BOL dựng thử.
- Nhánh **tách kho chưa chạy thật** — cần một đơn mà không kho nào đủ cả.
- Nhánh **pickup** (`--pickup`) đã sửa để đặt xe theo từng lô, nhưng pickup vốn đang TẮT
  nên chưa ai kiểm.
- `pallet.csv` vẫn chỉ 10 mã — giới hạn riêng, không liên quan số mã trên phiếu.

---

## Ghi chú kỹ thuật còn giữ

- `10_VM_Tool/xu-ly-don.mjs:228` cũ (`lyDoNhieuSku`) — đã gỡ.
- Chốt chặn đó từng nằm **trước** nhánh Ground, nên đơn Ground nhiều mã bị báo
  "chờ người xem" dù `xu-ly-ground.mjs` xử lý được. Gỡ chốt chặn là hết luôn chuyện này.
- `chiaTheoKho` và `nangBangChungDoiCu` đặt trong `ground-tra.mjs` chứ không phải
  `xu-ly-ground.mjs`, vì file kia gọi `main()` ngay khi import nên không test được từ ngoài.
