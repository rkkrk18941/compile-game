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
    [c.card, ...c.slots].forEach(contained);
    assert.equal('tap' in c, false, 'there is no independently configured common tap area');
    assert.deepEqual(L.issues(c), []);
    assert.deepEqual(L.normalize(c, orientation), c);
  }
  for (const corrupt of [null, {}, [], 'broken', { card: { x: -400, y: Infinity, w: 500, h: NaN }, tap: { w: -3 }, slots: [null, { x: 100, w: 100, art: 900 }] }]) {
    const c = L.normalize(corrupt, orientation);
    [c.card, ...c.slots].forEach(contained);
    c.slots.forEach(s => assert.ok(s.art >= 25 && s.art <= 100));
  }
}
const c = L.defaults('portrait', 'two');
c.slots[1] = { ...c.slots[0] };
assert.ok(L.issues(c).some(s => s.includes('コマ1とコマ2')));
c.slots[0] = { ...c.card };
assert.ok(L.issues(c).some(s => s.includes('カード表示')));
assert.equal(L.overlaps({x:0,y:0,w:50,h:50}, {x:50,y:0,w:50,h:50}), false, 'touching borders leave no ambiguous overlap');
const custom = L.defaults('portrait');
custom.card = { x: 30, y: 30, w: 40, h: 40 };
custom.slots = [[10,10],[40,10],[80,40],[40,80],[10,40]].map(([x,y])=>({x,y,w:10,h:10,art:100}));
custom.slots[2].art = 60;
assert.deepEqual(L.normalize(JSON.parse(JSON.stringify(custom)), 'portrait'), custom, 'save/reload preserves independent rectangles and art scale');
assert.deepEqual(L.issues(custom), []);
const old = {card:{x:0,y:0,w:74,h:100},tap:{x:78,y:0,w:22,h:100},slots:Array.from({length:5},(_,i)=>({x:4,y:i*20+1,w:92,h:18,art:60}))};
const migrated = L.normalize(old, 'landscape');
assert.deepEqual(L.issues(migrated), []);
assert.equal(migrated.slots[0].x, 78.88);
assert.equal(migrated.slots[0].w, 20.24);
assert.equal(migrated.slots[0].art, 60);
assert.deepEqual(L.normalize(migrated,'landscape'), migrated, 'migration applies only once');
assert.equal('tap' in migrated, false);
console.log('Touch layout passed: unrestricted placements on all four sides of the card, card/target collisions, old-layout migration, portrait/landscape presets, malformed settings and custom save/reload.');
