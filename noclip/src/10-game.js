  var Ps = `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
`,
    x2 = `
uniform float uSeed;
float vnoise(vec2 p, vec2 per){
  vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  float a = hash12(mod(i,per)+uSeed), b = hash12(mod(i+vec2(1,0),per)+uSeed);
  float c = hash12(mod(i+vec2(0,1),per)+uSeed), d = hash12(mod(i+vec2(1,1),per)+uSeed);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float gnoise(vec2 p, vec2 per){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*f*(f*(f*6.0-15.0)+10.0);
  vec2 ga = hash22(mod(i,per)+uSeed)*2.0-1.0;
  vec2 gb = hash22(mod(i+vec2(1,0),per)+uSeed)*2.0-1.0;
  vec2 gc = hash22(mod(i+vec2(0,1),per)+uSeed)*2.0-1.0;
  vec2 gd = hash22(mod(i+vec2(1,1),per)+uSeed)*2.0-1.0;
  float va = dot(ga, f), vb = dot(gb, f-vec2(1,0)), vc = dot(gc, f-vec2(0,1)), vd = dot(gd, f-vec2(1,1));
  return 0.5 + 0.75*mix(mix(va,vb,u.x), mix(vc,vd,u.x), u.y);
}
float fbm(vec2 p, vec2 per, int oct){
  float s = 0.0, a = 0.5, t = 0.0;
  for (int i=0;i<9;i++){ if(i>=oct) break; s += a*gnoise(p, per); t += a; p *= 2.0; per *= 2.0; a *= 0.5; }
  return s/t;
}
float rfbm(vec2 p, vec2 per, int oct){ // ridged
  float s = 0.0, a = 0.5, t = 0.0;
  for (int i=0;i<9;i++){ if(i>=oct) break; s += a*(1.0-abs(gnoise(p, per)*2.0-1.0)); t += a; p *= 2.0; per *= 2.0; a *= 0.5; }
  return s/t;
}
vec3 worley(vec2 p, vec2 per){
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int y=-1;y<=1;y++) for (int x=-1;x<=1;x++){
    vec2 g = vec2(float(x), float(y));
    vec2 cid = mod(i+g, per);
    vec2 o = hash22(cid + uSeed*1.37);
    vec2 r = g + o - f;
    float d = dot(r,r);
    if (d < d1){ d2 = d1; d1 = d; id = hash12(cid + 3.1 + uSeed); } else if (d < d2) d2 = d;
  }
  return vec3(sqrt(d1), sqrt(d2), id);
}
float pix(vec2 uv, vec2 res){ return hash12(mod(floor(uv*res), res) + uSeed*2.1); } // per texel white noise
`,
    v2 = `
vec3 aces(vec3 x){ const float a=2.51; const float b=0.03; const float c=2.43; const float d=0.59; const float e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0); }
`,
    y2 = `
float flickFn(float t, float ph){ return 1.0; }
`;
  function N1(s,t){ return 1; }
  var X5 = `
out vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`,
    Y5 = `
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThresh;
void main(){
  vec3 c = texture(tSrc, vUv + uTexel*vec2(-1.0,-1.0)).rgb + texture(tSrc, vUv + uTexel*vec2(1.0,-1.0)).rgb
         + texture(tSrc, vUv + uTexel*vec2(-1.0,1.0)).rgb + texture(tSrc, vUv + uTexel*vec2(1.0,1.0)).rgb;
  c *= 0.25;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = smoothstep(uThresh, uThresh*2.5, l);
  fragColor = vec4(min(c*k, vec3(40.0)), 1.0);
}
`,
    $5 = `
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D tSrc; uniform vec2 uTexel;
void main(){
  vec3 c = texture(tSrc, vUv + uTexel*vec2(-1.0,-1.0)).rgb + texture(tSrc, vUv + uTexel*vec2(1.0,-1.0)).rgb
         + texture(tSrc, vUv + uTexel*vec2(-1.0,1.0)).rgb + texture(tSrc, vUv + uTexel*vec2(1.0,1.0)).rgb;
  fragColor = vec4(c*0.25, 1.0);
}
`,
    K5 = `
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D tSrc; uniform vec2 uDir;
void main(){
  vec3 c = texture(tSrc, vUv).rgb * 0.2270270270;
  c += texture(tSrc, vUv + uDir*1.3846153846).rgb * 0.3162162162;
  c += texture(tSrc, vUv - uDir*1.3846153846).rgb * 0.3162162162;
  c += texture(tSrc, vUv + uDir*3.2307692308).rgb * 0.0702702703;
  c += texture(tSrc, vUv - uDir*3.2307692308).rgb * 0.0702702703;
  fragColor = vec4(c, 1.0);
}
`,
    j5 = `
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D tScene; uniform sampler2D tB1; uniform sampler2D tB2; uniform sampler2D tB3;
uniform vec2 uRes; uniform float uTime; uniform float uExposure; uniform float uBloom;
uniform float uGrain; uniform float uVignette; uniform float uCA; uniform float uDistort;
uniform float uDamage; uniform float uFade; uniform float uStatic; uniform float uPulse; uniform float uLowHP;
uniform vec3 uLift; uniform vec3 uGamma; uniform vec3 uGain; uniform float uSat;
uniform float uWhite; uniform float uUnderwater; uniform vec2 uMotion; uniform float uMiasma;
${Ps}
${v2}
vec2 distort(vec2 uv){ vec2 c = uv - 0.5; float r2 = dot(c, c); return 0.5 + c * (1.0 - uDistort*0.12 + uDistort*0.22*r2); }
void main(){
  vec2 uv = vUv;
  if (uUnderwater > 0.0) uv += vec2(sin(uv.y*24.0 + uTime*2.0), cos(uv.x*20.0 + uTime*1.7)) * 0.003 * uUnderwater;
  vec2 duv = distort(uv);
  vec2 cdir = (duv - 0.5);
  float ca = uCA * (0.4 + dot(cdir, cdir)*3.0);
  vec3 col;
  col.r = texture(tScene, duv - cdir*ca).r;
  col.g = texture(tScene, duv).g;
  col.b = texture(tScene, duv + cdir*ca).b;
  // camera motion blur (shutter smear while turning)
  float mb = length(uMotion);
  if (mb > 0.0015) {
    vec3 acc = col;
    for (int i = 1; i <= 4; i++) {
      float t = (float(i) - 2.5) / 4.0;
      acc += texture(tScene, duv + uMotion * t).rgb;
    }
    col = acc / 5.0;
  }
  vec3 bl = texture(tB1, duv).rgb*0.55 + texture(tB2, duv).rgb*0.6 + texture(tB3, duv).rgb*0.7;
  col += bl * uBloom;
  // static burst (black zone / damage)
  if (uStatic > 0.0) {
    float line = hash12(vec2(floor(uv.y*uRes.y*0.25), floor(uTime*30.0)));
    float st = hash12(floor(uv*uRes*0.5) + floor(uTime*60.0)*1.7);
    col = mix(col, vec3(st)*0.25 + col*0.6, uStatic * step(1.0 - uStatic*0.6, line));
    col *= 1.0 - uStatic*0.25*hash12(vec2(floor(uTime*24.0), 3.0));
  }
  col *= uExposure;
  col = aces(col);
  // grade (in display-ish space)
  col = pow(max(col, 0.0), 1.0/uGamma);
  col = col * uGain + uLift;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSat * (1.0 - uLowHP*0.6));
  // underwater tint
  col = mix(col, col*vec3(0.55, 0.85, 0.95) + vec3(0.0, 0.03, 0.05), uUnderwater*0.8);
  // miasma: sickly green-brown cast, slow breathing vignette
  if (uMiasma > 0.01) {
    float lm = dot(col, vec3(0.3, 0.59, 0.11));
    col = mix(col, vec3(lm)*vec3(0.92, 1.0, 0.7) + vec3(0.012, 0.016, 0.0), uMiasma*0.55);
    vec2 mc = uv - 0.5;
    float breathe = 0.5 + 0.5*sin(uTime*1.7);
    col *= 1.0 - smoothstep(0.25, 0.85, length(mc*vec2(1.3, 1.0))) * uMiasma * (0.35 + 0.25*breathe);
  }
  // vignette
  vec2 vc = uv - 0.5;
  float vig = 1.0 - dot(vc*vec2(1.25, 1.0), vc*vec2(1.25, 1.0)) * uVignette * (1.0 + uPulse*0.8);
  col *= clamp(vig, 0.0, 1.0);
  // damage red edges
  float edge = smoothstep(0.15, 0.75, length(vc*vec2(1.6, 1.2)));
  col = mix(col, vec3(0.45, 0.0, 0.0), edge * uDamage * 0.75);
  col = mix(col, col*vec3(1.0, 0.75, 0.75), uLowHP*edge*0.5);
  // film grain (luma dependent)
  float g = hash12(uv*uRes + vec2(fract(uTime*43.0)*1000.0, fract(uTime*17.0)*1000.0)) - 0.5;
  float g2 = hash12(uv*uRes*0.5 + vec2(fract(uTime*29.0)*731.0, 0.0)) - 0.5;
  col += (g*0.75 + g2*0.5) * uGrain * (1.15 - l*0.7);
  // subtle interlace shimmer
  col *= 1.0 - 0.012*step(0.5, fract(gl_FragCoord.y*0.5 + uTime*30.0));
  col = mix(col, vec3(1.0), uWhite);
  col *= 1.0 - uFade;
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`,
    ld = class {
      constructor(t) {
        this.r = t;
        let e = t.getContext(),
          n =
            e.getExtension("EXT_color_buffer_half_float") ||
            e.getExtension("EXT_color_buffer_float");
        ((this.type = n ? Ei : hn),
          (this.scene = new qi()),
          (this.cam = new $i(-1, 1, 1, -1, 0, 1)),
          (this.quad = new te(new Un(2, 2))),
          (this.quad.frustumCulled = !1),
          this.scene.add(this.quad));
        let i = (r, o) =>
          new De({
            glslVersion: yn,
            vertexShader: X5,
            fragmentShader: r,
            uniforms: o,
            depthTest: !1,
            depthWrite: !1,
          });
        ((this.mBright = i(Y5, {
          tSrc: { value: null },
          uTexel: { value: new ut() },
          uThresh: { value: 1.2 },
        })),
          (this.mDown = i($5, {
            tSrc: { value: null },
            uTexel: { value: new ut() },
          })),
          (this.mBlur = i(K5, {
            tSrc: { value: null },
            uDir: { value: new ut() },
          })),
          (this.mComp = i(j5, {
            tScene: { value: null },
            tB1: { value: null },
            tB2: { value: null },
            tB3: { value: null },
            uRes: { value: new ut() },
            uTime: { value: 0 },
            uExposure: { value: 1 },
            uBloom: { value: 0.35 },
            uGrain: { value: 0.05 },
            uVignette: { value: 0.75 },
            uCA: { value: 0.004 },
            uDistort: { value: 1 },
            uDamage: { value: 0 },
            uFade: { value: 0 },
            uStatic: { value: 0 },
            uPulse: { value: 0 },
            uLowHP: { value: 0 },
            uLift: { value: new L() },
            uGamma: { value: new L(1, 1, 1) },
            uGain: { value: new L(1, 1, 1) },
            uSat: { value: 1 },
            uWhite: { value: 0 },
            uUnderwater: { value: 0 },
            uMotion: { value: new ut() },
            uMiasma: { value: 0 },
          })),
          (this.samples = 0),
          (this.w = 0),
          (this.h = 0));
      }
      rt(t, e, n, i = 0) {
        return new vn(Math.max(1, t), Math.max(1, e), {
          type: this.type,
          format: on,
          depthBuffer: !!n,
          samples: i,
          minFilter: Le,
          magFilter: Le,
          generateMipmaps: !1,
        });
      }
      setSize(t, e, n) {
        if (
          ((t = Math.max(64, Math.round(t))),
          (e = Math.max(64, Math.round(e))),
          t === this.w && e === this.h && n === this.samples)
        )
          return;
        (this.dispose(),
          (this.w = t),
          (this.h = e),
          (this.samples = n),
          (this.rtScene = this.rt(t, e, !0, n)));
        let i = Math.max(8, t >> 2),
          r = Math.max(8, e >> 2),
          o = Math.max(4, i >> 1),
          a = Math.max(4, r >> 1),
          c = Math.max(2, o >> 1),
          l = Math.max(2, a >> 1);
        ((this.b1 = this.rt(i, r)),
          (this.b1t = this.rt(i, r)),
          (this.b2 = this.rt(o, a)),
          (this.b2t = this.rt(o, a)),
          (this.b3 = this.rt(c, l)),
          (this.b3t = this.rt(c, l)));
      }
      pass(t, e) {
        ((this.quad.material = t),
          this.r.setRenderTarget(e),
          this.r.render(this.scene, this.cam));
      }
      blur(t, e) {
        ((this.mBlur.uniforms.tSrc.value = t.texture),
          this.mBlur.uniforms.uDir.value.set(1 / t.width, 0),
          this.pass(this.mBlur, e),
          (this.mBlur.uniforms.tSrc.value = e.texture),
          this.mBlur.uniforms.uDir.value.set(0, 1 / t.height),
          this.pass(this.mBlur, t));
      }
      render(t, e, n, i, r) {
        let o = this.r;
        (o.setRenderTarget(this.rtScene),
          (o.autoClear = !1),
          o.setClearColor(0, 1),
          o.clear(!0, !0, !0),
          o.render(t, e),
          n && (o.clearDepth(), o.render(n, i)),
          (this.mBright.uniforms.tSrc.value = this.rtScene.texture),
          this.mBright.uniforms.uTexel.value.set(1 / this.w, 1 / this.h),
          (this.mBright.uniforms.uThresh.value = r.bloomThresh ?? 1.2),
          this.pass(this.mBright, this.b1),
          this.blur(this.b1, this.b1t),
          (this.mDown.uniforms.tSrc.value = this.b1.texture),
          this.mDown.uniforms.uTexel.value.set(
            0.5 / this.b1.width,
            0.5 / this.b1.height,
          ),
          this.pass(this.mDown, this.b2),
          this.blur(this.b2, this.b2t),
          (this.mDown.uniforms.tSrc.value = this.b2.texture),
          this.mDown.uniforms.uTexel.value.set(
            0.5 / this.b2.width,
            0.5 / this.b2.height,
          ),
          this.pass(this.mDown, this.b3),
          this.blur(this.b3, this.b3t));
        let a = this.mComp.uniforms;
        ((a.tScene.value = this.rtScene.texture),
          (a.tB1.value = this.b1.texture),
          (a.tB2.value = this.b2.texture),
          (a.tB3.value = this.b3.texture),
          a.uRes.value.set(this.w, this.h));
        for (let c in r)
          if (a["u" + c] !== void 0) {
            let l = a["u" + c];
            l.value && (l.value.isVector3 || l.value.isVector2)
              ? l.value.fromArray(r[c])
              : (l.value = r[c]);
          }
        (this.pass(this.mComp, null), (o.autoClear = !0));
      }
      dispose() {
        for (let t of ["rtScene", "b1", "b1t", "b2", "b2t", "b3", "b3t"])
          this[t] && (this[t].dispose(), (this[t] = null));
      }
    };
  var _2 = `
out vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`,
    Z5 = `
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform float uMode;
uniform float uRaw;
${Ps}
${x2}
`,
    J5 = `
void main(){
  if (uMode < 0.5) {
    vec4 a = albedoH(vUv);
    fragColor = uRaw > 0.5 ? a : vec4(pow(clamp(a.rgb, 0.0, 1.0), vec3(1.0/2.2)), clamp(a.a, 0.0, 1.0));
  } else {
    vec2 r = roughAO(vUv);
    fragColor = vec4(r, 0.0, 1.0);
  }
}
`,
    Q5 = `
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D tA; uniform sampler2D tB; uniform vec2 uTexel; uniform float uStrength;
void main(){
  float hL = texture(tA, vUv - vec2(uTexel.x, 0.0)).a;
  float hR = texture(tA, vUv + vec2(uTexel.x, 0.0)).a;
  float hD = texture(tA, vUv - vec2(0.0, uTexel.y)).a;
  float hU = texture(tA, vUv + vec2(0.0, uTexel.y)).a;
  float h0 = texture(tA, vUv).a;
  vec3 n = normalize(vec3((hL - hR) * uStrength, (hD - hU) * uStrength, 1.0));
  vec2 rb = texture(tB, vUv).rg;
  // cavity from local height relative to neighborhood
  float cav = clamp(1.0 - (((hL+hR+hD+hU)*0.25) - h0) * uStrength * 0.25, 0.4, 1.0);
  fragColor = vec4(n.xy * 0.5 + 0.5, rb.r, cav * rb.g);
}
`,
    tE = {
      paper: {
        strength: 2.2,
        src: `
vec4 albedoH(vec2 uv){
  float cols = 4.0;
  float cx = fract(uv.x*cols);
  float colId = floor(uv.x*cols);
  float bandC = abs(cx-0.5);
  float band = 1.0 - smoothstep(0.072, 0.082, bandC);
  float pin = 1.0 - smoothstep(0.0035, 0.0075, abs(bandC-0.10));
  float rows = 8.0;
  float vy = uv.y*rows + mod(colId,2.0)*0.5;
  float fy = fract(vy);
  float lx = (cx-0.5)/0.075;
  float chev = abs(fy - 0.5 + abs(lx)*0.20);
  float chevLine = (1.0 - smoothstep(0.03, 0.055, chev)) * band * (1.0 - smoothstep(0.75, 0.9, abs(lx)));
  vec2 q = vec2(fract(uv.x*cols + 0.5)-0.5, fract(uv.y*rows*0.5 + mod(colId,2.0)*0.25) - 0.5);
  float dotPat = 1.0 - smoothstep(0.010, 0.02, length(q*vec2(1.0, 0.55)));
  float pattern = clamp(band*0.30 + pin*0.55 + chevLine*0.75 + dotPat*0.45, 0.0, 1.0);
  float fib = fbm(uv*64.0, vec2(64.0), 4);
  float fine = pix(uv, vec2(512.0));
  float stri = gnoise(vec2(uv.x*200.0, uv.y*5.0), vec2(200.0, 5.0));
  float L = 0.93 - pattern*0.20 + (fib-0.5)*0.07 + (fine-0.5)*0.03 + (stri-0.5)*0.04;
  float h = 0.5 + pattern*0.16 + (fib-0.5)*0.32 + (fine-0.5)*0.12;
  return vec4(vec3(L), h);
}
vec2 roughAO(vec2 uv){ return vec2(0.78, 1.0); }
`,
      },
      carpet: {
        strength: 3,
        src: `
vec4 albedoH(vec2 uv){
  float w = pix(uv, vec2(1024.0));
  float n2 = gnoise(uv*256.0, vec2(256.0));
  float n3 = fbm(uv*20.0, vec2(20.0), 4);
  float n4 = fbm(uv*3.0, vec2(3.0), 3);
  vec3 wv = worley(uv*170.0, vec2(170.0));
  float tuft = smoothstep(0.0, 0.65, wv.x);
  vec3 base = vec3(0.29, 0.225, 0.11);
  vec3 c = base * (0.86 + 0.20*(n3-0.5) + 0.16*(n2-0.5) + 0.16*(w-0.5) + 0.14*(n4-0.5));
  c *= mix(0.84, 1.06, tuft);
  c.r *= 1.0 + 0.07*(n4-0.5);
  c.b *= 1.0 - 0.08*(n3-0.5);
  float h = 0.42*w + 0.33*n2 + 0.25*(1.0-tuft);
  return vec4(c, h);
}
vec2 roughAO(vec2 uv){ return vec2(0.96, 1.0); }
`,
      },
      tiles: {
        strength: 2.5,
        src: `
vec4 albedoH(vec2 uv){
  vec2 p = uv*2.0;
  vec2 f = fract(p);
  vec2 dl = abs(f - 0.5);
  float edge = max(dl.x, dl.y);
  float barW = 0.02;
  float bar = smoothstep(0.5-barW-0.004, 0.5-barW, edge);
  vec3 wv = worley(uv*84.0, vec2(84.0));
  float pits = 1.0 - smoothstep(0.07, 0.18, wv.x);
  float worm = (1.0 - smoothstep(0.015, 0.05, abs(wv.y - wv.x))) * step(0.6, wv.z);
  float sp = pix(uv, vec2(1024.0));
  float n = fbm(uv*10.0, vec2(10.0), 4);
  float tvar = hash12(floor(p) + 7.0);
  vec3 tileC = vec3(0.60, 0.585, 0.53) * (0.93 + 0.07*tvar) * (0.94 + 0.12*(n-0.5)) * (1.0 - pits*0.32 - worm*0.18) * (0.97 + 0.06*(sp-0.5));
  float bevel = smoothstep(0.5-barW-0.035, 0.5-barW-0.003, edge);
  tileC *= 1.0 - bevel*0.22;
  vec3 barC = vec3(0.55, 0.55, 0.53) * (0.95 + 0.05*n);
  vec3 c = mix(tileC, barC, bar);
  float h = mix(0.32 - pits*0.14 - worm*0.06 - bevel*0.10 + (sp-0.5)*0.03, 0.78, bar);
  return vec4(c, h);
}
vec2 roughAO(vec2 uv){ return vec2(0.9, 1.0); }
`,
      },
      grime: {
        raw: !0,
        src: `
vec4 albedoH(vec2 uv){
  float r = fbm(uv*4.0, vec2(4.0), 6);
  float g = fbm(uv*7.0 + 3.7, vec2(7.0), 6);
  float b = worley(uv*40.0, vec2(40.0)).x;
  float a = fbm(vec2(uv.x*36.0, uv.y*2.0), vec2(36.0, 2.0), 4);
  return vec4(r, g, b, a);
}
vec2 roughAO(vec2 uv){ return vec2(1.0); }
`,
      },
      tile: {
        strength: 4,
        src: `
vec4 albedoH(vec2 uv){
  vec2 p = uv*8.0;
  vec2 f = fract(p);
  vec2 id = floor(p);
  vec2 dl = abs(f-0.5);
  float e = max(dl.x, dl.y);
  float grout = smoothstep(0.455, 0.475, e);
  float tv = hash12(id + 13.0);
  float n = fbm(uv*16.0, vec2(16.0), 4);
  float sp = pix(uv, vec2(1024.0));
  vec3 tileC = vec3(0.78, 0.80, 0.80) * (0.95 + 0.06*tv) * (0.98 + 0.04*(n-0.5));
  float edgeShade = smoothstep(0.38, 0.47, e);
  tileC *= 1.0 - edgeShade*0.08;
  vec3 groutC = vec3(0.42, 0.43, 0.41) * (0.85 + 0.3*n) * (0.9 + 0.2*sp);
  vec3 c = mix(tileC, groutC, grout);
  float h = mix(0.8 - edgeShade*0.25 + (n-0.5)*0.02, 0.15, grout);
  return vec4(c, h);
}
vec2 roughAO(vec2 uv){
  vec2 f = fract(uv*8.0); float e = max(abs(f.x-0.5), abs(f.y-0.5));
  return vec2(mix(0.12, 0.85, smoothstep(0.455, 0.475, e)), 1.0);
}
`,
      },
      concrete: {
        strength: 2,
        src: `
vec4 albedoH(vec2 uv){
  float n1 = fbm(uv*3.0, vec2(3.0), 6);
  float n2 = fbm(uv*24.0, vec2(24.0), 4);
  vec3 wv = worley(uv*60.0, vec2(60.0));
  float pores = 1.0 - smoothstep(0.03, 0.09, wv.x);
  float sp = pix(uv, vec2(1024.0));
  float form = smoothstep(0.495, 0.5, abs(fract(uv.y*2.0)-0.5)) * 0.4; // formwork seam
  vec3 c = vec3(0.30, 0.29, 0.27) * (0.85 + 0.3*(n1-0.5)) * (0.94 + 0.12*(n2-0.5)) * (1.0 - pores*0.35) * (0.96 + 0.08*(sp-0.5));
  c *= 1.0 - form*0.3;
  float h = 0.5 + (n2-0.5)*0.4 - pores*0.3 + (sp-0.5)*0.1 - form*0.2;
  return vec4(c, h);
}
vec2 roughAO(vec2 uv){ return vec2(0.88, 1.0); }
`,
      },
      asphalt: {
        strength: 2.5,
        src: `
vec4 albedoH(vec2 uv){
  float n1 = fbm(uv*3.0, vec2(3.0), 6);
  vec3 wv = worley(uv*260.0, vec2(260.0));
  float stone = smoothstep(0.55, 0.2, wv.x);
  float sp = pix(uv, vec2(1024.0));
  vec3 c = vec3(0.12, 0.12, 0.115) * (0.8 + 0.4*(n1-0.5)) * (0.8 + 0.45*stone*wv.z) * (0.92 + 0.16*(sp-0.5));
  float h = 0.4 + stone*0.4 + (sp-0.5)*0.1;
  return vec4(c, h);
}
vec2 roughAO(vec2 uv){ return vec2(0.8, 1.0); }
`,
      },
      brick: {
        strength: 4,
        src: `
vec4 albedoH(vec2 uv){
  vec2 p = uv*vec2(4.0, 12.0);
  float row = floor(p.y);
  p.x += mod(row, 2.0)*0.5;
  vec2 id = floor(p); vec2 f = fract(p);
  float mx = min(f.x, 1.0-f.x)*0.3, my = min(f.y, 1.0-f.y)*0.1;
  float mort = 1.0 - smoothstep(0.004, 0.009, min(mx, my));
  float bv = hash12(mod(id, vec2(4.0,12.0)) + 5.0);
  float n = fbm(uv*20.0, vec2(20.0), 5);
  float sp = pix(uv, vec2(1024.0));
  vec3 bc = mix(vec3(0.25, 0.10, 0.06), vec3(0.32, 0.16, 0.10), bv) * (0.85 + 0.3*(n-0.5)) * (0.93+0.14*(sp-0.5));
  vec3 mc = vec3(0.25, 0.24, 0.22) * (0.8 + 0.4*n);
  vec3 c = mix(bc, mc, mort);
  float h = mix(0.75 + (n-0.5)*0.2, 0.25, mort);
  return vec4(c, h);
}
vec2 roughAO(vec2 uv){ return vec2(0.9, 1.0); }
`,
      },
      grating: {
        strength: 5,
        src: `
vec4 albedoH(vec2 uv){
  vec2 p = uv*vec2(32.0, 10.0);
  vec2 f = fract(p);
  float barX = smoothstep(0.82, 0.86, abs(f.x-0.5)*2.0);
  float barY = smoothstep(0.78, 0.84, abs(f.y-0.5)*2.0);
  float bar = max(barX, barY);
  float n = fbm(uv*8.0, vec2(8.0), 5);
  float rust = smoothstep(0.5, 0.75, fbm(uv*5.0+2.0, vec2(5.0), 5));
  vec3 metal = mix(vec3(0.20, 0.20, 0.21), vec3(0.22, 0.10, 0.04), rust) * (0.8 + 0.4*n);
  vec3 hole = vec3(0.004);
  vec3 c = mix(hole, metal, bar);
  float h = bar*0.9;
  return vec4(c, h);
}
vec2 roughAO(vec2 uv){ return vec2(0.6, 1.0); }
`,
      },
      lino: {
        strength: 1.5,
        src: `
vec4 albedoH(vec2 uv){
  vec2 p = uv*4.0; vec2 f = fract(p); vec2 id = floor(p);
  float seam = smoothstep(0.492, 0.498, max(abs(f.x-0.5), abs(f.y-0.5)));
  float tv = hash12(mod(id, vec2(4.0)) + 2.0);
  float chip = smoothstep(0.7, 0.75, pix(uv, vec2(512.0)));
  float n = fbm(uv*12.0, vec2(12.0), 5);
  vec3 c = mix(vec3(0.40, 0.42, 0.36), vec3(0.36, 0.39, 0.34), tv) * (0.92 + 0.12*(n-0.5));
  c = mix(c, vec3(0.2, 0.2, 0.18), chip*0.35);
  c *= 1.0 - seam*0.4;
  float h = 0.5 - seam*0.3 + chip*0.05;
  return vec4(c, h);
}
vec2 roughAO(vec2 uv){ return vec2(0.35, 1.0); }
`,
      },
      officeCarpet: {
        strength: 2.5,
        src: `
vec4 albedoH(vec2 uv){
  vec2 p = uv*4.0; vec2 f = fract(p); vec2 id = floor(p);
  float seam = smoothstep(0.49, 0.497, max(abs(f.x-0.5), abs(f.y-0.5)));
  float dir = mod(id.x + id.y, 2.0);
  float w = pix(uv, vec2(1024.0));
  float stri = gnoise(dir > 0.5 ? vec2(uv.x*400.0, uv.y*20.0) : vec2(uv.x*20.0, uv.y*400.0), dir > 0.5 ? vec2(400.0,20.0) : vec2(20.0,400.0));
  float n = fbm(uv*6.0, vec2(6.0), 4);
  vec3 c = vec3(0.07, 0.085, 0.11) * (0.85 + 0.25*(w-0.5) + 0.2*(stri-0.5) + 0.2*(n-0.5));
  c *= 1.0 - seam*0.3;
  float h = 0.5*w + 0.3*stri - seam*0.3;
  return vec4(c, h);
}
vec2 roughAO(vec2 uv){ return vec2(0.97, 1.0); }
`,
      },
      drywall: {
        strength: 1.2,
        src: `
vec4 albedoH(vec2 uv){
  float n = fbm(uv*30.0, vec2(30.0), 5);
  float o = fbm(uv*3.0, vec2(3.0), 4);
  float sp = pix(uv, vec2(1024.0));
  vec3 c = vec3(0.55, 0.55, 0.52) * (0.95 + 0.06*(n-0.5) + 0.08*(o-0.5)) * (0.985 + 0.03*(sp-0.5));
  float h = 0.5 + (n-0.5)*0.25 + (sp-0.5)*0.05;
  return vec4(c, h);
}
vec2 roughAO(vec2 uv){ return vec2(0.85, 1.0); }
`,
      },
    },
    hd = class {
      constructor(t) {
        ((this.r = t),
          (this.scene = new qi()),
          (this.cam = new $i(-1, 1, 1, -1, 0, 1)),
          (this.quad = new te(new Un(2, 2))),
          (this.quad.frustumCulled = !1),
          this.scene.add(this.quad),
          (this.cache = new Map()),
          (this.maxAniso = t.capabilities.getMaxAnisotropy()),
          (this.normalMat = new De({
            glslVersion: yn,
            vertexShader: _2,
            fragmentShader: Q5,
            uniforms: {
              tA: { value: null },
              tB: { value: null },
              uTexel: { value: new ut() },
              uStrength: { value: 2 },
            },
            depthTest: !1,
            depthWrite: !1,
          })));
      }
      makeRT(t, e) {
        let n = new vn(t, t, {
          type: hn,
          format: on,
          minFilter: e ? hi : Le,
          magFilter: Le,
          generateMipmaps: !!e,
          depthBuffer: !1,
          wrapS: Ss,
          wrapT: Ss,
        });
        return (
          (n.texture.wrapS = n.texture.wrapT = Ss),
          (n.texture.anisotropy = this.maxAniso),
          n
        );
      }
      bake(t, e, n = 1) {
        let i = t + ":" + e + ":" + n;
        if (this.cache.has(i)) return this.cache.get(i);
        let r = tE[t],
          o = new De({
            glslVersion: yn,
            vertexShader: _2,
            fragmentShader: Z5 + r.src + J5,
            uniforms: {
              uMode: { value: 0 },
              uRaw: { value: r.raw ? 1 : 0 },
              uSeed: { value: n * 0.731 },
            },
            depthTest: !1,
            depthWrite: !1,
          }),
          a = this.r,
          c = a.getRenderTarget(),
          l = this.makeRT(e, !0);
        ((this.quad.material = o),
          a.setRenderTarget(l),
          a.render(this.scene, this.cam));
        let h = { albedo: l.texture, rtA: l };
        if (!r.raw) {
          let u = this.makeRT(e, !1);
          ((o.uniforms.uMode.value = 1),
            a.setRenderTarget(u),
            a.render(this.scene, this.cam));
          let f = this.makeRT(e, !0);
          ((this.normalMat.uniforms.tA.value = l.texture),
            (this.normalMat.uniforms.tB.value = u.texture),
            this.normalMat.uniforms.uTexel.value.set(1 / e, 1 / e),
            (this.normalMat.uniforms.uStrength.value = r.strength || 2),
            (this.quad.material = this.normalMat),
            a.setRenderTarget(f),
            a.render(this.scene, this.cam),
            u.dispose(),
            (h.normal = f.texture),
            (h.rtN = f));
        }
        return (a.setRenderTarget(c), o.dispose(), this.cache.set(i, h), h);
      }
      disposeExcept(t) {
        for (let [e, n] of this.cache)
          t.has(e.split(":")[0]) ||
            (n.rtA && n.rtA.dispose(),
            n.rtN && n.rtN.dispose(),
            this.cache.delete(e));
      }
    };
  var ud = class {
    constructor(t) {
      ((this.root = t),
        (this.move = { x: 0, y: 0 }),
        (this.sprint = !1),
        (this.lookDX = 0),
        (this.lookDY = 0),
        (this.attackHeld = !1),
        (this.pressed = new Set()),
        (this.sens = 1),
        (this.invertY = !1),
        (this.enabled = !1),
        (this.keys = new Set()),
        (this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 }),
        (this.look = { id: null, x: 0, y: 0 }),
        (this.attackPtr = { id: null, x: 0, y: 0 }),
        (this.joyR = 56),
        (this.isTouch =
          matchMedia("(pointer: coarse)").matches || "ontouchstart" in window),
        (this.pointerLocked = !1),
        this._bind());
    }
    vib(t) {
      try {
        navigator.vibrate && navigator.vibrate(t);
      } catch {}
    }
    _bind() {
      let t = this.root.querySelector("#touch-layer");
      ((this.layer = t),
        (this.joyBase = this.root.querySelector("#joy-base")),
        (this.joyKnob = this.root.querySelector("#joy-knob")));
      let e = () => window.innerWidth;
      (t.addEventListener(
        "pointerdown",
        (r) => {
          if (this.enabled) {
            if ((r.preventDefault(), r.pointerType === "mouse")) {
              if (!this.pointerLocked && t.requestPointerLock)
                try {
                  t.requestPointerLock();
                } catch {}
              r.button === 0 &&
                ((this.attackHeld = !0), this.pressed.add("attack"));
              return;
            }
            if (r.clientX < e() * 0.42 && this.joy.id === null) {
              this.joy.id = r.pointerId;
              let o = this.joyR,
                a = Math.max(o + 12, Math.min(e() * 0.42 - o, r.clientX)),
                c = Math.max(
                  o + 12,
                  Math.min(window.innerHeight - o - 8, r.clientY),
                );
              ((this.joy.ox = a),
                (this.joy.oy = c),
                (this.joy.x = r.clientX),
                (this.joy.y = r.clientY),
                (this.joyBase.style.transform = `translate(${a - o}px, ${c - o}px)`),
                this.joyBase.classList.add("active"),
                this._updJoy());
            } else
              this.look.id === null &&
                ((this.look.id = r.pointerId),
                (this.look.x = r.clientX),
                (this.look.y = r.clientY));
            try {
              t.setPointerCapture(r.pointerId);
            } catch {}
          }
        },
        { passive: !1 },
      ),
        t.addEventListener(
          "pointermove",
          (r) => {
            if (this.enabled) {
              if (r.pointerType === "mouse") {
                this.pointerLocked &&
                  ((this.lookDX += r.movementX * 0.55),
                  (this.lookDY += r.movementY * 0.55));
                return;
              }
              r.pointerId === this.joy.id
                ? ((this.joy.x = r.clientX),
                  (this.joy.y = r.clientY),
                  this._updJoy())
                : r.pointerId === this.look.id &&
                  ((this.lookDX += r.clientX - this.look.x),
                  (this.lookDY += r.clientY - this.look.y),
                  (this.look.x = r.clientX),
                  (this.look.y = r.clientY));
            }
          },
          { passive: !1 },
        ));
      let n = (r) => {
        if (r.pointerType === "mouse") {
          r.button === 0 && (this.attackHeld = !1);
          return;
        }
        (r.pointerId === this.joy.id &&
          ((this.joy.id = null),
          (this.move.x = this.move.y = 0),
          (this.sprint = !1),
          this.joyBase.classList.remove("active"),
          this._resetJoyVis()),
          r.pointerId === this.look.id && (this.look.id = null));
      };
      (t.addEventListener("pointerup", n),
        t.addEventListener("pointercancel", n),
        document.addEventListener("pointerlockchange", () => {
          this.pointerLocked = document.pointerLockElement === t;
        }),
        document.addEventListener("mousemove", (r) => {
          this.enabled &&
            this.pointerLocked &&
            ((this.lookDX += r.movementX * 0.55),
            (this.lookDY += r.movementY * 0.55));
        }),
        document.addEventListener("mouseup", (r) => {
          r.button === 0 && (this.attackHeld = !1);
        }));
      let i = (r, o, a, c) => {
        let l = this.root.querySelector(r);
        if (!l) return;
        (l.addEventListener("pointerdown", (u) => {
          if (!(!this.enabled && !l.dataset.always)) {
            (u.preventDefault(), u.stopPropagation(), l.classList.add("down"));
            try {
              l.setPointerCapture(u.pointerId);
            } catch {}
            ((l._pid = u.pointerId),
              (l._x = u.clientX),
              (l._y = u.clientY),
              o && o(u, l));
          }
        }),
          l.addEventListener("pointermove", (u) => {
            c &&
              l._pid === u.pointerId &&
              this.enabled &&
              ((this.lookDX += (u.clientX - l._x) * 0.8),
              (this.lookDY += (u.clientY - l._y) * 0.8),
              (l._x = u.clientX),
              (l._y = u.clientY));
          }));
        let h = (u) => {
          l._pid === u.pointerId &&
            ((l._pid = null), l.classList.remove("down"), a && a(u, l));
        };
        (l.addEventListener("pointerup", h),
          l.addEventListener("pointercancel", h),
          l.addEventListener("contextmenu", (u) => u.preventDefault()));
      };
      (i(
        "#btn-attack",
        () => {
          ((this.attackHeld = !0), this.pressed.add("attack"), this.vib(8));
        },
        () => {
          this.attackHeld = !1;
        },
        !0,
      ),
        i("#btn-jump", () => {
          (this.pressed.add("jump"), this.vib(6));
        }),
        i(
          "#btn-stance",
          (r, o) => {
            ((o._t = performance.now()),
              (o._long = !1),
              clearTimeout(o._timer),
              (o._timer = setTimeout(() => {
                ((o._long = !0),
                  this.pressed.add("prone"),
                  this.vib(18),
                  o.classList.add("long"));
              }, 380)));
          },
          (r, o) => {
            (clearTimeout(o._timer),
              o.classList.remove("long"),
              o._long || (this.pressed.add("crouch"), this.vib(6)));
          },
        ),
        i("#btn-act", () => {
          (this.pressed.add("act"), this.vib(10));
        }),
        i("#btn-map", () => {
          this.pressed.add("map");
        }),
        i("#btn-pause", () => {
          this.pressed.add("pause");
        }),
        i(
          "#btn-weapon",
          (r, o) => {
            ((o._long = !1),
              clearTimeout(o._timer),
              (o._timer = setTimeout(() => {
                ((o._long = !0),
                  this.pressed.add("reload"),
                  this.vib(15),
                  o.classList.add("long"));
              }, 420)));
          },
          (r, o) => {
            (clearTimeout(o._timer),
              o.classList.remove("long"),
              o._long || (this.pressed.add("cycle"), this.vib(6)));
          },
        ),
        i("#btn-bag", () => {
          (this.pressed.add("bag"), this.vib(6));
        }));
      for (let r = 0; r < 3; r++)
        i("#sk" + r, () => {
          (this.pressed.add("skill" + r), this.vib(10));
        });
      ((this.bindBtn = i),
        (this.slotBound = new Set()),
        window.addEventListener("keydown", (r) => {
          if (!r.repeat) {
            if ((this.keys.add(r.code), !this.enabled)) {
              r.code === "Escape" && this.pressed.add("pause");
              return;
            }
            switch (r.code) {
              case "Space":
                (this.pressed.add("jump"), r.preventDefault());
                break;
              case "KeyC":
              case "ControlLeft":
                this.pressed.add("crouch");
                break;
              case "KeyZ":
              case "KeyX":
                this.pressed.add("prone");
                break;
              case "KeyE":
                this.pressed.add("act");
                break;
              case "KeyM":
              case "Tab":
                (this.pressed.add("map"), r.preventDefault());
                break;
              case "Escape":
              case "KeyP":
                this.pressed.add("pause");
                break;
              case "KeyQ":
                this.pressed.add("cycle");
                break;
              case "KeyR":
                this.pressed.add("reload");
                break;
              case "KeyB":
              case "KeyI":
                this.pressed.add("bag");
                break;
              case "KeyF":
                this.pressed.add("skill0");
                break;
              case "KeyG":
                this.pressed.add("skill1");
                break;
              case "KeyT":
                this.pressed.add("skill2");
                break;
              default: {
                let o = /^Digit(\d)$/.exec(r.code);
                if (o) {
                  let a = (+o[1] + 9) % 10;
                  this.pressed.add("slot" + a);
                }
              }
            }
          }
        }),
        window.addEventListener("keyup", (r) => {
          this.keys.delete(r.code);
        }),
        window.addEventListener("blur", () => {
          (this.keys.clear(), (this.attackHeld = !1));
        }),
        window.addEventListener(
          "wheel",
          (r) => {
            this.enabled && this.pressed.add("cycle");
          },
          { passive: !0 },
        ));
    }
    bindSlots(t) {
      for (let e = 0; e < t; e++) {
        let n = this.root.querySelector("#slot" + e);
        !n ||
          n._bound ||
          ((n._bound = !0),
          this.bindBtn(
            "#slot" + e,
            (i, r) => {
              ((r._long = !1),
                clearTimeout(r._timer),
                (r._timer = setTimeout(() => {
                  ((r._long = !0), this.pressed.add("drop" + e), this.vib(18));
                }, 520)));
            },
            (i, r) => {
              (clearTimeout(r._timer),
                r._long || (this.pressed.add("slot" + e), this.vib(6)));
            },
          ));
      }
    }
    _updJoy() {
      let t = this.joyR,
        e = this.joy.x - this.joy.ox,
        n = this.joy.y - this.joy.oy,
        i = Math.hypot(e, n),
        r = i > t ? t / i : 1,
        o = e * r,
        a = n * r;
      this.joyKnob.style.transform = `translate(${o}px, ${a}px)`;
      let c = o / t,
        l = -a / t;
      (Math.hypot(c, l) < 0.12 && ((c = 0), (l = 0)),
        (this.move.x = c),
        (this.move.y = l),
        (this.sprint = i > t * 0.94),
        this.joyBase.classList.toggle("sprint", this.sprint));
    }
    _resetJoyVis() {
      ((this.joyKnob.style.transform = "translate(0px,0px)"),
        (this.joyBase.style.transform = ""),
        this.joyBase.classList.remove("sprint"));
    }
    poll() {
      if (this.joy.id === null) {
        let t = 0,
          e = 0,
          n = this.keys;
        ((n.has("KeyW") || n.has("ArrowUp")) && (e += 1),
          (n.has("KeyS") || n.has("ArrowDown")) && (e -= 1),
          (n.has("KeyD") || n.has("ArrowRight")) && (t += 1),
          (n.has("KeyA") || n.has("ArrowLeft")) && (t -= 1));
        let i = Math.hypot(t, e);
        (i > 0 && ((t /= i), (e /= i)),
          (this.move.x = t),
          (this.move.y = e),
          (this.sprint = (n.has("ShiftLeft") || n.has("ShiftRight")) && i > 0));
      }
    }
    consumeLook() {
      let t = [this.lookDX, this.lookDY];
      return ((this.lookDX = 0), (this.lookDY = 0), t);
    }
    take(t) {
      return this.pressed.has(t) ? (this.pressed.delete(t), !0) : !1;
    }
    clear() {
      (this.pressed.clear(),
        (this.lookDX = this.lookDY = 0),
        (this.attackHeld = !1));
    }
    releaseAll() {
      if (
        ((this.joy.id = null),
        (this.look.id = null),
        (this.move.x = this.move.y = 0),
        (this.sprint = !1),
        (this.attackHeld = !1),
        this.joyBase &&
          (this.joyBase.classList.remove("active"), this._resetJoyVis()),
        document.pointerLockElement)
      )
        try {
          document.exitPointerLock();
        } catch {}
    }
  };
  var b2 = [
      "黄色の区画",
      "赤の区画",
      "青の区画",
      "黒の区画",
    ],
    M2 = [
      "",
      "即死の罠と怪物が多い。だが次の階段は近い",
      "出口は2つだけの頑丈な迷路。宝が眠るが、粘着質な怪物がどこまでも付いてくる",
      "強力な怪物が一体。この区画は移動する",
    ],
    ah = {
      yellow: {
        id: "yellow",
        name: "黄色の部屋",
        en: "THE YELLOW ROOMS",
        ceilH: 3,
        wallKind: "paper",
        floorKind: "carpet",
        ceilKind: "tiles",
        lightCol: [1, 0.93, 0.74],
        lightI: 1.2,
        ambient: [0.012, 0.011, 0.006],
        fogCol: [0.42, 0.36, 0.17],
        fogDen: 0.019,
        lightOn: 0.8,
        lightFlick: 0.05,
        darkPatch: 0.16,
        roomMin: 1,
        stopChance: 0.22,
        maxArea: 70,
        wallRemove: 0.07,
        stubs: 0.035,
        pillarChance: 0.35,
        doorChance: 0.45,
        grade: {
          lift: [0.012, 0.01, 0],
          gamma: [1, 1, 1.04],
          gain: [1.06, 1, 0.9],
          sat: 0.95,
        },
        exposure: 1.25,
        baseboard: [0.2, 0.15, 0.08],
      },
      pool: {
        id: "pool",
        name: "水没したプール",
        en: "THE POOLROOMS",
        ceilH: 4.6,
        wallKind: "tile",
        floorKind: "tile",
        ceilKind: "tilesWhite",
        lightCol: [0.92, 0.98, 1],
        lightI: 1.15,
        ambient: [0.03, 0.04, 0.045],
        fogCol: [0.55, 0.66, 0.7],
        fogDen: 0.016,
        lightOn: 0.88,
        lightFlick: 0.02,
        darkPatch: 0.05,
        roomMin: 2,
        stopChance: 0.35,
        maxArea: 120,
        wallRemove: 0.18,
        stubs: 0.02,
        pillarChance: 0.65,
        doorChance: 0.1,
        grade: {
          lift: [0, 0.01, 0.015],
          gamma: [1, 1, 1],
          gain: [0.96, 1.02, 1.06],
          sat: 0.85,
        },
        exposure: 0.95,
        baseboard: [0.55, 0.6, 0.62],
        water: !0,
      },
      abyss: {
        id: "abyss",
        name: "奈落の足場",
        en: "THE ABYSS WALKWAYS",
        ceilH: 7,
        wallKind: "concrete",
        floorKind: "grating",
        ceilKind: "dark",
        lightCol: [1, 0.62, 0.3],
        lightI: 1.3,
        ambient: [0.01, 0.006, 0.004],
        fogCol: [0.07, 0.04, 0.025],
        fogDen: 0.018,
        lightOn: 0.6,
        lightFlick: 0.08,
        darkPatch: 0.2,
        roomMin: 2,
        stopChance: 0.3,
        maxArea: 90,
        wallRemove: 0.55,
        stubs: 0,
        pillarChance: 0.1,
        doorChance: 0.15,
        grade: {
          lift: [0.01, 0.004, 0],
          gamma: [1, 1.02, 1.08],
          gain: [1.08, 0.97, 0.85],
          sat: 0.9,
        },
        exposure: 1.1,
        baseboard: [0.12, 0.12, 0.12],
        heights: !0,
      },
      parking: {
        id: "parking",
        name: "地下駐車場",
        en: "THE PARKING LEVEL",
        ceilH: 2.7,
        wallKind: "concrete",
        floorKind: "asphalt",
        ceilKind: "concreteCeil",
        lightCol: [0.85, 1, 0.86],
        lightI: 0.95,
        ambient: [0.006, 0.007, 0.006],
        fogCol: [0.11, 0.13, 0.11],
        fogDen: 0.024,
        lightOn: 0.62,
        lightFlick: 0.08,
        darkPatch: 0.28,
        roomMin: 3,
        stopChance: 0.45,
        maxArea: 160,
        wallRemove: 0.2,
        stubs: 0.01,
        pillarChance: 0.95,
        doorChance: 0.05,
        grade: {
          lift: [0, 0.006, 0.003],
          gamma: [1.02, 1, 1],
          gain: [0.95, 1.03, 0.94],
          sat: 0.8,
        },
        exposure: 1.1,
        baseboard: [0.6, 0.55, 0.1],
      },
      pipes: {
        id: "pipes",
        name: "配管の迷路",
        en: "THE PIPE WORKS",
        ceilH: 3.2,
        wallKind: "brick",
        floorKind: "concrete",
        ceilKind: "concreteCeil",
        lightCol: [1, 0.58, 0.3],
        lightI: 1.3,
        ambient: [0.01, 0.005, 0.003],
        fogCol: [0.16, 0.08, 0.04],
        fogDen: 0.028,
        lightOn: 0.72,
        lightFlick: 0.12,
        darkPatch: 0.14,
        roomMin: 1,
        stopChance: 0.1,
        maxArea: 30,
        wallRemove: 0.03,
        stubs: 0.05,
        pillarChance: 0.05,
        doorChance: 0.35,
        grade: {
          lift: [0.012, 0.004, 0],
          gamma: [1, 1.04, 1.1],
          gain: [1.1, 0.95, 0.82],
          sat: 0.95,
        },
        exposure: 1.15,
        baseboard: [0.1, 0.08, 0.07],
        pipes: !0,
      },
      hospital: {
        id: "hospital",
        name: "廃病棟",
        en: "THE EMPTY WARD",
        ceilH: 2.9,
        wallKind: "hospital",
        floorKind: "lino",
        ceilKind: "tiles",
        lightCol: [0.82, 1, 0.92],
        lightI: 0.95,
        ambient: [0.006, 0.008, 0.008],
        fogCol: [0.16, 0.2, 0.19],
        fogDen: 0.022,
        lightOn: 0.6,
        lightFlick: 0.14,
        darkPatch: 0.24,
        roomMin: 1,
        stopChance: 0.25,
        maxArea: 40,
        wallRemove: 0.04,
        stubs: 0.03,
        pillarChance: 0.1,
        doorChance: 0.75,
        grade: {
          lift: [0, 0.006, 0.006],
          gamma: [1.03, 1, 1],
          gain: [0.92, 1.03, 1],
          sat: 0.78,
        },
        exposure: 1.05,
        baseboard: [0.25, 0.3, 0.28],
      },
      office: {
        id: "office",
        name: "消灯したオフィス",
        en: "THE DARK OFFICE",
        ceilH: 2.9,
        wallKind: "office",
        floorKind: "officeCarpet",
        ceilKind: "tiles",
        lightCol: [0.88, 0.93, 1],
        lightI: 0.9,
        ambient: [0.003, 0.0035, 0.0045],
        fogCol: [0.04, 0.045, 0.055],
        fogDen: 0.03,
        lightOn: 0.22,
        lightFlick: 0.1,
        darkPatch: 0.45,
        roomMin: 2,
        stopChance: 0.4,
        maxArea: 140,
        wallRemove: 0.1,
        stubs: 0.01,
        pillarChance: 0.4,
        doorChance: 0.4,
        grade: {
          lift: [0, 0, 0.006],
          gamma: [1.02, 1, 0.98],
          gain: [0.95, 0.98, 1.05],
          sat: 0.8,
        },
        exposure: 1.2,
        baseboard: [0.1, 0.1, 0.11],
        cubicles: !0,
      },
    },
    S2 = ["pool", "abyss", "parking", "pipes", "hospital", "office"],
    fd = [
      [0.6, 0.49, 0.19],
      [0.42, 0.045, 0.035],
      [0.07, 0.15, 0.4],
      [0.016, 0.016, 0.018],
    ];
  function eE(s) {
    return function () {
      ((s |= 0), (s = (s + 1831565813) | 0));
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      return (
        (t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t),
        ((t ^ (t >>> 14)) >>> 0) / 4294967296
      );
    };
  }
  var Ci = class {
    constructor(t) {
      ((this.seed = t >>> 0), (this.f = eE(this.seed)));
    }
    next() {
      return this.f();
    }
    range(t, e) {
      return t + (e - t) * this.f();
    }
    int(t, e) {
      return t + Math.floor(this.f() * (e - t + 1));
    }
    chance(t) {
      return this.f() < t;
    }
    pick(t) {
      return t[Math.floor(this.f() * t.length)];
    }
    shuffle(t) {
      for (let e = t.length - 1; e > 0; e--) {
        let n = Math.floor(this.f() * (e + 1)),
          i = t[e];
        ((t[e] = t[n]), (t[n] = i));
      }
      return t;
    }
    weighted(t) {
      let e = 0;
      for (let i of t) e += i[1];
      let n = this.f() * e;
      for (let i of t) if (((n -= i[1]), n <= 0)) return i[0];
      return t[t.length - 1][0];
    }
  };
  function Qn(s, t, e = 0) {
    let n =
      (Math.imul(s | 0, 374761393) +
        Math.imul(t | 0, 668265263) +
        Math.imul(e | 0, 1442695041)) |
      0;
    return (
      (n = Math.imul(n ^ (n >>> 13), 1274126177)),
      (n ^= n >>> 16),
      (n >>> 0) / 4294967296
    );
  }
  function nE(s, t, e = 0) {
    let n = Math.floor(s),
      i = Math.floor(t),
      r = s - n,
      o = t - i,
      a = r * r * (3 - 2 * r),
      c = o * o * (3 - 2 * o),
      l = Qn(n, i, e),
      h = Qn(n + 1, i, e),
      u = Qn(n, i + 1, e),
      f = Qn(n + 1, i + 1, e);
    return l + (h - l) * a + (u + (f - u) * a - (l + (h - l) * a)) * c;
  }
  function mc(s, t, e = 0, n = 3) {
    let i = 0,
      r = 0.5,
      o = 0;
    for (let a = 0; a < n; a++)
      ((i += r * nE(s, t, e + a * 17)),
        (o += r),
        (s *= 2.03),
        (t *= 2.03),
        (r *= 0.5));
    return i / o;
  }
  var ke = (s, t, e) => (s < t ? t : s > e ? e : s),
    _n = (s, t, e) => s + (t - s) * e;
  function Io(s, t, e) {
    switch (s) {
      case 3:
        return [t, e];
      case 1:
        return [4 - t, 4 - e];
      case 0:
        return [4 - e, t];
      default:
        return [e, 4 - t];
    }
  }
  function ch(s, t, e) {
    switch (s) {
      case 3:
        return [t, e];
      case 1:
        return [-t, -e];
      case 0:
        return [-e, t];
      default:
        return [e, -t];
    }
  }
  function w2(s, t, e, n, i, r, o) {
    let a = Io(e, n, i),
      c = Io(e, r, o),
      l = s * 4,
      h = t * 4;
    return [
      l + Math.min(a[0], c[0]),
      h + Math.min(a[1], c[1]),
      l + Math.max(a[0], c[0]),
      h + Math.max(a[1], c[1]),
    ];
  }
  function lh(s, t, e, n, i) {
    let r = Io(e, n, i);
    return [s * 4 + r[0], t * 4 + r[1]];
  }
  function T2(s, t, e) {
    switch (s) {
      case 3:
        return [t, e];
      case 1:
        return [4 - t, 4 - e];
      case 0:
        return [e, 4 - t];
      default:
        return [4 - e, t];
    }
  }
  var F = {
      WALL: 0,
      FLOOR: 1,
      CEIL: 2,
      BASE: 3,
      PILLAR: 4,
      PROP: 5,
      METAL: 6,
      EMIS: 7,
      STEP: 8,
      DARK: 9,
      SIGN: 10,
      FRAME: 11,
      POOL: 12,
      GLASS: 13,
      FABRIC: 14,
      CORE: 15,
      WOOD: 16,
    },
    ks = class {
      constructor() {
        ((this.p = []),
          (this.n = []),
          (this.uv = []),
          (this.m = []),
          (this.s = []),
          (this.c = []),
          (this.idx = []),
          (this.vc = 0));
      }
      quad(t, e, n, i, r, o, a = 0, c = [1, 1, 1], l = null) {
        let h = e[0] - t[0],
          u = e[1] - t[1],
          f = e[2] - t[2],
          d = n[0] - t[0],
          p = n[1] - t[1],
          g = n[2] - t[2],
          m = u * g - f * p,
          x = f * d - h * g,
          v = h * p - u * d,
          y = [t, e, n, i],
          _ = l || [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ];
        m * r[0] + x * r[1] + v * r[2] < 0 &&
          ((y = [t, i, n, e]), (_ = [_[0], _[3], _[2], _[1]]));
        let M = this.vc;
        for (let b = 0; b < 4; b++) {
          let w = y[b];
          (this.p.push(w[0], w[1], w[2]),
            this.n.push(r[0], r[1], r[2]),
            this.uv.push(_[b][0], _[b][1]),
            this.m.push(o),
            this.s.push(a),
            this.c.push(c[0], c[1], c[2]));
        }
        (this.idx.push(M, M + 1, M + 2, M, M + 2, M + 3), (this.vc += 4));
      }
      tri(t, e, n, i, r, o = 0, a = [1, 1, 1]) {
        let c = e[0] - t[0],
          l = e[1] - t[1],
          h = e[2] - t[2],
          u = n[0] - t[0],
          f = n[1] - t[1],
          d = n[2] - t[2],
          p = l * d - h * f,
          g = h * u - c * d,
          m = c * f - l * u,
          x = p * i[0] + g * i[1] + m * i[2] < 0 ? [t, n, e] : [t, e, n],
          v = this.vc;
        for (let y of x)
          (this.p.push(y[0], y[1], y[2]),
            this.n.push(i[0], i[1], i[2]),
            this.uv.push(0, 0),
            this.m.push(r),
            this.s.push(o),
            this.c.push(a[0], a[1], a[2]));
        (this.idx.push(v, v + 1, v + 2), (this.vc += 3));
      }
      cbox(t, e, n, i, r, o, a, c, l = 0, h) {
        a = Math.max(
          0,
          Math.min(a, (i - t) / 2.01, (r - e) / 2.01, (o - n) / 2.01),
        );
        let u = [t, e, n],
          f = [i, r, o];
        for (let d = 0; d < 3; d++)
          for (let p of [-1, 1]) {
            let g = (d + 1) % 3,
              m = (d + 2) % 3,
              x = p > 0 ? f[d] : u[d],
              v = (_, M) => {
                let b = [0, 0, 0];
                return ((b[d] = x), (b[g] = _), (b[m] = M), b);
              },
              y = [0, 0, 0];
            ((y[d] = p),
              this.quad(
                v(u[g] + a, u[m] + a),
                v(f[g] - a, u[m] + a),
                v(f[g] - a, f[m] - a),
                v(u[g] + a, f[m] - a),
                y,
                c,
                l,
                h,
              ));
          }
        if (!(a <= 0)) {
          for (let d = 0; d < 3; d++)
            for (let p = d + 1; p < 3; p++) {
              let g = 3 - d - p;
              for (let m of [-1, 1])
                for (let x of [-1, 1]) {
                  let v = m > 0 ? f[d] : u[d],
                    y = x > 0 ? f[p] : u[p],
                    _ = v - m * a,
                    M = y - x * a,
                    b = (S, T, E) => {
                      let C = [0, 0, 0];
                      return ((C[d] = S), (C[p] = T), (C[g] = E), C);
                    },
                    w = [0, 0, 0];
                  ((w[d] = m * 0.7071),
                    (w[p] = x * 0.7071),
                    this.quad(
                      b(v, M, u[g] + a),
                      b(v, M, f[g] - a),
                      b(_, y, f[g] - a),
                      b(_, y, u[g] + a),
                      w,
                      c,
                      l,
                      h,
                    ));
                }
            }
          for (let d of [-1, 1])
            for (let p of [-1, 1])
              for (let g of [-1, 1]) {
                let m = d > 0 ? i : t,
                  x = p > 0 ? r : e,
                  v = g > 0 ? o : n;
                this.tri(
                  [m, x - p * a, v - g * a],
                  [m - d * a, x, v - g * a],
                  [m - d * a, x - p * a, v],
                  [d * 0.577, p * 0.577, g * 0.577],
                  c,
                  l,
                  h,
                );
              }
        }
      }
      hexa(t, e, n = 0, i, r = 63) {
        let o = [0, 0, 0];
        for (let c of t)
          ((o[0] += c[0] / 8), (o[1] += c[1] / 8), (o[2] += c[2] / 8));
        [
          [0, 1, 2, 3],
          [4, 5, 6, 7],
          [0, 1, 5, 4],
          [3, 2, 6, 7],
          [0, 3, 7, 4],
          [1, 2, 6, 5],
        ].forEach((c, l) => {
          if (!(r & (1 << l))) return;
          let h = t[c[0]],
            u = t[c[1]],
            f = t[c[2]],
            d = t[c[3]],
            p = f[0] - h[0],
            g = f[1] - h[1],
            m = f[2] - h[2],
            x = d[0] - u[0],
            v = d[1] - u[1],
            y = d[2] - u[2],
            _ = [g * y - m * v, m * x - p * y, p * v - g * x],
            M = Math.hypot(_[0], _[1], _[2]) || 1;
          _ = [_[0] / M, _[1] / M, _[2] / M];
          let b = [
            (h[0] + u[0] + f[0] + d[0]) / 4 - o[0],
            (h[1] + u[1] + f[1] + d[1]) / 4 - o[1],
            (h[2] + u[2] + f[2] + d[2]) / 4 - o[2],
          ];
          (_[0] * b[0] + _[1] * b[1] + _[2] * b[2] < 0 &&
            (_ = [-_[0], -_[1], -_[2]]),
            this.quad(h, u, f, d, _, e, n, i));
        });
      }
      tube(t, e, n, i, r, o, a, c, l = 0, h, u = 10, f = 0) {
        let d = (m, x, v) =>
            t === "z"
              ? [i + x, r + v, m]
              : t === "x"
                ? [m, i + x, r + v]
                : [i + x, m, r + v],
          p = (m, x, v) =>
            t === "z" ? [m, x, v] : t === "x" ? [v, m, x] : [m, v, x],
          g = ((o - a) / Math.max(1e-6, Math.abs(n - e))) * Math.sign(n - e);
        for (let m = 0; m < u; m++) {
          let x = (m / u) * Math.PI * 2,
            v = ((m + 1) / u) * Math.PI * 2,
            y = (x + v) / 2,
            _ = Math.cos(x),
            M = Math.sin(x),
            b = Math.cos(v),
            w = Math.sin(v),
            S = Math.hypot(1, g);
          (this.quad(
            d(e, _ * o, M * o),
            d(n, _ * a, M * a),
            d(n, b * a, w * a),
            d(e, b * o, w * o),
            p(Math.cos(y) / S, Math.sin(y) / S, g / S),
            c,
            l,
            h,
          ),
            f & 1 &&
              this.tri(
                d(e, 0, 0),
                d(e, _ * o, M * o),
                d(e, b * o, w * o),
                p(0, 0, -Math.sign(n - e)),
                c,
                l,
                h,
              ),
            f & 2 &&
              this.tri(
                d(n, 0, 0),
                d(n, _ * a, M * a),
                d(n, b * a, w * a),
                p(0, 0, Math.sign(n - e)),
                c,
                l,
                h,
              ));
        }
      }
      ell(t, e, n, i, r, o, a, c = 0, l, h = 10) {
        let u = Math.max(3, h >> 1);
        for (let f = 0; f < h; f++)
          for (let d = 0; d < u; d++) {
            let p = (f / h) * Math.PI * 2,
              g = ((f + 1) / h) * Math.PI * 2,
              m = (d / u) * Math.PI - Math.PI / 2,
              x = ((d + 1) / u) * Math.PI - Math.PI / 2,
              v = (w, S) => [
                t + Math.cos(S) * Math.cos(w) * i,
                e + Math.sin(S) * r,
                n + Math.cos(S) * Math.sin(w) * o,
              ],
              y = (p + g) / 2,
              _ = (m + x) / 2,
              M = [
                (Math.cos(_) * Math.cos(y)) / i,
                Math.sin(_) / r,
                (Math.cos(_) * Math.sin(y)) / o,
              ],
              b = Math.hypot(M[0], M[1], M[2]);
            this.quad(
              v(p, m),
              v(g, m),
              v(g, x),
              v(p, x),
              [M[0] / b, M[1] / b, M[2] / b],
              a,
              c,
              l,
            );
          }
      }
      box(t, e, n, i, r, o, a, c = 0, l, h = 63) {
        (h & 1 &&
          this.quad(
            [i, e, n],
            [i, e, o],
            [i, r, o],
            [i, r, n],
            [1, 0, 0],
            a,
            c,
            l,
          ),
          h & 2 &&
            this.quad(
              [t, e, n],
              [t, e, o],
              [t, r, o],
              [t, r, n],
              [-1, 0, 0],
              a,
              c,
              l,
            ),
          h & 4 &&
            this.quad(
              [t, r, n],
              [i, r, n],
              [i, r, o],
              [t, r, o],
              [0, 1, 0],
              a,
              c,
              l,
            ),
          h & 8 &&
            this.quad(
              [t, e, n],
              [i, e, n],
              [i, e, o],
              [t, e, o],
              [0, -1, 0],
              a,
              c,
              l,
            ),
          h & 16 &&
            this.quad(
              [t, e, o],
              [i, e, o],
              [i, r, o],
              [t, r, o],
              [0, 0, 1],
              a,
              c,
              l,
            ),
          h & 32 &&
            this.quad(
              [t, e, n],
              [i, e, n],
              [i, r, n],
              [t, r, n],
              [0, 0, -1],
              a,
              c,
              l,
            ));
      }
      cylY(t, e, n, i, r, o, a, c, l = 8) {
        for (let h = 0; h < l; h++) {
          let u = (h / l) * Math.PI * 2,
            f = ((h + 1) / l) * Math.PI * 2,
            d = Math.cos(u),
            p = Math.sin(u),
            g = Math.cos(f),
            m = Math.sin(f),
            x = (u + f) / 2;
          this.quad(
            [t + d * n, i, e + p * n],
            [t + g * n, i, e + m * n],
            [t + g * n, r, e + m * n],
            [t + d * n, r, e + p * n],
            [Math.cos(x), 0, Math.sin(x)],
            o,
            a,
            c,
          );
        }
      }
      cylH(t, e, n, i, r, o, a, c, l, h = 8) {
        for (let u = 0; u < h; u++) {
          let f = (u / h) * Math.PI * 2,
            d = ((u + 1) / h) * Math.PI * 2,
            p = (f + d) / 2,
            g = i + Math.sin(f) * o,
            m = i + Math.sin(d) * o,
            x = r + Math.cos(f) * o,
            v = r + Math.cos(d) * o;
          t === "x"
            ? this.quad(
                [e, g, x],
                [n, g, x],
                [n, m, v],
                [e, m, v],
                [0, Math.sin(p), Math.cos(p)],
                a,
                c,
                l,
              )
            : this.quad(
                [x, g, e],
                [x, g, n],
                [v, m, n],
                [v, m, e],
                [Math.cos(p), Math.sin(p), 0],
                a,
                c,
                l,
              );
        }
      }
      build() {
        let t = new Vt();
        return (
          t.setAttribute("position", new kt(this.p, 3)),
          t.setAttribute("normal", new kt(this.n, 3)),
          t.setAttribute("uv", new kt(this.uv, 2)),
          t.setAttribute("color", new kt(this.c, 3)),
          t.setAttribute("aMat", new kt(this.m, 1)),
          t.setAttribute("aSeed", new kt(this.s, 1)),
          t.setIndex(
            this.vc > 65535 ? new Tr(this.idx, 1) : new wr(this.idx, 1),
          ),
          t.computeBoundingSphere(),
          t.computeBoundingBox(),
          t
        );
      }
    },
    sE = `
in float aMat; in float aSeed;
out vec3 vPos; out vec3 vNrm; out vec2 vUv; flat out float vMat; out float vSeed; out vec3 vCol;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPos = wp.xyz;
  vNrm = normalize(mat3(modelMatrix) * normal);
  vUv = uv; vMat = aMat; vSeed = aSeed;
  vCol = color;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`,
    Fo = `
uniform vec3 uCam;
uniform float uTime;
uniform vec3 uLightCol; uniform float uLightMul; uniform vec3 uAmb;
uniform vec3 uFogCol; uniform float uFogDen; uniform float uFogLight;
uniform vec4 uBlack;
uniform vec3 uFlashPos; uniform vec3 uFlashDir; uniform float uFlashI;
uniform vec4 uDynPos[4]; uniform vec4 uDynCol[4];
uniform vec4 uFlick[4];
`,
    rE = `
precision highp float;
precision highp sampler2D;
in vec3 vPos; in vec3 vNrm; in vec2 vUv; flat in float vMat; in float vSeed; in vec3 vCol;
out vec4 fragColor;
uniform sampler2D tWallA; uniform sampler2D tWallN;
uniform sampler2D tFloorA; uniform sampler2D tFloorN;
uniform sampler2D tCeilA; uniform sampler2D tCeilN;
uniform sampler2D tPaperA; uniform sampler2D tPaperN;
uniform sampler2D tGrime; uniform sampler2D tLight; uniform sampler2D tCell; uniform sampler2D tSigns;
uniform vec2 uWorld; uniform vec2 uGrid; uniform float uCell; uniform float uCeilH;
uniform vec3 uZoneCol[4];
uniform vec4 uScale;
uniform float uWallKind; uniform float uCeilKind; uniform vec3 uWallTint; uniform vec3 uWallTint2;
uniform float uFloorGloss; uniform float uWet; uniform vec3 uBaseCol; uniform vec2 uLamp;
${Fo}
${Ps}
${y2}

vec3 perturb(vec4 ns, vec3 Ng, vec3 T, vec3 B, float k){
  vec2 xy = (ns.xy*2.0-1.0)*k;
  float z = sqrt(max(0.0, 1.0 - dot(xy, xy)));
  return normalize(T*xy.x + B*xy.y + Ng*z);
}
float blackF(vec3 p){
  if (uBlack.w <= 0.0) return 0.0;
  float d = length(p.xz - uBlack.xy);
  float n = texture(tGrime, p.xz*0.021).r;
  return (1.0 - smoothstep(uBlack.z*0.80, uBlack.z, d + (n-0.5)*uBlack.z*0.45)) * uBlack.w;
}
float panelFlick(vec2 cell, float lst){
  if (lst < 1.5) return 1.0;
  vec2 cc = (cell+0.5)*uCell;
  for (int i=0;i<4;i++){ if (uFlick[i].z > 0.0 && length(uFlick[i].xy - cc) < 0.1) return uFlick[i].w; }
  return flickFn(uTime, hash12(cell));
}

void main(){
  vec3 P = vPos;
  vec3 Ng = normalize(vNrm);
  int mat = int(vMat + 0.5);
  vec3 toCam = uCam - P; float dist = length(toCam); vec3 V = toCam / max(dist, 1e-4);
  bool isUp = Ng.y > 0.5, isDown = Ng.y < -0.5, isVert = !isUp && !isDown;
  bool alongX = abs(Ng.z) > abs(Ng.x);
  vec2 wuv = isVert ? vec2(alongX ? P.x : P.z, P.y) : P.xz;
  vec3 T = isVert ? (alongX ? vec3(1.0,0.0,0.0) : vec3(0.0,0.0,1.0)) : vec3(1.0,0.0,0.0);
  vec3 B = isVert ? vec3(0.0,1.0,0.0) : vec3(0.0,0.0,1.0);

  vec4 lf = texture(tLight, (P.xz + Ng.xz*0.5) / uWorld);
  float E0 = lf.r*lf.r*4.0;
  float wdist = lf.g*1.2;
  vec2 cp = P.xz + Ng.xz*0.3;
  vec2 cell = floor(cp / uCell);
  vec4 ci = texture(tCell, (cell+0.5)/uGrid);
  int rv = int(ci.r*255.0 + 0.5);
  int zone = rv / 64;
  float decay = float(rv - zone*64) / 60.0;
  float dirt = 0.0;
  int lst = int(ci.g*255.0/50.0 + 0.5);
  int fa = int(ci.a*255.0 + 0.5);
  int feat = fa - (fa/16)*16;
  float blk = blackF(P);
  vec4 gr = vec4(0.5,0.0,0.0,0.0);

  vec3 albedo = vec3(0.5); vec3 N = Ng; float rough = 0.9; float F0 = 0.04; vec3 emis = vec3(0.0); float ao = 1.0;
  float gloss = 0.0; float metal = 0.0;
  bool isWall = false, isFloor = false, isCeil = false;

  if (mat == 0 || mat == 4) {
    isWall = isVert;
    bool paper = (uWallKind < 0.5);
    vec3 wallCol;
    vec3 wn = Ng; float wr = 0.8;
    if (paper) {
      vec2 puv = wuv / uScale.w;
      vec4 pa = texture(tPaperA, puv); vec4 pn = texture(tPaperN, puv);
      float Lp = pow(pa.r, 2.2);
      float strip = floor(wuv.x / uScale.w);
      float sv = hash12(vec2(strip, floor(vSeed*997.0)));
      vec3 zc = uZoneCol[zone];
      vec3 pc = zc * Lp * (0.93 + 0.12*sv);
      float sx = fract(wuv.x / uScale.w);
      float seam = 1.0 - smoothstep(0.0, 0.006, min(sx, 1.0-sx));
      pc *= 1.0 - seam*0.22;
      pc *= mix(0.97, 0.86, decay) + mix(0.08, 0.3, decay)*gr.r;
      pc *= mix(1.08, 0.86, smoothstep(0.55, 1.0, decay));
      pc = mix(pc, pc*vec3(1.06,0.94,0.72), smoothstep(0.55,0.78,gr.g)*0.55);
      float stainZone = smoothstep(1.5, 0.15, P.y + (gr.a-0.5)*0.9);
      float st = smoothstep(0.53, 0.6, gr.g) * stainZone * dirt;
      float tide = (smoothstep(0.51,0.535,gr.g) - smoothstep(0.535,0.575,gr.g)) * stainZone * dirt;
      pc *= 1.0 - st*0.16 - tide*0.32;
      pc = mix(pc, pc*vec3(0.9,0.72,0.42), tide*0.55);
      // drips from ceiling
      float drip = smoothstep(0.62, 0.7, gr.a) * smoothstep(uCeilH-1.6, uCeilH, P.y) * dirt;
      pc *= 1.0 - drip*0.12;
      // mould blooms and peeling seams in the dirtiest rooms
      float mould = smoothstep(0.66, 0.8, texture(tGrime, wuv/3.1 + 0.37).b) * smoothstep(0.62, 1.0, decay);
      pc = mix(pc, pc*vec3(0.42,0.44,0.3), mould*0.7);
      pc *= 1.0 - seam*0.4*smoothstep(0.6, 1.0, decay);
      pc *= 1.0 - smoothstep(0.32, 0.0, P.y)*0.22*(0.6+0.8*gr.b);
      vec3 bc = vec3(0.024,0.023,0.026) * (0.6 + 0.8*Lp) * (0.85 + 0.3*gr.r);
      wallCol = mix(pc, bc, blk);
      wn = perturb(pn, Ng, T, B, 1.0);
      wr = mix(0.78, 0.42, blk);
      if (uWallKind > 0.5 && !(zone > 0)) {
        // black zone over non-paper theme: still paper look but black
      }
    } else {
      vec2 tuv = wuv / uScale.x;
      vec4 ta = texture(tWallA, tuv); vec4 tn = texture(tWallN, tuv);
      vec3 tc = pow(ta.rgb, vec3(2.2));
      wn = perturb(tn, Ng, T, B, 1.0); wr = tn.b; ao *= tn.a;
      if (uWallKind > 1.5 && uWallKind < 2.5) {
        // hospital: tiles below 1.25m, painted plaster above
        if (P.y > 1.25) {
          float n = gr.r;
          tc = uWallTint2 * (0.88 + 0.2*n);
          tc *= 1.0 - smoothstep(0.62,0.7,gr.g)*0.2;
          wn = Ng; wr = 0.85;
        } else {
          tc *= uWallTint;
        }
        float trim = 1.0 - smoothstep(0.02, 0.03, abs(P.y-1.27));
        tc = mix(tc, vec3(0.06,0.09,0.08), trim);
      } else if (uWallKind > 2.5 && uWallKind < 3.5) {
        // parking: concrete with painted band
        float band = step(P.y, 0.9) * step(0.12, P.y);
        float stripe = step(0.5, fract((wuv.x + P.y)*1.2));
        vec3 paint = mix(vec3(0.42,0.33,0.02), vec3(0.02), stripe);
        tc = mix(tc * uWallTint, paint * (0.75+0.3*gr.r), band*0.9);
      } else {
        tc *= uWallTint;
      }
      tc *= mix(0.96, 0.84, decay) + mix(0.08, 0.3, decay)*gr.r;
      tc = mix(tc, tc*vec3(0.62,0.56,0.46), smoothstep(0.58, 0.8, gr.g)*0.6*dirt);
      tc *= 1.0 - smoothstep(0.35, 0.0, P.y)*0.2;
      // coloured zones repaint this place's own walls (tiles go blue, red, black)
      if (zone > 0) {
        float lz = dot(tc, vec3(0.3, 0.59, 0.11));
        tc = uZoneCol[zone] * (0.55 + lz * 1.6);
      }
      vec3 bct = vec3(0.024,0.023,0.026) * (0.6 + 1.2*dot(tc, vec3(0.33))) * (0.85 + 0.3*gr.r);
      wallCol = mix(tc, bct, blk);
    }
    albedo = wallCol; N = wn; rough = wr;
  } else if (mat == 1) {
    isFloor = true;
    vec2 fuv = P.xz / uScale.y;
    vec4 fat = texture(tFloorA, fuv); vec4 fnt = texture(tFloorN, fuv);
    albedo = pow(fat.rgb, vec3(2.2));
    N = perturb(fnt, Ng, T, B, 1.0); rough = fnt.b; ao *= fnt.a;
    vec4 g2 = texture(tGrime, P.xz/13.0 + 0.3);
    float wet = smoothstep(0.56, 0.72, g2.g) * uWet * mix(0.05, 1.7, decay);
    albedo *= 1.0 - wet*0.38;
    albedo *= mix(0.96, 0.84, decay) + mix(0.07, 0.3, decay)*g2.r;
    albedo = mix(albedo, albedo*vec3(0.6,0.52,0.4), smoothstep(0.6, 0.85, texture(tGrime, P.xz/6.0+0.71).g) * 0.5 * dirt);
    rough = mix(rough, 0.22, wet);
    gloss = max(uFloorGloss, wet*0.85);
    // trap hints
    vec2 lc = P.xz - (cell+0.5)*uCell;
    float bx = max(abs(lc.x), abs(lc.y));
    if (feat == 4) { // pit: sagging square with seam
      float seamL = 1.0 - smoothstep(0.0, 0.03, abs(bx - 1.45));
      albedo *= 1.0 - seamL*0.5 - step(bx, 1.45)*0.12;
    } else if (feat == 6) { // electrified puddle
      float pd = length(lc*vec2(1.0, 1.25)) + (gr.r-0.5)*1.2;
      float puddle = 1.0 - smoothstep(1.3, 1.45, pd);
      albedo = mix(albedo, albedo*0.25, puddle);
      rough = mix(rough, 0.05, puddle); gloss = max(gloss, puddle);
      N = normalize(mix(N, Ng, puddle));
      float sp = step(0.985, hash12(floor(P.xz*30.0) + floor(uTime*24.0)));
      float arc = puddle * sp * step(0.5, fract(uTime*3.7 + hash12(cell)));
      emis += vec3(0.55, 0.75, 1.6) * arc * 6.0;
    }
    if (feat == 1 || feat == 2 || feat == 3) albedo *= 0.95;
  } else if (mat == 2) {
    isCeil = true;
    vec2 cuv = P.xz / uScale.z;
    vec4 cat = texture(tCeilA, cuv); vec4 cnt = texture(tCeilN, cuv);
    albedo = pow(cat.rgb, vec3(2.2));
    N = perturb(cnt, Ng, T, B, 1.0); rough = cnt.b;
    vec2 tid = floor(P.xz/0.6);
    float th = hash12(tid + 11.0);
    if (uCeilKind < 0.5) {
      albedo *= 0.93 + 0.1*th;
      float cst = smoothstep(0.6, 0.78, texture(tGrime, P.xz/9.0+0.5).g) * dirt;
      albedo = mix(albedo, albedo*vec3(0.72,0.6,0.38), cst*0.75);
      if (th > 1.0 - 0.025*decay*decay) { albedo = vec3(0.006); N = Ng; }
    } else {
      albedo *= 0.85 + 0.3*gr.r;
    }
    if (feat == 5) { // crusher plate
      vec2 lc = P.xz - (cell+0.5)*uCell;
      float bx = max(abs(lc.x), abs(lc.y));
      if (bx < 1.9) { albedo = vec3(0.05,0.045,0.04) * (0.7+0.6*gr.r); albedo = mix(albedo, vec3(0.12,0.01,0.0), smoothstep(0.6,0.8,gr.a)*0.8); N = Ng; rough = 0.5; }
    }
    if (lst > 0) {
      vec2 lp = P.xz - (cell+0.5)*uCell;
      vec2 q = abs(lp) - uLamp;
      float mq = max(q.x, q.y);
      if (mq < 0.035) {
        if (mq < 0.0) {
          float on = (lst == 1) ? 1.0 : (lst == 2 ? panelFlick(cell, 2.0) : 0.0);
          on *= (1.0 - blk) * uLightMul;
          vec2 gg = fract(lp*36.0);
          float pat = 0.92 + 0.08*step(0.5, gg.x)*step(0.5, gg.y);
          float edgeF = smoothstep(0.0, 0.07, -mq);
          float li = ci.b*255.0/100.0;
          emis = uLightCol * (6.5 * on * li * pat * mix(0.7, 1.0, edgeF));
          albedo = vec3(0.55, 0.55, 0.52) * (lst == 3 ? 0.5 : 1.0);
          N = Ng; rough = 0.3;
        } else {
          albedo = vec3(0.45); N = Ng; rough = 0.4;
        }
      }
    }
  } else if (mat == 3) {
    albedo = uBaseCol * (0.85 + 0.3*gr.r); rough = 0.45; F0 = 0.05;
    isWall = true;
  } else if (mat == 5 || mat == 14) {
    albedo = vCol * (0.85 + 0.3*gr.r);
    if (mat == 14) { float f = hash12(floor(wuv*220.0)); albedo *= 0.9 + 0.2*f; }
    rough = mat == 14 ? 0.97 : 0.7;
    isWall = isVert; isFloor = isUp;
  } else if (mat == 6 || mat == 11) {
    albedo = vCol * (0.8 + 0.4*gr.r);
    float rust = smoothstep(0.62, 0.8, gr.g);
    albedo = mix(albedo, vec3(0.16,0.06,0.02), rust*0.7);
    metal = mat == 6 ? 0.85 : 0.3; rough = mix(0.32, 0.8, rust);
    isWall = isVert;
  } else if (mat == 7) {
    albedo = vCol * 0.15; emis = vCol * 2.5 * (1.0 - blk);
  } else if (mat == 8) {
    float depthF = smoothstep(-3.2, 0.0, P.y);
    albedo = vec3(0.22, 0.21, 0.2) * (0.75 + 0.5*gr.r) * depthF * depthF;
    rough = 0.85;
    isFloor = isUp; isWall = isVert;
  } else if (mat == 9) {
    albedo = vec3(0.004);
  } else if (mat == 10) {
    vec4 s = texture(tSigns, vUv);
    albedo = vec3(0.02);
    emis = vCol * s.r * 3.0 * (1.0 - blk*0.9) + vCol*0.04;
    rough = 0.3;
  } else if (mat == 12) {
    vec2 tuv = (isVert ? wuv : P.xz) / uScale.y;
    vec4 pa = texture(tFloorA, tuv); vec4 pn = texture(tFloorN, tuv);
    albedo = pow(pa.rgb, vec3(2.2)) * vec3(0.85, 0.95, 0.97);
    N = perturb(pn, Ng, T, B, 1.0); rough = pn.b;
    float depthF = smoothstep(-2.6, 0.0, P.y);
    albedo *= mix(0.45, 1.0, depthF);
    isFloor = isUp; isWall = isVert;
  } else if (mat == 13) {
    albedo = vCol * 0.3; rough = 0.08; F0 = 0.08; gloss = 0.7;
  } else if (mat == 15) {
    // broken wall core: gypsum / concrete / brick, rough and chalky
    vec2 cuv = isVert ? wuv : P.xz;
    float n = texture(tGrime, cuv*2.7 + vSeed).r;
    float fine = hash12(floor(cuv*160.0));
    albedo = vCol * (0.78 + 0.3*n + 0.08*fine);
    N = normalize(Ng + (vec3(fine, hash12(floor(cuv*160.0)+7.0), n) - 0.5) * 0.35);
    rough = 0.97; isWall = isVert; isFloor = isUp;
  } else if (mat == 17) {
    vec4 s = texture(tSigns, vUv);
    albedo = vec3(0.03);
    emis = vCol * (1.0 - s.r) * 1.7 * (1.0 - blk*0.9);
    rough = 0.25;
  } else if (mat == 16) {
    // splintered timber studs
    vec2 tuv = isVert ? wuv : P.xz;
    float gph = tuv.x*160.0 + texture(tGrime, tuv*vec2(0.6, 6.0)).r*9.0;
    // fade the grain out where it would alias into stripes
    float grain = 0.5 + (sin(gph)*0.5) * clamp(1.0 - fwidth(gph)*0.45, 0.0, 1.0);
    albedo = vCol * (0.76 + 0.26*grain) * (0.85 + 0.3*gr.r);
    rough = 0.85; isWall = isVert;
  }

  // ---- lighting
  float fl = 1.0;
  for (int i=0;i<4;i++){
    vec4 f = uFlick[i];
    if (f.z > 0.0) { float d = length(P.xz - f.xy); fl *= mix(max(f.w, 0.3), 1.0, smoothstep(f.z*0.25, f.z, d)); }
  }
  float lightK = max(0.8, uLightMul);
  float E = max(0.25, E0 * lightK);
  vec3 Lk = normalize((isDown ? vec3(0.0, -1.0, 0.0) : vec3(0.0, 1.0, 0.0)) + Ng*0.55);
  float ndl0 = max(dot(Ng, Lk), 0.08);
  float shape = clamp(max(dot(N, Lk), 0.0) / ndl0, 0.0, 1.7);
  float vert = 1.0;
  if (isWall) {
    vert = mix(0.68, 1.0, smoothstep(0.0, uCeilH*0.85, P.y)) * (1.0 - 0.22*smoothstep(uCeilH-0.45, uCeilH, P.y));
    ao *= mix(0.5, 1.0, smoothstep(0.0, 0.42, P.y));
    ao *= mix(0.72, 1.0, smoothstep(0.0, 0.4, uCeilH - P.y));
    ao *= mix(0.55, 1.0, smoothstep(0.06, 0.48, wdist));
  }
  if (isFloor) ao *= mix(0.38, 1.0, smoothstep(0.03, 0.85, wdist));
  if (isCeil) { vert = 0.30; ao *= mix(0.5, 1.0, smoothstep(0.03, 0.8, wdist)); }

  vec3 diffC = albedo * (1.0 - metal);
  vec3 spec0 = mix(vec3(F0), albedo, metal);
  float nv = max(dot(N, V), 0.0);
  vec3 Fr = spec0 + (1.0 - spec0) * pow(1.0 - nv, 5.0);
  vec3 col = diffC * (E * uLightCol * vert * shape + uAmb) * ao;
  // key light specular
  {
    vec3 H = normalize(Lk + V);
    float nh = max(dot(N, H), 0.0);
    float a = max(rough*rough, 0.02);
    float a2 = a*a;
    float dd = nh*nh*(a2-1.0)+1.0;
    float D = a2 / (3.14159*dd*dd);
    col += E * uLightCol * D * Fr * 0.12 * ao * max(dot(N, Lk), 0.0) * vert;
  }
  // mirror-ish reflection of ceiling lights on glossy floors
  if (gloss > 0.01 && isUp) {
    vec3 R = reflect(-V, N);
    if (R.y > 0.04) {
      float t = (uCeilH - P.y) / R.y;
      vec3 hp = P + R*t;
      vec2 hc = floor(hp.xz / uCell);
      vec4 hci = texture(tCell, (hc+0.5)/uGrid);
      int hl = int(hci.g*255.0/50.0 + 0.5);
      if (hl == 1 || hl == 2) {
        vec2 lp = hp.xz - (hc+0.5)*uCell;
        vec2 q = abs(lp) - uLamp;
        float blur = 0.02 + rough*t*0.35;
        float pm = 1.0 - smoothstep(-blur, blur, max(q.x, q.y));
        float on = hl == 1 ? 1.0 : panelFlick(hc, 2.0);
        on *= 1.0 - blackF(hp);
        col += uLightCol * pm * on * gloss * 5.0 * Fr * exp(-t*0.08) * uLightMul;
      }
    }
  }
  // flashlight
  if (uFlashI > 0.0) {
    vec3 Lf = uFlashPos - P; float df = length(Lf); Lf /= df;
    float cosA = dot(-Lf, uFlashDir);
    float cone = smoothstep(0.80, 0.95, cosA);
    float hot = smoothstep(0.95, 0.995, cosA);
    float ring = 0.97 + 0.03*sin(acos(clamp(cosA, -1.0, 1.0))*55.0);
    float att = uFlashI * (cone*0.75 + hot*0.5) * ring / (1.0 + df*df*0.09) * (0.55 + 0.45*smoothstep(0.3, 2.2, df));
    float ndf = max(dot(N, Lf), 0.0);
    col += diffC * att * ndf * vec3(1.0, 0.96, 0.88) * ao;
    vec3 Hf = normalize(Lf + V);
    float sp = pow(max(dot(N, Hf), 0.0), 2.0/max(rough*rough, 0.01));
    col += att * sp * Fr * 0.25 * ndf;
  }
  // dynamic point lights
  for (int i=0;i<4;i++){
    vec4 dp = uDynPos[i]; vec4 dc = uDynCol[i];
    if (dc.w <= 0.0) continue;
    vec3 Ld = dp.xyz - P; float d = length(Ld); Ld /= d;
    float att = dc.w * pow(clamp(1.0 - d/dp.w, 0.0, 1.0), 2.0);
    col += diffC * dc.rgb * att * max(dot(N, Ld), 0.0);
  }
  // caustics in water cells
  int floorT = fa / 16;
  if ((floorT == 2 || floorT == 3) && (isFloor || mat == 12)) {
    vec2 cq = P.xz + (isVert ? Ng.xz*0.0 : vec2(0.0));
    float g1 = texture(tGrime, cq*0.105 + vec2(uTime*0.013, uTime*0.008)).g;
    float g2 = texture(tGrime, cq*0.15 - vec2(uTime*0.01, -uTime*0.012)).r;
    float cc = pow(clamp(1.0 - abs(g1 - g2)*7.0, 0.0, 1.0), 5.0);
    col += albedo * E * uLightCol * cc * 0.9;
  }
  col += emis;
  // fog
  float fogF = 1.0 - exp(-pow(dist*uFogDen, 1.5));
  vec3 fogC = uFogCol * uFogLight * mix(0.12, 1.0, smoothstep(-18.0, 0.0, P.y));
  col = mix(col, fogC, fogF);
  fragColor = vec4(col, 1.0);
}
`;
  function E2() {
    return {
      ...oE(),
      tLight: { value: null },
      uWorld: { value: new ut(432, 432) },
      uCeilH: { value: 3 },
      uViewUp: { value: new L(0, 1, 0) },
      uVmLight: { value: new ue() },
    };
  }
  function A2(s) {
    return new De({
      glslVersion: yn,
      vertexShader: sE,
      fragmentShader: rE,
      vertexColors: !0,
      uniforms: {
        ...s,
        tWallA: { value: null },
        tWallN: { value: null },
        tFloorA: { value: null },
        tFloorN: { value: null },
        tCeilA: { value: null },
        tCeilN: { value: null },
        tPaperA: { value: null },
        tPaperN: { value: null },
        tGrime: { value: null },
        tCell: { value: null },
        tSigns: { value: null },
        uGrid: { value: new ut() },
        uCell: { value: 4 },
        uZoneCol: { value: fd.map((t) => new L(...t)) },
        uScale: { value: new ue(1.2, 2, 1.2, 0.53) },
        uWallKind: { value: 0 },
        uCeilKind: { value: 0 },
        uWallTint: { value: new L(1, 1, 1) },
        uWallTint2: { value: new L(1, 1, 1) },
        uFloorGloss: { value: 0 },
        uWet: { value: 1 },
        uBaseCol: { value: new L(0.2, 0.15, 0.08) },
        uLamp: { value: new ut(0.6, 0.3) },
      },
    });
  }
  function oE() {
    return {
      uCam: { value: new L() },
      uTime: { value: 0 },
      uLightCol: { value: new L(1, 1, 1) },
      uLightMul: { value: 1 },
      uAmb: { value: new L(0.01, 0.01, 0.01) },
      uFogCol: { value: new L(0.2, 0.2, 0.2) },
      uFogDen: { value: 0.02 },
      uFogLight: { value: 1 },
      uBlack: { value: new ue(0, 0, 0, 0) },
      uFlashPos: { value: new L() },
      uFlashDir: { value: new L(0, 0, -1) },
      uFlashI: { value: 0 },
      uDynPos: { value: [new ue(), new ue(), new ue(), new ue()] },
      uDynCol: { value: [new ue(), new ue(), new ue(), new ue()] },
      uFlick: { value: [new ue(), new ue(), new ue(), new ue()] },
    };
  }
  var aE = [
    "↓ B2",
    "↓ B3",
    "↓ B4",
    "↓ B5",
    "↑ B1",
    "↑ B2",
    "↑ B3",
    "↑ B4",
    "EXIT →",
    "← EXIT",
    "B1",
    "非常口",
    "▲  ▼",
    "関係者以外",
    "↓",
    "帰還",
  ];
  function C2() {
    let s = document.createElement("canvas");
    ((s.width = 2048), (s.height = 1024));
    let t = s.getContext("2d");
    ((t.fillStyle = "#000"),
      t.fillRect(0, 0, 2048, 1024),
      (t.fillStyle = "#fff"),
      (t.textAlign = "center"),
      (t.textBaseline = "middle"),
      aE.forEach((n, i) => {
        let r = i % 8,
          o = (i / 8) | 0,
          a = r * 256 + 128,
          c = o * 128 + 66,
          sz = n.length > 6 ? 34 : n.length > 4 ? 46 : 64;
        ((t.font =
          (n.length > 4 ? "600 " : "700 ") +
          sz +
          'px "Helvetica Neue", Arial, "Hiragino Sans", "Noto Sans JP", sans-serif'),
          t.fillText(n, a, c, 240));
      }));
    let e = new Si(s);
    return ((e.anisotropy = 4), e);
  }
  function dd(s) {
    let t = s % 8,
      e = (s / 8) | 0;
    return [t / 8, 1 - (e + 1) / 8, (t + 1) / 8, 1 - e / 8];
  }
  function R2(s) {
    let t = (s % 2147483646) + 1;
    return () => ((t = (t * 16807) % 2147483647), (t - 1) / 2147483646);
  }
  function P2(s) {
    let t = R2(s);
    return [0.62 + t() * 0.18, 0.62 + t() * 0.18];
  }
  var pd = class {
    constructor(t, e, n) {
      ((this.m = t),
        (this.th = e),
        (this.mat = n),
        (this.group = new We()),
        (this.chunks = new Map()),
        (this.nCX = Math.ceil(t.W / 12)),
        (this.nCY = Math.ceil(t.H / 12)),
        (this.ceilH = e.ceilH));
    }
    buildAll() {
      for (let t = 0; t < this.nCY; t++)
        for (let e = 0; e < this.nCX; e++) this.buildChunk(e, t);
    }
    ensure(t, e = 2, n = 112, i = 145) {
      let r = 48,
        o = [];
      for (let a = 0; a < this.nCY; a++)
        for (let c = 0; c < this.nCX; c++) {
          let l = (c + 0.5) * r,
            h = (a + 0.5) * r,
            u = Math.hypot(l - t.x, h - t.z),
            f = c + "," + a,
            d = this.chunks.has(f);
          if (u < n && !d) o.push([u, c, a]);
          else if (u > i && d) {
            let p = this.chunks.get(f);
            (this.group.remove(p), p.geometry.dispose(), this.chunks.delete(f));
          }
        }
      o.sort((a, c) => a[0] - c[0]);
      for (let a = 0; a < o.length && a < e; a++)
        this.buildChunk(o[a][1], o[a][2]);
      return o.length;
    }
    rebuildAtCell(t, e) {
      let n = Math.floor(Math.min(t, this.m.W - 1) / 12),
        i = Math.floor(Math.min(e, this.m.H - 1) / 12);
      this.chunks.has(n + "," + i) && this.buildChunk(n, i);
    }
    buildChunk(t, e) {
      let n = t + "," + e,
        i = this.chunks.get(n);
      i && (this.group.remove(i), i.geometry.dispose());
      let r = new ks(),
        o = this.m,
        a = 4,
        c = this.ceilH,
        l = 0.2 / 2,
        h = t * 12,
        u = e * 12,
        f = Math.min(o.W, h + 12),
        d = Math.min(o.H, u + 12),
        p = f === o.W,
        g = d === o.H,
        m = [1, 1, 1];
      for (let b = u; b < d; b++)
        for (let w = h; w < f; w++) {
          let S = o.ci(w, b),
            T = o.floor[S],
            E = o.feat[S],
            C = w * a,
            R = b * a,
            I = C + a,
            k = R + a;
          if (E === 1 || E === 2 || E === 3) {
            this.buildStair(r, w, b);
            continue;
          }
          if (T === 6) {
            this.buildDuct(r, w, b);
            continue;
          }
          if (o.holes && o.holes.has(S)) {
            let U = C + 0.55,
              X = I - 0.55,
              H = R + 0.55,
              O = k - 0.55;
            (r.quad(
              [C, 0, R],
              [I, 0, R],
              [I, 0, H],
              [C, 0, H],
              [0, 1, 0],
              F.FLOOR,
              0.1,
            ),
              r.quad(
                [C, 0, O],
                [I, 0, O],
                [I, 0, k],
                [C, 0, k],
                [0, 1, 0],
                F.FLOOR,
                0.1,
              ),
              r.quad(
                [C, 0, H],
                [U, 0, H],
                [U, 0, O],
                [C, 0, O],
                [0, 1, 0],
                F.FLOOR,
                0.1,
              ),
              r.quad(
                [X, 0, H],
                [I, 0, H],
                [I, 0, O],
                [X, 0, O],
                [0, 1, 0],
                F.FLOOR,
                0.1,
              ),
              r.quad(
                [U, -7, H],
                [U, 0, H],
                [U, 0, O],
                [U, -7, O],
                [1, 0, 0],
                F.STEP,
                0,
              ),
              r.quad(
                [X, -7, H],
                [X, 0, H],
                [X, 0, O],
                [X, -7, O],
                [-1, 0, 0],
                F.STEP,
                0,
              ),
              r.quad(
                [U, -7, H],
                [U, 0, H],
                [X, 0, H],
                [X, -7, H],
                [0, 0, 1],
                F.STEP,
                0,
              ),
              r.quad(
                [U, -7, O],
                [U, 0, O],
                [X, 0, O],
                [X, -7, O],
                [0, 0, -1],
                F.STEP,
                0,
              ),
              r.quad(
                [U, -7, H],
                [X, -7, H],
                [X, -7, O],
                [U, -7, O],
                [0, 1, 0],
                F.DARK,
                0,
              ));
          } else if (T === 0 || T === 3)
            r.quad(
              [C, 0, R],
              [I, 0, R],
              [I, 0, k],
              [C, 0, k],
              [0, 1, 0],
              F.FLOOR,
              Qn(w, b, 1),
            );
          else if (T === 2) {
            r.quad(
              [C, -2.2, R],
              [I, -2.2, R],
              [I, -2.2, k],
              [C, -2.2, k],
              [0, 1, 0],
              F.POOL,
              Qn(w, b, 3),
            );
            let z = (U, X) => {
              let H = w + U,
                O = b + X;
              return o.inb(H, O) && o.floor[o.ci(H, O)] === 2;
            };
            (z(1, 0) ||
              r.quad(
                [I, -2.2, R],
                [I, 0, R],
                [I, 0, k],
                [I, -2.2, k],
                [-1, 0, 0],
                F.POOL,
                0.2,
              ),
              z(-1, 0) ||
                r.quad(
                  [C, -2.2, R],
                  [C, 0, R],
                  [C, 0, k],
                  [C, -2.2, k],
                  [1, 0, 0],
                  F.POOL,
                  0.2,
                ),
              z(0, 1) ||
                r.quad(
                  [C, -2.2, k],
                  [C, 0, k],
                  [I, 0, k],
                  [I, -2.2, k],
                  [0, 0, -1],
                  F.POOL,
                  0.2,
                ),
              z(0, -1) ||
                r.quad(
                  [C, -2.2, R],
                  [C, 0, R],
                  [I, 0, R],
                  [I, -2.2, R],
                  [0, 0, 1],
                  F.POOL,
                  0.2,
                ));
          } else if (T === 7) {
            let z = (U, X) => {
              let H = w + U,
                O = b + X;
              return o.inb(H, O) && o.floor[o.ci(H, O)] === 7;
            };
            (r.quad(
              [C, -1.1, R],
              [I, -1.1, R],
              [I, -1.1, k],
              [C, -1.1, k],
              [0, 1, 0],
              F.STEP,
              Qn(w, b, 3),
            ),
              z(1, 0) ||
                r.quad([I, -1.1, R], [I, 0, R], [I, 0, k], [I, -1.1, k], [-1, 0, 0], F.STEP, 0.2),
              z(-1, 0) ||
                r.quad([C, -1.1, R], [C, 0, R], [C, 0, k], [C, -1.1, k], [1, 0, 0], F.STEP, 0.2),
              z(0, 1) ||
                r.quad([C, -1.1, k], [C, 0, k], [I, 0, k], [I, -1.1, k], [0, 0, -1], F.STEP, 0.2),
              z(0, -1) ||
                r.quad([C, -1.1, R], [C, 0, R], [I, 0, R], [I, -1.1, R], [0, 0, 1], F.STEP, 0.2));
          } else
            (T === 4 || T === 5) &&
              (T === 4
                ? (r.quad(
                    [C, 0, R],
                    [C + 1.3, 0, R],
                    [C + 1.3, 0, k],
                    [C, 0, k],
                    [0, 1, 0],
                    F.FLOOR,
                    0.3,
                  ),
                  r.quad(
                    [C + 2.7, 0, R],
                    [I, 0, R],
                    [I, 0, k],
                    [C + 2.7, 0, k],
                    [0, 1, 0],
                    F.FLOOR,
                    0.3,
                  ),
                  r.box(
                    C + 1.3 - 0.02,
                    -0.4,
                    R,
                    C + 1.3,
                    0,
                    k,
                    F.METAL,
                    0,
                    [0.2, 0.2, 0.2],
                    1,
                  ),
                  r.box(
                    C + 2.7,
                    -0.4,
                    R,
                    C + 2.7 + 0.02,
                    0,
                    k,
                    F.METAL,
                    0,
                    [0.2, 0.2, 0.2],
                    2,
                  ))
                : (r.quad(
                    [C, 0, R],
                    [I, 0, R],
                    [I, 0, R + 1.3],
                    [C, 0, R + 1.3],
                    [0, 1, 0],
                    F.FLOOR,
                    0.3,
                  ),
                  r.quad(
                    [C, 0, R + 2.7],
                    [I, 0, R + 2.7],
                    [I, 0, k],
                    [C, 0, k],
                    [0, 1, 0],
                    F.FLOOR,
                    0.3,
                  )));
          if (this.th.heights && (T === 0 || T === 4 || T === 5)) {
            r.quad(
              [C, -0.35, R],
              [I, -0.35, R],
              [I, -0.35, k],
              [C, -0.35, k],
              [0, -1, 0],
              F.METAL,
              0,
              [0.12, 0.12, 0.13],
            );
            for (let N = 0; N < 4; N++) {
              let z = w + [1, 0, -1, 0][N],
                U = b + [0, 1, 0, -1][N];
              !o.inb(z, U) ||
                o.floor[o.ci(z, U)] !== 1 ||
                (N === 0 &&
                  r.quad(
                    [I, -0.35, R],
                    [I, 0, R],
                    [I, 0, k],
                    [I, -0.35, k],
                    [1, 0, 0],
                    F.METAL,
                    0,
                    [0.15, 0.15, 0.16],
                  ),
                N === 2 &&
                  r.quad(
                    [C, -0.35, R],
                    [C, 0, R],
                    [C, 0, k],
                    [C, -0.35, k],
                    [-1, 0, 0],
                    F.METAL,
                    0,
                    [0.15, 0.15, 0.16],
                  ),
                N === 1 &&
                  r.quad(
                    [C, -0.35, k],
                    [C, 0, k],
                    [I, 0, k],
                    [I, -0.35, k],
                    [0, 0, 1],
                    F.METAL,
                    0,
                    [0.15, 0.15, 0.16],
                  ),
                N === 3 &&
                  r.quad(
                    [C, -0.35, R],
                    [C, 0, R],
                    [I, 0, R],
                    [I, -0.35, R],
                    [0, 0, -1],
                    F.METAL,
                    0,
                    [0.15, 0.15, 0.16],
                  ));
            }
          }
          !this.th.heights || T !== 1
            ? r.quad(
                [C, c, R],
                [I, c, R],
                [I, c, k],
                [C, c, k],
                [0, -1, 0],
                F.CEIL,
                Qn(w, b, 2),
              )
            : r.quad(
                [C, c, R],
                [I, c, R],
                [I, c, k],
                [C, c, k],
                [0, -1, 0],
                F.CEIL,
                Qn(w, b, 2),
              );
        }
      let x = p ? f : f - 1;
      for (let b = u; b < d; b++)
        for (let w = h; w <= x; w++) {
          let S = o.vw[o.vIdx(w, b)];
          S !== 0 && this.wallSeg(r, !0, w * a, b * a, S, Qn(w, b, 7));
        }
      let v = g ? d : d - 1;
      for (let b = u; b <= v; b++)
        for (let w = h; w < f; w++) {
          let S = o.hw[o.hIdx(w, b)];
          S !== 0 && this.wallSeg(r, !1, w * a, b * a, S, Qn(w, b, 8));
        }
      let y = o.W + 1;
      for (let b = u; b <= (g ? d : d - 1); b++)
        for (let w = h; w <= (p ? f : f - 1); w++) {
          if (o.pillar[b * y + w] !== 1) continue;
          let S = 0.28,
            T = w * a,
            E = b * a;
          r.box(T - S, 0, E - S, T + S, c, E + S, F.PILLAR, Qn(w, b, 9), m, 51);
          let C = S + 0.012;
          r.box(T - C, 0, E - C, T + C, 0.1, E + C, F.BASE, 0, m, 55);
        }
      if (o.props) {
        if (!o.propChunks) {
          o.propChunks = new Map();
          for (let w of o.props) {
            let S = Math.floor(w.cx / 12) + "," + Math.floor(w.cy / 12),
              T = o.propChunks.get(S);
            (T || o.propChunks.set(S, (T = [])), T.push(w));
          }
        }
        let b = o.propChunks.get(n);
        if (b) for (let w of b) w.build && w.build(r, this);
      }
      let _ = r.build(),
        M = new te(_, this.mat);
      return (
        (M.matrixAutoUpdate = !1),
        (M.userData.center = new L(
          ((h + f) * a) / 2,
          c / 2,
          ((u + d) * a) / 2,
        )),
        this.chunks.set(n, M),
        this.group.add(M),
        M
      );
    }
    wallSeg(t, e, n, i, r, o) {
      let a = 4,
        c = this.ceilH,
        l = 0.2 / 2,
        h = 0.1,
        u = 0.012,
        f = (m, x, v, y, _, M) => {
          e
            ? (t.box(n - l, v, m, n + l, y, x, F.WALL, o, void 0, M),
              _ &&
                (t.box(n + l, 0, m, n + l + u, h, x, F.BASE, 0, void 0, 5),
                t.box(n - l - u, 0, m, n - l, h, x, F.BASE, 0, void 0, 6)))
            : (t.box(m, v, i - l, x, y, i + l, F.WALL, o, void 0, M),
              _ &&
                (t.box(m, 0, i + l, x, h, i + l + u, F.BASE, 0, void 0, 20),
                t.box(m, 0, i - l - u, x, h, i - l, F.BASE, 0, void 0, 36)));
        },
        d = e ? i : n,
        p = e ? 3 : 48,
        g = e ? 48 : 3;
      if (r === 1 || r === 2) f(d - l, d + a + l, 0, c, !0, p | g);
      else if (r === 3) {
        let m = d + a / 2 - 1.2 / 2,
          x = d + a / 2 + 1.2 / 2;
        (f(d - l, m, 0, c, !0, p | g),
          f(x, d + a + l, 0, c, !0, p | g),
          f(m, x, 2.2, c, !1, p | 8));
        let v = 0.06,
          y = 0.02,
          _ = [0.32, 0.28, 0.22];
        if (e)
          for (let M of [1, -1]) {
            let b = M > 0 ? n + l : n - l - y,
              w = M > 0 ? n + l + y : n - l;
            (t.box(b, 0, m - v, w, 2.2 + v, m, F.FRAME, 0, _),
              t.box(b, 0, x, w, 2.2 + v, x + v, F.FRAME, 0, _),
              t.box(b, 2.2, m - v, w, 2.2 + v, x + v, F.FRAME, 0, _));
          }
        else
          for (let M of [1, -1]) {
            let b = M > 0 ? i + l : i - l - y,
              w = M > 0 ? i + l + y : i - l;
            (t.box(m - v, 0, b, m, 2.2 + v, w, F.FRAME, 0, _),
              t.box(x, 0, b, x + v, 2.2 + v, w, F.FRAME, 0, _),
              t.box(m - v, 2.2, b, x + v, 2.2 + v, w, F.FRAME, 0, _));
          }
      } else if (r === 6) {
        let m = d + a / 2 - 1 / 2,
          x = d + a / 2 + 1 / 2;
        (f(d - l, m, 0, c, !0, p | g),
          f(x, d + a + l, 0, c, !0, p | g),
          f(m, x, 0.72, c, !1, p | 8),
          this.buildVent(t, e, n, i, m, x));
      } else if (r === 7) {
        let m = this.m,
          x = e
            ? "v" + Math.round(n / a) + "," + Math.round(i / a)
            : "h" + Math.round(n / a) + "," + Math.round(i / a),
          v = (m.breaches && m.breaches.get(x)) || {
            seed: Math.floor(o * 1e6) + 1,
            side: 1,
          };
        this.buildBreach(t, e, n, i, v, o);
      } else if (r === 4) {
        let v = [0.1, 0.11, 0.13];
        e
          ? (t.box(n - 0.04, 0, d, n + 0.04, 1.35, d + a, F.FABRIC, o, v),
            t.box(
              n - 0.04 - 0.01,
              1.35,
              d,
              n + 0.04 + 0.01,
              1.35 + 0.03,
              d + a,
              F.METAL,
              0,
              [0.25, 0.25, 0.26],
            ))
          : (t.box(d, 0, i - 0.04, d + a, 1.35, i + 0.04, F.FABRIC, o, v),
            t.box(
              d,
              1.35,
              i - 0.04 - 0.01,
              d + a,
              1.35 + 0.03,
              i + 0.04 + 0.01,
              F.METAL,
              0,
              [0.25, 0.25, 0.26],
            ));
      } else if (r === 5) {
        let m = [0.2, 0.19, 0.17],
          x = 0.025;
        for (let v = 0; v <= 4; v++) {
          let y = d + (v * a) / 4;
          e
            ? t.box(n - x, 0, y - x, n + x, 1.05, y + x, F.METAL, 0, m)
            : t.box(y - x, 0, i - x, y + x, 1.05, i + x, F.METAL, 0, m);
        }
        for (let v of [1.05, 0.55])
          e
            ? t.box(n - x, v - 0.03, d, n + x, v + 0.02, d + a, F.METAL, 0, m)
            : t.box(d, v - 0.03, i - x, d + a, v + 0.02, i + x, F.METAL, 0, m);
      }
    }
    buildDuct(t, e, n) {
      let i = this.m,
        r = 4,
        o = i.ci(e, n),
        a = i.duct ? i.duct[o] : 0,
        c = e * r,
        l = n * r,
        h = 0.55,
        u = r / 2 - h,
        f = r / 2 + h,
        d = 0.82,
        p = [0.42, 0.43, 0.44],
        g = [0.24, 0.24, 0.25],
        m = (_, M, b, w) => {
          (t.quad(
            [c + _, 0, l + M],
            [c + b, 0, l + M],
            [c + b, 0, l + w],
            [c + _, 0, l + w],
            [0, 1, 0],
            F.FRAME,
            0.37,
            p,
          ),
            t.quad(
              [c + _, d, l + M],
              [c + b, d, l + M],
              [c + b, d, l + w],
              [c + _, d, l + w],
              [0, -1, 0],
              F.FRAME,
              0.41,
              p,
            ));
        };
      m(u, u, f, f);
      let x = (_, M, b, w) =>
          t.quad(
            [c + _, 0, l + M],
            [c + _, 0, l + b],
            [c + _, d, l + b],
            [c + _, d, l + M],
            [w, 0, 0],
            F.FRAME,
            0.43,
            p,
          ),
        v = (_, M, b, w) =>
          t.quad(
            [c + M, 0, l + _],
            [c + b, 0, l + _],
            [c + b, d, l + _],
            [c + M, d, l + _],
            [0, 0, w],
            F.FRAME,
            0.47,
            p,
          );
      (a & 1 ? (m(f, u, r, f), v(u, f, r, 1), v(f, f, r, -1)) : x(f, u, f, -1),
        a & 4 ? (m(0, u, u, f), v(u, 0, u, 1), v(f, 0, u, -1)) : x(u, u, f, 1),
        a & 2 ? (m(u, f, f, r), x(u, f, r, 1), x(f, f, r, -1)) : v(f, u, f, -1),
        a & 8 ? (m(u, 0, f, u), x(u, 0, u, 1), x(f, 0, u, -1)) : v(u, u, f, 1));
      let y = (_, M) => {
        _ === "x"
          ? (t.box(
              c + M - 0.015,
              d - 0.02,
              l + u,
              c + M + 0.015,
              d,
              l + f,
              F.FRAME,
              0,
              g,
              8,
            ),
            t.box(
              c + M - 0.015,
              0,
              l + u,
              c + M + 0.015,
              d,
              l + u + 0.02,
              F.FRAME,
              0,
              g,
              16,
            ),
            t.box(
              c + M - 0.015,
              0,
              l + f - 0.02,
              c + M + 0.015,
              d,
              l + f,
              F.FRAME,
              0,
              g,
              32,
            ))
          : (t.box(
              c + u,
              d - 0.02,
              l + M - 0.015,
              c + f,
              d,
              l + M + 0.015,
              F.FRAME,
              0,
              g,
              8,
            ),
            t.box(
              c + u,
              0,
              l + M - 0.015,
              c + u + 0.02,
              d,
              l + M + 0.015,
              F.FRAME,
              0,
              g,
              1,
            ),
            t.box(
              c + f - 0.02,
              0,
              l + M - 0.015,
              c + f,
              d,
              l + M + 0.015,
              F.FRAME,
              0,
              g,
              2,
            ));
      };
      (a & 1 && y("x", 3.3),
        a & 4 && y("x", 0.7),
        a & 2 && y("z", 3.3),
        a & 8 && y("z", 0.7));
    }
    buildVent(t, e, n, i, r, o) {
      let a = this.m,
        c = 4,
        l = 0.2 / 2,
        h = e
          ? "v" + Math.round(n / c) + "," + Math.round(i / c)
          : "h" + Math.round(n / c) + "," + Math.round(i / c),
        u = a.ventOpen && a.ventOpen.has(h),
        f = 1;
      if (e) {
        let v = Math.round(n / c),
          y = Math.round(i / c);
        v < a.W && a.floor[a.ci(v, y)] === 6 && (f = -1);
      } else {
        let v = Math.round(n / c),
          y = Math.round(i / c);
        y < a.H && a.floor[a.ci(v, y)] === 6 && (f = -1);
      }
      let d = (v, y, _, M, b, w, S, T) => {
          e
            ? t.box(
                n + Math.min(_, w),
                y,
                Math.min(v, M),
                n + Math.max(_, w),
                b,
                Math.max(v, M),
                S,
                0,
                T,
              )
            : t.box(
                Math.min(v, M),
                y,
                i + Math.min(_, w),
                Math.max(v, M),
                b,
                i + Math.max(_, w),
                S,
                0,
                T,
              );
        },
        p = [0.42, 0.43, 0.44],
        g = [0.08, 0.08, 0.085];
      (d(r, 0, -l, r + 0.012, 0.72, l, F.METAL, p),
        d(o - 0.012, 0, -l, o, 0.72, l, F.METAL, p),
        d(r, 0.72 - 0.012, -l, o, 0.72, l, F.METAL, p),
        d(r, 0, -l, o, 0.01, l, F.METAL, p));
      let m = f * l,
        x = f * (l + 0.018);
      if (
        (d(r - 0.035, 0, m, r, 0.72 + 0.035, x, F.METAL, p),
        d(o, 0, m, o + 0.035, 0.72 + 0.035, x, F.METAL, p),
        d(r - 0.035, 0.72, m, o + 0.035, 0.72 + 0.035, x, F.METAL, p),
        u)
      ) {
        let v = f * (l + 0.15),
          y = f * (l + 0.15 + 0.72);
        d(r + 0.05, 0, v, o + 0.05, 0.02, y, F.METAL, p);
        for (let _ = 0; _ < 9; _++) {
          let M = 0.06 + _ * 0.072;
          d(
            r + 0.06,
            0.02,
            f * (l + 0.15 + M),
            o + 0.04,
            0.032,
            f * (l + 0.15 + M + 0.02),
            F.METAL,
            p,
          );
        }
      } else {
        d(r, 0.01, f * (l - 0.01), o, 0.72, f * (l + 0.004), F.DARK, g);
        for (let v = 0; v < 9; v++) {
          let y = 0.06 + v * 0.072;
          d(
            r + 0.01,
            y,
            f * (l - 0.004),
            o - 0.01,
            y + 0.022,
            f * (l + 0.03),
            F.METAL,
            p,
          );
        }
      }
    }
    buildBreach(t, e, n, i, r, o) {
      let a = 4,
        c = this.ceilH,
        l = 0.2 / 2,
        h = this.th,
        u = R2(r.seed),
        f =
          h.wallKind === "concrete" ||
          h.wallKind === "brick" ||
          h.wallKind === "tile" ||
          r.reinf,
        d =
          {
            brick: [0.34, 0.17, 0.11],
            concrete: [0.42, 0.41, 0.39],
            tile: [0.6, 0.59, 0.56],
          }[h.wallKind] || (r.reinf ? [0.45, 0.44, 0.42] : [0.82, 0.8, 0.74]),
        p = e ? i : n,
        g = (N, z, U) => (e ? [n + U, z, p + N] : [p + N, z, i + U]),
        m = (N, z, U) => (e ? [U, z, N] : [N, z, U]),
        x = 0.62 + u() * 0.18,
        v = 0.62 + u() * 0.18,
        y = Math.min(c - 0.18, 2.12 + u() * 0.5),
        _ = [[x, 0]];
      for (let N of [0.35, 0.8, 1.25, 1.62]) _.push([x + u() * 0.09, N]);
      let M = x + 0.1 + u() * 0.18,
        b = a - v - 0.1 - u() * 0.18;
      _.push([M - 0.04, y - 0.3 - u() * 0.25]);
      let w = 9,
        S = [];
      for (let N = 0; N <= w; N++) {
        let U = [
          M + ((b - M) * N) / w + (u() - 0.5) * 0.1,
          y + (u() - 0.5) * 0.3 - Math.pow(Math.abs(N / w - 0.5) * 2, 2) * 0.28,
        ];
        (_.push(U), S.push(U));
      }
      _.push([b + 0.04, y - 0.3 - u() * 0.25]);
      for (let N of [1.62, 1.25, 0.8, 0.35]) _.push([a - v - u() * 0.09, N]);
      _.push([a - v, 0]);
      let T = [[-l, 0], ..._, [a + l, 0], [a + l, c], [-l, c]],
        E = Kn.triangulateShape(
          T.map((N) => new ut(N[0], N[1])),
          [],
        );
      for (let N of [1, -1]) {
        let z = m(0, 0, N);
        for (let U of E)
          t.tri(
            g(T[U[0]][0], T[U[0]][1], N * l),
            g(T[U[1]][0], T[U[1]][1], N * l),
            g(T[U[2]][0], T[U[2]][1], N * l),
            z,
            F.WALL,
            o,
          );
      }
      for (let N = 0; N < _.length - 1; N++) {
        let z = _[N],
          U = _[N + 1],
          X = U[0] - z[0],
          H = U[1] - z[1],
          O = Math.hypot(X, H) || 1,
          V = m(H / O, -X / O, 0),
          at = (u() - 0.5) * 0.03,
          tt = (u() - 0.5) * 0.03;
        t.quad(
          g(z[0], z[1], l),
          g(U[0], U[1], l),
          g(U[0] + tt, U[1], -l),
          g(z[0] + at, z[1], -l),
          V,
          F.CORE,
          u(),
          d,
        );
      }
      (t.quad(
        g(-l, 0, -l),
        g(-l, 0, l),
        g(-l, c, l),
        g(-l, c, -l),
        m(-1, 0, 0),
        F.WALL,
        o,
      ),
        t.quad(
          g(a + l, 0, -l),
          g(a + l, 0, l),
          g(a + l, c, l),
          g(a + l, c, -l),
          m(1, 0, 0),
          F.WALL,
          o,
        ));
      let C = (N, z, U, X, H, O, V, at, tt = 63) => {
        let wt = g(N, z, U),
          dt = g(X, H, O);
        t.box(
          Math.min(wt[0], dt[0]),
          Math.min(wt[1], dt[1]),
          Math.min(wt[2], dt[2]),
          Math.max(wt[0], dt[0]),
          Math.max(wt[1], dt[1]),
          Math.max(wt[2], dt[2]),
          V,
          0,
          at,
          tt,
        );
      };
      for (let N of [1, -1])
        (C(-l, 0, N * l, x, 0.1, N * (l + 0.012), F.BASE),
          C(a - v, 0, N * l, a + l, 0.1, N * (l + 0.012), F.BASE));
      let R = (N) => {
        let z = y;
        for (let U = 0; U < S.length - 1; U++) {
          let X = S[U],
            H = S[U + 1];
          if (N >= X[0] && N <= H[0]) {
            z =
              X[1] + ((H[1] - X[1]) * (N - X[0])) / Math.max(1e-4, H[0] - X[0]);
            break;
          }
        }
        return z;
      };
      if (f) {
        let N = [0.24, 0.12, 0.06];
        for (let z = 0.25; z < a; z += 0.22) {
          if (z < x || z > a - v) continue;
          let U = R(z),
            X = 0.15 + u() * 0.55,
            H = (r.side || 1) * (0.05 + u() * 0.25);
          (this.rod(
            t,
            g(z, U + 0.08, 0),
            g(z + (u() - 0.5) * 0.08, U - X, H),
            0.007,
            N,
          ),
            u() < 0.5 &&
              this.rod(
                t,
                g(z, 0, 0),
                g(z + (u() - 0.5) * 0.1, 0.1 + u() * 0.3, -H * 0.6),
                0.007,
                N,
              ));
        }
      } else {
        let N = [0.56, 0.42, 0.25];
        for (let z = 0.2; z < a; z += 0.4) {
          if (z < x - 0.02 || z > a - v + 0.02) continue;
          let U = R(z),
            X = 0.06 + u() * 0.3;
          for (let H = 0; H < 3; H++) {
            let O = z - 0.02 + H * 0.0133,
              V = O + 0.0133;
            C(O, U - X - u() * 0.12, -0.045, V, c, 0.045, F.WOOD, N);
          }
          if (u() < 0.65) {
            let H = 0.06 + u() * 0.2;
            for (let O = 0; O < 2; O++)
              C(
                z - 0.02 + O * 0.02,
                0,
                -0.045,
                z + O * 0.02,
                H + u() * 0.08,
                0.045,
                F.WOOD,
                N,
              );
          }
        }
        for (let z = 0; z < 9; z++) {
          let U = M + u() * (b - M),
            X = R(U),
            H = u() < 0.5 ? 1 : -1,
            O = H * (l + 0.004),
            V = 0.05 + u() * 0.12,
            at = 0.06 + u() * 0.2,
            tt = H * (0.02 + u() * 0.06);
          t.quad(
            g(U, X + 0.02, O),
            g(U + V, X + 0.02, O),
            g(U + V, X - at, O + tt),
            g(U, X - at, O + tt),
            m(0, 0, H),
            F.WALL,
            o,
          );
        }
      }
      let I = r.side || 1,
        k = 34;
      for (let N = 0; N < k; N++) {
        let z = N < 6,
          U = z ? 0.14 + u() * 0.2 : 0.025 + u() * 0.09,
          X = u() < 0.72 ? I : -I,
          H = Math.pow(u(), 1.6) * (z ? 0.9 : 1.4),
          O = x - 0.25 + u() * (a - x - v + 0.5),
          V = X * (l * 0.5 + H);
        this.rock(
          t,
          g(O, 0, V),
          U,
          u,
          z && !f && u() < 0.6 ? F.WALL : F.CORE,
          d,
          o,
        );
      }
    }
    rod(t, e, n, i, r) {
      let o = [n[0] - e[0], n[1] - e[1], n[2] - e[2]],
        a = Math.hypot(o[0], o[1], o[2]) || 1,
        c = [o[0] / a, o[1] / a, o[2] / a],
        l = Math.abs(c[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0],
        h = [
          c[1] * l[2] - c[2] * l[1],
          c[2] * l[0] - c[0] * l[2],
          c[0] * l[1] - c[1] * l[0],
        ],
        u = Math.hypot(h[0], h[1], h[2]);
      h = h.map((p) => p / u);
      let f = [
          h[1] * c[2] - h[2] * c[1],
          h[2] * c[0] - h[0] * c[2],
          h[0] * c[1] - h[1] * c[0],
        ],
        d = [
          [1, 0],
          [0, 1],
          [-1, 0],
          [0, -1],
        ].map(([p, g]) => [
          h[0] * p * i + f[0] * g * i,
          h[1] * p * i + f[1] * g * i,
          h[2] * p * i + f[2] * g * i,
        ]);
      for (let p = 0; p < 4; p++) {
        let g = d[p],
          m = d[(p + 1) % 4],
          x = [
            (g[0] + m[0]) / (2 * i),
            (g[1] + m[1]) / (2 * i),
            (g[2] + m[2]) / (2 * i),
          ];
        t.quad(
          [e[0] + g[0], e[1] + g[1], e[2] + g[2]],
          [n[0] + g[0], n[1] + g[1], n[2] + g[2]],
          [n[0] + m[0], n[1] + m[1], n[2] + m[2]],
          [e[0] + m[0], e[1] + m[1], e[2] + m[2]],
          x,
          F.METAL,
          0,
          r,
        );
      }
    }
    rock(t, e, n, i, r, o, a) {
      let c = () => (i() - 0.5) * n * 0.5,
        l = n * (0.35 + i() * 0.35),
        h = [
          [-n, 0, -n],
          [n, 0, -n],
          [n, 0, n],
          [-n, 0, n],
          [-n, l, -n],
          [n, l, -n],
          [n, l, n],
          [-n, l, n],
        ].map((f, d) => [
          e[0] + f[0] * 0.5 + c(),
          Math.max(0.001, f[1] + (d >= 4 ? c() * 0.6 : 0)),
          e[2] + f[2] * 0.5 + c(),
        ]),
        u = 0.75 + i() * 0.4;
      t.hexa(h, r, a, [o[0] * u, o[1] * u, o[2] * u], 62);
    }
    buildStair(t, e, n) {
      let i = this.m,
        r = 4,
        o = this.ceilH,
        a = i.stairs.find((x) => x.cx === e && x.cy === n),
        c = a ? a.dir : 3,
        l = e * r,
        h = n * r,
        u = (x, v, y) => {
          let _ = Io(c, x, y);
          return [l + _[0], v, h + _[1]];
        },
        f = (x, v, y, _, M, b, w, S, T = 63) => {
          let E = Io(c, x, y),
            C = Io(c, _, b);
          t.box(
            l + Math.min(E[0], C[0]),
            v,
            h + Math.min(E[1], C[1]),
            l + Math.max(E[0], C[0]),
            M,
            h + Math.max(E[1], C[1]),
            w,
            0,
            S,
            T,
          );
        },
        d = (x, v, y, _, M, b, w = !0, S) => {
          let T = w ? [0, 1, 0] : [0, -1, 0];
          t.quad(u(x, M, v), u(y, M, v), u(y, M, _), u(x, M, _), T, b, 0.5, S);
        },
        p = (x, v, y, _, M, b, w) => {
          let S = dd(x),
            T = ch(c, 0, -1),
            E = u(y, _, b),
            C = u(v, _, b),
            R = u(v, M, b),
            I = u(y, M, b);
          t.quad(E, C, R, I, [T[0], 0, T[1]], F.SIGN, 0, w, [
            [S[0], S[1]],
            [S[2], S[1]],
            [S[2], S[3]],
            [S[0], S[3]],
          ]);
        },
        g = a ? a.kind : "down",
        m = [0.36, 0.36, 0.37];
      if (g === "down") {
        (d(0, 0, r, 1, 0, F.FLOOR),
          d(0, 1, 0.9, r, 0, F.FLOOR),
          d(3.1, 1, r, r, 0, F.FLOOR),
          d(0, 0, r, r, o, F.CEIL, !1));
        let x = 12;
        for (let y = 0; y < x; y++) {
          let _ = 1 + y * 0.25,
            M = _ + 0.25;
          f(0.9, -3.4, _, 3.1, -(y + 1) * 0.2, M, F.STEP, void 0, 55);
        }
        (f(0.86, -3.4, 1, 0.9, 0, r, F.STEP),
          f(3.1, -3.4, 1, 3.14, 0, r, F.STEP),
          f(0.9, -3.4, r - 0.12, 3.1, 0, r - 0.1, F.DARK));
        for (let y of [0.9, 3.1]) {
          for (let _ of [1.05, 2.5, 3.9])
            f(y - 0.025, 0, _ - 0.025, y + 0.025, 1, _ + 0.025, F.METAL, m);
          f(y - 0.03, 0.97, 1, y + 0.03, 1.03, 3.95, F.METAL, m);
        }
        f(0.9, 0.97, 1, 3.1, 1.03, 1.06, F.METAL, m);
        let v = a ? Math.min(3, i.depth - 1) : 0;
        p(v, 1.4, 2.6, 2.15, 2.55, r - 0.105, [0.15, 1, 0.35]);
      } else if (g === "up") {
        (d(0, 0, r, r, 0, F.FLOOR),
          d(0, 0, r, 1.6, o, F.CEIL, !1),
          d(0, 1.6, 0.9, r, o, F.CEIL, !1),
          d(3.1, 1.6, r, r, o, F.CEIL, !1));
        let x = Math.ceil(o / 0.22);
        for (let y = 0; y < x; y++) {
          let _ = 1 + y * (3 / x);
          f(0.9, 0, _, 3.1, (y + 1) * (o / x), r - 0.1, F.STEP, void 0, 39);
        }
        (f(0.9, o, 1.6, 3.1, o + 3, 1.62, F.DARK),
          f(0.86, o, 1.6, 0.9, o + 3, r, F.DARK),
          f(3.1, o, 1.6, 3.14, o + 3, r, F.DARK));
        for (let y of [0.9, 3.1])
          (f(y - 0.025, 0, 1, y + 0.025, 1, 1.05, F.METAL, m),
            f(y - 0.03, 0.97, 1, y + 0.03, 1.03, 1.6, F.METAL, m));
        let v = 4 + Math.min(3, i.depth - 2);
        p(v, 1.4, 2.6, 0.55, 0.85, 0.98, [0.15, 1, 0.35]);
      } else {
        (d(0, 0, r, 1.2, 0, F.FLOOR),
          d(0, 0, r, 1.2, o, F.CEIL, !1),
          d(0.6, 1.2, 3.4, 3.9, 0.02, F.PROP, !0, [0.06, 0.055, 0.05]),
          f(0, 0, 1.2, r, 0.02, r, F.PROP, [0.05, 0.05, 0.05], 4));
        let x = [0.62, 0.62, 0.64];
        (f(0.45, 0, 1.25, 0.6, 2.7, 3.8, F.FRAME, x),
          f(3.4, 0, 1.25, 3.55, 2.7, 3.8, F.FRAME, x),
          f(0.45, 0, 3.72, 3.55, 2.7, 3.8, F.FRAME, x),
          f(0.45, 2.7, 1.2, 3.55, 2.75, 3.8, F.FRAME, x),
          f(1.2, 2.66, 1.9, 2.8, 2.7, 3.3, F.EMIS, [1.6, 1.5, 1.3], 8),
          f(0.6, 0.9, 2, 0.66, 0.95, 3.5, F.METAL, [0.7, 0.7, 0.7]),
          f(3.34, 0.9, 2, 3.4, 0.95, 3.5, F.METAL, [0.7, 0.7, 0.7]),
          f(0, 0, 1, 0.6, o, 1.2, F.METAL, [0.4, 0.4, 0.41]),
          f(3.4, 0, 1, r, o, 1.2, F.METAL, [0.4, 0.4, 0.41]),
          f(0.6, 2.3, 1, 3.4, o, 1.2, F.METAL, [0.4, 0.4, 0.41]));
        let v = dd(10),
          y = ch(c, 0, -1);
        (t.quad(
          u(2.3, 2.45, 0.99),
          u(1.7, 2.45, 0.99),
          u(1.7, 2.75, 0.99),
          u(2.3, 2.75, 0.99),
          [y[0], 0, y[1]],
          F.SIGN,
          0,
          [1, 0.45, 0.08],
          [
            [v[0], v[1]],
            [v[2], v[1]],
            [v[2], v[3]],
            [v[0], v[3]],
          ],
        ),
          f(3.55, 1.1, 0.95, 3.75, 1.4, 1, F.METAL, [0.55, 0.55, 0.57]),
          f(3.6, 1.15, 0.94, 3.7, 1.35, 0.95, F.EMIS, [0.9, 0.5, 0.1]),
          f(3.35, 1, 1.4, 3.4, 1.5, 1.7, F.METAL, [0.3, 0.3, 0.3]),
          f(3.34, 1.1, 1.45, 3.35, 1.4, 1.65, F.EMIS, [0.8, 0.85, 1]));
      }
    }
    updateVisibility(t, e) {
      let n = (e + 48 * 0.75) ** 2;
      for (let i of this.chunks.values()) {
        let r = i.userData.center,
          o = r.x - t.x,
          a = r.z - t.z;
        i.visible = o * o + a * a < n;
      }
    }
    dispose() {
      for (let t of this.chunks.values()) t.geometry.dispose();
      this.chunks.clear();
    }
  };
  var me = 4,
    gs = 0.1;
  function Fr(s, t, e) {
    let n = [];
    for (let i = 0; i < 4; i++) {
      let r = s.edge(t, e, i);
      (r === 1 || r === 2) && n.push(i);
    }
    return n;
  }
  function xc(s, t, e, n, i, r) {
    let o = s * me,
      a = t * me;
    switch (e) {
      case 0:
        return [o + me - gs - r, a + n, o + me - gs, a + n + i];
      case 2:
        return [o + gs, a + n, o + gs + r, a + n + i];
      case 1:
        return [o + n, a + me - gs - r, o + n + i, a + me - gs];
      default:
        return [o + n, a + gs, o + n + i, a + gs + r];
    }
  }
  var Oo = [
    [-1, 0],
    [0, -1],
    [1, 0],
    [0, 1],
  ];
  function Uo(s, t, e = !0) {
    if ((s.addPropRect(t[0], t[1], t[2], t[3]), e)) {
      let n =
          Math.floor((t[1] + t[3]) / 2 / me) * s.W +
          Math.floor((t[0] + t[2]) / 2 / me),
        i = s.propRects.get(n);
      i && i[i.length - 1].push(1);
    }
  }
  function cE(s, t, e, n) {
    let [i, r, o, a] = t,
      c = 1.85,
      l =
        n === "water"
          ? [0.06, 0.16, 0.36]
          : n === "bomb"
            ? [0.36, 0.05, 0.04]
            : n === "med"
              ? [0.75, 0.75, 0.72]
              : n === "gas"
                ? [0.1, 0.3, 0.26]
                : [0.1, 0.24, 0.1];
    s.box(i, 0, r, o, c, a, F.METAL, 0, l);
    let h = Oo[e],
      u = h[0] !== 0,
      f = u ? r : i,
      d = u ? a : o,
      p = h[0] > 0 ? o : h[0] < 0 ? i : h[1] > 0 ? a : r,
      g = h[0] !== 0 ? h[0] : h[1],
      m = (v, y, _, M, b, w, S) => {
        let T = p,
          E = p + g * b;
        u
          ? s.box(Math.min(T, E), _, v, Math.max(T, E), M, y, w, 0, S)
          : s.box(v, _, Math.min(T, E), y, M, Math.max(T, E), w, 0, S);
      };
    m(f + 0.07, d - 0.26, 0.72, 1.72, 0.004, F.EMIS, [0.22, 0.24, 0.26]);
    let x = [
      [0.8, 0.75, 0.6],
      [0.2, 0.5, 0.9],
      [0.9, 0.3, 0.2],
      [0.3, 0.8, 0.4],
      [0.9, 0.8, 0.3],
    ];
    for (let v = 0; v < 3; v++)
      for (let y = 0; y < 5; y++) {
        let _ = f + 0.12 + y * ((d - f - 0.4) / 5),
          M = 0.8 + v * 0.31;
        m(_, _ + 0.08, M, M + 0.18, 0.05, F.PROP, x[(v * 2 + y) % 5]);
      }
    (m(f + 0.07, d - 0.26, 0.72, 1.72, 0.07, F.GLASS, [0.6, 0.7, 0.75]),
      m(f + 0.1, d - 0.1, 0.15, 0.45, 0.01, F.PROP, [0.02, 0.02, 0.02]),
      m(d - 0.2, d - 0.08, 0.95, 1.25, 0.015, F.EMIS, [0.8, 0.45, 0.08]),
      m(
        f,
        d,
        c - 0.25,
        c - 0.05,
        0.01,
        F.EMIS,
        n === "water"
          ? [0.3, 0.6, 1]
          : n === "bomb"
            ? [1, 0.3, 0.2]
            : n === "med"
              ? [1, 0.25, 0.25]
              : n === "gas"
                ? [0.3, 1, 0.8]
                : [0.4, 1, 0.4],
      ));
  }
  function k2(s, t, e, n, i = [0.12, 0.1, 0.09]) {
    let r = Math.cos(n),
      o = Math.sin(n),
      a = (h, u) => [t + h * r - u * o, e + h * o + u * r],
      c = (h, u) => {
        let f = a(h, u);
        s.box(
          f[0] - 0.02,
          0,
          f[1] - 0.02,
          f[0] + 0.02,
          0.45,
          f[1] + 0.02,
          F.METAL,
          0,
          [0.3, 0.3, 0.3],
        );
      };
    (c(-0.2, -0.2),
      c(0.2, -0.2),
      c(-0.2, 0.2),
      c(0.2, 0.2),
      s.box(t - 0.24, 0.45, e - 0.24, t + 0.24, 0.5, e + 0.24, F.FABRIC, 0, i));
    let l = a(0, -0.22);
    Math.abs(o) < 0.5
      ? s.box(
          t - 0.24,
          0.5,
          l[1] - 0.03,
          t + 0.24,
          0.95,
          l[1] + 0.03,
          F.FABRIC,
          0,
          i,
        )
      : s.box(
          l[0] - 0.03,
          0.5,
          e - 0.24,
          l[0] + 0.03,
          0.95,
          e + 0.24,
          F.FABRIC,
          0,
          i,
        );
  }
  function lE(s, t) {
    let [e, n, i, r] = t;
    s.box(e, 0.72, n, i, 0.76, r, F.PROP, 0, [0.32, 0.27, 0.2]);
    for (let [o, a] of [
      [e + 0.04, n + 0.04],
      [i - 0.08, n + 0.04],
      [e + 0.04, r - 0.08],
      [i - 0.08, r - 0.08],
    ])
      s.box(o, 0, a, o + 0.04, 0.72, a + 0.04, F.METAL, 0, [0.25, 0.25, 0.26]);
  }
  function hE(s, t, e, n, i) {
    (n
      ? (s.box(
          t - 0.25,
          0.8,
          e - 0.03,
          t + 0.25,
          1.12,
          e + 0.03,
          F.PROP,
          0,
          [0.03, 0.03, 0.035],
        ),
        i &&
          s.box(
            t - 0.22,
            0.83,
            e + 0.031,
            t + 0.22,
            1.09,
            e + 0.035,
            F.EMIS,
            0,
            [0.15, 0.3, 0.35],
          ))
      : (s.box(
          t - 0.03,
          0.8,
          e - 0.25,
          t + 0.03,
          1.12,
          e + 0.25,
          F.PROP,
          0,
          [0.03, 0.03, 0.035],
        ),
        i &&
          s.box(
            t + 0.031,
            0.83,
            e - 0.22,
            t + 0.035,
            1.09,
            e + 0.22,
            F.EMIS,
            0,
            [0.15, 0.3, 0.35],
          )),
      s.box(
        t - 0.06,
        0.76,
        e - 0.06,
        t + 0.06,
        0.8,
        e + 0.06,
        F.PROP,
        0,
        [0.05, 0.05, 0.05],
      ));
  }
  function uE(s, t) {
    let [e, n, i, r] = t;
    (s.box(e, 0.45, n, i, 0.62, r, F.FABRIC, 0, [0.55, 0.56, 0.52]),
      s.box(
        e + 0.02,
        0.3,
        n + 0.02,
        i - 0.02,
        0.45,
        r - 0.02,
        F.METAL,
        0,
        [0.5, 0.5, 0.52],
      ));
    for (let [o, a] of [
      [e, n],
      [i - 0.04, n],
      [e, r - 0.04],
      [i - 0.04, r - 0.04],
    ])
      s.box(o, 0, a, o + 0.04, 0.45, a + 0.04, F.METAL, 0, [0.5, 0.5, 0.52]);
    s.box(
      (e + i) / 2 - 0.2,
      0.621,
      (n + r) / 2 - 0.25,
      (e + i) / 2 + 0.25,
      0.622,
      (n + r) / 2 + 0.2,
      F.PROP,
      0,
      [0.25, 0.04, 0.03],
    );
  }
  function fE(s, t, e, n) {
    let [i, r, o, a] = t,
      c = (i + o) / 2,
      l = (r + a) / 2,
      h = e ? o - i : a - r,
      u = (f, d, p, g, m, x, v, y) => {
        e
          ? s.box(c + f * h, p, l + m, c + d * h, g, l + x, v, 0, y)
          : s.box(c + m, p, l + f * h, c + x, g, l + d * h, v, 0, y);
      };
    (u(-0.5, 0.5, 0.25, 0.8, -0.86, 0.86, F.METAL, n),
      u(-0.28, 0.22, 0.8, 1.32, -0.78, 0.78, F.METAL, n),
      u(-0.27, 0.21, 0.84, 1.28, -0.79, 0.79, F.GLASS, [0.05, 0.06, 0.07]));
    for (let f of [-0.33, 0.33])
      for (let d of [-0.86, 0.78])
        u(f - 0.07, f + 0.07, 0, 0.42, d, d + 0.08, F.PROP, [0.02, 0.02, 0.02]);
    (u(0.49, 0.505, 0.55, 0.68, -0.75, -0.5, F.PROP, [0.6, 0.6, 0.55]),
      u(0.49, 0.505, 0.55, 0.68, 0.5, 0.75, F.PROP, [0.6, 0.6, 0.55]));
  }
  function hh(s, t, e, n, i, r, o, a) {
    Math.abs(n - t) > Math.abs(i - e)
      ? s.cylH("x", Math.min(t, n), Math.max(t, n), r, e, o, F.METAL, 0, a, 6)
      : s.cylH("z", Math.min(e, i), Math.max(e, i), r, t, o, F.METAL, 0, a, 6);
  }
  function dE(s, t, e, n, i, r) {
    let o = dd(r),
      a = Oo[i],
      c = 0.4,
      l = 0.16;
    if (a[0] !== 0) {
      let h = t + a[0] * 0.012;
      s.box(
        Math.min(t, h) - 0.01,
        e - l / 2 - 0.02,
        n - c / 2 - 0.02,
        Math.max(t, h),
        e + l / 2 + 0.02,
        n + c / 2 + 0.02,
        F.PROP,
        0,
        [0.1, 0.1, 0.1],
      );
      let u = [a[0], 0, 0],
        f = [h + a[0] * 0.002, e - l / 2, n + (c / 2) * a[0]],
        d = [h + a[0] * 0.002, e - l / 2, n - (c / 2) * a[0]],
        p = [h + a[0] * 0.002, e + l / 2, n - (c / 2) * a[0]],
        g = [h + a[0] * 0.002, e + l / 2, n + (c / 2) * a[0]];
      s.quad(
        f,
        d,
        p,
        g,
        u,
        F.SIGN,
        0,
        [0.2, 1, 0.4],
        [
          [o[0], o[1]],
          [o[2], o[1]],
          [o[2], o[3]],
          [o[0], o[3]],
        ],
      );
    } else {
      let h = n + a[1] * 0.012;
      s.box(
        t - c / 2 - 0.02,
        e - l / 2 - 0.02,
        Math.min(n, h) - 0.01,
        t + c / 2 + 0.02,
        e + l / 2 + 0.02,
        Math.max(n, h),
        F.PROP,
        0,
        [0.1, 0.1, 0.1],
      );
      let u = [0, 0, a[1]],
        f = [t - (c / 2) * a[1], e - l / 2, h + a[1] * 0.002],
        d = [t + (c / 2) * a[1], e - l / 2, h + a[1] * 0.002],
        p = [t + (c / 2) * a[1], e + l / 2, h + a[1] * 0.002],
        g = [t - (c / 2) * a[1], e + l / 2, h + a[1] * 0.002];
      s.quad(
        f,
        d,
        p,
        g,
        u,
        F.SIGN,
        0,
        [0.2, 1, 0.4],
        [
          [o[0], o[1]],
          [o[2], o[1]],
          [o[2], o[3]],
          [o[0], o[3]],
        ],
      );
    }
  }
  function pE(s, t, e) {
    let [n, i, r, o] = t,
      a = [0.2, 0.19, 0.18],
      c = [0.86, 0.82, 0.7],
      l = [1.6, 0.85, 0.35];
    (s.cbox(n, 0, i, r, 0.82, o, 0.03, F.CORE, 0, a),
      s.cbox(
        n - 0.04,
        0.82,
        i - 0.04,
        r + 0.04,
        0.9,
        o + 0.04,
        0.02,
        F.CORE,
        0,
        [0.24, 0.23, 0.21],
      ));
    let h = (n + r) / 2,
      u = (i + o) / 2,
      f = Oo[e],
      d = f[0] > 0 ? r + 0.045 : f[0] < 0 ? n - 0.045 : h,
      p = f[1] > 0 ? o + 0.045 : f[1] < 0 ? i - 0.045 : u;
    f[0] !== 0
      ? s.box(
          d - 0.006,
          0.45,
          u - 0.22,
          d + 0.006,
          0.9,
          u + 0.22,
          F.FABRIC,
          0,
          [0.42, 0.04, 0.03],
        )
      : s.box(
          h - 0.22,
          0.45,
          p - 0.006,
          h + 0.22,
          0.9,
          p + 0.006,
          F.FABRIC,
          0,
          [0.42, 0.04, 0.03],
        );
    let g = h - f[0] * 0.08,
      m = u - f[1] * 0.08;
    (s.cylY(g, m, 0.06, 0.9, 1.18, F.CORE, 0, [0.55, 0.52, 0.46], 10),
      s.ell(g, 1.25, m, 0.055, 0.075, 0.055, F.CORE, 0, [0.58, 0.55, 0.48], 10),
      s.cylY(g, m, 0.085, 0.9, 0.93, F.CORE, 0, [0.3, 0.29, 0.27], 12));
    let x = h + f[0] * 0.12 + (f[1] !== 0 ? 0.22 : 0),
      v = u + f[1] * 0.12 + (f[0] !== 0 ? 0.22 : 0);
    s.cylY(x, v, 0.07, 0.9, 0.94, F.METAL, 0, [0.5, 0.4, 0.2], 10);
    for (let _ = 0; _ < 4; _++)
      s.cylY(
        x + (_ - 1.5) * 0.02,
        v + ((_ % 2) - 0.5) * 0.02,
        0.012,
        0.94,
        0.946,
        F.METAL,
        0,
        [0.85, 0.65, 0.25],
        6,
      );
    [
      [-0.32, 0],
      [-0.24, 0.1],
      [0.24, 0.08],
      [0.32, -0.02],
      [-0.1, -0.12],
      [0.12, -0.14],
    ].forEach(([_, M], b) => {
      let w = f[0] !== 0 ? h + M : h + _,
        S = f[0] !== 0 ? u + _ : u + M,
        T = 0.06 + ((b * 0.037) % 0.12);
      (s.cylY(w, S, 0.014, 0.9, 0.9 + T, F.PROP, 0, c, 8),
        s.box(
          w - 0.005,
          0.9 + T,
          S - 0.005,
          w + 0.005,
          0.9 + T + 0.025,
          S + 0.005,
          F.EMIS,
          0,
          l,
        ));
    });
    for (let _ = 0; _ < 4; _++) {
      let M = (_ - 1.5) * 0.35,
        b = h + f[0] * 0.7 + (f[0] === 0 ? M : 0),
        w = u + f[1] * 0.7 + (f[1] === 0 ? M : 0);
      (s.cylY(b, w, 0.016, 0, 0.1 + _ * 0.03, F.PROP, 0, c, 8),
        s.box(
          b - 0.005,
          0.1 + _ * 0.03,
          w - 0.005,
          b + 0.005,
          0.125 + _ * 0.03,
          w + 0.005,
          F.EMIS,
          0,
          l,
        ));
    }
    for (let _ = 0; _ < 5; _++) {
      let M = (_ - 2) * 0.18,
        b = 1.45 + (_ % 2) * 0.14,
        w = f[0] !== 0 ? (f[0] > 0 ? n - 0.002 : r + 0.002) : h + M,
        S = f[0] !== 0 ? u + M : f[1] > 0 ? i - 0.002 : o + 0.002;
      f[0] !== 0
        ? s.box(
            w - 0.002,
            b - 0.13,
            S - 0.035,
            w + 0.002,
            b + 0.13,
            S + 0.035,
            F.PROP,
            0,
            [0.86, 0.83, 0.72],
          )
        : s.box(
            w - 0.035,
            b - 0.13,
            S - 0.002,
            w + 0.035,
            b + 0.13,
            S + 0.002,
            F.PROP,
            0,
            [0.86, 0.83, 0.72],
          );
    }
  }
  function mE(s, t, e) {
    (s.cylY(t, e, 0.16, 0, 0.32, F.PROP, 0, [0.42, 0.22, 0.12], 10),
      s.cylY(t, e, 0.15, 0.31, 0.33, F.PROP, 0, [0.12, 0.08, 0.05], 10));
    for (let n = 0; n < 7; n++) {
      let i = (n / 7) * Math.PI * 2;
      s.ell(
        t + Math.cos(i) * 0.12,
        0.62 + (n % 3) * 0.12,
        e + Math.sin(i) * 0.12,
        0.09,
        0.2,
        0.05,
        F.PROP,
        0,
        [0.12, 0.28, 0.1],
        8,
      );
    }
    s.cylY(t, e, 0.012, 0.33, 0.8, F.PROP, 0, [0.2, 0.25, 0.12], 6);
  }
  function gE(s, t, e) {
    (s.cbox(
      t - 0.16,
      0,
      e - 0.16,
      t + 0.16,
      1,
      e + 0.16,
      0.02,
      F.PROP,
      0,
      [0.82, 0.82, 0.8],
    ),
      s.cylY(t, e, 0.13, 1, 1.42, F.GLASS, 0, [0.35, 0.55, 0.75], 12),
      s.box(
        t - 0.05,
        0.7,
        e - 0.17,
        t + 0.05,
        0.76,
        e - 0.15,
        F.EMIS,
        0,
        [0.2, 0.5, 1.2],
      ));
  }
  function xE(s, t, e, n, i) {
    let r = Math.cos(n),
      o = Math.sin(n),
      a = 0.3,
      c = (l, h, u) => [t + l * r - h * o, u, e + l * o + h * r];
    s.quad(
      c(-a, -a, 0.01),
      c(a, -a, 0.01 + i),
      c(a, a, 0.01 + i),
      c(-a, a, 0.01),
      [0, 1, 0],
      F.CORE,
      0,
      [0.62, 0.58, 0.5],
    );
  }
  function vE(s, t, e, n) {
    for (let i = 0; i < 5; i++) {
      let r = n() * 6.28,
        o = n() * 0.4,
        a = 0.12 + n() * 0.16;
      s.ell(
        t + Math.cos(r) * o,
        a * 0.7,
        e + Math.sin(r) * o,
        a,
        a * 0.75,
        a * 0.9,
        F.PROP,
        0,
        [0.05 + n() * 0.04, 0.05 + n() * 0.04, 0.06],
        8,
      );
    }
  }
  function L2(s, t, e) {
    let n = s.W,
      i = s.H,
      r = s.props,
      o = (d) =>
        s.reach[d] && s.feat[d] === 0 && (s.floor[d] === 0 || s.floor[d] === 3),
      a = (d, p) =>
        !s.arrivals.some(
          (g) => Math.abs(g[0] - d) <= 1 && Math.abs(g[1] - p) <= 1,
        ),
      c = new Uint8Array(s.N),
      l = e.id,
      h = 2 + Math.floor(t.next() * 3);
    s.vendors = [];
    for (let d = 0; d < 3e3 && s.vendors.length < h; d++) {
      let p = Math.floor(t.next() * s.N),
        g = p % n,
        m = (p / n) | 0;
      if (
        !o(p) ||
        c[p] ||
        s.zone[p] !== 0 ||
        !a(g, m) ||
        s.distFromStart[p] < 10
      )
        continue;
      let x = Fr(s, g, m);
      if (!x.length) continue;
      let v = x[Math.floor(t.next() * x.length)],
        y = xc(g, m, v, 0.35, 0.9, 0.75),
        _ = t.weighted([
          ["water", 0.3],
          ["bomb", 0.2],
          ["ammo", 0.2],
          ["med", 0.15],
          ["gas", 0.15],
        ]),
        M =
          { water: 2e3, bomb: 6e3, ammo: 4e3, med: 3e3, gas: 5e3 }[_] *
          (1 + (s.depth - 1) * 0.5);
      ((c[p] = 1), Uo(s, y));
      let b = {
        cx: g,
        cy: m,
        d: v,
        r: y,
        kind: _,
        price: Math.round(M / 100) * 100,
        stock: 3,
        build: (w) => cE(w, y, v, _),
      };
      (r.push(b), s.vendors.push(b));
    }
    s.altars = [];
    let u = 2 + (t.next() < 0.5 ? 1 : 0),
      f = [];
    for (let d = 0; d < s.N; d++) {
      if (!o(d) || c[d] || s.zone[d] !== 0 || s.distFromStart[d] < 12) continue;
      let p = d % n,
        g = (d / n) | 0,
        m = 0;
      for (let x = 0; x < 4; x++) s.passable(p, g, x) && m++;
      m > 2 || f.push(d);
    }
    for (let d = 0; d < f.length * 2 && s.altars.length < u; d++) {
      let p = f[Math.floor(t.next() * f.length)];
      if (c[p]) continue;
      let g = p % n,
        m = (p / n) | 0;
      if (s.altars.some((b) => Math.hypot(b.cx - g, b.cy - m) < 22)) continue;
      let x = Fr(s, g, m);
      if (!x.length) continue;
      let v = x[Math.floor(t.next() * x.length)],
        y = xc(g, m, v, 1.55, 0.9, 0.5);
      ((c[p] = 1), Uo(s, y));
      let _ = Oo[v],
        M = {
          cx: g,
          cy: m,
          d: v,
          r: y,
          x: (y[0] + y[2]) / 2 + _[0] * 0.95,
          z: (y[1] + y[3]) / 2 + _[1] * 0.95,
          lx: (y[0] + y[2]) / 2,
          lz: (y[1] + y[3]) / 2,
          uses: 0,
          build: (b) => pE(b, y, v),
        };
      (r.push(M), s.altars.push(M));
    }
    for (let d = 0; d < s.N; d++) {
      if (!o(d) || c[d] || s.zone[d] === 2) continue;
      let p = d % n,
        g = (d / n) | 0,
        m = s.decay[d];
      if (
        m < 0.22 &&
        t.next() < 0.05 &&
        (l === "yellow" || l === "office" || l === "hospital")
      ) {
        let x = Fr(s, p, g);
        if (!x.length) continue;
        let v = x[Math.floor(t.next() * x.length)],
          y = xc(p, g, v, 0.3 + t.next() * 3, 0.36, 0.36);
        ((c[d] = 1), Uo(s, y));
        let _ = (y[0] + y[2]) / 2,
          M = (y[1] + y[3]) / 2;
        r.push({
          cx: p,
          cy: g,
          build: t.next() < 0.6 ? (b) => mE(b, _, M) : (b) => gE(b, _, M),
        });
      } else if (m > 0.72 && t.next() < 0.09) {
        let x = (p + 0.2 + t.next() * 0.6) * me,
          v = (g + 0.2 + t.next() * 0.6) * me,
          y = t.next() * 6.28;
        if (t.next() < 0.6) {
          let _ = 0.05 + t.next() * 0.15;
          r.push({ cx: p, cy: g, build: (M) => xE(M, x, v, y, _) });
        } else {
          let _ = Math.floor(t.next() * 1e6) + 1;
          r.push({
            cx: p,
            cy: g,
            build: (M) => {
              let b = _;
              vE(
                M,
                x,
                v,
                () => ((b = (b * 16807) % 2147483647), b / 2147483647),
              );
            },
          });
        }
      }
    }
    if (s.downs && s.downs.length) {
      let d = uh(
        s,
        s.downs.map((p) => s.ci(p.cx, p.cy)),
      );
      for (let p = 0; p < s.N; p++) {
        if (!o(p) || s.zone[p] === 2 || t.next() > 0.035) continue;
        let g = p % n,
          m = (p / n) | 0;
        if (d[p] < 3) continue;
        let x = -1,
          v = d[p];
        for (let y = 0; y < 4; y++) {
          if (!s.passable(g, m, y)) continue;
          let _ = p + ge[y] + xe[y] * n;
          d[_] >= 0 && d[_] < v && ((v = d[_]), (x = y));
        }
        if (!(x < 0))
          for (let y of Fr(s, g, m)) {
            if (y === x || y === (x + 2) % 4) continue;
            let _ = Oo[y],
              M = (g + 0.5) * me - _[0] * (me / 2 - gs - 0),
              b = (m + 0.5) * me - _[1] * (me / 2 - gs - 0),
              w = -_[0],
              T = -(-_[1]),
              E = w,
              C = ge[x],
              R = xe[x],
              k = C * T + R * E > 0 ? 8 : 9;
            r.push({ cx: g, cy: m, build: (N) => dE(N, M, 2.05, b, y, k) });
            break;
          }
      }
    }
    if (l === "yellow")
      for (let d = 0; d < s.N; d++) {
        if (!o(d) || c[d] || t.next() > 0.018) continue;
        let p = d % n,
          g = (d / n) | 0,
          m = (p + 0.5) * me + (t.next() - 0.5) * 2,
          x = (g + 0.5) * me + (t.next() - 0.5) * 2,
          v = (Math.floor(t.next() * 4) * Math.PI) / 2;
        ((c[d] = 1),
          Uo(s, [m - 0.26, x - 0.26, m + 0.26, x + 0.26], !1),
          r.push({
            cx: p,
            cy: g,
            build: (y) => k2(y, m, x, v, [0.14, 0.12, 0.08]),
          }));
      }
    if (l === "office")
      for (let d = 0; d < s.N; d++) {
        if (!o(d) || c[d] || t.next() > 0.45) continue;
        let p = d % n,
          g = (d / n) | 0,
          m = Fr(s, p, g).concat(
            [0, 1, 2, 3].filter((T) => s.edge(p, g, T) === 4),
          );
        if (!m.length) continue;
        let x = m[0],
          v = xc(p, g, x, 0.5, 1.6, 0.75);
        ((c[d] = 1), Uo(s, v));
        let y = t.next() < 0.25,
          _ = Oo[x],
          M = (v[0] + v[2]) / 2 - _[0] * 0.15,
          b = (v[1] + v[3]) / 2 - _[1] * 0.15,
          w = (v[0] + v[2]) / 2 + _[0] * 0.7,
          S = (v[1] + v[3]) / 2 + _[1] * 0.7;
        r.push({
          cx: p,
          cy: g,
          build: (T) => {
            (lE(T, v),
              hE(T, M, b, _[1] !== 0, y),
              k2(T, w, S, 0, [0.05, 0.05, 0.06]));
          },
        });
      }
    if (l === "hospital")
      for (let d = 0; d < s.N; d++) {
        if (!o(d) || c[d] || t.next() > 0.22) continue;
        let p = d % n,
          g = (d / n) | 0,
          m = Fr(s, p, g);
        if (!m.length) continue;
        let x = m[Math.floor(t.next() * m.length)],
          v = xc(p, g, x, 0.6, 1, 2);
        ((c[d] = 1),
          Uo(s, v),
          r.push({ cx: p, cy: g, build: (y) => uE(y, v) }));
      }
    if (l === "parking")
      for (let d = 0; d < s.N; d++) {
        if (!o(d) || c[d]) continue;
        let p = d % n,
          g = (d / n) | 0,
          m = Fr(s, p, g);
        if (m.length && t.next() < 0.35 && a(p, g)) {
          let x = m[Math.floor(t.next() * m.length)],
            v = x === 0 || x === 2,
            y = xc(p, g, x, 1.05, 1.9, 3.9);
          ((c[d] = 1), Uo(s, [y[0] + 0.1, y[1] + 0.1, y[2] - 0.1, y[3] - 0.1]));
          let _ = t.pick([
            [0.3, 0.3, 0.32],
            [0.08, 0.08, 0.09],
            [0.35, 0.08, 0.06],
            [0.1, 0.15, 0.25],
            [0.5, 0.48, 0.42],
          ]);
          r.push({ cx: p, cy: g, build: (M) => fE(M, y, v, _) });
        }
        t.next() < 0.6 &&
          r.push({
            cx: p,
            cy: g,
            build: (x) => {
              let v = p * me,
                y = g * me;
              x.quad(
                [v + 0.05, 0.004, y + 0.05],
                [v + 0.15, 0.004, y + 0.05],
                [v + 0.15, 0.004, y + me - 0.05],
                [v + 0.05, 0.004, y + me - 0.05],
                [0, 1, 0],
                F.PROP,
                0,
                [0.62, 0.6, 0.5],
              );
            },
          });
      }
    if (l === "pipes") {
      for (let d = 0; d < i; d++)
        for (let p = 0; p < n; p++) {
          let g = s.ci(p, d);
          if (s.reach[g]) {
            for (let m of Fr(s, p, d)) {
              if (t.next() > 0.3) continue;
              let x = Oo[m],
                v = p * me,
                y = d * me,
                _ = gs + 0.12,
                M = 2.4 + (m % 2) * 0.25,
                b = t.pick([
                  [0.25, 0.22, 0.18],
                  [0.3, 0.12, 0.06],
                  [0.18, 0.2, 0.2],
                ]),
                w = t.next() < 0.35;
              if (m === 0 || m === 2) {
                let S = m === 0 ? v + me - _ : v + _;
                r.push({
                  cx: p,
                  cy: d,
                  build: (T) => {
                    (hh(T, S, y, S, y + me, M, 0.09, b),
                      w &&
                        hh(T, S, y, S, y + me, M - 0.3, 0.05, [0.2, 0.2, 0.2]));
                  },
                });
              } else {
                let S = m === 1 ? y + me - _ : y + _;
                r.push({
                  cx: p,
                  cy: d,
                  build: (T) => {
                    (hh(T, v, S, v + me, S, M, 0.09, b),
                      w &&
                        hh(T, v, S, v + me, S, M - 0.3, 0.05, [0.2, 0.2, 0.2]));
                  },
                });
              }
            }
            if (d % 3 === 0 && s.reach[g] && t.next() < 0.5) {
              let m = d * me + 1;
              r.push({
                cx: p,
                cy: d,
                build: (x) =>
                  hh(
                    x,
                    p * me,
                    m,
                    p * me + me,
                    m,
                    e.ceilH - 0.2,
                    0.14,
                    [0.22, 0.2, 0.17],
                  ),
              });
            }
          }
        }
      s.vents = [];
      for (let d = 0; d < 40; d++) {
        let p = Math.floor(t.next() * s.N);
        o(p) &&
          s.vents.push({
            x: ((p % n) + 0.3 + t.next() * 0.4) * me,
            z: (((p / n) | 0) + 0.3 + t.next() * 0.4) * me,
            ph: t.next() * 10,
          });
      }
    }
    if (l === "pool")
      for (let d = 0; d < s.N; d++) {
        if (s.floor[d] !== 2 || t.next() > 0.35) continue;
        let p = d % n,
          g = (d / n) | 0;
        for (let m = 0; m < 4; m++) {
          let x = p + ge[m],
            v = g + xe[m];
          if (!s.inb(x, v) || s.floor[s.ci(x, v)] === 2) continue;
          let y = p * me,
            _ = g * me,
            M = m === 0 ? y + me : m === 2 ? y : y + me / 2,
            b = m === 1 ? _ + me : m === 3 ? _ : _ + me / 2;
          r.push({
            cx: p,
            cy: g,
            build: (w) => {
              let S = m === 0 || m === 2;
              for (let T of [-0.25, 0.25])
                S
                  ? w.cylY(
                      M - ge[m] * 0.12,
                      b + T,
                      0.025,
                      -1.8,
                      0.9,
                      F.METAL,
                      0,
                      [0.7, 0.7, 0.72],
                      6,
                    )
                  : w.cylY(
                      M + T,
                      b - xe[m] * 0.12,
                      0.025,
                      -1.8,
                      0.9,
                      F.METAL,
                      0,
                      [0.7, 0.7, 0.72],
                      6,
                    );
            },
          });
          break;
        }
      }
    if (l === "abyss") {
      for (let d = 0; d < s.N; d++) {
        if (s.floor[d] === 1 || t.next() > 0.12) continue;
        let p = d % n,
          g = (d / n) | 0,
          m = (p + 0.5) * me,
          x = (g + 0.5) * me;
        r.push({
          cx: p,
          cy: g,
          build: (v) => {
            v.box(
              m - 0.25,
              -60,
              x - 0.25,
              m + 0.25,
              -0.35,
              x + 0.25,
              F.STEP,
              0,
              [0.2, 0.2, 0.2],
            );
          },
        });
      }
      for (let d = 0; d < s.N; d++) {
        if (s.floor[d] !== 1 || t.next() > 0.06) continue;
        let p = d % n,
          g = (d / n) | 0,
          m = (p + 0.2 + t.next() * 0.6) * me,
          x = (g + 0.2 + t.next() * 0.6) * me,
          v = 2 + t.next() * 8;
        r.push({
          cx: p,
          cy: g,
          build: (y) =>
            y.box(
              m - 0.02,
              e.ceilH - v,
              x - 0.02,
              m + 0.02,
              e.ceilH,
              x + 0.02,
              F.METAL,
              0,
              [0.15, 0.13, 0.12],
            ),
        });
      }
    }
  }
  var ge = [1, 0, -1, 0],
    xe = [0, 1, 0, -1],
    F1 = class {
      constructor(t, e) {
        ((this.W = t),
          (this.H = e),
          (this.N = t * e),
          (this.vw = new Uint8Array((t + 1) * e)),
          (this.hw = new Uint8Array(t * (e + 1))),
          (this.pillar = new Uint8Array((t + 1) * (e + 1))),
          (this.zone = new Uint8Array(t * e)),
          (this.floor = new Uint8Array(t * e)),
          (this.feat = new Uint8Array(t * e)),
          (this.light = new Uint8Array(t * e)),
          (this.lightI = new Float32Array(t * e)),
          (this.reach = new Uint8Array(t * e)),
          (this.explored = new Uint8Array(t * e)),
          (this.wallHP = new Map()),
          (this.stairs = []),
          (this.items = []),
          (this.spawns = []),
          (this.props = []),
          (this.signs = []),
          (this.traps = []),
          (this.zones = []),
          (this.propRects = new Map()),
          (this.reinforced = new Set()),
          (this.decay = new Float32Array(t * e)),
          (this.duct = new Uint8Array(t * e)),
          (this.ventOpen = new Set()),
          (this.breaches = new Map()),
          (this.breachStub = new Map()),
          (this.altars = []));
      }
      inb(t, e) {
        return t >= 0 && e >= 0 && t < this.W && e < this.H;
      }
      ci(t, e) {
        return e * this.W + t;
      }
      vIdx(t, e) {
        return e * (this.W + 1) + t;
      }
      hIdx(t, e) {
        return e * this.W + t;
      }
      edge(t, e, n) {
        switch (n) {
          case 0:
            return this.vw[e * (this.W + 1) + t + 1];
          case 1:
            return this.hw[(e + 1) * this.W + t];
          case 2:
            return this.vw[e * (this.W + 1) + t];
          default:
            return this.hw[e * this.W + t];
        }
      }
      setEdge(t, e, n, i) {
        switch (n) {
          case 0:
            this.vw[e * (this.W + 1) + t + 1] = i;
            break;
          case 1:
            this.hw[(e + 1) * this.W + t] = i;
            break;
          case 2:
            this.vw[e * (this.W + 1) + t] = i;
            break;
          default:
            this.hw[e * this.W + t] = i;
            break;
        }
      }
      edgeKey(t, e, n) {
        switch (n) {
          case 0:
            return "v" + (t + 1) + "," + e;
          case 1:
            return "h" + t + "," + (e + 1);
          case 2:
            return "v" + t + "," + e;
          default:
            return "h" + t + "," + e;
        }
      }
      walkable(t) {
        let e = this.floor[t];
        return e !== 1 && e !== 6;
      }
      passable(t, e, n) {
        let i = this.edge(t, e, n);
        if (i !== 0 && i !== 3 && i !== 7) return !1;
        let r = t + ge[n],
          o = e + xe[n];
        if (!this.inb(r, o)) return !1;
        let a = this.floor[o * this.W + r];
        return a !== 1 && a !== 6;
      }
      ductPassable(t, e, n) {
        let i = this.edge(t, e, n);
        if (i !== 0 && i !== 3 && i !== 7 && i !== 6) return !1;
        let r = t + ge[n],
          o = e + xe[n];
        return this.inb(r, o) ? this.floor[o * this.W + r] !== 1 : !1;
      }
      sightPass(t, e, n) {
        let i = this.edge(t, e, n);
        return i === 0 || i === 3 || i === 4 || i === 5 || i === 7;
      }
      edgeId(t, e, n) {
        switch (n) {
          case 0:
            return this.vIdx(t + 1, e) * 2;
          case 1:
            return this.hIdx(t, e + 1) * 2 + 1;
          case 2:
            return this.vIdx(t, e) * 2;
          default:
            return this.hIdx(t, e) * 2 + 1;
        }
      }
      addPropRect(t, e, n, i) {
        let r = Math.max(0, Math.floor(t / 4)),
          o = Math.min(this.W - 1, Math.floor(n / 4)),
          a = Math.max(0, Math.floor(e / 4)),
          c = Math.min(this.H - 1, Math.floor(i / 4));
        for (let l = a; l <= c; l++)
          for (let h = r; h <= o; h++) {
            let u = l * this.W + h,
              f = this.propRects.get(u);
            (f || ((f = []), this.propRects.set(u, f)), f.push([t, e, n, i]));
          }
      }
    };
  function dh(s, t, e, n, i, r, o, a) {
    let c = r - n,
      l = o - i,
      h = e.roomMin,
      u = c >= h * 2,
      f = l >= h * 2,
      d = c * l;
    if (
      (!u && !f) ||
      d <= 2 ||
      (d <= e.maxArea && t.chance(e.stopChance)) ||
      a > 22
    ) {
      yE(s, t, e, n, i, r, o);
      return;
    }
    let p;
    if (
      (f
        ? u
          ? c > l * 1.25
            ? (p = !0)
            : l > c * 1.25
              ? (p = !1)
              : (p = t.chance(0.5))
          : (p = !1)
        : (p = !0),
      p)
    ) {
      let g = t.int(n + h, r - h);
      for (let m = i; m < o; m++) s.vw[s.vIdx(g, m)] = 1;
      (D2(s, t, e, !0, g, i, o),
        dh(s, t, e, n, i, g, o, a + 1),
        dh(s, t, e, g, i, r, o, a + 1));
    } else {
      let g = t.int(i + h, o - h);
      for (let m = n; m < r; m++) s.hw[s.hIdx(m, g)] = 1;
      (D2(s, t, e, !1, g, n, r),
        dh(s, t, e, n, i, r, g, a + 1),
        dh(s, t, e, n, g, r, o, a + 1));
    }
  }
  function D2(s, t, e, n, i, r, o) {
    let a = o - r,
      c = Math.max(1, Math.round(a / t.range(3.2, 6.5)));
    for (let l = 0; l < c; l++) {
      let h = t.int(r, o - 1),
        u = t.chance(0.18) ? t.int(2, 3) : 1;
      for (let f = 0; f < u && h + f < o; f++) {
        let d = u === 1 && t.chance(e.doorChance) ? 3 : 0;
        n ? (s.vw[s.vIdx(i, h + f)] = d) : (s.hw[s.hIdx(h + f, i)] = d);
      }
    }
  }
  function yE(s, t, e, n, i, r, o) {
    let a = r - n,
      c = o - i;
    if (a * c >= 12 && t.chance(e.pillarChance)) {
      let l = a * c > 40 && t.chance(0.5) ? 1 : 2,
        h = t.int(0, 1),
        u = t.int(0, 1);
      for (let f = i + 1; f < o; f++)
        if (!((f - i + u) % l))
          for (let d = n + 1; d < r; d++)
            (d - n + h) % l || (s.pillar[f * (s.W + 1) + d] = 1);
    }
  }
  function _E(s, t, e, n, i, r, o) {
    let a = [];
    for (let c = Math.max(2, n - i - 3); c <= Math.min(s.H - 3, n + i + 3); c++)
      for (
        let l = Math.max(2, e - i - 3);
        l <= Math.min(s.W - 3, e + i + 3);
        l++
      ) {
        let h = s.ci(l, c);
        if (s.zone[h] !== 0) continue;
        let u = Math.hypot(l - e, c - n) / i,
          f = mc(l * 0.16, c * 0.16, o, 3);
        u + (f - 0.5) * 0.8 < 1 && ((s.zone[h] = r), a.push(h));
      }
    return a;
  }
  function bE(s, t, e) {
    let n = new Uint8Array(s.N);
    for (let y of e) n[y] = 1;
    for (let y of e) {
      let _ = y % s.W,
        M = (y / s.W) | 0;
      for (let b = 0; b < 4; b++) {
        let w = _ + ge[b],
          S = M + xe[b];
        s.inb(w, S) &&
          (n[s.ci(w, S)] ? s.setEdge(_, M, b, 1) : s.setEdge(_, M, b, 1));
      }
      ((s.pillar[M * (s.W + 1) + _] = 0),
        (s.pillar[M * (s.W + 1) + _ + 1] = 0),
        (s.pillar[(M + 1) * (s.W + 1) + _] = 0),
        (s.pillar[(M + 1) * (s.W + 1) + _ + 1] = 0));
    }
    let i = new Uint8Array(s.N),
      r = e[Math.floor(t.next() * e.length)],
      o = [r];
    i[r] = 1;
    let a = [];
    for (; o.length; ) {
      let y = o[o.length - 1],
        _ = y % s.W,
        M = (y / s.W) | 0;
      a.length = 0;
      for (let S = 0; S < 4; S++) {
        let T = _ + ge[S],
          E = M + xe[S];
        if (!s.inb(T, E)) continue;
        let C = s.ci(T, E);
        n[C] && !i[C] && a.push(S);
      }
      if (!a.length) {
        o.pop();
        continue;
      }
      let b = a[Math.floor(t.next() * a.length)];
      s.setEdge(_, M, b, t.chance(0.12) ? 3 : 0);
      let w = s.ci(_ + ge[b], M + xe[b]);
      ((i[w] = 1), o.push(w));
    }
    for (let y of e) {
      let _ = y % s.W,
        M = (y / s.W) | 0;
      for (let b = 0; b < 2; b++) {
        let w = _ + ge[b],
          S = M + xe[b];
        !s.inb(w, S) ||
          !n[s.ci(w, S)] ||
          (s.edge(_, M, b) === 1 && t.chance(0.06) && s.setEdge(_, M, b, 0));
      }
    }
    let c = [],
      l = 0,
      h = 0;
    for (let y of e) ((l += y % s.W), (h += (y / s.W) | 0));
    ((l /= e.length), (h /= e.length));
    for (let y of e) {
      let _ = y % s.W,
        M = (y / s.W) | 0;
      for (let b = 0; b < 4; b++) {
        let w = _ + ge[b],
          S = M + xe[b];
        if (!s.inb(w, S) || w < 1 || S < 1 || w > s.W - 2 || S > s.H - 2)
          continue;
        let T = s.ci(w, S);
        !n[T] &&
          s.floor[T] !== 1 &&
          c.push([_, M, b, Math.atan2(M - h, _ - l)]);
      }
    }
    let u = t.range(-Math.PI, Math.PI),
      f = (y) => {
        let _ = null,
          M = 1e9;
        for (let b of c) {
          let w = Math.abs(b[3] - y);
          (w > Math.PI && (w = Math.PI * 2 - w), w < M && ((M = w), (_ = b)));
        }
        return _;
      },
      d = [f(u), f(u + Math.PI)].filter(Boolean);
    for (let y of d) s.setEdge(y[0], y[1], y[2], 3);
    for (let y of e) {
      let _ = y % s.W,
        M = (y / s.W) | 0;
      for (let b = 0; b < 4; b++)
        s.edge(_, M, b) === 1 && s.reinforced.add(s.edgeKey(_, M, b));
    }
    let p = new Int32Array(s.N).fill(-1),
      g = [];
    for (let y of d) {
      let _ = s.ci(y[0], y[1]);
      ((p[_] = 0), g.push(_));
    }
    for (let y = 0; y < g.length; y++) {
      let _ = g[y],
        M = _ % s.W,
        b = (_ / s.W) | 0;
      for (let w = 0; w < 4; w++) {
        let S = s.edge(M, b, w);
        if (S !== 0 && S !== 3) continue;
        let T = M + ge[w],
          E = b + xe[w];
        if (!s.inb(T, E)) continue;
        let C = s.ci(T, E);
        !n[C] || p[C] >= 0 || ((p[C] = p[_] + 1), g.push(C));
      }
    }
    let m = -1,
      x = -1;
    for (let y of e) p[y] > x && ((x = p[y]), (m = y));
    let v = [];
    if (m >= 0) {
      let y = m % s.W,
        _ = (m / s.W) | 0;
      for (let M = _ - 1; M <= _; M++)
        for (let b = y - 1; b <= y; b++)
          !s.inb(b, M) ||
            !n[s.ci(b, M)] ||
            (v.push(s.ci(b, M)),
            b < y &&
              n[s.ci(b + 1, M)] &&
              (s.setEdge(b, M, 0, 0), s.reinforced.delete(s.edgeKey(b, M, 0))),
            M < _ &&
              n[s.ci(b, M + 1)] &&
              (s.setEdge(b, M, 1, 0), s.reinforced.delete(s.edgeKey(b, M, 1))));
    }
    return { openings: d, vault: m, vaultCells: v, mazeDepth: x };
  }
  function uh(s, t) {
    let e = new Int32Array(s.N).fill(-1),
      n = new Int32Array(s.N),
      i = 0,
      r = 0;
    for (let o of t) e[o] < 0 && ((e[o] = 0), (n[r++] = o));
    for (; i < r; ) {
      let o = n[i++],
        a = o % s.W,
        c = (o / s.W) | 0;
      for (let l = 0; l < 4; l++) {
        if (!s.passable(a, c, l)) continue;
        let h = o + ge[l] + xe[l] * s.W;
        e[h] >= 0 || ((e[h] = e[o] + 1), (n[r++] = h));
      }
    }
    return e;
  }
  function N2(s, t, e) {
    let n = new Uint8Array(s.N),
      i = [];
    for (let o of e) ((n[o] = 1), i.push(o));
    let r = 0;
    for (;;) {
      for (; i.length; ) {
        let c = i.pop(),
          l = c % s.W,
          h = (c / s.W) | 0;
        for (let u = 0; u < 4; u++) {
          if (!s.passable(l, h, u)) continue;
          let f = c + ge[u] + xe[u] * s.W;
          n[f] || ((n[f] = 1), i.push(f));
        }
      }
      if (++r > 4e3) break;
      let o = [];
      for (let c = 0; c < s.N; c++) {
        if (!n[c] || s.feat[c] === 1 || s.feat[c] === 2 || s.feat[c] === 3)
          continue;
        let l = c % s.W,
          h = (c / s.W) | 0;
        for (let u = 0; u < 4; u++) {
          let f = l + ge[u],
            d = h + xe[u];
          if (!s.inb(f, d)) continue;
          let p = s.ci(f, d);
          if (n[p] || s.floor[p] === 1 || s.floor[p] === 6) continue;
          let g = s.edge(l, h, u);
          (g === 1 || g === 4 || g === 5) && o.push(l, h, u);
        }
      }
      if (!o.length) break;
      let a = Math.max(1, Math.min(8, Math.floor(o.length / 30)));
      for (let c = 0; c < a; c++) {
        let l = Math.floor(t.next() * (o.length / 3)) * 3,
          h = o[l],
          u = o[l + 1],
          f = o[l + 2],
          d = s.ci(h + ge[f], u + xe[f]);
        n[d] ||
          (s.setEdge(h, u, f, t.chance(0.5) ? 3 : 0), (n[d] = 1), i.push(d));
      }
    }
    return ((s.reach = n), n);
  }
  function ME(s, t) {
    let e = new Int32Array(s.N).fill(-2),
      n = [t];
    e[t] = -1;
    let i = -1;
    for (let o = 0; o < n.length && i < 0; o++) {
      let a = n[o],
        c = a % s.W,
        l = (a / s.W) | 0;
      for (let h = 0; h < 4; h++) {
        let u = c + ge[h],
          f = l + xe[h];
        if (!s.inb(u, f) || s.edge(c, l, h) === 2) continue;
        let d = s.ci(u, f);
        if (
          e[d] === -2 &&
          !(
            s.feat[d] === 1 ||
            s.feat[d] === 2 ||
            s.feat[d] === 3 ||
            s.floor[d] === 6
          )
        ) {
          if (((e[d] = a), s.reach[d] && s.floor[d] !== 1)) {
            i = d;
            break;
          }
          n.push(d);
        }
      }
    }
    if (i < 0) return !1;
    let r = i;
    for (; e[r] >= 0; ) {
      let o = e[r],
        a = o % s.W,
        c = (o / s.W) | 0,
        l = r % s.W,
        h = (r / s.W) | 0;
      for (let u = 0; u < 4; u++)
        if (a + ge[u] === l && c + xe[u] === h) {
          let f = s.edge(a, c, u);
          f !== 0 && f !== 3 && s.setEdge(a, c, u, 0);
        }
      ((s.floor[o] === 1 || s.floor[o] === 2) && (s.floor[o] = 0), (r = o));
    }
    return !0;
  }
  function fh(s, t, e, n, i) {
    let r = s.ci(e, n),
      o = -1,
      a = -1;
    for (let d = 0; d < 4; d++) {
      let p = e + ge[d],
        g = n + xe[d];
      if (!s.inb(p, g) || p < 1 || g < 1 || p > s.W - 2 || g > s.H - 2)
        continue;
      let m = s.ci(p, g);
      if (s.floor[m] === 1 || s.feat[m] !== 0) continue;
      let x = t.next() * 0.5;
      for (let v = 0; v < 4; v++) s.passable(p, g, v) && (x += 1);
      ((s.edge(e, n, d) === 0 || s.edge(e, n, d) === 3) && (x += 1.5),
        x > a && ((a = x), (o = d)));
    }
    o < 0 && (o = 0);
    for (let d = 0; d < 4; d++) s.setEdge(e, n, d, d === o ? 0 : 2);
    ((s.floor[r] = 0), (s.feat[r] = i === "down" ? 1 : i === "up" ? 2 : 3));
    let c = s.W + 1;
    ((s.pillar[n * c + e] = 0),
      (s.pillar[n * c + e + 1] = 0),
      (s.pillar[(n + 1) * c + e] = 0),
      (s.pillar[(n + 1) * c + e + 1] = 0));
    let l = e + ge[o],
      h = n + xe[o],
      u = s.ci(l, h);
    s.floor[u] !== 0 && s.floor[u] !== 3 && (s.floor[u] = 0);
    let f = { kind: i, cx: e, cy: n, dir: o, idx: s.stairs.length };
    return (s.stairs.push(f), SE(s, f), f);
  }
  function SE(s, t) {
    let e = (n, i, r, o) => {
      let a = w2(t.cx, t.cy, t.dir, n, i, r, o);
      s.addPropRect(a[0], a[1], a[2], a[3]);
    };
    t.kind === "down" || t.kind === "up"
      ? e(0.86, 1, 3.14, 4)
      : (e(0.45, 1.25, 0.6, 3.8),
        e(3.4, 1.25, 3.55, 3.8),
        e(0.45, 3.72, 3.55, 3.8),
        e(0, 1, 0.6, 1.2),
        e(3.4, 1, 4, 1.2));
  }
  function md(s, t, e) {
    for (let n of t) if (Math.hypot(s[0] - n[0], s[1] - n[1]) < e) return !1;
    return !0;
  }
  function F2(s) {
    let { seed: t, depth: e, themeId: n } = s,
      i = ah[n],
      r = new Ci(t),
      o = new F1(108, 108);
    ((o.seed = t), (o.depth = e), (o.theme = n));
    let a = o.W,
      c = o.H;
    (i.layout || dh)(o, r, i, 0, 0, a, c, 0);
    for (let b = 0; b < o.vw.length; b++)
      o.vw[b] === 1 && r.chance(i.wallRemove) && (o.vw[b] = 0);
    for (let b = 0; b < o.hw.length; b++)
      o.hw[b] === 1 && r.chance(i.wallRemove) && (o.hw[b] = 0);
    for (let b = 0; b < o.N; b++) {
      if (!r.chance(i.stubs)) continue;
      let w = b % a,
        S = (b / a) | 0,
        T = r.int(0, 3),
        E = r.int(1, 3),
        C = w,
        R = S;
      for (let I = 0; I < E && o.inb(C, R); I++)
        (o.setEdge(C, R, T, 1), T === 0 || T === 2 ? (R += 1) : (C += 1));
    }
    for (let b = 0; b < c; b++)
      ((o.vw[o.vIdx(0, b)] = 2), (o.vw[o.vIdx(a, b)] = 2));
    for (let b = 0; b < a; b++)
      ((o.hw[o.hIdx(b, 0)] = 2), (o.hw[o.hIdx(b, c)] = 2));
    for (let b = 0; b <= a; b++)
      ((o.pillar[b] = 0), (o.pillar[c * (a + 1) + b] = 0));
    for (let b = 0; b <= c; b++)
      ((o.pillar[b * (a + 1)] = 0), (o.pillar[b * (a + 1) + a] = 0));
    let l = [];
    if (e === 1) l.push([r.int(34, a - 35), r.int(34, c - 35)]);
    else {
      let b = s.nUp || 3,
        w = 0;
      for (; l.length < b && w++ < 4e3; ) {
        let S = [r.int(6, a - 7), r.int(6, c - 7)];
        md(S, l, w < 2e3 ? 34 : 18) && l.push(S);
      }
    }
    let h = [0, 3, 3, 4, 4][e - 1],
      u = [0, 2, 2, 3, 3][e - 1],
      f = [],
      d = (b, w, S, T, E) => {
        for (let C = 0; C < 600; C++) {
          let R = r.int(w, S),
            I = r.int(R + 4, a - R - 5),
            k = r.int(R + 4, c - R - 5),
            N = 1e9;
          for (let H of l) N = Math.min(N, Math.hypot(I - H[0], k - H[1]));
          if (N < T + R * 0.5 || N > E + R) continue;
          let z = !0;
          for (let H of f)
            if (Math.hypot(I - H.cx, k - H.cy) < R + H.r + 4) {
              z = !1;
              break;
            }
          if (!z) continue;
          let U = _E(o, r, I, k, R, b, t + f.length * 31),
            X = { id: b, cx: I, cy: k, r: R, cells: U };
          return (f.push(X), o.zones.push(X), X);
        }
        return null;
      };
    for (let b = 0; b < h; b++) d(1, 7, 10, 14, 46);
    for (let b = 0; b < u; b++) d(2, 10, 13, 16, 200);
    for (let b of l)
      for (let w = b[1] - 2; w <= b[1] + 2; w++)
        for (let S = b[0] - 2; S <= b[0] + 2; S++)
          o.inb(S, w) && (o.zone[o.ci(S, w)] = 0);
    for (let b of o.zones) {
      let w = b.cells.filter((S) => o.zone[S] === b.id);
      if (
        ((b.cells = w),
        b.id === 2 && w.length > 8 && Object.assign(b, bE(o, r, w)),
        b.id === 1)
      )
        for (let S of w) {
          let T = S % a,
            E = (S / a) | 0;
          for (let C = 0; C < 2; C++)
            o.edge(T, E, C) === 1 && r.chance(0.22) && o.setEdge(T, E, C, 0);
        }
    }
    if ((wE(o, r, i, l), i.features && i.features(o, r, i, l), TE(o, e, l), e === 1))
      fh(o, r, l[0][0], l[0][1], "elev");
    else for (let b of l) fh(o, r, b[0], b[1], "up");
    let p = [];
    if (e < 5) {
      for (let b of o.zones) {
        if (b.id !== 1 || !b.cells.length) continue;
        let w = -1,
          S = 1e9;
        for (let T of b.cells) {
          let E = T % a,
            C = (T / a) | 0;
          if (E < 2 || C < 2 || E > a - 3 || C > c - 3 || o.floor[T] !== 0)
            continue;
          let R = Math.hypot(E - b.cx, C - b.cy) + r.next() * 2.5;
          R < S && ((S = R), (w = T));
        }
        w >= 0 && p.push(fh(o, r, w % a, (w / a) | 0, "down"));
      }
      for (let b of o.zones) {
        if (b.id !== 2 || !b.vaultCells || !b.vaultCells.length) continue;
        let w = b.vaultCells[b.vaultCells.length - 1],
          S = w % a,
          T = (w / a) | 0;
        if (S < 2 || T < 2 || S > a - 3 || T > c - 3) continue;
        let E = fh(o, r, S, T, "down");
        ((E.vault = !0),
          p.push(E),
          (b.vaultCells = b.vaultCells.filter((C) => C !== w)));
      }
    }
    let g = l.map((b) => o.ci(b[0], b[1])),
      m = () => {
        N2(o, r, [g[0]]);
        for (let b = 0; b < 3; b++) {
          let w = !1;
          for (let S of o.stairs) {
            let T = o.ci(S.cx, S.cy);
            if (o.reach[T]) continue;
            let E = S.cx + ge[S.dir],
              C = S.cy + xe[S.dir],
              R = o.ci(E, C);
            (o.floor[R] === 1 && (o.floor[R] = 0), ME(o, R) && (w = !0));
          }
          if (!w) break;
          N2(o, r, [g[0]]);
        }
      };
    (m(), (o.ducts = []), AE(o, r, i, e, g, l));
    let x = uh(o, g),
      v = 0;
    for (let b = 0; b < o.N; b++) x[b] > v && (v = x[b]);
    let y = [];
    for (let b = 0; b < o.N; b++) {
      let w = b % a,
        S = (b / a) | 0;
      w < 2 ||
        S < 2 ||
        w > a - 3 ||
        S > c - 3 ||
        o.zone[b] !== 0 ||
        o.floor[b] !== 0 ||
        o.feat[b] !== 0 ||
        (x[b] >= v * 0.55 && y.push(b));
    }
    r.shuffle(y);
    let _ = e < 5 ? (e === 1 ? 3 : r.int(3, 4)) : 0,
      M = [];
    for (let b of y) {
      if (M.length >= _) break;
      let w = [b % a, (b / a) | 0];
      md(w, M, 22) &&
        md(
          w,
          p.map((S) => [S.cx, S.cy]),
          16,
        ) &&
        M.push(w);
    }
    for (let b of M) p.push(fh(o, r, b[0], b[1], "down"));
    if (
      (M.length && m(),
      (o.downs = p),
      (o.ups = o.stairs.filter((b) => b.kind === "up" || b.kind === "elev")),
      (o.arrivals = l),
      e === 5)
    ) {
      let b = [];
      for (let w of o.zones)
        w.id === 1 &&
          w.cells.length &&
          b.push(w.cells[Math.floor(r.next() * w.cells.length)]);
      for (let w of y) {
        if (b.length >= 5) break;
        let S = [w % a, (w / a) | 0];
        md(
          S,
          b.map((T) => [T % a, (T / a) | 0]),
          24,
        ) && b.push(w);
      }
      o.relicSpots = b;
    }
    return (
      CE(o, r, i),
      RE(o, r),
      (o.distFromStart = uh(o, g)),
      L2(o, r, i),
      i.props && i.props(o, r, i),
      o
    );
  }
  function wE(s, t, e, n) {
    let i = s.W,
      r = s.H,
      o = (a, c, l) =>
        n.some((h) => Math.abs(h[0] - a) <= l && Math.abs(h[1] - c) <= l);
    if (e.water) {
      for (let c = 0; c < s.N; c++) {
        let l = c % i,
          h = (c / i) | 0;
        mc(l * 0.07, h * 0.07, s.seed + 3, 3) > 0.47 && (s.floor[c] = 3);
      }
      let a = 0;
      for (let c = 0; c < 500 && a < 30; c++) {
        let l = t.int(2, 4),
          h = t.int(2, 5),
          u = t.int(2, i - l - 3),
          f = t.int(2, r - h - 3);
        if (o(u + l / 2, f + h / 2, 5)) continue;
        let d = !0;
        for (let p = f; p < f + h && d; p++)
          for (let g = u; g < u + l && d; g++) {
            let m = s.ci(g, p);
            (s.zone[m] === 2 && (d = !1),
              g < u + l - 1 && s.edge(g, p, 0) !== 0 && (d = !1),
              p < f + h - 1 && s.edge(g, p, 1) !== 0 && (d = !1));
          }
        if (d) {
          for (let p = f; p < f + h; p++)
            for (let g = u; g < u + l; g++) {
              s.floor[s.ci(g, p)] = 2;
              let m = i + 1;
              (g > u && (s.pillar[p * m + g] = 0),
                p > f && g > u && (s.pillar[p * m + g] = 0));
            }
          for (let p = f + 1; p < f + h; p++)
            for (let g = u + 1; g < u + l; g++) s.pillar[p * (i + 1) + g] = 0;
          a++;
        }
      }
    }
    if (e.heights) {
      for (let a = 0; a < s.N; a++) {
        let c = a % i,
          l = (a / i) | 0;
        if (s.zone[a] === 2 || s.zone[a] === 1 || o(c, l, 2)) continue;
        let h = mc(c * 0.11, l * 0.11, s.seed + 9, 3),
          u = c % 4 === 0 || l % 5 === 0;
        h > 0.44 && !u
          ? (s.floor[a] = 1)
          : h > 0.6 && u && t.chance(0.25)
            ? (s.floor[a] = 1)
            : h > 0.56 &&
              u &&
              t.chance(0.08) &&
              (s.floor[a] = c % 4 === 0 ? 5 : 4);
      }
      for (let a = 0; a < r; a++)
        for (let c = 0; c < i; c++) {
          let l = s.ci(c, a);
          for (let h = 0; h < 2; h++) {
            let u = c + ge[h],
              f = a + xe[h];
            if (!s.inb(u, f)) continue;
            let d = s.ci(u, f),
              p = s.floor[l] === 1,
              g = s.floor[d] === 1;
            if (p && g) s.setEdge(c, a, h, 0);
            else if (p || g) {
              let m = s.edge(c, a, h);
              m === 1 || m === 3
                ? s.setEdge(c, a, h, t.chance(0.7) ? 5 : 0)
                : m === 0 && t.chance(0.55) && s.setEdge(c, a, h, 5);
            }
          }
        }
      for (let a = 1; a < r; a++)
        for (let c = 1; c < i; c++) {
          let l = s.floor[s.ci(c - 1, a - 1)],
            h = s.floor[s.ci(c, a - 1)],
            u = s.floor[s.ci(c - 1, a)],
            f = s.floor[s.ci(c, a)];
          (l === 1 || h === 1 || u === 1 || f === 1) &&
            (s.pillar[a * (i + 1) + c] = 0);
        }
    }
    if (e.cubicles) {
      for (let a = 0; a < s.vw.length; a++)
        s.vw[a] === 1 && t.chance(0.35) && (s.vw[a] = 4);
      for (let a = 0; a < s.hw.length; a++)
        s.hw[a] === 1 && t.chance(0.35) && (s.hw[a] = 4);
    }
  }
  function TE(s, t, e) {
    let n = s.W;
    for (let i = 0; i < s.N; i++) {
      let r = i % n,
        o = (i / n) | 0,
        a = mc(r * 0.05, o * 0.05, s.seed + 404, 3),
        c = Math.min(1, Math.max(0, (a - 0.3) / 0.4));
      ((c = c * c * (3 - 2 * c)),
        (c = c * 0.92 + [0, 0.05, 0.1, 0.14, 0.18][t - 1]),
        s.zone[i] === 1
          ? (c += 0.3)
          : s.zone[i] === 2 && (c = c * 0.55 + 0.08));
      for (let l of e) {
        let h = Math.hypot(l[0] - r, l[1] - o);
        h < 7 && (c *= 0.45 + (h / 7) * 0.55);
      }
      s.decay[i] = Math.min(1, Math.max(0, c));
    }
  }
  function EE(s, t, e, n) {
    let i = new Map([[t, 0]]),
      r = [t];
    for (let o = 0; o < n && r.length; o++) {
      let a = [];
      for (let c of r) {
        let l = c % s.W,
          h = (c / s.W) | 0;
        for (let u = 0; u < 4; u++) {
          if (!s.passable(l, h, u)) continue;
          let f = c + ge[u] + xe[u] * s.W;
          if (!i.has(f)) {
            if (f === e) return !0;
            (i.set(f, o + 1), a.push(f));
          }
        }
      }
      r = a;
    }
    return !1;
  }
  function AE(s, t, e, n, i, r) {
    let o = s.W,
      a = 4,
      c = (e.pipes ? 7 : 4) + Math.floor(n / 2),
      l = (h) => {
        if (
          s.floor[h] !== 0 ||
          s.feat[h] !== 0 ||
          !s.reach[h] ||
          s.zone[h] === 2
        )
          return !1;
        let u = h % o,
          f = (h / o) | 0;
        if (u < 3 || f < 3 || u > o - 4 || f > s.H - 4) return !1;
        for (let d of r)
          if (Math.abs(d[0] - u) <= 3 && Math.abs(d[1] - f) <= 3) return !1;
        for (let d = 0; d < 4; d++) {
          let p = s.feat[s.ci(u + ge[d], f + xe[d])];
          if (p === 1 || p === 2 || p === 3) return !1;
        }
        return !0;
      };
    for (let h = 0; h < 700 && s.ducts.length < c; h++) {
      let u = t.int(2, 5),
        f = t.int(0, 3),
        d = u >= 3 && t.chance(0.45) ? t.int(1, u - 2) : -1,
        p = d >= 0 ? (f + (t.chance(0.5) ? 1 : 3)) % 4 : f,
        g = t.int(3, o - 4),
        m = t.int(3, s.H - 4),
        x = f,
        v = [],
        y = [],
        _ = !0;
      for (let tt = 0; tt < u; tt++) {
        if (!s.inb(g, m)) {
          _ = !1;
          break;
        }
        let wt = s.ci(g, m);
        if (!l(wt) || v.includes(wt)) {
          _ = !1;
          break;
        }
        (v.push(wt),
          tt === d && (x = p),
          y.push(x),
          (g += ge[x]),
          (m += xe[x]));
      }
      if (!_) continue;
      let M = v[0],
        b = v[v.length - 1],
        w = (M % o) - ge[f],
        S = ((M / o) | 0) - xe[f],
        T = g,
        E = m;
      if (!s.inb(w, S) || !s.inb(T, E)) continue;
      let C = s.ci(w, S),
        R = s.ci(T, E),
        I = (tt) =>
          s.reach[tt] &&
          (s.floor[tt] === 0 || s.floor[tt] === 3) &&
          s.feat[tt] === 0 &&
          !v.includes(tt);
      if (!I(C) || !I(R) || EE(s, C, R, u + 5)) continue;
      let k = [],
        N = (tt, wt, dt, Et) => {
          (k.push([tt, wt, dt, s.edge(tt, wt, dt)]), s.setEdge(tt, wt, dt, Et));
        },
        z = new Set(v),
        U = [];
      for (let tt = 0; tt < v.length; tt++) {
        let wt = v[tt],
          dt = wt % o,
          Et = (wt / o) | 0,
          K = 0;
        for (let it = 0; it < 4; it++) {
          let mt = dt + ge[it],
            st = Et + xe[it],
            Z = s.ci(mt, st),
            j = s.edge(dt, Et, it);
          (tt > 0 && Z === v[tt - 1]) || (tt < v.length - 1 && Z === v[tt + 1])
            ? (N(dt, Et, it, 0), (K |= 1 << it))
            : (tt === 0 && Z === C) || (tt === v.length - 1 && Z === R)
              ? (N(dt, Et, it, 6), (K |= 1 << it))
              : j !== 2 && !z.has(Z) && N(dt, Et, it, 1);
        }
        (U.push(K), (s.floor[wt] = 6));
      }
      let X = uh(s, [i[0]]),
        H = !1;
      for (let tt = 0; tt < s.N; tt++)
        if (s.reach[tt] && X[tt] < 0 && !z.has(tt) && s.floor[tt] !== 6) {
          H = !0;
          break;
        }
      if (H) {
        for (let tt = k.length - 1; tt >= 0; tt--) {
          let [wt, dt, Et, K] = k[tt];
          s.setEdge(wt, dt, Et, K);
        }
        for (let tt of v) s.floor[tt] = 0;
        continue;
      }
      let O = o + 1,
        V = a / 2 - 0.55,
        at = a / 2 + 0.55;
      (v.forEach((tt, wt) => {
        let dt = tt % o,
          Et = (tt / o) | 0,
          K = dt * a,
          it = Et * a,
          mt = U[wt];
        ((s.duct[tt] = mt),
          (s.reach[tt] = 1),
          (s.zone[tt] = 0),
          (s.pillar[Et * O + dt] = 0),
          (s.pillar[Et * O + dt + 1] = 0),
          (s.pillar[(Et + 1) * O + dt] = 0),
          (s.pillar[(Et + 1) * O + dt + 1] = 0));
        let st = [
          [0, 0, V, V],
          [at, 0, a, V],
          [0, at, V, a],
          [at, at, a, a],
        ];
        (mt & 1 || st.push([at, V, a, at]),
          mt & 4 || st.push([0, V, V, at]),
          mt & 2 || st.push([V, at, at, a]),
          mt & 8 || st.push([V, 0, at, V]));
        for (let Z of st) {
          s.addPropRect(K + Z[0], it + Z[1], K + Z[2], it + Z[3]);
          let j = s.propRects.get(tt);
          j[j.length - 1].push(1);
        }
      }),
        s.ducts.push({ path: v, ends: [C, R] }));
    }
  }
  function CE(s, t, e) {
    let n = s.W,
      i = new Float32Array(s.N);
    for (let a = 0; a < s.N; a++)
      i[a] = mc((a % n) * 0.085, ((a / n) | 0) * 0.085, s.seed + 77, 3);
    let o = Float32Array.from(i).sort()[Math.floor(e.darkPatch * (s.N - 1))];
    for (let a = 0; a < s.N; a++) {
      let c = s.feat[a];
      if (s.floor[a] === 6) {
        ((s.light[a] = 0), (s.lightI[a] = 0));
        continue;
      }
      if (s.floor[a] === 1 && s.theme !== "abyss") {
        s.light[a] = 0;
        continue;
      }
      if (c === 1 || c === 2 || c === 3) {
        ((s.light[a] = 1), (s.lightI[a] = c === 3 ? 1.8 : 1.15));
        continue;
      }
      let l = t.next(),
        h = e.lightOn,
        u = e.lightFlick,
        f = s.zone[a],
        d = s.decay[a];
      ((h += (0.45 - d) * 0.35),
        (u += (d - 0.5) * 0.16),
        d < 0.25 && (u *= 0.15),
        f === 1 && ((u += 0.2), (h -= 0.1)),
        f === 2 && ((h -= 0.12), (u += 0.04)));
      let p;
      (i[a] < o ? (p = l < 0.1 ? 2 : 3) : (p = l < h ? 1 : l < h + u ? 2 : 3),
        s.theme === "abyss" && s.floor[a] === 1 && (p = t.chance(0.08) ? 1 : 0),
        (s.light[a] = p),
        (s.lightI[a] = (0.85 + t.next() * 0.3) * (1.12 - d * 0.25)));
    }
  }
  function RE(s, t) {
    let e = s.W;
    for (let n of s.zones)
      if (n.id === 1)
        for (let i of n.cells) {
          if (s.feat[i] !== 0 || s.floor[i] !== 0) continue;
          let r = i % e,
            o = (i / e) | 0,
            a = !1;
          for (let h = 0; h < 4; h++) {
            let u = r + ge[h],
              f = o + xe[h];
            if (s.inb(u, f)) {
              let d = s.feat[s.ci(u, f)];
              (d === 1 || d === 2 || d === 3) && (a = !0);
            }
          }
          if (a || !t.chance(0.14)) continue;
          let c = 0;
          for (let h = 0; h < 4; h++) s.passable(r, o, h) && c++;
          let l = t.weighted([
            [4, 0.45],
            [5, 0.3],
            [6, 0.25],
          ]);
          (l === 6 && c < 3 && (l = 4),
            (s.feat[i] = l),
            s.traps.push({ type: l, cx: r, cy: o, state: 0, t: 0 }));
        }
  }
  function Ds(s, t) {
    switch (s) {
      case 0:
        return 1;
      case 3:
        return Math.abs(t - 4 * 0.5) < 1.2 * 0.5 ? 1 : 0;
      case 4:
        return 0.7;
      case 5:
        return 0.92;
      case 7:
        return t > 0.8 && t < 4 - 0.8 ? 0.88 : 0;
      case 6:
        return Math.abs(t - 4 * 0.5) < 1 * 0.5 ? 0.06 : 0;
      default:
        return 0;
    }
  }
  function PE(s, t, e, n, i) {
    let r = 4,
      o = s.W + 1,
      a = s.W,
      c = Math.floor(t / r),
      l = Math.floor(e / r),
      h = Math.floor(n / r),
      u = Math.floor(i / r);
    if (c === h && l === u) return 1;
    let f = n - t,
      d = i - e,
      p = f > 0 ? 1 : -1,
      g = d > 0 ? 1 : -1,
      m = f !== 0 ? ((p > 0 ? (c + 1) * r : c * r) - t) / f : 1e9,
      x = d !== 0 ? ((g > 0 ? (l + 1) * r : l * r) - e) / d : 1e9,
      v = f !== 0 ? r / Math.abs(f) : 1e9,
      y = d !== 0 ? r / Math.abs(d) : 1e9,
      _ = 1;
    for (let M = 0; M < 12; M++) {
      if (m < x) {
        let b = p > 0 ? c + 1 : c;
        if (l < 0 || l >= s.H || b < 0 || b > a) return 0;
        let w = e + d * m;
        ((_ *= Ds(s.vw[l * o + b], w - l * r)), (c += p), (m += v));
      } else {
        let b = g > 0 ? l + 1 : l;
        if (c < 0 || c >= a || b < 0 || b > s.H) return 0;
        let w = t + f * x;
        ((_ *= Ds(s.hw[b * a + c], w - c * r)), (l += g), (x += y));
      }
      if (_ <= 0.001) return 0;
      if (c === h && l === u) break;
    }
    return _;
  }
  function kE(s, t, e, n) {
    n.length = 0;
    let i = 4,
      r = 0.2 * 0.5,
      o = s.W + 1;
    for (let c = e - 1; c <= e + 1; c++)
      if (!(c < 0 || c >= s.H))
        for (let l = t - 1; l <= t + 2; l++) {
          if (l < 0 || l > s.W) continue;
          let h = s.vw[c * o + l];
          if (h === 0 || h === 5) continue;
          let u = l * i;
          if (h === 3)
            (n.push(u - r, c * i - r, u + r, c * i + i * 0.5 - 1.2 * 0.5),
              n.push(u - r, c * i + i * 0.5 + 1.2 * 0.5, u + r, c * i + i + r));
          else if (h === 7) {
            let f = s.breachStub.get((c * o + l) * 2) || [0.8, 0.8];
            (n.push(u - r, c * i - r, u + r, c * i + f[0]),
              n.push(u - r, c * i + i - f[1], u + r, c * i + i + r));
          } else n.push(u - r, c * i - r, u + r, c * i + i + r);
        }
    for (let c = e - 1; c <= e + 2; c++)
      if (!(c < 0 || c > s.H))
        for (let l = t - 1; l <= t + 1; l++) {
          if (l < 0 || l >= s.W) continue;
          let h = s.hw[c * s.W + l];
          if (h === 0 || h === 5) continue;
          let u = c * i;
          if (h === 3)
            (n.push(l * i - r, u - r, l * i + i * 0.5 - 1.2 * 0.5, u + r),
              n.push(l * i + i * 0.5 + 1.2 * 0.5, u - r, l * i + i + r, u + r));
          else if (h === 7) {
            let f = s.breachStub.get((c * s.W + l) * 2 + 1) || [0.8, 0.8];
            (n.push(l * i - r, u - r, l * i + f[0], u + r),
              n.push(l * i + i - f[1], u - r, l * i + i + r, u + r));
          } else n.push(l * i - r, u - r, l * i + i + r, u + r);
        }
    for (let c = e - 1; c <= e + 2; c++)
      if (!(c < 0 || c > s.H))
        for (let l = t - 1; l <= t + 2; l++) {
          if (l < 0 || l > s.W || !s.pillar[c * o + l]) continue;
          let h = 0.28;
          n.push(l * i - h, c * i - h, l * i + h, c * i + h);
        }
    let a = s.propRects.get(e * s.W + t);
    if (a)
      for (let c of a) c.length > 4 && c[4] && n.push(c[0], c[1], c[2], c[3]);
    return n;
  }
  var yd = class {
    constructor(t, e) {
      ((this.m = t),
        (this.theme = e),
        (this.R = 2),
        (this.TW = t.W * 4 * 2),
        (this.TH = t.H * 4 * 2),
        (this.L = new Float32Array(this.TW * this.TH)),
        (this.D = new Float32Array(this.TW * this.TH)),
        (this.data = new Uint8Array(this.TW * this.TH * 4)),
        (this.cellAmb = new Float32Array(t.N)));
    }
    bake(t = 0, e = 0, n = this.m.W - 1, i = this.m.H - 1) {
      let r = this.m,
        o = this.theme,
        a = 4,
        c = this.R,
        l = this.TW,
        h = this.L,
        u = t * a * c,
        f = e * a * c,
        d = (n + 1) * a * c - 1,
        p = (i + 1) * a * c - 1;
      for (let S = f; S <= p; S++) h.fill(0, S * l + u, S * l + d + 1);
      let g = 6.8,
        m = g * g,
        x = Math.ceil(g * c),
        v = Math.min(o.ceilH, 4) - 0.4,
        y = v * v;
      for (let S = Math.max(0, e - 2); S <= Math.min(r.H - 1, i + 2); S++)
        for (let T = Math.max(0, t - 2); T <= Math.min(r.W - 1, n + 2); T++) {
          let E = S * r.W + T,
            C = r.light[E];
          if (C !== 1 && C !== 2) continue;
          let R = o.lightI * r.lightI[E] * (C === 2 ? 0.85 : 1),
            I = (T + 0.5) * a,
            k = (S + 0.5) * a,
            N = Math.floor(I * c),
            z = Math.floor(k * c),
            U = Math.max(u, N - x),
            X = Math.min(d, N + x),
            H = Math.max(f, z - x),
            O = Math.min(p, z + x);
          for (let V = H; V <= O; V++) {
            let at = (V + 0.5) / c,
              tt = at - k;
            for (let wt = U; wt <= X; wt++) {
              let dt = (wt + 0.5) / c,
                Et = dt - I,
                K = Et * Et + tt * tt;
              if (K >= m) continue;
              let it = y / (y + K),
                mt = 1 - K / m,
                st = R * it * it * mt * mt;
              if (st < 0.002) continue;
              let Z = PE(r, I, k, dt, at);
              Z <= 0 || (h[V * l + wt] += st * Z);
            }
          }
        }
      let _ = a * c,
        M = this.cellAmb;
      for (let S = 0; S < r.H; S++)
        for (let T = 0; T < r.W; T++) {
          let E = 0,
            C = T * _,
            R = S * _;
          for (let I = 0; I < _; I += 2)
            for (let k = 0; k < _; k += 2) E += h[(R + I) * l + C + k];
          M[S * r.W + T] = E / ((_ / 2) * (_ / 2));
        }
      let b = Float32Array.from(M),
        w = new Float32Array(r.N);
      for (let S = 0; S < 14; S++) {
        for (let E = 0; E < r.H; E++)
          for (let C = 0; C < r.W; C++) {
            let R = E * r.W + C,
              I = b[R] * 1.5,
              k = 1.5;
            if (C < r.W - 1) {
              let N = Ds(r.vw[E * (r.W + 1) + C + 1], 2);
              N > 0 && ((I += b[R + 1] * N), (k += N));
            }
            if (C > 0) {
              let N = Ds(r.vw[E * (r.W + 1) + C], 2);
              N > 0 && ((I += b[R - 1] * N), (k += N));
            }
            if (E < r.H - 1) {
              let N = Ds(r.hw[(E + 1) * r.W + C], 2);
              N > 0 && ((I += b[R + r.W] * N), (k += N));
            }
            if (E > 0) {
              let N = Ds(r.hw[E * r.W + C], 2);
              N > 0 && ((I += b[R - r.W] * N), (k += N));
            }
            w[R] = I / k;
          }
        let T = b;
        ((b = w), (w = T));
      }
      ((this.amb = b), this.pack(u, f, d, p, t, e, n, i));
    }
    pack(t, e, n, i, r, o, a, c) {
      let l = this.m,
        h = 4,
        u = this.R,
        f = this.TW,
        d = h * u,
        p = this.L,
        g = this.D,
        m = this.data,
        x = this.amb,
        v = [],
        y = 0.6;
      for (let _ = o; _ <= c; _++)
        for (let M = r; M <= a; M++) {
          let b = _ * l.W + M;
          kE(l, M, _, v);
          let w = l.W + 1,
            S = M < l.W - 1 ? Ds(l.vw[_ * w + M + 1], 2) : 0,
            T = M > 0 ? Ds(l.vw[_ * w + M], 2) : 0,
            E = _ < l.H - 1 ? Ds(l.hw[(_ + 1) * l.W + M], 2) : 0,
            C = _ > 0 ? Ds(l.hw[_ * l.W + M], 2) : 0,
            R = x[b],
            I = S > 0 ? x[b + 1] : R,
            k = T > 0 ? x[b - 1] : R,
            N = E > 0 ? x[b + l.W] : R,
            z = C > 0 ? x[b - l.W] : R;
          for (let U = 0; U < d; U++) {
            let X = _ * d + U,
              H = (X + 0.5) / u,
              O = (U + 0.5) / d - 0.5;
            for (let V = 0; V < d; V++) {
              let at = M * d + V,
                tt = (at + 0.5) / u,
                wt = (V + 0.5) / d - 0.5,
                dt = wt >= 0 ? R + (I - R) * wt : R + (k - R) * -wt,
                Et = O >= 0 ? R + (N - R) * O : R + (z - R) * -O,
                K = (dt + Et) * 0.5,
                it = X * f + at,
                mt = p[it] + K * y,
                st = 1.2;
              for (let j = 0; j < v.length; j += 4) {
                let vt = tt < v[j] ? v[j] : tt > v[j + 2] ? v[j + 2] : tt,
                  Y = H < v[j + 1] ? v[j + 1] : H > v[j + 3] ? v[j + 3] : H,
                  G = Math.hypot(tt - vt, H - Y);
                G < st && (st = G);
              }
              g[it] = st;
              let Z = it * 4;
              ((m[Z] = Math.min(
                255,
                Math.round(Math.sqrt(Math.min(1, mt / 4)) * 255),
              )),
                (m[Z + 1] = Math.round(Math.min(1, st / 1.2) * 255)),
                (m[Z + 2] = l.floor[b] === 1 ? 255 : 0),
                (m[Z + 3] = 255));
            }
          }
        }
    }
    sample(t, e) {
      let n = this.R,
        i = this.TW,
        r = this.TH,
        o = t * n - 0.5,
        a = e * n - 0.5,
        c = Math.floor(o),
        l = Math.floor(a),
        h = o - c,
        u = a - l;
      (c < 0 && (c = 0),
        l < 0 && (l = 0),
        c > i - 2 && (c = i - 2),
        l > r - 2 && (l = r - 2));
      let f = this.data,
        d = (y) => {
          let _ = f[y * 4] / 255;
          return _ * _ * 4;
        },
        p = l * i + c,
        g = d(p),
        m = d(p + 1),
        x = d(p + i),
        v = d(p + i + 1);
      return (g + (m - g) * h) * (1 - u) + (x + (v - x) * h) * u;
    }
  };
  var LE = {
    yellow: {
      tex: { wall: "paper", floor: "carpet", ceil: "tiles" },
      scale: [0.53, 2, 1.2],
      wallKind: 0,
      ceilKind: 0,
      gloss: 0,
      wet: 1,
      tint: [1, 1, 1],
      tint2: [1, 1, 1],
    },
    pool: {
      tex: { wall: "tile", floor: "tile", ceil: "tile" },
      scale: [1.2, 1.2, 1.2],
      wallKind: 1,
      ceilKind: 1,
      gloss: 0.55,
      wet: 0,
      tint: [0.97, 1, 1],
      tint2: [1, 1, 1],
    },
    abyss: {
      tex: { wall: "concrete", floor: "grating", ceil: "concrete" },
      scale: [3, 2, 3],
      wallKind: 1,
      ceilKind: 1,
      gloss: 0.05,
      wet: 0.3,
      tint: [0.9, 0.86, 0.82],
      tint2: [1, 1, 1],
    },
    parking: {
      tex: { wall: "concrete", floor: "asphalt", ceil: "concrete" },
      scale: [3, 4, 3],
      wallKind: 3,
      ceilKind: 1,
      gloss: 0.08,
      wet: 0.7,
      tint: [1, 1, 0.97],
      tint2: [1, 1, 1],
    },
    pipes: {
      tex: { wall: "brick", floor: "concrete", ceil: "concrete" },
      scale: [2.4, 3, 3],
      wallKind: 1,
      ceilKind: 1,
      gloss: 0.05,
      wet: 0.9,
      tint: [1, 1, 1],
      tint2: [1, 1, 1],
    },
    hospital: {
      tex: { wall: "tile", floor: "lino", ceil: "tiles" },
      scale: [1.2, 2.4, 1.2],
      wallKind: 2,
      ceilKind: 0,
      gloss: 0.3,
      wet: 0.35,
      tint: [0.72, 0.92, 0.84],
      tint2: [0.42, 0.47, 0.43],
    },
    office: {
      tex: { wall: "drywall", floor: "officeCarpet", ceil: "tiles" },
      scale: [2, 2.4, 1.2],
      wallKind: 1,
      ceilKind: 0,
      gloss: 0,
      wet: 0.15,
      tint: [0.78, 0.78, 0.76],
      tint2: [1, 1, 1],
    },
  };
  function U2(s, t, e, n) {
    let i = LE[e.id],
      r = n === "low" ? 512 : 1024,
      o = n === "low" ? 256 : 512,
      a = t.bake(e.paperKind || "paper", n === "low" ? 256 : 512, 3),
      c = t.bake("grime", o, 5),
      l = i.tex.wall === "paper" ? a : t.bake(i.tex.wall, r, 7),
      h = t.bake(i.tex.floor, r, 11),
      u = t.bake(i.tex.ceil, o, 13),
      f = s.uniforms;
    return (
      (f.tPaperA.value = a.albedo),
      (f.tPaperN.value = a.normal),
      (f.tGrime.value = c.albedo),
      (f.tWallA.value = l.albedo),
      (f.tWallN.value = l.normal),
      (f.tFloorA.value = h.albedo),
      (f.tFloorN.value = h.normal),
      (f.tCeilA.value = u.albedo),
      (f.tCeilN.value = u.normal),
      f.uScale.value.set(i.scale[0], i.scale[1], i.scale[2], e.paperScale || 0.53),
      (f.uWallKind.value = i.wallKind),
      (f.uCeilKind.value = i.ceilKind),
      (f.uFloorGloss.value = i.gloss),
      (f.uWet.value = i.wet),
      f.uWallTint.value.fromArray(i.tint),
      f.uWallTint2.value.fromArray(i.tint2),
      f.uBaseCol.value.fromArray(e.baseboard),
      f.uZoneCol.value[0].fromArray(e.paperCol || fd[0]),
      f.uLamp.value.fromArray(e.lamp || [0.6, 0.3]),
      (f.uCeilH.value = e.ceilH),
      f.uLightCol.value.fromArray(e.lightCol),
      f.uAmb.value.fromArray(e.ambient),
      f.uFogCol.value.fromArray(e.fogCol),
      (f.uFogDen.value = e.fogDen),
      new Set([
        e.paperKind || "paper",
        "grime",
        i.tex.wall,
        i.tex.floor,
        i.tex.ceil,
      ])
    );
  }
  var qe = 0.2 / 2,
    vc = [],
    z1 = [0.8, 0.8];
  function IE(s, t, e, n, i = 1, r = !1) {
    n.length = 0;
    let o = 4,
      a = s.W + 1,
      c = Math.floor(t / o),
      l = Math.floor(e / o);
    for (let h = l - i; h <= l + i; h++)
      if (!(h < 0 || h >= s.H))
        for (let u = c - i; u <= c + i + 1; u++) {
          if (u < 0 || u > s.W) continue;
          let f = s.vw[h * a + u];
          if (f === 0) continue;
          let d = u * o;
          if (f === 3 || (f === 6 && r)) {
            let p = f === 3 ? 1.2 : 1;
            (n.push(d - qe, h * o - qe, d + qe, h * o + o * 0.5 - p * 0.5),
              n.push(
                d - qe,
                h * o + o * 0.5 + p * 0.5,
                d + qe,
                h * o + o + qe,
              ));
          } else if (f === 7) {
            let p = s.breachStub.get((h * a + u) * 2) || z1;
            (n.push(d - qe, h * o - qe, d + qe, h * o + p[0]),
              n.push(d - qe, h * o + o - p[1], d + qe, h * o + o + qe));
          } else {
            let p = f === 4 ? 0.05 : f === 5 ? 0.04 : qe;
            n.push(d - p, h * o - p, d + p, h * o + o + p);
          }
        }
    for (let h = l - i; h <= l + i + 1; h++)
      if (!(h < 0 || h > s.H))
        for (let u = c - i; u <= c + i; u++) {
          if (u < 0 || u >= s.W) continue;
          let f = s.hw[h * s.W + u];
          if (f === 0) continue;
          let d = h * o;
          if (f === 3 || (f === 6 && r)) {
            let p = f === 3 ? 1.2 : 1;
            (n.push(u * o - qe, d - qe, u * o + o * 0.5 - p * 0.5, d + qe),
              n.push(
                u * o + o * 0.5 + p * 0.5,
                d - qe,
                u * o + o + qe,
                d + qe,
              ));
          } else if (f === 7) {
            let p = s.breachStub.get((h * s.W + u) * 2 + 1) || z1;
            (n.push(u * o - qe, d - qe, u * o + p[0], d + qe),
              n.push(u * o + o - p[1], d - qe, u * o + o + qe, d + qe));
          } else {
            let p = f === 4 ? 0.05 : f === 5 ? 0.04 : qe;
            n.push(u * o - p, d - p, u * o + o + p, d + p);
          }
        }
    for (let h = l - i; h <= l + i + 1; h++)
      if (!(h < 0 || h > s.H))
        for (let u = c - i; u <= c + i + 1; u++) {
          if (u < 0 || u > s.W || !s.pillar[h * a + u]) continue;
          let f = 0.28;
          n.push(u * o - f, h * o - f, u * o + f, h * o + f);
        }
    for (let h = l - i; h <= l + i; h++)
      for (let u = c - i; u <= c + i; u++) {
        if (u < 0 || h < 0 || u >= s.W || h >= s.H) continue;
        let f = s.propRects.get(h * s.W + u);
        if (f) for (let d of f) d.dead || n.push(d[0], d[1], d[2], d[3]);
      }
    return n;
  }
  function yc(s, t, e, n = !1) {
    IE(s, t.x, t.z, vc, 1, n);
    let i = !1;
    for (let a = 0; a < 3; a++) {
      let c = !1;
      for (let l = 0; l < vc.length; l += 4) {
        let h = vc[l],
          u = vc[l + 1],
          f = vc[l + 2],
          d = vc[l + 3],
          p = t.x < h ? h : t.x > f ? f : t.x,
          g = t.z < u ? u : t.z > d ? d : t.z,
          m = t.x - p,
          x = t.z - g,
          v = m * m + x * x;
        if (!(v >= e * e)) {
          if (v > 1e-10) {
            let y = Math.sqrt(v),
              _ = e - y;
            ((t.x += (m / y) * _), (t.z += (x / y) * _));
          } else {
            let y = t.x - h,
              _ = f - t.x,
              M = t.z - u,
              b = d - t.z,
              w = Math.min(y, _, M, b);
            w === y
              ? (t.x = h - e)
              : w === _
                ? (t.x = f + e)
                : w === M
                  ? (t.z = u - e)
                  : (t.z = d + e);
          }
          i = c = !0;
        }
      }
      if (!c) break;
    }
    let r = s.W * 4 - e,
      o = s.H * 4 - e;
    return (
      t.x < e && (t.x = e),
      t.z < e && (t.z = e),
      t.x > r && (t.x = r),
      t.z > o && (t.z = o),
      i
    );
  }
  function B1(s, t, e) {
    let n = Math.floor(t / 4),
      i = Math.floor(e / 4);
    return n < 0 || i < 0 || n >= s.W || i >= s.H ? 1 : s.floor[i * s.W + n];
  }
  function rr(s, t, e) {
    let n = Math.floor(t / 4),
      i = Math.floor(e / 4);
    if (n < 0 || i < 0 || n >= s.W || i >= s.H) return !1;
    let r = i * s.W + n,
      o = s.floor[r];
    if (o === 1) return !1;
    if (s.holes && s.holes.has(r)) {
      let a = t - n * 4,
        c = e - i * 4;
      if (a > 0.55 && a < 4 - 0.55 && c > 0.55 && c < 4 - 0.55) return !1;
    }
    if (o === 4) {
      let a = t - n * 4;
      return !(a > 1.3 && a < 2.7);
    }
    if (o === 5) {
      let a = e - i * 4;
      return !(a > 1.3 && a < 2.7);
    }
    return !0;
  }
  function ni(s, t, e, n, i, r, o = "shot") {
    let a = 4,
      c = s.W + 1,
      l = Math.hypot(n, i) || 1;
    ((n /= l), (i /= l));
    let h = Math.floor(t / a),
      u = Math.floor(e / a),
      f = n > 0 ? 1 : -1,
      d = i > 0 ? 1 : -1,
      p = n !== 0 ? ((f > 0 ? (h + 1) * a : h * a) - t) / n : 1e9,
      g = i !== 0 ? ((d > 0 ? (u + 1) * a : u * a) - e) / i : 1e9,
      m = n !== 0 ? a / Math.abs(n) : 1e9,
      x = i !== 0 ? a / Math.abs(i) : 1e9,
      v = null,
      y = (_, M, b) => {
        for (let S = M; S <= M + 1; S++)
          for (let T = _; T <= _ + 1; T++) {
            if (T < 0 || S < 0 || T > s.W || S > s.H || !s.pillar[S * c + T])
              continue;
            let E = O2(
              t,
              e,
              n,
              i,
              T * a - 0.28,
              S * a - 0.28,
              T * a + 0.28,
              S * a + 0.28,
            );
            E !== null &&
              E < b &&
              (!v || E < v.dist) &&
              (v = { dist: E, kind: "pillar", nx: 0, nz: 0, vx: T, vy: S });
          }
        let w = s.propRects.get(M * s.W + _);
        if (w)
          for (let S of w) {
            if (S.dead || (o !== "move" && S.low)) continue;
            let T = O2(t, e, n, i, S[0], S[1], S[2], S[3]);
            T !== null &&
              T < b &&
              (!v || T < v.dist) &&
              (v = { dist: T, kind: "prop", nx: 0, nz: 0, rect: S });
          }
      };
    for (let _ = 0; _ < 400 && !(h < 0 || u < 0 || h >= s.W || u >= s.H); _++) {
      let M = Math.min(p, g);
      if ((y(h, u, Math.min(M + 0.3, r)), v && v.dist <= M)) return v;
      if (M > r) break;
      let b,
        w,
        S,
        T = 0,
        E = 0;
      if (p < g) {
        let R = f > 0 ? h + 1 : h;
        ((b = s.vw[u * c + R]),
          (w = e + i * p - u * a),
          (S = { vert: !0, i: R, j: u }),
          (T = -f));
      } else {
        let R = d > 0 ? u + 1 : u;
        ((b = s.hw[R * s.W + h]),
          (w = t + n * g - h * a),
          (S = { vert: !1, i: h, j: R }),
          (E = -d));
      }
      let C = !1;
      if (b === 1 || b === 2 || b === 6) C = !0;
      else if (b === 3) C = Math.abs(w - a / 2) > 1.2 / 2;
      else if (b === 7) {
        let R =
          s.breachStub.get(
            S.vert ? (S.j * c + S.i) * 2 : (S.j * s.W + S.i) * 2 + 1,
          ) || z1;
        C = w < R[0] || w > a - R[1];
      } else (b === 4 || b === 5) && (C = o === "move");
      if (C)
        return {
          dist: Math.max(0, M - qe * 0.9),
          kind: "wall",
          edge: S,
          value: b,
          nx: T,
          nz: E,
        };
      p < g ? ((h += f), (p += m)) : ((u += d), (g += x));
    }
    return v || { dist: r, kind: null };
  }
  function O2(s, t, e, n, i, r, o, a) {
    let c = -1e9,
      l = 1e9;
    if (Math.abs(e) < 1e-9) {
      if (s < i || s > o) return null;
    } else {
      let h = (i - s) / e,
        u = (o - s) / e;
      if (h > u) {
        let f = h;
        ((h = u), (u = f));
      }
      ((c = Math.max(c, h)), (l = Math.min(l, u)));
    }
    if (Math.abs(n) < 1e-9) {
      if (t < r || t > a) return null;
    } else {
      let h = (r - t) / n,
        u = (a - t) / n;
      if (h > u) {
        let f = h;
        ((h = u), (u = f));
      }
      ((c = Math.max(c, h)), (l = Math.min(l, u)));
    }
    return l < Math.max(c, 0) ? null : Math.max(c, 0);
  }
  function nn(s, t, e, n, i) {
    let r = n - t,
      o = i - e,
      a = Math.hypot(r, o);
    if (a < 0.01) return !0;
    let c = ni(s, t, e, r, o, a, "sight");
    return c.kind === null || c.dist >= a - 0.05 || c.kind === "prop";
  }
  var Ur = 0,
    Or = 1,
    Pi = 2,
    H1 = [1.62, 1.05, 0.42],
    DE = -1.35;
  function NE(s, t, e) {
    if (!rr(s, t, e)) return null;
    let n = B1(s, t, e);
    return n === 2 ? DE : n === 7 ? groundTrack(s, t, e) : 0;
  }
  function groundTrack(s, t, e) {
    if (s.trains)
      for (let n of s.trains)
        if (t > n[0] && t < n[2] && e > n[1] && e < n[3]) return 0.01;
    return -1.1;
  }
  function groundY(s, t, e) {
    let n = B1(s, t, e);
    return n === 7 ? groundTrack(s, t, e) : n === 2 ? DE : 0;
  }
  var _d = class {
    constructor() {
      ((this.pos = new L()),
        (this.vel = new L()),
        (this.yaw = 0),
        (this.pitch = 0),
        (this.stance = Ur),
        (this.eye = H1[0]),
        (this.onGround = !0),
        (this.radius = 0.3),
        (this.hp = 100),
        (this.maxHp = 100),
        (this.stamina = 100),
        (this.exhausted = !1),
        (this.bob = 0),
        (this.bobAmp = 0),
        (this.landDip = 0),
        (this.roll = 0),
        (this.speed = 0),
        (this.noise = 0),
        (this.dead = !1),
        (this.water = 0),
        (this.slow = 0),
        (this.stuck = 0),
        (this.camPos = new L()),
        (this.forward = new L(0, 0, -1)),
        (this.stepDist = 0),
        (this.onStep = null),
        (this.onLand = null),
        (this.fallStartY = 0),
        (this.hurtT = 0),
        (this.shake = 0),
        (this.stats = {
          maxHp: 100,
          maxStamina: 100,
          drain: 7,
          regen: 20,
          speedMul: 1,
          armor: 0,
        }),
        (this.buffs = { adren: 0, drink: 0, hot: 0, hotRate: 0 }),
        (this.inDuct = !1));
    }
    applyStats(t) {
      (Object.assign(this.stats, t),
        (this.maxHp = this.stats.maxHp),
        (this.hp = Math.min(this.hp, this.maxHp)));
    }
    reset(t, e, n) {
      (this.pos.set(t, 0, e),
        this.vel.set(0, 0, 0),
        (this.yaw = n),
        (this.pitch = 0),
        (this.stance = Ur),
        (this.eye = H1[0]),
        (this.onGround = !0),
        (this.stuck = 0),
        (this.slow = 0));
    }
    update(t, e, n) {
      let [i, r] = e.consumeLook(),
        a = (e.isTouch && !e.pointerLocked ? 0.0046 : 0.0028) * e.sens;
      ((this.yaw -= i * a),
        (this.pitch -= r * a * (e.invertY ? -1 : 1)),
        (this.pitch = ke(this.pitch, -1.48, 1.48)));
      let c = this.water === 2,
        l = Math.floor(this.pos.x / 4),
        h = Math.floor(this.pos.z / 4);
      this.inDuct = n.inb(l, h) && n.floor[n.ci(l, h)] === 6;
      let u = e.take("crouch"),
        f = e.take("prone"),
        d = e.take("jump");
      this.inDuct
        ? ((u || f || d) && this.onBlocked && this.onBlocked("duct"),
          (this.stance = Pi))
        : (u && (this.stance = this.stance === Or ? Ur : Or),
          f && (this.stance = this.stance === Pi ? Ur : Pi),
          c && (this.stance = Ur),
          d &&
            (this.stance !== Ur
              ? (this.stance = this.stance === Pi ? Or : Ur)
              : this.onGround && !c && this.stuck <= 0
                ? ((this.vel.y = 4.7),
                  (this.onGround = !1),
                  (this.fallStartY = this.pos.y))
                : c && (this.vel.y = 2)));
      let p = e.move,
        g = Math.min(1, Math.hypot(p.x, p.y)),
        m = Math.sin(this.yaw),
        x = Math.cos(this.yaw),
        v = -m,
        y = -x,
        _ = x,
        M = -m,
        b = v * p.y + _ * p.x,
        w = y * p.y + M * p.x,
        S = Math.hypot(b, w);
      S > 1e-5 && ((b /= S), (w /= S));
      let T = this.stats,
        E = this.buffs,
        C = e.sprint && this.stance === Ur && !c && p.y > -0.3 && !this.inDuct;
      this.exhausted && (C = !1);
      let R;
      (c
        ? (R = 1.8 * g)
        : this.inDuct
          ? (R = 1.5 * g)
          : this.stance === Pi
            ? (R = 1 * g)
            : this.stance === Or
              ? (R = 2 * g)
              : (R = C ? 5.7 : g > 0.05 ? 1.3 + 1.95 * g : 0),
        p.y < -0.3 && (R *= 0.85),
        this.water === 1 && (R *= 0.75),
        (R *= T.speedMul * (E.adren > 0 ? 1.2 : 1)),
        (R *= 1 - ke(this.slow, 0, T.slowCap ?? 0.85)),
        this.stuck > 0 && ((R = 0), (this.stuck -= t)),
        (this.slow = Math.max(0, this.slow - t * 2.5)));
      let I = C && R > 4 && g > 0.5,
        k = T.maxStamina;
      if (I && E.adren <= 0)
        ((this.stamina -= T.drain * t),
          this.stamina <= 0 && ((this.stamina = 0), (this.exhausted = !0)));
      else if (!I) {
        let G = T.regen * (R < 0.1 ? 1.25 : 0.8) * (E.drink > 0 ? 2 : 1);
        ((this.stamina = Math.min(k, this.stamina + G * t)),
          this.exhausted && this.stamina > k * 0.25 && (this.exhausted = !1));
      }
      if (
        (E.adren > 0 &&
          ((E.adren -= t),
          (this.stamina = Math.max(this.stamina, k * 0.5)),
          (this.exhausted = !1)),
        E.drink > 0 && (E.drink -= t),
        E.hot > 0)
      ) {
        let G = Math.min(t, E.hot);
        ((E.hot -= G),
          this.hp > 0 &&
            (this.hp = Math.min(this.maxHp, this.hp + E.hotRate * G)));
      }
      let N = this.onGround || c ? 11 : 2.5,
        z = b * R,
        U = w * R,
        X = 1 - Math.exp(-N * t);
      ((this.vel.x += (z - this.vel.x) * X),
        (this.vel.z += (U - this.vel.z) * X));
      let H = Math.max(
          1,
          Math.ceil((Math.hypot(this.vel.x, this.vel.z) * t) / 0.15),
        ),
        O = t / H,
        V = { x: this.pos.x, z: this.pos.z },
        at = this.stance === Pi || this.inDuct;
      for (let G = 0; G < H; G++)
        ((V.x += this.vel.x * O),
          (V.z += this.vel.z * O),
          yc(n, V, this.radius, at));
      let tt = V.x - this.pos.x,
        wt = V.z - this.pos.z;
      ((this.pos.x = V.x),
        (this.pos.z = V.z),
        (this.speed = Math.hypot(tt, wt) / Math.max(t, 1e-4)));
      let dt = NE(n, this.pos.x, this.pos.z),
        Et = B1(n, this.pos.x, this.pos.z);
      if (c) {
        ((this.vel.y -= 6 * t), (this.pos.y += this.vel.y * t));
        let G = dt === null ? -50 : dt;
        this.pos.y < G && ((this.pos.y = G), (this.vel.y = 0));
      } else ((this.vel.y -= 15.5 * t), (this.pos.y += this.vel.y * t));
      let K = this.onGround;
      if (dt !== null && this.pos.y <= dt + 0.001) {
        dt > this.pos.y + 0.6;
        let G = this.vel.y;
        ((this.pos.y = dt),
          (this.vel.y = 0),
          (this.onGround = !0),
          K ||
            (G < -3.2 && (this.landDip = Math.min(0.28, -G * 0.035)),
            this.onLand && this.onLand(G, this.fallStartY - this.pos.y)));
      } else
        dt !== null && dt > this.pos.y && dt - this.pos.y < 1.6
          ? ((this.pos.y = Math.min(dt, this.pos.y + 3 * t)),
            (this.onGround = this.pos.y >= dt - 0.01))
          : (this.onGround && dt === null && (this.fallStartY = this.pos.y),
            (this.onGround = !1));
      (dt !== null &&
        dt < -1 &&
        this.pos.y > dt &&
        !this.onGround &&
        this.pos.y < 0.05,
        (this.water = Et === 2 && this.pos.y < terrainY(n,this.pos.x,this.pos.z)-.4 ? 2 : Et === 3 ? 1 : 0));
      let it = c ? 1.45 : this.inDuct ? 0.42 : H1[this.stance];
      ((this.eye = _n(this.eye, it, 1 - Math.exp(-10 * t))),
        (this.landDip = Math.max(0, this.landDip - t * 0.9)));
      let mt = 0;
      (this.speed > 0.3 &&
        (I
          ? (mt = 16)
          : this.stance === Pi
            ? (mt = 0.8)
            : this.stance === Or
              ? (mt = 2.2)
              : (mt = 6.5),
        this.water && (mt *= 1.7)),
        (this.noise = mt),
        (this.sprinting = I));
      let st = this.onGround ? this.speed : 0,
        Z = this.stance === Pi ? 3.2 : I ? 9.6 : 7.4,
        j = this.bob;
      this.bob += (st / Math.max(0.6, st)) * Z * t * Math.min(1, st / 2.5);
      let vt =
        Math.min(1, st / 5) *
        (this.stance === Pi ? 0.5 : this.stance === Or ? 0.6 : 1) *
        (c ? 0.3 : 1);
      ((this.bobAmp = _n(this.bobAmp, vt, 1 - Math.exp(-6 * t))),
        Math.floor(j / Math.PI) !== Math.floor(this.bob / Math.PI) &&
          st > 0.4 &&
          this.onStep &&
          this.onStep(this.water, I, this.stance),
        (this.hurtT = Math.max(0, this.hurtT - t)),
        (this.sinceHurt = (this.sinceHurt || 0) + t),
        this.sinceHurt > 8 &&
          this.hp < this.maxHp * (this.stats.regenCap || 0.6) &&
          this.hp > 0 &&
          (this.hp = Math.min(
            this.maxHp * (this.stats.regenCap || 0.6),
            this.hp + 1.4 * t,
          )),
        (this.shake = Math.max(0, this.shake - t * 2.5)));
      let Y = this.vel.x * _ + this.vel.z * M;
      this.roll = _n(this.roll, -Y * 0.006, 1 - Math.exp(-5 * t));
    }
    applyCamera(t, e) {
      let n = Math.sin(this.bob * 2) * 0.045 * this.bobAmp,
        i = Math.cos(this.bob) * 0.03 * this.bobAmp,
        r = Math.sin(this.yaw),
        o = Math.cos(this.yaw),
        a = 0.6 + this.bobAmp,
        c = (Math.sin(e * 0.9) * 0.6 + Math.sin(e * 2.3) * 0.25) * 0.004 * a,
        l = (Math.sin(e * 1.3 + 1) * 0.6 + Math.sin(e * 3.1) * 0.2) * 0.004 * a,
        h = this.shake,
        u = h > 0 ? (Math.random() - 0.5) * h * 0.06 : 0,
        f = h > 0 ? (Math.random() - 0.5) * h * 0.06 : 0;
      (t.position.set(
        this.pos.x + o * i,
        this.pos.y + this.eye + n - this.landDip,
        this.pos.z - r * i,
      ),
        (t.rotation.order = "YXZ"),
        (t.rotation.y = this.yaw + c + u),
        (t.rotation.x =
          this.pitch + l + f + Math.sin(this.bob * 2) * 0.004 * this.bobAmp),
        (t.rotation.z = this.roll + Math.cos(this.bob) * 0.006 * this.bobAmp),
        t.updateMatrixWorld(),
        this.camPos.copy(t.position),
        t.getWorldDirection(this.forward));
    }
  };
  var z2 = new Int32Array([
      0, 265, 515, 778, 1030, 1295, 1541, 1804, 2060, 2309, 2575, 2822, 3082,
      3331, 3593, 3840, 400, 153, 915, 666, 1430, 1183, 1941, 1692, 2460, 2197,
      2975, 2710, 3482, 3219, 3993, 3728, 560, 825, 51, 314, 1590, 1855, 1077,
      1340, 2620, 2869, 2111, 2358, 3642, 3891, 3129, 3376, 928, 681, 419, 170,
      1958, 1711, 1445, 1196, 2988, 2725, 2479, 2214, 4010, 3747, 3497, 3232,
      1120, 1385, 1635, 1898, 102, 367, 613, 876, 3180, 3429, 3695, 3942, 2154,
      2403, 2665, 2912, 1520, 1273, 2035, 1786, 502, 255, 1013, 764, 3580, 3317,
      4095, 3830, 2554, 2291, 3065, 2800, 1616, 1881, 1107, 1370, 598, 863, 85,
      348, 3676, 3925, 3167, 3414, 2650, 2899, 2137, 2384, 1984, 1737, 1475,
      1226, 966, 719, 453, 204, 4044, 3781, 3535, 3270, 3018, 2755, 2505, 2240,
      2240, 2505, 2755, 3018, 3270, 3535, 3781, 4044, 204, 453, 719, 966, 1226,
      1475, 1737, 1984, 2384, 2137, 2899, 2650, 3414, 3167, 3925, 3676, 348, 85,
      863, 598, 1370, 1107, 1881, 1616, 2800, 3065, 2291, 2554, 3830, 4095,
      3317, 3580, 764, 1013, 255, 502, 1786, 2035, 1273, 1520, 2912, 2665, 2403,
      2154, 3942, 3695, 3429, 3180, 876, 613, 367, 102, 1898, 1635, 1385, 1120,
      3232, 3497, 3747, 4010, 2214, 2479, 2725, 2988, 1196, 1445, 1711, 1958,
      170, 419, 681, 928, 3376, 3129, 3891, 3642, 2358, 2111, 2869, 2620, 1340,
      1077, 1855, 1590, 314, 51, 825, 560, 3728, 3993, 3219, 3482, 2710, 2975,
      2197, 2460, 1692, 1941, 1183, 1430, 666, 915, 153, 400, 3840, 3593, 3331,
      3082, 2822, 2575, 2309, 2060, 1804, 1541, 1295, 1030, 778, 515, 265, 0,
    ]),
    gh = new Int32Array([
      -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 8, 3,
      -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 1, 9, -1, -1, -1,
      -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 8, 3, 9, 8, 1, -1, -1, -1, -1,
      -1, -1, -1, -1, -1, -1, 1, 2, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
      -1, -1, -1, 0, 8, 3, 1, 2, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 9,
      2, 10, 0, 2, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 2, 8, 3, 2, 10, 8,
      10, 9, 8, -1, -1, -1, -1, -1, -1, -1, 3, 11, 2, -1, -1, -1, -1, -1, -1,
      -1, -1, -1, -1, -1, -1, -1, 0, 11, 2, 8, 11, 0, -1, -1, -1, -1, -1, -1,
      -1, -1, -1, -1, 1, 9, 0, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
      1, 11, 2, 1, 9, 11, 9, 8, 11, -1, -1, -1, -1, -1, -1, -1, 3, 10, 1, 11,
      10, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 10, 1, 0, 8, 10, 8, 11,
      10, -1, -1, -1, -1, -1, -1, -1, 3, 9, 0, 3, 11, 9, 11, 10, 9, -1, -1, -1,
      -1, -1, -1, -1, 9, 8, 10, 10, 8, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1,
      -1, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 4, 3, 0,
      7, 3, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 1, 9, 8, 4, 7, -1, -1,
      -1, -1, -1, -1, -1, -1, -1, -1, 4, 1, 9, 4, 7, 1, 7, 3, 1, -1, -1, -1, -1,
      -1, -1, -1, 1, 2, 10, 8, 4, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3,
      4, 7, 3, 0, 4, 1, 2, 10, -1, -1, -1, -1, -1, -1, -1, 9, 2, 10, 9, 0, 2, 8,
      4, 7, -1, -1, -1, -1, -1, -1, -1, 2, 10, 9, 2, 9, 7, 2, 7, 3, 7, 9, 4, -1,
      -1, -1, -1, 8, 4, 7, 3, 11, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 11,
      4, 7, 11, 2, 4, 2, 0, 4, -1, -1, -1, -1, -1, -1, -1, 9, 0, 1, 8, 4, 7, 2,
      3, 11, -1, -1, -1, -1, -1, -1, -1, 4, 7, 11, 9, 4, 11, 9, 11, 2, 9, 2, 1,
      -1, -1, -1, -1, 3, 10, 1, 3, 11, 10, 7, 8, 4, -1, -1, -1, -1, -1, -1, -1,
      1, 11, 10, 1, 4, 11, 1, 0, 4, 7, 11, 4, -1, -1, -1, -1, 4, 7, 8, 9, 0, 11,
      9, 11, 10, 11, 0, 3, -1, -1, -1, -1, 4, 7, 11, 4, 11, 9, 9, 11, 10, -1,
      -1, -1, -1, -1, -1, -1, 9, 5, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
      -1, -1, -1, 9, 5, 4, 0, 8, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0,
      5, 4, 1, 5, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 8, 5, 4, 8, 3, 5,
      3, 1, 5, -1, -1, -1, -1, -1, -1, -1, 1, 2, 10, 9, 5, 4, -1, -1, -1, -1,
      -1, -1, -1, -1, -1, -1, 3, 0, 8, 1, 2, 10, 4, 9, 5, -1, -1, -1, -1, -1,
      -1, -1, 5, 2, 10, 5, 4, 2, 4, 0, 2, -1, -1, -1, -1, -1, -1, -1, 2, 10, 5,
      3, 2, 5, 3, 5, 4, 3, 4, 8, -1, -1, -1, -1, 9, 5, 4, 2, 3, 11, -1, -1, -1,
      -1, -1, -1, -1, -1, -1, -1, 0, 11, 2, 0, 8, 11, 4, 9, 5, -1, -1, -1, -1,
      -1, -1, -1, 0, 5, 4, 0, 1, 5, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1, 2, 1,
      5, 2, 5, 8, 2, 8, 11, 4, 8, 5, -1, -1, -1, -1, 10, 3, 11, 10, 1, 3, 9, 5,
      4, -1, -1, -1, -1, -1, -1, -1, 4, 9, 5, 0, 8, 1, 8, 10, 1, 8, 11, 10, -1,
      -1, -1, -1, 5, 4, 0, 5, 0, 11, 5, 11, 10, 11, 0, 3, -1, -1, -1, -1, 5, 4,
      8, 5, 8, 10, 10, 8, 11, -1, -1, -1, -1, -1, -1, -1, 9, 7, 8, 5, 7, 9, -1,
      -1, -1, -1, -1, -1, -1, -1, -1, -1, 9, 3, 0, 9, 5, 3, 5, 7, 3, -1, -1, -1,
      -1, -1, -1, -1, 0, 7, 8, 0, 1, 7, 1, 5, 7, -1, -1, -1, -1, -1, -1, -1, 1,
      5, 3, 3, 5, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 9, 7, 8, 9, 5, 7,
      10, 1, 2, -1, -1, -1, -1, -1, -1, -1, 10, 1, 2, 9, 5, 0, 5, 3, 0, 5, 7, 3,
      -1, -1, -1, -1, 8, 0, 2, 8, 2, 5, 8, 5, 7, 10, 5, 2, -1, -1, -1, -1, 2,
      10, 5, 2, 5, 3, 3, 5, 7, -1, -1, -1, -1, -1, -1, -1, 7, 9, 5, 7, 8, 9, 3,
      11, 2, -1, -1, -1, -1, -1, -1, -1, 9, 5, 7, 9, 7, 2, 9, 2, 0, 2, 7, 11,
      -1, -1, -1, -1, 2, 3, 11, 0, 1, 8, 1, 7, 8, 1, 5, 7, -1, -1, -1, -1, 11,
      2, 1, 11, 1, 7, 7, 1, 5, -1, -1, -1, -1, -1, -1, -1, 9, 5, 8, 8, 5, 7, 10,
      1, 3, 10, 3, 11, -1, -1, -1, -1, 5, 7, 0, 5, 0, 9, 7, 11, 0, 1, 0, 10, 11,
      10, 0, -1, 11, 10, 0, 11, 0, 3, 10, 5, 0, 8, 0, 7, 5, 7, 0, -1, 11, 10, 5,
      7, 11, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 10, 6, 5, -1, -1, -1,
      -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 8, 3, 5, 10, 6, -1, -1, -1, -1,
      -1, -1, -1, -1, -1, -1, 9, 0, 1, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1, -1,
      -1, -1, 1, 8, 3, 1, 9, 8, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1, 1, 6, 5,
      2, 6, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 6, 5, 1, 2, 6, 3, 0,
      8, -1, -1, -1, -1, -1, -1, -1, 9, 6, 5, 9, 0, 6, 0, 2, 6, -1, -1, -1, -1,
      -1, -1, -1, 5, 9, 8, 5, 8, 2, 5, 2, 6, 3, 2, 8, -1, -1, -1, -1, 2, 3, 11,
      10, 6, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 11, 0, 8, 11, 2, 0, 10,
      6, 5, -1, -1, -1, -1, -1, -1, -1, 0, 1, 9, 2, 3, 11, 5, 10, 6, -1, -1, -1,
      -1, -1, -1, -1, 5, 10, 6, 1, 9, 2, 9, 11, 2, 9, 8, 11, -1, -1, -1, -1, 6,
      3, 11, 6, 5, 3, 5, 1, 3, -1, -1, -1, -1, -1, -1, -1, 0, 8, 11, 0, 11, 5,
      0, 5, 1, 5, 11, 6, -1, -1, -1, -1, 3, 11, 6, 0, 3, 6, 0, 6, 5, 0, 5, 9,
      -1, -1, -1, -1, 6, 5, 9, 6, 9, 11, 11, 9, 8, -1, -1, -1, -1, -1, -1, -1,
      5, 10, 6, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 4, 3, 0, 4, 7,
      3, 6, 5, 10, -1, -1, -1, -1, -1, -1, -1, 1, 9, 0, 5, 10, 6, 8, 4, 7, -1,
      -1, -1, -1, -1, -1, -1, 10, 6, 5, 1, 9, 7, 1, 7, 3, 7, 9, 4, -1, -1, -1,
      -1, 6, 1, 2, 6, 5, 1, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1, 1, 2, 5, 5, 2,
      6, 3, 0, 4, 3, 4, 7, -1, -1, -1, -1, 8, 4, 7, 9, 0, 5, 0, 6, 5, 0, 2, 6,
      -1, -1, -1, -1, 7, 3, 9, 7, 9, 4, 3, 2, 9, 5, 9, 6, 2, 6, 9, -1, 3, 11, 2,
      7, 8, 4, 10, 6, 5, -1, -1, -1, -1, -1, -1, -1, 5, 10, 6, 4, 7, 2, 4, 2, 0,
      2, 7, 11, -1, -1, -1, -1, 0, 1, 9, 4, 7, 8, 2, 3, 11, 5, 10, 6, -1, -1,
      -1, -1, 9, 2, 1, 9, 11, 2, 9, 4, 11, 7, 11, 4, 5, 10, 6, -1, 8, 4, 7, 3,
      11, 5, 3, 5, 1, 5, 11, 6, -1, -1, -1, -1, 5, 1, 11, 5, 11, 6, 1, 0, 11, 7,
      11, 4, 0, 4, 11, -1, 0, 5, 9, 0, 6, 5, 0, 3, 6, 11, 6, 3, 8, 4, 7, -1, 6,
      5, 9, 6, 9, 11, 4, 7, 9, 7, 11, 9, -1, -1, -1, -1, 10, 4, 9, 6, 4, 10, -1,
      -1, -1, -1, -1, -1, -1, -1, -1, -1, 4, 10, 6, 4, 9, 10, 0, 8, 3, -1, -1,
      -1, -1, -1, -1, -1, 10, 0, 1, 10, 6, 0, 6, 4, 0, -1, -1, -1, -1, -1, -1,
      -1, 8, 3, 1, 8, 1, 6, 8, 6, 4, 6, 1, 10, -1, -1, -1, -1, 1, 4, 9, 1, 2, 4,
      2, 6, 4, -1, -1, -1, -1, -1, -1, -1, 3, 0, 8, 1, 2, 9, 2, 4, 9, 2, 6, 4,
      -1, -1, -1, -1, 0, 2, 4, 4, 2, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
      8, 3, 2, 8, 2, 4, 4, 2, 6, -1, -1, -1, -1, -1, -1, -1, 10, 4, 9, 10, 6, 4,
      11, 2, 3, -1, -1, -1, -1, -1, -1, -1, 0, 8, 2, 2, 8, 11, 4, 9, 10, 4, 10,
      6, -1, -1, -1, -1, 3, 11, 2, 0, 1, 6, 0, 6, 4, 6, 1, 10, -1, -1, -1, -1,
      6, 4, 1, 6, 1, 10, 4, 8, 1, 2, 1, 11, 8, 11, 1, -1, 9, 6, 4, 9, 3, 6, 9,
      1, 3, 11, 6, 3, -1, -1, -1, -1, 8, 11, 1, 8, 1, 0, 11, 6, 1, 9, 1, 4, 6,
      4, 1, -1, 3, 11, 6, 3, 6, 0, 0, 6, 4, -1, -1, -1, -1, -1, -1, -1, 6, 4, 8,
      11, 6, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 7, 10, 6, 7, 8, 10, 8,
      9, 10, -1, -1, -1, -1, -1, -1, -1, 0, 7, 3, 0, 10, 7, 0, 9, 10, 6, 7, 10,
      -1, -1, -1, -1, 10, 6, 7, 1, 10, 7, 1, 7, 8, 1, 8, 0, -1, -1, -1, -1, 10,
      6, 7, 10, 7, 1, 1, 7, 3, -1, -1, -1, -1, -1, -1, -1, 1, 2, 6, 1, 6, 8, 1,
      8, 9, 8, 6, 7, -1, -1, -1, -1, 2, 6, 9, 2, 9, 1, 6, 7, 9, 0, 9, 3, 7, 3,
      9, -1, 7, 8, 0, 7, 0, 6, 6, 0, 2, -1, -1, -1, -1, -1, -1, -1, 7, 3, 2, 6,
      7, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 2, 3, 11, 10, 6, 8, 10, 8,
      9, 8, 6, 7, -1, -1, -1, -1, 2, 0, 7, 2, 7, 11, 0, 9, 7, 6, 7, 10, 9, 10,
      7, -1, 1, 8, 0, 1, 7, 8, 1, 10, 7, 6, 7, 10, 2, 3, 11, -1, 11, 2, 1, 11,
      1, 7, 10, 6, 1, 6, 7, 1, -1, -1, -1, -1, 8, 9, 6, 8, 6, 7, 9, 1, 6, 11, 6,
      3, 1, 3, 6, -1, 0, 9, 1, 11, 6, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
      7, 8, 0, 7, 0, 6, 3, 11, 0, 11, 6, 0, -1, -1, -1, -1, 7, 11, 6, -1, -1,
      -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 7, 6, 11, -1, -1, -1, -1, -1,
      -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 8, 11, 7, 6, -1, -1, -1, -1, -1, -1,
      -1, -1, -1, -1, 0, 1, 9, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
      8, 1, 9, 8, 3, 1, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1, 10, 1, 2, 6, 11,
      7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 2, 10, 3, 0, 8, 6, 11, 7,
      -1, -1, -1, -1, -1, -1, -1, 2, 9, 0, 2, 10, 9, 6, 11, 7, -1, -1, -1, -1,
      -1, -1, -1, 6, 11, 7, 2, 10, 3, 10, 8, 3, 10, 9, 8, -1, -1, -1, -1, 7, 2,
      3, 6, 2, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 7, 0, 8, 7, 6, 0, 6,
      2, 0, -1, -1, -1, -1, -1, -1, -1, 2, 7, 6, 2, 3, 7, 0, 1, 9, -1, -1, -1,
      -1, -1, -1, -1, 1, 6, 2, 1, 8, 6, 1, 9, 8, 8, 7, 6, -1, -1, -1, -1, 10, 7,
      6, 10, 1, 7, 1, 3, 7, -1, -1, -1, -1, -1, -1, -1, 10, 7, 6, 1, 7, 10, 1,
      8, 7, 1, 0, 8, -1, -1, -1, -1, 0, 3, 7, 0, 7, 10, 0, 10, 9, 6, 10, 7, -1,
      -1, -1, -1, 7, 6, 10, 7, 10, 8, 8, 10, 9, -1, -1, -1, -1, -1, -1, -1, 6,
      8, 4, 11, 8, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 6, 11, 3, 0, 6,
      0, 4, 6, -1, -1, -1, -1, -1, -1, -1, 8, 6, 11, 8, 4, 6, 9, 0, 1, -1, -1,
      -1, -1, -1, -1, -1, 9, 4, 6, 9, 6, 3, 9, 3, 1, 11, 3, 6, -1, -1, -1, -1,
      6, 8, 4, 6, 11, 8, 2, 10, 1, -1, -1, -1, -1, -1, -1, -1, 1, 2, 10, 3, 0,
      11, 0, 6, 11, 0, 4, 6, -1, -1, -1, -1, 4, 11, 8, 4, 6, 11, 0, 2, 9, 2, 10,
      9, -1, -1, -1, -1, 10, 9, 3, 10, 3, 2, 9, 4, 3, 11, 3, 6, 4, 6, 3, -1, 8,
      2, 3, 8, 4, 2, 4, 6, 2, -1, -1, -1, -1, -1, -1, -1, 0, 4, 2, 4, 6, 2, -1,
      -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 9, 0, 2, 3, 4, 2, 4, 6, 4, 3, 8,
      -1, -1, -1, -1, 1, 9, 4, 1, 4, 2, 2, 4, 6, -1, -1, -1, -1, -1, -1, -1, 8,
      1, 3, 8, 6, 1, 8, 4, 6, 6, 10, 1, -1, -1, -1, -1, 10, 1, 0, 10, 0, 6, 6,
      0, 4, -1, -1, -1, -1, -1, -1, -1, 4, 6, 3, 4, 3, 8, 6, 10, 3, 0, 3, 9, 10,
      9, 3, -1, 10, 9, 4, 6, 10, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 4,
      9, 5, 7, 6, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 8, 3, 4, 9, 5,
      11, 7, 6, -1, -1, -1, -1, -1, -1, -1, 5, 0, 1, 5, 4, 0, 7, 6, 11, -1, -1,
      -1, -1, -1, -1, -1, 11, 7, 6, 8, 3, 4, 3, 5, 4, 3, 1, 5, -1, -1, -1, -1,
      9, 5, 4, 10, 1, 2, 7, 6, 11, -1, -1, -1, -1, -1, -1, -1, 6, 11, 7, 1, 2,
      10, 0, 8, 3, 4, 9, 5, -1, -1, -1, -1, 7, 6, 11, 5, 4, 10, 4, 2, 10, 4, 0,
      2, -1, -1, -1, -1, 3, 4, 8, 3, 5, 4, 3, 2, 5, 10, 5, 2, 11, 7, 6, -1, 7,
      2, 3, 7, 6, 2, 5, 4, 9, -1, -1, -1, -1, -1, -1, -1, 9, 5, 4, 0, 8, 6, 0,
      6, 2, 6, 8, 7, -1, -1, -1, -1, 3, 6, 2, 3, 7, 6, 1, 5, 0, 5, 4, 0, -1, -1,
      -1, -1, 6, 2, 8, 6, 8, 7, 2, 1, 8, 4, 8, 5, 1, 5, 8, -1, 9, 5, 4, 10, 1,
      6, 1, 7, 6, 1, 3, 7, -1, -1, -1, -1, 1, 6, 10, 1, 7, 6, 1, 0, 7, 8, 7, 0,
      9, 5, 4, -1, 4, 0, 10, 4, 10, 5, 0, 3, 10, 6, 10, 7, 3, 7, 10, -1, 7, 6,
      10, 7, 10, 8, 5, 4, 10, 4, 8, 10, -1, -1, -1, -1, 6, 9, 5, 6, 11, 9, 11,
      8, 9, -1, -1, -1, -1, -1, -1, -1, 3, 6, 11, 0, 6, 3, 0, 5, 6, 0, 9, 5, -1,
      -1, -1, -1, 0, 11, 8, 0, 5, 11, 0, 1, 5, 5, 6, 11, -1, -1, -1, -1, 6, 11,
      3, 6, 3, 5, 5, 3, 1, -1, -1, -1, -1, -1, -1, -1, 1, 2, 10, 9, 5, 11, 9,
      11, 8, 11, 5, 6, -1, -1, -1, -1, 0, 11, 3, 0, 6, 11, 0, 9, 6, 5, 6, 9, 1,
      2, 10, -1, 11, 8, 5, 11, 5, 6, 8, 0, 5, 10, 5, 2, 0, 2, 5, -1, 6, 11, 3,
      6, 3, 5, 2, 10, 3, 10, 5, 3, -1, -1, -1, -1, 5, 8, 9, 5, 2, 8, 5, 6, 2, 3,
      8, 2, -1, -1, -1, -1, 9, 5, 6, 9, 6, 0, 0, 6, 2, -1, -1, -1, -1, -1, -1,
      -1, 1, 5, 8, 1, 8, 0, 5, 6, 8, 3, 8, 2, 6, 2, 8, -1, 1, 5, 6, 2, 1, 6, -1,
      -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 3, 6, 1, 6, 10, 3, 8, 6, 5, 6, 9,
      8, 9, 6, -1, 10, 1, 0, 10, 0, 6, 9, 5, 0, 5, 6, 0, -1, -1, -1, -1, 0, 3,
      8, 5, 6, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 10, 5, 6, -1, -1, -1,
      -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 11, 5, 10, 7, 5, 11, -1, -1, -1,
      -1, -1, -1, -1, -1, -1, -1, 11, 5, 10, 11, 7, 5, 8, 3, 0, -1, -1, -1, -1,
      -1, -1, -1, 5, 11, 7, 5, 10, 11, 1, 9, 0, -1, -1, -1, -1, -1, -1, -1, 10,
      7, 5, 10, 11, 7, 9, 8, 1, 8, 3, 1, -1, -1, -1, -1, 11, 1, 2, 11, 7, 1, 7,
      5, 1, -1, -1, -1, -1, -1, -1, -1, 0, 8, 3, 1, 2, 7, 1, 7, 5, 7, 2, 11, -1,
      -1, -1, -1, 9, 7, 5, 9, 2, 7, 9, 0, 2, 2, 11, 7, -1, -1, -1, -1, 7, 5, 2,
      7, 2, 11, 5, 9, 2, 3, 2, 8, 9, 8, 2, -1, 2, 5, 10, 2, 3, 5, 3, 7, 5, -1,
      -1, -1, -1, -1, -1, -1, 8, 2, 0, 8, 5, 2, 8, 7, 5, 10, 2, 5, -1, -1, -1,
      -1, 9, 0, 1, 5, 10, 3, 5, 3, 7, 3, 10, 2, -1, -1, -1, -1, 9, 8, 2, 9, 2,
      1, 8, 7, 2, 10, 2, 5, 7, 5, 2, -1, 1, 3, 5, 3, 7, 5, -1, -1, -1, -1, -1,
      -1, -1, -1, -1, -1, 0, 8, 7, 0, 7, 1, 1, 7, 5, -1, -1, -1, -1, -1, -1, -1,
      9, 0, 3, 9, 3, 5, 5, 3, 7, -1, -1, -1, -1, -1, -1, -1, 9, 8, 7, 5, 9, 7,
      -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 5, 8, 4, 5, 10, 8, 10, 11, 8, -1,
      -1, -1, -1, -1, -1, -1, 5, 0, 4, 5, 11, 0, 5, 10, 11, 11, 3, 0, -1, -1,
      -1, -1, 0, 1, 9, 8, 4, 10, 8, 10, 11, 10, 4, 5, -1, -1, -1, -1, 10, 11, 4,
      10, 4, 5, 11, 3, 4, 9, 4, 1, 3, 1, 4, -1, 2, 5, 1, 2, 8, 5, 2, 11, 8, 4,
      5, 8, -1, -1, -1, -1, 0, 4, 11, 0, 11, 3, 4, 5, 11, 2, 11, 1, 5, 1, 11,
      -1, 0, 2, 5, 0, 5, 9, 2, 11, 5, 4, 5, 8, 11, 8, 5, -1, 9, 4, 5, 2, 11, 3,
      -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 2, 5, 10, 3, 5, 2, 3, 4, 5, 3, 8,
      4, -1, -1, -1, -1, 5, 10, 2, 5, 2, 4, 4, 2, 0, -1, -1, -1, -1, -1, -1, -1,
      3, 10, 2, 3, 5, 10, 3, 8, 5, 4, 5, 8, 0, 1, 9, -1, 5, 10, 2, 5, 2, 4, 1,
      9, 2, 9, 4, 2, -1, -1, -1, -1, 8, 4, 5, 8, 5, 3, 3, 5, 1, -1, -1, -1, -1,
      -1, -1, -1, 0, 4, 5, 1, 0, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 8,
      4, 5, 8, 5, 3, 9, 0, 5, 0, 3, 5, -1, -1, -1, -1, 9, 4, 5, -1, -1, -1, -1,
      -1, -1, -1, -1, -1, -1, -1, -1, -1, 4, 11, 7, 4, 9, 11, 9, 10, 11, -1, -1,
      -1, -1, -1, -1, -1, 0, 8, 3, 4, 9, 7, 9, 11, 7, 9, 10, 11, -1, -1, -1, -1,
      1, 10, 11, 1, 11, 4, 1, 4, 0, 7, 4, 11, -1, -1, -1, -1, 3, 1, 4, 3, 4, 8,
      1, 10, 4, 7, 4, 11, 10, 11, 4, -1, 4, 11, 7, 9, 11, 4, 9, 2, 11, 9, 1, 2,
      -1, -1, -1, -1, 9, 7, 4, 9, 11, 7, 9, 1, 11, 2, 11, 1, 0, 8, 3, -1, 11, 7,
      4, 11, 4, 2, 2, 4, 0, -1, -1, -1, -1, -1, -1, -1, 11, 7, 4, 11, 4, 2, 8,
      3, 4, 3, 2, 4, -1, -1, -1, -1, 2, 9, 10, 2, 7, 9, 2, 3, 7, 7, 4, 9, -1,
      -1, -1, -1, 9, 10, 7, 9, 7, 4, 10, 2, 7, 8, 7, 0, 2, 0, 7, -1, 3, 7, 10,
      3, 10, 2, 7, 4, 10, 1, 10, 0, 4, 0, 10, -1, 1, 10, 2, 8, 7, 4, -1, -1, -1,
      -1, -1, -1, -1, -1, -1, -1, 4, 9, 1, 4, 1, 7, 7, 1, 3, -1, -1, -1, -1, -1,
      -1, -1, 4, 9, 1, 4, 1, 7, 0, 8, 1, 8, 7, 1, -1, -1, -1, -1, 4, 0, 3, 7, 4,
      3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 4, 8, 7, -1, -1, -1, -1, -1,
      -1, -1, -1, -1, -1, -1, -1, -1, 9, 10, 8, 10, 11, 8, -1, -1, -1, -1, -1,
      -1, -1, -1, -1, -1, 3, 0, 9, 3, 9, 11, 11, 9, 10, -1, -1, -1, -1, -1, -1,
      -1, 0, 1, 10, 0, 10, 8, 8, 10, 11, -1, -1, -1, -1, -1, -1, -1, 3, 1, 10,
      11, 3, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 2, 11, 1, 11, 9, 9,
      11, 8, -1, -1, -1, -1, -1, -1, -1, 3, 0, 9, 3, 9, 11, 1, 2, 9, 2, 11, 9,
      -1, -1, -1, -1, 0, 2, 11, 8, 0, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1,
      -1, 3, 2, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 2, 3, 8,
      2, 8, 10, 10, 8, 9, -1, -1, -1, -1, -1, -1, -1, 9, 10, 2, 0, 9, 2, -1, -1,
      -1, -1, -1, -1, -1, -1, -1, -1, 2, 3, 8, 2, 8, 10, 0, 1, 8, 1, 10, 8, -1,
      -1, -1, -1, 1, 10, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
      1, 3, 8, 9, 1, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 9, 1, -1, -1,
      -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 3, 8, -1, -1, -1, -1, -1,
      -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
      -1, -1, -1, -1, -1, -1,
    ]);
  function B2(s, t, e = {}) {
    let n = s.length / 3,
      i = t.length / 3,
      r = e.maxErr ?? 1e-5,
      o = e.target ?? 0,
      a = e.iters ?? 20,
      c = e.lock || null,
      l = Float64Array.from(s),
      h = new Float64Array(n * 10),
      u = new Int32Array(n),
      f = new Int32Array(n),
      d = new Uint8Array(n),
      p = i,
      g = i,
      m = Int32Array.from(t),
      x = new Float64Array(p * 4),
      v = new Float64Array(p * 3),
      y = new Uint8Array(p),
      _ = new Uint8Array(p),
      M = new Int32Array(p * 6),
      b = new Uint8Array(p * 6),
      w = 0,
      S = new Uint8Array(64),
      T = new Uint8Array(64),
      E = new Float64Array(10),
      C = 0,
      R = 0,
      I = 0,
      k = (st, Z) => {
        if (w >= M.length) {
          let j = new Int32Array(M.length * 2);
          (j.set(M), (M = j));
          let vt = new Uint8Array(b.length * 2);
          (vt.set(b), (b = vt));
        }
        ((M[w] = st), (b[w] = Z), w++);
      },
      N = (st, Z, j) =>
        E[0] * st * st +
        2 * E[1] * st * Z +
        2 * E[2] * st * j +
        2 * E[3] * st +
        E[4] * Z * Z +
        2 * E[5] * Z * j +
        2 * E[6] * Z +
        E[7] * j * j +
        2 * E[8] * j +
        E[9],
      z = (st, Z, j, vt, Y, G, ot, ht, gt) => {
        let Mt = E;
        return (
          Mt[st] * Mt[Y] * Mt[gt] +
          Mt[j] * Mt[vt] * Mt[ht] +
          Mt[Z] * Mt[G] * Mt[ot] -
          Mt[j] * Mt[Y] * Mt[ot] -
          Mt[st] * Mt[G] * Mt[ht] -
          Mt[Z] * Mt[vt] * Mt[gt]
        );
      };
    function U(st, Z) {
      for (let D = 0; D < 10; D++) E[D] = h[st * 10 + D] + h[Z * 10 + D];
      let j = c && c[st],
        vt = c && c[Z];
      if (j && vt) return 1 / 0;
      if (j || vt) {
        let D = j ? st : Z;
        return (
          (C = l[D * 3]),
          (R = l[D * 3 + 1]),
          (I = l[D * 3 + 2]),
          N(C, R, I)
        );
      }
      let Y = l[st * 3],
        G = l[st * 3 + 1],
        ot = l[st * 3 + 2],
        ht = l[Z * 3],
        gt = l[Z * 3 + 1],
        Mt = l[Z * 3 + 2];
      if (!(d[st] & d[Z])) {
        let D = z(0, 1, 2, 1, 4, 5, 2, 5, 7);
        if (Math.abs(D) > 1e-24) {
          let A = (-1 / D) * z(1, 2, 3, 4, 5, 6, 5, 7, 8),
            $ = (1 / D) * z(0, 2, 3, 1, 5, 6, 2, 7, 8),
            J = (-1 / D) * z(0, 1, 3, 1, 4, 6, 2, 5, 8),
            ct = (Y + ht) * 0.5,
            Tt = (G + gt) * 0.5,
            Ct = (ot + Mt) * 0.5,
            lt = (Y - ht) ** 2 + (G - gt) ** 2 + (ot - Mt) ** 2;
          if ((A - ct) ** 2 + ($ - Tt) ** 2 + (J - Ct) ** 2 <= lt * 0.6)
            return ((C = A), (R = $), (I = J), N(A, $, J));
        }
      }
      let Ht = (Y + ht) * 0.5,
        qt = (G + gt) * 0.5,
        re = (ot + Mt) * 0.5,
        B = N(Y, G, ot),
        we = N(ht, gt, Mt),
        fe = N(Ht, qt, re);
      return B <= we && B <= fe
        ? ((C = Y), (R = G), (I = ot), B)
        : we <= fe
          ? ((C = ht), (R = gt), (I = Mt), we)
          : ((C = Ht), (R = qt), (I = re), fe);
    }
    function X(st) {
      let Z = m[st * 3] * 3,
        j = m[st * 3 + 1] * 3,
        vt = m[st * 3 + 2] * 3,
        Y = l[j] - l[Z],
        G = l[j + 1] - l[Z + 1],
        ot = l[j + 2] - l[Z + 2],
        ht = l[vt] - l[Z],
        gt = l[vt + 1] - l[Z + 1],
        Mt = l[vt + 2] - l[Z + 2],
        Ht = G * Mt - ot * gt,
        qt = ot * ht - Y * Mt,
        re = Y * gt - G * ht,
        B = Math.hypot(Ht, qt, re) || 1;
      ((v[st * 3] = Ht / B),
        (v[st * 3 + 1] = qt / B),
        (v[st * 3 + 2] = re / B));
    }
    function H(st) {
      let Z = m[st * 3],
        j = m[st * 3 + 1],
        vt = m[st * 3 + 2],
        Y = U(Z, j),
        G = U(j, vt),
        ot = U(vt, Z);
      ((x[st * 4] = Y),
        (x[st * 4 + 1] = G),
        (x[st * 4 + 2] = ot),
        (x[st * 4 + 3] = Math.min(Y, G, ot)));
    }
    function O(st, Z, j) {
      let vt = u[st],
        Y = f[st];
      for (let G = 0; G < Y; G++) {
        let ot = M[vt + G];
        if (y[ot]) continue;
        let ht = b[vt + G],
          gt = m[ot * 3 + ((ht + 1) % 3)],
          Mt = m[ot * 3 + ((ht + 2) % 3)];
        if (gt === Z || Mt === Z) {
          j[G] = 1;
          continue;
        }
        let Ht = l[gt * 3] - C,
          qt = l[gt * 3 + 1] - R,
          re = l[gt * 3 + 2] - I,
          B = l[Mt * 3] - C,
          we = l[Mt * 3 + 1] - R,
          fe = l[Mt * 3 + 2] - I,
          D = Math.hypot(Ht, qt, re),
          A = Math.hypot(B, we, fe);
        if (
          D < 1e-12 ||
          A < 1e-12 ||
          ((Ht /= D),
          (qt /= D),
          (re /= D),
          (B /= A),
          (we /= A),
          (fe /= A),
          Math.abs(Ht * B + qt * we + re * fe) > 0.999)
        )
          return !0;
        let $ = qt * fe - re * we,
          J = re * B - Ht * fe,
          ct = Ht * we - qt * B,
          Tt = Math.hypot($, J, ct) || 1;
        if (
          ((j[G] = 0),
          ($ * v[ot * 3] + J * v[ot * 3 + 1] + ct * v[ot * 3 + 2]) / Tt < 0.25)
        )
          return !0;
      }
      return !1;
    }
    function V(st, Z, j) {
      let vt = u[Z],
        Y = f[Z];
      for (let G = 0; G < Y; G++) {
        let ot = M[vt + G],
          ht = b[vt + G];
        if (!y[ot]) {
          if (j[G]) {
            ((y[ot] = 1), g--);
            continue;
          }
          ((m[ot * 3 + ht] = st), (_[ot] = 1), X(ot), H(ot), k(ot, ht));
        }
      }
    }
    function at(st) {
      if (st > 0) {
        let j = 0;
        for (let vt = 0; vt < p; vt++)
          if (!y[vt]) {
            if (j !== vt) {
              ((m[j * 3] = m[vt * 3]),
                (m[j * 3 + 1] = m[vt * 3 + 1]),
                (m[j * 3 + 2] = m[vt * 3 + 2]));
              for (let Y = 0; Y < 4; Y++) x[j * 4 + Y] = x[vt * 4 + Y];
              ((v[j * 3] = v[vt * 3]),
                (v[j * 3 + 1] = v[vt * 3 + 1]),
                (v[j * 3 + 2] = v[vt * 3 + 2]));
            }
            j++;
          }
        ((p = j), y.fill(0, 0, p));
      }
      if (st === 0) {
        h.fill(0);
        for (let j = 0; j < p; j++) {
          X(j);
          let vt = v[j * 3],
            Y = v[j * 3 + 1],
            G = v[j * 3 + 2],
            ot = m[j * 3] * 3,
            ht = -(vt * l[ot] + Y * l[ot + 1] + G * l[ot + 2]),
            gt = [
              vt * vt,
              vt * Y,
              vt * G,
              vt * ht,
              Y * Y,
              Y * G,
              Y * ht,
              G * G,
              G * ht,
              ht * ht,
            ];
          for (let Mt = 0; Mt < 3; Mt++) {
            let Ht = m[j * 3 + Mt] * 10;
            for (let qt = 0; qt < 10; qt++) h[Ht + qt] += gt[qt];
          }
        }
        for (let j = 0; j < p; j++) H(j);
      }
      f.fill(0);
      for (let j = 0; j < p * 3; j++) f[m[j]]++;
      let Z = 0;
      for (let j = 0; j < n; j++) ((u[j] = Z), (Z += f[j]), (f[j] = 0));
      M.length < p * 3 &&
        ((M = new Int32Array(p * 6)), (b = new Uint8Array(p * 6)));
      for (let j = 0; j < p; j++)
        for (let vt = 0; vt < 3; vt++) {
          let Y = m[j * 3 + vt],
            G = u[Y] + f[Y]++;
          ((M[G] = j), (b[G] = vt));
        }
      if (((w = p * 3), st === 0)) {
        let j = [],
          vt = [];
        for (let Y = 0; Y < n; Y++) {
          ((j.length = 0), (vt.length = 0));
          for (let G = 0; G < f[Y]; G++) {
            let ot = M[u[Y] + G];
            for (let ht = 0; ht < 3; ht++) {
              let gt = m[ot * 3 + ht],
                Mt = j.indexOf(gt);
              Mt < 0 ? (j.push(gt), vt.push(1)) : vt[Mt]++;
            }
          }
          for (let G = 0; G < j.length; G++) vt[G] === 1 && (d[j[G]] = 1);
        }
      }
    }
    let tt = -1;
    for (let st = 0; st < a + 8 && !(g <= o); st++) {
      (st % 5 === 0 && at(st), _.fill(0, 0, p));
      let Z = st < a ? r * Math.pow((st + 1) / a, 3) : r,
        j = 0;
      for (let vt = 0; vt < p; vt++)
        if (!(y[vt] || _[vt] || x[vt * 4 + 3] > Z)) {
          for (let Y = 0; Y < 3; Y++) {
            if (x[vt * 4 + Y] > Z) continue;
            let G = m[vt * 3 + Y],
              ot = m[vt * 3 + ((Y + 1) % 3)];
            if (d[G] !== d[ot]) continue;
            if (c) {
              if (c[G] && c[ot]) continue;
              if (c[ot]) {
                let Mt = G;
                ((G = ot), (ot = Mt));
              }
            }
            if (
              U(G, ot) > Z ||
              (S.length < f[G] && (S = new Uint8Array(f[G] * 2)),
              T.length < f[ot] && (T = new Uint8Array(f[ot] * 2)),
              O(G, ot, S)) ||
              O(ot, G, T)
            )
              continue;
            ((l[G * 3] = C), (l[G * 3 + 1] = R), (l[G * 3 + 2] = I));
            for (let Mt = 0; Mt < 10; Mt++) h[G * 10 + Mt] += h[ot * 10 + Mt];
            let ht = w;
            (V(G, G, S), V(G, ot, T));
            let gt = w - ht;
            (gt <= f[G]
              ? (gt &&
                  (M.copyWithin(u[G], ht, ht + gt),
                  b.copyWithin(u[G], ht, ht + gt)),
                (w = ht))
              : (u[G] = ht),
              (f[G] = gt),
              j++);
            break;
          }
          if (g <= o) break;
        }
      if (st >= a && j === 0) {
        if (tt >= 0) break;
        tt = st;
      }
    }
    let wt = new Int32Array(n).fill(-1),
      dt = new Uint32Array(g * 3),
      Et = 0,
      K = 0,
      it = [];
    for (let st = 0; st < p; st++)
      if (!y[st])
        for (let Z = 0; Z < 3; Z++) {
          let j = m[st * 3 + Z];
          (wt[j] < 0 && ((wt[j] = K++), it.push(j)), (dt[Et++] = wt[j]));
        }
    let mt = new Float32Array(K * 3);
    for (let st = 0; st < K; st++) {
      let Z = it[st];
      ((mt[st * 3] = l[Z * 3]),
        (mt[st * 3 + 1] = l[Z * 3 + 1]),
        (mt[st * 3 + 2] = l[Z * 3 + 2]));
    }
    return {
      position: mt,
      index: Et === dt.length ? dt : dt.slice(0, Et),
      map: Int32Array.from(it),
    };
  }
  function V1(s, t, e) {
    let n = Math.cos(s),
      i = Math.sin(s),
      r = Math.cos(t),
      o = Math.sin(t),
      a = Math.cos(e),
      c = Math.sin(e),
      l = n * a,
      h = n * c,
      u = i * a,
      f = i * c,
      d = [
        r * a,
        -r * c,
        o,
        h + u * o,
        l - f * o,
        -i * r,
        f - l * o,
        u + h * o,
        n * r,
      ];
    return [d[0], d[3], d[6], d[1], d[4], d[7], d[2], d[5], d[8]];
  }
  var Zi = 1e9,
    Md = (s, t, e) => {
      if (e <= 0) return s < t ? s : t;
      let n = Math.max(e - Math.abs(s - t), 0) / e;
      return (s < t ? s : t) - n * n * e * 0.25;
    },
    bd = (s, t, e) => -Md(-s, -t, e);
  function zr(s, t, e) {
    let n =
      (Math.imul(s | 0, 374761393) +
        Math.imul(t | 0, 668265263) +
        Math.imul(e | 0, 2147483647)) |
      0;
    return (
      (n = Math.imul(n ^ (n >>> 13), 1274126177)),
      (n ^= n >>> 16),
      (n >>> 0) / 4294967296
    );
  }
  function FE(s, t, e) {
    let n = Math.floor(s),
      i = Math.floor(t),
      r = Math.floor(e),
      o = s - n,
      a = t - i,
      c = e - r,
      l = o * o * (3 - 2 * o),
      h = a * a * (3 - 2 * a),
      u = c * c * (3 - 2 * c),
      f = zr(n, i, r),
      d = zr(n + 1, i, r),
      p = zr(n, i + 1, r),
      g = zr(n + 1, i + 1, r),
      m = zr(n, i, r + 1),
      x = zr(n + 1, i, r + 1),
      v = zr(n, i + 1, r + 1),
      y = zr(n + 1, i + 1, r + 1),
      _ = f + (d - f) * l,
      M = p + (g - p) * l,
      b = m + (x - m) * l,
      w = v + (y - v) * l,
      S = _ + (M - _) * h,
      T = b + (w - b) * h;
    return S + (T - S) * u;
  }
  var xh = (s) => (Array.isArray(s) ? s : [s.x, s.y, s.z]),
    En = class {
      constructor() {
        this.prims = [];
      }
      _add(t, e) {
        return (
          (t.k = e.k ?? 0.012),
          (t.sub = !!e.sub),
          (t.region = e.region ?? 0),
          (t.col = e.col || [1, 1, 1]),
          (t.bone = e.bone ?? 0),
          (t.bump = e.bump || null),
          (t.inter = !!e.inter),
          (t.paint = e.paint ?? e.col !== void 0),
          (t.po = !!e.paintOnly),
          this.prims.push(t),
          t
        );
      }
      cap(t, e, n, i = n, r = {}) {
        ((t = xh(t)), (e = xh(e)));
        let o = [e[0] - t[0], e[1] - t[1], e[2] - t[2]],
          a = o[0] * o[0] + o[1] * o[1] + o[2] * o[2];
        a < 1e-10 && ((o[1] = 1e-5), (a = 1e-10));
        let c = n - i,
          l = {
            t: 0,
            a: t,
            b: e,
            ba: o,
            l2: a,
            rr: c,
            a2: a - c * c,
            il2: 1 / a,
            r0: n,
            r1: i,
          },
          h = Math.max(n, i);
        return (
          (l.bb = [
            Math.min(t[0], e[0]) - h,
            Math.min(t[1], e[1]) - h,
            Math.min(t[2], e[2]) - h,
            Math.max(t[0], e[0]) + h,
            Math.max(t[1], e[1]) + h,
            Math.max(t[2], e[2]) + h,
          ]),
          this._add(l, r)
        );
      }
      ell(t, e, n = {}) {
        t = xh(t);
        let i = { t: 1, c: t, r: e, inv: null };
        n.m3
          ? (i.inv = n.m3)
          : n.rot && (i.inv = V1(n.rot[0], n.rot[1], n.rot[2]));
        let r = Math.max(e[0], e[1], e[2]);
        return (
          (i.bb = [t[0] - r, t[1] - r, t[2] - r, t[0] + r, t[1] + r, t[2] + r]),
          this._add(i, n)
        );
      }
      box(t, e, n = 0.005, i = {}) {
        t = xh(t);
        let r = { t: 2, c: t, h: e, rr: n, inv: null };
        i.m3
          ? (r.inv = i.m3)
          : i.rot && (r.inv = V1(i.rot[0], i.rot[1], i.rot[2]));
        let o = Math.hypot(e[0], e[1], e[2]);
        return (
          (r.bb = [t[0] - o, t[1] - o, t[2] - o, t[0] + o, t[1] + o, t[2] + o]),
          this._add(r, i)
        );
      }
      torus(t, e, n, i = {}) {
        t = xh(t);
        let r = { t: 3, c: t, R: e, r: n, inv: null };
        i.m3
          ? (r.inv = i.m3)
          : i.rot && (r.inv = V1(i.rot[0], i.rot[1], i.rot[2]));
        let o = e + n;
        return (
          (r.bb = [t[0] - o, t[1] - o, t[2] - o, t[0] + o, t[1] + o, t[2] + o]),
          this._add(r, i)
        );
      }
      chain(t, e, n = {}) {
        for (let i = 0; i < t.length - 1; i++)
          this.cap(t[i], t[i + 1], e[i], e[i + 1], { ...n, k: n.k ?? 0.01 });
        return this;
      }
      dist(t, e, n, i) {
        let r;
        if (t.t === 0) {
          let o = e - t.a[0],
            a = n - t.a[1],
            c = i - t.a[2],
            l = t.ba,
            h = t.l2,
            u = o * l[0] + a * l[1] + c * l[2],
            f = u - h,
            d = o * h - l[0] * u,
            p = a * h - l[1] * u,
            g = c * h - l[2] * u,
            m = d * d + p * p + g * g,
            x = u * u * h,
            v = f * f * h,
            y = Math.sign(t.rr) * t.rr * t.rr * m;
          Math.sign(f) * t.a2 * v > y
            ? (r = Math.sqrt(m + v) * t.il2 - t.r1)
            : Math.sign(u) * t.a2 * x < y
              ? (r = Math.sqrt(m + x) * t.il2 - t.r0)
              : (r = (Math.sqrt(m * t.a2 * t.il2) + u * t.rr) * t.il2 - t.r0);
        } else {
          let o = e - t.c[0],
            a = n - t.c[1],
            c = i - t.c[2];
          if (t.inv) {
            let l = t.inv,
              h = l[0] * o + l[1] * a + l[2] * c,
              u = l[3] * o + l[4] * a + l[5] * c,
              f = l[6] * o + l[7] * a + l[8] * c;
            ((o = h), (a = u), (c = f));
          }
          if (t.t === 1) {
            let l = t.r,
              h = Math.hypot(o / l[0], a / l[1], c / l[2]),
              u = Math.hypot(
                o / (l[0] * l[0]),
                a / (l[1] * l[1]),
                c / (l[2] * l[2]),
              );
            r = u > 1e-9 ? (h * (h - 1)) / u : -Math.min(l[0], l[1], l[2]);
          } else if (t.t === 3) r = Math.hypot(Math.hypot(o, c) - t.R, a) - t.r;
          else {
            let l = t.h,
              h = t.rr,
              u = Math.abs(o) - l[0] + h,
              f = Math.abs(a) - l[1] + h,
              d = Math.abs(c) - l[2] + h;
            r =
              Math.hypot(Math.max(u, 0), Math.max(f, 0), Math.max(d, 0)) +
              Math.min(Math.max(u, f, d), 0) -
              h;
          }
        }
        return (
          t.bump &&
            (r +=
              t.bump[0] *
              (FE(e * t.bump[1], n * t.bump[1], i * t.bump[1]) - 0.5) *
              2),
          r
        );
      }
      inBB(t, e, n, i, r) {
        let o = t.bb;
        return (
          e > o[0] - r &&
          n > o[1] - r &&
          i > o[2] - r &&
          e < o[3] + r &&
          n < o[4] + r &&
          i < o[5] + r
        );
      }
      field(t, e, n, i) {
        let r = Zi;
        for (let o of this.prims) {
          if (o.po || !this.inBB(o, t, e, n, i + o.k)) continue;
          let a = this.dist(o, t, e, n);
          r = o.sub ? bd(r, -a, o.k) : o.inter ? bd(r, a, o.k) : Md(r, a, o.k);
        }
        return r;
      }
      mesh(t) {
        let e = this.prims,
          n = [Zi, Zi, Zi],
          i = [-Zi, -Zi, -Zi];
        for (let v of e)
          if (!v.sub && !v.po)
            for (let y = 0; y < 3; y++)
              ((n[y] = Math.min(n[y], v.bb[y] - v.k)),
                (i[y] = Math.max(i[y], v.bb[y + 3] + v.k)));
        let r = t * 2;
        for (let v = 0; v < 3; v++) ((n[v] -= r), (i[v] += r));
        let o = Math.ceil((i[0] - n[0]) / t) + 1,
          a = Math.ceil((i[1] - n[1]) / t) + 1,
          c = Math.ceil((i[2] - n[2]) / t) + 1,
          l = o * a * c,
          h = new Float32Array(l).fill(Zi),
          u = t * 2.5,
          f = o * a;
        for (let v of e) {
          if (v.po) continue;
          let y = u + v.k + (v.bump ? v.bump[0] : 0),
            _ = Math.max(0, Math.floor((v.bb[0] - y - n[0]) / t)),
            M = Math.min(o - 1, Math.ceil((v.bb[3] + y - n[0]) / t)),
            b = Math.max(0, Math.floor((v.bb[1] - y - n[1]) / t)),
            w = Math.min(a - 1, Math.ceil((v.bb[4] + y - n[1]) / t)),
            S = Math.max(0, Math.floor((v.bb[2] - y - n[2]) / t)),
            T = Math.min(c - 1, Math.ceil((v.bb[5] + y - n[2]) / t));
          for (let E = S; E <= T; E++) {
            let C = n[2] + E * t;
            for (let R = b; R <= w; R++) {
              let I = n[1] + R * t,
                k = E * f + R * o + _;
              for (let N = _; N <= M; N++, k++) {
                let z = n[0] + N * t,
                  U = this.dist(v, z, I, C),
                  X = h[k];
                h[k] = v.sub
                  ? bd(X, -U, v.k)
                  : v.inter
                    ? bd(X, U, v.k)
                    : Md(X, U, v.k);
              }
            }
          }
        }
        let d = [],
          p = [],
          g = [new Int32Array(l), new Int32Array(l), new Int32Array(l)],
          m = new Int32Array(12),
          x = (v, y, _, M, b, w, S) => {
            let T = g[y];
            if (T[v]) return T[v] - 1;
            let E = w / (w - S),
              C = n[0] + _ * t + (y === 0 ? E * t : 0),
              R = n[1] + M * t + (y === 1 ? E * t : 0),
              I = n[2] + b * t + (y === 2 ? E * t : 0),
              k = d.length / 3;
            return (d.push(C, R, I), (T[v] = k + 1), k);
          };
        for (let v = 0; v < c - 1; v++)
          for (let y = 0; y < a - 1; y++) {
            let _ = v * f + y * o;
            for (let M = 0; M < o - 1; M++, _++) {
              let b = _ + 1,
                w = _ + o,
                S = w + 1,
                T = _ + f,
                E = T + 1,
                C = T + o,
                R = C + 1,
                I = h[_],
                k = h[b],
                N = h[S],
                z = h[w],
                U = h[T],
                X = h[E],
                H = h[R],
                O = h[C],
                V = 0;
              (I > 0 && (V |= 1),
                k > 0 && (V |= 2),
                N > 0 && (V |= 4),
                z > 0 && (V |= 8),
                U > 0 && (V |= 16),
                X > 0 && (V |= 32),
                H > 0 && (V |= 64),
                O > 0 && (V |= 128));
              let at = z2[V];
              if (!at) continue;
              (at & 1 && (m[0] = x(_, 0, M, y, v, I, k)),
                at & 2 && (m[1] = x(b, 1, M + 1, y, v, k, N)),
                at & 4 && (m[2] = x(w, 0, M, y + 1, v, z, N)),
                at & 8 && (m[3] = x(_, 1, M, y, v, I, z)),
                at & 16 && (m[4] = x(T, 0, M, y, v + 1, U, X)),
                at & 32 && (m[5] = x(E, 1, M + 1, y, v + 1, X, H)),
                at & 64 && (m[6] = x(C, 0, M, y + 1, v + 1, O, H)),
                at & 128 && (m[7] = x(T, 1, M, y, v + 1, U, O)),
                at & 256 && (m[8] = x(_, 2, M, y, v, I, U)),
                at & 512 && (m[9] = x(b, 2, M + 1, y, v, k, X)),
                at & 1024 && (m[10] = x(S, 2, M + 1, y + 1, v, N, H)),
                at & 2048 && (m[11] = x(w, 2, M, y + 1, v + 1, z, O)));
              let tt = V << 4;
              for (let wt = 0; gh[tt + wt] !== -1; wt += 3) {
                let dt = m[gh[tt + wt]],
                  Et = m[gh[tt + wt + 1]],
                  K = m[gh[tt + wt + 2]];
                dt !== Et && Et !== K && dt !== K && p.push(dt, Et, K);
              }
            }
          }
        return { pos: d, idx: p };
      }
      attributes(t, e, n, i = !0) {
        let r = this.prims,
          o = t.length / 3,
          a = i ? new Float32Array(o * 3) : null,
          c = new Float32Array(o * 3),
          l = new Float32Array(o),
          h = e.skin ? new Uint16Array(o * 4) : null,
          u = e.skin ? new Float32Array(o * 4) : null,
          f = e.boneParent || null,
          d = (y, _) => {
            if (!f) return !0;
            let M = f[y],
              b = f[_];
            return (
              M === _ ||
              b === y ||
              (M >= 0 && f[M] === _) ||
              (b >= 0 && f[b] === y)
            );
          },
          p = n * 0.5,
          g = n * 2,
          m = e.ao || 0,
          x = e.aoK ?? 1.25,
          v = new Float32Array(o).fill(1);
        for (let y = 0; y < o; y++) {
          let _ = t[y * 3],
            M = t[y * 3 + 1],
            b = t[y * 3 + 2],
            w = 1;
          if (a) {
            let V = this.field(_ + p, M, b, g) - this.field(_ - p, M, b, g),
              at = this.field(_, M + p, b, g) - this.field(_, M - p, b, g),
              tt = this.field(_, M, b + p, g) - this.field(_, M, b - p, g),
              wt = Math.hypot(V, at, tt) || 1,
              dt = V / wt,
              Et = at / wt,
              K = tt / wt;
            if (
              ((a[y * 3] = dt), (a[y * 3 + 1] = Et), (a[y * 3 + 2] = K), m > 0)
            ) {
              let it = 0,
                mt = 1,
                st = 0;
              for (let Z = 1; Z <= 5; Z++) {
                let j = (m * Z) / 5,
                  vt = this.field(_ + dt * j, M + Et * j, b + K * j, g + j);
                ((it += (Math.max(0, j - Math.min(vt, j)) / j) * mt),
                  (st += mt),
                  (mt *= 0.75));
              }
              w = Math.max(0.22, 1 - (it / st) * x);
            }
          }
          let S = Zi,
            T = Zi,
            E = null,
            C = null,
            R = null,
            I = Zi,
            k = null,
            N = 0;
          for (let V of r) {
            if (!this.inBB(V, _, M, b, g + V.k + 0.03)) continue;
            let at = this.dist(V, _, M, b);
            if (V.po) {
              let tt = Math.min(
                1,
                Math.max(0, 0.5 - at / (2 * Math.max(n, 0.002))),
              );
              tt > 0 && ((k = V), (N = tt));
              continue;
            }
            if (V.sub) {
              V.paint && -at > I - V.k * 0.6 && (R = V);
              continue;
            }
            V.inter ||
              ((I = Md(I, at, V.k)),
              at < S
                ? ((T = S), (C = E), (S = at), (E = V))
                : at < T && ((T = at), (C = V)));
          }
          if (!E) {
            ((c[y * 3] = c[y * 3 + 1] = c[y * 3 + 2] = 1), u && (u[y * 4] = 1));
            continue;
          }
          let z = Math.max(E.k, 0.004),
            U = C ? Math.min(1, Math.max(0, 0.5 + (T - S) / (2 * z))) : 1,
            X = R,
            H = X ? X.col : E.col,
            O = X ? X.col : C ? C.col : E.col;
          if (
            ((c[y * 3] = H[0] * U + O[0] * (1 - U)),
            (c[y * 3 + 1] = H[1] * U + O[1] * (1 - U)),
            (c[y * 3 + 2] = H[2] * U + O[2] * (1 - U)),
            (l[y] = X ? X.region : E.region),
            k && !X)
          ) {
            let V = N,
              at = k.col;
            ((c[y * 3] += (at[0] - c[y * 3]) * V),
              (c[y * 3 + 1] += (at[1] - c[y * 3 + 1]) * V),
              (c[y * 3 + 2] += (at[2] - c[y * 3 + 2]) * V),
              V >= 0.5 && (l[y] = k.region));
          }
          if (((v[y] = w), h)) {
            let V = null,
              at = Zi;
            if (C && C.bone !== E.bone && d(E.bone, C.bone))
              ((V = C), (at = T));
            else
              for (let dt of r) {
                if (
                  dt.sub ||
                  dt.inter ||
                  dt.po ||
                  dt.bone === E.bone ||
                  !d(E.bone, dt.bone) ||
                  !this.inBB(dt, _, M, b, g + 0.06)
                )
                  continue;
                let Et = this.dist(dt, _, M, b);
                Et < at && ((at = Et), (V = dt));
              }
            let tt = Math.max(E.k, 0.035),
              wt = V ? Math.min(1, Math.max(0, 0.5 + (at - S) / (2 * tt))) : 1;
            ((h[y * 4] = E.bone),
              (u[y * 4] = wt),
              wt < 1 && ((h[y * 4 + 1] = V.bone), (u[y * 4 + 1] = 1 - wt)));
          }
        }
        return {
          normal: a,
          color: c,
          ao: v,
          aMat: l,
          skinIndex: h,
          skinWeight: u,
        };
      }
      borderLocks(t, e, n, i) {
        let r = t.length / 3,
          o = new Uint8Array(r);
        for (let a = 0; a < e.length; a += 3) {
          let c = e[a],
            l = e[a + 1],
            h = e[a + 2],
            u = i[c] !== i[l] || i[l] !== i[h];
          if (!u)
            for (let f = 0; f < 3 && !u; f++) {
              let d = n[c * 3 + f],
                p = n[l * 3 + f],
                g = n[h * 3 + f],
                m = Math.max(d, p, g),
                x = Math.min(d, p, g);
              m - x > 0.05 + m * 0.15 && (u = !0);
            }
          u && ((o[c] = 1), (o[l] = 1), (o[h] = 1));
        }
        return o;
      }
      build(t = {}) {
        let e = t.voxel ?? 0.01,
          { pos: n, idx: i } = this.mesh(e),
          r = (u, f, d) => {
            if (!f.length) return;
            let p = 0;
            for (let g = 0; g < Math.min(f.length, 3e3); g += 3) {
              let m = f[g] * 3,
                x = f[g + 1] * 3,
                v = f[g + 2] * 3,
                y = u[x] - u[m],
                _ = u[x + 1] - u[m + 1],
                M = u[x + 2] - u[m + 2],
                b = u[v] - u[m],
                w = u[v + 1] - u[m + 1],
                S = u[v + 2] - u[m + 2],
                T = _ * S - M * w,
                E = M * b - y * S,
                C = y * w - _ * b;
              p += T * d[m] + E * d[m + 1] + C * d[m + 2] > 0 ? 1 : -1;
            }
            if (p < 0)
              for (let g = 0; g < f.length; g += 3) {
                let m = f[g + 1];
                ((f[g + 1] = f[g + 2]), (f[g + 2] = m));
              }
          },
          o = (u, f, d) => {
            let p = u.length / 3,
              g = p > 65535 ? Uint32Array.from(f) : Uint16Array.from(f);
            r(u, g, d.normal);
            let m = new Float32Array(d.color);
            for (let x = 0; x < p; x++) {
              let v = d.ao[x];
              ((m[x * 3] *= v), (m[x * 3 + 1] *= v), (m[x * 3 + 2] *= v));
            }
            return {
              position: u instanceof Float32Array ? u : new Float32Array(u),
              normal: d.normal,
              color: m,
              aMat: d.aMat,
              skinIndex: d.skinIndex,
              skinWeight: d.skinWeight,
              index: g,
              tris: f.length / 3,
            };
          };
        if (!t.lods) return o(new Float32Array(n), i, this.attributes(n, t, e));
        let a = [],
          c = new Float32Array(n),
          l = Uint32Array.from(i),
          h = this.attributes(c, { skin: !1 }, e, !1);
        for (let u = 0; u < t.lods.length; u++) {
          let f = t.lods[u],
            d = u < 2 ? this.borderLocks(c, l, h.color, h.aMat) : null,
            p = B2(c, l, { maxErr: f, lock: d }),
            g = this.attributes(p.position, t, e);
          (a.push(o(p.position, p.index, g)),
            (c = p.position),
            (l = p.index),
            (h = g));
        }
        return { lods: a };
      }
    };
  var ae = (s, t) => [s[0] + t[0], s[1] + t[1], s[2] + t[2]],
    Bo = (s, t, e) => [
      s[0] + (t[0] - s[0]) * e,
      s[1] + (t[1] - s[1]) * e,
      s[2] + (t[2] - s[2]) * e,
    ],
    Ns = (s, t) => [s[0] * t, s[1] * t, s[2] * t],
    G1 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  function UE(s, t, e) {
    let n = Math.cos(s),
      i = Math.sin(s),
      r = Math.cos(t),
      o = Math.sin(t),
      a = Math.cos(e),
      c = Math.sin(e),
      l = n * a,
      h = n * c,
      u = i * a,
      f = i * c;
    return [
      r * a,
      -r * c,
      o,
      h + u * o,
      l - f * o,
      -i * r,
      f - l * o,
      u + h * o,
      n * r,
    ];
  }
  function OE(s, t) {
    let e = new Array(9);
    for (let n = 0; n < 3; n++)
      for (let i = 0; i < 3; i++)
        e[n * 3 + i] =
          s[n * 3] * t[i] + s[n * 3 + 1] * t[3 + i] + s[n * 3 + 2] * t[6 + i];
    return e;
  }
  var vh = (s, t) => [
      s[0] * t[0] + s[1] * t[1] + s[2] * t[2],
      s[3] * t[0] + s[4] * t[1] + s[5] * t[2],
      s[6] * t[0] + s[7] * t[1] + s[8] * t[2],
    ],
    zE = (s) => [s[0], s[3], s[6], s[1], s[4], s[7], s[2], s[5], s[8]];
  function _c() {
    let s = [],
      t = {},
      e = {},
      n = {};
    return {
      bones: s,
      idx: t,
      world: e,
      rotW: n,
      add: (a, c, l, h, u, f) => {
        let d = f ? UE(f[0], f[1], f[2]) : G1,
          p = c == null ? -1 : t[c];
        return (
          s.push({
            name: a,
            parent: p,
            pos: [l, h, u],
            rot: f ? f.slice() : null,
          }),
          (t[a] = s.length - 1),
          p < 0
            ? ((e[a] = [l, h, u]), (n[a] = d))
            : ((e[a] = ae(e[c], vh(n[c], [l, h, u]))), (n[a] = OE(n[c], d))),
          a
        );
      },
      pt: (a, c) => ae(e[a], vh(n[a], c)),
      inv: (a) => zE(n[a]),
    };
  }
  function or(s) {
    let t = { region: s.plastic ? 22 : s.muscle ? 25 : 20, col: s.color },
      e = (n) => (n ? { region: 21, col: n } : t);
    return {
      skin: t,
      top: e(s.top),
      bottom: e(s.bottom),
      shoe: s.shoe
        ? { region: 22, col: s.shoeCol || [0.05, 0.045, 0.04] }
        : null,
    };
  }
  var H2 = [0.2, 0.2, 0.21];
  function BE(s) {
    let t = s.height,
      e = t * (s.leg ?? 0.47),
      n = t * 0.038,
      i = e * 0.52,
      r = e * 0.48 - n,
      o = t * (s.torso ?? 0.3),
      a = t * (s.neck ?? 0.055),
      c = t * (s.head ?? 0.065),
      l = t * (s.arm ?? 0.43),
      h = l * 0.47,
      u = l * 0.53,
      f = s.thick ?? 1,
      d = s.gaunt ?? 0,
      p = s.fat ?? 0,
      g = Math.max(
        0.097 * t * f * (1 - d * 0.12),
        0.084 * t * f * (1 + p * 0.45),
      ),
      m = Math.max(
        t * (s.shoulder ?? 0.12),
        g + 0.041 * t * f * (1 - d * 0.38) * 0.6,
      ),
      x = t * (s.hips ?? 0.07),
      v = s.aPose ?? 0.42 + Math.max(0, f - 1) * 0.25 + p * 0.3,
      y = _c();
    (y.add("root", null, 0, 0, 0),
      y.add("hips", "root", 0, e, 0),
      y.add("spine", "hips", 0, 0.02 * t, 0),
      y.add("chest", "spine", 0, o, 0),
      y.add("neck", "chest", 0, 0, 0),
      y.add("head", "neck", 0, a, 0));
    let _ = (b, w, S, T) => {
        (y.add(b + ".root", "chest", w * m, -0.02 * t + S, 0),
          y.add(b + ".up", b + ".root", 0, 0, 0, [0, 0, w * T]),
          y.add(b + ".el", b + ".up", 0, -h, 0),
          y.add(b + ".hand", b + ".el", 0, -u, 0));
      },
      M = s.fourArms ? v - 0.15 : v;
    if (
      (_("armL", -1, 0, M),
      _("armR", 1, 0, M),
      s.fourArms &&
        (_("armL2", -1, -t * 0.1, v + 0.45), _("armR2", 1, -t * 0.1, v + 0.45)),
      !s.noLegs)
    )
      for (let [b, w] of [
        ["legL", -1],
        ["legR", 1],
      ])
        (y.add(b + ".th", "hips", w * x, 0, 0, [0, 0, w * 0.035]),
          y.add(b + ".kn", b + ".th", 0, -i, 0),
          y.add(b + ".an", b + ".kn", 0, -r, 0, [0, 0, -w * 0.035]));
    return {
      R: y,
      dims: {
        H: t,
        legL: e,
        thL: i,
        shL: r,
        footH: n,
        torsoL: o,
        neckL: a,
        headR: c,
        upL: h,
        foL: u,
        sw: m,
        hw: x,
        AP: v,
      },
    };
  }
  function HE(s, t, e = {}) {
    let { R: n, dims: i } = t,
      r = n.world,
      o = n.idx,
      { H: a, torsoL: c, upL: l, foL: h, thL: u, shL: f, hw: d, footH: p } = i,
      g = new En(),
      m = s.thick ?? 1,
      x = s.gaunt ?? 0,
      v = s.fat ?? 0,
      y = a / 1.8,
      _ = (O) => O * y,
      M = or(s),
      b = M.skin,
      w = e.suit ? { region: 23, col: e.suit } : null,
      S = w || M.top,
      T = w || M.bottom,
      E = !w && !s.top,
      C = w
        ? [0.0055 * y, 13 / y]
        : s.lumpy
          ? [0.008 * y, 15 / y]
          : x > 0.3
            ? [0.0022 * y, 38 / y]
            : [0.0012 * y, 34 / y],
      R = r.hips[1],
      I = r.chest[1],
      k = o.hips,
      N = o.spine,
      z = o.chest,
      U = (O, V, at, tt) => {
        s.jointBalls &&
          g.torus(O, V, 0.0045 * a, {
            sub: !0,
            ...b,
            paint: !1,
            bone: tt,
            k: _(0.0015),
            m3: at,
          });
      },
      X = d * 1.32 + 0.025 * a * (m - 1);
    if (
      (g.ell(
        [0, R + 0.01 * a, -0.005 * a],
        [X, 0.064 * a * Math.sqrt(m), 0.075 * a * m * (1 + v * 0.3)],
        { ...T, bone: k, k: _(0.03), bump: C },
      ),
      !s.noLegs)
    )
      for (let O of [-1, 1])
        g.ell(
          [O * d * 0.62, R - 0.012 * a, -0.04 * a * m],
          [
            0.05 * a * m * (1 - x * 0.3),
            0.056 * a,
            0.045 * a * m * (1 - x * 0.3),
          ],
          { ...T, bone: k, k: _(0.03), bump: C },
        );
    if (
      (g.cap(
        [0, R + 0.03 * a, 0.004 * a],
        [0, I - 0.42 * c, 0.01 * a * (1 + v)],
        0.074 * a * m * (1 - x * 0.35) * (1 + v * 0.9),
        0.084 * a * m * (1 + v * 0.45),
        { ...S, bone: N, k: _(0.04), bump: C },
      ),
      v > 0 &&
        g.ell(
          [0, R + 0.11 * a, 0.05 * a * m],
          [
            0.1 * a * m * (0.6 + v),
            0.1 * a * (0.5 + v * 0.5),
            0.07 * a * m * v,
          ],
          { ...S, bone: N, k: _(0.05), bump: C },
        ),
      g.ell(
        [0, I - 0.32 * c, 0.004 * a],
        [
          0.097 * a * m * (1 - x * 0.12),
          0.14 * a,
          0.07 * a * m * (1 + v * 0.2),
        ],
        { ...S, bone: N, k: _(0.035), bump: C },
      ),
      x > 0.3 && E)
    ) {
      for (let O = 0; O < 6; O++)
        for (let V of [-1, 1]) {
          let at = I - 0.13 * c - O * 0.085 * c,
            tt = 0.0062 * a;
          g.chain(
            [
              [V * 0.02 * a, at, 0.071 * a * m],
              [V * 0.058 * a, at - 0.012 * a, 0.06 * a * m],
              [V * 0.086 * a, at - 0.03 * a, 0.03 * a * m],
              [V * 0.094 * a, at - 0.042 * a, -0.01 * a],
            ],
            [tt, tt, tt * 0.9, tt * 0.7],
            { ...b, bone: N, k: _(0.008) },
          );
        }
      g.cap(
        [0, I - 0.08 * c, 0.074 * a * m],
        [0, I - 0.55 * c, 0.07 * a * m],
        0.009 * a,
        0.007 * a,
        { ...b, bone: N, k: _(0.01) },
      );
      for (let O = 0; O < 9; O++)
        g.ell(
          [
            0,
            I + 0.02 * a - O * 0.1 * c,
            -0.067 * a * m - (O > 6 ? 0.008 * a : 0),
          ],
          [0.012 * a, 0.008 * a, 0.012 * a],
          { ...b, bone: O < 3 ? z : N, k: _(0.01) },
        );
      g.ell(
        [0, I - 0.62 * c, 0.075 * a * m],
        [0.07 * a * m, 0.05 * a, 0.03 * a],
        { sub: !0, ...b, paint: !1, bone: N, k: _(0.03) },
      );
    } else if (E && !s.plastic)
      for (let O of [-1, 1])
        g.ell(
          [O * 0.045 * a, I - 0.1 * c, 0.05 * a * m],
          [0.045 * a * m, 0.035 * a, 0.03 * a * m],
          { ...b, bone: z, k: _(0.03) },
        );
    for (let O of [-1, 1])
      g.ell(
        [O * 0.055 * a, I - 0.12 * c, -0.055 * a * m],
        [0.045 * a * m, 0.06 * a, 0.022 * a * m],
        { ...S, bone: z, k: _(0.03) },
      );
    for (let O of [-1, 1]) {
      let V = r[(O < 0 ? "armL" : "armR") + ".root"];
      (g.cap(
        [O * 0.02 * a, I + 0.012 * a, -0.012 * a],
        [V[0] * 0.92, V[1] + 0.01 * a, -0.008 * a],
        0.036 * a * m * (1 - x * 0.3),
        0.04 * a * m * (1 - x * 0.2),
        { ...S, bone: z, k: _(0.03) },
      ),
        x > 0.25 &&
          !w &&
          g.cap(
            [O * 0.012 * a, I - 0.016 * a, 0.05 * a * m],
            [V[0] * 0.86, V[1] + 0.006 * a, 0.026 * a * m],
            0.009 * a,
            0.008 * a,
            { ...b, bone: z, k: _(0.008) },
          ));
    }
    if (
      (g.cap(
        [0, I - 0.01 * a, -0.006 * a],
        [0, r.head[1] + 0.02 * a, -0.004 * a],
        0.033 * a * m * (1 - x * 0.25),
        0.028 * a * m * (1 - x * 0.2),
        { ...(w || b), bone: o.neck, k: _(0.025), bump: C },
      ),
      x > 0.3 && !w)
    )
      for (let O of [-1, 1])
        g.cap(
          [O * 0.028 * a, r.head[1] + 0.01 * a, -0.006 * a],
          [O * 0.012 * a, I - 0.006 * a, 0.032 * a],
          0.008 * a,
          0.007 * a,
          { ...b, bone: o.neck, k: _(0.008) },
        );
    (U([0, I + 0.012 * a, -0.004 * a], 0.03 * a * m, G1, o.neck),
      s.jointBalls && U([0, R + 0.075 * a, 0.004 * a], 0.075 * a * m, G1, N));
    let H = [
      ["armL", -1],
      ["armR", 1],
    ];
    s.fourArms && H.push(["armL2", -1], ["armR2", 1]);
    for (let [O, V] of H) {
      let at = r[O + ".root"],
        tt = r[O + ".el"],
        wt = r[O + ".hand"],
        dt = o[O + ".up"],
        Et = o[O + ".el"],
        K = n.inv(O + ".up"),
        it = n.inv(O + ".el"),
        mt = (G) => n.pt(O + ".up", G),
        st = (G) => n.pt(O + ".el", G),
        Z = w || (s.shortSleeve ? (s.top ? S : b) : S),
        j = w || (s.shortSleeve ? b : S),
        vt = m * (1 - x * 0.3);
      (g.ell(
        mt([V * 0.004 * a, -0.012 * a, 0]),
        [0.047 * a * vt, 0.056 * a * m, 0.047 * a * vt],
        { ...Z, bone: dt, k: _(0.025), bump: C, m3: K },
      ),
        g.cap(
          mt([0, -0.02 * a, 0]),
          tt,
          0.041 * a * m * (1 - x * 0.38),
          0.03 * a * m * (1 - x * 0.3),
          { ...Z, bone: dt, k: _(0.02), bump: C },
        ),
        x < 0.6 &&
          (g.ell(
            mt([0, -l * 0.47, 0.012 * a * m]),
            [0.033 * a * m * (1 - x), 0.075 * a, 0.032 * a * m * (1 - x)],
            { ...Z, bone: dt, k: _(0.02), m3: K },
          ),
          g.ell(
            mt([0, -l * 0.4, -0.014 * a * m]),
            [0.03 * a * m * (1 - x), 0.08 * a, 0.03 * a * m * (1 - x)],
            { ...Z, bone: dt, k: _(0.02), m3: K },
          )),
        g.ell(
          tt,
          [0.029 * a * m * (1 - x * 0.2), 0.03 * a * m, 0.029 * a * m],
          { ...j, bone: Et, k: _(0.015) },
        ));
      let Y = 0.021 * a * m * (1 - x * 0.15);
      (g.cap(tt, wt, 0.033 * a * m * (1 - x * 0.32), Y, {
        ...j,
        bone: Et,
        k: _(0.02),
        bump: C,
      }),
        x < 0.6 &&
          g.ell(
            st([0, -h * 0.27, 0.004 * a]),
            [
              0.031 * a * m * (1 - x * 0.6),
              0.065 * a,
              0.027 * a * m * (1 - x * 0.6),
            ],
            { ...j, bone: Et, k: _(0.02), m3: it },
          ),
        w &&
          g.cap(
            st([0, -h * 0.83, 0]),
            st([0, -h * 0.95, 0]),
            Y * 1.22,
            Y * 1.22,
            { region: 21, col: H2, bone: Et, k: _(0.004) },
          ),
        s.shortSleeve &&
          !w &&
          s.top &&
          g.torus(mt([0, -l * 0.55, 0]), 0.034 * a * m, 0.006 * a, {
            ...S,
            bone: dt,
            k: _(0.006),
            m3: K,
          }),
        U(mt([0, -0.02 * a, 0]), 0.043 * a * m, K, dt),
        U(tt, 0.03 * a * m, it, Et),
        U(wt, Y * 1.02, it, Et));
    }
    if (s.noLegs)
      g.cap([0, R, 0], [0, R - 0.5 * a, -0.12 * a], 0.08 * a * m, 0.008 * a, {
        ...T,
        bone: k,
        k: _(0.05),
        bump: [0.02 * y, 6],
      });
    else
      for (let [O, V] of [
        ["legL", -1],
        ["legR", 1],
      ]) {
        let at = r[O + ".kn"],
          tt = r[O + ".an"],
          wt = o[O + ".th"],
          dt = o[O + ".kn"],
          Et = o[O + ".an"],
          K = n.inv(O + ".th"),
          it = n.inv(O + ".kn"),
          mt = (Y) => n.pt(O + ".th", Y),
          st = (Y) => n.pt(O + ".kn", Y),
          Z = (Y) => n.pt(O + ".an", Y),
          j = Math.min(
            0.062 * a * m * (1 - x * 0.38) * (1 + v * 0.35),
            d - 0.013 * a,
          );
        (g.cap(mt([0, 0.025 * a, 0]), at, j, 0.039 * a * m * (1 - x * 0.25), {
          ...T,
          bone: wt,
          k: _(0.03),
          bump: C,
        }),
          x < 0.6 &&
            g.ell(
              mt([V * 0.004 * a, -u * 0.42, 0.014 * a * m]),
              [
                Math.min(0.05 * a * m * (1 - x * 0.8), j * 0.85),
                0.11 * a,
                0.048 * a * m * (1 - x * 0.8),
              ],
              { ...T, bone: wt, k: _(0.03), m3: K },
            ),
          g.ell(
            st([0, 0.004 * a, 0.016 * a * m]),
            [0.028 * a * m, 0.03 * a, 0.022 * a * m],
            { ...T, bone: dt, k: _(0.015) },
          ));
        let vt = s.skirt || s.shorts ? b : T;
        if (
          (g.cap(
            at,
            tt,
            0.04 * a * m * (1 - x * 0.32),
            0.024 * a * m * (1 - x * 0.1),
            { ...vt, bone: dt, k: _(0.02), bump: C },
          ),
          x < 0.7 &&
            g.ell(
              st([0, -f * 0.3, -0.013 * a * m]),
              [
                0.034 * a * m * (1 - x * 0.7),
                0.08 * a,
                0.036 * a * m * (1 - x * 0.7),
              ],
              { ...vt, bone: dt, k: _(0.02), m3: it },
            ),
          w &&
            g.cap(
              st([0, -f * 0.78, 0]),
              st([0, -f * 0.9, 0]),
              0.032 * a,
              0.031 * a,
              { region: 21, col: H2, bone: dt, k: _(0.004) },
            ),
          U(mt([0, 0, 0]), j * 1.02, K, wt),
          U(at, 0.04 * a * m, it, dt),
          U(tt, 0.025 * a * m, it, dt),
          M.shoe || e.boots)
        ) {
          let Y = e.boots ? { region: 22, col: e.boots } : M.shoe;
          (g.box(
            Z([0, -p * 0.48, 0.034 * a]),
            [0.03 * a, p * 0.55, 0.074 * a],
            0.016 * a,
            { ...Y, bone: Et, k: _(0.02) },
          ),
            g.ell(
              Z([0, -p * 0.2, -0.01 * a]),
              [0.029 * a, p * 0.85, 0.036 * a],
              { ...Y, bone: Et, k: _(0.02) },
            ),
            e.boots
              ? (g.cap(
                  Z([0, -p * 0.3, 0]),
                  Z([0, 0.08 * a, 0]),
                  0.034 * a,
                  0.033 * a,
                  { ...Y, bone: Et, k: _(0.02) },
                ),
                g.box(
                  Z([0, -p * 0.93, 0.034 * a]),
                  [0.032 * a, p * 0.1, 0.077 * a],
                  0.004 * a,
                  {
                    region: 22,
                    col: [0.012, 0.012, 0.012],
                    bone: Et,
                    k: _(0.006),
                  },
                ))
              : g.box(
                  Z([0, -p * 0.92, 0.034 * a]),
                  [0.031 * a, p * 0.1, 0.076 * a],
                  0.004 * a,
                  { region: 22, col: Ns(Y.col, 0.6), bone: Et, k: _(0.004) },
                ));
        } else {
          (g.ell(
            Z([0, -p * 0.45, -0.018 * a]),
            [0.022 * a, p * 0.62, 0.03 * a],
            { ...b, bone: Et, k: _(0.02) },
          ),
            g.cap(
              Z([0, -p * 0.48, -0.004 * a]),
              Z([0, -p * 0.72, 0.074 * a]),
              0.024 * a * (1 - x * 0.2),
              0.018 * a,
              { ...b, bone: Et, k: _(0.016) },
            ));
          let Y = V < 0 ? 4 : 0;
          for (let G = 0; G < 5; G++) {
            let ot = Math.abs(G - Y);
            (g.cap(
              Z([(G - 2) * 0.0095 * a, -p * 0.8, 0.08 * a]),
              Z([(G - 2) * 0.0105 * a, -p * 0.88, 0.1 * a - ot * 0.0045 * a]),
              0.0062 * a * (G === Y ? 1.35 : 1),
              0.005 * a * (G === Y ? 1.2 : 1),
              { ...b, bone: Et, k: _(0.004) },
            ),
              s.claw &&
                g.cap(
                  Z([
                    (G - 2) * 0.0105 * a,
                    -p * 0.88,
                    0.1 * a - ot * 0.0045 * a,
                  ]),
                  Z([
                    (G - 2) * 0.011 * a,
                    -p * 0.98,
                    0.115 * a - ot * 0.0045 * a,
                  ]),
                  0.004 * a,
                  8e-4 * a,
                  { region: 26, col: [0.3, 0.27, 0.2], bone: Et, k: _(0.002) },
                ));
          }
        }
      }
    if (
      (s.skirt &&
        (g.cap(
          [0, R + 0.07 * a, 0],
          [0, R - 0.17 * a, 0.005 * a],
          0.095 * a * m,
          0.15 * a * m,
          { ...S, bone: k, k: _(0.02), bump: [0.006 * y, 14] },
        ),
        g.torus([0, R - 0.17 * a, 0.005 * a], 0.145 * a * m, 0.006 * a, {
          ...S,
          bone: k,
          k: _(0.008),
        })),
      s.apron)
    ) {
      g.box(
        [0, R + 0.02 * a, 0.1 * a * m * (1 + v)],
        [0.085 * a * m * (1 + v * 0.3), 0.2 * a, 0.075 * a * m * (1 + v)],
        0.02 * a,
        { region: 21, col: s.apron, paintOnly: !0 },
      );
      for (let O = 0; O < 5; O++)
        g.ell(
          [
            (((O * 0.37) % 1) - 0.5) * 0.12 * a * m,
            R + (0.1 - O * 0.06) * a,
            0.12 * a * m * (1 + v),
          ],
          [0.03 * a, 0.045 * a, 0.08 * a * m],
          { region: 21, col: [0.16, 0.02, 0.015], paintOnly: !0 },
        );
    }
    if (s.stains)
      for (let O = 0; O < s.stains; O++) {
        let V = O * 2.4,
          at = R + (0.05 + ((O * 0.618) % 1) * 0.35) * a;
        g.ell(
          [Math.sin(V) * 0.1 * a * m, at, Math.cos(V) * 0.1 * a * m],
          [0.035 * a, 0.05 * a, 0.035 * a],
          { region: 21, col: s.stainCol || [0.14, 0.03, 0.02], paintOnly: !0 },
        );
      }
    if (e.tank) {
      (g.cap(
        [0, I - 0.44 * c, -0.11 * a],
        [0, I + 0.025 * a, -0.11 * a],
        0.055 * a,
        0.055 * a,
        { region: 33, col: e.tank, bone: N, k: _(0.006) },
      ),
        g.cap(
          [0, I + 0.025 * a, -0.11 * a],
          [0, I + 0.06 * a, -0.11 * a],
          0.03 * a,
          0.016 * a,
          { region: 6, col: [0.5, 0.5, 0.52], bone: N, k: _(0.004) },
        ),
        g.box(
          [0, I - 0.2 * c, -0.072 * a],
          [0.062 * a, 0.15 * a, 0.012 * a],
          0.008 * a,
          { region: 28, col: [0.05, 0.05, 0.05], bone: N, k: _(0.01) },
        ));
      for (let O of [-1, 1])
        g.chain(
          [
            [O * 0.06 * a, I + 0.012 * a, -0.06 * a],
            [O * 0.07 * a, I + 0.016 * a, 0.03 * a],
            [O * 0.066 * a, I - 0.35 * c, 0.087 * a * m],
            [O * 0.07 * a, R + 0.04 * a, 0.064 * a],
          ],
          [0.011 * a, 0.011 * a, 0.011 * a, 0.011 * a],
          { region: 21, col: [0.06, 0.06, 0.065], bone: N, k: _(0.004) },
        );
      (g.cap(
        [-0.08 * a, R + 0.045 * a, 0.06 * a * m],
        [0.08 * a, R + 0.045 * a, 0.06 * a * m],
        0.012 * a,
        0.012 * a,
        { region: 21, col: [0.06, 0.06, 0.065], bone: N, k: _(0.004) },
      ),
        g.chain(
          [
            [0.02 * a, I + 0.04 * a, -0.1 * a],
            [0.07 * a, I + 0.03 * a, -0.02 * a],
            [0.06 * a, I - 0.05 * a, 0.08 * a * m],
          ],
          [0.008 * a, 0.008 * a, 0.008 * a],
          { region: 28, col: [0.03, 0.03, 0.035], bone: z, k: _(0.004) },
        ));
    }
    return g;
  }
  function W2(s, t, e, n) {
    let i = new En(),
      r = s.thick ?? 1,
      o = s.gaunt ?? 0,
      a = t / 1.8,
      c = (m) => m * a,
      l = e.glove ? { region: 22, col: e.glove } : or(s).skin,
      h = (s.handScale ?? 1) * (e.glove ? 1.1 : 1),
      u = a * h,
      f = (e.glove ? 0.025 : 0.021) * t * r * (1 - o * 0.15);
    (i.cap([0, 0.05 * t, 0], [0, -0.012 * u, 0], f * 0.88, f * 0.92, {
      ...l,
      k: c(0.006),
    }),
      e.glove &&
        i.cap([0, 0.05 * t, 0], [0, 0.004 * t, 0], f * 1.3, f * 1.18, {
          ...l,
          k: c(0.004),
        }));
    let d = [0, -0.045 * u, 0.004 * u];
    (i.box(d, [0.013 * u * r, 0.042 * u, 0.036 * u], 0.011 * u, {
      ...l,
      k: c(0.012),
    }),
      i.ell(ae(d, [n * 0.006 * u, 0, 0]), [0.01 * u, 0.035 * u, 0.03 * u], {
        ...l,
        k: c(0.01),
      }));
    let p = t * (s.fingers ?? 0.055) * (e.glove ? 0.9 : 1),
      g = 0.0082 * u * (1 - o * 0.25) * (e.glove ? 1.25 : 1);
    return (
      [0.026, 0.009, -0.008, -0.025].forEach((m, x) => {
        let v = p * [0.92, 1, 0.95, 0.78][x],
          y = ae(d, [0, -0.04 * u, m * u]),
          _ = -n * (s.claw ? 0.012 : 0.006) * u,
          M = ae(y, [_ * 0.3, -v * 0.45, 0]),
          b = ae(M, [_, -v * 0.32, 0]),
          w = ae(b, [_ * 1.6, -v * 0.23, -m * u * 0.05]);
        (i.chain(
          [y, M, b, w],
          [g * 1.05, g, g * 0.9, g * (s.claw ? 0.4 : 0.8)],
          { ...l, k: c(0.005) },
        ),
          o > 0.3 &&
            !e.glove &&
            (i.ell(M, [g * 1.15, g * 1.2, g * 1.15], { ...l, k: c(0.003) }),
            i.ell(b, [g * 1.08, g * 1.1, g * 1.08], { ...l, k: c(0.003) })),
          s.claw
            ? i.cap(w, ae(w, [_ * 2, -0.022 * u, 0]), g * 0.5, 0.001, {
                region: 26,
                col: [0.32, 0.29, 0.22],
                k: c(0.002),
              })
            : e.glove ||
              i.ell(
                ae(w, [-n * g * 0.45, g * 0.2, 0]),
                [g * 0.35, g * 0.7, g * 0.6],
                { region: 26, col: Ns(s.color, 1.25), k: c(0.002) },
              ));
      }),
      i.chain(
        [
          ae(d, [-n * 0.006 * u, 0.02 * u, 0.03 * u]),
          ae(d, [-n * 0.016 * u, -0.022 * u, 0.05 * u]),
          ae(d, [-n * 0.02 * u, -0.055 * u, 0.052 * u]),
        ],
        [g * 1.3, g * 1.1, g * 0.9],
        { ...l, k: c(0.008) },
      ),
      i
    );
  }
  function Sd(s, t, e = {}) {
    let n = s.headScale || [1, 1.18, 1.05],
      i = new En(),
      r = e.origin || [0, 0, 0],
      o = (p, g, m) => [r[0] + p * t, r[1] + g * t, r[2] + m * t],
      a = s.gaunt ?? 0,
      c = or(s).skin,
      l = t * 0.15,
      h = s.lumpy
        ? [0.03 * t, 1.6 / t]
        : a > 0.3
          ? [0.012 * t, 4.5 / t]
          : [0.005 * t, 5 / t];
    if (e.hood) {
      let p = { region: 23, col: e.hood };
      (i.ell(
        o(0, 1, -0.06),
        [1.06, 1.24, 1.13].map((g) => g * t),
        { ...p, k: l, bump: [0.03 * t, 2.4 / t] },
      ),
        i.cap(o(0, -0.3, -0.1), o(0, 0.5, -0.05), 0.82 * t, 0.92 * t, {
          ...p,
          k: l * 2,
          bump: [0.03 * t, 3 / t],
        }),
        i.ell(o(0, 1.02, 0.6), [0.86 * t, 0.7 * t, 0.52 * t], {
          region: 28,
          col: [0.06, 0.06, 0.065],
          k: l * 0.2,
        }),
        i.ell(o(0, 1.02, 0.64), [0.77 * t, 0.61 * t, 0.5 * t], {
          region: 24,
          col: [0.02, 0.025, 0.03],
          k: l * 0.1,
        }),
        i.cap(o(0, 0.42, 0.86), o(0, 0.38, 1.14), 0.3 * t, 0.25 * t, {
          region: 28,
          col: [0.05, 0.05, 0.055],
          k: l * 0.4,
        }));
      for (let g = 0; g < 4; g++)
        i.torus(o(0, 0.4, 0.93 + g * 0.05), 0.27 * t, 0.02 * t, {
          region: 28,
          col: [0.035, 0.035, 0.04],
          k: l * 0.1,
          rot: [Math.PI / 2, 0, 0],
        });
      for (let g of [-1, 1])
        (i.cap(
          o(g * 0.42, 0.33, 0.82),
          o(g * 0.74, 0.22, 1.06),
          0.23 * t,
          0.23 * t,
          { region: 33, col: [0.08, 0.08, 0.085], k: l * 0.2 },
        ),
          i.cap(
            o(g * 0.74, 0.22, 1.06),
            o(g * 0.78, 0.2, 1.1),
            0.18 * t,
            0.18 * t,
            { region: 28, col: [0.03, 0.03, 0.03], k: l * 0.1 },
          ));
      return (
        i.ell(o(0, 2.12, -0.05), [0.18 * t, 0.06 * t, 0.18 * t], {
          region: 28,
          col: [0.08, 0.08, 0.08],
          k: l * 0.3,
        }),
        i
      );
    }
    let u = s.plastic ? { region: 22, col: s.color } : c;
    if (
      (i.ell(
        o(0, 1.08, -0.06),
        [0.9 * n[0] * t, 1.08 * n[1] * t, 1 * n[2] * t],
        { ...u, k: l, bump: h },
      ),
      i.ell(o(0, 0.78, 0.36), [0.68 * n[0] * t, 0.72 * t, 0.62 * t], {
        ...u,
        k: l * 1.6,
      }),
      s.plastic)
    ) {
      (i.cap(o(0, 1, 0.9), o(0, 0.8, 1), 0.08 * t, 0.1 * t, { ...u, k: l }),
        i.cap(o(-0.45, 1.24, 0.8), o(0.45, 1.24, 0.8), 0.09 * t, 0.09 * t, {
          ...u,
          k: l * 0.9,
        }),
        i.ell(o(0, 0.32, 0.62), [0.3 * t, 0.22 * t, 0.28 * t], { ...u, k: l }));
      for (let p of [-1, 1])
        i.ell(o(p * 0.34, 1.04, 0.86), [0.17 * t, 0.1 * t, 0.1 * t], {
          sub: !0,
          ...u,
          paint: !1,
          k: l * 0.6,
        });
      return (
        e.noNeck ||
          i.cap(o(0, -0.3, -0.1), o(0, 0.4, -0.05), 0.42 * t, 0.5 * t, {
            ...u,
            k: l * 2,
          }),
        i
      );
    }
    let f = s.gape ?? 0.15;
    i.cap(o(-0.55, 1.28, 0.78), o(0.55, 1.28, 0.78), 0.13 * t, 0.13 * t, {
      ...c,
      k: l * 0.8,
    });
    for (let p of [-1, 1])
      i.ell(o(p * 0.55, 0.86, 0.66), [0.24 * t, 0.15 * t, 0.22 * t], {
        ...c,
        k: l * 0.7,
      });
    let d = 0.16 - f * 0.9;
    for (let p of [-1, 1])
      i.cap(
        o(p * 0.6, 0.62, 0.12),
        o(p * 0.18, d + 0.05, 0.72),
        0.17 * t * (1 - a * 0.3),
        0.15 * t,
        { ...c, k: l * 0.9 },
      );
    if (
      (i.ell(o(0, d, 0.76), [0.22 * t, 0.17 * t, 0.17 * t], {
        ...c,
        k: l * 0.8,
      }),
      a > 0.3)
    ) {
      for (let p of [-1, 1])
        i.ell(o(p * 0.48, 0.62, 0.72), [0.2 * t, 0.18 * t, 0.14 * t], {
          sub: !0,
          ...c,
          paint: !1,
          k: l * 1.2,
        });
      for (let p of [-1, 1])
        i.ell(o(p * 0.84, 1.18, 0.38), [0.12 * t, 0.2 * t, 0.22 * t], {
          sub: !0,
          ...c,
          paint: !1,
          k: l * 1.2,
        });
    }
    if (s.noNose)
      i.ell(o(0, 0.88, 1), [0.1 * t, 0.16 * t, 0.14 * t], {
        sub: !0,
        region: 25,
        col: [0.06, 0.01, 0.01],
        k: l * 0.3,
      });
    else {
      i.cap(o(0, 1.1, 0.92), o(0, 0.82, 1.1), 0.07 * t, 0.1 * t, {
        ...c,
        k: l * 0.6,
      });
      for (let p of [-1, 1])
        i.ell(o(p * 0.11, 0.8, 1), [0.07 * t, 0.06 * t, 0.07 * t], {
          ...c,
          k: l * 0.4,
        });
      for (let p of [-1, 1])
        i.ell(o(p * 0.06, 0.75, 1.07), [0.035 * t, 0.028 * t, 0.035 * t], {
          sub: !0,
          region: 25,
          col: [0.08, 0.02, 0.02],
          k: l * 0.15,
        });
    }
    for (let p of [-1, 1])
      s.sockets
        ? (i.ell(o(p * 0.34, 1.04, 0.92), [0.2 * t, 0.15 * t, 0.22 * t], {
            sub: !0,
            region: 25,
            col: [0.025, 0.008, 0.006],
            k: l * 0.5,
          }),
          i.ell(o(p * 0.34, 1.05, 0.7), [0.11 * t, 0.09 * t, 0.08 * t], {
            region: 26,
            col: [0.05, 0.04, 0.035],
            k: l * 0.2,
          }))
        : (i.ell(o(p * 0.34, 1.04, 0.86), [0.18 * t, 0.13 * t, 0.16 * t], {
            sub: !0,
            ...c,
            paint: !1,
            k: l * 0.3,
          }),
          i.ell(o(p * 0.34, 1.03, 0.78), [0.12 * t, 0.12 * t, 0.12 * t], {
            region: 26,
            col: s.eyeCol || [0.55, 0.52, 0.42],
            k: l * 0.08,
          }),
          i.cap(
            o(p * 0.2, 1.12, 0.86),
            o(p * 0.48, 1.1, 0.82),
            0.045 * t,
            0.04 * t,
            { ...c, k: l * 0.25 },
          ),
          i.cap(
            o(p * 0.22, 0.95, 0.86),
            o(p * 0.46, 0.95, 0.82),
            0.03 * t,
            0.03 * t,
            { ...c, k: l * 0.25 },
          ));
    if (
      (i.ell(
        o(0, 0.48 - f * 0.3, 0.88),
        [0.3 * t, (0.07 + f * 0.32) * t, 0.34 * t],
        { sub: !0, region: 25, col: [0.05, 0.008, 0.007], k: l * 0.35 },
      ),
      a < 0.45 &&
        (i.cap(o(-0.24, 0.56, 0.9), o(0.24, 0.56, 0.9), 0.05 * t, 0.05 * t, {
          ...c,
          col: Ns(s.color, 0.85),
          k: l * 0.3,
        }),
        i.cap(
          o(-0.22, 0.4 - f * 0.6, 0.88),
          o(0.22, 0.4 - f * 0.6, 0.88),
          0.055 * t,
          0.055 * t,
          { ...c, col: Ns(s.color, 0.85), k: l * 0.3 },
        )),
      s.teeth !== !1)
    )
      for (let p = 0; p < 8; p++) {
        let g = (p / 7 - 0.5) * 1.6,
          m = Math.sin(g) * 0.26,
          x = 0.82 + Math.cos(g) * 0.14 - 0.14,
          v = s.fangs && (p === 1 || p === 6) ? 1.8 : 1;
        (i.ell(
          o(m, 0.56 - f * 0.05 - (v - 1) * 0.05, x),
          [0.04 * t, 0.065 * t * v, 0.032 * t],
          { region: 26, col: s.toothCol || [0.62, 0.56, 0.42], k: l * 0.06 },
        ),
          f > 0.3 &&
            i.ell(
              o(m * 0.95, 0.38 - f * 0.62, x - 0.02),
              [0.036 * t, 0.055 * t, 0.03 * t],
              { region: 26, col: s.toothCol || [0.6, 0.54, 0.4], k: l * 0.06 },
            ));
      }
    if (!s.noEars)
      for (let p of [-1, 1])
        (i.ell(o(p * 0.9, 0.95, 0.02), [0.07 * t, 0.22 * t, 0.14 * t], {
          ...c,
          k: l * 0.4,
        }),
          i.ell(o(p * 0.97, 0.93, 0.05), [0.04 * t, 0.13 * t, 0.08 * t], {
            sub: !0,
            ...c,
            paint: !1,
            k: l * 0.2,
          }));
    if (
      (e.noNeck ||
        i.cap(
          o(0, -0.35, -0.12),
          o(0, 0.45, -0.08),
          0.42 * t * (1 - a * 0.2),
          0.5 * t,
          { ...c, k: l * 1.5 },
        ),
      s.bandage)
    ) {
      let p = { region: 21, col: s.bandageCol || [0.6, 0.58, 0.52] };
      (i.ell(
        o(0, 1.28, -0.06),
        [0.97 * n[0] * t, 0.85 * n[1] * t, 1.07 * n[2] * t],
        { ...p, k: l * 0.3, bump: [0.03 * t, 3 / t] },
      ),
        i.ell(o(0.06, 1.03, 0.66), [0.7 * t, 0.17 * t, 0.42 * t], {
          ...p,
          k: l * 0.3,
          rot: [0, 0, 0.25],
          bump: [0.02 * t, 4 / t],
        }));
    }
    return i;
  }
  function VE(s) {
    let t = s.len,
      e = s.legH,
      n = s.bodyR,
      i = _c();
    (i.add("root", null, 0, 0, 0), i.add("body", "root", 0, e, 0));
    let r = s.upper ?? 0.55,
      o = s.legR * 0.9,
      a = s.width ?? n * 0.85,
      c = e - n * 0.2 - o,
      l = [
        ["leg0", -a, t * 0.42, !0],
        ["leg1", a, t * 0.42, !0],
        ["leg2", -a, -t * 0.42, !1],
        ["leg3", a, -t * 0.42, !1],
      ],
      h = {};
    for (let [u, f, d, p] of l) {
      let g = p ? (s.frontRest ?? 0) : (s.backRest ?? 0),
        m = p ? (s.frontKnee ?? 0) : (s.backKnee ?? 0),
        x = c / Math.max(0.35, r * Math.cos(g) + (1 - r) * Math.cos(g + m)),
        v = x * r,
        y = x * (1 - r);
      ((h[u] = [v, y]),
        i.add(u + ".up", "body", f, -n * 0.2, d, [g, 0, 0]),
        i.add(u + ".lo", u + ".up", 0, -v, 0, [m, 0, 0]),
        i.add(u + ".hand", u + ".lo", 0, -y, 0, [-(g + m), 0, 0]));
    }
    return (
      i.add("neck", "body", 0, n * 0.2, t * 0.48, [s.neckPitch ?? -0.5, 0, 0]),
      i.add("head", "neck", 0, s.neckL, 0, [
        -(s.neckPitch ?? -0.5) + (s.headPitch ?? 0),
        0,
        0,
      ]),
      s.jaw && i.add("jaw", "head", 0, -s.headR * 0.3, s.headR * 0.3),
      s.tail &&
        i.add("tail", "body", 0, n * 0.25, -t * 0.47, [
          s.tailRest ?? 1.1,
          0,
          0,
        ]),
      { R: i, dims: { L: t, h: e, R0: n, pawH: o, seg: h } }
    );
  }
  function GE(s, t) {
    let { R: e, dims: n } = t,
      i = e.world,
      r = e.idx,
      { L: o, R0: a, pawH: c } = n,
      l = new En(),
      h = s.thick ?? 1,
      u = a * 0.6,
      f = or(s).skin,
      d = s.muscle ? [0.035 * a, (9 / a) * 0.1] : [0.05 * a, (7 / a) * 0.1],
      p = i.body,
      g = r.body;
    if (s.humanoid) {
      (l.ell(
        ae(p, [0, a * 0.1, o * 0.24]),
        [a * 1.05 * h, a * 0.85, o * 0.26],
        { ...f, bone: g, k: u * 0.5, bump: d },
      ),
        l.cap(
          ae(p, [0, a * 0.05, o * 0.05]),
          ae(p, [0, a * 0.08, -o * 0.25]),
          a * 0.55 * h,
          a * 0.72 * h,
          { ...f, bone: g, k: u * 0.5, bump: d },
        ),
        l.ell(
          ae(p, [0, a * 0.1, -o * 0.36]),
          [a * 0.95 * h, a * 0.7, o * 0.16],
          { ...f, bone: g, k: u * 0.5, bump: d },
        ));
      for (let v of [-1, 1])
        l.ell(
          ae(p, [v * a * 0.45, a * 0.2, -o * 0.47]),
          [a * 0.45, a * 0.5, a * 0.45],
          { ...f, bone: g, k: u * 0.4 },
        );
      for (let v = 0; v < 7; v++)
        for (let y of [-1, 1]) {
          let _ = o * (0.4 - v * 0.055),
            M = a * 0.07;
          l.chain(
            [
              ae(p, [y * a * 0.2, a * 0.88, _]),
              ae(p, [y * a * 0.85, a * 0.45, _ - o * 0.01]),
              ae(p, [y * a * 0.95, -a * 0.2, _ - o * 0.02]),
              ae(p, [y * a * 0.4, -a * 0.7, _ - o * 0.03]),
            ],
            [M, M, M * 0.9, M * 0.7],
            { ...f, bone: g, k: u * 0.1 },
          );
        }
      for (let v of [-1, 1])
        l.ell(
          ae(p, [v * a * 0.55, a * 0.75, o * 0.3]),
          [a * 0.32, a * 0.1, a * 0.45],
          { ...f, bone: g, k: u * 0.2 },
        );
    } else {
      if (
        (l.ell(
          ae(p, [0, a * 0.05, o * 0.22]),
          [a * 0.95 * h, a * 1.15, o * 0.34],
          { ...f, bone: g, k: u, bump: d },
        ),
        l.ell(
          ae(p, [0, a * 0.22, -o * 0.05]),
          [a * 0.72 * h, a * 0.72, o * 0.32],
          { ...f, bone: g, k: u, bump: d },
        ),
        l.ell(
          ae(p, [0, a * 0.08, -o * 0.33]),
          [a * 0.85 * h, a * 0.9, o * 0.22],
          { ...f, bone: g, k: u, bump: d },
        ),
        s.ribs)
      )
        for (let v = 0; v < 7; v++)
          for (let y of [-1, 1]) {
            let _ = o * (0.32 - v * 0.07),
              M = a * 0.06;
            l.chain(
              [
                ae(p, [y * a * 0.25, a * 0.95, _]),
                ae(p, [y * a * 0.85, a * 0.45, _ - o * 0.01]),
                ae(p, [y * a * 0.9, -a * 0.3, _ - o * 0.02]),
                ae(p, [y * a * 0.35, -a * 0.95, _ - o * 0.03]),
              ],
              [M, M, M, M * 0.8],
              { ...f, bone: g, k: u * 0.15 },
            );
          }
      if (s.plates)
        for (let v = 0; v < 6; v++)
          l.ell(
            ae(p, [0, a * 0.95, o * (0.36 - v * 0.14)]),
            [a * 0.8 * h, a * 0.28, o * 0.09],
            {
              region: 26,
              col: Ns(s.color, 0.7),
              bone: g,
              k: u * 0.15,
              bump: [0.03 * a, (9 / a) * 0.1],
            },
          );
    }
    for (let v = 0; v < 9; v++)
      l.ell(
        ae(p, [0, a * 1 - Math.abs(v - 4) * a * 0.02, o * (0.4 - v * 0.095)]),
        [a * 0.12, a * 0.1, a * 0.1],
        { ...f, bone: g, k: u * 0.2 },
      );
    for (let v = 0; v < 4; v++) {
      let y = "leg" + v,
        _ = v < 2,
        M = v % 2 ? 1 : -1,
        b = i[y + ".up"],
        w = i[y + ".lo"],
        S = i[y + ".hand"],
        T = r[y + ".up"],
        E = r[y + ".lo"],
        C = r[y + ".hand"],
        R = e.inv(y + ".up"),
        I = e.inv(y + ".lo"),
        k = s.legR,
        [N, z] = n.seg[y];
      s.humanoid
        ? (l.ell(
            e.pt(y + ".up", [M * k * 0.4, k * 0.8, 0]),
            [k * 2 * h, k * 2.4, k * 2 * h],
            { ...f, bone: T, k: u * 0.3 },
          ),
          l.cap(b, w, k * 1.35 * h, k * 1 * h, {
            ...f,
            bone: T,
            k: u * 0.2,
            bump: d,
          }),
          l.ell(w, [k * 1.25, k * 1.35, k * 1.25], {
            ...f,
            bone: E,
            k: u * 0.1,
          }),
          l.cap(w, S, k * 1 * h, k * 0.75 * h, {
            ...f,
            bone: E,
            k: u * 0.15,
            bump: d,
          }))
        : (l.ell(
            e.pt(y + ".up", [0, -N * 0.15, _ ? 0 : -k * 0.6]),
            [k * 2.6 * h, N * 0.45, k * 3.2 * h],
            { ...f, bone: T, k: u * 0.5, bump: d, m3: R },
          ),
          l.cap(b, w, k * 1.9 * h, k * 1.15 * h, {
            ...f,
            bone: T,
            k: u * 0.3,
            bump: d,
          }),
          l.cap(w, S, k * 1.05 * h, k * 0.7 * h, { ...f, bone: E, k: u * 0.2 }),
          l.ell(
            e.pt(y + ".lo", [0, -z * 0.25, 0]),
            [k * 1.2 * h, z * 0.3, k * 1.3 * h],
            { ...f, bone: E, k: u * 0.2, m3: I },
          ));
      let U = (X) => e.pt(y + ".hand", X);
      if (s.hands) {
        let X = _ ? 1 : -1;
        l.box(
          U([0, -c * 0.5, X * k * 1.4]),
          [k * 1.5, c * 0.45, k * 2.1],
          k * 0.4,
          { ...f, bone: C, k: u * 0.15 },
        );
        for (let H = 0; H < 5; H++) {
          let O = (H - 2) * k * 0.75,
            V = _ ? (H === 2 ? 5.6 : H === 0 || H === 4 ? 3.8 : 5) : 1.8,
            at = U([O, -c * 0.6, X * k * 3]),
            tt = U([O * 1.25, -c * 0.95, X * k * (3 + V)]),
            wt = Bo(at, tt, 0.5);
          ((wt[1] += k * 0.45),
            l.chain([at, wt, tt], [k * 0.4, k * 0.34, k * 0.26], {
              ...f,
              bone: C,
              k: u * 0.06,
            }),
            _ &&
              l.cap(
                tt,
                U([O * 1.3, -c * 1, X * k * (3.6 + V)]),
                k * 0.2,
                k * 0.05,
                { region: 26, col: [0.3, 0.27, 0.2], bone: C, k: u * 0.03 },
              ));
        }
      } else {
        l.ell(U([0, -c * 0.35, k * 0.9]), [k * 1.35, c * 0.7, k * 1.9], {
          ...f,
          bone: C,
          k: u * 0.2,
        });
        for (let X = 0; X < 4; X++) {
          let H = (X - 1.5) * k * 0.7;
          (l.ell(U([H, -c * 0.6, k * 2.3]), [k * 0.42, c * 0.42, k * 0.55], {
            ...f,
            bone: C,
            k: u * 0.08,
          }),
            l.cap(
              U([H, -c * 0.55, k * 2.6]),
              U([H * 1.1, -c * 0.95, k * 3.4]),
              k * 0.2,
              k * 0.05,
              { region: 26, col: [0.14, 0.11, 0.09], bone: C, k: u * 0.03 },
            ));
        }
      }
    }
    let m = i.neck,
      x = i.head;
    if (
      (l.cap(
        e.pt("neck", [0, -a * 0.25, -a * 0.1]),
        x,
        a * (s.humanoid ? 0.32 : 0.55) * h,
        a * (s.humanoid ? 0.28 : 0.42) * h,
        { ...f, bone: r.neck, k: u * 0.5, bump: d },
      ),
      s.humanoid)
    )
      for (let v of [-1, 1])
        l.cap(
          e.pt("neck", [v * a * 0.18, s.neckL * 0.9, a * 0.1]),
          e.pt("neck", [v * a * 0.08, -a * 0.1, a * 0.3]),
          a * 0.07,
          a * 0.06,
          { ...f, bone: r.neck, k: u * 0.1 },
        );
    if (s.tail) {
      let v = [0, 0.3, 0.62, 1].map((y) =>
        e.pt("tail", [0, -s.tail * y, -s.tail * y * y * 0.25]),
      );
      l.chain(v, [a * 0.28, a * 0.2, a * 0.12, a * 0.035], {
        ...f,
        bone: r.tail,
        k: u * 0.2,
      });
    }
    return l;
  }
  function W1(s) {
    let t = s.headScale || [1, 0.9, 1.4],
      e = 0.4 * t[0],
      n = 0.34,
      i = 1 - (e / (0.95 * t[0])) ** 2 - ((n - 0.1) / t[1]) ** 2;
    return {
      x: e,
      u: n,
      f: 0.35 + 0.75 * t[2] * Math.sqrt(Math.max(0.05, i)) - 0.06,
    };
  }
  function WE(s) {
    let t = s.headR,
      e = s.headScale || [1, 0.9, 1.4],
      n = new En(),
      i = (l, h, u) => [l * t, u * t, h * t],
      r = or(s).skin,
      o = t * 0.15,
      a = [0.02 * t, 3.5 / t];
    (n.ell(i(0, 0.35, 0.1), [e[0] * t * 0.95, e[1] * t, e[2] * t * 0.75], {
      ...r,
      k: o,
      bump: a,
    }),
      n.cap(
        i(0, 0.5, 0.05),
        i(0, (1.5 * e[2]) / 1.4, -0.12),
        0.55 * t * e[0],
        0.33 * t * e[0],
        { ...r, k: o * 1.2, bump: a },
      ),
      n.cap(i(0, -0.3, -0.2), i(0, 0.3, 0), 0.62 * t * e[0], 0.7 * t * e[0], {
        ...r,
        k: o * 1.5,
      }));
    let c = W1(s);
    for (let l of [-1, 1])
      (n.ell(i(l * c.x, c.f + 0.06, c.u), [0.19 * t, 0.17 * t, 0.15 * t], {
        sub: !0,
        region: 25,
        col: [0.03, 0.006, 0.004],
        k: o * 0.3,
      }),
        s.eyes ||
          n.ell(i(l * c.x, c.f - 0.04, c.u), [0.11 * t, 0.11 * t, 0.11 * t], {
            region: 26,
            col: [0.06, 0.05, 0.03],
            k: o * 0.1,
          }),
        n.ell(
          i(l * c.x * 1.05, c.f - 0.02, c.u + 0.16),
          [0.2 * t, 0.14 * t, 0.1 * t],
          { ...r, k: o * 0.5 },
        ),
        s.ears !== !1 &&
          n.cap(
            i(l * 0.55, 0.05, 0.55),
            i(l * 0.75, -0.25, 0.95),
            0.12 * t,
            0.04 * t,
            { ...r, k: o * 0.4 },
          ));
    for (let l of [-1, 1])
      n.ell(
        i(l * 0.12, (1.52 * e[2]) / 1.4, 0),
        [0.06 * t, 0.05 * t, 0.06 * t],
        { sub: !0, region: 25, col: [0.06, 0.01, 0.01], k: o * 0.2 },
      );
    if (s.jaw) {
      for (let l = 0; l < 7; l++)
        for (let h of [-1, 1]) {
          let u = 0.55 + (l * 0.14 * e[2]) / 1.4,
            f = 0.3 * (1.15 - l * 0.08) * e[0];
          n.cap(
            i(h * f, u, -0.2),
            i(h * f * 0.95, u + 0.02, -0.45 - (l === 1 ? 0.14 : 0)),
            0.055 * t,
            0.01 * t,
            { region: 26, col: [0.6, 0.55, 0.42], k: o * 0.05 },
          );
        }
      n.ell(i(0, 0.95, -0.22), [0.32 * t * e[0], 0.5 * t, 0.12 * t], {
        region: 25,
        col: [0.2, 0.03, 0.03],
        k: o * 0.3,
      });
    } else
      n.ell(i(0, 1.05, -0.32), [0.32 * t, 0.22 * t, 0.12 * t], {
        sub: !0,
        region: 25,
        col: [0.08, 0.01, 0.01],
        k: o * 0.3,
      });
    if (s.headPlates)
      for (let l = 0; l < 3; l++)
        n.ell(
          i(0, 0.2 + l * 0.35, 0.75 - l * 0.12),
          [0.62 * t, 0.3 * t, 0.25 * t],
          { region: 26, col: Ns(s.color, 0.65), k: o * 0.2 },
        );
    return n;
  }
  function qE(s) {
    let t = s.headR,
      e = s.headScale || [1, 0.9, 1.4],
      n = new En(),
      i = (a, c, l) => [a * t, l * t, c * t],
      r = or(s).skin,
      o = t * 0.15;
    (n.cap(
      i(0, 0, -0.05),
      i(0, (1.35 * e[2]) / 1.4, 0.02),
      0.42 * t * e[0],
      0.22 * t * e[0],
      { ...r, k: o },
    ),
      n.ell(i(0, 0.75, 0.15), [0.26 * t * e[0], 0.5 * t, 0.08 * t], {
        region: 25,
        col: [0.22, 0.04, 0.04],
        k: o * 0.3,
      }));
    for (let a = 0; a < 7; a++)
      for (let c of [-1, 1]) {
        let l = 0.25 + (a * 0.14 * e[2]) / 1.4,
          h = 0.26 * (1.15 - a * 0.08) * e[0];
        n.cap(
          i(c * h, l, 0.12),
          i(c * h * 0.96, l + 0.02, 0.36 + (a === 1 ? 0.1 : 0)),
          0.05 * t,
          0.01 * t,
          { region: 26, col: [0.58, 0.52, 0.4], k: o * 0.05 },
        );
      }
    return n;
  }
  function XE(s) {
    let t = _c(),
      e = s.n || 8;
    (t.add("root", null, 0, 0, 0),
      t.add("body", "root", 0, s.h, 0),
      t.add("head", "body", 0, 0, s.bodyR * 0.6));
    let n = s.lift ?? 0.9,
      i = n + Math.asin(Math.min(0.97, (s.h + s.legA * Math.sin(n)) / s.legB));
    for (let r = 0; r < e; r++) {
      let o = r < e / 2 ? -1 : 1,
        a = r % (e / 2),
        c = (a / (e / 2 - 1) - 0.5) * s.bodyR * 1.6,
        l = o * (Math.PI / 2) + (a / (e / 2 - 1) - 0.5) * 1.2 * o;
      (t.add("leg" + r + ".hip", "body", o * s.bodyR * 0.6, 0, c, [0, l, 0]),
        t.add("leg" + r + ".up", "leg" + r + ".hip", 0, 0, 0, [-n, 0, 0]),
        t.add("leg" + r + ".lo", "leg" + r + ".up", 0, 0, s.legA, [i, 0, 0]));
    }
    return { R: t, dims: { lift: n, bend: i } };
  }
  function YE(s) {
    let t = new En(),
      e = or(s).skin,
      n = s.bodyR,
      i = n * 0.3,
      r = [n * 0.04, 3 / n];
    t.ell([0, n * 0.1, -n * 0.95], [n, n * 0.78, n * 1.3], {
      ...e,
      k: i,
      bump: r,
    });
    for (let o = 0; o < 4; o++)
      t.ell(
        [0, n * 0.62 - o * 0.02 * n, -n * (0.45 + o * 0.32)],
        [n * 0.35, n * 0.15, n * 0.2],
        { ...e, col: Ns(s.color, 0.75), k: i * 0.3 },
      );
    return (
      t.ell([0, 0, n * 0.05], [n * 0.62, n * 0.42, n * 0.6], {
        ...e,
        k: i * 0.6,
        bump: r,
      }),
      t.cap(
        [0, -n * 0.1, -n * 2.1],
        [0, -n * 0.2, -n * 2.3],
        n * 0.12,
        n * 0.05,
        { ...e, k: i * 0.3 },
      ),
      t
    );
  }
  function $E(s) {
    let t = new En(),
      e = or(s).skin,
      n = s.bodyR,
      i = n * 0.3;
    t.ell([0, n * 0.05, n * 0.18], [n * 0.42, n * 0.34, n * 0.42], {
      ...e,
      k: i * 0.5,
    });
    for (let r of [-1, 1])
      t.cap(
        [r * n * 0.14, -n * 0.12, n * 0.45],
        [r * n * 0.08, -n * 0.38, n * 0.62],
        n * 0.09,
        n * 0.03,
        { region: 26, col: [0.08, 0.06, 0.05], k: i * 0.1 },
      );
    return t;
  }
  function V2(s, t, e, n, i) {
    let r = new En(),
      o = or(s).skin,
      a = e * 0.6;
    (r.cap([0, 0, 0], [0, 0, t], e, n, {
      ...o,
      k: a * 0.3,
      bump: [e * 0.08, 2.5 / e],
    }),
      r.ell([0, 0, t * 0.5], [e * 1.12, e * 1.12, t * 0.32], {
        ...o,
        k: a * 0.5,
      }),
      r.ell([0, 0, 0], [e * 1.25, e * 1.25, e * 1.25], { ...o, k: a * 0.3 }));
    for (let c = 1; c < 6; c++)
      r.cap(
        [0, e * 0.7, (t * c) / 6],
        [0, e * 1.9, (t * c) / 6 + e * 1.2],
        e * 0.14,
        e * 0.02,
        { ...o, k: a * 0.05 },
      );
    return (
      i &&
        r.cap([0, 0, t], [0, -n * 2.5, t + n * 2.5], n * 0.9, n * 0.15, {
          region: 26,
          col: Ns(s.color, 0.5),
          k: a * 0.05,
        }),
      r
    );
  }
  function KE(s) {
    let t = _c(),
      e = s.ceil,
      n = s.tip ?? 0.95,
      i = 8,
      r = (e - n - 0.25) / i;
    (t.add("root", null, 0, 0, 0), t.add("top", "root", 0, e, 0));
    let o = "top";
    for (let a = 0; a < i; a++)
      (t.add("seg" + a, o, 0, a === 0 ? -0.25 : -r, 0), (o = "seg" + a));
    return (
      t.add("tip", o, 0, -r, 0),
      { R: t, dims: { ceil: e, seg: r, n: i } }
    );
  }
  function jE(s, t) {
    let { R: e } = t,
      n = e.world,
      i = e.idx,
      r = i.top,
      o = new En(),
      a = { region: 20, col: s.color },
      c = n.top;
    o.ell(ae(c, [0, -0.07, 0]), [0.6, 0.19, 0.54], {
      ...a,
      bone: r,
      k: 0.08,
      bump: [0.022, 8],
    });
    for (let l = 0; l < 10; l++) {
      let h = (l / 10) * Math.PI * 2 + (l % 3) * 0.4,
        u = 0.32 + (l % 3) * 0.1;
      o.ell(
        ae(c, [Math.cos(h) * u, -0.1 - (l % 2) * 0.06, Math.sin(h) * u * 0.9]),
        [0.15 + (l % 3) * 0.04, 0.11 + (l % 2) * 0.03, 0.14],
        { ...a, bone: r, k: 0.06, bump: [0.015, 13] },
      );
    }
    for (let l = 0; l < 8; l++) {
      let h = (l / 8) * Math.PI * 2 + 0.2,
        u = [];
      for (let f = 0; f < 5; f++) {
        let d = 0.12 + f * 0.12;
        u.push(
          ae(c, [
            Math.cos(h + f * 0.15) * d,
            -0.2 + f * 0.035 - (f === 4 ? 0.04 : 0),
            Math.sin(h + f * 0.15) * d * 0.9,
          ]),
        );
      }
      o.chain(u, [0.016, 0.014, 0.012, 0.009, 0.006], {
        region: 20,
        col: Ns(s.color2 || s.color, 1.2),
        bone: r,
        k: 0.012,
      });
    }
    (o.torus(ae(c, [0, -0.25, 0]), 0.1, 0.045, {
      region: 25,
      col: s.extra || s.color,
      bone: r,
      k: 0.03,
    }),
      o.ell(ae(c, [0, -0.27, 0]), [0.085, 0.07, 0.085], {
        sub: !0,
        region: 25,
        col: [0.05, 0.004, 0.004],
        bone: r,
        k: 0.02,
      }));
    for (let l = 0; l < 14; l++) {
      let h = (l / 14) * Math.PI * 2;
      o.cap(
        ae(c, [Math.cos(h) * 0.12, -0.26, Math.sin(h) * 0.12]),
        ae(c, [Math.cos(h) * 0.075, -0.33, Math.sin(h) * 0.075]),
        0.013,
        0.002,
        { region: 26, col: [0.55, 0.5, 0.38], bone: r, k: 0.004 },
      );
    }
    return o;
  }
  function ZE(s, t) {
    let { R: e, dims: n } = t,
      i = e.world,
      r = e.idx,
      o = n.n,
      a = new En(),
      c = { region: 25, col: s.extra || s.color };
    for (let u = 0; u < o; u++) {
      let f = i["seg" + u],
        d = u < o - 1 ? i["seg" + (u + 1)] : i.tip,
        p = 0.042 - u * 0.0026,
        g = 0.042 - (u + 1) * 0.0026;
      a.cap(f, d, p, g, {
        ...c,
        bone: r["seg" + u],
        k: 0.015,
        bump: [0.003, 55],
      });
      for (let m of [0.3, 0.75])
        a.torus(Bo(f, d, m), p * 0.96, 0.0065, {
          ...c,
          bone: r["seg" + u],
          k: 0.006,
        });
    }
    let l = i.tip,
      h = r.tip;
    a.ell(ae(l, [0, -0.02, 0]), [0.05, 0.075, 0.05], {
      ...c,
      bone: h,
      k: 0.02,
    });
    for (let u = 0; u < 6; u++) {
      let f = (u / 6) * Math.PI * 2;
      a.chain(
        [
          ae(l, [Math.cos(f) * 0.035, -0.05, Math.sin(f) * 0.035]),
          ae(l, [Math.cos(f) * 0.07, -0.1, Math.sin(f) * 0.07]),
          ae(l, [Math.cos(f) * 0.06, -0.13, Math.sin(f) * 0.06]),
        ],
        [0.009, 0.006, 0.002],
        { region: 26, col: [0.4, 0.33, 0.25], bone: h, k: 0.004 },
      );
    }
    return a;
  }
  function JE(s) {
    let t = _c();
    t.add("root", null, 0, 0, 0);
    for (let e = 0; e < 3; e++) {
      let n = (e / 3) * Math.PI * 2;
      (t.add(
        "arm" + e + ".base",
        "root",
        Math.cos(n) * 0.4,
        s.base,
        Math.sin(n) * 0.4,
      ),
        t.add("arm" + e + ".up", "arm" + e + ".base", 0, 0, 0),
        t.add("arm" + e + ".el", "arm" + e + ".up", 0, 0.45, 0),
        t.add("arm" + e + ".hand", "arm" + e + ".el", 0, 0.4, 0, [
          0,
          0,
          Math.PI,
        ]));
    }
    return (t.add("head", "root", 0, s.base + 0.05, 0), { R: t, dims: {} });
  }
  function QE(s, t, e) {
    let { R: n } = t,
      i = n.world,
      r = n.idx,
      o = "arm" + e,
      a = new En(),
      c = { region: 20, col: s.color },
      l = [0.0025, 48],
      h = i[o + ".up"],
      u = i[o + ".el"],
      f = i[o + ".hand"];
    return (
      a.cap(ae(h, [0, -0.15, 0]), u, 0.05, 0.034, {
        ...c,
        bone: r[o + ".up"],
        k: 0.02,
        bump: l,
      }),
      a.ell(u, [0.037, 0.04, 0.037], { ...c, bone: r[o + ".el"], k: 0.012 }),
      a.cap(u, f, 0.036, 0.024, {
        ...c,
        bone: r[o + ".el"],
        k: 0.018,
        bump: l,
      }),
      a.ell(Bo(u, f, 0.3), [0.034, 0.08, 0.03], {
        ...c,
        bone: r[o + ".el"],
        k: 0.016,
      }),
      a
    );
  }
  function tA(s) {
    let t = _c(),
      e = s.len,
      n = s.r,
      i = s.span;
    (t.add("root", null, 0, 0, 0),
      t.add("body", "root", 0, 0, 0),
      t.add("head", "body", 0, 0, e * 0.55));
    for (let [r, o] of [
      ["wingL", -1],
      ["wingR", 1],
    ])
      (t.add(r, "body", o * n * 0.7, n * 0.3, e * 0.15),
        t.add(r + "2", r, o * i, 0, 0));
    return { R: t, dims: { L: e, r: n, sp: i } };
  }
  function eA(s, t) {
    let { R: e, dims: n } = t,
      i = e.world,
      r = e.idx,
      { L: o, r: a } = n,
      c = new En(),
      l = { region: 20, col: s.color },
      h = r.body,
      u = r.head,
      f = [0.004, 30];
    c.cap([0, 0, -o * 0.45], [0, a * 0.1, o * 0.3], a * 0.45, a * 0.95, {
      ...l,
      bone: h,
      k: 0.03,
      bump: f,
    });
    for (let p = 0; p < 6; p++)
      for (let g of [-1, 1]) {
        let m = o * (0.25 - p * 0.07);
        c.chain(
          [
            [g * a * 0.2, a * 0.75, m],
            [g * a * 0.85, a * 0.3, m - 0.01],
            [g * a * 0.8, -a * 0.45, m - 0.02],
          ],
          [a * 0.07, a * 0.07, a * 0.05],
          { ...l, bone: h, k: 0.008 },
        );
      }
    c.cap(
      [0, -a * 0.1, -o * 0.45],
      [0, -a * 0.35, -o * 0.85],
      a * 0.25,
      a * 0.04,
      { ...l, bone: h, k: 0.02 },
    );
    for (let p of [-1, 1])
      c.chain(
        [
          [p * a * 0.35, -a * 0.5, -o * 0.15],
          [p * a * 0.45, -a * 1.6, -o * 0.3],
          [p * a * 0.4, -a * 2.4, -o * 0.2],
        ],
        [a * 0.14, a * 0.09, a * 0.05],
        { ...l, bone: h, k: 0.012 },
      );
    let d = i.head;
    (c.cap(
      ae(d, [0, 0, -a * 0.5]),
      ae(d, [0, a * 0.05, a * 0.2]),
      a * 0.4,
      a * 0.55,
      { ...l, bone: u, k: 0.03 },
    ),
      c.cap(
        ae(d, [0, a * 0.05, a * 0.2]),
        ae(d, [0, -a * 0.1, a * 1.5]),
        a * 0.5,
        a * 0.12,
        { ...l, bone: u, k: 0.04, bump: [0.003, 40] },
      ),
      c.cap(
        ae(d, [0, -a * 0.35, a * 0.25]),
        ae(d, [0, -a * 0.3, a * 1.35]),
        a * 0.3,
        a * 0.08,
        { ...l, bone: u, k: 0.02 },
      ),
      c.ell(ae(d, [0, -a * 0.18, a * 0.9]), [a * 0.25, a * 0.08, a * 0.55], {
        sub: !0,
        region: 25,
        col: [0.06, 0.008, 0.006],
        bone: u,
        k: 0.01,
      }));
    for (let p = 0; p < 7; p++)
      for (let g of [-1, 1])
        c.cap(
          ae(d, [g * a * (0.18 - p * 0.018), -a * 0.1, a * (0.45 + p * 0.14)]),
          ae(d, [g * a * (0.16 - p * 0.018), -a * 0.32, a * (0.47 + p * 0.14)]),
          a * 0.035,
          a * 0.004,
          { region: 26, col: [0.6, 0.55, 0.42], bone: u, k: 0.003 },
        );
    for (let p of [-1, 1])
      c.ell(
        ae(d, [p * a * 0.33, a * 0.2, a * 0.75]),
        [a * 0.12, a * 0.1, a * 0.12],
        { sub: !0, region: 25, col: [0.02, 0.005, 0.004], bone: u, k: 0.01 },
      );
    return c;
  }
  function G2(s, t, e) {
    let { R: n, dims: i } = t,
      r = n.world,
      o = n.idx,
      { L: a, r: c, sp: l } = i,
      h = e < 0 ? "wingL" : "wingR",
      u = new En(),
      f = { region: 20, col: s.color },
      d = { region: 20, col: Ns(s.color, 0.8) },
      p = r[h],
      g = r[h + "2"],
      m = o[h],
      x = o[h + "2"];
    u.cap(p, g, c * 0.22, c * 0.14, { ...f, bone: m, k: 0.01 });
    let y = [
      [0.85 * l, -0.05 * a],
      [0.55 * l, -0.45 * a],
      [0.2 * l, -0.7 * a],
    ].map(([M, b]) => ae(g, [e * M, 0, b]));
    for (let M of y)
      u.cap(g, M, c * 0.1, c * 0.03, { ...f, bone: x, k: 0.006 });
    let _ = (M, b, w, S) =>
      u.ell(M, [b, 0.0085, w], { ...d, bone: S, k: 0.01 });
    for (let M = 0; M < 3; M++) {
      let b = y[M],
        w = M === 0 ? g : y[M - 1],
        S = Bo(Bo(g, b, 0.55), Bo(g, w, 0.55), 0.5);
      _(
        S,
        Math.max(0.05, Math.abs(b[0] - g[0]) * 0.42),
        Math.max(0.05, Math.abs(b[2] - w[2]) * 0.5 + 0.04),
        x,
      );
    }
    return (
      _(Bo(p, ae(g, [-e * l * 0.2, 0, -a * 0.35]), 0.5), l * 0.45, a * 0.3, m),
      u
    );
  }
  var An = (s, t = 1) => [
    42e-7 * s * s * t,
    65e-6 * s * s * t,
    45e-5 * s * s * t,
  ];
  function bc(s) {
    return (t) => ({ rot: s.rotW[t], pos: s.world[t] });
  }
  function q2(s, t) {
    let e = BE(s),
      n = e.dims,
      i = n.H / 1.8,
      r = [
        {
          name: "body",
          model: HE(s, e, t),
          voxel: (s.jointBalls ? 0.0085 : 0.0105) * Math.max(0.85, i * 0.85),
          skin: !0,
          err: An(i),
          ao: 0.06 * i,
        },
        {
          name: "head",
          model: Sd(s, n.headR, t),
          voxel: n.headR * 0.04,
          bone: "head",
          err: An(n.headR / 0.117),
          ao: n.headR * 0.32,
          aoK: 1.4,
        },
      ],
      o = [
        ["handL", "armL", -1],
        ["handR", "armR", 1],
      ];
    s.fourArms && o.push(["handL2", "armL2", -1], ["handR2", "armR2", 1]);
    for (let [a, c, l] of o)
      r.push({
        name: a,
        model: W2(s, n.H, t, l),
        voxel: n.H * 0.0019 * (s.handScale ?? 1),
        bone: c + ".hand",
        err: An(i * (s.handScale ?? 1), 0.5),
        ao: 0.018 * i,
      });
    return {
      bones: e.R.bones,
      place: bc(e.R),
      meta: { kind: "biped", H: n.H, legLen: n.legL, headR: n.headR },
      parts: r,
    };
  }
  function nA(s) {
    let t = {
        height: 1.76,
        leg: 0.47,
        torso: 0.3,
        head: 0.068,
        arm: 0.43,
        thick: 1.2,
        shoulder: 0.125,
        hips: 0.075,
        headScale: [1, 1.1, 1.05],
        fingers: 0.05,
        color: [0.4, 0.3, 0.25],
      },
      e = s.suit || [0.74, 0.52, 0.07],
      n = q2(t, {
        suit: e,
        glove: s.glove || [0.04, 0.042, 0.048],
        boots: s.boots || [0.03, 0.03, 0.032],
        tank: s.tank || [0.7, 0.68, 0.62],
        hood: e,
      });
    return ((n.meta.kind = "hazmat"), n);
  }
  function iA(s) {
    let t = VE(s),
      e = s.bodyR / 0.2,
      n = [
        {
          name: "body",
          model: GE(s, t),
          voxel: Math.max(0.0075, Math.min(s.bodyR * 0.06, s.legR * 0.42)),
          skin: !0,
          err: An(e),
          ao: s.bodyR * 0.35,
        },
      ];
    if (s.humanHead) {
      let i = s.headR * 0.85;
      n.push({
        name: "head",
        model: Sd({ ...s, headScale: s.faceScale }, i, {
          origin: [0, -0.35 * i, 0.05 * i],
        }),
        voxel: i * 0.042,
        bone: "head",
        err: An(i / 0.117),
      });
    } else
      n.push({
        name: "head",
        model: WE(s),
        voxel: s.headR * 0.045,
        bone: "head",
        err: An(s.headR / 0.12),
      });
    return (
      s.jaw &&
        n.push({
          name: "jaw",
          model: qE(s),
          voxel: s.headR * 0.045,
          bone: "jaw",
          err: An(s.headR / 0.12),
        }),
      {
        bones: t.R.bones,
        place: bc(t.R),
        meta: { kind: "quad", legH: s.legH, headR: s.headR },
        parts: n,
      }
    );
  }
  function sA(s) {
    let t = XE(s),
      e = s.n || 8,
      n = s.bodyR,
      i = n / 0.2,
      r = [],
      o = [];
    for (let l = 0; l < e; l++)
      (r.push("leg" + l + ".up"), o.push("leg" + l + ".lo"));
    let a = Math.max(0.0028, Math.min(s.legR * 0.42, n * 0.05)),
      c = [
        {
          name: "body",
          model: YE(s),
          voxel: Math.max(0.004, n * 0.05),
          bone: "body",
          err: An(i),
        },
        {
          name: "legUp",
          model: V2(s, s.legA, s.legR * 1.4, s.legR, !1),
          voxel: a,
          bones: r,
          err: An(s.legR / 0.03, 0.6),
        },
        {
          name: "legLo",
          model: V2(s, s.legB, s.legR, s.legR * 0.35, !0),
          voxel: a,
          bones: o,
          err: An(s.legR / 0.03, 0.6),
        },
      ];
    if (s.face) {
      let l = n * 0.62,
        h = Sd({ ...s, headScale: [1, 1.05, 0.9], noEars: !0 }, l, {
          origin: [0, -0.95 * l, n * 0.28],
          noNeck: !0,
        });
      c.push({
        name: "head",
        model: h,
        voxel: l * 0.045,
        bone: "head",
        err: An(l / 0.117),
      });
    } else
      c.push({
        name: "head",
        model: $E(s),
        voxel: Math.max(0.0035, n * 0.045),
        bone: "head",
        err: An(i),
      });
    return {
      bones: t.R.bones,
      place: bc(t.R),
      meta: { kind: "spider", h: s.h, bend: t.dims.bend },
      parts: c,
    };
  }
  function rA(s) {
    let t = KE(s);
    return {
      bones: t.R.bones,
      place: bc(t.R),
      meta: { kind: "maw", H: s.ceil },
      parts: [
        {
          name: "top",
          model: jE(s, t),
          voxel: 0.012,
          skin: !0,
          err: An(2),
          ao: 0.08,
        },
        {
          name: "tentacle",
          model: ZE(s, t),
          voxel: 0.0055,
          skin: !0,
          err: An(0.6),
          ao: 0.02,
        },
      ],
    };
  }
  function oA(s) {
    let t = JE(s),
      e = [];
    for (let n = 0; n < 3; n++)
      (e.push({
        name: "arm" + n,
        model: QE(s, t, n),
        voxel: 0.0075,
        skin: !0,
        err: An(0.8),
        ao: 0.03,
      }),
        e.push({
          name: "hand" + n,
          model: W2(
            { ...s, gaunt: 0.4, fingers: 0.07 },
            1.8,
            {},
            n === 1 ? 1 : -1,
          ),
          voxel: 0.0034,
          bone: "arm" + n + ".hand",
          err: An(1, 0.5),
          ao: 0.018,
        }));
    return (
      e.push({
        name: "head",
        model: Sd(
          { ...s, gaunt: 0.6, sockets: !0, gape: 0.7, noEars: !0 },
          0.11,
          { origin: [0, -0.12, 0] },
        ),
        voxel: 0.006,
        bone: "head",
        err: An(1),
        ao: 0.035,
      }),
      {
        bones: t.R.bones,
        place: bc(t.R),
        meta: { kind: "arms", H: 1 },
        parts: e,
      }
    );
  }
  function aA(s) {
    let t = tA(s);
    return {
      bones: t.R.bones,
      place: bc(t.R),
      meta: { kind: "flyer", H: 0.6 },
      parts: [
        {
          name: "body",
          model: eA(s, t),
          voxel: 0.0055,
          skin: !0,
          err: An(0.7),
          ao: 0.03,
        },
        {
          name: "wingL",
          model: G2(s, t, -1),
          voxel: 0.0045,
          skin: !0,
          err: An(0.6),
          ao: 0.02,
        },
        {
          name: "wingR",
          model: G2(s, t, 1),
          voxel: 0.0045,
          skin: !0,
          err: An(0.6),
          ao: 0.02,
        },
      ],
    };
  }
  function X2(s, t) {
    return s === "maw"
      ? rA(t)
      : s === "arms"
        ? oA(t)
        : s === "flyer"
          ? aA(t)
          : s === "hazmat"
            ? nA(t)
            : s === "biped"
              ? q2(t, {})
              : s === "quad"
                ? iA(t)
                : s === "spider"
                  ? sA(t)
                  : null;
  }
  var wd = () => (typeof performance < "u" ? performance.now() : Date.now());
  function Y2(s, t, e = {}) {
    let n = e.quality ?? 1,
      i = wd(),
      r = X2(s, t);
    if (!r) throw new Error("unknown creature kind " + s);
    let o = r.bones.map((f) => f.parent),
      a = {};
    r.bones.forEach((f, d) => {
      a[f.name] = d;
    });
    let c = r.parts[0].err.length,
      l = Array.from({ length: c }, () => []),
      h = [];
    for (let f of r.parts) {
      let d = wd(),
        p = f.model.build({
          voxel: f.voxel * n,
          skin: !!f.skin,
          boneParent: o,
          lods: f.err,
          ao: f.ao || f.voxel * 4.5,
          aoK: f.aoK,
        });
      h.push(
        `${f.name}:${p.lods.map((m) => m.tris).join("/")}t ${Math.round(wd() - d)}ms`,
      );
      let g = f.skin ? [null] : f.bones || [f.bone];
      for (let m = 0; m < c; m++)
        for (let x of g)
          l[m].push(
            x
              ? { g: p.lods[m], bone: a[x], place: r.place(x) }
              : { g: p.lods[m], bone: -1, place: null },
          );
    }
    let u = l.map(cA);
    return {
      bones: r.bones,
      meta: r.meta,
      lods: u,
      stats: h,
      ms: Math.round(wd() - i),
    };
  }
  function cA(s) {
    let t = 0,
      e = 0;
    for (let { g: p } of s)
      ((t += p.position.length / 3), (e += p.index.length));
    let n = new Float32Array(t * 3),
      i = new Int8Array(t * 3),
      r = new Uint8Array(t * 3),
      o = new Uint8Array(t),
      a = new Uint8Array(t * 4),
      c = new Uint8Array(t * 4),
      l = t > 65535 ? new Uint32Array(e) : new Uint16Array(e),
      h = (p) => Math.max(-127, Math.min(127, Math.round(p * 127))),
      u = (p) => Math.max(0, Math.min(255, Math.round(p * 255))),
      f = 0,
      d = 0;
    for (let { g: p, bone: g, place: m } of s) {
      let x = p.position.length / 3;
      for (let v = 0; v < x; v++) {
        let y = (f + v) * 3,
          _ = p.position[v * 3],
          M = p.position[v * 3 + 1],
          b = p.position[v * 3 + 2],
          w = p.normal[v * 3],
          S = p.normal[v * 3 + 1],
          T = p.normal[v * 3 + 2];
        if (m) {
          let C = vh(m.rot, [_, M, b]),
            R = vh(m.rot, [w, S, T]);
          ((_ = C[0] + m.pos[0]),
            (M = C[1] + m.pos[1]),
            (b = C[2] + m.pos[2]),
            (w = R[0]),
            (S = R[1]),
            (T = R[2]));
        }
        ((n[y] = _),
          (n[y + 1] = M),
          (n[y + 2] = b),
          (i[y] = h(w)),
          (i[y + 1] = h(S)),
          (i[y + 2] = h(T)),
          (r[y] = u(p.color[v * 3])),
          (r[y + 1] = u(p.color[v * 3 + 1])),
          (r[y + 2] = u(p.color[v * 3 + 2])),
          (o[f + v] = p.aMat[v]));
        let E = (f + v) * 4;
        if (g >= 0) ((a[E] = g), (c[E] = 255));
        else {
          let C = p.skinWeight[v * 4],
            R = p.skinWeight[v * 4 + 1];
          ((a[E] = p.skinIndex[v * 4]), (a[E + 1] = p.skinIndex[v * 4 + 1]));
          let I = u(C);
          ((c[E] = I), (c[E + 1] = R > 0 ? 255 - I : 0));
        }
      }
      for (let v = 0; v < p.index.length; v++) l[d + v] = p.index[v] + f;
      ((f += x), (d += p.index.length));
    }
    return {
      position: n,
      normal: i,
      color: r,
      aMat: o,
      skinIndex: a,
      skinWeight: c,
      index: l,
      tris: e / 3,
    };
  }
  var $2 =
    '(()=>{var B0=new Int32Array([0,265,515,778,1030,1295,1541,1804,2060,2309,2575,2822,3082,3331,3593,3840,400,153,915,666,1430,1183,1941,1692,2460,2197,2975,2710,3482,3219,3993,3728,560,825,51,314,1590,1855,1077,1340,2620,2869,2111,2358,3642,3891,3129,3376,928,681,419,170,1958,1711,1445,1196,2988,2725,2479,2214,4010,3747,3497,3232,1120,1385,1635,1898,102,367,613,876,3180,3429,3695,3942,2154,2403,2665,2912,1520,1273,2035,1786,502,255,1013,764,3580,3317,4095,3830,2554,2291,3065,2800,1616,1881,1107,1370,598,863,85,348,3676,3925,3167,3414,2650,2899,2137,2384,1984,1737,1475,1226,966,719,453,204,4044,3781,3535,3270,3018,2755,2505,2240,2240,2505,2755,3018,3270,3535,3781,4044,204,453,719,966,1226,1475,1737,1984,2384,2137,2899,2650,3414,3167,3925,3676,348,85,863,598,1370,1107,1881,1616,2800,3065,2291,2554,3830,4095,3317,3580,764,1013,255,502,1786,2035,1273,1520,2912,2665,2403,2154,3942,3695,3429,3180,876,613,367,102,1898,1635,1385,1120,3232,3497,3747,4010,2214,2479,2725,2988,1196,1445,1711,1958,170,419,681,928,3376,3129,3891,3642,2358,2111,2869,2620,1340,1077,1855,1590,314,51,825,560,3728,3993,3219,3482,2710,2975,2197,2460,1692,1941,1183,1430,666,915,153,400,3840,3593,3331,3082,2822,2575,2309,2060,1804,1541,1295,1030,778,515,265,0]),w0=new Int32Array([-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,8,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,1,9,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,8,3,9,8,1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,2,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,8,3,1,2,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,9,2,10,0,2,9,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,2,8,3,2,10,8,10,9,8,-1,-1,-1,-1,-1,-1,-1,3,11,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,11,2,8,11,0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,9,0,2,3,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,11,2,1,9,11,9,8,11,-1,-1,-1,-1,-1,-1,-1,3,10,1,11,10,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,10,1,0,8,10,8,11,10,-1,-1,-1,-1,-1,-1,-1,3,9,0,3,11,9,11,10,9,-1,-1,-1,-1,-1,-1,-1,9,8,10,10,8,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,4,7,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,4,3,0,7,3,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,1,9,8,4,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,4,1,9,4,7,1,7,3,1,-1,-1,-1,-1,-1,-1,-1,1,2,10,8,4,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,3,4,7,3,0,4,1,2,10,-1,-1,-1,-1,-1,-1,-1,9,2,10,9,0,2,8,4,7,-1,-1,-1,-1,-1,-1,-1,2,10,9,2,9,7,2,7,3,7,9,4,-1,-1,-1,-1,8,4,7,3,11,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,11,4,7,11,2,4,2,0,4,-1,-1,-1,-1,-1,-1,-1,9,0,1,8,4,7,2,3,11,-1,-1,-1,-1,-1,-1,-1,4,7,11,9,4,11,9,11,2,9,2,1,-1,-1,-1,-1,3,10,1,3,11,10,7,8,4,-1,-1,-1,-1,-1,-1,-1,1,11,10,1,4,11,1,0,4,7,11,4,-1,-1,-1,-1,4,7,8,9,0,11,9,11,10,11,0,3,-1,-1,-1,-1,4,7,11,4,11,9,9,11,10,-1,-1,-1,-1,-1,-1,-1,9,5,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,9,5,4,0,8,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,5,4,1,5,0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,8,5,4,8,3,5,3,1,5,-1,-1,-1,-1,-1,-1,-1,1,2,10,9,5,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,3,0,8,1,2,10,4,9,5,-1,-1,-1,-1,-1,-1,-1,5,2,10,5,4,2,4,0,2,-1,-1,-1,-1,-1,-1,-1,2,10,5,3,2,5,3,5,4,3,4,8,-1,-1,-1,-1,9,5,4,2,3,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,11,2,0,8,11,4,9,5,-1,-1,-1,-1,-1,-1,-1,0,5,4,0,1,5,2,3,11,-1,-1,-1,-1,-1,-1,-1,2,1,5,2,5,8,2,8,11,4,8,5,-1,-1,-1,-1,10,3,11,10,1,3,9,5,4,-1,-1,-1,-1,-1,-1,-1,4,9,5,0,8,1,8,10,1,8,11,10,-1,-1,-1,-1,5,4,0,5,0,11,5,11,10,11,0,3,-1,-1,-1,-1,5,4,8,5,8,10,10,8,11,-1,-1,-1,-1,-1,-1,-1,9,7,8,5,7,9,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,9,3,0,9,5,3,5,7,3,-1,-1,-1,-1,-1,-1,-1,0,7,8,0,1,7,1,5,7,-1,-1,-1,-1,-1,-1,-1,1,5,3,3,5,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,9,7,8,9,5,7,10,1,2,-1,-1,-1,-1,-1,-1,-1,10,1,2,9,5,0,5,3,0,5,7,3,-1,-1,-1,-1,8,0,2,8,2,5,8,5,7,10,5,2,-1,-1,-1,-1,2,10,5,2,5,3,3,5,7,-1,-1,-1,-1,-1,-1,-1,7,9,5,7,8,9,3,11,2,-1,-1,-1,-1,-1,-1,-1,9,5,7,9,7,2,9,2,0,2,7,11,-1,-1,-1,-1,2,3,11,0,1,8,1,7,8,1,5,7,-1,-1,-1,-1,11,2,1,11,1,7,7,1,5,-1,-1,-1,-1,-1,-1,-1,9,5,8,8,5,7,10,1,3,10,3,11,-1,-1,-1,-1,5,7,0,5,0,9,7,11,0,1,0,10,11,10,0,-1,11,10,0,11,0,3,10,5,0,8,0,7,5,7,0,-1,11,10,5,7,11,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,10,6,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,8,3,5,10,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,9,0,1,5,10,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,8,3,1,9,8,5,10,6,-1,-1,-1,-1,-1,-1,-1,1,6,5,2,6,1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,6,5,1,2,6,3,0,8,-1,-1,-1,-1,-1,-1,-1,9,6,5,9,0,6,0,2,6,-1,-1,-1,-1,-1,-1,-1,5,9,8,5,8,2,5,2,6,3,2,8,-1,-1,-1,-1,2,3,11,10,6,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,11,0,8,11,2,0,10,6,5,-1,-1,-1,-1,-1,-1,-1,0,1,9,2,3,11,5,10,6,-1,-1,-1,-1,-1,-1,-1,5,10,6,1,9,2,9,11,2,9,8,11,-1,-1,-1,-1,6,3,11,6,5,3,5,1,3,-1,-1,-1,-1,-1,-1,-1,0,8,11,0,11,5,0,5,1,5,11,6,-1,-1,-1,-1,3,11,6,0,3,6,0,6,5,0,5,9,-1,-1,-1,-1,6,5,9,6,9,11,11,9,8,-1,-1,-1,-1,-1,-1,-1,5,10,6,4,7,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,4,3,0,4,7,3,6,5,10,-1,-1,-1,-1,-1,-1,-1,1,9,0,5,10,6,8,4,7,-1,-1,-1,-1,-1,-1,-1,10,6,5,1,9,7,1,7,3,7,9,4,-1,-1,-1,-1,6,1,2,6,5,1,4,7,8,-1,-1,-1,-1,-1,-1,-1,1,2,5,5,2,6,3,0,4,3,4,7,-1,-1,-1,-1,8,4,7,9,0,5,0,6,5,0,2,6,-1,-1,-1,-1,7,3,9,7,9,4,3,2,9,5,9,6,2,6,9,-1,3,11,2,7,8,4,10,6,5,-1,-1,-1,-1,-1,-1,-1,5,10,6,4,7,2,4,2,0,2,7,11,-1,-1,-1,-1,0,1,9,4,7,8,2,3,11,5,10,6,-1,-1,-1,-1,9,2,1,9,11,2,9,4,11,7,11,4,5,10,6,-1,8,4,7,3,11,5,3,5,1,5,11,6,-1,-1,-1,-1,5,1,11,5,11,6,1,0,11,7,11,4,0,4,11,-1,0,5,9,0,6,5,0,3,6,11,6,3,8,4,7,-1,6,5,9,6,9,11,4,7,9,7,11,9,-1,-1,-1,-1,10,4,9,6,4,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,4,10,6,4,9,10,0,8,3,-1,-1,-1,-1,-1,-1,-1,10,0,1,10,6,0,6,4,0,-1,-1,-1,-1,-1,-1,-1,8,3,1,8,1,6,8,6,4,6,1,10,-1,-1,-1,-1,1,4,9,1,2,4,2,6,4,-1,-1,-1,-1,-1,-1,-1,3,0,8,1,2,9,2,4,9,2,6,4,-1,-1,-1,-1,0,2,4,4,2,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,8,3,2,8,2,4,4,2,6,-1,-1,-1,-1,-1,-1,-1,10,4,9,10,6,4,11,2,3,-1,-1,-1,-1,-1,-1,-1,0,8,2,2,8,11,4,9,10,4,10,6,-1,-1,-1,-1,3,11,2,0,1,6,0,6,4,6,1,10,-1,-1,-1,-1,6,4,1,6,1,10,4,8,1,2,1,11,8,11,1,-1,9,6,4,9,3,6,9,1,3,11,6,3,-1,-1,-1,-1,8,11,1,8,1,0,11,6,1,9,1,4,6,4,1,-1,3,11,6,3,6,0,0,6,4,-1,-1,-1,-1,-1,-1,-1,6,4,8,11,6,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,7,10,6,7,8,10,8,9,10,-1,-1,-1,-1,-1,-1,-1,0,7,3,0,10,7,0,9,10,6,7,10,-1,-1,-1,-1,10,6,7,1,10,7,1,7,8,1,8,0,-1,-1,-1,-1,10,6,7,10,7,1,1,7,3,-1,-1,-1,-1,-1,-1,-1,1,2,6,1,6,8,1,8,9,8,6,7,-1,-1,-1,-1,2,6,9,2,9,1,6,7,9,0,9,3,7,3,9,-1,7,8,0,7,0,6,6,0,2,-1,-1,-1,-1,-1,-1,-1,7,3,2,6,7,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,2,3,11,10,6,8,10,8,9,8,6,7,-1,-1,-1,-1,2,0,7,2,7,11,0,9,7,6,7,10,9,10,7,-1,1,8,0,1,7,8,1,10,7,6,7,10,2,3,11,-1,11,2,1,11,1,7,10,6,1,6,7,1,-1,-1,-1,-1,8,9,6,8,6,7,9,1,6,11,6,3,1,3,6,-1,0,9,1,11,6,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,7,8,0,7,0,6,3,11,0,11,6,0,-1,-1,-1,-1,7,11,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,7,6,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,3,0,8,11,7,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,1,9,11,7,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,8,1,9,8,3,1,11,7,6,-1,-1,-1,-1,-1,-1,-1,10,1,2,6,11,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,2,10,3,0,8,6,11,7,-1,-1,-1,-1,-1,-1,-1,2,9,0,2,10,9,6,11,7,-1,-1,-1,-1,-1,-1,-1,6,11,7,2,10,3,10,8,3,10,9,8,-1,-1,-1,-1,7,2,3,6,2,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,7,0,8,7,6,0,6,2,0,-1,-1,-1,-1,-1,-1,-1,2,7,6,2,3,7,0,1,9,-1,-1,-1,-1,-1,-1,-1,1,6,2,1,8,6,1,9,8,8,7,6,-1,-1,-1,-1,10,7,6,10,1,7,1,3,7,-1,-1,-1,-1,-1,-1,-1,10,7,6,1,7,10,1,8,7,1,0,8,-1,-1,-1,-1,0,3,7,0,7,10,0,10,9,6,10,7,-1,-1,-1,-1,7,6,10,7,10,8,8,10,9,-1,-1,-1,-1,-1,-1,-1,6,8,4,11,8,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,3,6,11,3,0,6,0,4,6,-1,-1,-1,-1,-1,-1,-1,8,6,11,8,4,6,9,0,1,-1,-1,-1,-1,-1,-1,-1,9,4,6,9,6,3,9,3,1,11,3,6,-1,-1,-1,-1,6,8,4,6,11,8,2,10,1,-1,-1,-1,-1,-1,-1,-1,1,2,10,3,0,11,0,6,11,0,4,6,-1,-1,-1,-1,4,11,8,4,6,11,0,2,9,2,10,9,-1,-1,-1,-1,10,9,3,10,3,2,9,4,3,11,3,6,4,6,3,-1,8,2,3,8,4,2,4,6,2,-1,-1,-1,-1,-1,-1,-1,0,4,2,4,6,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,9,0,2,3,4,2,4,6,4,3,8,-1,-1,-1,-1,1,9,4,1,4,2,2,4,6,-1,-1,-1,-1,-1,-1,-1,8,1,3,8,6,1,8,4,6,6,10,1,-1,-1,-1,-1,10,1,0,10,0,6,6,0,4,-1,-1,-1,-1,-1,-1,-1,4,6,3,4,3,8,6,10,3,0,3,9,10,9,3,-1,10,9,4,6,10,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,4,9,5,7,6,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,8,3,4,9,5,11,7,6,-1,-1,-1,-1,-1,-1,-1,5,0,1,5,4,0,7,6,11,-1,-1,-1,-1,-1,-1,-1,11,7,6,8,3,4,3,5,4,3,1,5,-1,-1,-1,-1,9,5,4,10,1,2,7,6,11,-1,-1,-1,-1,-1,-1,-1,6,11,7,1,2,10,0,8,3,4,9,5,-1,-1,-1,-1,7,6,11,5,4,10,4,2,10,4,0,2,-1,-1,-1,-1,3,4,8,3,5,4,3,2,5,10,5,2,11,7,6,-1,7,2,3,7,6,2,5,4,9,-1,-1,-1,-1,-1,-1,-1,9,5,4,0,8,6,0,6,2,6,8,7,-1,-1,-1,-1,3,6,2,3,7,6,1,5,0,5,4,0,-1,-1,-1,-1,6,2,8,6,8,7,2,1,8,4,8,5,1,5,8,-1,9,5,4,10,1,6,1,7,6,1,3,7,-1,-1,-1,-1,1,6,10,1,7,6,1,0,7,8,7,0,9,5,4,-1,4,0,10,4,10,5,0,3,10,6,10,7,3,7,10,-1,7,6,10,7,10,8,5,4,10,4,8,10,-1,-1,-1,-1,6,9,5,6,11,9,11,8,9,-1,-1,-1,-1,-1,-1,-1,3,6,11,0,6,3,0,5,6,0,9,5,-1,-1,-1,-1,0,11,8,0,5,11,0,1,5,5,6,11,-1,-1,-1,-1,6,11,3,6,3,5,5,3,1,-1,-1,-1,-1,-1,-1,-1,1,2,10,9,5,11,9,11,8,11,5,6,-1,-1,-1,-1,0,11,3,0,6,11,0,9,6,5,6,9,1,2,10,-1,11,8,5,11,5,6,8,0,5,10,5,2,0,2,5,-1,6,11,3,6,3,5,2,10,3,10,5,3,-1,-1,-1,-1,5,8,9,5,2,8,5,6,2,3,8,2,-1,-1,-1,-1,9,5,6,9,6,0,0,6,2,-1,-1,-1,-1,-1,-1,-1,1,5,8,1,8,0,5,6,8,3,8,2,6,2,8,-1,1,5,6,2,1,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,3,6,1,6,10,3,8,6,5,6,9,8,9,6,-1,10,1,0,10,0,6,9,5,0,5,6,0,-1,-1,-1,-1,0,3,8,5,6,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,10,5,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,11,5,10,7,5,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,11,5,10,11,7,5,8,3,0,-1,-1,-1,-1,-1,-1,-1,5,11,7,5,10,11,1,9,0,-1,-1,-1,-1,-1,-1,-1,10,7,5,10,11,7,9,8,1,8,3,1,-1,-1,-1,-1,11,1,2,11,7,1,7,5,1,-1,-1,-1,-1,-1,-1,-1,0,8,3,1,2,7,1,7,5,7,2,11,-1,-1,-1,-1,9,7,5,9,2,7,9,0,2,2,11,7,-1,-1,-1,-1,7,5,2,7,2,11,5,9,2,3,2,8,9,8,2,-1,2,5,10,2,3,5,3,7,5,-1,-1,-1,-1,-1,-1,-1,8,2,0,8,5,2,8,7,5,10,2,5,-1,-1,-1,-1,9,0,1,5,10,3,5,3,7,3,10,2,-1,-1,-1,-1,9,8,2,9,2,1,8,7,2,10,2,5,7,5,2,-1,1,3,5,3,7,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,8,7,0,7,1,1,7,5,-1,-1,-1,-1,-1,-1,-1,9,0,3,9,3,5,5,3,7,-1,-1,-1,-1,-1,-1,-1,9,8,7,5,9,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,5,8,4,5,10,8,10,11,8,-1,-1,-1,-1,-1,-1,-1,5,0,4,5,11,0,5,10,11,11,3,0,-1,-1,-1,-1,0,1,9,8,4,10,8,10,11,10,4,5,-1,-1,-1,-1,10,11,4,10,4,5,11,3,4,9,4,1,3,1,4,-1,2,5,1,2,8,5,2,11,8,4,5,8,-1,-1,-1,-1,0,4,11,0,11,3,4,5,11,2,11,1,5,1,11,-1,0,2,5,0,5,9,2,11,5,4,5,8,11,8,5,-1,9,4,5,2,11,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,2,5,10,3,5,2,3,4,5,3,8,4,-1,-1,-1,-1,5,10,2,5,2,4,4,2,0,-1,-1,-1,-1,-1,-1,-1,3,10,2,3,5,10,3,8,5,4,5,8,0,1,9,-1,5,10,2,5,2,4,1,9,2,9,4,2,-1,-1,-1,-1,8,4,5,8,5,3,3,5,1,-1,-1,-1,-1,-1,-1,-1,0,4,5,1,0,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,8,4,5,8,5,3,9,0,5,0,3,5,-1,-1,-1,-1,9,4,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,4,11,7,4,9,11,9,10,11,-1,-1,-1,-1,-1,-1,-1,0,8,3,4,9,7,9,11,7,9,10,11,-1,-1,-1,-1,1,10,11,1,11,4,1,4,0,7,4,11,-1,-1,-1,-1,3,1,4,3,4,8,1,10,4,7,4,11,10,11,4,-1,4,11,7,9,11,4,9,2,11,9,1,2,-1,-1,-1,-1,9,7,4,9,11,7,9,1,11,2,11,1,0,8,3,-1,11,7,4,11,4,2,2,4,0,-1,-1,-1,-1,-1,-1,-1,11,7,4,11,4,2,8,3,4,3,2,4,-1,-1,-1,-1,2,9,10,2,7,9,2,3,7,7,4,9,-1,-1,-1,-1,9,10,7,9,7,4,10,2,7,8,7,0,2,0,7,-1,3,7,10,3,10,2,7,4,10,1,10,0,4,0,10,-1,1,10,2,8,7,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,4,9,1,4,1,7,7,1,3,-1,-1,-1,-1,-1,-1,-1,4,9,1,4,1,7,0,8,1,8,7,1,-1,-1,-1,-1,4,0,3,7,4,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,4,8,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,9,10,8,10,11,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,3,0,9,3,9,11,11,9,10,-1,-1,-1,-1,-1,-1,-1,0,1,10,0,10,8,8,10,11,-1,-1,-1,-1,-1,-1,-1,3,1,10,11,3,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,2,11,1,11,9,9,11,8,-1,-1,-1,-1,-1,-1,-1,3,0,9,3,9,11,1,2,9,2,11,9,-1,-1,-1,-1,0,2,11,8,0,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,3,2,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,2,3,8,2,8,10,10,8,9,-1,-1,-1,-1,-1,-1,-1,9,10,2,0,9,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,2,3,8,2,8,10,0,1,8,1,10,8,-1,-1,-1,-1,1,10,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,3,8,9,1,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,9,1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,3,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1]);function T0(t,n,c={}){let e=t.length/3,i=n.length/3,d=c.maxErr??1e-5,l=c.target??0,o=c.iters??20,a=c.lock||null,s=Float64Array.from(t),g=new Float64Array(e*10),r=new Int32Array(e),k=new Int32Array(e),M=new Uint8Array(e),u=i,b=i,f=Int32Array.from(n),p=new Float64Array(u*4),h=new Float64Array(u*3),m=new Uint8Array(u),y=new Uint8Array(u),w=new Int32Array(u*6),R=new Uint8Array(u*6),U=0,P=new Uint8Array(64),D=new Uint8Array(64),B=new Float64Array(10),W=0,C=0,E=0,q=(L,z)=>{if(U>=w.length){let x=new Int32Array(w.length*2);x.set(w),w=x;let S=new Uint8Array(R.length*2);S.set(R),R=S}w[U]=L,R[U]=z,U++},_=(L,z,x)=>B[0]*L*L+2*B[1]*L*z+2*B[2]*L*x+2*B[3]*L+B[4]*z*z+2*B[5]*z*x+2*B[6]*z+B[7]*x*x+2*B[8]*x+B[9],Z=(L,z,x,S,H,A,j,O,Q)=>{let K=B;return K[L]*K[H]*K[Q]+K[x]*K[S]*K[O]+K[z]*K[A]*K[j]-K[x]*K[H]*K[j]-K[L]*K[A]*K[O]-K[z]*K[S]*K[Q]};function N(L,z){for(let e0=0;e0<10;e0++)B[e0]=g[L*10+e0]+g[z*10+e0];let x=a&&a[L],S=a&&a[z];if(x&&S)return 1/0;if(x||S){let e0=x?L:z;return W=s[e0*3],C=s[e0*3+1],E=s[e0*3+2],_(W,C,E)}let H=s[L*3],A=s[L*3+1],j=s[L*3+2],O=s[z*3],Q=s[z*3+1],K=s[z*3+2];if(!(M[L]&M[z])){let e0=Z(0,1,2,1,4,5,2,5,7);if(Math.abs(e0)>1e-24){let h0=-1/e0*Z(1,2,3,4,5,6,5,7,8),y0=1/e0*Z(0,2,3,1,5,6,2,7,8),M0=-1/e0*Z(0,1,3,1,4,6,2,5,8),v0=(H+O)*.5,U0=(A+Q)*.5,D0=(j+K)*.5,N0=(H-O)**2+(A-Q)**2+(j-K)**2;if((h0-v0)**2+(y0-U0)**2+(M0-D0)**2<=N0*.6)return W=h0,C=y0,E=M0,_(h0,y0,M0)}}let i0=(H+O)*.5,l0=(A+Q)*.5,f0=(j+K)*.5,a0=_(H,A,j),d0=_(O,Q,K),b0=_(i0,l0,f0);return a0<=d0&&a0<=b0?(W=H,C=A,E=j,a0):d0<=b0?(W=O,C=Q,E=K,d0):(W=i0,C=l0,E=f0,b0)}function J(L){let z=f[L*3]*3,x=f[L*3+1]*3,S=f[L*3+2]*3,H=s[x]-s[z],A=s[x+1]-s[z+1],j=s[x+2]-s[z+2],O=s[S]-s[z],Q=s[S+1]-s[z+1],K=s[S+2]-s[z+2],i0=A*K-j*Q,l0=j*O-H*K,f0=H*Q-A*O,a0=Math.hypot(i0,l0,f0)||1;h[L*3]=i0/a0,h[L*3+1]=l0/a0,h[L*3+2]=f0/a0}function X(L){let z=f[L*3],x=f[L*3+1],S=f[L*3+2],H=N(z,x),A=N(x,S),j=N(S,z);p[L*4]=H,p[L*4+1]=A,p[L*4+2]=j,p[L*4+3]=Math.min(H,A,j)}function v(L,z,x){let S=r[L],H=k[L];for(let A=0;A<H;A++){let j=w[S+A];if(m[j])continue;let O=R[S+A],Q=f[j*3+(O+1)%3],K=f[j*3+(O+2)%3];if(Q===z||K===z){x[A]=1;continue}let i0=s[Q*3]-W,l0=s[Q*3+1]-C,f0=s[Q*3+2]-E,a0=s[K*3]-W,d0=s[K*3+1]-C,b0=s[K*3+2]-E,e0=Math.hypot(i0,l0,f0),h0=Math.hypot(a0,d0,b0);if(e0<1e-12||h0<1e-12||(i0/=e0,l0/=e0,f0/=e0,a0/=h0,d0/=h0,b0/=h0,Math.abs(i0*a0+l0*d0+f0*b0)>.999))return!0;let y0=l0*b0-f0*d0,M0=f0*a0-i0*b0,v0=i0*d0-l0*a0,U0=Math.hypot(y0,M0,v0)||1;if(x[A]=0,(y0*h[j*3]+M0*h[j*3+1]+v0*h[j*3+2])/U0<.25)return!0}return!1}function I(L,z,x){let S=r[z],H=k[z];for(let A=0;A<H;A++){let j=w[S+A],O=R[S+A];if(!m[j]){if(x[A]){m[j]=1,b--;continue}f[j*3+O]=L,y[j]=1,J(j),X(j),q(j,O)}}}function F(L){if(L>0){let x=0;for(let S=0;S<u;S++)if(!m[S]){if(x!==S){f[x*3]=f[S*3],f[x*3+1]=f[S*3+1],f[x*3+2]=f[S*3+2];for(let H=0;H<4;H++)p[x*4+H]=p[S*4+H];h[x*3]=h[S*3],h[x*3+1]=h[S*3+1],h[x*3+2]=h[S*3+2]}x++}u=x,m.fill(0,0,u)}if(L===0){g.fill(0);for(let x=0;x<u;x++){J(x);let S=h[x*3],H=h[x*3+1],A=h[x*3+2],j=f[x*3]*3,O=-(S*s[j]+H*s[j+1]+A*s[j+2]),Q=[S*S,S*H,S*A,S*O,H*H,H*A,H*O,A*A,A*O,O*O];for(let K=0;K<3;K++){let i0=f[x*3+K]*10;for(let l0=0;l0<10;l0++)g[i0+l0]+=Q[l0]}}for(let x=0;x<u;x++)X(x)}k.fill(0);for(let x=0;x<u*3;x++)k[f[x]]++;let z=0;for(let x=0;x<e;x++)r[x]=z,z+=k[x],k[x]=0;w.length<u*3&&(w=new Int32Array(u*6),R=new Uint8Array(u*6));for(let x=0;x<u;x++)for(let S=0;S<3;S++){let H=f[x*3+S],A=r[H]+k[H]++;w[A]=x,R[A]=S}if(U=u*3,L===0){let x=[],S=[];for(let H=0;H<e;H++){x.length=0,S.length=0;for(let A=0;A<k[H];A++){let j=w[r[H]+A];for(let O=0;O<3;O++){let Q=f[j*3+O],K=x.indexOf(Q);K<0?(x.push(Q),S.push(1)):S[K]++}}for(let A=0;A<x.length;A++)S[A]===1&&(M[x[A]]=1)}}}let Y=-1;for(let L=0;L<o+8&&!(b<=l);L++){L%5===0&&F(L),y.fill(0,0,u);let z=L<o?d*Math.pow((L+1)/o,3):d,x=0;for(let S=0;S<u;S++)if(!(m[S]||y[S]||p[S*4+3]>z)){for(let H=0;H<3;H++){if(p[S*4+H]>z)continue;let A=f[S*3+H],j=f[S*3+(H+1)%3];if(M[A]!==M[j])continue;if(a){if(a[A]&&a[j])continue;if(a[j]){let K=A;A=j,j=K}}if(N(A,j)>z||(P.length<k[A]&&(P=new Uint8Array(k[A]*2)),D.length<k[j]&&(D=new Uint8Array(k[j]*2)),v(A,j,P))||v(j,A,D))continue;s[A*3]=W,s[A*3+1]=C,s[A*3+2]=E;for(let K=0;K<10;K++)g[A*10+K]+=g[j*10+K];let O=U;I(A,A,P),I(A,j,D);let Q=U-O;Q<=k[A]?(Q&&(w.copyWithin(r[A],O,O+Q),R.copyWithin(r[A],O,O+Q)),U=O):r[A]=O,k[A]=Q,x++;break}if(b<=l)break}if(L>=o&&x===0){if(Y>=0)break;Y=L}}let G=new Int32Array(e).fill(-1),$=new Uint32Array(b*3),V=0,n0=0,c0=[];for(let L=0;L<u;L++)if(!m[L])for(let z=0;z<3;z++){let x=f[L*3+z];G[x]<0&&(G[x]=n0++,c0.push(x)),$[V++]=G[x]}let t0=new Float32Array(n0*3);for(let L=0;L<n0;L++){let z=c0[L];t0[L*3]=s[z*3],t0[L*3+1]=s[z*3+1],t0[L*3+2]=s[z*3+2]}return{position:t0,index:V===$.length?$:$.slice(0,V),map:Int32Array.from(c0)}}function H0(t,n,c){let e=Math.cos(t),i=Math.sin(t),d=Math.cos(n),l=Math.sin(n),o=Math.cos(c),a=Math.sin(c),s=e*o,g=e*a,r=i*o,k=i*a,M=[d*o,-d*a,l,g+r*l,s-k*l,-i*d,k-s*l,r+g*l,e*d];return[M[0],M[3],M[6],M[1],M[4],M[7],M[2],M[5],M[8]]}var r0=1e9,z0=(t,n,c)=>{if(c<=0)return t<n?t:n;let e=Math.max(c-Math.abs(t-n),0)/c;return(t<n?t:n)-e*e*c*.25},L0=(t,n,c)=>-z0(-t,-n,c);function m0(t,n,c){let e=Math.imul(t|0,374761393)+Math.imul(n|0,668265263)+Math.imul(c|0,2147483647)|0;return e=Math.imul(e^e>>>13,1274126177),e^=e>>>16,(e>>>0)/4294967296}function O0(t,n,c){let e=Math.floor(t),i=Math.floor(n),d=Math.floor(c),l=t-e,o=n-i,a=c-d,s=l*l*(3-2*l),g=o*o*(3-2*o),r=a*a*(3-2*a),k=m0(e,i,d),M=m0(e+1,i,d),u=m0(e,i+1,d),b=m0(e+1,i+1,d),f=m0(e,i,d+1),p=m0(e+1,i,d+1),h=m0(e,i+1,d+1),m=m0(e+1,i+1,d+1),y=k+(M-k)*s,w=u+(b-u)*s,R=f+(p-f)*s,U=h+(m-h)*s,P=y+(w-y)*g,D=R+(U-R)*g;return P+(D-P)*r}var R0=t=>Array.isArray(t)?t:[t.x,t.y,t.z],s0=class{constructor(){this.prims=[]}_add(n,c){return n.k=c.k??.012,n.sub=!!c.sub,n.region=c.region??0,n.col=c.col||[1,1,1],n.bone=c.bone??0,n.bump=c.bump||null,n.inter=!!c.inter,n.paint=c.paint??c.col!==void 0,n.po=!!c.paintOnly,this.prims.push(n),n}cap(n,c,e,i=e,d={}){n=R0(n),c=R0(c);let l=[c[0]-n[0],c[1]-n[1],c[2]-n[2]],o=l[0]*l[0]+l[1]*l[1]+l[2]*l[2];o<1e-10&&(l[1]=1e-5,o=1e-10);let a=e-i,s={t:0,a:n,b:c,ba:l,l2:o,rr:a,a2:o-a*a,il2:1/o,r0:e,r1:i},g=Math.max(e,i);return s.bb=[Math.min(n[0],c[0])-g,Math.min(n[1],c[1])-g,Math.min(n[2],c[2])-g,Math.max(n[0],c[0])+g,Math.max(n[1],c[1])+g,Math.max(n[2],c[2])+g],this._add(s,d)}ell(n,c,e={}){n=R0(n);let i={t:1,c:n,r:c,inv:null};e.m3?i.inv=e.m3:e.rot&&(i.inv=H0(e.rot[0],e.rot[1],e.rot[2]));let d=Math.max(c[0],c[1],c[2]);return i.bb=[n[0]-d,n[1]-d,n[2]-d,n[0]+d,n[1]+d,n[2]+d],this._add(i,e)}box(n,c,e=.005,i={}){n=R0(n);let d={t:2,c:n,h:c,rr:e,inv:null};i.m3?d.inv=i.m3:i.rot&&(d.inv=H0(i.rot[0],i.rot[1],i.rot[2]));let l=Math.hypot(c[0],c[1],c[2]);return d.bb=[n[0]-l,n[1]-l,n[2]-l,n[0]+l,n[1]+l,n[2]+l],this._add(d,i)}torus(n,c,e,i={}){n=R0(n);let d={t:3,c:n,R:c,r:e,inv:null};i.m3?d.inv=i.m3:i.rot&&(d.inv=H0(i.rot[0],i.rot[1],i.rot[2]));let l=c+e;return d.bb=[n[0]-l,n[1]-l,n[2]-l,n[0]+l,n[1]+l,n[2]+l],this._add(d,i)}chain(n,c,e={}){for(let i=0;i<n.length-1;i++)this.cap(n[i],n[i+1],c[i],c[i+1],{...e,k:e.k??.01});return this}dist(n,c,e,i){let d;if(n.t===0){let l=c-n.a[0],o=e-n.a[1],a=i-n.a[2],s=n.ba,g=n.l2,r=l*s[0]+o*s[1]+a*s[2],k=r-g,M=l*g-s[0]*r,u=o*g-s[1]*r,b=a*g-s[2]*r,f=M*M+u*u+b*b,p=r*r*g,h=k*k*g,m=Math.sign(n.rr)*n.rr*n.rr*f;Math.sign(k)*n.a2*h>m?d=Math.sqrt(f+h)*n.il2-n.r1:Math.sign(r)*n.a2*p<m?d=Math.sqrt(f+p)*n.il2-n.r0:d=(Math.sqrt(f*n.a2*n.il2)+r*n.rr)*n.il2-n.r0}else{let l=c-n.c[0],o=e-n.c[1],a=i-n.c[2];if(n.inv){let s=n.inv,g=s[0]*l+s[1]*o+s[2]*a,r=s[3]*l+s[4]*o+s[5]*a,k=s[6]*l+s[7]*o+s[8]*a;l=g,o=r,a=k}if(n.t===1){let s=n.r,g=Math.hypot(l/s[0],o/s[1],a/s[2]),r=Math.hypot(l/(s[0]*s[0]),o/(s[1]*s[1]),a/(s[2]*s[2]));d=r>1e-9?g*(g-1)/r:-Math.min(s[0],s[1],s[2])}else if(n.t===3)d=Math.hypot(Math.hypot(l,a)-n.R,o)-n.r;else{let s=n.h,g=n.rr,r=Math.abs(l)-s[0]+g,k=Math.abs(o)-s[1]+g,M=Math.abs(a)-s[2]+g;d=Math.hypot(Math.max(r,0),Math.max(k,0),Math.max(M,0))+Math.min(Math.max(r,k,M),0)-g}}return n.bump&&(d+=n.bump[0]*(O0(c*n.bump[1],e*n.bump[1],i*n.bump[1])-.5)*2),d}inBB(n,c,e,i,d){let l=n.bb;return c>l[0]-d&&e>l[1]-d&&i>l[2]-d&&c<l[3]+d&&e<l[4]+d&&i<l[5]+d}field(n,c,e,i){let d=r0;for(let l of this.prims){if(l.po||!this.inBB(l,n,c,e,i+l.k))continue;let o=this.dist(l,n,c,e);d=l.sub?L0(d,-o,l.k):l.inter?L0(d,o,l.k):z0(d,o,l.k)}return d}mesh(n){let c=this.prims,e=[r0,r0,r0],i=[-r0,-r0,-r0];for(let h of c)if(!h.sub&&!h.po)for(let m=0;m<3;m++)e[m]=Math.min(e[m],h.bb[m]-h.k),i[m]=Math.max(i[m],h.bb[m+3]+h.k);let d=n*2;for(let h=0;h<3;h++)e[h]-=d,i[h]+=d;let l=Math.ceil((i[0]-e[0])/n)+1,o=Math.ceil((i[1]-e[1])/n)+1,a=Math.ceil((i[2]-e[2])/n)+1,s=l*o*a,g=new Float32Array(s).fill(r0),r=n*2.5,k=l*o;for(let h of c){if(h.po)continue;let m=r+h.k+(h.bump?h.bump[0]:0),y=Math.max(0,Math.floor((h.bb[0]-m-e[0])/n)),w=Math.min(l-1,Math.ceil((h.bb[3]+m-e[0])/n)),R=Math.max(0,Math.floor((h.bb[1]-m-e[1])/n)),U=Math.min(o-1,Math.ceil((h.bb[4]+m-e[1])/n)),P=Math.max(0,Math.floor((h.bb[2]-m-e[2])/n)),D=Math.min(a-1,Math.ceil((h.bb[5]+m-e[2])/n));for(let B=P;B<=D;B++){let W=e[2]+B*n;for(let C=R;C<=U;C++){let E=e[1]+C*n,q=B*k+C*l+y;for(let _=y;_<=w;_++,q++){let Z=e[0]+_*n,N=this.dist(h,Z,E,W),J=g[q];g[q]=h.sub?L0(J,-N,h.k):h.inter?L0(J,N,h.k):z0(J,N,h.k)}}}}let M=[],u=[],b=[new Int32Array(s),new Int32Array(s),new Int32Array(s)],f=new Int32Array(12),p=(h,m,y,w,R,U,P)=>{let D=b[m];if(D[h])return D[h]-1;let B=U/(U-P),W=e[0]+y*n+(m===0?B*n:0),C=e[1]+w*n+(m===1?B*n:0),E=e[2]+R*n+(m===2?B*n:0),q=M.length/3;return M.push(W,C,E),D[h]=q+1,q};for(let h=0;h<a-1;h++)for(let m=0;m<o-1;m++){let y=h*k+m*l;for(let w=0;w<l-1;w++,y++){let R=y+1,U=y+l,P=U+1,D=y+k,B=D+1,W=D+l,C=W+1,E=g[y],q=g[R],_=g[P],Z=g[U],N=g[D],J=g[B],X=g[C],v=g[W],I=0;E>0&&(I|=1),q>0&&(I|=2),_>0&&(I|=4),Z>0&&(I|=8),N>0&&(I|=16),J>0&&(I|=32),X>0&&(I|=64),v>0&&(I|=128);let F=B0[I];if(!F)continue;F&1&&(f[0]=p(y,0,w,m,h,E,q)),F&2&&(f[1]=p(R,1,w+1,m,h,q,_)),F&4&&(f[2]=p(U,0,w,m+1,h,Z,_)),F&8&&(f[3]=p(y,1,w,m,h,E,Z)),F&16&&(f[4]=p(D,0,w,m,h+1,N,J)),F&32&&(f[5]=p(B,1,w+1,m,h+1,J,X)),F&64&&(f[6]=p(W,0,w,m+1,h+1,v,X)),F&128&&(f[7]=p(D,1,w,m,h+1,N,v)),F&256&&(f[8]=p(y,2,w,m,h,E,N)),F&512&&(f[9]=p(R,2,w+1,m,h,q,J)),F&1024&&(f[10]=p(P,2,w+1,m+1,h,_,X)),F&2048&&(f[11]=p(U,2,w,m+1,h+1,Z,v));let Y=I<<4;for(let G=0;w0[Y+G]!==-1;G+=3){let $=f[w0[Y+G]],V=f[w0[Y+G+1]],n0=f[w0[Y+G+2]];$!==V&&V!==n0&&$!==n0&&u.push($,V,n0)}}}return{pos:M,idx:u}}attributes(n,c,e,i=!0){let d=this.prims,l=n.length/3,o=i?new Float32Array(l*3):null,a=new Float32Array(l*3),s=new Float32Array(l),g=c.skin?new Uint16Array(l*4):null,r=c.skin?new Float32Array(l*4):null,k=c.boneParent||null,M=(m,y)=>{if(!k)return!0;let w=k[m],R=k[y];return w===y||R===m||w>=0&&k[w]===y||R>=0&&k[R]===m},u=e*.5,b=e*2,f=c.ao||0,p=c.aoK??1.25,h=new Float32Array(l).fill(1);for(let m=0;m<l;m++){let y=n[m*3],w=n[m*3+1],R=n[m*3+2],U=1;if(o){let I=this.field(y+u,w,R,b)-this.field(y-u,w,R,b),F=this.field(y,w+u,R,b)-this.field(y,w-u,R,b),Y=this.field(y,w,R+u,b)-this.field(y,w,R-u,b),G=Math.hypot(I,F,Y)||1,$=I/G,V=F/G,n0=Y/G;if(o[m*3]=$,o[m*3+1]=V,o[m*3+2]=n0,f>0){let c0=0,t0=1,L=0;for(let z=1;z<=5;z++){let x=f*z/5,S=this.field(y+$*x,w+V*x,R+n0*x,b+x);c0+=Math.max(0,x-Math.min(S,x))/x*t0,L+=t0,t0*=.75}U=Math.max(.22,1-c0/L*p)}}let P=r0,D=r0,B=null,W=null,C=null,E=r0,q=null,_=0;for(let I of d){if(!this.inBB(I,y,w,R,b+I.k+.03))continue;let F=this.dist(I,y,w,R);if(I.po){let Y=Math.min(1,Math.max(0,.5-F/(2*Math.max(e,.002))));Y>0&&(q=I,_=Y);continue}if(I.sub){I.paint&&-F>E-I.k*.6&&(C=I);continue}I.inter||(E=z0(E,F,I.k),F<P?(D=P,W=B,P=F,B=I):F<D&&(D=F,W=I))}if(!B){a[m*3]=a[m*3+1]=a[m*3+2]=1,r&&(r[m*4]=1);continue}let Z=Math.max(B.k,.004),N=W?Math.min(1,Math.max(0,.5+(D-P)/(2*Z))):1,J=C,X=J?J.col:B.col,v=J?J.col:W?W.col:B.col;if(a[m*3]=X[0]*N+v[0]*(1-N),a[m*3+1]=X[1]*N+v[1]*(1-N),a[m*3+2]=X[2]*N+v[2]*(1-N),s[m]=J?J.region:B.region,q&&!J){let I=_,F=q.col;a[m*3]+=(F[0]-a[m*3])*I,a[m*3+1]+=(F[1]-a[m*3+1])*I,a[m*3+2]+=(F[2]-a[m*3+2])*I,I>=.5&&(s[m]=q.region)}if(h[m]=U,g){let I=null,F=r0;if(W&&W.bone!==B.bone&&M(B.bone,W.bone))I=W,F=D;else for(let $ of d){if($.sub||$.inter||$.po||$.bone===B.bone||!M(B.bone,$.bone)||!this.inBB($,y,w,R,b+.06))continue;let V=this.dist($,y,w,R);V<F&&(F=V,I=$)}let Y=Math.max(B.k,.035),G=I?Math.min(1,Math.max(0,.5+(F-P)/(2*Y))):1;g[m*4]=B.bone,r[m*4]=G,G<1&&(g[m*4+1]=I.bone,r[m*4+1]=1-G)}}return{normal:o,color:a,ao:h,aMat:s,skinIndex:g,skinWeight:r}}borderLocks(n,c,e,i){let d=n.length/3,l=new Uint8Array(d);for(let o=0;o<c.length;o+=3){let a=c[o],s=c[o+1],g=c[o+2],r=i[a]!==i[s]||i[s]!==i[g];if(!r)for(let k=0;k<3&&!r;k++){let M=e[a*3+k],u=e[s*3+k],b=e[g*3+k],f=Math.max(M,u,b),p=Math.min(M,u,b);f-p>.05+f*.15&&(r=!0)}r&&(l[a]=1,l[s]=1,l[g]=1)}return l}build(n={}){let c=n.voxel??.01,{pos:e,idx:i}=this.mesh(c),d=(r,k,M)=>{if(!k.length)return;let u=0;for(let b=0;b<Math.min(k.length,3e3);b+=3){let f=k[b]*3,p=k[b+1]*3,h=k[b+2]*3,m=r[p]-r[f],y=r[p+1]-r[f+1],w=r[p+2]-r[f+2],R=r[h]-r[f],U=r[h+1]-r[f+1],P=r[h+2]-r[f+2],D=y*P-w*U,B=w*R-m*P,W=m*U-y*R;u+=D*M[f]+B*M[f+1]+W*M[f+2]>0?1:-1}if(u<0)for(let b=0;b<k.length;b+=3){let f=k[b+1];k[b+1]=k[b+2],k[b+2]=f}},l=(r,k,M)=>{let u=r.length/3,b=u>65535?Uint32Array.from(k):Uint16Array.from(k);d(r,b,M.normal);let f=new Float32Array(M.color);for(let p=0;p<u;p++){let h=M.ao[p];f[p*3]*=h,f[p*3+1]*=h,f[p*3+2]*=h}return{position:r instanceof Float32Array?r:new Float32Array(r),normal:M.normal,color:f,aMat:M.aMat,skinIndex:M.skinIndex,skinWeight:M.skinWeight,index:b,tris:k.length/3}};if(!n.lods)return l(new Float32Array(e),i,this.attributes(e,n,c));let o=[],a=new Float32Array(e),s=Uint32Array.from(i),g=this.attributes(a,{skin:!1},c,!1);for(let r=0;r<n.lods.length;r++){let k=n.lods[r],M=r<2?this.borderLocks(a,s,g.color,g.aMat):null,u=T0(a,s,{maxErr:k,lock:M}),b=this.attributes(u.position,n,c);o.push(l(u.position,u.index,b)),a=u.position,s=u.index,g=b}return{lods:o}}};var T=(t,n)=>[t[0]+n[0],t[1]+n[1],t[2]+n[2]],g0=(t,n,c)=>[t[0]+(n[0]-t[0])*c,t[1]+(n[1]-t[1])*c,t[2]+(n[2]-t[2])*c],u0=(t,n)=>[t[0]*n,t[1]*n,t[2]*n],I0=[1,0,0,0,1,0,0,0,1];function _0(t,n,c){let e=Math.cos(t),i=Math.sin(t),d=Math.cos(n),l=Math.sin(n),o=Math.cos(c),a=Math.sin(c),s=e*o,g=e*a,r=i*o,k=i*a;return[d*o,-d*a,l,g+r*l,s-k*l,-i*d,k-s*l,r+g*l,e*d]}function Y0(t,n){let c=new Array(9);for(let e=0;e<3;e++)for(let i=0;i<3;i++)c[e*3+i]=t[e*3]*n[i]+t[e*3+1]*n[3+i]+t[e*3+2]*n[6+i];return c}var A0=(t,n)=>[t[0]*n[0]+t[1]*n[1]+t[2]*n[2],t[3]*n[0]+t[4]*n[1]+t[5]*n[2],t[6]*n[0]+t[7]*n[1]+t[8]*n[2]],$0=t=>[t[0],t[3],t[6],t[1],t[4],t[7],t[2],t[5],t[8]];function p0(){let t=[],n={},c={},e={};return{bones:t,idx:n,world:c,rotW:e,add:(o,a,s,g,r,k)=>{let M=k?_0(k[0],k[1],k[2]):I0,u=a==null?-1:n[a];return t.push({name:o,parent:u,pos:[s,g,r],rot:k?k.slice():null}),n[o]=t.length-1,u<0?(c[o]=[s,g,r],e[o]=M):(c[o]=T(c[a],A0(e[a],[s,g,r])),e[o]=Y0(e[a],M)),o},pt:(o,a)=>T(c[o],A0(e[o],a)),inv:o=>$0(e[o])}}function k0(t){let n={region:t.plastic?22:t.muscle?25:20,col:t.color},c=e=>e?{region:21,col:e}:n;return{skin:n,top:c(t.top),bottom:c(t.bottom),shoe:t.shoe?{region:22,col:t.shoeCol||[.05,.045,.04]}:null}}var W0=[.2,.2,.21];function J0(t){let n=t.height,c=n*(t.leg??.47),e=n*.038,i=c*.52,d=c*.48-e,l=n*(t.torso??.3),o=n*(t.neck??.055),a=n*(t.head??.065),s=n*(t.arm??.43),g=s*.47,r=s*.53,k=t.thick??1,M=t.gaunt??0,u=t.fat??0,b=Math.max(.097*n*k*(1-M*.12),.084*n*k*(1+u*.45)),f=Math.max(n*(t.shoulder??.12),b+.041*n*k*(1-M*.38)*.6),p=n*(t.hips??.07),h=t.aPose??.42+Math.max(0,k-1)*.25+u*.3,m=p0();m.add("root",null,0,0,0),m.add("hips","root",0,c,0),m.add("spine","hips",0,.02*n,0),m.add("chest","spine",0,l,0),m.add("neck","chest",0,0,0),m.add("head","neck",0,o,0);let y=(R,U,P,D)=>{m.add(R+".root","chest",U*f,-.02*n+P,0),m.add(R+".up",R+".root",0,0,0,[0,0,U*D]),m.add(R+".el",R+".up",0,-g,0),m.add(R+".hand",R+".el",0,-r,0)},w=t.fourArms?h-.15:h;if(y("armL",-1,0,w),y("armR",1,0,w),t.fourArms&&(y("armL2",-1,-n*.1,h+.45),y("armR2",1,-n*.1,h+.45)),!t.noLegs)for(let[R,U]of[["legL",-1],["legR",1]])m.add(R+".th","hips",U*p,0,0,[0,0,U*.035]),m.add(R+".kn",R+".th",0,-i,0),m.add(R+".an",R+".kn",0,-d,0,[0,0,-U*.035]);return{R:m,dims:{H:n,legL:c,thL:i,shL:d,footH:e,torsoL:l,neckL:o,headR:a,upL:g,foL:r,sw:f,hw:p,AP:h}}}function V0(t,n,c={}){let{R:e,dims:i}=n,d=e.world,l=e.idx,{H:o,torsoL:a,upL:s,foL:g,thL:r,shL:k,hw:M,footH:u}=i,b=new s0,f=t.thick??1,p=t.gaunt??0,h=t.fat??0,m=o/1.8,y=v=>v*m,w=k0(t),R=w.skin,U=c.suit?{region:23,col:c.suit}:null,P=U||w.top,D=U||w.bottom,B=!U&&!t.top,W=U?[.0055*m,13/m]:t.lumpy?[.008*m,15/m]:p>.3?[.0022*m,38/m]:[.0012*m,34/m],C=d.hips[1],E=d.chest[1],q=l.hips,_=l.spine,Z=l.chest,N=(v,I,F,Y)=>{t.jointBalls&&b.torus(v,I,.0045*o,{sub:!0,...R,paint:!1,bone:Y,k:y(.0015),m3:F})},J=M*1.32+.025*o*(f-1);if(b.ell([0,C+.01*o,-.005*o],[J,.064*o*Math.sqrt(f),.075*o*f*(1+h*.3)],{...D,bone:q,k:y(.03),bump:W}),!t.noLegs)for(let v of[-1,1])b.ell([v*M*.62,C-.012*o,-.04*o*f],[.05*o*f*(1-p*.3),.056*o,.045*o*f*(1-p*.3)],{...D,bone:q,k:y(.03),bump:W});if(b.cap([0,C+.03*o,.004*o],[0,E-.42*a,.01*o*(1+h)],.074*o*f*(1-p*.35)*(1+h*.9),.084*o*f*(1+h*.45),{...P,bone:_,k:y(.04),bump:W}),h>0&&b.ell([0,C+.11*o,.05*o*f],[.1*o*f*(.6+h),.1*o*(.5+h*.5),.07*o*f*h],{...P,bone:_,k:y(.05),bump:W}),b.ell([0,E-.32*a,.004*o],[.097*o*f*(1-p*.12),.14*o,.07*o*f*(1+h*.2)],{...P,bone:_,k:y(.035),bump:W}),p>.3&&B){for(let v=0;v<6;v++)for(let I of[-1,1]){let F=E-.13*a-v*.085*a,Y=.0062*o;b.chain([[I*.02*o,F,.071*o*f],[I*.058*o,F-.012*o,.06*o*f],[I*.086*o,F-.03*o,.03*o*f],[I*.094*o,F-.042*o,-.01*o]],[Y,Y,Y*.9,Y*.7],{...R,bone:_,k:y(.008)})}b.cap([0,E-.08*a,.074*o*f],[0,E-.55*a,.07*o*f],.009*o,.007*o,{...R,bone:_,k:y(.01)});for(let v=0;v<9;v++)b.ell([0,E+.02*o-v*.1*a,-.067*o*f-(v>6?.008*o:0)],[.012*o,.008*o,.012*o],{...R,bone:v<3?Z:_,k:y(.01)});b.ell([0,E-.62*a,.075*o*f],[.07*o*f,.05*o,.03*o],{sub:!0,...R,paint:!1,bone:_,k:y(.03)})}else if(B&&!t.plastic)for(let v of[-1,1])b.ell([v*.045*o,E-.1*a,.05*o*f],[.045*o*f,.035*o,.03*o*f],{...R,bone:Z,k:y(.03)});for(let v of[-1,1])b.ell([v*.055*o,E-.12*a,-.055*o*f],[.045*o*f,.06*o,.022*o*f],{...P,bone:Z,k:y(.03)});for(let v of[-1,1]){let I=d[(v<0?"armL":"armR")+".root"];b.cap([v*.02*o,E+.012*o,-.012*o],[I[0]*.92,I[1]+.01*o,-.008*o],.036*o*f*(1-p*.3),.04*o*f*(1-p*.2),{...P,bone:Z,k:y(.03)}),p>.25&&!U&&b.cap([v*.012*o,E-.016*o,.05*o*f],[I[0]*.86,I[1]+.006*o,.026*o*f],.009*o,.008*o,{...R,bone:Z,k:y(.008)})}if(b.cap([0,E-.01*o,-.006*o],[0,d.head[1]+.02*o,-.004*o],.033*o*f*(1-p*.25),.028*o*f*(1-p*.2),{...U||R,bone:l.neck,k:y(.025),bump:W}),p>.3&&!U)for(let v of[-1,1])b.cap([v*.028*o,d.head[1]+.01*o,-.006*o],[v*.012*o,E-.006*o,.032*o],.008*o,.007*o,{...R,bone:l.neck,k:y(.008)});N([0,E+.012*o,-.004*o],.03*o*f,I0,l.neck),t.jointBalls&&N([0,C+.075*o,.004*o],.075*o*f,I0,_);let X=[["armL",-1],["armR",1]];t.fourArms&&X.push(["armL2",-1],["armR2",1]);for(let[v,I]of X){let F=d[v+".root"],Y=d[v+".el"],G=d[v+".hand"],$=l[v+".up"],V=l[v+".el"],n0=e.inv(v+".up"),c0=e.inv(v+".el"),t0=A=>e.pt(v+".up",A),L=A=>e.pt(v+".el",A),z=U||(t.shortSleeve?t.top?P:R:P),x=U||(t.shortSleeve?R:P),S=f*(1-p*.3);b.ell(t0([I*.004*o,-.012*o,0]),[.047*o*S,.056*o*f,.047*o*S],{...z,bone:$,k:y(.025),bump:W,m3:n0}),b.cap(t0([0,-.02*o,0]),Y,.041*o*f*(1-p*.38),.03*o*f*(1-p*.3),{...z,bone:$,k:y(.02),bump:W}),p<.6&&(b.ell(t0([0,-s*.47,.012*o*f]),[.033*o*f*(1-p),.075*o,.032*o*f*(1-p)],{...z,bone:$,k:y(.02),m3:n0}),b.ell(t0([0,-s*.4,-.014*o*f]),[.03*o*f*(1-p),.08*o,.03*o*f*(1-p)],{...z,bone:$,k:y(.02),m3:n0})),b.ell(Y,[.029*o*f*(1-p*.2),.03*o*f,.029*o*f],{...x,bone:V,k:y(.015)});let H=.021*o*f*(1-p*.15);b.cap(Y,G,.033*o*f*(1-p*.32),H,{...x,bone:V,k:y(.02),bump:W}),p<.6&&b.ell(L([0,-g*.27,.004*o]),[.031*o*f*(1-p*.6),.065*o,.027*o*f*(1-p*.6)],{...x,bone:V,k:y(.02),m3:c0}),U&&b.cap(L([0,-g*.83,0]),L([0,-g*.95,0]),H*1.22,H*1.22,{region:21,col:W0,bone:V,k:y(.004)}),t.shortSleeve&&!U&&t.top&&b.torus(t0([0,-s*.55,0]),.034*o*f,.006*o,{...P,bone:$,k:y(.006),m3:n0}),N(t0([0,-.02*o,0]),.043*o*f,n0,$),N(Y,.03*o*f,c0,V),N(G,H*1.02,c0,V)}if(t.noLegs)b.cap([0,C,0],[0,C-.5*o,-.12*o],.08*o*f,.008*o,{...D,bone:q,k:y(.05),bump:[.02*m,6]});else for(let[v,I]of[["legL",-1],["legR",1]]){let F=d[v+".kn"],Y=d[v+".an"],G=l[v+".th"],$=l[v+".kn"],V=l[v+".an"],n0=e.inv(v+".th"),c0=e.inv(v+".kn"),t0=H=>e.pt(v+".th",H),L=H=>e.pt(v+".kn",H),z=H=>e.pt(v+".an",H),x=Math.min(.062*o*f*(1-p*.38)*(1+h*.35),M-.013*o);b.cap(t0([0,.025*o,0]),F,x,.039*o*f*(1-p*.25),{...D,bone:G,k:y(.03),bump:W}),p<.6&&b.ell(t0([I*.004*o,-r*.42,.014*o*f]),[Math.min(.05*o*f*(1-p*.8),x*.85),.11*o,.048*o*f*(1-p*.8)],{...D,bone:G,k:y(.03),m3:n0}),b.ell(L([0,.004*o,.016*o*f]),[.028*o*f,.03*o,.022*o*f],{...D,bone:$,k:y(.015)});let S=t.skirt||t.shorts?R:D;if(b.cap(F,Y,.04*o*f*(1-p*.32),.024*o*f*(1-p*.1),{...S,bone:$,k:y(.02),bump:W}),p<.7&&b.ell(L([0,-k*.3,-.013*o*f]),[.034*o*f*(1-p*.7),.08*o,.036*o*f*(1-p*.7)],{...S,bone:$,k:y(.02),m3:c0}),U&&b.cap(L([0,-k*.78,0]),L([0,-k*.9,0]),.032*o,.031*o,{region:21,col:W0,bone:$,k:y(.004)}),N(t0([0,0,0]),x*1.02,n0,G),N(F,.04*o*f,c0,$),N(Y,.025*o*f,c0,$),w.shoe||c.boots){let H=c.boots?{region:22,col:c.boots}:w.shoe;b.box(z([0,-u*.48,.034*o]),[.03*o,u*.55,.074*o],.016*o,{...H,bone:V,k:y(.02)}),b.ell(z([0,-u*.2,-.01*o]),[.029*o,u*.85,.036*o],{...H,bone:V,k:y(.02)}),c.boots?(b.cap(z([0,-u*.3,0]),z([0,.08*o,0]),.034*o,.033*o,{...H,bone:V,k:y(.02)}),b.box(z([0,-u*.93,.034*o]),[.032*o,u*.1,.077*o],.004*o,{region:22,col:[.012,.012,.012],bone:V,k:y(.006)})):b.box(z([0,-u*.92,.034*o]),[.031*o,u*.1,.076*o],.004*o,{region:22,col:u0(H.col,.6),bone:V,k:y(.004)})}else{b.ell(z([0,-u*.45,-.018*o]),[.022*o,u*.62,.03*o],{...R,bone:V,k:y(.02)}),b.cap(z([0,-u*.48,-.004*o]),z([0,-u*.72,.074*o]),.024*o*(1-p*.2),.018*o,{...R,bone:V,k:y(.016)});let H=I<0?4:0;for(let A=0;A<5;A++){let j=Math.abs(A-H);b.cap(z([(A-2)*.0095*o,-u*.8,.08*o]),z([(A-2)*.0105*o,-u*.88,.1*o-j*.0045*o]),.0062*o*(A===H?1.35:1),.005*o*(A===H?1.2:1),{...R,bone:V,k:y(.004)}),t.claw&&b.cap(z([(A-2)*.0105*o,-u*.88,.1*o-j*.0045*o]),z([(A-2)*.011*o,-u*.98,.115*o-j*.0045*o]),.004*o,8e-4*o,{region:26,col:[.3,.27,.2],bone:V,k:y(.002)})}}}if(t.skirt&&(b.cap([0,C+.07*o,0],[0,C-.17*o,.005*o],.095*o*f,.15*o*f,{...P,bone:q,k:y(.02),bump:[.006*m,14]}),b.torus([0,C-.17*o,.005*o],.145*o*f,.006*o,{...P,bone:q,k:y(.008)})),t.apron){b.box([0,C+.02*o,.1*o*f*(1+h)],[.085*o*f*(1+h*.3),.2*o,.075*o*f*(1+h)],.02*o,{region:21,col:t.apron,paintOnly:!0});for(let v=0;v<5;v++)b.ell([(v*.37%1-.5)*.12*o*f,C+(.1-v*.06)*o,.12*o*f*(1+h)],[.03*o,.045*o,.08*o*f],{region:21,col:[.16,.02,.015],paintOnly:!0})}if(t.stains)for(let v=0;v<t.stains;v++){let I=v*2.4,F=C+(.05+v*.618%1*.35)*o;b.ell([Math.sin(I)*.1*o*f,F,Math.cos(I)*.1*o*f],[.035*o,.05*o,.035*o],{region:21,col:t.stainCol||[.14,.03,.02],paintOnly:!0})}if(c.tank){b.cap([0,E-.44*a,-.11*o],[0,E+.025*o,-.11*o],.055*o,.055*o,{region:33,col:c.tank,bone:_,k:y(.006)}),b.cap([0,E+.025*o,-.11*o],[0,E+.06*o,-.11*o],.03*o,.016*o,{region:6,col:[.5,.5,.52],bone:_,k:y(.004)}),b.box([0,E-.2*a,-.072*o],[.062*o,.15*o,.012*o],.008*o,{region:28,col:[.05,.05,.05],bone:_,k:y(.01)});for(let v of[-1,1])b.chain([[v*.06*o,E+.012*o,-.06*o],[v*.07*o,E+.016*o,.03*o],[v*.066*o,E-.35*a,.087*o*f],[v*.07*o,C+.04*o,.064*o]],[.011*o,.011*o,.011*o,.011*o],{region:21,col:[.06,.06,.065],bone:_,k:y(.004)});b.cap([-.08*o,C+.045*o,.06*o*f],[.08*o,C+.045*o,.06*o*f],.012*o,.012*o,{region:21,col:[.06,.06,.065],bone:_,k:y(.004)}),b.chain([[.02*o,E+.04*o,-.1*o],[.07*o,E+.03*o,-.02*o],[.06*o,E-.05*o,.08*o*f]],[.008*o,.008*o,.008*o],{region:28,col:[.03,.03,.035],bone:Z,k:y(.004)})}return b}function j0(t,n,c,e){let i=new s0,d=t.thick??1,l=t.gaunt??0,o=n/1.8,a=f=>f*o,s=c.glove?{region:22,col:c.glove}:k0(t).skin,g=(t.handScale??1)*(c.glove?1.1:1),r=o*g,k=(c.glove?.025:.021)*n*d*(1-l*.15);i.cap([0,.05*n,0],[0,-.012*r,0],k*.88,k*.92,{...s,k:a(.006)}),c.glove&&i.cap([0,.05*n,0],[0,.004*n,0],k*1.3,k*1.18,{...s,k:a(.004)});let M=[0,-.045*r,.004*r];i.box(M,[.013*r*d,.042*r,.036*r],.011*r,{...s,k:a(.012)}),i.ell(T(M,[e*.006*r,0,0]),[.01*r,.035*r,.03*r],{...s,k:a(.01)});let u=n*(t.fingers??.055)*(c.glove?.9:1),b=.0082*r*(1-l*.25)*(c.glove?1.25:1);return[.026,.009,-.008,-.025].forEach((f,p)=>{let h=u*[.92,1,.95,.78][p],m=T(M,[0,-.04*r,f*r]),y=-e*(t.claw?.012:.006)*r,w=T(m,[y*.3,-h*.45,0]),R=T(w,[y,-h*.32,0]),U=T(R,[y*1.6,-h*.23,-f*r*.05]);i.chain([m,w,R,U],[b*1.05,b,b*.9,b*(t.claw?.4:.8)],{...s,k:a(.005)}),l>.3&&!c.glove&&(i.ell(w,[b*1.15,b*1.2,b*1.15],{...s,k:a(.003)}),i.ell(R,[b*1.08,b*1.1,b*1.08],{...s,k:a(.003)})),t.claw?i.cap(U,T(U,[y*2,-.022*r,0]),b*.5,.001,{region:26,col:[.32,.29,.22],k:a(.002)}):c.glove||i.ell(T(U,[-e*b*.45,b*.2,0]),[b*.35,b*.7,b*.6],{region:26,col:u0(t.color,1.25),k:a(.002)})}),i.chain([T(M,[-e*.006*r,.02*r,.03*r]),T(M,[-e*.016*r,-.022*r,.05*r]),T(M,[-e*.02*r,-.055*r,.052*r])],[b*1.3,b*1.1,b*.9],{...s,k:a(.008)}),i}function q0(t,n,c={}){let e=t.headScale||[1,1.18,1.05],i=new s0,d=c.origin||[0,0,0],l=(u,b,f)=>[d[0]+u*n,d[1]+b*n,d[2]+f*n],o=t.gaunt??0,a=k0(t).skin,s=n*.15,g=t.lumpy?[.03*n,1.6/n]:o>.3?[.012*n,4.5/n]:[.005*n,5/n];if(c.hood){let u={region:23,col:c.hood};i.ell(l(0,1,-.06),[1.06,1.24,1.13].map(b=>b*n),{...u,k:s,bump:[.03*n,2.4/n]}),i.cap(l(0,-.3,-.1),l(0,.5,-.05),.82*n,.92*n,{...u,k:s*2,bump:[.03*n,3/n]}),i.ell(l(0,1.02,.6),[.86*n,.7*n,.52*n],{region:28,col:[.06,.06,.065],k:s*.2}),i.ell(l(0,1.02,.64),[.77*n,.61*n,.5*n],{region:24,col:[.02,.025,.03],k:s*.1}),i.cap(l(0,.42,.86),l(0,.38,1.14),.3*n,.25*n,{region:28,col:[.05,.05,.055],k:s*.4});for(let b=0;b<4;b++)i.torus(l(0,.4,.93+b*.05),.27*n,.02*n,{region:28,col:[.035,.035,.04],k:s*.1,rot:[Math.PI/2,0,0]});for(let b of[-1,1])i.cap(l(b*.42,.33,.82),l(b*.74,.22,1.06),.23*n,.23*n,{region:33,col:[.08,.08,.085],k:s*.2}),i.cap(l(b*.74,.22,1.06),l(b*.78,.2,1.1),.18*n,.18*n,{region:28,col:[.03,.03,.03],k:s*.1});return i.ell(l(0,2.12,-.05),[.18*n,.06*n,.18*n],{region:28,col:[.08,.08,.08],k:s*.3}),i}let r=t.plastic?{region:22,col:t.color}:a;if(i.ell(l(0,1.08,-.06),[.9*e[0]*n,1.08*e[1]*n,1*e[2]*n],{...r,k:s,bump:g}),i.ell(l(0,.78,.36),[.68*e[0]*n,.72*n,.62*n],{...r,k:s*1.6}),t.plastic){i.cap(l(0,1,.9),l(0,.8,1),.08*n,.1*n,{...r,k:s}),i.cap(l(-.45,1.24,.8),l(.45,1.24,.8),.09*n,.09*n,{...r,k:s*.9}),i.ell(l(0,.32,.62),[.3*n,.22*n,.28*n],{...r,k:s});for(let u of[-1,1])i.ell(l(u*.34,1.04,.86),[.17*n,.1*n,.1*n],{sub:!0,...r,paint:!1,k:s*.6});return c.noNeck||i.cap(l(0,-.3,-.1),l(0,.4,-.05),.42*n,.5*n,{...r,k:s*2}),i}let k=t.gape??.15;i.cap(l(-.55,1.28,.78),l(.55,1.28,.78),.13*n,.13*n,{...a,k:s*.8});for(let u of[-1,1])i.ell(l(u*.55,.86,.66),[.24*n,.15*n,.22*n],{...a,k:s*.7});let M=.16-k*.9;for(let u of[-1,1])i.cap(l(u*.6,.62,.12),l(u*.18,M+.05,.72),.17*n*(1-o*.3),.15*n,{...a,k:s*.9});if(i.ell(l(0,M,.76),[.22*n,.17*n,.17*n],{...a,k:s*.8}),o>.3){for(let u of[-1,1])i.ell(l(u*.48,.62,.72),[.2*n,.18*n,.14*n],{sub:!0,...a,paint:!1,k:s*1.2});for(let u of[-1,1])i.ell(l(u*.84,1.18,.38),[.12*n,.2*n,.22*n],{sub:!0,...a,paint:!1,k:s*1.2})}if(t.noNose)i.ell(l(0,.88,1),[.1*n,.16*n,.14*n],{sub:!0,region:25,col:[.06,.01,.01],k:s*.3});else{i.cap(l(0,1.1,.92),l(0,.82,1.1),.07*n,.1*n,{...a,k:s*.6});for(let u of[-1,1])i.ell(l(u*.11,.8,1),[.07*n,.06*n,.07*n],{...a,k:s*.4});for(let u of[-1,1])i.ell(l(u*.06,.75,1.07),[.035*n,.028*n,.035*n],{sub:!0,region:25,col:[.08,.02,.02],k:s*.15})}for(let u of[-1,1])t.sockets?(i.ell(l(u*.34,1.04,.92),[.2*n,.15*n,.22*n],{sub:!0,region:25,col:[.025,.008,.006],k:s*.5}),i.ell(l(u*.34,1.05,.7),[.11*n,.09*n,.08*n],{region:26,col:[.05,.04,.035],k:s*.2})):(i.ell(l(u*.34,1.04,.86),[.18*n,.13*n,.16*n],{sub:!0,...a,paint:!1,k:s*.3}),i.ell(l(u*.34,1.03,.78),[.12*n,.12*n,.12*n],{region:26,col:t.eyeCol||[.55,.52,.42],k:s*.08}),i.cap(l(u*.2,1.12,.86),l(u*.48,1.1,.82),.045*n,.04*n,{...a,k:s*.25}),i.cap(l(u*.22,.95,.86),l(u*.46,.95,.82),.03*n,.03*n,{...a,k:s*.25}));if(i.ell(l(0,.48-k*.3,.88),[.3*n,(.07+k*.32)*n,.34*n],{sub:!0,region:25,col:[.05,.008,.007],k:s*.35}),o<.45&&(i.cap(l(-.24,.56,.9),l(.24,.56,.9),.05*n,.05*n,{...a,col:u0(t.color,.85),k:s*.3}),i.cap(l(-.22,.4-k*.6,.88),l(.22,.4-k*.6,.88),.055*n,.055*n,{...a,col:u0(t.color,.85),k:s*.3})),t.teeth!==!1)for(let u=0;u<8;u++){let b=(u/7-.5)*1.6,f=Math.sin(b)*.26,p=.82+Math.cos(b)*.14-.14,h=t.fangs&&(u===1||u===6)?1.8:1;i.ell(l(f,.56-k*.05-(h-1)*.05,p),[.04*n,.065*n*h,.032*n],{region:26,col:t.toothCol||[.62,.56,.42],k:s*.06}),k>.3&&i.ell(l(f*.95,.38-k*.62,p-.02),[.036*n,.055*n,.03*n],{region:26,col:t.toothCol||[.6,.54,.4],k:s*.06})}if(!t.noEars)for(let u of[-1,1])i.ell(l(u*.9,.95,.02),[.07*n,.22*n,.14*n],{...a,k:s*.4}),i.ell(l(u*.97,.93,.05),[.04*n,.13*n,.08*n],{sub:!0,...a,paint:!1,k:s*.2});if(c.noNeck||i.cap(l(0,-.35,-.12),l(0,.45,-.08),.42*n*(1-o*.2),.5*n,{...a,k:s*1.5}),t.bandage){let u={region:21,col:t.bandageCol||[.6,.58,.52]};i.ell(l(0,1.28,-.06),[.97*e[0]*n,.85*e[1]*n,1.07*e[2]*n],{...u,k:s*.3,bump:[.03*n,3/n]}),i.ell(l(.06,1.03,.66),[.7*n,.17*n,.42*n],{...u,k:s*.3,rot:[0,0,.25],bump:[.02*n,4/n]})}return i}function G0(t){let n=t.len,c=t.legH,e=t.bodyR,i=p0();i.add("root",null,0,0,0),i.add("body","root",0,c,0);let d=t.upper??.55,l=t.legR*.9,o=t.width??e*.85,a=c-e*.2-l,s=[["leg0",-o,n*.42,!0],["leg1",o,n*.42,!0],["leg2",-o,-n*.42,!1],["leg3",o,-n*.42,!1]],g={};for(let[r,k,M,u]of s){let b=u?t.frontRest??0:t.backRest??0,f=u?t.frontKnee??0:t.backKnee??0,p=a/Math.max(.35,d*Math.cos(b)+(1-d)*Math.cos(b+f)),h=p*d,m=p*(1-d);g[r]=[h,m],i.add(r+".up","body",k,-e*.2,M,[b,0,0]),i.add(r+".lo",r+".up",0,-h,0,[f,0,0]),i.add(r+".hand",r+".lo",0,-m,0,[-(b+f),0,0])}return i.add("neck","body",0,e*.2,n*.48,[t.neckPitch??-.5,0,0]),i.add("head","neck",0,t.neckL,0,[-(t.neckPitch??-.5)+(t.headPitch??0),0,0]),t.jaw&&i.add("jaw","head",0,-t.headR*.3,t.headR*.3),t.tail&&i.add("tail","body",0,e*.25,-n*.47,[t.tailRest??1.1,0,0]),{R:i,dims:{L:n,h:c,R0:e,pawH:l,seg:g}}}function Q0(t,n){let{R:c,dims:e}=n,i=c.world,d=c.idx,{L:l,R0:o,pawH:a}=e,s=new s0,g=t.thick??1,r=o*.6,k=k0(t).skin,M=t.muscle?[.035*o,9/o*.1]:[.05*o,7/o*.1],u=i.body,b=d.body;if(t.humanoid){s.ell(T(u,[0,o*.1,l*.24]),[o*1.05*g,o*.85,l*.26],{...k,bone:b,k:r*.5,bump:M}),s.cap(T(u,[0,o*.05,l*.05]),T(u,[0,o*.08,-l*.25]),o*.55*g,o*.72*g,{...k,bone:b,k:r*.5,bump:M}),s.ell(T(u,[0,o*.1,-l*.36]),[o*.95*g,o*.7,l*.16],{...k,bone:b,k:r*.5,bump:M});for(let h of[-1,1])s.ell(T(u,[h*o*.45,o*.2,-l*.47]),[o*.45,o*.5,o*.45],{...k,bone:b,k:r*.4});for(let h=0;h<7;h++)for(let m of[-1,1]){let y=l*(.4-h*.055),w=o*.07;s.chain([T(u,[m*o*.2,o*.88,y]),T(u,[m*o*.85,o*.45,y-l*.01]),T(u,[m*o*.95,-o*.2,y-l*.02]),T(u,[m*o*.4,-o*.7,y-l*.03])],[w,w,w*.9,w*.7],{...k,bone:b,k:r*.1})}for(let h of[-1,1])s.ell(T(u,[h*o*.55,o*.75,l*.3]),[o*.32,o*.1,o*.45],{...k,bone:b,k:r*.2})}else{if(s.ell(T(u,[0,o*.05,l*.22]),[o*.95*g,o*1.15,l*.34],{...k,bone:b,k:r,bump:M}),s.ell(T(u,[0,o*.22,-l*.05]),[o*.72*g,o*.72,l*.32],{...k,bone:b,k:r,bump:M}),s.ell(T(u,[0,o*.08,-l*.33]),[o*.85*g,o*.9,l*.22],{...k,bone:b,k:r,bump:M}),t.ribs)for(let h=0;h<7;h++)for(let m of[-1,1]){let y=l*(.32-h*.07),w=o*.06;s.chain([T(u,[m*o*.25,o*.95,y]),T(u,[m*o*.85,o*.45,y-l*.01]),T(u,[m*o*.9,-o*.3,y-l*.02]),T(u,[m*o*.35,-o*.95,y-l*.03])],[w,w,w,w*.8],{...k,bone:b,k:r*.15})}if(t.plates)for(let h=0;h<6;h++)s.ell(T(u,[0,o*.95,l*(.36-h*.14)]),[o*.8*g,o*.28,l*.09],{region:26,col:u0(t.color,.7),bone:b,k:r*.15,bump:[.03*o,9/o*.1]})}for(let h=0;h<9;h++)s.ell(T(u,[0,o*1-Math.abs(h-4)*o*.02,l*(.4-h*.095)]),[o*.12,o*.1,o*.1],{...k,bone:b,k:r*.2});for(let h=0;h<4;h++){let m="leg"+h,y=h<2,w=h%2?1:-1,R=i[m+".up"],U=i[m+".lo"],P=i[m+".hand"],D=d[m+".up"],B=d[m+".lo"],W=d[m+".hand"],C=c.inv(m+".up"),E=c.inv(m+".lo"),q=t.legR,[_,Z]=e.seg[m];t.humanoid?(s.ell(c.pt(m+".up",[w*q*.4,q*.8,0]),[q*2*g,q*2.4,q*2*g],{...k,bone:D,k:r*.3}),s.cap(R,U,q*1.35*g,q*1*g,{...k,bone:D,k:r*.2,bump:M}),s.ell(U,[q*1.25,q*1.35,q*1.25],{...k,bone:B,k:r*.1}),s.cap(U,P,q*1*g,q*.75*g,{...k,bone:B,k:r*.15,bump:M})):(s.ell(c.pt(m+".up",[0,-_*.15,y?0:-q*.6]),[q*2.6*g,_*.45,q*3.2*g],{...k,bone:D,k:r*.5,bump:M,m3:C}),s.cap(R,U,q*1.9*g,q*1.15*g,{...k,bone:D,k:r*.3,bump:M}),s.cap(U,P,q*1.05*g,q*.7*g,{...k,bone:B,k:r*.2}),s.ell(c.pt(m+".lo",[0,-Z*.25,0]),[q*1.2*g,Z*.3,q*1.3*g],{...k,bone:B,k:r*.2,m3:E}));let N=J=>c.pt(m+".hand",J);if(t.hands){let J=y?1:-1;s.box(N([0,-a*.5,J*q*1.4]),[q*1.5,a*.45,q*2.1],q*.4,{...k,bone:W,k:r*.15});for(let X=0;X<5;X++){let v=(X-2)*q*.75,I=y?X===2?5.6:X===0||X===4?3.8:5:1.8,F=N([v,-a*.6,J*q*3]),Y=N([v*1.25,-a*.95,J*q*(3+I)]),G=g0(F,Y,.5);G[1]+=q*.45,s.chain([F,G,Y],[q*.4,q*.34,q*.26],{...k,bone:W,k:r*.06}),y&&s.cap(Y,N([v*1.3,-a*1,J*q*(3.6+I)]),q*.2,q*.05,{region:26,col:[.3,.27,.2],bone:W,k:r*.03})}}else{s.ell(N([0,-a*.35,q*.9]),[q*1.35,a*.7,q*1.9],{...k,bone:W,k:r*.2});for(let J=0;J<4;J++){let X=(J-1.5)*q*.7;s.ell(N([X,-a*.6,q*2.3]),[q*.42,a*.42,q*.55],{...k,bone:W,k:r*.08}),s.cap(N([X,-a*.55,q*2.6]),N([X*1.1,-a*.95,q*3.4]),q*.2,q*.05,{region:26,col:[.14,.11,.09],bone:W,k:r*.03})}}}let f=i.neck,p=i.head;if(s.cap(c.pt("neck",[0,-o*.25,-o*.1]),p,o*(t.humanoid?.32:.55)*g,o*(t.humanoid?.28:.42)*g,{...k,bone:d.neck,k:r*.5,bump:M}),t.humanoid)for(let h of[-1,1])s.cap(c.pt("neck",[h*o*.18,t.neckL*.9,o*.1]),c.pt("neck",[h*o*.08,-o*.1,o*.3]),o*.07,o*.06,{...k,bone:d.neck,k:r*.1});if(t.tail){let h=[0,.3,.62,1].map(m=>c.pt("tail",[0,-t.tail*m,-t.tail*m*m*.25]));s.chain(h,[o*.28,o*.2,o*.12,o*.035],{...k,bone:d.tail,k:r*.2})}return s}function X0(t){let n=t.headScale||[1,.9,1.4],c=.4*n[0],e=.34,i=1-(c/(.95*n[0]))**2-((e-.1)/n[1])**2;return{x:c,u:e,f:.35+.75*n[2]*Math.sqrt(Math.max(.05,i))-.06}}function Z0(t){let n=t.headR,c=t.headScale||[1,.9,1.4],e=new s0,i=(s,g,r)=>[s*n,r*n,g*n],d=k0(t).skin,l=n*.15,o=[.02*n,3.5/n];e.ell(i(0,.35,.1),[c[0]*n*.95,c[1]*n,c[2]*n*.75],{...d,k:l,bump:o}),e.cap(i(0,.5,.05),i(0,1.5*c[2]/1.4,-.12),.55*n*c[0],.33*n*c[0],{...d,k:l*1.2,bump:o}),e.cap(i(0,-.3,-.2),i(0,.3,0),.62*n*c[0],.7*n*c[0],{...d,k:l*1.5});let a=X0(t);for(let s of[-1,1])e.ell(i(s*a.x,a.f+.06,a.u),[.19*n,.17*n,.15*n],{sub:!0,region:25,col:[.03,.006,.004],k:l*.3}),t.eyes||e.ell(i(s*a.x,a.f-.04,a.u),[.11*n,.11*n,.11*n],{region:26,col:[.06,.05,.03],k:l*.1}),e.ell(i(s*a.x*1.05,a.f-.02,a.u+.16),[.2*n,.14*n,.1*n],{...d,k:l*.5}),t.ears!==!1&&e.cap(i(s*.55,.05,.55),i(s*.75,-.25,.95),.12*n,.04*n,{...d,k:l*.4});for(let s of[-1,1])e.ell(i(s*.12,1.52*c[2]/1.4,0),[.06*n,.05*n,.06*n],{sub:!0,region:25,col:[.06,.01,.01],k:l*.2});if(t.jaw){for(let s=0;s<7;s++)for(let g of[-1,1]){let r=.55+s*.14*c[2]/1.4,k=.3*(1.15-s*.08)*c[0];e.cap(i(g*k,r,-.2),i(g*k*.95,r+.02,-.45-(s===1?.14:0)),.055*n,.01*n,{region:26,col:[.6,.55,.42],k:l*.05})}e.ell(i(0,.95,-.22),[.32*n*c[0],.5*n,.12*n],{region:25,col:[.2,.03,.03],k:l*.3})}else e.ell(i(0,1.05,-.32),[.32*n,.22*n,.12*n],{sub:!0,region:25,col:[.08,.01,.01],k:l*.3});if(t.headPlates)for(let s=0;s<3;s++)e.ell(i(0,.2+s*.35,.75-s*.12),[.62*n,.3*n,.25*n],{region:26,col:u0(t.color,.65),k:l*.2});return e}function o1(t){let n=t.headR,c=t.headScale||[1,.9,1.4],e=new s0,i=(o,a,s)=>[o*n,s*n,a*n],d=k0(t).skin,l=n*.15;e.cap(i(0,0,-.05),i(0,1.35*c[2]/1.4,.02),.42*n*c[0],.22*n*c[0],{...d,k:l}),e.ell(i(0,.75,.15),[.26*n*c[0],.5*n,.08*n],{region:25,col:[.22,.04,.04],k:l*.3});for(let o=0;o<7;o++)for(let a of[-1,1]){let s=.25+o*.14*c[2]/1.4,g=.26*(1.15-o*.08)*c[0];e.cap(i(a*g,s,.12),i(a*g*.96,s+.02,.36+(o===1?.1:0)),.05*n,.01*n,{region:26,col:[.58,.52,.4],k:l*.05})}return e}function n1(t){let n=p0(),c=t.n||8;n.add("root",null,0,0,0),n.add("body","root",0,t.h,0),n.add("head","body",0,0,t.bodyR*.6);let e=t.lift??.9,i=e+Math.asin(Math.min(.97,(t.h+t.legA*Math.sin(e))/t.legB));for(let d=0;d<c;d++){let l=d<c/2?-1:1,o=d%(c/2),a=(o/(c/2-1)-.5)*t.bodyR*1.6,s=l*(Math.PI/2)+(o/(c/2-1)-.5)*1.2*l;n.add("leg"+d+".hip","body",l*t.bodyR*.6,0,a,[0,s,0]),n.add("leg"+d+".up","leg"+d+".hip",0,0,0,[-e,0,0]),n.add("leg"+d+".lo","leg"+d+".up",0,0,t.legA,[i,0,0])}return{R:n,dims:{lift:e,bend:i}}}function t1(t){let n=new s0,c=k0(t).skin,e=t.bodyR,i=e*.3,d=[e*.04,3/e];n.ell([0,e*.1,-e*.95],[e,e*.78,e*1.3],{...c,k:i,bump:d});for(let l=0;l<4;l++)n.ell([0,e*.62-l*.02*e,-e*(.45+l*.32)],[e*.35,e*.15,e*.2],{...c,col:u0(t.color,.75),k:i*.3});return n.ell([0,0,e*.05],[e*.62,e*.42,e*.6],{...c,k:i*.6,bump:d}),n.cap([0,-e*.1,-e*2.1],[0,-e*.2,-e*2.3],e*.12,e*.05,{...c,k:i*.3}),n}function e1(t){let n=new s0,c=k0(t).skin,e=t.bodyR,i=e*.3;n.ell([0,e*.05,e*.18],[e*.42,e*.34,e*.42],{...c,k:i*.5});for(let d of[-1,1])n.cap([d*e*.14,-e*.12,e*.45],[d*e*.08,-e*.38,e*.62],e*.09,e*.03,{region:26,col:[.08,.06,.05],k:i*.1});return n}function E0(t,n,c,e,i){let d=new s0,l=k0(t).skin,o=c*.6;d.cap([0,0,0],[0,0,n],c,e,{...l,k:o*.3,bump:[c*.08,2.5/c]}),d.ell([0,0,n*.5],[c*1.12,c*1.12,n*.32],{...l,k:o*.5}),d.ell([0,0,0],[c*1.25,c*1.25,c*1.25],{...l,k:o*.3});for(let a=1;a<6;a++)d.cap([0,c*.7,n*a/6],[0,c*1.9,n*a/6+c*1.2],c*.14,c*.02,{...l,k:o*.05});return i&&d.cap([0,0,n],[0,-e*2.5,n+e*2.5],e*.9,e*.15,{region:26,col:u0(t.color,.5),k:o*.05}),d}function s1(t){let n=p0(),c=t.ceil,e=t.tip??.95,i=8,d=(c-e-.25)/i;n.add("root",null,0,0,0),n.add("top","root",0,c,0);let l="top";for(let o=0;o<i;o++)n.add("seg"+o,l,0,o===0?-.25:-d,0),l="seg"+o;return n.add("tip",l,0,-d,0),{R:n,dims:{ceil:c,seg:d,n:i}}}function l1(t,n){let{R:c}=n,e=c.world,i=c.idx,d=i.top,l=new s0,o={region:20,col:t.color},a=e.top;l.ell(T(a,[0,-.07,0]),[.6,.19,.54],{...o,bone:d,k:.08,bump:[.022,8]});for(let s=0;s<10;s++){let g=s/10*Math.PI*2+s%3*.4,r=.32+s%3*.1;l.ell(T(a,[Math.cos(g)*r,-.1-s%2*.06,Math.sin(g)*r*.9]),[.15+s%3*.04,.11+s%2*.03,.14],{...o,bone:d,k:.06,bump:[.015,13]})}for(let s=0;s<8;s++){let g=s/8*Math.PI*2+.2,r=[];for(let k=0;k<5;k++){let M=.12+k*.12;r.push(T(a,[Math.cos(g+k*.15)*M,-.2+k*.035-(k===4?.04:0),Math.sin(g+k*.15)*M*.9]))}l.chain(r,[.016,.014,.012,.009,.006],{region:20,col:u0(t.color2||t.color,1.2),bone:d,k:.012})}l.torus(T(a,[0,-.25,0]),.1,.045,{region:25,col:t.extra||t.color,bone:d,k:.03}),l.ell(T(a,[0,-.27,0]),[.085,.07,.085],{sub:!0,region:25,col:[.05,.004,.004],bone:d,k:.02});for(let s=0;s<14;s++){let g=s/14*Math.PI*2;l.cap(T(a,[Math.cos(g)*.12,-.26,Math.sin(g)*.12]),T(a,[Math.cos(g)*.075,-.33,Math.sin(g)*.075]),.013,.002,{region:26,col:[.55,.5,.38],bone:d,k:.004})}return l}function c1(t,n){let{R:c,dims:e}=n,i=c.world,d=c.idx,l=e.n,o=new s0,a={region:25,col:t.extra||t.color};for(let r=0;r<l;r++){let k=i["seg"+r],M=r<l-1?i["seg"+(r+1)]:i.tip,u=.042-r*.0026,b=.042-(r+1)*.0026;o.cap(k,M,u,b,{...a,bone:d["seg"+r],k:.015,bump:[.003,55]});for(let f of[.3,.75])o.torus(g0(k,M,f),u*.96,.0065,{...a,bone:d["seg"+r],k:.006})}let s=i.tip,g=d.tip;o.ell(T(s,[0,-.02,0]),[.05,.075,.05],{...a,bone:g,k:.02});for(let r=0;r<6;r++){let k=r/6*Math.PI*2;o.chain([T(s,[Math.cos(k)*.035,-.05,Math.sin(k)*.035]),T(s,[Math.cos(k)*.07,-.1,Math.sin(k)*.07]),T(s,[Math.cos(k)*.06,-.13,Math.sin(k)*.06])],[.009,.006,.002],{region:26,col:[.4,.33,.25],bone:g,k:.004})}return o}function i1(t){let n=p0();n.add("root",null,0,0,0);for(let c=0;c<3;c++){let e=c/3*Math.PI*2;n.add("arm"+c+".base","root",Math.cos(e)*.4,t.base,Math.sin(e)*.4),n.add("arm"+c+".up","arm"+c+".base",0,0,0),n.add("arm"+c+".el","arm"+c+".up",0,.45,0),n.add("arm"+c+".hand","arm"+c+".el",0,.4,0,[0,0,Math.PI])}return n.add("head","root",0,t.base+.05,0),{R:n,dims:{}}}function a1(t,n,c){let{R:e}=n,i=e.world,d=e.idx,l="arm"+c,o=new s0,a={region:20,col:t.color},s=[.0025,48],g=i[l+".up"],r=i[l+".el"],k=i[l+".hand"];return o.cap(T(g,[0,-.15,0]),r,.05,.034,{...a,bone:d[l+".up"],k:.02,bump:s}),o.ell(r,[.037,.04,.037],{...a,bone:d[l+".el"],k:.012}),o.cap(r,k,.036,.024,{...a,bone:d[l+".el"],k:.018,bump:s}),o.ell(g0(r,k,.3),[.034,.08,.03],{...a,bone:d[l+".el"],k:.016}),o}function r1(t){let n=p0(),c=t.len,e=t.r,i=t.span;n.add("root",null,0,0,0),n.add("body","root",0,0,0),n.add("head","body",0,0,c*.55);for(let[d,l]of[["wingL",-1],["wingR",1]])n.add(d,"body",l*e*.7,e*.3,c*.15),n.add(d+"2",d,l*i,0,0);return{R:n,dims:{L:c,r:e,sp:i}}}function f1(t,n){let{R:c,dims:e}=n,i=c.world,d=c.idx,{L:l,r:o}=e,a=new s0,s={region:20,col:t.color},g=d.body,r=d.head,k=[.004,30];a.cap([0,0,-l*.45],[0,o*.1,l*.3],o*.45,o*.95,{...s,bone:g,k:.03,bump:k});for(let u=0;u<6;u++)for(let b of[-1,1]){let f=l*(.25-u*.07);a.chain([[b*o*.2,o*.75,f],[b*o*.85,o*.3,f-.01],[b*o*.8,-o*.45,f-.02]],[o*.07,o*.07,o*.05],{...s,bone:g,k:.008})}a.cap([0,-o*.1,-l*.45],[0,-o*.35,-l*.85],o*.25,o*.04,{...s,bone:g,k:.02});for(let u of[-1,1])a.chain([[u*o*.35,-o*.5,-l*.15],[u*o*.45,-o*1.6,-l*.3],[u*o*.4,-o*2.4,-l*.2]],[o*.14,o*.09,o*.05],{...s,bone:g,k:.012});let M=i.head;a.cap(T(M,[0,0,-o*.5]),T(M,[0,o*.05,o*.2]),o*.4,o*.55,{...s,bone:r,k:.03}),a.cap(T(M,[0,o*.05,o*.2]),T(M,[0,-o*.1,o*1.5]),o*.5,o*.12,{...s,bone:r,k:.04,bump:[.003,40]}),a.cap(T(M,[0,-o*.35,o*.25]),T(M,[0,-o*.3,o*1.35]),o*.3,o*.08,{...s,bone:r,k:.02}),a.ell(T(M,[0,-o*.18,o*.9]),[o*.25,o*.08,o*.55],{sub:!0,region:25,col:[.06,.008,.006],bone:r,k:.01});for(let u=0;u<7;u++)for(let b of[-1,1])a.cap(T(M,[b*o*(.18-u*.018),-o*.1,o*(.45+u*.14)]),T(M,[b*o*(.16-u*.018),-o*.32,o*(.47+u*.14)]),o*.035,o*.004,{region:26,col:[.6,.55,.42],bone:r,k:.003});for(let u of[-1,1])a.ell(T(M,[u*o*.33,o*.2,o*.75]),[o*.12,o*.1,o*.12],{sub:!0,region:25,col:[.02,.005,.004],bone:r,k:.01});return a}function F0(t,n,c){let{R:e,dims:i}=n,d=e.world,l=e.idx,{L:o,r:a,sp:s}=i,g=c<0?"wingL":"wingR",r=new s0,k={region:20,col:t.color},M={region:20,col:u0(t.color,.8)},u=d[g],b=d[g+"2"],f=l[g],p=l[g+"2"];r.cap(u,b,a*.22,a*.14,{...k,bone:f,k:.01});let m=[[.85*s,-.05*o],[.55*s,-.45*o],[.2*s,-.7*o]].map(([w,R])=>T(b,[c*w,0,R]));for(let w of m)r.cap(b,w,a*.1,a*.03,{...k,bone:p,k:.006});let y=(w,R,U,P)=>r.ell(w,[R,.0085,U],{...M,bone:P,k:.01});for(let w=0;w<3;w++){let R=m[w],U=w===0?b:m[w-1],P=g0(g0(b,R,.55),g0(b,U,.55),.5);y(P,Math.max(.05,Math.abs(R[0]-b[0])*.42),Math.max(.05,Math.abs(R[2]-U[2])*.5+.04),p)}return y(g0(u,T(b,[-c*s*.2,0,-o*.35]),.5),s*.45,o*.3,f),r}var o0=(t,n=1)=>[42e-7*t*t*n,65e-6*t*t*n,45e-5*t*t*n];function x0(t){return n=>({rot:t.rotW[n],pos:t.world[n]})}function P0(t,n){let c=J0(t),e=c.dims,i=e.H/1.8,d=[{name:"body",model:V0(t,c,n),voxel:(t.jointBalls?.0085:.0105)*Math.max(.85,i*.85),skin:!0,err:o0(i),ao:.06*i},{name:"head",model:q0(t,e.headR,n),voxel:e.headR*.04,bone:"head",err:o0(e.headR/.117),ao:e.headR*.32,aoK:1.4}],l=[["handL","armL",-1],["handR","armR",1]];t.fourArms&&l.push(["handL2","armL2",-1],["handR2","armR2",1]);for(let[o,a,s]of l)d.push({name:o,model:j0(t,e.H,n,s),voxel:e.H*.0019*(t.handScale??1),bone:a+".hand",err:o0(i*(t.handScale??1),.5),ao:.018*i});return{bones:c.R.bones,place:x0(c.R),meta:{kind:"biped",H:e.H,legLen:e.legL,headR:e.headR},parts:d}}function u1(t){let n={height:1.76,leg:.47,torso:.3,head:.068,arm:.43,thick:1.2,shoulder:.125,hips:.075,headScale:[1,1.1,1.05],fingers:.05,color:[.4,.3,.25]},c=t.suit||[.74,.52,.07],e=P0(n,{suit:c,glove:t.glove||[.04,.042,.048],boots:t.boots||[.03,.03,.032],tank:t.tank||[.7,.68,.62],hood:c});return e.meta.kind="hazmat",e}function d1(t){let n=G0(t),c=t.bodyR/.2,e=[{name:"body",model:Q0(t,n),voxel:Math.max(.0075,Math.min(t.bodyR*.06,t.legR*.42)),skin:!0,err:o0(c),ao:t.bodyR*.35}];if(t.humanHead){let i=t.headR*.85;e.push({name:"head",model:q0({...t,headScale:t.faceScale},i,{origin:[0,-.35*i,.05*i]}),voxel:i*.042,bone:"head",err:o0(i/.117)})}else e.push({name:"head",model:Z0(t),voxel:t.headR*.045,bone:"head",err:o0(t.headR/.12)});return t.jaw&&e.push({name:"jaw",model:o1(t),voxel:t.headR*.045,bone:"jaw",err:o0(t.headR/.12)}),{bones:n.R.bones,place:x0(n.R),meta:{kind:"quad",legH:t.legH,headR:t.headR},parts:e}}function b1(t){let n=n1(t),c=t.n||8,e=t.bodyR,i=e/.2,d=[],l=[];for(let s=0;s<c;s++)d.push("leg"+s+".up"),l.push("leg"+s+".lo");let o=Math.max(.0028,Math.min(t.legR*.42,e*.05)),a=[{name:"body",model:t1(t),voxel:Math.max(.004,e*.05),bone:"body",err:o0(i)},{name:"legUp",model:E0(t,t.legA,t.legR*1.4,t.legR,!1),voxel:o,bones:d,err:o0(t.legR/.03,.6)},{name:"legLo",model:E0(t,t.legB,t.legR,t.legR*.35,!0),voxel:o,bones:l,err:o0(t.legR/.03,.6)}];if(t.face){let s=e*.62,g=q0({...t,headScale:[1,1.05,.9],noEars:!0},s,{origin:[0,-.95*s,e*.28],noNeck:!0});a.push({name:"head",model:g,voxel:s*.045,bone:"head",err:o0(s/.117)})}else a.push({name:"head",model:e1(t),voxel:Math.max(.0035,e*.045),bone:"head",err:o0(i)});return{bones:n.R.bones,place:x0(n.R),meta:{kind:"spider",h:t.h,bend:n.dims.bend},parts:a}}function k1(t){let n=s1(t);return{bones:n.R.bones,place:x0(n.R),meta:{kind:"maw",H:t.ceil},parts:[{name:"top",model:l1(t,n),voxel:.012,skin:!0,err:o0(2),ao:.08},{name:"tentacle",model:c1(t,n),voxel:.0055,skin:!0,err:o0(.6),ao:.02}]}}function h1(t){let n=i1(t),c=[];for(let e=0;e<3;e++)c.push({name:"arm"+e,model:a1(t,n,e),voxel:.0075,skin:!0,err:o0(.8),ao:.03}),c.push({name:"hand"+e,model:j0({...t,gaunt:.4,fingers:.07},1.8,{},e===1?1:-1),voxel:.0034,bone:"arm"+e+".hand",err:o0(1,.5),ao:.018});return c.push({name:"head",model:q0({...t,gaunt:.6,sockets:!0,gape:.7,noEars:!0},.11,{origin:[0,-.12,0]}),voxel:.006,bone:"head",err:o0(1),ao:.035}),{bones:n.R.bones,place:x0(n.R),meta:{kind:"arms",H:1},parts:c}}function m1(t){let n=r1(t);return{bones:n.R.bones,place:x0(n.R),meta:{kind:"flyer",H:.6},parts:[{name:"body",model:f1(t,n),voxel:.0055,skin:!0,err:o0(.7),ao:.03},{name:"wingL",model:F0(t,n,-1),voxel:.0045,skin:!0,err:o0(.6),ao:.02},{name:"wingR",model:F0(t,n,1),voxel:.0045,skin:!0,err:o0(.6),ao:.02}]}}function C0(t,n){return t==="maw"?k1(n):t==="arms"?h1(n):t==="flyer"?m1(n):t==="hazmat"?u1(n):t==="biped"?P0(n,{}):t==="quad"?d1(n):t==="spider"?b1(n):null}var S0=()=>typeof performance<"u"?performance.now():Date.now();function K0(t,n,c={}){let e=c.quality??1,i=S0(),d=C0(t,n);if(!d)throw new Error("unknown creature kind "+t);let l=d.bones.map(k=>k.parent),o={};d.bones.forEach((k,M)=>{o[k.name]=M});let a=d.parts[0].err.length,s=Array.from({length:a},()=>[]),g=[];for(let k of d.parts){let M=S0(),u=k.model.build({voxel:k.voxel*e,skin:!!k.skin,boneParent:l,lods:k.err,ao:k.ao||k.voxel*4.5,aoK:k.aoK});g.push(`${k.name}:${u.lods.map(f=>f.tris).join("/")}t ${Math.round(S0()-M)}ms`);let b=k.skin?[null]:k.bones||[k.bone];for(let f=0;f<a;f++)for(let p of b)s[f].push(p?{g:u.lods[f],bone:o[p],place:d.place(p)}:{g:u.lods[f],bone:-1,place:null})}let r=s.map(g1);return{bones:d.bones,meta:d.meta,lods:r,stats:g,ms:Math.round(S0()-i)}}function g1(t){let n=0,c=0;for(let{g:u}of t)n+=u.position.length/3,c+=u.index.length;let e=new Float32Array(n*3),i=new Int8Array(n*3),d=new Uint8Array(n*3),l=new Uint8Array(n),o=new Uint8Array(n*4),a=new Uint8Array(n*4),s=n>65535?new Uint32Array(c):new Uint16Array(c),g=u=>Math.max(-127,Math.min(127,Math.round(u*127))),r=u=>Math.max(0,Math.min(255,Math.round(u*255))),k=0,M=0;for(let{g:u,bone:b,place:f}of t){let p=u.position.length/3;for(let h=0;h<p;h++){let m=(k+h)*3,y=u.position[h*3],w=u.position[h*3+1],R=u.position[h*3+2],U=u.normal[h*3],P=u.normal[h*3+1],D=u.normal[h*3+2];if(f){let W=A0(f.rot,[y,w,R]),C=A0(f.rot,[U,P,D]);y=W[0]+f.pos[0],w=W[1]+f.pos[1],R=W[2]+f.pos[2],U=C[0],P=C[1],D=C[2]}e[m]=y,e[m+1]=w,e[m+2]=R,i[m]=g(U),i[m+1]=g(P),i[m+2]=g(D),d[m]=r(u.color[h*3]),d[m+1]=r(u.color[h*3+1]),d[m+2]=r(u.color[h*3+2]),l[k+h]=u.aMat[h];let B=(k+h)*4;if(b>=0)o[B]=b,a[B]=255;else{let W=u.skinWeight[h*4],C=u.skinWeight[h*4+1];o[B]=u.skinIndex[h*4],o[B+1]=u.skinIndex[h*4+1];let E=r(W);a[B]=E,a[B+1]=C>0?255-E:0}}for(let h=0;h<u.index.length;h++)s[M+h]=u.index[h]+k;k+=p,M+=u.index.length}return{position:e,normal:i,color:d,aMat:l,skinIndex:o,skinWeight:a,index:s,tris:c/3}}self.onmessage=t=>{let n=t.data;if(!(!n||n.type!=="build"))try{let c=K0(n.kind,n.params,n.opts||{}),e=[];for(let i of c.lods)for(let d in i)i[d]&&i[d].buffer&&e.push(i[d].buffer);self.postMessage({type:"done",id:n.id,key:n.key,data:c},e)}catch(c){self.postMessage({type:"error",id:n.id,key:n.key,message:String(c&&c.stack||c)})}};self.postMessage({type:"ready"});})();\n';
  function lA(s) {
    let t = new Vt();
    return (
      t.setAttribute("position", new Kt(s.position, 3)),
      t.setAttribute("normal", new Kt(s.normal, 3, !0)),
      t.setAttribute("color", new Kt(s.color, 3, !0)),
      t.setAttribute("aMat", new Kt(s.aMat, 1)),
      t.setAttribute("skinIndex", new Kt(s.skinIndex, 4)),
      t.setAttribute("skinWeight", new Kt(s.skinWeight, 4, !0)),
      t.setIndex(new Kt(s.index, 1)),
      t.computeBoundingSphere(),
      t
    );
  }
  var q1 = class {
      constructor() {
        ((this.entries = new Map()),
          (this.workers = []),
          (this.inited = !1),
          (this.mainAllowed = !0),
          (this.nextId = 1),
          (this.log = []),
          (this.listeners = new Set()));
      }
      init() {
        if (this.inited) return;
        this.inited = !0;
        let t = typeof location < "u" ? location.search : "";
        if (/[?&]nosdf\b/.test(t)) {
          this.disabled = !0;
          return;
        }
        if (!$2 || typeof Worker > "u" || /[?&]noworker\b/.test(t)) return;
        let e = Math.max(
          1,
          Math.min(
            3,
            ((typeof navigator < "u" && navigator.hardwareConcurrency) || 2) -
              1,
          ),
        );
        try {
          let n = URL.createObjectURL(
            new Blob([$2], { type: "text/javascript" }),
          );
          for (let i = 0; i < e; i++) {
            let r = { worker: new Worker(n), job: null, dead: !1, ok: !1 };
            ((r.worker.onmessage = (o) => this.onMessage(r, o.data)),
              (r.worker.onerror = (o) => {
                (o && o.preventDefault && o.preventDefault(),
                  this.fail(r, o && o.message));
              }),
              this.workers.push(r));
          }
        } catch {
          this.workers = [];
        }
      }
      live() {
        return this.workers.filter((t) => !t.dead).length;
      }
      request(t, e, n, i = 0) {
        if (this.disabled) return;
        this.init();
        let r = this.entries.get(t);
        if (r) {
          r.prio = Math.max(r.prio, i);
          return;
        }
        ((r = {
          key: t,
          kind: e,
          params: n,
          prio: i,
          state: "queued",
          out: null,
        }),
          this.entries.set(t, r),
          this.pump());
      }
      get(t) {
        let e = this.entries.get(t);
        return e && e.state === "ready" ? e.out : null;
      }
      state(t) {
        let e = this.entries.get(t);
        return e ? e.state : "none";
      }
      onReady(t) {
        return (this.listeners.add(t), () => this.listeners.delete(t));
      }
      nextJob() {
        let t = null;
        for (let e of this.entries.values())
          e.state === "queued" && (!t || e.prio > t.prio) && (t = e);
        return t;
      }
      pump() {
        if (!this.disabled) {
          for (let t of this.workers) {
            if (t.dead || t.job) continue;
            let e = this.nextJob();
            if (!e) return;
            ((e.state = "building"),
              (e.t = performance.now()),
              (t.job = e),
              t.worker.postMessage({
                type: "build",
                id: this.nextId++,
                key: e.key,
                kind: e.kind,
                params: e.params,
                opts: {},
              }));
          }
          !this.live() && this.mainAllowed && this.runMain();
        }
      }
      runMain(t) {
        let e = null;
        for (let n of this.entries.values())
          n.state === "queued" &&
            (!t || t.includes(n.key)) &&
            (!e || n.prio > e.prio) &&
            (e = n);
        if (!e) return !1;
        ((e.state = "building"), (e.t = performance.now()));
        try {
          this.finish(e, Y2(e.kind, e.params, { quality: 1.15 }));
        } catch (n) {
          ((e.state = "failed"),
            console.warn("creature build failed", e.key, n));
        }
        return !0;
      }
      onMessage(t, e) {
        if (e.type === "ready") {
          t.ok = !0;
          return;
        }
        let n = t.job;
        ((t.job = null),
          n &&
            e.key === n.key &&
            (e.type === "done"
              ? this.finish(n, e.data)
              : ((n.state = "failed"),
                console.warn("creature build failed", n.key, e.message))),
          this.pump());
      }
      fail(t, e) {
        if (!t.dead) {
          t.dead = !0;
          try {
            t.worker.terminate();
          } catch {}
          (t.job && ((t.job.state = "queued"), (t.job = null)),
            this.live() ||
              console.warn(
                "creature workers unavailable; building on the main thread during loads",
                e || "",
              ),
            this.pump());
        }
      }
      finish(t, e) {
        ((t.out = { bones: e.bones, meta: e.meta, geos: e.lods.map(lA) }),
          (t.state = "ready"),
          this.log.push(
            `${t.key} ${e.ms}ms ${Math.round(performance.now() - t.t)}ms wall | ${e.lods.map((n) => n.tris).join("/")}t`,
          ));
        for (let n of this.listeners) n(t.key);
      }
      async ensure(t, e = {}) {
        if (this.disabled) return;
        let n = performance.now(),
          i = e.timeout ?? 6e3,
          r = () =>
            t.filter((a) => {
              let c = this.state(a);
              return c === "queued" || c === "building";
            }),
          o = r();
        for (; o.length && performance.now() - n < i; )
          (this.live() ? this.pump() : this.runMain(t),
            e.onProgress && e.onProgress(1 - o.length / t.length),
            await new Promise((a) => setTimeout(a, this.live() ? 40 : 0)),
            (o = r()));
      }
    },
    di = new q1();
  var Ke = (s) => document.querySelector(s),
    K2 = (s) => new Promise((t) => setTimeout(t, s)),
    Ho = () => new Promise((s) => requestAnimationFrame(() => s())),
    Td = class {
      constructor(t) {
        (Object.assign(this, t),
          (this.scene = new qi()),
          (this.camera = new sn(55, 16 / 9, 0.05, 160)),
          (this.vmScene = new qi()),
          (this.vmCamera = new sn(50, 16 / 9, 0.01, 10)),
          (this.shared = E2()),
          (this.mat = A2(this.shared)),
          (this.mat.uniforms.tSigns.value = C2()),
          (this.player = new _d()),
          (this.state = "title"),
          (this.time = 0),
          (this.systems = []),
          (this.flashI = 0),
          (this.fogLight = 1),
          (this.expo = 1),
          (this.fx = {
            damage: 0,
            static: 0,
            pulse: 0,
            white: 0,
            fade: 0,
            underwater: 0,
            blind: 0,
            miasma: 0,
          }),
          (this.lights = []),
          (this.player.onBlocked = (e) => {
            e === "duct" &&
              this.toast(
                "狭くて立ち上がれない",
                900,
              );
          }),
          (this.cellTex = null),
          (this.lightTex = null),
          (this.run = null),
          (this.fs = null),
          (this.world = null),
          (this.lf = null),
          (this._lastCell = -1),
          (this.zoneNow = 0),
          (this.hudCache = {}),
          (this.dyn = []));
      }
      addSystem(t) {
        (this.systems.push(t), (t.game = this));
      }
      newRun(t, e = {}) {
        let i = new Ci(t).shuffle(S2.slice()).slice(0, 4);
        this.run = {
          seed: t,
          themes: ["yellow", ...i],
          floors: {},
          money: 0,
          kills: 0,
          deepest: 1,
          time: 0,
          startTime: performance.now(),
          relics: 0,
          won: !1,
          dead: !1,
        };
        let r = this.player,
          o = this.loadout || {};
        ((r.stats = {
          maxHp: 100,
          maxStamina: 100,
          drain: 7,
          regen: 20,
          speedMul: 1,
          armor: 0,
          miasmaRes: 0,
          regenMul: 1,
          meleeMul: 1,
          gunMul: 1,
          dmgTaken: 1,
          ...(o.stats || {}),
        }),
          (r.maxHp = r.stats.maxHp),
          (r.hp = r.maxHp),
          (r.stamina = r.stats.maxStamina),
          (r.dead = !1),
          (r.exhausted = !1),
          (r.buffs = { adren: 0, drink: 0, hot: 0, hotRate: 0, filter: 0 }),
          (r.armor = o.armor ? { ...o.armor } : null),
          (r.blessed = !1),
          (r.invuln = 0),
          (this.lights.length = 0),
          (this.dyn.length = 0));
        for (let a of this.systems) a.onNewRun && a.onNewRun(this.run);
        this.updateBlessing();
      }
      floorState(t) {
        let e = this.run;
        if (e.floors[t]) return e.floors[t];
        let n = e.themes[t - 1],
          i = t === 1 ? 1 : this.floorState(t - 1).map.downs.length,
          r = F2({
            seed: (e.seed * 7919 + t * 104729) >>> 0,
            depth: t,
            themeId: n,
            nUp: i,
          }),
          o = { depth: t, themeId: n, theme: ah[n], map: r, visited: !1 };
        e.floors[t] = o;
        for (let a of this.systems) a.onFloorGenerated && a.onFloorGenerated(o);
        return o;
      }
      async loadFloor(t, e, n = !0, i = {}) {
        ((this.state = "loading"),
          n &&
            ((Ke("#load-floor").textContent = "B" + t),
            (Ke("#load-name").textContent = ah[this.run.themes[t - 1]].name),
            (Ke("#load-bar i").style.width = "5%"),
            this.ui.show("s-loading"),
            await Ho(),
            await Ho()));
        let r = (d) => {
          Ke("#load-bar i").style.width = Math.round(d * 100) + "%";
        };
        if (this.fs)
          for (let d of this.systems) d.onFloorExit && d.onFloorExit(this.fs);
        this.world &&
          (this.scene.remove(this.world.group),
          this.world.dispose(),
          (this.world = null));
        let o = this.floorState(t);
        (this.isMulti() && this.net.applyFloor(o),
          r(0.25),
          await Ho(),
          (this.fs = o));
        let a = o.theme,
          c = o.map,
          l = U2(this.mat, this.baker, a, this.settings.texQ());
        (this.baker.disposeExcept(l), r(0.4), await Ho());
        let h = new yd(c, a);
        (h.bake(),
          (this.lf = h),
          r(0.7),
          await Ho(),
          this.uploadLight(),
          this.uploadCells());
        let u = new pd(c, a, this.mat);
        ((this.world = u),
          this.scene.add(u.group),
          this.placeAtArrival(e),
          u.ensure(this.player.pos, 999),
          r(0.9),
          await Ho(),
          (o.visited = !0),
          (this.run.deepest = Math.max(this.run.deepest, t)));
        for (let d of this.systems) d.onFloorEnter && d.onFloorEnter(o);
        if ((this.updateHUDStatic(), n || i.prepare))
          for (let d of this.systems)
            d.prepare && (await d.prepare(o, (p) => r(0.9 + p * 0.09)));
        (r(1), this.player.applyCamera(this.camera, this.time));
        let f = new We();
        if (!this._warmed) {
          for (let d of this.systems)
            if (d.warmup) {
              let p = d.warmup();
              p && f.add(p);
            }
          (f.position.copy(this.player.pos), this.scene.add(f));
        }
        if (
          (this.renderer.compile(this.scene, this.camera),
          this.renderer.compile(this.vmScene, this.vmCamera),
          !this._warmed)
        ) {
          this.scene.remove(f);
          for (let d of this.systems) d.unwarm && d.unwarm();
          this._warmed = !0;
        }
        (await Ho(),
          (this._lastCell = -1),
          (this.zoneNow = -1),
          (this.blackSeen = !1));
      }
      uploadLight() {
        let t = this.lf;
        (!this.lightTex || this.lightTex.image.width !== t.TW
          ? (this.lightTex && this.lightTex.dispose(),
            (this.lightTex = new Nn(t.data, t.TW, t.TH, on, hn)),
            (this.lightTex.minFilter = Le),
            (this.lightTex.magFilter = Le),
            (this.lightTex.generateMipmaps = !1),
            (this.lightTex.wrapS = this.lightTex.wrapT = Bn))
          : (this.lightTex.image.data = t.data),
          (this.lightTex.needsUpdate = !0),
          (this.mat.uniforms.tLight.value = this.lightTex),
          this.mat.uniforms.uWorld.value.set(
            this.fs.map.W * 4,
            this.fs.map.H * 4,
          ));
      }
      uploadCells() {
        let t = this.fs.map,
          e = new Uint8Array(t.N * 4);
        for (let n = 0; n < t.N; n++)
          ((e[n * 4] = t.zone[n] * 64 + Math.round(t.decay[n] * 60)),
            (e[n * 4 + 1] = t.light[n] * 50),
            (e[n * 4 + 2] = Math.min(255, Math.round(t.lightI[n] * 100))),
            (e[n * 4 + 3] = (t.floor[n] << 4) | (t.feat[n] & 15)));
        (this.cellTex && this.cellTex.dispose(),
          (this.cellTex = new Nn(e, t.W, t.H, on, hn)),
          (this.cellTex.minFilter = Ze),
          (this.cellTex.magFilter = Ze),
          (this.cellTex.generateMipmaps = !1),
          (this.cellTex.needsUpdate = !0),
          (this.mat.uniforms.tCell.value = this.cellTex),
          this.mat.uniforms.uGrid.value.set(t.W, t.H));
      }
      updateCell(t) {
        let e = this.fs.map,
          n = this.cellTex.image.data;
        ((n[t * 4] = e.zone[t] * 64 + Math.round(e.decay[t] * 60)),
          (n[t * 4 + 1] = e.light[t] * 50),
          (n[t * 4 + 2] = Math.min(255, Math.round(e.lightI[t] * 100))),
          (n[t * 4 + 3] = (e.floor[t] << 4) | (e.feat[t] & 15)),
          (this.cellTex.needsUpdate = !0));
      }
      placeAtArrival(t) {
        let e = this.fs.map;
        if (t.kind === "pos") {
          (this.player.reset(t.x, t.z, t.yaw ?? this.player.yaw),
            (this.player.pos.y = 0));
          return;
        }
        let n;
        (t.kind === "elev"
          ? (n = e.stairs.find((a) => a.kind === "elev"))
          : t.kind === "up"
            ? (n = e.ups[t.idx % e.ups.length])
            : t.kind === "down" && (n = e.downs[t.idx % e.downs.length]),
          n || (n = e.stairs[0]));
        let i = n.kind === "elev" ? 2.6 : 0.55,
          r = lh(n.cx, n.cy, n.dir, 2, i),
          o = uA(n.dir);
        (this.player.reset(r[0], r[1], Math.atan2(-o[0], -o[1])),
          (this.player.pos.y = 0));
      }
      update(t) {
        this.time += t;
        let e = this.player;
        ((di.mainAllowed = this.state !== "play"),
          this.net && this.net.update(t),
          this.spectating && this.updateSpectate(t));
        let n =
          this.isMulti() && (this.state === "paused" || this.state === "map");
        if (this.state === "play" || n) {
          if (((this.run.time += t), this.state === "play")) {
            if ((this.input.poll(), this.input.take("pause"))) {
              this.pause();
              return;
            }
            if (this.input.take("map")) {
              this.openMap();
              return;
            }
          }
          e.dead || e.update(t, this.input, this.fs.map);
          for (let r of this.systems) r.update && r.update(t);
          if (
            ((this.noiseLevel = Math.max(
              e.noise,
              (this.noiseLevel || 0) - t * 25,
            )),
            this.audio)
          ) {
            let r = this.fs.map,
              o = Math.floor(e.pos.z / 4) * r.W + Math.floor(e.pos.x / 4);
            ((this.decayLocal =
              (this.decayLocal ?? 0.5) +
              ((r.decay[o] ?? 0.5) - (this.decayLocal ?? 0.5)) *
                Math.min(1, t * 0.8)),
              this.audio.update(t, e, {
                light: this.localLight ?? 0.5,
                flick: this.nearFlick ?? 1,
                black: this.blackLocal || 0,
                fear: this.monsters ? Math.min(1, this.monsters.fear) : 0,
                lowhp: e.hp < 30,
                decay: this.decayLocal,
                duct: e.inDuct,
                miasma: this.fx.miasma || 0,
              }),
              this.audio.ambient(t, e, this.fs.themeId));
          }
          if (this.monsters && this.monsters.black && !this.blackSeen) {
            let r = this.monsters.black;
            Math.hypot(e.pos.x - r.x, e.pos.z - r.z) < r.r + 30 &&
              (this.blackSeen = !0);
          }
          if (!this.run.leftStart) {
            let r =
              this.fs.depth === 1 &&
              this.fs.map.stairs.find((o) => o.kind === "elev");
            (!r ||
              Math.hypot(
                e.pos.x - (r.cx + 0.5) * 4,
                e.pos.z - (r.cy + 0.5) * 4,
              ) > 9) &&
              (this.run.leftStart = !0);
          }
          if (
            (this.state === "play" && this.checkContext(),
            this.trackCell(),
            (this.safeT = (this.safeT || 0) - t),
            this.safeT <= 0 && e.onGround && e.pos.y > -0.1 && !e.dead)
          ) {
            let r = this.fs.map,
              o = Math.floor(e.pos.z / 4) * r.W + Math.floor(e.pos.x / 4);
            !(r.holes && r.holes.has(o)) &&
              r.floor[o] !== 1 &&
              r.feat[o] !== 4 &&
              ((e.lastSafe = { x: e.pos.x, z: e.pos.z }), (this.safeT = 0.5));
          }
          if (!e.dead) {
            let r = this.fs.map,
              o = Math.floor(e.pos.z / 4) * r.W + Math.floor(e.pos.x / 4);
            r.holes && r.holes.has(o) && e.pos.y < -3.5
              ? this.kill(
                  "崩れた床の下へ落ちた",
                )
              : e.pos.y < -9 &&
                this.kill("奈落に落ちた");
          }
          this.updateHUD(t);
        } else if (this.state === "title") this.titleCam(t);
        else if (this.state === "dying")
          for (let r of this.systems) r.update && r.update(t * 0.4);
        else if (this.state === "returning") {
          this.run.time += t;
          for (let r of this.systems) r.update && r.update(t);
        }
        let i = this.fx;
        ((i.damage = Math.max(0, i.damage - t * 1.6)),
          (i.static = Math.max(0, i.static - t * 1.2)),
          (i.blind = Math.max(0, i.blind - t * 0.45)),
          (i.pulse = Math.max(0, i.pulse - t * 0.6)),
          e.invuln > 0 && (e.invuln -= t));
        for (let r = this.dyn.length - 1; r >= 0; r--) {
          let o = this.dyn[r];
          ((o.t += t), o.t >= o.life && this.dyn.splice(r, 1));
        }
      }
      titleCam(t) {
        if (!this.fs) return;
        let e = this.player,
          n = this.fs.map;
        (this._titlePath ||
          ((this._titleT = 0),
          (this._titlePath = { x: e.pos.x, z: e.pos.z, yaw: e.yaw })),
          (this._titleT += t));
        let i = this._titleT,
          r = this._titlePath,
          o = 0.55,
          a = r.x - Math.sin(r.yaw) * o * t,
          c = r.z - Math.cos(r.yaw) * o * t,
          l = { x: a, z: c },
          h = { x: a - Math.sin(r.yaw) * 2.2, z: c - Math.cos(r.yaw) * 2.2 };
        (this._rayBlocked(a, c, h.x, h.z)
          ? (r.yaw += t * 0.6)
          : (r.yaw += Math.sin(i * 0.13) * t * 0.05),
          (r.x = a),
          (r.z = c),
          e.pos.set(r.x, 0, r.z),
          (e.yaw = r.yaw + Math.sin(i * 0.21) * 0.25),
          (e.pitch = Math.sin(i * 0.17) * 0.05 + 0.02),
          (e.bobAmp = 0.25),
          (e.bob += t * 2.4));
      }
      _rayBlocked(t, e, n, i) {
        return !nn(this.fs.map, t, e, n, i);
      }
      trackCell() {
        let t = this.player,
          e = this.fs.map,
          n = Math.floor(t.pos.x / 4),
          i = Math.floor(t.pos.z / 4);
        if (n < 0 || i < 0 || n >= e.W || i >= e.H) return;
        let r = i * e.W + n;
        if (r === this._lastCell) return;
        this._lastCell = r;
        for (let a = i - 1; a <= i + 1; a++)
          for (let c = n - 1; c <= n + 1; c++) {
            if (!e.inb(c, a)) continue;
            let l = e.ci(c, a);
            e.zone[l] !== 2 && (e.explored[l] = 1);
          }
        let o = e.zone[r];
        if ((this.inBlack && (o = 3), o !== this.zoneNow)) {
          let a = this.zoneNow;
          ((this.zoneNow = o),
            a !== -1 && o !== 0 && this.banner(b2[o], M2[o], o));
          for (let c of this.systems) c.onZoneChange && c.onZoneChange(o, a);
        }
      }
      banner(t, e, n, i) {
        let r = Ke("#zone-banner");
        ((r.querySelector(".zt").textContent = t),
          (r.querySelector(".zt").style.color =
            i || ["#e9dca0", "#ff6a55", "#7ea2ff", "#bdbdbd"][n] || "#fff"),
          (r.querySelector(".zh").textContent = e || ""),
          r.classList.add("show"),
          clearTimeout(this._bannerT),
          (this._bannerT = setTimeout(() => r.classList.remove("show"), 3200)));
      }
      toast(t, e = 1800) {
        let n = Ke("#toast");
        ((n.textContent = t),
          n.classList.add("show"),
          clearTimeout(this._toastT),
          (this._toastT = setTimeout(() => n.classList.remove("show"), e)));
      }
      feed(t, e) {
        let n = document.createElement("div");
        ((n.textContent = t), e && (n.style.color = e));
        let i = Ke("#pickup-feed");
        for (i.appendChild(n); i.children.length > 4; )
          i.removeChild(i.firstChild);
        setTimeout(() => n.remove(), 2700);
      }
      checkContext() {
        let t = this.player,
          e = this.fs.map,
          n = Math.floor(t.pos.x / 4),
          i = Math.floor(t.pos.z / 4),
          r = null;
        if (
          (this.elevator &&
            this.elevator.near(t) &&
            this.elevator.canReturn() &&
            (r = {
              type: "return",
              label:
                "エレベーターで帰還する",
            }),
          !r && e.inb(n, i))
        ) {
          let o = e.feat[i * e.W + n];
          if (o === 1 || o === 2) {
            let a = e.stairs.find((c) => c.cx === n && c.cy === i);
            a &&
              (a.kind === "down"
                ? (r = {
                    type: "down",
                    st: a,
                    label: `B${this.fs.depth + 1}へ下りる`,
                  })
                : a.kind === "up" &&
                  (r = {
                    type: "up",
                    st: a,
                    label: `B${this.fs.depth - 1}へ上がる`,
                  }));
          }
        }
        if (!r) {
          for (let o of this.systems)
            if (o.contextAction) {
              let a = o.contextAction();
              if (a) {
                r = a;
                break;
              }
            }
        }
        (this.setAction(r),
          r && this.input.take("act")
            ? this.doAction(r)
            : this.input.take("act"));
      }
      setAction(t) {
        let e = Ke("#btn-act"),
          n = t ? t.type + ":" + t.label : "";
        if (n !== this._actKey) {
          if (((this._actKey = n), (this.action = t), !t)) {
            e.classList.remove("show", "return");
            return;
          }
          ((e.textContent = t.label),
            e.classList.add("show"),
            e.classList.toggle("return", t.type === "return"));
        }
      }
      async doAction(t) {
        if (t.type === "down") {
          let e = this.fs.map.downs.indexOf(t.st);
          await this.transition(this.fs.depth + 1, { kind: "up", idx: e });
        } else if (t.type === "up") {
          let e = this.fs.map.ups.indexOf(t.st),
            n = this.fs.depth - 1;
          await this.transition(n, { kind: "down", idx: e });
        } else if (t.type === "return") {
          if (this.state !== "play") return;
          ((this.state = "returning"),
            this.input.releaseAll(),
            (this.input.enabled = !1),
            this.setAction(null),
            this.elevator.startReturn(() => this.win()));
        } else t.run && t.run();
      }
      async transition(t, e) {
        if (this.state !== "play") return;
        ((this.state = "transition"),
          this.input.releaseAll(),
          this.audio &&
            this.audio.stairs &&
            this.audio.stairs(t > this.fs.depth),
          Ke("#fade").classList.add("on"),
          await K2(520));
        let n = !this.run.floors[t] || !this.run.floors[t].visited;
        (await this.loadFloor(t, e, !0),
          this.ui.hideAll(),
          Ke("#fade").classList.add("on"),
          n && (await K2(200)),
          (this.state = "play"),
          (this.input.enabled = !0),
          Ke("#fade").classList.remove("on"),
          this.banner(`B${t}　${this.fs.theme.name}`, this.fs.theme.en, 0));
      }
      win() {
        if (this.state !== "play" && this.state !== "returning") return;
        ((this.state = "won"),
          (this.run.won = !0),
          this.isMulti() && this.net.returned(this.run.money),
          this.input.releaseAll(),
          (this.input.enabled = !1),
          this.audio && this.audio.win && this.audio.win(),
          (this.fx.white = 0));
        let t = performance.now(),
          e = () => {
            let n = (performance.now() - t) / 1600;
            ((this.fx.white = Math.min(1, n)),
              n < 1 ? requestAnimationFrame(e) : this.showResult(!0));
          };
        e();
      }
      kill(t) {
        let e = this.player;
        if (e.dead || this.state !== "play") return;
        if (this.god) {
          e.hp = e.maxHp;
          return;
        }
        if (e.blessed) {
          ((e.blessed = !1),
            this.updateBlessing(),
            this.secondChance(
              "加護が身代わりになった",
              t,
            ));
          return;
        }
        if (
          (!this.isMulti() ||
            (this.net && this.net.aliveTeammates().length === 0)) &&
          this.items &&
          this.items.countOf("revive") > 0
        ) {
          (this.items.takeOne("revive"),
            this.secondChance(
              "蘇生キットで持ち直した",
              t,
            ));
          return;
        }
        if (this.isMulti() && this.net.aliveTeammates().length > 0) {
          this.net.localDied(t);
          return;
        }
        (this.isMulti() && this.net.finalDeath(t),
          (e.dead = !0),
          (e.hp = 0),
          (this.run.dead = !0),
          (this.run.cause = t),
          (this.state = "dying"),
          this.input.releaseAll(),
          (this.input.enabled = !1),
          this.audio && this.audio.death && this.audio.death(),
          (this.fx.damage = 1.5));
        let n = performance.now(),
          i = e.pitch,
          r = e.eye,
          o = () => {
            let a = Math.min(1, (performance.now() - n) / 2200);
            ((e.eye = _n(r, 0.25, Math.min(1, a * 2))),
              (e.roll = _n(0, 1.2, Math.min(1, a * 1.5))),
              (e.pitch = _n(i, -0.3, Math.min(1, a * 2))),
              (this.fx.fade = Math.max(0, (a - 0.45) / 0.55)),
              a < 1 ? requestAnimationFrame(o) : this.showResult(!1));
          };
        o();
      }
      secondChance(t, e) {
        let n = this.player;
        ((n.hp = Math.max(1, n.maxHp * 0.5)),
          (n.invuln = 2.5),
          (n.stuck = 0),
          n.lastSafe &&
            (n.pos.y < -0.5 || /落ち/.test(e || "")) &&
            (n.pos.set(n.lastSafe.x, 0, n.lastSafe.z), n.vel.set(0, 0, 0)),
          (this.fx.blind = Math.max(this.fx.blind, 0.9)),
          (this.fx.damage = 0.4),
          this.toast(t, 2600),
          this.audio && this.audio.sfx("revive", { vol: 0.9, important: !0 }),
          this.monsters && this.monsters.stunArea(n.pos, 7, 2.5, !0));
      }
      startSpectate(t) {
        let e = this.player;
        ((e.dead = !0),
          (e.hp = 0),
          this.input.releaseAll(),
          (this.spectating = !0),
          (this.specCause = t),
          document.body.classList.add("spectating"),
          this.audio && this.audio.death && this.audio.death(),
          (this.fx.damage = 1.2),
          this.toast(
            "倒れた……仲間の視点で待つ。蘇生キットか祭壇で蘇れる",
            3200,
          ),
          (this.specId = null),
          this.cycleSpectate(1));
      }
      cycleSpectate(t) {
        let e = this.net ? this.net.aliveTeammates() : [];
        if (!e.length) return;
        let n = e.findIndex((r) => r.id === this.specId);
        ((n = n < 0 ? 0 : (n + t + e.length) % e.length),
          (this.specId = e[n].id));
        let i = document.getElementById("spec-name");
        i && (i.textContent = e[n].name + " を観戦中");
      }
      updateSpectate(t) {
        let e = this.net;
        if (!e || !e.active) {
          this.endSpectate(!0);
          return;
        }
        let n = e.players.get(this.specId);
        if (
          ((!n || n.dead || n.ret) &&
            (this.cycleSpectate(1), (n = e.players.get(this.specId))),
          !n)
        )
          return;
        if (
          this.fs &&
          n.depth !== this.fs.depth &&
          this.state === "play" &&
          !this._specLoading
        ) {
          ((this._specLoading = !0),
            this.loadFloor(n.depth, { kind: "pos", x: n.x, z: n.z }, !0).then(
              () => {
                (this.ui.hideAll(),
                  (this.state = "play"),
                  (this._specLoading = !1));
              },
            ));
          return;
        }
        let i =
            this._spec ||
            (this._spec = {
              x: n.x,
              y: n.y,
              z: n.z,
              yaw: n.yaw,
              pitch: n.pitch,
            }),
          r = Math.min(1, t * 10);
        (Math.hypot(n.x - i.x, n.z - i.z) > 5 && ((i.x = n.x), (i.z = n.z)),
          (i.x += (n.x - i.x) * r),
          (i.y += (n.y - i.y) * r),
          (i.z += (n.z - i.z) * r));
        let o = n.yaw - i.yaw;
        for (; o > Math.PI; ) o -= Math.PI * 2;
        for (; o < -Math.PI; ) o += Math.PI * 2;
        ((i.yaw += o * r),
          (i.pitch += (n.pitch - i.pitch) * r),
          (i.eye = n.s === 2 ? 0.45 : n.s === 1 ? 1.05 : 1.62),
          (this.viewPos = i));
      }
      endSpectate(t) {
        ((this.spectating = !1),
          (this.specId = null),
          (this._spec = null),
          (this.viewPos = null),
          document.body.classList.remove("spectating"),
          t &&
            this.player.dead &&
            this.state === "play" &&
            ((this.player.dead = !1),
            this.kill(this.specCause || "力尽きた")));
      }
      async reviveLocal(t, e, n, i) {
        let r = this.player;
        r.dead &&
          (this.endSpectate(!1),
          (r.dead = !1),
          (r.hp = Math.max(1, r.maxHp * 0.5)),
          (r.invuln = 3),
          (r.stuck = 0),
          (r.roll = 0),
          !this.fs || this.fs.depth !== t
            ? (await this.loadFloor(t, { kind: "pos", x: e, z: n }, !0),
              this.ui.hideAll(),
              (this.state = "play"))
            : (r.pos.set(e, 0, n), r.vel.set(0, 0, 0)),
          (this.input.enabled = !0),
          this.input.clear(),
          (this.fx.blind = Math.max(this.fx.blind, 0.8)),
          this.toast(
            i
              ? `${i} に蘇生された`
              : "蘇った",
            2600,
          ),
          this.audio && this.audio.sfx("revive", { vol: 0.9, important: !0 }));
      }
      netEnd() {
        this.state !== "result" &&
          (this.spectating || this.player.dead) &&
          (this.endSpectate(!1),
          (this.run.dead = !0),
          (this.run.cause =
            this.run.cause ||
            this.specCause ||
            "地下で力尽きた"),
          this.showResult(!1));
      }
      updateBlessing() {
        let t = document.getElementById("blessing");
        t && t.classList.toggle("on", !!this.player.blessed);
      }
      isMulti() {
        return !!(this.net && this.net.active);
      }
      claimItem(t, e) {
        return t.taken || t.pending
          ? !1
          : this.isMulti() && !this.net.isHost
            ? ((t.pending = !0), this.net.claim(this.fs.depth, t, e), !0)
            : ((t.taken = !0),
              this.items.removeMesh(t),
              this.isMulti() && this.net.taken(this.fs.depth, t.id),
              e && e(),
              !0);
      }
      dropItemNet(t, e, n, i = {}) {
        return this.isMulti()
          ? this.net.drop(this.fs.depth, t, e, n, i)
          : this.items.dropItem(t, e, n, i);
      }
      reviveTarget() {
        return this.isMulti() ? this.net.reviveTarget() : null;
      }
      doRevive(t) {
        this.isMulti() && this.net.revive(t);
      }
      addPersistentLight(t, e, n, i) {
        let r = {
          pos: t.clone ? t.clone() : new L(t.x, t.y, t.z),
          col: e,
          i: n,
          r: i,
        };
        return (this.lights.push(r), r);
      }
      removePersistentLight(t) {
        let e = this.lights.indexOf(t);
        e >= 0 && this.lights.splice(e, 1);
      }
      lightAt(t, e) {
        let n = this.lf ? this.lf.sample(t, e) : 0.5;
        for (let i of this.lights) {
          let r = Math.hypot(i.pos.x - t, i.pos.z - e);
          r < i.r && (n += i.i * 0.35 * (1 - r / i.r) * (1 - r / i.r));
        }
        return n;
      }
      showResult(t) {
        let e = this.run,
          n = this.settings.best,
          i = t ? e.money : 0,
          r = "";
        (t &&
          ((r =
            e.relics > 0 && e.deepest >= 5
              ? "S"
              : e.deepest >= 5
                ? "A"
                : e.deepest >= 3
                  ? "B"
                  : e.deepest >= 2
                    ? "C"
                    : "D"),
          i > (n.money || 0) && (n.money = i),
          (n.clears = (n.clears || 0) + 1)),
          (n.deepest = Math.max(n.deepest || 0, e.deepest)),
          t && this.meta && this.meta.deposit(i),
          this.settings.save(),
          (Ke("#res-title").textContent = t
            ? "帰還成功"
            : "あなたは帰れなかった"),
          (Ke("#res-title").style.color = t ? "#f3edd5" : "#e0473a"),
          (Ke("#res-sub").textContent = t
            ? `ランク ${r} ／ 倉庫に \xA5${i.toLocaleString()} を預けた（合計 \xA5${(this.meta ? this.meta.bank : 0).toLocaleString()}）`
            : (e.cause ||
                "地下で消息を絶った") +
              "。持ち物はすべて失われた。"));
        let o = (c) => (
            (c = Math.floor(c)),
            `${Math.floor(c / 60)}:${String(c % 60).padStart(2, "0")}`
          ),
          a = [
            [
              t ? "\xA5" + i.toLocaleString() : "\xA50",
              "持ち帰ったお金",
            ],
            ["B" + e.deepest, "到達した階層"],
            [String(e.kills), "倒した怪物"],
            [o(e.time), "プレイ時間"],
          ];
        ((Ke("#res-stats").innerHTML = a
          .map(
            (c) =>
              `<div class="stat"><div class="v">${c[0]}</div><div class="k">${c[1]}</div></div>`,
          )
          .join("")),
          (this.state = "result"),
          (this.fx.white = 0),
          (this.fx.fade = 0.35),
          this.ui.show("s-result"),
          document.body.classList.remove("playing"));
      }
      pause() {
        this.state === "play" &&
          ((this.state = "paused"),
          this.input.releaseAll(),
          (this.input.enabled = !1),
          this.audio && this.audio.setPaused && this.audio.setPaused(!0),
          this.ui.show("s-pause"));
      }
      resume() {
        (this.ui.hideAll(),
          (this.state = "play"),
          this.input.clear(),
          (this.input.enabled = !0),
          this.audio && this.audio.setPaused && this.audio.setPaused(!1));
      }
      openMap() {
        this.state === "play" &&
          ((this.state = "map"),
          this.input.releaseAll(),
          (this.input.enabled = !1),
          this.drawMap(),
          this.ui.show("s-map"));
      }
      closeMap() {
        this.resume();
      }
      drawMap() {
        let t = Ke("#map-canvas"),
          e = t.getContext("2d"),
          n = this.fs.map,
          i = n.W,
          r = n.H,
          o = 0,
          a = 0;
        for (let y = 0; y < n.N; y++)
          if (n.explored[y]) {
            let _ = y % n.W,
              M = (y / n.W) | 0;
            (_ < i && (i = _),
              M < r && (r = M),
              _ > o && (o = _),
              M > a && (a = M));
          }
        let c = Math.floor(this.player.pos.x / 4),
          l = Math.floor(this.player.pos.z / 4);
        ((i = Math.min(i, c)),
          (r = Math.min(r, l)),
          (o = Math.max(o, c)),
          (a = Math.max(a, l)));
        let h = Math.max(26, o - i + 5, a - r + 5);
        h = Math.min(h, Math.max(n.W, n.H));
        let u = Math.round((i + o) / 2 - h / 2),
          f = Math.round((r + a) / 2 - h / 2);
        ((u = Math.max(0, Math.min(n.W - h, u))),
          (f = Math.max(0, Math.min(n.H - h, f))));
        let d = Math.max(4, Math.floor(720 / h));
        ((t.width = h * d),
          (t.height = h * d),
          (e.fillStyle = "#0a0907"),
          e.fillRect(0, 0, t.width, t.height),
          e.save(),
          e.translate(-u * d, -f * d));
        let p = ["#5e5530", "#7a1f17", "#1d3570"];
        for (let y = 0; y < n.H; y++)
          for (let _ = 0; _ < n.W; _++) {
            let M = n.ci(_, y);
            if (!n.explored[M]) {
              n.zone[M] === 2 &&
                this.seenZone &&
                this.seenZone.has(M) &&
                ((e.fillStyle = "rgba(40,70,150,.35)"),
                e.fillRect(_ * d, y * d, d, d));
              continue;
            }
            ((e.fillStyle =
              n.floor[M] === 1
                ? "#151310"
                : n.floor[M] === 6
                  ? "#2a2c2e"
                  : n.floor[M] === 7
                    ? "#24221d"
                    : p[n.zone[M]]),
              e.fillRect(_ * d, y * d, d, d));
          }
        e.fillStyle = "#e8e0c4";
        for (let y = 0; y < n.H; y++)
          for (let _ = 0; _ <= n.W; _++) {
            let M = n.vw[n.vIdx(_, y)];
            if (!M) continue;
            let b = _ > 0 ? n.explored[n.ci(_ - 1, y)] : 0,
              w = _ < n.W ? n.explored[n.ci(_, y)] : 0;
            if (!(!b && !w)) {
              if (M === 7) {
                ((e.globalAlpha = 0.9),
                  e.fillRect(_ * d - 1, y * d, 2, d * 0.2),
                  e.fillRect(_ * d - 1, y * d + d * 0.8, 2, d * 0.2));
                continue;
              }
              ((e.globalAlpha = M === 3 ? 0.45 : M === 6 ? 0.6 : 0.9),
                e.fillRect(_ * d - 1, y * d, 2, d));
            }
          }
        for (let y = 0; y <= n.H; y++)
          for (let _ = 0; _ < n.W; _++) {
            let M = n.hw[n.hIdx(_, y)];
            if (!M) continue;
            let b = y > 0 ? n.explored[n.ci(_, y - 1)] : 0,
              w = y < n.H ? n.explored[n.ci(_, y)] : 0;
            if (!(!b && !w)) {
              if (M === 7) {
                ((e.globalAlpha = 0.9),
                  e.fillRect(_ * d, y * d - 1, d * 0.2, 2),
                  e.fillRect(_ * d + d * 0.8, y * d - 1, d * 0.2, 2));
                continue;
              }
              ((e.globalAlpha = M === 3 ? 0.45 : M === 6 ? 0.6 : 0.9),
                e.fillRect(_ * d, y * d - 1, d, 2));
            }
          }
        e.globalAlpha = 1;
        for (let y of n.stairs)
          n.explored[n.ci(y.cx, y.cy)] &&
            ((e.fillStyle =
              y.kind === "down"
                ? "#58d17a"
                : y.kind === "up"
                  ? "#58a8ff"
                  : "#ffffff"),
            y.kind === "elev"
              ? (e.beginPath(),
                e.arc(
                  (y.cx + 0.5) * d,
                  (y.cy + 0.5) * d,
                  d * 0.45,
                  0,
                  Math.PI * 2,
                ),
                e.fill())
              : e.fillRect(y.cx * d + 1, y.cy * d + 1, d - 2, d - 2));
        if (this.fs.items)
          for (let y of this.fs.items)
            y.supply &&
              !y.taken &&
              ((e.fillStyle = "#ffd24a"),
              e.fillRect(
                (y.x / 4) * d - d * 0.35,
                (y.z / 4) * d - d * 0.35,
                d * 0.7,
                d * 0.7,
              ),
              (e.strokeStyle = "#000"),
              e.strokeRect(
                (y.x / 4) * d - d * 0.35,
                (y.z / 4) * d - d * 0.35,
                d * 0.7,
                d * 0.7,
              ));
        for (let y of this.systems) y.drawMap && y.drawMap(e, d);
        let g = this.player,
          m = (g.pos.x / 4) * d,
          x = (g.pos.z / 4) * d,
          v = d / 6;
        (e.save(),
          e.translate(m, x),
          e.rotate(-g.yaw),
          (e.fillStyle = "#fff"),
          (e.strokeStyle = "#000"),
          (e.lineWidth = 1.5),
          e.beginPath(),
          e.moveTo(0, -6 * v),
          e.lineTo(4 * v, 4.5 * v),
          e.lineTo(-4 * v, 4.5 * v),
          e.closePath(),
          e.fill(),
          e.stroke(),
          e.restore(),
          e.restore());
      }
      updateHUDStatic() {
        ((Ke("#floor-num").textContent = "B" + this.fs.depth),
          (Ke("#floor-name").textContent = this.fs.theme.name));
      }
      updateHUD(t) {
        let e = this.player,
          n = this.hudCache,
          i = Math.max(0, e.hp / e.maxHp),
          r = e.stamina / (e.stats.maxStamina || 100),
          o = e.armor ? Math.max(0, e.armor.dura / e.armor.max) : -1;
        if (Math.abs((n.ar ?? -2) - o) > 0.01) {
          n.ar = o;
          let h = Ke("#ar-bar");
          h &&
            ((h.style.display = o < 0 ? "none" : ""),
            (Ke("#ar-fill").style.transform = `scaleX(${Math.max(0, o)})`));
        }
        (Math.abs((n.hp ?? -1) - i) > 0.002 &&
          ((n.hp = i), (Ke("#hp-fill").style.transform = `scaleX(${i})`)),
          Math.abs((n.st ?? -1) - r) > 0.01 &&
            ((n.st = r),
            (Ke("#st-fill").style.transform = `scaleX(${r})`),
            (Ke("#st-fill").style.opacity = e.exhausted ? 0.35 : 1)),
          n.money !== this.run.money &&
            ((n.money = this.run.money),
            (Ke("#money").textContent =
              "\xA5" + this.run.money.toLocaleString())));
        let a = Math.floor(this.run.time);
        if (n.sec !== a) {
          n.sec = a;
          let h = Math.floor(a / 3600),
            u = Math.floor(a / 60) % 60,
            f = a % 60;
          Ke("#rec-time").textContent =
            `${String(h).padStart(2, "0")}:${String(u).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
        }
        let c = e.stance;
        n.stance !== c &&
          ((n.stance = c),
          document.body.classList.toggle("crouch", c === Or),
          document.body.classList.toggle("prone", c === Pi));
        let l = Math.min(10, Math.round((this.noiseLevel || e.noise) / 2));
        if (n.noise !== l) {
          n.noise = l;
          let h = Ke("#noise");
          if (!h.children.length)
            for (let u = 0; u < 10; u++) {
              let f = document.createElement("i");
              ((f.style.height = 4 + u + "px"), h.appendChild(f));
            }
          [...h.children].forEach((u, f) => {
            u.className = f < l ? (f >= 7 ? "loud" : "on") : "";
          });
        }
      }
      render() {
        if (!this.fs || !this.world || !this.lf) return;
        let t = this.player,
          e = this.mat.uniforms,
          n = this.time;
        if (this.spectating && this._spec) {
          let v = this._spec,
            y = this.camera;
          (y.position.set(v.x, v.y + v.eye, v.z),
            (y.rotation.order = "YXZ"),
            y.rotation.set(v.pitch, v.yaw, 0),
            y.updateMatrixWorld());
        } else t.applyCamera(this.camera, n);
        let i = this.camera;
        (this.world.ensure(
          i.position,
          this.state === "play" || this.state === "title" ? 1 : 0,
        ),
          this.world.updateVisibility(i.position, 75),
          e.uCam.value.copy(i.position),
          (e.uTime.value = n));
        let r = this.lf.sample(i.position.x, i.position.z),
          o = this.blackLocal || 0,
          a = r * (1 - o * 0.95);
        this.localLight = a;
        let c = a;
        if (this.fs) {
          let v = this.player.forward.x,
            y = this.player.forward.z,
            _ = Math.hypot(v, y) || 1;
          for (let M of [2.5, 6]) {
            let b = i.position.x + (v / _) * M,
              w = i.position.z + (y / _) * M;
            nn(this.fs.map, i.position.x, i.position.z, b, w) &&
              (c = Math.min(
                c,
                this.lf.sample(b, w) * (1 - (this.blackLocal || 0) * 0.95),
              ));
          }
        }
        this._flashOn = this._flashOn
          ? a < 0.5 || c < 0.38
          : a < 0.35 || c < 0.25;
        let l = this._flashOn || this.forceFlash;
        ((this.flashI = _n(this.flashI, l ? 1 : 0, 1 - Math.exp(-3 * 0.016))),
          (e.uFlashI.value = this.flashI * 2 * (this.flashFlicker || 1)),
          e.uFlashPos.value.copy(i.position),
          (e.uFlashPos.value.y -= 0.12),
          i.getWorldDirection(e.uFlashDir.value),
          (this.fogLight = _n(
            this.fogLight,
            ke(0.12 + a * 0.9, 0.06, 1),
            0.05,
          )),
          (e.uFogLight.value = this.fogLight),
          this.updateFlicker(i.position, n));
        let h = 0;
        for (let v = 0; v < this.dyn.length && h < 4; v++, h++) {
          let y = this.dyn[v],
            _ = 1 - y.t / y.life;
          (e.uDynPos.value[h].set(y.pos.x, y.pos.y, y.pos.z, y.r),
            e.uDynCol.value[h].set(y.col[0], y.col[1], y.col[2], y.i * _ * _));
        }
        if (h < 4 && this.lights.length) {
          let v = this.lights
            .map((y) => [
              Math.hypot(y.pos.x - i.position.x, y.pos.z - i.position.z),
              y,
            ])
            .filter((y) => y[0] < 45)
            .sort((y, _) => y[0] - _[0]);
          for (let y = 0; y < v.length && h < 4; y++, h++) {
            let _ = v[y][1];
            (e.uDynPos.value[h].set(_.pos.x, _.pos.y, _.pos.z, _.r),
              e.uDynCol.value[h].set(_.col[0], _.col[1], _.col[2], _.i));
          }
        }
        for (; h < 4; h++) e.uDynCol.value[h].w = 0;
        let u = this.fx.miasma || 0,
          f = this.fs.theme,
          d = [0.16, 0.2, 0.07];
        (e.uFogCol.value.set(
          f.fogCol[0] + (d[0] - f.fogCol[0]) * u * 0.55,
          f.fogCol[1] + (d[1] - f.fogCol[1]) * u * 0.55,
          f.fogCol[2] + (d[2] - f.fogCol[2]) * u * 0.55,
        ),
          (e.uFogDen.value = f.fogDen * (1 + u * 0.9)));
        for (let v of this.systems) v.preRender && v.preRender(i);
        let p = this.fs.theme,
          g = p.exposure * (1 + 0.45 * (1 - ke(a, 0, 1)));
        this.expo = _n(this.expo, g, 0.03);
        let m = this.fx,
          x = {
            Time: n,
            Exposure: this.expo,
            Bloom: 0.42,
            Grain: this.settings.q === "low" ? 0.045 : 0.06,
            Vignette: 0.85,
            CA: 0.0035 + m.static * 0.01,
            Distort: 1,
            Damage: Math.min(1, m.damage),
            Fade: Math.max(m.fade, (this.state === "title", 0)),
            Static: Math.min(1, m.static),
            Pulse: m.pulse,
            LowHP: t.dead ? 0 : ke(1 - t.hp / 35, 0, 1),
            Lift: p.grade.lift,
            Gamma: p.grade.gamma,
            Gain: p.grade.gain,
            Sat: p.grade.sat,
            White: Math.max(m.white, Math.min(1, m.blind)),
            Underwater: m.underwater,
            bloomThresh: 1.1,
            Miasma: m.miasma || 0,
            Motion: this.motionVec(),
          };
        this.post.render(this.scene, i, this.vmScene, this.vmCamera, x);
      }
      motionVec() {
        let t = this.player,
          e = performance.now(),
          n = Math.max(1, e - (this._mvT || e)) / 1e3;
        this._mvT = e;
        let i = t.yaw - (this._mvYaw ?? t.yaw),
          r = t.pitch - (this._mvPitch ?? t.pitch);
        if (
          ((this._mvYaw = t.yaw),
          (this._mvPitch = t.pitch),
          i > Math.PI && (i -= Math.PI * 2),
          i < -Math.PI && (i += Math.PI * 2),
          this.settings.q === "low" || n > 0.2)
        )
          return [0, 0];
        let o = (this.camera.fov * Math.PI) / 180,
          a = 1 / 60 / Math.max(n, 1 / 120),
          c = (-i / (o * this.camera.aspect)) * a * 0.9,
          l = (r / o) * a * 0.9,
          h = 0.06;
        return [Math.max(-h, Math.min(h, c)), Math.max(-h, Math.min(h, l))];
      }
      updateFlicker(t, e) {
        let n = this.fs.map,
          i = this.mat.uniforms.uFlick.value,
          r = Math.floor(t.x / 4),
          o = Math.floor(t.z / 4),
          a = [];
        for (let c = o - 3; c <= o + 3; c++)
          for (let l = r - 3; l <= r + 3; l++) {
            if (!n.inb(l, c) || n.light[n.ci(l, c)] !== 2) continue;
            let h = (l + 0.5) * 4,
              u = (c + 0.5) * 4;
            a.push([(h - t.x) ** 2 + (u - t.z) ** 2, h, u, Qn(l, c, 99)]);
          }
        a.sort((c, l) => c[0] - l[0]);
        for (let c = 0; c < 4; c++) {
          let l = a[c];
          l ? i[c].set(l[1], l[2], 5, N1(e, l[3])) : i[c].set(0, 0, 0, 1);
        }
        this.nearFlick = a.length ? N1(e, a[0][3]) : 1;
      }
      addLight(t, e, n, i, r) {
        (this.dyn.unshift({
          pos: t.clone ? t.clone() : new L(t.x, t.y, t.z),
          col: e,
          i: n,
          r: i,
          t: 0,
          life: r,
        }),
          this.dyn.length > 4 && (this.dyn.length = 4));
      }
      emitNoise(t, e, n, i, r, o) {
        (o ||
          (this.noiseLevel = Math.max(
            this.noiseLevel || 0,
            Math.min(20, n * 0.25),
          )),
          this.monsters && this.monsters.hear(t, e, n, i, r),
          !o &&
            this.isMulti() &&
            this.fs &&
            !this.net.ownsFloor(this.fs.depth) &&
            this.net.noise(this.fs.depth, t, e, n, i, r));
      }
      hurtPlayer(t, e, n, i = {}) {
        let r = this.player;
        if (
          !(r.dead || this.state !== "play" || this.god) &&
          !(r.invuln > 0 && !i.quiet)
        ) {
          if (
            ((t *= r.stats.dmgTaken ?? 1),
            r.armor && !i.quiet && n !== "瘴気")
          ) {
            let o = t * r.armor.armor;
            ((r.armor.dura -= o * 1.2),
              (t -= o),
              r.armor.dura <= 0 &&
                ((r.armor = null),
                this.toast(
                  "防弾ベストが壊れた",
                  1400,
                )));
          }
          ((r.hp -= t),
            (r.sinceHurt = 0),
            i.quiet
              ? (this.fx.damage = Math.min(1, this.fx.damage + 0.15))
              : ((this.fx.damage = Math.min(
                  1.6,
                  this.fx.damage + 0.45 + t / 40,
                )),
                (r.shake = Math.max(r.shake, Math.min(1, t / 30))),
                this.audio &&
                  this.audio.sfx("hurt", {
                    vol: 0.9,
                    important: !0,
                    vary: 0.1,
                  })),
            r.hp <= 0 &&
              this.kill(
                n === "瘴気"
                  ? "瘴気に蝕まれた"
                  : n
                    ? `${n}に殺された`
                    : "力尽きた",
              ));
        }
      }
      onMapChanged() {
        this.monsters && this.monsters.invalidate();
      }
      resize(t, e) {
        ((this.camera.aspect = t / e),
          this.camera.updateProjectionMatrix(),
          (this.vmCamera.aspect = t / e),
          this.vmCamera.updateProjectionMatrix());
      }
    };
  function uA(s) {
    switch (s) {
      case 3:
        return [0, -1];
      case 1:
        return [0, 1];
      case 0:
        return [1, 0];
      default:
        return [-1, 0];
    }
  }
  var At = () => Math.random() * 2 - 1,
    _e = class {
      constructor(t) {
        ((this.sr = t), (this.l = 0), (this.b = 0));
      }
      set(t, e) {
        ((this.f =
          2 * Math.sin((Math.PI * Math.min(t, this.sr * 0.24)) / this.sr)),
          (this.q = 1 / e));
      }
      run(t) {
        this.l += this.f * this.b;
        let e = t - this.l - this.q * this.b;
        return ((this.b += this.f * e), [this.l, this.b, e]);
      }
    },
    ce = class {
      constructor(t, e) {
        ((this.sr = t), (this.y = 0), this.set(e));
      }
      set(t) {
        this.a = 1 - Math.exp((-2 * Math.PI * t) / this.sr);
      }
      run(t) {
        return ((this.y += this.a * (t - this.y)), this.y);
      }
    },
    Ed = class {
      constructor() {
        ((this.ctx = null),
          (this.vol = 0.8),
          (this.bufs = {}),
          (this.loops = {}),
          (this.voices = 0),
          (this.listener = { x: 0, y: 0, z: 0 }),
          (this.occlusion = null),
          (this.heartT = 0),
          (this.fear = 0),
          (this.theme = null));
      }
      unlock() {
        try {
          navigator.audioSession && (navigator.audioSession.type = "playback");
        } catch {}
        if (!this.ctx) {
          let t = window.AudioContext || window.webkitAudioContext;
          if (!t) return;
          ((this.ctx = new t({ latencyHint: "interactive" })), this.build());
        }
        this.ctx.state !== "running" && this.ctx.resume().catch(() => {});
        try {
          let t = this.ctx.createBuffer(1, 1, 22050),
            e = this.ctx.createBufferSource();
          ((e.buffer = t), e.connect(this.ctx.destination), e.start(0));
        } catch {}
      }
      setVolume(t) {
        ((this.vol = t),
          this.master &&
            this.master.gain.setTargetAtTime(t, this.ctx.currentTime, 0.05));
      }
      setPaused(t) {
        this.ctx &&
          (t
            ? this.ctx.suspend().catch(() => {})
            : this.ctx.resume().catch(() => {}));
      }
      build() {
        let t = this.ctx;
        ((this.SR = t.sampleRate),
          (this.master = t.createGain()),
          (this.master.gain.value = this.vol));
        let e = t.createDynamicsCompressor();
        ((e.threshold.value = -14),
          (e.knee.value = 10),
          (e.ratio.value = 4),
          (e.attack.value = 0.004),
          (e.release.value = 0.2),
          (this.duck = t.createBiquadFilter()),
          (this.duck.type = "lowpass"),
          (this.duck.frequency.value = 2e4),
          (this.duck.Q.value = 0.4),
          this.master.connect(this.duck),
          this.duck.connect(e),
          e.connect(t.destination),
          (this.sfxBus = t.createGain()),
          this.sfxBus.connect(this.master),
          (this.ambBus = t.createGain()),
          (this.ambBus.gain.value = 0.9),
          this.ambBus.connect(this.master),
          (this.verb = t.createConvolver()),
          (this.verbSend = t.createGain()),
          (this.verbSend.gain.value = 0.35),
          this.verbSend.connect(this.verb),
          this.verb.connect(this.master),
          this.sfxBus.connect(this.verbSend),
          (this.verb.buffer = this.makeIR(1.2, 2.2)),
          this.gen(),
          this.startLoops());
      }
      mk(t, e, n = 1) {
        let i = this.SR,
          r = Math.max(1, Math.floor(i * t)),
          o = this.ctx.createBuffer(n, r, i);
        for (let a = 0; a < n; a++) {
          let c = o.getChannelData(a);
          e(c, r, i, a);
          let l = 0;
          for (let h = 0; h < r; h++) l = Math.max(l, Math.abs(c[h]));
          if (l > 0) {
            let h = 0.9 / l;
            for (let u = 0; u < r; u++) c[u] *= h;
          }
        }
        return o;
      }
      makeIR(t, e) {
        let n = this.SR,
          i = Math.floor(n * t),
          r = this.ctx.createBuffer(2, i, n);
        for (let o = 0; o < 2; o++) {
          let a = r.getChannelData(o),
            c = new ce(n, 5e3);
          for (let l = 0; l < i; l++) {
            let h = l / n;
            (c.set(6e3 * Math.exp(-h * 2.2) + 400),
              (a[l] =
                c.run(At()) *
                Math.pow(1 - l / i, e) *
                (l < n * 0.004 ? l / (n * 0.004) : 1)));
          }
          for (let l = 0; l < 6; l++) {
            let h = Math.floor(n * (0.008 + Math.random() * 0.05));
            h < i &&
              (a[h] +=
                (Math.random() * 0.6 + 0.2) * (Math.random() < 0.5 ? -1 : 1));
          }
        }
        return r;
      }
      gen() {
        let t = this.bufs,
          e = (i, r, o) => (i < r ? i / r : Math.exp(-(i - r) / o));
        ((t.step_carpet = [0, 1, 2, 3].map(() =>
          this.mk(0.16, (i, r, o) => {
            let a = new ce(o, 380 + Math.random() * 180),
              c = new ce(o, 2400),
              l = 70 + Math.random() * 30;
            for (let h = 0; h < r; h++) {
              let u = h / o,
                f = e(u, 0.004, 0.035);
              i[h] =
                a.run(At()) * f * 1.4 +
                Math.sin(2 * Math.PI * l * u) * e(u, 0.003, 0.025) * 0.5 +
                c.run(At()) * e(u - 0.02, 0.01, 0.03) * 0.12 * (u > 0.02);
            }
          }),
        )),
          (t.step_hard = [0, 1, 2, 3].map(() =>
            this.mk(0.2, (i, r, o) => {
              let a = new _e(o);
              a.set(1800 + Math.random() * 800, 1.2);
              let c = new ce(o, 900);
              for (let l = 0; l < r; l++) {
                let h = l / o,
                  u = e(h, 0.001, 0.012),
                  f = h > 0.045 ? e(h - 0.045, 0.001, 0.01) * 0.6 : 0;
                i[l] =
                  a.run(At())[1] * (u + f) * 1.5 +
                  c.run(At()) * e(h, 0.002, 0.04) * 0.6;
              }
            }),
          )),
          (t.step_metal = [0, 1, 2, 3].map(() =>
            this.mk(0.35, (i, r, o) => {
              let a = new _e(o),
                c = new _e(o);
              (a.set(700 + Math.random() * 300, 18),
                c.set(1700 + Math.random() * 500, 25));
              for (let l = 0; l < r; l++) {
                let h = l / o,
                  u = At() * e(h, 0.001, 0.01);
                i[l] =
                  a.run(u)[1] * e(h, 0.001, 0.09) +
                  c.run(u)[1] * e(h, 0.001, 0.06) * 0.6 +
                  u * 0.3;
              }
            }),
          )),
          (t.step_water = [0, 1, 2, 3].map(() =>
            this.mk(0.32, (i, r, o) => {
              let a = new _e(o);
              for (let c = 0; c < r; c++) {
                let l = c / o;
                (a.set(
                  2200 * Math.exp(-l * 6) + 350 + 200 * Math.sin(l * 90),
                  2.5,
                ),
                  (i[c] =
                    a.run(At())[1] *
                    e(l, 0.01, 0.09) *
                    (0.7 + 0.3 * Math.sin(l * 260))));
              }
            }),
          )),
          (t.land = [
            this.mk(0.25, (i, r, o) => {
              let a = new ce(o, 300);
              for (let c = 0; c < r; c++) {
                let l = c / o;
                i[c] =
                  a.run(At()) * e(l, 0.003, 0.05) +
                  Math.sin(2 * Math.PI * 55 * l) * e(l, 0.002, 0.06);
              }
            }),
          ]),
          (t.hurt = [0, 1, 2].map(() =>
            this.mk(0.45, (i, r, o) => {
              let a = new _e(o),
                c = new _e(o);
              (a.set(650 + Math.random() * 100, 6),
                c.set(1150 + Math.random() * 150, 8));
              let l = new ce(o, 250),
                h = 0;
              for (let u = 0; u < r; u++) {
                let f = u / o,
                  d = 140 - f * 60 + Math.random() * 3;
                h += d / o;
                let p = (h % 1) * 2 - 1,
                  g =
                    (a.run(p)[1] + c.run(p)[1] * 0.6) *
                    e(f, 0.02, 0.12) *
                    (f < 0.3);
                i[u] = g + l.run(At()) * e(f, 0.002, 0.05) * 2;
              }
            }),
          )),
          (t.heart = [
            this.mk(0.5, (i, r, o) => {
              for (let a = 0; a < r; a++) {
                let c = a / o;
                i[a] =
                  Math.sin(2 * Math.PI * 52 * c) * e(c, 0.005, 0.05) +
                  Math.sin(2 * Math.PI * 46 * (c - 0.17)) *
                    (c > 0.17 ? e(c - 0.17, 0.005, 0.06) * 0.7 : 0);
              }
            }),
          ]),
          (t.breath = [0, 1].map(() =>
            this.mk(1.1, (i, r, o) => {
              let a = new _e(o);
              a.set(900, 1.5);
              for (let c = 0; c < r; c++) {
                let l = c / o,
                  h =
                    l < 0.45
                      ? Math.sin((Math.PI * l) / 0.45)
                      : l > 0.55
                        ? Math.sin((Math.PI * (l - 0.55)) / 0.5) * 0.8
                        : 0;
                i[c] = a.run(At())[1] * h;
              }
            }),
          )),
          (t.death = [
            this.mk(3, (i, r, o) => {
              let a = new ce(o, 200),
                c = 0;
              for (let l = 0; l < r; l++) {
                let h = l / o;
                ((c += (60 * Math.exp(-h * 0.5)) / o),
                  (i[l] =
                    a.run(At()) * e(h, 0.005, 0.4) * 1.5 +
                    Math.sin(2 * Math.PI * c) * e(h, 0.01, 1.2) * 0.8 +
                    Math.sin(2 * Math.PI * 3150 * h) * 0.05 * e(h, 0.3, 1.5)));
              }
            }),
          ]),
          (t.swing = [0, 1, 2].map(() =>
            this.mk(0.3, (i, r, o) => {
              let a = new _e(o);
              for (let c = 0; c < r; c++) {
                let l = c / o,
                  h = Math.sin(Math.PI * Math.min(1, l / 0.22));
                (a.set(300 + 1600 * h, 2.2), (i[c] = a.run(At())[1] * h * h));
              }
            }),
          )),
          (t.hit_flesh = [0, 1, 2].map(() =>
            this.mk(0.3, (i, r, o) => {
              let a = new ce(o, 420),
                c = new _e(o);
              c.set(900, 3);
              for (let l = 0; l < r; l++) {
                let h = l / o;
                i[l] =
                  a.run(At()) * e(h, 0.002, 0.04) * 2 +
                  c.run(At())[1] *
                    e(h, 0.01, 0.08) *
                    (0.6 + 0.4 * Math.sin(h * 140));
              }
            }),
          )),
          (t.hit_wall = [0, 1, 2].map(() =>
            this.mk(0.6, (i, r, o) => {
              let a = new ce(o, 1500),
                c = new ce(o, 3e3);
              for (let l = 0; l < r; l++) {
                let h = l / o,
                  u = Math.random() < 0.02 * Math.exp(-h * 4) ? At() * 2 : 0;
                i[l] =
                  a.run(At()) * e(h, 0.001, 0.03) * 2 +
                  Math.sin(2 * Math.PI * 70 * h) * e(h, 0.001, 0.05) +
                  c.run(u) * 3 * (h > 0.03);
              }
            }),
          )),
          (t.hit_metal = [0, 1].map(() =>
            this.mk(0.8, (i, r, o) => {
              let a = new _e(o),
                c = new _e(o),
                l = new _e(o);
              (a.set(520, 40), c.set(1310, 50), l.set(2290, 60));
              for (let h = 0; h < r; h++) {
                let u = h / o,
                  f = At() * e(u, 5e-4, 0.004);
                i[h] =
                  a.run(f)[1] * e(u, 0.001, 0.25) +
                  c.run(f)[1] * e(u, 0.001, 0.18) * 0.7 +
                  l.run(f)[1] * e(u, 0.001, 0.1) * 0.5 +
                  f;
              }
            }),
          )),
          (t.wall_break = [0, 1].map(() =>
            this.mk(2, (i, r, o) => {
              let a = new ce(o, 900),
                c = new ce(o, 120),
                l = new ce(o, 2500);
              for (let h = 0; h < r; h++) {
                let u = h / o,
                  f = Math.random() < 0.05 * Math.exp(-u * 1.8) ? At() * 3 : 0,
                  d = At();
                i[h] =
                  a.run(At()) * e(u, 0.002, 0.25) * 1.5 +
                  c.run(At()) * e(u, 0.01, 0.6) * 4 +
                  (d - l.run(d)) * f +
                  Math.sin(2 * Math.PI * 45 * u) * e(u, 0.002, 0.3);
              }
            }),
          )),
          (t.pistol = [0, 1].map(() =>
            this.mk(0.9, (i, r, o) => {
              let a = new ce(o, 7e3),
                c = new ce(o, 1400);
              for (let l = 0; l < r; l++) {
                let h = l / o;
                i[l] =
                  a.run(At()) * e(h, 4e-4, 0.018) * 2.2 +
                  Math.sin(2 * Math.PI * (160 - h * 150) * h) *
                    e(h, 0.001, 0.05) *
                    1.2 +
                  c.run(At()) * e(h, 0.01, 0.22) * 0.5;
              }
            }),
          )),
          (t.shotgun = [0, 1].map(() =>
            this.mk(1.3, (i, r, o) => {
              let a = new ce(o, 5e3),
                c = new ce(o, 900);
              for (let l = 0; l < r; l++) {
                let h = l / o;
                i[l] =
                  a.run(At()) * e(h, 5e-4, 0.035) * 2.5 +
                  Math.sin(2 * Math.PI * (100 - h * 60) * h) *
                    e(h, 0.001, 0.09) *
                    1.5 +
                  c.run(At()) * e(h, 0.02, 0.35) * 0.8;
              }
            }),
          )),
          (t.click = [
            this.mk(0.05, (i, r, o) => {
              let a = new _e(o);
              a.set(3500, 4);
              for (let c = 0; c < r; c++) {
                let l = c / o;
                i[c] = a.run(At())[1] * e(l, 5e-4, 0.006);
              }
            }),
          ]),
          (t.rack = [
            this.mk(0.3, (i, r, o) => {
              let a = new _e(o);
              a.set(2500, 3);
              for (let c = 0; c < r; c++) {
                let l = c / o;
                i[c] =
                  a.run(At())[1] *
                  (e(l, 0.001, 0.01) +
                    (l > 0.14 ? e(l - 0.14, 0.001, 0.012) : 0));
              }
            }),
          ]),
          (t.explosion = [
            this.mk(3.2, (i, r, o) => {
              let a = new ce(o, 3e3),
                c = new ce(o, 90),
                l = 0;
              for (let h = 0; h < r; h++) {
                let u = h / o;
                (a.set(3500 * Math.exp(-u * 2.5) + 150),
                  (l += (110 * Math.exp(-u * 1.6) + 28) / o));
                let f = Math.random() < 0.03 * Math.exp(-u * 2) ? At() * 2 : 0;
                i[h] =
                  a.run(At()) * e(u, 0.002, 0.5) * 1.6 +
                  Math.sin(2 * Math.PI * l) * e(u, 0.004, 0.7) * 1.6 +
                  c.run(At()) * e(u, 0.01, 1.1) * 6 +
                  f * e(u, 0.05, 0.6);
              }
            }),
          ]),
          (t.throw = [
            this.mk(0.35, (i, r, o) => {
              let a = new _e(o);
              for (let c = 0; c < r; c++) {
                let l = c / o,
                  h = Math.sin(Math.PI * Math.min(1, l / 0.3));
                (a.set(600 + 900 * h, 1.5), (i[c] = a.run(At())[1] * h));
              }
            }),
          ]),
          (t.fuse = [
            this.mk(1, (i, r, o) => {
              let a = new ce(o, 6e3);
              for (let c = 0; c < r; c++) {
                let l = At();
                i[c] =
                  (l - a.run(l)) *
                  (0.7 + 0.3 * Math.random()) *
                  (Math.random() < 0.002 ? 3 : 1);
              }
            }),
          ]),
          (t.beep = [
            this.mk(0.5, (i, r, o) => {
              for (let a = 0; a < r; a++) {
                let c = a / o,
                  l = c % 0.25 < 0.16 ? 1 : 0;
                i[a] =
                  (Math.sin(2 * Math.PI * 2900 * c) > 0 ? 0.5 : -0.5) * l +
                  Math.sin(2 * Math.PI * 2100 * c) * l * 0.3;
              }
            }),
          ]),
          (t.drink = [
            this.mk(1.2, (i, r, o) => {
              let a = new ce(o, 700);
              for (let c = 0; c < r; c++) {
                let l = c / o,
                  h = (l % 0.3) / 0.3;
                i[c] =
                  a.run(At()) *
                    Math.sin(Math.PI * Math.min(1, h * 3)) *
                    (h < 0.33) +
                  Math.sin(2 * Math.PI * (300 - h * 200) * l) *
                    0.2 *
                    (h < 0.25);
              }
            }),
          ]),
          (t.money = [
            this.mk(0.6, (i, r, o) => {
              let a = new _e(o);
              a.set(3200, 1.5);
              for (let c = 0; c < r; c++) {
                let l = c / o;
                i[c] =
                  a.run(At())[1] * e(l, 0.004, 0.05) * 0.8 +
                  Math.sin(2 * Math.PI * 1318 * l) *
                    e(l - 0.05, 0.002, 0.18) *
                    (l > 0.05) *
                    0.5 +
                  Math.sin(2 * Math.PI * 1975 * l) *
                    e(l - 0.1, 0.002, 0.2) *
                    (l > 0.1) *
                    0.4;
              }
            }),
          ]),
          (t.pickup = [
            this.mk(0.25, (i, r, o) => {
              let a = new _e(o);
              a.set(1800, 6);
              for (let c = 0; c < r; c++) {
                let l = c / o;
                i[c] =
                  a.run(At())[1] *
                  (e(l, 0.001, 0.01) +
                    (l > 0.08 ? e(l - 0.08, 0.001, 0.015) : 0));
              }
            }),
          ]),
          (t.ding = [
            this.mk(3, (i, r, o) => {
              for (let a = 0; a < r; a++) {
                let c = a / o;
                i[a] =
                  (Math.sin(2 * Math.PI * 880 * c) +
                    0.5 * Math.sin(2 * Math.PI * 1760 * c) +
                    0.25 * Math.sin(2 * Math.PI * 2637 * c)) *
                  e(c, 0.003, 0.9);
              }
            }),
          ]),
          (t.door = [
            this.mk(1.8, (i, r, o) => {
              let a = new _e(o);
              for (let c = 0; c < r; c++) {
                let l = c / o;
                (a.set(180 + 60 * Math.sin(l * 3), 4),
                  (i[c] =
                    a.run(At())[1] * Math.sin((Math.PI * l) / 1.8) +
                    Math.sin(2 * Math.PI * 95 * l) *
                      0.2 *
                      Math.sin((Math.PI * l) / 1.8)));
              }
            }),
          ]),
          (t.sting_red = [
            this.mk(2.2, (i, r, o) => {
              let a = [110, 116.5, 155, 164.8, 233],
                c = a.map(() => Math.random()),
                l = new ce(o, 2e3);
              for (let h = 0; h < r; h++) {
                let u = h / o,
                  f = 0;
                for (let d = 0; d < a.length; d++)
                  ((c[d] += a[d] / o), (f += (c[d] % 1) * 2 - 1));
                (l.set(3e3 * Math.exp(-u * 2) + 200),
                  (i[h] = l.run(f) * e(u, 0.01, 0.8)));
              }
            }),
          ]),
          (t.sting_blue = [
            this.mk(2.5, (i, r, o) => {
              let a = 0;
              for (let c = 0; c < r; c++) {
                let l = c / o;
                ((a += (55 + 8 * Math.sin(l * 7)) / o),
                  (i[c] =
                    Math.sin(2 * Math.PI * a) * e(l, 0.3, 1) +
                    Math.sin(4 * Math.PI * a + Math.sin(l * 5)) *
                      0.3 *
                      e(l, 0.3, 0.8)));
              }
            }),
          ]),
          (t.sting_black = [
            this.mk(3, (i, r, o) => {
              let a = 0,
                c = new _e(o);
              for (let l = 0; l < r; l++) {
                let h = l / o;
                ((a += (70 * Math.exp(-h * 0.8) + 22) / o),
                  c.set(500 + 300 * Math.sin(h * 13), 8),
                  (i[l] =
                    Math.sin(2 * Math.PI * a) * e(h, 0.05, 1.3) * 1.2 +
                    c.run(At())[1] * e(h, 0.5, 0.8) * 0.5));
              }
            }),
          ]),
          (t.growl = [0, 1, 2].map((i) =>
            this.mk(1.1 + i * 0.2, (r, o, a) => {
              let c = new ce(a, 900),
                l = new _e(a);
              l.set(320, 2);
              let h = 0,
                u = 65 + Math.random() * 40;
              for (let f = 0; f < o; f++) {
                let d = f / a;
                h += (u + Math.sin(d * 30) * 6 + At() * 8) / a;
                let p = (h % 1) * 2 - 1,
                  g =
                    0.6 +
                    0.4 * Math.sin(2 * Math.PI * 17 * d + Math.sin(d * 3)),
                  m = Math.sin(Math.PI * Math.min(1, d / (o / a)));
                r[f] =
                  Math.tanh(c.run(p * 2) * 2.5) * g * m +
                  l.run(At())[1] * 0.6 * m;
              }
            }),
          )),
          (t.roar = [0, 1].map(() =>
            this.mk(1.8, (i, r, o) => {
              let a = new ce(o, 1200),
                c = 0,
                l = 0;
              for (let h = 0; h < r; h++) {
                let u = h / o,
                  f = 55 + 30 * Math.sin((Math.PI * u) / 1.8);
                ((c += (f + At() * 10) / o), (l += (f * 1.51) / o));
                let d = (c % 1) * 2 - 1 + ((l % 1) * 2 - 1) * 0.5 + At() * 0.8;
                i[h] = Math.tanh(a.run(d) * 4) * Math.sin((Math.PI * u) / 1.8);
              }
            }),
          )),
          (t.screech = [0, 1].map(() =>
            this.mk(0.9, (i, r, o) => {
              let a = 0,
                c = 0,
                l = new ce(o, 300);
              for (let h = 0; h < r; h++) {
                let u = h / o;
                c += 233 / o;
                let f =
                  1300 +
                  500 * Math.sin(u * 9) +
                  400 * Math.sin(2 * Math.PI * c);
                a += f / o;
                let d =
                  Math.sin(2 * Math.PI * a + 3 * Math.sin(2 * Math.PI * c)) +
                  At() * 0.3;
                i[h] = (d - l.run(d)) * e(u, 0.03, 0.35);
              }
            }),
          )),
          (t.clicks = [0, 1].map(() =>
            this.mk(0.6, (i, r, o) => {
              let a = new _e(o);
              a.set(2400, 8);
              let c = 0;
              for (let l = 0; l < r; l++) {
                let h = l / o,
                  u = 0;
                (h > c && ((u = 1), (c = h + 0.02 + Math.random() * 0.06)),
                  (i[l] = a.run(u * At() * 4)[1]));
              }
            }),
          )),
          (t.moan = [0, 1].map(() =>
            this.mk(1.8, (i, r, o) => {
              let a = new _e(o),
                c = new _e(o),
                l = 0;
              for (let h = 0; h < r; h++) {
                let u = h / o,
                  f = Math.min(1, u / 1.6);
                (a.set(500 + 250 * f, 7),
                  c.set(900 + 500 * f, 9),
                  (l += (110 - 25 * f + Math.sin(u * 6) * 3) / o));
                let d = (l % 1) * 2 - 1;
                i[h] =
                  (a.run(d)[1] + c.run(d)[1] * 0.7 + At() * 0.03) *
                  Math.sin((Math.PI * u) / 1.8);
              }
            }),
          )),
          (t.squelch = [0, 1].map(() =>
            this.mk(0.6, (i, r, o) => {
              let a = new _e(o);
              for (let c = 0; c < r; c++) {
                let l = c / o;
                (a.set(300 + 900 * Math.abs(Math.sin(l * 25)), 5),
                  (i[c] = a.run(At())[1] * e(l, 0.02, 0.2)));
              }
            }),
          )),
          (t.whisper = [0, 1, 2].map(() =>
            this.mk(1.6, (i, r, o) => {
              let a = new _e(o),
                c = new _e(o),
                l = new ce(o, 1500),
                h = 0,
                u = 0,
                f = [700, 1200];
              for (let d = 0; d < r; d++) {
                let p = d / o;
                (p > u &&
                  ((u = p + 0.08 + Math.random() * 0.15),
                  (f = [
                    [300, 2300],
                    [700, 1200],
                    [500, 1800],
                    [650, 1e3],
                  ][Math.floor(Math.random() * 4)]),
                  (h = Math.random() < 0.3 ? 2 : 1)),
                  a.set(f[0], 6),
                  c.set(f[1], 8));
                let g = At(),
                  m = g - l.run(g),
                  x = Math.sin(Math.PI * ((u - p) / 0.2)) ** 2;
                i[d] =
                  (a.run(g)[1] + c.run(g)[1] * 0.8) * x * 0.6 +
                  m * (h === 2 ? x * 0.5 : 0.05);
              }
            }),
          )),
          (t.laugh = [
            this.mk(1.4, (i, r, o) => {
              let a = new _e(o),
                c = 0;
              for (let l = 0; l < r; l++) {
                let h = l / o;
                (a.set(1100, 5), (c += (330 + 60 * Math.sin(h * 40)) / o));
                let u = (c % 1) * 2 - 1,
                  f = Math.max(0, Math.sin(2 * Math.PI * 6.5 * h)) ** 2;
                i[l] = a.run(u)[1] * f * Math.exp(-h * 0.8) + At() * 0.04 * f;
              }
            }),
          ]),
          (t.scuttle = [
            this.mk(0.8, (i, r, o) => {
              let a = new _e(o);
              a.set(1500, 5);
              let c = 0;
              for (let l = 0; l < r; l++) {
                let h = l / o,
                  u = 0;
                (h > c && ((u = 1), (c = h + 0.03 + Math.random() * 0.03)),
                  (i[l] = a.run(u * At() * 3)[1] + At() * 0.02));
              }
            }),
          ]),
          (t.thud_far = [
            this.mk(0.8, (i, r, o) => {
              let a = new ce(o, 160);
              for (let c = 0; c < r; c++) {
                let l = c / o;
                i[c] = a.run(At()) * e(l, 0.004, 0.12) * 3;
              }
            }),
          ]),
          (t.creak = [
            this.mk(1.6, (i, r, o) => {
              let a = new _e(o),
                c = 0;
              for (let l = 0; l < r; l++) {
                let h = l / o;
                a.set(400 + 300 * Math.sin(h * 2) + 100 * Math.sin(h * 13), 25);
                let u = 0;
                (h > c && ((u = 1), (c = h + 0.004 + 0.01 * Math.random())),
                  (i[l] = a.run(u * At())[1] * Math.sin((Math.PI * h) / 1.6)));
              }
            }),
          ]),
          (t.drip = [0, 1].map(() =>
            this.mk(0.4, (i, r, o) => {
              let a = 0;
              for (let c = 0; c < r; c++) {
                let l = c / o;
                ((a += (1800 * Math.exp(-l * 12) + 900) / o),
                  (i[c] = Math.sin(2 * Math.PI * a) * e(l, 0.001, 0.05)));
              }
            }),
          )),
          (t.spark = [
            this.mk(0.5, (i, r, o) => {
              let a = new ce(o, 9e3);
              for (let c = 0; c < r; c++) {
                let l = c / o,
                  h = At();
                i[c] =
                  (h - a.run(h) * 0.5) *
                    (Math.random() < 0.3 ? 1 : 0.1) *
                    e(l, 0.001, 0.12) +
                  Math.sin(2 * Math.PI * 120 * l) * 0.3 * e(l, 0.001, 0.2);
              }
            }),
          ]),
          (t.crush = [
            this.mk(1.2, (i, r, o) => {
              let a = new ce(o, 400);
              for (let c = 0; c < r; c++) {
                let l = c / o;
                i[c] =
                  a.run(At()) * e(l, 0.001, 0.15) * 3 +
                  Math.sin(2 * Math.PI * 40 * l) * e(l, 0.001, 0.3) * 1.5;
              }
            }),
          ]),
          (t.collapse = [
            this.mk(1, (i, r, o) => {
              let a = new ce(o, 600);
              for (let c = 0; c < r; c++) {
                let l = c / o,
                  h = Math.random() < 0.04 ? At() * 2 : 0;
                i[c] = a.run(At()) * e(l, 0.01, 0.2) + h * e(l, 0.001, 0.4);
              }
            }),
          ]),
          (t.hum = this.mk(2, (i, r, o) => {
            for (let a = 0; a < r; a++) {
              let c = a / o,
                l = 0;
              for (let h = 1; h <= 9; h++)
                l +=
                  (Math.sin(2 * Math.PI * 120 * h * c + h * 1.7) /
                    (h === 1 ? 1.1 : h * 1.3)) *
                  (h % 2 ? 1 : 0.55);
              i[a] = l * 0.5 * (0.92 + 0.08 * Math.sin(2 * Math.PI * 0.5 * c));
            }
          })));
        let n = (i, r, o) =>
          this.mk(i, (a, c, l) => {
            let h = Math.floor(l * 0.5),
              u = c + h,
              f = new Float32Array(u);
            o(f, u, l);
            for (let d = 0; d < c; d++) a[d] = f[d];
            for (let d = 0; d < h; d++) {
              let p = d / h;
              a[d] = f[c + d] * (1 - p) + f[d] * p;
            }
          });
        ((t.drone = n(6, 0, (i, r, o) => {
          let a = new ce(o, 140),
            c = new ce(o, 60);
          for (let l = 0; l < r; l++) {
            let h = l / o;
            i[l] =
              a.run(At()) * 2 +
              c.run(At()) * 3 +
              Math.sin(2 * Math.PI * 41 * h) * 0.05;
          }
        })),
          (t.water_amb = n(6, 0, (i, r, o) => {
            let a = new _e(o);
            for (let c = 0; c < r; c++) {
              let l = c / o;
              (a.set(
                500 + 300 * Math.sin(l * 1.3) + 150 * Math.sin(l * 3.1),
                1.5,
              ),
                (i[c] =
                  a.run(At())[1] *
                  (0.5 + 0.5 * Math.sin(l * 2.2) * Math.sin(l * 0.7))));
            }
          })),
          (t.wind = n(8, 0, (i, r, o) => {
            let a = new _e(o);
            for (let c = 0; c < r; c++) {
              let l = c / o;
              (a.set(280 + 200 * Math.sin(l * 0.8) + 90 * Math.sin(l * 2.3), 6),
                (i[c] = a.run(At())[1] * (0.6 + 0.4 * Math.sin(l * 0.5))));
            }
          })),
          (t.steam = n(5, 0, (i, r, o) => {
            let a = new ce(o, 3e3);
            for (let c = 0; c < r; c++) {
              let l = At(),
                h = c / o;
              i[c] =
                (l - a.run(l)) *
                (0.3 + 0.7 * Math.max(0, Math.sin(h * 0.9)) ** 4);
            }
          })),
          (t.rumble = n(5, 0, (i, r, o) => {
            let a = new ce(o, 70);
            for (let c = 0; c < r; c++) {
              let l = c / o;
              i[c] = a.run(At()) * 4 + Math.sin(2 * Math.PI * 31 * l) * 0.3;
            }
          })),
          (t.hiss = n(4, 0, (i, r, o) => {
            let a = new ce(o, 5200);
            for (let c = 0; c < r; c++) {
              let l = At(),
                h = c / o;
              i[c] =
                (l - a.run(l)) *
                (0.75 + 0.25 * Math.sin(h * 7.3) * Math.sin(h * 1.9));
            }
          })),
          (t.roomtone = n(7, 0, (i, r, o) => {
            let a = new ce(o, 420),
              c = new ce(o, 900);
            for (let l = 0; l < r; l++) {
              let h = l / o;
              i[l] =
                a.run(At()) * 1.4 +
                c.run(At()) * 0.35 * (0.7 + 0.3 * Math.sin(h * 0.6));
            }
          })),
          (t.muzak = this.mk(8, (i, r, o) => {
            let a = [
                [220, 277.2, 329.6, 415.3],
                [196, 246.9, 293.7, 370],
                [174.6, 220, 261.6, 329.6],
                [196, 246.9, 311.1, 392],
              ],
              c = [
                659.3, 554.4, 493.9, 554.4, 587.3, 493.9, 440, 493.9, 523.3,
                440, 392, 440, 493.9, 466.2, 392, 0,
              ],
              l = new ce(o, 1100),
              h = new ce(o, 900);
            for (let u = 0; u < r; u++) {
              let f = u / o,
                d = Math.floor(f / 2) % 4,
                p = f % 2,
                g = 0;
              for (let _ of a[d])
                g +=
                  Math.sin(
                    2 * Math.PI * _ * f + Math.sin(2 * Math.PI * 4.8 * f) * 0.6,
                  ) *
                    0.18 +
                  Math.sin(2 * Math.PI * _ * 2 * f) * 0.03;
              g *= Math.min(1, p / 0.3) * Math.min(1, (2 - p) / 0.2);
              let m = Math.floor(f / 0.5) % 16,
                x = f % 0.5,
                v = c[m];
              v &&
                (g +=
                  (Math.sin(2 * Math.PI * v * f) +
                    0.3 * Math.sin(2 * Math.PI * v * 3 * f)) *
                  Math.exp(-x * 2.2) *
                  Math.min(1, x / 0.02) *
                  0.22);
              let y = l.run(g) * 0.8 + h.run(g) * 0.4;
              i[u] = y * (1 + 0.02 * Math.sin(2 * Math.PI * 0.33 * f));
            }
          })),
          (t.rifle = [0, 1].map(() =>
            this.mk(1, (i, r, o) => {
              let a = new ce(o, 9e3),
                c = new ce(o, 1600);
              for (let l = 0; l < r; l++) {
                let h = l / o;
                i[l] =
                  a.run(At()) * e(h, 3e-4, 0.014) * 2.6 +
                  Math.sin(2 * Math.PI * (210 - h * 180) * h) *
                    e(h, 0.001, 0.04) *
                    1.3 +
                  c.run(At()) * e(h, 0.008, 0.3) * 0.6;
              }
            }),
          )),
          (t.smg = [0, 1].map(() =>
            this.mk(0.6, (i, r, o) => {
              let a = new ce(o, 6500),
                c = new ce(o, 1300);
              for (let l = 0; l < r; l++) {
                let h = l / o;
                i[l] =
                  a.run(At()) * e(h, 4e-4, 0.012) * 2.2 +
                  Math.sin(2 * Math.PI * (180 - h * 160) * h) *
                    e(h, 0.001, 0.03) *
                    1.1 +
                  c.run(At()) * e(h, 0.006, 0.14) * 0.45;
              }
            }),
          )),
          (t.revolver = [0, 1].map(() =>
            this.mk(1.3, (i, r, o) => {
              let a = new ce(o, 6e3),
                c = new ce(o, 1e3);
              for (let l = 0; l < r; l++) {
                let h = l / o;
                i[l] =
                  a.run(At()) * e(h, 4e-4, 0.03) * 2.6 +
                  Math.sin(2 * Math.PI * (120 - h * 80) * h) *
                    e(h, 0.001, 0.08) *
                    1.6 +
                  c.run(At()) * e(h, 0.015, 0.4) * 0.7;
              }
            }),
          )),
          (t.launcher = [
            this.mk(0.8, (i, r, o) => {
              let a = new ce(o, 1200),
                c = new ce(o, 300);
              for (let l = 0; l < r; l++) {
                let h = l / o;
                i[l] =
                  a.run(At()) * e(h, 0.001, 0.03) * 2 +
                  c.run(At()) * e(h, 0.004, 0.12) * 3 +
                  Math.sin(2 * Math.PI * 70 * h) * e(h, 0.001, 0.06);
              }
            }),
          ]),
          (t.shell = [0, 1, 2].map(() =>
            this.mk(0.35, (i, r, o) => {
              let a = new _e(o),
                c = new _e(o);
              (a.set(3800 + Math.random() * 1500, 50),
                c.set(6900 + Math.random() * 1500, 60));
              for (let l = 0; l < r; l++) {
                let h = l / o,
                  u = At() * e(h, 2e-4, 0.002);
                i[l] =
                  a.run(u)[1] * e(h, 5e-4, 0.08) +
                  c.run(u)[1] * e(h, 5e-4, 0.05) * 0.6;
              }
            }),
          )),
          (t.mag_out = [
            this.mk(0.35, (i, r, o) => {
              let a = new _e(o);
              a.set(1900, 4);
              for (let c = 0; c < r; c++) {
                let l = c / o;
                i[c] =
                  a.run(At())[1] *
                  (e(l, 0.001, 0.012) +
                    (l > 0.09 ? e(l - 0.09, 0.002, 0.04) * 0.6 : 0));
              }
            }),
          ]),
          (t.mag_in = [
            this.mk(0.3, (i, r, o) => {
              let a = new _e(o),
                c = new ce(o, 800);
              a.set(2600, 5);
              for (let l = 0; l < r; l++) {
                let h = l / o;
                i[l] =
                  a.run(At())[1] * e(h, 0.001, 0.008) * 1.4 +
                  c.run(At()) * e(h, 0.001, 0.03);
              }
            }),
          ]),
          (t.shell_in = [
            this.mk(0.3, (i, r, o) => {
              let a = new _e(o);
              a.set(1500, 6);
              for (let c = 0; c < r; c++) {
                let l = c / o;
                i[c] =
                  a.run(At())[1] *
                  (e(l, 0.001, 0.01) +
                    (l > 0.12 ? e(l - 0.12, 0.001, 0.015) : 0));
              }
            }),
          ]),
          (t.ricochet = [0, 1].map(() =>
            this.mk(0.6, (i, r, o) => {
              let a = 0;
              for (let c = 0; c < r; c++) {
                let l = c / o;
                ((a += (3200 * Math.exp(-l * 3) + 700) / o),
                  (i[c] =
                    Math.sin(2 * Math.PI * a) * e(l, 0.002, 0.12) * 0.5 +
                    At() * e(l, 5e-4, 0.01) * 0.4));
              }
            }),
          )),
          (t.flashbang = [
            this.mk(2.2, (i, r, o) => {
              let a = new ce(o, 6e3),
                c = new ce(o, 150);
              for (let l = 0; l < r; l++) {
                let h = l / o;
                i[l] =
                  a.run(At()) * e(h, 5e-4, 0.06) * 3 +
                  c.run(At()) * e(h, 0.003, 0.4) * 5 +
                  Math.sin(2 * Math.PI * 3900 * h) * e(h, 0.05, 0.8) * 0.15;
              }
            }),
          ]),
          (t.gas_hiss = [
            this.mk(3, (i, r, o) => {
              let a = new ce(o, 3500);
              for (let c = 0; c < r; c++) {
                let l = c / o,
                  h = At();
                i[c] =
                  (h - a.run(h)) *
                  Math.min(1, l / 0.05) *
                  Math.exp(-l * 0.6) *
                  (0.8 + 0.2 * Math.sin(l * 40));
              }
            }),
          ]),
          (t.cough = [0, 1].map(() =>
            this.mk(0.7, (i, r, o) => {
              let a = new _e(o),
                c = new ce(o, 1200);
              a.set(700, 3);
              for (let l = 0; l < r; l++) {
                let h = l / o,
                  u =
                    e(h, 0.005, 0.07) +
                    (h > 0.25 ? e(h - 0.25, 0.005, 0.09) * 0.8 : 0);
                i[l] = (a.run(At())[1] * 0.7 + c.run(At()) * 0.6) * u;
              }
            }),
          )),
          (t.vent_open = [
            this.mk(1.2, (i, r, o) => {
              let a = new _e(o),
                c = new _e(o);
              (a.set(430, 25), c.set(1150, 30));
              for (let l = 0; l < r; l++) {
                let h = l / o,
                  u =
                    At() *
                    (e(h, 5e-4, 0.006) +
                      (h > 0.35 ? e(h - 0.35, 5e-4, 0.008) * 0.8 : 0) +
                      (h > 0.5 ? e(h - 0.5, 5e-4, 0.006) * 0.5 : 0));
                i[l] = a.run(u)[1] * 1.2 + c.run(u)[1] * 0.7 + u * 0.4;
              }
            }),
          ]),
          (t.chime = [
            this.mk(3.5, (i, r, o) => {
              let a = [523.3, 659.3, 784, 1046.5];
              for (let c = 0; c < r; c++) {
                let l = c / o,
                  h = 0;
                (a.forEach((u, f) => {
                  let d = l - f * 0.12;
                  d > 0 &&
                    (h +=
                      Math.sin(2 * Math.PI * u * d) * Math.exp(-d * 1.4) * 0.3 +
                      Math.sin(2 * Math.PI * u * 2.76 * d) *
                        Math.exp(-d * 3) *
                        0.08);
                }),
                  (i[c] = h));
              }
            }),
          ]),
          (t.revive = [
            this.mk(2, (i, r, o) => {
              let a = 0;
              for (let c = 0; c < r; c++) {
                let l = c / o;
                ((a += (220 + 440 * Math.min(1, l / 1.2)) / o),
                  (i[c] =
                    Math.sin(2 * Math.PI * a) * e(l, 0.2, 0.6) * 0.6 +
                    Math.sin(4 * Math.PI * a) * e(l, 0.3, 0.5) * 0.25));
              }
            }),
          ]),
          (t.inject = [
            this.mk(0.5, (i, r, o) => {
              let a = new _e(o);
              a.set(2200, 3);
              for (let c = 0; c < r; c++) {
                let l = c / o;
                i[c] =
                  a.run(At())[1] * e(l, 0.001, 0.02) +
                  At() * 0.15 * (l > 0.05 && l < 0.4 ? 0.3 : 0);
              }
            }),
          ]),
          (t.uav = this.mk(3, (i, r, o) => {
            let a = 0,
              c = new ce(o, 900);
            for (let l = 0; l < r; l++) {
              let h = l / o;
              a += (190 + 15 * Math.sin(h * 9)) / o;
              let u = ((a % 1) * 2 - 1) * 0.5 + At() * 0.3;
              i[l] =
                c.run(u) * Math.min(1, h / 0.4) * Math.min(1, (3 - h) / 0.6);
            }
          })),
          (t.sonar = [
            this.mk(2.5, (i, r, o) => {
              for (let a = 0; a < r; a++) {
                let c = a / o;
                i[a] =
                  Math.sin(2 * Math.PI * 1250 * c) * e(c, 0.004, 0.35) * 0.7 +
                  Math.sin(2 * Math.PI * 1250 * (c - 0.6)) *
                    (c > 0.6 ? e(c - 0.6, 0.004, 0.5) * 0.25 : 0);
              }
            }),
          ]));
      }
      startLoops() {
        let t = this.ctx,
          e = (n, i, r = 0) => {
            let o = t.createBufferSource();
            ((o.buffer = this.bufs[n]), (o.loop = !0));
            let a = t.createGain();
            ((a.gain.value = r),
              o.connect(a),
              a.connect(i),
              o.start(),
              (this.loops[n] = { src: o, gain: a }));
          };
        (e("hum", this.ambBus, 0),
          e("drone", this.ambBus, 0.05),
          e("hiss", this.ambBus, 0),
          e("roomtone", this.ambBus, 0),
          e("muzak", this.ambBus, 0),
          e("water_amb", this.ambBus, 0),
          e("wind", this.ambBus, 0),
          e("steam", this.ambBus, 0),
          e("rumble", this.ambBus, 0));
      }
      loopGain(t, e, n = 0.3) {
        let i = this.loops[t];
        i && i.gain.gain.setTargetAtTime(e, this.ctx.currentTime, n);
      }
      setTheme(t) {
        if (!this.ctx) {
          this.theme = t;
          return;
        }
        this.theme = t;
        let e = {
          yellow: [1, 2.5, 0.28],
          pool: [3.2, 1.6, 0.55],
          abyss: [4, 1.4, 0.5],
          parking: [2.2, 2, 0.4],
          pipes: [1.4, 2, 0.35],
          hospital: [1.2, 2.4, 0.3],
          office: [0.8, 2.8, 0.22],
          station: [3.4, 1.7, 0.5],
          mall: [3, 1.9, 0.45],
          school: [1.3, 2.3, 0.3],
          hotel: [0.6, 3, 0.16],
        }[t] || [1, 2, 0.3];
        ((this.verb.buffer = this.makeIR(e[0], e[1])),
          this.verbSend.gain.setTargetAtTime(e[2], this.ctx.currentTime, 0.2),
          this.loopGain("water_amb", t === "pool" ? 0.25 : 0),
          this.loopGain(
            "wind",
            t === "abyss" ? 0.3 : t === "parking" ? 0.06 : t === "station" ? 0.1 : 0,
          ),
          this.loopGain("steam", t === "pipes" ? 0.08 : 0),
          this.loopGain("drone", t === "abyss" ? 0.18 : 0.05),
          (this.humBase =
            {
              yellow: 0.09,
              pool: 0.03,
              abyss: 0.02,
              parking: 0.05,
              pipes: 0.03,
              hospital: 0.07,
              office: 0.04,
              station: 0.05,
              mall: 0.03,
              school: 0.06,
              hotel: 0.07,
            }[t] ?? 0.06));
      }
      sfx(t, e = {}) {
        if (!this.ctx || this.ctx.state !== "running") return null;
        let n = this.bufs[t];
        if (!n) return null;
        let i = Array.isArray(n) ? n[Math.floor(Math.random() * n.length)] : n;
        if (this.voices > 28 && !e.important) return null;
        let r = this.ctx,
          o = r.createBufferSource();
        ((o.buffer = i),
          (o.playbackRate.value =
            (e.rate ?? 1) * (e.vary ? 1 + (Math.random() - 0.5) * e.vary : 1)),
          e.loop && (o.loop = !0));
        let a = r.createGain();
        a.gain.value = e.vol ?? 1;
        let c = o;
        if (e.pos) {
          let l = e.pos.x - this.listener.x,
            h = e.pos.z - this.listener.z,
            u = Math.hypot(l, h),
            f = e.range ?? 60;
          if (u > f) return null;
          let d = Math.max(0, 1 - u / f);
          if (
            ((d = d * d * (e.vol ?? 1)),
            this.occlusion && u > 2 && this.occlusion(e.pos.x, e.pos.z))
          ) {
            let m = r.createBiquadFilter();
            ((m.type = "lowpass"),
              (m.frequency.value = 650),
              (m.Q.value = 0.5),
              c.connect(m),
              (c = m),
              (d *= 0.55));
          }
          a.gain.value = d;
          let g = r.createStereoPanner ? r.createStereoPanner() : null;
          if (g) {
            let m = Math.cos(this.listener.yaw),
              x = -Math.sin(this.listener.yaw),
              v = u > 0.1 ? (l * m + h * x) / u : 0;
            ((g.pan.value = Math.max(-1, Math.min(1, v * 0.85))),
              c.connect(g),
              (c = g));
          }
        }
        return (
          c.connect(a),
          a.connect(e.bus || this.sfxBus),
          o.start(r.currentTime + (e.delay || 0)),
          this.voices++,
          (o.onended = () => {
            this.voices--;
          }),
          { src: o, gain: a }
        );
      }
      update(t, e, n) {
        if (!this.ctx) return;
        ((this.listener.x = e.pos.x),
          (this.listener.z = e.pos.z),
          (this.listener.yaw = e.yaw));
        let i = n.light ?? 0.5,
          r = n.decay ?? 0.5,
          o = n.duct ? 0.25 : 1,
          a = this.fear;
        (this.loopGain(
          "hum",
          (this.humBase ?? 0.06) *
            Math.min(1.3, i) *
            (n.flick ?? 1) *
            (0.3 + r * 1.05) *
            o,
          0.08,
        ),
          this.loopGain(
            "hiss",
            Math.max(0, r - 0.58) * 0.13 * Math.min(1.2, i + 0.2) * o,
            0.6,
          ),
          this.loopGain(
            "roomtone",
            (0.025 + (1 - r) * 0.06) * (n.duct ? 1.6 : 1),
            0.8,
          ));
        let c = ["yellow", "office", "hospital", "pool"].includes(this.theme)
          ? 1
          : 0.35;
        if (
          (this.loopGain(
            "muzak",
            Math.max(0, 0.32 - r) *
              0.42 *
              c *
              (1 - Math.min(1, a * 1.5)) *
              (1 - (n.miasma || 0)) *
              o,
            1.2,
          ),
          this.loopGain(
            "drone",
            (this.theme === "abyss" ? 0.18 : 0.05) + (n.miasma || 0) * 0.16,
            1,
          ),
          this.loopGain("rumble", (n.black ?? 0) * 0.6, 0.4),
          (this.fear += ((n.fear ?? 0) - this.fear) * Math.min(1, t * 2)),
          this.fear > 0.15 || n.lowhp)
        ) {
          this.heartT -= t;
          let l = 70 + 80 * Math.max(this.fear, n.lowhp ? 0.6 : 0);
          this.heartT <= 0 &&
            ((this.heartT = 60 / l),
            this.sfx("heart", { vol: 0.35 + this.fear * 0.5, important: !0 }));
        }
      }
      tinnitus(t) {
        if (!this.ctx || this.ctx.state !== "running") return;
        let e = this.ctx,
          n = e.currentTime;
        (this.duck.frequency.cancelScheduledValues(n),
          this.duck.frequency.setValueAtTime(
            Math.min(this.duck.frequency.value, 2e4),
            n,
          ),
          this.duck.frequency.exponentialRampToValueAtTime(380, n + 0.03),
          this.duck.frequency.exponentialRampToValueAtTime(2e4, n + t));
        let i = e.createOscillator(),
          r = e.createGain();
        ((i.frequency.value = 3600 + Math.random() * 500),
          (i.type = "sine"),
          r.gain.setValueAtTime(0, n),
          r.gain.linearRampToValueAtTime(0.07 * this.vol, n + 0.05),
          r.gain.exponentialRampToValueAtTime(5e-4, n + t),
          i.connect(r),
          r.connect(e.destination),
          i.start(n),
          i.stop(n + t + 0.1));
      }
      ambient(t, e, n) {
        if (!this.ctx || ((this._ambT = (this._ambT ?? 4) - t), this._ambT > 0))
          return;
        this._ambT = 5 + Math.random() * 12;
        let i = Math.random() * Math.PI * 2,
          r = 18 + Math.random() * 30,
          o = { x: e.pos.x + Math.cos(i) * r, z: e.pos.z + Math.sin(i) * r },
          a = {
            yellow: ["thud_far", "creak", "whisper", "drip"],
            pool: ["drip", "drip", "thud_far"],
            abyss: ["creak", "thud_far", "hit_metal"],
            parking: ["thud_far", "creak", "drip"],
            pipes: ["hit_metal", "drip", "creak"],
            hospital: ["creak", "whisper", "drip"],
            office: ["creak", "thud_far", "whisper"],
            station: ["thud_far", "hit_metal", "creak", "whisper"],
            mall: ["creak", "thud_far", "whisper", "drip"],
            school: ["creak", "whisper", "thud_far"],
            hotel: ["whisper", "creak", "thud_far", "whisper"],
          }[n] || ["thud_far"],
          c = a[Math.floor(Math.random() * a.length)];
        this.sfx(c, {
          pos: o,
          vol: c === "whisper" ? 0.25 : 0.5,
          range: 70,
          rate: 0.8 + Math.random() * 0.4,
        });
      }
    };
  var fA = `
#ifdef USE_VCOL
in vec3 color;
in float aMat;
#endif
#include <skinning_pars_vertex>
out vec3 vPos; out vec3 vNrm; out vec3 vLPos; out vec3 vCol; flat out float vMatId;
uniform float uWobble; uniform float uTime;
void main(){
  vec3 transformed = position;
  vec3 objectNormal = normal;
  if (uWobble > 0.0) {
    float w = sin(transformed.y*9.0 + uTime*7.0) * sin(transformed.x*7.0 + uTime*5.0) * sin(transformed.z*8.0 - uTime*6.0);
    transformed += normal * w * uWobble;
  }
  vLPos = transformed;
#ifdef USE_SKINNING
  #include <skinbase_vertex>
  #include <skinning_vertex>
  #include <skinnormal_vertex>
#endif
  vec4 lp = vec4(transformed, 1.0);
  vec3 ln = objectNormal;
#ifdef USE_INSTANCING
  lp = instanceMatrix * lp;
  ln = mat3(instanceMatrix) * ln;
#endif
  vec4 wp = modelMatrix * lp;
  vPos = wp.xyz;
  vNrm = normalize(mat3(modelMatrix) * ln);
  float mid0 = 0.0; vec3 col0 = vec3(1.0);
#ifdef USE_VCOL
  col0 = color; mid0 = aMat;
#endif
#ifdef USE_INSTANCING_COLOR
  if (abs(mid0 - 27.0) > 0.5) col0 *= instanceColor; // region 27 (broken core) keeps its own colour
#endif
  vCol = col0; vMatId = mid0;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`,
    dA = `
precision highp float;
in vec3 vPos; in vec3 vNrm; in vec3 vLPos; in vec3 vCol; flat in float vMatId;
out vec4 fragColor;
uniform sampler2D tLight; uniform vec2 uWorld; uniform float uCeilH;
uniform vec3 uColor; uniform vec3 uColor2; uniform float uRough; uniform float uMetal; uniform vec3 uEmis;
uniform float uSSS; uniform float uWet; uniform float uHit; uniform float uSkin; uniform float uOpacity;
uniform float uLightAt; uniform float uView; uniform float uRim; uniform float uDark; uniform float uDirt; uniform float uBump;
uniform vec3 uViewUp; uniform vec4 uVmLight; uniform vec3 uTint;
${Fo}
${Ps}
float n3(vec3 p){ vec3 i = floor(p), f = fract(p); vec3 u = f*f*(3.0-2.0*f);
  float a = hash13(i), b = hash13(i+vec3(1,0,0)), c = hash13(i+vec3(0,1,0)), d = hash13(i+vec3(1,1,0));
  float e = hash13(i+vec3(0,0,1)), f1 = hash13(i+vec3(1,0,1)), g = hash13(i+vec3(0,1,1)), h = hash13(i+vec3(1,1,1));
  return mix(mix(mix(a,b,u.x), mix(c,d,u.x), u.y), mix(mix(e,f1,u.x), mix(g,h,u.x), u.y), u.z); }
float fbm3(vec3 p){ return n3(p)*0.55 + n3(p*2.03+5.1)*0.28 + n3(p*4.11+1.7)*0.17; }
// bump from a scalar height field via screen-space derivatives (surface gradient)
vec3 bumpN(vec3 N, float h, float k){
  vec3 dpdx = dFdx(vPos), dpdy = dFdy(vPos);
  float dhx = dFdx(h), dhy = dFdy(h);
  vec3 r1 = cross(dpdy, N), r2 = cross(N, dpdx);
  float det = dot(dpdx, r1);
  if (abs(det) < 1e-9) return N;
  vec3 g = (dhx * r1 + dhy * r2) / det;
  return normalize(N - g * k);
}
void main(){
  vec3 P = vPos; vec3 N = normalize(vNrm);
  if (!gl_FrontFacing) N = -N;
  bool vm = uView > 0.5;
  vec3 toCam = vm ? -P : uCam - P; float dist = length(toCam); vec3 V = toCam / max(dist, 1e-4);
  vec3 albedo = uColor * vCol;
  int mid = int(vMatId + 0.5);
  vec3 emis = uEmis;
  float rough = uRough; float metal = uMetal; float sss = uSSS; float wet = uWet; float spec = 0.15;
  vec3 Lp = vLPos;
  if (mid == 7) { emis += vCol * 2.2; albedo *= 0.2; }
  else if (mid == 6) { metal = 0.85; rough = 0.32; }
  else if (mid == 20 || (mid == 0 && uSkin > 0.0)) {
    // organic skin: mottling, veins, bruises, pores
    float k = mid == 20 ? 1.0 : uSkin;
    float n1 = fbm3(Lp*5.0), n2 = n3(Lp*23.0 + 3.0);
    float vein = 1.0 - smoothstep(0.0, 0.05, abs(fbm3(Lp*9.0 + 7.0) - 0.5));
    albedo *= mix(1.0, (0.72 + 0.5*n1) * (0.9 + 0.2*n2), k);
    albedo = mix(albedo, uColor2, vein * 0.32 * k);
    albedo = mix(albedo, uColor2*0.55, smoothstep(0.62, 0.86, n1) * 0.45 * k);
    float h = n2*0.6 + n3(Lp*61.0)*0.4 + vein*0.6;
    N = bumpN(N, h * 0.004 * (1.0 + uBump), 1.0);
    rough = mix(rough, rough*0.45, smoothstep(0.5, 0.75, n2) * wet);
    spec = 0.2 + wet*0.4;
  } else if (mid == 21 || mid == 14) {
    // woven cloth: rough, dirty, weave bump
    float weave = sin(Lp.x*1500.0 + Lp.z*700.0)*sin(Lp.y*1500.0)*0.5 + 0.5;
    float d = fbm3(Lp*4.0);
    albedo *= 0.8 + 0.35*d;
    albedo = mix(albedo, albedo*vec3(0.55,0.45,0.35), smoothstep(0.55, 0.8, fbm3(Lp*3.0+9.0)) * (0.5 + uDirt));
    N = bumpN(N, weave*0.00025 + d*0.003, 1.0);
    rough = 0.95; sss = 0.05; spec = 0.04;
  } else if (mid == 22) {
    // rubber / plastic (gloves, boots, mannequins)
    float d = fbm3(Lp*7.0);
    albedo *= 0.9 + 0.2*d;
    N = bumpN(N, n3(Lp*40.0)*0.0015, 1.0);
    rough = 0.42; sss = 0.0; spec = 0.35;
  } else if (mid == 23) {
    // PVC-coated hazmat fabric: soft folds, scuffs, grime
    float folds = fbm3(Lp*vec3(6.0, 11.0, 6.0));
    float crease = 1.0 - smoothstep(0.0, 0.07, abs(n3(Lp*vec3(9.0, 3.0, 9.0) + 2.0) - 0.5));
    float grime = smoothstep(0.5, 0.85, fbm3(Lp*2.6 + 4.0)) * (0.35 + uDirt);
    float low = 1.0 - smoothstep(0.0, 0.7, Lp.y);   // dirtier near the boots
    albedo *= uTint;                                  // per-person suit colour
    albedo *= 0.86 + 0.24*folds;
    albedo = mix(albedo, albedo*vec3(0.42,0.38,0.3), clamp(grime + low*0.5*(0.4+uDirt), 0.0, 0.85));
    N = bumpN(N, folds*0.012 + crease*0.004, 1.0);
    rough = 0.48 + grime*0.35; sss = 0.08; spec = 0.3;
  } else if (mid == 24 || mid == 13) {
    // visor glass: dark, glossy, strong fresnel
    albedo = mid == 24 ? vec3(0.012, 0.016, 0.02) : albedo * 0.3;
    rough = 0.06; sss = 0.0; spec = 1.0; metal = 0.0;
  } else if (mid == 25) {
    // exposed muscle: wet striations
    float str = sin(dot(Lp, vec3(0.0, 70.0, 20.0)) + n3(Lp*14.0)*6.0)*0.5 + 0.5;
    albedo *= 0.65 + 0.5*str;
    albedo = mix(albedo, albedo*vec3(1.2,0.75,0.7), smoothstep(0.6,0.9,n3(Lp*8.0)));
    N = bumpN(N, str*0.003, 1.0);
    rough = 0.25; wet = 1.0; sss = 0.5; spec = 0.6;
  } else if (mid == 26) {
    // teeth / bone
    albedo *= 0.85 + 0.25*n3(Lp*30.0);
    rough = 0.35; sss = 0.3; spec = 0.4;
  } else if (mid == 27) {
    // broken gypsum / concrete core
    float n = fbm3(Lp*30.0);
    albedo *= 0.8 + 0.35*n;
    N = bumpN(N, n*0.004 + n3(Lp*140.0)*0.0015, 1.0);
    rough = 0.95; sss = 0.0; spec = 0.05;
  } else if (mid == 28) {
    // polymer: matte, fine texture
    float n = n3(Lp*260.0);
    albedo *= 0.92 + 0.12*fbm3(Lp*20.0);
    N = bumpN(N, n*0.0004, 1.0);
    rough = 0.62; sss = 0.0; spec = 0.22;
  } else if (mid == 29) {
    // gun metal: dark finish worn to bright steel in places
    float w = smoothstep(0.66, 0.82, fbm3(Lp*38.0));
    albedo = mix(albedo, vec3(0.42, 0.42, 0.44), w*0.7);
    metal = 0.8; rough = mix(0.42, 0.25, w); sss = 0.0; spec = 0.5;
    N = bumpN(N, n3(Lp*500.0)*0.00025, 1.0);
  } else if (mid == 30) {
    // varnished wood grain
    float gr = fbm3(Lp*vec3(26.0, 26.0, 3.0));
    float rings = sin((Lp.x*55.0 + Lp.y*41.0) + gr*14.0)*0.5 + 0.5;
    albedo *= 0.72 + 0.4*rings;
    albedo = mix(albedo, albedo*vec3(0.6,0.5,0.42), smoothstep(0.62,0.8,fbm3(Lp*9.0+2.0))*0.6);
    N = bumpN(N, rings*0.0008, 1.0);
    rough = 0.46; sss = 0.05; spec = 0.35;
  } else if (mid == 31) {
    // rusty steel
    float r = fbm3(Lp*24.0);
    vec3 rustC = vec3(0.30, 0.14, 0.06) * (0.6 + 0.6*n3(Lp*90.0));
    albedo = mix(vec3(0.16, 0.15, 0.15), rustC, smoothstep(0.35, 0.65, r));
    N = bumpN(N, r*0.003 + n3(Lp*200.0)*0.001, 1.0);
    metal = mix(0.7, 0.1, smoothstep(0.35, 0.65, r)); rough = mix(0.45, 0.9, r); sss = 0.0; spec = 0.25;
  } else if (mid == 32) {
    // stippled grip
    float s = n3(Lp*420.0);
    N = bumpN(N, s*0.0007, 1.0);
    rough = 0.8; sss = 0.0; spec = 0.12;
  } else if (mid == 33) {
    // painted metal with chips and scuffs
    float c = fbm3(Lp*30.0);
    float chip = smoothstep(0.7, 0.74, c);
    albedo = mix(albedo * (0.9 + 0.15*n3(Lp*60.0)), vec3(0.38, 0.38, 0.4), chip);
    metal = chip * 0.85; rough = mix(0.5, 0.3, chip); sss = 0.0; spec = 0.35;
    N = bumpN(N, chip*0.0015, 1.0);
  }
  // light field (sampled at object position, or override)
  float E;
  if (uLightAt >= 0.0) E = uLightAt;
  else { vec4 lf = texture(tLight, (P.xz + N.xz*0.25) / uWorld); E = lf.r*lf.r*4.0; }
  float blk = 0.0, fl = 1.0;
  if (!vm) {
    float d0 = length(P.xz - uBlack.xy);
    blk = uBlack.w > 0.0 ? (1.0 - smoothstep(uBlack.z*0.8, uBlack.z, d0)) * uBlack.w : 0.0;
    for (int i=0;i<4;i++){ vec4 f = uFlick[i]; if (f.z > 0.0) { float d = length(P.xz - f.xy); fl *= mix(max(f.w, 0.3), 1.0, smoothstep(f.z*0.25, f.z, d)); } }
  }
  E *= (1.0 - blk*0.97) * uLightMul * fl;
  vec3 up = vm ? uViewUp : vec3(0.0, 1.0, 0.0);
  float ny = dot(N, up);
  float hgt = clamp(P.y / max(uCeilH, 1.0), 0.0, 1.0);
  float key = clamp((ny + sss) / (1.0 + sss), 0.0, 1.0);
  float amb = 0.38 + 0.12*ny;
  vec3 diffC = albedo * (1.0 - metal);
  float vgrad = uView > 0.5 ? 1.0 : mix(0.4, 1.12, smoothstep(0.0, 0.85, hgt));
  vec3 col = diffC * (E * uLightCol * (key*0.85 + amb*0.35) * vgrad + uAmb);
  col += albedo * uColor2 * E * sss * 0.15 * (1.0 - key);
  bool glassy = (mid == 24 || mid == 13);
  vec3 F0 = mix(vec3(glassy ? 0.06 : 0.04), albedo, metal);
  float nv = max(dot(N, V), 0.0);
  vec3 Fr = F0 + (1.0 - F0) * pow(1.0 - nv, 5.0);
  {
    vec3 H = normalize(up + V);
    float a = max(rough*rough, 0.02), a2 = a*a;
    float nh = max(dot(N, H), 0.0); float dd = nh*nh*(a2-1.0)+1.0;
    col += E * uLightCol * (a2 / (3.14159*dd*dd)) * Fr * spec * max(ny, 0.0) * (1.0 + wet*2.0);
  }
  // fake environment sheen (ceiling lights) for metals / glossy
  float envK = (0.35 + metal * 0.9) * (1.0 - rough * 0.7) + (glassy ? 1.6 : 0.0);
  col += Fr * E * uLightCol * (0.25 + 0.55 * max(ny, 0.0)) * envK;
  if (glassy) {
    // reflected ceiling panel streak on the visor
    vec3 R = reflect(-V, N);
    col += uLightCol * E * 2.5 * smoothstep(0.85, 0.97, dot(R, up)) * Fr;
  }
  if (uFlashI > 0.0) {
    vec3 fPos = vm ? vec3(0.03, -0.07, 0.06) : uFlashPos;
    vec3 fDir = vm ? vec3(0.0, 0.0, -1.0) : uFlashDir;
    vec3 Lf = fPos - P; float df = length(Lf); Lf /= df;
    float cosA = dot(-Lf, fDir);
    float cone = vm ? smoothstep(0.2, 0.9, cosA) * 0.5 : smoothstep(0.80, 0.95, cosA) * 0.8 + smoothstep(0.95, 0.995, cosA)*0.5;
    float att = uFlashI * cone / (1.0 + df*df*0.09);
    att = att / (1.0 + att*0.6);
    col += diffC * att * max(dot(N, Lf), 0.0) * vec3(1.0, 0.96, 0.88);
    vec3 Hf = normalize(Lf + V);
    col += att * pow(max(dot(N, Hf), 0.0), 2.0/max(rough*rough, 0.01)) * Fr * (0.25 + wet + spec);
  }
  if (!vm) {
    for (int i=0;i<4;i++){
      vec4 dp = uDynPos[i]; vec4 dc = uDynCol[i];
      if (dc.w <= 0.0) continue;
      vec3 Ld = dp.xyz - P; float d = length(Ld); Ld /= d;
      float att = dc.w * pow(clamp(1.0 - d/dp.w, 0.0, 1.0), 2.0);
      col += diffC * dc.rgb * att * max(dot(N, Ld) + 0.2, 0.0);
    }
  } else if (uVmLight.w > 0.0) {
    // muzzle flash / held flare lighting the hands
    vec3 Ld = uVmLight.xyz - P; float d = length(Ld); Ld /= d;
    float att = uVmLight.w / (1.0 + d*d*40.0);
    col += diffC * vec3(1.0, 0.72, 0.42) * att * max(dot(N, Ld) + 0.25, 0.0);
    col += att * pow(max(dot(N, normalize(Ld + V)), 0.0), 2.0/max(rough*rough, 0.01)) * Fr * 0.5;
  }
  col += uRim * pow(1.0 - nv, 3.0) * (E*0.3 + uFlashI*0.2) * vec3(0.9, 0.85, 0.8);
  col *= 1.0 - uDark;
  col += emis * (1.0 - blk*0.5);
  col = mix(col, vec3(2.5, 0.4, 0.3), uHit*0.6);
  if (uView < 0.5) {
    float fogF = 1.0 - exp(-pow(dist*uFogDen, 1.5));
    col = mix(col, uFogCol * uFogLight, fogF);
  }
  fragColor = vec4(col, uOpacity);
}
`;
  function On(s, t = {}) {
    let e = {};
    t.vcol && (e.USE_VCOL = 1);
    let n = {
      tLight: s.tLight,
      uWorld: s.uWorld,
      uCeilH: s.uCeilH,
      uCam: s.uCam,
      uTime: s.uTime,
      uLightCol: s.uLightCol,
      uLightMul: s.uLightMul,
      uAmb: s.uAmb,
      uFogCol: s.uFogCol,
      uFogDen: s.uFogDen,
      uFogLight: s.uFogLight,
      uBlack: s.uBlack,
      uFlashPos: s.uFlashPos,
      uFlashDir: s.uFlashDir,
      uFlashI: s.uFlashI,
      uDynPos: s.uDynPos,
      uDynCol: s.uDynCol,
      uFlick: s.uFlick,
      uColor: { value: new Rt(...(t.color || [0.5, 0.5, 0.5])) },
      uColor2: { value: new Rt(...(t.color2 || [0.3, 0.1, 0.1])) },
      uRough: { value: t.rough ?? 0.6 },
      uMetal: { value: t.metal ?? 0 },
      uEmis: { value: new Rt(...(t.emis || [0, 0, 0])) },
      uSSS: { value: t.sss ?? 0.2 },
      uWet: { value: t.wet ?? 0 },
      uHit: { value: 0 },
      uSkin: { value: t.skin ?? 0 },
      uOpacity: { value: t.opacity ?? 1 },
      uLightAt: { value: t.lightAt ?? -1 },
      uView: { value: t.view ? 1 : 0 },
      uRim: { value: t.rim ?? 0.2 },
      uWobble: { value: t.wobble ?? 0 },
      uDark: { value: 0 },
      uDirt: { value: t.dirt ?? 0.3 },
      uBump: { value: t.bump ?? 0 },
      uTint: { value: new Rt(...(t.tint || [1, 1, 1])) },
      uViewUp: s.uViewUp || { value: new L(0, 1, 0) },
      uVmLight: s.uVmLight || { value: new ue() },
    };
    return new De({
      glslVersion: yn,
      vertexShader: fA,
      fragmentShader: dA,
      uniforms: n,
      defines: e,
      transparent: (t.opacity ?? 1) < 1,
      depthWrite: (t.opacity ?? 1) >= 1,
      side: t.side ?? Ui,
    });
  }
  function yh(s, t, e = {}) {
    return new De({
      glslVersion: yn,
      vertexShader:
        "out vec3 vPos; void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vPos = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }",
      fragmentShader: `precision highp float; in vec3 vPos; out vec4 fragColor; uniform vec3 uC; uniform float uI; uniform vec3 uCam; uniform float uFogDen;
      void main(){ float d = length(uCam - vPos); float f = exp(-pow(d*uFogDen, 1.5)); fragColor = vec4(uC*uI*f, 1.0); }`,
      uniforms: {
        uC: { value: new Rt(...t) },
        uI: { value: e.intensity ?? 4 },
        uCam: s.uCam,
        uFogDen: s.uFogDen,
      },
      transparent: !!e.additive,
      blending: e.additive ? fs : us,
      depthWrite: !e.additive,
    });
  }
  var yt = {
      POLY: 28,
      GUN: 29,
      WOOD: 30,
      RUST: 31,
      GRIP: 32,
      PAINT: 33,
      METAL: 6,
      EMIS: 7,
      GLASS: 24,
      CLOTH: 21,
      RUBBER: 22,
      SUIT: 23,
    },
    _t = {
      black: [0.035, 0.036, 0.04],
      poly: [0.055, 0.056, 0.06],
      gun: [0.07, 0.072, 0.078],
      steel: [0.42, 0.42, 0.44],
      blued: [0.16, 0.17, 0.19],
      wood: [0.36, 0.19, 0.08],
      woodDark: [0.22, 0.11, 0.05],
      olive: [0.15, 0.17, 0.1],
      red: [0.5, 0.06, 0.04],
      brass: [0.65, 0.48, 0.18],
      rust: [0.3, 0.17, 0.09],
      hole: [0.004, 0.004, 0.004],
      yellow: [0.75, 0.55, 0.06],
    };
  function Fs(s, t, e, n, i, r, o, a, c, l, h) {
    s.hexa(
      [
        [t, o, a],
        [e, o, a],
        [e, o, c],
        [t, o, c],
        [t, n, i],
        [e, n, i],
        [e, n, r],
        [t, n, r],
      ],
      l,
      0,
      h,
    );
  }
  function Br(s, t, e, n, i, r = 10) {
    for (let o = 0; o < r; o++) {
      let a = (o / r) * Math.PI * 2,
        c = ((o + 1) / r) * Math.PI * 2;
      s.tri(
        [t, e, n],
        [t + Math.cos(a) * i, e + Math.sin(a) * i, n],
        [t + Math.cos(c) * i, e + Math.sin(c) * i, n],
        [0, 0, -1],
        F.DARK,
        0,
        _t.hole,
      );
    }
  }
  function Mc(s, t, e = 0, n = 0.0045) {
    (s.cbox(
      -n,
      e - 0.006,
      t - 0.05,
      n,
      e - 0.001,
      t + 0.004,
      0.0015,
      yt.POLY,
      0,
      _t.poly,
    ),
      s.cbox(
        -n,
        e - 0.006,
        t - 0.056,
        n,
        e + 0.016,
        t - 0.05,
        0.0015,
        yt.POLY,
        0,
        _t.poly,
      ),
      s.hexa(
        [
          [-0.0022, e + 0.001, t - 0.03],
          [0.0022, e + 0.001, t - 0.03],
          [0.0022, e + 0.001, t - 0.024],
          [-0.0022, e + 0.001, t - 0.024],
          [-0.0022, e + 0.016, t - 0.036],
          [0.0022, e + 0.016, t - 0.036],
          [0.0022, e + 0.016, t - 0.029],
          [-0.0022, e + 0.016, t - 0.029],
        ],
        yt.GUN,
        0,
        _t.steel,
      ));
  }
  function j2(s, t, e, n, i, r, o, a) {
    let c = (r - i) / o;
    for (let l = 0; l < o; l++) {
      let h = i + l * c + c * 0.3;
      s.box(
        a > 0 ? t : t - 0.0012,
        e,
        h,
        a > 0 ? t + 0.0012 : t,
        n,
        h + c * 0.4,
        F.DARK,
        0,
        _t.hole,
      );
    }
  }
  function pA(s, t, e, n, i = 0.0105) {
    s.box(-i, t, e, i, t + 0.004, n, yt.GUN, 0, _t.gun);
    for (let r = e + 0.004; r < n - 0.004; r += 0.01)
      s.box(
        -i - 5e-4,
        t + 0.004,
        r,
        i + 5e-4,
        t + 0.0075,
        r + 0.005,
        yt.GUN,
        0,
        _t.gun,
      );
  }
  function Z2(s, t, e, n, i, r, o, a, c, l) {
    let h = e,
      u = n,
      f = 0,
      d = i / c;
    for (let p = 0; p < c; p++) {
      let g = f + a / c,
        m = h - Math.cos(g) * d,
        x = u - Math.sin(g) * d,
        v = o * Math.cos(f),
        y = o * Math.cos(g);
      (s.hexa(
        [
          [t - r, m, x - y / 2],
          [t + r, m, x - y / 2],
          [t + r, m, x + y / 2],
          [t - r, m, x + y / 2],
          [t - r, h, u - v / 2],
          [t + r, h, u - v / 2],
          [t + r, h, u + v / 2],
          [t - r, h, u + v / 2],
        ],
        yt.POLY,
        0,
        l,
        p === 0 ? 61 : 63,
      ),
        (h = m),
        (u = x),
        (f = g));
    }
    s.cbox(
      t - r - 0.001,
      h - 0.006,
      u - o / 2 - 0.002,
      t + r + 0.001,
      h,
      u + o / 2 + 0.002,
      0.002,
      yt.POLY,
      0,
      _t.black,
    );
  }
  function J2(s, t, e, n = [0.5, 0.5, 0.52]) {
    let i = Kn.triangulateShape(
      t.map((r) => new ut(r[1], r[0])),
      [],
    );
    for (let r of [-1, 1])
      for (let o of i) {
        let a = (c) => {
          let l = t[c];
          return [r * e * (l[0] < 0 ? 0 : 1), l[0], l[1]];
        };
        s.tri(a(o[0]), a(o[1]), a(o[2]), [r, 0, 0], yt.METAL, 0, n);
      }
    for (let r = 0; r < t.length; r++) {
      let o = t[r],
        a = t[(r + 1) % t.length];
      if (o[0] < 0 && a[0] < 0) continue;
      let c = o[0] < 0 ? 0 : 1,
        l = a[0] < 0 ? 0 : 1,
        h = [0, a[1] - o[1], -(a[0] - o[0])],
        u = Math.hypot(h[1], h[2]) || 1;
      s.quad(
        [-e * c, o[0], o[1]],
        [e * c, o[0], o[1]],
        [e * l, a[0], a[1]],
        [-e * l, a[0], a[1]],
        [0, h[1] / u, h[2] / u],
        yt.METAL,
        0,
        [n[0] * 0.85, n[1] * 0.85, n[2] * 0.85],
      );
    }
  }
  var Q2 = {
      knife(s) {
        Fs(
          s,
          -0.0125,
          0.0125,
          0.016,
          0,
          0.11,
          -0.017,
          0,
          0.11,
          yt.GRIP,
          _t.black,
        );
        for (let t = 0; t < 6; t++)
          s.box(
            -0.013,
            -0.018,
            0.012 + t * 0.016,
            0.013,
            0.017,
            0.016 + t * 0.016,
            F.DARK,
            0,
            _t.hole,
          );
        (s.cbox(
          -0.011,
          -0.016,
          0.108,
          0.011,
          0.016,
          0.124,
          0.003,
          yt.METAL,
          0,
          _t.steel,
        ),
          s.cbox(
            -0.009,
            -0.024,
            -0.006,
            0.009,
            0.026,
            0.004,
            0.002,
            yt.GUN,
            0,
            _t.black,
          ),
          J2(
            s,
            [
              [-0.012, -0.006],
              [0.012, -0.006],
              [0.012, -0.11],
              [0.008, -0.145],
              [-0.001, -0.176],
              [-0.011, -0.15],
              [-0.016, -0.1],
              [-0.015, -0.006],
            ],
            0.0022,
            [0.3, 0.31, 0.33],
          ),
          s.quad(
            [0.0012, -0.011, -0.01],
            [0.0012, -0.015, -0.01],
            [0.0012, -0.012, -0.15],
            [0.0012, -0.008, -0.145],
            [1, 0, 0],
            yt.METAL,
            0,
            [0.8, 0.8, 0.82],
          ),
          s.quad(
            [-0.0012, -0.011, -0.01],
            [-0.0012, -0.015, -0.01],
            [-0.0012, -0.012, -0.15],
            [-0.0012, -0.008, -0.145],
            [-1, 0, 0],
            yt.METAL,
            0,
            [0.8, 0.8, 0.82],
          ));
      },
      pistol(s) {
        s.cbox(
          -0.0125,
          0.032,
          -0.168,
          0.0125,
          0.066,
          0.028,
          0.0035,
          yt.GUN,
          0,
          _t.gun,
        );
        for (let t = 0; t < 7; t++) {
          let e = 0 + t * 0.0036;
          (s.box(
            -0.0131,
            0.037,
            e,
            -0.0124,
            0.062,
            e + 0.0016,
            F.DARK,
            0,
            _t.hole,
          ),
            s.box(
              0.0124,
              0.037,
              e,
              0.0131,
              0.062,
              e + 0.0016,
              F.DARK,
              0,
              _t.hole,
            ));
        }
        (s.box(
          0.003,
          0.0655,
          -0.085,
          0.0128,
          0.0662,
          -0.035,
          F.DARK,
          0,
          _t.hole,
        ),
          s.cbox(
            -0.0016,
            0.066,
            -0.162,
            0.0016,
            0.0715,
            -0.154,
            6e-4,
            yt.GUN,
            0,
            _t.black,
          ),
          s.cbox(
            -0.0085,
            0.066,
            0.016,
            0.0085,
            0.0715,
            0.024,
            0.001,
            yt.GUN,
            0,
            _t.black,
          ),
          s.box(
            -0.0016,
            0.069,
            0.0155,
            0.0016,
            0.0716,
            0.0245,
            F.DARK,
            0,
            _t.hole,
          ),
          s.box(
            -0.0013,
            0.0712,
            -0.1595,
            0.0013,
            0.0716,
            -0.1565,
            F.EMIS,
            0,
            [0.5, 0.9, 0.4],
          ),
          Br(s, 0, 0.05, -0.1682, 0.0048),
          s.tube(
            "z",
            -0.1685,
            -0.165,
            0,
            0.05,
            0.0068,
            0.0068,
            yt.GUN,
            0,
            _t.steel,
            10,
          ),
          s.cbox(
            -0.0115,
            0.012,
            -0.158,
            0.0115,
            0.0335,
            0.022,
            0.003,
            yt.POLY,
            0,
            _t.poly,
          ));
        for (let t = 0; t < 3; t++)
          s.box(
            -0.0117,
            0.012,
            -0.15 + t * 0.009,
            0.0117,
            0.016,
            -0.146 + t * 0.009,
            yt.POLY,
            0,
            _t.black,
          );
        (Mc(s, -0.002, 0.012),
          Fs(
            s,
            -0.0128,
            0.0128,
            0.013,
            -0.026,
            0.026,
            -0.085,
            -0.006,
            0.046,
            yt.GRIP,
            _t.poly,
          ),
          s.cbox(
            -0.0135,
            -0.093,
            -0.008,
            0.0135,
            -0.084,
            0.048,
            0.002,
            yt.POLY,
            0,
            _t.black,
          ),
          s.box(
            -0.0129,
            -0.04,
            0.004,
            -0.0128,
            -0.01,
            0.03,
            F.DARK,
            0,
            _t.hole,
          ));
      },
      revolver(s) {
        (s.tube(
          "z",
          -0.205,
          -0.045,
          0,
          0.054,
          0.0105,
          0.0105,
          yt.GUN,
          0,
          _t.blued,
          12,
          1,
        ),
          Br(s, 0, 0.054, -0.2055, 0.0058),
          s.cbox(
            -0.0075,
            0.03,
            -0.205,
            0.0075,
            0.047,
            -0.055,
            0.0025,
            yt.GUN,
            0,
            _t.blued,
          ),
          s.cbox(
            -0.0055,
            0.062,
            -0.205,
            0.0055,
            0.067,
            -0.045,
            0.0015,
            yt.GUN,
            0,
            _t.blued,
          ),
          s.cbox(
            -0.0015,
            0.066,
            -0.2,
            0.0015,
            0.074,
            -0.188,
            6e-4,
            yt.GUN,
            0,
            _t.blued,
          ),
          s.cbox(
            -0.0118,
            0.018,
            -0.046,
            0.0118,
            0.07,
            0.044,
            0.003,
            yt.GUN,
            0,
            _t.blued,
          ),
          s.tube(
            "z",
            -0.04,
            0.012,
            0,
            0.045,
            0.021,
            0.021,
            yt.GUN,
            0,
            _t.steel,
            14,
            3,
          ));
        for (let t = 0; t < 6; t++) {
          let e = (t / 6) * Math.PI * 2 + 0.26;
          s.box(
            Math.cos(e) * 0.0205 - 0.0018,
            0.045 + Math.sin(e) * 0.0205 - 0.0018,
            -0.034,
            Math.cos(e) * 0.0205 + 0.0018,
            0.045 + Math.sin(e) * 0.0205 + 0.0018,
            0.006,
            F.DARK,
            0,
            _t.hole,
          );
          let n = e + Math.PI / 6;
          Br(
            s,
            Math.cos(n) * 0.012,
            0.045 + Math.sin(n) * 0.012,
            -0.0405,
            0.0045,
            8,
          );
        }
        (s.hexa(
          [
            [-0.003, 0.064, 0.036],
            [0.003, 0.064, 0.036],
            [0.003, 0.064, 0.05],
            [-0.003, 0.064, 0.05],
            [-0.003, 0.083, 0.046],
            [0.003, 0.083, 0.046],
            [0.003, 0.083, 0.06],
            [-0.003, 0.083, 0.06],
          ],
          yt.GUN,
          0,
          _t.blued,
        ),
          Mc(s, 0, 0.018),
          Fs(
            s,
            -0.014,
            0.014,
            0.022,
            0.012,
            0.05,
            -0.086,
            0.038,
            0.074,
            yt.WOOD,
            _t.wood,
          ),
          s.cbox(
            -0.0145,
            -0.04,
            0.03,
            -0.013,
            -0.02,
            0.05,
            0.001,
            yt.METAL,
            0,
            _t.steel,
          ));
      },
      smg(s) {
        (s.cbox(
          -0.02,
          0.03,
          -0.205,
          0.02,
          0.083,
          0.06,
          0.004,
          yt.GUN,
          0,
          _t.gun,
        ),
          s.cbox(
            -0.0225,
            0.022,
            -0.33,
            0.0225,
            0.07,
            -0.2,
            0.006,
            yt.POLY,
            0,
            _t.poly,
          ),
          j2(s, 0.0225, 0.03, 0.06, -0.32, -0.21, 9, 1),
          j2(s, -0.0225, 0.03, 0.06, -0.32, -0.21, 9, -1),
          s.tube(
            "z",
            -0.39,
            -0.33,
            0,
            0.06,
            0.0095,
            0.0095,
            yt.GUN,
            0,
            _t.gun,
            10,
            1,
          ),
          s.tube(
            "z",
            -0.4,
            -0.385,
            0,
            0.06,
            0.012,
            0.012,
            yt.GUN,
            0,
            _t.black,
            10,
            1,
          ),
          Br(s, 0, 0.06, -0.4005, 0.005),
          s.tube(
            "z",
            -0.3,
            -0.18,
            -0.017,
            0.081,
            0.0065,
            0.0065,
            yt.GUN,
            0,
            _t.gun,
            8,
            3,
          ),
          s.cbox(
            -0.026,
            0.074,
            -0.3,
            -0.016,
            0.082,
            -0.288,
            0.002,
            yt.POLY,
            0,
            _t.black,
          ),
          s.cbox(
            -0.008,
            0.083,
            -0.33,
            0.008,
            0.1,
            -0.31,
            0.002,
            yt.GUN,
            0,
            _t.gun,
          ),
          s.tube(
            "x",
            -0.009,
            0.009,
            0.098,
            0.035,
            0.009,
            0.009,
            yt.GUN,
            0,
            _t.gun,
            10,
            3,
          ),
          Z2(s, 0, 0.03, -0.135, 0.17, 0.011, 0.034, 0.32, 5, _t.black),
          Mc(s, 0.012, 0.03),
          Fs(
            s,
            -0.0135,
            0.0135,
            0.031,
            -0.006,
            0.032,
            -0.088,
            0.016,
            0.056,
            yt.GRIP,
            _t.poly,
          ));
        for (let t of [0.075, 0.04])
          for (let e of [-0.016, 0.016])
            s.tube("z", 0.06, 0.27, e, t, 0.0045, 0.0045, yt.GUN, 0, _t.gun, 6);
        s.cbox(
          -0.022,
          -0.025,
          0.265,
          0.022,
          0.095,
          0.29,
          0.006,
          yt.RUBBER,
          0,
          _t.black,
        );
      },
      shotgun(s) {
        (s.tube(
          "z",
          -0.8,
          -0.22,
          0,
          0.062,
          0.0115,
          0.0115,
          yt.GUN,
          0,
          _t.blued,
          12,
          1,
        ),
          Br(s, 0, 0.062, -0.8005, 0.009),
          s.tube(
            "z",
            -0.66,
            -0.22,
            0,
            0.033,
            0.0105,
            0.0105,
            yt.GUN,
            0,
            _t.blued,
            10,
            1,
          ),
          s.cbox(
            -0.012,
            0.022,
            -0.64,
            0.012,
            0.074,
            -0.625,
            0.003,
            yt.GUN,
            0,
            _t.blued,
          ),
          s.ell(
            0,
            0.0755,
            -0.792,
            0.0022,
            0.0022,
            0.0022,
            yt.METAL,
            0,
            _t.brass,
            6,
          ),
          s.cbox(
            -0.024,
            0.012,
            -0.44,
            0.024,
            0.052,
            -0.26,
            0.008,
            yt.WOOD,
            0,
            _t.wood,
          ));
        for (let t = 0; t < 9; t++) {
          let e = -0.43 + t * 0.019;
          s.box(
            -0.0245,
            0.016,
            e,
            0.0245,
            0.048,
            e + 0.004,
            F.DARK,
            0,
            _t.woodDark,
          );
        }
        (s.cbox(
          -0.019,
          0.018,
          -0.225,
          0.019,
          0.083,
          0.03,
          0.004,
          yt.GUN,
          0,
          _t.blued,
        ),
          s.box(0.0185, 0.05, -0.15, 0.0195, 0.072, -0.07, F.DARK, 0, _t.hole),
          s.box(
            -0.0195,
            0.035,
            -0.2,
            -0.0185,
            0.04,
            -0.06,
            yt.METAL,
            0,
            _t.steel,
          ),
          Mc(s, 0, 0.018),
          Fs(
            s,
            -0.017,
            0.017,
            0.072,
            0.012,
            0.05,
            -0.03,
            0.03,
            0.09,
            yt.WOOD,
            _t.wood,
          ),
          s.hexa(
            [
              [-0.02, -0.075, 0.09],
              [0.02, -0.075, 0.09],
              [0.02, -0.085, 0.4],
              [-0.02, -0.085, 0.4],
              [-0.018, 0.072, 0.05],
              [0.018, 0.072, 0.05],
              [0.02, 0.06, 0.4],
              [-0.02, 0.06, 0.4],
            ],
            yt.WOOD,
            0,
            _t.wood,
          ),
          s.cbox(
            -0.021,
            -0.088,
            0.398,
            0.021,
            0.064,
            0.422,
            0.006,
            yt.RUBBER,
            0,
            _t.black,
          ));
      },
      rifle(s) {
        (s.cbox(
          -0.0135,
          0.036,
          -0.17,
          0.0135,
          0.075,
          0.055,
          0.003,
          yt.GUN,
          0,
          _t.gun,
        ),
          pA(s, 0.075, -0.44, 0.055),
          s.cbox(
            -0.021,
            0.026,
            -0.44,
            0.021,
            0.079,
            -0.17,
            0.006,
            yt.POLY,
            0,
            _t.poly,
          ));
        for (let t = 0; t < 6; t++) {
          let e = -0.42 + t * 0.042;
          for (let n of [-1, 1])
            s.box(
              n > 0 ? 0.0208 : -0.0215,
              0.038,
              e,
              n > 0 ? 0.0215 : -0.0208,
              0.064,
              e + 0.024,
              F.DARK,
              0,
              _t.hole,
            );
        }
        (s.tube(
          "z",
          -0.58,
          -0.44,
          0,
          0.055,
          0.0085,
          0.0085,
          yt.GUN,
          0,
          _t.gun,
          10,
        ),
          s.cbox(
            -0.01,
            0.045,
            -0.5,
            0.01,
            0.083,
            -0.482,
            0.002,
            yt.GUN,
            0,
            _t.gun,
          ),
          s.tube(
            "z",
            -0.625,
            -0.578,
            0,
            0.055,
            0.0118,
            0.0118,
            yt.GUN,
            0,
            _t.black,
            10,
            1,
          ));
        for (let t = 0; t < 3; t++)
          s.box(
            -0.0122,
            0.058,
            -0.618 + t * 0.013,
            0.0122,
            0.062,
            -0.612 + t * 0.013,
            F.DARK,
            0,
            _t.hole,
          );
        (Br(s, 0, 0.055, -0.6255, 0.0045),
          s.cbox(
            -0.013,
            0,
            -0.14,
            0.013,
            0.037,
            0.035,
            0.003,
            yt.GUN,
            0,
            _t.gun,
          ),
          s.cbox(
            -0.0125,
            -0.012,
            -0.12,
            0.0125,
            0.002,
            -0.066,
            0.002,
            yt.GUN,
            0,
            _t.gun,
          ),
          Z2(
            s,
            0,
            -0.008,
            -0.093,
            0.17,
            0.0105,
            0.058,
            0.36,
            6,
            [0.09, 0.085, 0.07],
          ),
          Mc(s, 0, 0.002),
          Fs(
            s,
            -0.0135,
            0.0135,
            0.004,
            -0.005,
            0.03,
            -0.092,
            0.024,
            0.064,
            yt.GRIP,
            _t.black,
          ),
          s.tube(
            "z",
            0.05,
            0.25,
            0,
            0.052,
            0.0155,
            0.0155,
            yt.GUN,
            0,
            _t.black,
            12,
          ),
          s.hexa(
            [
              [-0.019, -0.01, 0.17],
              [0.019, -0.01, 0.17],
              [0.019, -0.025, 0.27],
              [-0.019, -0.025, 0.27],
              [-0.017, 0.072, 0.15],
              [0.017, 0.072, 0.15],
              [0.019, 0.088, 0.27],
              [-0.019, 0.088, 0.27],
            ],
            yt.POLY,
            0,
            _t.poly,
          ),
          s.cbox(
            -0.02,
            -0.03,
            0.268,
            0.02,
            0.09,
            0.282,
            0.005,
            yt.RUBBER,
            0,
            _t.black,
          ),
          s.cbox(
            -0.009,
            0.072,
            0.04,
            0.009,
            0.08,
            0.065,
            0.002,
            yt.GUN,
            0,
            _t.gun,
          ),
          s.cbox(
            -0.012,
            0.079,
            -0.1,
            0.012,
            0.09,
            -0.04,
            0.002,
            yt.GUN,
            0,
            _t.black,
          ),
          s.tube(
            "z",
            -0.11,
            -0.03,
            0,
            0.106,
            0.018,
            0.018,
            yt.GUN,
            0,
            _t.black,
            14,
          ),
          s.tube(
            "z",
            -0.1105,
            -0.106,
            0,
            0.106,
            0.0165,
            0.0165,
            yt.GLASS,
            0,
            [0.2, 0.25, 0.3],
            14,
            1,
          ),
          s.tube(
            "y",
            0.123,
            0.13,
            0,
            -0.07,
            0.006,
            0.006,
            yt.GUN,
            0,
            _t.black,
            8,
            2,
          ),
          s.ell(
            0,
            0.106,
            -0.07,
            0.0012,
            0.0012,
            6e-4,
            F.EMIS,
            0,
            [6, 0.3, 0.2],
            6,
          ));
      },
      launcher(s) {
        (s.tube(
          "z",
          -0.42,
          -0.03,
          0,
          0.066,
          0.025,
          0.025,
          yt.PAINT,
          0,
          _t.olive,
          16,
          1,
        ),
          Br(s, 0, 0.066, -0.4205, 0.0205, 14),
          s.cbox(
            -0.021,
            0.03,
            -0.05,
            0.021,
            0.09,
            0.065,
            0.005,
            yt.GUN,
            0,
            _t.gun,
          ),
          s.hexa(
            [
              [-0.023, 0.026, -0.32],
              [0.023, 0.026, -0.32],
              [0.023, 0.026, -0.06],
              [-0.023, 0.026, -0.06],
              [-0.026, 0.05, -0.32],
              [0.026, 0.05, -0.32],
              [0.026, 0.05, -0.06],
              [-0.026, 0.05, -0.06],
            ],
            yt.WOOD,
            0,
            _t.wood,
          ),
          s.box(
            -0.012,
            0.09,
            -0.07,
            -0.009,
            0.125,
            -0.064,
            yt.GUN,
            0,
            _t.black,
          ),
          s.box(0.009, 0.09, -0.07, 0.012, 0.125, -0.064, yt.GUN, 0, _t.black),
          s.box(
            -0.012,
            0.122,
            -0.07,
            0.012,
            0.126,
            -0.064,
            yt.GUN,
            0,
            _t.black,
          ),
          s.cbox(
            -0.002,
            0.091,
            -0.41,
            0.002,
            0.1,
            -0.4,
            8e-4,
            yt.GUN,
            0,
            _t.black,
          ),
          Mc(s, 0, 0.03),
          Fs(
            s,
            -0.019,
            0.019,
            0.075,
            0.02,
            0.065,
            -0.02,
            0.04,
            0.1,
            yt.WOOD,
            _t.wood,
          ),
          s.hexa(
            [
              [-0.022, -0.06, 0.09],
              [0.022, -0.06, 0.09],
              [0.022, -0.07, 0.38],
              [-0.022, -0.07, 0.38],
              [-0.02, 0.075, 0.06],
              [0.02, 0.075, 0.06],
              [0.022, 0.06, 0.38],
              [-0.022, 0.06, 0.38],
            ],
            yt.WOOD,
            0,
            _t.wood,
          ),
          s.cbox(
            -0.023,
            -0.074,
            0.378,
            0.023,
            0.064,
            0.4,
            0.006,
            yt.RUBBER,
            0,
            _t.black,
          ));
      },
      pipe(s) {
        (s.tube(
          "z",
          -0.6,
          0.11,
          0,
          0,
          0.0165,
          0.0165,
          yt.RUST,
          0,
          _t.rust,
          12,
          3,
        ),
          s.tube(
            "z",
            -0.64,
            -0.58,
            0,
            0,
            0.0215,
            0.0215,
            yt.RUST,
            0,
            [0.26, 0.2, 0.15],
            12,
            3,
          ),
          Br(s, 0, 0, -0.6405, 0.012));
        for (let t = 0; t < 5; t++)
          s.tube(
            "z",
            -0.575 + t * 0.006,
            -0.572 + t * 0.006,
            0,
            0,
            0.0172,
            0.0172,
            F.DARK,
            0,
            [0.1, 0.07, 0.05],
            12,
          );
        s.tube(
          "z",
          -0.05,
          0.09,
          0,
          0,
          0.0192,
          0.0192,
          yt.CLOTH,
          0,
          [0.05, 0.05, 0.055],
          12,
        );
      },
      crowbar(s) {
        s.tube(
          "z",
          -0.47,
          0.13,
          0,
          0,
          0.0115,
          0.0115,
          yt.PAINT,
          0,
          _t.red,
          6,
          2,
        );
        let t = 0,
          e = -0.47,
          n = 0;
        for (let i = 0; i < 7; i++) {
          let r = n + 0.45,
            o = t + Math.sin(r) * 0.022,
            a = e - Math.cos(r) * 0.022,
            c = 0.0115 - i * 6e-4,
            l = c - 6e-4;
          (s.hexa(
            [
              [-c, t - c, e],
              [c, t - c, e],
              [l, o - l, a],
              [-l, o - l, a],
              [-c, t + c, e],
              [c, t + c, e],
              [l, o + l, a],
              [-l, o + l, a],
            ],
            yt.PAINT,
            0,
            _t.red,
          ),
            (t = o),
            (e = a),
            (n = r));
        }
        (s.hexa(
          [
            [-0.008, t - 0.006, e],
            [0.008, t - 0.006, e],
            [0.012, t + 0.012, e + 0.03],
            [-0.012, t + 0.012, e + 0.03],
            [-0.008, t + 0.006, e],
            [0.008, t + 0.006, e],
            [0.012, t + 0.016, e + 0.028],
            [-0.012, t + 0.016, e + 0.028],
          ],
          yt.METAL,
          0,
          _t.steel,
        ),
          s.hexa(
            [
              [-0.0115, -0.004, 0.13],
              [0.0115, -0.004, 0.13],
              [0.006, 0.006, 0.16],
              [-0.006, 0.006, 0.16],
              [-0.0115, 0.008, 0.13],
              [0.0115, 0.008, 0.13],
              [0.006, 0.009, 0.16],
              [-0.006, 0.009, 0.16],
            ],
            yt.METAL,
            0,
            _t.steel,
          ));
      },
      machete(s) {
        Fs(
          s,
          -0.011,
          0.011,
          0.016,
          -0.02,
          0.12,
          -0.016,
          -0.02,
          0.12,
          yt.POLY,
          _t.black,
        );
        for (let t of [0.01, 0.06, 0.1])
          for (let e of [-1, 1])
            s.tube(
              "x",
              e * 0.011,
              e * 0.0125,
              0,
              t,
              0.0035,
              0.0035,
              yt.METAL,
              0,
              _t.steel,
              8,
              2,
            );
        (s.cbox(
          -0.008,
          -0.022,
          -0.028,
          0.008,
          0.024,
          -0.018,
          0.002,
          yt.METAL,
          0,
          _t.blued,
        ),
          J2(
            s,
            [
              [-0.012, -0.02],
              [0.022, -0.02],
              [0.024, -0.2],
              [0.03, -0.38],
              [0.022, -0.46],
              [0.005, -0.5],
              [-0.022, -0.47],
              [-0.03, -0.38],
              [-0.02, -0.2],
              [-0.016, -0.02],
            ],
            0.0016,
          ),
          s.quad(
            [9e-4, -0.014, -0.03],
            [9e-4, -0.02, -0.03],
            [9e-4, -0.024, -0.38],
            [9e-4, -0.016, -0.37],
            [1, 0, 0],
            yt.METAL,
            0,
            [0.85, 0.85, 0.88],
          ),
          s.quad(
            [-9e-4, -0.014, -0.03],
            [-9e-4, -0.02, -0.03],
            [-9e-4, -0.024, -0.38],
            [-9e-4, -0.016, -0.37],
            [-1, 0, 0],
            yt.METAL,
            0,
            [0.85, 0.85, 0.88],
          ));
      },
      axe(s) {
        (Fs(
          s,
          -0.0125,
          0.0125,
          0.019,
          -0.62,
          0.12,
          -0.017,
          -0.62,
          0.12,
          yt.PAINT,
          _t.yellow,
        ),
          s.tube(
            "z",
            0,
            0.12,
            0,
            0.001,
            0.0185,
            0.0185,
            yt.RUBBER,
            0,
            _t.black,
            10,
            2,
          ),
          s.hexa(
            [
              [-0.014, 0, -0.66],
              [0.014, 0, -0.66],
              [0.014, 0, -0.585],
              [-0.014, 0, -0.585],
              [-0.002, 0.13, -0.69],
              [0.002, 0.13, -0.69],
              [0.002, 0.13, -0.56],
              [-0.002, 0.13, -0.56],
            ],
            yt.PAINT,
            0,
            _t.red,
          ),
          s.hexa(
            [
              [-0.0012, 0.125, -0.69],
              [0.0012, 0.125, -0.69],
              [0.0012, 0.125, -0.56],
              [-0.0012, 0.125, -0.56],
              [-6e-4, 0.14, -0.695],
              [6e-4, 0.14, -0.695],
              [6e-4, 0.14, -0.555],
              [-6e-4, 0.14, -0.555],
            ],
            yt.METAL,
            0,
            [0.75, 0.75, 0.78],
          ),
          s.hexa(
            [
              [-0.013, 0, -0.645],
              [0.013, 0, -0.645],
              [0.013, 0, -0.6],
              [-0.013, 0, -0.6],
              [-0.002, -0.11, -0.628],
              [0.002, -0.11, -0.628],
              [0.002, -0.11, -0.618],
              [-0.002, -0.11, -0.618],
            ],
            yt.PAINT,
            0,
            _t.red,
          ),
          s.cbox(
            -0.015,
            -0.02,
            -0.655,
            0.015,
            0.02,
            -0.59,
            0.004,
            yt.PAINT,
            0,
            _t.red,
          ));
      },
      hammer(s) {
        (Fs(
          s,
          -0.0135,
          0.0135,
          0.018,
          -0.6,
          0.13,
          -0.018,
          -0.6,
          0.13,
          yt.WOOD,
          [0.45, 0.3, 0.15],
        ),
          s.tube(
            "z",
            0.02,
            0.13,
            0,
            0,
            0.0195,
            0.0195,
            yt.RUBBER,
            0,
            _t.black,
            10,
            2,
          ),
          s.cbox(
            -0.034,
            -0.095,
            -0.665,
            0.034,
            0.095,
            -0.585,
            0.006,
            yt.GUN,
            0,
            [0.2, 0.2, 0.21],
          ),
          s.cbox(
            -0.03,
            -0.104,
            -0.66,
            0.03,
            -0.094,
            -0.59,
            0.004,
            yt.METAL,
            0,
            [0.5, 0.5, 0.52],
          ),
          s.cbox(
            -0.03,
            0.094,
            -0.66,
            0.03,
            0.104,
            -0.59,
            0.004,
            yt.METAL,
            0,
            [0.5, 0.5, 0.52],
          ));
      },
    },
    Ad = Object.keys(Q2),
    Wn = {
      pistol: { muzzle: [0, 0.05, -0.17], twoHand: !1 },
      revolver: { muzzle: [0, 0.054, -0.21], twoHand: !1 },
      smg: { muzzle: [0, 0.06, -0.41], support: [0, 0.03, -0.26], twoHand: !0 },
      shotgun: {
        muzzle: [0, 0.062, -0.81],
        support: [0, 0.02, -0.35],
        twoHand: !0,
        pump: !0,
      },
      rifle: {
        muzzle: [0, 0.055, -0.64],
        support: [0, 0.03, -0.32],
        twoHand: !0,
      },
      launcher: {
        muzzle: [0, 0.066, -0.43],
        support: [0, 0.03, -0.22],
        twoHand: !0,
      },
      pipe: {},
      crowbar: {},
      machete: {},
      knife: {},
      axe: { twoHand: !1 },
      hammer: {},
    };
  function _h(s, t = new ks()) {
    let e = Q2[s];
    return (e && e(t), t);
  }
  var X1 = new Map();
  function t_(s) {
    if (X1.has(s)) return X1.get(s);
    let t = _h(s).build(),
      e = new Qt()
        .makeRotationY(-Math.PI / 2)
        .multiply(new Qt().makeRotationZ(Math.PI / 2));
    (t.applyMatrix4(e), t.computeBoundingBox());
    let n = t.boundingBox;
    return (
      t.translate(
        -(n.min.x + n.max.x) / 2,
        -n.min.y + 0.002,
        -(n.min.z + n.max.z) / 2,
      ),
      t.computeBoundingSphere(),
      X1.set(s, t),
      t
    );
  }
  var be = {
      cash: { kind: "money", name: "札束" },
      gold: { kind: "money", name: "金塊" },
      relic: {
        kind: "money",
        name: "深層の遺物",
        relic: !0,
      },
      pipe: {
        kind: "melee",
        name: "鉄パイプ",
        dmg: 30,
        range: 2.2,
        rate: 0.55,
        wallDmg: 2,
        noise: 22,
        verb: "殴る",
        heavy: 0,
      },
      crowbar: {
        kind: "melee",
        name: "バール",
        dmg: 32,
        range: 2,
        rate: 0.48,
        wallDmg: 3,
        noise: 20,
        verb: "殴る",
        heavy: 0,
      },
      machete: {
        kind: "melee",
        name: "マチェーテ",
        dmg: 44,
        range: 2.1,
        rate: 0.42,
        wallDmg: 1,
        noise: 12,
        verb: "斬る",
        heavy: 0,
      },
      knife: {
        kind: "melee",
        name: "コンバットナイフ",
        dmg: 30,
        range: 1.7,
        rate: 0.3,
        wallDmg: 0.5,
        noise: 6,
        verb: "刺す",
        heavy: 0,
      },
      axe: {
        kind: "melee",
        name: "消防斧",
        dmg: 66,
        range: 2.3,
        rate: 0.82,
        wallDmg: 4,
        noise: 30,
        verb: "振る",
        heavy: 1,
      },
      hammer: {
        kind: "melee",
        name: "スレッジハンマー",
        dmg: 90,
        range: 2.35,
        rate: 1,
        wallDmg: 6,
        noise: 44,
        verb: "振る",
        heavy: 1,
      },
      pistol: {
        kind: "gun",
        name: "拳銃",
        dmg: 36,
        rate: 0.26,
        spread: 0.012,
        pellets: 1,
        noise: 55,
        ammo: "9mm",
        give: 18,
        verb: "撃つ",
      },
      revolver: {
        kind: "gun",
        name: "リボルバー",
        dmg: 95,
        rate: 0.62,
        spread: 0.007,
        pellets: 1,
        noise: 70,
        ammo: "357",
        give: 8,
        verb: "撃つ",
        snd: "shotgun",
      },
      smg: {
        kind: "gun",
        name: "サブマシンガン",
        dmg: 22,
        rate: 0.075,
        spread: 0.032,
        pellets: 1,
        noise: 60,
        ammo: "9mm",
        give: 40,
        verb: "撃つ",
        auto: !0,
        snd: "pistol",
      },
      shotgun: {
        kind: "gun",
        name: "散弾銃",
        dmg: 15,
        rate: 0.9,
        spread: 0.07,
        pellets: 9,
        noise: 72,
        ammo: "12g",
        give: 8,
        verb: "撃つ",
      },
      rifle: {
        kind: "gun",
        name: "アサルトライフル",
        dmg: 36,
        rate: 0.095,
        spread: 0.014,
        pellets: 1,
        noise: 76,
        ammo: "556",
        give: 60,
        verb: "撃つ",
        auto: !0,
        snd: "pistol",
      },
      launcher: {
        kind: "launcher",
        name: "グレネードランチャー",
        dmg: 260,
        radius: 5.5,
        rate: 0.95,
        noise: 120,
        ammo: "40mm",
        give: 4,
        verb: "撃つ",
      },
      ammo_9mm: { kind: "ammo", name: "9mm弾", ammo: "9mm", amount: 24 },
      ammo_357: { kind: "ammo", name: ".357弾", ammo: "357", amount: 8 },
      ammo_12g: { kind: "ammo", name: "散弾", ammo: "12g", amount: 8 },
      ammo_556: { kind: "ammo", name: "5.56mm弾", ammo: "556", amount: 45 },
      ammo_40mm: {
        kind: "ammo",
        name: "40mm榴弾",
        ammo: "40mm",
        amount: 3,
      },
      bandage: {
        kind: "use",
        name: "包帯",
        stack: 6,
        heal: 22,
        useTime: 0.7,
        verb: "巻く",
      },
      medkit: {
        kind: "use",
        name: "救急キット",
        stack: 3,
        heal: 65,
        useTime: 1.6,
        verb: "使う",
      },
      painkiller: {
        kind: "use",
        name: "鎮痛剤",
        stack: 4,
        hot: 45,
        hotTime: 18,
        useTime: 0.5,
        verb: "飲む",
      },
      water: {
        kind: "use",
        name: "アーモンド水",
        stack: 4,
        heal: 15,
        drink: 30,
        useTime: 1,
        verb: "飲む",
      },
      energy: {
        kind: "use",
        name: "エナジードリンク",
        stack: 4,
        stamina: 1,
        drink: 35,
        useTime: 0.9,
        verb: "飲む",
      },
      adren: {
        kind: "use",
        name: "アドレナリン注射",
        stack: 3,
        adren: 9,
        useTime: 0.4,
        verb: "打つ",
      },
      gas: {
        kind: "deploy",
        name: "中和ガス缶",
        stack: 3,
        miasma: 22,
        dur: 22,
        radius: 6,
        verb: "散布",
      },
      gasbig: {
        kind: "deploy",
        name: "中和ガスボンベ",
        stack: 1,
        miasma: 45,
        dur: 40,
        radius: 10,
        verb: "散布",
      },
      filter: {
        kind: "use",
        name: "防毒フィルター",
        stack: 4,
        filter: 120,
        useTime: 1.1,
        verb: "交換",
      },
      stim: {
        kind: "use",
        name: "戦闘刺激剤",
        stack: 3,
        heal: 30,
        adren: 6,
        useTime: 0.5,
        verb: "打つ",
      },
      vest: {
        kind: "armor",
        name: "防弾ベスト",
        armor: 0.35,
        dura: 160,
      },
      bomb: {
        kind: "throw",
        name: "パイプ爆弾",
        stack: 5,
        fuse: 2.3,
        radius: 5.2,
        dmg: 300,
        noise: 140,
        verb: "投げる",
      },
      flash: {
        kind: "throw",
        name: "閃光弾",
        stack: 5,
        fuse: 1.3,
        radius: 13,
        stun: 4.5,
        noise: 70,
        verb: "投げる",
      },
      flare: {
        kind: "throw",
        name: "発炎筒",
        stack: 5,
        dur: 70,
        verb: "投げる",
      },
      buzzer: {
        kind: "throw",
        name: "防犯ブザー",
        stack: 5,
        dur: 10,
        noise: 42,
        verb: "投げる",
      },
      revive: {
        kind: "use",
        name: "蘇生キット",
        stack: 2,
        revive: !0,
        useTime: 2.5,
        verb: "蘇生",
      },
      crate: { kind: "crate", name: "補給ケース" },
      safe: { kind: "crate", name: "金庫", vault: !0 },
    },
    e_ = {
      kind: "melee",
      name: "素手",
      dmg: 11,
      range: 1.6,
      rate: 0.45,
      wallDmg: 1,
      noise: 8,
      verb: "殴る",
      heavy: 0,
    };
  var n_ = (s) => {
      let t = be[s] && be[s].kind;
      return t === "melee" || t === "gun" || t === "launcher";
    },
    Be = (s) => `<svg viewBox="0 0 24 24">${s}</svg>`,
    wc = {
      fist: Be(
        '<path d="M7 11V7a1.5 1.5 0 013 0v3M10 10V6a1.5 1.5 0 013 0v4M13 10V7a1.5 1.5 0 013 0v4M16 11a1.5 1.5 0 013 0v3c0 4-3 7-7 7s-6-3-6-6v-2a1.5 1.5 0 013 0"/>',
      ),
      pipe: Be('<path d="M5 20L19 4"/><path d="M15.5 6.5l2 2"/>'),
      crowbar: Be(
        '<path d="M6 21L18 6c1-1.3 2.6-1.3 3 0"/><path d="M4 19l2 2"/>',
      ),
      machete: Be(
        '<path d="M4 20l3-3"/><path d="M7 17L19 5c1.2 1.6.8 4-1 6l-8 8z"/>',
      ),
      knife: Be(
        '<path d="M5 19l4-4"/><path d="M9 15l9-9c1 2 0 4-2 6l-5 5z"/><path d="M7 13l4 4"/>',
      ),
      gasbig: Be(
        '<rect x="6" y="6" width="12" height="16" rx="4"/><path d="M10 6V3h4v3M6 12h12M3 10c-1 3 0 6 2 7M21 10c1 3 0 6-2 7"/>',
      ),
      filter: Be(
        '<circle cx="12" cy="13" r="7"/><circle cx="12" cy="13" r="3"/><path d="M9 4h6v2H9z"/>',
      ),
      stim: Be(
        '<path d="M4 20l3-3"/><path d="M6 14l8-8 4 4-8 8z"/><path d="M14 4l6 6M10 10l2 2"/>',
      ),
      vest: Be(
        '<path d="M8 3l-4 3v14h16V6l-4-3-2 3h-4z"/><path d="M4 12h16"/>',
      ),
      axe: Be('<path d="M6 21L17 8"/><path d="M14 4c3-1 6 2 5 5l-4-1-1-4z"/>'),
      hammer: Be('<path d="M6 21l9-9"/><path d="M12 6l4-4 6 6-4 4z"/>'),
      pistol: Be(
        '<path d="M3 8h17v4H11l-1 3H7l1-3H3z"/><path d="M8 15l-1 5h3l1-5"/>',
      ),
      revolver: Be(
        '<path d="M2 9h12v3H8l-1 2H5"/><circle cx="12" cy="12" r="2.4"/><path d="M14 10h7M6 14l-1 6h3l1-5"/>',
      ),
      smg: Be(
        '<path d="M2 9h15v4H9l-1 2"/><path d="M17 10h5M11 13v6h2v-6M5 13l-1 4"/>',
      ),
      shotgun: Be(
        '<path d="M2 10h15v3H2z"/><path d="M17 10h3l2 4h-4l-1-1"/><path d="M8 13v3"/>',
      ),
      rifle: Be(
        '<path d="M1 10h17v3H1zM18 11h5"/><path d="M8 13v5h2v-5M3 13l-1 4h3"/><path d="M10 8h4v2"/>',
      ),
      launcher: Be(
        '<rect x="3" y="8" width="15" height="6" rx="2"/><path d="M18 10h3M8 14l-1 5h3l1-5"/>',
      ),
      bandage: Be(
        '<rect x="4" y="8" width="16" height="8" rx="4"/><path d="M10 8v8M14 8v8"/>',
      ),
      medkit: Be(
        '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3M12 10v7M8.5 13.5h7"/>',
      ),
      painkiller: Be(
        '<rect x="7" y="7" width="10" height="14" rx="2"/><path d="M7 11h10M9 3h6v4H9z"/>',
      ),
      water: Be('<path d="M10 2h4v3l2 3v13H8V8l2-3z"/><path d="M8 13h8"/>'),
      energy: Be('<path d="M8 3h8v18H8z"/><path d="M13 7l-3 5h3l-2 5"/>'),
      adren: Be(
        '<path d="M4 20l4-4"/><path d="M7 13l8-8 4 4-8 8z"/><path d="M14 4l6 6"/>',
      ),
      gas: Be(
        '<rect x="7" y="7" width="10" height="14" rx="3"/><path d="M10 7V4h4v3M12 2v2M4 12c-1 2 0 4 2 5M20 12c1 2 0 4-2 5"/>',
      ),
      bomb: Be(
        '<rect x="5" y="9" width="12" height="8" rx="1"/><path d="M5 11h12M5 15h12M17 13h2l2-4"/>',
      ),
      flash: Be(
        '<rect x="8" y="8" width="8" height="12" rx="2"/><path d="M10 8V5h4v3M16 10l3-2M12 2v1M17 5l1-1"/>',
      ),
      flare: Be('<path d="M9 21l6-12"/><path d="M15 9c-2-3 1-6 1-6s4 3 1 7"/>'),
      buzzer: Be(
        '<rect x="7" y="7" width="10" height="13" rx="2"/><circle cx="12" cy="11" r="2"/><path d="M4 6c-1 2-1 4 0 6M20 6c1 2 1 4 0 6"/>',
      ),
      revive: Be(
        '<path d="M12 21s-8-5-8-11a4.5 4.5 0 018-3 4.5 4.5 0 018 3c0 6-8 11-8 11z"/><path d="M12 9v6M9 12h6"/>',
      ),
    },
    i_ = {
      melee: '<path d="M5 19l9-9M14 4l6 6-3 3-6-6zM4 20l3-1-2-2z"/>',
      fist: '<path d="M7 11V7a1.5 1.5 0 013 0v3M10 10V6a1.5 1.5 0 013 0v4M13 10V7a1.5 1.5 0 013 0v4M16 11a1.5 1.5 0 013 0v3c0 4-3 7-7 7s-6-3-6-6v-2a1.5 1.5 0 013 0"/>',
      gun: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
      launcher:
        '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
    };
  function bh(s) {
    let t = new ks(),
      e = (r, o, a, c, l, h, u, f = F.PROP) => t.box(r, o, a, c, l, h, f, 0, u),
      n = (r, o, a, c, l, h, u = F.METAL, f = 8) =>
        t.cylH("x", r, o, a, c, l, u, 0, h, f),
      i = (r, o, a, c, l, h, u = F.PROP, f = 10) =>
        t.cylY(r, o, a, c, l, u, 0, h, f);
    switch (s) {
      case "cash":
        for (let r = 0; r < 3; r++) {
          let o = (r - 1) * 0.07,
            a = (r % 2) * 0.03,
            c = r === 2 ? 0.035 : 0;
          (e(
            o - 0.08,
            c,
            a - 0.035,
            o + 0.08,
            c + 0.034,
            a + 0.035,
            [0.42, 0.47, 0.38],
          ),
            e(
              o - 0.02,
              c - 0.001,
              a - 0.036,
              o + 0.02,
              c + 0.036,
              a + 0.036,
              [0.85, 0.78, 0.55],
            ));
        }
        break;
      case "gold":
        (e(-0.1, 0, -0.045, 0.1, 0.045, 0.045, [0.95, 0.68, 0.22], F.METAL),
          e(0, 0.045, -0.04, 0.18, 0.09, 0.04, [0.95, 0.68, 0.22], F.METAL));
        break;
      case "relic":
        (e(-0.08, 0, -0.08, 0.08, 0.05, 0.08, [0.1, 0.1, 0.1], F.METAL),
          e(-0.05, 0.05, -0.05, 0.05, 0.2, 0.05, [0.4, 1.2, 1], F.EMIS));
        break;
      case "pipe":
        (n(-0.5, 0.5, 0.03, 0, 0.022, [0.2, 0.15, 0.11]),
          n(0.42, 0.5, 0.03, 0, 0.03, [0.3, 0.3, 0.3]));
        break;
      case "crowbar":
        (n(-0.42, 0.36, 0.02, 0, 0.014, [0.42, 0.06, 0.04]),
          e(0.34, 0, -0.012, 0.44, 0.07, 0.012, [0.42, 0.06, 0.04], F.METAL),
          e(-0.48, 0, -0.012, -0.4, 0.025, 0.012, [0.42, 0.06, 0.04], F.METAL));
        break;
      case "machete":
        (e(-0.42, 0.01, -0.016, -0.18, 0.04, 0.016, [0.05, 0.05, 0.05]),
          e(
            -0.18,
            0.015,
            -0.003,
            0.3,
            0.075,
            0.003,
            [0.55, 0.56, 0.58],
            F.METAL,
          ));
        break;
      case "axe":
        (n(-0.45, 0.32, 0.025, 0, 0.018, [0.5, 0.32, 0.15], F.PROP, 6),
          e(
            0.26,
            -0.01,
            -0.012,
            0.36,
            0.16,
            0.012,
            [0.62, 0.08, 0.05],
            F.METAL,
          ),
          e(0.2, 0, -0.01, 0.26, 0.05, 0.01, [0.3, 0.3, 0.3], F.METAL));
        break;
      case "hammer":
        (n(-0.45, 0.3, 0.025, 0, 0.018, [0.42, 0.28, 0.14], F.PROP, 6),
          e(0.3, 0, -0.09, 0.42, 0.11, 0.09, [0.25, 0.25, 0.26], F.METAL));
        break;
      case "pistol":
        (e(-0.1, 0, -0.016, 0.1, 0.035, 0.016, [0.08, 0.08, 0.085], F.METAL),
          e(-0.1, 0, -0.014, -0.04, 0.03, 0.06, [0.1, 0.09, 0.08]));
        break;
      case "revolver":
        (n(-0.02, 0.2, 0.025, 0, 0.012, [0.3, 0.3, 0.32]),
          n(-0.06, 0, 0.025, 0, 0.03, [0.3, 0.3, 0.32]),
          e(-0.14, 0, -0.016, -0.05, 0.03, 0.05, [0.35, 0.2, 0.1]));
        break;
      case "smg":
        (e(-0.18, 0, -0.022, 0.16, 0.06, 0.022, [0.07, 0.07, 0.075], F.METAL),
          e(-0.02, -0, -0.014, 0.02, 0.012, 0.11, [0.05, 0.05, 0.05], F.METAL),
          n(0.16, 0.26, 0.04, 0, 0.012, [0.1, 0.1, 0.1]));
        break;
      case "shotgun":
        (n(-0.35, 0.45, 0.04, 0, 0.018, [0.12, 0.12, 0.13], F.METAL, 6),
          e(-0.6, 0, -0.03, -0.3, 0.07, 0.03, [0.35, 0.2, 0.1]),
          e(0, 0, -0.025, 0.25, 0.05, 0.025, [0.3, 0.18, 0.09]));
        break;
      case "rifle":
        (e(-0.55, 0, -0.025, -0.25, 0.07, 0.025, [0.08, 0.08, 0.08]),
          e(-0.25, 0.01, -0.026, 0.15, 0.075, 0.026, [0.1, 0.1, 0.1], F.METAL),
          n(0.15, 0.5, 0.05, 0, 0.012, [0.08, 0.08, 0.08]),
          e(-0.05, -0, -0.016, 0, 0.01, 0.1, [0.08, 0.08, 0.08], F.METAL));
        break;
      case "launcher":
        (n(-0.1, 0.3, 0.06, 0, 0.04, [0.18, 0.2, 0.14], F.METAL, 10),
          e(-0.4, 0, -0.025, -0.1, 0.07, 0.025, [0.15, 0.16, 0.12]));
        break;
      case "ammo_9mm":
      case "ammo_357":
      case "ammo_12g":
      case "ammo_556":
      case "ammo_40mm": {
        let r = {
          ammo_9mm: [0.25, 0.3, 0.18],
          ammo_357: [0.4, 0.32, 0.12],
          ammo_12g: [0.5, 0.12, 0.08],
          ammo_556: [0.2, 0.24, 0.16],
          ammo_40mm: [0.3, 0.32, 0.1],
        }[s];
        (e(-0.07, 0, -0.045, 0.07, 0.06, 0.045, r),
          e(-0.065, 0.06, -0.04, 0.065, 0.062, 0.04, [0.8, 0.7, 0.3]));
        break;
      }
      case "bandage":
        t.cylH(
          "z",
          -0.05,
          0.05,
          0.035,
          0,
          0.035,
          F.FABRIC,
          0,
          [0.85, 0.83, 0.78],
          10,
        );
        break;
      case "medkit":
        (e(-0.13, 0, -0.08, 0.13, 0.1, 0.08, [0.75, 0.1, 0.08]),
          e(-0.015, 0.1, -0.05, 0.015, 0.102, 0.05, [0.95, 0.95, 0.95]),
          e(-0.05, 0.1, -0.015, 0.05, 0.102, 0.015, [0.95, 0.95, 0.95]),
          e(-0.04, 0.1, -0.012, 0.04, 0.13, 0.012, [0.2, 0.2, 0.2]));
        break;
      case "painkiller":
        (i(0, 0, 0.03, 0, 0.1, [0.85, 0.6, 0.2]),
          i(0, 0, 0.032, 0.1, 0.125, [0.95, 0.95, 0.95]));
        break;
      case "water":
        (i(0, 0, 0.035, 0, 0.22, [0.75, 0.82, 0.85]),
          i(0, 0, 0.036, 0.07, 0.15, [0.85, 0.75, 0.45]),
          i(0, 0, 0.015, 0.22, 0.25, [0.9, 0.9, 0.9], F.PROP, 6));
        break;
      case "energy":
        (i(0, 0, 0.033, 0, 0.16, [0.1, 0.55, 0.25], F.METAL),
          i(0, 0, 0.034, 0.05, 0.11, [0.85, 0.9, 0.2], F.METAL));
        break;
      case "adren":
        (n(-0.08, 0.06, 0.02, 0, 0.012, [0.85, 0.85, 0.8], F.GLASS),
          n(-0.06, 0.04, 0.02, 0, 0.0125, [0.9, 0.2, 0.15], F.EMIS, 6),
          n(0.06, 0.11, 0.02, 0, 0.002, [0.8, 0.8, 0.8]));
        break;
      case "gas":
        (i(0, 0, 0.045, 0, 0.2, [0.85, 0.85, 0.82], F.METAL, 12),
          i(0, 0, 0.046, 0.08, 0.13, [0.15, 0.55, 0.45], F.METAL, 12),
          i(0, 0, 0.015, 0.2, 0.24, [0.2, 0.2, 0.2], F.METAL, 6));
        break;
      case "bomb":
        (n(-0.1, 0.1, 0.035, 0, 0.034, [0.3, 0.31, 0.3]),
          n(-0.12, -0.1, 0.035, 0, 0.042, [0.4, 0.4, 0.38]),
          n(0.1, 0.12, 0.035, 0, 0.042, [0.4, 0.4, 0.38]),
          e(-0.03, 0.065, -0.004, 0.03, 0.075, 0.004, [0.1, 0.4, 0.1]));
        break;
      case "flash":
        (i(0, 0, 0.028, 0, 0.12, [0.25, 0.27, 0.28], F.METAL),
          i(0, 0, 0.012, 0.12, 0.15, [0.5, 0.5, 0.5], F.METAL, 6));
        break;
      case "flare":
        (n(-0.12, 0.12, 0.02, 0, 0.016, [0.75, 0.08, 0.06], F.PROP, 8),
          n(0.12, 0.14, 0.02, 0, 0.018, [0.12, 0.12, 0.12], F.PROP, 8));
        break;
      case "buzzer":
        (e(-0.035, 0, -0.05, 0.035, 0.03, 0.05, [0.85, 0.8, 0.2]),
          e(-0.012, 0.03, -0.012, 0.012, 0.038, 0.012, [1, 0.1, 0.05], F.EMIS));
        break;
      case "gasbig":
        (i(0, 0, 0.09, 0, 0.5, [0.8, 0.82, 0.8], F.METAL, 14),
          i(0, 0, 0.091, 0.2, 0.3, [0.15, 0.55, 0.45], F.METAL, 14),
          i(0, 0, 0.03, 0.5, 0.56, [0.2, 0.2, 0.2], F.METAL, 8),
          e(-0.05, 0.56, -0.012, 0.05, 0.58, 0.012, [0.7, 0.1, 0.05], F.METAL));
        break;
      case "filter":
        (t.cylH(
          "z",
          -0.03,
          0.03,
          0.05,
          0,
          0.05,
          F.PROP,
          0,
          [0.1, 0.1, 0.1],
          12,
        ),
          t.cylH(
            "z",
            0.03,
            0.04,
            0.05,
            0,
            0.035,
            F.METAL,
            0,
            [0.5, 0.5, 0.5],
            10,
          ));
        break;
      case "stim":
        (n(-0.07, 0.07, 0.02, 0, 0.013, [0.9, 0.9, 0.88], F.GLASS),
          n(-0.05, 0.05, 0.02, 0, 0.0135, [0.2, 0.8, 0.3], F.EMIS, 6),
          n(0.07, 0.12, 0.02, 0, 0.002, [0.8, 0.8, 0.8]),
          e(-0.1, 0.008, -0.014, -0.07, 0.032, 0.014, [0.2, 0.2, 0.2]));
        break;
      case "vest": {
        (e(-0.22, 0, -0.16, 0.22, 0.07, 0.16, [0.12, 0.13, 0.1], F.FABRIC),
          e(-0.18, 0.07, -0.12, 0.18, 0.09, 0.12, [0.1, 0.11, 0.08], F.FABRIC));
        for (let o of [-0.08, 0, 0.08])
          e(
            -0.2,
            0.09,
            o - 0.015,
            0.2,
            0.1,
            o + 0.015,
            [0.05, 0.05, 0.05],
            F.FABRIC,
          );
        break;
      }
      case "revive":
        (e(-0.11, 0, -0.07, 0.11, 0.09, 0.07, [0.9, 0.9, 0.88]),
          e(-0.11, 0.035, -0.071, 0.11, 0.055, 0.071, [0.1, 0.65, 0.3]),
          e(-0.012, 0.09, -0.04, 0.012, 0.092, 0.04, [0.1, 0.65, 0.3]),
          e(-0.04, 0.09, -0.012, 0.04, 0.092, 0.012, [0.1, 0.65, 0.3]));
        break;
      case "crate": {
        (e(-0.4, 0, -0.28, 0.4, 0.42, 0.28, [0.16, 0.2, 0.13], F.METAL),
          e(-0.41, 0.36, -0.29, 0.41, 0.44, 0.29, [0.13, 0.16, 0.1], F.METAL));
        for (let o of [-0.25, 0.25])
          e(
            o - 0.03,
            0.2,
            -0.295,
            o + 0.03,
            0.3,
            -0.28,
            [0.6, 0.6, 0.6],
            F.METAL,
          );
        e(-0.12, 0.12, -0.282, 0.12, 0.22, -0.28, [0.8, 0.7, 0.1], F.PROP);
        break;
      }
      case "safe": {
        (e(-0.35, 0, -0.32, 0.35, 0.8, 0.32, [0.22, 0.23, 0.24], F.METAL),
          e(-0.3, 0.05, -0.33, 0.3, 0.75, -0.32, [0.27, 0.28, 0.29], F.METAL),
          t.cylH(
            "z",
            -0.345,
            -0.33,
            0.45,
            0.12,
            0.06,
            F.METAL,
            0,
            [0.6, 0.55, 0.3],
            12,
          ),
          e(0.1, 0.38, -0.35, 0.22, 0.42, -0.33, [0.6, 0.55, 0.3], F.METAL));
        break;
      }
      default:
        e(-0.05, 0, -0.05, 0.05, 0.1, 0.05, [1, 0, 1]);
    }
    return t.build();
  }
  function Sc(s, t, e, n) {
    let i = [],
      r = [],
      o = 0;
    for (let c = 0; c < s.N; c++) {
      if (!s.reach[c] || s.floor[c] === 1 || s.feat[c] !== 0) continue;
      let l = n(c);
      l <= 0 || (i.push(c), (o += l), r.push(o));
    }
    let a = [];
    for (let c = 0; c < e && i.length; c++) {
      let l = t.next() * o,
        h = 0,
        u = r.length - 1;
      for (; h < u; ) {
        let f = (h + u) >> 1;
        r[f] < l ? (h = f + 1) : (u = f);
      }
      a.push(i[h]);
    }
    return a;
  }
  function Y1(s) {
    return [
      ["pipe", 3],
      ["crowbar", 3],
      ["machete", 2],
      ["knife", 2],
      ["axe", 1 + s * 0.3],
      ["hammer", 0.6 + s * 0.3],
      ["pistol", 2.4],
      ["revolver", 0.4 + s * 0.3],
      ["smg", s >= 2 ? 0.8 + s * 0.3 : 0.3],
      ["shotgun", 0.8 + s * 0.35],
      ["rifle", s >= 3 ? 0.4 + (s - 3) * 0.35 : 0.05],
      ["launcher", s >= 4 ? 0.3 : 0.02],
      ["vest", 0.6 + s * 0.2],
    ];
  }
  function $1(s) {
    return [
      ["bandage", 6],
      ["medkit", 2.5],
      ["painkiller", 3],
      ["water", 4],
      ["energy", 3],
      ["adren", 1.6],
      ["stim", 1.2],
      ["filter", 1.4 + s * 0.3],
      ["gas", 2.2 + s * 0.25],
      ["gasbig", 0.3 + s * 0.12],
      ["bomb", 2.4],
      ["flash", 2],
      ["flare", 2.2],
      ["buzzer", 1.4],
      ["revive", 0.45 + s * 0.08],
    ];
  }
  function s_(s) {
    return [
      ["ammo_9mm", 5],
      ["ammo_357", 1.5],
      ["ammo_12g", 2.5],
      ["ammo_556", s >= 3 ? 2 : 0.4],
      ["ammo_40mm", s >= 4 ? 0.8 : 0.1],
    ];
  }
  function Cd(s, t, e) {
    let n = [],
      i = e ? 7 + s.int(0, 3) : 2 + s.int(0, 2);
    for (let r = 0; r < i; r++) {
      let o = s.next();
      e && o < 0.35
        ? n.push({
            type: "cash",
            value:
              Math.round(
                ([4e3, 9e3, 16e3, 26e3, 4e4][t - 1] * s.range(0.8, 2)) / 100,
              ) * 100,
          })
        : o < (e ? 0.55 : 0.25)
          ? n.push({ type: s.weighted(Y1(t + (e ? 2 : 0))) })
          : o < (e ? 0.7 : 0.5)
            ? n.push({ type: s.weighted(s_(t)) })
            : n.push({ type: s.weighted($1(t)) });
    }
    return (
      e &&
        (n.push({
          type: "gold",
          value:
            Math.round(
              ([1e4, 2e4, 34e3, 52e3, 8e4][t - 1] * s.range(0.9, 1.4)) / 1e3,
            ) * 1e3,
        }),
        n.push({ type: "revive" })),
      n
    );
  }
  function mA(s, t) {
    let e = s.map,
      n = Math.min(5,s.depth),
      i = new Ci(t),
      r = [],
      o = e.distFromStart,
      a = 1;
    for (let v = 0; v < e.N; v++) o[v] > a && (a = o[v]);
    let c = (v) => {
        let y = v % e.W,
          _ = (v / e.W) | 0,
          M = 0;
        for (let b = 0; b < 4; b++) e.passable(y, _, b) && M++;
        return M;
      },
      l = new Set();
    for (let v of e.zones)
      if (v.vaultCells) for (let y of v.vaultCells) l.add(y);
    let h = (v, y, _ = {}) => {
        let M = y % e.W,
          b = (y / e.W) | 0,
          w = _.spread ?? 1.1,
          S = (M + 0.5) * 4 + i.range(-w, w),
          T = (b + 0.5) * 4 + i.range(-w, w),
          E = {
            id: r.length,
            type: v,
            x: S,
            z: T,
            rot: i.range(0, Math.PI * 2),
            taken: !1,
            ..._,
          };
        return (
          delete E.spread,
          e.floor[y] === 2 && (E.y = -2.18),
          e.floor[y] === 7 && (E.y = -1.08),
          r.push(E),
          E
        );
      },
      u = (v) => {
        let y = 1,
          _ = e.zone[v];
        return (
          _ === 1 ? (y *= 2.8) : _ === 2 && (y *= 6),
          l.has(v) && (y *= 3),
          e.floor[v] === 6 && (y *= 4),
          c(v) === 1 && (y *= 2.5),
          (y *= 0.55 + (o[v] > 0 ? o[v] / a : 0) * 1.5),
          o[v] >= 0 && o[v] < 4 && (y *= 0.25),
          y
        );
      },
      f = [1500, 4e3, 8e3, 14e3, 24e3][n - 1],
      d = 120 + n * 20;
    for (let v of Sc(e, i, d, u)) {
      let y = e.zone[v] === 1 ? 1.8 : e.zone[v] === 2 ? 2.4 : 1,
        _ = Math.round((f * i.range(0.4, 1.6) * y) / 100) * 100;
      h("cash", v, { value: _ });
    }
    if (n >= 2)
      for (let v of Sc(
        e,
        i,
        2 + n * 2,
        (y) => u(y) * (e.zone[y] !== 0 ? 3 : 0.3),
      ))
        h("gold", v, { value: Math.round((f * i.range(4, 8)) / 1e3) * 1e3 });
    if (e.relicSpots)
      for (let v of e.relicSpots)
        h("relic", v, { value: Math.round(i.range(150, 300)) * 1e3 });
    let p = 9 + n * 2,
      g = 14 + n * 4,
      m = 44 + n * 8;
    for (let v of Sc(e, i, p, u)) h(i.weighted(Y1(n)), v);
    for (let v of Sc(e, i, g, u)) h(i.weighted(s_(n)), v);
    for (let v of Sc(e, i, m, u)) h(i.weighted($1(n)), v);
    let x = 7 + n * 2;
    for (let v of Sc(
      e,
      i,
      x,
      (y) => (e.zone[y] === 2 ? 0.4 : 1) * (e.floor[y] === 0 ? 1 : 0) * u(y),
    ))
      h("crate", v, { spread: 0.8, contents: Cd(i, n, !1) });
    for (let v of e.zones) {
      if (!v.vaultCells || !v.vaultCells.length) continue;
      let y = v.vaultCells;
      h("safe", y[0], { spread: 0.6, contents: Cd(i, n, !0) });
      for (let _ = 0; _ < 10; _++) {
        let M = y[_ % y.length],
          b = Math.round((f * i.range(1.5, 3.5)) / 100) * 100;
        h("cash", M, { value: b, spread: 1.5 });
      }
      for (let _ = 0; _ < 3; _++)
        h(i.weighted(Y1(n + 2)), y[_ % y.length], { spread: 1.5 });
      for (let _ = 0; _ < 4; _++)
        h(i.weighted($1(n)), y[_ % y.length], { spread: 1.5 });
    }
    if (n === 1) {
      let v = e.stairs.find((y) => y.kind === "elev");
      if (v) {
        let y = v.cx + ge[v.dir] * 2,
          _ = v.cy + xe[v.dir] * 2;
        if (e.inb(y, _)) {
          let M = e.ci(y, _);
          (h("pipe", M, { spread: 0.9 }),
            h("bandage", M, { spread: 1.2 }),
            h("energy", M, { spread: 1.2 }));
        }
      }
    }
    s.items = r;
  }
  var Rd = class {
    constructor(t) {
      ((this.game = t),
        (this.geos = {}),
        (this.mat = On(t.shared, { vcol: !0, rough: 0.55, rim: 0.35 })),
        (this.group = new We()),
        t.scene.add(this.group),
        (this.meshes = new Map()),
        (this.inv = null),
        (this.pouchEl = document.getElementById("pouch")),
        (this.weaponBtn = document.getElementById("btn-weapon")),
        (this.prompt = null),
        (this.use = null),
        (this.fullWarned = new WeakSet()));
    }
    geo(t) {
      return this.geos[t] || (this.geos[t] = Ad.includes(t) ? t_(t) : bh(t));
    }
    pouchSize() {
      return this.game.loadout ? this.game.loadout.pouchSize : 8;
    }
    onNewRun() {
      this.inv = {
        weapons: [null, null],
        wsel: -1,
        ammo: { "9mm": 0, 357: 0, "12g": 0, 556: 0, "40mm": 0 },
        pouch: new Array(this.pouchSize()).fill(null),
      };
      let t = this.game.loadout;
      if (t) {
        t.weapons.forEach((e, n) => {
          e && (this.inv.weapons[n] = { type: e });
        });
        for (let e in t.ammo || {}) this.inv.ammo[e] += t.ammo[e];
        for (let [e, n] of t.items || []) this.addConsumable(e, n, !0);
        this.inv.weapons[0] && (this.inv.wsel = 0);
      }
      ((this.use = null),
        this.buildPouchUI(),
        this.renderAll(),
        this.game.combat && this.game.combat.onEquip(this.equipped()));
    }
    onFloorGenerated(t) {
      mA(t, t.map.seed + 555);
    }
    warmup() {
      let t = new te(this.geo("cash"), this.mat);
      return (t.position.set(0, 0, -2), t);
    }
    onFloorEnter(t) {
      (this.clearMeshes(), (this.fs = t));
    }
    onFloorExit() {
      this.clearMeshes();
    }
    clearMeshes() {
      for (let t of this.meshes.values()) this.group.remove(t);
      this.meshes.clear();
    }
    dropItem(t, e, n, i = {}) {
      let r = this.fs,
        o = {
          id: i.id ?? 1e5 + r.items.length,
          type: t,
          x: e,
          z: n,
          rot: i.rot ?? Math.random() * 6.28,
          taken: !1,
          dropped: !0,
          ...i,
        };
      return (delete o.pending, r.items.push(o), o);
    }
    equipped() {
      let t = this.inv;
      return !t || t.wsel < 0 || !t.weapons[t.wsel] ? null : t.weapons[t.wsel];
    }
    def() {
      let t = this.equipped();
      return t ? be[t.type] : e_;
    }
    cycleWeapon() {
      let t = this.inv,
        e = t.wsel;
      for (
        let n = 0;
        n < 3 && ((e = e + 1), e > 1 && (e = -1), !(e === -1 || t.weapons[e]));
        n++
      );
      e !== t.wsel &&
        ((t.wsel = e),
        this.renderAll(),
        this.game.combat && this.game.combat.onEquip(this.equipped()),
        this.game.audio &&
          this.game.audio.sfx("rack", { vol: 0.35, rate: 1.4 }));
    }
    addConsumable(t, e = 1, n) {
      let i = be[t],
        r = this.inv.pouch,
        o = e;
      for (let a = 0; a < r.length && o > 0; a++) {
        let c = r[a];
        if (c && c.type === t && c.count < i.stack) {
          let l = Math.min(o, i.stack - c.count);
          ((c.count += l), (o -= l));
        }
      }
      for (let a = 0; a < r.length && o > 0; a++)
        if (!r[a]) {
          let c = Math.min(o, i.stack);
          ((r[a] = { type: t, count: c }), (o -= c));
        }
      return (n || this.renderPouch(), e - o);
    }
    countOf(t) {
      let e = 0;
      for (let n of this.inv.pouch) n && n.type === t && (e += n.count);
      return e;
    }
    takeOne(t) {
      let e = this.inv.pouch;
      for (let n = e.length - 1; n >= 0; n--)
        if (e[n] && e[n].type === t)
          return (
            e[n].count--,
            e[n].count <= 0 && (e[n] = null),
            this.renderPouch(),
            !0
          );
      return !1;
    }
    update(t) {
      let e = this.game,
        n = e.player,
        i = this.fs;
      if (!i || !this.inv) return;
      let r = n.pos.x,
        o = n.pos.z;
      this.prompt = null;
      let a = null,
        c = 1e9;
      for (let h of i.items) {
        if (h.taken) continue;
        let u = h.x - r,
          f = h.z - o,
          d = u * u + f * f,
          p = this.meshes.get(h);
        d < 2025
          ? (p ||
              ((p = new te(this.geo(h.type), this.mat)),
              p.position.set(h.x, h.y ?? 0.01, h.z),
              (p.rotation.y = h.rot),
              (p.matrixAutoUpdate = !1),
              p.updateMatrix(),
              this.group.add(p),
              this.meshes.set(h, p)),
            h.type === "relic" &&
              ((p.position.y = 0.05 + Math.sin(e.time * 2) * 0.03),
              (p.rotation.y += t),
              p.updateMatrix()))
          : p && (this.group.remove(p), this.meshes.delete(h));
        let g = be[h.type].kind === "crate" ? 1.6 : 1.25;
        d < g * g &&
          Math.abs(n.pos.y - (h.y ?? 0)) < 1.4 &&
          !n.dead &&
          !this.tryAuto(h) &&
          d < c &&
          ((c = d), (a = h));
      }
      if (a) {
        let h = be[a.type];
        if (h.kind === "crate")
          this.prompt = {
            type: "crate",
            label: `${h.name}を開ける`,
            run: () => this.openCrate(a),
          };
        else if (n_(a.type)) {
          let u = this.equipped();
          this.prompt = {
            type: "pick",
            label: u
              ? `${be[u.type].name}と${h.name}を交換`
              : `${h.name}を持つ`,
            run: () => this.swapPick(a),
          };
        } else
          h.kind === "armor" &&
            (this.prompt = {
              type: "pick",
              label: `${h.name}に着替える`,
              run: () => {
                let u = a;
                this.game.claimItem(u, () => {
                  let f = this.game.player;
                  (f.armor &&
                    this.game.dropItemNet(f.armor.type, f.pos.x, f.pos.z, {
                      dura: f.armor.dura,
                      dropped: !0,
                    }),
                    (f.armor = {
                      type: u.type,
                      armor: h.armor,
                      dura: u.dura ?? h.dura,
                      max: h.dura,
                    }),
                    this.game.feed(`${h.name}を着た`, "#a8d8ff"));
                });
              },
            });
      }
      let l = e.input;
      for (let h = 0; h < 12; h++)
        (l.take("slot" + h) &&
          (this.useSlot(h),
          document.body.classList.contains("bag-open") &&
            h >= 4 &&
            this.setBag(!1)),
          l.take("drop" + h) && this.dropSlot(h));
      if (
        (l.take("cycle") && this.cycleWeapon(),
        l.take("bag") &&
          this.setBag(!document.body.classList.contains("bag-open")),
        this.bagOpenT > 0 &&
          ((this.bagOpenT -= t), this.bagOpenT <= 0 && this.setBag(!1)),
        document.body.classList.toggle(
          "reloading",
          !!(e.combat && e.combat.reload),
        ),
        this.use)
      ) {
        let h = this.use;
        h.t += t;
        let u = document.getElementById("use-ring");
        (u && u.style.setProperty("--p", Math.min(1, h.t / h.dur)),
          n.dead ? this.cancelUse() : h.t >= h.dur && this.finishUse());
      }
    }
    contextAction() {
      return this.prompt;
    }
    tryAuto(t) {
      if (t.pending) return !0;
      let e = be[t.type],
        n = this.game,
        i = this.inv,
        r = n.player;
      if (e.kind === "crate") return !1;
      if (e.kind === "money")
        return (
          n.claimItem(t, () => {
            ((n.run.money += Math.round(t.value * (r.stats.moneyMul || 1))),
              e.relic && n.run.relics++,
              n.feed(`${e.name} +\xA5${t.value.toLocaleString()}`, "#d8c068"),
              n.audio && n.audio.sfx("money", { vol: 0.6 }));
          }),
          !0
        );
      if (e.kind === "ammo")
        return (
          n.claimItem(t, () => {
            ((i.ammo[e.ammo] += e.amount),
              n.feed(`${e.name} +${e.amount}`),
              n.audio && n.audio.sfx("pickup", { vol: 0.6 }),
              this.renderAll());
          }),
          !0
        );
      if (e.kind === "armor") {
        let o = r.armor;
        return o && o.dura >= e.dura * 0.8
          ? !1
          : (n.claimItem(t, () => {
              ((r.armor = {
                type: t.type,
                armor: e.armor,
                dura: t.dura ?? e.dura,
                max: e.dura,
              }),
                n.feed(`${e.name}を着た`, "#a8d8ff"),
                n.audio && n.audio.sfx("pickup", { vol: 0.7, rate: 0.8 }));
            }),
            !0);
      }
      if (e.stack)
        return i.pouch.some(
          (a) => !a || (a.type === t.type && a.count < e.stack),
        )
          ? (n.claimItem(t, () => {
              let a = t.count || 1,
                c = this.addConsumable(t.type, a);
              (c < a &&
                n.dropItemNet(t.type, r.pos.x, r.pos.z, {
                  count: a - c,
                  dropped: !0,
                }),
                n.feed(`${e.name} を拾った`),
                n.audio && n.audio.sfx("pickup", { vol: 0.7 }));
            }),
            !0)
          : (this.fullWarned.has(t) ||
              (this.fullWarned.add(t),
              n.toast(
                "持ち物がいっぱいだ",
                1100,
              )),
            !1);
      if (n_(t.type)) {
        if (i.weapons.findIndex((c) => c && c.type === t.type) >= 0)
          return e.ammo && !t.dropped
            ? (n.claimItem(t, () => {
                let c = Math.ceil(e.give / 2);
                ((i.ammo[e.ammo] += c),
                  n.feed(
                    `${e.ammo === "40mm" ? "榴弾" : "弾"} +${c}`,
                  ),
                  n.audio && n.audio.sfx("pickup", { vol: 0.6 }),
                  this.renderAll());
              }),
              !0)
            : !1;
        let a = i.weapons.findIndex((c) => !c);
        return a >= 0
          ? (n.claimItem(t, () => {
              if (i.weapons[a]) {
                this.swapPickApply(t);
                return;
              }
              ((i.weapons[a] = { type: t.type, mag: t.mag }),
                e.ammo && !t.dropped && (i.ammo[e.ammo] += e.give),
                n.feed(`${e.name} を拾った`),
                n.audio && n.audio.sfx("pickup", { vol: 0.7 }),
                i.wsel === -1 &&
                  ((i.wsel = a), n.combat && n.combat.onEquip(this.equipped())),
                this.renderAll());
            }),
            !0)
          : !1;
      }
      return !1;
    }
    swapPick(t) {
      t.pending || this.game.claimItem(t, () => this.swapPickApply(t));
    }
    swapPickApply(t) {
      let e = this.game,
        n = this.inv,
        i = e.player,
        r = n.wsel >= 0 ? n.wsel : n.weapons[0] ? 0 : -1;
      r < 0 && (r = 0);
      let o = n.weapons[r];
      if (o) {
        let c = be[o.type];
        e.dropItemNet(
          o.type,
          i.pos.x - Math.sin(i.yaw) * 0.5,
          i.pos.z - Math.cos(i.yaw) * 0.5,
          { dropped: !0, mag: o.mag || 0 },
        );
      }
      n.weapons[r] = { type: t.type, mag: t.mag };
      let a = be[t.type];
      (a.ammo && !t.dropped && (n.ammo[a.ammo] += a.give),
        (n.wsel = r),
        this.renderAll(),
        e.combat && e.combat.onEquip(this.equipped()),
        e.audio && e.audio.sfx("pickup", { vol: 0.7 }));
    }
    openCrate(t) {
      let e = this.game;
      t.pending ||
        e.claimItem(t, () => {
          (e.audio && e.audio.sfx("door", { vol: 0.5, rate: 2.4, pos: t }),
            e.audio && e.audio.sfx("pickup", { vol: 0.6, rate: 0.8 }));
          let n = t.contents || [];
          (n.forEach((i, r) => {
            let o = (r / Math.max(1, n.length)) * Math.PI * 2 + t.rot,
              a = 0.55 + (r % 2) * 0.35;
            e.dropItemNet(
              i.type,
              t.x + Math.cos(o) * a,
              t.z + Math.sin(o) * a,
              { value: i.value, fromCrate: !0 },
            );
          }),
            e.feed(`${be[t.type].name}を開けた`, "#d8c068"));
        });
    }
    removeMesh(t) {
      let e = this.meshes.get(t);
      e && (this.group.remove(e), this.meshes.delete(t));
    }
    useSlot(t) {
      let e = this.game,
        n = e.player,
        i = this.inv.pouch[t];
      if (!i || n.dead) return;
      if (this.use) {
        this.use.k === t && this.cancelUse();
        return;
      }
      let r = be[i.type];
      if (r.kind === "throw") {
        e.combat && e.combat.throwItem(i.type) && this.consumeSlot(t);
        return;
      }
      if (r.kind === "deploy") {
        e.combat && e.combat.deployGas(i.type) && this.consumeSlot(t);
        return;
      }
      if (r.revive) {
        let o = e.reviveTarget ? e.reviveTarget() : null;
        if (!o) {
          e.toast(
            e.isMulti && e.isMulti()
              ? "倒れた仲間の近くで使う（自分が倒れた時にも自動で使われる）"
              : "持っていれば、倒れた時に自動で使われる",
            2200,
          );
          return;
        }
        this.use = { k: t, type: i.type, t: 0, dur: r.useTime, target: o };
      } else {
        if ((r.heal || r.hot) && !r.drink && n.hp >= n.maxHp - 0.5) {
          e.toast("体力は満タンだ", 900);
          return;
        }
        if (
          r.stamina &&
          !r.heal &&
          n.stamina >= n.stats.maxStamina - 1 &&
          !r.drink
        ) {
          e.toast(
            "スタミナは満タンだ",
            900,
          );
          return;
        }
        if (n.inDuct && (r.useTime || 0) > 1.2) {
          e.toast("狭くて使えない", 900);
          return;
        }
        this.use = { k: t, type: i.type, t: 0, dur: r.useTime };
      }
      (this.renderPouch(),
        e.combat && e.combat.startUseAnim(i.type, r.useTime),
        i.type === "water" || i.type === "energy" || i.type === "painkiller"
          ? e.audio && e.audio.sfx("drink", { vol: 0.6 })
          : e.audio && e.audio.sfx("pickup", { vol: 0.4, rate: 0.7 }));
    }
    setBag(t) {
      (document.body.classList.toggle("bag-open", t),
        (this.bagOpenT = t ? 6 : 0));
    }
    dropSlot(t) {
      let e = this.game,
        n = e.player,
        i = this.inv.pouch[t];
      !i ||
        n.dead ||
        (this.use && this.use.k === t && this.cancelUse(),
        (this.inv.pouch[t] = null),
        e.dropItemNet(
          i.type,
          n.pos.x - Math.sin(n.yaw) * 0.7,
          n.pos.z - Math.cos(n.yaw) * 0.7,
          { count: i.count, dropped: !0 },
        ),
        e.feed(`${be[i.type].name}\xD7${i.count} を置いた`),
        this.renderPouch());
    }
    cancelUse() {
      ((this.use = null),
        this.renderPouch(),
        this.game.combat && this.game.combat.cancelUseAnim());
    }
    finishUse() {
      let t = this.game,
        e = t.player,
        n = this.use;
      this.use = null;
      let i = this.inv.pouch[n.k];
      if (!i || i.type !== n.type) {
        this.renderPouch();
        return;
      }
      let r = be[n.type],
        o = e.buffs;
      (r.heal &&
        ((e.hp = Math.min(e.maxHp, e.hp + r.heal * (e.stats.healMul || 1))),
        t.feed(`体力 +${Math.round(r.heal * (e.stats.healMul || 1))}`, "#9fe0a0")),
        r.hot &&
          ((o.hot = r.hotTime),
          (o.hotRate = r.hot / r.hotTime),
          t.feed(
            "痛みが引いていく",
            "#9fe0a0",
          )),
        r.drink && (o.drink = r.drink),
        r.stamina &&
          ((e.stamina = e.stats.maxStamina),
          (e.exhausted = !1),
          t.feed("スタミナ全回復", "#a8d8ff")),
        r.adren &&
          ((o.adren = r.adren),
          t.feed("アドレナリン！", "#ffb080"),
          (t.fx.pulse = 0.5)),
        r.filter &&
          ((o.filter = r.filter),
          t.feed(
            "フィルター交換：瘴気を防ぐ",
            "#9fe0c0",
          )),
        r.revive && n.target && t.doRevive && t.doRevive(n.target),
        this.consumeSlot(n.k),
        t.combat && t.combat.finishUseAnim && t.combat.finishUseAnim());
    }
    consumeSlot(t) {
      let e = this.inv.pouch[t];
      e &&
        (e.count--,
        e.count <= 0 && (this.inv.pouch[t] = null),
        this.renderPouch());
    }
    buildPouchUI() {
      let t = this.pouchEl;
      if (!t) return;
      t.innerHTML = "";
      let e = this.inv.pouch.length;
      for (let n = 0; n < e; n++) {
        let i = document.createElement("button");
        ((i.className = "slot"),
          (i.type = "button"),
          (i.id = "slot" + n),
          i.setAttribute("aria-label", "持ち物" + (n + 1)),
          t.appendChild(i));
      }
      this.game.input &&
        this.game.input.bindSlots &&
        this.game.input.bindSlots(e);
    }
    renderAll() {
      (this.renderPouch(), this.renderWeapons());
    }
    renderPouch() {
      let t = this.inv;
      if (!t || !this.pouchEl) return;
      let e = t.pouch;
      for (let r = 0; r < e.length; r++) {
        let o = document.getElementById("slot" + r),
          a = e[r];
        o &&
          (o.classList.toggle("empty", !a),
          o.classList.toggle("using", !!(this.use && this.use.k === r)),
          (o.innerHTML = a
            ? (wc[a.type] || "") +
              `<span class="cnt">${a.count}</span>` +
              (this.use && this.use.k === r ? '<i id="use-ring"></i>' : "")
            : ""),
          a && o.setAttribute("aria-label", be[a.type].name + " " + a.count));
      }
      let n = e.slice(4).filter(Boolean).length,
        i = document.getElementById("bag-cnt");
      i && (i.textContent = n ? String(n) : "");
    }
    renderWeapons() {
      let t = this.inv;
      if (!t) return;
      let e = this.equipped(),
        n = e ? be[e.type] : e_,
        i = e ? n.kind : "fist",
        r = document.getElementById("atk-icon");
      r && (r.innerHTML = i_[i] || i_.melee);
      let o = document.getElementById("atk-lbl");
      o && (o.textContent = n.verb || "攻撃");
      let a = this.weaponBtn;
      if (a) {
        let c = e ? wc[e.type] : wc.fist,
          l = n.ammo
            ? `${e && e.mag !== void 0 ? e.mag : 0}<small>/${t.ammo[n.ammo]}</small>`
            : "",
          h = t.weapons.filter(Boolean).length;
        ((a.innerHTML =
          c +
          (l !== "" ? `<span class="cnt">${l}</span>` : "") +
          `<span class="wdots">${[-1, 0, 1]
            .filter((u) => u === -1 || t.weapons[u])
            .map((u) => `<i class="${u === t.wsel ? "on" : ""}"></i>`)
            .join("")}</span>`),
          a.classList.toggle("single", h === 0),
          a.setAttribute(
            "aria-label",
            "武器を持ち替える（今: " +
              n.name +
              "）",
          ));
      }
    }
    drawMap() {}
  };
  function K1(s) {
    let t = new Vt();
    return (
      t.setAttribute("position", new Kt(s.position, 3)),
      t.setAttribute("normal", new Kt(s.normal, 3)),
      t.setAttribute("color", new Kt(s.color, 3)),
      t.setAttribute("aMat", new Kt(s.aMat, 1)),
      s.skinIndex &&
        (t.setAttribute("skinIndex", new Kt(s.skinIndex, 4)),
        t.setAttribute("skinWeight", new Kt(s.skinWeight, 4))),
      t.setIndex(new Kt(s.index, 1)),
      t.computeBoundingSphere(),
      t.computeBoundingBox(),
      (t.userData.tris = s.tris),
      t
    );
  }
  var Vo = [0.04, 0.042, 0.048],
    gA = [0.74, 0.52, 0.07],
    xA = [0.2, 0.2, 0.21],
    Go = 22,
    vA = 23,
    yA = 21;
  function xs(s, t, e = [0.0102, 0.0096, 0.009, 0.0084]) {
    for (let n = 0; n < t.length - 1; n++)
      s.cap(t[n], t[n + 1], e[n], e[n + 1], {
        k: 0.004,
        region: Go,
        col: Vo,
        bump: [6e-4, 260],
      });
  }
  function Mh(s, t, e) {
    s.cap(t, e, 0.029, 0.036, { k: 0.012, region: Go, col: Vo });
  }
  var o_ = {
      grip(s) {
        s.box([0.016, -0.03, 0.036], [0.013, 0.04, 0.03], 0.012, {
          k: 0.012,
          region: Go,
          col: Vo,
          rot: [0.15, 0.25, 0],
        });
        let t = [0.008, -0.016, -0.038, -0.058];
        xs(s, [
          [0.02, 0.008, 0],
          [0.013, 0.012, -0.03],
          [0.005, 0.01, -0.037],
          [0, 0.005, -0.034],
        ]);
        for (let e = 1; e < 4; e++) {
          let n = t[e],
            i = 1 - e * 0.07;
          xs(
            s,
            [
              [0.021, n, 0],
              [0.007, n - 0.002, -0.03 * i],
              [-0.013, n - 0.004, -0.025 * i],
              [-0.02, n - 0.006, -0.007],
            ],
            [0.0105, 0.0098, 0.009 * i + 0.001, 0.0084 * i + 0.001],
          );
        }
        return (
          xs(
            s,
            [
              [-0.004, -0.04, 0.05],
              [-0.018, -0.014, 0.03],
              [-0.02, 0.006, 0.006],
              [-0.016, 0.016, -0.012],
            ],
            [0.014, 0.0115, 0.0102, 0.0092],
          ),
          Mh(s, [0.012, -0.05, 0.07], [0.016, -0.072, 0.16]),
          {
            sleeve: [
              [0.02, -0.078, 0.15],
              [0.15, -0.26, 0.52],
            ],
          }
        );
      },
      fist(s) {
        s.box([0.004, 0.004, 0.012], [0.017, 0.04, 0.03], 0.013, {
          k: 0.012,
          region: Go,
          col: Vo,
        });
        for (let t = 0; t < 4; t++) {
          let e = 0.03 - t * 0.019,
            n = 1 - t * 0.06;
          xs(
            s,
            [
              [0.008, e, -0.016],
              [0.004, e - 0.002, -0.046 * n],
              [-0.016, e - 0.002, -0.04 * n],
              [-0.019, e - 0.002, -0.018],
            ],
            [0.0108, 0.01, 0.0094 * n + 5e-4, 0.0088 * n + 5e-4],
          );
        }
        return (
          xs(
            s,
            [
              [-0.012, -0.012, 0.03],
              [-0.024, 0.008, 0.004],
              [-0.024, 0.02, -0.024],
              [-0.014, 0.018, -0.046],
            ],
            [0.0135, 0.0115, 0.0102, 0.0092],
          ),
          Mh(s, [0.006, -0.02, 0.05], [0.01, -0.035, 0.14]),
          {
            sleeve: [
              [0.012, -0.04, 0.13],
              [0.1, -0.2, 0.5],
            ],
          }
        );
      },
      support(s) {
        s.box([0, -0.012, 0.004], [0.022, 0.011, 0.034], 0.01, {
          k: 0.012,
          region: Go,
          col: Vo,
        });
        for (let t = 0; t < 4; t++) {
          let e = -0.028 + t * 0.019,
            n = 1 - t * 0.07;
          xs(s, [
            [0.02, -0.006, e],
            [0.034, 0.016 * n, e - 0.002],
            [0.031, 0.036 * n, e - 0.003],
            [0.02, 0.046 * n, e - 0.004],
          ]);
        }
        return (
          xs(
            s,
            [
              [-0.012, -0.012, 0.03],
              [-0.03, 0.006, 0.006],
              [-0.031, 0.028, -0.014],
              [-0.025, 0.044, -0.03],
            ],
            [0.0135, 0.0115, 0.0102, 0.0092],
          ),
          Mh(s, [-0.012, -0.022, 0.045], [-0.04, -0.045, 0.13]),
          {
            sleeve: [
              [-0.045, -0.05, 0.12],
              [-0.25, -0.2, 0.46],
            ],
          }
        );
      },
      sword(s) {
        s.box([0.03, -0.002, 0.018], [0.011, 0.028, 0.04], 0.01, {
          k: 0.012,
          region: Go,
          col: Vo,
        });
        for (let t = 0; t < 4; t++) {
          let e = -0.022 + t * 0.021,
            n = 1 - t * 0.05;
          xs(
            s,
            [
              [0.026, 0.012, e],
              [0.028, -0.017 * n, e],
              [0.004, -0.031 * n, e + 0.002],
              [-0.018 * n, -0.02 * n, e + 0.003],
              [-0.022 * n, -0.001, e + 0.004],
            ],
            [0.0105, 0.0098, 0.0092, 0.0086, 0.008],
          );
        }
        return (
          xs(
            s,
            [
              [0.026, 0.02, 0.05],
              [0.006, 0.03, 0.024],
              [-0.01, 0.029, -0.004],
              [-0.015, 0.021, -0.02],
            ],
            [0.0135, 0.0115, 0.0102, 0.0092],
          ),
          Mh(s, [0.032, -0.004, 0.065], [0.04, -0.02, 0.15]),
          {
            sleeve: [
              [0.045, -0.025, 0.14],
              [0.16, -0.2, 0.5],
            ],
          }
        );
      },
      hold(s) {
        s.box([0.024, -0.008, 0.036], [0.012, 0.036, 0.028], 0.012, {
          k: 0.012,
          region: Go,
          col: Vo,
          rot: [0, 0.35, 0],
        });
        for (let t = 0; t < 4; t++) {
          let e = 0.022 - t * 0.019,
            n = 1 - t * 0.06;
          xs(s, [
            [0.03, e, 0.006],
            [0.024, e, -0.03 * n],
            [-0.004, e, -0.043 * n],
            [-0.028 * n, e, -0.032 * n],
          ]);
        }
        return (
          xs(
            s,
            [
              [0, -0.03, 0.048],
              [-0.026, -0.008, 0.032],
              [-0.036, 0.012, 0.008],
              [-0.034, 0.024, -0.012],
            ],
            [0.0135, 0.0115, 0.0102, 0.0092],
          ),
          Mh(s, [0.02, -0.04, 0.07], [0.026, -0.065, 0.16]),
          {
            sleeve: [
              [0.03, -0.07, 0.15],
              [0.15, -0.24, 0.5],
            ],
          }
        );
      },
    },
    j1 = new Map();
  function _A(s, t) {
    let e = new En();
    return (
      e.cap(s, t, 0.046, 0.056, {
        k: 0.01,
        region: vA,
        col: gA,
        bump: [0.004, 26],
      }),
      e.cap(
        s,
        [
          s[0] + (t[0] - s[0]) * 0.07,
          s[1] + (t[1] - s[1]) * 0.07,
          s[2] + (t[2] - s[2]) * 0.07,
        ],
        0.049,
        0.05,
        { k: 0.004, region: yA, col: xA },
      ),
      K1(e.build({ voxel: 0.0065 }))
    );
  }
  function r_(s) {
    let t = s.clone(),
      e = t.attributes.position.array,
      n = t.attributes.normal.array;
    for (let r = 0; r < e.length; r += 3) ((e[r] = -e[r]), (n[r] = -n[r]));
    let i = t.index.array;
    for (let r = 0; r < i.length; r += 3) {
      let o = i[r + 1];
      ((i[r + 1] = i[r + 2]), (i[r + 2] = o));
    }
    return (t.computeBoundingSphere(), t);
  }
  function ar(s, t = 1) {
    let e = s + t;
    if (j1.has(e)) return j1.get(e);
    let n;
    if (t < 0 && s !== "support") {
      let i = ar(s, 1);
      n = { hand: r_(i.hand), sleeve: r_(i.sleeve) };
    } else {
      let i = new En(),
        r = o_[s](i);
      n = {
        hand: K1(i.build({ voxel: 0.0032 })),
        sleeve: _A(r.sleeve[0], r.sleeve[1]),
      };
    }
    return (j1.set(e, n), n);
  }
  var rP = Object.keys(o_);
  var Xe = {
      CRACK: 0,
      DENT: 1,
      HOLE: 2,
      BULLET: 3,
      SCORCH: 4,
      BLOOD: 5,
      BLOOD2: 6,
      DUST: 7,
    },
    pi = 256,
    Ac = 4,
    a_ = 2;
  function Tc(s) {
    let t = s >>> 0;
    return () => {
      t = (t + 1831565813) | 0;
      let e = Math.imul(t ^ (t >>> 15), 1 | t);
      return (
        (e = (e + Math.imul(e ^ (e >>> 7), 61 | e)) ^ e),
        ((e ^ (e >>> 14)) >>> 0) / 4294967296
      );
    };
  }
  function Ec(s, t, e, n, i, r, o, a, c) {
    (c &&
      (s.save(),
      s.translate(1.2, 1.2),
      Ec(s, t, e, n, i, r, o * 1.6, c),
      s.restore()),
      (s.strokeStyle = a),
      (s.lineCap = "round"),
      (s.lineJoin = "round"));
    for (let l = 0; l < i; l++) {
      let h = (l / i) * Math.PI * 2 + t() * 0.6,
        u = e,
        f = n,
        d = o;
      (s.beginPath(), s.moveTo(u, f));
      let p = r * (0.5 + t() * 0.6);
      for (let g = 0; g < 14; g++)
        if (
          ((h += (t() - 0.5) * 0.8),
          (u += (Math.cos(h) * p) / 14),
          (f += (Math.sin(h) * p) / 14),
          s.lineTo(u, f),
          t() < 0.18)
        ) {
          let m = u,
            x = f,
            v = h + (t() < 0.5 ? 0.8 : -0.8);
          s.moveTo(m, x);
          let y = m,
            _ = x;
          for (let M = 0; M < 5; M++)
            ((v += (t() - 0.5) * 0.7),
              (y += (Math.cos(v) * p) / 18),
              (_ += (Math.sin(v) * p) / 18),
              s.lineTo(y, _));
          s.moveTo(u, f);
        }
      ((s.lineWidth = d), s.stroke());
    }
  }
  function Ji(s, t, e, n, i, r, o) {
    s.beginPath();
    for (let a = 0; a <= r; a++) {
      let c = (a / r) * Math.PI * 2,
        l = i * (1 - o / 2 + t() * o),
        h = e + Math.cos(c) * l,
        u = n + Math.sin(c) * l;
      a === 0 ? s.moveTo(h, u) : s.lineTo(h, u);
    }
    s.closePath();
  }
  function bA() {
    let s = document.createElement("canvas");
    ((s.width = pi * Ac), (s.height = pi * a_));
    let t = s.getContext("2d");
    t.clearRect(0, 0, s.width, s.height);
    let e = (o, a) => {
        let c = (o % Ac) * pi,
          l = ((o / Ac) | 0) * pi;
        (t.save(),
          t.translate(c, l),
          t.beginPath(),
          t.rect(0, 0, pi, pi),
          t.clip(),
          a(Tc(1e3 + o * 77)),
          t.restore());
      },
      n = pi / 2;
    (e(Xe.CRACK, (o) => {
      let a = t.createRadialGradient(n, n, 2, n, n, 60);
      (a.addColorStop(0, "rgba(230,226,215,0.55)"),
        a.addColorStop(1, "rgba(230,226,215,0)"),
        (t.fillStyle = a),
        t.fillRect(0, 0, pi, pi),
        Ec(
          t,
          Tc(77),
          n,
          n,
          5,
          95,
          1.5,
          "rgba(32,25,17,0.72)",
          "rgba(236,230,212,0.28)",
        ),
        Ec(t, Tc(78), n, n, 4, 55, 0.9, "rgba(40,32,22,0.5)"));
    }),
      e(Xe.DENT, (o) => {
        (Ec(
          t,
          Tc(91),
          n,
          n,
          6,
          75,
          1.4,
          "rgba(30,24,16,0.7)",
          "rgba(236,230,212,0.25)",
        ),
          Ji(t, o, n, n, 46, 22, 0.55),
          (t.fillStyle = "rgba(214,208,194,0.98)"),
          t.fill(),
          Ji(t, o, n, n, 30, 18, 0.5),
          (t.fillStyle = "rgba(176,168,152,1)"),
          t.fill(),
          Ji(t, o, n + 3, n + 4, 16, 14, 0.6),
          (t.fillStyle = "rgba(92,86,76,1)"),
          t.fill());
        for (let a = 0; a < 60; a++) {
          t.fillStyle = `rgba(${150 + o() * 80},${145 + o() * 80},${130 + o() * 70},${0.4 + o() * 0.5})`;
          let c = o() * 6.28,
            l = 30 + o() * 30;
          t.fillRect(
            n + Math.cos(c) * l,
            n + Math.sin(c) * l,
            1 + o() * 3,
            1 + o() * 3,
          );
        }
      }),
      e(Xe.HOLE, (o) => {
        (Ec(
          t,
          Tc(93),
          n,
          n,
          8,
          100,
          1.7,
          "rgba(26,20,14,0.75)",
          "rgba(236,230,212,0.25)",
        ),
          Ji(t, o, n, n, 70, 26, 0.45),
          (t.fillStyle = "rgba(210,204,190,1)"),
          t.fill(),
          Ji(t, o, n, n, 56, 24, 0.5),
          (t.fillStyle = "rgba(150,142,128,1)"),
          t.fill(),
          Ji(t, o, n, n, 46, 22, 0.55),
          (t.fillStyle = "rgba(14,12,10,1)"),
          t.fill(),
          (t.fillStyle = "rgba(70,52,32,1)"),
          t.fillRect(n - 34 + o() * 20, n - 60, 18, 120),
          Ji(t, o, n, n, 46, 22, 0.3),
          (t.globalCompositeOperation = "destination-in"),
          t.fill(),
          (t.globalCompositeOperation = "source-over"),
          (t.lineWidth = 6),
          (t.strokeStyle = "rgba(200,194,180,1)"),
          Ji(t, o, n, n, 50, 24, 0.5),
          t.stroke());
        for (let a = 0; a < 7; a++) {
          let c = o() * 6.28;
          (t.save(),
            t.translate(n + Math.cos(c) * 58, n + Math.sin(c) * 58),
            t.rotate(c),
            (t.fillStyle = "rgba(190,180,150,0.95)"),
            t.beginPath(),
            t.moveTo(0, -8),
            t.lineTo(18 + o() * 14, 0),
            t.lineTo(0, 8),
            t.fill(),
            t.restore());
        }
      }),
      e(Xe.BULLET, (o) => {
        (Ec(t, Tc(95), n, n, 5, 34, 1, "rgba(25,20,14,0.6)"),
          Ji(t, o, n, n, 20, 14, 0.5),
          (t.fillStyle = "rgba(215,210,198,0.95)"),
          t.fill(),
          Ji(t, o, n, n, 10, 12, 0.4),
          (t.fillStyle = "rgba(10,9,8,1)"),
          t.fill());
      }),
      e(Xe.SCORCH, (o) => {
        for (let c = 0; c < 40; c++) {
          let l = o() * 6.28,
            h = o() * 70,
            u = 20 + o() * 50,
            f = t.createRadialGradient(
              n + Math.cos(l) * h,
              n + Math.sin(l) * h,
              0,
              n + Math.cos(l) * h,
              n + Math.sin(l) * h,
              u,
            );
          (f.addColorStop(0, "rgba(8,6,5,0.22)"),
            f.addColorStop(1, "rgba(8,6,5,0)"),
            (t.fillStyle = f),
            t.fillRect(0, 0, pi, pi));
        }
        let a = t.createRadialGradient(n, n, 0, n, n, 115);
        (a.addColorStop(0, "rgba(5,4,3,0.95)"),
          a.addColorStop(0.55, "rgba(12,9,7,0.7)"),
          a.addColorStop(1, "rgba(12,9,7,0)"),
          (t.fillStyle = a),
          t.fillRect(0, 0, pi, pi));
      }));
    let i = (o, a) =>
      e(o, (c) => {
        ((t.fillStyle = "rgba(205,200,198,0.94)"),
          Ji(t, c, n, n, 44, 26, 0.8),
          t.fill());
        for (let l = 0; l < 26; l++) {
          let h = c() * 6.28,
            u = 40 + c() * 70,
            f = 2 + c() * 9;
          (t.beginPath(),
            t.arc(n + Math.cos(h) * u, n + Math.sin(h) * u, f, 0, 6.28),
            t.fill());
        }
        if (a)
          for (let l = 0; l < 6; l++) {
            let h = n - 40 + c() * 80;
            t.fillRect(h, n, 3 + c() * 4, 40 + c() * 70);
          }
        ((t.fillStyle = "rgba(90,86,84,0.55)"),
          Ji(t, c, n, n, 26, 20, 0.6),
          t.fill());
      });
    (i(Xe.BLOOD, !1),
      i(Xe.BLOOD2, !0),
      e(Xe.DUST, (o) => {
        for (let c = 0; c < 900; c++) {
          let l = o() * 6.28,
            h = Math.pow(o(), 0.7) * 120;
          t.fillStyle = `rgba(${200 + o() * 40},${195 + o() * 40},${180 + o() * 40},${0.08 + o() * 0.25})`;
          let u = 1 + o() * 4;
          t.fillRect(n + Math.cos(l) * h, n + Math.sin(l) * h * 0.8, u, u);
        }
        let a = t.createRadialGradient(n, n, 0, n, n, 110);
        (a.addColorStop(0, "rgba(210,204,190,0.35)"),
          a.addColorStop(1, "rgba(210,204,190,0)"),
          (t.fillStyle = a),
          t.fillRect(0, 0, pi, pi));
      }));
    let r = new Si(s);
    return (
      (r.colorSpace = Ai),
      (r.generateMipmaps = !0),
      (r.minFilter = hi),
      (r.anisotropy = 4),
      r
    );
  }
  var MA = `
in vec3 iPos; in vec3 iN; in vec4 iP; in vec3 iT; // iP: rot, size, tile, alpha; iT: tint
out vec2 vUv; out vec3 vPos; out vec3 vN; out float vA; out vec3 vT;
void main(){
  vec3 N = normalize(iN);
  vec3 T = abs(N.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : normalize(cross(vec3(0.0, 1.0, 0.0), N));
  vec3 B = normalize(cross(N, T));
  float c = cos(iP.x), s = sin(iP.x);
  vec3 T2 = T * c + B * s, B2 = -T * s + B * c;
  vec3 wp = iPos + N * 0.006 + (T2 * position.x + B2 * position.y) * iP.y;
  float tile = iP.z;
  vec2 cell = vec2(mod(tile, ${Ac}.0), floor(tile / ${Ac}.0));
  vUv = (cell + (position.xy + 0.5)) / vec2(${Ac}.0, ${a_}.0);
  vUv.y = 1.0 - vUv.y;
  vPos = wp; vN = N; vA = iP.w; vT = iT;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`,
    SA = `
precision highp float;
in vec2 vUv; in vec3 vPos; in vec3 vN; in float vA; in vec3 vT;
out vec4 fragColor;
uniform sampler2D tAtlas; uniform sampler2D tLight; uniform vec2 uWorld; uniform float uCeilH;
${Fo}
void main(){
  vec4 t = texture(tAtlas, vUv);
  float a = t.a * vA;
  if (a < 0.01) discard;
  vec3 alb = pow(t.rgb, vec3(2.2)) * 0.85 * vT;
  vec4 lf = texture(tLight, (vPos.xz + vN.xz * 0.4) / uWorld);
  float d0 = length(vPos.xz - uBlack.xy);
  float blk = uBlack.w > 0.0 ? (1.0 - smoothstep(uBlack.z*0.8, uBlack.z, d0)) * uBlack.w : 0.0;
  float E = lf.r * lf.r * 4.0 * uLightMul * (1.0 - blk * 0.97);
  float vert = abs(vN.y) > 0.5 ? (vN.y > 0.0 ? 1.0 : 0.3) : mix(0.68, 1.0, clamp(vPos.y / max(uCeilH, 1.0), 0.0, 1.0));
  vec3 col = alb * (E * uLightCol * vert * 0.9 + uAmb);
  if (uFlashI > 0.0) {
    vec3 L = uFlashPos - vPos; float d = length(L); L /= d;
    float cone = smoothstep(0.80, 0.95, dot(-L, uFlashDir));
    col += alb * uFlashI * cone / (1.0 + d * d * 0.09) * max(dot(vN, L), 0.0) * 0.8;
  }
  float dist = length(uCam - vPos);
  float fogF = 1.0 - exp(-pow(dist * uFogDen, 1.5));
  col = mix(col, uFogCol * uFogLight, fogF);
  fragColor = vec4(col, a * (1.0 - fogF * 0.5));
}`,
    Pd = class {
      constructor(t, e = 420) {
        ((this.game = t), (this.max = e));
        let n = new Un(1, 1),
          i = new To();
        ((i.index = n.index),
          i.setAttribute("position", n.getAttribute("position")),
          (this.aPos = new Mi(new Float32Array(e * 3), 3)),
          (this.aN = new Mi(new Float32Array(e * 3), 3)),
          (this.aP = new Mi(new Float32Array(e * 4), 4)),
          (this.aT = new Mi(new Float32Array(e * 3), 3)));
        for (let o of [this.aPos, this.aN, this.aP, this.aT]) o.setUsage(Cs);
        (i.setAttribute("iPos", this.aPos),
          i.setAttribute("iN", this.aN),
          i.setAttribute("iP", this.aP),
          i.setAttribute("iT", this.aT),
          (i.instanceCount = 0),
          (this.geo = i));
        let r = t.shared;
        ((this.mat = new De({
          glslVersion: yn,
          vertexShader: MA,
          fragmentShader: SA,
          uniforms: { ...r, tAtlas: { value: bA() } },
          transparent: !0,
          depthWrite: !1,
          polygonOffset: !0,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        })),
          (this.mesh = new te(i, this.mat)),
          (this.mesh.frustumCulled = !1),
          (this.mesh.renderOrder = 1),
          t.scene.add(this.mesh),
          (this.list = []));
      }
      onFloorEnter(t) {
        ((this.fs = t),
          t.decals || (t.decals = []),
          (this.list = t.decals),
          this.upload());
      }
      onFloorExit() {
        ((this.list = []), (this.geo.instanceCount = 0));
      }
      add(t, e, n, i, r = {}) {
        if (!this.fs) return null;
        let o = n === Xe.BLOOD || n === Xe.BLOOD2,
          a = r.tint
            ? [
                Math.min(1, r.tint[0] * 2.4),
                Math.min(1, r.tint[1] * 2.4),
                Math.min(1, r.tint[2] * 2.4),
              ]
            : o
              ? [0.34, 0.035, 0.03]
              : [1, 1, 1],
          c = {
            p: [t.x, t.y, t.z],
            n: [e.x, e.y ?? 0, e.z],
            rot: r.rot ?? Math.random() * 6.28,
            size: i,
            tile: n,
            alpha: r.alpha ?? 1,
            key: r.key || null,
            tint: a,
          };
        return (
          this.list.push(c),
          this.list.length > this.max &&
            this.list.splice(0, this.list.length - this.max),
          this.upload(),
          c
        );
      }
      removeKey(t) {
        let e = this.list.length;
        for (let n = this.list.length - 1; n >= 0; n--)
          this.list[n].key === t && this.list.splice(n, 1);
        this.list.length !== e && this.upload();
      }
      upload() {
        let t = this.list,
          e = this.aPos.array,
          n = this.aN.array,
          i = this.aP.array,
          r = this.aT.array,
          o = Math.min(t.length, this.max);
        for (let a = 0; a < o; a++) {
          let c = t[a];
          ((e[a * 3] = c.p[0]),
            (e[a * 3 + 1] = c.p[1]),
            (e[a * 3 + 2] = c.p[2]),
            (n[a * 3] = c.n[0]),
            (n[a * 3 + 1] = c.n[1]),
            (n[a * 3 + 2] = c.n[2]),
            (i[a * 4] = c.rot),
            (i[a * 4 + 1] = c.size),
            (i[a * 4 + 2] = c.tile),
            (i[a * 4 + 3] = c.alpha));
          let l = c.tint || [1, 1, 1];
          ((r[a * 3] = l[0]), (r[a * 3 + 1] = l[1]), (r[a * 3 + 2] = l[2]));
        }
        ((this.geo.instanceCount = o),
          (this.aPos.needsUpdate = !0),
          (this.aN.needsUpdate = !0),
          (this.aP.needsUpdate = !0),
          (this.aT.needsUpdate = !0));
      }
    };
  var c_ = { 1: 10, 3: 9, 6: 10, 4: 3, 5: 4 },
    l_ = 40,
    qo = {
      pistol: 15,
      revolver: 6,
      smg: 30,
      shotgun: 6,
      rifle: 30,
      launcher: 1,
    },
    wA = {
      pistol: 1.25,
      revolver: 2.1,
      smg: 1.7,
      shotgun: 2.3,
      rifle: 1.9,
      launcher: 1.8,
    },
    Wo = (s) => (s.vert ? "v" : "h") + s.i + "," + s.j;
  function Z1(s, t, e) {
    let n = Wo(t),
      i = t.vert ? s.vIdx(t.i, t.j) : s.hIdx(t.i, t.j),
      r = t.vert ? s.vw : s.hw,
      o = r[i];
    if (o === 7 || o === 0 || o === 2) return !1;
    let a = o === 4 || o === 5;
    if (((r[i] = a ? 0 : 7), !a)) {
      let c = Math.floor(Qn(t.i, t.j, t.vert ? 7 : 8) * 1e6) + 1,
        l = e || { x: 1, z: 1 };
      (s.breaches.set(n, {
        seed: c,
        reinf: s.reinforced.has(n),
        side: -(Math.sign(t.vert ? l.x : l.z) || 1),
      }),
        s.breachStub.set(i * 2 + (t.vert ? 0 : 1), P2(c)));
    }
    return (
      s.reinforced.delete(n),
      s.wallHP && s.wallHP.delete(n),
      s.ventOpen && o === 6 && s.ventOpen.delete(n),
      !0
    );
  }
  var TA = `
in float aSize; in vec4 aCol;
out vec4 vCol;
uniform float uScale;
#ifdef LIT
uniform sampler2D tLight; uniform vec2 uWorld;
uniform vec3 uLightCol; uniform float uLightMul; uniform vec3 uAmb;
uniform vec3 uFlashPos; uniform vec3 uFlashDir; uniform float uFlashI;
uniform vec4 uBlack; uniform vec4 uDynPos[4]; uniform vec4 uDynCol[4];
uniform vec3 uCam; uniform vec3 uFogCol; uniform float uFogDen; uniform float uFogLight;
#endif
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  vCol = aCol;
#ifdef LIT
  vec4 lf = texture(tLight, position.xz / uWorld);
  float E = lf.r*lf.r*4.0*uLightMul;
  float bd = length(position.xz - uBlack.xy);
  E *= 1.0 - (uBlack.w > 0.0 ? (1.0 - smoothstep(uBlack.z*0.8, uBlack.z, bd)) * uBlack.w * 0.97 : 0.0);
  vec3 L = E * uLightCol * 0.8 + uAmb * 3.0;
  if (uFlashI > 0.0) {
    vec3 d = position - uFlashPos; float dl = length(d);
    L += vec3(1.0, 0.96, 0.88) * uFlashI * smoothstep(0.8, 0.95, dot(d / max(dl, 1e-3), uFlashDir)) / (1.0 + dl*dl*0.09);
  }
  for (int i = 0; i < 4; i++) { vec4 dp = uDynPos[i]; vec4 dc = uDynCol[i]; if (dc.w <= 0.0) continue; float d = length(dp.xyz - position); L += dc.rgb * dc.w * pow(clamp(1.0 - d/dp.w, 0.0, 1.0), 2.0) * 0.6; }
  vCol.rgb *= L;
  float fogF = 1.0 - exp(-pow(length(uCam - position)*uFogDen, 1.5));
  vCol.rgb = mix(vCol.rgb, uFogCol*uFogLight, fogF);
#endif
}`,
    EA = `
precision highp float;
in vec4 vCol; out vec4 fragColor;
uniform float uSoft;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  float a = uSoft > 0.5 ? (1.0 - smoothstep(0.15, 1.0, d)) * (1.0 - smoothstep(0.15, 1.0, d)) : (1.0 - step(1.0, d));
  if (a <= 0.01) discard;
  fragColor = vec4(vCol.rgb, vCol.a * a);
}`,
    kd = class {
      constructor(t, e, n, i) {
        ((this.max = t),
          (this.n = 0),
          (this.pos = new Float32Array(t * 3)),
          (this.vel = new Float32Array(t * 3)),
          (this.col = new Float32Array(t * 4)),
          (this.size = new Float32Array(t)),
          (this.life = new Float32Array(t)),
          (this.age = new Float32Array(t)),
          (this.grav = new Float32Array(t)),
          (this.drag = new Float32Array(t)),
          (this.grow = new Float32Array(t)),
          (this.a0 = new Float32Array(t)));
        let r = new Vt();
        ((this.aPos = new Kt(this.pos, 3)),
          this.aPos.setUsage(Cs),
          (this.aCol = new Kt(this.col, 4)),
          this.aCol.setUsage(Cs),
          (this.aSize = new Kt(this.size, 1)),
          this.aSize.setUsage(Cs),
          r.setAttribute("position", this.aPos),
          r.setAttribute("aCol", this.aCol),
          r.setAttribute("aSize", this.aSize),
          r.setDrawRange(0, 0),
          (this.geo = r));
        let o = { uScale: { value: 400 }, uSoft: { value: n ? 1 : 0 } };
        if (i)
          for (let a of [
            "tLight",
            "uWorld",
            "uLightCol",
            "uLightMul",
            "uAmb",
            "uFlashPos",
            "uFlashDir",
            "uFlashI",
            "uBlack",
            "uDynPos",
            "uDynCol",
            "uCam",
            "uFogCol",
            "uFogDen",
            "uFogLight",
          ])
            o[a] = i[a];
        ((this.mat = new De({
          glslVersion: yn,
          vertexShader: TA,
          fragmentShader: EA,
          uniforms: o,
          defines: i ? { LIT: 1 } : {},
          transparent: !0,
          depthWrite: !1,
          blending: e ? fs : us,
        })),
          (this.points = new js(r, this.mat)),
          (this.points.frustumCulled = !1));
      }
      spawn(t, e, n, i, r, o, a, c, l, h, u, f, d = 0, p = 0, g = 0) {
        let m =
          this.n < this.max ? this.n++ : Math.floor(Math.random() * this.max);
        ((this.pos[m * 3] = t),
          (this.pos[m * 3 + 1] = e),
          (this.pos[m * 3 + 2] = n),
          (this.vel[m * 3] = i),
          (this.vel[m * 3 + 1] = r),
          (this.vel[m * 3 + 2] = o),
          (this.col[m * 4] = a),
          (this.col[m * 4 + 1] = c),
          (this.col[m * 4 + 2] = l),
          (this.col[m * 4 + 3] = h),
          (this.a0[m] = h),
          (this.size[m] = u),
          (this.life[m] = f),
          (this.age[m] = 0),
          (this.grav[m] = d),
          (this.drag[m] = p),
          (this.grow[m] = g));
      }
      update(t) {
        let e = 0;
        for (; e < this.n; ) {
          if (((this.age[e] += t), this.age[e] >= this.life[e])) {
            let r = --this.n;
            if (e !== r) {
              for (let o = 0; o < 3; o++)
                ((this.pos[e * 3 + o] = this.pos[r * 3 + o]),
                  (this.vel[e * 3 + o] = this.vel[r * 3 + o]));
              for (let o = 0; o < 4; o++)
                this.col[e * 4 + o] = this.col[r * 4 + o];
              ((this.size[e] = this.size[r]),
                (this.life[e] = this.life[r]),
                (this.age[e] = this.age[r]),
                (this.grav[e] = this.grav[r]),
                (this.drag[e] = this.drag[r]),
                (this.grow[e] = this.grow[r]),
                (this.a0[e] = this.a0[r]));
            }
            continue;
          }
          let n = Math.max(0, 1 - this.drag[e] * t);
          ((this.vel[e * 3] *= n),
            (this.vel[e * 3 + 2] *= n),
            (this.vel[e * 3 + 1] = this.vel[e * 3 + 1] * n - this.grav[e] * t),
            (this.pos[e * 3] += this.vel[e * 3] * t),
            (this.pos[e * 3 + 1] += this.vel[e * 3 + 1] * t),
            (this.pos[e * 3 + 2] += this.vel[e * 3 + 2] * t),
            this.pos[e * 3 + 1] < 0.01 &&
              this.grav[e] > 0 &&
              ((this.pos[e * 3 + 1] = 0.01),
              (this.vel[e * 3 + 1] *= -0.3),
              (this.vel[e * 3] *= 0.5),
              (this.vel[e * 3 + 2] *= 0.5)),
            (this.size[e] += this.grow[e] * t));
          let i = this.age[e] / this.life[e];
          ((this.col[e * 4 + 3] =
            this.a0[e] * (1 - i) * (i < 0.1 ? i / 0.1 : 1)),
            e++);
        }
        (this.geo.setDrawRange(0, this.n),
          (this.aPos.needsUpdate = !0),
          (this.aCol.needsUpdate = !0),
          (this.aSize.needsUpdate = !0));
      }
      clear() {
        ((this.n = 0), this.geo.setDrawRange(0, 0));
      }
    };
  function AA() {
    let s = new ks(),
      t = [
        [-0.5, -0.16, -0.42],
        [0.46, -0.2, -0.47],
        [0.52, -0.15, 0.41],
        [-0.42, -0.18, 0.36],
        [-0.47, 0.15, -0.38],
        [0.4, 0.18, -0.43],
        [0.48, 0.14, 0.37],
        [-0.4, 0.17, 0.42],
      ];
    return (
      s.hexa(t, 27, 0, [0.88, 0.86, 0.8], 61),
      s.hexa(t, 0, 0, [1, 1, 1], 2),
      s.build()
    );
  }
  function CA() {
    let s = new ks();
    return (
      s.tube("x", -0.5, 0.5, 0, 0, 0.27, 0.25, 6, 0, [0.72, 0.52, 0.2], 8, 3),
      s.build()
    );
  }
  var Ld = class {
    constructor(t, e, n, i = {}) {
      ((this.mat = On(t, {
        vcol: !0,
        color: [1, 1, 1],
        rough: i.rough ?? 0.85,
        metal: i.metal ?? 0,
        rim: 0.1,
      })),
        (this.mesh = new go(e, this.mat, n)),
        this.mesh.instanceMatrix.setUsage(Cs),
        this.mesh.setColorAt(0, new Rt(1, 1, 1)),
        this.mesh.instanceColor.setUsage(Cs),
        (this.mesh.count = 0),
        (this.mesh.frustumCulled = !1),
        (this.items = []),
        (this.max = n),
        (this.opts = i),
        (this.m4 = new Qt()),
        (this.q = new xn()),
        (this.e = new bi()),
        (this.s = new L()),
        (this.p = new L()),
        (this.c = new Rt()));
    }
    spawn(t, e, n, i, r, o, a, c, l = 0.3) {
      this.items.length >= this.max && this.items.shift();
      let h = this.opts.uniform;
      this.items.push({
        x: t,
        y: e,
        z: n,
        vx: i,
        vy: r,
        vz: o,
        rx: Math.random() * 6,
        ry: Math.random() * 6,
        rz: Math.random() * 6,
        wx: (Math.random() - 0.5) * 16,
        wy: (Math.random() - 0.5) * 16,
        sx: h ? a : a * (0.6 + Math.random() * 0.8),
        sy: h ? a : a * l * (0.6 + Math.random() * 0.8),
        sz: h ? a : a * (0.5 + Math.random() * 0.8),
        t: 0,
        col: c || [1, 1, 1],
        rest: !1,
        bounced: 0,
      });
    }
    update(t, e) {
      let n = this.items,
        i = e.fs && e.fs.map,
        r = e.fs ? e.fs.theme.ceilH : 3,
        o = this.opts.life ?? 24;
      for (let a = n.length - 1; a >= 0; a--) {
        let c = n[a];
        if (((c.t += t), c.t > o || c.y < -25)) {
          n.splice(a, 1);
          continue;
        }
        if (c.rest) continue;
        c.vy -= 14 * t;
        let l = c.x + c.vx * t,
          h = c.z + c.vz * t;
        if (i) {
          let f = Math.hypot(c.vx, c.vz);
          if (f > 0.05) {
            let d = ni(i, c.x, c.z, c.vx, c.vz, f * t + 0.05, "move");
            (d.kind === "wall" || d.kind === "pillar" || d.kind === "prop") &&
              (d.nx
                ? (c.vx = -c.vx * 0.35)
                : d.nz
                  ? (c.vz = -c.vz * 0.35)
                  : ((c.vx *= -0.35), (c.vz *= -0.35)),
              (l = c.x),
              (h = c.z));
          }
        }
        ((c.x = l),
          (c.z = h),
          (c.y += c.vy * t),
          (c.rx += c.wx * t),
          (c.ry += c.wy * t),
          c.y > r - 0.05 && ((c.y = r - 0.05), (c.vy = -Math.abs(c.vy) * 0.3)));
        let u = i && !rr(i, c.x, c.z) ? -100 : c.sy * 0.5;
        c.y < u &&
          ((c.y = u),
          (c.vy *= -0.28),
          (c.vx *= 0.55),
          (c.vz *= 0.55),
          (c.wx *= 0.5),
          (c.wy *= 0.5),
          this.opts.onBounce &&
            c.bounced < 2 &&
            Math.abs(c.vy) > 0.4 &&
            this.opts.onBounce(c),
          c.bounced++,
          Math.abs(c.vy) < 0.5 &&
            Math.hypot(c.vx, c.vz) < 0.3 &&
            ((c.vy = 0),
            (c.rest = !0),
            (c.rx = Math.round(c.rx / Math.PI) * Math.PI),
            (c.rz = Math.round(c.rz / Math.PI) * Math.PI)));
      }
      this.mesh.count = n.length;
      for (let a = 0; a < n.length; a++) {
        let c = n[a],
          l = c.t > o - 3 ? (c.t - (o - 3)) * 0.03 : 0;
        (this.e.set(c.rx, c.ry, c.rz),
          this.q.setFromEuler(this.e),
          this.s.set(c.sx, c.sy, c.sz),
          this.p.set(c.x, c.y - l, c.z),
          this.m4.compose(this.p, this.q, this.s),
          this.mesh.setMatrixAt(a, this.m4),
          this.c.setRGB(c.col[0], c.col[1], c.col[2]),
          this.mesh.setColorAt(a, this.c));
      }
      ((this.mesh.instanceMatrix.needsUpdate = !0),
        this.mesh.instanceColor && (this.mesh.instanceColor.needsUpdate = !0));
    }
    clear() {
      ((this.items.length = 0), (this.mesh.count = 0));
    }
  };
  function RA() {
    let s = document.createElement("canvas");
    s.width = s.height = 128;
    let t = s.getContext("2d"),
      e = t.createRadialGradient(64, 64, 0, 64, 64, 64);
    (e.addColorStop(0, "rgba(255,250,230,1)"),
      e.addColorStop(0.18, "rgba(255,200,110,0.9)"),
      e.addColorStop(0.5, "rgba(255,120,30,0.25)"),
      e.addColorStop(1, "rgba(255,90,10,0)"),
      (t.fillStyle = e),
      t.fillRect(0, 0, 128, 128),
      (t.globalCompositeOperation = "lighter"));
    for (let i = 0; i < 7; i++) {
      let r = (i / 7) * Math.PI * 2 + Math.random() * 0.4,
        o = 40 + Math.random() * 22;
      (t.save(), t.translate(64, 64), t.rotate(r));
      let a = t.createLinearGradient(0, 0, o, 0);
      (a.addColorStop(0, "rgba(255,220,150,0.9)"),
        a.addColorStop(1, "rgba(255,140,40,0)"),
        (t.fillStyle = a),
        t.beginPath(),
        t.moveTo(0, -5),
        t.lineTo(o, 0),
        t.lineTo(0, 5),
        t.fill(),
        t.restore());
    }
    let n = new Si(s);
    return ((n.colorSpace = Ai), n);
  }
  var u_ = {
      fist: "fist",
      pipe: "sword",
      crowbar: "sword",
      machete: "sword",
      knife: "sword",
      axe: "sword",
      hammer: "sword",
    },
    h_ = (s) => u_[s] || (Wn[s] && Wn[s].muzzle ? "grip" : "hold"),
    PA = (s) => !!(Wn[s] && Wn[s].muzzle),
    Id = class {
      constructor(t) {
        ((this.game = t), (t.combat = this));
        let e = t.shared;
        ((this.add = new kd(700, !0, !0, null)),
          (this.dust = new kd(1400, !1, !0, e)),
          (this.debris = new Ld(e, AA(), 180)),
          (this.casings = new Ld(e, CA(), 60, {
            life: 9,
            rough: 0.35,
            metal: 0.9,
            uniform: !0,
            onBounce: (i) =>
              t.audio &&
              t.audio.sfx("shell", { pos: i, vol: 0.25, range: 14, vary: 0.3 }),
          })),
          t.scene.add(
            this.add.points,
            this.dust.points,
            this.debris.mesh,
            this.casings.mesh,
          ),
          (this.vmMat = On(e, {
            vcol: !0,
            rough: 0.5,
            view: !0,
            lightAt: 1,
            rim: 0.12,
          })),
          (this.vm = new We()),
          (this.vmGun = new We()),
          (this.vmWeapon = new te(new Vt(), this.vmMat)),
          (this.vmHandR = new te(new Vt(), this.vmMat)),
          (this.vmSleeveR = new te(new Vt(), this.vmMat)),
          (this.vmLeft = new We()),
          (this.vmHandL = new te(new Vt(), this.vmMat)),
          (this.vmSleeveL = new te(new Vt(), this.vmMat)),
          this.vmLeft.add(this.vmHandL, this.vmSleeveL),
          (this.vmItem = new te(new Vt(), this.vmMat)),
          this.vmGun.add(
            this.vmWeapon,
            this.vmHandR,
            this.vmSleeveR,
            this.vmLeft,
            this.vmItem,
          ),
          (this.vmFistL = new We()),
          (this.vmFistLHand = new te(new Vt(), this.vmMat)),
          (this.vmFistLSleeve = new te(new Vt(), this.vmMat)),
          this.vmFistL.add(this.vmFistLHand, this.vmFistLSleeve),
          this.vm.add(this.vmGun, this.vmFistL));
        for (let i of [
          this.vmWeapon,
          this.vmHandR,
          this.vmSleeveR,
          this.vmHandL,
          this.vmSleeveL,
          this.vmItem,
          this.vmFistLHand,
          this.vmFistLSleeve,
        ])
          i.frustumCulled = !1;
        (t.vmScene.add(this.vm), (this.vmGeos = {}));
        let n = new Hn({
          map: RA(),
          transparent: !0,
          blending: fs,
          depthWrite: !1,
          color: new Rt(3, 2.6, 2.2),
        });
        ((this.flash = new te(new Un(0.2, 0.2), n)),
          (this.flash.visible = !1),
          (this.flash.frustumCulled = !1),
          t.vmScene.add(this.flash),
          (this.flashT = 0),
          (this.cool = 0),
          (this.anim = 0),
          (this.animDur = 0.4),
          (this.animKind = null),
          (this.equipT = 0),
          (this.hitPending = null),
          (this.reload = null),
          (this.useAnim = null),
          (this.throwAnim = null),
          (this.autoReloadT = 0),
          (this.projs = []),
          (this.projMat = On(e, { vcol: !0, rough: 0.5 })),
          (this.recoil = 0),
          (this.kick = 0),
          (this.swingAlt = !1),
          (this.sway = { x: 0, y: 0, vx: 0, vy: 0, lastYaw: 0, lastPitch: 0 }),
          (this.curType = null),
          (this.tmpV = new L()),
          (this.tmpV2 = new L()));
      }
      def() {
        return this.game.items.def();
      }
      eqType() {
        let t = this.game.items.equipped();
        return t ? t.type : "fist";
      }
      weaponGeo(t) {
        return (
          this.vmGeos[t] ||
            (this.vmGeos[t] =
              PA(t) || (u_[t] && t !== "fist") ? _h(t).build() : new Vt()),
          this.vmGeos[t]
        );
      }
      setVM(t) {
        this.curType = t;
        let e = h_(t),
          n = ar(e, 1);
        ((this.vmHandR.geometry = n.hand),
          (this.vmSleeveR.geometry = n.sleeve),
          (this.vmWeapon.geometry = this.weaponGeo(t)),
          (this.vmWeapon.visible = !0),
          (this.vmItem.visible = !1));
        let i = Wn[t] || {};
        if (i.support) {
          let r = ar("support", -1);
          ((this.vmHandL.geometry = r.hand),
            (this.vmSleeveL.geometry = r.sleeve),
            (this.vmLeft.visible = !0),
            this.vmLeft.position.set(i.support[0], i.support[1], i.support[2]));
        } else this.vmLeft.visible = !1;
        if (t === "fist") {
          let r = ar("fist", -1);
          ((this.vmFistLHand.geometry = r.hand),
            (this.vmFistLSleeve.geometry = r.sleeve),
            (this.vmFistL.visible = !0));
        } else this.vmFistL.visible = !1;
      }
      holdItem(t) {
        let e = ar("hold", 1);
        ((this.vmHandR.geometry = e.hand),
          (this.vmSleeveR.geometry = e.sleeve),
          (this.vmWeapon.visible = !1),
          (this.vmLeft.visible = !1),
          (this.vmFistL.visible = !1),
          this.itemGeos || (this.itemGeos = {}),
          this.itemGeos[t] ||
            ((this.itemGeos[t] = bh(t)), this.itemGeos[t].computeBoundingBox()),
          (this.vmItem.geometry = this.itemGeos[t]));
        let n = this.vmItem.geometry.boundingBox;
        (this.vmItem.position.set(
          -(n.min.x + n.max.x) / 2,
          -(n.min.y + n.max.y) / 2 + 0.005,
          -(n.min.z + n.max.z) / 2 - 0.004,
        ),
          this.vmItem.rotation.set(0, Math.PI / 2, 0),
          (this.vmItem.visible = !0));
      }
      onEquip(t) {
        let e = t ? t.type : "fist";
        this.setVM(e);
        let n = this.game.items;
        if (t && qo[t.type] && t.mag === void 0 && n.inv) {
          let i = be[t.type],
            r = n.inv.ammo,
            o = Math.min(qo[t.type], r[i.ammo] || 0);
          ((t.mag = o), (r[i.ammo] -= o));
        }
        ((this.equipT = 0.35),
          (this.anim = 0),
          (this.animKind = null),
          (this.reload = null),
          (this.hitPending = null),
          (this.autoReloadT = 0),
          (this.cool = Math.max(this.cool, 0.25)),
          n.renderWeapons && n.renderWeapons());
      }
      onNewRun() {
        (this.projs.forEach((t) => t.mesh && this.game.scene.remove(t.mesh)),
          (this.projs = []),
          (this.useAnim = null),
          (this.throwAnim = null),
          (this.reload = null));
      }
      warmup() {
        for (let n of ["grip", "fist", "support", "sword", "hold"]) ar(n, 1);
        (ar("fist", -1), ar("support", -1));
        let t = new We(),
          e = new te(bh("bomb"), this.projMat);
        return (
          e.position.set(0.5, 0.5, -2),
          t.add(e),
          this.debris.spawn(0, 1, -2, 0, 0, 0, 0.2),
          this.debris.update(0.016, this.game),
          this.casings.spawn(0, 1, -2, 0, 0, 0, 0.02),
          this.casings.update(0.016, this.game),
          (this.flash.visible = !0),
          this.add.spawn(0, 1, -2, 0, 0, 0, 1, 1, 1, 1, 5, 0.1),
          this.dust.spawn(0, 1, -2, 0, 0, 0, 1, 1, 1, 1, 5, 0.1),
          this.add.update(0.001),
          this.dust.update(0.001),
          this.curType || this.setVM("fist"),
          t
        );
      }
      unwarm() {
        ((this.flash.visible = !1),
          this.debris.clear(),
          this.casings.clear(),
          this.add.clear(),
          this.dust.clear());
      }
      onFloorEnter(t) {
        (this.add.clear(),
          this.dust.clear(),
          this.debris.clear(),
          this.casings.clear(),
          this.projs.forEach((r) => r.mesh && this.game.scene.remove(r.mesh)),
          (this.projs = []));
        let e = {
            yellow: [0.88, 0.86, 0.8],
            office: [0.86, 0.85, 0.82],
            hospital: [0.86, 0.86, 0.84],
            pool: [0.62, 0.6, 0.56],
            abyss: [0.42, 0.41, 0.39],
            parking: [0.45, 0.44, 0.42],
            pipes: [0.42, 0.22, 0.15],
            station: [0.82, 0.82, 0.8],
          }[t.themeId] || [0.8, 0.8, 0.78],
          n = this.debris.mesh.geometry.attributes.color,
          i = this.debris.mesh.geometry.attributes.aMat;
        for (let r = 0; r < n.count; r++)
          i.array[r] === 27 && n.setXYZ(r, e[0], e[1], e[2]);
        ((n.needsUpdate = !0), (this.coreCol = e));
      }
      update(t) {
        let e = this.game,
          n = e.player,
          i = e.input;
        if (
          ((this.cool -= t),
          (this.equipT = Math.max(0, this.equipT - t)),
          (this.recoil = Math.max(0, this.recoil - t * 5)),
          (this.kick = Math.max(0, this.kick - t * 9)),
          this.animKind &&
            ((this.anim += t),
            this.anim >= this.animDur && (this.animKind = null)),
          this.hitPending && this.anim >= this.hitPending.at)
        ) {
          let l = this.hitPending;
          ((this.hitPending = null), this.meleeHit(l.def));
        }
        (this.reload
          ? this.updateReload(t)
          : this.autoReloadT > 0 &&
            ((this.autoReloadT -= t),
            this.autoReloadT <= 0 && this.startReload()),
          i.take("reload") && this.startReload(!0),
          this.throwAnim && this.updateThrow(t),
          this.useAnim && (this.useAnim.t += t));
        let r = this.def(),
          o = !!(this.useAnim || this.throwAnim || this.reload),
          a = r.auto && i.attackHeld;
        ((i.take("attack") || a) &&
          !n.dead &&
          this.cool <= 0 &&
          this.equipT <= 0.05 &&
          !o &&
          (n.inDuct && r.kind !== "melee"
            ? this._ductToast ||
              ((this._ductToast = !0),
              e.toast(
                "狭すぎて銃は構えられない",
                1e3,
              ))
            : this.attack()),
          this.updateProjs(t),
          this.add.update(t),
          this.dust.update(t),
          this.debris.update(t, e),
          this.casings.update(t, e));
      }
      attack() {
        let t = this.game,
          e = t.player,
          n = this.def(),
          i = this.eqType();
        if (n.kind === "melee") {
          ((this.cool = n.rate),
            (this.anim = 0),
            (this.animDur = n.rate * 0.95),
            (this.animKind = "swing"),
            (this.hitPending = { at: n.rate * 0.32, def: n }),
            (this.swingAlt = !this.swingAlt),
            t.audio &&
              t.audio.sfx("swing", {
                vol: n.heavy ? 0.8 : 0.5,
                rate: n.heavy ? 0.7 : i === "fist" ? 1.3 : 1,
                vary: 0.1,
              }),
            (e.stamina = Math.max(0, e.stamina - (n.heavy ? 9 : 3))));
          return;
        }
        let r = t.items.equipped();
        if (r) {
          if (!r.mag) {
            (this.startReload(),
              this.reload ||
                ((this.cool = 0.35),
                t.audio && t.audio.sfx("click", { vol: 0.7 }),
                t.toast("弾がない", 800)));
            return;
          }
          (r.mag--,
            (this.cool = n.rate),
            (this.anim = 0),
            (this.animDur = Math.max(0.12, Math.min(n.rate, 0.5))),
            (this.animKind = "recoil"),
            n.kind === "launcher" ? this.fireLauncher(n) : this.fire(n, i),
            t.items.renderWeapons(),
            r.mag || (this.autoReloadT = 0.3));
        }
      }
      startReload(t) {
        let e = this.game,
          n = e.items.equipped();
        if (!n || !qo[n.type] || this.reload || this.useAnim || this.throwAnim)
          return;
        let i = be[n.type],
          r = e.items.inv.ammo;
        if ((n.mag || 0) >= qo[n.type]) return;
        if ((r[i.ammo] || 0) <= 0) {
          t && e.toast("予備の弾がない", 900);
          return;
        }
        let o = e.player.buffs.adren > 0 ? 1.4 : 1;
        ((this.reload = {
          t: 0,
          dur: wA[n.type] / o,
          type: n.type,
          s1: !1,
          s2: !1,
          s3: !1,
        }),
          (this.hitPending = null));
      }
      updateReload(t) {
        let e = this.game,
          n = this.reload,
          i = e.items.equipped();
        if (!i || i.type !== n.type) {
          this.reload = null;
          return;
        }
        n.t += t;
        let r = n.t / n.dur,
          o = e.audio;
        if (
          (!n.s1 &&
            r > 0.18 &&
            ((n.s1 = !0),
            o &&
              o.sfx(n.type === "shotgun" ? "shell_in" : "mag_out", {
                vol: 0.55,
              })),
          !n.s2 &&
            r > 0.6 &&
            ((n.s2 = !0),
            o &&
              o.sfx(n.type === "shotgun" ? "shell_in" : "mag_in", {
                vol: 0.6,
              })),
          !n.s3 &&
            r > 0.85 &&
            ((n.s3 = !0),
            o &&
              o.sfx("rack", { vol: 0.5, rate: n.type === "pistol" ? 1.3 : 1 })),
          n.t >= n.dur)
        ) {
          let a = be[i.type],
            c = e.items.inv.ammo,
            l = Math.min(qo[i.type] - (i.mag || 0), c[a.ammo] || 0);
          ((i.mag = (i.mag || 0) + l),
            (c[a.ammo] -= l),
            (this.reload = null),
            e.items.renderWeapons());
        }
      }
      camRay() {
        let t = this.game.camera,
          e = t.position.clone(),
          n = new L();
        return (t.getWorldDirection(n), { o: e, d: n });
      }
      camPoint(t, e, n, i = new L()) {
        let r = this.game.camera;
        return (i.set(t, e, -n).applyMatrix4(r.matrixWorld), i);
      }
      meleeHit(t) {
        let e = this.game,
          n = e.player,
          i = e.monsters,
          { o: r, d: o } = this.camRay(),
          a = i ? i.meleeTarget(r, o, t.range) : null;
        if (a) {
          let x =
            t.dmg *
            (0.9 + Math.random() * 0.2) *
            (n.buffs.adren > 0 ? 1.25 : 1) *
            (n.stats.meleeMul || 1);
          i.damage(a, x, n.pos, "melee");
          let v = a.pos,
            y = (a.def.height || 1.6) * 0.6 + (a.pos.y || 0);
          (this.blood(v.x, y, v.z, 12, a.def.blood),
            this.bloodDecal(v.x, v.z, a.def.blood, 0.6),
            e.audio && e.audio.sfx("hit_flesh", { vol: 0.85, vary: 0.2 }),
            e.emitNoise(n.pos.x, n.pos.z, t.noise * 0.6, "melee"),
            (n.shake = Math.max(n.shake, 0.25)),
            (this.kick = 1));
          return;
        }
        let c = Math.hypot(o.x, o.z) || 1,
          l = ni(e.fs.map, r.x, r.z, o.x / c, o.z / c, t.range * c, "move"),
          h = o.y < -0.05 ? (0 - r.y) / o.y : 1e9,
          u = o.y > 0.05 ? (e.fs.theme.ceilH - r.y) / o.y : 1e9,
          f = l.kind ? l.dist / c : 1e9,
          d = Math.min(h, u, f);
        if (d > t.range) return;
        ((n.shake = Math.max(n.shake, 0.3)), (this.kick = 1));
        let p = r.x + o.x * d,
          g = r.y + o.y * d,
          m = r.z + o.z * d;
        if (d === f && l.kind === "wall")
          this.damageWall(
            l.edge,
            l.value,
            t.wallDmg,
            { x: p, y: ke(g, 0.1, e.fs.theme.ceilH - 0.1), z: m },
            { x: l.nx, y: 0, z: l.nz },
            t.noise,
            { weapon: t },
          );
        else {
          let x = l.kind === "prop" && d === f;
          (e.audio &&
            e.audio.sfx(x ? "hit_metal" : "hit_wall", {
              vol: 0.6,
              pos: { x: p, z: m },
              rate: x ? 1.2 : 1,
            }),
            this.puff(p, g, m, 6, [0.5, 0.48, 0.42]),
            d === h &&
              this.decal(
                { x: p, y: 0.002, z: m },
                { x: 0, y: 1, z: 0 },
                Xe.DENT,
                0.22,
                { alpha: 0.7 },
              ),
            e.emitNoise(p, m, t.noise * 0.7, "hit"));
        }
      }
      wallColorAt(t, e) {
        let n = this.game,
          i = n.fs.map,
          r = Math.floor((t.x + e.x * 0.3) / 4),
          o = Math.floor((t.z + e.z * 0.3) / 4),
          a = i.inb(r, o) ? i.zone[i.ci(r, o)] : 0,
          c =
            n.fs.theme.wallKind === "paper" || a > 0
              ? (a === 0 && n.fs.theme.paperCol) || fd[a]
              : {
                  tile: [0.62, 0.66, 0.66],
                  concrete: [0.36, 0.35, 0.33],
                  brick: [0.36, 0.17, 0.11],
                  hospital: [0.5, 0.62, 0.56],
                  office: [0.5, 0.5, 0.48],
                }[n.fs.theme.wallKind] || [0.35, 0.33, 0.3];
        return [
          Math.min(1, c[0] * 1.25),
          Math.min(1, c[1] * 1.25),
          Math.min(1, c[2] * 1.25),
        ];
      }
      decal(t, e, n, i, r) {
        return this.game.decals ? this.game.decals.add(t, e, n, i, r) : null;
      }
      onFace(t, e, n, i = 0.002) {
        let r = { x: t.x, y: t.y, z: t.z };
        return (
          e.vert
            ? (r.x = e.i * 4 + Math.sign(n.x || 1) * (0.2 / 2 + i))
            : (r.z = e.j * 4 + Math.sign(n.z || 1) * (0.2 / 2 + i)),
          r
        );
      }
      damageWall(t, e, n, i, r, o, a = {}) {
        let c = this.game,
          l = c.fs.map,
          h = Wo(t),
          u = this.wallColorAt(i, r);
        if (e === 7 || e === 2 || n <= 0)
          return (
            c.audio &&
              c.audio.sfx(e === 2 ? "hit_metal" : "hit_wall", {
                vol: 0.5,
                pos: i,
                rate: 0.9,
              }),
            this.puff(i.x + r.x * 0.1, i.y, i.z + r.z * 0.1, 4, u),
            e !== 7 && this.decal(i, r, Xe.CRACK, 0.35, { alpha: 0.5 }),
            c.emitNoise(i.x, i.z, o * 0.5, "hit"),
            e === 2 &&
              n > 0 &&
              !a.remote &&
              c.toast("この壁は壊せない", 900),
            !1
          );
        i = this.onFace(i, t, r);
        let f = l.reinforced.has(h),
          d = f ? l_ : (c_[e] ?? 8),
          p = l.wallHP.has(h) ? l.wallHP.get(h) : d,
          g = f && n < 2 ? n * 0.35 : n;
        p -= g;
        let m = e === 4 || e === 5;
        if (!m) {
          let v = Math.max(0, p / d),
            y = (a.weapon && a.weapon.heavy) || n >= 3;
          if (
            (v > 0.62 && !y
              ? this.decal(
                  { x: i.x, y: i.y, z: i.z },
                  r,
                  Xe.DENT,
                  0.28 + Math.random() * 0.14,
                  { key: h },
                )
              : this.decal(
                  { x: i.x, y: i.y, z: i.z },
                  r,
                  f ? Xe.DENT : Xe.HOLE,
                  (f ? 0.4 : 0.5) + Math.random() * 0.25 + (y ? 0.15 : 0),
                  { key: h },
                ),
            Math.random() < 0.45 &&
              this.decal(
                { x: i.x, y: i.y, z: i.z },
                r,
                Xe.CRACK,
                0.5 + Math.random() * 0.5 * (1 - v),
                { key: h, alpha: 0.75 },
              ),
            v < 0.5)
          ) {
            let _ = this.onFace(i, t, { x: -r.x, z: -r.z });
            ((_.y += (Math.random() - 0.5) * 0.3),
              this.decal(
                _,
                { x: -r.x, y: 0, z: -r.z },
                Xe.CRACK,
                0.7 + (0.5 - v),
                { key: h, alpha: 0.8 },
              ));
          }
          v < 0.3 &&
            Math.random() < 0.6 &&
            this.decal(
              { x: i.x + r.x * 0.35, y: 0.003, z: i.z + r.z * 0.35 },
              { x: 0, y: 1, z: 0 },
              Xe.DUST,
              0.6 + Math.random() * 0.4,
              { key: h, alpha: 0.8 },
            );
        }
        this.puff(i.x + r.x * 0.15, i.y, i.z + r.z * 0.15, 12, u);
        let x = m ? 2 : 3 + Math.round(n);
        for (let v = 0; v < x; v++)
          this.debris.spawn(
            i.x + r.x * 0.12,
            i.y + (Math.random() - 0.5) * 0.15,
            i.z + r.z * 0.12,
            r.x * (1.5 + Math.random() * 2) + (Math.random() - 0.5) * 1.6,
            Math.random() * 1.8,
            r.z * (1.5 + Math.random() * 2) + (Math.random() - 0.5) * 1.6,
            0.04 + Math.random() * 0.05,
            u,
          );
        return p > 0
          ? (l.wallHP.set(h, p),
            c.audio &&
              c.audio.sfx(f ? "hit_metal" : "hit_wall", {
                vol: 0.9,
                pos: i,
                vary: 0.15,
                rate: f ? 0.55 : 1,
              }),
            c.emitNoise(i.x, i.z, o, "wallhit"),
            f &&
              !a.remote &&
              !this._reinfToast &&
              ((this._reinfToast = !0),
              c.toast(
                "頑丈な壁だ。重い武器か爆発物が要る",
                1600,
              )),
            !a.remote && c.net && c.net.wallHit(c.fs.depth, t, e, n, i, r),
            !1)
          : (l.wallHP.delete(h),
            this.breakEdge(t, i, u, {
              dir: r,
              remote: a.remote,
              quiet: a.quiet,
            }),
            !0);
      }
      breakEdge(t, e, n, i = {}) {
        let r = this.game,
          o = r.fs.map,
          a = Wo(t),
          c = (t.vert ? o.vw : o.hw)[
            t.vert ? o.vIdx(t.i, t.j) : o.hIdx(t.i, t.j)
          ],
          l = c === 4 || c === 5;
        if (!Z1(o, t, i.dir)) return;
        r.decals && r.decals.removeKey(a);
        let h = t.vert ? t.i - 1 : t.i,
          u = t.vert ? t.j : t.j - 1,
          f = t.i,
          d = t.j;
        (r.world.rebuildAtCell(Math.max(0, h), Math.max(0, u)),
          (Math.floor(Math.max(0, h) / 12) !==
            Math.floor(Math.min(o.W - 1, f) / 12) ||
            Math.floor(Math.max(0, u) / 12) !==
              Math.floor(Math.min(o.H - 1, d) / 12)) &&
            r.world.rebuildAtCell(Math.min(o.W - 1, f), Math.min(o.H - 1, d)));
        let p = Math.min(t.i, o.W - 1),
          g = Math.min(t.j, o.H - 1);
        (r.lf.bake(
          Math.max(0, p - 3),
          Math.max(0, g - 3),
          Math.min(o.W - 1, p + 3),
          Math.min(o.H - 1, g + 3),
        ),
          r.uploadLight(),
          r.onMapChanged && r.onMapChanged(),
          !i.remote && r.net && r.net.wallBreak(r.fs.depth, t, i.dir));
        let m = 4,
          x = r.fs.theme.ceilH,
          v = t.vert ? [0, 1] : [1, 0],
          y = t.i * m,
          _ = t.j * m,
          M = i.dir || { x: t.vert ? 1 : 0, z: t.vert ? 0 : 1 },
          b = -1;
        for (let T = 0; T < (l ? 12 : 46); T++) {
          let E = 0.5 + Math.random() * (m - 1),
            C = Math.random() * Math.min(x, 2.6),
            R = y + v[0] * E,
            I = _ + v[1] * E,
            k = (Math.random() < 0.8 ? b : -b) * (1.2 + Math.random() * 3.2);
          this.debris.spawn(
            R,
            C,
            I,
            M.x * k + (Math.random() - 0.5) * 1.5 * v[0],
            0.5 + Math.random() * 2.5,
            M.z * k + (Math.random() - 0.5) * 1.5 * v[1],
            0.07 + Math.random() * 0.22,
            n,
          );
        }
        let w = [n[0] * 0.5 + 0.3, n[1] * 0.5 + 0.29, n[2] * 0.5 + 0.27];
        for (let T = 0; T < (l ? 15 : 70); T++) {
          let E = Math.random() * m;
          this.dust.spawn(
            y + v[0] * E,
            Math.random() * 2.6,
            _ + v[1] * E,
            (Math.random() - 0.5) * 1.8 - M.x * Math.random() * 1.5,
            Math.random() * 0.4,
            (Math.random() - 0.5) * 1.8 - M.z * Math.random() * 1.5,
            w[0],
            w[1],
            w[2],
            0.28,
            26 + Math.random() * 40,
            3.5 + Math.random() * 3.5,
            -0.03,
            0.7,
            18,
          );
        }
        if (!l)
          for (let T of [1, -1])
            this.decal(
              {
                x: y + (v[0] * m) / 2 + M.x * T * 0.8,
                y: 0.003,
                z: _ + (v[1] * m) / 2 + M.z * T * 0.8,
              },
              { x: 0, y: 1, z: 0 },
              Xe.DUST,
              2.2 + Math.random() * 0.8,
              { alpha: 0.9 },
            );
        (r.audio &&
          r.audio.sfx("wall_break", { vol: 1, pos: e, important: !0 }),
          r.emitNoise(e.x, e.z, 85, "wallbreak"));
        let S = Math.hypot(r.player.pos.x - e.x, r.player.pos.z - e.z);
        ((r.player.shake = Math.max(r.player.shake, ke(0.7 - S / 20, 0, 0.6))),
          !i.remote &&
            !i.quiet &&
            r.feed(
              "壁を壊した。大きな音が響く",
              "#ff9a7a",
            ));
      }
      fire(t, e) {
        let n = this.game,
          i = n.player,
          r = n.monsters,
          o = n.fs.map,
          { o: a, d: c } = this.camRay(),
          l = n.fs.theme.ceilH,
          h = Math.min(1, i.speed / 4),
          u =
            t.spread *
            (1 + h * 0.8 + (i.stance > 0 ? -0.35 : 0)) *
            (this.recoilHeat ? 1 + this.recoilHeat * 0.6 : 1);
        for (let p = 0; p < t.pellets; p++) {
          let g = c.clone();
          ((g.x += (Math.random() - 0.5) * 2 * u),
            (g.y += (Math.random() - 0.5) * 2 * u),
            (g.z += (Math.random() - 0.5) * 2 * u),
            g.normalize(),
            t.pellets === 1 && r && r.assist(a, g, 0.04));
          let m = Math.hypot(g.x, g.z) || 1e-4,
            x = niY(o, a.x, a.z, g.x / m, g.z / m, 80, a.y, g.y / m),
            v = x.kind ? x.dist / m : 80,
            y = x.kind === "wall" ? "wall" : x.kind ? "prop" : null;
          const surface=roomSurfaceRay(o,a,g,v,l);if(surface&&surface.dist<v){v=surface.dist;y=surface.kind;}
          let hits = r
              ? t.pierce
                ? r.raycastAll(a, g, v)
                : [r.raycast(a, g, v)].filter(Boolean)
              : [],
            _ = hits[0];
          if (_) {
            hits.forEach((h, k) => {
              let M =
                t.dmg *
                (h.head ? i.stats.headMul || 1.7 : 1) *
                (i.stats.gunMul || 1) *
                (k ? 0.6 : 1);
              (r.damage(h.m, M, i.pos, "shot"),
                this.blood(h.p.x, h.p.y, h.p.z, 7, h.m.def.blood),
                Math.random() < 0.5 && this.spatterBehind(h.p, g, h.m.def.blood));
            });
          } else {
            let M = a.clone().addScaledVector(g, v - 0.01);
            this.impact(M, x, y, t);
          }
        }
        let f = this.camPoint(0.08, -0.06, 0.7);
        (n.addLight(f, [1, 0.7, 0.4], e === "shotgun" ? 9 : 6, 9, 0.07),
          (this.flash.visible = !0),
          (this.flashT = 0.045),
          (this.recoil =
            e === "shotgun" || e === "revolver" || e === "sniper" ? 1 : 0.55),
          (this.recoilHeat = Math.min(
            1,
            (this.recoilHeat || 0) + (t.auto ? 0.12 : 0.3),
          )));
        let d =
          {
            shotgun: 0.05,
            revolver: 0.04,
            sniper: 0.075,
            lmg: 0.012,
            spistol: 0.013,
            rifle: 0.011,
            smg: 0.009,
            pistol: 0.018,
          }[e] ?? 0.015;
        if (
          ((i.pitch = Math.min(1.45, i.pitch + d * (i.stance > 0 ? 0.7 : 1))),
          (i.yaw += (Math.random() - 0.5) * d * 0.4),
          (i.shake = Math.max(
            i.shake,
            e === "shotgun" ? 0.45 : t.auto ? 0.14 : 0.2,
          )),
          e !== "revolver")
        ) {
          let p = this.camPoint(0.14, -0.06, 0.38),
            g = n.camera,
            m = this.tmpV.set(1, 0, 0).applyQuaternion(g.quaternion),
            x = this.tmpV2.set(0, 1, 0).applyQuaternion(g.quaternion),
            v = 1.6 + Math.random(),
            y =
              e === "shotgun"
                ? 0.07
                : e === "rifle" || e === "lmg" || e === "sniper"
                  ? 0.045
                  : 0.022;
          this.casings.spawn(
            p.x,
            p.y,
            p.z,
            m.x * v + x.x * 1.4 + i.vel.x,
            m.y * v + x.y * 1.4 + 0.6,
            m.z * v + x.z * 1.4 + i.vel.z,
            y,
            e === "shotgun" ? [0.7, 0.12, 0.08] : [0.75, 0.55, 0.22],
            0.4,
          );
        }
        (n.audio && n.audio.sfx(e, { vol: 1, important: !0, vary: 0.06 }),
          n.emitNoise(i.pos.x, i.pos.z, t.noise, "gun"),
          n.net && n.net.shot(i.pos, e));
      }
      impact(t, e, n, i) {
        let r = this.game,
          o;
        n === "floor"
          ? (o = { x: 0, y: 1, z: 0 })
          : n === "ceil"
            ? (o = { x: 0, y: -1, z: 0 })
            : e && e.kind === "wall"
              ? (o = { x: e.nx, y: 0, z: e.nz })
              : (o = { x: 0, y: 0, z: 0 });
        for (let c = 0; c < 6; c++)
          this.add.spawn(
            t.x,
            t.y,
            t.z,
            o.x * 2 + (Math.random() - 0.5) * 3,
            o.y * 2 + Math.random() * 2,
            o.z * 2 + (Math.random() - 0.5) * 3,
            1,
            0.7,
            0.35,
            1,
            6,
            0.12 + Math.random() * 0.12,
            9,
            1,
          );
        let a = n === "wall" && e ? this.wallColorAt(t, o) : [0.55, 0.52, 0.45];
        if (
          (this.puff(t.x + o.x * 0.05, t.y, t.z + o.z * 0.05, 5, a),
          n === "wall" || n === "floor" || n === "ceil")
        ) {
          let c = n === "wall" && e && e.edge ? this.onFace(t, e.edge, o) : t;
          this.decal(c, o, Xe.BULLET, 0.09 + Math.random() * 0.05, {
            key: n === "wall" && e ? Wo(e.edge) : null,
          });
          for (let l = 0; l < 2; l++)
            this.debris.spawn(
              t.x + o.x * 0.05,
              t.y,
              t.z + o.z * 0.05,
              o.x * 2 + (Math.random() - 0.5) * 2,
              o.y + Math.random() * 1.5,
              o.z * 2 + (Math.random() - 0.5) * 2,
              0.02 + Math.random() * 0.02,
              a,
            );
        }
        if (n === "wall" && e && e.edge && i && i.wallDmg !== 0) {
          let c = r.fs.map,
            l = Wo(e.edge);
          if (e.value !== 2 && e.value !== 7) {
            let h = i.pellets > 1 ? 0.06 : 0.12,
              u =
                (c.wallHP.has(l)
                  ? c.wallHP.get(l)
                  : c.reinforced.has(l)
                    ? l_
                    : (c_[e.value] ?? 8)) - h;
            u <= 0
              ? this.damageWall(e.edge, e.value, 1, t, o, 30, {})
              : c.wallHP.set(l, u);
          }
        }
        r.audio &&
          Math.random() < 0.5 &&
          r.audio.sfx("ricochet", { pos: t, vol: 0.35, range: 30, vary: 0.4 });
      }
      spatterBehind(t, e, n) {
        let i = this.game,
          r = i.fs.map,
          o = Math.hypot(e.x, e.z) || 1e-4,
          a = ni(r, t.x, t.z, e.x / o, e.z / o, 3, "shot");
        if (a.kind === "wall") {
          let c = a.dist / o,
            l = t.y + e.y * c;
          l > 0.05 &&
            l < i.fs.theme.ceilH - 0.05 &&
            this.decal(
              this.onFace(
                { x: t.x + e.x * c, y: l, z: t.z + e.z * c },
                a.edge,
                { x: a.nx, z: a.nz },
              ),
              { x: a.nx, y: 0, z: a.nz },
              Xe.BLOOD2,
              0.5 + Math.random() * 0.4,
              { tint: n, key: Wo(a.edge) },
            );
        } else this.bloodDecal(t.x + e.x * 1.2, t.z + e.z * 1.2, n, 0.5);
      }
      bloodDecal(t, e, n, i) {
        let r = this.game.fs.map;
        rr(r, t, e) &&
          this.decal(
            { x: t, y: 0.003, z: e },
            { x: 0, y: 1, z: 0 },
            Math.random() < 0.5 ? Xe.BLOOD : Xe.BLOOD2,
            i * (0.7 + Math.random() * 0.6),
            { tint: n },
          );
      }
      puff(t, e, n, i, r) {
        for (let o = 0; o < i; o++)
          this.dust.spawn(
            t,
            e,
            n,
            (Math.random() - 0.5) * 1.2,
            Math.random() * 0.6,
            (Math.random() - 0.5) * 1.2,
            r[0] * 0.6 + 0.12,
            r[1] * 0.6 + 0.12,
            r[2] * 0.6 + 0.12,
            0.32,
            8 + Math.random() * 12,
            0.8 + Math.random() * 0.8,
            -0.08,
            1.5,
            10,
          );
      }
      blood(t, e, n, i, r = [0.12, 0.02, 0.02]) {
        for (let o = 0; o < i; o++)
          this.dust.spawn(
            t,
            e,
            n,
            (Math.random() - 0.5) * 3,
            Math.random() * 2.5,
            (Math.random() - 0.5) * 3,
            r[0],
            r[1],
            r[2],
            0.95,
            6 + Math.random() * 8,
            0.6 + Math.random() * 0.5,
            9.8,
            0.5,
            0,
          );
      }
      fireLauncher(t) {
        let e = this.game,
          n = e.player,
          { o: i, d: r } = this.camRay(),
          o = i.clone().addScaledVector(r, 0.5);
        o.y -= 0.08;
        let a = r.clone().multiplyScalar(30);
        ((a.y += 1),
          this.spawnProj("gl40", t, o, a, { owner: "me" }),
          (this.flash.visible = !0),
          (this.flashT = 0.06),
          e.addLight(
            this.camPoint(0.08, -0.06, 0.6),
            [1, 0.7, 0.4],
            7,
            8,
            0.08,
          ),
          (this.recoil = 1.2),
          (n.pitch = Math.min(1.45, n.pitch + 0.06)),
          (n.shake = Math.max(n.shake, 0.4)),
          e.audio && e.audio.sfx("launcher", { vol: 1, important: !0 }),
          e.emitNoise(n.pos.x, n.pos.z, 55, "gun"));
      }
      throwItem(t, e) {
        let n = this.game,
          i = n.player;
        return i.dead || this.throwAnim || this.useAnim || this.reload
          ? !1
          : i.inDuct
            ? (n.toast(
                "狭くて投げられない",
                900,
              ),
              !1)
            : ((this.throwAnim = {
                type: t,
                def: e || be[t],
                t: 0,
                spawned: !1,
              }),
              this.holdItem(["frag","timerbomb","remotebomb","impactbomb"].includes(t) ? "bomb" : t),
              (this.hitPending = null),
              (this.animKind = null),
              !0);
      }
      updateThrow(t) {
        let e = this.game,
          n = this.throwAnim;
        if (((n.t += t), !n.spawned && n.t >= 0.17))
          if (((n.spawned = !0), n.deploy)) this.placeDeployable(n.type, n.def);
          else {
            let { o: i, d: r } = this.camRay(),
              o = r.clone().multiplyScalar(n.def.speed || 10);
            o.y += 2.4;
            let a = i.clone().addScaledVector(r, 0.45);
            ((a.y -= 0.12),
              (o.x += e.player.vel.x * 0.5),
              (o.z += e.player.vel.z * 0.5),
              this.spawnProj(n.type, n.def, a, o, { owner: "me" }),
              e.audio && e.audio.sfx("throw", { vol: 0.6 }));
          }
        n.t >= 0.5 &&
          ((this.throwAnim = null),
          this.setVM(this.eqType()),
          (this.equipT = 0.2));
      }
      deployGas(t) {
        return this.game.player.dead ||
          this.throwAnim ||
          this.useAnim ||
          this.reload
          ? !1
          : ((this.throwAnim = {
              type: t,
              def: be[t],
              t: 0,
              spawned: !1,
              deploy: !0,
            }),
            this.holdItem(t),
            !0);
      }
      placeDeployable(t, e) {
        let n = this.game,
          i = n.player,
          r = i.pos.x - Math.sin(i.yaw) * 0.6,
          o = i.pos.z - Math.cos(i.yaw) * 0.6,
          a = new L(r, 0.02, o);
        (this.spawnProj(t, e, a, new L(0, 0, 0), { owner: "me", rest: !0 }),
          n.audio && n.audio.sfx("gas_hiss", { pos: a, vol: 0.8, range: 30 }));
      }
      startUseAnim(t, e) {
        ((this.useAnim = { type: t, t: 0, dur: e }),
          this.holdItem(t),
          (this.reload = null),
          (this.hitPending = null),
          (this.animKind = null));
      }
      cancelUseAnim() {
        this.useAnim &&
          ((this.useAnim = null),
          this.setVM(this.eqType()),
          (this.equipT = 0.2));
      }
      finishUseAnim() {
        ((this.useAnim = null),
          this.setVM(this.eqType()),
          (this.equipT = 0.25));
      }
      spawnProj(t, e, n, i, r = {}) {
        let o = this.game,
          a = ["frag","timerbomb","remotebomb","impactbomb"].includes(t) ? "bomb" : t === "gl40" ? "ammo_40mm" : t,
          c = new te(bh(a), this.projMat);
        (c.position.copy(n),
          t === "gl40" && c.scale.setScalar(0.5),
          o.scene.add(c));
        let l = {
          type: t,
          def: e,
          pos: n.clone(),
          vel: i.clone(),
          t: 0,
          mesh: c,
          rest: !!r.rest,
          spin: new L(Math.random() * 10, Math.random() * 10, 0),
          beepT: 0,
          owner: r.owner || "me",
          id: r.id || (Math.random() * 1e9) | 0,
          remote: !!r.remote,
        };
        return (
          this.projs.push(l),
          !r.remote && o.net && o.net.proj(o.fs.depth, l),
          (t === "gas" || t === "gasbig") &&
            o.miasma &&
            o.miasma.addCloud(n.x, n.z, e.radius, e.dur, e.miasma, {
              remote: r.remote,
            }),
          l
        );
      }
      updateProjs(t) {
        let e = this.game,
          n = e.fs && e.fs.map;
        if (!n) return;
        let i = e.fs.theme.ceilH;
        for (let r = this.projs.length - 1; r >= 0; r--) {
          let o = this.projs[r];
          if (((o.t += t), !o.rest)) {
            let c = o.type === "gl40" || o.type === "impactbomb";
            o.vel.y -= (o.type === "gl40" ? 5 : 14) * t;
            let l = Math.hypot(o.vel.x, o.vel.z),
              h = !1;
            if (l > 0.001) {
              let f = l * t,
                d = ni(
                  n,
                  o.pos.x,
                  o.pos.z,
                  o.vel.x / l,
                  o.vel.z / l,
                  f + 0.08,
                  "move",
                );
              d.kind &&
                d.dist <= f + 0.08 &&
                ((h = !0),
                c ||
                  (d.nx
                    ? (o.vel.x = -o.vel.x * 0.4)
                    : d.nz
                      ? (o.vel.z = -o.vel.z * 0.4)
                      : ((o.vel.x *= -0.4), (o.vel.z *= -0.4)),
                  e.audio &&
                    l > 2 &&
                    e.audio.sfx("hit_metal", {
                      vol: 0.25,
                      pos: o.pos,
                      rate: 1.6,
                    })));
            }
            (c &&
              e.monsters &&
              !o.remote &&
              e.monsters.raycast(
                o.pos,
                o.vel.clone().normalize(),
                o.vel.length() * t + 0.2,
              ) &&
              (h = !0),
              (!h || !c) &&
                ((o.pos.x += o.vel.x * t),
                (o.pos.z += o.vel.z * t),
                (o.pos.y += o.vel.y * t)),
              o.pos.y > i - 0.1 &&
                o.vel.y > 0 &&
                ((o.pos.y = i - 0.1), (o.vel.y = -o.vel.y * 0.3), (h = !0)));
            let u = rr(n, o.pos.x, o.pos.z) ? groundY(n, o.pos.x, o.pos.z) + 0.05 : -100;
            if (
              (o.pos.y < u &&
                ((h = !0),
                (o.pos.y = u),
                (o.vel.y = -o.vel.y * 0.3),
                (o.vel.x *= 0.6),
                (o.vel.z *= 0.6),
                Math.abs(o.vel.y) < 0.8 && Math.hypot(o.vel.x, o.vel.z) < 0.6
                  ? ((o.rest = !0), o.vel.set(0, 0, 0))
                  : c ||
                    (e.audio &&
                      e.audio.sfx("hit_metal", {
                        vol: 0.2,
                        pos: o.pos,
                        rate: 1.8,
                      }))),
              c && h && o.t > 0.04)
            ) {
              (o.remote ||
                this.explode(o.pos.clone(), o.def.radius, o.def.dmg, {
                  owner: o.owner,
                }),
                this.removeProj(r));
              continue;
            }
            if (
              ((o.mesh.rotation.x += o.spin.x * t),
              (o.mesh.rotation.y += o.spin.y * t),
              o.pos.y < -20)
            ) {
              this.removeProj(r);
              continue;
            }
          }
          o.mesh.position.copy(o.pos);
          let a = o.def;
          if (o.type === "bomb" || o.type === "frag" || o.type === "timerbomb")
            ((o.beepT -= t),
              o.beepT <= 0 &&
                ((o.beepT = o.type === "frag" ? 0.2 : 0.35),
                e.audio && e.audio.sfx("click", { pos: o.pos, vol: 0.5 }),
                this.add.spawn(
                  o.pos.x,
                  o.pos.y + 0.08,
                  o.pos.z,
                  0,
                  0.3,
                  0,
                  1,
                  0.5,
                  0.2,
                  1,
                  8,
                  0.15,
                )),
              o.t >= a.fuse &&
                (o.remote ||
                  this.explode(o.pos.clone(), a.radius, a.dmg, {
                    owner: o.owner,
                  }),
                this.removeProj(r)));
          else if (o.type === "flash")
            o.t >= a.fuse &&
              (o.remote || this.flashBang(o.pos.clone(), a),
              this.removeProj(r));
          else if (o.type === "buzzer")
            o.rest &&
              ((o.beepT -= t),
              o.beepT <= 0 &&
                ((o.beepT = 0.9),
                e.audio &&
                  e.audio.sfx("beep", { pos: o.pos, vol: 0.9, range: 70 }),
                o.remote || e.emitNoise(o.pos.x, o.pos.z, a.noise, "decoy", !0),
                this.add.spawn(
                  o.pos.x,
                  o.pos.y + 0.05,
                  o.pos.z,
                  0,
                  0,
                  0,
                  1,
                  0.1,
                  0.05,
                  1,
                  10,
                  0.4,
                )),
              o.t > a.dur + 1.5 && this.removeProj(r));
          else if (o.type === "flare")
            (o.light ||
              ((o.light = e.addPersistentLight(
                o.pos,
                [1, 0.22, 0.12],
                2.2,
                10,
              )),
              e.audio &&
                e.audio.sfx("fuse", {
                  pos: o.pos,
                  vol: 0.5,
                  range: 25,
                  rate: 0.8,
                })),
              o.light.pos.copy(o.pos),
              (o.light.pos.y += 0.25),
              (o.light.i =
                2.2 *
                (0.8 + Math.random() * 0.35) *
                Math.min(1, (a.dur - o.t) / 5)),
              Math.random() < t * 30 &&
                this.add.spawn(
                  o.pos.x,
                  o.pos.y + 0.05,
                  o.pos.z,
                  (Math.random() - 0.5) * 0.6,
                  1 + Math.random() * 1.5,
                  (Math.random() - 0.5) * 0.6,
                  1,
                  0.35,
                  0.15,
                  1,
                  7,
                  0.4,
                  2,
                  1,
                ),
              Math.random() < t * 6 &&
                this.dust.spawn(
                  o.pos.x,
                  o.pos.y + 0.2,
                  o.pos.z,
                  (Math.random() - 0.5) * 0.3,
                  0.5 + Math.random() * 0.4,
                  (Math.random() - 0.5) * 0.3,
                  0.7,
                  0.32,
                  0.3,
                  0.18,
                  30,
                  4,
                  -0.05,
                  0.4,
                  25,
                ),
              o.t > a.dur &&
                (e.removePersistentLight(o.light), this.removeProj(r)));
          else if (o.type === "gas" || o.type === "gasbig") {
            if (Math.random() < t * 12) {
              let c = Math.random() * 6.28,
                l = 0.5 + Math.random() * 1.4;
              this.dust.spawn(
                o.pos.x,
                0.2,
                o.pos.z,
                Math.cos(c) * l,
                0.15 + Math.random() * 0.35,
                Math.sin(c) * l,
                0.62,
                0.82,
                0.74,
                0.07,
                30 + Math.random() * 30,
                6 + Math.random() * 4,
                -0.01,
                0.4,
                16,
              );
            }
            o.t > a.dur && this.removeProj(r);
          }
        }
      }
      removeProj(t) {
        let e = this.projs[t];
        (this.game.scene.remove(e.mesh),
          e.light && this.game.removePersistentLight(e.light),
          this.projs.splice(t, 1));
      }
      removeProjById(t) {
        let e = this.projs.findIndex((n) => n.id === t);
        e >= 0 && this.removeProj(e);
      }
      flashBang(t, e, n = {}) {
        let i = this.game,
          r = i.player,
          o = i.fs.map;
        i.addLight(t.clone().setY(t.y + 0.4), [1.4, 1.4, 1.5], 40, 20, 0.35);
        for (let h = 0; h < 40; h++) {
          let u = Math.random() * 6.28,
            f = Math.random() * 1.2,
            d = 3 + Math.random() * 6;
          this.add.spawn(
            t.x,
            t.y + 0.1,
            t.z,
            Math.cos(u) * Math.cos(f) * d,
            Math.sin(f) * d,
            Math.sin(u) * Math.cos(f) * d,
            1,
            1,
            1,
            1,
            8,
            0.25,
            6,
            2,
          );
        }
        for (let h = 0; h < 20; h++)
          this.dust.spawn(
            t.x,
            t.y + 0.2,
            t.z,
            (Math.random() - 0.5) * 2,
            Math.random(),
            (Math.random() - 0.5) * 2,
            0.85,
            0.85,
            0.85,
            0.3,
            40,
            4,
            -0.05,
            1,
            30,
          );
        (i.audio &&
          i.audio.sfx("flashbang", {
            pos: t,
            vol: 1,
            important: !0,
            range: 90,
          }),
          n.remote || i.emitNoise(t.x, t.z, e.noise || 70, "explosion"),
          i.monsters &&
            !n.remote &&
            i.monsters.stunArea(t, e.radius || 13, e.stun || 4.5));
        let a = t.x - r.pos.x,
          c = t.z - r.pos.z,
          l = Math.hypot(a, c);
        if (
          l < (e.radius || 13) &&
          nn(o, r.pos.x, r.pos.z, t.x, t.z) &&
          !r.dead
        ) {
          let h = r.forward,
            u = (h.x * a + h.z * c) / Math.max(0.1, l * Math.hypot(h.x, h.z)),
            f = ke((u + 0.3) / 1.3, 0, 1) * ke(1.2 - l / 14, 0, 1);
          ((i.fx.blind = Math.max(i.fx.blind || 0, f * 1.3)),
            i.audio &&
              i.audio.tinnitus &&
              i.audio.tinnitus(Math.min(1, f + 0.3) * 3));
        }
        !n.remote && i.net && i.net.fx(i.fs.depth, "flash", t);
      }
      explode(t, e, n, i = {}) {
        let r = this.game,
          o = r.player,
          a = r.fs.map;
        ((t.y = Math.max(0.2, t.y)),
          r.addLight(t.clone().setY(t.y + 0.5), [1, 0.55, 0.22], 18, 18, 0.9));
        for (let x = 0; x < 70; x++) {
          let v = Math.random() * Math.PI * 2,
            y = Math.random() * 1.2,
            _ = 4 + Math.random() * 11;
          this.add.spawn(
            t.x,
            t.y,
            t.z,
            Math.cos(v) * Math.cos(y) * _,
            Math.sin(y) * _,
            Math.sin(v) * Math.cos(y) * _,
            1,
            0.55 + Math.random() * 0.3,
            0.2,
            1,
            10 + Math.random() * 10,
            0.3 + Math.random() * 0.4,
            9,
            1.5,
          );
        }
        for (let x = 0; x < 14; x++)
          this.add.spawn(
            t.x,
            t.y + 0.3,
            t.z,
            (Math.random() - 0.5) * 3,
            Math.random() * 2,
            (Math.random() - 0.5) * 3,
            1,
            0.45,
            0.15,
            1,
            150 + Math.random() * 130,
            0.35,
            0,
            2,
            300,
          );
        for (let x = 0; x < 60; x++)
          this.dust.spawn(
            t.x + (Math.random() - 0.5) * 2,
            t.y + Math.random(),
            t.z + (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 5,
            Math.random() * 2,
            (Math.random() - 0.5) * 5,
            0.16,
            0.14,
            0.12,
            0.42,
            34 + Math.random() * 44,
            4 + Math.random() * 4,
            -0.08,
            1.2,
            22,
          );
        for (let x = 0; x < 14; x++)
          this.debris.spawn(
            t.x,
            t.y + 0.2,
            t.z,
            (Math.random() - 0.5) * 9,
            2 + Math.random() * 5,
            (Math.random() - 0.5) * 9,
            0.04 + Math.random() * 0.08,
            [0.25, 0.22, 0.2],
          );
        rr(a, t.x, t.z) &&
          this.decal(
            { x: t.x, y: 0.004, z: t.z },
            { x: 0, y: 1, z: 0 },
            Xe.SCORCH,
            e * 0.75,
            { alpha: 0.95 },
          );
        for (let x = 0; x < 4; x++) {
          let v = (x / 4) * Math.PI * 2 + Math.random() * 0.5,
            y = ni(a, t.x, t.z, Math.cos(v), Math.sin(v), e * 0.6, "shot");
          y.kind === "wall" &&
            this.decal(
              this.onFace(
                {
                  x: t.x + Math.cos(v) * y.dist,
                  y: 0.9 + Math.random() * 0.6,
                  z: t.z + Math.sin(v) * y.dist,
                },
                y.edge,
                { x: y.nx, z: y.nz },
              ),
              { x: y.nx, y: 0, z: y.nz },
              Xe.SCORCH,
              1.6 + Math.random(),
              { alpha: 0.85, key: Wo(y.edge) },
            );
        }
        (r.fs.theme.ceilH < 4.5 &&
          this.decal(
            { x: t.x, y: r.fs.theme.ceilH - 0.004, z: t.z },
            { x: 0, y: -1, z: 0 },
            Xe.SCORCH,
            e * 0.6,
            { alpha: 0.7 },
          ),
          r.audio &&
            r.audio.sfx("explosion", {
              vol: 1,
              pos: t,
              important: !0,
              range: 120,
            }),
          r.emitNoise(t.x, t.z, 140, "explosion"));
        let c = Math.hypot(o.pos.x - t.x, o.pos.z - t.z);
        if (c < e && nn(a, t.x, t.z, o.pos.x, o.pos.z) && !o.dead) {
          r.hurtPlayer(
            n *
              0.5 *
              Math.pow(1 - c / e, 1.2) *
              (i.selfMul ?? 1) *
              (i.owner === "me" || i.selfMul ? (o.stats.blastMul ?? 1) : 1),
            t,
            "explosion",
          );
          let x = 1 - c / e,
            v = (o.pos.x - t.x) / Math.max(c, 0.1),
            y = (o.pos.z - t.z) / Math.max(c, 0.1);
          ((o.vel.x += v * 7 * x), (o.vel.z += y * 7 * x));
        }
        ((o.shake = Math.max(o.shake, ke(1.4 - c / 20, 0.2, 1.4))),
          (r.fx.static = Math.max(r.fx.static, ke(1 - c / 15, 0, 0.6))),
          c < e * 2.2 &&
            r.audio &&
            r.audio.tinnitus &&
            r.audio.tinnitus(ke(1.6 - c / (e * 1.4), 0.2, 1) * 4));
        for (let x of this.debris.items) {
          let v = Math.hypot(x.x - t.x, x.z - t.z);
          v < e &&
            x.rest &&
            ((x.rest = !1),
            (x.vy = 3 * (1 - v / e)),
            (x.vx += ((x.x - t.x) / Math.max(v, 0.2)) * 4),
            (x.vz += ((x.z - t.z) / Math.max(v, 0.2)) * 4));
        }
        if (
          (r.monsters && !i.remote && r.monsters.explosion(t, e, n),
          !i.remote &&
            r.net &&
            r.net.fx(r.fs.depth, "explode", t, { radius: e, dmg: n }),
          i.remote)
        )
          return;
        let l = 4,
          h = e * 0.75,
          u = Math.floor((t.x - h) / l),
          f = Math.floor((t.x + h) / l),
          d = Math.floor((t.z - h) / l),
          p = Math.floor((t.z + h) / l),
          g = [];
        for (let x = d; x <= p; x++)
          for (let v = u; v <= f + 1; v++) {
            if (x < 0 || x >= a.H || v < 0 || v > a.W) continue;
            let y = a.vw[a.vIdx(v, x)];
            if (y === 0 || y === 2 || y === 7) continue;
            let _ = v * l,
              M = ke(t.z, x * l + 0.3, x * l + l - 0.3),
              b = Math.hypot(_ - t.x, M - t.z);
            b < h &&
              nn(a, t.x, t.z, _ + Math.sign(t.x - _) * 0.15, M) &&
              g.push({
                edge: { vert: !0, i: v, j: x },
                v: y,
                p: { x: _, y: 1.2, z: M },
                n: { x: Math.sign(t.x - _) || 1, y: 0, z: 0 },
                dd: b,
              });
          }
        for (let x = d; x <= p + 1; x++)
          for (let v = u; v <= f; v++) {
            if (x < 0 || x > a.H || v < 0 || v >= a.W) continue;
            let y = a.hw[a.hIdx(v, x)];
            if (y === 0 || y === 2 || y === 7) continue;
            let _ = x * l,
              M = ke(t.x, v * l + 0.3, v * l + l - 0.3),
              b = Math.hypot(M - t.x, _ - t.z);
            b < h &&
              nn(a, t.x, t.z, M, _ + Math.sign(t.z - _) * 0.15) &&
              g.push({
                edge: { vert: !1, i: v, j: x },
                v: y,
                p: { x: M, y: 1.2, z: _ },
                n: { x: 0, y: 0, z: Math.sign(t.z - _) || 1 },
                dd: b,
              });
          }
        let m = i.breach ? 999 : 26 * (n / 300);
        for (let x of g)
          this.damageWall(
            x.edge,
            x.v,
            m * ke(1.3 - x.dd / h, 0.35, 1),
            x.p,
            x.n,
            0,
            { quiet: !0 },
          );
      }
      preRender(t) {
        let e = this.game,
          n = e.player,
          i = e.time,
          r = this.curType || "fist",
          o = this.vm,
          a = this.vmGun,
          c = this.throwAnim || this.useAnim ? "hold" : h_(r);
        e.shared.uViewUp.value
          .set(0, 1, 0)
          .applyQuaternion(
            this.tmpQ || (this.tmpQ = new xn()).copy(t.quaternion).invert(),
          );
        let l = this.sway,
          h = n.yaw - l.lastYaw;
        (h > Math.PI && (h -= Math.PI * 2), h < -Math.PI && (h += Math.PI * 2));
        let u = n.pitch - l.lastPitch;
        ((l.lastYaw = n.yaw),
          (l.lastPitch = n.pitch),
          (l.vx += (ke(h * 1.4, -0.08, 0.08) - l.x) * 0.35),
          (l.vy += (ke(-u * 1.4, -0.08, 0.08) - l.y) * 0.35),
          (l.vx *= 0.62),
          (l.vy *= 0.62),
          (l.x += l.vx),
          (l.y += l.vy));
        let f,
          d,
          p,
          g = 0,
          m = 0,
          x = 0;
        c === "grip"
          ? ((f = 0.105),
            (d = -0.098),
            (p = -0.29),
            (m = 0.03),
            Wn[r] && Wn[r].twoHand && ((f = 0.098), (d = -0.102), (p = -0.24)))
          : c === "sword"
            ? ((f = 0.19),
              (d = -0.2),
              (p = -0.33),
              (g = 0.42),
              (x = -0.35),
              (m = 0.12))
            : c === "fist"
              ? ((f = 0.15), (d = -0.13), (p = -0.34), (g = 0.1))
              : ((f = 0.14), (d = -0.115), (p = -0.3), (g = 0.15));
        let v = n.bob,
          y = n.bobAmp;
        ((f += Math.cos(v) * 0.014 * y + l.x * 0.5),
          (d += Math.abs(Math.sin(v)) * 0.016 * y + l.y * 0.5),
          (m += l.x * 1.2),
          (g += l.y * 1.2),
          (d += Math.sin(i * 1.6) * 0.002),
          (x += Math.sin(i * 1.1) * 0.008),
          n.sprinting &&
            !this.animKind &&
            ((g -= 0.3), (m += 0.55), (d -= 0.06), (f += 0.02), (x += 0.2)),
          (n.inDuct || n.stance === 2) && ((d -= 0.03), (x -= 0.15)),
          (d -= this.equipT * 0.75),
          (g -= this.equipT * 0.8));
        let _ = this.animKind ? this.anim / this.animDur : 0,
          M = 0,
          b = 0;
        if (this.animKind === "swing")
          if (r === "fist") {
            let S = Math.max(0, Math.sin(Math.min(1, _ * 1.15) * Math.PI));
            this.swingAlt
              ? (M = -S * 0.24)
              : ((b = -S * 0.24), (f -= S * 0.07), (m -= S * 0.25));
          } else {
            let S =
                _ < 0.3
                  ? -_ / 0.3
                  : _ < 0.45
                    ? -1 + ((_ - 0.3) / 0.15) * 2.2
                    : 1.2 - ((_ - 0.45) / 0.55) * 1.2,
              T = this.swingAlt ? 1 : -1;
            ((g += -S * 0.95),
              (x += S * 0.55 * T),
              (f -= S * 0.07 * T),
              (d += S * 0.06),
              (m += S * 0.35 * T));
          }
        else if (this.animKind === "recoil") {
          let S = Math.exp(-_ * 6) * (this.recoil || 0.6);
          ((p += 0.055 * S * (r === "shotgun" ? 1.6 : 1)),
            (g += 0.16 * S * (r === "shotgun" || r === "revolver" ? 1.8 : 1)),
            (f += (Math.random() - 0.5) * 0.004 * S));
        }
        if (r === "shotgun" && this.vmLeft.visible) {
          let S =
            this.animKind === "recoil"
              ? Math.max(0, Math.sin(ke((_ - 0.25) / 0.6, 0, 1) * Math.PI))
              : 0;
          this.vmLeft.position.z = Wn.shotgun.support[2] + S * 0.09;
        }
        if (this.reload) {
          let S = this.reload,
            T = S.t / S.dur,
            E = Math.sin(Math.min(1, T) * Math.PI);
          ((g -= E * 0.55),
            (x += E * 0.6),
            (d -= E * 0.06),
            (f -= E * 0.03),
            this.vmLeft.visible &&
              (this.vmLeft.position.y =
                (Wn[r].support || [0, 0, 0])[1] -
                Math.sin(ke(T * 2 - 0.3, 0, 1) * Math.PI) * 0.12));
        } else
          this.vmLeft.visible &&
            Wn[r] &&
            Wn[r].support &&
            (this.vmLeft.position.y = Wn[r].support[1]);
        if (this.throwAnim) {
          let S = this.throwAnim.t / 0.5;
          if (this.throwAnim.deploy) {
            let T = Math.sin(Math.min(1, S) * Math.PI);
            ((d -= T * 0.22), (p -= T * 0.1), (g -= T * 0.6));
          } else {
            let T = S < 0.3 ? S / 0.3 : 1 - (S - 0.3) / 0.7;
            ((d += T * 0.08),
              (p +=
                T * 0.06 -
                (S > 0.3 ? Math.sin(((S - 0.3) / 0.7) * Math.PI) * 0.22 : 0)),
              (g -= T * 0.6));
          }
        }
        if (this.useAnim) {
          let S = this.useAnim,
            T = ke(S.t / S.dur, 0, 1),
            E = S.type;
          if (E === "water" || E === "energy" || E === "painkiller") {
            let C = Math.sin(Math.min(1, T * 1.3) * Math.PI);
            ((f -= C * 0.13),
              (d += C * 0.1),
              (p += C * 0.06),
              (g += C * 1.2),
              (x -= C * 0.4));
          } else if (E === "adren") {
            let C = T < 0.45 ? T / 0.45 : 1 - (T - 0.45) / 0.55;
            ((f -= C * 0.05), (d -= C * 0.12), (g -= C * 1.2));
          } else {
            let C = Math.sin(Math.min(1, T * 1.6) * Math.PI);
            ((f -= 0.06 + C * 0.02),
              (d -= 0.04 + Math.sin(i * 9) * 0.01 * C),
              (p += 0.03),
              (g += 0.3));
          }
        }
        if (
          (this.kick > 0 && ((p += this.kick * 0.03), (g += this.kick * 0.1)),
          o.position.set(f, d, p),
          o.rotation.set(g, m, x),
          a.position.set(0, 0, b),
          this.vmFistL.position.set(-0.3, 0, 0.02 + M),
          r === "fist" && !this.throwAnim && !this.useAnim)
        ) {
          let S = this.animKind === "swing" || this.equipT > 0;
          ((this.vmGun.visible = S),
            (this.vmFistL.visible = S),
            S || (this.vmGun.visible = !1));
        } else
          ((this.vmGun.visible = !0),
            (r !== "fist" || this.throwAnim || this.useAnim) &&
              (this.vmFistL.visible = !1));
        this.vmMat.uniforms.uLightAt.value =
          Math.min(1.6, e.localLight ?? 0.6) * 0.9 + 0.08;
        let w = e.shared.uVmLight.value;
        if (this.flash.visible)
          if (((this.flashT -= 1 / 60), this.flashT <= 0))
            ((this.flash.visible = !1), (w.w = 0));
          else {
            let T = (Wn[r] || {}).muzzle || [0, 0.05, -0.3];
            (o.updateMatrix(), a.updateMatrix());
            let E = this.tmpV
              .set(T[0], T[1], T[2] - 0.05)
              .applyMatrix4(a.matrix)
              .applyMatrix4(o.matrix);
            (this.flash.position.copy(E),
              this.flash.rotation.set(0, 0, Math.random() * 6.28),
              this.flash.scale.setScalar(
                (r === "shotgun" ? 1.6 : r === "rifle" ? 1.2 : 0.9) *
                  (0.8 + Math.random() * 0.4),
              ),
              w.set(E.x, E.y, E.z, 1.6));
          }
        else w.w = 0;
        this.flash.visible ||
          (this.recoilHeat = Math.max(0, (this.recoilHeat || 0) - 0.03));
      }
    };
  var f_ = {
    biped: "biped",
    quad: "quad",
    spider: "spider",
    maw: "maw",
    arms: "arms",
    flyer: "flyer",
  };
  function Cc(s) {
    if (!s || !s.id || s.sdf === !1 || !f_[s.rig]) return null;
    let t = { ...s.body, ...(s.sdf || {}) };
    return {
      key: s.rig === "maw" ? s.id + ":" + Math.round(t.ceil * 10) : s.id,
      kind: f_[s.rig],
      params: t,
    };
  }
  function Fd(s, t = 0) {
    let e = Cc(s);
    e && di.request(e.key, e.kind, e.params, t);
  }
  function d_(s) {
    let t = Cc(s);
    return !!(t && di.get(t.key));
  }
  var Qi = new Map();
  function pn(s, t, e, n = 9) {
    let i = [s, t, e, n].map((c) => c.toFixed(3)).join(",");
    if (Qi.has(i)) return Qi.get(i);
    let r = [],
      o = 4;
    for (let c = 0; c <= o; c++) {
      let l = -Math.PI / 2 + ((c / o) * Math.PI) / 2;
      r.push(new ut(Math.max(1e-4, e * Math.cos(l)), -s + e * Math.sin(l)));
    }
    for (let c = 1; c <= o; c++) {
      let l = ((c / o) * Math.PI) / 2;
      r.push(new ut(Math.max(1e-4, t * Math.cos(l)), t * Math.sin(l)));
    }
    let a = new _o(r, n);
    return (a.computeVertexNormals(), Qi.set(i, a), a);
  }
  function Ve(s, t = 12, e = 9) {
    let n = "s" + s.toFixed(3) + t + e;
    if (Qi.has(n)) return Qi.get(n);
    let i = new ws(s, t, e);
    return (Qi.set(n, i), i);
  }
  function Xo(s, t, e) {
    let n = "b" + [s, t, e].map((r) => r.toFixed(3)).join(",");
    if (Qi.has(n)) return Qi.get(n);
    let i = new Vn(s, t, e);
    return (Qi.set(n, i), i);
  }
  var Dd = null;
  function p_() {
    if (Dd) return Dd;
    let s = document.createElement("canvas");
    s.width = s.height = 64;
    let t = s.getContext("2d"),
      e = t.createRadialGradient(32, 32, 2, 32, 32, 31);
    return (
      e.addColorStop(0, "rgba(0,0,0,0.75)"),
      e.addColorStop(0.6, "rgba(0,0,0,0.35)"),
      e.addColorStop(1, "rgba(0,0,0,0)"),
      (t.fillStyle = e),
      t.fillRect(0, 0, 64, 64),
      (Dd = new Si(s)),
      Dd
    );
  }
  function Ae(s, t = 0, e = 0, n = 0) {
    let i = new Me();
    return (i.position.set(t, e, n), s.add(i), i);
  }
  function ne(s, t, e, n = 0, i = 0, r = 0, o = 1, a = 1, c = 1) {
    let l = new te(t, e);
    return (l.position.set(n, i, r), l.scale.set(o, a, c), s.add(l), l);
  }
  function kA(s, t, e, n, i, r) {
    let o = t,
      a = i || t,
      c = r || t,
      l = s.height,
      h = l * (s.leg ?? 0.47),
      u = h * 0.52,
      f = h * 0.48,
      d = l * (s.torso ?? 0.3),
      p = l * (s.neck ?? 0.055),
      g = l * (s.head ?? 0.065),
      m = l * (s.arm ?? 0.43),
      x = m * 0.47,
      v = m * 0.53,
      y = l * (s.shoulder ?? 0.12),
      _ = l * (s.hips ?? 0.07),
      M = s.thick ?? 1,
      b = new Me(),
      w = { type: "biped", root: b, p: s, H: l, legLen: h };
    ((w.hips = Ae(b, 0, h, 0)),
      ne(
        w.hips,
        Ve(1, 10, 8),
        c,
        0,
        0,
        0,
        _ * 1.35 * M,
        l * 0.06 * M,
        l * 0.075 * M,
      ),
      (w.spine = Ae(w.hips, 0, 0.02 * l, 0)),
      (w.spine.rotation.x = s.hunch ?? 0),
      ne(
        w.spine,
        pn(d * 0.8, l * 0.095 * M, l * 0.075 * M),
        a,
        0,
        d * 0.85,
        0,
        1,
        1,
        s.flat ?? 0.72,
      ),
      (w.chest = Ae(w.spine, 0, d, 0)),
      (w.neck = Ae(w.chest, 0, 0, 0)),
      ne(w.neck, pn(p, l * 0.03 * M, l * 0.033 * M, 7), o, 0, p, 0),
      (w.head = Ae(w.neck, 0, p, 0)));
    let S = s.headScale || [1, 1.18, 1.05];
    if (
      ((w.headMesh = ne(
        w.head,
        Ve(g, 16, 12),
        n && s.headMat ? n : o,
        0,
        g * 0.95,
        g * 0.05,
        S[0],
        S[1],
        S[2],
      )),
      s.jaw &&
        ne(w.head, Ve(g * 0.8, 10, 8), o, 0, g * 0.15, g * 0.35, 0.9, 0.55, 1),
      s.sockets)
    ) {
      let E = new Hn({ color: 197122 });
      ((w.sockMat = E),
        ne(
          w.head,
          Ve(g * 0.62, 12, 8),
          o,
          0,
          g * 0.42,
          g * 0.42,
          0.78,
          0.62,
          0.78,
        ));
      for (let C of [-1, 1]) {
        let R = ne(
          w.head,
          Ve(g * 0.24, 10, 8),
          E,
          C * g * 0.34,
          g * 1.1,
          g * 0.8 * S[2],
          1,
          0.82,
          0.45,
        );
        ((R.rotation.z = C * 0.25),
          ne(
            w.head,
            Ve(g * 0.28, 10, 6),
            o,
            C * g * 0.34,
            g * 1.34,
            g * 0.78 * S[2],
            1.15,
            0.42,
            0.5,
          ));
      }
      ne(
        w.head,
        Ve(g * 0.2, 10, 8),
        E,
        0,
        g * 0.4,
        g * 0.86 * S[2],
        0.75,
        1.15,
        0.45,
      );
    }
    if (
      (s.bandage &&
        n &&
        ne(
          w.head,
          Ve(g * 1.04, 12, 8),
          n,
          0,
          g * 1.05,
          g * 0.05,
          S[0],
          S[1] * 0.75,
          S[2],
        ),
      s.eyes && e)
    )
      for (let E of [-1, 1])
        ne(
          w.head,
          Ve(g * s.eyes.size, 8, 6),
          e,
          E * g * 0.36,
          g * 1.05,
          g * 0.92 * S[2],
        );
    if (s.smile && e) {
      let E = ne(
        w.head,
        Xo(g * 1.25, g * 0.16, g * 0.2),
        e,
        0,
        g * 0.55,
        g * 0.98 * S[2],
      );
      E.rotation.z = 0;
      for (let C = -3; C <= 3; C++)
        ne(
          w.head,
          Xo(g * 0.06, g * 0.12, g * 0.12),
          o,
          C * g * 0.17,
          g * 0.55,
          g * 1.06 * S[2],
        );
    }
    let T = (E) => {
      let C = {};
      return (
        (C.root = Ae(w.chest, E * y, -l * 0.02, 0)),
        ne(C.root, Ve(l * 0.034 * M, 8, 6), a),
        (C.up = Ae(C.root, 0, 0, 0)),
        (C.up.rotation.z = E * (s.armSpread ?? 0.12)),
        ne(C.up, pn(x, l * 0.036 * M, l * 0.03 * M), a),
        (C.el = Ae(C.up, 0, -x, 0)),
        ne(C.el, pn(v, l * 0.03 * M, l * 0.022 * M), s.shortSleeve ? o : a),
        (C.hand = Ae(C.el, 0, -v, 0)),
        ne(
          C.hand,
          pn(l * (s.fingers ?? 0.06), l * 0.024 * M, l * 0.012 * M, 6),
          o,
          0,
          -l * 0.01,
          0,
          1,
          1,
          0.6,
        ),
        C
      );
    };
    if (
      ((w.armL = T(-1)),
      (w.armR = T(1)),
      s.fourArms &&
        ((w.armL2 = T(-1)),
        (w.armR2 = T(1)),
        (w.armL2.root.position.y -= l * 0.1),
        (w.armR2.root.position.y -= l * 0.1)),
      s.weapon === "cleaver")
    ) {
      let E = ne(w.armR.hand, Xo(0.04, 0.42, 0.16), n || o, 0, -0.25, 0.06);
      E.rotation.x = 0.2;
    }
    if (s.noLegs)
      ne(w.hips, pn(h * 0.9, l * 0.08 * M, l * 0.01, 8), c, 0, 0, 0);
    else {
      let E = (C) => {
        let R = {};
        return (
          (R.th = Ae(w.hips, C * _, 0, 0)),
          ne(R.th, pn(u, l * 0.05 * M, l * 0.038 * M), c),
          (R.kn = Ae(R.th, 0, -u, 0)),
          ne(R.kn, pn(f, l * 0.037 * M, l * 0.027 * M), s.skirt ? o : c),
          (R.an = Ae(R.kn, 0, -f, 0)),
          ne(
            R.an,
            Xo(l * 0.045 * M, l * 0.03, l * 0.12),
            (s.shoe && r) || o,
            0,
            -l * 0.012,
            l * 0.035,
          ),
          R
        );
      };
      ((w.legL = E(-1)), (w.legR = E(1)));
    }
    return w;
  }
  function LA(s, t, e) {
    let n = s.p,
      i = s.H,
      r = t.phase,
      o = t.speed,
      a = t.moving,
      c = (0.32 + 0.5 * o) * a,
      l = Math.sin(r),
      h = Math.cos(r),
      u = n.stiff ? 0.35 : 1;
    (s.legL &&
      ((s.legL.th.rotation.x = -l * c * u),
      (s.legR.th.rotation.x = l * c * u),
      (s.legL.kn.rotation.x =
        Math.max(0, Math.sin(r + 1.6)) * c * 1.5 * u + 0.05),
      (s.legR.kn.rotation.x =
        Math.max(0, Math.sin(r + 1.6 + Math.PI)) * c * 1.5 * u + 0.05),
      (s.legL.an.rotation.x = -s.legL.kn.rotation.x * 0.4),
      (s.legR.an.rotation.x = -s.legR.kn.rotation.x * 0.4)),
      s.legL
        ? (s.hips.position.y =
            s.legLen - Math.abs(h) * 0.035 * i * a * (0.5 + o))
        : (s.hips.position.y = i * 0.42 + Math.sin(t.t * 1.7) * 0.06),
      (s.hips.rotation.y = l * 0.08 * a),
      (s.spine.rotation.x =
        (n.hunch ?? 0) + o * 0.28 * a + Math.sin(t.t * 1.3) * 0.02),
      (s.spine.rotation.z = l * 0.05 * a));
    let f = c * (n.armSwing ?? 0.9) * u,
      d = s.armL,
      p = s.armR;
    if (
      ((d.up.rotation.x = l * f + (n.armsForward ?? 0)),
      (p.up.rotation.x = -l * f + (n.armsForward ?? 0)),
      (d.el.rotation.x = -0.25 - o * 0.6 * a),
      (p.el.rotation.x = -0.25 - o * 0.6 * a),
      (d.up.rotation.z = -(n.armSpread ?? 0.12)),
      (p.up.rotation.z = n.armSpread ?? 0.12),
      s.armL2 &&
        ((s.armL2.up.rotation.x = -l * f * 0.7 - 0.5 + Math.sin(t.t * 3) * 0.3),
        (s.armR2.up.rotation.x = l * f * 0.7 - 0.5 + Math.sin(t.t * 3.4) * 0.3),
        (s.armL2.up.rotation.z = -0.5),
        (s.armR2.up.rotation.z = 0.5),
        (s.armL2.el.rotation.x = -1),
        (s.armR2.el.rotation.x = -1)),
      t.attack > 0)
    ) {
      let m = t.attack,
        x = m < 0.5 ? m / 0.5 : 1 - (m - 0.5) / 0.5;
      if (n.weapon || n.attack === "smash") {
        let v = m < 0.45 ? -2.6 * (m / 0.45) : -2.6 + ((m - 0.45) / 0.55) * 2.8;
        ((p.up.rotation.x = v),
          (p.el.rotation.x = -0.6 * x),
          n.weapon ||
            ((d.up.rotation.x = v * 0.9), (d.el.rotation.x = -0.5 * x)),
          (s.spine.rotation.x += x * 0.25));
      } else {
        let v = m < 0.4 ? m / 0.4 : m < 0.65 ? 1 : 1 - (m - 0.65) / 0.35;
        ((d.up.rotation.x = p.up.rotation.x =
          -1.45 * v + (n.armsForward ?? 0) * (1 - v)),
          (d.up.rotation.z = -0.1 - 0.25 * (1 - v)),
          (p.up.rotation.z = 0.1 + 0.25 * (1 - v)),
          (d.el.rotation.x = p.el.rotation.x = -0.25 - 0.5 * (1 - v)),
          (s.spine.rotation.x += v * 0.18));
      }
    }
    let g = (n.tilt ?? 0) * (t.aware ? 0.6 : 1) + Math.sin(t.t * 0.7) * 0.05;
    ((s.neck.rotation.x =
      -s.spine.rotation.x * 0.9 - t.lookPitch * 0.85 + (t.aware ? 0 : 0.28)),
      (s.neck.rotation.y = t.lookYaw * 0.6),
      (s.neck.rotation.z = g),
      t.twitch > 0 &&
        ((s.neck.rotation.z += (Math.random() - 0.5) * 0.6 * t.twitch),
        (s.neck.rotation.y += (Math.random() - 0.5) * 0.5 * t.twitch),
        (d.el.rotation.x += (Math.random() - 0.5) * 0.6 * t.twitch)),
      s.chest.scale.set(
        1,
        1 + Math.sin(t.t * 2.2) * 0.015,
        1 + Math.sin(t.t * 2.2) * 0.02,
      ));
  }
  function IA(s, t, e, n) {
    let i = s.len,
      r = s.legH,
      o = s.bodyR,
      a = s.thick ?? 1,
      c = new Me(),
      l = { type: "quad", root: c, p: s };
    l.body = Ae(c, 0, r, 0);
    let h = ne(l.body, pn(i, o, o * (s.taper ?? 0.85)), t, 0, 0, i / 2);
    ((h.rotation.x = Math.PI / 2),
      h.scale.set(1, 1, s.flat ?? 0.8),
      (l.legs = []));
    let u = (p, g, m) => {
        let x = { front: m };
        x.up = Ae(l.body, p, -o * 0.2, g);
        let v = r * (s.upper ?? 0.55),
          y = r * (1 - (s.upper ?? 0.55)) + o * 0.2;
        return (
          ne(x.up, pn(v, s.legR * 1.2 * a, s.legR * a), t),
          (x.lo = Ae(x.up, 0, -v, 0)),
          ne(x.lo, pn(y, s.legR * a, s.legR * 0.65 * a), t),
          s.hands &&
            ((x.hand = Ae(x.lo, 0, -y, 0)),
            ne(
              x.hand,
              pn(s.legR * 3, s.legR * 0.8, s.legR * 0.4, 6),
              t,
              0,
              0,
              0,
              1,
              1,
              0.5,
            ),
            (x.hand.rotation.x = m ? -1.2 : 1.2)),
          l.legs.push(x),
          x
        );
      },
      f = s.width ?? o * 0.85;
    (u(-f, i * 0.42, !0),
      u(f, i * 0.42, !0),
      u(-f, -i * 0.42, !1),
      u(f, -i * 0.42, !1),
      (l.neck = Ae(l.body, 0, o * 0.2, i * 0.48)),
      (l.neck.rotation.x = s.neckPitch ?? -0.5),
      ne(l.neck, pn(s.neckL, o * 0.45, o * 0.4, 8), t, 0, s.neckL, 0),
      (l.head = Ae(l.neck, 0, s.neckL, 0)),
      (l.head.rotation.x = -(s.neckPitch ?? -0.5) + (s.headPitch ?? 0)));
    let d = s.headR;
    if (
      (ne(
        l.head,
        Ve(d, 12, 9),
        s.headMat && n ? n : t,
        0,
        0,
        d * 0.4,
        s.headScale?.[0] ?? 1,
        s.headScale?.[1] ?? 0.9,
        s.headScale?.[2] ?? 1.4,
      ),
      s.jaw &&
        ((l.jaw = Ae(l.head, 0, -d * 0.3, d * 0.3)),
        ne(
          l.jaw,
          Ve(d * 0.8, 10, 7),
          t,
          0,
          -d * 0.15,
          d * 0.5,
          0.85,
          0.4,
          1.3,
        )),
      s.eyes && e)
    )
      for (let p of [-1, 1])
        ne(
          l.head,
          Ve(d * s.eyes.size, 8, 6),
          e,
          p * d * 0.45,
          d * 0.25,
          d * 1.25,
        );
    return (
      s.tail &&
        ((l.tail = Ae(l.body, 0, 0, -i * 0.5)),
        (l.tail.rotation.x = -2.3),
        ne(l.tail, pn(s.tail, o * 0.3, o * 0.05, 6), t)),
      l
    );
  }
  function DA(s, t) {
    let e = s.p,
      n = t.moving,
      i = t.speed,
      r = (0.35 + 0.45 * i) * n,
      o = [0, Math.PI, Math.PI, 0];
    (s.legs.forEach((a, c) => {
      let l = t.phase + o[c] + (e.gallop ? (c < 2 ? 0 : 0.6) : 0);
      ((a.up.rotation.x =
        Math.sin(l) * r * (a.front, -1) +
        (a.front ? (e.frontRest ?? 0) : (e.backRest ?? 0))),
        (a.lo.rotation.x =
          (a.front ? -1 : 1) * Math.max(0, Math.sin(l + 1.5)) * r * 1.3 +
          (a.front ? (e.frontKnee ?? 0) : (e.backKnee ?? 0))));
    }),
      (s.body.position.y =
        e.legH - Math.abs(Math.cos(t.phase)) * 0.04 * n * (1 + i)),
      (s.body.rotation.x =
        Math.sin(t.phase * 2) * 0.03 * n + (e.bodyPitch ?? 0)),
      (s.body.rotation.z = Math.sin(t.phase) * 0.04 * n),
      (s.neck.rotation.y =
        t.lookYaw * 0.5 +
        (t.twitch > 0 ? (Math.random() - 0.5) * 0.5 * t.twitch : 0)),
      (s.neck.rotation.x =
        (e.neckPitch ?? -0.5) -
        t.lookPitch * 0.4 +
        Math.sin(t.phase * 2) * 0.05 * n),
      s.jaw &&
        (s.jaw.rotation.x =
          t.attack > 0
            ? Math.sin(t.attack * Math.PI) * 0.7
            : 0.05 + Math.sin(t.t * 3) * 0.04),
      t.attack > 0 &&
        ((s.body.rotation.x -= Math.sin(t.attack * Math.PI) * 0.25),
        (s.legs[0].up.rotation.x -= Math.sin(t.attack * Math.PI) * 0.9),
        (s.legs[1].up.rotation.x -= Math.sin(t.attack * Math.PI) * 0.9)),
      s.tail && (s.tail.rotation.z = Math.sin(t.t * 6) * 0.3));
  }
  function NA(s, t, e) {
    let n = new Me(),
      i = { type: "spider", root: n, p: s, legs: [] };
    if (
      ((i.body = Ae(n, 0, s.h, 0)),
      ne(i.body, Ve(s.bodyR, 12, 9), t, 0, 0, -s.bodyR * 0.6, 1, 0.75, 1.35),
      (i.head = Ae(i.body, 0, 0, s.bodyR * 0.6)),
      ne(
        i.head,
        Ve(s.bodyR * 0.55, 10, 8),
        t,
        0,
        0,
        s.bodyR * 0.2,
        1,
        0.8,
        1.1,
      ),
      s.face &&
        ne(
          i.head,
          Ve(s.bodyR * 0.5, 10, 8),
          t,
          0,
          s.bodyR * 0.25,
          s.bodyR * 0.55,
          0.8,
          1,
          0.6,
        ),
      e)
    )
      for (let o = 0; o < (s.eyes || 4); o++)
        ne(
          i.head,
          Ve(s.bodyR * 0.07, 6, 4),
          e,
          (o - (s.eyes || 4) / 2 + 0.5) * s.bodyR * 0.16,
          s.bodyR * 0.15,
          s.bodyR * 0.62,
        );
    let r = s.n || 8;
    for (let o = 0; o < r; o++) {
      let a = o < r / 2 ? -1 : 1,
        c = o % (r / 2),
        l = (c / (r / 2 - 1) - 0.5) * s.bodyR * 1.6,
        h = { side: a, k: c };
      ((h.hip = Ae(i.body, a * s.bodyR * 0.6, 0, l)),
        (h.hip.rotation.y =
          a * (Math.PI / 2) + (c / (r / 2 - 1) - 0.5) * 1.2 * a),
        (h.up = Ae(h.hip, 0, 0, 0)),
        (h.up.rotation.z = 0));
      let u = ne(h.up, pn(s.legA, s.legR, s.legR * 0.8, 6), t);
      ((u.rotation.x = Math.PI / 2),
        (h.up.rotation.x = -(s.lift ?? 0.9)),
        (h.lo = Ae(h.up, 0, 0, s.legA)));
      let f = ne(h.lo, pn(s.legB, s.legR * 0.8, s.legR * 0.35, 6), t);
      ((f.rotation.x = Math.PI / 2),
        (h.lo.rotation.x = s.bend ?? 2),
        i.legs.push(h));
    }
    return i;
  }
  function FA(s, t) {
    let e = s.p,
      n = t.moving;
    (s.legs.forEach((i, r) => {
      let o = t.phase * 1.3 + ((r + (i.side > 0 ? 1 : 0)) % 2) * Math.PI;
      ((i.up.rotation.x =
        -(e.lift ?? 0.9) - Math.max(0, Math.sin(o)) * 0.45 * n),
        (i.hip.rotation.y =
          i.side * (Math.PI / 2) +
          (i.k / (s.legs.length / 2 - 1) - 0.5) * 1.2 * i.side +
          Math.cos(o) * 0.35 * n * i.side));
    }),
      (s.body.position.y =
        e.h + Math.sin(t.phase * 2.6) * 0.015 * n + Math.sin(t.t * 2) * 0.01),
      (s.head.rotation.y = t.lookYaw * 0.4),
      t.attack > 0
        ? (s.body.rotation.x = -Math.sin(t.attack * Math.PI) * 0.5)
        : (s.body.rotation.x = 0));
  }
  function UA(s, t, e) {
    let n = new Me(),
      i = { type: "flyer", root: n, p: s };
    i.body = Ae(n, 0, 0, 0);
    let r = ne(i.body, pn(s.len, s.r, s.r * 0.4), t, 0, 0, s.len * 0.5);
    if (
      ((r.rotation.x = Math.PI / 2),
      (i.head = Ae(i.body, 0, 0, s.len * 0.55)),
      ne(i.head, Ve(s.r * 0.8, 10, 8), t, 0, 0, s.r * 0.4, 1, 0.8, 1.3),
      e)
    )
      for (let o of [-1, 1])
        ne(
          i.head,
          Ve(s.r * 0.14, 6, 4),
          e,
          o * s.r * 0.35,
          s.r * 0.2,
          s.r * 0.95,
        );
    i.wings = [];
    for (let o of [-1, 1]) {
      let a = Ae(i.body, o * s.r * 0.7, s.r * 0.3, s.len * 0.15),
        c = ne(
          a,
          Xo(s.span, 0.012, s.len * 0.8),
          t,
          (o * s.span) / 2,
          0,
          -s.len * 0.1,
        ),
        l = Ae(a, o * s.span, 0, 0);
      (ne(
        l,
        Xo(s.span * 0.8, 0.01, s.len * 0.55),
        t,
        o * s.span * 0.4,
        0,
        -s.len * 0.2,
      ),
        i.wings.push({ w: a, w2: l, s: o }));
    }
    for (let o of [-1, 1]) {
      let a = Ae(i.body, o * s.r * 0.4, -s.r * 0.5, -s.len * 0.1),
        c = ne(a, pn(s.len * 0.5, s.r * 0.15, s.r * 0.06, 6), t);
      a.rotation.x = 0.6;
    }
    return i;
  }
  function OA(s, t) {
    let e = Math.sin(t.t * (8 + t.speed * 6));
    (s.wings.forEach((n) => {
      ((n.w.rotation.z = n.s * (e * 0.8 + 0.1)),
        (n.w2.rotation.z = n.s * (e * 0.5)));
    }),
      (s.body.rotation.x =
        -t.speed * 0.3 +
        (t.attack > 0 ? 0.8 * Math.sin(t.attack * Math.PI) : 0)),
      (s.body.position.y = e * 0.05));
  }
  function zA(s, t, e, n) {
    let i = new Me(),
      r = { type: "maw", root: i, p: s, segs: [] };
    ((r.top = Ae(i, 0, s.ceil, 0)),
      ne(r.top, Ve(0.5, 14, 10), t, 0, -0.05, 0, 1.3, 0.45, 1.1));
    for (let l = 0; l < 7; l++) {
      let h = (l / 7) * Math.PI * 2;
      ne(
        r.top,
        Ve(0.18 + (l % 3) * 0.05, 10, 8),
        t,
        Math.cos(h) * 0.45,
        -0.08 - (l % 2) * 0.05,
        Math.sin(h) * 0.4,
        1,
        0.7,
        1,
      );
    }
    ne(r.top, Ve(0.2, 10, 8), n || t, 0, -0.2, 0, 1, 0.45, 1);
    let o = Ae(r.top, 0, -0.25, 0),
      a = 8,
      c = (s.ceil - s.tip - 0.25) / a;
    for (let l = 0; l < a; l++) {
      let h = Ae(o, 0, l === 0 ? 0 : -c, 0);
      (ne(h, pn(c, 0.035 - l * 0.002, 0.03 - l * 0.002, 6), n || t),
        r.segs.push(h),
        (o = h));
    }
    return ((r.tipJ = Ae(o, 0, -c, 0)), ne(r.tipJ, Ve(0.06, 8, 6), n || t), r);
  }
  function BA(s, t) {
    s.segs.forEach((n, i) => {
      ((n.rotation.x = Math.sin(t.t * 1.1 + i * 0.5) * 0.04),
        (n.rotation.z = Math.cos(t.t * 0.9 + i * 0.6) * 0.04));
    });
    let e = t.attack;
    (s.top.scale.set(
      1 + Math.sin(t.t * 2) * 0.03,
      1,
      1 + Math.cos(t.t * 2) * 0.03,
    ),
      s.segs.forEach((n) => {
        n.scale.y = 1 - e * 0.8;
      }));
  }
  function HA(s, t) {
    let e = new Me(),
      n = { type: "arms", root: e, p: s, arms: [] };
    for (let i = 0; i < 3; i++) {
      let r = {},
        o = (i / 3) * Math.PI * 2;
      ((r.base = Ae(e, Math.cos(o) * 0.4, s.base, Math.sin(o) * 0.4)),
        (r.up = Ae(r.base, 0, 0, 0)),
        ne(r.up, pn(0.45, 0.045, 0.035), t, 0, 0.45, 0),
        (r.el = Ae(r.up, 0, 0.45, 0)),
        ne(r.el, pn(0.4, 0.035, 0.025), t, 0, 0.4, 0),
        (r.hand = Ae(r.el, 0, 0.4, 0)),
        ne(r.hand, pn(0.12, 0.03, 0.012, 6), t, 0, 0.1, 0, 1, 1, 0.5),
        (r.ang = o),
        n.arms.push(r));
    }
    return (
      (n.headJ = Ae(e, 0, s.base + 0.05, 0)),
      ne(n.headJ, Ve(0.15, 10, 8), t, 0, 0, 0, 1, 1.1, 1),
      n
    );
  }
  function VA(s, t) {
    let e = t.attack > 0 ? 1 : t.moving > 0 ? 0.6 : 0.25;
    (s.arms.forEach((n, i) => {
      ((n.up.rotation.z = Math.sin(t.t * 1.5 + i * 2) * 0.4),
        (n.up.rotation.x = Math.cos(t.t * 1.2 + i) * 0.4 - e * 0.4),
        (n.el.rotation.x = -0.6 + Math.sin(t.t * 2 + i) * 0.4),
        (n.base.position.y = s.p.base - 0.6 + e * 0.6));
    }),
      (s.headJ.position.y = s.p.base - 0.15 + e * 0.12));
  }
  function GA() {
    if (Qi.has("cleaver")) return Qi.get("cleaver");
    let s = new Vn(0.012, 0.34, 0.15);
    s.translate(0, -0.35, 0.035);
    let t = new Vn(0.016, 0.34, 0.018);
    t.translate(0, -0.35, -0.035);
    let e = new Vn(0.024, 0.17, 0.032);
    e.translate(0, -0.1, -0.03);
    let n = WA([s, t, e]);
    return (Qi.set("cleaver", n), n);
  }
  function WA(s) {
    let t = 0;
    for (let o of s) t += o.index.count;
    let e = new Float32Array(t * 3),
      n = new Float32Array(t * 3),
      i = 0;
    for (let o of s) {
      let a = o.attributes.position,
        c = o.attributes.normal,
        l = o.index;
      for (let h = 0; h < l.count; h++, i++) {
        let u = l.getX(h);
        ((e[i * 3] = a.getX(u)),
          (e[i * 3 + 1] = a.getY(u)),
          (e[i * 3 + 2] = a.getZ(u)),
          (n[i * 3] = c.getX(u)),
          (n[i * 3 + 1] = c.getY(u)),
          (n[i * 3 + 2] = c.getZ(u)));
      }
    }
    let r = new Vt();
    return (
      r.setAttribute("position", new Kt(e, 3)),
      r.setAttribute("normal", new Kt(n, 3)),
      r
    );
  }
  function m_(s, t, e, n) {
    let i = On(s, {
        vcol: !0,
        color: [1, 1, 1],
        color2: n.color2 || [0.2, 0.05, 0.05],
        rough: n.rough ?? 0.6,
        skin: 0,
        wet: n.wet ?? 0.2,
        sss: n.sss ?? 0.3,
        rim: n.rim ?? 0.25,
        wobble: n.wobble ?? 0,
        opacity: n.opacity ?? 1,
        dirt: n.dirt ?? 0.45,
      }),
      r = new Me();
    r.rotation.order = "YXZ";
    let o = e.bones.map((d) => {
      let p = new Ks();
      return (
        (p.name = d.name),
        p.position.fromArray(d.pos),
        d.rot && p.rotation.set(d.rot[0], d.rot[1], d.rot[2]),
        p
      );
    });
    (e.bones.forEach((d, p) => {
      d.parent >= 0 ? o[d.parent].add(o[p]) : r.add(o[p]);
    }),
      r.updateMatrixWorld(!0));
    let a = new Rr(o),
      c = {};
    for (let d of o) c[d.name] = d;
    let l = e.meta.H || t.height || 1,
      h = e.geos.map((d, p) => {
        let g = new Cr(d, i);
        return (
          g.bind(a, new Qt()),
          (g.boundingSphere = new Qe(new L(0, l * 0.5, 0), l + 0.6)),
          (g.visible = p === 0),
          r.add(g),
          g
        );
      }),
      u = {
        type: t.rig,
        root: r,
        p: n,
        sdf: !0,
        skeleton: a,
        lodMeshes: h,
        lod: 0,
        mat: i,
        mats: [i],
        lodDist: Math.max(3.5, Math.min(10, l * 4.5)),
        H: l,
      },
      f =
        n.eyes || n.glow
          ? yh(s, (n.eyes && n.eyes.color) || n.glow || [1, 1, 1], {
              intensity: (n.eyes && n.eyes.i) || 5,
            })
          : null;
    if (((u.eyeMat = f), t.rig === "biped")) {
      ((u.legLen = e.meta.legLen),
        (u.headR = e.meta.headR),
        (u.hips = c.hips),
        (u.spine = c.spine),
        (u.chest = c.chest),
        (u.neck = c.neck),
        (u.head = c.head));
      let d = (g) => ({
        root: c[g + ".root"],
        up: c[g + ".up"],
        el: c[g + ".el"],
        hand: c[g + ".hand"],
      });
      if (
        ((u.armL = d("armL")),
        (u.armR = d("armR")),
        c["armL2.up"] && ((u.armL2 = d("armL2")), (u.armR2 = d("armR2"))),
        c["legL.th"])
      ) {
        let g = (m) => ({
          th: c[m + ".th"],
          kn: c[m + ".kn"],
          an: c[m + ".an"],
        });
        ((u.legL = g("legL")), (u.legR = g("legR")));
      }
      let p = u.headR;
      if (f && n.eyes)
        for (let g of [-1, 1])
          ne(
            u.head,
            Ve(p * n.eyes.size * 0.85, 10, 8),
            f,
            g * p * 0.34,
            p * 1.04,
            p * 0.84,
          );
      if (f && n.smile)
        for (let m = 0; m < 13; m++) {
          let x = m / 12 - 0.5,
            v = x * 1.15 * p,
            y = ne(
              u.head,
              Xo(p * 0.075, p * (0.13 - Math.abs(x) * 0.08), p * 0.05),
              f,
              v,
              p * (0.52 + x * x * 0.55),
              p * (0.93 - x * x * 0.85),
            );
          y.rotation.y = x * 1.6;
        }
      if (n.weapon === "cleaver") {
        ((u.extraMat = On(s, {
          color: n.extra || [0.35, 0.33, 0.32],
          color2: [0.3, 0.02, 0.02],
          rough: 0.38,
          metal: 0.8,
          skin: 0,
          dirt: 0.8,
        })),
          u.mats.push(u.extraMat));
        let g = ne(u.armR.hand, GA(), u.extraMat, 0, 0.02, 0.03);
        g.rotation.x = 0.25;
      }
    } else if (t.rig === "quad") {
      ((u.body = c.body),
        (u.neck = c.neck),
        (u.head = c.head),
        (u.jaw = c.jaw || null),
        (u.tail = c.tail || null),
        (u.legs = [0, 1, 2, 3].map((p) => ({
          up: c["leg" + p + ".up"],
          lo: c["leg" + p + ".lo"],
          hand: c["leg" + p + ".hand"],
          front: p < 2,
        }))));
      let d = n.headR;
      if (f && n.eyes) {
        let p = n.humanHead ? { x: 0.34, u: 0.7, f: 0.75 } : W1(n);
        for (let g of [-1, 1])
          ne(
            u.head,
            Ve(d * Math.min(n.eyes.size, 0.17), 10, 8),
            f,
            g * d * p.x,
            d * p.u,
            d * (p.f - 0.02),
          );
      }
    } else if (t.rig === "maw") {
      ((u.top = c.top), (u.segs = []));
      for (let d = 0; c["seg" + d]; d++) u.segs.push(c["seg" + d]);
      u.tipJ = c.tip;
    } else if (t.rig === "arms")
      ((u.arms = [0, 1, 2].map((d) => ({
        base: c["arm" + d + ".base"],
        up: c["arm" + d + ".up"],
        el: c["arm" + d + ".el"],
        hand: c["arm" + d + ".hand"],
        ang: (d / 3) * Math.PI * 2,
      }))),
        (u.headJ = c.head));
    else if (t.rig === "flyer") {
      if (
        ((u.body = c.body),
        (u.head = c.head),
        (u.wings = [
          { w: c.wingL, w2: c.wingL2, s: -1 },
          { w: c.wingR, w2: c.wingR2, s: 1 },
        ]),
        f)
      )
        for (let d of [-1, 1])
          ne(
            u.head,
            Ve(n.r * 0.09, 8, 6),
            f,
            d * n.r * 0.33,
            n.r * 0.2,
            n.r * 0.72,
          );
    } else if (t.rig === "spider") {
      ((u.body = c.body), (u.head = c.head));
      let d = n.n || 8;
      u.legs = [];
      for (let p = 0; p < d; p++)
        u.legs.push({
          hip: c["leg" + p + ".hip"],
          up: c["leg" + p + ".up"],
          lo: c["leg" + p + ".lo"],
          side: p < d / 2 ? -1 : 1,
          k: p % (d / 2),
        });
      if (f) {
        let p = n.bodyR,
          g = n.eyes || 4;
        for (let m = 0; m < g; m++)
          ne(
            u.head,
            Ve(p * 0.055, 6, 4),
            f,
            (m - g / 2 + 0.5) * p * 0.14,
            p * 0.2,
            p * 0.56,
          );
      }
    }
    if (t.rig !== "maw" && t.rig !== "arms") {
      let d = new te(
        new Un(1, 1),
        new Hn({ map: p_(), transparent: !0, depthWrite: !1, opacity: 0.8 }),
      );
      ((d.rotation.x = -Math.PI / 2), (d.position.y = 0.015));
      let p = (t.radius || 0.35) * 3.2;
      (d.scale.set(p, p, 1), r.add(d), (u.shadow = d));
    }
    return (
      (u.setLOD = (d) => {
        let p = u.lodMeshes.length,
          g = 0.75,
          m = 0;
        for (let x = 1; x < p; x++) {
          let v = u.lodDist * (x === 1 ? 1 : 2.6);
          d > v + (u.lod >= x ? -g : g) && (m = x);
        }
        m !== u.lod &&
          ((u.lod = m),
          u.lodMeshes.forEach((x, v) => {
            x.visible = v === m;
          }));
      }),
      u
    );
  }
  var Nd = "hazmat",
    Us = [
      [0.86, 0.6, 0.08],
      [0.9, 0.36, 0.07],
      [0.3, 0.46, 0.75],
      [0.36, 0.58, 0.26],
      [0.9, 0.9, 0.86],
      [0.75, 0.16, 0.12],
      [0.55, 0.32, 0.7],
      [0.2, 0.62, 0.62],
    ];
  function Rc(s = 0) {
    di.request(Nd, "hazmat", { suit: [0.86, 0.86, 0.83] }, s);
  }
  function Ud() {
    return !!di.get(Nd);
  }
  function Od(s, t = {}) {
    let e = di.get(Nd);
    if (!e) return null;
    let i = m_(s, { rig: "biped", id: Nd, height: 1.76, radius: 0.34 }, e, {
        color2: [0.08, 0.06, 0.04],
        rough: 0.5,
        wet: 0.08,
        sss: 0.08,
        rim: 0.22,
        dirt: t.dirt ?? 0.45,
      }),
      r = t.tint || Us[0];
    return (
      i.mat.uniforms.uTint.value.setRGB(r[0], r[1], r[2]),
      (i.human = !0),
      i
    );
  }
  function zd(s, t, e = 0) {
    let n = e % 2 ? 1 : -1,
      i = ((e * 7919) % 100) / 100;
    if (t === "prone") {
      J1(s, 1, e);
      return;
    }
    if (t === "sit") {
      ((s.hips.position.y = 0.13),
        s.legL.th.rotation.set(-1.45, 0, -0.12),
        s.legR.th.rotation.set(-1.4, 0, 0.14),
        (s.legL.kn.rotation.x = 0.25 + i * 0.6),
        (s.legR.kn.rotation.x = 0.6 - i * 0.4),
        (s.legL.an.rotation.x = -0.3),
        (s.legR.an.rotation.x = -0.2),
        s.spine.rotation.set(-0.1, 0, n * 0.06),
        s.neck.rotation.set(0.78, n * 0.25, n * 0.35));
      for (let [r, o] of [
        [s.armL, -1],
        [s.armR, 1],
      ]) {
        let a = o === n;
        (r.up.rotation.set(a ? -0.55 : -0.12, 0, o * (a ? 0.05 : 0.2)),
          (r.el.rotation.x = a ? -1.1 : -0.3));
      }
      return;
    }
    if (t === "curl") {
      ((s.root.rotation.z = n * (Math.PI / 2 - 0.08)),
        (s.root.position.y = 0.2),
        (s.legL.th.rotation.x = -1.2),
        (s.legR.th.rotation.x = -0.95),
        (s.legL.kn.rotation.x = 1.5),
        (s.legR.kn.rotation.x = 1.25),
        (s.spine.rotation.x = 0.45),
        (s.neck.rotation.x = 0.5));
      for (let r of [s.armL, s.armR])
        (r.up.rotation.set(-0.9, 0, 0), (r.el.rotation.x = -1.3));
    }
  }
  function g_(s) {
    let t = new Vt();
    (t.setAttribute(
      "position",
      new Kt(new Float32Array([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0]), 3),
    ),
      t.setAttribute(
        "normal",
        new Kt(new Int8Array([0, 0, 127, 0, 0, 127, 0, 0, 127]), 3, !0),
      ),
      t.setAttribute("color", new Kt(new Uint8Array(9).fill(200), 3, !0)),
      t.setAttribute("aMat", new Kt(new Uint8Array([20, 20, 20]), 1)),
      t.setAttribute("skinIndex", new Kt(new Uint8Array(12), 4)),
      t.setAttribute(
        "skinWeight",
        new Kt(
          new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0]),
          4,
          !0,
        ),
      ));
    let e = new Ks(),
      n = new Cr(t, On(s, { vcol: !0 }));
    return (n.add(e), n.bind(new Rr([e])), (n.frustumCulled = !1), n);
  }
  function J1(s, t, e = 0) {
    let n = (l, h) => Math.min(1, Math.max(0, (t - l) / (h - l))),
      i = n(0, 0.4),
      r = n(0.3, 1),
      o = r * r,
      a = i * (1 - r),
      c = e % 2 ? 1 : -1;
    (s.legL
      ? ((s.legL.th.rotation.x = -1.1 * a + 0.08 * r),
        (s.legR.th.rotation.x = -0.9 * a - 0.06 * r),
        (s.legL.kn.rotation.x = 1.8 * a + 0.12 * r),
        (s.legR.kn.rotation.x = 1.5 * a + 0.35 * r),
        (s.legL.an.rotation.x = 0.5 * a + 1 * r),
        (s.legR.an.rotation.x = 0.4 * a + 0.8 * r),
        (s.legL.th.rotation.z = -0.05 - 0.12 * r),
        (s.legR.th.rotation.z = 0.05 + 0.1 * r),
        (s.hips.position.y = s.legLen * (1 - 0.5 * a)))
      : (s.hips.position.y = s.H * 0.42 * (1 - i * 0.5)),
      (s.spine.rotation.x = 0.5 * a + 0.06 * r),
      (s.spine.rotation.z = c * 0.12 * r),
      (s.neck.rotation.x = 0.45 * a - 0.55 * r),
      (s.neck.rotation.y = c * 1.15 * r),
      (s.neck.rotation.z = 0));
    for (let [l, h] of [
      [s.armL, -1],
      [s.armR, 1],
      [s.armL2, -1],
      [s.armR2, 1],
    ])
      l &&
        ((l.up.rotation.x = 0.15 * i - 0.25 * r + (h === c ? -0.9 * r : 0)),
        (l.up.rotation.z = h * (0.15 + 0.35 * r)),
        (l.el.rotation.x = -0.3 - 0.3 * i - (h === c ? 0.8 * r : 0)));
    ((s.root.rotation.x = o * (Math.PI / 2 - 0.04)),
      (s.root.position.y = o * 0.075 * s.H * (s.p.thick ?? 1)));
  }
  function Q1(s, t) {
    let e = Cc(t),
      n = e ? di.get(e.key) : null;
    if (n) return m_(s, t, n, e.params);
    let i = t.body,
      r = On(s, {
        color: i.color,
        color2: i.color2 || [0.2, 0.05, 0.05],
        rough: i.rough ?? 0.6,
        skin: i.skin ?? 0.6,
        wet: i.wet ?? 0.2,
        sss: i.sss ?? 0.3,
        rim: i.rim ?? 0.25,
        wobble: i.wobble ?? 0,
        opacity: i.opacity ?? 1,
        side: i.opacity < 1 ? Oi : Ui,
      }),
      o =
        i.eyes || i.glow
          ? yh(s, (i.eyes && i.eyes.color) || i.glow || [1, 1, 1], {
              intensity: (i.eyes && i.eyes.i) || 5,
            })
          : null,
      a = i.extra
        ? On(s, {
            color: i.extra,
            rough: i.extraRough ?? 0.5,
            metal: i.extraMetal ?? 0,
            skin: 0,
          })
        : null,
      c = i.top
        ? On(s, {
            color: i.top,
            color2: i.topStain || [0.15, 0.1, 0.06],
            rough: 0.92,
            skin: 0.55,
            sss: 0.05,
            rim: 0.15,
          })
        : null,
      l = i.bottom
        ? On(s, {
            color: i.bottom,
            color2: [0.05, 0.05, 0.05],
            rough: 0.9,
            skin: 0.4,
            sss: 0.05,
            rim: 0.1,
          })
        : null,
      h;
    switch (t.rig) {
      case "biped":
        h = kA(i, r, o, a, c, l);
        break;
      case "quad":
        h = IA(i, r, o, a);
        break;
      case "spider":
        h = NA(i, r, o);
        break;
      case "flyer":
        h = UA(i, r, o);
        break;
      case "maw":
        h = zA(i, r, o, a);
        break;
      case "arms":
        h = HA(i, r);
        break;
    }
    if (
      ((h.root.rotation.order = "YXZ"),
      (h.mat = r),
      (h.eyeMat = o),
      (h.extraMat = a),
      (h.topMat = c),
      (h.botMat = l),
      (h.mats = [r, c, l, a].filter(Boolean)),
      h.root.scale.setScalar((t.scaleVar, 1)),
      t.rig !== "maw" && t.rig !== "arms")
    ) {
      let u = new te(
        new Un(1, 1),
        new Hn({ map: p_(), transparent: !0, depthWrite: !1, opacity: 0.8 }),
      );
      ((u.rotation.x = -Math.PI / 2), (u.position.y = 0.015));
      let f = (t.radius || 0.35) * 3.2;
      (u.scale.set(f, f, 1), h.root.add(u), (h.shadow = u));
    }
    return (
      h.root.traverse((u) => {
        u.frustumCulled = u.isMesh ? !0 : u.frustumCulled;
      }),
      h
    );
  }
  function Bd(s, t, e) {
    switch (s.type) {
      case "biped":
        LA(s, t, e);
        break;
      case "quad":
        DA(s, t, e);
        break;
      case "spider":
        FA(s, t, e);
        break;
      case "flyer":
        OA(s, t, e);
        break;
      case "maw":
        BA(s, t, e);
        break;
      case "arms":
        VA(s, t, e);
        break;
    }
  }
  function Hr(s) {
    (s.skeleton && s.skeleton.dispose(),
      s.mat && s.mat.dispose(),
      s.eyeMat && s.eyeMat.dispose(),
      s.extraMat && s.extraMat.dispose(),
      s.topMat && s.topMat.dispose(),
      s.botMat && s.botMat.dispose(),
      s.sockMat && s.sockMat.dispose(),
      s.shadow && (s.shadow.geometry.dispose(), s.shadow.material.dispose()));
  }
  var qA = [0.2, 0.185, 0.16],
    Vr = {
      wanderer: {
        name: "徘徊者",
        rig: "biped",
        radius: 0.32,
        height: 1.9,
        hp: 70,
        walk: 0.85,
        run: 3.6,
        dmg: 18,
        reach: 1.35,
        atkRate: 1.4,
        atkTime: 0.7,
        atkHit: 0.48,
        sight: 20,
        fov: 130,
        hear: 1,
        memory: 7,
        blood: [0.12, 0.05, 0.04],
        drop: 0.3,
        snd: { idle: "moan", alert: "growl", attack: "growl" },
        body: {
          height: 1.9,
          color: qA,
          color2: [0.1, 0.05, 0.05],
          skin: 0.75,
          rough: 0.55,
          hunch: 0.28,
          tilt: 0.3,
          head: 0.05,
          headScale: [0.84, 1.22, 1.02],
          arm: 0.5,
          leg: 0.49,
          thick: 0.82,
          sss: 0.4,
          top: [0.22, 0.2, 0.16],
          topStain: [0.12, 0.08, 0.04],
          bottom: [0.05, 0.05, 0.055],
          shoe: !0,
          sockets: !0,
        },
        sdf: { gaunt: 0.55, gape: 0.45, fingers: 0.07 },
      },
      crawler: {
        name: "這う者",
        rig: "quad",
        radius: 0.4,
        height: 0.9,
        hp: 55,
        walk: 1,
        run: 4.8,
        dmg: 15,
        reach: 1.25,
        atkRate: 1,
        atkTime: 0.5,
        atkHit: 0.5,
        duct: !0,
        sight: 13,
        fov: 120,
        hear: 1.8,
        memory: 6,
        blood: [0.1, 0.03, 0.03],
        drop: 0.2,
        snd: {
          idle: "clicks",
          alert: "screech",
          attack: "screech",
          move: "scuttle",
        },
        body: {
          len: 0.95,
          legH: 0.62,
          bodyR: 0.17,
          legR: 0.035,
          upper: 0.55,
          neckL: 0.16,
          headR: 0.12,
          headScale: [0.9, 1.1, 1.1],
          neckPitch: -0.3,
          headPitch: 0.4,
          hands: !0,
          frontRest: -0.25,
          backRest: 0.3,
          backKnee: 0.4,
          frontKnee: -0.3,
          color: [0.5, 0.45, 0.4],
          color2: [0.25, 0.1, 0.08],
          skin: 0.8,
          rough: 0.5,
          sss: 0.45,
          thick: 1,
          flat: 0.7,
        },
        sdf: {
          humanoid: !0,
          humanHead: !0,
          gaunt: 0.6,
          sockets: !0,
          gape: 0.55,
          legR: 0.038,
          neckPitch: 0.95,
          headPitch: -0.35,
          faceScale: [0.9, 1.15, 1],
          frontRest: -0.5,
          frontKnee: -0.1,
          backRest: 0.25,
          backKnee: 0.55,
        },
      },
      mannequin: {
        name: "マネキン",
        rig: "biped",
        radius: 0.3,
        height: 1.8,
        hp: 140,
        walk: 0,
        run: 6.2,
        dmg: 42,
        reach: 0.95,
        atkRate: 1.2,
        atkTime: 0.3,
        atkHit: 0.2,
        sight: 40,
        fov: 360,
        hear: 0.5,
        memory: 30,
        blood: [0.6, 0.55, 0.5],
        behavior: "statue",
        drop: 0.5,
        snd: { move: "creak", alert: "creak", attack: "hit_wall" },
        body: {
          height: 1.8,
          color: [0.62, 0.55, 0.47],
          color2: [0.5, 0.4, 0.35],
          skin: 0.12,
          rough: 0.28,
          hunch: 0.05,
          head: 0.052,
          headScale: [0.8, 1.18, 0.98],
          arm: 0.44,
          thick: 0.9,
          stiff: !0,
          sss: 0.1,
          rim: 0.3,
        },
        sdf: { plastic: !0, jointBalls: !0, color: [0.72, 0.66, 0.58] },
      },
      smiler: {
        name: "笑う者",
        rig: "biped",
        radius: 0.3,
        height: 1.95,
        hp: 60,
        walk: 0.7,
        run: 6.8,
        dmg: 34,
        reach: 1.3,
        atkRate: 1.1,
        atkTime: 0.45,
        atkHit: 0.5,
        sight: 16,
        fov: 160,
        hear: 0.8,
        memory: 5,
        blood: [0.02, 0.02, 0.02],
        behavior: "dark",
        drop: 0.6,
        snd: { alert: "laugh", attack: "screech", idle: "whisper" },
        body: {
          height: 1.95,
          color: [0.015, 0.014, 0.013],
          color2: [0, 0, 0],
          skin: 0.2,
          rough: 0.9,
          hunch: 0.35,
          head: 0.062,
          headScale: [1, 1, 1],
          arm: 0.52,
          thick: 0.75,
          eyes: { color: [1, 1, 0.92], size: 0.16, i: 6 },
          smile: !0,
          rim: 0.05,
          sss: 0,
        },
        sdf: {
          gaunt: 0.5,
          sockets: !0,
          teeth: !1,
          gape: 0,
          noNose: !0,
          noEars: !0,
          claw: !0,
          fingers: 0.085,
        },
      },
      tall: {
        name: "長い者",
        rig: "biped",
        radius: 0.35,
        height: 3,
        hp: 170,
        walk: 0.8,
        run: 2.9,
        dmg: 38,
        reach: 2.6,
        atkRate: 1.8,
        atkTime: 0.9,
        atkHit: 0.5,
        sight: 24,
        fov: 140,
        hear: 1,
        memory: 10,
        blood: [0.08, 0.06, 0.06],
        drop: 0.6,
        snd: { idle: "moan", alert: "roar", attack: "growl" },
        body: {
          height: 2.9,
          color: [0.3, 0.27, 0.25],
          color2: [0.12, 0.05, 0.05],
          skin: 0.6,
          rough: 0.6,
          hunch: 0.45,
          head: 0.038,
          headScale: [0.8, 1.6, 0.95],
          arm: 0.62,
          leg: 0.55,
          thick: 0.6,
          tilt: -0.4,
          fingers: 0.1,
          attack: "smash",
          top: [0.025, 0.025, 0.03],
          bottom: [0.02, 0.02, 0.025],
          shoe: !0,
          sockets: !0,
        },
        sdf: { gaunt: 0.7, gape: 0.6, claw: !0 },
      },
      skitter: {
        name: "群れ虫",
        rig: "spider",
        radius: 0.22,
        height: 0.35,
        hp: 14,
        walk: 1.5,
        run: 5.6,
        dmg: 7,
        reach: 0.9,
        atkRate: 0.7,
        atkTime: 0.3,
        atkHit: 0.5,
        duct: !0,
        sight: 11,
        fov: 200,
        hear: 1.6,
        memory: 6,
        blood: [0.15, 0.2, 0.05],
        snd: { move: "scuttle", alert: "clicks", attack: "clicks" },
        body: {
          h: 0.22,
          bodyR: 0.14,
          legA: 0.18,
          legB: 0.24,
          legR: 0.012,
          n: 8,
          lift: 0.8,
          bend: 2,
          color: [0.12, 0.1, 0.08],
          color2: [0.3, 0.25, 0.05],
          skin: 0.5,
          wet: 0.6,
          rough: 0.3,
          eyes: 4,
          glow: [1, 0.25, 0.1],
        },
        sdf: { h: 0.13, lift: 0.55 },
      },
      hound: {
        name: "赤の猟犬",
        rig: "quad",
        radius: 0.42,
        height: 1,
        hp: 95,
        walk: 1.4,
        run: 5.4,
        dmg: 28,
        reach: 1.45,
        atkRate: 0.95,
        atkTime: 0.45,
        atkHit: 0.5,
        sight: 22,
        fov: 150,
        hear: 1.6,
        memory: 9,
        blood: [0.2, 0.02, 0.02],
        zoneLeash: !0,
        drop: 0.5,
        snd: { idle: "growl", alert: "roar", attack: "growl" },
        body: {
          len: 1.1,
          legH: 0.68,
          bodyR: 0.22,
          legR: 0.045,
          upper: 0.5,
          neckL: 0.22,
          headR: 0.14,
          jaw: !0,
          neckPitch: -0.7,
          headScale: [0.9, 0.85, 1.5],
          tail: 0.4,
          gallop: !0,
          color: [0.22, 0.08, 0.06],
          color2: [0.45, 0.05, 0.03],
          skin: 0.9,
          wet: 0.7,
          rough: 0.35,
          sss: 0.3,
          eyes: { color: [1, 0.15, 0.05], size: 0.13, i: 5 },
        },
        sdf: {
          muscle: !0,
          ribs: !0,
          color: [0.3, 0.07, 0.05],
          neckPitch: 1.05,
          headPitch: 0.15,
          frontRest: 0.05,
          frontKnee: -0.15,
          backRest: -0.35,
          backKnee: 0.75,
          tailRest: 1.2,
        },
      },
      butcher: {
        name: "処刑人",
        rig: "biped",
        radius: 0.48,
        height: 2.25,
        hp: 320,
        walk: 1.1,
        run: 3.3,
        dmg: 100,
        reach: 1.8,
        atkRate: 2,
        atkTime: 1,
        atkHit: 0.5,
        sight: 20,
        fov: 120,
        hear: 1.2,
        memory: 12,
        blood: [0.15, 0.02, 0.02],
        zoneLeash: !0,
        drop: 1,
        snd: { idle: "growl", alert: "roar", attack: "roar" },
        body: {
          height: 2.25,
          color: [0.33, 0.26, 0.23],
          color2: [0.35, 0.04, 0.03],
          skin: 0.8,
          wet: 0.4,
          rough: 0.5,
          hunch: 0.3,
          head: 0.05,
          headScale: [1.1, 1, 1.1],
          arm: 0.46,
          thick: 1.5,
          shoulder: 0.15,
          hips: 0.09,
          weapon: "cleaver",
          extra: [0.35, 0.33, 0.32],
          extraMetal: 0.8,
          headMat: !1,
          flat: 0.95,
          top: [0.2, 0.13, 0.08],
          topStain: [0.25, 0.02, 0.02],
          bottom: [0.07, 0.06, 0.06],
          shortSleeve: !0,
          shoe: !0,
          bandage: !0,
        },
        sdf: {
          fat: 0.3,
          thick: 1.4,
          armSpread: 0.22,
          apron: [0.42, 0.36, 0.3],
          gape: 0.2,
          eyeCol: [0.5, 0.1, 0.08],
        },
      },
      maw: {
        name: "天井の口",
        rig: "maw",
        radius: 0.3,
        height: 1,
        hp: 60,
        walk: 0,
        run: 0,
        dmg: 999,
        reach: 0.6,
        atkRate: 3,
        atkTime: 2.2,
        atkHit: 1,
        sight: 0,
        fov: 0,
        hear: 0,
        memory: 0,
        blood: [0.25, 0.05, 0.08],
        behavior: "ambush",
        snd: { alert: "squelch", attack: "squelch", idle: "squelch" },
        body: {
          ceil: 3,
          tip: 0.95,
          color: [0.16, 0.06, 0.06],
          color2: [0.32, 0.02, 0.03],
          skin: 1,
          wet: 1,
          rough: 0.2,
          sss: 0.6,
          extra: [0.3, 0.05, 0.07],
          extraRough: 0.15,
        },
      },
      clinger: {
        name: "ネバリ",
        rig: "biped",
        radius: 0.38,
        height: 1.7,
        hp: 150,
        walk: 1,
        run: 3.2,
        dmg: 9,
        reach: 1.15,
        atkRate: 0.7,
        atkTime: 0.35,
        atkHit: 0.5,
        sight: 16,
        fov: 140,
        hear: 1.2,
        memory: 999,
        blood: [0.05, 0.08, 0.2],
        behavior: "stalker",
        sticky: 0.45,
        drop: 0.5,
        snd: {
          idle: "squelch",
          alert: "moan",
          attack: "squelch",
          move: "squelch",
        },
        body: {
          height: 1.7,
          color: [0.06, 0.09, 0.16],
          color2: [0.15, 0.3, 0.6],
          skin: 0.5,
          wet: 1,
          rough: 0.12,
          hunch: 0.5,
          head: 0.066,
          headScale: [1.1, 0.9, 1],
          arm: 0.5,
          leg: 0.4,
          thick: 1.6,
          wobble: 0.025,
          sss: 0.7,
          tilt: 0.5,
        },
        sdf: {
          lumpy: !0,
          noEars: !0,
          noNose: !0,
          sockets: !0,
          gape: 0.5,
          fat: 0.3,
          fingers: 0.07,
        },
      },
      stringer: {
        name: "糸引き",
        rig: "spider",
        radius: 0.4,
        height: 1.2,
        hp: 70,
        walk: 1.4,
        run: 4.2,
        dmg: 13,
        reach: 1.4,
        atkRate: 0.9,
        atkTime: 0.4,
        atkHit: 0.5,
        sight: 15,
        fov: 220,
        hear: 1.4,
        memory: 999,
        blood: [0.6, 0.6, 0.55],
        behavior: "stalker",
        drop: 0.5,
        snd: { move: "scuttle", alert: "screech", attack: "clicks" },
        body: {
          h: 0.9,
          bodyR: 0.22,
          legA: 0.75,
          legB: 0.95,
          legR: 0.018,
          n: 8,
          lift: 1.1,
          bend: 2.2,
          face: !0,
          color: [0.62, 0.6, 0.55],
          color2: [0.4, 0.15, 0.12],
          skin: 0.5,
          rough: 0.5,
          sss: 0.4,
        },
        sdf: { h: 0.58, lift: 0.45, gape: 0.4, sockets: !0 },
      },
      black: {
        name: "黒い者",
        rig: "biped",
        radius: 0.45,
        height: 2.8,
        hp: 1600,
        walk: 1.6,
        run: 4.65,
        dmg: 80,
        reach: 2.1,
        atkRate: 1.5,
        atkTime: 0.7,
        atkHit: 0.5,
        sight: 34,
        fov: 360,
        hear: 3,
        memory: 16,
        blood: [0, 0, 0],
        behavior: "boss",
        drop: 1,
        snd: { idle: "whisper", alert: "roar", attack: "roar" },
        body: {
          height: 2.8,
          color: [0.008, 0.008, 0.009],
          color2: [0, 0, 0],
          skin: 0.3,
          rough: 0.25,
          hunch: 0.2,
          head: 0.045,
          headScale: [0.8, 1.7, 0.9],
          arm: 0.56,
          leg: 0.52,
          thick: 0.95,
          fourArms: !0,
          tilt: 0.2,
          rim: 0.6,
          attack: "smash",
          eyes: { color: [0.9, 0.9, 1], size: 0.1, i: 3 },
        },
        sdf: {
          gaunt: 0.45,
          claw: !0,
          fingers: 0.11,
          sockets: !0,
          noNose: !0,
          teeth: !1,
          gape: 0,
        },
      },
      drowner: {
        name: "溺れる手",
        rig: "arms",
        radius: 0.5,
        height: 1,
        hp: 90,
        walk: 0,
        run: 0,
        dmg: 14,
        reach: 1.8,
        atkRate: 1,
        atkTime: 1,
        atkHit: 1,
        sight: 0,
        fov: 0,
        hear: 0,
        memory: 0,
        blood: [0.4, 0.45, 0.5],
        behavior: "drowner",
        snd: { alert: "squelch", idle: "squelch" },
        body: {
          base: -1.2,
          color: [0.55, 0.6, 0.6],
          color2: [0.25, 0.35, 0.4],
          skin: 0.7,
          wet: 1,
          rough: 0.2,
          sss: 0.6,
        },
      },
      flyer: {
        name: "奈落の飛来者",
        rig: "flyer",
        radius: 0.4,
        height: 0.6,
        hp: 45,
        walk: 2,
        run: 6,
        dmg: 18,
        reach: 1.1,
        atkRate: 2.2,
        atkTime: 0.5,
        atkHit: 0.5,
        sight: 26,
        fov: 360,
        hear: 1,
        memory: 8,
        blood: [0.1, 0.05, 0.02],
        behavior: "flyer",
        snd: { alert: "screech", attack: "screech", idle: "clicks" },
        body: {
          len: 0.6,
          r: 0.13,
          span: 0.55,
          color: [0.12, 0.1, 0.09],
          color2: [0.3, 0.1, 0.05],
          skin: 0.6,
          rough: 0.5,
          eyes: 2,
          glow: [1, 0.6, 0.2],
        },
      },
      headlight: {
        name: "ヘッドライト",
        rig: "quad",
        radius: 0.55,
        height: 1.3,
        hp: 210,
        walk: 1,
        run: 2.5,
        dmg: 48,
        reach: 1.4,
        atkRate: 1.5,
        atkTime: 0.4,
        atkHit: 0.5,
        sight: 26,
        fov: 100,
        hear: 0.8,
        memory: 8,
        blood: [0.05, 0.05, 0.05],
        behavior: "charger",
        drop: 0.7,
        snd: { alert: "roar", attack: "roar", idle: "growl" },
        body: {
          len: 1.5,
          legH: 0.85,
          bodyR: 0.4,
          legR: 0.07,
          upper: 0.5,
          neckL: 0.15,
          headR: 0.3,
          neckPitch: -0.2,
          headScale: [1.3, 0.8, 1],
          thick: 1,
          color: [0.2, 0.2, 0.21],
          color2: [0.1, 0.1, 0.1],
          skin: 0.4,
          rough: 0.35,
          eyes: { color: [1, 0.95, 0.75], size: 0.28, i: 14 },
        },
        sdf: {
          plates: !0,
          headPlates: !0,
          ears: !1,
          thick: 1.15,
          color: [0.24, 0.23, 0.22],
          neckPitch: 0.9,
          headPitch: 0.1,
          frontRest: 0.05,
          frontKnee: -0.1,
          backRest: -0.2,
          backKnee: 0.45,
        },
      },
      nurse: {
        name: "看護する者",
        rig: "biped",
        radius: 0.3,
        height: 1.75,
        hp: 85,
        walk: 0.9,
        run: 5,
        dmg: 30,
        reach: 1.3,
        atkRate: 1.1,
        atkTime: 0.5,
        atkHit: 0.5,
        sight: 0,
        fov: 0,
        hear: 2.6,
        memory: 5,
        blood: [0.15, 0.03, 0.03],
        behavior: "blind",
        drop: 0.4,
        snd: { idle: "whisper", alert: "screech", attack: "screech" },
        body: {
          height: 1.75,
          color: [0.3, 0.27, 0.25],
          color2: [0.25, 0.06, 0.05],
          skin: 0.65,
          rough: 0.6,
          hunch: 0.15,
          head: 0.053,
          headScale: [0.9, 1.15, 1.02],
          arm: 0.46,
          thick: 0.85,
          tilt: 0.6,
          extra: [0.62, 0.6, 0.55],
          extraRough: 0.95,
          bandage: !0,
          top: [0.55, 0.56, 0.52],
          topStain: [0.35, 0.03, 0.02],
          bottom: [0.52, 0.53, 0.5],
          skirt: !0,
          shortSleeve: !0,
        },
        sdf: { gaunt: 0.35, gape: 0.3 },
      },
      wraith: {
        name: "蒸気の亡霊",
        rig: "biped",
        radius: 0.32,
        height: 1.9,
        hp: 75,
        walk: 1.2,
        run: 3.9,
        dmg: 22,
        reach: 1.3,
        atkRate: 1.2,
        atkTime: 0.6,
        atkHit: 0.5,
        sight: 18,
        fov: 140,
        hear: 1.2,
        memory: 8,
        blood: [0.6, 0.6, 0.6],
        drop: 0.4,
        snd: { idle: "whisper", alert: "moan", attack: "screech" },
        body: {
          height: 1.9,
          color: [0.55, 0.55, 0.52],
          color2: [0.3, 0.3, 0.3],
          skin: 0.3,
          rough: 0.8,
          hunch: 0.2,
          head: 0.055,
          arm: 0.55,
          thick: 0.9,
          noLegs: !0,
          opacity: 0.45,
          wobble: 0.02,
          sss: 0.8,
        },
        sdf: { gaunt: 0.6, sockets: !0, gape: 0.6 },
      },
    };
  for (let s in Vr) Vr[s].id = s;
  var Hd = {
    yellow: [
      ["wanderer", 6],
      ["crawler", 2.5],
      ["mannequin", 1],
    ],
    pool: [
      ["wanderer", 4],
      ["tall", 2],
      ["crawler", 1],
    ],
    abyss: [
      ["crawler", 3],
      ["tall", 2],
      ["wanderer", 2],
    ],
    parking: [
      ["wanderer", 4],
      ["crawler", 3],
    ],
    pipes: [
      ["crawler", 3],
      ["wanderer", 2],
      ["wraith", 3],
    ],
    hospital: [
      ["wanderer", 3],
      ["mannequin", 2],
      ["nurse", 3],
    ],
    office: [
      ["wanderer", 4],
      ["crawler", 2],
    ],
  };
  function XA(s, t, e) {
    let n = new Int32Array(s.N).fill(-1),
      i = new Int32Array(s.N),
      r = 0,
      o = 0;
    for (n[t] = 0, i[o++] = t; r < o; ) {
      let a = i[r++],
        c = a % s.W,
        l = (a / s.W) | 0;
      for (let h = 0; h < 4; h++) {
        if (e ? !s.ductPassable(c, l, h) : !s.passable(c, l, h)) continue;
        let u = a + ge[h] + xe[h] * s.W;
        n[u] >= 0 ||
          (s.floor[u] === 2 && u !== t) ||
          ((n[u] = n[a] + 1), (i[o++] = u));
      }
    }
    return n;
  }
  var Vd = class {
    constructor(t) {
      ((this.game = t),
        (t.monsters = this),
        (this.list = []),
        (this.fields = new Map()),
        (this.frustum = new Xi()),
        (this.pm = new Qt()),
        (this.black = null),
        (this.tmpP = { x: 0, z: 0 }),
        (this.fear = 0));
    }
    onNewRun() {
      (this.clearRigs(), (this.list = []));
    }
    onFloorGenerated(t) {
      let e = t.map,
        n = Math.min(5,t.depth),
        i = t.themeId,
        r = new Ci(e.seed + 999),
        o = [],
        a = e.distFromStart,
        c = (v) =>
          e.reach[v] &&
          e.floor[v] !== 1 &&
          e.floor[v] !== 6 &&
          e.feat[v] === 0 &&
          (a[v] < 0 || a[v] > 16),
        l = (v) => {
          let y = [];
          for (let _ = 0; _ < e.N; _++) c(_) && v(_) && y.push(_);
          return y;
        },
        h = (v, y, _ = {}) => {
          let M = y % e.W,
            b = (y / e.W) | 0;
          o.push(
            this.makeMon(
              v,
              (M + 0.5) * 4 + r.range(-0.8, 0.8),
              (b + 0.5) * 4 + r.range(-0.8, 0.8),
              r.range(0, 6.28),
              { home: y, ..._ },
            ),
          );
        },
        u = l((v) => e.zone[v] === 0 && e.floor[v] !== 2),
        f = [13, 17, 21, 25, 29][n - 1],
        d = Hd[i] || Hd.yellow;
      for (let v = 0; v < f && u.length; v++) {
        let y = r.weighted(d);
        if (y === "crawler" && r.chance(0.15) && n >= 2) {
          let _ = r.pick(u);
          for (let M = 0; M < 5; M++) h("skitter", _);
          continue;
        }
        h(y, r.pick(u));
      }
      let p = l(
          (v) => e.zone[v] === 0 && (e.light[v] === 3 || e.light[v] === 0),
        ),
        g = Math.min(
          p.length,
          (i === "office" ? 10 : i === "yellow" ? 4 : 3) + Math.floor(n / 2),
        );
      for (let v = 0; v < g; v++) h("smiler", r.pick(p));
      if (i === "abyss") for (let v = 0; v < 6 + n; v++) h("flyer", r.pick(u));
      if (i === "parking")
        for (let v = 0; v < 3 + Math.floor(n / 2); v++)
          h("headlight", r.pick(u));
      if (i === "hospital")
        for (let v = 0; v < 4 + n; v++) h("nurse", r.pick(u));
      if (i === "pipes")
        for (let v = 0; v < 2; v++) {
          let y = r.pick(u);
          for (let _ = 0; _ < 5; _++) h("skitter", y);
        }
      if (i === "pool") {
        let v = [];
        for (let _ = 0; _ < e.N; _++)
          e.floor[_] === 2 && (a[_] < 0 || a[_] > 8) && v.push(_);
        let y = new Set();
        for (let _ = 0; _ < Math.min(14, v.length); _++) {
          let M = r.pick(v);
          y.has(M) || (y.add(M), h("drowner", M));
        }
      }
      for (let v of e.zones) {
        let y = v.cells.filter(c);
        if (y.length) {
          if (v.id === 1) {
            let _ = [2, 3, 3, 4, 4][n - 1],
              M = [0, 1, 1, 1, 2][n - 1],
              b = [2, 2, 3, 3, 4][n - 1];
            for (let S = 0; S < _; S++) h("hound", r.pick(y), { zoneHome: v });
            for (let S = 0; S < M; S++)
              h("butcher", r.pick(y), { zoneHome: v });
            let w = {
              ...Vr.maw,
              body: { ...Vr.maw.body, ceil: t.theme.ceilH },
            };
            for (let S = 0; S < b; S++) {
              let T = r.pick(y),
                E = this.makeMon(
                  "maw",
                  ((T % e.W) + 0.5) * 4 + r.range(-0.6, 0.6),
                  (((T / e.W) | 0) + 0.5) * 4 + r.range(-0.6, 0.6),
                  0,
                  { home: T, zoneHome: v, def: w },
                );
              o.push(E);
            }
          } else if (v.id === 2) {
            let _ = [2, 2, 3, 3, 3][n - 1],
              M = [0, 1, 1, 2, 2][n - 1];
            for (let b = 0; b < _; b++)
              h("clinger", r.pick(y), { zoneHome: v });
            for (let b = 0; b < M; b++)
              h("stringer", r.pick(y), { zoneHome: v });
          }
        }
      }
      for (let v of e.ducts || [])
        if (r.chance(0.45)) {
          let y = v.path[Math.floor(r.next() * v.path.length)];
          h(r.chance(0.6) ? "skitter" : "crawler", y);
        }
      let m = -1,
        x = -1;
      for (let v = 0; v < 400; v++) {
        let y = r.pick(u.length ? u : [0]),
          _ = y % e.W,
          M = (y / e.W) | 0;
        if (_ < 12 || M < 12 || _ > e.W - 13 || M > e.H - 13) continue;
        let b = a[y] * (0.75 + r.next() * 0.25);
        b > x && ((x = b), (m = y));
      }
      if (m >= 0) {
        h("black", m);
        let v = o[o.length - 1];
        t.black = { x: v.pos.x, z: v.pos.z, r: 26, mon: v, fade: 1 };
      }
      (o.forEach((v, y) => {
        v.nid = y;
      }),
        (t.monsters = o));
    }
    makeMon(t, e, n, i, r = {}) {
      let o = Vr[t];
      return {
        sp: t,
        def: o,
        pos: new L(e, 0, n),
        yaw: i,
        hp: o.hp,
        maxHp: o.hp,
        state: "idle",
        st: Math.random() * 3,
        alert: 0,
        tgt: null,
        lastSeen: null,
        lastSeenT: -99,
        atkT: 0,
        atk: -1,
        atkDone: !1,
        stun: 0,
        dead: !1,
        deadT: 0,
        anim: {
          phase: Math.random() * 6,
          speed: 0,
          moving: 0,
          attack: 0,
          t: Math.random() * 10,
          lookYaw: 0,
          lookPitch: 0,
          twitch: 0,
        },
        rig: null,
        percT: Math.random() * 0.3,
        sndT: 2 + Math.random() * 8,
        hitFlash: 0,
        moved: 0,
        vy: 0,
        beamT: 0,
        localAI: o.behavior === "ambush" || o.behavior === "drowner",
        ...r,
      };
    }
    floorSpecies(t) {
      let e = new Map(),
        n = new Map();
      for (let i of t.monsters || []) {
        let r = Cc(i.def);
        r && (e.set(r.key, (e.get(r.key) || 0) + 1), n.set(r.key, i.def));
      }
      return [...e.keys()]
        .sort((i, r) => e.get(r) - e.get(i))
        .map((i) => n.get(i));
    }
    requestModels(t, e = 0) {
      let n = this.floorSpecies(t);
      return (n.forEach((i, r) => Fd(i, e + 50 - r)), n);
    }
    async prepare(t, e) {
      let n = this.requestModels(t, 100).map((i) => Cc(i).key);
      await di.ensure(n, { timeout: di.live() ? 5e3 : 3e4, onProgress: e });
    }
    onFloorEnter(t) {
      (this.clearRigs(),
        this.requestModels(t, 100),
        (this.fs = t),
        (this.list = t.monsters || []),
        this.fields.clear(),
        (this.black = t.black || null),
        (this.game.inBlack = !1));
    }
    onFloorExit() {
      (this.clearRigs(), this.game.shared.uBlack.value.set(0, 0, 0, 0));
    }
    clearRigs() {
      for (let t of this.list)
        t.rig &&
          (this.game.scene.remove(t.rig.root), Hr(t.rig), (t.rig = null));
    }
    invalidate() {
      this.fields.clear();
    }
    fieldTo(t, e = !1) {
      let n = t * 2 + (e ? 1 : 0),
        i = this.fields.get(n);
      return i
        ? (this.fields.delete(n), this.fields.set(n, i), i)
        : ((i = XA(this.fs.map, t, e)),
          this.fields.set(n, i),
          this.fields.size > 18 &&
            this.fields.delete(this.fields.keys().next().value),
          i);
    }
    cellOf(t, e) {
      let n = this.fs.map,
        i = ke(Math.floor(t / 4), 0, n.W - 1);
      return ke(Math.floor(e / 4), 0, n.H - 1) * n.W + i;
    }
    nextWaypoint(t, e) {
      let n = this.fs.map,
        i = this.cellOf(t.pos.x, t.pos.z);
      if (e[i] < 0 || e[i] === 0) return null;
      let r = null,
        o = i,
        a = !!t.def.duct;
      for (let c = 0; c < 4; c++) {
        let l = o % n.W,
          h = (o / n.W) | 0,
          u = -1,
          f = e[o];
        for (let g = 0; g < 4; g++) {
          if (a ? !n.ductPassable(l, h, g) : !n.passable(l, h, g)) continue;
          let m = o + ge[g] + xe[g] * n.W;
          e[m] >= 0 && e[m] < f && ((f = e[m]), (u = m));
        }
        if (u < 0) break;
        let d = ((u % n.W) + 0.5) * 4,
          p = (((u / n.W) | 0) + 0.5) * 4;
        if (c === 0) r = { x: d, z: p };
        else {
          let g = d - t.pos.x,
            m = p - t.pos.z,
            x = Math.hypot(g, m),
            v = ni(n, t.pos.x, t.pos.z, g, m, x, "move");
          if (v.kind && v.dist < x - 0.2) break;
          if (a && (n.floor[u] === 6 || n.floor[o] === 6)) {
            o = u;
            break;
          }
          let y = (-m / x) * t.def.radius,
            _ = (g / x) * t.def.radius,
            M = ni(n, t.pos.x + y, t.pos.z + _, g, m, x, "move"),
            b = ni(n, t.pos.x - y, t.pos.z - _, g, m, x, "move");
          if ((M.kind && M.dist < x - 0.3) || (b.kind && b.dist < x - 0.3))
            break;
          r = { x: d, z: p };
        }
        if (((o = u), e[o] === 0)) break;
      }
      return r;
    }
    hear(t, e, n, i, r) {
      if (!this.fs) return;
      let o = this.game;
      for (let a of this.list) {
        if (a.dead || (a.remote && !a.localAI)) continue;
        let c = a.def,
          l = Math.hypot(a.pos.x - t, a.pos.z - e);
        if (c.behavior === "boss") {
          n >= 38 &&
            l < 170 &&
            a.state !== "chase" &&
            this.investigate(a, t, e, !0);
          continue;
        }
        if (c.hear <= 0) continue;
        let h = n * c.hear;
        l > h ||
          (l > 3 && !nn(this.fs.map, a.pos.x, a.pos.z, t, e) && (h *= 0.7),
          !(l > h) &&
            ((a.state === "chase" && !r) ||
              c.behavior === "statue" ||
              c.behavior === "ambush" ||
              c.behavior === "drowner" ||
              (a.state === "chase" &&
                r &&
                c.behavior !== "stalker" &&
                Math.random() < 0.6 &&
                (a.state = "investigate"),
              this.investigate(a, t, e, n > 30))));
      }
    }
    investigate(t, e, n, i) {
      t.state !== "chase" &&
        ((t.state = "investigate"),
        (t.st = 0),
        (t.tgt = { x: e, z: n, run: i }),
        t.alert < 0.5 && this.voice(t, "alert", 0.5),
        (t.alert = Math.max(t.alert, 0.5)));
    }
    update(t) {
      let e = this.game,
        n = e.player,
        i = this.fs;
      if (!i) return;
      let r = i.map,
        o = e.camera;
      (this.pm.multiplyMatrices(o.projectionMatrix, o.matrixWorldInverse),
        this.frustum.setFromProjectionMatrix(this.pm));
      let a = e.localLight ?? 0.5,
        c = ke(0.25 + a * 0.85, 0.18, 1.3);
      (n.stance === 1 ? (c *= 0.55) : n.stance === 2 && (c *= 0.32),
        (c *= 1 + Math.min(n.speed, 5) * 0.06),
        e.flashI > 0.5 && (c *= 1.25),
        (this.vis = c));
      let l = this.cellOf(n.pos.x, n.pos.z);
      ((this.playerField = this.fieldTo(l)), (this.playerFieldDuct = null));
      let h = this.targets(),
        u = e.viewPos || n.pos;
      this.spawnTick(t);
      let f = i.miasma || 0;
      ((this.miasma = f),
        (this.speedK = 0.76 + 0.0042 * f + 0.025 * (i.depth - 1)),
        (this.senseK = 0.85 + 0.006 * f));
      let d = 0;
      this.updateBlack(t);
      for (let p of this.list) {
        if (p.dead) {
          this.updateDead(p, t);
          continue;
        }
        let g = Math.hypot(u.x - p.pos.x, u.z - p.pos.z);
        if (((p.d = g), p.remote && !p.localAI)) {
          this.followNet(p, t, g);
          continue;
        }
        let m = this.pickTarget(p, h),
          x = m.pos.x - p.pos.x,
          v = m.pos.z - p.pos.z,
          y = Math.hypot(x, v);
        if (
          ((p.td = y),
          !(
            y < 62 ||
            g < 62 ||
            p.state === "chase" ||
            p.state === "investigate" ||
            p.def.behavior === "boss"
          ))
        ) {
          p.rig && this.dropRig(p);
          continue;
        }
        (g < 50 && !p.rig
          ? this.makeRig(p)
          : g > 68 && p.rig && this.dropRig(p),
          (p.hitFlash = Math.max(0, p.hitFlash - t * 6)),
          (p.atkT -= t),
          (p.anim.t += t));
        let M = y > 62 && g > 62;
        if (this.frozen) {
          p.rig && this.syncRig(p, t);
          continue;
        }
        if (((this.T = m), M)) {
          if (((p._acc = (p._acc || 0) + t), p._acc < 0.25)) continue;
          (this.think(p, p._acc, y, x, v), (p._acc = 0));
        } else this.think(p, t, y, x, v);
        (p.state === "chase" &&
          m === n &&
          y < 25 &&
          (d += p.def.behavior === "boss" ? 1 : 0.45),
          p.rig && this.syncRig(p, t));
      }
      for (let p of h)
        for (let g of this.list) {
          if (g.dead || g.remote) continue;
          let m = g.def.behavior;
          if (m === "ambush" || m === "drowner" || m === "flyer") continue;
          let x = g.pos.x - p.pos.x,
            v = g.pos.z - p.pos.z,
            y = Math.hypot(x, v),
            _ = g.def.radius + (p.radius || 0.3) + 0.12;
          if (y < _ && y > 1e-4) {
            let M = this.tmpP;
            ((M.x = p.pos.x + (x / y) * _),
              (M.z = p.pos.z + (v / y) * _),
              yc(this.fs.map, M, g.def.radius),
              (g.pos.x = M.x),
              (g.pos.z = M.z));
          }
        }
      e.net && e.net.active && e.net.monTick(t, this);
      for (let p = 0; p < this.list.length; p++) {
        let g = this.list[p];
        if (
          !(
            g.dead ||
            g.remote ||
            (g.td ?? g.d) > 40 ||
            g.def.behavior === "ambush" ||
            g.def.behavior === "flyer"
          )
        )
          for (let m = p + 1; m < this.list.length; m++) {
            let x = this.list[m];
            if (
              x.dead ||
              x.remote ||
              (x.td ?? x.d) > 40 ||
              x.def.behavior === "ambush" ||
              x.def.behavior === "flyer"
            )
              continue;
            let v = x.pos.x - g.pos.x,
              y = x.pos.z - g.pos.z,
              _ = g.def.radius + x.def.radius,
              M = v * v + y * y;
            if (M < _ * _ && M > 1e-6) {
              let b = Math.sqrt(M),
                w = (_ - b) * 0.5;
              ((g.pos.x -= (v / b) * w),
                (g.pos.z -= (y / b) * w),
                (x.pos.x += (v / b) * w),
                (x.pos.z += (y / b) * w));
            }
          }
      }
      this.fear = d;
    }
    targets() {
      let t = this.game,
        e = t.player,
        n = this._tg || (this._tg = []);
      return (
        (n.length = 0),
        !e.dead && !t.spectating && n.push(e),
        t.net && t.net.active && t.net.huntable(this.fs.depth, n),
        n
      );
    }
    pickTarget(t, e) {
      let n = this.game.player;
      if (t.localAI || e.length <= 1) return (t.T = e[0] || n);
      let i = null,
        r = 1e9;
      for (let a of e) {
        let c = Math.hypot(a.pos.x - t.pos.x, a.pos.z - t.pos.z);
        c < r && ((r = c), (i = a));
      }
      let o = t.T && e.includes(t.T) ? t.T : null;
      return (
        o &&
          o !== i &&
          t.state === "chase" &&
          Math.hypot(o.pos.x - t.pos.x, o.pos.z - t.pos.z) < r / 0.6 &&
          (i = o),
        (t.T = i)
      );
    }
    hurtTarget(t, e, n, i = 0) {
      let r = this.game;
      if (t.remote)
        r.net && r.net.hurt(t.id, e, n.def.name, n.pos.x, n.pos.z, i);
      else if ((r.hurtPlayer(e, n.pos, n.def.name), i)) {
        let o = t.pos.x - n.pos.x,
          a = t.pos.z - n.pos.z,
          c = Math.hypot(o, a) || 1;
        ((t.vel.x += (o / c) * i), (t.vel.z += (a / c) * i));
      }
    }
    visOf(t) {
      return t.remote ? t.vis : this.vis;
    }
    seenByAnyone(t) {
      let e = this.game,
        n = e.lf.sample(t.pos.x, t.pos.z);
      if (
        !e.player.dead &&
        !e.spectating &&
        this.inView(t) &&
        (n > 0.08 || e.flashI > 0.3 || t.d < 4)
      )
        return !0;
      if (e.net && e.net.active)
        for (let i of e.net.huntable(this.fs.depth, [])) {
          let r = t.pos.x - i.pos.x,
            o = t.pos.z - i.pos.z,
            a = Math.hypot(r, o);
          if (
            !(a > 38) &&
            !(
              (-Math.sin(i.yaw) * r - Math.cos(i.yaw) * o) /
                Math.max(a, 0.001) <
              0.55
            ) &&
            (n > 0.08 || i.flash || a < 4) &&
            nn(this.fs.map, i.pos.x, i.pos.z, t.pos.x, t.pos.z)
          )
            return !0;
        }
      return !1;
    }
    followNet(t, e, n) {
      (n < 50 && !t.rig ? this.makeRig(t) : n > 68 && t.rig && this.dropRig(t),
        (t.hitFlash = Math.max(0, t.hitFlash - e * 6)),
        (t.anim.t += e));
      let i = t.net;
      if (i) {
        let r = t.pos.x,
          o = t.pos.z,
          a = Math.min(1, e * 9);
        (Math.hypot(i.x - r, i.z - o) > 4
          ? ((t.pos.x = i.x), (t.pos.z = i.z))
          : ((t.pos.x += (i.x - r) * a), (t.pos.z += (i.z - o) * a)),
          i.y && (t.pos.y += (i.y - t.pos.y) * a));
        let c = i.yaw - t.yaw;
        for (; c > Math.PI; ) c -= Math.PI * 2;
        for (; c < -Math.PI; ) c += Math.PI * 2;
        t.yaw += c * a;
        let l = Math.hypot(t.pos.x - r, t.pos.z - o),
          h =
            t.def.rig === "spider"
              ? 0.35
              : t.def.rig === "quad"
                ? 0.8
                : 0.9 * (t.def.height / 1.8);
        ((t.anim.phase += (l / h) * Math.PI),
          (t.anim.moving = i.mv),
          (t.anim.speed = i.sp),
          (t.anim.attack = i.at),
          (t.frozen = !!i.fr));
      }
      t.rig && this.syncRig(t, e);
    }
    setRemote(t) {
      let e = this.game;
      for (let n of this.list) {
        if (n.localAI) {
          n.remote = t;
          continue;
        }
        t
          ? ((n.remote = !0),
            (n.net = {
              x: n.pos.x,
              z: n.pos.z,
              yaw: n.yaw,
              y: n.pos.y,
              mv: 0,
              sp: 0,
              at: 0,
            }))
          : n.remote &&
            ((n.remote = !1),
            n.state !== "chase" &&
              n.state !== "idle" &&
              ((n.state = "idle"), (n.st = 1)),
            (n.tgt = null),
            (n.atk = -1),
            (n.lastSeenT = e.time),
            (n.lastSeen = null));
      }
    }
    think(t, e, n, i, r) {
      let o = this.game,
        a = this.T || o.player,
        c = t.def,
        l = this.fs.map,
        h = c.behavior;
      if (h === "ambush") return this.thinkMaw(t, e, n);
      if (h === "drowner") return this.thinkDrowner(t, e, n);
      if (t.stun > 0) {
        ((t.stun -= e), (t.anim.moving = 0), (t.anim.twitch = 1));
        return;
      }
      ((t.anim.twitch = Math.max(0, t.anim.twitch - e * 2)),
        Math.random() < e * 0.15 && (t.anim.twitch = 0.6),
        (t.percT -= e));
      let u = t._sees || !1;
      if (t.percT <= 0) {
        if (
          ((t.percT = 0.18 + Math.random() * 0.08),
          (u = t._sees = this.canSee(t, n, i, r)),
          u)
        ) {
          ((t.lastSeen = { x: a.pos.x, z: a.pos.z }), (t.lastSeenT = o.time));
          let f =
            this.visOf(a) * (1.3 - n / Math.max(1, c.sight)) * (n < 4 ? 3 : 1);
          ((t.alert += f * 0.55),
            t.alert >= 1 && t.state !== "chase" && this.startChase(t));
        } else t.alert = Math.max(0, t.alert - 0.04);
        if (!u && a.noise > 0 && c.hear > 0 && t.state !== "chase") {
          let f = a.noise * c.hear * 1;
          n < f &&
            (n < f * 0.4 || (h === "blind" && n < 5)
              ? this.startChase(t)
              : this.investigate(t, a.pos.x, a.pos.z, !1));
        }
        (h === "blind" &&
          t.state === "chase" &&
          a.noise <= 0 &&
          o.time - t.lastHeardT > 2.5 &&
          ((t.state = "investigate"),
          (t.tgt = {
            x: a.pos.x + (Math.random() - 0.5) * 6,
            z: a.pos.z + (Math.random() - 0.5) * 6,
          })),
          h === "blind" &&
            a.noise > 0 &&
            n < a.noise * c.hear &&
            (t.lastHeardT = o.time));
      }
      if (h === "statue") return this.thinkStatue(t, e, n, i, r);
      if (h === "dark") return this.thinkSmiler(t, e, n, i, r, u);
      if (h === "flyer") return this.thinkFlyer(t, e, n, i, r, u);
      if (!(h === "charger" && this.thinkCharger(t, e, n, i, r, u))) {
        switch (t.state) {
          case "idle":
            ((t.anim.moving = 0), (t.st -= e), t.st <= 0 && this.pickWander(t));
            break;
          case "wander": {
            if (!t.tgt) {
              ((t.state = "idle"), (t.st = 2 + Math.random() * 4));
              break;
            }
            let f = this.goTo(t, t.tgt.x, t.tgt.z, c.walk, e);
            ((t.st += e),
              (f || t.st > 25) &&
                ((t.state = "idle"), (t.st = 2 + Math.random() * 5)));
            break;
          }
          case "investigate": {
            let f = t.tgt;
            if (!f) {
              t.state = "idle";
              break;
            }
            let d = this.goTo(
              t,
              f.x,
              f.z,
              f.run ? c.run * 0.8 : c.walk * 1.8 + 0.5,
              e,
            );
            ((t.st += e),
              d
                ? ((t.state = "search"), (t.st = 3 + Math.random() * 3))
                : t.st > 30 && ((t.state = "idle"), (t.st = 2)));
            break;
          }
          case "search":
            ((t.anim.moving = 0),
              (t.yaw += Math.sin(o.time * 1.3 + t.anim.phase) * e * 1.5),
              (t.st -= e),
              t.st <= 0 &&
                (t.zoneHome && c.zoneLeash
                  ? this.goHome(t)
                  : this.pickWander(t)));
            break;
          case "return": {
            this.goTo(t, t.tgt.x, t.tgt.z, c.walk * 1.5, e) &&
              ((t.state = "idle"), (t.st = 3));
            break;
          }
          case "chase": {
            let f = h === "stalker" || (h === "boss" && o.inBlack),
              d = u || f || o.time - t.lastSeenT < 1.5 || n < 3;
            if (!d && o.time - t.lastSeenT > c.memory) {
              ((t.state = "investigate"),
                (t.tgt = t.lastSeen
                  ? { x: t.lastSeen.x, z: t.lastSeen.z, run: !0 }
                  : null),
                (t.st = 0),
                h === "boss" && ((t.state = "idle"), (t.st = 4)));
              break;
            }
            if (c.zoneLeash && t.zoneHome && !u) {
              let x = t.zoneHome,
                v = (x.cx + 0.5) * 4,
                y = (x.cy + 0.5) * 4;
              if (Math.hypot(t.pos.x - v, t.pos.z - y) > x.r * 4 + 30) {
                this.goHome(t);
                break;
              }
            }
            let p = a.pos.x,
              g = a.pos.z;
            !d && t.lastSeen && ((p = t.lastSeen.x), (g = t.lastSeen.z));
            let m = c.run * (h === "boss" && !o.inBlack ? 0.85 : 1);
            (n > c.reach * 0.75 || !u
              ? this.chaseMove(t, p, g, m, e, d)
              : ((t.anim.moving = 0), this.face(t, i, r, e * 8)),
              n < c.reach &&
                t.atk < 0 &&
                t.atkT <= 0 &&
                nn(l, t.pos.x, t.pos.z, a.pos.x, a.pos.z) &&
                this.startAttack(t),
              c.sticky &&
                n < c.reach + 0.3 &&
                !a.remote &&
                (a.slow = Math.max(a.slow, c.sticky)));
            break;
          }
        }
        (this.updateAttack(t, e, n), this.ambientVoice(t, e, n));
      }
    }
    canSee(t, e, n, i) {
      let r = t.def,
        o = this.game,
        a = this.T || o.player;
      if (a.dead || r.sight <= 0 || e > r.sight) return !1;
      if (e > 2.5 && r.fov < 360) {
        let c = Math.sin(t.yaw),
          l = Math.cos(t.yaw);
        if (
          (c * n + l * i) / Math.max(e, 0.001) <
          Math.cos((r.fov * Math.PI) / 360)
        )
          return !1;
      }
      return nn(this.fs.map, t.pos.x, t.pos.z, a.pos.x, a.pos.z)
        ? this.visOf(a) < 0.3 && e > 6 && r.behavior !== "boss"
          ? Math.random() < 0.3
          : !0
        : !1;
    }
    startChase(t) {
      if (t.state === "chase") return;
      ((t.state = "chase"), (t.st = 0), (t.alert = 1));
      let e = t.T || this.game.player;
      ((t.lastSeenT = this.game.time),
        (t.lastSeen = { x: e.pos.x, z: e.pos.z }),
        this.voice(t, "alert", 1),
        t.def.behavior === "boss" &&
          this.game.audio &&
          this.game.audio.sfx("sting_black", { vol: 0.7, important: !0 }));
    }
    pickWander(t) {
      let e = this.fs.map,
        n = t.def,
        i = this.cellOf(t.pos.x, t.pos.z),
        r = i % e.W,
        o = (i / e.W) | 0,
        a = n.behavior === "boss" ? 22 : 6;
      for (let c = 0; c < 6; c++) {
        let l = ke(r + Math.round((Math.random() - 0.5) * 2 * a), 1, e.W - 2),
          h = ke(o + Math.round((Math.random() - 0.5) * 2 * a), 1, e.H - 2),
          u = e.ci(l, h);
        if (
          !(e.floor[u] === 1 || !e.reach[u]) &&
          !(t.zoneHome && n.zoneLeash && e.zone[u] !== t.zoneHome.id) &&
          !(n.behavior === "dark" && e.light[u] === 1)
        ) {
          ((t.state = "wander"),
            (t.st = 0),
            (t.tgt = { x: (l + 0.5) * 4, z: (h + 0.5) * 4 }));
          return;
        }
      }
      ((t.state = "idle"), (t.st = 2 + Math.random() * 3));
    }
    goHome(t) {
      let e = t.zoneHome;
      ((t.state = "return"),
        (t.tgt = { x: (e.cx + 0.5) * 4, z: (e.cy + 0.5) * 4 }),
        (t.st = 0));
    }
    goTo(t, e, n, i, r) {
      if (Math.hypot(e - t.pos.x, n - t.pos.z) < 0.9)
        return ((t.anim.moving = 0), !0);
      let a = this.cellOf(e, n),
        c = this.cellOf(t.pos.x, t.pos.z),
        l = e,
        h = n;
      if (a !== c) {
        let u = this.fieldTo(a, !!t.def.duct);
        if (u[c] < 0) return ((t.anim.moving = 0), !0);
        let f = this.nextWaypoint(t, u);
        f && ((l = f.x), (h = f.z));
      }
      return (this.step(t, l - t.pos.x, h - t.pos.z, i, r), !1);
    }
    chaseMove(t, e, n, i, r, o) {
      let a = this.fs.map,
        c = Math.hypot(e - t.pos.x, n - t.pos.z),
        l = e,
        h = n;
      if (
        !(
          c < 14 &&
          nn(a, t.pos.x, t.pos.z, e, n) &&
          (() => {
            let f = ni(
              a,
              t.pos.x,
              t.pos.z,
              e - t.pos.x,
              n - t.pos.z,
              c,
              "move",
            );
            return !f.kind || f.dist >= c - 0.1;
          })()
        )
      ) {
        let f = this.fieldTo(this.cellOf(e, n), !!t.def.duct),
          d = this.nextWaypoint(t, f);
        d && ((l = d.x), (h = d.z));
      }
      this.step(t, l - t.pos.x, h - t.pos.z, i, r);
    }
    step(t, e, n, i, r) {
      let o = Math.hypot(e, n);
      if (o < 1e-4) {
        t.anim.moving = 0;
        return;
      }
      this.face(t, e, n, r * (i > 2.5 ? 7 : 3.5));
      let a = Math.sin(t.yaw),
        c = Math.cos(t.yaw),
        l = ke((a * e + c * n) / o, 0.2, 1),
        h = i * l * (this.speedK || 1),
        u = this.game.miasma;
      u && u.clouds.length && u.shelter(t.pos.x, t.pos.z) > 0.3 && (h *= 0.6);
      let f = this.tmpP,
        d = t.pos.x,
        p = t.pos.z;
      if (
        ((f.x = d + (e / o) * h * r),
        (f.z = p + (n / o) * h * r),
        t.def.behavior !== "flyer" &&
          yc(this.fs.map, f, t.def.radius, !!t.def.duct),
        t.def.behavior !== "flyer")
      ) {
        let x = this.fs.map,
          v = Math.floor(f.x / 4),
          y = Math.floor(f.z / 4);
        (!rr(x, f.x, f.z) ||
          (x.inb(v, y) &&
            x.floor[x.ci(v, y)] === 2 &&
            t.def.behavior !== "drowner")) &&
          ((f.x = d), (f.z = p));
      }
      ((t.pos.x = f.x), (t.pos.z = f.z));
      let g = Math.hypot(f.x - d, f.z - p);
      ((t.moved = g / Math.max(r, 1e-4)),
        (t.anim.moving = ke(t.moved / Math.max(0.5, t.def.walk), 0, 1)),
        (t.anim.speed = ke(
          (t.moved - t.def.walk) / Math.max(0.5, t.def.run - t.def.walk),
          0,
          1,
        )));
      let m =
        t.def.rig === "spider"
          ? 0.35
          : t.def.rig === "quad"
            ? 0.8
            : 0.9 * (t.def.height / 1.8);
      if (((t.anim.phase += (g / m) * Math.PI), t.def.snd.move && t.d < 14))
        ((t.moveSndT = (t.moveSndT || 0) - r),
          t.moveSndT <= 0 &&
            t.moved > 0.5 &&
            ((t.moveSndT = 0.5 + Math.random() * 0.4),
            this.game.audio &&
              this.game.audio.sfx(t.def.snd.move, {
                pos: t.pos,
                vol: 0.35,
                range: 25,
                vary: 0.2,
              })));
      else if (
        !t.def.snd.move &&
        (t.def.rig === "biped" || t.def.rig === "quad") &&
        !t.def.body.noLegs &&
        t.d < 26
      ) {
        let x = Math.floor(t.anim.phase / Math.PI);
        if (
          x !== t._stepPh &&
          ((t._stepPh = x), t.moved > 0.4 && this.game.audio)
        ) {
          let v = t.def.height > 2.1 || t.def.rig === "quad",
            y = this.fs.theme.floorKind,
            _ =
              y === "carpet" || y === "officeCarpet"
                ? "step_carpet"
                : y === "grating"
                  ? "step_metal"
                  : "step_hard";
          this.game.audio.sfx(_, {
            pos: t.pos,
            vol: (t.anim.speed > 0.5 ? 0.75 : 0.4) * (v ? 1.2 : 1),
            range: 30,
            rate: v ? 0.6 : 0.8,
            vary: 0.15,
          });
        }
      }
    }
    face(t, e, n, i) {
      let o = Math.atan2(e, n) - t.yaw;
      for (; o > Math.PI; ) o -= Math.PI * 2;
      for (; o < -Math.PI; ) o += Math.PI * 2;
      t.yaw += o * Math.min(1, i);
    }
    startAttack(t) {
      ((t.atk = 0),
        (t.atkDone = !1),
        (t.atkT = t.def.atkRate),
        this.voice(t, "attack", 0.9));
    }
    updateAttack(t, e, n) {
      if (t.atk < 0) {
        t.anim.attack = 0;
        return;
      }
      let i = t.def,
        r = this.game,
        o = this.T || r.player;
      ((t.atk += e / i.atkTime),
        (t.anim.attack = Math.min(1, t.atk)),
        !t.atkDone &&
          t.atk >= i.atkHit &&
          ((t.atkDone = !0),
          n < i.reach + 0.45 &&
            !o.dead &&
            nn(this.fs.map, t.pos.x, t.pos.z, o.pos.x, o.pos.z) &&
            this.hurtTarget(
              o,
              i.dmg * (0.85 + Math.random() * 0.3),
              t,
              Math.min(6, i.dmg / 6),
            )),
        t.atk >= 1 && ((t.atk = -1), (t.anim.attack = 0)));
    }
    inView(t) {
      let e = this.game,
        n = new L(t.pos.x, t.def.height * 0.6, t.pos.z);
      if (!this.frustum.containsPoint(n)) {
        let i = new L(t.pos.x, t.def.height * 0.95, t.pos.z);
        if (!this.frustum.containsPoint(i)) return !1;
      }
      return nn(
        this.fs.map,
        e.camera.position.x,
        e.camera.position.z,
        t.pos.x,
        t.pos.z,
      );
    }
    thinkStatue(t, e, n, i, r) {
      let o = this.game,
        a = this.T || o.player,
        c = t.def;
      if (n > 38) {
        t.anim.moving = 0;
        return;
      }
      let l = this.seenByAnyone(t);
      if (((t.frozen = l), l)) {
        t.anim.moving = 0;
        return;
      }
      (t.state !== "chase" && ((t.state = "chase"), (t.lastSeenT = o.time)),
        this.chaseMove(t, a.pos.x, a.pos.z, c.run, e, !0),
        (t.anim.phase += e * 5),
        n < c.reach &&
          t.atkT <= 0 &&
          ((t.atkT = c.atkRate),
          this.hurtTarget(a, c.dmg, t),
          o.audio && o.audio.sfx("hit_wall", { vol: 0.8, pos: t.pos })),
        n < 16 &&
          ((t.sndT -= e),
          t.sndT <= 0 &&
            ((t.sndT = 1.2 + Math.random()),
            o.audio &&
              o.audio.sfx("creak", {
                pos: t.pos,
                vol: 0.5,
                range: 25,
                rate: 1.4,
              }))));
    }
    thinkSmiler(t, e, n, i, r, o) {
      let a = this.game,
        c = this.T || a.player,
        l = t.def,
        h = this.fs.map,
        u = a.lightAt(t.pos.x, t.pos.z),
        f = !1;
      if ((c.remote ? c.flash : a.flashI > 0.4) && n < 14) {
        let d = c.remote
            ? { x: -Math.sin(c.yaw), z: -Math.cos(c.yaw) }
            : c.forward,
          p = -i / Math.max(n, 0.001),
          g = -r / Math.max(n, 0.001);
        (d.x * p + d.z * g) / Math.max(0.001, Math.hypot(d.x, d.z)) > 0.95 &&
          nn(h, c.pos.x, c.pos.z, t.pos.x, t.pos.z) &&
          (f = !0);
      }
      if (
        ((t.beamT = f ? t.beamT + e : Math.max(0, t.beamT - e * 0.5)),
        t.state !== "chase" &&
          t.beamT > 0.55 &&
          (this.startChase(t), (t.lunge = !0)),
        t.state === "chase")
      ) {
        if (u > 0.9 && n > 3 && !t.lunge) {
          this.goHome2(t);
          return;
        }
        let d = t.lunge || n < 4 ? l.run : 1.3;
        (this.chaseMove(t, c.pos.x, c.pos.z, d, e, !0),
          n < l.reach && t.atk < 0 && t.atkT <= 0 && this.startAttack(t),
          a.time - t.lastSeenT > 6 && !o && ((t.lunge = !1), this.goHome2(t)),
          o && (t.lastSeenT = a.time));
      } else
        o && n < 9 && (c.remote ? c.light : a.localLight) < 0.35
          ? (this.step(t, i, r, 0.6, e),
            n < 3.5 && (this.startChase(t), (t.lunge = !0)))
          : ((t.anim.moving = 0),
            this.face(t, i, r, e * 0.5),
            t.state === "return" &&
              t.tgt &&
              this.goTo(t, t.tgt.x, t.tgt.z, 1.4, e) &&
              (t.state = "idle"));
      (this.updateAttack(t, e, n),
        n < 12 && Math.random() < e * 0.08 && this.voice(t, "idle", 0.25));
    }
    goHome2(t) {
      let e = this.fs.map,
        n = t.home;
      ((t.state = "return"),
        (t.tgt = { x: ((n % e.W) + 0.5) * 4, z: (((n / e.W) | 0) + 0.5) * 4 }));
    }
    thinkFlyer(t, e, n, i, r, o) {
      let a = this.game,
        c = this.T || a.player,
        l = t.def;
      if (((t.fy = t.fy ?? 2.4), t.state === "chase" || (o && t.alert > 0.6))) {
        (t.state !== "chase" && this.startChase(t),
          (t.swoop = t.swoop ?? 0),
          t.swoopT > 0 && (t.swoopT -= e),
          n < 7 &&
            t.swoopT <= 0 &&
            !t.diving &&
            ((t.diving = !0), this.voice(t, "attack", 0.9)));
        let h = t.diving
          ? 1.3
          : 2.6 + Math.sin(a.time * 2 + t.anim.phase) * 0.3;
        t.fy = _n(t.fy, h, e * (t.diving ? 3 : 1.2));
        let u = t.diving ? l.run : l.walk * 1.5,
          f = c.pos.x,
          d = c.pos.z;
        if (!t.diving) {
          let p = a.time * 0.8 + t.anim.phase;
          ((f += Math.cos(p) * 6), (d += Math.sin(p) * 6));
        }
        (this.step(t, f - t.pos.x, d - t.pos.z, u, e),
          t.diving &&
            n < 1.2 &&
            ((t.diving = !1),
            (t.swoopT = l.atkRate),
            this.hurtTarget(c, l.dmg, t, 7)),
          t.diving && t.st > 3 && ((t.diving = !1), (t.swoopT = 1.5)),
          (t.st += e),
          t.diving || (t.st = 0),
          !o && a.time - t.lastSeenT > l.memory && (t.state = "idle"),
          o && (t.lastSeenT = a.time));
      } else {
        t.fy = _n(t.fy, 3 + Math.sin(a.time + t.anim.phase) * 0.4, e);
        let h = a.time * 0.3 + t.anim.phase;
        this.step(t, Math.cos(h), Math.sin(h), l.walk, e);
      }
      ((t.pos.y = t.fy),
        (t.anim.speed = t.diving ? 1 : 0.3),
        (t.anim.attack = t.diving ? 0.5 : 0));
    }
    thinkCharger(t, e, n, i, r, o) {
      let a = this.game,
        c = this.T || a.player,
        l = t.def;
      if (t.charge) {
        let h = t.charge;
        if (((h.t += e), h.t < 0.7))
          return (
            this.face(t, c.pos.x - t.pos.x, c.pos.z - t.pos.z, e * 6),
            (t.anim.moving = 0),
            (h.dx = Math.sin(t.yaw)),
            (h.dz = Math.cos(t.yaw)),
            !0
          );
        let u = t.pos.x,
          f = t.pos.z,
          d = this.tmpP;
        ((d.x = u + h.dx * 9 * e),
          (d.z = f + h.dz * 9 * e),
          yc(this.fs.map, d, l.radius),
          (t.pos.x = d.x),
          (t.pos.z = d.z));
        let p = Math.hypot(d.x - u, d.z - f);
        return (
          (t.anim.moving = 1),
          (t.anim.speed = 1),
          (t.anim.phase += (p / 0.9) * Math.PI),
          n < 1.3 && !h.hit && ((h.hit = !0), this.hurtTarget(c, l.dmg, t, 8)),
          (p < 9 * e * 0.4 || h.t > 3.2) &&
            (p < 9 * e * 0.4 &&
              ((t.stun = 1.6),
              a.audio &&
                a.audio.sfx("hit_metal", {
                  pos: t.pos,
                  vol: 0.8,
                  range: 40,
                  rate: 0.6,
                }),
              c.remote ||
                (c.shake = Math.max(c.shake, ke(1 - n / 20, 0, 0.5)))),
            (t.charge = null),
            (t.atkT = 1.5)),
          !0
        );
      }
      return t.state === "chase" && o && n < 22 && n > 3 && t.atkT <= 0
        ? ((t.charge = { t: 0, dx: 0, dz: 0 }), this.voice(t, "alert", 1), !0)
        : !1;
    }
    thinkMaw(t, e, n) {
      let i = this.game,
        r = i.player,
        o = t.def;
      if (((t.anim.moving = 0), t.stun > 0)) {
        ((t.stun -= e), (t.anim.attack = Math.max(0, t.anim.attack - e)));
        return;
      }
      if (t.grab) {
        let c = t.grab;
        if (
          ((c.t += e),
          (t.anim.attack = Math.min(1, c.t / 2.2)),
          (r.stuck = 0.2),
          (r.pos.x = _n(r.pos.x, t.pos.x, e * 4)),
          (r.pos.z = _n(r.pos.z, t.pos.z, e * 4)),
          (r.eye = Math.min(2.6, r.eye + e * 0.3)),
          i.input.take("attack") &&
            (c.hits++,
            this.damage(t, 20, null, "melee", { quiet: !0 }),
            i.combat && i.combat.blood(t.pos.x, 1.8, t.pos.z, 8, o.blood),
            i.audio && i.audio.sfx("hit_flesh", { vol: 0.9 }),
            c.hits >= 3 || t.hp <= 0))
        ) {
          ((t.grab = null),
            (t.stun = 4),
            i.toast("振りほどいた！", 1200),
            t.hp <= 0 && this.kill(t));
          return;
        }
        c.t >= 2.2 &&
          ((t.grab = null),
          i.kill("天井の口に呑まれた"));
        return;
      }
      ((t.anim.attack = Math.max(0, t.anim.attack - e)),
        Math.hypot(r.pos.x - t.pos.x, r.pos.z - t.pos.z) < 0.55 &&
          r.eye > 0.7 &&
          !r.dead &&
          i.state === "play" &&
          ((t.grab = { t: 0, hits: 0 }),
          i.audio && i.audio.sfx("squelch", { vol: 1, important: !0 }),
          i.toast(
            "捕まった！ 攻撃ボタンを連打！",
            2200,
          ),
          (i.fx.damage = 1)),
        n < 10 &&
          ((t.sndT -= e),
          t.sndT <= 0 &&
            ((t.sndT = 3 + Math.random() * 4),
            i.audio &&
              i.audio.sfx("squelch", {
                pos: t.pos,
                vol: 0.3,
                range: 15,
                rate: 0.7,
              }))));
    }
    thinkDrowner(t, e, n) {
      let i = this.game,
        r = i.player,
        o = t.def;
      if (((t.anim.moving = 0), t.stun > 0)) {
        ((t.stun -= e), (t.anim.attack = 0));
        return;
      }
      let a = r.water === 2;
      a && n < 2.6
        ? ((t.anim.attack = 1),
          (r.slow = Math.max(r.slow, 0.7)),
          (t.dmgT = (t.dmgT || 0) - e),
          t.dmgT <= 0 &&
            ((t.dmgT = 0.8),
            i.hurtPlayer(o.dmg * 0.8, t.pos, o.name),
            (i.fx.underwater = Math.min(1, i.fx.underwater + 0.5))),
          t.grabbing ||
            ((t.grabbing = !0),
            i.toast(
              "何かに足を掴まれた！ 攻撃して振りほどけ",
              1800,
            ),
            i.audio && i.audio.sfx("squelch", { vol: 1 })),
          i.input.take("attack") &&
            (this.damage(t, 25, null, "melee", { quiet: !0 }),
            t.dead || ((t.stun = 2.5), (t.grabbing = !1))))
        : ((t.grabbing = !1),
          (t.anim.attack = 0),
          (t.anim.moving = a && n < 8 ? 1 : 0));
    }
    ambientVoice(t, e, n) {
      n > 26 ||
        ((t.sndT -= e),
        t.sndT <= 0 &&
          ((t.sndT = 5 + Math.random() * 9),
          t.def.snd.idle &&
            this.voice(t, "idle", t.state === "chase" ? 0.5 : 0.3)));
    }
    voice(t, e, n) {
      let i = t.def.snd[e];
      if (!i || !this.game.audio) return;
      let r =
        t.def.behavior === "boss"
          ? 0.6
          : t.def.height > 2.2
            ? 0.75
            : t.def.height < 0.6
              ? 1.6
              : 1;
      this.game.audio.sfx(i, {
        pos: t.pos,
        vol: n,
        range: t.def.behavior === "boss" ? 90 : 45,
        rate: r,
        vary: 0.15,
      });
    }
    updateBlack(t) {
      let e = this.game,
        n = e.player,
        i = this.black,
        r = e.shared.uBlack.value;
      if (!i) {
        (r.set(0, 0, 0, 0), (e.inBlack = !1), (e.blackLocal = 0));
        return;
      }
      let o = i.mon;
      if (o && !o.dead) {
        let h = o.state === "chase" ? 0.06 : 0.25;
        ((i.x += (o.pos.x - i.x) * Math.min(1, t * h)),
          (i.z += (o.pos.z - i.z) * Math.min(1, t * h)));
      } else i.fade = Math.max(0, i.fade - t * 0.2);
      let a = i.r * i.fade;
      (r.set(i.x, i.z, a, i.fade > 0 ? 1 : 0),
        (this.fs.miasma || 0) >= 100 &&
          o &&
          !o.dead &&
          !o.remote &&
          o.state !== "chase" &&
          this.startChase(o));
      let c = Math.hypot(n.pos.x - i.x, n.pos.z - i.z),
        l = a > 1 && c < a * 0.82;
      if (
        (l !== e.inBlack &&
          ((e.inBlack = l),
          (e._lastCell = -1),
          l &&
            e.audio &&
            e.audio.sfx("sting_black", { vol: 0.9, important: !0 })),
        (e.blackLocal = a > 1 ? ke(1 - (c - a * 0.75) / (a * 0.3), 0, 1) : 0),
        (e.fx.static = Math.max(
          e.fx.static,
          e.blackLocal * (0.12 + 0.1 * Math.random()),
        )),
        l &&
          o &&
          !o.dead &&
          !o.remote &&
          o.state !== "chase" &&
          this.startChase(o),
        o &&
          !o.dead &&
          !o.remote &&
          o.state !== "chase" &&
          a > 1 &&
          e.net &&
          e.net.active)
      ) {
        for (let h of e.net.huntable(this.fs.depth, []))
          if (Math.hypot(h.pos.x - i.x, h.pos.z - i.z) < a * 0.82) {
            ((o.T = h), this.startChase(o));
            break;
          }
      }
    }
    meleeTarget(t, e, n) {
      let i = null,
        r = 1e9,
        o = e.x,
        a = e.z,
        c = Math.hypot(o, a) || 1;
      for (let l of this.list) {
        if (l.dead || l.d > n + 2) continue;
        let h = l.pos.x - t.x,
          u = l.pos.z - t.z,
          f = Math.hypot(h, u) - l.def.radius;
        if (
          !(
            f > n ||
            ((h * o + u * a) / (Math.max(0.001, Math.hypot(h, u)) * c) < 0.72 &&
              f > 0.4)
          )
        ) {
          if (l.def.behavior === "ambush") {
            let p = l.def.body.ceil - 0.6;
            if (t.y + e.y * f < p - 1.5) continue;
          }
          nn(this.fs.map, t.x, t.z, l.pos.x, l.pos.z) &&
            f < r &&
            ((r = f), (i = l));
        }
      }
      return i;
    }
    raycast(t, e, n) {
      let i = null;
      for (let r of this.list) {
        if (r.dead || r.d > n + 3) continue;
        let o = r.def,
          a = o.behavior === "ambush" ? o.body.ceil : o.height,
          c = r.pos.y,
          l =
            o.behavior === "ambush"
              ? [
                  [0, a - 0.1, 0.5],
                  [0, o.body.tip + 0.6, 0.15],
                ]
              : o.rig === "quad" || o.rig === "spider"
                ? [
                    [0, c + a * 0.6, o.radius * 1.1],
                    [0, c + a * 0.9, o.radius * 0.7],
                  ]
                : o.rig === "arms"
                  ? [[0, -0.2, 0.6]]
                  : o.rig === "flyer"
                    ? [[0, c, 0.45]]
                    : [
                        [0, c + a * 0.35, o.radius * 1.05],
                        [0, c + a * 0.62, o.radius * 1.1],
                        [0, c + a * 0.9, o.radius * 0.75],
                      ];
        for (let h = 0; h < l.length; h++) {
          let [u, f, d] = l[h],
            p = r.pos.x - t.x,
            g = f - t.y,
            m = r.pos.z - t.z,
            x = p * e.x + g * e.y + m * e.z;
          if (x < 0 || x > n) continue;
          let v = p - e.x * x,
            y = g - e.y * x,
            _ = m - e.z * x;
          v * v + y * y + _ * _ < d * d &&
            (!i || x < i.t) &&
            (i = {
              m: r,
              t: x,
              p: new L(t.x + e.x * x, t.y + e.y * x, t.z + e.z * x),
              head: h === l.length - 1 && o.rig === "biped",
            });
        }
      }
      return i;
    }
    assist(t, e, n) {
      let i = null,
        r = Math.cos(n);
      for (let o of this.list) {
        if (o.dead || o.d > 40) continue;
        let a = o.pos.x - t.x,
          c =
            (o.def.behavior === "ambush"
              ? o.def.body.ceil - 0.4
              : o.pos.y + o.def.height * 0.6) - t.y,
          l = o.pos.z - t.z,
          h = Math.hypot(a, c, l),
          u = (a * e.x + c * e.y + l * e.z) / h;
        u > r &&
          nn(this.fs.map, t.x, t.z, o.pos.x, o.pos.z) &&
          ((r = u), (i = [a / h, c / h, l / h]));
      }
      i &&
        ((e.x = _n(e.x, i[0], 0.7)),
        (e.y = _n(e.y, i[1], 0.7)),
        (e.z = _n(e.z, i[2], 0.7)),
        e.normalize());
    }
    damage(t, e, n, i, r = {}) {
      if (t.dead) return;
      let o = this.game;
      if (t.remote && !r.net) {
        ((t.hitFlash = 1),
          (t.hitByMe = o.time),
          o.net && o.net.monHit(this.fs.depth, t.nid, e, i, r.stun || 0),
          t.localAI && ((t.hp -= e), t.hp <= 0 && this.kill(t)));
        return;
      }
      if (
        (r.net || (t.hitByMe = o.time),
        (t.hp -= e),
        (t.hitFlash = 1),
        r.stun && (t.stun = Math.max(t.stun, r.stun)),
        t.def.behavior !== "boss" &&
          e > 20 &&
          (t.stun = Math.max(t.stun, 0.25)),
        t.hp <= 0)
      ) {
        this.kill(t);
        return;
      }
      if (
        t.def.behavior !== "ambush" &&
        t.def.behavior !== "drowner" &&
        t.def.behavior !== "statue"
      ) {
        (r.by && (t.T = r.by), t.state !== "chase" && this.startChase(t));
        let a = r.by || o.player;
        ((t.lastSeenT = o.time), (t.lastSeen = { x: a.pos.x, z: a.pos.z }));
      }
      Math.random() < 0.5 && !r.quiet && this.voice(t, "attack", 0.7);
    }
    stunArea(t, e, n, i) {
      for (let r of this.list)
        if (
          !(r.dead || Math.hypot(r.pos.x - t.x, r.pos.z - t.z) > e) &&
          !(!i && !nn(this.fs.map, t.x, t.z, r.pos.x, r.pos.z))
        ) {
          if (r.remote && !r.localAI) {
            this.game.net &&
              this.game.net.monHit(this.fs.depth, r.nid, 0, "stun", n, t);
            continue;
          }
          ((r.stun = Math.max(
            r.stun,
            r.def.behavior === "boss" ? n * 0.35 : n,
          )),
            (r.atk = -1),
            (r.grab = null),
            (r.charge = null),
            (r.diving = !1),
            r.state !== "chase" &&
              r.def.behavior !== "ambush" &&
              r.def.behavior !== "drowner" &&
              ((r.state = "investigate"),
              (r.tgt = { x: t.x, z: t.z, run: !0 })));
        }
    }
    spawnTick(t) {
      let e = this.game,
        n = this.fs,
        i = n.miasma || 0;
      if (i < 15 || (e.net && e.net.active && !e.net.ownsFloor(n.depth)))
        return;
      let r = this.targets();
      if (!r.length) return;
      let o = r[Math.floor(Math.random() * r.length)];
      if (
        ((this.spawnT = (this.spawnT ?? 18) - t * (0.35 + (i / 100) * 1.65)),
        this.spawnT > 0)
      )
        return;
      this.spawnT = 18;
      let a = 0;
      for (let f of this.list) f.spawned && !f.dead && a++;
      if (a >= 4 + Math.floor(i / 9)) return;
      let c = n.map,
        l = this.fieldTo(this.cellOf(o.pos.x, o.pos.z)),
        h = (Hd[n.themeId] || Hd.yellow).slice();
      (i > 45 && h.push(["hound", 2.5]),
        i > 70 && h.push(["butcher", 1], ["tall", 1.5]));
      let u = [];
      for (let f = 0; f < c.N; f++)
        l[f] >= 7 &&
          l[f] <= 15 &&
          c.floor[f] !== 6 &&
          c.floor[f] !== 2 &&
          c.feat[f] === 0 &&
          u.push(f);
      for (let f = 0; f < 30 && u.length; f++) {
        let d = u[Math.floor(Math.random() * u.length)],
          p = ((d % c.W) + 0.5) * 4,
          g = (((d / c.W) | 0) + 0.5) * 4;
        if (
          nn(c, o.pos.x, o.pos.z, p, g) &&
          Math.hypot(p - o.pos.x, g - o.pos.z) < 40
        )
          continue;
        let m = this.pickWeighted(h),
          x = this.makeMon(m, p, g, Math.random() * 6.28, {
            home: d,
            spawned: !0,
          });
        ((x.nid =
          e.net && e.net.active ? e.net.newMonId() : 1e5 + this.list.length),
          (x.state = "investigate"),
          (x.tgt = {
            x: o.pos.x + (Math.random() - 0.5) * 8,
            z: o.pos.z + (Math.random() - 0.5) * 8,
            run: i > 60,
          }),
          (x.alert = 0.5),
          this.list.push(x),
          e.net && e.net.active && e.net.monSpawn(n.depth, x),
          Math.random() < 0.5 &&
            e.audio &&
            e.audio.sfx(x.def.snd.alert || "growl", {
              pos: x.pos,
              vol: 0.5,
              range: 60,
              rate: 0.8,
            }));
        return;
      }
    }
    pickWeighted(t) {
      let e = 0;
      for (let i of t) e += i[1];
      let n = Math.random() * e;
      for (let i of t) if (((n -= i[1]), n <= 0)) return i[0];
      return t[0][0];
    }
    explosion(t, e, n) {
      for (let i of this.list) {
        if (i.dead) continue;
        let r = Math.hypot(i.pos.x - t.x, i.pos.z - t.z);
        if (r > e || !nn(this.fs.map, t.x, t.z, i.pos.x, i.pos.z)) continue;
        let o = Math.pow(1 - r / e, 1.1);
        (this.damage(i, n * o, t, "explosion", {
          stun: i.def.behavior === "boss" ? 4 : 2.5 * o,
        }),
          i.def.behavior === "ambush" && (i.grab = null));
      }
    }
    kill(t) {
      let e = this.game;
      if (t.dead) return;
      ((t.dead = !0),
        (t.state = "dead"),
        (t.deadT = 0),
        (t.grab = null),
        t.hitByMe !== void 0 && e.time - t.hitByMe < 3 && e.run.kills++,
        this.voice(t, "alert", 0.8));
      let n = t.def;
      if (!t.remote) {
        if (n.drop && Math.random() < n.drop && e.items) {
          let i = [1500, 4e3, 8e3, 14e3, 24e3][Math.min(5,this.fs.depth) - 1],
            r =
              n.behavior === "boss"
                ? i * 25
                : Math.round(
                    (i * (n.hp / 80) * (0.6 + Math.random() * 0.8)) / 100,
                  ) * 100;
          e.dropItemNet(
            n.behavior === "boss" ? "gold" : "cash",
            t.pos.x,
            t.pos.z,
            { value: r, y: 0.01 },
          );
        }
        n.behavior === "boss" &&
          e.toast(
            "黒い者を倒した。黒い区画が晴れていく",
            3e3,
          );
      }
    }
    updateDead(t, e) {
      if (((t.deadT += e), t.rig)) {
        let n = t.rig,
          i = Math.min(1, t.deadT / 0.7);
        t.def.rig === "maw"
          ? (n.root.position.y = -i * 0.5)
          : t.def.rig === "flyer"
            ? ((t.pos.y = Math.max(0.1, t.pos.y - e * 6)),
              (n.root.position.y = t.pos.y),
              (n.root.rotation.z = i * 2))
            : n.sdf && n.type === "biped"
              ? J1(n, Math.min(1, t.deadT / 1.3), t.home || 0)
              : ((n.root.rotation.x = i * i * 1.45), (n.root.position.y = 0));
        let r = Math.max(0, t.deadT - 8) * 0.1;
        ((n.root.position.y -= r),
          (n.mat.uniforms.uHit.value = 0),
          (n.mat.uniforms.uDark.value = Math.min(0.6, t.deadT * 0.1)),
          t.deadT > 14 && this.dropRig(t));
      }
    }
    warmup() {
      let t = new We();
      this._warm = [];
      for (let n of ["wanderer", "smiler", "wraith", "skitter"]) {
        let i = Q1(this.game.shared, Vr[n]);
        (i.root.position.set(0, 0, -2), t.add(i.root), this._warm.push(i));
      }
      let e = g_(this.game.shared);
      return (e.position.set(0, 1, -2), t.add(e), (this._warmMesh = e), t);
    }
    unwarm() {
      for (let t of this._warm || []) Hr(t);
      ((this._warm = null),
        this._warmMesh &&
          (this._warmMesh.material.dispose(),
          this._warmMesh.geometry.dispose(),
          (this._warmMesh = null)));
    }
    makeRig(t) {
      let e = t.def,
        n = Q1(this.game.shared, e);
      ((t.rig = n),
        this.game.scene.add(n.root),
        e.rig === "maw" && n.root.position.set(t.pos.x, 0, t.pos.z));
    }
    byNid(t) {
      return (
        (!this._nidMap ||
          this._nidN !== this.list.length ||
          this._nidL !== this.list) &&
          ((this._nidMap = new Map(this.list.map((e) => [e.nid, e]))),
          (this._nidN = this.list.length),
          (this._nidL = this.list)),
        this._nidMap.get(t)
      );
    }
    inFrustum(t) {
      let e = this._sph || (this._sph = new Qe());
      return (
        e.center.set(t.pos.x, t.def.height * 0.5, t.pos.z),
        (e.radius = t.def.height),
        this.frustum.intersectsSphere(e)
      );
    }
    dropRig(t) {
      t.rig && (this.game.scene.remove(t.rig.root), Hr(t.rig), (t.rig = null));
    }
    syncRig(t, e) {
      let n = t.rig,
        i = t.def,
        r = this.game;
      (n.sdf ||
        ((t._upT = (t._upT || 0) - e),
        t._upT <= 0 &&
          ((t._upT = 0.5),
          d_(i) &&
            !t.dead &&
            (t.d > 14 || !this.inFrustum(t)) &&
            (this.dropRig(t), this.makeRig(t), (n = t.rig)))),
        n.setLOD && n.setLOD(t.d),
        n.root.position.set(
          t.pos.x,
          i.behavior === "flyer" ? t.pos.y : r.fs && r.fs.map.trains ? Math.min(0, groundY(r.fs.map, t.pos.x, t.pos.z) + 0.02) : 0,
          t.pos.z,
        ),
        i.rig !== "maw" && i.rig !== "arms" && (n.root.rotation.y = t.yaw));
      let o = t.anim,
        a = (t.T && t.T.pos) || r.viewPos || r.player.pos,
        c = a.x - t.pos.x,
        l = a.z - t.pos.z,
        h = Math.atan2(c, l) - t.yaw;
      for (; h > Math.PI; ) h -= Math.PI * 2;
      for (; h < -Math.PI; ) h += Math.PI * 2;
      let u = t.state === "chase" || t.state === "investigate" || t.alert > 0.3;
      ((o.lookYaw = _n(
        o.lookYaw,
        u ? ke(h, -1.1, 1.1) : Math.sin(o.t * 0.4) * 0.5,
        e * 4,
      )),
        (o.aware = u));
      let f = Math.max(0.3, Math.hypot(c, l)),
        d = (a.y || 0) + 1.6,
        p = (i.behavior === "flyer" ? t.pos.y : 0) + i.height * 0.9;
      ((o.lookPitch = _n(
        o.lookPitch,
        u ? ke(Math.atan2(d - p, f), -0.9, 0.7) : 0,
        e * 4,
      )),
        (i.behavior === "statue" && t.frozen) || Bd(n, o, e),
        (n.mat.uniforms.uHit.value = t.hitFlash),
        i.body.opacity < 1 &&
          (n.mat.uniforms.uOpacity.value = ke(0.85 - t.d / 30, 0.12, 0.7)));
    }
    drawMap(t, e) {
      let n = this.black;
      !n ||
        n.fade <= 0 ||
        (this.game.blackSeen &&
          ((t.strokeStyle = "rgba(200,200,210,0.5)"),
          t.setLineDash([3, 3]),
          t.beginPath(),
          t.arc((n.x / 4) * e, (n.z / 4) * e, (n.r / 4) * e, 0, Math.PI * 2),
          t.stroke(),
          t.setLineDash([])));
    }
  };
  var YA = `
out vec3 vPos;
void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vPos = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }
`,
    $A = `
precision highp float;
in vec3 vPos; out vec4 fragColor;
uniform sampler2D tGrime; uniform sampler2D tCell; uniform sampler2D tLight;
uniform vec2 uGrid; uniform float uCell; uniform vec2 uWorld; uniform float uCeilH;
${Fo}
${Ps}
void main(){
  vec3 P = vPos;
  vec3 toCam = uCam - P; float dist = length(toCam); vec3 V = toCam / dist;
  vec2 q = P.xz;
  vec4 a = texture(tGrime, q*0.11 + vec2(uTime*0.012, uTime*0.007));
  vec4 b = texture(tGrime, q*0.17 - vec2(uTime*0.009, -uTime*0.013));
  vec2 slope = (vec2(a.r - b.g, a.g - b.r)) * 0.55;
  vec3 N = normalize(vec3(slope.x, 1.0, slope.y));
  float nv = max(dot(N, V), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
  vec4 lf = texture(tLight, P.xz / uWorld);
  float E = lf.r*lf.r*4.0 * uLightMul;
  // reflected ceiling with light panels
  vec3 R = reflect(-V, N);
  vec3 refl = uFogCol * uFogLight * 0.6;
  if (R.y > 0.02) {
    float t = (uCeilH - P.y) / R.y;
    vec3 hp = P + R*t;
    vec2 hc = floor(hp.xz / uCell);
    vec4 ci = texture(tCell, (hc+0.5)/uGrid);
    int hl = int(ci.g*255.0/50.0 + 0.5);
    vec3 ceil = vec3(0.55, 0.6, 0.6) * E * 0.35;
    float pm = 0.0;
    if (hl == 1 || hl == 2) { vec2 lp = hp.xz - (hc+0.5)*uCell; vec2 qq = abs(lp) - vec2(0.6, 0.3); pm = 1.0 - smoothstep(-0.03, 0.06, max(qq.x, qq.y)); }
    refl = mix(ceil, uLightCol * 5.0, pm);
    refl = mix(refl, uFogCol * uFogLight, 1.0 - exp(-t*0.05));
  }
  vec3 deep = vec3(0.02, 0.10, 0.12) * (0.4 + E*0.6);
  vec3 col = mix(deep, refl, F);
  // flashlight glint
  if (uFlashI > 0.0) {
    vec3 Lf = normalize(uFlashPos - P);
    float sp = pow(max(dot(N, normalize(Lf + V)), 0.0), 120.0);
    col += sp * uFlashI * 2.0 * smoothstep(0.8, 0.95, dot(-Lf, uFlashDir));
  }
  float fogF = 1.0 - exp(-pow(dist*uFogDen, 1.5));
  col = mix(col, uFogCol * uFogLight, fogF);
  float alpha = mix(0.45, 0.95, F);
  fragColor = vec4(col, alpha);
}
`,
    Gd = class {
      constructor(t) {
        ((this.game = t), (this.group = new We()), t.scene.add(this.group));
        let e = t.shared;
        ((this.waterMat = new De({
          glslVersion: yn,
          vertexShader: YA,
          fragmentShader: $A,
          uniforms: {
            ...e,
            tGrime: t.mat.uniforms.tGrime,
            tCell: t.mat.uniforms.tCell,
            uGrid: t.mat.uniforms.uGrid,
            uCell: t.mat.uniforms.uCell,
          },
          transparent: !0,
          depthWrite: !1,
        })),
          (this.glowMat = yh(e, [1, 0.45, 0.15], { intensity: 3.5 })),
          (this.steamT = 0),
          this.buildMotes(e));
      }
      buildMotes(t) {
        let i = new Float32Array(960),
          r = new Float32Array(320);
        for (let a = 0; a < 320; a++)
          ((i[a * 3] = Math.random() * 7 * 2),
            (i[a * 3 + 1] = Math.random() * 3.2),
            (i[a * 3 + 2] = Math.random() * 7 * 2),
            (r[a] = Math.random()));
        let o = new Vt();
        (o.setAttribute("position", new Kt(i, 3)),
          o.setAttribute("aSeed", new Kt(r, 1)),
          (this.motes = new js(
            o,
            new De({
              glslVersion: yn,
              vertexShader: `
        in float aSeed; out float vA;
        uniform vec3 uCam; uniform float uTime; uniform float uBox; uniform vec3 uFlashPos; uniform vec3 uFlashDir; uniform float uFlashI; uniform float uLocal;
        void main(){
          vec3 p = position;
          p += vec3(sin(uTime*0.13 + aSeed*40.0), sin(uTime*0.09 + aSeed*17.0)*0.6 - uTime*0.02, cos(uTime*0.11 + aSeed*29.0)) * 0.6;
          vec3 rel = mod(p - uCam + uBox, uBox*2.0) - uBox;
          rel.y = mod(p.y - uTime*0.015, 3.2) - uCam.y + 0.2;
          vec3 wp = uCam + rel;
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = length(rel);
          vec3 L = normalize(wp - uFlashPos);
          float beam = smoothstep(0.86, 0.97, dot(L, uFlashDir)) * uFlashI / (1.0 + d*d*0.08);
          vA = (beam * 0.9 + uLocal * 0.08) * smoothstep(0.25, 0.8, d) * (1.0 - smoothstep(uBox*0.7, uBox, d));
          gl_PointSize = (1.4 + aSeed * 1.6) * 260.0 / max(0.3, -mv.z) * 0.02;
        }`,
              fragmentShader: `
        precision highp float; in float vA; out vec4 fragColor;
        void main(){ vec2 c = gl_PointCoord - 0.5; float a = 1.0 - smoothstep(0.1, 0.5, length(c)); if (a * vA < 0.003) discard; fragColor = vec4(vec3(1.0, 0.95, 0.85) * vA * a, 1.0); }`,
              uniforms: {
                uCam: t.uCam,
                uTime: t.uTime,
                uFlashPos: t.uFlashPos,
                uFlashDir: t.uFlashDir,
                uFlashI: t.uFlashI,
                uBox: { value: 7 },
                uLocal: { value: 0.5 },
              },
              transparent: !0,
              depthWrite: !1,
              blending: fs,
            }),
          )),
          (this.motes.frustumCulled = !1),
          this.game.scene.add(this.motes));
      }
      onFloorEnter(t) {
        (this.clear(), (this.fs = t));
        let e = t.map,
          n = t.theme;
        (n.water && this.buildWater(e), n.heights && this.buildAbyss(e));
      }
      onFloorExit() {
        this.clear();
      }
      clear() {
        for (let t of [...this.group.children])
          (this.group.remove(t), t.geometry && t.geometry.dispose());
      }
      buildWater(t) {
        let e = [],
          n = 4;
        for (let o = 0; o < t.H; o++)
          for (let a = 0; a < t.W; a++) {
            let c = t.floor[t.ci(a, o)];
            if (c !== 3 && c !== 2) continue;
            let l = c === 3 ? 0.16 : -0.12,
              h = a * n,
              u = o * n,
              f = h + n,
              d = u + n;
            e.push(h, l, u, h, l, d, f, l, d, h, l, u, f, l, d, f, l, u);
          }
        if (!e.length) return;
        let i = new Vt();
        (i.setAttribute("position", new kt(e, 3)), i.computeBoundingSphere());
        let r = new te(i, this.waterMat);
        ((r.renderOrder = 2), this.group.add(r));
      }
      buildAbyss(t) {
        let e = new ws(0.6, 8, 6),
          n = 4,
          i = 0;
        for (let r = 0; r < 4e3 && i < 90; r++) {
          let o = Math.floor(Math.random() * t.N);
          if (t.floor[o] !== 1) continue;
          let a = new te(e, this.glowMat);
          (a.position.set(
            ((o % t.W) + Math.random()) * n,
            -18 - Math.random() * 40,
            (((o / t.W) | 0) + Math.random()) * n,
          ),
            a.scale.setScalar(0.5 + Math.random() * 1.5),
            this.group.add(a),
            i++);
        }
      }
      preRender() {
        this.motes &&
          (this.motes.material.uniforms.uLocal.value = Math.min(
            1.2,
            this.game.localLight ?? 0.5,
          ));
      }
      update(t) {
        let e = this.game,
          n = this.fs,
          i = e.player;
        if (!n) return;
        let r = n.map;
        if (
          ((e.fx.underwater = Math.max(0, (e.fx.underwater || 0) - t * 0.8)),
          i.water === 2 && (e.fx.underwater = Math.max(e.fx.underwater, 0.15)),
          r.vents && e.combat)
        ) {
          this.steamT += t;
          for (let o of r.vents) {
            let a = Math.hypot(o.x - i.pos.x, o.z - i.pos.z);
            if (a > 30) continue;
            let c = Math.sin(e.time * 0.7 + o.ph) > 0.4;
            (c &&
              Math.random() < t * 12 &&
              e.combat.dust.spawn(
                o.x + (Math.random() - 0.5) * 0.3,
                0.1,
                o.z + (Math.random() - 0.5) * 0.3,
                (Math.random() - 0.5) * 0.4,
                1.6 + Math.random(),
                (Math.random() - 0.5) * 0.4,
                0.75,
                0.72,
                0.68,
                0.18,
                30 + Math.random() * 30,
                2.5,
                -0.2,
                0.3,
                30,
              ),
              c &&
                a < 1 &&
                i.pos.y < 0.5 &&
                ((this._steamHurt = (this._steamHurt || 0) - t),
                this._steamHurt <= 0 &&
                  ((this._steamHurt = 0.6),
                  e.hurtPlayer(6, o, "蒸気"))),
              c &&
                a < 12 &&
                ((o.sndT = (o.sndT || 0) - t),
                o.sndT <= 0 &&
                  ((o.sndT = 2.5),
                  e.audio &&
                    e.audio.sfx("fuse", {
                      pos: o,
                      vol: 0.4,
                      range: 20,
                      rate: 0.6,
                    }))));
          }
        }
      }
      contextAction() {
        let t = this.game,
          e = this.fs,
          n = t.player;
        if (!e || !e.map.vendors) return null;
        for (let i of e.map.vendors) {
          let r = (i.r[0] + i.r[2]) / 2,
            o = (i.r[1] + i.r[3]) / 2;
          if (Math.hypot(n.pos.x - r, n.pos.z - o) > 1.5) continue;
          let a = {
            water: "アーモンド水",
            bomb: "パイプ爆弾",
            ammo: "弾薬",
            med: "医薬品",
            gas: "中和ガス缶",
          }[i.kind];
          return i.stock <= 0
            ? {
                type: "vend",
                label: "売り切れ",
                run: () => t.toast("売り切れだ", 900),
              }
            : {
                type: "vend",
                label: `${a}を買う \xA5${i.price.toLocaleString()}`,
                run: () => this.buy(i),
              };
        }
        return null;
      }
      buy(t) {
        let e = this.game,
          n = e.items;
        if (e.run.money < t.price) {
          (e.toast("お金が足りない", 1e3),
            e.audio && e.audio.sfx("click"));
          return;
        }
        let i = !0;
        if (t.kind === "ammo") {
          let r = n.inv.weapons
              .filter(Boolean)
              .map((a) => be[a.type].ammo)
              .filter(Boolean),
            o = r.length ? r : ["9mm", "12g"];
          for (let a of o)
            n.inv.ammo[a] +=
              { "9mm": 30, 357: 12, "12g": 10, 556: 45, "40mm": 3 }[a] || 10;
          n.renderAll();
        } else
          t.kind === "water"
            ? (i = n.addConsumable("water", 1) > 0)
            : t.kind === "bomb"
              ? (i = n.addConsumable("bomb", 1) > 0)
              : t.kind === "med"
                ? (i =
                    n.addConsumable(
                      Math.random() < 0.5 ? "bandage" : "painkiller",
                      1,
                    ) > 0)
                : t.kind === "gas" && (i = n.addConsumable("gas", 1) > 0);
        if (!i) {
          e.toast(
            "持ち物がいっぱいだ",
            1e3,
          );
          return;
        }
        ((e.run.money -= t.price),
          t.stock--,
          e.audio && e.audio.sfx("pickup", { vol: 0.8 }),
          e.audio && e.audio.sfx("thud_far", { vol: 0.6, rate: 2 }),
          e.feed(`購入 -\xA5${t.price.toLocaleString()}`, "#ff9a7a"));
      }
    };
  var Wd = class {
    constructor(t) {
      ((this.game = t),
        (this.plateGeo = new Vn(3.7, 0.35, 3.7)),
        (this.plateMat = On(t.shared, {
          color: [0.06, 0.055, 0.05],
          color2: [0.15, 0.01, 0],
          rough: 0.5,
          metal: 0.6,
          skin: 0.4,
        })),
        (this.plates = new Map()));
    }
    onFloorEnter(t) {
      ((this.fs = t),
        this.clearPlates(),
        t.map.holes || (t.map.holes = new Set()));
    }
    onFloorExit() {
      this.clearPlates();
    }
    clearPlates() {
      for (let t of this.plates.values()) this.game.scene.remove(t);
      this.plates.clear();
    }
    update(t) {
      let e = this.game,
        n = this.fs,
        i = e.player;
      if (!n || !n.map.traps) return;
      let r = n.map;
      for (let o of n.map.traps) {
        let a = (o.cx + 0.5) * 4,
          c = (o.cy + 0.5) * 4,
          l = i.pos.x - a,
          h = i.pos.z - c,
          u = Math.abs(l) > 30 || Math.abs(h) > 30;
        if (u && o.state === 0) continue;
        let f = (d) => Math.abs(l) < d && Math.abs(h) < d;
        if (o.type === 4) {
          if (o.state === 0 && f(1.45) && i.onGround && !i.dead)
            ((o.state = 1),
              (o.t = 0),
              e.audio &&
                e.audio.sfx("collapse", {
                  pos: { x: a, z: c },
                  vol: 0.9,
                  rate: 1.3,
                }),
              e.combat && e.combat.puff(a, 0.05, c, 10, [0.3, 0.25, 0.15]),
              (i.shake = Math.max(i.shake, 0.3)));
          else if (
            o.state === 1 &&
            ((o.t += t),
            o.t > 0.5 &&
              ((o.state = 2),
              r.holes.add(o.cy * r.W + o.cx),
              e.world.rebuildAtCell(o.cx, o.cy),
              e.audio &&
                e.audio.sfx("wall_break", {
                  pos: { x: a, z: c },
                  vol: 0.8,
                  rate: 1.2,
                }),
              e.emitNoise(a, c, 40, "trap"),
              e.combat))
          )
            for (let d = 0; d < 20; d++)
              e.combat.debris.spawn(
                a + (Math.random() - 0.5) * 2.6,
                0,
                c + (Math.random() - 0.5) * 2.6,
                Math.random() - 0.5,
                -1,
                Math.random() - 0.5,
                0.15,
              );
        } else if (o.type === 5) {
          let d = n.theme.ceilH;
          if (o.state === 0 && f(1.85) && !i.dead && o.cool <= 0)
            ((o.state = 1),
              (o.t = 0),
              e.audio &&
                e.audio.sfx("creak", {
                  pos: { x: a, z: c },
                  vol: 1,
                  rate: 0.6,
                  important: !0,
                }),
              e.toast(
                "頭上で何かが軋む…！",
                900,
              ));
          else if (o.state === 1) {
            o.t += t;
            let p = this.plate(o, a, c);
            ((p.position.y = d - 0.17 - Math.max(0, Math.sin(o.t * 40)) * 0.04),
              o.t > 0.75 && ((o.state = 2), (o.t = 0)));
          } else if (o.state === 2) {
            o.t += t;
            let p = this.plate(o, a, c),
              g = Math.min(1, o.t / 0.16);
            if (((p.position.y = (d - 0.17) * (1 - g) + 0.17 * g), g >= 1)) {
              ((o.state = 3),
                (o.t = 0),
                e.audio &&
                  e.audio.sfx("crush", {
                    pos: { x: a, z: c },
                    vol: 1,
                    important: !0,
                  }),
                e.emitNoise(a, c, 50, "trap"));
              let m = Math.max(Math.abs(i.pos.x - a), Math.abs(i.pos.z - c));
              if (
                (m < 1.85 &&
                  !i.dead &&
                  e.kill(
                    "吊り天井に押し潰された",
                  ),
                (i.shake = Math.max(i.shake, Math.max(0, 1 - m / 12))),
                e.combat && e.combat.puff(a, 0.3, c, 16, [0.3, 0.28, 0.25]),
                e.monsters)
              )
                for (let x of e.monsters.list)
                  !x.dead &&
                    Math.abs(x.pos.x - a) < 1.9 &&
                    Math.abs(x.pos.z - c) < 1.9 &&
                    x.def.behavior !== "ambush" &&
                    e.monsters.damage(x, 9999, { x: a, z: c }, "trap");
            }
          } else if (o.state === 3) {
            o.t += t;
            let p = this.plate(o, a, c),
              g = Math.min(1, Math.max(0, o.t - 1.2) / 3);
            ((p.position.y = 0.17 + (d - 0.34) * g),
              g >= 1 &&
                ((o.state = 0),
                (o.cool = 3),
                this.game.scene.remove(p),
                this.plates.delete(o)));
          }
          o.cool = Math.max(0, (o.cool || 0) - t);
        } else if (
          o.type === 6 &&
          (Math.hypot(l, h * 1.25) < 1.3 &&
            i.onGround &&
            !i.dead &&
            (e.combat &&
              e.combat.add.spawn(
                i.pos.x,
                0.3,
                i.pos.z,
                0,
                1,
                0,
                0.6,
                0.8,
                1.6,
                1,
                30,
                0.3,
              ),
            e.audio && e.audio.sfx("spark", { vol: 1, important: !0 }),
            e.kill("感電した")),
          !u && ((o.sndT = (o.sndT || 0) - t), o.sndT <= 0))
        ) {
          if (
            ((o.sndT = 0.6 + Math.random() * 1.6),
            e.audio &&
              e.audio.sfx("spark", {
                pos: { x: a, z: c },
                vol: 0.5,
                range: 18,
              }),
            e.combat)
          )
            for (let p = 0; p < 6; p++)
              e.combat.add.spawn(
                a + (Math.random() - 0.5) * 2,
                0.05,
                c + (Math.random() - 0.5) * 1.6,
                (Math.random() - 0.5) * 2,
                1 + Math.random() * 2,
                (Math.random() - 0.5) * 2,
                0.6,
                0.8,
                1.6,
                1,
                5,
                0.25,
                9,
              );
          Math.random() < 0.5 &&
            e.addLight(new L(a, 0.4, c), [0.5, 0.7, 1.2], 2.5, 5, 0.12);
        }
      }
    }
    plate(t, e, n) {
      let i = this.plates.get(t);
      return (
        i ||
          ((i = new te(this.plateGeo, this.plateMat)),
          i.position.set(e, this.fs.theme.ceilH - 0.17, n),
          this.game.scene.add(i),
          this.plates.set(t, i)),
        i
      );
    }
  };
  var qd = class {
    constructor(t) {
      ((this.game = t),
        (this.group = new We()),
        t.scene.add(this.group),
        (this.mat = On(t.shared, {
          color: [0.62, 0.63, 0.66],
          rough: 0.32,
          metal: 0.85,
          rim: 0.2,
        })),
        (this.panelGeo = new Vn(0.72, 2.3, 0.035)),
        (this.open = 1),
        (this.target = 1),
        (this.st = null));
    }
    onFloorEnter(t) {
      if (
        (this.group.clear(),
        (this.st = t.map.stairs.find((r) => r.kind === "elev") || null),
        !this.st)
      )
        return;
      let e = this.st;
      this.doors = [];
      let n = [
        [-1, 0, 1.64, 0.38, 1.15],
        [-1, 1, 0.96, 0.34, 1.19],
        [1, 0, 2.36, 3.62, 1.15],
        [1, 1, 3.04, 3.66, 1.19],
      ];
      for (let [r, o, a, c, l] of n) {
        let h = new te(this.panelGeo, this.mat);
        (this.group.add(h),
          this.doors.push({
            m: h,
            side: r,
            layer: o,
            closedX: a,
            openX: c,
            z: l,
          }));
      }
      let i = ch(e.dir, 0, -1);
      ((this.yaw = Math.atan2(i[0], i[1])),
        (this.open = 1),
        (this.target = 1),
        this.place());
    }
    onFloorExit() {
      (this.group.clear(), (this.st = null));
    }
    place() {
      let t = this.st;
      for (let e of this.doors) {
        let n = e.layer === 0 ? this.open : Math.min(1, this.open * 1.6),
          i = e.closedX + (e.openX - e.closedX) * n,
          r = lh(t.cx, t.cy, t.dir, i, e.z);
        (e.m.position.set(r[0], 1.15, r[1]),
          (e.m.rotation.y = this.yaw),
          e.m.updateMatrix());
      }
    }
    local(t) {
      let e = this.st;
      return T2(e.dir, t.pos.x - e.cx * 4, t.pos.z - e.cy * 4);
    }
    near(t) {
      if (!this.st || this.game.fs.depth !== 1) return !1;
      let e = this.local(t);
      return e[0] >= 0 && e[0] <= 4 && e[1] >= -2.6 && e[1] <= 4
        ? Math.abs(e[0] - 2) < 2.6
        : !1;
    }
    canReturn() {
      let t = this.game.run;
      return !!(t && (t.leftStart || t.money > 0 || t.deepest > 1));
    }
    update(t) {
      if (!this.st) return;
      let e = this.game,
        n = e.player;
      if (!this.returning) {
        let r = this.local(n);
        ((this.target = Math.hypot(r[0] - 2, r[1] - 1.2) < 5 ? 1 : 0),
          this.canReturn() || (this.target = 1));
      }
      let i = this.returning ? 0.9 : 1.6;
      ((this.open +=
        Math.sign(this.target - this.open) *
        Math.min(Math.abs(this.target - this.open), t * i)),
        this.place(),
        this.returning && this.updateReturn(t));
    }
    blocksDoor() {
      return this.open < 0.3;
    }
    startReturn(t) {
      if (this.returning) return;
      let e = this.game,
        n = e.player;
      this.returning = {
        t: 0,
        onDone: t,
        from: { x: n.pos.x, z: n.pos.z, yaw: n.yaw },
      };
      let i = lh(this.st.cx, this.st.cy, this.st.dir, 2, 2.7);
      ((this.returning.to = { x: i[0], z: i[1], yaw: this.yaw + Math.PI }),
        (this.target = 1),
        e.audio && e.audio.sfx("pickup", { vol: 0.8, rate: 0.7 }));
    }
    updateReturn(t) {
      let e = this.game,
        n = e.player,
        i = this.returning;
      i.t += t;
      let r = Math.min(1, i.t / 0.9),
        o = r * r * (3 - 2 * r);
      ((n.pos.x = i.from.x + (i.to.x - i.from.x) * o),
        (n.pos.z = i.from.z + (i.to.z - i.from.z) * o));
      let a = i.to.yaw - i.from.yaw;
      for (; a > Math.PI; ) a -= Math.PI * 2;
      for (; a < -Math.PI; ) a += Math.PI * 2;
      if (
        ((n.yaw = i.from.yaw + a * o),
        (n.pitch *= 0.9),
        i.t > 0.9 &&
          !i.closing &&
          ((i.closing = !0),
          (this.target = 0),
          e.audio && e.audio.sfx("door", { vol: 0.8, rate: 1.4 })),
        i.closing &&
          this.open <= 0.01 &&
          !i.dinged &&
          ((i.dinged = !0),
          (i.dingT = i.t),
          e.audio && e.audio.sfx("ding", { vol: 0.9, important: !0 })),
        i.dinged && i.t - i.dingT > 0.7)
      ) {
        let c = i.onDone;
        ((this.returning = null), c && c());
      }
    }
  };
  var tg = (s) => document.querySelector(s),
    eg = [
      {
        at: 25,
        text: "瘴気が濃くなってきた。怪物が増え始める",
        color: "#c8d870",
      },
      {
        at: 50,
        text: "瘴気が濃い。怪物が活性化している",
        color: "#d8b050",
      },
      {
        at: 75,
        text: "瘴気が体を蝕む。中和ガスかフィルターを使え",
        color: "#ff8a5a",
      },
      {
        at: 100,
        text: "瘴気が満ちた。この階にはもう長くいられない",
        color: "#ff5040",
      },
    ],
    Xd = class {
      constructor(t) {
        ((this.game = t),
          (t.miasma = this),
          (this.clouds = []),
          (this.local = 0),
          (this.shown = -1),
          (this.fill = tg("#mi-fill")),
          (this.val = tg("#mi-val")),
          (this.box = tg("#miasma")),
          (this.coughT = 3));
      }
      rate(t) {
        let e = [0.075, 0.09, 0.105, 0.12, 0.135][t.depth - 1] || 0.1,
          n = this.game.loadout;
        return e * (n && n.mode === "sf" ? 1.2 : 1);
      }
      onNewRun() {
        this.clouds = [];
      }
      onFloorEnter(t) {
        ((this.fs = t),
          t.miasma === void 0 && (t.miasma = 0),
          t.clouds || (t.clouds = []),
          t.stage === void 0 && (t.stage = 0),
          t.drops === void 0 && (t.drops = 0),
          (this.clouds = t.clouds),
          (this.shown = -1));
      }
      authority() {
        let t = this.game.net;
        return !t || !t.active || t.isHost;
      }
      addCloud(t, e, n, i, r, o = {}) {
        let a = { x: t, z: e, r: n, dur: i, t: 0, amount: r || 0 };
        return (
          this.clouds.push(a),
          !o.remote &&
            this.game.net &&
            this.game.net.active &&
            this.game.net.cloud(this.fs.depth, a),
          a
        );
      }
      shelter(t, e) {
        let n = 0;
        for (let i of this.clouds) {
          let r = Math.hypot(t - i.x, e - i.z),
            o = Math.min(1, i.t / 3) * Math.min(1, (i.dur - i.t) / 4 + 0.2),
            a = i.r * (0.4 + 0.6 * Math.min(1, i.t / 3));
          r < a &&
            (n = Math.max(n, (1 - Math.pow(r / a, 3)) * Math.min(1, o * 1.5)));
        }
        return Math.min(1, n);
      }
      levelAt(t, e) {
        return (this.fs ? this.fs.miasma : 0) * (1 - this.shelter(t, e));
      }
      update(t) {
        let e = this.game,
          n = this.fs,
          i = e.player;
        if (!n) return;
        if (this.authority()) {
          n.miasma = Math.min(100, n.miasma + this.rate(n) * t);
          for (let h of this.clouds)
            h.amount > 0 &&
              h.t < h.dur &&
              (n.miasma = Math.max(0, n.miasma - (h.amount / h.dur) * t));
          this.checkDrops();
        }
        for (let h = this.clouds.length - 1; h >= 0; h--) {
          let u = this.clouds[h];
          ((u.t += t), u.t > u.dur + 4 && this.clouds.splice(h, 1));
        }
        let r = i.buffs;
        r.filter > 0 && (r.filter = Math.max(0, r.filter - t));
        let o = this.levelAt(i.pos.x, i.pos.z),
          a = (r.filter > 0 ? 0.85 : 0) + (i.stats.miasmaRes || 0);
        this.local = o * Math.max(0, 1 - a);
        let c = this.local / 100;
        if (
          ((e.fx.miasma = c),
          (i.stats.regenMul = 1 - Math.max(0, (this.local - 45) / 110)),
          !i.dead && e.state === "play" && this.local > 70)
        ) {
          if (
            ((this.dmgAcc = (this.dmgAcc || 0) + (this.local - 70) * 0.065 * t),
            this.dmgAcc >= 1)
          ) {
            let h = Math.floor(this.dmgAcc);
            ((this.dmgAcc -= h),
              e.hurtPlayer(h, null, "瘴気", { quiet: !0 }));
          }
          ((this.coughT -= t),
            this.coughT <= 0 &&
              ((this.coughT = 2.5 + Math.random() * 3),
              e.audio && e.audio.sfx("cough", { vol: 0.6, vary: 0.15 }),
              (e.fx.damage = Math.max(e.fx.damage, 0.25))));
        }
        let l = 0;
        for (let h = 0; h < eg.length; h++) n.miasma >= eg[h].at && (l = h + 1);
        if (l > n.stage) {
          n.stage = l;
          let h = eg[l - 1];
          (e.banner("瘴気 " + h.at + "%", h.text, 0, h.color),
            e.audio &&
              e.audio.sfx("sting_red", {
                vol: 0.45,
                important: !0,
                rate: 0.7,
              }));
        }
        if (e.combat && o > 18 && Math.random() < t * o * 0.25) {
          let h = Math.random() * 6.28,
            u = 1 + Math.random() * 5;
          this.shelter(i.pos.x + Math.cos(h) * u, i.pos.z + Math.sin(h) * u) <
            0.5 &&
            e.combat.dust.spawn(
              i.pos.x + Math.cos(h) * u,
              0.3 + Math.random() * 2.2,
              i.pos.z + Math.sin(h) * u,
              (Math.random() - 0.5) * 0.2,
              (Math.random() - 0.3) * 0.15,
              (Math.random() - 0.5) * 0.2,
              0.55,
              0.62,
              0.3,
              0.22,
              3 + Math.random() * 4,
              4 + Math.random() * 3,
              -0.01,
              0.2,
              0,
            );
        }
        this.hud();
      }
      checkDrops() {
        let t = this.game,
          e = this.fs,
          n = Math.floor(e.miasma / 20);
        if (n <= e.drops) return;
        e.drops = n;
        let i =
            t.net && t.net.active
              ? t.net.playersOnFloor(e.depth)
              : [t.player.pos],
          r = e.map,
          o = new Ci((r.seed + n * 977 + Math.floor(t.time * 10)) >>> 0),
          a = 0;
        for (let c of i)
          for (let l = 0; l < 2; l++)
            for (let h = 0; h < 80; h++) {
              let u = o.range(0, Math.PI * 2),
                f = o.range(14, 38),
                d = c.x + Math.cos(u) * f,
                p = c.z + Math.sin(u) * f,
                g = Math.floor(d / 4),
                m = Math.floor(p / 4);
              if (!r.inb(g, m)) continue;
              let x = r.ci(g, m);
              if (
                !r.reach[x] ||
                (r.floor[x] !== 0 && r.floor[x] !== 3) ||
                r.feat[x] !== 0
              )
                continue;
              let v = Cd(o, e.depth, !1);
              (v.push(
                { type: o.next() < 0.3 + n * 0.1 ? "gasbig" : "gas" },
                { type: "gas" },
                { type: o.next() < 0.5 ? "filter" : "medkit" },
              ),
                t.dropItemNet("crate", (g + 0.5) * 4, (m + 0.5) * 4, {
                  contents: v,
                  supply: !0,
                }),
                a++);
              break;
            }
        a &&
          (t.toast(
            "補給物資が投下された（地図に表示）",
            2600,
          ),
          t.audio &&
            t.audio.sfx("thud_far", { vol: 0.9, rate: 0.7, important: !0 }),
          t.net &&
            t.net.active &&
            t.net.notice(
              "補給物資が投下された（地図に表示）",
            ));
      }
      hud() {
        if (!this.fill) return;
        let t = Math.round(this.fs.miasma),
          e = Math.round(this.local);
        (t !== this.shown || e !== this.shownL) &&
          ((this.shown = t),
          (this.shownL = e),
          (this.fill.style.transform = `scaleX(${t / 100})`),
          (this.val.textContent = t + "%"),
          this.box.classList.toggle("warn", t >= 50 && t < 75),
          this.box.classList.toggle("danger", t >= 75),
          this.box.classList.toggle("safe", e < t - 8));
      }
      drawMap(t, e) {
        for (let n of this.clouds)
          n.t > n.dur ||
            ((t.fillStyle = "rgba(140,230,190,0.25)"),
            t.beginPath(),
            t.arc((n.x / 4) * e, (n.z / 4) * e, (n.r / 4) * e, 0, Math.PI * 2),
            t.fill());
      }
    };
  var Yd = class {
    constructor(t) {
      ((this.game = t), (t.vents = this), (this.list = []), (this.checkT = 0));
    }
    onFloorEnter(t) {
      ((this.fs = t), (this.list = []));
      let e = t.map;
      for (let n of e.ducts || []) {
        let i = [
          [n.path[0], n.ends[0]],
          [n.path[n.path.length - 1], n.ends[1]],
        ];
        for (let [r, o] of i) {
          let a = r % e.W,
            c = (r / e.W) | 0,
            l = o % e.W,
            h = (o / e.W) | 0,
            u = -1;
          for (let g = 0; g < 4; g++)
            a + ge[g] === l && c + xe[g] === h && (u = g);
          if (u < 0) continue;
          let f = e.edgeKey(a, c, u),
            d = (a + 0.5 + ge[u] * 0.5) * 4,
            p = (c + 0.5 + xe[u] * 0.5) * 4;
          this.list.push({
            key: f,
            x: d,
            z: p,
            nx: ge[u],
            nz: xe[u],
            room: o,
            duct: r,
            ax: a,
            ay: c,
            bx: l,
            by: h,
          });
        }
      }
    }
    onFloorExit() {
      this.list = [];
    }
    nearest(t, e = 1.5) {
      let n = null,
        i = e;
      for (let r of this.list) {
        let o = Math.hypot(t.pos.x - r.x, t.pos.z - r.z);
        o < i && ((i = o), (n = r));
      }
      return n;
    }
    contextAction() {
      let t = this.game,
        e = t.player,
        n = this.fs && this.fs.map;
      if (!n || e.dead) return null;
      let i = this.nearest(e);
      if (!i) return null;
      let r = (e.pos.x - i.x) * i.nx + (e.pos.z - i.z) * i.nz;
      return n.ventOpen.has(i.key)
        ? e.stance !== Pi && !e.inDuct && r > 0
          ? {
              type: "vent",
              label: "這って換気口に入る",
              run: () => {
                ((e.stance = Pi),
                  t.toast("伏せたまま進む", 900));
              },
            }
          : null
        : r > -0.2
          ? {
              type: "vent",
              label:
                "換気口のカバーを外す",
              run: () => this.open(i),
            }
          : null;
    }
    open(t, e) {
      let n = this.game,
        i = this.fs.map;
      i.ventOpen.has(t.key) ||
        (i.ventOpen.add(t.key),
        n.world.rebuildAtCell(Math.min(t.ax, t.bx), Math.min(t.ay, t.by)),
        n.world.rebuildAtCell(Math.max(t.ax, t.bx), Math.max(t.ay, t.by)),
        n.audio &&
          n.audio.sfx("vent_open", {
            pos: { x: t.x, z: t.z },
            vol: 0.9,
            range: 40,
          }),
        e ||
          (n.emitNoise(t.x, t.z, 14, "vent"),
          n.net && n.net.active && n.net.vent(this.fs.depth, t.key)));
    }
    openKey(t, e) {
      let n = this.list.find((i) => i.key === t);
      n ? this.open(n, e) : this.fs && this.fs.map.ventOpen.add(t);
    }
    update(t) {
      if (
        ((this.checkT -= t), this.checkT > 0 || !this.fs || !this.game.monsters)
      )
        return;
      this.checkT = 0.3;
      let e = this.fs.map;
      for (let n of this.game.monsters.list)
        if (!(n.dead || !n.def.duct || n.remote))
          for (let i of this.list)
            !e.ventOpen.has(i.key) &&
              Math.hypot(n.pos.x - i.x, n.pos.z - i.z) < 0.9 &&
              this.open(i);
    }
    drawMap(t, e) {
      let n = this.fs && this.fs.map;
      if (n) {
        ((t.strokeStyle = "rgba(190,200,210,0.75)"),
          t.setLineDash([2, 2]),
          (t.lineWidth = Math.max(1, e * 0.25)));
        for (let i of n.ducts || [])
          (!i.path.some((r) => n.explored[r]) &&
            !i.ends.some((r) => n.explored[r])) ||
            (t.beginPath(),
            i.path.forEach((r, o) => {
              let a = ((r % n.W) + 0.5) * e,
                c = (((r / n.W) | 0) + 0.5) * e;
              o ? t.lineTo(a, c) : t.moveTo(a, c);
            }),
            t.stroke());
        (t.setLineDash([]), (t.lineWidth = 1));
      }
    }
  };
  var $d = class {
    constructor(t) {
      ((this.game = t), (t.altars = this), (this.lights = new Map()));
    }
    onFloorEnter(t) {
      ((this.fs = t), this.clearLights());
    }
    onFloorExit() {
      this.clearLights();
    }
    clearLights() {
      for (let t of this.lights.values()) this.game.removePersistentLight(t);
      this.lights.clear();
    }
    cost(t) {
      let e = this.fs.depth;
      return (
        Math.round(
          ([3e3, 6e3, 1e4, 15e3, 22e3][e - 1] * (1 + t.uses * 0.6)) / 100,
        ) * 100
      );
    }
    update(t) {
      let e = this.game,
        n = e.player,
        i = this.fs;
      if (!(!i || !i.map.altars))
        for (let r of i.map.altars) {
          let o = Math.hypot(n.pos.x - r.x, n.pos.z - r.z),
            a = this.lights.get(r);
          (o < 26 && !a
            ? ((a = e.addPersistentLight(
                new L(r.lx, 1.15, r.lz),
                [1, 0.55, 0.22],
                1.6,
                6.5,
              )),
              this.lights.set(r, a))
            : o > 30 &&
              a &&
              (e.removePersistentLight(a), this.lights.delete(r), (a = null)),
            a &&
              (a.i =
                (1.35 +
                  Math.sin(e.time * 7 + r.cx) * 0.12 +
                  Math.sin(e.time * 13.7 + r.cy) * 0.08) *
                (r.glow ? 1 + r.glow * 4 : 1)),
            r.glow && (r.glow = Math.max(0, r.glow - t * 0.6)));
        }
    }
    contextAction() {
      let t = this.game,
        e = t.player,
        n = this.fs;
      if (!n || !n.map.altars || e.dead) return null;
      for (let i of n.map.altars) {
        if (Math.hypot(e.pos.x - i.x, e.pos.z - i.z) > 1.7) continue;
        let r = t.net && t.net.active ? t.net.deadTeammates().length : 0,
          o = this.cost(i);
        return r
          ? {
              type: "altar",
              label: `仲間を蘇らせる \xA5${o.toLocaleString()}`,
              run: () => this.pray(i, !0),
            }
          : e.blessed
            ? {
                type: "altar",
                label: "加護を受けている",
                run: () =>
                  t.toast(
                    "すでに加護を受けている（次に死ぬ時に身代わりになる）",
                    2e3,
                  ),
              }
            : {
                type: "altar",
                label: `祈る \xA5${o.toLocaleString()}`,
                run: () => this.pray(i, !1),
              };
      }
      return null;
    }
    pray(t, e) {
      let n = this.game,
        i = n.player,
        r = this.cost(t);
      if (n.run.money < r) {
        (n.toast(
          `お布施が足りない（\xA5${r.toLocaleString()}）`,
          1400,
        ),
          n.audio && n.audio.sfx("click"));
        return;
      }
      if (
        ((n.run.money -= r),
        t.uses++,
        (t.glow = 1),
        n.audio && n.audio.sfx("chime", { vol: 0.9, important: !0 }),
        n.addLight(new L(t.lx, 1.3, t.lz), [1.2, 0.8, 0.4], 6, 9, 1.2),
        n.combat)
      )
        for (let o = 0; o < 30; o++)
          n.combat.add.spawn(
            t.lx + (Math.random() - 0.5) * 0.8,
            0.95,
            t.lz + (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.4,
            0.4 + Math.random() * 0.8,
            (Math.random() - 0.5) * 0.4,
            1,
            0.7,
            0.35,
            1,
            5,
            1.5,
            -0.2,
            0.5,
          );
      if (e && n.net && n.net.active) {
        (n.net.altarRevive(this.fs.depth, t.x, t.z),
          n.feed(
            `お布施 -\xA5${r.toLocaleString()}　仲間が蘇る`,
            "#ffd28a",
          ));
        return;
      }
      ((i.blessed = !0),
        (i.hp = Math.min(i.maxHp, i.hp + i.maxHp * 0.4)),
        n.feed(`お布施 -\xA5${r.toLocaleString()}`, "#ff9a7a"),
        n.toast(
          "加護を受けた。次に死ぬ時、一度だけ身代わりになる",
          2600,
        ),
        n.updateBlessing && n.updateBlessing());
    }
    drawMap(t, e) {
      let n = this.fs;
      if (!n || !n.map.altars) return;
      let i = n.map;
      for (let r of i.altars) {
        if (!i.explored[i.ci(r.cx, r.cy)]) continue;
        t.fillStyle = "#ffb35a";
        let o = (r.cx + 0.5) * e,
          a = (r.cy + 0.5) * e,
          c = Math.max(3, e * 0.4);
        (t.beginPath(),
          t.moveTo(o, a - c),
          t.lineTo(o + c, a),
          t.lineTo(o, a + c),
          t.lineTo(o - c, a),
          t.closePath(),
          t.fill());
      }
    }
  };
  var Os = (s) => `<svg viewBox="0 0 24 24">${s}</svg>`,
    Gr = {
      frag: {
        name: "破砕手榴弾",
        desc: "着弾後すぐ炸裂。壁も吹き飛ばす",
        cd: 14,
        cost: 3,
        icon: Os(
          '<circle cx="11" cy="14" r="6"/><path d="M11 8V5h4l2 2M14 4l3-1"/>',
        ),
      },
      breach: {
        name: "突入爆薬",
        desc: "目の前の壁に設置して爆破。頑丈な壁も貫く",
        cd: 20,
        cost: 4,
        icon: Os(
          '<rect x="5" y="7" width="14" height="10" rx="1"/><path d="M9 7v10M15 7v10M12 3v4"/>',
        ),
      },
      flash: {
        name: "閃光弾",
        desc: "周囲の怪物を数秒間行動不能に",
        cd: 12,
        cost: 2,
        icon: Os('<path d="M12 2l2 6h6l-5 4 2 7-5-4-5 4 2-7-5-4h6z"/>'),
      },
      stim: {
        name: "戦闘刺激剤",
        desc: "体力回復＋アドレナリン",
        cd: 28,
        cost: 3,
        icon: Os(
          '<path d="M4 20l3-3"/><path d="M6 14l8-8 4 4-8 8z"/><path d="M14 4l6 6"/>',
        ),
      },
      sonar: {
        name: "索敵ソナー",
        desc: "周囲45mの怪物と物資を透視",
        cd: 20,
        cost: 2,
        icon: Os(
          '<circle cx="12" cy="12" r="2"/><path d="M7.5 7.5a6.4 6.4 0 000 9M16.5 7.5a6.4 6.4 0 010 9M4.5 4.5a10.6 10.6 0 000 15M19.5 4.5a10.6 10.6 0 010 15"/>',
        ),
      },
      gas: {
        name: "中和ガス散布",
        desc: "広範囲の瘴気を打ち消す",
        cd: 40,
        cost: 3,
        icon: Os(
          '<rect x="8" y="8" width="8" height="12" rx="3"/><path d="M10 8V5h4v3M4 12c-1 2 0 4 2 5M20 12c1 2 0 4-2 5"/>',
        ),
      },
      decoy: {
        name: "デコイ",
        desc: "音で怪物をおびき寄せる",
        cd: 15,
        cost: 1,
        icon: Os(
          '<rect x="7" y="7" width="10" height="13" rx="2"/><path d="M4 6c-1 2-1 4 0 6M20 6c1 2 1 4 0 6"/>',
        ),
      },
      rage: {
        name: "オーバードライブ",
        desc: "10秒間 速度・攻撃力・耐久が大幅上昇",
        cd: 60,
        cost: 5,
        ult: !0,
        icon: Os('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
      },
      barrage: {
        name: "爆撃ドローン",
        desc: "狙った先に連続爆撃",
        cd: 75,
        cost: 6,
        ult: !0,
        icon: Os(
          '<path d="M3 8h6M15 8h6M9 8a3 3 0 006 0M12 11v3M8 18l4-4 4 4"/>',
        ),
      },
      thermite: {
        name: "テルミット",
        desc: "周囲の壁をすべて焼き切る",
        cd: 70,
        cost: 6,
        ult: !0,
        icon: Os(
          '<path d="M12 22c-4 0-7-3-7-7 0-5 7-13 7-13s7 8 7 13c0 4-3 7-7 7z"/><path d="M12 18a3 3 0 01-3-3c0-2 3-5 3-5s3 3 3 5a3 3 0 01-3 3z"/>',
        ),
      },
    },
    x_ = ["frag", "breach", "flash", "stim", "sonar", "gas", "decoy"],
    v_ = ["rage", "barrage", "thermite"],
    Kd = class {
      constructor(t) {
        ((this.game = t),
          (t.skills = this),
          (this.slots = [null, null, null]),
          (this.cd = [0, 0, 0]),
          (this.btns = [0, 1, 2].map((e) => document.getElementById("sk" + e))),
          (this.pending = []),
          (this.sonarT = 0),
          (this.rageT = 0),
          (this.markers = []));
      }
      onNewRun() {
        let t = this.game.loadout;
        ((this.slots =
          t && t.mode === "sf"
            ? (t.skills || [null, null, null]).slice(0, 3)
            : [null, null, null]),
          (this.cd = [0, 0, 0]),
          (this.pending = []),
          (this.sonarT = 0),
          (this.rageT = 0),
          document.body.classList.toggle("sf", this.slots.some(Boolean)),
          this.render(!0));
      }
      update(t) {
        let e = this.game,
          n = e.player,
          i = e.input;
        for (let r = 0; r < 3; r++)
          ((this.cd[r] = Math.max(0, this.cd[r] - t)),
            i.take("skill" + r) && this.use(r));
        for (let r = this.pending.length - 1; r >= 0; r--) {
          let o = this.pending[r];
          ((o.t -= t), o.t <= 0 && (this.pending.splice(r, 1), o.fn()));
        }
        (this.sonarT > 0 && (this.sonarT -= t),
          this.rageT > 0 &&
            ((this.rageT -= t),
            (n.buffs.adren = Math.max(n.buffs.adren, 0.2)),
            this.rageT <= 0 &&
              ((n.stats.speedMul = this.baseSpeed ?? 1),
              (n.stats.meleeMul = 1),
              (n.stats.gunMul = 1),
              (n.stats.dmgTaken = 1),
              e.feed(
                "オーバードライブ終了",
              ))),
          this.render());
      }
      use(t) {
        let e = this.game,
          n = e.player,
          i = this.slots[t];
        if (!i || n.dead || e.state !== "play") return;
        if (this.cd[t] > 0) {
          e.audio && e.audio.sfx("click", { vol: 0.5 });
          return;
        }
        let r = e.combat,
          o = !0;
        switch (i) {
          case "frag":
            o = r.throwItem("frag", {
              fuse: 1.25,
              radius: 6,
              dmg: 360,
              speed: 14,
              noise: 140,
            });
            break;
          case "flash":
            o = r.throwItem("flash", { ...be.flash, speed: 13, fuse: 1 });
            break;
          case "decoy":
            o = r.throwItem("buzzer", be.buzzer);
            break;
          case "gas":
            ((o = r.deployGas("gas")),
              o &&
                (r.throwAnim.def = {
                  ...be.gas,
                  radius: 9,
                  dur: 26,
                  miasma: 26,
                }));
            break;
          case "stim":
            ((n.hp = Math.min(n.maxHp, n.hp + 35)),
              (n.buffs.adren = Math.max(n.buffs.adren, 8)),
              e.feed(
                "戦闘刺激剤 体力+35",
                "#9fe0a0",
              ),
              (e.fx.pulse = 0.5),
              e.audio && e.audio.sfx("inject", { vol: 0.7 }));
            break;
          case "sonar":
            this.sonar();
            break;
          case "breach":
            o = this.breach();
            break;
          case "rage":
            ((this.baseSpeed = this.baseSpeed ?? n.stats.speedMul),
              (this.rageT = 10),
              (n.stats.speedMul = this.baseSpeed * 1.35),
              (n.stats.meleeMul = 1.6),
              (n.stats.gunMul = 1.6),
              (n.stats.dmgTaken = 0.5),
              (n.stamina = n.stats.maxStamina),
              (e.fx.pulse = 1),
              e.feed(
                "オーバードライブ！",
                "#ffb080",
              ),
              e.audio &&
                e.audio.sfx("sting_red", {
                  vol: 0.7,
                  rate: 1.5,
                  important: !0,
                }));
            break;
          case "barrage":
            o = this.barrage();
            break;
          case "thermite":
            o = this.thermite();
            break;
        }
        o !== !1 && ((this.cd[t] = Gr[i].cd), this.render(!0));
      }
      breach() {
        let t = this.game,
          e = t.player,
          n = t.fs.map,
          i = -Math.sin(e.yaw),
          r = -Math.cos(e.yaw),
          o = ni(n, e.pos.x, e.pos.z, i, r, 2.6, "move");
        if (o.kind !== "wall")
          return (
            t.toast("壁に近づいて使う", 1e3),
            !1
          );
        let a = new L(e.pos.x + i * o.dist, 1.1, e.pos.z + r * o.dist);
        (t.audio && t.audio.sfx("beep", { pos: a, vol: 0.8 }),
          t.toast("爆薬設置！ 離れろ", 1e3));
        let c = 0,
          l = () => {
            (c++,
              t.audio && t.audio.sfx("click", { pos: a, vol: 0.8 }),
              t.combat.add.spawn(
                a.x,
                a.y,
                a.z,
                0,
                0,
                0,
                1,
                0.2,
                0.1,
                1,
                10,
                0.2,
              ),
              c < 4
                ? this.pending.push({ t: 0.35, fn: l })
                : this.pending.push({
                    t: 0.25,
                    fn: () =>
                      t.combat.explode(
                        a.clone().addScaledVector(new L(o.nx, 0, o.nz), 0.3),
                        4.2,
                        240,
                        { breach: !0, selfMul: 0.6 },
                      ),
                  }));
          };
        return (this.pending.push({ t: 0.3, fn: l }), !0);
      }
      barrage() {
        let t = this.game,
          e = t.player,
          n = t.fs.map,
          i = t.camera,
          r = new L();
        i.getWorldDirection(r);
        let o = Math.hypot(r.x, r.z) || 1,
          a = ni(n, e.pos.x, e.pos.z, r.x / o, r.z / o, 34, "shot"),
          c = Math.max(6, (a.kind ? a.dist : 34) - 0.6);
        if (c < 6.5)
          return (
            t.toast("もっと遠くを狙え", 1e3),
            !1
          );
        (t.audio && t.audio.sfx("uav", { vol: 0.8, important: !0 }),
          t.toast("爆撃ドローン接近", 1200));
        for (let l = 0; l < 6; l++) {
          let h = 6 + (c - 6) * (l / 5),
            u = e.pos.x + (r.x / o) * h + (Math.random() - 0.5) * 2,
            f = e.pos.z + (r.z / o) * h + (Math.random() - 0.5) * 2;
          this.pending.push({
            t: 0.9 + l * 0.28,
            fn: () =>
              t.combat.explode(new L(u, 0.5, f), 5, 320, { selfMul: 0.5 }),
          });
        }
        return !0;
      }
      thermite() {
        let t = this.game,
          e = t.player,
          n = new L(
            e.pos.x - Math.sin(e.yaw) * 0.8,
            0.3,
            e.pos.z - Math.cos(e.yaw) * 0.8,
          );
        (t.toast("テルミット点火！", 1200),
          t.audio && t.audio.sfx("fuse", { pos: n, vol: 1, important: !0 }));
        let i = 0,
          r = () => {
            i++;
            for (let o = 0; o < 18; o++)
              t.combat.add.spawn(
                n.x + (Math.random() - 0.5) * 0.6,
                n.y,
                n.z + (Math.random() - 0.5) * 0.6,
                (Math.random() - 0.5) * 4,
                2 + Math.random() * 4,
                (Math.random() - 0.5) * 4,
                1,
                0.8,
                0.5,
                1,
                10,
                0.5,
                9,
                0.5,
              );
            (t.addLight(n.clone().setY(1), [1.2, 0.9, 0.6], 10, 12, 0.3),
              i < 6
                ? this.pending.push({ t: 0.25, fn: r })
                : t.combat.explode(n.clone(), 7.5, 200, {
                    breach: !0,
                    selfMul: 0.4,
                  }));
          };
        return (this.pending.push({ t: 0.2, fn: r }), !0);
      }
      sonar() {
        let t = this.game,
          e = t.player;
        ((this.sonarT = 8),
          t.audio && t.audio.sfx("sonar", { vol: 0.8, important: !0 }),
          t.feed("ソナー起動", "#a8d8ff"),
          t.combat &&
            t.addLight(
              new L(e.pos.x, 1.2, e.pos.z),
              [0.3, 0.6, 1],
              3,
              10,
              0.6,
            ));
      }
      preRender(t) {
        let e = this.game,
          n = document.getElementById("markers");
        if (!n) return;
        if (this.sonarT <= 0) {
          this.markers.length && ((n.innerHTML = ""), (this.markers = []));
          return;
        }
        let i = e.player,
          r = [];
        if (e.monsters)
          for (let l of e.monsters.list)
            !l.dead &&
              Math.hypot(l.pos.x - i.pos.x, l.pos.z - i.pos.z) < 45 &&
              r.push({
                x: l.pos.x,
                y: (l.pos.y || 0) + l.def.height * 0.7,
                z: l.pos.z,
                c: "m",
              });
        if (e.fs && e.fs.items)
          for (let l of e.fs.items)
            !l.taken &&
              Math.hypot(l.x - i.pos.x, l.z - i.pos.z) < 45 &&
              (be[l.type].kind === "crate" ||
                be[l.type].kind === "gun" ||
                l.type === "gold" ||
                l.type === "relic") &&
              r.push({ x: l.x, y: 0.3, z: l.z, c: "i" });
        for (; this.markers.length < r.length; ) {
          let l = document.createElement("i");
          (n.appendChild(l), this.markers.push(l));
        }
        let o = new L(),
          a = window.innerWidth,
          c = window.innerHeight;
        this.markers.forEach((l, h) => {
          let u = r[h];
          if (!u) {
            l.style.display = "none";
            return;
          }
          if ((o.set(u.x, u.y, u.z).project(t), o.z > 1 || o.z < -1)) {
            l.style.display = "none";
            return;
          }
          ((l.style.display = "block"),
            (l.className = u.c),
            (l.style.transform = `translate(${(o.x * 0.5 + 0.5) * a}px, ${(-o.y * 0.5 + 0.5) * c}px)`));
        });
      }
      render(t) {
        for (let e = 0; e < 3; e++) {
          let n = this.btns[e],
            i = this.slots[e];
          if (!n) continue;
          let r = Math.ceil(this.cd[e]),
            o = (i || "") + ":" + r + ":" + (this.cd[e] > 0 ? 1 : 0);
          if (!t && n._key === o) {
            this.cd[e] > 0 &&
              n.style.setProperty("--cd", this.cd[e] / Gr[i].cd);
            continue;
          }
          if (((n._key = o), !i)) {
            n.style.display = "none";
            continue;
          }
          n.style.display = "";
          let a = Gr[i];
          ((n.innerHTML =
            a.icon +
            (this.cd[e] > 0 ? `<span class="cdn">${r}</span>` : "") +
            `<span class="lbl">${a.name}</span>`),
            n.classList.toggle("cooling", this.cd[e] > 0),
            n.style.setProperty("--cd", this.cd[e] > 0 ? this.cd[e] / a.cd : 0),
            n.setAttribute(
              "aria-label",
              a.name + (this.cd[e] > 0 ? ` 残り${r}秒` : ""),
            ));
        }
      }
      drawMap(t, e) {
        if (!(this.sonarT <= 0 || !this.game.monsters)) {
          t.fillStyle = "#ff5a4a";
          for (let n of this.game.monsters.list)
            n.dead ||
              (t.beginPath(),
              t.arc(
                (n.pos.x / 4) * e,
                (n.pos.z / 4) * e,
                Math.max(2, e * 0.3),
                0,
                Math.PI * 2,
              ),
              t.fill());
        }
      }
    };
  var y_ = [
      "IDタグ：「第二次潜行班　所属不明」",
      "無線機から、まだ雑音だけが聞こえている",
      "マスクの中は……空っぽだった",
      "手帳：「黄色い部屋を抜けても終わりじゃない。下はもっと静かだ」",
      "手帳：「青い部屋には入るな。入口がいつの間にか消える。でも中は宝の山だ」",
      "手帳：「長居するほど空気が濁る。濁るほど“あれ”が増える」",
      "手帳：「祭壇にお金を置けば、一度だけ助けてくれる」",
      "手帳：「換気口の中なら、でかい奴は追ってこられない」",
      "手帳：「笑う奴は暗がりにいる。明かりの下を歩け」",
      "手帳：「マネキンは見ている間は動かない。目を離すな」",
      "手帳：「赤い部屋の犬は区画から出ない。逃げ切れ」",
      "手帳：「壁は壊せる。道がなければ作れ」",
      "最後の録音：「……エレベーターは、まだ動くはずだ……」",
      "IDタグ：「第五次調査隊　救助班」",
    ],
    jd = class {
      constructor(t) {
        ((this.game = t),
          (t.corpses = this),
          (this.list = []),
          (this.checkT = 0));
      }
      onNewRun() {
        this.clear();
      }
      onFloorGenerated(t) {
        let e = t.map,
          n = t.depth,
          i = new Ci(e.seed + 7331),
          r = e.distFromStart,
          o = [],
          a = 2 + n + (i.chance(0.5) ? 1 : 0),
          c = new Set();
        for (let l = 0; l < 900 && o.length < a; l++) {
          let h = Math.floor(i.next() * e.N);
          if (
            c.has(h) ||
            !e.reach[h] ||
            e.floor[h] !== 0 ||
            e.feat[h] !== 0 ||
            (r[h] >= 0 && r[h] < 10)
          )
            continue;
          let u = h % e.W,
            f = (h / e.W) | 0,
            d = [];
          for (let S = 0; S < 4; S++)
            !e.passable(u, f, S) && e.inb(u + ge[S], f + xe[S]) && d.push(S);
          if (!d.length) continue;
          let p = e.zone[h];
          if (p !== 1 && p !== 2 && d.length < 3 && i.chance(0.55)) continue;
          c.add(h);
          let g = d[Math.floor(i.next() * d.length)],
            m = i.chance(0.55) ? "sit" : i.chance(0.6) ? "prone" : "curl",
            x = 4 / 2 - 0.2 / 2,
            v = m === "sit" ? x - 0.36 : x - 1.05,
            y = i.range(-1, 1),
            _ = (u + 0.5) * 4 + ge[g] * v + xe[g] * y,
            M = (f + 0.5) * 4 + xe[g] * v + ge[g] * y,
            b = Math.atan2(-ge[g], -xe[g]);
          m !== "sit" && (b += i.range(-1.2, 1.2) + Math.PI / 2);
          let w = {
            x: _,
            z: M,
            yaw: b,
            pose: m,
            seed: (i.next() * 1e6) | 0,
            tint: Us[i.int(0, 4)],
            dirt: 0.5 + i.next() * 0.5,
            note: y_[Math.floor(i.next() * y_.length)],
            read: !1,
            rig: null,
          };
          if ((o.push(w), t.items)) {
            let S = (C, R = {}) => {
                let I = i.range(0, Math.PI * 2),
                  k = i.range(0.35, 0.9);
                t.items.push({
                  id: t.items.length,
                  type: C,
                  x: _ + Math.cos(I) * k - ge[g] * 0.2,
                  z: M + Math.sin(I) * k - xe[g] * 0.2,
                  rot: i.range(0, 6.28),
                  taken: !1,
                  ...R,
                });
              },
              T = [1500, 4e3, 8e3, 14e3, 24e3][n - 1];
            S("cash", { value: Math.round((T * i.range(1.2, 3)) / 100) * 100 });
            let E = [
              "bandage",
              "medkit",
              "water",
              "energy",
              "filter",
              "gas",
              "flare",
              "painkiller",
              "revive",
            ];
            for (let C = i.int(1, 3); C > 0; C--)
              S(
                E[
                  Math.floor(
                    i.next() * (i.chance(0.1) ? E.length : E.length - 1),
                  )
                ],
              );
            (i.chance(0.4) && S(i.chance(0.6) ? "pistol" : "shotgun"),
              i.chance(0.5) && S(i.chance(0.6) ? "ammo_9mm" : "ammo_12g"));
          }
        }
        t.corpses = o;
      }
      onFloorEnter(t) {
        (this.clear(), (this.fs = t), (this.list = t.corpses || []), Rc(60));
      }
      onFloorExit() {
        this.clear();
      }
      clear() {
        for (let t of this.list) this.drop(t);
      }
      drop(t) {
        t.rig &&
          (this.game.scene.remove(t.rig.root), Hr(t.rig), (t.rig = null));
      }
      update(t) {
        this.checkT -= t;
        let e = this.game.player;
        if (this.checkT <= 0) {
          this.checkT = 0.4;
          let n = Ud();
          for (let i of this.list) {
            let r = Math.hypot(e.pos.x - i.x, e.pos.z - i.z);
            if (((i.d = r), r < 42 && !i.rig && n)) {
              let o = Od(this.game.shared, { tint: i.tint, dirt: i.dirt });
              if (!o) continue;
              (o.root.position.set(i.x, 0, i.z),
                (o.root.rotation.y = i.yaw),
                zd(o, i.pose, i.seed),
                (o.mat.uniforms.uDark.value = 0.12),
                this.game.scene.add(o.root),
                (i.rig = o));
            } else r > 52 && i.rig && this.drop(i);
          }
        }
        for (let n of this.list)
          n.rig &&
            n.rig.setLOD &&
            n.rig.setLOD(Math.hypot(e.pos.x - n.x, e.pos.z - n.z));
      }
      contextAction() {
        let t = this.game.player;
        if (t.dead) return null;
        for (let e of this.list)
          if (!(Math.hypot(t.pos.x - e.x, t.pos.z - e.z) > 1.35))
            return {
              type: "corpse",
              label: e.read
                ? "遺体（調べた）"
                : "遺体を調べる",
              run: () => {
                ((e.read = !0),
                  this.game.toast(e.note, 3400),
                  this.game.audio &&
                    this.game.audio.sfx("click", { vol: 0.5 }));
              },
            };
        return null;
      }
      drawMap(t, e) {
        let n = this.fs && this.fs.map;
        if (n) {
          t.fillStyle = "rgba(230,200,120,0.85)";
          for (let i of this.list) {
            let r = Math.floor(i.x / 4),
              o = Math.floor(i.z / 4);
            if (!n.explored[n.ci(r, o)]) continue;
            let a = (i.x / 4) * e,
              c = (i.z / 4) * e,
              l = Math.max(2, e * 0.22);
            (t.fillRect(a - l, c - l * 0.3, l * 2, l * 0.6),
              t.fillRect(a - l * 0.3, c - l, l * 0.6, l * 2));
          }
        }
      }
    };
  var KA = new Set([
      "pistol",
      "revolver",
      "smg",
      "shotgun",
      "rifle",
      "launcher",
    ]),
    jA = new Qt().set(-1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1),
    ng = (s) =>
      "#" +
      s
        .map((t) =>
          Math.round(Math.min(1, t * 1.15) * 255)
            .toString(16)
            .padStart(2, "0"),
        )
        .join(""),
    Zd = class {
      constructor(t) {
        ((this.game = t),
          (t.avatars = this),
          (this.map = new Map()),
          (this.geos = new Map()),
          (this.teamEl = document.getElementById("team")),
          (this.teamT = 0));
      }
      onFloorEnter(t) {
        (this.clear(), (this.fs = t));
      }
      onFloorExit() {
        this.clear();
      }
      onNewRun() {
        this.clear();
      }
      clear() {
        for (let t of this.map.values()) this.dispose(t);
        this.map.clear();
      }
      remove(t) {
        let e = this.map.get(t);
        e && (this.dispose(e), this.map.delete(t));
      }
      dispose(t) {
        (t.rig && (this.game.scene.remove(t.rig.root), Hr(t.rig)),
          t.tag && (t.tag.material.map.dispose(), t.tag.material.dispose()));
      }
      weaponGeo(t) {
        if (!this.geos.has(t)) {
          let e = _h(t).build();
          (e.applyMatrix4(jA), this.geos.set(t, e));
        }
        return this.geos.get(t);
      }
      makeTag(t, e) {
        let n = document.createElement("canvas");
        ((n.width = 256), (n.height = 64));
        let i = n.getContext("2d");
        ((i.font = "bold 30px system-ui, sans-serif"),
          (i.textAlign = "center"),
          (i.textBaseline = "middle"),
          (i.lineWidth = 6),
          (i.strokeStyle = "rgba(0,0,0,0.85)"),
          i.strokeText(t, 128, 32),
          (i.fillStyle = ng(e)),
          i.fillText(t, 128, 32));
        let r = new Si(n),
          o = new mo(new Ar({ map: r, transparent: !0, depthWrite: !1 }));
        return (o.scale.set(0.9, 0.225, 1), o);
      }
      create(t) {
        let e = Us[t.suit % Us.length],
          n = Od(this.game.shared, { tint: e, dirt: 0.25 });
        if (!n) return null;
        this.game.scene.add(n.root);
        let i = {
          id: t.id,
          rig: n,
          x: t.x,
          y: t.y,
          z: t.z,
          yaw: t.yaw + Math.PI,
          w: void 0,
          wMesh: null,
          dead: !1,
          swing: 0,
          flash: 0,
          anim: {
            phase: 0,
            speed: 0,
            moving: 0,
            attack: 0,
            t: Math.random() * 5,
            lookYaw: 0,
            lookPitch: 0,
            twitch: 0,
            aware: !0,
          },
        };
        return (
          (i.tag = this.makeTag(t.name, e)),
          i.tag.position.set(0, 2.08, 0),
          n.root.add(i.tag),
          i
        );
      }
      flash(t) {
        let e = this.map.get(t);
        e && (e.flash = 1);
      }
      update(t) {
        let e = this.game,
          n = e.net;
        if (
          ((this.teamT -= t),
          this.teamT <= 0 && ((this.teamT = 0.4), this.renderTeam()),
          !n || !n.active || !this.fs)
        )
          return;
        if (!Ud()) {
          Rc(90);
          return;
        }
        let i = this.fs.depth;
        for (let r of n.teammates()) {
          let o = !r.ret && (r.dead ? r.deathD === i : r.depth === i),
            a = this.map.get(r.id);
          if (!o) {
            a && this.remove(r.id);
            continue;
          }
          if (
            (a && a.dead !== !!r.dead && (this.remove(r.id), (a = null)), !a)
          ) {
            if (((a = this.create(r)), !a)) continue;
            ((a.dead = !!r.dead), this.map.set(r.id, a));
          }
          this.pose(a, r, t);
        }
      }
      pose(t, e, n) {
        let i = this.game,
          r = t.rig;
        if (((r.root.visible = !(i.spectating && i.specId === e.id)), e.dead)) {
          t.posed ||
            ((t.posed = !0),
            r.root.position.set(e.dx, 0, e.dz),
            (r.root.rotation.y = t.yaw),
            zd(r, "prone", e.idx));
          return;
        }
        let o = Math.min(1, n * 12),
          a = t.x,
          c = t.z;
        (Math.hypot(e.x - t.x, e.z - t.z) > 5
          ? ((t.x = e.x), (t.z = e.z))
          : ((t.x += (e.x - t.x) * o), (t.z += (e.z - t.z) * o)),
          (t.y += (e.y - t.y) * o));
        let l = e.yaw + Math.PI - t.yaw;
        for (; l > Math.PI; ) l -= Math.PI * 2;
        for (; l < -Math.PI; ) l += Math.PI * 2;
        t.yaw += l * o;
        let h = Math.hypot(t.x - a, t.z - c),
          u = t.anim;
        ((u.t += n), (u.phase += (h / (e.s === 2 ? 0.5 : 0.85)) * Math.PI));
        let f = h / Math.max(n, 0.001);
        ((u.moving += (Math.min(1, f / 1.2) - u.moving) * Math.min(1, n * 8)),
          (u.speed +=
            (Math.min(1, Math.max(0, (f - 2) / 3)) - u.speed) *
            Math.min(1, n * 6)),
          (u.lookPitch = e.pitch * 0.8),
          (u.lookYaw = 0),
          (t.swing = e.at
            ? Math.min(1, t.swing + n * 4)
            : Math.max(0, t.swing - n * 3)),
          (u.attack = 0),
          r.root.position.set(t.x, t.y, t.z),
          r.root.rotation.set(0, t.yaw, 0),
          Bd(r, u, n),
          t.w !== e.w &&
            ((t.w = e.w),
            t.wMesh &&
              (t.wMesh.parent && t.wMesh.parent.remove(t.wMesh),
              (t.wMesh = null)),
            e.w &&
              Ad.includes(e.w) &&
              i.items &&
              ((t.wMesh = new te(this.weaponGeo(e.w), i.items.mat)),
              t.wMesh.position.set(0, -0.075, 0.012),
              r.armL.hand.add(t.wMesh))));
        let d = KA.has(e.w),
          p = r.armL,
          g = r.armR;
        if (d)
          (p.up.rotation.set(-1.45 - e.pitch * 0.9, 0, -0.08),
            (p.el.rotation.x = -0.12),
            Wn[e.w] &&
              Wn[e.w].twoHand &&
              (g.up.rotation.set(-1.35 - e.pitch * 0.9, 0, 0.55),
              (g.el.rotation.x = -0.8)),
            (r.spine.rotation.y = -0.12));
        else if (e.w) {
          let m = t.swing;
          ((p.up.rotation.x =
            -0.45 - m * 1.9 + (m > 0.6 ? (m - 0.6) * 3.5 : 0)),
            (p.el.rotation.x = -0.9 + m * 0.5));
        }
        (t.flash > 0 &&
          ((t.flash -= n * 8),
          t.flash > 0.5 &&
            d &&
            i.addLight(
              {
                x: t.x - Math.sin(e.yaw) * 0.7,
                y: t.y + 1.4,
                z: t.z - Math.cos(e.yaw) * 0.7,
              },
              [1, 0.7, 0.35],
              4,
              7,
              0.06,
            )),
          e.s === 1
            ? ((r.hips.position.y -= r.legLen * 0.34),
              (r.legL.th.rotation.x -= 0.95),
              (r.legR.th.rotation.x -= 0.75),
              (r.legL.kn.rotation.x += 1.5),
              (r.legR.kn.rotation.x += 1.3),
              (r.legL.an.rotation.x -= 0.5),
              (r.legR.an.rotation.x -= 0.45),
              (r.spine.rotation.x += 0.35))
            : e.s === 2 &&
              ((r.root.rotation.x = Math.PI / 2 - 0.06),
              (r.root.position.y = t.y + 0.17),
              (r.neck.rotation.x = -1.2),
              d ||
                ((r.armL.up.rotation.x =
                  -2.6 + Math.sin(u.phase) * 0.4 * u.moving),
                (r.armR.up.rotation.x =
                  -2.6 - Math.sin(u.phase) * 0.4 * u.moving),
                (r.armL.el.rotation.x = r.armR.el.rotation.x = -0.6))),
          r.setLOD &&
            r.setLOD(
              Math.hypot(i.camera.position.x - t.x, i.camera.position.z - t.z),
            ));
      }
      contextAction() {
        let t = this.game,
          e = t.net;
        if (!e || !e.active || t.player.dead) return null;
        for (let n of e.deadTeammates())
          if (
            !(
              n.deathD !== this.fs.depth ||
              Math.hypot(t.player.pos.x - n.dx, t.player.pos.z - n.dz) > 1.8
            )
          )
            return t.items && t.items.countOf("revive") > 0
              ? {
                  type: "revive",
                  label: `蘇生キットで ${n.name} を起こす`,
                  run: () => {
                    (t.items.takeOne("revive"),
                      t.items.renderPouch && t.items.renderPouch(),
                      e.revive(n),
                      t.toast(`${n.name} を蘇生した`, 1800),
                      t.audio && t.audio.sfx("revive", { vol: 0.9 }));
                  },
                }
              : {
                  type: "revive",
                  label: `${n.name}（蘇生キットか祭壇が要る）`,
                  run: () =>
                    t.toast(
                      "蘇生キットを持っていない。祭壇でお布施をしても蘇る",
                      2200,
                    ),
                };
        return null;
      }
      renderTeam() {
        let t = this.game,
          e = t.net,
          n = this.teamEl;
        if (!n) return;
        let i = !!(e && e.active && e.started && t.state !== "title");
        if (((n.style.display = i ? "" : "none"), !i)) return;
        let r = e
          .teammates()
          .map((o) => {
            let a = ng(Us[o.suit % Us.length]),
              c = o.ret
                ? "帰還"
                : o.dead
                  ? "倒れた"
                  : "B" + o.depth,
              l =
                o.ret || o.dead
                  ? 0
                  : Math.max(0, Math.min(1, o.hp / (o.mh || 100)));
            return `<div class="tm${o.dead ? " down" : ""}${o.ret ? " ret" : ""}"><i style="background:${a}"></i><span class="n">${ZA(o.name)}</span><span class="f">${c}</span><b><u style="transform:scaleX(${l})"></u></b></div>`;
          })
          .join("");
        r !== this._rows && ((this._rows = r), (n.innerHTML = r));
      }
      drawMap(t, e) {
        let n = this.game,
          i = n.net;
        if (!(!i || !i.active || !this.fs))
          for (let r of i.teammates()) {
            if (
              !(r.dead
                ? r.deathD === this.fs.depth
                : r.depth === this.fs.depth) ||
              r.ret
            )
              continue;
            let a = ((r.dead ? r.dx : r.x) / 4) * e,
              c = ((r.dead ? r.dz : r.z) / 4) * e;
            ((t.fillStyle = ng(Us[r.suit % Us.length])),
              (t.strokeStyle = "#000"),
              (t.lineWidth = 1.5),
              t.beginPath(),
              t.arc(a, c, Math.max(4, e * 0.5), 0, Math.PI * 2),
              t.fill(),
              t.stroke(),
              r.dead &&
                ((t.strokeStyle = "#fff"),
                t.beginPath(),
                t.moveTo(a - 4, c - 4),
                t.lineTo(a + 4, c + 4),
                t.moveTo(a + 4, c - 4),
                t.lineTo(a - 4, c + 4),
                t.stroke()),
              (t.fillStyle = "#fff"),
              (t.font = "bold 12px sans-serif"),
              t.fillText(r.name, a + 7, c - 6));
          }
      }
    };
  function ZA(s) {
    return String(s).replace(
      /[&<>"']/g,
      (t) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[t],
    );
  }
  var F_ = "ABCDEFGHJKMNPQRSTUVWXYZ23456789",
    U_ = "noclip-clean-v3-",
    pe = (s) => Math.round(s * 100) / 100,
    oC = { idle: 0, wander: 1, investigate: 2, search: 3, return: 4, chase: 5 };
  function aC() {
    let s = new URLSearchParams(location.search),
      t = { debug: 1 };
    return (
      s.get("peerhost") &&
        ((t.host = s.get("peerhost")),
        (t.port = +(s.get("peerport") || 9e3)),
        (t.path = s.get("peerpath") || "/"),
        (t.secure = s.get("peersecure") === "1"),
        (t.key = s.get("peerkey") || "peerjs"),
        (t.config = { iceServers: [] })),
      t
    );
  }
  var cC = () => {
      let s = "";
      for (let t = 0; t < 5; t++)
        s += F_[Math.floor(Math.random() * F_.length)];
      return s;
    },
    gp = class {
      constructor(t) {
        ((this.game = t),
          (t.net = this),
          (this.active = !1),
          (this.isHost = !1),
          (this.started = !1),
          (this.peer = null),
          (this.conns = new Map()),
          (this.players = new Map()),
          (this.selfId = null),
          (this.code = null),
          (this.nextIdx = 1),
          (this.floors = {}),
          (this.pending = new Map()),
          (this.rid = 1),
          (this.dropSeq = 1),
          (this.monSeq = 1),
          (this.sendT = 0),
          (this.monT = 0),
          (this.ownT = 0),
          (this.statusT = 0),
          (this.onPlayers = null),
          (this.onStatus = null),
          (this.onStart = null),
          (this.onLost = null),
          (this.onEnd = null));
      }
      status(t) {
        this.onStatus && this.onStatus(t);
      }
      openPeer(t) {
        return new Promise((e, n) => {
          let i = !1,
            r = new N_(t, aC()),
            o = setTimeout(() => {
              if (!i) {
                i = !0;
                try {
                  r.destroy();
                } catch {}
                n(new Error("timeout"));
              }
            }, 15e3);
          (r.on("open", (a) => {
            i || ((i = !0), clearTimeout(o), e(r));
          }),
            r.on("error", (a) => {
              if (i) {
                this.peerError(a);
                return;
              }
              ((i = !0), clearTimeout(o));
              try {
                r.destroy();
              } catch {}
              n(a);
            }));
        });
      }
      peerError(t) {
        (console.warn("peer error", t && t.type, t),
          !this.isHost &&
            t &&
            t.type === "peer-unavailable" &&
            this.status(
              "部屋が見つからない（コードを確かめて）",
            ));
      }
      async host(t, e) {
        (this.leave(),
          this.status(
            "部屋を作っています…",
          ));
        let n = null;
        for (let i = 0; i < 4 && !n; i++) {
          let r = cC();
          try {
            ((n = await this.openPeer(U_ + r)), (this.code = r));
          } catch (o) {
            if (!o || o.type !== "unavailable-id")
              throw (
                this.status(
                  "接続できませんでした（" +
                    ((o && o.type) || o.message || "error") +
                    "）",
                ),
                o
              );
          }
        }
        if (!n) throw new Error("no code");
        return (
          (this.peer = n),
          (this.isHost = !0),
          (this.active = !0),
          (this.selfId = n.id),
          this.players.clear(),
          this.addPlayer({ id: n.id, idx: 0, name: t, suit: 0, host: !0 }),
          n.on("connection", (i) => this.accept(i)),
          n.on("disconnected", () => {
            try {
              n.reconnect();
            } catch {}
          }),
          this.status("友達を待っています"),
          this.emitPlayers(),
          this.code
        );
      }
      async join(t, e) {
        (this.leave(),
          (t = (t || "").trim().toUpperCase()),
          this.status("接続しています…"));
        let n = await this.openPeer(void 0);
        ((this.peer = n),
          (this.isHost = !1),
          (this.selfId = n.id),
          (this.code = t),
          n.on("error", (r) => this.peerError(r)));
        let i = n.connect(U_ + t, { reliable: !0, serialization: "json" });
        return new Promise((r, o) => {
          let a = setTimeout(() => {
            (this.status(
              "部屋が見つからない（コードを確かめて）",
            ),
              o(new Error("timeout")));
          }, 15e3);
          (i.on("open", () => {
            (this.conns.set("host", i), i.send({ t: "hello", name: e }));
          }),
            i.on("data", (c) => {
              (c && c.t === "wc" && (clearTimeout(a), (this.active = !0), r(c)),
                this.onMsg(c, "host"));
            }),
            i.on("close", () =>
              this.lost(
                "ホストとの接続が切れた",
              ),
            ),
            i.on("error", () =>
              this.lost(
                "ホストとの接続が切れた",
              ),
            ));
        });
      }
      accept(t) {
        (t.on("open", () => {}), t.on("data", (n) => this.onMsg(n, t.peer, t)));
        let e = () => {
          if (!this.conns.has(t.peer)) return;
          this.conns.delete(t.peer);
          let n = this.players.get(t.peer);
          (this.players.delete(t.peer),
            n && this.game.toast(`${n.name} が抜けた`, 1800),
            this.broadcast({ t: "pl", list: this.playerList() }),
            this.emitPlayers(),
            this.game.avatars && this.game.avatars.remove(t.peer),
            this.checkEnd());
        };
        (t.on("close", e), t.on("error", e));
      }
      leave() {
        for (let t of this.conns.values())
          try {
            t.close();
          } catch {}
        if ((this.conns.clear(), this.peer))
          try {
            this.peer.destroy();
          } catch {}
        ((this.peer = null),
          (this.active = !1),
          (this.isHost = !1),
          (this.started = !1),
          this.players.clear(),
          (this.floors = {}),
          this.pending.clear(),
          this.game.avatars && this.game.avatars.clear());
      }
      lost(t) {
        if (!this.active) return;
        let e = this.started;
        (this.leave(),
          this.game.toast(
            t + (e ? "。ひとりで続ける" : ""),
            3e3,
          ),
          this.game.monsters && this.game.monsters.setRemote(!1),
          this.game.spectating &&
            this.game.endSpectate &&
            this.game.endSpectate(!0),
          this.onLost && this.onLost(t));
      }
      addPlayer(t) {
        let e = Object.assign(
          {
            depth: 0,
            x: 0,
            y: 0,
            z: 0,
            yaw: 0,
            pitch: 0,
            s: 0,
            hp: 100,
            mh: 100,
            dead: !1,
            ret: !1,
            w: null,
            sp: 0,
            fl: 0,
            ns: 0,
            lt: 0.5,
            vd: 0,
            t: performance.now(),
            mode: "scav",
          },
          t,
        );
        return (
          (e.proxy = {
            remote: !0,
            id: e.id,
            pos: { x: 0, y: 0, z: 0 },
            yaw: 0,
            stance: 0,
            noise: 0,
            dead: !1,
            radius: 0.3,
            eye: 1.6,
            vis: 0.6,
            light: 0.5,
            flash: !1,
            vel: { x: 0, z: 0 },
            slow: 0,
          }),
          this.players.set(e.id, e),
          e
        );
      }
      playerList() {
        return [...this.players.values()].map((t) => ({
          id: t.id,
          idx: t.idx,
          name: t.name,
          suit: t.suit,
          mode: t.mode,
          dead: t.dead,
          ret: t.ret,
          host: !!t.host,
          depth: t.depth,
        }));
      }
      emitPlayers() {
        this.onPlayers && this.onPlayers(this.playerList());
      }
      self() {
        return this.players.get(this.selfId);
      }
      setMode(t) {
        let e = this.self();
        (e && (e.mode = t),
          this.send({ t: "md", mode: t }),
          this.isHost &&
            (this.broadcast({ t: "pl", list: this.playerList() }),
            this.emitPlayers()));
      }
      startAll(t) {
        ((this.started = !0), this.broadcast({ t: "go", seed: t }));
      }
      inviteLink() {
        return location.origin + location.pathname + "?room=" + this.code;
      }
      send(t) {
        if (!this.active) return;
        if (this.isHost) {
          this.handle(t, this.selfId, !0);
          return;
        }
        let e = this.conns.get("host");
        if (e && e.open)
          try {
            e.send(t);
          } catch {}
      }
      broadcast(t, e) {
        if (this.isHost) {
          for (let [n, i] of this.conns)
            if (n !== e && i.open)
              try {
                i.send(t);
              } catch {}
        }
      }
      to(t, e) {
        if (!this.isHost) return;
        let n = this.conns.get(t);
        if (n && n.open)
          try {
            n.send(e);
          } catch {}
      }
      emit(t) {
        this.active &&
          ((t.from = this.selfId),
          this.record(t),
          this.isHost ? this.broadcast(t) : this.send(t));
      }
      onMsg(t, e, n) {
        !t ||
          !t.t ||
          (this.isHost
            ? this.handleHost(t, e, n)
            : this.handle(t, t.from || "host", !1));
      }
      handleHost(t, e, n) {
        switch (t.t) {
          case "hello": {
            if (!n) return;
            this.conns.set(e, n);
            let i = this.addPlayer({
              id: e,
              idx: this.nextIdx++,
              name: (t.name || "探索者").slice(0, 12),
              suit: 0,
            });
            i.suit = i.idx % 8;
            let r = this.game,
              o = r.player;
            (n.send({
              t: "wc",
              you: { id: e, idx: i.idx, suit: i.suit },
              code: this.code,
              started: this.started,
              seed: r.run && r.run.seed,
              players: this.playerList(),
              floors: this.serializeFloors(),
              host: { depth: r.fs ? r.fs.depth : 1, x: o.pos.x, z: o.pos.z },
            }),
              this.broadcast({ t: "pl", list: this.playerList() }, e),
              this.emitPlayers(),
              r.toast(`${i.name} が参加した`, 1800));
            return;
          }
          case "md": {
            let i = this.players.get(e);
            (i && (i.mode = t.mode),
              this.broadcast({ t: "pl", list: this.playerList() }),
              this.emitPlayers());
            return;
          }
          case "cr": {
            let i = this.floor(t.d),
              r = !i.taken.has(t.id);
            (r &&
              (i.taken.add(t.id),
              this.applyTaken(t.d, t.id),
              this.broadcast({ t: "tk", d: t.d, id: t.id }, e)),
              this.to(e, { t: "ca", rid: t.rid, ok: r }));
            return;
          }
          case "dr": {
            let i = this.makeDrop(t.d, t.type, t.x, t.z, t.extra || {});
            (this.broadcast({ t: "dp", d: t.d, it: i }),
              this.applyDrop(t.d, i));
            return;
          }
        }
        ((t.from = t.from || e),
          this.broadcast(t, e),
          this.handle(t, t.from, !1));
      }
      handle(t, e, n) {
        let i = this.game;
        if (n) {
          if (t.t === "cr") {
            let o = this.floor(t.d),
              a = !o.taken.has(t.id);
            (a &&
              (o.taken.add(t.id),
              this.broadcast({ t: "tk", d: t.d, id: t.id })),
              this.resolveClaim(t.rid, a));
            return;
          }
          if (t.t === "dr") {
            let o = this.makeDrop(t.d, t.type, t.x, t.z, t.extra || {});
            (this.broadcast({ t: "dp", d: t.d, it: o }),
              this.applyDrop(t.d, o));
            return;
          }
          if (t.t === "md") return;
          ((t.from = this.selfId), this.broadcast(t));
          return;
        }
        this.record(t);
        let r = i.fs && i.fs.depth;
        switch (t.t) {
          case "wc": {
            ((this.selfId = t.you.id), this.players.clear());
            for (let a of t.players) this.addPlayer(a);
            let o = this.players.get(this.selfId);
            (o && ((o.suit = t.you.suit), (o.idx = t.you.idx)),
              this.loadFloors(t.floors),
              (this.started = !!t.started),
              this.emitPlayers(),
              this.status(
                t.started
                  ? "探索中の部屋に合流します"
                  : "ホストの出発を待っています",
              ),
              t.started &&
                this.onStart &&
                this.onStart(t.seed, {
                  join: !0,
                  depth: t.host.depth,
                  x: t.host.x,
                  z: t.host.z,
                }));
            return;
          }
          case "pl": {
            let o = new Map(this.players);
            this.players.clear();
            for (let a of t.list) {
              let c = o.get(a.id),
                l = c || this.addPlayer(a);
              (Object.assign(l, {
                idx: a.idx,
                name: a.name,
                suit: a.suit,
                mode: a.mode,
                host: a.host,
              }),
                c && this.players.set(a.id, c));
            }
            for (let a of o.keys())
              this.players.has(a) || (i.avatars && i.avatars.remove(a));
            this.emitPlayers();
            return;
          }
          case "go": {
            ((this.started = !0),
              this.onStart && this.onStart(t.seed, { join: !1 }));
            return;
          }
          case "st": {
            let o = this.players.get(e);
            if (!o) return;
            ((o.depth = t.d),
              (o.x = t.x),
              (o.y = t.y),
              (o.z = t.z),
              (o.yaw = t.yw),
              (o.pitch = t.pt),
              (o.s = t.s),
              (o.hp = t.hp),
              (o.mh = t.mh),
              (o.w = t.w),
              (o.sp = t.sp),
              (o.fl = t.fl),
              (o.ns = t.ns),
              (o.lt = t.lt),
              (o.vd = t.vd),
              (o.at = t.at),
              (o.t = performance.now()),
              t.dead !== void 0 && (o.dead = !!t.dead),
              (o.ret = !!t.ret));
            let a = o.proxy;
            ((a.pos.x = t.x),
              (a.pos.y = t.y),
              (a.pos.z = t.z),
              (a.yaw = t.yw),
              (a.stance = t.s),
              (a.noise = t.ns),
              (a.dead = o.dead || o.ret),
              (a.flash = !!t.fl),
              (a.light = t.lt));
            let c = Math.min(1.3, Math.max(0.18, 0.25 + t.lt * 0.85));
            (t.s === 1 ? (c *= 0.55) : t.s === 2 && (c *= 0.32),
              (c *= 1 + Math.min(t.sp, 5) * 0.06),
              t.fl && (c *= 1.25),
              (a.vis = c * (t.vm ?? 1)));
            return;
          }
          case "tk":
            this.applyTaken(t.d, t.id);
            return;
          case "ca":
            this.resolveClaim(t.rid, t.ok);
            return;
          case "dp":
            this.applyDrop(t.d, t.it);
            return;
          case "mn":
            this.applySnapshot(t);
            return;
          case "ms":
            t.d === r && this.spawnMon(t);
            return;
          case "mh": {
            if (t.d !== r || !this.ownsFloor(t.d) || !i.monsters) return;
            let o = i.monsters,
              a = o.byNid(t.nid);
            if (!a || a.dead) return;
            let c = this.players.get(t.from);
            if (t.k === "stun") {
              o.stunArea(
                { x: t.px ?? a.pos.x, z: t.pz ?? a.pos.z },
                0.01 +
                  Math.hypot(
                    (t.px ?? a.pos.x) - a.pos.x,
                    (t.pz ?? a.pos.z) - a.pos.z,
                  ) +
                  0.1,
                t.st,
                !0,
              );
              return;
            }
            o.damage(a, t.a, null, t.k, {
              net: !0,
              stun: t.st,
              by: c && c.proxy,
            });
            return;
          }
          case "hu": {
            if (t.to !== this.selfId) return;
            let o = i.player;
            if (
              o.dead ||
              i.state !== "play" ||
              Math.hypot(o.pos.x - t.x, o.pos.z - t.z) > 5
            )
              return;
            if ((i.hurtPlayer(t.a, { x: t.x, z: t.z }, t.c), t.kb)) {
              let a = o.pos.x - t.x,
                c = o.pos.z - t.z,
                l = Math.hypot(a, c) || 1;
              ((o.vel.x += (a / l) * t.kb), (o.vel.z += (c / l) * t.kb));
            }
            return;
          }
          case "nz":
            t.d === r &&
              this.ownsFloor(t.d) &&
              i.emitNoise(t.x, t.z, t.r, t.k, t.dc, !0);
            return;
          case "wh":
            t.d === r &&
              i.combat &&
              i.combat.damageWall(
                { vert: !!t.e[0], i: t.e[1], j: t.e[2] },
                t.v,
                t.a,
                { x: t.p[0], y: t.p[1], z: t.p[2] },
                { x: t.n[0], y: 0, z: t.n[1] },
                0,
                { remote: !0 },
              );
            return;
          case "wb":
            if (t.d === r && i.combat) {
              let o = { vert: !!t.e[0], i: t.e[1], j: t.e[2] },
                a = {
                  x: (o.vert ? o.i : o.i + 0.5) * 4,
                  y: 1.2,
                  z: (o.vert ? o.j + 0.5 : o.j) * 4,
                };
              i.combat.breakEdge(
                o,
                a,
                i.combat.wallColorAt(a, { x: 1, z: 0 }),
                {
                  dir: t.dir ? { x: t.dir[0], z: t.dir[1] } : void 0,
                  remote: !0,
                },
              );
            }
            return;
          case "pj":
            t.d === r &&
              i.combat &&
              be[t.type] &&
              i.combat.spawnProj(
                t.type,
                be[t.type],
                new L(...t.p),
                new L(...t.v),
                { remote: !0, id: t.id, owner: t.from },
              );
            return;
          case "fx": {
            if (t.d !== r || !i.combat) return;
            let o = new L(...t.p);
            if (t.k === "explode")
              (i.combat.explode(o.clone(), t.radius, t.dmg, { remote: !0 }),
                this.ownsFloor(r) &&
                  i.monsters &&
                  i.monsters.explosion(o, t.radius, t.dmg));
            else if (t.k === "flash") {
              let a = be.flash || {};
              (i.combat.flashBang(o.clone(), a, { remote: !0 }),
                this.ownsFloor(r) &&
                  i.monsters &&
                  i.monsters.stunArea(o, a.radius || 13, a.stun || 4.5));
            } else heroNetFx(i, t.k, o, t);
            return;
          }
          case "sh":
            t.d === r &&
              i.audio &&
              (i.audio.sfx(t.w, {
                pos: { x: t.x, z: t.z },
                vol: 1,
                range: 90,
                vary: 0.06,
              }),
              i.avatars && i.avatars.flash(t.from));
            return;
          case "cl":
            t.d === r &&
              i.miasma &&
              i.miasma.addCloud(t.x, t.z, t.r, t.dur, t.amount, { remote: !0 });
            return;
          case "vt":
            t.d === r && i.vents && i.vents.openKey(t.key, !0);
            return;
          case "nt":
            i.toast(t.text, 2600);
            return;
          case "dd": {
            let o = this.players.get(e);
            (o && ((o.dead = !0), (o.deathD = t.d), (o.dx = t.x), (o.dz = t.z)),
              i.feed(
                `${o ? o.name : "仲間"} が倒れた`,
                "#ff7a6a",
              ),
              i.audio && i.audio.sfx("sting_red", { vol: 0.5, important: !0 }),
              this.checkEnd());
            return;
          }
          case "rv": {
            let o = this.players.get(t.to);
            (o && (o.dead = !1),
              t.to === this.selfId
                ? i.reviveLocal && i.reviveLocal(t.d, t.x, t.z, t.by)
                : i.feed(
                    `${o ? o.name : "仲間"} が蘇った`,
                    "#9cffb0",
                  ));
            return;
          }
          case "rt": {
            let o = this.players.get(e);
            (o && (o.ret = !0),
              i.feed(
                `${o ? o.name : "仲間"} が帰還した`,
                "#ffe08a",
              ),
              this.checkEnd());
            return;
          }
          case "end":
            i.netEnd && i.netEnd();
            return;
        }
      }
      floor(t) {
        return (
          this.floors[t] ||
          (this.floors[t] = {
            taken: new Set(),
            drops: new Map(),
            breaks: new Map(),
            vents: new Set(),
            dead: new Set(),
            snap: new Map(),
            spawns: new Map(),
            mia: 0,
          })
        );
      }
      record(t) {
        if (t.d === void 0) return;
        let e = this.floor(t.d);
        switch (t.t) {
          case "wb":
            e.breaks.set((t.e[0] ? "v" : "h") + t.e[1] + "," + t.e[2], {
              e: t.e,
              dir: t.dir,
            });
            break;
          case "vt":
            e.vents.add(t.key);
            break;
          case "ms":
            e.spawns.set(t.nid, t);
            break;
          case "mn":
            for (let n of t.l)
              n[1] === -1
                ? (e.dead.add(n[0]), e.snap.delete(n[0]))
                : e.snap.set(n[0], n);
            e.mia = Math.max(e.mia, t.mi || 0);
            break;
          case "tk":
            e.taken.add(t.id);
            break;
          case "dp":
            e.drops.set(t.it.id, t.it);
            break;
        }
      }
      serializeFloors() {
        let t = {};
        for (let e in this.floors) {
          let n = this.floors[e];
          t[e] = {
            taken: [...n.taken],
            drops: [...n.drops.values()],
            breaks: [...n.breaks.values()],
            vents: [...n.vents],
            dead: [...n.dead],
            snap: [...n.snap.values()],
            spawns: [...n.spawns.values()],
            mia: n.mia,
          };
        }
        return t;
      }
      loadFloors(t) {
        this.floors = {};
        for (let e in t || {}) {
          let n = this.floor(+e),
            i = t[e];
          (i.taken.forEach((r) => n.taken.add(r)),
            i.drops.forEach((r) => n.drops.set(r.id, r)),
            i.breaks.forEach((r) =>
              n.breaks.set((r.e[0] ? "v" : "h") + r.e[1] + "," + r.e[2], r),
            ),
            i.vents.forEach((r) => n.vents.add(r)),
            i.dead.forEach((r) => n.dead.add(r)),
            i.snap.forEach((r) => n.snap.set(r[0], r)),
            i.spawns.forEach((r) => n.spawns.set(r.nid, r)),
            (n.mia = i.mia || 0));
        }
      }
      applyFloor(t) {
        let e = this.floors[t.depth];
        if (!e) return;
        let n = t.map;
        if (t.items) {
          for (let r of t.items) e.taken.has(r.id) && (r.taken = !0);
          let i = new Set(t.items.map((r) => r.id));
          for (let r of e.drops.values())
            i.has(r.id) || t.items.push({ ...r, taken: e.taken.has(r.id) });
        }
        for (let i of e.breaks.values())
          Z1(
            n,
            { vert: !!i.e[0], i: i.e[1], j: i.e[2] },
            i.dir ? { x: i.dir[0], z: i.dir[1] } : void 0,
          );
        for (let i of e.vents) n.ventOpen.add(i);
        if (t.monsters) {
          let i = this.game,
            r = new Set(t.monsters.map((a) => a.nid));
          for (let a of e.spawns.values())
            !r.has(a.nid) && i.monsters && t.monsters.push(this.makeSpawn(a));
          let o = new Map(t.monsters.map((a) => [a.nid, a]));
          for (let a of e.dead) {
            let c = o.get(a);
            c && !c.dead && ((c.dead = !0), (c.state = "dead"), (c.deadT = 99));
          }
          for (let a of e.snap.values()) {
            let c = o.get(a[0]);
            c &&
              !c.dead &&
              ((c.pos.x = a[1]),
              (c.pos.z = a[2]),
              (c.yaw = a[3]),
              (c.hp = a[8]));
          }
        }
        e.mia > (t.miasma || 0) && (t.miasma = e.mia);
      }
      makeDrop(t, e, n, i, r) {
        let o = {
          id: 1e6 + this.dropSeq++,
          type: e,
          x: n,
          z: i,
          rot: Math.random() * 6.28,
          taken: !1,
          dropped: !0,
          ...r,
        };
        return (delete o.pending, this.floor(t).drops.set(o.id, o), o);
      }
      applyDrop(t, e) {
        this.floor(t).drops.set(e.id, e);
        let n = this.game,
          i = n.run && n.run.floors[t];
        !i ||
          !i.items ||
          i.items.some((r) => r.id === e.id) ||
          i.items.push({ ...e });
      }
      applyTaken(t, e) {
        this.floor(t).taken.add(e);
        let n = this.game,
          i = n.run && n.run.floors[t];
        if (!i || !i.items) return;
        let r = i.items.find((o) => o.id === e);
        !r ||
          r.taken ||
          ((r.taken = !0),
          (r.pending = !1),
          n.fs === i && n.items && n.items.removeMesh(r));
      }
      resolveClaim(t, e) {
        let n = this.pending.get(t);
        if (!n) return;
        this.pending.delete(t);
        let i = this.game;
        ((n.it.pending = !1),
          e
            ? ((n.it.taken = !0),
              i.items && i.items.removeMesh(n.it),
              n.apply && n.apply())
            : i.toast("誰かが先に拾った", 1e3));
      }
      claim(t, e, n) {
        let i = this.rid++;
        (this.pending.set(i, { it: e, apply: n }),
          this.send({ t: "cr", d: t, id: e.id, rid: i }));
      }
      taken(t, e) {
        this.isHost &&
          (this.floor(t).taken.add(e),
          this.broadcast({ t: "tk", d: t, id: e }));
      }
      drop(t, e, n, i, r = {}) {
        let o = { ...r };
        return (
          delete o.pending,
          this.send({ t: "dr", d: t, type: e, x: n, z: i, extra: o }),
          null
        );
      }
      wallHit(t, e, n, i, r, o) {
        this.emit({
          t: "wh",
          d: t,
          e: [e.vert ? 1 : 0, e.i, e.j],
          v: n,
          a: i,
          p: [pe(r.x), pe(r.y), pe(r.z)],
          n: [o.x, o.z],
        });
      }
      wallBreak(t, e, n) {
        this.emit({
          t: "wb",
          d: t,
          e: [e.vert ? 1 : 0, e.i, e.j],
          dir: n ? [Math.sign(n.x), Math.sign(n.z)] : null,
        });
      }
      shot(t, e) {
        let n = this.game;
        this.emit({ t: "sh", d: n.fs.depth, x: pe(t.x), z: pe(t.z), w: e });
      }
      proj(t, e) {
        e.remote ||
          this.emit({
            t: "pj",
            d: t,
            type: e.type,
            p: [pe(e.pos.x), pe(e.pos.y), pe(e.pos.z)],
            v: [pe(e.vel.x), pe(e.vel.y), pe(e.vel.z)],
            id: e.id,
          });
      }
      fx(t, e, n, i = {}) {
        this.emit({
          t: "fx",
          d: t,
          k: e,
          p: [pe(n.x), pe(n.y), pe(n.z)],
          ...i,
        });
      }
      cloud(t, e) {
        this.emit({
          t: "cl",
          d: t,
          x: pe(e.x),
          z: pe(e.z),
          r: e.r,
          dur: e.dur,
          amount: e.amount,
        });
      }
      vent(t, e) {
        this.emit({ t: "vt", d: t, key: e });
      }
      notice(t) {
        this.emit({ t: "nt", text: t });
      }
      noise(t, e, n, i, r, o) {
        this.emit({ t: "nz", d: t, x: pe(e), z: pe(n), r: i, k: r, dc: !!o });
      }
      hurt(t, e, n, i, r, o) {
        this.emit({
          t: "hu",
          to: t,
          a: Math.round(e * 10) / 10,
          c: n,
          x: pe(i),
          z: pe(r),
          kb: o,
        });
      }
      monHit(t, e, n, i, r, o) {
        this.emit({
          t: "mh",
          d: t,
          nid: e,
          a: Math.round(n * 10) / 10,
          k: i,
          st: r,
          px: o ? pe(o.x) : void 0,
          pz: o ? pe(o.z) : void 0,
        });
      }
      monSpawn(t, e) {
        this.emit({
          t: "ms",
          d: t,
          nid: e.nid,
          sp: e.sp,
          x: pe(e.pos.x),
          z: pe(e.pos.z),
          yaw: pe(e.yaw),
          home: e.home,
        });
      }
      newMonId() {
        let t = this.self();
        return 1e5 + (t ? t.idx : 0) * 2e4 + this.monSeq++;
      }
      makeSpawn(t) {
        let n = this.game.monsters.makeMon(t.sp, t.x, t.z, t.yaw, {
          home: t.home,
          spawned: !0,
        });
        return (
          (n.nid = t.nid),
          (n.remote = !this.ownsFloor(this.game.fs ? this.game.fs.depth : 0)),
          (n.state = "investigate"),
          (n.alert = 0.5),
          n
        );
      }
      spawnMon(t) {
        let e = this.game.monsters;
        !e || e.byNid(t.nid) || e.list.push(this.makeSpawn(t));
      }
      onFloor(t) {
        return [...this.players.values()]
          .filter(
            (e) =>
              e.depth === t &&
              !e.dead &&
              !e.ret &&
              (e.id === this.selfId || performance.now() - e.t < 8e3),
          )
          .sort((e, n) => e.idx - n.idx);
      }
      ownsFloor(t) {
        if (!this.active) return !0;
        let e = this.onFloor(t);
        return e.length ? e[0].id === this.selfId : !1;
      }
      huntable(t, e) {
        let n = performance.now();
        for (let i of this.players.values())
          i.id !== this.selfId &&
            i.depth === t &&
            !i.dead &&
            !i.ret &&
            n - i.t < 4e3 &&
            e.push(i.proxy);
        return e;
      }
      playersOnFloor(t) {
        return this.onFloor(t).map((e) =>
          e.id === this.selfId ? this.game.player.pos : e.proxy.pos,
        );
      }
      teammates() {
        return [...this.players.values()].filter((t) => t.id !== this.selfId);
      }
      aliveTeammates() {
        return this.teammates().filter((t) => !t.dead && !t.ret);
      }
      deadTeammates() {
        return this.teammates().filter((t) => t.dead && !t.ret);
      }
      localDied(t) {
        let e = this.game,
          n = e.player,
          i = this.self();
        (i &&
          ((i.dead = !0),
          (i.deathD = e.fs.depth),
          (i.dx = n.pos.x),
          (i.dz = n.pos.z)),
          this.emit({
            t: "dd",
            d: e.fs.depth,
            x: pe(n.pos.x),
            z: pe(n.pos.z),
            c: t,
          }),
          e.startSpectate && e.startSpectate(t),
          this.checkEnd());
      }
      reviveTarget() {
        let t = this.game,
          e = t.player;
        if (!t.items || t.items.countOf("revive") <= 0) return null;
        for (let n of this.deadTeammates())
          if (
            n.deathD === t.fs.depth &&
            Math.hypot(e.pos.x - n.dx, e.pos.z - n.dz) < 1.8
          )
            return n;
        return null;
      }
      revive(t) {
        let e = this.game;
        (this.emit({
          t: "rv",
          to: t.id,
          d: t.deathD,
          x: t.dx,
          z: t.dz,
          by: e.player.name || "",
        }),
          (t.dead = !1));
      }
      altarRevive(t, e, n) {
        for (let i of this.deadTeammates())
          (this.emit({ t: "rv", to: i.id, d: t, x: pe(e + 1), z: pe(n + 1) }),
            (i.dead = !1));
      }
      finalDeath(t) {
        let e = this.game,
          n = e.player,
          i = this.self();
        (i && ((i.dead = !0), (i.deathD = e.fs.depth)),
          this.emit({
            t: "dd",
            d: e.fs.depth,
            x: pe(n.pos.x),
            z: pe(n.pos.z),
            c: t,
          }),
          this.checkEnd());
      }
      returned(t) {
        let e = this.self();
        (e && (e.ret = !0), this.emit({ t: "rt", money: t }), this.checkEnd());
      }
      checkEnd() {
        if (!this.isHost || !this.started) return;
        let t = [...this.players.values()];
        t.length &&
          t.every((e) => e.dead || e.ret) &&
          (this.broadcast({ t: "end" }),
          this.game.netEnd && this.game.netEnd());
      }
      update(t) {
        if (!this.active || !this.started) return;
        let e = this.game,
          n = e.player;
        if (!e.fs || !e.run) return;
        let i = this.self();
        if (
          (i &&
            ((i.depth = (n.dead && i.deathD) || e.fs.depth),
            (i.dead = !!n.dead),
            (i.t = performance.now())),
          (this.sendT -= t),
          this.sendT <= 0)
        ) {
          this.sendT = 0.09;
          let r = {
            t: "st",
            d: (n.dead && i && i.deathD) || e.fs.depth,
            vd: e.fs.depth,
            x: pe(n.pos.x),
            y: pe(n.pos.y),
            z: pe(n.pos.z),
            yw: pe(n.yaw),
            pt: pe(n.pitch),
            s: n.stance,
            hp: Math.round(n.hp),
            mh: n.maxHp,
            dead: n.dead ? 1 : 0,
            ret: e.run.won ? 1 : 0,
            w: e.items && e.items.equipped() ? e.items.equipped().type : null,
            sp: pe(n.speed || 0),
            fl: e.flashI > 0.5 ? 1 : 0,
            ns: Math.round(n.noise || 0),
            lt: pe(e.localLight ?? 0.5),
            vm: pe(n.visMul ?? 1),
            at:
              e.combat &&
              e.combat.animKind === "swing" &&
              e.combat.anim < e.combat.animDur
                ? 1
                : 0,
          };
          this.isHost
            ? ((r.from = this.selfId), this.broadcast(r))
            : this.send(r);
        }
      }
      monTick(t, e) {
        let n = e.fs.depth,
          i = this.ownsFloor(n);
        if (
          ((i !== this._own || n !== this._ownD) &&
            ((this._own = i),
            (this._ownD = n),
            e.setRemote(!i),
            (this._full = !0)),
          !i)
        )
          return;
        let r = this.onFloor(n).length;
        if (
          (r !== this._nOn && ((this._nOn = r), (this._full = !0)),
          (this.monT -= t),
          this.monT > 0)
        )
          return;
        this.monT = 0.12;
        let o = this._full;
        this._full = !1;
        let a = [];
        for (let c of e.list) {
          if (c.dead) {
            (!c._sentDead || o) && (a.push([c.nid, -1]), (c._sentDead = !0));
            continue;
          }
          c.localAI ||
            (!o && !((c.td ?? 999) < 75 || c.d < 75 || c.state === "chase")) ||
            a.push([
              c.nid,
              pe(c.pos.x),
              pe(c.pos.z),
              pe(c.yaw),
              oC[c.state] ?? 0,
              pe(c.anim.moving),
              pe(c.anim.speed),
              pe(c.anim.attack),
              Math.round(c.hp),
              c.def.behavior === "flyer" ? pe(c.pos.y) : 0,
              c.frozen ? 1 : 0,
            ]);
        }
        this.emit({
          t: "mn",
          d: n,
          l: a,
          mi: Math.round((e.fs.miasma || 0) * 10) / 10,
        });
      }
      applySnapshot(t) {
        let e = this.game;
        if (!e.fs || e.fs.depth !== t.d || this.ownsFloor(t.d) || !e.monsters)
          return;
        t.mi !== void 0 && (e.fs.miasma = t.mi);
        let n = e.monsters;
        for (let i of t.l) {
          let r = n.byNid(i[0]);
          if (r) {
            if (i[1] === -1) {
              r.dead || n.kill(r);
              continue;
            }
            ((r.net = {
              x: i[1],
              z: i[2],
              yaw: i[3],
              st: i[4],
              mv: i[5],
              sp: i[6],
              at: i[7],
              y: i[9],
              fr: i[10],
            }),
              (r.hp = i[8]),
              !r.remote && !r.localAI && (r.remote = !0));
          }
        }
      }
    };
  function O_(s) {
    let t = new Ed();
    ((s.audio = t),
      (t.occlusion = (h, u) =>
        s.fs && !nn(s.fs.map, s.player.pos.x, s.player.pos.z, h, u)));
    let e = new Rd(s);
    s.items = e;
    let n = new Vd(s),
      i = new Id(s);
    (s.addSystem(e), s.addSystem(n), s.addSystem(i));
    let r = new Gd(s);
    ((s.decor = r), s.addSystem(r));
    let o = new Wd(s);
    ((s.traps = o), s.addSystem(o));
    let a = new qd(s);
    ((s.elevator = a), s.addSystem(a));
    let c = new Pd(s);
    ((s.decals = c),
      s.addSystem(c),
      s.addSystem(new Xd(s)),
      s.addSystem(new Yd(s)),
      s.addSystem(new $d(s)),
      s.addSystem(new Kd(s)),
      s.addSystem(new jd(s)),
      s.addSystem(new Zd(s)),
      new gp(s),
      s.addSystem({
        onFloorEnter(h) {
          t.setTheme(h.themeId);
        },
        onZoneChange(h, u) {
          h === 1
            ? t.sfx("sting_red", { vol: 0.6, important: !0 })
            : h === 2 && t.sfx("sting_blue", { vol: 0.7, important: !0 });
        },
      }));
    let l = s.player;
    ((l.onStep = (h, u, f) => {
      if (s.state !== "play") return;
      let d = s.fs.theme.floorKind,
        p = l.inDuct,
        g = p
          ? "step_metal"
          : h
            ? "step_water"
            : d === "carpet" || d === "officeCarpet"
              ? "step_carpet"
              : d === "grating"
                ? "step_metal"
                : "step_hard",
        m = p
          ? 0.2
          : (f === 2 ? 0.12 : f === 1 ? 0.22 : u ? 0.75 : 0.45) *
            (d === "carpet" ? 1.2 : 1);
      t.sfx(g, { vol: m, vary: 0.15 });
    }),
      (l.onLand = (h) => {
        h < -3 && t.sfx("land", { vol: Math.min(1, -h / 8) });
      }));
  }
  var Fh = {
      weapons: {
        knife: [1, 0],
        crowbar: [1, 0],
        pipe: [1, 0],
        machete: [1, 2e4],
        axe: [2, 4e4],
        hammer: [2, 6e4],
        pistol: [2, 0],
        smg: [4, 0],
        shotgun: [4, 0],
        revolver: [3, 8e4],
        rifle: [5, 12e4],
        launcher: [6, 3e5],
      },
      armor: { vest: [3, 9e4] },
      items: {
        bandage: [1, 0],
        water: [1, 0],
        energy: [1, 0],
        gas: [1, 0],
        flare: [1, 0],
        buzzer: [1, 0],
        painkiller: [1, 15e3],
        flash: [1, 2e4],
        medkit: [2, 3e4],
        bomb: [2, 3e4],
        adren: [2, 4e4],
        stim: [2, 4e4],
        filter: [1, 4e4],
        gasbig: [3, 6e4],
        revive: [4, 8e4],
      },
      skills: {
        frag: [3, 0],
        flash: [2, 0],
        stim: [3, 0],
        rage: [5, 0],
        decoy: [1, 3e4],
        gas: [3, 5e4],
        sonar: [2, 6e4],
        breach: [4, 1e5],
        thermite: [6, 2e5],
        barrage: [6, 25e4],
      },
    },
    ex = {
      cap: {
        name: "装備容量 +4",
        max: 4,
        price: [8e4, 16e4, 32e4, 64e4],
      },
      pouch: {
        name: "持ち物枠 +2",
        max: 2,
        price: [6e4, 15e4],
      },
      hp: { name: "最大体力 +20", max: 2, price: [1e5, 25e4] },
      stam: {
        name: "スタミナ +25",
        max: 2,
        price: [5e4, 12e4],
      },
      suit: {
        name: "防護服 瘴気耐性 +15%",
        max: 2,
        price: [15e4, 3e5],
      },
    },
    lC = 24,
    hC = {
      weapons: ["smg", "pistol"],
      skills: ["frag", "stim", "rage"],
      armor: null,
      items: { bandage: 2, water: 1, gas: 1 },
    },
    Nh = (s) => "\xA5" + Math.round(s).toLocaleString(),
    xp = class {
      constructor(t) {
        this.s = t;
        let e = t.meta || {};
        ((t.meta = {
          bank: e.bank || 0,
          unlocks: e.unlocks || [],
          upg: e.upg || {},
          loadout: e.loadout || JSON.parse(JSON.stringify(hC)),
          mode: e.mode || "scav",
          name: e.name || "",
          runs: e.runs || 0,
          hero: e.hero || "minato",
          heroes: e.heroes || [],
        }),
          (this.m = t.meta));
      }
      save() {
        this.s.save();
      }
      get bank() {
        return this.m.bank;
      }
      price(t, e) {
        return (Fh[t][e] || [0, 0])[1];
      }
      cost(t, e) {
        return (Fh[t][e] || [0, 0])[0];
      }
      unlocked(t, e) {
        return this.price(t, e) === 0 || this.m.unlocks.includes(t + ":" + e);
      }
      unlock(t, e) {
        let n = this.price(t, e);
        return this.unlocked(t, e)
          ? !0
          : this.m.bank < n
            ? !1
            : ((this.m.bank -= n),
              this.m.unlocks.push(t + ":" + e),
              this.save(),
              !0);
      }
      level(t) {
        return this.m.upg[t] || 0;
      }
      buyUpgrade(t) {
        let e = ex[t],
          n = this.level(t);
        if (n >= e.max) return !1;
        let i = e.price[n];
        return this.m.bank < i
          ? !1
          : ((this.m.bank -= i), (this.m.upg[t] = n + 1), this.save(), !0);
      }
      capacity() {
        return lC + 4 * this.level("cap");
      }
      pouchSize() {
        return 8 + 2 * this.level("pouch");
      }
      stats() {
        return {
          maxHp: 100 + 20 * this.level("hp"),
          maxStamina: 100 + 25 * this.level("stam"),
          miasmaRes: 0.15 * this.level("suit"),
        };
      }
      loadoutCost(t = this.m.loadout) {
        let e = 0;
        for (let n of t.weapons) n && (e += this.cost("weapons", n));
        for (let n of t.skills) n && (e += this.cost("skills", n));
        t.armor && (e += this.cost("armor", t.armor));
        for (let n in t.items) e += this.cost("items", n) * t.items[n];
        return e;
      }
      runLoadout(t) {
        let e = {
          mode: t,
          pouchSize: this.pouchSize(),
          stats: this.stats(),
          weapons: [],
          ammo: {},
          items: [],
          skills: [null, null, null],
          armor: null,
        };
        if (t !== "sf") return e;
        let n = this.m.loadout;
        e.weapons = n.weapons
          .filter((i) => i && this.unlocked("weapons", i))
          .slice(0, 2);
        for (let i of e.weapons) {
          let r = be[i];
          r.ammo && (e.ammo[r.ammo] = (e.ammo[r.ammo] || 0) + (qo[i] || 6) * 3);
        }
        e.skills = n.skills.map((i) =>
          i && this.unlocked("skills", i) ? i : null,
        );
        for (let i in n.items)
          n.items[i] > 0 &&
            this.unlocked("items", i) &&
            e.items.push([i, n.items[i]]);
        return (
          n.armor &&
            this.unlocked("armor", n.armor) &&
            (e.armor = {
              type: n.armor,
              armor: be[n.armor].armor,
              dura: be[n.armor].dura,
              max: be[n.armor].dura,
            }),
          e
        );
      }
      deposit(t) {
        ((this.m.bank += Math.max(0, Math.round(t))),
          this.m.runs++,
          this.save());
      }
    },
    vp = class {
      constructor(t, e, n) {
        ((this.meta = t),
          (this.root = e),
          (this.onChange = n),
          (this.armed = null),
          (this.upgOnly = !1),
          e.addEventListener("click", (i) => this.click(i)));
      }
      open(t) {
        ((this.upgOnly = !!t), (this.armed = null), this.render());
      }
      click(t) {
        let e = t.target.closest("[data-a]");
        if (!e) return;
        let n = this.meta,
          i = n.m.loadout,
          r = e.dataset.a,
          o = e.dataset.cat,
          a = e.dataset.id;
        if (r === "pick" || r === "buy") {
          if (!n.unlocked(o, a)) {
            let c = o + ":" + a;
            if (this.armed !== c) {
              ((this.armed = c), this.render());
              return;
            }
            if (!n.unlock(o, a)) {
              this.flash("お金が足りない");
              return;
            }
            this.armed = null;
          }
          if (o === "weapons") {
            let c = i.weapons.indexOf(a);
            if (c >= 0) i.weapons[c] = null;
            else {
              let l = i.weapons.indexOf(null);
              l >= 0
                ? (i.weapons[l] = a)
                : i.weapons.length < 2
                  ? i.weapons.push(a)
                  : (i.weapons[1] = a);
            }
          } else if (o === "skills")
            if (Gr[a].ult) i.skills[2] = i.skills[2] === a ? null : a;
            else {
              let l = i.skills.indexOf(a);
              l >= 0 && l < 2
                ? (i.skills[l] = null)
                : i.skills[0]
                  ? (i.skills[1] && (i.skills[0] = i.skills[1]),
                    (i.skills[1] = a))
                  : (i.skills[0] = a);
            }
          else
            o === "armor"
              ? (i.armor = i.armor === a ? null : a)
              : o === "items" && r === "buy" && (i.items[a] = i.items[a] || 0);
        } else if (r === "inc" || r === "dec") {
          if (!n.unlocked("items", a)) {
            this.flash("先に解放が必要");
            return;
          }
          let c = (i.items[a] || 0) + (r === "inc" ? 1 : -1),
            l = be[a].stack * 2;
          ((i.items[a] = Math.max(0, Math.min(l, c))),
            i.items[a] || delete i.items[a]);
        } else if (r === "upg") {
          let c = "upg:" + a;
          if (this.armed !== c) {
            ((this.armed = c), this.render());
            return;
          }
          if (!n.buyUpgrade(a)) {
            this.flash("お金が足りない");
            return;
          }
          this.armed = null;
        }
        (n.save(), this.render(), this.onChange && this.onChange());
      }
      flash(t) {
        let e = document.getElementById("cap-lab");
        e &&
          ((e.textContent = t),
          (e.style.color = "#ffb2a8"),
          setTimeout(() => {
            ((e.style.color = ""), this.render());
          }, 1100));
      }
      card(t, e, n, i = "") {
        let r = this.meta,
          o = !r.unlocked(t, e),
          a = this.armed === t + ":" + e,
          c = t === "skills" ? Gr[e].name : be[e].name,
          l = t === "skills" ? Gr[e].icon : wc[e] || "",
          h = r.cost(t, e),
          u = o
            ? `<span class="c">${a ? "もう一度で解放 " : "\u{1F512}"}${Nh(r.price(t, e))}</span>`
            : `<span class="c">容量${h}</span>`;
        return `<button type="button" class="card${n ? " on" : ""}${o ? " locked" : ""}" data-a="pick" data-cat="${t}" data-id="${e}" title="${t === "skills" ? Gr[e].desc : ""}">${l}<span>${c}</span>${u}${i}</button>`;
      }
      render() {
        let t = this.meta,
          e = t.m.loadout;
        document
          .querySelectorAll(".bank-live")
          .forEach((c) => (c.textContent = Nh(t.bank)));
        let n = document.getElementById("bank-arm");
        n && (n.textContent = "倉庫 " + Nh(t.bank));
        let i = t.loadoutCost(),
          r = t.capacity(),
          o = document.getElementById("cap");
        ((o.style.display = this.upgOnly ? "none" : ""),
          o.classList.toggle("over", i > r),
          (document.getElementById("cap-lab").textContent =
            `容量 ${i} / ${r}` +
            (i > r ? "　（多すぎる）" : "")),
          (document.getElementById("cap-fill").style.transform =
            `scaleX(${Math.min(1, i / r)})`),
          (document.getElementById("arm-title").textContent = this.upgOnly
            ? "倉庫・強化"
            : "特殊部隊の装備"),
          (document.getElementById("b-deploy").style.display = this.upgOnly
            ? "none"
            : ""),
          (document.getElementById("b-deploy").disabled = i > r));
        let a = "";
        (this.upgOnly ||
          ((a += `<div class="sec"><h3>武器（2つまで）</h3><div class="cards">${Object.keys(
            Fh.weapons,
          )
            .map((c) => this.card("weapons", c, e.weapons.includes(c)))
            .join("")}</div></div>`),
          (a += `<div class="sec"><h3>スキル（2つ）</h3><div class="cards">${x_.map((c) => this.card("skills", c, e.skills[0] === c || e.skills[1] === c)).join("")}</div></div>`),
          (a += `<div class="sec"><h3>必殺スキル（1つ）</h3><div class="cards">${v_.map((c) => this.card("skills", c, e.skills[2] === c)).join("")}</div></div>`),
          (a += `<div class="sec"><h3>防具</h3><div class="cards">${Object.keys(
            Fh.armor,
          )
            .map((c) => this.card("armor", c, e.armor === c))
            .join("")}</div></div>`),
          (a += `<div class="sec"><h3>持ち物（1個ごとに容量を使う）</h3><div class="cards">${Object.keys(
            Fh.items,
          )
            .map((c) => {
              let l = e.items[c] || 0,
                h = !t.unlocked("items", c),
                u = this.armed === "items:" + c,
                f = h
                  ? `<span class="c" data-a="buy" data-cat="items" data-id="${c}">${u ? "もう一度で解放 " : "\u{1F512}"}${Nh(t.price("items", c))}</span>`
                  : `<span class="c">容量${t.cost("items", c)}</span><span class="pm"><span data-a="dec" data-id="${c}">−</span><span class="n">${l}</span><span data-a="inc" data-id="${c}">＋</span></span>`;
              return `<div class="card${l ? " on" : ""}${h ? " locked" : ""}" ${h ? `data-a="buy" data-cat="items" data-id="${c}"` : ""}>${wc[c] || ""}<span>${be[c].name}</span>${f}</div>`;
            })
            .join("")}</div></div>`)),
          (a += `<div class="sec"><h3>強化（両方のモードに効く）</h3><div class="upg">${Object.keys(
            ex,
          )
            .map((c) => {
              let l = ex[c],
                h = t.level(c),
                u = h >= l.max,
                f = this.armed === "upg:" + c;
              return `<button type="button" class="card${u ? " on" : ""}" data-a="upg" data-id="${c}" ${u ? "disabled" : ""}><span>${l.name}</span><span class="c">${u ? "最大" : (f ? "もう一度で購入 " : "") + Nh(l.price[h])}　Lv${h}/${l.max}</span></button>`;
            })
            .join("")}</div></div>`),
          (this.root.innerHTML = a));
      }
    };
