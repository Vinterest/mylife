import type { Stats } from '../usage';
import { DEVICE_LABEL, READ_SECONDS } from '../usage';
import { g2Sub, html, page, raw } from './layout';

/* Bảng điều khiển "Thống kê đọc": trung bình mỗi ngày đọc bao nhiêu bài, mất bao lâu, chia theo Máy tính / iPhone. */

// Hai màu đã kiểm tra mù màu và tương phản trên nền trắng (dataviz validate_palette).
const COLOR = { web: '#0A6FB0', iphone: '#D2690A' } as const;
export const PERIODS = [7, 30, 90] as const;

/** 75 → "1 phút", 3900 → "1 giờ 5 phút". */
export function fmtDur(sec: number): string {
  const m = Math.round(sec / 60);
  if (sec > 0 && m === 0) return 'dưới 1 phút';
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} giờ ${r} phút` : `${h} giờ`;
}
/** Dạng gọn cho ô số lớn: "38 phút", "15,7 giờ". */
const fmtShort = (sec: number) => (sec >= 3600 ? `${(Math.round(sec / 360) / 10).toLocaleString('vi-VN')} giờ` : fmtDur(sec));
const dm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const num = (x: number) => (Math.round(x * 10) / 10).toLocaleString('vi-VN');

/** Biểu đồ cột chồng: phút đọc mỗi ngày, Máy tính (dưới) + iPhone (trên). */
function dayChart(s: Stats): string {
  const W = 640, H = 190, padL = 34, padB = 22, padT = 8;
  const n = s.perDay.length;
  const maxMin = Math.max(10, ...s.perDay.map((d) => (d.web + d.iphone) / 60));
  const step = maxMin <= 30 ? 10 : maxMin <= 60 ? 20 : maxMin <= 150 ? 30 : 60;
  const top = Math.ceil(maxMin / step) * step;
  const y = (min: number) => padT + (H - padT - padB) * (1 - min / top);
  const slot = (W - padL) / n, bw = Math.max(2, Math.min(28, slot * 0.7));
  const parts: string[] = [];
  for (let v = 0; v <= top; v += step) {
    parts.push(`<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="#E6EAEE" stroke-width="1"/>`);
    parts.push(`<text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end" class="ax">${v}</text>`);
  }
  s.perDay.forEach((d, k) => {
    const x = padL + slot * k + (slot - bw) / 2;
    const wm = d.web / 60, im = d.iphone / 60;
    const tip = `${dm(d.day)}: ${fmtDur(d.web + d.iphone)} · ${d.articles} bài (Máy tính ${fmtDur(d.web)}, iPhone ${fmtDur(d.iphone)})`;
    if (wm > 0) parts.push(`<rect x="${x}" y="${y(wm)}" width="${bw}" height="${Math.max(1, y(0) - y(wm))}" rx="${bw > 8 ? 3 : 1}" fill="${COLOR.web}"/>`);
    if (im > 0) {
      const base = wm > 0 ? y(wm) - 2 : y(0); // khe 2px giữa hai phần
      const h = Math.max(1, y(0) - y(im));
      parts.push(`<rect x="${x}" y="${base - h}" width="${bw}" height="${h}" rx="${bw > 8 ? 3 : 1}" fill="${COLOR.iphone}"/>`);
    }
    parts.push(`<rect class="hit" x="${padL + slot * k}" y="${padT}" width="${slot}" height="${H - padT - padB}" fill="transparent" data-tip="${tip}"><title>${tip}</title></rect>`);
  });
  const ticks = n <= 7 ? s.perDay.map((_, k) => k) : [0, Math.floor((n - 1) / 2), n - 1];
  for (const k of ticks) {
    const anchor = n > 7 && k === 0 ? 'start' : n > 7 && k === n - 1 ? 'end' : 'middle';
    const x = anchor === 'start' ? padL + slot * k : anchor === 'end' ? W : padL + slot * k + slot / 2;
    parts.push(`<text x="${x}" y="${H - 6}" text-anchor="${anchor}" class="ax">${dm(s.perDay[k].day)}</text>`);
  }
  return `<svg class="stchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Số phút đọc mỗi ngày, chia Máy tính và iPhone">${parts.join('')}</svg>`;
}

