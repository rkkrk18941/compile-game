// Clean containment edition. Generation, equipment and interaction rules.
const CLEAN_RULES = {version:3, mimicMinDistance:18, lockSeconds:5, slowSeconds:9};
for(const th of Object.values(ah)) Object.assign(th,{lightOn:1,lightFlick:0,darkPatch:0,ambient:[.13,.135,.14],fogDen:Math.min(.013,th.fogDen)});
for(const th of Object.values(LE)) th.wet=0;
M2[1]="罠はない。怪物の密度が高く、出口も多い";
M2[2]="物資と拘束・減速罠が多い。警報は青区画の怪物を呼ぶ。怪物は区画を出られない";
M2[3]="最も出口が多い。深層の怪物が待つ整然とした黒い区画";
function cellAt(m,x,z){return ke(Math.floor(z/4),0,m.H-1)*m.W+ke(Math.floor(x/4),0,m.W-1);}
function terrainY(m,x,z){
  if(!m.elevation)return 0;
  const gx=ke(x/4-.5,0,m.W-1),gz=ke(z/4-.5,0,m.H-1),a=Math.floor(gx),b=Math.floor(gz),u=gx-a,v=gz-b;
  const at=(i,j)=>m.elevation[Math.min(m.H-1,j)*m.W+Math.min(m.W-1,i)];
  return _n(_n(at(a,b),at(a+1,b),u),_n(at(a,b+1),at(a+1,b+1),u),v);
}
function cleanLevel(m){
  m.decay.fill(0);m.light.fill(1);m.lightI.fill(1.1);m.traps=[];
  for(let i=0;i<m.N;i++)if([4,5,6].includes(m.feat[i]))m.feat[i]=0;
  if(m.depth===1){m.zone.fill(0);m.zones=[];return m;}
  const rng=new Ci(m.seed^0x6ca34), eligible=[];
  for(let i=0;i<m.N;i++)if(m.reach[i]&&m.floor[i]===0&&!m.feat[i])eligible.push(i);
  // Black is an actual static zone, with the same readable lighting as the rest.
  let anchor=eligible.filter(i=>m.zone[i]===0&&m.distFromStart[i]>45);let c=anchor.length?rng.pick(anchor):eligible[0];
  if(c!==undefined){const cx=c%m.W,cy=(c/m.W)|0,cells=[];for(const i of eligible)if(m.zone[i]===0&&Math.hypot(i%m.W-cx,((i/m.W)|0)-cy)<9){m.zone[i]=3;cells.push(i);}m.zones.push({id:3,cx,cy,r:9,cells});}
  // Preserve the finite B5 extraction objective. Every traversable colour on
  // B2–B4 has progressively more downstairs entrances.
  if(true){let previous=m.downs.filter(s=>m.zone[s.cy*m.W+s.cx]===0).length;
    if(previous===0){for(const i of rng.shuffle(eligible.filter(i=>m.zone[i]===0))){if(previous>=3)break;const x=i%m.W,z=(i/m.W)|0;if(!m.feat[i]&&!m.stairs.some(s=>Math.hypot(s.cx-x,s.cy-z)<6)){m.downs.push(fh(m,rng,x,z,"down"));previous++;}}}
    for(const zone of [2,1,3]){let count=m.downs.filter(s=>m.zone[s.cy*m.W+s.cx]===zone).length;
      for(const i of rng.shuffle(eligible.filter(i=>m.zone[i]===zone))){if(count>=previous+1)break;const x=i%m.W,z=(i/m.W)|0;if(m.feat[i]||m.stairs.some(s=>Math.hypot(s.cx-x,s.cy-z)<2))continue;const s=fh(m,rng,x,z,"down");m.downs.push(s);count++;}previous=count;
    }
  }
  const blue=rng.shuffle(eligible.filter(i=>m.zone[i]===2&&!m.feat[i]));
  for(let j=0;j<Math.min(blue.length,Math.max(10,Math.floor(blue.length*.12)));j++){const i=blue[j];m.traps.push({cx:i%m.W,cy:(i/m.W)|0,type:j%2?"slow":"lock",state:0,cool:0});}
  // Sloped corridors remain connected; stair landings are level.
  m.elevation=new Float32Array(m.N);
  for(let i=0;i<m.N;i++){const x=(i%m.W+.5)*4,z=(((i/m.W)|0)+.5)*4;let h=1.25*Math.sin(x/29)*Math.cos(z/37)+.65*Math.sin((x+z)/43);for(const s of m.stairs)h*=ke((Math.hypot(x-(s.cx+.5)*4,z-(s.cy+.5)*4)-10)/16,0,1);m.elevation[i]=h;}
  m.waterDepth=new Float32Array(m.N);for(let i=0;i<m.N;i++)if(m.floor[i]===2)m.waterDepth[i]=1.6;
  for(const i of rng.shuffle(eligible.filter(i=>m.zone[i]===0&&!m.feat[i])).slice(0,10)){const depth=rng.pick([.25,.6,1.2,2.1]);for(let y=0;y<2;y++)for(let x=0;x<2;x++){const j=i+y*m.W+x;if(j<m.N&&m.floor[j]===0&&!m.feat[j]){m.floor[j]=2;m.waterDepth[j]=depth;}}}
  return m;
}
{const generate=F2;F2=spec=>{const m=generate({...spec,depth:Math.min(5,spec.depth),themeId:spec.depth===1?"yellow":spec.themeId});m.depth=spec.depth;return cleanLevel(m);};}
{const build=pd.prototype.buildChunk;pd.prototype.buildChunk=function(...args){const res=build.apply(this,args),m=this.m;if(m?.elevation){const visit=o=>{const p=o.geometry?.getAttribute("position");if(!p)return;for(let j=0;j<p.count;j++){const x=p.getX(j),z=p.getZ(j);const depth=m.waterDepth?.[cellAt(m,x,z)],y=p.getY(j);p.setY(j,(y < -2.19 && y > -2.21 && depth ? -depth : y)+terrainY(m,x,z));}p.needsUpdate=true;o.geometry.computeVertexNormals();};res?.traverse?.(visit);}return res;};}
{const old=groundY;groundY=(m,x,z)=>terrainY(m,x,z)+(B1(m,x,z)===2?-(m.waterDepth?.[cellAt(m,x,z)]||1.6):old(m,x,z));NE=(m,x,z)=>rr(m,x,z)?groundY(m,x,z):null;}
{const loop=Ed.prototype.loopGain;Ed.prototype.loopGain=function(type,vol,...args){if(type==="hum")vol*=this.cleanSettings?.hum===false?0:(this.cleanSettings?.humVolume??.2);return loop.call(this,type,vol,...args);};const load=Td.prototype.loadFloor;Td.prototype.loadFloor=async function(d,...args){if(this.run&&d===1)this.run.themes[0]="yellow";if(this.audio)this.audio.cleanSettings=this.settings;return load.call(this,d,...args);};}
const SIX_KITS=[
 {id:"shino",role:"軽装拳銃兵",weapon:"pistol",mag:15,recharge:7,hp:100,skills:[],desc:"低威力の拳銃15発。7秒で全弾充填。軽快に探索する基本兵科。"},
 {id:"minato",role:"突撃兵",weapon:"rifle",mag:45,recharge:50,hp:120,skills:[],desc:"中威力の突撃銃45発。再充填50秒。まとまった弾数で仲間を守る。"},
 {id:"kagura",role:"爆薬工兵",weapon:null,mag:0,recharge:0,hp:120,skills:["kit_timer","kit_remote","kit_impact"],desc:"銃は持たない。3種類の爆薬を各1個。使った種類だけ180秒で補充。"},
 {id:"rei",role:"精密射手",weapon:"sniper",mag:5,recharge:24,hp:90,skills:["sonar"],desc:"狙撃銃5発。再充填24秒。少数の精密射撃と探査で先を読む。"},
 {id:"gou",role:"先導重装兵",weapon:"shotgun",mag:8,recharge:20,hp:160,skills:["shield"],desc:"散弾銃8発。再充填20秒。防護盾と高い体力で狭い通路を先導。"},
 {id:"haruka",role:"衛生兵",weapon:"pistol",mag:10,recharge:12,hp:100,skills:["kit_heal","kit_revive"],desc:"拳銃10発。再充填12秒。救急セットと蘇生器を定期補充する支援役。"}
];
{const originals={...HEROES};HERO_LIST.length=0;for(const k of SIX_KITS){const h={...(originals[k.id]||originals.minato),...k,price:0,melee:null,title:"特殊部隊・"+k.role,stats:{maxHp:k.hp,maxStamina:100,speedMul:1},rechargeMul:1,items:{medkit:1},passive:{name:"固定装備",desc:k.desc}};HERO_LIST.push(h);}for(const key of Object.keys(HEROES))delete HEROES[key];for(const h of HERO_LIST)HEROES[h.id]=h;}
be.pistol.dmg=22;be.rifle.dmg=39;
for(const key of ["pistol","rifle","shotgun","sniper"])be[key].ammo="shared";
be.ammo_shared={kind:"ammo",name:"共通弾薬",ammo:"shared",give:30,amount:30};
Object.assign(be,{
 timerbomb:{kind:"deploy",stack:3,name:"時限爆薬",fuse:10,radius:5.5,dmg:300},
 remotebomb:{kind:"deploy",stack:3,name:"遠隔爆薬",radius:5.5,dmg:300},
 impactbomb:{kind:"throw",stack:3,name:"接触手榴弾",speed:12,radius:5,dmg:260}
});
const ITEM_GUIDE={medkit:"救急セット：体力を回復する唯一の回復物資。安全な場所で使用。",revive:"蘇生器：倒れた仲間の近くで使用。所持中は自分が倒れた時にも自動使用。",timerbomb:"時限爆薬：5～120秒を設定して足元に設置。時間経過、または銃撃で爆発。",remotebomb:"遠隔爆薬：足元に設置後、起爆ボタンで一斉起爆。銃撃でも爆発。",impactbomb:"接触手榴弾：軌道と着地点を確認して投げる。壁・床・怪物への接触で爆発。",ammo_shared:"共通弾薬：全銃火器で共用。特殊部隊モードには出現しない。",pistol:"拳銃：携帯性に優れた低威力の銃。",rifle:"突撃銃：中距離向けの中威力の銃。",shotgun:"散弾銃：近距離で多数の弾を放つ銃。"};
const CLEAN_CONSUMABLES=["medkit","revive","timerbomb","remotebomb","impactbomb"];
$1=()=>[["medkit",6],["revive",1],["timerbomb",2],["remotebomb",2],["impactbomb",3]];Y1=$1;s_=$1;
function normalizeLoot(item,hero){if(!item)return;if(["money","cash","gold","relic"].includes(item.type))return;if(be[item.type]?.kind==="crate"){for(const c of item.contents||[])normalizeLoot(c,hero);return;}if(CLEAN_CONSUMABLES.includes(item.type))return;if(!hero&&["pistol","rifle","shotgun","ammo_shared"].includes(item.type))return;item.type="medkit";item.count=1;}
{const load=xp.prototype.heroLoadout;xp.prototype.heroLoadout=function(id){const l=load.call(this,HEROES[id]?id:"shino");l.pouchSize=Math.max(8,l.pouchSize);return l;};delete ex.stam;}
{const gen=Rd.prototype.onFloorGenerated;Rd.prototype.onFloorGenerated=function(fs){gen.call(this,fs);const hero=this.game.loadout?.mode==="hero",rng=new Ci(fs.map.seed^0x88ca);for(const it of fs.items||[])normalizeLoot(it,hero);for(const z of fs.map.zones.filter(z=>z.id===2)){for(const i of rng.shuffle(z.cells.filter(i=>fs.map.floor[i]===0&&!fs.map.feat[i])).slice(0,24))fs.items.push({id:fs.items.length,type:rng.weighted($1()),x:(i%fs.map.W+.5)*4,z:(((i/fs.map.W)|0)+.5)*4,count:1,rot:rng.next()*6.28,taken:false});}if(!hero){for(let j=0;j<Math.min(36,fs.items.length);j++)fs.items[j].type=j%4===0?["pistol","rifle","shotgun"][j%3]:"ammo_shared";}for(const it of fs.items||[])it.y=groundY(fs.map,it.x,it.z);};
 const fresh=Rd.prototype.onNewRun;Rd.prototype.onNewRun=function(...a){fresh.apply(this,a);this.inv.ammo.shared=0;};
 const geo=Rd.prototype.geo;Rd.prototype.geo=function(type){return geo.call(this, ["timerbomb","remotebomb","impactbomb"].includes(type)?"bomb":type==="ammo_shared"?"ammo_9mm":type);};
 const bag=Rd.prototype.setBag;Rd.prototype.setBag=function(open){bag.call(this,open);this.bagOpenT=open?1e9:0;const root=document.getElementById("bag-guide");if(root){root.hidden=!open;root.replaceChildren();for(const [type,desc]of Object.entries(ITEM_GUIDE)){const p=document.createElement("p");p.textContent=desc;root.append(p);}}};
 const use=Rd.prototype.useSlot;Rd.prototype.useSlot=function(k){const i=this.inv.pouch[k];if(i&&["timerbomb","remotebomb","impactbomb"].includes(i.type)){this.setBag(false);return this.game.combat.selectBomb(i.type,()=>this.consumeSlot(k));}return use.call(this,k);};
}
Wd.prototype.update=function(dt){const g=this.game,m=this.fs?.map,p=g.player;if(!m||p.dead)return;for(const t of m.traps){const x=(t.cx+.5)*4,z=(t.cy+.5)*4;t.cool=Math.max(0,t.cool-dt);if(t.cool<=0&&Math.hypot(p.pos.x-x,p.pos.z-z)<1.25&&p.onGround){t.cool=18;if(t.type==="lock")p.lockUntil=g.time+CLEAN_RULES.lockSeconds;else p.slowUntil=g.time+CLEAN_RULES.slowSeconds;g.audio?.sfx("beep",{pos:{x,z},vol:1,range:180});g.emitNoise(x,z,160,"blue-alarm");g.toast(t.type==="lock"?"拘束罠：5秒間動けない！":"減速罠：9秒間減速！",1800);}if(Math.hypot(p.pos.x-x,p.pos.z-z)<24&&!this.plates.has(t)){const mesh=this.plate(t,x,z);mesh.scale.y=.05;mesh.position.y=terrainY(m,x,z)+.025;}}};
{const update=_d.prototype.update;_d.prototype.update=function(...args){const g=args.find(x=>x?.time!==undefined&&x?.fs);const now=g?.time??this.cleanGame?.time??0;const frozen=this.lockUntil>now||this.grabUntil>now,old=this.pos.clone();update.apply(this,args);if(frozen){this.pos.copy(old);this.vel.set(0,0,0);}else if(this.slowUntil>now){this.pos.x=_n(old.x,this.pos.x,.3);this.pos.z=_n(old.z,this.pos.z,.3);}};const load=Td.prototype.loadFloor;Td.prototype.loadFloor=async function(...args){this.player.cleanGame=this;return load.apply(this,args);};}

