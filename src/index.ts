import { Hono } from 'hono';
import type { Env } from './types';
import { quotaSnapshot } from './ai/quota';
import type { ItemRow } from './types';
import { allSources, getItem, latestByChannel, livePicks, readItems, recentJobs, weeklyCounts, type SortMode } from './db';
import { channelPage, homePage, quotaPage, readPage, soonPage } from './views/pages';
import { CSS } from './views/layout';
import { READER_CSS, readerPage, type Lang } from './views/reader';
import { SPEAK_CSS } from './views/speak';
import { CAPTURE_CSS, capturePage, inboxPage, notebookPage } from './views/capture';
import { olderCaptures, captureImages, createCapture, firstUrl, getCapture, imageData, listCaptures, processCapture, validateCapture, type NewCapture } from './capture';
import { ensureFullText, translateStep, viewOf } from './fulltext';
import { QuotaExhausted } from './ai/providers';
import { JOBS, runJob } from './jobs';
import { thumbSvg } from './views/thumb';
import { APPLE_TOUCH_PNG_B64, ICON_192_PNG_B64, ICON_512_PNG_B64 } from './icon-png';
import { appIconSvg, FAVICON_SVG } from './brand';
import { CHANNEL_ORDER, channelBySlug, vnDay } from './util';
import { ensureSchema } from './schema';

const app = new Hono<{ Bindings: Env }>();

/* ---------- Tài nguyên tĩnh (không cần đăng nhập để iPhone tải được biểu tượng) ---------- */
const pngBody = (b64: string) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
const IMG_CACHE = 'public, max-age=604800';

