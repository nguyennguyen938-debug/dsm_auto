# Prompt tiếp tục — dán vào đầu phiên mới

Tôi tiếp tục dự án tự động hoá đơn dropship Home Depot (DSM AllForWood).
Bạn SSH thẳng vào VM: `ssh 136.111.186.129` — không cần khoá, không cần `Lenovo@`.

## THƯ MỤC
`/home/Lenovo/dsm_auto/DSM_TuDongHoa` (git, nhánh main)

## ĐỌC TRƯỚC KHI LÀM
1. `CLAUDE.md` — quy tắc bắt buộc, hằng số, bản đồ file
2. `00_BanGiao_PhienMoi_08082026.md` — trạng thái, bẫy đã gặp
3. `10_VM_Tool/README.md` — cách chạy từng tool
4. File này — những gì đổi trong ngày 11/08/2026

---

## TÁCH LUỒNG THEO SHEET — chốt tối 11/08/2026

🔴 **PHÂN LOẠI THEO KHO, KHÔNG THEO HÃNG VẬN CHUYỂN.** Tôi đã gán ngược một lần vì
SKU ngoại lệ cũng đi UPS, mà "đi UPS" ở chỗ khác lại là dấu hiệu của B2C:

```
kho Lecangs (CAP · SAV · NJF02 · HOU07 · MEM-R)  ->  B2C
kho Calhoun (NOTS, 4 SKU ngoại lệ)               ->  B2B
```

**Ba tầng**, mỗi tầng một lệnh:

| Lệnh | Chạy trên | Xử lý |
|---|---|---|
| `xu-ly-don.mjs` · `xu-ly-ground.mjs` | `Order List` | Mọi đơn thường. Đơn HỖN HỢP → **chỉ tích `X` cột T** |
| `xu-ly-don.mjs --sheet b2b` | sheet B2B (gid `1948139859`) | Đơn `T=X` → phần **Calhoun** → BOL, cột C **TRỐNG** |
| `xu-ly-ground.mjs --sheet b2c` | sheet B2C (gid `768845312`) | Đơn `T=X` → phần **Lecangs** → label UPS + Lecangs |

Tool sheet con chỉ nhận đơn **đã có X** ở `Order List`, và bỏ qua đơn đã có link Drive
ở sheet của mình (cột C để trống nên không dùng làm dấu "đã xử lý" được).

An toàn được là nhờ luật copy: với `T = X`, `copyB2B_B2C` **chỉ chạm đúng ô A và ô T** —
dữ liệu tool ghi không bị lượt copy sau đè. Có test canh (`test_CopyB2B_B2C.js`, ca 7).

**Bốn chỗ dễ sai đã xử lý:**
- Tích `X` **trước** khi ghi dữ liệu — ghi trước mà tích X hỏng thì nửa kia của đơn mất dấu
- Đơn hỗn hợp **bỏ qua luật Ground/SKU-luôn-UPS**, nếu không phần B2B của `81944554`
  (slip ghi Ship Via = Ground) bị kéo sang nhánh "chỉ điền sheet", không có BOL nào
- `kiemQty` so **tổng qty cả đơn**, không phải qty phần đang xử lý (báo lệch oan 1 vs 2)
- Dấu "đã xử lý" của phần B2B là **cột P sheet B2B**, vì cột C để trống nên không dùng được

## CỘT T = "B2B and B2C" — luật mới chiều 11/08

Cột thứ **20** (R, S bỏ trống). `X` = packing slip có **SKU hỗn hợp**, cần cả hai luồng,
và **chưa xử lý** — không BOL, không Drive, không carrier.

| Ai | Làm gì |
|---|---|
| `xu-ly-don.mjs` | Nhận ra đơn hỗn hợp → gọi `danhDauB2B_B2C` → tích `X` cột T → **bỏ qua đơn** |
| `CopyB2B_B2C.gs` | Thấy `X` → copy sang **cả hai** sheet, chỉ chép **A, B, T**, không xoá khỏi sheet nào |

Hai kiểu hỗn hợp, đều là ví dụ người dùng đưa:
- **trộn carrier** — có SKU trong `SKU_LUON_UPS` (B2C) lẫn SKU thường (B2B)
- **trộn kho** — có SKU trong `SKU_NGOAI_LE` (kho Calhoun) lẫn SKU thường (kho Lecangs)

🔴 Cột T phải kiểm **TRƯỚC** cột C: đơn hỗn hợp có cột C trống, mà luật cũ
"cột C trống → chờ lượt sau" sẽ nuốt mất nó vĩnh viễn.

---

