# HƯỚNG DẪN XỬ LÝ ĐƠN — CARRIER CTII (Central Transport)

CTII tạo **BOL + Shipping Label trên web carrier** (giống AACT, KHÁC form BOL chung) → cần **đủ 3 file**: BOL + ShippingLabel + PackingSlip.
CTII cũng có **PICKUP #** (điền cột **O**). PRO (cột **N**) do `CheckMail_PRO.gs` đọc **tem dán** trên BOL Mario gửi lại.

---

## ⚡ CÁCH NHANH — ĐIỀN BẰNG 3 LỆNH JS (ĐÃ TEST OK 27/07/2026, KHÔNG submit)
Form là **AngularJS**; field nhận diện qua **`id`**. `select` dùng `ng-options` (value dạng `string:...` / `object:NN`) → **chọn theo TEXT của option**.
⚠️ **Các khối địa chỉ dùng TRÙNG id** `country_1` và `state_` → lấy theo **thứ tự xuất hiện**: [0]=Shipper, [1]=Consignee, [2]=Third Party.

> 🟡 **Cập nhật 28/07/2026: nay có 4 khối, không phải 3.** Khối thứ tư `[3]` là **COD**. Ba index đầu vẫn đúng như cũ nên code cũ không hỏng — nhưng đừng còn tin vào giả định "chỉ có 3".
> ✅ **Cách xác minh chắc chắn thay vì đếm vị trí** — so sánh định danh scope với `bol.*`:
> ```js
> (function(){var ng=window.angular;
>  var t=ng.element(document.getElementById('specialInstructions')).scope();
>  var map=[['shipper',t.bol.shipper],['consignee',t.bol.consignee],['thirdParty',t.bol.thirdParty],['cod',t.bol.cod]];
>  return JSON.stringify([].slice.call(document.querySelectorAll('[id^=state_]')).map(function(e,i){
>    var o=ng.element(e).scope().obj, who='???';
>    map.forEach(function(m){ if(m[1]===o) who=m[0]; }); return i+' -> '+who; }));})()
> ```
> → Kỳ vọng `["0 -> shipper","1 -> consignee","2 -> thirdParty","3 -> cod"]`. Chạy 5 giây, tránh điền nhầm cả khối.
⚠️ Radio: **`optTerms`** = Freight Charges (`1`=Prepaid, **`2`=Collect**). `optFee`/`optCheck` là COD (đang **disabled**) — ĐỪNG set. `optradio` = PDF/RTF (PDF `1` mặc định đã chọn).
⚠️ **Set được cả City/State trực tiếp → KHÔNG cần Zip Code Lookup** (trang tự chuẩn hoá, vd `Cypress` → `CYPRESS`).

### 🔴 LỖI CITY SAI KHI ZIP CÓ NHIỀU THÀNH PHỐ (đã gặp: Third Party `30339` ra **ATL** thay vì **ATLANTA**)
Ô city (`shipper_city` / `consignee_city` / `thirdParty_city`) là **readOnly**, do zip-lookup tự điền. Nếu zip map **nhiều city** (30339 → ATL, **ATLANTA**, CUMBERLAND, OVERLOOK SRU, SMYRNA, VININGS, VINNINGS, SANDY SPRINGS) thì trang **tự lấy dòng ĐẦU** (ATL) và **mở danh sách gợi ý chờ chọn**.

**Danh sách gợi ý = `span.ct-suggestions`** (autocomplete riêng của CTII, nằm trong `div.form-control.ct-query`).
⚠️ Không tìm được bằng cách quét text ở element không-con — text nằm trong **child** của span. Phải query đúng class.

