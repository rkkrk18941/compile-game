/* COMPILE cinematic director. Presentation only; game/network state is never mutated. */
(()=>{
  'use strict';
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
  // Every protocol owns its geometry and choreography. All devices use this renderer.
  const SCORE={FIRE:.24,WAR:.22,WATER:.38,ICE:.32,GRAVITY:.58,DARKNESS:.48,FEAR:.29,
    LIGHT:.3,CLARITY:.48,COURAGE:.36,METAL:.27,MIRROR:.44,SPEED:.18,TIME:.52,
    LIFE:.42,PEACE:.5,LUCK:.4,PLAGUE:.35,CORRUPTION:.23,SMOKE:.4,SPIRIT:.45,
    PSYCHIC:.46,CHAOS:.26,DEATH:.34};
  const surface=canvas,ctx=canvas.getContext('2d'),renderer='canvas2d-protocols';
  let lastError=null,active=[],raf=0,next=0,scene=null,quality=.8,slowFrames=0,lastFrame=0;
  const rnd=(i,s=0)=>{const n=Math.sin(i*127.1+s*311.7)*43758.5453;return n-Math.floor(n);};
  const ease=x=>1-Math.pow(1-clamp(x),3);
  const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
  const rgba=(c,a)=>{const v=rgb(c);return `rgba(${v.map(n=>Math.round(n*255)).join(',')},${clamp(a)})`;};
  function resize(){
    const budget=(innerWidth<700?320000:760000)*quality;
    const d=Math.min(devicePixelRatio||1,1.5,Math.sqrt(budget/Math.max(1,innerWidth*innerHeight)));
    const w=Math.max(1,Math.round(innerWidth*d)),h=Math.max(1,Math.round(innerHeight*d));
    if(surface.width!==w||surface.height!==h){surface.width=w;surface.height=h;}
    return d;
  }
  function path(points,fill,stroke=null,width=.006){
    ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
    if(fill){ctx.closePath();ctx.fillStyle=fill;ctx.fill();}
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}
  }
  function line(points,color,width=.006){path(points,null,color,width);}
  function ellipse(x,y,rx,ry,fill,stroke=null,width=.006,angle=0){
    if(rx<=0||ry<=0)return;ctx.beginPath();ctx.ellipse(x,y,rx,ry,angle,0,TAU);
    if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}
  }
  function gradient(x1,y1,x2,y2,stops){const g=ctx.createLinearGradient(x1,y1,x2,y2);stops.forEach(([s,c])=>g.addColorStop(s,c));return g;}
  // Soft light is an accent, never the shared silhouette of an effect.
  function glow(x,y,r,color,alpha=.3,squash=1){
    ctx.save();ctx.translate(x,y);ctx.scale(1,squash);
    const g=ctx.createRadialGradient(0,0,0,0,0,r);g.addColorStop(0,rgba(color,alpha));g.addColorStop(.3,rgba(color,alpha*.45));g.addColorStop(1,rgba(color,0));
    ctx.fillStyle=g;ctx.fillRect(-r,-r,r*2,r*2);ctx.restore();
  }
  function crystal(x,y,w,h,angle,color,a=1){
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.globalAlpha*=a;
    const tip=[0,-h];path([[-w*.55,0],[-w,-h*.55],tip,[w*.8,-h*.48],[w*.45,.06]],gradient(-w,0,w,-h,[[0,rgba(color,.2)],[.48,rgba(color,.85)],[.52,'#e7fdff'],[1,rgba(color,.4)]]),rgba(color,.8),.005);
    line([[0,.02],tip,[w*.8,-h*.48]],'#e9fcff',.004);ctx.restore();
  }
  const PAINTERS={
    FIRE(e,t,b){
      const rise=ease(t/.34),out=ease((t-.48)/.45);
      glow(0,.38,.95,'#ff5510',.48,1.15);
      // Nested opaque flame tongues, anchored to the floor and advecting upward.
      for(let i=0;i<17;i++){
        const x=(rnd(i,2)-.5)*1.16,w=.07+rnd(i,3)*.19,h=(.7+rnd(i,4)*1.5)*rise*(1-out*.55);
        const base=.7-out*.65,tip=x+Math.sin(i*4+t*16)*.11;
        ctx.beginPath();ctx.moveTo(x-w,base);ctx.bezierCurveTo(x-w*1.5,base-h*.4,tip+.18,base-h*.68,tip,base-h);
        ctx.bezierCurveTo(tip+w*.4,base-h*.55,x+w*1.6,base-h*.34,x+w,base);
        ctx.fillStyle=gradient(0,base,0,base-h,[[0,'#fff2ac00'],[.12,'#fff2ac'],[.3,'#ffb124'],[.68,'#ef4515'],[1,'#a5201400']]);ctx.fill();
      }
      for(let i=0;i<62;i++){const v=(t*(.9+rnd(i,1))+rnd(i,7))%1,x=(rnd(i,9)-.5)*(1.2+v*.7),y=.65-v*2.5;
        line([[x,y],[x+Math.sin(i+t*9)*.018,y+.03+v*.08]],i%4?'#ffb136':'#fff4cc',.005+rnd(i)*.009);}
    },
    WATER(e,t,b){
      const advance=ease(t/.58),x=-1.8+advance*2.25,breakWave=ease((t-.38)/.42);
      ctx.save();ctx.translate(breakWave*.3,breakWave*.32);ctx.scale(1+breakWave*.2,1-breakWave*.62);
      for(let j=0;j<9;j++){
        const y=.55+j*.024,h=.86-j*.058;
        ctx.beginPath();ctx.moveTo(-2,y);ctx.bezierCurveTo(-.8,y+.1,x-.55,y-.1,x-.45,y-h);
        ctx.bezierCurveTo(x-.35,y-h-.55,x+.4,y-h-.63,x+.46,y-h*.52);
        ctx.bezierCurveTo(x+.2,y-h*.9,x-.03,y-h*.66,x+.14,y-h*.33);
        ctx.bezierCurveTo(x+.38,y-.01,x+.73,y+.08,1.7,y+.18);ctx.lineTo(1.7,y+.42);ctx.lineTo(-2,y+.42);ctx.closePath();
        ctx.fillStyle=gradient(0,-.7,0,1,[[0,'#e3ffff'],[.27,'#72e6f3'],[.55,'#168fc7'],[1,'#052b6f00']]);ctx.globalAlpha*=.87;ctx.fill();ctx.globalAlpha/=.87;
        ctx.strokeStyle=rgba('#c9ffff',.54);ctx.lineWidth=.005;ctx.stroke();
      }
      ctx.restore();
      for(let i=0;i<64;i++){const p=(t*1.5+rnd(i))%1,a=rnd(i,2)*2.1-2.6,r=.12+p*.9;
        ellipse(x+.15+Math.cos(a)*r+breakWave*(rnd(i,8)*1.3),.03+Math.sin(a)*r+p*p*.65-breakWave*.3,.006+rnd(i,4)*.014,.015+rnd(i,6)*.025,'#caffff',null,.006,-.6);}
    },
    GRAVITY(e,t,b){
      const pull=smooth(t/.6),collapse=1-ease((t-.62)/.32)*.75;
      ctx.save();ctx.scale(collapse,collapse);
      // Visible space bends inward; debris spirals toward the opaque event horizon.
      for(let j=-7;j<=7;j++){
        const points=[];for(let i=0;i<=64;i++){const x=-1.65+i*.052,y=j*.17,r=Math.hypot(x,y),bend=.3*pull*Math.exp(-r*r*1.5);points.push([x*(1-bend),y*(1-bend)+bend*.65]);}
        line(points,rgba('#927fea',.17),.004);
      }
      for(let j=0;j<11;j++){const points=[];for(let i=0;i<110;i++){const a=i/109*TAU,r=.34+j*.042+.025*Math.sin(a*3+t*4);points.push([Math.cos(a+t*1.2)*r*1.6,Math.sin(a+t*1.2)*r*.42]);}
        line(points,rgba(j%3?'#ae8cff':'#fff1db',.25+j/22),j%3?.009:.018);}
      for(let i=0;i<65;i++){const v=(rnd(i)+t*.8)%1,a=i*2.4+t*(1+v*4),r=1.5*(1-v)+.2;
        line([[Math.cos(a)*r,Math.sin(a)*r*.67],[Math.cos(a-.07)*r*1.08,Math.sin(a-.07)*r*.7]],rgba('#cab0ff',v),.005);}
      ellipse(0,0,.34,.31,'#03040b','#e1ccff',.012);glow(0,-.28,.44,'#c3a7ff',.45,.18);ctx.restore();
    },
    ICE(e,t,b){
      const split=ease((t-.56)/.3);
      for(let i=0;i<14;i++){
        const u=i/13,grow=ease((t-u*.15)/.2),x=(u-.5)*1.4+Math.sign(u-.5)*split*.45,y=.65+split*.3;
        crystal(x,y,(.09+rnd(i,2)*.07)*grow,(.62+rnd(i,3)*1.18)*grow,(u-.5)*.65+split*(u-.5),'#77d8ff');
      }
      for(let i=0;i<34;i++){const p=ease((t-.3-rnd(i)*.18)/.5),a=i*2.4;
        crystal(Math.cos(a)*p*1.4,Math.sin(a)*p*1.05,.016,.045+rnd(i,2)*.09,a+t,'#c8f5ff',p*.8);}
      line([[-1,.7],[-.5,.61],[0,.71],[.5,.64],[1,.72]],'#d7fbff',.015);
    },
    WAR(e,t,b){
      for(let j=0;j<5;j++){
        const k=clamp((t-j*.085)/.34),hit=clamp((k-.46)/.54),x=(j-2)*.4,y=.2+Math.sin(j*7)*.25;
        if(k<.5){line([[x-1.4,y-1.8],[x-1.4*(1-k*2),y-1.8*(1-k*2)]],'#ff6f32',.042);line([[x-1.2,y-1.5],[x-1.4*(1-k*2),y-1.8*(1-k*2)]],'#fff3b0',.012);}
        else {glow(x,y,.48*(1+hit),'#ff641f',.7*(1-hit));const pts=[];for(let i=0;i<24;i++){const a=i/24*TAU,r=(i%2?.18:.43)*(ease(hit/.2)+.2)*(1-hit*.6);pts.push([x+Math.cos(a)*r,y+Math.sin(a)*r]);}path(pts,rgba('#ffac4b',1-hit));
          for(let i=0;i<13;i++){const a=i*2.4+j,r=hit*(.35+rnd(i)*.6);line([[x+Math.cos(a)*r,y+Math.sin(a)*r+hit*hit*.5],[x+Math.cos(a)*r*.7,y+Math.sin(a)*r*.7+hit*hit*.4]],rgba('#ffd28e',1-hit),.012);}}
      }
    },
    DARKNESS(e,t,b){
      const shut=smooth(t/.5),reopen=ease((t-.6)/.35),gap=.65*(1-shut)+.025+reopen*.16;
      for(const side of [-1,1]){const pts=[[side*1.8,-1.5],[side*1.8,1.5]];for(let i=0;i<=28;i++){const y=1.5-i*3/28;pts.push([side*(gap+.05*Math.sin(y*8+t*3)+.08*rnd(i,3)),y]);}
        path(pts,gradient(0,0,side*1.7,0,[[0,'#05030df7'],[.7,'#110a24ba'],[1,'#10082100']]),'#8c56c9',.006);}
      glow(0,0,.24,'#ad58ff',.5,4);line([[0,-1.1],[0,1.1]],rgba('#e8cfff',shut*.8),.007*(1-reopen));
    },
    FEAR(e,t,b){
      const blink=Math.sin(clamp((t-.1)/.7)*Math.PI),tremor=Math.sin(t*97)*.026;
      for(const side of [-1,1]){ctx.save();ctx.translate(side*.38+tremor,-.13);ctx.rotate(side*.24);
        const h=.14*blink;path([[-.3,0],[-.13,-h],[.24,-h*.5],[.32,0],[.08,h],[-.17,h*.65]],'#170711','#ff526c',.009);
        ellipse(.02,0,.025,h*.85,'#ffe4d9');glow(.02,0,.32,'#ff324f',.32,.5);ctx.restore();}
      for(let j=0;j<7;j++){const x=(j-3)*.12;line([[x,-.0],[x+.03,.3+t*.23],[x-.035,.42+t*.35],[x+.01,.55+t*.5]],rgba('#e84266',.4),.006);}
      for(let i=0;i<15;i++){const a=i/15*TAU,x=Math.cos(a)*1.2,y=Math.sin(a)*1.1;line([[x,y],[x*.86+tremor,y*.86],[x*.91,y*.7]],rgba('#9e2e56',.45),.012);}
    },
    LIGHT(e,t,b){
      const open=ease(t/.3),w=.045+Math.sin(clamp(t/.85)*Math.PI)*.24;
      path([[-w*.5,-1.8],[w*.5,-1.8],[w*2,.8],[-w*2,.8]],gradient(0,-1.7,0,.9,[[0,'#fffdec00'],[.25,'#ffefafba'],[.8,'#fffceefa'],[1,'#fffec800']]));
      glow(0,.2,.72,'#fff1b3',.6);ellipse(0,-.35,.34*open,.34*open,null,'#fff3bf',.017);
      for(let i=0;i<12;i++){const a=i/12*TAU,r=.38*open,r2=(.66+(i%3)*.1)*open;line([[Math.cos(a)*r,Math.sin(a)*r-.35],[Math.cos(a)*r2,Math.sin(a)*r2-.35]],'#ffeec0',.012);}
      line([[-1.1,.2],[1.1,.2]],rgba('#fffef2',Math.max(0,1-Math.abs(t-.3)*6)),.017);
    },
    CLARITY(e,t,b){
      const align=smooth(t/.5),split=1-align;
      for(let i=0;i<7;i++){const y=(i-3)*.18,x=Math.sin(i*4)*split*.7;
        line([[-1.2,y+.2*split],[x-.32,y],[x+.3,y*(1-align*.3)],[1.3,y*.4]],rgba('#b8f7ff',.2+align*.5),.008);}
      ctx.save();ctx.rotate(split*.65);path([[0,-.72],[.48,.35],[-.48,.35]],gradient(-.4,0,.4,0,[[0,'#125b7760'],[.5,'#c4faffb0'],[1,'#174d6830']]),'#e8ffff',.014);
      line([[0,-.72],[0,.18],[-.48,.35]],'#ddffff',.005);line([[0,.18],[.48,.35]],'#ddffff',.005);ctx.restore();
      for(let i=0;i<5;i++)line([[.18,.0],[1.35,.05+i*.13]],rgba(['#ffffff','#aff6ff','#87bfff','#c6a2ff','#f8c5ff'][i],align*.7),.018);
    },
    COURAGE(e,t,b){
      const unfurl=ease(t/.38),strike=ease((t-.3)/.2);
      for(const s of [-1,1])for(let i=0;i<8;i++){const x=s*(.22+(i*.1)*unfurl),y=.05+i*.068;
        path([[s*.14,.32],[x,y],[s*(.45+(7-i)*.095)*unfurl,-.65+i*.1],[x+s*.035,y+.15]],gradient(0,.4,s,-.7,[[0,'#996024'],[.55,'#ffe0a0'],[1,'#fff5d1']]),'#e3b461',.004);}
      path([[0,-.62],[.37,-.42],[.32,.24],[0,.6],[-.32,.24],[-.37,-.42]],gradient(-.3,0,.3,0,[[0,'#85552b'],[.5,'#dfb772'],[.52,'#fff0b0'],[1,'#815124']]),'#ffedaf',.017);
      path([[0,-.35],[.18,.08],[.05,.03],[0,.3],[-.05,.03],[-.18,.08]],'#fff5d8');glow(0,.05,.4,'#ffd68b',strike*.25);
    },
    METAL(e,t,b){
      for(let j=0;j<3;j++){const drop=ease((t-j*.095)/.22),offset=(j-1)*.43;
        ctx.save();ctx.translate(offset,-1.9+drop*1.9);ctx.rotate(-.28);
        path([[-.13,-1.4],[.14,-1.4],[.14,.68],[0,.91],[-.13,.66]],gradient(-.13,0,.14,0,[[0,'#243a4d'],[.35,'#8bafc6'],[.47,'#f0fcff'],[.53,'#bad3de'],[1,'#385268']]),'#d8edf3',.008);
        line([[.08,-1.3],[.08,.62]],'#ffffff',.005);ctx.restore();
        const hit=clamp((t-j*.095-.2)/.45);if(hit>0)for(let i=0;i<16;i++){const a=(rnd(i,j)-.5)*Math.PI,r=hit*(.5+rnd(i)*.9);
          line([[offset+Math.sin(a)*r,.7-Math.cos(a)*r+hit*hit],[offset+Math.sin(a)*r*.8,.7-Math.cos(a)*r*.8+hit*hit]],rgba('#ffe6a7',1-hit),.009);}
      }
    },
    MIRROR(e,t,b){
      const shatter=ease((t-.44)/.4),r=.85;
      for(let i=0;i<12;i++){const a=i/12*TAU,a2=(i+1)/12*TAU,dx=Math.cos(a+.25)*shatter*.65,dy=Math.sin(a+.25)*shatter*.65;
        ctx.save();ctx.translate(dx,dy);ctx.rotate(shatter*(i%2?1:-1)*.25);
        path([[0,0],[Math.cos(a)*r,Math.sin(a)*r],[Math.cos(a2)*r,Math.sin(a2)*r]],gradient(-.8,-.8,.8,.8,[[0,i%2?'#1f345475':'#bad6eeaa'],[.46,'#557e9e66'],[.5,'#edffffee'],[.56,'#6f92bc70'],[1,'#1a284877']]),'#c4e6ff',.007);
        ctx.restore();}
      if(t<.44){line([[-.5,-.58],[.62,.53]],'#f1ffff',.018);}
    },
    SPEED(e,t,b){
      const run=ease(t/.65),head=-1.7+run*3.3;
      for(let i=0;i<42;i++){const y=(rnd(i)-.5)*1.35,lead=head+(rnd(i,2)-.5)*.8,len=.35+rnd(i,3)*1.5;
        path([[lead-len,y],[lead,y-.005],[lead+.12,y],[lead-len,y+.009+rnd(i,5)*.022]],gradient(lead-len,0,lead,0,[[0,'#6aeaff00'],[1,i%5?'#73dcff':'#efffff']]));}
      path([[head-.8,-.2],[head+.08,0],[head-.8,.2],[head-.53,0]],'#e8ffff');
      for(const s of [-1,1])line([[head-.5,s*.4],[head-.3,s*.19],[head-.2,0]],rgba('#b6faff',.8),.01);
    },
    TIME(e,t,b){
      const snap=t<.5?ease(t/.5):1-ease((t-.5)/.5)*.3,angle=t<.5?t*5:2.5-(t-.5)*9;
      for(let ring=0;ring<3;ring++){const r=.52+ring*.19;ellipse(0,0,r,r,null,rgba('#d5b984',ring===1?.8:.28),ring===1?.012:.006);}
      for(let i=0;i<60;i++){const a=i/60*TAU+angle*.12,r=.69;line([[Math.cos(a)*r,Math.sin(a)*r],[Math.cos(a)*(r+(i%5?.035:.085)),Math.sin(a)*(r+(i%5?.035:.085))]],'#ecd8b1',i%5?.004:.012);}
      for(let j=4;j>=0;j--){const a=angle-j*.13*(1-snap*.85);line([[0,0],[Math.sin(a)*.57,-Math.cos(a)*.57]],rgba('#fff0c8',1-j*.2),.015-j*.002);}
      line([[0,0],[Math.sin(angle*.23)*.33,-Math.cos(angle*.23)*.33]],'#fff1d3',.022);ellipse(0,0,.036,.036,'#fff7db');
      for(const s of [-1,1])path([[s*.94,-.2],[s*.77,0],[s*.94,.2]],null,'#bda477',.012);
    },
    LIFE(e,t,b){
      const grow=ease(t/.6);
      function branch(x,y,len,a,depth,seed){if(depth===0)return;const progress=clamp(grow*5-(4-depth));if(progress<=0)return;
        const nx=x+Math.sin(a)*len*progress,ny=y-Math.cos(a)*len*progress;
        line([[x,y],[(x+nx)/2+.035*Math.sin(seed), (y+ny)/2],[nx,ny]],depth>2?'#88c78d':'#b9edb7',.01+depth*.006);
        if(depth<3){ctx.save();ctx.translate(nx,ny);ctx.rotate(a);path([[0,0],[-.07,-.07],[0,-.17],[.07,-.07]],gradient(0,0,0,-.17,[[0,'#379574'],[1,'#d2f7ac']]));ctx.restore();}
        branch(nx,ny,len*.71,a-.45,depth-1,seed+1);branch(nx,ny,len*.76,a+.5,depth-1,seed+2);
      }
      for(let i=0;i<7;i++)line([[0,.65],[(i-3)*.12,.78],[(i-3)*.25,.8+.08*Math.sin(i)]],rgba('#82c396',grow),.016);
      branch(0,.65,.6,0,5,3);for(let i=0;i<20;i++){const x=(rnd(i)-.5)*1.7,y=.7-((rnd(i,2)+t*.6)%1)*1.7;glow(x,y,.035,'#caffb0',.6);}
    },
    PEACE(e,t,b){
      const bloom=ease(t/.65);
      for(let j=0;j<5;j++){const r=(.22+(t*.5+j*.19)%1)*1.25;ellipse(0,.55,r,r*.15,null,rgba('#b1eedc',(1-r/1.6)*.45),.006);}
      for(let i=-3;i<=3;i++){ctx.save();ctx.translate(0,.25);ctx.rotate(i*.26*bloom);
        const h=.65*bloom,w=.15+Math.abs(i)*.02;ctx.beginPath();ctx.moveTo(0,.2);ctx.bezierCurveTo(-w,-.1,-w,-h*.6,0,-h);ctx.bezierCurveTo(w,-h*.6,w,-.1,0,.2);
        ctx.fillStyle=gradient(0,.2,0,-h,[[0,'#265668'],[.55,'#78baae'],[1,'#e4fff2']]);ctx.fill();ctx.strokeStyle='#c6f0de';ctx.lineWidth=.006;ctx.stroke();ctx.restore();}
      glow(0,.08,.26,'#dcfff0',.25);
    },
    LUCK(e,t,b){
      const settle=ease(t/.42),turn=(1-settle)*3;
      for(let j=0;j<3;j++){const x=(j-1)*.5,y=Math.sin(j*3)*.18-(1-settle)*.9;
        ctx.save();ctx.translate(x,y);ctx.rotate(turn+(j-1)*.21);
        path([[-.19,-.24],[.21,-.19],[.25,.2],[-.16,.24]],gradient(-.2,-.2,.2,.2,[[0,'#fff3bd'],[.5,'#c89442'],[1,'#765125']]),'#ffe8ab',.01);
        for(let i=0;i<j+3;i++){const col=i%2,row=Math.floor(i/2);ellipse(-.075+col*.15,-.12+row*.12,.025,.025,'#503519');}ctx.restore();}
      for(let i=0;i<16;i++){const a=i*2.4,r=.6+((t+rnd(i))%1)*.6,x=Math.cos(a)*r,y=Math.sin(a)*r*.8,s=.035*(.5+Math.sin(t*6+i)**2);
        path([[x-s,y],[x-s*.2,y-s*.2],[x,y-s*2],[x+s*.2,y-s*.2],[x+s,y],[x+s*.2,y+s*.2],[x,y+s*2],[x-s*.2,y+s*.2]],'#ffeab0');}
    },
    PLAGUE(e,t,b){
      for(let i=0;i<17;i++){const a=i*2.4,r=Math.sqrt(i/17)*.83,x=Math.cos(a)*r,y=Math.sin(a)*r,g=ease((t-i*.012)/.32),size=(.12+rnd(i)*.12)*g;
        glow(x,y,size*1.8,'#8cad43',.2);const pts=[];for(let k=0;k<=32;k++){const angle=k/32*TAU,rr=size*(1+.13*Math.sin(angle*7+t*8+i));pts.push([x+Math.cos(angle)*rr,y+Math.sin(angle)*rr]);}
        path(pts,rgba('#304a25',.75),'#aaca60',.011);ellipse(x-size*.17,y+size*.1,size*.27,size*.24,'#8ca94a','#dfed9b',.006);
        for(let k=0;k<7;k++){const a=k/7*TAU;line([[x+Math.cos(a)*size,y+Math.sin(a)*size],[x+Math.cos(a)*size*1.24,y+Math.sin(a)*size*1.24]],'#aec879',.008);}}
    },
    CORRUPTION(e,t,b){
      const spread=ease(t/.35),frame=Math.floor(t*24);
      for(let j=0;j<26;j++){const y=(j-13)*.068,width=(.25+rnd(j,4)*1.1)*spread,shift=(rnd(j,frame)-.5)*.45;
        ctx.fillStyle=j%4?'#a355bb':'#d1f2d4';ctx.globalAlpha*=.25+rnd(j,6)*.6;ctx.fillRect(-width*.5+shift,y,width,.022+rnd(j)*.035);ctx.globalAlpha/=.25+rnd(j,6)*.6;
        for(let i=0;i<4;i++){const x=(rnd(i+j*4,frame)-.5)*1.55;ctx.fillStyle=i%2?'#53375d':'#e595e2';ctx.fillRect(x,y,.015+rnd(j,i)*.09,.03);}}
      line([[-.7,-.8],[-.68,-.08],[.45,-.08],[.45,.5],[-.25,.5],[-.25,.8]],'#aaffb7',.012);
    },
    SMOKE(e,t,b){
      // Layered soft volumes with opaque cores, drifting sideways rather than exploding.
      for(let i=0;i<32;i++){const x=(rnd(i,2)-.5)*1.5+Math.sin(t*2+i)*.12,y=.65-(rnd(i,3)*1.5+t*.45),r=.18+rnd(i,5)*.32;
        const g=ctx.createRadialGradient(x-r*.15,y-r*.3,0,x,y,r);g.addColorStop(0,rgba('#bbb9c8',.48));g.addColorStop(.45,rgba('#666978',.5));g.addColorStop(1,'#30344900');
        ellipse(x,y,r,r*.85,g);}
      for(let j=0;j<5;j++){const pts=[];for(let k=0;k<45;k++){const y=.6-k*.035,x=Math.sin(y*4+t*2+j)*(.1+j*.065);pts.push([x,y]);}line(pts,rgba('#e0dae7',.13),.015);}
    },
    SPIRIT(e,t,b){
      for(let j=0;j<7;j++){const y=.7-((t*.8+j*.15)%1)*1.9,x=Math.sin(j*4+t*2)*(.23+j*.04),s=.65+rnd(j)*.45;
        ctx.save();ctx.translate(x,y);ctx.scale(s,s);
        ctx.beginPath();ctx.moveTo(-.1,0);ctx.bezierCurveTo(-.18,-.3,.18,-.3,.12,0);ctx.bezierCurveTo(.12,.17,-.12,.3,.07,.62);ctx.bezierCurveTo(-.26,.35,-.16,.13,-.1,0);
        ctx.fillStyle=gradient(0,-.25,0,.6,[[0,'#e1fff0cf'],[.3,'#77cdbd9c'],[1,'#6bd6c000']]);ctx.fill();
        line([[0,-.16],[-.035,.02],[.04,.18],[-.06,.35]],rgba('#e4fff5',.55),.01);glow(0,-.1,.2,'#b7fff0',.25);ctx.restore();}
    },
    PSYCHIC(e,t,b){
      const open=Math.sin(clamp(t/.95)*Math.PI),h=.45*open;
      for(let j=4;j>=0;j--){const w=1+j*.05,hh=h+j*.04;ctx.beginPath();ctx.moveTo(-w,0);ctx.bezierCurveTo(-.5,-hh*1.8,.5,-hh*1.8,w,0);ctx.bezierCurveTo(.5,hh*1.8,-.5,hh*1.8,-w,0);
        ctx.strokeStyle=rgba('#d6a3ff',.65-j*.11);ctx.lineWidth=j?.007:.019;ctx.stroke();}
      ctx.save();ctx.scale(1,Math.max(.01,open));ellipse(0,0,.36,.36,'#191026','#d5a4ff',.012);
      for(let i=0;i<36;i++){const a=i/36*TAU+t*.3;line([[Math.cos(a)*.16,Math.sin(a)*.16],[Math.cos(a)*.33,Math.sin(a)*.33]],rgba('#c492e9',.6),.009);}
      ellipse(0,0,.115,.2,'#03030c');ellipse(-.1,-.11,.046,.032,'#eee0ff');ctx.restore();
    },
    CHAOS(e,t,b){
      const frame=Math.floor(t*18);
      for(let j=0;j<9;j++){const a=j*2.4+t*(j%2?1:-1),r=.22+j*.082,x=Math.cos(a)*r,y=Math.sin(a)*r;
        ctx.save();ctx.translate(x,y);ctx.rotate(a+frame*.06);const s=.12+rnd(j)*.12;
        path([[0,-s],[s,s*.65],[-s,s*.65]],rgba(j%2?'#e743b8':'#44d7ee',.24),j%2?'#ff71d2':'#7bf0ff',.012);ctx.restore();}
      for(let j=0;j<3;j++){const pts=[];for(let i=0;i<10;i++)pts.push([-1.1+i*.24,(rnd(i+j*10,frame)-.5)*1.1]);line(pts,['#ffc0ed','#7bebef','#ce92ff'][j],.013-j*.003);}
    },
    DEATH(e,t,b){
      const cut=ease((t-.1)/.25),separate=ease((t-.37)/.5);
      ctx.save();ctx.rotate(-.6);
      for(const s of [-1,1])path([[-.55,s*.04+s*separate*.18],[.55,s*.04+s*separate*.18],[.55,s*.73],[-.55,s*.73]],gradient(0,0,0,s*.8,[[0,'#464259cf'],[1,'#17142400']]),rgba('#90819f',.3),.005);
      const tip=-1.4+cut*2.8;
      ctx.beginPath();ctx.moveTo(tip,0);ctx.bezierCurveTo(tip-.48,-.35,tip-1.15,-.53,tip-1.65,-.3);ctx.bezierCurveTo(tip-1.1,-.32,tip-.7,-.11,tip,0);
      ctx.fillStyle=gradient(tip-1.7,0,tip,0,[[0,'#9a7bd000'],[.65,'#b4a0e2'],[1,'#fff1ff']]);ctx.fill();
      line([[-1.35,0],[tip,0]],rgba('#f0dfff',1-separate),.014);ctx.restore();
    }
  };
  function draw(e,t,d){
    if(!ctx)return;
    const travel=clamp((t-.08)/.46),origin=e.kind===1?{x:lerp(e.from.x,e.to.x,ease(travel)),y:lerp(e.from.y,e.to.y,ease(travel))}:e.from;
    const unit=Math.min(innerWidth,innerHeight)*(e.kind===1?.13:e.kind===2?.18:e.kind===3?.46:.4);
    const fade=smooth(t/.07)*(1-smooth((t-.76)/.24));
    ctx.save();
    try{
      ctx.scale(d,d);ctx.translate(origin.x,origin.y);ctx.scale(unit,unit);ctx.globalAlpha=fade;
      // Attacks travel first, then play the same protocol's distinctive contact animation.
      const stage=e.kind===1?(t<.54?t/.54*.24:.24+(t-.54)/.46*.76):t;
      ctx.save();
      try{
        if(e.kind===3){const gather=ease((t-.58)/.32);ctx.scale(1-gather*.86,1-gather*.25);}
        (PAINTERS[e.protocol]||PAINTERS.SPIRIT)(e,stage);
      }finally{ctx.restore();}
      // Compile is an extraction: protocol geometry contracts into a data gate at the end.
      if(e.kind===3&&t>.58){const p=ease((t-.58)/.3),w=.92*(1-p)+.16;
        for(const s of [-1,1])line([[s*w,-1.02],[s*w,-.85],[s*w,.85],[s*w,1.02]],rgba('#f4d394',p),.012);
        for(let i=0;i<8;i++){const y=-.75+i*.21;line([[-w,y],[-w+.06,y]],rgba('#fff1c7',p),.007);line([[w-.06,y],[w,y]],rgba('#fff1c7',p),.007);}}
    }finally{ctx.restore();}
  }
  function clear(){ctx?.clearRect(0,0,surface.width,surface.height);}
  function finish(e){if(e.done)return;e.done=true;clearTimeout(e.guard);e.resolve();}
  function tick(now){
    raf=0;if(!enabled()||reduced()){closeScene();stopAll();return;}
    if(lastFrame&&now-lastFrame>38){if(++slowFrames>12){quality=Math.max(.38,quality*.8);slowFrames=0;}}else slowFrames=Math.max(0,slowFrames-1);
    lastFrame=now;const d=resize();clear();
    for(const e of active){const t=clamp((now-e.start)/e.duration);if(t>=1){finish(e);continue;}try{
      if(e.kind===1&&t>=.54&&!e.impacted){e.impacted=true;globalThis.COMPILE_AUDIO?.sfx('cinema_impact',{family:e.family,protocol:e.protocol});camera(.55);}
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
    const el=document.getElementById('ann');if(el){el.className='announce';el.style.pointerEvents='none';el.onclick=null;el.replaceChildren();el.removeAttribute('role');el.removeAttribute('aria-modal');el.removeAttribute('aria-label');}
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
      const hitAt=(isCompile?2450:2100)*speed()*(SCORE[protocol]??.3);
      // Sound is fired when its visual phase is reached, so skipping cancels future hits.
      globalThis.COMPILE_AUDIO?.sfx('cinema_charge',{base:220+hash(protocol)*18});
      globalThis.COMPILE_AUDIO?.duck(Math.min(duration/1000,3),.18);
      current.timers.push(setTimeout(()=>{if(scene!==current)return;globalThis.COMPILE_AUDIO?.sfx(isCompile?'cinema_compile':'cinema_impact',{base:220+hash(protocol)*18,family:FAMILY[protocol],protocol});camera(isCompile?1.7:1);},hitAt));
    }
    return promise;
  }
  const API=Object.freeze({announce:announceCinema,play,stop:()=>{closeScene();stopAll();},camera,
    debug:()=>({renderer,active:active.length,scene:!!scene,quality,pixels:surface.width*surface.height,lastError,protocols:Object.keys(PAINTERS)}),
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
    globalThis.COMPILE_AUDIO?.sfx('cinema_launch',{family:FAMILY[protocol],protocol});
    return p;
  };
  slashFX=r=>{if(!r)return;play('DEATH',2,{from:center(r),value:2});globalThis.COMPILE_AUDIO?.sfx('cinema_impact',{family:11,protocol:'DEATH'});};
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
