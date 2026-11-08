import { Hono } from 'hono';
import type { Env } from './types';
import { crawl } from './crawl';
import { summarizeBatch } from './ai/summarize';
import { quotaSnapshot } from './ai/quota';
import { makePicks } from './picks';
import { allSources, getItem, latestByChannel, logJob, pendingCount, picksForToday, recentJobs, weeklyCounts } from './db';
import { channelPage, homePage, itemPage, quotaPage, soonPage } from './views/pages';
import { CSS } from './views/layout';
import { APPLE_TOUCH_PNG_B64 } from './icon-png';
import { CHANNEL_ORDER, channelBySlug, vnDay } from './util';

const app = new Hono<{ Bindings: Env }>();

/* ---------- Tài nguyên tĩnh (không cần đăng nhập để iPhone tải được biểu tượng) ---------- */
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0077B6"/><text x="32" y="44" font-family="Arial,Helvetica,sans-serif" font-size="36" font-weight="700" fill="#fff" text-anchor="middle">M</text></svg>`;

app.get('/app.css', (c) => c.body(CSS, 200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }));
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
  if (c.env.DEV_SKIP_AUTH === '1') return next();
  const email = c.req.header('Cf-Access-Authenticated-User-Email');
  if (!email || email.toLowerCase() !== c.env.OWNER_EMAIL.toLowerCase()) {
    return c.text('Không có quyền truy cập. Trang này chỉ dành cho chủ sở hữu (qua Cloudflare Access).', 403);
  }
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
  return c.html(itemPage(it));
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

app.get('/hoc-tap/han-muc', async (c) =>
  c.html(quotaPage({ quota: await quotaSnapshot(c.env), sources: await allSources(c.env), jobs: await recentJobs(c.env), pending: await pendingCount(c.env), hasGemini: !!c.env.GEMINI_API_KEY }))
);

app.get('/sap-co/:key', (c) => c.html(soonPage(c.req.param('key'))));

app.post('/admin/run/:job', async (c) => {
  if (!sameOrigin(c)) return c.text('Yêu cầu không hợp lệ', 400);
  const job = c.req.param('job');
  if (!JOBS[job]) return c.notFound();
  c.executionCtx.waitUntil(runJob(c.env, job));
  return c.redirect('/hoc-tap/han-muc', 303);
});

app.notFound((c) => c.text('Không tìm thấy trang', 404));

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
  summarize: (env) => summarizeBatch(env),
  picks: async (env) => `${await summarizeBatch(env)}\n${await makePicks(env, vnDay())}`,
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
    if (job) ctx.waitUntil(runJob(env, job));
  },
} satisfies ExportedHandler<Env>;
