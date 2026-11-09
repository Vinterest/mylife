import { raw } from 'hono/html';
import type { CaptureImage, CaptureRow } from '../capture';
import type { ItemRow } from '../types';
import { CHANNELS, CHANNEL_ORDER, timeAgoVi } from '../util';
import { g2Sub, html, page } from './layout';

export const CAPTURE_CSS = `
.drop{padding:.7em}
.capd>summary{list-style:none;width:100%;box-sizing:border-box;margin-bottom:.6em}
.capd>summary::-webkit-details-marker{display:none}
.capd[open]>summary{display:none}
.cap-form{display:flex;flex-direction:column;gap:.75em}
@media (max-width:640px){.capinfo{display:none}}
.cap-form label{font-weight:600;font-size:.92em}
.cap-form input[type=url],.cap-form textarea,.cap-form select{width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:.6em .7em;border:1px solid #C9D1DA;border-radius:6px;background:#fff;color:inherit}
.cap-form textarea{min-height:4.5em;resize:vertical}
.cap-row{display:flex;gap:.5em;align-items:stretch}
.cap-row input{flex:1;min-width:0}
.drop{border:1.5px dashed #9FB3C4;border-radius:8px;padding:1em;text-align:center;color:var(--mut);cursor:pointer;background:var(--tint)}
.drop b{color:var(--ac)}
.drop.over{background:#DCEAF4}
.prevs{display:flex;flex-wrap:wrap;gap:.5em}
.prevs figure{margin:0;position:relative;width:84px;height:84px;border-radius:6px;overflow:hidden;background:#EEF2F5}
.prevs img{width:100%;height:100%;object-fit:cover;display:block}
.prevs figcaption{position:absolute;left:0;right:0;bottom:0;font-size:10px;background:rgba(20,32,43,.7);color:#fff;padding:1px 4px}
.prevs button{position:absolute;top:2px;right:2px;width:22px;height:22px;border-radius:11px;border:0;background:rgba(20,32,43,.75);color:#fff;font-size:14px;line-height:22px;padding:0;cursor:pointer}
.chans{display:flex;flex-wrap:wrap;gap:.4em}
.chans label{font-weight:500;display:inline-flex;align-items:center;gap:.35em;border:1px solid #C9D1DA;border-radius:999px;padding:.35em .8em;cursor:pointer}
.chans input{margin:0}
.chans label:has(input:checked){border-color:var(--ac);background:#EAF4FB;color:#005A8C;font-weight:600}
.cap-msg{font-size:.92em}
.cap-msg.err{color:#9A2A14}
.cc{display:flex;gap:.8em;padding:.8em 0;border-top:1px solid var(--line);align-items:flex-start}
.cc:first-of-type{border-top:0}
.cc .th{width:120px}
.cc .th img{object-position:top}
.cc .ocr{font-size:.92em;color:#3E4A56;line-height:1.5;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-line}
.imgs{display:flex;flex-direction:column;gap:1.2em}
.imgs figure{margin:0;display:flex;flex-direction:column;gap:.5em}
.imgs img{max-width:100%;max-height:80vh;width:auto;border-radius:6px;border:1px solid var(--line);align-self:flex-start}
.imgs .zoomhint{display:none}
/* Máy tính: ảnh chụp từ điện thoại phóng to ~2.5 lần (rộng tới 800px) cho dễ đọc; bấm ảnh để thu về vừa màn hình */
@media (min-width:900px){.imgs img{max-height:none;width:min(100%,800px);cursor:zoom-out}.imgs img.fit{width:auto;max-height:80vh;cursor:zoom-in}.imgs .zoomhint{display:inline}}
.ocrbox{white-space:pre-wrap;line-height:1.6;background:#F7F9FA;border:1px solid var(--line);border-radius:6px;padding:.8em 1em;font-size:.95em}
@media (max-width:640px){.cc .th{width:96px;order:2}}
@media (max-width:640px){.dropk{display:none}.cap-form{gap:.55em}.cap-form label{font-size:.88em}.chans label{padding:.25em .65em}.prevs figure{width:64px;height:64px}}
`;

const chName = (c: string) => CHANNELS[c as keyof typeof CHANNELS]?.short ?? c;

export function capThumb(c: CaptureRow) {
  const first = c.img_ids?.split(',')[0];
  const fb = `/thumb/manual.svg?ch=${c.channel}`;
  const src = first ? `/hoc-tap/anh/${first}` : c.image_url || fb;
  return html`<a class="th" href="/hoc-tap/hop-nhat/${c.id}" tabindex="-1" aria-hidden="true"><img src="${src}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${fb}'"></a>`;
}

