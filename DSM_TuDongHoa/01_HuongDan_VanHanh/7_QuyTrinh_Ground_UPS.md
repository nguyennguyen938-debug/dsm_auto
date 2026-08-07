# QUY TRÌNH XỬ LÝ ĐƠN GROUND — UPS + Lecangs

Người dùng mô tả **06/08/2026**. Đây là bản chép lại nguyên văn quy trình, **chưa cài đặt gì**.

> ⚠️ **Quy trình này THAY ĐỔI quyết định cũ.** Trước đây (05/08) chốt "đơn Ground chỉ dừng ở mức
> có slip trên Drive", và `xu-ly-don.mjs` bỏ qua hoàn toàn đơn Ground. Nay đơn Ground **có quy
> trình riêng đầy đủ**: tạo shipping label trên UPS, đẩy đơn sang Lecangs, và **ghi Tracking
> Number vào cột N**. Code hiện tại CHƯA làm gì trong số này.

> ✅ **Đã có đủ bảng tra (07/08):** `05_TraCuu/warehouse_ranking_by_state.csv` ·
> `05_TraCuu/dims_sku.csv` (523 SKU, số liệu đã đầy đủ cho nhóm dự án dùng).
> Bảng đối chiếu tên kho **không cần** — Lecangs và UPS nay dùng cùng tên.

---

## Phần 1 — Xử lý trên UPS

### Bước 1: Đọc packing slip
Theo `1_DocPackingSlip.md`.

### Bước 2: Chọn kho

1. Dựa theo **tiểu bang**, tra `05_TraCuu/warehouse_ranking_by_state.csv` → danh sách kho xếp
   theo thứ tự **gần nhất → xa nhất**. 6 kho: `Calhoun` · `MEM-R` · `SAV` · `HOU07` · `NJF02` · `CAP`.

   ⚠️ File dùng **50 mã**: 48 bang lục địa + **`NCA`/`SCA`** (Bắc/Nam California), **KHÔNG có AK/HI**
   — y hệt `carrier.csv`. Packing slip chỉ ghi `CA`, nên phải ánh xạ.
   ✅ Kiểm 07/08: **`NCA` và `SCA` cho thứ tự kho GIỐNG HỆT nhau**
   (`CAP > HOU07 > MEM-R > Calhoun > SAV > NJF02`), nên `CA` **không cần phân vùng Bắc/Nam**
   — đúng như kết luận đã có với `carrier.csv`.
2. Vào `https://app.lecangs.com/oms/inventory`, điền **SKU** vào ô, ấn **Search** bên phải
   → hiện danh sách kho.
3. Chọn **kho còn hàng gần nhất** — xem cột **Available Stock** để biết còn hàng hay không.

> ❗ **Không kho nào còn hàng → DỪNG và HỎI NGƯỜI DÙNG.** Không tự chọn kho hết hàng.
> (Chốt 06/08; thực tế hiếm khi xảy ra.)

> ⭐ **4 SKU NGOẠI LỆ: `838390` · `836390` · `816390` · `818390`**
> Không cần chọn kho theo các bước trên — **mặc định kho Calhoun**.
> Bốn SKU này cũng **KHÔNG qua Lecangs** (xem Phần 3).

### Bước 3: Tạo shipping label trên UPS

**KHÔNG dùng URL `/ship/guided/destination?tx=...`** — `tx=` là **mã phiên**, hard-code sẽ hỏng.

Vào: `https://www.ups.com/ppc/dashboard.html?loc=en_US#/companyDashboard`
→ khối **Shipment Activity** → nút **Create a Shipment**.

### 🔐 Đăng nhập UPS — CÓ MFA (khác AACT)

Tài khoản `info@allforwood.com`. Sau khi nhập mật khẩu ấn **Continue**:
1. Trang **Verify Your Identity** → chọn **Email**
2. Vào Gmail `info@allforwood.com`, tìm thư từ **`noreply@id.ups.com`** → lấy mã
3. **BẮT BUỘC tích `Remember this device for 30 days`** — nếu không thì mỗi lần chạy đều phải
   lấy mã qua mail

