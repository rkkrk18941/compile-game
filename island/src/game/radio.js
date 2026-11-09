// Radio network: the camp mast plus relay antennas. Range grows with elevation and falls
// with the island's interference (strongest around the Heart). Antennas relay to each other.
import { ZONES, zoneAt } from "./data.js";

export class RadioNet {
  constructor(terrain) {
    this.t = terrain;
    this.base = null;         // {x, z, range}
    this.nodes = [];          // computed: {id, x, z, y, range, connected, shield}
    this.gain = false;
    this._b = { forest: 0, mire: 0, vol: 0 };
  }

  rangeAt(x, z, base = 210) {
    const h = Math.max(0, this.t.heightAt(x, z));
    this.t.biomeAt(x, z, this._b);
    const zone = zoneAt(this.t, x, z, this._b);
    let inter = ZONES[zone].interference;
    // dense canopy absorbs signal a little
    inter *= 1 - this._b.forest * 0.12;
    const elev = 1 + Math.min(h, 220) / 160;
    // the heart scrambles everything inside the caldera except from the rim
    const hx = this.t.landmarks.heart;
    const dh = Math.hypot(x - hx[0], z - hx[2]);
    if (dh < 150 && h < 175) inter *= 0.55;
    return base * elev * inter * (this.gain ? 1.5 : 1);
  }

  rebuild(antennas) {
    const nodes = [];
    if (this.base) nodes.push({ id: "base", x: this.base.x, z: this.base.z, y: 9, range: this.base.range, connected: true, base: true });
    for (const a of antennas) {
      if (!a.alive) continue;
      nodes.push({ id: a.id, x: a.x, z: a.z, y: this.t.heightAt(a.x, a.z) + 3.5, range: this.rangeAt(a.x, a.z, a.gain ? 315 : 210), connected: false, shield: a.shield });
    }
    // BFS from the base: a link needs the distance to be within the mean of both ranges
    const queue = nodes.filter((n) => n.base);
    while (queue.length) {
      const n = queue.shift();
      for (const m of nodes) {
        if (m.connected) continue;
        const d = Math.hypot(m.x - n.x, m.z - n.z);
        if (d <= (n.range + m.range) * 0.5) { m.connected = true; queue.push(m); }
      }
    }
    this.nodes = nodes;
  }

  /** Signal quality 0..1 at a point (0 = no service). */
  signalAt(x, z) {
    let best = 0;
    for (const n of this.nodes) {
      if (!n.connected) continue;
      const d = Math.hypot(x - n.x, z - n.z);
      // the receiver's own position also suffers interference
      const q = 1 - d / n.range;
      if (q > best) best = q;
    }
    // local interference at the receiver
    this.t.biomeAt(x, z, this._b);
    const zone = zoneAt(this.t, x, z, this._b);
    if (zone === "heart") {
      const hx = this.t.landmarks.heart;
      const h = this.t.heightAt(x, z);
      if (Math.hypot(x - hx[0], z - hx[2]) < 150 && h < 175) best *= 0.75;
    }
    return Math.max(0, best);
  }

  /** Would an antenna placed here connect? */
  previewAt(x, z) {
    const r = this.rangeAt(x, z);
    for (const n of this.nodes) {
      if (!n.connected) continue;
      if (Math.hypot(x - n.x, z - n.z) <= (n.range + r) * 0.5) return { connects: true, range: r };
    }
    return { connects: false, range: r };
  }
}
