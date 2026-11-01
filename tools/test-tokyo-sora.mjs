// Run: node tools/test-tokyo-sora.mjs [--live]
// Offline checks include an encoded MVT fixture through the actual city worker.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Pbf from 'pbf';
import * as THREE from 'three';
const root=resolve(import.meta.dirname,'..');
async function moduleFrom(path, extra='') {
  const source=readFileSync(resolve(root,path),'utf8')+extra;
  const r=await build({stdin:{contents:source,resolveDir:resolve(root,path,'..'),sourcefile:path},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
  return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));
}
const {poiCategory,timeActivity,edgeActivity,ActivityPool}=await moduleFrom('tokyo-sora/src/activity.js');
assert.equal(poiCategory({class:'shop',subclass:'convenience'})[0],'convenience');
assert.equal(poiCategory({class:'railway',subclass:'station'})[0],'station');
assert.equal(poiCategory({class:'park'})[0],'park');
assert.equal(edgeActivity(1,0,[],[]).ped,0);
assert.equal(edgeActivity(8,0,['park'],[]).car,0);
assert.equal(edgeActivity(6,0,[],[],false,true).car,0);
assert.equal(edgeActivity(3,3,[],[],true).ped,0);
const residential=edgeActivity(6,0,['residential'],[]), retail=edgeActivity(6,0,['retail'],[{kind:'station',influence:3}]);
assert.ok(retail.ped > residential.ped*5);
assert.ok(timeActivity(2).ped < timeActivity(13).ped/5);
assert.ok(timeActivity(8).station > timeActivity(13).station);
assert.ok(timeActivity(13,true).park > timeActivity(13,false).park);
const g={pts:new Float32Array([-1000,0,0,1000,0,0]),eS:[0],eC:[2],eA:[0],eCls:[6],ePed:[0.01],eCar:[0.005],eStation:[0],ePark:[0]};
const tile={cx:0,cz:0,b:[-1200,-1200,1200,1200],graph:g,graphVersion:1};
const city={graphTiles:()=>[tile]},dem={heightAt:()=>0};
const pool=new ActivityPool('ped');pool.update(city,dem,0,0,100,13,false,80,1);
assert.ok(Math.abs(pool.total-2)<1e-6,'only 200m inside radius, not entire 2km road');
for(let i=0;i<100;i++){const p=pool.pick();assert.ok(p.s>=900&&p.s<=1100);}
const day=pool.total;pool.update(city,dem,0,0,100,2,false,80,3);assert.ok(pool.total < day/5);
tile.dropped=true;assert.equal(pool.pick(),null);tile.dropped=false;
const empty=new ActivityPool('car');empty.update({graphTiles:()=>[]},dem,0,0,100,13,false,55,1);assert.equal(empty.desired,0);
// Splitting a road must not change its activity or probability mass.
const split={...g,pts:new Float32Array([-1000,0,0,0,0,0,0,0,0,1000,0,0]),eS:[0,2],eC:[2,2],eA:[0,1],eCls:[6,6],ePed:[.01,.01],eCar:[.005,.005]};
const sp=new ActivityPool('ped');sp.update({graphTiles:()=>[{...tile,graph:split}]},dem,0,0,100,13,false,80,1);assert.ok(Math.abs(sp.total-day)<1e-6);