app.get('/app.css', (c) => c.body(CSS + READER_CSS + CAPTURE_CSS + SPEAK_CSS, 200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }));
// Logo "Sao dẫn đường" (phương án 5): xem src/brand.ts
app.get('/icon.svg', (c) => c.body(appIconSvg(true), 200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': IMG_CACHE }));
app.get('/favicon.svg', (c) => c.body(FAVICON_SVG, 200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': IMG_CACHE }));
app.get('/apple-touch-icon.png', (c) => c.body(pngBody(APPLE_TOUCH_PNG_B64), 200, { 'Content-Type': 'image/png', 'Cache-Control': IMG_CACHE }));
app.get('/icon-192.png', (c) => c.body(pngBody(ICON_192_PNG_B64), 200, { 'Content-Type': 'image/png', 'Cache-Control': IMG_CACHE }));
app.get('/icon-512.png', (c) => c.body(pngBody(ICON_512_PNG_B64), 200, { 'Content-Type': 'image/png', 'Cache-Control': IMG_CACHE }));
app.get('/manifest.webmanifest', (c) =>
  c.json({
    name: 'MyLife',
    short_name: 'MyLife',
    start_url: '/hoc-tap',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/apple-touch-icon.png?v=5', sizes: '180x180', type: 'image/png' },
      { src: '/icon-192.png?v=5', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png?v=5', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      { src: '/icon.svg?v=5', sizes: 'any', type: 'image/svg+xml' },
    ],
  })
);
// Service worker tối thiểu: cho phép cài lên màn hình chính, luôn lấy bản mới từ mạng.
app.get('/sw.js', (c) =>
  c.body(`self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('activate',e=>self.clients.claim());self.addEventListener('fetch',()=>{});`, 200, {
    'Content-Type': 'text/javascript',
    'Cache-Control': 'no-cache',
  })
);
// Ảnh đại diện tự vẽ cho nguồn không có thumbnail: /thumb/<mã nguồn>.svg
app.get('/thumb/:id{[a-z0-9-]+\\.svg}', async (c) => {
  const id = c.req.param('id').replace(/\.svg$/, '');
  const src = c.env.DB ? await c.env.DB.prepare('SELECT name, channel FROM sources WHERE id = ?').bind(id).first<{ name: string; channel: string }>().catch(() => null) : null;
  return c.body(thumbSvg(src?.name ?? 'MyLife', c.req.query('ch') || src?.channel || 'ai'), 200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
});
// Nhãn "NEW" cho bài vừa về (ảnh SVG, trình duyệt lưu đệm 1 ngày)
const NEW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 26" width="64" height="26"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF3B5C"/><stop offset="1" stop-color="#FF8A00"/></linearGradient></defs><rect x="1" y="1" width="62" height="24" rx="12" fill="url(#g)"/><rect x="1" y="1" width="62" height="11" rx="6" fill="#fff" opacity=".18"/><path d="M13 6.2l1.5 4.3 4.3 1.5-4.3 1.5L13 17.8l-1.5-4.3L7.2 12l4.3-1.5z" fill="#fff"/><text x="38.5" y="17.6" font-family="Arial Black,Arial,Helvetica,sans-serif" font-size="12.5" font-weight="900" fill="#fff" text-anchor="middle" letter-spacing=".6">NEW</text></svg>`;
app.get('/new.svg', (c) => c.body(NEW_SVG, 200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' }));
app.get('/robots.txt', (c) => c.text('User-agent: *\nDisallow: /\n'));

/* ---------- Bảo vệ: chỉ chủ sở hữu (qua Cloudflare Access) ---------- */
app.use('*', async (c, next) => {
  c.header('X-Robots-Tag', 'noindex, nofollow');
  if (c.env.DEV_SKIP_AUTH === '1') { await ensureSchema(c.env); return next(); }
  // Phím tắt iPhone gọi /api/* bằng Service Token của Cloudflare Access (không có email).
  // Access chỉ cho qua khi token đúng và luôn gắn header JWT; Worker không mở qua workers.dev nên không ai đi vòng được.
  if (new URL(c.req.url).pathname.startsWith('/api/')) {
    if (!c.req.header('Cf-Access-Jwt-Assertion')) return c.json({ ok: false, error: 'Thiếu xác thực Cloudflare Access (Service Token)' }, 403);
    await ensureSchema(c.env);
    return next();
  }
  const email = c.req.header('Cf-Access-Authenticated-User-Email');
  if (!email || email.toLowerCase() !== c.env.OWNER_EMAIL.toLowerCase()) {
    return c.text('Không có quyền truy cập. Trang này chỉ dành cho chủ sở hữu (qua Cloudflare Access).', 403);
  }
  await ensureSchema(c.env);
  return next();
});

/**
 * Số bài mới về hôm nay (giờ VN) mà anh chưa đọc, gắn cạnh tên tab kênh: "AI thế giới (10)".
 * Trang chỉ để chỗ <!--cnt:kênh-->, ở đây điền số bằng 1 truy vấn cho cả 4 kênh.
 */
app.use('/hoc-tap*', async (c, next) => {
  await next();
  if (c.req.method !== 'GET' || !c.res.headers.get('Content-Type')?.includes('text/html')) return;
  const body = await c.res.text();
  if (!body.includes('<!--cnt:')) { c.res = new Response(body, c.res); return; }
  const startVn = new Date(`${vnDay()}T00:00:00+07:00`).toISOString();
  // Số hiện = bài mới về hôm nay − bài anh đã bấm Đã đọc hôm nay trong kênh đó (kể cả bài về từ hôm trước), tối thiểu 0.
  const { results } = await c.env.DB.prepare(
    `SELECT channel,
            SUM(CASE WHEN fetched_at >= ?1 AND dismissed = 0 THEN 1 ELSE 0 END) AS fresh,
            SUM(CASE WHEN read_at >= ?1 THEN 1 ELSE 0 END) AS readToday
     FROM items WHERE fetched_at >= ?1 OR read_at >= ?1 GROUP BY channel`
  ).bind(startVn).all<{ channel: string; fresh: number; readToday: number }>();
  const cnt = Object.fromEntries(results.map((r) => [r.channel, Math.max(0, r.fresh - r.readToday)]));
  const inbox = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM captures WHERE archived = 0').first<{ n: number }>().catch(() => null);
  cnt.inbox = inbox?.n ?? 0;
  // Sổ tay = mục nhặt đã lưu + bài đã Giữ (không tính bài tạo từ Hộp nhặt, vì đã tính ở mục nhặt) — giống trang Sổ tay.
  const notes = await c.env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM captures WHERE kept = 1) + (SELECT COUNT(*) FROM items WHERE kept = 1 AND source_id <> 'manual') AS n`
  ).first<{ n: number }>().catch(() => null);
  cnt.notes = notes?.n ?? 0;
  const read = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM items WHERE read_at IS NOT NULL').first<{ n: number }>().catch(() => null);
  cnt.read = read?.n ?? 0;
  const out = body.replace(/<!--cnt:([a-z]+)-->/g, (_, ch: string) => {
    const n = cnt[ch] ?? 0;
    const tip = ch === 'inbox' ? 'Mục nhặt chưa xử lý' : ch === 'notes' ? 'Số mục trong Sổ tay' : ch === 'read' ? 'Tổng số bài đã đọc' : 'Bài mới về hôm nay trừ bài đã đọc hôm nay';
    return `<span class="cnt${n ? '' : ' z'}" title="${tip}">(${n})</span>`;
  });
  const headers = new Headers(c.res.headers);
  headers.delete('Content-Length');
  c.res = new Response(out, { status: c.res.status, headers });
});

/** Chặn POST từ trang khác (chống CSRF đơn giản). */
function sameOrigin(c: { req: { header: (n: string) => string | undefined; url: string } }) {
  const origin = c.req.header('Origin');
  return !origin || new URL(origin).host === new URL(c.req.url).host;
}

/* ---------- Trang ---------- */
app.get('/', (c) => c.redirect('/hoc-tap'));

const sortOf = (q: string | undefined): SortMode => (q === 'diem' ? 'diem' : 'moi');

app.get('/hoc-tap', async (c) => {
  const env = c.env;
  const sort = sortOf(c.req.query('xep'));
  const picks = await livePicks(env, sort);
  const byChannel: Record<string, Awaited<ReturnType<typeof latestByChannel>>> = {};
  const pickIds = new Set(picks.map((p) => p.id));
  for (const ch of CHANNEL_ORDER) byChannel[ch] = (await latestByChannel(env, ch, 60)).filter((i) => !pickIds.has(i.id)).slice(0, 4);
  return c.html(homePage({ picks, sort, byChannel, quota: await quotaSnapshot(env), weekly: await weeklyCounts(env) }));
});

app.get('/hoc-tap/kenh/:slug', async (c) => {
  const ch = channelBySlug(c.req.param('slug'));
  if (!ch) return c.notFound();
  const sort = sortOf(c.req.query('xep'));
  const pageNo = Math.max(1, Number(c.req.query('trang')) || 1);
  const rows = await latestByChannel(c.env, ch, 21, (pageNo - 1) * 20, sort);
  return c.html(channelPage({ channel: ch, items: rows.slice(0, 20), pageNo, hasMore: rows.length > 20, sort }));
});

app.get('/hoc-tap/bai/:id', async (c) => {
  const it = await getItem(c.env, Number(c.req.param('id')));
  if (!it) return c.notFound();
  // Mở bài → lấy toàn văn nếu chưa có. KHÔNG tự dịch: anh bấm "Dịch bài này" khi cần.
  const ft = await ensureFullText(c.env, it, 0);
  if (!ft) return c.text('Không đọc được toàn văn', 500);
  const v = viewOf(ft);
  const q = c.req.query('lang');
  const lang: Lang = q === 'en' || q === 'bi' || q === 'vi' ? q : v.translatedCount > 0 ? 'vi' : 'en';
  return c.html(readerPage(it, v, lang));
});

/** Một bước dịch do trang bài gọi: tối đa 8 lô, 4 lô chạy song song. Trả tiến độ dạng JSON. */
app.post('/hoc-tap/bai/:id{[0-9]+}/dich-buoc', async (c) => {
  if (!sameOrigin(c)) return c.json({ ok: false, error: 'Yêu cầu không hợp lệ' }, 400);
  const id = Number(c.req.param('id'));
  try {
    const r = await translateStep(c.env, id, 8, 4);
    return c.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof QuotaExhausted) return c.json({ ok: true, status: 'waiting_quota', done: 0, translated: 0, total: 0, rateLimited: false });
    return c.json({ ok: false, done: 0, translated: 0, total: 0, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

app.post('/hoc-tap/bai/:id/:action{lay-lai|dich-ai|dich}', async (c) => {
  if (!sameOrigin(c)) return c.text('Yêu cầu không hợp lệ', 400);
  const id = Number(c.req.param('id'));
  const action = c.req.param('action');
  if (action === 'lay-lai') {
    await c.env.DB.prepare(`DELETE FROM fulltexts WHERE item_id = ? AND status = 'fetch_failed'`).bind(id).run();
    return c.redirect(`/hoc-tap/bai/${id}`, 303);
  }
  // Chỉ đánh dấu; trang bài sẽ tự gọi /dich-buoc liên tục để dịch song song (translated_at = now để lịch 5 phút không dịch trùng).
  const now = new Date().toISOString();
  if (action === 'dich') await c.env.DB.prepare(`UPDATE fulltexts SET priority = 1, error = NULL, translated_at = ?, status = CASE WHEN status = 'waiting_quota' THEN 'partial' ELSE status END WHERE item_id = ?`).bind(now, id).run();
  if (action === 'dich-ai') await c.env.DB.prepare(`UPDATE fulltexts SET want_ai = 1, priority = 1, error = NULL, translated_at = ?, status = CASE WHEN status = 'translated' THEN 'partial' ELSE status END WHERE item_id = ?`).bind(now, id).run();
  return c.redirect(`/hoc-tap/bai/${id}`, 303);
});


app.post('/hoc-tap/bai/:id/:action{giu|bo|da-doc}', async (c) => {
  if (!sameOrigin(c)) return c.text('Yêu cầu không hợp lệ', 400);
  const id = Number(c.req.param('id'));
  const action = c.req.param('action');
  if (action === 'giu') await c.env.DB.prepare('UPDATE items SET kept = 1 - kept WHERE id = ?').bind(id).run();
  else if (action === 'da-doc') await c.env.DB.prepare('UPDATE items SET read_at = CASE WHEN read_at IS NULL THEN ? ELSE NULL END WHERE id = ?').bind(new Date().toISOString(), id).run();
  else await c.env.DB.prepare('UPDATE items SET dismissed = 1 WHERE id = ?').bind(id).run();
  const back = String((await c.req.parseBody()).back ?? '/hoc-tap');
  return c.redirect(back.startsWith('/') ? back : '/hoc-tap', 303);
});

app.get('/hoc-tap/da-doc', async (c) => {
  const pageNo = Math.max(1, Number(c.req.query('trang')) || 1);
  const rows = await readItems(c.env, 21, (pageNo - 1) * 20);
  const total = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM items WHERE read_at IS NOT NULL').first<{ n: number }>();
  return c.html(readPage({ items: rows.slice(0, 20), pageNo, hasMore: rows.length > 20, total: total?.n ?? 0 }));
});

app.get('/hoc-tap/han-muc', async (c) => {
  const { results: ft } = await c.env.DB.prepare('SELECT status, COUNT(*) AS n FROM fulltexts GROUP BY status').all<{ status: string; n: number }>();
  const keys = { gemini: !!c.env.GEMINI_API_KEY, workers_ai: !!c.env.AI, azure: !!c.env.AZURE_TRANSLATOR_KEY, deepl: !!c.env.DEEPL_API_KEY, google: !!c.env.GOOGLE_TRANSLATE_API_KEY, tts: !!c.env.GOOGLE_TTS_API_KEY };
  const lastTick = await c.env.DB.prepare(`SELECT started_at FROM jobs_log WHERE job = 'tick' ORDER BY id DESC LIMIT 1`).first<{ started_at: string }>();
  const requested = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM fulltexts WHERE priority = 1 AND status IN ('fetched','partial','waiting_quota')`).first<{ n: number }>();
  return c.html(quotaPage({ quota: await quotaSnapshot(c.env), sources: await allSources(c.env), jobs: await recentJobs(c.env, 15), lastTick: lastTick?.started_at ?? null, requested: requested?.n ?? 0, keys, fulltext: Object.fromEntries(ft.map((r) => [r.status, r.n])) }));
});


/* ---------- Chặng 3 · Hộp nhặt + Sổ tay ---------- */
async function readCaptureForm(fd: FormData, via: NewCapture['via']): Promise<NewCapture> {
  const text = String(fd.get('text') ?? ''); // Phím tắt có thể gửi cả đoạn chữ có link
  let url = String(fd.get('url') ?? '').trim() || firstUrl(text);
  if (url && !/^https?:\/\//i.test(url)) url = firstUrl(url) ?? url;
  const noteParts = [String(fd.get('note') ?? '').trim(), url ? text.replace(url, '').trim() : text.trim()].filter(Boolean);
  const images: NewCapture['images'] = [];
  for (const v of fd.getAll('image')) {
    if (typeof v === 'string' || !v.size) continue;
    images.push({ mime: v.type || 'image/jpeg', data: await v.arrayBuffer() });
  }
  return { title: String(fd.get('title') ?? '').trim() || undefined, url: url || undefined, note: [...new Set(noteParts)].join('\n') || undefined, channel: String(fd.get('channel') ?? ''), images, via };
}

app.get('/hoc-tap/hop-nhat', async (c) => {
  const showDone = c.req.query('xem') === 'xong';
  const items = await listCaptures(c.env, showDone ? 'c.archived = 1' : 'c.archived = 0', 100);
  const done = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM captures WHERE archived = 1').first<{ n: number }>();
  return c.html(inboxPage({ items, done: done?.n ?? 0, showDone }));
});

app.post('/hoc-tap/hop-nhat', async (c) => {
  const wantsJson = (c.req.header('Accept') ?? '').includes('application/json');
  if (!sameOrigin(c)) return c.json({ ok: false, error: 'Yêu cầu không hợp lệ' }, 400);
  const cap = await readCaptureForm(await c.req.formData(), 'web');
  const err = validateCapture(cap);
  if (err) return wantsJson ? c.json({ ok: false, error: err }, 400) : c.text(err, 400);
  const id = await createCapture(c.env, cap);
  c.executionCtx.waitUntil(processCapture(c.env, id).catch(() => ''));
  const url = `/hoc-tap/hop-nhat/${id}`;
  return wantsJson ? c.json({ ok: true, id, url }) : c.redirect(url, 303);
});

app.get('/hoc-tap/hop-nhat/:id{[0-9]+}', async (c) => {
  const cap = await getCapture(c.env, Number(c.req.param('id')));
  if (!cap) return c.notFound();
  const item = cap.item_id ? await getItem(c.env, cap.item_id) : null;
  return c.html(capturePage(cap, await captureImages(c.env, cap.id), item, await olderCaptures(c.env, cap)));
});

app.post('/hoc-tap/hop-nhat/:id{[0-9]+}/:action{so-tay|xong|xoa|ghi-chu|xu-ly-lai}', async (c) => {
  if (!sameOrigin(c)) return c.text('Yêu cầu không hợp lệ', 400);
  const id = Number(c.req.param('id'));
  const action = c.req.param('action');
  const body = await c.req.parseBody();
  const back = String(body.back ?? `/hoc-tap/hop-nhat/${id}`);
  const go = (u: string) => c.redirect(u.startsWith('/') ? u : '/hoc-tap/hop-nhat', 303);
  if (action === 'so-tay') await c.env.DB.prepare('UPDATE captures SET kept = 1 - kept WHERE id = ?').bind(id).run();
  if (action === 'xong') await c.env.DB.prepare('UPDATE captures SET archived = 1 - archived WHERE id = ?').bind(id).run();
  if (action === 'ghi-chu') {
    await c.env.DB.prepare('UPDATE captures SET note = ? WHERE id = ?').bind(String(body.note ?? '').trim().slice(0, 30000) || null, id).run();
    return go(`/hoc-tap/hop-nhat/${id}`);
  }
  if (action === 'xu-ly-lai') {
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE captures SET status = 'new', error = NULL WHERE id = ?`).bind(id),
    ]);
    c.executionCtx.waitUntil(processCapture(c.env, id).catch(() => ''));
    return go(`/hoc-tap/hop-nhat/${id}`);
  }
  if (action === 'xoa') {
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM capture_images WHERE capture_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM captures WHERE id = ?').bind(id),
    ]);
    return go('/hoc-tap/hop-nhat');
  }
  return go(back);
});

