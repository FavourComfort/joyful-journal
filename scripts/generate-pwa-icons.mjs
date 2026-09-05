// Generates NINJAWO PWA icons (pure Node, no deps): dark rounded square,
// yellow ring, bold yellow "N" — matching the brand colors:
//   #0D0D0D (bg), #1A1A1A, #FFC107 (yellow), #FF9800 (accent)
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------- minimal PNG encoder ----------
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
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- drawing helpers (SS = supersampling factor) ----------
const SS = 3;
function mix(dst, src, a) {
  return [
    dst[0] * (1 - a) + src[0] * a,
    dst[1] * (1 - a) + src[1] * a,
    dst[2] * (1 - a) + src[2] * a,
  ];
}
const DARK = [0x0d, 0x0d, 0x0d];
const YELLOW = [0xff, 0xc1, 0x07];
const ORANGE = [0xff, 0x98, 0x00];

/**
 * shape(x, y, s) -> alpha 0..1 coverage of the shape at normalized coords
 */
function coverage(shape, x, y, s) {
  let acc = 0;
  for (let sy = 0; sy < SS; sy++) {
    for (let sx = 0; sx < SS; sx++) {
      const px = (x + (sx + 0.5) / SS) / s;
      const py = (y + (sy + 0.5) / SS) / s;
      acc += shape(px, py) ? 1 : 0;
    }
  }
  return acc / (SS * SS);
}

// rounded square (transparent outside corners)
function roundedSquare(r, x, y) {
  const b = r; // corner radius
  const inOuter = x >= 0 && x <= 1 && y >= 0 && y <= 1;
  if (!inOuter) return false;
  const cx = Math.min(Math.max(x, b), 1 - b);
  const cy = Math.min(Math.max(y, b), 1 - b);
  return (x - cx) ** 2 + (y - cy) ** 2 <= b * b;
}

// ring centered at (cx, cy) with outer radius ro and ratio (thickness)
function ring(cx, cy, ro, ratio) {
  return (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    return d <= ro && d >= ro * (1 - ratio);
  };
}

// bold letter N centered in box [bx, by, bw, bh]
function letterN(bx, by, bw, bh, stroke) {
  return (x, y) => {
    if (y < by || y > by + bh) return false;
    const left = bx;
    const right = bx + bw - stroke;
    const inLeft = x >= left && x <= left + stroke;
    const inRight = x >= right && x <= right + stroke;
    // diagonal from top of left bar to bottom of right bar
    const t = (y - by) / bh;
    const dx = left + stroke / 2 + t * (right + stroke / 2 - (left + stroke / 2) - stroke * 0.9);
    const inDiag = Math.abs(x - dx) <= stroke * 0.75;
    return inLeft || inRight || inDiag;
  };
}

function renderIcon(size, { maskable = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const bg = maskable ? () => true : (x, y) => roundedSquare(0.18, x, y);
  const ringShape = ring(0.5, 0.5, maskable ? 0.38 : 0.42, 0.16);
  const nShape = letterN(0.34, 0.3, 0.32, 0.4, 0.09);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let px = DARK;
      const bgA = coverage(bg, x, y, size);
      if (bgA > 0) {
        let a = coverage(ringShape, x, y, size);
        // slight orange gradient on the lower-right half of the ring
        const nx = (x + 0.5) / size - 0.5;
        const ny = (y + 0.5) / size - 0.5;
        const col = nx + ny > 0 ? ORANGE : YELLOW;
        px = mix(px, col, a);
        a = coverage(nShape, x, y, size);
        px = mix(px, YELLOW, a);
        px = mix([255, 255, 255, 0].slice(0, 3), px, bgA);
      }
      const alpha = Math.round(bgA * 255);
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(px[0]);
      rgba[i + 1] = Math.round(px[1]);
      rgba[i + 2] = Math.round(px[2]);
      rgba[i + 3] = alpha;
    }
  }
  return encodePNG(size, size, rgba);
}

mkdirSync(join(root, "public", "icons"), { recursive: true });
for (const [file, size, opts] of [
  ["pwa-192.png", 192, {}],
  ["pwa-512.png", 512, {}],
  ["pwa-maskable-512.png", 512, { maskable: true }],
  ["../favicon.png", 32, {}],
]) {
  writeFileSync(join(root, "public", "icons", file), renderIcon(size, opts));
  console.log("wrote", file);
}
