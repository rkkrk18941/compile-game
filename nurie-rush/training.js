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
  return {fresh:fresh,normalize:normalize,record:record,weak:weak,pick:pick};
});
