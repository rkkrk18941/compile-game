// GST_DOM_MODULE=/path/to/linkedom node --experimental-vm-modules tools/geister-online-entry-test.cjs
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {parseHTML}=require(process.env.GST_DOM_MODULE||'linkedom');
const root=path.join(__dirname,'../geister');
const wait=()=>new Promise(r=>setTimeout(r,5));
const clients=[];
async function until(fn,label){for(let i=0;i<200;i++){if(fn())return;await wait();}throw Error(label);}
async function client(){
  const {window:dom}=parseHTML(fs.readFileSync(path.join(root,'index.html'),'utf8'));
  const document=dom.document,storage=new Map(),timers=new Map();
  dom.HTMLElement.prototype.getBoundingClientRect=()=>({top:0,left:0,width:390,height:80,bottom:80,right:390});
  const st=(f,ms)=>{const t=setTimeout(()=>{timers.delete(t);f();},ms);timers.set(t,f);return t;};
  const window={document,innerWidth:390,innerHeight:844,devicePixelRatio:1,addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}}),crypto:require('node:crypto').webcrypto,BroadcastChannel};
  const location={search:'?test=1&net=local',href:'http://example.test/geister/',origin:'http://example.test',pathname:'/geister/'};
  const store={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
  const context=vm.createContext({window,document,location,history:{replaceState(_a,_b,u){location.href=String(u);}},localStorage:store,sessionStorage:store,navigator:{},URL,URLSearchParams,console,Uint8Array,Math,setTimeout:st,clearTimeout,requestAnimationFrame:f=>st(f,0),getComputedStyle:()=>({paddingLeft:'0',paddingRight:'0',paddingTop:'0',paddingBottom:'0'})});
  for(const f of ['engine.js','ai.js','net.js']){vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),context,{filename:f});for(const key of ['GST_ENG','GST_AI'])if(context[key])window[key]=context[key];}
  const netLinks=[];for(const name of ['makeHost','makeGuest']){const make=window.GST_NET[name];window.GST_NET[name]=(...args)=>{const link=make(...args);netLinks.push(link);return link;};}
  const mod=new vm.SyntheticModule(['createGeisterTournaments'],function(){this.setExport('createGeisterTournaments',()=>({active:false}));},{context});
  await mod.link(()=>{});await mod.evaluate();
  vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8'),context,{filename:'app.js',importModuleDynamically:()=>mod});
  const c={window,document,context,timers,$:s=>document.querySelector(s),click(s){const e=this.$(s);assert.ok(e,s);e.onclick({target:e});},fireTimer(id){clearTimeout(id);const f=timers.get(id);timers.delete(id);f();},close(){netLinks.forEach(link=>link.close());window.__gst.L()?.link.close();for(const t of timers.keys())clearTimeout(t);}};
  clients.push(c);return c;
}
function online(c){c.click('#goPlay');c.click('[data-play-screen="#scrOnline"]');}
async function main(){
  const h=await client(),g=await client();online(h);online(g);
  h.$('#onName').value='主';h.click('#onCreate');await until(()=>h.window.__gst.L(),'host created');
  const code=h.window.__gst.L().code;g.$('#onName').value='参加';g.$('#onCode').value=code;g.click('#onJoin');
  assert.equal(g.$('#onJoin').disabled,true);assert.equal(g.$('#onCreate').disabled,true);assert.equal(g.$('#onJoin').textContent,'接続中…');
  await until(()=>!g.$('#scrLobby').hidden,'guest entered lobby');
  assert.equal(h.window.__gst.L().guest.nm,'参加');assert.equal(h.$('#lobStart').disabled,false);
  h.click('#lobStart');await until(()=>g.window.__gst.M(),'guest received game');
  h.window.__gst.setup([1,1,1,1,0,0,0,0]);g.window.__gst.setup([0,0,0,0,1,1,1,1]);
  await until(()=>h.window.__gst.view().phase==='play'&&g.window.__gst.view().phase==='play','both setup and begin');
  assert.ok(g.window.__gst.view().g.filter(x=>x.o===0).every(x=>x.good===null),'opponent colours remain hidden');
  const mover=h.window.__gst.view().turn===0?h:g,move=h.window.__gst.E.legal(h.window.__gst.M().s,h.window.__gst.M().s.turn)[0];
  mover.window.__gst.act(move);await until(()=>h.window.__gst.view().ply===1&&g.window.__gst.view().ply===1,'move synchronized');
  const extra=await client();online(extra);extra.$('#onCode').value=code;extra.click('#onJoin');
  await until(()=>extra.$('#onErr').textContent.includes('埋まっています'),'full room reports reason');
  assert.equal(extra.$('#onJoin').disabled,false,'full-room rejection allows retry');
  h.close();g.close();
  // A stale or failed attempt must never strand controls or reopen a screen after Back.
  const c=await client();online(c);let resolve,reject,closed=0,attempts=0;
  c.window.GST_NET.makeGuest=()=>{attempts++;return {join:()=>new Promise((r,j)=>{resolve=r;reject=j;}),close(){closed++;},on(){},send(){}};};
  c.$('#onCode').value='ABCD';c.click('#onJoin');c.click('#onJoin');assert.equal(attempts,1,'duplicate join guarded');
  c.click('#scrOnline [data-back]');assert.equal(closed,1,'Back closes pending transport');assert.equal(c.$('#onJoin').disabled,false);
  resolve();await wait();assert.equal(c.$('#scrTitle').hidden,false,'late completion cannot reopen room');assert.equal(c.window.__gst.L(),null);
  online(c);c.click('#onJoin');reject({code:'net',detail:'timeout'});await wait();assert.equal(c.$('#onJoin').disabled,false);assert.equal(c.$('#onCreate').disabled,false);assert.match(c.$('#onErr').textContent,/タイムアウト/);
  c.click('#onJoin');reject({code:'notfound'});await wait();assert.match(c.$('#onErr').textContent,/見つかりません/);assert.equal(c.$('#onJoin').disabled,false,'retry recovers');
  c.click('#onJoin');resolve();await wait();assert.equal(c.$('#onJoin').disabled,true,'wait for room acknowledgement');
  c.fireTimer(c.window.__gst.L().joinTimer);assert.equal(c.window.__gst.L(),null);assert.equal(c.$('#onJoin').disabled,false);assert.match(c.$('#onErr').textContent,/応答がありません/);
  console.log('PASS Geister UI: room creation, code join, lobby, setup, private colours, synchronized move, cancellation, duplicate prevention, timeout and retry');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>clients.forEach(c=>c.close()));
