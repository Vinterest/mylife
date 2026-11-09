import type { Env, RawItem, SourceRow } from '../types';
import { matchesKeywords, normalizeTitle, readMinutes, scoreItem } from '../util';
import { parseArxiv, parseFeed, parsePageMeta, parseSitemap } from './parse';

const UA = 'MyLife-Reader/1.0 (personal reader; contact via mylife.gm-chess.com)';
const MAX_AGE_DAYS = 7;
const MAX_PER_SOURCE = 30;
const RSS_EVERY_H = 6;
const SITEMAP_AGE_DAYS = 60; // trang ít tin (DeepSeek): lấy tin trong 60 ngày
const SITEMAP_NEW_PER_RUN = 3;
const RETRY_AFTER_H = 1;
export const RUNNING = 'đang chạy…';

function arxivQuery(src: SourceRow): string {
  const cats = src.url.split(',').map((c) => `cat:${c.trim()}`).join(' OR ');
  const kws = (src.keywords ?? '').split(',').map((k) => k.trim()).filter(Boolean);
  const q = kws.length ? `(${cats}) AND (${kws.map((k) => `abs:"${k}"`).join(' OR ')})` : `(${cats})`;
  const params = new URLSearchParams({ search_query: q, sortBy: 'submittedDate', sortOrder: 'descending', max_results: '50' });
  return `https://export.arxiv.org/api/query?${params}`;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Lưu cả nguồn trong MỘT lệnh db.batch (gói miễn phí giới hạn 50 truy vấn D1 mỗi lượt chạy). */
async function saveItems(env: Env, src: SourceRow, raw: RawItem[]): Promise<number> {
  const now = new Date();
  const cutoff = now.getTime() - (src.kind === 'sitemap' ? SITEMAP_AGE_DAYS : MAX_AGE_DAYS) * 86400000;
  const seen = new Set<string>();
  const stmts: D1PreparedStatement[] = [];
  const fill: D1PreparedStatement[] = [];
  for (const it of raw) {
    if (stmts.length >= MAX_PER_SOURCE) break;
    if (it.published.getTime() < cutoff) continue;
    if (src.kind === 'rss' && !matchesKeywords(`${it.title} ${it.abstract}`, src.keywords)) continue;
    const key = normalizeTitle(it.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const publishedAt = it.published.toISOString();
    const score = scoreItem({ channel: src.channel, publishedAt, text: `${it.title} ${it.abstract}`, sourceWeight: src.weight }, now);
    stmts.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO items (source_id, channel, url, title_key, title_en, authors, published_at, fetched_at, abstract_en, score, read_minutes, image_url)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM items WHERE title_key = ?)`
      ).bind(src.id, src.channel, it.url, key, it.title, it.authors ?? null, publishedAt, now.toISOString(), it.abstract || null, score, readMinutes(it.abstract, it.isPaper), it.image ?? null, key)
    );
    // Bài đã có từ trước nhưng chưa có ảnh → bổ sung ảnh từ feed.
    if (it.image) fill.push(env.DB.prepare('UPDATE items SET image_url = ? WHERE url = ? AND image_url IS NULL').bind(it.image, it.url));
  }
  if (!stmts.length) return 0;
  const res = await env.DB.batch([...stmts, ...fill]);
  return res.slice(0, stmts.length).reduce((n, r) => n + (r.meta.changes ? 1 : 0), 0);
}

/** Mốc 06:00 giờ VN (23:00 UTC) gần nhất đã qua — arXiv chạy một lần sau mốc này mỗi ngày. */
function arxivBoundary(now: Date): string {
  const b = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 0, 0));
  if (b > now) b.setUTCDate(b.getUTCDate() - 1);
  return b.toISOString();
}

/** Nguồn đến hạn chạy nhất (hoặc null). Lỗi mạng thì thử lại sau 1 giờ. */
export async function nextDueSource(env: Env, now = new Date()): Promise<SourceRow | null> {
  const rssBefore = new Date(now.getTime() - RSS_EVERY_H * 3600000).toISOString();
  const retryBefore = new Date(now.getTime() - RETRY_AFTER_H * 3600000).toISOString();
  return env.DB.prepare(
    `SELECT * FROM sources WHERE enabled = 1 AND (
       last_run_at IS NULL
       OR (kind <> 'arxiv' AND last_run_at < ?1)
       OR (kind = 'arxiv' AND last_run_at < ?2)
       OR (last_error IS NOT NULL AND last_error <> ?3 AND last_run_at < ?4))
     ORDER BY last_run_at IS NOT NULL, last_run_at LIMIT 1`
  ).bind(rssBefore, arxivBoundary(now), RUNNING, retryBefore).first<SourceRow>();
}

/** Trang không có RSS: đọc sitemap, chỉ mở trang của tối đa 3 tin mới (lấy tiêu đề, mô tả, ảnh). */
async function sitemapItems(env: Env, src: SourceRow): Promise<RawItem[]> {
  const cutoff = Date.now() - SITEMAP_AGE_DAYS * 86400000;
  const entries = parseSitemap(await fetchText(src.url), src.keywords ?? '').filter((e) => e.date.getTime() >= cutoff).slice(0, 10);
  if (!entries.length) return [];
  const { results } = await env.DB.prepare(`SELECT url FROM items WHERE url IN (${entries.map(() => '?').join(',')})`).bind(...entries.map((e) => e.url)).all<{ url: string }>();
  const known = new Set(results.map((r) => r.url));
  const out: RawItem[] = [];
  for (const e of entries.filter((x) => !known.has(x.url)).slice(0, SITEMAP_NEW_PER_RUN)) {
    const res = await fetch(e.url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) continue;
    const m = parsePageMeta(await res.text(), res.url);
    if (m.title) out.push({ url: e.url, title: m.title, abstract: m.description, image: m.image, published: e.date, isPaper: false });
  }
  return out;
}

/** Crawl đúng một nguồn. Đánh dấu "đang chạy…" trước, để lượt bị ngắt giữa chừng vẫn để lại dấu vết. */
export async function crawlSource(env: Env, src: SourceRow): Promise<string> {
  const startedAt = new Date().toISOString();
  await env.DB.prepare('UPDATE sources SET last_run_at = ?, last_error = ? WHERE id = ?').bind(startedAt, RUNNING, src.id).run();
  try {
    const items = src.kind === 'sitemap' ? await sitemapItems(env, src) : src.kind === 'arxiv' ? parseArxiv(await fetchText(arxivQuery(src))) : parseFeed(await fetchText(src.url));
    const added = await saveItems(env, src, items);
    await env.DB.prepare('UPDATE sources SET last_error = NULL, item_count = item_count + ? WHERE id = ?').bind(added, src.id).run();
    return `${src.id}: +${added} bài mới / ${items.length} trong feed`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await env.DB.prepare('UPDATE sources SET last_error = ? WHERE id = ?').bind(msg.slice(0, 300), src.id).run();
    return `${src.id}: LỖI ${msg}`;
  }
}

/** Chạy tay (nút "Chạy ngay"): coi mọi nguồn loại đó là đến hạn, lượt cron kế tiếp sẽ lần lượt chạy hết. */
export async function markDue(env: Env, kind: 'rss' | 'arxiv'): Promise<string> {
  const r = await env.DB.prepare(`UPDATE sources SET last_run_at = NULL WHERE enabled = 1 AND ${kind === 'arxiv' ? "kind = 'arxiv'" : "kind <> 'arxiv'"}`).run();
  return `Đã xếp ${r.meta.changes ?? 0} nguồn ${kind} vào hàng chạy`;
}
