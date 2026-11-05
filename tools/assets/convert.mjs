// Converts source images/GIFs (assets-src/) into compact indexed sprites the kernel can draw.
// Output: packages/apps/assets/{system,gallery}.json  (format: SpriteJson in packages/kernel/src/sprite.ts)
//
// Sampling rules match the prototype's animLoader.py:
//   16x16 / 32x32 sources are read 1:1; anything else is treated as a 16x16 pixel grid
//   drawn with cells of `width / 16` px and sampled at each cell's centre (e.g. 320x320 Divoom exports).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'assets-src');
const OUT = path.join(ROOT, 'packages', 'apps', 'assets');
const MIN_DELAY = 20;
const DEFAULT_DELAY = 100;

async function loadFrames(file) {
  const image = sharp(file, { animated: true });
  const meta = await image.metadata();
  const pages = meta.pages ?? 1;
  const pageHeight = meta.pageHeight ?? meta.height;
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const frames = [];
  for (let p = 0; p < pages; p++) {
    const delay = Array.isArray(meta.delay) ? meta.delay[p] : undefined;
    frames.push({
      delay: Math.max(MIN_DELAY, delay && delay > 0 ? delay : DEFAULT_DELAY),
      rgba: data.subarray(p * pageHeight * info.width * 4, (p + 1) * pageHeight * info.width * 4),
    });
  }
  return { width: info.width, height: pageHeight, frames };
}

function samplingFor(width, height) {
  if ((width === 16 && height === 16) || (width === 32 && height === 32)) {
    return { size: width, pitch: 1, offset: 0 };
  }
  const pitch = Math.max(1, Math.floor(width / 16));
  return { size: 16, pitch, offset: Math.floor(pitch / 2) };
}

const pack = (r, g, b) => (r << 16) | (g << 8) | b;
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const dist = (a, b) =>
  Math.max(Math.abs((a >> 16) - (b >> 16)), Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)), Math.abs((a & 255) - (b & 255)));

async function convert(name, spec) {
  const file = path.join(SRC, spec.src);
  const { width, height, frames } = await loadFrames(file);
  const { size, pitch, offset } = samplingFor(width, height);

  // 1. sample every frame into packed colors (-1 = transparent)
  const sampled = frames.map(({ rgba, delay }) => {
    const px = new Int32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cx = Math.min(width - 1, x * pitch + offset);
        const cy = Math.min(height - 1, y * pitch + offset);
        const i = (cy * width + cx) * 4;
        px[y * size + x] = spec.alpha && rgba[i + 3] < 128 ? -1 : pack(rgba[i], rgba[i + 1], rgba[i + 2]);
      }
    }
    return { px, delay };
  });

  // 2. build the palette; optionally merge near-identical colors (most frequent wins)
  const counts = new Map();
  for (const { px } of sampled) for (const c of px) if (c >= 0) counts.set(c, (counts.get(c) ?? 0) + 1);
  const byFrequency = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const tolerance = spec.quantize ?? 0;
  const palette = [];
  const indexOf = new Map();
  const hasTransparency = sampled.some(({ px }) => px.includes(-1));
  if (hasTransparency) palette.push(0x000000);
  for (const c of byFrequency) {
    const existing = tolerance > 0 ? palette.findIndex((p, i) => !(hasTransparency && i === 0) && dist(p, c) <= tolerance) : -1;
    if (existing >= 0) indexOf.set(c, existing);
    else {
      indexOf.set(c, palette.length);
      palette.push(c);
    }
  }
  if (palette.length > 65536) throw new Error(`${spec.src}: ${palette.length} colors (max 65536); raise quantize`);
  // GIFs with per-frame local palettes can exceed 256 colors overall; use 16-bit indices then.
  const indexBytes = palette.length > 256 ? 2 : 1;

  // 3. encode
  const out = {
    name,
    width: size,
    height: size,
    palette: palette.map(hex),
    frames: sampled.map(({ px, delay }) => {
      const idx = Buffer.alloc(px.length * indexBytes);
      px.forEach((c, i) => {
        const v = c < 0 ? 0 : indexOf.get(c);
        if (indexBytes === 1) idx[i] = v;
        else idx.writeUInt16LE(v, i * 2);
      });
      return { delay, data: idx.toString('base64') };
    }),
  };
  if (hasTransparency) out.transparent = 0;
  if (indexBytes === 2) out.indexBytes = 2;
  console.log(`  ${name.padEnd(14)} ${spec.src.padEnd(28)} ${size}x${size} ${String(frames.length).padStart(3)}f ${String(palette.length).padStart(3)} colors`);
  return out;
}

const manifest = JSON.parse(await readFile(path.join(SRC, 'manifest.json'), 'utf8'));
await mkdir(OUT, { recursive: true });

const system = {};
for (const [name, spec] of Object.entries(manifest.system)) system[name] = await convert(name, spec);
const gallery = [];
for (const spec of manifest.gallery) gallery.push(await convert(spec.name, spec));

for (const [file, data] of [['system.json', system], ['gallery.json', gallery]]) {
  const target = path.join(OUT, file);
  await writeFile(target, JSON.stringify(data) + '\n');
  console.log(`wrote ${path.relative(ROOT, target)} (${(JSON.stringify(data).length / 1024).toFixed(1)} KB)`);
}
