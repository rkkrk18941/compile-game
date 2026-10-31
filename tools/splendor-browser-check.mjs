// 宝石の煌めき — browser check: setup, a full game against the CPU played through the real interface, the BGM list,
// resume after reload, and layouts for phone portrait / small phone / phone landscape / desktop (screenshots).
// node tools/splendor-browser-check.mjs [outDir]
// Needs Playwright (PLAYWRIGHT=/path/to/playwright/index.mjs) and, offline, local fonts (FONTS=/path/to/node_modules/@fontsource).
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT||'playwright');
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const out=path.resolve(process.argv[2]||'qa-splendor');fs.mkdirSync(out,{recursive:true});
const port=8790+Math.floor(Math.random()*200);
const server=spawn(process.execPath,[path.join(root,'serve.js')],{env:{...process.env,PORT:String(port)},stdio:'ignore'});
await new Promise(r=>setTimeout(r,500));
const base=`http://localhost:${port}/splendor/`;
const fonts=process.env.FONTS;
async function routeFonts(page){
 if(!fonts)return;
 await page.route('https://fonts.googleapis.com/**',async route=>{
  let css='';
  for(const [pkg,weights] of [['shippori-mincho-b1',[700,800]],['zen-kaku-gothic-new',[400,500,700,900]]])
   for(const w of weights){const f=path.join(fonts,pkg,`${w}.css`);if(fs.existsSync(f))css+=fs.readFileSync(f,'utf8').replaceAll('./files/',`https://fonts.gstatic.com/__local/${pkg}/files/`);}
  await route.fulfill({status:200,contentType:'text/css',body:css});
 });
 await page.route('https://fonts.gstatic.com/__local/**',async route=>{
  const rel=new URL(route.request().url()).pathname.replace('/__local/','');
  const f=path.join(fonts,rel);
  if(fs.existsSync(f))await route.fulfill({status:200,contentType:'font/woff2',body:fs.readFileSync(f)});else await route.abort();
 });
}
const browser=await chromium.launch();
const errors=[];
async function open(viewport,query='?test=1',opts={}){
 const ctx=await browser.newContext({viewport,deviceScaleFactor:opts.dpr||2,isMobile:!!opts.mobile,hasTouch:!!opts.mobile});
 const page=await ctx.newPage();
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error'&&!/favicon|net::ERR|Failed to load resource/.test(m.text()))errors.push(m.text());});
 await routeFonts(page);
 await page.goto(base+query);
 await page.waitForFunction(()=>window.SPL_ART&&document.querySelector('#heroChips svg'));
 await page.evaluate(()=>document.fonts&&document.fonts.ready);
 return {ctx,page};
}
const shot=(page,name)=>page.screenshot({path:path.join(out,name+'.png')});

// 1. setup screen, BGM catalogue
{
 const {ctx,page}=await open({width:390,height:844},'?test=1',{mobile:true});
 await shot(page,'01-setup-phone');
 await page.click('#musicOpen');
 await page.waitForSelector('.track-list [data-track]');
 const n=await page.$$eval('.track-list [data-track]',b=>b.length);
 const unique=await page.evaluate(async()=>{const m=await import('../assets/gemini-catalog.mjs');return new Set(Object.values(m.RECORDINGS).map(t=>t.file)).size;});
 assert.equal(n,unique,'every recording is listed once');
 assert.ok(n>=30,'all existing BGM are offered');
 await shot(page,'02-bgm-list');
 await page.click('.track-list [data-track="nanafushigi"]');
 const chosen=await page.evaluate(()=>SPL_AUDIO.settings.track);assert.equal(chosen,'nanafushigi');
 await page.keyboard.press('Escape');
 await ctx.close();
}

// 2. a full 2-player game through the interface: the person's moves are the hint (つよい) played by clicking
async function playHuman(page){
 // take gems or click a card and the sheet's button, the way a person would
 const t=await page.evaluate(()=>{const T=SPL_TEST;return T.AI.hint(T.E.view(T.M.s,0));});
 const a=t.a;
 if(a.k==='take'){
  for(const c of a.g)await page.click(`#bank .pile[data-c="${c}"]`);
  await page.click('#act [data-act="take"]');
 }else if(a.k==='buy'||a.k==='res'){
  if(a.k==='res'&&a.d!=null){await page.click(`#market [data-deck="${a.d}"]`);await page.click('dialog [data-do]');}
  else{
   await page.click(a.m!=null?`#market [data-slot="${a.m}"]`:`#me [data-res="${a.r}"]`);
   await page.click(`dialog [data-do="${a.k}"]`);
  }
 }else await page.click('#act [data-act="pass"]');
 // returns or a noble choice
 for(let k=0;k<3;k++){
  await page.waitForTimeout(30);
  if(await page.$('dialog [data-auto]')){await page.click('dialog [data-auto]');await page.click('dialog [data-ok]');}
  else if(await page.$('dialog .nob-pick [data-n]'))await page.click('dialog .nob-pick [data-n]');
 }
}
async function playGame(page,{maxTurns=200,snapAt=null,name=''}={}){
 let turns=0;
 while(turns<maxTurns){
  const st=await page.evaluate(()=>({over:SPL_TEST.M.s.over,phase:SPL_TEST.M.phase,cur:SPL_TEST.M.s.cur,turn:SPL_TEST.M.s.turn}));
  if(st.over)break;
  if(st.phase==='human'){await playHuman(page);turns++;if(snapAt&&turns===snapAt)await shot(page,name);}
  else await page.waitForTimeout(25);
 }
 return turns;
}
{
 const {ctx,page}=await open({width:390,height:844},'?test=1',{mobile:true});
 await page.evaluate(()=>SPL_TEST.start({players:2,levels:[3,3,3],first:'you'}));
 await page.waitForFunction(()=>SPL_TEST.M.phase==='human');
 await shot(page,'03-game-start-phone');
 // card sheet
 await page.click('#market [data-slot="0"]');await page.waitForSelector('dialog .card-big');await shot(page,'04-card-sheet');await page.keyboard.press('Escape');
 // selecting gems
 await page.click('#bank .pile[data-c="1"]');await page.click('#bank .pile[data-c="3"]');await shot(page,'05-gem-select');
 await page.click('#act [data-act="clear"]');
 const turns=await playGame(page,{snapAt:12,name:'06-midgame-phone'});
 await page.waitForSelector('dialog .result-list');
 await shot(page,'07-result');
 const st=await page.evaluate(()=>({over:SPL_TEST.M.s.over,pts:SPL_TEST.M.s.pl.map(p=>p.pts),log:SPL_TEST.M.log.length}));
 assert.ok(st.over,'game finished through the interface');
 console.log('full game through the UI: your turns',turns,'points',st.pts.join('/'),'log entries',st.log);
 const rec=await page.evaluate(()=>JSON.parse(localStorage.getItem('splendor.records.v1')));
 assert.ok(rec&&rec[3]&&(rec[3].w+rec[3].l+rec[3].d)===1,'record saved');
 await ctx.close();
}

