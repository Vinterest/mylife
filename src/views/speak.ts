/**
 * Nút "Đọc bài": đọc to bài bằng giọng đọc có sẵn trong trình duyệt/iPhone (Web Speech API) — miễn phí, không tốn hạn mức.
 * Đọc đúng ngôn ngữ đang hiển thị: đoạn tiếng Việt bằng giọng Việt, đoạn còn tiếng Anh bằng giọng Anh.
 * Thanh điều khiển dưới màn hình: lùi/tới đoạn, tạm dừng, dừng, tốc độ; đoạn đang đọc được tô và tự cuộn tới.
 */

export const SPEAK_CSS = `
.spk-btn{display:inline-flex;align-items:center;gap:.45em}
.spk-btn svg{width:1.15em;height:1.15em;flex:none}
#rd .speaking{background:#FFF4E5;box-shadow:-.5em 0 0 #FFF4E5,.5em 0 0 #FFF4E5;border-radius:4px}
body.spk-open{padding-bottom:130px}
h1.speaking{background:#FFF4E5;border-radius:4px}
#rd.spk-on p,#rd.spk-on h2,#rd.spk-on h3,#rd.spk-on blockquote{cursor:pointer}
.spk-bar{position:fixed;left:0;right:0;bottom:0;z-index:50;background:#14202B;color:#fff;padding:.6em max(16px,env(safe-area-inset-right,0px)) calc(.6em + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));display:flex;align-items:center;gap:.6em;flex-wrap:wrap;box-shadow:0 -2px 10px rgba(0,0,0,.2)}
.spk-bar[hidden]{display:none}
.spk-bar button,.spk-bar select{font:inherit;color:#fff;background:#24364A;border:0;border-radius:8px;min-width:48px;min-height:48px;padding:0 .8em;font-size:1.05em;cursor:pointer}
.spk-bar button.main{background:#0A8FDC;min-width:64px;font-weight:700}
.spk-bar .spk-st{flex:1 1 100%;order:-1;font-size:.9em;color:#C9D6E2;min-width:0}
.spk-bar #spkstop{margin-left:auto}
.spk-pad{height:84px}
`;

