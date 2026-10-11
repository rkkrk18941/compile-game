/* COMPILE — Cinematic VFX 15 (WebGL)
 * Presentation only. Nothing here writes to G, DB, draft, CPU or any rules function: the layer
 * listens to the existing presentation hooks (beamFX, fxBurst, flyCard, announce …) and to the
 * rendered DOM, and draws on its own canvas. When WebGL is unavailable, effects are off, motion is
 * reduced or the tab is hidden, every hook falls through to the previous (2D cinematic) version.
 *
 *  ├ renderer   HDR scene buffer → bloom (dual filter) → tonemap/CA/vignette → premultiplied canvas
 *  ├ sim        particles (instanced), ribbons, analytic shapes, card shatter fragments
 *  ├ camera     trauma shake, zoom punch, hit-stop (DOM transforms)
 *  ├ audio      synthesized layered SFX with reverb (no files)
 *  └ director   per-protocol attacks, impacts, play/move/flip/draw, compile and victory sequences
 */
'use strict';
(() => {
const BUILD = '15.0.0';
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, t) => { t = sat((t - a) / (b - a)); return t * t * (3 - 2 * t); };
const E = {
  outCubic: t => 1 - Math.pow(1 - t, 3),
  outQuint: t => 1 - Math.pow(1 - t, 5),
  outExpo: t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t),
  inCubic: t => t * t * t,
  inQuad: t => t * t,
  inOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  outBack: t => { const c = 1.9, d = c + 1; return 1 + d * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
};
const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const rv = v => Array.isArray(v) ? v[0] + Math.random() * (v[1] - v[0]) : v;
const pick = a => a[(Math.random() * a.length) | 0];
const now = () => performance.now();
let warnings = 0;
const warn = e => { if (warnings++ < 10) console.warn('COMPILE VFX:', (e && e.message) || e); };
const safe = (f, fallback) => { try { return f(); } catch (e) { warn(e); return fallback; } };
const q = s => document.querySelector(s);

/* ───────────── colour ───────────── */
function hex(h) {
  const s = String(h || '#ffffff').replace('#', '');
  const n = parseInt((s.length === 3 ? s.split('').map(c => c + c).join('') : s.padEnd(6, 'f')).slice(0, 6), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const mulc = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const luma = c => c[0] * .3 + c[1] * .59 + c[2] * .11;
function vivid(c, k = 1.35) { const l = luma(c); return [sat(l + (c[0] - l) * k), sat(l + (c[1] - l) * k), sat(l + (c[2] - l) * k)]; }
const WHITE = [1, 1, 1], BLACK = [0, 0, 0];

/* ───────────── settings / activation ───────────── */
const reduced = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) { return { matches: false }; } })();
const setting = (k, d) => (typeof SET === 'object' && SET && SET[k] != null) ? SET[k] : d;
const fxLevel = () => Number(setting('fx', 1)) || 0;
const speed = () => clamp(fxLevel() || 1, .45, 1.6);
const D = ms => ms * speed();
const shakeOn = () => setting('shake', true) !== false;
let forced = false;
try { forced = /[?&]vfx=force\b/.test(location.search) || localStorage.getItem('compile-vfx-force') === '1'; } catch (e) {}
let disabledByUser = false;
try { disabledByUser = /[?&]vfx=off\b/.test(location.search) || localStorage.getItem('compile-vfx-off') === '1'; } catch (e) {}
const wanted = () => fxLevel() > 0 && !reduced.matches && !document.hidden && !disabledByUser && setting('cinemaQuality', 'cinema') !== 'classic';
const active = () => wanted() && R.ok;

/* Quality tiers. Phones start at "medium"; frame-time adaptation only ever steps down. */
const TIERS = [
  { name: 'low', scale: .5, maxPx: 520e3, parts: 900, bloom: 3, ca: false, fps: 30, density: .45 },
  { name: 'medium', scale: .66, maxPx: 1.05e6, parts: 1800, bloom: 4, ca: true, fps: 60, density: .72 },
  { name: 'high', scale: .82, maxPx: 2.1e6, parts: 3200, bloom: 5, ca: true, fps: 60, density: 1 },
  { name: 'ultra', scale: 1, maxPx: 3.4e6, parts: 4800, bloom: 5, ca: true, fps: 60, density: 1.15 },
];
function autoTier() {
  if (setting('cinemaQuality', 'cinema') === 'light') return 0;
  let coarse = false; try { coarse = matchMedia('(pointer: coarse)').matches; } catch (e) {}
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
  const small = Math.min(screen.width || 800, screen.height || 800) < 640;
  if (coarse || small) return cores >= 6 && mem >= 4 ? 2 : 1;
  return cores >= 8 && mem >= 8 ? 3 : 2;
}
let tierIndex = autoTier(), tierCap = 3;
const Q = () => TIERS[Math.min(tierIndex, tierCap)];

/* ═════════════════════════ RENDERER ═════════════════════════ */
const R = { ok: false, tried: false, gl: null, v2: false, canvas: null, inst: null, hdr: false, enc: 1, encB: 1,
  w: 0, h: 0, cssW: 0, cssH: 0, prog: {}, tex: {}, rt: null, bloomLv: [], lost: false };
const GLSL_HEAD = 'precision mediump float;\nfloat sq(float x){return x*x;}\nfloat ss(float a,float b,float x){float d=b-a;d=abs(d)<1e-5?1e-5:d;float t=clamp((x-a)/d,0.0,1.0);return t*t*(3.0-2.0*t);}\n';
const VS_CLIP = 'vec4 clip(vec2 p){return vec4(p.x/uRes.x*2.0-1.0,1.0-p.y/uRes.y*2.0,0.0,1.0);}\n';

const SRC = {
  partV: `attribute vec2 aCorner;attribute vec4 iA;attribute vec4 iB;attribute vec4 iC;
uniform vec2 uRes;varying vec2 vUV;varying vec4 vCol;${VS_CLIP}
void main(){float c=cos(iB.x),s=sin(iB.x);vec2 q=vec2(aCorner.x*iA.z,aCorner.y*iA.w);
vec2 p=iA.xy+vec2(q.x*c-q.y*s,q.x*s+q.y*c);float t=iB.y;float tx=mod(t,4.0),ty=floor(t/4.0+0.001);
vUV=(vec2(tx,ty)+(aCorner*0.5+0.5)*0.94+0.03)*0.25;vCol=iC;gl_Position=clip(p);}`,
  partF: `${GLSL_HEAD}uniform sampler2D uAtlas;varying vec2 vUV;varying vec4 vCol;
void main(){vec4 t=texture2D(uAtlas,vUV);float m=t.a;gl_FragColor=vec4(vCol.rgb*t.rgb*m,vCol.a*m);}`,

  ribV: `attribute vec2 aPos;attribute vec2 aUV;attribute vec4 aCol;attribute vec4 aSty;
uniform vec2 uRes;varying vec2 vUV;varying vec4 vCol;varying vec4 vSty;${VS_CLIP}
void main(){vUV=aUV;vCol=aCol;vSty=aSty;gl_Position=clip(aPos);}`,
  ribF: `${GLSL_HEAD}uniform sampler2D uNoise;uniform float uTime;varying vec2 vUV;varying vec4 vCol;varying vec4 vSty;
void main(){float ac=1.0-abs(vUV.y*2.0-1.0);
float n=texture2D(uNoise,vec2(vUV.x*vSty.w-uTime*vSty.y,vUV.y*0.32+vUV.x*0.05)).r;
float n2=texture2D(uNoise,vec2(vUV.x*vSty.w*0.47+uTime*vSty.y*0.37,vUV.y*0.55+0.41)).g;
float flow=mix(1.0,clamp(n*1.25+n2*0.75-0.35,0.0,1.6),vSty.x);
float body=ss(0.0,1.0,ac)*flow;body*=ss(0.0,0.45,ac-(1.0-n)*0.42*vSty.x);
float core=pow(ac,6.0)*vSty.z;
vec3 col=vCol.rgb*body+vec3(max(vCol.r,max(vCol.g,vCol.b)))*core*flow;
gl_FragColor=vec4(col,vCol.a*body);}`,

  shapeV: `attribute vec2 aCorner;uniform vec2 uRes;uniform vec2 uC;uniform vec2 uH;uniform float uRot;varying vec2 vP;${VS_CLIP}
void main(){vP=aCorner;float c=cos(uRot),s=sin(uRot);vec2 q=aCorner*uH;gl_Position=clip(uC+vec2(q.x*c-q.y*s,q.x*s+q.y*c));}`,
  shapeF: `${GLSL_HEAD}uniform sampler2D uNoise;uniform float uKind;uniform float uTime;uniform vec4 uCol;uniform vec4 uP;uniform vec4 uQ;varying vec2 vP;
float N(vec2 p){return texture2D(uNoise,p).r;}
float seg(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0);return length(pa-ba*h);}
vec2 rot(vec2 p,float a){float c=cos(a),s=sin(a);return vec2(p.x*c-p.y*s,p.x*s+p.y*c);}
float tri(float r,float a,float R0,float w){float k=mod(a,2.0943951)-1.0471976;float d=R0*0.5/cos(k);return exp(-sq((r-d)/w));}
void main(){vec2 p=vP;float r=length(p);float a=atan(p.y,p.x);float m=0.0;float d=0.0;vec3 tint=vec3(1.0);int k=int(uKind+0.5);
if(k==0){float n=N(vec2(a*0.6366+uQ.x,r*0.35+uTime*0.07));float rr=r+(n-0.5)*uP.z;
 float b=exp(-sq((rr-uP.x)/max(uP.y,0.002)));float inner=uP.w*exp(-sq((uP.x-rr)/max(uP.y*5.0,0.01)))*step(rr,uP.x);
 m=b*(0.65+0.7*n)+inner;d=m;}
else if(k==1){m=exp(-r*r*uP.x)+uP.y*exp(-r*r*uP.x*9.0);m*=ss(1.0,0.82,r);d=m;}
else if(k==2){float w=0.011*uP.w;float rev=step(fract((a+3.14159)/6.28318-uQ.x+1.0),uP.y);
 float ro=uP.x;float a1=a+ro;float a2=a-ro*1.35;
 float rings=exp(-sq((r-0.95)/w))+exp(-sq((r-0.86)/w))*0.8+exp(-sq((r-0.61)/w))*0.9+exp(-sq((r-0.565)/(w*0.8)))*0.6+exp(-sq((r-0.2)/w))*0.7;
 float s=floor(mod((a1+3.14159)/6.28318*44.0,44.0));float g=fract(sin(s*91.37+uP.z)*437.58);
 float slot=fract((a1+3.14159)/6.28318*44.0);float band=ss(0.86,0.88,r)*ss(0.95,0.93,r);
 float rune=band*step(0.3,g)*ss(0.08,0.2,slot)*ss(0.92,0.8,slot)*(0.35+0.65*step(0.5,fract(r*40.0+g*3.0)));
 float hexg=tri(r,a2,0.6,w*1.2)+tri(r,a2+1.0471976,0.6,w*1.2);hexg*=step(r,0.6);
 float ticks=ss(0.62,0.64,r)*ss(0.84,0.82,r)*step(0.92,fract((a2+3.14159)/6.28318*24.0))*0.7;
 m=(rings+rune*0.85+ticks)*rev+hexg*ss(0.0,0.6,uP.y)+exp(-r*r*30.0)*0.35;m*=(0.8+0.4*uQ.y);d=m;}
else if(k==3){float x=p.x;float n=N(vec2(x*0.35+uQ.x,p.y*0.45+uTime*uP.y));float n2=N(vec2(x*0.8-uQ.x,p.y*1.3+uTime*uP.y*1.7)+0.37);
 float body=exp(-x*x*uP.x)*mix(1.0,0.3+n*0.75+n2*0.4,uP.z);float core=exp(-x*x*uP.x*7.0)*0.75;
 float f=ss(-1.0,-1.0+uP.w,p.y)*ss(1.0,1.0-uP.w*0.35,p.y);m=(body+core)*f;d=m;}
else if(k==4){m=exp(-p.y*p.y*uP.x)*pow(max(1.0-abs(p.x),0.0),uP.y)+exp(-r*r*uP.z)*0.7;d=m;}
else if(k==5){vec2 rp=rot(p,uP.z);float ra=atan(rp.y,rp.x);float n=N(vec2(ra*0.159*uP.x*0.0625+0.5,0.5+uQ.x));float n2=N(vec2(ra*0.159*uP.x*0.125+uTime*0.01,0.71));
 float rays=pow(clamp(n*0.75+n2*0.6,0.0,1.0),uP.y);m=rays*ss(uP.w,uP.w+0.12,r)*pow(max(1.0-r,0.0),1.4)*1.6+exp(-r*r*12.0)*0.5;d=m*0.6;}
else if(k==6){vec2 h=abs(rot(p,uP.z));float hx=max(h.x*0.5+h.y*0.8660254,h.x);m=exp(-sq((hx-uP.x)/max(uP.y,0.002)))+uP.w*ss(uP.x,0.0,hx)*0.35;d=m;}
else if(k==7){float u=p.x*0.5+0.5;float vis=ss(uQ.z,uQ.z+0.04,u)*ss(uQ.y,uQ.y-0.04,u);
 float n=N(vec2(u*uQ.w-uTime*uP.x,p.y*0.35+uQ.x));float n2=N(vec2(u*uQ.w*0.5+uTime*uP.x*0.6,p.y*0.6+0.63));
 float body=exp(-p.y*p.y*2.2)*mix(1.0,0.4+n*0.9+n2*0.4,uP.y);float core=exp(-p.y*p.y*uP.z)*1.4;float taper=pow(max(sin(u*3.14159),0.0),uP.w);
 m=(body+core)*vis*mix(1.0,taper,0.65);d=m;}
else if(k==8){float n=N(vec2(a*0.477+uTime*0.06,r*0.5+uQ.x));float rr=r+(n-0.5)*uP.w;
 d=ss(uP.x,uP.x*0.45,rr)*uP.z;m=exp(-sq((rr-uP.x)/max(uP.y,0.002)))*(0.6+0.8*n);}
else if(k==9){float w=0.016;float ring=exp(-sq((r-0.9)/w))+exp(-sq((r-0.8)/(w*0.7)))*0.5;
 float tk=ss(0.8,0.82,r)*ss(0.9,0.88,r)*step(0.9,fract((a+3.14159)/6.28318*12.0+0.05));
 vec2 h1=vec2(cos(uP.x),sin(uP.x));vec2 h2=vec2(cos(uP.y),sin(uP.y));
 float hands=exp(-sq(seg(p,vec2(0.0),h1*0.68)/0.022))+exp(-sq(seg(p,vec2(0.0),h2*0.46)/0.03));
 float rev=step(fract((a+3.14159)/6.28318+0.75),uP.z);m=(ring*rev+tk*rev*1.2+hands+exp(-r*r*90.0))*1.0;d=m;}
else if(k==10){float s=sin(a*uP.x+log(r+0.02)*uP.y-uP.z);float bands=pow(0.5+0.5*s,3.0);
 m=bands*ss(uP.w,uP.w+0.2,r)*ss(1.0,0.45,r)*1.3+exp(-sq((r-uP.w)/0.05))*0.8;d=ss(uP.w*1.3,uP.w*0.5,r)*uCol.a;}
else if(k==11){vec2 rp=rot(p,uP.w);float ax=abs(rp.x),ay=abs(rp.y);
 m=exp(-ay*uP.x)*pow(max(1.0-ax,0.0),uP.y)+exp(-ax*uP.x)*pow(max(1.0-ay,0.0),uP.y);vec2 dp=rot(rp,0.785398);
 m+=0.35*(exp(-abs(dp.y)*uP.x*1.6)*pow(max(1.0-abs(dp.x)*1.6,0.0),uP.y)+exp(-abs(dp.x)*uP.x*1.6)*pow(max(1.0-abs(dp.y)*1.6,0.0),uP.y));
 m+=exp(-r*r*uP.z)*1.4;d=m;}
else if(k==12){vec2 rp=rot(p,-uQ.y);float ra=atan(rp.y,rp.x);if(ra<0.0)ra+=6.28318;float f=ra/max(uQ.z,0.01);
 float vis=step(0.0,f)*step(f,uP.z)*step(f,1.0);float rel=f/max(uP.z,0.001);
 float th=uP.y*pow(max(sin(clamp(f,0.0,1.0)*3.14159),0.0),0.6);float band=exp(-sq((r-uP.x)/max(th,0.002)));
 m=band*vis*(0.2+1.15*rel*rel)+exp(-sq((r-uP.x)/max(th*3.5,0.002)))*vis*0.22*rel;d=m;}
else if(k==13){float env=exp(-r*uP.z)*ss(uP.w,uP.w-0.15,r);m=pow(0.5+0.5*sin(r*uP.x-uTime*uP.y),5.0)*env*1.4;d=m;}
else if(k==14){vec2 rp=rot(p,uP.z);float ra=atan(rp.y,rp.x);float n=N(vec2(ra*0.159*uP.x*0.0625+0.5,0.5+uQ.x));
 float rays=pow(clamp(n*1.1,0.0,1.0),uP.y)*ss(uP.w,uP.w+0.1,r)*pow(max(1.0-r,0.0),1.2)*1.8;
 float h=fract(ra*0.159*1.0+uQ.y);tint=clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0)*1.3+0.15;m=rays+exp(-r*r*14.0)*0.6;d=m*0.5;}
else if(k==15){vec2 g=p*uP.x;vec2 hq=vec2(g.x*1.1547,g.y+g.x*0.57735);vec2 cell=floor(hq);vec2 f=fract(hq);
 float e=min(min(f.x,f.y),min(1.0-f.x,1.0-f.y));float edge=exp(-sq(e/0.06));float ring=ss(uP.y,uP.y-0.25,r)*ss(uP.y-0.5,uP.y-0.25,r);
 m=edge*ring*1.2;d=m;}
m=max(m,0.0);gl_FragColor=vec4(uCol.rgb*tint*m,(k==8||k==10)?d:uCol.a*d);}`,

  fragV: `attribute vec2 aPos;attribute vec2 aUV;attribute vec4 aD;uniform vec2 uRes;varying vec2 vUV;varying vec4 vD;${VS_CLIP}
void main(){vUV=aUV;vD=aD;gl_Position=clip(aPos);}`,
  fragF: `${GLSL_HEAD}uniform sampler2D uTex;uniform sampler2D uNoise;uniform vec3 uEdge;uniform float uEnc;varying vec2 vUV;varying vec4 vD;
void main(){vec4 c=texture2D(uTex,vUV);float n=texture2D(uNoise,vUV*vec2(0.9,1.25)+vD.w).r*0.8+texture2D(uNoise,vUV*3.1+vD.w*1.7).g*0.2;
float p=vD.x;if(n<p)discard;float e=1.0-ss(p,p+0.1,n);float ember=1.0-ss(p,p+0.03,n);
vec3 col=c.rgb*vD.y;vec3 glow=uEdge*(e*vD.z+ember*vD.z*1.6)*c.a;float a=c.a*(1.0-ember*0.5);
gl_FragColor=vec4((col*(1.0-ember*0.5)+glow)*uEnc,a);}`,

  fullV: `attribute vec2 aPos;varying vec2 vUV;void main(){vUV=aPos*0.5+0.5;gl_Position=vec4(aPos,0.0,1.0);}`,
  preF: `${GLSL_HEAD}uniform sampler2D uSrc;uniform vec2 uTexel;uniform float uDec;uniform float uEncB;uniform float uThr;uniform float uKnee;varying vec2 vUV;
void main(){vec2 o=uTexel*0.5;vec3 c=(texture2D(uSrc,vUV+vec2(-o.x,-o.y)).rgb+texture2D(uSrc,vUV+vec2(o.x,-o.y)).rgb+texture2D(uSrc,vUV+vec2(-o.x,o.y)).rgb+texture2D(uSrc,vUV+vec2(o.x,o.y)).rgb)*0.25*uDec;
c=min(c,vec3(3.5));float br=max(c.r,max(c.g,c.b));float soft=clamp(br-uThr+uKnee,0.0,2.0*uKnee);soft=soft*soft/(4.0*uKnee+0.0001);
float w=max(soft,br-uThr)/max(br,0.0001);gl_FragColor=vec4(c*w*uEncB,1.0);}`,
  downF: `${GLSL_HEAD}uniform sampler2D uSrc;uniform vec2 uTexel;varying vec2 vUV;
void main(){vec2 h=uTexel;vec4 s=texture2D(uSrc,vUV)*4.0;s+=texture2D(uSrc,vUV-h);s+=texture2D(uSrc,vUV+h);s+=texture2D(uSrc,vUV+vec2(h.x,-h.y));s+=texture2D(uSrc,vUV-vec2(h.x,-h.y));gl_FragColor=s*0.125;}`,
  upF: `${GLSL_HEAD}uniform sampler2D uSrc;uniform vec2 uTexel;uniform float uGain;varying vec2 vUV;
void main(){vec2 h=uTexel;vec4 s=texture2D(uSrc,vUV+vec2(-h.x*2.0,0.0));s+=texture2D(uSrc,vUV+vec2(-h.x,h.y))*2.0;s+=texture2D(uSrc,vUV+vec2(0.0,h.y*2.0));
s+=texture2D(uSrc,vUV+vec2(h.x,h.y))*2.0;s+=texture2D(uSrc,vUV+vec2(h.x*2.0,0.0));s+=texture2D(uSrc,vUV+vec2(h.x,-h.y))*2.0;s+=texture2D(uSrc,vUV+vec2(0.0,-h.y*2.0));s+=texture2D(uSrc,vUV+vec2(-h.x,-h.y))*2.0;
gl_FragColor=s*(uGain/12.0);}`,
  compF: `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uScene;uniform sampler2D uBloom;uniform vec2 uRes;uniform float uDec;uniform float uDecB;uniform float uBloomAmt;uniform float uCA;
uniform float uVig;uniform float uTime;uniform float uExpo;uniform vec4 uFlash;uniform vec4 uSpot;varying vec2 vUV;
float ss(float a,float b,float x){float d=b-a;d=abs(d)<1e-5?1e-5:d;float t=clamp((x-a)/d,0.0,1.0);return t*t*(3.0-2.0*t);}
float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
vec3 tonemap(vec3 c){c=max(c,vec3(0.0));float m=max(c.r,max(c.g,c.b));if(m<=0.7)return c;vec3 x=max(c-0.7,0.0);vec3 pc=min(c,vec3(0.7))+0.3*(1.0-exp(-x*2.6));float mt=0.7+0.3*(1.0-exp(-(m-0.7)*2.6));vec3 hp=c*(mt/m);hp=mix(hp,vec3(mt),ss(1.6,7.0,m)*0.8);return mix(pc,hp,0.6);}
void main(){vec2 uv=vUV;vec4 s=texture2D(uScene,uv);vec3 col=s.rgb;
if(uCA>0.00005){vec2 dd=(uv-0.5)*uCA;col.r=texture2D(uScene,uv+dd).r;col.b=texture2D(uScene,uv-dd).b;}
col=col*uDec*uExpo+texture2D(uBloom,uv).rgb*uDecB*uBloomAmt+uFlash.rgb*uFlash.a;col=tonemap(col);
vec2 asp=vec2(uRes.x/uRes.y,1.0);float vig=ss(0.32,1.05,length((uv-0.5)*asp*1.25))*uVig;
float spot=0.0;if(uSpot.w>0.0){spot=ss(uSpot.z,uSpot.z*2.6,length((uv-uSpot.xy)*asp))*uSpot.w;}
float shade=clamp(max(vig,spot),0.0,0.92);float a=1.0-(1.0-clamp(s.a,0.0,1.0))*(1.0-shade);
float mx=max(col.r,max(col.g,col.b));a=max(a,mx*0.38);col+=(hash(uv*uRes+fract(uTime))-0.5)*(1.5/255.0);col=clamp(col,0.0,1.0);
gl_FragColor=vec4(col,a);}`,
};

function compile(gl, type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) { const log = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error('shader: ' + log); }
  return s;
}
function program(gl, vs, fs, attribs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  attribs.forEach((name, i) => gl.bindAttribLocation(p, i, name));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('link: ' + gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) || 0;
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); if (info) u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
  return { p, u, attribs: attribs.length };
}
function makeTex(gl, w, h, fmt, filter, wrap, data = null) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter === gl.LINEAR_MIPMAP_LINEAR ? gl.LINEAR : filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internal, w, h, 0, fmt.format, fmt.type, data);
  return t;
}
function makeRT(gl, w, h) {
  const tex = makeTex(gl, w, h, R.fmt, gl.LINEAR, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fbo, w, h };
}
function freeRT(rt) { if (!rt || !R.gl) return; R.gl.deleteTexture(rt.tex); R.gl.deleteFramebuffer(rt.fbo); }
function testRT(gl, fmt) {
  try {
    const t = makeTex(gl, 4, 4, fmt, gl.LINEAR, gl.CLAMP_TO_EDGE), f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE && !gl.getError();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(f); gl.deleteTexture(t); return ok;
  } catch (e) { return false; }
}

function glInit() {
  if (R.tried) return R.ok;
  R.tried = true;
  if (disabledByUser) return false;
  const canvas = document.createElement('canvas');
  canvas.id = 'vfxGL'; canvas.setAttribute('aria-hidden', 'true');
  const attrs = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
    preserveDrawingBuffer: false, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: !forced };
  let gl = null, v2 = false;
  try { gl = canvas.getContext('webgl2', attrs); v2 = !!gl; } catch (e) { gl = null; }
  if (!gl) try { gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs); } catch (e) { gl = null; }
  if (!gl || typeof gl.createShader !== 'function') return false;
  try {
    let inst;
    if (v2) inst = { draw: (m, f, c, n) => gl.drawArraysInstanced(m, f, c, n), div: (i, d) => gl.vertexAttribDivisor(i, d) };
    else {
      const x = gl.getExtension('ANGLE_instanced_arrays'); if (!x) return false;
      inst = { draw: (m, f, c, n) => x.drawArraysInstancedANGLE(m, f, c, n), div: (i, d) => x.vertexAttribDivisorANGLE(i, d) };
    }
    let fmt = null;
    if (v2) { if (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float')) fmt = { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT }; }
    else {
      const hf = gl.getExtension('OES_texture_half_float'), cb = gl.getExtension('EXT_color_buffer_half_float'), lin = gl.getExtension('OES_texture_half_float_linear');
      if (hf && cb && lin) fmt = { internal: gl.RGBA, format: gl.RGBA, type: hf.HALF_FLOAT_OES };
    }
    if (fmt && !testRT(gl, fmt)) fmt = null;
    Object.assign(R, { gl, v2, canvas, inst, hdr: !!fmt, fmt: fmt || { internal: gl.RGBA, format: gl.RGBA, type: gl.UNSIGNED_BYTE } });
    R.enc = R.hdr ? 1 : .5; R.encB = R.hdr ? 1 : .25;
    buildGL();
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); R.ok = false; R.lost = true; stopAll(); }, false);
    canvas.addEventListener('webglcontextrestored', () => { safe(() => { R.lost = false; buildGL(); R.w = R.h = 0; R.ok = true; }); }, false);
    document.body.append(canvas);
    R.ok = true;
  } catch (e) { warn(e); R.ok = false; try { canvas.remove(); } catch (x) {} }
  return R.ok;
}
function buildGL() {
  const gl = R.gl;
  R.prog = {
    part: program(gl, SRC.partV, SRC.partF, ['aCorner', 'iA', 'iB', 'iC']),
    rib: program(gl, SRC.ribV, SRC.ribF, ['aPos', 'aUV', 'aCol', 'aSty']),
    shape: program(gl, SRC.shapeV, SRC.shapeF, ['aCorner']),
    frag: program(gl, SRC.fragV, SRC.fragF, ['aPos', 'aUV', 'aD']),
    pre: program(gl, SRC.fullV, SRC.preF, ['aPos']),
    down: program(gl, SRC.fullV, SRC.downF, ['aPos']),
    up: program(gl, SRC.fullV, SRC.upF, ['aPos']),
    comp: program(gl, SRC.fullV, SRC.compF, ['aPos']),
  };
  R.quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, R.quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  R.full = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, R.full); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  R.instBuf = gl.createBuffer(); R.ribBuf = gl.createBuffer(); R.fragBuf = gl.createBuffer();
  R.instData = new Float32Array(TIERS[3].parts * 12);
  R.ribData = new Float32Array(36000 * 12);
  R.fragData = new Float32Array(16000 * 8);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  const rgba8 = { internal: gl.RGBA, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
  const atlas = buildAtlas();
  R.tex.atlas = makeTex(gl, 512, 512, rgba8, gl.LINEAR_MIPMAP_LINEAR, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas); gl.generateMipmap(gl.TEXTURE_2D);
  R.tex.noise = makeTex(gl, 256, 256, rgba8, gl.LINEAR_MIPMAP_LINEAR, gl.REPEAT, buildNoise(256));
  gl.generateMipmap(gl.TEXTURE_2D);
  R.attribsOn = new Set();
  for (const s of SHATTERS) s.tex = null;
}
/* enable exactly the attribute slots a program needs; reset instancing divisors */
function layout(list) {
  const gl = R.gl, want = new Set();
  for (const [loc, size, stride, offset, div, buf] of list) {
    if (buf) gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    want.add(loc); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset); R.inst.div(loc, div || 0);
  }
  for (const loc of R.attribsOn) if (!want.has(loc)) { gl.disableVertexAttribArray(loc); R.inst.div(loc, 0); }
  R.attribsOn = want;
}

