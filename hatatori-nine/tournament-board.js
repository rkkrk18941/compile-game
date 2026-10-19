import { cupBracketHTML } from './tournament-tree.js?v=20261019-bracket-2';
import { logoHTML } from './player-logos.js?v=20261019-parallel-1';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function roundName(t,r){const left=Math.ceil(Math.log2(Math.max(2,t.entrants.length)))-r;return left===0?'決勝':left===1?'準決勝':left===2?'準々決勝':r+'回戦';}
export function tourBoardHTML(t,{cid,mid}={}){
 const ent=id=>t.entrants.find(e=>e.eid===id),name=id=>ent(id)?.name||'進出待ち';
 const mine=m=>[m.a,m.b].some(id=>{const e=ent(id);return e&&!e.cpu&&e.owner===cid;});
 const score=m=>m.score?(m.seats[0]===m.a?m.score:m.score.slice().reverse()).join(' : '):'';
 const live=t.matches.filter(m=>m.status==='live');
 const button=m=>m.seats?'<button class="btn '+(m.id===mid?'primary':'')+'" data-watch="'+m.id+'">'+(m.id===mid?'表示中':mine(m)?'自分の試合へ':m.status==='live'?'観戦する':'盤面を見る')+'</button>':'';
 let h='<div class="arena-status"><span class="live-dot"></span><b>'+live.length+'試合同時進行</b><span>'+t.matches.filter(m=>m.status==='done'&&!m.bye).length+' / '+t.matches.filter(m=>!m.bye).length+'試合終了</span></div>';
 if(t.over&&t.champion!=null)h+='<div class="champ">'+logoHTML(ent(t.champion)?.logo)+'<div><small>CHAMPION</small>優勝 '+esc(name(t.champion))+'</div></div>';
 if(live.length)h+='<div class="live-matches">'+live.map(m=>'<div class="live-match '+(m.id===mid?'selected':'')+'"><small>LIVE · '+(t.format==='cup'?roundName(t,m.round):t.format==='league'?'第'+m.round+'節':'対戦')+(mine(m)?' · あなたの試合':'')+'</small><div class="live-pair">'+logoHTML(ent(m.a)?.logo)+'<b>'+esc(name(m.a))+'</b><i>VS</i><b>'+esc(name(m.b))+'</b>'+logoHTML(ent(m.b)?.logo)+'</div>'+button(m)+'</div>').join('')+'</div>';
 if(t.format==='cup'){
  h=cupBracketHTML(t,{mid})+h;
 }else if(t.format==='league'){
  h+='<div class="ctitle">順位表</div><div class="stand-scroll"><table class="stand"><thead><tr><th>順位</th><th>名前</th><th>勝点</th><th>勝</th><th>分</th><th>負</th><th>旗差</th></tr></thead><tbody>'+t.standings.map((r,i)=>'<tr class="'+(i===0&&r.played?'top':'')+'"><td class="rk">'+(i+1)+'</td><td class="n"><span class="standing-name">'+logoHTML(ent(r.eid)?.logo)+esc(r.name)+'</span></td><td>'+r.p+'</td><td>'+r.w+'</td><td>'+r.d+'</td><td>'+r.l+'</td><td>'+(r.vp>0?'+':'')+r.vp+'</td></tr>').join('')+'</tbody></table></div>';
 }
 if(t.format!=='duel')h+='<details class="all-matches"><summary>全試合と結果</summary><div class="mlist">'+t.matches.filter(m=>!m.bye).map(m=>'<div class="match-line '+m.status+'"><small>'+(t.format==='cup'?roundName(t,m.round):'第'+m.round+'節')+'</small><span>'+esc(name(m.a))+' <b>'+esc(score(m)||'vs')+'</b> '+esc(name(m.b))+'</span>'+button(m)+'</div>').join('')+'</div></details>';
 return h;
}
