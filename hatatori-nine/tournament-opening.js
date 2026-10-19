import { logoHTML } from './player-logos.js?v=20261019-parallel-1';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function openingMatchups(t){
 const round=t.format==='cup'?t.rounds[0].map(id=>t.matches[id]):t.matches.filter(m=>m.round===1);
 const pairs=round.filter(m=>!m.bye&&m.a!=null&&m.b!=null),pages=[];
 for(let i=0;i<pairs.length;i+=2)pages.push(pairs.slice(i,i+2));
 return {pages:pages.length?pages:[[]],waiting:t.entrants.filter(e=>!pairs.some(m=>m.a===e.eid||m.b===e.eid))};
}
export function openingHTML(t,stepMs){
 const {pages,waiting}=openingMatchups(t),ent=id=>t.entrants.find(e=>e.eid===id);
 return '<div class="bk"></div><section class="opening-stage" role="dialog" aria-modal="true" aria-label="大会の組み合わせ発表"><header><small>HATATORI NINE · '+(t.format==='cup'?'TOURNAMENT':'ROUND ROBIN')+'</small><h2>組み合わせ発表</h2><p>それぞれの舞台へ。</p></header><div class="opening-pages">'+pages.map((pairs,i)=>'<div class="opening-page" data-opening-page="'+i+'"'+(i?' hidden':'')+'>'+pairs.map(m=>'<article class="opening-pair"><small>MATCH '+String(m.id+1).padStart(2,'0')+'</small><div class="opening-versus">'+[m.a,m.b].map((id,s)=>{const e=ent(id);return(s?'<i>VS</i>':'')+'<div class="opening-player">'+logoHTML(e.logo)+'<b>'+esc(e.name)+'</b><small>'+(e.cpu?'CPU':'PLAYER')+'</small></div>';}).join('')+'</div><span class="opening-line"></span></article>').join('')+'</div>').join('')+'</div>'+(waiting.length?'<p class="opening-wait">'+esc(waiting.map(e=>e.name).join('・'))+'：'+(t.format==='cup'?'不戦勝で次の試合へ':'今節はお休み')+'</p>':'')+'<footer><div class="opening-dots">'+pages.map((_,i)=>'<b data-opening-dot="'+i+'"'+(!i?' class="on"':'')+'></b>').join('')+'</div><p><span data-opening-count>1</span> / '+pages.length+' · このあとVS演出から対戦へ</p><button class="btn" data-opening-skip>タップして対戦へ</button><div class="opening-progress" style="--opening-time:'+stepMs+'ms"><i></i></div></footer></section>';
}
