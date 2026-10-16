// Background removal for mood board images: the background colour is read from the image border and every pixel
// connected to the border that is close to it becomes transparent; pixels just across the edge are faded so the
// outline is soft. Works for product photos on plain or studio backgrounds; busy backgrounds need a model instead.
import sharp from 'sharp';

/** Tolerance presets (colour distance, 0–441) offered in the UI. */
export const CUTOUT_TOLERANCE = { low: 28, medium: 48, high: 72 } as const;
export type CutoutLevel = keyof typeof CUTOUT_TOLERANCE;

const median = (a: number[]) => {
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)] ?? 255;
};

/** PNG with the border-connected background made transparent. */
export async function removeBackground(input: string | Buffer, tolerance: number, maxDim = 1600): Promise<{ png: Buffer; removed: number }> {
  const { data, info } = await sharp(input, { failOn: 'none' })
    .rotate()
    .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const px = (i: number) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];

  // background colour: per-channel median of the border pixels
  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);
  const bg = [0, 1, 2].map((c) => median(border.map((i) => data[i * 4 + c])));
  const dist = (i: number) => {
    const [r, g, b] = px(i);
    return Math.hypot(r - bg[0], g - bg[1], b - bg[2]);
  };

  // flood fill from the border through pixels close to the background colour
  const gone = new Uint8Array(w * h);
  const stack: number[] = border.filter((i) => dist(i) <= tolerance);
  for (const i of stack) gone[i] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
      if (j >= 0 && !gone[j] && dist(j) <= tolerance) {
        gone[j] = 1;
        stack.push(j);
      }
    }
  }

  // apply: removed pixels transparent; kept pixels touching the background fade with their distance (soft edge)
  let removed = 0;
  for (let i = 0; i < w * h; i++) {
    if (gone[i]) {
      data[i * 4 + 3] = 0;
      removed++;
      continue;
    }
    const x = i % w;
    const y = (i - x) / w;
    const nearGone = (x > 0 && gone[i - 1]) || (x < w - 1 && gone[i + 1]) || (y > 0 && gone[i - w]) || (y < h - 1 && gone[i + w]);
    if (nearGone) {
      const d = dist(i);
      if (d < tolerance * 2) data[i * 4 + 3] = Math.round(255 * Math.min(1, (d - tolerance) / tolerance + 0.35));
    }
  }
  const png = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 8 }).toBuffer();
  return { png, removed: removed / (w * h) };
}
