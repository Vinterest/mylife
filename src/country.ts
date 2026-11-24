import { detectLang, type Lang } from './lang';

/*
 * Ưu tiên tin AI theo quốc gia: Mỹ, Trung Quốc, Indonesia, Malaysia, Thái Lan, Philippines, Hàn Quốc, Myanmar,
 * Singapore, Việt Nam. Nhận nước từ tên nước / thành phố / công ty, ngân hàng lớn nhắc trong tiêu đề + mô tả,
 * và từ ngôn ngữ bài (bài tiếng Thái → Thái Lan…).
 *   - Có nhắc nước ưu tiên        → +12 điểm
 *   - Chỉ nhắc các nước khác       → −8 điểm
 *   - Không gắn nước nào (bài nghiên cứu chung…) → giữ nguyên
 */

export type Country = 'US' | 'CN' | 'ID' | 'MY' | 'TH' | 'PH' | 'KR' | 'MM' | 'SG' | 'VN';
export const PRIORITY_BONUS = 12;
export const OTHER_PENALTY = -8;

export const COUNTRY_NAME: Record<Country, string> = {
  US: 'Mỹ', CN: 'Trung Quốc', ID: 'Indonesia', MY: 'Malaysia', TH: 'Thái Lan', PH: 'Philippines',
  KR: 'Hàn Quốc', MM: 'Myanmar', SG: 'Singapore', VN: 'Việt Nam',
};

// Không phân biệt hoa thường (tên dài, ít nhầm).
const CI: Record<Country, string[]> = {
  US: ['united states', 'america', 'american', 'silicon valley', 'washington', 'white house', 'new york', 'california', 'san francisco', 'seattle', 'texas', 'pentagon', 'openai', 'anthropic', 'google', 'deepmind', 'microsoft', 'nvidia', 'amazon', 'aws', 'tesla', 'jpmorgan', 'goldman sachs', 'citigroup', 'wells fargo', 'bank of america', 'boston dynamics', 'meta ai', 'meta platforms', 'facebook', 'instagram', 'llama', 'federal reserve', 'mỹ', 'hoa kỳ'],
  CN: ['china', 'chinese', 'beijing', 'shanghai', 'shenzhen', 'hangzhou', 'hong kong', 'alibaba', 'baidu', 'tencent', 'deepseek', 'huawei', 'bytedance', 'moonshot', 'zhipu', 'xiaomi', 'unitree', 'ubtech', 'agibot', 'qwen', 'kimi', 'ant group', 'wechat', 'trung quốc', '中国', '中國'],
  ID: ['indonesia', 'jakarta', 'gojek', 'tokopedia', 'bank mandiri', 'bank central asia', 'bank rakyat', 'telkom indonesia', 'ojk', 'otoritas jasa keuangan'],
  MY: ['malaysia', 'malaysian', 'kuala lumpur', 'maybank', 'cimb', 'bank negara', 'public bank', 'rhb', 'petronas'],
  TH: ['thailand', 'thai ', 'bangkok', 'kasikorn', 'kbank', 'siam commercial', 'krungthai', 'krungsri', 'bank of thailand', 'thái lan', 'ประเทศไทย', 'ไทย'],
  PH: ['philippines', 'philippine', 'filipino', 'manila', 'gcash', 'bangko sentral', 'unionbank', 'metrobank', 'ayala'],
  KR: ['korea', 'korean', 'seoul', 'samsung', 'naver', 'kakao', 'hyundai', 'shinhan', 'kookmin', 'woori', 'hana bank', 'hàn quốc', '한국'],
  MM: ['myanmar', 'burma', 'burmese', 'yangon', 'naypyidaw'],
  SG: ['singapore', 'ocbc', 'temasek', 'sea limited', 'monetary authority of singapore'],
  VN: ['vietnam', 'viet nam', 'việt nam', 'vietnamese', 'hanoi', 'hà nội', 'ho chi minh', 'hồ chí minh', 'vingroup', 'viettel', 'vnpay', 'momo', 'techcombank', 'vietcombank', 'vietinbank', 'bidv', 'vpbank', 'mb bank', 'ngân hàng nhà nước'],
};
// Phân biệt hoa thường, đứng riêng (viết tắt / tên ngắn dễ nhầm với từ thường).
const CS: Partial<Record<Country, string[]>> = {
  US: ['U.S.', 'US', 'USA', 'Apple', 'xAI'],
  ID: ['BCA', 'BRI', 'BNI'],
  KR: ['LG', 'SK'],
  TH: ['SCB'],
  PH: ['BDO', 'BSP'],
  SG: ['DBS', 'UOB', 'MAS', 'Grab'],
  VN: ['FPT', 'VNG'],
};
// Các nước khác hay xuất hiện trong tin AI (không ưu tiên lúc này).
const OTHER = ['japan', 'japanese', 'tokyo', 'india', 'indian', 'bengaluru', 'mumbai', 'united kingdom', 'britain', 'british', 'london', 'europe', 'european', 'germany', 'german', 'france', 'french', 'paris', 'canada', 'canadian', 'australia', 'australian', 'israel', 'uae', 'dubai', 'abu dhabi', 'saudi', 'qatar', 'russia', 'brazil', 'mexico', 'africa', 'nigeria', 'kenya', 'turkey', 'spain', 'italy', 'netherlands', 'sweden', 'switzerland', 'taiwan', 'pakistan', 'bangladesh', 'sri lanka', 'cambodia', 'laos', 'mistral', 'sakana', 'softbank', 'toyota', 'sony'];
const OTHER_CS = ['UK', 'EU'];

