// Co-op over WebRTC (PeerJS public broker). The host simulates creatures, the helicopter
// and the antenna network; everyone sends their own explorer state. Memos are shared.
import * as THREE from "three";
import { Explorer } from "../game/player.js";
import { Save } from "../game/save.js";
import { $ } from "../ui/ui.js";
import { placeable } from "../game/world.js";

const PREFIX = "the-island-v1-";
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TINTS = [new THREE.Color(1.6, 0.8, 0.45), new THREE.Color(0.6, 0.9, 1.6), new THREE.Color(1.5, 0.6, 0.6), new THREE.Color(1.1, 0.7, 1.5)];

function peerOptions() {
  const s = new URLSearchParams(location.search);
  const o = { debug: 1 };
  if (s.get("peerhost")) Object.assign(o, { host: s.get("peerhost"), port: +(s.get("peerport") || 9000), path: s.get("peerpath") || "/", secure: s.get("peersecure") === "1" });
  return o;
}

export class Coop {
  constructor(game) {
    this.g = game;
    this.active = false;
    this.isHost = false;
    this.conns = new Map();
    this.sendT = 0;
    this.worldT = 0;
    this.myId = null;
    this.names = new Map();
  }

  status(t) { $("coopStatus").textContent = t; }

  open(id) {
    return new Promise((resolve, reject) => {
      if (typeof window.Peer === "undefined") { reject(new Error("PeerJS を読み込めませんでした")); return; }
      const p = new window.Peer(id, peerOptions());
      const to = setTimeout(() => { try { p.destroy(); } catch (e) { /* */ } reject(new Error("timeout")); }, 15000);
      p.on("open", () => { clearTimeout(to); resolve(p); });
      p.on("error", (e) => { clearTimeout(to); reject(e); });
    });
  }

  async host(name) {
    this.leave();
    Save.data.name = name;
    Save.write();
    this.status("部屋を作っています…");
    for (let i = 0; i < 4 && !this.peer; i++) {
      let code = "";
      for (let k = 0; k < 5; k++) code += ALPHA[Math.floor(Math.random() * ALPHA.length)];
      try { this.peer = await this.open(PREFIX + code); this.code = code; } catch (e) { if (!e || e.type !== "unavailable-id") { this.status("接続できませんでした（" + (e.type || e.message) + "）"); return; } }
    }
    if (!this.peer) return;
    this.active = true;
    this.isHost = true;
    this.myId = this.peer.id;
    this.names.set(this.myId, name);
    this.peer.on("connection", (c) => this.accept(c));
    this.peer.on("disconnected", () => { try { this.peer.reconnect(); } catch (e) { /* */ } });
    $("coopRoom").hidden = false;
    $("coopCodeShow").textContent = this.code;
    this.status("友だちにコードを伝えてください。");
    this.updatePlayers();
  }

  accept(c) {
    c.on("open", () => {
      this.conns.set(c.peer, c);
      c.on("data", (d) => this.onMsg(d, c.peer));
      c.on("close", () => { this.conns.delete(c.peer); this.dropPartner(c.peer); this.updatePlayers(); });
    });
  }

  async join(code, name) {
    this.leave();
    Save.data.name = name;
    Save.write();
    code = (code || "").trim().toUpperCase();
    if (code.length !== 5) { this.status("5文字のコードを入れてください。"); return; }
    this.status("接続しています…");
    try { this.peer = await this.open(undefined); } catch (e) { this.status("接続できませんでした。"); return; }
    this.myId = this.peer.id;
    const c = this.peer.connect(PREFIX + code, { reliable: true, serialization: "json" });
    const to = setTimeout(() => this.status("部屋が見つかりません（コードを確かめてください）"), 12000);
    c.on("open", () => {
      clearTimeout(to);
      this.active = true;
      this.isHost = false;
      this.conns.set("host", c);
      c.send({ t: "hello", name });
      this.status("参加しました。ホストの出発を待っています…");
      $("coopRoom").hidden = false;
      $("coopCodeShow").textContent = code;
      $("coopGo").hidden = true;
    });
    c.on("data", (d) => this.onMsg(d, "host"));
    c.on("close", () => { this.g.toast("ホストとの接続が切れた。", "bad"); this.leave(); });
    this.peer.on("error", (e) => { if (e.type === "peer-unavailable") this.status("部屋が見つかりません（コードを確かめてください）"); });
  }

