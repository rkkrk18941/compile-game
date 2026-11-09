// The・Island game controller.
import * as THREE from "three";
import { G } from "../gfx/shaderlib.js";
import { Terrain } from "../world/terrain.js";
import { Ocean } from "../world/ocean.js";
import { loadLayers } from "../world/layers.js";
import { Foliage } from "../world/foliage.js";
import { Grass, GroundPlants } from "../world/groundcover.js";
import { loadExplorer, Explorer, PlayerController } from "./player.js";
import { Fauna } from "./creatures.js";
import { WorldProps, placeable } from "./world.js";
import { Helicopter, findLandingSpot } from "./heli.js";
import { RadioNet } from "./radio.js";
import { Scanner, researchRate } from "./survey.js";
import { SPECIES, SPECIES_BY_ID, ITEMS, ZONES, zoneAt } from "./data.js";
import { Save } from "./save.js";
import { UI, MapView, $ } from "../ui/ui.js";
import { Audio } from "../audio/audio.js";
import { Coop } from "../net/coop.js";
import { saveQuality } from "../core/quality.js";

const DAY_SPEED = 1 / (72 * 60); // fraction of a day per real second: 1 real minute = 20 game minutes
const ZONE_ORDER = ["shore", "jungle", "mire", "ridge", "heart"];

export class Game {
  constructor(engine, loader, input, tdata) {
    this.engine = engine;
    this.loader = loader;
    this.input = input;
    this.tdata = tdata;
    this.state = "boot";
    this.exp = null;
    this.params = new URLSearchParams(location.search);
    this.decoys = [];
    this.partners = new Map();
    this._b = { forest: 0, mire: 0, vol: 0 };
  }

  async load(progress) {
    const E = this.engine, L = this.loader, q = E.quality;
    const td = this.tdata;
    Save.load();
    const terrain = new Terrain(td, td.biome);
    this.terrain = terrain;
    const btex = new THREE.Texture(td.biome.img);
    btex.flipY = false;
    btex.needsUpdate = true;
    G.uBiomeTex.value = btex;
    progress("地面の質感を読み込んでいます…");
    const layers = await loadLayers(L, q);
    E.scene.add(terrain.createGPU(E.renderer, layers, E.csm, q));
    this.ocean = new Ocean(E.sky, q);
    E.scene.add(this.ocean.mesh);
    const lz = td.landmarks.lz;
    this.lz = new THREE.Vector3(lz[0], lz[1], lz[2]);
    progress("植物を配置しています…");
    this.foliage = new Foliage(E, terrain, L, q);
    this.foliage.clear(lz[0], lz[2], 40);
    await this.foliage.load(E.csm);
    E.scene.add(this.foliage.group);
    this.ground = new GroundPlants(terrain, this.foliage, q);
    this.ground.exclude.push({ x: lz[0], z: lz[2], r: 32 });
    await this.ground.load(L, E.csm);
    E.scene.add(this.ground.group);
    const ugl = await L.glb("plants/understory.glb");
    this.grass = new Grass(ugl, E.csm, q);
    E.scene.add(this.grass.group);
    progress("拠点と機材を準備しています…");
    this.world = new WorldProps(E, terrain, this.foliage, L, q);
    await this.world.load(this.lz);
    E.scene.add(this.world.group);
    progress("島の生き物を配置しています…");
    this.fauna = new Fauna(E, terrain, L, E.csm, q);
    await this.fauna.load();
    E.scene.add(this.fauna.group);
    this.heli = new Helicopter(E, terrain);
    await this.heli.load(L, E.csm);
    E.scene.add(this.heli.root);
    progress("調査員の準備をしています…");
    this.exGltf = await loadExplorer(L, E.csm);
    this.explorer = new Explorer(this.exGltf, null, E.csm);
    E.scene.add(this.explorer.root);
    this.player = new PlayerController(E, terrain, this.foliage, this.input, this.explorer);
    this.player.extraColliders = this.world.colliders;
    this.player.onStep = (speed, wading) => Audio.step(this.surfaceAt(this.player.pos), speed, wading);
    // scanner prop in the right hand
    if (this.world.items.scanner && this.explorer.handR) {
      const sc = placeable(this.world.items.scanner);
      sc.position.set(0.02, 0.1, 0.03);
      sc.rotation.set(-Math.PI / 2, 0, Math.PI);
      sc.scale.setScalar(1);
      sc.visible = false;
      this.explorer.handR.add(sc);
      this.scannerProp = sc;
    }
    // headlamp
    this.lamp = new THREE.SpotLight(0xfff1dc, 0, 32, 0.55, 0.5, 1.3);
    this.lamp.position.set(0, 1.75, 0.15);
    this.lamp.target.position.set(0, 1.2, 6);
    this.explorer.root.add(this.lamp);
    this.explorer.root.add(this.lamp.target);
    this.lampOn = false;
    this.radio = new RadioNet(terrain);
    this.radio.base = { x: this.world.mastPos.x, z: this.world.mastPos.z, range: 430 };
    this.scanner = new Scanner(this.foliage, this.ground, this.fauna, this.world);
    const mapImg = await L.image("terrain/map.webp");
    this.map = new MapView($("mapCanvas"), terrain, mapImg);
    UI.init();
    UI.onOpen = () => { this.paused = true; };
    UI.onClose = (was) => { this.paused = false; if (was === "brief" && this.state === "brief") this.toTitle(); };
    this.bindUI();
    this.coop = new Coop(this);
    this.heli.placeAt(new THREE.Vector3(this.world.padPos.x, 0, this.world.padPos.z), Math.PI);
    this.rebuildNetwork();
    for (const m of Save.data.memos) this.world.addMemo(m);
  }

