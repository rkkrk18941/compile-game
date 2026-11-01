// Validated, optional handoff data. Missing/invalid files always preserve the base map.
import { fetchResource } from './network.js';
import { llToWorld, distToRect } from './geo.js';
const finite = v => typeof v==='number' && Number.isFinite(v);
export function dataURL(value,base){
  try{const url=new URL(value,base);return ['https:','http:'].includes(url.protocol)?url.href:null;}catch{return null;}
}
export function normalizeManifest(raw,base){
  if(!raw||raw.version!==1)return [];
  const out=[],seen=new Set();
  for(const a of Array.isArray(raw.assets)?raw.assets:[]){
    const url=dataURL(a.url,base),b=a.bbox,o=a.origin;
    if(a.format!=='glb'||a.coordinates!=='local-y-up'||!url||typeof a.id!=='string'||seen.has(a.id))continue;
    if(!Array.isArray(b)||b.length!==4||!b.every(finite)||b[0]>=b[2]||b[1]>=b[3]||b[0]<122||b[2]>154||b[1]<20||b[3]>46)continue;
    if(!Array.isArray(o)||o.length!==3||!o.every(finite)||o[0]<b[0]||o[0]>b[2]||o[1]<b[1]||o[1]>b[3])continue;
    if(typeof a.source!=='string'||!a.source.trim()||typeof a.license!=='string'||!a.license.trim()||!Number.isInteger(a.year)||a.year<1990||a.year>2100)continue;
    if(!finite(a.bytes)||a.bytes<=0||a.bytes>16*1024*1024)continue;
    const [x0,z1]=llToWorld(b[1],b[0]),[x1,z0]=llToWorld(b[3],b[2]);
    if(x1-x0>1500||z1-z0>1500)continue;
    seen.add(a.id);out.push({...a,url,replaces:Array.isArray(a.replaces)?a.replaces.filter(v=>typeof v==='string'):[],worldBounds:[x0,z0,x1,z1]});
  }
  return out;
}
export class TrafficCalibration {
  constructor(){this.points=[];this.revision=0;this.state='map';}
  load(raw){
    this.points=[];
    if(raw?.version===1)for(const p of raw.points||[]){
      if(!finite(p.lat)||!finite(p.lon)||p.lat<20||p.lat>46||p.lon<122||p.lon>154||!finite(p.radius)||p.radius<20||p.radius>2000)continue;
      if(!['observed','estimated','interpolated'].includes(p.basis)||typeof p.source!=='string'||!p.source.trim()||typeof p.license!=='string'||!Number.isInteger(p.year))continue;
      const validCurve=c=>Array.isArray(c)&&c.length===24&&c.every(v=>finite(v)&&v>=0&&v<=4);
      const curves={};for(const kind of ['ped','car'])for(const day of ['weekday','weekend']){const v=p[kind]?.[day];if(validCurve(v))curves[kind+day]=v;}
      if(!Object.keys(curves).length)continue;
      const[x,z]=llToWorld(p.lat,p.lon);this.points.push({...p,x,z,curves});
    }
    this.state=this.points.length?'calibrated':'map';this.revision++;
  }
  factor(kind,x,z,hour,weekend){
    let sum=0,weight=0;const h=((hour%24)+24)%24,i=Math.floor(h),f=h-i;
    for(const p of this.points){const c=p.curves[kind+(weekend?'weekend':'weekday')];if(!c)continue;const d=Math.hypot(p.x-x,p.z-z);if(d>p.radius)continue;const w=(1-d/p.radius)**2;sum+=(c[i]*(1-f)+c[(i+1)%24]*f)*w;weight+=w;}
    if(!weight)return 1;const strength=Math.min(1,weight);return 1-strength+sum/weight*strength;
  }
  sourcesAt(x,z){return this.points.filter(p=>Math.hypot(p.x-x,p.z-z)<p.radius).map(p=>({source:p.source,year:p.year,basis:p.basis}));}
}
export function assetDistance(a,x,z){return distToRect(x,z,...a.worldBounds);}
export async function optionalJSON(url,signal){
  try{return await fetchResource(url,{signal},async r=>{if(!r.ok)return null;const length=Number(r.headers.get('content-length'));if(length>2*1024*1024)return null;const text=await r.text();return text.length<=2*1024*1024?JSON.parse(text):null;});}catch{return null;}
}
