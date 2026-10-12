// BGMデータ（assets/music.js）の検査: node tools/music-regression.mjs
// メロディが小節にぴったり収まるか、コード・パターンの書式、場面ごとの割り当てを確かめる。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx = { console, Math, JSON, Object, Array, Number, String, Map, Set, WeakMap, Error, Float32Array };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../assets/music.js', import.meta.url), 'utf8'), ctx);
const M = ctx.COMPILE_MUSIC, { TRACKS, parseBar, parseChord, voicing } = M._data;

assert.equal(TRACKS.length, 7, '7 tracks');
const ids = new Set();
for (const tr of TRACKS) {
  assert(!ids.has(tr.id), 'unique id ' + tr.id); ids.add(tr.id);
  assert(tr.title && tr.sub && tr.bpm >= 60 && tr.bpm <= 190, tr.id + ' header');
  assert(tr.gain > .3 && tr.gain <= 1.2, tr.id + ' gain');
  assert(Number.isInteger(tr.loop) && tr.loop >= 0 && tr.loop < tr.sections.length, tr.id + ' loop point');
  for (const [name, bars] of Object.entries(tr.mel || {})) bars.forEach((b, i) => {
    const parsed = parseBar(b);
    assert.equal(parsed.total, 16, `${tr.id} melody ${name} bar ${i + 1} must fill 16 steps (got ${parsed.total}): "${b}"`);
    for (const n of parsed) assert(n.note >= 48 && n.note <= 96, `${tr.id} melody ${name} bar ${i + 1} note range`);
  });
  for (const sec of tr.sections) {
    assert(sec.bars > 0 && sec.prog.length > 0, `${tr.id}/${sec.n} bars & progression`);
    for (const c of sec.prog) { const ch = parseChord(c); assert(voicing(ch).length >= 3, `${tr.id}/${sec.n} chord ${c}`); }
    const lanes = { ...(sec.drums || {}), ...(sec.fill || {}) };
    for (const [lane, pat] of Object.entries(lanes)) {
      assert(['k', 's', 'c', 'h', 'o', 'sh', 'r', 'p', 't'].includes(lane), `${tr.id}/${sec.n} lane ${lane}`);
      assert.equal(pat.length, 16, `${tr.id}/${sec.n} drum lane ${lane} is 16 steps`);
      assert(/^[.xXo-]+$/.test(pat), `${tr.id}/${sec.n} drum lane ${lane} chars`);
    }
    for (const part of ['bass', 'arp', 'stab']) if (sec[part]) {
      assert.equal(sec[part].pat.length, 16, `${tr.id}/${sec.n} ${part} pattern is 16 steps`);
    }
    if (sec.bass) assert(/^[.Rr357-]+$/.test(sec.bass.pat), `${tr.id}/${sec.n} bass chars`);
    if (sec.arp) assert(/^[.0-7-]+$/.test(sec.arp.pat), `${tr.id}/${sec.n} arp chars`);
    if (sec.timpani) assert.equal(sec.timpani.length, 16);
    if (sec.lead) assert(tr.mel[sec.lead.mel]?.length, `${tr.id}/${sec.n} melody ${sec.lead.mel} exists`);
  }
}
// 場面 → 曲
for (const id of ['boot', 'lounge', 'cup', 'select', 'runtime', 'overflow', 'lastcompile']) assert(ids.has(id), 'scene track ' + id);
const st = M.state();
assert.equal(st.choice, 'auto');
console.log('Music data: 7 tracks, every melody bar fills 16 steps, chords/patterns valid, scene tracks present');
