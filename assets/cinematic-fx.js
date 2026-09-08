/* COMPILE cinematic director. Presentation only; game/network state is never mutated. */
(()=>{
  'use strict';
  const scriptURL=document.currentScript?.src||new URL('assets/cinematic-fx.js',location.href).href;
  const textureURL=new URL('impact-volume.webp',scriptURL).href;
  const FAMILY={FIRE:0,WAR:0,WATER:1,ICE:7,GRAVITY:2,DARKNESS:2,FEAR:2,
    LIGHT:3,CLARITY:3,COURAGE:3,METAL:4,MIRROR:4,SPEED:5,TIME:5,
    LIFE:6,PEACE:6,LUCK:6,PLAGUE:8,CORRUPTION:8,SMOKE:9,SPIRIT:9,PSYCHIC:10,CHAOS:10,DEATH:11};
  const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
  const TAU=Math.PI*2,lerp=(a,b,t)=>a+(b-a)*t;
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const enabled=()=>Number(SET.fx)>0&&!document.hidden;
  const speed=()=>clamp(Number(SET.fx)||1,.45,1.8);
  const center=r=>({x:r.left+r.width/2,y:r.top+r.height/2});
  const palette=p=>{try{return pmeta(p);}catch{return {ac:'#a9c7ff',k:p,pal:['#0b0d17','#253653','#477bc1','#a9c7ff','#ffffff']};}};
  const rgb=hex=>{const n=parseInt(String(hex).replace('#',''),16);return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];};
  const hash=s=>{let h=2166136261;for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0)%10000/1000;};
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  const canvas=document.createElement('canvas');canvas.id='cinema-vfx';canvas.setAttribute('aria-hidden','true');document.body.appendChild(canvas);
  let imageReady=false;const volume=new Image();volume.onload=()=>{imageReady=true;uploadTexture();};volume.src=textureURL;
  let gl=null,ctx=null,program=null,texture=null,locations={},buffer=null,renderer='canvas2d',lastError=null;
  let active=[],raf=0,next=0,scene=null,quality=.8,slowFrames=0,lastFrame=0;
  const tintCache=new Map();
  const vertex=`attribute vec2 a_position;varying vec2 v_uv;void main(){v_uv=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}`;
  const fragment=`precision mediump float;
  varying vec2 v_uv;uniform vec2 u_size,u_origin,u_target;uniform vec3 u_color;
  uniform float u_time,u_family,u_kind,u_power,u_seed,u_textureReady;uniform sampler2D u_texture;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
  float fbm(vec2 p){float n=0.;float a=.55;for(int i=0;i<4;i++){n+=a*noise(p);p=mat2(1.6,-1.2,1.2,1.6)*p+vec2(3.7,8.1);a*=.5;}return n;}
  mat2 rot(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
  void main(){
    vec2 pixel=vec2(v_uv.x,1.-v_uv.y)*u_size;
    float unit=min(u_size.x,u_size.y),t=u_time;
    float charge=smoothstep(0.,.2,t),release=clamp((t-.2)/.8,0.,1.);
    float fade=smoothstep(0.,.08,t)*(1.-smoothstep(.55,1.,t));
    float impact=exp(-pow((t-.255)/.055,2.));
    vec2 origin=u_origin;float scale=mix(.6,1.18,pow(release,.45));
    if(u_kind>2.5)scale*=1.28;
    if(u_kind>.5&&u_kind<1.5){origin=mix(u_origin,u_target,smoothstep(.1,.52,t));scale*=.32;}
    if(u_kind>1.5&&u_kind<2.5)scale*=.45;
    vec2 p=(pixel-origin)/(unit*.52*scale),q=p;
    float seed=u_seed;
    float r=length(p),a=atan(p.y,p.x);
    float n=fbm(p*4.+vec2(seed,t*-2.));
    float density=0.,core=0.,veil=0.;
    vec2 uv=p*.5+.5;
    // Each family changes mass, flow and silhouette, rather than just its tint.
    if(u_family<.5){
      q.x+=.12*sin(q.y*7.-t*9.);q.y+=.12;
      float flame=fbm(vec2(q.x*5.,q.y*3.-t*5.)+seed);
      density=pow(max(0.,1.-abs(q.x)*1.7-max(0.,-q.y)*.4-abs(q.y+.1)*.55),2.)*flame*3.;
      core=exp(-length(q*vec2(3.,1.5))*4.)*(.5+impact*2.);
      uv=vec2(q.x*.7+.5,q.y*.55+.54)+vec2(flame*.08,release*.06);
    }else if(u_family<1.5){
      q=rot(-.32)*p;q.y+=sin(q.x*5.-t*8.)*.12;
      float wave=abs(q.y+.16*sin(q.x*9.-t*6.)+.1*n);
      density=exp(-wave*9.)*(.4+n)*(1.-smoothstep(.3,1.45,abs(q.x)));
      core=exp(-wave*55.)*(.4+impact);uv=vec2(q.x*.4+.5,q.y*.95+.5);
    }else if(u_family<2.5){
      q.y*=1.7;r=length(q);a=atan(q.y,q.x);
      float swirl=fbm(vec2(a*2.+seed,r*8.-t*3.));
      density=exp(-pow((r-.42)*5.,2.))*(.4+swirl*1.8);
      core=exp(-abs(r-.3)*90.)*.8;uv=rot(t*.5+swirl*.1)*q*.63+.5;
      density*=smoothstep(.23,.3,r);
    }else if(u_family<3.5){
      float rays=pow(abs(sin(a*7.+seed)),18.)*exp(-r*2.2);
      density=(rays*1.6+exp(-r*r*5.)*.3)*(n+.5);core=exp(-r*9.)*2.+exp(-abs(p.y)*90.)*exp(-abs(p.x)*1.9)*impact;
      uv=rot(seed)*p*.55+.5;
    }else if(u_family<4.5||u_family>10.5){
      float cut=abs(p.y-p.x*.45+.055*sin(p.x*26.+seed));
      density=exp(-cut*20.)*(.25+n)*(1.-smoothstep(.1,1.3,abs(p.x)));core=exp(-cut*120.)*1.5*exp(-r*2.);
      uv=rot(-.4)*p*.55+.5;
    }else if(u_family<5.5){
      q=rot(-.18)*p;float streak=pow(max(0.,sin(q.y*120.+seed)),24.);
      density=streak*exp(-abs(q.y)*4.)*exp(-abs(q.x)*1.4)*(.5+n);
      core=exp(-abs(q.y)*70.)*exp(-abs(q.x)*1.5);uv=vec2(q.x*.24+.5,q.y*.85+.5);
    }else if(u_family<6.5){
      float branch=abs(p.x-.2*sin(p.y*7.+t*2.+seed));
      density=exp(-branch*9.)*exp(-abs(p.y)*1.2)*(.2+n)*1.3;
      core=exp(-branch*60.)*.35;uv=rot(.2*sin(t))*p*.55+.5;
    }else if(u_family<7.5){
      float facet=abs(sin(a*3.+seed));float shard=abs(r-(.35+.26*facet));
      density=exp(-shard*18.)*(.3+n)*1.2;core=exp(-shard*95.)*.8;uv=rot(seed)*p*.7+.5;
    }else if(u_family<8.5){
      float cell=fbm(p*6.+vec2(seed,t*.4));
      density=smoothstep(.23,.63,cell)*exp(-r*r*2.)*1.7;core=exp(-abs(cell-.5)*80.)*exp(-r*r*3.)*.35;uv=p*.62+.5+n*.08;
    }else if(u_family<9.5){
      density=n*exp(-r*r*2.2)*1.4;core=exp(-abs(r-.5-n*.1)*26.)*.12;uv=rot(t*.13)*p*.5+.5;
    }else{
      q=rot(.35*sin(t*2.))*p;q.y*=1.3;
      float orbit=abs(length(q)-.5-.09*sin(a*5.+t*7.));
      density=exp(-orbit*11.)*(.4+n)*1.5;core=exp(-orbit*65.)*.5;uv=rot(-t*.3)*p*.65+.5;
    }
    float sample1=texture2D(u_texture,clamp(uv,0.,1.)).r;
    float edge=smoothstep(0.,.08,uv.x)*smoothstep(0.,.08,uv.y)*(1.-smoothstep(.92,1.,uv.x))*(1.-smoothstep(.92,1.,uv.y));
    float material=mix(n*.6,sample1*edge,u_textureReady);
    float shell=exp(-pow((length(p)-(.22+release*.6))*8.,2.));
    density+=material*(.5+impact*.9)*(1.-smoothstep(.45,1.5,length(p)));
    density*=.55+u_power*.55;
    if(u_kind>2.5){density+=shell*(.3+n)*1.2;core+=exp(-abs(p.x)*90.)*exp(-abs(p.y)*.7)*(.2+impact);}
    if(u_kind>1.5&&u_kind<2.5){density+=material*.9+shell*.35;core+=exp(-length(p)*8.)*impact;}
    vec3 hot=mix(u_color,vec3(1.,.97,.9),clamp(core*.8,0.,.9));
    vec3 color=hot*density+mix(u_color,vec3(1),.85)*core*.7;
    color+=u_color*exp(-length(p)*3.)*.15;
    color=1.-exp(-color*1.6);
    float alpha=clamp(max(color.r,max(color.g,color.b))*1.25,0.,.92)*fade;
    gl_FragColor=vec4(color*alpha,alpha);
  }`;
  function uploadTexture(){if(!gl||!texture||!imageReady)return;gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,volume);}
  function initGPU(){
    try{
      gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,powerPreference:'low-power'});
      if(!gl)return false;
      const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
      const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);
      program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
      gl.deleteShader(vs);gl.deleteShader(fs);gl.useProgram(program);
      buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      const pos=gl.getAttribLocation(program,'a_position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
      for(const name of ['size','origin','target','color','time','family','kind','power','seed','textureReady','texture'])locations[name]=gl.getUniformLocation(program,'u_'+name);
      texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,1,1,0,gl.RGB,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0]));
      for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);
      for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.LINEAR);
      gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.uniform1i(locations.texture,0);
      uploadTexture();renderer='webgl';return true;
    }catch(e){lastError=String(e);console.warn('Cinematic WebGL fallback:',e);return false;}
  }
  function fallback(){
    // A canvas cannot change context type after WebGL initialization.
    const fresh=document.createElement('canvas');fresh.id=canvas.id;fresh.setAttribute('aria-hidden','true');canvas.replaceWith(fresh);
    surface=fresh;gl=null;ctx=fresh.getContext('2d');renderer='canvas2d';
  }
  let surface=canvas;
  if(!initGPU())fallback();
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();stopAll();fallback();});
  function resize(){
    const budget=(innerWidth<700?320000:760000)*quality;
    const d=Math.min(devicePixelRatio||1,1.5,Math.sqrt(budget/Math.max(1,innerWidth*innerHeight)));
    const w=Math.max(1,Math.round(innerWidth*d)),h=Math.max(1,Math.round(innerHeight*d));
    if(surface.width!==w||surface.height!==h){surface.width=w;surface.height=h;}
    if(gl)gl.viewport(0,0,w,h);
    return d;
  }
  function tinted(color){
    if(!imageReady)return null;if(tintCache.has(color))return tintCache.get(color);
    const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d');if(!x)return null;
    x.drawImage(volume,0,0,512,512);
    // Convert the black compositing plate to luminance alpha before tinting.
    // Screen blending alone leaves an opaque black rectangle on a transparent canvas.
    const pixels=x.getImageData(0,0,512,512),tint=rgb(color);
    for(let i=0;i<pixels.data.length;i+=4){
      const l=pixels.data[i]/255,hot=Math.pow(l,3)*.65;
      pixels.data[i]=255*lerp(tint[0],1,hot);pixels.data[i+1]=255*lerp(tint[1],1,hot);pixels.data[i+2]=255*lerp(tint[2],1,hot);
      pixels.data[i+3]=255*clamp(l*1.7);
    }
    x.putImageData(pixels,0,0);
    if(tintCache.size>=8)tintCache.delete(tintCache.keys().next().value);tintCache.set(color,c);return c;
  }
  function fallbackFrame(e,t,d){
    const release=clamp((t-.2)/.8),fade=clamp(t/.08)*(1-clamp((t-.55)/.45));
    const impact=Math.exp(-Math.pow((t-.255)/.055,2));
    const origin=e.kind===1?{x:lerp(e.from.x,e.to.x,clamp((t-.1)/.42)),y:lerp(e.from.y,e.to.y,clamp((t-.1)/.42))}:e.from;
    const size=Math.min(innerWidth,innerHeight)*(e.kind===1?.36:e.kind===2?.48:1.14)*(.55+Math.sqrt(release)*.7);
    ctx.save();ctx.scale(d,d);ctx.translate(origin.x,origin.y);ctx.globalCompositeOperation='screen';
    const sprite=tinted(e.ac);
    if(sprite){
      ctx.save();ctx.rotate(e.family===2?t*.5:e.family===5?-.25:Math.sin(e.seed)*.15);
      if(e.family===1)ctx.scale(1.3,.6);if(e.family===2)ctx.scale(1,.56);if(e.family===0)ctx.scale(.75,1.2);
      ctx.globalAlpha=fade*(.7+impact*.3);ctx.drawImage(sprite,-size/2,-size/2,size,size);ctx.restore();
    }
    const halo=ctx.createRadialGradient(0,0,0,0,0,size*.48);halo.addColorStop(0,e.ac);halo.addColorStop(1,'transparent');
    ctx.globalAlpha=fade*(.15+impact*.45);ctx.fillStyle=halo;ctx.fillRect(-size/2,-size/2,size,size);
    for(let i=0;i<36;i++){
      const a=i*2.39996+e.seed,r=(.06+Math.pow(release,.55)*(.2+(i%9)/15))*size;
      const x=Math.cos(a)*r,y=Math.sin(a)*r*(e.family===2?.5:1);
      ctx.globalAlpha=fade*(.25+(i%4)*.12);ctx.strokeStyle=i%5===0?'#fff':e.ac;ctx.lineWidth=i%3===0?2:1;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-Math.cos(a)*size*.05,y-Math.sin(a)*size*.05);ctx.stroke();
    }
    if(e.kind===3){ctx.globalAlpha=fade*(.2+impact*.5);ctx.fillStyle=e.ac;ctx.fillRect(-2,-innerHeight,4,innerHeight*2);}
    ctx.restore();
  }
  function draw(e,t,d){
    if(!gl){if(ctx)fallbackFrame(e,t,d);return;}
    gl.uniform2f(locations.size,surface.width,surface.height);
    gl.uniform2f(locations.origin,e.from.x*d,e.from.y*d);gl.uniform2f(locations.target,e.to.x*d,e.to.y*d);
    gl.uniform3fv(locations.color,e.color);gl.uniform1f(locations.time,t);gl.uniform1f(locations.family,e.family);
    gl.uniform1f(locations.kind,e.kind);gl.uniform1f(locations.power,e.power);gl.uniform1f(locations.seed,e.seed);
    gl.uniform1f(locations.textureReady,imageReady?1:0);gl.drawArrays(gl.TRIANGLES,0,6);
  }
  function clear(){if(gl){gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);}else ctx?.clearRect(0,0,surface.width,surface.height);}
  function finish(e){if(e.done)return;e.done=true;clearTimeout(e.guard);e.resolve();}
  function tick(now){
    raf=0;if(!enabled()||reduced()){closeScene();stopAll();return;}
    if(lastFrame&&now-lastFrame>38){if(++slowFrames>12){quality=Math.max(.38,quality*.8);slowFrames=0;}}else slowFrames=Math.max(0,slowFrames-1);
    lastFrame=now;const d=resize();clear();
    for(const e of active){const t=clamp((now-e.start)/e.duration);if(t>=1){finish(e);continue;}try{
      if(e.kind===1&&t>=.54&&!e.impacted){e.impacted=true;globalThis.COMPILE_AUDIO?.sfx('cinema_impact',{family:e.family});camera(.55);}
      draw(e,t,d);
    }catch(error){lastError=String(error);finish(e);}}
    active=active.filter(e=>!e.done);
    if(active.length)raf=requestAnimationFrame(tick);else{clear();surface.classList.remove('active');lastFrame=0;}
  }
  function play(protocol,kind=0,options={}){
    if(!enabled()||reduced())return Promise.resolve();
    const m=palette(protocol),family=FAMILY[protocol]??9;
    const from=options.from||{x:innerWidth*(innerWidth<650?.5:.69),y:innerHeight*(innerWidth<650?.3:.46)};
    const duration=(kind===1?780:kind===2?780:kind===3?2450:2100)*speed();
    const e={id:++next,protocol,family,kind,from,to:options.to||from,ac:m.ac,color:rgb(m.ac),seed:hash(protocol),
      power:clamp((7-(Number(options.value)||0))/7,.2,1),start:performance.now(),duration,done:false,guard:0,resolve:()=>{}};
    const promise=new Promise(resolve=>e.resolve=resolve);e.guard=setTimeout(()=>{finish(e);},duration+200);
    // Keep simultaneous local hits bounded. Large cut-ins own the stage.
    if(kind===0||kind===3){active.forEach(finish);active=[];}
    while(active.length>=3)finish(active.shift());active.push(e);surface.classList.add('active');
    if(!raf)raf=requestAnimationFrame(tick);return promise;
  }
  function stopAll(){active.forEach(finish);active=[];cancelAnimationFrame(raf);raf=0;clear();surface.classList.remove('active');lastFrame=0;}
  function camera(power=1){
    if(!enabled()||reduced()||!SET.shake)return;
    const board=document.getElementById('gameMain');if(!board?.animate)return;
    const p=Math.min(power,1.7)*3;
    board.animate([{translate:'0 0'},{translate:`${-p}px ${p*.4}px`},{translate:`${p*.65}px ${-p*.3}px`},{translate:`${-p*.2}px 0`},{translate:'0 0'}],{duration:260,easing:'ease-out'});
  }
  function closeScene(){
    const current=scene;if(!current)return;scene=null;
    clearTimeout(current.timer);current.timers.forEach(clearTimeout);stopAll();
    const el=document.getElementById('ann');if(el){el.className='announce';el.style.pointerEvents='none';el.onclick=null;el.replaceChildren();el.removeAttribute('role');el.removeAttribute('aria-modal');}
    document.removeEventListener('keydown',current.key);
    if(current.focus?.isConnected)current.focus.focus({preventScroll:true});current.resolve();
  }
  function announceCinema(subject,title,desc='',tag='能力発動',cls=''){
    closeScene();if(!enabled())return Promise.resolve();
    const protocol=typeof subject==='string'?subject:subject?.protocol||'SPIRIT',m=palette(protocol),isCompile=cls==='gold';
    const value=Number.isFinite(Number(subject?.value))?Number(subject.value):Number(String(title).match(/\b([0-6])\b/)?.[1]??3);
    const compileContext=globalThis.__compilePresentationContext;
    const tier=compileContext?.tier||1,recompile=!!compileContext?.recompile;
    const configured=Number(SET.annSec);const duration=clamp(Number.isFinite(configured)?configured:4.5,0,15)*(isCompile?1.15:1)*1000;
    if(duration===0)return Promise.resolve();
    const el=document.getElementById('ann');if(!el)return Promise.resolve();
    const visualTitle=isCompile?(recompile?'RECOMPILE':'COMPILE'):protocol;
    el.className='announce show cinema-scene'+(isCompile?' is-compile':'');
    el.style.setProperty('--cinema-ac',isCompile?'#f1cb78':m.ac);el.style.setProperty('--cinema-duration',duration+'ms');el.style.pointerEvents='auto';
    el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label',title);
    el.innerHTML=`<div class="cinema-copy"><div class="cinema-eyebrow">${esc(isCompile?(recompile?'DATA EXTRACTION':`PROTOCOL ${tier} / 3`):tag)}</div>
      <h2 class="cinema-title">${esc(visualTitle)}</h2><div class="cinema-subtitle">${esc(isCompile?protocol:m.k)}</div><div class="cinema-rule"></div>
      <div class="cinema-description">${kw(desc)}</div>${isCompile?`<div class="cinema-locks" aria-label="${tier}/3">${[1,2,3].map(n=>`<span class="${n<=tier?'complete':''}"></span>`).join('')}</div>`:''}</div>
      <div class="cinema-value">${isCompile?'LINE':'CARD VALUE'}<strong>${isCompile?String((compileContext?.line??0)+1).padStart(2,'0'):value}</strong></div>
      <div class="cinema-footer"><div class="cinema-meter"></div><button class="cinema-skip" type="button">タップで続ける <span aria-hidden="true">›</span></button></div>`;
    const previousFocus=document.activeElement;
    const promise=new Promise(resolve=>{
      const key=e=>{if(e.key==='Escape'||e.key==='Enter'||e.key===' '){e.preventDefault();closeScene();}else if(e.key==='Tab'){e.preventDefault();el.querySelector('button')?.focus();}};
      scene={resolve,timer:0,timers:[],key,focus:previousFocus};scene.timer=setTimeout(closeScene,duration);
      document.addEventListener('keydown',key);el.onclick=closeScene;el.querySelector('button')?.focus({preventScroll:true});
    });
    const current=scene;
    if(!reduced()){
      play(protocol,isCompile?3:0,{value});
      const hitAt=(isCompile?2450:2100)*speed()*.255;
      // Sound is fired when its visual phase is reached, so skipping cancels future hits.
      globalThis.COMPILE_AUDIO?.sfx('cinema_charge',{base:220+hash(protocol)*18});
      globalThis.COMPILE_AUDIO?.duck(Math.min(duration/1000,3),.18);
      current.timers.push(setTimeout(()=>{if(scene!==current)return;globalThis.COMPILE_AUDIO?.sfx(isCompile?'cinema_compile':'cinema_impact',{base:220+hash(protocol)*18,family:FAMILY[protocol]});camera(isCompile?1.7:1);},hitAt));
    }
    return promise;
  }
  const API=Object.freeze({announce:announceCinema,play,stop:()=>{closeScene();stopAll();},camera,
    debug:()=>({renderer,active:active.length,scene:!!scene,textureReady:imageReady,quality,pixels:surface.width*surface.height,lastError,protocols:Object.keys(FAMILY)}),
    preview:(protocol='FIRE',kind=0,progress=.28)=>{
      if(!enabled()||reduced())return false;stopAll();const m=palette(protocol),d=resize();surface.classList.add('active');
      draw({protocol,family:FAMILY[protocol]??9,kind,from:{x:innerWidth*.5,y:innerHeight*.45},to:{x:innerWidth*.75,y:innerHeight*.6},ac:m.ac,color:rgb(m.ac),power:1,seed:hash(protocol)},clamp(progress),d);return true;
    }});
  globalThis.COMPILE_CINEMA=API;
  document.documentElement.classList.add('cinema-ready');
  // These hooks are only visual. Network announce wrappers remain in their original order.
  fxBurst=(protocol,n=40,at=null)=>{if(n>=100)return;play(protocol,2,{from:at||undefined,value:4});};
  flashWhite=()=>{};
  shakeScreen=()=>camera(.7);
  beamFX=(fromR,toR,protocol)=>{
    if(!fromR||!toR||!enabled()||reduced())return Promise.resolve();
    const p=play(protocol,1,{from:center(fromR),to:center(toR),value:1});
    globalThis.COMPILE_AUDIO?.sfx('cinema_launch',{family:FAMILY[protocol]});
    return p;
  };
  slashFX=r=>{if(!r)return;play('DEATH',2,{from:center(r),value:2});globalThis.COMPILE_AUDIO?.sfx('cinema_impact',{family:11});};
  globalThis.COMPILE_ABILITY_FX?.stop();
  // Let players compare the actual effects without having to arrange a match.
  const oldSettings=openSettings;
  openSettings=function(...args){
    const result=oldSettings.apply(this,args),body=document.querySelector('#dialog .dialogbody');
    if(body&&!body.querySelector('.cinema-preview-controls')){
      const controls=document.createElement('fieldset');controls.className='cinema-preview-controls';
      controls.innerHTML=`<legend>演出プレビュー</legend><select aria-label="プレビューするプロトコル">${Object.keys(FAMILY).map(p=>`<option value="${p}">${p} / ${esc(palette(p).k)}</option>`).join('')}</select><select aria-label="プレビューする演出"><option value="ability">能力発動</option><option value="compile">コンパイル</option></select><button type="button">再生</button>`;
      controls.querySelector('button').onclick=()=>{
        if(!Number(SET.fx)){toast('演出速度をオンにしてから再生してください');return;}
        const [protocolSelect,kindSelect]=controls.querySelectorAll('select'),protocol=protocolSelect.value;
        const value=Number(Object.keys(DB[protocol]||{0:{}})[0]),card=DB[protocol]?.[value];
        announceCinema({protocol,value},protocol+' '+value,kindSelect.value==='compile'?'プロトコルのコンパイルに成功。':card?.m||card?.b||card?.t||'',kindSelect.value==='compile'?'COMPILE':'能力発動',kindSelect.value==='compile'?'gold':'');
      };
      body.appendChild(controls);
    }
    return result;
  };
  surface.dataset.renderer=renderer;
  addEventListener('pagehide',API.stop);document.addEventListener('visibilitychange',()=>{if(document.hidden)API.stop();});
  media.addEventListener?.('change',()=>{if(media.matches)API.stop();});
})();