function resize() {
  const gl = R.gl, cssW = Math.max(1, innerWidth), cssH = Math.max(1, innerHeight), tier = Q();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  let w = cssW * dpr * tier.scale, h = cssH * dpr * tier.scale;
  const px = w * h; if (px > tier.maxPx) { const k = Math.sqrt(tier.maxPx / px); w *= k; h *= k; }
  w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
  if (w === R.w && h === R.h && R.bloomN === tier.bloom && R.cssW === cssW && R.cssH === cssH) return;
  R.w = w; R.h = h; R.cssW = cssW; R.cssH = cssH; R.bloomN = tier.bloom;
  R.canvas.width = w; R.canvas.height = h;
  freeRT(R.rt); R.bloomLv.forEach(freeRT); R.bloomLv = [];
  R.rt = makeRT(gl, w, h);
  let bw = Math.max(2, w >> 1), bh = Math.max(2, h >> 1);
  for (let i = 0; i < tier.bloom; i++) { R.bloomLv.push(makeRT(gl, bw, bh)); bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1); }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

/* ───────── procedural textures ───────── */
function buildNoise(N) {
  const out = new Uint8Array(N * N * 4);
  const layer = (seed, octaves) => {
    const f = new Float32Array(N * N);
    let amp = 1, total = 0;
    for (let o = 0; o < octaves; o++) {
      const cells = 4 << o, g = new Float32Array(cells * cells);
      let s = (seed * 9301 + o * 49297 + 233280) >>> 0;
      for (let i = 0; i < g.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; g[i] = s / 4294967296; }
      for (let y = 0; y < N; y++) {
        const gy = y / N * cells, y0 = Math.floor(gy), ty = gy - y0, sy = ty * ty * (3 - 2 * ty), ya = y0 % cells, yb = (y0 + 1) % cells;
        for (let x = 0; x < N; x++) {
          const gx = x / N * cells, x0 = Math.floor(gx), tx = gx - x0, sx = tx * tx * (3 - 2 * tx), xa = x0 % cells, xb = (x0 + 1) % cells;
          const v = lerp(lerp(g[ya * cells + xa], g[ya * cells + xb], sx), lerp(g[yb * cells + xa], g[yb * cells + xb], sx), sy);
          f[y * N + x] += v * amp;
        }
      }
      total += amp; amp *= .5;
    }
    let mn = 1e9, mx = -1e9; for (let i = 0; i < f.length; i++) { f[i] /= total; mn = Math.min(mn, f[i]); mx = Math.max(mx, f[i]); }
    for (let i = 0; i < f.length; i++) f[i] = (f[i] - mn) / (mx - mn || 1);
    return f;
  };
  const a = layer(7, 5), b = layer(19, 4), c = layer(41, 6);
  for (let i = 0; i < N * N; i++) { out[i * 4] = a[i] * 255; out[i * 4 + 1] = b[i] * 255; out[i * 4 + 2] = c[i] * 255; out[i * 4 + 3] = 255; }
  return out;
}
/* 4×4 atlas of 128px sprites; rgb = detail luminance, a = mask */
const TILE = { glow: 0, core: 1, streak: 2, smoke: 3, ring: 4, star: 5, shard: 6, hex: 7, leaf: 8, drop: 9, bubble: 10, bit: 11, runeA: 12, runeB: 13, ember: 14, flake: 15 };
function buildAtlas() {
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = 512;
  const c = cv.getContext('2d'), img = c.createImageData(512, 512), px = img.data;
  const nz = buildNoise(64);
  const noise = (x, y) => nz[(((y & 63) * 64) + (x & 63)) * 4] / 255;
  const fieldTile = (index, fn) => {
    const ox = (index % 4) * S, oy = Math.floor(index / 4) * S;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = (x + .5) / S * 2 - 1, v = (y + .5) / S * 2 - 1;
      const [l, a] = fn(u, v, x, y), o = ((oy + y) * 512 + ox + x) * 4;
      px[o] = px[o + 1] = px[o + 2] = sat(l) * 255; px[o + 3] = sat(a) * 255;
    }
  };
  fieldTile(TILE.glow, (u, v) => { const r2 = u * u + v * v; return [1, Math.exp(-r2 * 4.6) * (1 - smooth(.86, 1, Math.sqrt(r2)))]; });
  fieldTile(TILE.core, (u, v) => { const r2 = u * u + v * v; return [1, Math.min(1, Math.exp(-r2 * 16) + .4 * Math.exp(-r2 * 3.2)) * (1 - smooth(.86, 1, Math.sqrt(r2)))]; });
  fieldTile(TILE.streak, (u, v) => [1, Math.exp(-v * v * 46) * Math.pow(Math.max(0, 1 - u * u), 1.6) * (1 - smooth(.9, 1, Math.abs(u)))]);
  fieldTile(TILE.smoke, (u, v, x, y) => {
    const r = Math.hypot(u, v), n = noise(x >> 1, y >> 1) * .65 + noise(x, y) * .35;
    const a = (1 - smooth(.25, 1, r + (n - .5) * .75)) * (.45 + .55 * n);
    return [.62 + .38 * n, a];
  });
  fieldTile(TILE.ring, (u, v) => { const r = Math.hypot(u, v); return [1, Math.exp(-Math.pow((r - .78) / .06, 2)) + .18 * Math.exp(-Math.pow((r - .78) / .22, 2))]; });
  fieldTile(TILE.star, (u, v) => {
    const ax = Math.abs(u), ay = Math.abs(v), r2 = u * u + v * v;
    const arms = Math.exp(-ay * 26) * Math.pow(Math.max(0, 1 - ax), 2) + Math.exp(-ax * 26) * Math.pow(Math.max(0, 1 - ay), 2);
    return [1, Math.min(1, arms + Math.exp(-r2 * 22) + .25 * Math.exp(-r2 * 5))];
  });
  fieldTile(TILE.ember, (u, v, x, y) => {
    const r = Math.hypot(u, v), n = noise(x >> 2, y >> 2);
    return [.8 + .2 * n, (1 - smooth(.35, .75, r + (n - .5) * .5)) * (.6 + .4 * n)];
  });
  fieldTile(TILE.bit, (u, v) => { const d = Math.max(Math.abs(u), Math.abs(v)); return [1, (1 - smooth(.55, .72, d)) + .25 * Math.exp(-(u * u + v * v) * 3)]; });
  fieldTile(TILE.bubble, (u, v) => {
    const r = Math.hypot(u, v);
    return [1, Math.exp(-Math.pow((r - .72) / .07, 2)) * .9 + .12 * (1 - smooth(.6, .75, r)) + Math.exp(-(Math.pow(u + .3, 2) + Math.pow(v + .32, 2)) * 60) * .9];
  });
  c.putImageData(img, 0, 0);
  const at = i => [(i % 4) * S + S / 2, Math.floor(i / 4) * S + S / 2];
  const glowPath = (i, draw, blur = 8) => {
    const [cx, cy] = at(i); c.save(); c.beginPath(); c.rect(cx - S / 2, cy - S / 2, S, S); c.clip();
    c.translate(cx, cy); c.shadowColor = '#fff'; c.shadowBlur = blur; c.fillStyle = '#fff'; c.strokeStyle = '#fff'; draw(c); c.restore();
  };
  glowPath(TILE.shard, g => { g.beginPath(); g.moveTo(-58, 2); g.lineTo(46, -14); g.lineTo(58, -2); g.lineTo(30, 12); g.closePath(); g.fill(); }, 6);
  glowPath(TILE.hex, g => { g.lineWidth = 7; g.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + Math.PI / 6; g.lineTo(Math.cos(a) * 46, Math.sin(a) * 46); } g.closePath(); g.stroke(); }, 10);
  glowPath(TILE.leaf, g => {
    g.rotate(-.5); g.beginPath(); g.moveTo(-54, 0); g.bezierCurveTo(-20, -40, 30, -34, 56, 0); g.bezierCurveTo(30, 34, -20, 40, -54, 0); g.fill();
    g.shadowBlur = 0; g.globalCompositeOperation = 'destination-out'; g.lineWidth = 3; g.beginPath(); g.moveTo(-46, 0); g.quadraticCurveTo(0, -4, 50, 0); g.stroke();
  }, 4);
  glowPath(TILE.drop, g => { g.beginPath(); g.moveTo(0, -56); g.bezierCurveTo(22, -16, 36, 8, 36, 22); g.arc(0, 22, 36, 0, Math.PI); g.bezierCurveTo(-36, 8, -22, -16, 0, -56); g.fill(); }, 5);
  const rune = (g, seed) => {
    g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round'; let s = seed;
    const r = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
    g.beginPath(); g.moveTo(0, -46); g.lineTo(0, 46); g.stroke();
    for (let k = 0; k < 4; k++) { const y = -40 + r() * 80, dir = r() < .5 ? -1 : 1; g.beginPath(); g.moveTo(0, y); g.lineTo(dir * (18 + r() * 22), y + (r() - .5) * 40); g.stroke(); }
    g.beginPath(); g.arc(0, 0, 50, 0, TAU); g.lineWidth = 3; g.stroke();
  };
  glowPath(TILE.runeA, g => rune(g, 7), 9);
  glowPath(TILE.runeB, g => rune(g, 23), 9);
  glowPath(TILE.flake, g => {
    g.lineWidth = 6; g.lineCap = 'round';
    for (let k = 0; k < 6; k++) { g.save(); g.rotate(k / 6 * TAU); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -54); g.moveTo(0, -30); g.lineTo(-14, -42); g.moveTo(0, -30); g.lineTo(14, -42); g.stroke(); g.restore(); }
  }, 8);
  return cv;
}

/* ═════════════════════════ SIMULATION ═════════════════════════ */
/* particles: one interleaved Float32Array, stride 30 */
const F = { x: 0, y: 1, vx: 2, vy: 3, life: 4, max: 5, s0: 6, s1: 7, rot: 8, vr: 9, r0: 10, g0: 11, b0: 12, r1: 13, g1: 14, b1: 15,
  d0: 16, d1: 17, tile: 18, str: 19, drag: 20, grav: 21, turb: 22, fin: 23, fpow: 24, ax: 25, ay: 26, att: 27, asp: 28, seed: 29 };
const PST = 30;
const PS = { d: new Float32Array(TIERS[3].parts * PST), n: 0 };
/* Spawn one particle. Every numeric option accepts a value or a [min,max] range. */
function P(o) {
  if (PS.n >= Q().parts) return -1;
  const i = PS.n++ * PST, d = PS.d;
  let x = o.x, y = o.y;
  if (o.r) { const a = rnd(TAU), rr = Math.sqrt(Math.random()); const rx = Array.isArray(o.r) ? o.r[0] : o.r, ry = Array.isArray(o.r) ? o.r[1] : o.r; x += Math.cos(a) * rx * rr; y += Math.sin(a) * ry * rr; }
  if (o.box) { x += rnd(-o.box[0], o.box[0]); y += rnd(-o.box[1], o.box[1]); }
  let ang = o.ang !== undefined ? rv(o.ang) : rnd(TAU);
  if (o.radial) ang = Math.atan2(y - o.y, x - o.x) + (o.radial === true ? 0 : rv(o.radial));
  const sp = rv(o.speed || 0);
  const col = o.cols ? pick(o.cols) : (o.col || WHITE), col1 = o.col1 || col;
  let i0 = rv(o.i ?? 1), i1 = o.i1 !== undefined ? rv(o.i1) : i0;
  const s0 = rv(o.size ?? 4);
  const tile = Array.isArray(o.tile) ? pick(o.tile) : (o.tile ?? TILE.glow);
  /* big soft sprites stack into white quickly: keep their light proportional to their size */
  if (!o.bright && s0 > 6 && (tile === TILE.glow || tile === TILE.smoke || tile === TILE.core)) { const cap = clamp(16 / s0, .35, 3.5); i0 = Math.min(i0, cap); i1 = Math.min(i1, cap); }
  const vx0 = Math.cos(ang) * sp + (o.vx ? rv(o.vx) : 0), vy0 = Math.sin(ang) * sp + (o.vy ? rv(o.vy) : 0), pre = o.pre ? rv(o.pre) : 0;
  d[i + F.x] = x + vx0 * pre; d[i + F.y] = y + vy0 * pre;
  d[i + F.vx] = vx0; d[i + F.vy] = vy0;
  d[i + F.life] = 0; d[i + F.max] = Math.max(.02, rv(o.life ?? .8));
  d[i + F.s0] = s0; d[i + F.s1] = s0 * rv(o.grow ?? 1);
  d[i + F.rot] = o.rot !== undefined ? rv(o.rot) : (o.alignRot ? ang : rnd(TAU)); d[i + F.vr] = o.spin ? rv(o.spin) : 0;
  d[i + F.r0] = col[0] * i0; d[i + F.g0] = col[1] * i0; d[i + F.b0] = col[2] * i0;
  d[i + F.r1] = col1[0] * i1; d[i + F.g1] = col1[1] * i1; d[i + F.b1] = col1[2] * i1;
  d[i + F.d0] = rv(o.dark ?? 0); d[i + F.d1] = o.dark1 !== undefined ? rv(o.dark1) : d[i + F.d0];
  d[i + F.tile] = tile;
  d[i + F.str] = o.stretch ? rv(o.stretch) : 0; d[i + F.drag] = rv(o.drag ?? 0); d[i + F.grav] = rv(o.grav ?? 0); d[i + F.turb] = rv(o.turb ?? 0);
  d[i + F.fin] = o.fin ?? .06; d[i + F.fpow] = o.fpow ?? 1.6;
  d[i + F.ax] = o.att ? o.att.x : 0; d[i + F.ay] = o.att ? o.att.y : 0; d[i + F.att] = o.att ? rv(o.att.k) : 0;
  d[i + F.asp] = rv(o.asp ?? 1); d[i + F.seed] = rnd(100);
  return i;
}
function B(n, o) { const k = Math.max(1, Math.round(n * Q().density)); for (let j = 0; j < k; j++) P(o); }
function psUpdate(dt, time) {
  const d = PS.d;
  for (let n = 0; n < PS.n; n++) {
    const i = n * PST, life = d[i + F.life] + dt;
    if (life >= d[i + F.max]) { const last = --PS.n * PST; if (last !== i) d.copyWithin(i, last, last + PST); n--; continue; }
    d[i + F.life] = life;
    let vx = d[i + F.vx], vy = d[i + F.vy];
    vy += d[i + F.grav] * dt;
    const tb = d[i + F.turb];
    if (tb) { const sx = d[i + F.x] * .011, sy = d[i + F.y] * .011, s = d[i + F.seed]; vx += Math.sin(sy * 1.7 + time * 1.9 + s) * tb * dt; vy += Math.cos(sx * 1.9 - time * 1.4 + s * .7) * tb * dt; }
    const k = d[i + F.att];
    if (k) { vx += (d[i + F.ax] - d[i + F.x]) * k * dt; vy += (d[i + F.ay] - d[i + F.y]) * k * dt; }
    const dr = d[i + F.drag]; if (dr) { const f = Math.exp(-dr * dt); vx *= f; vy *= f; }
    d[i + F.vx] = vx; d[i + F.vy] = vy; d[i + F.x] += vx * dt; d[i + F.y] += vy * dt; d[i + F.rot] += d[i + F.vr] * dt;
  }
}
function psWrite(out, enc) {
  const d = PS.d; let o = 0;
  for (let n = 0; n < PS.n; n++) {
    const i = n * PST, t = d[i + F.life] / d[i + F.max], fin = d[i + F.fin];
    const a = t < fin ? t / fin : Math.pow(Math.max(0, 1 - (t - fin) / (1 - fin)), d[i + F.fpow]);
    if (a < .003) continue;
    const s = lerp(d[i + F.s0], d[i + F.s1], t);
    let sx = s, sy = s * d[i + F.asp], rot = d[i + F.rot];
    const st = d[i + F.str];
    if (st) { const vx = d[i + F.vx], vy = d[i + F.vy], sp = Math.sqrt(vx * vx + vy * vy); rot = Math.atan2(vy, vx); sx = s + sp * st; sy = s * .7; }
    const ka = a * enc;
    out[o] = d[i + F.x]; out[o + 1] = d[i + F.y]; out[o + 2] = sx; out[o + 3] = sy; out[o + 4] = rot; out[o + 5] = d[i + F.tile]; out[o + 6] = 0; out[o + 7] = 0;
    out[o + 8] = lerp(d[i + F.r0], d[i + F.r1], t) * ka; out[o + 9] = lerp(d[i + F.g0], d[i + F.g1], t) * ka; out[o + 10] = lerp(d[i + F.b0], d[i + F.b1], t) * ka;
    out[o + 11] = lerp(d[i + F.d0], d[i + F.d1], t) * a;
    o += 12;
  }
  return o / 12;
}

/* ribbons: trails recorded from a moving head, or paths rebuilt every frame */
const RIBS = [];
function trail(o) {
  const r = { kind: 'trail', pts: [], w: o.w ?? 6, col: o.col || WHITE, i: o.i ?? 2, dark: o.dark || 0, len: o.len ?? .25, sty: o.sty || [.8, 2.2, 1, .03],
    taper: o.taper ?? 1, released: false, age: 0, fade: 1, t: 0, maxLife: o.maxLife ?? 6, head: o.head ?? 1 };
  RIBS.push(r); return r;
}
function trailPush(r, x, y) { r.pts.push({ x, y, t: r.t }); }
function pathRib(o) {
  const r = { kind: 'path', build: o.build, w: o.w ?? 6, col: o.col || WHITE, i: o.i ?? 2, dark: o.dark || 0, sty: o.sty || [.8, 2, 1, .03],
    life: o.life ?? 1, t: 0, env: o.env || (k => Math.sin(Math.min(1, k) * Math.PI)) };
  RIBS.push(r); return r;
}
function ribUpdate(dt) {
  for (let n = RIBS.length - 1; n >= 0; n--) {
    const r = RIBS[n]; r.t += dt;
    if (r.kind === 'trail') {
      const cut = r.t - r.len;
      while (r.pts.length > 2 && r.pts[0].t < cut) r.pts.shift();
      if (r.released) { r.age += dt; r.fade = Math.max(0, 1 - r.age / Math.max(.05, r.len * 1.4)); if (r.fade <= 0) RIBS.splice(n, 1); }
      else if (r.t > r.maxLife) RIBS.splice(n, 1);
    } else if (r.t >= r.life) RIBS.splice(n, 1);
  }
}
function ribWrite(out, enc) {
  let o = 0; const cap = out.length - 12 * 6 * 8;
  const tmp = [];
  for (const r of RIBS) {
    let pts;
    if (r.kind === 'trail') {
      if (r.pts.length < 2) continue;
      pts = r.pts.map((p, idx, arr) => { const k = idx / (arr.length - 1); return [p.x, p.y, Math.pow(k, r.taper) * (0.25 + .75 * k), k]; });
    } else { tmp.length = 0; r.build(r.t / r.life, r.t, tmp); pts = tmp; if (pts.length < 2) continue; }
    const env = r.kind === 'trail' ? r.fade : r.env(r.t / r.life);
    if (env <= .002) continue;
    const cr = r.col[0] * r.i * env * enc, cg = r.col[1] * r.i * env * enc, cb = r.col[2] * r.i * env * enc, dk = r.dark * env;
    let len = 0;
    for (let k = 0; k < pts.length - 1 && o < cap; k++) {
      const p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(pts.length - 1, k + 2)];
      let nx0 = -(p2[1] - p0[1]), ny0 = p2[0] - p0[0]; const l0 = Math.hypot(nx0, ny0) || 1; nx0 /= l0; ny0 /= l0;
      let nx1 = -(p3[1] - p1[1]), ny1 = p3[0] - p1[0]; const l1 = Math.hypot(nx1, ny1) || 1; nx1 /= l1; ny1 /= l1;
      const seg = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const u0 = len, u1 = len + seg; len = u1;
      const w0 = r.w * p1[2], w1 = r.w * p2[2], a0 = p1[3] ?? 1, a1 = p2[3] ?? 1;
      const L0x = p1[0] + nx0 * w0, L0y = p1[1] + ny0 * w0, R0x = p1[0] - nx0 * w0, R0y = p1[1] - ny0 * w0;
      const L1x = p2[0] + nx1 * w1, L1y = p2[1] + ny1 * w1, R1x = p2[0] - nx1 * w1, R1y = p2[1] - ny1 * w1;
      const v = (x, y, u, vv, al) => { out[o++] = x; out[o++] = y; out[o++] = u; out[o++] = vv; out[o++] = cr * al; out[o++] = cg * al; out[o++] = cb * al; out[o++] = dk * al; out[o++] = r.sty[0]; out[o++] = r.sty[1]; out[o++] = r.sty[2]; out[o++] = r.sty[3]; };
      const fa0 = Math.min(1, a0 * 1), fa1 = Math.min(1, a1 * 1);
      v(L0x, L0y, u0, 0, fa0); v(R0x, R0y, u0, 1, fa0); v(L1x, L1y, u1, 0, fa1);
      v(R0x, R0y, u0, 1, fa0); v(R1x, R1y, u1, 1, fa1); v(L1x, L1y, u1, 0, fa1);
    }
  }
  return o / 12;
}

/* analytic shapes */
const K = { ring: 0, glow: 1, circle: 2, pillar: 3, streak: 4, rays: 5, hex: 6, beam: 7, void: 8, clock: 9, spiral: 10, cross: 11, slash: 12, wave: 13, prism: 14, grid: 15 };
const SHAPES = [];
function shape(o) {
  const s = { kind: o.kind, x: o.x, y: o.y, hw: o.hw ?? o.size ?? 50, hh: o.hh ?? o.hw ?? o.size ?? 50, rot: o.rot || 0, col: o.col || WHITE, i: o.i ?? 1, dark: o.dark || 0,
    p: o.p ? o.p.slice() : [0, 0, 0, 0], q: o.q ? o.q.slice() : [rnd(), 0, 0, 0], life: o.life ?? .6, t: 0, upd: o.upd || null, layer: o.layer || 0, env: o.env || null, follow: o.follow || null,
    owner: o.owner || null, out: 0, killing: false };
  if (SHAPES.length >= 150) { const k = SHAPES.findIndex(x => !x.owner); SHAPES.splice(k >= 0 ? k : 0, 1); }
  SHAPES.push(s); wake(); return s;
}
function killOwned(owner) { for (const s of SHAPES) if (s.owner === owner) s.killing = true; }
function shapeUpdate(dt) {
  for (let n = SHAPES.length - 1; n >= 0; n--) {
    const s = SHAPES[n]; s.t += dt; const k = s.t / s.life;
    if (s.killing) { s.out = Math.min(1, s.out + dt * 4.5); if (s.out >= 1) { SHAPES.splice(n, 1); continue; } }
    if (k >= 1) { SHAPES.splice(n, 1); continue; }
    if (s.follow) { const p = s.follow(); if (p) { s.x = p.x; s.y = p.y; } }
    if (s.upd) safe(() => s.upd(s, k, dt));
  }
}

