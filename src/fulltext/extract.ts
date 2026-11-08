/** Trích nội dung chính của một trang bằng HTMLRewriter (có sẵn trong Cloudflare Workers). */

export type BlockKind = 'h2' | 'h3' | 'p' | 'li' | 'quote' | 'pre' | 'img' | 'cap';
export interface Block {
  k: BlockKind;
  t: string;          // chữ (với img: chú thích alt)
  src?: string;       // với img
}

const ENT: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', times: '×', minus: '−' };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

const MAX_CHARS = 120_000;
const MAX_IMAGES = 20;

/** Lượt 1: bỏ phần thừa, đổi công thức MathML thành $alttext$. */
function cleanPass(res: Response): Response {
  const remove = { element(e: Element) { e.remove(); } };
  return new HTMLRewriter()
    .on('script, style, noscript, svg, iframe, form, button, nav, footer, aside, header, select, template', remove)
    .on('.ltx_bibliography, .ltx_page_footer, .ltx_page_header, .ltx_authors, .ltx_dates, .ltx_role_footnote, .share, .social, .newsletter, .related, .advert, .ad', remove)
    .on('math', {
      element(e) {
        const alt = e.getAttribute('alttext');
        if (alt) e.replace(` $${alt}$ `, { html: false });
        else e.remove();
      },
    })
    .transform(res);
}

/** Lượt 2: gom khối chữ, hình, chú thích. */
export async function extractBlocks(res: Response, baseUrl: string): Promise<Block[]> {
  type Open = Block & { art: boolean };
  const out: Open[] = [];
  const stack: Open[] = [];
  let art = 0;

  const opener = (k: BlockKind) => ({
    element(e: Element) {
      const b: Open = { k, t: '', art: art > 0 };
      out.push(b);
      stack.push(b);
      e.onEndTag(() => { stack.pop(); });
    },
  });

  const rw = new HTMLRewriter()
    .on('article, main, [role=main], .ltx_document, .post-content, .entry-content, .article-body', {
      element(e) { art++; e.onEndTag(() => { art--; }); },
    })
    .on('h1, h2', opener('h2'))
    .on('h3, h4', opener('h3'))
    .on('p', opener('p'))
    .on('li', opener('li'))
    .on('blockquote', opener('quote'))
    .on('pre', opener('pre'))
    .on('figcaption, .ltx_caption', opener('cap'))
    .on('img', {
      element(e) {
        const src = e.getAttribute('src') || e.getAttribute('data-src');
        if (!src || src.startsWith('data:')) return;
        const w = Number(e.getAttribute('width') ?? '0');
        if (w && w < 120) return; // biểu tượng nhỏ
        try {
          out.push({ k: 'img', t: e.getAttribute('alt') ?? '', src: new URL(src, baseUrl).toString(), art: art > 0 });
        } catch { /* bỏ src lỗi */ }
      },
    })
    .onDocument({
      text(t) {
        const top = stack[stack.length - 1];
        if (top) top.t += t.text;
      },
    });

  // HTMLRewriter chỉ chạy khi body được đọc hết.
  await rw.transform(cleanPass(res)).arrayBuffer();

  // Làm sạch
  let blocks = out
    .map((b) => ({ ...b, t: decodeEntities(b.t).replace(/\s+/g, ' ').trim() }))
    .filter((b) => {
      if (b.k === 'img') return true;
      if (b.k === 'h2' || b.k === 'h3') return b.t.length >= 2 && b.t.length <= 220;
      if (b.k === 'li') return b.t.length >= 15;
      if (b.k === 'cap') return b.t.length >= 5;
      return b.t.length >= 25;
    });

  // Có vùng bài viết rõ ràng thì chỉ giữ vùng đó.
  const artChars = blocks.filter((b) => b.art && b.k !== 'img').reduce((n, b) => n + b.t.length, 0);
  if (artChars > 600) blocks = blocks.filter((b) => b.art);

  // Bỏ đoạn trùng liên tiếp, giới hạn độ dài, giới hạn số hình
  const res2: Block[] = [];
  let chars = 0;
  let imgs = 0;
  for (const b of blocks) {
    const prev = res2[res2.length - 1];
    if (prev && prev.k !== 'img' && prev.t === b.t) continue;
    if (b.k === 'img') {
      if (imgs >= MAX_IMAGES || res2.some((x) => x.src === b.src)) continue;
      imgs++;
      res2.push({ k: 'img', t: b.t, src: b.src });
      continue;
    }
    if (chars + b.t.length > MAX_CHARS) break;
    chars += b.t.length;
    res2.push({ k: b.k, t: b.t });
  }
  return res2;
}

export const textChars = (blocks: Block[]) => blocks.reduce((n, b) => n + (b.k === 'img' ? 0 : b.t.length), 0);
