import test from 'node:test';
import assert from 'node:assert/strict';
import { boq, loadSchedule, lineLengthM, quantities, issues, unitWatt } from '../shared/calc';
import { pointsAlong, wiringPath, polylineLength } from '../shared/symbols';
import type { Bundle, Fixture } from '../shared/types';

const fx = (o: Partial<Fixture> & { id: number; code: string }): Fixture => ({
  project_id: 1, cat: 'L', room: '', size: '', qty_manual: null, status: 'draft', mark_size: 'M', model: 'M', name: '', finish: '', socket: '', bulbs: null, watt_per_lamp: null, watt_total: null, kelvin: 3000, ip: '',
  symbol: 'downlight', color: 'red', unit: 'ea', price: null, supplier: '', note: '', photo_file: null, drawing_file: null, spec_qty: null, sort: 0, library_id: null, library_synced_at: null, length_m: null, ...o,
});

const bundle = (): Bundle => ({
  categories: [],
  retired: [],
  moodboards: [],
  project: { id: 1, name: 'T', client: '', location: '', project_no: '', designer: '', prepared_by: '', revision: '', doc_date: '2026-10-04', vat_rate: 7, voltage: 220, pf: 1, discount: 0, install_fee: 0, note: '', created_at: '', updated_at: '' },
  floors: [
    { id: 1, project_id: 1, name: 'F1', sort: 0, plan_file: 'a', plan_w: 1000, plan_h: 500, mpp: 0.01, symbol_scale: 1, plan_gray: 1, plan_opacity: 0.5 },
    { id: 2, project_id: 1, name: 'F2', sort: 1, plan_file: 'b', plan_w: 1000, plan_h: 500, mpp: null, symbol_scale: 1, plan_gray: 1, plan_opacity: 0.5 },
  ],
  fixtures: [
    fx({ id: 1, code: 'LT1', socket: 'E27', bulbs: 6, watt_per_lamp: 10, price: 1000 }),
    fx({ id: 2, code: 'LT10', watt_total: 80, price: 500, spec_qty: 3 }),
    fx({ id: 3, code: 'LN1', symbol: 'strip', unit: 'm', watt_per_lamp: 9, price: 100 }),
    fx({ id: 4, code: 'LT2', symbol: 'spot', watt_total: 5 }),
  ],
  placements: [
    { id: 1, project_id: 1, floor_id: 1, fixture_id: 1, x: 0.1, y: 0.1, rot: 0, circuit_id: 1, circuit_order: 0 },
    { id: 2, project_id: 1, floor_id: 2, fixture_id: 1, x: 0.1, y: 0.1, rot: 0, circuit_id: 1, circuit_order: 1 },
    { id: 3, project_id: 1, floor_id: 1, fixture_id: 2, x: 0.2, y: 0.1, rot: 0, circuit_id: 2, circuit_order: 0 },
    { id: 4, project_id: 1, floor_id: 1, fixture_id: 2, x: 0.3, y: 0.1, rot: 0, circuit_id: null, circuit_order: 0 },
  ],
  lines: [
    // 0.5 of 1000px = 500px * 0.01 m = 5 m on floor 1 (calibrated)
    { id: 1, project_id: 1, floor_id: 1, fixture_id: 3, pts: [[0, 0], [0.5, 0]], heads: 0, head_fixture_id: null, circuit_id: 2, circuit_order: 0 },
    // floor 2 has no scale
    { id: 2, project_id: 1, floor_id: 2, fixture_id: 3, pts: [[0, 0], [0.5, 0]], heads: 0, head_fixture_id: null, circuit_id: null, circuit_order: 0 },
    // a track rail with 3 spot heads
    { id: 3, project_id: 1, floor_id: 1, fixture_id: 3, pts: [[0, 0.2], [0.2, 0.2]], heads: 3, head_fixture_id: 4, circuit_id: 1, circuit_order: 2 },
  ],
  circuits: [
    { id: 1, project_id: 1, name: 'LV-01', area: 'Living', breaker_a: 10, note: '', sort: 0 },
    { id: 2, project_id: 1, name: 'LV-02', area: 'Dining', breaker_a: null, note: '', sort: 1 },
  ],
});

test('unitWatt: bulbs x watt, total override, per metre', () => {
  const b = bundle();
  assert.equal(unitWatt(b.fixtures[0]), 60);
  assert.equal(unitWatt(b.fixtures[1]), 80);
  assert.equal(unitWatt(b.fixtures[2]), 9);
});

test('line length uses plan size and scale; null when no scale', () => {
  const b = bundle();
  assert.equal(lineLengthM(b.lines[0], b.floors[0]), 5);
  assert.equal(lineLengthM(b.lines[1], b.floors[1]), null);
});

test('quantities per floor, metres, heads, uncalibrated', () => {
  const q = quantities(bundle());
  assert.deepEqual(q[1].perFloor, { 1: 1, 2: 1 });
  assert.equal(q[1].total, 2);
  assert.equal(q[3].total, 7); // 5 m + 2 m rail
  assert.equal(q[3].uncalibrated, 1);
  assert.equal(q[4].total, 3); // heads
});

test('BOQ totals with VAT 7%, discount and install fee', () => {
  const b = bundle();
  b.project.discount = 100;
  b.project.install_fee = 200;
  const r = boq(b);
  // LT1 2x1000 + LT10 2x500 + LN1 7x100 = 2000+1000+700 = 3700 ; LT2 has no price
  assert.equal(r.sub, 3700);
  assert.equal(r.base, 3800);
  assert.equal(r.vat, 266);
  assert.equal(r.grand, 4066);
  assert.equal(r.unpriced, 1);
});

test('load schedule: watts and amps per circuit, unassigned row', () => {
  const ls = loadSchedule(bundle());
  const lv1 = ls.rows[0];
  // LT1 x2 = 120 W, rail 2 m * 9 = 18 W, heads 3*5 = 15 W
  assert.equal(lv1.watts, 153);
  assert.equal(lv1.amps, 0.7);
  assert.equal(lv1.pieces, 5);
  assert.equal(ls.rows[1].watts, 125); // LT10 80 + 5 m strip 45
  assert.ok(ls.unassigned);
  assert.equal(ls.unassigned!.watts, 80);
});

test('issues flag spec qty mismatch and uncalibrated lines', () => {
  const i = issues(bundle());
  assert.ok(i.some((x) => x.code === 'LT10' && /สเปคชีท/.test(x.text)));
  assert.ok(i.some((x) => x.code === 'LN1' && /สเกล/.test(x.text)));
});

test('geometry helpers', () => {
  assert.equal(polylineLength([[0, 0], [3, 4]]), 5);
  const p = pointsAlong([[0, 0], [10, 0]], 2);
  assert.equal(p.length, 2);
  assert.equal(p[0].x, 2.5);
  assert.match(wiringPath([[0, 0], [10, 0], [10, 10]]), /^M0 0 Q.* 10 0 Q.* 10 10$/);
});
