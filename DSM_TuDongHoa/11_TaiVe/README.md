# 11_TaiVe — Chỗ tải file về (chốt 05/08/2026)

Thay cho `C:\Users\Lenovo\Downloads` của máy Windows cũ. Máy hiện tại là **VM Linux**, không có
`~/Downloads`, `DISPLAY` rỗng (chỉ chạy headless được).

```
11_TaiVe/
├── dsm_raw/          ← PDF gộp thô tải từ DSM (<fid>.pdf). Cũng là --output-dir của MCP playwright-dsm
├── packingslip/      ← packing slip đã tách theo PO
├── bol/              ← BOL / shipping label tải tay từ AACT, CTII
├── tam/              ← file tạm, xoá được bất cứ lúc nào
└── .chrome-profile-dsm/   ← profile Chrome riêng của DSM (cookie đăng nhập) ⛔ KHÔNG commit
```

**Toàn bộ thư mục này nằm trong `.gitignore`** (trừ chính file README này) — file tải về là kết
quả chạy, không phải mã nguồn. `storageState.json` và `.chrome-profile-dsm/` chứa **cookie phiên,
coi như mật khẩu**.

---

## Ba đường tải file — mỗi đường lưu một chỗ khác nhau

### 1. MCP `playwright-dsm` (Claude điều khiển trình duyệt trong phiên này)

Khai trong `~/.claude.json`, mục `mcpServers`:

| Cờ | Giá trị |
|---|---|
| `--output-dir` | `/home/Lenovo/dsm_auto/DSM_TuDongHoa/11_TaiVe/dsm_raw` |
| `--user-data-dir` | `/home/Lenovo/dsm_auto/DSM_TuDongHoa/11_TaiVe/.chrome-profile-dsm` |
| `--browser` | `chromium` (**bắt buộc** — máy này không có Google Chrome ở `/opt/google/chrome`) |
| `--headless` | có |

Cơ chế đã đọc thẳng trong `playwright-core/lib/coreBundle.js`:
`_downloadStarted()` → `context.outputFile({suggestedFilename})` → `path.resolve(outputDir(options), fileName)`
→ `download.saveAs(...)`. Tức là file rơi vào **`--output-dir` + tên file gốc do server gợi ý**,
không hỏi, không qua thư mục tạm.

Nếu **bỏ** `--output-dir` thì mặc định là `<cwd>/.playwright-mcp`, và `<cwd>` rơi vào thư mục hệ
thống hoặc không ghi được thì tụt về `/tmp/.playwright-mcp` — mỗi lần một chỗ, rất dễ mất file.
**Luôn khai `--output-dir` tường minh.**

> ⚠️ MCP `playwright` (không có `-dsm`) trỏ tới `/opt/wayfair/downloads` — đó là **dự án khác đang
> chạy thật**. Đừng sửa nó, và đừng dùng nó cho DSM: dùng nhầm thì file DSM lẫn vào kho Wayfair.

### 2. `10_VM_Tool/run.mjs` (tool tải packing slip hàng loạt)

Không đi qua trình duyệt — dùng `APIRequestContext`, tải thẳng vào `Buffer` rồi `fs.writeFile`.
Đích là biến `OUTDIR`:

```js
const OUTDIR = process.env.DSM_OUT || './downloads';   // TƯƠNG ĐỐI so với cwd lúc chạy node
```

`./downloads` là **tương đối với thư mục đang đứng khi gõ lệnh**, nên chạy từ chỗ khác là file
rơi chỗ khác. Chạy bằng biến môi trường cho chắc:

```bash
DSM_OUT=/home/Lenovo/dsm_auto/DSM_TuDongHoa/11_TaiVe/dsm_raw \
DSM_STATE=/home/Lenovo/dsm_auto/DSM_TuDongHoa/11_TaiVe/storageState.json \
node /home/Lenovo/dsm_auto/DSM_TuDongHoa/10_VM_Tool/run.mjs --dry
```

Cùng lúc đó `run.mjs` vẫn upload bản thô lên Drive `_INBOX`
(`18rFktqm_K_a9-RPW5S0o2fTkmmHITGKO`) — đĩa chỉ là bản sao dự phòng.

### 3. Drive (nguồn chính thức)

Đích cuối vẫn là `THD Orders / <DD Mon YYYY> / PO - <po> /`. Đĩa VM chỉ là chỗ trung chuyển —
**đừng coi `11_TaiVe/` là nơi lưu trữ lâu dài.**

---

## Kiểm nhanh

```bash
ls -la /home/Lenovo/dsm_auto/DSM_TuDongHoa/11_TaiVe/dsm_raw
```

PDF thật ~70–130 KB và 5 byte đầu là `%PDF`. File ~57–59 KB là **trang HTML bị đặt tên `.pdf`** —
bẫy `isLive=true` mô tả ở `CLAUDE.md` mục 5.
