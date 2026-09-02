# Câu hỏi gửi UPS và Home Depot — về phí pickup

Soạn 09/08/2026. Mục đích: làm rõ **ai trả phí on-call pickup** và **vì sao chỉ một số ít
lần bị tính tiền**, sau khi đo đạc trên hoá đơn thật mà không tự giải thích được.

| | |
|---|---|
| UPS Billing | **(800) 811-1648** — Thứ Hai–Thứ Sáu, 8:00–18:00 giờ miền Đông (ET) |
| Hoặc | ups.com → Billing Center → Support |
| Tài khoản gửi | **1741XG** (ALL FOR WOOD) |
| Bên thứ ba trả cước | **12C8D2** (HOME DEPOT) |
| Hoá đơn nêu trong câu hỏi | **00001741XG316** — ngày 01/08/2026 |

---

## PHẦN 1 — HỎI UPS

### Câu 1 (quan trọng nhất) — vì sao chỉ 2/38 lần bị tính phí?

**Tiếng Việt:** Hoá đơn 01/08 có 38 kiện gửi từ 4 kho khác nhau, trải 6 ngày pickup. Nhân viên
đã bấm "Schedule a new pickup" cho **mọi** đơn, nhưng hoá đơn chỉ có **2** dòng phí pickup.
Vì sao? Điều gì quyết định một yêu cầu pickup có bị tính tiền hay không?

> On invoice **00001741XG316** there are 38 packages shipped from four different 3PL warehouses
> across six pickup dates. An on-call pickup was requested through ups.com for **every one** of
> those shipments. However, the invoice shows only **two** On-Call Pickup charges
> (PRN **298874F82F8** and **2914020B8DC**, total **$32.06**).
>
> Why were only two pickup requests billed while the others were not?
> What determines whether an on-call pickup request results in a charge?

---

### Câu 2 — các kho đã có xe hàng ngày chưa?

**Tiếng Việt:** Hàng đi từ kho của bên thứ ba (3PL) mà công ty không sở hữu. Nếu tài xế UPS
vốn đã ghé kho đó trong ngày, yêu cầu pickup của mình có còn bị tính tiền không?

> Our shipments originate from third-party logistics warehouses that we do not own:
>
> - 728 W RIDER ST, PERRIS, CA 92571
> - 1900A River Rd, BURLINGTON, NJ 08016
> - 1100 Logistics Parkway, RINCON, GA 31326
> - 5625 CHALLENGE DR STE 104, MEMPHIS, TN 38115
> - 28119 KATY FWY, KATY, TX 77494
> - 120 ENTERPRISE DR SW, CALHOUN, GA 30701
>
> Do any of these locations already have a scheduled daily UPS pickup?
> If a driver is already visiting the location that day, is our on-call pickup request
> still billable?

---

### Câu 3 — phí pickup có bill sang bên thứ ba được không?

**Tiếng Việt:** Cước vận chuyển đã bill sang tài khoản 12C8D2 của Home Depot. Có cách nào để
**phí pickup** cũng bill sang đó thay vì vào tài khoản 1741XG không?

> Our transportation charges are billed to third-party account **12C8D2**.
> Is there any way to have the **on-call pickup charge** billed to that same third-party
> account instead of to our account 1741XG?
>
> We already tried the following and both were rejected:
> - Pickup Creation API with `Shipper.Account.AccountNumber = 12C8D2`
>   → error **9510154** "The account number provided does not belong to the user"
> - Pickup Creation API with `PaymentMethod = 04` (pay by 1Z tracking number), using a real
>   tracking number from a shipment billed to 12C8D2
>   → error **9510127** "Tracking number does not accept pickup charge"

---

### Câu 4 — tạo qua web và tạo qua API có khác nhau về phí không?

**Tiếng Việt:** Công ty đang chuyển từ điền form trên ups.com sang dùng API. Hai cách này có
khác nhau về cách tính phí pickup không?

> Is there any difference in billing between an on-call pickup created through the ups.com
> shipping form versus one created through the Pickup Creation API?
> Both appear to generate the same type of PRN.

---

### Câu 5 — Smart Pickup

