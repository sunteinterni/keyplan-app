import test from 'node:test';
import assert from 'node:assert/strict';
import { BRAND, MARK, TEXT_PAIRS, WIRE_COLORS, brandCssVars, contrast, onColor } from '../shared/brand';
import { COLORS, LABEL_COLORS } from '../shared/symbols';

test('contrast matches WCAG reference values', () => {
  assert.equal(Math.round(contrast('#000000', '#FFFFFF') * 10) / 10, 21);
  assert.equal(contrast('#777777', '#777777'), 1);
  assert.equal(contrast(BRAND.ink, BRAND.white), contrast(BRAND.white, BRAND.ink));
});

test('every allowed text pair is at least 4.5:1', () => {
  for (const p of TEXT_PAIRS) assert.ok(contrast(p.fg, p.bg) >= 4.5, `${p.name}: ${contrast(p.fg, p.bg).toFixed(2)}`);
});

test('accent colours are not readable as text on light backgrounds', () => {
  // Guards the CI rule: Filament/Beam are fills and strokes, not text colours, on plaster or white.
  for (const bg of [BRAND.plaster, BRAND.white]) {
    assert.ok(contrast(BRAND.filament, bg) < 4.5);
    assert.ok(contrast(BRAND.beam, bg) < 4.5);
  }
  assert.ok(contrast(BRAND.white, BRAND.filament) < 4.5);
});

test('brand palette is the CI palette and plan colours are untouched', () => {
  assert.deepEqual(
    { ink: BRAND.ink, filament: BRAND.filament, beam: BRAND.beam, plaster: BRAND.plaster },
    { ink: '#141414', filament: '#FF4F1F', beam: '#FFD23F', plaster: '#ECEAE3' },
  );
  assert.deepEqual(COLORS, { red: '#E10600', blue: '#1030E8', green: '#0E9F3E' });
  for (const w of WIRE_COLORS) assert.ok(!Object.values(COLORS).includes(w));
});

test('mark geometry and css variables', () => {
  assert.equal(MARK.viewBox, 100);
  assert.equal(MARK.strokeWidth, 4.5);
  assert.match(MARK.ring, /^M50 22C/);
  const vars = brandCssVars();
  assert.equal(vars['--lt-filament'], BRAND.filament);
  assert.ok(Object.keys(vars).every((k) => k.startsWith('--lt-')));
});

test('onColor picks a readable label colour for every circuit colour', () => {
  for (const c of WIRE_COLORS) assert.ok(contrast(onColor(c), c) >= 4.5, `${c} → ${onColor(c)} ${contrast(onColor(c), c).toFixed(2)}`);
  assert.equal(onColor(BRAND.ink), BRAND.white);
  assert.equal(onColor(BRAND.beam), BRAND.ink);
});

test('plan label colours read at 4.5:1 on their white halo; symbols keep the working colours', () => {
  for (const [k, c] of Object.entries(LABEL_COLORS)) assert.ok(contrast(c, BRAND.white) >= 4.5, `${k} ${c} ${contrast(c, BRAND.white).toFixed(2)}`);
  assert.equal(LABEL_COLORS.red, COLORS.red);
  assert.equal(LABEL_COLORS.blue, COLORS.blue);
  assert.equal(COLORS.green, '#0E9F3E');
});
