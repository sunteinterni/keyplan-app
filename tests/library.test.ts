import test from 'node:test';
import assert from 'node:assert/strict';
import { PREFIX_BY_SYMBOL, SPEC_FIELDS, hasLibraryUpdate, libraryChanges, nextCode } from '../shared/library';
import { SYMBOLS } from '../shared/symbols';
import type { Fixture, LibraryItem } from '../shared/types';

const spec = { model: 'M-1', name: 'ดาวน์ไลท์', finish: '', socket: 'GU10', bulbs: 1, watt_per_lamp: 7, watt_total: null, kelvin: 3000, ip: 'IP20', symbol: 'downlight', unit: 'ea', price: 450, supplier: 'ร้าน A', note: '', photo_file: 'a.jpg', drawing_file: null, length_m: null } as const;
const item = (o: Partial<LibraryItem> = {}): LibraryItem => ({ id: 7, ...spec, color: 'red', category: 'ดาวน์ไลท์', created_by: 1, created_at: '2026-10-01 10:00:00', updated_at: '2026-10-01 10:00:00', ...o });
const fx = (o: Partial<Fixture> = {}): Fixture => ({ id: 1, project_id: 1, code: 'LT1', ...spec, color: 'blue', spec_qty: null, sort: 0, library_id: 7, library_synced_at: '2026-10-01 10:00:00', ...o });

test('no changes between a fresh copy and its library item (colour and code are the project’s own)', () => {
  assert.deepEqual(libraryChanges(fx(), item()), []);
  assert.ok(!SPEC_FIELDS.includes('color' as never));
  assert.ok(!SPEC_FIELDS.includes('code' as never));
});

test('changes list the fields that differ, empty string and null count as the same', () => {
  const ch = libraryChanges(fx({ price: null, note: '' }), item({ price: 520, note: null as never }));
  assert.deepEqual(ch, [{ field: 'price', from: null, to: 520 }]);
});

test('update is offered only when the library was edited after the copy and the edit changed something', () => {
  assert.equal(hasLibraryUpdate(fx(), item()), false);
  // library edited later with a new price → update
  assert.equal(hasLibraryUpdate(fx(), item({ price: 520, updated_at: '2026-10-03 09:00:00' })), true);
  // project changed its own copy, library untouched → no nagging
  assert.equal(hasLibraryUpdate(fx({ price: 400 }), item()), false);
  // reviewed ("skip") after the library edit → no update until the library changes again
  assert.equal(hasLibraryUpdate(fx({ library_synced_at: '2026-10-03 09:00:00' }), item({ price: 520, updated_at: '2026-10-03 09:00:00' })), false);
  // library touched but ended up identical → nothing to offer
  assert.equal(hasLibraryUpdate(fx(), item({ updated_at: '2026-10-04 00:00:00' })), false);
  // not linked / linked elsewhere
  assert.equal(hasLibraryUpdate(fx({ library_id: null }), item({ price: 1, updated_at: '2027-01-01' })), false);
  assert.equal(hasLibraryUpdate(fx(), undefined), false);
});

test('nextCode uses the brand format PREFIX-NN and continues old-style numbering', () => {
  assert.equal(nextCode([]), 'LT-01');
  assert.equal(nextCode([], 'dl'), 'DL-01');
  assert.equal(nextCode(['LT1', 'LT2', 'LT10', 'LN1', 'SP1']), 'LT-11', 'old LT1 style still counts');
  assert.equal(nextCode(['DL-01', 'DL-03', 'WL-01'], 'DL'), 'DL-04', 'gaps are not reused');
  assert.equal(nextCode(['DL-99'], 'DL'), 'DL-100');
  assert.equal(nextCode(['EX-1 ', 'ex-02'], 'EX'), 'EX-03');
  assert.equal(nextCode(['DL-01'], 'D L!'), 'DL-02', 'prefix is cleaned');
  assert.equal(nextCode(['DLX-01'], 'DL'), 'DL-01', 'other prefixes do not count');
});


test('every plan symbol has a suggested prefix', () => {
  for (const s of SYMBOLS) assert.ok(PREFIX_BY_SYMBOL[s.kind], s.kind);
});
