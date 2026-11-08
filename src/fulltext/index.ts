import type { Env, ItemRow } from '../types';
import { QuotaExhausted } from '../ai/providers';
import { vnDay } from '../util';
import type { Block } from './extract';
import { fetchFullText } from './fetch';
import { AI_ENGINES, makeChunks, translateChunk, type Engine } from './translate';

export interface FullTextRow {
  item_id: number;
  status: 'fetched' | 'partial' | 'translated' | 'waiting_quota' | 'abstract_only' | 'fetch_failed';
  kind: 'html' | 'arxiv_html' | 'abstract';
  base_url: string | null;
  blocks_en: string;
  blocks_vi: string | null;
  engines: string | null;
  chars_en: number;
  public_partial: number;
  want_ai: number;
  priority: number;
  error: string | null;
  fetched_at: string;
  translated_at: string | null;
}

export interface FullTextView {
  row: FullTextRow;
  blocks: Block[];
  vi: (string | null)[];
  engines: (Engine | null)[];
  translatedCount: number;
  translatableCount: number;
  usedMt: boolean;
}

export function viewOf(row: FullTextRow): FullTextView {
  const blocks: Block[] = JSON.parse(row.blocks_en);
  const vi: (string | null)[] = row.blocks_vi ? JSON.parse(row.blocks_vi) : blocks.map(() => null);
  const engines: (Engine | null)[] = row.engines ? JSON.parse(row.engines) : blocks.map(() => null);
  const idx = blocks.map((b, i) => (b.t && b.k !== 'pre' ? i : -1)).filter((i) => i >= 0);
  return {
    row,
    blocks,
    vi,
    engines,
    translatableCount: idx.length,
    translatedCount: idx.filter((i) => vi[i] != null).length,
    usedMt: engines.some((e) => e != null && !AI_ENGINES.includes(e)),
  };
}

export async function getFullText(env: Env, itemId: number): Promise<FullTextRow | null> {
  return env.DB.prepare('SELECT * FROM fulltexts WHERE item_id = ?').bind(itemId).first<FullTextRow>();
}

/** Lấy toàn văn nếu chưa có (hoặc lần trước lỗi). */
export async function ensureFullText(env: Env, it: ItemRow, priority = 0): Promise<FullTextRow | null> {
  const existing = await getFullText(env, it.id);
  if (existing && existing.status !== 'fetch_failed') {
    if (priority && !existing.priority) await env.DB.prepare('UPDATE fulltexts SET priority = 1 WHERE item_id = ?').bind(it.id).run();
    return existing;
  }
  const now = new Date().toISOString();
  try {
    const f = await fetchFullText(env, it);
    const chars = f.blocks.reduce((n, b) => n + (b.k === 'img' ? 0 : b.t.length), 0);
    await env.DB.prepare(
      `INSERT OR REPLACE INTO fulltexts (item_id, status, kind, base_url, blocks_en, blocks_vi, engines, chars_en, public_partial, want_ai, priority, error, fetched_at)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, 0, ?, NULL, ?)`
    ).bind(it.id, f.kind === 'abstract' ? 'abstract_only' : 'fetched', f.kind, f.baseUrl, JSON.stringify(f.blocks), chars, f.publicPartial ? 1 : 0, priority, now).run();
    // Bài chỉ có tóm tắt vẫn dịch (để đọc tiếng Việt), nên đưa vào hàng dịch.
    if (f.kind === 'abstract') await env.DB.prepare(`UPDATE fulltexts SET status = 'fetched' WHERE item_id = ? AND chars_en > 0`).bind(it.id).run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await env.DB.prepare(
      `INSERT OR REPLACE INTO fulltexts (item_id, status, kind, base_url, blocks_en, chars_en, priority, error, fetched_at)
       VALUES (?, 'fetch_failed', 'abstract', ?, ?, 0, ?, ?, ?)`
    ).bind(it.id, it.url, JSON.stringify(it.abstract_en ? [{ k: 'p', t: it.abstract_en }] : []), priority, msg.slice(0, 300), now).run();
  }
  return getFullText(env, it.id);
}

