/* Absolute deadlines survive panel redraws, claims and delayed timer callbacks. */
export class EndTurnClock {
  constructor(now = () => Date.now()) { this.now=now;this.key=null;this.until=0;this.done=false; }
  update(key,onExpire,until) {
    if(key == null) { this.key=null;this.until=0;this.done=false;return; }
    if(key!==this.key) { this.key=key;this.until=Number.isFinite(until)?until:this.now()+8000;this.done=false; }
    else if(Number.isFinite(until)) this.until=Math.min(this.until,until);
    if(!this.done && this.remaining()===0) this.done=onExpire()!==false;
  }
  remaining() { return Math.max(0,this.until-this.now()); }
}