// Ảnh trong Hộp nhặt (lưu trong D1). Ảnh không đổi nên cho trình duyệt lưu đệm lâu.
app.get('/hoc-tap/anh/:id{[0-9]+}', async (c) => {
  const img = await imageData(c.env, Number(c.req.param('id')));
  if (!img) return c.notFound();
  return c.body(img.data.slice().buffer as ArrayBuffer, 200, { 'Content-Type': img.mime, 'Cache-Control': 'private, max-age=31536000, immutable' });
});

app.get('/hoc-tap/so-tay', async (c) => {
  const captures = await listCaptures(c.env, 'c.kept = 1', 200);
  const { results: items } = await c.env.DB.prepare(
    `SELECT i.*, s.name AS source_name FROM items i JOIN sources s ON s.id = i.source_id
     WHERE i.kept = 1 AND i.source_id <> 'manual' ORDER BY i.fetched_at DESC LIMIT 200`
  ).all<ItemRow>();
  return c.html(notebookPage({ captures, items }));
});

app.post('/hoc-tap/bai/:id{[0-9]+}/ghi-chu', async (c) => {
  if (!sameOrigin(c)) return c.text('Yêu cầu không hợp lệ', 400);
  const id = Number(c.req.param('id'));
  const note = String((await c.req.parseBody()).note ?? '').trim().slice(0, 5000) || null;
  // Có ghi chú thì tự "Giữ" bài để bài vào Sổ tay.
  await c.env.DB.prepare('UPDATE items SET note = ?, kept = CASE WHEN ? IS NOT NULL THEN 1 ELSE kept END WHERE id = ?').bind(note, note, id).run();
  return c.redirect(`/hoc-tap/bai/${id}`, 303);
});

