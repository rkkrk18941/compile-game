import {COLORS, newGame, sequence, canScore, takeAction, cpuAction, deck} from './engine.mjs';
const $=id=>document.getElementById(id), KEY='playroom.eleven.v1';
const symbols={blue:'●',green:'◆',purple:'▲',orange:'■',red:'✦',wild:'○'};
const labels={blue:'青',green:'緑',purple:'紫',orange:'橙',red:'赤',wild:'無色'};
let state=null, selected=[], mode='cpu', sortBy='number', ready=false, timer=null, sound=false, context=null, toastTimer;
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function saved(){try{return JSON.parse(localStorage.getItem(KEY));}catch{return null;}}
function valid(s){
  if(!s||s.version!==1||!Array.isArray(s.players)||s.players.length<2||s.players.length>6||!Number.isInteger(s.turn)||s.turn<0||s.turn>=s.players.length||!['cpu','local'].includes(s.mode))return false;
  try{const all=[...s.pile,...s.discard,s.exchange,...s.players.flatMap(p=>[...p.hand,...p.run,...p.points])];const ref=deck();return all.length===100&&new Set(all.map(c=>c.id)).size===100&&all.every(c=>ref[c.id]?.n===c.n&&ref[c.id]?.color===c.color)&&s.players.every(p=>p.hand.length<=11&&Number.isFinite(p.score))&&(s.winner===null||Number.isInteger(s.winner)&&s.winner>=0&&s.winner<s.players.length);}catch{return false;}
}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{}}
function refreshResume(){$('resume').hidden=!valid(saved());}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
function tone(scoring=false){if(!sound)return;try{context??=new(window.AudioContext||window.webkitAudioContext)();context.resume();[scoring?523:392,...(scoring?[659,784]:[])].forEach((f,i)=>{const o=context.createOscillator(),g=context.createGain(),t=context.currentTime+i*.13;o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.045,t+.01);g.gain.exponentialRampToValueAtTime(.001,t+.19);o.connect(g);g.connect(context.destination);o.start(t);o.stop(t+.2);});}catch{}}
function cardHTML(card,{mini=false,button=false,selected:sel=false,pickable=false,attrs=''}={}){
  const tag=button?'button':'div', n=card.color==='wild'?'10/0':card.n;
  return `<${tag} class="card ${card.color}${mini?' mini':''}${sel?' selected':''}${pickable?' pickable':''}" ${button?`type="button" aria-label="${labels[card.color]} ${n}" ${sel?'aria-pressed="true"':'aria-pressed="false"'}`:''} ${attrs}><span class="corner">${n}</span><span class="num">${n}</span><span class="color-label">${labels[card.color]}</span><span class="symbol" aria-hidden="true">${symbols[card.color]}</span></${tag}>`;
}
function isHuman(){return state&&ready&&state.winner===null&&!state.players[state.turn].cpu;}
function chosen(){return selected.map(id=>state.players[state.turn].hand.find(c=>c.id===id)).filter(Boolean);}
function scoreHTML(){return state.players.map((p,i)=>`<div class="player-score${i===state.turn&&state.winner===null?' current':''}"><div class="player-name">${esc(state.mode==='local'?p.name.replace('プレイヤー','P'):p.name)}${i===state.winner?' ★':''}</div><span class="score-number">${p.score}<small> / 11</small></span><span class="mini-cards">手札 ${p.hand.length}枚</span><div class="progress"><i style="width:${Math.min(100,p.score/11*100)}%"></i></div></div>`).join('');}
function render(){
  const p=state.players[state.turn], human=isHuman(), one=human&&selected.length===1;
  $('modeLabel').textContent=state.mode==='local'?`PASS & PLAY · ${state.players.length} PLAYERS`:`CPU MATCH · ${state.players.length} PLAYERS`;
  $('scoreboard').style.setProperty('--players',state.players.length);$('scoreboard').innerHTML=scoreHTML();
  $('runs').style.setProperty('--players',state.players.length);
  $('runs').innerHTML=state.players.map((other,i)=>`<section class="run-lane"><h3 class="lane-title">${esc(other.name)}${i===state.turn?' · 手番':''}</h3><div class="lane-cards">${other.run.length?other.run.map(c=>cardHTML(c,{mini:true,button:true,pickable:one&&i!==state.turn,attrs:`data-pick="${c.id}" data-player="${i}" ${!one||i===state.turn?'disabled':''}`})).join(''):'<span class="empty-run">場札なし</span>'}</div></section>`).join('');
  $('deckCount').textContent=`${state.pile.length}枚`;$('turnCount').textContent=`TURN ${state.moves+1}`;
  $('drawDeck').disabled=!one;$('drawDeck').classList.toggle('pickable',one);
  $('exchange').innerHTML=cardHTML(state.exchange,{button:true,pickable:one,attrs:`data-exchange ${!one?'disabled':''}`});
  $('handWho').textContent=state.mode==='local'?'CURRENT PLAYER':'YOUR HAND';
  $('handTitle').innerHTML=`${esc(state.mode==='cpu'?'あなた':p.name)}の手札 <small>${state.mode==='cpu'?state.players[0].hand.length:p.hand.length}枚</small>`;
  const visible=state.mode==='cpu'?state.players[0]:p;
  const hand=[...visible.hand].sort((a,b)=>sortBy==='number'?(a.n-b.n||COLORS.indexOf(a.color)-COLORS.indexOf(b.color)):(COLORS.indexOf(a.color)-COLORS.indexOf(b.color)||a.n-b.n));
  $('hand').innerHTML=state.mode==='local'&&!ready?'<p class="status">端末を渡してから手札を開いてください。</p>':hand.map(c=>cardHTML(c,{button:true,selected:selected.includes(c.id),attrs:`data-hand="${c.id}" ${!human?'disabled':''}`})).join('');
  const cards=chosen(), run=sequence(cards), finish=cards.length===p.hand.length&&canScore(cards);
  $('clear').disabled=!human||!selected.length;$('hint').disabled=!human;$('sort').disabled=!ready;
  $('play').disabled=!human||!run||!(cards.length>=2||finish);
  $('play').textContent=finish?'出し切って得点！ →':'連番を出す →';
  if(!human) $('selectionInfo').textContent=state.winner!==null?'ゲーム終了':p.cpu?`${p.name}が考えています`:'手札は非公開です';
  else if(!cards.length) $('selectionInfo').textContent='カードをタップして選択';
  else if(finish) $('selectionInfo').innerHTML='<strong>同色で出し切り！ 得点チャンス</strong>';
  else if(cards.length===1) $('selectionInfo').textContent='1枚選択中 · 山札・交換札・相手の場札をタップ';
  else if(run) $('selectionInfo').innerHTML=`<strong>${run.values.join(' → ')}</strong> · ${run.colors}色なので${run.colors}枚補充（手札 ${p.hand.length-cards.length+run.colors}枚に）`;
  else $('selectionInfo').textContent='数字が続くカードを選んでください。10/0は両端に使用';
  $('status').textContent=state.winner!==null?`${state.players[state.winner].name}の勝利！`:p.cpu?`${p.name}の手番です。あなたの手札を見ながらお待ちください。`:state.mode==='local'?`${p.name}の手番です。連番を出すか、1枚を交換しましょう。`:'あなたの手番です。連番を出すか、1枚を交換しましょう。';
  $('log').innerHTML=state.log.map(message=>`<li>${esc(message)}</li>`).join('');
}
function handoff(){ready=false;render();$('handoffName').textContent=`${state.players[state.turn].name}の番です`;$('handoff').showModal();}
function schedule(){
  clearTimeout(timer);if(!state||state.winner!==null||$('scored').open||$('confirmMenu').open||$('rules').open)return;
  if(state.players[state.turn].cpu){ready=true;render();timer=setTimeout(()=>{if(!document.hidden)execute(cpuAction(state));},900);}
  else if(state.mode==='local')handoff();else{ready=true;render();}
}
function execute(action){
  try{takeAction(state,action);selected=[];ready=false;save();tone(!!state.lastScore);render();
    if(state.lastScore){const score=state.lastScore;$('scoreName').textContent=`${state.players[score.player].name}が出し切り！`;$('scoreGain').innerHTML=`+${score.gained}<small>POINTS</small>`;$('scoreDetails').textContent=`${score.revealed.join(' ＋ ')}点${score.revealed.length>1?'（1のボーナスドロー）':''}。${state.winner!==null?`合計${state.players[score.player].score}点で優勝です！`:`合計${state.players[score.player].score}点。手札を${score.refill}枚補充して続行します。`}`;$('scoreContinue').textContent=state.winner!==null?'もう一度遊ぶ →':'次の手番へ →';$('scored').showModal();}
    else schedule();
  }catch(err){toast(err.message);render();}
}
function openGame(s){clearTimeout(timer);state=s;selected=[];ready=state.mode==='cpu';$('home').hidden=true;$('game').hidden=false;window.scrollTo(0,0);render();if(state.winner!==null){ready=true;render();toast(`${state.players[state.winner].name}が優勝したゲームです`);}else schedule();}
function goHome(){clearTimeout(timer);ready=false;if(state)save();$('game').hidden=true;$('home').hidden=false;refreshResume();window.scrollTo(0,0);}
document.querySelectorAll('.mode').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;document.querySelectorAll('.mode').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',x===b?'true':'false');});$('difficultyLabel').hidden=mode==='local';}));
$('start').onclick=()=>{openGame(newGame({count:Number($('count').value),difficulty:$('difficulty').value,mode}));save();};
$('resume').onclick=()=>{const s=saved();if(valid(s))openGame(s);else toast('保存データを読み込めませんでした');};
$('hand').addEventListener('click',e=>{const b=e.target.closest('[data-hand]');if(!b||!isHuman())return;const id=Number(b.dataset.hand);selected=selected.includes(id)?selected.filter(x=>x!==id):[...selected,id];render();tone();const next=$('hand').querySelector(`[data-hand="${id}"]`);next?.focus({preventScroll:true});});
$('clear').onclick=()=>{selected=[];render();};
$('play').onclick=()=>{if(isHuman())execute({type:'play',ids:[...selected]});};
$('drawDeck').onclick=()=>{if(isHuman()&&selected.length===1)execute({type:'discard',ids:[...selected],source:'deck'});};
$('exchange').onclick=()=>{if(isHuman()&&selected.length===1)execute({type:'exchange',ids:[...selected]});};
$('runs').addEventListener('click',e=>{const b=e.target.closest('[data-pick]');if(!b||b.disabled||!isHuman()||selected.length!==1)return;execute({type:'discard',ids:[...selected],source:'run',player:Number(b.dataset.player),card:Number(b.dataset.pick)});});
$('hint').onclick=()=>{if(!isHuman())return;const action=cpuAction(state,()=>.5);selected=action.ids;render();toast(action.type==='play'?'この連番がおすすめです。確認して「連番を出す」を押してください。':action.type==='exchange'?'このカードを選んで、中央の交換札をタップ。':action.source==='run'?`${state.players[action.player].name}の場札「${labels[state.players[action.player].run.find(c=>c.id===action.card).color]} ${state.players[action.player].run.find(c=>c.id===action.card).n}」をタップ。`:'選んだ1枚を捨てて、山札から補充するのがおすすめです。');};
$('sort').onclick=()=>{sortBy=sortBy==='number'?'color':'number';$('sort').textContent=`並び：${sortBy==='number'?'数字':'色'}順`;render();};
$('reveal').onclick=()=>{$('handoff').close();ready=true;render();};
$('handoff').addEventListener('cancel',e=>e.preventDefault());
$('scoreContinue').onclick=()=>{$('scored').close();if(state.winner!==null)goHome();else schedule();};
$('scored').addEventListener('cancel',e=>e.preventDefault());
$('rulesBtn').onclick=()=>{clearTimeout(timer);$('rules').showModal();};
$('rules').addEventListener('close',()=>{if(state&&!$('game').hidden&&!$('handoff').open&&!$('scored').open){if(state.mode==='local'&&ready)render();else schedule();}});
$('menu').onclick=()=>{clearTimeout(timer);$('confirmMenu').showModal();};
$('confirmMenu').addEventListener('close',()=>{if(!$('game').hidden&&state){if(state.mode==='local'&&ready)render();else schedule();}});
$('goHome').onclick=()=>{goHome();$('confirmMenu').close();};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('sound').onclick=()=>{sound=!sound;$('sound').textContent=`音 ${sound?'ON':'OFF'}`;$('sound').setAttribute('aria-pressed',String(sound));tone();};
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state&&!$('game').hidden&&!$('handoff').open&&!$('scored').open){if(state.players[state.turn].cpu)schedule();}});
refreshResume();
