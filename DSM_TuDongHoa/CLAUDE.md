# CLAUDE.md — Dự án DSM AllForWood

Claude Code đọc file này tự động. Đây là bản tóm tắt **đã kiểm chứng thực tế**; chi tiết trong các file
được dẫn ở dưới. Cập nhật **06/08/2026**.

---

## 0. QUY TẮC BẮT BUỘC — đọc trước khi làm bất cứ việc gì

1. **Mọi điểm chưa chắc chắn phải HỎI người dùng.** Không suy diễn, không đoán, không bịa.
   Nếu tài liệu không nói, hỏi. Nếu tool trả kết quả lạ, báo nguyên văn.
2. **Submit trên web carrier — hai site KHÁC NHAU** (làm rõ 05/08/2026, người dùng xác nhận):
   - **`centraltransport.com` → TẠO LỆNH PICKUP THẬT, không huỷ được.** Không submit khi test.
     Form BOL **mở công khai, KHÔNG cần đăng nhập** — nghĩa là không có rào cản nào ngăn một
     lần chạy lỗi gọi xe thật đến kho. Đây là thao tác nguy hiểm nhất trong toàn bộ dự án.
   - **`aaacooper.com` → chỉ tạo BOL, KHÔNG tạo lệnh pickup.** Hậu quả nhẹ hơn nhiều.
     Vẫn cần đăng nhập (form user/password, không SSO, không thấy MFA).
   Bản cũ gộp hai site làm một và cấm cả hai — sai ở phía AACT, và cái sai đó tự chặn việc mình
   được phép làm.
3. **Submit reprint trên DSM KHÔNG HOÀN TÁC ĐƯỢC.** Kiểm trùng trước; lỗi thì **không retry**.
4. **Không nhập mật khẩu, không lưu mật khẩu.** Đăng nhập do người dùng tự làm.
5. **PO luôn 8 chữ số, luôn ghi dạng TEXT** vào sheet. Nhiều PO bắt đầu bằng 0; mất số 0 là lệch
   tên folder Drive, `fillRow` không tìm thấy hàng.
   🔴 **`setNumberFormat('@')` rồi `setValue` KHÔNG ĐỦ** (bằng chứng 06/08/2026: fillRow gửi chuỗi
   `'08/07/2026'`, đọc lại ra kiểu **Date**, không ai sửa tay). Sheets vẫn ép kiểu vì định dạng chưa
   kịp áp. Phải dùng `_ghiText_()`: áp định dạng → `flush()` → ghi → `flush()` → **đọc lại kiểm**,
   còn ra Date thì ghi lại kèm dấu nháy đầu. Áp cho **cả cột B (PO) và cột K**.
6. **Sửa web app Apps Script phải Deploy ▸ New version.** Trigger dùng code Head (Save là đủ),
   web app thì KHÔNG.
7. Đơn **Ground** vẫn lưu Drive, **không lọc bỏ** (chốt 05/08/2026).
8. Trả lời **ngắn gọn, tiếng Việt**.
9. Phát hiện bug hay cách làm nhanh hơn thì **ghi vào file hướng dẫn tương ứng** — đó là cách dự án
   không mất kinh nghiệm khi đổi máy/đổi công cụ.

---

## 1. DỰ ÁN LÀM GÌ

Tự động hoá hoàn thiện đơn dropship Home Depot qua **CommerceHub DSM / Rithum OrderStream**.
Mỗi đơn LTL/pallet: đọc packing slip → chọn carrier → tạo BOL (+ shipping label với AACT/CTII)
→ tạo folder Drive theo ngày → upload file → điền Google Sheet → PRO tự về.