> 🔴 **Hệ quả kỹ thuật 1 — PROFILE CỐ ĐỊNH.** "Nhớ thiết bị 30 ngày" gắn với **profile trình
> duyệt**, không gắn với tài khoản. Phải dùng `chromium.launchPersistentContext()` trỏ vào
> `11_TaiVe/.profile-ground`; mở context tạm là mất, MFA hỏi lại.
>
> 🔴 **Hệ quả kỹ thuật 2 — BẮT BUỘC CHẠY HEADFUL.** Khảo sát 07/08:
>
> | Cách gọi `www.ups.com` | Kết quả |
> |---|---|
> | `curl` trần | `ERR_HTTP2 INTERNAL_ERROR` |
> | `curl` + `sec-ch-ua`, `sec-fetch-mode`, `accept`… | **200** |
> | Playwright **headless** (kể cả đã đặt `userAgent` thật) | `ERR_HTTP2_PROTOCOL_ERROR` |
> | Playwright **headful trên `DISPLAY=:99`** | **✅ vào được** |
>
> Akamai của UPS lọc theo **dấu vết trình duyệt**, KHÔNG phải chặn IP — `aaacooper.com` và
> `app.lecangs.com` từ cùng VM này vẫn `200` bình thường. Đổi `userAgent` không đủ.
> → Nhánh UPS phải chạy **headful trên màn hình ảo Xvfb**, không dùng `headless: true` được.
> (Dựng màn hình bằng `10_VM_Tool/vnc.sh bat`.)

#### Mục 1 — Where

| Ô | Giá trị |
|---|---|
| **Ship From / Return To** | Ấn **edit** → mục **My address** ấn dropdown → chọn kho trùng với kho tìm được ở Bước 2 → **Continue**. ✅ Tên kho ở UPS và Lecangs **nay giống nhau** (chốt 07/08), không cần bảng đối chiếu |
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
| **Weight per Package** | `Carton Weight (lb)` trong `05_TraCuu/dims_sku.csv` |
| **Length · Width · Height** | `Carton Len/Wid/Hgt (in)` cùng file |
| **Total Package Value** | để trống |
| **Reference #1** | số PO |

→ **Continue**

#### Mục 3 — How

- **Do you need to schedule a pickup?** → `Schedule a new pickup`
- **Pickup Date** — theo **giờ Việt Nam tại thời điểm điền đơn**:
  - **Sau 15:00** → dùng đúng quy tắc như đơn Misc (hôm nay + T6 `+3` / T7 `+2` / còn lại `+1`)
  - **Trước hoặc đúng 15:00** → quy tắc Misc **rồi TRỪ 1 ngày**

  ✅ **Chốt 06/08:** áp dụng **đúng như công thức, KHÔNG bỏ Thứ Bảy/Chủ Nhật sau khi trừ.**
  Lý do: ngày được chọn theo **giờ Mỹ**, để phía Mỹ kịp chuẩn bị — trừ 1 ngày là bù chênh lệch
  múi giờ Việt Nam đi trước, không phải quy tắc nghiệp vụ.
  Ví dụ Thứ Sáu trước 15:00 VN: `+3` → Thứ Hai, `−1` → **Chủ Nhật**. Vẫn lấy Chủ Nhật.

  ❓ **CÂU HỎI CÒN MỞ:** quy tắc ±15:00 này **chưa quyết có áp cho đơn Misc hay không**.
  Hiện Misc vẫn dùng công thức cũ (không xét giờ). Người dùng dặn **hỏi lại**.
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
- **Luôn có ĐÚNG 1 trang hướng dẫn** (chốt 06/08) → bỏ trang 1, lấy từ trang 2 trở đi.
- Lưu **mỗi trang thành 1 file** vào folder `PO - <PO>`, tên:

  ```
  <SKU>_<số thứ tự bắt đầu từ 1>_ShippingLabel.pdf
  ```

  Số thứ tự giải quyết luôn trường hợp **một SKU có Qty > 1** (mỗi kiện một label, một tracking
  number) và trường hợp đơn có SKU trùng nhau.
  Ví dụ SKU `833250` Qty 2 → `833250_1_ShippingLabel.pdf` · `833250_2_ShippingLabel.pdf`
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

## Ghi vào sheet — đơn Ground CÓ điền, chốt 06/08

Trước đây đơn Ground không được ghi gì. Nay **có gọi `makeFolder` và có điền sheet** như đơn thường:

| Cột | Giá trị |
|---|---|
| C | `UPS` |
| E · F · G · H · I | như đơn thường, lấy từ packing slip |
| J | `X` |
| K | ngày pickup theo quy tắc ±15:00 ở trên |
| **N** | **TẤT CẢ Tracking Number trong CÙNG MỘT Ô**, mỗi số một dòng |
| P | link folder Drive |

