import * as THREE from 'three';
import { llToWorld, worldToLL, tileSize } from './geo.js';
import { Sched } from './sched.js';
import { Dem } from './dem.js';
import { Ground } from './ground.js';
import { City } from './city.js';
import { Sky, TIMES, presetForSun } from './sky.js';
import { Landmarks, TOWER_LL } from './landmarks.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Spots, SPOTS } from './spots.js';
import { Minimap } from './minimap.js';
import { BigMap } from './bigmap.js';
import { Sound } from './audio.js';
import { shared, beamMaterial } from './shaders.js';
import { Clouds } from './clouds.js';
import { Traffic } from './traffic.js';
import { Peds } from './peds.js';
import { FX } from './fx.js';
import { Vehicle, VEHICLE_NAMES } from './vehicles.js';
import { sunPosition, Weather, MANUAL_WEATHER, Precip } from './realtime.js';
import { RealPlaces } from './places.js';
import { geocode } from './search.js';

/* global __WORKER_CODE__ */
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const isTouch = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints || 0) > 0;
if (isTouch) document.body.classList.add('touch');
const SAVE_KEY = 'tokyoSora.v1';
let save = {};
try { save = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') || {}; } catch (e) { save = {}; }

const QUALITY = {
  low: { dpr: 1, split: 1.0, full: 700, tall: 1800, tallMax: 2800, maxTiles: 220, sched: 8, roofZoom: 15, trees: 500, cars: 22, peds: 30 },
  mid: { dpr: 1.5, split: 1.35, full: isTouch ? 1000 : 1400, tall: isTouch ? 2400 : 3200, tallMax: isTouch ? 3600 : 5000, maxTiles: isTouch ? 250 : 380, sched: isTouch ? 10 : 12, roofZoom: isTouch ? 15 : 16, trees: isTouch ? 900 : 1800, cars: isTouch ? 34 : 55, peds: isTouch ? 45 : 80 },
  high: { dpr: 2, split: 1.8, full: isTouch ? 1500 : 2000, tall: 4300, tallMax: 7000, maxTiles: isTouch ? 400 : 520, sched: 14, roofZoom: 16, trees: 2800, cars: 80, peds: 120 },
};
const DENSITY = { low: 0.5, mid: 1, high: 1.6 };
let qName = QUALITY[save.quality] ? save.quality : 'mid';
let density = DENSITY[save.density] ? save.density : 'mid';
let timeMode = TIMES.includes(save.time) ? save.time : 'real';
let weatherMode = ['real', 'clear', 'cloudy', 'rain', 'snow'].includes(save.weather) ? save.weather : 'real';

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
shared.uTileS.value = tileSize(14);

const sched = new Sched(QUALITY[qName].sched);
const dem = new Dem(sched);
const ground = new Ground(scene, dem, sched, renderer);
const city = new City(scene, dem, sched, __WORKER_CODE__);
const sky = new Sky(scene);
const landmarks = new Landmarks(scene, dem);
const clouds = new Clouds(scene);
const precip = new Precip(scene);
city.exclusions = landmarks.exclusions();
const U = (lat, lon, s, w) => { const p = llToWorld(lat, lon); return [p[0], p[1], s, w]; };
city.init([
  U(35.6812, 139.7671, 6500, 1), U(35.6896, 139.7006, 2600, 1), U(35.6580, 139.7016, 2000, 0.9), U(35.7295, 139.7109, 1800, 0.85),
  U(35.6285, 139.7387, 1800, 0.8), U(35.7138, 139.7773, 1500, 0.6), U(35.6974, 139.4135, 1500, 0.5), U(35.6556, 139.3389, 1500, 0.5),
  U(35.4580, 139.6320, 2500, 0.8), U(35.5313, 139.6969, 1300, 0.55), U(35.6300, 139.7800, 1800, 0.6),
]);
const player = new Player(scene, dem, city);
player.hero.visible = false;
const spots = new Spots(scene, dem, $('labels'), save.stamps);
const minimap = new Minimap($('minimap'));
const sound = new Sound();
sound.muted = !!save.muted;
const traffic = new Traffic(scene, city, dem);
const peds = new Peds(scene, city, dem);
const realPlaces = new RealPlaces(scene, city, dem, $('labels'), $('nearby'), setDest);
realPlaces.setEnabled(save.realPlaces !== false);
const fx = new FX(scene, city, dem, sound);
fx.traffic = traffic; fx.peds = peds;
fx.onBoom = (x, y, z, power, r) => { const d = camera.position.distanceTo(new THREE.Vector3(x, y, z)); fx.shake = Math.max(fx.shake, Math.min(1, (power / 300) * Math.max(0, 1 - d / (r * 18)))); };
city.onCollapse = (x, y, z, w, h, d) => { fx.collapseDust(x, y, z, w, h, d); peds.panic(x, z, 120); destroyedCount++; };
const weather = new Weather();
const bigmap = new BigMap($('leaf'), warpTo);
const input = new Input($('touch'), { onAction, joyEl: $('joy'), knobEl: $('knob') });
let destroyedCount = 0;

let state = 'title';
let dprScale = 1;
let vehicle = null; const parked = []; const unmanned = [];
let look = { yaw: 0, pitch: 0, yawOff: 0, pitchOff: 0 };
let specialQ = false;
let bazookaCool = 0;
let dest = null;

function applyQuality() {
  const q = QUALITY[qName];
  ground.splitK = q.split; ground.maxTiles = q.maxTiles;
  city.setQuality(q);
  sched.max = q.sched;
  traffic.setDensity(Math.round(q.cars * DENSITY[density]));
  peds.setDensity(Math.round(q.peds * DENSITY[density]));
  resize();
}
function resize() {
  const q = QUALITY[qName];
  renderer.setPixelRatio(Math.max(0.6, Math.min(window.devicePixelRatio || 1, q.dpr) * dprScale));
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / Math.max(1, innerHeight);
  camera.fov = camera.aspect < 1 ? 72 : 58;
  camera.updateProjectionMatrix();
  fx.setScale(renderer.getPixelRatio() * innerHeight / (2 * Math.tan(camera.fov * Math.PI / 360)));
}
addEventListener('resize', () => { resize(); if ($('mapPanel').classList.contains('on') && bigmap.map) bigmap.map.invalidateSize(); });
applyQuality();
if (save.ground === 'std') ground.setSource('std');
if (save.roofs === false) city.setPhotoRoofs(false);
player.view = save.view === 'first' ? 'first' : 'third';

// ---------------- real-time sky ----------------
let rtInfo = null;
function refreshTime(instant) {
  if (timeMode === 'real') {
    const [lat, lon] = worldToLL(player.pos.x, player.pos.z);
    const s = sunPosition(new Date(), lat, lon);
    sky.set('real', instant, presetForSun(s.el, s.az));
  } else sky.set(timeMode, instant);
}
async function refreshWeather() {
  if (weatherMode === 'real') {
    const [lat, lon] = worldToLL(player.pos.x, player.pos.z);
    const w = await weather.refresh(lat, lon);
    if (w) { sky.setWeather(w); rtInfo = w; } else sky.setWeather(MANUAL_WEATHER.clear);
  } else { sky.setWeather(MANUAL_WEATHER[weatherMode]); rtInfo = MANUAL_WEATHER[weatherMode]; }
  updateRtPill();
}
function updateRtPill() {
  const now = new Date();
  const hm = now.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
  const parts = [];
  parts.push(timeMode === 'real' ? hm : { morning: '朝', day: '昼', evening: '夕方', night: '夜' }[timeMode]);
  if (rtInfo) { parts.push(rtInfo.text); if (rtInfo.temp !== undefined && weatherMode === 'real') parts.push(Math.round(rtInfo.temp) + '℃'); }
  $('rt').textContent = parts.join(' ');
}
refreshTime(true);
refreshWeather();
setInterval(() => { refreshTime(false); updateRtPill(); }, 60000);
setInterval(() => { if (weatherMode === 'real') refreshWeather(); }, 10 * 60000);

// ---------------- title / attract camera ----------------
const [ax, az] = llToWorld(35.6705, 139.7575);
function attract(t) {
  const a = t * 0.03 + 2.2, R = 1700;
  camera.position.set(ax + Math.sin(a) * R, 460 + Math.sin(t * 0.17) * 40, az + Math.cos(a) * R);
  camera.lookAt(ax, 90, az);
}
if (save.x !== undefined) $('bCont').hidden = false;

function newGame() {
  const [sx, sz] = llToWorld(35.6808, 139.7656);
  player.teleport(sx, sz, undefined, 'walk');
  snapWarp = {x:sx,z:sz,t:performance.now()};
  const [tx, tz] = llToWorld(TOWER_LL[0], TOWER_LL[1]);
  player.camYaw = Math.atan2(tx - sx, -(tz - sz)); player.camPitch = -0.08;
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
  setButtons();
  refreshTime(true); refreshWeather();
  setTimeout(() => toast(isTouch ? '左をなぞって移動・右をなぞって視点' : 'WASDで移動・ドラッグで視点', '近くの施設をタップすると目的地に設定。Fで空からも見られます', true), 600);
}
$('bStart').onclick = () => startGame(false);
$('bCont').onclick = () => startGame(true);

// ---------------- UI helpers ----------------
let toastTimer = 0;
function toast(main, sub, info) {
  const el = $('toast');
  el.className = info ? 'info' : '';
  el.textContent = main;
  if (sub) { const s = document.createElement('small'); s.textContent = sub; el.appendChild(s); }
  void el.offsetWidth; el.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 2900);
}
const BTN = {
  foot: { bA: ['▲', 'ジャンプ', { hold: 'up' }], bB: ['飛ぶ', '', { tap: 'fly' }], bC: ['▼', '下降', { hold: 'down' }], bD: ['≫', 'ダッシュ', { hold: 'boost' }], bE: ['◎', 'バズーカ', { tap: 'fire' }], bF: ['乗る', '', { tap: 'enter' }] },
  car: { bA: ['≫', 'ニトロ', { hold: 'boost' }], bB: ['降りる', '', { tap: 'enter' }], bC: ['■', 'ブレーキ', { hold: 'down' }], bD: ['♪', 'ホーン', { tap: 'horn' }] },
  tank: { bA: ['◎', '撃つ', { tap: 'fire' }], bB: ['降りる', '', { tap: 'enter' }], bD: ['≫', '加速', { hold: 'boost' }] },
  jet: { bA: ['◎', '機銃', { hold: 'fire' }], bB: ['脱出', '', { tap: 'enter' }], bC: ['▼', '減速', { hold: 'down' }], bD: ['▲', '加速', { hold: 'up' }], bE: ['◆', 'ミサイル', { tap: 'special' }], bF: ['≫', '全開', { hold: 'boost' }] },
};
const modeName = () => (vehicle ? vehicle.kind : 'foot');
function setButtons() {
  const cfg = BTN[modeName()];
  for (const id of ['bA', 'bB', 'bC', 'bD', 'bE', 'bF']) {
    const el = $(id), c = cfg[id];
    el.hidden = !c;
    if (!c) continue;
    let main = c[0], sub = c[1];
    if (!vehicle && id === 'bB') main = player.mode === 'fly' ? '歩く' : '飛ぶ';
    if (!vehicle && id === 'bA') sub = player.mode === 'fly' ? '上昇' : 'ジャンプ';
    el.innerHTML = '';
    el.append(main);
    if (sub) { const s = document.createElement('small'); s.textContent = sub; el.appendChild(s); }
  }
  if (!vehicle) $('bF').hidden = !nearInfo;
  document.body.classList.toggle('walk', !vehicle && player.mode === 'walk');
  document.body.dataset.mode = modeName();
  $('vhud').hidden = !vehicle;
  $('hint').textContent = isTouch ? '' : hintText();
}
for (const id of ['bA', 'bB', 'bC', 'bD', 'bE', 'bF']) input.bindButton($(id), () => (BTN[modeName()][id] || [])[2]);
function hintText() {
  const m = modeName();
  if (m === 'car') return 'W/S アクセル・ブレーキ　A/D ハンドル　Shift ニトロ　N ホーン　E 降りる';
  if (m === 'tank') return 'W/S 前後　A/D 旋回　ドラッグで砲塔　J/クリック 撃つ　E 降りる';
  if (m === 'jet') return 'W/S 機首上下　A/D 旋回　Space 加速　C 減速　Shift 全開　J 機銃　K ミサイル　E 脱出';
  return nearInfo ? 'E キーで乗る' : '';
}
function toggleFly() {
  if (vehicle) return;
  player.setMode(player.mode === 'fly' ? 'walk' : 'fly');
  setButtons();
  toast(player.mode === 'fly' ? '飛行モード' : '歩きモード', player.mode === 'fly' ? '▲で上昇・▼で下降' : '地面に降ります', true);
}
function toggleView() {
  player.view = player.view === 'first' ? 'third' : 'first';
  toast(player.view === 'first' ? '一人称視点' : '三人称視点', null, true);
}
const panels = ['mapPanel', 'setPanel', 'helpPanel', 'searchPanel', 'vehPanel'];
const anyPanel = () => panels.some((p) => $(p).classList.contains('on'));
function openPanel(id) {
  for (const p of panels) $(p).classList.toggle('on', p === id);
  input.enabled = false; input.releaseJoy();
  if (id === 'setPanel') syncSettings();
  if (id === 'searchPanel') setTimeout(() => $('q').focus(), 50);
}
function closePanels() {
  for (const p of panels) $(p).classList.remove('on');
  input.enabled = state === 'play';
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
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
function leaveVehicleForWarp() { if (vehicle) { const v = vehicle; vehicle = null; if (v.kind === 'jet') v.dispose(); else { parked.push(v); if (parked.length > 4) parked.shift().dispose(); } player.hero.visible = player.view !== 'first'; setButtons(); } }
function warpTo(lat, lon, mode, name, spot) {
  const [x, z] = llToWorld(lat, lon);
  closePanels();
  leaveVehicleForWarp();
  if (mode === 'walk') { player.teleport(x, z + (spot ? 380 : 0), undefined, 'walk'); player.camPitch = -0.08; }
  else { const g = dem.heightAt(x, z); player.teleport(x, z + (spot ? 650 : 0), g + (spot ? 230 : 260), 'fly'); player.camPitch = spot ? -0.22 : -0.45; }
  player.camYaw = 0; player.heading = 0;
  snapWarp = mode === 'walk' ? { x: player.pos.x, z: player.pos.z, t: performance.now() } : null;
  setButtons();
  sound.whoosh(true);
  toast((name || 'この場所') + (spot ? 'の近くへワープ' : 'へワープ'), spot ? '前に見える光の柱をめざそう' : null, true);
}
// after a ground warp, step onto the pavement of the nearest street once the street data is in
let snapWarp = null;
function trySnapWarp(now) {
  const s = snapWarp;
  if (now - s.t > 25000 || vehicle || player.mode !== 'walk' || Math.hypot(player.pos.x - s.x, player.pos.z - s.z) > 25) { snapWarp = null; return; }
  const t = city.tileAtWorld(s.x, s.z);
  if (!t || t.lod !== 2 || !t.graph) return;
  snapWarp = null;
  const g = t.graph, lx = s.x - t.cx, lz = s.z - t.cz;
  let best = null, bd = 250 * 250;
  for (let e = 0; e < g.eS.length; e++) {
    const cls = g.eCls[e];
    if (cls < 3 || cls > 8) continue;
    const st = g.eS[e], c = g.eC[e];
    if (Math.abs(g.pts[st * 3 + 1] - dem.heightAt(g.pts[st * 3] + t.cx, g.pts[st * 3 + 2] + t.cz)) > 3) continue; // elevated
    for (let i = 0; i < c - 1; i++) {
      const k = (st + i) * 3;
      const ax = g.pts[k], az = g.pts[k + 2], ex = g.pts[k + 3] - ax, ez = g.pts[k + 5] - az, l2 = ex * ex + ez * ez;
      if (l2 < 0.01) continue;
      const u = clamp(((lx - ax) * ex + (lz - az) * ez) / l2, 0, 1);
      const qx = ax + ex * u, qz = az + ez * u, d2 = (qx - lx) * (qx - lx) + (qz - lz) * (qz - lz);
      if (d2 < bd) { bd = d2; best = { qx, qz, ex, ez, hw: g.eHW[e], sw: g.eSW[e] }; }
    }
  }
  if (!best) return;
  const L = Math.hypot(best.ex, best.ez), nx = best.ez / L, nz = -best.ex / L;
  const side = (lx - best.qx) * nx + (lz - best.qz) * nz >= 0 ? 1 : -1;
  const off = best.hw + (best.sw > 0 ? best.sw * 0.5 : 0.8);
  player.teleport(t.cx + best.qx + nx * side * off, t.cz + best.qz + nz * side * off, undefined, 'walk');
  const yaw = Math.atan2(best.ex, -best.ez);
  player.camYaw = yaw; player.heading = yaw;
}
function goHome() { closePanels(); leaveVehicleForWarp(); newGame(); setButtons(); toast('東京駅の近くに戻りました', null, true); }
function setTime(name) { timeMode = name; refreshTime(false); updateRtPill(); persist(); }

// ---------------- destination ----------------
const destBeam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 20, 1, true).translate(0, 0.5, 0), beamMaterial('#b07bff'));
destBeam.frustumCulled = false; destBeam.visible = false; scene.add(destBeam);
function setDest(lat, lon, name) {
  const [x, z] = llToWorld(lat, lon);
  dest = { x, z, name };
  destBeam.visible = true;
  closePanels();
  toast('目的地：' + name, '紫の光の柱と矢印が目印です', true);
}

