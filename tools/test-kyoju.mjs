import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import * as THREE from 'three';
import { FrameBudget, SimulationClock } from '../kyoju/src/3d/performance.js';
import { Terrain } from '../kyoju/src/3d/terrain.js';
import { Flora } from '../kyoju/src/3d/flora.js';
import { ContactShadow } from '../kyoju/src/3d/contact.js';
import { Beast3D } from '../kyoju/src/3d/beast3d.js';
import { BeastAnimator } from '../kyoju/src/3d/beastanim.js';
import { KingdomBuildings } from '../kyoju/src/3d/buildings.js';
import { generateKingdom } from '../kyoju/src/3d/towns.js';
import { Humans, Horses, Machines } from '../kyoju/src/3d/people.js';
import { FX } from '../kyoju/src/3d/fx.js';
import { Sim } from '../kyoju/src/3d/sim.js';
import { groundH, heightAt, landAt, SETTLE_BY_ID } from '../kyoju/src/3d/world.js';
import { mulberry32 } from '../kyoju/src/3d/noise.js';

const rng = mulberry32(20261102);
Math.random = rng;
let passed = 0;
async function check(name, test) { await test(); passed++; console.log(`PASS ${name}`); }
const engine = () => ({
  qname: 'low', q: { people: 350, trees: 900, particles: 650, terrainBudget: 2, terrainLevel: 11, treeRadius: 650, treeNear: 80 },
  scene: Object.assign(new THREE.Scene(), { fog: new THREE.FogExp2(0xbfc8d0, 0.000085) }),
  camera: new THREE.PerspectiveCamera(48, 1.6, 2, 240000),
  sun: new THREE.DirectionalLight(0xffead5, 2.8), hemi: new THREE.HemisphereLight(0xb8c7d9, 0x3d3324, 0.9), night: 0,
  uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.5).normalize() }, uFlora: { value: new THREE.Vector3(0, 0, 1e7) } },
});
const legacy = vm.createContext({ console, Math, Date, setTimeout, clearTimeout });
for (const name of ['00-util.js', '10-data.js', '20-model.js']) {
  vm.runInContext(readFileSync(fileURLToPath(new URL(`../kyoju/src/legacy/${name}`, import.meta.url)), 'utf8'), legacy);
}
const species = vm.runInContext('Object.keys(SPECIES)', legacy);
const fixture = (id) => vm.runInContext(`(() => {
  const b = speciesBeast(${JSON.stringify(id)}), stats = beastStats(b), parts = {};
  for (const sl of SLOTS) { const sp = SPECIES[b.parts[sl].sp]; parts[sl] = { sp:b.parts[sl].sp, arch:sp.parts[sl], pal:sp.pal }; }
  return { stats, desc:{parts,seed:0.43,sizeF:stats.sizeF,elem:stats.elem} };
})()`, legacy);
function dispose(scene) {
  const g = new Set(), m = new Set(), sk = new Set();
  scene.traverse(o => { if (o.geometry) g.add(o.geometry); if (o.skeleton) sk.add(o.skeleton); for (const mat of [o.material].flat()) if (mat) m.add(mat); });
  g.forEach(o => o.dispose()); m.forEach(o => o.dispose()); sk.forEach(o => o.dispose());
}