/** Phím tắt iPhone "Gửi tới MyLife": multipart với url / text / note / channel / image (nhiều ảnh). */
app.post('/api/nhat', async (c) => {
  let cap: NewCapture;
  const ct = c.req.header('Content-Type') ?? '';
  if (ct.includes('application/json')) {
    const j = await c.req.json<{ title?: string; url?: string; text?: string; note?: string; channel?: string }>();
    const fd = new FormData();
    for (const k of ['title', 'url', 'text', 'note', 'channel'] as const) if (j[k]) fd.set(k, String(j[k]));
    cap = await readCaptureForm(fd, 'shortcut');
  } else {
    cap = await readCaptureForm(await c.req.formData(), 'shortcut');
  }
  const err = validateCapture(cap);
  if (err) return c.json({ ok: false, error: err }, 400);
  const id = await createCapture(c.env, cap);
  c.executionCtx.waitUntil(processCapture(c.env, id).catch(() => ''));
  return c.json({ ok: true, id, message: `Đã lưu vào Hộp nhặt (mục #${id}${cap.images.length ? `, ${cap.images.length} ảnh` : ''})`, url: `https://${new URL(c.req.url).host}/hoc-tap/hop-nhat/${id}` });
});

app.get('/sap-co/:key', (c) => c.html(soonPage(c.req.param('key'))));

