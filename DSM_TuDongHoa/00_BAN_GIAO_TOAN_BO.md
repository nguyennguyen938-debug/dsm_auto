# BÀN GIAO TOÀN BỘ DỰ ÁN DSM — kênh Home Depot (THD)

Viết **19/10/2026**, dựa trên kiểm kê thực tế cùng ngày. Đây là file **đọc đầu tiên** cho agent
mới. Các file khác đi sâu từng phần; file này cho bức tranh đầy đủ và chỉ đường tới chúng.

---

## 0. Đọc theo thứ tự này

1. **File này** — toàn cảnh
2. `CLAUDE.md` — quy tắc bắt buộc, bẫy đã gặp, hằng số. Claude Code tự đọc
3. `00_QuyTac_DangLuu_12082026.md` — mọi luật nghiệp vụ, trích thẳng từ code
4. `10_VM_Tool/README.md` — trước khi sửa bất cứ file nào trong `10_VM_Tool/`
5. `00_TAI_LAP_VM_MOI.md` — chỉ khi phải dựng lại trên máy mới

### Ba ràng buộc — nhắc lại với người dùng ở đầu phiên

1. **Không `pkill` / `pgrep`.** VM chạy chung với dự án khác. Giết tiến trình theo PID đã ghi.
   Đã sập ba lần vì bỏ qua điều này.
2. **Đo trước, kết luận sau.** Phiên trước sai nhiều lần vì suy từ một dấu hiệu.
3. **Hệ thống chạy thật.** Có thao tác tốn tiền và không hoàn tác được — xem mục 9.

Người dùng làm việc bằng **tiếng Việt**, muốn trả lời ngắn, và muốn được **hỏi trước** mọi
điểm chưa chắc. Không tự đoán, không tự quyết thay.

---

## 1. Dự án làm gì

Tự động hoá đơn **dropship Home Depot** của công ty **ALL FOR WOOD** (bán mặt bàn gỗ
butcher block / đảo bếp). Đơn đến qua **CommerceHub DSM / Rithum OrderStream**.

Mỗi đơn đi qua: nhận đơn → tải packing slip → phân loại → làm giấy tờ vận chuyển → ghi sheet
→ (người) gửi mail kho → nhận số vận đơn → confirm trên Rithum → xuất hoá đơn.

### Hai luồng hàng — chia theo **kho**, không theo hãng

| Luồng | Kho | Vận chuyển | Giấy tờ | Sheet đích |
|---|---|---|---|---|
| **B2B** | **Calhoun** (NOTS Logistics, GA) | xe tải LTL, pallet | BOL | tab **B2B** |
| **B2C** | 5 kho **Lecangs**: CAP · SAV · NJF02 · HOU07 · MEM-R | **UPS Ground** từng kiện | nhãn UPS + đơn xuất kho Lecangs | tab **B2C** |

### Các bên liên quan

| Bên | Vai trò | Truy cập |
|---|---|---|
| **DSM / Rithum** `dsm.commercehub.com` | nguồn đơn, in packing slip, confirm, hoá đơn | cookie `11_TaiVe/storageState.json` |
| **Google Sheet** `1Fzwr2GDHOHxMgqPNf-Ksf6qJ5IIl3mNzrOQrHqH57fo` | bảng điều hành chính | qua web app Apps Script |
| **Google Drive** "THD Orders" `1hsWarcdjtK63CD8As9CtXqJTcUPg8oAw` | lưu BOL, slip, nhãn theo ngày/PO | qua web app |
| **UPS** | nhãn chuyển phát | **REST API**, không dùng web |
| **Lecangs** `app.lecangs.com` | 5 kho B2C, tra tồn + tạo đơn xuất kho | profile Chrome `11_TaiVe/.profile-ground` |
| **AACT** `aaacooper.com` | hãng LTL, tạo BOL | `creds.json` — **đang không dùng**, xem mục 6 |
| **CTII** `centraltransport.com` | hãng LTL | ⛔ **CẤM submit** — tạo lệnh xe thật, không huỷ được |

---

## 2. Truy cập và vị trí

### VM

