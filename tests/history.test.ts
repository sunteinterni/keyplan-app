import test from 'node:test';
import assert from 'node:assert/strict';
import { History, snapPlacement, type ApiFn } from '../web/src/history';

type Row = Record<string, unknown> & { id: number };

/** In-memory stand-in for the API. Like SQLite without AUTOINCREMENT, a new row gets max(id) + 1, so ids get reused. */
function fakeServer() {
  const tables: Record<string, Map<number, Row>> = { placements: new Map(), lines: new Map(), floors: new Map(), fixtures: new Map() };
  const calls: string[] = [];
  let failIn = 0; // fail the n-th call from now (1 = next)
  const insert = (t: string, data: Record<string, unknown>) => {
    const id = Math.max(0, ...tables[t].keys()) + 1;
    tables[t].set(id, { ...data, id });
    return id;
  };
  const api: ApiFn = async <T,>(method: string, url: string, body?: unknown): Promise<T> => {
    calls.push(`${method} ${url}`);
    if (failIn > 0 && --failIn === 0) {
      throw new Error('ไม่พบจุด');
    }
    const b = (body ?? {}) as Record<string, unknown>;
    let m: RegExpMatchArray | null;
    if ((m = url.match(/^\/api\/floors\/(\d+)\/(placements|lines)$/)) && method === 'POST') {
      const { circuit_order, ...rest } = b;
      const t = m[2];
      const order = b.circuit_id ? (circuit_order as number | undefined) ?? [...tables[t].values()].filter((r) => r.circuit_id === b.circuit_id).length : 0;
      return { id: insert(t, { ...rest, floor_id: Number(m[1]), circuit_order: order }) } as T;
    }
    if ((m = url.match(/^\/api\/(placements|lines|floors|fixtures)\/(\d+)$/))) {
      const row = tables[m[1]].get(Number(m[2]));
      if (!row) throw new Error('ไม่พบ');
      if (method === 'DELETE') tables[m[1]].delete(row.id);
      else Object.assign(row, b);
      return { ok: true } as T;
    }
    if (url.endsWith('/assign-circuit')) {
      const order = [...tables.placements.values()].filter((r) => r.circuit_id === b.circuit_id).length;
      for (const id of b.placement_ids as number[]) Object.assign(tables.placements.get(id)!, { circuit_id: b.circuit_id, circuit_order: b.circuit_id ? order : 0 });
      return { ok: true } as T;
    }
    throw new Error(`unexpected ${method} ${url}`);
  };
  return { api, tables, calls, insert, failOnce: () => (failIn = 1), failAt: (n: number) => (failIn = n) };
}

const P = (s: ReturnType<typeof fakeServer>) => [...s.tables.placements.values()];

test('create, undo, redo', async () => {
  const s = fakeServer();
  const h = new History(s.api);
  const id = await h.do({ t: 'create', e: 'p', floor: 1, snap: { fixture_id: 7, x: 0.1, y: 0.2, rot: 0, circuit_id: null }, label: 'วางโคม LT1' });
  assert.equal(P(s).length, 1);
  assert.equal(h.undoLabel, 'วางโคม LT1');
  await h.undo();
  assert.equal(P(s).length, 0);
  assert.equal(h.redoLabel, 'วางโคม LT1');
  await h.redo();
  assert.equal(P(s).length, 1);
  assert.equal(P(s)[0].x, 0.1);
  assert.ok(id);
});

test('undoing a delete restores the point with its wiring order; older steps follow the new id', async () => {
  const s = fakeServer();
  const h = new History(s.api);
  s.insert('placements', { fixture_id: 1, x: 0, y: 0, rot: 0, circuit_id: 5, circuit_order: 0 });
  const id = s.insert('placements', { fixture_id: 1, x: 0.3, y: 0.3, rot: 90, circuit_id: 5, circuit_order: 1 });
  s.insert('placements', { fixture_id: 1, x: 0.9, y: 0.9, rot: 0, circuit_id: 5, circuit_order: 2 });

  await h.do({ t: 'patch', e: 'p', id, before: { x: 0.3, y: 0.3 }, after: { x: 0.5, y: 0.5 }, label: 'ย้ายจุด' });
  const row = s.tables.placements.get(id)!;
  await h.do({ t: 'delete', e: 'p', id, floor: 1, snap: snapPlacement(row as never), label: 'ลบจุด' });
  assert.equal(P(s).length, 2);

  await h.undo(); // restore
  const back = P(s).find((r) => r.x === 0.5)!;
  assert.ok(back, 'restored at its moved position');
  assert.notEqual(back.id, id, 'the server gave it a new id');
  assert.equal(back.circuit_order, 1, 'same place in the wiring');
  assert.equal(back.rot, 90);

  await h.undo(); // the move, applied to the restored point
  assert.equal(back.x, 0.3);
  assert.equal(P(s).length, 3);
});

