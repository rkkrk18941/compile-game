/* One authority, independent revisions and CPU jobs for every live match. */
export class Arena {
  constructor(entrants, format, options, io) {
    this.E=io.E; this.AI=io.AI; this.io=io; this.options=options;
    this.d=new io.Director(entrants,format,options.seed || (Math.random()*4294967295)>>>0,options);
    this.closed=false;
  }
  get match(){return this.d.matches[this.d.cur];}
  get revision(){return this.match?.revision || 0;}
  get busy(){return this.d.matches.some(m=>m.busy);}
  get fast(){return this.match?.fast || false;}
  ent(seat,m=this.match){return this.d.byId(m.seats[seat]);}
  ctrlFor(cid,m=this.match){return [0,1].filter(s=>{const e=this.ent(s,m);return !e.cpu && e.owner===cid;});}
  payload(cid,events=[],fresh=false,perspective=0,mid=this.d.cur){
    const m=this.d.matches[mid]; if(!m?.seats || !(m.state||m.final))return null;
    const state=m.state||m.final,ctrl=this.ctrlFor(cid,m);
    const me=ctrl.length===1?ctrl[0]:ctrl.length===2?state.turn:perspective===1?1:0;
    return {mid:m.id,revision:m.revision,view:this.E.viewFor(state,me),ev:ctrl.length===0?events.map(e=>({...e})):this.E.redact(events,me),ctrl,
      hands:ctrl.length===0?state.hands.map(h=>h.slice()):null,names:m.seats.map(id=>this.d.byId(id).name),
      logos:m.seats.map(id=>this.d.byId(id).logo),cpu:m.seats.map(id=>this.d.byId(id).cpu),tour:this.d.summary(),fresh};
  }
  send(events=[],fresh=false,mid=this.d.cur){if(!this.closed)this.io.send(events,fresh,mid);}
  canStart(m){
    // People sharing a device play one match at a time, even if they have several entrants.
    const owners=[m.a,m.b].map(id=>this.d.byId(id)).filter(e=>!e.cpu).map(e=>e.owner);
    return !this.d.matches.some(x=>x.status==='live' && x.seats.some(id=>{const e=this.d.byId(id);return !e.cpu && owners.includes(e.owner);}));
  }
  start(m){
    if(this.closed || !m || !this.canStart(m) || !this.d.start(m))return false;
    m.revision=1;m.generation=0;m.busy=false;return true;
  }
  startNext(){
    const m=this.d.ready().find(m=>this.canStart(m));if(!this.start(m))return false;
    this.send([],true,m.id);return true;
  }
  startReady(notify=true){
    let count=0,m;
    while((m=this.d.ready().find(m=>this.canStart(m))) && this.start(m))count++;
    if(count && notify)this.send([],true,null);
    return count;
  }
  rematch(){if(this.d.format!=='duel'||!this.match || this.match.status!=='done')return;const m=this.d.rematch();m.revision=1;m.generation=0;this.send([],true,m.id);}
  finish(events,m=this.match){
    if(m.state.phase==='over'){m.final=m.state;this.d.finish(m,m.final);}
    m.revision++;this.send(events,false,m.id);
    if(this.options.parallel && m.status==='done')this.startReady();
  }
  act(cid,action,mid=this.d.cur,revision=this.d.matches[mid]?.revision){
    const m=this.d.matches[mid];
    if(this.closed || !m?.state || revision!==m.revision || !this.ctrlFor(cid,m).includes(m.state.turn))return false;
    const r=this.E.apply(m.state,{...action,p:m.state.turn});if(!r.ok)return false;
    this.finish(r.ev,m);return true;
  }
  async pump(mid=this.d.cur){
    const m=this.d.matches[mid];
    if(this.closed || !m?.state || m.busy || m.fast || !this.ent(m.state.turn,m).cpu)return;
    m.busy=true;const generation=m.generation,seat=m.state.turn,level=this.ent(seat,m).cpu;
    try{
      const [a]=await Promise.all([this.io.choose(this.E.viewFor(m.state,seat),level),this.io.delay(m.id)]);
      if(this.closed || generation!==m.generation || !m.state)return;
      let r=this.E.apply(m.state,{...a,p:seat});
      if(!r.ok)r=this.E.apply(m.state,{...this.E.legalActions(m.state)[0],p:seat});
      if(!r.ok)throw Error('No legal CPU move');this.finish(r.ev,m);
    }finally{if(generation===m.generation)m.busy=false;this.io.idle();}
  }
  async fastForward(mid=this.d.cur){
    const m=this.d.matches[mid];
    if(this.closed || !m?.state || ![0,1].every(s=>this.ent(s,m).cpu) || m.fast)return;
    m.fast=true;m.generation++;m.busy=true;const generation=m.generation;
    try{
      for(let n=0;n<800 && m.state && !this.closed && m.generation===generation;n++){
        const state=m.state,seat=state.turn;
        const a=await this.io.choose(this.E.viewFor(state,seat),this.ent(seat,m).cpu);
        if(this.closed || m.generation!==generation)return;
        let r=this.E.apply(state,{...a,p:seat});
        if(!r.ok)r=this.E.apply(state,{...this.E.legalActions(state)[0],p:seat});
        if(!r.ok)throw Error('No legal CPU move');
        if(state.phase==='over'){this.finish([],m);break;}
      }
    }finally{if(m.generation===generation){m.fast=false;m.busy=false;}this.io.idle();}
  }
  playerLeft(cid){
    this.d.entrants.forEach(e=>{if(!e.cpu && e.owner===cid){e.cpu=2;e.owner=null;e.name+='(CPU)';}});
    this.send([],false,null);if(this.options.parallel)this.startReady();this.io.idle();
  }
  close(){this.closed=true;this.d.matches.forEach(m=>m.generation=(m.generation||0)+1);}
}