  leave() {
    for (const c of this.conns.values()) { try { c.close(); } catch (e) { /* */ } }
    this.conns.clear();
    if (this.peer) { try { this.peer.destroy(); } catch (e) { /* */ } }
    this.peer = null;
    this.active = false;
    this.isHost = false;
    for (const id of [...this.g.partners.keys()]) this.dropPartner(id);
  }

  updatePlayers() {
    const n = [...this.names.values()];
    $("coopPlayers").textContent = `参加者：${n.join("、")}`;
  }

  send(type, payload) {
    if (!this.active) return;
    // payload fields may include their own "t" (memo timestamps): keep the type authoritative
    const msg = { ...payload, ts: payload && payload.t, t: type, from: this.myId };
    if (this.isHost) {
      // host-side handling of its own requests is done directly; relay shared events
      if (["memo", "memoTake", "memoRemove", "decoy", "hit", "revive", "boarded"].includes(type)) this.broadcast(msg);
    } else {
      const h = this.conns.get("host");
      if (h && h.open) h.send(msg);
    }
  }

  broadcast(msg, except) {
    for (const [id, c] of this.conns) if (id !== except && c.open) c.send(msg);
  }

  broadcastWorld() {
    if (!this.active || !this.isHost) return;
    this.broadcast({ t: "ants", list: Save.data.antennas, pickup: this.g.pickup ? [this.g.pickup.x, this.g.pickup.z] : null });
  }

  startGame() {
    if (!this.active || !this.isHost) return;
    this.broadcast({ t: "start", day: this.g.dayFrac, ants: Save.data.antennas, memos: Save.data.memos.filter((m) => m.mine) });
  }

  endGame(kind) {
    if (!this.active) return;
    if (this.isHost) this.broadcast({ t: "end", kind });
  }

  partnersAlive() {
    for (const r of this.g.partners.values()) if (!r.down) return true;
    return false;
  }

  partner(id, name) {
    let r = this.g.partners.get(id);
    if (!r) {
      const idx = this.g.partners.size % TINTS.length;
      const ex = new Explorer(this.g.exGltf, TINTS[idx], this.g.engine.csm);
      this.g.engine.scene.add(ex.root);
      r = { ex, pos: new THREE.Vector3(), target: new THREE.Vector3(), yaw: 0, anim: "idle", name: name || "仲間", down: false, noise: 0.3, speed: 0 };
      this.g.partners.set(id, r);
      this.g.toast(`${r.name} が合流した。`, "ok");
    }
    if (name) r.name = name;
    return r;
  }
  dropPartner(id) {
    const r = this.g.partners.get(id);
    if (!r) return;
    this.g.engine.scene.remove(r.ex.root);
    this.g.partners.delete(id);
  }