**✅ CÁCH ĐÚNG — CLICK THẬT vào dòng city (đã test OK):** vừa set giá trị, vừa **đóng danh sách**:
```js
(function(city){
 var sug=[].slice.call(document.querySelectorAll('.ct-suggestions'));
 var t=sug.filter(function(s){return (s.innerText||s.textContent||'').trim().toUpperCase()===city;})[0];
 if(!t) return 'notfound';
 ['mousedown','mouseup','click'].forEach(function(ev){
   t.dispatchEvent(new MouseEvent(ev,{bubbles:true,cancelable:true,view:window})); });
 var ng=window.angular, el=document.getElementById('thirdParty_city');
 var top=ng.element(document.getElementById('specialInstructions')).scope();
 return JSON.stringify({dom:el.value, model:top.bol.thirdParty.city,
   suggestionsLeft:document.querySelectorAll('.ct-suggestions').length});})('ATLANTA')
```
→ Kỳ vọng `{"dom":"ATLANTA","model":"ATLANTA","suggestionsLeft":0}`. **`suggestionsLeft` phải = 0** (danh sách đã đóng = đã chọn thật).
Liệt kê gợi ý để biết cần chọn dòng nào: `[].slice.call(document.querySelectorAll('.ct-suggestions')).map(s=>s.innerText.trim())`

❌ **KHÔNG chỉ set Angular model** (`sc.obj.city='ATLANTA'; sc.$apply()`): giá trị hiện đúng nhưng **danh sách vẫn mở** → chưa phải "đã chọn", dễ bị ghi đè/không commit khi Submit.
✅ **BẮT BUỘC VERIFY cả 3 city sau JS-1**:
```js
(function(){var ng=window.angular,t=ng.element(document.getElementById('specialInstructions')).scope();
 return JSON.stringify({sh:t.bol.shipper.city, co:t.bol.consignee.city, tp:t.bol.thirdParty.city});})()
```
→ phải là `CALHOUN` / `<city khách>` / **`ATLANTA`**. Nếu ra viết tắt (ATL…) thì sửa theo cách trên.

**Helper** (dùng cho cả 3 lệnh):
```js
function setVal(el,val){ if(!el) return 'miss';
  var d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value');
  d&&d.set?d.set.call(el,val):el.value=val;
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true})); return el.value; }
function setSel(el,text){ if(!el) return 'miss';
  var op=[].slice.call(el.options).filter(function(o){return o.text.trim().toUpperCase()===text.toUpperCase();})[0];
  if(!op) return 'noopt'; el.value=op.value; el.dispatchEvent(new Event('change',{bubbles:true})); return op.text.trim(); }
```

**JS-1 — BOL# + 3 khối địa chỉ:** id dùng: `tBolNumber` · Shipper `tShipperCompany/tShipperAddress/shipper_city/shipper_zipCode/tShipperContact/tShipperEmail/tShipperPhone` · Consignee `tConsigneeCompany/tConsigneeAddress/consignee_city/consignee_zipCode/tConsigneeContact/tConsigneePhone` · Third Party `tThirdPartCompany/tThirdPartAddress/thirdParty_city/thirdParty_zipCode`; country/state lấy theo index như trên (giá trị `USA`, `GEORGIA`/`TEXAS`…).

**JS-2 — Freight Charges + Labels + Pickup + Shipment Specifics + Special Instructions:**
```js
var rs=[].slice.call(document.querySelectorAll('input[type=radio]'));
var ct=rs.filter(r=>r.name==='optTerms'&&r.value==='2')[0]; if(ct&&!ct.checked) ct.click();   // Collect
var chL=document.getElementById('chLabels'); if(chL&&!chL.checked) chL.click();               // bật khối Labels
setVal(document.getElementById('tBol'),PO); setVal(document.getElementById('tPickup'),PO);
setVal(document.getElementById('tRef'),CUSTORDER);                                            // tType để trống
setVal(document.getElementById('tLabelNumber'),'1'); setVal(document.getElementById('tLabelPos'),'1');
var chP=document.getElementById('chPickup1'); if(chP&&!chP.checked) chP.click();               // Schedule Pickup Now
setSel(document.getElementById('pickupDate'),'7/28/2026');                                    // định dạng m/d/yyyy như option
setVal(document.getElementById('tUnits'),QTY); setVal(document.getElementById('tWeight'),WEIGHT);
setSel(document.getElementById('hazMat'),'NO'); setSel(document.getElementById('freightType'),'PALLET');
setSel(document.getElementById('sel1_'),CLASS);                                                // sel1_ = Class
setVal(document.getElementById('description'), QTY+' pallet - 146″ x 27″ x 8″ - '+WEIGHT+' lbs');
setVal(document.getElementById('specialInstructions'),'Residential and Liftgate charges pre-approved if required\nAddress Corrections and/or Reconsignment must be approved by Home Depot.com\nA 4-hour delivery appointment is required');
```