await check('adaptive resolution resists spikes, reduces sustained load and recovers slowly', () => {
  const b = new FrameBudget(1.5);
  for (let i = 0; i < 240; i++) b.sample(1 / 60);
  b.sample(0.2); assert.equal(b.ratio, 1.5);
  for (let i = 0; i < 1000; i++) b.sample(1 / 24);
  assert.equal(b.ratio, b.minRatio);
  const low = b.ratio; for (let i = 0; i < 120; i++) b.sample(1 / 60);
  assert.equal(b.ratio, low);
  for (let i = 0; i < 7200; i++) b.sample(1 / 60);
  assert.equal(b.ratio, b.maxRatio);
  assert.equal(b.sample(2), false); b.reset(); assert.equal(b.elapsed, 0);
});
await check('physics time agrees at 30/60 Hz and catch-up is bounded', () => {
  const run = hz => { const c = new SimulationClock(1 / 60, 6); let t = 0; for (let i=0;i<hz*10;i++) c.advance(1/hz, d=>t+=d); return t; };
  assert.ok(Math.abs(run(30) - run(60)) < 1e-8);
  const c = new SimulationClock(1 / 60, 6); let n = 0;
  c.advance(30, () => n++); assert.equal(n, 6); c.reset();
  assert.equal(c.advance(0, () => assert.fail('paused physics advanced')), 0);
});
await check('existing saves retain monsters, currency and quality choice', () => {
  assert.equal(vm.runInContext('newState().settings.quality', legacy), 'auto');
  assert.equal(vm.runInContext("(() => {const s=newState();s.settings.quality='high';s.kokurui=1234;return sanitizeState(s).kokurui})()",legacy),1234);
  assert.equal(vm.runInContext("(() => {const s=newState();s.settings.quality='high';return sanitizeState(s).settings.quality})()",legacy),'high');
});
await check('terrain always covers the root once, converges and stays stable when stationary', () => {
  const e = engine(), t = new Terrain(e);
  const s = SETTLE_BY_ID.garmund, cam = new THREE.Vector3(s.x + 250, heightAt(s.x + 250, s.z) + 120, s.z);
  let pending = 1, iterations = 0;
  while (pending && iterations++ < 1500) {
    pending = t.update(cam, 2, false);
    const nodes = [...t.visible];
    assert.equal(nodes.reduce((v,n)=>v+n.S*n.S,0), 196608 ** 2);
    const keys = new Set(nodes.map(n => t.key(n.l,n.i,n.j)));
    for (const n of nodes) { let l=n.l,i=n.i,j=n.j; while(l>0) { l--;i=Math.floor(i/2);j=Math.floor(j/2);assert.ok(!keys.has(t.key(l,i,j)), 'overlapping parent/child'); } }
  }
  assert.ok(!pending, 'terrain did not converge');
  const before = [...t.visible].map(n => t.key(n.l,n.i,n.j)).sort().join(','), count = t.cache.size;
  for (let i=0;i<120;i++) assert.equal(t.update(cam),0);
  assert.equal(t.cache.size,count);
  assert.equal([...t.visible].map(n=>t.key(n.l,n.i,n.j)).sort().join(','),before);
  console.log(`  terrain: ${t.cache.size} cached tiles, ${t.visible.size} visible, ${iterations} bounded build frames`);
  dispose(e.scene);
});
await check('forest generation is atomic, capped and uses simpler distant trees', () => {
  const e = engine(), f = new Flora(e, e.q.trees);
  assert.ok(f.kinds[2].attributes.position.count < f.kinds[0].attributes.position.count / 3);
  let spot;
  for (let z=-10000;z<10000&&!spot;z+=200) for(let x=-20000;x<20000;x+=200) if(landAt(x,z,heightAt(x,z))[0]>0.8){spot={x,z};break;}
  assert.ok(spot);
  let n=0; do { f.update(spot.x,spot.z); } while(f.pending && n++<2000);
  assert.ok(!f.pending); const total=f.meshes.reduce((n,m)=>n+m.count,0); assert.ok(total>0&&total<=e.q.trees);
  const triangles=f.meshes.reduce((n,m)=>n+m.count*m.geometry.attributes.position.count/3,0);
  const full=total*f.kinds[0].attributes.position.count/3;
  assert.ok(triangles < full * 0.4, `${triangles} vs ${full}`);
  const counts=f.meshes.map(m=>m.count); f.update(spot.x+100,spot.z); assert.ok(f.pending);
  assert.deepEqual(f.meshes.map(m=>m.count),counts,'forest disappeared during generation');
  console.log(`  forest: ${total} trees, ${Math.round(triangles)} triangles; full-detail reference ${Math.round(full)}`);
  dispose(e.scene);
});
await check('every species builds valid skinning and a finite walking animation', () => {
  for (const id of species) {
    const e = engine(), {desc}=fixture(id), b = new Beast3D(e,desc,{cell:0.62}); e.scene.add(b.root);
    const a = new BeastAnimator(b); a.place(16100,-1300,0.2);
    for(let i=0;i<180;i++) a.update(1/60);
    assert.ok(b.height>0 && b.height<500);
    for(const mesh of [b.mesh,...b.detailMeshes]) {
      for(const name of ['position','normal','skinWeight']) { const attr=mesh.geometry.attributes[name]; if(attr) for(const x of attr.array) assert.ok(Number.isFinite(x),`${id}: invalid ${name}`); }
      const w=mesh.geometry.attributes.skinWeight; for(let i=0;i<w.count;i++) assert.ok(Math.abs(w.getX(i)+w.getY(i)+w.getZ(i)+w.getW(i)-1)<1e-4,`${id}: weights`);
    }
    assert.ok(Number.isFinite(a.pos.x)&&Number.isFinite(a.pos.y));
    dispose(e.scene);
  }
  console.log(`  ${species.length} species, 180 walking steps each`);
});
await check('contact shadow follows sloping terrain', () => {
  const e=engine(), c=new ContactShadow(e,{height:53}), pos=new THREE.Vector3(19100,0,-2500);
  c.update(pos,0.4); const p=c.mesh.geometry.attributes.position;
  for(let i=0;i<p.count;i++) assert.ok(Math.abs(p.getY(i)-groundH(p.getX(i),p.getZ(i))-0.18)<0.01);
  dispose(e.scene);
});
await check('battle, destruction, projectiles and retreat advance together without NaN', () => {
  for (const id of ['varga','ganzo']) {
    const e=engine(), {desc,stats}=fixture(id), kingdom=generateKingdom(), kb=new KingdomBuildings(e,kingdom);
    const flora=new Flora(e,900), fx=new FX(e), humans=new Humans(e,800), horses=new Horses(e,160), machines=new Machines(e);
    const beast=new Beast3D(e,desc,{cell:0.62});e.scene.add(beast.root); const anim=new BeastAnimator(beast);
    const sim=new Sim({engine:e,kingdom,kb,flora,fx,humans,horses,machines,beast,anim,stats,opts:{startStop:2,startHour:15.5}});
    const s=SETTLE_BY_ID.garmund;anim.place(s.x+260,s.z+30,-Math.PI/2);e.camera.position.set(s.x+350,groundH(s.x,s.z)+100,s.z+100);
    for(let i=0;i<3600;i++) { sim.update(1/60); if(i%2===0){kb.update(1/30);fx.update(1/30);sim.draw();} if(sim.done&&sim.done.t<=0)break; }
    assert.ok(Number.isFinite(sim.B.hp));assert.ok(Number.isFinite(anim.pos.y));
    assert.ok(sim.score.bld+sim.score.soldiers+sim.score.dead>0,`${id}: no combat occurred`);
    for(const b of kingdom.towns.flatMap(t=>t.buildings)) assert.ok(Number.isFinite(b.hp)&&Number.isFinite(b.y));
    sim.done={reason:'retreat',t:0.6}; for(let i=0;i<40;i++)sim.update(1/60);assert.ok(sim.done.t<=0);
    console.log(`  ${id}: ${sim.score.bld} buildings, ${sim.score.soldiers} soldiers, ${Math.ceil(sim.B.hp)} HP`);
    dispose(e.scene);
  }
});
console.log(`${passed} regression groups passed. GPU rendering/FPS are not measured by this test.`);