test('an id reused by the server for a different point does not confuse the history', async () => {
  const s = fakeServer();
  const h = new History(s.api);
  s.insert('placements', { fixture_id: 1, x: 0, y: 0, rot: 0, circuit_id: null, circuit_order: 0 });
  const b = s.insert('placements', { fixture_id: 1, x: 0.2, y: 0.2, rot: 0, circuit_id: null, circuit_order: 0 }); // id 2 (max)

  await h.do({ t: 'patch', e: 'p', id: b, before: { x: 0.2 }, after: { x: 0.4 }, label: 'ย้าย B' });
  await h.do({ t: 'delete', e: 'p', id: b, floor: 1, snap: snapPlacement(s.tables.placements.get(b)! as never), label: 'ลบ B' });
  const c = await h.do({ t: 'create', e: 'p', floor: 1, snap: { fixture_id: 9, x: 0.8, y: 0.8, rot: 0, circuit_id: null }, label: 'วาง C' });
  assert.equal(c, b, 'SQLite-style reuse: C got B’s old id');
  await h.do({ t: 'patch', e: 'p', id: c!, before: { x: 0.8 }, after: { x: 0.7 }, label: 'ย้าย C' });

  await h.undo(); // move C back
  assert.equal(s.tables.placements.get(c!)!.x, 0.8);
  assert.equal(s.tables.placements.get(c!)!.fixture_id, 9);
  await h.undo(); // remove C
  assert.equal(P(s).length, 1);
  await h.undo(); // restore B
  const restored = P(s).find((r) => r.fixture_id === 1 && r.x === 0.4)!;
  assert.ok(restored);
  await h.undo(); // move B back — must hit B, not anything else
  assert.equal(restored.x, 0.2);
  assert.equal(P(s).length, 2);
  assert.equal(h.canUndo, false);
});

test('slider changes close together merge into one step; a new edit clears redo', async () => {
  const s = fakeServer();
  let t = 1000;
  const h = new History(s.api, () => t);
  const id = s.insert('placements', { fixture_id: 1, x: 0, y: 0, rot: 0, circuit_id: null, circuit_order: 0 });
  for (const r of [10, 20, 30]) {
    t += 300;
    await h.do({ t: 'patch', e: 'p', id, before: { rot: r - 10 }, after: { rot: r }, label: 'หมุน', merge: `rot:${id}` });
  }
  t += 5000; // later drag is a separate step
  await h.do({ t: 'patch', e: 'p', id, before: { rot: 30 }, after: { rot: 45 }, label: 'หมุน', merge: `rot:${id}` });

  await h.undo();
  assert.equal(s.tables.placements.get(id)!.rot, 30);
  await h.undo();
  assert.equal(s.tables.placements.get(id)!.rot, 0);
  assert.equal(h.canUndo, false);
  assert.equal(h.canRedo, true);
  await h.do({ t: 'patch', e: 'p', id, before: { x: 0 }, after: { x: 1 }, label: 'ย้าย' });
  assert.equal(h.canRedo, false);
});

test('wire tool: undo puts the point back on its old circuit and order, redo appends again', async () => {
  const s = fakeServer();
  const h = new History(s.api);
  const id = s.insert('placements', { fixture_id: 1, x: 0, y: 0, rot: 0, circuit_id: 3, circuit_order: 4 });
  await h.do({ t: 'assign', e: 'p', id, project: 1, before: { circuit_id: 3, circuit_order: 4 }, to: 8, label: 'โยงวงจร' });
  assert.equal(s.tables.placements.get(id)!.circuit_id, 8);
  await h.undo();
  assert.deepEqual([s.tables.placements.get(id)!.circuit_id, s.tables.placements.get(id)!.circuit_order], [3, 4]);
  await h.redo();
  assert.equal(s.tables.placements.get(id)!.circuit_id, 8);
});

test('a step the server refuses is dropped and the rest still works', async () => {
  const s = fakeServer();
  const h = new History(s.api);
  const id = s.insert('placements', { fixture_id: 1, x: 0, y: 0, rot: 0, circuit_id: null, circuit_order: 0 });
  await h.do({ t: 'patch', e: 'p', id, before: { x: 0 }, after: { x: 0.1 }, label: 'a' });
  await h.do({ t: 'patch', e: 'p', id, before: { x: 0.1 }, after: { x: 0.2 }, label: 'b' });
  s.failOnce();
  await assert.rejects(h.undo());
  assert.equal(h.undoLabel, 'a');
  await h.undo();
  assert.equal(s.tables.placements.get(id)!.x, 0);
  // a failed new edit is not recorded
  s.failOnce();
  await assert.rejects(h.do({ t: 'patch', e: 'p', id, before: { x: 0 }, after: { x: 9 }, label: 'c' }));
  assert.equal(h.canUndo, false);
});

