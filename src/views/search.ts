import { raw } from 'hono/html';
import type { CaptureHit, ItemHit, Scope } from '../search';
import { SCOPES, cleanSnip } from '../search';
import { CHANNELS, timeAgoVi } from '../util';
import { capThumb } from './capture';
import { thumb } from './pages';
import { g2Sub, html, page } from './layout';

export const SEARCH_CSS = `
.srch{display:flex;flex-direction:column;gap:.7em}
.srch-row{display:flex;gap:.5em}
.srch-row input{flex:1;min-width:0;font:inherit;font-size:17px;padding:.65em .8em;border:1.5px solid #9FB3C4;border-radius:8px;background:#fff;color:inherit}
.srch-row input:focus{outline:2px solid var(--ac);outline-offset:1px;border-color:var(--ac)}
.scopes{display:flex;flex-wrap:wrap;gap:.4em}
.scopes a{border:1px solid #C9D1DA;border-radius:999px;padding:.3em .8em;font-size:.88em;color:#2D3946}
.scopes a.on{border-color:var(--ac);background:#EAF4FB;color:#005A8C;font-weight:600}
.hit{display:flex;gap:.8em;padding:.8em 0;border-top:1px solid var(--line);align-items:flex-start}
.hit .th{width:110px}
.hit .snip{font-size:.92em;color:#3E4A56;line-height:1.5}
mark{background:#FFE7A3;color:inherit;border-radius:2px;padding:0 .1em}
.sub .srchlink{display:inline-flex;align-items:center;gap:.3em;color:var(--ac);font-weight:600}
.sub .srchlink svg{width:1em;height:1em}
@media (max-width:640px){.hit .th{width:84px;order:2}}
`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Thoát HTML rồi tô vàng mọi chỗ khớp (không phân biệt hoa/thường). */
function hl(text: string, q: string) {
  const t = esc(text);
  if (!q) return raw(t);
  const re = new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return raw(t.replace(re, (m) => `<mark>${m}</mark>`));
}

function snipText(s: string | null) {
  const c = cleanSnip(s);
  return c ? `…${c}…` : '';
}

export function searchPage(p: { q: string; scope: Scope; items: ItemHit[]; captures: CaptureHit[]; ms: number }) {
  const base = (sc: Scope) => `/hoc-tap/tim?${new URLSearchParams({ ...(p.q ? { q: p.q } : {}), ...(sc !== 'tat-ca' ? { o: sc } : {}) })}`;
  const total = p.items.length + p.captures.length;
  const body = html`
<section class="cols">
  <div class="colmain" style="max-width:860px">
    <form class="srch" method="get" action="/hoc-tap/tim" role="search">
      <div class="srch-row">
        <input id="srchq" type="search" name="q" value="${p.q}" placeholder="Tìm trong tiêu đề và nội dung…" autofocus enterkeyhint="search" autocomplete="off" aria-label="Từ khóa tìm kiếm">
        <button class="btn" type="submit">Tìm</button>
      </div>
      ${p.scope !== 'tat-ca' ? html`<input type="hidden" name="o" value="${p.scope}">` : ''}
      <nav class="scopes" aria-label="Tìm trong">${SCOPES.map((s) => html`<a class="${s.id === p.scope ? 'on' : ''}" href="${base(s.id)}">${s.label}</a>`)}</nav>
    </form>
    ${!p.q
      ? html`<div class="empty" style="margin-top:1em">Gõ từ khóa rồi bấm Tìm. MyLife tìm trong tiêu đề, mô tả, toàn văn tiếng Anh, bản dịch tiếng Việt và nội dung Hộp nhặt. Tiêu đề bài tìm được cả khi gõ không dấu.</div>`
      : html`
    <p class="meta" style="margin:1em 0 .2em">${total ? `${total} kết quả` : 'Không có kết quả'} cho “${p.q}”${p.scope !== 'tat-ca' ? ` trong ${SCOPES.find((s) => s.id === p.scope)?.label}` : ''} · ${p.ms} ms</p>
    ${p.captures.length ? html`<div class="sh" style="margin-top:1em"><h2>Hộp nhặt · ${p.captures.length}</h2></div>
      ${p.captures.map((c) => html`<article class="hit">${capThumb(c)}<div style="display:flex;flex-direction:column;gap:.3em;min-width:0;flex:1">
        <span class="kick">${CHANNELS[c.channel]?.short ?? c.channel} · nhặt ${timeAgoVi(c.created_at)}</span>
        <a class="t2" href="/hoc-tap/hop-nhat/${c.id}">${hl(c.title || c.url || 'Mục nhặt', p.q)}</a>
        ${c.snip ? html`<p class="snip">${hl(snipText(c.snip), p.q)}</p>` : ''}
      </div></article>`)}` : ''}
    ${p.items.length ? html`<div class="sh" style="margin-top:1.2em"><h2>Bài · ${p.items.length}</h2>${p.items.length >= 40 ? html`<span class="meta">hiện 40 kết quả khớp nhất — thêm từ khóa để thu hẹp</span>` : ''}</div>
      ${p.items.map((it) => html`<article class="hit">${thumb(it)}<div style="display:flex;flex-direction:column;gap:.3em;min-width:0;flex:1">
        <span class="kick">${CHANNELS[it.channel].short} · ${it.source_name} · ${timeAgoVi(it.published_at)}${it.read_at ? ' · đã đọc' : ''}${it.kept ? ' · Sổ tay' : ''}</span>
        <a class="t2" href="/hoc-tap/bai/${it.id}">${hl(it.title_vi || it.title_en, p.q)}</a>
        ${it.snip ? html`<p class="snip">${hl(snipText(it.snip), p.q)}</p>` : ''}
      </div></article>`)}` : ''}
    ${!total ? html`<div class="empty" style="margin-top:1em">Thử từ khóa ngắn hơn, bỏ bớt từ, hoặc chọn “Tất cả”. Nội dung bài tìm theo đúng chữ (có dấu như trong bài); tiêu đề bài tìm được cả không dấu.</div>` : ''}
    `}
  </div>
</section>
<script>(function(){var i=document.getElementById('srchq');if(i&&!i.value)i.focus()})();</script>`;
  return page({ title: p.q ? `Tìm: ${p.q}` : 'Tìm kiếm', tab: 'g2', sub: g2Sub('search'), body });
}
