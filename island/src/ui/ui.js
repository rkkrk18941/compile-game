// DOM user interface: HUD, compass, toasts, map, field notebook, loadout.
import { SPECIES, SPECIES_BY_ID, ITEMS, ZONES } from "../game/data.js";
import { Save } from "../game/save.js";
import { base as assetBase } from "../core/loader.js";

export const $ = (id) => document.getElementById(id);

export const UI = {
  sheets: ["brief", "notebook", "mapSheet", "radioSheet", "memoSheet", "readSheet", "menuSheet", "coopSheet"],
  open: null,

  init() {
    document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => this.close()));
    this.compassEl = $("compass");
    this.buildCompass();
    this.toastEl = $("toasts");
  },

  show(id) {
    for (const s of this.sheets) $(s).hidden = s !== id;
    this.open = id;
    if (document.pointerLockElement) document.exitPointerLock();
    if (this.onOpen) this.onOpen(id);
  },
  close() {
    for (const s of this.sheets) $(s).hidden = true;
    const was = this.open;
    this.open = null;
    if (this.onClose) this.onClose(was);
  },
  isOpen() { return !!this.open; },

  toast(msg, kind = "", ms = 3800) {
    const d = document.createElement("div");
    d.className = "toast " + kind;
    d.textContent = msg;
    this.toastEl.appendChild(d);
    while (this.toastEl.children.length > 4) this.toastEl.firstChild.remove();
    setTimeout(() => d.remove(), ms);
  },

  // ------------------------------------------------------------ compass
  buildCompass() {
    const el = this.compassEl;
    el.innerHTML = "";
    this.compassTicks = [];
    const labels = { 0: "N", 45: "NE", 90: "E", 135: "SE", 180: "S", 225: "SW", 270: "W", 315: "NW" };
    for (let d = 0; d < 360; d += 15) {
      const s = document.createElement("div");
      s.className = "c" + (labels[d] && d % 90 === 0 ? " big" : "");
      s.textContent = labels[d] || "·";
      el.appendChild(s);
      this.compassTicks.push({ el: s, deg: d });
    }
    this.compassMarks = [];
  },
  /** heading: radians, 0 = north (-Z), clockwise toward east (+X). marks: [{deg, icon, color}] */
  updateCompass(heading, marks) {
    const W = this.compassEl.clientWidth || 400;
    const span = 140;
    const h = (heading * 180 / Math.PI + 360) % 360;
    for (const t of this.compassTicks) {
      let d = t.deg - h;
      d = ((d + 540) % 360) - 180;
      const vis = Math.abs(d) < span / 2;
      t.el.style.display = vis ? "" : "none";
      if (vis) t.el.style.left = (W / 2 + (d / span) * W) + "px";
    }
    while (this.compassMarks.length < marks.length) {
      const m = document.createElement("div");
      m.className = "m";
      this.compassEl.appendChild(m);
      this.compassMarks.push(m);
    }
    this.compassMarks.forEach((el, i) => {
      const mk = marks[i];
      if (!mk) { el.style.display = "none"; return; }
      let d = mk.deg - h;
      d = ((d + 540) % 360) - 180;
      const vis = Math.abs(d) < span / 2;
      el.style.display = vis ? "" : "none";
      el.style.left = (W / 2 + (d / span) * W) + "px";
      el.textContent = mk.icon;
      el.style.color = mk.color || "#fff";
    });
  },

  setSignal(q) {
    const bars = q <= 0 ? 0 : q < 0.15 ? 1 : q < 0.35 ? 2 : q < 0.6 ? 3 : 4;
    $("signal").querySelectorAll("i").forEach((b, i) => b.classList.toggle("on", i < bars));
    $("signal").classList.toggle("none", bars === 0);
    $("sigText").textContent = bars === 0 ? "圏外" : "通信可";
  },

  prompt(text, key) {
    const p = $("prompt");
    if (!text) { p.hidden = true; return; }
    p.hidden = false;
    const touch = document.body.classList.contains("touch");
    p.innerHTML = (key && !touch ? `<kbd>${key}</kbd>` : "") + text;
  },
  progress(label, v) {
    const p = $("progress");
    if (label == null) { p.hidden = true; return; }
    p.hidden = false;
    $("progLbl").textContent = label;
    $("progBar").style.width = (Math.max(0, Math.min(1, v)) * 100).toFixed(1) + "%";
  },

  // ------------------------------------------------------------ notebook
  renderNotebook(pending, sel) {
    const list = $("splist");
    list.innerHTML = "";
    const kinds = { plant: "植物", animal: "動物", special: "特殊生物", core: "最深部" };
    let current = sel || this.nbSel || SPECIES[0].id;
    this.nbSel = current;
    for (const s of SPECIES) {
      const r = Save.data.research[s.id];
      const p = Math.min(1, r.known + (pending[s.id] || 0));
      const b = document.createElement("button");
      b.className = "sp" + (s.id === current ? " sel" : "") + (r.seen || p > 0 ? "" : " unk");
      const name = r.seen || p > 0 ? s.name : "？？？";
      const st = r.known >= 0.999 ? "報告済" : p >= 0.999 ? "未送信" : p > 0 ? Math.floor(p * 100) + "%" : "—";
      b.innerHTML = `<span>${name}</span><span class="st">${st}</span>`;
      b.onclick = () => { this.nbSel = s.id; this.renderNotebook(pending, s.id); };
      list.appendChild(b);
    }
    const s = SPECIES_BY_ID[current];
    const r = Save.data.research[s.id];
    const p = Math.min(1, r.known + (pending[s.id] || 0));
    const known = r.seen || p > 0;
    const det = $("spdetail");
    const lines = s.text.filter((_, i) => p >= i / 3 + 0.01 || (i === 0 && known));
    const unlock = s.unlock ? ITEMS[s.unlock] : null;
    det.innerHTML = `
      <img alt="" src="${known ? assetBase + "portraits/" + s.id + ".webp" : "data:image/gif;base64,R0lGODlhAQABAAAAACw="}" onerror="this.style.visibility='hidden'">
      <h3>${known ? s.name : "未発見"}</h3>
      <div class="sci">${known ? s.sci : ""}</div>
      <div style="margin-bottom:10px"><span class="tag">${kinds[s.kind]}</span><span class="tag">${ZONES[s.zone].name}</span>
        ${r.known >= 0.999 ? '<span class="tag ok">報告済み</span>' : p >= 0.999 ? '<span class="tag warn">未送信（送信か帰還で報告）</span>' : ""}</div>
      <div class="meter"><i style="width:${(p * 100).toFixed(0)}%"></i></div>
      ${known ? lines.map((t) => `<p>${t}</p>`).join("") : `<p class="fine">この${kinds[s.kind]}はまだ記録されていない。${ZONES[s.zone].name}で探してみよう。</p>`}
      ${unlock && known ? `<p class="fine">報告すると次回から「${unlock.name}」を持っていける。</p>` : ""}
    `;
  },

  // ------------------------------------------------------------ loadout
  renderLoadout(onChange) {
    const box = $("loadout");
    box.innerHTML = "";
    const icons = { decoy: "◎", shield: "▣", sonar: "≋", gain: "⟁", aid: "✚", coconut: "●", repel: "✱" };
    const always = `<div class="item on" style="cursor:default"><span class="ic">▲</span><span><b>中継アンテナ ×${Save.antennaKits()}</b><small>標準装備。調査が進むと数が増える。</small></span></div>
      <div class="item on" style="cursor:default"><span class="ic">✚</span><span><b>救急キット ×${Save.aidKits()}</b><small>標準装備。</small></span></div>
      <div class="item on" style="cursor:default"><span class="ic">⌁</span><span><b>調査端末・無線機・メモ帳</b><small>標準装備。</small></span></div>`;
    box.insertAdjacentHTML("beforeend", always);
    const opts = ["shield", "sonar", "decoy", "gain", "repel"];
    for (const id of opts) {
      const it = ITEMS[id];
      const un = Save.unlocked(id);
      const on = Save.data.loadout.includes(id);
      const b = document.createElement("button");
      b.className = "item" + (on && un ? " on" : "") + (un ? "" : " locked");
      b.innerHTML = `<span class="ic">${icons[id] || "?"}</span><span><b>${un ? it.name : "？？？"}</b><small>${un ? it.desc : "対応する生物を調べて報告すると解放される。"}</small></span>`;
      if (un) b.onclick = () => {
        const L = Save.data.loadout;
        const i = L.indexOf(id);
        if (i >= 0) L.splice(i, 1);
        else { L.push(id); while (L.filter((x) => opts.includes(x)).length > 3) L.splice(L.findIndex((x) => opts.includes(x)), 1); }
        Save.write();
        this.renderLoadout(onChange);
        if (onChange) onChange();
      };
      box.appendChild(b);
    }
    const tot = Save.progressTotal();
    const done = SPECIES.filter((s) => Save.complete(s.id)).length;
    $("progressSummary").innerHTML = `<div class="meter"><i style="width:${(tot * 100).toFixed(0)}%"></i></div>
      <p style="font-size:13px;margin:0">報告済み ${done} / ${SPECIES.length} 種　・　調査度 ${(tot * 100).toFixed(0)}%</p>
      <p class="fine" style="margin:6px 0 0">調査回数 ${Save.data.stats.expeditions}　帰還 ${Save.data.stats.extractions}　救助 ${Save.data.stats.rescues}　到達 ${ZONES[Save.data.stats.deepest].name}</p>`;
  },
};