Phần đã tự động hoàn toàn (chạy trên server Google, không cần máy nào bật):
`CheckRithum` nạp đơn mới · `TraPRO` tra PRO XGSI/BXID · `CheckMail_PRO` đọc PRO từ folder `SIGNED PRO#`
(⚠️ người dùng muốn **đổi lại về đọc mail** — xem mục 8, việc treo #2).

Phần cần người/AI: đọc packing slip, chọn carrier, điền form web carrier.

---

## 2. HẰNG SỐ

| Khoá | Giá trị |
|---|---|
| Google Sheet | `1Fzwr2GDHOHxMgqPNf-Ksf6qJ5IIl3mNzrOQrHqH57fo`, tab **`Order List`**, header hàng 6, data hàng 7 |
| Drive gốc | `1hsWarcdjtK63CD8As9CtXqJTcUPg8oAw` — "THD Orders" |
| Drive `_INBOX` | `18rFktqm_K_a9-RPW5S0o2fTkmmHITGKO` — lưu **file PDF gộp thô** tải từ DSM |
| Web app `/exec` | `https://script.google.com/macros/s/AKfycbzzJCEgWBcO76OcbhJIdiHGlJEgbWxq7FFEGbIwwpQe2gmtOalVOXziJXFyuI1Ckrtn-Q/exec` |
| Apps Script project | `AFW-DSM`, id `1SVhEOV5leNMVPOF-iSyEVAf3XfuKQts933M_Q5Fsk3-a7CF0Z62uDial` (chủ: info@) |
| Trần đơn/ngày pickup | `MAX_PER_DAY = 20` |
| Kho (thật) | `mariop@notslogistics.com` |

**Cây Drive:** `THD Orders / <DD Mon YYYY> / PO - <po> / {<po>_BOL.pdf, <po>_PackingSlip.pdf,
<po>_ShippingLabel.pdf (chỉ AACT & CTII), SIGNED PRO#/}`
So tên folder bằng `.trim()` — thực tế có folder `"PO - 02562579 "` dính dấu cách thừa.

**17 cột sheet:** `A=Order Date · B=PO · C=Carrier · D=PIC(tay) · E=Customer Order Number ·
F=ShipTo Name · G=SKU · H=Product name · I=Quantity · J=BOL/SHIPPING LABEL(X) · K=PICK UP SCHEDULE ·
L=RITHUM CONFIRM(tay) · M=WAREHOUSE NOTIFICATION(tay) · N=PRO#/SHIPPING# · O=PICKUP# ·
P=Link Drive · Q=Note(tay)`

**Mã carrier (cột C):** AACT · XGSI · BXID · CTII · SEFL · FXFE · ABFS

---

## 3. TRƯỚC KHI LÀM MỘT ĐƠN — LỌC

| Điều kiện | Xử lý |
|---|---|
| **Cột C có Carrier** hoặc **cột D có tên người** (Eric/Kap/Xuan…) | **BỎ QUA** — đang có người làm tay, làm nữa = **lệnh pickup trùng** |
| Bang **AK / HI** | **DỪNG, HỎI NGƯỜI DÙNG** — `05_TraCuu/carrier.csv` chỉ có 48 bang lục địa + NCA/SCA |
| Ship Via = Ground | Vẫn lưu Drive; **người dùng tự dựng BOL** |

Dấu hiệu người làm tay: `x` **viết thường** ở cột J/M (script luôn ghi `X` HOA) và **cột P trống**.

---

## 4. WEB APP APPS SCRIPT — API nội bộ

`NhanFile_Drive_WebApp.gs`. **Luật chung: KHÔNG kèm `headers` khi POST**, và **KHÔNG kiểm `o.ok`**.

| Action | Cách gọi | Kiểm field |
|---|---|---|
| `needSlip` | **GET** `?action=needSlip[&checkSlip=1]` hoặc POST | `o.pos` |
| `lookup` | **GET** `?action=lookup&pos=a,b` hoặc POST `{pos:[...]}` | `o.rows` |
| `donDepManifest` | **GET** `?action=donDepManifest[&thatSu=1]` — dọn `_INBOX`: manifest + file gộp + slip đã vào folder PO | `o.xoa` |
| `makeFolder` | POST `{action:'makeFolder', po, pickupSchedule}` | `o.folderId` |
| `fillRow` | POST `{action:'fillRow', po, carrier, ..., skipCap:true}` | `o.row` |
| upload file | POST `{folderId, filename, base64, mimeType}` | `o.id` |
| HTML→PDF | POST `{folderId, filename, html}` | `o.id` |

### 🔴 Hai bẫy đã mất thời gian vì chúng

1. **`{"ok":true,"msg":"Receiver alive"}` nghĩa là `doPost` KHÔNG chạy** — POST bị biến thành GET,
   sheet không được ghi gì, nhưng `ok === true`. Gặp ~1/10 lần. Đặt `Content-Type:'text/plain'`
   làm lỗi này xảy ra **liên tục** → **bỏ hẳn `headers`**.
2. **Apps Script thỉnh thoảng trả nguyên trang HTML** → `JSON.parse` ném `Unexpected token '<'`.
   **Phải có vòng lặp gọi lại 3–4 lần, giãn 2–3 s.** Test 05/08: upload thất bại im lặng ở lần đầu.

Mọi action **idempotent** — lỗi thì gọi lại.

### Thứ tự gọi khi làm một đơn — KHÔNG đảo

```
mk = POST {action:'makeFolder', po, pickupSchedule:'08/04/2026'}
     -> {folderId, url, signedProFolderId, dayFolder, pickupSchedule:'08/06/2026', pickupMoved:true}
     POST {folderId: mk.folderId, filename:'<PO>_*.pdf', base64, mimeType:'application/pdf'}
     POST {action:'fillRow', po, ..., pickupSchedule: mk.pickupSchedule, skipCap:true, linkDrive: mk.url}
```
`makeFolder` **chốt ngày trước** (áp trần 20 đơn/ngày), `fillRow` dùng lại đúng ngày đó với `skipCap:true`.
`skipCap` cũng dùng cho **CTII** khi lịch pickup đã cam kết với carrier.

---

## 5. TOOL TẢI PACKING SLIP TỪ DSM — endpoint đã kiểm chứng

Chi tiết: `07_Plan_AutoPackingSlip.md` · code trong tab: `08_Tool_TaiPackingSlip.js` ·
bản VM: `10_VM_Tool/`

```
POST  <action của form dsmQuickSearchForm>  -> redirect gotoOrderRealmDisplay.do?orderid=<id>
GET   gotoOrderRealmForm.do?orderid=<id>&action=web_packslip_reprint&Go=Go
POST  handleOrderRealmFormSubmission.do    -> body chứa "successfully applied"
GET   gotoViewPackslipReprint.do           -> tên file <fid>.pdf + số slip
GET   gotoViewFileContents.do?FID=<fid>&FNAME=<fid>.pdf
         -> HTML liệt kê PO trong file; mỗi dòng có link Hub_PO=<orderid>
GET   downloadFile.do?fileId=<fid>         -> application/pdf   ✅
```

Trường Ship Quantity có **tên động**: `order(<orderid>).item(<itemid>).shipped`, kèm 2 hidden
`order(<orderid>).id` và `order(<orderid>).item(<itemid>).id`. Nút submit `input#confirmreprintbtn`.

### 🔴 Bẫy quan trọng nhất

**`downloadFile.do?...&isLive=true` KHÔNG trả PDF** — trả `text/html` 59 KB. Nút Download trên trang
gọi kèm `isLive=true`; **đừng bắt chước**. Dùng `downloadFile.do?fileId=<fid>` (bỏ hẳn `isLive`).
Đã từng lưu một trang HTML vào Drive dưới tên `.pdf` và web app vẫn trả `ok:true`.
→ **Luôn kiểm 2 lớp: `blob.type` chứa `pdf` VÀ 5 byte đầu là `%PDF`.** HTML ~57–59 KB, PDF ~70–130 KB.

### Cơ chế gộp file — 🔴 SỬA LẠI 05/08/2026, bản cũ SAI

Bản cũ ghi: "file reprint là **một** file chờ dồn tích, Submit thêm đơn vẫn vào cùng file đó".
**Không đúng.** Chạy thật 05/08: submit 2 PO cách nhau 5 giây → DSM tạo **HAI file riêng**:

```
22576343885 -> 78784022
22576391163 -> 78821006
```

Có dồn tích thật, nhưng **không phải lúc nào cũng dồn** — không đoán được khi nào tách khi nào gộp.

→ **Luôn duyệt HẾT danh sách file chờ, đừng bao giờ chỉ lấy file đầu tiên.**
Đây chính là bug đã suýt làm mất slip của `78821006`: `pendingFile()` có `break` ở file đầu,
tải xong file 1 là dừng, file 2 nằm lại không ai tải. Mà Submit thì đã gửi rồi — lần chạy sau
sẽ submit lại đúng PO đó = **lệnh reprint trùng**. Đã sửa bằng `pendingFiles()` (số nhiều).

Vẫn đúng: sau khi Download, file rời khỏi danh sách chờ. Và **Submit hết cả lô rồi mới Download**.

DSM sinh file **có độ trễ** — dùng `doiDuSlip()` để đợi đủ slip (mặc định 60 s) trước khi tải,
đừng gọi `pendingFiles()` ngay sau submit rồi tin luôn kết quả.

### Các thông số khác

- `SHIP QUANTITY ON PACKING SLIP` là **cờ 0/1**, **không phải số lượng đơn** → luôn điền `1`.
- **Không có CSRF token** — chỉ cần session cookie.
- Tên file DSM là **11 chữ số** + `.pdf`; Chrome thêm ` (n)` khi trùng tên.
- `input[name=quicksearchbtn]` **không phải nút Go** — nó là Expand/Hide.
- Trang Order Detail có **3 phần tử chữ "Go"**; nút đúng là `input#GoButton` **trong cùng cha với
  `select#action`**. Lấy "Go" đầu tiên là bấm nhầm Search.
- Dropdown Action có `Ship` và `Cancel` ngay cạnh — **chọn option theo text tuyệt đối**, không theo index.

---

## 6. BẢN ĐỒ FILE

| Đường dẫn | Nội dung |
|---|---|
| `00_README.md` | Mục lục + luồng hiện hành. **Đọc trước.** |
| `00_BanGiao_MayMoi.md` | Bàn giao sang máy khác, checklist kiểm tra, bẫy đã sập |
| `00_Prompt_KhoiDong.md` | Prompt mở phiên (bản cho Cowork) |
| `01_HuongDan_VanHanh/1_DocPackingSlip.md` | **BƯỚC 0: đếm số packing slip trong file trước đã** |
| `01_HuongDan_VanHanh/2_ChonCarrier.md` | Chọn carrier theo bang + store/customer |
| `01_HuongDan_VanHanh/3_QuyTrinh_AACT.md` | Quy trình AACT. WEIGHT khi Qty>1 = `(cột K × Qty) + 55` |
| `01_HuongDan_VanHanh/4_Playbook_AACT.md` | **Kinh nghiệm thực chiến, lỗi #12–#20.** Đọc trước khi chạy AACT |
| `01_HuongDan_VanHanh/5_QuyTrinh_CarrierKhac.md` | SEFL/XGSI/BXID/FXFE/ABFS + cách chạy nhiều đơn một lượt |
| `01_HuongDan_VanHanh/6_QuyTrinh_CTII.md` | CTII. 4 khối địa chỉ, bẫy city viết tắt. **Không Submit khi test** |
| `02_AppsScript/*.gs` | 4 file đang chạy trên Google |
| `02_AppsScript/HuongDan_CaiDat_AppsScript_Moi.md` | Cài từ đầu, bảng cột, quy tắc trigger |
| `04_BOL_Form/BOL_Form.html` + `fill_bol.py` | Mẫu BOL chung + script điền (WeasyPrint) |
| `05_TraCuu/{carrier,class,pallet}.csv` | Bảng tra carrier · freight class · pallet/weight |
| `07_Plan_AutoPackingSlip.md` | Thiết kế + toàn bộ khảo sát endpoint DSM |
| `08_Tool_TaiPackingSlip.js` | Tool chạy **trong tab** Chrome (3 hàm) |
| `10_VM_Tool/` | **Bản Node + Playwright chạy tự động trên VM** |
| `11_TaiVe/` | **Chỗ tải file về trên VM** (thay `C:\Users\Lenovo\Downloads`). Đã `.gitignore` |
| `06_File_Cu_KHONG_DUNG/` | ⚠️ **ĐỪNG dán lên Apps Script** — trùng tên hàm sẽ đè code mới |

---

## 7. MẪU BOL (chốt 29/07/2026)

`# PKGS` = 1 · `HANDLING UNIT QTY` = 1 · `PACKAGE QTY` = tổng Qty · `WEIGHT` = Σ(cột K × Qty) + 55
(cộng 55 **một lần** cho pallet) · **bỏ trống dòng 4 SPECIAL INSTRUCTIONS**.
`ADDITIONAL SHIPPER INFO` = `COMMODITY DESCRIPTION` = `SKU-<model> Unfinished <GỖ> <độ dài> FT`,
mỗi SKU một dòng. Loại gỗ = chữ sau `Unfinished` ở cột B của `pallet.csv`, viết HOA.
Độ dài = cột C (inch) ÷ 12.

---

## 8. TRẠNG THÁI & VIỆC CÒN TREO

Cập nhật **06/08/2026**.

### ✅ Đang chạy tự động, không cần ai

| | Lịch |
|---|---|
| `CheckRithum` đơn mới → cột A/B | trigger 10′ |
| `TraPRO` PRO cho XGSI/BXID → cột N | trigger 15′ |
| `CheckMail_PRO` PRO cho SEFL/CTII/FXFE/ABFS → cột N | trigger 15′ |
| `chay-dinh-ky.sh` = `run.mjs` (tải+tách slip) → `xu-ly-don.mjs` (dựng BOL) | cron `*/5 7-19 * * 1-5` |
| `giu-session.sh` chạm nhẹ DSM giữ session | cron `2-59/5 * * * *` (24/7) |
| `don-dep.sh` dọn `_INBOX` | cron `25 * * * *` |

**Đã kiểm chứng thực địa:** `run.mjs` 2 lô thật · `tachTheoPO` trên file gộp 4 PO của DSM ·
vòng đời dedup 2 nguồn · `taoBOL` AACT (tạo thật BOL `4178975`) · tải BOL+Label của 5 đơn ·
parser chọn carrier **24/24 khớp cột C**.

---

### 🔴 VIỆC CÒN TREO — chờ người dùng quyết

**1. CTII — CHƯA CHO SUBMIT.** Người dùng chốt phải dừng trước nút Submit, chưa quyết khi nào mở.
`ctii.mjs` điền được trọn form và `datYeuCau()` kiểm đủ điều kiện, nhưng **không có hàm nào bấm
`bSubmit`**. Submit CTII tạo **lệnh pickup thật với Central Transport, không huỷ được** — và form
BOL của họ **mở công khai không cần đăng nhập**, nên không có rào cản nào ngoài chính đoạn code này.
→ `xu-ly-don.mjs` bỏ qua toàn bộ đơn CTII.

Còn thiếu nếu sau này mở: bấm Submit → đọc Pickup # → tải BOL + ShippingLabel (fetch same-origin,
xem `6_QuyTrinh_CTII.md`) → `fillRow` kèm `pickupNum` → cột **O**.
⚠️ Kèm theo là **xung đột trần 20 đơn/ngày**: CTII chốt lịch xe TRƯỚC khi `fillRow` chạy, nên phải
`skipCap:true` và đọc `pickupMoved`, nếu không mail kho báo một ngày mà xe đến ngày khác.