/* card shatter fragments */
const SHATTERS = [];
function shatterCard(o) {
  const { canvas, rect } = o; if (!canvas || !rect || !R.ok) return;
  const W = rect.width, H = rect.height, cx = rect.left + W / 2, cy = rect.top + H / 2;
  const ix = clamp((o.hit ? o.hit.x : cx) - rect.left, W * .15, W * .85), iy = clamp((o.hit ? o.hit.y : cy) - rect.top, H * .15, H * .85);
  const sectors = Math.round(clamp(7 + (W * H) / 9000, 7, 12)), rings = H > 70 ? 3 : 2;
  const angles = []; let a0 = rnd(TAU);
  for (let k = 0; k < sectors; k++) angles.push(a0 + (k + rnd(-.32, .32)) / sectors * TAU);
  angles.sort((a, b) => a - b);
  const maxR = Math.hypot(Math.max(ix, W - ix), Math.max(iy, H - iy)) * 1.05;
  const radii = [0]; for (let k = 1; k <= rings; k++) radii.push(maxR * Math.pow(k / rings, .8) * rnd(.85, 1.05)); radii[rings] = maxR * 1.2;
  const frags = [];
  const clipPoly = (poly) => {
    const edges = [[p => p.x >= 0, (a, b) => ({ x: 0, y: a.y + (b.y - a.y) * (0 - a.x) / (b.x - a.x) })],
      [p => p.x <= W, (a, b) => ({ x: W, y: a.y + (b.y - a.y) * (W - a.x) / (b.x - a.x) })],
      [p => p.y >= 0, (a, b) => ({ x: a.x + (b.x - a.x) * (0 - a.y) / (b.y - a.y), y: 0 })],
      [p => p.y <= H, (a, b) => ({ x: a.x + (b.x - a.x) * (H - a.y) / (b.y - a.y), y: H })]];
    let out = poly;
    for (const [inside, cut] of edges) {
      const inp = out; out = []; if (!inp.length) break;
      for (let k = 0; k < inp.length; k++) {
        const cur = inp[k], prev = inp[(k + inp.length - 1) % inp.length];
        if (inside(cur)) { if (!inside(prev)) out.push(cut(prev, cur)); out.push(cur); } else if (inside(prev)) out.push(cut(prev, cur));
      }
    }
    return out;
  };
  for (let s = 0; s < sectors; s++) {
    const aA = angles[s], aB = s + 1 < sectors ? angles[s + 1] : angles[0] + TAU;
    for (let g = 0; g < rings; g++) {
      const r0 = radii[g], r1 = radii[g + 1];
      const poly = [];
      const steps = Math.max(1, Math.ceil((aB - aA) / .7));
      for (let k = 0; k <= steps; k++) { const a = lerp(aA, aB, k / steps); poly.push({ x: ix + Math.cos(a) * r1, y: iy + Math.sin(a) * r1 }); }
      if (r0 > 0) for (let k = steps; k >= 0; k--) { const a = lerp(aA, aB, k / steps); poly.push({ x: ix + Math.cos(a) * r0, y: iy + Math.sin(a) * r0 }); }
      else poly.push({ x: ix, y: iy });
      const clipped = clipPoly(poly); if (clipped.length < 3) continue;
      let mx = 0, my = 0; clipped.forEach(p => { mx += p.x; my += p.y; }); mx /= clipped.length; my /= clipped.length;
      const dx = mx - ix, dy = my - iy, dl = Math.hypot(dx, dy) || 1, pw = o.power ?? 1;
      const out = (130 + rnd(220)) * pw * (1 - g * .18), dir = o.dir || { x: 0, y: 0 };
      frags.push({
        cx: rect.left + mx, cy: rect.top + my,
        vx: dx / dl * out + dir.x * 240 * pw + rnd(-40, 40), vy: dy / dl * out * .85 + dir.y * 240 * pw - rnd(60, 180) * pw,
        rot: 0, vr: rnd(-7, 7) * pw, tum: 0, vt: rnd(-9, 9), seed: rnd(), delay: rnd(.1, .38) + g * .05,
        poly: clipped.map(p => ({ x: p.x - mx, y: p.y - my, u: p.x / W, v: p.y / H })),
      });
    }
  }
  const sh = { canvas, tex: null, frags, edge: o.edge || [1, .6, .2], t: 0, life: o.life ?? 1.25, grav: o.grav ?? 900, drag: o.drag ?? 1.2, burnSpeed: o.burn ?? 1, emberCol: o.ember || o.edge || [1, .6, .2], embers: o.embers !== false };
  SHATTERS.push(sh); return sh;
}
function shatterUpdate(dt) {
  for (let n = SHATTERS.length - 1; n >= 0; n--) {
    const s = SHATTERS[n]; s.t += dt;
    if (s.t >= s.life) { if (s.tex && R.gl) R.gl.deleteTexture(s.tex); SHATTERS.splice(n, 1); continue; }
    const k = s.t / s.life, f = Math.exp(-s.drag * dt);
    for (const g of s.frags) {
      g.vy += s.grav * dt; g.vx *= f; g.vy *= f; g.cx += g.vx * dt; g.cy += g.vy * dt; g.rot += g.vr * dt; g.tum += g.vt * dt;
      if (s.embers && Math.random() < dt * 11 * Q().density && k > g.delay && k < .92) {
        const p = g.poly[(Math.random() * g.poly.length) | 0];
        P({ x: g.cx + p.x * .8, y: g.cy + p.y * .8, ang: -Math.PI / 2 + rnd(-.9, .9), speed: [20, 90], vx: g.vx * .25, vy: g.vy * .2, life: [.35, .8], size: [1, 2.2], grow: .3,
          col: s.emberCol, i: [1.6, 3.2], col1: mulc(s.emberCol, .6), i1: .4, tile: TILE.ember, drag: 1.6, turb: 160, grav: -40, fin: .15 });
      }
    }
  }
}
function shatterWrite(s, out, enc) {
  let o = 0; const k = s.t / s.life, cap = out.length - 64;
  for (const g of s.frags) {
    const prog = smooth(g.delay, 1, k) * s.burnSpeed, c = Math.cos(g.rot), sn = Math.sin(g.rot), sx = Math.cos(g.tum);
    const shade = .62 + .38 * Math.abs(sx), glow = .8 + 1.1 * smooth(.1, .6, k);
    const pts = g.poly.map(p => { const x = p.x * sx, y = p.y; return [g.cx + x * c - y * sn, g.cy + x * sn + y * c, p.u, p.v]; });
    for (let j = 1; j < pts.length - 1 && o < cap; j++) {
      for (const p of [pts[0], pts[j], pts[j + 1]]) { out[o++] = p[0]; out[o++] = p[1]; out[o++] = p[2]; out[o++] = p[3]; out[o++] = prog; out[o++] = shade; out[o++] = glow; out[o++] = g.seed; }
    }
  }
  return o / 8;
}

/* ───────── post state & camera ───────── */
const POST = { flash: [1, 1, 1], flashA: 0, flashDecay: 9, vig: 0, vigT: 0, vigUntil: 0, ca: 0, expo: 1, bloom: 1, spot: [.5, .5, .2, 0], spotT: 0, spotUntil: 0 };
function flashScreen(col, amount, decay = 9) { if (amount * 1 > POST.flashA) { POST.flash = col; POST.flashA = amount; POST.flashDecay = decay; } wake(); }
function vignette(amount, ms) { POST.vigT = Math.max(POST.vigT, amount); POST.vigUntil = Math.max(POST.vigUntil, now() + ms); wake(); }
function aberrate(amount) { if (Q().ca) POST.ca = Math.max(POST.ca, amount); wake(); }
function spotlight(x, y, r, amount, ms) { POST.spot = [x / Math.max(1, innerWidth), y / Math.max(1, innerHeight), r / Math.max(1, innerHeight), POST.spot[3]]; POST.spotT = amount; POST.spotUntil = now() + ms; wake(); }
function postUpdate(dt) {
  POST.flashA *= Math.exp(-POST.flashDecay * dt); if (POST.flashA < .002) POST.flashA = 0;
  if (now() > POST.vigUntil) POST.vigT = 0;
  POST.vig = lerp(POST.vig, POST.vigT, 1 - Math.exp(-dt * (POST.vigT > POST.vig ? 14 : 3.5))); if (POST.vig < .002 && !POST.vigT) POST.vig = 0;
  if (now() > POST.spotUntil) POST.spotT = 0;
  POST.spot[3] = lerp(POST.spot[3], POST.spotT, 1 - Math.exp(-dt * (POST.spotT > POST.spot[3] ? 10 : 3))); if (POST.spot[3] < .002 && !POST.spotT) POST.spot[3] = 0;
  POST.ca *= Math.exp(-dt * 7); if (POST.ca < .0002) POST.ca = 0;
}
const postBusy = () => POST.flashA > 0 || POST.vig > 0 || POST.vigT > 0 || POST.ca > 0 || POST.spot[3] > 0 || POST.spotT > 0;

