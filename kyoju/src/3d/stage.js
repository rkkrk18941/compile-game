// 3D の侵攻ステージ：世界を組み立て、時間を進め、カメラと画面表示を扱う。
import * as THREE from 'three';
import { Engine, defaultQuality } from './engine.js';
import { SimulationClock } from './performance.js';
import { ContactShadow } from './contact.js';
import { Terrain, makeRiver, makeRoads } from './terrain.js';
import { CameraRig } from './controls.js';
import { groundH, heightAt, landAt, SETTLEMENTS, SETTLE_BY_ID, ROUTE, ROADS, RIVER, KINGDOM, roadDistances, routeProject, riverAt } from './world.js';
import { generateKingdom } from './towns.js';
import { KingdomBuildings } from './buildings.js';
import { Flora } from './flora.js';
import { FX } from './fx.js';
import { Humans, Horses, Machines } from './people.js';
import { Beast3D } from './beast3d.js';
import { BeastAnimator } from './beastanim.js';
import { Sim, STAGE_STOPS } from './sim.js';
import { clamp, lerp, smoothstep } from './noise.js';

const CSS = `
.k3{position:fixed;inset:0;z-index:60;background:#0b0d10;color:#f2ede4;font-family:var(--f-body,system-ui,sans-serif);overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none}
.k3 canvas.k3-gl{position:absolute;inset:0;width:100%;height:100%;display:block}
.k3-load{position:absolute;inset:0;display:grid;place-items:center;background:#0b0d10;z-index:5;text-align:center;padding:24px}
.k3-load b{display:block;font-family:var(--f-display,serif);font-size:22px;letter-spacing:.14em;margin-bottom:10px}
.k3-load .bar{width:min(320px,70vw);height:3px;background:#2a2622;margin:14px auto 0;border-radius:2px;overflow:hidden}
.k3-load .bar i{display:block;height:100%;width:0;background:#c9493b;transition:width .2s}
.k3-top{position:absolute;left:0;right:0;top:0;padding:calc(env(safe-area-inset-top,0px) + 10px) max(12px,env(safe-area-inset-right,0px)) 0 max(12px,env(safe-area-inset-left,0px));display:flex;gap:10px;align-items:flex-start;pointer-events:none;background:linear-gradient(#0009,#0000);padding-bottom:28px}
.k3-where{flex:1;min-width:0}
.k3-where .k{font-family:var(--f-display,serif);font-size:15px;letter-spacing:.12em;text-shadow:0 1px 4px #000}
.k3-where .s{font-size:12px;opacity:.85;margin-top:2px;text-shadow:0 1px 3px #000;font-variant-numeric:tabular-nums}
.k3-hp{margin-top:7px;max-width:340px}
.k3-hp .nm{font-size:12px;display:flex;justify-content:space-between;gap:8px;text-shadow:0 1px 3px #000}
.k3-hp .bar{height:7px;background:#ffffff1f;border-radius:4px;overflow:hidden;margin-top:3px}
.k3-hp .bar i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#8c1d17,#e0533f);transition:width .25s}
.k3-hp .sp{height:2px;background:#ffffff14;margin-top:3px;border-radius:2px;overflow:hidden}
.k3-hp .sp i{display:block;height:100%;width:0;background:#f0c36a}
.k3-mini{pointer-events:auto;position:relative;width:156px;height:104px;border-radius:8px;overflow:hidden;box-shadow:0 2px 10px #0008;border:1px solid #ffffff2a;flex:none;cursor:pointer}
.k3-mini canvas{width:100%;height:100%;display:block}
.k3-stats{position:absolute;right:max(12px,env(safe-area-inset-right,0px));top:calc(env(safe-area-inset-top,0px) + 122px);font-size:12px;text-align:right;line-height:1.55;text-shadow:0 1px 3px #000;pointer-events:none;font-variant-numeric:tabular-nums}
.k3-stats b{font-weight:700;color:#fff}
.k3-cap{position:absolute;left:50%;top:calc(env(safe-area-inset-top,0px) + 92px);transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;width:min(92vw,560px)}
.k3-cap div{background:#0b0d10c0;border:1px solid #ffffff1c;padding:6px 14px;border-radius:16px;font-size:13px;letter-spacing:.04em;transition:opacity .6s,transform .6s;text-align:center}
.k3-cap div.off{opacity:0;transform:translateY(-6px)}
.k3-bot{position:absolute;left:0;right:0;bottom:0;padding:24px max(10px,env(safe-area-inset-right,0px)) calc(env(safe-area-inset-bottom,0px) + 10px) max(10px,env(safe-area-inset-left,0px));display:flex;justify-content:center;gap:6px;flex-wrap:wrap;background:linear-gradient(#0000,#000a)}
.k3-btn{pointer-events:auto;appearance:none;border:1px solid #ffffff2e;background:#16181cd0;color:#f2ede4;font:inherit;font-size:13px;padding:9px 12px;border-radius:10px;min-width:52px;cursor:pointer;letter-spacing:.06em}
.k3-btn.on{background:#c9493b;border-color:#e46a5a;color:#fff}
.k3-btn:focus-visible{outline:2px solid #f0c36a;outline-offset:2px}
.k3-seg{display:flex;gap:0}
.k3-seg .k3-btn{border-radius:0;min-width:46px}
.k3-seg .k3-btn:first-child{border-radius:10px 0 0 10px}
.k3-seg .k3-btn:last-child{border-radius:0 10px 10px 0}
.k3-label{position:absolute;transform:translate(-50%,-100%);pointer-events:auto;cursor:pointer;font-size:12px;white-space:nowrap;text-align:center;text-shadow:0 1px 3px #000,0 0 8px #000;padding-bottom:6px}
.k3-label b{display:block;font-family:var(--f-display,serif);font-size:14px;letter-spacing:.1em}
.k3-label i{font-style:normal;opacity:.85;font-size:11px}
.k3-label::after{content:"";position:absolute;left:50%;bottom:0;width:1px;height:6px;background:#fff8}
.k3-label.fallen b{color:#ff9a80}
.k3-joy{position:absolute;left:max(18px,env(safe-area-inset-left,0px));bottom:calc(env(safe-area-inset-bottom,0px) + 74px);width:120px;height:120px;border-radius:50%;background:#ffffff14;border:1px solid #ffffff30;touch-action:none;pointer-events:auto}
.k3-joy i{position:absolute;left:50%;top:50%;width:48px;height:48px;margin:-24px 0 0 -24px;border-radius:50%;background:#ffffff40}
.k3-hint{position:absolute;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 70px);transform:translateX(-50%);font-size:12px;opacity:.8;text-shadow:0 1px 3px #000;pointer-events:none;text-align:center;width:90vw}
.k3-map{position:absolute;inset:0;background:#0b0d10f2;z-index:4;display:flex;flex-direction:column;padding:calc(env(safe-area-inset-top,0px) + 12px) max(12px,env(safe-area-inset-right,0px)) calc(env(safe-area-inset-bottom,0px) + 12px) max(12px,env(safe-area-inset-left,0px));gap:10px;overflow:auto}
.k3-map h3{margin:0;font-family:var(--f-display,serif);font-size:18px;letter-spacing:.14em;font-weight:700}
.k3-map .row{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start}
.k3-map .cv{flex:1 1 520px;min-width:0;position:relative}
.k3-map canvas{width:100%;height:auto;display:block;border-radius:8px;border:1px solid #ffffff22;cursor:crosshair}
.k3-map table{border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums;min-width:260px}
.k3-map td,.k3-map th{padding:5px 8px;border-bottom:1px solid #ffffff18;text-align:left}
.k3-map th{font-weight:600;opacity:.75;font-size:12px}
.k3-map td.n{text-align:right}
.k3-map .side{flex:0 1 340px;min-width:0}
.k3-map .note{font-size:12px;opacity:.75;line-height:1.6;margin-top:8px}
.k3-fade{position:absolute;inset:0;background:#000;pointer-events:none;opacity:0;transition:opacity 1.2s}
/* Restrained, readable battlefield interface. No flashing film grain or HUD blur. */
.k3{--gold:#d6bc86;--hud:#111719ed}
.k3-top{padding-top:calc(env(safe-area-inset-top,0px) + 22px);padding-left:max(24px,env(safe-area-inset-left,0px));padding-right:max(24px,env(safe-area-inset-right,0px));padding-bottom:60px;background:linear-gradient(#080e13bd,transparent)}
.k3-eyebrow{font:10px system-ui;letter-spacing:.28em;color:var(--gold);margin-bottom:5px}
.k3-where .k{font-size:22px;letter-spacing:.16em}.k3-where .s{margin-top:7px;color:#d1d5cf;font-size:12px}
.k3-hp{max-width:300px;margin-top:15px}.k3-hp .bar{height:4px;border-radius:0;background:#ffffff25}.k3-hp .bar i{background:linear-gradient(90deg,#8e322b,#d27055)}
.k3-hp .nm{font-size:12px;letter-spacing:.04em}.k3-hp .nm span:last-child{color:#d9c69e;font-size:11px}
.k3-mini{width:156px;height:104px;border-radius:2px;border-color:#d6bc8650;box-shadow:0 3px 22px #0005}
.k3-stats{top:calc(env(safe-area-inset-top,0px) + 142px);right:max(24px,env(safe-area-inset-right,0px));font-size:11px;line-height:1.9;color:#d0d4cf}.k3-stats b{font-weight:500;color:#f7e5c0}
.k3-cap{top:calc(env(safe-area-inset-top,0px) + 168px)}.k3-cap div{padding:9px 18px;border-radius:2px;font-size:12px;border-color:#d6bc8633;background:#0d1518d9}
.k3-objective{position:absolute;left:max(24px,env(safe-area-inset-left,0px));bottom:calc(env(safe-area-inset-bottom,0px) + 95px);width:200px;pointer-events:none;text-shadow:0 1px 4px #000}
.k3-objective>span{display:block;font-size:10px;letter-spacing:.16em;color:var(--gold)}.k3-objective>b{display:block;font:16px var(--f-display,serif);letter-spacing:.08em;margin:5px 0 10px}
.k3-objective>i{display:block;height:2px;background:#ffffff30}.k3-objective em{display:block;height:100%;background:var(--gold);width:0;transition:width .3s}
.k3-bot{gap:10px;align-items:center;padding-bottom:calc(env(safe-area-inset-bottom,0px) + 20px);padding-top:45px;background:linear-gradient(transparent,#080e13d9)}
.k3-btn{min-height:42px;border-radius:3px;border-color:#c9b08338;background:var(--hud);font-size:12px;padding:9px 14px;letter-spacing:.04em}
.k3-btn.on{background:#5e4230;border-color:#c6aa70}.k3-btn:hover{border-color:#d6bc86}.k3-seg .k3-btn:first-child,.k3-seg .k3-btn:last-child{border-radius:3px}
.k3-seg .k3-btn{border-color:#c9b08338;min-width:56px}.k3-btn[aria-pressed="true"]{border-color:#d6bc86;color:#e7cb95}
.k3-perf{position:absolute;left:max(24px,env(safe-area-inset-left,0px));bottom:calc(env(safe-area-inset-bottom,0px) + 76px);font:10px ui-monospace,monospace;color:#d5dece;pointer-events:none}
.k3-display{position:absolute;inset:0;z-index:8;display:grid;place-items:center;padding:20px;background:#050b11ae;touch-action:auto}
.k3-display section{width:min(100%,370px);max-height:85dvh;overflow:auto;box-sizing:border-box;padding:22px;background:#11191c;border:1px solid #d6bc8650;box-shadow:0 24px 90px #0009;border-radius:4px}
.k3-display-head{display:flex;align-items:center;justify-content:space-between}.k3-display-head>b{font:20px var(--f-display,serif);letter-spacing:.12em}.k3-display p{font-size:12px;color:#a9b2af;line-height:1.8}
.k3-display label{display:flex;gap:20px;justify-content:space-between;align-items:center;font-size:13px;padding:15px 0;border-bottom:1px solid #ffffff12;cursor:pointer}.k3-display input{accent-color:#c5a86c;width:18px;height:18px;cursor:pointer}
.k3-display [data-action="clean"]{width:100%;margin-top:20px}.k3-display .k3-display-note{font-size:11px;margin-bottom:0}
.k3-return{position:absolute;top:calc(env(safe-area-inset-top,0px) + 15px);right:15px;z-index:7;opacity:.65}
.k3-clean>.k3-top,.k3-clean>.k3-stats,.k3-clean>.k3-cap,.k3-clean>.k3-objective,.k3-clean>.k3-bot,.k3-clean>.k3-label,.k3-clean>.k3-perf,.k3-clean>.k3-hint{display:none}
.k3-joy{bottom:calc(env(safe-area-inset-bottom,0px) + 140px);width:100px;height:100px;background:#0b141a66}
@media(max-width:600px){
 .k3-top{padding:calc(env(safe-area-inset-top,0px) + 14px) 14px 50px}.k3-eyebrow{font-size:8px;letter-spacing:.2em}.k3-where .k{font-size:17px}.k3-where .s{font-size:10px;max-width:235px}.k3-hp{max-width:210px;margin-top:11px}.k3-hp .nm{font-size:11px}.k3-hp .nm span:last-child{font-size:10px}
 .k3-mini{width:96px;height:64px}.k3-stats{right:14px;top:calc(env(safe-area-inset-top,0px) + 88px);font-size:10px;line-height:1.7}
 .k3-cap{top:calc(env(safe-area-inset-top,0px) + 164px);width:90vw}.k3-cap div{font-size:11px;padding:8px 10px}
 .k3-bot{gap:7px;padding:32px 10px calc(env(safe-area-inset-bottom,0px) + 12px)}.k3-seg{flex:1 1 100%;justify-content:center}.k3-seg .k3-btn{flex:1;max-width:110px}.k3-btn{min-height:40px;padding:8px 12px}.k3-bot>.k3-btn{flex:1;max-width:105px}
 .k3-objective{left:14px;bottom:calc(env(safe-area-inset-bottom,0px) + 124px);width:160px}.k3-objective>b{font-size:14px;margin-bottom:7px}.k3-perf{left:14px;bottom:calc(env(safe-area-inset-bottom,0px) + 111px);font-size:9px}
 .k3-hint{bottom:calc(env(safe-area-inset-bottom,0px) + 195px);font-size:11px}
}
@media(max-height:500px) and (min-width:601px){.k3-top{padding-top:12px}.k3-hp{margin-top:9px}.k3-cap{top:110px}.k3-bot{padding-bottom:10px}.k3-stats{top:126px}.k3-objective{bottom:75px}}
@media(prefers-reduced-motion:reduce){.k3 *{transition:none!important}}

`;

