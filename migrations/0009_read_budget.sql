-- Giảm số dòng D1 phải đọc (gói Free: 5 triệu rows_read/ngày).
-- Chỉ mục để các truy vấn chạy thường xuyên chỉ chạm đúng những dòng cần, không quét cả bảng.
CREATE INDEX IF NOT EXISTS idx_items_pub ON items(published_at, dismissed, channel); -- bao phủ: đếm bài 7 ngày theo kênh không cần đọc bảng
CREATE INDEX IF NOT EXISTS idx_items_fetched ON items(fetched_at);
CREATE INDEX IF NOT EXISTS idx_items_channel_score ON items(channel, score DESC, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_kept ON items(kept_at) WHERE kept = 1;
CREATE INDEX IF NOT EXISTS idx_items_read ON items(read_at) WHERE read_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_items_country_todo ON items(id) WHERE country IS NULL;
-- Hàng chờ lấy toàn văn: chỉ gồm bài chưa có toàn văn (attempts = 9 khi đã có).
CREATE INDEX IF NOT EXISTS idx_items_ft_todo ON items(published_at) WHERE attempts < 3 AND dismissed = 0;
-- Số cạnh tên tab, giữ sẵn và cập nhật tự động bằng trigger (thay cho đếm lại cả bảng mỗi lần mở trang).
CREATE TABLE IF NOT EXISTS tab_counts (k TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0);
-- Phiên bản lược đồ: đã cập nhật thì mỗi lần khởi động chỉ đọc 1 dòng.
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