  // ------------------------------------------------------------------ UI bindings
  bindUI() {
    $("btnStart").onclick = () => { Audio.init(); this.toBrief(); };
    $("btnBook").onclick = () => { Audio.init(); UI.renderNotebook({}); UI.show("notebook"); };
    $("btnSettings").onclick = () => { Audio.init(); this.openMenu(); };
    $("btnCoop").onclick = () => { Audio.init(); $("coopName").value = Save.data.name || ""; UI.show("coopSheet"); };
    $("briefBack").onclick = () => UI.close();
    $("btnGo").onclick = () => this.startExpedition();
    $("resNext").onclick = () => { $("result").hidden = true; this.toBrief(); };
    $("rSend").onclick = () => { UI.close(); this.beginAction("transmit"); };
    $("rHeli").onclick = () => { UI.close(); this.requestPickup(); };
    $("memoPlace").onclick = () => this.placeMemo();
    $("readTake").onclick = () => this.takeMemoData();
    $("readPick").onclick = () => this.pickMemo();
    $("btnAbort").onclick = () => { UI.close(); if (this.state === "play") this.endExpedition("abort"); };
    $("pcMap").onclick = () => this.toggleMap();
    $("pcBook").onclick = () => this.toggleBook();
    $("pcMenu").onclick = () => this.openMenu();
    $("setQ").onchange = (e) => { saveQuality(+e.target.value); $("menuInfo").textContent = "画質は再読み込み後に反映されます。"; };
    $("setSens").oninput = (e) => { this.input.sensitivity = +e.target.value; localStorage.setItem("island.sens", e.target.value); $("setSensV").textContent = (+e.target.value).toFixed(1); };
    $("setVol").oninput = (e) => { Audio.setVolume(+e.target.value); $("setVolV").textContent = Math.round(e.target.value * 100); };
    $("setInv").onchange = (e) => { this.input.invertY = e.target.checked; localStorage.setItem("island.invertY", e.target.checked ? "1" : "0"); };
    $("coopHost").onclick = () => this.coop.host($("coopName").value || "調査員");
    $("coopJoin").onclick = () => this.coop.join($("coopCode").value, $("coopName").value || "調査員");
    $("coopGo").onclick = () => { UI.close(); if (this.coop.isHost || !this.coop.active) this.toBrief(); };
  }

  openMenu() {
    $("setQ").value = String(this.engine.quality.tier);
    $("setSens").value = String(this.input.sensitivity);
    $("setSensV").textContent = this.input.sensitivity.toFixed(1);
    $("setVol").value = String(Audio.volume);
    $("setVolV").textContent = Math.round(Audio.volume * 100);
    $("setInv").checked = this.input.invertY;
    $("btnAbort").hidden = this.state !== "play";
    $("menuInfo").textContent = `GPU: ${this.engine.quality.gpu.slice(0, 60)}`;
    UI.show("menuSheet");
  }
  toggleMap() { if (UI.open === "mapSheet") UI.close(); else if (!UI.open && this.state === "play") { this.map.cx = this.player.pos.x; this.map.cz = this.player.pos.z; this.map.zoom = 1.6; UI.show("mapSheet"); } }
  toggleBook() { if (UI.open === "notebook") UI.close(); else if (!UI.open) { UI.renderNotebook(this.exp ? this.exp.pending : {}); UI.show("notebook"); } }

  // ------------------------------------------------------------------ states
  toTitle() {
    this.state = "title";
    $("title").hidden = false;
    $("hud").hidden = true;
    for (const id of ["joy", "mbtns", "mtop", "pcmenu"]) $(id).hidden = true;
    this.explorer.root.visible = false;
    this.engine.setTime(0.3);
    this.titleT = 0;
  }

  toBrief() {
    if (this.coop.active && !this.coop.isHost) { this.toast("ホストの出発を待っています…"); return; }
    this.state = "brief";
    $("title").hidden = true;
    UI.renderLoadout();
    const news = $("news");
    news.innerHTML = "";
    const items = Save.data.log.slice(-6).reverse();
    if (!items.length) items.push("島の南岸に調査拠点を設置した。ヘリで島へ渡り、植物と生物を調べてほしい。", "奥へ進むほど電波が届きにくい。アンテナを高い場所に立て、中継網を広げること。", "帰還は無線で回収ヘリを要請する。通信圏外では呼べないので注意。");
    for (const t of items) news.insertAdjacentHTML("beforeend", `<li>${t}</li>`);
    UI.show("brief");
  }

