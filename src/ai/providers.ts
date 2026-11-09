import type { Env } from '../types';
import { addUsage, canUse, markExhausted } from './quota';

/** Bị giới hạn TẠM THỜI (số yêu cầu mỗi phút) — thử dịch vụ khác hoặc thử lại sau ít giây, KHÔNG đánh dấu hết hạn mức ngày. */
export class RateLimited extends Error {}

/** Gemini 429: hết lượt trong NGÀY → đánh dấu hết hạn mức; chỉ quá số yêu cầu mỗi PHÚT → RateLimited. */
async function gemini429(env: Env, res: Response): Promise<never> {
  const body = await res.text().catch(() => '');
  if (/PerDay|per day|daily/i.test(body)) {
    await markExhausted(env, 'gemini');
    throw new QuotaExhausted('Gemini báo hết lượt trong ngày (429)');
  }
  throw new RateLimited('Gemini đang giới hạn số yêu cầu mỗi phút (429)');
}

export class QuotaExhausted extends Error {}

/**
 * Mô hình Gemini thử lần lượt (GEMINI_MODEL, phân cách bằng dấu phẩy). Google ngừng cấp các mô hình cũ cho
 * key mới (trả 404 "not found") → tự chuyển sang mô hình kế tiếp và nhớ mô hình chạy được trong lượt này.
 */
const DEFAULT_MODELS = 'gemini-3.1-flash-lite,gemini-3.5-flash-lite,gemini-2.5-flash-lite,gemini-3.5-flash';
const deadModels = new Set<string>();
let goodModel: string | null = null;

function geminiModels(env: Env): string[] {
  const list = [...new Set(`${env.GEMINI_MODEL || ''},${DEFAULT_MODELS}`.split(',').map((m) => m.trim()).filter(Boolean))];
  const alive = list.filter((m) => !deadModels.has(m));
  return goodModel && alive.includes(goodModel) ? [goodModel, ...alive.filter((m) => m !== goodModel)] : alive;
}

/** Gọi generateContent; xử lý 404 (đổi mô hình), 429 (phút/ngày), lỗi khác. Trả về chữ của câu trả lời. */
async function geminiCall(env: Env, parts: unknown[], temperature: number, maxOutputTokens: number): Promise<string> {
  if (!env.GEMINI_API_KEY) throw new QuotaExhausted('Chưa có GEMINI_API_KEY');
  if (!(await canUse(env, 'gemini'))) throw new QuotaExhausted('Gemini đã gần hết hạn mức hôm nay');
  let last = '';
  for (const model of geminiModels(env)) {
    const gen: Record<string, unknown> = { responseMimeType: 'application/json', temperature, maxOutputTokens };
    // Mô hình Gemini 3 mặc định "suy nghĩ" (tốn token, chậm) — dịch/đọc chữ không cần.
    if (/^gemini-3/.test(model)) gen.thinkingConfig = { thinkingLevel: 'minimal' };
    const send = (g: Record<string, unknown>) =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY! },
        body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: g }),
      });
    let res = await send(gen);
    if (res.status === 400 && gen.thinkingConfig) {
      const body = await res.clone().text();
      if (/thinking/i.test(body)) { delete gen.thinkingConfig; res = await send(gen); }
    }
    if (res.status === 404) {
      deadModels.add(model);
      last = `${model}: không có (404)`;
      continue;
    }
    await addUsage(env, 'gemini', 1);
    if (res.status === 429) await gemini429(env, res);
    if (!res.ok) throw new Error(`Gemini ${model} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    goodModel = model;
    const data: any = await res.json();
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.filter((p: any) => !p.thought).map((p: any) => p.text ?? '').join('');
    if (!text) throw new Error(`Gemini ${model} không trả nội dung`);
    return text;
  }
  throw new Error(`Không tìm thấy mô hình Gemini dùng được (${last}). Sửa GEMINI_MODEL trong wrangler.toml.`);
}

/** Gemini qua Google AI Studio (gói miễn phí). Trả về chuỗi JSON. */
export async function geminiJson(env: Env, prompt: string, maxOutputTokens = 1200): Promise<string> {
  return geminiCall(env, [{ text: prompt }], 0.3, maxOutputTokens);
}

/** Gemini đọc ảnh (OCR). `b64` là ảnh mã hóa base64. Trả về chuỗi JSON. */
export async function geminiVision(env: Env, prompt: string, b64: string, mime: string, maxOutputTokens = 4096): Promise<string> {
  return geminiCall(env, [{ inline_data: { mime_type: mime, data: b64 } }, { text: prompt }], 0, maxOutputTokens);
}

/** Bảng quy đổi neuron theo mô hình (neuron / 1 triệu token, từ trang giá Cloudflare). */
const NEURON_RATES: Record<string, { in: number; out: number }> = {
  '@cf/google/gemma-3-12b-it': { in: 31371, out: 50560 },
  '@cf/google/gemma-4-26b-a4b-it': { in: 9091, out: 27273 },
  '@cf/meta/llama-3.1-8b-instruct-fp8': { in: 13778, out: 26128 },
};

/** Cloudflare Workers AI (10.000 neuron miễn phí mỗi ngày). */
export async function workersAiJson(env: Env, prompt: string, maxTokens = 900): Promise<string> {
  if (!env.AI) throw new QuotaExhausted('Workers AI không khả dụng (chạy local)');
  const model = env.WORKERS_AI_MODEL;
  const rate = NEURON_RATES[model] ?? { in: 31371, out: 50560 };
  const estPromptTokens = Math.ceil(prompt.length / 3.5);
  const estNeurons = (estPromptTokens * rate.in + maxTokens * rate.out) / 1e6;
  if (!(await canUse(env, 'workers_ai', estNeurons))) throw new QuotaExhausted('Workers AI đã gần hết hạn mức hôm nay');
  const out: any = await env.AI.run(model as any, {
    messages: [
      { role: 'system', content: 'Chỉ trả về một đối tượng JSON hợp lệ, không thêm chữ nào khác.' },
      { role: 'user', content: prompt },
    ],
    max_tokens: maxTokens,
    temperature: 0.3,
  } as any);
  const usage = out?.usage;
  const neurons = usage ? (usage.prompt_tokens * rate.in + usage.completion_tokens * rate.out) / 1e6 : estNeurons;
  await addUsage(env, 'workers_ai', neurons);
  const text: string = typeof out?.response === 'string' ? out.response : JSON.stringify(out?.response ?? '');
  if (!text) throw new Error('Workers AI không trả nội dung');
  return text;
}
