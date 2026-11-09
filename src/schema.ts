import type { Env } from './types';
import m1 from '../migrations/0001_init.sql';
import m2 from '../migrations/0002_sources.sql';
import m3 from '../migrations/0003_fulltext.sql';
import m4 from '../migrations/0004_sources_ai_labs.sql';
import m5 from '../migrations/0005_sources_robotics.sql';
import m6 from '../migrations/0006_captures.sql';
import m7 from '../migrations/0007_sources_asia_finance.sql';

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
export async function ensureSchema(env: Env): Promise<void> {
  if (ready) return;
  const { results: tables } = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('sources','items','daily_picks','quota_usage','jobs_log','fulltexts','captures','capture_images')").all<{ name: string }>();
  if (tables.length < 6) {
    for (const file of [m1, m2, m3, m4, m5, m6, m7]) {
      const stmts = splitSql(file).map((s) => env.DB.prepare(s));
      if (stmts.length) await env.DB.batch(stmts);
    }
  } else if (tables.length < 8) {
    await env.DB.batch(splitSql(m6).map((s) => env.DB.prepare(s))); // Chặng 3 · Hộp nhặt
  }
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
  // Nguồn bổ sung (khi DB đã tạo từ trước): INSERT OR IGNORE nên chạy lại cũng an toàn.
  const { results: have } = await env.DB.prepare("SELECT id FROM sources WHERE id IN ('sm-deepseek','sm-figure','rss-fn-sg')").all<{ id: string }>();
  const ids = new Set(have.map((r) => r.id));
  if (!ids.has('sm-deepseek')) await env.DB.batch(splitSql(m4).map((st) => env.DB.prepare(st)));
  if (!ids.has('sm-figure')) await env.DB.batch(splitSql(m5).map((st) => env.DB.prepare(st)));
  if (!ids.has('rss-fn-sg')) await env.DB.batch(splitSql(m7).map((st) => env.DB.prepare(st)));
  // Sửa bài có ngày đăng ở tương lai (lỗi feed) — chúng chiếm đầu danh sách "Mới nhất".
  await env.DB.prepare('UPDATE items SET published_at = fetched_at WHERE published_at > fetched_at').run();
  ready = true;
}
