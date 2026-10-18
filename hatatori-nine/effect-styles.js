/* Two graphic formation cinematics. They use the active deck's art, independently of the effect style. */
import { getCardStyle, cardKey, drawEmblem } from './card-skins.js';
const NAMES=['寄せ集め','散兵','大隊','密集','楔形'];
const EN=['HOST','SKIRMISH','BATTALION','PHALANX','WEDGE'];
const clamp=v=>Math.max(0,Math.min(1,v));
const out=t=>1-Math.pow(1-t,3);
export function createCardEffects(cv,{paintCard,drawArt}) {
  const x=cv.getContext('2d');let running=null,skip=false;
  function formation(d) {
    if(running)running.finish();
    const host=cv.parentElement,rect=host.getBoundingClientRect(),W=Math.max(1,rect.width),H=Math.max(1,rect.height),DPR=Math.min(2,window.devicePixelRatio||1);
    cv.width=Math.round(W*DPR);cv.height=Math.round(H*DPR);
    const gilded=d.effectStyle==='gilded',rank=d.fog?0:d.rank,color=d.fog?'#7f929c':(d.colors&&d.colors[0])||(d.mine?'#c09d54':'#ba3c55');
    const gold='#e2c17b',paper='#f3eddd',ink='#111917',name=d.fog?'霧の陣形':NAMES[rank],en=d.fog?'FOG':EN[rank];
    const reduced=typeof matchMedia!=='undefined'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration=(d.mode==='short'||reduced?1.1:2.3)/Math.max(.5,d.speed||1),faces=d.cards.map(c=>{const k=document.createElement('canvas');k.width=408;k.height=572;paintCard(k.getContext('2d'),c,0,0,408,572);return k;});
    const dominant=d.cards.slice().sort((a,b)=>(b%10)-(a%10))[0],key=cardKey(dominant),art=getCardStyle();
    let t0=performance.now(),resolve,finished=false,skipAt=null,timeout;
    const p=new Promise(r=>resolve=r);skip=false;
    const finish=()=>{if(finished)return;finished=true;clearTimeout(timeout);cv.classList.remove('on');x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,cv.width,cv.height);running=null;if(d.onEnd)d.onEnd();resolve();};
    running={finish};cv.classList.add('on');
    function emblem(cx,cy,size,opacity=1){x.save();x.globalAlpha*=opacity;
      if(art==='graphic'&&gilded){x.fillStyle=paper;x.beginPath();x.arc(cx,cy,size*.47,0,Math.PI*2);x.fill();}
      if(!drawEmblem(x,key,cx,cy,size,art))drawArt(x,key,cx,cy,size,gilded?gold:ink);
      x.restore();
    }
    function draw(t){
      x.setTransform(DPR,0,0,DPR,0,0);x.clearRect(0,0,W,H);
      const intro=out(clamp(t/.16)),exit=clamp((t-.84)/.16),alpha=intro*(1-exit),tall=H>W*.9;
      x.save();x.globalAlpha=alpha;x.fillStyle=gilded?'rgba(8,12,13,.97)':paper;x.fillRect(0,0,W,H);
      const titleY=H*.18,cardY=H*(tall?.66:.62),cw=Math.min(W/(faces.length+1.1),H*.29,tall?112:150),ch=cw*1.4;
      if(gilded){
        const rad=Math.min(W,H)*.34;
        x.save();x.translate(W*.5,H*.48);x.rotate(reduced?0:t*.5);x.strokeStyle=gold;
        for(let ring=0;ring<3;ring++){x.globalAlpha=alpha*(.22+ring*.08);x.lineWidth=ring===1?2:1;x.beginPath();x.arc(0,0,rad*(.75+ring*.2),-Math.PI*.8+t,Math.PI*.8+t);x.stroke();}
        for(let k=0;k<24+rank*6;k++){const a=k*Math.PI*2/(24+rank*6),r=rad*(1.15+Math.sin(k*7+t*9)*.09);x.fillStyle=gold;x.globalAlpha=alpha*(.24+.45*Math.max(0,Math.sin(t*10+k)));x.fillRect(Math.cos(a)*r,Math.sin(a)*r,2,2);}
        x.restore();
        emblem(W*.5,H*.43,Math.min(W*.43,H*.5),.23);
        x.strokeStyle=gold;x.lineWidth=1;for(const yy of[H*.07,H*.93]){x.beginPath();x.moveTo(W*.07,yy);x.lineTo(W*.93,yy);x.stroke();}
      }else{
        x.fillStyle=color;x.beginPath();x.moveTo(W*(1.1-intro*.35),0);x.lineTo(W,0);x.lineTo(W,H);x.lineTo(W*.22,H);x.closePath();x.fill();
        x.save();x.globalAlpha=.1;emblem(W*.27,H*.49,Math.min(W*.75,H*.76));x.restore();
        x.strokeStyle=ink;x.lineWidth=1;const count=5+rank*2;for(let k=0;k<count;k++){const yy=H*(.33+k*.025);x.beginPath();x.moveTo(0,yy);x.lineTo(W*(.12+out(clamp(t*2))*.13),yy);x.stroke();}
        x.fillStyle=ink;x.fillRect(W*.06,H*.068,W*.13,3);x.fillRect(W*.81,H*.91,W*.13,3);
      }
      x.textAlign='center';x.textBaseline='middle';x.fillStyle=gilded?gold:ink;
      x.font='900 '+Math.min(W*.10,H*.13)+'px '+(gilded?'"Mochiy Pop One",serif':'"Dela Gothic One",sans-serif');
      x.fillText(name,W*.5+(1-intro)*W*.1,titleY,W*.87);
      x.font='700 '+Math.min(W*.028,H*.04)+'px "Oswald",sans-serif';x.fillText(en+'  /  '+(d.fog?'FOG':(rank+1)+' / 5'),W*.5,H*.29);
      faces.forEach((face,i)=>{
        const entry=out(clamp((t-.08-i*.045)/.23)),pos=i-(faces.length-1)/2;
        const fan=gilded?pos*.095:pos*.035,dx=W*.5+pos*cw*.79+(1-entry)*W*(gilded?.8:1.3)*(i%2?1:-1),dy=cardY+Math.abs(pos)*cw*.08;
        x.save();x.translate(dx,dy);x.rotate(fan*(reduced?1:entry));x.globalAlpha*=entry;
        x.shadowColor=gilded?'rgba(234,194,99,.38)':'rgba(0,0,0,.22)';x.shadowBlur=gilded?22:6;x.shadowOffsetY=8;
        x.drawImage(face,-cw/2,-ch/2,cw,ch);x.shadowColor='transparent';
        if(gilded&&!reduced){x.save();x.beginPath();x.rect(-cw/2,-ch/2,cw,ch);x.clip();const shine=(t*2-i*.07)%1.3;x.translate(-cw+shine*cw*3,0);x.rotate(.35);const g=x.createLinearGradient(-cw*.18,0,cw*.18,0);g.addColorStop(0,'rgba(255,239,185,0)');g.addColorStop(.5,'rgba(255,239,185,.26)');g.addColorStop(1,'rgba(255,239,185,0)');x.fillStyle=g;x.fillRect(-cw*.18,-ch,cw*.36,ch*2);x.restore();}
        x.restore();
      });
      if(!gilded&&!reduced){for(let k=0;k<18+rank*3;k++){const phase=(t*1.8+k*.173)%1,px=((k*.381)%1)*W,py=H*.35+phase*H*.7;x.save();x.translate(px,py);x.rotate(k+t*4);x.globalAlpha*=Math.sin(phase*Math.PI)*.6;x.fillStyle=k%3?ink:color;x.fillRect(-2,-2,3+k%3,2);x.restore();}}
      x.fillStyle=gilded?paper:ink;x.font='700 '+Math.min(W*.032,H*.042)+'px "Zen Maru Gothic",sans-serif';
      const who=d.mine?(d.mineName||'あなた'):(d.oppName||'相手');x.fillText(who+'の陣形  ·  合計 '+d.sum,W*.5,H*.87,W*.88);
      x.restore();
    }
    function frame(now){if(finished)return;let t=(now-t0)/1000/duration;if(skip&&skipAt==null)skipAt=t;if(skipAt!=null)t=Math.max(t,.86+(t-skipAt)*3);if(t>=1){finish();return;}draw(t);requestAnimationFrame(frame);}
    if(d.freezeAt!=null){draw(d.freezeAt);return p;}requestAnimationFrame(frame);timeout=setTimeout(finish,duration*1000+2000);return p;
  }
  return {formation,get busy(){return !!running;},skip(){skip=true;},clear(){if(running)running.finish();}};
}
