/* Geister adapter for Battle Line's Director: shared seeding, byes, league and branch advancement. */
(function(root,factory){
 var api=factory(root.GST_ENG||(typeof require==='function'?require('./engine.js'):null),root.GST_AI||(typeof require==='function'?require('./ai.js'):null),root.HTN_DIR||(typeof require==='function'?require('../hatatori-nine/director.js'):null));
 if(typeof module==='object'&&module.exports)module.exports=api;root.GST_TOUR_CORE=api;
})(typeof window!=='undefined'?window:globalThis,function(E,AI,shared){
 'use strict';
 var Base=shared.forEngine(E).Director;
 function Director(people,format,seed,opts){Base.call(this,people,format,seed,opts);}
 Director.prototype=Object.create(Base.prototype);Director.prototype.constructor=Director;
 Director.prototype.finish=function(m,state){
  var flags=[];state.g.forEach(function(g){if(g.st==='cap')flags.push({claimed:1-g.o});});
  Base.prototype.finish.call(this,m,{winner:state.winner===-1?2:state.winner,win:state.reason,flags:flags});
 };
 function Arena(people,format,opts,io){this.E=E;this.AI=AI;this.opts=opts||{};this.io=io||{};this.closed=false;this.d=new Director(people,format,this.opts.seed||((Math.random()*4294967295)>>>0),this.opts);}
 Arena.prototype.controls=function(cid,m){var d=this.d;return m.seats?[0,1].filter(function(p){var e=d.byId(m.seats[p]);return !e.cpu&&e.owner===cid;}):[];};
 Arena.prototype.canStart=function(m){var d=this.d,owners=[m.a,m.b].map(function(id){return d.byId(id);}).filter(function(e){return !e.cpu;}).map(function(e){return e.owner;});return !d.matches.some(function(x){return x.status==='live'&&x.seats.some(function(id){var e=d.byId(id);return !e.cpu&&owners.indexOf(e.owner)>=0;});});};
 Arena.prototype.startReady=function(){
  if(this.closed)return 0;var n=0,m,self=this;
  while((m=this.d.ready().filter(function(x){return self.canStart(x);})[0])){
   this.d.start(m);m.revision=1;m.busy=false;m.generation=0;m.readyAt=Date.now()+(this.opts.entryDelay||0);
   m.seats.forEach(function(id,p){var e=self.d.byId(id);if(e.cpu)E.setup(m.state,p,AI.setupFor(Math.min(4,e.cpu),self.d.rng));});n++;
  }
  if(n)this.emit(null);return n;
 };
 Arena.prototype.payload=function(cid,mid,perspective){
  var m=this.d.matches[mid];if(!m||!m.seats||!(m.state||m.final))return null;
  var s=m.state||m.final,ctrl=this.controls(cid,m),me=ctrl.length===1?ctrl[0]:ctrl.length===2?(s.phase==='setup'?(s.ready[0]?1:0):s.turn):(perspective===1?1:0),v=E.viewFor(s,me);
  if(!ctrl.length)v.g.forEach(function(g,i){g.good=s.g[i].good;}); // Spectators only. Participants never receive the other colour.
  return {mid:mid,revision:m.revision,view:v,ctrl:ctrl,names:m.seats.map(function(id){return this.d.byId(id).name;},this),logos:m.seats.map(function(id){return this.d.byId(id).logo;},this),tour:this.d.summary()};
 };
 Arena.prototype.emit=function(mid,ev){if(!this.closed&&this.io.send)this.io.send(mid,ev||null);};
 Arena.prototype.change=function(m,ev){
  m.revision++;
  if(m.state.phase==='over'){m.final=E.clone(m.state);this.d.finish(m,m.final);}
  this.emit(m.id,ev);
  if(m.status==='done')this.startReady();
 };
 Arena.prototype.setup=function(cid,mid,revision,seat,layout){var m=this.d.matches[mid];if(this.closed||!m||!m.state||revision!==m.revision||this.controls(cid,m).indexOf(seat)<0)return false;var r=E.setup(m.state,seat,layout);if(!r.ok)return false;this.change(m);return true;};
 Arena.prototype.act=function(cid,mid,revision,a){var m=this.d.matches[mid];if(this.closed||!m||!m.state||Date.now()<m.readyAt||revision!==m.revision||this.controls(cid,m).indexOf(m.state.turn)<0)return false;var r=E.apply(m.state,m.state.turn,a);if(!r.ok)return false;this.change(m,r.ev);return true;};
 Arena.prototype.resign=function(cid,mid,revision,seat){var m=this.d.matches[mid];if(this.closed||!m||!m.state||revision!==m.revision||m.state.phase!=='play'||this.controls(cid,m).indexOf(seat)<0)return false;var r=E.resign(m.state,seat);if(!r.ok)return false;this.change(m,r.ev);return true;};
 Arena.prototype.pump=async function(mid){
  var m=this.d.matches[mid];if(this.closed||!m||!m.state||m.state.phase!=='play'||m.busy||Date.now()<m.readyAt)return;
  var seat=m.state.turn,e=this.d.byId(m.seats[seat]);if(!e.cpu)return;
  m.busy=true;var revision=m.revision,generation=m.generation;
  try{
   var v=E.viewFor(m.state,seat),a=await this.io.choose(v,Math.min(4,e.cpu));
   if(this.closed||!m.state||revision!==m.revision||generation!==m.generation)return;
   var legal=E.legal(m.state,seat);if(!a||!legal.some(function(x){return x.f===a.f&&x.t===a.t;}))a=legal[0];
   if(!a)return;var r=E.apply(m.state,seat,a);if(r.ok)this.change(m,r.ev);
  }finally{m.busy=false;}
 };
 Arena.prototype.playerLeft=function(cid){this.d.entrants.forEach(function(e){if(!e.cpu&&e.owner===cid){e.cpu=2;e.owner=null;e.name+='(CPU)';}});var self=this;this.d.matches.forEach(function(m){if(m.state&&m.state.phase==='setup')m.seats.forEach(function(id,p){var e=self.d.byId(id);if(e.cpu&&!m.state.ready[p]){E.setup(m.state,p,AI.setupFor(e.cpu,self.d.rng));m.revision++;}});});this.startReady();this.emit(null);};
 Arena.prototype.close=function(){this.closed=true;this.d.matches.forEach(function(m){m.generation++;});};
 return {Director:Director,Arena:Arena};
});
