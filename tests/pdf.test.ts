import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPdf } from '../server/pdf';
import type { Bundle, Fixture } from '../shared/types';

const fx = (o: Partial<Fixture> & { id: number; code: string }): Fixture => ({
  project_id: 1, cat: 'L', room: '', size: '', qty_manual: null, status: 'draft', mark_size: 'M', model: 'M', name: 'โคมทดสอบ', finish: '', socket: 'E27', bulbs: 1, watt_per_lamp: 10, watt_total: null, kelvin: 3000, ip: '',
  symbol: 'downlight', color: 'red', unit: 'ea', price: null, supplier: '', note: '', photo_file: null, drawing_file: null, spec_qty: null, sort: 0, library_id: null, library_synced_at: null, length_m: null, ...o,
});

const bundle = (fixtures: Fixture[] = []): Bundle => ({
  categories: [],
  retired: [],
  moodboards: [],
  project: { id: 1, name: '[PLACEHOLDER] โครงการทดสอบ', client: '[PLACEHOLDER]', location: '', project_no: 'LT-0000', designer: '', prepared_by: '', revision: 'A', doc_date: '2026-10-04', vat_rate: 7, voltage: 220, pf: 1, discount: 0, install_fee: 0, note: '', created_at: '', updated_at: '' },
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

test('more than six fixtures continue on a second spec sheet', async () => {
  const list = Array.from({ length: 8 }, (_, i) => fx({ id: i + 1, code: `LT${i + 1}` }));
  assert.equal(pageCount(await buildPdf(bundle(list), { prices: false })), 3);
});
