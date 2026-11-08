import type { Env } from '../types';
import { addUsage, canUse, markExhausted } from './quota';

export class QuotaExhausted extends Error {}

/** Gemini qua Google AI Studio (gói miễn phí). Trả về chuỗi JSON. */
export async function geminiJson(env: Env, prompt: string): Promise<string> {
  if (!env.GEMINI_API_KEY) throw new QuotaExhausted('Chưa có GEMINI_API_KEY');
  if (!(await canUse(env, 'gemini'))) throw new QuotaExhausted('Gemini đã gần hết hạn mức hôm nay');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 1200 },
    }),
  });
  await addUsage(env, 'gemini', 1);
  if (res.status === 429) {
    await markExhausted(env, 'gemini');
    throw new QuotaExhausted('Gemini báo hết lượt (429)');
  }
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('');
  if (!text) throw new Error('Gemini không trả nội dung');
  return text;
}

/** Bảng quy đổi neuron theo mô hình (neuron / 1 triệu token, từ trang giá Cloudflare). */
const NEURON_RATES: Record<string, { in: number; out: number }> = {
  '@cf/google/gemma-3-12b-it': { in: 31371, out: 50560 },
  '@cf/google/gemma-4-26b-a4b-it': { in: 9091, out: 27273 },
  '@cf/meta/llama-3.1-8b-instruct-fp8': { in: 13778, out: 26128 },
};

/** Cloudflare Workers AI (10.000 neuron miễn phí mỗi ngày). */
export async function workersAiJson(env: Env, prompt: string): Promise<string> {
  if (!env.AI) throw new QuotaExhausted('Workers AI không khả dụng (chạy local)');
  const model = env.WORKERS_AI_MODEL;
  const rate = NEURON_RATES[model] ?? { in: 31371, out: 50560 };
  const estPromptTokens = Math.ceil(prompt.length / 3.5);
  const estNeurons = (estPromptTokens * rate.in + 900 * rate.out) / 1e6;
  if (!(await canUse(env, 'workers_ai', estNeurons))) throw new QuotaExhausted('Workers AI đã gần hết hạn mức hôm nay');
  const out: any = await env.AI.run(model as any, {
    messages: [
      { role: 'system', content: 'Chỉ trả về một đối tượng JSON hợp lệ, không thêm chữ nào khác.' },
      { role: 'user', content: prompt },
    ],
    max_tokens: 900,
    temperature: 0.3,
  } as any);
  const usage = out?.usage;
  const neurons = usage ? (usage.prompt_tokens * rate.in + usage.completion_tokens * rate.out) / 1e6 : estNeurons;
  await addUsage(env, 'workers_ai', neurons);
  const text: string = typeof out?.response === 'string' ? out.response : JSON.stringify(out?.response ?? '');
  if (!text) throw new Error('Workers AI không trả nội dung');
  return text;
}
