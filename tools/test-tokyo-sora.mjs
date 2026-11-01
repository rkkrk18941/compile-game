// Run: node tools/test-tokyo-sora.mjs [--live]
// Offline checks include an encoded MVT fixture through the actual city worker.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import Pbf from 'pbf';
import * as THREE from 'three';
const root=resolve(import.meta.dirname,'..');
const temporary=mkdtempSync(resolve(tmpdir(),'tokyo-sora-check-'));let moduleId=0;
process.on('exit',()=>rmSync(temporary,{recursive:true,force:true}));
async function moduleFrom(path, extra='') {
  const source=readFileSync(resolve(root,path),'utf8')+extra;
  const r=await build({stdin:{contents:source,resolveDir:resolve(root,path,'..'),sourcefile:path},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
  const outputPath=resolve(temporary,String(++moduleId)+'.mjs');writeFileSync(outputPath,r.outputFiles[0].text);return import(pathToFileURL(outputPath).href);
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
const simulationCity={graphTiles:()=>[simulationTile],graphRevision:1},scene=new THREE.Scene();
const {RoadNetwork}=await moduleFrom('tokyo-sora/src/roads.js');simulationCity.roads=new RoadNetwork(simulationCity);
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
// Cross-tile routing, grade separation, valid arrival and one-way continuation.
const makeTile=(key,x0,x1,worldXs,height=0)=>{
 const cx=(x0+x1)/2,pts=worldXs.flatMap(x=>[x-cx,height,0]),N=worldXs.length,ne=N-1;
 const graph={nodes:Float32Array.from(pts),pts:Float32Array.from(worldXs.slice(0,-1).flatMap((x,i)=>[x-cx,height,0,worldXs[i+1]-cx,height,0])),eA:[],eB:[],eS:[],eC:[],eLen:[],eCls:[],eHW:[],eSW:[],eOne:[],ePed:[],eCar:[],eElevated:[],eRestricted:[],adjStart:[],adj:[]};
 for(let e=0;e<ne;e++){graph.eA.push(e);graph.eB.push(e+1);graph.eS.push(e*2);graph.eC.push(2);graph.eLen.push(worldXs[e+1]-worldXs[e]);graph.eCls.push(6);graph.eHW.push(2.6);graph.eSW.push(1);graph.eOne.push(1);graph.ePed.push(.01);graph.eCar.push(.01);graph.eElevated.push(0);graph.eRestricted.push(0);}
 for(let n=0;n<N;n++){graph.adjStart.push(graph.adj.length);for(let e=0;e<ne;e++)if(e===n||e+1===n)graph.adj.push(e);}graph.adjStart.push(graph.adj.length);
 return {key,cx,cz:0,b:[x0,-100,x1,100],lod:2,graph,graphVersion:1};
};
const left=makeTile('L',0,100,[10,50,100]),right=makeTile('R',100,200,[100,150,190]);
const roadCity={graphRevision:1,graphTiles:()=>[left,right]},roads=new RoadNetwork(roadCity);
assert.equal(roads.continuations(left,1,1,'car')[0].t,right);
assert.equal(roads.continuations(right,0,-1,'car').length,0,'cannot enter the wrong direction');
const route=roads.route(20,0,180,0);assert.equal(route.status,'ready');assert.ok(Math.abs(route.distance-160)<1e-6);assert.equal(route.points[0].x,20);assert.equal(route.points.at(-1).x,180);
assert.equal(roads.route(20,0,80,0).distance,60);
assert.equal(roads.arrival(25,0,()=>true),null,'do not place a visitor inside a building');
assert.ok(roads.arrival(25,0,()=>false));assert.equal(roads.arrival(10000,10000),null);
const originalRight=right.graph;right.graph=makeTile('R',100,200,[100,150,190],8).graph;roadCity.graphRevision++;
assert.equal(roads.joints(left,2).length,0,'ground roads must not join an elevated road');assert.equal(roads.route(20,0,180,0).status,'unavailable');
right.graph=originalRight;roadCity.graphRevision++;
const tCross=new Traffic(new THREE.Scene(),{...roadCity,roads},dem),crossCar={t:left,e:1,dir:1,path:tCross.edgePoints(left,1,1),speed:2,temper:1,lanePref:0};
assert.equal(tCross.nextEdge(crossCar),true);assert.equal(crossCar.t,right);
const pCross=new Peds(new THREE.Scene(),{...roadCity,roads},dem),crossPed={t:left,e:1,dir:1,side:1,rnd:.5};pCross.next(crossPed);assert.equal(crossPed.t,right);
tCross.safeMode=true;const untouched={state:'drive'};tCross.hit(untouched,10,10,10,100);assert.equal(untouched.state,'drive');
pCross.safeMode=true;const walker={state:'walk'};pCross.knock(walker,5,5,5);assert.equal(walker.state,'walk');
// Terrain sample geometry and path clearance through the actual tile pipeline.
const hill=Float32Array.from({length:65536},(_,i)=>30*Math.sin((i%256)/255*Math.PI)*Math.sin(Math.floor(i/256)/255*Math.PI));
globalThis.fetch=async()=>new Response(bytes);await self.onmessage({data:{type:'build',id:4,lod:2,size:2000,x:1,y:1,cx:0,cz:0,osmUrl:'fixture://hill',plUrl:null,maxTrees:300,dem:hill}});globalThis.fetch=originalFetch;
assert.equal(done.type,'done',done.msg);
const {sampleDem}=await moduleFrom('tokyo-sora/src/dem.js');let green=0;
for(let i=0;i<done.overlay.pos.length/3;i++){if(done.overlay.inf[i*4]!==12)continue;green++;const[x,y,z]=done.overlay.pos.slice(i*3,i*3+3);assert.ok(Math.abs(y-sampleDem(hill,x/2000+.5,z/2000+.5)-.05)<.0001);}
assert.ok(green>30,'green polygons are subdivided rather than stretched over hills');
for(let e=0;e<done.graph.eC.length;e++)for(let j=1;j<done.graph.eC[e];j++){const k=(done.graph.eS[e]+j)*3;assert.ok(Math.hypot(done.graph.pts[k]-done.graph.pts[k-3],done.graph.pts[k+2]-done.graph.pts[k-1])<=12.01);}
for(let i=0;i<(done.trees?.length||0);i+=5){const x=done.trees[i],z=done.trees[i+2],pathZ=(2800/4096-.5)*2000,pathLo=(2600/4096-.5)*2000,pathHi=(3800/4096-.5)*2000;if(x>=pathLo&&x<=pathHi)assert.ok(Math.abs(z-pathZ)>=2.2,'trees must not block the mapped path');}
// Preserve sandbox history while displaying an intact city in stroll mode.
const {City}=await moduleFrom('tokyo-sora/src/city.js');const cityState=Object.create(City.prototype);
Object.assign(cityState,{damageEnabled:true,destroyed:new Set(['P1']),tiles:new Map(),anims:[],group:new THREE.Group(),modelReplacements:new Set()});cityState.sandboxDestroyed=cityState.destroyed;
cityState.setDamageEnabled(false);assert.equal(cityState.destroyed.size,0);assert.ok(cityState.sandboxDestroyed.has('P1'));assert.equal(cityState.damage(0,0,0,10,100),0);cityState.setDamageEnabled(true);assert.ok(cityState.destroyed.has('P1'));
const index=new THREE.BufferAttribute(new Uint16Array([0,1,2]),1),masked={ids:['P1'],meta:{chunk:[0],is:[0],ic:[3]},meshes:[{geometry:{index}}]};cityState.tiles.set('masked',masked);
cityState.setModelReplacements(new Set(['P1']));assert.deepEqual([...index.array],[0,0,0]);cityState.setModelReplacements(new Set());assert.deepEqual([...index.array],[0,1,2]);
// Data handoff: metadata, location, budget, hourly curves and absence fallback.
const {normalizeManifest,TrafficCalibration,optionalJSON}=await moduleFrom('tokyo-sora/src/integration.js');
const asset={id:'sample',format:'glb',coordinates:'local-y-up',url:'model.glb',origin:[139.767,35.681,0],bbox:[139.766,35.680,139.768,35.682],source:'Official test source',license:'CC BY 4.0',year:2025,bytes:2048,replaces:['P1']};
const normalized=normalizeManifest({version:1,assets:[asset]},'https://example.test/data/manifest.json');assert.equal(normalized.length,1);assert.equal(normalized[0].url,'https://example.test/data/model.glb');
assert.equal(normalizeManifest({version:1,assets:[{...asset,license:''},{...asset,url:'javascript:alert(1)'},{...asset,coordinates:'unknown'},{...asset,bytes:1e9}]},'https://example.test/data/manifest.json').length,0);
const {llToWorld}=await moduleFrom('tokyo-sora/src/geo.js');const[cx,cz]=llToWorld(35.681,139.767),calibration=new TrafficCalibration();calibration.load({version:1,points:[{lat:35.681,lon:139.767,radius:200,basis:'observed',source:'Public count',license:'CC BY',year:2024,ped:{weekday:Array(24).fill(2)},car:{weekday:Array(24).fill(.5)}}]});
assert.equal(calibration.factor('ped',cx,cz,13,false),2);assert.equal(calibration.factor('car',cx,cz,13,false),.5);assert.equal(calibration.factor('ped',cx+1000,cz,13,false),1);assert.equal(calibration.factor('ped',cx,cz,13,true),1);
const calibratedPool=new ActivityPool('ped');calibratedPool.update({...city,calibration:{revision:1,factor:()=>2}},dem,0,0,100,13,false,80,3);assert.ok(Math.abs(calibratedPool.total-4)<1e-6);
// The actual GLTFLoader accepts a self-contained chunk; models replace the fallback
// only after successful parse and coordinate/budget validation, and restore it on unload.
function glb(offset=0){
 const bin=Buffer.alloc(36);[offset,0,0,offset+1,0,0,offset,1,0].forEach((v,i)=>bin.writeFloatLE(v,i*4));
 const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],buffers:[{byteLength:36}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[offset,0,0],max:[offset+1,1,0]}]};
 const text=Buffer.from(JSON.stringify(json)),pad=(4-text.length%4)%4,jsonBytes=Buffer.concat([text,Buffer.alloc(pad,32)]),out=Buffer.alloc(12+8+jsonBytes.length+8+bin.length);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(jsonBytes.length,12);out.writeUInt32LE(0x4e4f534a,16);jsonBytes.copy(out,20);const k=20+jsonBytes.length;out.writeUInt32LE(bin.length,k);out.writeUInt32LE(0x004e4942,k+4);bin.copy(out,k+8);return out;
}
const {RealModels}=await moduleFrom('tokyo-sora/src/real-models.js');let modelMask=new Set();const models=new RealModels(new THREE.Scene(),{setModelReplacements:ids=>modelMask=ids});
globalThis.fetch=async()=>new Response(glb());await models.load(normalized[0]);assert.equal(models.loaded.size,1);assert.ok(modelMask.has('P1'));models.setEnabled(false);assert.equal(models.loaded.size,0);assert.equal(modelMask.size,0);
models.setEnabled(true);globalThis.fetch=async()=>new Response(glb(1e6));await models.load(normalized[0]);assert.equal(models.loaded.size,0);assert.equal(modelMask.size,0,'invalid coordinates never hide base buildings');
globalThis.fetch=async()=>new Response(null,{status:404});assert.equal(await optionalJSON('https://example.test/missing'),null);globalThis.fetch=originalFetch;
// Missing fine elevation cannot override a valid coarse terrain tile.
const {Dem}=await moduleFrom('tokyo-sora/src/dem.js');const elevation=new Dem({add(){}}),{tileAt}=await moduleFrom('tokyo-sora/src/geo.js'),[demX,demY]=tileAt(14,cx,cz);
elevation.map.set('13/'+(demX>>1)+'/'+(demY>>1),{state:'ready',data:new Float32Array(65536).fill(123)});elevation.map.set('14/'+demX+'/'+demY,{state:'ready',data:null});
assert.equal(elevation.heightAt(cx,cz),123);assert.equal(elevation.hasDetail(cx,cz),false);assert.equal(elevation.dataAtTile(14,demX,demY)[2000],123);
// A stalled response body releases its scheduler slot after the deadline.
const {fetchResource}=await moduleFrom('tokyo-sora/src/network.js');globalThis.fetch=async(_,options)=>new Response(new ReadableStream({start(controller){options.signal.addEventListener('abort',()=>controller.error(new DOMException('Aborted','AbortError')),{once:true});}}));
await assert.rejects(fetchResource('fixture://stalled',{},r=>r.text(),10),/timed out/);globalThis.fetch=originalFetch;
console.log('PASS: cross-tile walking/car paths, walking routes, grade separation, terrain draping, path clearance, intact stroll mode, GLB lifecycle/fallback, calibration and stalled network');

