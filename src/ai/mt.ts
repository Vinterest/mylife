/** Dịch máy dự phòng (gói miễn phí): Azure Translator F0, DeepL API Free, Google Cloud Translation. */
import type { Env } from '../types';
import { addUsage, canUse, markExhausted, type Provider } from './quota';
import { QuotaExhausted } from './providers';

const chars = (arr: string[]) => arr.reduce((n, s) => n + s.length, 0);

async function guard(env: Env, p: Provider, key: string | undefined, texts: string[]) {
  if (!key) throw new QuotaExhausted(`${p}: chưa có key`);
  if (!(await canUse(env, p, chars(texts)))) throw new QuotaExhausted(`${p}: gần hết hạn mức tháng`);
}

export async function azureTranslate(env: Env, texts: string[]): Promise<string[]> {
  await guard(env, 'azure', env.AZURE_TRANSLATOR_KEY, texts);
  const res = await fetch('https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=en&to=vi', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': env.AZURE_TRANSLATOR_KEY!,
      'Ocp-Apim-Subscription-Region': env.AZURE_TRANSLATOR_REGION || 'southeastasia',
    },
    body: JSON.stringify(texts.map((Text) => ({ Text }))),
  });
  if (res.status === 429 || res.status === 403) { await markExhausted(env, 'azure'); throw new QuotaExhausted(`Azure ${res.status}`); }
  if (!res.ok) throw new Error(`Azure HTTP ${res.status}`);
  await addUsage(env, 'azure', chars(texts));
  const data: any[] = await res.json();
  return data.map((d) => String(d?.translations?.[0]?.text ?? ''));
}

export async function deeplTranslate(env: Env, texts: string[]): Promise<string[]> {
  await guard(env, 'deepl', env.DEEPL_API_KEY, texts);
  const res = await fetch('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `DeepL-Auth-Key ${env.DEEPL_API_KEY}` },
    body: JSON.stringify({ text: texts, source_lang: 'EN', target_lang: 'VI' }),
  });
  if (res.status === 456 || res.status === 429) { await markExhausted(env, 'deepl'); throw new QuotaExhausted(`DeepL ${res.status}`); }
  if (!res.ok) throw new Error(`DeepL HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
  await addUsage(env, 'deepl', chars(texts));
  const data: any = await res.json();
  return (data.translations ?? []).map((t: any) => String(t.text ?? ''));
}

export async function googleTranslate(env: Env, texts: string[]): Promise<string[]> {
  await guard(env, 'google_tr', env.GOOGLE_TRANSLATE_API_KEY, texts);
  const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(env.GOOGLE_TRANSLATE_API_KEY!)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: texts, source: 'en', target: 'vi', format: 'text' }),
  });
  if (res.status === 403 || res.status === 429) { await markExhausted(env, 'google_tr'); throw new QuotaExhausted(`Google ${res.status}`); }
  if (!res.ok) throw new Error(`Google HTTP ${res.status}`);
  await addUsage(env, 'google_tr', chars(texts));
  const data: any = await res.json();
  return (data?.data?.translations ?? []).map((t: any) => String(t.translatedText ?? ''));
}
