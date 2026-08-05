# BÀN GIAO SANG MÁY MỚI — DSM AllForWood

Cập nhật: 28/07/2026

## 0. Ý CHÍNH: gần như KHÔNG có gì để "chuyển"

Toàn bộ phần **tự động** nằm trên cloud, gắn với **tài khoản**, không gắn với máy:

| Thành phần | Nằm ở đâu | Đổi máy có ảnh hưởng? |
|---|---|---|
| Google Sheet "Lowes, THD - Xuan Follow" | Google Drive | Không |
| Folder Drive cha (chứa các folder `<PO>`) | Google Drive | Không |
| Project Apps Script **AFW-DSM** + 5 file `.gs` | script.google.com | Không |
| 4 trigger tự động | Google (chạy trên server Google) | Không — vẫn chạy dù máy tắt |
| Web app `/exec` | Google | Không |
| Hộp thư info@ / b2b@ / rithumgetorder@ | Gmail | Không |

→ Bàn giao tài khoản là đủ để hệ thống tự động **tiếp tục chạy không gián đoạn**. Máy mới chỉ cần dựng lại phần *con người + Claude* ngồi vận hành.

Thứ **thật sự** phải mang theo: **folder `DSM_TuDongHoa`** (hướng dẫn + mã nguồn `.gs` + form BOL + bảng tra). Đây là bộ nhớ của dự án — mất nó thì mọi kinh nghiệm đã tích luỹ phải học lại từ đầu.

---

## 1. MANG THEO GÌ

Copy nguyên folder `DSM_TuDongHoa` sang máy mới (USB / Drive / OneDrive đều được), giữ đúng cấu trúc:

```
DSM_TuDongHoa/
├─ 00_README.md
├─ 00_BanGiao_MayMoi.md          ← file này
├─ 01_HuongDan_VanHanh/          ← playbook từng carrier (QUAN TRỌNG NHẤT)
├─ 02_AppsScript/                ← 5 file .gs đang chạy + hướng dẫn cài
├─ 03_TienDo_NhatKy/
├─ 04_BOL_Form/                  ← BOL_Form.html, fill_bol.py, các BOL đã tạo
├─ 05_TraCuu/                    ← carrier.csv, class.csv, pallet.csv
└─ 06_File_Cu_KHONG_DUNG/        ← ⚠️ ĐỪNG dán lên Apps Script (xem mục 5)
```

Không cần mang: file `.png` ảnh chụp tạm, `__pycache__`, PDF đã upload lên Drive.

---

## 2. THÔNG TIN CẦN GIỮ (ghi lại chỗ an toàn)

| Khoá | Giá trị |
|---|---|
| Sheet ID | `1Fzwr2GDHOHxMgqPNf-Ksf6qJ5IIl3mNzrOQrHqH57fo` |
| Tab | `Order List` (dữ liệu từ hàng 7) |
| Drive folder gốc | **"THD Orders"** `1hsWarcdjtK63CD8As9CtXqJTcUPg8oAw` — cây `THD Orders/<DD Mon YYYY>/PO - <po>/SIGNED PRO#` (đổi 01/08/2026) |
| Drive folder cũ | ~~`1ER7RWu-66baF1uvB4AuBByN7OS-FJdAI`~~ — cấu trúc phẳng, đã bỏ, chưa dọn |
| Apps Script project | `AFW-DSM`, id `1SVhEOV5leNMVPOF-iSyEVAf3XfuKQts933M_Q5Fsk3-a7CF0Z62uDial` |
| Web app URL | `https://script.google.com/macros/s/AKfycbzzJCEgWBcO76OcbhJIdiHGlJEgbWxq7FFEGbIwwpQe2gmtOalVOXziJXFyuI1Ckrtn-Q/exec` |
| Kho (thật) | `mariop@notslogistics.com` |
| Địa chỉ test | `nguyen.nguyen938@hcmut.edu.vn` |

**Trigger nào thuộc tài khoản nào** — sai chỗ này là hệ thống chết âm thầm:

| Hàm | Chu kỳ | Phải do tài khoản này tạo | Lý do |
|---|---|---|---|
| ~~`processOrders`~~ | — | **ĐÃ XOÁ 04/08/2026** | mail báo kho đã bỏ, kho tự vào Drive xem. **Không tạo lại.** |
| `fillPro` | 15 phút | **info@** | tra web carrier |
| `checkMarioPro` | 15 phút | **b2b@** | đọc mail PRO trong hộp b2b@ |
| `checkRithumOrders` | 10 phút | **rithumgetorder@gmail.com** | đọc mail đơn mới |

> Một số chỗ trong `00_README.md` và `HuongDan_CaiDat_AppsScript_Moi.md` mục 5b từng ghi `checkRithumOrders` chạy bằng **b2b@** — SAI, đã sửa 28/07/2026. Bảng trên là bản đúng.

---

## 3. LÀM GÌ TRÊN MÁY MỚI

1. **Đăng nhập Chrome** bằng profile của **info@allforwood.com**. Đăng nhập sẵn các web carrier: AACT, Central Transport (CTII), CommerceHub DSM.
   *Mật khẩu do bạn tự nhập — Claude không nhập và không lưu mật khẩu.*
2. **Cài tiện ích Claude in Chrome**, bật quyền cho các domain: `aactcorp.com`, `centraltransport.com`, `xgsi.com`, `braunsexpress.com`, `script.google.com`, `docs.google.com`, `drive.google.com`.
3. **Cài Claude desktop**, đăng nhập tài khoản Claude đã bàn giao, mở **Cowork** và **chọn (mount) folder `DSM_TuDongHoa`**. Bước này bắt buộc — nếu không mount, Claude không đọc được playbook và sẽ làm lại từ số 0.
4. Câu mở đầu phiên làm việc đầu tiên nên là: *"Đọc `00_README.md` và `01_HuongDan_VanHanh/` trước khi làm gì."*

Không cần cài Python/WeasyPrint/pdftotext — chúng chạy trong sandbox Linux của Claude, không phải trên máy bạn.

---

## 4. KIỂM TRA SAU KHI CHUYỂN (5 phút)

Chạy lần lượt, đọc Execution log:

| Bước | Chạy bằng | Hàm | Kết quả đạt |
|---|---|---|---|
| 1 | info@ | `DIAG_mail` | `WHNotif=13 ✅ BẢN MỚI`, có trigger `processOrders`, dòng cuối `✅ SẼ GỬI (n)` |
| 2 | info@ | `DIAG_pro` | `PRO=14 ✅ BẢN MỚI (N)`, đơn cũ ra được số PRO |
| 3 | rithumgetorder@ | `DIAG_rithum` | số PO trong mail ≈ số PO trong sheet |
| 4 | — | mở `/exec` trên trình duyệt | `{"ok":true,"msg":"Receiver alive"}` |
| 5 | từng tài khoản | script.google.com/home/triggers | đúng số trigger như bảng mục 2, **không dòng nào thuộc project khác** |

### Nhật ký chạy checklist

**28/07/2026 — máy mới, chạy bằng info@:**

| Bước | Kết quả |
|---|---|
| `/exec` | ✅ `{"ok":true,"msg":"Receiver alive"}` |
| `DIAG_mail` | ✅ `WHNotif=13 BẢN MỚI` · `PO=2 Carrier=3 Qty=9 Pickup=11` · `SẼ GỬI (0)` |
| `DIAG_pro` | ✅ `PRO=14 BẢN MỚI (N)` · 4 hàng cần tra, ra 0 |
| `DIAG_rithum` | ⏸ chưa chạy (cần đăng nhập rithumgetorder@) |
| Trigger | 🔴 3 trigger `AACT auto` còn sống — xem mục 5.1 |
| `WAREHOUSE_TO` | 🔴 vẫn là địa chỉ test |

Ghi chú `DIAG_pro`: 2 đơn **XGSI** (`48559271`, `25584700`) trả **HTTP 404**, 2 đơn BXID trả 200. Tài liệu ghi `type=bol` đã kiểm chứng 200 — cần theo dõi xem 404 là do BOL chưa manifest bên XGS hay nguồn tra đã đổi.