| | |
|---|---|
| Tên | `wayfair-auto-01` · Google Cloud project `allforwood-promotion` · `us-central1-a` · `e2-medium` |
| IP ngoài | `136.111.186.129` · SSH cổng 22, **chỉ khoá**, mật khẩu tắt |
| User chính | `Lenovo` — toàn quyền, sudo không mật khẩu |
| User phụ | `bot` — chỉ đọc code, **không** vào `11_TaiVe/`, không sudo (tạo 09/09) |
| Dự án | `/home/Lenovo/dsm_auto/DSM_TuDongHoa` |
| HĐH | Debian 13 · Node 24 · Python 3.13 · Playwright 1.62 |

**Chung máy với dự án khác — đừng đụng:**
`/opt/wayfair` (cron `35 8 * * *`) · `/opt/scraper` · `/home/Lenovo/wayfair-finance-automation`
(session Claude "Wayfair-download-data") · user `it`. MCP `playwright` trỏ vào `/opt/wayfair` —
**không dùng cho DSM**, dùng `playwright-dsm`.

### Nơi lưu dự án

| Nơi | Có gì | VM chết thì |
|---|---|---|
| **GitHub** `nguyennguyen938-debug/dsm_auto` (⚠️ **PUBLIC**) | code, tài liệu, bảng tra, crontab | `git clone` |
| **Drive folder** `1mVndvxy60i1pbASMKeS2VuHizou3XCqo` (chỉ @allforwood) | gói sao lưu `dsm-sao-luu[-daydu]-*.tar.gz`, hướng dẫn | bản cứu hộ |
| **Apps Script** `AFW-DSM` id `1SVhEOV5leNMVPOF-iSyEVAf3XfuKQts933M_Q5Fsk3-a7CF0Z62uDial` (chủ info@) | 6 file `.gs` chạy trên server Google | không ảnh hưởng |
| **Sheet + Drive "THD Orders"** | dữ liệu đơn thật | không ảnh hưởng |
| **VM** `11_TaiVe/` | bằng chứng chống trùng, phiên, khoá | dựng lại từ gói sao lưu |

Push từ VM bằng khoá SSH `~/.ssh/id_ed25519` (remote đã là `git@github.com:...`).

### Tài khoản

| Site | Tài khoản | Ghi chú |
|---|---|---|
| DSM | (phiên cookie, SSO Frontegg) | `giu-session.sh` giữ sống được ~65 ngày (1561 giờ), rồi vẫn chết 10/10. Đăng nhập lại bắt buộc có người |
| UPS | shipper **`1741XG`** ALL FOR WOOD · trả cước **third party `12C8D2`** (Home Depot), ZIP `92571` | khoá API trong `11_TaiVe/ups-api.txt` |
| Lecangs | người dùng đăng nhập tay qua VNC (lần cuối 15/08) | **không lưu mật khẩu**. Tài khoản cũ `sue.nguyen@` từng bị khoá sau 6 lần sai |
| AACT | `info@allforwood.com` | `creds.json` |

⛔ **Không nhập, không lưu, không đoán mật khẩu.** Đăng nhập do người dùng tự làm.

---

## 3. Luồng chạy end-to-end

```
[Apps Script] CheckRithum (10')        mail Rithum -> them PO vao cot A/B sheet "Order List"
        |
[VM cron 5'] chay-dinh-ky.sh
   ├─ run.mjs                            needSlip -> submit reprint ca lo -> tai PDF gop
   |                                     -> tach theo PO -> _INBOX + manifest tren Drive
   |                                     -> 11_TaiVe/packingslip/<PO>_PackingSlip.pdf
   └─ xu-ly-don.mjs                      doc slip -> phan loai B2B/B2C
         ├─ Misc / B2B   -> dung BOL (bol_html.py) -> layFolder -> upload -> fillRow
         |                  cot C = NULL (khau chon hang dang tat)
         ├─ Ground / B2C -> CHI dien sheet, cot C = UPS (cho nhanh Ground)
         └─ hon hop      -> tich X cot T, moi luong lam phan cua minh
        |
[Apps Script] copyB2B_B2C (trigger)    chep Order List -> tab B2B / B2C
        |
[VM — CHUA VAO CRON] chay-ground.sh
   ├─ xu-ly-don --sheet b2b             phan B2B cua don hon hop
   ├─ xu-ly-ground                      tra ton Lecangs -> chiaTheoKho -> UPS API tao nhan
   |                                     -> ups/<PO>.json -> Drive -> cot N tracking
   |                                     -> tao don xuat kho Lecangs -> lecangs/<PO>_<tn>.json
   └─ xu-ly-ground --sheet b2c          phan B2C cua don hon hop
        |
[NGUOI] gui mail kho (cot M) · chon hang cho don NULL · confirm tren Rithum (cot L)
        |
[Apps Script] TraPRO / CheckMail_PRO   so PRO cua hang LTL -> cot N
        |
[VM — chay tay] invoice.mjs --that     trang "Needs Invoicing" -> hoa don hang loat
```