function capStatus(c: CaptureRow) {
  if (c.status === 'failed') return html`<span class="st err">Lỗi xử lý</span>`;
  if (c.status === 'new') return html`<span class="st wait">Đang lấy link…</span>`;
  return '';
}

function capRow(c: CaptureRow, back: string) {
  const nImg = c.img_ids ? c.img_ids.split(',').length : 0;
  const text = c.note || c.ocr_preview?.replace(/^\[[^\]]*\]\s*/, '') || c.description || '';
  return html`<article class="cc">
  ${capThumb(c)}
  <div style="display:flex;flex-direction:column;gap:.3em;min-width:0;flex:1">
    <div style="display:flex;gap:.5em;flex-wrap:wrap;align-items:center"><span class="kick">${chName(c.channel)}</span>${capStatus(c)}${c.kept ? html`<span class="st ok">Sổ tay</span>` : ''}</div>
    <a class="t2" href="/hoc-tap/hop-nhat/${c.id}">${c.title || c.url || 'Ảnh nhặt'}</a>
    ${text && text.trim() !== (c.title ?? '').trim() ? html`<p class="ocr">${text}</p>` : ''}
    <div class="acts">
      <span class="meta">${timeAgoVi(c.created_at)} · ${c.via === 'shortcut' ? 'từ Phím tắt iPhone' : 'từ web'}${nImg ? ` · ${nImg} ảnh` : ''}${c.url ? ' · có link' : ''}</span>
      <a href="/hoc-tap/hop-nhat/${c.id}">Mở</a>
      ${c.item_id ? html`<a href="/hoc-tap/bai/${c.item_id}">Đọc toàn văn</a>` : ''}
      <form class="inline" method="post" action="/hoc-tap/hop-nhat/${c.id}/so-tay"><input type="hidden" name="back" value="${back}"><button class="l" type="submit">${c.kept ? 'Bỏ khỏi Sổ tay' : 'Lưu Sổ tay'}</button></form>
      ${c.archived ? '' : html`<form class="inline" method="post" action="/hoc-tap/hop-nhat/${c.id}/xong"><input type="hidden" name="back" value="${back}"><button class="l" type="submit">✓ Xong</button></form>`}
    </div>
  </div>
</article>`;
}

/** Form gửi: nén ảnh ngay trên điện thoại (rộng tối đa 1600px, JPEG) rồi gửi bằng fetch. */
const FORM_JS = `
(function(){
var f=document.getElementById('capf'),inp=document.getElementById('capimg'),drop=document.getElementById('drop'),prevs=document.getElementById('prevs'),msg=document.getElementById('capmsg'),btn=document.getElementById('capbtn'),files=[];
function show(){prevs.innerHTML='';files.forEach(function(x,i){var fig=document.createElement('figure');var im=document.createElement('img');im.src=x.url;fig.appendChild(im);var cap=document.createElement('figcaption');cap.textContent=Math.round(x.blob.size/1024)+' KB';fig.appendChild(cap);var b=document.createElement('button');b.type='button';b.textContent='×';b.setAttribute('aria-label','Bỏ ảnh');b.onclick=function(){files.splice(i,1);show()};fig.appendChild(b);prevs.appendChild(fig)});}
function shrink(file){return new Promise(function(ok){var url=URL.createObjectURL(file);var img=new Image();img.onload=function(){var M=1600,w=img.naturalWidth,h=img.naturalHeight,s=Math.min(1,M/Math.max(w,h));var c=document.createElement('canvas');c.width=Math.round(w*s);c.height=Math.round(h*s);c.getContext('2d').drawImage(img,0,0,c.width,c.height);c.toBlob(function(b){URL.revokeObjectURL(url);ok(b&&b.size<file.size?b:file)},'image/jpeg',0.82)};img.onerror=function(){ok(file)};img.src=url})}
function add(list){var arr=Array.prototype.slice.call(list).filter(function(x){return /^image\\//.test(x.type)});if(files.length+arr.length>${6}){msg.className='cap-msg err';msg.textContent='Tối đa 6 ảnh mỗi lần.';arr=arr.slice(0,${6}-files.length)}
msg.textContent=arr.length?'Đang nén ảnh…':'';Promise.all(arr.map(shrink)).then(function(bs){bs.forEach(function(b){files.push({blob:b,url:URL.createObjectURL(b)})});msg.textContent='';show()})}
inp.addEventListener('change',function(){add(inp.files);inp.value=''});
drop.addEventListener('click',function(){inp.click()});
drop.addEventListener('dragover',function(e){e.preventDefault();drop.classList.add('over')});
drop.addEventListener('dragleave',function(){drop.classList.remove('over')});
drop.addEventListener('drop',function(e){e.preventDefault();drop.classList.remove('over');add(e.dataTransfer.files)});
document.addEventListener('paste',function(e){if(e.clipboardData&&e.clipboardData.files.length)add(e.clipboardData.files)});
var pb=document.getElementById('pastebtn');if(pb&&navigator.clipboard&&navigator.clipboard.readText){pb.onclick=function(){navigator.clipboard.readText().then(function(t){var m=/https?:\\/\\/\\S+/.exec(t||'');if(m)document.getElementById('capurl').value=m[0];else{msg.className='cap-msg err';msg.textContent='Bộ nhớ tạm không có link.'}}).catch(function(){msg.className='cap-msg err';msg.textContent='Trình duyệt chưa cho đọc bộ nhớ tạm — hãy nhấn giữ ô link rồi chọn Dán.'})}}else if(pb){pb.style.display='none'}
var det=f.closest('details');function toForm(){if(window.innerWidth<640)setTimeout(function(){window.scrollTo({top:det.getBoundingClientRect().top+window.scrollY-8,behavior:'smooth'})},50)}
if(det){if(det.open)toForm();det.addEventListener('toggle',function(){if(det.open)toForm()})}
f.addEventListener('submit',function(e){e.preventDefault();var fd=new FormData(f);fd.delete('image');files.forEach(function(x,i){fd.append('image',x.blob,'anh-'+(i+1)+'.jpg')});
btn.disabled=true;msg.className='cap-msg';msg.textContent='Đang gửi…';
fetch(f.action,{method:'POST',body:fd,headers:{Accept:'application/json'},credentials:'same-origin'}).then(function(r){return r.json().catch(function(){return {ok:false,error:'Máy chủ trả lỗi '+r.status}})}).then(function(j){if(j.ok){location.href=j.url}else{btn.disabled=false;msg.className='cap-msg err';msg.textContent=j.error||'Gửi chưa được'}}).catch(function(){btn.disabled=false;msg.className='cap-msg err';msg.textContent='Mất mạng — thử gửi lại.'})});
})();`;

