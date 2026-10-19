// Renders Vybe brand assets from SVG. Run from repo root: node scripts/make-icons.mjs
import sharp from 'sharp';

const OUT = 'apps/mobile/assets';
const GRAPE = '#6C4CF5';
const CORAL = '#FF6B4A';
const LIME = '#C6F432';

// Location pin with a coral "heart" dot and a lime live ring: friends, nearby, now.
const pin = (fill, dot, ring, scale = 1) => `
  <g transform="translate(512 512) scale(${scale}) translate(-512 -512)">
    ${ring ? `<circle cx="752" cy="250" r="62" fill="none" stroke="${ring}" stroke-width="26"/><circle cx="752" cy="250" r="24" fill="${ring}"/>` : ''}
    <path d="M512 196c-139 0-246 104-246 238 0 172 192 344 230 376a24 24 0 0 0 32 0c38-32 230-204 230-376 0-134-107-238-246-238z" fill="${fill}"/>
    ${dot ? `<circle cx="512" cy="436" r="92" fill="${dot}"/>` : ''}
  </g>`;

const svg = (body, bg) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${bg ? `<rect width="1024" height="1024" fill="${bg}"/>` : ''}${body}</svg>`);

await sharp(svg(pin('#FFFFFF', CORAL, LIME), GRAPE)).png().toFile(`${OUT}/icon.png`);
// Adaptive icon: foreground must sit inside the central 66% safe zone.
await sharp(svg(pin('#FFFFFF', CORAL, LIME, 0.62))).png().toFile(`${OUT}/android-icon-foreground.png`);
await sharp(svg('', GRAPE)).png().toFile(`${OUT}/android-icon-background.png`);
await sharp(svg(pin('#FFFFFF', null, '#FFFFFF', 0.62))).png().toFile(`${OUT}/android-icon-monochrome.png`);
await sharp(svg(pin('#FFFFFF', CORAL, LIME))).resize(512, 512).png().toFile(`${OUT}/splash-icon.png`);
await sharp(svg(pin('#FFFFFF', CORAL, LIME), GRAPE)).resize(48, 48).png().toFile(`${OUT}/favicon.png`);
console.log('icons written to', OUT);