## ✅ ĐÃ GỠ: PO 81944554 — đơn 2 SKU đầu tiên

**Luật người dùng chốt:** đơn hỗn hợp thì **luồng B2C chỉ xử lý phần B2C**; phần B2B
để luồng B2B làm sau. Gỡ đúng chỗ kẹt "một shipment UPS chỉ có một `ShipFrom`".

```
816390-B   SKU ngoại lệ → kho Calhoun (B2C)   ✅ label THẬT 1Z1741XG0306175877 — XONG
818250-B   → kho Lecangs CAP        (B2B)     ⏳ để luồng B2B, KHÔNG phải việc của luồng UPS
```

`xu-ly-ground.mjs` lọc `d.items` còn phần B2C (SKU thuộc `G.SKU_NGOAI_LE`) trước khi
tra kho và tạo kiện. Đơn nào **toàn** SKU ngoại lệ, hoặc **toàn** SKU thường, thì không
lọc gì — giữ nguyên như trước.

---

## ĐÃ ĐỔI HÔM NAY (11/08/2026)

### Lỗi nghiêm trọng đã sửa
- **`SHIP QUANTITY ON PACKING SLIP` = Quantity Ordered**, không phải cờ `1`.
  Tài liệu cũ ghi sai → 5 đơn in slip thiếu số lượng → BOL sai cân, sai class.
  `dsm.soLuongDat()` đọc cột `QUANTITY ORDERED` từ trang reprint.
  Thêm lớp kiểm chéo: `11_TaiVe/qty/<PO>.json` ghi lúc submit, `xu-ly-don` đối chiếu.
- **`docSlip` chỉ đọc dòng hàng ĐẦU TIÊN** → đơn 2 SKU chỉ tạo 1 label.
  PDF xoay 90°, mỗi dòng hàng là một cột `x`; bộ lọc cũ giới hạn `x < lb.x+30`.
  `docDongHang()` đọc đủ. 35/35 slip đọc được.
- **`#PKGS` = tổng Qty**, không cố định `1` (`fill_bol.py`). `HANDLING UNIT` vẫn `1`.

### Quyết định nghiệp vụ người dùng chốt
- **Tạm ngưng chọn carrier cho đơn B2B** — cột C ghi `NULL`, BOL để trống carrier.
  Cờ `NGUNG_CHON_CARRIER_B2B` trong `xu-ly-don.mjs`, đặt `false` là về luồng cũ.
  ⚠️ Hệ quả: nhánh AACT Finalize **không chạy** → PRO của AACT không tự về.
- **Ngưng tự điền cột K cho đơn Misc** (`NGUNG_DIEN_K_CHO_MISC`). Ground vẫn điền.
- **Bang AK/HI: xử lý bình thường** (chốt chiều 11/08) — carrier `NULL`, vào B2B.
  Chốt chặn cũ nằm sai chỗ (ở khâu đọc slip); nay chuyển về đúng `chonCarrier()`.
  Đơn đầu tiên đi qua: `53579205` Hilo HI, hàng 307. Nhánh Ground vẫn dừng ở AK/HI.
- **4 SKU luôn đi UPS**: `836390-B` `838390-B` `836390` `838390` — khớp TUYỆT ĐỐI cả chuỗi.
- **KHÔNG đặt pickup** (`TAO_PICKUP=false`). Home Depot đã trả lời chính thức:
  *"Home Depot does not cover pickup fees. Suppliers are responsible."*
- **BOL trên AACT chưa có hiệu lực tới khi gửi mail** → tạo lại BOL không gây hậu quả.
- **Lecangs: bỏ mọi hậu tố, chỉ lấy phần số** (`maLecangs()`), gộp tồn kho theo kho.
  ⚠️ `dims_sku.csv` thì NGƯỢC LẠI — giữ nguyên hậu tố (`812250` 31lb ≠ `812250-B` 128lb).
- **Copy B2B/B2C — ba mức, chốt chiều 11/08** (bản `2026-08-11e`), chỉ quét 40 đơn cuối:
  | Cột C ở `Order List` | Sheet đích | Chép cột nào |
  |---|---|---|
  | `UPS` | B2C | **toàn bộ 17 cột** |
  | `NULL` | B2B | **chỉ A, B, P** — và cột được chép mà gốc trống thì giữ giá trị cũ |
  | carrier thật khác UPS | B2B | toàn bộ trừ C/L/N/O |

  Test: `node 02_AppsScript/test_CopyB2B_B2C.js` (sheet giả, 22 kiểm tra).

