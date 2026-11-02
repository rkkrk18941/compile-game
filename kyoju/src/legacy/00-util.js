'use strict';
/* ---------- 汎用ユーティリティ ---------- */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;
const sign = (v) => (v < 0 ? -1 : 1);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function weighted(pool, rnd = Math.random) {
  let tot = 0; for (const k in pool) tot += pool[k];
  let r = rnd() * tot;
  for (const k in pool) { r -= pool[k]; if (r <= 0) return k; }
  return Object.keys(pool)[0];
}

/* ---------- 色 ---------- */
const _rgbCache = new Map();
function hex2rgb(h) {
  let v = _rgbCache.get(h);
  if (v) return v;
  const n = parseInt(h.slice(1), 16);
  v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  _rgbCache.set(h, v);
  return v;
}
function rgb2hex(r, g, b) {
  const c = (x) => clamp(Math.round(x), 0, 255);
  return '#' + ((1 << 24) | (c(r) << 16) | (c(g) << 8) | c(b)).toString(16).slice(1);
}
function mixHex(a, b, t) {
  const A = hex2rgb(a), B = hex2rgb(b);
  return rgb2hex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
}
function shade(h, amt) { return amt >= 0 ? mixHex(h, '#ffffff', amt) : mixHex(h, '#000000', -amt); }
function rgba(h, a) { const c = hex2rgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
const fmt = (n) => Math.round(n).toLocaleString('ja-JP');

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