// ------------------------------------------------------------------ map
export class MapView {
  constructor(canvas, terrain, mapImage) {
    this.c = canvas;
    this.t = terrain;
    this.img = mapImage;
    this.zoom = 1;
    this.cx = 0;
    this.cz = 0;
    // fog of war: explored grid (128 x 128)
    this.fogN = 128;
    this.fog = new Uint8Array(this.fogN * this.fogN);
    try {
      const s = localStorage.getItem("island.fog");
      if (s) { const a = Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0)); if (a.length === this.fog.length) this.fog.set(a); }
    } catch (e) { /* ignore */ }
    this.fogCanvas = document.createElement("canvas");
    this.fogCanvas.width = this.fogCanvas.height = this.fogN;
    let drag = null;
    canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, cx: this.cx, cz: this.cz }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const k = this.t.size / (canvas.clientWidth * this.zoom);
      this.cx = drag.cx - (e.clientX - drag.x) * k;
      this.cz = drag.cz - (e.clientY - drag.y) * k;
      this.dirty = true;
    });
    canvas.addEventListener("pointerup", () => { drag = null; });
    canvas.addEventListener("wheel", (e) => { e.preventDefault(); this.zoom = Math.max(1, Math.min(5, this.zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2))); this.dirty = true; }, { passive: false });
  }
  reveal(x, z, r = 70) {
    const n = this.fogN, s = this.t.size;
    const cx = (x + s / 2) / s * n, cz = (z + s / 2) / s * n, rr = r / s * n;
    let changed = false;
    for (let j = Math.floor(cz - rr); j <= cz + rr; j++) for (let i = Math.floor(cx - rr); i <= cx + rr; i++) {
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      if ((i - cx) ** 2 + (j - cz) ** 2 > rr * rr) continue;
      if (!this.fog[j * n + i]) { this.fog[j * n + i] = 1; changed = true; }
    }
    if (changed) this.fogDirty = true;
  }
  saveFog() {
    try { let s = ""; for (const v of this.fog) s += String.fromCharCode(v); localStorage.setItem("island.fog", btoa(s)); } catch (e) { /* ignore */ }
  }
  draw(state) {
    const c = this.c;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = c.clientWidth, H = c.clientHeight;
    if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = this.t.size;
    const scale = (W / s) * this.zoom;
    const toX = (x) => W / 2 + (x - this.cx) * scale, toY = (z) => H / 2 + (z - this.cz) * scale;
    g.fillStyle = "#7e9aa1";
    g.fillRect(0, 0, W, H);
    g.drawImage(this.img, toX(-s / 2), toY(-s / 2), s * scale, s * scale);
    // fog
    if (this.fogDirty || !this.fogDrawn) {
      const fc = this.fogCanvas.getContext("2d");
      const id = fc.createImageData(this.fogN, this.fogN);
      for (let i = 0; i < this.fog.length; i++) { id.data[i * 4 + 3] = this.fog[i] ? 0 : 170; id.data[i * 4] = 18; id.data[i * 4 + 1] = 24; id.data[i * 4 + 2] = 24; }
      fc.putImageData(id, 0, 0);
      this.fogDirty = false;
      this.fogDrawn = true;
    }
    g.imageSmoothingEnabled = true;
    g.drawImage(this.fogCanvas, toX(-s / 2), toY(-s / 2), s * scale, s * scale);
    // coverage
    for (const n of state.nodes) {
      g.beginPath();
      g.arc(toX(n.x), toY(n.z), n.range * scale, 0, Math.PI * 2);
      g.fillStyle = n.connected ? "rgba(127,208,220,0.10)" : "rgba(140,140,140,0.08)";
      g.fill();
      g.strokeStyle = n.connected ? "rgba(127,208,220,0.5)" : "rgba(160,160,160,0.4)";
      g.setLineDash(n.connected ? [] : [4, 4]);
      g.lineWidth = 1;
      g.stroke();
      g.setLineDash([]);
    }
    for (const n of state.nodes) {
      g.fillStyle = n.connected ? "#7fd0dc" : "#8a8f88";
      g.beginPath();
      if (n.base) g.rect(toX(n.x) - 5, toY(n.z) - 5, 10, 10);
      else { g.moveTo(toX(n.x), toY(n.z) - 6); g.lineTo(toX(n.x) + 5, toY(n.z) + 4); g.lineTo(toX(n.x) - 5, toY(n.z) + 4); }
      g.fill();
    }
    for (const m of state.memos) {
      g.fillStyle = "#f3e6b5";
      g.fillRect(toX(m.x) - 3, toY(m.z) - 3, 6, 6);
    }
    if (state.heli) { g.fillStyle = "#ff8a5c"; g.beginPath(); g.arc(toX(state.heli.x), toY(state.heli.z), 5, 0, Math.PI * 2); g.fill(); }
    if (state.pickup) { g.strokeStyle = "#ff8a5c"; g.lineWidth = 2; g.beginPath(); g.arc(toX(state.pickup.x), toY(state.pickup.z), 8, 0, Math.PI * 2); g.stroke(); }
    if (state.heart) { g.strokeStyle = "rgba(255,90,110,.9)"; g.lineWidth = 2; g.beginPath(); g.arc(toX(state.heart.x), toY(state.heart.z), 10, 0, Math.PI * 2); g.stroke(); }
    for (const p of state.partners) {
      g.fillStyle = "#b9e3a8";
      g.beginPath(); g.arc(toX(p.x), toY(p.z), 4, 0, Math.PI * 2); g.fill();
      g.font = "11px sans-serif"; g.fillText(p.name || "", toX(p.x) + 6, toY(p.z) + 4);
    }
    // player arrow
    const px = toX(state.player.x), pz = toY(state.player.z), a = state.player.heading;
    g.save();
    g.translate(px, pz);
    g.rotate(a);
    g.fillStyle = "#e9b04a";
    g.strokeStyle = "#1a1408";
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // scale bar
    g.fillStyle = "rgba(0,0,0,.5)"; g.fillRect(10, H - 26, 112, 18);
    g.fillStyle = "#fff"; g.fillRect(16, H - 14, 100 * (100 * scale) / 100 / (scale * 100 / 100), 2);
    g.font = "11px sans-serif"; g.fillText(`${Math.round(100 / scale)} m`, 18, H - 16);
  }
}
