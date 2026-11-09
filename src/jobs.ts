import type { Env } from './types';
import { crawlSource, markDue, nextDueSource } from './crawl';
import { cleanupFullTexts, fetchNextFullText, translateRequested } from './fulltext';

/*
 * Gói Workers miễn phí: mỗi lượt chạy tối đa 50 truy vấn D1, 50 yêu cầu mạng và ~10 ms CPU.
 * Vì vậy thay vì 1 lượt lớn crawl hết 14 nguồn, mỗi 5 phút chạy một "nhịp" nhỏ:
 *   1. Dọn toàn văn cũ (mỗi ngày một lần, lúc 06:30). Đáng đọc tính lại mỗi lần mở trang.
 *   2. Crawl tối đa 3 nguồn đến hạn (RSS/trang tin mỗi 6 giờ, arXiv sau 06:00); nguồn chưa từng có bài được ưu tiên.
 *   3. Dịch tiếp tối đa 2 lô cho bài anh đã bấm "Dịch bài này".
 *   4. Tự lấy toàn văn (không dịch) cho 1 bài.
 * Mỗi bước bọc try/catch riêng, và nhịp được ghi nhật ký NGAY KHI BẮT ĐẦU.
 */

const RUNNING = 'đang chạy…';
const CRAWL_PER_TICK = 3;

async function step(notes: string[], name: string, fn: () => Promise<string>) {
  try {
    const r = await fn();
    if (r) notes.push(r);
  } catch (e) {
    notes.push(`${name}: LỖI ${e instanceof Error ? e.message : String(e)}`);
  }
}

function vnMinutes(d = new Date()): number {
  const t = new Date(d.getTime() + 7 * 3600000);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}

export async function tick(env: Env): Promise<string> {
  const notes: string[] = [];
  await step(notes, 'Dọn dẹp', async () => {
    // Mỗi ngày một lần, nhịp lúc 06:30–06:34 giờ VN.
    const m = vnMinutes();
    return m >= 6 * 60 + 30 && m < 6 * 60 + 35 ? cleanupFullTexts(env) : '';
  });
  // Crawl tối đa 3 nguồn đến hạn mỗi nhịp (37 nguồn ≈ 1 giờ), dừng sớm nếu đã chạy quá 25 giây.
  let crawled = 0;
  const t0 = Date.now();
  while (crawled < CRAWL_PER_TICK && Date.now() - t0 < 25_000) {
    const src = await nextDueSource(env).catch(() => null);
    if (!src) break;
    await step(notes, `Crawl ${src.id}`, () => crawlSource(env, src));
    crawled++;
  }
  await step(notes, 'Dịch', () => translateRequested(env, 2));
  // Giữ tổng yêu cầu mạng dưới 50: nhịp đã crawl đủ 3 nguồn thì để lấy toàn văn cho nhịp sau.
  if (crawled < CRAWL_PER_TICK) await step(notes, 'Toàn văn', () => fetchNextFullText(env));
  return notes.join('\n');
}

/** Việc chạy tay từ trang "Nguồn & hạn mức". */
export const JOBS: Record<string, (env: Env) => Promise<string>> = {
  tick,
  'crawl-rss': async (env) => `${await markDue(env, 'rss')}\n${await tick(env)}`,
  'crawl-arxiv': async (env) => `${await markDue(env, 'arxiv')}\n${await tick(env)}`,
};

/** Ghi nhật ký lúc bắt đầu (ok = 0, "đang chạy…"), cập nhật khi xong. Lượt bị ngắt giữa chừng vẫn để lại dấu. */
export async function runJob(env: Env, job: string): Promise<void> {
  const startedAt = new Date().toISOString();
  const row = await env.DB.prepare('INSERT INTO jobs_log (job, started_at, ok, detail) VALUES (?, ?, 0, ?) RETURNING id').bind(job, startedAt, RUNNING).first<{ id: number }>();
  let ok = true;
  let detail: string;
  try {
    detail = (await JOBS[job](env)) || 'Không có việc đến hạn';
    ok = !detail.includes('LỖI');
  } catch (e) {
    ok = false;
    detail = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
  }
  await env.DB.batch([
    env.DB.prepare('UPDATE jobs_log SET ok = ?, detail = ? WHERE id = ?').bind(ok ? 1 : 0, detail.slice(0, 2000), row?.id ?? 0),
    env.DB.prepare('DELETE FROM jobs_log WHERE id NOT IN (SELECT id FROM jobs_log ORDER BY id DESC LIMIT 400)'),
  ]);
}
