-- Thời gian đọc trên MyLife: cộng dồn theo ngày (giờ VN) × thiết bị × bài.
-- kind: 'item' (bài crawl), 'capture' (mục Hộp nhặt), 'page' (duyệt danh sách, tìm kiếm… — ref_id = 0)
CREATE TABLE IF NOT EXISTS reading_time (
  day TEXT NOT NULL,
  device TEXT NOT NULL,          -- 'iphone' | 'web' (máy tính và thiết bị khác)
  kind TEXT NOT NULL,
  ref_id INTEGER NOT NULL DEFAULT 0,
  seconds INTEGER NOT NULL DEFAULT 0,
  last_at TEXT,
  PRIMARY KEY (day, device, kind, ref_id)
);
CREATE INDEX IF NOT EXISTS idx_reading_time_ref ON reading_time (kind, ref_id);
