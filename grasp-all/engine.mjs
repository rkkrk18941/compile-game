// UI-independent rules. All monetary values are token counts (one token = $100).
export const COIN_VALUE = 100;
export const cardLabel = c => c===0?'ドクロ':`$${c*COIN_VALUE}`;
export const DECK = [1,1,1,2,2,0];
export function createGame(first=0) {
 return {players:[0,1].map(()=>({life:3,coins:5,hand:[...DECK],discard:[]})),turn:first,round:1,step:1,phase:'offer',offer:null,result:null,winner:null,history:[]};
}
export function offerCard(s,index,claim='無言で差し出す') {
 if(s.phase!=='offer'||!Number.isInteger(index)||index<0||index>=s.players[s.turn].hand.length) return false;
 s.offer={by:s.turn,card:s.players[s.turn].hand.splice(index,1)[0],claim};s.phase='decide';return true;
}
function winner(s){const lost=s.players.map(p=>p.life<=0||p.coins<=0);if(lost.some(Boolean)){s.winner=lost.every(Boolean)?-1:lost[0]?1:0;return true;}return false;}
function reset(s){s.players.forEach(p=>{p.hand=[...DECK];p.discard=[];});s.round++;}
export function decide(s,take) {
 if(s.phase!=='decide'||typeof take!=='boolean')return false;
 const {by,card,claim}=s.offer,other=1-by,p=s.players[by],q=s.players[other],round=s.round;
 const result={by,card:take?card:null,take,claim,kind:'pass',amount:0,reset:false,penalties:[]};
 p.discard.push({card,open:take});
 if(take&&card===0){q.life--;result.kind='skull';}
 else if(take){const n=Math.min(card,p.coins);p.coins-=n;q.coins+=n;result.kind='money';result.amount=n;}
 // `reset` is only reported when the cards are really collected; a game-ending skull leaves the table as it is.
 if(!winner(s)){
  if(result.kind==='skull'){reset(s);result.reset=true;}
  else if(s.players.every(x=>x.hand.length===1)){
   result.kind+='-penalty';
   s.players.forEach((x,i)=>{const c=x.hand[0];if(c===0){x.life--;result.penalties.push({player:i,card:c,amount:0});}else{const paid=Math.min(c,x.coins);x.coins-=paid;result.penalties.push({player:i,card:c,amount:paid});}});
   if(!winner(s)){reset(s);result.reset=true;}
  }
 }
 s.result=result;s.history.unshift({...result,round,step:s.step});s.phase='result';return true;
}
export function advance(s){if(s.phase!=='result'||s.winner!==null)return false;s.turn=1-s.turn;s.step++;s.offer=null;s.result=null;s.phase='offer';return true;}
// A deliberately restricted CPU view: no opponent hand, no hidden discards, no offered card.
export function cpuView(s,id){const other=1-id;return {self:{life:s.players[id].life,coins:s.players[id].coins,hand:[...s.players[id].hand]},opponent:{life:s.players[other].life,coins:s.players[other].coins,count:s.players[other].hand.length,exposed:s.players[other].discard.filter(c=>c.open).map(c=>c.card)},claim:s.offer?.claim,round:s.round};}
export function cpuOffer(v,rng=Math.random){
 const weights=v.self.hand.map(c=>c===0?(v.opponent.life===1?4:1.8):c===2?(v.self.coins<=2?3:1.4):1);
 let n=rng()*weights.reduce((a,b)=>a+b,0),i=0;while(i<weights.length-1&&(n-=weights[i])>0)i++;
 return {index:i,claim:['お金だよ。受け取って。','ドクロかもしれないね。','今回は見送った方がいい。','さあ、どうする？'][Math.floor(rng()*4)]};
}
export function cpuDecision(v,difficulty='normal',rng=Math.random){
 if(difficulty==='easy')return rng()<.55;
 let pool=[...DECK];v.opponent.exposed.forEach(c=>{const i=pool.indexOf(c);if(i>=0)pool.splice(i,1);});
 const risk=pool.filter(c=>c===0).length/Math.max(1,pool.length);
 let chance=.72-risk*.7+(v.opponent.coins<=2?.12:0)-(v.self.life===1?.28:0)+(v.self.coins<=2?.1:0);
 if(risk===0)chance=1;
 return rng()<Math.max(.15,Math.min(1,chance));
}
