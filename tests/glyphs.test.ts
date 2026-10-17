// FF&E Symbol Guideline symbols: every symbol converts to valid drawing data, and items pick, keep and print them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GLYPH_CATEGORIES, glyphParts, glyphsFor, isGlyph } from '../shared/glyphs';
import { BUILTIN_CATEGORIES } from '../shared/categories';
import { pointSymbol } from '../shared/symbols';
import type { Bundle } from '../shared/types';

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kpg-test-'));

const { build } = await import('../server/index');
const { buildPdf } = await import('../server/pdf');
const app = await build();
let cookie = '';
const call = async (method: string, url: string, payload?: unknown) => {
  const r = await app.inject({ method: method as never, url, payload: payload as never, headers: { 'x-requested-with': 'lp', cookie } });
  const sc = r.headers['set-cookie'];
  if (sc) cookie = (Array.isArray(sc) ? sc[0] : sc).split(';')[0];
  return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : null };
};
await call('POST', '/api/auth/setup', { email: 'owner@kp.test', name: 'Owner', password: 'secret123' });

test('the guideline covers every built-in category except Lighting, with codes in order', () => {
  const prefixes = GLYPH_CATEGORIES.map((c) => c.prefix);
  for (const c of BUILTIN_CATEGORIES) assert.equal(prefixes.includes(c.prefix), c.prefix !== 'L', c.prefix);
  for (const c of GLYPH_CATEGORIES) c.items.forEach((g, i) => assert.equal(g.code, `${c.prefix}-${String(i + 1).padStart(2, '0')}`));
  assert.equal(glyphsFor('F')[0].en, '3-Seat Sofa');
  assert.equal(glyphsFor('L').length, 0);
});

test('every symbol converts to finite path data, at any rotation', () => {
  for (const c of GLYPH_CATEGORIES) {
    for (const g of c.items) {
      for (const rot of [0, 90, 180, 270]) {
        const parts = glyphParts(g.code, 100, 50, 30, rot);
        assert.ok(parts.length > 0, g.code);
        for (const p of parts) {
          assert.match(p.d, /^M/, `${g.code} starts with a move`);
          assert.ok(!/NaN|undefined|Infinity/.test(p.d), `${g.code} ${rot}°: ${p.d}`);
        }
      }
    }
  }
});

test('rotation turns a symbol around its pin', () => {
  // the sofa back (r6,12,52,10) sits at the top at 0° and on the right at 90°
  const top = glyphParts('F-01', 0, 0, 64, 0)[0].d;
  const right = glyphParts('F-01', 0, 0, 64, 90)[0].d;
  const firstPoint = (d: string) => d.slice(1).split(' ').slice(0, 2).map(Number);
  const [x0, y0] = firstPoint(top);
  const [x1, y1] = firstPoint(right);
  assert.ok(y0 < 0 && Math.abs(x1 - -y0) < 0.01 && Math.abs(y1 - x0) < 0.01, `${x0},${y0} → ${x1},${y1}`);
  // an unknown symbol falls back to the square pin
  assert.equal(pointSymbol('glyph', 0, 0, 10, 0, undefined, 'X-99')[0].t, 'poly');
  assert.equal(pointSymbol('glyph', 0, 0, 10, 0, undefined, 'F-01')[0].t, 'path');
});

test('items pick a guideline symbol; it is validated, copied from the library and printed', async () => {
  const pid = (await call('POST', '/api/projects', { name: 'Symbols' })).body.id;
  const fl = (await call('POST', `/api/projects/${pid}/floors`, { name: 'F1' })).body.id;
  const sofa = (await call('POST', `/api/projects/${pid}/fixtures`, { cat: 'F', glyph: 'F-01' })).body.id;
  let b = (await call('GET', `/api/projects/${pid}`)).body as Bundle;
  let f = b.fixtures.find((x) => x.id === sofa)!;
  assert.deepEqual([f.symbol, f.glyph], ['glyph', 'F-01']);
  assert.equal((await call('PATCH', `/api/fixtures/${sofa}`, { glyph: 'F-99' })).status, 400);
  assert.equal((await call('PATCH', `/api/fixtures/${sofa}`, { symbol: 'glyph', glyph: 'F-17' })).status, 200);
  f = ((await call('GET', `/api/projects/${pid}`)).body as Bundle).fixtures.find((x) => x.id === sofa)!;
  assert.equal(f.glyph, 'F-17');
  assert.ok(isGlyph(f.glyph));
  // library item with a symbol travels into a project
  const lid = (await call('POST', '/api/library', { cat: 'PL', name: 'โถสุขภัณฑ์', glyph: 'PL-01' })).body.id;
  const r = await call('POST', `/api/projects/${pid}/fixtures/from-library`, { library_id: lid });
  b = (await call('GET', `/api/projects/${pid}`)).body as Bundle;
  const wc = b.fixtures.find((x) => x.id === r.body.id)!;
  assert.deepEqual([wc.symbol, wc.glyph], ['glyph', 'PL-01']);
  // pins with symbols print
  await call('POST', `/api/floors/${fl}/placements`, { fixture_id: sofa, x: 0.5, y: 0.5, rot: 90 });
  const pdf = await buildPdf((await call('GET', `/api/projects/${pid}`)).body as Bundle, { prices: false });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  // copied with the project
  const dup = (await call('POST', `/api/projects/${pid}/duplicate`)).body.id;
  assert.ok(((await call('GET', `/api/projects/${dup}`)).body as Bundle).fixtures.some((x) => x.glyph === 'F-17'));
});