// ---------------- vehicles ----------------
let nearInfo = null;
function findNear() {
  if (vehicle) return null;
  for (const v of parked) if (Math.hypot(v.pos.x - player.pos.x, v.pos.z - player.pos.z) < 6.5 && Math.abs(v.pos.y - player.pos.y) < 4) return { parked: v };
  const c = traffic.nearest(player.pos.x, player.pos.z, 5.5);
  if (c && Math.abs(c.pos.y - player.pos.y) < 3 && !c.burnt) return { car: c };
  return null;
}
function enterVehicle() {
  if (vehicle) return exitVehicle();
  const n = findNear();
  if (!n) { toast('近くに乗れる乗り物がありません', '近くの車に寄るか、右上の車ボタンで呼べます', true); return; }
  if (n.parked) { vehicle = n.parked; parked.splice(parked.indexOf(vehicle), 1); }
  else {
    const c = n.car;
    traffic.remove(c);
    vehicle = new Vehicle('car', scene, { carKind: c.T.kind, color: c.color.clone() });
    vehicle.pos.copy(c.pos); vehicle.yaw = c.yaw; vehicle.speed = 0;
    peds.panic(c.pos.x, c.pos.z, 25);
  }
  onEnter();
}
function onEnter() {
  player.hero.visible = false; player.vel.set(0, 0, 0);
  look = { yaw: vehicle.yaw, pitch: -0.05, yawOff: 0, pitchOff: 0 };
  vehicle.camPos = null;
  setButtons();
  sound.click();
  toast(VEHICLE_NAMES[vehicle.kind] + 'に乗った', vehicle.kind === 'jet' ? 'スティック上で上昇・左右で旋回' : vehicle.kind === 'tank' ? '右側をなぞって狙い、撃つで発射' : 'スティックでアクセルとハンドル', true);
}
function exitVehicle() {
  const v = vehicle; vehicle = null;
  if (v.kind === 'jet') {
    player.teleport(v.pos.x, v.pos.z, v.pos.y + 4, 'fly');
    player.vel.copy(v.vel).multiplyScalar(0.15); player.vel.y = 10;
    unmanned.push(v);
    toast('脱出！', '戦闘機はそのまま飛んでいきます', true);
  } else {
    const off = v.r + 1.4;
    player.teleport(v.pos.x - Math.cos(v.yaw) * off, v.pos.z - Math.sin(v.yaw) * off, undefined, 'walk');
    v.speed = 0;
    parked.push(v); if (parked.length > 4) parked.shift().dispose();
  }
  player.camYaw = v.yaw; player.heading = v.yaw;
  player.hero.visible = player.view !== 'first';
  setButtons();
}
function spawnVehicle(kind) {
  closePanels();
  if (vehicle) exitVehicle();
  const v = new Vehicle(kind === 'sport' ? 'car' : kind, scene, { carKind: 'sport', color: '#d1342b' });
  const yaw = player.camYaw, fx0 = Math.sin(yaw), fz0 = -Math.cos(yaw);
  if (kind === 'jet') {
    const g = dem.heightAt(player.pos.x, player.pos.z);
    v.pos.set(player.pos.x, Math.max(player.pos.y, g) + (player.pos.y - g < 150 ? 260 : 0), player.pos.z);
    v.yaw = yaw; v.speed = 170; v.throttle = 0.5;
  } else {
    const d = kind === 'tank' ? 9 : 6;
    const p = { x: player.pos.x + fx0 * d, y: player.pos.y, z: player.pos.z + fz0 * d };
    city.pushOut(p, v.r + 1, 3, 0.5);
    v.pos.set(p.x, dem.heightAt(p.x, p.z), p.z); v.yaw = yaw;
  }
  v.place();
  vehicle = v;
  onEnter();
}
function destroyVehicle() {
  const v = vehicle; vehicle = null;
  fx.explosion(v.pos.x, v.pos.y + 1, v.pos.z, 260, 14);
  v.dispose();
  player.teleport(v.pos.x, v.pos.z, Math.max(v.pos.y, dem.heightAt(v.pos.x, v.pos.z)) + 14, 'fly');
  player.vel.set(0, 12, 0);
  player.hero.visible = player.view !== 'first';
  setButtons();
  toast('乗り物が大破した！', 'ヒーローは無事です', true);
}
function aimPoint() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const o = camera.position;
  const hit = city.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, 1500);
  return hit ? new THREE.Vector3(hit.x, hit.y, hit.z) : o.clone().addScaledVector(dir, 1500);
}
function fireBazooka() {
  if (bazookaCool > 0) return;
  bazookaCool = 0.85;
  const yaw = player.camYaw;
  player.heading = yaw;
  const right = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
  const fwd = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
  const o = player.pos.clone().add(new THREE.Vector3(0, 1.55, 0)).addScaledVector(right, 0.35).addScaledVector(fwd, 0.6);
  const target = aimPoint();
  fx.shoot('rocket', o, target.sub(o).normalize(), null);
}

