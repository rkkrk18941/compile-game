/* Graphic card designs A/B. Game indices are live text; only the emblems are raster artwork. */
import { paintBattleLineCard, paintBattleLineBack } from './battleline-cards.js?v=20261023-battleline-1';
export const CARD_STYLES = { battleline: 'バトルライン', classic: '既存', gilded: 'A・黒と金', graphic: 'B・グラフィック' };
export const EFFECT_STYLES = { classic: '既存の戦場', gilded: '金の光・紋章', graphic: 'グラフィック' };
const COLORS = ['#bd3035','#9b5119','#85651b','#16694f','#235480','#75448d'];
const EN = ['SLINGER','ARCHER','JAVELIN','HOPLITE','PIKEMAN','ROYAL GUARD','LIGHT CAVALRY','CAVALRY','CHARIOT','ELEPHANT'];
const JP = ['投石兵','弓兵','投槍兵','重装歩兵','長槍兵','近衛歩兵','軽騎兵','重騎兵','戦車','戦象'];
const TAC = {60:'指揮官',61:'指揮官',62:'近衛騎兵',63:'盾兵',64:'霧',65:'泥沼',66:'偵察',67:'再配置',68:'脱走',69:'寝返り'};
const TAC_EN = {60:'COMMANDER',61:'COMMANDER',62:'GUARD CAVALRY',63:'SHIELD BEARER',64:'FOG',65:'MUD',66:'SCOUT',67:'REDEPLOY',68:'DESERTION',69:'BETRAYAL'};
const KEY = {leader:10,cav:11,shield:12,fog:13,mud:14,scout:15,redeploy:16,deserter:17,traitor:18,back:19};
const images = {}, pending = {};
let skin = 'battleline';
export const getCardStyle = () => skin;
export function setCardStyle(value) { skin = Object.hasOwn(CARD_STYLES,value) ? value : 'classic'; return skin; }
export function loadCardStyle(style) {
  if(style==='classic'||style==='battleline')return Promise.resolve();
  if(images[style])return Promise.resolve();
  if(!pending[style])pending[style]=new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{images[style]=img;resolve();};
    img.onerror=()=>{delete pending[style];reject(new Error('カードの画像を読み込めませんでした'));};
    img.src=new URL('./assets/cards/'+style+'-emblems-v1.webp',import.meta.url).href;
  });
  return pending[style];
}
export function emblemIndex(key) { return /^u\d+$/.test(key) ? Math.max(0,Math.min(9,Number(key.slice(1))-1)) : (KEY[key] ?? 0); }
export function cardKey(c) { return c<60?'u'+(c%10+1):({60:'leader',61:'leader',62:'cav',63:'shield',64:'fog',65:'mud',66:'scout',67:'redeploy',68:'deserter',69:'traitor'}[c] || 'back'); }
export function drawEmblem(ctx,key,cx,cy,size,style=skin,flip=false) {
  const image=images[style];if(!image)return false;
  const i=emblemIndex(key),sw=image.width/5;
  const rows=[0,.276,.535,.758,1], row=Math.floor(i/5),sy=rows[row]*image.height,sh=(rows[row+1]-rows[row])*image.height;
  ctx.save();ctx.translate(cx,cy);if(flip)ctx.scale(-1,1);
  ctx.drawImage(image,(i%5)*sw+sw*.027,sy+sh*.018,sw*.946,sh*.964,-size/2,-size/2,size,size);ctx.restore();return true;
}
function rounded(x,X,Y,w,h,r) { x.beginPath();x.moveTo(X+r,Y);x.arcTo(X+w,Y,X+w,Y+h,r);x.arcTo(X+w,Y+h,X,Y+h,r);x.arcTo(X,Y+h,X,Y,r);x.arcTo(X,Y,X+w,Y,r);x.closePath(); }
function suit(x,ci,cx,cy,r,ink,fill=true) {
  x.save();x.translate(cx,cy);x.beginPath();
  if(ci===0){x.moveTo(0,-r);x.lineTo(r*.92,r*.75);x.lineTo(-r*.92,r*.75);x.closePath();}
  else if(ci===1)x.arc(0,0,r*.83,0,Math.PI*2);
  else if(ci===2){for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,q=i%2?r*.43:r;x.lineTo(Math.cos(a)*q,Math.sin(a)*q);}x.closePath();}
  else if(ci===3){for(const [a,b] of [[0,-.5],[-.5,.2],[.5,.2]]){x.moveTo(a*r+r*.52,b*r);x.arc(a*r,b*r,r*.52,0,Math.PI*2);}x.moveTo(-r*.24,r*.35);x.lineTo(r*.24,r*.35);x.lineTo(r*.38,r);x.lineTo(-r*.38,r);x.closePath();}
  else if(ci===4){x.moveTo(0,-r);x.lineTo(r*.8,0);x.lineTo(0,r);x.lineTo(-r*.8,0);x.closePath();}
  else{x.arc(0,0,r,Math.PI*.24,Math.PI*1.76);x.quadraticCurveTo(-r*.1,-r*.05,r*.72,r*.68);x.closePath();}
  x.strokeStyle=ink;x.fillStyle=ink;x.lineWidth=r*.14;fill?x.fill():x.stroke();x.restore();
}
function label(x,text,cx,cy,size,color,font='"Zen Maru Gothic",sans-serif',maxWidth) {x.font='700 '+size+'px '+font;x.textAlign='center';x.textBaseline='middle';x.fillStyle=color;x.fillText(text,cx,cy,maxWidth);}
function corner(x,cx,cy,s,dir) {x.save();x.translate(cx,cy);x.scale(dir[0],dir[1]);x.beginPath();x.moveTo(0,s);x.lineTo(0,0);x.lineTo(s,0);x.moveTo(s*.33,s*.8);x.lineTo(s*.33,s*.33);x.lineTo(s*.8,s*.33);x.stroke();x.restore();}
export function paintStyledCard(x,c,X,Y,w,h) {
  if(skin==='battleline')return paintBattleLineCard(x,c,X,Y,w,h);
  if(skin==='classic'||!images[skin])return false;
  const gold='#d8b66e',ivory='#f2ecdb',ink='#121918',ci=c<60?Math.floor(c/10):4,col=c<60?COLORS[ci]:'#344155',v=c<60?String(c%10+1):({60:'1–10',61:'1–10',62:'8',63:'1–3'}[c]||'戦術');
  const name=c<60?JP[c%10]:TAC[c],en=c<60?EN[c%10]:TAC_EN[c],band=h*.19;
  x.save();rounded(x,X+1,Y+1,w-2,h-2,w*.065);x.clip();
  x.fillStyle=skin==='gilded'?'#111313':ivory;x.fillRect(X,Y,w,h);
  if(skin==='gilded'){
    x.fillStyle=col; x.fillRect(X+w*.05,Y+h*.035,w*.9,band);x.fillRect(X+w*.05,Y+h*.775,w*.9,band);
    x.fillStyle='rgba(0,0,0,.27)';x.fillRect(X+w*.05,Y+h*.035,w*.9,band);x.fillRect(X+w*.05,Y+h*.775,w*.9,band);
    x.strokeStyle=gold;x.lineWidth=w*.008;rounded(x,X+w*.05,Y+h*.035,w*.9,h*.93,w*.018);x.stroke();
    for(const by of [Y+h*.225,Y+h*.775]){x.beginPath();x.moveTo(X+w*.05,by);x.lineTo(X+w*.95,by);x.stroke();}
    x.save();x.globalAlpha=.55;x.beginPath();x.arc(X+w*.5,Y+h*.48,w*.37,0,Math.PI*2);x.stroke();x.beginPath();x.arc(X+w*.5,Y+h*.48,w*.39,-Math.PI*.78,Math.PI*.78);x.stroke();x.restore();
    drawEmblem(x,cardKey(c),X+w*.5,Y+h*.46,w*.66);
    label(x,en,X+w*.5,Y+h*.712,w*.046,gold,'Georgia,serif',w*.8);
    label(x,name,X+w*.5,Y+h*.75,w*.067,ivory,undefined,w*.82);
    for(const cy of [Y+h*.13,Y+h*.87]){
      label(x,v,X+w*.5,cy,c>=60?w*.19:(v==='10'?w*.245:w*.29),ivory,'"Cinzel",Georgia,serif',w*.48);
      if(c<60){suit(x,ci,X+w*.17,cy,w*.07,gold,false);suit(x,ci,X+w*.83,cy,w*.07,gold,false);}else{label(x,'戦',X+w*.17,cy,w*.07,gold);label(x,'術',X+w*.83,cy,w*.07,gold);}
    }
    x.strokeStyle=gold;x.lineWidth=w*.008;for(const [px,py,dx,dy]of[[.055,.04,1,1],[.945,.04,-1,1],[.055,.96,1,-1],[.945,.96,-1,-1]])corner(x,X+w*px,Y+h*py,w*.055,[dx,dy]);
  }else{
    x.fillStyle=col;x.beginPath();x.moveTo(X+w*.045,Y+h*.03);x.lineTo(X+w*.74,Y+h*.03);x.lineTo(X+w*.74,Y+h*.19);x.lineTo(X+w*.045,Y+h*.38);x.closePath();x.fill();
    x.beginPath();x.moveTo(X+w*.045,Y+h*.53);x.lineTo(X+w*.32,Y+h*.75);x.lineTo(X+w*.045,Y+h*.75);x.closePath();x.fill();
    x.beginPath();x.arc(X+w*.56,Y+h*.47,w*.31,-Math.PI*.8,Math.PI*.8);x.strokeStyle=col;x.lineWidth=w*.07;x.stroke();
    drawEmblem(x,cardKey(c),X+w*.51,Y+h*.45,w*.73);
    label(x,v,X+w*.29,Y+h*.18,c>=60?w*.2:(v==='10'?w*.34:w*.42),ivory,'"Oswald","Arial Narrow",sans-serif',w*.58);
    label(x,v,X+w*.85,Y+h*.095,c>=60?w*.10:w*.14,col,'"Oswald","Arial Narrow",sans-serif',w*.23);
    if(c<60)suit(x,ci,X+w*.85,Y+h*.185,w*.061,col);else label(x,'戦',X+w*.85,Y+h*.185,w*.07,col);
    label(x,en,X+w*.5,Y+h*.735,w*.05,ink,'Georgia,serif',w*.82);
    label(x,name,X+w*.5,Y+h*.78,w*.057,ink,undefined,w*.8);
    x.fillStyle=col;x.fillRect(X+w*.045,Y+h*.825,w*.91,h*.14);
    label(x,v,X+w*.16,Y+h*.895,c>=60?w*.12:w*.21,ivory,'"Oswald","Arial Narrow",sans-serif',w*.24);
    label(x,v,X+w*.86,Y+h*.895,c>=60?w*.12:w*.21,ivory,'"Oswald","Arial Narrow",sans-serif',w*.24);
    if(c<60)suit(x,ci,X+w*.35,Y+h*.895,w*.062,ivory);else label(x,'戦',X+w*.35,Y+h*.895,w*.065,ivory);
    x.strokeStyle=ivory;x.lineWidth=w*.009;for(let k=0;k<3;k++){x.beginPath();x.moveTo(X+w*(.47+k*.075),Y+h*.94);x.lineTo(X+w*(.61+k*.075),Y+h*.85);x.stroke();}
  }
  x.restore();return true;
}
export function paintStyledBack(x,kind,w,h) {
  if(skin==='battleline')return paintBattleLineBack(x,kind,w,h);
  if(skin==='classic'||!images[skin])return false;
  const dark=skin==='gilded',edge=dark?'#d8b66e':'#eee7d8';
  x.save();rounded(x,0,0,w,h,w*.065);x.clip();x.fillStyle='#111715';x.fillRect(0,0,w,h);
  x.strokeStyle=edge;x.lineWidth=w*.009;for(let i=0;i<3;i++){const inset=w*(.045+i*.022);rounded(x,inset,inset,w-2*inset,h-2*inset,w*.025);x.stroke();}
  drawEmblem(x,'back',w*.5,h*.49,w*.89);
  x.strokeStyle=kind==='X'?'#b95c69':edge;x.lineWidth=w*.012;x.beginPath();x.moveTo(w*.31,h*.86);x.lineTo(w*.69,h*.86);x.stroke();
  label(x,kind==='X'?'TACTICS':'NINE FLAGS',w*.5,h*.91,w*.043,edge,'Georgia,serif',w*.7);x.restore();return true;
}
const faceURLs=new Map();
export function clearCardFaceCache(){faceURLs.clear();}
export function styledCardURL(c){
  if(skin==='classic'||(skin!=='battleline'&&!images[skin]))return null;const key=skin+':'+c;
  if(!faceURLs.has(key)){const cv=document.createElement('canvas');cv.width=204;cv.height=286;paintStyledCard(cv.getContext('2d'),c,0,0,204,286);faceURLs.set(key,cv.toDataURL('image/webp'));}
  return faceURLs.get(key);
}