### 💡 Mẹo thao tác Apps Script bằng Claude in Chrome (rút ra 28/07/2026)
Ô **chọn hàm để Run** là listbox tuỳ biến, rất khó điều khiển:
- `find` → click theo **ref**: KHÔNG ăn.
- Mở dropdown rồi bấm **Enter**: reset về hàm đầu (`onOpen`) và chạy nhầm hàm đó.
- Phím **Down có `repeat`**: nhảy không đúng số bước (6 lần → chỉ đi 2 bước).
- ✅ **CÁCH ĂN**: click vào **phần chữ** của ô chọn hàm (không phải mũi tên) → screenshot xác nhận menu mở thật → **click thẳng toạ độ dòng hàm** → screenshot xác nhận nhãn ô đã đổi → mới bấm **Run**.
- ⚠️ Trong danh sách có `removeTriggers` ngay sát các hàm hay dùng — **luôn xác nhận nhãn trước khi Run**.

---

## 5. BẨY ĐÃ TỪNG SẬP — ĐỪNG LẶP LẠI

1. **Hai project cùng chạy.** Ngoài `AFW-DSM` còn project **`AACT auto`** chứa bản code cũ và cũng có trigger `processOrders`. Nó đã gây gửi mail trùng và gửi sai carrier. Trước khi tin vào bất cứ kết quả nào: mở `script.google.com/home/triggers`, xác nhận **mọi trigger đều thuộc `AFW-DSM`**.
   > 🔴 **Kiểm 28/07/2026 (máy mới): VẪN CHƯA XOÁ.** info@ đang có **5 trigger**, chỉ 2 thuộc AFW-DSM:
   > | Project | Function | Error rate |
   > |---|---|---|
   > | AFW-DSM | processOrders | 0% |
   > | AFW-DSM | fillPro | 0% |
   > | **AACT auto** | **processOrders** | 0.49% |
   > | **AACT auto** | **fillPro** | 0% |
   > | **AACT auto** | **checkMarioPro** | 0% |
   >
   > → `processOrders` & `fillPro` đang chạy **2 lần mỗi chu kỳ** (một bản code cũ). Thêm nữa: `checkMarioPro` của `AACT auto` chạy dưới quyền **info@**, sai — hàm này phải chạy bằng b2b@ mới đọc đúng hộp thư.
   > **Lưu ý cách kiểm**: `DIAG_mail` chỉ đếm trigger **trong project AFW-DSM** (log ra "Trigger của tài khoản này (2)") nên nó **KHÔNG phát hiện được** trigger của project khác. Phải mở `script.google.com/home/triggers` bằng mắt.
2. **Trigger đặt Hour timer thay vì Minutes timer.** Đã mất nhiều thời gian tưởng "script chết" trong khi nó chỉ chạy mỗi giờ một lần. Xem cột *Last run* rồi đối chiếu chu kỳ, hoặc chạy `installTrigger` / `installProTrigger` để đặt bằng code cho chắc.
3. **`06_File_Cu_KHONG_DUNG/`**: `TraPRO_XGSI.gs`, `TrackPRO.gs` là bản cũ đã bị thay. Dán chúng vào project sẽ **trùng tên hàm và đè code mới** — Apps Script không báo lỗi, chỉ chạy sai. Giữ lại chỉ để tham khảo.
4. **PO luôn 8 chữ số và phải là TEXT.** Xem mục cảnh báo trong `02_AppsScript/HuongDan_CaiDat_AppsScript_Moi.md`.
5. **Sửa web app phải Deploy ▸ New version.** Trigger dùng code Head (Save là đủ), nhưng web app thì không.
6. **CTII: không bấm Submit khi test** — sẽ tạo BOL và lệnh pickup thật.
7. **Đang ở chế độ TEST**: `WAREHOUSE_TO` trong `GuiMail_BOL.gs` đang trỏ `nguyen.nguyen938@hcmut.edu.vn`. Khi chạy thật phải đổi về `mariop@notslogistics.com`.

---

## 6. THỨ KHÔNG CHUYỂN ĐƯỢC

- **Lịch sử hội thoại Claude** lưu trên máy cũ, không đi theo tài khoản. Đây chính là lý do mọi kết luận quan trọng đã được viết vào các file `.md` trong folder này — file đi theo bạn, hội thoại thì không.
- **Quyền của tiện ích Chrome** phải cấp lại trên máy mới.
- **Mật khẩu**: tự nhập bằng tay hoặc dùng trình quản lý mật khẩu. Không lưu mật khẩu vào bất kỳ file nào trong folder này.