// 3. resume after reload in the middle of a 4-player game (search CPU with a short budget)
{
 const {ctx,page}=await open({width:390,height:844},'?test=1',{mobile:true});
 await page.evaluate(()=>SPL_TEST.start({players:4,levels:[1,4,5],first:'you',ms:80}));
 await page.waitForFunction(()=>SPL_TEST.M.phase==='human');
 await playGame(page,{maxTurns:4});
 await page.waitForFunction(()=>SPL_TEST.M.phase==='human');
 await shot(page,'08-four-players-phone');
 const before=await page.evaluate(()=>({turn:SPL_TEST.M.s.turn,pts:SPL_TEST.M.s.pl.map(p=>p.pts).join()}));
 await page.reload();
 await page.waitForSelector('#resumeBtn:not([hidden])');
 await page.click('#resumeBtn');
 await page.waitForFunction(()=>SPL_TEST.M&&SPL_TEST.M.phase==='human');
 const after=await page.evaluate(()=>({turn:SPL_TEST.M.s.turn,pts:SPL_TEST.M.s.pl.map(p=>p.pts).join()}));
 assert.deepEqual(after,before,'resumed at the same turn');
 await ctx.close();
}

// 3b. the growing rival: plays through the worker, and its practice games run in a fresh worker
{
 const {ctx,page}=await open({width:390,height:844},'?test=1',{mobile:true});
 await page.evaluate(()=>SPL_TEST.start({players:2,levels:[6,3,3],first:'cpu',ms:80}));
 await page.waitForFunction(()=>SPL_TEST.M.phase==='human',null,{timeout:20000});
 const tuned=await page.evaluate(()=>new Promise(res=>{
  const w=new Worker('cpu-worker.js?v=check');let progress=0;
  w.onmessage=e=>{const m=e.data||{};if(m.k==='progress')progress++;if(m.k==='tuned'){w.terminate();res({progress,res:m.res});}};
  w.postMessage({k:'tune',job:{params:SPL_TEST.AI.GROW_BASE,space:SPL_TEST.AI.GROW_SPACE,timeMs:1500,seed:7,minPairs:2,maxPairs:4}});
 }));
 assert.ok(tuned.res&&tuned.res.params&&tuned.res.games>0,'rival practice games ran in the worker');
 console.log('rival practice: games',tuned.res.games,'ideas tried',tuned.res.tried);
 await ctx.close();
}

// 4. layouts: everything fits without scrolling
for(const [w,h,name,mobile] of [[360,640,'09-small-phone',true],[844,390,'10-landscape-phone',true],[1366,768,'11-desktop',false],[768,1024,'12-tablet',true]]){
 const {ctx,page}=await open({width:w,height:h},'?test=1',{mobile});
 await page.evaluate(()=>SPL_TEST.start({players:3,levels:[3,2,2],first:'you'}));
 await page.waitForFunction(()=>SPL_TEST.M.phase==='human');
 await playGame(page,{maxTurns:6});
 await page.waitForFunction(()=>SPL_TEST.M.phase==='human');
 await page.evaluate(()=>SPL_TEST.fit());
 const fitInfo=await page.evaluate(()=>{const t=document.getElementById('table');return {scroll:t.scrollHeight,client:t.clientHeight,cw:getComputedStyle(document.documentElement).getPropertyValue('--cw')};});
 console.log(name,'card width',fitInfo.cw.trim(),'content',fitInfo.scroll,'screen',fitInfo.client);
 if(h>=600)assert.ok(fitInfo.scroll<=fitInfo.client+2,name+' fits without scrolling');
 await shot(page,name);
 await ctx.close();
}

await browser.close();server.kill();
if(errors.length){console.error('page errors:\n'+errors.join('\n'));process.exit(1);}
console.log('splendor browser check passed; screenshots in',out);
