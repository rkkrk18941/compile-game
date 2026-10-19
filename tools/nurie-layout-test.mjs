// Geometry checks for independently movable hit targets; no browser dependency.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require('../nurie-rush/layout.js');
function contained(r) {
  assert.ok(r.x >= 0 && r.y >= 0 && r.w >= 3 && r.h >= 3);
  assert.ok(r.x + r.w <= 100.00001 && r.y + r.h <= 100.00001);
}
for (const orientation of ['portrait', 'landscape']) {
  for (const preset of ['row', 'two']) {
    const c = L.defaults(orientation, preset);
    assert.equal(c.slots.length, 5);
    [c.card, c.tap, ...c.slots].forEach(contained);
    assert.deepEqual(L.issues(c), []);
    assert.deepEqual(L.normalize(c, orientation), c);
  }
  for (const corrupt of [null, {}, [], 'broken', { card: { x: -400, y: Infinity, w: 500, h: NaN }, tap: { w: -3 }, slots: [null, { x: 100, w: 100, art: 900 }] }]) {
    const c = L.normalize(corrupt, orientation);
    [c.card, c.tap, ...c.slots].forEach(contained);
    c.slots.forEach(s => assert.ok(s.art >= 25 && s.art <= 100));
  }
}
const c = L.defaults('portrait', 'two');
c.slots[1] = { ...c.slots[0] };
assert.ok(L.issues(c).some(s => s.includes('コマ1とコマ2')));
c.tap = { ...c.card };
assert.ok(L.issues(c).some(s => s.includes('カード表示')));
assert.equal(L.overlaps({x:0,y:0,w:50,h:50}, {x:50,y:0,w:50,h:50}), false, 'touching borders leave no ambiguous overlap');
const custom = L.defaults('portrait');
custom.card = { x: 5, y: 2, w: 90, h: 45 };
custom.tap = { x: 3, y: 52, w: 94, h: 48 };
custom.slots = L.defaults('portrait', 'two').slots;
custom.slots[2].art = 60;
assert.deepEqual(L.normalize(JSON.parse(JSON.stringify(custom)), 'portrait'), custom, 'save/reload preserves independent rectangles and art scale');
assert.deepEqual(L.issues(custom), []);
console.log('Touch layout passed: portrait/landscape presets, contained hit targets, malformed settings, overlap detection, custom save/reload and independent art scale.');
