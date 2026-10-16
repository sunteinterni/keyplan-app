import test from 'node:test';
import assert from 'node:assert/strict';
import { BRAND, STATUSES, STATUS_STYLE, TEXT_PAIRS, WIRE_COLORS, brandCssVars, contrast, onColor } from '../shared/brand';
import { ICON_PATHS, MARK_SHAPES, WORDMARK_PATH } from '../shared/brand-assets';
import { BUILTIN_CATEGORIES, ICON_KEYS } from '../shared/categories';
import { COLORS, LABEL_COLORS } from '../shared/symbols';

test('contrast matches WCAG reference values', () => {
  assert.equal(Math.round(contrast('#000000', '#FFFFFF') * 10) / 10, 21);
  assert.equal(contrast('#777777', '#777777'), 1);
  assert.equal(contrast(BRAND.ink, BRAND.white), contrast(BRAND.white, BRAND.ink));
});

test('every allowed text pair is at least 4.5:1', () => {
  for (const p of TEXT_PAIRS) assert.ok(contrast(p.fg, p.bg) >= 4.5, `${p.name}: ${contrast(p.fg, p.bg).toFixed(2)}`);
});

test('guideline contrast notes: Charcoal on Canvas 14.6:1, Warm Grey at least 5.9:1, Terracotta and Sage fail as text', () => {
  assert.equal(Math.round(contrast(BRAND.ink, BRAND.canvas) * 10) / 10, 14.6);
  // the guideline (p. 04) prints 5.9:1; WCAG maths gives 6.1:1 for #5E5A52 on #F5F1E8 — either way above 4.5
  assert.ok(contrast(BRAND.ink2, BRAND.canvas) >= 5.9);
  for (const bg of [BRAND.canvas, BRAND.white]) {
    assert.ok(contrast(BRAND.primary, bg) < 4.5, 'Terracotta is a fill, not text');
    assert.ok(contrast(BRAND.sage, bg) < 4.5, 'Sage is a fill, not text');
  }
});

test('brand palette is the guideline palette and plan colours are untouched', () => {
  assert.deepEqual(
    { canvas: BRAND.canvas, ink: BRAND.ink, primary: BRAND.primary, primaryText: BRAND.primaryText, sage: BRAND.sage, line: BRAND.line },
    { canvas: '#F5F1E8', ink: '#1F1F1F', primary: '#E6765D', primaryText: '#A9432B', sage: '#829B82', line: '#CBBBA2' },
  );
  assert.deepEqual(COLORS, { red: '#E10600', blue: '#1030E8', green: '#0E9F3E' });
  for (const w of WIRE_COLORS) assert.ok(!Object.values(COLORS).includes(w));
});

test('six statuses, each with a Thai and English label', () => {
  assert.deepEqual([...STATUSES], ['draft', 'quoted', 'approved', 'ordered', 'delivered', 'issue']);
  for (const s of STATUSES) assert.ok(STATUS_STYLE[s].th && STATUS_STYLE[s].en);
});

test('css variables use the --kp- prefix and the guideline font stacks', () => {
  const vars = brandCssVars();
  assert.equal(vars['--kp-primary'], BRAND.primary);
  assert.equal(vars['--kp-ink-2'], BRAND.ink2);
  assert.match(vars['--font-display'], /^'Manrope'/);
  assert.match(vars['--font-ui'], /^'IBM Plex Sans Thai'/);
  assert.match(vars['--font-code'], /^'IBM Plex Mono'/);
});

test('logo and icons come from the official SVGs', () => {
  assert.equal(MARK_SHAPES.length, 11);
  assert.ok(MARK_SHAPES.some((m) => m.t === 'rect' && m.fill === BRAND.primary), 'terracotta room');
  assert.ok(MARK_SHAPES.some((m) => m.t === 'circle' && m.fill === BRAND.sage), 'sage circle');
  assert.ok(WORDMARK_PATH.d.startsWith('M20.6 0L7 0L7-72'), 'K of the wordmark');
  for (const c of BUILTIN_CATEGORIES) assert.ok(ICON_PATHS[c.icon]?.length, `icon for ${c.prefix}`);
  assert.ok(ICON_KEYS.includes('other'));
});

test('onColor picks a readable label colour for every circuit colour', () => {
  for (const c of WIRE_COLORS) assert.ok(contrast(onColor(c), c) >= 4.5);
  assert.equal(onColor(BRAND.ink), BRAND.white);
});

test('plan label colours read at 4.5:1 on their white halo; symbols keep the working colours', () => {
  for (const [k, c] of Object.entries(LABEL_COLORS)) assert.ok(contrast(c, BRAND.white) >= 4.5, `${k} ${c}`);
  assert.equal(COLORS.green, '#0E9F3E');
});