function captureForm(open: boolean) {
  return html`<details class="capd" ${open ? 'open' : ''}><summary class="btn">+ Nhặt bài mới</summary><form id="capf" class="box cap-form" method="post" action="/hoc-tap/hop-nhat" enctype="multipart/form-data">
  <div><label>1 · Ảnh chụp màn hình <span class="meta">(tối đa 6 ảnh · tự nén trước khi gửi)</span></label>
    <input id="capimg" type="file" name="image" accept="image/*" multiple hidden>
    <div id="drop" class="drop" role="button" tabindex="0"><b>Chọn ảnh hoặc chụp</b><span class="meta dropk"> · máy tính: kéo thả hoặc Ctrl+V</span></div>
    <div id="prevs" class="prevs" style="margin-top:.5em"></div></div>
  <div><label for="capurl">2 · Link đường dẫn <span class="meta">(Facebook, YouTube, báo, web…)</span></label>
    <div class="cap-row"><input id="capurl" type="url" name="url" inputmode="url" placeholder="https://…" autocomplete="off"><button id="pastebtn" class="btn2" type="button">Dán</button></div></div>
  <div><label for="capnote">3 · Nội dung <span class="meta">(dán nguyên bài Facebook hoặc tự ghi)</span></label><textarea id="capnote" name="note" rows="2" style="min-height:0;height:3.6em" placeholder="Dán nội dung bài viết vào đây…"></textarea></div>
  <div><label for="captitle">4 · Tiêu đề <span class="meta">(không bắt buộc — để trống thì MyLife tự đặt)</span></label><input id="captitle" type="text" name="title" maxlength="300" placeholder="Tự đặt tiêu đề cho mục này…" autocomplete="off" style="width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:.6em .7em;border:1px solid #C9D1DA;border-radius:6px;background:#fff;color:inherit"></div>
  <div><label>Kênh</label><div class="chans">${CHANNEL_ORDER.map((c, i) => html`<label><input type="radio" name="channel" value="${c}" ${i === 0 ? 'checked' : ''}>${CHANNELS[c].short}</label>`)}</div></div>
  <div style="display:flex;gap:.8em;align-items:center;flex-wrap:wrap"><button id="capbtn" class="btn" type="submit">Lưu vào Hộp nhặt</button><span id="capmsg" class="cap-msg" role="status"></span></div>
</form></details>
<script>${raw(FORM_JS)}</script>`;
}

