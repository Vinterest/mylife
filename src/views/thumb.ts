/** Ảnh đại diện tự vẽ (SVG) cho nguồn không có thumbnail: nền màu theo kênh + tên nguồn. */

const CH: Record<string, { bg: string; fg: string; label: string }> = {
  ai: { bg: '#0077B6', fg: '#E3F2FB', label: 'AI THẾ GIỚI' },
  embodied: { bg: '#4F46B5', fg: '#ECEBFB', label: 'EMBODIED AI' },
  robotics: { bg: '#0F7B6C', fg: '#E1F4F1', label: 'ROBOTICS' },
  tcnh: { bg: '#B4561B', fg: '#FBEDE3', label: 'TÀI CHÍNH – NGÂN HÀNG' },
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function wrap(text: string, max: number, lines: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (cur && (cur + ' ' + w).length > max) { out.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  if (out.length > lines) { out.length = lines; out[lines - 1] += '…'; }
  return out;
}

export function thumbSvg(sourceName: string, channel: string): string {
  const c = CH[channel] ?? CH.ai;
  const [main, sub = ''] = sourceName.split(' · ');
  const lines = wrap(main, 13, 3);
  const size = lines.length === 1 && main.length <= 8 ? 46 : 32;
  const lh = size * 1.12;
  const y0 = 108 - ((lines.length - 1) * lh) / 2 + size * 0.35;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" width="320" height="200">
<rect width="320" height="200" fill="${c.bg}"/>
<circle cx="292" cy="-10" r="90" fill="#fff" opacity=".07"/><circle cx="20" cy="210" r="70" fill="#fff" opacity=".06"/>
<text x="22" y="36" font-family="Lexend Deca,Arial,Helvetica,sans-serif" font-size="13" font-weight="700" letter-spacing="1.5" fill="${c.fg}" opacity=".85">${esc(c.label)}</text>
${lines.map((l, i) => `<text x="22" y="${(y0 + i * lh).toFixed(1)}" font-family="Lexend Deca,Arial,Helvetica,sans-serif" font-size="${size}" font-weight="700" fill="#fff">${esc(l)}</text>`).join('\n')}
${sub ? `<text x="22" y="180" font-family="Lexend Deca,Arial,Helvetica,sans-serif" font-size="14" fill="${c.fg}">${esc(sub.slice(0, 34))}</text>` : ''}
</svg>`;
}