  startExpedition() {
    this.state = "starting";
    UI.close();
    Audio.init();
    $("title").hidden = true;
    const lo = Save.data.loadout;
    const has = (id) => lo.includes(id) && Save.unlocked(id);
    this.exp = {
      pending: {}, antennas: Save.antennaKits(), aid: Save.aidKits(), decoy: has("decoy") ? 3 : 0,
      shield: has("shield"), sonar: has("sonar"), gain: has("gain"), repel: has("repel"),
      hp: 100, t0: performance.now(), deepest: "shore", newSpecies: [], sent: 0, placed: 0, startProgress: Save.progressTotal(),
    };
    Save.data.stats.expeditions++;
    Save.write();
    this.state = "play";
    this.paused = false;
    this.player.state = "free";
    this.player.locked = false;
    this.explorer.root.visible = true;
    this.engine.setTime(7.5 / 24 + Math.random() * 0.01);
    this.dayFrac = this.engine.dayFrac;
    // world
    this.fauna.list.forEach((c) => this.fauna.group.remove(c.root));
    this.fauna.list = [];
    this.fauna.spawnAll(Save.data.stats.expeditions * 17.3 + 3, { x: this.lz.x, z: this.lz.z, r: 70 });
    this.rebuildNetwork();
    const pad = this.world.padPos;
    this.heli.placeAt(new THREE.Vector3(pad.x, 0, pad.z), Math.PI * 0.1);
    this.heli.boarded = false;
    this.heli.root.visible = true;
    this.player.spawn(pad.x - 6, pad.z - 3, Math.PI);
    this.dropTimer = 4.5;
    this.pickup = null;
    $("hud").hidden = false;
    const touch = this.input.touch;
    $("joy").hidden = !touch;
    $("mbtns").hidden = !touch;
    $("mtop").hidden = !touch;
    $("pcmenu").hidden = touch;
    this.toast("島に着いた。調査端末で植物や生物を調べよう。", "ok");
    if (!touch) this.toast("クリックで視点操作。左クリック長押しで調査。");
    this.coop.startGame();
  }