app.post('/admin/run/:job', async (c) => {
  if (!sameOrigin(c)) return c.text('Yêu cầu không hợp lệ', 400);
  const job = c.req.param('job');
  if (!JOBS[job]) return c.notFound();
  c.executionCtx.waitUntil(runJob(c.env, job));
  return c.redirect('/hoc-tap/han-muc', 303);
});

app.notFound((c) => c.text('Không tìm thấy trang', 404));

/** Trang lỗi dễ hiểu (chỉ chủ sở hữu thấy, vì site nằm sau Cloudflare Access). */
app.onError((err, c) => {
  console.error('MyLife error:', err);
  const msg = err instanceof Error ? err.message : String(err);
  let hint = 'Chụp màn hình trang này gửi Claude để sửa.';
  if (/no such table/i.test(msg)) {
    hint = 'Các bảng dữ liệu trong D1 chưa được tạo. Cách sửa: Cloudflare → Storage & databases → D1 → mylife → Console, lần lượt dán và chạy nội dung 3 file migrations/0001_init.sql, 0002_sources.sql, 0003_fulltext.sql (trên GitHub repo mylife), rồi tải lại trang.';
  } else if (/D1|binding|DB/i.test(msg) && !c.env?.DB) {
    hint = 'Worker chưa được gắn cơ sở dữ liệu D1 (binding DB). Kiểm tra database_id trong wrangler.toml và deploy lại.';
  }
  const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
  return c.html(
    `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lỗi · MyLife</title></head>
<body style="font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.6;color:#14202B">
<h1 style="font-size:22px">MyLife gặp lỗi</h1>
<p><b>Cách xử lý:</b> ${esc(hint)}</p>
<p style="background:#F4F5F7;padding:12px;border-radius:6px;font-family:monospace;font-size:13px;white-space:pre-wrap;word-break:break-word">${esc(msg)}</p>
<p style="color:#56626E;font-size:13px">Đường dẫn: ${esc(new URL(c.req.url).pathname)}</p>
</body></html>`,
    500
  );
});

/* ---------- Việc chạy nền: 1 cron mỗi 5 phút chạy một "nhịp" nhỏ (xem src/jobs.ts) ---------- */
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(ensureSchema(env).then(() => runJob(env, 'tick')));
  },
} satisfies ExportedHandler<Env>;
