// KEYPLAN round 2: the code follows the category, pin shapes and S/M/L size, mood boards, custom PDF export.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { boq } from '../shared/calc';
import { autoSlots, placeImages, slotsFor } from '../shared/moodboard';
import type { Bundle } from '../shared/types';

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kp2-test-'));

const { build } = await import('../server/index');
const { buildPdf, filterBundle } = await import('../server/pdf');
const app = await build();
let cookie = '';
const call = async (method: string, url: string, payload?: unknown) => {
  const r = await app.inject({ method: method as never, url, payload: payload as never, headers: { 'x-requested-with': 'lp', cookie } });
  const sc = r.headers['set-cookie'];
  if (sc) cookie = (Array.isArray(sc) ? sc[0] : sc).split(';')[0];
  return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : null };
};
const bundleOf = async (pid: number) => (await call('GET', `/api/projects/${pid}`)).body as Bundle;
const pages = (pdf: Buffer) => Number(/\/Type \/Pages[\s\S]*?\/Count (\d+)/.exec(pdf.toString('latin1'))?.[1]);
const png = async (color: string) => sharp({ create: { width: 40, height: 30, channels: 3, background: color } }).png().toBuffer();
async function uploadTo(url: string, buf: Buffer) {
  const boundary = '----kp' + Math.random().toString(16).slice(2);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`),
    buf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const r = await app.inject({ method: 'POST', url, payload: body, headers: { cookie, 'x-requested-with': 'lp', 'content-type': `multipart/form-data; boundary=${boundary}` } });
  return { status: r.statusCode, body: JSON.parse(r.body) };
}

await call('POST', '/api/auth/setup', { email: 'owner@kp.test', name: 'Owner', password: 'secret123' });

test('changing the category keeps the code', async () => {
  const pid = (await call('POST', '/api/projects', { name: 'Recode' })).body.id;
  const id = (await call('POST', `/api/projects/${pid}/fixtures`, { cat: 'F' })).body.id;
  assert.equal((await call('PATCH', `/api/fixtures/${id}`, { cat: 'BI' })).status, 200);
  const b = await bundleOf(pid);
  const f = b.fixtures.find((x) => x.id === id)!;
  assert.deepEqual([f.code, f.cat], ['F-01', 'BI']);
  assert.deepEqual(b.retired, []);
  assert.equal((await call('PATCH', `/api/fixtures/${id}`, { cat: 'NOPE' })).status, 400);
});

test('library items get their own code per category; deleted codes are not reused; codes travel to projects', async () => {
  const a = (await call('POST', '/api/library', { cat: 'F', name: 'โซฟา' })).body.id;
  const b2 = (await call('POST', '/api/library', { cat: 'F', name: 'โต๊ะ' })).body.id;
  const s = (await call('POST', '/api/library', { cat: 'S', name: 'กระเบื้อง' })).body.id;
  const lib = async () => (await call('GET', '/api/library')).body as { id: number; code: string; cat: string }[];
  const codeOf = async (id: number) => (await lib()).find((x) => x.id === id)!.code;
  assert.deepEqual([await codeOf(a), await codeOf(b2), await codeOf(s)], ['F-01', 'F-02', 'S-01']);
  // category change keeps the code
  assert.equal((await call('PATCH', `/api/library/${s}`, { cat: 'P' })).status, 200);
  assert.equal(await codeOf(s), 'S-01');
  // deleted code is retired
  assert.equal((await call('DELETE', `/api/library/${b2}`)).status, 200);
  const c = (await call('POST', '/api/library', { cat: 'F' })).body.id;
  assert.equal(await codeOf(c), 'F-03');
  assert.equal((await call('PATCH', `/api/library/${c}`, { code: 'F-02' })).status, 409);
  assert.equal((await call('PATCH', `/api/library/${c}`, { code: 'F-01' })).status, 409, 'unique in the library');
  // library → project keeps the library code when it is free there
  const pid = (await call('POST', '/api/projects', { name: 'Codes travel' })).body.id;
  assert.equal((await call('POST', `/api/projects/${pid}/fixtures/from-library`, { library_id: c })).body.code, 'F-03');
  assert.equal((await call('POST', `/api/projects/${pid}/fixtures/from-library`, { library_id: c })).body.code, 'F-04', 'taken → next free');
  // project → library keeps the project code when the library does not have it
  const fx = (await call('POST', `/api/projects/${pid}/fixtures`, { cat: 'D', name: 'แจกัน' })).body.id;
  const lid = (await call('POST', `/api/fixtures/${fx}/to-library`, {})).body.id;
  assert.equal(await codeOf(lid), 'D-01');
});

test('pin shapes and S/M/L size', async () => {
  const pid = (await call('POST', '/api/projects', { name: 'Pins' })).body.id;
  const id = (await call('POST', `/api/projects/${pid}/fixtures`, { cat: 'D', symbol: 'triangle' })).body.id;
  let f = (await bundleOf(pid)).fixtures[0];
  assert.deepEqual([f.symbol, f.mark_size], ['triangle', 'M']);
  assert.equal((await call('PATCH', `/api/fixtures/${id}`, { symbol: 'circle', mark_size: 'L' })).status, 200);
  assert.equal((await call('PATCH', `/api/fixtures/${id}`, { mark_size: 'XL' })).status, 400);
  assert.equal((await call('PATCH', `/api/fixtures/${id}`, { symbol: 'pendant' })).status, 400, 'lighting symbol on decor');
  f = (await bundleOf(pid)).fixtures[0];
  assert.deepEqual([f.symbol, f.mark_size], ['circle', 'L']);
  const l = (await call('POST', `/api/projects/${pid}/fixtures`, { cat: 'L', symbol: 'pendant' })).body.id;
  await call('PATCH', `/api/fixtures/${l}`, { cat: 'D' });
  assert.equal((await bundleOf(pid)).fixtures.find((x) => x.id === l)!.symbol, 'marker', 'leaving Lighting: a square pin');
});

test('rotation is stored in 90° steps', async () => {
  const pid = (await call('POST', '/api/projects', { name: 'Rotate' })).body.id;
  const fl = (await call('POST', `/api/projects/${pid}/floors`, { name: 'F1' })).body.id;
  const fx = (await call('POST', `/api/projects/${pid}/fixtures`, { cat: 'F', symbol: 'triangle' })).body.id;
  const p = (await call('POST', `/api/floors/${fl}/placements`, { fixture_id: fx, x: 0.5, y: 0.5 })).body.id;
  for (const d of [90, 180, 270, 0]) {
    assert.equal((await call('PATCH', `/api/placements/${p}`, { rot: d })).status, 200);
    assert.equal((await bundleOf(pid)).placements[0].rot, d);
  }
});

test('mood board layouts: templates have fixed slots, automatic layout fits the count', () => {
  for (let n = 1; n <= 12; n++) {
    const s = autoSlots(n);
    assert.equal(s.length, n);
    assert.ok(Math.abs(s.reduce((a, x) => a + x.w * x.h, 0) - 1) < 1e-9, `auto ${n} fills the page`);
  }
  assert.equal(slotsFor('grid4', 9).length, 4);
  const placed = placeImages('grid4', [{ id: 1, board_id: 1, slot: 2, file: 'a', caption: '', img_w: null, img_h: null, x: null, y: null, w: null, h: null, z: 0, crop_x: 0, crop_y: 0, crop_w: 1, crop_h: 1, cutout: null }]);
  assert.deepEqual(placed.map((p) => p.image?.id ?? null), [null, null, 1, null]);
});

test('mood boards: slots, swap, automatic order, copy with the project, PDF right after the cover', async () => {
  const pid = (await call('POST', '/api/projects', { name: 'Mood' })).body.id;
  const bid = (await call('POST', `/api/projects/${pid}/moodboards`, { title: 'โทนห้องนั่งเล่น', template: 'hero3' })).body.id;
  assert.equal((await uploadTo(`/api/moodboards/${bid}/images?slot=2`, await png('#E6765D'))).body.slot, 2);
  for (const c of ['#829B82', '#CBBBA2', '#1F1F1F']) assert.equal((await uploadTo(`/api/moodboards/${bid}/images`, await png(c))).status, 200);
  let mb = (await bundleOf(pid)).moodboards[0];
  assert.deepEqual(mb.images.map((i) => i.slot), [0, 1, 2, 3], 'free slots filled in order');
  assert.equal((await uploadTo(`/api/moodboards/${bid}/images`, await png('#ffffff'))).status, 409, 'template is full');
  const first = mb.images[0].file;
  assert.equal((await call('POST', `/api/moodboards/${bid}/move`, { from: 0, to: 3 })).status, 200);
  mb = (await bundleOf(pid)).moodboards[0];
  assert.equal(mb.images.find((i) => i.slot === 3)!.file, first, 'swapped');
  await call('PATCH', `/api/moodboards/${bid}`, { template: 'auto' });
  await call('DELETE', `/api/moodboard-images/${mb.images.find((i) => i.slot === 1)!.id}`);
  mb = (await bundleOf(pid)).moodboards[0];
  assert.deepEqual(mb.images.map((i) => i.slot), [0, 1, 2], 'automatic: no gaps');
  assert.equal((await call('PATCH', `/api/moodboards/${bid}`, { template: 'nope' })).status, 400);
  const dup = (await call('POST', `/api/projects/${pid}/duplicate`)).body.id;
  assert.equal((await bundleOf(dup)).moodboards[0].images.length, 3, 'copied with the project');
  const pdf = await buildPdf(await bundleOf(pid), { prices: true, parts: ['mood'] });
  assert.equal(pages(pdf), 2, 'cover + mood board');
  // an empty board is not printed
  await call('POST', `/api/projects/${pid}/moodboards`, { title: 'ว่าง' });
  assert.equal(pages(await buildPdf(await bundleOf(pid), { prices: true, parts: ['mood'] })), 2);
});

test('custom export: only the chosen parts and categories', async () => {
  const pid = (await call('POST', '/api/projects', { name: 'Custom' })).body.id;
  await call('POST', `/api/projects/${pid}/fixtures`, { cat: 'F', name: 'โซฟา', price: 1000, qty_manual: 2 });
  await call('POST', `/api/projects/${pid}/fixtures`, { cat: 'P', name: 'สี', price: 100, qty_manual: 10 });
  const b = await bundleOf(pid);
  assert.equal(pages(await buildPdf(b, { prices: true })), 3, 'whole book: cover, spec, quotation');
  assert.equal(pages(await buildPdf(b, { prices: true, parts: ['boq'] })), 2, 'cover + quotation');
  const only = filterBundle(b, ['P']);
  assert.deepEqual(only.fixtures.map((f) => f.code), ['P-01']);
  assert.equal(boq(only).sub, 1000, 'totals count only the chosen categories');
  const r = await app.inject({ method: 'GET', url: `/api/projects/${pid}/export.pdf?prices=1&parts=spec,boq,bogus&cats=F`, headers: { cookie } });
  assert.equal(r.statusCode, 200);
  assert.equal(pages(r.rawPayload), 3);
});
