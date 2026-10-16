import test from 'node:test';
import assert from 'node:assert/strict';
import { boxOf, has, inBox, shift, toggle, union, wiringOrder, type Item } from '../web/src/selection';

test('toggle and union keep pick order', () => {
  let s: Item[] = [];
  s = toggle(s, { k: 'p', id: 1 });
  s = toggle(s, { k: 'l', id: 1 });
  s = toggle(s, { k: 'p', id: 2 });
  assert.deepEqual(s, [{ k: 'p', id: 1 }, { k: 'l', id: 1 }, { k: 'p', id: 2 }]);
  s = toggle(s, { k: 'p', id: 1 });
  assert.equal(has(s, { k: 'p', id: 1 }), false);
  assert.equal(has(s, { k: 'l', id: 1 }), true, 'a point and a line with the same id are different items');
  assert.deepEqual(union(s, [{ k: 'p', id: 2 }, { k: 'p', id: 9 }]), [...s, { k: 'p', id: 9 }]);
});

test('box from any two corners', () => {
  const b = boxOf([0.8, 0.2], [0.3, 0.6]);
  assert.deepEqual(b, { x0: 0.3, y0: 0.2, x1: 0.8, y1: 0.6 });
  assert.ok(inBox({ x: 0.5, y: 0.5 }, b));
  assert.ok(!inBox({ x: 0.9, y: 0.5 }, b));
});

test('wiring order walks to the nearest point from the top-left', () => {
  const pts = [
    { n: 'far-right', x: 0.9, y: 0.1 },
    { n: 'start', x: 0.1, y: 0.1 },
    { n: 'below-start', x: 0.1, y: 0.3 },
    { n: 'mid', x: 0.5, y: 0.1 },
  ];
  assert.deepEqual(wiringOrder(pts).map((p) => p.n), ['start', 'below-start', 'mid', 'far-right']);
  assert.deepEqual(wiringOrder([]), []);
  assert.equal(wiringOrder(pts).length, 4);
  assert.equal(pts.length, 4, 'input untouched');
});

test('shift keeps points on the plan', () => {
  assert.deepEqual(shift([0.5, 0.5], 0.1, -0.2), [0.6, 0.3]);
  assert.deepEqual(shift([0.95, 0.02], 0.1, -0.1), [1, 0]);
});
