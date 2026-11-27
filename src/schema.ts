import type { Env } from './types';
import m1 from '../migrations/0001_init.sql';
import m2 from '../migrations/0002_sources.sql';
import m3 from '../migrations/0003_fulltext.sql';
import m4 from '../migrations/0004_sources_ai_labs.sql';
import m5 from '../migrations/0005_sources_robotics.sql';
import m6 from '../migrations/0006_captures.sql';
import m7 from '../migrations/0007_sources_asia_finance.sql';
import m8 from '../migrations/0008_reading_time.sql';
import m9 from '../migrations/0009_read_budget.sql';

/** Tách file SQL thành từng câu lệnh: bỏ chú thích "--", tách theo dấu ";" cuối câu. */
export function splitSql(sql: string): string[] {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

let ready = false;

/**
 * Tự tạo bảng nếu chưa có (lần chạy đầu sau khi deploy). Các lệnh đều là
 * "CREATE ... IF NOT EXISTS" / "INSERT OR IGNORE" nên chạy lại cũng an toàn.
 */
/** Tăng số này khi lược đồ / dữ liệu cần sửa một lần. Đã ở phiên bản này thì khởi động chỉ đọc 1 dòng. */
const SCHEMA_VERSION = '10';

export async function ensureSchema(env: Env): Promise<void> {
  if (ready) return;
  const cur = await env.DB.prepare("SELECT v FROM meta WHERE k = 'schema'").first<{ v: string }>().catch(() => null);
  if (cur?.v === SCHEMA_VERSION) { ready = true; return; }
  await upgradeSchema(env);
  ready = true;
}

async function upgradeSchema(env: Env): Promise<void> {
  const { results: tables } = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('sources','items','daily_picks','quota_usage','jobs_log','fulltexts','captures','capture_images')").all<{ name: string }>();
  if (tables.length < 6) {
    for (const file of [m1, m2, m3, m4, m5, m6, m7]) {
      const stmts = splitSql(file).map((s) => env.DB.prepare(s));
      if (stmts.length) await env.DB.batch(stmts);
    }
  } else if (tables.length < 8) {
    await env.DB.batch(splitSql(m6).map((s) => env.DB.prepare(s))); // Chặng 3 · Hộp nhặt
  }
  // Bảng thời gian đọc (Thống kê) — lệnh IF NOT EXISTS, chạy lại an toàn.
  await env.DB.batch(splitSql(m8).map((s) => env.DB.prepare(s)));
  // Cột thêm sau. Không để trong migrations/ để tránh xung đột với lệnh tự thêm cột.
  const { results: cols } = await env.DB.prepare("SELECT name FROM pragma_table_info('items') WHERE name IN ('image_url','read_at','note')").all<{ name: string }>();
  const has = new Set(cols.map((c) => c.name));
  if (!has.has('image_url')) {
    await env.DB.batch([
      env.DB.prepare('ALTER TABLE items ADD COLUMN image_url TEXT'),
      // Chuyển sang "chỉ dịch khi anh bấm": bỏ hàng dịch tự động cũ (một lần).
      env.DB.prepare(`UPDATE fulltexts SET priority = 0 WHERE status IN ('fetched','partial','waiting_quota')`),
    ]);
  }
  if (!has.has('read_at')) {
    await env.DB.batch([
      env.DB.prepare('ALTER TABLE items ADD COLUMN read_at TEXT'), // thời điểm anh bấm "Đã đọc"
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_items_read ON items(read_at)'),
    ]);
  }
  if (!has.has('note')) await env.DB.prepare('ALTER TABLE items ADD COLUMN note TEXT').run(); // ghi chú Sổ tay
  // Quốc gia của bài (ưu tiên tin AI theo nước). NULL = chưa chấm lại; nhịp 5 phút tự chấm dần các bài cũ.
  const cc = await env.DB.prepare("SELECT 1 AS x FROM pragma_table_info('items') WHERE name = 'country'").first();
  if (!cc) await env.DB.prepare('ALTER TABLE items ADD COLUMN country TEXT').run();
  // Sổ tay xếp theo lúc bấm "Lưu Sổ tay". Đồng thời cứu các bài nhặt bị "mất": trước đây bấm Lưu Sổ tay ở danh sách
  // kênh chỉ đánh dấu bài (items) mà không đánh dấu mục nhặt — trang Sổ tay lại chỉ đọc mục nhặt.
  const kc = await env.DB.prepare("SELECT 1 AS x FROM pragma_table_info('items') WHERE name = 'kept_at'").first();
  if (!kc) {
    await env.DB.batch([
      env.DB.prepare('ALTER TABLE items ADD COLUMN kept_at TEXT'),
      env.DB.prepare('ALTER TABLE captures ADD COLUMN kept_at TEXT'),
      env.DB.prepare('UPDATE items SET kept_at = fetched_at WHERE kept = 1'),
      env.DB.prepare('UPDATE captures SET kept_at = created_at WHERE kept = 1'),
      env.DB.prepare(`UPDATE captures SET kept = 1, kept_at = (SELECT fetched_at FROM items WHERE id = captures.item_id)
        WHERE kept = 0 AND item_id IN (SELECT id FROM items WHERE source_id = 'manual' AND kept = 1)`),
      env.DB.prepare(`UPDATE items SET kept = 1, kept_at = (SELECT MAX(kept_at) FROM captures WHERE item_id = items.id)
        WHERE source_id = 'manual' AND kept = 0 AND id IN (SELECT item_id FROM captures WHERE kept = 1 AND item_id IS NOT NULL)`),
    ]);
  }
  // Nguồn bổ sung (khi DB đã tạo từ trước): INSERT OR IGNORE nên chạy lại cũng an toàn.
  const { results: have } = await env.DB.prepare("SELECT id FROM sources WHERE id IN ('sm-deepseek','sm-figure','rss-fn-sg')").all<{ id: string }>();
  const ids = new Set(have.map((r) => r.id));
  if (!ids.has('sm-deepseek')) await env.DB.batch(splitSql(m4).map((st) => env.DB.prepare(st)));
  if (!ids.has('sm-figure')) await env.DB.batch(splitSql(m5).map((st) => env.DB.prepare(st)));
  if (!ids.has('rss-fn-sg')) await env.DB.batch(splitSql(m7).map((st) => env.DB.prepare(st)));
  // Sửa bài có ngày đăng ở tương lai (lỗi feed) — chúng chiếm đầu danh sách "Mới nhất".
  await env.DB.prepare('UPDATE items SET published_at = fetched_at WHERE published_at > fetched_at').run();
  // Phiên bản 9: chỉ mục + bộ đếm tab + đánh dấu bài đã có toàn văn (attempts = 9).
  await env.DB.batch(splitSql(m9).map((s) => env.DB.prepare(s)));
  await env.DB.batch(TRIGGERS.map((s) => env.DB.prepare(s)));
  await env.DB.prepare('UPDATE items SET attempts = 9 WHERE attempts < 9 AND id IN (SELECT item_id FROM fulltexts)').run();
  await rebuildTabCounts(env);
  // Phiên bản 10: chế độ "Dịch mặc định Anh → Việt" theo từng nguồn, bật sẵn cho mọi nguồn.
  const hasAuto = await env.DB.prepare("SELECT 1 AS x FROM pragma_table_info('sources') WHERE name = 'auto_vi'").first();
  if (!hasAuto) await env.DB.batch([
    env.DB.prepare('ALTER TABLE sources ADD COLUMN auto_vi INTEGER NOT NULL DEFAULT 0'),
    env.DB.prepare('UPDATE sources SET auto_vi = 1'),
  ]);
  await env.DB.prepare("INSERT INTO meta (k, v) VALUES ('schema', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(SCHEMA_VERSION).run();
}

/*
 * Bộ đếm tab (bảng tab_counts), cập nhật tự động khi bài / mục nhặt đổi trạng thái:
 *   unread:<kênh> = bài chưa đọc, chưa "Không quan tâm" của kênh · read = tổng bài đã đọc
 *   notes_items = bài đã Lưu Sổ tay (trừ bài tạo từ Hộp nhặt) · notes_caps = mục nhặt đã lưu · captures = tổng mục nhặt
 */
const unreadCh = (r: 'NEW' | 'OLD') => `${r}.dismissed = 0 AND ${r}.read_at IS NULL`;
const noteIt = (r: 'NEW' | 'OLD') => `(${r}.kept = 1 AND ${r}.source_id <> 'manual')`;
const TRIGGERS = [
  `CREATE TRIGGER IF NOT EXISTS trg_items_ins AFTER INSERT ON items BEGIN
     INSERT OR IGNORE INTO tab_counts (k, n) VALUES ('unread:' || NEW.channel, 0);
     UPDATE tab_counts SET n = n + 1 WHERE k = 'unread:' || NEW.channel AND ${unreadCh('NEW')};
     UPDATE tab_counts SET n = n + 1 WHERE k = 'read' AND NEW.read_at IS NOT NULL;
     UPDATE tab_counts SET n = n + 1 WHERE k = 'notes_items' AND ${noteIt('NEW')};
   END`,
  `CREATE TRIGGER IF NOT EXISTS trg_items_del AFTER DELETE ON items BEGIN
     UPDATE tab_counts SET n = n - 1 WHERE k = 'unread:' || OLD.channel AND ${unreadCh('OLD')};
     UPDATE tab_counts SET n = n - 1 WHERE k = 'read' AND OLD.read_at IS NOT NULL;
     UPDATE tab_counts SET n = n - 1 WHERE k = 'notes_items' AND ${noteIt('OLD')};
   END`,
  `CREATE TRIGGER IF NOT EXISTS trg_items_upd AFTER UPDATE OF channel, dismissed, read_at, kept, source_id ON items BEGIN
     UPDATE tab_counts SET n = n - 1 WHERE k = 'unread:' || OLD.channel AND ${unreadCh('OLD')};
     INSERT OR IGNORE INTO tab_counts (k, n) VALUES ('unread:' || NEW.channel, 0);
     UPDATE tab_counts SET n = n + 1 WHERE k = 'unread:' || NEW.channel AND ${unreadCh('NEW')};
     UPDATE tab_counts SET n = n + (NEW.read_at IS NOT NULL) - (OLD.read_at IS NOT NULL) WHERE k = 'read' AND (NEW.read_at IS NOT NULL) <> (OLD.read_at IS NOT NULL);
     UPDATE tab_counts SET n = n + ${noteIt('NEW')} - ${noteIt('OLD')} WHERE k = 'notes_items' AND ${noteIt('NEW')} <> ${noteIt('OLD')};
   END`,
  `CREATE TRIGGER IF NOT EXISTS trg_caps_ins AFTER INSERT ON captures BEGIN
     UPDATE tab_counts SET n = n + 1 WHERE k = 'captures';
     UPDATE tab_counts SET n = n + 1 WHERE k = 'notes_caps' AND NEW.kept = 1;
   END`,
  `CREATE TRIGGER IF NOT EXISTS trg_caps_del AFTER DELETE ON captures BEGIN
     UPDATE tab_counts SET n = n - 1 WHERE k = 'captures';
     UPDATE tab_counts SET n = n - 1 WHERE k = 'notes_caps' AND OLD.kept = 1;
   END`,
  `CREATE TRIGGER IF NOT EXISTS trg_caps_upd AFTER UPDATE OF kept ON captures BEGIN
     UPDATE tab_counts SET n = n + (NEW.kept = 1) - (OLD.kept = 1) WHERE k = 'notes_caps' AND (NEW.kept = 1) <> (OLD.kept = 1);
   END`,
  // Có toàn văn rồi thì rời hàng chờ lấy toàn văn (chỉ mục idx_items_ft_todo).
  `CREATE TRIGGER IF NOT EXISTS trg_ft_ins AFTER INSERT ON fulltexts BEGIN
     UPDATE items SET attempts = 9 WHERE id = NEW.item_id AND attempts < 9;
   END`,
];

/** Đếm lại toàn bộ bộ đếm tab (lúc nâng phiên bản và mỗi ngày một lần để sửa lệch nếu có). Quét cả bảng 1 lần. */
export async function rebuildTabCounts(env: Env): Promise<string> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM tab_counts'),
    env.DB.prepare(`INSERT INTO tab_counts (k, n) SELECT 'unread:' || channel, SUM(dismissed = 0 AND read_at IS NULL) FROM items GROUP BY channel`),
    env.DB.prepare(`INSERT INTO tab_counts (k, n) SELECT 'read', COUNT(*) FROM items WHERE read_at IS NOT NULL`),
    env.DB.prepare(`INSERT INTO tab_counts (k, n) SELECT 'notes_items', COUNT(*) FROM items WHERE kept = 1 AND source_id <> 'manual'`),
    env.DB.prepare(`INSERT INTO tab_counts (k, n) SELECT 'captures', COUNT(*) FROM captures`),
    env.DB.prepare(`INSERT INTO tab_counts (k, n) SELECT 'notes_caps', COUNT(*) FROM captures WHERE kept = 1`),
  ]);
  return 'Đếm lại số trên tab';
}
