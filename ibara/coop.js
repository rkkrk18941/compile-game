/* Two-player lobby, authenticated reconnect and responsive cooperative table. */
(function () {
'use strict';
var G=window.IBARA, UI=G.UI, NET=window.IBARA_NET, root=document.getElementById('app');
var SAVE='ibara.coop.run.v1', PREF='ibara.coop.profile.v1';
function initial(){return {open:false,role:null,code:'',link:null,connected:false,core:null,view:null,selected:null,target:null,
  guestToken:null,partner:null,lastSeen:0,heartbeat:null,error:'',message:'',ready:false,resume:false,checkpoint:null,seq:0,remoteSeq:0};}
var U=initial();
function read(k){try{return JSON.parse(localStorage.getItem(k)||'null');}catch(e){return null;}}
var pref=read(PREF)||{name:'',hero:'knight'};
function token(){var a=new Uint32Array(4);crypto.getRandomValues(a);return Array.from(a,function(n){return n.toString(16);}).join('');}
var myToken;try{myToken=sessionStorage.getItem('ibara.coop.token');if(!myToken){myToken=token();sessionStorage.setItem('ibara.coop.token',myToken);}}catch(e){myToken=token();}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function btn(text,action,disabled,extra){return '<button class="btn '+(extra||'ghost')+'" data-co="'+action+'"'+(disabled?' disabled':'')+'>'+text+'</button>';}
function save(data){try{if(data)localStorage.setItem(SAVE,JSON.stringify(data));else localStorage.removeItem(SAVE);}catch(e){} }
function saved(){var s=read(SAVE);return s&&s.v===1&&s.runs&&s.runs.length===2&&s.runs.every(function(r){return G.HEROES[r.hero]&&r.phase==='map';})?s:null;}
function send(m){if(U.link)U.link.send(Object.assign({v:1},m));}
function me(){return U.role==='guest'?1:0;}
function markError(e){U.error=e&&e.message?e.message:'通信できませんでした。部屋コードと接続を確認して、再接続してください。';render();}
function shell(title,body){return '<section class="screen coop-screen"><header class="co-head"><div><small>ONLINE CO-OP · 2 PLAYERS</small><h1>'+title+'</h1></div><div class="co-head-actions">'+btn('設定','settings',false,'ghost small')+btn('退出','leave',false,'ghost small')+'</div></header>'+(U.error?'<p class="co-error" role="alert">'+esc(U.error)+'</p>':'')+body+'</section>';}
function open(){
  U.open=true;U.error='';UI.S.screen='coop';UI.S.combat=null;UI.S.run=null;UI.S.game=null;
  document.body.classList.remove('in-combat','in-tutorial');G.SFX.unlock();G.SFX.music('map');render();
}
function profileHTML(){return '<label>プレイヤー名<input id="co-name" maxlength="12" placeholder="名前を入力" value="'+esc(pref.name)+'" autocomplete="nickname"></label><label>キャラクター<select id="co-hero">'+Object.keys(G.HEROES).map(function(id){return '<option value="'+id+'"'+(pref.hero===id?' selected':'')+'>'+G.HEROES[id].name+'</option>';}).join('')+'</select></label>';}
function lobby(){
  if(!U.role){var cp=saved();return shell('ふたりで塔へ。','<div class="co-lobby"><div class="co-lobby-art">'+G.ART.hero(pref.hero)+'</div><div class="co-lobby-form"><h2>仲間と、同じ冒険に。</h2><p>それぞれのキャラクター・HP・デッキで、同じ敵と戦います。</p>'+profileHTML()+'<div class="co-actions">'+btn('部屋を作る','host',false,'primary')+(cp?btn('協力の続きから部屋を作る','resume',false,'ghost'):'')+'</div><div class="co-join"><label>部屋コード<input id="co-code" maxlength="4" autocapitalize="characters" autocomplete="off" placeholder="例：ABCD"></label>'+btn('参加する','join',false,'primary')+'</div><details><summary>協力モードの遊び方</summary>'+rules()+'</details></div></div>');}
  var status=U.connected?(U.partner?'仲間が参加しました。':'接続しています…'):'仲間の接続を待っています。';
  return shell('冒険の待合室','<div class="co-wait"><p>部屋コード</p><strong class="co-code">'+esc(U.code)+'</strong><div>'+btn('招待リンクをコピー','invite',false,'ghost small')+'</div><p role="status">'+status+'</p>'+(U.partner?'<p>'+esc(pref.name)+' ＋ '+esc(U.partner.name)+'</p>':'')+'<p>'+esc(U.message)+'</p>'+(U.role==='host'?btn(U.resume?'2人で冒険を再開':'2人で冒険を始める','start',!U.connected||!U.partner,'primary'): '<p>部屋を作った人が開始すると、冒険に参加します。</p>')+(!U.connected&&U.role==='guest'?btn('再接続','reconnect',false):'')+'<details><summary>協力モードのルール</summary>'+rules()+'</details></div>');
}
function rules(){return '<div class="co-rules"><p>2人が別々のキャラクターを操作します。同じキャラクターでも参加できます。</p><p>戦闘は交互のターン制。ターンを終えると敵がその人を攻撃し、仲間に交代します。敵のHPは通常の1.7倍で、毒・怯みなどの状態は2人で共有します。</p><p>「援護」はエナジー1で、仲間の次のターンの盾を3増やします。1ターンに1回。片方が倒れても仲間が勝てばHP1で復帰します。</p><p>進路係は部屋ごとに交代。もう1人も行きたい部屋に提案を出せます。カード報酬・買い物・焚き火はそれぞれ選びます。協力モードは祝福なしで開始します。</p><p>協力の記録は1人用と別に、2人の端末に保存されます。通信切断は同じ部屋へ再接続できます。部屋を閉じたり画面を再読み込みした場合は、「協力の続きから部屋を作る」で最後の部屋に入る前から再開します。ホストが画面を閉じると通信は終了します。</p></div>';}
function hydrate(p){if(!p.combat)return null;var c=Object.assign(Object.create(G.Combat.prototype),p.combat);c.run=p.run;c.g=new G.Game(p.run,{emit:function(){},choose:function(){}});c.H=G.HEROES[p.run.hero];return c;}
function card(c,combat,attr){return UI.cardHTML(c,{combat:combat,attr:attr||''});}
function partyHTML(v){return '<div class="co-party">'+v.players.map(function(p,i){var c=p.combat,h=c?c.hero:p.run;return '<article class="co-player '+(v.phase==='combat'&&v.active===i?'active':'')+(h.hp<=0?' down':'')+'"><div class="co-portrait">'+G.ART.hero(p.run.hero)+'</div><div><small>'+(i===me()?'あなた':'仲間')+' · '+G.HEROES[p.run.hero].name+'</small><b>'+esc(p.name)+'</b><span>HP '+Math.max(0,h.hp)+' / '+h.maxHp+(c?' · 盾 '+h.block+' · 闘気 '+h.str:' · 金貨 '+p.run.gold)+'</span>'+(c?'<span class="co-hero-status">'+(h.weak?'怯み'+h.weak+' ':'')+(h.vuln?'隙'+h.vuln+' ':'')+(h.stance&&h.stance!=='none'?({calm:'凪の構え',wrath:'烈の構え',divine:'神の構え'}[h.stance]||h.stance)+' ':'')+(h.orbs.length?'核 '+h.orbs.map(function(o){return {spark:'雷',frost:'氷',void:'冥'}[o];}).join('・'):'')+'</span>':'')+(c&&c.hero.hp<=0?'<em>戦闘不能 · 仲間の勝利で復帰</em>':'')+'</div></article>';}).join('')+'</div>';}
var ROOM_NAME={start:'最初の戦闘',enc:'戦闘',elite:'強敵',boss:'ボス',event:'異聞',rest:'焚き火',shop:'行商人',treasure:'宝箱'},ROOM_ICON={start:'⚔',enc:'⚔',elite:'◆',boss:'♛',event:'？',rest:'♨',shop:'◈',treasure:'▣'};
function mapHTML(v){var map=v.players[0].run.map,visited=v.players[0].run.visited,leader=v.leader===me();return '<div class="co-map-intro"><small>第一層 · '+v.players[0].run.stats.floors+'部屋を踏破</small><h2>次は、どちらへ？</h2><p>進路係：'+esc(v.players[v.leader].name)+'。'+(leader?'仲間の提案を見て、行き先を決めてください。':'行きたい部屋を押すと仲間へ提案できます。')+'</p></div><div class="co-map-path">'+map.nodes.filter(function(n){return v.reachable.indexOf(n.id)>=0;}).sort(function(a,b){return a.row-b.row;}).map(function(n){var reachable=v.reachable.indexOf(n.id)>=0,done=visited.indexOf(n.id)>=0;return '<button class="co-node '+(reachable?'reachable':'')+(done?' visited':'')+'" data-node="'+esc(n.id)+'" '+(!reachable||v.busy?'disabled':'')+'><span>'+ROOM_ICON[n.kind]+'</span><small>'+n.row+'階</small><b>'+ROOM_NAME[n.kind]+'</b>'+(v.votes[1-me()]===n.id?'<em>仲間の提案</em>':'')+(v.votes[me()]===n.id?'<em>あなたの提案</em>':'')+'</button>';}).join('')+'</div><details class="co-fullmap"><summary>塔全体の地図を見る</summary><div class="co-fullmap-scroll">'+UI.mapHTML(false).replace(/data-node=/g,'disabled data-overview-node=')+'</div></details><p class="co-map-hint">道でつながる、次の候補だけを表示しています。</p>';}
function battleHTML(v){var p=v.players[me()],c=hydrate(p),active=hydrate(v.players[v.active]),can=v.active===me()&&!v.busy&&U.connected&&c.phase==='player'&&!c.over;
  if(U.target&&!active.byUid(U.target)?.alive)U.target=null;
  var enemies=active.alive(),target=U.target||enemies[0]?.uid;
  var selected=c.hand.find(function(x){return x.uid===U.selected;});if(!selected)U.selected=null;
  return '<div class="co-battle '+(v.room.kind==='boss'?'boss':'')+'"><div class="co-battle-top"><div><small>TEAM TURN '+v.turn+' · 出目 '+active.die+'</small><h2>'+(v.active===me()?'あなたのターン':esc(v.players[v.active].name)+'のターン')+'</h2></div><b class="co-energy">'+c.hero.energy+'<small> ENERGY</small></b></div><div class="co-enemies">'+enemies.map(function(e){var act=active.actionOf(e),damage=act.fx.filter(function(op){return op[0]==='atk';}).reduce(function(n,op){return n+active.previewEnemyHit(e,op[1])*(op[2]||1);},0);return '<button class="co-enemy '+(target===e.uid?'target':'')+'" data-target="'+esc(e.uid)+'"><div class="co-intent">'+esc(act.name)+(damage?' · 攻撃 '+damage:'')+'</div><div class="co-enemy-art">'+G.ART.enemy(G.ENEMIES[e.id].art||e.id)+'</div><b>'+esc(e.name)+'</b><span>HP '+Math.max(0,e.hp)+' / '+e.maxHp+' · 盾 '+e.block+'</span><small>'+[['str','闘気'],['weak','怯み'],['vuln','隙'],['poison','毒']].filter(function(x){return e[x[0]];}).map(function(x){return x[1]+e[x[0]];}).join(' / ')+'</small></button>';}).join('')+'</div><p class="co-target-hint">'+(v.active===me()?'敵を押して攻撃対象を選択。カードを押すと詳細を確認して使えます。':'仲間のプレイを見守っています。敵やカードの詳細は確認できます。')+'</p></div><div class="co-hand">'+c.hand.map(function(x){return '<button class="co-card '+(can&&c.canPlay(x)?'playable':'')+'" data-card="'+x.uid+'" aria-label="'+esc(G.CARDS[x.id].name)+'の詳細">'+card(x,c)+'</button>';}).join('')+'</div><div class="co-battle-actions">'+btn('ターン終了','end',!can,'primary')+btn('援護 · 1エナジー','support',!can||c.hero.energy<1||c.t.coopSupport||v.players[1-me()].combat.hero.hp<=0,'ghost')+(c.hero.shiv?btn('投げ針 ×'+c.hero.shiv,'shiv',!can):'')+(c.hero.miracle?btn('祈り ×'+c.hero.miracle,'miracle',!can):'')+'</div><p class="co-piles">山札 '+c.draw.length+' · 捨て札 '+c.discard.length+' · 消滅 '+c.exhaust.length+'<span>援護：仲間の次のターンに盾＋3</span></p><div class="co-items">'+p.run.relics.map(function(id){var r=G.RELICS[id];return '<button data-co-relic="'+id+'">'+G.ART.relic(id)+'<span>'+esc(r.name)+'</span></button>';}).join('')+p.run.potions.map(function(id,i){return '<button data-co-potion="'+i+'">'+G.ART.potion(id)+'<span>'+esc(G.POTIONS[id].name)+'</span></button>';}).join('')+'</div>';
}
function promptHTML(q,v){if(!q)return '';var t=q.type,owner=q.owner,can=owner===me(),title=q.prompt||({reward:'報酬のカードを選ぶ',relic:'秘宝を受け取る',potion:'秘薬を受け取る',deck:'カードを選ぶ',die:'出目を調整',roll:'出目を調整',bossRelic:'ボス秘宝を選ぶ',orb:'核を選ぶ'}[t]||'カードを選ぶ');
  var inside='';
  if(['hand','pile','deck','scry'].indexOf(t)>=0){var min=t==='deck'||t==='scry'?0:q.min==null?q.n:q.min;inside='<p>'+min+'〜'+(t==='scry'?q.cards.length:q.n)+'枚選び、「決定」を押してください。</p><div class="co-choice-cards">'+q.cards.map(function(c){return '<label class="co-choice-card"><input type="checkbox" value="'+c.uid+'" name="co-pick">'+card(c,null)+'</label>';}).join('')+'</div>'+btn('決定','answer-cards',!can,'primary');}
  else if(t==='option')inside=(q.cards?'<div class="co-choice-cards">'+q.cards.map(function(c){return card(c,null);}).join('')+'</div>':'')+q.options.map(function(op,i){return '<button class="event-opt" data-answer-index="'+i+'"><b>'+esc(op.label)+'</b></button>';}).join('');
  else if(t==='reward')inside='<div class="co-choice-cards">'+q.options.map(function(o,i){return '<button class="co-card" data-answer-number="'+i+'">'+card({id:o.id,up:!!q.up},null)+'</button>';}).join('')+'</div><button class="btn ghost" data-answer-number="-1">スキップ</button>';
  else if(t==='relic'||t==='potion'){var d=t==='relic'?G.RELICS[q.id]:G.POTIONS[q.id];inside='<div class="co-reveal">'+(t==='relic'?G.ART.relic(q.id):G.ART.potion(q.id))+'<h3>'+esc(d.name)+'</h3><p>'+esc(d.text)+'</p></div>'+(!q.full?'<button class="btn primary" data-answer-bool="true">受け取る</button>':v.players[me()].run.potions.map(function(id,i){return '<button class="btn ghost" data-answer-number="'+i+'">'+G.POTIONS[id].name+'と交換</button>';}).join(''))+'<button class="btn ghost" data-answer-bool="false">受け取らない</button>';}
  else if(t==='bossRelic')inside=q.options.map(function(id,i){return '<button class="event-opt" data-answer-number="'+i+'">'+G.ART.relic(id)+'<b>'+G.RELICS[id].name+'</b><p>'+esc(G.RELICS[id].text)+'</p></button>';}).join('');
  else if(t==='orb')inside=q.orbs.map(function(o,i){return '<button class="btn ghost" data-answer-number="'+i+'">'+G.ART.orb(o)+({spark:'雷核',frost:'氷核',void:'冥核'}[o])+'</button>';}).join('');
  else if(t==='die'||t==='roll'){var steps=U.dieKey===q.key?U.dieSteps:[];U.dieKey=q.key;U.dieSteps=steps;var value=q.value;steps.forEach(function(s){value=s.delta?value+s.delta:7-value;});inside='<p>現在の出目：<strong>'+value+'</strong></p>'+q.mods.filter(function(m){return !steps.some(function(s){return s.id===m.id;});}).map(function(m){if(m.kind==='pm1')return [-1,1].filter(function(d){return value+d>=1&&value+d<=6;}).map(function(d){return '<button class="btn ghost" data-die-id="'+m.id+'" data-delta="'+d+'">'+esc(m.name)+' '+(d>0?'+':'')+d+'</button>';}).join('');return '<button class="btn ghost" data-die-id="'+m.id+'">'+esc(m.name)+' 裏返す</button>';}).join('')+btn('この出目で進む','answer-die',false,'primary');}
  return '<section class="co-prompt" data-prompt="'+q.key+'"><small>あなたの選択</small><h2>'+esc(title)+'</h2>'+inside+'</section>';
}
function render(){
  if(!U.open)return;
  var v=U.view;
  if(!v){root.innerHTML=lobby();return;}
  var p=v.players[me()];UI.S.run=p.run;UI.S.game=new G.Game(p.run,UI.io);UI.S.combat=hydrate(p);UI.S.screen='coop';
  var content=partyHTML(v)+'<div class="co-status"><span>部屋 '+esc(U.code)+' · '+(U.connected?'接続中':'接続待ち')+'</span>'+btn('デッキ','deck',false,'ghost small')+btn('用語・効果','glossary',false,'ghost small')+'</div>';
  if(!U.connected)content+='<div class="co-disconnected" role="alert"><b>仲間との通信が途切れました。</b><p>冒険はこの部屋に保持しています。仲間が戻るまで操作を停止しています。</p>'+(U.role==='guest'?btn('同じ部屋へ再接続','reconnect',false,'primary'):'<p>仲間は同じ部屋コードで再参加できます。</p>')+'</div>';
  if(v.phase==='map')content+=mapHTML(v);
  else if(v.phase==='combat')content+=battleHTML(v);
  else if(v.phase==='victory'||v.phase==='defeat')content+='<div class="co-result"><h2>'+(v.phase==='victory'?'2人で第一層 踏破！':'2人の冒険は、ここまで。')+'</h2><p>'+v.players.map(function(x){return esc(x.name);}).join(' ＆ ')+'</p>'+(U.role==='host'?btn('待合室へ戻る','lobby',false,'primary'):'<p>部屋を作った人が待合室へ戻るまでお待ちください。</p>')+'</div>';
  else content+='<div class="co-room"><h2>'+({rewards:'戦利品',room:ROOM_NAME[v.room?.type]||'部屋'}[v.phase]||'冒険中')+'</h2><p>2人がそれぞれの選択を終えると、冒険が進みます。</p></div>';
  if(U.connected&&v.prompts[me()])content+=promptHTML(v.prompts[me()],v);
  if(v.prompts[1-me()])content+='<p class="co-partner-choosing" role="status">'+esc(v.players[1-me()].name)+'が選んでいます。</p>';
  if(v.busy&&!v.prompts[me()])content+='<p class="co-processing" role="status">'+(v.prompts[1-me()]?'仲間の選択を待っています。':'行動を処理しています…')+'</p>';
  content+='<details class="co-log"><summary>直近の出来事</summary><ol>'+v.log.slice().reverse().map(function(s){return '<li>'+esc(s)+'</li>';}).join('')+'</ol></details>';
  root.innerHTML=shell('ふたりの冒険',content);
  G.SFX.music(v.phase==='combat'?(v.room.kind==='boss'?'boss':'combat'):'map');
}
function profile(){var name=root.querySelector('#co-name'),hero=root.querySelector('#co-hero');pref.name=NET.cleanName(name?name.value:pref.name)||'冒険者';pref.hero=hero?hero.value:pref.hero;try{localStorage.setItem(PREF,JSON.stringify(pref));}catch(e){} }
function disconnect(){U.connected=false;U.ready=false;U.lastSeen=0;render();}
function bind(link){
  link.on('close',disconnect);
  link.on('peer',function(){U.lastSeen=Date.now();});
  link.on('msg',function(m){
    if(!U.open||!m||m.v!==1)return;
    U.lastSeen=Date.now();
    if(m.k==='ping'){send({k:'pong'});return;}
    if(m.k==='pong'){if(U.ready&&!U.connected){U.connected=true;render();}return;}
    if(m.k==='hello'&&U.role==='host'){
      if(typeof m.token!=='string'||m.token.length<16||m.token.length>100)return;
      if(U.guestToken&&U.guestToken!==m.token){send({k:'error',text:'この部屋は冒険中です。参加した端末から再接続してください。'});var old=link.conn;setTimeout(function(){if(old)old.close();},300);return;}
      U.guestToken=m.token;U.partner={name:NET.cleanName(m.name)||'仲間',hero:G.HEROES[m.hero]?m.hero:'huntress'};U.connected=true;U.ready=true;U.remoteSeq=0;
      send({k:'welcome',name:pref.name,hero:pref.hero});if(U.core)send({k:'state',state:U.core.snapshot()});render();return;
    }
    if(m.k==='welcome'&&U.role==='guest'){U.partner={name:m.name,hero:m.hero};U.ready=true;U.connected=true;U.error='';render();return;}
    if(m.k==='state'&&U.role==='guest'&&U.ready){if(!m.state||m.state.v!==1||!m.state.players||m.state.players.length!==2)return;U.view=m.state;if(U.view.phase==='map')save({v:1,leader:1-U.view.leader,names:[U.view.players[1].name,U.view.players[0].name],runs:[U.view.players[1].run,U.view.players[0].run]});if(U.view.result)save(null);render();return;}
    if(m.k==='action'&&U.role==='host'&&U.ready&&Number.isSafeInteger(m.seq)&&m.seq>U.remoteSeq){U.remoteSeq=m.seq;act(1,m.action);return;}
    if(m.k==='lobby'&&U.role==='guest'){U.view=null;render();return;}
    if(m.k==='error'){U.error=String(m.text||'接続を確認してください。');render();}
  });
  clearInterval(U.heartbeat);U.heartbeat=setInterval(function(){if(!U.open||!U.role)return;if(U.ready&&U.lastSeen&&Date.now()-U.lastSeen>18000){U.connected=false;if(U.role==='host'&&U.link?.conn){U.link.conn.close();U.link.conn=null;}render();}send({k:'ping'});},4000);
}
async function connect(role,code,resume){
  profile();U.error='';U.message='接続を準備しています…';
  if(U.link)U.link.close();U.connected=false;U.ready=false;U.role=role;U.code=code||NET.makeCode();U.resume=!!resume;U.checkpoint=resume?saved():null;
  if(U.checkpoint)pref.hero=U.checkpoint.runs[0].hero;
  var kind=new URLSearchParams(location.search).get('net')==='local'?'local':'peer';
  var link=U.link=NET.makeLink(kind);bind(link);render();
  try{if(role==='host'){await link.host(U.code);U.message='コードか招待リンクを仲間に伝えてください。';}
  else{await link.join(U.code);send({k:'hello',token:myToken,name:pref.name,hero:pref.hero});U.message='部屋に参加しています…';}render();}
  catch(e){if(U.link===link){link.close();U.message='';U.error=e&&e.code==='taken'?'このコードは使用中です。退出して作り直してください。':'接続できませんでした。コード・通信環境を確認して、再接続してください。';render();}}
}
function makeCore(){
  var cp=U.checkpoint,players=[{name:pref.name,hero:cp?cp.runs[0].hero:pref.hero},{name:U.partner.name,hero:cp?cp.runs[1].hero:U.partner.hero}];
  U.core=new G.CoopCore(players,Date.now()>>>0,{update:function(v){U.view=v;send({k:'state',state:v});render();},save:save,
    effect:async function(type){var sounds={play:'card',enemyDamage:'hit',heroDamage:'hurt',heal:'heal',enemyDeath:'burn',die:'dieland'};if(sounds[type])G.SFX.play(sounds[type]);if(['play','enemyDamage','heroDamage','enemyAct'].indexOf(type)>=0)await new Promise(function(r){setTimeout(r,180);});}},cp);
  U.core.begin();
}
async function act(owner,a){if(!U.connected){render();return;}try{await U.core.dispatch(owner,a);}catch(e){if(U.core&&!U.core.closed){if(owner===1)send({k:'error',text:e.message});else U.error=e.message;U.core.publish();}}}
function command(a){if(!U.connected||!U.view)return;U.error='';a.rev=U.view.rev;if(U.role==='host')act(0,a);else{send({k:'action',seq:++U.seq,action:a});}}
function answer(value){var q=U.view?.prompts[me()];if(q)command({type:'answer',key:q.key,value:value});}
function inspect(c,combat,can){
  var d=G.CARDS[c.id],target=U.target||(combat&&combat.alive()[0]?.uid);
  var html='<div class="co-inspect">'+card(c,combat)+'<p>'+esc(G.card.isUp(c)&&d.tu?d.tu:d.t).replace(/\{(\w+)\}/g,function(_,k){return G.card.val(c,k);})+'</p></div>';
  var m=UI.modal({title:esc(d.name),body:html,foot:can?'<button class="btn primary" data-co-play>使う'+(d.target==='enemy'&&target?' → '+esc(combat.byUid(target).name):'')+'</button>':''});
  var b=m.el.querySelector('[data-co-play]');if(b)b.onclick=function(){m.close();command({type:'play',uid:c.uid,target:target});};
}
root.addEventListener('click',async function(e){
  if(!U.open)return;
  var b=e.target.closest('button');if(!b||b.disabled)return;G.SFX.unlock();
  var action=b.dataset.co,v=U.view,p=v?.players[me()],c=p?hydrate(p):null,can=!!(v&&U.connected&&!v.busy&&v.active===me()&&v.phase==='combat'&&c?.phase==='player'&&!c.over);
  if(b.dataset.node){if(v.leader===me()){
    var n=v.players[0].run.map.nodes.find(function(x){return x.id===b.dataset.node;});var ok=await UI.confirmBox('進路を決定',ROOM_NAME[n.kind]+'（'+n.row+'階）へ2人で進みますか？','ここへ進む');if(ok)command({type:'enter',node:n.id});
  }else command({type:'vote',node:b.dataset.node});return;}
  if(b.dataset.target){U.target=b.dataset.target;render();return;}
  if(b.dataset.card){var cc=c.hand.find(function(x){return x.uid===+b.dataset.card;});if(cc)inspect(cc,c,can&&c.canPlay(cc));return;}
  if(b.dataset.answerIndex!=null){answer(v.prompts[me()].options[+b.dataset.answerIndex].id);return;}
  if(b.dataset.answerNumber!=null){answer(+b.dataset.answerNumber);return;}
  if(b.dataset.answerBool!=null){answer(b.dataset.answerBool==='true');return;}
  if(b.dataset.dieId){U.dieSteps.push({id:b.dataset.dieId,delta:b.dataset.delta?+b.dataset.delta:undefined});render();return;}
  if(b.dataset.coRelic){var id=b.dataset.coRelic,r=G.RELICS[id];var m=UI.modal({title:esc(r.name),body:'<p>'+esc(r.text)+'</p>',foot:can&&r.active&&!c.flags['used_'+id]?'<button class="btn primary" data-use-relic>使う</button>':''});var rb=m.el.querySelector('[data-use-relic]');if(rb)rb.onclick=function(){m.close();command({type:'relic',id:id});};return;}
  if(b.dataset.coPotion!=null){var i=+b.dataset.coPotion,pot=G.POTIONS[p.run.potions[i]];var pm=UI.modal({title:esc(pot.name),body:'<p>'+esc(pot.text)+'</p>',foot:can&&pot.use&&!pot.passive?'<button class="btn primary" data-use-potion>使う</button>':''});var pb=pm.el.querySelector('[data-use-potion]');if(pb)pb.onclick=function(){pm.close();command({type:'potion',index:i,target:U.target||c.alive()[0]?.uid});};return;}
  if(!action)return;
  if(action==='settings')UI.showSettings();
  else if(action==='glossary')UI.showGlossary();
  else if(action==='leave'){if(U.role&&!await UI.confirmBox('協力モードを退出','通信を終了してタイトルに戻ります。続きは最後の部屋に入る前から再開できます。','退出する'))return;leave();}
  else if(action==='host'||action==='resume')connect('host',null,action==='resume');
  else if(action==='join'){var code=NET.cleanCode(root.querySelector('#co-code').value);if(code.length!==4){U.error='部屋コードを4文字で入力してください。';return render();}connect('guest',code,false);}
  else if(action==='start'&&U.role==='host'&&U.connected&&!U.core)makeCore();
  else if(action==='reconnect'){if(U.role==='guest')connect('guest',U.code,false);}
  else if(action==='invite'){try{var url=new URL(location.href);url.searchParams.delete('net');url.searchParams.set('coop',U.code);await navigator.clipboard.writeText(url.href);U.message='招待リンクをコピーしました。';}catch(err){U.message='部屋コード '+U.code+' を仲間に伝えてください。';}render();}
  else if(action==='answer-cards')answer(Array.from(root.querySelectorAll('input[name="co-pick"]:checked'),function(x){return +x.value;}));
  else if(action==='answer-die')answer({steps:U.dieSteps});
  else if(['end','support','shiv','miracle'].indexOf(action)>=0)command({type:action,target:U.target||c?.alive()[0]?.uid});
  else if(action==='deck')UI.showDeck(p.run.deck,'あなたのデッキ（'+p.run.deck.length+'枚）');
  else if(action==='lobby'){if(U.core)U.core.close();U.core=null;U.view=null;U.checkpoint=null;U.resume=false;send({k:'lobby'});render();}
});
function leave(){if(U.core)U.core.close();if(U.link)U.link.close();clearInterval(U.heartbeat);U=initial();UI.S.combat=null;UI.titleScreen();}
window.addEventListener('pagehide',function(){if(U.link)U.link.close();});
G.COOP={open:open};
var invite=new URLSearchParams(location.search).get('coop');if(invite){open();var input=root.querySelector('#co-code');if(input)input.value=NET.cleanCode(invite);}
})();
