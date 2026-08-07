#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
dat-mat-khau.py — nhập mật khẩu vào 11_TaiVe/creds.json một cách an toàn.

    python3 dat-mat-khau.py            # hiện trạng thái rồi hỏi từng site
    python3 dat-mat-khau.py lecangs    # chỉ đặt cho một site

Vì sao dùng script này thay vì gõ thẳng vào lệnh:
  - Mật khẩu **không hiện trên màn hình** (getpass đọc từ /dev/tty).
  - **Không vào ~/.bash_history** như khi gõ `... pass='abc' ...`.
  - Không phải lo escape ký tự đặc biệt ($ ! " ' \\) của shell.
  - File luôn được chmod 600 sau khi ghi.

`11_TaiVe/**` đã nằm trong .gitignore nên không thể lỡ tay commit.
"""
import json, os, sys, getpass, stat

CREDS = '/home/Lenovo/dsm_auto/DSM_TuDongHoa/11_TaiVe/creds.json'

SITE = {
    'aact':    ('AAA Cooper  (aaacooper.com)',      'tai khoan email, vd info@allforwood.com'),
    'lecangs': ('Lecangs     (app.lecangs.com)',    'vd william@allforwood.com'),
    'ups':     ('UPS         (ups.com)',            'vd info@allforwood.com — LUU Y: UPS con hoi ma MFA qua mail'),
}

def doc():
    try:
        with open(CREDS, encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return {}
    except json.JSONDecodeError as e:
        sys.exit(f'❌ {CREDS} hong JSON: {e}')

def ghi(d):
    tam = CREDS + '.tmp'
    with open(tam, 'w', encoding='utf-8') as f:
        json.dump(d, f, indent=1, ensure_ascii=False)
    os.chmod(tam, stat.S_IRUSR | stat.S_IWUSR)      # 600 TRUOC khi doi ten
    os.replace(tam, CREDS)                          # doi ten la thao tac nguyen tu

def trangThai(d):
    print(f'\n{"site":10}{"tai khoan":34}{"mat khau"}')
    print('-' * 62)
    for k, (ten, _) in SITE.items():
        c = d.get(k) or {}
        u = c.get('user') or '(chua co)'
        p = 'da co' if c.get('pass') else '** CHUA CO **'
        print(f'{k:10}{u[:32]:34}{p}')
    print()

def dat(d, key):
    ten, goiY = SITE[key]
    cu = d.get(key) or {}
    print(f'\n=== {ten} ===')
    u = input(f'  Tai khoan [{cu.get("user") or goiY}]: ').strip() or cu.get('user') or ''
    if not u:
        print('  bo qua (chua co tai khoan)'); return
    p1 = getpass.getpass('  Mat khau (go xong Enter, khong hien gi): ')
    if not p1:
        print('  bo qua (khong nhap gi)'); return
    p2 = getpass.getpass('  Nhap lai cho chac: ')
    if p1 != p2:
        print('  ❌ hai lan nhap KHAC nhau — bo qua, khong ghi gi'); return
    cu.update({'user': u, 'pass': p1})
    d[key] = cu
    print(f'  ✅ da dat cho {key} ({len(p1)} ky tu)')

def main():
    d = doc()
    trangThai(d)
    chon = [a.lower() for a in sys.argv[1:] if a.lower() in SITE] or list(SITE)
    for k in chon:
        dat(d, k)
    ghi(d)
    print(f'\nDa luu {CREDS} (chmod 600).')
    trangThai(d)
    print('Kiem thu:  cd /home/Lenovo/dsm_auto/DSM_TuDongHoa/10_VM_Tool && node kiem-dang-nhap.mjs\n')

if __name__ == '__main__':
    main()