export function statsPage(s: Stats, period: number) {
  const totalSec = s.total.web + s.total.iphone;
  const avgSec = totalSec / s.days;
  const avgArt = s.total.articles / s.days;
  const maxCh = Math.max(1, ...s.channels.map((c) => c.seconds));
  const dev = (['web', 'iphone'] as const).map((d) => ({ d, sec: s.total[d], pct: totalSec ? Math.round((s.total[d] / totalSec) * 100) : 0 }));
  const body = html`
<style>
.stseg{display:flex;align-items:center;gap:.6em;flex-wrap:nowrap}
.tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.6em;margin:.6em 0 1.2em}
.tile{border:1px solid var(--line);border-radius:10px;padding:.7em .8em;background:#fff}
.tile b{display:block;font-size:1.7em;line-height:1.15;font-weight:700;color:var(--ink)}
.tile span{font-size:.82em;color:var(--mut)}
.devrow{display:grid;grid-template-columns:6.5em 1fr;gap:.2em .8em;align-items:center;margin:.55em 0}
.devbar{height:12px;border-radius:6px;background:var(--line);overflow:hidden}
.devbar i{display:block;height:100%;border-radius:6px}
.devrow .meta{grid-column:2}
.sw{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:.4em;vertical-align:baseline}
.stchart{width:100%;height:auto;display:block;touch-action:manipulation}
.stchart .ax{font-size:11px;fill:#56626E;font-family:inherit}
.stchart .hit:hover{fill:rgba(10,111,176,.06)}
#sttip{min-height:1.4em;font-size:.88em;color:var(--ink);margin:.3em 0 0}
.legend{display:flex;gap:1.2em;font-size:.88em;color:var(--mut);margin:.2em 0 .4em}
.chrow{padding:.55em 0;border-bottom:1px solid var(--line)}
.chrow .top{display:flex;justify-content:space-between;gap:1em}
.chrow .bar{height:6px;border-radius:3px;background:${COLOR.web};margin-top:.35em}
.toplist{margin:.3em 0 0;padding-left:1.3em}
.toplist li{margin:.45em 0}
.daytab{width:100%;border-collapse:collapse;font-size:.9em}
.daytab td,.daytab th{padding:.35em .3em;border-bottom:1px solid var(--line);text-align:right}
.daytab td:first-child,.daytab th:first-child{text-align:left}
@media (max-width:480px){.tile b{font-size:1.35em}.tile{padding:.6em}}
</style>
<section class="cols">
  <div class="colmain" style="max-width:760px">
    <div class="sh one"><h2>Thống kê đọc</h2><span class="seg sm" role="group" aria-label="Khoảng thời gian">${PERIODS.map((p) => html`<a class="${p === period ? 'on' : ''}" href="/hoc-tap/thong-ke${p === 7 ? '' : `?ky=${p}`}">${p} ngày</a>`)}</span></div>
    <div class="meta">Từ ${dm(s.from)} đến hôm nay · trung bình tính trên ${s.days} ngày${s.since ? html` · đo thời gian từ ${dm(s.since)}` : ''}</div>

    <div class="tiles">
      <div class="tile"><b>${num(avgArt)}</b><span>bài đọc / ngày</span></div>
      <div class="tile"><b>${fmtShort(avgSec)}</b><span>đọc / ngày</span></div>
      <div class="tile"><b>${fmtShort(totalSec)}</b><span>tổng ${period} ngày · ${s.total.articles} bài</span></div>
    </div>

    <div class="sh"><h2>Máy tính và iPhone</h2></div>
    ${dev.map(({ d, sec, pct }) => html`<div class="devrow"><span><span class="sw" style="background:${COLOR[d]}"></span>${DEVICE_LABEL[d]}</span>
      <div class="devbar" role="img" aria-label="${DEVICE_LABEL[d]} ${pct}%"><i style="width:${pct}%;background:${COLOR[d]}"></i></div>
      <span class="meta">${fmtDur(sec)} · ${pct}% · trung bình ${fmtDur(sec / s.days)}/ngày</span></div>`)}

    <div class="sh" style="margin-top:1.2em"><h2>Từng ngày</h2></div>
    <div class="legend"><span><span class="sw" style="background:${COLOR.web}"></span>Máy tính</span><span><span class="sw" style="background:${COLOR.iphone}"></span>iPhone</span><span>· số phút mỗi ngày</span></div>
    ${raw(dayChart(s))}
    <p id="sttip" class="meta">Chạm vào một cột để xem số liệu ngày đó.</p>
    <details style="margin:.4em 0 1.2em"><summary class="meta">Xem dạng bảng</summary>
      <table class="daytab"><thead><tr><th>Ngày</th><th>Bài</th><th>Máy tính</th><th>iPhone</th></tr></thead><tbody>
      ${[...s.perDay].reverse().map((d) => html`<tr><td>${dm(d.day)}</td><td>${d.articles}</td><td>${fmtDur(d.web)}</td><td>${fmtDur(d.iphone)}</td></tr>`)}
      </tbody></table></details>

    <div class="sh"><h2>Theo chủ đề</h2></div>
    ${s.channels.map((c) => html`<div class="chrow"><div class="top"><span>${c.label}</span><span class="meta">${c.articles ? `${c.articles} bài · ` : ''}${fmtDur(c.seconds)}</span></div><div class="bar" style="width:${Math.round((c.seconds / maxCh) * 100)}%;opacity:${c.seconds ? 1 : 0}"></div></div>`)}

    ${s.top.length ? html`<div class="sh" style="margin-top:1.2em"><h2>Đọc lâu nhất</h2></div>
    <ol class="toplist">${s.top.map((t) => html`<li><a href="${t.kind === 'capture' ? `/hoc-tap/hop-nhat/${t.id}` : `/hoc-tap/bai/${t.id}`}">${t.title}</a> <span class="meta">· ${fmtDur(t.seconds)}</span></li>`)}</ol>` : ''}

    <p class="meta" style="margin-top:1.4em;line-height:1.6">Cách tính: chỉ đếm lúc trang MyLife đang mở trên màn hình và anh có thao tác (cuộn, chạm, gõ, rê chuột) trong 90 giây gần nhất, hoặc đang bật “Đọc bài”; để máy đứng yên không tính. Một bài tính là đã đọc khi mở đọc từ ${READ_SECONDS} giây, hoặc khi anh bấm “Đã đọc”. iPad và trình duyệt khác được tính chung vào Máy tính.</p>
  </div>
</section>
<script>(function(){var t=document.getElementById('sttip');document.querySelectorAll('.stchart .hit').forEach(function(r){function s(){t.textContent=r.getAttribute('data-tip')}r.addEventListener('click',s);r.addEventListener('mouseenter',s)})})()</script>`;
  return page({ title: 'Thống kê đọc', tab: 'g2', sub: g2Sub('stats'), body });
}
