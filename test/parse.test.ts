// Kiểm tra bộ đọc feed, ảnh đại diện, lọc từ khóa, chấm điểm, tách SQL — chạy: npm test
import { parseArxiv, parseFeed, parseListing, parsePageMeta, parseSitemap } from '../src/crawl/parse';
import { matchesKeywords, normalizeTitle, scoreItem } from '../src/util';
import { thumbSvg } from '../src/views/thumb';
import { rotationOrder } from '../src/ai/quota';
import { splitSql } from '../src/schema';
import { readFileSync } from 'fs';

let fail = 0;
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`); if (!cond) fail++; };

const ARXIV = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2611.01234v2</id>
    <published>2026-11-07T17:59:01Z</published>
    <title>Learning Dexterous
      Manipulation from Human Videos</title>
    <summary>  We present a vision-language-action model &amp; show results.  </summary>
    <author><name>An Nguyen</name></author>
    <author><name>B. Smith</name></author>
    <link href="http://arxiv.org/abs/2611.01234v2" rel="alternate" type="text/html"/>
  </entry>
</feed>`;
const a = parseArxiv(ARXIV);
ok(a.length === 1, 'arXiv: 1 bài');
ok(a[0].url === 'https://arxiv.org/abs/2611.01234', 'arXiv: link https, bỏ phiên bản');
ok(a[0].title === 'Learning Dexterous Manipulation from Human Videos', 'arXiv: tiêu đề gộp dòng');
ok(a[0].authors === 'An Nguyen, B. Smith', 'arXiv: tác giả');
ok(a[0].abstract.includes('vision-language-action model & show'), 'arXiv: tóm tắt giải mã ký tự');
ok(a[0].isPaper, 'arXiv: đánh dấu paper');

const RSS = `<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
<item><title>Bank deploys GenAI assistant</title><link>https://example.com/a</link><pubDate>Sat, 07 Nov 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>A <b>major</b> bank&#39;s new AI.</p>]]></description><dc:creator>Jane</dc:creator></item>
<item><title>Quarterly results</title><link>https://example.com/b</link><pubDate>Sat, 07 Nov 2026 09:00:00 GMT</pubDate><description>Profit up.</description></item>
</channel></rss>`;
const r = parseFeed(RSS);
ok(r.length === 2, 'RSS: 2 bài');
ok(r[0].abstract === "A major bank's new AI.", 'RSS: bỏ thẻ HTML');
ok(r[0].authors === 'Jane', 'RSS: tác giả dc:creator');

const YT = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/"><entry><title>New robot paper</title><link rel="alternate" href="https://www.youtube.com/watch?v=x"/><published>2026-11-06T12:00:00+00:00</published><author><name>Two Minute Papers</name></author><media:group><media:description>Robots learn.</media:description></media:group></entry></feed>`;
const y = parseFeed(YT);
ok(y[0]?.url === 'https://www.youtube.com/watch?v=x' && y[0]?.abstract === 'Robots learn.', 'YouTube Atom: link + mô tả');

ok(matchesKeywords('Bank deploys GenAI assistant', 'ai,genai'), 'Từ khóa: genai khớp');
ok(!matchesKeywords('Daily trading update', 'ai'), 'Từ khóa ngắn "ai" không khớp trong "trading"');
ok(matchesKeywords('Ngân hàng ứng dụng AI', 'ai'), 'Từ khóa "AI" khớp nguyên từ');
ok(matchesKeywords('anything', ''), 'Không có từ khóa = lấy hết');
ok(normalizeTitle('Đột phá: Robot  Học!') === 'dot pha robot hoc', 'Chuẩn hóa tiêu đề tiếng Việt');

const now = new Date('2026-11-08T00:00:00Z');
const sBank = scoreItem({ channel: 'tcnh', publishedAt: '2026-11-07T20:00:00Z', text: 'bank fraud LLM', sourceWeight: 14 }, now);
const sRobot = scoreItem({ channel: 'robotics', publishedAt: '2026-11-05T00:00:00Z', text: 'warehouse', sourceWeight: 10 }, now);
ok(sBank > sRobot && sBank <= 100, `Điểm: ngân hàng mới (${sBank}) > robot cũ (${sRobot})`);

