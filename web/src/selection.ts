// Multi-selection helpers for the plan editor (no React, testable in Node).

export type Item = { k: 'p' | 'l'; id: number }; // placement (point) / line
type XY = { x: number; y: number };

export const same = (a: Item, b: Item) => a.k === b.k && a.id === b.id;
export const has = (list: Item[], it: Item) => list.some((x) => same(x, it));

/** Shift/Ctrl-click: add the item, or remove it if it is already selected. */
export const toggle = (list: Item[], it: Item): Item[] => (has(list, it) ? list.filter((x) => !same(x, it)) : [...list, it]);

/** Union keeping the order items were picked in. */
export const union = (a: Item[], b: Item[]): Item[] => [...a, ...b.filter((x) => !has(a, x))];

/** Normalised box from two corners. */
export interface Box { x0: number; y0: number; x1: number; y1: number }
export const boxOf = (a: [number, number], b: [number, number]): Box => ({ x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) });
export const inBox = (p: XY, b: Box) => p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1;

/**
 * Order for wiring many points at once: start at the top-left-most point and keep walking to the
 * nearest point not yet visited — close to how a cable would actually be run.
 */
export function wiringOrder<T extends XY>(pts: T[]): T[] {
  const left = pts.slice();
  if (left.length < 3) return left.sort((a, b) => a.x + a.y - (b.x + b.y));
  const out: T[] = [];
  let i = left.reduce((best, p, k) => (p.x + p.y < left[best].x + left[best].y ? k : best), 0);
  while (left.length) {
    const cur = left.splice(i, 1)[0];
    out.push(cur);
    if (!left.length) break;
    i = left.reduce((best, p, k) => (Math.hypot(p.x - cur.x, p.y - cur.y) < Math.hypot(left[best].x - cur.x, left[best].y - cur.y) ? k : best), 0);
  }
  return out;
}

/** Move by (dx, dy) in normalised plan units, keeping the result on the plan (0–1). */
export const shift = (p: [number, number], dx: number, dy: number): [number, number] => [Math.min(1, Math.max(0, p[0] + dx)), Math.min(1, Math.max(0, p[1] + dy))];
