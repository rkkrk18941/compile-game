import * as A from './art.js';
const E = window.NFD_ENG, T = window.NFD_LESSONS, lessons = T.lessons;
const root = document.querySelector('#tutorial');
const KEY = 'nfd.tutorial.v1';
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let saved = {};
try { const v=JSON.parse(localStorage.getItem(KEY)); if(v&&typeof v==='object') saved=v; } catch {}
const completed = new Set(Array.isArray(saved.done)?saved.done.filter(x=>lessons.some(l=>l.id===x)):[]);
let index = Number.isInteger(saved.step)&&saved.step>=0&&saved.step<lessons.length?saved.step:0;
let state = null, selected = null, receipt = '', notice = '';
function save(){try{localStorage.setItem(KEY,JSON.stringify({step:index,done:[...completed]}));}catch{}}
function focus(selector,scroll=true){const el=root.querySelector(selector);if(el){el.focus({preventScroll:true});if(scroll)el.scrollIntoView({block:'nearest'});}}
function intro(){
 root.innerHTML='<section class="hero"><span class="eyebrow">GUIDED PRACTICE / はじめての方へ</span><h1>ひとつ建てたら、<br>ひとつわかる。</h1><p class="lead">都市づくりは、カード1枚から。<br>小さな盤面で実際に選んで、支払って、勝つところまで。<br>ルールを全部覚えてから始める必要はありません。</p><span class="pill">12の小さな練習</span><span class="pill">自分のペースで</span><span class="pill">途中から再開OK</span><div class="actions">'+
 (completed.size||index>0?'<button class="btn primary" data-command="resume">続きから練習する →</button>':'')+
 '<button class="btn '+(completed.size||index>0?'ghost':'primary')+'" data-command="begin">最初から練習する →</button></div><p class="small">練習は好きなだけやり直せます。本番の対戦成績には影響しません。</p><div class="intro-grid"><article class="intro-card"><span class="number">01</span><b>1枚、取ってみる</b><p>不思議の予約と、カードの選び方。自分の都市を育てる最初の一歩。</p></article><article class="intro-card"><span class="number">02</span><b>お金と資源を使う</b><p>何度も使える資源、足りない分の交易、売却と無料の連鎖。</p></article><article class="intro-card"><span class="number">03</span><b>勝ち方を体験する</b><p>不思議を建てて、軍事・科学・点数の決着をそれぞれ体験。</p></article></div></section>';
}
function start(i){
 index=i;state=lessons[index].setup();selected=null;receipt='';notice='';save();render();focus('h1');
}
function image(kind,value){return '<img src="'+A.iconURL(kind,value)+'" alt="">';}
function city(seat){
 const p=state.p[seat],score=E.score(state)[seat],prod=E.production(p);
 let h='<section class="city '+(seat===0?'you':'opponent')+'" aria-label="'+(seat===0?'あなた':'相手')+'の都市"><div class="city-head"><strong>'+(seat===0?'あなたの都市':'相手の都市')+'</strong><span>'+(state.phase==='draft'?'予約 '+p.wonders.length+' / 4':'')+'</span></div><div class="stats"><span>コイン <b>'+p.coins+'</b></span><span>勝利点 <b>'+score.total+'</b></span></div>';
 h+='<p class="resource-line">生産：'+(E.RES.filter(k=>prod.fixed[k]).map(k=>image('res',k)+E.RES_NAME[k]+' '+prod.fixed[k]).join(' / ')||'まだなし')+'</p>';
 if(p.cards.length)h+='<div class="city-cards">'+p.cards.map(id=>'<span class="city-tag" style="--card-color:'+A.TYPE_COL[E.CARDS[id].type][0]+'">'+esc(E.CARDS[id].name)+'</span>').join('')+'</div>';
 if(p.wonders.length)h+='<div class="city-cards">'+p.wonders.map(w=>'<span class="city-tag wonder">'+(w.card>=0?'完成 ':'予約 ')+esc(E.WONDERS[w.w].short)+'</span>').join('')+'</div>';
 if(['progress','science'].includes(lessons[index].id)){
  const counts=E.sciCounts(p);
  h+='<div class="sci-line"><span>科学 '+E.distinctSci(p)+'種類</span>'+E.SCI.filter(k=>k!=='law'||counts[k]).map(k=>'<span class="symbol '+(!counts[k]?'empty':'')+'" title="'+E.SCI_NAME[k]+'">'+image('sci',k)+'<span>'+counts[k]+'</span></span>').join('')+'</div>';
 }
 if(p.tok.length)h+='<div class="city-cards">'+p.tok.map(t=>'<span class="city-tag">'+esc(E.TOKENS[t].name)+'</span>').join('')+'</div>';
 return h+'</section>';
}
function card(i){
 const s=state.slots[i],c=E.CARDS[s.card],blocked=!E.accessible(state,i),done=!!lessons[index].done(state);
 const target=!done&&!state.pend&&i===T.target(lessons[index],state);
 const name=s.up?c.name:'裏向きのカード';
 const cost=s.up?E.cardCost(state,0,c.id):null;
 return '<button class="playing-card '+(s.taken?'taken':blocked?'blocked':'')+(target?' target':'')+(selected===i?' selected':'')+'" data-slot="'+i+'" aria-label="'+esc(name)+(s.taken?'（取得済み）':blocked?'（まだ取れません）':target?'（練習で選ぶカード）':'')+'"'+(s.taken||done?' disabled':'')+' aria-pressed="'+(selected===i)+'">'+
 (s.up?'<img src="'+A.cardURL(c.id)+'" alt="">':'<div class="back-art" aria-hidden="true">?</div>')+
 '<strong>'+esc(name)+'</strong><span class="caption">'+(s.taken?'取得済み':blocked?'手前のカードを取ると開く':cost.chain?'連鎖で無料':cost.coins?cost.coins+'コインで建設':'無料で建設')+'</span></button>';
}
function board(){
 const l=lessons[index],done=!!l.done(state);
 if(state.phase==='draft')return '<p class="board-label">好きな不思議を予約しましょう · あと'+(4-state.p[0].wonders.length)+'つ</p><div class="board">'+state.draft.pool.map(w=>'<button class="playing-card wonder-card" data-draft="'+w+'" aria-label="'+esc(E.WONDERS[w].name)+'を予約"><img src="'+A.wonderURL(w)+'" alt=""><strong>'+esc(E.WONDERS[w].name)+'</strong><span class="caption">'+esc(E.wonderText(w).join(' / '))+'</span></button>').join('')+'</div>';
 if(l.id==='draft'&&done)return '<p class="board-label">予約した不思議は、対戦中に建てていきます。</p><div class="board">'+state.p[0].wonders.map(w=>'<div class="playing-card wonder-card"><img src="'+A.wonderURL(w.w)+'" alt=""><strong>'+esc(E.WONDERS[w.w].name)+'</strong><span class="caption">あなたが予約した不思議</span></div>').join('')+'</div>';
 let h='<p class="board-label">'+(done?'操作後の盤面':state.pend?'同じ科学が2つそろいました。進歩トークンを選びましょう。':'金色の枠が、今の練習で選ぶカードです。')+'</p><div class="board">';
 if(l.id==='uncover')h+='<div class="board-row back-row">'+card(0)+'</div><div class="board-row front-row">'+state.slots.slice(1).map((_,i)=>card(i+1)).join('')+'</div>';
 else h+=state.slots.map((_,i)=>card(i)).join('');
 h+='</div>';
 if(state.pend&&state.pend.k==='progress')h+='<div class="token-grid">'+state.pend.opts.map(t=>'<button class="token '+(t===E.T.AGRI?'target':'')+'" data-token="'+t+'">'+image('tok',t)+'<b>'+esc(E.TOKENS[t].name)+'</b><small>'+esc(E.TOKENS[t].text)+'</small></button>').join('')+'</div>';
 return h;
}
function military(){
 if(!['trade','military'].includes(lessons[index].id))return '';
 return '<section class="military" aria-label="軍事コマの位置：中央から相手側へ'+state.mil+'マス"><p><span>あなたの首都</span><span>中央</span><span>相手の首都</span></p><div class="mil-track" aria-hidden="true">'+Array.from({length:19},(_,i)=>'<span class="'+(i===9?'center ':'')+(i===0||i===18?'capital ':'')+(i===state.mil+9?'pawn':'')+'"></span>').join('')+'</div></section>';
}
function selection(){
 if(selected==null||state.pend||lessons[index].done(state))return '';
 const c=E.CARDS[state.slots[selected].card],cost=E.cardCost(state,0,c.id);
 const buy=Object.entries(cost.buy||{}).map(([k,n])=>E.RES_NAME[k]+n+'つ × '+E.prices(state,0)[k]+'コイン').join('、');
 let h='<section class="selection" aria-label="カードの使い道"><h2 tabindex="-1" id="selectedTitle">'+esc(c.name)+'</h2><p class="effect">'+esc(E.cardText(c.id).join(' / '))+'</p><p>本来のコスト：'+esc(E.costText(c.cost,c.$))+'</p>'+
 (cost.chain?'<p class="hint">🔗 自分の都市に同じ連鎖マークがあるので無料です。</p>':buy?'<p class="hint">不足分を自動で購入：'+esc(buy)+'</p>':'')+
 '<p>今回の支払い：<b>'+cost.coins+'コイン</b> / 所持 '+state.p[0].coins+'コイン'+(!cost.ok?'（お金が足りません。売ることはできます）':'')+'</p><div class="actions">'+
 '<button class="btn '+(lessons[index].id!=='sell'&&lessons[index].id!=='wonder'?'primary':'')+'" data-action="build"'+(!cost.ok?' disabled':'')+'>建てる（'+(cost.chain?'連鎖・無料':cost.coins+'コイン')+'）</button>'+
 '<button class="btn '+(lessons[index].id==='sell'?'primary':'')+'" data-action="discard">売る（＋'+E.discardValue(state.p[0])+'コイン）</button>';
 state.p[0].wonders.filter(w=>w.card<0).forEach(w=>{
  const cost=E.wonderCost(state,0,w.w);
  h+='<button class="btn '+(lessons[index].id==='wonder'?'primary':'')+'" data-action="wonder" data-wonder="'+w.w+'"'+(!cost.ok?' disabled':'')+'>'+esc(E.WONDERS[w.w].short)+'を建てる（'+cost.coins+'コイン）</button>';
 });
 return h+'</div><p>建てるとカードの効果、売るとお金、土台にすると不思議の効果。使い道は1つだけです。</p></section>';
}
function results(){
 if(lessons[index].id!=='score'||!state.result)return '';
 const scores=E.score(state),rows=[['blue','青カード'],['coin','残ったコイン'],['wonder','不思議'],['mil','軍事'],['total','合計']];
 return '<table class="result"><thead><tr><th scope="col">得点の内訳</th><th scope="col">あなた</th><th scope="col">相手</th></tr></thead><tbody>'+rows.map(([key,label])=>'<tr class="'+(key==='total'?'total':'')+'"><th scope="row">'+label+'</th><td>'+scores[0][key]+'</td><td>'+scores[1][key]+'</td></tr>').join('')+'</tbody></table>';
}
function render(){
 const l=lessons[index],done=!!l.done(state);
 root.innerHTML='<div class="progress-line"><p>練習 '+(index+1)+' / '+lessons.length+'</p><div class="progress-track" role="progressbar" aria-label="練習の進み具合" aria-valuemin="0" aria-valuemax="'+lessons.length+'" aria-valuenow="'+(index+(done?1:0))+'"><span style="width:'+((index+(done?1:0))/lessons.length*100)+'%"></span></div><p>'+esc(l.group)+'</p></div><div class="course">'+
 '<aside class="coach"><span class="eyebrow">LESSON '+String(index+1).padStart(2,'0')+'</span><h1 tabindex="-1">'+esc(l.title)+'</h1><p class="intro">'+esc(l.intro)+'</p><div class="task"><b>'+(done?'できました！':'今やること')+'</b><p>'+esc(done?'右の結果を確かめて、次へ進みましょう。':l.task)+'</p></div><details class="why"><summary>もう少しくわしく</summary><p>'+esc(l.why)+'</p></details><div class="coach-nav"><button class="btn ghost" data-command="previous"'+(index===0?' disabled':'')+'>← 前の練習</button><button class="btn ghost" data-command="retry">この練習をやり直す</button></div><details class="toc"><summary>目次から練習を選ぶ · 完了 '+completed.size+' / '+lessons.length+'</summary>'+lessons.map((item,i)=>'<button data-jump="'+i+'"'+(index===i?' aria-current="step"':'')+'><span class="tick">'+(completed.has(item.id)?'✓':String(i+1).padStart(2,'0'))+'</span>'+esc(item.title)+'</button>').join('')+'</details></aside>'+
 '<section class="table" aria-label="練習の盤面"><div class="table-heading"><span>練習用の小さな盤面</span><span class="turn">'+(done?'練習完了':state.pend?'ボーナスを選ぶ':state.phase==='draft'?'あなたの予約の番':'あなたの番')+'</span></div><div class="cities">'+city(0)+city(1)+'</div>'+military()+board()+
 (receipt?'<p class="receipt">'+esc(receipt)+'</p>':'')+selection()+results()+
 '<p class="notice" role="status" aria-live="polite">'+esc(notice)+'</p>'+
 (done?'<section class="feedback"><h2 tabindex="-1" id="feedbackTitle">✓ '+(state.result?{military:'軍事的勝利',science:'科学的勝利',civil:'繁栄による勝利'}[state.result.how]:'この操作を覚えました')+'</h2><p>'+esc(l.success)+'</p><button class="btn primary" data-command="next">'+(index===lessons.length-1?'練習のまとめを見る →':'次の練習へ →')+'</button></section>':'')+
 '</section></div>';
}
function perform(action){
 const before=E.clone(state),r=T.act(lessons[index],state,action);
 if(!r.ok){notice=r.message;const el=root.querySelector('.notice');el.textContent=notice;el.scrollIntoView({block:'nearest'});return;}
 const bits=[];
 if(action.k==='draft')bits.push(E.WONDERS[action.w].name+'を予約しました。');
 else if(action.k==='progress')bits.push(E.TOKENS[action.tok].name+'を獲得しました。');
 else bits.push(E.CARDS[before.slots[action.slot].card].name+'を'+({build:'建設しました。',discard:'売りました。',wonder:'不思議の土台にしました。'}[action.k]));
 if(before.p[0].coins!==state.p[0].coins)bits.push('コイン '+before.p[0].coins+'→'+state.p[0].coins+'。');
 if(r.opponent)bits.push(lessons[index].id==='draft'?'相手も不思議を予約しました。':'相手も1枚建てました。次はあなたの番です。');
 if(r.events.some(e=>e.t==='reveal'))bits.push('奥のカードが表になりました。');
 receipt=bits.join(' ');selected=null;notice='';
 if(r.done){completed.add(lessons[index].id);if(index<lessons.length-1){try{localStorage.setItem(KEY,JSON.stringify({step:index+1,done:[...completed]}));}catch{}}else save();}else save();
 render();
 if(r.done)focus('#feedbackTitle');
 else if(state.pend)focus('[data-token]');
 else {const target=root.querySelector('[data-slot="'+T.target(lessons[index],state)+'"]')||root.querySelector('[data-draft]');if(target){target.focus({preventScroll:true});target.scrollIntoView({block:'nearest'});}}
}
function completion(){
 save();
 root.innerHTML='<section class="completion"><span class="eyebrow">READY TO BUILD</span><h1 tabindex="-1">あとは、あなたの都市で。</h1><p>完了した練習：'+completed.size+' / '+lessons.length+'。対戦中に迷ったら、いつでも練習へ戻ってこられます。</p><div class="cheatsheet"><article><h2>毎手番は「1枚→1つの使い道」</h2><p>重なりがないカードを取って、建てる・売る・不思議の土台にする。普通は、そのあと相手の番です。</p></article><article><h2>資源は使い捨てにしない</h2><p>茶・灰の生産は何度も使えます。不足分はコインで自動購入。苦しくなったら売却です。</p></article><article><h2>軍事か科学なら、その場で勝ち</h2><p>軍事コマを相手の首都へ。あるいは科学を6種類。同じ科学2つは進歩トークンのボーナスです。</p></article><article><h2>決着しなければ、最後は点数</h2><p>3つの時代を終えたら合計点で勝負。序盤は資源、終盤は点数を意識すると動きやすくなります。</p></article></div><details class="why"><summary>本番はどう進む？</summary><p>不思議を4つずつ予約してから、第一・第二・第三時代を遊びます。各時代の20枚を取り切ると次の時代へ。軍事で押されている人が次の先手を決めます（中央なら最後に取った人）。途中で軍事・科学の勝利が出れば即終了です。不思議は全員合わせて7つまでで、一部には「もう一度手番」の効果もあります。</p></details><div class="actions"><a class="btn primary" href="./?mode=solo">CPU対戦を始める →</a><button class="btn ghost" data-command="begin">もう一度、最初から練習</button><a class="btn ghost" href="./">タイトルへ</a></div><p class="small">最初は「やさしい」CPUがおすすめ。建てたいカードを1枚選ぶところから、始めてみましょう。</p></section>';
 focus('h1');
}
root.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b||b.disabled)return;
 if(b.dataset.command){const cmd=b.dataset.command;if(cmd==='begin')start(0);else if(cmd==='resume')start(index);else if(cmd==='retry')start(index);else if(cmd==='previous')start(index-1);else if(cmd==='next'){if(!lessons[index].done(state))return;if(index===lessons.length-1)completion();else start(index+1);}return;}
 if(b.dataset.jump!=null){start(Number(b.dataset.jump));return;}
 if(b.dataset.draft!=null){perform({k:'draft',w:Number(b.dataset.draft)});return;}
 if(b.dataset.token!=null){perform({k:'progress',tok:Number(b.dataset.token)});return;}
 if(b.dataset.slot!=null){
  const i=Number(b.dataset.slot);
  if(!E.accessible(state,i)){const el=root.querySelector('.notice');el.textContent='このカードにはまだ別のカードが重なっています。先に手前のカードを取りましょう。';el.scrollIntoView({block:'nearest'});return;}
  if(state.pend){const el=root.querySelector('.notice');el.textContent='先に進歩トークンを選びましょう。';return;}
  selected=i;notice='';render();focus('#selectedTitle');return;
 }
 if(b.dataset.action&&selected!=null)perform({k:b.dataset.action,slot:selected,...(b.dataset.wonder!=null?{w:Number(b.dataset.wonder)}:{})});
});
intro();

