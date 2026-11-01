// Stamp rally: famous places marked with light pillars and floating labels.
import * as THREE from 'three';
import { llToWorld } from './geo.js';
import { beamMaterial } from './shaders.js';

export const SPOTS = [
  { id: 'tokyo-st', name: '東京駅', lat: 35.681236, lon: 139.767125, area: '千代田区' },
  { id: 'kokyo', name: '皇居', lat: 35.685175, lon: 139.752800, area: '千代田区' },
  { id: 'tower', name: '東京タワー', lat: 35.658581, lon: 139.745433, top: 333, area: '港区', hint: 'てっぺんにタッチ' },
  { id: 'skytree', name: '東京スカイツリー', lat: 35.710063, lon: 139.810700, top: 634, area: '墨田区', hint: 'てっぺんにタッチ' },
  { id: 'kaminarimon', name: '浅草・雷門', lat: 35.711088, lon: 139.796333, area: '台東区' },
  { id: 'ueno', name: '上野公園', lat: 35.714800, lon: 139.773500, area: '台東区' },
  { id: 'akiba', name: '秋葉原', lat: 35.698353, lon: 139.773114, area: '千代田区' },
  { id: 'shibuya', name: '渋谷スクランブル交差点', lat: 35.659500, lon: 139.700550, area: '渋谷区' },
  { id: 'meiji', name: '明治神宮', lat: 35.676398, lon: 139.699326, area: '渋谷区' },
  { id: 'tocho', name: '東京都庁', lat: 35.689634, lon: 139.692101, area: '新宿区' },
  { id: 'ikebukuro', name: '池袋サンシャイン60', lat: 35.729030, lon: 139.719440, area: '豊島区' },
  { id: 'roppongi', name: '六本木ヒルズ', lat: 35.660464, lon: 139.729249, area: '港区' },
  { id: 'rainbow', name: 'レインボーブリッジ', lat: 35.636500, lon: 139.763400, area: '港区' },
  { id: 'odaiba', name: 'お台場', lat: 35.626900, lon: 139.775100, area: '港区' },
  { id: 'bigsight', name: '東京ビッグサイト', lat: 35.630000, lon: 139.793900, area: '江東区' },
  { id: 'haneda', name: '羽田空港', lat: 35.549393, lon: 139.779839, area: '大田区' },
  { id: 'takao', name: '高尾山', lat: 35.625110, lon: 139.243612, area: '八王子市', r: 260 },
  { id: 'kumotori', name: '雲取山（東京の最高峰）', lat: 35.855278, lon: 138.943611, area: '奥多摩町', r: 300 },
];