const CAM = { trauma: 0, punch: 0, px: 0, py: 0, hs: 0, applied: false, t: 0 };
function trauma(a) { if (!shakeOn()) return; CAM.trauma = Math.min(1, CAM.trauma + a); wake(); }
function punch(a, x, y) { if (!shakeOn()) return; if (a > CAM.punch) { CAM.punch = a; CAM.px = x ?? innerWidth / 2; CAM.py = y ?? innerHeight / 2; } wake(); }
function hitstop(ms) { const t = now(); CAM.hs = CAM.hs > t ? Math.min(Math.max(CAM.hs, t + ms), CAM.hs + 20) : t + ms; wake(); }
const n1 = t => Math.sin(t) * .55 + Math.sin(t * 2.31 + 1.3) * .3 + Math.sin(t * 4.17 + 2.1) * .15;
function camTargets() { return [q('#gameMain'), R.canvas, q('#vfxCards')].filter(Boolean); }
function camUpdate(dt) {
  CAM.t += dt;
  CAM.trauma = Math.max(0, CAM.trauma - dt * 1.7);
  CAM.punch *= Math.exp(-dt * 8.5); if (CAM.punch < .0006) CAM.punch = 0;
  const s = CAM.trauma * CAM.trauma, live = (s > .0004 || CAM.punch > 0) && shakeOn();
  if (!live) { if (CAM.applied) camReset(); return; }
  const x = 16 * s * n1(CAM.t * 23), y = 12 * s * n1(CAM.t * 21 + 40), r = 1.1 * s * n1(CAM.t * 17 + 80), z = 1 + CAM.punch;
  const tf = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotate(${r.toFixed(3)}deg) scale(${z.toFixed(4)})`;
  for (const el of camTargets()) {
    if (el === R.canvas || el.id === 'vfxCards') el.style.transformOrigin = `${CAM.px}px ${CAM.py}px`;
    else { const b = el.getBoundingClientRect(); el.style.transformOrigin = `${CAM.px - b.left + (parseFloat(el.style.getPropertyValue('--vfx-ox')) || 0)}px ${CAM.py - b.top}px`; }
    el.style.transform = tf; el.style.willChange = 'transform';
  }
  CAM.applied = true;
}
function camReset() { for (const el of camTargets()) { el.style.transform = ''; el.style.transformOrigin = ''; el.style.willChange = ''; } CAM.applied = false; }
const camBusy = () => CAM.trauma > .02 || CAM.punch > 0 || CAM.applied;

/* ═════════════════════════ FRAME LOOP ═════════════════════════ */
let raf = 0, lastFrame = 0, simTime = 0, shown = false, slowFrames = 0, frames = 0, killed = false, dirtyClear = false, frameMs = 16;
const TICKERS = new Set();      // per-frame callbacks from choreography (projectiles, ghosts…)
function alive() { return PS.n > 0 || RIBS.length || SHAPES.length || SHATTERS.length || TICKERS.size || postBusy() || camBusy(); }
let inFrame = false, dupFrames = 0; // wake() during a frame must not start a second loop
function wake() {
  if (!active()) return;
  if (!shown) { R.canvas.style.visibility = 'visible'; shown = true; }
  if (!raf && !inFrame) { lastFrame = 0; raf = requestAnimationFrame(frame); }
}
function frame(t) {
  raf = 0;
  if (!active()) { stopAll(); return; }
  const tier = Q();
  if (tier.fps < 60 && lastFrame && t - lastFrame < 1000 / tier.fps - 3) { raf = requestAnimationFrame(frame); return; }
  if (t === lastFrame) dupFrames++;
  let dt = lastFrame ? (t - lastFrame) / 1000 : 1 / 60; lastFrame = t; dt = clamp(dt, 0, 1 / 10);
  frameMs = frameMs * .92 + dt * 1000 * .08;
  if (!forced && dt > 0 && (PS.n > 60 || SHATTERS.length)) {
    frames++; if (dt > 1 / 36) slowFrames++;
    if (frames >= 45) { if (slowFrames > 26 && tierIndex > 0) { tierIndex--; tierCap = Math.min(tierCap, tierIndex); R.w = 0; } frames = slowFrames = 0; }
  }
  const frozen = now() < CAM.hs, sdt = frozen ? dt * .04 : dt;
  simTime += sdt;
  inFrame = true;
  try {
    safe(() => {
      for (const fn of [...TICKERS]) { if (fn(sdt, dt, t) === false) TICKERS.delete(fn); }
      psUpdate(sdt, simTime); ribUpdate(sdt); shapeUpdate(frozen ? dt * .5 : dt); shatterUpdate(sdt); postUpdate(dt); camUpdate(dt);
      draw();
    });
  } finally { inFrame = false; }
  if (raf) return;
  if (!active()) { stopAll(); return; }
  if (alive()) raf = requestAnimationFrame(frame); else idle();
}
function idle() {
  if (R.ok && R.gl && !R.gl.isContextLost()) { const gl = R.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, R.canvas.width, R.canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
  if (R.canvas) R.canvas.style.visibility = 'hidden';
  shown = false; if (CAM.applied) camReset();
}
function stopAll() {
  cancelAnimationFrame(raf); raf = 0;
  PS.n = 0; RIBS.length = 0; SHAPES.length = 0;
  for (const s of SHATTERS) if (s.tex && R.gl) safe(() => R.gl.deleteTexture(s.tex));
  SHATTERS.length = 0;
  for (const fn of [...TICKERS]) safe(() => fn(0, 0, 0, true));
  TICKERS.clear();
  POST.flashA = 0; POST.vig = POST.vigT = 0; POST.ca = 0; POST.spot[3] = POST.spotT = 0;
  CAM.trauma = CAM.punch = 0; CAM.hs = 0;
  safe(() => { for (const g of [...GHOSTS]) ghostFinish(g); });
  safe(releaseHidden);
  safe(() => document.querySelectorAll('.vfx-label').forEach(el => el.remove()));
  if (R.canvas) safe(idle);
  safe(resolvePending);
}

const MASK = { parts: true, shapes: true, ribs: true, frags: true, bloom: true };
function draw() {
  const gl = R.gl; if (!gl || gl.isContextLost()) return;
  resize();
  const tier = Q();
  gl.bindFramebuffer(gl.FRAMEBUFFER, R.rt.fbo); gl.viewport(0, 0, R.w, R.h);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  const cssRes = [R.cssW, R.cssH];
  // 1. shapes behind
  if (MASK.shapes) drawShapes(0, cssRes);
  // 2. fragments (premultiplied over)
  if (SHATTERS.length && MASK.frags) {
    const p = R.prog.frag; gl.useProgram(p.p); gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform2f(p.u.uRes, cssRes[0], cssRes[1]); gl.uniform1i(p.u.uTex, 0); gl.uniform1i(p.u.uNoise, 1); gl.uniform1f(p.u.uEnc, R.enc);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, R.tex.noise);
    gl.bindBuffer(gl.ARRAY_BUFFER, R.fragBuf);
    layout([[0, 2, 32, 0], [1, 2, 32, 8], [2, 4, 32, 16]]);
    for (const s of SHATTERS) {
      if (!s.tex) s.tex = safe(() => uploadCanvas(s.canvas), null);
      if (!s.tex) continue;
      const n = shatterWrite(s, R.fragData, R.enc); if (!n) continue;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, s.tex);
      gl.uniform3f(p.u.uEdge, s.edge[0], s.edge[1], s.edge[2]);
      gl.bufferData(gl.ARRAY_BUFFER, R.fragData.subarray(0, n * 8), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, n);
    }
  }
  gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE);
  // 3. ribbons
  if (RIBS.length && MASK.ribs) {
    const n = ribWrite(R.ribData, R.enc);
    if (n) {
      const p = R.prog.rib; gl.useProgram(p.p); gl.uniform2f(p.u.uRes, cssRes[0], cssRes[1]); gl.uniform1f(p.u.uTime, simTime); gl.uniform1i(p.u.uNoise, 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.tex.noise);
      gl.bindBuffer(gl.ARRAY_BUFFER, R.ribBuf); gl.bufferData(gl.ARRAY_BUFFER, R.ribData.subarray(0, n * 12), gl.DYNAMIC_DRAW);
      layout([[0, 2, 48, 0], [1, 2, 48, 8], [2, 4, 48, 16], [3, 4, 48, 32]]);
      gl.drawArrays(gl.TRIANGLES, 0, n);
    }
  }
  // 4. particles
  if (PS.n && MASK.parts) {
    const n = psWrite(R.instData, R.enc);
    if (n) {
      const p = R.prog.part; gl.useProgram(p.p); gl.uniform2f(p.u.uRes, cssRes[0], cssRes[1]); gl.uniform1i(p.u.uAtlas, 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.tex.atlas);
      gl.bindBuffer(gl.ARRAY_BUFFER, R.instBuf); gl.bufferData(gl.ARRAY_BUFFER, R.instData.subarray(0, n * 12), gl.DYNAMIC_DRAW);
      layout([[0, 2, 8, 0, 0, R.quad], [1, 4, 48, 0, 1, R.instBuf], [2, 4, 48, 16, 1, R.instBuf], [3, 4, 48, 32, 1, R.instBuf]]);
      R.inst.draw(gl.TRIANGLE_STRIP, 0, 4, n);
    }
  }
  // 5. shapes in front
  if (MASK.shapes) drawShapes(1, cssRes);
  // bloom + composite
  if (MASK.bloom) bloom(tier); else { gl.bindFramebuffer(gl.FRAMEBUFFER, R.bloomLv[0].fbo); gl.viewport(0, 0, R.bloomLv[0].w, R.bloomLv[0].h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
  composite();
}
function drawShapes(layer, cssRes) {
  if (!SHAPES.length) return;
  const gl = R.gl, p = R.prog.shape; let bound = false;
  for (const s of SHAPES) {
    if (s.layer !== layer || (MASK.kinds && !MASK.kinds.includes(s.kind))) continue;
    const k = s.t / s.life, env = (s.env ? s.env(k) : 1) * (1 - s.out); if (env <= .002) continue;
    if (!bound) {
      gl.useProgram(p.p); gl.uniform2f(p.u.uRes, cssRes[0], cssRes[1]); gl.uniform1i(p.u.uNoise, 0); gl.uniform1f(p.u.uTime, simTime);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.tex.noise);
      gl.bindBuffer(gl.ARRAY_BUFFER, R.quad); layout([[0, 2, 8, 0]]); bound = true;
    }
    const I = s.i * env * R.enc;
    gl.uniform2f(p.u.uC, s.x, s.y); gl.uniform2f(p.u.uH, s.hw, s.hh); gl.uniform1f(p.u.uRot, s.rot); gl.uniform1f(p.u.uKind, s.kind);
    gl.uniform4f(p.u.uCol, s.col[0] * I, s.col[1] * I, s.col[2] * I, s.dark * env);
    gl.uniform4f(p.u.uP, s.p[0], s.p[1], s.p[2], s.p[3]); gl.uniform4f(p.u.uQ, s.q[0], s.q[1], s.q[2], s.q[3]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
function fullscreen(prog) { const gl = R.gl; gl.bindBuffer(gl.ARRAY_BUFFER, R.full); layout([[0, 2, 8, 0]]); gl.drawArrays(gl.TRIANGLES, 0, 3); }
function bloom(tier) {
  const gl = R.gl, L = R.bloomLv; if (!L.length) return;
  gl.disable(gl.BLEND);
  let p = R.prog.pre; gl.useProgram(p.p);
  gl.bindFramebuffer(gl.FRAMEBUFFER, L[0].fbo); gl.viewport(0, 0, L[0].w, L[0].h);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.rt.tex);
  gl.uniform1i(p.u.uSrc, 0); gl.uniform2f(p.u.uTexel, 1 / R.w, 1 / R.h); gl.uniform1f(p.u.uDec, 1 / R.enc); gl.uniform1f(p.u.uEncB, R.encB);
  gl.uniform1f(p.u.uThr, .95); gl.uniform1f(p.u.uKnee, .45);
  fullscreen(p);
  p = R.prog.down; gl.useProgram(p.p); gl.uniform1i(p.u.uSrc, 0);
  for (let i = 1; i < L.length; i++) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, L[i].fbo); gl.viewport(0, 0, L[i].w, L[i].h);
    gl.bindTexture(gl.TEXTURE_2D, L[i - 1].tex); gl.uniform2f(p.u.uTexel, 1 / L[i - 1].w, 1 / L[i - 1].h); fullscreen(p);
  }
  p = R.prog.up; gl.useProgram(p.p); gl.uniform1i(p.u.uSrc, 0); gl.uniform1f(p.u.uGain, 1);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  for (let i = L.length - 1; i > 0; i--) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, L[i - 1].fbo); gl.viewport(0, 0, L[i - 1].w, L[i - 1].h);
    gl.bindTexture(gl.TEXTURE_2D, L[i].tex); gl.uniform2f(p.u.uTexel, .5 / L[i].w, .5 / L[i].h); fullscreen(p);
  }
  gl.disable(gl.BLEND);
}
function composite() {
  const gl = R.gl, p = R.prog.comp;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, R.canvas.width, R.canvas.height);
  gl.disable(gl.BLEND); gl.useProgram(p.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.rt.tex);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, R.bloomLv.length ? R.bloomLv[0].tex : R.rt.tex);
  gl.uniform1i(p.u.uScene, 0); gl.uniform1i(p.u.uBloom, 1);
  gl.uniform2f(p.u.uRes, R.canvas.width, R.canvas.height); gl.uniform1f(p.u.uDec, 1 / R.enc); gl.uniform1f(p.u.uDecB, 1 / R.encB);
  gl.uniform1f(p.u.uBloomAmt, (R.bloomLv.length ? .17 : 0) * POST.bloom); gl.uniform1f(p.u.uCA, POST.ca);
  gl.uniform1f(p.u.uVig, POST.vig); gl.uniform1f(p.u.uTime, simTime % 100); gl.uniform1f(p.u.uExpo, POST.expo);
  gl.uniform4f(p.u.uFlash, POST.flash[0], POST.flash[1], POST.flash[2], POST.flashA);
  gl.uniform4f(p.u.uSpot, POST.spot[0], 1 - POST.spot[1], POST.spot[2], POST.spot[3]);
  gl.activeTexture(gl.TEXTURE0);
  fullscreen(p);
}
function uploadCanvas(cv) {
  const gl = R.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  return t;
}

/* ═════════════════════════ AUDIO (synthesized, no files) ═════════════════════════ */
const AU = { ctx: null, out: null, rev: null, noise: null, brown: null, curve: null, ok: false, last: {} };
const auVol = () => { const v = clamp(Number(setting('sfxVol', 80)) || 0, 0, 100) / 100; return v * v; };
function auInit() {
  if (AU.ctx) return true;
  if (auVol() <= 0) return false;
  const C = window.AudioContext || window.webkitAudioContext; if (!C) return false;
  try {
    const ctx = new C({ latencyHint: 'interactive' });
    const out = ctx.createGain(); out.gain.value = auVol() * .9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4.5; comp.attack.value = .003; comp.release.value = .22;
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -2.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = .001; lim.release.value = .1;
    out.connect(comp); comp.connect(lim); lim.connect(ctx.destination);
    const rev = ctx.createGain(), hp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), conv = ctx.createConvolver(), wet = ctx.createGain();
    hp.type = 'highpass'; hp.frequency.value = 220; lp.type = 'lowpass'; lp.frequency.value = 6500; wet.gain.value = .55;
    conv.buffer = impulse(ctx, 2.6, 2.8); rev.connect(hp); hp.connect(lp); lp.connect(conv); conv.connect(wet); wet.connect(out);
    const len = ctx.sampleRate * 2, nb = ctx.createBuffer(1, len, ctx.sampleRate), ch = nb.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const bb = ctx.createBuffer(1, len, ctx.sampleRate), bc = bb.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { last = (last + .02 * (Math.random() * 2 - 1)) / 1.02; bc[i] = last * 3.5; }
    const curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 1023 * 2 - 1; curve[i] = Math.tanh(x * 2.6) / Math.tanh(2.6); }
    Object.assign(AU, { ctx, out, rev, noise: nb, brown: bb, curve, ok: true });
  } catch (e) { warn(e); AU.ctx = null; AU.ok = false; return false; }
  return true;
}
function impulse(ctx, sec, decay) {
  const rate = ctx.sampleRate, len = Math.floor(rate * sec), buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); let lp = 0; for (let i = 0; i < len; i++) { const t = i / len; lp = lp * .6 + (Math.random() * 2 - 1) * .4; d[i] = lp * Math.pow(1 - t, decay) * (i < rate * .015 ? i / (rate * .015) : 1); } }
  return buf;
}
function auUnlock() {
  if (!wanted()) return;
  if (!AU.ctx && !auInit()) return;
  if (AU.ctx.state === 'suspended') AU.ctx.resume().catch(() => {});
}
addEventListener('pointerdown', auUnlock, { capture: true, passive: true });
addEventListener('keydown', auUnlock, { capture: true });
function auReady() { return AU.ok && AU.ctx && AU.ctx.state === 'running' && auVol() > 0 && !document.hidden ? AU.ctx : null; }
function bus(pan = 0, rev = .25, gain = 1, life = 3) {
  const ctx = AU.ctx, g = ctx.createGain(); g.gain.value = gain; const nodes = [g];
  if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); p.connect(AU.out); nodes.push(p); } else g.connect(AU.out);
  if (rev > 0) { const s = ctx.createGain(); s.gain.value = rev; g.connect(s); s.connect(AU.rev); nodes.push(s); }
  setTimeout(() => nodes.forEach(n => { try { n.disconnect(); } catch (e) {} }), (life + 3) * 1000);
  return g;
}
function tone(o) {
  const ctx = AU.ctx, t0 = ctx.currentTime + Math.max(0, o.t || 0), d = Math.max(.02, o.d), osc = ctx.createOscillator();
  osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(Math.max(16, o.f), t0);
  if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(16, o.f1), t0 + (o.fd ?? d));
  if (o.detune) osc.detune.value = o.detune;
  const env = ctx.createGain(), a = o.a ?? .004, peak = Math.max(.0002, o.g);
  env.gain.setValueAtTime(.0001, t0);
  if (o.swell) env.gain.linearRampToValueAtTime(peak, t0 + a); else env.gain.exponentialRampToValueAtTime(peak, t0 + a);
  env.gain.exponentialRampToValueAtTime(.0001, t0 + d);
  let node = osc;
  if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(o.lp, t0); if (o.lp1) f.frequency.exponentialRampToValueAtTime(o.lp1, t0 + d); f.Q.value = o.q ?? .7; node.connect(f); node = f; }
  if (o.dist) { const w = ctx.createWaveShaper(); w.curve = AU.curve; node.connect(w); node = w; }
  node.connect(env); env.connect(o.to);
  if (o.vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1]; l.connect(lg); lg.connect(osc.frequency); l.start(t0); l.stop(t0 + d + .05); }
  osc.start(t0); osc.stop(t0 + d + .05);
}
function hiss(o) {
  const ctx = AU.ctx, t0 = ctx.currentTime + Math.max(0, o.t || 0), d = Math.max(.02, o.d), src = ctx.createBufferSource();
  src.buffer = o.brown ? AU.brown : AU.noise; src.loop = true; src.playbackRate.value = o.rate || 1;
  const f = ctx.createBiquadFilter(); f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f || 1000, t0);
  if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t0 + (o.fd ?? d)); f.Q.value = o.q ?? 1;
  const env = ctx.createGain(), a = o.a ?? .003, peak = Math.max(.0002, o.g);
  env.gain.setValueAtTime(.0001, t0);
  if (o.swell) env.gain.linearRampToValueAtTime(peak, t0 + a); else env.gain.exponentialRampToValueAtTime(peak, t0 + a);
  env.gain.exponentialRampToValueAtTime(.0001, t0 + d);
  src.connect(f); f.connect(env); env.connect(o.to);
  src.start(t0, Math.random() * 1.5); src.stop(t0 + d + .05);
}
const NOTE = { FIRE: 174.6, WAR: 146.8, WATER: 220, ICE: 261.6, LIFE: 196, PEACE: 233.1, DEATH: 110, FEAR: 123.5, DARKNESS: 98, CORRUPTION: 116.5,
  LIGHT: 293.7, CLARITY: 329.6, COURAGE: 246.9, METAL: 155.6, MIRROR: 277.2, SPEED: 311.1, LUCK: 349.2, SPIRIT: 207.7, PSYCHIC: 185, CHAOS: 138.6,
  GRAVITY: 82.4, TIME: 164.8, PLAGUE: 130.8, SMOKE: 103.8 };
const note = p => NOTE[p] || 220;
const panAt = x => clamp(((x ?? innerWidth / 2) / Math.max(1, innerWidth)) * 2 - 1, -1, 1) * .65;
const SND = {
  whoosh(x, d = .3, f0 = 500, f1 = 2800, g = .22) { const o = bus(panAt(x), .18, 1, d); hiss({ to: o, d, a: d * .45, swell: true, f: f0, f1, q: 1.3, g }); },
  charge(proto, d, x) {
    const b = note(proto), o = bus(panAt(x), .35, 1, d + 1);
    hiss({ to: o, d: d + .08, a: d * .9, swell: true, f: 380, f1: 4200, q: 3, g: .1 });
    tone({ to: o, type: 'sawtooth', f: b, f1: b * 2, d: d + .12, a: d * .85, swell: true, g: .05, lp: 500, lp1: 3400 });
    tone({ to: o, f: b * 2, f1: b * 4, d: d + .1, a: d * .8, swell: true, g: .04, vib: [9, 7] });
    tone({ to: o, f: 48, f1: 66, d: d + .1, a: d * .7, swell: true, g: .09 });
  },
  launch(style, x, proto) {
    const o = bus(panAt(x), .2, 1, 1), b = note(proto);
    hiss({ to: o, d: .24, a: .05, f: 900, f1: 3400, q: 1.1, g: .26 });
    if (style === 'zap') { tone({ to: o, type: 'square', f: 2600, f1: 280, d: .13, g: .06, lp: 5000 }); hiss({ to: o, type: 'highpass', f: 4200, d: .06, g: .12 }); }
    else if (style === 'heavy') { tone({ to: o, f: 150, f1: 58, d: .28, g: .26 }); hiss({ to: o, type: 'lowpass', f: 900, d: .3, g: .18 }); }
    else tone({ to: o, type: 'triangle', f: b * 4, f1: b * 2, d: .22, g: .05 });
  },
  impact(el, power, x, proto) {
    const p = clamp(power, .2, 1.4), o = bus(panAt(x), .28 + .22 * p, 1, 2.4), b = note(proto);
    tone({ to: o, f: 78, f1: 30, d: .45 + .35 * p, g: .55 * p });
    tone({ to: o, type: 'triangle', f: 270, f1: 55, d: .15, g: .42 * p, dist: true });
    hiss({ to: o, type: 'highpass', f: 2300, d: .065, g: .32 * p });
    hiss({ to: o, f: 1100, f1: 240, q: .8, d: .34, g: .26 * p });
    const R = (n, f) => { for (let i = 0; i < n; i++) f(i); };
    switch (el) {
      case 'fire': R(8, () => hiss({ to: o, f: rnd(2400, 4600), q: 3, d: rnd(.02, .045), g: rnd(.05, .1), t: rnd(.03, .7) })); hiss({ to: o, brown: true, type: 'lowpass', f: 420, d: .95, g: .22 * p }); break;
      case 'war': hiss({ to: o, brown: true, type: 'lowpass', f: 320, d: 1.5, g: .34 * p }); tone({ to: o, f: 52, f1: 24, d: 1.2, g: .5 * p }); R(6, () => hiss({ to: o, f: rnd(1800, 3800), q: 2, d: .03, g: .08, t: rnd(.05, .9) })); break;
      case 'water': hiss({ to: o, type: 'lowpass', f: 4200, f1: 480, d: .48, g: .28 }); R(6, i => tone({ to: o, f: rnd(380, 900), f1: rnd(900, 1700), d: .055, g: .045, t: .05 + i * .06 + rnd(.03) })); break;
      case 'ice': R(8, () => tone({ to: o, f: rnd(2300, 6400), d: rnd(.1, .32), g: rnd(.025, .05), t: rnd(0, .22) })); hiss({ to: o, type: 'highpass', f: 6000, d: .28, g: .1 }); break;
      case 'nature': [4, 5, 6].forEach((m, i) => tone({ to: o, f: b * m, d: .75, g: .035, t: .03 + i * .06 })); hiss({ to: o, f: 3000, q: 2, d: .4, g: .04 }); break;
      case 'dark': tone({ to: o, type: 'sawtooth', f: 55, d: 1.1, a: .02, g: .12, lp: 300 }); hiss({ to: o, type: 'lowpass', f: 700, f1: 140, d: .85, g: .16 }); tone({ to: o, f: b * 2, f1: b, d: .7, g: .045, vib: [5, 9], t: .04 }); break;
      case 'light': [4, 6, 8].forEach((m, i) => tone({ to: o, f: b * m, d: .95, g: .032, t: i * .025 })); hiss({ to: o, type: 'highpass', f: 7000, d: .55, g: .07 }); tone({ to: o, f: b * 8, d: 1.3, g: .028, t: .12 }); break;
      case 'metal': [523, 1347, 2631, 3876].forEach((f, i) => tone({ to: o, f, d: .9 - i * .15, g: .05 - i * .008 })); hiss({ to: o, type: 'highpass', f: 5200, d: .08, g: .22 }); break;
      case 'speed': hiss({ to: o, f: 3000, f1: 6400, q: 1.2, d: .13, g: .16 }); tone({ to: o, type: 'sawtooth', f: 3200, f1: 1100, d: .06, g: .035, lp: 7000 }); break;
      case 'spirit': hiss({ to: o, f: 2100, q: 5, d: .65, a: .1, swell: true, g: .08 }); tone({ to: o, f: b * 3, d: .75, g: .04, vib: [6, 4] }); break;
      case 'psychic': tone({ to: o, f: b * 3, d: .55, g: .06, vib: [11, 45] }); tone({ to: o, f: b * 3.02, d: .55, g: .045 }); break;
      case 'chaos': R(9, i => tone({ to: o, type: 'square', f: rnd(180, 2200), d: .028, g: .045, t: i * .028, lp: 6000 })); break;
      case 'gravity': tone({ to: o, f: 190, f1: 26, d: .95, g: .36 }); hiss({ to: o, brown: true, type: 'lowpass', f: 200, d: .9, g: .25 }); break;
      case 'time': tone({ to: o, f: 190, f1: 40, d: .8, g: .22 }); R(6, i => hiss({ to: o, type: 'highpass', f: 5000, d: .012, g: .2, t: .08 + i * .11 })); break;
      case 'toxic': hiss({ to: o, type: 'lowpass', f: 720, q: 6, d: .42, g: .2 }); R(5, i => tone({ to: o, f: rnd(160, 380), f1: rnd(380, 700), d: .07, g: .05, t: .06 + i * .07 })); break;
      case 'luck': tone({ to: o, f: 1975.5, d: .42, g: .05 }); tone({ to: o, f: 2637, d: .42, g: .04 }); tone({ to: o, f: 2349.3, d: .5, g: .045, t: .08 }); tone({ to: o, f: 3136, d: .5, g: .035, t: .08 }); break;
    }
  },
  shatter(x, power = 1) {
    const o = bus(panAt(x), .35, 1, 1.6);
    hiss({ to: o, type: 'highpass', f: 3100, d: .13, g: .34 * power });
    for (let i = 0; i < 12; i++) tone({ to: o, f: rnd(1800, 7600), d: rnd(.05, .24), g: rnd(.025, .055), t: rnd(0, .2) });
    tone({ to: o, f: 96, f1: 40, d: .32, g: .34 * power });
    hiss({ to: o, f: 1800, q: .7, d: .36, g: .12 });
  },
  slam(x, faceDown, power = 1, proto) {
    const o = bus(panAt(x), .22, 1, 1.2);
    tone({ to: o, f: faceDown ? 92 : 124, f1: faceDown ? 36 : 44, d: .3, g: .48 * power });
    hiss({ to: o, type: 'lowpass', f: faceDown ? 1100 : 1700, d: .075, g: .3 * power });
    tone({ to: o, type: 'triangle', f: 230, f1: 90, d: .1, g: .18 * power, dist: true });
    if (faceDown) hiss({ to: o, f: 620, q: 2, d: .42, a: .05, g: .08 });
    else if (proto) tone({ to: o, f: note(proto) * 4, d: .45, g: .028, t: .02 });
  },
  flip(x, up, proto) {
    const o = bus(panAt(x), .25, 1, 1);
    hiss({ to: o, f: 1400, f1: 4400, q: 1.1, d: .15, a: .04, g: .1 });
    if (up) { const b = note(proto); tone({ to: o, f: b * 6, d: .32, g: .028, t: .05 }); tone({ to: o, f: b * 9, d: .3, g: .02, t: .09 }); }
    else tone({ to: o, f: 160, f1: 90, d: .26, g: .1 });
  },
  cast(proto, x) {
    const b = note(proto), o = bus(panAt(x), .45, 1, 2);
    [2, 3, 4].forEach((m, i) => tone({ to: o, f: b * m, d: 1.15, a: .012, g: .042, t: i * .01 }));
    hiss({ to: o, type: 'highpass', f: 6200, d: .5, g: .045 });
    hiss({ to: o, f: 300, f1: 3200, q: 1.2, d: .36, a: .14, swell: true, g: .1 });
    tone({ to: o, f: 62, d: .5, g: .11 });
  },
  cutin(proto, compile) {
    const b = note(proto), o = bus(0, .5, 1, 3);
    hiss({ to: o, f: 500, f1: 5200, q: 1.3, d: .34, a: .12, swell: true, g: .14 });
    tone({ to: o, f: 72, f1: 34, d: .42, g: .32, t: .12 }); hiss({ to: o, type: 'highpass', f: 3000, d: .05, g: .2, t: .12 });
    const chord = compile ? [1, 1.5, 2, 3, 4] : [2, 3, 4];
    chord.forEach((m, i) => tone({ to: o, f: b * m, d: compile ? 1.8 : 1.2, a: .015, g: compile ? .035 : .04, t: .13 + i * .012 }));
  },
  riser(proto, d) {
    const b = note(proto), o = bus(0, .45, 1, d + 1);
    hiss({ to: o, f: 280, f1: 7200, q: 2, d, a: d * .95, swell: true, g: .16 });
    [1, 1.5, 2].forEach(m => tone({ to: o, type: 'sawtooth', f: b * m, d: d + .05, a: d * .9, swell: true, g: .035, lp: 380, lp1: 4200 }));
    hiss({ to: o, brown: true, type: 'lowpass', f: 130, d, a: d * .8, swell: true, g: .3 });
    tone({ to: o, f: b, f1: b * 4, d, a: d * .9, swell: true, g: .035 });
  },
  lock(proto, tier = 1) {
    const b = note(proto), o = bus(0, .65, 1, 4.5);
    tone({ to: o, f: 62, f1: 24, d: 1.9, g: .9 });
    tone({ to: o, type: 'triangle', f: 310, f1: 44, d: .26, g: .55, dist: true });
    hiss({ to: o, type: 'highpass', f: 2500, d: .13, g: .45 });
    hiss({ to: o, brown: true, type: 'lowpass', f: 900, f1: 110, d: 1.2, g: .45 });
    const chord = [1, 1.5, 2, 2.5198, 3];
    chord.forEach((m, i) => [-8, 0, 8].forEach(det => tone({ to: o, type: 'sawtooth', f: b * m, d: 2.9 + tier * .3, a: .3, swell: true, g: .016, lp: 900, lp1: 2600, detune: det, t: .04 + i * .01 })));
    [4, 5, 6, 8].forEach((m, i) => tone({ to: o, f: b * m, d: 1.4, g: .032, t: .32 + i * .12 }));
    if (tier >= 3) { [8, 10, 12, 16].forEach((m, i) => tone({ to: o, f: b * m, d: 1.6, g: .022, t: .8 + i * .1 })); [0, .18, .36, .54].forEach(t => tone({ to: o, f: 96, f1: 50, d: .3, g: .22, t: 1 + t })); }
  },
  dissolve(x) {
    const o = bus(panAt(x), .4, 1, 1.5);
    hiss({ to: o, f: 5400, q: 1.4, d: .75, a: .08, g: .08 });
    for (let i = 0; i < 5; i++) hiss({ to: o, f: rnd(2600, 4200), q: 3, d: .03, g: .05, t: rnd(.05, .5) });
    tone({ to: o, f: 2600, d: .55, g: .018, t: .05 });
  },
  draw(x) { const o = bus(panAt(x), .12, 1, .6); hiss({ to: o, f: 2000, f1: 3900, q: 1.4, d: .1, a: .02, g: .09 }); tone({ to: o, type: 'square', f: 3000, d: .012, g: .015, lp: 6000 }); },
  burn(x) { const o = bus(panAt(x), .25, 1, 1); hiss({ to: o, f: 3800, q: 1.4, d: .4, a: .03, g: .08 }); tone({ to: o, f: 140, f1: 70, d: .18, g: .12 }); },
  turn(mine) { const o = bus(0, .4, 1, 1.5); hiss({ to: o, f: 600, f1: 2400, q: 1.2, d: .5, a: .22, swell: true, g: .06 }); tone({ to: o, f: mine ? 587.3 : 440, d: .6, g: .025, t: .18 }); tone({ to: o, f: mine ? 880 : 659.3, d: .6, g: .02, t: .26 }); },
  victory() { const o = bus(0, .6, 1, 4); tone({ to: o, f: 56, f1: 24, d: 2.2, g: .8 }); hiss({ to: o, brown: true, type: 'lowpass', f: 700, f1: 90, d: 1.6, g: .4 }); [1, 1.5, 2, 3, 4, 5, 6].forEach((m, i) => tone({ to: o, f: 196 * m, d: 2.6, a: .2, swell: true, g: .02, t: .2 + i * .04 })); },
};
const THROTTLE = { impact: 45, shatter: 70, slam: 50, draw: 45, flip: 60, charge: 90, launch: 50, cast: 140, dissolve: 80, whoosh: 40, burn: 60 };
function sfx(name, ...args) {
  if (!auReady()) return;
  const t = now(); if (AU.last[name] && t - AU.last[name] < (THROTTLE[name] || 35)) return; AU.last[name] = t;
  safe(() => SND[name](...args));
}
function duck(sec, depth) { safe(() => window.COMPILE_AUDIO?.duck?.(sec, depth)); }
function auApplyVolume() { if (AU.ctx && AU.out) safe(() => AU.out.gain.setTargetAtTime(auVol() * .9, AU.ctx.currentTime, .03)); }

/* ═════════════════════════ THEMES ═════════════════════════ */
/* Each protocol: projectile archetype, impact archetype, audio family and launch sound. */
const ARCH = {
  FIRE: { proj: 'comet', hit: 'explosion', el: 'fire', launch: 'heavy' }, WAR: { proj: 'missile', hit: 'explosion', el: 'war', launch: 'heavy', heavy: true },
  WATER: { proj: 'stream', hit: 'splash', el: 'water', launch: 'soft' }, ICE: { proj: 'shards', hit: 'freeze', el: 'ice', launch: 'zap' },
  LIFE: { proj: 'vine', hit: 'bloom', el: 'nature', launch: 'soft' }, PEACE: { proj: 'wisp', hit: 'bloom', el: 'nature', launch: 'soft', calm: true },
  DEATH: { proj: 'scythe', hit: 'void', el: 'dark', launch: 'heavy' }, FEAR: { proj: 'tendril', hit: 'dread', el: 'dark', launch: 'soft' },
  DARKNESS: { proj: 'tendril', hit: 'void', el: 'dark', launch: 'soft' }, CORRUPTION: { proj: 'tendril', hit: 'rot', el: 'dark', launch: 'soft' },
  LIGHT: { proj: 'judgement', hit: 'nova', el: 'light', launch: 'zap' }, CLARITY: { proj: 'prism', hit: 'nova', el: 'light', launch: 'zap', prism: true },
  COURAGE: { proj: 'lance', hit: 'nova', el: 'light', launch: 'zap' }, METAL: { proj: 'rail', hit: 'sparks', el: 'metal', launch: 'zap' },
  MIRROR: { proj: 'prism', hit: 'reflect', el: 'psychic', launch: 'zap' }, SPEED: { proj: 'dash', hit: 'slash', el: 'speed', launch: 'zap' },
  LUCK: { proj: 'coin', hit: 'fortune', el: 'luck', launch: 'soft' }, SPIRIT: { proj: 'souls', hit: 'wisp', el: 'spirit', launch: 'soft' },
  PSYCHIC: { proj: 'psywave', hit: 'mind', el: 'psychic', launch: 'soft' }, CHAOS: { proj: 'glitch', hit: 'glitch', el: 'chaos', launch: 'zap' },
  GRAVITY: { proj: 'singularity', hit: 'collapse', el: 'gravity', launch: 'heavy' }, TIME: { proj: 'clock', hit: 'clock', el: 'time', launch: 'soft' },
  PLAGUE: { proj: 'spore', hit: 'miasma', el: 'toxic', launch: 'soft' }, SMOKE: { proj: 'smog', hit: 'smog', el: 'toxic', launch: 'soft' },
};
const THEMES = new Map();
function theme(protocol) {
  const key = ARCH[protocol] ? protocol : 'SPIRIT';
  if (THEMES.has(key)) return THEMES.get(key);
  const m = safe(() => (typeof pmeta === 'function' ? pmeta(key) : null), null) || {};
  const pal = (m.pal || ['#101018', '#2a2f5a', '#5a6ab0', '#a8b8ff', '#f0f4ff']).map(hex);
  const ac = vivid(hex(m.ac || '#9fb4ff'), 1.3);
  const th = { name: key, ...ARCH[key], ac, pop: vivid(hex(m.pop || '#ffffff'), 1.2), pal, hot: mixc(ac, WHITE, .45), deep: vivid(pal[2], 1.2), core: mixc(pal[4], WHITE, .6) };
  THEMES.set(key, th); return th;
}
const GOLD = { name: 'GOLD', proj: 'lance', hit: 'nova', el: 'light', ac: [1, .78, .38], pop: [1, .93, .72], hot: [1, .9, .66], deep: [.75, .45, .12], core: [1, .97, .88], pal: [[.1, .07, .02], [.4, .26, .06], [.78, .52, .16], [1, .8, .42], [1, .96, .84]] };
const NEUTRAL = () => theme('SPIRIT');

/* ═════════════════════════ DOM HELPERS ═════════════════════════ */
const center = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
/* a card's visual radius, driven by its short side so wide desktop strips don't get giant halos */
const cardR = r => clamp(Math.min(r.width, r.height) * .85 + Math.abs(r.width - r.height) * .05, 24, 110);
const rectOf = el => { const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null; return r && r.width > 0 && r.height > 0 ? r : null; };
const cssId = s => (window.CSS && CSS.escape) ? CSS.escape(String(s)) : String(s).replace(/"/g, '\\"');
const elByCid = cid => cid ? document.querySelector(`#gameMain [data-cid="${cssId(cid)}"]`) : null;
const near = (a, b, tol = 24) => !!a && !!b && Math.abs(center(a).x - center(b).x) < Math.max(tol, a.width / 2 + b.width / 2) && Math.abs(center(a).y - center(b).y) < Math.max(tol, a.height / 2 + b.height / 2);
const inside = (pt, r, pad = 6) => !!pt && !!r && pt.x >= r.left - pad && pt.x <= r.right + pad && pt.y >= r.top - pad && pt.y <= r.bottom + pad;
function schedule(ms, fn) { const id = setTimeout(() => { TIMERS.delete(id); if (active()) safe(fn); }, Math.max(0, ms)); TIMERS.add(id); return id; }
const TIMERS = new Set();
const PENDING = new Set();
function blocking(ms) {
  let res, timer = 0; const p = new Promise(r => { res = r; });
  const done = () => { if (PENDING.delete(done)) { clearTimeout(timer); res(); } };
  timer = setTimeout(done, Math.max(0, ms)); PENDING.add(done);
  return { promise: p, done };
}
function resolvePending() { for (const f of [...PENDING]) f(); for (const id of TIMERS) clearTimeout(id); TIMERS.clear(); }

/* art images for snapshots */
const ART = new Map();
function artImage(proto) {
  if (!proto) return null;
  let img = ART.get(proto);
  if (!img) { img = new Image(); img.decoding = 'async'; safe(() => { img.src = makeArt(proto, false); }); ART.set(proto, img); }
  return img.complete && img.naturalWidth ? img : null;
}
function preloadArt() { safe(() => { if (!G || !G.players) return; for (const pl of G.players) for (const pr of pl.protocols || []) artImage(pr.name); }); }
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
const css = c => `rgb(${c.map(v => Math.round(sat(v) * 255)).join(',')})`;
/* A faithful-enough painting of a field card for the shatter texture. */
function snapshot(info) {
  const r = info.rect; if (!r) return null;
  const sc = Math.min(2, devicePixelRatio || 1) * (Q().scale >= .66 ? 1 : .7);
  const W = Math.max(8, Math.round(r.width * sc)), H = Math.max(8, Math.round(r.height * sc));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d'); if (!c) return null;
  const th = theme(info.protocol), strip = info.kind === 'strip' || H < 40 * sc;
  roundRect(c, 0, 0, W, H, Math.max(2, Math.min(W, H) * .06)); c.save(); c.clip();
  if (info.faceDown) {
    const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#221c46'); g.addColorStop(1, '#090a1a'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(170,150,255,.16)'; c.lineWidth = Math.max(1, sc);
    for (let x = 0; x < W; x += 9 * sc) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
    for (let y = 0; y < H; y += 9 * sc) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    const s = Math.min(W, H) * .22; c.strokeStyle = 'rgba(200,185,255,.75)'; c.lineWidth = 1.6 * sc; c.beginPath();
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU - Math.PI / 2; c.lineTo(W / 2 + Math.cos(a) * s, H / 2 + Math.sin(a) * s); } c.closePath(); c.stroke();
  } else {
    const img = artImage(info.protocol);
    if (img) { const ir = img.naturalWidth / img.naturalHeight, cr = W / H; let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0; if (ir > cr) { sw = sh * cr; sx = (img.naturalWidth - sw) / 2; } else { sh = sw / cr; sy = (img.naturalHeight - sh) * .35; } c.drawImage(img, sx, sy, sw, sh, 0, 0, W, H); }
    else { const g = c.createLinearGradient(0, 0, W * .3, H); g.addColorStop(0, css(th.pal[2])); g.addColorStop(.5, css(th.pal[1])); g.addColorStop(1, css(th.pal[0])); c.fillStyle = g; c.fillRect(0, 0, W, H); }
    const shade = c.createLinearGradient(0, 0, 0, H); shade.addColorStop(0, 'rgba(4,10,16,.25)'); shade.addColorStop(1, 'rgba(4,10,16,.55)'); c.fillStyle = shade; c.fillRect(0, 0, W, H);
    const hh = strip ? H : Math.min(H * .24, 30 * sc);
    c.fillStyle = 'rgba(6,16,24,.72)'; c.fillRect(0, 0, W, hh);
    c.fillStyle = 'rgba(8,18,26,.82)'; c.fillRect(hh * .12, hh * .12, hh * .76, hh * .76);
    c.fillStyle = '#eef6fa'; c.textBaseline = 'middle'; c.textAlign = 'center';
    c.font = `600 ${Math.round(hh * .62)}px ui-monospace,monospace`; c.fillText(String(info.value ?? ''), hh * .5, hh * .54);
    c.textAlign = 'left'; c.font = `900 ${Math.round(hh * .42)}px "Arial Black",Arial,sans-serif`; c.fillText(String(info.protocol || ''), hh * 1.1, hh * .54);
    if (!strip) { c.fillStyle = 'rgba(7,17,26,.78)'; for (let k = 0; k < 2; k++) { const y = hh + (H - hh) * (.18 + k * .38); c.fillRect(W * .07, y, W * .86, (H - hh) * .26); } }
  }
  c.restore();
  c.strokeStyle = info.faceDown ? 'rgba(170,150,255,.6)' : css(mixc(th.ac, WHITE, .3)); c.lineWidth = Math.max(1, 1.2 * sc);
  roundRect(c, .5, .5, W - 1, H - 1, Math.max(2, Math.min(W, H) * .06)); c.stroke();
  return cv;
}
function cardInfo(el, data) {
  const rect = rectOf(el); if (!rect) return null;
  const kind = el.classList.contains('sstrip') ? 'strip' : el.classList.contains('hfan') ? 'hand' : 'top';
  return { rect, kind, protocol: data.protocol, value: data.value, faceDown: !!data.faceDown, cid: data.id || data.cid };
}

/* hidden real cards (while a ghost flies to their place) */
const HIDDEN = new Map();
function hideCid(cid, until) { if (!cid) return; HIDDEN.set(cid, until); applyHidden(); setTimeout(applyHidden, Math.max(0, until - now()) + 30); }
function applyHidden() {
  const t = now();
  for (const [cid, until] of HIDDEN) { const el = elByCid(cid); if (t >= until) { HIDDEN.delete(cid); if (el) el.style.visibility = ''; } else if (el) el.style.visibility = 'hidden'; }
}
function revealCid(cid) { HIDDEN.delete(cid); const el = elByCid(cid); if (el) el.style.visibility = ''; }
function releaseHidden() { for (const cid of [...HIDDEN.keys()]) revealCid(cid); }

/* ghost cards: DOM clones that physically fly between zones */
const GHOSTS = new Set();
let ghostRoot = null;
function ghostLayer() { if (!ghostRoot || !ghostRoot.isConnected) { ghostRoot = document.createElement('div'); ghostRoot.id = 'vfxCards'; ghostRoot.setAttribute('aria-hidden', 'true'); document.body.append(ghostRoot); } return ghostRoot; }
function cloneCard(el) {
  const c = el.cloneNode(true);
  c.removeAttribute('data-cid'); c.querySelectorAll('[data-cid]').forEach(n => n.removeAttribute('data-cid'));
  c.classList.remove('cin-new-card', 'flipin', 'fxhl', 'selected', 'movingcard', 'vfx-hit', 'vfx-cast');
  c.style.visibility = ''; c.style.animation = 'none'; c.style.margin = '0';
  return c;
}
function ghostFly(o) {
  if (!o.from) return null;
  const layer = ghostLayer(), node = document.createElement('div');
  node.className = 'vfx-ghost' + (o.cls ? ' ' + o.cls : '');
  const inner = o.node || (o.el ? cloneCard(o.el) : null); if (inner) node.append(inner);
  layer.append(node);
  const g = { node, o, t0: now() + (o.delay || 0), dur: Math.max(60, o.dur || 320), trail: null, done: false, last: null };
  if (o.hideCid) hideCid(o.hideCid, g.t0 + g.dur + 40);
  g.tick = (sdt, dt, t, abort) => ghostStep(g, abort);
  GHOSTS.add(g); TICKERS.add(g.tick); ghostStep(g, false); wake();
  return g;
}
function ghostTarget(g) { const el = g.o.toCid ? elByCid(g.o.toCid) : null; const r = rectOf(el); if (r) { g.o.toRect = r; return r; } return g.o.toRect; }
function ghostStep(g, abort) {
  if (g.done) return false;
  if (abort) { ghostFinish(g); return false; }
  const o = g.o, el = now() - g.t0;
  if (el < 0) { g.node.style.opacity = '0'; return true; }
  const to = ghostTarget(g) || o.from, k = sat(el / g.dur), e = (o.ease || E.inOut)(k);
  const W = o.size ? o.size.w : to.width, H = o.size ? o.size.h : to.height;
  if (g.node.__w !== W || g.node.__h !== H) { g.node.style.width = W + 'px'; g.node.style.height = H + 'px'; g.node.__w = W; g.node.__h = H; }
  const p0 = center(o.from), p1 = center(to);
  const cx = (p0.x + p1.x) / 2 + (o.arcX || 0), cy = Math.min(p0.y, p1.y) - (o.arc ?? 70);
  const x = (1 - e) * (1 - e) * p0.x + 2 * (1 - e) * e * cx + e * e * p1.x, y = (1 - e) * (1 - e) * p0.y + 2 * (1 - e) * e * cy + e * e * p1.y;
  const s0 = (o.from.width / Math.max(1, W)) * (o.startScale ?? 1), s1 = o.endScale ?? (o.size ? clamp(to.width / Math.max(1, W), .3, 1) : 1);
  const s = lerp(s0, s1, E.outCubic(k)) * (1 + Math.sin(k * Math.PI) * (o.lift ?? .1));
  const rot = lerp(o.spin || 0, 0, E.outCubic(k));
  g.node.style.transform = `translate3d(${(x - W / 2).toFixed(1)}px,${(y - H / 2).toFixed(1)}px,0) rotate(${rot.toFixed(2)}deg) scale(${s.toFixed(4)})`;
  g.node.style.opacity = String(o.fadeOut ? 1 - smooth(.6, 1, k) : Math.min(1, k / .06));
  if (o.trail && active()) {
    if (!g.trail) g.trail = trail({ w: o.trail.w ?? 5, col: o.trail.col, i: o.trail.i ?? 1.4, len: o.trail.len ?? .16, sty: o.trail.sty || [.6, 2.4, .8, .02] });
    trailPush(g.trail, x, y);
    if (o.trail.sparks && Math.random() < .6) P({ x, y, r: 6, speed: [10, 50], life: [.25, .5], size: [1, 2], col: o.trail.col, i: [2, 3.5], tile: TILE.glow, drag: 2, fin: .1 });
  }
  g.last = { x, y, W, H, to };
  if (k >= 1) { ghostFinish(g, true); return false; }
  return true;
}
function ghostFinish(g, landed = false) {
  if (g.done) return; g.done = true; GHOSTS.delete(g); TICKERS.delete(g.tick);
  if (g.trail) g.trail.released = true;
  if (g.o.hideCid) revealCid(g.o.hideCid);
  if (landed && g.o.onLand) safe(() => g.o.onLand(ghostTarget(g) || g.o.toRect, g));
  const node = g.node;
  if (landed && g.o.fadeOut) node.remove(); else requestAnimationFrame(() => node.remove());
}

