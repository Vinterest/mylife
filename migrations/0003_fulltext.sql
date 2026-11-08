-- Chặng 2 · Toàn văn và bản dịch

CREATE TABLE IF NOT EXISTS fulltexts (
  item_id       INTEGER PRIMARY KEY REFERENCES items(id),
  status        TEXT NOT NULL,          -- fetched | partial | translated | waiting_quota | abstract_only | fetch_failed
  kind          TEXT NOT NULL,          -- html | arxiv_html | abstract
  base_url      TEXT,                   -- trang đã lấy (để ghi nguồn)
  blocks_en     TEXT NOT NULL,          -- JSON: [{k,t,src?}]
  blocks_vi     TEXT,                   -- JSON: mảng cùng độ dài, null = chưa dịch
  engines       TEXT,                   -- JSON: engine đã dịch từng đoạn
  chars_en      INTEGER NOT NULL DEFAULT 0,
  public_partial INTEGER NOT NULL DEFAULT 0,  -- nguồn chỉ công khai một phần (tường phí…)
  want_ai       INTEGER NOT NULL DEFAULT 0,  -- 1 = chỉ dịch bằng AI (dịch lại thay bản dịch máy)
  priority      INTEGER NOT NULL DEFAULT 0,  -- 1 = anh đã mở / bấm xếp hàng
  error         TEXT,
  fetched_at    TEXT NOT NULL,
  translated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_fulltexts_queue ON fulltexts(status, priority DESC, fetched_at);
