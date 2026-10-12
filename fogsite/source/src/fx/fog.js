// Full-screen volumetric-looking fog (WebGL fbm with domain warping), rendered at low resolution.
const VS = `attribute vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`;
const FS = `
precision mediump float;
uniform vec2 res; uniform float t; uniform vec3 tint; uniform float pulse; uniform vec3 pulseColor; uniform float dens; uniform vec2 glow;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1,0)),u.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float v=0., a=.5; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<5;i++){ v+=a*n(p); p=m*p; a*=.5; } return v; }
void main(){
  vec2 uv = gl_FragCoord.xy / res.xy;
  vec2 p = uv * vec2(res.x/res.y, 1.) * 2.2;
  float tt = t * .035;
  vec2 q = vec2(fbm(p + vec2(0., tt)), fbm(p + vec2(5.2, 1.3) - tt));
  vec2 r = vec2(fbm(p + 3.5*q + vec2(1.7, 9.2) + tt*1.4), fbm(p + 3.5*q + vec2(8.3, 2.8) - tt*1.1));
  float f = fbm(p + 3.2*r);
  float fog = smoothstep(.25, 1.05, f) * dens;
  vec3 base = mix(vec3(.012,.025,.023), vec3(.03,.055,.05), uv.y);
  vec3 col = base + tint * fog * .62 + vec3(.06,.08,.075) * pow(f, 3.) * dens;
  float g = smoothstep(.75, 0., distance(uv, glow)) ;
  col += vec3(.20,.13,.05) * g * .22;
  float vig = smoothstep(1.25, .25, length((uv - .5) * vec2(1.15, 1.)));
  col *= .45 + .55 * vig;
  col += pulseColor * pulse * (.25 + .6 * (1. - vig));
  gl_FragColor = vec4(col, 1.);
}`;

export class FogBackground {
  constructor(canvas) {
    this.canvas = canvas;
    this.quality = 'high';
    this.tint = [0.56, 0.68, 0.64];
    this.targetTint = [...this.tint];
    this.pulse = 0;
    this.pulseColor = [0.8, 0.12, 0.08];
    this.density = 1;
    this.glow = [0.5, 0.15];
    this.ok = this.init();
    this.last = 0;
    this.t0 = performance.now();
    this.raf = 0;
    this.loop = this.loop.bind(this);
    if (this.ok) this.raf = requestAnimationFrame(this.loop);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && this.ok && !this.raf) this.raf = requestAnimationFrame(this.loop); });
    addEventListener('resize', () => this.resize());
  }
  init() {
    let gl = null;
    try { gl = this.canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, powerPreference: 'low-power', preserveDrawingBuffer: false }); } catch { gl = null; }
    if (!gl) return false;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    try {
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog); gl.useProgram(prog);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      this.u = Object.fromEntries(['res', 't', 'tint', 'pulse', 'pulseColor', 'dens', 'glow'].map(n => [n, gl.getUniformLocation(prog, n)]));
      this.gl = gl;
      this.resize();
      return true;
    } catch (e) { console.warn('fog shader', e); return false; }
  }
  resize() {
    if (!this.gl) return;
    const scale = this.quality === 'high' ? 0.42 : 0.28;
    const w = Math.max(160, Math.min(720, Math.round(innerWidth * scale))), h = Math.max(160, Math.round(w * innerHeight / innerWidth));
    this.canvas.width = w; this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
  }
  setQuality(q) { this.quality = q; this.resize(); if (q === 'low') this.drawOnce(); else if (!this.raf && this.ok) this.raf = requestAnimationFrame(this.loop); }
  setMood({ tint, density, glow } = {}) { if (tint) this.targetTint = tint; if (density != null) this.density = density; if (glow) this.glow = glow; }
  flash(color = [0.8, 0.12, 0.08], amount = 1) { this.pulseColor = color; this.pulse = Math.max(this.pulse, amount); if (!this.raf && this.ok) this.drawOnce(); }
  drawOnce() { this.render(performance.now()); }
  render(now) {
    const gl = this.gl; if (!gl) return;
    for (let i = 0; i < 3; i++) this.tint[i] += (this.targetTint[i] - this.tint[i]) * 0.03;
    this.pulse *= 0.93;
    gl.uniform2f(this.u.res, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.t, (now - this.t0) / 1000);
    gl.uniform3f(this.u.tint, ...this.tint);
    gl.uniform1f(this.u.pulse, this.pulse);
    gl.uniform3f(this.u.pulseColor, ...this.pulseColor);
    gl.uniform1f(this.u.dens, this.density);
    gl.uniform2f(this.u.glow, ...this.glow);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  loop(now) {
    this.raf = 0;
    if (document.hidden) return;
    const fps = this.quality === 'high' ? 30 : 15;
    if (now - this.last >= 1000 / fps) { this.last = now; this.render(now); }
    if (this.quality !== 'low' || this.pulse > 0.01) this.raf = requestAnimationFrame(this.loop);
  }
}

export const PHASE_TINTS = {
  1: [0.52, 0.66, 0.62],
  2: [0.45, 0.58, 0.68],
  3: [0.62, 0.6, 0.45],
  4: [0.72, 0.38, 0.36],
  5: [0.55, 0.22, 0.24],
};
