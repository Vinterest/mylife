import { XMLParser } from 'fast-xml-parser';
import type { RawItem } from '../types';
import { stripHtml } from '../util';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: (name) => ['item', 'entry', 'author', 'link', 'category'].includes(name),
  processEntities: true,
  htmlEntities: true,
});

/** Lấy chuỗi từ nút XML có thể là chuỗi, số hoặc object {#text}. */
function txt(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return txt(v[0]);
  if (typeof v === 'object' && '#text' in (v as Record<string, unknown>)) return txt((v as Record<string, unknown>)['#text']);
  return '';
}

function parseDate(s: string): Date {
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date() : d;
}

/** Đọc RSS 2.0 hoặc Atom (kể cả feed YouTube). */
export function parseFeed(xml: string): RawItem[] {
  const doc = parser.parse(xml);
  const out: RawItem[] = [];

  const rssItems: any[] = doc?.rss?.channel?.item ?? doc?.['rdf:RDF']?.item ?? [];
  for (const it of rssItems) {
    const url = txt(it.link) || txt(it.guid);
    const title = stripHtml(txt(it.title));
    if (!url || !title) continue;
    const body = txt(it['content:encoded']) || txt(it.description);
    out.push({
      url: url.trim(),
      title,
      authors: txt(it['dc:creator']) || txt(it.author) || undefined,
      published: parseDate(txt(it.pubDate) || txt(it['dc:date'])),
      abstract: stripHtml(body).slice(0, 6000),
      isPaper: false,
    });
  }

  const entries: any[] = doc?.feed?.entry ?? [];
  for (const e of entries) {
    const links: any[] = e.link ?? [];
    const alt = links.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate') ?? links[0];
    const url = (alt?.['@_href'] as string) || txt(e.id);
    const title = stripHtml(txt(e.title));
    if (!url || !title) continue;
    const body = txt(e.content) || txt(e.summary) || txt(e['media:group']?.['media:description']);
    const authors = (e.author ?? []).map((a: any) => txt(a.name)).filter(Boolean).join(', ');
    out.push({
      url: url.trim(),
      title,
      authors: authors || undefined,
      published: parseDate(txt(e.published) || txt(e.updated)),
      abstract: stripHtml(body).slice(0, 6000),
      isPaper: false,
    });
  }
  return out;
}

/** Đọc kết quả Atom của arXiv API; chuẩn hóa link về https://arxiv.org/abs/<mã> (bỏ số phiên bản). */
export function parseArxiv(xml: string): RawItem[] {
  return parseFeed(xml).map((it) => ({
    ...it,
    url: it.url.replace(/^http:/, 'https:').replace(/v\d+$/, ''),
    title: it.title.replace(/\s+/g, ' '),
    isPaper: true,
  }));
}