export function inboxPage(p: { items: CaptureRow[]; done: number; showDone: boolean }) {
  const back = p.showDone ? '/hoc-tap/hop-nhat?xem=xong' : '/hoc-tap/hop-nhat';
  const body = html`
<section class="cols">
  <div class="colmain">
    <div class="sh"><h2>${p.showDone ? 'Đã xử lý' : 'Hộp nhặt'} · ${p.items.length} mục</h2><span class="meta">mới nhặt trước</span>
      <span class="seg sm"><a class="${p.showDone ? '' : 'on'}" href="/hoc-tap/hop-nhat">Chưa xử lý</a><a class="${p.showDone ? 'on' : ''}" href="/hoc-tap/hop-nhat?xem=xong">Đã xử lý (${p.done})</a></span></div>
    ${p.items.length ? p.items.map((c) => capRow(c, back)) : html`<div class="empty">${p.showDone ? 'Chưa có mục nào đã xử lý.' : 'Hộp nhặt trống. Dán link hoặc chọn ảnh chụp ở ô bên cạnh (trên điện thoại: ở trên cùng) để nhặt bài đầu tiên.'}</div>`}
  </div>
  <aside class="colside" style="order:-1">
    ${captureForm(!p.items.length || p.showDone === false && p.items.length < 3)}
    <div class="box capinfo"><span class="kick">Sau khi gửi</span><span class="meta">Ảnh và nội dung được lưu nguyên như anh gửi (không dùng AI). Link: MyLife tự lấy tiêu đề, ảnh và toàn văn nếu trang công khai; Facebook thường cần đăng nhập nên chỉ lưu link. Bấm “✓ Xong” để đưa mục ra khỏi Hộp nhặt, “Lưu Sổ tay” để giữ lâu dài.</span></div>
  </aside>
</section>`;
  return page({ title: 'Hộp nhặt', tab: 'g2', sub: g2Sub('inbox'), body });
}

export function capturePage(c: CaptureRow, imgs: CaptureImage[], item: ItemRow | null, older: CaptureRow[]) {
  const pending = c.status === 'new';
  const back = `/hoc-tap/hop-nhat/${c.id}`;
  const body = html`
<section class="cols">
  <article class="colmain" style="max-width:820px">
    <div class="meta"><a href="/hoc-tap/hop-nhat">Hộp nhặt</a> › mục #${c.id}</div>
    <div class="kick" style="margin-top:.6em">${chName(c.channel)} · nhặt ${timeAgoVi(c.created_at)} ${c.via === 'shortcut' ? '· từ Phím tắt iPhone' : '· từ web'}</div>
    <h1 class="t1" style="margin:.3em 0 .6em">${c.title || c.url || 'Ảnh nhặt'}</h1>
    ${pending ? html`<div class="rd-state"><span class="st wait">Đang xử lý…</span><span class="meta">MyLife đang lấy tiêu đề và nội dung của link. Trang tự tải lại sau 8 giây.</span></div><script>setTimeout(function(){location.reload()},8000)</script>` : ''}
    ${c.status === 'failed' ? html`<div class="rd-state warn"><span class="st err">Lỗi</span><span class="meta">${c.error ?? ''}</span><form method="post" action="/hoc-tap/hop-nhat/${c.id}/xu-ly-lai"><button class="btn2" type="submit">Xử lý lại</button></form></div>` : ''}
    ${imgs.length ? html`<div class="imgs">${imgs.map((im, k) => html`<figure>
      <img src="/hoc-tap/anh/${im.id}" alt="Ảnh ${k + 1}" loading="${k ? 'lazy' : 'eager'}" onclick="this.classList.toggle('fit')">
      <figcaption class="meta">Ảnh ${k + 1}/${imgs.length} · ${Math.round(im.bytes / 1024)} KB<span class="zoomhint"> · bấm ảnh để thu nhỏ / phóng to</span></figcaption>
      ${im.ocr_status === 'done' && im.ocr_text ? html`<div><div style="display:flex;justify-content:space-between;align-items:center;gap:.5em"><span class="kick">Chữ trong ảnh</span><button class="l" type="button" style="color:var(--ac);font-weight:600" onclick="navigator.clipboard&&navigator.clipboard.writeText(this.parentNode.nextElementSibling.textContent).then(()=>{this.textContent='Đã chép ✓'})">Chép chữ</button></div><div class="ocrbox">${im.ocr_text}</div></div>`
        : ''}
    </figure>`)}</div>` : ''}
    ${c.url ? html`<div class="box" style="margin:1.2em 0 0">
      <span class="kick">Link</span>
      <a href="${c.url}" target="_blank" rel="noopener" style="color:var(--ac);word-break:break-all">${c.url} ↗</a>
      ${c.description ? html`<span class="sum">${c.description}</span>` : ''}
      ${item ? html`<a class="btn" style="align-self:flex-start" href="/hoc-tap/bai/${item.id}">Đọc toàn văn trong MyLife</a>` : ''}
    </div>` : ''}
    ${c.note ? html`<div style="margin-top:1.2em"><div style="display:flex;justify-content:space-between;align-items:center;gap:.5em"><span class="kick">Nội dung</span><button class="l" type="button" style="color:var(--ac);font-weight:600" onclick="navigator.clipboard&&navigator.clipboard.writeText(this.parentNode.nextElementSibling.textContent).then(()=>{this.textContent='Đã chép ✓'})">Chép</button></div><div class="ocrbox">${c.note}</div></div>` : ''}
    <div class="acts" style="margin-top:1.4em">
      <a href="/hoc-tap/hop-nhat">‹ Về Hộp nhặt</a>
      <form class="inline" method="post" action="/hoc-tap/hop-nhat/${c.id}/so-tay"><input type="hidden" name="back" value="${back}"><button class="${c.kept ? 'btn2' : 'btn'}" type="submit">${c.kept ? 'Bỏ khỏi Sổ tay' : 'Lưu vào Sổ tay'}</button></form>
      <form class="inline" method="post" action="/hoc-tap/hop-nhat/${c.id}/xong"><input type="hidden" name="back" value="${c.archived ? back : '/hoc-tap/hop-nhat'}"><button class="btn2" type="submit">${c.archived ? '↩ Đưa lại Hộp nhặt' : '✓ Xong'}</button></form>
      <details style="display:inline-block"><summary class="meta" style="cursor:pointer">Xóa…</summary><form method="post" action="/hoc-tap/hop-nhat/${c.id}/xoa" style="margin-top:.4em"><button class="btn2" style="color:#9A2A14;border-color:#9A2A14" type="submit">Xóa hẳn mục này và ảnh</button></form></details>
    </div>
  </article>
</section>
<section class="cols" id="cu-hon" style="margin-top:1.6em">
  <div class="colmain" style="max-width:820px">
    <div class="sh"><h2>10 mục nhặt trước mục này</h2><span class="meta">mới hơn trước · gồm cả mục đã xử lý</span></div>
    ${older.length
      ? older.map((o) => capRow(o, `/hoc-tap/hop-nhat/${c.id}`))
      : html`<div class="empty">Đây là mục nhặt cũ nhất.</div>`}
    ${older.length === 10 ? html`<div class="pager"><span></span><a class="btn2" href="/hoc-tap/hop-nhat/${older[9].id}#cu-hon">Xem 10 mục cũ hơn nữa ›</a></div>` : ''}
  </div>
</section>`;
  return page({ title: c.title || 'Mục nhặt', tab: 'g2', sub: g2Sub('inbox'), body });
}

