import type { Channel, Env, ItemRow, SourceRow } from './types';
import { vnDay } from './util';

const ITEM_COLS = `i.*, s.name AS source_name, s.weight AS source_weight`;

export async function picksForToday(env: Env): Promise<ItemRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT ${ITEM_COLS} FROM daily_picks p JOIN items i ON i.id = p.item_id JOIN sources s ON s.id = i.source_id
     WHERE p.day = ? AND i.read_at IS NULL AND i.dismissed = 0 ORDER BY p.rank`
  ).bind(vnDay()).all<ItemRow>();
  return results;
}

export async function latestByChannel(env: Env, channel: Channel, limit: number, offset = 0): Promise<ItemRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT ${ITEM_COLS} FROM items i JOIN sources s ON s.id = i.source_id
     WHERE i.channel = ? AND i.dismissed = 0 AND i.read_at IS NULL ORDER BY i.published_at DESC LIMIT ? OFFSET ?`
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
