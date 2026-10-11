'use strict';
(() => {
  const q = s => document.querySelector(s), safe = v => esc(String(v ?? ''));
  const TTL = 120000, board = { rooms: {}, status: 'loading', epoch: 0, busy: false, unsubscribe: null, own: null, heartbeat: null, metaOff: null };
  let root, notice, turnTimer, lastGame, lastTurn = '', originalTitle = document.title;
  const nameValue = () => (q('#onlineName')?.value || localStorage.getItem('compile-online-name') || q('#name0')?.value || '').trim().slice(0,32);
  function ensure() {
    if(root)return;
    root=document.createElement('section');root.id='onlineBoard';root.hidden=true;root.setAttribute('aria-label','オンライン対戦 募集掲示板');document.body.append(root);
    root.addEventListener('click',e=>{const b=e.target.closest('[data-online]');if(b && !b.disabled)void action(b.dataset.online,b.dataset.id);});
    root.innerHTML='<div class="online-shell"><nav><b>COMPILE <span>NETWORK</span></b><button data-online="home">ホームに戻る</button></nav><header><small>FIND YOUR NEXT RIVAL</small><h1>ONLINE<br><i>MATCH BOARD.</i></h1><p>部屋を募集して、集まった相手と対戦。<br>同じリンクから、この掲示板に参加できます。</p></header><div class="online-layout"><aside><small>YOUR CALLSIGN</small><h2>対戦に参加</h2><label>あなたの名前<input id="onlineName" maxlength="32" autocomplete="nickname" placeholder="プレイヤー名"></label><label>募集タイトル<input id="onlineRoomTitle" maxlength="48" placeholder="気軽に1戦 / 初心者歓迎"></label><div id="onlineOptions"></div><button class="primary" data-online="create">対戦相手を募集する ↗</button><p>カードセットとCONTROLはホームの対戦設定を使用します。</p><div class="online-invite"><h3>友達をコードで招待</h3><button data-online="private">招待用の部屋を作る</button><button data-online="code">招待コードで参加</button></div></aside><main><div class="online-list-head"><h2>募集している部屋 <span id="onlineCount">—</span></h2><button data-online="refresh">更新</button></div><div id="onlineStatus" role="status" aria-live="polite"></div><div id="onlineRooms"></div></main></div><footer>SELECT. CONNECT. COMPILE.</footer></div>';
    q('#onlineName').addEventListener('change',()=>{const n=nameValue();if(n)localStorage.setItem('compile-online-name',n);});
  }
  function refreshRooms() {
    if(!root)return;
    const now=Date.now(), rooms=Object.entries(board.rooms).filter(([id,r])=>valid(r) && r.expiresAt>now).sort((a,b)=>b[1].createdAt-a[1].createdAt);
    q('#onlineCount').textContent=board.status==='online' ? String(rooms.length).padStart(2,'0') : '—';
    q('#onlineStatus').textContent=board.status==='online' ? 'LIVE · 募集一覧は自動で更新されます' : board.status==='blocked' ? '募集掲示板の共有設定が未完了です。現在は招待コードで参加できます。' : board.status==='error' ? '募集一覧に接続できません。「更新」から再接続してください。' : '募集一覧に接続しています…';
    q('[data-online="create"]').disabled=board.busy || board.status!=='online';
    q('#onlineRooms').innerHTML=rooms.length ? rooms.map(([id,r])=>'<article class="online-room"><div class="online-room-signal">OPEN <span>1 / 2</span></div><h3>'+safe(r.title)+'</h3><p>HOST <b>'+safe(r.hostName)+'</b></p><div class="online-tags"><span>'+safe(CARD_SET_LABELS[normalizeCardSet(r.cardSet)])+'</span><span>CONTROL '+(r.controlEnabled?'あり':'なし')+'</span></div><button data-online="join" data-id="'+safe(id)+'" '+(board.busy || r.hostClientId===NET.clientId || board.status!=='online'?'disabled':'')+'>'+(r.hostClientId===NET.clientId?'あなたの募集':'この部屋に参加 ↗')+'</button></article>').join('') : board.status==='online' ? '<div class="online-empty"><span>◇</span><h3>最初の対戦相手を、募集しよう。</h3><p>いま募集している部屋はありません。</p></div>' : '';
  }
  function valid(r) {return r && r.v===1 && typeof r.hostClientId==='string' && typeof r.hostUid==='string' && typeof r.hostName==='string' && r.hostName.length<=32 && typeof r.title==='string' && r.title.length<=48 && netValidRoomCode(r.code) && Number.isFinite(r.createdAt) && Number.isFinite(r.expiresAt);}
  async function connect() {
    const epoch=++board.epoch;board.unsubscribe?.();board.unsubscribe=null;board.status='loading';board.rooms={};refreshRooms();
    try {
      const {dbM,db}=await netTimed(loadFirebase(),10000,'接続がタイムアウトしました');if(epoch!==board.epoch)return;
      const query=dbM.query(dbM.ref(db,'matchmaking'),dbM.orderByChild('updatedAt'),dbM.limitToLast(100));
      board.unsubscribe=dbM.onValue(query,snap=>{if(epoch!==board.epoch)return;board.status='online';board.rooms=snap.val()||{};refreshRooms();},err=>{if(epoch!==board.epoch)return;board.status=/permission/i.test(String(err.code||err.message))?'blocked':'error';board.rooms={};refreshRooms();});
    } catch(e){if(epoch!==board.epoch)return;board.status=/permission/i.test(String(e.code||e.message))?'blocked':'error';refreshRooms();}
  }
  function open() {
    ensure();root.hidden=false;root.scrollTop=0;
    q('#onlineName').value=localStorage.getItem('compile-online-name') || q('#name0')?.value || '';
    q('#onlineOptions').textContent=CARD_SET_LABELS[normalizeCardSet(draft.cardSet)]+' / CONTROL '+(readControlSetting()?'あり':'なし');
    void connect();
  }
  function hide() {if(root)root.hidden=true;++board.epoch;board.unsubscribe?.();board.unsubscribe=null;}
  async function unpublish() {
    clearInterval(board.heartbeat);board.heartbeat=null;board.metaOff?.();board.metaOff=null;
    const own=board.own;board.own=null;if(own && NET.fb)try{await NET.fb.dbM.remove(own.ref);}catch(e){console.warn('listing cleanup',e.code || e.message);}
  }
  async function publish(code,title,n) {
    const {dbM,db}=NET.fb,ref=dbM.ref(db,'matchmaking/'+NET.clientId), now=Date.now();
    const data={v:1,code,title,hostName:n,hostUid:NET.uid,hostClientId:NET.clientId,cardSet:normalizeCardSet(draft.cardSet),controlEnabled:!!draft.controlEnabled,createdAt:now,updatedAt:now,expiresAt:now+TTL};
    await netTimed(dbM.set(ref,data),8000,'募集の掲載がタイムアウトしました');board.own={ref,data};
    try{await dbM.onDisconnect(ref).remove();}catch(e){console.warn('listing disconnect cleanup',e.code);}
    board.heartbeat=setInterval(()=>{if(!board.own)return;void dbM.update(ref,{updatedAt:Date.now(),expiresAt:Date.now()+TTL}).catch(()=>void unpublish());},20000);
    board.metaOff=dbM.onValue(NET.metaRef,snap=>{if(snap.val()?.guestClientId || !snap.exists())void unpublish();});
  }
  async function action(type,id) {
    if(type==='home'){hide();return;}
    if(type==='refresh'){void connect();return;}
    const n=nameValue();if(!n){toast('あなたの名前を入力してください',3000);q('#onlineName').focus();return;}
    localStorage.setItem('compile-online-name',n);if(board.busy)return;board.busy=true;refreshRooms();
    try {
      if(type==='create') {
        const title=(q('#onlineRoomTitle').value.trim() || n+'の対戦ルーム').slice(0,48);
        await netHost({name:n,listed:true,onReserved:code=>publish(code,title,n)});await unpublish();
      } else if(type==='private') {await netHost({name:n});}
      else if(type==='join') {
        const r=board.rooms[id];if(!valid(r) || r.expiresAt<=Date.now())throw Error('この募集は終了しています');
        if(r.hostClientId===NET.clientId)throw Error('自分の募集には参加できません');
        await netJoin({name:n,code:r.code,cardSet:r.cardSet});
      } else if(type==='code') {await netJoin({name:n});}
    }catch(e){toast('接続できません：'+netFriendlyError(e),5000);}
    finally{board.busy=false;refreshRooms();}
  }
  const cancel=netCancelHostRoom;
  netCancelHostRoom=async function(){await unpublish();return cancel.apply(this,arguments);};
  const lobby=netLobby;
  netLobby=function(){hide();if(NET.role===0)void unpublish();return lobby.apply(this,arguments);};
  function install() {
    const b=q('#netHostBtn');if(!b)return;b.onclick=open;
    const desc=b.querySelector('em');if(desc)desc.textContent='募集掲示板で、対戦相手を見つける。';
  }
  const welcome=renderWelcome;
  renderWelcome=function(){const r=welcome.apply(this,arguments);install();return r;};
  async function home() {
    if(G?._arena){await window.COMPILE_ARENA?.home();return;}
    await netCancelHostRoom();clearTimeout(_nsT);_nsT=0;
    for(const p of Object.values(NET.pending || {})){clearTimeout(p.timer);clearInterval(p.abortTimer);p.resolve(null);}
    NET.pending={};showNetWait(false);hide();newGame();
  }
  function turnNotice() {
    if(!G || G.winner!=null){lastGame=null;lastTurn='';document.title=originalTitle;if(notice)notice.hidden=true;return;}
    if(lastGame!==G){
      // Online snapshots replace G on every message: use the turn key across those replacements.
      if(lastGame==null || !NET.on)lastTurn='';lastGame=G;
    }
    const cpu=G.mode==='cpu', me=NET.on ? NET.role : cpu ? (G.humanPlayer===1?1:0) : G.current;
    const actionable=G.current===me && !G.busy && !['handoff','gameover','end','cache'].includes(G.phase);
    document.title=actionable && (NET.on || cpu) ? 'あなたのターンです | COMPILE' : originalTitle;
    if(!actionable){if(notice)notice.hidden=true;return;}
    const key=G.turn+':'+G.current;if(lastTurn===key)return;lastTurn=key;
    if(!notice){notice=document.createElement('div');notice.id='yourTurn';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.innerHTML='<small>YOUR TURN</small><b>あなたのターンです</b>';document.body.append(notice);}
    notice.hidden=false;clearTimeout(turnTimer);turnTimer=setTimeout(()=>{notice.hidden=true;},3200);
    try{window.COMPILE_AUDIO?.sfx('turn');}catch{}
  }
  const draw=render;
  render=function(){const r=draw.apply(this,arguments);turnNotice();
    if(G?.winner!=null && q('#actionBar') && !q('#matchHome')){const b=document.createElement('button');b.id='matchHome';b.textContent='ホームに戻る';b.onclick=()=>void home();q('#actionBar .actions')?.append(b);}
    return r;
  };
  const modal=showModal;
  showModal=function(o){
    if(G?.winner!=null && /\sWIN\b/.test(String(o?.title))){
      if(!o.buttons?.some(b=>b.value==='home'))o={...o,buttons:[...(o.buttons||[]),{label:'ホームに戻る',value:'home'}]};
      return modal.call(this,o).then(async v=>{if(v==='home'){await home();return 'view';}return v;});
    }return modal.apply(this,arguments);
  };
  setInterval(()=>{if(root && !root.hidden)refreshRooms();},10000);
  window.COMPILE_MATCH_BOARD=Object.freeze({open,home});install();
})();
