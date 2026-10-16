import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LINEAR_M, SYMBOLS, isLineSymbol, lineStyle, linearLengthPx, pointSymbol, strokeUnit } from '../shared/symbols';
import { quantities } from '../shared/calc';
import type { Bundle, Fixture } from '../shared/types';

test('linear (T5) is a rotatable point symbol counted per piece', () => {
  const meta = SYMBOLS.find((s) => s.kind === 'linear')!;
  assert.equal(meta.geometry, 'point');
  assert.equal(meta.rotatable, true);
  assert.equal(isLineSymbol('linear'), false);
});

test('linear draws one solid bar of the given length, centred and rotated, as thick as a track rail', () => {
  const r = 10;
  const [bar, ...rest] = pointSymbol('linear', 500, 300, r, 0, 120);
  assert.equal(rest.length, 0);
  assert.ok(bar.t === 'line');
  if (bar.t !== 'line') return;
  assert.deepEqual([bar.x1, bar.y1, bar.x2, bar.y2], [440, 300, 560, 300]);
  assert.ok(Math.abs((bar.sw ?? 1) * strokeUnit(r) - lineStyle('track', r).sw) < 1e-9, 'same stroke as a track rail');
  const [v] = pointSymbol('linear', 500, 300, r, 90, 120);
  if (v.t !== 'line') return assert.fail();
  assert.ok(Math.abs(v.x1 - 500) < 1e-9 && Math.abs(v.x2 - 500) < 1e-9, 'rotated 90° → vertical');
  assert.ok(Math.abs(Math.abs(v.y2 - v.y1) - 120) < 1e-9);
});

test('drawn length follows the floor scale (0.60 / 1.20 m), falls back without a scale', () => {
  assert.equal(linearLengthPx(0.6, 0.01, 10), 60); // 1 px = 1 cm → 60 px
  assert.equal(linearLengthPx(1.2, 0.01, 10), 120);
  assert.equal(linearLengthPx(null, 0.01, 10), DEFAULT_LINEAR_M / 0.01, 'unset length = 1.20 m');
  assert.equal(linearLengthPx(0.6, null, 10), 70, 'no scale → 7 × symbol size');
});

test('linear fixtures are counted in pieces like other point symbols', () => {
  const fx: Fixture = {
    id: 1, project_id: 1, code: 'T5-01', cat: 'L', room: '', size: '', qty_manual: null, status: 'draft', mark_size: 'M', model: '', name: 'T5', finish: '', socket: 'T5', bulbs: 1, watt_per_lamp: 28, watt_total: null, kelvin: 4000, ip: '',
    symbol: 'linear', color: 'blue', unit: 'ea', price: null, supplier: '', note: '', photo_file: null, drawing_file: null, spec_qty: null, sort: 0,
    library_id: null, library_synced_at: null, length_m: 1.2,
  };
  const b: Bundle = {
    categories: [],
    retired: [],
    moodboards: [],
    project: { id: 1, name: 'T', client: '', location: '', project_no: '', designer: '', prepared_by: '', revision: '', doc_date: '2026-10-05', vat_rate: 7, voltage: 220, pf: 1, discount: 0, install_fee: 0, note: '', created_at: '', updated_at: '' },
    floors: [{ id: 1, project_id: 1, name: 'F1', sort: 0, plan_file: null, plan_w: 1000, plan_h: 500, mpp: 0.01, symbol_scale: 1, plan_gray: 1, plan_opacity: 0.5, plan_orig: null, plan_rot: 0 }],
    fixtures: [fx],
    placements: [1, 2, 3].map((id) => ({ id, project_id: 1, floor_id: 1, fixture_id: 1, x: id / 10, y: 0.5, rot: 90, circuit_id: null, circuit_order: 0 })),
    lines: [],
    circuits: [],
  };
  assert.equal(quantities(b)[1].total, 3);
});
