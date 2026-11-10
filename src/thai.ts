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

/** Đầu ngày hôm nay theo giờ VN (ISO UTC). */
const startOfVnDay = () => new Date(`${vnDay()}T00:00:00+07:00`).toISOString();

/**
 * Mỗi nhịp 5 phút: dịch TIÊU ĐỀ + MÔ TẢ của mọi bài Thái còn suất trong ngày bằng MỘT lượt gọi dịch,
 * rồi lấy toàn văn và xếp hàng dịch phần thân (tối đa 2 bài mỗi nhịp, nhịp sau làm tiếp).
 * Chỉ chọn bài "của hôm nay" (về MyLife hoặc đăng từ 00:00 giờ VN), mới nhất trước: hôm nay quá 10 bài thì
 * phần dư không dời sang ngày mai — ngày mai chỉ dịch 10 bài mới nhất của ngày mai.
 */
export async function autoTranslateThai(env: Env): Promise<string> {
  const notes: string[] = [];
  const done = await thaiDoneToday(env);
  const slots = THAI_PER_DAY - done;
  if (slots > 0) {
    const today = startOfVnDay();
    const { results } = await env.DB.prepare(
      `SELECT i.* FROM items i WHERE i.dismissed = 0 AND i.title_vi IS NULL AND (i.fetched_at >= ?1 OR i.published_at >= ?1)
       ORDER BY i.published_at DESC LIMIT 300`
    ).bind(today).all<ItemRow>();
    const picks = results.filter((x) => isThai(x.title_en) || isThai(x.abstract_en)).slice(0, slots);
    if (picks.length) {
      const texts = picks.flatMap((it) => [it.title_en, (it.abstract_en ?? '').slice(0, 500) || '—']);
      try {
        const vi = (await translateChunk(env, texts, false)).vi;
        await env.DB.batch([
          ...picks.map((it, k) =>
            env.DB.prepare('UPDATE items SET title_vi = ?, summary_vi = ? WHERE id = ?').bind(vi[2 * k] || it.title_en, vi[2 * k + 1] && vi[2 * k + 1] !== '—' ? vi[2 * k + 1] : null, it.id)
          ),
          env.DB.prepare(`INSERT INTO quota_usage (provider, period, used) VALUES (?, ?, ?) ON CONFLICT(provider, period) DO UPDATE SET used = used + excluded.used`).bind(COUNTER, vnDay(), picks.length),
        ]);
        notes.push(`Tiếng Thái: dịch tiêu đề ${picks.length} bài (${done + picks.length}/${THAI_PER_DAY} hôm nay)`);
      } catch (e) {
        if (e instanceof QuotaExhausted) return 'Tiếng Thái: các dịch vụ đã tới 95% hạn mức — chờ kỳ mới';
        if (e instanceof RateLimited) return 'Tiếng Thái: dịch vụ đang bận, thử lại nhịp sau';
        throw e;
      }
    }
  }
  // Phần thân: bài Thái đã dịch tiêu đề mà chưa có toàn văn → lấy về + xếp hàng dịch (2 bài mỗi nhịp).
  const { results: bodies } = await env.DB.prepare(
    `SELECT i.* FROM items i LEFT JOIN fulltexts f ON f.item_id = i.id
     WHERE i.title_vi IS NOT NULL AND i.dismissed = 0 AND f.item_id IS NULL AND i.fetched_at >= ? ORDER BY i.published_at DESC LIMIT 2`
  ).bind(new Date(Date.now() - 3 * 86400000).toISOString()).all<ItemRow>();
  for (const it of bodies.filter((x) => isThai(x.title_en) || isThai(x.abstract_en))) {
    const ft = await ensureFullText(env, it).catch(() => null);
    if (ft) await env.DB.prepare(`UPDATE fulltexts SET priority = 1, translated_at = NULL WHERE item_id = ? AND status <> 'translated'`).bind(it.id).run();
    notes.push(`Tiếng Thái #${it.id}: xếp hàng dịch toàn văn`);
  }
  return notes.join('\n');
}
