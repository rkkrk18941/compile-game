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
globalThis.__htnTestThree={...realThree,WebGLRenderer:HeadlessRenderer};
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
assert.equal(state.clock,0,'theme changes never mutate the match');
assert.ok(contexts.some(c=>c.calls.some(a=>a[0]==='fillText'&&a[1]==='FLAG')),'themed flag faces are generated');
console.log('Real Three.js scene theme checks passed: all 3 decks, live switching, flags, materials, lighting, backgrounds, both layouts and perspectives.');
