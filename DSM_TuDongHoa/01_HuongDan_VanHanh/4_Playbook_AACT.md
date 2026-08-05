# PLAYBOOK — Chạy đơn AACT bằng Claude in Chrome (kinh nghiệm thực chiến)

Mục tiêu: lần sau NHANH, ÍT TOKEN, ÍT LỖI. Đọc file này + `3_QuyTrinh_AACT.md` là đủ.
Đúc kết từ 2 đơn thật đã chạy thành công: 71648792 (BOL 4162556 / PRO 36994947) và 69958769 (BOL 4163218 / PRO 36995306).

---

## 0. HẰNG SỐ dùng lại (copy, đừng dò lại)
- Folder Drive AACT: `1ER7RWu-66baF1uvB4AuBByN7OS-FJdAI`
- Web App nhận file: `https://script.google.com/macros/s/AKfycbzzJCEgWBcO76OcbhJIdiHGlJEgbWxq7FFEGbIwwpQe2gmtOalVOXziJXFyuI1Ckrtn-Q/exec`
- Sheet đích: **"Order List"** trong `1Fzwr2GDHOHxMgqPNf-Ksf6qJ5IIl3mNzrOQrHqH57fo` (header hàng 6, data từ hàng 7). Cột (**bản 17 cột, cập nhật 28/07/2026 — khớp `SHEET_CFG` trong `NhanFile_Drive_WebApp.gs`**):
  **A=Order Date · B=PO Number · C=Carrier · D=PIC(tay) · E=Customer Order Number · F=ShipTo Name · G=SKU · H=Product name · I=Quantity · J=BOL/SHIPPING LABEL(X) · K=PICK UP SCHEDULE · L=RITHUM CONFIRM(tay) · M=WAREHOUSE NOTIFICATION(X) · N=PRO#/SHIPPING# · O=PICKUP# · P=Link Drive · Q=Note(tay)**
  Điền qua web app `fillRow` (tìm PO ở cột B). PRO(**N**): AACT gửi kèm `pro`; XGSI/BXID→TraPRO; SEFL/CTII/FXFE/ABFS→CheckMail.
  > ⚠️ Bảng cột **13 cột cũ** (A=Order Date … M=Link Drive, có cột Merchant) đã BỎ. Nếu thấy tài liệu nào còn ghi `X cột I` / `pro→J` / `carrier→L` / `linkDrive→M` thì đó là bản cũ — sửa theo bảng trên.
- Mã Carrier (cột **C**): **AACT / XGSI / BXID / CTII / SEFL / FXFE / ABFS**.
- BOL template: `https://www.aaacooper.com/workspace/bol?sourceBolTemplateId=50357`
- DSM search: `.../gotoGenericSearchResults.do?uniqueTabId=3527` (dự phòng: `...uniqueTabId=12920`)
- Shipper cố định (template tự điền, GIỮ NGUYÊN): NOTS LOGISTICS / ALL FOR WOOD · 120 ENTERPRISE DR SW · CALHOUN GA 30701 · MARIO · info@allforwood.com · (762) 231-7977
- Email test người nhận: `nguyen.nguyen938@hcmut.edu.vn`

### URL trực tiếp của AACT (dùng để né dropdown, nhanh hơn)
- Chi tiết BOL sau Finalize: `https://www.aaacooper.com/workspace/bol/<BOL_ID>`
- **BOL PDF**: `https://www.aaacooper.com/workspace/bol/<BOL_ID>/pdf`
- **Trang cấu hình Shipping Label**: `https://www.aaacooper.com/workspace/shipping-label?sourceBolNumber=<BOL_ID>`
- Label PDF (sau Create Label PDF): `https://www.aaacooper.com/workspace/shipping-label/<LABEL_ID>/pdf`

---

## 0b. NGUYÊN TẮC CLICK (bám chặt)
**Ưu tiên element (ref) → rồi tọa độ.** Cụ thể:
1. **Mặc định dùng `find "<mô tả>"`** (hoặc `read_page filter=interactive`) lấy ref → `form_input`/`left_click` theo **ref**. Chính xác, ổn định khi layout dịch/không cuộn, ít token.
2. **Dùng TỌA ĐỘ** khi element không có trong accessibility tree hoặc ref không click được:
   - Icon trong **viewer PDF** (nút Tải ⬇, In) — buộc dùng tọa độ, **screenshot xác nhận PDF render xong rồi mới bấm**.
   - Popup/menu tùy biến `find` không thấy.
3. **Checkbox**: `form_input` KHÔNG set được → **click** (ref nếu có, không thì tọa độ).
Không "mù quáng" toàn tọa độ + screenshot như lần đầu (gây bấm nhầm).
> **KHÔNG còn gõ ô Google Sheets** — việc điền sheet nay làm qua web app `action:'fillRow'` (mục 6). Bỏ mọi thao tác click/gõ ô lưới Sheet.

## 1. Tiên quyết
- Chrome đăng nhập sẵn AACT (góc phải hiện **ALL FOR WOOD**) và **DSM**.
- `list_connected_browsers` có Browser 1.
- **Navigate lần đầu tới AACT/DSM hay "bounce" về newtab/example** → navigate LẠI lần 2 + `wait 3s`. Bình thường.

---

## 2. BẢN ĐỒ GIAO DIỆN AACT (biết trước → ít screenshot)

### Trang tạo BOL (2 bước, nút Next/Finalize ở cuối mỗi trang)
**Trang 1 — Customer / Shipper / Consignee / Bill To / Notify:**
- `read_page filter=interactive` LÚC ĐẦU chỉ trả tới ~ref_17 (Shipper) vì trang lazy-render. **Phải scroll xuống Consignee rồi read_page lại** mới thấy ref các ô Consignee.
- Thứ tự ref điển hình sau khi Consignee vào viewport (số có thể ±1 giữa các lần):
  - Consignee: **Company Name, Address, Zip, City, State, [Search], Contact, Email, Phone, Ext, Fax** (Zip/City/State là 3 ô liền; nút Search = kính lúp ngay sau State).
  - Ngay sau đó là block **Bill To** (Company Name = "HomeDepot.com #8119...") — mốc để biết đã hết Consignee.
