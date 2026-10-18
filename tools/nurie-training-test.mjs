import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),T=require('../nurie-rush/training.js'),E=require('../nurie-rush/engine.js');
const data=T.fresh();T.record(data,7,false,false);
assert.deepEqual(T.weak(data,false),[7]);assert.deepEqual(T.weak(data,true),[]);
for(let i=0;i<2;i++)T.record(data,7,false,true);
assert.deepEqual(T.weak(data,false),[7],'one or two lucky answers do not erase a mistake');
T.record(data,7,false,true);assert.deepEqual(T.weak(data,false),[],'three correct answers retire the review');
T.record(data,7,false,false);T.record(data,18,false,false);
const rnd=E.seeded(741),history=[];let focus=0;
for(let i=0;i<10000;i++){
 const id=T.pick(data,false,history,rnd);
 assert(!history.slice(-2).includes(id),'do not immediately repeat a question');
 if(id===7||id===18)focus++;
 history.push(id);
}
assert(focus>4500&&focus<8500,'weak questions get frequent review without crowding out all new cards');
const clean=T.normalize({base:{7:{seen:-1,miss:'bad',debt:Infinity},61:{seen:1,miss:1,debt:9}},call:{3:{seen:5,miss:1,debt:2}}});
assert.deepEqual(clean.base[7],{seen:0,miss:0,debt:0});assert(!clean.base[61]);assert.equal(clean.call[3].debt,2);
const restored=T.normalize(JSON.parse(JSON.stringify(data)));
assert.deepEqual(T.weak(restored,false),[7,18],'saved review history survives a reload');
console.log('Adaptive review passed: '+focus+'/10000 focused questions, spacing, recovery, persistence and separate rule histories.');
