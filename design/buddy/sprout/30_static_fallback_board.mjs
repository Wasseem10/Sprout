// CPU-only actual PNG decoding/compositing at real CSS pixel sizes.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(path.join(base, 'sprout-prism-v004.manifest.json'), 'utf8'));
const sizes = [44, 56, 72, 96];
const backgrounds = ['bright', 'dark', 'busy'];
const canvas = createCanvas(800, 960);
const ctx = canvas.getContext('2d');
const records = [];
for (let poseIndex = 0; poseIndex < 2; poseIndex++) {
  const pose = poseIndex ? 'sleeping' : 'idle';
  const info = manifest.fallbacks[pose];
  const bytes = await readFile(info.path);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== info.sha256) throw new Error(`Changed ${pose} PNG`);
  const image = await loadImage(bytes);
  if (image.width !== 640 || image.height !== 640) throw new Error('Unexpected PNG dimensions');
  for (let bgIndex = 0; bgIndex < backgrounds.length; bgIndex++) {
    const background = backgrounds[bgIndex];
    const row = poseIndex * 3 + bgIndex;
    const y = row * 160;
    for (let index = 0; index < sizes.length; index++) {
      const size = sizes[index];
      const x = index * 200;
      ctx.fillStyle = background === 'dark' ? '#102330' : '#f5fbff';
      ctx.fillRect(x, y, 200, 160);
      if (background === 'busy') {
        for (let cell = 0; cell < 20; cell++) {
          ctx.fillStyle = ['#9cbaf1', '#f1d3c2', '#b2e7ea', '#f0eff9'][cell % 4];
          ctx.fillRect(x + (cell % 5)*40, y + Math.floor(cell/5)*40, 40, 40);
        }
      }
      ctx.fillStyle = background === 'dark' ? '#f5fbff' : '#102330';
      ctx.font = '15px sans-serif';
      ctx.fillText(`${pose} · ${background} · ${size}px`, x + 8, y + 22);
      ctx.drawImage(image, x + (200-size)/2, y + 43 + (100-size)/2, size, size);
      records.push({ pose, background, cssPixels: size, decoded: [image.width, image.height], sha256: hash });
    }
  }
}
const output = path.join(base, 'proofs', 'v004-fallback-backgrounds.png');
const report = path.join(base, 'proofs', 'v004-fallback-backgrounds.json');
await writeFile(output, canvas.toBuffer('image/png'));
await writeFile(report, JSON.stringify({ pass: true, assetSha256: manifest.sha256,
  image: output, rows: records,
  scope: 'CPU decoded source PNGs on owned backgrounds at44/56/72/96px. Static compositional/eye-crease inspection, not browser fallback lifecycle, GLB refraction or native display evidence.' }, null, 2)+'\n');
console.log(JSON.stringify({ output, report, images: records.length }));
