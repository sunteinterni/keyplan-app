import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import sharp from 'sharp';
import { SCHEMA_V1, SCHEMA_VERSION, migrate } from '../server/schema';
import { planImage } from '../server/files';

test('migrating a version-1 database keeps floors and adds plan display defaults', () => {
  const d = new Database(':memory:');
  d.exec(SCHEMA_V1);
  d.pragma('user_version = 1');
  d.prepare("INSERT INTO projects (id, name) VALUES (1, 'P')").run();
  d.prepare("INSERT INTO floors (project_id, name, plan_file, mpp) VALUES (1, 'F1', 'x.jpg', 0.01)").run();
  migrate(d);
  assert.equal(d.pragma('user_version', { simple: true }), SCHEMA_VERSION);
  const f = d.prepare('SELECT * FROM floors').get() as Record<string, unknown>;
  assert.equal(f.name, 'F1');
  assert.equal(f.mpp, 0.01);
  assert.equal(f.plan_gray, 1);
  assert.equal(f.plan_opacity, 0.5);
  migrate(d); // running again is a no-op
  assert.equal(d.pragma('user_version', { simple: true }), SCHEMA_VERSION);
});

test('a new database starts at the latest version', () => {
  const d = new Database(':memory:');
  migrate(d);
  assert.equal(d.pragma('user_version', { simple: true }), SCHEMA_VERSION);
  const cols = (d.prepare('PRAGMA table_info(floors)').all() as { name: string }[]).map((c) => c.name);
  assert.ok(cols.includes('plan_gray') && cols.includes('plan_opacity'));
  const fcols = (d.prepare('PRAGMA table_info(fixtures)').all() as { name: string }[]).map((c) => c.name);
  assert.ok(fcols.includes('library_id') && fcols.includes('library_synced_at') && fcols.includes('length_m'));
  assert.ok(d.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'library'").get());
});

const pixel = async (buf: Buffer) => {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  return Array.from(data.subarray(0, info.channels));
};

test('planImage: greyscale and blending with white', async () => {
  const red = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 200, g: 40, b: 40 } } }).png().toBuffer();
  const black = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();

  const g = await pixel(await planImage(red, true, 1));
  assert.ok(g.length === 1 || (Math.abs(g[0] - g[1]) <= 2 && Math.abs(g[1] - g[2]) <= 2), `grey expected, got ${g}`);

  const half = await pixel(await planImage(black, false, 0.5)); // black at 50% over white ≈ mid grey
  for (const v of half) assert.ok(Math.abs(v - 128) <= 3, `≈128 expected, got ${half}`);

  const full = await pixel(await planImage(red, false, 1)); // untouched colour
  assert.ok(full[0] > 180 && full[1] < 70, `red kept, got ${full}`);

  const clamped = await pixel(await planImage(black, false, 0)); // opacity is clamped to 10%
  for (const v of clamped) assert.ok(Math.abs(v - 230) <= 3, `≈230 expected, got ${clamped}`);
});