**2. ĐỔI PRO VỀ ĐỌC MAIL, KHÔNG ĐỌC DRIVE.** Người dùng yêu cầu 06/08/2026.
Hiện `CheckMail_PRO.gs` đọc PRO từ folder `SIGNED PRO#` trên Drive (đổi 01/08). Muốn quay lại
đọc mail Mario reply về `b2b@allforwood.com`.
✅ **Code cũ CÒN NGUYÊN** — `getProFromMario(po, carrier)` ở dòng 158, chưa xoá, chỉ không được gọi.
Đổi lại là chuyện thay lời gọi trong `checkMarioPro()`, không phải viết mới.
Cần chốt trước: đọc mail **thay hẳn** Drive, hay **thử mail trước rồi mới tới Drive**?

---

### ⚠️ Chưa kiểm chứng — biết là chưa chắc

- **`xu-ly-don.mjs` chưa xử lý MỘT đơn thật nào.** Cả hai nhánh mới chỉ chạy `--dry`
  (`11_TaiVe/aact/` rỗng). Lô Misc đầu tiên sẽ là lần chạy thật đầu tiên, **không ai trông**, và
  với đơn AACT nó **tạo BOL thật**. Trần `DSM_MAX_BOL=10`.
- **Chỉ cột C được đối chiếu.** `shipTo` · `sku` · `productName` · `qty` rút từ slip nhưng chưa
  lần nào so với sheet — `lookup` không trả về mấy cột đó. Lô đầu nên xem tay cột E–I.
