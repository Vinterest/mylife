import type { Env } from './types';
import m1 from '../migrations/0001_init.sql';
import m2 from '../migrations/0002_sources.sql';
import m3 from '../migrations/0003_fulltext.sql';

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
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('sources','items','daily_picks','quota_usage','jobs_log','fulltexts')").first<{ n: number }>();
  if ((row?.n ?? 0) < 6) {
    for (const file of [m1, m2, m3]) {
      const stmts = splitSql(file).map((s) => env.DB.prepare(s));
      if (stmts.length) await env.DB.batch(stmts);
    }
  }
  // Cột thêm sau (ảnh đại diện). Không để trong migrations/ để tránh xung đột với lệnh tự thêm cột này.
  const col = await env.DB.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('items') WHERE name = 'image_url'").first<{ n: number }>();
  if (!col?.n) {
    await env.DB.batch([
      env.DB.prepare('ALTER TABLE items ADD COLUMN image_url TEXT'),
      // Chuyển sang "chỉ dịch khi anh bấm": bỏ hàng dịch tự động cũ (một lần).
      env.DB.prepare(`UPDATE fulltexts SET priority = 0 WHERE status IN ('fetched','partial','waiting_quota')`),
    ]);
  }
  ready = true;
}
