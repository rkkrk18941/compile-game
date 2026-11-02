// Use real elapsed frame times; the physics delta is capped and hides long stalls.
export const PERFORMANCE_REVISION=1;
export class FrameBudget {
 constructor(){this.reset();}
 reset(){this.total=0;this.count=0;this.window=0;this.cooldown=0;}
 observe(milliseconds,now,quality,scale){
  if(!Number.isFinite(milliseconds)||milliseconds<=0)return null;
  if(!this.window)this.window=now;
  this.total+=milliseconds;this.count++;
  const stalled=milliseconds>180,ready=now-this.window>=1400;
  if(!stalled&&!ready)return null;
  const slow=stalled||this.total/Math.max(1,this.count)>42;
  this.total=0;this.count=0;this.window=now;
  if(!slow||now<this.cooldown)return null;
  this.cooldown=now+2500;
  if(quality==='high')return {quality:'mid',scale:Math.min(scale,.9)};
  if(quality==='mid')return {quality:'low',scale:Math.min(scale,.85)};
  if(scale>.6)return {quality:'low',scale:Math.max(.6,scale-.15)};
  return null;
 }
}
