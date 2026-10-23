/* Ancient Battle Line layout, rendered at every resolution. Uses the existing
   CC BY 3.0 game-icons silhouettes credited in art.js, with new card framing. */
const COLORS=['#b62b25','#d17b1f','#d7af29','#3e8746','#326994','#795384'];
const NAMES=['投石兵','弓兵','投槍兵','重装歩兵','長槍兵','近衛歩兵','軽騎兵','重騎兵','戦車','戦象'];
const EN=['SKIRMISHERS','ARCHERS','JAVELINEERS','HOPLITES','PHALANGISTS','HYPASPISTS','LIGHT CAVALRY','COMPANION CAVALRY','CHARIOTS','WAR ELEPHANTS'];
const TAC=['指揮官','指揮官','近衛騎兵','盾兵','霧','泥沼','偵察','再配置','脱走','寝返り'];
const KEYS=['leader','leader','cav','shield','fog','mud','scout','redeploy','deserter','traitor'];
const paths=new Map();
function figure(x,key,cx,cy,size,col) {
 const src=typeof window==='undefined'?null:window.HTN_ART?.PATHS?.[key];
 if(!src||typeof Path2D==='undefined')return;
 if(!paths.has(key))paths.set(key,new Path2D(src));
 x.save();x.translate(cx-size/2,cy-size/2);x.scale(size/512,size/512);
 x.fillStyle=col;x.strokeStyle='#3b3029';x.lineWidth=2.5;x.fill(paths.get(key));x.stroke(paths.get(key));x.restore();
}
function text(x,t,a,b,size,col,font='Georgia,serif',max=200){x.fillStyle=col;x.font='bold '+size+'px '+font;x.textAlign='center';x.textBaseline='middle';x.fillText(t,a,b,max);}
function border(x,a,b,w,h){x.beginPath();x.roundRect(a,b,w,h,w*.04);x.closePath();}
export function paintBattleLineCard(x,c,X,Y,w,h) {
 const troop=c<60,ci=troop?Math.floor(c/10):0,value=troop?String(c%10+1):({60:'1–10',61:'1–10',62:'8',63:'1–3'}[c]||'戦術'),col=troop?COLORS[ci]:'#625240';
 x.save();border(x,X+1,Y+1,w-2,h-2);x.clip();
 x.fillStyle='#faf8ee';x.fillRect(X,Y,w,h);
 // Thin black keyline and coloured double frame echo a printed historical deck.
 x.strokeStyle='#302b25';x.lineWidth=w*.012;border(x,X+w*.035,Y+h*.025,w*.93,h*.95);x.stroke();
 x.strokeStyle=col;x.lineWidth=w*.018;x.strokeRect(X+w*.07,Y+h*.045,w*.86,h*.91);
 x.fillStyle=col;x.fillRect(X+w*.075,Y+h*.05,w*.85,h*.17);
 text(x,value,X+w*.225,Y+h*.134,(troop?w*.29:w*.16),'#fffbee','Georgia,serif',w*.31);
 text(x,troop?EN[c%10]:'TACTICS',X+w*.64,Y+h*.13,w*.047,'#fffbee','Georgia,serif',w*.51);
 // A warm picture field and ranks of soldiers, instead of a floating emblem.
 const g=x.createLinearGradient(X,Y+h*.23,X,Y+h*.83);g.addColorStop(0,'#f6f1df');g.addColorStop(1,'#d1bea0');x.fillStyle=g;x.fillRect(X+w*.087,Y+h*.232,w*.826,h*.59);
 x.fillStyle='#b69a6b33';x.beginPath();x.moveTo(X+w*.09,Y+h*.76);x.quadraticCurveTo(X+w*.4,Y+h*.65,X+w*.91,Y+h*.75);x.lineTo(X+w*.91,Y+h*.82);x.lineTo(X+w*.09,Y+h*.82);x.fill();
 const key=troop?'u'+(c%10+1):KEYS[c-60];
 if(troop){
  for(const [a,b,sz] of [[.3,.43,.32],[.66,.43,.32],[.4,.62,.42],[.69,.65,.37]])figure(x,key,X+w*a,Y+h*b,w*sz,col+'bb');
  figure(x,key,X+w*.46,Y+h*.56,w*.72,col);
 }else figure(x,key,X+w*.5,Y+h*.52,w*.76,'#736044');
 x.strokeStyle=col;x.lineWidth=w*.008;x.strokeRect(X+w*.09,Y+h*.232,w*.82,h*.59);
 text(x,troop?NAMES[c%10]:TAC[c-60],X+w*.5,Y+h*.87,w*.082,'#2c2925','sans-serif',w*.8);
 text(x,troop?'BATTLE LINE':'TACTIC • BATTLE LINE',X+w*.5,Y+h*.923,w*.041,col,'Georgia,serif',w*.8);
 x.restore();return true;
}
export function paintBattleLineBack(x,kind,w,h){
 x.save();border(x,1,1,w-2,h-2);x.clip();x.fillStyle=kind==='X'?'#3f464d':'#8e2922';x.fillRect(0,0,w,h);
 x.strokeStyle='#e4d4ad';x.lineWidth=w*.012;for(const i of [.04,.07,.11])x.strokeRect(w*i,h*i,w*(1-2*i),h*(1-2*i));
 x.globalAlpha=.1;x.strokeStyle='#fff4dd';x.lineWidth=1;for(let i=-h;i<w+h;i+=w*.08){x.beginPath();x.moveTo(i,0);x.lineTo(i+h,h);x.stroke();}x.globalAlpha=1;
 figure(x,'u4',w*.5,h*.46,w*.65,'#d9c395');
 text(x,'BATTLE',w*.5,h*.73,w*.13,'#f8e8be');text(x,'LINE',w*.5,h*.83,w*.16,'#f8e8be');
 text(x,kind==='X'?'戦術':'兵',w*.5,h*.93,w*.065,'#f8e8be','sans-serif');x.restore();return true;
}
