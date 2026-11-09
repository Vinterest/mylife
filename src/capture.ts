import type { Channel, Env } from './types';
import { parsePageMeta } from './crawl/parse';
import { ensureFullText } from './fulltext';
import { getItem } from './db';
import { CHANNEL_ORDER, normalizeTitle } from './util';

/*
 * Chặng 3 · Hộp nhặt — anh tự nhặt link + ảnh chụp (Facebook, web…).
 * - Có link: lấy tiêu đề/ảnh/mô tả, tạo bài trong `items` (nguồn "manual") để đọc toàn văn + dịch như bài crawl.
 * - Có ảnh: chỉ lưu thẳng trong D1 và hiển thị lại (không dùng mô hình AI, không gửi ảnh ra ngoài).
 * - Tiêu đề: anh tự nhập; không nhập thì lấy tiêu đề trang của link → dòng đầu của Nội dung → "Ảnh nhặt <ngày giờ>".
 */

export const MAX_IMAGES = 6;
export const MAX_IMAGE_BYTES = 1_900_000; // D1 giới hạn 2 MB mỗi giá trị
const UA = 'MyLife-Reader/1.0 (personal reader; contact via mylife.gm-chess.com)';

export interface CaptureRow {
  id: number;
  created_at: string;
  channel: Channel;
  url: string | null;
  note: string | null;
  item_id: number | null;
  title: string | null;
  description: string | null;
  image_url: string | null;
  status: 'new' | 'done' | 'failed';
  error: string | null;
  kept: number;
  archived: number;
  via: string;
  // ghép thêm khi liệt kê
  img_ids?: string | null;
  ocr_preview?: string | null;
  ocr_pending?: number;
}

export interface CaptureImage {
  id: number;
  capture_id: number;
  mime: string;
  bytes: number;
  ocr_text: string | null;
  ocr_status: 'pending' | 'done' | 'failed' | 'skipped';
}

export interface NewCapture {
  title?: string;
  url?: string;
  note?: string;
  channel?: string;
  images: { mime: string; data: ArrayBuffer }[];
  via: 'web' | 'shortcut';
}

/** Lấy link đầu tiên trong một đoạn chữ (Phím tắt iPhone thường gửi "chữ + link"). */
export function firstUrl(text: string): string | undefined {
  const m = /https?:\/\/[^\s<>"']+/i.exec(text);
  return m ? m[0].replace(/[),.;!?]+$/, '') : undefined;
}

export function normChannel(c: string | undefined): Channel {
  const v = (c ?? '').trim().toLowerCase();
  const alias: Record<string, Channel> = { 'ai-the-gioi': 'ai', 'embodied-ai': 'embodied', 'tai-chinh-ngan-hang': 'tcnh', tcnh: 'tcnh', nganhang: 'tcnh' };
  if ((CHANNEL_ORDER as string[]).includes(v)) return v as Channel;
  return alias[v] ?? 'ai';
}

