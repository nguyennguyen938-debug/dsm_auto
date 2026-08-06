#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Điền form BOL (BOL_Form.html) từ JSON -> xuất <PO>_BOL.pdf (server-side, WeasyPrint).
Dùng cho các carrier KHÁC AACT (SEFL/XGSI/BXID/CTII/FXFE/ABFS).

Cài 1 lần mỗi phiên sandbox:  pip install weasyprint --break-system-packages
Chạy:  echo '<JSON>' | python3 fill_bol.py [template.html] [out_dir]

--------------------------------------------------------------------------
CẬP NHẬT 29/07/2026 — theo yêu cầu người dùng:
  * SPECIAL INSTRUCTIONS: BỎ dòng thứ 4 (dòng kích thước pallet). Chỉ còn 3
    dòng cố định của Home Depot.
  * # PKGS  = 1 (cả ô dòng dữ liệu lẫn ô GRAND TOTAL) — luôn luôn.
  * HANDLING UNIT / QTY = 1 (cả 2 ô) — luôn luôn.
  * Bảng CUSTOMER ORDER INFORMATION và CARRIER INFORMATION: bỏ 2 hàng trống,
    chỉ còn 1 hàng nhưng cao hơn (chứa được nhiều dòng SKU).
  * ADDITIONAL SHIPPER INFO **và** COMMODITY DESCRIPTION dùng cấu trúc:
        SKU-<Model Number> Unfinished <LOẠI GỖ VIẾT HOA> <độ dài> FT
    Nhiều SKU -> mỗi SKU một dòng.
    Ví dụ:  SKU-812250-B Unfinished HEVEA 12 FT
            SKU-810250-B Unfinished HEVEA 10 FT
  * PACKAGE / QTY (Pieces) = tổng Qty Shipped của mọi SKU.
  * WEIGHT = tổng (cột K × Qty) của mọi SKU, cộng 55 MỘT lần cho pallet.
--------------------------------------------------------------------------

