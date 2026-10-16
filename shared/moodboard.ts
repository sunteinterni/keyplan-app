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
];
export const AUTO = 'auto';
export const isTemplate = (k: string) => k === AUTO || TEMPLATES.some((t) => t.key === k);

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
  template === AUTO ? autoSlots(imageCount) : (TEMPLATES.find((t) => t.key === template)?.slots ?? autoSlots(imageCount));

/** Pairs every slot with its image (auto: images in order; template: by slot number). */
export function placeImages(template: string, images: MoodImage[]): { slot: Slot; index: number; image: MoodImage | null }[] {
  const sorted = images.slice().sort((a, b) => a.slot - b.slot);
  const slots = slotsFor(template, sorted.length);
  return slots.map((slot, index) => ({ slot, index, image: template === AUTO ? sorted[index] ?? null : sorted.find((i) => i.slot === index) ?? null }));
}
