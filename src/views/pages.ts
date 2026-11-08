import type { ItemRow, SourceRow } from '../types';
import { CHANNELS, CHANNEL_ORDER, timeAgoVi } from '../util';
import { g2Sub, html, page } from './layout';
import type { quotaSnapshot } from '../ai/quota';

type Quota = Awaited<ReturnType<typeof quotaSnapshot>>;

const title = (it: ItemRow) => it.title_vi || it.title_en;

function statusBadge(it: ItemRow) {
  if (it.status === 'summarized') return html`<span class="st ai">Tóm tắt AI</span>`;
  if (it.status === 'failed') return html`<span class="st err">Lỗi tóm tắt · xem bản gốc</span>`;
  return html`<span class="st wait">Chờ hạn mức · đang hiện bản gốc</span>`;
}

function summaryText(it: ItemRow) {
  if (it.summary_vi) return it.summary_vi;
  const a = (it.abstract_en ?? '').slice(0, 260);
  return a ? `${a}${(it.abstract_en ?? '').length > 260 ? '…' : ''}` : '';
}

function itemActions(it: ItemRow, back: string) {
  return html`<div class="acts">
  <span class="meta">${it.source_name} · ${timeAgoVi(it.published_at)}${it.read_minutes ? ` · ${it.read_minutes} phút` : ''}</span>
  <a href="/hoc-tap/bai/${it.id}">Đọc</a>
  <a href="${it.url}" target="_blank" rel="noopener">Bài gốc ↗</a>
  <form class="inline" method="post" action="/hoc-tap/bai/${it.id}/giu"><input type="hidden" name="back" value="${back}"><button class="l" type="submit">${it.kept ? 'Đã giữ ✓' : 'Giữ'}</button></form>
  <form class="inline" method="post" action="/hoc-tap/bai/${it.id}/bo"><input type="hidden" name="back" value="${back}"><button class="l mut" type="submit" style="color:var(--mut)">Không quan tâm</button></form>
</div>`;
}

function readRow(it: ItemRow, back: string) {
  return html`<article class="rw">
  <span class="score" aria-label="Điểm đáng đọc">${it.score}</span>
  <div style="display:flex;flex-direction:column;gap:.3em;min-width:0;flex:1">
    <div style="display:flex;gap:.6em;align-items:center;flex-wrap:wrap"><span class="kick">${CHANNELS[it.channel].name}</span>${it.status === 'summarized' ? '' : statusBadge(it)}</div>
    <a class="t2" href="/hoc-tap/bai/${it.id}">${title(it)}</a>
    <p class="sum">${summaryText(it)}</p>
    ${itemActions(it, back)}
  </div>
</article>`;
}

function quotaBox(q: Quota, pending: number) {
  const shown = q.filter((x) => ['gemini', 'workers_ai', 'azure', 'deepl', 'google_tr', 'google_tts'].includes(x.provider));
  return html`<div class="box">
  <span class="kick">Hạn mức dịch miễn phí</span>
  ${shown.map(
    (x) => html`<div class="kv"><span>${x.label} · ${x.scope === 'ngày' ? 'hôm nay' : 'tháng này'}</span><span class="mut">${x.used.toLocaleString('vi-VN')}/${x.limit.toLocaleString('vi-VN')} ${x.unit}</span></div><div class="bar"><i class="${x.pct >= 90 ? 'warn' : ''}" style="width:${x.pct}%"></i></div>`
  )}
  <span class="meta">Tự dừng ở 95% · hết thì hiện bản gốc tiếng Anh · ${pending} bài đang chờ tóm tắt</span>
  <a class="meta" href="/hoc-tap/han-muc" style="color:var(--ac);font-weight:600">Chi tiết nguồn &amp; hạn mức ›</a>
</div>`;
}

