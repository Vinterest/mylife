import type { Env, ItemRow } from './types';
import { QuotaExhausted, RateLimited } from './ai/providers';
import { ensureFullText } from './fulltext';
import { THAI_RE, translateChunk } from './fulltext/translate';
import { vnDay } from './util';

/*
 * Bài tiếng Thái tự dịch sang tiếng Việt (không cần bấm nút), tối đa 10 bài mỗi ngày (giờ VN).
 * Mỗi bài: dịch tiêu đề ngay → lấy toàn văn → đánh dấu "đã yêu cầu dịch" để nhịp 5 phút dịch tiếp phần thân.
 * Dùng chung chuỗi dịch quay vòng: mọi dịch vụ đã tới 95% hạn mức thì dừng, chờ kỳ mới (không đếm bài).
 */

export const THAI_PER_DAY = 10;
const COUNTER = 'thai_auto'; // dòng đếm trong quota_usage, kỳ = ngày VN

export const isThai = (s: string | null | undefined) => !!s && THAI_RE.test(s);

export async function thaiDoneToday(env: Env): Promise<number> {
  const r = await env.DB.prepare('SELECT used FROM quota_usage WHERE provider = ? AND period = ?').bind(COUNTER, vnDay()).first<{ used: number }>();
  return r?.used ?? 0;
}

export async function autoTranslateThai(env: Env): Promise<string> {
  const done = await thaiDoneToday(env);
  if (done >= THAI_PER_DAY) return '';
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT i.* FROM items i WHERE i.dismissed = 0 AND i.title_vi IS NULL AND i.published_at >= ? ORDER BY i.published_at DESC LIMIT 300`
  ).bind(since).all<ItemRow>();
  const it = results.find((x) => isThai(x.title_en) || isThai(x.abstract_en));
  if (!it) return '';
  try {
    // Một lượt dịch cho cả tiêu đề và đoạn mô tả (để danh sách hiện tiếng Việt).
    const desc = (it.abstract_en ?? '').slice(0, 600);
    const [titleVi, descVi] = (await translateChunk(env, desc ? [it.title_en, desc] : [it.title_en], false)).vi;
    await env.DB.batch([
      env.DB.prepare('UPDATE items SET title_vi = ?, summary_vi = ? WHERE id = ?').bind(titleVi || it.title_en, descVi || null, it.id),
      env.DB.prepare(`INSERT INTO quota_usage (provider, period, used) VALUES (?, ?, 1) ON CONFLICT(provider, period) DO UPDATE SET used = used + 1`).bind(COUNTER, vnDay()),
    ]);
  } catch (e) {
    if (e instanceof QuotaExhausted) return 'Tiếng Thái: các dịch vụ đã tới 95% hạn mức — chờ kỳ mới';
    if (e instanceof RateLimited) return 'Tiếng Thái: dịch vụ đang bận, thử lại nhịp sau';
    throw e;
  }
  // Phần thân: lấy toàn văn rồi xếp vào hàng dịch (nhịp 5 phút dịch tiếp 2 lô mỗi lần).
  const ft = await ensureFullText(env, it).catch(() => null);
  if (ft) await env.DB.prepare(`UPDATE fulltexts SET priority = 1, translated_at = NULL WHERE item_id = ? AND status <> 'translated'`).bind(it.id).run();
  return `Tiếng Thái #${it.id}: đã dịch tiêu đề, xếp hàng dịch toàn văn (${done + 1}/${THAI_PER_DAY} hôm nay)`;
}
