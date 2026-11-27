import type { Env, ItemRow } from './types';
import { QuotaExhausted, RateLimited } from './ai/providers';
import { ensureFullText } from './fulltext';
import { translateChunk } from './fulltext/translate';
import { capName, isAuto, itemLang, type Lang } from './lang';
import { vnDay } from './util';
import { livePicks } from './db';

/*
 * Bài tiếng châu Á (Thái, Indonesia, Mã Lai, Hàn, Nhật, Trung, Lào, Khmer, Myanmar) tự dịch sang tiếng Việt,
 * không cần bấm nút. Mỗi ngôn ngữ tối đa 10 bài mỗi ngày (giờ VN).
 * Mỗi bài: dịch tiêu đề + mô tả ngay → lấy toàn văn → xếp hàng để nhịp 5 phút dịch tiếp phần thân.
 * Dùng chung chuỗi dịch quay vòng: mọi dịch vụ đã tới 95% hạn mức thì dừng, chờ kỳ mới (không đếm bài).
 */

export const AUTO_PER_DAY = 10;
/*
 * Bài tiếng Anh của các nguồn bật "Dịch mặc định Anh → Việt" (trang Nguồn & hạn mức) — dịch theo nhu cầu đọc thật:
 *  1. Dịch đúng lúc: trang danh sách hiện ra thì dịch gộp tiêu đề + tóm tắt của đúng những bài đang trên màn hình
 *     (translateTitles), lưu lại vĩnh viễn. Kênh/trang anh không mở thì không tốn hạn mức.
 *  2. Dịch sẵn trang Hôm nay mỗi giờ (pretranslateToday): số bài = số bài anh đọc trung bình/ngày (7 ngày gần nhất),
 *     tối thiểu 5, tối đa 30 — để trang mở đầu tiên mỗi sáng hiện tiếng Việt ngay.
 *  3. Toàn văn: tự dịch khi anh mở bài.
 */
const PRE_MIN = 5;
const PRE_MAX = 30;
const TITLES_PER_REQUEST = 25;
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
  const groups = new Map<Lang, ItemRow[]>();
  for (const it of results) {
    const l = itemLang(it);
    if (!isAuto(l)) continue;
    const g = groups.get(l) ?? [];
    if (g.length < AUTO_PER_DAY - doneOf(l)) groups.set(l, [...g, it]);
  }

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
      notes.push(`${capName(l)}: dịch tiêu đề ${picks.length} bài (${doneOf(l) + picks.length}/${AUTO_PER_DAY} hôm nay)`);
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

/** Bài cần dịch tiêu đề: chưa có tiêu đề tiếng Việt, và là bài tiếng châu Á, hoặc bài tiếng Anh của nguồn bật "Dịch mặc định". */
export function needsTitleVi(it: ItemRow): boolean {
  if (it.title_vi) return false;
  const l = itemLang(it);
  return l === 'en' ? !!it.source_auto_vi : isAuto(l);
}

/** Dịch gộp tiêu đề + tóm tắt của một nhóm bài (mỗi ngôn ngữ 1 lượt gọi). Trả về bản dịch theo id. */
async function translateBatch(env: Env, items: ItemRow[]): Promise<Record<number, { t: string; s: string | null; lang: Lang }>> {
  const out: Record<number, { t: string; s: string | null; lang: Lang }> = {};
  const byLang = new Map<Lang, ItemRow[]>();
  for (const it of items) { const l = itemLang(it); byLang.set(l, [...(byLang.get(l) ?? []), it]); }
  const day = vnDay();
  for (const [l, group] of byLang) {
    const texts = group.flatMap((it) => [it.title_en, (it.abstract_en ?? '').slice(0, 500) || '—']);
    const vi = (await translateChunk(env, texts, false)).vi;
    const rows = group.map((it, k) => ({ it, t: vi[2 * k] || it.title_en, s: vi[2 * k + 1] && vi[2 * k + 1] !== '—' ? vi[2 * k + 1] : null }));
    await env.DB.batch([
      ...rows.map((r) => env.DB.prepare('UPDATE items SET title_vi = ?, summary_vi = ? WHERE id = ? AND title_vi IS NULL').bind(r.t, r.s, r.it.id)),
      env.DB.prepare(`INSERT INTO quota_usage (provider, period, used) VALUES (?, ?, ?) ON CONFLICT(provider, period) DO UPDATE SET used = used + excluded.used`).bind(l === 'en' ? 'title_en' : counterOf(l), day, group.length),
    ]);
    for (const r of rows) out[r.it.id] = { t: r.t, s: r.s, lang: l };
  }
  return out;
}

/** Dịch đúng lúc: các bài đang hiện trên màn hình (trình duyệt gửi id lên). Hết hạn mức thì trả về rỗng, giữ tiếng gốc. */
export async function translateTitles(env: Env, ids: number[]): Promise<Record<number, { t: string; s: string | null; lang: Lang }>> {
  const list = [...new Set(ids.filter((x) => Number.isInteger(x) && x > 0))].slice(0, TITLES_PER_REQUEST);
  if (!list.length) return {};
  const { results } = await env.DB.prepare(
    `SELECT i.*, s.auto_vi AS source_auto_vi FROM items i JOIN sources s ON s.id = i.source_id WHERE i.id IN (${list.map(() => '?').join(',')})`
  ).bind(...list).all<ItemRow>();
  const todo = results.filter(needsTitleVi);
  if (!todo.length) return {};
  try {
    return await translateBatch(env, todo);
  } catch (e) {
    if (e instanceof QuotaExhausted || e instanceof RateLimited) return {};
    throw e;
  }
}

/** Số bài anh đọc trung bình mỗi ngày trong 7 ngày gần nhất (chỉ mục idx_items_read). */
async function readPerDay(env: Env): Promise<number> {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM items INDEXED BY idx_items_read WHERE read_at >= ?').bind(since).first<{ n: number }>();
  return (r?.n ?? 0) / 7;
}

/** Mỗi giờ một lần: dịch sẵn các bài đầu trang Hôm nay, số lượng theo tốc độ đọc của anh. */
export async function pretranslateToday(env: Env): Promise<string> {
  if (new Date().getUTCMinutes() >= 5 && !(env as unknown as { DEV_FAKE_TRANSLATE?: string }).DEV_FAKE_TRANSLATE) return '';
  const cap = Math.min(PRE_MAX, Math.max(PRE_MIN, Math.round(await readPerDay(env))));
  const picks = (await livePicks(env, 'moi')).slice(0, cap).filter(needsTitleVi);
  if (!picks.length) return `Hôm nay: ${cap} bài đầu đã có tiếng Việt`;
  try {
    const done = await translateBatch(env, picks);
    return `Hôm nay: dịch sẵn tiêu đề ${Object.keys(done).length} bài (mức ${cap} bài theo tốc độ đọc)`;
  } catch (e) {
    if (e instanceof QuotaExhausted) return 'Hôm nay: các dịch vụ đã tới 95% hạn mức — chờ kỳ mới';
    if (e instanceof RateLimited) return 'Hôm nay: dịch vụ đang bận, thử lại giờ sau';
    throw e;
  }
}
