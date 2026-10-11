// Review figures assembled only from actual Blender renders; no generated pixels.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = new URL('./proofs/', import.meta.url);
async function sheet(names, output, grayscale = false) {
  const canvas = createCanvas(960, 708);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e6edf1';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const [index, name] of names.entries()) {
    const image = await loadImage(fileURLToPath(new URL(`final-${name}.png`, base)));
    const x = (index % 3) * 320;
    const y = Math.floor(index / 3) * 354;
    ctx.drawImage(image, x, y, 320, 320);
    ctx.fillStyle = '#142d46';
    ctx.font = '18px Arial';
    ctx.fillText(name.replace('light-', ''), x + 16, y + 342);
  }
  if (grayscale) {
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const value = .2126 * pixels.data[i] + .7152 * pixels.data[i + 1] + .0722 * pixels.data[i + 2];
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
    }
    ctx.putImageData(pixels, 0, 0);
  }
  await writeFile(new URL(output, base), canvas.toBuffer('image/png'));
}
await sheet(['blink-mid', 'blink-closed', 'click-squash', 'listen', 'think', 'speak'], 'final-poses-sheet.png');
const lights = ['world-only', 'zero-world', 'key', 'fill', 'rim', 'full'].map(name => `light-${name}`);
await sheet(lights, 'final-lighting-sheet.png');
await sheet(lights, 'final-lighting-grayscale.png', true);