- Điền Consignee: Company=dòng1 tên (người) / dòng1+dòng2 (cửa hàng có C/O); Address=đường phố; **Zip thôi** rồi click Search → popup **City Lookup** → click dòng thành phố khớp packing (vd "LAND O LAKES", "NEW LENOX (MRK)"); Phone=số.
- Bill To + Notify: **GIỮ NGUYÊN**. → **Next** (nút xanh góc dưới trái, ~x262).

**Trang 2 — Shipment Details / Accessorials / Reference Numbers:**
- Bố cục dọc: COMMODITY #1 (trên cùng) → SPECIAL INSTRUCTIONS → Accessorials (FVC + 3 cột checkbox dài) → REFERENCE NUMBERS (gần cuối) → **Back / Finalize Bill of Lading** (đáy).
- Sau khi bấm Next thường trang cuộn xuống giữa; dùng **Home** để về đầu (Commodity), **End**/scroll để xuống Reference.

### Trang chi tiết BOL (sau Finalize)
- Hiện **BOL #**, **PRO #**, Date, Shipper Ref, Consignee Ref. LƯU cả 2 số này.
- Nút **Print ▾** góc phải trên (~x1254,y133) → menu 2 mục: **BOL PDF** (trên) / **Shipping Label** (dưới).

### Viewer PDF (cả BOL lẫn Label)
- Thanh công cụ: trang | zoom | **nút Tải ⬇ (xanh, góc phải ~x1241,y247)** | nút In.

---

## 3. ĐIỀN BOL — chỉ SỬA phần template điền sai
> **MẸO QUAN TRỌNG:** Trang 1 (Customer/Shipper/Consignee) đôi khi **KHÔNG cuộn được** bằng `scroll`/`Page_Down` (và `read_page` chỉ trả tới Shipper ~ref_17, không thấy Consignee). **Đừng phí lượt cuộn** — dùng thẳng **`find`** để lấy ref rồi thao tác bằng ref (form_input/click hoạt động dù element ngoài viewport):
> - `find "Consignee section: Company Name, Address, Zip, Phone input fields and Search button"` → điền form_input theo ref, click Search theo ref.
> - `find "Next button to go to shipment details"` → click ref.
> - Trang 2 (Commodity) thường cuộn được bình thường; phần Reference dùng `find "Generate PRO number checkbox, Shipper BOL number field, Shipper Reference 1 field, Consignee Reference PO 1 field"`.

Template tự điền Shipper + Bill To + Consignee mẫu + Commodity mẫu. Cần sửa:
- **Consignee**: điền lại theo đơn (mục 2).
- **Commodity #1:**
  - **Weight**: tra theo **SKU** = Model Number (chỉ lấy phần SỐ, `832250-B`→`832250`) trong file pallet → cột **K** ("Packaged Gross Weight") của dòng đó **+ 55**. Vd 832250 → K=128 → 128+55 = **183**. (SỬA đè giá trị template 185.)
  - **Class**: L=cột C, W=cột D (dòng SKU đó), H=6+2×Qty → PCF=1728×Weight/(L×W×H) → tra class.csv (Min≤PCF<Max). Vd: PCF=1728×183/(144×25×8)=10.98 → **Class 92.5**. (File pallet: A=SKU, C/D/E=Product Dim, F/G/H=Pallet Dim, K=Weight.)
  - **Hazmat checkbox: TÍCH SẴN → BỎ tích** (bỏ xong UN/Hazard biến mất, layout dịch lên).
  - **Special Instructions: dính PO CŨ `69766619` → THAY** = `PO Number <PO>`.
  - Unit Count / Pallets: thường đúng, kiểm nhanh.
  - "Save this commodity/address...": để **bỏ tích**.
  - **FVC = 200**.
- **Reference Numbers**: tích **Generate PRO # for BOL** → **Shipper BOL # = PO**, **Shipper Reference #1 = PO**, **Consignee Reference (PO) #1 = Customer Order (WH...)**.
- **Finalize Bill of Lading**. (Nếu đơn thật, xác nhận với người dùng; test thì cứ chạy, user đã dặn "đừng ngừng lại".)

---

## 4. LẤY FILE PDF → DRIVE (cốt lõi, KHÔNG route bytes qua Claude)
Bytes PDF KHÔNG đi qua Claude được (base64 trả về từ javascript_tool bị chặn; bash base64 > token limit; endpoint `/api/bols/<id>/pdf` GET=405/POST=415). Cách chạy được:

0. **Tạo folder `<PO>` TRƯỚC:** POST `{action:'makeFolder', po:'<PO>'}` → lấy `folderId` + `url`. **Mọi POST file bên dưới dùng `folderId` này** (folder `<PO>`), KHÔNG dùng folder cha. `url` để điền cột **P** (mục 6).

1. Mở tab PDF:
   - **BOL**: navigate thẳng URL `https://www.aaacooper.com/workspace/bol/<BOL_ID>/pdf` (mở ngay viewer BOL).
   - **Label (QUAN TRỌNG — dùng LINK, KHÔNG dùng Print dropdown):**
     a. Navigate URL config: `https://www.aaacooper.com/workspace/shipping-label?sourceBolNumber=<BOL_ID>` → wait 3s. (KHÔNG bấm Print▸Shipping Label vì hay trúng nhầm "BOL PDF".)
     b. `find "Next button at bottom of shipping label form"` → click ref trả về (đừng dò toạ độ; trang mặc định "1 Label 4x6" full-page là đúng).
     c. `find "Create Label PDF button"` → click ref → mở tab mới `/workspace/shipping-label/<LABEL_ID>/pdf`.