const LANG_COUNTRY: Partial<Record<Lang, Country>> = { th: 'TH', id: 'ID', ms: 'MY', ko: 'KR', zh: 'CN', my: 'MM', vi: 'VN' };

const esc = (k: string) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const word = (k: string, flags = '') => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(k)}(?=$|[^\\p{L}\\p{N}])`, `u${flags}`);
// Mỗi từ khóa kèm chuỗi lọc nhanh: chỉ chạy biểu thức khi chuỗi có trong bài (giữ CPU thấp, gói Free 10 ms/lượt).
type Rule = { needle: string; ci: boolean; re: RegExp };
const ciRule = (k: string): Rule => ({ needle: k.trim().toLowerCase(), ci: true, re: /[^\x00-\x7F]/.test(k) && !/[a-zà-ỹ]/i.test(k) ? new RegExp(esc(k)) : word(k.trim(), 'i') });
const csRule = (k: string): Rule => ({ needle: k, ci: false, re: word(k) });
const CI_RE = Object.fromEntries(Object.entries(CI).map(([c, ks]) => [c, ks.map(ciRule)])) as Record<Country, Rule[]>;
const CS_RE = Object.fromEntries(Object.entries(CS).map(([c, ks]) => [c, ks!.map(csRule)])) as Partial<Record<Country, Rule[]>>;
const OTHER_RE = [...OTHER.map(ciRule), ...OTHER_CS.map(csRule)];
const hit = (r: Rule, t: string, lower: string) => (r.ci ? lower.includes(r.needle) : t.includes(r.needle)) && r.re.test(t);

export interface CountryHit {
  /** Nước ưu tiên được nhắc nhiều nhất; 'other' = chỉ nhắc nước khác; '' = không gắn nước nào. */
  code: Country | 'other' | '';
  delta: number;
}

export function countryOf(text: string): CountryHit {
  const t = text.slice(0, 2000);
  const lower = t.toLowerCase();
  const counts = new Map<Country, number>();
  const lc = LANG_COUNTRY[detectLang(t)];
  if (lc) counts.set(lc, 2);
  for (const c of Object.keys(CI) as Country[]) {
    const n = CI_RE[c].filter((r) => hit(r, t, lower)).length + (CS_RE[c]?.filter((r) => hit(r, t, lower)).length ?? 0);
    if (n) counts.set(c, (counts.get(c) ?? 0) + n);
  }
  if (counts.size) {
    // Nước nhắc nhiều nhất; hòa thì ưu tiên các nước trong khu vực (đứng sau Mỹ trong danh sách) để nhãn có ý nghĩa hơn.
    const order: Country[] = ['VN', 'TH', 'ID', 'MY', 'PH', 'SG', 'MM', 'KR', 'CN', 'US'];
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]))[0][0];
    return { code: best, delta: PRIORITY_BONUS };
  }
  if (OTHER_RE.some((r) => hit(r, t, lower))) return { code: 'other', delta: OTHER_PENALTY };
  return { code: '', delta: 0 };
}
