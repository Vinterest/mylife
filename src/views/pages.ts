import type { ItemRow, SourceRow } from '../types';
import { CHANNELS, CHANNEL_ORDER, timeAgoVi } from '../util';
import { g2Sub, html, page } from './layout';
import type { quotaSnapshot } from '../ai/quota';

type Quota = Awaited<ReturnType<typeof quotaSnapshot>>;

const title = (it: ItemRow) => it.title_en;

function snippet(it: ItemRow) {
  const a = (it.abstract_en ?? '').slice(0, 240);
  return a ? `${a}${(it.abstract_en ?? '').length > 240 ? '…' : ''}` : '';
}

/** Ảnh đại diện: thumbnail của nguồn; không có (hoặc ảnh lỗi) → ảnh tự vẽ theo tên nguồn. */
export function thumb(it: ItemRow, cls = '') {
  const fallback = `/thumb/${it.source_id}.svg`;
  return html`<a class="th ${cls}" href="/hoc-tap/bai/${it.id}" tabindex="-1" aria-hidden="true"><img src="${it.image_url || fallback}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${fallback}'"></a>`;
}

function itemActions(it: ItemRow, back: string) {
  return html`<div class="acts">
  <span class="meta">${it.source_name} · ${timeAgoVi(it.published_at)}${it.read_minutes ? ` · ${it.read_minutes} phút` : ''}</span>
  <a href="/hoc-tap/bai/${it.id}">Đọc toàn văn</a>
  <a href="${it.url}" target="_blank" rel="noopener">Bài gốc ↗</a>
  <form class="inline" method="post" action="/hoc-tap/bai/${it.id}/giu"><input type="hidden" name="back" value="${back}"><button class="l" type="submit">${it.kept ? 'Đã giữ ✓' : 'Giữ'}</button></form>
  <form class="inline" method="post" action="/hoc-tap/bai/${it.id}/bo"><input type="hidden" name="back" value="${back}"><button class="l mut" type="submit" style="color:var(--mut)">Không quan tâm</button></form>
</div>`;
}

function readRow(it: ItemRow, back: string) {
  return html`<article class="rw">
  ${thumb(it)}
  <div style="display:flex;flex-direction:column;gap:.3em;min-width:0;flex:1">
    <span class="kick">${CHANNELS[it.channel].name} · Điểm ${it.score}</span>
    <a class="t2" href="/hoc-tap/bai/${it.id}" lang="en">${title(it)}</a>
    <p class="sum" lang="en">${snippet(it)}</p>
    ${itemActions(it, back)}
  </div>
</article>`;
}

function quotaBox(q: Quota) {
  const shown = q.filter((x) => ['gemini', 'workers_ai', 'azure', 'deepl', 'google_tr', 'google_tts'].includes(x.provider));
  return html`<div class="box">
  <span class="kick">Hạn mức dịch miễn phí</span>
  ${shown.map(
    (x) => html`<div class="kv"><span>${x.label} · ${x.scope === 'ngày' ? 'hôm nay' : 'tháng này'}</span><span class="mut">${x.used.toLocaleString('vi-VN')}/${x.limit.toLocaleString('vi-VN')} ${x.unit}</span></div><div class="bar"><i class="${x.pct >= 90 ? 'warn' : ''}" style="width:${x.pct}%"></i></div>`
  )}
  <span class="meta">Chỉ dịch khi anh bấm “Dịch bài này” · quay vòng 50% rồi 95%, hết thì dừng</span>
  <a class="meta" href="/hoc-tap/han-muc" style="color:var(--ac);font-weight:600">Chi tiết nguồn &amp; hạn mức ›</a>
</div>`;
}