> ✅ **Đơn Ground KHÔNG áp trần 20 đơn/ngày** — làm xong 07/08. Gọi `makeFolder` kèm
> **`boQuaTran: true`** (`webapp.mjs`: `makeFolder(po, ngay, true)`).
> Trần sinh ra để giới hạn số đơn LTL mỗi chuyến xe tải; đơn Ground đi UPS nên không liên quan.
> ⚠️ Web app **không tự đoán** được đơn nào là Ground (nó chỉ thấy `po` + ngày, không thấy
> Ship Via) — **bên gọi phải truyền cờ**. Quên là ngày bị dời và folder ngày đặt sai tên.
> **Cần Deploy ▸ New version.**

---

## Kết quả cuối

Trong folder `PO - <PO>` của đơn Ground:

| Loại đơn | File trong folder | Lecangs |
|---|---|---|
| Thường | các ShippingLabel (mỗi SKU một file) | có — mỗi Tracking Number một đơn |
| **4 SKU ngoại lệ** | các ShippingLabel **+ PackingSlip** | **không** |

---

## ✅ `dims_sku.csv` — đã có đủ số liệu (07/08/2026)

523 SKU. Tra bằng **Model Number NGUYÊN VẸN, GIỮ hậu tố `-B`**.

> ⛔ **KHÔNG bỏ hậu tố `-B` rồi tra bản số.** Đó là **sản phẩm khác**:
> ```
> 812250     26x26x3   31 lb   "Hevea Butcher Block Counter Top - 2FTx25""   ← tấm 2 ft
> 812250-B  146x27x2  128 lb   "12Ft Unfinished Hevea Butcher Block"         ← tấm 12 ft
> ```
> `skuTuModel()` trong `bol-tinh.mjs` **CÓ** bỏ hậu tố — đúng cho `pallet.csv`, **SAI cho file này**.
> Nhánh Ground phải tra bằng chuỗi Model Number gốc.

**Đối chiếu chéo với `pallet.csv` — 10/10 khớp tuyệt đối:**

| | |
|---|---|
| `Carton Weight` của bản `-B` | **bằng đúng cột K** (Packaged Gross Weight) của `pallet.csv` |
| `Carton Len` | **= chiều dài sản phẩm (cột C) + 2 in**, đều đặn cả 10 dòng |

Điều này cũng giải thích công thức cũ: BOL của đơn Misc dùng `Σ(K×Qty) + 55`, trong đó `K` là
cân nặng **một thùng** còn `+55` là **pallet**. Đơn Ground đi UPS từng thùng lẻ, không có pallet,
nên `Weight per Package` = **đúng `Carton Weight`, KHÔNG cộng 55**.

Còn 125/523 SKU vẫn để `0` — đều **không thuộc nhóm dự án dùng**. Gặp SKU như vậy thì gạt sang
danh sách chờ, đừng gửi `0` lên UPS.

## ❓ Câu hỏi còn mở

1. ~~Quy tắc ±15:00 có áp cho Misc không?~~ → **KHÔNG** (chốt 07/08). Misc giữ công thức cũ.
2. ~~`makeFolder` cần đường bỏ trần cho Ground~~ → **xong 07/08** (`boQuaTran`), **cần deploy**.
3. ~~Lecangs có MFA không?~~ → **KHÔNG**, user + password thường (chốt 07/08).
4. ~~Số liệu carton cho SKU `-B`~~ → **đã có đủ 07/08**, đối chiếu `pallet.csv` khớp 10/10.

---

## 🔴 UPS ĐÃ ĐỔI GIAO DIỆN TẠO SHIPMENT (khảo sát 07/08/2026)

Quy trình ở trên viết theo giao diện **CŨ** (Where / What / How / Details / Payment, bấm
Continue qua từng bước). Vào `https://www.ups.com/ship?loc=en_US` bây giờ ra giao diện **MỚI**:

| Tài liệu (cũ) | Giao diện mới |
|---|---|
| Mục 1 **Where** | 1 **Addresses** — hai tab `ship-from-tab_btn` / `ship-to-tab_btn` |
| Mục 2 **What** | 2 **Packages** |
| Mục 3 **How** | 3 **Delivery Options** + **Pickup or Drop-off** |
| Mục 4 **Details** | *(không còn)* |
| Mục 5 **Payment** | 5 **Payment Method** |

Năm mục **dồn trên một trang**, không bấm Continue nữa.

**Người dùng chốt 07/08: dùng giao diện CŨ** — bấm `Go to Previous Experience` trên trang mới.

### Bẫy đã gặp khi tự động hoá trang này

1. 🔴 **`id` BỊ TRÙNG.** `#go-back-to-previous-experience-btn` khớp **2 phần tử**: thẻ bọc
   Angular `<app-ups-cta>` và `<button>` thật bên trong. Playwright báo *strict mode violation*.
   → Phải chỉ đích danh `button#go-back-to-previous-experience-btn`.
   (Cùng họ với bẫy 2 nút `Continue` ở trang đăng nhập Auth0 và 3 phần tử "Go" trên DSM.)

