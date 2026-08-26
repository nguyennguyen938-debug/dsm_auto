# TOÀN BỘ QUY TẮC / SKU ĐẶC BIỆT TOOL ĐANG DÙNG — để verify

Trích **thẳng từ code và CSV** ngày 12/08/2026, không viết theo trí nhớ.
Cột "nguồn" cho biết sửa ở đâu nếu sai.

---

## 1. 🔴 HAI DANH SÁCH SKU ĐẶC BIỆT — KHÁC NHAU, ĐỪNG GỘP

🔄 **Viết lại 12/08/2026.** Bản trước mô tả `SKU_LUON_UPS` (đã bỏ) và ghi `SKU_NGOAI_LE`
khớp theo phần số đầu (nay khớp tuyệt đối cả chuỗi).

### 1.1. `SKU_NGOAI_LE` — luôn **B2B**, kho Calhoun
> nguồn: `10_VM_Tool/ground-tra.mjs:17`

```
836390 · 836390-B · 838390 · 838390-B
```

- Ép kho **Calhoun**, **không** tra tồn kho Lecangs
- Khớp **TUYỆT ĐỐI cả chuỗi** — `836390-WL` KHÔNG dính, `816390`/`818390` cũng KHÔNG
- Về **B2B** ngay cả khi slip ghi `Ground` — đây là chỗ dễ nhầm nhất, vì hàng Calhoun
  vẫn đi UPS mà "đi UPS" ở chỗ khác lại là dấu hiệu B2C

### 1.2. `SKU_B2C_UU_TIEN` — ưu tiên **B2C**, nhưng hết hàng thì đổi
> nguồn: `10_VM_Tool/ground-tra.mjs:51`

```
838250 · 838250-B · 818250 · 818250-B
```

- Cũng khớp **TUYỆT ĐỐI cả chuỗi**
- Phải **tra tồn Lecangs trước** mới biết luồng nào: còn đủ → B2C, hết → B2B
- **Tra không được** (mất phiên) → mặc định **B2C**
- `canTraTonDePhanLoai(model)` cho biết mã nào bắt buộc tra

### 1.3. Mã tra tồn kho Lecangs — bỏ mọi hậu tố
> nguồn: `10_VM_Tool/lecangs.mjs:73`

`812250-B` → tra `812250`, gộp tồn kho của `812250-B` + `812250-B-PALLET` + `812250-WL`.
⚠️ **`dims_sku.csv` thì NGƯỢC LẠI** — giữ nguyên hậu tố (`812250` 31 lb ≠ `812250-B` 128 lb).

---

## 2. PHÂN LOẠI B2B / B2C — THEO **KHO**, KHÔNG THEO HÃNG

```
kho Lecangs (CAP · SAV · NJF02 · HOU07 · MEM-R)  ->  B2C
kho Calhoun (NOTS Logistics)                     ->  B2B
```

Đơn có SKU cả hai nhóm = **hỗn hợp** → tích `X` cột T, mỗi sheet một tool xử lý phần của mình.

### Bốn luật, xét theo thứ tự — `phanLoaiSku()`
> nguồn: `10_VM_Tool/ground-tra.mjs:75` — **nơi DUY NHẤT** giữ luật này

| # | Điều kiện | Kết quả |
|---|---|---|
| **0** | Bang giao là `AK` hoặc `HI` (`BANG_LUON_B2B`) | **B2B** — thêm 12/08/2026 |
| 1 | `laSkuNgoaiLe(model)` — 4 mã Calhoun ở 1.1 | **B2B** |
| 2 | `laSkuB2CUuTien(model)` — 4 mã ở 1.2 | `conHang === false` → **B2B**, còn lại → **B2C** |
| 3 | mọi mã còn lại | slip ghi `Ground` → **B2C**, `Misc` → **B2B** |

**Luật 0 xét trước cả SKU.** Lý do: `warehouse_ranking_by_state.csv` và `carrier.csv` đều chỉ có
48 bang lục địa, nên đơn **Ground** đi AK/HI làm `khoUuTien()` ném lỗi và kẹt vô thời hạn.
Đơn **Misc** đi AK/HI thì vốn đã chạy được từ 11/08 (carrier `NULL`, vẫn dựng BOL) — PO `53579205`
là ví dụ thật, hàng 307 sheet chính.

⚠️ Đơn **Ground** về B2B hiện **chỉ điền sheet, KHÔNG dựng BOL** (nhánh `chiDienSheet`), theo
quyết định *"hàng Ground về B2B thì trước mắt chỉ điền sheet"*. Nếu muốn nhóm này cũng có BOL
thì phải đổi nhánh đó — chưa làm.