export function homePage(p: { picks: ItemRow[]; byChannel: Record<string, ItemRow[]>; quota: Quota; pending: number; weekly: Record<string, number> }) {
  const body = html`
<section class="cols">
  <div class="colmain">
    <div class="sh"><h2>Đáng đọc hôm nay · ${p.picks.length} bài</h2><span class="meta">chọn lúc 06:30 · xếp theo điểm</span></div>
    ${p.picks.length
      ? p.picks.map((it) => readRow(it, '/hoc-tap'))
      : html`<div class="empty">Chưa có bài cho hôm nay. Hệ thống chọn lúc 06:30; nếu vừa cài đặt, vào <a href="/hoc-tap/han-muc" style="color:var(--ac)">Nguồn &amp; hạn mức</a> và bấm “Chạy ngay”.</div>`}
  </div>
  <aside class="colside">
    <div class="box">
      <span class="kick">KPI G2.2 · 7 ngày qua</span>
      ${CHANNEL_ORDER.map((c) => {
        const n = p.weekly[c] ?? 0;
        return html`<div class="kv"><span>${CHANNELS[c].short}</span><span class="mut">${n}/5 bài tóm tắt</span></div><div class="bar"><i style="width:${Math.min(100, n * 20)}%"></i></div>`;
      })}
    </div>
    ${quotaBox(p.quota, p.pending)}
    <div class="box"><span class="kick">Sắp có</span><span class="meta">Hộp nhặt, Bản tin tuần, Nghe, Sổ tay sẽ mở ở các chặng tiếp theo của V1.</span></div>
  </aside>
</section>
<section class="grid4">
  ${CHANNEL_ORDER.map(
    (c) => html`<div>
    <div class="sh"><h2>${CHANNELS[c].short}</h2><a class="more" href="/hoc-tap/kenh/${CHANNELS[c].slug}">Xem tất cả ›</a></div>
    ${(p.byChannel[c] ?? []).length
      ? (p.byChannel[c] ?? []).map(
          (it) => html`<div class="li"><a class="t3" href="/hoc-tap/bai/${it.id}">${title(it)}</a><span class="meta">${it.source_name} · ${timeAgoVi(it.published_at)}</span></div>`
        )
      : html`<div class="meta">Chưa có bài.</div>`}
  </div>`
  )}
</section>`;
  return page({ title: 'Học tập AI', tab: 'g2', sub: g2Sub('today'), body });
}

export function channelPage(p: { channel: keyof typeof CHANNELS; items: ItemRow[]; pageNo: number; hasMore: boolean }) {
  const ch = CHANNELS[p.channel];
  const back = `/hoc-tap/kenh/${ch.slug}?trang=${p.pageNo}`;
  const body = html`
<section class="cols">
  <div class="colmain">
    <div class="sh"><h2>${ch.name}</h2><span class="meta">mới nhất trước · trang ${p.pageNo}</span></div>
    ${p.items.length ? p.items.map((it) => readRow(it, back)) : html`<div class="empty">Chưa có bài trong kênh này.</div>`}
    <div class="pager">
      ${p.pageNo > 1 ? html`<a class="btn2" href="/hoc-tap/kenh/${ch.slug}?trang=${p.pageNo - 1}">‹ Mới hơn</a>` : html`<span></span>`}
      ${p.hasMore ? html`<a class="btn2" href="/hoc-tap/kenh/${ch.slug}?trang=${p.pageNo + 1}">Cũ hơn ›</a>` : ''}
    </div>
  </div>
</section>`;
  return page({ title: ch.name, tab: 'g2', sub: g2Sub(p.channel), body });
}

