import type { ItemRow } from '../types';
import type { FullTextView } from '../fulltext';
import { CHANNELS, timeAgoVi } from '../util';
import { g2Sub, html, page, raw } from './layout';

export type Lang = 'vi' | 'en' | 'bi';

export const READER_CSS = `
.rd-tools{display:flex;gap:.6em;flex-wrap:wrap;align-items:center;margin:1em 0;padding:.6em 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.seg{display:inline-flex;border:1px solid #C9D1DA;border-radius:6px;overflow:hidden}
.seg a,.seg button{display:inline-flex;align-items:center;min-height:40px;padding:0 .9em;border:0;background:#fff;font:inherit;font-size:.92em;font-weight:600;color:#2D3946;cursor:pointer}
.seg a:hover{text-decoration:none;background:#F2F4F6}
.seg a.on{background:var(--ac);color:#fff}
.rd-state{display:flex;gap:.8em;align-items:center;flex-wrap:wrap;margin-bottom:1em}
.rd-state.warn{padding:.8em 1em;border:1px solid #F3D6C3;background:#FDF6F0;border-radius:6px}
.rd-body{font-size:calc(1.15em * var(--fs,1));line-height:1.75}
.rd-body h2{font-size:1.15em;margin:1.6em 0 .5em;line-height:1.35}
.rd-body h3{font-size:1.02em;margin:1.3em 0 .4em;line-height:1.35}
.rd-body p{margin:0 0 1em}
.rd-body p.rli{padding-left:1.1em;text-indent:-1.1em}
.rd-body blockquote{margin:0 0 1em;padding:.2em 1em;border-left:3px solid #C9D1DA;color:#2D3946}
.rd-body pre{background:#F4F5F7;padding:.8em;border-radius:6px;overflow-x:auto;font-size:.8em;line-height:1.5}
.rd-body figure{margin:1.2em 0}
.rd-body img{max-width:100%;height:auto;border-radius:4px;background:#F4F5F7}
.rd-body .cap{font-size:.82em;color:#3E4A56;line-height:1.5}
.rd-body .untr{border-left:3px solid #E3E8ED;padding-left:.8em;color:#2D3946}
.bi{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:.4em 1.4em;margin-bottom:1em}
.bi>div>*{margin:0}
.bi .en{color:#3E4A56;font-size:.94em}
.toc a{display:block;padding:.35em 0;border-top:1px solid var(--line);color:#2D3946}
.toc a.h3{padding-left:1em;font-size:.95em}
`;

function blockHtml(k: string, text: string, i: number, cls = '', lang?: string) {
  const L = raw(`${lang ? ` lang="${lang}"` : ''}${i >= 0 && (k === 'h2' || k === 'h3') ? ` id="s${i}"` : ''}`);
  switch (k) {
    case 'h2': return html`<h2 class="${cls}"${L}>${text}</h2>`;
    case 'h3': return html`<h3 class="${cls}"${L}>${text}</h3>`;
    case 'li': return html`<p class="rli ${cls}"${L}>• ${text}</p>`;
    case 'quote': return html`<blockquote class="${cls}"${L}>${text}</blockquote>`;
    case 'pre': return html`<pre>${text}</pre>`;
    case 'cap': return html`<p class="cap ${cls}"${L}>${text}</p>`;
    default: return html`<p class="${cls}"${L}>${text}</p>`;
  }
}

/** Tiêu đề bài lặp lại ở đầu nội dung (đã hiện ở trên) thì bỏ. */
function isRepeatedTitle(v: FullTextView, i: number, titleEn: string) {
  const b = v.blocks[i];
  if (i >= 3 || (b.k !== 'h2' && b.k !== 'h3')) return false;
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const a = norm(b.t), t = norm(titleEn);
  return a === t || (t.length >= 15 && (a.startsWith(t) || t.startsWith(a)));
}

function bodyHtml(v: FullTextView, lang: Lang, titleEn: string) {
  return v.blocks.map((b, i) => {
    if (isRepeatedTitle(v, i, titleEn)) return '';
    if (b.k === 'img') {
      const alt = lang === 'en' ? b.t : v.vi[i] ?? b.t;
      return html`<figure><img src="${b.src}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer"></figure>`;
    }
    const vi = v.vi[i];
    if (lang === 'en' || b.k === 'pre') return blockHtml(b.k, b.t, i, '', 'en');
    if (lang === 'bi') {
      return html`<div class="bi"><div>${blockHtml(b.k, vi ?? '—', i)}</div><div>${blockHtml(b.k, b.t, -1, 'en', 'en')}</div></div>`;
    }
    return vi != null ? blockHtml(b.k, vi, i) : blockHtml(b.k, b.t, i, 'untr', 'en');
  });
}

