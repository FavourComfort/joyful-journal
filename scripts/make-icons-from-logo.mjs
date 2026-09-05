// One-off: derive PWA icons from the official logo (public/logo.png).
// Crops the ninja emblem (left circle of the logo), pads to a square on white,
// and box-filter downscales to each target size. Dependency: pngjs (no-save).
import { PNG } from "pngjs";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = PNG.sync.read(readFileSync(join(root, "public", "logo.png")));
console.log(`logo: ${src.width}x${src.height}`);

const isBg = (r, g, b) => r > 240 && g > 240 && b > 240; // near-white background

// ---- 1b. Erase swoosh/tagline fragments that leak left of the wordmark ----
// Below y=550, the emblem is just the ring stroke (a contiguous run starting
// near x=250). Everything right of that run (small texture gaps allowed) is
// swoosh tip / tagline text — set it to white.
for (let y = 500; y < src.height; y++) {
  let start = -1;
  for (let x = 250; x < src.width; x++) {
    const i = (src.width * y + x) << 2;
    if (!isBg(src.data[i], src.data[i + 1], src.data[i + 2])) { start = x; break; }
  }
  if (start < 0 || start > 460) {
    // no ring stroke on this row — any pixels here are stray fragments
    for (let x = 250; x < src.width; x++) {
      const i = (src.width * y + x) << 2;
      src.data[i] = 255; src.data[i + 1] = 255; src.data[i + 2] = 255;
    }
    continue;
  }
  let end = start, x = start;
  while (x < src.width - 1) {
    x++;
    const i = (src.width * y + x) << 2;
    if (!isBg(src.data[i], src.data[i + 1], src.data[i + 2])) end = x;
    else if (x - end > 10) break; // gap too big: run is over
  }
  for (x = end + 11; x < src.width; x++) {
    const i = (src.width * y + x) << 2;
    src.data[i] = 255; src.data[i + 1] = 255; src.data[i + 2] = 255;
  }
}

// ---- 1c. Crop the ninja emblem ----
// Find the first fully-white vertical gap (10+ empty columns) after x=300 to
// separate the circle emblem from the NINJAWO wordmark, then take the bbox.
const countNonBg = (x) => {
  let n = 0;
  for (let y = 0; y < src.height; y++) {
    const i = (src.width * y + x) << 2;
    if (!isBg(src.data[i], src.data[i + 1], src.data[i + 2])) n++;
  }
  return n;
};
let cutX = src.width;
let emptyRun = 0;
// The wordmark occupies the lower band of the logo. Find the first run of
// empty columns (in that band) after the circle — that's the emblem/wordmark gap.
for (let x = 400; x < src.width; x++) {
  let n = 0;
  for (let y = 500; y < 620; y++) {
    const i = (src.width * y + x) << 2;
    if (!isBg(src.data[i], src.data[i + 1], src.data[i + 2])) n++;
  }
  if (n === 0) {
    if (++emptyRun >= 5) { cutX = x - 4; break; }
  } else emptyRun = 0;
}
// the ring's open stroke creates a false gap inside the emblem; the true
// emblem/wordmark boundary is where the ring arc's rightmost pixels end.
cutX = Math.max(cutX, 559);
console.log(`wordmark cut at x=${cutX}`);
let minX = src.width, minY = src.height, maxX = -1, maxY = -1;
for (let y = 0; y < src.height; y++) {
  for (let x = 0; x < src.width; x++) {
    const i = (src.width * y + x) << 2;
    // right of the cut, keep only the headband tail (top band of the logo)
    const keep = x < cutX || y < 430;
    if (keep && !isBg(src.data[i], src.data[i + 1], src.data[i + 2])) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
console.log(`emblem bbox: x ${minX}-${maxX}, y ${minY}-${maxY}`);
const cw = maxX - minX + 1, ch = maxY - minY + 1;

// ---- 2. Box-filter resample of a crop region onto a white square canvas ----
function render(size, padRatio) {
  const side = Math.max(cw, ch);
  const pad = Math.round(side * padRatio);
  const full = side + pad * 2; // source square (emblem + padding), drawn on white
  const out = new PNG({ width: size, height: size });
  const scale = full / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // average the source pixels covered by this output pixel (box filter)
      let r = 0, g = 0, b = 0, n = 0;
      const sx0 = Math.floor(x * scale), sx1 = Math.min(full - 1, Math.floor((x + 1) * scale) - 1);
      const sy0 = Math.floor(y * scale), sy1 = Math.min(full - 1, Math.floor((y + 1) * scale) - 1);
      for (let sy = sy0; sy <= sy1; sy++) {
        for (let sx = sx0; sx <= sx1; sx++) {
          // map padded canvas coords back to logo coords
          const lx = sx - pad + minX - Math.round((side - cw) / 2);
          const ly = sy - pad + minY - Math.round((side - ch) / 2);
          const inside = lx >= 0 && lx < src.width && ly >= 0 && ly < src.height;
          const j = inside ? (src.width * ly + lx) << 2 : -1;
          // apply the same erase rule used for the bounding box
          const kept = inside && (lx < cutX || ly < 430);
          if (kept && !isBg(src.data[j], src.data[j + 1], src.data[j + 2])) {
            r += src.data[j]; g += src.data[j + 1]; b += src.data[j + 2];
          } else { r += 255; g += 255; b += 255; }
          n++;
        }
      }
      const o = (size * y + x) << 2;
      out.data[o] = Math.round(r / n);
      out.data[o + 1] = Math.round(g / n);
      out.data[o + 2] = Math.round(b / n);
      out.data[o + 3] = 255;
    }
  }
  return PNG.sync.write(out);
}

// launcher icons: small margin; maskable: big margin so Android's circular
// crop (safe zone = inner 80%) never clips the ninja; favicon: none needed.
writeFileSync(join(root, "public", "icons", "pwa-512.png"), render(512, 0.06));
writeFileSync(join(root, "public", "icons", "pwa-192.png"), render(192, 0.06));
writeFileSync(join(root, "public", "icons", "pwa-maskable-512.png"), render(512, 0.14));
writeFileSync(join(root, "public", "favicon.png"), render(256, 0.06));
console.log("wrote pwa-512, pwa-192, pwa-maskable-512, favicon");