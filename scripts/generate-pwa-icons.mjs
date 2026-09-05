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

// ---------- ninja mascot ----------
// head circle centered at (cx, cy) radius r
function circle(cx, cy, r) {
  return (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

// rounded rect: box [bx, by, bw, bh] with vertical corner radius cr
function roundedRect(bx, by, bw, bh, cr) {
  return (x, y) => {
    if (x < bx || x > bx + bw || y < by || y > by + bh) return false;
    const cx = Math.min(Math.max(x, bx + cr), bx + bw - cr);
    const cy = Math.min(Math.max(y, by + cr), by + bh - cr);
    return (x - cx) ** 2 + (y - cy) ** 2 <= cr * cr;
  };
}

// ninja head + mask band + eyes + headband tail, all sized off (cx, cy, r)
function ninjaShapes(cx, cy, r) {
  return {
    head: circle(cx, cy, r),
    eyeL: circle(cx - 0.32 * r, cy + 0.1 * r, 0.128 * r),
    eyeR: circle(cx + 0.32 * r, cy + 0.1 * r, 0.128 * r),
    // headband tail flaring out to the left of the band
    tail: (x, y) => {
      const x0 = cx - 1.6 * r;
      const x1 = cx - 1.04 * r;
      if (x < x0 || x > x1) return false;
      const t = (x - x0) / (x1 - x0);
      const yTop = cy - 0.04 * r;
      return y >= yTop && y <= yTop + 0.52 * r + 0.4 * r * (1 - t);
    },
  };
}

function bandRect(cx, cy, r) {
  return roundedRect(cx - 1.04 * r, cy - 0.1 * r, 2.08 * r, 0.52 * r, 0.26 * r);
}

// ---------- tiny 5x7 pixel font (for the tagline) ----------
const FONT = {
  N: ["10001", "11001", "11001", "10101", "10011", "10011", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["11111", "00010", "00010", "00010", "00010", "10010", "01100"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  ",": ["00000", "00000", "00000", "00000", "00110", "00100", "01000"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

// coverage of a text string starting at (x0, y0), each glyph cell is c px
function textCoverage(text, x0, y0, c) {
  return (x, y) => {
    const col = Math.floor((x - x0) / c);
    const row = Math.floor((y - y0) / c);
    if (row < 0 || row > 6) return false;
    const glyphCol = Math.floor(col / 6); // 5px glyph + 1px space
    const inCol = col - glyphCol * 6;
    if (glyphCol < 0 || glyphCol >= text.length) return false;
    if (inCol >= 5) return false;
    const glyph = FONT[text[glyphCol]];
    if (!glyph) return false;
    return glyph[row][inCol] === "1";
  };
}

function renderIcon(size, { maskable = false, tagline = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const bg = maskable ? () => true : (x, y) => roundedSquare(0.18, x, y);

  // mascot geometry: slightly smaller & higher when a tagline sits below
  const cx = 0.5;
  const cy = tagline ? 0.3 : 0.54;
  const r = tagline ? 0.19 : 0.25;
  const { head, eyeL, eyeR, tail } = ninjaShapes(cx, cy, r);
  const band = bandRect(cx, cy, r);

  // helper: centered pixel text, returns { shape, width, height }
  const pixelText = (text, cell, y0) => {
    const w = (text.length * 6 - 1) * cell;
    return { shape: textCoverage(text, 0.5 - w / 2, y0, cell), width: w };
  };

  let shapes = [];
  if (tagline) {
    // brand name in yellow under the mascot
    shapes.push({ ...pixelText("NINJAWO", 0.016, 0.52), color: YELLOW });
    // tagline in white, two light lines
    shapes.push({ ...pixelText("YOUR TASK, OUR NINJA", 0.0074, 0.685), color: [255, 255, 255] });
    shapes.push({ ...pixelText("BEST RESULT", 0.0074, 0.762), color: [255, 255, 255] });
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let px = DARK;
      const bgA = coverage(bg, x, y, size);
      if (bgA > 0) {
        // head with a subtle orange shading on the lower-right
        let a = coverage(head, x, y, size);
        const nx = (x + 0.5) / size - 0.5;
        const ny = (y + 0.5) / size - 0.5;
        const headCol = nx + ny > 0.12 ? ORANGE : YELLOW;
        px = mix(px, headCol, a);
        // dark mask band across the eyes
        a = coverage(band, x, y, size);
        px = mix(px, DARK, a);
        // headband tail in yellow
        a = coverage(tail, x, y, size);
        px = mix(px, YELLOW, a);
        // eyes peeking through the band
        a = coverage(eyeL, x, y, size) + coverage(eyeR, x, y, size);
        px = mix(px, [255, 255, 255], a);
        // brand + tagline text under the mascot
        for (const t of shapes) {
          a = coverage(t.shape, x, y, size);
          px = mix(px, t.color, a);
        }
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
  ["pwa-512.png", 512, { tagline: true }],
  ["pwa-maskable-512.png", 512, { maskable: true }],
  ["../favicon.png", 32, {}],
]) {
  writeFileSync(join(root, "public", "icons", file), renderIcon(size, opts));
  console.log("wrote", file);
}
