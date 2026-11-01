import * as THREE from 'three';
import { llToWorld, worldToLL } from './geo.js';
import { Sched } from './sched.js';
import { Dem } from './dem.js';
import { Ground } from './ground.js';
import { Buildings } from './buildings.js';
import { Sky, TIMES } from './sky.js';
import { Landmarks, TOWER_LL } from './landmarks.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Spots, SPOTS } from './spots.js';
import { Minimap } from './minimap.js';
import { BigMap } from './bigmap.js';
import { Sound } from './audio.js';
import { shared } from './shaders.js';
import { Clouds } from './clouds.js';

/* global __WORKER_CODE__ */
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const isTouch = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints || 0) > 0;
if (isTouch) document.body.classList.add('touch');
const SAVE_KEY = 'tokyoSora.v1';
let save = {};
try { save = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') || {}; } catch (e) { save = {}; }

const QUALITY = {
  low: { dpr: 1, split: 1.0, full: 750, tall: 2000, tallMax: 3000, maxTiles: 220, sched: 8 },
  mid: { dpr: 1.5, split: 1.35, full: isTouch ? 1050 : 1500, tall: isTouch ? 2600 : 3400, tallMax: isTouch ? 3800 : 5500, maxTiles: isTouch ? 250 : 380, sched: isTouch ? 10 : 12 },
  high: { dpr: 2, split: 1.8, full: isTouch ? 1600 : 2100, tall: 4300, tallMax: 7000, maxTiles: isTouch ? 400 : 520, sched: 14 },
};
let qName = QUALITY[save.quality] ? save.quality : 'mid';

function fatal(msg) { const e = $('err'); e.style.display = 'flex'; e.textContent = msg; }

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
} catch (e) {
  fatal('このブラウザでは3D表示（WebGL2）が使えないため遊べません。最新のSafari・Chromeでお試しください。');
  throw e;
}
renderer.setClearColor('#b9d3ea');
$('gl').addEventListener('webglcontextlost', (e) => { e.preventDefault(); fatal('3D表示が止まりました。ページを再読み込みしてください。'); });

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xb9d3ea, 1 / 9000);
const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 2.5e6);
scene.add(camera);

const sched = new Sched(QUALITY[qName].sched);
const dem = new Dem(sched);
const ground = new Ground(scene, dem, sched, renderer);
const buildings = new Buildings(scene, dem, __WORKER_CODE__);
const sky = new Sky(scene);
const landmarks = new Landmarks(scene, dem);
const clouds = new Clouds(scene);
buildings.exclusions = landmarks.exclusions();
const U = (lat, lon, s, w) => { const p = llToWorld(lat, lon); return [p[0], p[1], s, w]; };
buildings.init([
  U(35.6812, 139.7671, 6500, 1), U(35.6896, 139.7006, 2600, 1), U(35.6580, 139.7016, 2000, 0.9), U(35.7295, 139.7109, 1800, 0.85),
  U(35.6285, 139.7387, 1800, 0.8), U(35.7138, 139.7773, 1500, 0.6), U(35.6974, 139.4135, 1500, 0.5), U(35.6556, 139.3389, 1500, 0.5),
  U(35.4580, 139.6320, 2500, 0.8), U(35.5313, 139.6969, 1300, 0.55), U(35.6300, 139.7800, 1800, 0.6),
]);
const player = new Player(scene, dem, buildings);
player.hero.visible = false;
const spots = new Spots(scene, dem, $('labels'), save.stamps);
const minimap = new Minimap($('minimap'));
const sound = new Sound();
sound.muted = !!save.muted;
const bigmap = new BigMap($('leaf'), warpTo);
const input = new Input($('touch'), { onAction, joyEl: $('joy'), knobEl: $('knob') });
input.bindHold($('bUp'), 'up'); input.bindHold($('bDown'), 'down'); input.bindHold($('bBoost'), 'boost');

let state = 'title';
let dprScale = 1;