export class Stage {
  constructor(opts) {
    this.opts = opts;
    this.root = document.createElement('div');
    this.root.className = 'k3';
    this.root.innerHTML = `<style>${CSS}</style><canvas class="k3-gl" aria-label="${opts.beastName}が王国を蹂躙する光景"></canvas>
      <div class="k3-load"><div><b>アルディナ王国</b><span class="msg">国土を描いています…</span><div class="bar"><i></i></div></div></div>`;
    (opts.parent || document.body).appendChild(this.root);
    this.canvas = this.root.querySelector('canvas');
    this.speed = 1; this.travelK = 1;
    this.mode = 'follow';
    this.running = true;
    this.closed = false;
    this.paused = false; this.travelBoost = true; this.cinematic = false;
    this.simClock = new SimulationClock(1 / 60, 6);
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.showPerf = false;
  }
  async build() {
    const o = this.opts;
    const bar = this.root.querySelector('.k3-load .bar i'), msg = this.root.querySelector('.k3-load .msg');
    const step = async (p, m) => { bar.style.width = p + '%'; if (m) msg.textContent = m; await new Promise((r) => setTimeout(r, 16)); };
    await step(5, '国土を描いています…');
    const q = o.quality || 'auto';
    const engine = (this.engine = new Engine(this.canvas, q));
    engine.setTime(o.startHour || 14);
    this.terrain = new Terrain(engine);
    makeRiver(engine); makeRoads(engine);
    await step(25, '村と町と王都を建てています…');
    this.kingdom = generateKingdom();
    await step(45);
    this.kb = new KingdomBuildings(engine, this.kingdom);
    await step(60, '森を育てています…');
    this.flora = new Flora(engine, engine.q.trees);
    this.fx = new FX(engine);
    this.humans = new Humans(engine, Math.round(engine.q.people * 1.5) + 200);
    this.horses = new Horses(engine, 160);
    this.machines = new Machines(engine);
    await step(72, `${o.beastName}を形づくっています…`);
    this.beast = new Beast3D(engine, o.desc, { cell: engine.q.beastCell });
    engine.scene.add(this.beast.root);
    this.anim = new BeastAnimator(this.beast);
    await step(88, '軍勢が集まっています…');
    this.sim = new Sim({ engine, kingdom: this.kingdom, kb: this.kb, flora: this.flora, fx: this.fx, humans: this.humans, horses: this.horses, machines: this.machines, beast: this.beast, anim: this.anim, stats: o.stats, opts: { cycle: o.cycle || 0, sound: o.sound, beastName: o.beastName, startHour: o.startHour || 14, armyK: o.armyK || 1, startStop: o.startStop || 0, onCaption: (t) => this.caption(t) } });
    this.rig = new CameraRig(engine, this.canvas);
    this.rig.mode = 'follow';
    const P = this.anim.pos;
    this.rig.target.set(P.x, P.y + this.beast.height * 0.5, P.z);
    this.rig.dist = Math.max(160, this.beast.height * 4.1); this.rig.yaw = this.anim.yaw + 2.4; this.rig.pitch = 0.19;
    this.rig.applyCamera();
    this.contact = new ContactShadow(engine, this.beast);
    this.contact.update(this.anim.pos, this.anim.yaw);
    this.rig.onModeBreak = (m) => this.setMode(m);
    this.buildHud();
    await step(90, '周辺の地形を整えています…');
    // Resolve the initial LOD under the loading screen instead of showing a
    // coarse terrain that changes under the streets during the opening shot.
    for (let i = 0; i < 240; i++) {
      const pending = this.terrain.update(engine.camera.position, 5, true, 1);
      this.flora.update(this.rig.target.x, this.rig.target.z);
      if (pending === 0 && !this.flora.pending) break;
      if (i % 4 === 0) await step(90 + Math.min(7, i / 28), '周辺の地形を整えています…');
    }
    await step(98, '描画を準備しています…');
    if (engine.renderer.compileAsync) await engine.renderer.compileAsync(engine.scene, engine.camera);
    this.sim.draw(); engine.render(0);
    await step(100, '');
    this.root.querySelector('.k3-load').remove();
    this.last = performance.now();
    this.caption(o.startStop ? `${o.beastName}がアルディナ王国の街道に現れた` : `${o.beastName}がグラウ峠を越え、アルディナ王国に侵入した`);
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    this.onResize = () => this.engine.resize();
    window.addEventListener('resize', this.onResize);
    this.onVisibility = () => {
      this.last = performance.now(); this.simClock.reset(); this.engine.budget.reset();
      this.rig.keys.clear(); this.joyState.x = this.joyState.y = 0;
    };
    document.addEventListener('visibilitychange', this.onVisibility);
    engine.onLost = () => {
      this.contextNotice = document.createElement('div'); this.contextNotice.className = 'k3-load';
      this.contextNotice.innerHTML = '<div><b>描画を復旧しています</b><p>戦闘は一時停止しています。</p><button class="k3-btn">撤退する</button></div>';
      this.contextNotice.querySelector('button').onclick = () => { this.retreat(); this.sim.done.t = 0; if (!this.ended) { this.ended = true; this.finish(); } this.contextNotice.remove(); };
      this.root.appendChild(this.contextNotice);
    };
    engine.onRestored = () => { this.contextNotice?.remove(); this.onVisibility(); };

    return this;
  }
  /* ---------- 画面表示 ---------- */
  buildHud() {
    const o = this.opts;
    const el = document.createElement('div');
    el.innerHTML = `
      <div class="k3-top">
        <div class="k3-where"><div class="k3-eyebrow">KINGDOM OF ALDINA</div><div class="k">アルディナ王国</div><div class="s" data-k="where"></div>
          <div class="k3-hp"><div class="nm"><span>${esc(o.beastName)}</span><span data-k="hpn"></span></div><div class="bar"><i data-k="hp"></i></div><div class="sp"><i data-k="sp"></i></div></div></div>
        <div class="k3-mini" data-k="mini" role="button" tabindex="0" aria-label="国土図を開く"><canvas width="312" height="208"></canvas></div>
      </div>
      <div class="k3-stats" data-k="stats"></div>
      <div class="k3-objective"><span>侵攻目標</span><b data-k="objective">街道を進め</b><i><em data-k="progress"></em></i></div>
      <div class="k3-perf" data-k="perf" hidden></div>
      <div class="k3-cap" data-k="cap" aria-live="polite"></div>
      <div class="k3-hint" data-k="hint"></div>
      <div class="k3-bot">
        <div class="k3-seg" role="group" aria-label="視点">
          <button class="k3-btn" data-m="map">俯瞰</button><button class="k3-btn on" data-m="follow">追跡</button><button class="k3-btn" data-m="resident">住民</button><button class="k3-btn" data-m="beast">巨獣</button>
        </div>
        <button class="k3-btn" data-k="pause" aria-label="一時停止" aria-pressed="false">一時停止</button>
        <button class="k3-btn" data-k="speed" aria-label="速さ">×1</button>
        <button class="k3-btn" data-k="display">画面</button>
        <button class="k3-btn" data-k="exit">撤退</button>
      </div>
      <button class="k3-btn k3-return" data-k="return" hidden>操作を表示</button>
      <div class="k3-joy" data-k="joy" hidden><i></i></div>
      <div class="k3-fade" data-k="fade"></div>`;
    while (el.firstChild) this.root.appendChild(el.firstChild);
    const $ = (k) => this.root.querySelector(`[data-k="${k}"]`);
    this.ui = { where: $('where'), hp: $('hp'), hpn: $('hpn'), sp: $('sp'), stats: $('stats'), cap: $('cap'), mini: $('mini'), hint: $('hint'), joy: $('joy'), fade: $('fade'), speed: $('speed'), pause: $('pause'), perf: $('perf'), objective: $('objective'), progress: $('progress') };
    this.root.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => this.setMode(b.dataset.m)));
    $('speed').addEventListener('click', () => { this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 4 : 1; $('speed').textContent = '×' + this.speed; });
    $('pause').addEventListener('click', () => this.togglePause());
    $('display').addEventListener('click', () => this.openDisplay());
    $('return').addEventListener('click', () => { this.root.classList.remove('k3-clean'); $('return').hidden = true; });
    this.ui.mini.addEventListener('click', () => this.openMap());
    this.ui.mini.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') this.openMap(); });
    $('exit').addEventListener('click', () => this.retreat());
    // 集落の名札
    this.labels = SETTLEMENTS.map((s) => {
      const d = document.createElement('div');
      d.className = 'k3-label';
      d.innerHTML = `<b>${esc(s.short)}</b><i></i>`;
      d.addEventListener('click', () => { this.setMode('map'); this.rig.flyTo(s.x, s.z, s.kind === 'capital' ? 2600 : s.kind === 'town' ? 1100 : 700, 0.75); });
      this.root.appendChild(d);
      return { s, el: d, i: d.querySelector('i') };
    });
    this.miniBase = this.drawCountry(156, 104, 2);
    this.joyState = { x: 0, y: 0, id: null };
    const joy = this.ui.joy;
    joy.addEventListener('pointerdown', (e) => { this.joyState.id = e.pointerId; joy.setPointerCapture(e.pointerId); this.joyMove(e); e.stopPropagation(); });
    joy.addEventListener('pointermove', (e) => { if (e.pointerId === this.joyState.id) this.joyMove(e); });
    const end = () => { this.joyState.id = null; this.joyState.x = 0; this.joyState.y = 0; joy.firstChild.style.transform = ''; };
    joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
  }
  togglePause() {
    this.paused = !this.paused; this.simClock.reset();
    this.ui.pause.textContent = this.paused ? '再開' : '一時停止';
    this.ui.pause.setAttribute('aria-pressed', String(this.paused));
    this.ui.pause.setAttribute('aria-label', this.paused ? '再開' : '一時停止');
  }
  openDisplay() {
    if (this.displayEl) return;
    const panel = document.createElement('div'); panel.className = 'k3-display';
    panel.innerHTML = `<section role="dialog" aria-modal="true" aria-label="画面設定"><div class="k3-display-head"><b>画面設定</b><button class="k3-btn" data-action="close" aria-label="閉じる">×</button></div>
      <p>端末の負荷に合わせて描画を調整します。</p>
      <label><span>解像度を自動調整</span><input type="checkbox" data-setting="auto" ${this.engine.autoResolution ? 'checked' : ''}></label>
      <label><span>画面を揺らす</span><input type="checkbox" data-setting="shake" ${this.rig.shakeScale ? 'checked' : ''}></label>
      <label><span>街道で移動を早める</span><input type="checkbox" data-setting="travel" ${this.travelBoost ? 'checked' : ''}></label>
      <label><span>フレームレートを表示</span><input type="checkbox" data-setting="perf" ${this.showPerf ? 'checked' : ''}></label>
      <label><span>ゆっくり周回するカメラ</span><input type="checkbox" data-setting="cinema" ${this.cinematic ? 'checked' : ''}></label>
      <button class="k3-btn" data-action="clean">操作表示を隠す</button>
      <p class="k3-display-note">画質：${{low:'軽量',std:'標準',high:'高画質'}[this.engine.qname]}・高画質への変更は育成画面の設定から。</p></section>`;
    const close = () => { panel.remove(); this.displayEl = null; this.ui.pause.focus(); };
    panel.addEventListener('click', (e) => {
      if (e.target === panel || e.target.closest('[data-action="close"]')) close();
      if (e.target.closest('[data-action="clean"]')) { close(); this.root.classList.add('k3-clean'); this.root.querySelector('[data-k="return"]').hidden = false; }
    });
    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') {
        const items = [...panel.querySelectorAll('button,input')], first = items[0], last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    panel.addEventListener('change', (e) => {
      const k = e.target.dataset.setting, on = e.target.checked;
      if (k === 'auto') { this.engine.autoResolution = on; this.engine.budget.reset(); if (!on) { this.engine.budget.ratio = this.engine.budget.maxRatio; this.engine.resize(); } }
      if (k === 'shake') this.rig.shakeScale = on ? 0.35 : 0;
      if (k === 'travel') this.travelBoost = on;
      if (k === 'perf') { this.showPerf = on; this.ui.perf.hidden = !on; }
      if (k === 'cinema') this.cinematic = on;
    });
    this.root.appendChild(panel); this.displayEl = panel;
    panel.querySelector('button').focus();
  }
  joyMove(e) {
    const r = this.ui.joy.getBoundingClientRect();
    let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    this.joyState.x = x; this.joyState.y = y;
    this.ui.joy.firstChild.style.transform = `translate(${x * 36}px,${y * 36}px)`;
  }
  caption(text) {
    const cap = this.ui && this.ui.cap;
    if (!cap) return;
    const d = document.createElement('div');
    d.textContent = text;
    cap.appendChild(d);
    while (cap.children.length > 3) cap.firstChild.remove();
    setTimeout(() => { d.classList.add('off'); setTimeout(() => d.remove(), 700); }, 4200);
  }
  setMode(m) {
    if (m === this.mode && m !== 'resident') return;
    const prev = this.mode;
    this.mode = m;
    this.root.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
    const rig = this.rig;
    this.ui.joy.hidden = m !== 'resident' || !matchMedia('(pointer:coarse)').matches;
    if (m === 'map' || m === 'follow') {
      if (prev === 'resident' || prev === 'beast') {
        const P = this.anim.pos;
        rig.target.set(P.x, P.y + 20, P.z); rig.dist = 320; rig.pitch = 0.35; rig.yaw = this.anim.yaw + 2.4;
      }
      rig.setMode(m);
      this.ui.hint.textContent = m === 'map' ? 'ドラッグで移動・ピンチやホイールで拡大縮小・二本指で回転と傾き' : '';
    } else if (m === 'beast') {
      rig.setMode('beast');
      rig.fp.fov = 72;
      this.ui.hint.textContent = 'ドラッグで見回す';
    } else if (m === 'resident') {
      rig.setMode('resident');
      rig.fp.fov = 70;
      this.spawnPlayer();
      this.ui.hint.textContent = matchMedia('(pointer:coarse)').matches ? '左下で歩く・ドラッグで見回す' : 'WASD で歩く（Shift で走る）・ドラッグで見回す';
    }
    setTimeout(() => { if (this.ui.hint.textContent && this.mode === m) this.ui.hint.textContent = ''; }, 6000);
  }
  // 住民として降り立つ：巨獣が向かう先の集落の通りへ
  spawnPlayer() {
    const sim = this.sim, P = this.anim.pos;
    let T = sim.nextStop() || sim.towns[0];
    const w = sim.where();
    if (w.T && w.d < 700) T = w.T;
    const nodes = sim.townNodes(T);
    let best = null, bs = 1e9;
    const want = Math.max(140, Math.min(380, Math.hypot(T.s.x - P.x, T.s.z - P.z) * 0.5));
    for (const n of nodes) { const d = Math.abs(Math.hypot(n.x - P.x, n.z - P.z) - want) + Math.random() * 40; if (d < bs) { bs = d; best = n; } }
    if (!best) best = { x: T.s.x, z: T.s.z };
    this.player = { x: best.x, z: best.z, yaw: Math.atan2(best.x - P.x, best.z - P.z), alive: true, bob: 0, T };
    this.rig.fp.yaw = 0; this.rig.fp.pitch = 0.12;
    this.caption(`${T.s.short}の住民になった`);
  }
  updatePlayer(dt) {
    const pl = this.player; if (!pl) return;
    const k = this.rig.keys, j = this.joyState;
    let fwd = 0, side = 0;
    if (k.has('w') || k.has('arrowup')) fwd += 1; if (k.has('s') || k.has('arrowdown')) fwd -= 1;
    if (k.has('a') || k.has('arrowleft')) side -= 1; if (k.has('d') || k.has('arrowright')) side += 1;
    fwd -= j.y; side += j.x;
    const run = k.has('shift') || Math.hypot(j.x, j.y) > 0.85;
    const look = this.lookYaw || 0;
    const sp = (run ? 5.2 : 1.6) * Math.min(1, Math.hypot(fwd, side));
    if (sp > 0) {
      const a = Math.atan2(side, fwd);
      const dir = look + Math.PI - a; // カメラの向き基準
      const nx = pl.x + Math.sin(dir) * sp * dt, nz = pl.z + Math.cos(dir) * sp * dt;
      // 家にはぶつかる
      let ok = true;
      for (const b of this.sim.grid.query(nx, nz, 14, [])) {
        if (b.kind !== 'house' && b.kind !== 'landmark' && b.kind !== 'wall' && b.kind !== 'tower') continue;
        if (b.state >= 2) continue;
        const r = b.kind === 'house' ? Math.min(b.w, b.d) * 0.5 : b.kind === 'wall' ? 0 : (b.r || 4) * 0.7;
        if (r > 0 && Math.hypot(nx - b.x, nz - b.z) < r + 0.3) { ok = false; break; }
      }
      if (ok) { pl.x = nx; pl.z = nz; pl.bob += dt * (run ? 11 : 6); }
    }
    // 巨獣に踏まれたら
    for (const L of this.anim.legs) {
      if (!L.swing && Math.hypot(L.plant.x - pl.x, L.plant.z - pl.z) < this.anim.footR * 1.05) { this.playerDied('踏み潰された'); return; }
    }
    if (this.sim.killedPlayerAt && Math.hypot(this.sim.killedPlayerAt.x - pl.x, this.sim.killedPlayerAt.z - pl.z) < this.sim.killedPlayerAt.r) { this.sim.killedPlayerAt = null; this.playerDied('巻き込まれた'); }
  }
  playerDied(how) {
    this.caption(`あなたは${how}。別の住民の目を借りる`);
    this.ui.fade.style.opacity = 1;
    setTimeout(() => { this.ui.fade.style.opacity = 0; if (this.mode === 'resident') this.spawnPlayer(); }, 1300);
    this.player = null;
  }
  retreat() {
    if (this.sim.done) return;
    this.sim.done = { reason: 'retreat', t: 0.6 };
    this.caption(`${this.opts.beastName}を魔界へ呼び戻した`);
  }
  /* ---------- 国土図 ---------- */
  drawCountry(w, h, dpr) {
    const cv = document.createElement('canvas');
    cv.width = w * dpr; cv.height = h * dpr;
    const g = cv.getContext('2d');
    const bd = KINGDOM.bounds;
    const W = cv.width, H = cv.height;
    const img = g.createImageData(W, H);
    const L = [0, 0, 0, 0];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const x = bd.minX + (i + 0.5) / W * (bd.maxX - bd.minX), z = bd.minZ + (j + 0.5) / H * (bd.maxZ - bd.minZ);
      const hgt = heightAt(x, z);
      const hx = heightAt(x + 200, z) - hgt;
      landAt(x, z, hgt, L);
      let r = 0.5, gg = 0.56, b = 0.36;
      r = lerp(r, 0.68, L[1]); gg = lerp(gg, 0.64, L[1]); b = lerp(b, 0.4, L[1]);
      r = lerp(r, 0.2, L[0]); gg = lerp(gg, 0.33, L[0]); b = lerp(b, 0.2, L[0]);
      const rock = smoothstep(700, 1100, hgt); r = lerp(r, 0.55, rock); gg = lerp(gg, 0.53, rock); b = lerp(b, 0.5, rock);
      const snow = smoothstep(1350, 1600, hgt); r = lerp(r, 0.92, snow); gg = lerp(gg, 0.93, snow); b = lerp(b, 0.95, snow);
      const shade = clamp(1 - hx * 0.012, 0.55, 1.3);
      const k = (j * W + i) * 4;
      img.data[k] = clamp(r * shade * 255, 0, 255); img.data[k + 1] = clamp(gg * shade * 255, 0, 255); img.data[k + 2] = clamp(b * shade * 255, 0, 255); img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const X = (x) => (x - bd.minX) / (bd.maxX - bd.minX) * W, Z = (z) => (z - bd.minZ) / (bd.maxZ - bd.minZ) * H;
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = '#3d6f9c'; g.lineWidth = Math.max(1.2, dpr * 1.2);
    g.beginPath(); RIVER.pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Z(p[1])) : g.moveTo(X(p[0]), Z(p[1])))); g.stroke();
    for (const r of ROADS) {
      g.strokeStyle = r.kind === 'main' ? '#e8d7ae' : '#cdbf9c'; g.lineWidth = (r.kind === 'main' ? 1.3 : 0.8) * dpr;
      g.beginPath(); r.pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Z(p[1])) : g.moveTo(X(p[0]), Z(p[1])))); g.stroke();
    }
    return { cv, X, Z };
  }
  drawMini() {
    const cv = this.ui.mini.firstChild, g = cv.getContext('2d');
    const base = this.miniBase;
    g.drawImage(base.cv, 0, 0, cv.width, cv.height);
    const sx = cv.width / base.cv.width;
    const X = (x) => base.X(x) * sx, Z = (z) => base.Z(z) * sx;
    const prog = this.sim.progress();
    for (const s of SETTLEMENTS) {
      const p = prog[s.id];
      g.fillStyle = p && p.fallen ? '#ff7a5c' : p && p.destr > 0.02 ? '#ffb070' : '#ffffff';
      g.beginPath(); g.arc(X(s.x), Z(s.z), s.kind === 'capital' ? 5 : s.kind === 'town' ? 4 : 3, 0, Math.PI * 2); g.fill();
    }
    const P = this.anim.pos;
    g.fillStyle = '#ff2a2a'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(X(P.x), Z(P.z), 5, 0, Math.PI * 2); g.fill(); g.stroke();
    const c = this.engine.camera.position;
    const fwd = new THREE.Vector3(); this.engine.camera.getWorldDirection(fwd);
    const a = Math.atan2(fwd.x, fwd.z);
    g.strokeStyle = '#ffffffcc'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(X(c.x), Z(c.z)); g.lineTo(X(c.x) + Math.sin(a - 0.4) * 14, Z(c.z) + Math.cos(a - 0.4) * 14); g.moveTo(X(c.x), Z(c.z)); g.lineTo(X(c.x) + Math.sin(a + 0.4) * 14, Z(c.z) + Math.cos(a + 0.4) * 14); g.stroke();
  }
  openMap() {
    if (this.mapEl) return;
    const el = document.createElement('div');
    el.className = 'k3-map';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'アルディナ王国の国土図');
    const dist = roadDistances();
    const P = this.anim.pos;
    const pr = routeProject(P.x, P.z);
    const rows = dist.map((d) => `<tr><td>${esc(d.from.name)} → ${esc(d.to.name)}${d.side ? '<small style="opacity:.7">（脇道）</small>' : ''}</td><td class="n">${d.km.toFixed(1)} km</td><td class="n">${fmtH(d.km / 4.5)}</td><td class="n">${fmtH(d.km / 14)}</td></tr>`).join('');
    const prog = this.sim.progress();
    const stops = ROUTE.stops.map((st) => {
      const s = SETTLE_BY_ID[st.id], p = prog[st.id];
      const left = (st.s - pr.s) / 1000;
      return `<tr><td>${esc(s.name)}</td><td class="n">${left > 0.05 ? left.toFixed(1) + ' km' : '—'}</td><td class="n">${p ? Math.round(p.destr * 100) + '%' : ''}${p && p.fallen ? ' 壊滅' : ''}</td><td class="n">${s.pop.toLocaleString()}人</td></tr>`;
    }).join('');
    el.innerHTML = `<div class="row" style="justify-content:space-between;align-items:center"><h3>アルディナ王国　国土図</h3><button class="k3-btn" data-x="close">閉じる</button></div>
      <div class="row"><div class="cv"><canvas width="1040" height="680" aria-label="国土の地図。地名を押すとその場所へ移動する"></canvas></div>
      <div class="side"><table><thead><tr><th>街道</th><th class="n">距離</th><th class="n">徒歩</th><th class="n">早馬</th></tr></thead><tbody>${rows}</tbody></table>
      <table style="margin-top:12px"><thead><tr><th>巨獣の行く手</th><th class="n">残り</th><th class="n">壊滅率</th><th class="n">人口</th></tr></thead><tbody>${stops}</tbody></table>
      <p class="note">国土は東西 ${((KINGDOM.bounds.maxX - KINGDOM.bounds.minX) / 1000).toFixed(0)} km・南北 ${((KINGDOM.bounds.maxZ - KINGDOM.bounds.minZ) / 1000).toFixed(0)} km。距離は街道に沿って測った実距離で、徒歩は時速 4.5 km、早馬は時速 14 km で計算している。地図の地名を押すと、その場所へ視点が飛ぶ。</p></div></div>`;
    this.root.appendChild(el);
    this.mapEl = el;
    el.querySelector('[data-x="close"]').addEventListener('click', () => this.closeMap());
    const cv = el.querySelector('canvas');
    const draw = () => {
      if (!this.bigMap) this.bigMap = this.drawCountry(520, 340, 2);
      const g = cv.getContext('2d');
      const b = this.bigMap;
      g.drawImage(b.cv, 0, 0, cv.width, cv.height);
      const sx = cv.width / b.cv.width;
      const X = (x) => b.X(x) * sx, Z = (z) => b.Z(z) * sx;
      // 道のりの目盛り（5 km ごと）
      g.fillStyle = '#fff';
      for (let s = 5000; s < ROUTE.length; s += 5000) {
        let lo = 0; while (lo < ROUTE.cum.length - 1 && ROUTE.cum[lo + 1] < s) lo++;
        const a = ROUTE.pts[lo], c = ROUTE.pts[Math.min(lo + 1, ROUTE.pts.length - 1)];
        const t = (s - ROUTE.cum[lo]) / Math.max(1, ROUTE.cum[lo + 1] - ROUTE.cum[lo]);
        const x = X(lerp(a[0], c[0], t)), z = Z(lerp(a[1], c[1], t));
        g.beginPath(); g.arc(x, z, 3, 0, Math.PI * 2); g.fill();
        g.font = '600 15px system-ui'; g.fillStyle = '#fffd'; g.fillText(`${s / 1000}km`, x + 6, z - 6); g.fillStyle = '#fff';
      }
      for (const s of SETTLEMENTS) {
        const p = prog[s.id];
        const x = X(s.x), z = Z(s.z);
        g.fillStyle = p && p.fallen ? '#ff7a5c' : '#ffffff'; g.strokeStyle = '#000'; g.lineWidth = 2;
        g.beginPath(); g.arc(x, z, s.kind === 'capital' ? 10 : s.kind === 'town' ? 8 : 6, 0, Math.PI * 2); g.fill(); g.stroke();
        g.font = `700 ${s.kind === 'village' ? 20 : 24}px ${getComputedStyle(this.root).fontFamily}`;
        g.lineWidth = 4; g.strokeStyle = '#000a'; g.strokeText(s.short, x + 12, z + 7); g.fillStyle = '#fff'; g.fillText(s.short, x + 12, z + 7);
      }
      g.font = '600 18px system-ui'; g.fillStyle = '#fff';
      const pt = KINGDOM.portal; g.fillText('▲ ' + pt.name, X(pt.x) - 30, Z(pt.z) - 10);
      const P2 = this.anim.pos;
      g.fillStyle = '#ff2a2a'; g.beginPath(); g.arc(X(P2.x), Z(P2.z), 9, 0, Math.PI * 2); g.fill(); g.stroke();
      // 縮尺
      const km = cv.width / ((KINGDOM.bounds.maxX - KINGDOM.bounds.minX) / 1000);
      g.fillStyle = '#fff'; g.fillRect(20, cv.height - 26, km * 5, 4); g.font = '600 15px system-ui'; g.fillText('5 km', 20, cv.height - 32);
      this.mapXZ = { X, Z, sx };
    };
    draw();
    cv.addEventListener('click', (e) => {
      const r = cv.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width * cv.width, pz = (e.clientY - r.top) / r.height * cv.height;
      let best = null, bd = 40;
      for (const s of SETTLEMENTS) { const d = Math.hypot(this.mapXZ.X(s.x) - px, this.mapXZ.Z(s.z) - pz); if (d < bd) { bd = d; best = s; } }
      const bdN = KINGDOM.bounds;
      const x = best ? best.x : bdN.minX + px / cv.width * (bdN.maxX - bdN.minX), z = best ? best.z : bdN.minZ + pz / cv.height * (bdN.maxZ - bdN.minZ);
      this.closeMap();
      this.setMode('map');
      this.rig.target.set(x, groundH(x, z), z);
      this.rig.dist = best ? (best.kind === 'capital' ? 2600 : best.kind === 'town' ? 1100 : 700) : 1800; this.rig.pitch = 0.7;
    });
  }
  closeMap() { if (this.mapEl) { this.mapEl.remove(); this.mapEl = null; } }
  /* ---------- 毎フレーム ---------- */
  loop(now) {
    if (this.closed) return;
    this.raf = requestAnimationFrame(this.loop);
    const rawDt = (now - this.last) / 1000;
    this.last = now;
    if (!this.running || document.hidden || this.engine.contextLost) return;
    const dt = Math.min(0.08, Math.max(0, rawDt));
    if (!this.displayEl) this.engine.measure(rawDt);
    this.frame(dt);
  }
  frame(dt) {
    const sim = this.sim, an = this.anim;
    const near = sim.units.some((u) => u.alive && u.active && Math.hypot(u.x - an.pos.x, u.z - an.pos.z) < 1500);
    const w = sim.where();
    const travel = this.travelBoost && sim.ai.mode === 'march' && !near && w.d > 900 && !an.dead && !sim.done && this.mode !== 'resident';
    this.travelK = lerp(this.travelK, travel ? 6 : 1, 1 - Math.exp(-dt * (travel ? 0.8 : 3)));
    const total = this.paused || this.displayEl ? 0 : this.simClock.advance(dt * this.speed * this.travelK, (step) => sim.update(step));
    this.kb.update(total);
    this.fx.update(total);
    // 終わり
    if (sim.done && sim.done.t <= 0 && !this.ended) { this.ended = true; this.finish(); }
    // カメラ
    const rig = this.rig;
    if (this.cinematic && !this.reducedMotion && this.mode === 'follow' && !rig.ptrs.size && performance.now() - rig.lastInput > 4000 && !this.displayEl) rig.yaw += dt * 0.035;
    if (sim.shake > 0.01) rig.shake = Math.max(rig.shake, sim.shake);
    const P = an.pos;
    if (this.mode === 'beast') {
      const hw = an.W[an.iHead];
      const eye = an.jointWorld(an.iHead, new THREE.Vector3());
      const D = an.headDirW;
      eye.addScaledVector(D, an.headLen * 1.05).add(new THREE.Vector3(0, an.headLen * 0.3 + 2.5 * an.sF, 0));
      rig.update(dt, { eye, baseYaw: Math.atan2(D.x, D.z) + Math.PI, basePitch: clamp(Math.asin(clamp(D.y, -1, 1)) * 0.5 - 0.18, -0.7, 0.15) });
    } else if (this.mode === 'resident') {
      if (this.player) {
        if (!this.paused && !this.displayEl) this.updatePlayer(dt);
        const pl = this.player;
        if (pl) {
          const eye = new THREE.Vector3(pl.x, groundH(pl.x, pl.z) + 1.62 + Math.sin(pl.bob) * 0.04, pl.z);
          // 最初は巨獣の方を向く
          const toB = Math.atan2(P.x - pl.x, P.z - pl.z) + Math.PI;
          if (pl.face == null) pl.face = toB;
          rig.update(dt, { eye, baseYaw: pl.face, basePitch: 0.1 });
          rig.fp.idle = 0;
          this.lookYaw = pl.face + rig.fp.yaw;
        }
      }
    } else {
      // 追跡中、町なかでは家に隠れないよう少し見下ろす
      if (this.mode === 'follow' && !rig.ptrs.size) { const inTown = this.sim.where().d < 0; if (inTown && rig.pitch < 0.32) rig.pitch += (0.32 - rig.pitch) * Math.min(1, dt * 0.8); }
      rig.update(dt, { follow: this.mode === 'follow' ? { x: P.x, y: P.y + this.beast.height * 0.45, z: P.z } : null });
    }
    // 地形・森・影
    const cam = this.engine.camera.position;
    this.terrain.update(cam, this.engine.q.terrainBudget, false, dt);
    const ft = this.mode === 'map' || this.mode === 'follow' ? rig.target : cam;
    // 高い所からは木は見分けられないので置かず、地面の樹冠の模様だけにする
    const camAlt = cam.y - groundH(cam.x, cam.z);
    if (camAlt > 1700) { if (!this.floraOff) { this.floraOff = true; this.flora.update(ft.x, ft.z, true, 1); } }
    else if (this.floraOff) { this.floraOff = false; this.flora.update(ft.x, ft.z, true, 1100); }
    else this.flora.update(ft.x, ft.z, false);
    const alt = cam.y - groundH(cam.x, cam.z);
    this.engine.haze = clamp(sim.burning.size / 120, 0, 0.6);
    if (Math.abs(this.engine.hours - sim.clock) > 0.000001) this.engine.setTime(sim.clock);
    this.engine.updateShadow(this.mode === 'map' || this.mode === 'follow' ? rig.target : cam, clamp(this.mode === 'map' || this.mode === 'follow' ? rig.dist * 0.8 : 220, 120, 900));
    this.contact.update(P, an.yaw);
    sim.draw();
    this.engine.render(this.paused || this.displayEl ? 0 : dt);
    // 画面の文字（毎フレームでなくてよい）
    this.hudT = (this.hudT || 0) - dt;
    if (this.hudT <= 0) { this.hudT = 0.25; this.updateHud(); }
    this.updateLabels(alt);
  }
  updateHud() {
    const sim = this.sim, ui = this.ui, an = this.anim;
    const B = sim.B;
    ui.hp.style.width = (B.hp / B.max * 100).toFixed(1) + '%';
    ui.hpn.textContent = `${Math.ceil(B.hp).toLocaleString()} / ${Math.round(B.max).toLocaleString()}`;
    const next = sim.nextStop();
    ui.objective.textContent = next ? next.s.name : '王国の抵抗を退けよ';
    const prg = routeProject(an.pos.x, an.pos.z);
    ui.progress.style.width = (clamp(prg.s / (ROUTE.stops.at(-1)?.s || 1), 0, 1) * 100).toFixed(1) + '%';
    if (this.showPerf) ui.perf.textContent = `${this.engine.budget.fps} FPS · ${this.engine.renderer.domElement.width} × ${this.engine.renderer.domElement.height} · ${this.engine.renderer.info.render.calls} draws`;
    ui.sp.style.width = clamp(1 - sim.ai.cd.special / 22, 0, 1) * 100 + '%';
    const P = an.pos;
    const w = sim.where();
    const T = sim.nextStop();
    const pr = routeProject(P.x, P.z);
    const h = Math.floor(sim.clock), m = Math.floor((sim.clock - h) * 60);
    let place = w.d < 0 ? `${w.T.s.name}` : w.d < 1200 ? `${w.T.s.short}近郊` : '街道';
    if (T) { const st = ROUTE.stops.find((q) => q.id === T.s.id); const left = Math.max(0, (st.s - pr.s) / 1000); place += left > 0.3 ? `　${T.s.short}まで ${left.toFixed(1)} km` : ''; }
    ui.where.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}　${place}${this.travelK > 2 ? '　（早回し）' : ''}`;
    const sc = sim.score;
    const kok = this.estimateKokurui();
    ui.stats.innerHTML = `壊した建物 <b>${sc.bld.toLocaleString()}</b> 棟<br>犠牲 <b>${sc.dead.toLocaleString()}</b> 人<br>退けた兵 <b>${sc.soldiers.toLocaleString()}</b><br>黒涙 <b>+${kok.toLocaleString()}</b>`;
    this.drawMini();
  }
  estimateKokurui() {
    const sim = this.sim, cyc = this.opts.cycle || 0;
    let k = 0;
    for (const T of sim.towns) { const d = T.total ? T.destroyed / T.total : 0; k += 200 * Math.pow(T.D, 1.25) * (1 + 0.6 * cyc) * d; }
    k += sim.score.soldiers * 2 + sim.score.machines * 25 + sim.score.dead * 0.05;
    return Math.round(k);
  }
  updateLabels(alt) {
    const cam = this.engine.camera;
    const show = this.mode === 'map' || this.mode === 'follow';
    const prog = this.labelProg && this.hudT > 0.2 ? this.labelProg : (this.labelProg = this.sim.progress());
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    const v = new THREE.Vector3();
    const placed = [];
    const camAlt = alt;
    const order = this.labelOrder || (this.labelOrder = this.labels.slice().sort((a, b) => (b.s.kind === 'capital') - (a.s.kind === 'capital') || (b.s.kind === 'town') - (a.s.kind === 'town')));
    for (const L of order) {
      const s = L.s;
      const d = cam.position.distanceTo(v.set(s.x, groundH(s.x, s.z), s.z));
      const maxD = Math.max(9000, camAlt * 14) * (s.kind === 'capital' ? 2 : s.kind === 'town' ? 1.4 : 1);
      let vis = show && d > (s.kind === 'capital' ? 1800 : 700) && d < maxD;
      if (vis) {
        const q = v.clone(); q.y += s.kind === 'capital' ? 120 : 60; q.project(cam);
        const sx = (q.x + 1) / 2 * W, sy = (1 - q.y) / 2 * H;
        if (placed.some((p) => Math.abs(p[0] - sx) < 80 && Math.abs(p[1] - sy) < 30)) vis = false; else placed.push([sx, sy]);
      }
      if (!vis) { if (L.shown !== false) { L.el.style.display = 'none'; L.shown = false; } continue; }
      v.y += s.kind === 'capital' ? 120 : 60;
      v.project(cam);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) { if (L.shown !== false) { L.el.style.display = 'none'; L.shown = false; } continue; }
      if (L.shown !== true) { L.el.style.display = ''; L.shown = true; }
      L.el.style.left = ((v.x + 1) / 2 * W).toFixed(1) + 'px';
      L.el.style.top = ((1 - v.y) / 2 * H).toFixed(1) + 'px';
      const p = prog[s.id];
      const txt = p && p.fallen ? '壊滅' : p && p.destr > 0.01 ? `${Math.round(p.destr * 100)}% 破壊` : `${s.pop.toLocaleString()}人`;
      if (L.txt !== txt) { L.i.textContent = txt; L.txt = txt; L.el.classList.toggle('fallen', !!(p && p.fallen)); }
    }
  }
  /* ---------- 終了 ---------- */
  finish() {
    const sim = this.sim;
    const res = {
      reason: sim.done.reason,
      bld: sim.score.bld, dead: sim.score.dead, soldiers: sim.score.soldiers, machines: sim.score.machines,
      progress: sim.progress(), fallen: sim.score.fallen.slice(), kokurui: this.estimateKokurui(),
      lastBlow: sim.lastBlow || null, hpLeft: sim.B.hp / sim.B.max, time: sim.time,
    };
    res.xp = Math.round(30 + sim.score.value * 0.45 + sim.score.soldiers * 1.0 + res.fallen.length * 50);
    if (this.opts.onEnd) this.opts.onEnd(res, this);
  }
  // 結果を閉じて景色を眺める。戻るボタンを出す
  showFinish(back) {
    const b = document.createElement('button');
    b.className = 'k3-btn on';
    b.textContent = '結果に戻る';
    b.style.cssText = 'position:absolute;right:max(12px,env(safe-area-inset-right,0px));bottom:calc(env(safe-area-inset-bottom,0px) + 64px);z-index:5';
    b.addEventListener('click', () => { b.remove(); back(); });
    this.root.appendChild(b);
  }
  close() {
    this.closed = true;
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('resize', this.onResize);
    if (this.rig) this.rig.unbind();
    try { this.engine.dispose(); } catch (e) { /* 片付けの失敗は無視 */ }
    this.root.remove();
  }
}
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtH(h) { const H = Math.floor(h), M = Math.round((h - H) * 60); return H ? `${H}時間${M ? M + '分' : ''}` : `${M}分`; }

/* ---------- 外から呼ぶ入口 ---------- */
export async function startStage(opts) {
  const st = new Stage(opts);
  try { await st.build(); return st; } catch (error) { st.close(); throw error; }
}