/* labels (damage-number style) */
let labelRoot = null;
function labelLayer() { if (!labelRoot || !labelRoot.isConnected) { labelRoot = document.createElement('div'); labelRoot.id = 'vfxLabels'; labelRoot.setAttribute('aria-hidden', 'true'); document.body.append(labelRoot); } return labelRoot; }
function label(rect, text, color, delay = 0) {
  if (!rect) return;
  const d = document.createElement('div'), c = center(rect), s = String(text || '');
  d.className = 'vfx-label'; d.textContent = s; d.style.setProperty('--lc', color || '#fff');
  d.dataset.kind = /削除/.test(s) ? 'destroy' : /戻す/.test(s) ? 'return' : /反転/.test(s) ? 'flip' : /ドロー/.test(s) ? 'draw' : /捨て/.test(s) ? 'discard' : /移動/.test(s) ? 'move' : /裏向き/.test(s) ? 'hidden' : 'info';
  d.style.left = c.x + 'px'; d.style.top = c.y + 'px'; if (delay) d.style.animationDelay = delay + 'ms';
  labelLayer().append(d); setTimeout(() => d.remove(), 1500 + delay);
}
function recoil(el, dx, dy, power = 1) {
  if (!el || !el.animate) return;
  const m = 6 * power, rx = (dx * m).toFixed(1), ry = (dy * m).toFixed(1);
  safe(() => el.animate([
    { transform: 'none', filter: 'none' },
    { transform: `translate(${rx}px,${ry}px) rotate(${(dx * 2.4 * power).toFixed(2)}deg) scale(.97)`, filter: 'brightness(2.4) saturate(1.4)', offset: .16 },
    { transform: `translate(${(-rx * .25).toFixed(1)}px,${(-ry * .25).toFixed(1)}px)`, filter: 'brightness(1.25)', offset: .55 },
    { transform: 'none', filter: 'none' }], { duration: D(440), easing: 'cubic-bezier(.2,.8,.2,1)' }));
}
function squash(el, power = 1) {
  if (!el || !el.animate) return;
  safe(() => el.animate([
    { transform: `scale(${1 + .07 * power},${1 - .09 * power})`, filter: 'brightness(2)' },
    { transform: `scale(${1 - .02 * power},${1 + .025 * power})`, filter: 'brightness(1.3)', offset: .45 },
    { transform: 'none', filter: 'none' }], { duration: D(300), easing: 'cubic-bezier(.2,.9,.25,1)' }));
}

/* ═════════════════════════ EFFECT PRIMITIVES ═════════════════════════ */
const env1 = k => Math.pow(1 - k, 1.6);
const envIn = (a = .15) => k => k < a ? k / a : Math.pow(1 - (k - a) / (1 - a), 1.4);
const capI = (size, i, k) => Math.min(i, Math.max(.55, k / Math.max(1, size)));
function glowAt(x, y, size, col, i, life = .3, layer = 1, p = [4.5, .4]) { i = capI(size, i, 95); return shape({ kind: K.glow, x, y, size, col, i, p, life, env: k => Math.pow(1 - k, 2), layer }); }
function shock(x, y, col, R, o = {}) {
  const th = o.th ?? .045;
  return shape({ kind: K.ring, x, y, hw: R, hh: R * (o.squash ?? 1), col, i: o.i ?? 2.2, dark: o.dark || 0, life: o.life ?? .45, layer: o.layer ?? 1,
    p: [0, th, o.noise ?? .06, o.fill ?? .2], rot: o.rot || 0,
    upd: (s, k) => { const e = (o.ease || E.outCubic)(k); s.p[0] = o.reverse ? .95 - e * .9 : .04 + e * .9; s.p[1] = th * (1 - k * .55); }, env: o.env || (k => Math.pow(1 - k, 1.4)) });
}
function streakFlare(x, y, col, len, i = 3, life = .3, rot = 0, thin = 90) { i = capI(len, i, 300); return shape({ kind: K.streak, x, y, hw: len, hh: len * .12, rot, col, i, p: [thin, 1.8, 30, 0], life, env: k => Math.pow(1 - k, 1.8), layer: 1 }); }
function crossFlare(x, y, col, size, i = 3, life = .35, rot = 0) { i = capI(size, i, 150); return shape({ kind: K.cross, x, y, size, col, i, p: [26, 2.2, 40, rot], life, env: k => Math.pow(1 - k, 1.5), layer: 1, upd: (s, k) => { s.p[3] = rot + k * .35; } }); }
function sparks(x, y, n, col, o = {}) {
  B(n, { x, y, r: o.r ?? 10, ang: o.ang ?? [0, TAU], speed: o.speed ?? [260, 760], life: o.life ?? [.22, .55], size: o.size ?? [1.1, 2.2], grow: .35, pre: o.pre ?? [0, .035],
    col, i: o.i ?? [2.2, 4.2], col1: o.col1 || mulc(col, .45), i1: o.i1 ?? .6, tile: TILE.streak, stretch: o.stretch ?? .032, drag: o.drag ?? 2.6, grav: o.grav ?? 520, fin: .07, fpow: 1.1 });
}
function embers(x, y, n, col, o = {}) {
  B(n, { x, y, r: o.r ?? 24, ang: o.ang ?? [-Math.PI * .85, -Math.PI * .15], speed: o.speed ?? [30, 140], life: o.life ?? [.7, 1.6], size: o.size ?? [1.2, 2.6], grow: .4,
    col, i: o.i ?? [2.5, 5], col1: o.col1 || mulc(col, .5), i1: .4, tile: TILE.ember, drag: 1.4, grav: o.grav ?? -60, turb: o.turb ?? 220, fin: .08, fpow: 1.3 });
}
function smoke(x, y, n, o = {}) {
  B(n, { x, y, r: o.r ?? 16, ang: o.ang ?? [0, TAU], speed: o.speed ?? [20, 90], life: o.life ?? [.9, 1.8], size: o.size ?? [14, 26], grow: o.grow ?? [2, 3.2],
    col: o.col || BLACK, i: o.i ?? 0, col1: o.col1, i1: o.i1, dark: o.dark ?? [.25, .45], dark1: 0, tile: TILE.smoke, drag: 1.8, grav: o.grav ?? -45, turb: o.turb ?? 60, spin: [-.8, .8], fin: .12, fpow: 1.2 });
}
function puffs(x, y, n, col, o = {}) {
  B(n, { x, y, r: o.r ?? 10, ang: o.ang ?? [0, TAU], speed: o.speed ?? [40, 160], life: o.life ?? [.35, .8], size: o.size ?? [10, 22], grow: o.grow ?? [1.8, 2.8],
    col, i: o.i ?? [.5, 1.1], col1: o.col1 || mulc(col, .3), i1: .2, tile: o.tile ?? TILE.smoke, drag: 2.4, grav: o.grav ?? -30, turb: o.turb ?? 40, spin: [-1, 1], fin: .06, fpow: 1.3 });
}
function motes(x, y, n, col, o = {}) {
  B(n, { x, y, r: o.r ?? 30, ang: o.ang ?? [0, TAU], speed: o.speed ?? [10, 70], life: o.life ?? [.6, 1.4], size: o.size ?? [1.4, 3], grow: o.grow ?? .5,
    col, i: o.i ?? [1, 2.2], tile: o.tile ?? TILE.glow, drag: 1.2, grav: o.grav ?? -30, turb: o.turb ?? 90, fin: .2, fpow: 1.2, spin: o.spin });
}
function gather(x, y, n, col, radius, life, o = {}) {
  const k = Math.max(1, Math.round(n * Q().density));
  for (let j = 0; j < k; j++) {
    const a = rnd(TAU), rr = rnd(radius * .55, radius);
    P({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr * .85, ang: a + Math.PI / 2 * (o.swirl ?? 1) + Math.PI, speed: [40, 130], att: { x, y, k: [34, 58] }, drag: 3.4,
      life: [life * .65, life], size: o.size ?? [1, 2.1], col, i: o.i ?? [2.2, 4.5], tile: o.tile ?? TILE.streak, stretch: .045, fin: .3, fpow: .7 });
  }
}
function magicCircle(x, y, R, col, life, o = {}) {
  return shape({ kind: K.circle, x, y, hw: R, hh: R * (o.squash ?? 1), col, i: o.i ?? 1.5, life, layer: o.layer ?? 0, owner: o.owner || null,
    p: [0, 0, rnd(100), o.thick ?? 1], q: [rnd(), 0, 0, 0],
    upd: (s, k) => { s.p[0] = (o.spin ?? 1.4) * s.t; s.p[1] = Math.min(1, E.outCubic(sat(k / (o.draw ?? .35)))); s.q[1] = .5 + .5 * Math.sin(s.t * 9); const g = o.grow ? lerp(.7, 1, E.outCubic(sat(k / .4))) : 1; s.hw = R * g; s.hh = R * g * (o.squash ?? 1); },
    env: o.env || envIn(.12) });
}
/* direction & geometry */
const dirTo = (a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return { x: dx / l, y: dy / l, l, ang: Math.atan2(dy, dx) }; };
function bez(a, b, bend) { const d = dirTo(a, b), nx = -d.y, ny = d.x, c = { x: (a.x + b.x) / 2 + nx * bend, y: (a.y + b.y) / 2 + ny * bend }; return k => ({ x: (1 - k) * (1 - k) * a.x + 2 * (1 - k) * k * c.x + k * k * b.x, y: (1 - k) * (1 - k) * a.y + 2 * (1 - k) * k * c.y + k * k * b.y }); }
/* wall-clock flight: calls step(pos,k) each frame for T seconds */
function flight(T, path, step, end) {
  const t0 = now(), ms = Math.max(30, T * 1000); let prevP = null;
  const tick = (sdt, dt, t, abort) => {
    if (abort) return false;
    const k = sat((now() - t0) / ms), p = path(k);
    safe(() => step(p, k, dt, prevP || p)); prevP = p;
    if (k >= 1) { if (end) safe(() => end(p)); return false; }
    return true;
  };
  TICKERS.add(tick); wake();
}
const accel = k => k * k * .45 + k * .55;
/* call fn at points spaced along prev→p (fills the gap a fast projectile leaves between frames) */
function along(a, b, spacing, fn) {
  if (!a || !b || typeof a !== 'object') return fn(b.x, b.y, 1);
  const dx = b.x - a.x, dy = b.y - a.y, n = Math.max(1, Math.min(10, Math.ceil(Math.hypot(dx, dy) / spacing)));
  for (let j = 1; j <= n; j++) fn(a.x + dx * j / n, a.y + dy * j / n, j / n);
}

/* ═════════════════════════ PROJECTILES ═════════════════════════ */
const stamp = o => P({ ...o, life: o.life ?? .026, fin: .0001, fpow: .01, speed: 0, bright: true });
const spectrum = h => { const k = n => sat(Math.abs(((h * 6 + n) % 6) - 3) - 1); return [k(0), k(4), k(2)].map(v => v * .85 + .15); };
const later = (s, fn) => schedule(s * 1000, fn);
const PROJ = {
  comet(th, a, b, T) {
    const path = bez(a, b, rnd(-36, 36)), head = { ...a }, d = dirTo(a, b), fire0 = [1, .86, .55], fire1 = mixc(th.ac, [.8, .12, .02], .5);
    const tr = trail({ w: 8, col: th.ac, i: 2.4, len: .13, sty: [.95, 3.4, 1.2, .034] });
    shape({ kind: K.glow, x: a.x, y: a.y, size: 30, col: th.hot, i: 3.2, p: [5, 2], life: T + .05, layer: 1, follow: () => head });
    flight(T, k => path(accel(k)), (p, k, dt, pp) => {
      head.x = p.x; head.y = p.y; trailPush(tr, p.x, p.y);
      along(pp, p, 5 / Math.max(.5, Q().density), (x, y) => P({ x, y, r: 4, ang: d.ang + Math.PI + rnd(-.6, .6), speed: [30, 120], life: [.2, .42], size: [6, 11], grow: [1.4, 2.1],
        col: fire0, i: [1.4, 2.4], col1: fire1, i1: .3, dark1: .25, tile: TILE.smoke, drag: 2.2, grav: -90, turb: 140, spin: [-2, 2], fin: .05, fpow: 1.1 }));
      if (Math.random() < .6) P({ x: p.x, y: p.y, r: 6, ang: d.ang + Math.PI + rnd(-1, 1), speed: [60, 200], life: [.3, .7], size: [1, 2], col: th.pop, i: [3, 5], tile: TILE.ember, drag: 1.5, grav: -80, turb: 200 });
    }, () => { tr.released = true; });
  },
  missile(th, a, b, T) {
    const d = dirTo(a, b), base = bez(a, b, rnd(-50, 50)), head = { ...a };
    const path = k => { const p = base(accel(k)), w = Math.sin(k * 18) * 5 * (1 - k); return { x: p.x - d.y * w, y: p.y + d.x * w }; };
    const tr = trail({ w: 6, col: th.ac, i: 2.6, len: .1, sty: [.7, 3, 1.4, .04] });
    shape({ kind: K.glow, x: a.x, y: a.y, size: 24, col: [1, .9, .7], i: 3.5, p: [6, 2], life: T + .05, layer: 1, follow: () => head });
    flight(T, path, (p, k, dt, pp) => {
      head.x = p.x; head.y = p.y; trailPush(tr, p.x, p.y);
      along(pp, p, 7 / Math.max(.5, Q().density), (x, y) => {
        P({ x, y, r: 3, ang: d.ang + Math.PI + rnd(-.3, .3), speed: [30, 80], life: [.6, 1.2], size: [6, 10], grow: [2.2, 3.4], col: BLACK, i: 0, dark: [.3, .5], dark1: 0, tile: TILE.smoke, drag: 2, grav: -30, turb: 70, fin: .1, fpow: 1.2 });
        P({ x, y, r: 3, ang: d.ang + Math.PI + rnd(-.4, .4), speed: [80, 160], life: [.1, .22], size: [5, 8], grow: 1.5, col: [1, .7, .3], i: [1.8, 3], col1: [.9, .2, .05], i1: .4, tile: TILE.smoke, drag: 3, fin: .02 });
      });
    }, () => { tr.released = true; });
  },
  stream(th, a, b, T) {
    const base = bez(a, b, rnd(-50, 50)), d = dirTo(a, b), t0 = now(); let head = 0;
    const wob = (u, ph, amp) => { const p = base(u), w = Math.sin(u * 9 - (now() - t0) / 90 + ph) * amp * Math.sin(u * Math.PI); return [p.x - d.y * w, p.y + d.x * w]; };
    const life = T + .45, fade = k => 1 - smooth(.8, 1, k);
    const build = ph => (k, t, out) => { const h = Math.min(1, head), tail = Math.max(0, (t - T) / .45), n = 26; for (let j = 0; j <= n; j++) { const u = lerp(tail, h, j / n), [x, y] = wob(u, ph, 13); out.push([x, y, .35 + .65 * Math.sin(Math.min(1, j / n) * Math.PI * .5 + .2), 1]); } };
    pathRib({ build: build(0), w: 9, col: th.ac, i: 2.1, life, sty: [1, 3.2, 1.2, .026], env: fade });
    pathRib({ build: build(2.1), w: 4, col: th.core, i: 1.8, life, sty: [.6, 4, 1.4, .04], env: fade });
    flight(T, k => base(k), (p, k) => {
      head = k; const [x, y] = wob(k, 0, 13);
      for (let j = 0; j < 2; j++) P({ x, y, r: 4, ang: d.ang + Math.PI / 2 * (Math.random() < .5 ? 1 : -1) + rnd(-.5, .5), speed: [60, 190], life: [.35, .65], size: [1.6, 3], col: th.core, i: [1.8, 3], tile: TILE.drop, stretch: .02, grav: 700, drag: .8 });
      if (Math.random() < .35) puffs(x, y, 1, mixc(th.ac, WHITE, .5), { size: [6, 10], i: [.35, .6], speed: [10, 40] });
    });
  },
  shards(th, a, b, T) {
    const col = mixc(th.ac, WHITE, .35);
    [-70, -25, 25, 70].forEach((bend, j) => {
      const start = j * .1 * T, dur = T - start;
      later(start, () => {
        const path = bez(a, b, bend + rnd(-10, 10)), tr = trail({ w: 3, col, i: 2, len: .09, sty: [.3, 2, 1.5, .05] }); let prev = { ...a };
        flight(dur, k => path(E.inQuad(k) * .4 + k * .6), p => {
          const ang = Math.atan2(p.y - prev.y, p.x - prev.x); prev = p;
          stamp({ x: p.x, y: p.y, size: 12, asp: .5, rot: ang, col: WHITE, i: 2.8, tile: TILE.shard });
          stamp({ x: p.x, y: p.y, size: 15, col, i: 1.1, tile: TILE.glow }); trailPush(tr, p.x, p.y);
          if (Math.random() < .45) P({ x: p.x, y: p.y, r: 4, speed: [10, 40], life: [.3, .6], size: [1.6, 3], col: WHITE, i: [2, 4], tile: Math.random() < .5 ? TILE.star : TILE.flake, spin: [-3, 3], drag: 2, grav: 40 });
        }, () => { tr.released = true; });
      });
    });
  },
  vine(th, a, b, T) {
    const base = bez(a, b, rnd(-60, 60)), d = dirTo(a, b), ph = rnd(TAU); let head = 0, lastLeaf = 0;
    const at = u => { const p = base(u), w = Math.sin(u * 14 + ph) * 10 * Math.sin(u * Math.PI); return { x: p.x - d.y * w, y: p.y + d.x * w }; };
    pathRib({ build: (k, t, out) => { const n = 28; for (let j = 0; j <= n; j++) { const p = at(head * j / n); out.push([p.x, p.y, .45 + .55 * (j / n), 1]); } }, w: 4.5, col: th.ac, i: 1.9, life: T + .5, sty: [.5, 1.6, 1, .03], env: k => 1 - smooth(.75, 1, k) });
    flight(T, k => at(k), (p, k) => {
      head = k;
      if (k - lastLeaf > .07) { lastLeaf = k; P({ x: p.x, y: p.y, r: 3, speed: [20, 70], life: [.6, 1.1], size: [4, 6.5], grow: [.7, 1.1], col: pick([th.ac, th.pop, mixc(th.ac, WHITE, .4)]), i: [1.4, 2.4], tile: TILE.leaf, spin: [-3, 3], drag: 1.6, grav: 70, turb: 80, fin: .1 }); }
      stamp({ x: p.x, y: p.y, size: 16, col: th.hot, i: 2.4, tile: TILE.glow });
      if (Math.random() < .5) motes(p.x, p.y, 1, mixc(th.ac, WHITE, .5), { r: 5, speed: [10, 40], life: [.4, .8] });
    });
  },
  wisp(th, a, b, T) {
    const path = bez(a, b, rnd(-80, 80)), tr = trail({ w: 7, col: th.ac, i: 1.5, len: .22, sty: [.4, 1.2, 1, .02] });
    flight(T, path, p => {
      trailPush(tr, p.x, p.y); stamp({ x: p.x, y: p.y, size: 18, col: th.hot, i: 2.2, tile: TILE.glow }); stamp({ x: p.x, y: p.y, size: 6, col: WHITE, i: 3, tile: TILE.core });
      if (Math.random() < .5) P({ x: p.x, y: p.y, r: 6, speed: [10, 50], life: [.5, 1], size: [2.5, 4], col: pick([th.ac, th.pop]), i: [1.2, 2], tile: TILE.leaf, spin: [-2, 2], drag: 1.5, grav: 30, turb: 90 });
    }, () => { tr.released = true; });
  },
  scythe(th, a, b, T) {
    const path = bez(a, b, rnd(-40, 40)), head = { ...a }, d = dirTo(a, b);
    shape({ kind: K.void, x: a.x, y: a.y, size: 26, col: th.ac, i: 2.4, p: [.55, .1, .9, .12], life: T + .05, layer: 1, follow: () => head });
    shape({ kind: K.slash, x: a.x, y: a.y, size: 38, col: mixc(th.hot, WHITE, .35), i: 2.6, life: T + .05, layer: 1, follow: () => head, p: [.72, .13, 1, 0], q: [0, 0, 4.3, 0], upd: s => { s.q[1] = -s.t * 17; } });
    shape({ kind: K.glow, x: a.x, y: a.y, size: 44, col: th.ac, i: 1.2, p: [3.5, .3], life: T + .05, layer: 0, follow: () => head });
    const tr = trail({ w: 12, col: BLACK, i: 0, dark: .7, len: .22, sty: [.9, 2.4, 0, .03] }), rim = trail({ w: 4, col: th.ac, i: 2.2, len: .16, sty: [.6, 3, 1, .04] });
    flight(T, k => path(accel(k)), p => {
      head.x = p.x; head.y = p.y; trailPush(tr, p.x, p.y); trailPush(rim, p.x, p.y);
    }, () => { tr.released = true; rim.released = true; });
    flight(T, k => path(accel(k)), (p, k, dt, pp) => {
      along(pp, p, 8, (x, y) => P({ x, y, r: 8, ang: d.ang + Math.PI + rnd(-.8, .8), speed: [20, 70], life: [.5, 1], size: [8, 13], grow: [1.8, 2.6], col: BLACK, i: 0, dark: [.35, .55], dark1: 0, tile: TILE.smoke, drag: 2, grav: -20, turb: 80, fin: .1 }));
      if (Math.random() < .6) P({ x: p.x, y: p.y, r: 10, speed: [20, 80], life: [.4, .8], size: [1.5, 3], col: th.hot, i: [2, 4], tile: TILE.glow, drag: 1.4, grav: -60, turb: 160 });
    });
  },
  tendril(th, a, b, T) {
    const d = dirTo(a, b), life = T + .35; let head = 0;
    const rimCol = th.name === 'FEAR' ? mixc(th.pop, [1, .3, .4], .5) : th.name === 'CORRUPTION' ? [1, .25, .3] : th.ac;
    const tips = [];
    for (let j = 0; j < 3; j++) {
      const base = bez(a, b, (j - 1) * 60 + rnd(-15, 15)), ph = rnd(TAU), t0 = now();
      const at = u => { const p = base(u), w = Math.sin(u * 11 + ph + (now() - t0) / 70) * 13 * Math.sin(u * Math.PI); return { x: p.x - d.y * w, y: p.y + d.x * w }; };
      tips.push(at);
      const build = (k, t, out) => { const h = E.outCubic(Math.min(1, head)), tail = Math.max(0, (t - T) / .35), n = 26; for (let q2 = 0; q2 <= n; q2++) { const p = at(lerp(tail, h, q2 / n)); out.push([p.x, p.y, (1 - q2 / n) * .55 + .45, 1]); } };
      pathRib({ build, w: 12, col: BLACK, i: 0, dark: .85, life, sty: [.9, 2.2, 0, .03], env: k => 1 - smooth(.85, 1, k) });
      pathRib({ build, w: 5, col: rimCol, i: 2.4, life, sty: [.85, 3, 1.1, .05], env: k => 1 - smooth(.85, 1, k) });
    }
    flight(T, k => k, k => {
      head = k; const h = E.outCubic(k);
      for (const at of tips) { const p = at(h); stamp({ x: p.x, y: p.y, size: 15, col: rimCol, i: 1.8, tile: TILE.glow }); if (Math.random() < .5) P({ x: p.x, y: p.y, r: 6, speed: [20, 80], life: [.3, .6], size: [1.2, 2.2], col: rimCol, i: [2, 3.5], tile: TILE.glow, drag: 2, turb: 120 }); if (Math.random() < .35) smoke(p.x, p.y, 1, { size: [7, 12], dark: [.3, .45], life: [.5, .9] }); }
    });
  },
  judgement(th, a, b, T) {
    const d = dirTo(a, b);
    shape({ kind: K.beam, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, hw: d.l / 2, hh: 9, rot: d.ang, col: th.hot, i: 2.2, life: T + .2, layer: 1, p: [3, .6, 30, .4], q: [rnd(), 0, 0, d.l / 40],
      upd: s => { const kk = s.t / T; s.q[1] = Math.min(1.05, E.outCubic(sat(kk / .6)) * 1.05); s.q[2] = sat((kk - .85) / .5); } });
    gather(a.x, a.y, 16, th.hot, 60, T * .5);
    later(T * .55, () => shape({ kind: K.pillar, x: b.x, y: b.y / 2, hw: 36, hh: b.y / 2 + 10, col: th.hot, i: 2.6, life: T * .45 + .4, layer: 1, p: [3.5, 2.2, .6, .25], q: [rnd(), 0, 0, 0],
      upd: (s, k) => { s.hw = 36 * (1 - k * .6) + 10; }, env: k => k < .2 ? k / .2 : Math.pow(1 - (k - .2) / .8, 1.5) }));
  },
  prism(th, a, b, T) {
    const mirror = th.name === 'MIRROR';
    let pts = [a, b];
    if (mirror) { const d = dirTo(a, b); pts = [a, { x: (a.x + b.x) / 2 - d.y * 70, y: (a.y + b.y) / 2 + d.x * 70 }, b]; }
    const segs = pts.length - 1;
    for (let j = 0; j < segs; j++) {
      const p0 = pts[j], p1 = pts[j + 1], d = dirTo(p0, p1), t0 = T * j / segs, len = T / segs;
      later(t0, () => {
        shape({ kind: K.beam, x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2, hw: d.l / 2, hh: 8, rot: d.ang, col: mirror ? [.86, .92, 1] : th.hot, i: 2.4, life: len + .3, layer: 1,
          p: [4, .5, 28, .3], q: [rnd(), 0, 0, d.l / 36], upd: s => { s.q[1] = Math.min(1.05, s.t / len); s.q[2] = sat((s.t - len) / .3); } });
        if (j > 0) { crossFlare(p0.x, p0.y, WHITE, 44, 3.2, .38); sparks(p0.x, p0.y, 10, WHITE, { speed: [100, 300], grav: 200 }); sfx('impact', 'ice', .3, p0.x, th.name); }
        flight(len, k => ({ x: lerp(p0.x, p1.x, k), y: lerp(p0.y, p1.y, k) }), p => {
          if (Math.random() < .8) P({ x: p.x, y: p.y, r: 8, speed: [20, 90], life: [.3, .7], size: [2, 4], col: mirror ? WHITE : spectrum(rnd()), i: [2, 4], tile: TILE.star, spin: [-4, 4], drag: 2 });
        });
      });
    }
  },
  lance(th, a, b, T) {
    const d = dirTo(a, b), head = { ...a }, tr = trail({ w: 5, col: th.ac, i: 2.6, len: .12, sty: [.4, 3, 1.4, .05] });
    shape({ kind: K.streak, x: a.x, y: a.y, hw: 36, hh: 7, rot: d.ang, col: th.hot, i: 3.2, p: [60, 1.4, 20, 0], life: T + .03, layer: 1, follow: () => head });
    flight(T, k => ({ x: lerp(a.x, b.x, accel(k)), y: lerp(a.y, b.y, accel(k)) }), p => { head.x = p.x; head.y = p.y; trailPush(tr, p.x, p.y); if (Math.random() < .7) sparks(p.x, p.y, 1, th.pop, { speed: [40, 160], grav: 300, life: [.2, .4] }); }, () => { tr.released = true; });
  },
  rail(th, a, b, T) {
    const d = dirTo(a, b), hot = [1, .86, .62];
    for (let j = 0; j < 3; j++) later(j * .2 * T, () => {
      crossFlare(a.x + d.x * 14, a.y + d.y * 14, hot, 28, 3.5, .14, d.ang);
      sparks(a.x, a.y, 8, hot, { ang: [d.ang - .5, d.ang + .5], speed: [200, 500], grav: 300 }); smoke(a.x, a.y, 2, { size: [6, 10], dark: [.2, .3] });
      sfx('launch', 'zap', a.x, th.name);
      const tr = trail({ w: 2.6, col: hot, i: 3, len: .06, sty: [.2, 4, 1.5, .05] });
      flight(T * .6, k => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) }), p => { stamp({ x: p.x, y: p.y, size: 18, asp: .18, rot: d.ang, col: WHITE, i: 4, tile: TILE.streak }); trailPush(tr, p.x, p.y); },
        () => { tr.released = true; if (j < 2) { sparks(b.x, b.y, 14, hot, { ang: [d.ang + Math.PI - .9, d.ang + Math.PI + .9], speed: [200, 600], grav: 900 }); glowAt(b.x, b.y, 30, hot, 3, .12); sfx('impact', 'metal', .45, b.x, th.name); trauma(.08); } });
    });
  },
  dash(th, a, b, T) {
    const d = dirTo(a, b); let last = 0;
    flight(T, k => { const e = E.inCubic(k) * .5 + k * .5; return { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e) }; }, (p, k) => {
      if (k - last > .12) { last = k; P({ x: p.x, y: p.y, speed: 0, life: .22, size: 28, asp: .2, rot: d.ang, col: th.hot, i: 2.2, tile: TILE.streak, fin: .01, fpow: 2 }); }
      stamp({ x: p.x, y: p.y, size: 36, asp: .14, rot: d.ang, col: WHITE, i: 3.6, tile: TILE.streak });
      for (let j = 0; j < 2; j++) { const off = rnd(-26, 26); P({ x: p.x - d.y * off, y: p.y + d.x * off, ang: d.ang, speed: [500, 900], life: [.1, .2], size: [1, 1.6], col: th.ac, i: [2, 3], tile: TILE.streak, stretch: .05, fin: .01 }); }
    });
  },
  souls(th, a, b, T) {
    for (let j = 0; j < 4; j++) {
      const start = j * .07 * T, bend = (j - 1.5) * 50 + rnd(-20, 20);
      later(start, () => {
        const path = bez(a, b, bend), tr = trail({ w: 8, col: j % 2 ? th.ac : th.pop, i: 2, len: .22, sty: [.55, 1.6, 1.1, .025] });
        flight(T - start, k => path(E.inOut(k)), p => {
          trailPush(tr, p.x, p.y); stamp({ x: p.x, y: p.y, size: 20, col: th.hot, i: 1.9, tile: TILE.glow }); stamp({ x: p.x, y: p.y, size: 6, col: WHITE, i: 3.2, tile: TILE.core });
          if (Math.random() < .4) motes(p.x, p.y, 1, th.ac, { r: 4, speed: [5, 30], life: [.4, .7] });
        }, () => { tr.released = true; });
      });
    }
  },
  psywave(th, a, b, T) {
    const d = dirTo(a, b), t0 = now(), life = T + .3; let head = 0, lastRing = 0;
    for (let j = 0; j < 2; j++) {
      const ph = j * Math.PI;
      pathRib({ build: (k, t, out) => { const h = Math.min(1, head), tail = Math.max(0, (t - T) / .3), n = 34; for (let q2 = 0; q2 <= n; q2++) { const u = lerp(tail, h, q2 / n), w = Math.sin(u * 24 - (now() - t0) / 40 + ph) * 11 * Math.sin(u * Math.PI); out.push([lerp(a.x, b.x, u) - d.y * w, lerp(a.y, b.y, u) + d.x * w, .5 + .5 * q2 / n, 1]); } },
        w: 3, col: j ? th.pop : th.ac, i: 2.2, life, sty: [.3, 3, 1.2, .04], env: k => 1 - smooth(.8, 1, k) });
    }
    flight(T, k => k, k => { head = k; if (k - lastRing > .16) { lastRing = k; shock(lerp(a.x, b.x, k), lerp(a.y, b.y, k), th.ac, 26, { life: .4, th: .08, i: 1.6 }); } });
  },
  glitch(th, a, b, T) {
    const d = dirTo(a, b), life = T + .25, seed = rnd(1000); let head = 0;
    const jag = (u, s) => Math.sin(u * 37 + s) * Math.sin(u * 13.7 + s * 1.7) * 18 * Math.sin(u * Math.PI);
    const mk = (off, col, i, w) => pathRib({ build: (k, t, out) => { const h = Math.min(1, head), tail = Math.max(0, (t - T) / .25), n = 18, s = Math.floor(now() / 45) * 1.37 + seed; for (let q2 = 0; q2 <= n; q2++) { const u = lerp(tail, h, q2 / n), w2 = jag(u, s) + off; out.push([lerp(a.x, b.x, u) - d.y * w2, lerp(a.y, b.y, u) + d.x * w2, 1, 1]); } },
      w, col, i, life, sty: [.2, 6, 1.6, .06], env: k => (Math.random() < .15 ? .3 : 1) * (1 - smooth(.8, 1, k)) });
    mk(3, [1, .15, .3], 2, 3); mk(-3, [.1, .9, 1], 2, 3); mk(0, WHITE, 2.6, 2);
    flight(T, k => k, k => { head = k; if (Math.random() < .8) P({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), r: 14, speed: [20, 120], life: [.15, .4], size: [2, 4], rot: 0, col: pick([[1, .2, .4], [.2, .9, 1], WHITE, th.ac]), i: [2, 4], tile: TILE.bit, drag: 3, fin: .01, fpow: .5 }); });
  },
  singularity(th, a, b, T) {
    const head = { ...a }, path = bez(a, b, rnd(-30, 30));
    shape({ kind: K.spiral, x: a.x, y: a.y, size: 42, col: th.ac, i: 2.2, dark: .9, p: [3, 6, 0, .22], life: T + .05, layer: 1, follow: () => head, upd: s => { s.p[2] = s.t * 14; } });
    shape({ kind: K.void, x: a.x, y: a.y, size: 22, col: th.hot, i: 2, p: [.5, .12, .95, .1], life: T + .05, layer: 1, follow: () => head });
    flight(T, k => path(E.inCubic(k) * .7 + k * .3), p => {
      head.x = p.x; head.y = p.y;
      for (let j = 0; j < 2; j++) { const a2 = rnd(TAU), r = rnd(30, 60); P({ x: p.x + Math.cos(a2) * r, y: p.y + Math.sin(a2) * r, ang: a2 + Math.PI / 2, speed: [60, 120], att: { x: p.x, y: p.y, k: 40 }, drag: 2, life: [.25, .45], size: [1, 2], col: th.hot, i: [2, 4], tile: TILE.streak, stretch: .04 }); }
    });
  },
  clock(th, a, b, T) {
    const head = { ...a }, path = bez(a, b, rnd(-40, 40)), tr = trail({ w: 4, col: th.ac, i: 1.6, len: .2, sty: [.3, 1.5, 1, .03] });
    shape({ kind: K.clock, x: a.x, y: a.y, size: 30, col: th.hot, i: 2.2, p: [0, 0, 1, 0], life: T + .05, layer: 1, follow: () => head, upd: s => { s.p[0] = s.t * 22; s.p[1] = s.t * 4; } });
    flight(T, path, p => { head.x = p.x; head.y = p.y; trailPush(tr, p.x, p.y); if (Math.random() < .5) motes(p.x, p.y, 1, th.ac, { r: 6, speed: [4, 20], life: [.8, 1.4], grav: 0, turb: 20 }); }, () => { tr.released = true; });
  },
  spore(th, a, b, T) {
    for (let j = 0; j < 4; j++) {
      const start = j * .08 * T, tgt = { x: b.x + rnd(-14, 14), y: b.y + rnd(-10, 10) }, lift = Math.max(70, dirTo(a, b).l * .45);
      later(start, () => flight(T - start, k => ({ x: lerp(a.x, tgt.x, k), y: lerp(a.y, tgt.y, k) - Math.sin(k * Math.PI) * lift }), p => {
        stamp({ x: p.x, y: p.y, size: 13, col: th.ac, i: 2.2, tile: TILE.ember }); stamp({ x: p.x, y: p.y, size: 28, col: th.ac, i: .9, tile: TILE.glow }); stamp({ x: p.x - 3, y: p.y - 3, size: 4, col: WHITE, i: 2, tile: TILE.core });
        if (Math.random() < .45) P({ x: p.x, y: p.y, r: 3, speed: [5, 30], life: [.4, .8], size: [1.4, 2.6], col: th.ac, i: [1.4, 2.2], tile: TILE.drop, grav: 500, stretch: .015 });
        if (Math.random() < .3) puffs(p.x, p.y, 1, mixc(th.ac, BLACK, .4), { size: [5, 9], i: [.3, .5], speed: [5, 25] });
      }));
    }
  },
  smog(th, a, b, T) {
    const path = bez(a, b, rnd(-40, 40));
    flight(T, k => path(accel(k)), (p, k, dt, pp) => {
      along(pp, p, 9, (x, y) => smoke(x, y, 1, { size: [8, 14], dark: [.3, .5], speed: [10, 40], life: [.7, 1.3], grav: -20 }));
      along(pp, p, 12, (x, y) => puffs(x, y, 1, [.72, .74, .8], { size: [9, 15], i: [.45, .75], speed: [10, 40] }));
      if (Math.random() < .7) P({ x: p.x, y: p.y, r: 6, speed: [20, 70], life: [.4, .8], size: [1, 2], col: th.pop, i: [2.5, 4], tile: TILE.ember, grav: -60, turb: 160 });
      stamp({ x: p.x, y: p.y, size: 24, col: th.pop, i: 1.3, tile: TILE.glow }); stamp({ x: p.x, y: p.y, size: 7, col: [1, .8, .5], i: 2.6, tile: TILE.core });
    });
  },
  coin(th, a, b, T) {
    for (let j = 0; j < 3; j++) {
      const start = j * .1 * T, bend = (j - 1) * 70 - 40;
      later(start, () => {
        const path = bez(a, b, bend), tr = trail({ w: 3, col: th.ac, i: 1.8, len: .15, sty: [.3, 2, 1.2, .04] });
        flight(T - start, k => path(E.inOut(k)), (p, k) => { trailPush(tr, p.x, p.y); stamp({ x: p.x, y: p.y, size: 12, rot: k * 14, col: [1, .92, .5], i: 3, tile: TILE.star }); if (Math.random() < .5) P({ x: p.x, y: p.y, r: 5, speed: [10, 40], life: [.3, .6], size: [1.5, 3], col: pick([th.ac, [1, .9, .4]]), i: [2, 3.5], tile: TILE.star, spin: [-5, 5] }); }, () => { tr.released = true; });
      });
    }
  },
};
const TRAVEL_MUL = { dash: .55, rail: 1.25, singularity: 1.2, spore: 1.15, judgement: .9, prism: .85, clock: 1.1, tendril: 1.05, vine: 1.1 };

