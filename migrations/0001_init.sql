-- MyLife V1 · G2 Học tập AI

CREATE TABLE IF NOT EXISTS sources (
  id          TEXT PRIMARY KEY,          -- vd: arxiv-cs-ro, rss-ieee-robotics
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL,             -- arxiv | rss
  url         TEXT NOT NULL,             -- arxiv: danh sách chuyên mục, cách nhau bằng dấu phẩy
  channel     TEXT NOT NULL,             -- ai | embodied | robotics | tcnh
  weight      INTEGER NOT NULL DEFAULT 10,   -- 0–20
  keywords    TEXT,                      -- lọc arXiv: từ khóa, cách nhau bằng dấu phẩy
  enabled     INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  last_error  TEXT,
  item_count  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id    TEXT NOT NULL REFERENCES sources(id),
  channel      TEXT NOT NULL,
  url          TEXT NOT NULL UNIQUE,
  title_key    TEXT NOT NULL,            -- tiêu đề chuẩn hóa để lọc trùng
  title_en     TEXT NOT NULL,
  title_vi     TEXT,
  authors      TEXT,
  published_at TEXT NOT NULL,            -- ISO UTC
  fetched_at   TEXT NOT NULL,
  abstract_en  TEXT,                     -- đoạn tóm tắt/mô tả gốc
  summary_vi   TEXT,                     -- tóm tắt 3 dòng tiếng Việt
  points_vi    TEXT,                     -- JSON: 3 ý chính
  why_vi       TEXT,                     -- vì sao đáng chú ý
  score        INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'new',  -- new | summarized | waiting_quota | failed
  engine       TEXT,                     -- gemini | workers_ai
  attempts     INTEGER NOT NULL DEFAULT 0,
  read_minutes INTEGER,
  kept         INTEGER NOT NULL DEFAULT 0,
  dismissed    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_items_title_key ON items(title_key);
CREATE INDEX IF NOT EXISTS idx_items_channel_pub ON items(channel, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);

CREATE TABLE IF NOT EXISTS daily_picks (
  day     TEXT NOT NULL,                 -- YYYY-MM-DD giờ VN
  rank    INTEGER NOT NULL,
  item_id INTEGER NOT NULL REFERENCES items(id),
  PRIMARY KEY (day, rank)
);

CREATE TABLE IF NOT EXISTS quota_usage (
  provider TEXT NOT NULL,                -- gemini | workers_ai | azure | deepl | google_tr | google_tts
  period   TEXT NOT NULL,                -- YYYY-MM-DD hoặc YYYY-MM
  used     REAL NOT NULL DEFAULT 0,      -- yêu cầu / neuron / ký tự
  PRIMARY KEY (provider, period)
);

CREATE TABLE IF NOT EXISTS jobs_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  job        TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ok         INTEGER NOT NULL,
  detail     TEXT
);