/** Kiểm tra dữ liệu gửi lên; trả về lỗi dễ hiểu (hoặc null). */
export function validateCapture(c: NewCapture): string | null {
  if (!c.url && !c.images.length && !c.note?.trim()) return 'Chưa có gì để lưu: chọn ảnh, dán link hoặc dán nội dung.';
  if (c.url && !/^https?:\/\//i.test(c.url)) return 'Link phải bắt đầu bằng http:// hoặc https://';
  if (c.images.length > MAX_IMAGES) return `Tối đa ${MAX_IMAGES} ảnh mỗi lần.`;
  for (const im of c.images) {
    if (!/^image\/(jpeg|png|webp|gif|heic|heif)$/i.test(im.mime)) return `Định dạng ảnh chưa hỗ trợ: ${im.mime}`;
    if (im.data.byteLength > MAX_IMAGE_BYTES) return `Ảnh quá lớn (${Math.round(im.data.byteLength / 1024)} KB). Trang web tự nén ảnh; nếu gửi từ Phím tắt, thêm bước "Đổi cỡ ảnh" về rộng 1280.`;
  }
  return null;
}

/** Lưu mục nhặt + ảnh trong một lần (db.batch). Trả về id. */
export async function createCapture(env: Env, c: NewCapture): Promise<number> {
  const now = new Date().toISOString();
  const note = c.note?.trim().slice(0, 30000) || null;
  const userTitle = c.title?.trim().slice(0, 300) || null;
  // Không có link thì không cần xử lý gì thêm: lưu xong là "done" ngay, kèm tiêu đề.
  const status = c.url ? 'new' : 'done';
  const title = userTitle ?? (c.url ? null : defaultTitle(note, now, c.images.length));
  const row = await env.DB.prepare(
    `INSERT INTO captures (created_at, channel, url, note, title, status, via) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`
  ).bind(now, normChannel(c.channel), c.url?.trim() || null, note, title, status, c.via).first<{ id: number }>();
  const id = row!.id;
  if (c.images.length) {
    await env.DB.batch(
      c.images.map((im) =>
        env.DB.prepare(`INSERT INTO capture_images (capture_id, mime, bytes, data, ocr_status) VALUES (?, ?, ?, ?, 'skipped')`).bind(id, im.mime.toLowerCase(), im.data.byteLength, im.data)
      )
    );
  }
  return id;
}

export async function getCapture(env: Env, id: number): Promise<CaptureRow | null> {
  return env.DB.prepare('SELECT * FROM captures WHERE id = ?').bind(id).first<CaptureRow>();
}

export async function captureImages(env: Env, id: number): Promise<CaptureImage[]> {
  const { results } = await env.DB.prepare('SELECT id, capture_id, mime, bytes, ocr_text, ocr_status FROM capture_images WHERE capture_id = ? ORDER BY id').bind(id).all<CaptureImage>();
  return results;
}

/** Danh sách cho Hộp nhặt / Sổ tay (không đọc cột ảnh để nhẹ). */
export async function listCaptures(env: Env, where: string, limit = 60, offset = 0): Promise<CaptureRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT c.*,
       (SELECT GROUP_CONCAT(id) FROM capture_images WHERE capture_id = c.id) AS img_ids,
       (SELECT SUBSTR(ocr_text, 1, 400) FROM capture_images WHERE capture_id = c.id AND ocr_text IS NOT NULL ORDER BY id LIMIT 1) AS ocr_preview,
       (SELECT COUNT(*) FROM capture_images WHERE capture_id = c.id AND ocr_status = 'pending') AS ocr_pending
     FROM captures c WHERE ${where} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`
  ).bind(limit, offset).all<CaptureRow>();
  return results;
}

/** 10 mục nhặt ngay trước mục đang xem (cũ hơn), gồm cả mục đã xử lý — để tra cứu lần ngược không sót. */
export async function olderCaptures(env: Env, cap: CaptureRow, limit = 10): Promise<CaptureRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT c.*,
       (SELECT GROUP_CONCAT(id) FROM capture_images WHERE capture_id = c.id) AS img_ids,
       (SELECT SUBSTR(ocr_text, 1, 400) FROM capture_images WHERE capture_id = c.id AND ocr_text IS NOT NULL ORDER BY id LIMIT 1) AS ocr_preview,
       (SELECT COUNT(*) FROM capture_images WHERE capture_id = c.id AND ocr_status = 'pending') AS ocr_pending
     FROM captures c WHERE (c.created_at < ?1 OR (c.created_at = ?1 AND c.id < ?2))
     ORDER BY c.created_at DESC, c.id DESC LIMIT ?3`
  ).bind(cap.created_at, cap.id, limit).all<CaptureRow>();
  return results;
}

export async function imageData(env: Env, imgId: number): Promise<{ mime: string; data: Uint8Array } | null> {
  const r = await env.DB.prepare('SELECT mime, data FROM capture_images WHERE id = ?').bind(imgId).first<{ mime: string; data: ArrayBuffer | number[] }>();
  if (!r) return null;
  return { mime: r.mime, data: r.data instanceof ArrayBuffer ? new Uint8Array(r.data) : Uint8Array.from(r.data) };
}

export function toBase64(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Link → bài trong `items` (dùng lại bài có sẵn nếu trùng link) + tiêu đề/ảnh đại diện. */
async function linkToItem(env: Env, cap: CaptureRow): Promise<void> {
  const url = cap.url!;
  let title = '';
  let desc = '';
  let image: string | undefined;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*;q=0.5' }, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
    if (res.ok && (res.headers.get('Content-Type') ?? '').includes('html')) {
      const m = parsePageMeta(await res.text(), res.url);
      // Facebook/đăng nhập: tiêu đề vô nghĩa → bỏ, sẽ dùng chữ trong ảnh/ghi chú.
      if (m.title && !/^(facebook|log in|đăng nhập|instagram|x)$/i.test(m.title.trim())) title = m.title;
      desc = m.description;
      image = m.image;
    }
  } catch { /* trang chặn hoặc lỗi mạng: vẫn lưu link */ }

  const existing = await env.DB.prepare('SELECT id FROM items WHERE url = ?').bind(url).first<{ id: number }>();
  let itemId = existing?.id;
  if (!itemId) {
    const now = new Date().toISOString();
    const t = cap.title || title || cap.note?.split('\n')[0]?.slice(0, 160) || url;
    const r = await env.DB.prepare(
      `INSERT INTO items (source_id, channel, url, title_key, title_en, published_at, fetched_at, abstract_en, score, read_minutes, image_url)
       VALUES ('manual', ?, ?, ?, ?, ?, ?, ?, 85, 5, ?) RETURNING id`
    ).bind(cap.channel, url, `manual ${normalizeTitle(t)} ${Date.now()}`, t, now, now, desc || null, image ?? null).first<{ id: number }>();
    itemId = r!.id;
  }
  await env.DB.prepare('UPDATE captures SET item_id = ?, title = COALESCE(title, ?), description = COALESCE(description, ?), image_url = COALESCE(image_url, ?) WHERE id = ?')
    .bind(itemId, title || null, desc || null, image ?? null, cap.id).run();
  // Lấy toàn văn luôn (không dịch) — trang Facebook thường cần đăng nhập nên sẽ chỉ có mô tả.
  const it = await getItem(env, itemId);
  if (it) await ensureFullText(env, it).catch(() => null);
}