/* ═════════════════════════ IMPACTS ═════════════════════════ */
function hitCore(th, b, pw, o = {}) {
  glowAt(b.x, b.y, 22 * pw + 10, WHITE, 2.8 * pw, .09);
  glowAt(b.x, b.y, 80 * pw + 26, th.ac, 1.1 * pw, .4, 0);
  shock(b.x, b.y, mixc(th.ac, WHITE, .22), 115 * pw + 30, { life: .42, th: o.thin ? .02 : .03, i: 1.7, fill: .14, noise: o.noise ?? .06 });
  if (o.ring2 !== false) shock(b.x, b.y, th.ac, 70 * pw + 20, { life: .3, th: .05, i: 1.1, noise: .14, fill: .08 });
  aberrate(.006 * pw); trauma(.26 * pw); punch(.012 * pw, b.x, b.y); hitstop(42 + 32 * pw);
}
const HIT = {
  explosion(th, b, dir, pw) {
    const P0 = pw * (th.heavy ? 1.35 : 1);
    hitCore(th, b, P0, { noise: .16 });
    B(17 * P0, { x: b.x, y: b.y, r: 12, speed: [60, 240 * P0], life: [.45, .9], size: [9, 16], pre: [0, .03], grow: [1.7, 2.5], col: [1, .52, .14], i: [1.1, 1.9], col1: [.5, .07, .02], i1: .25, dark1: [.4, .6], tile: TILE.smoke, drag: 3.2, grav: -90, turb: 170, spin: [-2, 2], fin: .03, fpow: 1.05 });
    B(5 * P0, { x: b.x, y: b.y, r: 6, speed: [20, 90], life: [.12, .22], size: [6, 10], grow: 1.6, col: [1, .86, .55], i: [1.8, 2.4], col1: [1, .45, .1], i1: .6, tile: TILE.smoke, drag: 4, fin: .02 });
    sparks(b.x, b.y, 34 * P0, [1, .7, .3], { speed: [280, 820], grav: 700 });
    embers(b.x, b.y, 22 * P0, th.pop, { r: 30 });
    later(.09, () => smoke(b.x, b.y - 10, 10 * P0, { size: [16, 28], dark: [.3, .5], life: [1.2, 2] }));
    glowAt(b.x, b.y, 130 * P0, [1, .45, .12], .8, .7, 0);
    if (th.heavy) B(14, { x: b.x, y: b.y, r: 6, speed: [250, 600], life: [.5, .9], size: [2, 3.5], col: [.55, .5, .46], i: .9, tile: TILE.bit, grav: 1100, drag: .8, spin: [-12, 12] });
  },
  splash(th, b, dir, pw) {
    hitCore(th, b, pw);
    B(40 * pw, { x: b.x, y: b.y, r: 6, ang: [-Math.PI * .95, -Math.PI * .05], speed: [200, 560], life: [.5, .9], size: [1.8, 3.4], col: mixc(th.ac, WHITE, .5), i: [1.8, 3.2], tile: TILE.drop, stretch: .022, grav: 1000, drag: .6 });
    puffs(b.x, b.y, 10 * pw, mixc(th.ac, WHITE, .55), { size: [12, 22], i: [.5, .9], speed: [40, 160] });
    for (let j = 0; j < 3; j++) later(j * .08, () => shock(b.x, b.y + 6, th.ac, 70 + j * 30, { squash: .42, life: .7, th: .05, i: 1.6, noise: .1 }));
    B(8 * pw, { x: b.x, y: b.y, r: 20, ang: -Math.PI / 2, speed: [20, 70], life: [.8, 1.4], size: [3, 6], col: th.core, i: [1.2, 2], tile: TILE.bubble, grav: -120, turb: 120 });
  },
  freeze(th, b, dir, pw) {
    const ice = mixc(th.ac, WHITE, .5);
    hitCore(th, b, pw, { ring2: false, thin: true });
    B(22 * pw, { x: b.x, y: b.y, r: 10, speed: [180, 520], life: [.4, .8], size: [6, 11], asp: .45, col: ice, i: [1.6, 2.6], col1: th.ac, i1: .8, tile: TILE.shard, stretch: .006, drag: 2.6, grav: 380, pre: [0, .04] });
    shock(b.x, b.y, th.ac, 120 * pw, { life: .7, th: .07, noise: .22, fill: .3, i: 1.6 });
    B(16 * pw, { x: b.x, y: b.y, r: 44, speed: [10, 50], life: [1, 1.8], size: [3, 6], col: ice, i: [1, 1.8], tile: TILE.flake, spin: [-2, 2], grav: 40, turb: 60, fin: .15 });
    puffs(b.x, b.y, 7 * pw, th.ac, { size: [14, 24], i: [.2, .36], speed: [30, 100], grav: 10 });
    crossFlare(b.x, b.y, ice, 70 * pw, 2.2, .36);
  },
  bloom(th, b, dir, pw) {
    const soft = th.calm ? .7 : 1;
    hitCore(th, b, pw * soft);
    B(28 * pw * soft, { x: b.x, y: b.y, r: 8, speed: [120, 330], life: [.7, 1.3], size: [4, 7.5], grow: [.6, 1], cols: [th.ac, th.pop, mixc(th.ac, WHITE, .4)], i: [1.4, 2.6], tile: TILE.leaf, spin: [-5, 5], drag: 2.2, grav: 60, turb: 120 });
    B(12 * pw, { x: b.x, y: b.y, r: 8, speed: [120, 330], life: [.7, 1.3], size: [4, 7.5], grow: [.6, 1], col: th.pop, i: [1.6, 2.6], tile: TILE.leaf, spin: [-5, 5], drag: 2.2, grav: 60, turb: 120 });
    motes(b.x, b.y, 20 * pw, mixc(th.ac, WHITE, .5), { r: 30, grav: -90, life: [.9, 1.6] });
    shape({ kind: K.circle, x: b.x, y: b.y, size: 70 * pw, col: th.ac, i: 1.3, life: .9, layer: 0, p: [0, 1, rnd(9), 1], upd: (s, k) => { s.p[0] = s.t; s.p[1] = 1; s.hw = s.hh = 50 + 40 * E.outCubic(k); }, env: k => Math.pow(1 - k, 1.4) });
  },
  void(th, b, dir, pw) {
    gather(b.x, b.y, 24, th.hot, 90, .14);
    const vo = shape({ kind: K.void, x: b.x, y: b.y, size: 60 * pw, col: th.ac, i: 2.6, p: [.25, .08, .92, .14], life: .55, layer: 1, upd: (s, k) => { s.p[0] = k < .25 ? .25 + k * 1.6 : .65 * (1 - E.inCubic((k - .25) / .75)) + .02; } });
    later(.11, () => {
      hitCore(th, b, pw);
      B(24 * pw, { x: b.x, y: b.y, r: 6, speed: [200, 520], life: [.4, .8], size: [5, 9], asp: .45, col: th.hot, i: [2.4, 4], col1: th.ac, i1: .6, tile: TILE.shard, stretch: .008, drag: 2.4, grav: 200 });
      smoke(b.x, b.y, 14 * pw, { size: [14, 24], dark: [.4, .6], speed: [40, 160], life: [1, 1.6], grav: -25 });
      motes(b.x, b.y, 14, th.hot, { r: 20, grav: -110 });
      vignette(.32, 380);
      if (th.name === 'DEATH') { const a0 = (dir ? Math.atan2(dir.y, dir.x) : 0) - 2.2; shape({ kind: K.slash, x: b.x, y: b.y, size: 95 * pw, col: mixc(th.hot, WHITE, .3), i: 3.4, life: .42, layer: 1, p: [.72, .1, 0, 0], q: [0, a0, 2.6, 0], upd: (s, k) => { s.p[2] = E.outExpo(sat(k / .45)); }, env: k => k < .5 ? 1 : Math.pow(1 - (k - .5) / .5, 1.5) }); }
    });
  },
  dread(th, b, dir, pw) {
    const red = mixc(th.pop, [1, .2, .35], .5);
    hitCore(th, b, pw, { ring2: false });
    shock(b.x, b.y, BLACK, 130 * pw, { dark: .55, i: 0, life: .6, th: .08 });
    sparks(b.x, b.y, 26 * pw, red, { speed: [200, 600], grav: 300 });
    smoke(b.x, b.y, 10 * pw, { size: [14, 24], dark: [.35, .55] });
    for (let j = 0; j < 3; j++) later(j * .04, () => streakFlare(b.x + (j - 1) * 14, b.y, red, 52, 3.4, .32, -1.05 + rnd(-.06, .06), 140));
    vignette(.3, 420);
  },
  rot(th, b, dir, pw) {
    const crimson = [.95, .18, .24];
    hitCore(th, b, pw);
    B(30 * pw, { x: b.x, y: b.y, r: 6, ang: [-Math.PI * .95, -Math.PI * .05], speed: [160, 460], life: [.5, .9], size: [2, 3.6], col: crimson, i: [1.6, 2.8], tile: TILE.drop, stretch: .02, grav: 950 });
    sparks(b.x, b.y, 18 * pw, th.pop, { speed: [160, 420] });
    smoke(b.x, b.y, 12 * pw, { size: [14, 24], dark: [.35, .55] });
    B(10, { x: b.x, y: b.y + 10, box: [30, 4], speed: 0, life: [.6, 1.1], size: [1.6, 2.6], col: crimson, i: 1.6, tile: TILE.drop, grav: 500, stretch: .02, fin: .3 });
  },
  nova(th, b, dir, pw) {
    hitCore(th, b, pw, { ring2: false, thin: true, noise: .02 });
    crossFlare(b.x, b.y, th.hot, 120 * pw, 3.6, .5);
    shape({ kind: th.prism ? K.prism : K.rays, x: b.x, y: b.y, size: 170 * pw, col: th.hot, i: 1.6, life: .75, layer: 0, p: [26, 3, rnd(TAU), .08], q: [rnd(), rnd(), 0, 0], upd: (s, k) => { s.p[2] += .004; s.hw = s.hh = 170 * pw * (.7 + .3 * E.outCubic(k)); }, env: k => k < .1 ? k / .1 : Math.pow(1 - (k - .1) / .9, 1.6) });
    sparks(b.x, b.y, 34 * pw, th.name === 'CLARITY' ? WHITE : th.pop, { speed: [260, 700], grav: 260 });
    motes(b.x, b.y, 16 * pw, th.hot, { r: 30, speed: [30, 120], tile: TILE.star, spin: [-3, 3] });
    if (th.name === 'COURAGE') shape({ kind: K.hex, x: b.x, y: b.y, size: 90, col: th.hot, i: 2.2, life: .6, layer: 1, p: [.4, .06, 0, .5], upd: (s, k) => { s.p[0] = .3 + .55 * E.outCubic(k); s.p[2] = k * .6; }, env: k => Math.pow(1 - k, 1.3) });
    if (th.name === 'CLARITY') B(20, { x: b.x, y: b.y, r: 10, speed: [120, 380], life: [.5, .9], size: [2, 4], col: spectrum(rnd()), i: [2.5, 4], tile: TILE.star, drag: 2, spin: [-4, 4] });
  },
  sparks(th, b, dir, pw) {
    const hot = [1, .78, .45];
    hitCore(th, b, pw, { ring2: false });
    sparks(b.x, b.y, 42 * pw, hot, { speed: [300, 950], grav: 1200, life: [.35, .8], stretch: .028, drag: 1.6, r: 14 });
    B(14 * pw, { x: b.x, y: b.y, r: 6, speed: [200, 520], life: [.5, .9], size: [2, 3.4], col: mixc(th.ac, WHITE, .2), i: [1, 1.8], tile: TILE.bit, grav: 1200, drag: .8, spin: [-14, 14] });
    smoke(b.x, b.y, 8 * pw, { size: [12, 20], dark: [.25, .4] });
    crossFlare(b.x, b.y, WHITE, 60 * pw, 2.4, .2);
  },
  reflect(th, b, dir, pw) {
    hitCore(th, b, pw);
    B(30 * pw, { x: b.x, y: b.y, r: 6, speed: [180, 560], life: [.5, .9], size: [5, 9], asp: .5, col: WHITE, i: [2, 3.4], col1: th.ac, i1: .8, tile: TILE.shard, stretch: .006, spin: [-8, 8], drag: 2, grav: 600 });
    for (let j = 0; j < 8; j++) later(rnd(.25), () => crossFlare(b.x + rnd(-50, 50), b.y + rnd(-40, 40), WHITE, rnd(16, 30), 3, .25, rnd(TAU)));
    shape({ kind: K.grid, x: b.x, y: b.y, size: 110, col: th.ac, i: 1.6, life: .5, layer: 0, p: [5, 0, 0, 0], upd: (s, k) => { s.p[1] = .3 + 1.1 * E.outCubic(k); }, env: k => Math.pow(1 - k, 1.2) });
  },
  slash(th, b, dir, pw) {
    hitCore(th, b, pw, { ring2: false });
    [-.78, .78].forEach((r, j) => later(j * .05, () => { streakFlare(b.x, b.y, WHITE, 86 * pw, 4, .26, r, 160); streakFlare(b.x, b.y, th.ac, 100 * pw, 2, .36, r, 50); sfx('impact', 'speed', .4, b.x, th.name); }));
    B(26 * pw, { x: b.x, y: b.y, r: 10, speed: [500, 1000], life: [.12, .26], size: [1, 1.8], col: th.hot, i: [2.5, 4], tile: TILE.streak, stretch: .045, fin: .01 });
    sparks(b.x, b.y, 16 * pw, th.ac, { speed: [200, 500], grav: 300 });
  },
  wisp(th, b, dir, pw) {
    hitCore(th, b, pw, { ring2: false, noise: .1 });
    B(20 * pw, { x: b.x, y: b.y, r: 18, speed: [60, 180], life: [.9, 1.6], size: [3, 6], grow: .4, cols: [th.ac, th.pop], i: [1.2, 2.2], tile: TILE.glow, drag: 1.2, grav: -140, turb: 260, fin: .15, pre: [0, .05] });
    puffs(b.x, b.y, 6, th.ac, { tile: TILE.glow, size: [14, 22], i: [.22, .42], speed: [60, 180] });
    motes(b.x, b.y, 16, mixc(th.ac, WHITE, .5), { r: 26 });
  },
  mind(th, b, dir, pw) {
    hitCore(th, b, pw, { ring2: false, thin: true });
    shape({ kind: K.wave, x: b.x, y: b.y, size: 120 * pw, col: th.ac, i: 1.6, life: .8, layer: 0, p: [36, 22, 1.8, 0], upd: (s, k) => { s.p[3] = .15 + E.outCubic(k) * .85; }, env: k => Math.pow(1 - k, 1.2) });
    for (let j = 0; j < 22 * Q().density; j++) { const a = rnd(TAU), r = rnd(30, 70); P({ x: b.x + Math.cos(a) * r, y: b.y + Math.sin(a) * r * .7, ang: a + Math.PI / 2, speed: [140, 220], att: { x: b.x, y: b.y, k: 9 }, drag: .4, life: [.5, .9], size: [1.4, 2.6], cols: [th.ac, th.pop], i: [2.4, 4], tile: TILE.streak, stretch: .03 }); }
    streakFlare(b.x, b.y, th.hot, 110, 2.6, .35, 0, 220);
  },
  glitch(th, b, dir, pw) {
    hitCore(th, b, pw, { ring2: false });
    B(40 * pw, { x: b.x, y: b.y, r: 10, speed: [80, 420], life: [.2, .55], size: [2, 5], rot: 0, col: [1, .2, .4], i: [2, 4], tile: TILE.bit, drag: 3, fin: .01, fpow: .6 });
    B(30 * pw, { x: b.x, y: b.y, r: 10, speed: [80, 420], life: [.2, .55], size: [2, 5], rot: 0, col: [.2, .9, 1], i: [2, 4], tile: TILE.bit, drag: 3, fin: .01, fpow: .6 });
    [[1, .2, .35], [.2, 1, .5], [.25, .5, 1]].forEach((c, j) => shock(b.x + (j - 1) * 4, b.y, c, 100, { life: .4, th: .05, i: 1.8 }));
    aberrate(.02); for (let j = 0; j < 4; j++) later(j * .06 + rnd(.03), () => glowAt(b.x + rnd(-30, 30), b.y + rnd(-20, 20), 50, pick([[1, .2, .4], [.2, .9, 1]]), 2, .07));
  },
  collapse(th, b, dir, pw) {
    gather(b.x, b.y, 30, th.hot, 110, .18, { swirl: 2.4 });
    shape({ kind: K.spiral, x: b.x, y: b.y, size: 110 * pw, col: th.ac, i: 2, dark: .85, p: [4, 7, 0, .16], life: .5, layer: 0, upd: (s, k) => { s.p[2] = s.t * 18; const g = 1 - E.inCubic(k) * .8; s.hw = s.hh = 110 * pw * g; } });
    later(.16, () => {
      hitCore(th, b, pw * 1.1);
      sparks(b.x, b.y, 30 * pw, th.pop, { speed: [260, 700], grav: 200 });
      B(14, { x: b.x, y: b.y, r: 6, speed: [180, 460], life: [.5, .9], size: [2, 3.4], col: th.ac, i: [1.4, 2], tile: TILE.bit, grav: 500, spin: [-10, 10] });
    });
  },
  clock(th, b, dir, pw) {
    hitCore(th, b, pw, { ring2: false, thin: true, noise: 0 });
    shape({ kind: K.clock, x: b.x, y: b.y, size: 90 * pw, col: th.hot, i: 2, life: .9, layer: 0, p: [0, 0, 0, 0], upd: (s, k) => { s.p[0] = s.t * 30; s.p[1] = s.t * 6; s.p[2] = Math.min(1, k * 2.5); s.hw = s.hh = 70 + 30 * E.outCubic(k); }, env: k => Math.pow(1 - k, 1.2) });
    motes(b.x, b.y, 26 * pw, th.ac, { r: 40, speed: [5, 30], life: [1.2, 2], grav: 0, turb: 30 });
    for (let j = 0; j < 12; j++) { const a = j / 12 * TAU; P({ x: b.x + Math.cos(a) * 30, y: b.y + Math.sin(a) * 30, ang: a, speed: 160, life: .5, size: 2, col: th.hot, i: 3, tile: TILE.streak, stretch: .03, drag: 3 }); }
  },
  miasma(th, b, dir, pw) {
    hitCore(th, b, pw * .9);
    puffs(b.x, b.y, 18 * pw, th.ac, { size: [16, 28], i: [.5, .9], speed: [30, 120], grav: -20, life: [1, 1.7] });
    smoke(b.x, b.y, 8 * pw, { size: [14, 24], dark: [.3, .45] });
    B(14 * pw, { x: b.x, y: b.y, r: 26, ang: -Math.PI / 2, speed: [20, 80], life: [.8, 1.4], size: [3, 6], col: mixc(th.ac, WHITE, .3), i: [1.2, 2], tile: TILE.bubble, grav: -100, turb: 120 });
    B(12 * pw, { x: b.x, y: b.y, r: 6, ang: [-Math.PI * .9, -Math.PI * .1], speed: [120, 340], life: [.5, .9], size: [1.6, 2.8], col: th.ac, i: [1.4, 2.4], tile: TILE.drop, stretch: .02, grav: 900 });
  },
  smog(th, b, dir, pw) {
    hitCore(th, b, pw * .9, { ring2: false });
    smoke(b.x, b.y, 22 * pw, { size: [16, 30], dark: [.4, .6], speed: [60, 200], life: [1.1, 1.9] });
    puffs(b.x, b.y, 10 * pw, [.75, .76, .8], { size: [14, 24], i: [.3, .5] });
    embers(b.x, b.y, 18 * pw, th.pop, { r: 30 });
  },
  fortune(th, b, dir, pw) {
    hitCore(th, b, pw);
    B(30 * pw, { x: b.x, y: b.y, r: 10, speed: [120, 420], life: [.5, 1], size: [2.4, 4.6], cols: [th.ac, [1, .9, .45]], i: [2.4, 4], tile: TILE.star, spin: [-6, 6], drag: 2, grav: 150 });
    B(10 * pw, { x: b.x, y: b.y, r: 6, speed: [200, 420], life: [.6, 1], size: [3, 4], col: [1, .85, .35], i: [1.6, 2.6], tile: TILE.bit, spin: [-14, 14], grav: 800, drag: .6 });
    shape({ kind: K.rays, x: b.x, y: b.y, size: 120, col: [1, .9, .5], i: 1.2, life: .6, layer: 0, p: [18, 3, rnd(TAU), .1], q: [rnd(), 0, 0, 0], env: k => Math.pow(1 - k, 1.6) });
  },
};