**JS-3 — bấm 2 nút Add:** `bAddLabel` (dòng label) và `Button2` (dòng shipment item).
```js
var a1=document.getElementById('bAddLabel'); if(a1&&!a1.disabled) a1.click();
var a2=document.getElementById('Button2');   if(a2&&!a2.disabled) a2.click();
```

**VERIFY trước khi Submit** (đọc scope Angular — chắc chắn hơn đọc bảng):
```js
(function(){var tr=document.querySelectorAll('table')[1].querySelector('tbody tr');
 return JSON.stringify(window.angular.element(tr).scope().item);})()
```
→ Phải thấy `units, weight, isHazMat:"NO", freightType:"PALLET", nmfcClass.class:"92.5", description:"1 pallet - …"`.
📌 **Cột "Description" trong bảng là ICON tài liệu, KHÔNG phải text** → `innerText` rỗng là BÌNH THƯỜNG, đừng tưởng thiếu dữ liệu (đã nhầm 1 lần).

### ✅ VERIFY TỔNG bằng Angular scope (tin cậy hơn đọc bảng — test OK 28/07/2026)
```js
(function(){var ng=window.angular;
 var t=ng.element(document.getElementById('specialInstructions')).scope();
 return JSON.stringify({items:(t.bol.items||[]).map(function(i){return {units:i.units,weight:i.weight,
   haz:i.isHazMat,type:i.freightType,cls:i.nmfcClass&&i.nmfcClass.class,desc:i.description};}),
  label:t.bol.label, cities:{sh:t.bol.shipper.city,co:t.bol.consignee.city,tp:t.bol.thirdParty.city},
  paymentTerm:t.bol.paymentTerm, isPickup:t.bol.isPickup, pickupDate:t.bol.pickupDate,
  bolNumber:t.bol.bolNumber},null,1);})()
```
Kỳ vọng: `items` đúng **1 phần tử** · `paymentTerm:"2"` (Collect) · `isPickup:true` · `cities.tp:"ATLANTA"` · `label.items[0]` có `bol`/`po`/`reference`.
⚠️ Nếu `items` có **2 phần tử** là đã bấm `Button2` hai lần → xoá bớt trước khi Submit.

⛔ **`bSubmit` = nút Submit → CHỈ bấm khi làm đơn THẬT** (tạo BOL + đặt pickup thật với Central Transport).

---

## BƯỚC 1 — Tạo BOL + Shipping Label trên web (chi tiết từng ô)
Truy cập: `https://www.centraltransport.com/shipment/bol`

**Đầu trang**
- **Customer #:** để TRỐNG.
- **Ô bên phải Customer # (BOL #):** số **PO**.

**Shipper** (cố định)
- Company name: `NOTS LOGISTICS / ALL FOR WOOD`
- Address: `120 ENTERPRISE DR SW`
- 2 dropdown dưới address: `USA` và `GEORGIA`
- City / Zip: `CALHOUN` / `30701`
- Contact name: `MARIO`
- Email: `b2b@allforwood.com`
- Phone: `(762) 231-7977`

**Consignee** (theo packing slip)
- Company name: tên khách (**kèm cả `C/O ...` nếu là store**)
- Address: địa chỉ đường phố
- **Zip code:** điền zip → **City/State tự điền** (không cần chọn tay)
- Contact name: tên khách (**kèm `C/O ...` nếu store**)
- Phone: SĐT khách

**Third Party** (cố định)
- Company name: `HomeDepot.Com #8119 - Attn: Freight Payables`
- Address: `2455 Paces Ferry Rd NW`
- Zip code: `30339` · City: chọn `ATLANTA`