2. Trong tab PDF **cài hook TRƯỚC khi bấm tải**:
   ```js
   window.__blobs=[]; const o=URL.createObjectURL.bind(URL);
   URL.createObjectURL=function(b){try{if(b instanceof Blob)window.__blobs.push(b);}catch(e){} return o(b);}; 'ok'
   ```
3. **Bấm nút Tải ⬇ — làm ĐÚNG THỨ TỰ để không sai vị trí:**
   - ⚠️ **PHẢI đợi PDF render xong RỒI mới bấm.** Chụp 1 screenshot xác nhận thấy nội dung PDF (BOL/label hiện rõ) — bấm khi trang chưa render thì blob = 0 (đây là lỗi "xác định sai nút tải" thực chất là bấm quá sớm).
   - Nút Tải là **icon mũi tên xuống ⬇ màu xanh, ở thanh công cụ viewer, góc phải (~x1241, y247)** — nằm ngay TRÁI nút In (máy in). Đừng nhầm với nút In.
   - Click nút Tải → **kiểm `window.__blobs.length`**. Nếu **0 → PDF chưa render/bấm trượt → screenshot lại, đợi, bấm lại**. Lặp tới khi n≥1.
   - Blob PDF hợp lệ: `size` ~90–130KB, byte đầu = `[37,80,68,70,45]` ("%PDF-"). Nếu size quá nhỏ là bắt nhầm.
4. Blob→base64→window.name (kèm url/folderId/filename):
   ```js
   const b=window.__blobs.at(-1); const buf=new Uint8Array(await b.arrayBuffer());
   let s='';for(let i=0;i<buf.length;i++)s+=String.fromCharCode(buf[i]);
   window.name=JSON.stringify({url:'<WEBAPP>',folderId:'<folderId folder <PO> từ makeFolder>',filename:'<PO>_BOL.pdf',mimeType:'application/pdf',base64:btoa(s)}); window.name.length
   ```
5. **Navigate CHÍNH tab đó → `https://example.com`** (AACT có CSP header chặn fetch ra script.google.com; example.com không). `window.name` giữ nguyên qua navigate.
6. POST — **fire-and-forget** (Apps Script cold-start hay làm CDP eval timeout 45s DÙ ĐÃ THÀNH CÔNG):
   ```js
   const p=JSON.parse(window.name);
   fetch(p.url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(p)}); 'fired '+p.filename
   ```
7. **Xác minh bằng Drive connector** (KHÔNG chờ response, KHÔNG screenshot):
   `search_files: title = '<PO>_BOL.pdf' and parentId = '<folderId folder <PO>>'` → thấy file + đúng fileSize là xong.
- Làm BOL trước, rồi Label (đổi filename `<PO>_ShippingLabel.pdf`). Mỗi file: capture ở tab PDF của nó → navigate tab đó sang example.com → POST.

---

## 5. Điền PRO (AACT KHÔNG confirm DSM nữa)
- AACT có **PRO#** ngay khi Finalize BOL (Bước 3, vd `36994947`) → gửi kèm trường `pro` khi thêm hàng (xem mục 6). **BỎ hẳn bước confirm trên DSM.**
- (Các carrier khác: XGSI/BXID → PRO do `TraPRO.gs` tra online; SEFL/CTII/FXFE/ABFS/EXLA → PRO do `CheckMail_PRO.gs` lấy từ mail Mario — KHÔNG gửi `pro`.)

---

## 6. Điền Sheet — QUA WEB APP `fillRow` (sheet "Order List", data từ hàng 7)
Không gõ ô. Từ tab `example.com`, POST:
```js
fetch(WEBAPP_URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
  body: JSON.stringify({ action:'fillRow', po:'<PO>', carrier:'AACT',
    customerOrder:'<Customer Order #>', shipTo:'<Tên (BỎ C/O)>',
    sku:'<Model Number nguyên, vd 832250-B>', productName:'<Item Description>', qty:'<Qty Shipped>',
    pickupSchedule:'<mm/dd/yyyy>', linkDrive:'<url folder từ makeFolder>', pro:'<PRO# AACT>' }) })
```
- Ánh xạ cột: carrier→**C**, customerOrder→**E**, shipTo→**F**, sku→**G**, productName→**H**, qty→**I**, **J=X** (tự), pickupSchedule→**K**, **pro→N**, pickupNum→**O** (chỉ CTII), linkDrive→**P**.
- KHÔNG đụng: **A**(Order Date) · **D**(PIC) · **L**(Rithum Confirm) · **M**(WH Notif) · **Q**(Note).
- App Script **tìm PO ở cột B**; không thấy → **thêm hàng mới**. Trả `{ok:true,row,added}`.
- **shipTo = TÊN, bỏ "C/O ..."** (store & customer chỉ lấy tên).
- **sku** = **nguyên Model Number** (`832250-B`), không cắt phần chữ.
- **pickupSchedule** = hôm nay + (Thứ Sáu +3, Thứ Bảy +2, còn lại +1), **mm/dd/yyyy**.
- Carrier KHÁC AACT: **KHÔNG gửi `pro`** (TraPRO/CheckMail điền cột **N**).
- **Mail kho tự gửi** khi folder `<PO>` đủ file (AACT & CTII = 3, khác = 2), ngày lấy từ cột **K**, rồi đánh **X cột M**. **ĐÃ BỎ mail carrier.**

---

