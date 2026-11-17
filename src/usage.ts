import type { Env } from './types';
import { CHANNEL_ORDER, CHANNELS, vnDay } from './util';

/*
 * Đo thời gian đọc trên MyLife. Trang gửi về số giây ĐANG ĐỌC THẬT: tab đang mở trên màn hình và anh có thao tác
 * (cuộn, chạm, gõ phím, rê chuột) trong 90 giây gần nhất, hoặc đang bật "Đọc bài". Để máy đứng yên thì không tính.
 * Bài "đã đọc" trong ngày = bài mở đọc từ 30 giây trở lên, hoặc bài anh bấm "Đã đọc".
 */

export type Device = 'iphone' | 'web';
export const deviceOf = (ua: string | undefined): Device => (/iPhone/i.test(ua ?? '') ? 'iphone' : 'web');
export const DEVICE_LABEL: Record<Device, string> = { web: 'Máy tính', iphone: 'iPhone' };
/** Đọc ≥ 30 giây mới tính là "đã đọc" một bài. */
export const READ_SECONDS = 30;

/** Ghi thời gian từ trang gửi về. ref = "item:123" | "capture:45" | "" (trang danh sách). */
export async function recordTime(env: Env, device: Device, ref: string, seconds: number): Promise<void> {
  const s = Math.round(seconds);
  if (!(s > 0)) return;
  const m = /^(item|capture):(\d+)$/.exec(ref);
  await env.DB.prepare(
    `INSERT INTO reading_time (day, device, kind, ref_id, seconds, last_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(day, device, kind, ref_id) DO UPDATE SET seconds = seconds + excluded.seconds, last_at = excluded.last_at`
  ).bind(vnDay(), device, m ? m[1] : 'page', m ? Number(m[2]) : 0, Math.min(s, 600), new Date().toISOString()).run();
}

export interface DayRow { day: string; web: number; iphone: number; articles: number }
export interface Stats {
  days: number;              // số ngày tính trung bình
  from: string;              // ngày đầu kỳ
  since: string | null;      // ngày bắt đầu có số liệu thời gian
  perDay: DayRow[];          // đủ từng ngày trong kỳ, cũ → mới
  total: { web: number; iphone: number; articles: number };
  channels: { id: string; label: string; seconds: number; articles: number }[];
  top: { kind: string; id: number; title: string; seconds: number; channel: string | null }[];
}

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export async function readingStats(env: Env, period: number): Promise<Stats> {
  const today = vnDay();
  const from = addDays(today, -(period - 1));
  const fromIso = new Date(`${from}T00:00:00+07:00`).toISOString();
  const [time, arts, chans, top, first] = await env.DB.batch([
    env.DB.prepare('SELECT day, device, SUM(seconds) AS s FROM reading_time WHERE day >= ? GROUP BY day, device').bind(from),
    env.DB.prepare(
      `SELECT day, COUNT(*) AS n FROM (
         SELECT day, kind || ':' || ref_id AS k FROM reading_time WHERE kind <> 'page' AND day >= ?1 GROUP BY day, kind, ref_id HAVING SUM(seconds) >= ${READ_SECONDS}
         UNION
         SELECT substr(datetime(read_at, '+7 hours'), 1, 10) AS day, 'item:' || id AS k FROM items WHERE read_at >= ?2
       ) GROUP BY day`
    ).bind(from, fromIso),
    env.DB.prepare(
      `SELECT ch, SUM(s) AS s, SUM(CASE WHEN kind <> 'page' AND s >= ${READ_SECONDS} THEN 1 ELSE 0 END) AS n FROM (
         SELECT r.kind, CASE WHEN r.kind = 'page' THEN 'page' ELSE COALESCE(i.channel, c.channel, 'page') END AS ch, SUM(r.seconds) AS s
         FROM reading_time r LEFT JOIN items i ON r.kind = 'item' AND i.id = r.ref_id LEFT JOIN captures c ON r.kind = 'capture' AND c.id = r.ref_id
         WHERE r.day >= ? GROUP BY r.kind, r.ref_id
       ) GROUP BY ch`
    ).bind(from),
    env.DB.prepare(
      `SELECT r.kind, r.ref_id AS id, SUM(r.seconds) AS s, COALESCE(i.title_vi, i.title_en, c.title, c.url, 'Mục nhặt') AS title, COALESCE(i.channel, c.channel) AS channel
       FROM reading_time r LEFT JOIN items i ON r.kind = 'item' AND i.id = r.ref_id LEFT JOIN captures c ON r.kind = 'capture' AND c.id = r.ref_id
       WHERE r.day >= ? AND r.kind <> 'page' GROUP BY r.kind, r.ref_id ORDER BY s DESC LIMIT 8`
    ).bind(from),
    env.DB.prepare(`SELECT MIN(day) AS d FROM reading_time`),
  ]);
  const since = (first.results[0] as { d: string | null } | undefined)?.d ?? null;
  const byDay = new Map<string, DayRow>();
  for (let k = 0; k < period; k++) { const d = addDays(from, k); byDay.set(d, { day: d, web: 0, iphone: 0, articles: 0 }); }
  for (const r of time.results as { day: string; device: Device; s: number }[]) { const row = byDay.get(r.day); if (row) row[r.device === 'iphone' ? 'iphone' : 'web'] += r.s; }
  for (const r of arts.results as { day: string; n: number }[]) { const row = byDay.get(r.day); if (row) row.articles = r.n; }
  const perDay = [...byDay.values()];
  // Trung bình chia cho số ngày kể từ ngày đầu tiên có số liệu trong kỳ (không tính những ngày trước khi có tính năng này).
  const firstData = perDay.find((d) => d.web || d.iphone || d.articles)?.day ?? today;
  const days = Math.max(1, perDay.filter((d) => d.day >= firstData).length);
  const total = perDay.reduce((t, d) => ({ web: t.web + d.web, iphone: t.iphone + d.iphone, articles: t.articles + d.articles }), { web: 0, iphone: 0, articles: 0 });
  const chMap = new Map((chans.results as { ch: string; s: number; n: number }[]).map((r) => [r.ch, r]));
  const channels = [
    ...CHANNEL_ORDER.map((c) => ({ id: c as string, label: CHANNELS[c].name, seconds: chMap.get(c)?.s ?? 0, articles: chMap.get(c)?.n ?? 0 })),
    { id: 'page', label: 'Duyệt danh sách, tìm kiếm, Hộp nhặt…', seconds: chMap.get('page')?.s ?? 0, articles: 0 },
  ];
  return { days, from, since, perDay, total, channels, top: (top.results as { kind: string; id: number; s: number; title: string; channel: string | null }[]).map((r) => ({ kind: r.kind, id: r.id, title: r.title, seconds: r.s, channel: r.channel })) };
}