export function itemPage(it: ItemRow) {
  let points: string[] = [];
  try { points = it.points_vi ? JSON.parse(it.points_vi) : []; } catch { points = []; }
  const body = html`
<section class="cols">
  <article class="colmain" style="max-width:780px">
    <div class="meta"><a href="/hoc-tap">Học tập AI</a> › <a href="/hoc-tap/kenh/${CHANNELS[it.channel].slug}">${CHANNELS[it.channel].short}</a></div>
    <div style="display:flex;gap:.6em;align-items:center;flex-wrap:wrap;margin-top:.8em"><span class="kick">${CHANNELS[it.channel].name} · Điểm ${it.score}</span>${statusBadge(it)}</div>
    <h1 class="t1" style="margin-top:.35em">${title(it)}</h1>
    ${it.title_vi ? html`<div style="font-style:italic;color:#3E4A56;margin-top:.3em">${it.title_en}</div>` : ''}
    <div class="meta" style="margin-top:.5em">${it.authors ? `${it.authors} · ` : ''}${it.source_name} · đăng ${timeAgoVi(it.published_at)}${it.engine ? ` · tóm tắt bằng ${it.engine === 'gemini' ? 'Gemini' : 'Workers AI'}` : ''}</div>
    ${it.summary_vi
      ? html`<div class="box" style="margin:1.2em 0;background:var(--tint);border-color:var(--tintb)">
      <span class="kick">Tóm tắt nhanh do AI viết</span>
      <p class="sum" style="font-size:1.05em">${it.summary_vi}</p>
      ${points.length ? html`<ul style="margin:0;padding-left:1.2em;line-height:1.6">${points.map((x) => html`<li>${x}</li>`)}</ul>` : ''}
      ${it.why_vi ? html`<div class="why"><b>Vì sao đáng chú ý:</b> ${it.why_vi}</div>` : ''}
    </div>`
      : html`<div class="box" style="margin:1.2em 0;background:#FDF6F0;border-color:#F3D6C3"><span class="st wait" style="align-self:flex-start">Chờ hạn mức dịch</span><span>Bài chưa có tóm tắt tiếng Việt (hết hạn mức miễn phí hoặc đang xếp hàng). Phần dưới là mô tả gốc tiếng Anh.</span></div>`}
    <div class="sh" style="margin-top:1.4em"><h2>Mô tả gốc (tiếng Anh)</h2></div>
    <p class="sum" style="font-size:1.05em;line-height:1.7">${it.abstract_en || 'Nguồn không cung cấp mô tả.'}</p>
    <div class="box" style="margin-top:1.4em;background:#F4F5F7;border:0">
      <span class="meta"><b>Toàn văn &amp; bản dịch toàn văn</b> sẽ có ở Chặng 2 (lấy toàn văn về MyLife). Hiện tại: <a href="${it.url}" target="_blank" rel="noopener" style="color:var(--ac);font-weight:600">mở bài gốc ↗</a></span>
    </div>
    <div class="acts" style="margin-top:1.2em">
      <form class="inline" method="post" action="/hoc-tap/bai/${it.id}/giu"><input type="hidden" name="back" value="/hoc-tap/bai/${it.id}"><button class="btn" type="submit">${it.kept ? 'Đã giữ ✓' : 'Giữ bài này'}</button></form>
      <form class="inline" method="post" action="/hoc-tap/bai/${it.id}/bo"><input type="hidden" name="back" value="/hoc-tap"><button class="btn2" type="submit">Không quan tâm</button></form>
    </div>
  </article>
</section>`;
  return page({ title: title(it), tab: 'g2', sub: g2Sub(it.channel), body });
}

