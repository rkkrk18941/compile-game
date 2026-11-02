// Real map features: schematic facade signs, nearby list and uncluttered world labels.
import * as THREE from 'three';
import { worldToLL } from './geo.js';
import { addCurvature } from './shaders.js';

export class RealPlaces {
  constructor(scene, city, dem, layer, panel, onDestination) {
    this.scene=scene; this.city=city; this.dem=dem; this.panel=panel; this.onDestination=onDestination;
    this.near=[]; this.signs=new Map(); this.next=0; this.v=new THREE.Vector3(); this.enabled=true; this.elapsed=0; this.filter='all';
    this.geometry=new THREE.PlaneGeometry(1,1);
    this.labels=Array.from({length:8},()=>{const el=document.createElement('div');el.className='real-label';el.hidden=true;const b=document.createElement('b'),small=document.createElement('small');el.append(b,small);layer.append(el);return {el,b,small};});
    const filter=panel.querySelector('.near-filter');
    if(filter)filter.addEventListener('change',()=>{this.setFilter(filter.value);this.onFilterChange?.(this.filter);});
    panel.addEventListener('pointerdown',e=>e.stopPropagation());
    panel.addEventListener('touchstart',e=>e.stopPropagation(),{passive:true});
  }
  setEnabled(on) { this.enabled=on; this.next=0; }
  setFilter(value){this.filter=['all','convenience','park','station','food','shop','health','school'].includes(value)?value:'all';const select=this.panel.querySelector('.near-filter');if(select)select.value=this.filter;this.next=0;}
  accepts(p){return p.kind!=='place'&&(this.filter==='all'||p.kind===this.filter);}
  makeSign(p) {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
    const g=canvas.getContext('2d');g.fillStyle='#f7faf7';g.fillRect(0,0,512,128);
    g.fillStyle=p.color;g.fillRect(0,0,512,30);g.fillStyle='#fff';g.font='bold 19px sans-serif';g.fillText(p.category+' · 地図情報',14,23);
    g.fillStyle='#163b39';g.font='bold 36px sans-serif';g.textBaseline='middle';g.fillText(p.name,14,81,484);
    const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
    const mat=addCurvature(new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2}));
    const mesh=new THREE.Mesh(this.geometry,mat),s=p.sign;
    mesh.position.set(s.x,s.y,s.z);mesh.rotation.y=s.yaw;mesh.scale.set(s.width,s.width/4,1);mesh.renderOrder=1;
    this.scene.add(mesh);return mesh;
  }
  refresh(px,pz,playing) {
    this.near=[];
    if(playing && this.enabled) for(const t of this.city.tiles.values()) {
      if(t.lod!==2 || Math.hypot(t.cx-px,t.cz-pz)>1000+this.city.S*0.72)continue;
      for(const p of t.pois||[]) { const d=Math.hypot(p.x-px,p.z-pz);if(d<800 && !this.city.destroyed.has(p.buildingId))this.near.push({...p,d}); }
    }
    this.near.sort((a,b)=>a.d-b.d || a.rank-b.rank);
    const chosen=this.near.filter(p=>p.sign && p.d<220 && ['convenience','shop','food','health'].includes(p.kind)).slice(0,this.maxSigns??16);
    const ids=new Set(chosen.map(p=>p.id));
    for(const [id,mesh]of this.signs)if(!ids.has(id)){this.scene.remove(mesh);mesh.material.map.dispose();mesh.material.dispose();this.signs.delete(id);}
    for(const p of chosen)if(!this.signs.has(p.id))this.signs.set(p.id,this.makeSign(p));
    const list=this.panel.querySelector('.near-list');list.replaceChildren();
    const shown=this.near.filter(p=>this.accepts(p)).slice(0,4);
    for(const p of shown){
      const b=document.createElement('button');b.type='button';b.style.borderLeftColor=p.color;
      const name=document.createElement('b');name.textContent=p.name;
      const sm=document.createElement('small');const bearing=(Math.atan2(p.x-px,-(p.z-pz))*180/Math.PI+360)%360;
      sm.textContent=p.category+(p.level>0?'・'+(p.level+1)+'階':'')+' · '+Math.round(p.d)+'m '+['北','北東','東','南東','南','南西','西','北西'][Math.round(bearing/45)%8];
      b.append(name,sm);b.title='目的地に設定（直線距離）';b.onclick=()=>{const[lat,lon]=worldToLL(p.x,p.z);this.onDestination(lat,lon,p.name);};list.append(b);
    }
    if(!shown.length){const p=document.createElement('p');p.textContent=this.city.tileAtWorld(px,pz)?.lod===2?'近くに登録された施設はありません':'周辺の地図情報を読み込み中';list.append(p);}
    this.panel.hidden=!(playing&&this.enabled);
  }
  update(dt,player,camera,w,h,playing) {
    this.elapsed+=dt; this.next-=dt;if(this.next<=0){this.next=0.8;this.refresh(player.pos.x,player.pos.z,playing);}
    for(const {el}of this.labels)el.hidden=true;
    if(!playing||!this.enabled||player.alt>160)return;
    const placed=[];let count=0,checked=0,casts=0;const deadline=performance.now()+1.5;
    for(const p of this.near){
      if(count>=this.labels.length||p.d>350||checked++>=32)break;
      if(!this.accepts(p))continue;
      const anchor=p.sign||p;
      const y=p.sign ? p.sign.y+2 : p.building ? (p.roof||p.y)+3 : this.dem.heightAt(p.x,p.z)+4;
      this.v.set(anchor.x,y,anchor.z).project(camera);
      if(this.v.z>1||this.v.z< -1||Math.abs(this.v.x)>0.94||Math.abs(this.v.y)>0.8)continue;
      const x=(this.v.x*.5+.5)*w,sy=(-this.v.y*.5+.5)*h,bw=Math.min(210,Math.max(95,p.name.length*12+20));
      if(sy<170 || sy>h-160 || x<bw/2 || x>w-bw/2 || (x>w-265&&sy<365))continue;
      if(placed.some(r=>Math.abs(x-r.x)<(bw+r.bw)/2&&Math.abs(sy-r.y)<44))continue;
      // Do not label a shop through an intervening building.
      const dx=anchor.x-camera.position.x,dy=y-camera.position.y,dz=anchor.z-camera.position.z,len=Math.hypot(dx,dy,dz);
      if(!p.occlusion || this.elapsed-p.occlusion.time>0.5 || camera.position.distanceTo(p.occlusion.camera)>2) {
        if(casts>=2||performance.now()>deadline)continue;casts++;
        p.occlusion={time:this.elapsed,camera:camera.position.clone(),hidden:!!this.city.raycast(camera.position.x,camera.position.y,camera.position.z,dx/len,dy/len,dz/len,Math.max(0,len-6))};
      }
      if(p.occlusion.hidden)continue;
      const l=this.labels[count++];l.el.hidden=false;l.el.style.transform=`translate(${x}px,${sy}px) translate(-50%,-100%)`;l.b.textContent=p.name;l.b.style.borderColor=p.color;l.small.textContent=p.category+' · '+Math.round(p.d)+'m';placed.push({x,y:sy,bw});
    }
  }
}
