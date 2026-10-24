/* Two-to-six-player lobby, authenticated reconnect and responsive cooperative table. */
(function () {
'use strict';
var G=window.IBARA, UI=G.UI, NET=window.IBARA_NET, root=document.getElementById('app');
var SAVE='ibara.coop.run.v1', PREF='ibara.coop.profile.v1';
function initial(){return {open:false,role:null,code:'',link:null,connected:false,core:null,view:null,selected:null,target:null,room:null,roster:[],seat:0,seen:{},lastSeen:0,heartbeat:null,error:'',message:'',ready:false,resume:false,checkpoint:null,seq:0};}
var U=initial();
function read(k){try{return JSON.parse(localStorage.getItem(k)||'null');}catch(e){return null;}}
var pref=read(PREF)||{name:'',hero:'knight'};
function token(){var a=new Uint32Array(4);crypto.getRandomValues(a);return Array.from(a,function(n){return n.toString(16);}).join('');}
var myToken;try{myToken=sessionStorage.getItem('ibara.coop.token');if(!myToken){myToken=token();sessionStorage.setItem('ibara.coop.token',myToken);}}catch(e){myToken=token();}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function btn(text,action,disabled,extra){return '<button class="btn '+(extra||'ghost')+'" data-co="'+action+'"'+(disabled?' disabled':'')+'>'+text+'</button>';}
function save(data){try{if(data)localStorage.setItem(SAVE,JSON.stringify(data));else localStorage.removeItem(SAVE);}catch(e){} }
function saved(){var s=read(SAVE);return s&&s.v===1&&s.runs&&s.runs.length>=2&&s.runs.length<=6&&s.runs.every(function(r){return G.HEROES[r.hero]&&r.phase==='map';})?s:null;}
function send(m,cid){if(!U.link)return;var packet=Object.assign({v:2},m);if(U.role==='host'&&U.room&&cid==null)U.room.broadcast(packet);else U.link.send(packet,cid);}
function me(){return U.role==='guest'?U.seat:0;}
function markError(e){U.error=e&&e.message?e.message:'通信できませんでした。部屋コードと接続を確認して、再接続してください。';render();}
function shell(title,body){return '<section class="screen coop-screen"><header class="co-head"><div><small>ONLINE CO-OP · 2–6 PLAYERS</small><h1>'+title+'</h1></div><div class="co-head-actions">'+btn('設定','settings',false,'ghost small')+btn('退出','leave',false,'ghost small')+'</div></header>'+(U.error?'<p class="co-error" role="alert">'+esc(U.error)+'</p>':'')+body+'</section>';}
function open(){
  U.open=true;U.error='';UI.S.screen='coop';UI.S.combat=null;UI.S.run=null;UI.S.game=null;
  document.body.classList.remove('in-combat','in-tutorial');G.SFX.unlock();G.SFX.music('map');render();
}
function profileHTML(){return '<label>プレイヤー名<input id="co-name" maxlength="12" placeholder="名前を入力" value="'+esc(pref.name)+'" autocomplete="nickname"></label><label>キャラクター<select id="co-hero">'+Object.keys(G.HEROES).map(function(id){return '<option value="'+id+'"'+(pref.hero===id?' selected':'')+'>'+G.HEROES[id].name+'</option>';}).join('')+'</select></label>';}
function lobby(){
  if(!U.role){var cp=saved();return shell('仲間と、塔へ。','<div class="co-lobby"><div class="co-lobby-art">'+G.ART.hero(pref.hero)+'</div><div class="co-lobby-form"><h2>仲間と、同じ冒険に。</h2><p>それぞれのキャラクター・HP・デッキで、同じ敵と戦います。</p>'+profileHTML()+'<div class="co-actions">'+btn('部屋を作る','host',false,'primary')+(cp?btn('協力の続きから部屋を作る','resume',false,'ghost'):'')+'</div><div class="co-join"><label>部屋コード<input id="co-code" maxlength="4" autocapitalize="characters" autocomplete="off" placeholder="例：ABCD"></label>'+btn('参加する','join',false,'primary')+'</div><details><summary>協力モードの遊び方</summary>'+rules()+'</details></div></div>');}
  var roster=U.roster,online=roster.filter(function(p){return p.online;}).length;
  var members='<ul class="co-roster">'+roster.map(function(p,i){return '<li class="'+(p.online?'online':'offline')+'"><span>'+esc(p.name)+(i===me()?'（あなた）':'')+'</span><small>'+esc(G.HEROES[p.hero].name)+' · '+(p.online?'参加済み':'再接続待ち')+'</small>'+(U.role==='host'&&i>0&&!U.resume?'<button class="btn ghost small" data-remove-seat="'+i+'">外す</button>':'')+'</li>';}).join('')+'</ul>';
  return shell('冒険の待合室','<div class="co-wait"><p>部屋コード</p><strong class="co-code">'+esc(U.code)+'</strong><div>'+btn('招待リンクをコピー','invite',false,'ghost small')+'</div><p role="status">'+online+'人が接続中 / 最大6人'+(U.resume?' · 保存された'+roster.length+'人がそろうと再開できます。':' · 2人から開始できます。')+'</p>'+members+'<p>'+esc(U.message)+'</p>'+(U.role==='host'?btn(U.resume?roster.length+'人で冒険を再開':roster.length+'人で冒険を始める','start',!U.connected,'primary'):'<p>ホストが開始すると、冒険に参加します。</p>')+(!U.ready&&U.role==='guest'?btn('再接続','reconnect',false):'')+'<details><summary>協力モードのルール</summary>'+rules()+'</details></div>');
}

function rules(){return '<div class="co-rules"><p>2〜6人がそれぞれのキャラクター・HP・デッキで冒険します。同じキャラクターでも参加できます。開始前に全員が集まってからホストが開始してください。</p><p>参加順にターンが回ります。ターン終了後、敵は行動した人を攻撃します。敵HPは人数で調整（2人1.7倍、3人2.4倍、4人3.1倍、5人3.8倍、6人4.5倍）。敵の毒・怯みなどは全員で共有します。</p><p>援護は1ターンに1回、エナジー1で選んだ仲間の次のターンに盾＋3。倒れた仲間のターンは飛ばし、残った人が勝てばHP1で復帰します。全員が倒れると敗北です。</p><p>進路係は部屋ごとに順番で交代。他の人は行きたい部屋を提案できます。報酬・焚き火・買い物は各自で選択。協力モードは祝福なしで開始します。</p><p>通信が切れた人は同じ端末から同じ部屋へ再参加できます。冒険中の新規参加はできません。通信待ちの間は全員の操作を停止します。</p><p>記録は1人用と別に全員の端末へ保存します。ホストが閉じた場合は「協力の続きから部屋を作る」で、同じ人数が最後の部屋に入る前から再開できます。</p></div>';}

function hydrate(p){if(!p.combat)return null;var c=Object.assign(Object.create(G.Combat.prototype),p.combat);c.run=p.run;c.g=new G.Game(p.run,{emit:function(){},choose:function(){}});c.H=G.HEROES[p.run.hero];return c;}
function card(c,combat,attr){return UI.cardHTML(c,{combat:combat,attr:attr||''});}
function partyHTML(v){return '<div class="co-party co-party-n'+v.players.length+'">'+v.players.map(function(p,i){var c=p.combat,h=c?c.hero:p.run;return '<article class="co-player '+(v.phase==='combat'&&v.active===i?'active':'')+(h.hp<=0?' down':'')+'"><div class="co-portrait">'+G.ART.hero(p.run.hero)+'</div><div><small>'+(i===me()?'あなた':'仲間')+' · '+G.HEROES[p.run.hero].name+'</small><b>'+esc(p.name)+'</b><span>HP '+Math.max(0,h.hp)+' / '+h.maxHp+(c?' · 盾 '+h.block+' · 闘気 '+h.str:' · 金貨 '+p.run.gold)+'</span>'+(c?'<span class="co-hero-status">'+(h.weak?'怯み'+h.weak+' ':'')+(h.vuln?'隙'+h.vuln+' ':'')+(h.stance&&h.stance!=='none'?({calm:'凪の構え',wrath:'烈の構え',divine:'神の構え'}[h.stance]||h.stance)+' ':'')+(h.orbs.length?'核 '+h.orbs.map(function(o){return {spark:'雷',frost:'氷',void:'冥'}[o];}).join('・'):'')+'</span>':'')+(c&&c.hero.hp<=0?'<em>戦闘不能 · 仲間の勝利で復帰</em>':'')+'</div></article>';}).join('')+'</div>';}
var ROOM_NAME={start:'最初の戦闘',enc:'戦闘',elite:'強敵',boss:'ボス',event:'異聞',rest:'焚き火',shop:'行商人',treasure:'宝箱'},ROOM_ICON={start:'⚔',enc:'⚔',elite:'◆',boss:'♛',event:'？',rest:'♨',shop:'◈',treasure:'▣'};
function mapHTML(v){var map=v.players[0].run.map,visited=v.players[0].run.visited,leader=v.leader===me();return '<div class="co-map-intro"><small>第一層 · '+v.players[0].run.stats.floors+'部屋を踏破</small><h2>次は、どちらへ？</h2><p>進路係：'+esc(v.players[v.leader].name)+'。'+(leader?'仲間の提案を見て、行き先を決めてください。':'行きたい部屋を押すと仲間へ提案できます。')+'</p></div><div class="co-map-path">'+map.nodes.filter(function(n){return v.reachable.indexOf(n.id)>=0;}).sort(function(a,b){return a.row-b.row;}).map(function(n){var reachable=v.reachable.indexOf(n.id)>=0,done=visited.indexOf(n.id)>=0;return '<button class="co-node '+(reachable?'reachable':'')+(done?' visited':'')+'" data-node="'+esc(n.id)+'" '+(!reachable||v.busy?'disabled':'')+'><span>'+ROOM_ICON[n.kind]+'</span><small>'+n.row+'階</small><b>'+ROOM_NAME[n.kind]+'</b>'+(v.votes.filter(function(node,i){return i!==me()&&node===n.id;}).length?'<em>仲間 '+v.votes.filter(function(node,i){return i!==me()&&node===n.id;}).length+'人の提案</em>':'')+(v.votes[me()]===n.id?'<em>あなたの提案</em>':'')+'</button>';}).join('')+'</div><details class="co-fullmap"><summary>塔全体の地図を見る</summary><div class="co-fullmap-scroll">'+UI.mapHTML(false).replace(/data-node=/g,'disabled data-overview-node=')+'</div></details><p class="co-map-hint">道でつながる、次の候補だけを表示しています。</p>';}
function battleHTML(v){var p=v.players[me()],c=hydrate(p),active=hydrate(v.players[v.active]),can=v.active===me()&&!v.busy&&U.connected&&c.phase==='player'&&!c.over;
  if(U.target&&!active.byUid(U.target)?.alive)U.target=null;
  var enemies=active.alive(),target=U.target||enemies[0]?.uid;
  var selected=c.hand.find(function(x){return x.uid===U.selected;});if(!selected)U.selected=null;
  return '<div class="co-battle '+(v.room.kind==='boss'?'boss':'')+'"><div class="co-battle-top"><div><small>TEAM TURN '+v.turn+' · 出目 '+active.die+'</small><h2>'+(v.active===me()?'あなたのターン':esc(v.players[v.active].name)+'のターン')+'</h2></div><b class="co-energy">'+c.hero.energy+'<small> ENERGY</small></b></div><div class="co-enemies">'+enemies.map(function(e){var act=active.actionOf(e),damage=act.fx.filter(function(op){return op[0]==='atk';}).reduce(function(n,op){return n+active.previewEnemyHit(e,op[1])*(op[2]||1);},0);return '<button class="co-enemy '+(target===e.uid?'target':'')+'" data-target="'+esc(e.uid)+'"><div class="co-intent">'+esc(act.name)+(damage?' · 攻撃 '+damage:'')+'</div><div class="co-enemy-art">'+G.ART.enemy(G.ENEMIES[e.id].art||e.id)+'</div><b>'+esc(e.name)+'</b><span>HP '+Math.max(0,e.hp)+' / '+e.maxHp+' · 盾 '+e.block+'</span><small>'+[['str','闘気'],['weak','怯み'],['vuln','隙'],['poison','毒']].filter(function(x){return e[x[0]];}).map(function(x){return x[1]+e[x[0]];}).join(' / ')+'</small></button>';}).join('')+'</div><p class="co-target-hint">'+(v.active===me()?'敵を押して攻撃対象を選択。カードを押すと詳細を確認して使えます。':'仲間のプレイを見守っています。敵やカードの詳細は確認できます。')+'</p></div><div class="co-hand">'+c.hand.map(function(x){return '<button class="co-card '+(can&&c.canPlay(x)?'playable':'')+'" data-card="'+x.uid+'" aria-label="'+esc(G.CARDS[x.id].name)+'の詳細">'+card(x,c)+'</button>';}).join('')+'</div><div class="co-battle-actions">'+btn('ターン終了','end',!can,'primary')+btn('援護 · 1エナジー','support',!can||c.hero.energy<1||c.t.coopSupport||!v.players.some(function(p,i){return i!==me()&&p.combat.hero.hp>0;}),'ghost')+(c.hero.shiv?btn('投げ針 ×'+c.hero.shiv,'shiv',!can):'')+(c.hero.miracle?btn('祈り ×'+c.hero.miracle,'miracle',!can):'')+'</div><p class="co-piles">山札 '+c.draw.length+' · 捨て札 '+c.discard.length+' · 消滅 '+c.exhaust.length+'<span>援護：仲間の次のターンに盾＋3</span></p><div class="co-items">'+p.run.relics.map(function(id){var r=G.RELICS[id];return '<button data-co-relic="'+id+'">'+G.ART.relic(id)+'<span>'+esc(r.name)+'</span></button>';}).join('')+p.run.potions.map(function(id,i){return '<button data-co-potion="'+i+'">'+G.ART.potion(id)+'<span>'+esc(G.POTIONS[id].name)+'</span></button>';}).join('')+'</div>';
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
  if(!U.connected)content+='<div class="co-disconnected" role="alert"><b>接続がそろうまで待機しています。</b><p>冒険はこの部屋に保持しています。再接続待ち：'+esc(U.roster.filter(function(p){return !p.online;}).map(function(p){return p.name;}).join('・')||'ホスト')+'。全員が戻るまで操作を停止しています。</p>'+(U.role==='guest'&&!U.ready?btn('同じ部屋へ再接続','reconnect',false,'primary'):'<p>仲間は同じ部屋コードで再参加できます。</p>')+'</div>';
  if(v.phase==='map')content+=mapHTML(v);
  else if(v.phase==='combat')content+=battleHTML(v);
  else if(v.phase==='victory'||v.phase==='defeat')content+='<div class="co-result"><h2>'+(v.phase==='victory'?v.players.length+'人で第一層 踏破！':'仲間たちの冒険は、ここまで。')+'</h2><p>'+v.players.map(function(x){return esc(x.name);}).join(' ＆ ')+'</p>'+(U.role==='host'?btn('待合室へ戻る','lobby',false,'primary'):'<p>部屋を作った人が待合室へ戻るまでお待ちください。</p>')+'</div>';
  else content+='<div class="co-room"><h2>'+({rewards:'戦利品',room:ROOM_NAME[v.room?.type]||'部屋'}[v.phase]||'冒険中')+'</h2><p>全員がそれぞれの選択を終えると、冒険が進みます。</p></div>';
  if(U.connected&&v.prompts[me()])content+=promptHTML(v.prompts[me()],v);
  var choosing=v.prompts.map(function(q,i){return q&&i!==me()?v.players[i].name:null;}).filter(Boolean);
  if(choosing.length)content+='<p class="co-partner-choosing" role="status">'+choosing.map(esc).join('・')+'が選んでいます。</p>';
  if(v.busy&&!v.prompts[me()])content+='<p class="co-processing" role="status">'+(choosing.length?'仲間の選択を待っています。':'行動を処理しています…')+'</p>';
  content+='<details class="co-log"><summary>直近の出来事</summary><ol>'+v.log.slice().reverse().map(function(s){return '<li>'+esc(s)+'</li>';}).join('')+'</ol></details>';
  var previousScreen=root.querySelector('.coop-screen'),scrollTop=previousScreen?previousScreen.scrollTop:0,keepScroll=U.renderedPhase===v.phase;U.renderedPhase=v.phase;
  var oldPrompt=root.querySelector('.co-prompt'),oldKey=oldPrompt&&oldPrompt.dataset.prompt,picks=Array.from(root.querySelectorAll('input[name="co-pick"]:checked'),function(x){return x.value;});
  root.innerHTML=shell(v.players.length+'人の冒険',content);
  if(keepScroll)root.querySelector('.coop-screen').scrollTop=scrollTop;
  var newPrompt=root.querySelector('.co-prompt');if(newPrompt&&newPrompt.dataset.prompt===oldKey)Array.from(newPrompt.querySelectorAll('input[name="co-pick"]')).forEach(function(x){x.checked=picks.indexOf(x.value)>=0;});
  G.SFX.music(v.phase==='combat'?(v.room.kind==='boss'?'boss':'combat'):'map');
}
function profile(){var name=root.querySelector('#co-name'),hero=root.querySelector('#co-hero');pref.name=NET.cleanName(name?name.value:pref.name)||'冒険者';pref.hero=hero?hero.value:pref.hero;try{localStorage.setItem(PREF,JSON.stringify(pref));}catch(e){} }
function disconnect(cid){if(U.role==='host'){delete U.seen[cid];if(U.room)U.room.depart(cid);}else{U.connected=false;U.ready=false;U.lastSeen=0;render();}}
function receiveView(v){if(!v||v.v!==1||!Array.isArray(v.players)||v.players.length<2||v.players.length>6||me()>=v.players.length)return;U.view=v;
  if(v.phase==='map'){var order=[me()].concat(v.players.map(function(_,i){return i;}).filter(function(i){return i!==me();}));save({v:1,leader:order.indexOf(v.leader),names:order.map(function(i){return v.players[i].name;}),runs:order.map(function(i){return v.players[i].run;}),keys:order.map(function(i){return i===me()?myToken:null;})});}
  if(v.result)save(null);render();}
function bind(link){
  link.on('close',disconnect);link.on('peer',function(cid){U.seen[cid]=Date.now();});
  link.on('msg',function(m,cid){
    if(!U.open||!m||m.v!==2)return;
    if(U.role==='host')U.seen[cid]=Date.now();else U.lastSeen=Date.now();
    if(m.k==='ping'){send({k:'pong'},cid);return;}if(m.k==='pong')return;
    if(m.k==='hello'&&U.role==='host'){
      var seat=U.room.hello(cid,m);if(seat!==false&&U.core){send({k:'state',state:U.core.snapshot()},cid);}return;
    }
    if(m.k==='welcome'&&U.role==='guest'){
      if(!Number.isInteger(m.seat)||m.seat<1||m.seat>5||!Array.isArray(m.roster)||m.roster.length>6)return;
      U.seat=m.seat;U.roster=m.roster;U.ready=true;U.connected=U.roster.length>=2&&U.roster.every(function(p){return p.online;});U.error='';U.message='';render();return;
    }
    if(m.k==='state'&&U.role==='guest'&&U.ready){receiveView(m.state);return;}
    if(m.k==='action'&&U.role==='host'&&U.core){var owner=U.room.accept(cid,m.seq);if(owner>=1)act(owner,m.action);return;}
    if(m.k==='lobby'&&U.role==='guest'){U.view=null;U.saveKeys=null;render();return;}
    if(m.k==='error'){U.error=String(m.text||'接続を確認してください。');if(m.rejected){U.ready=false;U.connected=false;}render();}
  });
  clearInterval(U.heartbeat);U.heartbeat=setInterval(function(){
    if(!U.open||!U.role)return;
    if(U.role==='host'){Object.keys(U.seen).forEach(function(cid){if(Date.now()-U.seen[cid]>18000)link.drop(cid);});}
    else if(U.ready&&U.lastSeen&&Date.now()-U.lastSeen>18000){U.ready=false;U.connected=false;render();}
    if(U.role==='host')link.send({v:2,k:'ping'});else send({k:'ping'});
  },4000);
}
async function connect(role,code,resume){
  profile();U.error='';U.message='接続を準備しています…';
  if(U.link)U.link.close();U.seen={};U.connected=false;U.ready=false;U.role=role;U.code=code||NET.makeCode();U.resume=!!resume;U.checkpoint=resume?saved():null;
  if(U.checkpoint)pref.hero=U.checkpoint.runs[0].hero;
  if(role==='host'){
    U.seat=0;U.room=new G.CoopRoom({name:pref.name,hero:pref.hero,token:myToken},{send:function(cid,m){send(m,cid);},drop:function(cid){var current=U.link;setTimeout(function(){if(current)current.drop(cid);},250);},update:function(roster){U.roster=roster;U.connected=U.room.ready();render();}},U.checkpoint);U.roster=U.room.publicRoster();
  }
  var kind=new URLSearchParams(location.search).get('net')==='local'?'local':'peer';
  var link=U.link=NET.makeLink(kind);bind(link);render();
  try{if(role==='host'){await link.host(U.code);U.message='コードか招待リンクを仲間に伝えてください。';}
  else{await link.join(U.code);send({k:'hello',token:myToken,name:pref.name,hero:pref.hero});U.message='部屋に参加しています…';}render();}
  catch(e){if(U.link===link){link.close();U.message='';U.error=e&&e.code==='taken'?'このコードは使用中です。退出して作り直してください。':'接続できませんでした。コード・通信環境を確認して、再接続してください。';render();}}
}
function makeCore(){
  var cp=U.checkpoint,players;try{players=U.room.start();}catch(e){return markError(e);}
  U.core=new G.CoopCore(players,Date.now()>>>0,{update:function(v){U.view=v;send({k:'state',state:v});render();},save:function(data){if(data)data.keys=U.room.keys();save(data);},
    effect:async function(type){var sounds={play:'card',enemyDamage:'hit',heroDamage:'hurt',heal:'heal',enemyDeath:'burn',die:'dieland'};if(sounds[type])G.SFX.play(sounds[type]);if(['play','enemyDamage','heroDamage','enemyAct'].indexOf(type)>=0)await new Promise(function(r){setTimeout(r,180);});}},cp);
  U.core.begin();
}
async function act(owner,a){if(!U.connected){if(owner>0)send({k:'error',text:'全員が再接続するまでお待ちください。'},U.room.slots[owner].cid);render();return;}try{await U.core.dispatch(owner,a);}catch(e){if(U.core&&!U.core.closed){if(owner>0)send({k:'error',text:e.message},U.room.slots[owner].cid);else U.error=e.message;U.core.publish();}}}

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
    var n=v.players[0].run.map.nodes.find(function(x){return x.id===b.dataset.node;});var ok=await UI.confirmBox('進路を決定',ROOM_NAME[n.kind]+'（'+n.row+'階）へ'+v.players.length+'人で進みますか？','ここへ進む');if(ok)command({type:'enter',node:n.id});
  }else command({type:'vote',node:b.dataset.node});return;}
  if(b.dataset.removeSeat!=null&&U.role==='host'&&!U.core){U.room.remove(+b.dataset.removeSeat);return;}
  if(b.dataset.supportSeat!=null){var ally=+b.dataset.supportSeat;if(U.supportModal)U.supportModal.close();command({type:'support',ally:ally});return;}
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
  else if(action==='support'){var allies=v.players.map(function(p,i){return {p:p,i:i};}).filter(function(x){return x.i!==me()&&x.p.combat.hero.hp>0;});if(allies.length===1)command({type:'support',ally:allies[0].i});else{var modal=UI.modal({title:'援護する仲間を選ぶ',body:allies.map(function(x){return '<button class="btn ghost" data-support-seat="'+x.i+'">'+esc(x.p.name)+' · HP '+x.p.combat.hero.hp+' · 次のターンに盾＋3</button>';}).join('')});U.supportModal=modal;modal.el.addEventListener('click',function(e){var b=e.target.closest('[data-support-seat]');if(b){modal.close();command({type:'support',ally:+b.dataset.supportSeat});}});}}
  else if(['end','shiv','miracle'].indexOf(action)>=0)command({type:action,target:U.target||c?.alive()[0]?.uid});
  else if(action==='deck')UI.showDeck(p.run.deck,'あなたのデッキ（'+p.run.deck.length+'枚）');
  else if(action==='lobby'){if(U.core)U.core.close();U.core=null;U.view=null;U.checkpoint=null;U.resume=false;send({k:'lobby'});U.room.restart();render();}
});
function leave(){if(U.core)U.core.close();if(U.link)U.link.close();clearInterval(U.heartbeat);U=initial();UI.S.combat=null;UI.titleScreen();}
window.addEventListener('pagehide',function(){if(U.link)U.link.close();});
G.COOP={open:open};
var invite=new URLSearchParams(location.search).get('coop');if(invite){open();var input=root.querySelector('#co-code');if(input)input.value=NET.cleanCode(invite);}
})();
