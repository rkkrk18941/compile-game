/* Shared 60-card leaderboard. Only a strict improvement replaces a name's record. */
(function(root,factory){var api=factory(root,root.NR_DECK);if(typeof module==='object'&&module.exports)module.exports=api;root.NR_RANK=api;})(typeof window!=='undefined'?window:globalThis,function(G,D){
 'use strict';
 var API='https://obake-catch-ranking.kd37yg.chatgpt.site/api/rankings',KEY='obake.ranking.pending.v1';
 function cleanName(value){return typeof value==='string'?value.normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g,'').trim().replace(/\s+/g,' ').slice(0,10):'';}
 function summary(a){var correct=0,totalMs=0,seen={};if(!a||!Array.isArray(a.answers)||a.answers.length!==60)return null;for(var i=0;i<a.answers.length;i++){var x=a.answers[i];if(!x||!Number.isInteger(x.card)||x.card<0||x.card>=60||seen[x.card]||!Number.isInteger(x.rt)||x.rt<1||x.rt>86400000||['grab','call'].indexOf(x.type)<0||D.ANIMALS.indexOf(x.item)<0)return null;seen[x.card]=true;var q=D.required(D.CARDS[x.card],a.mode==='call');if(q.type===x.type&&q.item===x.item)correct++;totalMs+=x.rt;}return {correct:correct,totalMs:totalMs};}
 function better(a,b){return !b||a.correct>b.correct||(a.correct===b.correct&&a.totalMs<b.totalMs);}
 function pending(){try{var a=JSON.parse(G.localStorage.getItem(KEY));return Array.isArray(a)?a.filter(function(x){return x&&x.version===1&&cleanName(x.name)&&['basic','call'].indexOf(x.mode)>=0&&Array.isArray(x.answers)&&x.answers.length===60&&summary(x);}):[];}catch(e){return [];}}
 function write(list){try{G.localStorage.setItem(KEY,JSON.stringify(list));return true;}catch(e){return false;}}
 function retain(attempt){var all=pending(),old=all.find(function(x){return x.mode===attempt.mode&&x.name===attempt.name;});if(old&&!better(summary(attempt),summary(old)))return true;return write(all.filter(function(x){return x.mode!==attempt.mode||x.name!==attempt.name;}).concat([attempt]));}
 function clear(attempt){write(pending().filter(function(x){return x.mode!==attempt.mode||x.name!==attempt.name||better(summary(x),summary(attempt));}));}
 async function request(path,body){
  var controller=typeof G.AbortController==='function'?new G.AbortController():null;
  var timer=controller?G.setTimeout(function(){controller.abort();},12000):null;
  try{var response=await G.fetch(API+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:controller?controller.signal:undefined,credentials:'omit',cache:'no-store'});var value=await response.json();if(!response.ok)throw Error(value.error||'ランキングに接続できませんでした。');return value;}
  catch(e){throw Error(e&&e.name==='AbortError'?'通信がタイムアウトしました。':e&&e.message||'ランキングに接続できませんでした。');}
  finally{if(timer!=null)G.clearTimeout(timer);}
 }
 async function submit(attempt){var stored=retain(attempt);try{var result=await request('',attempt);clear(attempt);return result;}catch(e){e.retained=stored;throw e;}}
 async function retryPending(){var all=pending();for(var i=0;i<all.length;i++)await submit(all[i]);return all.length;}
 return {cleanName:cleanName,summary:summary,better:better,pending:pending,submit:submit,retryPending:retryPending,list:function(mode,name){return request('?mode='+encodeURIComponent(mode)+'&name='+encodeURIComponent(cleanName(name)));}};
});
