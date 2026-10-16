// Review the actual exported mesh and the actual runtime animator, not a
// separately authored Blender action. Blender imports these exact matrices.
import fs from 'node:fs';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import {nc as n} from './harness.mjs';
const bytes=zlib.gunzipSync(fs.readFileSync('noclip/assets/creatures/hound.ncm.gz'));
const model=n.decodeContainment(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const r=n.m_(n.E2(),n.Vr.hound,model,n.Vr.hound.body);
assert.ok(r.anatomy,'anatomical mesh activates the new animator');
const fps=24,samples=[];let phase=0,z=0,maxError=0,maxFloorError=0,contactChecks=0,plantChecks=0;
const previous=new Map();
for(let frame=1;frame<=144;frame++){
 const time=(frame-1)/fps;
 let velocity=time<1?0:time<3?.55:time<3.7?0:time<5?1.8:0;
 const attack=time>=5.2&&time<5.9?(time-5.2)/.7:0;
 z+=velocity/fps;phase+=velocity/fps/.8*Math.PI;
 r.root.position.set(0,0,z);r.root.rotation.y=0;
 n.Bd(r,{phase,moving:velocity>0?1:0,speed:velocity>1?.85:0,attack,t:time,lookYaw:.16*Math.sin(time),lookPitch:0,twitch:0,aware:time>3},1/fps);
 r.root.updateMatrixWorld(true);
 for(let i=0;i<4;i++){
  const foot=r.anatomy.feet[i];const error=foot.actual.distanceTo(foot.target);maxError=Math.max(maxError,error);
  assert.ok(error<.002,`IK target error ${error} on frame ${frame}`);contactChecks++;
  if(foot.support){
   maxFloorError=Math.max(maxFloorError,Math.abs(foot.actual.y-.055));
   assert.ok(Math.abs(foot.actual.y-.055)<.002,'support foot remains at floor contact height');
   assert.ok(foot.actual.y>=.025,'support foot stays above the floor');
   const prev=previous.get(i);
   if(prev?.planted&&foot.planted&&prev.phase<foot.phase){
    // Constraints can release a contact at the reach limit; measure all other
    // support intervals to catch a procedural sine swing disguised as IK.
    if(prev.anchor.distanceTo(foot.anchor)<1e-5){assert.ok(prev.actual.distanceTo(foot.actual)<.002,'no sliding during planted support');plantChecks++;}
   }
  }
  previous.set(i,{anchor:foot.anchor.clone(),actual:foot.actual.clone(),phase:foot.phase,planted:foot.planted});
 }
 // Keep the review centred while retaining real root motion in the test above.
 // The studio floor will travel at the inverse root displacement in Blender.
 const inv=new n.tn.Matrix4().makeTranslation(0,0,-z);
 samples.push({frame,rootZ:z,bones:r.skeleton.bones.map(b=>inv.clone().multiply(b.matrixWorld).toArray())});
}
fs.mkdirSync('.tmp/anatomy',{recursive:true});fs.writeFileSync('.tmp/anatomy/animation.json',JSON.stringify(samples));
assert.equal(model.geos.length,2,'near and distant meshes decode');r.setLOD(30);assert.equal(r.lod,1,'distant mesh selected');r.setLOD(1);assert.equal(r.lod,0,'close mesh restored');
for(const geo of model.geos){const g=geo.attributes;for(let i=0;i<g.skinWeight.count;i++){let sum=0;for(let j=0;j<4;j++){sum+=g.skinWeight.array[i*4+j];assert.ok(g.skinIndex.array[i*4+j]<model.bones.length);}assert.equal(sum,255,'normalised skin weights');}}
let scenarioContacts=0;
for(const scenario of ['fast-turn','slope','teleport']){
 const rig=n.m_(n.E2(),n.Vr.hound,model,n.Vr.hound.body),ground=(x,z)=>scenario==='slope'?.08*Math.sin(x)+z*.03:0;
 rig.anatomy.ground=ground;let phase=0;
 for(let frame=0;frame<240;frame++){
  const dt=1/60,t=frame*dt,velocity=t<.3||t>3.4?0:7;
  rig.root.position.x+=Math.sin(t)*velocity*dt;rig.root.position.z+=Math.cos(t)*velocity*dt;rig.root.rotation.y=t;
  if(scenario==='teleport'&&frame===90)rig.root.position.x+=8;
  phase+=velocity*dt/.8*Math.PI;
  n.Bd(rig,{phase,t,moving:velocity?1:0,speed:velocity?1:0,attack:0,aware:true,lookYaw:0,lookPitch:0},dt);
  for(const foot of rig.anatomy.feet){assert.ok(foot.actual.toArray().every(Number.isFinite),'finite fast turn / teleport pose');if(foot.support){assert.ok(Math.abs(foot.actual.y-ground(foot.actual.x,foot.actual.z)-.055)<.002,scenario+' floor contact');scenarioContacts++;}}
 }
}
console.log(JSON.stringify({frames:samples.length,bones:model.bones.length,lodTriangles:model.lodTriangles,contactChecks,plantChecks,scenarioContacts,maxTargetErrorMetres:maxError,maxFloorErrorMetres:maxFloorError},null,2));
