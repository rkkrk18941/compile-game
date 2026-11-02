// Ground-projected, soft sun shadows from measured footprints/heights. This avoids
// rendering the entire streamed city a second time on mobile. Terrain and roofs are
// simplified; this is not a full 3D cascaded shadow solution.
import * as THREE from 'three';
import { shared } from './shaders.js';
export function shadowHull(points){
 const p=points.slice().sort((a,b)=>a.x-b.x||a.z-b.z);if(p.length<3)return p;
 const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x),lo=[],hi=[];
 for(const q of p){while(lo.length>1&&cross(lo.at(-2),lo.at(-1),q)<=0)lo.pop();lo.push(q);}
 for(let i=p.length-1;i>=0;i--){const q=p[i];while(hi.length>1&&cross(hi.at(-2),hi.at(-1),q)<=0)hi.pop();hi.push(q);}
 return lo.slice(0,-1).concat(hi.slice(0,-1));
}
export function projectShadow(points,height,sun,maxLength=250){
 const scale=Math.min(height/Math.max(.08,sun.y),maxLength/Math.max(.001,Math.hypot(sun.x,sun.z))),dx=-sun.x*scale,dz=-sun.z*scale;
 return shadowHull(points.concat(points.map(p=>({x:p.x+dx,z:p.z+dz}))));
}
export class GroundShadows {
 constructor(city){this.city=city;this.next=0;this.size=0;this.radius=220;this.enabled=false;this.x=Infinity;this.z=Infinity;this.sun=new THREE.Vector3();this.revision=-1;}
 setQuality(name,mobile=false){this.enabled=name==='high'&&!mobile;if(!this.enabled){shared.uShadowStrength.value=0;return;}const size=512;this.radius=220;
  if(size!==this.size){this.size=size;this.canvas=document.createElement('canvas');this.canvas.width=this.canvas.height=size;this.ctx=this.canvas.getContext('2d',{willReadFrequently:true});this.drawCanvas=document.createElement('canvas');this.drawCanvas.width=this.drawCanvas.height=size;this.drawCtx=this.drawCanvas.getContext('2d');this.texture?.dispose();this.texture=new THREE.DataTexture(new Uint8Array(size*size).fill(255),size,size,THREE.RedFormat);this.texture.minFilter=this.texture.magFilter=THREE.LinearFilter;this.texture.needsUpdate=true;shared.uShadowMap.value=this.texture;}
  this.next=0;this.revision=-1;if(!this.enabled)shared.uShadowStrength.value=0;
 }
 update(dt,position,alt){
  shared.uShadowStrength.value=this.enabled&&alt<220?(1-shared.uNight.value*.9)*.85:0;
  if(!shared.uShadowStrength.value)return;
  this.next-=dt;const sun=shared.uSunDir.value;
  if(this.next>0)return;
  if(this.revision===this.city.graphRevision&&Math.hypot(this.x-position.x,this.z-position.z)<8&&this.sun.distanceTo(sun)<.01)return;
  this.next=2;this.revision=this.city.graphRevision;this.sun.copy(sun);this.x=Math.round(position.x/8)*8;this.z=Math.round(position.z/8)*8;
  const r=this.radius,size=this.size,scale=size/(r*2),x0=this.x-r,z0=this.z-r,g=this.drawCtx;let drawn=0;const start=performance.now();
  shared.uShadowBounds.value.set(x0,z0,r*2,r*2);
  g.filter='none';g.globalAlpha=1;g.fillStyle='#fff';g.fillRect(0,0,size,size);g.fillStyle='#111';g.globalAlpha=.72;g.filter='none';
  this.city.near(this.x,this.z,r+250,(t,c,b)=>{
   if(drawn>=256||performance.now()-start>3)return true;
   if(!t.meta)return;drawn++;const height=c.top[b]-t.meta.base[b];if(height<2.5)return;
   const pts=[];for(let j=0;j<c.cnt[b];j+=Math.max(1,Math.floor(c.cnt[b]/64))){const k=(c.start[b]+j)*2;pts.push({x:t.cx+c.pts[k],z:t.cz+c.pts[k+1]});}
   const hull=projectShadow(pts,height,sun);if(hull.length<3)return;
   g.beginPath();hull.forEach((p,i)=>{const x=(p.x-x0)*scale,z=(p.z-z0)*scale;if(i)g.lineTo(x,z);else g.moveTo(x,z);});g.closePath();g.fill();
  });
  const target=this.ctx;target.filter='blur(1.5px)';target.drawImage(this.drawCanvas,0,0);target.filter='none';
  g.filter='none';g.globalAlpha=1;const pixels=target.getImageData(0,0,size,size).data,data=this.texture.image.data;
  for(let i=0;i<data.length;i++)data[i]=pixels[i*4];this.texture.needsUpdate=true;
 }
}
