import type { Env } from './types';

/*
 * Chỉ dùng khi chạy thử trên máy (biến DB_STATS=1): đếm số dòng D1 phải đọc (rows_read) của từng truy vấn,
 * in ra nhật ký theo từng yêu cầu / từng nhịp cron. Không bật trên Cloudflare.
 */
type Row = { sql: string; rows: number };
export function withDbStats(env: Env, label: string): { env: Env; done: () => void } {
  if ((env as unknown as { DB_STATS?: string }).DB_STATS !== '1') return { env, done: () => {} };
  const log: Row[] = [];
  const rec = (sql: string, meta: { rows_read?: number } | undefined) => log.push({ sql: sql.replace(/\s+/g, ' ').slice(0, 140), rows: meta?.rows_read ?? 0 });
  const wrapStmt = (s: D1PreparedStatement, sql: string): D1PreparedStatement =>
    new Proxy(s, {
      get(t, k) {
        if (k === 'bind') return (...a: unknown[]) => wrapStmt(t.bind(...a), sql);
        if (k === 'all' || k === 'run') return async () => { const r = await (t as any)[k](); rec(sql, r.meta); return r; };
        if (k === 'first') return async (col?: string) => { const r = await t.all(); rec(sql, r.meta); const row = r.results[0] as any; return row === undefined ? null : col ? row[col] : row; };
        if (k === 'raw') return async (o?: any) => { const r = await t.all(); rec(sql, r.meta); return (t as any).raw(o); };
        if (k === '__sql') return sql;
        if (k === '__target') return t;
        const v = (t as any)[k]; return typeof v === 'function' ? v.bind(t) : v;
      },
    });
  const db = new Proxy(env.DB, {
    get(t, k) {
      if (k === 'prepare') return (sql: string) => wrapStmt(t.prepare(sql), sql);
      if (k === 'batch') return async (stmts: D1PreparedStatement[]) => {
        const inner = stmts.map((s) => (s as any).__target ?? s);
        const r = await t.batch(inner.map((s: any) => s));
        r.forEach((x, i) => rec(`[batch] ${(stmts[i] as any).__sql ?? '?'}`, x.meta));
        return r;
      };
      const v = (t as any)[k]; return typeof v === 'function' ? v.bind(t) : v;
    },
  });
  return {
    env: { ...env, DB: db },
    done: () => {
      const total = log.reduce((n, r) => n + r.rows, 0);
      console.log(`DBSTATS ${label} total=${total} queries=${log.length}`);
      for (const r of [...log].sort((a, b) => b.rows - a.rows).slice(0, 12)) console.log(`DBSTATS   ${String(r.rows).padStart(7)}  ${r.sql}`);
    },
  };
}
