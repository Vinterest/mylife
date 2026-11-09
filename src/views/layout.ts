import { html, raw } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import { CHANNELS, CHANNEL_ORDER, vnDateLong } from '../util';
import { LOGO_MARK_SVG } from '../brand';
import type { Channel } from '../types';

type H = HtmlEscapedString | Promise<HtmlEscapedString>;

export const CSS = `
:root{--ac:#0077B6;--ink:#14202B;--mut:#56626E;--line:#E6EAEE;--tint:#F4F8FB;--tintb:#DCEAF4}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:'Lexend Deca',system-ui,-apple-system,sans-serif;font-size:13px;line-height:1.45;color:var(--ink);background:#fff}
@media (max-width:640px){body{font-size:14px}.tabs a{padding:.65em .55em .55em;gap:.35em}.soonlbl{display:none}}
a{color:inherit;text-decoration:none}
a:hover{color:var(--ac);text-decoration:underline}
.mut{color:var(--mut)}
.wrap{max-width:1240px;margin:0 auto;padding:0 16px}
.util{background:#F4F5F7;border-bottom:1px solid #E3E8ED;font-size:.85em}
.util .wrap{display:flex;justify-content:space-between;align-items:center;gap:1em;flex-wrap:wrap;padding-top:.5em;padding-bottom:.5em}
.util nav{display:flex;gap:1.2em;flex-wrap:wrap}
header.top{display:flex;align-items:center;gap:1em;flex-wrap:wrap;padding-top:.9em;padding-bottom:.3em}
.logo{display:inline-flex;align-items:center;gap:.4em;font-size:1.7em;font-weight:700;letter-spacing:.12em;color:var(--ink,#14202B);text-decoration:none}
.logo-mark{width:1.25em;height:1.25em;flex:none}
.tabs{display:flex;flex-wrap:wrap;border-bottom:1px solid #DFE4EA}
.tabs a{display:inline-flex;align-items:center;gap:.45em;padding:.8em .85em .7em;font-weight:600;color:var(--ink);border-bottom:3px solid transparent;white-space:nowrap}
.tabs a:hover{text-decoration:none;border-bottom-color:#C9D1DA}
.tabs a.cur{border-bottom-color:var(--ac)}
.tabs a.soon{color:#6B7782;font-weight:500}
.gd{width:.55em;height:.55em;border-radius:2px;display:inline-block}
.sub{display:flex;flex-wrap:wrap;gap:.2em 1.3em;font-size:.92em;padding-top:.6em;padding-bottom:.6em;border-bottom:1px solid var(--line)}
.sub a{color:#2D3946}
.sub a.cur{color:var(--ac);font-weight:700}
.sub a.soon{color:#6B7782}
.sub .cnt{display:inline-block;margin-left:.3em;font-weight:600;color:var(--ac)}
.sub .cnt.z{color:#8A949D;font-weight:400}
main{padding-top:1.2em;padding-bottom:3em;display:flex;flex-direction:column;gap:1.8em}
.kick{font-size:.82em;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--ac)}
.sh{display:flex;align-items:baseline;gap:.8em;border-top:2px solid var(--ac);padding-top:.55em;margin:0 0 .4em;flex-wrap:wrap}
.sh h2{margin:0;font-size:1em;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--ac)}
.sh .more{margin-left:auto;font-size:.85em;color:var(--mut)}
h1.t1{font-size:1.75em;line-height:1.25;font-weight:700;margin:0}
.t2{font-size:1.2em;line-height:1.3;font-weight:600;margin:0}
.t3{font-size:1.04em;line-height:1.38;font-weight:600;margin:0}
.sum{font-size:1em;line-height:1.55;color:#2D3946;margin:0}
.meta{font-size:.85em;color:var(--mut)}
.cols{display:flex;flex-wrap:wrap;gap:1.6em;align-items:flex-start}
.colmain{flex:2 1 560px;min-width:0}
.colside{flex:1 1 300px;min-width:0;display:flex;flex-direction:column;gap:1.2em}
.box{border:1px solid #E3E8ED;border-radius:6px;padding:.85em 1em;display:flex;flex-direction:column;gap:.5em;background:#fff}
.kv{display:flex;justify-content:space-between;gap:.6em}
.bar{height:5px;border-radius:3px;background:#E3E8ED;overflow:hidden}
.bar i{display:block;height:100%;background:var(--ac)}
.bar i.warn{background:#C2410C}
.rw{display:flex;gap:.8em;align-items:flex-start;padding:.8em 0;border-top:1px solid var(--line)}
.rw:first-of-type{border-top:0}
.th{flex:none;display:block;width:176px;aspect-ratio:16/10;border-radius:6px;overflow:hidden;background:#EEF2F5}
.th img{width:100%;height:100%;object-fit:cover;display:block}
.th.lg{width:100%;margin-bottom:.5em}
.th.sm{width:84px}
.rdmark{font-size:.82em;color:var(--mut);padding-top:.8em;border-top:1px solid var(--line)}
.rdmark+.rw{border-top:0;padding-top:.3em}
.newb{display:inline-block;height:1.15em;width:auto;vertical-align:-.2em;margin-right:.35em}
.seg.sm{margin-left:auto;font-size:.85em}
.seg.sm a{padding:0 .8em;min-height:30px}
.lead{display:flex;flex-direction:column;gap:.25em;padding:0 0 .7em}
.lix{display:flex;gap:.65em;align-items:flex-start;padding:.6em 0;border-top:1px solid var(--line)}
.lix>div{display:flex;flex-direction:column;gap:.25em;min-width:0}
@media (max-width:640px){.rw .th{width:104px;order:2}.rw{gap:.7em}}
.score{flex:none;width:2.6em;height:2.6em;border-radius:6px;background:#EAF4FB;color:#005A8C;font-weight:700;display:flex;align-items:center;justify-content:center}
.acts{display:flex;gap:1.1em;flex-wrap:wrap;align-items:center;font-size:.85em}
.acts a,.acts button.l{font-weight:600;color:var(--ac)}
button.l{background:none;border:0;padding:0;font:inherit;cursor:pointer}
button.l:hover{text-decoration:underline}
form.inline{display:inline}
.li{display:flex;flex-direction:column;gap:.25em;padding:.6em 0;border-top:1px solid var(--line)}
.li:first-of-type{border-top:0;padding-top:0}
.grid4{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:1.6em}
.st{font-size:.8em;font-weight:700;padding:.2em .6em;border-radius:4px;white-space:nowrap}
.st.ai{background:#EAF4FB;color:#005A8C}
.st.wait{background:#FCEBDD;color:#8A340A}
.st.err{background:#FDEDE9;color:#9A2A14}
.st.ok{background:#E9F5EA;color:#2B6E2F}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 1em;border-radius:6px;background:var(--ac);color:#fff;font-weight:600;font-size:.95em;border:0;font-family:inherit;cursor:pointer}
.btn:hover{color:#fff;text-decoration:none;filter:brightness(1.08)}
.btn2{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 1em;border-radius:6px;background:#fff;color:var(--ac);font-weight:600;font-size:.95em;border:1px solid var(--ac);font-family:inherit;cursor:pointer}
.why{font-size:.95em;line-height:1.5;background:var(--tint);border-left:3px solid var(--ac);padding:.5em .75em}
.tbl{width:100%;border-collapse:collapse;font-size:.92em}
.tbl th,.tbl td{text-align:left;padding:.5em .6em;border-bottom:1px solid var(--line);vertical-align:top}
.tbl th{font-size:.85em;color:var(--mut);font-weight:700}
.scroll{overflow-x:auto}
.empty{padding:1.2em;border:1px dashed #C9D1DA;border-radius:6px;color:var(--mut)}
.pager{display:flex;gap:1em;justify-content:space-between;padding-top:1em}
`;