/* ═════════════════════════ DIRECTOR ═════════════════════════ */
const pend = { destroy: null, ret: null, discard: null, flies: [] };
const HANDLED = new Map();                       // cid → time a hook-driven effect claimed it
const handled = cid => { const t = HANDLED.get(cid); return t !== undefined && now() - t < 1500; };
const claim = cid => { if (cid) HANDLED.set(cid, now()); if (HANDLED.size > 200) for (const [k, t] of HANDLED) if (now() - t > 3000) HANDLED.delete(k); };
let lastAttack = null;
function findCard(cid) {
  return safe(() => { if (!G || !G.players) return null; for (let p = 0; p < 2; p++) { const pl = G.players[p]; for (let l = 0; l < 3; l++) for (const c of pl.lines[l]) if (c.id === cid) return { card: c, zone: 'field', player: p, line: l };
    for (const z of ['hand', 'deck', 'discard']) for (const c of pl[z] || []) if (c.id === cid) return { card: c, zone: z, player: p }; } return null; }, null);
}
function perimeter(r, n, fn) {
  const k = Math.max(1, Math.round(n * Q().density));
  for (let j = 0; j < k; j++) { const side = (Math.random() * 4) | 0, t = Math.random(); let x, y, nx, ny;
    if (side === 0) { x = r.left + t * r.width; y = r.top; nx = 0; ny = -1; } else if (side === 1) { x = r.right; y = r.top + t * r.height; nx = 1; ny = 0; }
    else if (side === 2) { x = r.left + t * r.width; y = r.bottom; nx = 0; ny = 1; } else { x = r.left; y = r.top + t * r.height; nx = -1; ny = 0; }
    fn(x, y, nx, ny); }
}
/* ── attack: anticipation → launch → flight → impact. Resolves at impact so the rules continue in sync. */
function attack(fromR, toR, protocol) {
  const th = theme(protocol), a = center(fromR), b = center(toR), d = dirTo(a, b);
  const destroying = !!pend.destroy && near(toR, pend.destroy.rect);
  const pw = destroying ? 1.05 : .82;
  const chargeMs = D(th.proj === 'dash' ? 150 : 250);
  const travelMs = D(clamp(210 + d.l * .3, 230, 440) * (TRAVEL_MUL[th.proj] || 1));
  const hitMs = chargeMs + travelMs, blk = blocking(hitMs + D(40));
  lastAttack = { a, b, th, t: now() + hitMs, dir: d, rect: toR };
  sourceCharge(th, fromR, chargeMs / 1000);
  sfx('charge', th.name, chargeMs / 1000, a.x);
  schedule(chargeMs, () => {
    muzzle(th, a, d);
    if (th.proj !== 'rail') sfx('launch', th.launch, a.x, th.name);
    (PROJ[th.proj] || PROJ.lance)(th, a, b, travelMs / 1000);
    trauma(.05);
  });
  schedule(hitMs, () => {
    (HIT[th.hit] || HIT.nova)(th, b, d, pw);
    sfx('impact', th.el, pw, b.x, th.name);
    const el = targetEl(toR); if (el) recoil(el, d.x, d.y, destroying ? 1.25 : .9);
    duck(.5, .6);
  });
  return blk.promise;
}
function sourceCharge(th, r, T) {
  const c = center(r), R = cardR(r);
  magicCircle(c.x, c.y, R, th.ac, T + .35, { spin: 2.2, draw: .5, i: 1.6, grow: true });
  gather(c.x, c.y, 26, th.hot, R * 1.35, T);
  shape({ kind: K.glow, x: c.x, y: c.y, size: R * .8, col: th.ac, i: 1.8, p: [3.5, 1], life: T + .1, layer: 1, env: k => E.inCubic(Math.min(1, k * 1.1)) });
  const el = targetEl(r); if (el) safe(() => el.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.7) saturate(1.3)', offset: .8 }, { filter: 'brightness(1)' }], { duration: T * 1000 + 160 }));
}
function muzzle(th, a, d) {
  glowAt(a.x, a.y, 50, th.hot, 3.2, .16);
  streakFlare(a.x, a.y, th.hot, 70, 2.4, .2, d.ang + Math.PI / 2, 120);
  sparks(a.x, a.y, 12, th.hot, { ang: [d.ang - .7, d.ang + .7], speed: [160, 420], grav: 200, life: [.15, .35] });
}
function targetEl(r) { const c = center(r); const el = safe(() => document.elementFromPoint(c.x, c.y), null); return el && el.closest ? el.closest('#gameMain [data-cid]') : null; }

/* ── destroy: the card itself shatters and burns away */
function destroyFx(info) {
  if (!info || info.used) return; info.used = true; claim(info.cid);
  const th = theme(info.faceDown ? 'SPIRIT' : info.protocol), c = center(info.rect);
  const recent = lastAttack && Math.abs(now() - lastAttack.t) < 400 && near(lastAttack.rect, info.rect);
  const dir = recent ? lastAttack.dir : { x: 0, y: -1 };
  const cv = snapshot(info), el = elByCid(info.cid); if (el) el.style.visibility = 'hidden';
  if (cv) shatterCard({ canvas: cv, rect: info.rect, hit: { x: c.x - dir.x * info.rect.width * .22, y: c.y - dir.y * info.rect.height * .22 }, edge: th.ac, ember: th.pop, power: 1, dir: { x: dir.x * .55, y: dir.y * .55 } });
  const hot = mixc(th.hot, [1, .5, .45], .25);
  if (!recent) { glowAt(c.x, c.y, 34, WHITE, 3, .1); glowAt(c.x, c.y, 140, th.ac, .9, .5, 0); }
  if (recent) later(.07, () => shock(c.x, c.y, hot, 190, { life: .6, th: .022, i: 1.6, fill: .08 })); else shock(c.x, c.y, hot, 175, { life: .55, th: .03, i: 2.2, fill: .2 });
  if (!recent) shock(c.x, c.y, th.ac, 110, { life: .4, th: .07, i: 1.6, noise: .15 });
  sparks(c.x, c.y, recent ? 18 : 30, th.hot, { speed: [300, 950], r: 16 });
  streakFlare(c.x, c.y, mixc(th.hot, WHITE, .3), 170, 2.2, .3, Math.atan2(dir.y, dir.x) + Math.PI / 2, 180);
  smoke(c.x, c.y, 10, { size: [14, 24], dark: [.3, .5], speed: [40, 150] });
  embers(c.x, c.y, 18, th.pop, { r: 26 });
  flashScreen([1, .92, .88], .2, 10); vignette(.26, 360); aberrate(.012); trauma(.42); punch(.02, c.x, c.y); hitstop(70);
  sfx('shatter', c.x, 1);
  if (!recent) sfx('impact', th.el, .9, c.x, th.name);
  duck(.8, .45);
}
/* ── return to hand: time folds back */
function rewindFx(info) {
  if (!info || info.fxDone) return; info.fxDone = true;
  const c = center(info.rect), cyan = [.5, .9, 1];
  shock(c.x, c.y, cyan, 130, { reverse: true, life: .42, th: .05, i: 2, ease: E.inOut });
  gather(c.x, c.y, 30, cyan, 130, .36, { swirl: -2 });
  shape({ kind: K.clock, x: c.x, y: c.y, size: cardR(info.rect) * 1.18, col: cyan, i: 1.6, life: .5, layer: 1, p: [0, 0, 1, 0], upd: s => { s.p[0] = -s.t * 30; s.p[1] = -s.t * 6; }, env: k => Math.sin(k * Math.PI) });
  glowAt(c.x, c.y, 70, cyan, 2.2, .35);
  sfx('whoosh', c.x, .36, 3400, 480, .2);
}
/* ── a card lands on the field (play, deck play, move) */
function originFor(card, kind) {
  if (kind === 'deck') { const loc = findCard(card.id); return loc && loc.zone === 'field' ? safe(() => pileRect(loc.player, 'deck'), null) : null; }
  return safe(() => handRect(G ? G.current : 0), null);
}
function takeFly(toR) {
  for (let i = pend.flies.length - 1; i >= 0; i--) { const f = pend.flies[i]; if (!f.used && f.to && near(f.to, toR, 40)) { f.used = true; return f; } }
  return null;
}
function landCard(card, el, kind, fromRect) {
  const toR = rectOf(el); if (!toR) return;
  claim(card.id);
  const fly = takeFly(toR), from = fly ? fly.from : (fromRect || (kind === 'move' ? null : originFor(card, kind)));
  const faceDown = !!card.faceDown, th = faceDown ? NEUTRAL() : theme(card.protocol);
  if (!from || near(from, toR, 4)) { slamFx(card, th, toR, faceDown, kind); return; }
  const dur = D(kind === 'move' ? 300 : kind === 'deck' ? 320 : 340);
  ghostFly({ el, from, toCid: card.id, toRect: toR, dur, arc: kind === 'move' ? 36 : rnd(70, 120), spin: rnd(-14, 14), lift: kind === 'move' ? .08 : .22,
    startScale: kind === 'deck' ? .9 : 1, hideCid: card.id, ease: E.inOut,
    trail: { col: faceDown ? [.6, .5, 1] : th.ac, i: 1.3, w: 6, len: .14, sparks: !faceDown }, onLand: r => slamFx(card, th, r || toR, faceDown, kind) });
  sfx('whoosh', center(from).x, .28, 600, 2400, .16);
}
function slamFx(card, th, r, faceDown, kind) {
  if (!r) return;
  const c = center(r), small = kind === 'move' || kind === 'deck', pw = small ? .6 : 1, M = cardR(r) * 1.57;
  const wide = r.width > r.height * 1.6, ringR = wide ? r.width * .6 : M * 1.05, ringSq = wide ? clamp(r.height * 1.15 / ringR, .3, 1) : .8;
  const el = elByCid(card.id); if (el) squash(el, pw);
  if (faceDown) {
    smoke(c.x, c.y, 12 * pw, { r: M * .3, size: [10, 18], dark: [.35, .55], speed: [60, 200], grav: -10 });
    shock(c.x, c.y, [.55, .45, 1], ringR * .86, { life: .5, th: .05, i: 1.6, squash: ringSq });
    glowAt(c.x, c.y, M * .7, [.5, .4, 1], 1.3, .3, 0);
    B(10 * pw, { x: c.x, y: c.y, box: [r.width / 2, r.height / 2], speed: [10, 40], life: [.6, 1.1], size: [3, 5], col: [.7, .62, 1], i: [1.2, 2], tile: [TILE.runeA, TILE.runeB], fin: .2, grav: -40, rot: 0 });
  } else {
    glowAt(c.x, c.y, M * .8, th.ac, .8 * pw, .32, 0);
    shock(c.x, c.y, th.hot, ringR, { life: .45, th: .03, i: 1.9 * pw, squash: ringSq });
    perimeter(r, 22 * pw, (x, y, nx, ny) => P({ x, y, ang: Math.atan2(ny, nx) + rnd(-.35, .35), speed: [80, 260], life: [.25, .55], size: [1.1, 2.1], col: th.hot, i: [2, 3.6], tile: TILE.streak, stretch: .03, drag: 4.5 }));
    perimeter(r, 10 * pw, (x, y, nx, ny) => P({ x, y, ang: Math.atan2(ny, nx) + rnd(-.5, .5), speed: [30, 90], life: [.5, .9], size: [8, 14], grow: 2, col: th.ac, i: [.3, .55], tile: TILE.smoke, drag: 3, spin: [-1, 1] }));
    streakFlare(c.x, r.top + 2, th.hot, r.width * .8, 2, .24, 0, 140);
  }
  trauma(.1 * pw); punch(.006 * pw, c.x, c.y);
  sfx('slam', c.x, faceDown, pw, card.protocol);
}
/* ── flip: the card turns over in a sweep of light */
function flipFx(card, el) {
  const r = rectOf(el); if (!r) return; claim(card.id);
  const up = !card.faceDown, th = up ? theme(card.protocol) : NEUTRAL(), c = center(r), M = cardR(r) * 1.57;
  safe(() => el.animate([{ transform: 'perspective(700px) rotateY(86deg) scale(1.05)', filter: 'brightness(2.5)' }, { transform: 'perspective(700px) rotateY(-10deg) scale(1.02)', filter: 'brightness(1.5)', offset: .55 }, { transform: 'none', filter: 'none' }], { duration: D(440), easing: 'cubic-bezier(.2,.8,.25,1)' }));
  shape({ kind: K.streak, x: r.left, y: c.y, hw: r.height * .9, hh: r.height * .12, rot: Math.PI / 2 - .45, col: up ? th.hot : [.72, .62, 1], i: 2.4, p: [150, 1.3, 70, 0], life: .34, layer: 1, upd: (s, k) => { s.x = r.left - 8 + (r.width + 16) * E.inOut(k); } });
  if (up) { motes(c.x, c.y, 16, th.hot, { r: M * .45, grav: -80, tile: TILE.star, spin: [-3, 3] }); shock(c.x, c.y, th.ac, M * .95, { life: .45, i: 1.8, squash: .8 }); crossFlare(c.x, r.top + r.height * .2, th.hot, M * .6, 2.4, .3); }
  else { smoke(c.x, c.y, 8, { r: M * .25, size: [10, 16], dark: [.3, .45] }); shock(c.x, c.y, [.55, .45, 1], M * .9, { life: .45, i: 1.4, squash: .8 }); }
  sfx('flip', c.x, up, card.protocol);
}
/* ── ability activation aura before the cut-in */
async function castFx(card) {
  const until = HIDDEN.get(card.id);                       // let a card that is still flying in land first
  if (until && until > now()) await blocking(Math.min(600, until - now() + 30)).promise;
  if (!active()) return;
  const el = elOf(card), r = rectOf(el); if (!r) return;
  const th = theme(card.protocol), c = center(r), R = cardR(r) * 1.13, T = D(380), ph = Math.max(r.height, cardR(r) * 1.4);
  magicCircle(c.x, c.y, R, th.ac, T / 1000 + .12, { spin: 1.6, draw: .55, i: 1.7, grow: true, owner: 'cast' });
  gather(c.x, c.y, 34, th.hot, R * 1.45, T / 1000 * .9);
  shape({ kind: K.pillar, x: c.x, y: c.y - ph * 1.1, hw: Math.min(r.width, r.height) * .55, hh: ph * 1.5, col: th.ac, i: 1.1, life: T / 1000 + .06, layer: 0, owner: 'cast', p: [3, 2.5, .7, .35], env: envIn(.6) });
  safe(() => el.animate([{ transform: 'none', filter: 'none' }, { transform: 'translateY(-3px) scale(1.04)', filter: 'brightness(1.8) saturate(1.3)', offset: .7 }, { transform: 'none', filter: 'brightness(1.2)' }], { duration: T + 200, easing: 'ease-in-out' }));
  sfx('cast', card.protocol, c.x);
  schedule(T * .8, () => { const g = glowAt(c.x, c.y, R * .8, th.ac, 1.05, .2); g.owner = 'cast'; const g2 = glowAt(c.x, c.y, R * .3, th.hot, 1.8, .12); g2.owner = 'cast'; const sh = shock(c.x, c.y, th.hot, R * 1.5, { life: .3, i: 1.6, fill: .08 }); sh.owner = 'cast'; sparks(c.x, c.y, 20, th.hot, { speed: [200, 500], grav: 150 }); });
  await blocking(T).promise;
}
/* ── mini DOM card for flights that have no element (discard, opponent hand) */
function miniNode(card, proto, back) {
  const d = document.createElement('div'); d.className = 'vfx-mini' + (back || !proto ? ' back' : '');
  if (!back && proto) { const th = theme(proto); safe(() => { d.style.backgroundImage = `url("${makeArt(proto, false)}")`; }); d.style.setProperty('--ac', css(th.ac)); d.innerHTML = `<b>${card ? card.value : ''}</b><span>${proto}</span>`; }
  return d;
}
function genericFly(f, hidden) {
  const back = hidden || f.back || !f.proto, th = back ? NEUTRAL() : theme(f.proto);
  ghostFly({ node: miniNode(f.card, f.proto, back), size: { w: 50, h: 70 }, from: f.from, toRect: f.to, dur: D(460), delay: f.delay || 0, arc: 64, spin: rnd(-24, 24), lift: .12, fadeOut: true,
    trail: { col: th.ac, i: 1.1, w: 4, len: .12 }, onLand: r => { const c = center(r); glowAt(c.x, c.y, 34, th.hot, 1.6, .25); } });
}
function discardFly(f) {
  const th = f.proto ? theme(f.proto) : NEUTRAL(), fire = [1, .55, .2];
  ghostFly({ node: miniNode(f.card, f.proto, false), size: { w: 50, h: 70 }, from: f.from, toRect: f.to, dur: D(480), delay: f.delay || 0, arc: 70, spin: rnd(-35, 35), lift: .1, fadeOut: true,
    trail: { col: fire, i: 1.5, w: 5, len: .14, sparks: true }, onLand: r => { const c = center(r); embers(c.x, c.y, 14, fire, { r: 8 }); glowAt(c.x, c.y, 44, fire, 2, .3); sfx('burn', c.x); } });
  later((f.delay || 0) / 1000 + .05, () => { const c = center(f.from); glowAt(c.x, c.y, 40, th.ac, 1.4, .25); });
}
function soulTo(from, to, info) {
  const th = theme(info.faceDown ? 'SPIRIT' : info.protocol), a = center(from), b = center(to), path = bez(a, b, rnd(-60, 60));
  later(.12, () => { const tr = trail({ w: 4, col: th.ac, i: 1.6, len: .2, sty: [.4, 1.5, 1, .03] });
    flight(D(520) / 1000, k => path(E.inOut(k)), p => { trailPush(tr, p.x, p.y); stamp({ x: p.x, y: p.y, size: 9, col: th.hot, i: 2.6, tile: TILE.glow }); }, p => { tr.released = true; glowAt(b.x, b.y, 36, th.hot, 2, .3); motes(b.x, b.y, 8, th.ac, { r: 10 }); }); });
}
function slashAt(rect) {
  const c = center(rect), w = Math.max(60, rect.width);
  [-.62, .62].forEach((rot, j) => later(j * .06, () => { streakFlare(c.x, c.y, WHITE, w * .9, 3.4, .24, rot, 170); streakFlare(c.x, c.y, [1, .4, .5], w, 1.6, .34, rot, 50); }));
  sparks(c.x, c.y, 20, [1, .6, .6], { speed: [200, 520] });
  sfx('whoosh', c.x, .18, 3800, 1200, .2);
}
function drawFly(el, cid, i) {
  const viewer = safe(() => uiViewer(), 0), from = safe(() => pileRect(viewer, 'deck'), null); if (!from) return;
  ghostFly({ el, from, toCid: cid, dur: D(420), delay: i * D(90), arc: 90, spin: rnd(-24, 24), startScale: .5, lift: .14, hideCid: cid, ease: E.inOut,
    trail: { col: [.55, .85, 1], i: 1, w: 4, len: .12 },
    onLand: r => { if (!r) return; const c = center(r); motes(c.x, r.top + 6, 6, [.6, .9, 1], { r: r.width * .4, grav: -60, size: [1, 2] }); glowAt(c.x, c.y, r.width * .6, [.5, .85, 1], .8, .2); sfx('draw', c.x); } });
}
function returnToHand(el, cid, info) {
  ghostFly({ el, from: info.rect, toCid: cid, dur: D(480), arc: 110, spin: rnd(-30, 30), lift: .2, hideCid: cid, ease: E.inOut,
    trail: { col: [.5, .9, 1], i: 1.5, w: 6, len: .18, sparks: true }, onLand: r => { if (!r) return; const c = center(r); glowAt(c.x, c.y, r.width * .7, [.5, .9, 1], 1.4, .3); sfx('draw', c.x); } });
}
function oppHandFly(n) {
  const viewer = safe(() => uiViewer(), 0), opp = 1 - viewer, from = safe(() => pileRect(opp, 'deck'), null), to = safe(() => handRect(opp), null);
  if (!from || !to) return;
  for (let i = 0; i < Math.min(n, 5); i++) ghostFly({ node: miniNode(null, null, true), size: { w: 30, h: 42 }, from, toRect: to, dur: D(380), delay: i * D(80), arc: 40, spin: rnd(-20, 20), fadeOut: true, trail: { col: [.6, .6, 1], i: .7, w: 3, len: .1 } });
}

/* ── vanish/appear effects for changes no hook announced (batch deletes, compile, network play) */
function vanishFx(info) {
  if (!info || !info.rect) return;
  const loc = findCard(info.cid), zone = loc ? loc.zone : null, c = center(info.rect);
  if (zone === 'hand') { genericFly({ from: info.rect, to: safe(() => handRect(loc.player), null) || info.rect, proto: info.faceDown ? null : info.protocol, card: loc.card }, loc.player !== safe(() => uiViewer(), 0)); rewindFx(info); return; }
  const th = theme(info.faceDown ? 'SPIRIT' : info.protocol), cv = snapshot(info);
  if (cv) shatterCard({ canvas: cv, rect: info.rect, edge: th.hot, ember: th.pop, power: .55, grav: 300, burn: 1.15, life: 1.05 });
  glowAt(c.x, c.y, 70, th.ac, 1.6, .35, 0); sparks(c.x, c.y, 16, th.hot, { speed: [150, 450] });
  sfx('dissolve', c.x);
}