export class Spots {
  constructor(scene, dem, layer, collected) {
    this.dem = dem; this.layer = layer;
    this.collected = new Set(collected || []);
    this.items = [];
    const geo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
    geo.translate(0, 0.5, 0);
    for (const s of SPOTS) {
      const [x, z] = llToWorld(s.lat, s.lon);
      const mat = beamMaterial('#ffc94a');
      const beam = new THREE.Mesh(geo, mat);
      beam.frustumCulled = false; beam.renderOrder = 5;
      scene.add(beam);
      const el = document.createElement('div');
      el.className = 'spot-label';
      el.style.display = 'none';
      el.innerHTML = `<b></b><small></small>`;
      el.querySelector('b').textContent = s.name;
      layer.appendChild(el);
      this.items.push({ s, x, z, beam, mat, el, ground: 0, exact: false, vis: false });
    }
    this.v = new THREE.Vector3();
    this.refresh();
  }
  refresh() {
    for (const it of this.items) {
      const done = this.collected.has(it.s.id);
      it.el.classList.toggle('done', done);
      it.mat.uniforms.uColor.value.set(done ? '#6fe3a0' : '#ffc94a');
    }
  }
  reset() { this.collected.clear(); this.refresh(); }
  get count() { return this.collected.size; }
  update(player, camera, w, h, onCollect, playing) {
    const cam = camera.position;
    const vis = [];
    for (const it of this.items) {
      if (!it.exact) { it.exact = this.dem.hasDetail(it.x, it.z); it.ground = this.dem.heightAt(it.x, it.z); }
      const s = it.s, done = this.collected.has(s.id);
      const baseY = it.ground + (s.top || 0);
      const dist = Math.hypot(it.x - cam.x, it.z - cam.z);
      // pillar
      const rad = Math.max(4, dist * 0.0035);
      const hgt = Math.max(260, Math.min(2500, dist * 0.12)) * (done ? 0.35 : 1);
      it.beam.position.set(it.x, baseY, it.z);
      it.beam.scale.set(rad, hgt, rad);
      it.mat.uniforms.uAlpha.value = done ? 0.35 : Math.min(1, 0.45 + dist / 3000);
      it.beam.visible = dist > 25 || !done;
      it.dist = dist;
      // collect
      if (playing && !done) {
        const px = player.pos.x, py = player.pos.y, pz = player.pos.z;
        const dh = Math.hypot(px - it.x, pz - it.z);
        let hit;
        if (s.top) hit = Math.hypot(dh, py - (it.ground + s.top)) < 75;
        else hit = dh < (s.r || 140) && py - it.ground < 420;
        if (hit && it.exact) { this.collected.add(s.id); this.refresh(); onCollect(s); }
      }
      // label position
      it.show = false;
      if (!playing || dist > 45000) continue;
      this.v.set(it.x, baseY + (s.top ? 25 : 60), it.z).project(camera);
      if (this.v.z > 1 || this.v.z < -1 || Math.abs(this.v.x) > 1.05 || Math.abs(this.v.y) > 1.05) continue;
      it.sx = (this.v.x * 0.5 + 0.5) * w; it.sy = (-this.v.y * 0.5 + 0.5) * h;
      vis.push(it);
    }
    // place labels nearest-first, nudging up or hiding when they would overlap
    vis.sort((a, b) => a.dist - b.dist);
    const placed = [];
    const blocked = (x0, y0, x1, y1) => {
      if (y0 < 150 && x0 < 175) return true;           // minimap & stats
      if (y0 < 64 && x1 > w - 220) return true;        // top-right buttons
      for (const r of placed) if (x0 < r[2] && x1 > r[0] && y0 < r[3] && y1 > r[1]) return true;
      return false;
    };
    for (const it of vis) {
      const bw = Math.max(64, it.s.name.length * 12.5 + 20), bh = 36;
      let ok = false, dy = 0;
      for (let k = 0; k < 3 && !ok; k++) {
        dy = -k * 38;
        const x0 = it.sx - bw / 2, y0 = it.sy - bh + dy;
        if (y0 > -10 && !blocked(x0, y0, x0 + bw, y0 + bh)) { ok = true; placed.push([x0, y0, x0 + bw, y0 + bh]); }
      }
      if (!ok) continue;
      it.show = true;
      const el = it.el, dist = it.dist, s = it.s, done = this.collected.has(s.id);
      el.style.transform = `translate(${it.sx.toFixed(1)}px, ${(it.sy + dy).toFixed(1)}px) translate(-50%, -100%)`;
      const dtxt = dist < 1000 ? Math.round(dist) + 'm' : (dist / 1000).toFixed(dist < 10000 ? 1 : 0) + 'km';
      const small = el.querySelector('small');
      const txt = done ? '✓ ' + dtxt : (s.hint && dist < 2500 ? s.hint + ' · ' : '') + dtxt;
      if (small.textContent !== txt) small.textContent = txt;
      el.style.opacity = dist > 20000 ? 0.55 : 1;
      el.classList.toggle('stem', dy === 0);
    }
    for (const it of this.items) {
      if (it.show !== it.vis) { it.el.style.display = it.show ? '' : 'none'; it.vis = it.show; }
    }
  }
}
