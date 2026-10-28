const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/game-bgm.mjs','utf8').replace(/^import .*\n/,'const RECORDINGS={"kosodoro-mine":{url:"music.mp3",title:"track",style:"style"}};\n');
function env(mode='gemini',already=false){
 const events={},nodes={},audi=[];let gesture='';const node=id=>nodes[id]||(nodes[id]={value:'',textContent:'',addEventListener(){},showModal(){},close(){}});
 const root={set innerHTML(v){},getElementById:node,querySelector:()=>node('dialog'),addEventListener(){},append(){}};
 const doc={hidden:false,querySelector:()=>({dataset:{gameBgm:'kosodoro-mine'}}),createElement:()=>({attachShadow:()=>root}),body:{append(){}},addEventListener:(k,f)=>(events[k]??=[]).push(f),dispatchEvent(){}};
 class Audio{constructor(){this.paused=true;this.playCalls=0;this.volume=1;audi.push(this);}play(){this.playCalls++;if(gesture==='pointerdown')return Promise.reject(Error('NotAllowedError'));this.paused=false;return Promise.resolve();}pause(){this.paused=true;}}
 const c={document:doc,Audio,URLSearchParams,location:{search:''},localStorage:{getItem:()=>JSON.stringify({mode,volume:.2}),setItem(){}},navigator:{userActivation:{hasBeenActive:already}},CustomEvent:class{constructor(k){this.type=k;}},console};c.window={addEventListener(){}};vm.runInNewContext(source,c);return {audio:audi[0],nodes,fire:async k=>{gesture=k;(events[k]||[]).forEach(f=>f({}));await Promise.resolve();await Promise.resolve();},c};
}
(async()=>{
 const x=env();assert.equal(x.audio.playCalls,0,'no autoplay before a gesture');await x.fire('pointerdown');assert.equal(x.audio.paused,true,'first Android touch was rejected');await x.fire('pointerup');assert.equal(x.audio.paused,false,'pointerup retries without moving volume');assert.equal(x.audio.volume,.2,'saved volume preserved');
 x.audio.paused=true;await x.fire('click');assert.equal(x.audio.paused,false,'later click retries interruptions');
 const off=env('off');await off.fire('pointerup');assert.equal(off.audio.playCalls,0,'off remains off');const late=env('gemini',true);await Promise.resolve();assert.equal(late.audio.paused,false,'late module uses an earlier start gesture');
 console.log('BGM gesture retry assertions passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
