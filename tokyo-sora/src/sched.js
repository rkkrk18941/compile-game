// Tiny priority fetch scheduler: owners keep their item's priority fresh,
// items that stop being wanted are dropped before they start.
export class Sched {
  constructor(max) { this.max = max; this.active = 0; this.items = []; }
  add(it) { this.items.push(it); }
  pump() {
    if (!this.items.length) return;
    const keep = [];
    for (const it of this.items) { if (it.alive()) keep.push(it); else if (it.drop) it.drop(); }
    this.items = keep;
    if (this.active >= this.max || !keep.length) return;
    for (const it of keep) it._p = it.prio();
    keep.sort((a, b) => a._p - b._p);
    while (this.active < this.max && this.items.length) {
      const it = this.items.shift();
      this.active++;
      let p;
      try { p = it.start(); } catch (e) { p = Promise.reject(e); }
      Promise.resolve(p).catch(() => {}).then(() => { this.active--; });
    }
  }
  get pending() { return this.items.length + this.active; }
}
