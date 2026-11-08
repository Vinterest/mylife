# MyLife — V1 (phương án C · Học tập AI)

Trang cá nhân của Sơn tại **mylife.gm-chess.com**. V1 chạy mục tiêu G2 · Học tập AI: tự lấy bài từ arXiv và RSS, tóm tắt tiếng Việt bằng hạn mức AI miễn phí, chọn 5 bài "Đáng đọc" mỗi sáng.

Tài liệu yêu cầu: [docs/V1-PRD-TRD.md](docs/V1-PRD-TRD.md)

## Đã có ở Chặng 1

- Khung giao diện C (Lexend Deca, chữ 13px, tab không gian; các tab khác "sắp có").
- Trang Học tập AI: 5 bài Đáng đọc có điểm, KPI G2.2 theo kênh, ô hạn mức, 4 cột kênh.
- 4 trang kênh (phân trang), trang bài (tóm tắt AI + mô tả gốc tiếng Anh), nút Giữ / Không quan tâm.
- Trang Nguồn & hạn mức: bảng hạn mức, tình trạng từng nguồn, nhật ký, nút "Chạy ngay".
- Crawl: RSS mỗi 6 giờ, arXiv 06:00 hằng ngày; lọc trùng; chấm điểm theo kênh, độ mới, từ khóa, nguồn.
- Tóm tắt tiếng Việt theo chuỗi miễn phí Gemini → Workers AI; tự dừng ở 95% hạn mức; hết thì hiện bản gốc tiếng Anh.
- Cài lên màn hình chính iPhone (manifest, biểu tượng), chặn công cụ tìm kiếm, chỉ chủ sở hữu vào được.

## Đã có ở Chặng 2

- Lấy toàn văn bài về MyLife (bảng `fulltexts`): bỏ menu/quảng cáo/chân trang, giữ tiêu đề, đoạn, danh sách, trích dẫn, hình + chú thích, khối mã.
- arXiv: đọc bản HTML của paper, công thức chuyển thành `$...$` và hiển thị bằng KaTeX, bỏ danh mục tài liệu tham khảo. Paper chưa có bản HTML → chỉ có tóm tắt.
- Không vượt tường phí: trang chỉ công khai một phần thì ghi rõ. YouTube: dùng phần mô tả (lời thoại để sau).
- Dịch toàn văn theo chuỗi miễn phí Gemini → Workers AI → Azure F0 → DeepL Free → Google, từng lô ≤ 3.500 ký tự; dịch dở được lưu và dịch tiếp lượt sau.
- Trang đọc: Tiếng Việt / English / Song ngữ, A−/A+, mục lục, tiến độ dịch, 3 trạng thái (Bản dịch AI · Bản dịch máy · Bản gốc tiếng Anh khi hết hạn mức), nút Xếp hàng dịch, Dịch lại bằng AI, Thử lấy lại.
- Hàng đợi (mỗi 30 phút): lấy toàn văn bài Đáng đọc + bài đã giữ, dịch theo thứ tự bài anh mở → Đáng đọc → bài đã giữ. Toàn văn bài không giữ tự xóa sau 6 tháng.

### Key dịch máy dự phòng (tuỳ chọn — thiếu key thì bỏ qua dịch vụ đó)

Thêm trong Cloudflare → Workers → mylife → Settings → Variables and Secrets (loại Secret):

- `AZURE_TRANSLATOR_KEY` (gói F0); sửa `AZURE_TRANSLATOR_REGION` trong `wrangler.toml` nếu tạo ở vùng khác `southeastasia`.
- `DEEPL_API_KEY` (DeepL API Free).
- `GOOGLE_TRANSLATE_API_KEY` (Cloud Translation; đặt ngân sách 0 USD + cảnh báo).

## Chạy thử trên máy

```bash
npm install
npm run db:local        # tạo CSDL local
npm run db:seed-dev     # (tuỳ chọn) dữ liệu mẫu
# Local tự giả lập bản dịch (DEV_FAKE_TRANSLATE=1 trong wrangler.local.toml)
npm run dev             # mở http://localhost:8787/hoc-tap
npm test                # kiểm tra bộ đọc feed, chấm điểm, JSON tóm tắt
npm run typecheck
```

## Đưa lên mylife.gm-chess.com (làm một lần)

Yêu cầu: tên miền gm-chess.com đã dùng DNS của Cloudflare.

1. Đăng nhập: `npx wrangler login`
2. Tạo CSDL: `npx wrangler d1 create mylife` → chép `database_id` vào `wrangler.toml` (và `wrangler.local.toml`).
3. Tạo bảng và nguồn: `npm run db:remote`
4. Thêm key Gemini (gõ vào khi được hỏi, không dán vào đâu khác):
   `npx wrangler secret put GEMINI_API_KEY`
5. Deploy: `npm run deploy` — Worker tự gắn vào mylife.gm-chess.com.
6. Bật đăng nhập: Cloudflare Dashboard → Zero Trust → Access → Applications → **Self-hosted**, domain `mylife.gm-chess.com`, policy **Allow** với email `son.phanhong@gmail.com`, đăng nhập bằng **One-time PIN**. Riêng 4 đường dẫn `/manifest.webmanifest`, `/apple-touch-icon.png`, `/icon.svg`, `/sw.js` thêm một application **Bypass** để iPhone tải được biểu tượng.
7. Vào **Nguồn & hạn mức** → "Crawl arXiv", "Crawl RSS" → "Chọn 5 bài Đáng đọc" để có dữ liệu ngay.

## Thêm / tắt nguồn

Sửa bảng `sources` trong D1 (Cloudflare Dashboard → D1 → mylife → Console), ví dụ:

```sql
INSERT INTO sources (id, name, kind, url, channel, weight, keywords)
VALUES ('rss-ten-nguon', 'Tên hiển thị', 'rss', 'https://…/feed', 'tcnh', 12, 'ai,ngân hàng');
UPDATE sources SET enabled = 0 WHERE id = 'rss-finextra';
```

Kênh: `ai`, `embodied`, `robotics`, `tcnh`. `keywords` để trống = lấy hết bài của nguồn.

## Lưu ý

- Hạn mức Gemini miễn phí do Google quy định và thay đổi theo thời gian; chỉnh `GEMINI_DAILY_REQUESTS` trong `wrangler.toml` cho khớp. Khi Google trả lỗi 429, hệ thống tự coi như hết lượt trong ngày.
- Gói Workers miễn phí giới hạn thời gian CPU mỗi lần chạy. Nếu nhật ký báo lỗi vượt CPU khi crawl nhiều nguồn, giảm số nguồn bật hoặc chuyển gói Workers Paid (5 USD/tháng).
- Gói miễn phí Gemini có thể dùng dữ liệu để cải thiện sản phẩm: chỉ gửi nội dung bài công khai, không gửi ghi chú cá nhân.