## 6a. ⚡⚡ CÁCH NHANH NHẤT — ĐIỀN BOL BẰNG 3 LỆNH JS (ĐÃ TEST OK 27/07/2026)
> Thay ~20 lượt click/type/screenshot + **BỎ LUÔN City Lookup**. Trường nhận diện qua **`id`** (KHÔNG phải `name` — `name` rỗng!).
> Trang 1: id cố định `*_ShipmentPartyConsignee`. Trang 2: id có **hậu tố GUID** → khớp **tiền tố** (`Weight_`, `HandlingUnitsCount_`, `IsHazmat_`).

**Hàm set chung** (dùng trong cả 3 lệnh):
```js
function setVal(el,val){ if(!el) return 'miss';
  var d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value');
  d&&d.set?d.set.call(el,val):el.value=val;
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true})); return el.value; }
```

**JS-1 — Trang 1 (Consignee, KHÔNG cần City Lookup):**
```js
(function(v){ /* setVal ở trên */
 var ins=[].slice.call(document.querySelectorAll('input'));
 function byId(id){ return ins.filter(function(e){return e.id===id;})[0]; }
 var o={};
 o.name  = setVal(byId('Name_ShipmentPartyConsignee'), v.name);          // Company Name (kèm C/O nếu store)
 o.addr  = setVal(byId('StreetAddress_ShipmentPartyConsignee'), v.addr);
 o.zip   = setVal(byId('zip_Location_ShipmentPartyConsignee'), v.zip);
 o.city  = setVal(byId('city_Location_ShipmentPartyConsignee'), v.city);  // ⭐ set trực tiếp -> bỏ City Lookup
 o.state = setVal(byId('state_Location_ShipmentPartyConsignee'), v.state);
 o.phone = setVal(byId('Phone_ShipmentPartyConsignee'), v.phone);
 return JSON.stringify(o); })({name:'...',addr:'...',zip:'59102',city:'BILLINGS',state:'MT',phone:'(406) 655-9038'})
```
→ rồi click Next bằng JS: `[].slice.call(document.querySelectorAll('button')).filter(b=>/^\s*next\s*$/i.test(b.textContent))[0].click()`

