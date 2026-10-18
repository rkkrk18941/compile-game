/* Host-authoritative tournament matches. The Director and presentation are shared with
   Nanafushigi Duel; only the game state, private hands and flag scores differ. */
export class Arena {
  constructor(entrants, format, options, io) {
    this.E = io.E; this.AI = io.AI; this.io = io; this.options = options;
    this.d = new io.Director(entrants, format, options.seed || (Math.random() * 4294967295) >>> 0, options);
    this.revision = 0; this.generation = 0; this.busy = false; this.closed = false;
  }
  get match() { return this.d.matches[this.d.cur]; }
  ent(seat) { return this.d.byId(this.match.seats[seat]); }
  ctrlFor(cid) { return [0, 1].filter(s => { const e = this.ent(s); return !e.cpu && e.owner === cid; }); }
  payload(cid, events = [], fresh = false, perspective = 0) {
    const m = this.match, state = m.state || m.final, ctrl = this.ctrlFor(cid);
    const me = ctrl.length === 1 ? ctrl[0] : ctrl.length === 2 ? state.turn : perspective;
    return { mid: m.id, revision: this.revision, view: this.E.viewFor(state, me), ev: ctrl.length === 0 ? events.map(e => ({...e})) : this.E.redact(events, me), ctrl,
      hands: ctrl.length === 0 ? state.hands.map(h => h.slice()) : null,
      names: [this.ent(0).name, this.ent(1).name], cpu: [this.ent(0).cpu, this.ent(1).cpu],
      tour: this.d.summary(), fresh };
  }
  send(events = [], fresh = false) { if (!this.closed) this.io.send(events, fresh); }
  startNext() {
    if (this.closed || (this.match && this.match.status === 'live')) return false;
    if (!this.d.start()) return false;
    this.revision++; this.generation++; this.send([], true); return true;
  }
  rematch() { if (!this.match || this.match.status !== 'done') return; this.d.rematch(); this.revision++; this.generation++; this.send([], true); }
  finish(events) {
    const m = this.match;
    if (m.state.phase === 'over') { m.final = m.state; this.d.finish(m, m.final); }
    this.revision++; this.send(events);
  }
  act(cid, action, mid = this.d.cur, revision = this.revision) {
    const m = this.match;
    if (this.closed || !m || !m.state || mid !== m.id || revision !== this.revision || !this.ctrlFor(cid).includes(m.state.turn)) return false;
    const r = this.E.apply(m.state, { ...action, p: m.state.turn });
    if (!r.ok) return false;
    this.finish(r.ev); return true;
  }
  async pump() {
    const m = this.match;
    if (this.closed || this.busy || this.fast || !m || !m.state || !this.ent(m.state.turn).cpu) return;
    this.busy = true;
    const generation = this.generation, seat = m.state.turn, level = this.ent(seat).cpu;
    try {
      const [a] = await Promise.all([this.io.choose(this.E.viewFor(m.state, seat), level), this.io.delay()]);
      if (this.closed || generation !== this.generation || m !== this.match || !m.state) return;
      let r = this.E.apply(m.state, { ...a, p: seat });
      if (!r.ok) r = this.E.apply(m.state, { ...this.E.legalActions(m.state)[0], p: seat });
      if (!r.ok) throw new Error('No legal CPU move');
      this.finish(r.ev);
    } finally { this.busy = false; this.io.idle(); }
  }
  async fastForward() {
    const m = this.match;
    if (this.closed || !m || !m.state || ![0, 1].every(s => this.ent(s).cpu) || this.fast) return;
    this.fast = true; this.generation++; this.busy = true;
    const generation = this.generation;
    try {
      for (let n = 0; n < 800 && m.state && !this.closed && this.generation === generation; n++) {
        const state = m.state, seat = state.turn;
        const a = await this.io.choose(this.E.viewFor(state, seat), this.ent(seat).cpu);
        if (this.closed || this.generation !== generation) return;
        let r = this.E.apply(state, { ...a, p: seat });
        if (!r.ok) r = this.E.apply(state, { ...this.E.legalActions(state)[0], p: seat });
        if (!r.ok) throw new Error('No legal CPU move');
        if (state.phase === 'over') { m.final = state; this.d.finish(m, state); this.revision++; this.send([], false); break; }
      }
    } finally { this.fast = false; this.busy = false; this.io.idle(); }
  }
  playerLeft(cid) {
    this.d.entrants.forEach(e => { if (!e.cpu && e.owner === cid) { e.cpu = 2; e.owner = null; e.name += '(CPU)'; } });
    if (this.match) this.send();
    this.io.idle();
  }
  close() { this.closed = true; this.generation++; }
}
