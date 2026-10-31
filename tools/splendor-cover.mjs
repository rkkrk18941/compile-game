// 宝石の煌めき: renders tools/splendor-cover.html into the PLAYROOM cover (games/img/splendor.webp, splendor-640.webp)
// and the share image (splendor/og.jpg).
//   node tools/splendor-cover.mjs [outDir]     (default: write into games/img and splendor)
// Needs Playwright with Chromium and sharp. FONTS=/path/to/node_modules/@fontsource serves local font copies when
// Google Fonts cannot be reached.
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
function need(name){for(const p of [name,'/opt/node22/lib/node_modules/'+name,'/opt/npm-tools/node_modules/'+name]){try{return require(p);}catch(e){/* next */}}console.error(name+' was not found');process.exit(2);}
const playwright=need('playwright'),sharp=need('sharp');
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=process.argv[2]||null,FONTS=process.env.FONTS||'';
const PORT=8798,server=spawn(process.execPath,['serve.js'],{cwd:root,env:{...process.env,PORT:String(PORT)},stdio:'ignore'});
await new Promise(r=>setTimeout(r,500));
const browser=await playwright.chromium.launch();
async function render(w,h,query){
 const ctx=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:1});
 if(FONTS){
  await ctx.route(/fonts\.googleapis\.com/,r=>{let css='';for(const [pkg,ws] of [['shippori-mincho-b1',[700,800]],['zen-kaku-gothic-new',[500,700,900]]])for(const x of ws){const f=path.join(FONTS,pkg,x+'.css');if(fs.existsSync(f))css+=fs.readFileSync(f,'utf8').replaceAll('./files/','https://fonts.gstatic.com/__local/'+pkg+'/files/');}r.fulfill({status:200,body:css,contentType:'text/css'});});
  await ctx.route(/fonts\.gstatic\.com\/__local\//,r=>{const f=path.join(FONTS,new URL(r.request().url()).pathname.replace('/__local/',''));if(fs.existsSync(f))r.fulfill({path:f,contentType:'font/woff2'});else r.fulfill({status:404,body:''});});
 }
 const page=await ctx.newPage();
 await page.goto(`http://localhost:${PORT}/tools/splendor-cover.html?w=${w}&h=${h}${query||''}`);
 await page.waitForSelector('body[data-ready]');await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(150);
 const png=await page.screenshot({type:'png'});await ctx.close();return png;
}
const cover=await render(1280,720),og=await render(1200,630,'&og=1');
const imgDir=out||path.join(root,'games','img'),gameDir=out||path.join(root,'splendor');
fs.mkdirSync(imgDir,{recursive:true});
await sharp(cover).webp({quality:84}).toFile(path.join(imgDir,'splendor.webp'));
await sharp(cover).resize(640,360).webp({quality:82}).toFile(path.join(imgDir,'splendor-640.webp'));
await sharp(og).jpeg({quality:86,mozjpeg:true}).toFile(path.join(gameDir,'og.jpg'));
await browser.close();server.kill();
console.log('wrote',path.join(imgDir,'splendor.webp'),path.join(imgDir,'splendor-640.webp'),path.join(gameDir,'og.jpg'));
