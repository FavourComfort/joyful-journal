// Generates NINJAWO PWA install screenshots (pure Node, no deps):
//   wide 1280x720 (desktop) + narrow 720x1280 (mobile)
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const DARK = [0x0d, 0x0d, 0x0d];
const YELLOW = [0xff, 0xc1, 0x07];
const ORANGE = [0xff, 0x98, 0x00];
const SS = 2;

function mix(dst, src, a) {
  return [dst[0] * (1 - a) + src[0] * a, dst[1] * (1 - a) + src[1] * a, dst[2] * (1 - a) + src[2] * a];
}
function inRing(px, py, cx, cy, r, ratio) {
  const d = Math.hypot(px - cx, py - cy);
  return d <= r && d >= r * (1 - ratio);
}
function inN(px, py, bx, by, bw, bh, stroke) {
  if (py < by || py > by + bh) return false;
  const right = bx + bw - stroke;
  const inLeft = px >= bx && px <= bx + stroke;
  const inRight = px >= right && px <= right + stroke;
  const t = (py - by) / bh;
  const dx = bx + stroke / 2 + t * (right + stroke / 2 - (bx + stroke / 2) - stroke * 0.9);
  return inLeft || inRight || Math.abs(px - dx) <= stroke * 0.75;
}

function drawWordmark(rgba, W, H, cx, cy, s) {
  const word = "NINJAWO";
  const lw = 0.11 * s;
  const gap = 0.035 * s;
  const bh = 0.11 * s;
  const total = word.length * lw + (word.length - 1) * gap;
  let bx = cx - total / 2;
  const by = cy - bh / 2;
  const colors = [YELLOW, YELLOW, YELLOW, YELLOW, YELLOW, ORANGE, ORANGE];
  for (let k = 0; k < word.length; k++) {
    const L = word[k];
    const col = colors[k];
    for (let py = Math.floor(by * H); py < (by + bh) * H; py++) {
      for (let px = Math.floor(bx * W); px < (bx + lw) * W; px++) {
        if (px < 0 || px >= W || py < 0 || py >= H) continue;
        const nx = (px + 0.5) / W;
        const ny = (py + 0.5) / H;
        let a = 0;
        if (L === "N" || L === "A") {
          a = inN(nx, ny, bx, by, lw, bh, 0.03 * s) ? 1 : 0;
        } else if (L === "O") {
          a = inRing(nx, ny, bx + lw / 2, by + bh / 2, (bh / 2) * 0.95, 0.32) ? 1 : 0;
        } else if (L === "I" || L === "J") {
          a = nx >= bx + lw * 0.32 && nx <= bx + lw * 0.68 ? 1 : 0;
        } else if (L === "W") {
          a = 1;
        }
        if (a > 0) {
          const i = (py * W + px) * 4;
          const p = mix([rgba[i], rgba[i + 1], rgba[i + 2]], col, a);
          rgba[i] = Math.round(p[0]);
          rgba[i + 1] = Math.round(p[1]);
          rgba[i + 2] = Math.round(p[2]);
        }
      }
    }
    bx += lw + gap;
  }
}

function renderScreenshot(W, H, file) {
  const rgba = Buffer.alloc(W * H * 4);
  const s = Math.min(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      rgba[i] = DARK[0];
      rgba[i + 1] = DARK[1];
      rgba[i + 2] = DARK[2];
      rgba[i + 3] = 255;
    }
  }
  // emblem: ring + N above the wordmark
  const cx = W / 2;
  const cy = H / 2 - 0.06 * s;
  const rad = 0.22 * s;
  for (let y = Math.floor(cy - rad * 1.15); y < cy + rad * 1.15; y++) {
    for (let x = Math.floor(cx - rad * 1.15); x < cx + rad * 1.15; x++) {
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      let acc = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const nx = (x + (sx + 0.5) / SS - cx) / s;
          const ny = (y + (sy + 0.5) / SS - cy) / s;
          if (inRing(nx, ny, 0, 0, 0.22, 0.16) || inN(nx, ny, -0.08, -0.1, 0.16, 0.2, 0.045)) acc++;
        }
      }
      if (acc > 0) {
        const i = (y * W + x) * 4;
        const col = x + y > cx + cy ? ORANGE : YELLOW;
        const p = mix([rgba[i], rgba[i + 1], rgba[i + 2]], col, acc / (SS * SS));
        rgba[i] = Math.round(p[0]);
        rgba[i + 1] = Math.round(p[1]);
        rgba[i + 2] = Math.round(p[2]);
      }
    }
  }
  drawWordmark(rgba, W, H, W / 2, cy + 0.34 * s, s);
  writeFileSync(join(root, "public", "screenshots", file), encodePNG(W, H, rgba));
  console.log("wrote", file);
}

mkdirSync(join(root, "public", "screenshots"), { recursive: true });
renderScreenshot(1280, 720, "wide.png");
renderScreenshot(720, 1280, "narrow.png");