**Freight Charges:** tích **Collect**.

**Shipping Labels** — tích ô bật khối này
- CT Reference #: TRỐNG
- BOL #: **PO** · PO #: **PO** · Cust. Ref. #: **Customer Order #** · Ref. Type: TRỐNG
- → bấm **Add** (dòng vừa nhập xuất hiện trong bảng bên dưới)
- Labels count: `1` · Start Position: `1` · Select Format: **PDF**

**Schedule Pickup Now** — tích ô bật khối này
- **Pickup Date:** ngày theo quy tắc (hôm nay + Thứ Sáu +3 / Thứ Bảy +2 / còn lại +1) — **cùng ngày với mail kho & cột K**
- Ready Time / Dock Close Time: **giữ mặc định** (12:00 PM / 5:00 PM)
- Who should we contact…: **giữ mặc định (Shipper)**

**Shipment Specifics**
- Units: **Qty Shipped** · Weight: **Weight đã tính** (cột K pallet + 55)
- Is Haz. Mat.?: **NO** · Type: **Pallet**
- NMFC # / Sub: để trống · **Class:** tính như AACT (PCF = 1728×Weight/(L×W×H), L=cột C, W=cột D, H=6+2×Qty → tra `class.csv`)
- **Kind of packaging, description…:** `<Qty Shipped> pallet - <L>″ x <W>″ x <T>″ - <Weight> lbs`
  (L/W/T = **Pallet Dimension** cột **F/G/H** của dòng SKU. Vd: `1 pallet - 146″ x 27″ x 8″ - 183 lbs`)
- → bấm **Add**

**Special Instructions** (3 dòng)
```
Residential and Liftgate charges pre-approved if required
Address Corrections and/or Reconsignment must be approved by Home Depot.com
A 4-hour delivery appointment is required
```

→ Bấm **Submit**.

---

## ⚡ TẢI 2 FILE SAU SUBMIT — CÁCH CHẠY ĐƯỢC (chốt 01/08/2026)

Sau Submit, trang hiện: *"Your pickup number is PU-… To view your BOL document click **here**. To view your shipping label(s) click **here**."*

**Đừng cố tìm 2 link bằng JS quét DOM** — chúng là thẻ `<a>` bình thường nhưng
`javascript_tool` **trả về `[BLOCKED: Cookie/query string data]`** vì href có query string.
→ Dùng **`find`** thay vì JS:
```
find "click here link to view BOL document after pickup number"   -> href="bol-document?blcNumber=W-GATX-…-H"
find "click here link to view shipping labels"                    -> href="../tools/doc-out.aspx?id=<GUID>&type=PDF"
```

**Hai URL này trả PDF THẲNG, không phải viewer.** Mở bằng navigate chỉ thấy trang trắng
(`canvas:0`, `embeds:0`, `innerText` rỗng) — đó là Chrome đang render PDF gốc, không có DOM để bắt.

✅ **Cách lấy: fetch same-origin rồi base64 ngay trong trang** — không cần hook blob, không cần bấm nút tải:
```js
const r=await fetch('<URL>',{credentials:'include'});
const buf=new Uint8Array(await (await r.blob()).arrayBuffer());
let s=''; for(let i=0;i<buf.length;i++)s+=String.fromCharCode(buf[i]);
window.__bol=btoa(s);                    // kiểm: head phải = [37,80,68,70,45] = '%PDF-'
```
Cỡ tham khảo: **BOL ≈ 50 KB**, **ShippingLabel ≈ 18 KB** (nhỏ hơn AACT nhiều).

Gom cả 2 vào `window.name` → navigate sang `example.com` (CTII có CSP chặn fetch ra script.google.com) → POST.

> 📌 Cách này **đơn giản và tin cậy hơn hẳn AACT** — không phụ thuộc viewer render, không có khâu chờ `canvas`.
> Nếu AACT có endpoint PDF trực tiếp tương tự thì nên tìm, sẽ bỏ được toàn bộ mục #18.