export function homePage(p: { picks: ItemRow[]; byChannel: Record<string, ItemRow[]>; quota: Quota; weekly: Record<string, number> }) {
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
      <span class="kick">Bài mới · 7 ngày qua</span>
      ${CHANNEL_ORDER.map((c) => {
        const n = p.weekly[c] ?? 0;
        return html`<div class="kv"><span>${CHANNELS[c].short}</span><span class="mut">${n} bài</span></div>`;
      })}
    </div>
    ${quotaBox(p.quota)}
    <div class="box"><span class="kick">Sắp có</span><span class="meta">Hộp nhặt, Bản tin tuần, Nghe, Sổ tay sẽ mở ở các chặng tiếp theo của V1.</span></div>
  </aside>
</section>
<section class="grid4">
  ${CHANNEL_ORDER.map(
    (c) => html`<div>
    <div class="sh"><h2>${CHANNELS[c].short}</h2><a class="more" href="/hoc-tap/kenh/${CHANNELS[c].slug}">Xem tất cả ›</a></div>
    ${(p.byChannel[c] ?? []).length
      ? (p.byChannel[c] ?? []).map((it, i) =>
          i === 0
            ? html`<div class="lead">${thumb(it, 'lg')}<a class="t3" href="/hoc-tap/bai/${it.id}" lang="en">${title(it)}</a><span class="meta">${it.source_name} · ${timeAgoVi(it.published_at)}</span></div>`
            : html`<div class="lix">${thumb(it, 'sm')}<div><a class="t3" href="/hoc-tap/bai/${it.id}" lang="en">${title(it)}</a><span class="meta">${it.source_name} · ${timeAgoVi(it.published_at)}</span></div></div>`
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

const FT_LABEL: Record<string, string> = { fetched: 'Đã lấy toàn văn (chưa dịch)', partial: 'Đang dịch dở', translated: 'Đã dịch xong', waiting_quota: 'Chờ hạn mức dịch', abstract_only: 'Chỉ có phần mô tả', fetch_failed: 'Lỗi lấy bài' };

export function quotaPage(p: { quota: Quota; sources: SourceRow[]; jobs: { job: string; started_at: string; ok: number; detail: string }[]; lastTick: string | null; requested: number; keys: Record<string, boolean>; fulltext: Record<string, number> }) {
  const lateMin = p.lastTick ? (Date.now() - new Date(p.lastTick).getTime()) / 60000 : Infinity;
  const body = html`
${lateMin > 20
  ? html`<div class="box" style="background:#FDF6F0;border-color:#F3D6C3;margin-bottom:1.2em"><b>Lịch tự động chưa chạy${p.lastTick ? ` (lần cuối ${timeAgoVi(p.lastTick)})` : ''}.</b><span class="meta">Bình thường cứ 5 phút chạy một nhịp. Kiểm tra Cloudflare → Workers &amp; Pages → mylife → Settings → Trigger events: phải có “*/5 * * * *”. Tài khoản miễn phí chỉ có 5 cron cho tất cả Worker — nếu Worker khác đã dùng hết thì xóa bớt.</span></div>`
  : html`<div class="box" style="margin-bottom:1.2em"><span><span class="st ok">Tự động OK</span> <span class="meta">nhịp gần nhất ${timeAgoVi(p.lastTick!)} · 5 phút/nhịp · mỗi nhịp crawl 1 nguồn đến hạn, lấy 1 toàn văn${p.requested ? ` · đang dịch ${p.requested} bài anh yêu cầu` : ''}</span></span></div>`}
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
      <span class="meta">Crawl lại = xếp mọi nguồn vào hàng; mỗi 5 phút chạy 1 nguồn (14 nguồn ≈ 70 phút).</span>
      ${[
        ['tick', 'Chạy 1 nhịp ngay'],
        ['crawl-rss', 'Crawl lại tất cả RSS'],
        ['crawl-arxiv', 'Crawl lại arXiv'],
        ['picks', 'Chọn lại 5 bài Đáng đọc'],
      ].map(([id, label]) => html`<form method="post" action="/admin/run/${id}"><button class="btn2" style="width:100%" type="submit">${label}</button></form>`)}
    </div>
    <div class="box">
      <span class="kick">Toàn văn</span>
      ${Object.keys(FT_LABEL).map((k) => html`<div class="kv"><span>${FT_LABEL[k]}</span><span class="mut">${p.fulltext[k] ?? 0}</span></div>`)}
    </div>
    <div class="box">
      <span class="kick">Key dịch vụ</span>
      ${[['gemini', 'Gemini (GEMINI_API_KEY)'], ['workers_ai', 'Workers AI (gắn sẵn, không cần key)'], ['azure', 'Azure (AZURE_TRANSLATOR_KEY)'], ['deepl', 'DeepL (DEEPL_API_KEY)'], ['google', 'Google Dịch (GOOGLE_TRANSLATE_API_KEY)'], ['tts', 'Giọng đọc (GOOGLE_TTS_API_KEY · Chặng 4)']].map(
        ([k, label]) => html`<div class="kv"><span>${label}</span>${p.keys[k] ? html`<span class="st ok">Đã có</span>` : html`<span class="st wait">Chưa có · bỏ qua</span>`}</div>`
      )}
      <span class="meta">Quay vòng Gemini → Workers AI → Azure → DeepL → Google: vòng 1 mỗi key dùng tới 50%, vòng 2 dùng tiếp tới 95% rồi dừng hẳn. Thiếu key nào thì bỏ qua.</span>
    </div>
    <div class="box">
      <span class="kick">Nhật ký gần đây</span>
      ${p.jobs.length
        ? p.jobs.map((j) => html`<div class="li"><span><span class="st ${j.detail === 'đang chạy…' ? 'wait' : j.ok ? 'ok' : 'err'}">${j.job === 'tick' ? 'nhịp tự động' : j.job}</span> <span class="meta">${timeAgoVi(j.started_at)}</span></span><span class="meta" style="white-space:pre-line">${j.detail.slice(0, 300)}</span></div>`)
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
