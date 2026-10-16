// Mood board layouts, shared by the web editor and the PDF so both place images identically.
// A slot is a rectangle in a unit box (0..1 × 0..1); the renderer scales it to the page and insets a gap.
import type { MoodImage } from './types';

export interface Slot {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Template {
  key: string;
  th: string;
  slots: Slot[];
}

const grid = (cols: number, rows: number, n = cols * rows): Slot[] =>
  Array.from({ length: n }, (_, i) => ({ x: (i % cols) / cols, y: Math.floor(i / cols) / rows, w: 1 / cols, h: 1 / rows }));

/** Fixed templates the user picks from; images go into numbered slots. */
export const TEMPLATES: Template[] = [
  { key: 'hero3', th: 'ภาพใหญ่ + 3', slots: [{ x: 0, y: 0, w: 0.62, h: 1 }, { x: 0.62, y: 0, w: 0.38, h: 1 / 3 }, { x: 0.62, y: 1 / 3, w: 0.38, h: 1 / 3 }, { x: 0.62, y: 2 / 3, w: 0.38, h: 1 / 3 }] },
  { key: 'hero5', th: 'ภาพใหญ่ + 4', slots: [{ x: 0, y: 0, w: 0.5, h: 1 }, { x: 0.5, y: 0, w: 0.25, h: 0.5 }, { x: 0.75, y: 0, w: 0.25, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.25, h: 0.5 }, { x: 0.75, y: 0.5, w: 0.25, h: 0.5 }] },
  { key: 'grid4', th: 'ตาราง 2×2', slots: grid(2, 2) },
  { key: 'grid6', th: 'ตาราง 3×2', slots: grid(3, 2) },
  { key: 'band3', th: '3 แถบตั้ง', slots: grid(3, 1) },
  { key: 'top2', th: 'บน 1 + ล่าง 3', slots: [{ x: 0, y: 0, w: 1, h: 0.58 }, { x: 0, y: 0.58, w: 1 / 3, h: 0.42 }, { x: 1 / 3, y: 0.58, w: 1 / 3, h: 0.42 }, { x: 2 / 3, y: 0.58, w: 1 / 3, h: 0.42 }] },
  // larger sets (8–16 images)
  { key: 'grid8', th: 'ตาราง 4×2', slots: grid(4, 2) },
  { key: 'hero9', th: 'ภาพใหญ่ + 8', slots: [{ x: 0, y: 0, w: 0.5, h: 2 / 3 }, ...[0, 1, 2, 3].map((i) => ({ x: 0.5 + (i % 2) * 0.25, y: Math.floor(i / 2) / 3, w: 0.25, h: 1 / 3 })), ...[0, 1, 2, 3].map((i) => ({ x: i * 0.25, y: 2 / 3, w: 0.25, h: 1 / 3 }))] },
  { key: 'grid9', th: 'ตาราง 3×3', slots: grid(3, 3) },
  { key: 'grid10', th: 'ตาราง 5×2', slots: grid(5, 2) },
  { key: 'grid12', th: 'ตาราง 4×3', slots: grid(4, 3) },
  { key: 'grid16', th: 'ตาราง 4×4', slots: grid(4, 4) },
];
export const AUTO = 'auto';
/** Free-form collage: images are moved, resized, layered and cropped by hand. */
export const CANVAS = 'canvas';
export const isTemplate = (k: string) => k === AUTO || k === CANVAS || TEMPLATES.some((t) => t.key === k);

/** Width ÷ height of the printed board area (A3 landscape minus header and footer); the editor uses the same shape. */
export const SHEET_RATIO = 1110 / 707;

/** Frame for a new canvas image: 30 % of the sheet wide, its own aspect, cascading so new images do not cover each other. */
export function defaultFrame(imgW: number | null, imgH: number | null, n: number) {
  const aspect = imgW && imgH ? imgW / imgH : 4 / 3;
  let w = 0.3;
  let h = (w * SHEET_RATIO) / aspect;
  if (h > 0.6) {
    h = 0.6;
    w = (h * aspect) / SHEET_RATIO;
  }
  const step = (n % 8) * 0.05;
  return { x: Math.min(1 - w, 0.04 + step), y: Math.min(1 - h, 0.05 + step), w, h };
}

/** Canvas images bottom layer first, each with its frame (falling back to a default one). */
export function canvasItems(images: MoodImage[]) {
  return images
    .slice()
    .sort((a, b) => a.z - b.z || a.id - b.id)
    .map((img, i) => ({ img, frame: img.x != null && img.y != null && img.w != null && img.h != null ? { x: img.x, y: img.y, w: img.w, h: img.h } : defaultFrame(img.img_w, img.img_h, i) }));
}

/**
 * Where the whole image sits so that its crop window fills the frame (all in the same units as the frame).
 * Used by the editor (CSS percentages) and the PDF (points).
 */
export function cropPlacement(frame: { x: number; y: number; w: number; h: number }, crop: { crop_x: number; crop_y: number; crop_w: number; crop_h: number }) {
  const fullW = frame.w / crop.crop_w;
  const fullH = frame.h / crop.crop_h;
  return { x: frame.x - crop.crop_x * fullW, y: frame.y - crop.crop_y * fullH, w: fullW, h: fullH };
}

/** Automatic layout for n images: a lead image for small sets, then even rows. */
export function autoSlots(n: number): Slot[] {
  if (n <= 0) return [];
  if (n === 1) return [{ x: 0, y: 0, w: 1, h: 1 }];
  if (n === 2) return grid(2, 1);
  if (n === 3) return TEMPLATES[0].slots.slice(0, 1).map((s) => ({ ...s })).concat([{ x: 0.62, y: 0, w: 0.38, h: 0.5 }, { x: 0.62, y: 0.5, w: 0.38, h: 0.5 }]);
  if (n === 4) return grid(2, 2);
  if (n === 5) return TEMPLATES[1].slots;
  if (n === 6) return grid(3, 2);
  // 7+: rows of up to 4, the last row stretched to the full width
  const cols = Math.min(4, Math.ceil(Math.sqrt(n * 1.4)));
  const rows = Math.ceil(n / cols);
  const out: Slot[] = [];
  for (let r = 0; r < rows; r++) {
    const inRow = Math.min(cols, n - r * cols);
    for (let c = 0; c < inRow; c++) out.push({ x: c / inRow, y: r / rows, w: 1 / inRow, h: 1 / rows });
  }
  return out;
}

/** Slots of a board: the template's, or the automatic layout for its images. */
export const slotsFor = (template: string, imageCount: number): Slot[] =>
  template === AUTO || template === CANVAS ? autoSlots(imageCount) : (TEMPLATES.find((t) => t.key === template)?.slots ?? autoSlots(imageCount));

/** Pairs every slot with its image (auto: images in order; template: by slot number). */
export function placeImages(template: string, images: MoodImage[]): { slot: Slot; index: number; image: MoodImage | null }[] {
  const sorted = images.slice().sort((a, b) => a.slot - b.slot);
  const slots = slotsFor(template, sorted.length);
  return slots.map((slot, index) => ({ slot, index, image: template === AUTO ? sorted[index] ?? null : sorted.find((i) => i.slot === index) ?? null }));
}
