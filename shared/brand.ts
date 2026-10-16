// KEYPLAN brand (Web App Guidelines v1.0) — the one place for brand colours, fonts, status colours and contrast rules.
// The web (CSS variables) and the PDF exporter (pdfkit) both read from here. Logo and icon geometry come from
// brand-assets.ts (generated from reference/brand). Plan symbol colours (red/blue/green) are working colours,
// not brand colours: they live in symbols.ts.

export const BRAND = {
  canvas: '#F5F1E8', // page background
  white: '#FFFFFF', // cards, inputs, tables
  ink: '#1F1F1F', // Charcoal: text, lines, icons — never a large fill
  ink2: '#5E5A52', // Warm Grey: secondary text
  line: '#CBBBA2', // Beige: dividers, hairlines
  fill: '#EADFCB', // Beige Soft: table header, hover, selected
  sidebar: '#EFE8D8', // sidebar and disabled fills
  primary: '#E6765D', // Terracotta: primary button, selected chip — a fill, never text on light
  primaryHover: '#F08C75',
  primaryPressed: '#D4614A',
  primaryText: '#A9432B', // Terracotta Deep: links, codes, accent text
  danger: '#7A2E1B', // Terracotta Dark: error text and borders
  dangerBg: '#F4D9D0',
  sage: '#829B82', // secondary fills, plan objects — a fill, never text on light
  sageText: '#4A614A', // Sage Deep
  ok: '#2D6A47',
  okBg: '#D5E6D9', // Sage Tint
  warn: '#8A5200',
  warnBg: '#F6E2B8',
} as const;
export type BrandColor = keyof typeof BRAND;

/** Item status (guideline 04): colour + dot + label, never colour alone. */
export const STATUSES = ['draft', 'quoted', 'approved', 'ordered', 'delivered', 'issue'] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_STYLE: Record<Status, { th: string; en: string; bg: string; fg: string }> = {
  draft: { th: 'ร่าง', en: 'Draft', bg: BRAND.fill, fg: BRAND.ink2 },
  quoted: { th: 'เสนอราคาแล้ว', en: 'Quoted', bg: BRAND.white, fg: BRAND.ink },
  approved: { th: 'อนุมัติ', en: 'Approved', bg: BRAND.okBg, fg: BRAND.sageText },
  ordered: { th: 'สั่งซื้อแล้ว', en: 'Ordered', bg: BRAND.warnBg, fg: BRAND.warn },
  delivered: { th: 'ส่งถึงหน้างาน', en: 'Delivered', bg: BRAND.okBg, fg: BRAND.ok },
  issue: { th: 'มีปัญหา', en: 'Issue', bg: BRAND.dangerBg, fg: BRAND.danger },
};
export const isStatus = (s: unknown): s is Status => STATUSES.includes(s as Status);

/** Highlight behind the selected point on the plan: a working colour that reads against red/blue/green symbols. */
export const SELECT_HALO = '#FFD23F';

export const FONTS = {
  display: 'Manrope', // English display, headings, wordmark-adjacent text
  body: 'IBM Plex Sans Thai', // Thai, body text and tables
  mono: 'IBM Plex Mono', // codes and numbers
} as const;

/** Type scale (guideline 05): letter-spacing in em. Thai text is never squeezed. */
export const TYPE = {
  display: { weight: 800, tracking: -0.04 },
  headline: { weight: 800, tracking: -0.03 },
  label: { weight: 500, tracking: 0.06 }, // IBM Plex Mono, UPPERCASE
} as const;

/** Lines and depth (guideline 06). */
export const LINE_W = 1.5; // Charcoal line on cards, inputs, tables
export const HAIRLINE_W = 1; // Beige row dividers

/** Circuit wiring colour (plan + PDF): every circuit is drawn in Charcoal; circuits are told apart by their name tags. */
export const WIRE_COLORS: string[] = [BRAND.ink];
export const WIRE_NONE = '#888888';

/** CSS custom properties for the web app (`--kp-*`), applied once at startup. */
export function brandCssVars(): Record<string, string> {
  const v: Record<string, string> = {};
  const css: Record<BrandColor, string> = {
    canvas: 'canvas', white: 'white', ink: 'ink', ink2: 'ink-2', line: 'line', fill: 'fill', sidebar: 'sidebar',
    primary: 'primary', primaryHover: 'primary-hover', primaryPressed: 'primary-pressed', primaryText: 'primary-text',
    danger: 'danger', dangerBg: 'danger-bg', sage: 'sage', sageText: 'sage-text', ok: 'ok', okBg: 'ok-bg', warn: 'warn', warnBg: 'warn-bg',
  };
  for (const k of Object.keys(BRAND) as BrandColor[]) v[`--kp-${css[k]}`] = BRAND[k];
  v['--kp-halo'] = SELECT_HALO;
  v['--font-display'] = `'${FONTS.display}', '${FONTS.body}', system-ui, sans-serif`;
  v['--font-ui'] = `'${FONTS.body}', system-ui, sans-serif`;
  v['--font-code'] = `'${FONTS.mono}', ui-monospace, monospace`;
  return v;
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
  ...(['canvas', 'white', 'fill', 'sidebar', 'primary', 'primaryHover', 'okBg', 'warnBg', 'dangerBg'] as const).map((bg) => ({ name: `ink on ${bg}`, fg: BRAND.ink, bg: BRAND[bg] })),
  ...(['canvas', 'white', 'fill', 'sidebar'] as const).flatMap((bg) => [
    { name: `ink-2 on ${bg}`, fg: BRAND.ink2, bg: BRAND[bg] },
    { name: `primary-text on ${bg}`, fg: BRAND.primaryText, bg: BRAND[bg] },
    { name: `sage-text on ${bg}`, fg: BRAND.sageText, bg: BRAND[bg] },
    { name: `danger on ${bg}`, fg: BRAND.danger, bg: BRAND[bg] },
    { name: `warn on ${bg}`, fg: BRAND.warn, bg: BRAND[bg] },
    { name: `ok on ${bg}`, fg: BRAND.ok, bg: BRAND[bg] },
  ]),
  ...Object.entries(STATUS_STYLE).map(([k, s]) => ({ name: `status ${k}`, fg: s.fg, bg: s.bg })),
  { name: 'white on ink (toast, hint)', fg: BRAND.white, bg: BRAND.ink },
  { name: 'canvas on ink', fg: BRAND.canvas, bg: BRAND.ink },
  { name: 'ink on halo (selected point label)', fg: BRAND.ink, bg: SELECT_HALO },
];

/** Charcoal or white, whichever reads better on the given fill (e.g. circuit tags). */
export function onColor(bg: string): string {
  return contrast(BRAND.white, bg) >= contrast(BRAND.ink, bg) ? BRAND.white : BRAND.ink;
}
