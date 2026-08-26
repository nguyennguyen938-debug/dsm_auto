#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
bol_html.py — xuất HTML của BOL ra stdout, KHÔNG dựng PDF.

Vì sao cần: `fill_bol.py` dựng PDF bằng WeasyPrint, mà WeasyPrint cần pango/cairo
— VM này không có, và cài thì phải `sudo apt` cả máy. Dự án đã chốt dùng đường
HTML→PDF của web app Apps Script thay thế. File này chỉ lấy phần HTML.

  echo '<JSON như fill_bol.py>' | python3 bol_html.py [template.html]

Toàn bộ logic điền vẫn nằm ở `fill_bol.py` — file này KHÔNG lặp lại luật nào,
chỉ gọi lại. Sửa quy tắc điền thì sửa `fill_bol.py`, đừng sửa ở đây.
"""
import sys, os, json, importlib.util

_HERE = os.path.dirname(os.path.abspath(__file__))

spec = importlib.util.spec_from_file_location('fill_bol', os.path.join(_HERE, 'fill_bol.py'))
fb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fb)

def main():
    tpl_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(_HERE, 'BOL_Form.html')
    v = json.load(sys.stdin)

    if 'items' in v:
        lines, weight, pieces = fb.compute(v['items'], fb.load_pallet())
        v.setdefault('item_lines', lines)
        v.setdefault('weight', weight)
        v.setdefault('pieces', pieces)
    if 'item_lines' not in v or 'weight' not in v or 'pieces' not in v:
        raise SystemExit('Thieu "items" (hoac item_lines/weight/pieces)')

    # Ship To -> Name + Location; CARRIER NAME + SCAC  (giống fill_bol.main)
    if 'location' not in v:
        v['ship_name'], v['location'] = fb.parse_shipto(v['ship_name'])
    if 'carrier_name' not in v:
        code = (v.get('carrier') or '').strip().upper()
        # 🔄 11/08/2026: CHO PHÉP BOL KHÔNG CÓ CARRIER.
        # Người dùng tạm ngưng khâu chọn carrier cho đơn B2B — BOL vẫn dựng bình thường,
        # riêng hai ô CARRIER NAME và SCAC để TRỐNG cho người điền tay sau.
        # Nhận cả '' lẫn 'NULL' ('NULL' là giá trị ghi ở cột C của sheet).
        if code in ('', 'NULL'):
            v['carrier'] = ''
            v['carrier_name'] = ''
        else:
            names = fb.load_carrier_names()
            if code not in names:
                raise SystemExit('Carrier %s KHONG CO trong carrier_name.csv' % code)
            v['carrier_name'] = names[code]

    html = fb.to_static(fb.build(open(tpl_path, encoding='utf-8').read(), v))

    # Ô nào chưa thay thế = template và script lệch nhau -> DỪNG, đừng xuất BOL thiếu ô.
    if '<input' in html:
        raise SystemExit('Con %d o <input> chua thay the — template va fill_bol.py lech nhau'
                         % html.count('<input'))

    sys.stdout.write(html)

if __name__ == '__main__':
    main()
