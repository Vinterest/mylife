import type { Env, ItemRow } from './types';
import { scoreItem, vnDay } from './util';

export const PICKS = 50;
// Mỗi kênh tối đa 20 bài để danh sách không bị một kênh chiếm hết.
const MAX_PER_CHANNEL = 20;

/** Chọn tối đa 50 bài "Đáng đọc" cho ngày (giờ VN), trong các bài 72 giờ qua chưa đọc. */
export async function makePicks(env: Env, day = vnDay()): Promise<string> {
  const since = new Date(Date.now() - 72 * 3600000).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT i.*, s.weight AS source_weight FROM items i JOIN sources s ON s.id = i.source_id
     WHERE i.published_at >= ? AND i.dismissed = 0 AND i.read_at IS NULL
       AND i.id NOT IN (SELECT item_id FROM daily_picks WHERE day < ?)`
  ).bind(since, day).all<ItemRow>();

  const now = new Date();
  const ranked = results
    .map((it) => ({
      it,
      s: scoreItem({ channel: it.channel, publishedAt: it.published_at, text: `${it.title_en} ${it.abstract_en ?? ''}`, sourceWeight: it.source_weight ?? 10 }, now)
        + (it.status === 'summarized' ? 5 : 0),
    }))
    .sort((a, b) => b.s - a.s);

  const perChannel: Record<string, number> = {};
  const chosen: { it: ItemRow; s: number }[] = [];
  for (const r of ranked) {
    if (chosen.length >= PICKS) break;
    if ((perChannel[r.it.channel] ?? 0) >= MAX_PER_CHANNEL) continue;
    perChannel[r.it.channel] = (perChannel[r.it.channel] ?? 0) + 1;
    chosen.push(r);
  }

  const stmts = [env.DB.prepare('DELETE FROM daily_picks WHERE day = ?').bind(day)];
  chosen.forEach((c, i) => {
    stmts.push(env.DB.prepare('INSERT INTO daily_picks (day, rank, item_id) VALUES (?, ?, ?)').bind(day, i + 1, c.it.id));
    stmts.push(env.DB.prepare('UPDATE items SET score = ? WHERE id = ?').bind(Math.min(100, c.s), c.it.id));
  });
  await env.DB.batch(stmts);
  return `Đáng đọc ${day}: ${chosen.length} bài`;
}
