import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-test-'));

const { build } = await import('../server/index');
const app = await build();
let cookie = '';
const H = () => ({ 'x-requested-with': 'lp', cookie });
const call = async (method: string, url: string, payload?: unknown) => {
  const r = await app.inject({ method: method as any, url, payload: payload as any, headers: H() });
  const sc = r.headers['set-cookie'];
  if (sc) cookie = (Array.isArray(sc) ? sc[0] : sc).split(';')[0];
  return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : null };
};

test('setup, project, fixtures, circuits, placements', async () => {
  let r = await call('GET', '/api/auth/state');
  assert.equal(r.status, 200);
  r = await call('POST', '/api/auth/setup', { email: 'a@b.co', name: 'A', password: 'secret123' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await call('GET', '/api/projects');
  assert.equal(r.status, 200);
  r = await call('POST', '/api/projects', { name: 'Demo' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const pid = r.body.id;
  r = await call('POST', `/api/projects/${pid}/floors`, { name: 'F1' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const fid = r.body.id;
  r = await call('POST', `/api/projects/${pid}/fixtures`, { code: 'LT1', model: 'X', symbol: 'downlight' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const xid = r.body.id;
  r = await call('POST', `/api/projects/${pid}/fixtures`, { code: 'LT1' });
  assert.equal(r.status, 409);
  r = await call('POST', `/api/projects/${pid}/circuits`, { name: 'LV-01' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const cid = r.body.id;
  r = await call('POST', `/api/floors/${fid}/placements`, { fixture_id: xid, x: 0.5, y: 0.5 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const plid = r.body.id;
  r = await call('POST', `/api/projects/${pid}/assign-circuit`, { circuit_id: cid, placement_ids: [plid], line_ids: [] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await call('DELETE', `/api/fixtures/${xid}`);
  assert.equal(r.status, 409);
  r = await call('GET', `/api/projects/${pid}`);
  assert.equal(r.body.placements[0].circuit_id, cid);
  r = await call('POST', `/api/projects/${pid}/duplicate`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
});

test('floor plan display: defaults, validation, kept on duplicate', async () => {
  let r = await call('POST', '/api/projects', { name: 'Plan look' });
  const pid = r.body.id;
  r = await call('POST', `/api/projects/${pid}/floors`, { name: 'F1' });
  const fid = r.body.id;
  const floor = async (p: number) => (await call('GET', `/api/projects/${p}`)).body.floors[0];
  let f = await floor(pid);
  assert.equal(f.plan_gray, 1);
  assert.equal(f.plan_opacity, 0.5);
  r = await call('PATCH', `/api/floors/${fid}`, { plan_gray: false, plan_opacity: 5 });
  assert.equal(r.status, 200);
  f = await floor(pid);
  assert.equal(f.plan_gray, 0);
  assert.equal(f.plan_opacity, 1); // clamped to 100%
  await call('PATCH', `/api/floors/${fid}`, { plan_opacity: 0 });
  assert.equal((await floor(pid)).plan_opacity, 0.1); // clamped to 10%
  await call('PATCH', `/api/floors/${fid}`, { plan_gray: true, plan_opacity: 0.35 });
  r = await call('POST', `/api/projects/${pid}/duplicate`);
  const copy = await floor(r.body.id);
  assert.equal(copy.plan_gray, 1);
  assert.equal(copy.plan_opacity, 0.35);
});

test('undo support: points and lines can be restored to an exact wiring order', async () => {
  let r = await call('POST', '/api/projects', { name: 'Undo' });
  const pid = r.body.id;
  const fid = (await call('POST', `/api/projects/${pid}/floors`, {})).body.id;
  const fx = (await call('POST', `/api/projects/${pid}/fixtures`, { code: 'LT1', symbol: 'downlight' })).body.id;
  const ln = (await call('POST', `/api/projects/${pid}/fixtures`, { code: 'LN1', symbol: 'strip', unit: 'm' })).body.id;
  const cid = (await call('POST', `/api/projects/${pid}/circuits`, { name: 'LV-01' })).body.id;
  const ids: number[] = [];
  for (let i = 0; i < 3; i++) ids.push((await call('POST', `/api/floors/${fid}/placements`, { fixture_id: fx, x: i / 10, y: 0, circuit_id: cid })).body.id);
  const order = async () => Object.fromEntries((await call('GET', `/api/projects/${pid}`)).body.placements.map((p: { id: number; circuit_order: number }) => [p.id, p.circuit_order]));
  assert.deepEqual(Object.values(await order()), [0, 1, 2]);

  // delete the middle point, then restore it with its old order (what undo sends)
  await call('DELETE', `/api/placements/${ids[1]}`);
  r = await call('POST', `/api/floors/${fid}/placements`, { fixture_id: fx, x: 0.1, y: 0, circuit_id: cid, circuit_order: 1 });
  assert.equal((await order())[r.body.id], 1);
  // without an explicit order it is appended
  const appended = (await call('POST', `/api/floors/${fid}/placements`, { fixture_id: fx, x: 0.5, y: 0, circuit_id: cid })).body.id;
  assert.equal((await order())[appended], 3);
  // PATCH can set circuit and order together (undo of the wire tool)
  await call('PATCH', `/api/placements/${appended}`, { circuit_id: null, circuit_order: 0 });
  await call('PATCH', `/api/placements/${appended}`, { circuit_id: cid, circuit_order: 7 });
  assert.equal((await order())[appended], 7);

  // lines keep circuit_order too
  r = await call('POST', `/api/floors/${fid}/lines`, { fixture_id: ln, pts: [[0, 0], [1, 1]], circuit_id: cid, circuit_order: 90 });
  const line = (await call('GET', `/api/projects/${pid}`)).body.lines.find((l: { id: number }) => l.id === r.body.id);
  assert.equal(line.circuit_order, 90);
});

test('central library: import a copy, review library edits, save and push back, admin-only delete', async () => {
  const pid = (await call('POST', '/api/projects', { name: 'Lib' })).body.id;
  const fixtureOf = async (id: number) => (await call('GET', `/api/projects/${pid}`)).body.fixtures.find((f: { id: number }) => f.id === id);
  const libOf = async (id: number) => (await call('GET', `/api/library/${id}`)).body;

  // create a library item and import it: a copy with the next code and the library colour
  let r = await call('POST', '/api/library', { model: 'DL-1', name: 'ดาวน์ไลท์', symbol: 'downlight', color: 'green', price: 450, category: 'ดาวน์ไลท์' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const lid = r.body.id;
  r = await call('POST', `/api/projects/${pid}/fixtures/from-library`, { library_id: lid, prefix: 'DL' });
  assert.equal(r.body.code, 'DL-01', 'lighting sub-prefix chosen in the picker, brand format');
  const fid = r.body.id;
  let f = await fixtureOf(fid);
  assert.deepEqual([f.model, f.price, f.color, f.library_id], ['DL-1', 450, 'green', lid]);
  assert.equal((await call('GET', '/api/library')).body.find((x: { id: number }) => x.id === lid).used, 1);

  // the project picks its own plan colour; a later library price is NOT applied by itself
  await call('PATCH', `/api/fixtures/${fid}`, { color: 'red' });
  await call('PATCH', `/api/library/${lid}`, { price: 520 });
  f = await fixtureOf(fid);
  assert.equal(f.price, 450);
  const lib = await libOf(lid);
  assert.ok(lib.updated_at > f.library_synced_at, 'library is newer than the copy');

  // skip: mark as seen, keep the project price
  await call('POST', `/api/fixtures/${fid}/sync-library`, { apply: false });
  f = await fixtureOf(fid);
  assert.equal(f.price, 450);
  assert.equal(f.library_synced_at, lib.updated_at);

  // apply: library spec comes in, the project's colour stays
  await call('PATCH', `/api/library/${lid}`, { price: 600, ip: 'IP44' });
  await call('POST', `/api/fixtures/${fid}/sync-library`, {});
  f = await fixtureOf(fid);
  assert.deepEqual([f.price, f.ip, f.color], [600, 'IP44', 'red']);

  // project → library: save a project-only fixture, then push a newer price back
  const own = (await call('POST', `/api/projects/${pid}/fixtures`, { code: 'LT2', model: 'PD-9', symbol: 'pendant' })).body.id;
  r = await call('POST', `/api/fixtures/${own}/to-library`, { category: 'โคมแขวน' });
  assert.equal(r.status, 200);
  const lid2 = r.body.id;
  assert.deepEqual([(await libOf(lid2)).model, (await libOf(lid2)).category], ['PD-9', 'โคมแขวน']);
  assert.equal((await call('POST', `/api/fixtures/${own}/to-library`, {})).status, 409, 'already linked');
  await call('PATCH', `/api/fixtures/${own}`, { price: 999 });
  await call('POST', `/api/fixtures/${own}/push-library`);
  assert.equal((await libOf(lid2)).price, 999);
  assert.equal((await fixtureOf(own)).library_synced_at, (await libOf(lid2)).updated_at);

  // linear (T5): body length is validated and travels through the library
  const t5 = (await call('POST', '/api/library', { model: 'T5-28W', symbol: 'linear', length_m: 0.6 })).body.id;
  const t5fx = (await call('POST', `/api/projects/${pid}/fixtures/from-library`, { library_id: t5, prefix: 'T5' })).body;
  assert.equal(t5fx.code, 'T5-01');
  assert.equal((await fixtureOf(t5fx.id)).length_m, 0.6);
  assert.equal((await fixtureOf(t5fx.id)).unit, 'set', 'lighting is counted in sets (ชุด), not metres');
  await call('PATCH', `/api/fixtures/${t5fx.id}`, { length_m: 0 });
  assert.equal((await fixtureOf(t5fx.id)).length_m, null, 'non-positive length is cleared');
  await call('PATCH', `/api/fixtures/${t5fx.id}`, { length_m: 1.2 });
  assert.equal((await fixtureOf(t5fx.id)).length_m, 1.2);

  // the project copy keeps the library code when it is free in the project; lighting sub-prefixes like EX are a choice in the picker
  const strip = (await call('POST', '/api/library', { model: 'STRIP-9', symbol: 'strip', price: 180 })).body.id;
  r = await call('POST', `/api/projects/${pid}/fixtures/from-library`, { library_id: strip });
  assert.equal(r.body.code, (await libOf(strip)).code);
  assert.equal((await call('POST', `/api/projects/${pid}/fixtures/from-library`, { library_id: strip, prefix: 'ex' })).body.code, 'EX-01', 'user-chosen prefix');
  assert.equal((await fixtureOf(r.body.id)).unit, 'm');

  // a point used on the plan cannot be turned into a line by a library update
  const fl = (await call('POST', `/api/projects/${pid}/floors`, {})).body.id;
  await call('POST', `/api/floors/${fl}/placements`, { fixture_id: fid, x: 0.5, y: 0.5 });
  await call('PATCH', `/api/library/${lid}`, { symbol: 'strip' });
  assert.equal((await call('POST', `/api/fixtures/${fid}/sync-library`, {})).status, 409);

  // duplicating a project keeps the links
  const dup = (await call('POST', `/api/projects/${pid}/duplicate`)).body.id;
  const dupFx = (await call('GET', `/api/projects/${dup}`)).body.fixtures.find((x: { code: string }) => x.code === 'DL-01');
  assert.equal(dupFx.library_id, lid);

  // members may add/edit but not delete; admins delete and project copies just lose the link
  assert.equal((await call('POST', '/api/users', { email: 'm@b.co', name: 'M', password: 'member123', role: 'member' })).status, 200);
  const adminCookie = cookie;
  await call('POST', '/api/auth/login', { email: 'm@b.co', password: 'member123' });
  assert.equal((await call('PATCH', `/api/library/${lid2}`, { note: 'member edit' })).status, 200);
  assert.equal((await call('DELETE', `/api/library/${lid2}`)).status, 403);
  cookie = adminCookie;
  assert.equal((await call('DELETE', `/api/library/${lid2}`)).status, 200);
  const after = await fixtureOf(own);
  assert.equal(after.library_id, null);
  assert.equal(after.model, 'PD-9');
});

test('unauthenticated and csrf blocked', async () => {
  const r = await app.inject({ method: 'GET', url: '/api/projects' });
  assert.equal(r.statusCode, 401);
  const r2 = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'x' }, headers: { cookie } });
  assert.equal(r2.statusCode, 403);
});

test('exports pdf and xlsx', async () => {
  const pr = await call('GET', '/api/projects');
  const pid = pr.body[0].id;
  const pdf = await app.inject({ method: 'GET', url: `/api/projects/${pid}/export.pdf`, headers: H() });
  assert.equal(pdf.statusCode, 200);
  assert.equal(pdf.rawPayload.subarray(0, 5).toString(), '%PDF-');
  const xl = await app.inject({ method: 'GET', url: `/api/projects/${pid}/export.xlsx`, headers: H() });
  assert.equal(xl.statusCode, 200);
  assert.equal(xl.rawPayload.subarray(0, 2).toString(), 'PK');
});