export function quotaPage(p: { quota: Quota; sources: SourceRow[]; jobs: { job: string; started_at: string; ok: number; detail: string }[]; pending: number; hasGemini: boolean }) {
  const body = html`
${p.hasGemini ? '' : html`<div class="box" style="background:#FDF6F0;border-color:#F3D6C3"><b>Chưa có GEMINI_API_KEY.</b><span class="meta">Tóm tắt đang chạy bằng Workers AI (nếu còn hạn mức). Thêm key: <code>npx wrangler secret put GEMINI_API_KEY</code></span></div>`}
<section class="cols">
  <div class="colmain">
    <div class="sh"><h2>Hạn mức miễn phí</h2><span class="meta">tự dừng ở 95%</span></div>
    <div class="scroll"><table class="tbl"><thead><tr><th>Dịch vụ</th><th>Kỳ</th><th>Đã dùng</th><th>Hạn mức</th><th>%</th></tr></thead><tbody>
    ${p.quota.map((x) => html`<tr><td>${x.label}</td><td>${x.scope}</td><td>${x.used.toLocaleString('vi-VN')} ${x.unit}</td><td>${x.limit.toLocaleString('vi-VN')}</td><td>${x.pct}%</td></tr>`)}
    </tbody></table></div>
    <div class="sh" style="margin-top:1.6em"><h2>Nguồn · ${p.sources.length}</h2><span class="meta">bật/tắt trong bảng sources (D1)</span></div>
    <div class="scroll"><table class="tbl"><thead><tr><th>Nguồn</th><th>Kênh</th><th>Loại</th><th>Lần chạy</th><th>Trạng thái</th><th>Bài</th></tr></thead><tbody>
    ${p.sources.map(
      (s) => html`<tr><td>${s.name}${s.enabled ? '' : html` <span class="st err">tắt</span>`}</td><td>${CHANNELS[s.channel].short}</td><td>${s.kind}</td><td class="meta">${s.last_run_at ? timeAgoVi(s.last_run_at) : 'chưa chạy'}</td><td>${s.last_error ? html`<span class="st err" title="${s.last_error}">${s.last_error.slice(0, 40)}</span>` : s.last_run_at ? html`<span class="st ok">OK</span>` : '—'}</td><td>${s.item_count}</td></tr>`
    )}
    </tbody></table></div>
  </div>
  <aside class="colside">
    <div class="box">
      <span class="kick">Chạy ngay</span>
      <span class="meta">${p.pending} bài đang chờ tóm tắt</span>
      ${[
        ['crawl-rss', 'Crawl RSS (mỗi 6 giờ)'],
        ['crawl-arxiv', 'Crawl arXiv (06:00 hằng ngày)'],
        ['summarize', 'Tóm tắt 1 lô 8 bài'],
        ['picks', 'Chọn 5 bài Đáng đọc'],
      ].map(([id, label]) => html`<form method="post" action="/admin/run/${id}"><button class="btn2" style="width:100%" type="submit">${label}</button></form>`)}
    </div>
    <div class="box">
      <span class="kick">Nhật ký gần đây</span>
      ${p.jobs.length
        ? p.jobs.map((j) => html`<div class="li"><span><span class="st ${j.ok ? 'ok' : 'err'}">${j.job}</span> <span class="meta">${timeAgoVi(j.started_at)}</span></span><span class="meta" style="white-space:pre-line">${j.detail.slice(0, 300)}</span></div>`)
        : html`<span class="meta">Chưa có lần chạy nào.</span>`}
    </div>
  </aside>
</section>`;
  return page({ title: 'Nguồn & hạn mức', tab: 'g2', sub: g2Sub('quota'), body });
}

const SOON: Record<string, [string, string, string]> = {
  'cong-viec': ['Công việc', 'g1', 'Săn cơ hội ngân hàng: tin, orgchart, cơ hội, hồ sơ ngân hàng.'],
  'tai-chinh': ['Tài chính', 'g3', 'Dòng tiền, đầu tư, mục tiêu tài chính (không gian riêng tư).'],
  'gia-dinh': ['Gia đình', 'g4', 'Hai con theo giai đoạn, lịch thăm bố mẹ hai bên.'],
  'du-an': ['Dự án', 'g5', 'Pipeline 6 AI agent, phát hành.'],
  'hop-nhat': ['Hộp nhặt', 'g2', 'Chặng 3: nhặt bài từ Facebook/web bằng link + ảnh chụp, Phím tắt iPhone.'],
  'ban-tin': ['Bản tin tuần', 'g2', 'Chặng 4: bản tin soạn 20:00 Chủ nhật, gửi email 06:30 thứ Hai.'],
  'so-tay': ['Sổ tay', 'g2', 'Chặng 3: lưu bài, ghi chú, đánh dấu.'],
  nghe: ['Nghe', 'g2', 'Chặng 4: giọng đọc tiếng Việt, chế độ lái xe.'],
};

export function soonPage(key: string) {
  const [name, tab, desc] = SOON[key] ?? ['Sắp có', 'home', ''];
  const body = html`<div class="box" style="max-width:640px"><span class="kick">Sắp có</span><h1 class="t1">${name}</h1><p class="sum">${desc}</p><a class="btn" href="/hoc-tap" style="align-self:flex-start">Về Học tập AI</a></div>`;
  return page({ title: name, tab, sub: tab === 'g2' ? g2Sub(key === 'hop-nhat' ? 'inbox' : key === 'ban-tin' ? 'news' : key === 'so-tay' ? 'notes' : 'listen') : undefined, body });
}
