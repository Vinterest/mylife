import type { RawItem } from '../types';
import { stripHtml } from '../util';

/*
 * Bộ đọc RSS/Atom gọn nhẹ bằng biểu thức chính quy (thay fast-xml-parser).
 * Gói Workers miễn phí chỉ cho 10 ms CPU mỗi lượt cron, nên không dựng cả cây XML:
 * chỉ cắt từng <item>/<entry> và đọc vài thẻ cần dùng.
 */

const MAX_ENTRIES = 60;

const XML_ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXml(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return XML_ENT[e.toLowerCase()] ?? m;
  });
}

/** Nội dung chữ của thẻ: bỏ CDATA hoặc giải mã ký tự XML. */
function inner(raw: string): string {
  const parts: string[] = [];
  let last = 0;
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    parts.push(decodeXml(raw.slice(last, m.index)), m[1]);
    last = re.lastIndex;
  }
  parts.push(decodeXml(raw.slice(last)));
  return parts.join('');
}

const esc = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Lấy thẻ đầu tiên tên `name` (không lấy thẻ tự đóng). */
function tag(block: string, name: string): string {
  const m = new RegExp(`<${esc(name)}(?:\\s[^>]*?)?(?<!/)>([\\s\\S]*?)</${esc(name)}>`, 'i').exec(block);
  return m ? inner(m[1]) : '';
}

function tags(block: string, name: string): string[] {
  const re = new RegExp(`<${esc(name)}(?:\\s[^>]*?)?(?<!/)>([\\s\\S]*?)</${esc(name)}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) out.push(inner(m[1]));
  return out;
}

function attr(tagText: string, name: string): string {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tagText);
  return m ? decodeXml(m[2] ?? m[3] ?? '') : '';
}

function blocks(xml: string, name: string): string[] {
  const re = new RegExp(`<${name}[\\s>][\\s\\S]*?</${name}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) && out.length < MAX_ENTRIES) out.push(m[0]);
  return out;
}

function parseDate(s: string): Date {
  const d = new Date(s.trim());
  return isNaN(d.getTime()) ? new Date() : d;
}

const clean = (s: string) => stripHtml(s).slice(0, 6000);

const IMG_EXT = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i;

/** Ảnh đại diện của bài trong feed: media:thumbnail → media:content ảnh → enclosure ảnh → <img> đầu tiên trong nội dung. */
function findImage(block: string, html: string, base: string): string | undefined {
  const cands: string[] = [];
  for (const t of block.match(/<media:thumbnail\b[^>]*>/gi) ?? []) cands.push(attr(t, 'url'));
  for (const t of block.match(/<media:content\b[^>]*>/gi) ?? []) {
    const u = attr(t, 'url');
    if (attr(t, 'medium') === 'image' || attr(t, 'type').startsWith('image/') || IMG_EXT.test(u)) cands.push(u);
  }
  for (const t of block.match(/<enclosure\b[^>]*>/gi) ?? []) {
    const u = attr(t, 'url');
    if (attr(t, 'type').startsWith('image/') || IMG_EXT.test(u)) cands.push(u);
  }
  for (const t of html.match(/<img\b[^>]*>/gi) ?? []) {
    const w = Number(attr(t, 'width') || '0');
    if (w && w < 120) continue; // biểu tượng nhỏ, ảnh đếm lượt xem
    cands.push(attr(t, 'src') || attr(t, 'data-src'));
  }
  for (const c of cands) {
    if (!c || c.startsWith('data:')) continue;
    try {
      const u = new URL(c, base);
      if (u.protocol === 'https:' || u.protocol === 'http:') return u.toString().replace(/^http:/, 'https:');
    } catch { /* bỏ link lỗi */ }
  }
  return undefined;
}

/** Đọc RSS 2.0 / RDF hoặc Atom (kể cả feed YouTube). */
export function parseFeed(xml: string): RawItem[] {
  const out: RawItem[] = [];

  for (const it of blocks(xml, 'item')) {
    const url = (tag(it, 'link') || tag(it, 'guid')).trim();
    const title = stripHtml(tag(it, 'title'));
    if (!url || !title) continue;
    const body = tag(it, 'content:encoded') || tag(it, 'description');
    out.push({
      url,
      title,
      authors: stripHtml(tag(it, 'dc:creator') || tag(it, 'author')) || undefined,
      published: parseDate(tag(it, 'pubDate') || tag(it, 'dc:date')),
      abstract: clean(body),
      image: findImage(it, body, url),
      isPaper: false,
    });
  }

  for (const e of blocks(xml, 'entry')) {
    const links = e.match(/<link\b[^>]*>/gi) ?? [];
    const alt = links.find((l) => !attr(l, 'rel') || attr(l, 'rel') === 'alternate') ?? links[0];
    const url = ((alt && attr(alt, 'href')) || tag(e, 'id')).trim();
    const title = stripHtml(tag(e, 'title'));
    if (!url || !title) continue;
    const body = tag(e, 'content') || tag(e, 'summary') || tag(e, 'media:description');
    const authors = tags(e, 'author').map((a) => stripHtml(tag(a, 'name'))).filter(Boolean).join(', ');
    out.push({
      url,
      title,
      authors: authors || undefined,
      published: parseDate(tag(e, 'published') || tag(e, 'updated')),
      abstract: clean(body),
      image: findImage(e, body, url),
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
    image: undefined, // arXiv không có ảnh trong feed → lấy hình đầu tiên khi tải toàn văn
    isPaper: true,
  }));
}
