/*
 * Nhận diện ngôn ngữ của bài crawl về, để tự dịch các bài tiếng châu Á sang tiếng Việt.
 * - Chữ riêng (Thái, Lào, Khmer, Myanmar, Hàn, Nhật, Trung): nhận theo bảng chữ.
 * - Chữ Latinh: tiếng Việt nhận theo dấu; tiếng Indonesia / Mã Lai nhận theo các từ hay gặp (yang, dan, untuk…).
 * Không khớp gì → coi là tiếng Anh (không tự dịch).
 */

export type Lang = 'en' | 'vi' | 'th' | 'lo' | 'km' | 'my' | 'ko' | 'ja' | 'zh' | 'id' | 'ms';

/** Các ngôn ngữ châu Á được tự dịch sang tiếng Việt. */
export const AUTO_LANGS: Lang[] = ['th', 'id', 'ms', 'ko', 'ja', 'zh', 'lo', 'km', 'my'];

export const LANG_NAME: Record<Lang, string> = {
  en: 'tiếng Anh', vi: 'tiếng Việt', th: 'tiếng Thái', lo: 'tiếng Lào', km: 'tiếng Khmer', my: 'tiếng Myanmar',
  ko: 'tiếng Hàn', ja: 'tiếng Nhật', zh: 'tiếng Trung', id: 'tiếng Indonesia', ms: 'tiếng Mã Lai',
};

/** Mã giọng đọc (Web Speech) cho từng ngôn ngữ. */
export const SPEECH_LANG: Record<Lang, string> = {
  en: 'en-US', vi: 'vi-VN', th: 'th-TH', lo: 'lo-LA', km: 'km-KH', my: 'my-MM',
  ko: 'ko-KR', ja: 'ja-JP', zh: 'zh-CN', id: 'id-ID', ms: 'ms-MY',
};

export const isAuto = (l: Lang) => AUTO_LANGS.includes(l);
export const capName = (l: Lang) => LANG_NAME[l].charAt(0).toUpperCase() + LANG_NAME[l].slice(1);

const SCRIPTS: [Lang, RegExp][] = [
  ['th', /[฀-๿]/g],
  ['lo', /[຀-໿]/g],
  ['km', /[ក-៿]/g],
  ['my', /[က-႟]/g],
  ['ko', /[가-힯ᄀ-ᇿ㄰-㆏]/g],
];
const KANA = /[぀-ヿ]/g;
const HAN = /[一-鿿㐀-䶿]/g;
const LATIN = /[A-Za-zÀ-ỹ]/g;
const VI_MARKS = /[ạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹđơưăâêô]/gi;

const ID_WORDS = new Set(
  'yang dan di ke dari untuk dengan ini itu pada dalam adalah akan tidak juga oleh bisa sudah telah atau karena lebih sebagai bagi serta namun hingga kepada terhadap melalui menjadi dapat secara kecerdasan buatan perusahaan bank keuangan nasabah layanan digital tersebut masih baru mulai kini minta tengah kata saat kembali agar guna lewat hadir rilis luncurkan pakai kerja sama bagaimana mengapa siapa kami kita mereka'.split(' ')
);
const MS_MARKERS = /\b(kerana|ialah|iaitu|daripada|boleh|syarikat|kerajaan|bagaimanapun|untuk\s+mereka\s+yang)\b/i;
// Từ tiếng Anh rất hay gặp — có nhiều thì chắc chắn không phải tiếng Indonesia.
const EN_WORDS = new Set('the of and to in for on with is are from by as at its this that'.split(' '));

// Từ có tiền tố/hậu tố đặc trưng tiếng Indonesia/Mã Lai: melancarkan, perbankan, keamanan, layanannya…
const ID_MORPH = /^(?:me[nmr]?g?|ber|per|ter|ke|pe[nm]?)[a-z]{3,}(?:kan|an|nya)$|^[a-z]{3,}nya$/;

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

export function detectLang(text: string | null | undefined): Lang {
  const s = (text ?? '').slice(0, 3000);
  if (!s.trim()) return 'en';
  const latin = count(s, LATIN);
  // Chữ riêng: cần đủ nhiều so với chữ Latinh (tránh bài tiếng Anh có trích vài chữ Hàn/Thái).
  const kana = count(s, KANA), han = count(s, HAN);
  if (kana >= 2 && (kana + han) * 3 >= latin) return 'ja';
  for (const [l, re] of SCRIPTS) {
    const n = count(s, re);
    if (n >= 3 && n * 3 >= latin) return l;
  }
  if (han >= 3 && han * 3 >= latin) return 'zh';
  if (count(s, VI_MARKS) >= 3) return 'vi';
  const words = s.toLowerCase().match(/[a-z]+/g) ?? [];
  if (words.length >= 3) {
    let idn = 0, en = 0;
    for (const w of words) { if (ID_WORDS.has(w) || ID_MORPH.test(w)) idn++; if (EN_WORDS.has(w)) en++; }
    if (idn >= 2 && idn > en * 2 && idn / words.length >= 0.1) return MS_MARKERS.test(s) ? 'ms' : 'id';
  }
  return 'en';
}

/** Ngôn ngữ gốc của một bài: xét tiêu đề + đoạn mô tả. */
export function itemLang(it: { title_en: string; abstract_en?: string | null }): Lang {
  return detectLang(`${it.title_en}\n${(it.abstract_en ?? '').slice(0, 600)}`);
}