JSON fields:
  date            : ngày viết form (vd "07/29/2026")
  po              : số PO (BOL Number + Pick Up #, và đặt tên file)
  carrier         : mã carrier (SEFL/XGSI/BXID/CTII/FXFE/ABFS)
  ship_name       : tên người nhận (store -> gồm cả dòng "C/O ...")
  ship_address    : địa chỉ đường phố
  ship_csz        : "Thành phố, Bang Zip" (vd "Augusta, ME 04330")
  phone           : số điện thoại
  cust_order_num  : "<Customer Order #> (PO <po>)"
  items           : [{"model": "812250-B", "qty": 2}, ...]   <-- KHUYẾN NGHỊ
                    Script tự tra pallet.csv -> dòng SKU, weight, pieces.

  (Ghi đè thủ công nếu cần — bỏ qua phần tự tính:)
  weight          : Weight tổng đã tính
  pieces          : tổng số tấm
  item_lines      : list các dòng mô tả đã format sẵn
"""
import sys, re, json, os, csv

_HERE = os.path.dirname(os.path.abspath(__file__))
PALLET_CSV = os.path.join(_HERE, '..', '05_TraCuu', 'pallet.csv')
CARRIER_NAME_CSV = os.path.join(_HERE, '..', '05_TraCuu', 'carrier_name.csv')


# ------------------------------------------------- carrier_name.csv (31/07/2026)
def load_carrier_names(path=CARRIER_NAME_CSV):
    """'AACT' -> 'AAA Cooper Transportation'."""
    d = {}
    with open(path, encoding='utf-8-sig') as fh:
        for r in csv.reader(fh):
            if len(r) >= 2 and r[0].strip() and r[0].strip().upper() != 'CARRIER CODE':
                d[r[0].strip().upper()] = r[1].strip()
    return d


def parse_shipto(s):
    """Tách Ship To thành (Name, Location) theo quy tắc chốt 31/07/2026.

    Store  : 'Scott Doering C/O THD Ship to Store #0475'
             -> ('To The Care of Scott Doering', 'THD Store 0475')
    Khách  : 'Ali Tanveer'  ->  ('Ali Tanveer', '')
    """
    m = re.search(r'\bC\s*/\s*O\b', s, re.I)
    if not m:
        return s.strip(), ''
    name = s[:m.start()].strip(' ,-')
    rest = s[m.end():].strip(' ,-')
    num = re.search(r'#\s*(\w+)', rest)
    loc = 'THD Store %s' % num.group(1) if num else rest
    return 'To The Care of %s' % name, loc


# ---------------------------------------------------------------- pallet.csv
def load_pallet(path=PALLET_CSV):
    """A=SKU, B=Description, C/D/E=Product Dim, F/G/H=Pallet Dim, K=Packaged Gross Weight."""
    rows = {}
    with open(path, encoding='utf-8-sig') as fh:
        for r in csv.reader(fh):
            if r and re.fullmatch(r'\d+', r[0].strip()):
                rows[r[0].strip()] = r
    return rows


def sku_line(model, pal):
    """'812250-B' + dòng pallet.csv -> 'SKU-812250-B Unfinished HEVEA 12 FT'."""
    m = re.search(r'Unfinished\s+([A-Za-z]+)', pal[1])
    wood = m.group(1).upper() if m else '?'
    inches = float(pal[2])                       # cột C = Product Length (inch)
    ft = inches / 12.0
    ft = int(ft) if abs(ft - round(ft)) < 1e-9 else round(ft, 1)
    return 'SKU-%s Unfinished %s %s FT' % (model, wood, ft)


def compute(items, pallet):
    """-> (list dòng mô tả, weight tổng đã +55, tổng pieces)."""
    lines, wsum, pieces = [], 0.0, 0
    for it in items:
        model = str(it['model']).strip()
        qty = int(it['qty'])
        sku = re.match(r'(\d+)', model).group(1)
        if sku not in pallet:
            raise SystemExit('SKU %s KHONG CO trong pallet.csv' % sku)
        pal = pallet[sku]
        lines.append(sku_line(model, pal))
        wsum += float(pal[10]) * qty             # cột K × Qty
        pieces += qty
    weight = wsum + 55                           # +55 pallet, MỘT lần
    weight = int(weight) if abs(weight - round(weight)) < 1e-9 else round(weight, 1)
    return lines, weight, pieces


# ---------------------------------------------------------------- điền form
def build(tpl, v):
    h = tpl

    def f1(s, tag, val):
        return s.replace(tag, tag[:-1] + ' value="%s">' % val, 1)

    def fseq(s, tag, vals):
        for x in vals:
            s = s.replace(tag, tag[:-1] + ' value="%s">' % x, 1)
        return s

    def fta(s, tag, val):
        return s.replace(tag, tag.replace('></textarea>', '>%s</textarea>' % val), 1)

    h = f1(h, '<input class="red fill" type="text" style="width:60%">', v['carrier_name'])
    h = f1(h, '<input class="red fill" type="text" style="width:64%">', v['po'])
    h = f1(h, '<input class="red fill" type="text" style="width:52%">', v['carrier'])   # SCAC
    h = f1(h, '<input class="red fill" type="text" style="width:85%">', v['ship_name'])
    h = f1(h, '<input class="red fill" type="text" style="width:80%">', v['location'])
    h = f1(h, '<input class="red fill" type="text" style="width:82%">', v['ship_address'])
    h = f1(h, '<input class="red fill" type="text" style="width:75%">', v['ship_csz'])
    h = f1(h, '<input class="fill" type="text" style="border-bottom:1px solid #000">', v['po'])
    h = f1(h, '<input class="fill" type="text" style="width:45%">', v['phone'])

    # ⚠️ SPECIAL INSTRUCTIONS dòng 4: CỐ Ý KHÔNG ĐIỀN (bỏ từ 29/07/2026).
    # Ô input vẫn nằm trong template; to_static() sẽ biến nó thành <span></span> rỗng.

    # 2 ô red không style, theo thứ tự: Date, Customer Order Number
    h = fseq(h, '<input class="red fill" type="text">', [v['date'], v['cust_order_num']])

    # 10 ô ctr theo thứ tự:
    #   #PKGS, WEIGHT, GT_#PKGS, GT_WEIGHT,
    #   HU_QTY, PKG_QTY, WEIGHT, GT_HU_QTY, GT_PKG_QTY, GT_WEIGHT
    w, p = str(v['weight']), str(v['pieces'])
    h = fseq(h, '<input class="ctr fill" type="text">',
             ['1', w, '1', w, '1', p, w, '1', p, w])

    # 2 textarea: Additional Shipper Info, Commodity Description — cùng nội dung
    body = '<br>'.join(v['item_lines'])
    h = fta(h, '<textarea class="fill" rows="4"></textarea>', body)
    h = fta(h, '<textarea class="fill" rows="4"></textarea>', body)
    return h


def to_static(h):
    def rep(m):
        cls, val = m.group(1), m.group(2)
        if 'red' in cls:
            return '<span class="red b">%s</span>' % val
        if 'ctr' in cls:
            return '<span class="b" style="display:block;text-align:center">%s</span>' % val
        return '<span class="b">%s</span>' % val

    h = re.sub(r'<input class="([^"]*)"[^>]*value="([^"]*)"[^>]*>', rep, h)
    h = re.sub(r'<input class="[^"]*"[^>]*>', '<span></span>', h)          # ô trống còn lại
    h = re.sub(r'<textarea class="[^"]*"[^>]*>(.*?)</textarea>',
               lambda m: '<div>%s</div>' % m.group(1), h, flags=re.S)
    h = h.replace('<div class="toolbar no-print">',
                  '<div class="toolbar no-print" style="display:none">')
    return h


def main():
    tpl_path = sys.argv[1] if len(sys.argv) > 1 else 'BOL_Form.html'
    out_dir = sys.argv[2] if len(sys.argv) > 2 else '.'
    v = json.load(sys.stdin)

    if 'items' in v:
        lines, weight, pieces = compute(v['items'], load_pallet())
        v.setdefault('item_lines', lines)
        v.setdefault('weight', weight)
        v.setdefault('pieces', pieces)
    if 'item_lines' not in v or 'weight' not in v or 'pieces' not in v:
        raise SystemExit('Thieu "items" (hoac item_lines/weight/pieces)')

    # Ship To -> Name + Location (store thi 'To The Care of ...' + 'THD Store NNNN')
    if 'location' not in v:
        v['ship_name'], v['location'] = parse_shipto(v['ship_name'])
    # CARRIER NAME = ten day du; SCAC = ma carrier
    if 'carrier_name' not in v:
        names = load_carrier_names()
        code = v['carrier'].strip().upper()
        if code not in names:
            raise SystemExit('Carrier %s KHONG CO trong carrier_name.csv' % code)
        v['carrier_name'] = names[code]

    tpl = open(tpl_path, encoding='utf-8').read()
    html = to_static(build(tpl, v))
    import weasyprint
    out = os.path.join(out_dir, '%s_BOL.pdf' % v['po'])
    weasyprint.HTML(string=html, base_url='.').write_pdf(out)
    print('OK ->', out, os.path.getsize(out), 'bytes')
    print('   CARRIER NAME = %s   |   SCAC = %s' % (v['carrier_name'], v['carrier']))
    print('   Ship To Name = %s' % v['ship_name'])
    print('   Location     = %s' % (v['location'] or '(trong - khach le)'))
    print('   weight=%s  pieces=%s' % (v['weight'], v['pieces']))
    for l in v['item_lines']:
        print('   ' + l)


if __name__ == '__main__':
    main()