// ---------------- actions ----------------
function onAction(a) {
  if (a === 'escape') { if (anyPanel()) closePanels(); return; }
  if (state !== 'play') return;
  if (a === 'map') { if ($('mapPanel').classList.contains('on')) closePanels(); else openMap(); return; }
  if (a === 'search') { if ($('searchPanel').classList.contains('on')) closePanels(); else openPanel('searchPanel'); return; }
  if (a === 'vehicles') { if ($('vehPanel').classList.contains('on')) closePanels(); else openPanel('vehPanel'); return; }
  if (anyPanel()) return;
  if (a === 'fly') toggleFly();
  else if (a === 'view') toggleView();
  else if (a === 'time') { const i = TIMES.indexOf(timeMode); setTime(TIMES[(i + 1) % TIMES.length]); toast('時間帯：' + { real: 'いま（リアルタイム）', morning: '朝', day: '昼', evening: '夕方', night: '夜' }[timeMode], null, true); }
  else if (a === 'help') openPanel('helpPanel');
  else if (a === 'reset') goHome();
  else if (a === 'enter') enterVehicle();
  else if (a === 'special') specialQ = true;
  else if (a === 'horn') { sound.horn(); peds.panic(player.pos.x, player.pos.z, 18); }
}
$('bMap').onclick = () => onAction('map');
$('minimap').onclick = () => onAction('map');
$('stamps').onclick = () => onAction('map');
$('bSearch').onclick = () => onAction('search');
$('bVeh').onclick = () => onAction('vehicles');
$('bView').onclick = () => onAction('view');
$('bSet').onclick = () => openPanel('setPanel');
$('bHelp').onclick = () => openPanel('helpPanel');
$('bHelp2').onclick = () => openPanel('helpPanel');
$('bHome').onclick = goHome;
$('bResetStamps').onclick = () => { if (confirm('集めたスタンプを全部消しますか？')) { spots.reset(); persist(); toast('スタンプを消しました', null, true); } };
$('bRestore').onclick = () => { city.restoreAll(); toast('壊した建物を元に戻しました', null, true); };
for (const b of document.querySelectorAll('#vehPanel [data-veh]')) b.onclick = () => spawnVehicle(b.dataset.veh);
for (const b of document.querySelectorAll('#hud button')) b.addEventListener('click', () => b.blur());
addEventListener('keyup', (e) => { if (e.code === 'Space' && input.enabled) e.preventDefault(); });