function applyQuality() {
  const q = QUALITY[qName];
  ground.splitK = q.split; ground.maxTiles = q.maxTiles;
  buildings.setQuality(q.full, q.tall, q.tallMax);
  sched.max = q.sched;
  resize();
}
function resize() {
  const q = QUALITY[qName];
  renderer.setPixelRatio(Math.max(0.6, Math.min(window.devicePixelRatio || 1, q.dpr) * dprScale));
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / Math.max(1, innerHeight);
  camera.fov = camera.aspect < 1 ? 72 : 58;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
applyQuality();
sky.set(TIMES.includes(save.time) ? save.time : 'day', true);
if (save.ground === 'std') ground.setSource('std');
player.view = save.view === 'first' ? 'first' : 'third';

// ---------------- title / attract camera ----------------
const [ax, az] = llToWorld(35.6705, 139.7575);
function attract(t) {
  const a = t * 0.03 + 2.2, R = 1700;
  camera.position.set(ax + Math.sin(a) * R, 460 + Math.sin(t * 0.17) * 40, az + Math.cos(a) * R);
  camera.lookAt(ax, 90, az);
}
if (save.x !== undefined) $('bCont').hidden = false;

function newGame() {
  const [sx, sz] = llToWorld(35.6752, 139.7716);
  player.teleport(sx, sz, 290, 'fly');
  const [tx, tz] = llToWorld(TOWER_LL[0], TOWER_LL[1]);
  player.camYaw = Math.atan2(tx - sx, -(tz - sz)); player.camPitch = -0.18;
  player.heading = player.camYaw;
}
function startGame(cont) {
  sound.start();
  if (cont && save.x !== undefined) {
    player.teleport(save.x, save.z, save.mode === 'walk' ? undefined : save.y, save.mode === 'walk' ? 'walk' : 'fly');
    player.camYaw = save.yaw || 0; player.camPitch = clamp(save.pitch || -0.2, -1.4, 1.4); player.heading = player.camYaw;
  } else newGame();
  state = 'play';
  document.body.classList.add('play');
  input.enabled = true;
  player.hero.visible = player.view !== 'first';
  syncModeUI();
  setTimeout(() => toast(isTouch ? '左をなぞって移動・右をなぞって視点' : 'WASDで移動・ドラッグで視点', '光の柱が名所のスタンプです', true), 600);
}
$('bStart').onclick = () => startGame(false);
$('bCont').onclick = () => startGame(true);

// ---------------- UI ----------------
let toastTimer = 0;
function toast(main, sub, info) {
  const el = $('toast');
  el.className = info ? 'info' : '';
  el.textContent = main;
  if (sub) { const s = document.createElement('small'); s.textContent = sub; el.appendChild(s); }
  void el.offsetWidth; el.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 2900);
}
function syncModeUI() {
  const fly = player.mode === 'fly';
  document.body.classList.toggle('walk', !fly);
  $('bFly').textContent = fly ? '歩く' : '飛ぶ';
  $('bUp').innerHTML = fly ? '▲<small>上昇</small>' : '▲<small>ジャンプ</small>';
}
function toggleFly() {
  player.setMode(player.mode === 'fly' ? 'walk' : 'fly');
  syncModeUI();
  toast(player.mode === 'fly' ? '飛行モード' : '歩きモード', player.mode === 'fly' ? '▲で上昇・▼で下降' : '地面に降ります', true);
}
function toggleView() {
  player.view = player.view === 'first' ? 'third' : 'first';
  toast(player.view === 'first' ? '一人称視点' : '三人称視点', null, true);
}
const panels = ['mapPanel', 'setPanel', 'helpPanel'];
const anyPanel = () => panels.some((p) => $(p).classList.contains('on'));
function openPanel(id) {
  for (const p of panels) $(p).classList.toggle('on', p === id);
  input.enabled = false; input.releaseJoy();
  if (id === 'setPanel') syncSettings();
}
function closePanels() {
  for (const p of panels) $(p).classList.remove('on');
  input.enabled = state === 'play';
}
for (const b of document.querySelectorAll('[data-close]')) b.onclick = closePanels;
for (const p of panels) $(p).addEventListener('pointerdown', (e) => { if (e.target === $(p)) closePanels(); });

function openMap() {
  const [lat, lon] = worldToLL(player.pos.x, player.pos.z);
  openPanel('mapPanel');
  bigmap.open(lat, lon, player.heading, spots.collected);
  const list = $('spotList'); list.replaceChildren();
  SPOTS.forEach((s, i) => {
    const b = document.createElement('button');
    const done = spots.collected.has(s.id);
    if (done) b.className = 'done';
    b.innerHTML = '<i></i><span><span class="n"></span><small></small></span>';
    b.querySelector('i').textContent = done ? '✓' : String(i + 1);
    b.querySelector('.n').textContent = s.name;
    b.querySelector('small').textContent = s.area + (s.hint ? '・' + s.hint : '');
    b.onclick = () => warpTo(s.lat, s.lon, 'fly', s.name, true);
    list.appendChild(b);
  });
}
function warpTo(lat, lon, mode, name, spot) {
  // warping to a stamp spot drops you a short way south of it, facing it, so you still get to go and touch it
  const [x, z] = llToWorld(lat, lon);
  closePanels();
  if (mode === 'walk') {
    player.teleport(x, z + (spot ? 380 : 0), undefined, 'walk');
    player.camPitch = -0.08;
  } else {
    const g = dem.heightAt(x, z);
    player.teleport(x, z + (spot ? 650 : 0), g + (spot ? 230 : 260), 'fly');
    player.camPitch = spot ? -0.22 : -0.45;
  }
  player.camYaw = 0; player.heading = 0;
  syncModeUI();
  sound.whoosh(true);
  toast((name || 'この場所') + (spot ? 'の近くへワープ' : 'へワープ'), spot ? '前に見える光の柱をめざそう' : null, true);
}
function goHome() { closePanels(); newGame(); syncModeUI(); toast('東京駅の上空に戻りました', null, true); }
function setTime(name) { sky.set(name); toast({ morning: '朝', day: '昼', evening: '夕方', night: '夜' }[name] + 'になりました', null, true); persist(); }

