import type { Env } from '../types';
import { pacificDay, utcDay, vnMonth } from '../util';

export type Provider = 'gemini' | 'workers_ai' | 'azure' | 'deepl' | 'google_tr' | 'google_tts';

interface ProviderInfo {
  label: string;
  unit: string;
  period: () => string;
  limit: (env: Env) => number;
  scope: 'ngày' | 'tháng';
}

export const PROVIDERS: Record<Provider, ProviderInfo> = {
  gemini: { label: 'Gemini', unit: 'yêu cầu', period: () => pacificDay(), limit: (e) => Number(e.GEMINI_DAILY_REQUESTS) || 1000, scope: 'ngày' },
  workers_ai: { label: 'Workers AI', unit: 'neuron', period: () => utcDay(), limit: (e) => Number(e.WORKERS_AI_DAILY_NEURONS) || 10000, scope: 'ngày' },
  azure: { label: 'Azure', unit: 'ký tự', period: () => vnMonth(), limit: () => 2_000_000, scope: 'tháng' },
  deepl: { label: 'DeepL', unit: 'ký tự', period: () => vnMonth(), limit: () => 500_000, scope: 'tháng' },
  google_tr: { label: 'Google Dịch', unit: 'ký tự', period: () => vnMonth(), limit: () => 500_000, scope: 'tháng' },
  google_tts: { label: 'Giọng đọc', unit: 'ký tự', period: () => vnMonth(), limit: () => 4_000_000, scope: 'tháng' },
};

export async function used(env: Env, p: Provider): Promise<number> {
  const row = await env.DB.prepare('SELECT used FROM quota_usage WHERE provider = ? AND period = ?').bind(p, PROVIDERS[p].period()).first<{ used: number }>();
  return row?.used ?? 0;
}

/** Còn được dùng thêm `amount` mà không vượt ngưỡng dừng (mặc định 95%) không. */
export async function canUse(env: Env, p: Provider, amount = 1): Promise<boolean> {
  const stop = PROVIDERS[p].limit(env) * (Number(env.QUOTA_STOP_RATIO) || 0.95);
  return (await used(env, p)) + amount <= stop;
}

export async function addUsage(env: Env, p: Provider, amount: number): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO quota_usage (provider, period, used) VALUES (?, ?, ?)
     ON CONFLICT(provider, period) DO UPDATE SET used = used + excluded.used`
  ).bind(p, PROVIDERS[p].period(), amount).run();
}

/** Nhà cung cấp báo hết lượt (HTTP 429…) → coi như đã dùng hết kỳ này. */
export async function markExhausted(env: Env, p: Provider): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO quota_usage (provider, period, used) VALUES (?, ?, ?)
     ON CONFLICT(provider, period) DO UPDATE SET used = MAX(used, excluded.used)`
  ).bind(p, PROVIDERS[p].period(), PROVIDERS[p].limit(env)).run();
}

export async function quotaSnapshot(env: Env) {
  const keys = Object.keys(PROVIDERS) as Provider[];
  // Một truy vấn cho cả 6 dịch vụ (giữ số truy vấn D1 mỗi lượt thấp).
  const cond = keys.map(() => '(provider = ? AND period = ?)').join(' OR ');
  const { results } = await env.DB.prepare(`SELECT provider, used FROM quota_usage WHERE ${cond}`)
    .bind(...keys.flatMap((p) => [p, PROVIDERS[p].period()]))
    .all<{ provider: Provider; used: number }>();
  const map = Object.fromEntries(results.map((r) => [r.provider, r.used]));
  return keys.map((p) => {
    const info = PROVIDERS[p];
    const u = map[p] ?? 0;
    const lim = info.limit(env);
    return { provider: p, label: info.label, unit: info.unit, scope: info.scope, used: Math.round(u), limit: lim, pct: Math.min(100, Math.round((u / lim) * 100)) };
  });
}