function stateBanner(it: ItemRow, v: FullTextView) {
  const r = v.row;
  const pct = v.translatableCount ? Math.round((v.translatedCount / v.translatableCount) * 100) : 0;
  const notes = [];
  if (r.status === 'fetch_failed') {
    notes.push(html`<div class="rd-state warn"><span class="st err">Chưa lấy được toàn văn</span><span style="flex:1 1 280px">${r.error ?? ''} — đang hiện phần mô tả có sẵn.</span><form method="post" action="/hoc-tap/bai/${it.id}/lay-lai"><button class="btn2" type="submit">Thử lấy lại</button></form></div>`);
  }
  if (r.kind === 'abstract' && r.status !== 'fetch_failed') notes.push(html`<div class="meta" style="margin-bottom:.8em">Nguồn chỉ có phần tóm tắt công khai (chưa có bản HTML toàn văn).</div>`);
  if (r.public_partial) notes.push(html`<div class="meta" style="margin-bottom:.8em">Nguồn chỉ công khai một phần bài (có thể có tường phí) — MyLife không lấy phần bị khóa.</div>`);

  if (v.translatableCount === 0) return notes;
  if (v.translatedCount === 0) {
    if (!r.priority) {
      notes.push(html`<div class="rd-state"><span class="st" style="background:#F2F4F6;color:#3E4A56">Bản gốc tiếng Anh</span><span class="meta" style="flex:1 1 260px">MyLife chỉ dịch khi anh yêu cầu, để tiết kiệm hạn mức miễn phí.</span><form method="post" action="/hoc-tap/bai/${it.id}/dich"><button class="btn" type="submit">Dịch bài này</button></form></div>`);
    } else if (r.status === 'waiting_quota') {
      notes.push(html`<div class="rd-state warn"><span class="st wait">Chờ hạn mức</span><span class="meta" style="flex:1 1 300px">Đã hết hạn mức dịch miễn phí kỳ này. Bài đã xếp hàng, sẽ tự dịch khi có hạn mức mới; trong lúc chờ đọc bản gốc tiếng Anh.</span></div>`);
    } else {
      notes.push(html`<div class="rd-state"><span class="st wait">Đang dịch…</span><span class="meta">Mỗi 5 phút dịch thêm một phần — tải lại trang để xem.${r.error ? ` Lỗi lần trước: ${r.error}` : ''}</span></div>`);
    }
    return notes;
  }
  const engines = [...new Set(v.engines.filter(Boolean))].map((e) => ({ gemini: 'Gemini', workers_ai: 'Workers AI', azure: 'Azure', deepl: 'DeepL', google_tr: 'Google Dịch' }[e!]));
  if (v.usedMt) {
    notes.push(html`<div class="rd-state"><span class="st" style="background:#F2F4F6;color:#3E4A56">Bản dịch máy</span><span class="meta">${engines.join(', ')} · hạn mức AI đã hết lúc dịch, câu chữ có thể kém tự nhiên hơn</span>${r.want_ai
      ? html`<span class="meta">Đã xếp hàng dịch lại bằng AI</span>`
      : html`<form method="post" action="/hoc-tap/bai/${it.id}/dich-ai"><button class="l" style="color:var(--ac);font-weight:600" type="submit">Dịch lại bằng AI khi có hạn mức</button></form>`}</div>`);
  } else {
    notes.push(html`<div class="rd-state"><span class="st ai">Bản dịch AI</span><span class="meta">${engines.join(', ')} (gói miễn phí)${r.translated_at ? ` · ${timeAgoVi(r.translated_at)}` : ''} · thuật ngữ giữ tiếng Anh</span></div>`);
  }
  if (pct < 100 && !r.priority) notes.push(html`<div class="rd-state"><span class="meta" style="flex:1 1 260px">Đã dịch ${v.translatedCount}/${v.translatableCount} đoạn (${pct}%) — phần còn lại đang là tiếng Anh.</span><form method="post" action="/hoc-tap/bai/${it.id}/dich"><button class="btn2" type="submit">Dịch tiếp phần còn lại</button></form></div>`);
  else if (pct < 100) notes.push(html`<div class="meta" style="margin:-.4em 0 1em">Đã dịch ${v.translatedCount}/${v.translatableCount} đoạn (${pct}%) — phần còn lại tạm hiện tiếng Anh (viền xám), sẽ dịch tiếp${r.status === 'waiting_quota' ? ' khi có hạn mức mới' : ' mỗi 5 phút'}.</div>`);
  return notes;
}

