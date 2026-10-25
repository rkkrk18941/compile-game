/* Practice uses the production rules in its own state; no solo save or network session is touched. */
(() => {
  'use strict';
  const D=window.QV_DATA,E=window.QV_ENG,H=window.QV_HELP,T=window.QV_LESSONS;
  const $=s=>document.querySelector(s), esc=H.esc, roman=['','I','II','III','IV','V'];
  let index=0,st,done=false,selected=false,stage=0,pay=0,agreed=false,reply='',completed=new Set();
  try{const v=JSON.parse(localStorage.getItem('quovadis.tutorial')||'{}');index=Math.min(T.lessons.length-1,Math.max(0,Number.isInteger(v.index)?v.index:0));completed=new Set((v.completed||[]).filter(x=>Number.isInteger(x)&&x>=0&&x<T.lessons.length));}catch(e){}
  H.init(); $('#glossary').onclick=()=>H.openGlossary();
  function save(){try{localStorage.setItem('quovadis.tutorial',JSON.stringify({index,completed:[...completed]}));}catch(e){}}
  function start(i,focus=false){index=i;st=T.create(i);done=false;selected=false;stage=0;pay=0;agreed=false;reply='';$('#complete').hidden=true;$('#practice').hidden=false;$('#feedback').textContent='';$('#feedback').className='';save();render();if(focus)$('#lesson').focus();}
  function coords(cid){if(cid==='S')return[190,30];const c=D.COM[cid];return[(c.x+7)*25,350-c.row*80];}
  function board(){
    const lesson=T.lessons[index];
    let h='<svg class="board-svg" viewBox="0 0 380 385" role="group" aria-label="上が元老院、下が入口の練習盤面"><defs><marker id="up" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0 0L6 3.5L0 7" fill="none" stroke="#baa173"/></marker></defs>';
    D.PATHS.forEach(p=>{const a=coords(p.from),b=coords(p.to),focus=lesson.focus.includes(p.from)&&lesson.focus.includes(p.to);h+=`<path d="M${a[0]},${a[1]-18}L${b[0]},${b[1]+24}" fill="none" stroke="${focus?'#f1cf79':'#89724c'}" stroke-width="${focus?3:1.5}" marker-end="url(#up)"/>`;if(p.laurel){const x=(a[0]+b[0])/2,y=(a[1]+b[1])/2,t=st.spaces[p.id];h+=`<g aria-label="${esc(D.COM[p.from].name)}の出口の月桂冠${t?t.v+'点':''}${st.caesar===p.id?'、カエサルあり':''}"><rect x="${x-13}" y="${y-9}" width="26" height="18" rx="7" fill="${st.caesar===p.id?'#51647b':'#e6cc8b'}" stroke="#aa8951"/><text x="${x}" y="${y+4}" text-anchor="middle" font-size="11" font-weight="bold" fill="${st.caesar===p.id?'#fff':'#58271e'}">${st.caesar===p.id?'C':t?roman[t.v]+(t.c?'☆':''):'−'}</text></g>`;}});
    [...D.COMMITTEES,D.SENATE].forEach(c=>{const [x,y]=coords(c.id),focus=lesson.focus.includes(c.id),occ=c.id==='S'?Array.from({length:5},(_,i)=>st.senate[i]??-1):st.occ[c.id];const name=c.id==='S'?'元老院':c.name.replace(/（.*）/,'');h+=`<g data-cid="${c.id}" class="${focus?'focus':''} ${selected&&((T.lessons[index].action||{}).to===c.id||(T.lessons[index].action||{}).c===c.id)?'selected':''}" ${focus&&!done?'tabindex="0" role="button"':''} aria-label="${esc(c.name)}、赤${occ.filter(s=>s>=0&&E.owner(s)===0).length}人"><title>${esc(c.name)}</title><rect class="committee" x="${x-36}" y="${y-22}" width="72" height="43" rx="8"/><text x="${x}" y="${y-8}" text-anchor="middle" font-size="9" fill="#39291c">${esc(name)}</text>`;occ.forEach((sid,i)=>{const sx=x+(i-(c.seats-1)/2)*12;h+=`<circle cx="${sx}" cy="${y+7}" r="5" fill="${sid<0?'#c8b89a':D.PLAYER_COLORS[E.owner(sid)].hex}" stroke="${sid<0?'#ad9a76':'#38261b'}" stroke-width="1"/>`;});h+='</g>';});
    h+='</svg>';$('#board').innerHTML=h;$('#senateStatus').textContent=`元老院 ${st.senate.length}/5`;
  }
  function render(){
    const l=T.lessons[index];
    $('#chapters').innerHTML=T.lessons.map((x,i)=>`<button type="button" data-chapter="${i}" class="${completed.has(i)?'done':''}" ${i===index?'aria-current="step"':''} aria-label="${i+1}：${esc(x.title)}">${i+1}${i===index?' '+esc(x.title):''}${completed.has(i)?' ✓':''}</button>`).join('');
    $('#lesson').innerHTML=`<span class="step-label">STEP ${index+1} / ${T.lessons.length}</span><h2 id="lessonTitle">${esc(l.title)}</h2><p>${esc(l.text)}</p><p class="hint">${esc(l.hint)}</p><div class="terms">${l.terms.map(k=>H.term(k)).join('')}</div><div class="score">${st.players.map((p,i)=>`<span class="${i===0?'me':''}">${esc(p.name)} ${p.pts}点・元老院${E.senateCount(st,i)}人</span>`).join('')}</div>`;
    board();actions();$('#back').disabled=index===0;$('#next').disabled=!done;$('#next').textContent=index===T.lessons.length-1?'練習を終える':'次へ';
  }
  function actions(){
    const l=T.lessons[index],box=$('#actions');
    if(done){box.innerHTML='';return;}
    if(l.quiz){box.innerHTML=l.quiz.map((q,i)=>`<button type="button" data-answer="${i}">${esc(q)}</button>`).join('');return;}
    if(index===4){box.innerHTML=`<p class="muted">道はIV＝4点。賛成は青に1票頼みます。</p><div class="offer">渡す月桂冠 <button type="button" data-pay="-1" aria-label="渡す点を1減らす" ${pay===0?'disabled':''}>−</button><strong id="offerValue">${pay}点</strong><button type="button" data-pay="1" aria-label="渡す点を1増やす" ${pay===4?'disabled':''}>＋</button></div><button type="button" id="ask">賛成を頼む</button>${reply?`<div class="reply" role="status">${esc(reply)}</div>`:''}<button type="button" class="primary" id="do" ${agreed?'':'disabled'}>合意して動かす</button>`;return;}
    if(index===6&&stage===0){box.innerHTML='<button type="button" class="primary" id="do">この道へカエサルを動かす</button>';return;}
    if(index===7&&stage===1){box.innerHTML='<p class="reply">☆付きIIを取りました。カエサルの追加操作を選べます。</p><button type="button" class="primary" id="bonus">2段・中右の出口へカエサルを動かす</button><button type="button" id="skip">動かさない</button>';return;}
    const a=l.action,dest=D.COM[a.to||a.c];
    box.innerHTML=`${index===6?'<p class="reply">カエサルを移しました。実戦では相手の番をはさみますが、ここでは次の自分の番に進めています。</p>':''}<button type="button" id="select">${selected?'✓ ':''}${esc(index===1?'入口・左を選ぶ':dest.name+'を選ぶ')}</button><button type="button" class="primary" id="do" ${selected?'':'disabled'}>${index===1?'ここに置く':index===8?'元老院へ入る':'ここへ動かす'}</button>`;
  }
  function feedback(text,error=false){$('#feedback').textContent=text;$('#feedback').className=error?'error':'';}
  function finish(){done=true;completed.add(index);save();render();feedback(T.lessons[index].success);}
  function apply(act){const r=E.apply(st,0,act);if(!r.ok){feedback('この操作はまだできません。案内を確認して、もう一度選んでください。',true);return false;}return true;}
  function move(){
    const l=T.lessons[index];
    if(index===4){if(!agreed)return;if(apply({...l.action,pay:{1:pay}}))finish();return;}
    if(index===6){if(stage===0){if(!apply(l.action))return;stage=1;st.turn=0;selected=false;render();feedback('カエサルを移す行動で1手番が終了。練習なので相手の番を省略して、次のあなたの番です。');return;}if(apply(l.follow))finish();return;}
    if(!selected)return;
    if(!apply(l.action))return;
    if(index===7){stage=1;render();feedback('II☆を獲得して2点。続けてカエサルの追加操作を選びましょう。');return;}
    finish();
  }
  $('#actions').addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b||b.disabled)return;
    if(b.dataset.answer!==undefined){if(+b.dataset.answer===T.lessons[index].answer)finish();else feedback('得点を比べる前に、元老院に議員がいるかを確認しましょう。もう一度選べます。',true);}
    else if(b.dataset.pay){pay=Math.max(0,Math.min(4,pay+Number(b.dataset.pay)));agreed=false;reply='';actions();}
    else if(b.id==='ask'){agreed=pay===1;reply=agreed?'青「1点で賛成します」。これで移動を確定できます。':'青「1点なら賛成します」。渡す月桂冠を1点にして、もう一度頼みましょう。';actions();}
    else if(b.id==='select'){selected=true;render();}
    else if(b.id==='do')move();
    else if(b.id==='bonus'||b.id==='skip'){if(apply(b.id==='skip'?{t:'bonus',to:null}:T.lessons[index].bonus))finish();}
  });
  function tap(e){const b=e.target.closest('[data-cid]');if(!b||done)return;const l=T.lessons[index];if(l.quiz||index===4||index===6&&stage===0||index===7&&stage===1)return;const a=l.action;if(b.dataset.cid===(a.to||a.c)){selected=true;render();}else feedback('金色の行き先を選んでください。下の「選ぶ」ボタンからも操作できます。',true);}
  $('#board').addEventListener('click',tap);$('#board').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();tap(e);}});
  $('#chapters').onclick=e=>{const b=e.target.closest('[data-chapter]');if(b)start(+b.dataset.chapter,true);};
  $('#retry').onclick=()=>start(index,true);$('#back').onclick=()=>{if(index>0)start(index-1,true);};
  $('#next').onclick=()=>{if(!done)return;if(index<T.lessons.length-1)start(index+1,true);else{$('#practice').hidden=true;$('#complete').hidden=false;$('#complete').setAttribute('tabindex','-1');$('#complete').focus();}};
  $('#again').onclick=()=>start(0,true);
  start(index);
})();
