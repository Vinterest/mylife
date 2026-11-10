import type { CaptureRow } from './capture';
import type { Channel, Env, ItemRow } from './types';
import { CHANNELS, CHANNEL_ORDER, normalizeTitle } from './util';

/*
 * Tìm kiếm trong Học tập AI: tiêu đề + nội dung của bài (mô tả, toàn văn tiếng Anh, bản dịch tiếng Việt)
 * và của Hộp nhặt (tiêu đề, nội dung anh dán, link). Tiêu đề bài còn so được khi gõ không dấu.
 * Đoạn trích quanh chỗ khớp được cắt ngay trong D1 để không phải kéo cả toàn văn về Worker.
 */

export type Scope = 'tat-ca' | Channel | 'hop-nhat' | 'da-doc' | 'so-tay';

export const SCOPES: { id: Scope; label: string }[] = [
  { id: 'tat-ca', label: 'Tất cả' },
  ...CHANNEL_ORDER.map((c) => ({ id: c as Scope, label: CHANNELS[c].short })),
  { id: 'hop-nhat', label: 'Hộp nhặt' },
  { id: 'da-doc', label: 'Đã đọc' },
  { id: 'so-tay', label: 'Sổ tay' },
];

export function parseScope(s: string | undefined): Scope {
  return (SCOPES.find((x) => x.id === s)?.id ?? 'tat-ca') as Scope;
}

export type ItemHit = ItemRow & { rank: number; snip: string | null };
export type CaptureHit = CaptureRow & { snip: string | null };

const LIMIT = 40;

/** Cắt đoạn trích quanh vị trí khớp đầu tiên của một cột (SQL). */
const snipOf = (col: string) => `CASE WHEN instr(lower(${col}), ?1) > 0 THEN substr(${col}, max(1, instr(lower(${col}), ?1) - 90), 260) END`;
const has = (col: string) => `instr(lower(coalesce(${col}, '')), ?1) > 0`;

export async function searchItems(env: Env, q: string, scope: Scope): Promise<ItemHit[]> {
  if (scope === 'hop-nhat') return [];
  const where: string[] = [];
  if ((CHANNEL_ORDER as string[]).includes(scope)) where.push(`i.channel = '${scope}'`);
  if (scope === 'da-doc') where.push('i.read_at IS NOT NULL');
  if (scope === 'so-tay') where.push("i.kept = 1 AND i.source_id <> 'manual'");
  const titleHit = `(${has('i.title_en')} OR ${has('i.title_vi')} OR (length(?2) > 2 AND i.title_key LIKE '%' || ?2 || '%'))`;
  const { results } = await env.DB.prepare(
    `SELECT i.*, s.name AS source_name, s.weight AS source_weight,
       (CASE WHEN ${titleHit} THEN 4 ELSE 0 END
        + CASE WHEN ${has('i.note')} THEN 3 ELSE 0 END
        + CASE WHEN ${has('i.abstract_en')} THEN 2 ELSE 0 END
        + CASE WHEN ${has('f.blocks_vi')} OR ${has('f.blocks_en')} THEN 1 ELSE 0 END) AS rank,
       COALESCE(${snipOf('i.note')}, ${snipOf('i.abstract_en')}, ${snipOf('f.blocks_vi')}, ${snipOf('f.blocks_en')}) AS snip
     FROM items i JOIN sources s ON s.id = i.source_id LEFT JOIN fulltexts f ON f.item_id = i.id
     WHERE i.dismissed = 0 ${where.length ? `AND ${where.join(' AND ')}` : ''}
       AND (${titleHit} OR ${has('i.note')} OR ${has('i.abstract_en')} OR ${has('f.blocks_vi')} OR ${has('f.blocks_en')})
     ORDER BY rank DESC, i.published_at DESC LIMIT ${LIMIT}`
  ).bind(q.toLowerCase(), normalizeTitle(q)).all<ItemHit>();
  return results;
}

export async function searchCaptures(env: Env, q: string, scope: Scope): Promise<CaptureHit[]> {
  if (scope === 'da-doc') return [];
  const where: string[] = [];
  if ((CHANNEL_ORDER as string[]).includes(scope)) where.push(`c.channel = '${scope}'`);
  if (scope === 'so-tay') where.push('c.kept = 1');
  const { results } = await env.DB.prepare(
    `SELECT c.*,
       (SELECT GROUP_CONCAT(id) FROM capture_images WHERE capture_id = c.id) AS img_ids,
       COALESCE(${snipOf('c.note')}, ${snipOf('c.description')}) AS snip
     FROM captures c
     WHERE (${has('c.title')} OR ${has('c.note')} OR ${has('c.url')} OR ${has('c.description')})
       ${where.length ? `AND ${where.join(' AND ')}` : ''}
     ORDER BY (CASE WHEN ${has('c.title')} THEN 1 ELSE 0 END) DESC, c.created_at DESC LIMIT ${LIMIT}`
  ).bind(q.toLowerCase()).all<CaptureHit>();
  return results;
}

/** Làm sạch đoạn trích lấy từ toàn văn (dạng JSON các khối) thành câu đọc được. */
export function cleanSnip(s: string | null): string {
  if (!s) return '';
  return s
    .replace(/\\n/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/"?\s*,?\s*\{?"k":"\w+"(,"src":"[^"]*")?,"t":"/g, ' · ')
    .replace(/"\s*\}\s*,?\s*\{?|"\s*\}\s*\]?|^\[?\{?|null,?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