### Nhánh UPS đã hoàn chỉnh
`ups-api.mjs` (OAuth) · `ups-ship.mjs` (label, nhiều SKU) · `ups-pickup.mjs` (tắt mặc định)
· `xu-ly-ground.mjs` (slip → tồn kho Lecangs → label → Drive → sheet → Lecangs).
Chạy thật: `DSM_UPS_ENV=prod node 10_VM_Tool/xu-ly-ground.mjs --that --only <PO>`

---

## TRẠNG THÁI HỆ THỐNG

| | |
|---|---|
| Cron xử lý đơn | ▶️ **BẬT LẠI chiều 11/08** — `*/5 0-7,9-23` + `0,5,…,55 8` (nghỉ 8:25–8:45 tránh cron Wayfair) |
| Trigger `copyB2B_B2C` | ⏸️ người dùng gỡ bằng `TAT_trigger` — bật lại bằng `BAT_trigger` sau khi dán bản `11e` |
| `giu-session.sh` · `don-dep.sh` | ▶️ vẫn chạy |
| Phiên DSM | sống ~115h — `giu-session` có tác dụng, giữ cron này |
| Phiên Lecangs | nạp bằng cookie (`nap-cookie.mjs`), hết hạn thì xin cookie mới |
| Phiên UPS | **không cần** — đã chuyển sang API |
| Git | ⚠️ **toàn bộ thay đổi 11/08 CHƯA COMMIT** |

---

## QUY TẮC QUAN TRỌNG NHẤT

1. **Máy chạy chung `/opt/wayfair`.** TUYỆT ĐỐI không `pkill`/`pgrep`. Giết theo PID đã
   lọc, và **loại trừ chính lệnh của mình** — grep dòng lệnh chứa cả hai từ khoá sẽ tự
   khớp chính nó (suýt sập lần thứ tư ngày 11/08).
2. **Đo trước, kết luận sau.** Tôi đã sai nhiều lần trong ngày vì suy từ một dấu hiệu:
   "2 dòng phí → không ai gọi xe" (sai), "cookie mất → hết phiên" (thật ra `SingletonLock`).
3. **Việc không hoàn tác được thì để lại dấu vết NGAY**: `run.mjs` manifest ·
   `aact/<PO>.json` · `ups/<PO>.json` · `qty/<PO>.json`.
4. **Không nhập/lưu mật khẩu.** Lecangs đã có 6 lần đăng nhập sai; chỉ thử một lần rồi dừng.
5. Trả lời **ngắn gọn, tiếng Việt**. Phát hiện gì thì ghi vào tài liệu tương ứng.

## ĐÃ CHẠY THẬT TRÊN PRODUCTION (11/08, tối)

| PO | Kho | Tracking | Sheet | Đơn Lecangs |
|---|---|---|---|---|
| **81925064** | CAP | `1Z1741XG0321761286` (label 4×6) | hàng 300 | ✅ `WOOD-260812-00001` — **Received** |
| ~~81925064~~ | ~~CAP~~ | ~~`1Z1741XG0335133278`~~ (label 8.5×11) | — | ⛔ `WOOD-260811-00066` — **Voided** |
| 79858751 | SAV | `1Z1741XG0305340010` | hàng 281 | ✅ `WOOD-260811-00067` — **Received** |
| 79882730 | NJF02 | `1Z1741XG0316557025` | hàng 282 | ✅ `WOOD-260811-00068` — **Received** |
| 81944554 | Calhoun | `1Z1741XG0306175877` | hàng 301 | — (SKU ngoại lệ không qua Lecangs) |

### 🔴 Hai bẫy tìm ra ở lần Submit đầu tiên

**1. Modal "Submit Confirmation" làm đơn nằm lại ở Draft.** Bấm `Save & Submit` xong,
Lecangs hiện hộp *"The blank part of the file is too large, please download the standard
label or force submission"*. Không bấm qua thì đơn **lưu Draft** — log trông như đã gửi,
kho không bao giờ thấy đơn. `taoDonParcel()` nay tự bấm Submit khi gặp **đúng** hộp này;
hộp lạ thì dừng và báo.

**2. Gốc rễ: label UPS thiếu `LabelStockSize`** → UPS trả PDF khổ **Letter 8.5×11**, tem
4×6 nằm nửa dưới, nửa trên trắng. Đã thêm `{ Height: '6', Width: '4' }` vào `ups-ship.mjs`;
đo lại: label mới đúng **4.00×6.00 inch** và **không còn hiện modal** ở Lecangs.
Label tạo TRƯỚC mốc này vẫn khổ cũ.

