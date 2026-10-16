// Light Theory brand (CI) — the one place for brand colours, fonts and the logo geometry.
// The web (CSS variables + SVG) and the PDF exporter (pdfkit) both read from here.
// Plan symbol colours (red/blue/green) are working colours, not brand colours: they live in symbols.ts.

export const BRAND = {
  ink: '#141414', // LT Ink: text, primary buttons
  filament: '#FF4F1F', // accent / highlight — never as text colour on light backgrounds
  beam: '#FFD23F', // secondary accent — background only, with Ink text
  plaster: '#ECEAE3', // page background
  white: '#FFFFFF',
} as const;
export type BrandColor = keyof typeof BRAND;

/** Neutral UI tones derived for this CI (all pass 4.5:1 where used as text). */
export const TONES = {
  muted: '#5E5B55', // secondary text on white / plaster
  line: '#D6D3CA', // hairlines, card borders
  soft: '#F5F4F0', // hover / subtle fills on white
  paper: '#F7F6F2', // PDF sheet background: light plaster / off-white (guideline 08)
  // status colours, dark enough to read on white and on plaster
  danger: '#B42318',
  warn: '#A6380A',
  ok: '#1E6B30',
  info: '#1A5A9E',
} as const;

/** Halo behind the selected point on the plan: Beam reads clearly against the red/blue/green symbols. */
export const SELECT_HALO = BRAND.beam;

export const FONTS = {
  display: 'Schibsted Grotesk', // headings, wordmark
  serif: 'Instrument Serif', // italic, used sparingly
  hand: 'Mali', // handwritten notes
  body: 'IBM Plex Sans Thai', // all body text and Thai
  mono: 'IBM Plex Mono', // small labels, numbers, codes
} as const;

/** Wordmark: Schibsted Grotesk 800, tracking -6%, lower case on two lines (one line only in the secondary lockup). */
export const WORDMARK = { lines: ['light', 'theory'] as const, weight: 800 as const, tracking: -0.06 };

/** Type scale from the guideline (06): letter-spacing in em. */
export const TYPE = {
  display: { weight: 800, tracking: -0.06 }, // big lowercase headlines
  headline: { weight: 700, tracking: -0.04 },
  label: { weight: 500, tracking: 0.1 }, // IBM Plex Mono, UPPERCASE
} as const;

/** The mark, drawn in a 100×100 box: hand-drawn Filament circle + Ink crosshair. */
export const MARK = {
  viewBox: 100,
  strokeWidth: 4.5,
  ring: 'M50 22C67 21 78 34 77 51C76 67 63 78 47 77C32 76 23 63 24 48C25 34 36 23 53 22',
  cross: 'M49 7L51 93M8 51L92 49',
} as const;

/**
 * Primary lockup (mark left, two-line wordmark right), in units of the mark height h.
 * Shared so the web logo and the PDF logo line up the same way.
 */
export const LOCKUP = {
  gap: 0.18, // space between mark and wordmark
  fontSize: 0.44, // wordmark font size
  top: 0.1, // first baseline box offset from the top of the mark
  leading: 0.9, // second line offset, in font sizes
};

/**
 * Graphic language: small hand-drawn motifs (sparkle, scribble, light cone, LED strip, underline).
 * Decoration only — login, empty states and the PDF cover; never on a plan.
 * Each stroke is drawn with round caps in Filament unless it says 'ink'.
 */
export interface Motif {
  w: number;
  h: number;
  strokes: { d: string; dash?: number[]; ink?: boolean }[];
}
/**
 * Graphic language board (Brand Guideline v1.0, 07): spark, ring, beam, glow, strip + dimension, note arrow.
 * Rules: round ends; stroke weight 2.5 / 4.5 / 7 only (see STROKE); 1–2 elements per piece;
 * Filament only for the part that is "lit" (the lamp shade and dimension line stay Ink).
 */
export const MOTIFS = {
  spark: { w: 100, h: 100, strokes: [{ d: 'M50 8L50 30M49 70L50 92M8 50L30 49M70 51L93 50M20 20L33 33M80 19L67 32M21 80L34 67M79 81L66 68' }] },
  ring: { w: 100, h: 100, strokes: [{ d: 'M58 12C80 14 92 34 88 56C84 78 62 92 40 86C18 80 8 58 14 38C20 18 40 8 64 15' }] },
  beam: {
    w: 100, h: 110,
    strokes: [
      { d: 'M50 4L50 14M40 14L60 14L66 26L34 26Z', ink: true },
      { d: 'M36 27L12 92M64 27L88 92' },
      { d: 'M50 32L50 88', dash: [6, 7] },
      { d: 'M10 92C30 103 70 103 90 92' },
    ],
  },
  glow: { w: 160, h: 50, strokes: [{ d: 'M6 34C14 4 28 4 32 26C36 48 50 50 56 26C62 2 76 2 82 26C88 50 102 48 108 26C114 6 130 8 150 22' }] },
  strip: {
    w: 200, h: 50,
    strokes: [
      { d: 'M10 6L10 26M190 6L190 26' },
      { d: 'M10 16L190 16', dash: [12, 9] },
      { d: 'M12 42L188 42M12 42L20 37M12 42L20 47M188 42L180 37M188 42L180 47', ink: true },
    ],
  },
  note: { w: 120, h: 60, strokes: [{ d: 'M8 42C28 8 70 6 98 30M98 30L84 31M98 30L93 17' }] },
} satisfies Record<string, Motif>;
export type MotifName = keyof typeof MOTIFS;