// search
async function doSearch() {
  const q = $('q').value;
  const list = $('qRes');
  list.replaceChildren();
  if (!q.trim()) return;
  const wait = document.createElement('p'); wait.className = 'note'; wait.textContent = '検索中…'; list.appendChild(wait);
  const res = await geocode(q);
  list.replaceChildren();
  if (!res.length) { const p = document.createElement('p'); p.className = 'note'; p.textContent = '見つかりませんでした。住所（例：東京都港区芝公園4-2-8）や地名、緯度経度（35.68,139.76）で試してください。'; list.appendChild(p); return; }
  for (const r of res) {
    const row = document.createElement('div'); row.className = 'qrow';
    const t = document.createElement('div'); t.className = 'qname'; t.textContent = r.name;
    const k = document.createElement('small'); k.textContent = r.kind; t.appendChild(k);
    const b1 = document.createElement('button'); b1.className = 'btn primary'; b1.textContent = '地上へ'; b1.onclick = () => warpTo(r.lat, r.lon, 'walk', r.name);
    const b2 = document.createElement('button'); b2.className = 'btn'; b2.textContent = '上空へ'; b2.onclick = () => warpTo(r.lat, r.lon, 'fly', r.name);
    const b3 = document.createElement('button'); b3.className = 'btn'; b3.textContent = '目的地に'; b3.onclick = () => setDest(r.lat, r.lon, r.name);
    const bs = document.createElement('div'); bs.className = 'qbtns'; bs.append(b1, b2, b3);
    row.append(t, bs); list.appendChild(row);
  }
}
$('qForm').onsubmit = (e) => { e.preventDefault(); doSearch(); };