const firstLine = (t: string | null | undefined) => (t ?? '').split('\n').map((l) => l.trim()).find((l) => l.length > 8)?.slice(0, 140);

/** Tiêu đề mặc định khi anh không nhập và không có link: dòng đầu Nội dung, hoặc "Ảnh nhặt 09/11 13:45". */
export function defaultTitle(note: string | null | undefined, createdAt: string, nImg: number): string {
  const line = firstLine(note);
  if (line) return line;
  const d = new Date(new Date(createdAt).getTime() + 7 * 3600000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${nImg ? 'Ảnh nhặt' : 'Mục nhặt'} ${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/**
 * Bài (items) tạo từ mục nhặt hiển thị GIỐNG mục nhặt ở mọi danh sách: cùng tiêu đề, đoạn nội dung anh dán,
 * và ảnh chụp đầu tiên anh gửi làm ảnh đại diện (nếu có).
 */
export async function syncItem(env: Env, captureId: number): Promise<void> {
  await env.DB.prepare(
    `UPDATE items SET
       title_en = COALESCE((SELECT title FROM captures WHERE id = ?1), title_en),
       abstract_en = COALESCE((SELECT note FROM captures WHERE id = ?1), abstract_en),
       image_url = COALESCE((SELECT '/hoc-tap/anh/' || MIN(id) FROM capture_images WHERE capture_id = ?1 HAVING COUNT(*) > 0), image_url)
     WHERE source_id = 'manual' AND id = (SELECT item_id FROM captures WHERE id = ?1)`
  ).bind(captureId).run();
}

/** Xử lý một mục nhặt có link: lấy tiêu đề/ảnh/toàn văn của trang (không dùng mô hình AI). */
export async function processCapture(env: Env, id: number): Promise<string> {
  const cap = await getCapture(env, id);
  if (!cap) return '';
  try {
    if (cap.url && !cap.item_id) await linkToItem(env, cap);
    const after = await getCapture(env, id);
    const nImg = await env.DB.prepare('SELECT COUNT(*) AS n FROM capture_images WHERE capture_id = ?').bind(id).first<{ n: number }>();
    const title = after?.title || defaultTitle(cap.note, cap.created_at, nImg?.n ?? 0);
    await env.DB.prepare(`UPDATE captures SET status = 'done', error = NULL, title = ? WHERE id = ?`).bind(title, id).run();
    // Link cần đăng nhập (Facebook) → bài chỉ có tiêu đề là link; thay bằng tiêu đề của mục cho dễ đọc.
    if (cap.url) await syncItem(env, id);
    return `Hộp nhặt #${id}: xong`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await env.DB.prepare(`UPDATE captures SET status = 'failed', error = ? WHERE id = ?`).bind(msg.slice(0, 300), id).run();
    return `Hộp nhặt #${id}: LỖI ${msg}`;
  }
}

/** Nhịp 5 phút: xử lý tiếp 1 mục nhặt còn dở (vd lúc gửi đã hết hạn mức Gemini). */
export async function processPendingCaptures(env: Env): Promise<string> {
  // Bù cho các bài nhặt cũ chưa đồng bộ tiêu đề/nội dung/ảnh với mục nhặt (vài mục mỗi nhịp).
  const { results: stale } = await env.DB.prepare(
    `SELECT c.id FROM captures c JOIN items i ON i.id = c.item_id
     WHERE i.source_id = 'manual' AND (i.title_en IS NOT c.title OR (c.note IS NOT NULL AND i.abstract_en IS NOT c.note)
       OR (EXISTS (SELECT 1 FROM capture_images WHERE capture_id = c.id) AND (i.image_url IS NULL OR i.image_url NOT LIKE '/hoc-tap/anh/%')))
       AND c.title IS NOT NULL LIMIT 5`
  ).all<{ id: number }>();
  for (const r of stale) await syncItem(env, r.id);
  // Đã bỏ đọc chữ trong ảnh: ảnh cũ đang chờ/lỗi đọc chữ thì thôi.
  await env.DB.prepare(`UPDATE capture_images SET ocr_status = 'skipped', ocr_text = CASE WHEN ocr_status = 'failed' THEN NULL ELSE ocr_text END WHERE ocr_status IN ('pending','failed')`).run();
  const r = await env.DB.prepare(`SELECT id FROM captures WHERE status = 'new' ORDER BY created_at LIMIT 1`).first<{ id: number }>();
  return r ? processCapture(env, r.id) : '';
}
