/* Cinematic presentation. Never writes to G, DB, draft, CPU, or game rule functions. */
'use strict';
(() => {
  const BUILD='14.4.0';
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const enabled=()=>Number(SET.fx)>0&&!reduced.matches;
  const premium=()=>SET.cinemaQuality!=='light';
  const q=s=>document.querySelector(s);
  const qa=s=>Array.from(document.querySelectorAll(s));
  const safe=f=>{try{return f();}catch(error){console.warn('COMPILE presentation:',error.message);}};
  const accent=protocol=>safe(()=>pmeta(protocol).ac)||'#8cd8ee';
  const sound=(name,options)=>safe(()=>window.COMPILE_AUDIO?.sfx(name,options));
  // Layered impacts and compilation chords; one lazy audio context, no downloads.
  let audio=null,audioOut=null,noise=null;
  function unlockCinemaAudio(){
    if(Number(SET.sfxVol)<=0)return;
    safe(()=>{
      if(!audio){const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;audio=new Ctx();
        const limiter=audio.createDynamicsCompressor();limiter.threshold.value=-20;limiter.knee.value=18;limiter.ratio.value=6;limiter.attack.value=.004;limiter.release.value=.2;limiter.connect(audio.destination);
        audioOut=audio.createGain();audioOut.connect(limiter);
        noise=audio.createBuffer(1,Math.round(audio.sampleRate*.8),audio.sampleRate);const data=noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
      }
      if(audio.state==='suspended')audio.resume().catch(()=>{});
    });
  }
  addEventListener('pointerdown',unlockCinemaAudio,{capture:true,passive:true});
  addEventListener('keydown',unlockCinemaAudio,{capture:true});
  function cinemaSound(kind,protocol='SPIRIT',tier=1){
    if(Number(SET.sfxVol)<=0||!audio||audio.state!=='running'||document.hidden)return;
    safe(()=>{
      const now=audio.currentTime,volume=Math.pow(Math.max(0,Math.min(100,Number(SET.sfxVol)||0))/100,2);
      audioOut.gain.setTargetAtTime(volume*.3,now,.02);
      function tone(freq,delay=0,length=.5,level=.3,type='sine',end=freq){
        const osc=audio.createOscillator(),gain=audio.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,now+delay);osc.frequency.exponentialRampToValueAtTime(Math.max(16,end),now+delay+length);
        gain.gain.setValueAtTime(.0001,now+delay);gain.gain.exponentialRampToValueAtTime(level,now+delay+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+delay+length);
        osc.connect(gain);gain.connect(audioOut);osc.start(now+delay);osc.stop(now+delay+length+.04);osc.onended=()=>{osc.disconnect();gain.disconnect();};
      }
      function air(delay,length,frequency,level){
        const src=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();src.buffer=noise;filter.type='bandpass';filter.Q.value=.8;filter.frequency.setValueAtTime(frequency,now+delay);filter.frequency.exponentialRampToValueAtTime(200,now+delay+length);
        gain.gain.setValueAtTime(.0001,now+delay);gain.gain.linearRampToValueAtTime(level,now+delay+.035);gain.gain.exponentialRampToValueAtTime(.0001,now+delay+length);src.connect(filter);filter.connect(gain);gain.connect(audioOut);src.start(now+delay);src.stop(now+delay+length+.04);src.onended=()=>{src.disconnect();filter.disconnect();gain.disconnect();};
      }
      const pitch=THEME[protocol]==='wave'?220:THEME[protocol]==='ember'?146.83:THEME[protocol]==='vortex'?110:293.66;
      if(kind==='compile'){
        tone(82,.05,.8,.48,'sine',36);air(.05,.7,2200,.2);
        for(let i=0;i<3;i++){const f=[146.83,174.61,220][i];tone(f,.15+i*.12,1.3,.10,'triangle');tone(f*2,.22+i*.12,1.45,.06,'sine');}
        if(tier===3){tone(440,.65,1.8,.13,'sine');tone(587.33,.75,1.8,.075,'sine');tone(55,.6,1.4,.38,'sine',28);}
      }else if(kind==='charge'){tone(pitch,.02,.38,.07,'triangle',pitch*2);air(0,.3,850,.05);}
      else if(kind==='impact'){tone(110,0,.48,.32,'sine',32);tone(pitch*2,.01,.7,.08,'triangle',pitch);air(0,.45,3200,.13);tone(pitch,.16,.8,.04,'sine');}
      else{tone(pitch,0,.7,.09,'triangle',pitch*.75);tone(pitch*1.5,.11,.85,.045,'sine');air(0,.4,1400,.05);}
    });
  }
  const motionDuration=ms=>ms*Math.max(.45,Math.min(1.6,Number(SET.fx)||1));
  const THEME=Object.freeze({FIRE:'ember',LIFE:'sprout',WATER:'wave',DEATH:'fracture',SPIRIT:'orb',PLAGUE:'spore',GRAVITY:'vortex',METAL:'shard',LIGHT:'ray',SPEED:'dash',DARKNESS:'eclipse',PSYCHIC:'orbit',CHAOS:'fracture',CLARITY:'ray',CORRUPTION:'spore',COURAGE:'shard',FEAR:'eclipse',ICE:'crystal',MIRROR:'orbit',LUCK:'orb',PEACE:'sprout',TIME:'vortex',SMOKE:'eclipse',WAR:'ember'});
  const icons={cpu:'<path d="M8 7h16v18H8zM12 11h8v10h-8zM4 11h4m-4 5h4m-4 5h4m16-10h4m-4 5h4m-4 5h4M12 3v4m8-4v4m-8 18v4m8-4v4"/>',local:'<path d="M5 12h10v15H5zM17 5h10v15H17zM8 16h4m8-7h4M8 22h4m8-7h4"/>',online:'<path d="M16 3l12 7v13l-12 7-12-7V10zM16 3v27M4 10l12 7 12-7M4 23l12-6 12 6"/>'};
  function modeContent(type,title,subtitle,code){return `<span class="cin-modeicon" aria-hidden="true"><svg viewBox="0 0 32 32">${icons[type]}</svg></span><span class="cin-modecopy"><small>${code}</small><b>${title}</b><em>${subtitle}</em></span><span class="cin-modearrow" aria-hidden="true">↗</span>`;}
  function lobby(){
    const box=q('#setupBox');if(!box||!q('#startDraft')||box.classList.contains('cin-lobby'))return;
    const form=q('#setupBox .setupform'),actions=q('#setupBox .setupactions');if(!form||!actions)return;
    const difficulty=q('#cpuDifficultyBox'),rank=q('#rankBox');
    const title=document.createElement('div');title.className='cin-hero';
    title.innerHTML='<div class="cin-eyebrow">TACTICAL PROTOCOL WARFARE</div><h1>COMPILE</h1><div class="cin-tagline">思考を、武器に。</div><p>3つのプロトコル。無数の戦術。<br>相手の計画を崩し、すべてのラインを掌握せよ。</p><div class="cin-herodata"><span><strong>03</strong>PROTOCOLS TO VICTORY</span><span><strong>24</strong>UNIQUE PROTOCOLS</span><span><strong>01</strong>DECISIVE MOVE</span></div>';
    const nav=document.createElement('div');nav.className='cin-nav';nav.innerHTML='<span class="cin-wordmark">COMPILE</span><span class="cin-navstatus"><i></i>CINEMATIC EDITION / 14</span>';
    const deck=document.createElement('div');deck.className='cin-deck';
    const panel=document.createElement('div');panel.className='cin-panel';panel.innerHTML='<div class="cin-panelhead"><span>対戦設定</span><small>MATCH CONFIGURATION</small></div>';
    panel.append(form);if(difficulty)panel.append(difficulty);if(rank)panel.append(rank);
    const modes=document.createElement('div');modes.className='cin-modes';
    const config=[['cpuStartBtn','cpu','CPUと対戦','プロトコルをドラフトし、戦術を磨く。','01 / SOLO OPERATION'],['startDraft','local','ローカル対戦','同じ端末で、2人の知略がぶつかる。','02 / LOCAL DUEL'],['netHostBtn','online','オンライン対戦','部屋を作成し、離れた相手と対戦。','03 / NETWORK MATCH']];
    for(const [id,type,label,desc,code]of config){const button=document.getElementById(id);if(!button)continue;button.className='cin-mode'+(id==='cpuStartBtn'?' primary':'');button.setAttribute('aria-label',label);button.innerHTML=modeContent(type,label,desc,code);modes.append(button);}
    actions.className='setupactions cin-support';
    const join=q('#netJoinBtn');if(join)join.textContent='招待コードで参加';
    const settings=q('#setupSettingsBtn');if(settings)settings.textContent='音・演出';
    const help=actions.querySelector('[id*="utorial"]');if(help)help.textContent='遊び方';
    modes.append(actions);deck.append(panel,modes);
    box.replaceChildren(nav,title,deck);box.className='setupbox cin-lobby';
    const footer=document.createElement('div');footer.className='cin-lobbyfooter';footer.innerHTML='<span>機略戦術カードゲーム / DIGITAL ARENA</span><span>SELECT. DISRUPT. COMPILE.</span>';box.append(footer);
    q('#setup').dataset.cinema='lobby';
  }
  const oldWelcome=renderWelcome;
  renderWelcome=function(){const result=oldWelcome.apply(this,arguments);safe(lobby);return result;};
  const oldDraft=renderDraft;
  renderDraft=function(){const result=oldDraft.apply(this,arguments);const box=q('#setupBox');if(box){box.className='setupbox cin-draftbox';q('#setup').dataset.cinema='draft';}return result;};
  const oldArrange=startArrange;
  startArrange=function(){const result=oldArrange.apply(this,arguments);const box=q('#setupBox');if(box)box.className='setupbox cin-draftbox';return result;};

  // Keep all card text and hidden information rules in the existing renderer.
  const oldFullCard=fullCard;
  fullCard=function(card,options={}){const element=oldFullCard.apply(this,arguments);if(!options.hide&&element.classList.contains('fcpro')){const sigil=document.createElement('div');sigil.className='cin-sigil';sigil.setAttribute('aria-hidden','true');sigil.innerHTML=hexIcon(card.protocol,'');element.append(sigil);}return element;};
  handCardW=function(count=5){
    const available=Math.min(innerWidth-26,1100),n=Math.max(1,count||1);
    const max=innerWidth>760?148:105;
    const heightCap=Math.max(64,Math.floor((innerHeight*(innerHeight<680?.20:.235)-24)/1.4));
    const fit=Math.floor((available+Math.max(0,n-1)*14)/n);
    const width=Math.max(62,Math.min(max,heightCap,fit));
    document.documentElement.style.setProperty('--cin-card-width',width+'px');
    document.documentElement.style.setProperty('--cin-card-scale',String(width/250));
    return width;
  };
  const lockHTML=n=>`<span class="cin-locks" aria-hidden="true">${[0,1,2].map(i=>`<i class="${i<n?'on':''}"></i>`).join('')}</span>`;
  let lastTurn=null,lastGame=null,lastCards=new Set(),lastScores=new Map();
  function turnBanner(viewer){
    if(!enabled()||!G||G.phase!=='action'||G.turn===lastTurn)return;
    lastTurn=G.turn;qa('.cin-turn').forEach(el=>el.remove());
    const mine=G.current===viewer,d=document.createElement('div');d.className='cin-turn'+(mine?'':' opponent');
    d.innerHTML=`<small>TURN ${String(G.turn).padStart(2,'0')}</small><b>${mine?'YOUR TURN':'OPPONENT TURN'}</b>`;document.body.append(d);setTimeout(()=>d.remove(),1700);
  }
  function board(){
    if(!G)return;const v=uiViewer(),o=other(v),changed=lastGame!==G;
    if(changed){lastTurn=null;lastCards=new Set();lastScores=new Map();lastGame=G;}
    const compiled=p=>G.players[p].protocols.filter(x=>x.compiled).length;
    let hud=q('#cinHud');if(!hud){hud=document.createElement('div');hud.id='cinHud';hud.className='cin-hud';q('.topline')?.insertBefore(hud,q('#turnBadge'));}
    hud.innerHTML=`<span aria-label="自分のコンパイル ${compiled(v)}/3">YOU ${lockHTML(compiled(v))}<b>${compiled(v)}/3</b></span><span aria-label="相手のコンパイル ${compiled(o)}/3">RIVAL ${lockHTML(compiled(o))}<b>${compiled(o)}/3</b></span>`;
    const nowCards=new Set(),nowScores=new Map();
    for(const [id,p]of [['myStacks',v],['oppStacks',o]]){
      const row=document.getElementById(id);if(!row)continue;
      Array.from(row.children).forEach((stack,i)=>{
        stack.dataset.lane='0'+(i+1);
        stack.querySelectorAll('[data-cid]').forEach(card=>{nowCards.add(card.dataset.cid);if(!changed&&!lastCards.has(card.dataset.cid)&&enabled())card.classList.add('cin-new-card');});
      });
      const protos=document.getElementById(p===v?'myProtos':'oppProtos');if(!protos)continue;
      Array.from(protos.children).forEach((proto,i)=>{
        const total=stackTotal(p,i),key=p+':'+i;nowScores.set(key,total);
        const count=proto.querySelector('.pctotal');if(count&&lastScores.has(key)&&lastScores.get(key)!==total&&enabled())count.classList.add('cin-total-change');
        const meter=document.createElement('span');meter.className='cin-progress';meter.setAttribute('aria-hidden','true');meter.innerHTML=`<i style="width:${Math.max(0,Math.min(100,total*10))}%"></i>`;proto.append(meter);
      });
    }
    lastCards=nowCards;lastScores=nowScores;turnBanner(v);
    qa('#hand .hfan').forEach(el=>{el.setAttribute('role','button');el.tabIndex=0;const card=G.players[v].hand.find(c=>c.id===el.dataset.cid);if(card)el.setAttribute('aria-label',`${card.protocol} ${card.value}をプレイ`);el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}};});
  }
  const oldRender=render;
  render=function(){const result=oldRender.apply(this,arguments);safe(board);return result;};

  // One bounded owner for every new VFX. Timers use wall time rather than frame count.
  const canvas=document.createElement('canvas');canvas.id='cinVfx';canvas.setAttribute('aria-hidden','true');document.body.append(canvas);
  const ctx=canvas.getContext('2d');let jobs=[],raf=0,width=0,height=0,dpr=1,lastFrame=0;
  function resize(){width=innerWidth;height=innerHeight;dpr=Math.min(devicePixelRatio||1,innerWidth<760?1.25:1.5,Math.sqrt(1800000/Math.max(1,width*height)));canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
  function finishJob(job){if(job.done)return;job.done=true;if(job.timer)clearTimeout(job.timer);if(job.resolve)job.resolve();}
  function stopVfx(){cancelAnimationFrame(raf);raf=0;jobs.forEach(finishJob);jobs=[];if(ctx){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);}}
  function tick(now){
    raf=0;if(!enabled()||document.hidden){stopVfx();return;}
    const minFrame=1000/(innerWidth<760||!premium()?30:50);
    if(now-lastFrame>=minFrame){lastFrame=now;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.globalCompositeOperation='lighter';
      for(const job of jobs){if(job.done)continue;const t=Math.min(1,Math.max(0,(now-job.start)/job.duration));if(t>=1){finishJob(job);continue;}ctx.save();safe(()=>job.draw(t));ctx.restore();}
      jobs=jobs.filter(job=>!job.done);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    }
    if(jobs.length)raf=requestAnimationFrame(tick);else ctx.clearRect(0,0,width,height);
  }
  function addJob(draw,duration=1000){
    if(!enabled()||!ctx||document.hidden)return Promise.resolve();
    if(width!==innerWidth||height!==innerHeight)resize();
    return new Promise(resolve=>{while(jobs.length>=12)finishJob(jobs.shift());const job={draw,duration,start:performance.now(),resolve,done:false};job.timer=setTimeout(()=>finishJob(job),duration+180);jobs.push(job);if(!raf)raf=requestAnimationFrame(tick);});
  }
  const TAU=Math.PI*2,lerp=(a,b,t)=>a+(b-a)*t,ease=t=>1-Math.pow(1-t,3);
  function line(x0,y0,x1,y1,color,w=1,a=1){ctx.strokeStyle=color;ctx.globalAlpha=a;ctx.lineWidth=w;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();}
  function ring(x,y,r,color,alpha=1,squash=1,rotation=0){ctx.strokeStyle=color;ctx.globalAlpha=alpha;ctx.lineWidth=1.2;ctx.beginPath();ctx.ellipse(x,y,Math.max(.1,r),Math.max(.1,r*squash),rotation,0,TAU);ctx.stroke();}
  function glow(x,y,r,color,alpha=1){if(r<=0)return;const gradient=ctx.createRadialGradient(x,y,0,x,y,r);gradient.addColorStop(0,color);gradient.addColorStop(.18,color);gradient.addColorStop(1,'transparent');ctx.fillStyle=gradient;ctx.globalAlpha=alpha;ctx.fillRect(x-r,y-r,r*2,r*2);}
  function flash(x,y,color,power=1){return addJob(t=>{const k=ease(t),fade=(1-t)*(1-t);glow(x,y,45+75*k*power,color,fade*.5);ring(x,y,8+150*k*power,color,fade,.5);ring(x,y,3+80*k*power,'#d7edf3',fade*.65,.5);},motionDuration(700));}
  function burst(protocol,count=45,point=null){
    if(!enabled())return;const x=point?.x??innerWidth/2,y=point?.y??innerHeight*.45,color=accent(protocol),theme=THEME[protocol]||'orb';
    const n=Math.min(premium()?92:36,Math.max(12,count));
    const parts=Array.from({length:n},(_,i)=>{const a=Math.random()*TAU;return{a,reach:30+Math.random()*135,size:.8+Math.random()*2.1,drift:Math.random()*36,col:i%5===0?'#dfedf4':color,seed:Math.random()};});
    return addJob(t=>{const e=ease(t),fade=Math.pow(1-t,1.8);glow(x,y,36+e*60,color,fade*.26);ring(x,y,8+e*105,color,fade*.7,.55);ring(x,y,4+e*145,color,fade*.23,.55);
      for(const p of parts){let a=p.a,reach=p.reach*e,py=0;if(theme==='vortex'||theme==='orbit')a+=t*2.8;if(theme==='ember')py=-100*t*t;if(theme==='wave')reach*=1.25;if(theme==='eclipse')reach=p.reach*(1-e)+14;
        const px=x+Math.cos(a)*reach,yy=y+Math.sin(a)*reach*.68+py+p.drift*t;
        ctx.globalAlpha=fade;ctx.fillStyle=p.col;
        if(['shard','crystal','fracture'].includes(theme)){ctx.save();ctx.translate(px,yy);ctx.rotate(a+t*3);ctx.fillRect(-p.size,-p.size*2,p.size*2,p.size*4);ctx.restore();}
        else if(['dash','ray','ember'].includes(theme)){line(px,yy,px-Math.cos(a)*(5+e*15),yy-Math.sin(a)*(5+e*15),p.col,p.size*.7,fade);}
        else{ctx.beginPath();ctx.arc(px,yy,p.size,0,TAU);ctx.fill();if(p.seed>.8)glow(px,yy,6,p.col,fade*.28);}
      }
    },motionDuration(920));
  }
  fxBurst=function(protocol,n=45,point=null){return burst(protocol,n,point);};
  fxAtCard=function(card,n=36){const el=elOf(card),r=el?.getBoundingClientRect();const protocol=card?.faceDown?'SPIRIT':card?.protocol;return burst(protocol,n,r?{x:r.left+r.width/2,y:r.top+r.height/2}:null);};
  flashWhite=function(){if(enabled())flash(innerWidth/2,innerHeight*.45,'#e6cd9a',.7);};
  shakeScreen=function(){if(!enabled()||!SET.shake)return;const stage=q('#gameMain');if(!stage)return;stage.classList.remove('cin-shake');void stage.offsetWidth;stage.classList.add('cin-shake');setTimeout(()=>stage.classList.remove('cin-shake'),400);};
  beamFX=function(from,to,protocol){
    if(!from||!to||!enabled())return Promise.resolve();
    const x0=from.left+from.width/2,y0=from.top+from.height/2,x1=to.left+to.width/2,y1=to.top+to.height/2,color=accent(protocol),theme=THEME[protocol]||'orb';
    const angle=Math.atan2(y1-y0,x1-x0),nx=-Math.sin(angle),ny=Math.cos(angle);let hit=false;
    cinemaSound('charge',protocol);const total=motionDuration(theme==='dash'?570:850);
    return addJob(t=>{
      if(t<.24){const charge=t/.24;glow(x0,y0,12+charge*28,color,charge*.5);ring(x0,y0,35*(1-charge)+8,color,.7);for(let i=0;i<8;i++){const a=i*TAU/8+t*3;line(x0+Math.cos(a)*(50-30*charge),y0+Math.sin(a)*(50-30*charge),x0+Math.cos(a)*14,y0+Math.sin(a)*14,color,1,charge*.7);}return;}
      const travel=Math.min(1,(t-.24)/.44),adv=ease(travel),px=lerp(x0,x1,adv),py=lerp(y0,y1,adv),fade=1-Math.max(0,(t-.7)/.3);
      for(let i=0;i<3;i++){const phase=i*TAU/3;
        ctx.beginPath();ctx.strokeStyle=i===0?'#e6f3f5':color;ctx.globalAlpha=fade*(i===0?.72:.32);ctx.lineWidth=i===0?1.8:5;
        for(let j=0;j<=32;j++){const k=j/32*adv,fall=Math.sin(k*Math.PI),wave=['wave','vortex','orbit','sprout','spore'].includes(theme)?Math.sin(k*TAU*2-t*9+phase)*16*fall:theme==='fracture'||theme==='ray'?Math.sin(j*4.7+phase)*6*fall:Math.sin(k*Math.PI)*7;const x=lerp(x0,x1,k)+nx*wave,y=lerp(y0,y1,k)+ny*wave;if(j===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();
      }
      glow(px,py,25,color,fade*.6);glow(px,py,9,'#eff9f8',fade*.7);
      for(let i=0;i<10;i++){const u=Math.max(0,adv-i*.025),x=lerp(x0,x1,u),y=lerp(y0,y1,u),a=t*9+i*2;glow(x+Math.cos(a)*9,y+Math.sin(a)*9,3.5,color,fade*.45);}
      if(t>.65){if(!hit){hit=true;cinemaSound('impact',protocol);burst(protocol,48,{x:x1,y:y1});}const impact=(t-.65)/.35;ring(x1,y1,10+ease(impact)*90,color,(1-impact)*.9,.55);glow(x1,y1,20+impact*65,color,(1-impact)*.55);}
    },total);
  };
  // Replace the card-flight renderer, retaining its contract and concealed fronts.
  flyCard=function({from,to,proto=null,back=false,delay=0}={}){
    if(!enabled()||!from||!to)return;
    const d=document.createElement('div');d.className='flycard'+(back||!proto?' back':'');d.setAttribute('aria-hidden','true');
    if(proto&&!back)d.style.cssText=artBG(proto,false);d.style.borderColor=back?'#84a9bb':accent(proto);d.style.boxShadow='0 4px 15px #0008';
    const x0=from.left+from.width/2,y0=from.top+from.height/2,x1=to.left+to.width/2,y1=to.top+to.height/2;
    d.style.left=(x0-24)+'px';d.style.top=(y0-33)+'px';d.style.transition='none';fxLayer().append(d);
    const duration=motionDuration(510),color=back?'#99cfdf':accent(proto);
    const animation=d.animate([{transform:'translate(0,0) rotate(-6deg) scale(.7)',opacity:.85},{transform:`translate(${(x1-x0)*.55}px,${(y1-y0)*.55-30}px) rotate(9deg) scale(1.1)`,opacity:1,offset:.55},{transform:`translate(${x1-x0}px,${y1-y0}px) rotate(0deg) scale(.5)`,opacity:0}],{duration,delay,easing:'cubic-bezier(.2,.7,.2,1)',fill:'both'});
    animation.onfinish=()=>{d.remove();flash(x1,y1,color,.3);};animation.oncancel=()=>d.remove();setTimeout(()=>d.remove(),delay+duration+200);sound('fly',{when:delay/1000});
  };

  let activeCut=null;
  function stopCut(){if(activeCut)activeCut.finish();}
  function compileScene(context){
    const tier=context?.tier||1,color='#e8cca0',x=innerWidth/2,y=innerHeight*.47;
    return addJob(t=>{const grow=ease(Math.min(1,t/.42)),fade=t>.68?1-(t-.68)/.32:1;
      if(t<.33){for(let i=0;i<3;i++){const a=i*TAU/3+t*2,r=190*(1-grow)+35;glow(x+Math.cos(a)*r,y+Math.sin(a)*r*.5,25,color,grow*.45);line(x+Math.cos(a)*r,y+Math.sin(a)*r*.5,x,y,color,1,grow*.4);}}
      if(t>.25){const u=(t-.25)/.75;glow(x,y,(90+u*150)*tier/2,color,fade*.09);for(let i=0;i<3+tier;i++)ring(x,y,35+ease(Math.min(1,u*1.6))*((i+1)*55),color,fade*(.4-i*.035),.5,t*.6);for(let i=0;i<22+tier*10;i++){const a=i*TAU/(22+tier*10),r=35+u*(160+(i%4)*70),alpha=fade*.65;line(x+Math.cos(a)*r,y+Math.sin(a)*r*.62,x+Math.cos(a)*(r+15),y+Math.sin(a)*(r+15)*.62,i%4===0?'#edf1f2':color,1.2,alpha);}}
    },motionDuration(tier===3?2400:1850));
  }
  announce=function(subject,title,desc='',tag='能力発動',cls=''){
    // Preserve the original network announcement transport.
    if(typeof NET!=='undefined'&&NET.on&&isMyTurn())netSend({t:'ann',a:[typeof subject==='string'?subject:subject?.protocol,title,desc,tag,cls]});
    return presentCut(subject,title,desc,tag,cls);
  };
  function presentCut(subject,title,desc='',tag='能力発動',cls='',previewContext=null){
    stopCut();if(!Number(SET.fx)||document.hidden)return Promise.resolve();
    const protocol=typeof subject==='string'?subject:subject?.protocol||'SPIRIT',compile=cls==='gold',context=compile?(previewContext||window.__compilePresentationContext):null;
    const color=compile?'#e8cca0':accent(protocol),tier=context?.tier||1;
    // Reading time is independent of particle speed; longer commands get more time.
    const configured=Number(SET.annSec),base=Number.isFinite(configured)?Math.max(2,Math.min(15,configured)):7;
    const text=String(desc).replace(/<[^>]*>/g,'').replace(/&[^;]+;/g,'x').replace(/\s/g,'');
    const reading=Math.min(15,base+Math.ceil(Math.max(0,Array.from(text).length-42)/14));
    const duration=reading+(compile&&tier===3?.65:0);
    const art=artBG(protocol,true),cut=document.createElement('div');cut.className='cin-cut'+(compile?' compile':'')+(compile&&tier===3?' final':'');cut.style.setProperty('--ac',color);cut.style.setProperty('--duration',duration+'s');cut.setAttribute('role','button');cut.tabIndex=0;cut.setAttribute('aria-label','演出を閉じる');
    const titleText=compile?(context?.recompile?'RECOMPILE':tier===3?'FINAL COMPILE':'PROTOCOL COMPILED'):title;
    const subtitle=compile?`${protocol} // ${pmeta(protocol).k}`:`${pmeta(protocol).k} / ${tag}`;
    const meta=context?`<div class="cin-compilemeta"><span>PROTOCOL<strong>${esc(protocol)}</strong></span><span>LINE<strong>${String(context.line+1).padStart(2,'0')}</strong></span><span>VALUE<strong>${context.total}</strong></span><span class="cin-compilelocks" aria-label="コンパイル ${tier}/3">${[1,2,3].map(i=>`<i class="${i<=tier?'on':''}">${i}</i>`).join('')}</span></div>`:'';
    cut.innerHTML=`<div class="cin-cutbar"></div><div class="cin-cutbar bottom"></div><div class="cin-cutart" style='${art}'></div><div class="cin-cutcontent"><div class="cin-cutsigil" aria-hidden="true">${hexIcon(protocol,'')}</div><div><div class="cin-cuttag">${esc(subtitle)}</div><h2 class="cin-cuttitle">${esc(titleText)}</h2><div class="cin-cutline"></div><div class="cin-cutdesc">${kw(desc)}</div>${meta}</div></div><div class="cin-cutskip"><span>内容を読んだらタップ / Enter で次へ · Esc でスキップ</span></div><div class="cin-cuttimer"></div>`;
    const previouslyFocused=document.activeElement;
    return new Promise(resolve=>{
      let done=false,timer=0;const finish=()=>{if(done)return;done=true;clearTimeout(timer);cut.remove();if(activeCut?.node===cut)activeCut=null;stopVfx();if(previouslyFocused?.isConnected)previouslyFocused.focus({preventScroll:true});resolve();};
      const openedAt=performance.now(),advance=()=>{if(performance.now()-openedAt>=500)finish();};
      activeCut={node:cut,finish};cut.onclick=advance;cut.onkeydown=e=>{if(['Enter',' ','Escape'].includes(e.key)){e.preventDefault();if(e.repeat)return;if(e.key==='Escape')finish();else advance();}};document.body.append(cut);cut.focus({preventScroll:true});timer=setTimeout(finish,duration*1000);
      safe(()=>{window.COMPILE_ABILITY_FX?.stop();q('#ann')?.classList.remove('show');
        if(compile){cinemaSound('compile',protocol,tier);window.COMPILE_AUDIO?.duck(duration,.2);compileScene(context);}else{cinemaSound('ability',protocol);window.COMPILE_AUDIO?.duck(duration,.42);burst(protocol,58,{x:innerWidth*.3,y:innerHeight*.45});}
      });
    });
  }
  const oldModal=showModal;
  showModal=function(options={}){
    const result=oldModal.apply(this,arguments);
    if(/\sWIN\b/.test(String(options.title||''))&&G?.winner!=null)safe(()=>{
      const body=q('#dialog .dialogbody'),winner=G.players[G.winner],loser=G.players[other(G.winner)],score=player=>player.protocols.filter(p=>p.compiled).length;
      if(body)body.innerHTML=`<div class="cin-result"><div class="cin-resultcrest" aria-hidden="true"><svg viewBox="0 0 40 40"><path d="M20 2l16 9v18l-16 9-16-9V11zM12 20l6 6 11-13"/></svg></div><h3>VICTORY</h3><p>${esc(winner.name)} がすべてのプロトコルを掌握しました。</p><div class="cin-resultstats"><div><b>${score(winner)} — ${score(loser)}</b><small>COMPILED</small></div><div><b>${G.turn}</b><small>TURNS</small></div></div></div>`;
      if(enabled()){compileScene({tier:3});burst('LIGHT',80,{x:innerWidth/2,y:innerHeight*.4});}
    });return result;
  };

  // Add a quality switch inside the existing sound/effects settings; keep all existing sliders.
  const oldSettings=openSettings;
  openSettings=function(){const result=oldSettings.apply(this,arguments);safe(()=>{
    const body=q('#dialog .dialogbody');if(!body||q('#cinQuality'))return;
    const readingLabel=q('#setAnn')?.closest('.setrow')?.querySelector('label');if(readingLabel)readingLabel.textContent='能力表示時間（最低）';
    const panel=document.createElement('div');panel.className='cin-presentation-panel';panel.id='cinQuality';panel.innerHTML='<small>能力説明は演出速度に関係なく表示し、長い文章は最大15秒まで延長します。読めたらタップで先へ進めます。</small><label style="display:block;margin-top:16px">描画品質</label><div class="cin-presentation-options"></div><small>シネマ：光・粒子を豊かに表示。軽量：粒子数と描画頻度を抑えます。<br>演出オフ・画面シェイク・音量も上の設定で調整できます。</small><label style="display:block;margin-top:16px">演出プレビュー</label><div class="cin-presentation-options" id="cinPreviews"></div>';
    const controls=panel.querySelector('.cin-presentation-options');
    const paint=()=>{controls.replaceChildren();for(const [value,label]of [['cinema','シネマ'],['light','軽量']]){const b=document.createElement('button');b.textContent=label;b.className=(SET.cinemaQuality||'cinema')===value?'on':'';b.onclick=()=>{SET.cinemaQuality=value;saveSettings();paint();};controls.append(b);}};paint();body.append(panel);
    const previews=panel.querySelector('#cinPreviews');for(const [label,protocol,compile]of [['烈火の演出','FIRE',false],['流水の演出','WATER',false],['最終コンパイル','LIGHT',true]]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>{if(!Number(SET.fx)){toast('演出速度をオンにするとプレビューできます');return;}unlockCinemaAudio();void presentCut(protocol,protocol+' // PREVIEW',compile?'3つのプロトコルを掌握する、最終コンパイルの演出です。':'カードの能力が発動するときの演出です。','演出プレビュー',compile?'gold':'',compile?{tier:3,line:0,total:12,recompile:false}:null);};previews.append(b);}
  });return result;};
  // Ambient motes are independent of the effects canvas and idle when hidden/off.
  const ambient=document.createElement('canvas');ambient.id='cinAmbient';ambient.setAttribute('aria-hidden','true');document.body.prepend(ambient);
  const actx=ambient.getContext('2d');let ambientRaf=0,ambientLast=0,ambientW=0,ambientH=0;
  const motes=Array.from({length:46},(_,i)=>({x:Math.random(),y:Math.random(),v:.006+Math.random()*.009,size:.5+Math.random()*.9,seed:i*1.7}));
  function drawAmbient(now){ambientRaf=0;if(!enabled()||document.hidden||!actx)return;
    if(now-ambientLast>1000/24){ambientLast=now;const w=innerWidth,h=innerHeight;if(ambientW!==w||ambientH!==h){ambientW=w;ambientH=h;ambient.width=w;ambient.height=h;}
      actx.clearRect(0,0,w,h);const time=now/1000;
      for(const p of motes.slice(0,premium()?46:16)){const x=(p.x+Math.sin(time*.13+p.seed)*.015)*w,y=(1-(p.y+time*p.v)%1)*h;actx.fillStyle=p.seed%3<1?'#e7d0a3':'#acc9dc';actx.globalAlpha=.1+.25*Math.pow(Math.sin(time*.3+p.seed),2);actx.beginPath();actx.arc(x,y,p.size,0,TAU);actx.fill();}actx.globalAlpha=1;
    }ambientRaf=requestAnimationFrame(drawAmbient);
  }
  function startAmbient(){if(!ambientRaf&&enabled()&&!document.hidden)ambientRaf=requestAnimationFrame(drawAmbient);}
  const oldSaveSettings=saveSettings;
  saveSettings=function(){const result=oldSaveSettings.apply(this,arguments);if(!Number(SET.fx))stopCut();if(audioOut&&audio)audioOut.gain.setTargetAtTime(Math.pow(Math.max(0,Math.min(100,Number(SET.sfxVol)||0))/100,2)*.3,audio.currentTime,.02);if(enabled())startAmbient();else{stopVfx();cancelAnimationFrame(ambientRaf);ambientRaf=0;actx?.clearRect(0,0,ambient.width,ambient.height);}return result;};
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stopCut();stopVfx();cancelAnimationFrame(ambientRaf);ambientRaf=0;audio?.suspend().catch(()=>{});}else startAmbient();});
  addEventListener('pagehide',()=>{stopCut();stopVfx();cancelAnimationFrame(ambientRaf);ambientRaf=0;});
  reduced.addEventListener?.('change',()=>{stopVfx();cancelAnimationFrame(ambientRaf);ambientRaf=0;startAmbient();});
  let resizeTimer=0;addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{stopVfx();if(G)safe(()=>render());},120);});
  // Give existing short settings one readable default; later user changes stay saved.
  safe(()=>{if(Number(SET.cinemaReadingVersion||0)<1){const seconds=Number(SET.annSec);SET.annSec=Number.isFinite(seconds)?Math.max(7,seconds):7;SET.cinemaReadingVersion=1;saveSettings();}});
  window.COMPILE_CINEMA=Object.freeze({version:BUILD,themes:()=>({...THEME}),state:()=>({effects:jobs.length,cut:!!activeCut,quality:SET.cinemaQuality||'cinema',reducedMotion:reduced.matches}),stop:()=>{stopCut();stopVfx();}});
  safe(()=>{if(q('#setup:not(.hidden)'))lobby();if(G)board();});startAmbient();
})();
