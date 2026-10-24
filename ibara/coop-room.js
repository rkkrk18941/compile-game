/* Authenticated room roster. Seat numbers are assigned by the host, never by commands. */
(function(root){
'use strict';
var G=root.IBARA;
function clean(s){return String(s||'冒険者').replace(/[\x00-\x1f\x7f<>]/g,'').trim().slice(0,12)||'冒険者';}
function Room(host,hooks,checkpoint){
  this.hooks=hooks||{};this.checkpoint=checkpoint||null;this.started=false;
  this.slots=checkpoint?checkpoint.runs.map(function(run,i){return {name:i===0?clean(host.name):clean(checkpoint.names[i]),hero:run.hero,token:(checkpoint.keys||[])[i]||null,cid:null,online:i===0,seq:0};}):[{name:clean(host.name),hero:host.hero,token:host.token,cid:null,online:true,seq:0}];
  this.slots[0].token=host.token;
}
Room.prototype.publicRoster=function(){return this.slots.map(function(s,i){return {seat:i,name:s.name,hero:s.hero,online:s.online};});};
Room.prototype.ready=function(){return this.slots.length>=2&&this.slots.length<=4&&new Set(this.slots.map(function(s){return s.hero;})).size===this.slots.length&&this.slots.every(function(s){return s.online;});};
Room.prototype.publish=function(){var self=this;this.slots.forEach(function(s,i){if(i&&s.online)self.send(s.cid,{k:'welcome',seat:i,roster:self.publicRoster(),started:self.started});});if(this.hooks.update)this.hooks.update(this.publicRoster());};
Room.prototype.send=function(cid,m){if(this.hooks.send)this.hooks.send(cid,m);};
Room.prototype.broadcast=function(m){var self=this;this.slots.forEach(function(s,i){if(i&&s.online)self.send(s.cid,m);});};
Room.prototype.reject=function(cid,text){this.send(cid,{k:'error',text:text,rejected:true});if(this.hooks.drop)this.hooks.drop(cid);return false;};
Room.prototype.hello=function(cid,m){
  if(!m||typeof m.token!=='string'||m.token.length<16||m.token.length>100||!G.HEROES[m.hero])return this.reject(cid,'名前とキャラクターを確認してください。');
  var ix=this.slots.findIndex(function(s){return s.token===m.token;});
  if(ix===0)return this.reject(cid,'ホストと同じ参加情報です。別のタブから参加してください。');
  var bound=this.slots.findIndex(function(s){return s.cid===cid;});
  if(bound>=0&&bound!==ix)return this.reject(cid,'参加情報は接続中に変更できません。');
  if(ix<0){
    if(this.started)return this.reject(cid,'冒険の途中からは新規参加できません。参加済みの端末で再接続してください。');
    if(this.checkpoint){ix=this.slots.findIndex(function(s,i){return i>0&&!s.online&&s.name===clean(m.name);});if(ix<0)ix=this.slots.findIndex(function(s,i){return i>0&&!s.token&&!s.online;});if(ix<0)return this.reject(cid,'保存された仲間の端末から再参加してください。');}
    else{
      if(this.slots.length>=4)return this.reject(cid,'この部屋は満員です（公式の上限は4人）。');
      if(this.slots.some(function(s){return s.hero===m.hero;}))return this.reject(cid,'そのキャラクターは参加済みです。別のキャラクターを選んでください。');
      ix=this.slots.length;this.slots.push({hero:m.hero});
    }
  }
  var s=this.slots[ix],old=s.cid;
  if(!this.started&&!this.checkpoint){
    if(this.slots.some(function(other,i){return i!==ix&&other.hero===m.hero;}))return this.reject(cid,'別のキャラクターを選んでください。');
    s.hero=m.hero;
  }
  s.token=m.token;s.cid=cid;s.online=true;s.seq=0;
  s.name=clean(m.name);
  if(old&&old!==cid&&this.hooks.drop)this.hooks.drop(old);
  this.publish();return ix;
};
Room.prototype.depart=function(cid){var s=this.slots.find(function(x){return x.cid===cid;});if(!s)return;s.online=false;s.cid=null;this.publish();};
Room.prototype.remove=function(ix){if(this.started||this.checkpoint||!Number.isInteger(ix)||ix<1||ix>=this.slots.length)return false;var s=this.slots[ix];this.slots.splice(ix,1);if(s.cid&&this.hooks.drop)this.hooks.drop(s.cid);this.publish();return true;};
Room.prototype.accept=function(cid,seq){var ix=this.slots.findIndex(function(s){return s.cid===cid&&s.online;});if(ix<1||!Number.isSafeInteger(seq)||seq<=this.slots[ix].seq)return -1;this.slots[ix].seq=seq;return ix;};
Room.prototype.start=function(){if(this.started||!this.ready())throw new Error('異なるキャラクターを選んだ2〜4人が接続してから開始してください。');this.started=true;this.publish();return this.slots.map(function(s){return {name:s.name,hero:s.hero};});};
Room.prototype.keys=function(){return this.slots.map(function(s){return s.token;});};
Room.prototype.restart=function(){this.started=false;this.checkpoint=null;this.publish();};
G.CoopRoom=Room;
})(typeof window!=='undefined'?window:globalThis);
