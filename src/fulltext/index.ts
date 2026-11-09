import type { Env, ItemRow } from '../types';
import { QuotaExhausted, RateLimited } from '../ai/providers';
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
    // Chưa có ảnh đại diện (vd arXiv) → dùng hình đầu tiên trong toàn văn.
    const firstImg = f.blocks.find((b) => b.k === 'img' && b.src)?.src;
    if (firstImg && !it.image_url) await env.DB.prepare('UPDATE items SET image_url = ? WHERE id = ? AND image_url IS NULL').bind(firstImg, it.id).run();
    // Bài chỉ có phần mô tả vẫn dịch được khi anh bấm nút.
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
export interface TranslateStep { done: number; status: string; translated: number; total: number; rateLimited: boolean; error?: string | null }

/**
 * Dịch tối đa `maxChunks` lô, chạy SONG SONG từng đợt `parallel` lô (mỗi lô ~3.500 ký tự).
 * Lưu sau mỗi đợt để thanh tiến độ chạy đều. Bị giới hạn tạm thời (429 theo phút) → dừng, trả rateLimited để trình duyệt thử lại.
 */
export async function translateItem(env: Env, itemId: number, maxChunks: number, parallel = 4): Promise<number> {
  return (await translateStep(env, itemId, maxChunks, parallel)).done;
}

export async function translateStep(env: Env, itemId: number, maxChunks: number, parallel = 4): Promise<TranslateStep> {
  const row = await getFullText(env, itemId);
  if (!row) return { done: 0, status: 'missing', translated: 0, total: 0, rateLimited: false };
  const v = viewOf(row);
  const progress = (status: string, done: number, rateLimited: boolean): TranslateStep => {
    const vw = viewOf({ ...row, blocks_vi: JSON.stringify(v.vi) });
    return { done, status, translated: vw.translatedCount, total: vw.translatableCount, rateLimited };
  };
  if (row.status === 'translated') return progress('translated', 0, false);
  // Dịch lại bằng AI: coi các đoạn đang là bản dịch máy như chưa dịch (nhưng vẫn giữ để hiển thị tới khi có bản AI).
  const pending = () => v.vi.map((x, i) => (row.want_ai && v.engines[i] && !AI_ENGINES.includes(v.engines[i]!) ? null : x));
  const todo = makeChunks(v.blocks, pending()).slice(0, maxChunks);
  let done = 0;
  let stoppedByQuota = false;
  let rateLimited = false;
  let lastError: string | null = null;
  for (let w = 0; w < todo.length && !stoppedByQuota && !rateLimited; w += parallel) {
    const wave = todo.slice(w, w + parallel);
    const results = await Promise.allSettled(wave.map((idx) => translateChunk(env, idx.map((i) => v.blocks[i].t), !!row.want_ai)));
    results.forEach((r, k) => {
      if (r.status === 'fulfilled') {
        wave[k].forEach((i, j) => { v.vi[i] = r.value.vi[j]; v.engines[i] = r.value.engine; });
        done++;
      } else if (r.reason instanceof QuotaExhausted) stoppedByQuota = true;
      else if (r.reason instanceof RateLimited) rateLimited = true;
      else lastError = String(r.reason instanceof Error ? r.reason.message : r.reason).slice(0, 300);
    });
    if (lastError && !done) break;
    const remaining = makeChunks(v.blocks, pending()).length;
    const status = remaining === 0 ? 'translated' : stoppedByQuota && !done ? 'waiting_quota' : done > 0 ? 'partial' : row.status;
    await env.DB.prepare(
      `UPDATE fulltexts SET blocks_vi = ?, engines = ?, status = ?, error = ?, want_ai = CASE WHEN ? = 'translated' THEN 0 ELSE want_ai END, translated_at = ? WHERE item_id = ?`
    ).bind(JSON.stringify(v.vi), JSON.stringify(v.engines), status, lastError, status, new Date().toISOString(), itemId).run();
    row.status = status as FullTextRow['status'];
  }
  if (lastError && !done) {
    await env.DB.prepare('UPDATE fulltexts SET error = ?, translated_at = ? WHERE item_id = ?').bind(lastError, new Date().toISOString(), itemId).run();
  }
  if (stoppedByQuota && done === 0 && !rateLimited) {
    await env.DB.prepare(`UPDATE fulltexts SET status = 'waiting_quota' WHERE item_id = ? AND status <> 'translated'`).bind(itemId).run();
    throw new QuotaExhausted('Hết hạn mức dịch miễn phí');
  }
  const remaining = makeChunks(v.blocks, pending()).length;
  return { ...progress(remaining === 0 ? 'translated' : row.status, done, rateLimited), error: lastError };
}