if(process.argv.includes('--live')){
 const {llToWorld,tileAt,tileBounds,tileSize}=await moduleFrom('tokyo-sora/src/geo.js');
 const meta=await(await fetch('https://tiles.openfreemap.org/planet')).json();const liveTiles=[];
 for(const[name,lat,lon]of[['Tokyo Station',35.681236,139.767125],['Ueno Park',35.7148,139.7735],['Yomiuriland-mae',35.6148,139.5274]]){
  const[wx,wz]=llToWorld(lat,lon),[x,y]=tileAt(14,wx,wz),b=tileBounds(14,x,y);const start=performance.now();
  await self.onmessage({data:{type:'build',id:3,lod:2,size:tileSize(14),x,y,cx:(b[0]+b[2])/2,cz:(b[1]+b[3])/2,osmUrl:meta.tiles[0].replace('{z}',14).replace('{x}',x).replace('{y}',y),plUrl:name==='Tokyo Station'?'https://indigo-lab.github.io/plateau-tokyo23ku-building-mvt-2020/{z}/{x}/{y}.pbf':null,maxTrees:300}});
  assert.equal(done.type,'done',done.msg);assert.ok(done.osmOk);assert.ok(done.pois.some(p=>p.kind==='convenience'));assert.ok(done.graph);
  liveTiles.push({key:x+'/'+y,cx:(b[0]+b[2])/2,cz:(b[1]+b[3])/2,b,lod:2,graph:done.graph,graphVersion:1});
  console.log(JSON.stringify({name,plateau:done.plCount,ms:Math.round(performance.now()-start),buildings:done.nb,pois:done.pois.length,convenience:done.pois.filter(p=>p.kind==='convenience').length,signs:done.pois.filter(p=>p.sign).length,trees:done.trees?.length/5||0,edges:done.graph.eA.length}));
 }
 const first=liveTiles[0],[tileX,tileY]=first.key.split('/').map(Number),x=tileX+1,y=tileY,b=tileBounds(14,x,y);
 await self.onmessage({data:{type:'build',id:8,lod:2,size:tileSize(14),x,y,cx:(b[0]+b[2])/2,cz:(b[1]+b[3])/2,osmUrl:meta.tiles[0].replace('{z}',14).replace('{x}',x).replace('{y}',y),plUrl:null,maxTrees:50}});
 assert.equal(done.type,'done',done.msg);
 const adjacent={key:x+'/'+y,cx:(b[0]+b[2])/2,cz:(b[1]+b[3])/2,b,lod:2,graph:done.graph,graphVersion:1},liveCity={graphRevision:1,graphTiles:()=>[first,adjacent]},liveRoads=new RoadNetwork(liveCity);
 let joins=0;for(let n=0;n<first.graph.nodes.length/3;n++)joins+=liveRoads.joints(first,n).length;
 assert.ok(joins>0,'actual adjacent OSM tiles connect at their shared boundary');console.log(JSON.stringify({realAdjacentTileConnections:joins}));
}
