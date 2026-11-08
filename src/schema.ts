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
  ready = true;
}