// Minimal vector-tile encoder. Geometry is independent test input, not a mock worker.
const zig=n=>n<0?-2*n-1:2*n;
function geom(type,points){let x=0,y=0;const a=[9,zig(points[0][0]),zig(points[0][1])];[x,y]=points[0];if(type!==1){a.push(((points.length-1)<<3)|2);for(const p of points.slice(1)){a.push(zig(p[0]-x),zig(p[1]-y));[x,y]=p;}if(type===3)a.push(15);}return a;}
function encode(layers){const p=new Pbf();for(const[name,features]of Object.entries(layers))p.writeMessage(3,(_,l)=>{l.writeStringField(1,name);l.writeVarintField(15,2);l.writeVarintField(5,4096);const keys=[],values=[];for(const f of features)for(const[k,v]of Object.entries(f.props)){if(!keys.includes(k))keys.push(k);if(!values.includes(String(v)))values.push(String(v));}for(const f of features)l.writeMessage(2,(_,w)=>{w.writeVarintField(1,f.id);w.writeVarintField(3,f.type);w.writePackedVarint(2,Object.entries(f.props).flatMap(([k,v])=>[keys.indexOf(k),values.indexOf(String(v))]));w.writePackedVarint(4,geom(f.type,f.points));},null);for(const k of keys)l.writeStringField(3,k);for(const v of values)l.writeMessage(4,(_,w)=>w.writeStringField(1,v),null);},null);return p.finish();}
const feature=(id,type,props,points)=>({id,type,props,points});
const bytes=encode({
 building:[feature(1,3,{render_height:8},[[1500,1500],[2200,1500],[2200,2200],[1500,2200]])],
 poi:[feature(1,1,{class:'shop',subclass:'convenience','name:ja':'実在テスト店'},[[1700,1700]]),feature(2,1,{class:'shop',subclass:'convenience',level:-1,name:'地下店'},[[1800,1800]]),feature(3,1,{class:'shop',subclass:'convenience'},[[3000,3000]])],
 park:[feature(1,3,{class:'park'},[[2600,2600],[3900,2600],[3900,3900],[2600,3900]])],
 transportation:[feature(1,2,{class:'minor'},[[100,1400],[4000,1400]]),feature(2,2,{class:'path',subclass:'footway'},[[2600,2800],[3800,2800]])]
});
let done;globalThis.self={postMessage:m=>{done=m;}};
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>new Response(bytes);
await moduleFrom('tokyo-sora/src/worker.js');
await self.onmessage({data:{type:'build',id:1,lod:2,size:2000,x:1,y:1,cx:0,cz:0,osmUrl:'fixture://osm',plUrl:null,maxTrees:30}});
globalThis.fetch=originalFetch;
assert.equal(done.type,'done',done.msg);assert.equal(done.nb,1);assert.equal(done.pois.length,2);
const store=done.pois.find(p=>p.named);assert.equal(store.name,'実在テスト店');assert.ok(store.sign&&store.building,'mapped shop attaches to containing footprint');
assert.equal(done.pois.find(p=>!p.named).name,'コンビニ','no invented chain name');
assert.ok(done.trees?.length>0,'park polygon produces vegetation');
for(let e=0;e<done.graph.eCls.length;e++)if(done.graph.eCls[e]===8)assert.equal(done.graph.eCar[e],0);
// Missing vector data must remain an empty map, never invent stores or crowds.
globalThis.fetch=async()=>new Response(null,{status:404});
await self.onmessage({data:{type:'build',id:2,lod:2,size:2000,x:1,y:1,cx:0,cz:0,osmUrl:'fixture://missing',plUrl:null}});
globalThis.fetch=originalFetch;assert.equal(done.type,'done');assert.equal(done.pois.length,0);assert.equal(done.graph,null);
// Instantiate the actual meshes and run movement/draw updates without a GPU.
const {Traffic}=await moduleFrom('tokyo-sora/src/traffic.js'),{Peds}=await moduleFrom('tokyo-sora/src/peds.js');
const simulationGraph={nodes:new Float32Array([0,0,-200,0,0,200]),pts:new Float32Array([0,0,-200,0,0,200]),eA:[0],eB:[1],eS:[0],eC:[2],eLen:[400],eCls:[6],eHW:[2.6],eSW:[0],eOne:[1],eCar:[.02],ePed:[.03],eStation:[0],ePark:[0],adjStart:[0,1,2],adj:[0,0]};
const simulationTile={key:'test',cx:0,cz:0,b:[-1000,-1000,1000,1000],lod:2,graph:simulationGraph,graphVersion:1};
const simulationCity={graphTiles:()=>[simulationTile]},scene=new THREE.Scene();
const cars=new Traffic(scene,simulationCity,dem),peds=new Peds(scene,simulationCity,dem);
for(let i=0;i<200;i++){cars.update(.05,{x:0,z:0},[]);peds.update(.05,0,0,[]);}
assert.ok(cars.cars.length>0&&peds.list.length>0);
for(const c of cars.cars){assert.ok(Number.isFinite(c.pos.x+c.pos.y+c.pos.z));assert.equal(c.dir,1,'respect one-way roads');}
for(const p of peds.list)assert.ok(Number.isFinite(p.pos.x+p.pos.y+p.pos.z));
// Real feature UI lifecycle, text-only names, destination callback and sign disposal.
class Element {
 constructor(tag){this.tag=tag;this.style={};this.children=[];this.hidden=false;}
 append(...c){this.children.push(...c);}addEventListener(){}replaceChildren(...c){this.children=c;}
 querySelector(){return this.list;}getContext(){return {fillRect(){},fillText(){}};}
}
globalThis.document={createElement:tag=>new Element(tag)};
const {RealPlaces}=await moduleFrom('tokyo-sora/src/places.js');
const panel=new Element('details');panel.list=new Element('div');const layer=new Element('div');let selected;
const placesCity={tiles:new Map([['test',{...simulationTile,pois:[store]}]]),S:2000,destroyed:new Set(),tileAtWorld:()=>simulationTile};
const places=new RealPlaces(scene,placesCity,dem,layer,panel,(...v)=>selected=v);
places.refresh(store.x,store.z,true);assert.equal(places.signs.size,1);assert.equal(panel.hidden,false);
assert.equal(panel.list.children[0].children[0].textContent,store.name);panel.list.children[0].onclick();assert.equal(selected[2],store.name);
places.setEnabled(false);places.refresh(store.x,store.z,true);assert.equal(places.signs.size,0);assert.equal(panel.hidden,true);
delete globalThis.document;
console.log('PASS: categories, access restrictions, time/land-use activity, clipped length weighting, graph changes, MVT → buildings/storefront/park/road graph, missing data, Three.js simulation, feature UI lifecycle');
if(process.argv.includes('--live')){
 const {llToWorld,tileAt,tileBounds,tileSize}=await moduleFrom('tokyo-sora/src/geo.js');
 const meta=await(await fetch('https://tiles.openfreemap.org/planet')).json();
 for(const[name,lat,lon]of[['Tokyo Station',35.681236,139.767125],['Ueno Park',35.7148,139.7735],['Yomiuriland-mae',35.6148,139.5274]]){
  const[wx,wz]=llToWorld(lat,lon),[x,y]=tileAt(14,wx,wz),b=tileBounds(14,x,y);const start=performance.now();
  await self.onmessage({data:{type:'build',id:3,lod:2,size:tileSize(14),x,y,cx:(b[0]+b[2])/2,cz:(b[1]+b[3])/2,osmUrl:meta.tiles[0].replace('{z}',14).replace('{x}',x).replace('{y}',y),plUrl:null,maxTrees:300}});
  assert.equal(done.type,'done',done.msg);assert.ok(done.osmOk);assert.ok(done.pois.some(p=>p.kind==='convenience'));assert.ok(done.graph);
  console.log(JSON.stringify({name,ms:Math.round(performance.now()-start),buildings:done.nb,pois:done.pois.length,convenience:done.pois.filter(p=>p.kind==='convenience').length,signs:done.pois.filter(p=>p.sign).length,trees:done.trees?.length/5||0,edges:done.graph.eA.length}));
 }
}
