import {RECORDINGS} from './gemini-catalog.mjs?v=20261023-gemini1';
const script=document.querySelector('script[data-game-bgm]'),game=script?.dataset.gameBgm;
const track=RECORDINGS[game];
if(track && new URLSearchParams(location.search).get('test')!=='1')install(game,track);

function install(game,track){
 const key='gemini.bgm.'+game,nativeGames=new Set(['compile','black-friday','ticket-to-ride','nanafushigi','hashikko-seven','hatatori-nine','noclip','mienai-five','fogsite']);
 let stored={};try{stored=JSON.parse(localStorage.getItem(key)||'{}')||{};}catch{}
 const state={mode:['gemini','original','off'].includes(stored.mode)?stored.mode:'gemini',
  volume:Number.isFinite(stored.volume)?Math.max(0,Math.min(1,stored.volume)):.2};
 let enabled=true,nativeVolume=1,unlocked=false,pending=false,revision=0;
 if(game==='noclip')try{const old=JSON.parse(localStorage.getItem('noclip.v1')||'{}');nativeVolume=(old.vol??.8)*(old.bgm??.7);}catch{}
 const audio=new Audio(track.url);audio.preload='none';audio.loop=true;
 const host=document.createElement('div');host.id='gemini-bgm-controls';
 const root=host.attachShadow({mode:'open'});
 root.innerHTML=`<style>
 :host{position:fixed;right:0;top:44%;z-index:9000;font:14px system-ui,sans-serif;color:#eef4f1}
 button,select,input,a{font:inherit}button,select{cursor:pointer}button{color:inherit;border:1px solid #62777c;background:#20373f;border-radius:10px;padding:10px 14px;min-height:44px}
 #open{font-size:12px;writing-mode:vertical-rl;padding:10px 7px;border-radius:12px 0 0 12px;min-width:30px;box-shadow:0 2px 12px #0005;opacity:.85}
 dialog{box-sizing:border-box;width:min(390px,calc(100vw - 32px));border:1px solid #73858b;border-radius:18px;padding:20px;background:#10272e;color:#eef4f1;box-shadow:0 20px 70px #0007}
 dialog::backdrop{background:#0009}h2{margin:0 0 8px;font-size:22px}p{line-height:1.6;color:#b9ced0}label{display:grid;gap:8px;margin:18px 0}select{width:100%;padding:12px;border-radius:10px;background:#20373f;color:#fff;border:1px solid #62777c}input{width:100%;min-height:32px;accent-color:#e3b04b}
 .top{display:flex;justify-content:space-between;gap:12px;align-items:start}.row{display:flex;gap:8px;flex-wrap:wrap}a{color:#f6d27b}#status{min-height:1.6em;font-size:12px}button:focus-visible,a:focus-visible{outline:3px solid #f6d27b;outline-offset:3px}
 </style><button id="open" aria-label="BGMを選ぶ">♫ BGM</button><dialog aria-labelledby="title"><div class="top"><h2 id="title">BGM</h2><button id="close" aria-label="閉じる">×</button></div><b id="track"></b><p id="style"></p><label>流す曲<select id="mode"><option value="gemini">Gemini製 · 専用BGM</option>${nativeGames.has(game)?'<option value="original">これまでのBGM</option>':''}<option value="off">BGMなし</option></select></label><label>音量 <output id="volumeText"></output><input id="volume" type="range" min="0" max="1" step="0.01" aria-label="BGMの音量"></label><div class="row"><button id="play">再生</button><a id="download">MP3を保存</a></div><p id="status" role="status"></p></dialog>`;
 const $=id=>root.getElementById(id),status=message=>{$('status').textContent=message;};
 $('track').textContent=track.title;$('style').textContent=track.style;
 $('download').href=track.url;$('download').download=track.title+'.mp3';
 $('mode').value=state.mode;$('volume').value=state.volume;
 function save(){try{localStorage.setItem(key,JSON.stringify(state));}catch{}}
 function wanted(){return state.mode==='gemini'&&enabled&&!document.hidden&&state.volume>0&&nativeVolume>0&&unlocked;}
 function volume(){audio.volume=state.volume*nativeVolume;$('volumeText').value=Math.round(state.volume*100)+'%';}
 async function sync(){
  volume();const ticket=++revision;
  if(!wanted()){audio.pause();status(!enabled||nativeVolume===0?'ゲーム側の音設定がオフです':state.mode==='off'?'BGMなし':state.mode==='original'?'これまでのBGMを選択中':'停止中');return;}
  if(!audio.paused||pending)return;
  pending=true;status('読み込み中…');
  try{await audio.play();if(ticket!==revision&&!wanted())audio.pause();status(audio.paused?'停止中':'再生中');}
  catch{status('再生できませんでした。「再生」で再試行できます。');}
  finally{pending=false;}
 }
 function choose(mode){state.mode=mode;save();$('mode').value=mode;document.dispatchEvent(new CustomEvent('gemini-bgm-change'));sync();}
 globalThis.GEMINI_BGM={game,isRecorded:()=>state.mode!=='original',setEnabled(value){value=!!value;if(enabled===value)return;enabled=value;sync();},
  setNativeVolume(value){value=Math.max(0,Math.min(1,Number(value)||0));if(nativeVolume===value)return;nativeVolume=value;sync();},
  chooseOriginal(){choose('original');},mode:()=>state.mode};
 $('open').onclick=e=>{e.stopPropagation();root.querySelector('dialog').showModal();};
 $('close').onclick=()=>root.querySelector('dialog').close();
 $('mode').onchange=e=>choose(e.target.value);
 $('volume').oninput=e=>{state.volume=+e.target.value;save();sync();};
 $('play').onclick=()=>{unlocked=true;if(state.mode!=='gemini')choose('gemini');else sync();};
 // A touch may only grant activation on pointerup. Retry after an earlier rejected play.
 const unlock=()=>{unlocked=true;if(audio.paused)sync();};
 document.addEventListener('pointerdown',unlock,{capture:true,passive:true});document.addEventListener('pointerup',unlock,{capture:true,passive:true});
 document.addEventListener('click',unlock,{capture:true});document.addEventListener('keydown',unlock,{capture:true});
 document.addEventListener('visibilitychange',()=>sync());window.addEventListener('pagehide',()=>{revision++;audio.pause();});window.addEventListener('pageshow',()=>sync());
 root.addEventListener('pointerdown',e=>e.stopPropagation());root.addEventListener('click',e=>e.stopPropagation());root.addEventListener('keydown',e=>e.stopPropagation());root.addEventListener('keyup',e=>e.stopPropagation());
 audio.hidden=true;root.append(audio);document.body.append(host);volume();document.dispatchEvent(new CustomEvent('gemini-bgm-change'));
 if(navigator.userActivation?.hasBeenActive)unlock();
}
