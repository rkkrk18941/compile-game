// Full-screen map (Leaflet + GSI tiles): see where you are, tap anywhere to warp.
import L from 'leaflet';
import { SPOTS } from './spots.js';

export class BigMap {
  constructor(el, onWarp) {
    this.el = el; this.onWarp = onWarp; this.map = null;
  }
  open(lat, lon, heading, collected) {
    if (!this.map) {
      this.map = L.map(this.el, { zoomControl: true, attributionControl: true, worldCopyJump: false, maxBounds: [[20, 118], [50, 160]] }).setView([lat, lon], 13);
      L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
        maxZoom: 18, minZoom: 5,
        attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>',
      }).addTo(this.map);
      this.me = L.circleMarker([lat, lon], { radius: 9, color: '#fff', weight: 3, fillColor: '#ff3b30', fillOpacity: 1 }).addTo(this.map);
      this.spotLayer = L.layerGroup().addTo(this.map);
      this.map.on('click', (e) => this.ask(e.latlng.lat, e.latlng.lng, 'この場所'));
    } else {
      this.map.setView([lat, lon], Math.max(12, this.map.getZoom()));
    }
    this.me.setLatLng([lat, lon]);
    this.spotLayer.clearLayers();
    for (const s of SPOTS) {
      const done = collected.has(s.id);
      const m = L.circleMarker([s.lat, s.lon], { radius: 7, color: '#3a2a00', weight: 1.5, fillColor: done ? '#2fbf71' : '#ffb300', fillOpacity: 1 });
      m.bindTooltip((done ? '✓ ' : '') + s.name, { direction: 'top', offset: [0, -6] });
      m.on('click', (e) => { L.DomEvent.stopPropagation(e); this.ask(s.lat, s.lon, s.name, true); });
      m.addTo(this.spotLayer);
    }
    setTimeout(() => this.map.invalidateSize(), 30);
  }
  ask(lat, lon, name, spot) {
    const div = document.createElement('div');
    div.className = 'warp-pop';
    const t = document.createElement('div'); t.textContent = name; t.className = 'warp-name';
    const b1 = document.createElement('button'); b1.textContent = '上空へワープ'; b1.onclick = () => { this.map.closePopup(); this.onWarp(lat, lon, 'fly', name, spot); };
    const b2 = document.createElement('button'); b2.textContent = '地上へワープ'; b2.className = 'sub'; b2.onclick = () => { this.map.closePopup(); this.onWarp(lat, lon, 'walk', name, spot); };
    div.append(t, b1, b2);
    L.popup({ closeButton: true, autoPan: true }).setLatLng([lat, lon]).setContent(div).openOn(this.map);
  }
}
