import type { Env, RawItem, SourceRow } from '../types';
import { matchesKeywords, normalizeTitle, readMinutes, scoreItem, sleep } from '../util';
import { parseArxiv, parseFeed } from './parse';

const UA = 'MyLife-Reader/1.0 (personal reader; contact via mylife.gm-chess.com)';
const MAX_AGE_DAYS = 7;
const MAX_PER_SOURCE = 30;

function arxivQuery(src: SourceRow): string {
  const cats = src.url.split(',').map((c) => `cat:${c.trim()}`).join(' OR ');
  const kws = (src.keywords ?? '').split(',').map((k) => k.trim()).filter(Boolean);
  const q = kws.length ? `(${cats}) AND (${kws.map((k) => `abs:"${k}"`).join(' OR ')})` : `(${cats})`;
  const params = new URLSearchParams({ search_query: q, sortBy: 'submittedDate', sortOrder: 'descending', max_results: '60' });
  return `https://export.arxiv.org/api/query?${params}`;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function saveItems(env: Env, src: SourceRow, raw: RawItem[]): Promise<number> {
  const now = new Date();
  const cutoff = now.getTime() - MAX_AGE_DAYS * 86400000;
  let added = 0;
  for (const it of raw.slice(0, MAX_PER_SOURCE * 2)) {
    if (added >= MAX_PER_SOURCE) break;
    if (it.published.getTime() < cutoff) continue;
    if (src.kind === 'rss' && !matchesKeywords(`${it.title} ${it.abstract}`, src.keywords)) continue;
    const key = normalizeTitle(it.title);
    const dup = await env.DB.prepare('SELECT id FROM items WHERE title_key = ? OR url = ? LIMIT 1').bind(key, it.url).first();
    if (dup) continue;
    const publishedAt = it.published.toISOString();
    const score = scoreItem({ channel: src.channel, publishedAt, text: `${it.title} ${it.abstract}`, sourceWeight: src.weight }, now);
    const r = await env.DB.prepare(
      `INSERT OR IGNORE INTO items (source_id, channel, url, title_key, title_en, authors, published_at, fetched_at, abstract_en, score, read_minutes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(src.id, src.channel, it.url, key, it.title, it.authors ?? null, publishedAt, now.toISOString(), it.abstract || null, score, readMinutes(it.abstract, it.isPaper))
      .run();
    if (r.meta.changes) added++;
  }
  return added;
}

/** Crawl một loại nguồn (arxiv hoặc rss). Lỗi của một nguồn không làm dừng các nguồn khác. */
export async function crawl(env: Env, kind: 'arxiv' | 'rss'): Promise<string> {
  const { results } = await env.DB.prepare('SELECT * FROM sources WHERE enabled = 1 AND kind = ?').bind(kind).all<SourceRow>();
  const lines: string[] = [];
  for (const src of results) {
    const startedAt = new Date().toISOString();
    try {
      const xml = await fetchText(kind === 'arxiv' ? arxivQuery(src) : src.url);
      const items = kind === 'arxiv' ? parseArxiv(xml) : parseFeed(xml);
      const added = await saveItems(env, src, items);
      await env.DB.prepare('UPDATE sources SET last_run_at = ?, last_error = NULL, item_count = item_count + ? WHERE id = ?').bind(startedAt, added, src.id).run();
      lines.push(`${src.id}: +${added}/${items.length}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await env.DB.prepare('UPDATE sources SET last_run_at = ?, last_error = ? WHERE id = ?').bind(startedAt, msg.slice(0, 300), src.id).run();
      lines.push(`${src.id}: LỖI ${msg}`);
    }
    if (kind === 'arxiv') await sleep(3500); // arXiv yêu cầu cách nhau ≥ 3 giây
  }
  return lines.join('\n');
}
