# QUY TRÌNH XỬ LÝ ĐƠN GROUND — UPS + Lecangs

Người dùng mô tả **06/08/2026**. Đây là bản chép lại nguyên văn quy trình, **chưa cài đặt gì**.

> ⚠️ **Quy trình này THAY ĐỔI quyết định cũ.** Trước đây (05/08) chốt "đơn Ground chỉ dừng ở mức
> có slip trên Drive", và `xu-ly-don.mjs` bỏ qua hoàn toàn đơn Ground. Nay đơn Ground **có quy
> trình riêng đầy đủ**: tạo shipping label trên UPS, đẩy đơn sang Lecangs, và **ghi Tracking
> Number vào cột N**. Code hiện tại CHƯA làm gì trong số này.

> 🔴 **CÒN 3 BẢNG TRA NGƯỜI DÙNG CHƯA GỬI** — xem cuối file. Thiếu chúng thì không chạy được.

---

## Phần 1 — Xử lý trên UPS

### Bước 1: Đọc packing slip
Theo `1_DocPackingSlip.md`.

### Bước 2: Chọn kho

1. Dựa theo **tiểu bang**, đối chiếu **bảng ①** (chưa có) → danh sách kho xếp theo thứ tự
   **gần nhất → xa nhất**.
2. Vào `https://app.lecangs.com/oms/inventory`, điền **SKU** vào ô, ấn **Search** bên phải
   → hiện danh sách kho.
3. Chọn **kho còn hàng gần nhất** — xem cột **Available Stock** để biết còn hàng hay không.

> ⭐ **4 SKU NGOẠI LỆ: `838390` · `836390` · `816390` · `818390`**
> Không cần chọn kho theo các bước trên — **mặc định kho Calhoun**.
> Bốn SKU này cũng **KHÔNG qua Lecangs** (xem Phần 3).

### Bước 3: Tạo shipping label trên UPS

`https://www.ups.com/ship/guided/destination?tx=11988064950853242&loc=en_US`

#### Mục 1 — Where

| Ô | Giá trị |
|---|---|
| **Ship From / Return To** | Ấn **edit** → mục **My address** ấn dropdown → chọn kho trùng với kho tìm được ở Bước 2 → **Continue**. ⚠️ Tên kho trong danh sách UPS **khác** tên khi tra Lecangs — cần **bảng ③** (chưa có) |
| **Saved Addresses** | `Enter New Address` (đang là vậy thì giữ nguyên) |
| **Country or Territory** | `United States` (đang là vậy thì giữ nguyên) |
| **Full Name or Company Name** | Tên khách. **Store thì KHÔNG điền phần `C/O ...`** |
| **Contact Name** | Giống Full Name |
| **Address** | Ấn **Edit Address - Add Suite/Apt.** — xem bảng dưới |
| **ZIP Code** | Zip |
| **City** | City **lấy từ packing slip**. Điền zip xong City tự điền, **không cần kiểm đúng sai** — tool cứ ghi đè bằng City trong packing slip |
| **Recipient Phone** | SĐT khách |

**Address Line — khác nhau giữa store và khách lẻ:**

| | Address Line 1 | Address Line 2 |
|---|---|---|
| **Store** | phần `C/O ...` | địa chỉ đường phố |
| **Khách lẻ** | địa chỉ đường phố | *(để trống)* |

→ **Continue** → hiện bảng *"Please tell us a little more about your destination address."*
→ **Is this a residential address?**: `Yes` nếu khách lẻ, `No` nếu store → **Continue**

#### Mục 2 — What

**Mỗi SKU = MỘT package.** Đơn nhiều SKU thì ấn **Add Another Package** để thêm.

Với từng package:

| Ô | Giá trị |
|---|---|
| **Total Identical Packages** | Qty Shipped của SKU đó |
| **Weight per Package** | Tra **bảng ②** (chưa có) |
| **Length · Width · Height** | Tra **bảng ②** (chưa có) |
| **Total Package Value** | để trống |
| **Reference #1** | số PO |

→ **Continue**

#### Mục 3 — How

- **Do you need to schedule a pickup?** → `Schedule a new pickup`
- **Pickup Date** — theo **giờ Việt Nam tại thời điểm điền đơn**:
  - **Sau 15:00** → dùng đúng quy tắc như đơn Misc (hôm nay + T6 `+3` / T7 `+2` / còn lại `+1`)
  - **Trước hoặc đúng 15:00** → quy tắc Misc **rồi TRỪ 1 ngày**
  - ❓ *Chưa rõ khi trừ 1 ngày rơi vào Thứ Bảy/Chủ Nhật thì xử lý sao — xem câu hỏi #4*
- **Pickup Details** → ấn **edit**:
  - Earliest Pickup Time: **luôn `1:00 PM`**
  - Latest Pickup Time: mặc định `5:00 PM`
  - Preferred Pickup Location: **`Warehouse`**
  - Pickup Reference: **số PO**
