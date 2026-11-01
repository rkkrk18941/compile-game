// Small verified GLB chunks supplied by the offline data pipeline. No synthetic city assets.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { llToWorld, K } from './geo.js';
import { addCurvature } from './shaders.js';
import { normalizeManifest, assetDistance, optionalJSON } from './integration.js';

function dispose(root){const geometries=new Set(),materials=new Set(),textures=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures){t.dispose();t.source?.data?.close?.();}}
export class RealModels {
  constructor(scene,city){this.scene=scene;this.city=city;this.assets=[];this.loaded=new Map();this.loading=new Map();this.failed=new Map();this.enabled=true;this.state='base';this.next=0;this.budget=64*1024*1024;this.maxAssets=6;this.bytes=0;this.loader=new GLTFLoader();this.generation=0;}
  async init(url=new URL('data/manifest.json',document.baseURI).href){const raw=await optionalJSON(url);this.assets=normalizeManifest(raw,url);this.state=this.assets.length?'available':'base';}
  setEnabled(on){if(this.enabled===on)return;this.enabled=on;this.generation++;for(const ctl of this.loading.values())ctl.abort();if(!on)for(const id of [...this.loaded.keys()])this.drop(id);this.next=0;}
  masks(){const ids=new Set();for(const a of this.loaded.values())for(const id of a.asset.replaces)ids.add(id);this.city.setModelReplacements(ids);}
  drop(id){const e=this.loaded.get(id);if(!e)return;this.scene.remove(e.root);dispose(e.root);this.bytes-=e.bytes;this.loaded.delete(id);this.masks();}
  async load(a){
    const ctl=new AbortController(),generation=this.generation;this.loading.set(a.id,ctl);
    const timeout=setTimeout(()=>ctl.abort(),20000);let root=null;
    try{
      const r=await fetch(a.url,{signal:ctl.signal});if(!r.ok)throw Error('HTTP '+r.status);
      const contentLength=Number(r.headers.get('content-length'));if(contentLength>16*1024*1024)throw Error('asset too large');
      const bytes=await r.arrayBuffer();if(bytes.byteLength>16*1024*1024||ctl.signal.aborted)throw Error('asset budget');
      const gltf=await this.loader.parseAsync(bytes,new URL('.',a.url).href);root=gltf.scene;
      let memory=bytes.byteLength,triangles=0;root.traverse(o=>{if(o.geometry){for(const b of Object.values(o.geometry.attributes))memory+=b.array.byteLength;if(o.geometry.index){memory+=o.geometry.index.array.byteLength;triangles+=o.geometry.index.count/3;}else triangles+=(o.geometry.attributes.position?.count||0)/3;}for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])for(const v of Object.values(m))if(v?.isTexture&&v.image)memory+=(v.image.width||0)*(v.image.height||0)*4;});
      if(generation!==this.generation||!this.enabled||ctl.signal.aborted||triangles>400000||memory>this.budget||this.bytes+memory>this.budget)throw Error('asset budget or expired');
      const [x,z]=llToWorld(a.origin[1],a.origin[0]),scale=K/Math.cos(a.origin[1]*Math.PI/180),group=new THREE.Group();group.position.set(x,a.origin[2],z);group.scale.set(scale,1,scale);group.add(root);group.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(group),wb=a.worldBounds;
      if(bounds.isEmpty()||bounds.min.x<wb[0]-20||bounds.max.x>wb[2]+20||bounds.min.z<wb[1]-20||bounds.max.z>wb[3]+20||bounds.max.y>4000||bounds.min.y< -100)throw Error('model coordinates do not match manifest');
      root.traverse(o=>{if(o.material){o.material=Array.isArray(o.material)?o.material.map(m=>addCurvature(m)):addCurvature(o.material);}});
      this.scene.add(group);this.loaded.set(a.id,{asset:a,root:group,bytes:memory});this.bytes+=memory;root=null;this.masks();this.state='ready';
    }catch(err){if(root)dispose(root);if(!ctl.signal.aborted)this.failed.set(a.id,Date.now());this.state=this.loaded.size?'ready':'base';}
    finally{clearTimeout(timeout);this.loading.delete(a.id);}
  }
  update(dt,x,z){
    this.next-=dt;if(this.next>0||!this.enabled)return;this.next=1;
    const desired=this.assets.map(a=>({a,d:assetDistance(a,x,z)})).filter(q=>q.d<900).sort((a,b)=>a.d-b.d).slice(0,this.maxAssets),ids=new Set(desired.map(q=>q.a.id));
    for(const [id,e]of this.loaded)if(!ids.has(id)||assetDistance(e.asset,x,z)>1300)this.drop(id);
    for(const {a}of desired){if(this.loading.size>=2||this.bytes>=this.budget)break;if(this.loaded.has(a.id)||this.loading.has(a.id)||(Date.now()-(this.failed.get(a.id)||0)<60000))continue;void this.load(a);}
  }
  sources(){return [...this.loaded.values()].map(e=>({source:e.asset.source,license:e.asset.license,year:e.asset.year}));}
}
