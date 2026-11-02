// Resolution changes need sustained evidence and a cooldown: never chase a
// single explosion or alternate resolution on consecutive frames.
export class FrameBudget {
  constructor(maxRatio, { target = 60, minRatio = 0.65 } = {}) {
    this.maxRatio = maxRatio;
    this.ratio = maxRatio;
    this.minRatio = Math.min(minRatio, maxRatio);
    this.target = target;
    this.elapsed = 0;
    this.frames = 0;
    this.slowWindows = 0;
    this.fastWindows = 0;
    this.cooldown = 4;
    this.fps = target;
  }
  reset() { this.elapsed = 0; this.frames = 0; this.cooldown = 3; this.slowWindows = 0; this.fastWindows = 0; }
  sample(dt) {
    if (!(dt > 0) || dt > 0.25) return false;
    this.elapsed += dt; this.frames++;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.elapsed < 1.5) return false;
    const fps = this.frames / this.elapsed;
    this.fps = Math.round(fps);
    this.elapsed = 0; this.frames = 0;
    this.slowWindows = fps < this.target * 0.72 ? this.slowWindows + 1 : 0;
    this.fastWindows = fps > this.target * 0.94 ? this.fastWindows + 1 : 0;
    if (this.cooldown > 0) return false;
    let next = this.ratio;
    if (this.slowWindows >= 2) next = Math.max(this.minRatio, this.ratio - 0.15);
    else if (this.fastWindows >= 6) next = Math.min(this.maxRatio, this.ratio + 0.1);
    if (Math.abs(next - this.ratio) < 0.01) return false;
    this.ratio = next; this.cooldown = 6;
    this.slowWindows = 0; this.fastWindows = 0;
    return true;
  }
}

// Bounded catch-up preserves fixed physics steps during a slow frame. Travel
// acceleration is allowed to slow down instead of causing a feedback spiral.
export class SimulationClock {
  constructor(step = 1 / 30, maxSteps = 5) { this.step = step; this.maxSteps = maxSteps; this.accumulator = 0; }
  advance(seconds, update) {
    this.accumulator = Math.min(this.accumulator + Math.max(0, seconds), this.step * this.maxSteps);
    let steps = 0;
    while (this.accumulator + 1e-9 >= this.step && steps < this.maxSteps) {
      update(this.step); this.accumulator -= this.step; steps++;
    }
    return steps * this.step;
  }
  reset() { this.accumulator = 0; }
}
