import { Hono } from 'hono';
import type { Env } from './types';
import { crawl } from './crawl';
import { summarizeBatch } from './ai/summarize';
import { quotaSnapshot } from './ai/quota';
import { makePicks } from './picks';
import { allSources, getItem, latestByChannel, logJob, pendingCount, picksForToday, recentJobs, weeklyCounts } from './db';
import { channelPage, homePage, quotaPage, soonPage } from './views/pages';
import { CSS } from './views/layout';
import { READER_CSS, readerPage, type Lang } from './views/reader';
import { cleanupFullTexts, ensureFullText, processFullTextQueue, translateItem, viewOf } from './fulltext';
import { APPLE_TOUCH_PNG_B64 } from './icon-png';
import { CHANNEL_ORDER, channelBySlug, vnDay } from './util';
import { ensureSchema } from './schema';

const app = new Hono<{ Bindings: Env }>();

/* ---------- Tài nguyên tĩnh (không cần đăng nhập để iPhone tải được biểu tượng) ---------- */
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0077B6"/><text x="32" y="44" font-family="Arial,Helvetica,sans-serif" font-size="36" font-weight="700" fill="#fff" text-anchor="middle">M</text></svg>`;

app.get('/app.css', (c) => c.body(CSS + READER_CSS, 200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }));
app.get('/icon.svg', (c) => c.body(ICON_SVG, 200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' }));
app.get('/apple-touch-icon.png', (c) => {
  const bin = Uint8Array.from(atob(APPLE_TOUCH_PNG_B64), (ch) => ch.charCodeAt(0));
  return c.body(bin, 200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
});
app.get('/manifest.webmanifest', (c) =>
  c.json({
    name: 'MyLife',
    short_name: 'MyLife',
    start_url: '/hoc-tap',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
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
app.get('/robots.txt', (c) => c.text('User-agent: *\nDisallow: /\n'));

/* ---------- Bảo vệ: chỉ chủ sở hữu (qua Cloudflare Access) ---------- */
app.use('*', async (c, next) => {
  c.header('X-Robots-Tag', 'noindex, nofollow');
  if (c.env.DEV_SKIP_AUTH === '1') { await ensureSchema(c.env); return next(); }
  const email = c.req.header('Cf-Access-Authenticated-User-Email');
  if (!email || email.toLowerCase() !== c.env.OWNER_EMAIL.toLowerCase()) {
    return c.text('Không có quyền truy cập. Trang này chỉ dành cho chủ sở hữu (qua Cloudflare Access).', 403);
  }
  await ensureSchema(c.env);
  return next();
});

/** Chặn POST từ trang khác (chống CSRF đơn giản). */
function sameOrigin(c: { req: { header: (n: string) => string | undefined; url: string } }) {
  const origin = c.req.header('Origin');
  return !origin || new URL(origin).host === new URL(c.req.url).host;
}

/* ---------- Trang ---------- */
app.get('/', (c) => c.redirect('/hoc-tap'));

app.get('/hoc-tap', async (c) => {
  const env = c.env;
  let picks = await picksForToday(env);
  if (!picks.length) {
    await makePicks(env); // lần đầu trong ngày chưa có lịch chọn → chọn ngay
    picks = await picksForToday(env);
  }
  const byChannel: Record<string, Awaited<ReturnType<typeof latestByChannel>>> = {};
  const pickIds = new Set(picks.map((p) => p.id));
  for (const ch of CHANNEL_ORDER) byChannel[ch] = (await latestByChannel(env, ch, 8)).filter((i) => !pickIds.has(i.id)).slice(0, 4);
  return c.html(homePage({ picks, byChannel, quota: await quotaSnapshot(env), pending: await pendingCount(env), weekly: await weeklyCounts(env) }));
});

app.get('/hoc-tap/kenh/:slug', async (c) => {
  const ch = channelBySlug(c.req.param('slug'));
  if (!ch) return c.notFound();
  const pageNo = Math.max(1, Number(c.req.query('trang')) || 1);
  const rows = await latestByChannel(c.env, ch, 21, (pageNo - 1) * 20);
  return c.html(channelPage({ channel: ch, items: rows.slice(0, 20), pageNo, hasMore: rows.length > 20 }));
});

app.get('/hoc-tap/bai/:id', async (c) => {
  const it = await getItem(c.env, Number(c.req.param('id')));
  if (!it) return c.notFound();
  // Anh mở bài → lấy toàn văn ngay (ưu tiên), dịch tiếp trong nền.
  const ft = await ensureFullText(c.env, it, 1);
  if (!ft) return c.text('Không đọc được toàn văn', 500);
  if (['fetched', 'partial', 'waiting_quota'].includes(ft.status)) {
    c.executionCtx.waitUntil(translateItem(c.env, it.id, 4).catch(() => 0));
  }
  const q = c.req.query('lang');
  const lang: Lang = q === 'en' || q === 'bi' ? q : 'vi';
  return c.html(readerPage(it, viewOf(ft), lang));
});

app.post('/hoc-tap/bai/:id/:action{xep-hang|dich-ai|lay-lai}', async (c) => {
  if (!sameOrigin(c)) return c.text('Yêu cầu không hợp lệ', 400);
  const id = Number(c.req.param('id'));
  const action = c.req.param('action');
  if (action === 'xep-hang') await c.env.DB.prepare('UPDATE fulltexts SET priority = 1 WHERE item_id = ?').bind(id).run();
  if (action === 'dich-ai') await c.env.DB.prepare(`UPDATE fulltexts SET want_ai = 1, priority = 1, status = CASE WHEN status = 'translated' THEN 'partial' ELSE status END WHERE item_id = ?`).bind(id).run();
  if (action === 'lay-lai') await c.env.DB.prepare(`DELETE FROM fulltexts WHERE item_id = ? AND status = 'fetch_failed'`).bind(id).run();
  return c.redirect(`/hoc-tap/bai/${id}`, 303);
});

app.post('/hoc-tap/bai/:id/:action{giu|bo}', async (c) => {
  if (!sameOrigin(c)) return c.text('Yêu cầu không hợp lệ', 400);
  const id = Number(c.req.param('id'));
  const action = c.req.param('action');
  if (action === 'giu') await c.env.DB.prepare('UPDATE items SET kept = 1 - kept WHERE id = ?').bind(id).run();
  else await c.env.DB.prepare('UPDATE items SET dismissed = 1 WHERE id = ?').bind(id).run();
  const back = String((await c.req.parseBody()).back ?? '/hoc-tap');
  return c.redirect(back.startsWith('/') ? back : '/hoc-tap', 303);
});

app.get('/hoc-tap/han-muc', async (c) => {
  const { results: ft } = await c.env.DB.prepare('SELECT status, COUNT(*) AS n FROM fulltexts GROUP BY status').all<{ status: string; n: number }>();
  const keys = { gemini: !!c.env.GEMINI_API_KEY, azure: !!c.env.AZURE_TRANSLATOR_KEY, deepl: !!c.env.DEEPL_API_KEY, google: !!c.env.GOOGLE_TRANSLATE_API_KEY };
  return c.html(quotaPage({ quota: await quotaSnapshot(c.env), sources: await allSources(c.env), jobs: await recentJobs(c.env), pending: await pendingCount(c.env), hasGemini: keys.gemini, keys, fulltext: Object.fromEntries(ft.map((r) => [r.status, r.n])) }));
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

/* ---------- Việc chạy nền ---------- */
const JOBS: Record<string, (env: Env) => Promise<string>> = {
  'crawl-rss': async (env) => {
    const out = await crawl(env, 'rss');
    return `${out}\n${await summarizeBatch(env)}`;
  },
  'crawl-arxiv': async (env) => {
    const out = await crawl(env, 'arxiv');
    return `${out}\n${await summarizeBatch(env)}`;
  },
  summarize: async (env) => `${await summarizeBatch(env)}\n${await processFullTextQueue(env)}`,
  fulltext: (env) => processFullTextQueue(env),
  picks: async (env) => `${await summarizeBatch(env)}\n${await makePicks(env, vnDay())}\n${await cleanupFullTexts(env)}`,
};

async function runJob(env: Env, job: string): Promise<void> {
  const startedAt = new Date().toISOString();
  try {
    await logJob(env, job, startedAt, true, await JOBS[job](env));
  } catch (e) {
    await logJob(env, job, startedAt, false, e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e));
  }
}

const CRON_TO_JOB: Record<string, string> = {
  '0 */6 * * *': 'crawl-rss',
  '0 23 * * *': 'crawl-arxiv',
  '30 23 * * *': 'picks',
  '*/30 * * * *': 'summarize',
};

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    const job = CRON_TO_JOB[event.cron];
    if (job) ctx.waitUntil(ensureSchema(env).then(() => runJob(env, job)));
  },
} satisfies ExportedHandler<Env>;
