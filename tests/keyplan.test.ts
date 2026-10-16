// KEYPLAN additions on top of Light Theory: material categories, codes per category that are never reused,
// lighting-only circuits, manual quantities and the BOQ grouped by category.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { boq, quantities } from '../shared/calc';
import { BUILTIN_CATEGORIES } from '../shared/categories';
import { SCHEMA_VERSION, migrate } from '../server/schema';
import type { Bundle } from '../shared/types';

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-test-'));

const { build } = await import('../server/index');
const app = await build();
let cookie = '';
const call = async (method: string, url: string, payload?: unknown) => {
  const r = await app.inject({ method: method as never, url, payload: payload as never, headers: { 'x-requested-with': 'lp', cookie } });
  const sc = r.headers['set-cookie'];
  if (sc) cookie = (Array.isArray(sc) ? sc[0] : sc).split(';')[0];
  return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : null };
};
const bundleOf = async (pid: number) => (await call('GET', `/api/projects/${pid}`)).body as Bundle;

await call('POST', '/api/auth/setup', { email: 'owner@kp.test', name: 'Owner', password: 'secret123' });

test('the 12 built-in categories come in guideline order', async () => {
  const r = await call('GET', '/api/categories');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.map((c: { prefix: string }) => c.prefix), ['F', 'BI', 'L', 'S', 'P', 'PL', 'H', 'EQ', 'CT', 'D', 'SG', 'G']);
  assert.ok(r.body.every((c: { builtin: number }) => c.builtin === 1));
  const s = r.body.find((c: { prefix: string }) => c.prefix === 'S');
  assert.deepEqual([s.unit, s.qty_mode, s.icon], ['m2', 'manual', 'surfaces']);
});

