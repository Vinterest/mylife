import { chromium } from 'playwright';
import fs from 'fs';
const STAR='M50 8 L58.5 41.5 L92 50 L58.5 58.5 L50 92 L41.5 58.5 L8 50 L41.5 41.5 Z';
const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#1F3A5F"/><g transform="translate(13 13) scale(.74)"><path d="${STAR}" fill="#FFFFFF"/><path d="M50 8 L58.5 41.5 L50 50 Z" fill="#38B2F5"/><path d="M50 8 L41.5 41.5 L50 50 Z" fill="#7CCBF7"/><circle cx="50" cy="50" r="6.5" fill="#FF9C42"/></g></svg>`;
const b=await chromium.launch(); const out={};
for (const s of [180,192,512]) { const p=await b.newPage({viewport:{width:s,height:s}}); await p.setContent(`<html><body style="margin:0">${svg.replace('<svg ',`<svg width="${s}" height="${s}" `)}</body></html>`); const buf=await p.screenshot({clip:{x:0,y:0,width:s,height:s}}); out[s]=buf.toString('base64'); fs.writeFileSync(`/tmp/claude-0/icon-${s}.png`,buf); }
await b.close();
fs.writeFileSync('src/icon-png.ts', `// Biểu tượng app MyLife (logo "Sao dẫn đường") dạng PNG: iPhone (180) và PWA (192, 512). Tạo từ src/brand.ts.\nexport const APPLE_TOUCH_PNG_B64 = '${out[180]}';\nexport const ICON_192_PNG_B64 = '${out[192]}';\nexport const ICON_512_PNG_B64 = '${out[512]}';\n`);
