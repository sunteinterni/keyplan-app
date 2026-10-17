// Floor-plan symbols from the FF&E Symbol Guideline (glyph-data.ts), turned into path primitives placed on the plan:
// centred on a pin, scaled to the pin size and rotated, so the web editor and the PDF draw the same thing.
import { GLYPH_CATEGORIES, type GlyphDef } from './glyph-data';

export { GLYPH_CATEGORIES };
export type { GlyphDef };

const BY_CODE = new Map(GLYPH_CATEGORIES.flatMap((c) => c.items.map((g) => [g.code, g] as const)));
export const glyphByCode = (code: string | null | undefined): GlyphDef | undefined => (code ? BY_CODE.get(code) : undefined);
/** Symbols of a category (empty for Lighting, which has its own symbols, and for the studio's own categories). */
export const glyphsFor = (prefix: string) => GLYPH_CATEGORIES.find((c) => c.prefix === prefix)?.items ?? [];
export const isGlyph = (code: unknown) => typeof code === 'string' && BY_CODE.has(code);

/** One drawn part of a symbol: SVG path data in plan coordinates, dashed or lightly filled as in the guideline. */
export interface GlyphPart {
  d: string;
  dash: boolean;
  tint: boolean; // light fill, 18 % of the line colour
}

const f = (n: number) => Math.round(n * 100) / 100;

/**
 * A guideline symbol drawn into a box `size` wide, centred on (cx, cy) and turned `rot` degrees clockwise.
 * Every shape becomes path data (rectangles and circles included) so one renderer handles all of them.
 */
export function glyphParts(code: string, cx: number, cy: number, size: number, rot = 0): GlyphPart[] {
  const g = glyphByCode(code);
  if (!g) return [];
  const k = size / 64;
  const a = (rot * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const P = (x: number, y: number) => {
    const px = (x - 32) * k;
    const py = (y - 32) * k;
    return `${f(cx + px * cos - py * sin)} ${f(cy + px * sin + py * cos)}`;
  };
  const arc = (rx: number, ry: number, large: number, sweep: number, x: number, y: number) => `A${f(rx * k)} ${f(ry * k)} ${f(rot)} ${large} ${sweep} ${P(x, y)}`;

  return g.spec.split(';').map((raw) => {
    let s = raw.trim();
    let dash = false;
    let tint = false;
    if (s[0] === '~') { dash = true; s = s.slice(1); }
    if (s[0] === '*') { tint = true; s = s.slice(1); }
    const t = s[0];
    const n = s.slice(1).split(',').map(Number);
    let d: string;
    if (t === 'r') {
      const [x, y, w, h, r0 = 0] = n;
      const r = Math.min(r0, w / 2, h / 2);
      d = r > 0
        ? `M${P(x + r, y)} L${P(x + w - r, y)} ${arc(r, r, 0, 1, x + w, y + r)} L${P(x + w, y + h - r)} ${arc(r, r, 0, 1, x + w - r, y + h)} L${P(x + r, y + h)} ${arc(r, r, 0, 1, x, y + h - r)} L${P(x, y + r)} ${arc(r, r, 0, 1, x + r, y)} Z`
        : `M${P(x, y)} L${P(x + w, y)} L${P(x + w, y + h)} L${P(x, y + h)} Z`;
    } else if (t === 'c' || t === 'e') {
      const [x, y, rx, ry = rx] = n;
      d = `M${P(x - rx, y)} ${arc(rx, ry, 1, 0, x + rx, y)} ${arc(rx, ry, 1, 0, x - rx, y)} Z`;
    } else if (t === 'l') {
      d = `M${P(n[0], n[1])} L${P(n[2], n[3])}`;
    } else {
      d = transformPath(s, P, arc);
    }
    return { d, dash, tint };
  });
}

/** Absolute SVG path (M L H V Q T A Z) moved into plan coordinates. */
function transformPath(src: string, P: (x: number, y: number) => string, arc: (rx: number, ry: number, l: number, s: number, x: number, y: number) => string): string {
  const tokens = src.match(/[MLHVQTAZ]|-?\d*\.?\d+/gi) ?? [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  const out: string[] = [];
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[i])) cmd = tokens[i++].toUpperCase();
    if (cmd === 'Z') { out.push('Z'); continue; }
    if (cmd === 'M' || cmd === 'L' || cmd === 'T') { x = num(); y = num(); out.push(`${cmd}${P(x, y)}`); if (cmd === 'M') cmd = 'L'; }
    else if (cmd === 'H') { x = num(); out.push(`L${P(x, y)}`); }
    else if (cmd === 'V') { y = num(); out.push(`L${P(x, y)}`); }
    else if (cmd === 'Q') { const qx = num(); const qy = num(); x = num(); y = num(); out.push(`Q${P(qx, qy)} ${P(x, y)}`); }
    else if (cmd === 'A') { const rx = num(); const ry = num(); num(); const l = num(); const s = num(); x = num(); y = num(); out.push(arc(rx, ry, l, s, x, y)); }
    else i++; // unknown command: skip its number
  }
  return out.join(' ');
}

/** Box size of a symbol on the plan for a pin of radius r (M size): about the size of the other pins' outline. */
export const glyphSize = (r: number) => r * 3;
