import {logoHTML,PLAYER_LOGOS} from './player-logos.js?v=20261019-parallel-1';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Collapse bye branches, so six entrants produce six logos, as on a tournament poster.
export function bracketLayout(t){
 const ids=t.rounds[0].flatMap(id=>[t.matches[id].a,t.matches[id].b]).filter(id=>id!=null),width=Math.max(960,ids.length*164),levels=t.rounds.length;
 const leafY=190+levels*85+34,height=leafY+172,leaves=ids.map((eid,i)=>({eid,x:(i+.5)*width/ids.length,y:leafY})),byId=new Map(leaves.map(p=>[p.eid,p])),nodes=new Map();
 function node(id){
  if(nodes.has(id))return nodes.get(id);
  const m=t.matches[id];if(m.bye){const p=byId.get(m.winner);nodes.set(id,p);return p;}
  const children=m.sources?m.sources.map(node):[byId.get(m.a),byId.get(m.b)];
  const low=Math.min(...children.map(p=>p.low??p.x)),high=Math.max(...children.map(p=>p.high??p.x));
  const p={id:m.id,x:(low+high)/2,y:190+(levels-m.round)*85,low,high,children};nodes.set(id,p);return p;
 }
 const root=node(t.rounds.at(-1)[0]);return{width,height,leafY,leaves,nodes,root};
}
export function cupBracketHTML(t,{mid}={}){
 const {width:W,height:H,leafY,leaves,nodes,root}=bracketLayout(t),key='htn-poster-'+leaves.length;
 const ent=id=>t.entrants.find(e=>e.eid===id),name=id=>ent(id)?.name||'進出待ち';
 const crown='<path d="M-42 10-48-27-22-10 0-43 22-10 48-27 42 10Z" fill="#f7cf44" stroke="#192949" stroke-width="5" stroke-linejoin="round"/><path d="M-39 20H39" stroke="#192949" stroke-width="6"/>';
 let svg='<svg class="championship-poster tree-lines" viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="参加者から優勝までの全体トーナメント表"><defs><linearGradient id="'+key+'-band"><stop stop-color="#24548b"/><stop offset=".5" stop-color="#724b85"/><stop offset="1" stop-color="#ca354e"/></linearGradient><linearGradient id="'+key+'-paper"><stop stop-color="#e0ecff"/><stop offset=".5" stop-color="#fffdf5"/><stop offset="1" stop-color="#ffe2e4"/></linearGradient><pattern id="'+key+'-dots" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="8" cy="8" r="7" fill="#697bac" opacity=".13"/></pattern></defs><rect width="'+W+'" height="'+H+'" rx="18" fill="url(#'+key+'-paper)"/><rect y="55" width="'+W+'" height="'+(H-55)+'" fill="url(#'+key+'-dots)"/><rect width="'+W+'" height="58" rx="12" fill="url(#'+key+'-band)"/><text x="'+W/2+'" y="40" text-anchor="middle" font-size="29" font-weight="900" fill="#fffaf1" font-family="system-ui,sans-serif">トーナメント表</text><g transform="translate('+root.x+' 103) scale(.48)">'+crown+'</g><text x="'+root.x+'" y="160" text-anchor="middle" font-size="64" font-weight="1000" font-family="Arial Black,Arial,sans-serif" fill="#f8d544" stroke="#1a2b4e" stroke-width="7" paint-order="stroke" letter-spacing="2">WINNER</text>';
 const paths=[],chips=[];
 for(const [id,p]of nodes){
  const m=t.matches[id];if(m.bye)continue;
  p.children.forEach((c,side)=>{
   const winner=m.status==='done'&&m.winner!=null&&m.winner===(side?m.b:m.a),cls=winner?' won':m.status==='live'?' active':'';
   paths.push('<path class="poster-edge'+cls+'" d="M'+c.x+' '+c.y+'V'+p.y+'H'+p.x+'"/>');
  });
  const score=m.score?(m.seats[0]===m.a?m.score:m.score.slice().reverse()).join(' : '):'';
  const label=m.status==='live'?'● LIVE':m.status==='done'?score:'',round=t.rounds.length-m.round===0?'決勝':t.rounds.length-m.round===1?'準決勝':m.round+'回戦';
  const aria=esc(round+' '+name(m.a)+' 対 '+name(m.b)+' '+(label||'開始待ち'));
  chips.push('<g class="poster-match '+m.status+(m.id===mid?' selected':'')+'"'+(m.seats?' data-watch="'+m.id+'" role="button" tabindex="0"':'')+' aria-label="'+aria+'"><title>'+aria+'</title><rect x="'+(p.x-65)+'" y="'+(p.y-13)+'" width="130" height="26" rx="13"/><text x="'+p.x+'" y="'+(p.y+5)+'" text-anchor="middle" font-size="13" font-weight="800" font-family="system-ui,sans-serif">'+esc(round+(label?' · '+label:''))+'</text></g>');
 }
 svg+='<g fill="none" stroke-linejoin="round" stroke-linecap="round">'+paths.join('')+'<path class="poster-edge'+(t.over?' won':'')+'" d="M'+root.x+' '+root.y+'V174"/></g>'+chips.join('');
 for(const p of leaves){
  const e=ent(p.eid),logo=PLAYER_LOGOS.find(l=>l.id===e.logo),color=logo?.color||'#65d5ff',lost=t.standings.find(r=>r.eid===p.eid)?.alive===false;
  const mark=logoHTML(e.logo).replace('class="player-logo ','class="poster-logo ').replace('<svg ','<svg x="'+(p.x-55)+'" y="'+(leafY+8)+'" width="110" height="110" ');
  svg+='<g class="poster-entrant'+(lost?' eliminated':'')+'" data-entrant="'+p.eid+'">'+mark+'<rect x="'+(p.x-75)+'" y="'+(leafY+124)+'" width="150" height="43" rx="14" fill="#fffdf6" stroke="'+color+'" stroke-width="3"/><text x="'+p.x+'" y="'+(leafY+137)+'" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" font-weight="800" fill="#52637b">'+(e.cpu?'CPU · LV '+e.cpu:'PLAYER')+'</text><text x="'+p.x+'" y="'+(leafY+157)+'" text-anchor="middle" font-family="system-ui,sans-serif" font-size="'+(e.name.length>7?15:20)+'" font-weight="900" fill="#172b4c">'+esc(e.name)+'</text></g>';
 }
 if(t.over)svg+='<text x="'+root.x+'" y="'+(root.y+44)+'" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" font-weight="900" fill="#8a5e12">優勝 '+esc(name(t.champion))+'</text>';
 svg+='</svg>';
 return '<section class="bracket-frame"><div class="bracket-toolbar"><span>全体トーナメント表</span><button class="btn" data-bracket-zoom aria-pressed="false">拡大・スクロール</button></div><div class="bracket poster-bracket" style="--poster-width:'+W+'px" tabindex="0" aria-label="全体トーナメント表。拡大してスクロールできます。">'+svg+'</div></section>';
}
export function bindBracketZoom(root,onZoom=()=>{}){
 root.querySelectorAll('[data-bracket-zoom]').forEach(b=>b.onclick=e=>{e.stopPropagation();const el=b.closest('.bracket-frame').querySelector('.bracket'),zoom=el.classList.toggle('zoomed');b.textContent=zoom?'全体を表示':'拡大・スクロール';b.setAttribute('aria-pressed',String(zoom));onZoom(zoom);});
}
