// Focused regressions for the review-before-spending flow. No WebGL or browser required.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../ticket-to-ride/map.js'), E = require('../ticket-to-ride/engine.js');
const source = fs.readFileSync(new URL('../ticket-to-ride/app.js', import.meta.url), 'utf8')
  .replace(/^import .*?;\n/m, '').replace(/\nboot\(\);\s*$/, '\n');
const ctx = vm.createContext({
  window: { TTR_MAP: M, TTR_ENG: E, TTR_NET: { makeCid: () => 'TEST123' } },
  document: { addEventListener: () => {} },
  location: { search: '' }, navigator: {}, URLSearchParams, console,
  localStorage: { getItem: () => null }, sessionStorage: { getItem: () => 'TEST123' },
  setTimeout: () => 0, clearTimeout: () => {},
  CARD_HEX: Array(9).fill('#777777'), COLOR_NAME: ['桃', '白', '青', '黄', '橙', '黒', '赤', '緑', 'SL'],
  SEATS: Array.from({ length: 5 }, (_, i) => ({ hex: '#777777', ink: '#ffffff', name: String(i) })),
  paintTicket: () => ({ toDataURL: () => 'data:image/png;base64,' })
});
vm.runInContext(source, ctx);
vm.runInContext(`
  let submitted = [], promptText = '', buttons = [], modal = '', confirmButton = {}, closed = 0;
  sfx.unlock = () => {}; sfx.play = () => {};
  renderPanel = () => {}; renderMarks = () => {}; renderAll = () => {}; toast = () => {};
  setPrompt = (text, list) => { promptText = text; buttons = list || []; };
  act = (a) => { submitted.push(a); ui.confirm = null; presenting = true; };
  openLayer = (html) => { modal = html; confirmButton = {}; return { querySelector: () => confirmButton }; };
  closeLayer = () => { closed++; };
  function reset(step = null) {
    submitted = []; presenting = false; closed = 0;
    match = { players: [{color:0}, {color:1}], waiting:false };
    view = { me:0, turn:0, n:2, phase:'play', ply:10, step, owner:M.routes.map(()=>-1), hand:Array(9).fill(8),
      pl:[{routes:[],trains:45},{routes:[],trains:45}], tix:[], face:[2,8,3,4,5], deckN:30,discN:0,tdeckN:20 };
    ui = {sel:-1,pay:0,color:-1,confirm:null,tixFocus:-1};
  }
`, ctx);
const run = (code) => vm.runInContext(code, ctx);
const read = (code) => JSON.parse(JSON.stringify(run(code)));
let checks = 0;
function check(code, expected, message) { assert.deepEqual(read(code), expected, message); checks++; }
run("reset(); onTrayTap({kind:'face',i:0})");
check('[ui.confirm, submitted.length, view.ply, view.hand[2]]', ['card', 0, 10, 8], 'tapping a card only reviews it');
run('buttons[0].fn()'); check('[ui.confirm, submitted.length]', [null, 0], 'cancel draws nothing');
run("onTrayTap({kind:'face',i:0}); buttons[1].fn()"); check('submitted', [{t:'card',i:0}], 'confirm draws the reviewed card');
run("reset({k:'draw2'}); onTrayTap({kind:'face',i:0})");
check("promptText.includes('2枚目') && buttons.length === 2", true, 'second draw still offers confirmation');
run('buttons[0].fn()'); check("view.step.k", 'draw2', 'cancel preserves the remaining draw');
run("onTrayTap({kind:'face',i:1})"); check('submitted.length', 0, 'face-up SL is blocked as second draw');
run("reset(); onTrayTap({kind:'face',i:1})"); check("promptText.includes('この1枚で手番終了')", true, 'SL warns that it ends the turn');
run("reset(); onTrayTap({kind:'deck'}); buttons[1].fn()"); check('submitted', [{t:'card',i:5}], 'deck also requires confirmation');
run("reset(); onTrayTap({kind:'face',i:0}); view.face[0]=6; buttons[1].fn()"); check('submitted.length', 0, 'a changed card cannot be taken by a stale confirmation');
run("reset(); onTrayTap({kind:'face',i:0}); view.ply++; buttons[1].fn()"); check('submitted.length', 0, 'an outdated turn cannot be confirmed');
run("reset(); view.turn=1; onTrayTap({kind:'deck'})"); check('[ui.confirm,submitted.length]', [null,0], 'cannot draw on an opponent turn');
run('reset(); ui.sel=0; const pay=claimInfo(0).pays[0]; confirmClaim(0,pay)');
check('submitted.length', 0, 'route review does not spend cards or place trains');
check("modal.includes(cityName(M.routes[0].a)) && modal.includes(cityName(M.routes[0].b)) && modal.includes('払うカード') && modal.includes('残り')", true, 'review identifies cities, payment and remaining trains');
run('closeLayer()'); check('[ui.sel,submitted.length]', [0,0], 'back preserves selected route without spending');
run('confirmClaim(0,pay); confirmButton.onclick()');
check('submitted', [{t:'claim',r:0,c:run('pay.c'),k:run('pay.k')}], 'only confirmation submits the exact route payment');
run('confirmButton.onclick()'); check('submitted.length', 1, 'a repeated confirm cannot submit twice');
run('reset(); confirmClaim(0,pay); view.owner[0]=1; confirmButton.onclick()'); check('submitted.length', 0, 'a route taken while reviewing cannot be confirmed');
run('reset(); confirmClaim(0,pay); view.hand.fill(0); confirmButton.onclick()'); check('submitted.length', 0, 'payment is checked again at confirmation');
run('reset(); confirmClaim(0,pay); view.ply++; confirmButton.onclick()'); check('submitted.length', 0, 'stale route confirmation is rejected');
check("ticketCard(0,false,false,false).includes(cityName(M.tickets[0].a)) && ticketCard(0,false,false,false).includes(cityName(M.tickets[0].b))", true, 'ticket endpoint names are readable HTML');
console.log('all ' + checks + ' UI flow checks passed');
