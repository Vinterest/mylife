import type { Env, ItemRow } from './types';
import { QuotaExhausted, RateLimited } from './ai/providers';
import { ensureFullText } from './fulltext';
import { translateChunk } from './fulltext/translate';
import { capName, isAuto, itemLang, type Lang } from './lang';
import { vnDay } from './util';

/*
 * Bài tiếng châu Á (Thái, Indonesia, Mã Lai, Hàn, Nhật, Trung, Lào, Khmer, Myanmar) tự dịch sang tiếng Việt,
 * không cần bấm nút. Mỗi ngôn ngữ tối đa 10 bài mỗi ngày (giờ VN).
 * Mỗi bài: dịch tiêu đề + mô tả ngay → lấy toàn văn → xếp hàng để nhịp 5 phút dịch tiếp phần thân.
 * Dùng chung chuỗi dịch quay vòng: mọi dịch vụ đã tới 95% hạn mức thì dừng, chờ kỳ mới (không đếm bài).
 */

export const AUTO_PER_DAY = 10;
/**
 * Bài tiếng Anh của các nguồn bật "Dịch mặc định Anh → Việt" (trang Nguồn & hạn mức): dịch sẵn tiêu đề + tóm tắt,
 * tối đa 60 bài/ngày (ưu tiên điểm cao), 10 bài mỗi nhịp — giữ hạn mức miễn phí. Toàn văn dịch khi anh mở bài.
 */
export const EN_PER_DAY = 60;
const EN_PER_TICK = 10;
/** Dòng đếm trong quota_usage, kỳ = ngày VN. Tiếng Thái giữ tên cũ để không đếm lại từ đầu. */
const counterOf = (l: Lang) => (l === 'th' ? 'thai_auto' : `auto_${l}`);

/** Đầu ngày hôm nay theo giờ VN (ISO UTC). */
const startOfVnDay = () => new Date(`${vnDay()}T00:00:00+07:00`).toISOString();

/**
 * Mỗi nhịp 5 phút: với từng ngôn ngữ, dịch TIÊU ĐỀ + MÔ TẢ của các bài còn suất trong ngày bằng MỘT lượt gọi,
 * rồi lấy toàn văn và xếp hàng dịch phần thân (tối đa 2 bài mỗi nhịp).
 * Chỉ chọn bài "của hôm nay" (về MyLife hoặc đăng từ 00:00 giờ VN), mới nhất trước: quá 10 bài thì phần dư
 * không dời sang ngày mai — ngày mai chỉ dịch 10 bài mới nhất của ngày mai.
 */
export async function autoTranslateAsian(env: Env): Promise<string> {
  const notes: string[] = [];
  const day = vnDay();
  const { results: used } = await env.DB.prepare(
    `SELECT provider, used FROM quota_usage WHERE period = ? AND (provider = 'thai_auto' OR provider LIKE 'auto\\_%' ESCAPE '\\')`
  ).bind(day).all<{ provider: string; used: number }>();
  const doneOf = (l: Lang) => used.find((r) => r.provider === counterOf(l))?.used ?? 0;

  const { results } = await env.DB.prepare(
    `SELECT i.* FROM items i INDEXED BY idx_items_fetched WHERE i.fetched_at >= ?1 AND i.dismissed = 0 AND i.title_vi IS NULL
     ORDER BY i.published_at DESC LIMIT 300`
  ).bind(startOfVnDay()).all<ItemRow>();
  const { results: srcRows } = await env.DB.prepare('SELECT id FROM sources WHERE auto_vi = 1').all<{ id: string }>();
  const autoSrc = new Set(srcRows.map((r) => r.id));
  const groups = new Map<Lang, ItemRow[]>();
  const en: ItemRow[] = [];
  for (const it of results) {
    const l = itemLang(it);
    if (l === 'en' && autoSrc.has(it.source_id)) { en.push(it); continue; }
    if (!isAuto(l)) continue;
    const g = groups.get(l) ?? [];
    if (g.length < AUTO_PER_DAY - doneOf(l)) groups.set(l, [...g, it]);
  }

  // Tiếng Anh: bài điểm cao trước, còn suất trong ngày.
  const enRoom = Math.min(EN_PER_TICK, EN_PER_DAY - doneOf('en'));
  if (enRoom > 0 && en.length) groups.set('en', en.sort((a, b) => b.score - a.score).slice(0, enRoom));

  for (const [l, picks] of groups) {
    if (!picks.length) continue;
    const texts = picks.flatMap((it) => [it.title_en, (it.abstract_en ?? '').slice(0, 500) || '—']);
    try {
      const vi = (await translateChunk(env, texts, false)).vi;
      await env.DB.batch([
        ...picks.map((it, k) =>
          env.DB.prepare('UPDATE items SET title_vi = ?, summary_vi = ? WHERE id = ?').bind(vi[2 * k] || it.title_en, vi[2 * k + 1] && vi[2 * k + 1] !== '—' ? vi[2 * k + 1] : null, it.id)
        ),
        env.DB.prepare(`INSERT INTO quota_usage (provider, period, used) VALUES (?, ?, ?) ON CONFLICT(provider, period) DO UPDATE SET used = used + excluded.used`).bind(counterOf(l), day, picks.length),
      ]);
      notes.push(`${capName(l)}: dịch tiêu đề ${picks.length} bài (${doneOf(l) + picks.length}/${l === 'en' ? EN_PER_DAY : AUTO_PER_DAY} hôm nay)`);
    } catch (e) {
      if (e instanceof QuotaExhausted) { notes.push('Tự dịch: các dịch vụ đã tới 95% hạn mức — chờ kỳ mới'); return notes.join('\n'); }
      if (e instanceof RateLimited) { notes.push(`${capName(l)}: dịch vụ đang bận, thử lại nhịp sau`); continue; }
      throw e;
    }
  }

  // Phần thân: bài châu Á đã dịch tiêu đề mà chưa có toàn văn → lấy về + xếp hàng dịch (2 bài mỗi nhịp).
  const { results: cand } = await env.DB.prepare(
    // Hàng chờ toàn văn (chỉ mục idx_items_ft_todo: attempts < 3 = chưa có toàn văn) → chỉ đọc vài bài, không quét cả bảng.
    `SELECT i.* FROM items i INDEXED BY idx_items_ft_todo
     WHERE i.attempts < 3 AND i.dismissed = 0 AND i.published_at >= ? AND i.title_vi IS NOT NULL ORDER BY i.published_at DESC LIMIT 20`
  ).bind(new Date(Date.now() - 3 * 86400000).toISOString()).all<ItemRow>();
  for (const it of cand.filter((x) => isAuto(itemLang(x))).slice(0, 2)) {
    const ft = await ensureFullText(env, it).catch(() => null);
    if (ft) await env.DB.prepare(`UPDATE fulltexts SET priority = 1, translated_at = NULL WHERE item_id = ? AND status <> 'translated'`).bind(it.id).run();
    notes.push(`${capName(itemLang(it))} #${it.id}: xếp hàng dịch toàn văn`);
  }
  return notes.join('\n');
}