---

## 4. Danh mục tool trên VM (`10_VM_Tool/`)

### Đang chạy tự động (cron)

| File | Việc |
|---|---|
| `chay-dinh-ky.sh` | bọc `run.mjs` + `xu-ly-don.mjs`, có khoá flock, trần `DSM_MAX=15`, `DSM_MAX_BOL=10` |
| `run.mjs` | tải packing slip từ DSM (reprint) |
| `xu-ly-don.mjs` | slip → BOL → Drive → sheet. Cờ: `--dry`, `--only`, `--max`, `--sheet b2b` |
| `giu-session.sh` / `.mjs` | chạm nhẹ DSM mỗi 5' cho phiên khỏi chết |
| `don-dep.sh` | dọn `_INBOX` trên Drive mỗi giờ |

### Soạn sẵn, CHƯA bật — cần người dùng duyệt

| File | Việc |
|---|---|
| `chay-ground.sh` | bọc nhánh Ground cho cron. Bật bằng biến `DSM_GROUND_THUONG/B2C/B2B=1` |
| `xu-ly-ground.mjs` | nhánh UPS + Lecangs. Cờ an toàn: `--that` + `DSM_UPS_ENV=prod` mới mua nhãn thật; `--lecangs-that` mới submit Lecangs; `--pickup` mới gọi xe |

### Chạy tay

| File | Việc |
|---|---|
| `invoice.mjs` | hoá đơn hàng loạt. Mặc định `--dry`; `--that` mới gửi |
| `vnc.sh bat/tat/trangthai` | màn hình ảo `:99` + VNC để người dùng đăng nhập tay |
| `kiem-phien-lecangs.mjs` | phiên Lecangs sống không |
| `login.mjs` | đăng nhập DSM lại khi phiên chết |
| `sao-luu.sh [--day-du]` | đóng gói thứ ngoài git |
| `khoi-phuc.sh <goi>` | dựng lại trên máy mới |
| `test-ground-tra.mjs` | bộ test, phải ra **97 pass, 0 fail** |

### Thư viện (được import, không chạy thẳng)

`dsm.mjs` (gọi DSM) · `doc-slip.mjs` (đọc PDF slip) · `bol-tinh.mjs` (weight/class) ·
`ground-tra.mjs` (**nơi DUY NHẤT giữ luật phân loại**, kho, dims, ngày pickup, `chiaTheoKho`) ·
`webapp.mjs` (web app + `layFolder`) · `ups-api.mjs` (OAuth token) · `ups-ship.mjs` (tạo nhãn) ·
`ups-pickup.mjs` · `lecangs.mjs` (tồn kho + đơn xuất) · `phien.mjs` (profile Chrome, `donKhoaSot`) ·
`aact.mjs`

### 🗑️ Tool cũ — đừng dùng, giữ làm tư liệu

| File | Vì sao bỏ |
|---|---|
| `ups-form.mjs`, `chay-ground-web.mjs` | điền form web UPS — Akamai chặn VM, phiên chỉ sống 20–35'. Đã thay bằng API |
| `ups-dangnhap.mjs`, `nap-cookie-ups.mjs`, `do-phien-ups.mjs` | phục vụ đường web UPS ở trên |
| `02_AppsScript/MaDangNhap_UPS.gs` | lấy mã MFA UPS cho đường web |
| `ctii.mjs` | điền được form CTII nhưng **cố ý không có hàm submit** |
| `cdp.mjs`, `kiem-dang-nhap.mjs` | công cụ gỡ lỗi |
| `08_Tool_TaiPackingSlip.js` | bản chạy trong tab Chrome thời Cowork |
| `06_File_Cu_KHONG_DUNG/` | ⚠️ **đừng dán lên Apps Script** — trùng tên hàm sẽ đè code mới |

---

## 5. Apps Script (`02_AppsScript/`)

