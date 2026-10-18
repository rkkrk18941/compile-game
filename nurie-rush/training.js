/* Adaptive review, stored locally by the app. Basic and call rules have separate histories. */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.NR_TRAIN=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var COUNT=60;
  function fresh(){return {base:{},call:{}};}
  function number(v){return typeof v==='number'&&isFinite(v)&&v>=0?Math.min(100000,Math.floor(v)):0;}
  function normalize(raw){
    var out=fresh();
    ['base','call'].forEach(function(mode){
      for(var i=0;i<COUNT;i++){
        var e=raw&&raw[mode]&&raw[mode][i];if(!e||typeof e!=='object')continue;
        out[mode][i]={seen:number(e.seen),miss:number(e.miss),debt:Math.min(9,number(e.debt))};
      }
    });return out;
  }
  function group(data,call){return data[call?'call':'base'];}
  function record(data,id,call,ok){
    if(id<0||id>=COUNT||id%1)return;
    var g=group(data,call),e=g[id]||(g[id]={seen:0,miss:0,debt:0});
    e.seen++;if(ok)e.debt=Math.max(0,e.debt-1);else{e.miss++;e.debt=Math.min(9,e.debt+3);}
    return e;
  }
  function weak(data,call){var g=group(data,call);return Object.keys(g).map(Number).filter(function(id){return g[id].debt>0;}).sort(function(a,b){return g[b].debt-g[a].debt||g[b].miss-g[a].miss||a-b;});}
  function weight(g,id){var e=g[id];return e&&e.debt>0?4+e.debt*2:(!e||!e.seen?2:1);}
  function pick(data,call,history,rnd){
    rnd=rnd||Math.random;history=history||[];var g=group(data,call),recent=history.slice(-2),all=[];
    for(var i=0;i<COUNT;i++)if(recent.indexOf(i)<0)all.push(i);
    var focus=weak(data,call).filter(function(id){return recent.indexOf(id)<0;});
    // Keep some new questions, so learning a few mistakes does not hide the rest of the deck.
    var pool=focus.length&&rnd()<.8?focus:all;
    var total=pool.reduce(function(sum,id){return sum+weight(g,id);},0),ticket=rnd()*total;
    for(var j=0;j<pool.length;j++){ticket-=weight(g,pool[j]);if(ticket<0)return pool[j];}
    return pool[pool.length-1];
  }
  function shuffled(ids,rnd){
    rnd=rnd||Math.random;var out=ids.slice();
    for(var i=out.length-1;i>0;i--){var j=Math.floor(rnd()*(i+1)),v=out[i];out[i]=out[j];out[j]=v;}
    return out;
  }
  function newUnlimited(targetMs,rnd){
    if(typeof targetMs!=='number'||!isFinite(targetMs)||targetMs<=0)throw new Error('A positive target time is required');
    var ids=[];for(var i=0;i<COUNT;i++)ids.push(i);
    return {targetMs:targetMs,phase:'all',cycle:1,reviewPass:0,queue:shuffled(ids,rnd),index:0,failed:[],answers:0,passed:0,wrong:0,slow:0,cleared:false};
  }
  function currentUnlimited(s){return s.cleared?null:(s.queue[s.index]==null?null:s.queue[s.index]);}
  function answerUnlimited(s,id,ok,rt){
    if(s.cleared||currentUnlimited(s)!==id)return null;
    var elapsed=typeof rt==='number'&&isFinite(rt)&&rt>=0?rt:Infinity;
    var fast=elapsed<=s.targetMs,passed=!!ok&&fast;
    if(!passed)s.failed.push(id);
    s.index++;s.answers++;if(passed)s.passed++;if(!ok)s.wrong++;else if(!fast)s.slow++;
    return {ok:!!ok,fast:fast,passed:passed,rt:elapsed};
  }
  function advanceUnlimited(s,rnd){
    if(s.cleared||s.index<s.queue.length)return null;
    var previous=s.phase,previousSize=s.queue.length,failed=s.failed.slice();
    if(previous==='all'&&!failed.length){s.cleared=true;return {kind:'clear',previousSize:previousSize,size:0,cycle:s.cycle};}
    if(failed.length){s.phase='review';s.reviewPass++;s.queue=shuffled(failed,rnd);}
    else {s.phase='all';s.cycle++;s.reviewPass=0;var ids=[];for(var i=0;i<COUNT;i++)ids.push(i);s.queue=shuffled(ids,rnd);}
    s.index=0;s.failed=[];
    return {kind:s.phase,previous:previous,previousSize:previousSize,size:s.queue.length,cycle:s.cycle,reviewPass:s.reviewPass};
  }
  return {fresh:fresh,normalize:normalize,record:record,weak:weak,pick:pick,newUnlimited:newUnlimited,currentUnlimited:currentUnlimited,answerUnlimited:answerUnlimited,advanceUnlimited:advanceUnlimited};
});