export function notebookPage(p: { captures: CaptureRow[]; items: ItemRow[] }) {
  type Entry = { at: string; html: unknown };
  const entries: Entry[] = [
    ...p.captures.map((c) => ({ at: c.created_at, html: capRow(c, '/hoc-tap/so-tay') })),
    ...p.items.map((it) => ({
      at: it.fetched_at,
      html: html`<article class="cc">
        <a class="th" href="/hoc-tap/bai/${it.id}" tabindex="-1" aria-hidden="true"><img src="${it.image_url || `/thumb/${it.source_id}.svg`}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='/thumb/${it.source_id}.svg'"></a>
        <div style="display:flex;flex-direction:column;gap:.3em;min-width:0;flex:1">
          <span class="kick">${chName(it.channel)} · bài đã giữ</span>
          <a class="t2" href="/hoc-tap/bai/${it.id}" lang="en">${it.title_en}</a>
          ${it.note ? html`<div class="why"><b>Ghi chú:</b> ${it.note}</div>` : ''}
          <span class="meta">${it.source_name} · ${timeAgoVi(it.published_at)}</span>
        </div>
      </article>`,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));
  const body = html`
<section class="cols">
  <div class="colmain">
    <div class="sh"><h2>Sổ tay · ${entries.length} mục</h2><span class="meta">mục nhặt đã “Lưu Sổ tay” + bài đã bấm “Giữ”</span></div>
    ${entries.length ? entries.map((e) => e.html) : html`<div class="empty">Sổ tay trống. Bấm “Lưu Sổ tay” ở mục nhặt hoặc “Giữ” ở bài báo để lưu lâu dài kèm ghi chú.</div>`}
  </div>
</section>`;
  return page({ title: 'Sổ tay', tab: 'g2', sub: g2Sub('notes'), body });
}
