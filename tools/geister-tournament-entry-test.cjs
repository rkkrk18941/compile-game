// GST_DOM_MODULE=/path/to/linkedom node --experimental-vm-modules tools/geister-tournament-entry-test.cjs
const assert=require('node:assert/strict');
const {client,clients}=require('./geister-online-entry-test.cjs');
const {fixture}=require('./https-room-test.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<2000;i++){if(fn())return;await sleep(5);}throw Error(label);}
function open(c){c.click('#goTournament');c.click('[data-tour-network="online"]');}
async function game(kind){
  const f=fixture(),options={tournament:true,kind,fetch:f.request};
  const h=await client(options),g=await client(options);open(h);open(g);
  assert.ok(h.window.GST_TOUR,'actual tournament module loaded');
  h.$('#gstTourName').value='Host';h.click('#gstCreate');
  assert.equal(h.$('#gstCreate').disabled,true);assert.equal(h.$('#gstJoin').disabled,true);
  await until(()=>!h.$('#scrTourLobby').hidden,'host lobby');
  const code=h.$('#gstLobbyCode').textContent;g.$('#gstTourName').value='Guest';g.$('#gstCode').value=code;g.click('#gstJoin');
  await until(()=>!g.$('#scrTourLobby').hidden,'guest lobby');assert.equal(h.$('#gstLobbyStart').disabled,false);
  h.click('#gstLobbyStart');
  await until(()=>h.window.__gst.view()?.phase==='setup'&&g.window.__gst.view()?.phase==='setup','both boards arrived');
  assert.equal(h.window.__gst.M().ctrl.length,1);assert.equal(g.window.__gst.M().ctrl.length,1);
  h.window.__gst.setup([1,1,1,1,0,0,0,0]);
  await until(()=>g.window.__gst.view().ready[h.window.__gst.M().seat],'host setup reached guest');
  g.window.__gst.setup([0,0,0,0,1,1,1,1]);
  await until(()=>h.window.__gst.view().phase==='play'&&g.window.__gst.view().phase==='play','both setups begin play');
  for(const c of [h,g])assert.ok(c.window.__gst.view().g.filter(x=>x.o!==c.window.__gst.M().seat).every(x=>x.good===null),'opponent colours stay private');
  for(let ply=0;ply<2;ply++){
    await until(()=>[h,g].every(c=>!c.window.__gst.M().busy&&!c.window.__gst.M().waiting),'animations and acknowledgements completed');
    const match=h.window.GST_TOUR.arena.d.matches.find(m=>m.status==='live');
    const mover=h.window.__gst.M().seat===match.state.turn?h:g;
    mover.window.__gst.act(h.window.__gst.E.legal(match.state,match.state.turn)[0]);
    await until(()=>h.window.__gst.view().ply===ply+1&&g.window.__gst.view().ply===ply+1,'move '+(ply+1)+' synchronized');
  }
  g.window.GST_TOUR.resign();await until(()=>h.window.__gst.view().phase==='over'&&g.window.__gst.view().phase==='over','resignation and result synchronized');
  assert.ok(h.window.GST_TOUR.arena.d.over());h.close();g.close();
  console.log('PASS tournament UI ('+kind+'): real module, room, distinct identities, private setup, two-way play, result and champion');
}
async function cancellation(){
  const c=await client({tournament:true});open(c);let resolve,closed=0,attempts=0;
  c.window.GST_TOUR_NET.makeGuest=()=>({on(){},send(){},close(){closed++;},join(){attempts++;return new Promise(r=>{resolve=r;});}});
  c.$('#gstCode').value='ABCD';c.click('#gstJoin');c.click('#gstJoin');assert.equal(attempts,1);
  c.click('#gstOnlineBack');assert.equal(closed,1);assert.equal(c.$('#gstJoin').disabled,false);
  resolve();await sleep(10);assert.equal(c.$('#scrTitle').hidden,false);c.close();
  console.log('PASS tournament UI: duplicate guard, Back cancellation and late completion');
}
(async()=>{await game('local');await game('relay');await cancellation();})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>clients.forEach(c=>c.close()));
