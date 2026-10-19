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
  const levels=t.rounds.length,slots=t.rounds[0].length*2,pitch=112,width=Math.max(672,slots*pitch),step=width/slots,base=levels*96+124,height=base+125;
  const pos=new Map();t.rounds.forEach((ids,r)=>ids.forEach((id,i)=>pos.set(id,{x:(i+.5)*2**(r+1)*step,y:base-(r+1)*96})));
  const edges=[];
  t.rounds.forEach((ids,r)=>ids.forEach((id,i)=>{
   const m=t.matches[id],p=pos.get(id);
   [m.a,m.b].forEach((eid,side)=>{
    const child=r?pos.get(m.sources[side]):{x:(i*2+side+.5)*step,y:base};
    const win=m.status==='done'&&m.winner!=null&&m.winner===eid;
    edges.push('<path class="tree-edge '+(win?'won':m.status==='live'?'active':'')+'" d="M'+child.x+' '+child.y+'V'+(p.y+72)+'H'+p.x+'V'+(p.y+51)+'"/>');
   });
  }));
  h+='<p class="note bracket-hint">参加者から上へ勝ち上がります。横にスクロールできます。試合をタップして観戦。</p><div class="bracket" tabindex="0" aria-label="下から上に進むトーナメント表"><div class="tree-stage" style="width:'+width+'px;height:'+height+'px"><svg class="tree-lines" width="'+width+'" height="'+height+'" aria-hidden="true">'+edges.join('')+'</svg>';
  h+='<div class="tree-winner" style="left:'+(width/2)+'px"><span>♛</span><strong>WINNER</strong><small>'+esc(t.over?name(t.champion):'栄冠は、誰の手に。')+'</small></div>';
  t.rounds.forEach((ids,r)=>ids.forEach(id=>{
   const m=t.matches[id],p=pos.get(id),ready=m.a!=null&&m.b!=null,status=m.bye?'不戦勝':m.status==='live'?'● LIVE':m.status==='done'?score(m)+(m.lot?' 抽選':''):ready?'開始待ち':'進出待ち';
   h+='<button class="tree-match '+m.status+(m.bye?' bye':'')+(m.id===mid?' selected':'')+'" style="left:'+p.x+'px;top:'+p.y+'px" '+(m.seats?'data-watch="'+m.id+'"':'disabled')+' aria-label="'+esc(roundName(t,r+1)+' '+name(m.a)+' 対 '+name(m.b)+' '+status)+'"><small>'+esc(roundName(t,r+1))+' · '+esc(status)+'</small><span>'+esc(m.bye?name(m.winner):name(m.a)+' / '+name(m.b))+'</span></button>';
  }));
  t.rounds[0].forEach((id,i)=>{const m=t.matches[id];[m.a,m.b].forEach((eid,side)=>{
   const e=ent(eid);h+='<div class="tree-entrant '+(!e?'empty':'')+'" style="left:'+((i*2+side+.5)*step)+'px;top:'+base+'px">'+(e?logoHTML(e.logo):'<span class="bye-mark">—</span>')+'<b>'+esc(e?.name||'不戦')+'</b><small>'+(e?.cpu?'CPU':e?'PLAYER':'BYE')+'</small></div>';
  });});h+='</div></div>';
 }else if(t.format==='league'){
  h+='<div class="ctitle">順位表</div><div class="stand-scroll"><table class="stand"><thead><tr><th>順位</th><th>名前</th><th>勝点</th><th>勝</th><th>分</th><th>負</th><th>旗差</th></tr></thead><tbody>'+t.standings.map((r,i)=>'<tr class="'+(i===0&&r.played?'top':'')+'"><td class="rk">'+(i+1)+'</td><td class="n"><span class="standing-name">'+logoHTML(ent(r.eid)?.logo)+esc(r.name)+'</span></td><td>'+r.p+'</td><td>'+r.w+'</td><td>'+r.d+'</td><td>'+r.l+'</td><td>'+(r.vp>0?'+':'')+r.vp+'</td></tr>').join('')+'</tbody></table></div>';
 }
 if(t.format!=='duel')h+='<details class="all-matches"><summary>全試合と結果</summary><div class="mlist">'+t.matches.filter(m=>!m.bye).map(m=>'<div class="match-line '+m.status+'"><small>'+(t.format==='cup'?roundName(t,m.round):'第'+m.round+'節')+'</small><span>'+esc(name(m.a))+' <b>'+esc(score(m)||'vs')+'</b> '+esc(name(m.b))+'</span>'+button(m)+'</div>').join('')+'</div></details>';
 return h;
}
