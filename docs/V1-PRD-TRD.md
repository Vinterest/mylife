# MyLife V1 — PRD & TRD

Phiên bản: V1 · Ngày: 08/11/2026 · Địa chỉ: mylife.gm-chess.com · Chủ sở hữu: Sơn

## 1. Mục tiêu V1

Đưa mục tiêu **G2 · Học tập AI** chạy thật trên khung giao diện **phương án C** (mật độ báo điện tử, font Lexend Deca, chữ 13px). Các không gian khác (Công việc, Tài chính, Gia đình, Dự án) chỉ hiện tab "Sắp có".

Thước đo thành công V1:

- Mỗi sáng 06:30 có sẵn 5 bài "Đáng đọc hôm nay", có tóm tắt tiếng Việt.
- Mỗi kênh có ≥ 5 bài tóm tắt/tuần (KPI G2.2).
- Chủ nhật 20:00 có bản tin tuần, 06:30 thứ Hai gửi email (KPI G2.1).
- Chi phí vận hành: 0 đồng (chỉ dùng hạn mức miễn phí).

## 2. Phạm vi

V1 chia 4 chặng, mỗi chặng chạy được và dùng thử ngay.

| Chặng | Nội dung |
|---|---|
| 1 | Khung C, đăng nhập (Cloudflare Access), crawl arXiv + RSS, tóm tắt tiếng Việt, trang Hôm nay, 4 trang kênh, trang bài, trang hạn mức |
| 2 | Lấy toàn văn về MyLife, đọc VI/EN/song ngữ, chuỗi dịch máy dự phòng (Azure → DeepL → Google), 3 trạng thái bản dịch, xếp hàng dịch |
| 3 | Hộp nhặt (web: dán link/ảnh; iPhone: Phím tắt "Gửi tới MyLife"), đọc chữ trong ảnh, Sổ tay cơ bản (lưu, ghi chú, đánh dấu) |
| 4 | Bản tin tuần, giọng đọc tiếng Việt (MP3 tạo sẵn), chế độ nghe khi lái xe, gửi email bản tin |

Để sang V1.1: ôn tập 1–3–7–30, Hỏi sổ tay, chuyển tiếp email newsletter, tải PDF, ghi âm.

## 3. Quyết định đã chốt

1. Nền tảng: Cloudflare Workers + D1 + R2 + Cron, giao diện render từ máy chủ, ít JavaScript.
2. Đăng nhập: Cloudflare Access, OTP gửi về Gmail của Sơn; chỉ Sơn truy cập.
3. Ưu tiên kênh khi chấm điểm: Tài chính – NH → Embodied AI → AI thế giới → Robotics.
4. Nguồn khởi đầu: danh sách đề xuất (arXiv là trụ cột), Sơn bổ sung sau.
5. Lịch: RSS 6 giờ/lần; arXiv 1 lần/ngày; "Đáng đọc" sẵn 06:30; bản tin soạn 20:00 CN, email 06:30 T2.
6. Email bản tin gửi về Gmail của Sơn, qua Cloudflare Email (miễn phí).
7. Giọng đọc: Sơn chọn sau khi nghe thử; tốc độ mặc định 1.25×.
8. Dịch: văn trung tính kiểu báo, thuật ngữ giữ tiếng Anh trong ngoặc ở lần đầu; paper ưu tiên Tóm tắt → Giới thiệu → Kết luận khi hạn mức ít.
9. Lưu trữ: bài đã giữ lưu mãi; bài không giữ lưu toàn văn 6 tháng; âm thanh 30 ngày.
10. Chỉ dùng hạn mức miễn phí; mỗi dịch vụ tự dừng ở 95%; hết thì hiện bản gốc tiếng Anh và xếp hàng dịch.
11. "Đáng đọc hôm nay": 5 bài/ngày.
12. Toàn văn lưu riêng tư trong MyLife, link gốc chỉ để ghi nguồn; không công khai, không vượt tường phí.

## 4. Kiến trúc kỹ thuật