const IMG = `<?xml version="1.0"?><rss xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
<item><title>A</title><link>https://ex.com/a</link><media:content url="https://cdn.ex.com/a.jpg" medium="image"/></item>
<item><title>B</title><link>https://ex.com/b</link><enclosure url="http://cdn.ex.com/b.png" type="image/png" length="1"/></item>
<item><title>C</title><link>https://ex.com/c</link><content:encoded><![CDATA[<p><img src="/px.gif" width="1"><img src="/img/c.webp"></p>]]></content:encoded></item>
<item><title>D</title><link>https://ex.com/d</link><description>&lt;img src="https://ex.com/d.jpg"&gt; text</description></item>
<item><title>E</title><link>https://ex.com/e</link><description>no image</description></item>
</channel></rss>`;
const im = parseFeed(IMG).map((x) => x.image ?? '-');
ok(im.join(' ') === 'https://cdn.ex.com/a.jpg https://cdn.ex.com/b.png https://ex.com/img/c.webp https://ex.com/d.jpg -', `Ảnh đại diện từ feed (${im.join(' ')})`);
ok(y[0]?.image === undefined, 'YouTube không có media:thumbnail trong mẫu → không ảnh');
const YT2 = YT.replace('<media:description>', '<media:thumbnail url="https://i.ytimg.com/vi/x/hqdefault.jpg" width="480" height="360"/><media:description>');
ok(parseFeed(YT2)[0]?.image === 'https://i.ytimg.com/vi/x/hqdefault.jpg', 'YouTube: lấy media:thumbnail');
ok(a[0].image === undefined, 'arXiv: không ảnh trong feed');
const svg = thumbSvg('The Robot Report', 'robotics');
ok(svg.startsWith('<svg') && svg.includes('Robot') && svg.includes('#0F7B6C'), 'Ảnh tự vẽ theo tên nguồn + màu kênh');
ok(thumbSvg('A & <B>', 'tcnh').includes('A &amp; &lt;B&gt;'), 'Ảnh tự vẽ: thoát ký tự đặc biệt');
const big = '<rss><channel>' + Array.from({ length: 80 }, (_, i) => `<item><title>T${i}</title><link>https://x/${i}</link><description><![CDATA[<p>${'word '.repeat(400)}</p>]]></description></item>`).join('') + '</channel></rss>';
const t0 = performance.now(); const bigItems = parseFeed(big); const ms = performance.now() - t0;
ok(bigItems.length === 60, `Feed lớn: cắt 60 bài (${bigItems.length})`);
console.log(`     (đọc feed ${(big.length / 1024).toFixed(0)} KB mất ${ms.toFixed(1)} ms)`);

// Quay vòng key: limit gemini 1000/ngày, azure 2tr, deepl 500k, google 500k
const fakeEnv = (used: Record<string, number>) => ({
  GEMINI_DAILY_REQUESTS: '1000', WORKERS_AI_DAILY_NEURONS: '10000', QUOTA_STOP_RATIO: '0.95', QUOTA_ROUND_RATIO: '0.5',
  DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: Object.entries(used).map(([provider, u]) => ({ provider, used: u })) }) }) }) },
}) as any;
const chain = ['gemini', 'azure', 'deepl', 'google_tr'] as const;
const rot = async (u: Record<string, number>) => (await rotationOrder(fakeEnv(u), [...chain])).join(',');
ok((await rot({})) === 'gemini,azure,deepl,google_tr', 'Vòng 1: bắt đầu từ key đầu');
ok((await rot({ gemini: 500 })) === 'azure,deepl,google_tr', 'Vòng 1: key 1 đủ 50% → sang key 2');
ok((await rot({ gemini: 500, azure: 1_000_000, deepl: 250_000 })) === 'google_tr', 'Vòng 1: tới key cuối');
ok((await rot({ gemini: 500, azure: 1_000_000, deepl: 250_000, google_tr: 250_000 })) === 'gemini,azure,deepl,google_tr', 'Vòng 2: quay lại key đầu');
ok((await rot({ gemini: 950, azure: 1_200_000, deepl: 250_000, google_tr: 250_000 })) === 'azure,deepl,google_tr', 'Vòng 2: key 1 đủ 95% → dùng tiếp key 2');
ok((await rot({ gemini: 950, azure: 1_900_000, deepl: 475_000, google_tr: 475_000 })) === '', 'Tất cả ≥95% → dừng hẳn');

