// Eleven: deterministic rules, independent from the screen and CPU timers.
export const COLORS = ['blue', 'green', 'purple', 'orange', 'red'];
export function shuffle(cards, rng = Math.random) {
  for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  return cards;
}
export function deck() {
  let id = 0; const cards = [];
  for (const color of COLORS) for (let n = 1; n <= 9; n++) for (let k = 0; k < 2; k++) cards.push({id: id++, color, n});
  for (let i = 0; i < 10; i++) cards.push({id: id++, color: 'wild', n: 10});
  return cards;
}
// Neutral 10/0 cards can occupy only the endpoints, never a missing middle number.
export function sequence(cards) {
  if (!cards.length || cards.length > 11) return null;
  const normal = cards.filter(c => c.color !== 'wild').sort((a,b) => a.n-b.n);
  const wild = cards.filter(c => c.color === 'wild');
  if (wild.length > 2) return null;
  for (let i=1; i<normal.length; i++) if (normal[i].n !== normal[i-1].n+1) return null;
  if (!normal.length) return wild.length === 1 ? {cards: [...cards], values: [10], colors: 0} : null;
  const lo = normal[0].n, hi = normal.at(-1).n;
  let ordered = [...normal], values = normal.map(c=>c.n);
  if (wild.length === 2) {
    if (lo !== 1 || hi !== 9) return null;
    ordered = [wild[0], ...normal, wild[1]]; values = [0, ...values, 10];
  } else if (wild.length === 1) {
    if (lo === 1) { ordered.unshift(wild[0]); values.unshift(0); }
    else if (hi === 9) { ordered.push(wild[0]); values.push(10); }
    else return null;
  }
  return {cards: ordered, values, colors: new Set(normal.map(c=>c.color)).size};
}
export function canScore(cards) { const run=sequence(cards); return !!run && run.colors <= 1; }
export function newGame(config = {}, rng = Math.random) {
  const count = Math.max(2, Math.min(6, Number(config.count) || 3));
  const s = {version:1, mode:config.mode || 'cpu', difficulty:config.difficulty || 'normal', players:[], pile:shuffle(deck(),rng), discard:[], exchange:null, turn:0, moves:0, winner:null, log:[], lastScore:null};
  for(let i=0;i<count;i++) s.players.push({name:s.mode==='local'?`プレイヤー${i+1}`:i===0?'あなた':`CPU ${i}`, cpu:s.mode!=='local'&&i>0, hand:[], run:[], points:[], score:0});
  for(let j=0;j<11;j++) for(const p of s.players) p.hand.push(s.pile.pop());
  s.exchange=s.pile.pop(); s.log.push('11枚ずつ配りました。先に11点を目指しましょう。');
  return s;
}
export function draw(s, rng = Math.random) {
  if(!s.pile.length) { if(!s.discard.length) throw Error('補充できるカードがありません'); s.pile=shuffle(s.discard.splice(0),rng); }
  return s.pile.pop();
}
export function takeAction(s, action, rng = Math.random) {
  if(s.winner !== null) throw Error('ゲームは終了しています');
  const p=s.players[s.turn], ids=action.ids || [], chosen=ids.map(id=>p.hand.find(c=>c.id===id));
  if(!ids.length || new Set(ids).size!==ids.length || chosen.some(c=>!c)) throw Error('手札を選んでください');
  let run, target;
  if(action.type==='play') {
    run=sequence(chosen);
    if(!run || (chosen.length<2 && !(chosen.length===p.hand.length && canScore(chosen)))) throw Error('数字が続く2枚以上を選んでください。10/0は両端だけです');
  } else if(action.type==='exchange') {
    if(chosen.length!==1 || !s.exchange) throw Error('交換する手札を1枚選んでください');
  } else if(action.type==='discard') {
    if(chosen.length!==1) throw Error('捨てる手札を1枚選んでください');
    if(action.source !== 'deck') {
      target=s.players[action.player];
      if(!target || target===p || !target.run.some(c=>c.id===action.card)) throw Error('他の人の場札を選んでください');
    }
  } else throw Error('不明な操作です');
  // Validate everything before mutating; invalid taps cannot lose a card.
  p.hand=p.hand.filter(c=>!ids.includes(c.id)); s.lastScore=null;
  let message;
  if(action.type==='exchange') {
    p.hand.push(s.exchange); s.exchange=chosen[0]; message=`${p.name}：交換札と1枚交換`;
  } else if(action.type==='discard') {
    s.discard.push(chosen[0]);
    if(target) { const i=target.run.findIndex(c=>c.id===action.card); p.hand.push(target.run.splice(i,1)[0]); }
    else p.hand.push(draw(s,rng));
    message=`${p.name}：1枚捨てて${target?target.name+'の場札':'山札'}から補充`;
  } else {
    s.discard.push(...p.run); p.run=run.cards;
    if(!p.hand.length && run.colors<=1) {
      const revealed=[]; let last;
      do { last=draw(s,rng); p.points.push(last); const pts=last.n; p.score+=pts; revealed.push(pts); }
      while(last.n===1 && p.score<11);
      const gained=revealed.reduce((a,b)=>a+b,0);
      s.lastScore={player:s.turn, gained, revealed, refill:p.score>=11?0:last.n};
      message=`${p.name}：出し切り！ ${revealed.join('＋')}点獲得（合計${p.score}点）`;
      if(p.score>=11) s.winner=s.turn;
      else for(let i=0;i<last.n;i++) p.hand.push(draw(s,rng));
    } else {
      for(let i=0;i<run.colors;i++) p.hand.push(draw(s,rng));
      message=`${p.name}：${run.values.join('–')}を出して${run.colors}色・${run.colors}枚補充`;
    }
  }
  s.log.unshift(message); s.log=s.log.slice(0,35); s.moves++;
  if(s.winner===null) s.turn=(s.turn+1)%s.players.length;
  return s;
}
export function legalRuns(hand) {
  const result=[];
  for(let mask=1;mask<(1<<hand.length);mask++) {
    const cards=hand.filter((_,i)=>mask&(1<<i));
    if(cards.length===1 && hand.length!==1) continue;
    const run=sequence(cards); if(run) result.push({...run, ids:cards.map(c=>c.id), finish:cards.length===hand.length&&run.colors<=1});
  }
  return result;
}
function promise(hand) {
  let best=0;
  for(const color of COLORS) {
    const numbers=new Set(hand.filter(c=>c.color===color).map(c=>c.n));
    let longest=0, streak=0;
    for(let n=1;n<=9;n++) { streak=numbers.has(n)?streak+1:0; longest=Math.max(longest,streak); }
    best=Math.max(best,numbers.size*.7+longest*1.5);
  }
  return best + hand.filter(c=>c.color==='wild').length*.65;
}
export function cpuAction(s, rng = Math.random) {
  const p=s.players[s.turn], runs=legalRuns(p.hand), finish=runs.find(r=>r.finish);
  if(finish) return {type:'play',ids:finish.ids};
  const base=promise(p.hand), candidates=[];
  for(const run of runs) {
    const reduction=run.ids.length-run.colors;
    if(reduction<=0) continue;
    const rest=p.hand.filter(c=>!run.ids.includes(c.id));
    candidates.push({action:{type:'play',ids:run.ids}, value:reduction*2.8+promise(rest)-base+.3});
  }
  const sources=[{source:'exchange',card:s.exchange}];
  s.players.forEach((other,i)=>{if(i!==s.turn) other.run.forEach(card=>sources.push({source:'run',player:i,card}));});
  for(const card of p.hand) for(const source of sources) {
    if(!source.card) continue;
    const next=p.hand.filter(c=>c.id!==card.id).concat(source.card);
    const value=canScore(next)?100:promise(next)-base;
    candidates.push({action:source.source==='exchange'?{type:'exchange',ids:[card.id]}:{type:'discard',ids:[card.id],source:'run',player:source.player,card:source.card.id},value});
  }
  candidates.sort((a,b)=>b.value-a.value);
  if(candidates.length && candidates[0].value>.1 && !(s.difficulty==='easy'&&rng()<.28)) return candidates[0].action;
  let worst=p.hand[0], best=-Infinity;
  for(const card of p.hand) { const v=promise(p.hand.filter(c=>c.id!==card.id)); if(v>best){best=v;worst=card;} }
  return {type:'discard',ids:[worst.id],source:'deck'};
}