export const TABS: { id: string; label: string; href: string; color?: string; live: boolean }[] = [
  { id: 'home', label: 'Hôm nay', href: '/', live: true },
  { id: 'g1', label: 'Công việc', href: '/sap-co/cong-viec', color: '#1F5FBF', live: false },
  { id: 'g2', label: 'Học tập AI', href: '/hoc-tap', color: '#0077B6', live: true },
  { id: 'g3', label: 'Tài chính', href: '/sap-co/tai-chinh', color: '#C2410C', live: false },
  { id: 'g4', label: 'Gia đình', href: '/sap-co/gia-dinh', color: '#6A3BB8', live: false },
  { id: 'g5', label: 'Dự án', href: '/sap-co/du-an', color: '#2B6E2F', live: false },
];

export function g2Sub(cur: string): H {
  const items: { id: string; label: string; href: string; live: boolean }[] = [
    { id: 'today', label: 'Hôm nay', href: '/hoc-tap', live: true },
    ...CHANNEL_ORDER.map((c) => ({ id: c, label: CHANNELS[c].short, href: `/hoc-tap/kenh/${CHANNELS[c].slug}`, live: true })),
    { id: 'inbox', label: 'Hộp nhặt', href: '/hoc-tap/hop-nhat', live: true },
    { id: 'read', label: 'Đã đọc', href: '/hoc-tap/da-doc', live: true },
    { id: 'notes', label: 'Sổ tay', href: '/hoc-tap/so-tay', live: true },
    { id: 'quota', label: 'Nguồn & hạn mức', href: '/hoc-tap/han-muc', live: true },
  ];
  return html`<nav class="wrap sub" aria-label="Học tập AI">${items.map(
    (i) => html`<a class="${i.id === cur ? 'cur' : i.live ? '' : 'soon'}" href="${i.href}">${i.label}${CHANNEL_ORDER.includes(i.id as Channel) || ['inbox', 'read', 'notes'].includes(i.id) ? raw(`<!--cnt:${i.id}-->`) : ''}</a>`
  )}</nav>`;
}

export function page(opts: { title: string; tab: string; sub?: H; body: H; badgeCount?: number }): H {
  return html`<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#ffffff">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="MyLife">
<link rel="manifest" href="/manifest.webmanifest?v=5">
<link rel="icon" href="/favicon.svg?v=5" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=5">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lexend+Deca:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/app.css?v=9">
<title>${opts.title} · MyLife</title>
</head>
<body>
<div class="util"><div class="wrap"><span class="mut">${vnDateLong()} · Hà Nội</span><nav><a class="mut" href="/hoc-tap/han-muc">Nguồn &amp; hạn mức</a><a href="/hoc-tap" style="font-weight:600">Sơn</a></nav></div></div>
<header class="wrap top"><a class="logo" href="/" aria-label="MyLife — về trang chủ">${raw(LOGO_MARK_SVG)}<span>MYLIFE</span></a><span class="mut" style="font-size:.9em">Trung tâm điều hành của Sơn</span></header>
<nav class="wrap tabs" aria-label="Không gian">${TABS.map(
    (t) => html`<a class="${t.id === opts.tab ? 'cur' : t.live ? '' : 'soon'}" href="${t.href}">${t.color ? html`<span class="gd" style="background:${t.color}"></span>` : ''}${t.label}${t.live ? '' : html` <span class="mut soonlbl" style="font-weight:500;font-size:.85em">· sắp có</span>`}</a>`
  )}</nav>
${opts.sub ?? ''}
<main class="wrap">${opts.body}</main>
<script>if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{})}</script>
</body>
</html>`;
}

export { html, raw };