**JS-2 — Trang 2 (Commodity + Special + FVC + checkbox tự đúng trạng thái):**
```js
(function(v){ /* setVal ở trên */
 var all=[].slice.call(document.querySelectorAll('input,textarea'));
 function pre(p){ return all.filter(function(e){return e.id && e.id.indexOf(p)===0;})[0]; }
 var o={};
 o.units  = setVal(pre('HandlingUnitsCount_'), v.qty);
 o.weight = setVal(pre('Weight_'), v.weight);
 o.fvc    = setVal(document.getElementById('fvcAmount'), '200');
 o.special= setVal(document.getElementById('SpecialInstructions'), 'PO Number '+v.po);
 var hz=pre('IsHazmat_'); if(hz){ if(hz.checked) hz.click(); o.hazmat=hz.checked; }          // chỉ click khi SAI
 var gp=all.filter(function(e){return /generate-pro/i.test(e.id||'');})[0];
 if(gp){ if(!gp.checked) gp.click(); o.generatePro=gp.checked; } else o.generatePro='notfound';
 return JSON.stringify(o); })({po:'01571520',qty:'1',weight:'183'})
```
→ **Kỳ vọng:** `hazmat:false`, `generatePro:true`. Nếu `generatePro` khác true → DỪNG, xử lý tay (xem lỗi #12).

**JS-3 — References:**
```js
(function(v){ /* setVal ở trên */
 var all=[].slice.call(document.querySelectorAll('input'));
 function like(re){ return all.filter(function(e){return re.test(e.id||'');})[0]; }
 return JSON.stringify({ bol:setVal(like(/customer-bol-number/i),v.po),
   ref1:setVal(like(/shipper-reference-number/i),v.po),
   consRef:setVal(like(/purchase-order-number/i),v.custOrder) });
})({po:'01571520',custOrder:'WK33209042'})
```
→ Sau đó `find "Finalize Bill of Lading"` → click → JS mục 6b-C lấy BOL#/PRO#.
**Class** vẫn tự đúng từ template (92.5); nếu đơn khác class → set thêm `pre('Class_')`.
⚠️ Mỗi JS trả JSON — **có `'miss'` nghĩa là selector không khớp** → in danh sách `id` để dò, hoặc quay lại cách tay.

### 6a-bis. ⚡⚡ TẢI PDF KHÔNG CẦN SCREENSHOT / TOẠ ĐỘ (ĐÃ TEST OK 27/07/2026)
Viewer PDF của AACT là **Telerik Blazor** → điều khiển được bằng JS, bỏ hẳn screenshot + click toạ độ (~x1241,y247).

1. Cài hook blob (như cũ).
2. **Kiểm PDF đã render bằng JS** (thay screenshot):
```js
(function(){var c=document.querySelector('canvas');
 return JSON.stringify({canvas:document.querySelectorAll('canvas').length,
   size:c?(c.width+'x'+c.height):null, blobs:window.__blobs?window.__blobs.length:'nohook'});})()
```
→ Render xong khi **`canvas >= 1` và `canvas.width > 500`** (thực tế `1836x2376`, thường 2 canvas). `canvas:0` = chưa render.
⏱ **Thời gian render KHÔNG cố định**: BOL vừa Finalize có thể mất **~15–18s** (BOL cũ chỉ ~5s). → Dùng **1 JS gộp "kiểm-rồi-click"** (bên dưới) và gọi lại mỗi 5–8s tới khi `clicked:true`; JS tự **không click khi chưa render** nên hết hẳn lỗi blob=0.
```js
(function(){var c=document.querySelector('canvas'); var ok=!!c&&c.width>500;
 var r={canvas:document.querySelectorAll('canvas').length,size:c?(c.width+'x'+c.height):null};
 if(ok){var b=[].slice.call(document.querySelectorAll('button')).filter(function(x){return (x.title||'')==='Download';})[0];
   b?(b.click(),r.clicked=true):r.clicked='no-btn';} else r.clicked='not-rendered';
 r.blobs=window.__blobs?window.__blobs.length:'nohook'; return JSON.stringify(r);})()
```
3. **Click nút tải bằng JS**:
```js
(function(){var b=[].slice.call(document.querySelectorAll('button')).filter(function(x){return (x.title||'')==='Download';})[0];
 if(!b) return 'no download btn'; b.click(); return 'clicked';})()
```
4. Verify: `window.__blobs.length >= 1`, size ~90–130KB (BOL ≈ 94KB, Label ≈ 130KB).

> 🔴 **NGOẠI LỆ QUAN TRỌNG (28/07/2026): nút `Create Label PDF` KHÔNG click được bằng JS.**
> `button.click()` trả `'clicked'` nhưng **không có gì xảy ra** — không mở tab, `window.open` hook không bắt được, blob = 0. Blazor đòi user-gesture thật cho thao tác mở tab mới.
> ✅ **Phải dùng click thật**: `find "Create Label PDF button"` → `computer left_click` theo **ref**. Sau ~5–8s tab `/workspace/shipping-label/<LABEL_ID>/pdf` mới xuất hiện.
> (Nút **Next** trên cùng trang thì JS click **vẫn ăn** — chỉ riêng `Create Label PDF` là không.)
> ⚠️ Tab label mở **ngoài** MCP tab group → `tabs_context_mcp` phải gọi lại để lấy tabId mới.

**Trang Shipping Label — click Next bằng JS** (thay lỗi #15 "phải click 2 lần"):
```js
(function(){ function f(re){return [].slice.call(document.querySelectorAll('button')).filter(function(b){return re.test((b.textContent||'').trim());})[0];}
 var r={hasCreate:!!f(/^Create Label PDF$/i)}; var n=f(/^Next$/i); r.hasNext=!!n;
 if(n && !r.hasCreate){ n.click(); r.clicked='next'; } return JSON.stringify(r);})()
```
→ Gọi lại tới khi `hasCreate:true`, rồi click Create Label PDF cùng cách (`f(/^Create Label PDF$/i).click()`).

⚠️ **`javascript_tool` KHÔNG trả kết quả cho hàm `async` có `await setTimeout`** (trả `{}`) — nhưng **code VẪN chạy**. → Luôn viết **JS đồng bộ**, gọi nhiều lần nếu cần chờ; đừng dùng vòng lặp async có delay.

---

## 6b. ⚡ TỐI ƯU TỐC ĐỘ (áp dụng từ lần chạy 01571520)

**A. LUÔN đọc trạng thái form bằng 1 JS thay vì nhiều screenshot.** Dán 1 lần, nhận đủ thông tin:
```js
(function(){var r={};
 document.querySelectorAll('input[type=checkbox]').forEach(function(el){var n=el.getAttribute('aria-label')||el.name||el.id||'';
  if(/hazmat/i.test(n))r.hazmat=el.checked; if(/generate-pro/i.test(n))r.generatePro=el.checked; if(/savecommodity/i.test(n))r.save=el.checked;});
 var ta=document.querySelector('textarea'); r.special=ta?ta.value:null; return JSON.stringify(r);})()
```
→ Biết **chính xác** cần click hay không (xem lỗi #12). Tiết kiệm 3–4 screenshot/đơn.

**B. Điền trang 2 bằng 1 JS duy nhất** (thay ~8 lượt click/type). Set value + dispatch event để Angular nhận:
```js
(function(v){
 function setVal(el,val){ if(!el)return 'miss';
   var d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value');
   d&&d.set?d.set.call(el,val):el.value=val;
   el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return 'ok';}
 var out={};
 document.querySelectorAll('input,textarea').forEach(function(el){
   var n=(el.getAttribute('aria-label')||el.name||'')+'';
   if(/HandlingUnitsCount/i.test(n)) out.units=setVal(el,v.qty);
   else if(/^Weight/i.test(n))       out.weight=setVal(el,v.weight);
   else if(/fvcAmount/i.test(n))     out.fvc=setVal(el,'200');
   else if(/customer-bol-number/i.test(n)) out.bol=setVal(el,v.po);
   else if(/shipper-reference/i.test(n))   out.ref1=setVal(el,v.po);
   else if(/purchase-order-number/i.test(n)) out.consRef=setVal(el,v.custOrder);
   else if(el.tagName==='TEXTAREA')  out.special=setVal(el,'PO Number '+v.po);
 });
 // checkbox: CHỈ click khi trạng thái sai
 document.querySelectorAll('input[type=checkbox]').forEach(function(el){
   var n=(el.getAttribute('aria-label')||el.name||el.id||'')+'';
   if(/hazmat/i.test(n) && el.checked) { el.click(); out.hazmatClicked=true; }
   if(/generate-pro/i.test(n) && !el.checked) { el.click(); out.proClicked=true; }
 });
 return JSON.stringify(out);
})({po:'<PO>',custOrder:'<Customer Order>',qty:'1',weight:'183'})
```
→ Sau đó **verify bằng JS ở mục A**, rồi `find` Finalize → click. **Nếu JS set không ăn** (out có 'miss' / giá trị không đổi) → quay lại cách tay (triple_click + type).

**C. Lấy BOL# + PRO# ngay sau Finalize bằng JS** (không screenshot):
```js
(function(){var t=document.body.innerText;
 var b=t.match(/BOL\s*#\s*(\d+)/i), p=t.match(/PRO\s*#\s*(\d{6,})/i);
 return JSON.stringify({bol:b?b[1]:null, pro:p?p[1]:null, url:location.href});})()
```
→ `pro:null` nghĩa là **BOL không có PRO** → phải tạo lại (xem lỗi #12).

**D. Gộp makeFolder + upload vào 1 JS** (đã dùng): tạo folder rồi POST file luôn trong cùng lệnh, trả về `folderId` + kết quả upload.

**E. Dùng `browser_batch`** cho chuỗi navigate → wait → screenshot (giảm round-trip).

**F. Link trực tiếp Shipping Label:** `\/workspace/shipping-label?sourceBolNumber=<BOL_ID>` là **trang cấu hình** — VẪN phải Next → Create Label PDF, vì `LABEL_ID` (`/shipping-label/<LABEL_ID>/pdf`) chỉ sinh sau khi Create. KHÔNG có link nhảy thẳng tới label PDF khi chưa tạo.

---

## 7. ⚠️ DANH SÁCH LỖI HAY MẮC (đọc kỹ để khỏi lặp)
1. **Nhập Sheet lệch cột (LỖI CŨ — đã loại bỏ)**: trước đây gõ ô qua Chrome hay lệch cột/xoá nhầm dải. **Nay KHÔNG gõ ô nữa** — điền qua web app `action:'fillRow'` (mục 6), Apps Script tìm PO ở cột B rồi ghi đúng cột. Không cần double-check thủ công.
2. **Nút Tải PDF không ăn (blob n=0)** — nguyên nhân THẬT là **bấm khi PDF chưa render xong**. ✅ **NAY DÙNG JS** (mục 6a-bis): kiểm `canvas>=1` rồi click `button[title="Download"]` — không cần screenshot/toạ độ. (Cách cũ dự phòng: screenshot xác nhận → click ⬇ ~x1241,y247.) Blob đúng: size ~90–130KB, byte đầu `[37,80,68,70,45]`.
3. **Shipping Label**: KHÔNG bấm Print▸Shipping Label (hay trúng "BOL PDF"). **Dùng LINK** `/workspace/shipping-label?sourceBolNumber=<BOL_ID>` rồi `find` nút **Next** → `find` **Create Label PDF**.
3b. **Trang BOL 1 không cuộn được** → dùng `find` lấy ref (Consignee, Next), đừng cố scroll.
4. **`form_input` không set được checkbox** ("requires boolean") → **left_click** vào checkbox.
5. **Sau khi bỏ tích Hazmat, toạ độ dịch lên** → dễ lỡ tích "Save commodity". Chụp lại 1 lần sau khi bỏ hazmat.
6. **POST web app báo CDP timeout 45s** nhưng file VẪN lên Drive → dùng fire-and-forget + verify qua `search_files`, đừng chờ/không retry mù.
7. **`read_page` chỉ trả element trong viewport** → scroll tới đúng section rồi mới read_page lấy ref.
8. **`scroll` đôi khi không ăn / scroll_amount tối đa 10** → dùng key **End/Home** để nhảy.
9. **Navigate lần đầu bounce** → navigate lại lần 2.
10. **GuiMail không gửi (thiếu file)**: file phải nằm trong **folder `<PO>`** (tạo bằng makeFolder), KHÔNG phải folder cha. GuiMail kiểm folder `<PO>`: AACT & CTII cần 3 file, khác cần 2. Đủ mới gửi + đánh X cột **M**.
11. **Đừng reload/đóng tab PDF** sau khi bắt blob — mất `window.__blobs`/`window.name`.
12. 🔴 **BOL KHÔNG CÓ PRO (lỗi nặng nhất — đã xảy ra ở 01571520, tạo BOL rác 4168889)**: checkbox **"Generate PRO # for BOL"** có thể **ĐÃ TICK SẴN** hoặc chưa, **tuỳ lần load template** (không nhất quán!). Click mù → nếu đang tick thì thành BỎ tick → Finalize ra BOL **không PRO**, PDF hiện `AFFIX PRO LABEL HERE`, không sửa được → **phải tạo lại BOL từ đầu**.
    **CÁCH ĐÚNG:** đọc `el.checked` bằng JS (mục 6b-A) → **chỉ click khi trạng thái sai**. Áp dụng y hệt cho **Hazmat**.
    **KIỂM SAU FINALIZE (bắt buộc):** JS mục 6b-C phải trả `pro` khác null; hoặc mở `/bol/<id>/pdf` thấy **`PRO Number: <số>` + barcode** (KHÔNG phải `AFFIX PRO LABEL HERE`). Nếu thiếu PRO → tạo lại BOL, bỏ BOL cũ.
13. **Ô số đã có sẵn giá trị → gõ thêm thành sai** (vd Unit Count có "1", gõ "1" → **"11"**). **LUÔN `triple_click` (chọn hết) TRƯỚC khi type**, với mọi ô: Unit Count, Weight, FVC, Special Instructions.
14. **`form_input` KHÔNG set được ô spinbutton** (Weight/Unit Count/FVC — Angular không nhận): báo "Set text value" nhưng giá trị **không đổi**. → dùng `triple_click` + `type`, hoặc JS set value + dispatch event (mục 6b-B). **Luôn verify lại giá trị.**
15. **Trang Shipping Label: nút Next phải click 2 LẦN** (lần 1 thường không ăn, trang không đổi). Sau click, `find "Create Label PDF button"` — nếu không thấy → click Next lần nữa rồi find lại.
16. **URL `/workspace/bol/<BOL_ID>` KHÔNG load lại được** sau khi đã rời trang → hiện `Requested resource is not found` (chỉ sống ngay sau Finalize). → **LƯU BOL# + PRO# NGAY** khi vừa Finalize. Muốn xem lại PRO: mở `/workspace/bol/<BOL_ID>/pdf`. (URL `/workspace/bols` KHÔNG tồn tại.)
18. 🔴 **AACT KHÔNG SINH ĐƯỢC PDF — có thể là SỰ CỐ TOÀN SITE (28/07/2026).**
    Triệu chứng: `/workspace/bol/<id>/pdf` mở ra viewer có thanh công cụ + "Page 1 of 1" nhưng **spinner quay mãi**, `canvas = 0`, reload nhiều lần vẫn vậy. `read_network_requests` cho thấy **KHÔNG có request nào tải PDF** — viewer không hề gọi file. Trang **không báo lỗi**. `Create Label PDF` cùng lúc cũng **không mở tab mới**.

    ### 🔍 CHẨN ĐOÁN BẮT BUỘC — mở PDF của một BOL CŨ đã từng render được
    Ví dụ `/workspace/bol/4169921/pdf`. Kết quả quyết định cách xử lý:
    | BOL cũ | Nghĩa là | Làm gì |
    |---|---|---|
    | `canvas:2` | Lỗi **riêng BOL mới** | Chờ 3–5 phút rồi thử lại `/pdf` |
    | `canvas:0` | **Sự cố toàn site AACT** | **DỪNG mọi đơn AACT**, báo người dùng. Chờ lâu hơn nhiều. |

    ⚠️ **Đừng vội kết luận "lỗi riêng BOL đó".** Ghi chép ban đầu 28/07 kết luận vậy vì lúc đó BOL cũ còn render được (4169923 kẹt ~4 phút rồi tự khỏi). **Cùng ngày, muộn hơn**, cả BOL mới (4170150, 4171087) LẪN BOL cũ 4169921 đều `canvas:0` → hoá ra là sự cố toàn site, kéo dài **>30 phút**.

    → **BOL và PRO vẫn có thật và đã dùng được.** TUYỆT ĐỐI đừng tạo lại BOL (sẽ thành BOL rác + pickup trùng).

    ### 🔁 QUY TRÌNH THỬ LẠI (bắt buộc theo đúng thứ tự — chốt 29/07/2026)

    **Bước A — lưu số trước đã.** Ghi ngay `BOL#` + `PRO#` vào ghi chú, rồi làm phần không phụ thuộc AACT (xem mục "Việc VẪN LÀM ĐƯỢC" bên dưới). Không để mất số vì lỗi #16.

    **Bước B — vòng lặp RELOAD.** Mỗi vòng làm đúng 3 việc:
    1. `navigate` lại `https://www.aaacooper.com/workspace/bol/<BOL_ID>/pdf`
    2. cài lại hook blob (**reload là mất `window.__blobs`** — phải cài lại mỗi vòng)
    3. `wait 10s` → chạy JS "kiểm-rồi-click" (mục 6a-bis)

    ```
    Lặp tối đa 5 vòng, giãn dần: 10s → 30s → 60s → 2 phút → 5 phút
    ```
    - Ra `canvas >= 1` → tải blob như bình thường, xong.
    - Hết 5 vòng vẫn `canvas:0` → **sang Bước C**. ĐỪNG lặp vô hạn, đừng bấm dồn dập.

    **Bước C — chẩn đoán phạm vi** (bảng bên trên): mở PDF một BOL cũ.
    - BOL cũ `canvas:2` → lỗi riêng BOL mới → quay lại Bước B thêm **1 vòng 5 phút** nữa.
    - BOL cũ `canvas:0` → **sự cố toàn site** → sang Bước D ngay, đừng thử tiếp.

    **Bước D — NHỜ NGƯỜI DÙNG.** Báo đúng các thông tin sau để họ tự tải:
    > Đơn `<PO>` — AACT không sinh được PDF sau `<n>` lần thử trong `<t>` phút.
    > BOL **`<BOL_ID>`** · PRO **`<PRO#>`** (đã tạo thật, ĐỪNG tạo lại).
    > Nhờ bạn mở 2 link này trên Chrome và tải file về:
    > • BOL: `https://www.aaacooper.com/workspace/bol/<BOL_ID>/pdf`
    > • Label: `https://www.aaacooper.com/workspace/shipping-label?sourceBolNumber=<BOL_ID>` → Next → Create Label PDF
    > Rồi gửi lại đây 2 file, tôi đổi tên thành `<PO>_BOL.pdf` / `<PO>_ShippingLabel.pdf` và đưa lên Drive.

    Người dùng gửi file về → `file_upload` vào tab `example.com` → base64 → POST vào folder `<PO>` (như cách up PackingSlip). Đủ 3 file thì mail kho tự chạy.

    ⏱ **Mốc thời gian thực tế đã gặp:**
    | BOL | Kẹt bao lâu | Kết cục |
    |---|---|---|
    | 4169923 | ~4 phút | tự khỏi, `/pdf` render bình thường |
    | 4170150 · 4171087 | >30 phút (sự cố toàn site, BOL cũ cũng `canvas:0`) | tự khỏi sau đó |
    | 4171087 (thử lại 29/07) | **hồi ở VÒNG 2** của quy trình reload | tải được blob 93KB, Label 128KB ngay sau đó |

    ✅ **Vòng lặp reload có hiệu quả thật** — lần chạy 29/07 vòng 1 vẫn `canvas:0`, vòng 2 (reload + cài lại hook + chờ 20s) ra `canvas:2` luôn. Nên **đừng bỏ cuộc sau 1 lần**.

    ### 📌 Bổ sung 29/07/2026 (BOL 4171194 / PO 75865702) — 3 điều mới
    1. **BOL PDF hồi ở VÒNG 6, mất ~8 phút.** Vòng 1–5 (`canvas:0` liên tục, kể cả BOL cũ 4171087 cũng `canvas:0`). → Nâng trần lên **6–7 vòng** thay vì 5; sự cố toàn site vẫn có thể tự khỏi.
    2. **BOL PDF và Shipping Label hồi KHÔNG cùng lúc.** BOL lấy được rồi mà Label vẫn kẹt thêm **~10 phút** nữa. Đừng kết luận "AACT đã hồi" chỉ vì tải được BOL — phải thử Label riêng.
    3. 🔴 **`Create Label PDF` có lúc chỉ ăn khi click bằng TOẠ ĐỘ, không ăn bằng ref.** Đã click ~6 lần qua `find`→`left_click ref` đều không mở tab. Chụp screenshot lấy toạ độ nút rồi `left_click coordinate` → **mở tab ngay lần đầu**.
       → Thứ tự thử: JS click (không bao giờ ăn) → click theo **ref** → **click theo TOẠ ĐỘ** (chốt hạ).
       ⚠️ Ref có thể hết hạn giữa chừng (`No element found with reference`) — lúc đó bắt buộc dùng toạ độ.

    ⏱ **Tổng thời gian đơn 75865702: ~20 phút** cho riêng khâu lấy 2 file PDF. Nếu gấp thì nhờ người dùng tải tay ngay từ đầu.

    ### ✅ Việc VẪN LÀM ĐƯỢC khi AACT kẹt PDF
    Đừng để đơn treo hoàn toàn — làm phần không phụ thuộc AACT rồi chờ:
    1. `makeFolder` + upload **`<PO>_PackingSlip.pdf`**.
    2. **`fillRow` kèm `pro`** — ghi ngay PRO vào cột N. Quan trọng vì **lỗi #16**: trang `/workspace/bol/<id>` chết sau khi rời đi, không lưu kịp là mất số.
    3. Mail kho **sẽ KHÔNG tự gửi** (AACT cần đủ 3 file) → an toàn, không sợ gửi thiếu file.
    4. Khi AACT hồi: chỉ cần tải BOL + ShippingLabel bỏ vào folder `<PO>`, mail kho tự chạy.

19. **Nút `Finalize Bill of Lading` cũng KHÔNG ăn JS click (28/07/2026).**
    `button.click()` trả `'clicked finalize'` nhưng trang **đứng yên**, không lỗi validation, dữ liệu còn nguyên. Giống hệt `Create Label PDF` (mục 6a-bis).
    → **Dùng click thật**: `find "Finalize Bill of Lading button"` → `computer left_click` theo ref.
    ⚠️ Không nhất quán: đầu phiên JS click Finalize **vẫn ăn** (BOL 4169921, 4169923), về sau thì không. **Cứ dùng click thật cho chắc.**

20. **Ô Class: set bằng JS xong danh sách gợi ý VẪN MỞ.** Ảnh chụp thấy dropdown `92.5` còn bung — y hệt lỗi city của CTII. Giá trị `.value` đọc ra đúng nhưng chưa chắc đã commit.
    → Sau khi set Class bằng JS, **screenshot kiểm**; nếu danh sách còn mở thì **click thẳng vào dòng giá trị** để đóng. Đây là lý do phải chụp màn hình chứ không chỉ đọc `.value`.

17. **Navigate AACT hay lỗi trang** (`Frame is showing error page` / bounce về newtab): navigate lại **2–3 lần**, mỗi lần `wait 5–6s`; template mất thêm ~3s để nạp dữ liệu Shipper (nếu Shipper còn trống là chưa nạp xong — đợi rồi mới `find` Consignee).

---

## 8. Mẹo TIẾT KIỆM TOKEN
- Ưu tiên `read_page filter=interactive` để lấy ref; **hạn chế screenshot** — chỉ chụp/zoom khi cần xác minh (sau City Lookup, sau bỏ hazmat). Sheet không cần screenshot nữa (ghi qua web app, xem response `{ok:true}`).
- **Verify qua Drive `search_files`** thay vì screenshot để biết file đã lên.
- Dùng **URL trực tiếp** (mục 0) thay vì bấm menu/dropdown.
- Dùng lại **hằng số mục 0**, không dò lại ID/URL.
- Reuse 1 tab example.com cho các POST; set lại `window.name` đúng file trước mỗi POST.
- Gộp thao tác độc lập trong 1 lượt khi có thể.

---

## 9. THỨ TỰ CHUẨN 1 ĐƠN (rút gọn)
1. Đọc packing → PO, Customer Order, Ship To, Item, Qty.
2. Chọn carrier (`2_ChonCarrier.md`) → AACT (hoặc test giả định AACT).
3. Template BOL: sửa Consignee / Weight / bỏ Hazmat / Special Instr / FVC=200 / References → **Finalize** → lưu BOL#, PRO#.
3b. **KIỂM PRO NGAY** bằng JS (mục 6b-C): `pro` phải khác null. Nếu null → BOL không PRO → **tạo lại** (lỗi #12).
4. **makeFolder** `{po}` → lấy `folderId`+`url`. BOL PDF (URL `/bol/<id>/pdf`) & Label (URL `/shipping-label?sourceBolNumber=<id>` → Next **(có thể phải 2 lần)** → Create Label PDF) & PackingSlip → cài hook → **đợi PDF render** → bấm ⬇ → blob → window.name (`folderId` = folder `<PO>`) → example.com → POST → **verify Drive**. 3 file: `<PO>_BOL.pdf`, `<PO>_ShippingLabel.pdf`, `<PO>_PackingSlip.pdf` — TẤT CẢ vào folder `<PO>`.
5. Sheet: POST `action:'fillRow'` `{po, carrier:'AACT', customerOrder, shipTo(bỏ C/O), sku, productName, qty, pickupSchedule(mm/dd/yyyy), linkDrive:url, pro:'<PRO#>'}` → App Script tìm PO cột B, điền **C/E/F/G/H/I/J=X/K/N/P**. Mail kho tự gửi khi đủ 3 file (ngày cột K, X vào cột M). (AACT KHÔNG confirm DSM.)
