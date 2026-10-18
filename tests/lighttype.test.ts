// Lighting types: Built-in (one price), Retrofit (fixture + lamps), Driver (fixture + driver).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { boq, issues, lightExtra, lightExtraText, unitPrice } from '../shared/calc';
import type { Bundle } from '../shared/types';

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kplt-test-'));

const { build } = await import('../server/index');
const app = await build();
let cookie = '';
const call = async (method: string, url: string, payload?: unknown) => {
  const r = await app.inject({ method: method as never, url, payload: payload as never, headers: { 'x-requested-with': 'lp', cookie } });
  const sc = r.headers['set-cookie'];
  if (sc) cookie = (Array.isArray(sc) ? sc[0] : sc).split(';')[0];
  return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : null };
};
await call('POST', '/api/auth/setup', { email: 'owner@kp.test', name: 'Owner', password: 'secret123' });

const base = { cat: 'L', price: 1000, bulbs: 2, lamp_price: 120, driver_price: 450 };

test('unit price: built-in is the fixture price, retrofit adds lamps × lamps per set, driver adds the driver', () => {
  assert.equal(unitPrice({ ...base, light_type: 'builtin' }), 1000);
  assert.equal(unitPrice({ ...base, light_type: 'retrofit' }), 1240);
  assert.equal(unitPrice({ ...base, light_type: 'retrofit', bulbs: null }), 1120, 'no lamp count → one lamp');
  assert.equal(unitPrice({ ...base, light_type: 'driver' }), 1450);
  assert.equal(unitPrice({ ...base, light_type: 'retrofit', price: null }), null, 'fixture price missing → รอราคา');
  assert.equal(unitPrice({ ...base, light_type: 'retrofit', lamp_price: null }), 1000, 'lamp price missing adds nothing (and is flagged)');
  assert.equal(lightExtra({ ...base, cat: 'F', light_type: 'driver' }), 0, 'other categories never get extras');
  assert.equal(lightExtraText({ ...base, light_type: 'retrofit', lamp_type: 'LED GU10 7W', driver_type: '' }), 'หลอด LED GU10 7W 2×120');
  assert.equal(lightExtraText({ ...base, light_type: 'driver', lamp_type: '', driver_type: '24V 60W' }), 'Driver 24V 60W 450');
});

test('API: type and prices are validated, priced in the BOQ, flagged when missing, and travel with the library', async () => {
  const pid = (await call('POST', '/api/projects', { name: 'Light types' })).body.id;
  const id = (await call('POST', `/api/projects/${pid}/fixtures`, { cat: 'L', symbol: 'downlight', price: 1000, qty_manual: 3 })).body.id;
  const get = async () => (await call('GET', `/api/projects/${pid}`)).body as Bundle;
  let b = await get();
  assert.equal(b.fixtures[0].light_type, 'builtin', 'new lights are built-in');
  assert.equal((await call('PATCH', `/api/fixtures/${id}`, { light_type: 'halogen' })).status, 400);
  assert.equal((await call('PATCH', `/api/fixtures/${id}`, { lamp_price: -5 })).status, 400);

  assert.equal((await call('PATCH', `/api/fixtures/${id}`, { light_type: 'retrofit', bulbs: 2, lamp_type: 'LED GU10 7W' })).status, 200);
  b = await get();
  assert.ok(issues(b).some((i) => i.text === 'ยังไม่มีราคาหลอด'));
  await call('PATCH', `/api/fixtures/${id}`, { lamp_price: 120 });
  b = await get();
  assert.equal(boq(b).rows[0].price, 1240);
  assert.equal(boq(b).sub, 3720);

  await call('PATCH', `/api/fixtures/${id}`, { light_type: 'driver', driver_type: '24V 60W' });
  assert.ok(issues(await get()).some((i) => i.text === 'ยังไม่มีราคา Driver'));
  await call('PATCH', `/api/fixtures/${id}`, { driver_price: 450 });
  assert.equal(boq(await get()).sub, 4350);

  // saved to the library and copied into another project with the same type and prices
  const lid = (await call('POST', `/api/fixtures/${id}/to-library`, {})).body.id;
  const lib = (await call('GET', `/api/library/${lid}`)).body;
  assert.deepEqual([lib.light_type, lib.driver_type, lib.driver_price], ['driver', '24V 60W', 450]);
  const p2 = (await call('POST', '/api/projects', { name: 'Copy' })).body.id;
  await call('POST', `/api/projects/${p2}/fixtures/from-library`, { library_id: lid });
  const f2 = ((await call('GET', `/api/projects/${p2}`)).body as Bundle).fixtures[0];
  assert.deepEqual([f2.light_type, f2.driver_price], ['driver', 450]);
  // duplicate keeps it too
  const dup = (await call('POST', `/api/projects/${pid}/duplicate`)).body.id;
  assert.equal(((await call('GET', `/api/projects/${dup}`)).body as Bundle).fixtures[0].light_type, 'driver');
});
