// Run with QV_CHROMIUM=/path/to/chrome and, offline, QV_VENDOR=/path/to/node_modules.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||'',process.cwd()]}));
const root=path.resolve(import.meta.dirname,'..'),port=8796,url=`http://localhost:${port}/quo-vadis/`;
const server=spawn(process.execPath,['serve.js'],{cwd:root,env:{...process.env,PORT:String(port)},stdio:'ignore'});
const browser=await chromium.launch({executablePath:process.env.QV_CHROMIUM||undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const shots=process.env.QV_SHOTS;
if(shots)fs.mkdirSync(shots,{recursive:true});
try{
  for(const vp of [{width:390,height:844},{width:844,height:390}]){
    const ctx=await browser.newContext({viewport:vp,isMobile:true,hasTouch:true});
    const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    // A real saved game must survive all tutorial operations and reloads byte for byte.
    await ctx.addInitScript(()=>{if(!localStorage.getItem('quovadis.save'))localStorage.setItem('quovadis.save','{"sentinel":"existing game"}');});
    await page.goto(url+'tutorial.html');
    await page.locator('[data-answer="1"]').click();assert.equal(await page.locator('#next').isEnabled(),false);
    assert.match(await page.locator('#feedback').innerText(),/元老院/);
    await page.locator('[data-answer="0"]').click();
    for(let i=1;i<9;i++){
      await page.locator('#next').click();
      if(i===4){
        assert.equal(await page.locator('#do').isEnabled(),false);
        await page.locator('#ask').click();assert.match(await page.locator('.reply').innerText(),/1点なら/);
        assert.equal(await page.locator('#do').isEnabled(),false);
        await page.locator('[data-pay="1"]').click();await page.locator('#ask').click();
        await page.locator('#do').click();assert.match(await page.locator('.score').innerText(),/あなた 3点/);
      }else if(i===6){await page.locator('#do').click();assert.equal(await page.locator('#next').isEnabled(),false);await page.locator('#select').click();await page.locator('#do').click();}
      else{assert.equal(await page.locator('#do').isEnabled(),false);if(i===1)await page.locator('[data-cid="A1"]').click();else await page.locator('#select').click();await page.locator('#do').click();if(i===7){assert.equal(await page.locator('#next').isEnabled(),false);await page.locator('#bonus').click();}}
      assert.equal(await page.locator('#next').isEnabled(),true,`step ${i+1} completes`);
      assert.equal(await page.evaluate(()=>localStorage.getItem('quovadis.save')),'{"sentinel":"existing game"}');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal page overflow');
      if(i===4&&shots)await page.screenshot({path:path.join(shots,`practice-${vp.width}.png`),fullPage:true});
    }
    await page.locator('#next').click();assert.equal(await page.locator('#complete').isVisible(),true);
    await page.locator('#glossary').click();await page.getByRole('searchbox').fill('カエサル');
    assert((await page.locator('.qv-terms article').count())>0);
    await page.getByRole('searchbox').fill('zzzzzz');assert.match(await page.locator('.qv-terms').innerText(),/見つかりません/);
    await page.getByRole('searchbox').fill('');assert.equal(await page.locator('.qv-terms article').count(),30);
    if(shots)await page.screenshot({path:path.join(shots,`glossary-${vp.width}.png`)});
    await page.keyboard.press('Escape');await page.locator('#qvGlossary').waitFor({state:'detached'});await page.locator('#qvGlossary').waitFor({state:'detached'});assert.equal(await page.locator('#qvGlossary').count(),0);
    // Exercise the optional bonus skip, retry, jump, and persistent progress.
    await page.locator('[data-chapter="7"]').click();await page.locator('#select').click();await page.locator('#do').click();await page.locator('#skip').click();
    await page.locator('#retry').click();assert.equal(await page.locator('#next').isEnabled(),false);
    await page.reload();assert.match(await page.locator('#lessonTitle').innerText(),/☆付きII/);
    assert.deepEqual(errors,[]);console.log(`ok tutorial ${vp.width}×${vp.height}: full flow, refusal/retry, both bonus choices, glossary, saved-game isolation`);
    await ctx.close();
  }
  if(process.env.QV_VENDOR){
    const ctx=await browser.newContext({viewport:{width:390,height:844}});
    await ctx.route(/three@0\.160\.0\/build\/three\.module\.min\.js/,r=>r.fulfill({path:path.join(process.env.QV_VENDOR,'three/build/three.module.min.js'),contentType:'text/javascript'}));
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.fulfill({body:'',contentType:'text/css'}));
    const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);await page.waitForFunction(()=>window.__ready===true);
    assert.equal(await page.getByRole('link',{name:'はじめての方へ：操作で覚える'}).isVisible(),true);
    await page.locator('#tGlossary').click();await page.getByRole('searchbox').fill('月桂冠');assert((await page.locator('.qv-terms article').count())>0);await page.keyboard.press('Escape');await page.locator('#qvGlossary').waitFor({state:'detached'});
    await page.locator('#tSolo').click();await page.locator('#soFirst [data-v="me"]').click();await page.locator('#soStart').click();
    await page.waitForFunction(()=>window.__qv.canAct());await page.locator('#btnGlossary').click();await page.keyboard.press('Escape');await page.locator('#qvGlossary').waitFor({state:'detached'});
    await page.locator('[data-term="議員"]').click();assert.match(await page.locator('.qv-terms').innerText(),/8個/);await page.keyboard.press('Escape');await page.locator('#qvGlossary').waitFor({state:'detached'});
    await page.locator('[data-place="A1"]').click();await page.locator('#aGo').click();
    await page.waitForFunction(()=>window.__qv.V.turnNo>1);
    if(shots)await page.screenshot({path:path.join(shots,'normal-game.png')});
    assert.deepEqual(errors,[]);console.log('ok main game: tutorial entry, glossary on title and table, inline term explanation, normal action');
    await ctx.close();
  }
}finally{await browser.close();server.kill();}
