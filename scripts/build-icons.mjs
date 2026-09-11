// Generates every app-icon asset from one vector definition: the AMBGro centile
// fan (three fanning reference curves with a plotted patient point) in white on
// the brand blue.
//
//   node scripts/build-icons.mjs      (or: npm run icons)
//
// Re-run this after `npx cap add android` regenerates the native project, or the
// launcher falls back to Capacitor's default logo.
//
// Safe zones — why each target uses a different scale:
//   Android adaptive icon: the canvas is 108dp but only the centre 72dp is
//     guaranteed visible; round/squircle masks crop the rest. Art must sit inside
//     a circle of radius 36/108 = 0.333 of the canvas.
//   PWA maskable: the guaranteed region is a circle of radius 0.40 of the canvas.
//   Round launcher icon: a full circle, radius 0.5, kept back a little for air.
// The art's own bounding radius is ~233/512 = 0.456 of the canvas at scale 1, so
// each scale below is chosen to land inside the relevant circle.

import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const BRAND = '#2563eb';
const WHITE = '#ffffff';

const TILE = 1; // rounded/square tile — art already carries its own margin
const MASKABLE = 0.84; // inside the 0.40-radius circle
const ADAPTIVE = 0.7; // inside the 0.333-radius circle
const ROUND = 0.92; // inside the full circle, with air

// The plotted point sits on the bold middle curve at t = 0.8.
const MARK = { x: 344, y: 234, r: 29, w: 15 };

/** The centile fan, in a 512 space, bounding box centred on (256,256). */
function art(scale) {
  return (
    `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">` +
    `<g fill="none" stroke="${WHITE}" stroke-linecap="round">` +
    `<path d="M92 324C190 300 286 214 420 100" stroke-opacity=".45" stroke-width="15"/>` +
    `<path d="M92 412C190 400 286 338 420 256" stroke-opacity=".45" stroke-width="15"/>` +
    `<path d="M92 368C190 350 286 276 420 178" stroke-width="32"/>` +
    `</g>` +
    `<circle cx="${MARK.x}" cy="${MARK.y}" r="${MARK.r}" fill="${BRAND}"/>` +
    `<circle cx="${MARK.x}" cy="${MARK.y}" r="${MARK.r}" fill="none" stroke="${WHITE}" stroke-width="${MARK.w}"/>` +
    `</g>`
  );
}

function backdrop(shape) {
  if (shape === 'none') return ''; // adaptive foreground: background is a colour resource
  if (shape === 'circle') return `<circle cx="256" cy="256" r="256" fill="${BRAND}"/>`;
  if (shape === 'square') return `<rect width="512" height="512" fill="${BRAND}"/>`;
  return `<rect width="512" height="512" rx="112" fill="${BRAND}"/>`;
}

function iconSvg(size, shape, scale) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">` +
    backdrop(shape) +
    art(scale) +
    `</svg>`
  );
}

const ADAPTIVE_DENSITIES = [
  ['mdpi', 108],
  ['hdpi', 162],
  ['xhdpi', 216],
  ['xxhdpi', 324],
  ['xxxhdpi', 432],
];
const LEGACY_DENSITIES = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
];

const RES = 'android/app/src/main/res';
const hasAndroid = existsSync(RES);

const targets = [
  // ---- PWA / web ----
  { file: 'public/icon-192.png', size: 192, shape: 'rounded', scale: TILE },
  { file: 'public/icon-512.png', size: 512, shape: 'rounded', scale: TILE },
  { file: 'public/icon-maskable-512.png', size: 512, shape: 'square', scale: MASKABLE },

  // ---- Play Store listing (opaque: Play rejects alpha) ----
  { file: 'store/play-icon-512.png', size: 512, shape: 'square', scale: TILE, opaque: true },
];

if (hasAndroid) {
  for (const [d, size] of ADAPTIVE_DENSITIES) {
    targets.push({
      file: `${RES}/mipmap-${d}/ic_launcher_foreground.png`,
      size,
      shape: 'none',
      scale: ADAPTIVE,
    });
  }
  for (const [d, size] of LEGACY_DENSITIES) {
    targets.push({
      file: `${RES}/mipmap-${d}/ic_launcher.png`,
      size,
      shape: 'rounded',
      scale: TILE,
    });
    targets.push({
      file: `${RES}/mipmap-${d}/ic_launcher_round.png`,
      size,
      shape: 'circle',
      scale: ROUND,
    });
  }
}

/** Play Store feature graphic: the mark beside the wordmark on brand blue. */
function featureSvg() {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">` +
    `<rect width="1024" height="500" fill="${BRAND}"/>` +
    `<g transform="translate(150 250) scale(0.62) translate(-256 -256)">` +
    art(1).replace(`fill="${BRAND}"`, `fill="${BRAND}"`) +
    `</g>` +
    `<text x="470" y="228" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="92" font-weight="700" fill="${WHITE}">AMBGro</text>` +
    `<text x="470" y="288" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="34" fill="${WHITE}" fill-opacity=".85">Digital growth charts</text>` +
    `<text x="470" y="336" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="34" fill="${WHITE}" fill-opacity=".85">WHO 0–2 years &amp; CDC 2–20 years</text>` +
    `</svg>`
  );
}

async function render(svgText, file, opaque) {
  await mkdir(dirname(file), { recursive: true });
  let pipe = sharp(Buffer.from(svgText));
  if (opaque) pipe = pipe.flatten({ background: BRAND });
  await pipe.png({ compressionLevel: 9 }).toFile(file);
  return file;
}

async function main() {
  // Master vector, used by the browser tab and the PWA manifest.
  const master =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="AMBGro">` +
    backdrop('rounded') +
    art(TILE) +
    `</svg>`;
  await writeFile('public/icon.svg', master + '\n');
  await writeFile('public/favicon.svg', master + '\n');
  console.log('vector  public/icon.svg, public/favicon.svg');

  for (const t of targets) {
    await render(iconSvg(t.size, t.shape, t.scale), t.file, t.opaque);
    console.log(`${String(t.size).padStart(4)}px  ${t.file}`);
  }

  await render(featureSvg(), 'store/play-feature-1024x500.png', true);
  console.log('   —  store/play-feature-1024x500.png');

  if (hasAndroid) {
    // The adaptive icon draws this colour behind the (transparent) foreground.
    // Capacitor scaffolds it white, which would render white curves invisible.
    const bg =
      `<?xml version="1.0" encoding="utf-8"?>\n` +
      `<resources>\n    <color name="ic_launcher_background">${BRAND.toUpperCase()}</color>\n</resources>\n`;
    await writeFile(`${RES}/values/ic_launcher_background.xml`, bg);
    console.log('   —  ' + `${RES}/values/ic_launcher_background.xml`);
  }

  if (!hasAndroid) {
    console.warn(`\n! ${RES} not found — skipped launcher icons. Run "npx cap add android" then re-run.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
