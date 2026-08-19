/**
 * One-time terrain tile extraction from Deposit/ → assets/.
 * Run: node scripts/slice-terrain.mjs
 *
 * Do not edit originals in Deposit/.
 */
import { createReadStream, createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const deposit = join(root, 'Deposit');
const out = join(root, 'assets');

/** @type {[string, string, number, number, number, number][]} */
const CROPS = [
  ['dirt-00.png', '40c38bd6-50d8-48e0-a292-5c68bf3a379c.png', 800, 820, 64, 64],
  ['dirt-01.png', '0f528cd3-32a6-4ce1-976b-7f9a597af96d.png', 528, 780, 64, 64],
  ['dirt-02.png', '40c38bd6-50d8-48e0-a292-5c68bf3a379c.png', 168, 832, 64, 64],
  ['grass-00.png', '40c38bd6-50d8-48e0-a292-5c68bf3a379c.png', 312, 832, 64, 64],
  ['grass-01.png', '0f528cd3-32a6-4ce1-976b-7f9a597af96d.png', 960, 752, 64, 64],
  ['wall-00.png', '40c38bd6-50d8-48e0-a292-5c68bf3a379c.png', 1376, 896, 64, 64],
  ['wall-01.png', '0f528cd3-32a6-4ce1-976b-7f9a597af96d.png', 1184, 896, 64, 64],
];

const TILE = 32;

function readPng(path) {
  return new Promise((resolve, reject) => {
    createReadStream(path)
      .pipe(new PNG())
      .on('parsed', function () {
        resolve(this);
      })
      .on('error', reject);
  });
}

function writePng(path, width, height, data) {
  return new Promise((resolve, reject) => {
    const png = new PNG({ width, height });
    png.data = data;
    png
      .pack()
      .pipe(createWriteStream(path))
      .on('finish', resolve)
      .on('error', reject);
  });
}

import { createWriteStream } from 'node:fs';

function fillTransparent(data, w, h) {
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    const a = data[p + 3];
    if (a > 200 && data[p] + data[p + 1] + data[p + 2] > 60) {
      r += data[p];
      g += data[p + 1];
      b += data[p + 2];
      n++;
    }
  }
  if (n) {
    r = (r / n) | 0;
    g = (g / n) | 0;
    b = (b / n) | 0;
  } else {
    r = 130;
    g = 90;
    b = 55;
  }
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    if (data[p + 3] < 200 || data[p] + data[p + 1] + data[p + 2] < 45) {
      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = 255;
    }
  }
}

function downsample(src, sw, sh, tw, th) {
  const out = Buffer.alloc(tw * th * 4);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const sx = ((x + 0.5) * sw) / tw - 0.5;
      const sy = ((y + 0.5) * sh) / th - 0.5;
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(sx)));
      const y0 = Math.max(0, Math.min(sh - 1, Math.floor(sy)));
      const sp = (y0 * sw + x0) * 4;
      const dp = (y * tw + x) * 4;
      out[dp] = src[sp];
      out[dp + 1] = src[sp + 1];
      out[dp + 2] = src[sp + 2];
      out[dp + 3] = 255;
    }
  }
  return out;
}

function greenTint(data) {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, ((data[i] * 82) / 100 + 18) | 0);
    data[i + 1] = Math.min(255, ((data[i + 1] * 108) / 100 + 28) | 0);
    data[i + 2] = Math.min(255, ((data[i + 2] * 72) / 100 + 8) | 0);
  }
}

function makeWater(phase) {
  const data = Buffer.alloc(TILE * TILE * 4);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n =
        Math.sin(x * 0.55 + phase) * 0.4 +
        Math.cos(y * 0.45 + phase * 1.3) * 0.35 +
        Math.sin((x + y) * 0.25) * 0.25;
      const p = (y * TILE + x) * 4;
      data[p] = (42 + n * 14) | 0;
      data[p + 1] = (102 + n * 20) | 0;
      data[p + 2] = (172 + n * 24) | 0;
      data[p + 3] = 255;
    }
  }
  return data;
}

async function main() {
  if (!existsSync(out)) mkdirSync(out, { recursive: true });
  for (const [name, src, x, y, w, h] of CROPS) {
    const png = await readPng(join(deposit, src));
    const crop = Buffer.alloc(w * h * 4);
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const sp = ((y + row) * png.width + (x + col)) * 4;
        const dp = (row * w + col) * 4;
        crop[dp] = png.data[sp];
        crop[dp + 1] = png.data[sp + 1];
        crop[dp + 2] = png.data[sp + 2];
        crop[dp + 3] = png.data[sp + 3];
      }
    }
    fillTransparent(crop, w, h);
    let tile = downsample(crop, w, h, TILE, TILE);
    if (name.startsWith('grass')) greenTint(tile);
    await writePng(join(out, name), TILE, TILE, tile);
    console.log('wrote', name);
  }
  await writePng(join(out, 'water-00.png'), TILE, TILE, makeWater(0));
  await writePng(join(out, 'water-01.png'), TILE, TILE, makeWater(1.7));
  console.log('wrote water-00.png water-01.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
