import type { Channel, Env, ItemRow, SourceRow } from './types';

const ITEM_COLS = `i.*, s.name AS source_name, s.weight AS source_weight`;

export type SortMode = 'moi' | 'diem';
const ORDER: Record<SortMode, string> = { moi: 'i.published_at DESC, i.id DESC', diem: 'i.score DESC, i.published_at DESC' };

const PICKS = 50;
const PICKS_PER_CHANNEL = 20;

/**
 * "Đáng đọc": tính lại MỖI LẦN mở trang (không cố định từ 06:30), nên bài mới về là có mặt ngay.
 * Lấy 50 bài điểm cao nhất trong 72 giờ qua chưa đọc (mỗi kênh tối đa 20), rồi xếp theo lựa chọn:
 * mới nhất trước (mặc định) hoặc điểm cao trước.
 */
export async function livePicks(env: Env, sort: SortMode): Promise<ItemRow[]> {
  const since = new Date(Date.now() - 72 * 3600000).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT ${ITEM_COLS} FROM items i JOIN sources s ON s.id = i.source_id
     WHERE i.published_at >= ? AND i.dismissed = 0 AND i.read_at IS NULL
     ORDER BY i.score DESC, i.published_at DESC LIMIT 400`
  ).bind(since).all<ItemRow>();
  const per: Record<string, number> = {};
  const chosen: ItemRow[] = [];
  for (const it of results) {
    if (chosen.length >= PICKS) break;
    if ((per[it.channel] ?? 0) >= PICKS_PER_CHANNEL) continue;
    per[it.channel] = (per[it.channel] ?? 0) + 1;
    chosen.push(it);
  }
  if (sort === 'moi') chosen.sort((x, y) => (x.published_at < y.published_at ? 1 : x.published_at > y.published_at ? -1 : y.id - x.id));
  return chosen;
}

export async function latestByChannel(env: Env, channel: Channel, limit: number, offset = 0, sort: SortMode = 'moi'): Promise<ItemRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT ${ITEM_COLS} FROM items i JOIN sources s ON s.id = i.source_id
     WHERE i.channel = ? AND i.dismissed = 0 AND i.read_at IS NULL ORDER BY ${ORDER[sort]} LIMIT ? OFFSET ?`
  ).bind(channel, limit, offset).all<ItemRow>();
  return results;
}

/** Tab "Đã đọc": bài đã bấm Đã đọc, mới đọc trước. */
export async function readItems(env: Env, limit: number, offset = 0): Promise<ItemRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT ${ITEM_COLS} FROM items i JOIN sources s ON s.id = i.source_id
     WHERE i.read_at IS NOT NULL ORDER BY i.read_at DESC LIMIT ? OFFSET ?`
  ).bind(limit, offset).all<ItemRow>();
  return results;
}

export async function getItem(env: Env, id: number): Promise<ItemRow | null> {
  return env.DB.prepare(`SELECT ${ITEM_COLS} FROM items i JOIN sources s ON s.id = i.source_id WHERE i.id = ?`).bind(id).first<ItemRow>();
}

/** Số bài mới trong 7 ngày qua, theo kênh. */
export async function weeklyCounts(env: Env): Promise<Record<string, number>> {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT channel, COUNT(*) AS n FROM items WHERE dismissed = 0 AND published_at >= ? GROUP BY channel`
  ).bind(since).all<{ channel: string; n: number }>();
  return Object.fromEntries(results.map((r) => [r.channel, r.n]));
}

export async function allSources(env: Env): Promise<SourceRow[]> {
  const { results } = await env.DB.prepare('SELECT * FROM sources ORDER BY channel, kind, name').all<SourceRow>();
  return results;
}

export async function recentJobs(env: Env, limit = 12) {
  const { results } = await env.DB.prepare('SELECT * FROM jobs_log ORDER BY id DESC LIMIT ?').bind(limit).all<{ id: number; job: string; started_at: string; ok: number; detail: string }>();
  return results;
}
