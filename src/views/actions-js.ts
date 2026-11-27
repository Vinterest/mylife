/*
 * Nút "Đã đọc", "Lưu Sổ tay", "Không quan tâm" phản hồi tức thì (cập nhật lạc quan):
 *  1. Bấm → dòng bài thu gọn và biến mất ngay (~0,2 giây), bài phía dưới trượt lên; số trên tab đổi ngay.
 *  2. Lệnh lưu gửi ngầm (fetch, máy chủ trả 204) — trang không tải lại, không nhảy về đầu trang.
 *  3. Sau khi lưu xong, lấy ngầm bản mới của chính trang này để bù bài vào cuối danh sách (giữ đủ 20 bài).
 *  4. Lưu lỗi → báo và tải lại trang để hiện đúng trạng thái thật.
 * Không có JavaScript thì các nút vẫn là form bình thường (tải lại trang như cũ).
 */
export const ACTIONS_JS = `(function(){
var RE=/\\/hoc-tap\\/(bai|hop-nhat)\\/(\\d+)\\/(da-doc|giu|bo|so-tay)$/,removed={},pending=0,refilling=false;
function toast(m){var t=document.createElement('div');t.className='ml-toast';t.textContent=m;document.body.appendChild(t);setTimeout(function(){t.remove()},2600)}
function bump(href,d){if(!href)return;document.querySelectorAll('a[href="'+href+'"] .cnt').forEach(function(el){var n=Math.max(0,(parseInt(el.textContent.replace(/\\D/g,''))||0)+d);el.textContent='('+n+')';el.classList.toggle('z',!n)})}
function collapse(row){var h=row.offsetHeight;row.style.height=h+'px';row.style.overflow='hidden';row.offsetHeight;row.classList.add('ml-out');row.style.height='0px';setTimeout(function(){row.remove()},170)}
function refill(list){
  if(refilling||pending>0)return;refilling=true;
  fetch(location.href,{cache:'no-store',credentials:'same-origin'}).then(function(r){return r.text()}).then(function(h){
    var d=new DOMParser().parseFromString(h,'text/html'),src=d.querySelector('[data-list="'+list.getAttribute('data-list')+'"]');
    if(src){var have={};list.querySelectorAll('[data-row]').forEach(function(r){have[r.getAttribute('data-row')]=1});
      src.querySelectorAll(':scope > [data-row]').forEach(function(r){var id=r.getAttribute('data-row');if(!have[id]&&!removed[id]){var n=document.importNode(r,true);n.classList.add('ml-in');list.appendChild(n)}})}
    if(!list.querySelector('[data-row]'))location.reload();if(window.mlScanTitles)window.mlScanTitles();
    var pg=d.querySelector('.pgn'),cur=document.querySelector('.pgn');if(pg&&cur)cur.replaceWith(document.importNode(pg,true));
  }).catch(function(){}).then(function(){refilling=false})}
function send(f,fd){pending++;return fetch(f.action,{method:'POST',body:new URLSearchParams(fd),headers:{'X-Ajax':'1'},credentials:'same-origin',keepalive:true,redirect:'manual'})
  .then(function(r){if(!(r.status===204||r.ok))throw 0}).finally(function(){pending--})}
document.addEventListener('submit',function(e){
  var f=e.target,m=RE.exec(new URL(f.action,location.href).pathname);if(!m)return;
  // Dòng = khối con trực tiếp của danh sách chứa nút (ở Đã đọc gồm cả dòng "Đọc xong…").
  var kind=m[1],act=m[3],list=f.closest('[data-list]'),mode=list&&list.getAttribute('data-list');
  var row=list?Array.prototype.find.call(list.children,function(ch){return ch.contains(f)}):f.closest('[data-row]');
  var fd=new FormData(f),want=fd.get('want');
  var keepOn=(act==='giu'||act==='so-tay')&&want==='1',keepOff=(act==='giu'||act==='so-tay')&&want==='0';
  // Trang đọc bài: Đã đọc vẫn chuyển về Hôm nay như cũ (không chặn).
  if(act==='da-doc'&&!list)return;
  e.preventDefault();
  var tab=row&&row.getAttribute('data-tab');
  var remove=(list&&act==='bo')||(mode==='unread'&&(act==='da-doc'||keepOn))||(mode==='read'&&act==='da-doc')||(mode==='notes'&&keepOff);
  if(remove){
    removed[row.getAttribute('data-row')]=1;collapse(row);
    if(mode==='unread'){bump(tab,-1);if(act!=='bo')bump('/hoc-tap/da-doc',1)}
    if(mode==='read'&&act==='da-doc'){bump(tab,1);bump('/hoc-tap/da-doc',-1)}
    if(keepOn)bump('/hoc-tap/so-tay',1);if(keepOff)bump('/hoc-tap/so-tay',-1);
  }else{
    // Không rời danh sách (Hộp nhặt, trang đọc bài…): đổi chữ trên nút ngay.
    var b=f.querySelector('button'),w=f.querySelector('input[name=want]');
    if(w){w.value=want==='1'?'0':'1';if(b)b.textContent=want==='1'?'Bỏ khỏi Sổ tay':(act==='so-tay'&&b.classList.contains('btn')?'Lưu vào Sổ tay':'Lưu Sổ tay');bump('/hoc-tap/so-tay',want==='1'?1:-1)}
    if(keepOn&&kind==='bai'){var rd=document.querySelector('form[action$="/'+m[2]+'/da-doc"] button');if(rd&&/Đã đọc/.test(rd.textContent)){rd.textContent='↩ Chưa đọc';rd.className='btn2'}}
  }
  send(f,fd).then(function(){if(remove&&list)refill(list)},function(){toast('Chưa lưu được — đang tải lại trang');setTimeout(function(){location.reload()},900)});
},true);
})()`;

