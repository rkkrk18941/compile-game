import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=source.indexOf('let claimAttempt=0;'),end=source.indexOf('if(!claim.committed)',start);
assert(start>0 && end>start);
const snippet=source.slice(start,end)+'return claim;';
async function run(cached,server) {
 let attempts=0,writes=0;
 const meta={version:4,expiresAt:Date.now()+60000,hostUid:'host',hostClientId:'host-client'};
 const ctx={NET_PROTOCOL:4,NET:{uid:'guest',clientId:'guest-client'},myName:'GUEST',meta,metaRef:{},netTimed:p=>p,
 dbM:{async runTransaction(ref,update,options){assert.equal(options.applyLocally,false);const initial=update(cached);attempts++;if(initial===undefined)return{committed:false};const retry=update(server===undefined?meta:server);attempts++;if(retry===undefined)return{committed:false};writes++;return{committed:true,snapshot:{val:()=>retry}};}}};
 vm.createContext(ctx);const result=await vm.runInContext('(async()=>{'+snippet+'})()',ctx);return{result,attempts,writes};
}
const first=await run(null);assert(first.result.committed);assert.equal(first.result.snapshot.val().guestUid,'guest');assert.equal(first.attempts,2);
const occupied={version:4,expiresAt:Date.now()+60000,guestClientId:'other-client'};
assert.equal((await run(null,occupied)).result.committed,false,'CAS retry cannot overwrite another guest');
assert.equal((await run(occupied,occupied)).result.committed,false,'occupied local cache aborts immediately');
assert.equal((await run(null,null)).result.committed,false,'deleted room is not reseeded on retry');
assert.equal((await run(null,{version:4,expiresAt:1})).result.committed,false);
assert.equal((await run(null,{version:3,expiresAt:Date.now()+60000})).result.committed,false);
console.log('Online claim: empty initial cache, concurrent guest, deleted room, expiration and protocol mismatch passed');