- **Giữ session có tác dụng không: chưa biết.** Đêm 06/08 là đêm đầu đo liên tục 24/7.
  Đọc `grep CHET 11_TaiVe/logs/giu-session.log | tail` → tuổi vượt xa 5 tiếng = sliding, giữ cron;
  luôn chết quanh cùng một mốc = tuyệt đối, **gỡ cron cho đỡ 288 request/ngày vô ích**.

### 🔧 Việc nhỏ

- **`pallet.csv` thiếu 4 SKU** thấy trong lô 28 đơn: `833250` · `814300` · `815253` · `836250`.
  Đơn Misc dùng chúng sẽ bị gạt sang danh sách chờ (không tính được weight → không dựng được BOL).
- `carrier.csv` thiếu **AK** và **HI** → dừng và hỏi. NCA/SCA cho kết quả giống nhau.
- **Đơn nhiều SKU: parser TỪ CHỐI**, chưa có mẫu thật nào để kiểm. 28 đơn khảo sát đều 1 SKU.
- **Cột N và O chưa đi qua `_ghiText_`** — vẫn dùng `setValue` trần nên có thể bị ép thành số.
  PRO của AACT không có số 0 đầu nên chưa gặp sự cố, carrier khác chưa kiểm.
- **Slip đơn Ground tích tụ ở `_INBOX` vĩnh viễn** — chúng không bao giờ có folder `PO - <po>` nên
  `donDepManifest` luôn giữ lại. Đúng thiết kế, nhưng `_INBOX` sẽ dày dần.
