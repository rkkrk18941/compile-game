// The anatomical asset has a different joint graph from the old primitive rig.
// Plant feet in world space; solve the two load-bearing joints against those
// contacts. The stride clock is driven by travelled distance, not wall time.
{
 const original=m_;
 m_=function(shared,def,model,params){
  const anatomical=model.meta.anatomy==="hound-v2";
  const r=original(shared,def,model,anatomical?{...params,eyes:null,rough:.40,wet:.45,dirt:0}:params);
  if(anatomical){
   const map=Object.fromEntries(r.skeleton.bones.map(b=>[b.name,b]));
   r.anatomy={map,bind:r.skeleton.bones.map(b=>({p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()})),feet:[],clock:0,lastPhase:null,speed:0,moving:0,aware:0,turn:0,lastYaw:0,lastRoot:null};
   r.lodMeshes.forEach(mesh=>mesh.boundingSphere.radius=2.7);
  }
  return r;
 };
 const originalAnimate=Bd;
 Bd=function(r,t,dt){if(!r.anatomy)return originalAnimate(r,t,dt);animateAnatomicalHound(r,t,dt);};
 const originalSync=Vd.prototype.syncRig;
 Vd.prototype.syncRig=function(m,dt){if(m.rig?.anatomy&&!m.rig.anatomy.ground)m.rig.anatomy.ground=(x,z)=>groundY(this.fs.map,x,z);return originalSync.call(this,m,dt);};
}
function animateAnatomicalHound(r,t,dt){
 const a=r.anatomy,b=a.map,V=tn.Vector3,Q=tn.Quaternion;
 dt=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:1/60));
 const ease=(v,target,rate)=>v+(target-v)*(1-Math.exp(-dt*rate));
 a.speed=ease(a.speed,t.speed||0,7);a.moving=ease(a.moving,t.moving||0,12);a.aware=ease(a.aware,t.aware?1:0,5);
 const phaseDelta=a.lastPhase===null?0:Math.max(0,Math.min(Math.PI*2,t.phase-a.lastPhase));a.lastPhase=t.phase;
 a.clock+=phaseDelta*(2-.65*a.speed);
 for(let i=0;i<r.skeleton.bones.length;i++){const bone=r.skeleton.bones[i],rest=a.bind[i];bone.position.copy(rest.p);bone.quaternion.copy(rest.q);bone.scale.copy(rest.s);}
 if(a.ground)r.root.position.y=a.ground(r.root.position.x,r.root.position.z);
 const clock=a.clock,time=t.t||0,speed=a.speed,moving=a.moving,aware=a.aware;
 const breath=Math.sin(time*2.2)*.0035;
 const attack=Math.max(0,Math.min(1,t.attack||0));
 // Compression precedes the bite, then the shoulder girdle drives the lunge.
 const coil=attack>0&&attack<.30?Math.sin(attack/.30*Math.PI):0;
 const strike=attack>.24?Math.sin(Math.min(1,(attack-.24)/.76)*Math.PI):0;
 b.body.position.y=.65+breath+moving*(Math.cos(clock*2)*(.008+.023*speed)-.012*speed)-.035*coil;
 b.body.rotation.x=.018*moving*Math.sin(clock*2)-.08*coil+.09*strike;
 b.body.rotation.z=.026*moving*Math.sin(clock);
 b.chest.rotation.x=-.018*moving*Math.sin(clock*2+.35)-.04*aware;
 b.chest.rotation.y=.035*moving*Math.sin(clock+.2);
 b.pelvis.rotation.x=.025*moving*Math.sin(clock*2+.8);
 b.pelvis.rotation.y=-.045*moving*Math.sin(clock+.3);
 const look=Math.max(-.7,Math.min(.7,t.lookYaw||0));
 b.neck.rotation.set(.15+.09*aware+.02*Math.sin(time*1.1)+.035*coil,look*.35,0);
 b.neck2.rotation.set(.10+.07*aware-.018*Math.sin(clock*2)*moving,look*.38,0);
 b.head.rotation.set(-(t.lookPitch||0)*.35-.03*strike,look*.27,.012*Math.sin(time*.7));
 b.jaw.rotation.x=.035+.022*(1+Math.sin(time*2.2))+.16*aware+.58*strike;
 let yawDelta=r.root.rotation.y-a.lastYaw;while(yawDelta>Math.PI)yawDelta-=Math.PI*2;while(yawDelta<-Math.PI)yawDelta+=Math.PI*2;
 a.lastYaw=r.root.rotation.y;a.turn=ease(a.turn,Math.max(-.45,Math.min(.45,yawDelta/Math.max(.001,dt)*.10)),5);
 for(let i=0;i<6;i++){
  const tail=b[i?"tail"+i:"tail"];
  tail.rotation.y=.05*Math.sin(time*1.3-i*.40)+moving*(.07+.045*speed)*Math.sin(clock-i*.48)-a.turn*(.6+i*.1);
  tail.rotation.x=.025*Math.sin(time*1.5-i*.5)+moving*.025*Math.sin(clock*2-i*.35);
 }
 r.root.updateMatrixWorld(true);
 const rootPosition=r.root.getWorldPosition(new V()),rootRotation=r.root.getWorldQuaternion(new Q());
 const teleported=a.lastRoot&&a.lastRoot.distanceTo(rootPosition)>2;
 const velocity=a.lastRoot?rootPosition.clone().sub(a.lastRoot).divideScalar(Math.max(dt,.001)):new V();
 a.lastRoot=rootPosition.clone();
 const stance=.67-.22*speed;
 const offsets=[0,.5,.75,.25].map((v,i)=>v*(1-speed)+[0,.13,.53,.66][i]*speed);
 for(let i=0;i<4;i++){
  const up=b[`leg${i}.up`],lo=b[`leg${i}.lo`],hand=b[`leg${i}.hand`],toe=b[`leg${i}.toe`];
  let foot=a.feet[i];if(!foot)a.feet[i]=foot={planted:false,anchor:null,start:null,lastPhase:0};
  const cycle=((clock/Math.PI/2+offsets[i])%1+1)%1;
  const rest=a.bind[r.skeleton.bones.indexOf(hand)];
  const hip=up.getWorldPosition(new V());
  const baseX=(i%2===0?-1:1)*.295,baseZ=i<2?.385:-.40;
  const floorTarget=(z,lead=0)=>{
   const p=new V(baseX,.055,z).applyMatrix4(r.root.matrixWorld).addScaledVector(velocity,lead);
   p.y=(a.ground?a.ground(p.x,p.z):rootPosition.y)+.055;return p;
  };
  let target;
  if(foot.recovery){target=foot.recovery.from.clone();}
  else if(cycle<stance||moving<.03){
   if(!foot.planted||teleported||!foot.anchor){
    const init=!foot.anchor;
    foot.anchor=floorTarget(baseZ+(init?(.27-.54*cycle/stance):.27)*moving);
    foot.planted=true;
   }
   target=foot.anchor.clone();foot.start=target.clone();
  }else{
   const u=(cycle-stance)/(1-stance),s=u*u*(3-2*u);
   if(foot.planted||!foot.start){foot.start=(foot.anchor||floorTarget(baseZ-.27)).clone();foot.planted=false;}
   target=foot.start.clone().lerp(floorTarget(baseZ+.27*moving,.018*(1-u)),s);
   target.y+=Math.sin(Math.PI*u)*(.075+.085*speed)*moving;
  }
  // Reach is limited by actual bone lengths; a blocked body cannot dislocate a hip.
  const length1=lo.position.length(),length2=hand.position.length();
  // An abrupt turn/stop may outrun the current support polygon. Release that
  // contact and take a short recovery step rather than dragging or raising a
  // supposedly planted foot along the edge of the IK reach sphere.
  if(!foot.recovery&&foot.planted&&target.distanceTo(hip)>(length1+length2)*.985){
   foot.recovery={from:(foot.actual||target).clone(),elapsed:0};foot.planted=false;
  }
  if(foot.recovery){
   const recovery=foot.recovery;recovery.elapsed+=dt;const u=Math.min(1,recovery.elapsed/(.19-.06*speed)),s=u*u*(3-2*u);
   const landing=floorTarget(baseZ+.13*moving);target=recovery.from.clone().lerp(landing,s);target.y+=Math.sin(Math.PI*u)*.085;
   if(u===1){foot.anchor=landing.clone();foot.planted=true;foot.recovery=null;}
  }
  const delta=target.clone().sub(hip);let distance=delta.length();
  const reachable=Math.min(length1+length2-.001,Math.max(Math.abs(length1-length2)+.001,distance));
  const direction=delta.normalize();
  if(Math.abs(distance-reachable)>.0001){target.copy(hip).addScaledVector(direction,reachable);foot.anchor?.copy(target);}
  const pole=new V(0,.08,i<2?-1:1).applyQuaternion(rootRotation);
  const perpendicular=pole.addScaledVector(direction,-pole.dot(direction)).normalize();
  const along=(length1*length1-length2*length2+reachable*reachable)/(2*reachable);
  const altitude=Math.sqrt(Math.max(0,length1*length1-along*along));
  const knee=hip.clone().addScaledVector(direction,along).addScaledVector(perpendicular,altitude);
  function aim(bone,restDirection,destination){
   const inverse=bone.parent.getWorldQuaternion(new Q()).invert();
   const desired=destination.clone().sub(bone.getWorldPosition(new V())).applyQuaternion(inverse).normalize();
   bone.quaternion.setFromUnitVectors(restDirection.clone().normalize(),desired);bone.updateMatrixWorld(true);
  }
  aim(up,lo.position,knee);aim(lo,rest.p,target);
  hand.quaternion.copy(hand.parent.getWorldQuaternion(new Q()).invert()).multiply(rootRotation);
  // Toes stay flat through support, flex during clearance, and extend before landing.
  const swing=cycle<stance?0:(cycle-stance)/(1-stance);
  toe.rotation.x=cycle<stance?-.13*Math.max(0,(cycle/stance-.78)/.22)*moving:.27*Math.sin(Math.PI*swing)*moving;
  hand.updateMatrixWorld(true);foot.phase=cycle;foot.support=foot.planted;foot.target=target;foot.actual=hand.getWorldPosition(new V());
 }
 r.root.updateMatrixWorld(true);
}