const SM = `<urlset><url><loc>https://api-docs.deepseek.com/news/news261017</loc></url><url><loc>https://api-docs.deepseek.com/news/news0725</loc></url><url><loc>https://api-docs.deepseek.com/news/news260910</loc></url><url><loc>https://api-docs.deepseek.com/quick_start</loc></url></urlset>`;
const sm = parseSitemap(SM, '/news/news');
ok(sm.length === 2 && sm[0].url.endsWith('news261017') && sm[0].date.toISOString().startsWith('2026-10-17'), `Sitemap DeepSeek: ngày từ URL, mới trước (${sm.map((x) => x.date.toISOString().slice(0, 10)).join(',')})`);
const pm = parsePageMeta('<html><head><title>DeepSeek-V4.1 Release | DeepSeek API Docs</title><meta property="og:description" content="🚀 Here!"><meta property="og:image" content="/img/card.jpeg"></head>', 'https://api-docs.deepseek.com/news/x');
ok(pm.title === 'DeepSeek-V4.1 Release' && pm.description === '🚀 Here!' && pm.image === 'https://api-docs.deepseek.com/img/card.jpeg', `Đọc tiêu đề/mô tả/ảnh trang (${pm.title})`);

const LST = `<nav><a href="/discover">Discover</a><a href="/discover/">x</a></nav><a href="/discover/neos-hands?ref=1">NEO</a><a href="https://www.1x.tech/discover/bill-nash-cfo">CFO</a><a href="/discover/neos-hands#top">dup</a><a href="https://other.com/discover/x">ngoài</a><a href="/about">about</a>`;
const ls = parseListing(LST, 'https://www.1x.tech/discover', '/discover/');
ok(ls.join(' ') === 'https://www.1x.tech/discover/neos-hands https://www.1x.tech/discover/bill-nash-cfo', `Trang danh sách: lấy link bài, bỏ trùng/ngoài miền (${ls.join(' ')})`);
const pd = parsePageMeta('<head><meta property="article:published_time" content="2026-07-09T10:00:00Z"><title>NEO</title></head>', 'https://www.1x.tech/discover/neos-hands');
const pd2 = parsePageMeta('<head><script type="application/ld+json">{"datePublished": "2026-10-21"}</script><title>UR</title></head>', 'https://x');
ok(pd.published?.toISOString().startsWith('2026-07-09') === true && pd2.published?.toISOString().startsWith('2026-10-21') === true, 'Ngày đăng từ meta / JSON-LD');
const SM2 = `<urlset><url><loc>https://bostondynamics.com/news/a/</loc><lastmod>2023-09-13T15:05:43+00:00</lastmod></url><url><loc>https://bostondynamics.com/news/stretch/</loc><lastmod>2026-11-03T22:17:23+00:00</lastmod></url></urlset>`;
const sm2 = parseSitemap(SM2, '/news/');
ok(sm2[0].url.endsWith('stretch/') && sm2[0].date.toISOString().startsWith('2026-11-03'), 'Sitemap theo lastmod, mới nhất trước');

const counts = ['0001_init', '0002_sources', '0003_fulltext', '0004_sources_ai_labs', '0005_sources_robotics'].map((f) => splitSql(readFileSync(`migrations/${f}.sql`, 'utf8')).length);
ok(counts.join(',') === '8,1,2,1,1', `Tách SQL thành câu lệnh (${counts.join(',')})`);
ok(splitSql('-- a; b\nCREATE TABLE x (a TEXT); -- c;\nINSERT INTO x VALUES (1);').length === 2, 'Tách SQL bỏ dấu ; trong chú thích');

console.log(fail ? `\n${fail} kiểm tra lỗi` : '\nTất cả kiểm tra đạt');
process.exit(fail ? 1 : 0);