**3. Đừng đo "đã gửi" bằng URL.** Sau khi submit thành công, trang **vẫn ở**
`/parcelOrder/detail/...?type=edit`. Bản đầu tôi coi "rời khỏi trang add = đã gửi" nên
mọi đơn gửi thành công đều bị ghi là thất bại → lần chạy sau tạo đơn thứ hai.
Nay kiểm bằng `traDonTheoTracking()`: đọc **trạng thái trong danh sách** (`Received`).

Bằng chứng chống trùng: `11_TaiVe/lecangs/<PO>_<tracking>.json`, một file mỗi tracking.

`81925064` là lần đầu chạy **trọn luồng**, không ép kho: tra tồn kho Lecangs thật →
`814300` chỉ có ở **CAP=52 · NJF02=6**, trong khi bảng ưu tiên của TX xếp
`HOU07>MEM-R>Calhoun>SAV>CAP` — bốn kho đầu KHÔNG có hàng. Đây là bằng chứng sống
cho luật "đừng ép kho theo bảng ưu tiên".

✅ **`Save & Submit` trên Lecangs ĐÃ chạy thật** (11/08, người dùng chốt "tạo thật đi").
Ba đơn đều `Received`. Vẫn cần cờ `--lecangs-that` — mặc định luôn tắt.

## 🔴 BẢNG THỨ TỰ KHO — người dùng sửa lại toàn bộ 11/08/2026

`05_TraCuu/warehouse_ranking_by_state.csv` bản cũ **sai ở cả 50 bang**: MEM-R nằm rải
khắp vị trí 1–4, trong đó **11 bang lấy MEM-R làm kho gần nhất** (AR · IA · IL · KS ·
MN · MO · MS · ND · NE · SD · WI). Luật thật: **MEM-R LUÔN ở vị trí 6**, không ngoại lệ.

Bản cũ giữ ở `11_TaiVe/warehouse_ranking_by_state.cu-11082026.csv`.
Test canh: `node 10_VM_Tool/test-ground-tra.mjs` (40 pass) — có 3 bất biến cho bảng này.

✅ **Bốn đơn đã chạy hôm nay không bị ảnh hưởng** — đã đối chiếu lại từng đơn với bảng mới.
⚠️ Sai kiểu này **không tự lộ ra**: label vẫn in bình thường, chỉ là hàng đi từ kho xa hơn.

## HUỶ VẬN ĐƠN UPS THỪA — `huy-ups-thua.mjs` (thêm 11/08)

Tạo lại label thì vận đơn cũ **vẫn sống trên UPS**. Hai nhãn cùng hiệu lực cho một kiện
hàng, bản in cũ lọt tới kho là hàng đi theo nhãn sai. Phải void.

```bash
DSM_UPS_ENV=prod node 10_VM_Tool/huy-ups-thua.mjs --dry     # xem truoc
DSM_UPS_ENV=prod node 10_VM_Tool/huy-ups-thua.mjs --that    # huy that
```

Void **không hoàn tác** nên có bốn cổng: bằng chứng phải là `<PO>.cu-*.json` · chưa có
`daHuy` · tracking khác với `<PO>.json` đang dùng · **và không khớp cột N của sheet**.
Cổng cuối quan trọng nhất — sheet là thứ kho và người vận hành đọc.

Đã huỷ: `1Z1741XG0335133278` (81925064) · `1Z1741XG0306175877` (81944554) — cả hai `Voided`.

## Bug cột I = "undefined" (sửa 11/08, người dùng phát hiện)

`xu-ly-ground.mjs` gửi `sku: kien.model` và `qty: String(kien.qty)` — nhưng **`kien` là
MẢNG**, nên cả hai là `undefined`.

Hai cột hỏng theo hai kiểu khác nhau, và đó là lý do lỗi khó thấy: `fillRow` bỏ qua giá
trị `null`, nên cột G chỉ **để trống**; còn `String(undefined)` ra chuỗi `"undefined"` —
không rỗng — nên cột I **ghi hẳn chữ đó vào sheet**.

Nay: `kien.map(k => k.model).join('\n')` / `.qty` / `items.map(i => i.moTa)` — mỗi dòng
hàng một dòng trong ô, cùng quy ước với cột N.

## VIỆC CÒN TREO
- PO `81944554` (ở trên)
- 5 đơn từng in slip thiếu số lượng: `06561441` · `79945693` · `25567870` (BOL AACT thật)
  — chưa hỏi kho đã xuất mấy kiện
- Lecangs `Save & Submit` **chưa chạy thật lần nào** (mới điền form rồi dừng)
- Cập nhật tài liệu + commit toàn bộ thay đổi 11/08
