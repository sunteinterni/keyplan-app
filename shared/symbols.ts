// Drawing symbols as plain primitives so the web editor (SVG) and the PDF exporter (pdfkit)
// draw exactly the same thing.
import type { ColorKey, SymbolKind } from './types';

export type Prim =
  | { t: 'circle'; cx: number; cy: number; r: number; fill?: boolean; sw?: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; sw?: number }
  | { t: 'poly'; pts: [number, number][]; fill?: boolean; sw?: number };

export const COLORS: Record<ColorKey, string> = {
  red: '#E10600',
  blue: '#1030E8',
  green: '#0E9F3E',
};
/** Text colour for plan labels (code, length). Same as COLORS except green, darkened so labels reach 4.5:1 on their white halo; the symbol itself stays #0E9F3E. */
export const LABEL_COLORS: Record<ColorKey, string> = {
  red: '#E10600',
  blue: '#1030E8',
  green: '#0B7A30',
};
export const COLOR_LABEL: Record<ColorKey, string> = { red: 'แดง', blue: 'น้ำเงิน', green: 'เขียว' };

export interface SymbolMeta {
  kind: SymbolKind;
  label: string;
  geometry: 'point' | 'line';
  rotatable: boolean;
}

export const SYMBOLS: SymbolMeta[] = [
  { kind: 'downlight', label: 'ดาวน์ไลท์', geometry: 'point', rotatable: false },
  { kind: 'wall', label: 'ไฟกิ่ง', geometry: 'point', rotatable: true },
  { kind: 'spot', label: 'สปอตไลท์ (ลูกศร)', geometry: 'point', rotatable: true },
  { kind: 'pendant', label: 'โคมตกแต่งห้อย (Pendant)', geometry: 'point', rotatable: false },
  { kind: 'linear', label: 'โคมราง T5 / Linear', geometry: 'point', rotatable: true },
  { kind: 'track', label: 'ราง Tracklight', geometry: 'line', rotatable: false },
  { kind: 'strip', label: 'เส้นประ (ไฟเส้น)', geometry: 'line', rotatable: false },
];

export const symbolMeta = (k: SymbolKind): SymbolMeta => SYMBOLS.find((s) => s.kind === k) ?? SYMBOLS[0];
export const isLineSymbol = (k: SymbolKind) => k === 'track' || k === 'strip';

/** Base stroke width used when drawing primitives (web and PDF use the same value). */
export const strokeUnit = (r: number) => Math.max(1.3, r * 0.16);

/** Standard linear (T5) lengths offered as one-click choices, metres. */
export const LINEAR_LENGTHS = [0.6, 1.2];
export const DEFAULT_LINEAR_M = 1.2;
/** Drawn length in plan pixels of a linear fixture: to scale when the floor has a scale, else a fixed multiple of the symbol size. */
export const linearLengthPx = (lengthM: number | null | undefined, mpp: number | null | undefined, r: number) =>
  mpp && mpp > 0 ? (lengthM && lengthM > 0 ? lengthM : DEFAULT_LINEAR_M) / mpp : r * 7;

/** Base radius (in image pixels) of a point symbol for a plan of the given width. */
export const baseRadius = (planW: number, scale = 1) => Math.max(5, planW * 0.0105) * scale;

