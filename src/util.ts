import type { Channel } from './types';

export const CHANNELS: Record<Channel, { name: string; short: string; slug: string; weight: number }> = {
  ai: { name: 'AI thế giới', short: 'AI thế giới', slug: 'ai-the-gioi', weight: 22 },
  embodied: { name: 'Embodied AI', short: 'Embodied AI', slug: 'embodied-ai', weight: 26 },
  robotics: { name: 'Robotics', short: 'Robotics', slug: 'robotics', weight: 18 },
  tcnh: { name: 'Tài chính – Ngân hàng', short: 'Tài chính – NH', slug: 'tai-chinh-ngan-hang', weight: 30 },
};

/** Thứ tự hiển thị trên giao diện. */
export const CHANNEL_ORDER: Channel[] = ['ai', 'embodied', 'robotics', 'tcnh'];

export function channelBySlug(slug: string): Channel | undefined {
  return (Object.keys(CHANNELS) as Channel[]).find((c) => CHANNELS[c].slug === slug);
}

function dayIn(tz: string, d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
/** Ngày theo giờ Việt Nam, dạng YYYY-MM-DD. */
export const vnDay = (d = new Date()) => dayIn('Asia/Ho_Chi_Minh', d);
export const vnMonth = (d = new Date()) => vnDay(d).slice(0, 7);
/** Hạn mức Gemini tính lại lúc 0:00 giờ Thái Bình Dương. */
export const pacificDay = (d = new Date()) => dayIn('America/Los_Angeles', d);
/** Hạn mức Workers AI tính lại lúc 0:00 UTC. */
export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);

export function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 160);
}

const ENTITIES: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#039;': "'", '&apos;': "'" };

export function stripHtml(s: string): string {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? (m.startsWith('&#') ? String.fromCharCode(parseInt(m.slice(2).replace(/^x/i, '0x'))) : ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function readMinutes(text: string, isPaper: boolean): number {
  if (isPaper) return 15; // paper đầy đủ, ước tính khi chỉ có tóm tắt
  const words = text.split(/\s+/).length;
  return Math.max(2, Math.round(words / 200) + 2);
}

export function timeAgoVi(iso: string, now = new Date()): string {
  const diffMin = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (diffMin < 60) return `${diffMin} phút trước`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.round(h / 24);
  if (d === 1) return 'hôm qua';
  return `${d} ngày trước`;
}

export function vnDateLong(d = new Date()): string {
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Từ khóa ưu tiên khi chấm điểm (gắn với công việc bán CDP/CRM cho ngân hàng). */
const PRIORITY_KEYWORDS = [
  'agent', 'agentic', 'large language model', 'llm', 'foundation model', 'multimodal',
  'humanoid', 'vision-language-action', 'world model', 'manipulation',
  'bank', 'banking', 'credit', 'fraud', 'customer', 'personaliz', 'recommendation', 'cdp', 'crm', 'payment', 'ngân hàng',
];

export function keywordHits(text: string): number {
  const t = text.toLowerCase();
  return PRIORITY_KEYWORDS.reduce((n, k) => n + (t.includes(k) ? 1 : 0), 0);
}

/** Điểm "đáng đọc" 0–100. */
export function scoreItem(p: { channel: Channel; publishedAt: string; text: string; sourceWeight: number }, now = new Date()): number {
  const ageH = (now.getTime() - new Date(p.publishedAt).getTime()) / 3600000;
  const recency = 25 * Math.max(0, 1 - ageH / 72);
  const kw = Math.min(25, 6 * keywordHits(p.text));
  return Math.round(Math.min(100, CHANNELS[p.channel].weight + recency + kw + Math.min(20, p.sourceWeight)));
}

/** Khớp từ khóa nguồn (không phân biệt hoa thường; từ ngắn như "AI" khớp nguyên từ). */
export function matchesKeywords(text: string, keywords: string | null): boolean {
  if (!keywords || !keywords.trim()) return true;
  const t = text.toLowerCase();
  return keywords.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean).some((k) => {
    if (k.length <= 3) return new RegExp(`(^|[^\\p{L}\\p{N}])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}\\p{N}]|$)`, 'u').test(t);
    return t.includes(k);
  });
}
