// Renders Vybe brand assets from SVG. Run from repo root: node scripts/make-icons.mjs
// The mark: a "V" drawn by two friends (coral + lime dots) whose paths meet at one place (the pin tip).
// Geometry is mirrored in apps/mobile/src/features/brand/Logo.tsx; keep the two in sync.
import sharp from 'sharp';

const OUT = 'apps/mobile/assets';
const GRAPE = '#6C4CF5';
const GRAPE_DEEP = '#4B2FD1';
const CORAL = '#FF6B4A';
const LIME = '#C6F432';

// 1024 canvas. Arms run from each friend dot down to the shared tip.
const L = [318, 318];
const R = [706, 318];
const TIP = [512, 742];

const mark = ({ arm = '#FFFFFF', left = CORAL, right = LIME, scale = 1, ring = true }) => `
  <g transform="translate(512 530) scale(${scale}) translate(-512 -530)">
    ${ring ? `<ellipse cx="${TIP[0]}" cy="${TIP[1] + 58}" rx="118" ry="30" fill="none" stroke="${arm}" stroke-opacity="0.35" stroke-width="16"/>` : ''}
    <path d="M${L[0]} ${L[1]} L${TIP[0]} ${TIP[1]} L${R[0]} ${R[1]}" fill="none" stroke="${arm}" stroke-width="124" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${L[0]}" cy="${L[1]}" r="96" fill="${left}" stroke="${arm}" stroke-width="28"/>
    <circle cx="${R[0]}" cy="${R[1]}" r="96" fill="${right}" stroke="${arm}" stroke-width="28"/>
  </g>`;

const bg = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${GRAPE}"/><stop offset="1" stop-color="${GRAPE_DEEP}"/></linearGradient></defs><rect width="1024" height="1024" fill="url(#g)"/>`;
const svg = (body, background = '') =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${background}${body}</svg>`);

await sharp(svg(mark({}), bg)).png().toFile(`${OUT}/icon.png`);
// Adaptive icon: the foreground must sit inside the central 66% safe zone.
await sharp(svg(mark({ scale: 0.6 }))).png().toFile(`${OUT}/android-icon-foreground.png`);
await sharp(svg('', bg)).png().toFile(`${OUT}/android-icon-background.png`);
// Themed (monochrome) icon: Android tints a single-colour silhouette, so everything is solid white.
await sharp(svg(mark({ scale: 0.6, left: '#FFFFFF', right: '#FFFFFF', ring: false }))).png().toFile(`${OUT}/android-icon-monochrome.png`);
await sharp(svg(mark({}))).resize(512, 512).png().toFile(`${OUT}/splash-icon.png`);
await sharp(svg(mark({}), bg)).resize(48, 48).png().toFile(`${OUT}/favicon.png`);
console.log('icons written to', OUT);
