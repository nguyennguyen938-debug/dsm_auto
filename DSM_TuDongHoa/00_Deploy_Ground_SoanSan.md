# SOẠN SẴN — deploy luồng B2C + đơn hỗn hợp lên cron

**Trạng thái: đã chuẩn bị xong, CHƯA bật.** Khi anh yêu cầu, làm theo mục 3.

---

## 1. NHỮNG GÌ ĐÃ SOẠN

| File | Việc |
|---|---|
| `10_VM_Tool/chay-ground.sh` | Wrapper cho cron — flock, `--max`, log riêng, dịch mã thoát |
| `10_VM_Tool/kiem-phien-lecangs.mjs` | Kiểm phiên trước, thoát `3` nếu chết |
| `xu-ly-ground.mjs --sheet b2c` | Phần B2C của đơn hỗn hợp (kho Lecangs) |
| `xu-ly-don.mjs --sheet b2b` | Phần B2B của đơn hỗn hợp (kho Calhoun) |

**Ba khâu trong wrapper**, mỗi khâu một mức rủi ro, đều **mặc định TẮT**:

| Khâu | Biến bật | Rủi ro | Cần Lecangs |
|---|---|---|---|
| 3 · `--sheet b2b` | `DSM_GROUND_B2B=1` | chỉ BOL + Drive + sheet — sửa được | ❌ |
| 1 · Ground thường | `DSM_GROUND_THUONG=1` | ⛔ vận đơn UPS thật + lệnh xuất kho thật | ✅ |
| 2 · `--sheet b2c` | `DSM_GROUND_B2C=1` | ⛔ như trên | ✅ |

Khâu 3 chạy **trước** hai khâu kia có chủ ý: phiên Lecangs chết thì nó vẫn xong việc.

Log riêng: `11_TaiVe/logs/ground.log`. Khoá riêng, **không** dùng chung với
`chay-dinh-ky.sh` — dùng chung thì job 5 phút sẽ bỏ đói job này.

---

## 2. ⚠️ ĐIỀU KIỆN CHƯA ĐẠT — đọc trước khi bật

**2.1. Phiên Lecangs không tự gia hạn được.** Sống ~4 tiếng, phải xin cookie tay.
Mật khẩu hiện bị server từ chối (`用户名或密码错误`, đo 12/08). Nên khâu 1–2 sẽ
**đứng phần lớn thời gian trong ngày** — wrapper dừng sạch và ghi log, không tạo
vận đơn nửa vời, nhưng cũng không tự chạy được.

→ **Khâu 1 và 2 chưa nên bật cho tới khi giải quyết được đăng nhập Lecangs.**

**2.2. Luồng sheet con mới chạy thật đúng 1 đơn** (`81944554`, cả hai nửa).
Khâu 3 an toàn nhất nhưng cũng mới có ngần ấy dữ liệu thực chứng.

**2.3. Chưa có cảnh báo khi hỏng.** Log ghi vào file, không ai đọc trừ khi mở ra.
Mã thoát khác 0 hiện chỉ nằm trong log.

---

## 3. KHI ANH YÊU CẦU BẬT — làm theo thứ tự

### Giai đoạn A — khâu B2B, an toàn nhất

```bash
DSM_DRY=1 DSM_GROUND_B2B=1 /home/Lenovo/dsm_auto/DSM_TuDongHoa/10_VM_Tool/chay-ground.sh
```
Xem `11_TaiVe/logs/ground.log`, đúng ý thì thêm dòng cron:

```cron
# Phan B2B cua don hon hop: BOL + Drive + sheet B2B. KHONG tao van don, khong can Lecangs.
# Phut :10 va :40 — lech khoi */5 cua chay-dinh-ky.sh va :25 cua don-dep.sh
10,40 * * * * DSM_GROUND_B2B=1 /home/Lenovo/dsm_auto/DSM_TuDongHoa/10_VM_Tool/chay-ground.sh
```

### Giai đoạn B — khâu B2C, chỉ khi phiên Lecangs ổn định

```cron
# ⛔ TAO VAN DON UPS THAT + lenh xuat kho THAT tren Lecangs.
# Chi bat khi da co cach giu phien Lecangs. Tran 5 don/luot.
15,45 * * * * DSM_GROUND_B2C=1 DSM_GROUND_MAX=5 /home/Lenovo/dsm_auto/DSM_TuDongHoa/10_VM_Tool/chay-ground.sh
```

### Giai đoạn C — Ground thường

```cron
# ⛔ Nhu tren, cho don Ground khong hon hop.
20,50 * * * * DSM_GROUND_THUONG=1 DSM_GROUND_MAX=5 /home/Lenovo/dsm_auto/DSM_TuDongHoa/10_VM_Tool/chay-ground.sh
```

🔴 **Nạp crontab bằng stdin**, không truyền tên file: `crontab` cắt đường dẫn ở
100 ký tự và báo "No such file" (gặp thật 11/08).

```bash
crontab -l > /tmp/cron.new && nano /tmp/cron.new && crontab - < /tmp/cron.new
```

---

## 4. TẮT KHẨN

```bash
crontab -l | sed 's|^\([0-9].*chay-ground.sh\)|#\1|' > /tmp/cron.off && crontab - < /tmp/cron.off
```

Đang chạy dở thì giết **theo PID** — ⛔ tuyệt đối không `pkill`/`pgrep`, máy dùng
chung với `/opt/wayfair`.

---

## 5. KIỂM TRA SAU KHI BẬT

| Kiểm | Lệnh |
|---|---|
| Cron có chạy không | `tail -30 11_TaiVe/logs/ground.log` |
| Có tạo vận đơn nào không | `ls -lt 11_TaiVe/ups/*.json \| head` |
| Có tạo đơn Lecangs nào không | `ls -lt 11_TaiVe/lecangs/ \| head` |
| Có chạy chồng không | `grep "BO QUA" 11_TaiVe/logs/ground.log \| tail` |
| Phiên Lecangs | `node 10_VM_Tool/kiem-phien-lecangs.mjs` |

---

## 6. VIỆC NÊN LÀM TRƯỚC KHI BẬT GIAI ĐOẠN B/C

1. **Giải quyết đăng nhập Lecangs** — đây là nút thắt thật sự
2. **Cảnh báo khi mã thoát ≠ 0** — hiện chỉ nằm trong log
3. **Chạy tay thêm vài đơn** để có dữ liệu thực chứng trước khi giao cho máy
4. **Commit** — hiện còn ~30 file chưa vào git