  onMsg(d, from) {
    const g = this.g;
    if (!d || !d.t) return;
    switch (d.t) {
      case "hello":
        this.names.set(from, d.name);
        this.updatePlayers();
        if (g.state === "play") this.conns.get(from)?.send({ t: "start", day: g.dayFrac, ants: Save.data.antennas, memos: Save.data.memos.filter((m) => m.mine) });
        break;
      case "start":
        if (!this.isHost) {
          Save.data.antennas = d.ants || [];
          for (const m of d.memos || []) if (!Save.data.memos.find((x) => x.id === m.id)) { Save.data.memos.push({ ...m, mine: false }); g.world.addMemo(m); }
          g.startExpedition();
          g.dayFrac = d.day;
          g.rebuildNetwork();
          g.heli.leave();
        }
        break;
      case "p": {
        const pid = d.id || from;
        if (pid === this.myId) break;
        const r = this.partner(pid, d.name);
        r.target.set(d.x, d.y, d.z);
        if (r.pos.lengthSq() === 0) r.pos.copy(r.target);
        r.yaw = d.yaw;
        r.anim = d.a;
        r.down = !!d.down;
        r.noise = d.n;
        r.speed = d.s;
        if (this.isHost) this.broadcast({ ...d, id: from }, from);
        break;
      }
      case "w":
        if (!this.isHost) {
          g.fauna.applySnapshot(d.c);
          g.heli.applySnapshot(d.h);
          if (Math.abs(d.day - g.dayFrac) > 0.01) g.dayFrac = d.day;
        }
        break;
      case "ants":
        if (!this.isHost) {
          Save.data.antennas = d.list;
          g.rebuildNetwork();
          g.pickup = d.pickup ? new THREE.Vector3(d.pickup[0], 0, d.pickup[1]) : g.pickup;
        }
        break;
      case "placeAntenna":
        if (this.isHost) {
          const id = (Save.data.antennas.reduce((m, x) => Math.max(m, x.id), 0) || 0) + 1;
          Save.data.antennas.push({ ...d, id, from: undefined, t: undefined });
          Save.write();
          g.rebuildNetwork();
          this.broadcastWorld();
        }
        break;
      case "removeAntenna":
        if (this.isHost) {
          Save.data.antennas = Save.data.antennas.filter((a) => a.id !== d.id);
          Save.write();
          g.world.removeAntenna(d.id);
          g.rebuildNetwork();
          this.broadcastWorld();
        }
        break;
      case "callHeli":
        if (this.isHost) g.callHeliAt(new THREE.Vector3(d.x, 0, d.z));
        break;
      case "memo":
        if (!Save.data.memos.find((m) => m.id === d.id)) {
          const m = { id: d.id, x: d.x, z: d.z, text: d.text, author: d.author, t: d.ts || Date.now(), data: d.data, mine: false };
          Save.data.memos.push(m);
          Save.write();
          g.world.addMemo(m);
          g.toast(`${d.author} がメモを残した。`);
        }
        if (this.isHost) this.broadcast(d, from);
        break;
      case "memoTake": {
        const m = Save.data.memos.find((x) => x.id === d.id);
        if (m) { m.data = {}; Save.write(); }
        if (this.isHost) this.broadcast(d, from);
        break;
      }
      case "memoRemove":
        Save.data.memos = Save.data.memos.filter((x) => x.id !== d.id);
        Save.write();
        g.world.removeMemo(d.id);
        if (this.isHost) this.broadcast(d, from);
        break;
      case "decoy":
        if (d.from !== this.myId) {
          const obj = g.world.items.decoy ? placeable(g.world.items.decoy) : new THREE.Object3D();
          obj.position.set(d.x, g.terrain.heightAt(d.x, d.z), d.z);
          g.engine.scene.add(obj);
          g.decoys.push({ x: d.x, z: d.z, t: 20, obj });
        }
        if (this.isHost) this.broadcast(d, from);
        break;
      case "hit":
        if (d.id === this.myId) g.damage(d.dmg, d.src);
        else if (this.isHost) this.broadcast(d, from);
        break;
      case "revive":
        if (d.id === this.myId && g.exp) { g.exp.hp = 35; g.player.state = "free"; g.toast("仲間に助け起こされた。", "ok"); }
        else if (this.isHost) this.broadcast(d, from);
        break;
      case "boarded":
        if (this.isHost) this.broadcast(d, from);
        break;
      case "end":
        if (!this.isHost && g.state === "play") { g.toast("ホストが調査を終えた。", "bad"); g.fadeTo(() => g.endExpedition(g.heli.boarded ? "extract" : "abort")); }
        break;
    }
  }

  update(dt) {
    if (!this.active) return;
    const g = this.g;
    // interpolate partners
    for (const r of g.partners.values()) {
      const k = 1 - Math.exp(-dt * 10);
      r.pos.lerp(r.target, k);
      r.ex.root.position.copy(r.pos);
      r.ex.root.rotation.y = r.yaw;
      const lower = {}, upper = {};
      if (r.down) { lower.down = upper.down = 1; }
      else if (r.anim === "kneel") { lower.kneel = upper.kneel = 1; }
      else {
        const loco = r.speed > 3 ? "run" : r.speed > 0.2 ? "walk" : "idle";
        lower[loco] = 1;
        upper[r.anim === "scan" ? "scan" : r.anim === "radio" ? "radio" : loco] = 1;
      }
      r.ex.setPose(lower, upper, { walk: Math.max(0.5, r.speed / 1.3), run: Math.max(0.6, r.speed / 4.2), crouch: 1 }, dt);
      r.ex.update(dt);
    }
    this.sendT += dt;
    if (this.sendT > 0.1 && g.state === "play") {
      this.sendT = 0;
      const p = g.player;
      const me = { t: "p", x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2), yaw: +p.yaw.toFixed(2), a: p.state, down: p.state === "down", n: p.noise, s: +p.speed.toFixed(1), name: Save.data.name || "調査員", from: this.myId };
      if (this.isHost) { me.id = this.myId; this.broadcast(me); }
      else { const h = this.conns.get("host"); if (h && h.open) h.send(me); }
    }
    if (this.isHost) {
      this.worldT += dt;
      if (this.worldT > 0.12 && g.state === "play") {
        this.worldT = 0;
        this.broadcast({ t: "w", c: g.fauna.snapshot(), h: g.heli.snapshot(), day: g.dayFrac });
      }
    }
  }
}