2. 🔴 **Hộp thoại xác nhận dùng shadow DOM đóng.** Sau khi bấm nút trên, hiện hộp
   *"Are you sure you want to cancel?"* với hai nút **Yes / No**. `querySelectorAll`,
   `getByRole`, `getByText` đều **không** thấy hai nút đó (0 phần tử).
   → Chưa có cách bấm bằng code. Hiện phải **bấm tay trong VNC**.

### `id` của giao diện MỚI (ghi lại phòng khi sau này UPS bỏ giao diện cũ)

```
shipTo-name · shipTo-contactName · shipTo-phone · shipTo-email
singleaddress1 (name của ô địa chỉ; id của nó là "shipTo-Address poBox-error-message" — id rác)
agentShipTo_residential_address (checkbox residential)
package-section-1-weight / -length / -width / -height / -reference
addAnotherPackageBtn · duplicatePackageBtn0
btn_shipTo-saved-address-enterNewAddress · btn_shipTo-country-dropdown-countryName
btn_package-section-1-packaging · btn_AccountDropdown-selectUpsAccount
```

⚠️ URL có `?tx=<mã phiên>` — **đúng như tài liệu đã cảnh báo, KHÔNG hard-code**.


---

## 🔴 MỤC 5 PAYMENT — `12C8D2` / `92571` BỊ UPS TỪ CHỐI (07/08/2026)

Điền đúng như tài liệu (`Third Party`, account **`12C8D2`**, ZIP **`92571`**) rồi bấm **Review**
thì trang báo `250002 - A general system error has occurred`.

Bắt phản hồi API thì thấy lỗi thật **không phải "general system error"**:

```
POST /api/LookupAndValidation/ValidateAccounts
{"code":"250002","description":"Invalid Authentication Information.",
 "source":"ValidateAccounts","serviceMethod":"ValidateAccounts"}
```

Tức UPS **không xác thực được cặp số tài khoản + ZIP của bên thứ ba**.

**Đã loại trừ:**
- ❌ *Không* phải do dữ liệu mẫu / địa chỉ giao giả — lỗi đến từ `ValidateAccounts`,
  không đụng gì tới địa chỉ người nhận. (Đây là giả thuyết đầu tiên và nó **SAI**.)
- ❌ *Không* phải do ô Country — nó vẫn đang `United States`, không phải `Select One`.
- ✅ `/api/Session/UpdateShippingContext` trả `isValid:true` — Mục 1–4 hợp lệ.

### ⛔ SỬA LẠI — KẾT LUẬN TRÊN LÀ SAI (cùng ngày)

Người dùng phản bác: *"những lần mới đây nhất tôi dùng thì vẫn làm được bình thường và
bây giờ vẫn vậy."* Kiểm lại thì **người dùng đúng**.

**PHIÊN UPS ĐÃ HẾT HẠN** trong lúc khảo sát — tab rơi về `/lasso/login` và Akamai trả
`Access Denied`; cookie `auth0` (hạn ~5 tiếng) đã hết.

Mà thông điệp lỗi là **`"Invalid Authentication Information"`** — đọc đúng nghĩa đen thì
đó là **lỗi xác thực PHIÊN**, không phải lỗi số tài khoản. Tôi thấy nó nằm trong
`ValidateAccounts` rồi gán bừa cho `12C8D2`.

→ **`12C8D2` / `92571` chưa có bằng chứng nào là sai.** Giữ nguyên như tài liệu gốc.
→ Phải chạy lại toàn bộ Mục 1→Review **với phiên còn sống** mới biết có qua được không.

🔴 **BÀI HỌC**: mã lỗi hiện trên trang (`250002 - A general system error`) và mô tả trong
API (`Invalid Authentication Information`) đều mơ hồ. **Trước khi đổ lỗi cho dữ liệu,
kiểm phiên còn sống không.** Đây là lần thứ ba trong ngày kết luận vội về cùng một
triệu chứng — hai lần trước là đổ cho IP datacenter và cho rằng có lối đăng nhập khác.

⚠️ Tài khoản **gửi** thì đã chốt: **để nguyên mặc định** (`1741XG`), không đụng vào.


---

## ✅ CHẠY THÔNG MỤC 1 → REVIEW (08/08/2026)

Chạy thật, dừng đúng trước `Pay and Get Label(s)`:

