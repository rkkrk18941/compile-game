// HDR post pipeline: scene -> (bloom chain, god rays) -> AgX tone map, grading, grain.
import * as THREE from "three";

const FS_VERT = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";

const DOWN_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold; uniform float uFirst;
varying vec2 vUv;
vec3 tap(vec2 o){ return texture2D(tSrc, vUv + o * uTexel).rgb; }
void main(){
  // 13-tap downsample (Jimenez 2014)
  vec3 a = tap(vec2(-2,-2)), b = tap(vec2(0,-2)), c = tap(vec2(2,-2));
  vec3 d = tap(vec2(-1,-1)), e = tap(vec2(1,-1));
  vec3 f = tap(vec2(-2,0)), g = tap(vec2(0,0)), h = tap(vec2(2,0));
  vec3 i = tap(vec2(-1,1)), j = tap(vec2(1,1));
  vec3 k = tap(vec2(-2,2)), l = tap(vec2(0,2)), m = tap(vec2(2,2));
  vec3 col = (d+e+i+j) * 0.125 + (a+b+f+g) * 0.03125 + (b+c+g+h) * 0.03125 + (f+g+k+l) * 0.03125 + (g+h+l+m) * 0.03125;
  if (uFirst > 0.5){
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col *= smoothstep(uThreshold, uThreshold * 3.0, lum);
    col = min(col, vec3(60.0));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const UP_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tSrc; uniform sampler2D tPrev; uniform vec2 uTexel; uniform float uRadius;
varying vec2 vUv;
void main(){
  vec2 t = uTexel * uRadius;
  vec3 s = texture2D(tSrc, vUv + vec2(-t.x, -t.y)).rgb + texture2D(tSrc, vUv + vec2(0.0, -t.y)).rgb * 2.0 + texture2D(tSrc, vUv + vec2(t.x, -t.y)).rgb
         + texture2D(tSrc, vUv + vec2(-t.x, 0.0)).rgb * 2.0 + texture2D(tSrc, vUv).rgb * 4.0 + texture2D(tSrc, vUv + vec2(t.x, 0.0)).rgb * 2.0
         + texture2D(tSrc, vUv + vec2(-t.x, t.y)).rgb + texture2D(tSrc, vUv + vec2(0.0, t.y)).rgb * 2.0 + texture2D(tSrc, vUv + vec2(t.x, t.y)).rgb;
  gl_FragColor = vec4(s / 16.0 + texture2D(tPrev, vUv).rgb, 1.0);
}`;

const RAYS_MASK_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 uSun; uniform float uAspect;
varying vec2 vUv;
void main(){
  float d = texture2D(tDepth, vUv).r;
  float sky = step(0.99999, d);
  vec2 dv = (vUv - uSun) * vec2(uAspect, 1.0);
  float fall = exp(-dot(dv, dv) * 5.0);
  vec3 c = texture2D(tColor, vUv).rgb;
  float lum = dot(c, vec3(0.3, 0.5, 0.2));
  gl_FragColor = vec4(c * sky * fall * smoothstep(0.2, 2.5, lum), 1.0);
}`;

const RAYS_BLUR_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tSrc; uniform vec2 uSun; uniform float uStep;
varying vec2 vUv;
void main(){
  vec2 delta = (vUv - uSun) * uStep / 24.0;
  vec2 uv = vUv;
  vec3 acc = vec3(0.0);
  float w = 1.0;
  for (int i = 0; i < 24; i++){
    acc += texture2D(tSrc, uv).rgb * w;
    uv -= delta;
    w *= 0.955;
  }
  gl_FragColor = vec4(acc / 12.0, 1.0);
}`;

const FINAL_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tRays;
uniform float uExposure; uniform float uBloom; uniform float uRays; uniform float uTime;
uniform float uVignette; uniform vec3 uGrade; uniform float uSat; uniform float uContrast;
uniform vec3 uTint; uniform float uFlash; uniform vec3 uFlashC; uniform float uNoise; uniform float uHasRays;
varying vec2 vUv;

// AgX (Blender's default view transform since 4.0), minimal polynomial fit
vec3 agxContrast(vec3 x){
  vec3 x2 = x * x; vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
vec3 agx(vec3 c){
  const mat3 m = mat3(0.842479062253094, 0.0423282422610123, 0.0423756549057051,
                      0.0784335999999992, 0.878468636469772, 0.0784336,
                      0.0792237451477643, 0.0791661274605434, 0.879142973793104);
  const float mn = -12.47393, mx = 4.026069;
  c = m * c;
  c = clamp(log2(max(c, 1e-10)), mn, mx);
  c = (c - mn) / (mx - mn);
  return agxContrast(c);
}
vec3 agxEotf(vec3 c){
  const mat3 mi = mat3(1.19687900512017, -0.0528968517574562, -0.0529716355144438,
                       -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
                       -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
  c = mi * c;
  return pow(max(c, 0.0), vec3(2.2));
}
vec3 agxLook(vec3 c){
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = pow(max(c, 0.0), vec3(uContrast));
  return l + uSat * (c - l);
}
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec3 c = texture2D(tScene, vUv).rgb;
  c += texture2D(tBloom, vUv).rgb * uBloom;
  if (uHasRays > 0.5) c += texture2D(tRays, vUv).rgb * uRays;
  c *= uExposure * uGrade;
  c = mix(c, c * uTint, 1.0);
  c = agx(c);
  c = agxLook(c);
  c = agxEotf(c);
  // vignette
  vec2 v = vUv - 0.5;
  c *= 1.0 - dot(v, v) * uVignette;
  c = mix(c, uFlashC, uFlash);
  // linear -> sRGB
  c = mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  // film grain + dither
  float n = h12(vUv * 1931.7 + fract(uTime * 7.31) * 113.0) - 0.5;
  c += n * (uNoise + 1.0 / 255.0);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

function pass(frag, uniforms) {
  return new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
}

export class Post {
  constructor(renderer, quality) {
    this.r = renderer;
    this.q = quality;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.Camera();
    const gl = renderer.getContext();
    this.hdr = renderer.extensions.has("EXT_color_buffer_float") || renderer.extensions.has("EXT_color_buffer_half_float");
    const type = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.type = type;
    this.sceneRT = new THREE.WebGLRenderTarget(4, 4, { type, samples: quality.msaa, depthBuffer: true });
    if (quality.godrays) {
      this.sceneRT.depthTexture = new THREE.DepthTexture(4, 4);
      this.sceneRT.depthTexture.type = THREE.UnsignedIntType;
    }
    this.bloomLevels = [];
    this.upLevels = [];
    for (let i = 0; i < 5; i++) {
      this.bloomLevels.push(new THREE.WebGLRenderTarget(4, 4, { type, depthBuffer: false }));
      this.upLevels.push(new THREE.WebGLRenderTarget(4, 4, { type, depthBuffer: false }));
    }
    for (const rt of [...this.bloomLevels, ...this.upLevels]) rt.texture.minFilter = rt.texture.magFilter = THREE.LinearFilter;
    this.raysA = new THREE.WebGLRenderTarget(4, 4, { type, depthBuffer: false });
    this.raysB = new THREE.WebGLRenderTarget(4, 4, { type, depthBuffer: false });
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.black.needsUpdate = true;
    this.downMat = pass(DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.2 }, uFirst: { value: 0 } });
    this.upMat = pass(UP_FRAG, { tSrc: { value: null }, tPrev: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 } });
    this.maskMat = pass(RAYS_MASK_FRAG, { tColor: { value: null }, tDepth: { value: null }, uSun: { value: new THREE.Vector2() }, uAspect: { value: 1 } });
    this.blurMat = pass(RAYS_BLUR_FRAG, { tSrc: { value: null }, uSun: { value: new THREE.Vector2() }, uStep: { value: 1 } });
    this.final = pass(FINAL_FRAG, {
      tScene: { value: this.sceneRT.texture }, tBloom: { value: this.black }, tRays: { value: this.black },
      uExposure: { value: 1 }, uBloom: { value: 0.06 }, uRays: { value: 0.35 }, uTime: { value: 0 },
      uVignette: { value: 0.55 }, uGrade: { value: new THREE.Vector3(1, 1, 1) }, uSat: { value: 1.16 }, uContrast: { value: 1.1 },
      uTint: { value: new THREE.Vector3(1, 1, 1) }, uFlash: { value: 0 }, uFlashC: { value: new THREE.Color(1, 1, 1) },
      uNoise: { value: 0.012 }, uHasRays: { value: 0 },
    });
    this.u = this.final.uniforms;
  }

  setSize(w, h) {
    this.w = w;
    this.h = h;
    this.sceneRT.setSize(w, h);
    let bw = Math.max(1, w >> 1), bh = Math.max(1, h >> 1);
    for (let i = 0; i < 5; i++) {
      this.bloomLevels[i].setSize(bw, bh);
      this.upLevels[i].setSize(bw, bh);
      bw = Math.max(1, bw >> 1);
      bh = Math.max(1, bh >> 1);
    }
    this.raysA.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    this.raysB.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
  }

  _draw(mat, target) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.scene, this.cam);
  }

  /** sun: screen-space uv of the sun and its visibility (0..1) */
  render(scene, camera, time, sun) {
    const r = this.r;
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);
    let bloomTex = this.black;
    if (this.q.bloom && this.hdr) {
      let src = this.sceneRT.texture;
      for (let i = 0; i < 5; i++) {
        const dst = this.bloomLevels[i];
        this.downMat.uniforms.tSrc.value = src;
        this.downMat.uniforms.uTexel.value.set(1 / (i === 0 ? this.w : this.bloomLevels[i - 1].width), 1 / (i === 0 ? this.h : this.bloomLevels[i - 1].height));
        this.downMat.uniforms.uFirst.value = i === 0 ? 1 : 0;
        this._draw(this.downMat, dst);
        src = dst.texture;
      }
      let prev = this.black;
      for (let i = 4; i >= 0; i--) {
        const srcRT = this.bloomLevels[i];
        this.upMat.uniforms.tSrc.value = srcRT.texture;
        this.upMat.uniforms.tPrev.value = prev;
        this.upMat.uniforms.uTexel.value.set(1 / srcRT.width, 1 / srcRT.height);
        this._draw(this.upMat, this.upLevels[i]);
        prev = this.upLevels[i].texture;
      }
      bloomTex = this.upLevels[0].texture;
    }
    this.u.tBloom.value = bloomTex;
    this.u.uHasRays.value = 0;
    if (this.q.godrays && sun && sun.vis > 0.01 && this.sceneRT.depthTexture) {
      this.maskMat.uniforms.tColor.value = this.sceneRT.texture;
      this.maskMat.uniforms.tDepth.value = this.sceneRT.depthTexture;
      this.maskMat.uniforms.uSun.value.copy(sun.uv);
      this.maskMat.uniforms.uAspect.value = this.w / this.h;
      this._draw(this.maskMat, this.raysA);
      this.blurMat.uniforms.tSrc.value = this.raysA.texture;
      this.blurMat.uniforms.uSun.value.copy(sun.uv);
      this.blurMat.uniforms.uStep.value = 0.9;
      this._draw(this.blurMat, this.raysB);
      this.blurMat.uniforms.tSrc.value = this.raysB.texture;
      this.blurMat.uniforms.uStep.value = 0.35;
      this._draw(this.blurMat, this.raysA);
      this.u.tRays.value = this.raysA.texture;
      this.u.uHasRays.value = 1;
      this.u.uRays.value = 0.55 * sun.vis;
    }
    this.u.uTime.value = time;
    this._draw(this.final, null);
  }
}