| File | Việc | Lịch |
|---|---|---|
| `CheckRithum.gs` | đọc mail Rithum → PO mới vào cột A/B | 10' |
| `NhanFile_Drive_WebApp.gs` | **web app** — API nội bộ cho VM (bảng action ở `CLAUDE.md` mục 4) | theo yêu cầu |
| `CopyB2B_B2C.gs` | chép Order List → tab B2B/B2C | trigger |
| `TraPRO.gs` | tra PRO XGSI/BXID → cột N | 15' |
| `CheckMail_PRO.gs` | đọc PRO từ folder `SIGNED PRO#` → cột N | 15' |
| `MaDangNhap_UPS.gs` | 🗑️ cũ | — |

🔴 **Sửa web app phải Deploy ▸ New version.** Save thôi chỉ đủ cho trigger.
🔴 Web app **không có xác thực** (trừ `maUps`) — ai có URL đều ghi được vào sheet thật.

---

## 6. Luật nghiệp vụ cốt lõi

Chi tiết và nguồn từng luật: `00_QuyTac_DangLuu_12082026.md`.

### Phân loại từng dòng hàng — `phanLoaiSku()` trong `ground-tra.mjs`

| # | Điều kiện | Kết quả |
|---|---|---|
| 0 | bang giao **AK / HI** | B2B |
| 1 | `836390` · `836390-B` · `838390` · `838390-B` (kho Calhoun) | B2B, kể cả slip ghi Ground |
| 2 | `838250` · `838250-B` · `818250` · `818250-B` | B2C nếu Lecangs còn đủ, hết thì B2B; tra không được → B2C |
| 3 | còn lại | slip `Ground (carrier not specified)` → B2C · `Misc. Common Carrier` → B2B |

Khớp **tuyệt đối cả chuỗi**, có `-B` hay không là hai mã khác nhau. Trên 58 slip chỉ từng gặp
đúng hai dạng Ship Via ở trên.

### Ba cách khớp mã SKU — đừng lẫn

| Dùng ở | Cách |
|---|---|
| phân loại | tuyệt đối cả chuỗi |
| tra tồn Lecangs | bỏ mọi hậu tố, gộp biến thể |
| cân nặng / kích thước | **giữ nguyên hậu tố** — `812250` 31 lb ≠ `812250-B` 128 lb |

### Hãng xe B2B

`NGUNG_CHON_CARRIER_B2B = true` → cột C ghi `NULL`, ô carrier trên BOL để trống, **người dùng
tự chọn hãng**. Nhánh AACT vì vậy không chạy. `carrier.csv` vẫn còn, bật lại cờ là dùng.

### BOL

`WEIGHT` = Σ(cột K × Qty) **+ 55 một lần** · `H` = 6 + 2 × tổng tấm · `L/W` = **lớn nhất**
từng chiều · freight class theo PCF (`class.csv`). Đơn nhiều mã = **xếp chung một pallet**.
`pallet.csv` chỉ có **10 mã** — đơn Misc dùng mã khác sẽ nằm "chờ người xem".

### UPS

Dịch vụ `03` Ground · nhãn **4×6** · trả cước third party `12C8D2` (vì vậy UPS luôn báo cước
`$0.00`) · **không gọi xe** (Home Depot không trả phí pickup) · mỗi mã một kiện.
Không kho nào đủ mọi mã → **tách shipment theo kho**, không xé nhỏ qty một mã.
Thứ tự kho theo bang: `warehouse_ranking_by_state.csv`, **MEM-R luôn cuối**.

### Sheet `Order List` (header hàng 6) · tab B2B gid `1948139859` · B2C gid `768845312` (header hàng 1)

`A` ngày · `B` PO (**luôn TEXT, 8 số, có thể bắt đầu bằng 0**) · `C` carrier (vừa là dữ liệu vừa là
cờ "đã nhận") · `D` người làm tay · `E–I` thông tin đơn (nhiều mã = nhiều dòng trong ô) · `J` X =
có giấy tờ · `K` ngày pickup · `L` confirm Rithum (tay) · `M` mail kho (tay) · `N` PRO/tracking ·
`O` pickup# · `P` link Drive · `Q` ghi chú · `T` X = đơn hỗn hợp B2B+B2C.

**Cột C hoặc D có giá trị → mọi tool bỏ qua đơn.** Đó là cách người dùng "giành" đơn để làm tay.

