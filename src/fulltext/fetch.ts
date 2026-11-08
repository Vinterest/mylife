import type { Env, ItemRow } from '../types';
import { extractBlocks, textChars, type Block } from './extract';

const UA = 'Mozilla/5.0 (compatible; MyLife-Reader/1.0; personal reader)';

export interface FetchedText {
  kind: 'html' | 'arxiv_html' | 'abstract';
  baseUrl: string;
  blocks: Block[];
  publicPartial: boolean;
}

function abstractOnly(it: ItemRow): FetchedText {
  return {
    kind: 'abstract',
    baseUrl: it.url,
    blocks: it.abstract_en ? [{ k: 'p', t: it.abstract_en }] : [],
    publicPartial: false,
  };
}

async function get(url: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'Accept-Language': 'en,vi;q=0.8' },
    redirect: 'follow',
    signal: AbortSignal.timeout(12000),
  });
  return res;
}

/** Lấy toàn văn của một bài. Không vượt tường phí: chỉ lấy phần trang công khai trả về. */
export async function fetchFullText(_env: Env, it: ItemRow): Promise<FetchedText> {
  const host = new URL(it.url).hostname;

  // YouTube: chưa lấy lời thoại ở V1 → dùng phần mô tả.
  if (/youtube\.com|youtu\.be/.test(host)) return abstractOnly(it);

  // arXiv: dùng bản HTML (có chữ, công thức, hình). Bài chưa có bản HTML → chỉ có tóm tắt.
  const arxiv = it.url.match(/arxiv\.org\/abs\/([^?#]+)/);
  if (arxiv) {
    const res = await get(`https://arxiv.org/html/${arxiv[1]}`);
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return abstractOnly(it);
    const base = res.url.endsWith('/') ? res.url : `${res.url}/`; // ảnh của arXiv dùng đường dẫn tương đối theo mã bài
    const blocks = await extractBlocks(res, base);
    if (textChars(blocks) < 1500) return abstractOnly(it);
    const abs: Block[] = it.abstract_en ? [{ k: 'h2', t: 'Abstract' }, { k: 'p', t: it.abstract_en }] : [];
    const hasAbstract = blocks.slice(0, 6).some((b) => /^abstract$/i.test(b.t));
    return { kind: 'arxiv_html', baseUrl: res.url, blocks: hasAbstract ? blocks : [...abs, ...blocks], publicPartial: false };
  }

  const res = await get(it.url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!(res.headers.get('content-type') ?? '').includes('html')) return abstractOnly(it);
  const blocks = await extractBlocks(res, res.url);
  const chars = textChars(blocks);
  if (chars < 400) return { ...abstractOnly(it), publicPartial: true };
  // Ít chữ hơn hẳn bài bình thường → có thể là trang có tường phí / chỉ công khai đoạn đầu.
  return { kind: 'html', baseUrl: res.url, blocks, publicPartial: chars < 1200 };
}