```
Cloudflare Access (đăng nhập)
        │
Worker "mylife" (Hono, render HTML)
   ├── D1  : nguồn, bài, đáng đọc, hạn mức
   ├── R2  : ảnh, toàn văn lớn, MP3        (chặng 2–4)
   ├── Workers AI (Gemma)                   — dự phòng tóm tắt/dịch
   └── Cron
        ├── 0 */6 * * *   crawl RSS
        ├── 0 23 * * *    crawl arXiv (06:00 giờ VN)
        └── 30 23 * * *   chọn 5 bài Đáng đọc (06:30 giờ VN)
Gemini API (gói miễn phí) — tóm tắt/dịch chính
```

### Chuỗi xử lý AI (miễn phí)

| Thứ tự | Dịch vụ | Hạn mức tính | Dùng cho |
|---|---|---|---|
| 1 | Gemini (AI Studio, gói miễn phí) | yêu cầu/ngày | tóm tắt, dịch toàn văn, đọc chữ trong ảnh |
| 2 | Cloudflare Workers AI (Gemma) | 10.000 neuron/ngày | tóm tắt, dịch |
| 3 | Azure Translator F0 | 2 triệu ký tự/tháng | dịch toàn văn |
| 4 | DeepL API Free | 500 nghìn ký tự/tháng | dịch toàn văn |
| 5 | Google Cloud Translation | 500 nghìn ký tự/tháng | dịch toàn văn |
| — | Hết tất cả | — | hiện bản gốc tiếng Anh, xếp hàng dịch |

Mỗi lần gọi dịch vụ đều ghi vào bảng `quota_usage` (theo ngày hoặc tháng). Trước khi gọi, hệ thống kiểm tra lượng đã dùng; vượt 95% hạn mức thì bỏ qua dịch vụ đó.

Chỉ nội dung bài báo công khai được gửi qua gói miễn phí. Ghi chú cá nhân không bao giờ gửi đi.

### Chấm điểm "Đáng đọc" (0–100)

- Trọng số kênh: TC–NH 30 · Embodied 26 · AI thế giới 22 · Robotics 18.
- Độ mới: tối đa 25 điểm, giảm dần trong 72 giờ.
- Từ khóa ưu tiên trong tiêu đề/tóm tắt: tối đa 25 điểm.
- Trọng số nguồn (ví dụ blog lab lớn, Hugging Face Papers): tối đa 20 điểm.
- Bài trùng (cùng link hoặc cùng tiêu đề chuẩn hóa) chỉ giữ 1.
- Mỗi ngày chọn 5 bài điểm cao nhất, tối đa 2 bài/kênh.

### Dữ liệu (D1)

- `sources` — nguồn: tên, loại (arxiv/rss), url, kênh, trọng số, bật/tắt, lỗi gần nhất.
- `items` — bài: nguồn, kênh, link, tiêu đề, tác giả, ngày đăng, tóm tắt gốc (EN), tóm tắt tiếng Việt, tiêu đề tiếng Việt, điểm, trạng thái xử lý, engine đã dùng.
- `daily_picks` — 5 bài Đáng đọc mỗi ngày.
- `quota_usage` — lượng dùng theo dịch vụ, kỳ (ngày/tháng).
- `jobs_log` — nhật ký các lần chạy cron.

### Bảo mật

- Toàn bộ subdomain nằm sau Cloudflare Access; Worker kiểm tra thêm header email của Access.
- Key dịch vụ lưu bằng `wrangler secret`, không nằm trong mã nguồn.
- Thêm `X-Robots-Tag: noindex` và robots.txt chặn index.

## 5. Việc Sơn cần làm trước khi deploy

1. Cho biết DNS gm-chess.com đang ở đâu (chuyển về Cloudflare nếu chưa).
2. Tạo repo GitHub riêng tư `mylife`, cấp quyền cho Claude.
3. Lấy API key Gemini (AI Studio). Các key Azure, DeepL, Google để chặng 2.
4. Bật Cloudflare Access cho mylife.gm-chess.com với email Gmail của Sơn.
