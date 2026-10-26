// Build the real Three.js scene with a drawing stub (no GPU), and check the actual physical meshes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),D=require('../quo-vadis/data.js'),E=require('../quo-vadis/engine.js');
const noop=()=>{},gradient={addColorStop:noop};
const ctx=new Proxy({createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,measureText:t=>({width:t.length*20})},{get(o,k){return k in o?o[k]:noop;}});
const canvas=()=>({style:{},width:1,height:1,getContext:()=>ctx,addEventListener:noop,setAttribute:noop,setPointerCapture:noop,getBoundingClientRect:()=>({left:0,top:0,width:1000,height:700})});
const frames=new Map();let frameId=0;
globalThis.window={QV_DATA:D,QV_THREE_URLS:[new URL('../assets/vendor/three-r160.module.min.js',import.meta.url).href],devicePixelRatio:1,addEventListener:noop};
globalThis.document={createElement:canvas};
globalThis.requestAnimationFrame=fn=>{frames.set(++frameId,fn);return frameId;};
const flush=(time=performance.now())=>{const fs=[...frames.values()];frames.clear();fs.forEach(fn=>fn(time));};
const {loadThree,createScene}=await import('../quo-vadis/scene.js');await loadThree();
for(const n of [3,4,5]){
 let graph,camera;const rect={width:1000,height:700};
 const host={appendChild:noop,getBoundingClientRect:()=>rect};
 const renderer={domElement:canvas(),capabilities:{getMaxAnisotropy:()=>1},setPixelRatio:noop,setSize:noop,render(s,c){graph=s;camera=c;}};
 const scene=createScene(host,{renderer}),st=E.newGame({players:D.PLAYER_COLORS.slice(0,n).map((c,i)=>({name:'P'+i,color:c.key})),seed:12,first:0});
 scene.setView(E.viewFor(st,0));flush();
 const pieces=()=>graph.children.filter(x=>x.userData.kind==='senator'&&x.visible);
 assert.equal(pieces().length,n*8,'all senators are actual Three.js objects on the table');
 const expected=D.tableSupply(st,0,scene.orient==='side');
 for(const p of pieces()){
  const e=expected.find(e=>e.sid===p.userData.sid);assert(e);
  assert.deepEqual([p.position.x,p.position.y,p.position.z],[e.at[0],0,e.at[1]]);
  assert(p.children.some(c=>c.isMesh&&c.geometry.type==='LatheGeometry'),'same modeled senator as on the board');
 }
 const first=pieces().find(p=>p.userData.sid===0),from=first.position.clone();
 const r=E.apply(st,0,{t:'place',c:'A1'});const playing=scene.play(r.ev.find(e=>e.e==='place'));
 assert(first.position.distanceTo(from)<1e-9,'placement starts at that physical reserve, without teleporting');
 flush(performance.now()+1500);await playing;scene.setView(E.viewFor(st,0));flush();
 assert.equal(pieces().length,n*8,'one piece is reused, not duplicated or removed');
 assert.equal(pieces().find(p=>p.userData.sid===0),first);
 assert.deepEqual([first.position.x,first.position.z],D.COM.A1.seatXZ[0]);
 const labels=graph.children.filter(x=>x.userData.pick?.kind==='supply'&&x.visible);
 assert.equal(labels.length,n);assert.match(labels.find(x=>x.userData.pick.p===0).userData.text,/×7$/);
 for(const size of [[393,430],[844,360]]){
  rect.width=size[0];rect.height=size[1];scene.resize();flush();
  const exp=D.tableSupply(st,0,scene.orient==='side');
  for(const c of exp){const mesh=pieces().find(p=>p.userData.sid===c.sid);assert.deepEqual([mesh.position.x,mesh.position.z],c.at);const pos=scene.project(mesh.position.x,.8,mesh.position.z);assert(pos[0]>0&&pos[0]<rect.width&&pos[1]>0&&pos[1]<rect.height,'actual 3D reserve stays in view');}
 }
}
console.log('Real Three.js scenes: 3–5 player reserves use the board models, every object is conserved, placement starts at the reserve, count labels update, portrait/landscape camera bounds pass. GPU drawing is not exercised.');
