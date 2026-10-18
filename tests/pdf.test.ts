import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPdf } from '../server/pdf';
import type { Bundle, Fixture } from '../shared/types';

const fx = (o: Partial<Fixture> & { id: number; code: string }): Fixture => ({
  project_id: 1, cat: 'L', room: '', size: '', qty_manual: null, status: 'draft', mark_size: 'M', glyph: null, light_type: 'builtin', lamp_type: '', lamp_price: null, driver_type: '', driver_price: null, model: 'M', name: 'โคมทดสอบ', finish: '', socket: 'E27', bulbs: 1, watt_per_lamp: 10, watt_total: null, kelvin: 3000, ip: '',
  symbol: 'downlight', color: 'red', unit: 'ea', price: null, supplier: '', note: '', photo_file: null, drawing_file: null, spec_qty: null, sort: 0, library_id: null, library_synced_at: null, length_m: null, ...o,
});

const bundle = (fixtures: Fixture[] = []): Bundle => ({
  categories: [],
  retired: [],
  moodboards: [],
  project: { id: 1, name: '[PLACEHOLDER] โครงการทดสอบ', subtitle: '', client: '[PLACEHOLDER]', location: '', project_no: 'LT-0000', designer: '', prepared_by: '', revision: 'A', doc_date: '2026-10-04', vat_rate: 7, voltage: 220, pf: 1, discount: 0, install_fee: 0, note: '', created_at: '', updated_at: '' },
  floors: [],
  fixtures,
  placements: [],
  lines: [],
  circuits: [],
});

const pageCount = (pdf: Buffer) => Number(/\/Type \/Pages[\s\S]*?\/Count (\d+)/.exec(pdf.toString('latin1'))?.[1]);

test('an empty project still gets a cover and one sheet', async () => {
  const pdf = await buildPdf(bundle(), { prices: true });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.equal(pageCount(pdf), 2);
});

test('cover + spec sheet + quotation; the quotation is left out without prices', async () => {
  const list = [fx({ id: 1, code: 'LT1', price: 1200 }), fx({ id: 2, code: 'LT2', color: 'green' }), fx({ id: 3, code: 'LN1', symbol: 'strip', unit: 'm' })];
  assert.equal(pageCount(await buildPdf(bundle(list), { prices: true })), 3);
  assert.equal(pageCount(await buildPdf(bundle(list), { prices: false })), 2);
});

test('spec sheets hold 12 items a page; the 13th continues on a second sheet', async () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => fx({ id: i + 1, code: `L-${String(i + 1).padStart(2, '0')}` }));
  assert.equal(pageCount(await buildPdf(bundle(many(12)), { prices: false })), 2, 'cover + one spec sheet');
  assert.equal(pageCount(await buildPdf(bundle(many(13)), { prices: false })), 3);
});

test('spec sheets group by category; three small categories share one page', async () => {
  const list = [
    ...[1, 2, 3, 4].map((i) => fx({ id: i, code: `F-0${i}`, cat: 'F' })),
    ...[5, 6, 7, 8].map((i) => fx({ id: i, code: `L-0${i}`, cat: 'L' })),
    ...[9, 10].map((i) => fx({ id: i, code: `S-0${i}`, cat: 'S' })),
  ];
  const pdf = await buildPdf(bundle(list), { prices: false });
  assert.equal(pageCount(pdf), 2, 'three bands and three rows fit on one sheet');
});