- Mục chọn dịch vụ/giá: **luôn chọn `UPS Ground`** (đang mặc định nhưng **phải kiểm lại**)

→ **Continue**

#### Mục 4 — Details
Không làm gì → **Continue**

#### Mục 5 — Payment

| Ô | Giá trị |
|---|---|
| **Bill Other Account** | tích (mặc định đã tích) |
| **Third Party** | tích (mặc định đã tích) |
| **Number or Shipper Receiver Account Number** | **luôn `12C8D2`** |
| **ZIP Code** | **luôn `92571`** |

→ **Review** → **Pay and Get Label(s)** → **Get Labels**

#### Lấy file và Tracking Number

Cửa sổ **Print** hiện ra:
- **Bỏ trang đầu** (trang hướng dẫn), lấy **hết các trang phía sau** — mỗi trang là shipping label
  của một SKU.
- Lưu **mỗi trang thành 1 file** vào folder `PO - <PO>`, đặt tên theo định dạng `<SKU>`.
  ❓ *Chưa rõ đuôi/hậu tố chính xác — xem câu hỏi #5*
- **Tracking Number → cột N** của sheet: **tất cả nằm trong CÙNG MỘT Ô**, mỗi Tracking Number
  một dòng.

⚠️ **Tracking Number ứng với từng SKU (package) VÀ từng số lượng.** Quay lại cửa sổ vừa điền form
sẽ thấy mục *Your Tracking Number* chia theo từng package, mỗi package có số Tracking Number bằng
số lượng. **Phải lưu đúng thứ tự** (khớp với thứ tự file shipping label đã lưu) để dùng cho Phần 2.

---

## Phần 2 — Xử lý trên Lecangs

> **4 SKU ngoại lệ (`838390` · `836390` · `816390` · `818390`) KHÔNG làm phần này.**

### Bước 1
`https://app.lecangs.com/oms/parcelOrder/add?type=add`

### Bước 2 — Điền

**Order Information**

| Ô | Giá trị |
|---|---|
| Delivery Warehouse | kho như đã điền ở UPS |
| Platform | **luôn** `The Home Depot` |
| PO # | số PO |
| Platform Order # | số PO |

**Consignee Address**

| Ô | Giá trị |
|---|---|
| Full Name | tên khách (**không** có `C/O` nếu là store) |
| City · Zip Code | như packing slip |
| Country | `United States (the)` |
| Address Line 1 / 2 | **giống luật ở UPS**: store → `C/O ...` + đường phố · khách lẻ → đường phố + trống |
| Phone | SĐT khách |
| State | tiểu bang, **định dạng giống trong packing slip** |

**Type** → chọn `Upload`

| Ô | Giá trị |
|---|---|
| Carrier | **luôn** `UPS` |
| Tracking # | Tracking Number **đầu tiên** theo thứ tự đã lưu |

→ **Click on the Upload** → chọn đúng file ShippingLabel **chứa Tracking Number vừa điền**
(**bắt buộc phải đúng**)

**Customs Declaration Information** → để trống

**Select the Good** → `Add the goods`

| Ô | Giá trị |
|---|---|
| SKU | SKU tương ứng với file vừa upload |
| Shipment Qty | **luôn `1`** |
| HS code | để trống |

→ **Save and Submit** (góc trái dưới)

### 🔴 QUAN TRỌNG
**Lặp lại Bước 1 và Bước 2 lần lượt với TỪNG Tracking Number cho đến hết.**
Mỗi Tracking Number = một đơn Lecangs riêng, `Shipment Qty` luôn = 1.

---

## Phần 3 — Riêng 4 SKU ngoại lệ (không qua Lecangs)

Sau khi xong phần UPS, ngoài các file ShippingLabel thì **lưu thêm packing slip** vào cùng folder.

---

## Kết quả cuối

Trong folder `PO - <PO>` của đơn Ground:

| Loại đơn | File trong folder | Lecangs |
|---|---|---|
| Thường | các ShippingLabel (mỗi SKU một file) | có — mỗi Tracking Number một đơn |
| **4 SKU ngoại lệ** | các ShippingLabel **+ PackingSlip** | **không** |

---

## 🔴 CÒN THIẾU — người dùng sẽ gửi

| # | Bảng | Dùng ở |
|---|---|---|
| ① | **Tiểu bang → danh sách kho** xếp theo gần nhất | Phần 1, Bước 2 |
| ② | **SKU → Weight per Package + Length/Width/Height** | Phần 1, Mục 2 |
| ③ | **Đối chiếu tên kho: Lecangs ↔ UPS** | Phần 1, Mục 1 |

Chưa có đủ ba bảng này thì **không cài đặt được**.
