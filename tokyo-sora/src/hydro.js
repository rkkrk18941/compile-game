// Shared water footprint queries and single-channel terrain masks. Holes remain islands.
export function inRing(ring,x,z){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;}return inside;}
export function inWater(body,x,z){const b=body.bounds;return x>=b[0]&&x<=b[2]&&z>=b[1]&&z<=b[3]&&inRing(body.rings[0],x,z)&&!body.rings.slice(1).some(r=>inRing(r,x,z));}
export function rasterWater(bodies,bounds,size=256){
 const data=new Uint8Array(size*size),[x0,z0,x1,z1]=bounds,sx=(x1-x0)/size,sz=(z1-z0)/size;
 const overlaps=bodies.filter(p=>p.bounds[0]<x1&&p.bounds[2]>x0&&p.bounds[1]<z1&&p.bounds[3]>z0);
 for(const body of overlaps){const minY=Math.max(0,Math.floor((body.bounds[1]-z0)/sz)),maxY=Math.min(size-1,Math.ceil((body.bounds[3]-z0)/sz));
  for(let row=minY;row<=maxY;row++){const z=z0+(row+.5)*sz,cuts=[];
   for(const ring of body.rings)for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[j],b=ring[i];if((a.z>z)!==(b.z>z))cuts.push(a.x+(b.x-a.x)*(z-a.z)/(b.z-a.z));}
   cuts.sort((a,b)=>a-b);
   for(let k=0;k+1<cuts.length;k+=2){const lo=Math.max(0,Math.ceil((cuts[k]-x0)/sx-.5)),hi=Math.min(size,Math.ceil((cuts[k+1]-x0)/sx-.5));if(hi>lo)data.fill(255,row*size+lo,row*size+hi);}
  }
 }
 return {data,hasWater:data.some(v=>v!==0)};
}
export function waterLevel(rings,demAt,properties={}){
 if(properties.class==='ocean')return 0;
 const explicit=Number(properties.ele);if(properties.ele!==undefined&&Number.isFinite(explicit))return explicit;
 const r=rings[0],xs=r.map(p=>p.x),ys=r.map(p=>p.y),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),samples=[];
 const inside=(ring,x,y)=>{let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[j],b=ring[i];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)hit=!hit;}return hit;};
 // Interior samples avoid lifting a pond to the elevation of a high bank.
 for(let j=0;j<9;j++)for(let i=0;i<9;i++){const x=x0+(i+.5)*(x1-x0)/9,y=y0+(j+.5)*(y1-y0)/9;if(inside(r,x,y)&&!rings.slice(1).some(h=>inside(h,x,y)))samples.push(demAt(x,y));}
 if(!samples.length)for(const p of r)samples.push(demAt(p.x,p.y));
 samples.sort((a,b)=>a-b);return samples[Math.floor((samples.length-1)*.2)]||0;
}