// settings
function seg(id, cur, fn) {
  const el = $(id);
  for (const b of el.querySelectorAll('button')) { b.classList.toggle('on', b.dataset.v === cur); b.onclick = () => { fn(b.dataset.v); syncSettings(); persist(); }; }
}
function syncSettings() {
  seg('segQ', qName, (v) => { qName = v; dprScale = 1; applyQuality(); });
  seg('segG', ground.srcName, (v) => { if (v !== ground.srcName) { ground.setSource(v); city.setPhotoRoofs(v === 'photo' && roofsOn()); } });
  seg('segP', realPlaces.enabled ? 'on' : 'off', v => { realPlaces.setEnabled(v === 'on'); persist(); });
  seg('segT', timeMode, (v) => setTime(v));
  seg('segW', weatherMode, (v) => { weatherMode = v; refreshWeather(); });
  seg('segD', density, (v) => { density = v; applyQuality(); });
  seg('segR', roofsOn() ? 'on' : 'off', (v) => { save.roofs = v === 'on'; city.setPhotoRoofs(save.roofs && ground.srcName === 'photo'); });
  seg('segS', sound.muted ? 'off' : 'on', (v) => sound.setMuted(v === 'off'));
}
const roofsOn = () => save.roofs !== false;
function persist() {
  try {
    const o = { realPlaces: realPlaces.enabled, stamps: [...spots.collected], quality: qName, ground: ground.srcName, time: timeMode, weather: weatherMode, density, roofs: roofsOn(), muted: sound.muted, view: player.view };
    if (state === 'play') Object.assign(o, { x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.camYaw, pitch: player.camPitch, mode: vehicle ? 'fly' : player.mode });
    else if (save.x !== undefined) Object.assign(o, { x: save.x, y: save.y, z: save.z, yaw: save.yaw, pitch: save.pitch, mode: save.mode });
    localStorage.setItem(SAVE_KEY, JSON.stringify(o));
  } catch (e) { /* storage blocked */ }
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
  const P = city.getPlaces();
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
let last = performance.now(), hudT = 0, placeT = 0, mmT = 0, saveT = 0, bT = 0, nearT = 0;
let perfAcc = 0, perfN = 0, perfT = performance.now();
const camDir = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000));
  last = now;
  const t = now / 1000;
  shared.uTime.value = t;
  dem.update(now);
  const inp = input.read();
  bazookaCool -= dt;
  if (state === 'play') {
    if (!vehicle) {
      if (snapWarp) trySnapWarp(now);
      player.camYaw += inp.lookX;
      player.camPitch = clamp(player.camPitch - inp.lookY, -1.45, 1.42);
      if (inp.zoom) player.camDist = clamp(player.camDist * (1 + inp.zoom * 0.09), 2.5, 70);
      player.update(dt, inp, t);
      player.updateCamera(camera, dt);
      if (inp.fireTap) fireBazooka();
      for (const ev of player.events) {
        if (ev === 'jump') sound.jump();
        else if (ev === 'takeoff') { sound.whoosh(true); setButtons(); }
        else if (ev === 'walk') setButtons();
        else if (ev === 'land') sound.thud();
      }
      player.events.length = 0;
    } else {
      const v = vehicle;
      if (v.kind === 'tank') { look.yaw += inp.lookX; look.pitch = clamp(look.pitch - inp.lookY, -0.45, 0.6); }
      else {
        look.yawOff += inp.lookX; look.pitchOff = clamp(look.pitchOff - inp.lookY, -0.7, 0.7);
        if (!inp.looking) { const k = Math.min(1, dt * (v.kind === 'jet' ? 2.5 : 1.6)); look.yawOff *= 1 - k; look.pitchOff *= 1 - k; }
      }
      const W = { city, dem, traffic, fx, aimYaw: look.yaw, aimPitch: look.pitch, aimPoint: v.kind === 'tank' ? aimPoint() : null };
      const vin = { mx: inp.mx, my: inp.my, up: inp.up, down: inp.down, boost: inp.boost, fire: inp.fire, fireTap: inp.fireTap, special: specialQ };
      specialQ = false;
      const ev = v.update(dt, vin, W);
      for (const e of ev) { if (e === 'crash') { sound.crash(); fx.shake = Math.max(fx.shake, 0.5); } else if (e === 'crush') fx.shake = Math.max(fx.shake, 0.4); }
      if (v.kind !== 'jet' && inp.zoom) look.zoom = clamp((look.zoom || 1) * (1 + inp.zoom * 0.08), 0.5, 2.5);
      v.cameraRig(camera, dt, look);
      player.pos.copy(v.pos); player.vel.copy(v.vel); player.speed = Math.abs(v.speed);
      player.alt = v.pos.y - dem.heightAt(v.pos.x, v.pos.z); player.heading = v.yaw;
      player.hero.position.copy(v.pos);
      if (vehicle && vehicle.hp <= 0) destroyVehicle();
    }
    // camera shake
    if (fx.shake > 0) { const s = fx.shake * fx.shake * 0.6; camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s; camera.position.z += (Math.random() - 0.5) * s; }
  } else attract(t);
  camera.updateMatrixWorld();
  const camGround = dem.heightAt(camera.position.x, camera.position.z);
  const camAlt = camera.position.y - camGround;
  sky.update(dt, camera, camAlt);
  renderer.setClearColor(shared.uFogColor.value);
  scene.fog.color.copy(shared.uFogColor.value); scene.fog.density = shared.uFogDensity.value;
  clouds.update(dt, camera.position, sky.night, sky.cloudiness);
  precip.update(dt, camera.position, sky.wcur.rain, sky.wcur.snow);
  ground.update(camera, now);
  if (now - bT > 180) { bT = now; city.update(camera.position, camAlt, now); }
  sched.pump();
  city.flush();
  city.animate(now, dt);
  landmarks.update(t, sky.night);
  const playing = state === 'play';
  spots.update(player, camera, innerWidth, innerHeight, onCollect, playing);
  realPlaces.update(dt, player, camera, innerWidth, innerHeight, playing);
  const japanNow = new Date(Date.now()+9*3600000);
  const activityHour = timeMode === 'real' ? japanNow.getUTCHours()+japanNow.getUTCMinutes()/60 : { morning:8, day:13, evening:18, night:23 }[timeMode];
  traffic.hour=peds.hour=Math.floor(activityHour); traffic.weekend=peds.weekend=[0,6].includes(japanNow.getUTCDay());
  // life in the streets
  const lowEnough = player.alt < 400;
  const targets = [{ x: player.pos.x, y: player.pos.y, z: player.pos.z, r: vehicle ? vehicle.r + 1 : 0.6 }];
  if (playing && lowEnough) traffic.update(dt, player.pos, targets); else if (!lowEnough) traffic.update(dt, { x: 1e9, z: 1e9 }, []);
  const hazards = [];
  if (vehicle && vehicle.kind !== 'jet') hazards.push({ x: vehicle.pos.x, y: vehicle.pos.y, z: vehicle.pos.z, r: vehicle.r + 0.9, speed: Math.abs(vehicle.speed), vx: vehicle.vel.x, vz: vehicle.vel.z });
  for (const c of traffic.cars) if (c.state === 'wreck' && c.vel && c.vel.length() > 5) hazards.push({ x: c.pos.x, y: c.pos.y, z: c.pos.z, r: 2.2, speed: c.vel.length(), vx: c.vel.x, vz: c.vel.z });
  if (playing && lowEnough) peds.update(dt, player.pos.x, player.pos.z, hazards); else if (!lowEnough) peds.update(dt, 1e9, 1e9, []);
  for (let i = unmanned.length - 1; i >= 0; i--) {
    const v = unmanned[i];
    const ev = v.update(dt, { mx: 0.15, my: -0.35, up: false, down: false, boost: false, fire: false, special: false }, { city, dem, traffic, fx });
    if (v.hp <= 0 || ev.includes('crash')) { fx.explosion(v.pos.x, v.pos.y, v.pos.z, 600, 26); v.dispose(); unmanned.splice(i, 1); }
  }
  fx.update(dt, camera.position);
  if (dest) {
    const d = Math.hypot(dest.x - camera.position.x, dest.z - camera.position.z);
    const g = dem.heightAt(dest.x, dest.z);
    destBeam.position.set(dest.x, g, dest.z);
    const r = Math.max(5, d * 0.004); destBeam.scale.set(r, Math.max(300, Math.min(2500, d * 0.12)), r);
  }

  if (playing) {
    if (now - nearT > 250) {
      nearT = now;
      const n = findNear();
      if (!!n !== !!nearInfo) { nearInfo = n; setButtons(); } else nearInfo = n;
    }
    if (now - hudT > 110) {
      hudT = now;
      $('alt').textContent = '高度 ' + fmtAlt(Math.max(0, player.alt));
      $('spd').textContent = Math.round(player.speed * 3.6) + 'km/h';
      $('stamps').textContent = `★ ${spots.count}/${SPOTS.length}`;
      const busy = ground.loading + city.loading;
      const ld = $('loading');
      if (busy > 2) { ld.textContent = '読込中…'; ld.classList.add('on'); } else ld.classList.remove('on');
      sound.wind(vehicle ? (vehicle.kind === 'jet' ? 0 : Math.abs(vehicle.speed) * 0.6) : player.speed, !vehicle && player.mode === 'fly');
      sound.engine(vehicle ? vehicle.kind : null, vehicle ? vehicle.speed : 0, vehicle ? vehicle.throttle : 0);
      sound.rain(Math.max(sky.wcur.rain, 0));
      $('speed').style.opacity = !vehicle && player.mode === 'fly' ? clamp((player.speed - 90) / 350, 0, 0.55).toFixed(2) : vehicle && vehicle.kind === 'jet' ? clamp((vehicle.speed - 250) / 400, 0, 0.45).toFixed(2) : 0;
      if (vehicle) {
        $('vname').textContent = VEHICLE_NAMES[vehicle.kind];
        $('vspd').textContent = Math.round(Math.abs(vehicle.speed) * 3.6) + ' km/h';
        $('vhp').style.width = clamp(vehicle.hp / vehicle.maxHp, 0, 1) * 100 + '%';
        $('vthr').style.display = vehicle.kind === 'jet' ? '' : 'none';
        $('vthr').firstChild.style.width = vehicle.throttle * 100 + '%';
      }
      $('cross').hidden = !(vehicle ? vehicle.kind === 'tank' || vehicle.kind === 'jet' : player.view === 'third' || true);
      // destination arrow
      if (dest) {
        const d = Math.hypot(dest.x - player.pos.x, dest.z - player.pos.z);
        if (d < 45) { toast('目的地に着きました', dest.name, true); dest = null; destBeam.visible = false; $('wp').hidden = true; }
        else {
          camera.getWorldDirection(camDir);
          const camYaw = Math.atan2(camDir.x, -camDir.z);
          const b = Math.atan2(dest.x - player.pos.x, -(dest.z - player.pos.z));
          $('wp').hidden = false;
          $('wpArrow').style.transform = `rotate(${(b - camYaw) * 180 / Math.PI}deg)`;
          $('wpText').textContent = (d < 1000 ? Math.round(d) + 'm' : (d / 1000).toFixed(1) + 'km');
        }
      }
    }
    if (now - placeT > 700) { placeT = now; const p = placeName(); if ($('place').textContent !== p) $('place').textContent = p; }
    if (now - mmT > 90) { mmT = now; minimap.draw(player.pos.x, player.pos.z, player.heading, vehicle ? vehicle.yaw + look.yawOff : player.camYaw, Math.max(0, player.alt), spots.items, spots.collected, dest, realPlaces.enabled ? realPlaces.near : []); }
    if (now - saveT > 4000) { saveT = now; persist(); }
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

window.__tokyo = { THREE, scene, camera, renderer, player, ground, city, dem, sky, spots, sched, input, traffic, peds, realPlaces, fx, startGame, warpTo, onAction, spawnVehicle, setDest, get vehicle() { return vehicle; }, get look() { return look; }, aimPoint };
