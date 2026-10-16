// KEYPLAN round 3: plan rotation, canvas (collage) mood boards with layers, crop and background removal, larger templates.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { TEMPLATES, canvasItems, cropPlacement } from '../shared/moodboard';
import type { Bundle } from '../shared/types';

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kp3-test-'));

const { build } = await import('../server/index');
const { buildPdf } = await import('../server/pdf');
const { uploadPath } = await import('../server/files');
const app = await build();
let cookie = '';
const call = async (method: string, url: string, payload?: unknown) => {
  const r = await app.inject({ method: method as never, url, payload: payload as never, headers: { 'x-requested-with': 'lp', cookie } });
  const sc = r.headers['set-cookie'];
  if (sc) cookie = (Array.isArray(sc) ? sc[0] : sc).split(';')[0];
  return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : null };
};
const bundleOf = async (pid: number) => (await call('GET', `/api/projects/${pid}`)).body as Bundle;
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
const solid = (w: number, h: number, color: string) => sharp({ create: { width: w, height: h, channels: 3, background: color } }).png().toBuffer();
/** A "product photo": white background with a terracotta square in the middle. */
const product = async () =>
  sharp({ create: { width: 200, height: 160, channels: 3, background: '#ffffff' } })
    .composite([{ input: await solid(80, 60, '#E6765D'), left: 60, top: 50 }])
    .png()
    .toBuffer();
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

await call('POST', '/api/auth/setup', { email: 'owner@kp.test', name: 'Owner', password: 'secret123' });

test('rotating a plan turns pins, lines and directions with it; back to 0 restores them; the scale is kept', async () => {
  const pid = (await call('POST', '/api/projects', { name: 'Rotate plan' })).body.id;
  const fl = (await call('POST', `/api/projects/${pid}/floors`, { name: 'F1' })).body.id;
  assert.equal((await uploadTo(`/api/floors/${fl}/plan`, await solid(400, 200, '#ffffff'))).status, 200);
  await call('POST', `/api/floors/${fl}/scale`, { a: [0, 0], b: [1, 0], meters: 8 });
  const fx = (await call('POST', `/api/projects/${pid}/fixtures`, { cat: 'L', symbol: 'wall' })).body.id;
  const strip = (await call('POST', `/api/projects/${pid}/fixtures`, { cat: 'L', symbol: 'strip' })).body.id;
  await call('POST', `/api/floors/${fl}/placements`, { fixture_id: fx, x: 0.25, y: 0.1, rot: 0 });
  await call('POST', `/api/floors/${fl}/lines`, { fixture_id: strip, pts: [[0, 0.5], [0.5, 0.5]] });
  let b = await bundleOf(pid);
  const mpp = b.floors[0].mpp;

  assert.equal((await call('POST', `/api/floors/${fl}/rotate`, { deg: 90 })).status, 200);
  b = await bundleOf(pid);
  const f = b.floors[0];
  assert.deepEqual([f.plan_rot, f.plan_w, f.plan_h], [90, 200, 400], 'width and height swap');
  assert.equal(f.mpp, mpp, 'scale unchanged');
  assert.ok(near(b.placements[0].x, 0.9) && near(b.placements[0].y, 0.25), `pin turned clockwise: ${b.placements[0].x},${b.placements[0].y}`);
  assert.equal(b.placements[0].rot, 90, 'direction turned too');
  assert.deepEqual(b.lines[0].pts, [[0.5, 0], [0.5, 0.5]]);
  assert.notEqual(f.plan_file, f.plan_orig, 'the upload is kept');

  assert.equal((await call('POST', `/api/floors/${fl}/rotate`, { deg: 270 })).status, 200);
  assert.equal((await bundleOf(pid)).floors[0].plan_w, 200);
  await call('POST', `/api/floors/${fl}/rotate`, { deg: 0 });
  b = await bundleOf(pid);
  assert.deepEqual([b.floors[0].plan_rot, b.floors[0].plan_w, b.floors[0].plan_h], [0, 400, 200]);
  assert.ok(near(b.placements[0].x, 0.25) && near(b.placements[0].y, 0.1), 'back where it was');
  assert.equal(b.placements[0].rot, 0);
  assert.equal((await call('POST', `/api/floors/${fl}/rotate`, { deg: 45 })).status, 400);
  const empty = (await call('POST', `/api/projects/${pid}/floors`, { name: 'F2' })).body.id;
  assert.equal((await call('POST', `/api/floors/${empty}/rotate`, { deg: 90 })).status, 400, 'no plan yet');
  // a new upload starts again at 0°
  await uploadTo(`/api/floors/${fl}/plan`, await solid(300, 100, '#ffffff'));
  assert.equal((await bundleOf(pid)).floors[0].plan_rot, 0);
});

