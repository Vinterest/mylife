-- Chặng 3 · Hộp nhặt: link + ảnh chụp anh tự nhặt (từ Facebook, web…), Sổ tay.
-- Ảnh lưu thẳng trong D1 (đã nén ~300 KB trước khi gửi lên).

CREATE TABLE IF NOT EXISTS captures (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT NOT NULL,
  channel     TEXT NOT NULL,              -- ai | embodied | robotics | tcnh
  url         TEXT,                       -- link bài (nếu có)
  note        TEXT,                       -- ghi chú của anh
  item_id     INTEGER,                    -- bài tương ứng trong items (khi có link) để đọc toàn văn, dịch
  title       TEXT,
  description TEXT,
  image_url   TEXT,                       -- ảnh đại diện của link (og:image)
  status      TEXT NOT NULL DEFAULT 'new', -- new | done | failed
  error       TEXT,
  kept        INTEGER NOT NULL DEFAULT 0,  -- 1 = đã lưu vào Sổ tay
  archived    INTEGER NOT NULL DEFAULT 0,  -- 1 = đã xử lý xong, rời Hộp nhặt
  via         TEXT NOT NULL DEFAULT 'web'  -- web | shortcut
);
CREATE INDEX IF NOT EXISTS idx_captures_inbox ON captures(archived, created_at DESC);

CREATE TABLE IF NOT EXISTS capture_images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  capture_id  INTEGER NOT NULL REFERENCES captures(id),
  mime        TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  data        BLOB NOT NULL,
  ocr_text    TEXT,
  ocr_status  TEXT NOT NULL DEFAULT 'pending' -- pending | done | failed
);
CREATE INDEX IF NOT EXISTS idx_capimg_cap ON capture_images(capture_id);

INSERT OR IGNORE INTO sources (id, name, kind, url, channel, weight, keywords, enabled) VALUES
('manual', 'Hộp nhặt · anh tự nhặt', 'manual', '', 'ai', 20, '', 0);