export function readerPage(it: ItemRow, v: FullTextView, lang: Lang) {
  const heads = v.blocks.map((b, i) => ({ b, i })).filter(({ b, i }) => (b.k === 'h2' || b.k === 'h3') && !isRepeatedTitle(v, i, it.title_en));
  const title = it.title_en;
  const langLink = (l: Lang, label: string) => html`<a class="${lang === l ? 'on' : ''}" href="/hoc-tap/bai/${it.id}?lang=${l}">${label}</a>`;
  const isPaper = v.row.kind === 'arxiv_html';

  const body = html`
<section class="cols">
  <article class="colmain" style="max-width:780px">
    <div class="meta"><a href="/hoc-tap">Học tập AI</a> › <a href="/hoc-tap/kenh/${CHANNELS[it.channel].slug}">${CHANNELS[it.channel].short}</a></div>
    <div class="rd-tools">
      <div class="seg" role="group" aria-label="Ngôn ngữ">${langLink('vi', 'Tiếng Việt')}${langLink('en', 'English')}${langLink('bi', 'Song ngữ')}</div>
      <div class="seg" role="group" aria-label="Cỡ chữ"><button type="button" onclick="mlFs(-1)" aria-label="Chữ nhỏ hơn">A−</button><button type="button" onclick="mlFs(1)" aria-label="Chữ lớn hơn">A+</button></div>
      <span class="meta">Nghe bài · sắp có (Chặng 4)</span>
      <span style="margin-left:auto;display:flex;gap:.5em">
        <form class="inline" method="post" action="/hoc-tap/bai/${it.id}/giu"><input type="hidden" name="back" value="/hoc-tap/bai/${it.id}?lang=${lang}"><button class="btn2" type="submit">${it.kept ? 'Đã giữ ✓' : 'Giữ bài'}</button></form>
      </span>
    </div>
    <div class="kick">${CHANNELS[it.channel].name}${isPaper ? ' · Paper nghiên cứu' : ''} · Điểm ${it.score}</div>
    <h1 class="t1" style="margin:.35em 0 .25em;font-size:2em" lang="en">${title}</h1>
    <div class="meta" style="margin:.5em 0 1.2em">${it.authors ? `${it.authors} · ` : ''}${it.source_name} · đăng ${timeAgoVi(it.published_at)} · lấy về MyLife ${timeAgoVi(v.row.fetched_at)} · ${Math.max(1, Math.round(v.row.chars_en / 1100))} phút đọc</div>
    ${stateBanner(it, v)}
    <div class="rd-body" id="rd">${v.blocks.length ? bodyHtml(v, lang, it.title_en) : html`<p class="meta">Nguồn không có nội dung để hiển thị.</p>`}</div>
    <div class="box" style="margin-top:1.6em;background:#F4F5F7;border:0;font-size:.9em;line-height:1.6">
      <span><b>Nguồn:</b> ${it.source_name}${it.authors ? ` · ${it.authors}` : ''} · <a href="${v.row.base_url ?? it.url}" target="_blank" rel="noopener" style="color:var(--ac);font-weight:600">Bản gốc ↗</a></span>
      <span class="meta">Bản lưu và bản dịch chỉ dùng cá nhân trong MyLife, không công khai. Bản dịch do máy/AI thực hiện, có thể chưa chính xác. Hình ảnh hiển thị từ trang gốc.</span>
    </div>
    <div class="acts" style="margin-top:1.2em">
      <a href="/hoc-tap">‹ Về Học tập AI</a>
      <form class="inline" method="post" action="/hoc-tap/bai/${it.id}/bo"><input type="hidden" name="back" value="/hoc-tap"><button class="l" style="color:var(--mut)" type="submit">Không quan tâm</button></form>
    </div>
  </article>
  <aside class="colside" style="max-width:300px">
    ${heads.length ? html`<div class="box toc"><span class="kick">Mục lục bài</span>${heads.map(({ b, i }) => html`<a class="${b.k}" href="#s${i}">${lang === 'en' ? b.t : v.vi[i] ?? b.t}</a>`)}</div>` : ''}
    <div class="box"><span class="kick">Tiến độ dịch</span><span>${v.translatedCount}/${v.translatableCount} đoạn</span><div class="bar"><i style="width:${v.translatableCount ? Math.round((v.translatedCount / v.translatableCount) * 100) : 0}%"></i></div></div>
  </aside>
</section>
<script>
(function(){var k='ml-fs',r=document.getElementById('rd');function g(){try{return parseFloat(localStorage.getItem(k))||1}catch(e){return 1}}
function s(v){r.style.setProperty('--fs',v);try{localStorage.setItem(k,v)}catch(e){}}
window.mlFs=function(d){s(Math.min(1.5,Math.max(.8,Math.round((g()+d*.1)*10)/10)))};s(g())})();
</script>
${isPaper ? raw(`<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js" onload="renderMathInElement(document.getElementById('rd'),{delimiters:[{left:'$',right:'$',display:false}],throwOnError:false})"></script>`) : ''}`;
  return page({ title, tab: 'g2', sub: g2Sub(it.channel), body });
}