- **`--dry` của `xu-ly-don.mjs` không áp `--max`** → báo "sẽ làm 25" trong khi chạy thật chỉ làm 10.
- **Không có cảnh báo đơn quá hạn pickup mà chưa có PRO.** Ví dụ 4 đơn XGSI pickup 05/08 tới
  06/08 vẫn `404` — không ai biết trừ khi tra tay.
- **4 số PRO biến mất khỏi sheet 06/08** khi người dùng sửa cột: `20565416` · `77754043` ·
  `77850772` · `77860619` (cột N), 3 đơn mất cả link cột P. Số thật lấy lại được từ BOL đã tải
  (`11_TaiVe/bol/`). **Chưa khôi phục — chờ người dùng xác nhận cố ý hay vô tình.**
- **BOL rác `4178975`** (PRO `39004838`) trên hệ thống AACT — cố ý tạo 06/08 để nghiệm thu đường
  Finalize, không xoá được. Đừng tưởng là BOL thật.
- Folder Drive cũ `1ER7RWu-66baF1uvB4AuBByN7OS-FJdAI` (phẳng): để nguyên lưu trữ, không dùng.
- **Sheet có nhiều người sửa cùng lúc** — luôn lấy danh sách PO ngay trước khi submit.

---

## 9. KHÁC BIỆT MÔI TRƯỜNG: Claude Code vs Cowork