---

## 3. SÁU KHO — địa chỉ đang gửi cho UPS
> nguồn: `05_TraCuu/kho_dia_chi.csv`

| Kho | Công ty | Địa chỉ | Liên hệ | Điện thoại |
|---|---|---|---|---|
| Calhoun | HOMEDEPOT | 120 ENTERPRISE DR SW, CALHOUN GA 30701 | MARIO | 7622317977 |
| MEM-R | HOMEDEPOT | 5625 CHALLENGE DR STE 104, MEMPHIS TN 38115 | LECANGS | 8323397275 |
| SAV | HOMEDEPOT | 1100 Logistics Parkway Building 1, Rincon GA 31326 | LECANGS | 8323397275 |
| HOU07 | HOMEDEPOT | 28119 KATY FWY, KATY TX 77494 | LECANGS | 2096732629 |
| NJF02 | HOMEDEPOT | 1900A River Rd, Burlington NJ 08016 | LECANGS | 9254096255 |
| CAP | HOMEDEPOT | 728 W RIDER ST, PERRIS CA 92571 | LECANGS | 8323397275 |

**Thứ tự ưu tiên theo bang:** `warehouse_ranking_by_state.csv`, 50 bang, **MEM-R luôn vị trí 6**.
AK/HI **không có** trong bảng — nhưng từ 12/08 không còn gây kẹt: **luật 0** ở mục 2 đẩy đơn
hai bang đó sang B2B trước khi tới `khoUuTien()`.

---

## 3b. TÁCH KHO CHO ĐƠN NHIỀU MÃ (chốt 12/08/2026)
> nguồn: `10_VM_Tool/ground-tra.mjs` → `chiaTheoKho()`

Xét theo thứ tự, không đảo:

| # | Điều kiện | Kết quả |
|---|---|---|
| 1 | có kho đủ **mọi** mã | dùng kho đó, **1 shipment** — gộp hơn tách |
| 2 | không có | mỗi mã lấy kho ưu tiên cao nhất còn đủ **mã đó**, gộp mã trùng kho → **nhiều shipment**, cùng PO |
| 3 | mã nào không kho nào đủ | **NÉM LỖI, dừng** |

⛔ **KHÔNG xé nhỏ Qty của một mã ra hai kho.** "Mỗi mã một kho" là điều đã chốt; tách sâu
hơn chưa ai duyệt.

Bằng chứng ghi theo **từng lô** (`ups/<PO>.json` → `bc.lo[]`), ghi ngay sau mỗi shipment —
hỏng ở lô 2 mà chưa ghi lô 1 thì lần chạy sau **mua lại nhãn lô 1**.
File đời cũ (không có `lo`) được `nangBangChungDoiCu()` nâng lên, nếu không đơn đã chạy
sẽ bị coi là chưa có shipment.

---

## 4. UPS API
> nguồn: `10_VM_Tool/ups-ship.mjs`

| Mục | Giá trị |
|---|---|
| Tài khoản **trả cước** (bill third party) | `12C8D2`, zip `92571` |
| Dịch vụ | `03` = UPS Ground |
| Khổ label | **4×6 inch** (`LabelStockSize`) — sửa 11/08 |
| `Name` bên gửi | `kho.tenCongTy` = **HOMEDEPOT** |
| `AttentionName` | tên người liên hệ của kho (MARIO / LECANGS) |
| Pickup | **TẮT** mặc định, chỉ bật bằng `--pickup` |

---

## 5. QUY TẮC BOL
> nguồn: `04_BOL_Form/fill_bol.py`

| Ô | Giá trị |
|---|---|
| `# PKGS` | **TỔNG QTY** (sửa 11/08, trước là `1`) |
| `HANDLING UNIT / QTY` | luôn `1` — số pallet |
| `WEIGHT` | Σ(cột K × Qty) **+ 55 một lần** cho pallet |
| `SPECIAL INSTRUCTIONS` dòng 4 | bỏ trống |
| Carrier | để **TRỐNG** khi cột C là `NULL` hoặc rỗng |

Freight class tính theo **PCF** (`class.csv`): 50 → ≥50 PCF · 92.5 → 10.5–12 · 125 → 7–8…

**Đơn nhiều mã hàng** (chốt 12/08/2026 — xếp chung một pallet):
`WEIGHT` = Σ(K × Qty mọi mã) + 55 **một lần** · `H` = 6 + 2×**tổng** tấm ·
`L`,`W` = **lớn nhất** theo từng chiều · mỗi mã một dòng mô tả.