/** Dịch tiếp một bài, tối đa `maxChunks` lô. Trả về số lô đã dịch; ném QuotaExhausted khi hết sạch hạn mức. */
export async function translateItem(env: Env, itemId: number, maxChunks: number): Promise<number> {
  const row = await getFullText(env, itemId);
  if (!row || row.status === 'translated') return 0;
  const v = viewOf(row);
  // Dịch lại bằng AI: coi các đoạn đang là bản dịch máy như chưa dịch (nhưng vẫn giữ để hiển thị tới khi có bản AI).
  const pending = () => v.vi.map((x, i) => (row.want_ai && v.engines[i] && !AI_ENGINES.includes(v.engines[i]!) ? null : x));
  const chunks = makeChunks(v.blocks, pending());
  let done = 0;
  let stoppedByQuota = false;
  for (const idx of chunks.slice(0, maxChunks)) {
    try {
      const { vi, engine } = await translateChunk(env, idx.map((i) => v.blocks[i].t), !!row.want_ai);
      idx.forEach((i, k) => { v.vi[i] = vi[k]; v.engines[i] = engine; });
      done++;
    } catch (e) {
      if (e instanceof QuotaExhausted) { stoppedByQuota = true; break; }
      await env.DB.prepare('UPDATE fulltexts SET error = ? WHERE item_id = ?').bind(String(e instanceof Error ? e.message : e).slice(0, 300), itemId).run();
      break;
    }
  }
  const remaining = makeChunks(v.blocks, pending()).length;
  const status = remaining === 0 ? 'translated' : stoppedByQuota ? 'waiting_quota' : done > 0 ? 'partial' : row.status;
  await env.DB.prepare(
    `UPDATE fulltexts SET blocks_vi = ?, engines = ?, status = ?, want_ai = CASE WHEN ? = 'translated' THEN 0 ELSE want_ai END, translated_at = ? WHERE item_id = ?`
  ).bind(JSON.stringify(v.vi), JSON.stringify(v.engines), status, status, new Date().toISOString(), itemId).run();
  if (stoppedByQuota && done === 0) throw new QuotaExhausted('Hết hạn mức dịch miễn phí');
  return done;
}

const FETCH_PER_RUN = 3;
const CHUNKS_PER_RUN = 6;

/**
 * Hàng đợi toàn văn (chạy mỗi 30 phút):
 * 1. Lấy toàn văn cho bài Đáng đọc hôm nay và bài anh đã giữ.
 * 2. Dịch tiếp theo thứ tự: bài anh mở/xếp hàng → Đáng đọc → bài đã giữ.
 */
export async function processFullTextQueue(env: Env): Promise<string> {
  const notes: string[] = [];
  const { results: need } = await env.DB.prepare(
    `SELECT i.* FROM items i
     LEFT JOIN fulltexts f ON f.item_id = i.id
     WHERE f.item_id IS NULL AND i.dismissed = 0
       AND (i.kept = 1 OR i.id IN (SELECT item_id FROM daily_picks WHERE day = ?))
     LIMIT ?`
  ).bind(vnDay(), FETCH_PER_RUN).all<ItemRow>();
  for (const it of need) {
    const r = await ensureFullText(env, it);
    notes.push(`Toàn văn #${it.id}: ${r?.status ?? '?'}${r?.error ? ` (${r.error})` : ''}`);
  }

  const { results: queue } = await env.DB.prepare(
    `SELECT f.item_id FROM fulltexts f JOIN items i ON i.id = f.item_id
     WHERE f.status IN ('fetched','partial','waiting_quota') AND i.dismissed = 0
     ORDER BY f.priority DESC,
              (i.id IN (SELECT item_id FROM daily_picks WHERE day = ?)) DESC,
              i.kept DESC, f.fetched_at
     LIMIT 10`
  ).bind(vnDay()).all<{ item_id: number }>();
  let budget = CHUNKS_PER_RUN;
  for (const { item_id } of queue) {
    if (budget <= 0) break;
    try {
      const n = await translateItem(env, item_id, budget);
      budget -= n;
      if (n) notes.push(`Dịch #${item_id}: +${n} lô`);
    } catch (e) {
      if (e instanceof QuotaExhausted) { notes.push('Hết hạn mức dịch miễn phí — chờ hạn mức mới.'); break; }
      throw e;
    }
  }
  return notes.join('\n') || 'Hàng toàn văn trống';
}

/** Giữ bài đã giữ mãi mãi; bài không giữ xóa toàn văn sau 6 tháng. */
export async function cleanupFullTexts(env: Env): Promise<string> {
  const cutoff = new Date(Date.now() - 182 * 86400000).toISOString();
  const r = await env.DB.prepare(
    `DELETE FROM fulltexts WHERE fetched_at < ? AND item_id IN (SELECT id FROM items WHERE kept = 0)`
  ).bind(cutoff).run();
  return `Dọn toàn văn cũ: ${r.meta.changes ?? 0}`;
}