function onAction(a) {
  if (a === 'escape') { if (anyPanel()) closePanels(); return; }
  if (state !== 'play') return;
  if (a === 'map') { if ($('mapPanel').classList.contains('on')) closePanels(); else openMap(); return; }
  if (anyPanel()) return;
  if (a === 'fly') toggleFly();
  else if (a === 'view') toggleView();
  else if (a === 'time') setTime(sky.next());
  else if (a === 'help') openPanel('helpPanel');
  else if (a === 'reset') goHome();
}
$('bFly').addEventListener('click', () => onAction('fly'));
$('bMap').onclick = () => onAction('map');
$('minimap').onclick = () => onAction('map');
$('stamps').onclick = () => onAction('map');
$('bTime').onclick = () => onAction('time');
$('bView').onclick = () => onAction('view');
$('bSet').onclick = () => openPanel('setPanel');
$('bHelp').onclick = () => openPanel('helpPanel');
$('bHelp2').onclick = () => openPanel('helpPanel');
$('bHome').onclick = goHome;
$('bResetStamps').onclick = () => { if (confirm('集めたスタンプを全部消しますか？')) { spots.reset(); persist(); toast('スタンプを消しました', null, true); } };

for (const b of document.querySelectorAll('#hud button')) b.addEventListener('click', () => b.blur());
addEventListener('keyup', (e) => { if (e.code === 'Space' && input.enabled) e.preventDefault(); });
addEventListener('resize', () => { if ($('mapPanel').classList.contains('on') && bigmap.map) bigmap.map.invalidateSize(); });

function seg(id, cur, fn) {
  const el = $(id);
  for (const b of el.querySelectorAll('button')) { b.classList.toggle('on', b.dataset.v === cur); b.onclick = () => { fn(b.dataset.v); syncSettings(); persist(); }; }
}
function syncSettings() {
  seg('segQ', qName, (v) => { qName = v; dprScale = 1; applyQuality(); });
  seg('segG', ground.srcName, (v) => { if (v !== ground.srcName) ground.setSource(v); });
  seg('segT', sky.name, (v) => sky.set(v));
  seg('segS', sound.muted ? 'off' : 'on', (v) => sound.setMuted(v === 'off'));
}

function persist() {
  try {
    const o = { stamps: [...spots.collected], quality: qName, ground: ground.srcName, time: sky.name, muted: sound.muted, view: player.view };
    if (state === 'play') Object.assign(o, { x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.camYaw, pitch: player.camPitch, mode: player.mode });
    else if (save.x !== undefined) Object.assign(o, { x: save.x, y: save.y, z: save.z, yaw: save.yaw, pitch: save.pitch, mode: save.mode });
    localStorage.setItem(SAVE_KEY, JSON.stringify(o));
  } catch (e) { /* storage full or blocked */ }
}
addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { persist(); if (sound.ctx) sound.ctx.suspend(); }
  else if (sound.ctx && state === 'play') sound.ctx.resume();
});

function onCollect(s) {
  sound.chime();
  const n = spots.count, total = SPOTS.length;
  if (n === total) toast('全部のスタンプを集めました！', '東京まるごと制覇 おめでとう！');
  else toast('スタンプゲット！ ' + s.name, `${n} / ${total}`);
  persist();
}