**Tiếng Việt:** Tài khoản báo chưa bật Smart Pickup. Bật thì tốn bao nhiêu, và có phủ được
nhiều địa chỉ kho không hay chỉ một địa chỉ trên hồ sơ tài khoản?

> Account 1741XG returns "This account is not set up for Smart Pickup service" (error 9510165).
>
> - What would it cost to enable Smart Pickup on this account?
> - Can Smart Pickup cover **multiple pickup addresses**, or only the single address
>   configured on the account profile?

---

### Câu 6 — kiểm chứng một pickup cụ thể

**Tiếng Việt:** Đây là pickup vừa tạo ngày 09/08. Nếu UPS trả lời được ngay thì khỏi phải chờ
hoá đơn ngày 15/08.

> For **PRN 29ED26D227B** — an on-call pickup scheduled for **8/10/2026, 1:00 PM–5:00 PM**
> at **728 W RIDER ST, PERRIS, CA 92571**, associated with tracking number
> **1Z1741XG0318888656**:
>
> - Will this pickup be billed?
> - If yes, at what rate — Same Day or Future Day?

---

## PHẦN 2 — HỎI HOME DEPOT

**Tiếng Việt:** Home Depot đang trả cước vận chuyển qua tài khoản 12C8D2, nhưng phí gọi xe
(12–20 USD mỗi lần) vẫn rơi vào tài khoản của mình. Home Depot có trả khoản này không, hoặc
có tài khoản UPS nào để dùng cho phí pickup không?

> Home Depot currently pays the UPS transportation charges for our dropship orders through
> third-party account **12C8D2** — we confirmed this on our UPS invoices, where all 41 packages
> show a billed charge of $0.00.
>
> However, the **on-call pickup fees** are still billed to our own account (**1741XG**),
> approximately **$12–20 per pickup**:
>
> ```
> Same Day Pickup   - Alternate Address - Web Request    15.75 + 4.13 fuel = 19.88
> Future Day Pickup - Alternate Address - Web Request     9.65 + 2.53 fuel = 12.18
> ```
>
> Is Home Depot able to cover the pickup fees as well?
> If so, is there a Home Depot UPS account number we should use for pickup charges?

---

## PHỤ LỤC — số liệu để đối chiếu khi họ hỏi lại

**Phí pickup đã trả, 6 hoá đơn gần nhất:**

```
Apr 04 (00001741XG146)   2 × Future Day Pickup - Web Request                    24.52
May 23 (00001741XG216)   2 × Future Day Pickup - Alternate Address - Web Req    24.66
Aug 01 (00001741XG316)   1 × Same Day + 1 × Future Day - Alternate Address      32.06
                                                                        tổng    81.24
Apr 25 (00001741XG176)   Late Payment Fee 9.9%                                   2.98
May 02 (00001741XG186)   Late Payment Fee 9.9%                                   2.98
Apr 25 (00001741XG176)   Declared Value $115.99 (+ fuel)                         6.50
Jul 04 / Jul 25 / Jun 06 / May 30 / May 16 ...                                   0.00
```

**Cước vận chuyển:** mọi kiện đều `Billed Charge 0.00`, dòng `Third Party: HOME DEPOT`.
Hoá đơn 01/08: `Total UPS Internet Shipping — 41 Package(s) — 0.00`.

**Phân bố 38 kiện của hoá đơn 01/08 theo (ngày pickup × kho):** 19 tổ hợp khác nhau —
đây là lý do con số "2 dòng phí" không giải thích được bằng việc gộp chuyến.

```
07/26 CAP 2 · 07/26 Calhoun 1 · 07/27 CAP 2 · 07/27 Calhoun 6 · 07/27 NJF02 2 · 07/27 SAV 2
07/28 CAP 2 · 07/28 Calhoun 3 · 07/28 NJF02 1 · 07/28 SAV 1 · 07/29 Calhoun 5 · 07/29 SAV 1
07/30 Calhoun 1 · 07/30 NJF02 1 · 07/30 SAV 1 · 07/31 NJF02 1 · 08/01 Calhoun 1
08/01 NJF02 3 · 08/01 SAV 2
```