/* ── compile: the lane pours into the protocol, which locks with a pillar of light */
const COMPILE = { active: false, line: -1, until: 0 };
function laneEls(line) {
  const out = [];
  for (const id of ['#myStacks', '#oppStacks']) { const st = document.querySelectorAll(id + ' .stack')[line]; if (st) st.querySelectorAll('[data-cid]').forEach(el => out.push(el)); }
  return out;
}
function impactFrame(ms = 60) {
  const m = q('#gameMain'); if (!m || !shakeOn()) return;
  m.classList.add('vfx-impactframe'); setTimeout(() => m.classList.remove('vfx-impactframe'), ms);
}
async function compileSequence(prevAnnounce, self, args) {
  const ctx = window.__compilePresentationContext;
  if (!ctx) return prevAnnounce.apply(self, args);
  let cc = { x: innerWidth / 2, y: innerHeight * .45 };
  try { cc = await compilePreroll(ctx); } catch (e) { warn(e); }
  let result;
  try { result = await prevAnnounce.apply(self, args); }
  finally { if (active()) safe(() => compileAftermath(ctx, cc)); COMPILE.active = false; }
  return result;
}
async function compilePreroll(ctx) {
  const T = D(1150), chip = rectOf(ctx.target), cc = chip ? center(chip) : { x: innerWidth / 2, y: innerHeight * .45 };
  COMPILE.active = true; COMPILE.line = ctx.line; COMPILE.until = now() + 4000;
  const lane = laneEls(ctx.line), Rc = chip ? clamp(Math.sqrt(chip.width * chip.height) * 1.6, 96, 132) : 110;
  spotlight(cc.x, cc.y, 140, .5, T + 700); vignette(.3, T + 500);
  sfx('riser', ctx.protocol, T / 1000); duck(T / 1000 + 4, .22);
  for (const el of lane) {
    const r = rectOf(el); if (!r) continue; const c = center(r);
    safe(() => el.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(2.1) saturate(1.4) drop-shadow(0 0 10px #ffd890)', offset: .85 }, { filter: 'brightness(1.4)' }], { duration: T, easing: 'ease-in' }));
    const n = Math.round(22 * Q().density);
    for (let j = 0; j < n; j++) later(rnd(0, T * .72 / 1000), () => P({ x: c.x + rnd(-r.width / 2, r.width / 2), y: c.y + rnd(-r.height / 2, r.height / 2), ang: rnd(TAU), speed: [30, 120],
      att: { x: cc.x, y: cc.y, k: [16, 28] }, drag: 2.1, life: [.55, .85], size: [1.3, 2.5], col: GOLD.hot, i: [2.5, 4.5], tile: TILE.streak, stretch: .04, fin: .2, fpow: .8 }));
  }
  magicCircle(cc.x, cc.y, Rc, GOLD.ac, T / 1000 + .5, { spin: 2.6, draw: .6, i: 1.8, grow: true, layer: 1 });
  shape({ kind: K.hex, x: cc.x, y: cc.y, size: Rc * .9, col: GOLD.hot, i: 1.5, life: T / 1000 + .3, layer: 1, p: [.5, .045, 0, .4], upd: (s, k) => { s.p[2] = s.t * 1.8; s.p[0] = .75 - .3 * E.inCubic(k); } });
  shape({ kind: K.glow, x: cc.x, y: cc.y, size: Rc * .85, col: GOLD.ac, i: 1.45, p: [3.4, 1.1], life: T / 1000 + .1, layer: 1, env: k => E.inCubic(k) });
  later(T * .8 / 1000, () => gather(cc.x, cc.y, 46, GOLD.hot, 190, .2, { swirl: 2.2 }));
  await blocking(T).promise;                               // stopAll() (hidden tab, effects off) releases these at once
  if (active()) safe(() => lockFx(cc, ctx));
  if (active()) await blocking(D(480)).promise;
  return cc;
}
function lockFx(cc, ctx) {
  flashScreen(GOLD.hot, .2, 7); aberrate(.016); trauma(.78); punch(.05, cc.x, cc.y); hitstop(120); impactFrame(55);
  shape({ kind: K.pillar, x: cc.x, y: innerHeight / 2, hw: 46, hh: innerHeight / 2 + 30, col: mixc(GOLD.ac, WHITE, .12), i: .78, life: 1.1, layer: 1, owner: 'lock', p: [2.6, 3, .55, .1], q: [rnd(), 0, 0, 0],
    upd: (s, k) => { s.hw = 46 * (1 - E.outCubic(k) * .7) + 8; }, env: k => k < .05 ? k / .05 : Math.pow(1 - (k - .05) / .95, 1.4) });
  [0, .09, .2].forEach((t, j) => later(t, () => shock(cc.x, cc.y, j ? GOLD.ac : GOLD.hot, 230 + j * 140, { life: .7 + j * .15, th: .028, i: 2 - j * .45, noise: .08, fill: .1 })));
  glowAt(cc.x, cc.y, 170, GOLD.ac, .5, .8, 0); glowAt(cc.x, cc.y, 34, WHITE, 2.4, .12);
  crossFlare(cc.x, cc.y, GOLD.hot, 220, 1.5, .5);
  shape({ kind: K.rays, x: cc.x, y: cc.y, size: 360, col: GOLD.hot, i: 1, life: 1.5, layer: 0, owner: 'lock', p: [34, 3.6, rnd(TAU), .07], q: [rnd(), 0, 0, 0], upd: s => { s.p[2] += .003; }, env: k => k < .05 ? k / .05 : Math.pow(1 - k, 1.4) });
  sparks(cc.x, cc.y, 120, GOLD.hot, { speed: [300, 1100], grav: 420, life: [.4, .95] });
  embers(cc.x, cc.y, 60, GOLD.pop, { r: 50, speed: [60, 260], life: [1, 2.2] });
  B(24, { x: cc.x, y: cc.y, r: 50, ang: -Math.PI / 2, speed: [40, 140], life: [1, 1.8], size: [4, 7], col: GOLD.hot, i: [1.6, 2.6], tile: [TILE.runeA, TILE.runeB], grav: -60, turb: 60, fin: .2, rot: 0 });
  sfx('lock', ctx.protocol, ctx.tier || 1);
}
function compileAftermath(ctx, cc) {
  const chip = rectOf(ctx.target) || null, to = chip ? center(chip) : cc;
  for (const el of laneEls(ctx.line)) {
    const cid = el.dataset.cid, loc = findCard(cid); if (!loc || handled(cid)) continue;
    const c = loc.card;
    if (!c.faceDown && c.protocol === 'SPEED' && c.value === 2) continue;
    const info = cardInfo(el, c); if (!info) continue;
    claim(cid);
    const cv = snapshot(info); el.style.visibility = 'hidden';
    if (cv) shatterCard({ canvas: cv, rect: info.rect, edge: GOLD.hot, ember: GOLD.pop, power: .3, grav: -140, drag: 2.6, burn: 1.25, life: 1.15 });
    const r = info.rect, n = Math.round(18 * Q().density);
    for (let j = 0; j < n; j++) later(rnd(0, .4), () => P({ x: r.left + rnd(r.width), y: r.top + rnd(r.height), ang: rnd(TAU), speed: [20, 80], att: { x: to.x, y: to.y, k: [10, 18] }, drag: 1.6, life: [.7, 1.1], size: [1.4, 2.6], col: GOLD.hot, i: [2.2, 4], tile: TILE.glow, fin: .15 }));
  }
  later(.45, () => { glowAt(to.x, to.y, 110, GOLD.ac, 1.1, .5); glowAt(to.x, to.y, 30, WHITE, 3, .12); shock(to.x, to.y, GOLD.hot, 150, { life: .55, i: 2.2, th: .05 }); crossFlare(to.x, to.y, GOLD.core, 110, 2.4, .45); sparks(to.x, to.y, 30, GOLD.hot, { speed: [150, 500], grav: 260 }); trauma(.18); });
  sfx('dissolve', cc.x);
}

/* ── victory finale */
function victory() {
  const cx = innerWidth / 2, cy = innerHeight * .42;
  flashScreen(GOLD.core, .7, 3.5); trauma(.45); punch(.04, cx, cy); sfx('victory'); duck(3.2, .25);
  shape({ kind: K.rays, x: cx, y: cy, size: Math.max(innerWidth, innerHeight) * .7, col: GOLD.hot, i: 1.3, life: 3.2, layer: 0, p: [40, 3.2, 0, .04], q: [rnd(), 0, 0, 0], upd: s => { s.p[2] = s.t * .12; }, env: k => k < .08 ? k / .08 : Math.pow(1 - (k - .08) / .92, 1.2) });
  shape({ kind: K.pillar, x: cx, y: innerHeight / 2, hw: 90, hh: innerHeight / 2 + 30, col: GOLD.hot, i: 2.2, life: 1.6, layer: 0, p: [2.4, 2.4, .5, .1], upd: (s, k) => { s.hw = 90 * (1 - k * .7) + 12; } });
  for (let j = 0; j < 3; j++) later(j * .15, () => shock(cx, cy, j ? GOLD.ac : WHITE, 300 + j * 160, { life: .9, th: .03, i: 2.4 }));
  crossFlare(cx, cy, GOLD.core, 320, 3.4, .9);
  for (let j = 0; j < 7; j++) later(.35 + j * .32 + rnd(.12), () => {
    const x = rnd(innerWidth * .15, innerWidth * .85), y = rnd(innerHeight * .15, innerHeight * .55), col = pick([GOLD.hot, [.6, .9, 1], [1, .7, .85], GOLD.pop]);
    glowAt(x, y, 60, col, 2.6, .3); sparks(x, y, 50, col, { speed: [160, 520], grav: 260, life: [.6, 1.2], drag: 1.8 });
    B(16, { x, y, r: 6, speed: [60, 260], life: [.8, 1.5], size: [2, 4], col, i: [2, 3.5], tile: TILE.star, spin: [-5, 5], grav: 120, drag: 1.6 });
    sfx('impact', 'light', .45, x, 'LIGHT');
  });
  embers(cx, innerHeight, 70, GOLD.hot, { r: innerWidth / 2, speed: [80, 260], life: [1.6, 3], grav: -40 });
}
/* ── turn banner sweep */
function turnBannerFx(el) {
  const r = rectOf(el); if (!r) return; const c = center(r), mine = !el.classList.contains('opponent'), col = mine ? [.55, .9, 1] : [1, .66, .5];
  later(.05, () => { streakFlare(c.x, r.top, col, r.width * .9, 2, .6, 0, 300); streakFlare(c.x, r.bottom, col, r.width * .9, 2, .6, 0, 300); glowAt(c.x, c.y, r.width * .5, col, .9, .7, 0);
    B(26, { x: c.x, y: c.y, box: [r.width * .45, r.height * .4], speed: [10, 50], life: [.6, 1.2], size: [1, 2], col, i: [1.5, 3], tile: TILE.glow, grav: -20, fin: .2 }); });
  sfx('turn', mine);
}

/* ═════════════════════════ CUT-IN SUPPORT (called by cinematic.js) ═════════════════════════ */
const CUTS = new Map();
function cutin(o) {
  if (!active() || !o || !o.node) return;
  const node = o.node, gold = !!o.compile, th = gold ? GOLD : theme(o.protocol);
  node.classList.add('vfx-cut'); if (gold) node.classList.add('vfx-cut-gold');
  const sig = node.querySelector('.cin-cutsigil'), er = rectOf(sig);
  const sc = er ? center(er) : { x: innerWidth / 2, y: innerHeight * .4 }, E0 = sig ? clamp(Math.min(sig.offsetWidth || 120, sig.offsetHeight || 120) * .52, 34, 110) : 60, dur = Math.max(1, Number(o.duration) || 7);
  killOwned('cast');
  killOwned('lock');
  later(.04, () => {
    flashScreen(gold ? GOLD.hot : th.core, gold ? .2 : .14, 8);
    streakFlare(innerWidth / 2, sc.y, th.hot, innerWidth * .7, 1.8, .5, 0, 320);
    glowAt(sc.x, sc.y, E0 * 1.6, th.ac, 1.2, .55, 0);
    sparks(sc.x, sc.y, gold ? 56 : 28, th.hot, { speed: [200, 680], grav: 120 });
    shock(sc.x, sc.y, th.hot, E0 * (gold ? 3.4 : 2.6), { life: .6, i: 1.9, th: .03 });
    if (gold && (o.tier || 1) >= 3) for (let j = 0; j < 3; j++) later(.15 + j * .18, () => shock(sc.x, sc.y, GOLD.ac, E0 * (3.6 + j * 1.1), { life: .8, i: 1.6, th: .025 }));
  });
  shape({ kind: K.rays, x: sc.x, y: sc.y, size: E0 * (gold ? 2.6 : 2.1), col: th.ac, i: gold ? 1 : .7, life: dur + 1, layer: 0, owner: node, p: [gold ? 30 : 22, 3.6, 0, .16], q: [rnd(), 0, 0, 0], upd: s => { s.p[2] = s.t * .08; }, env: k => Math.min(1, k * (dur + 1) / .4) });
  magicCircle(sc.x, sc.y, E0 * 1.18, th.ac, dur + 1, { owner: node, spin: .55, draw: .18, i: gold ? 1.25 : .95, layer: 0, env: k => Math.min(1, k * (dur + 1) / .5) });
  const tick = (sdt, dt, t, abort) => {
    if (abort || !node.isConnected) { CUTS.delete(node); return false; }
    if (Math.random() < dt * (gold ? 26 : 13) * Q().density) motes(rnd(innerWidth), innerHeight + 8, 1, pick([th.ac, th.hot]), { r: 0, ang: -Math.PI / 2, speed: [40, 110], life: [2.2, 4], size: [1.1, 2.6], grav: -8, turb: 40 });
    return true;
  };
  TICKERS.add(tick); CUTS.set(node, tick);
  sfx('cutin', o.protocol, gold);
  wake();
}
function cutinEnd(node) { killOwned(node); const t = CUTS.get(node); if (t) { TICKERS.delete(t); CUTS.delete(node); } }

/* ═════════════════════════ HOOKS ═════════════════════════ */
const prev = {};
const SINK = document.createElement('div');
function install() {
  const g = window;
  const take = name => { prev[name] = g[name]; return typeof prev[name] === 'function'; };
  if (take('fxLayer')) fxLayer = function () { return active() ? SINK : prev.fxLayer.apply(this, arguments); };
  if (take('beamFX')) beamFX = function (fromR, toR, proto) {
    if (!active() || !fromR || !toR) return prev.beamFX.apply(this, arguments);
    return safe(() => attack(fromR, toR, proto), null) || Promise.resolve();
  };
  if (take('fxBurst')) fxBurst = function (protocol, n = 55, at = null) {
    if (!active()) return prev.fxBurst.apply(this, arguments);
    safe(() => {
      if (!at) {
        if (window.__compilePresentationContext || COMPILE.active) return;
        const ctrl = rectOf(q('#ctrl')), c = ctrl ? center(ctrl) : { x: innerWidth / 2, y: innerHeight * .45 }, th = theme(protocol);
        glowAt(c.x, c.y, 120, th.ac, 2, .5); shock(c.x, c.y, th.hot, 160, { life: .6, i: 2.2 }); sparks(c.x, c.y, 30, th.hot); crossFlare(c.x, c.y, th.hot, 120, 2.6, .4); sfx('impact', 'light', .5, c.x, protocol);
        return;
      }
      if (pend.destroy && !pend.destroy.used && inside(at, pend.destroy.rect, 12)) { destroyFx(pend.destroy); return; }
      if (pend.ret && !pend.ret.fxDone && inside(at, pend.ret.rect, 12)) { rewindFx(pend.ret); return; }
      const th = theme(protocol), pw = clamp(n / 60, .35, 1);
      glowAt(at.x, at.y, 60 * pw + 20, th.ac, 1.8, .3); shock(at.x, at.y, th.hot, 90 * pw + 20, { life: .4, i: 1.8 }); sparks(at.x, at.y, 20 * pw, th.hot, { speed: [160, 480] });
    });
  };
  if (take('fxAtCard')) fxAtCard = function (card, n = 36) {
    if (!active()) return prev.fxAtCard.apply(this, arguments);
    safe(() => {
      const el = elOf(card); if (!el) return;
      if (n === 40) landCard(card, el, 'play'); else if (n === 20) landCard(card, el, 'deck'); else if (n === 22) landCard(card, el, 'move');
      else if (n === 28) flipFx(card, el);
      else { const r = rectOf(el); if (!r) return; const th = theme(card.faceDown ? 'SPIRIT' : card.protocol), c = center(r); glowAt(c.x, c.y, 60, th.ac, 1.6, .3); shock(c.x, c.y, th.hot, 90, { life: .4 }); motes(c.x, c.y, 12, th.hot, { r: 20 }); }
    });
  };
  if (take('flashWhite')) flashWhite = function () {
    if (!active()) return prev.flashWhite.apply(this, arguments);
    if (window.__compilePresentationContext || COMPILE.active) return;
    flashScreen([1, .95, .88], .45, 6);
  };
  if (take('shakeScreen')) shakeScreen = function () {
    if (!active()) return prev.shakeScreen.apply(this, arguments);
    if (window.__compilePresentationContext || COMPILE.active) return;
    if (pend.destroy && pend.destroy.used) return;
    trauma(.3);
  };
  if (take('flyCard')) flyCard = function (o = {}) {
    if (!active() || !o || !o.from || !o.to) return prev.flyCard.apply(this, arguments);
    safe(() => {
      const f = { from: o.from, to: o.to, proto: o.proto, back: !!o.back, delay: o.delay || 0, used: false, card: null, discard: false };
      if (pend.destroy && pend.destroy.used && near(f.from, pend.destroy.rect)) { f.used = true; soulTo(f.from, f.to, pend.destroy); return; }
      if (pend.ret && near(f.from, pend.ret.rect)) { pend.ret.fly = f; f.ret = true; }
      else if (pend.discard) { f.discard = true; f.card = pend.discard.cards[pend.discard.i++] || null; }
      pend.flies.push(f);
      queueMicrotask(flushFlies);
    });
  };
  if (take('slashFX')) slashFX = function (rect) {
    if (!active() || !rect) return prev.slashFX.apply(this, arguments);
    if (pend.destroy && pend.destroy.used && near(rect, pend.destroy.rect)) return;
    safe(() => slashAt(rect));
  };
  if (take('floatLabel')) floatLabel = function (rect, text, color) {
    if (!active() || !rect) return prev.floatLabel.apply(this, arguments);
    safe(() => label(rect, text, color));
  };
  if (take('deleteCard')) deleteCard = async function (card) {
    if (!active()) return prev.deleteCard.apply(this, arguments);
    const saved = pend.destroy;
    pend.destroy = safe(() => { const el = elOf(card); const info = el && cardInfo(el, card); if (info) { info.cid = card.id; info.used = false; } return info; }, null);
    try { return await prev.deleteCard.apply(this, arguments); }
    finally { if (pend.destroy && pend.destroy.used) claim(pend.destroy.cid); pend.destroy = saved; }
  };
  if (take('returnCard')) returnCard = async function (card) {
    if (!active()) return prev.returnCard.apply(this, arguments);
    const saved = pend.ret;
    pend.ret = safe(() => { const el = elOf(card); const info = el && cardInfo(el, card); if (info) info.cid = card.id; return info; }, null);
    if (pend.ret) claim(card.id);
    try { return await prev.returnCard.apply(this, arguments); }
    finally { pend.ret = saved; }
  };
  if (take('discardCardsFromHand')) discardCardsFromHand = async function (target, cards) {
    if (!active()) return prev.discardCardsFromHand.apply(this, arguments);
    const saved = pend.discard; pend.discard = { cards: [...(cards || [])], i: 0, target };
    try { return await prev.discardCardsFromHand.apply(this, arguments); } finally { pend.discard = saved; }
  };
  if (take('announce')) announce = function (subject, title, desc = '', tag = '能力発動', cls = '') {
    if (!active()) return prev.announce.apply(this, arguments);
    const self = this, args = arguments;
    if (cls === 'gold') return compileSequence(prev.announce, self, args);
    const card = subject && typeof subject === 'object' ? subject : null;
    if (!card || !safe(() => elOf(card), null)) return prev.announce.apply(this, arguments);
    return (async () => { try { await castFx(card); } catch (e) { warn(e); } return prev.announce.apply(self, args); })();
  };
  if (take('render')) render = function () {
    const out = prev.render.apply(this, arguments);
    safe(afterRender);
    return out;
  };
  if (take('saveSettings')) saveSettings = function () {
    const out = prev.saveSettings.apply(this, arguments);
    safe(() => { auApplyVolume(); syncBody(); if (!wanted()) stopAll(); if (setting('cinemaQuality', 'cinema') === 'light') { tierCap = 0; R.w = 0; } else { tierCap = 3; tierIndex = Math.max(tierIndex, autoTier()); R.w = 0; } });
    return out;
  };
  // keep legacy one-shot sounds that the new layer re-times from firing early
  safe(() => {
    const A = window.COMPILE_AUDIO; if (!A || typeof A.sfx !== 'function') return;
    const orig = A.sfx;
    window.COMPILE_AUDIO = Object.freeze({ ...A, sfx: (name, o) => (active() && (name === 'shatter' || name === 'facedown')) ? undefined : orig(name, o) });
  });
}
function flushFlies() {
  const list = pend.flies; pend.flies = [];
  for (const f of list) {
    if (f.used) continue;
    if (f.discard) { discardFly(f); continue; }
    if (f.retLanded) continue;
    genericFly(f, !!f.ret || f.back);
  }
}

/* ── after every render: hidden cards, draws, field diff, turn banner */
const VIEW = { sig: '', viewer: -1, hand: new Set(), opp: -1, field: new Map() };
function sessionSig() { return safe(() => G && G.players ? G.players.map(p => p.name + ':' + (p.protocols || []).map(x => x.name).join('/')).join('|') + '#' + G.first : '', ''); }
function afterRender() {
  applyHidden();
  if (!G || !G.players) { VIEW.sig = ''; return; }
  preloadArt();
  const sig = sessionSig(), viewer = safe(() => uiViewer(), 0), live = active();
  const reset = sig !== VIEW.sig || viewer !== VIEW.viewer;
  // hand: draws and returns fly in from where they came
  const handEls = [...document.querySelectorAll('#hand .hfan[data-cid]')], ids = new Set(handEls.map(e => e.dataset.cid));
  if (!reset && live) {
    let i = 0;
    for (const el of handEls) {
      const cid = el.dataset.cid; if (VIEW.hand.has(cid)) continue;
      if (pend.ret && pend.ret.cid === cid && pend.ret.rect) { if (pend.ret.fly) pend.ret.fly.retLanded = true; claim(cid); returnToHand(el, cid, pend.ret); }
      else if (VIEW.field.has(cid)) { claim(cid); returnToHand(el, cid, VIEW.field.get(cid)); }
      else drawFly(el, cid, i++);
    }
  }
  VIEW.hand = ids;
  const opp = safe(() => G.players[1 - viewer].hand.length, 0);
  if (!reset && live && VIEW.opp >= 0 && opp > VIEW.opp) oppHandFly(opp - VIEW.opp);
  VIEW.opp = opp;
  // field: remember where every card is, so later changes can be animated from there
  const field = new Map();
  document.querySelectorAll('#myStacks [data-cid], #oppStacks [data-cid]').forEach(el => {
    const cid = el.dataset.cid, loc = findCard(cid); if (!loc || loc.zone !== 'field') return;
    const r = rectOf(el); if (!r) return;
    field.set(cid, { cid, rect: r, kind: el.classList.contains('sstrip') ? 'strip' : 'top', protocol: loc.card.protocol, value: loc.card.value, faceDown: !!loc.card.faceDown, player: loc.player, line: loc.line });
  });
  if (!reset && live) {
    const before = VIEW.field;
    queueMicrotask(() => safe(() => diffField(before, field)));
  }
  VIEW.field = field; VIEW.sig = sig; VIEW.viewer = viewer;
  const banner = q('.cin-turn:not([data-vfx])');
  if (banner && live) { banner.dataset.vfx = '1'; turnBannerFx(banner); }
}
function diffField(before, after) {
  if (!active()) return;
  for (const [cid, info] of before) {
    if (after.has(cid) || handled(cid)) continue;
    claim(cid); vanishFx(info);
  }
  for (const [cid, info] of after) {
    if (handled(cid)) continue;
    const old = before.get(cid), el = elByCid(cid); if (!el) continue;
    const loc = findCard(cid); if (!loc) continue;
    if (!old) { landCard(loc.card, el, 'remote'); continue; }
    if (old.faceDown !== info.faceDown) { flipFx(loc.card, el); continue; }
    if (old.line !== info.line || old.player !== info.player) { landCard(loc.card, el, 'move', old.rect); }
  }
}
function syncBody() { safe(() => document.body.classList.toggle('vfx-on', active())); }

/* ═════════════════════════ LIFECYCLE ═════════════════════════ */
function onHidden() { if (document.hidden) { stopAll(); if (AU.ctx && AU.ctx.state === 'running') AU.ctx.suspend().catch(() => {}); } else { if (AU.ctx && AU.ctx.state === 'suspended') AU.ctx.resume().catch(() => {}); } syncBody(); }
document.addEventListener('visibilitychange', onHidden);
addEventListener('pagehide', () => stopAll());
addEventListener('resize', () => { R.w = 0; });
safe(() => reduced.addEventListener && reduced.addEventListener('change', () => { if (reduced.matches) stopAll(); syncBody(); }));

/* preview helpers for the settings screen */
function preview(kind = 'attack', protocol = 'FIRE') {
  if (!active()) return Promise.resolve(false);
  auUnlock();
  const w = innerWidth, h = innerHeight, cw = Math.min(90, w * .2), ch = cw * 1.36;
  const fromR = { left: w * .28 - cw / 2, top: h * .7 - ch / 2, width: cw, height: ch, right: w * .28 + cw / 2, bottom: h * .7 + ch / 2 };
  const toR = { left: w * .68 - cw / 2, top: h * .3 - ch / 2, width: cw, height: ch, right: w * .68 + cw / 2, bottom: h * .3 + ch / 2 };
  const target = pick(Object.keys(ARCH).filter(p => p !== protocol));
  if (kind === 'attack') return attack(fromR, toR, protocol).then(() => { destroyFx({ rect: toR, protocol: target, value: 3, faceDown: false, kind: 'top', cid: null, used: false }); return true; });
  if (kind === 'compile') { const c = { x: w / 2, y: h * .45 }; lockFx(c, { protocol, tier: 3 }); return Promise.resolve(true); }
  if (kind === 'victory') { victory(); return Promise.resolve(true); }
  return Promise.resolve(false);
}

/* ═════════════════════════ BOOT ═════════════════════════ */
safe(() => { glInit(); install(); syncBody(); });
window.COMPILE_VFX = Object.freeze({
  version: BUILD,
  active: () => active(),
  cutin: o => safe(() => cutin(o)),
  cutinEnd: node => safe(() => cutinEnd(node)),
  victory: () => safe(() => { if (active()) victory(); }),
  preview: (kind, protocol) => safe(() => preview(kind, protocol), Promise.resolve(false)),
  stop: () => safe(stopAll),
  state: () => ({ active: active(), webgl: R.ok ? (R.v2 ? 2 : 1) : 0, hdr: R.hdr, tier: Q().name, particles: PS.n, ribbons: RIBS.length, shapes: SHAPES.length, shatters: SHATTERS.length,
    ghosts: GHOSTS.size, tickers: TICKERS.size, pending: PENDING.size, hidden: HIDDEN.size, running: !!raf, frameMs: Math.round(frameMs), dup: dupFrames, hitstop: Math.max(0, Math.round(CAM.hs - now())), sim: +simTime.toFixed(2), audio: AU.ctx ? AU.ctx.state : 'none' }),
  debug: { lastHit: () => lastAttack ? lastAttack.t : 0, now: () => now(), mask: MASK, redraw: () => safe(draw), shapes: () => SHAPES.map(s => ({ kind: s.kind, x: Math.round(s.x), y: Math.round(s.y), hw: Math.round(s.hw), hh: Math.round(s.hh), i: +s.i.toFixed(2), t: +s.t.toFixed(3), life: s.life, p: s.p.map(v => +(+v).toFixed(3)), layer: s.layer })), shape: o => shape(o), shock: (x, y, c, r, o) => shock(x, y, c, r, o), K, theme, attack: (a, b, p) => attack(a, b, p), destroy: info => destroyFx(info), flip: (c, el) => flipFx(c, el), land: (c, el, k) => landCard(c, el, k), lock: (c, ctx) => lockFx(c, ctx), PROJ: Object.keys(PROJ), HIT: Object.keys(HIT), setTier: i => { tierIndex = clamp(i, 0, 3); tierCap = 3; R.w = 0; } },
});
})();
