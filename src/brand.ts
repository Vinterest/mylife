/** Logo MyLife · phương án 5 "Sao dẫn đường": sao bốn cánh kiểu kim la bàn, cánh trên xanh, tâm cam. */

const STAR = 'M50 8 L58.5 41.5 L92 50 L58.5 58.5 L50 92 L41.5 58.5 L8 50 L41.5 41.5 Z';

/** Hình logo trên nền sáng (đầu trang). */
export const LOGO_MARK_SVG = `<svg class="logo-mark" viewBox="0 0 100 100" width="34" height="34" aria-hidden="true"><circle cx="50" cy="50" r="44" fill="none" stroke="#C9D6E2" stroke-width="3"/><path d="${STAR}" fill="#1F3A5F"/><path d="M50 8 L58.5 41.5 L50 50 Z" fill="#0A8FDC"/><path d="M50 8 L41.5 41.5 L50 50 Z" fill="#38B2F5"/><circle cx="50" cy="50" r="6" fill="#FF8A1F"/></svg>`;

/** Biểu tượng app (nền xanh đậm, sao trắng). `rounded` = bo góc cho favicon/SVG; PNG cho iPhone để vuông (iOS tự bo). */
export function appIconSvg(rounded: boolean): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" ${rounded ? 'rx="22"' : ''} fill="#1F3A5F"/><g transform="translate(13 13) scale(.74)"><path d="${STAR}" fill="#FFFFFF"/><path d="M50 8 L58.5 41.5 L50 50 Z" fill="#38B2F5"/><path d="M50 8 L41.5 41.5 L50 50 Z" fill="#7CCBF7"/><circle cx="50" cy="50" r="6.5" fill="#FF9C42"/></g></svg>`;
}

/** Favicon tab trình duyệt: bỏ chi tiết nhỏ để 16 px vẫn rõ. */
export const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#1F3A5F"/><path d="M50 8 L60 40 L92 50 L60 60 L50 92 L40 60 L8 50 L40 40 Z" fill="#FFFFFF"/><circle cx="50" cy="50" r="9" fill="#FF9C42"/></svg>`;