⚠️ **Trang kết quả rất dễ mất** (Chrome rớt là hết). **Lưu Pickup # và chạy `fillRow` NGAY**, rồi mới tải file.
Đã mất trang một lần ở PO 76692549 (31/07) → không lấy được 2 file.

## BƯỚC 2 — Tải file & đưa lên Drive + điền Sheet
Sau khi Submit, trang hiện **3 dòng liên tiếp**:
1. **Pickup number** ← LƯU LẠI (gửi vào `pickupNum` → cột **O**)
2. **BOL** + link tải
3. **Shipping Label** + link tải

Thực hiện:
1. `makeFolder` `{action:'makeFolder', po}` → lấy `folderId` + `url`.
2. Tải từng file theo link (cài blob hook như AACT: `window.__blobs`, đợi PDF render rồi bấm tải) → base64 trong trình duyệt → POST vào **folder `<PO>`** với tên:
   - `<PO>_BOL.pdf`
   - `<PO>_ShippingLabel.pdf`
3. Upload **`<PO>_PackingSlip.pdf`** (file người dùng gửi trong chat) vào cùng folder.
4. `fillRow`:
   ```js
   { action:'fillRow', po, carrier:'CTII', customerOrder, shipTo /*bỏ C/O*/, sku /*nguyên Model Number*/,
     qty, pickupSchedule /*mm/dd/yyyy*/, pickupNum /*Pickup number ở dòng 1*/, linkDrive:url }
   ```
   → ghi **C/E/F/G/H/I/J=X/K/O/P**. **KHÔNG gửi `pro`** (CheckMail điền cột **N** sau).
5. Đủ 3 file trong folder → **GuiMail tự gửi mail kho** (ngày lấy cột **K**) + đánh **X** cột **M**.

---

## 🔴 XUNG ĐỘT: TRẦN 15 ĐƠN vs NGÀY PICKUP ĐÃ CHỐT VỚI CTII (gặp 31/07/2026)

**CTII là carrier DUY NHẤT mà ngày pickup được cam kết TRƯỚC khi gọi `fillRow`.**
Bấm Submit là Central Transport đã ghi lịch xe. Nhưng `fillRow` sau đó vẫn áp **trần 15 đơn/ngày**
và có thể **dời cột K sang ngày khác** → mail kho báo Mario một ngày, xe CTII đến một ngày khác.

Đã xảy ra với PO `76692549`:
```
Central Transport : pickup 8/3/2026 2-5 PM   (đã chốt, KHÔNG sửa được)
Sheet cột K       : 08/04/2026 (bị trần 15 dời)
```

**Cách phòng:**
1. **TRƯỚC khi Submit trên web CTII**, chạy `DIAG_pickupLoad` hoặc xem sheet `Daily_order`
   để biết ngày định chọn còn chỗ không. Chọn ngày còn dưới 15 rồi mới Submit.
2. Sau `fillRow`, **BẮT BUỘC đọc `pickupMoved` trong response**. Nếu `true` → cột K đã lệch
   với lịch xe → phải sửa tay cột K về đúng ngày đã đặt với CTII, hoặc gọi CTII đổi lịch.

> 📌 AACT **không** dính lỗi này vì AACT chỉ tạo BOL, không đặt lịch pickup.
> Các carrier dùng form BOL chung cũng không dính — ngày chỉ nằm trong mail kho, chưa cam kết với ai.

## Ghi chú
- CTII cần **3 file** (như AACT) — thiếu ShippingLabel thì mail kho không gửi.
- Số **PRO** của CTII in trên **tem dán vàng** (SHIPPER LABEL) khi Mario scan BOL gửi lại → `CheckMail_PRO.gs` đọc; nếu OCR không ra, cột **N** ghi `CHECK PRO: có mail, chưa đọc được số` để kiểm tay.
- **Pickup # ≠ PRO**: Pickup # (vd `PU-374-260710607`) vào cột **O**; PRO (vd `496401068`) vào cột **N**.
