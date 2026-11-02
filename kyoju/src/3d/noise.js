// JS と GLSL で同じ値を返すノイズ。森の分布などを CPU とシェーダーで一致させる。
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const TAU = Math.PI * 2;

export function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
export function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
export function fbm(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * (vnoise(x * f + i * 17.3, y * f - i * 9.1) * 2 - 1); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
export function ridged(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0, w = 1;
  for (let i = 0; i < oct; i++) {
    let v = 1 - Math.abs(vnoise(x * f + i * 7.7, y * f + i * 3.3) * 2 - 1);
    v *= v; v *= w; w = clamp(v * 1.6, 0, 1);
    s += a * v; n += a; a *= 0.5; f *= 2.1;
  }
  return s / n;
}
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const GLSL_NOISE = /* glsl */`
float hash2i(ivec2 p){ uint h = uint(p.x)*374761393u + uint(p.y)*668265263u; h = (h ^ (h >> 13u)) * 1274126177u; h = h ^ (h >> 16u); return float(h) / 4294967296.0; }
float hash3i(ivec3 p){ uint h = uint(p.x)*374761393u + uint(p.y)*668265263u + uint(p.z)*2246822519u; h = (h ^ (h >> 13u)) * 1274126177u; h = h ^ (h >> 16u); return float(h) / 4294967296.0; }
float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = p - i; vec2 u = f*f*(3.0-2.0*f); ivec2 ii = ivec2(i);
  float a = hash2i(ii), b = hash2i(ii+ivec2(1,0)), c = hash2i(ii+ivec2(0,1)), d = hash2i(ii+ivec2(1,1));
  return a + (b-a)*u.x + (c-a)*u.y + (a-b-c+d)*u.x*u.y; }
float fbm2(vec2 p, int oct){ float s=0.0, a=0.5, n=0.0, f=1.0; for(int i=0;i<6;i++){ if(i>=oct) break; s += a*(vnoise(p*f + vec2(float(i)*17.3, -float(i)*9.1))*2.0-1.0); n+=a; a*=0.5; f*=2.03; } return s/n; }
float vnoise3(vec3 p){ vec3 i = floor(p); vec3 f = p - i; vec3 u = f*f*(3.0-2.0*f); ivec3 q = ivec3(i);
  float a = hash3i(q), b = hash3i(q+ivec3(1,0,0)), c = hash3i(q+ivec3(0,1,0)), d = hash3i(q+ivec3(1,1,0));
  float e = hash3i(q+ivec3(0,0,1)), g = hash3i(q+ivec3(1,0,1)), h = hash3i(q+ivec3(0,1,1)), k = hash3i(q+ivec3(1,1,1));
  return mix(mix(mix(a,b,u.x), mix(c,d,u.x), u.y), mix(mix(e,g,u.x), mix(h,k,u.x), u.y), u.z); }
// セル（ボロノイ）ノイズ：x=最も近い点までの距離, y=二番目, z=セルの乱数
vec3 cell3(vec3 p){ vec3 i = floor(p); vec3 f = p - i; float d1 = 8.0, d2 = 8.0, id = 0.0;
  for(int z=-1; z<=1; z++) for(int y=-1; y<=1; y++) for(int x=-1; x<=1; x++){
    ivec3 o = ivec3(x,y,z); ivec3 c = ivec3(i) + o;
    vec3 r = vec3(o) + vec3(hash3i(c), hash3i(c+ivec3(19,7,3)), hash3i(c+ivec3(5,23,11))) - f;
    float d = dot(r,r);
    if(d < d1){ d2 = d1; d1 = d; id = hash3i(c+ivec3(31,17,29)); } else if(d < d2){ d2 = d; } }
  return vec3(sqrt(d1), sqrt(d2), id); }
vec4 vor2p(vec2 p){ vec2 i = floor(p); vec2 f = p - i; float d1 = 8.0, d2 = 8.0; vec2 best = vec2(0.0);
  for(int y=-1; y<=1; y++) for(int x=-1; x<=1; x++){
    ivec2 o = ivec2(x,y); ivec2 c = ivec2(i) + o;
    vec2 j = vec2(hash2i(c), hash2i(c+ivec2(19,7)))*0.8 + 0.1;
    vec2 r = vec2(o) + j - f; float d = dot(r,r);
    if(d < d1){ d2 = d1; d1 = d; best = vec2(c) + j; } else if(d < d2){ d2 = d; } }
  return vec4(best, sqrt(d1), sqrt(d2)); }
vec3 cell2(vec2 p){ vec2 i = floor(p); vec2 f = p - i; float d1 = 8.0, d2 = 8.0, id = 0.0;
  for(int y=-1; y<=1; y++) for(int x=-1; x<=1; x++){
    ivec2 o = ivec2(x,y); ivec2 c = ivec2(i) + o;
    vec2 r = vec2(o) + vec2(hash2i(c), hash2i(c+ivec2(19,7))) - f;
    float d = dot(r,r);
    if(d < d1){ d2 = d1; d1 = d; id = hash2i(c+ivec2(31,17)); } else if(d < d2){ d2 = d; } }
  return vec3(sqrt(d1), sqrt(d2), id); }
`;