export const ACTIONS_CSS = `.ml-out{opacity:0;margin-top:0!important;margin-bottom:0!important;padding-top:0!important;padding-bottom:0!important;border-width:0!important;transition:height .16s ease,opacity .12s ease,padding .16s ease,margin .16s ease}
.ml-in{animation:mlIn .25s ease}@keyframes mlIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.ml-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#14202B;color:#fff;padding:.7em 1.1em;border-radius:8px;font-size:.92em;z-index:99;box-shadow:0 4px 18px rgba(0,0,0,.2)}
@media (prefers-reduced-motion:reduce){.ml-out,.ml-in{transition:none;animation:none}}`;

/*
 * Dịch đúng lúc tiêu đề + tóm tắt: dòng bài có data-tr="1" (bài tiếng Anh của nguồn bật Dịch mặc định, hoặc bài tiếng
 * châu Á chưa dịch) được gửi đi dịch khi nó hiện trên màn hình hoặc sắp cuộn tới — gộp tối đa 25 bài/lượt —
 * rồi đổi chữ tại chỗ. Bài anh không cuộn tới thì không dịch.
 */
export const TITLES_JS = `(function(){
if(!('IntersectionObserver' in window))return;
var queue=[],timer=0,busy=false;
function flush(){timer=0;if(busy||!queue.length)return;var rows=queue.splice(0,25);busy=true;
  fetch('/hoc-tap/dich-tieu-de',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({ids:rows.map(function(r){return r.getAttribute('data-row')})})})
  .then(function(r){return r.ok?r.json():{}}).then(function(m){rows.forEach(function(row){var x=m[row.getAttribute('data-row')];row.removeAttribute('data-tr');if(!x)return;
    var a=row.querySelector('.t2');if(a){var last=a.lastChild;if(last&&last.nodeType===3)last.nodeValue=x.t;else a.appendChild(document.createTextNode(x.t));a.setAttribute('lang','vi');a.classList.add('ml-in')}
    var p=row.querySelector('.sum');if(p&&x.s){p.textContent=x.s;p.setAttribute('lang','vi')}
    var tag=row.querySelector('.thtag');if(!tag){tag=document.createElement('span');var k=row.querySelector('.kick');if(k)k.after(tag)}if(tag){tag.className='thtag';tag.textContent=x.tag}})})
  .catch(function(){rows.forEach(function(r){r.setAttribute('data-tr','1')})}).then(function(){busy=false;if(queue.length)timer=setTimeout(flush,50)})}
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting&&e.target.getAttribute('data-tr')==='1')take(e.target)});if(queue.length&&!timer)timer=setTimeout(flush,120)},{rootMargin:'400px 0px'});
function take(r){r.setAttribute('data-tr','2');io.unobserve(r);queue.push(r)}
// Dự phòng khi trình duyệt không báo IntersectionObserver (tab nền, khung nhúng…): tự đo vị trí các dòng.
function sweep(){var h=innerHeight;document.querySelectorAll('[data-tr="1"]').forEach(function(r){var b=r.getBoundingClientRect();if(b.bottom>-400&&b.top<h+400)take(r)});if(queue.length&&!timer)timer=setTimeout(flush,120)}
function scan(){document.querySelectorAll('[data-tr="1"]').forEach(function(r){io.observe(r)});setTimeout(sweep,1500)}
var st=0;addEventListener('scroll',function(){if(!st)st=setTimeout(function(){st=0;sweep()},300)},{passive:true});
window.mlScanTitles=scan;scan();
})()`;