Luật copy sang tab con: `NULL` → chỉ A, B, P · `UPS` → toàn bộ · hãng khác → trừ C, L, N, O ·
`T = X` → chỉ A, B, T vào **cả hai** tab.

---

## 7. Dữ liệu trên VM (`11_TaiVe/`, bị gitignore)

| Thư mục | Là gì |
|---|---|
| `ups/<PO>.json` | 🔴 bằng chứng **đã mua nhãn UPS** (kèm PDF base64, theo lô kho `bc.lo[]`) |
| `lecangs/<PO>_<tracking>.json` | 🔴 **đã tạo đơn xuất kho** |
| `invoice/lo-*.json` | 🔴 **đã gửi hoá đơn** |
| `aact/<PO>.json` | 🔴 đã Finalize BOL AACT |
| `drive/<PO>.json` | 🔴 folder Drive của PO — `layFolder()` dùng lại, chống folder trùng |
| `qty/<PO>.json` | số lượng thật DSM ghi nhận — `kiemQty` chặn slip in sai số |
| `phanloai/<PO>.json` | kết quả tra tồn, cầu nối từ nhánh Ground sang `xu-ly-don` |
| `packingslip/`, `bol/`, `dsm_raw/` | slip, BOL đã dựng, PDF gộp thô |
| `logs/` | `dsm-tool.log` (cron chính) · `giu-session.log` · `don-dep.log` · `ground.log` |
| `storageState.json` | phiên DSM |
| `.profile-ground/` | profile Chrome — phiên Lecangs |
| `creds.json`, `ups-api.txt` | tài khoản, khoá API UPS |

Mất các file 🔴 = hệ thống **làm lại việc không hoàn tác được**. Manifest chống reprint trùng
nằm **trên Drive**, không phải VM.

---

## 8. Phiên đăng nhập

| Phiên | Tự sống? | Khi chết |
|---|---|---|
| DSM | ✅ cron chạm nhẹ 5' — kéo dài được ~65 ngày, **không vô hạn** | `node 10_VM_Tool/login.mjs`, người dùng tự gõ |

🔴 **Phiên chết thì không có cảnh báo nào.** Cron vẫn chạy, log `giu-session.log` ghi `CHET`, nhưng
không ai đọc. Lần 10/10 mất 9 ngày mới phát hiện. Kiểm nhanh: `tail -1 11_TaiVe/logs/giu-session.log`.
| UPS API | ✅ token 4 giờ, tool tự xin lại | — |
| **Lecangs** | ❌ **không gì giữ**, sống ~10 ngày | `vnc.sh bat` → người dùng đăng nhập tay → đóng Chrome bằng **SIGTERM theo PID** |

⛔ **Đừng bao giờ mở `ups.com/lasso/login`** — Akamai chặn VM, mỗi lần chạm kéo dài thời gian
chặn. ⛔ Người dùng từng hỏi "vá dấu vết trình duyệt" để qua chặn — **đã từ chối, giữ nguyên.**

`moContext()` giờ **kiểm PID trong `SingletonLock`**: Chrome khác đang giữ profile thì dừng và
báo, không mở đè.

---

## 9. Năm việc không hoàn tác được — luôn hỏi trước

| Việc | Lệnh / cờ | Bằng chứng |
|---|---|---|
| Submit reprint DSM | `run.mjs` | manifest trên Drive |
| Finalize BOL AACT | nhánh AACT | `aact/` |
| Mua nhãn UPS | `--that` + `DSM_UPS_ENV=prod` | `ups/` |
| Submit đơn xuất kho Lecangs | `--lecangs-that` | `lecangs/` |
| Gửi hoá đơn | `invoice.mjs --that` | `invoice/` |

Cộng thêm **CTII submit = gọi xe thật**, cấm tuyệt đối. Và sắp tới: **confirm trên Rithum** sẽ là
việc thứ sáu (gửi thông báo giao hàng cho Home Depot).

BOL AACT là ngoại lệ nhẹ: người dùng chốt 11/08 rằng BOL **chưa có hiệu lực tới khi gửi mail**,
nên tạo thừa chỉ để lại số rác.

---

## 10. Trạng thái 19/10/2026

