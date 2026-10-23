/* The board and its physical pieces follow the card art. Cinematics remain independent. */
const THEMES={
 battleline:{name:'古代の戦線',floor:'#30291e',players:['#a83127','#355786'],rims:['#ae3226','#355786','#b69b63'],metal:'#a77d3e',railRoughness:.85,railMetalness:.1},
 classic:{name:'木枠とフェルト',floor:'#0b110e',players:['#f2c14e','#e0566a'],rims:['#d9a53a','#b8273f','#c8a15a'],metal:'#c99a3a',railRoughness:.55,railMetalness:.05},
 gilded:{name:'黒曜と金',floor:'#070a0f',players:['#dfbf78','#c66b79'],rims:['#d4b26a','#a94d62','#8a7347'],metal:'#b79b61',railRoughness:.32,railMetalness:.65},
 graphic:{name:'アイボリー・アリーナ',floor:'#17232d',players:['#235480','#bd3035'],rims:['#235480','#bd3035','#263642'],metal:'#263642',railRoughness:1,railMetalness:0}
};
export const arenaTheme=style=>THEMES[style]||THEMES.classic;
function rounded(x,a,b,w,h,r){x.beginPath();x.moveTo(a+r,b);x.arcTo(a+w,b,a+w,b+h,r);x.arcTo(a+w,b+h,a,b+h,r);x.arcTo(a,b+h,a,b,r);x.arcTo(a,b,a+w,b,r);x.closePath();}
function line(x,points){x.beginPath();points.forEach(([a,b],i)=>i?x.lineTo(a,b):x.moveTo(a,b));x.stroke();}
function polygon(x,points){x.beginPath();points.forEach(([a,b],i)=>i?x.lineTo(a,b):x.moveTo(a,b));x.closePath();x.fill();}
export function paintArenaSurface(cv,layout,style,accent='green'){
 if(style==='classic')return false;
 const {tw,td,Z0,SO,deck,disc}=layout,W=1792,H=Math.round(W*td/tw);cv.width=W;cv.height=H;
 const x=cv.getContext('2d'),k=W/tw,P=(a,b)=>[(a+tw/2)*k,(b+td/2)*k],gold=style==='gilded';
 const ink=gold?'#cfb578':style==='battleline'?'#654e2e':'#263642',mine=gold?'#d8bd7d':style==='battleline'?'#a83127':'#235480',them=gold?'#b77483':style==='battleline'?'#355786':'#bd3035';
 const backgrounds=style==='battleline'?{green:'#d6c79e',navy:'#c8d0cc',wine:'#dcc6b3'}:gold?{green:'#10191a',navy:'#101725',wine:'#1d121a'}:{green:'#efe9da',navy:'#e5e9ec',wine:'#f1e5df'};
 x.fillStyle=backgrounds[accent]||backgrounds.green;x.fillRect(0,0,W,H);
 if(gold){
  const g=x.createRadialGradient(W*.5,H*.5,0,W*.5,H*.5,W*.85);g.addColorStop(0,'#27313a60');g.addColorStop(1,'#010205c0');x.fillStyle=g;x.fillRect(0,0,W,H);
  x.strokeStyle='#d8bd7d09';x.lineWidth=1;
  for(let a=-H;a<W+H;a+=24)line(x,[[a,0],[a-H,H]]);
  for(const inset of [20,31]){x.strokeStyle=inset===20?'#b69b5b99':'#b69b5b30';x.lineWidth=inset===20?3:1;rounded(x,inset,inset,W-2*inset,H-2*inset,10);x.stroke();}
  x.strokeStyle='#d8bd7d55';x.lineWidth=3;
  for(const [a,b,sx,sy] of [[44,44,1,1],[W-44,44,-1,1],[44,H-44,1,-1],[W-44,H-44,-1,-1]]){
   line(x,[[a+sx*80,b],[a,b],[a,b+sy*80]]);line(x,[[a+sx*14,b+sy*58],[a+sx*14,b+sy*14],[a+sx*58,b+sy*14]]);
  }
 }else{
  x.fillStyle='#2354800c';polygon(x,[[0,H*.56],[W,H*.56],[W,H],[0,H]]);
  x.fillStyle='#bd303509';polygon(x,[[0,0],[W,0],[W,H*.44],[0,H*.44]]);
  // Broad print marks echo the diagonal colour blocks on the B card faces.
  x.fillStyle='#235480';polygon(x,[[0,H*.72],[W*.05,H*.76],[W*.05,H*.94],[0,H*.98]]);
  x.fillStyle='#bd3035';polygon(x,[[W, H*.02],[W*.95,H*.06],[W*.95,H*.24],[W,H*.28]]);
  x.strokeStyle='#26364233';x.lineWidth=2;x.strokeRect(19,19,W-38,H-38);
  for(let side=0;side<2;side++)for(let i=0;i<4;i++){
   x.strokeStyle=side?mine:them;x.lineWidth=5;const a=side?W-48-i*12:48+i*12,b=side?H-58:58;
   line(x,[[a,b],[a+(side?-8:8),b+(side?-18:18)]]);
  }
 }
 // The battle line and restrained crest are readable without looking like casino felt.
 const t0=P(-5.25,-.56),t1=P(5.25,.56);x.fillStyle=gold?'#070b10':'#263642';
 rounded(x,t0[0],t0[1],t1[0]-t0[0],t1[1]-t0[1],gold?10:2);x.fill();
 x.strokeStyle=gold?'#d8bd7d66':'#f5f0e3';x.lineWidth=gold?2:3;
 for(const z of [-.56,.56]){const a=P(-5.2,z),b=P(5.2,z);line(x,[a,b]);}
 x.save();x.globalAlpha=gold?.12:.07;x.strokeStyle=ink;x.lineWidth=gold?2:12;
 for(const radius of [1.38,1.56]){x.beginPath();x.arc(W/2,H/2,radius*k,0,Math.PI*2);x.stroke();}
 x.restore();
 const len=Z0+2*SO+.7-.62+.06;
 for(let f=0;f<9;f++)for(const s of [-1,1]){
  const p=P((f-4)*1.1-.52,s>0?.62:-(.62+len)),edge=s>0?mine:them;
  x.fillStyle=gold?'#ffffff04':(f%2?'#ffffff37':'#ffffff80');rounded(x,p[0],p[1],1.04*k,len*k,gold?8:3);x.fill();
  x.strokeStyle=gold?'#d8bd7d22':'#26364220';x.lineWidth=1.5;x.stroke();
  const q=P((f-4)*1.1-.5,s>0?Z0-.7:-(Z0+.7));
  x.strokeStyle=gold?'#d8bd7d45':'#26364236';x.lineWidth=gold?1.6:2;rounded(x,q[0],q[1],k,1.4*k,gold?9:4);x.stroke();
  x.fillStyle=edge;x.globalAlpha=gold?.6:.8;
  const z=s>0?len+.62-.06:-(len+.62),mark=P((f-4)*1.1-.22,z);x.fillRect(mark[0],mark[1],.44*k,.028*k);x.globalAlpha=1;
 }
 for(const kind of ['T','X']){
  const p=P(deck[kind][0]-.6,deck[kind][1]-.8);x.fillStyle=gold?'#05080c99':'#2636420e';rounded(x,p[0],p[1],1.2*k,1.6*k,gold?10:3);x.fill();
  x.strokeStyle=gold?'#d8bd7d33':'#26364233';x.lineWidth=2;x.stroke();
 }
 const d=P(disc[0]-.62,disc[1]-.82);x.strokeStyle=gold?'#d8bd7d22':'#26364222';x.lineWidth=2;rounded(x,d[0],d[1],1.24*k,1.64*k,4);x.stroke();
 return true;
}
export function paintArenaRail(cv,style){
 if(style==='classic')return false;
 const x=cv.getContext('2d'),w=cv.width,h=cv.height,gold=style==='gilded';
 const g=x.createLinearGradient(0,0,0,h);
 if(gold){g.addColorStop(0,'#baa16b');g.addColorStop(.07,'#38372f');g.addColorStop(.3,'#171d25');g.addColorStop(.72,'#0a0f16');g.addColorStop(.94,'#292d30');g.addColorStop(1,'#8e7b54');}
 else{g.addColorStop(0,'#e8e3d8');g.addColorStop(.08,'#263642');g.addColorStop(.9,'#1a2834');g.addColorStop(1,'#e8e3d8');}
 x.fillStyle=g;x.fillRect(0,0,w,h);x.strokeStyle=gold?'#bfa56d55':'#ffffff33';x.lineWidth=gold?1:2;
 for(const y of [h*.14,h*.85])line(x,[[0,y],[w,y]]);
 if(!gold){for(let i=0;i<9;i++){x.fillStyle=i%2?'#235480':'#bd3035';polygon(x,[[i*140,h*.22],[i*140+36,h*.22],[i*140+15,h*.78],[i*140-21,h*.78]]);}}
 return true;
}
export function paintArenaToken(cv,n,state,style){
 if(style==='classic')return false;
 const x=cv.getContext('2d'),S=cv.width,gold=style==='gilded',t=arenaTheme(style),color=state<0?(gold?'#d8bd7d':'#263642'):t.players[state];
 x.fillStyle=gold?'#0e131b':state<0?'#f7f2e7':color;x.fillRect(0,0,S,S);
 x.strokeStyle=color;x.lineWidth=gold?5:7;x.beginPath();x.arc(S/2,S/2,S*.43,0,Math.PI*2);x.stroke();
 if(gold){x.strokeStyle='#d8bd7d55';x.lineWidth=2;x.beginPath();x.arc(S/2,S/2,S*.36,0,Math.PI*2);x.stroke();}
 x.fillStyle=gold?color:state<0?'#263642':'#fff8e9';x.textAlign='center';x.textBaseline='middle';x.font='700 '+S*.53+'px '+(gold?'"Cinzel",Georgia,serif':'"Oswald",Arial,sans-serif');x.fillText(String(n+1),S/2,S*.53);
 x.font='700 '+S*.065+'px Arial,sans-serif';x.fillText('FLAG',S/2,S*.24);
 return true;
}
export function paintArenaPennant(cv,n,state,style){
 if(style==='classic')return false;
 const x=cv.getContext('2d'),w=cv.width,h=cv.height,gold=style==='gilded',t=arenaTheme(style),color=state<0?(gold?'#d8bd7d':'#263642'):t.players[state];
 x.clearRect(0,0,w,h);x.fillStyle=gold?'#111923':color;
 polygon(x,[[0,0],[w,0],[w*.83,h/2],[w,h],[0,h]]);x.strokeStyle=gold?color:'#f7f2e7';x.lineWidth=gold?8:3;x.stroke();
 x.fillStyle=gold?color:'#fff8e9';x.font='700 96px '+(gold?'"Cinzel",Georgia,serif':'"Oswald",Arial,sans-serif');x.textAlign='center';x.textBaseline='middle';x.fillText(String(n+1),w*.37,h*.53);
 if(!gold){x.fillStyle=state<0?'#bd3035':'#ffffff55';polygon(x,[[w*.66,0],[w*.78,0],[w*.46,h],[w*.34,h]]);}
 return true;
}
