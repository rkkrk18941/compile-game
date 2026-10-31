// Confirm that every printed face belongs to the exact engine card/noble.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../splendor/engine.js');
const A = require('../splendor/art.js').SPL_ART;
const root = path.join(__dirname, '../splendor');
const cards = require('../splendor/img/card-map.json');
const nobles = require('../splendor/img/noble-map.json');
assert.equal(cards.length, 90);
assert.equal(new Set(cards.map(c => c.source)).size, 90);
for (const c of E.CARDS) {
  const printed = cards[c.id];
  for (const key of ['id', 'tier', 'color', 'pts', 'cost']) {
    assert.deepEqual(printed[key], c[key], `printed card ${c.id}: ${key}`);
  }
  const html = A.card(c, {tag: 'button', attrs: ' data-slot="3"', badge: '買える', badgeCls: 'ok'});
  assert.match(html, /class="printed-face card-face"/);
  assert.match(html, /data-slot="3"/);
  assert.match(html, /badge ok/);
  assert.ok(html.includes(A.cardLabel(c)), 'complete accessible card label');
  assert.ok(html.includes('card-top'), 'image-independent prestige and bonus');
  assert.ok(html.includes(`data-card-id="${c.id}"`), 'exact engine identity retained');
  assert.ok(html.includes(`background-position:${c.color * 25}% ${c.tier * 50}%`), 'correct illustrated bonus colour and tier');
  assert.ok(fs.statSync(path.join(root, 'img/cards', `${c.id}.webp`)).size > 0);
  for (let i = 0; i < 5; i++) if (c.cost[i]) {
    assert.ok(html.includes(`<i class="k${i}"><small>${A.GEMS[i].short}</small><b>${c.cost[i]}</b></i>`), 'every cost has its colour name and count');
  }
}
assert.equal(nobles.length, 10);
for (const n of E.NOBLES) {
  assert.deepEqual(nobles[n.id].req, n.req, `printed noble ${n.id}`);
  assert.match(A.noble(n), /class="printed-face noble-face"/);
}
for (let i = 0; i < 6; i++) {
  for (const kind of ['chip', 'gem']) {
    const name = `img/${kind}-${i}.webp`;
    assert.ok(fs.statSync(path.join(root, name)).size > 0);
    assert.ok(A.sprite().includes(name));
  }
}
for (const file of ['cards-classic.webp', 'nobles-classic.webp']) {
  assert.ok(fs.statSync(path.join(root, 'img', file)).size > 0);
}
for (const name of ['buildings.webp', 'nobles.webp', 'panel-gold.webp', 'table-blue.webp', 'decks.webp', 'star.svg']) {
  assert.ok(fs.statSync(path.join(root, 'img/toon', name)).size > 0, `illustrated asset ${name}`);
}
console.log('Splendor artwork: 90 exact card mappings, 10 exact noble mappings, 12 component assets OK');