export const SPEAK_JS = `(function(){
var rd=document.getElementById('rd');if(!rd)return;
var bar=document.getElementById('spkbar'),st=document.getElementById('spkst'),bp=document.getElementById('spkplay'),sel=document.getElementById('spkrate');
var syn=window.speechSynthesis;
if(!syn){document.querySelectorAll('.spk-btn').forEach(function(b){b.disabled=true;b.title='Trình duyệt này không hỗ trợ đọc to'});return}
var K='ml-spk-rate',rate=1.25;try{rate=parseFloat(localStorage.getItem(K))||1.25}catch(e){}
sel.value=String(rate);
var els=[],idx=0,playing=false,parts=[],pi=0,lock=null,voices=[];
function loadV(){voices=syn.getVoices()||[]}loadV();if(syn.onvoiceschanged!==undefined)syn.onvoiceschanged=loadV;
function voiceFor(l){var v=voices.filter(function(x){return x.lang&&x.lang.toLowerCase().indexOf(l)===0});
  var pref=v.filter(function(x){return /enhanced|premium|natural|google|linh|samantha/i.test(x.name)});return pref[0]||v[0]||null}
function collect(){var bi=rd.querySelector('.bi');var q=bi?'.bi > div:first-child > *':'h2,h3,p,blockquote';
  var h1=document.querySelector('h1.t1');els=(h1?[h1]:[]).concat(Array.prototype.slice.call(rd.querySelectorAll(q))).filter(function(e){return e.tagName!=='PRE'&&e.textContent.replace(/[•\\s—-]/g,'').length>1});
  els.forEach(function(e,i){e.dataset.spk=i})}
function langOf(e){var x=e.closest('[lang]');return ((x&&x.getAttribute('lang'))||'vi').slice(0,2)}
function split(t){t=t.replace(/^•\\s*/,'').replace(/\\s+/g,' ').trim();var out=[],cur='';
  (t.match(/[^.!?…;:]+[.!?…;:]*\\s*/g)||[t]).map(function(s){return s.trim()}).filter(Boolean).forEach(function(s){if((cur+' '+s).length>260&&cur){out.push(cur);cur=s}else cur=cur?cur+' '+s:s});if(cur)out.push(cur);
  return out.reduce(function(a,s){while(s.length>320){var k=s.lastIndexOf(' ',300);if(k<100)k=300;a.push(s.slice(0,k));s=s.slice(k)}a.push(s);return a},[])}
function mark(){document.querySelectorAll('.speaking').forEach(function(e){e.classList.remove('speaking')});var e=els[idx];if(e){e.classList.add('speaking');e.scrollIntoView({block:'center',behavior:'smooth'})}
  st.textContent=(playing?'Đang đọc':'Tạm dừng')+' · đoạn '+(idx+1)+'/'+els.length;bp.textContent=playing?'❚❚':'▶';bp.setAttribute('aria-label',playing?'Tạm dừng':'Đọc tiếp')}
function speakPart(){if(!playing)return;if(pi>=parts.length){idx++;if(idx>=els.length){stop(true);return}startEl();return}
  var e=els[idx],l=langOf(e),u=new SpeechSynthesisUtterance(parts[pi]);u.lang=l==='en'?'en-US':'vi-VN';var v=voiceFor(l==='en'?'en':'vi');if(v)u.voice=v;u.rate=rate;
  if(l!=='en'&&!voiceFor('vi')&&!speakPart.warned){speakPart.warned=1;st.textContent='Máy chưa có giọng tiếng Việt — xem hướng dẫn cài trong Cài đặt'}
  u.onend=function(){if(u._x)return;speakPart.bad=0;pi++;speakPart()};u.onerror=function(ev){if(ev.error==='interrupted'||ev.error==='canceled'||u._x)return;u._x=1;if(++speakPart.bad>=3){playing=false;wake(false);st.textContent='Máy không đọc được ('+ev.error+'). Kiểm tra giọng đọc trong Cài đặt rồi bấm ▶';bp.textContent='▶';return}pi++;speakPart()};
  speakPart.cur=u;syn.speak(u)}
function startEl(){parts=split(els[idx].textContent);pi=0;mark();speakPart()}
function cancel(){if(speakPart.cur)speakPart.cur._x=1;syn.cancel()}
function wake(on){try{if(on&&navigator.wakeLock&&!lock)navigator.wakeLock.request('screen').then(function(l){lock=l;l.addEventListener('release',function(){lock=null})}).catch(function(){});if(!on&&lock){lock.release();lock=null}}catch(e){}}
function play(from){speakPart.bad=0;if(!els.length)collect();if(!els.length){st.textContent='Bài không có nội dung để đọc';return}
  if(typeof from==='number')idx=Math.max(0,Math.min(els.length-1,from));cancel();playing=true;bar.hidden=false;rd.classList.add('spk-on');document.body.classList.add('spk-open');wake(true);startEl()}
function pause(){playing=false;cancel();wake(false);mark()}
function stop(fin){playing=false;cancel();wake(false);rd.classList.remove('spk-on');document.querySelectorAll('.speaking').forEach(function(e){e.classList.remove('speaking')});
  if(fin){st.textContent='Đã đọc hết bài';bp.textContent='▶';idx=0}else{bar.hidden=true;document.body.classList.remove('spk-open')}}
document.querySelectorAll('.spk-btn').forEach(function(b){b.addEventListener('click',function(){if(playing)pause();else play(idx)})});
bp.addEventListener('click',function(){if(playing)pause();else play(idx)});
document.getElementById('spkprev').addEventListener('click',function(){play(idx-1)});
document.getElementById('spknext').addEventListener('click',function(){play(idx+1)});
document.getElementById('spkstop').addEventListener('click',function(){stop(false)});
sel.addEventListener('change',function(){rate=parseFloat(sel.value)||1.25;try{localStorage.setItem(K,String(rate))}catch(e){}if(playing)play(idx)});
rd.addEventListener('click',function(ev){if(!rd.classList.contains('spk-on'))return;var e=ev.target.closest('[data-spk]');if(e&&!ev.target.closest('a'))play(+e.dataset.spk)});
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'&&playing)wake(true)});
window.addEventListener('pagehide',function(){cancel()});
})();`;

const SPEAKER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';

/** Nút "Đọc bài" (đặt ở thanh công cụ và cạnh nút Dịch bài này). */
export const speakButton = (cls = 'btn2') => `<button type="button" class="${cls} spk-btn">${SPEAKER}<span>Đọc bài</span></button>`;

/** Thanh điều khiển đọc (ẩn tới khi bấm Đọc bài). */
export const SPEAK_BAR = `<div class="spk-bar" id="spkbar" hidden role="region" aria-label="Điều khiển đọc bài">
<button type="button" id="spkprev" aria-label="Đoạn trước">⏮</button>
<button type="button" id="spkplay" class="main" aria-label="Tạm dừng">❚❚</button>
<button type="button" id="spknext" aria-label="Đoạn sau">⏭</button>
<span class="spk-st" id="spkst" role="status">Đang đọc</span>
<label style="display:flex;align-items:center;gap:.3em"><span class="sr-only" style="position:absolute;left:-9999px">Tốc độ</span><select id="spkrate" aria-label="Tốc độ đọc"><option value="0.9">0.9×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="1.75">1.75×</option><option value="2">2×</option></select></label>
<button type="button" id="spkstop" aria-label="Dừng đọc">■</button>
</div>`;
