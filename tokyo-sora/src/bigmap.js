// Full-screen map (Leaflet + GSI tiles): see where you are, tap anywhere to warp.
import L from 'leaflet';
import {worldToLL} from './geo.js';
import { SPOTS } from './spots.js';

export class BigMap {
  constructor(el, onWarp, onDestination) {
    this.el = el; this.onWarp = onWarp; this.onDestination=onDestination; this.map = null;
  }
  open(lat, lon, heading, collected, pois=[], route=[]) {
    if (!this.map) {
      this.map = L.map(this.el, { zoomControl: true, attributionControl: true, worldCopyJump: false, maxBounds: [[20, 118], [50, 160]] }).setView([lat, lon], 13);
      const standard=L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
        maxZoom: 18, minZoom: 5,
        attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>',
      }).addTo(this.map);
      const photo=L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',{maxZoom:18,attribution:'国土地理院'});
      L.control.layers({'地図':standard,'航空写真':photo},null,{collapsed:true}).addTo(this.map);
      this.featureLayer=L.layerGroup().addTo(this.map);
      this.me = L.circleMarker([lat, lon], { radius: 9, color: '#fff', weight: 3, fillColor: '#ff3b30', fillOpacity: 1 }).addTo(this.map);
      this.spotLayer = L.layerGroup().addTo(this.map);
      this.map.on('click', (e) => this.ask(e.latlng.lat, e.latlng.lng, 'この場所'));
    } else {
      this.map.setView([lat, lon], Math.max(12, this.map.getZoom()));
    }
    this.me.setLatLng([lat, lon]);
    this.featureLayer.clearLayers();
    for(const p of pois.slice(0,180)){
      if(p.kind==='place')continue;const[lat,lon]=worldToLL(p.x,p.z),label=document.createElement('span');label.textContent=p.name+'（'+p.category+'）';
      const marker=L.circleMarker([lat,lon],{radius:5,color:'#fff',weight:1,fillColor:p.color,fillOpacity:1});marker.bindTooltip(label);marker.on('click',e=>{L.DomEvent.stopPropagation(e);this.ask(lat,lon,p.name);});marker.addTo(this.featureLayer);
    }
    if(route.length>1)L.polyline(route.map(p=>worldToLL(p.x,p.z)),{color:'#d49a13',weight:5,opacity:.9}).addTo(this.featureLayer);
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
    const b3=document.createElement('button');b3.textContent='歩いて向かう';b3.onclick=()=>{this.map.closePopup();this.onDestination?.(lat,lon,name);};
    div.append(t, b3, b2, b1);
    L.popup({ closeButton: true, autoPan: true }).setLatLng([lat, lon]).setContent(div).openOn(this.map);
  }
}