type Pt = [number, number];
function xf(cx: number, cy: number, rot: number) {
  const a = (rot * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return (x: number, y: number): Pt => [cx + x * c - y * s, cy + x * s + y * c];
}

/** Primitives of a point symbol centred on (cx, cy) with radius r. Rotation 0 points to +x. */
export function pointSymbol(kind: SymbolKind, cx: number, cy: number, r: number, rot = 0, lenPx?: number): Prim[] {
  const T = xf(cx, cy, rot);
  const L = (x1: number, y1: number, x2: number, y2: number, sw = 1): Prim => {
    const a = T(x1, y1);
    const b = T(x2, y2);
    return { t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], sw };
  };
  const C = (x: number, y: number, rr: number, fill = false, sw = 1): Prim => {
    const p = T(x, y);
    return { t: 'circle', cx: p[0], cy: p[1], r: rr, fill, sw };
  };
  switch (kind) {
    case 'downlight':
      return [C(0, 0, r), L(-1.45 * r, 0, 1.45 * r, 0), L(0, -1.45 * r, 0, 1.45 * r)];
    case 'wall':
      return [L(-0.7 * r, -1.2 * r, -0.7 * r, 1.2 * r, 2.4), L(-0.7 * r, 0, -0.2 * r, 0), C(0.35 * r, 0, 0.85 * r)];
    case 'spot': {
      const tip: Pt = [2.9 * r, 0];
      return [
        C(0, 0, 0.8 * r, true),
        L(0.8 * r, 0, tip[0], 0, 1.4),
        {
          t: 'poly',
          fill: true,
          pts: [T(tip[0], 0), T(tip[0] - 0.9 * r, -0.45 * r), T(tip[0] - 0.9 * r, 0.45 * r)],
        },
      ];
    }
    case 'linear': {
      // a solid bar drawn like a track rail, centred on the point, along the rotation
      const half = (lenPx ?? r * 7) / 2;
      return [L(-half, 0, half, 0, lineStyle('track', r).sw / strokeUnit(r))];
    }
    case 'pendant': {
      const out: Prim[] = [C(0, 0, r), C(0, 0, 0.45 * r)];
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        out.push(L(Math.cos(a) * r, Math.sin(a) * r, Math.cos(a) * 1.55 * r, Math.sin(a) * 1.55 * r));
      }
      return out;
    }
    default:
      return [C(0, 0, r)];
  }
}

export interface LineStyle {
  sw: number;
  dash: number[] | null;
}
export function lineStyle(kind: SymbolKind, r: number): LineStyle {
  if (kind === 'track') return { sw: Math.max(2, r * 0.42), dash: null };
  return { sw: Math.max(1.6, r * 0.3), dash: [r * 1.3, r * 0.85] };
}

/** Pixel polyline length. */
export function polylineLength(pts: Pt[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return d;
}

/** n evenly spread positions along a polyline (pixel coordinates) with their direction angle. */
export function pointsAlong(pts: Pt[], n: number): { x: number; y: number; ang: number }[] {
  const total = polylineLength(pts);
  const out: { x: number; y: number; ang: number }[] = [];
  if (n <= 0 || total === 0) return out;
  for (let k = 0; k < n; k++) {
    let want = ((k + 0.5) / n) * total;
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (want <= seg || i === pts.length - 1) {
        const t = seg === 0 ? 0 : Math.min(1, want / seg);
        out.push({
          x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
          y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t,
          ang: Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]),
        });
        break;
      }
      want -= seg;
    }
  }
  return out;
}

/** Curved wiring path through the given points (pixel coordinates), as SVG path data. */
export function wiringPath(pts: Pt[]): string {
  if (pts.length < 2) return '';
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const sign = i % 2 === 0 ? -1 : 1;
    const k = 0.2 * len * sign;
    const qx = (x0 + x1) / 2 + (-dy / len) * k;
    const qy = (y0 + y1) / 2 + (dx / len) * k;
    d += ` Q${f(qx)} ${f(qy)} ${f(x1)} ${f(y1)}`;
  }
  return d;
}
const f = (n: number) => Math.round(n * 100) / 100;

/** SVG path data for a primitive-based symbol (used by the PDF exporter to avoid re-implementing shapes). */
export function primToSvg(p: Prim): string {
  if (p.t === 'line') return `M${f(p.x1)} ${f(p.y1)} L${f(p.x2)} ${f(p.y2)}`;
  if (p.t === 'poly') return 'M' + p.pts.map((q) => `${f(q[0])} ${f(q[1])}`).join(' L') + ' Z';
  return '';
}