function placeName() {
  const P = buildings.getPlaces();
  const px = player.pos.x, pz = player.pos.z;
  let loc = null, ld = 1e9, nb = null, nd = 1e9, mu = null, md = 1e9;
  for (const p of P) {
    const d = Math.hypot(p.x - px, p.z - pz);
    if ((p.cls === 'suburb' || p.cls === 'quarter') && d < ld) { ld = d; loc = p; }
    else if (p.cls === 'neighbourhood' && d < nd) { nd = d; nb = p; }
    else if ((p.cls === 'city' || p.cls === 'town' || p.cls === 'village' || p.cls === 'borough') && d < md) { md = d; mu = p; }
  }
  let local = loc && ld < 1600 ? loc.name : nb && nd < 600 ? nb.name : '';
  let muni = mu && md < 9000 ? mu.name : '';
  if (muni && local.indexOf(muni) >= 0) muni = '';
  const txt = (muni + ' ' + local).trim();
  if (txt) return txt;
  const [lat, lon] = worldToLL(px, pz);
  return `北緯${lat.toFixed(3)}° 東経${lon.toFixed(3)}°`;
}
const fmtAlt = (a) => (a < 1000 ? Math.round(a) + 'm' : (a / 1000).toFixed(a < 10000 ? 2 : 1) + 'km');

// ---------------- main loop ----------------
let last = performance.now(), hudT = 0, placeT = 0, mmT = 0, saveT = 0, bT = 0;
let perfAcc = 0, perfN = 0, perfT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000));
  last = now;
  const t = now / 1000;
  shared.uTime.value = t;
  dem.update(now);
  const inp = input.read();
  if (state === 'play') {
    player.camYaw += inp.lookX;
    player.camPitch = clamp(player.camPitch - inp.lookY, -1.45, 1.42);
    if (inp.zoom) player.camDist = clamp(player.camDist * (1 + inp.zoom * 0.09), 2.5, 70);
    player.update(dt, inp, t);
    player.updateCamera(camera, dt);
    for (const ev of player.events) {
      if (ev === 'jump') sound.jump();
      else if (ev === 'takeoff') { sound.whoosh(true); syncModeUI(); }
      else if (ev === 'walk') syncModeUI();
      else if (ev === 'land') sound.thud();
    }
    player.events.length = 0;
  } else attract(t);
  camera.updateMatrixWorld();
  const camGround = dem.heightAt(camera.position.x, camera.position.z);
  const camAlt = camera.position.y - camGround;
  sky.update(dt, camera, camAlt);
  renderer.setClearColor(shared.uFogColor.value);
  scene.fog.color.copy(shared.uFogColor.value); scene.fog.density = shared.uFogDensity.value;
  clouds.update(dt, camera.position, sky.night);
  ground.update(camera, now);
  if (now - bT > 180) { bT = now; buildings.update(camera.position, camAlt, now); }
  sched.pump();
  buildings.flush();
  landmarks.update(t, sky.night);
  spots.update(player, camera, innerWidth, innerHeight, onCollect, state === 'play');

  if (state === 'play') {
    if (now - hudT > 110) {
      hudT = now;
      $('alt').textContent = '高度 ' + fmtAlt(Math.max(0, player.alt));
      $('spd').textContent = Math.round(player.speed * 3.6) + 'km/h';
      $('stamps').textContent = `★ ${spots.count}/${SPOTS.length}`;
      const busy = ground.loading + buildings.loading;
      const ld = $('loading');
      if (busy > 2) { ld.textContent = '地図を読み込み中…'; ld.classList.add('on'); } else ld.classList.remove('on');
      sound.wind(player.speed, player.mode === 'fly');
      $('speed').style.opacity = player.mode === 'fly' ? clamp((player.speed - 90) / 350, 0, 0.55).toFixed(2) : 0;
    }
    if (now - placeT > 700) { placeT = now; const p = placeName(); if ($('place').textContent !== p) $('place').textContent = p; }
    if (now - mmT > 90) { mmT = now; minimap.draw(player.pos.x, player.pos.z, player.heading, player.camYaw, Math.max(0, player.alt), spots.items, spots.collected); }
    if (now - saveT > 4000) { saveT = now; persist(); }
    // adaptive resolution
    perfAcc += dt; perfN++;
    if (now - perfT > 2500) {
      const avg = perfAcc / perfN; perfAcc = 0; perfN = 0; perfT = now;
      if (avg > 1 / 26 && dprScale > 0.6) { dprScale = Math.max(0.6, dprScale - 0.15); resize(); }
      else if (avg < 1 / 50 && dprScale < 1) { dprScale = Math.min(1, dprScale + 0.1); resize(); }
    }
  } else if (now - hudT > 300) {
    hudT = now;
    const n = ground.loading;
    $('tload').textContent = n > 2 ? `地図を読み込み中…（${n}）` : '';
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// for debugging / automated checks
window.__tokyo = { THREE, scene, camera, renderer, player, ground, buildings, dem, sky, spots, sched, input, startGame, warpTo, onAction };