/**
 * Tự lấy toàn văn (không dịch) cho 1 bài mỗi lượt: bài đã giữ → Đáng đọc hôm nay → bài mới nhất.
 * Tăng `attempts` TRƯỚC khi lấy: nếu lượt bị ngắt (quá 10 ms CPU), bài đó không chặn hàng mãi.
 */
export async function fetchNextFullText(env: Env): Promise<string> {
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const it = await env.DB.prepare(
    `SELECT i.* FROM items i LEFT JOIN fulltexts f ON f.item_id = i.id
     WHERE f.item_id IS NULL AND i.dismissed = 0 AND i.attempts < 3 AND (i.kept = 1 OR i.published_at >= ?)
     ORDER BY i.kept DESC, (i.id IN (SELECT item_id FROM daily_picks WHERE day = ?)) DESC, i.published_at DESC
     LIMIT 1`
  ).bind(since, vnDay()).first<ItemRow>();
  if (!it) return '';
  await env.DB.prepare('UPDATE items SET attempts = attempts + 1 WHERE id = ?').bind(it.id).run();
  const r = await ensureFullText(env, it);
  return `Toàn văn #${it.id}: ${r?.status ?? '?'}${r?.error ? ` (${r.error})` : ''}`;
}

/** Chỉ dịch những bài anh đã bấm "Dịch bài này" (priority = 1), tối đa `maxChunks` lô mỗi lượt. */
export async function translateRequested(env: Env, maxChunks: number): Promise<string> {
  const { results } = await env.DB.prepare(
    `SELECT item_id FROM fulltexts WHERE priority = 1 AND status IN ('fetched','partial','waiting_quota')
       AND (translated_at IS NULL OR translated_at < ?) ORDER BY translated_at IS NOT NULL, translated_at LIMIT 3`
  ).bind(new Date(Date.now() - 3 * 60000).toISOString()).all<{ item_id: number }>(); // bài đang được trình duyệt dịch (vừa cập nhật < 3 phút) thì để trình duyệt làm
  const notes: string[] = [];
  let budget = maxChunks;
  for (const { item_id } of results) {
    if (budget <= 0) break;
    try {
      const n = await translateItem(env, item_id, budget);
      budget -= n;
      if (n) notes.push(`Dịch #${item_id}: +${n} lô`);
    } catch (e) {
      if (e instanceof QuotaExhausted) { notes.push('Hết hạn mức dịch miễn phí — chờ kỳ mới.'); break; }
      throw e;
    }
  }
  return notes.join('\n');
}

/**
 * Bài trong Sổ tay (bài đã "Lưu Sổ tay", hoặc bài tạo từ mục nhặt đã "Lưu Sổ tay") giữ toàn văn + bản dịch vĩnh viễn;
 * bài khác xóa toàn văn + bản dịch sau 6 tháng (tiêu đề, mô tả, link vẫn còn).
 */
export async function cleanupFullTexts(env: Env): Promise<string> {
  const cutoff = new Date(Date.now() - 182 * 86400000).toISOString();
  const r = await env.DB.prepare(
    `DELETE FROM fulltexts WHERE fetched_at < ? AND item_id IN (SELECT id FROM items WHERE kept = 0)
       AND item_id NOT IN (SELECT item_id FROM captures WHERE kept = 1 AND item_id IS NOT NULL)`
  ).bind(cutoff).run();
  return `Dọn toàn văn cũ: ${r.meta.changes ?? 0}`;
}