---

## 6. BẢNG TRA — ĐỘ PHỦ THỰC TẾ

| File | Số dòng | Ghi chú |
|---|---|---|
| `dims_sku.csv` | 524 SKU | dùng cho **Ground** (dims UPS) |
| `pallet.csv` | **10 SKU** | dùng cho **BOL** (weight/gỗ/độ dài) |
| `warehouse_ranking_by_state.csv` | 50 bang | thiếu AK/HI — luật 0 chặn trước |
| `carrier.csv` | 48 bang + NCA/SCA | thiếu AK/HI — hiện **không dùng** |

🔴 **`pallet.csv` chỉ có 10 SKU:**
`818250 · 810250 · 812250 · 816390 · 818390 · 838250 · 830250 · 832250 · 836390 · 838390`
→ Đơn **Misc** dùng SKU ngoài danh sách này **không dựng được BOL**.
Đã thấy thiếu: `833250` · `814300` · `834250` · `815253` · `836250`.

---

## 7. CỜ BẬT/TẮT ĐANG CÓ HIỆU LỰC

| Cờ | Giá trị | Nghĩa | Nguồn |
|---|---|---|---|
| `NGUNG_CHON_CARRIER_B2B` | `true` | Không tra `carrier.csv`; cột C ghi `NULL`; **nhánh AACT không chạy** | `xu-ly-don.mjs:171` |
| `CARRIER_TRONG` | `'NULL'` | Chuỗi ghi vào cột C | `xu-ly-don.mjs:172` |
| `NGUNG_DIEN_K_CHO_MISC` | `true` | Đơn Misc để trống cột K; Ground vẫn điền | `xu-ly-don.mjs:152` |
| `TAO_PICKUP` | `false` | Không gọi xe UPS (Home Depot từ chối trả phí) | `xu-ly-ground.mjs:91` |
| `MAX_PER_DAY` | `20` | Trần đơn/ngày pickup; Ground được miễn | web app `:43` |

---

## 8. SHEET

| Mục | Giá trị |
|---|---|
| `Order List` | header hàng **6**, data hàng 7 |
| Sheet **B2B** | gid `1948139859`, header hàng **1** |
| Sheet **B2C** | gid `768845312`, header hàng **1** |
| Cột **T** = `B2B and B2C` | cột thứ **20** (R, S trống) |
| Cột ép TEXT | B (PO) · K (Pickup) · N (PRO#) |
| **Không** copy sang sheet con | C · L · N · O |
| Đơn `NULL` chỉ chép | A · B · P |
| Đơn `T=X` chỉ chép | A · B · T (vào **cả hai** sheet) |
| Chỉ quét | **40 đơn cuối** |

---

## 9. NGÀY PICKUP

**Ground** (`ngayPickupGround`): trước 15:00 giờ VN → hôm nay; sau → hôm sau.
Thứ 6 cộng 3 ngày, Thứ 7 cộng 2 (tránh cuối tuần).

**Misc**: `ngayPickup()` + trần 20 đơn/ngày, đầy thì dời sang ngày làm việc kế.

---

## 10. ❓ NHỮNG ĐIỂM TÔI MUỐN ANH XÁC NHẬN

1. ~~Hai danh sách SKU lệch nhau~~ — **đã giải quyết 12/08**: `SKU_LUON_UPS` bỏ hẳn, giờ chỉ
   còn hai danh sách ở mục 1.1 và 1.2, cả hai đều khớp tuyệt đối cả chuỗi và không giao nhau.
2. **`pallet.csv` chỉ 10 SKU** — có bản đầy đủ hơn không? Hiện đơn Misc dùng SKU lạ sẽ nằm chờ.
3. **Tên công ty tất cả kho = HOMEDEPOT** — kể cả Calhoun (kho NOTS) và các kho Lecangs.
   Label in ra ghi "HOMEDEPOT / LECANGS / 1100 Logistics Parkway…". Đúng ý chưa?
4. **Điện thoại kho** — HOU07 và NJF02 dùng số khác ba kho còn lại. Đúng chưa?
5. **Cước bill về `12C8D2`** (Home Depot) — mọi vận đơn đều third-party billing.
6. **`838390` có ghi chú "có pallet cao hơn 5in"** trong `pallet.csv` — tool **không**
   dùng ghi chú này. Có ảnh hưởng cách tính không?