{const state=Td.prototype.floorState;Td.prototype.floorState=function(depth){this.run.themes[0]="yellow";for(let d=1;d<=depth;d++)if(!this.run.themes[d-1])this.run.themes[d-1]=d===1?"yellow":S2[(this.run.seed+d*7)%S2.length];return state.call(this,depth);};}
fd[3]=[.22,.23,.27];
for(const key of Object.keys(Q2))if(!Ad.includes(key))Ad.push(key);for(const key of ["sniper","lmg","spistol"])KA.add(key);
Gd.prototype.buy=function(v){const g=this.game,type={water:"medkit",med:"medkit",gas:"revive",bomb:"timerbomb",ammo:g.loadout?.mode==="hero"?"impactbomb":"ammo_shared"}[v.kind]||"medkit";if(v.stock<=0)return;if(g.run.money<v.price){g.toast("お金が足りない",1000);return;}if(type==="ammo_shared"){g.items.inv.ammo.shared=(g.items.inv.ammo.shared||0)+30;g.items.renderAll();}else if(!g.items.addConsumable(type,1)){g.toast("持ち物がいっぱいです",1000);return;}g.run.money-=v.price;v.stock--;g.feed(be[type].name+"を購入");};
{const action=Gd.prototype.contextAction;Gd.prototype.contextAction=function(...a){const result=action.apply(this,a);if(result?.type==="vend")result.label=result.label.replace(/アーモンド水|医薬品/g,"救急セット").replace(/パイプ爆弾/g,"時限爆薬").replace(/中和ガス缶/g,"蘇生器").replace(/弾薬/g,this.game.loadout?.mode==="hero"?"接触手榴弾":"共通弾薬");return result;};}
