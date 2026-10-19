import { bindBracketZoom } from './tournament-tree.js?v=20261019-bracket-2';
import { openingMatchups, openingHTML } from './tournament-opening.js?v=20261019-bracket-2';
import { Arena } from './arena.js?v=20261019-arena-1';
import { PLAYER_LOGOS, logoHTML, validLogo } from './player-logos.js?v=20261019-parallel-1';
import { tourBoardHTML, roundName } from './tournament-board.js?v=20261019-bracket-2';
import { createFX } from './tournament-fx.js';

export function createTournaments(api) {
  const { E, AI, $, prefs, store, esc, sheet, openLayer, closeLayer, toast, sfx, showScreen, cpuChoose } = api;
  const N = window.HTN_TOUR_NET, Director = window.HTN_DIR.Director;
  const LEVEL = {1:'やさしい',2:'ふつう',3:'つよい',4:'もっとつよい'};
  const CPU_NAMES = ['アトラス','レオン','ミラ','オリオン','ルクス','ソフィア','ゼノア','クレオ','ダリオ','ネフェル','イシス','カシウス'];
  const session = {kind:'none',cid:'local',link:null};
  let host = null, room = null, current = null, perspective = 0, watchSpeed = 1, fx = null, epoch = 0, cancelOverlay = null;
  let myLogo=validLogo(store.get('logo','wolf')), pending=null, boardEl=null, handsEl=null, celebratedTournament=false, tourStamp='';
  const viewing=new Map(), sentMid=new Map();
  let tourList = store.get('tourList', null) || [{name:api.myName(),cpu:0,logo:myLogo},{name:CPU_NAMES[0],cpu:2,logo:'lion'},{name:CPU_NAMES[1],cpu:3,logo:'dragon'},{name:CPU_NAMES[2],cpu:1,logo:'phoenix'}];
  tourList=tourList.map((e,i)=>({...e,logo:e.logo?validLogo(e.logo):i?PLAYER_LOGOS[i%20].id:myLogo}));
  const format = () => prefs.format || 'league';
  function endOverlay() { if (cancelOverlay) cancelOverlay(); cancelOverlay = null; $('#cine').hidden = true; $('#handoff').hidden = true; }
  function leave() {
    epoch++; endOverlay(); if (host) host.close(); host = null;
    if (session.link) session.link.close(); session.link = null; room = null; current = null; session.kind = 'none';
    $('#btnTour').hidden = true; $('#watchBar').hidden = true; $('#tourNav').hidden=true;
    pending=null;boardEl=null;handsEl=null;celebratedTournament=false;tourStamp='';viewing.clear();sentMid.clear();
  }
  function selected(cid) {
    const old=host.d.matches[viewing.get(cid)];
    if(old?.seats)return old;
    const live=host.d.matches.filter(m=>m.status==='live');
    const m=live.find(m=>host.ctrlFor(cid,m).length)||live[0]||host.d.matches.find(m=>m.seats);
    if(m)viewing.set(cid,m.id);return m;
  }
  function deliver(cid,events=[],fresh=false,changed=null,quiet=false,tourChanged=true) {
    const m=selected(cid);if(!m)return;
    const switched=sentMid.get(cid)!==m.id;sentMid.set(cid,m.id);
    if(changed!=null&&changed!==m.id&&!switched&&!tourChanged)return;
    const packet=changed==null||changed===m.id||switched
      ?{k:'match',p:{...host.payload(cid,switched?[]:events,switched,0,m.id),quiet:quiet||(!fresh&&switched)}}
      :{k:'tour',tour:host.d.summary()};
    if(cid===session.cid){if(packet.k==='tour')receiveTour(packet.tour);else receive(packet.p);}
    else session.link.send(cid,packet);
  }
  function io() {
    return { E, AI, Director, choose:cpuChoose,
      delay:mid=>new Promise(r=>setTimeout(r,450/(prefs.speed*(mid===current?.mid?watchSpeed:1)))),
      idle:()=>setTimeout(idle,0),
      send:(events,fresh,mid)=>{
        const stamp=host.d.matches.map(m=>[m.status,m.a,m.b,m.winner].join(':')).join('|')+';'+host.d.entrants.map(e=>[e.cpu,e.name].join(':')).join('|');
        const changed=stamp!==tourStamp;tourStamp=stamp;
        deliver(session.cid,events,fresh,mid,false,changed);
        if(session.kind==='host')room.members.forEach(mb=>{if(mb.cid!=='h')deliver(mb.cid,events,fresh,mid,false,changed);});
        setTimeout(idle,0);
      }
    };
  }
  function watch(mid) {
    mid=Number(mid);closeLayer();boardEl=null;
    if(session.kind==='guest'){session.link.send({k:'watch',mid});return;}
    const m=host?.d.matches[mid];if(!m?.seats)return;
    viewing.set(session.cid,mid);sentMid.delete(session.cid);deliver(session.cid,[],true,mid,false);
  }
  function receiveTour(t) {
    if(current)current.tour=t;
    if(api.match()?.tournament)api.match().summary=t;
    renderNav();updateBoard();
    maybeCelebrate(t);
  }
  function maybeCelebrate(t){
    if(t.over&&t.format!=='duel'&&!celebratedTournament){celebratedTournament=true;const gen=epoch;setTimeout(()=>{if(gen===epoch)celebrate(t);},300);}
  }
  function renderNav() {
    const el=$('#tourNav'),t=current?.tour,m=api.match();el.hidden=!t||!m?.tournament;
    if(el.hidden)return;
    const own=t.matches.find(x=>x.status==='live'&&[x.a,x.b].some(id=>{const e=t.entrants.find(e=>e.eid===id);return e&&!e.cpu&&e.owner===session.cid;}));
    const live=t.matches.filter(x=>x.status==='live').length;
    el.innerHTML='<button class="btn" data-nav="board">大会表 · '+live+'試合進行中</button>'+(own&&own.id!==m.mid?'<button class="btn primary" data-own="'+own.id+'">自分の試合へ'+'</button>':'')+'<span>'+esc(current.names.join(' vs '))+'</span>';
  }
  function logoPicker(value,onSelect) {
    const el=openLayer(sheet('プレイヤーロゴを選ぶ','<p class="note">大会表・待機室・対戦の登場演出に使います。</p><div class="logo-grid">'+PLAYER_LOGOS.map(l=>'<button class="logo-choice '+(l.id===validLogo(value)?'selected':'')+'" data-logo="'+l.id+'" aria-pressed="'+(l.id===validLogo(value))+'">'+logoHTML(l.id)+'<span>'+l.name+'</span></button>').join('')+'</div>'));
    el.querySelectorAll('[data-logo]').forEach(b=>b.onclick=()=>{onSelect(b.dataset.logo);closeLayer();});
  }
  function chooseMyLogo() {
    logoPicker(myLogo,id=>{myLogo=id;store.set('logo',id);const first=tourList.find(e=>!e.cpu);if(first){first.logo=id;save();}renderProfile();
      const mb=room?.members.find(m=>m.cid===session.cid);
      if(mb&&!room.started){if(session.kind==='host'){mb.logo=id;pushRoom();}else session.link.send({k:'logo',logo:id});}
    });
  }
  function renderProfile() { $('#onLogo').innerHTML=logoHTML(myLogo)+'<span>ロゴを選ぶ</span>';$('#goLogo').innerHTML=logoHTML(myLogo)+'<span>プレイヤーロゴ</span>'; }
  async function showOpening(t,stepMs,elapsed=0) {
    epoch++;
    const {pages}=openingMatchups(t),overviewSteps=t.format==='cup'?1:0,duration=(pages.length+overviewSteps)*stepMs;
    current=null;pending=null;api.clearMatch();
    const wait=overlay(openingHTML(t,stepMs),false,{manual:true,className:'tour-opening'}),done=cancelOverlay;
    let page=-2,started=Date.now()-elapsed,pausedAt=null;
    const tick=()=>{
      if(pausedAt!=null)return;
      const age=Date.now()-started;if(age>=duration){done();return;}
      const next=Math.floor(age/stepMs)-overviewSteps;if(next===page)return;page=next;
      const overview=$('[data-opening-overview]'),introductions=$('[data-opening-introductions]');
      if(overview)overview.hidden=page>=0;if(introductions)introductions.hidden=page<0;
      $('#cine').classList.toggle('full-bracket-opening',page<0);
      document.querySelectorAll('[data-opening-page]').forEach(el=>el.hidden=+el.dataset.openingPage!==page);
      document.querySelectorAll('[data-opening-dot]').forEach(el=>el.classList.toggle('on',+el.dataset.openingDot===page));
      const count=document.querySelector('[data-opening-count]');if(count)count.textContent=String(page+1);
    };
    bindBracketZoom($('#cine'),zoom=>{if(zoom)pausedAt=Date.now();else if(pausedAt!=null){started+=Date.now()-pausedAt;pausedAt=null;}});
    const next=$('[data-overview-next]');if(next)next.onclick=e=>{e.stopPropagation();pausedAt=null;started=Date.now()-stepMs;tick();};
    const skip=$('#cine [data-opening-skip]');if(skip)skip.onclick=e=>{e.stopPropagation();done();};
    (next||skip)?.focus();tick();const timer=setInterval(tick,Math.max(1,Math.min(100,stepMs)));
    try{await wait;}finally{clearInterval(timer);}
  }
  async function runTournament(arena) {
    host=arena;
    if(arena.d.format==='duel'){arena.startReady();return;}
    const info={tour:arena.d.summary(),stepMs:4000/prefs.speed,started:Date.now()};arena.openingInfo=info;
    if(session.kind==='host')session.link.broadcast({k:'opening',tour:info.tour,stepMs:info.stepMs,elapsed:0});
    await showOpening(info.tour,info.stepMs);
    if(host!==arena||arena.closed)return;
    delete arena.openingInfo;arena.startReady();
  }
  function startOffline(entrants, fmt) {
    leave(); api.setWatchSpeed(1); session.kind = 'local'; session.cid = 'local'; perspective = 0; watchSpeed = 1;
    runTournament(new Arena(entrants, fmt, { tactics:prefs.tactics,parallel:true,entryDelay:2000/prefs.speed }, io()));
  }
  function launch() {
    if (tourList.length < 2 || tourList.length > 12) return;
    startOffline(tourList.map((e,i) => ({name:N.cleanName(e.name) || (e.cpu?'CPU':'プレイヤー')+(i+1),cpu:e.cpu,logo:validLogo(e.logo),owner:e.cpu?null:'local'})),format());
  }
  function renderList() {
    $('#tourList').innerHTML = tourList.map((e,i) => '<div class="ent"><button class="logo-button" data-tlogo="'+i+'" aria-label="'+esc(e.name)+'のロゴを選ぶ">'+logoHTML(e.logo)+'</button><input aria-label="参加者'+(i+1)+'の名前" value="'+esc(e.name)+'" maxlength="10" data-tn="'+i+'">'+(e.cpu?'<select aria-label="CPUの強さ" data-tl="'+i+'">'+[1,2,3,4].map(l=>'<option value="'+l+'"'+(l===e.cpu?' selected':'')+'>CPU・'+LEVEL[l]+'</option>').join('')+'</select>':'<span class="tag play">人</span>')+'<button class="x" data-tx="'+i+'" aria-label="外す">✕</button></div>').join('');
    $('#tourAddHuman').disabled = $('#tourAddCpu').disabled = tourList.length >= 12;
    $('#tourStart').disabled = tourList.length < 2;
  }
  function save() { store.set('tourList',tourList); }
  function subtitle(t) { const m=t.matches[current?.mid??t.cur]; return t.format==='league'?'総当たり 第'+m.round+'節':t.format==='cup'?roundName(t,m.round):'1対1'; }
  async function overlay(html, handoff=false, options={}) {
    endOverlay();
    const el = $(handoff?'#handoff':'#cine');el.className=options.className||''; el.innerHTML = html; el.hidden = false;
    await new Promise(resolve => {
      let timer;
      const done = () => { clearTimeout(timer); el.onclick = null; el.hidden = true; cancelOverlay = null; resolve(); };
      cancelOverlay = done;
      if (handoff) el.querySelector('button').onclick = done;
      else if(!options.manual) { el.onclick = done; timer = setTimeout(done, options.duration??(2000 / prefs.speed)); }
    });
  }
  async function handoff(name) {
    await overlay('<div class="card"><h2>'+esc(name)+'さんに交代</h2><p>端末を渡してから、自分の手札を開いてください。</p><button class="btn primary">手札を開く</button></div>',true);
  }
  async function receive(p) {
    const fresh = !current || !api.match() || api.match().mid!==p.mid || p.fresh;
    if(!fresh&&(api.presenting()||api.match().intro)){
      pending=p;api.match().waiting=true;receiveTour(p.tour);return;
    }
    if(p.ctrl.length===0 && p.view.me!==perspective)p={...p,view:{...p.view,me:perspective,hand:p.hands[perspective].slice(),opp:p.hands[1-perspective].map(c=>c<60?'T':'X')}};
    current = p;renderHands();
    $('#btnTour').hidden = false;renderNav();updateBoard();
    if (fresh) {
      pending=null;if(p.quiet)endOverlay();
      perspective = p.view.me; watchSpeed = 1; api.setWatchSpeed(1);
      const gen = ++epoch, readyAt=Date.now()+(p.readyIn||0);
      const m = {mode:'tournament',tournament:true,mid:p.mid,me:p.view.me,alive:true,ctrl:p.ctrl,names:p.names,oppName:p.names[1-p.view.me],revision:p.revision,summary:p.tour,waiting:false,intro:true};
      // Cover the old table before any fresh hand is placed on it.
      const intro = p.quiet?Promise.resolve():overlay('<div class="bk"></div><div class="rays"></div><div style="position:relative"><div class="wkick">'+esc(subtitle(p.tour))+'</div><div class="vs"><span class="a">'+logoHTML(p.logos?.[0])+esc(p.names[0])+'</span><span class="x">VS</span><span class="b">'+logoHTML(p.logos?.[1])+esc(p.names[1])+'</span></div><div class="agesub">'+(p.ctrl.length===0?'観戦モード：両者の手札も見られます':'9本の旗をめぐる対決')+'</div><small>タップでスキップ</small></div>');
      if(!p.quiet)sfx.play('claim');
      api.begin(m,p.ctrl.length===2?{...p.view,hand:[]}:p.view); renderWatch();renderNav(); await intro;
      if(gen===epoch&&Date.now()<readyAt)await new Promise(r=>setTimeout(r,readyAt-Date.now()));
      if (gen!==epoch || api.match()!==m) return;
      if (p.ctrl.length===2) await handoff(p.names[p.view.me]);
      if (gen!==epoch) return;
      if (p.ctrl.length===2) api.replaceView(p.view);
      m.intro = false; api.enterTable();api.render();renderNav(); idle();
      if(p.quiet&&p.view.phase==='over'&&!boardEl?.isConnected)result();
    } else {
      const m = api.match(); if (!m || !m.tournament) return;
      m.ctrl = p.ctrl; m.names = p.names; m.oppName = p.names[1-p.view.me]; m.revision = p.revision; m.summary = p.tour; m.waiting = false; clearTimeout(m.waitTimer);
      api.enqueue(m,p.view,p.snapshot?[]:p.ev||[],!!p.snapshot); renderWatch();
    }
  }
  async function beforeSettle(u) {
    const m = u.m;
    if (!m.tournament) return;
    if (m.ctrl.length===2 && api.view() && api.view().me!==u.finalView.me && u.finalView.phase!=='over') await handoff(m.names[u.finalView.me]);
    m.me = u.finalView.me; m.oppName = m.names[1-m.me];
  }
  function canAct() { const m=api.match(),v=api.view(); return !!(m&&m.tournament&&!m.intro&&!m.waiting&&m.ctrl.includes(v.me)&&v.turn===v.me); }
  function act(a) {
    const m=api.match(); if (!canAct() || api.presenting()) return;
    if (session.kind==='guest') { m.waiting=true; api.render(); session.link.send({k:'act',mid:m.mid,revision:m.revision,a}); clearTimeout(m.waitTimer); m.waitTimer=setTimeout(()=>{if(api.match()===m&&m.waiting&&session.link)session.link.send({k:'sync'});},9000); }
    else if (host) host.act(session.cid,a,m.mid,m.revision);
  }
  function idle() {
    const m=api.match();
    if(pending&&m?.tournament&&!m.intro&&!api.presenting()){
      const p=pending;pending=null;
      if(p.mid===m.mid)receive({...p,snapshot:true});
    }
    if(!host)return;
    host.d.matches.filter(x=>x.status==='live').forEach(x=>{
      if(x.id===api.match()?.mid && (api.presenting()||api.match().intro))return;
      host.pump(x.id);
    });
  }
  function renderHands(){
    if(!handsEl?.isConnected||!current?.hands)return;
    handsEl.querySelector('.live-hand-panel').innerHTML=current.hands.map((h,i)=>'<h4 class="hand-owner">'+logoHTML(current.logos?.[i])+esc(current.names[i])+' <small>'+h.length+'枚</small></h4><div class="watchhands">'+h.map(c=>api.mini(c)).join('')+'</div>').join('');
  }
  function renderWatch() {
    const el=$('#watchBar'), m=api.match();
    el.hidden = !current || !m || !m.tournament || current.ctrl.length!==0;
    if (el.hidden) return;
    el.innerHTML='<span class="chip">👁 観戦中</span><button class="btn" data-w="flip">⇅ 視点</button><button class="btn" data-w="hands">両者の手札</button>'+[1,2,4].map(x=>'<button class="btn '+(x===watchSpeed?'primary':'')+'" data-w="speed" data-v="'+x+'">×'+x+'</button>').join('')+(host&&current.cpu.every(Boolean)&&api.view().phase!=='over'?'<button class="btn" data-w="ff" '+(host.d.matches[current.mid]?.fast?'disabled':'')+'>'+(host.d.matches[current.mid]?.fast?'計算中…':'⏭ 結果へ')+'</button>':'');
  }
  function updateBoard() {
    if(!boardEl?.isConnected||!current)return;
    const body=boardEl.querySelector('.tour-board-body'),old=body.querySelector('.bracket');
    const scroll=old?.scrollLeft||0,zoomed=old?.classList.contains('zoomed'),open=body.querySelector('details')?.open;
    body.innerHTML=tourBoardHTML(current.tour,{cid:session.cid,mid:current.mid});
    if(body.querySelector('.bracket')){body.querySelector('.bracket').classList.toggle('zoomed',!!zoomed);body.querySelector('.bracket').scrollLeft=scroll;const z=body.querySelector('[data-bracket-zoom]');if(z){z.textContent=zoomed?'全体を表示':'拡大・スクロール';z.setAttribute('aria-pressed',String(!!zoomed));}}
    bindBracketZoom(body);
    if(body.querySelector('details'))body.querySelector('details').open=!!open;
    body.querySelectorAll('[data-watch]').forEach(b=>{b.onclick=()=>watch(b.dataset.watch);b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();watch(b.dataset.watch);}};});
  }
  function board() {
    if(!current)return;
    const t=current.tour,ctl=session.kind!=='guest';let foot='';
    if(ctl&&t.over)foot='<div class="row"><button class="btn primary" data-t="again">同じ顔ぶれでもう一度</button><button class="btn" data-t="title">タイトルへ</button></div>';
    if(session.kind==='host')foot+='<button class="btn ghost" data-t="lobby">部屋にもどる</button>';
    const note=t.format==='league'?'勝ち3点・引分1点。勝数→旗差→獲得旗数で順位を決めます。対戦相手が空き次第、次の試合が始まります。':'勝者は次の枝へ進みます。対戦相手が決まった試合から同時に始まります。引分は抽選で勝ち上がります。';
    boardEl=openLayer(sheet(t.format==='league'?'総当たり表':'トーナメント表','<div class="tour-board-body"></div><p class="note">'+note+' 観戦では両者の手札を確認できます。</p>'+foot));
    boardEl.classList.add('tournament-sheet');updateBoard();
    boardEl.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>resultAction(b.dataset.t));
  }
  function resultBody(v) {
    const m=api.match(), t=current.tour, draw=v.winner===2, winner=draw?'引き分け':m.names[v.winner]+'の勝利！';
    const counts=[0,1].map(s=>v.flags.filter(f=>f.claimed===s).length);
    const how={breakthrough:'となり合う3本の旗を確保（突破）',envelopment:'5本の旗を確保（包囲）',count:'旗の数で決着',draw:'旗の数も同じ'}[v.win]||'';
    const ctl=session.kind!=='guest';
    const own=t.matches.find(x=>x.status==='live'&&[x.a,x.b].some(id=>{const e=t.entrants.find(e=>e.eid===id);return e&&!e.cpu&&e.owner===session.cid;}));
    const final=t.matches[m.mid];
    return '<div class="tour-meta">'+esc(subtitle(t))+'</div><p class="result-big win">'+esc(winner)+'</p><p style="text-align:center">'+esc(how)+'</p><div class="scoreline"><span>'+esc(m.names[0])+' <b>'+counts[0]+'</b>本</span><span>'+esc(m.names[1])+' <b>'+counts[1]+'</b>本</span></div>'+(final.lot?'<p class="note">引き分けのため、抽選で'+esc(t.entrants.find(e=>e.eid===final.winner).name)+'が勝ち上がりました。</p>':'')+'<div class="row">'+(own?'<button class="btn primary" data-t="own">次の対戦へ</button>':ctl?'<button class="btn primary" data-t="'+(t.format==='duel'?'rematch':'board')+'">'+(t.format==='duel'?'もう一度':t.over?'大会の結果を見る':'大会表・他の試合へ')+'</button>':'<p class="note">大会表から他の試合を観戦できます。</p>')+(t.format!=='duel'?'<button class="btn" data-t="board">大会表</button>':'')+'<button class="btn ghost" data-t="look">盤面を見る</button><button class="btn ghost" data-t="title">タイトルへ</button></div>';
  }
  function result() {
    const m=api.match(); if (!current || !m) return;
    if(!boardEl?.isConnected){const el=openLayer(sheet('結果',resultBody(api.view())));el.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>resultAction(b.dataset.t));}
    maybeCelebrate(current.tour);
  }
  function celebrate(t) {
    const e=t.entrants.find(e=>e.eid===t.champion); if(!e)return;
    if(!fx) fx=createFX($('#tourFx')); fx.reduced=prefs.fx!=='full'||matchMedia('(prefers-reduced-motion:reduce)').matches;
    api.stamp('優勝 '+e.name,'yes',t.format==='league'?'総当たり 1位':'トーナメント制覇'); sfx.play('win');
    if(prefs.fx==='off')return;
    fx.confetti(200); const gen=epoch;
    for(let i=0;i<10;i++) setTimeout(()=>{if(gen===epoch)fx.firework(innerWidth*(.1+Math.random()*.8),innerHeight*(.1+Math.random()*.35));},i*300);
  }
  function resultAction(k) {
    closeLayer();
    if(k==='board') board();
    else if(k==='own'){const m=current.tour.matches.find(x=>x.status==='live'&&[x.a,x.b].some(id=>{const e=current.tour.entrants.find(e=>e.eid===id);return e&&!e.cpu&&e.owner===session.cid;}));if(m)watch(m.id);}
    else if(k==='look') return;
    else if(k==='title') api.quit();
    else if(k==='next' && host) {const next=host.d.matches.find(m=>m.status==='live');if(next)watch(next.id);else {host.startReady();board();}}
    else if(k==='rematch' && host) host.rematch();
    else if(k==='lobby' && session.kind==='host') backToLobby();
    else if(k==='again' && host) {
      const entrants=host.d.entrants.map(e=>({...e})), fmt=host.d.format;
      if(session.kind==='local') startOffline(entrants,fmt);
      else {host.close();viewing.clear();sentMid.clear();current=null;pending=null;celebratedTournament=false;runTournament(new Arena(entrants,fmt,{tactics:room.tactics,parallel:true,entryDelay:2000/prefs.speed},io()));}
    }
  }
  function error(msg) { $('#onErr').hidden=!msg; $('#onErr').textContent=msg||''; }
  function rememberName() { prefs.name=N.cleanName($('#onName').value);store.set('name',prefs.name);return prefs.name; }
  function netErr(e) { return e&&e.code==='notfound'?'その部屋が見つかりません。':e&&e.code==='lib'?'通信ライブラリを読み込めませんでした。':'接続できませんでした。もう一度お試しください。'; }
  function renderLobby() {
    if(!room)return;
    const isHost=session.kind==='host';
    $('#lobCode').textContent=room.code;$('#lobCount').textContent=room.members.length+'人＋CPU'+room.cpus.length;
    $('#lobFmtField').style.pointerEvents=isHost&&!room.started?'':'none';
    document.querySelectorAll('#segOnFormat button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===room.format)));
    $('#lobList').innerHTML=room.members.map(mb=>'<div class="ent"><button class="logo-button" data-member-logo="'+esc(mb.cid)+'" aria-label="'+esc(mb.name)+'のロゴ">'+logoHTML(mb.logo)+'</button><span class="nmx">'+esc(mb.name)+(mb.host?' 👑':'')+(mb.cid===session.cid?'（あなた）':'')+'</span>'+(isHost&&!room.started?'<button class="tag '+(mb.play?'play':'')+'" data-toggle="'+esc(mb.cid)+'">'+(mb.play?'参加':'観戦')+'</button>':'<span class="tag">'+(mb.play?'参加':'観戦')+'</span>')+'</div>').join('')+room.cpus.map((c,i)=>'<div class="ent"><button class="logo-button" data-cpu-logo="'+i+'" aria-label="'+esc(c.name)+'のロゴ">'+logoHTML(c.logo)+'</button><span class="nmx">'+esc(c.name)+'</span>'+(isHost&&!room.started?'<select aria-label="CPUの強さ" data-cpulv="'+i+'">'+[1,2,3,4].map(l=>'<option value="'+l+'"'+(l===c.level?' selected':'')+'>'+LEVEL[l]+'</option>').join('')+'</select><button class="x" data-cpux="'+i+'">✕</button>':'<span class="tag cpu">CPU・'+LEVEL[c.level]+'</span>')+'</div>').join('');
    $('#lobInvite').hidden=!isHost;$('#lobCpuRow').hidden=!isHost||room.started;$('#lobStart').hidden=!isHost||room.started;
    const mb=room.members.find(m=>m.cid===session.cid);$('#lobWatchToggle').hidden=isHost||room.started||!mb;
    if(mb)$('#lobWatchToggle').textContent=mb.play?'観戦だけにする':'参加する';
    const n=room.members.filter(m=>m.play).length+room.cpus.length;
    $('#lobNote').textContent=(room.tactics?'戦術カードあり。':'兵カードだけ。')+(room.started?'対戦中です。':isHost?(room.format==='duel'?'参加の先頭2人で対戦。':'参加の全員で'+(room.format==='league'?'総当たり。':'トーナメント。'))+'待機中の人は観戦します。（参加 '+n+'人）':'ホストの開始を待っています。観戦者には両者の手札が見えます。');
  }
  function showLobby() { showScreen('#scrOnline');$('#onPick').hidden=true;$('#onLobby').hidden=false;renderLobby(); }
  function pushRoom() { if(room&&session.link){ session.link.broadcast({k:'room',room});if(!$('#scrOnline').hidden)renderLobby(); } }
  async function createRoom() {
    error('');if(!rememberName()){error('名前を入れてください');return;}
    $('#onCreate').disabled=true;
    const link=N.makeHost(api.netkind);let code='';
    try{for(let i=0;i<4;i++){code=N.makeCode();try{await link.host(code);break;}catch(e){if(e.code!=='taken'||i===3)throw e;}}}catch(e){link.close();error(netErr(e));$('#onCreate').disabled=false;return;}
    leave();session.kind='host';session.cid='h';session.link=link;
    room={code,format:'duel',tactics:prefs.onTactics,members:[{cid:'h',name:api.myName(),logo:myLogo,play:true,host:true}],cpus:[],started:false};
    link.on('msg',hostMsg);link.on('leave',cid=>{if(session.link!==link||!room)return;const mb=room.members.find(m=>m.cid===cid);room.members=room.members.filter(m=>m.cid!==cid);if(mb)toast(esc(mb.name)+'が退出しました','warn');if(host)host.playerLeft(cid);pushRoom();});
    showLobby();
  }
  function hostMsg(cid,msg) {
    if(!room)return;
    if(msg.k==='hello'){
      if(msg.proto!==N.PROTOCOL){session.link.send(cid,{k:'err',text:'バージョンが違います。再読み込みしてください。'});return;}
      if(!room.members.some(m=>m.cid===cid))room.members.push({cid,name:N.cleanName(msg.name)||'ゲスト',logo:validLogo(msg.logo),play:!room.started});
      session.link.send(cid,{k:'welcome',cid});pushRoom();
      if(room.started&&host){if(host.openingInfo){const i=host.openingInfo;session.link.send(cid,{k:'opening',tour:i.tour,stepMs:i.stepMs,elapsed:Date.now()-i.started});}else deliver(cid,[],true);}
    }else if(msg.k==='act'&&host){if(!host.act(cid,msg.a,msg.mid,msg.revision))deliver(cid,[],false);}
    else if(msg.k==='role'&&!room.started){const mb=room.members.find(m=>m.cid===cid);if(mb){mb.play=!!msg.play;pushRoom();}}
    else if(msg.k==='sync'&&host)deliver(cid,[],false);
    else if(msg.k==='watch'&&host){const m=host.d.matches[msg.mid];if(m?.seats){viewing.set(cid,m.id);sentMid.delete(cid);deliver(cid,[],true,m.id,false);}}
    else if(msg.k==='logo'&&!room.started){const mb=room.members.find(m=>m.cid===cid);if(mb){mb.logo=validLogo(msg.logo);pushRoom();}}
  }
  function hostStart() {
    if(!room||session.kind!=='host'||room.started)return;
    const players=room.members.filter(m=>m.play).map(m=>({name:m.name,cpu:0,logo:m.logo,owner:m.cid})).concat(room.cpus.map(c=>({name:c.name,cpu:c.level,logo:c.logo,owner:null})));
    if(players.length<2||players.length>24){error('参加者は2〜24人にしてください（CPUも追加できます）');return;}
    error('');const fmt=room.format;room.started=true;pushRoom();
    runTournament(new Arena(fmt==='duel'?players.slice(0,2):players,fmt,{tactics:room.tactics,parallel:true,entryDelay:2000/prefs.speed},io()));
  }
  async function joinRoom(codeArg) {
    error('');if(!rememberName()){error('名前を入れてください');return;}
    const code=N.cleanCode(codeArg||$('#onCode').value);if(code.length!==4){error('4文字の部屋コードを入れてください');return;}
    $('#onJoin').disabled=true;const link=N.makeGuest(api.netkind);
    try{await link.join(code);}catch(e){link.close();error(netErr(e));$('#onJoin').disabled=false;return;}
    leave();session.kind='guest';session.cid=null;session.link=link;
    room={code,format:'duel',members:[],cpus:[],started:false};
    link.on('msg',msg=>{if(session.link!==link)return;if(msg.k==='welcome')session.cid=msg.cid;else if(msg.k==='room'){room=msg.room;if(!$('#scrOnline').hidden)renderLobby();}else if(msg.k==='opening'){showOpening(msg.tour,msg.stepMs,msg.elapsed);}else if(msg.k==='match'||msg.k==='sync'){receive(msg.p);}else if(msg.k==='tour'){receiveTour(msg.tour);}else if(msg.k==='lobby'){epoch++;endOverlay();current=null;pending=null;$('#tourNav').hidden=true;api.clearMatch();showLobby();}else if(msg.k==='err'||msg.k==='full')error(msg.text||'部屋がいっぱいです');});
    link.on('close',()=>{if(session.link!==link)return;toast('ホストとの接続が切れました','warn',5000);api.quit();});
    link.send({k:'hello',name:api.myName(),logo:myLogo,proto:N.PROTOCOL});showLobby();
  }
  function backToLobby() {
    if(host)host.close();host=null;epoch++;endOverlay();current=null;
    viewing.clear();sentMid.clear();pending=null;$('#tourNav').hidden=true;room.started=false;session.link.broadcast({k:'lobby'});pushRoom();api.clearMatch();showLobby();
  }
  function wire() {
    renderProfile();$('#goLogo').onclick=chooseMyLogo;$('#onLogo').onclick=chooseMyLogo;
    $('#tourNav').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.own!=null)watch(b.dataset.own);else board();};
    $('#goTour').onclick=()=>{showScreen('#scrTour');api.segInit('#segFormat',format(),v=>{prefs.format=v;store.set('format',v);});renderList();};
    api.segInit('#segTourRules',prefs.tactics?1:0,v=>{prefs.tactics=v==='1';store.set('tactics',prefs.tactics);});
    $('#tourList').oninput=e=>{const i=e.target.dataset.tn;if(i!=null){tourList[+i].name=N.cleanName(e.target.value);save();}};
    $('#tourList').onchange=e=>{const i=e.target.dataset.tl;if(i!=null){tourList[+i].cpu=+e.target.value;save();}};
    $('#tourList').onclick=e=>{const logo=e.target.closest('[data-tlogo]');if(logo){const n=+logo.dataset.tlogo;logoPicker(tourList[n].logo,id=>{tourList[n].logo=id;save();renderList();});return;}const i=e.target.dataset.tx;if(i!=null){tourList.splice(+i,1);save();renderList();}};
    $('#tourAddHuman').onclick=()=>{if(tourList.length>=12)return;tourList.push({name:'プレイヤー'+(tourList.filter(e=>!e.cpu).length+1),cpu:0,logo:PLAYER_LOGOS[tourList.length%20].id});save();renderList();};
    $('#tourAddCpu').onclick=()=>{if(tourList.length>=12)return;tourList.push({name:CPU_NAMES.find(n=>!tourList.some(e=>e.name===n))||'CPU',cpu:2,logo:PLAYER_LOGOS[tourList.length%20].id});save();renderList();};
    $('#tourStart').onclick=launch;$('#btnTour').onclick=board;
    $('#onCreate').onclick=createRoom;$('#onJoin').onclick=()=>joinRoom();$('#onCode').onkeydown=e=>{if(e.key==='Enter')joinRoom();};
    $('#lobStart').onclick=hostStart;
    $('#lobInvite').onclick=async()=>{if(!room)return;const url=location.origin+location.pathname+'?room='+room.code;try{await navigator.clipboard.writeText(url);toast('招待リンクをコピーしました','me');}catch{toast(esc(url),'',6000);}};
    $('#segOnFormat').onclick=e=>{const b=e.target.closest('button');if(b&&room&&session.kind==='host'&&!room.started){room.format=b.dataset.v;pushRoom();}};
    $('#lobList').onclick=e=>{if(!room||room.started)return;const emblem=e.target.closest('[data-member-logo]');if(emblem?.dataset.memberLogo===session.cid){chooseMyLogo();return;}if(session.kind!=='host')return;const cLogo=e.target.closest('[data-cpu-logo]');if(cLogo){const c=room.cpus[+cLogo.dataset.cpuLogo];logoPicker(c.logo,id=>{c.logo=id;pushRoom();});return;}const t=e.target.closest('[data-toggle]'),x=e.target.closest('[data-cpux]');if(t){const mb=room.members.find(m=>m.cid===t.dataset.toggle);mb.play=!mb.play;}if(x)room.cpus.splice(+x.dataset.cpux,1);pushRoom();};
    $('#lobList').onchange=e=>{if(session.kind==='host'&&room&&!room.started&&e.target.dataset.cpulv!=null){room.cpus[+e.target.dataset.cpulv].level=+e.target.value;pushRoom();}};
    $('#lobAddCpu').onclick=()=>{if(!room||room.cpus.length>=12)return;room.cpus.push({name:CPU_NAMES.find(n=>!room.cpus.some(c=>c.name===n))||'CPU',level:2,logo:PLAYER_LOGOS[(room.cpus.length+1)%20].id});pushRoom();};
    $('#lobWatchToggle').onclick=()=>{const mb=room&&room.members.find(m=>m.cid===session.cid);if(mb)session.link.send({k:'role',play:!mb.play});};
    $('#watchBar').onclick=e=>{const b=e.target.closest('[data-w]');if(!b||!current)return;const k=b.dataset.w;
      if(k==='hands'){handsEl=openLayer(sheet('両者の手札','<p class="note">観戦中の手札は、試合に合わせて更新されます。</p><div class="live-hand-panel"></div>'));renderHands();}
      else if(k==='speed'){watchSpeed=+b.dataset.v;api.setWatchSpeed(watchSpeed);renderWatch();}
      else if(k==='flip'&&!api.presenting()){perspective=1-perspective;const v={...api.view(),me:perspective,hand:current.hands[perspective].slice(),opp:current.hands[1-perspective].map(c=>c<60?'T':'X')};api.replaceView(v);renderWatch();}
      else if(k==='ff'&&host&&!api.presenting()){host.fastForward(current.mid);renderWatch();}
    };
  }
  return {wire,leave,idle,act,canAct,beforeSettle,result,board,startOffline,receive,renderWatch,createRoom,joinRoom,hostStart,watch,session,get host(){return host;},get current(){return current;},get room(){return room;}};
}