test('admins add categories; prefixes are unique, cleaned, locked and never reused', async () => {
  let r = await call('POST', '/api/categories', { prefix: 'wd1!', name_th: 'งานไม้', name_en: 'Woodwork', unit: 'm', qty_mode: 'manual', icon: 'built-in' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.prefix, 'WD');
  const wd = r.body.id;
  assert.equal((await call('POST', '/api/categories', { prefix: 'WD', name_th: 'ซ้ำ' })).status, 409);
  assert.equal((await call('POST', '/api/categories', { prefix: 'F', name_th: 'ซ้ำกับหมวดมาตรฐาน' })).status, 409);
  assert.equal((await call('POST', '/api/categories', { prefix: '12', name_th: 'ไม่มีตัวอักษร' })).status, 400);
  assert.equal((await call('POST', '/api/categories', { prefix: 'CU' })).status, 400, 'Thai name is required');
  assert.equal((await call('PATCH', `/api/categories/${wd}`, { prefix: 'WX' })).status, 400, 'prefix is locked');
  assert.equal((await call('PATCH', `/api/categories/${wd}`, { name_th: 'งานไม้และวีเนียร์' })).status, 200);

  // archived: hidden from new items, prefix still reserved
  assert.equal((await call('POST', `/api/categories/${wd}/archive`, {})).status, 200);
  const pid = (await call('POST', '/api/projects', { name: 'Archive' })).body.id;
  assert.equal((await call('POST', `/api/projects/${pid}/fixtures`, { cat: 'WD' })).status, 400);
  r = await call('POST', '/api/categories', { prefix: 'WD', name_th: 'ใหม่' });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /เก็บถาวร/);
  assert.equal((await call('POST', `/api/categories/${wd}/archive`, { archived: false })).status, 200);
  r = await call('POST', `/api/projects/${pid}/fixtures`, { cat: 'WD' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const item = (await bundleOf(pid)).fixtures.find((f) => f.id === r.body.id)!;
  assert.deepEqual([item.code, item.cat, item.unit, item.symbol], ['WD-01', 'WD', 'm', 'strip'], 'length unit → drawn as a line');
});

test('members can read categories but not change them', async () => {
  await call('POST', '/api/users', { email: 'member@kp.test', name: 'M', password: 'member123', role: 'member' });
  const owner = cookie;
  await call('POST', '/api/auth/login', { email: 'member@kp.test', password: 'member123' });
  assert.equal((await call('GET', '/api/categories')).status, 200);
  assert.equal((await call('POST', '/api/categories', { prefix: 'MB', name_th: 'ไม่ได้' })).status, 403);
  cookie = owner;
});

test('codes follow the category prefix and a deleted code is never issued again', async () => {
  const pid = (await call('POST', '/api/projects', { name: 'Codes' })).body.id;
  const add = async (b: object) => (await call('POST', `/api/projects/${pid}/fixtures`, b)).body.id as number;
  const f1 = await add({ cat: 'F', name: 'โซฟา' });
  const f2 = await add({ cat: 'F', name: 'โต๊ะ' });
  await add({ cat: 'S', name: 'กระเบื้อง' });
  let b = await bundleOf(pid);
  assert.deepEqual(b.fixtures.map((f) => [f.code, f.symbol, f.unit]), [['F-01', 'marker', 'ea'], ['F-02', 'marker', 'ea'], ['S-01', 'marker', 'm2']]);

  assert.equal((await call('DELETE', `/api/fixtures/${f2}`)).status, 200);
  b = await bundleOf(pid);
  assert.deepEqual(b.retired, ['F-02']);
  const f3 = await add({ cat: 'F' });
  assert.equal((await bundleOf(pid)).fixtures.find((f) => f.id === f3)!.code, 'F-03', 'F-02 stays retired');
  assert.equal((await call('PATCH', `/api/fixtures/${f1}`, { code: 'F-02' })).status, 409);
  assert.equal((await call('POST', `/api/projects/${pid}/fixtures`, { cat: 'F', code: 'F-02' })).status, 409);
  // a copy of the project keeps the retired list
  const dup = (await call('POST', `/api/projects/${pid}/duplicate`)).body.id;
  assert.deepEqual((await bundleOf(dup)).retired, ['F-02']);
  // lighting without a category keeps working (Light Theory API) and uses the L prefix
  const l1 = await add({ symbol: 'downlight' });
  assert.equal((await bundleOf(pid)).fixtures.find((f) => f.id === l1)!.code, 'L-01');
  // non-lighting items cannot use lighting symbols
  const f4 = await add({ cat: 'F', symbol: 'pendant' });
  assert.equal((await bundleOf(pid)).fixtures.find((f) => f.id === f4)!.symbol, 'marker');
  assert.equal((await call('POST', `/api/projects/${pid}/fixtures`, { cat: 'NOPE' })).status, 400);
});

test('circuits accept lighting items only', async () => {
  const pid = (await call('POST', '/api/projects', { name: 'Circuits' })).body.id;
  const fl = (await call('POST', `/api/projects/${pid}/floors`, { name: 'F1' })).body.id;
  const sofa = (await call('POST', `/api/projects/${pid}/fixtures`, { cat: 'F' })).body.id;
  const lamp = (await call('POST', `/api/projects/${pid}/fixtures`, { cat: 'L', symbol: 'downlight' })).body.id;
  const cid = (await call('POST', `/api/projects/${pid}/circuits`, { name: 'LV-01' })).body.id;
  assert.equal((await call('POST', `/api/floors/${fl}/placements`, { fixture_id: sofa, x: 0.2, y: 0.2, circuit_id: cid })).status, 400);
  const ps = (await call('POST', `/api/floors/${fl}/placements`, { fixture_id: sofa, x: 0.2, y: 0.2 })).body.id;
  const pl = (await call('POST', `/api/floors/${fl}/placements`, { fixture_id: lamp, x: 0.3, y: 0.2 })).body.id;
  assert.equal((await call('PATCH', `/api/placements/${ps}`, { circuit_id: cid })).status, 400);
  assert.equal((await call('POST', `/api/projects/${pid}/assign-circuit`, { circuit_id: cid, placement_ids: [ps, pl] })).status, 200);
  let b = await bundleOf(pid);
  assert.equal(b.placements.find((p) => p.id === ps)!.circuit_id, null, 'bulk assign skips non-lighting');
  assert.equal(b.placements.find((p) => p.id === pl)!.circuit_id, cid);
  // moving a wired light to another category takes it out of its circuit
  assert.equal((await call('PATCH', `/api/fixtures/${lamp}`, { cat: 'D' })).status, 200);
  b = await bundleOf(pid);
  assert.equal(b.placements.find((p) => p.id === pl)!.circuit_id, null);
});

test('manual quantities: area items are typed in, any item can override the plan count', async () => {
  const pid = (await call('POST', '/api/projects', { name: 'Qty' })).body.id;
  const fl = (await call('POST', `/api/projects/${pid}/floors`, { name: 'F1' })).body.id;
  const tile = (await call('POST', `/api/projects/${pid}/fixtures`, { cat: 'S', price: 890 })).body.id;
  const chair = (await call('POST', `/api/projects/${pid}/fixtures`, { cat: 'F', price: 4200 })).body.id;
  await call('POST', `/api/floors/${fl}/placements`, { fixture_id: tile, x: 0.5, y: 0.5 });
  await call('POST', `/api/floors/${fl}/placements`, { fixture_id: chair, x: 0.1, y: 0.1 });
  let q = quantities(await bundleOf(pid));
  assert.deepEqual([q[tile].manual, q[tile].plan, q[tile].total], [true, 1, 0], 'pins never give area QTY');
  assert.deepEqual([q[chair].manual, q[chair].total], [false, 1]);
  assert.equal((await call('PATCH', `/api/fixtures/${tile}`, { qty_manual: 12.555 })).status, 200);
  assert.equal((await call('PATCH', `/api/fixtures/${chair}`, { qty_manual: 6 })).status, 200);
  assert.equal((await call('PATCH', `/api/fixtures/${chair}`, { qty_manual: -1 })).status, 400);
  const b = await bundleOf(pid);
  q = quantities(b);
  assert.equal(q[tile].total, 12.56, 'two decimals');
  assert.deepEqual([q[chair].manual, q[chair].plan, q[chair].total], [true, 1, 6]);
  const r = boq(b);
  assert.deepEqual(r.groups.map((g) => [g.category.prefix, g.rows.length, g.sub]), [['F', 1, 25200], ['S', 1, 11178.4]], 'guideline order: F before S');
  // clearing the override goes back to the plan count
  await call('PATCH', `/api/fixtures/${chair}`, { qty_manual: null });
  assert.equal(quantities(await bundleOf(pid))[chair].total, 1);
});

test('item status and new fields are validated and kept on duplicate', async () => {
  const pid = (await call('POST', '/api/projects', { name: 'Status' })).body.id;
  const id = (await call('POST', `/api/projects/${pid}/fixtures`, { cat: 'PL', room: 'ห้องน้ำ', size: '70×40×80', status: 'ordered' })).body.id;
  assert.equal((await call('PATCH', `/api/fixtures/${id}`, { status: 'lost' })).status, 400);
  assert.equal((await call('PATCH', `/api/fixtures/${id}`, { unit: 'roll' })).status, 200);
  const dup = (await call('POST', `/api/projects/${pid}/duplicate`)).body.id;
  const f = (await bundleOf(dup)).fixtures[0];
  assert.deepEqual([f.code, f.cat, f.room, f.size, f.status, f.unit], ['PL-01', 'PL', 'ห้องน้ำ', '70×40×80', 'ordered', 'roll']);
});

test('PDF and Excel exports work for a mixed project', async () => {
  const pid = (await call('POST', '/api/projects', { name: '[PLACEHOLDER] บ้านทดสอบ' })).body.id;
  await call('POST', `/api/projects/${pid}/fixtures`, { cat: 'F', name: 'โซฟา', price: 42500, qty_manual: 1 });
  await call('POST', `/api/projects/${pid}/fixtures`, { cat: 'P', name: 'สีทาภายใน', price: 85, qty_manual: 120 });
  await call('POST', `/api/projects/${pid}/fixtures`, { cat: 'L', name: 'ดาวน์ไลท์', price: 450, qty_manual: 8 });
  const pdf = await app.inject({ method: 'GET', url: `/api/projects/${pid}/export.pdf?prices=1`, headers: { cookie } });
  assert.equal(pdf.statusCode, 200);
  assert.equal(pdf.rawPayload.subarray(0, 5).toString(), '%PDF-');
  assert.match(String(pdf.headers['content-disposition']), /keyplan\.pdf/);
  const xlsx = await app.inject({ method: 'GET', url: `/api/projects/${pid}/export.xlsx`, headers: { cookie } });
  assert.equal(xlsx.statusCode, 200);
  assert.equal(xlsx.rawPayload.subarray(0, 2).toString(), 'PK');
});

test('VAT and net total match the workbook sample (43,834 → 3,068.38 → 46,902.38)', () => {
  const b: Bundle = {
    categories: [], retired: [], moodboards: [],
    project: { id: 1, name: 'T', subtitle: '', client: '', location: '', project_no: '', designer: '', prepared_by: '', revision: '', doc_date: '2026-10-16', vat_rate: 7, voltage: 220, pf: 1, discount: 0, install_fee: 0, note: '', created_at: '', updated_at: '' },
    floors: [],
    fixtures: [{
      id: 1, project_id: 1, code: 'F-01', cat: 'F', room: '', size: '', qty_manual: 1, status: 'draft', mark_size: 'M', model: '', name: 'x', finish: '', socket: '', bulbs: null, watt_per_lamp: null, watt_total: null, kelvin: null, ip: '',
      symbol: 'marker', color: 'red', unit: 'ea', price: 43834, supplier: '', note: '', photo_file: null, drawing_file: null, spec_qty: null, sort: 0, library_id: null, library_synced_at: null, length_m: null,
    }],
    placements: [], lines: [], circuits: [],
  };
  const r = boq(b);
  assert.deepEqual([r.sub, r.vat, r.grand], [43834, 3068.38, 46902.38]);
});

test('a Light Theory database (schema 4) upgrades: data kept, items become Lighting, 12 categories added', () => {
  const db = new Database(':memory:');
  migrate(db, 4);
  db.prepare("INSERT INTO projects (name) VALUES ('Old')").run();
  db.prepare("INSERT INTO fixtures (project_id, code, model, symbol, unit, price) VALUES (1, 'LT1', 'X', 'downlight', 'ea', 450)").run();
  db.prepare("INSERT INTO library (model, category) VALUES ('Y', 'ดาวน์ไลท์')").run();
  migrate(db);
  assert.equal(db.pragma('user_version', { simple: true }), SCHEMA_VERSION);
  const f = db.prepare('SELECT code, cat, room, size, qty_manual, status, price FROM fixtures').get();
  assert.deepEqual(f, { code: 'LT1', cat: 'L', room: '', size: '', qty_manual: null, status: 'draft', price: 450 });
  assert.deepEqual(db.prepare('SELECT cat, category FROM library').get(), { cat: 'L', category: 'ดาวน์ไลท์' });
  assert.equal((db.prepare('SELECT COUNT(*) c FROM categories WHERE builtin = 1').get() as { c: number }).c, BUILTIN_CATEGORIES.length);
  db.close();
});