Bộ tài liệu này viết trong Cowork, nơi có **Claude in Chrome** điều khiển một tab Chrome đã đăng nhập.
**Claude Code không có thứ đó.** Hệ quả:

| Việc | Cowork (cũ) | Claude Code |
|---|---|---|
| Chạy JS trong tab DSM | `javascript_tool` | ❌ Không có → dùng **Playwright** (`10_VM_Tool/`) |
| Tải file về đĩa | Blob + `<a download>` trong tab | Playwright/`fetch` ghi thẳng ra file |
| Đọc/ghi Drive & Sheet | Qua web app + connector Drive | Qua web app (URL công khai, không cần auth Google) |
| Điền form AACT/CTII | Claude in Chrome bấm tay | Playwright — **chưa viết**, và đây là phần giòn nhất |

### Máy hiện tại — VM Linux (chốt 05/08/2026)

Repo clone tại `/home/Lenovo/dsm_auto`, thư mục làm việc `/home/Lenovo/dsm_auto/DSM_TuDongHoa`.

| Việc | Thực tế trên VM |
|---|---|
| Chỗ tải file | `11_TaiVe/` — xem `11_TaiVe/README.md`. **Không có `~/Downloads`** |
| Trình duyệt | Chỉ **headless** (`DISPLAY` rỗng). Chromium có sẵn; **Google Chrome KHÔNG có** → mọi lệnh Playwright phải `--browser chromium` |
| MCP dùng cho DSM | **`playwright-dsm`** (khai trong `~/.claude.json`) |
| ⚠️ MCP `playwright` | Trỏ `/opt/wayfair/downloads` — **dự án khác đang chạy thật, đừng đụng, đừng dùng cho DSM** |
| `login.mjs` | Cần màn hình → **không chạy được ở đây**. Đăng nhập ở máy có màn hình rồi copy `storageState.json` lên VM |

Hai mẹo kỹ thuật chỉ đúng trong Cowork, **bỏ qua khi ở Claude Code**:
`javascript_tool` trả `{}` với hàm async (phải ghi vào `window.__x` rồi đọc lệnh sau), và kết quả
chứa URL bị `[BLOCKED: Cookie/query string data]`.