| | |
|---|---|
| Cron chính | ⚠️ vẫn chạy nhưng **không tải được gì** — xem dòng dưới. Slip mới nhất **10/10**, tổng 92 slip |
| Phiên DSM | ❌ **CHẾT từ 10/10/2026 11:17** sau 1561 giờ sống liền. 9 ngày không tải đơn mới. Cần người dùng đăng nhập lại (`login.mjs` qua VNC) |
| Phiên Lecangs | ❌ **chết** |
| Nhánh Ground | ❌ chưa vào cron |
| Đơn Ground chờ nhãn | **~50** (58 đơn `C = UPS` chưa ai nhận ở cột D, chỉ 7 có bằng chứng nhãn) |
| Bộ test | 97 pass |
| Git | sạch, đồng bộ GitHub |

### Kết quả thật đã chạy

- 4 đơn B2C end-to-end thật 11–12/08: `81784311` `81912318` `81925064` `81944554`
- 294 PO · 320 dòng · 360 đơn vị hoá đơn qua `invoice.mjs` ngày 12/08, 30 lô
- BOL AACT thật `4181293` cho `25567870` (08/08). BOL `4178975` là **rác cố ý** để nghiệm thu

---

## 11. Việc còn treo và hướng đi

### Đang chờ người dùng quyết

1. **Bật cron nhánh Ground?** Bật là mua nhãn UPS + tạo đơn xuất kho thật. Đề nghị chạy
   `--max 1` một đơn trước.
2. **~50 đơn Ground không có tracking** từ tháng 8–10 — đã giao ở hệ thống khác chưa? Phải biết
   trước khi bật bất cứ thứ gì, kẻo mua nhãn cho đơn đã giao.
3. **Đổi PRO về đọc mail** thay vì đọc Drive (`getProFromMario()` còn nguyên, chỉ đổi lời gọi).
4. **Đơn Ground đi AK/HI có dựng BOL không** — hiện chỉ điền sheet.
5. **CTII** — tạm không xử lý.

### Hướng mới người dùng nêu 19/10 — chưa làm, đang chờ trả lời

- **Auto-confirm đơn UPS trên Rithum.** Hiện **không có code nào**, cột L làm tay 100%.
  Logic đề xuất (chưa duyệt): lấy tracking từ `ups/<PO>.json` (không lấy cột N) → kiểm trạng
  thái đơn trên DSM → điền tracking đúng từng dòng hàng (đơn hỗn hợp chỉ confirm dòng B2C;
  một PO có thể nhiều tracking) → submit → ghi ngay `confirm/<PO>.json` → đánh cột L.
  **Form ship-confirm của DSM chưa từng được khảo sát.**
- **"Trên gcloud, bỏ tool cũ"** — chưa rõ nghĩa: giữ VM (vốn đã là GCE) hay chuyển Cloud Run /
  Functions; tool cũ cụ thể là những cái nào.