```
Muc 1 Where     THD TEST RECIPIENT · 1234 MAIN ST · AUSTIN TX 78701 · 5125551234
residential     Yes
Muc 2 What      qty 1 · 31 lb · 26x26x3 · Reference #1 = 02562579
Muc 3 How       8/11/2026 · 1:00 PM–5:00 PM · Warehouse · ref 02562579 · UPS Ground
Muc 5 Payment   Third Party · 12C8D2 · 92571
Review          KHONG CO LOI -> hien nut "Pay and Get Label(s)"

ValidateAccounts       -> {"isValid":true,"errors":[]}
UpdateShippingContext  -> {"isValid":true}
```

🔴 **`12C8D2` / `92571` HỢP LỆ.** Lỗi `250002` hôm 07/08 là do **phiên UPS hết hạn**,
không phải sai tài khoản — người dùng đã phản bác đúng.

### Cách vượt qua chặn Akamai ở `/lasso/login`

Akamai chặn **riêng trang đăng nhập** với trình duyệt trên VM (profile mới, Firefox,
bỏ CDP — thử hết đều chặn; `curl` không cookie thì `302` bình thường).
**Cách đi vòng đã kiểm chứng:** người dùng đăng nhập trên máy mình → DevTools ▸ Network ▸
`Copy as cURL` → tách header `Cookie:` → nạp vào `.profile-ground` trên VM.

Hai điều đo được:
- **Phiên UPS KHÔNG ràng buộc theo IP** — cookie tạo ở IP nhà dùng tốt trên IP Google Cloud
- Có phiên rồi thì **không bao giờ chạm `/lasso/login`**, nên chặn kia thành vô hại

### Ba bẫy khi tự động chuyển về giao diện cũ

1. Nút **`Create a Shipment` mở TAB MỚI** — trang cũ ở lại dashboard, mọi thao tác sau đó
   tác động nhầm trang rồi timeout khó hiểu. `vaoFormCu()` bắt tab mới và **trả về `page`**;
   bên gọi PHẢI dùng trang trả về.
2. Nút xác nhận ghi **"Return to Previous Experience"** (`#prevExperience`), KHÔNG phải
   Yes/No. Bản trước ghi "shadow DOM đóng, không bấm được bằng code" — **SAI**, do tìm
   nhầm chữ và bắt nhầm sang hộp *"Are you sure you want to cancel?"*.
   Trang có **rất nhiều `[role=dialog]` dựng sẵn** — phải lọc theo NỘI DUNG.
3. `locator.click()` kể cả `force:true` **vẫn rơi vào lớp phủ** của hộp thoại, handler
   không chạy. Phải gọi `el.click()` bằng JS.


---

## ⏱️ PHIÊN UPS CHUYỂN TỪ MÁY NGƯỜI DÙNG CHỈ SỐNG ~30 PHÚT (đo 08/08)

Nạp cookie lúc **00:05**, tới **00:32** đã chết (`conPhien()` -> `song:false`,
dashboard bị đẩy về `/lasso/login`). Cookie `session_ups_com` biến mất khỏi profile.

**Hệ quả cho cách làm:**
- Cửa sổ dùng được rất hẹp. **Đừng vừa khảo sát vừa làm** — khảo sát ăn hết thời gian.
- Trước khi chạy đơn thật: xin cookie mới, rồi **chạy ngay**, không làm gì khác trước đó.
- `chayFormUps()` đã có `conPhien()` chặn đúng ca này: phiên chết thì DỪNG, không lặp.

## 📋 Bước `/ship/guided/origin` (Ship From) — MỚI, chưa xong

Shipment **mới hoàn toàn** bắt đầu ở đây, không phải `/destination`. Trước giờ không gặp
vì luôn dùng lại `tx` đã có sẵn origin.

`id` khảo sát được (lúc phiên ĐÃ CHẾT nên form ở chế độ khách):

```
origin-cac_country · origin-cac_companyOrName · origin-cac_contactName
origin-cac_singleLineAddress · origin-cac_email · origin-cac_phone
origin-singleLineAddressEditButton      (mở rộng địa chỉ, giống bên destination)
returnSwitch                            ("Use a different return address?")
nbsBackForwardNavigationContinueButton
```

Bố cục giống hệt `destination-cac_*`, chỉ đổi tiền tố.

🔴 **CÒN THIẾU — phần quan trọng nhất.** Tài liệu ghi Ship From phải **ấn `edit` → mục
`My address` → chọn kho**. Danh sách kho đó **chỉ hiện khi ĐÃ ĐĂNG NHẬP**. Lúc khảo sát
phiên đã chết nên trang ở chế độ khách (`#anonymous-profile`, "Log In / Sign Up"), không
thấy dropdown kho. **Phải khảo sát lại với phiên còn sống.**
