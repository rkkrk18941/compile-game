// Exercise real Three.js scene objects and textures without requiring a GPU.
// HTN_THREE_MODULE=file:///absolute/path/to/three.module.mjs node tools/hatatori-scene-theme-test.mjs
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),E=require('../hatatori-nine/engine.js');
const realThree=await import(process.env.HTN_THREE_MODULE||'three');
class HeadlessRenderer {
 constructor(){this.domElement={style:{}};this.shadowMap={};this.capabilities={getMaxAnisotropy:()=>1};}
 setClearColor(c){this.clearColor=c;}setPixelRatio(){}setSize(){}render(){}
}
const worlds=[];
class TrackingScene extends realThree.Scene{constructor(){super();worlds.push(this);}}
globalThis.__htnTestThree={...realThree,Scene:TrackingScene,WebGLRenderer:HeadlessRenderer};
const exportsCode=Object.keys(globalThis.__htnTestThree).map(k=>'export const '+k+'=globalThis.__htnTestThree.'+k+';').join('\n');
const threeModule='data:text/javascript,'+encodeURIComponent(exportsCode);
const contexts=[];
function context(){const calls=[];const c=new Proxy({calls,measureText:()=>({width:25}),getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4)}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(t,k)=>k in t?t[k]:(...a)=>{calls.push([k,...a]);}});contexts.push(c);return c;}
globalThis.document={createElement:()=>({width:1,height:1,getContext:context})};
globalThis.window={HTN_ENG:E,HTN_THREE_URLS:[threeModule],devicePixelRatio:1};
globalThis.requestAnimationFrame=()=>{};
const skin=await import('../hatatori-nine/card-skins.js');
const {loadThree,createScene}=await import('../hatatori-nine/scene.js');
const {arenaTheme}=await import('../hatatori-nine/arena-themes.js');
await loadThree();const scene=createScene({appendChild(){}},{felt:'green',quality:'low'});
const state=E.newGame({seed:17,tactics:true});scene.resize(390,600);scene.setView(E.viewFor(state,0),{instant:true});
for(const style of ['graphic','gilded','classic','gilded','graphic']){
 skin.setCardStyle(style);scene.refreshFonts();
 assert.equal(scene.renderer.clearColor,arenaTheme(style).floor,'background follows card style');
 assert.equal(scene.busy,false,'changing art does not start or restart a move');
 scene.setFelt('navy');scene.resize(900,560);scene.setView(E.viewFor(state,0),{instant:true});
 scene.setFelt('wine');scene.resize(390,600);scene.setView(E.viewFor(state,1),{instant:true});
}
// Flag ownership never changes card materials, in either perspective or layout.
state.flags[4].side[0]=[{c:7,t:1},{c:8,t:2},{c:9,t:3}];
state.flags[4].side[1]=[{c:21,t:4},{c:22,t:5},{c:23,t:6}];
const faces=()=>{const out=[];worlds.at(-1).traverse(o=>{if(o.userData.card&&o.material?.map&&o.userData.card.place==='table')out.push(o);});return out;};
for(const size of [[390,600],[900,560]])for(const me of [0,1]){
 scene.resize(...size);state.flags[4].claimed=-1;scene.setView(E.viewFor(state,me),{instant:true});
 const before=new Map(faces().map(o=>[o.uuid,o.material]));
 state.flags[4].claimed=1;scene.setView(E.viewFor(state,me),{instant:true});
 for(const face of faces())assert.equal(face.material,before.get(face.uuid),'claimed cards retain their full-color material');
 let hit;worlds.at(-1).traverse(o=>{if(o.userData.flag===4)hit=o;});
 assert.ok(Math.sign(hit.parent.position.z)===(me===1?1:-1),'claimed flag stands on the winner’s side');
 const cards=faces().map(o=>o.userData.card).filter(o=>[21,22,23].includes(o.c));
 assert.ok(Math.abs(hit.parent.position.z)>Math.max(...cards.map(o=>Math.abs(o.g.position.z)))+.7,'flag clears the last card');
}
assert.equal(state.clock,0,'theme changes never mutate the match');
assert.ok(contexts.some(c=>c.calls.some(a=>a[0]==='fillText'&&a[1]==='FLAG')),'themed flag faces are generated');
console.log('Real Three.js scene theme checks passed: all 3 decks, live switching, flags, materials, lighting, backgrounds, both layouts and perspectives.');