test('templates for 8 to 16 images', () => {
  const sizes = TEMPLATES.map((t) => t.slots.length);
  for (const n of [8, 9, 10, 12, 16]) assert.ok(sizes.includes(n), `${n} slots`);
  for (const t of TEMPLATES) {
    const area = t.slots.reduce((a, s) => a + s.w * s.h, 0);
    assert.ok(Math.abs(area - 1) < 1e-9, `${t.key} fills the page (${area})`);
  }
});

test('canvas boards: frames, crop limits, layers, background removal, PDF', async () => {
  const pid = (await call('POST', '/api/projects', { name: 'Collage' })).body.id;
  const bid = (await call('POST', `/api/projects/${pid}/moodboards`, { title: 'Collage', template: 'canvas' })).body.id;
  for (let i = 0; i < 3; i++) assert.equal((await uploadTo(`/api/moodboards/${bid}/images`, await product())).status, 200);
  let imgs = (await bundleOf(pid)).moodboards[0].images;
  assert.deepEqual(imgs.map((i) => [i.slot, i.z, i.img_w, i.img_h]), [[0, 1, 200, 160], [1, 2, 200, 160], [2, 3, 200, 160]]);
  assert.ok(imgs.every((i) => i.x != null && i.w! > 0 && i.h! > 0), 'each image gets a frame');
  assert.notEqual(imgs[0].x, imgs[1].x, 'new images cascade');

  const [a, b, c] = imgs;
  assert.equal((await call('PATCH', `/api/moodboard-images/${a.id}`, { x: 0.5, y: 0.4, w: 0.3, h: 0.25 })).status, 200);
  assert.equal((await call('PATCH', `/api/moodboard-images/${a.id}`, { w: 0 })).status, 400);
  assert.equal((await call('PATCH', `/api/moodboard-images/${a.id}`, { crop_x: 0.2, crop_w: 0.6 })).status, 200);
  assert.equal((await call('PATCH', `/api/moodboard-images/${a.id}`, { crop_x: 0.6 })).status, 400, 'crop past the right edge');
  // layers
  assert.equal((await call('POST', `/api/moodboard-images/${a.id}/layer`, { op: 'front' })).body.z, 3);
  assert.equal((await call('POST', `/api/moodboard-images/${c.id}/layer`, { op: 'back' })).body.z, 1);
  assert.equal((await call('POST', `/api/moodboard-images/${b.id}/layer`, { op: 'nope' })).status, 400);
  imgs = (await bundleOf(pid)).moodboards[0].images;
  const order = canvasItems(imgs).map((i) => i.img.id);
  assert.deepEqual(order, [c.id, b.id, a.id], 'bottom to top');

  // background removal: the white border goes, the terracotta square stays
  const r = await call('POST', `/api/moodboard-images/${b.id}/cutout`, { level: 'medium' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.removed > 70 && r.body.removed < 90, `removed ${r.body.removed}%`);
  const { data, info } = await sharp(uploadPath(r.body.cutout)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
  assert.equal(alpha(2, 2), 0, 'corner is transparent');
  assert.equal(alpha(100, 80), 255, 'product is kept');
  const file = await app.inject({ method: 'GET', url: `/files/${r.body.cutout}`, headers: { cookie } });
  assert.equal(file.headers['content-type'], 'image/png');
  assert.equal((await call('POST', `/api/moodboard-images/${b.id}/cutout`, { off: true })).body.cutout, null);
  assert.equal((await call('POST', `/api/moodboard-images/${b.id}/cutout`, { level: 'huge' })).status, 400);

  // crop maths: the crop window fills the frame
  const at = cropPlacement({ x: 0.5, y: 0.4, w: 0.3, h: 0.25 }, { crop_x: 0.2, crop_y: 0, crop_w: 0.6, crop_h: 1 });
  assert.ok(near(at.w, 0.5) && near(at.x, 0.4) && near(at.h, 0.25));

  // printed: cover + one collage sheet; copied with the project, frames and layers included
  assert.equal(pageCount(await buildPdf(await bundleOf(pid), { prices: false, parts: ['mood'] })), 2);
  const dup = (await call('POST', `/api/projects/${pid}/duplicate`)).body.id;
  const copy = (await bundleOf(dup)).moodboards[0];
  assert.equal(copy.template, 'canvas');
  assert.deepEqual(canvasItems(copy.images).map((i) => [i.img.z, i.img.crop_w]), canvasItems(imgs).map((i) => [i.img.z, i.img.crop_w]));
});

const pageCount = (pdf: Buffer) => Number(/\/Type \/Pages[\s\S]*?\/Count (\d+)/.exec(pdf.toString('latin1'))?.[1]);