- **Đưa kênh THD lên "hub" vận hành.** Hub nằm ở các session nhóm **`aws_bot`** trên máy khác
  của người dùng ("Bot Wayfair + Tổng", "Xây bot Etsy", "Shopify", "Xử lí alert", "Tài liệu
  luồng", "Kết nối AWS bot"). Session trên VM này **không nhắn tới được** chúng. Đã soạn sẵn
  6 câu hỏi cho hub (chạy ở đâu, có API không, đã có confirm chưa, lưu bằng chứng ở đâu, dùng
  Sheet hay DB, tài khoản dùng chung). **Câu trả lời quyết định có nên xây confirm trên VM hay
  để hub làm.**

### Lỗi đã biết, chưa sửa

- 🔴 **`xu-ly-ground.mjs` không bỏ qua đơn đã có tracking ở cột N** — chỉ xét C và D. Nhân viên
  giao tay rồi điền N thì lượt sau **mua nhãn lần hai**. Phải sửa trước khi bật cron Ground.
- Nguyên nhân cột C tự trống (đơn `07587667` ngày 11/08) chưa tìm ra; `drive/<PO>.json` đã chặn
  hậu quả nặng nhất.
- Cột N, O chưa qua `_ghiText_` — có thể bị Sheets ép thành số.
- `--dry` của `xu-ly-don.mjs` không áp `--max`.
- Không có cảnh báo đơn quá hạn pickup mà chưa có PRO.
- 4 PRO mất khỏi sheet 06/08 (`20565416` `77754043` `77850772` `77860619`) — chưa khôi phục.

---

## 12. Bẫy đắt nhất đã gặp — tóm tắt

| Bẫy | Bài học |
|---|---|
| Slip in `Qty 1` khi đặt 2 | `SHIP QUANTITY` = đúng `QUANTITY ORDERED`; `kiemQty` đối chiếu trước khi dựng BOL |
| DSM tách lô reprint thành nhiều file | luôn duyệt **hết** danh sách file chờ |
| `downloadFile.do?...&isLive=true` trả HTML | bỏ `isLive`, kiểm 5 byte đầu là `%PDF` |
| Web app trả `{"ok":true,"msg":"Receiver alive"}` mà không ghi gì | không kiểm `o.ok`, không gửi `headers`, gọi lại 3–4 lần |
| `setValue` ép PO thành số, ngày thành Date | `_ghiText_()`: format → flush → ghi → flush → đọc lại |
| `makeFolder` chạy lại ngày khác tạo folder thứ hai | luôn qua `W.layFolder()` |
| `crontab <file>` cắt đường dẫn 100 ký tự | `crontab - < file` |
| `pkill -f` tự giết shell, `pgrep x11vnc` giết của Wayfair | chỉ giết theo PID đã ghi |
| `kien` là mảng, đọc `kien.qty` ra `"undefined"` trên sheet | test hồi quy cho mọi chỗ ghi sheet |
| Nhãn UPS khổ 8.5×11 | `LabelStockSize 4×6` |
| Gán ngược kho B2B/B2C | Calhoun = B2B, Lecangs = B2C |
| Bảng thứ tự kho sai cả 50 bang | đã thay toàn bộ, MEM-R cuối |
| Khoá SSH công khai bị dán vào PowerShell | nói rõ đó là nội dung dán vào web |

Đầy đủ: `CLAUDE.md`, `00_BanGiao_PhienMoi_08082026.md`, `00_SoatLoi_12082026.md`.

---

## 13. Sao lưu và dựng lại

```bash
bash 10_VM_Tool/sao-luu.sh              # gon ~2 MB
bash 10_VM_Tool/sao-luu.sh --day-du     # day du ~18 MB
bash 10_VM_Tool/khoi-phuc.sh <goi>      # tren may moi, phai ra "0 muc loi"
```

Gói mới nhất trên Drive: `dsm-sao-luu-daydu-20260902-2300.tar.gz`. **Đã cũ** — từ đó có thêm
slip tới 10/10. Nên chạy lại `--day-du` và upload. Quy trình đầy đủ: `00_TAI_LAP_VM_MOI.md`.

⛔ Gói chứa cookie, mật khẩu, khoá API và địa chỉ khách — **không bao giờ đẩy lên GitHub**.

---

## 14. Chỉ mục tài liệu

| File | Nội dung |
|---|---|
| `CLAUDE.md` | quy tắc, hằng số, API web app, bẫy DSM, trạng thái |
| `00_QuyTac_DangLuu_12082026.md` | mọi luật nghiệp vụ kèm nguồn trong code |
| `00_KHOI_DONG_PHIEN_MOI.md` | tóm tắt cho phiên mới, nơi lưu, phiên đăng nhập |
| `00_TAI_LAP_VM_MOI.md` | dựng lại VM, 11 bước, 4 chỗ dừng hỏi |
| `00_BanGiao_PhienMoi_08082026.md` | bẫy đã gặp, thứ không nên thử lại |
| `00_SoatLoi_12082026.md` · `00_KiemChung_12082026.md` | soát lỗi và kiểm chứng 12/08 |
| `00_CauHoi_NhieuSKU_12082026.md` | quyết định đơn nhiều mã |
| `00_CauHoi_UPS_PhiPickup_09082026.md` | câu hỏi gửi UPS về phí pickup |
| `00_Deploy_Ground_SoanSan.md` | soạn sẵn bật nhánh Ground |
| `01_HuongDan_VanHanh/1–7_*.md` | quy trình tay từng bước: đọc slip, chọn hãng, AACT, CTII, Ground |
| `01_HuongDan_VanHanh/8–10_*.html` | trang cho người vận hành, bản đồ pipeline, câu hỏi nhiều mã |
| `02_AppsScript/HuongDan_CaiDat_AppsScript_Moi.md` | cài Apps Script từ đầu |
| `07_Plan_AutoPackingSlip.md` | khảo sát endpoint DSM |
| `10_VM_Tool/README.md` | kiến trúc tool VM |
| `10_VM_Tool/crontab.txt` | lịch chạy |