/** The only three stroke weights of the graphic language (px on screen, pt in PDF). */
export const STROKE = { fine: 2.5, standard: 4.5, bold: 7 } as const;
export type StrokeWeight = keyof typeof STROKE;

/** Logo colours per background (Brand Guideline 03): on Filament the ring turns Plaster, on Ink the cross and wordmark turn Plaster. */
export const LOGO_ON = {
  light: { ring: BRAND.filament, cross: BRAND.ink, word: BRAND.ink },
  beam: { ring: BRAND.filament, cross: BRAND.ink, word: BRAND.ink },
  dark: { ring: BRAND.filament, cross: BRAND.plaster, word: BRAND.plaster },
  filament: { ring: BRAND.plaster, cross: BRAND.ink, word: BRAND.ink },
} as const;
export type LogoOn = keyof typeof LOGO_ON;
/** Clear space around the lockup, as a share of the symbol height. Minimum sizes: lockup 30 px, symbol 20 px. */
export const LOGO_CLEAR = 0.35;

/** Circuit wiring colour (plan + PDF): every circuit is drawn in Ink; circuits are told apart by their name tags. Kept as a list so a palette can come back later. */
export const WIRE_COLORS: string[] = [BRAND.ink];
export const WIRE_NONE = '#888888';

/** CSS custom properties for the web app (`--lt-*`), applied once at startup. */
export function brandCssVars(): Record<string, string> {
  return {
    '--lt-ink': BRAND.ink,
    '--lt-filament': BRAND.filament,
    '--lt-beam': BRAND.beam,
    '--lt-plaster': BRAND.plaster,
    '--lt-muted': TONES.muted,
    '--lt-line': TONES.line,
    '--lt-soft': TONES.soft,
    '--lt-danger': TONES.danger,
    '--lt-warn': TONES.warn,
    '--lt-ok': TONES.ok,
    '--lt-info': TONES.info,
    '--lt-font-display': `'${FONTS.display}', '${FONTS.body}', system-ui, sans-serif`,
    '--lt-font-serif': `'${FONTS.serif}', Georgia, serif`,
    '--lt-font-hand': `'${FONTS.hand}', '${FONTS.body}', cursive`,
    '--lt-font-body': `'${FONTS.body}', system-ui, sans-serif`,
    '--lt-font-mono': `'${FONTS.mono}', ui-monospace, monospace`,
  };
}

/** WCAG 2.x relative luminance of a #RRGGBB colour. */
export function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** WCAG contrast ratio between two #RRGGBB colours (1–21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Every text-on-background pair the UI and PDF are allowed to use. Tested to be ≥ 4.5:1. */
export const TEXT_PAIRS: { name: string; fg: string; bg: string }[] = [
  { name: 'ink on plaster', fg: BRAND.ink, bg: BRAND.plaster },
  { name: 'ink on white', fg: BRAND.ink, bg: BRAND.white },
  { name: 'ink on filament', fg: BRAND.ink, bg: BRAND.filament },
  { name: 'ink on beam', fg: BRAND.ink, bg: BRAND.beam },
  { name: 'white on ink', fg: BRAND.white, bg: BRAND.ink },
  { name: 'plaster on ink', fg: BRAND.plaster, bg: BRAND.ink },
  { name: 'filament on ink', fg: BRAND.filament, bg: BRAND.ink },
  { name: 'beam on ink', fg: BRAND.beam, bg: BRAND.ink },
  { name: 'muted on white', fg: TONES.muted, bg: BRAND.white },
  { name: 'muted on plaster', fg: TONES.muted, bg: BRAND.plaster },
  { name: 'muted on soft', fg: TONES.muted, bg: TONES.soft },
  { name: 'ink on soft (PDF spec head, zebra rows)', fg: BRAND.ink, bg: TONES.soft },
  { name: 'ink on paper (PDF sheets)', fg: BRAND.ink, bg: TONES.paper },
  { name: 'muted on paper (PDF labels, footer)', fg: TONES.muted, bg: TONES.paper },
  { name: 'warn on paper (PDF รอราคา)', fg: TONES.warn, bg: TONES.paper },
  { name: 'plaster on ink (logo on dark)', fg: BRAND.plaster, bg: BRAND.ink },
  ...(['danger', 'warn', 'ok', 'info'] as const).flatMap((k) => [
    { name: `${k} on white`, fg: TONES[k], bg: BRAND.white },
    { name: `${k} on plaster`, fg: TONES[k], bg: BRAND.plaster },
  ]),
  { name: 'white on danger (badge)', fg: BRAND.white, bg: TONES.danger },
  { name: 'white on ink 80% (hint)', fg: BRAND.white, bg: '#3A3A3A' },
];

/** Ink or white, whichever reads better on the given fill (e.g. circuit tags). */
export function onColor(bg: string): string {
  return contrast(BRAND.white, bg) >= contrast(BRAND.ink, bg) ? BRAND.white : BRAND.ink;
}
