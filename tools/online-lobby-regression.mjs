// npm install --no-save jsdom, or set COMPILE_JSDOM_MODULE to its absolute module path.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), {JSDOM}=require(process.env.COMPILE_JSDOM_MODULE || 'jsdom');
const code=fs.readFileSync(new URL('../assets/online-lobby.js',import.meta.url),'utf8');
const sessions=[];
function client(id) {
  const dom=new JSDOM('<title>COMPILE</title><button id="netHostBtn"><em></em></button><input id="name0" value="Alice"><div id="actionBar"><div class="actions"></div></div>',{url:'https://compile.example',runScripts:'outside-only'});
  const w=dom.window, listeners=new Map(), values={}, timers=new Set();let permission=false, hostOptions, guestOptions, homeCount=0, sfxCount=0, cleaned=0, toast='';
  const dbM={ref:(_,path)=>({path}),query:ref=>ref,orderByChild:()=>'',limitToLast:()=>'',onDisconnect:()=>({remove:async()=>{}}),
    set:async(ref,data)=>{values[ref.path]=data;emit(ref.path,data);}, update:async(ref,data)=>{values[ref.path]={...values[ref.path],...data};},remove:async ref=>{delete values[ref.path];cleaned++;},
    onValue(ref,fn,onError){if(permission){onError?.({code:'PERMISSION_DENIED'});return()=>{};}listeners.set(ref.path,fn);if(ref.path==='matchmaking')fn({val:()=>values.matchmaking||null});return()=>listeners.delete(ref.path);}};
  function emit(path,value){listeners.get(path)?.({val:()=>value,exists:()=>!!value});}
  Object.assign(w,{console,NET:{clientId:id,uid:'uid-'+id,role:0,on:false,pending:{},fb:{dbM,db:{}}},draft:{cardSet:'set2',controlEnabled:true},_nsT:0,G:null,
    CARD_SET_LABELS:{set1:'第1セット',set2:'第2セット',mixed:'混合'},esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
    normalizeCardSet:s=>['set1','set2','mixed'].includes(s)?s:'set1',readControlSetting:()=>true,netValidRoomCode:s=>typeof s==='string'&&/^[A-Z]{7}$/.test(s),netTimed:p=>p,loadFirebase:async()=>w.NET.fb,
    netFriendlyError:e=>e.message||String(e),toast:s=>{toast=s;},netHost:async options=>{hostOptions=options;w.NET.metaRef={path:'rooms/ABCDEFG/meta'};if(!options.onReserved)return;await options.onReserved('ABCDEFG');await new Promise(resolve=>{w.finishHost=resolve;});},
    netJoin:async options=>{guestOptions=options;},netCancelHostRoom:async()=>{w.NET.on=false;},netLobby(){},newGame(){homeCount++;w.G=null;},showNetWait(){},render(){},renderWelcome(){},showModal:async()=>w.modalValue,
    COMPILE_AUDIO:{sfx(){sfxCount++;}}});
  vm.runInContext(code,dom.getInternalVMContext());sessions.push(dom);
  return {w,emit,values,permission:()=>{permission=true;},hostOptions:()=>hostOptions,guestOptions:()=>guestOptions,homeCount:()=>homeCount,sfxCount:()=>sfxCount,cleaned:()=>cleaned,toast:()=>toast};
}
const tick=()=>new Promise(r=>setTimeout(r,10));
const room=(props={})=>({v:1,code:'ABCDEFG',title:'気軽に1戦',hostName:'Bob',hostUid:'uid-other',hostClientId:'other',cardSet:'set2',controlEnabled:true,createdAt:Date.now(),updatedAt:Date.now(),expiresAt:Date.now()+120000,...props});
try {
 const a=client('me');a.values.matchmaking={r:room(),expired:room({expiresAt:1}),bad:room({code:'<bad>'})};a.w.COMPILE_MATCH_BOARD.open();await tick();
 assert.equal(a.w.document.querySelectorAll('.online-room').length,1);assert.equal(a.w.document.querySelector('#onlineCount').textContent,'01');
 a.w.document.querySelector('[data-online="join"]').click();await tick();assert.deepEqual(JSON.parse(JSON.stringify(a.guestOptions())),{name:'Alice',code:'ABCDEFG',cardSet:'set2'});
 a.emit('matchmaking',{x:room({title:'<img src=x onerror=attack>',hostName:'<script>attack</script>'})});assert(!a.w.document.querySelector('.online-room img'));assert(!a.w.document.querySelector('.online-room script'));
 a.emit('matchmaking',{});a.w.document.querySelector('#onlineRoomTitle').value='初心者歓迎';a.w.document.querySelector('[data-online="create"]').click();await tick();
 assert.equal(a.values['matchmaking/me'].title,'初心者歓迎');assert.equal(a.values['matchmaking/me'].cardSet,'set2');assert.equal(a.hostOptions().listed,true);
 a.emit('rooms/ABCDEFG/meta',{guestClientId:'guest'});await tick();assert(!a.values['matchmaking/me'],'listing disappears once a guest joins');a.w.finishHost();await tick();
 a.w.G={turn:1,current:1,winner:null,busy:false,phase:'action'};a.w.NET.on=true;a.w.NET.role=0;a.w.render();assert(!a.w.document.querySelector('#yourTurn'));
 a.w.G={...a.w.G,turn:2,current:0};a.w.render();assert.equal(a.sfxCount(),1);assert.equal(a.w.document.title,'あなたのターンです | COMPILE');assert.equal(a.w.document.querySelector('#yourTurn').hidden,false);
 a.w.G={...a.w.G};a.w.render();assert.equal(a.sfxCount(),1,'repeated network snapshots do not repeat the notification');
 a.w.G={...a.w.G,turn:3,current:1};a.w.render();assert.equal(a.w.document.querySelector('#yourTurn').hidden,true);assert.equal(a.w.document.title,'COMPILE');
 a.w.G={...a.w.G,turn:4,current:0,busy:true};a.w.render();assert.equal(a.sfxCount(),1);a.w.G.busy=false;a.w.render();assert.equal(a.sfxCount(),2);
 a.w.G.winner=0;a.w.G.phase='gameover';a.w.render();assert(a.w.document.querySelector('#matchHome'));assert.equal(a.w.document.title,'COMPILE');
 a.w.modalValue='home';assert.equal(await a.w.showModal({title:'Alice WIN',buttons:[{value:'view'}]}),'view');assert.equal(a.homeCount(),1);assert.equal(a.w.NET.on,false);
 a.w.document.querySelector('[data-online="private"]').click();await tick();assert.equal(a.hostOptions().name,'Alice');assert.equal(a.hostOptions().listed,undefined);
 const b=client('blocked');b.permission();b.w.COMPILE_MATCH_BOARD.open();await tick();assert.match(b.w.document.querySelector('#onlineStatus').textContent,/共有設定が未完了/);assert(b.w.document.querySelector('[data-online="create"]').disabled);assert(!b.w.document.querySelector('.online-empty'),'a denied read must not appear as an empty board');
 console.log('Online board: shared updates, expiration, HTML escaping, room metadata, join, removal, denied access, turn deduplication and home cleanup passed');
}finally{for(const dom of sessions)dom.window.close();}