test('edits fired without waiting (slider drag) run in order and merge; an undo queued behind them sees them all', async () => {
  const s = fakeServer();
  const h = new History(s.api);
  const id = s.insert('placements', { fixture_id: 1, x: 0, y: 0, rot: 0, circuit_id: null, circuit_order: 0 });
  const ps = [15, 30, 45, 60].map((r) => h.do({ t: 'patch', e: 'p', id, before: { rot: 0 }, after: { rot: r }, label: 'หมุน', merge: `rot:${id}` }));
  const u = h.undo();
  await Promise.all([...ps, u]);
  assert.equal(s.tables.placements.get(id)!.rot, 0, 'one undo reverts the whole drag');
  assert.equal(h.canUndo, false);
  await h.redo();
  assert.equal(s.tables.placements.get(id)!.rot, 60);
});

test('batch: moving several points is one step', async () => {
  const s = fakeServer();
  const h = new History(s.api);
  const ids = [0.1, 0.2, 0.3].map((x) => s.insert('placements', { fixture_id: 1, x, y: 0, rot: 0, circuit_id: null, circuit_order: 0 }));
  await h.do({ t: 'batch', label: 'ย้าย 3 จุด', edits: ids.map((id, i) => ({ t: 'patch', e: 'p', id, before: { x: (i + 1) / 10, y: 0 }, after: { x: (i + 1) / 10 + 0.5, y: 0.5 }, label: 'ย้าย' })) });
  assert.deepEqual(P(s).map((p) => p.y), [0.5, 0.5, 0.5]);
  assert.equal(h.undoLabel, 'ย้าย 3 จุด');
  await h.undo();
  assert.deepEqual(P(s).map((p) => [p.x, p.y]), [[0.1, 0], [0.2, 0], [0.3, 0]]);
  assert.equal(h.canUndo, false);
  await h.redo();
  assert.deepEqual(P(s).map((p) => p.x), [0.6, 0.7, 0.8]);
});

test('batch: deleting several wired points and undoing restores every wiring position', async () => {
  const s = fakeServer();
  const h = new History(s.api);
  const ids = [0, 1, 2, 3].map((o) => s.insert('placements', { fixture_id: 1, x: o / 10, y: 0, rot: 0, circuit_id: 4, circuit_order: o }));
  const rows = ids.map((id) => s.tables.placements.get(id)!);
  const gone = [rows[1], rows[3]];
  await h.do({ t: 'batch', label: 'ลบ 2 จุด', edits: gone.map((r) => ({ t: 'delete', e: 'p', id: r.id, floor: 1, snap: snapPlacement(r as never), label: 'ลบ' })) });
  assert.equal(P(s).length, 2);
  await h.undo();
  assert.deepEqual(P(s).map((p) => p.circuit_order).sort(), [0, 1, 2, 3]);
  await h.redo(); // deletes the restored points (new ids) again
  assert.deepEqual(P(s).map((p) => p.circuit_order).sort(), [0, 2]);
});

test('batch: wiring several points keeps the given order; undo puts back the old circuits', async () => {
  const s = fakeServer();
  const h = new History(s.api);
  const ids = [3, 1, 2].map((x) => s.insert('placements', { fixture_id: 1, x, y: 0, rot: 0, circuit_id: null, circuit_order: 0 }));
  const order = [ids[1], ids[2], ids[0]];
  await h.do({ t: 'batch', label: 'โยง 3 จุด', edits: order.map((id) => ({ t: 'assign', e: 'p', id, project: 1, before: { circuit_id: null, circuit_order: 0 }, to: 9, label: 'โยง' })) });
  assert.deepEqual(order.map((id) => s.tables.placements.get(id)!.circuit_order), [0, 1, 2]);
  await h.undo();
  assert.ok(P(s).every((p) => p.circuit_id === null));
});

test('batch: if a part fails, the parts already done are put back and nothing is recorded', async () => {
  const s = fakeServer();
  const h = new History(s.api);
  const ids = [0.1, 0.2, 0.3].map((x) => s.insert('placements', { fixture_id: 1, x, y: 0, rot: 0, circuit_id: null, circuit_order: 0 }));
  s.failAt(3); // third PATCH fails
  await assert.rejects(h.do({ t: 'batch', label: 'ย้าย', edits: ids.map((id, i) => ({ t: 'patch', e: 'p', id, before: { x: (i + 1) / 10 }, after: { x: 0.9 }, label: 'ย้าย' })) }));
  assert.deepEqual(P(s).map((p) => p.x), [0.1, 0.2, 0.3]);
  assert.equal(h.canUndo, false);
});