  endExpedition(kind) {
    // kind: extract | rescue | abort
    const e = this.exp;
    if (!e) return;
    const res = [];
    if (kind === "extract") {
      const got = this.deliver();
      Save.data.stats.extractions++;
      res.push(...got);
    } else {
      Save.data.stats.rescues += kind === "rescue" ? 1 : 0;
      const lost = Object.values(e.pending).reduce((a, b) => a + b, 0);
      if (lost > 0.01) res.push(`未送信の調査データ（${Math.round(lost * 100)}%分）は失われた。`);
    }
    if (ZONE_ORDER.indexOf(e.deepest) > ZONE_ORDER.indexOf(Save.data.stats.deepest)) Save.data.stats.deepest = e.deepest;
    // the antenna eaters roam while we are away
    const lost = [];
    for (const a of Save.data.antennas) {
      if (!a.alive || a.shield) continue;
      this.terrain.biomeAt(a.x, a.z, this._b);
      if (this._b.forest > 0.45 && this._b.vol < 0.35 && Math.random() < 0.3) { a.alive = false; lost.push(a); }
    }
    Save.data.antennas = Save.data.antennas.filter((a) => a.alive);
    for (const a of lost) Save.data.log.push(`中継アンテナ #${a.id} の信号が途絶えた。デンクイに壊されたらしい。`);
    if (lost.length) res.push(`留守のあいだに中継アンテナが${lost.length}基壊された（遮蔽なし・森の中）。`);
    Save.write();
    this.map.saveFog();
    const title = kind === "extract" ? (Save.data.cleared && e.clearedNow ? "調査完了" : "帰還") : kind === "rescue" ? "救助" : "中断";
    const text = kind === "extract"
      ? (e.clearedNow ? "心核の記録が本部に届いた。島は巨大な一つの生き物だった——。あなたの調査は、この島の正体を世界に伝えることになる。調査はこれからも続けられる。" : "ヘリで拠点へ戻った。持ち帰ったデータは報告として受理された。")
      : kind === "rescue" ? "行動不能になり、救助隊に回収された。送信していないデータは持ち帰れなかった。" : "調査を中断して拠点へ戻った。";
    $("resTitle").textContent = title;
    $("resText").textContent = text;
    $("resList").innerHTML = res.map((t) => `<li>${t}</li>`).join("") || "<li>新しく報告できたデータはなかった。</li>";
    this.state = "result";
    this.exp = null;
    $("hud").hidden = true;
    for (const id of ["joy", "mbtns", "mtop", "pcmenu"]) $(id).hidden = true;
    $("result").hidden = false;
    this.player.state = "free";
    this.coop.endGame(kind);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Merge pending research into the save (transmit or extraction). */
  deliver() {
    const e = this.exp, out = [];
    for (const [id, v] of Object.entries(e.pending)) {
      if (v <= 0) continue;
      const r = Save.data.research[id];
      const before = r.known;
      r.known = Math.min(1, r.known + v);
      r.seen = true;
      const sp = SPECIES_BY_ID[id];
      if (r.known >= 0.999 && before < 0.999) {
        out.push(`${sp.name} の記録が完成した。`);
        for (const [iid, it] of Object.entries(ITEMS)) if (it.unlockBy === id) out.push(`次回から「${it.name}」を持っていける。`);
        if (id === "heart") { Save.data.cleared = true; e.clearedNow = true; }
      } else out.push(`${sp.name}：${Math.round(before * 100)}% → ${Math.round(r.known * 100)}%`);
      e.pending[id] = 0;
    }
    const plants = SPECIES.filter((s) => s.kind === "plant" && Save.complete(s.id)).length;
    if (plants >= 8 && !Save.data.gainNotified) { Save.data.gainNotified = true; out.push("植物8種の報告により「高利得アンテナ」が解放された。"); }
    Save.write();
    return out;
  }

  // ------------------------------------------------------------------ network
  rebuildNetwork() {
    this.radio.rebuild(Save.data.antennas.map((a) => ({ ...a, alive: a.alive !== false })));
    for (const a of Save.data.antennas) this.world.addAntenna(a);
    for (const id of [...this.world.antennas.keys()]) if (!Save.data.antennas.find((a) => a.id === id)) this.world.removeAntenna(id);
  }

  // ------------------------------------------------------------------ actions
  beginAction(kind) {
    const p = this.player;
    if (p.state === "down") return;
    if (kind === "transmit") {
      if (this.signal <= 0) { this.toast("通信圏外。電波が届く場所へ移動しよう。", "bad"); Audio.play("static"); return; }
      const total = Object.values(this.exp.pending).reduce((a, b) => a + b, 0);
      if (total <= 0.001) { this.toast("送信する未送信データがない。"); return; }
    }
    this.action = { kind, t: 0, dur: { antenna: 2.6, transmit: 3.5, heal: 3.0, revive: 4.0 }[kind] };
    p.state = kind === "transmit" ? "radio" : "kneel";
    if (kind === "transmit") Audio.play("radio");
  }

  finishAction(a) {
    const p = this.player, e = this.exp;
    if (a.kind === "antenna") {
      const id = (Save.data.antennas.reduce((m, x) => Math.max(m, x.id), 0) || 0) + 1;
      const ant = { id, x: p.pos.x + Math.sin(p.yaw) * 1.2, z: p.pos.z + Math.cos(p.yaw) * 1.2, shield: e.shield, gain: e.gain, alive: true };
      if (this.coop.active && !this.coop.isHost) { this.coop.send("placeAntenna", ant); }
      else { Save.data.antennas.push(ant); Save.write(); this.rebuildNetwork(); this.coop.broadcastWorld(); }
      e.antennas--;
      e.placed++;
      const node = this.radio.nodes.find((n) => n.id === id);
      this.toast(node && node.connected ? `中継アンテナ #${id} を設置。通信網につながった。` : `中継アンテナ #${id} を設置。…まだどこともつながっていない。`, node && node.connected ? "ok" : "bad");
      Audio.play("deploy");
    } else if (a.kind === "transmit") {
      const out = this.deliver();
      e.sent++;
      this.toast("調査データを本部へ送信した。", "ok");
      for (const t of out.slice(0, 3)) this.toast(t, "ok", 5200);
      Audio.play("beep");
    } else if (a.kind === "heal") {
      e.aid--;
      e.hp = Math.min(100, e.hp + 45);
      this.toast("手当をした。", "ok");
    } else if (a.kind === "revive" && a.target) {
      this.coop.send("revive", { id: a.target });
    }
    p.state = "free";
  }

  requestPickup() {
    if (this.signal <= 0) { this.toast("通信圏外。ヘリを呼べない。", "bad"); Audio.play("static"); return; }
    if (this.heli.state === "inbound" || this.heli.state === "landing" || this.heli.state === "waiting") { this.toast("ヘリはすでに向かっている。"); return; }
    if (this.coop.active && !this.coop.isHost) { this.coop.send("callHeli", { x: this.player.pos.x, z: this.player.pos.z }); this.toast("回収を要請した。", "ok"); return; }
    this.callHeliAt(this.player.pos);
  }

  callHeliAt(p) {
    let spot = findLandingSpot(this.terrain, this.foliage, p, this.world.colliders);
    if (!spot) spot = this.world.padPos.clone();
    this.pickup = spot;
    this.heli.call(spot);
    const d = Math.round(Math.hypot(spot.x - p.x, spot.z - p.z));
    this.toast(`回収ヘリが向かっている。着陸地点は${d < 8 ? "ここ" : `${d}m先の開けた場所`}。到着まで約${Math.round(this.heli.eta)}秒。`, "ok", 6000);
    Audio.play("radio");
    this.coop.broadcastWorld();
  }

  throwDecoy() {
    const e = this.exp, p = this.player;
    if (!e.decoy) { this.toast("投げられる道具がない。"); return; }
    e.decoy--;
    const f = new THREE.Vector3(-Math.sin(p.camYaw), 0, -Math.cos(p.camYaw));
    const x = p.pos.x + f.x * 14, z = p.pos.z + f.z * 14;
    const obj = this.world.items.decoy ? placeable(this.world.items.decoy) : new THREE.Object3D();
    obj.position.set(x, this.terrain.heightAt(x, z), z);
    this.engine.scene.add(obj);
    this.decoys.push({ x, z, t: 20, obj });
    this.coop.send("decoy", { x, z });
    this.toast("音響デコイを投げた。20秒間、音を出し続ける。", "ok");
    Audio.play("decoy", { x, z });
  }

  placeMemo() {
    const p = this.player, e = this.exp;
    const text = $("memoText").value.trim().slice(0, 140);
    if (!text) { $("memoText").focus(); return; }
    const attach = $("memoData").checked;
    const data = {};
    if (attach) for (const [k, v] of Object.entries(e.pending)) if (v > 0) { data[k] = v; e.pending[k] = 0; }
    const m = { id: "m" + Date.now().toString(36) + Math.floor(Math.random() * 1e4), x: p.pos.x, z: p.pos.z, text, author: Save.data.name || "あなた", t: Date.now(), data, mine: true };
    Save.data.memos.push(m);
    Save.write();
    this.world.addMemo(m);
    this.coop.send("memo", m);
    $("memoText").value = "";
    $("memoData").checked = false;
    UI.close();
    this.toast(attach ? "メモを置いた（調査データを託した）。" : "メモを置いた。", "ok");
  }

  openMemo(m) {
    this.readingMemo = m;
    $("readText").textContent = m.text;
    const n = Object.values(m.data || {}).reduce((a, b) => a + b, 0);
    $("readMeta").textContent = `${m.author}　${new Date(m.t).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}${n > 0 ? `　｜ 託された調査データ ${Math.round(n * 100)}%分` : ""}`;
    $("readTake").hidden = !(n > 0);
    UI.show("readSheet");
  }
  takeMemoData() {
    const m = this.readingMemo;
    if (!m || !this.exp) return;
    for (const [k, v] of Object.entries(m.data || {})) {
      this.exp.pending[k] = Math.min(1 - Save.known(k), (this.exp.pending[k] || 0) + v);
      Save.data.research[k].seen = true;
    }
    m.data = {};
    Save.write();
    this.coop.send("memoTake", { id: m.id });
    $("readTake").hidden = true;
    this.toast("託されたデータを受け取った。帰還か送信で報告できる。", "ok");
  }
  pickMemo() {
    const m = this.readingMemo;
    if (!m) return;
    if (m.data && Object.keys(m.data).length) this.takeMemoData();
    Save.data.memos = Save.data.memos.filter((x) => x.id !== m.id);
    Save.write();
    this.world.removeMemo(m.id);
    this.coop.send("memoRemove", { id: m.id });
    UI.close();
  }

  toast(msg, kind, ms) { UI.toast(msg, kind, ms); }

  surfaceAt(p) {
    const h = this.terrain.heightAt(p.x, p.z);
    this.terrain.biomeAt(p.x, p.z, this._b);
    if (h < 0.05) return "water";
    if (this._b.vol > 0.5) return "rock";
    if (this._b.mire > 0.4) return "mud";
    if (h < 3.2 && this._b.forest < 0.4) return "sand";
    if (this._b.forest > 0.4) return "leaves";
    return "grass";
  }

  damage(n, src) {
    const e = this.exp;
    if (!e || this.player.state === "down") return;
    e.hp -= n;
    this.player.shake = 1;
    this.engine.flash = 0.0;
    $("hurt").style.opacity = "1";
    setTimeout(() => { $("hurt").style.opacity = "0"; }, 260);
    this.explorer.playOnce("hurt");
    Audio.play("hurt");
    if (e.hp <= 0) {
      e.hp = 0;
      this.player.state = "down";
      this.downT = 0;
      this.toast(`${SPECIES_BY_ID[src] ? SPECIES_BY_ID[src].name : "何か"}に襲われ、動けなくなった…`, "bad", 6000);
    }
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    const E = this.engine, inp = this.input;
    inp.enabled = this.state === "play" && !UI.open;
    if (this.state === "title" || this.state === "brief" || this.state === "result") {
      this.titleT = (this.titleT || 0) + dt;
      const a = this.titleT * 0.02 + 0.6;
      const cam = E.camera;
      cam.position.set(Math.cos(a) * 980, 240 + 30 * Math.sin(this.titleT * 0.05), Math.sin(a) * 980 + 120);
      cam.lookAt(this.terrain.landmarks.heart[0] * 0.4, 70, this.terrain.landmarks.heart[2] * 0.3);
      cam.updateMatrixWorld();
      E.canopyAtCamera = 0;
      this.ocean.mesh.visible = true;
      this.heli.update(dt);
      this.world.update(dt, E.time, G.uNight.value);
      this.fauna.update(dt, { players: [], antennas: [], decoys: [] }, cam);
      Audio.update(dt, { zone: "shore", night: G.uNight.value, cam, heli: this.heli, menu: true });
      return;
    }
    if (this.state !== "play") return;
    const p = this.player, e = this.exp;
    // menus and toggles
    if (inp.wasPressed("map")) this.toggleMap();
    if (inp.wasPressed("notebook")) this.toggleBook();
    if (inp.wasPressed("menu")) { if (UI.open) UI.close(); else this.openMenu(); }
    const blocked = !!UI.open;
    p.locked = blocked || this.cinematic;
    if (!blocked) {
      if (inp.wasPressed("radio")) this.openRadio();
      if (inp.wasPressed("memo")) { UI.show("memoSheet"); $("memoData").disabled = !Object.values(e.pending).some((v) => v > 0); setTimeout(() => $("memoText").focus(), 50); }
      if (inp.wasPressed("light")) { this.lampOn = !this.lampOn; Audio.play("click"); }
      if (inp.wasPressed("item")) this.throwDecoy();
      if (inp.wasPressed("heal")) { if (e.aid > 0 && e.hp < 100) this.beginAction("heal"); else if (!e.aid) this.toast("救急キットがない。"); }
    }
    // drop-off: the helicopter leaves a few seconds after landing
    if (this.dropTimer > 0) { this.dropTimer -= dt; if (this.dropTimer <= 0) { this.heli.leave(); } }
    // time of day
    this.dayFrac = (this.dayFrac + dt * DAY_SPEED) % 1;
    E.setTime(this.dayFrac);
    // player
    if (p.state === "down") {
      this.downT += dt;
      if (this.downT > 5 && !this.coop.partnersAlive()) { this.fadeTo(() => this.endExpedition("rescue")); this.downT = -999; }
    }
    p.update(blocked ? 0 : dt);
    if (blocked) { p.ex.update(dt); }
    // current action (kneel / radio)
    if (this.action) {
      const a = this.action;
      const holdKey = { antenna: "antenna", heal: null, transmit: null, revive: "interact" }[a.kind];
      if (holdKey && !inp.held[holdKey] && a.t > 0.15) { this.action = null; p.state = "free"; UI.progress(null); }
      else {
        a.t += dt;
        UI.progress({ antenna: "アンテナを設置中…", transmit: "送信中…", heal: "手当て中…", revive: "助け起こしている…" }[a.kind], a.t / a.dur);
        if (a.t >= a.dur) { this.action = null; UI.progress(null); this.finishAction(a); }
      }
    }
    // scanning
    const scanning = !blocked && inp.held.scan && p.state !== "down" && !this.action;
    p.state = scanning ? "scan" : (p.state === "scan" ? "free" : p.state);
    if (this.scannerProp) this.scannerProp.visible = scanning;
    this.updateScan(dt, scanning);
    // antenna deploy (hold)
    if (!blocked && inp.wasPressed("antenna") && !this.action && p.state !== "down") {
      if (e.antennas <= 0) this.toast("アンテナが残っていない。");
      else if (this.terrain.heightAt(p.pos.x, p.pos.z) < 0.2) this.toast("水の中には立てられない。", "bad");
      else if (this.terrain.slopeAt(p.pos.x, p.pos.z) > 28) this.toast("傾斜がきつすぎる。", "bad");
      else this.beginAction("antenna");
    }
    // boarding has priority over other interactions
    this.boardPrompt = null;
    if (this.heli.state === "waiting" && this.pickup && p.state !== "down") {
      const d = Math.hypot(this.heli.pos.x - p.pos.x, this.heli.pos.z - p.pos.z);
      if (d < 9) this.boardPrompt = { text: "ヘリに乗って帰還する", key: "E", fn: () => { this.heli.boarded = true; this.coop.send("boarded", {}); this.fadeTo(() => this.endExpedition("extract")); } };
    }
    // interactions
    this.updateInteract(dt, blocked);
    // decoys
    for (const d of this.decoys) d.t -= dt;
    for (const d of this.decoys.filter((x) => x.t <= 0)) this.engine.scene.remove(d.obj);
    this.decoys = this.decoys.filter((d) => d.t > 0);
    // world systems
    const players = [{ id: "me", pos: p.pos, noise: p.state === "down" ? 0 : p.noise, alive: p.state !== "down", inWater: this.terrain.heightAt(p.pos.x, p.pos.z) < -0.15 }];
    for (const [id, r] of this.partners) players.push({ id, pos: r.pos, noise: r.noise || 0.3, alive: !r.down, inWater: this.terrain.heightAt(r.pos.x, r.pos.z) < -0.15 });
    const ants = Save.data.antennas.map((a) => ({ ...a, alive: a.alive !== false }));
    this.fauna.authority = !this.coop.active || this.coop.isHost;
    this.fauna.update(dt, { players, antennas: ants, decoys: this.decoys, repel: e.repel }, E.camera);
    this.handleFaunaEvents();
    this.heli.update(dt);
    this.world.update(dt, E.time, G.uNight.value);
    this.coop.update(dt);
    // signal, zone, hud
    this.signal = this.radio.signalAt(p.pos.x, p.pos.z);
    this.terrain.biomeAt(p.pos.x, p.pos.z, this._b);
    const zone = zoneAt(this.terrain, p.pos.x, p.pos.z, this._b);
    if (zone !== this.zone) { this.zone = zone; if (this.zoneShown !== zone) { this.toast(`— ${ZONES[zone].name} —`); this.zoneShown = zone; } }
    if (ZONE_ORDER.indexOf(zone) > ZONE_ORDER.indexOf(e.deepest)) e.deepest = zone;
    this.map.reveal(p.pos.x, p.pos.z);
    // lamp: brighter need at night
    this.lamp.intensity = this.lampOn ? 60 : 0;
    const gh = this.terrain.heightAt(E.camera.position.x, E.camera.position.z);
    E.canopyAtCamera = this._b.forest * (1 - this._b.vol) * (1 - THREE.MathUtils.smoothstep(E.camera.position.y - gh, 6, 26));
    // mire fog thickens
    const fogBoost = this._b.mire * 0.004 + (zone === "heart" ? 0.002 : 0);
    G.uFogParams.value.x += ((0.0006 + fogBoost) - G.uFogParams.value.x) * Math.min(1, dt * 0.5);
    this.updateHUD(zone);
    Audio.update(dt, { zone, night: G.uNight.value, cam: E.camera, heli: this.heli, canopy: E.canopyAtCamera, wading: p.wading, mire: this._b.mire, decoys: this.decoys });
  }

  openRadio() {
    const s = this.signal;
    $("radioStatus").textContent = s > 0 ? `電波状態：${s > 0.6 ? "良好" : s > 0.3 ? "やや弱い" : "弱い"}` : "通信圏外——ザーッというノイズしか聞こえない。";
    $("rSend").disabled = s <= 0;
    $("rHeli").disabled = s <= 0 || ["inbound", "landing", "waiting"].includes(this.heli.state);
    UI.show("radioSheet");
    Audio.play(s > 0 ? "radio" : "static");
  }

  updateScan(dt, scanning) {
    const e = this.exp;
    const ring = $("ring");
    if (!scanning) {
      $("scanInfo").hidden = true;
      ring.setAttribute("stroke-dashoffset", "113.1");
      this.scanTarget = null;
      Audio.scan(false);
      return;
    }
    const t = this.scanner.pick(this.engine.camera, this.player.pos);
    Audio.scan(true, !!t);
    if (!t) {
      $("scanInfo").hidden = false;
      $("scanName").textContent = "対象なし";
      $("scanState").textContent = "植物や生物に照準を合わせる";
      ring.setAttribute("stroke-dashoffset", "113.1");
      return;
    }
    const sp = SPECIES_BY_ID[t.species];
    const r = Save.data.research[t.species];
    const cur = Math.min(1, r.known + (e.pending[t.species] || 0));
    if (cur < 1) {
      const add = researchRate(t) * dt;
      e.pending[t.species] = Math.min(1 - r.known, (e.pending[t.species] || 0) + add);
      if (!r.seen) { r.seen = true; Save.write(); this.toast(`新しく記録：${sp.name}`, "ok"); Audio.play("discover"); }
      const now = Math.min(1, r.known + e.pending[t.species]);
      if (now >= 0.999 && cur < 0.999) { this.toast(`${sp.name} の調査が完了した（未送信）。`, "ok", 5000); Audio.play("complete"); }
      if (t.creature && sp.bonus && t.creature.behaviour === sp.bonus && !this.bonusShown) { this.toast("特徴的な行動を観察している！ 記録が速く進む。", "ok"); this.bonusShown = true; }
    }
    const now = Math.min(1, r.known + (e.pending[t.species] || 0));
    $("scanInfo").hidden = false;
    $("scanName").textContent = sp.name;
    $("scanState").textContent = now >= 0.999 ? (r.known >= 0.999 ? "報告済み" : "調査完了・未送信") : `記録中 ${Math.floor(now * 100)}%`;
    ring.setAttribute("stroke-dashoffset", String(113.1 * (1 - now)));
  }

  updateInteract(dt, blocked) {
    const p = this.player, inp = this.input;
    if (blocked || p.state === "down") { UI.prompt(null); return; }
    let best = null, bd = 3.2;
    for (const { data: a } of this.world.antennas.values()) {
      const d = Math.hypot(a.x - p.pos.x, a.z - p.pos.z);
      if (d < bd) { bd = d; best = { text: `中継アンテナ #${a.id} を回収する`, key: "E", fn: () => this.pickupAntenna(a) }; }
    }
    for (const { data: m } of this.world.memos.values()) {
      const d = Math.hypot(m.x - p.pos.x, m.z - p.pos.z);
      if (d < bd) { bd = d; best = { text: `メモを読む（${m.author}）`, key: "E", fn: () => this.openMemo(m) }; }
    }
    for (const [id, r] of this.partners) {
      if (!r.down) continue;
      const d = Math.hypot(r.pos.x - p.pos.x, r.pos.z - p.pos.z);
      if (d < 2.5) best = { text: `${r.name} を助け起こす（長押し）`, key: "E", fn: () => { this.action = { kind: "revive", t: 0, dur: 4, target: id }; p.state = "kneel"; } };
    }
    if (this.boardPrompt) best = this.boardPrompt;
    if (best) {
      UI.prompt(best.text, best.key);
      if (inp.wasPressed("interact")) best.fn();
    } else if (this.action) UI.prompt(null);
    else {
      const total = Object.values(this.exp.pending).reduce((a, b) => a + b, 0);
      UI.prompt(null);
      if (total > 0 && this.signal > 0.05 && !this.hintSend) { this.hintSend = true; this.toast("通信圏内にいる。無線（R）で調査データを送信できる。"); }
    }
  }

  pickupAntenna(a) {
    if (this.coop.active && !this.coop.isHost) { this.coop.send("removeAntenna", { id: a.id }); this.exp.antennas++; return; }
    Save.data.antennas = Save.data.antennas.filter((x) => x.id !== a.id);
    Save.write();
    this.world.removeAntenna(a.id);
    this.rebuildNetwork();
    this.exp.antennas++;
    this.toast(`中継アンテナ #${a.id} を回収した。`);
    this.coop.broadcastWorld();
  }

  handleFaunaEvents() {
    for (const ev of this.fauna.events.splice(0)) {
      if (ev.type === "attack") {
        if (ev.target === "me") this.damage(ev.dmg, ev.c.id);
        else this.coop.send("hit", { id: ev.target, dmg: ev.dmg, src: ev.c.id });
        Audio.play(ev.c.id === "kurohami" ? "growl" : ev.c.id === "numa" ? "splash" : "hit", { x: ev.c.pos.x, z: ev.c.pos.z });
      } else if (ev.type === "destroyAntenna") {
        const a = Save.data.antennas.find((x) => x.id === ev.antenna);
        if (a) {
          a.alive = false;
          Save.data.antennas = Save.data.antennas.filter((x) => x.id !== a.id);
          Save.data.log.push(`中継アンテナ #${a.id} がデンクイに壊された。`);
          Save.write();
          this.world.removeAntenna(a.id);
          this.rebuildNetwork();
          this.toast(`中継アンテナ #${a.id} の信号が途絶えた！`, "bad", 5000);
          Audio.play("break", { x: a.x, z: a.z });
          this.coop.broadcastWorld();
        }
      } else if (ev.type === "feedStart") {
        Audio.play("creak", { x: ev.c.pos.x, z: ev.c.pos.z });
      } else if (ev.type === "lunge") {
        Audio.play("splash", { x: ev.c.pos.x, z: ev.c.pos.z });
      } else if (ev.type === "growl") {
        Audio.play("growl", { x: ev.c.pos.x, z: ev.c.pos.z });
      }
    }
  }

  updateHUD(zone) {
    const e = this.exp, p = this.player, E = this.engine;
    $("zoneName").textContent = ZONES[zone].name;
    const mins = Math.floor(this.dayFrac * 24 * 60);
    $("clock").textContent = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
    $("hpBar").style.width = Math.max(0, e.hp) + "%";
    $("hpWrap").classList.toggle("low", e.hp < 35);
    $("stBar").style.width = (p.stamina * 100).toFixed(0) + "%";
    const pend = Object.values(e.pending).reduce((a, b) => a + b, 0);
    $("pending").textContent = pend > 0 ? `${Math.round(pend * 100)}%` : "なし";
    UI.setSignal(this.signal);

    const inv = [`アンテナ <b>${e.antennas}</b>`, `救急 <b>${e.aid}</b>`];
    if (e.decoy) inv.push(`デコイ <b>${e.decoy}</b>`);
    if (e.shield) inv.push("<b>遮蔽</b>");
    if (e.sonar) inv.push("<b>ソナー</b>");
    $("inv").innerHTML = inv.map((s) => `<div>${s}</div>`).join("");
    // helicopter info
    const hs = this.heli.state;
    if (["inbound", "landing", "waiting"].includes(hs) && this.pickup) {
      $("heliInfo").hidden = false;
      const d = Math.round(Math.hypot(this.pickup.x - p.pos.x, this.pickup.z - p.pos.z));
      $("heliInfo").textContent = hs === "waiting" ? `ヘリ着陸中 — ${d}m（${Math.max(0, Math.round(75 - this.heli.timer))}秒待機）` : `回収ヘリ接近中 — 着陸地点まで ${d}m`;
    } else $("heliInfo").hidden = true;
    // objective line
    let obj;
    const heartDone = Save.complete("heart") || (Save.known("heart") + (e.pending.heart || 0)) >= 0.999;
    if (["waiting"].includes(hs) && this.pickup) obj = "ヘリに乗って帰還する";
    else if (["inbound", "landing"].includes(hs)) obj = "着陸地点へ向かう";
    else if (pend <= 0 && !Object.keys(e.pending).length) obj = "植物や生物に照準を合わせて調査する";
    else if (pend > 0 && this.signal > 0) obj = heartDone && !Save.complete("heart") ? "心核の記録を無線で本部へ送る" : "無線（R）でデータを送信するか、奥へ進む";
    else if (pend > 0) obj = "通信圏へ戻るか、中継アンテナを立てる";
    else if (!heartDone) obj = zone === "heart" ? "火口の底の“心核”を調査する" : "島の奥——北の火口を目指す";
    else obj = "ヘリを呼んで帰還する";
    $("objective").textContent = "目標：" + obj;
    // compass
    const cam = E.camera;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const heading = Math.atan2(f.x, -f.z);
    const bearing = (x, z) => (Math.atan2(x - p.pos.x, -(z - p.pos.z)) * 180 / Math.PI + 360) % 360;
    const marks = [{ deg: bearing(this.lz.x, this.lz.z), icon: "⌂", color: "#e9b04a" }];
    for (const n of this.radio.nodes) if (!n.base && Math.hypot(n.x - p.pos.x, n.z - p.pos.z) < 600) marks.push({ deg: bearing(n.x, n.z), icon: "▲", color: n.connected ? "#7fd0dc" : "#8a8f88" });
    if (this.pickup && ["inbound", "landing", "waiting"].includes(hs)) marks.push({ deg: bearing(this.pickup.x, this.pickup.z), icon: "✈", color: "#ff8a5c" });
    for (const { data: m } of this.world.memos.values()) if (Math.hypot(m.x - p.pos.x, m.z - p.pos.z) < 300) marks.push({ deg: bearing(m.x, m.z), icon: "✉", color: "#f3e6b5" });
    for (const [, r] of this.partners) marks.push({ deg: bearing(r.pos.x, r.pos.z), icon: "●", color: "#b9e3a8" });
    if (this.exp.sonar) for (const c of this.fauna.list) if (c.id === "numa" && Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) < 30) marks.push({ deg: bearing(c.pos.x, c.pos.z), icon: "≋", color: "#ff8a5c" });
    UI.updateCompass(heading, marks);
    if (UI.open === "mapSheet") {
      this.map.draw({
        nodes: this.radio.nodes, memos: [...this.world.memos.values()].map((m) => m.data),
        heli: this.heli.root.visible ? this.heli.pos : null, pickup: this.pickup && ["inbound", "landing", "waiting"].includes(hs) ? this.pickup : null,
        heart: Save.data.research.heart.seen ? { x: this.terrain.landmarks.heart[0], z: this.terrain.landmarks.heart[2] } : null,
        partners: [...this.partners.values()].map((r) => ({ x: r.pos.x, z: r.pos.z, name: r.name })),
        player: { x: p.pos.x, z: p.pos.z, heading },
      });
    }
  }

  fadeTo(fn) {
    const f = $("fade");
    f.style.opacity = "1";
    setTimeout(() => { fn(); setTimeout(() => { f.style.opacity = "0"; }, 400); }, 1300);
  }
}
