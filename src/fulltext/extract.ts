/** Trích nội dung chính của một trang bằng HTMLRewriter (có sẵn trong Cloudflare Workers). */

/**
 * Ảnh rác không phải ảnh minh họa: emoji WordPress/Twitter chèn thành ảnh (😋…), mặt cười, biểu tượng nhỏ,
 * điểm ảnh theo dõi. Không có kích thước ghi sẵn nên trước đây bị hiện to cả khung.
 */
const EMOJI_ALT = /^[\p{Extended_Pictographic}\p{Emoji_Component}\uFE0F\u200D\s]+$/u;
export function isJunkImage(src: string, alt = '', cls = ''): boolean {
  if (/\b(emoji|wp-smiley|twemoji|smiley)\b/i.test(cls)) return true;
  if (/s\.w\.org\/images\/core\/emoji|twemoji|\/emoji\/|\/smilies\/|\/emoticons?\/|pixel\.(gif|png)|1x1\.(gif|png)|gravatar\.com\/avatar/i.test(src)) return true;
  if (alt && alt.length <= 8 && EMOJI_ALT.test(alt) && /\p{Extended_Pictographic}/u.test(alt)) return true;
  const file = (src.split(/[?#]/)[0].split('/').pop() ?? '').toLowerCase();
  // Ảnh giao diện của trang: logo, linh vật (vd. "Saucy" của Techsauce), biểu tượng, ảnh đại diện tác giả, ảnh giữ chỗ.
  if (/^(logo|saucy|mascot|sprite|avatar|favicon|placeholder|default|icon|badge|loading|spinner)([\w@.-]*)\.(png|svg|gif|webp|jpe?g)$/.test(file)) return true;
  if (/(^|[_-])(logo|icon|avatar|sprite|mascot)([_.@-]|\d)/.test(file) && !/\d{4}/.test(file)) return true;
  // Ảnh đại diện tác giả (Hugging Face, headshot…), ảnh giữ chỗ khi video chưa tải, banner quảng cáo theo tên.
  if (/\/avatars?\/|cdn-avatars\.|\/fallback\/|\/authors?\//i.test(src)) return true;
  if (/(^|[_-])headshot|^(profile|author|gravatar)([_.-]|\d)|banner[-_]?ad|[-_]ad[-_.]|(^|[_-])advert(isement)?([_.-]|$)|video_poster/.test(file)) return true;
  // Ảnh thu nhỏ WordPress cỡ ≤ 200px (vd. "-127x150.jpg"): thường là ảnh tác giả / bài liên quan.
  const wp = /-(\d{2,4})x(\d{2,4})\.(jpe?g|png|webp|gif)$/.exec(file);
  if (wp && Number(wp[1]) <= 200 && Number(wp[2]) <= 200) return true;
  // Banner quảng cáo theo kích thước chuẩn.
  if (/(^|[^\d])(300x250|728x90|160x600|320x50|300x600|970x250|336x280|320x100|468x60|970x90)([^\d]|$)/.test(file)) return true;
  return false;
}

/*
 * Điểm kết thúc bài: nhiều trang (Techsauce…) đặt ngay sau bài khối "bài liên quan", hộp đăng ký, lời mời đọc thêm
 * cùng trong vùng <article>. Cắt từ khối đánh dấu đầu tiên, hoặc từ khi lặp lại dòng "ngày | tác giả" (dấu hiệu danh sách bài khác).
 */
const END_MARK = /^(ลงทะเบียนเข้าสู่ระบบ|ลงทะเบียนเพื่อ|สมัครสมาชิก|บทความที่เกี่ยวข้อง|บทความแนะนำ|อ่านเพิ่มเติม|ข่าวที่เกี่ยวข้อง|related (articles?|posts?|stories|news|reading)|read (more|next)\b|you (may|might) also like|more from |recommended (for you|articles|stories)|sign up (for|to)|subscribe to (our|the)|newsletter|artikel terkait|baca juga|berita terkait|baca selengkapnya|관련\s*기사|관련\s*뉴스|関連記事|関連ニュース|相关(文章|阅读|新闻)|推荐阅读|bài viết liên quan|tin liên quan|đọc thêm|xem thêm)/i;
const BYLINE = /(\|\s*(by|bởi|โดย|oleh)\b)|(^\S+ \d{1,2}, 20\d\d\s*\|)/i;

/** Số khối thuộc bài chính (phần sau đó là khối liên quan / đăng ký). */
export function articleEnd(blocks: { k: string; t: string }[]): number {
  let bylines = 0;
  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k];
    if (b.k === 'img') continue;
    if (k >= 3 && b.t.length <= 140 && END_MARK.test(b.t)) return k;
    if (b.t.length <= 120 && BYLINE.test(b.t)) {
      bylines++;
      // Dòng tác giả thứ hai ở nửa sau bài → danh sách bài khác bắt đầu từ thẻ (ảnh + tiêu đề) ngay trước nó.
      if (bylines >= 2 && k > blocks.length * 0.4) {
        for (let s = k - 1; s >= Math.max(0, k - 3); s--) if (blocks[s].k === 'img') return s;
        return k;
      }
    }
  }
  return blocks.length;
}

/** Vị trí các khối được hiển thị: bỏ phần đuôi không thuộc bài và ảnh rác (dùng cả cho bài đã lưu từ trước). */
export function visibleIndexes(blocks: { k: string; t: string; src?: string }[]): number[] {
  const end = articleEnd(blocks);
  const out: number[] = [];
  for (let k = 0; k < end; k++) if (!(blocks[k].k === 'img' && isJunkImage(blocks[k].src ?? '', blocks[k].t))) out.push(k);
  return out;
}

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
        const h = Number(e.getAttribute('height') ?? '0');
        if ((w && w < 120) || (h && h < 80)) return; // biểu tượng nhỏ
        if (isJunkImage(src, e.getAttribute('alt') ?? '', e.getAttribute('class') ?? '')) return; // emoji dạng ảnh
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

  // Cắt phần đuôi không thuộc bài (bài liên quan, hộp đăng ký…).
  blocks = blocks.slice(0, articleEnd(blocks));

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
