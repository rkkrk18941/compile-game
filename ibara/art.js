/* 茨の塔 — original vector artwork (glyphs, card art, heroes, enemies, icons, scenes). */
(function () {
'use strict';
var ROOT = typeof globalThis !== 'undefined' ? globalThis : window;
var G = ROOT.IBARA || (ROOT.IBARA = {});
var ART = G.ART = {};
var UIDN = 0;
function U() { UIDN++; return 'a' + UIDN.toString(36); }
function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { var s = seed || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function pts(arr) { return arr.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '); }
function starPts(cx, cy, R, r, n, rot) { var a = [], k = n * 2; rot = rot || -Math.PI / 2; for (var i = 0; i < k; i++) { var rr = i % 2 ? r : R, t = rot + i * Math.PI / n; a.push([cx + Math.cos(t) * rr, cy + Math.sin(t) * rr]); } return pts(a); }
function gearPath(cx, cy, R, r, n) {
  var d = '', step = Math.PI * 2 / n;
  for (var i = 0; i < n; i++) {
    var a0 = i * step, a1 = a0 + step * 0.18, a2 = a0 + step * 0.5, a3 = a0 + step * 0.68;
    var p = [[cx + Math.cos(a0) * r, cy + Math.sin(a0) * r], [cx + Math.cos(a1) * R, cy + Math.sin(a1) * R], [cx + Math.cos(a2) * R, cy + Math.sin(a2) * R], [cx + Math.cos(a3) * r, cy + Math.sin(a3) * r]];
    d += (i ? 'L' : 'M') + p.map(function (q) { return q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join(' L');
  }
  return d + 'Z';
}
ART.hash = hash;

/* ============================ glyph library (100×100) ============================ */
var GL = {};
function sw(F, S) { return '<path d="M50 4 L57 15 L57 64 L43 64 L43 15 Z" fill="' + F + '"/><path d="M50 12 V60" stroke="' + S + '" stroke-width="2" opacity=".5"/><path d="M28 64 Q50 59 72 64 L72 70 Q50 66 28 70 Z" fill="' + F + '"/><rect x="46" y="70" width="8" height="15" rx="2" fill="' + S + '"/><circle cx="50" cy="89" r="5" fill="' + F + '"/>'; }
GL.sword = sw;
GL.greatsword = function (F, S) { return '<path d="M50 2 L61 16 L61 62 L39 62 L39 16 Z" fill="' + F + '"/><path d="M50 10 V58" stroke="' + S + '" stroke-width="3" opacity=".45"/><path d="M20 62 Q50 54 80 62 L80 69 Q50 63 20 69 Z" fill="' + F + '"/><rect x="45.5" y="69" width="9" height="18" rx="2" fill="' + S + '"/><circle cx="50" cy="91" r="5.5" fill="' + F + '"/>'; };
GL.swords = function (F, S) { return '<g transform="rotate(-32 50 54)">' + sw(F, S) + '</g><g transform="rotate(32 50 54)">' + sw(F, S) + '</g>'; };
GL.axe = function (F, S) { return '<rect x="46" y="8" width="7" height="86" rx="3" fill="' + S + '"/><path d="M53 14 C78 9 93 25 91 40 C89 55 75 63 53 57 Z" fill="' + F + '"/><path d="M60 18 C78 16 87 28 86 40 C85 52 76 58 60 55" fill="none" stroke="' + S + '" stroke-width="2" opacity=".5"/><path d="M46 24 L27 30 L46 39 Z" fill="' + F + '"/>'; };
GL.dagger = function (F, S) { return '<path d="M50 10 L58 21 L56 60 L44 60 L42 21 Z" fill="' + F + '"/><path d="M50 16 V58" stroke="' + S + '" stroke-width="2" opacity=".45"/><rect x="33" y="60" width="34" height="6" rx="2" fill="' + F + '"/><rect x="46" y="66" width="8" height="17" rx="2" fill="' + S + '"/><circle cx="50" cy="87" r="4.5" fill="' + F + '"/>'; };
function needle(F, S) { return '<path d="M50 4 L53.6 12 L52.2 93 L47.8 93 L46.4 12 Z" fill="' + F + '"/><ellipse cx="50" cy="15" rx="1.3" ry="3.4" fill="' + S + '"/>'; }
GL.needle = needle;
GL.needles = function (F, S) { return '<g transform="rotate(-24 50 92)">' + needle(F, S) + '</g><g transform="rotate(0 50 92)">' + needle(F, S) + '</g><g transform="rotate(24 50 92)">' + needle(F, S) + '</g>'; };
GL.shield = function (F, S) { return '<path d="M50 6 L86 17 Q86 62 50 94 Q14 62 14 17 Z" fill="' + F + '"/><path d="M50 16 L76 24 Q75 58 50 82 Q25 58 24 24 Z" fill="none" stroke="' + S + '" stroke-width="3" opacity=".55"/><circle cx="50" cy="44" r="7" fill="' + S + '" opacity=".75"/>'; };
GL.tower = function (F, S) { return '<path d="M24 10 Q50 0 76 10 L76 72 Q50 98 24 72 Z" fill="' + F + '"/><path d="M44 6 h12 v84 h-12 z" fill="' + S + '" opacity=".4"/><circle cx="32" cy="20" r="3" fill="' + S + '"/><circle cx="68" cy="20" r="3" fill="' + S + '"/><circle cx="32" cy="66" r="3" fill="' + S + '"/><circle cx="68" cy="66" r="3" fill="' + S + '"/>'; };
GL.flame = function (F, S) { return '<path d="M50 4 C60 22 80 34 76 60 C74 80 62 94 50 94 C38 94 24 82 24 62 C24 46 36 40 40 24 C46 34 46 42 50 46 C56 32 52 18 50 4 Z" fill="' + F + '"/><path d="M50 48 C56 60 64 66 62 76 C60 86 54 90 50 90 C44 90 38 84 38 76 C38 68 46 64 50 48 Z" fill="#fff" opacity=".55"/>'; };
GL.ember = function (F, S) { return '<path d="M26 72 L36 48 L54 40 L72 50 L78 72 L62 86 L38 86 Z" fill="' + F + '"/><path d="M38 60 L50 66 L46 78 M58 54 L60 68 L70 74" stroke="' + S + '" stroke-width="3" fill="none" opacity=".7"/><circle cx="40" cy="28" r="3" fill="' + F + '"/><circle cx="60" cy="20" r="2.4" fill="' + F + '"/><circle cx="70" cy="32" r="2" fill="' + F + '"/><circle cx="50" cy="12" r="1.8" fill="' + F + '"/>'; };
GL.skull = function (F, S) { return '<path d="M50 10 C26 10 16 28 18 46 C19 56 26 62 28 70 L72 70 C74 62 81 56 82 46 C84 28 74 10 50 10 Z" fill="' + F + '"/><ellipse cx="38" cy="44" rx="9" ry="10" fill="' + S + '"/><ellipse cx="62" cy="44" rx="9" ry="10" fill="' + S + '"/><path d="M50 52 L45 62 L55 62 Z" fill="' + S + '"/><path d="M32 70 L68 70 L66 85 L34 85 Z" fill="' + F + '"/><path d="M41 70 V84 M50 70 V85 M59 70 V84" stroke="' + S + '" stroke-width="2.5"/>'; };
GL.heart = function (F) { return '<path d="M50 88 C20 66 8 48 14 32 C20 16 40 14 50 30 C60 14 80 16 86 32 C92 48 80 66 50 88 Z" fill="' + F + '"/><ellipse cx="32" cy="34" rx="8" ry="5" fill="#fff" opacity=".35" transform="rotate(-30 32 34)"/>'; };
GL.drop = function (F) { return '<path d="M50 8 C62 30 78 46 78 62 C78 80 64 92 50 92 C36 92 22 80 22 62 C22 46 38 30 50 8 Z" fill="' + F + '"/><ellipse cx="38" cy="62" rx="5" ry="10" fill="#fff" opacity=".35" transform="rotate(20 38 62)"/>'; };
GL.blood = function (F) { return '<path d="M44 12 C54 30 68 44 68 58 C68 74 56 84 44 84 C32 84 20 74 20 58 C20 44 34 30 44 12 Z" fill="' + F + '"/><path d="M76 50 C80 58 86 62 86 68 C86 74 81 78 76 78 C71 78 66 74 66 68 C66 62 72 58 76 50 Z" fill="' + F + '"/><circle cx="80" cy="30" r="5" fill="' + F + '"/>'; };
GL.moth = function (F, S) { return '<path d="M48 40 C30 10 4 14 8 34 C10 50 30 56 48 50 Z M52 40 C70 10 96 14 92 34 C90 50 70 56 52 50 Z" fill="' + F + '"/><path d="M48 54 C32 58 18 72 26 84 C34 92 46 76 48 62 Z M52 54 C68 58 82 72 74 84 C66 92 54 76 52 62 Z" fill="' + F + '" opacity=".85"/><circle cx="26" cy="32" r="6.5" fill="' + S + '"/><circle cx="74" cy="32" r="6.5" fill="' + S + '"/><circle cx="26" cy="32" r="2.5" fill="' + F + '"/><circle cx="74" cy="32" r="2.5" fill="' + F + '"/><ellipse cx="50" cy="52" rx="5" ry="22" fill="' + S + '"/><path d="M48 32 C44 20 38 14 32 12 M52 32 C56 20 62 14 68 12" stroke="' + S + '" stroke-width="2" fill="none"/>'; };
GL.eye = function (F, S) { return '<path d="M6 50 Q50 8 94 50 Q50 92 6 50 Z" fill="' + F + '"/><circle cx="50" cy="50" r="17" fill="' + S + '"/><circle cx="50" cy="50" r="7" fill="' + F + '"/><circle cx="44" cy="44" r="3.5" fill="#fff" opacity=".8"/>'; };
GL.star = function (F) { return '<polygon points="' + starPts(50, 52, 44, 18, 5) + '" fill="' + F + '"/>'; };
GL.stars = function (F) { return '<polygon points="' + starPts(42, 56, 32, 13, 5) + '" fill="' + F + '"/><polygon points="' + starPts(76, 24, 14, 5.5, 5) + '" fill="' + F + '"/><polygon points="' + starPts(80, 76, 9, 3.6, 5) + '" fill="' + F + '"/><circle cx="18" cy="20" r="2.5" fill="' + F + '"/>'; };
GL.moon = function (F) { return '<path d="M64 8 A42 42 0 1 0 64 92 A34 34 0 1 1 64 8 Z" fill="' + F + '"/>'; };
GL.sun = function (F) { var r = ''; for (var i = 0; i < 12; i++) { var a = i * Math.PI / 6; r += '<polygon points="' + pts([[50 + Math.cos(a - 0.12) * 26, 50 + Math.sin(a - 0.12) * 26], [50 + Math.cos(a) * 46, 50 + Math.sin(a) * 46], [50 + Math.cos(a + 0.12) * 26, 50 + Math.sin(a + 0.12) * 26]]) + '" fill="' + F + '"/>'; } return r + '<circle cx="50" cy="50" r="21" fill="' + F + '"/>'; };
GL.bolt = function (F) { return '<path d="M60 4 L22 56 L46 56 L36 96 L78 40 L54 40 L68 4 Z" fill="' + F + '"/>'; };
GL.snow = function (F) { var s = ''; for (var i = 0; i < 6; i++) { var a = i * 60; s += '<g transform="rotate(' + a + ' 50 50)"><path d="M50 50 V10 M50 24 L40 16 M50 24 L60 16 M50 36 L42 30 M50 36 L58 30" stroke="' + F + '" stroke-width="5.5" stroke-linecap="round" fill="none"/></g>'; } return s + '<circle cx="50" cy="50" r="7" fill="' + F + '"/>'; };
GL.gear = function (F, S) { return '<path d="' + gearPath(50, 50, 46, 36, 10) + ' M50 36 A14 14 0 1 0 50.1 36 Z" fill="' + F + '" fill-rule="evenodd"/><circle cx="50" cy="50" r="24" fill="none" stroke="' + S + '" stroke-width="3" opacity=".5"/>'; };
GL.orb = function (F, S) { return '<circle cx="50" cy="50" r="34" fill="' + F + '"/><circle cx="40" cy="38" r="12" fill="#fff" opacity=".35"/><ellipse cx="50" cy="50" rx="46" ry="14" fill="none" stroke="' + S + '" stroke-width="3" transform="rotate(-20 50 50)"/>'; };
GL.hand = function (F) { return '<path d="M30 50 h44 v24 q0 18 -22 18 q-22 0 -22 -18 z" fill="' + F + '"/><rect x="31" y="20" width="9" height="36" rx="4.5" fill="' + F + '"/><rect x="42" y="12" width="9" height="44" rx="4.5" fill="' + F + '"/><rect x="53" y="14" width="9" height="42" rx="4.5" fill="' + F + '"/><rect x="64" y="22" width="9" height="34" rx="4.5" fill="' + F + '"/><rect x="14" y="50" width="9" height="28" rx="4.5" fill="' + F + '" transform="rotate(-40 18 64)"/>'; };
GL.fist = function (F, S) { return '<rect x="22" y="30" width="56" height="46" rx="12" fill="' + F + '"/><path d="M36 30 V50 M50 30 V50 M64 30 V50" stroke="' + S + '" stroke-width="3" opacity=".6"/><path d="M22 58 Q40 50 54 60 Q48 70 30 70" fill="none" stroke="' + S + '" stroke-width="3" opacity=".6"/><rect x="30" y="74" width="40" height="18" rx="4" fill="' + F + '"/>'; };
GL.palm = function (F, S) { return '<g transform="rotate(-20 50 50)">' + GL.hand(F) + '</g><path d="M8 30 H24 M4 48 H20 M8 66 H24" stroke="' + S + '" stroke-width="4" stroke-linecap="round" opacity=".7"/>'; };
GL.wave = function (F) { return '<path d="M4 44 Q18 24 32 44 T60 44 T88 44 T116 44" stroke="' + F + '" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M-8 68 Q6 48 20 68 T48 68 T76 68 T104 68" stroke="' + F + '" stroke-width="7" fill="none" stroke-linecap="round" opacity=".7"/>'; };
GL.swirl = function (F) { return '<path d="M50 50 m0 -4 a4 4 0 1 1 -4 4 a10 10 0 1 1 10 10 a18 18 0 1 1 -18 -18 a27 27 0 1 1 27 27 a36 36 0 1 1 -36 -36" stroke="' + F + '" stroke-width="7" fill="none" stroke-linecap="round"/>'; };
GL.spiral = GL.swirl;
GL.wing = function (F, S) { return '<path d="M12 74 C18 32 54 12 92 14 C80 24 72 30 66 34 C76 34 82 37 86 41 C72 45 62 47 56 49 C64 51 70 55 72 59 C54 61 34 66 12 74 Z" fill="' + F + '"/><path d="M24 64 C40 46 60 34 84 22 M30 66 C46 56 58 50 72 44 M36 68 C48 62 56 58 64 56" stroke="' + S + '" stroke-width="2" fill="none" opacity=".6"/>'; };
GL.crown = function (F, S) { return '<path d="M14 74 L20 30 L36 50 L50 20 L64 50 L80 30 L86 74 Z" fill="' + F + '"/><rect x="14" y="74" width="72" height="10" rx="2" fill="' + F + '"/><circle cx="50" cy="60" r="5" fill="' + S + '"/><circle cx="31" cy="64" r="3.5" fill="' + S + '"/><circle cx="69" cy="64" r="3.5" fill="' + S + '"/>'; };
GL.chain = function (F) { return '<ellipse cx="28" cy="36" rx="16" ry="10" fill="none" stroke="' + F + '" stroke-width="7" transform="rotate(35 28 36)"/><ellipse cx="50" cy="52" rx="16" ry="10" fill="none" stroke="' + F + '" stroke-width="7" transform="rotate(-35 50 52)"/><ellipse cx="72" cy="68" rx="16" ry="10" fill="none" stroke="' + F + '" stroke-width="7" transform="rotate(35 72 68)"/>'; };
GL.bell = function (F) { return '<path d="M50 12 C36 12 30 26 30 42 L30 62 L22 74 L78 74 L70 62 L70 42 C70 26 64 12 50 12 Z" fill="' + F + '"/><circle cx="50" cy="83" r="6" fill="' + F + '"/><circle cx="50" cy="9" r="4" fill="none" stroke="' + F + '" stroke-width="3"/>'; };
GL.hourglass = function (F, S) { return '<rect x="22" y="8" width="56" height="8" rx="2" fill="' + F + '"/><rect x="22" y="84" width="56" height="8" rx="2" fill="' + F + '"/><path d="M28 16 L72 16 L52 50 L72 84 L28 84 L48 50 Z" fill="' + F + '" opacity=".55"/><path d="M36 22 L64 22 L50 44 Z M50 60 L66 80 L34 80 Z" fill="' + S + '"/>'; };
GL.book = function (F, S) { return '<path d="M50 26 C38 18 22 18 10 22 L10 80 C22 76 38 76 50 84 C62 76 78 76 90 80 L90 22 C78 18 62 18 50 26 Z" fill="' + F + '"/><path d="M50 26 V84" stroke="' + S + '" stroke-width="3"/><path d="M18 34 H42 M18 44 H42 M18 54 H38 M58 34 H82 M58 44 H82 M58 54 H78" stroke="' + S + '" stroke-width="2.5" opacity=".5"/>'; };
GL.candle = function (F, S) { return '<path d="M38 42 h24 v46 h-24 z" fill="' + F + '"/><path d="M38 46 q4 8 0 14 M62 50 q-4 6 0 12" stroke="' + S + '" stroke-width="3" fill="none" opacity=".5"/><path d="M50 8 C56 18 60 24 58 32 C56 38 52 40 50 40 C46 40 42 37 42 31 C42 24 48 20 50 8 Z" fill="' + F + '"/><rect x="48.5" y="36" width="3" height="7" fill="' + S + '"/>'; };
GL.vine = function (F) { return '<path d="M20 90 C30 60 60 60 56 34 C54 20 66 10 80 10" stroke="' + F + '" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M30 66 L18 62 L28 56 Z M52 52 L66 54 L56 44 Z M54 30 L42 24 L54 20 Z M70 12 L74 2 L78 12 Z" fill="' + F + '"/>'; };
GL.thorn = GL.vine;
GL.mushroom = function (F, S) { return '<path d="M12 52 C12 26 32 10 50 10 C68 10 88 26 88 52 Z" fill="' + F + '"/><path d="M40 52 L37 86 Q50 93 63 86 L60 52 Z" fill="' + S + '"/><circle cx="32" cy="36" r="5" fill="' + S + '" opacity=".6"/><circle cx="56" cy="26" r="6" fill="' + S + '" opacity=".6"/><circle cx="70" cy="42" r="4" fill="' + S + '" opacity=".6"/>'; };
GL.mask = function (F, S) { return '<path d="M14 28 Q50 10 86 28 Q86 70 50 90 Q14 70 14 28 Z" fill="' + F + '"/><path d="M26 42 Q34 34 44 42 Q34 48 26 42 Z M56 42 Q66 34 74 42 Q66 48 56 42 Z" fill="' + S + '"/><path d="M38 68 Q50 76 62 68" stroke="' + S + '" stroke-width="3.5" fill="none" stroke-linecap="round"/>'; };
GL.lantern = function (F, S) { return '<circle cx="50" cy="10" r="5" fill="none" stroke="' + F + '" stroke-width="3"/><path d="M36 16 h28 l6 10 h-40 z" fill="' + F + '"/><rect x="30" y="26" width="40" height="52" rx="10" fill="' + F + '"/><circle cx="50" cy="52" r="13" fill="#fff" opacity=".55"/><path d="M40 26 V78 M60 26 V78" stroke="' + S + '" stroke-width="3" opacity=".6"/><path d="M34 78 h32 l-6 10 h-20 z" fill="' + F + '"/>'; };
GL.key = function (F) { return '<circle cx="32" cy="32" r="18" fill="none" stroke="' + F + '" stroke-width="8"/><path d="M44 44 L86 86" stroke="' + F + '" stroke-width="8" stroke-linecap="round"/><path d="M70 70 L80 60 M78 78 L88 68" stroke="' + F + '" stroke-width="7" stroke-linecap="round"/>'; };
GL.burst = function (F) { return '<polygon points="' + starPts(50, 50, 46, 20, 8, -Math.PI / 8) + '" fill="' + F + '"/><circle cx="50" cy="50" r="12" fill="#fff" opacity=".45"/>'; };
GL.scales = function (F, S) { return '<rect x="47" y="14" width="6" height="72" fill="' + F + '"/><rect x="30" y="84" width="40" height="8" rx="3" fill="' + F + '"/><path d="M14 24 H86" stroke="' + F + '" stroke-width="5" stroke-linecap="round"/><path d="M20 24 L10 54 M20 24 L30 54 M80 24 L70 54 M80 24 L90 54" stroke="' + S + '" stroke-width="2"/><path d="M6 54 Q20 70 34 54 Z M66 54 Q80 70 94 54 Z" fill="' + F + '"/><circle cx="50" cy="12" r="5" fill="' + F + '"/>'; };
GL.lotus = function (F, S) { var p = ''; [-60, -30, 0, 30, 60].forEach(function (a) { p += '<ellipse cx="50" cy="40" rx="11" ry="28" fill="' + F + '" transform="rotate(' + a + ' 50 68)" opacity="' + (a === 0 ? 1 : 0.85) + '"/>'; }); return p + '<path d="M18 74 Q50 90 82 74 Q50 82 18 74 Z" fill="' + S + '"/>'; };
GL.comet = function (F) { return '<path d="M58 44 L10 92 L18 70 Z M54 40 L6 70 L26 62 Z M62 50 L34 96 L40 76 Z" fill="' + F + '" opacity=".6"/><circle cx="64" cy="36" r="16" fill="' + F + '"/><circle cx="59" cy="31" r="5" fill="#fff" opacity=".6"/>'; };
GL.arrow = function (F) { return '<path d="M18 82 L72 28" stroke="' + F + '" stroke-width="7" stroke-linecap="round"/><path d="M60 16 L88 12 L84 40 Z" fill="' + F + '"/><path d="M14 72 L8 92 L28 86 Z" fill="' + F + '" opacity=".7"/>'; };
GL.crack = function (F) { return '<path d="M50 4 L44 26 L58 40 L40 56 L54 70 L46 96 M58 40 L80 34 L92 44 M40 56 L18 60 L8 52" stroke="' + F + '" stroke-width="5" fill="none" stroke-linejoin="round"/>'; };
GL.anvil = function (F) { return '<path d="M8 30 H72 Q90 30 94 20 Q94 44 72 48 L64 48 L64 62 L76 76 L24 76 L36 62 L36 48 Q14 46 8 30 Z" fill="' + F + '"/><rect x="20" y="78" width="60" height="10" rx="2" fill="' + F + '"/>'; };
GL.horn = function (F, S) { return '<path d="M14 84 C10 50 30 20 66 12 C86 8 94 16 92 22 C70 22 50 38 44 60 C40 74 30 84 14 84 Z" fill="' + F + '"/><path d="M28 70 C34 66 38 60 40 54 M40 48 C46 42 52 36 60 32 M62 26 C70 22 78 20 86 20" stroke="' + S + '" stroke-width="3" fill="none" opacity=".55"/>'; };
GL.feather = function (F, S) { return '<path d="M82 8 C50 18 24 48 18 86 L24 88 C34 58 54 32 82 8 Z" fill="' + F + '"/><path d="M82 8 C70 30 54 50 30 70 C46 46 62 26 82 8 Z" fill="' + F + '" opacity=".7"/><path d="M21 87 L60 34" stroke="' + S + '" stroke-width="2"/>'; };
GL.smoke = function (F) { return '<circle cx="34" cy="62" r="18" fill="' + F + '" opacity=".8"/><circle cx="58" cy="54" r="22" fill="' + F + '" opacity=".75"/><circle cx="46" cy="34" r="14" fill="' + F + '" opacity=".6"/><circle cx="70" cy="30" r="10" fill="' + F + '" opacity=".5"/><circle cx="76" cy="70" r="12" fill="' + F + '" opacity=".7"/>'; };
GL.cloud = function (F) { return '<path d="M22 70 C8 70 6 50 20 46 C18 30 38 24 46 34 C52 18 78 20 78 40 C92 40 96 62 82 70 Z" fill="' + F + '"/>'; };
GL.coin = function (F, S) { return '<circle cx="50" cy="50" r="38" fill="' + F + '"/><circle cx="50" cy="50" r="29" fill="none" stroke="' + S + '" stroke-width="3"/><polygon points="' + starPts(50, 51, 16, 7, 4) + '" fill="' + S + '"/>'; };
GL.die = function (F, S) { return '<rect x="14" y="14" width="72" height="72" rx="16" fill="' + F + '"/><circle cx="32" cy="32" r="6.5" fill="' + S + '"/><circle cx="50" cy="50" r="6.5" fill="' + S + '"/><circle cx="68" cy="68" r="6.5" fill="' + S + '"/><circle cx="68" cy="32" r="6.5" fill="' + S + '"/><circle cx="32" cy="68" r="6.5" fill="' + S + '"/>'; };
GL.bone = function (F) { return '<path d="M30 22 a10 10 0 1 0 -8 14 L64 78 a10 10 0 1 0 14 8 a10 10 0 1 0 0 -16 L36 30 a10 10 0 1 0 -6 -8 Z" fill="' + F + '"/>'; };
GL.anchor = function (F) { return '<circle cx="50" cy="16" r="8" fill="none" stroke="' + F + '" stroke-width="5"/><rect x="46" y="24" width="8" height="62" fill="' + F + '"/><rect x="30" y="34" width="40" height="7" rx="3" fill="' + F + '"/><path d="M14 58 Q20 88 50 90 Q80 88 86 58 L94 66 L86 50 L76 60 L82 62 Q76 80 50 82 Q24 80 18 62 L24 60 L14 50 L6 66 Z" fill="' + F + '"/>'; };
GL.stone = function (F) { return '<ellipse cx="50" cy="56" rx="40" ry="28" fill="' + F + '"/><ellipse cx="38" cy="46" rx="14" ry="6" fill="#fff" opacity=".35"/>'; };
GL.knot = function (F) { return '<path d="M30 30 C60 10 84 40 60 54 C40 66 20 90 50 88 C80 86 70 56 50 50 C26 42 10 60 26 74" stroke="' + F + '" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M60 54 L82 84 M40 46 L16 20" stroke="' + F + '" stroke-width="7" stroke-linecap="round"/>'; };
GL.leaf = function (F, S) { return '<path d="M14 86 C14 40 44 14 88 12 C86 56 60 86 14 86 Z" fill="' + F + '"/><path d="M14 86 C40 60 60 40 82 18" stroke="' + S + '" stroke-width="3" fill="none"/>'; };
GL.boot = function (F) { return '<path d="M30 10 H58 V58 L84 66 Q92 70 90 84 H22 V60 Q30 52 30 40 Z" fill="' + F + '"/><rect x="22" y="84" width="68" height="7" rx="2" fill="' + F + '" opacity=".7"/>'; };
GL.frog = function (F, S) { return '<ellipse cx="50" cy="60" rx="34" ry="24" fill="' + F + '"/><circle cx="32" cy="36" r="11" fill="' + F + '"/><circle cx="68" cy="36" r="11" fill="' + F + '"/><circle cx="32" cy="35" r="5" fill="' + S + '"/><circle cx="68" cy="35" r="5" fill="' + S + '"/><path d="M36 62 Q50 70 64 62" stroke="' + S + '" stroke-width="3" fill="none"/><path d="M16 74 L6 88 L22 86 M84 74 L94 88 L78 86" stroke="' + F + '" stroke-width="7" stroke-linecap="round" fill="none"/>'; };
GL.berry = function (F, S) { return '<circle cx="36" cy="60" r="16" fill="' + F + '"/><circle cx="62" cy="62" r="15" fill="' + F + '"/><circle cx="50" cy="40" r="14" fill="' + F + '"/><path d="M50 26 C54 16 64 12 74 14 C68 22 60 26 50 26 Z" fill="' + S + '"/>'; };
GL.owl = function (F, S) { return '<path d="M50 12 L36 20 L22 10 L24 30 C14 46 16 74 30 86 C40 94 60 94 70 86 C84 74 86 46 76 30 L78 10 L64 20 Z" fill="' + F + '"/><circle cx="38" cy="40" r="10" fill="#fff" opacity=".85"/><circle cx="62" cy="40" r="10" fill="#fff" opacity=".85"/><circle cx="38" cy="40" r="5" fill="' + S + '"/><circle cx="62" cy="40" r="5" fill="' + S + '"/><path d="M46 52 L50 60 L54 52 Z" fill="' + S + '"/>'; };
GL.lily = function (F, S) { return '<path d="M20 90 C30 60 40 30 70 12" stroke="' + S + '" stroke-width="4" fill="none"/><path d="M32 52 c-8 0 -12 10 -8 16 c4 -4 12 -4 16 0 c4 -6 0 -16 -8 -16 Z M48 32 c-8 0 -12 10 -8 16 c4 -4 12 -4 16 0 c4 -6 0 -16 -8 -16 Z M64 18 c-7 0 -10 8 -7 13 c3 -3 10 -3 13 0 c3 -5 0 -13 -6 -13 Z" fill="' + F + '"/><path d="M60 86 C60 60 74 46 90 44 C88 66 76 82 60 86 Z" fill="' + S + '" opacity=".7"/>'; };
GL.kettle = function (F, S) { return '<path d="M24 46 Q24 86 50 86 Q76 86 76 46 Z" fill="' + F + '"/><path d="M20 46 H80" stroke="' + F + '" stroke-width="6" stroke-linecap="round"/><path d="M76 56 L94 44 L90 54 L78 66" fill="' + F + '"/><path d="M32 40 Q50 10 68 40" stroke="' + S + '" stroke-width="5" fill="none"/>'; };
GL.belt = function (F, S) { return '<rect x="4" y="40" width="92" height="20" rx="4" fill="' + F + '"/><rect x="38" y="32" width="26" height="36" rx="4" fill="none" stroke="' + S + '" stroke-width="5"/><rect x="48" y="46" width="22" height="8" fill="' + S + '"/>'; };
GL.spoon = function (F) { return '<ellipse cx="66" cy="30" rx="18" ry="24" fill="' + F + '" transform="rotate(40 66 30)"/><path d="M56 42 L14 88" stroke="' + F + '" stroke-width="8" stroke-linecap="round"/>'; };
GL.claw = function (F) { return '<path d="M20 20 C40 30 48 56 40 88 C34 60 28 40 20 20 Z M44 12 C64 26 70 54 62 88 C58 60 52 38 44 12 Z M68 18 C86 32 90 56 84 84 C80 60 76 40 68 18 Z" fill="' + F + '"/>'; };
GL.charm = function (F, S) { return '<path d="M28 30 L72 30 L76 88 L24 88 Z" fill="' + F + '"/><path d="M28 30 Q50 18 72 30" fill="' + F + '"/><path d="M42 14 Q50 4 58 14 Q50 22 42 14 Z" fill="none" stroke="' + S + '" stroke-width="3"/><rect x="38" y="46" width="24" height="30" rx="2" fill="none" stroke="' + S + '" stroke-width="2.5"/><path d="M50 50 V72" stroke="' + S + '" stroke-width="2.5"/>'; };
GL.box = function (F, S) { return '<path d="M50 12 L88 32 L50 52 L12 32 Z" fill="' + F + '"/><path d="M12 32 L12 70 L50 90 L50 52 Z" fill="' + F + '" opacity=".8"/><path d="M88 32 L88 70 L50 90 L50 52 Z" fill="' + F + '" opacity=".6"/><path d="M50 18 L80 32 L50 46 L20 32 Z" fill="' + S + '" opacity=".5"/>'; };
GL.clock = function (F, S) { return '<circle cx="50" cy="56" r="34" fill="' + F + '"/><circle cx="50" cy="56" r="27" fill="none" stroke="' + S + '" stroke-width="2.5"/><path d="M50 56 V36 M50 56 L64 64" stroke="' + S + '" stroke-width="4" stroke-linecap="round"/><circle cx="50" cy="16" r="6" fill="none" stroke="' + F + '" stroke-width="4"/><rect x="46" y="20" width="8" height="4" fill="' + F + '"/>'; };
GL.cup = function (F, S) { return '<path d="M16 46 H84 Q82 86 50 88 Q18 86 16 46 Z" fill="' + F + '"/><path d="M34 34 q-6 -10 2 -18 M50 32 q-6 -10 2 -20 M66 34 q-6 -10 2 -18" stroke="' + S + '" stroke-width="3" fill="none" opacity=".7" stroke-linecap="round"/>'; };
GL.ring = function (F, S) { return '<circle cx="50" cy="60" r="26" fill="none" stroke="' + F + '" stroke-width="9"/><polygon points="50,14 62,26 50,38 38,26" fill="' + S + '"/>'; };
GL.pouch = function (F, S) { return '<path d="M34 30 Q20 50 22 70 Q26 90 50 90 Q74 90 78 70 Q80 50 66 30 Z" fill="' + F + '"/><path d="M30 30 Q50 22 70 30" stroke="' + S + '" stroke-width="5" fill="none"/><path d="M50 26 L42 12 M50 26 L58 12" stroke="' + S + '" stroke-width="3"/>'; };
GL.altar = GL.candle;
ART.glyph = function (name, F, S) { var g = GL[name] || GL.star; return g(F || 'currentColor', S || 'rgba(0,0,0,.5)'); };
ART.glyphSvg = function (name, F, S, cls) { return '<svg class="' + (cls || 'gly') + '" viewBox="0 0 100 100" aria-hidden="true">' + ART.glyph(name, F, S) + '</svg>'; };
ART.hasGlyph = function (n) { return !!GL[n]; };

/* ============================ palettes ============================ */
var PAL = {
  knight: { dark: '#1d0805', mid: '#6e2414', hi: '#ffd59e', gl: '#ef6a38', ac: '#ff9e55' },
  huntress: { dark: '#07170c', mid: '#265733', hi: '#eaffd2', gl: '#83cf72', ac: '#c4ff86' },
  doll: { dark: '#08121f', mid: '#1f4c72', hi: '#e6f6ff', gl: '#74c0ef', ac: '#ffd98a' },
  maiden: { dark: '#120a22', mid: '#47306f', hi: '#f6eeff', gl: '#c0a0f2', ac: '#ffe8ad' },
  status: { dark: '#14171b', mid: '#3a4148', hi: '#dfe4ea', gl: '#93a0ab', ac: '#c9d2da' },
  curse: { dark: '#0d040b', mid: '#3d1033', hi: '#f2c2e3', gl: '#a7438a', ac: '#e47ac2' }
};
ART.PAL = PAL;
var WIN = {
  atk: 'M4 64 L4 30 C4 16 22 8 50 1 C78 8 96 16 96 30 L96 64 Z',
  skl: 'M13 2 L87 2 L98 13 L98 64 L2 64 L2 13 Z',
  pow: 'M2 64 L2 36 A48 34 0 0 1 98 36 L98 64 Z',
  bad: 'M2 64 L2 6 L17 2 L30 8 L44 1 L58 7 L72 2 L86 8 L98 3 L98 64 Z'
};
var ARTCACHE = {};
ART.cardArt = function (id) {
  if (ARTCACHE[id]) return ARTCACHE[id].replace(/§/g, U());
  var d = G.CARDS[id];
  var pk = d.hero || (d.type === 'curse' ? 'curse' : 'status');
  var p = PAL[pk];
  var shape = d.type === 'atk' ? WIN.atk : d.type === 'skl' ? WIN.skl : d.type === 'pow' ? WIN.pow : WIN.bad;
  var R = rng(hash(id)), u = '§';
  var g1 = (d.art && d.art[0]) || 'star', g2 = d.art && d.art[1];
  var s = '<svg class="cd-svg" viewBox="0 0 100 64" preserveAspectRatio="none" aria-hidden="true"><defs>' +
    '<clipPath id="c' + u + '"><path d="' + shape + '"/></clipPath>' +
    '<radialGradient id="b' + u + '" cx="50%" cy="58%" r="70%"><stop offset="0" stop-color="' + p.mid + '"/><stop offset="1" stop-color="' + p.dark + '"/></radialGradient>' +
    '<linearGradient id="f' + u + '" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="' + p.hi + '"/><stop offset=".55" stop-color="' + p.gl + '"/><stop offset="1" stop-color="' + p.mid + '"/></linearGradient>' +
    '<radialGradient id="v' + u + '" cx="50%" cy="45%" r="62%"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".62"/></radialGradient>' +
    '<filter id="g' + u + '" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
    '</defs><g clip-path="url(#c' + u + ')"><rect width="100" height="64" fill="url(#b' + u + ')"/>';
  var motif = Math.floor(R() * 4);
  if (motif === 0) { for (var i = 1; i < 7; i++) s += '<circle cx="50" cy="34" r="' + (i * 9) + '" fill="none" stroke="' + p.ac + '" stroke-opacity="' + (0.16 - i * 0.015) + '" stroke-width="1"/>'; }
  else if (motif === 1) { for (var j = 0; j < 18; j++) { var a = j / 18 * Math.PI * 2; s += '<line x1="50" y1="34" x2="' + (50 + Math.cos(a) * 80).toFixed(1) + '" y2="' + (34 + Math.sin(a) * 80).toFixed(1) + '" stroke="' + p.ac + '" stroke-opacity=".09" stroke-width="' + (j % 2 ? 1 : 2.4) + '"/>'; } }
  else if (motif === 2) { for (var k = 0; k < 16; k++) s += '<circle cx="' + (R() * 100).toFixed(1) + '" cy="' + (R() * 64).toFixed(1) + '" r="' + (0.5 + R() * 1.4).toFixed(2) + '" fill="' + p.hi + '" opacity="' + (0.2 + R() * 0.5).toFixed(2) + '"/>'; }
  else { for (var m = -6; m < 14; m++) s += '<line x1="' + (m * 9) + '" y1="0" x2="' + (m * 9 + 40) + '" y2="64" stroke="' + p.ac + '" stroke-opacity=".07" stroke-width="3"/>'; }
  if (d.type === 'pow') { s += '<circle cx="50" cy="35" r="24" fill="' + p.ac + '" opacity=".12"/><circle cx="50" cy="35" r="27" fill="none" stroke="' + p.hi + '" stroke-opacity=".35" stroke-width=".8"/>'; }
  if (d.type === 'skl') { s += '<polygon points="' + starPts(50, 35, 28, 28, 3) + '" fill="none" stroke="' + p.hi + '" stroke-opacity=".18" stroke-width="1"/>'; }
  if (g2) {
    var sx = R() < 0.5 ? 14 : 66, sy = 6 + R() * 16;
    s += '<g transform="translate(' + sx + ' ' + sy.toFixed(1) + ') scale(.26)" opacity=".55">' + ART.glyph(g2, p.ac, p.dark) + '</g>';
  }
  var rot = (R() - 0.5) * 16;
  s += '<g filter="url(#g' + u + ')" transform="translate(50 35) rotate(' + rot.toFixed(1) + ') scale(.5) translate(-50 -52)">' + ART.glyph(g1, 'url(#f' + u + ')', p.dark) + '</g>';
  if (d.type === 'atk') { s += '<path d="M8 58 L70 4 L74 6 L14 62 Z" fill="#fff" opacity=".07"/><path d="M30 64 L92 10 L94 13 L36 64 Z" fill="#fff" opacity=".05"/>'; }
  s += '<rect width="100" height="64" fill="url(#v' + u + ')"/></g>' +
    '<path d="' + shape + '" fill="none" stroke="rgba(0,0,0,.65)" stroke-width="2.4"/><path d="' + shape + '" fill="none" stroke="' + p.ac + '" stroke-opacity=".55" stroke-width=".8"/></svg>';
  ARTCACHE[id] = s;
  return s.replace(/§/g, U());
};

/* ============================ small icons ============================ */
ART.relic = function (id) {
  var r = G.RELICS[id], u = U();
  var c = r.color || '#d9b25f';
  return '<svg class="relic-svg" viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="r' + u + '" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".35" stop-color="' + c + '"/><stop offset="1" stop-color="#1a120a"/></radialGradient></defs>' +
    '<circle cx="32" cy="32" r="29" fill="#14100c" stroke="' + (r.rarity === 'B' ? '#c9a2ff' : r.rarity === 'R' ? '#f2c45a' : r.rarity === 'U' ? '#8fc4ea' : '#a7a097') + '" stroke-width="2.5"/>' +
    '<circle cx="32" cy="32" r="25" fill="none" stroke="rgba(255,255,255,.08)"/>' +
    '<g transform="translate(13 13) scale(.38)">' + ART.glyph(r.glyph || 'star', 'url(#r' + u + ')', 'rgba(20,12,6,.85)') + '</g></svg>';
};
ART.potion = function (id) {
  var p = G.POTIONS[id], u = U(), c = p.color || '#e55';
  return '<svg class="potion-svg" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="p' + u + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".3" stop-color="' + c + '"/><stop offset="1" stop-color="#000" stop-opacity=".6"/></linearGradient></defs>' +
    '<path d="M25 6 h14 v4 h-2 v10 c10 4 15 12 15 22 c0 11 -9 18 -20 18 c-11 0 -20 -7 -20 -18 c0 -10 5 -18 15 -22 v-10 h-2 z" fill="rgba(220,235,255,.18)" stroke="rgba(240,240,255,.7)" stroke-width="1.6"/>' +
    '<path d="M14 42 c0 -3 1 -6 3 -8 c6 3 14 3 30 0 c2 2 3 5 3 8 c0 10 -8 16 -18 16 c-10 0 -18 -6 -18 -16 z" fill="url(#p' + u + ')"/>' +
    '<ellipse cx="24" cy="38" rx="3" ry="6" fill="#fff" opacity=".4"/><rect x="24" y="3" width="16" height="6" rx="2" fill="#8a5a34"/></svg>';
};
ART.potionEmpty = function () { return '<svg class="potion-svg empty" viewBox="0 0 64 64" aria-hidden="true"><path d="M25 6 h14 v4 h-2 v10 c10 4 15 12 15 22 c0 11 -9 18 -20 18 c-11 0 -20 -7 -20 -18 c0 -10 5 -18 15 -22 v-10 h-2 z" fill="none" stroke="rgba(240,230,210,.25)" stroke-width="1.6" stroke-dasharray="3 3"/></svg>'; };

var ICON = {
  attack: '<path d="M8 56 L44 20 L52 8 L56 12 L44 20 L48 24 L12 60 Z" fill="#e8e4dc"/><path d="M10 50 L18 58 L12 62 L4 54 Z" fill="#7a4a2a"/><path d="M40 16 L56 4 L60 8 L48 24 Z" fill="#fff"/>',
  block: '<path d="M32 4 L56 12 Q56 42 32 60 Q8 42 8 12 Z" fill="#6fb4e8" stroke="#dff2ff" stroke-width="3"/>',
  buff: '<path d="M32 6 L54 32 L40 32 L40 58 L24 58 L24 32 L10 32 Z" fill="#ffb347" stroke="#fff3d6" stroke-width="2"/>',
  debuff: '<path d="M32 58 L54 32 L40 32 L40 6 L24 6 L24 32 L10 32 Z" fill="#b48ae6" stroke="#f0e4ff" stroke-width="2"/>',
  status: '<rect x="14" y="8" width="30" height="42" rx="4" fill="#cfd6dc" stroke="#33393f" stroke-width="2" transform="rotate(-12 29 29)"/><rect x="22" y="14" width="30" height="42" rx="4" fill="#e9eef2" stroke="#33393f" stroke-width="2" transform="rotate(8 37 35)"/>',
  summon: '<circle cx="32" cy="34" r="20" fill="#7fd38a" stroke="#e8ffe8" stroke-width="3"/><path d="M32 22 V46 M20 34 H44" stroke="#14301a" stroke-width="6" stroke-linecap="round"/>',
  sleep: '<text x="10" y="40" font-size="26" font-weight="900" fill="#cfe3ff" font-family="sans-serif">Z</text><text x="30" y="26" font-size="18" font-weight="900" fill="#cfe3ff" font-family="sans-serif">z</text><text x="44" y="16" font-size="12" font-weight="900" fill="#cfe3ff" font-family="sans-serif">z</text>',
  stun: '<circle cx="32" cy="32" r="16" fill="none" stroke="#ffe066" stroke-width="4" stroke-dasharray="6 5"/><polygon points="' + starPts(14, 14, 8, 3.4, 5) + '" fill="#ffe066"/><polygon points="' + starPts(52, 18, 7, 3, 5) + '" fill="#ffe066"/>',
  charge: '<path d="M32 6 A26 26 0 1 1 6 32" fill="none" stroke="#ffd166" stroke-width="5" stroke-linecap="round"/><path d="M6 20 L6 34 L20 34" fill="none" stroke="#ffd166" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="32" r="8" fill="#ffd166"/>',
  flee: '<path d="M10 34 H42 M30 20 L44 34 L30 48" stroke="#e8e0d0" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M48 14 V54" stroke="#e8e0d0" stroke-width="5" stroke-linecap="round" opacity=".5"/>',
  special: '<polygon points="' + starPts(32, 32, 26, 11, 6) + '" fill="#ffd166" stroke="#fff6dc" stroke-width="2"/>',
  unknown: '<circle cx="32" cy="32" r="24" fill="#3a3330" stroke="#c8b89a" stroke-width="3"/><text x="32" y="43" text-anchor="middle" font-size="30" font-weight="900" fill="#e8dcc2" font-family="sans-serif">?</text>'
};
ART.icon = function (k, cls) { return '<svg class="' + (cls || 'ico') + '" viewBox="0 0 64 64" aria-hidden="true">' + (ICON[k] || ICON.unknown) + '</svg>'; };

var STAT = {
  str: ['fist', '#ff8a4a', '闘気'], weak: ['crack', '#b8a2e0', '怯み'], vuln: ['burst', '#ff6f8f', '隙'], poison: ['drop', '#7be07b', '毒'],
  thorns: ['vine', '#9bd17a', '棘'], sleep: ['moon', '#a9c7ff', '眠り'], stun: ['stars', '#ffe066', 'ふらつき'], plated: ['tower', '#a7b4c2', '鉄皮'],
  retaliate: ['flame', '#ff8f4a', '炎の壁'], keep: ['smoke', '#b9c8d6', '霧隠れ'], next: ['hourglass', '#e8d29a', '次のターン']
};
ART.STAT = STAT;
ART.status = function (k) { var s = STAT[k] || ['star', '#fff', k]; return '<svg class="st-svg" viewBox="0 0 100 100" aria-hidden="true">' + ART.glyph(s[0], s[1], 'rgba(0,0,0,.55)') + '</svg>'; };

ART.orb = function (type) {
  var c = type === 'spark' ? ['#fff7c2', '#ffd447', '#9a6a00'] : type === 'frost' ? ['#f0fbff', '#7fd3ff', '#1d5d86'] : ['#f0d9ff', '#a35cff', '#2d0b52'];
  var u = U();
  var inner = type === 'spark' ? GL.bolt('#fffbe0') : type === 'frost' ? GL.snow('#ffffff') : GL.moon('#f3e6ff');
  return '<svg class="orb-svg orb-' + type + '" viewBox="0 0 100 100" aria-hidden="true"><defs><radialGradient id="o' + u + '" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="' + c[0] + '"/><stop offset=".45" stop-color="' + c[1] + '"/><stop offset="1" stop-color="' + c[2] + '"/></radialGradient></defs>' +
    '<circle cx="50" cy="50" r="44" fill="url(#o' + u + ')"/><circle cx="50" cy="50" r="44" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2"/><g transform="translate(26 26) scale(.48)" opacity=".85">' + inner + '</g></svg>';
};

var NODE = { enc: ['skull', '#d8cfc0'], elite: ['horn', '#ff8a5c'], event: ['eye', '#c6b4f0'], rest: ['flame', '#ffb35c'], shop: ['coin', '#f2cc5a'], treasure: ['box', '#e8c070'], start: ['skull', '#d8cfc0'], boss: ['crown', '#ff6a4a'] };
ART.node = function (kind) { var n = NODE[kind] || NODE.enc; return '<svg class="node-svg" viewBox="0 0 100 100" aria-hidden="true">' + ART.glyph(n[0], n[1], 'rgba(30,20,10,.75)') + '</svg>'; };
ART.NODE_NAME = { enc: '戦闘', elite: '強敵', event: '異聞', rest: '焚き火', shop: '行商人', treasure: '宝箱', start: '戦闘', boss: '層の主' };

/* ============================ heroes (200×240) ============================ */
var HERO = {};
HERO.knight = function (u) {
  return '<defs>' +
    '<linearGradient id="ka' + u + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6c727c"/><stop offset=".5" stop-color="#2c3036"/><stop offset="1" stop-color="#121417"/></linearGradient>' +
    '<linearGradient id="kc' + u + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a1c12"/><stop offset="1" stop-color="#2a0806"/></linearGradient>' +
    '<linearGradient id="ks' + u + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9aa3ad"/><stop offset=".5" stop-color="#f0f4f8"/><stop offset="1" stop-color="#7b838c"/></linearGradient>' +
    '<radialGradient id="ke' + u + '" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffe2a8"/><stop offset=".5" stop-color="#ff7a2a"/><stop offset="1" stop-color="#ff3a0a" stop-opacity="0"/></radialGradient>' +
    '</defs>' +
    '<ellipse cx="100" cy="232" rx="62" ry="7" fill="#000" opacity=".45"/>' +
    '<path d="M74 82 C58 120 46 170 38 226 L54 218 L62 230 L74 220 L86 232 L98 222 L110 232 L122 222 L130 228 C128 170 126 120 120 84 Z" fill="url(#kc' + u + ')"/>' +
    '<path d="M86 150 L80 228 L98 228 L100 152 Z M104 152 L106 228 L124 228 L118 150 Z" fill="url(#ka' + u + ')"/>' +
    '<path d="M76 222 h26 v8 h-28 z M102 222 h26 l2 8 h-28 z" fill="#1a1c1f"/>' +
    '<path d="M72 80 Q100 70 128 80 L124 142 Q100 154 76 142 Z" fill="url(#ka' + u + ')"/>' +
    '<path d="M86 92 L94 108 L88 122 M112 94 L106 112 L114 126 M98 114 L102 132" stroke="#ff7a2a" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
    '<path d="M86 92 L94 108 L88 122 M112 94 L106 112 L114 126 M98 114 L102 132" stroke="#ffd59e" stroke-width=".9" fill="none" stroke-linecap="round"/>' +
    '<circle cx="100" cy="112" r="9" fill="url(#ke' + u + ')" class="pulse-glow"/>' +
    '<path d="M76 140 Q100 150 124 140 L126 154 Q100 162 74 154 Z" fill="#3b2a1e"/>' +
    '<ellipse cx="66" cy="88" rx="18" ry="13" fill="url(#ka' + u + ')"/><ellipse cx="134" cy="88" rx="18" ry="13" fill="url(#ka' + u + ')"/>' +
    '<path d="M54 92 L50 136 L62 140 L70 96 Z" fill="url(#ka' + u + ')"/>' +
    '<path d="M140 92 L156 70 L164 74 L150 100 Z" fill="url(#ka' + u + ')"/>' +
    '<rect x="152" y="34" width="9" height="30" rx="2" fill="#3b2a1e"/>' +
    '<path d="M136 64 Q156 58 176 64 L176 70 Q156 66 136 70 Z" fill="#c8a25a"/>' +
    '<path d="M150 70 L163 70 L163 214 L156.5 230 L150 214 Z" fill="url(#ks' + u + ')"/>' +
    '<path d="M156.5 74 V212" stroke="#5a626b" stroke-width="2"/>' +
    '<circle cx="156.5" cy="30" r="5.5" fill="#c8a25a"/>' +
    '<path d="M84 30 Q100 16 116 30 L118 66 Q100 76 82 66 Z" fill="url(#ka' + u + ')"/>' +
    '<path d="M84 30 Q100 16 116 30" fill="none" stroke="#9aa3ad" stroke-width="1.5"/>' +
    '<path d="M86 46 H114" stroke="#ff7a2a" stroke-width="3.2" stroke-linecap="round" class="visor"/>' +
    '<path d="M86 46 H114" stroke="#ffe3b0" stroke-width="1" stroke-linecap="round"/>' +
    '<path d="M100 50 V64" stroke="#121417" stroke-width="2"/>' +
    '<path d="M100 16 C92 6 84 4 74 8 C84 10 90 14 94 22 Z" fill="#8a1d12"/>' +
    '<g class="embers"><circle cx="70" cy="60" r="1.6" fill="#ffb060"/><circle cx="132" cy="50" r="1.2" fill="#ffd090"/><circle cx="60" cy="150" r="1.4" fill="#ff8a40"/><circle cx="140" cy="130" r="1.1" fill="#ffc070"/></g>';
};
HERO.huntress = function (u) {
  return '<defs>' +
    '<radialGradient id="hw' + u + '" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#d8ecc8" stop-opacity=".95"/><stop offset=".7" stop-color="#7fa678" stop-opacity=".8"/><stop offset="1" stop-color="#3b5a3a" stop-opacity=".7"/></radialGradient>' +
    '<linearGradient id="hb' + u + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2e3d31"/><stop offset="1" stop-color="#121a14"/></linearGradient>' +
    '</defs>' +
    '<ellipse cx="100" cy="232" rx="54" ry="7" fill="#000" opacity=".45"/>' +
    '<g class="wings">' +
    '<path d="M96 84 C70 40 22 26 12 58 C6 82 44 104 96 104 Z" fill="url(#hw' + u + ')"/>' +
    '<path d="M104 84 C130 40 178 26 188 58 C194 82 156 104 104 104 Z" fill="url(#hw' + u + ')"/>' +
    '<path d="M96 108 C66 112 34 142 46 168 C58 186 88 156 96 126 Z" fill="url(#hw' + u + ')" opacity=".9"/>' +
    '<path d="M104 108 C134 112 166 142 154 168 C142 186 112 156 104 126 Z" fill="url(#hw' + u + ')" opacity=".9"/>' +
    '<circle cx="44" cy="62" r="11" fill="#2f4a2e"/><circle cx="44" cy="62" r="5" fill="#e9f5c8"/><circle cx="156" cy="62" r="11" fill="#2f4a2e"/><circle cx="156" cy="62" r="5" fill="#e9f5c8"/>' +
    '<path d="M96 90 C70 70 44 60 22 58 M96 96 C70 86 48 84 26 84 M104 90 C130 70 156 60 178 58 M104 96 C130 86 152 84 174 84" stroke="#3b5a3a" stroke-width="1.2" fill="none" opacity=".7"/>' +
    '</g>' +
    '<path d="M88 150 L82 226 L94 226 L100 156 Z M102 156 L108 226 L120 226 L114 150 Z" fill="#1b241d"/>' +
    '<path d="M80 222 h16 v6 h-18 z M106 222 h16 l2 6 h-18 z" fill="#0d120e"/>' +
    '<path d="M82 74 L118 74 L114 150 L86 150 Z" fill="url(#hb' + u + ')"/>' +
    '<path d="M84 124 H116" stroke="#6b5233" stroke-width="5"/><rect x="104" y="120" width="8" height="10" rx="2" fill="#4a3a26"/>' +
    '<path d="M82 78 L64 112 L58 140 L66 142 L74 116 L88 92 Z" fill="url(#hb' + u + ')"/>' +
    '<path d="M60 140 L56 172" stroke="#c9d6cf" stroke-width="2.4"/><path d="M54 140 h10 v3 h-10 z" fill="#8a7a5a"/>' +
    '<path d="M118 78 L138 60 L150 40 L156 44 L144 66 L122 92 Z" fill="url(#hb' + u + ')"/>' +
    '<g class="needles-held"><path d="M150 40 L170 8" stroke="#e8f0e8" stroke-width="1.6"/><path d="M153 41 L178 14" stroke="#e8f0e8" stroke-width="1.6"/><path d="M155 44 L184 24" stroke="#e8f0e8" stroke-width="1.6"/></g>' +
    '<path d="M100 18 C84 18 78 32 80 50 L82 76 L118 76 L120 50 C122 32 116 18 100 18 Z" fill="#1d2a20"/>' +
    '<path d="M86 42 Q100 34 114 42 L112 60 Q100 66 88 60 Z" fill="#0a0f0b"/>' +
    '<ellipse cx="93" cy="47" rx="3.4" ry="2" fill="#c4ff86" class="eye-glow"/><ellipse cx="107" cy="47" rx="3.4" ry="2" fill="#c4ff86" class="eye-glow"/>' +
    '<path d="M88 52 Q100 58 112 52 L110 72 Q100 78 90 72 Z" fill="#c9d4c4" opacity=".85"/>' +
    '<g class="moths"><g class="moth-a" transform="translate(30 30) scale(.12)">' + GL.moth('#e6f3d4', '#3b5a3a') + '</g><g class="moth-b" transform="translate(160 120) scale(.1)">' + GL.moth('#e6f3d4', '#3b5a3a') + '</g></g>';
};
HERO.doll = function (u) {
  return '<defs>' +
    '<linearGradient id="db' + u + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe7a6"/><stop offset=".45" stop-color="#c8963a"/><stop offset="1" stop-color="#5e4114"/></linearGradient>' +
    '<radialGradient id="df' + u + '" cx="42%" cy="38%" r="70%"><stop offset="0" stop-color="#fffdf8"/><stop offset=".7" stop-color="#ece4d6"/><stop offset="1" stop-color="#b9ad9a"/></radialGradient>' +
    '<radialGradient id="dc' + u + '" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#8fe0ff"/><stop offset="1" stop-color="#1f6fa8" stop-opacity="0"/></radialGradient>' +
    '</defs>' +
    '<ellipse cx="100" cy="232" rx="50" ry="7" fill="#000" opacity=".45"/>' +
    '<g class="windkey" style="transform-origin:62px 112px"><rect x="40" y="108" width="24" height="8" rx="3" fill="url(#db' + u + ')"/><path d="M28 96 C20 96 18 104 22 110 C18 116 20 124 28 124 C36 124 38 116 34 112 L40 112 L40 108 L34 108 C38 104 36 96 28 96 Z" fill="url(#db' + u + ')"/></g>' +
    '<path d="M92 160 L88 222 L96 222 L100 162 Z M102 162 L106 222 L114 222 L110 160 Z" fill="#3a3026"/>' +
    '<circle cx="92" cy="190" r="5" fill="url(#db' + u + ')"/><circle cx="110" cy="190" r="5" fill="url(#db' + u + ')"/>' +
    '<path d="M84 220 h14 v7 h-16 z M104 220 h14 l2 7 h-16 z" fill="url(#db' + u + ')"/>' +
    '<path d="M78 80 Q100 70 122 80 L140 160 Q100 174 60 160 Z" fill="url(#db' + u + ')"/>' +
    '<path d="M80 100 Q100 94 120 100 M74 126 Q100 120 126 126 M68 148 Q100 142 132 148" stroke="#5e4114" stroke-width="1.6" fill="none" opacity=".7"/>' +
    '<circle cx="100" cy="112" r="12" fill="#10283c" stroke="#5e4114" stroke-width="2"/><circle cx="100" cy="112" r="16" fill="url(#dc' + u + ')" class="pulse-glow"/>' +
    '<circle cx="76" cy="84" r="7" fill="#3a3026"/><circle cx="124" cy="84" r="7" fill="#3a3026"/>' +
    '<path d="M70 88 L60 120 L64 122 L76 92 Z" fill="url(#db' + u + ')"/><circle cx="60" cy="122" r="5" fill="#3a3026"/><path d="M58 124 L54 150 L60 150 L64 126 Z" fill="url(#db' + u + ')"/>' +
    '<path d="M130 88 L150 70 L154 74 L136 94 Z" fill="url(#db' + u + ')"/><circle cx="152" cy="70" r="5" fill="#3a3026"/>' +
    '<path d="M154 66 L170 52 M156 70 L174 62 M154 72 L170 76" stroke="url(#db' + u + ')" stroke-width="4" stroke-linecap="round"/>' +
    '<rect x="96" y="64" width="8" height="12" fill="#3a3026"/>' +
    '<circle cx="100" cy="46" r="22" fill="url(#df' + u + ')"/>' +
    '<path d="M110 30 L106 42 L112 48" stroke="#9a8f80" stroke-width="1" fill="none"/>' +
    '<circle cx="92" cy="46" r="4.2" fill="#1c1a1a"/><circle cx="108" cy="46" r="4.2" fill="#1c1a1a"/>' +
    '<circle cx="93" cy="45" r="1.5" fill="#8fe0ff" class="eye-glow"/><circle cx="109" cy="45" r="1.5" fill="#8fe0ff" class="eye-glow"/>' +
    '<circle cx="86" cy="54" r="3.5" fill="#f0a6a6" opacity=".55"/><circle cx="114" cy="54" r="3.5" fill="#f0a6a6" opacity=".55"/>' +
    '<path d="M96 58 Q100 60 104 58" stroke="#7a6a60" stroke-width="1.4" fill="none"/>' +
    '<path d="M80 34 Q100 16 120 34 L118 28 Q100 12 82 28 Z" fill="url(#db' + u + ')"/>' +
    '<g transform="translate(108 14) scale(.16)">' + GL.gear('#e2b450', '#5e4114') + '</g>';
};
HERO.maiden = function (u) {
  var ring = '';
  for (var i = 0; i < 9; i++) { var a = i / 9 * Math.PI * 2; ring += '<polygon points="' + starPts(100 + Math.cos(a) * 62, 96 + Math.sin(a) * 62, i % 3 ? 3 : 5, i % 3 ? 1.2 : 2, 4) + '" fill="#ffe8ad"/>'; }
  return '<defs>' +
    '<linearGradient id="mh' + u + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b3e8f"/><stop offset="1" stop-color="#1e1236"/></linearGradient>' +
    '<linearGradient id="mk' + u + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfc4e4"/></linearGradient>' +
    '<linearGradient id="mr' + u + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b1d47"/><stop offset="1" stop-color="#0f0a1c"/></linearGradient>' +
    '</defs>' +
    '<ellipse cx="100" cy="232" rx="56" ry="7" fill="#000" opacity=".45"/>' +
    '<g class="starring" style="transform-origin:100px 96px"><circle cx="100" cy="96" r="62" fill="none" stroke="#ffe8ad" stroke-opacity=".35" stroke-width="1.2"/><circle cx="100" cy="96" r="56" fill="none" stroke="#ffe8ad" stroke-opacity=".15" stroke-width=".8" stroke-dasharray="2 6"/>' + ring + '</g>' +
    '<path d="M86 30 C70 50 66 110 72 170 L128 170 C134 110 130 50 114 30 Z" fill="url(#mr' + u + ')"/>' +
    '<path d="M76 120 Q100 112 124 120 L138 226 L62 226 Z" fill="url(#mh' + u + ')"/>' +
    '<path d="M100 122 L100 226 M84 124 L76 226 M116 124 L124 226" stroke="#7a5aa8" stroke-width="1.4" opacity=".6"/>' +
    '<path d="M80 74 Q100 66 120 74 L126 124 Q100 130 74 124 Z" fill="url(#mk' + u + ')"/>' +
    '<path d="M88 74 L100 96 L112 74" stroke="#b9acd6" stroke-width="2" fill="none"/>' +
    '<rect x="74" y="114" width="52" height="10" fill="#6a3fa0"/><path d="M98 114 h6 v10 h-6 z" fill="#ffd27a"/>' +
    '<path d="M80 78 C64 92 54 112 50 136 L74 140 C76 120 80 104 88 92 Z" fill="url(#mk' + u + ')"/>' +
    '<path d="M120 78 C138 84 150 70 156 54 L166 58 C160 80 144 100 122 100 Z" fill="url(#mk' + u + ')"/>' +
    '<rect x="158" y="30" width="12" height="28" rx="1" fill="#fff8e6" stroke="#c9a85a" stroke-width="1" transform="rotate(14 164 44)" class="talisman"/>' +
    '<path d="M161 36 l6 1 M160 42 l7 2 M160 48 l5 1" stroke="#b33" stroke-width="1.3" transform="rotate(14 164 44)"/>' +
    '<path d="M86 30 C80 20 90 10 100 10 C110 10 120 20 114 30 L112 56 Q100 66 88 56 Z" fill="url(#mr' + u + ')"/>' +
    '<path d="M89 30 Q100 22 111 30 L110 52 Q100 60 90 52 Z" fill="#f4ecf8"/>' +
    '<path d="M92 40 Q95 42 98 40 M102 40 Q105 42 108 40" stroke="#5a4a6a" stroke-width="1.4" fill="none" stroke-linecap="round"/>' +
    '<path d="M98 49 Q100 50 102 49" stroke="#c48aa0" stroke-width="1.2" fill="none"/>' +
    '<path d="M86 28 C90 18 110 18 114 28 C106 22 94 22 86 28 Z" fill="url(#mr' + u + ')"/>' +
    '<path d="M110 8 A10 10 0 1 0 110 26 A8 8 0 1 1 110 8 Z" fill="#ffd27a"/>';
};
ART.hero = function (id) { var u = U(); return '<svg class="hero-svg hero-' + id + '" viewBox="0 0 200 240" aria-hidden="true">' + HERO[id](u) + '</svg>'; };

/* ============================ enemies (200×200) ============================ */
var EA = {};
function eyes(x1, y1, x2, y2, r, col) { col = col || '#ff5a3a'; return '<circle cx="' + x1 + '" cy="' + y1 + '" r="' + r + '" fill="' + col + '" class="eye-glow"/><circle cx="' + x2 + '" cy="' + y2 + '" r="' + r + '" fill="' + col + '" class="eye-glow"/>'; }
function shadow(rx) { return '<ellipse cx="100" cy="190" rx="' + rx + '" ry="7" fill="#000" opacity=".45"/>'; }
function grad(id, a, b, c) { return '<linearGradient id="' + id + '" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="' + a + '"/><stop offset=".6" stop-color="' + b + '"/><stop offset="1" stop-color="' + (c || b) + '"/></linearGradient>'; }
function rgrad(id, a, b, c) { return '<radialGradient id="' + id + '" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="' + a + '"/><stop offset=".6" stop-color="' + b + '"/><stop offset="1" stop-color="' + c + '"/></radialGradient>'; }
EA.rat = function (u) {
  return '<defs>' + grad('r' + u, '#6b5a4c', '#3a2f27', '#1f1915') + '</defs>' + shadow(56) +
    '<path d="M150 170 C176 164 190 140 182 118" stroke="#8a6a5a" stroke-width="5" fill="none" stroke-linecap="round"/>' +
    '<path d="M44 168 C40 130 70 100 112 104 C146 106 162 132 160 160 C158 176 140 182 110 182 L60 182 C50 182 44 176 44 168 Z" fill="url(#r' + u + ')"/>' +
    '<path d="M70 108 C76 96 90 92 98 100 C104 90 118 92 122 104 C130 98 142 104 140 116" fill="#4f7a3a"/><circle cx="84" cy="102" r="6" fill="#6aa04a"/><circle cx="116" cy="100" r="5" fill="#5f9442"/>' +
    '<path d="M52 140 C36 136 24 146 20 156 C30 160 44 160 56 156 Z" fill="url(#r' + u + ')"/>' +
    '<circle cx="46" cy="132" r="9" fill="#5a4a3e"/><circle cx="46" cy="132" r="4.5" fill="#b07a7a"/>' +
    '<circle cx="22" cy="156" r="3" fill="#e0a0a0"/>' + eyes(40, 146, 34, 148, 2.6, '#ff4a3a') +
    '<path d="M70 182 l-4 6 M84 182 l-2 6 M130 182 l2 6 M144 180 l4 6" stroke="#2a201a" stroke-width="3" stroke-linecap="round"/>';
};
function slime(u, c1, c2, c3, scale, extra) {
  var s = scale || 1, w = 70 * s, h = 58 * s, y = 186 - h;
  return '<defs>' + rgrad('s' + u, c1, c2, c3) + '</defs>' + shadow(w * 0.95) +
    '<path d="M' + (100 - w) + ' 186 C' + (100 - w) + ' ' + (y + h * 0.3) + ' ' + (100 - w * 0.6) + ' ' + y + ' 100 ' + y + ' C' + (100 + w * 0.6) + ' ' + y + ' ' + (100 + w) + ' ' + (y + h * 0.3) + ' ' + (100 + w) + ' 186 Z" fill="url(#s' + u + ')" class="wobble"/>' +
    '<ellipse cx="' + (100 - w * 0.35) + '" cy="' + (y + h * 0.28) + '" rx="' + (w * 0.18) + '" ry="' + (h * 0.12) + '" fill="#fff" opacity=".35"/>' +
    '<ellipse cx="' + (100 - w * 0.25) + '" cy="' + (y + h * 0.55) + '" rx="' + (5 * s) + '" ry="' + (7 * s) + '" fill="#111"/><ellipse cx="' + (100 + w * 0.25) + '" cy="' + (y + h * 0.55) + '" rx="' + (5 * s) + '" ry="' + (7 * s) + '" fill="#111"/>' +
    '<circle cx="' + (100 - w * 0.25 - 1.5 * s) + '" cy="' + (y + h * 0.5) + '" r="' + (1.8 * s) + '" fill="#fff"/><circle cx="' + (100 + w * 0.25 - 1.5 * s) + '" cy="' + (y + h * 0.5) + '" r="' + (1.8 * s) + '" fill="#fff"/>' + (extra || '');
}
EA.slime_s = function (u) { return slime(u, '#a8b878', '#5e6e3c', '#2c341c', 0.6); };
EA.slime_s2 = function (u) { return slime(u, '#b8a878', '#6e5a3c', '#34281c', 0.6); };
EA.slime_m = function (u) { return slime(u, '#a8b878', '#5e6e3c', '#2c341c', 0.85, '<path d="M88 150 Q100 158 112 150" stroke="#111" stroke-width="2.5" fill="none"/>'); };
EA.slime_l = function (u) { return slime(u, '#b2c282', '#617440', '#283218', 1.25, '<path d="M78 140 Q100 156 122 140" stroke="#111" stroke-width="3.5" fill="none"/><circle cx="60" cy="176" r="5" fill="#617440"/><circle cx="148" cy="172" r="4" fill="#617440"/>'); };
EA.acid = function (u) { return slime(u, '#f0ff9a', '#a6c43a', '#4a5a10', 0.9, '<circle cx="80" cy="130" r="4" fill="#f6ffc0" opacity=".7"/><circle cx="122" cy="146" r="3" fill="#f6ffc0" opacity=".7"/><circle cx="104" cy="122" r="2.5" fill="#f6ffc0" opacity=".7"/>'); };
EA.spike = function (u) {
  var spikes = '<path d="M60 150 L52 128 L72 142 Z M84 128 L84 104 L98 126 Z M114 126 L124 104 L128 132 Z M140 146 L156 130 L150 156 Z" fill="#7a4a9a"/>';
  return slime(u, '#e0b8f0', '#8a5aa8', '#3a1a4a', 0.9, spikes);
};
EA.b_slime = function (u) {
  var reeds = '<path d="M64 74 L58 30 L70 72 M80 66 L80 18 L88 64 M112 64 L122 22 L120 66 M134 72 L148 34 L140 76" stroke="#3a5a2a" stroke-width="4" stroke-linecap="round"/><ellipse cx="58" cy="30" rx="4" ry="9" fill="#5a3a20"/><ellipse cx="80" cy="18" rx="4" ry="9" fill="#5a3a20"/><ellipse cx="122" cy="22" rx="4" ry="9" fill="#5a3a20"/><ellipse cx="148" cy="34" rx="4" ry="9" fill="#5a3a20"/>';
  return slime(u, '#9aa86a', '#4a5a30', '#1c2412', 1.42, reeds + '<path d="M66 140 Q100 170 134 140 Q100 156 66 140 Z" fill="#1a1208"/><path d="M76 144 l4 8 l4 -7 M92 148 l3 8 l4 -8 M108 148 l4 8 l3 -8 M122 144 l3 7 l4 -8" stroke="#e8e0c0" stroke-width="2" fill="none"/>');
};
EA.b_spawn = function (u) { return slime(u, '#9aa86a', '#4a5a30', '#1c2412', 0.95, '<path d="M84 152 Q100 164 116 152" stroke="#111" stroke-width="3" fill="none"/>'); };
EA.pillbug = function (u) {
  var seg = '';
  for (var i = 0; i < 5; i++) seg += '<path d="M' + (52 + i * 22) + ' 176 C' + (50 + i * 22) + ' 130 ' + (60 + i * 22) + ' 112 ' + (74 + i * 22) + ' 112" stroke="#2a3440" stroke-width="2.5" fill="none" opacity=".7"/>';
  return '<defs>' + rgrad('p' + u, '#9fb0c4', '#4f6276', '#1e2732') + '</defs>' + shadow(66) +
    '<path d="M36 182 C30 130 60 100 104 100 C150 100 172 132 166 182 Z" fill="url(#p' + u + ')"/>' + seg +
    '<path d="M70 106 L64 86 L80 104 Z M104 100 L104 78 L114 100 Z M140 108 L150 88 L150 114 Z" fill="#c8d4e0"/>' +
    '<path d="M36 170 C22 168 16 156 20 146 C28 150 34 156 40 164 Z" fill="#3a4654"/>' + eyes(26, 154, 32, 158, 2.4, '#ffd24a') +
    '<path d="M22 146 C14 132 10 120 12 110 M26 146 C24 132 26 120 30 112" stroke="#3a4654" stroke-width="2" fill="none"/>' +
    '<path d="M60 182 l-6 6 M84 184 l-4 5 M120 184 l4 5 M146 182 l6 6" stroke="#1e2732" stroke-width="3" stroke-linecap="round"/>';
};
EA.wisp = function (u) {
  return '<defs><radialGradient id="w' + u + '" cx="50%" cy="55%" r="55%"><stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#9fe4ff"/><stop offset="1" stop-color="#2a7ab0" stop-opacity="0"/></radialGradient></defs>' +
    '<ellipse cx="100" cy="190" rx="30" ry="5" fill="#7fd3ff" opacity=".25"/>' +
    '<g class="float"><circle cx="100" cy="110" r="56" fill="url(#w' + u + ')"/>' +
    '<path d="M100 40 C120 70 136 86 130 116 C126 136 112 146 100 146 C88 146 74 136 70 116 C64 86 80 70 100 40 Z" fill="#cff2ff" opacity=".85"/>' +
    '<path d="M100 76 C110 94 116 104 112 120 C110 130 104 134 100 134 C96 134 90 130 88 120 C84 104 90 94 100 76 Z" fill="#fff"/>' +
    '<ellipse cx="92" cy="112" rx="3.6" ry="5" fill="#123a52"/><ellipse cx="108" cy="112" rx="3.6" ry="5" fill="#123a52"/>' +
    '<path d="M76 150 C70 166 76 176 84 180 M120 150 C128 164 124 176 116 182" stroke="#9fe4ff" stroke-width="3" fill="none" opacity=".6" stroke-linecap="round"/></g>';
};
EA.crab = function (u) {
  return '<defs>' + rgrad('c' + u, '#a49686', '#5a4c40', '#241c16') + '</defs>' + shadow(80) +
    '<path d="M30 178 l-14 10 M44 180 l-8 10 M156 180 l8 10 M170 178 l14 10 M58 182 l-4 8 M142 182 l4 8" stroke="#3a2e26" stroke-width="5" stroke-linecap="round"/>' +
    '<path d="M36 176 C30 140 60 112 100 112 C140 112 170 140 164 176 C140 186 60 186 36 176 Z" fill="url(#c' + u + ')"/>' +
    '<path d="M54 130 C70 120 80 126 92 118 C104 126 122 116 140 128" stroke="#4f7a3a" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="76" cy="122" r="5" fill="#6aa04a"/><circle cx="124" cy="120" r="4" fill="#6aa04a"/>' +
    '<path d="M84 114 L80 92 M116 114 L120 92" stroke="#3a2e26" stroke-width="4"/>' + eyes(80, 90, 120, 90, 5, '#ffcf4a') +
    '<path d="M40 150 C20 140 10 118 18 98 C26 80 44 76 56 86 L46 104 L62 102 C66 120 58 140 40 150 Z" fill="url(#c' + u + ')"/>' +
    '<path d="M160 156 C176 150 186 136 182 120 C178 108 166 106 158 112 L164 124 L152 124 C150 136 152 148 160 156 Z" fill="url(#c' + u + ')"/>';
};
EA.chanter = function (u) {
  return '<defs>' + grad('h' + u, '#8a2a26', '#4a1210', '#240806') + '<radialGradient id="hf' + u + '" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff2c0"/><stop offset=".5" stop-color="#ffb347"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/></radialGradient></defs>' + shadow(48) +
    '<path d="M70 186 C70 140 76 100 100 60 C124 100 130 140 130 186 Z" fill="url(#h' + u + ')"/>' +
    '<path d="M100 40 C80 40 72 58 74 80 L100 100 L126 80 C128 58 120 40 100 40 Z" fill="url(#h' + u + ')"/>' +
    '<path d="M86 64 Q100 56 114 64 L112 86 Q100 94 88 86 Z" fill="#efe6d4"/><path d="M90 92 L88 100 M100 94 L100 104 M110 92 L112 102" stroke="#efe6d4" stroke-width="3" stroke-linecap="round"/>' +
    '<ellipse cx="94" cy="73" rx="3" ry="4" fill="#1a0a06"/><ellipse cx="106" cy="73" rx="3" ry="4" fill="#1a0a06"/>' +
    '<path d="M128 110 L148 92" stroke="#4a1210" stroke-width="10" stroke-linecap="round"/>' +
    '<rect x="146" y="54" width="6" height="44" fill="#8a6a3a"/><rect x="138" y="96" width="22" height="5" rx="2" fill="#8a6a3a"/>' +
    '<rect x="144" y="42" width="10" height="14" rx="2" fill="#f0e6d0"/><circle cx="149" cy="34" r="14" fill="url(#hf' + u + ')" class="flicker"/><path d="M149 22 C153 28 155 32 153 37 C151 40 147 40 145 37 C143 32 146 28 149 22 Z" fill="#fff4c8" class="flicker"/>';
};
function imp(u, body, extra) {
  return '<defs>' + rgrad('i' + u, body[0], body[1], body[2]) + '</defs>' + shadow(40) +
    '<path d="M82 186 L86 160 M118 186 L114 160" stroke="' + body[2] + '" stroke-width="8" stroke-linecap="round"/>' +
    '<path d="M70 168 C64 140 76 118 100 118 C124 118 136 140 130 168 C120 176 80 176 70 168 Z" fill="url(#i' + u + ')"/>' +
    '<path d="M64 108 L44 92 L68 100 Z M136 108 L156 92 L132 100 Z" fill="url(#i' + u + ')"/>' +
    '<ellipse cx="100" cy="106" rx="32" ry="26" fill="url(#i' + u + ')"/>' +
    '<ellipse cx="88" cy="104" rx="8" ry="9" fill="#fff8d0"/><ellipse cx="112" cy="104" rx="8" ry="9" fill="#fff8d0"/><circle cx="89" cy="106" r="4" fill="#1a1a10"/><circle cx="111" cy="106" r="4" fill="#1a1a10"/>' +
    '<path d="M88 122 Q100 128 112 122" stroke="#1a1a10" stroke-width="2.5" fill="none"/><path d="M92 123 l2 4 l2 -3.5 M104 123.5 l2 3.5 l2 -4" fill="#fff8d0"/>' +
    '<path d="M72 140 L58 156 M128 140 L142 156" stroke="url(#i' + u + ')" stroke-width="9" stroke-linecap="round"/>' + (extra || '');
}
EA.imp_boss = function (u) { return imp(u, ['#a8b49a', '#5c6a4c', '#283020'], '<path d="M74 84 L80 70 L88 82 L96 66 L104 82 L112 68 L120 82 L126 70 L128 86 Z" fill="#7a5a2a"/><path d="M140 156 L170 110" stroke="#6a4a2a" stroke-width="7" stroke-linecap="round"/><circle cx="172" cy="106" r="10" fill="#6a4a2a"/><circle cx="168" cy="100" r="2" fill="#c8b090"/><circle cx="178" cy="110" r="2" fill="#c8b090"/>'); };
EA.imp_fat = function (u) { return imp(u, ['#c0b090', '#7a6a4c', '#3a3020'], '<ellipse cx="100" cy="160" rx="38" ry="24" fill="url(#i' + u + ')"/><ellipse cx="100" cy="164" rx="18" ry="10" fill="#d8c8a8" opacity=".5"/>'); };
EA.imp_quick = function (u) { return imp(u, ['#9ac0b0', '#4a6a5c', '#1c2a24'], '<path d="M140 154 l14 -6 l-4 8 l12 0 l-10 6" stroke="#e8e8d8" stroke-width="2" fill="none"/><path d="M56 154 l-12 -6 l4 8 l-12 0 l10 6" stroke="#e8e8d8" stroke-width="2" fill="none"/>'); };
EA.imp_angry = function (u) { return imp(u, ['#e09080', '#a03a2a', '#4a1208'], '<path d="M80 86 L72 62 L90 82 Z M120 86 L128 62 L110 82 Z" fill="#3a1208"/><path d="M80 96 L94 100 M120 96 L106 100" stroke="#1a0804" stroke-width="3"/><path d="M60 70 q-6 -10 2 -18 M140 70 q6 -10 -2 -18" stroke="#ddd" stroke-width="3" fill="none" opacity=".5"/>'); };
EA.imp_shield = function (u) { return imp(u, ['#b0b4a0', '#646a54', '#2a2e20'], '<circle cx="60" cy="150" r="26" fill="#8a6a3a" stroke="#4a3418" stroke-width="4"/><circle cx="60" cy="150" r="8" fill="#c8a060"/><path d="M38 150 H82 M60 128 V172" stroke="#4a3418" stroke-width="2.5"/>'); };
EA.imp_sorcerer = function (u) { return imp(u, ['#b0a0d0', '#5a4a7a', '#241c34'], '<path d="M70 86 L100 30 L130 86 Z" fill="#3a2a5a"/><circle cx="104" cy="52" r="3" fill="#ffe066"/><path d="M142 158 L160 70" stroke="#6a4a2a" stroke-width="5" stroke-linecap="round"/><circle cx="161" cy="64" r="10" fill="#c39bff" class="pulse-glow"/>'); };
EA.puffball = function (u) {
  return '<defs>' + rgrad('f' + u, '#f2e2c4', '#c4a074', '#6a4a2a') + '</defs>' + shadow(56) +
    '<path d="M88 186 L90 160 L110 160 L112 186 Z" fill="#d8c8a8"/>' +
    '<ellipse cx="100" cy="124" rx="62" ry="50" fill="url(#f' + u + ')" class="wobble"/>' +
    '<circle cx="70" cy="100" r="8" fill="#8a6a44" opacity=".55"/><circle cx="118" cy="88" r="10" fill="#8a6a44" opacity=".55"/><circle cx="140" cy="122" r="7" fill="#8a6a44" opacity=".55"/><circle cx="84" cy="142" r="5" fill="#8a6a44" opacity=".55"/>' +
    '<path d="M80 122 L92 126 M120 122 L108 126" stroke="#3a2410" stroke-width="3.5" stroke-linecap="round"/><ellipse cx="88" cy="132" rx="4" ry="5" fill="#3a2410"/><ellipse cx="112" cy="132" rx="4" ry="5" fill="#3a2410"/>' +
    '<path d="M90 150 Q100 144 110 150" stroke="#3a2410" stroke-width="3" fill="none"/>' +
    '<g class="spores" fill="#e8d8b0" opacity=".7"><circle cx="40" cy="70" r="2.5"/><circle cx="160" cy="60" r="2"/><circle cx="150" cy="40" r="1.6"/><circle cx="56" cy="44" r="1.8"/></g>';
};
EA.trapper = function (u) {
  return '<defs>' + grad('t' + u, '#4f6a3a', '#2a3a1e', '#121a0c') + '</defs>' + shadow(46) +
    '<path d="M80 186 C78 150 82 120 86 100 L114 100 C118 120 122 150 120 186" fill="url(#t' + u + ')"/>' +
    '<path d="M84 186 C86 160 90 140 92 120 M116 186 C114 160 110 140 108 120" stroke="#6a8a4a" stroke-width="2" fill="none"/>' +
    '<path d="M100 36 C76 36 66 58 70 84 L82 104 L118 104 L130 84 C134 58 124 36 100 36 Z" fill="url(#t' + u + ')"/>' +
    '<path d="M70 70 L52 60 L72 78 Z M130 70 L148 60 L128 78 Z M84 40 L80 22 L94 38 Z M116 40 L122 22 L108 38 Z" fill="#5a7a3a"/>' +
    '<path d="M84 66 Q100 58 116 66 L114 84 Q100 90 86 84 Z" fill="#0a0f06"/>' + eyes(93, 74, 107, 74, 3.2, '#ffe04a') +
    '<path d="M118 112 C140 104 150 120 160 112 C172 104 170 88 182 84" stroke="#4f6a3a" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M146 116 l4 -8 M166 104 l6 -6" stroke="#4f6a3a" stroke-width="3"/>' +
    '<path d="M82 112 C64 120 56 136 50 150" stroke="#2a3a1e" stroke-width="9" stroke-linecap="round"/>';
};
EA.crow = function (u) {
  return '<defs>' + grad('k' + u, '#3a3a52', '#16161f', '#08080c') + '</defs>' + shadow(50) +
    '<path d="M86 186 L90 166 M112 186 L110 166" stroke="#c8a040" stroke-width="4" stroke-linecap="round"/>' +
    '<path d="M54 150 C50 110 78 84 110 88 C140 92 152 120 146 150 C140 172 70 176 54 150 Z" fill="url(#k' + u + ')"/>' +
    '<path d="M60 130 C30 120 14 136 8 150 C30 146 46 148 62 152 Z" fill="url(#k' + u + ')"/>' +
    '<path d="M140 150 C164 160 174 176 172 186 C156 176 144 170 132 166 Z" fill="url(#k' + u + ')"/>' +
    '<circle cx="112" cy="84" r="24" fill="url(#k' + u + ')"/>' +
    '<path d="M132 80 L168 88 L132 96 Z" fill="#c8a040"/><path d="M132 88 L168 88" stroke="#6a5010" stroke-width="1.5"/>' +
    '<circle cx="120" cy="78" r="5" fill="#ff3a2a" class="eye-glow"/><circle cx="119" cy="77" r="1.5" fill="#fff"/>' +
    '<circle cx="164" cy="98" r="7" fill="#f2cc5a" stroke="#8a6a10" stroke-width="2"/>' +
    '<path d="M70 120 C90 116 108 122 120 132 M66 136 C86 134 104 138 116 146" stroke="#4a4a6a" stroke-width="2" fill="none" opacity=".6"/>';
};
function tick(u, big) {
  var s = big ? 1.15 : 1;
  var legs = '';
  for (var i = 0; i < 4; i++) { var x = 70 + i * 20; legs += '<path d="M' + x + ' 160 L' + (x - 16 + i * 4) + ' 186 M' + x + ' 160 L' + (x - 10 + i * 6) + ' 186" stroke="#140c1c" stroke-width="3.5" stroke-linecap="round"/>'; }
  return '<defs>' + rgrad('d' + u, '#6a5a8a', '#2a1e3e', '#0c0814') + '</defs>' + shadow(54 * s) + legs +
    '<ellipse cx="100" cy="' + (150 - 6 * s) + '" rx="' + (52 * s) + '" ry="' + (40 * s) + '" fill="url(#d' + u + ')"/>' +
    '<path d="M60 136 Q100 116 140 136" stroke="#8a7aaa" stroke-width="2" fill="none" opacity=".5"/>' +
    '<ellipse cx="' + (100 - 46 * s) + '" cy="158" rx="16" ry="12" fill="#2a1e3e"/>' + eyes(100 - 52 * s, 154, 100 - 42 * s, 154, 3, '#d080ff') +
    '<path d="M' + (100 - 60 * s) + ' 166 l-8 6 M' + (100 - 54 * s) + ' 168 l-4 8" stroke="#140c1c" stroke-width="2.5"/>';
}
EA.tick = function (u) { return tick(u, false); };
EA.tick2 = function (u) { return tick(u, true); };
EA.nest = function (u) {
  return '<defs>' + rgrad('n' + u, '#7a5a3a', '#3e2a18', '#1a1008') + '<radialGradient id="ng' + u + '" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffd27a"/><stop offset="1" stop-color="#a04a10" stop-opacity="0"/></radialGradient></defs>' + shadow(70) +
    '<path d="M34 186 C24 150 40 104 70 92 C84 70 120 70 132 92 C162 102 178 150 166 186 Z" fill="url(#n' + u + ')"/>' +
    '<path d="M50 160 C60 140 56 120 70 106 M150 160 C142 136 148 120 132 104 M100 186 C98 160 104 130 100 100" stroke="#2a1a0c" stroke-width="4" fill="none" opacity=".6"/>' +
    '<ellipse cx="78" cy="134" rx="12" ry="9" fill="#120a04"/><ellipse cx="78" cy="134" rx="10" ry="7" fill="url(#ng' + u + ')" class="pulse-glow"/>' +
    '<ellipse cx="124" cy="120" rx="10" ry="8" fill="#120a04"/><ellipse cx="124" cy="120" rx="8" ry="6" fill="url(#ng' + u + ')" class="pulse-glow"/>' +
    '<ellipse cx="108" cy="160" rx="11" ry="8" fill="#120a04"/><ellipse cx="108" cy="160" rx="9" ry="6" fill="url(#ng' + u + ')" class="pulse-glow"/>' +
    '<path d="M124 120 C130 108 138 108 140 98" stroke="#e8d8a0" stroke-width="5" stroke-linecap="round" fill="none"/>';
};
EA.borer = function (u) {
  return '<defs>' + grad('b' + u, '#f0e2b0', '#c0a868', '#6a5a2a') + '</defs>' + shadow(36) +
    '<path d="M60 182 C56 162 74 150 92 156 C104 140 128 146 132 164 C142 166 146 180 136 186 Z" fill="url(#b' + u + ')"/>' +
    '<path d="M80 160 C82 172 82 178 80 186 M100 152 C104 164 104 176 102 186 M120 156 C124 166 124 176 122 186" stroke="#8a7a3a" stroke-width="2" fill="none"/>' +
    '<circle cx="66" cy="170" r="12" fill="url(#b' + u + ')"/><path d="M56 168 L46 162 L52 172 M58 176 L48 180 L56 182" stroke="#3a2a10" stroke-width="3" fill="none"/>' + eyes(62, 166, 70, 165, 2, '#1a1008');
};
EA.sentinel = function (u) {
  return '<defs>' + grad('q' + u, '#8a7262', '#4a3a30', '#1e1612') + '</defs>' + shadow(48) +
    '<path d="M84 150 L80 186 L96 186 L98 152 Z M104 152 L106 186 L122 186 L118 150 Z" fill="url(#q' + u + ')"/>' +
    '<path d="M74 84 Q100 76 126 84 L122 150 Q100 160 78 150 Z" fill="url(#q' + u + ')"/>' +
    '<circle cx="88" cy="110" r="7" fill="#b0602a" opacity=".7"/><circle cx="114" cy="126" r="9" fill="#a0501a" opacity=".6"/><circle cx="100" cy="94" r="5" fill="#c0703a" opacity=".6"/>' +
    '<ellipse cx="70" cy="90" rx="14" ry="10" fill="url(#q' + u + ')"/><ellipse cx="130" cy="90" rx="14" ry="10" fill="url(#q' + u + ')"/>' +
    '<path d="M86 40 Q100 30 114 40 L116 76 Q100 84 84 76 Z" fill="url(#q' + u + ')"/><path d="M88 56 H112" stroke="#ff9a3a" stroke-width="3" class="visor"/>' +
    '<path d="M134 96 L148 120" stroke="#4a3a30" stroke-width="9" stroke-linecap="round"/>' +
    '<path d="M152 186 L152 26" stroke="#5a4a3a" stroke-width="4"/><path d="M146 30 L152 6 L158 30 Z" fill="#9a8a7a"/>' +
    '<path d="M66 96 L52 136 L60 140 L74 100 Z" fill="url(#q' + u + ')"/><path d="M40 120 Q46 100 66 104 L70 150 Q50 154 40 140 Z" fill="#5a4636" stroke="#2a1e16" stroke-width="2"/>';
};
function lantern(u, c1, c2, c3) {
  return '<defs>' + rgrad('l' + u, c1, c2, c3) + '</defs>' + shadow(30) +
    '<g class="float"><path d="M100 30 V46" stroke="#3a2a1a" stroke-width="3"/><rect x="80" y="44" width="40" height="8" rx="2" fill="#3a2a1a"/>' +
    '<path d="M70 60 C66 90 66 120 70 150 L130 150 C134 120 134 90 130 60 Z" fill="url(#l' + u + ')" opacity=".95"/>' +
    '<path d="M74 80 H126 M72 104 H128 M74 128 H126" stroke="rgba(40,20,10,.35)" stroke-width="2"/>' +
    '<rect x="80" y="150" width="40" height="8" rx="2" fill="#3a2a1a"/><path d="M92 158 V170 M100 158 V174 M108 158 V170" stroke="' + c2 + '" stroke-width="2"/>' +
    '<path d="M84 98 L96 104 M116 98 L104 104" stroke="#2a1008" stroke-width="3" stroke-linecap="round"/><ellipse cx="91" cy="108" rx="4" ry="5" fill="#2a1008"/><ellipse cx="109" cy="108" rx="4" ry="5" fill="#2a1008"/>' +
    '<path d="M90 124 Q100 132 110 124" stroke="#2a1008" stroke-width="3" fill="none"/></g>';
}
EA.lantern_r = function (u) { return lantern(u, '#fff0c0', '#ff7a3a', '#8a1a0a'); };
EA.lantern_b = function (u) { return lantern(u, '#e8fbff', '#5ab8e8', '#123a5a'); };
EA.boar = function (u) {
  return '<defs>' + grad('o' + u, '#6a4a34', '#3a2418', '#160c06') + '</defs>' + shadow(86) +
    '<path d="M48 186 L52 156 M78 186 L80 160 M132 186 L130 160 M160 186 L156 156" stroke="#1e120a" stroke-width="12" stroke-linecap="round"/>' +
    '<path d="M30 150 C26 104 70 74 120 78 C164 82 186 116 176 156 C168 176 52 180 30 150 Z" fill="url(#o' + u + ')"/>' +
    '<path d="M60 84 L56 64 L70 80 M80 78 L80 56 L90 76 M100 76 L104 54 L110 76 M120 78 L128 58 L130 80 M140 82 L150 64 L148 88" stroke="#2a1a10" stroke-width="5" stroke-linecap="round"/>' +
    '<path d="M22 118 C10 104 14 82 30 74 C48 68 66 78 70 96 C72 118 52 134 32 132 Z" fill="url(#o' + u + ')"/>' +
    '<path d="M12 90 C10 76 22 64 38 64 C54 64 64 76 62 92 C60 106 48 114 34 112 C20 110 12 102 12 90 Z" fill="#efe6d8"/>' +
    '<path d="M20 78 L30 86 M54 78 L44 86" stroke="#b02a1a" stroke-width="4" stroke-linecap="round"/><path d="M26 98 Q37 92 48 98" stroke="#b02a1a" stroke-width="3.5" fill="none"/>' +
    '<ellipse cx="29" cy="88" rx="4" ry="3" fill="#1a0a06"/><ellipse cx="46" cy="88" rx="4" ry="3" fill="#1a0a06"/><circle cx="29" cy="88" r="1.5" fill="#ff4a2a"/><circle cx="46" cy="88" r="1.5" fill="#ff4a2a"/>' +
    '<path d="M24 64 L18 46 L32 62 Z M52 64 L60 46 L48 62 Z" fill="#b02a1a"/>' +
    '<path d="M16 118 C6 112 4 98 10 90 L18 112 Z M40 124 C40 136 30 144 20 144 L32 122 Z" fill="#f4ecd8"/>';
};
EA.statue = function (u) {
  return '<defs>' + grad('z' + u, '#a6a69a', '#5e605a', '#2a2c28') + '</defs>' + shadow(80) +
    '<rect x="30" y="168" width="140" height="20" rx="4" fill="#3a3c38"/>' +
    '<path d="M44 168 C40 128 56 96 100 92 C144 96 160 128 156 168 Z" fill="url(#z' + u + ')"/>' +
    '<path d="M50 168 C46 150 60 140 76 146 L80 168 Z M150 168 C154 150 140 140 124 146 L120 168 Z" fill="#4a4c48"/>' +
    '<path d="M60 120 C70 112 76 118 84 112 M120 112 C130 120 136 112 144 122 M70 150 C80 144 90 150 96 144" stroke="#5f8a4a" stroke-width="6" fill="none" stroke-linecap="round" opacity=".85"/>' +
    '<path d="M72 92 C70 60 82 40 100 40 C118 40 130 60 128 92 Z" fill="url(#z' + u + ')"/>' +
    '<path d="M74 52 C84 44 92 50 100 46 C110 52 118 44 126 54" stroke="#5f8a4a" stroke-width="5" fill="none" stroke-linecap="round"/>' +
    '<g class="eyes-sleep"><path d="M84 70 Q90 74 96 70 M104 70 Q110 74 116 70" stroke="#2a2c28" stroke-width="3" fill="none" stroke-linecap="round"/></g>' +
    '<g class="eyes-awake">' + eyes(90, 70, 110, 70, 4.5, '#7fe0ff') + '</g>' +
    '<path d="M90 84 H110" stroke="#2a2c28" stroke-width="3"/>' +
    '<path d="M100 112 L94 124 L100 136 L106 124 Z" fill="#7fe0ff" opacity=".35" class="pulse-glow"/>';
};
EA.witch = function (u) {
  return '<defs>' + grad('x' + u, '#4a2a5a', '#24122e', '#0e0614') + '</defs>' + shadow(46) +
    '<path d="M66 186 C70 150 80 120 90 100 L110 100 C120 120 130 150 134 186 Z" fill="url(#x' + u + ')"/>' +
    '<path d="M68 186 L60 170 L74 176 M92 186 L90 170 L98 182 M120 186 L124 172 L128 186" stroke="#5a8a3a" stroke-width="3" fill="none"/>' +
    '<path d="M70 150 C80 140 72 126 84 118 M130 150 C122 138 128 126 116 118" stroke="#5a8a3a" stroke-width="3.5" fill="none"/>' +
    '<circle cx="100" cy="86" r="16" fill="#d8e0cc"/>' +
    '<path d="M92 84 Q95 86 98 84 M102 84 Q105 86 108 84" stroke="#2a1a2e" stroke-width="2" fill="none"/>' + eyes(95, 86, 105, 86, 1.6, '#c4ff86') +
    '<path d="M94 94 Q100 98 106 94" stroke="#6a2a3a" stroke-width="1.6" fill="none"/>' +
    '<path d="M50 78 Q100 60 150 78 L132 80 Q118 40 100 6 Q86 40 70 80 Z" fill="url(#x' + u + ')"/>' +
    '<path d="M56 78 C70 70 82 76 96 70 C110 74 126 68 144 78" stroke="#5a8a3a" stroke-width="3" fill="none"/><path d="M70 72 l-4 -6 M96 70 l0 -7 M122 70 l4 -6" stroke="#5a8a3a" stroke-width="2.5"/>' +
    '<path d="M126 120 L152 64" stroke="#3a2a1a" stroke-width="5" stroke-linecap="round"/><path d="M146 70 l8 -4 M140 84 l9 0 M152 60 C160 50 156 40 148 38" stroke="#5a8a3a" stroke-width="3" fill="none"/><circle cx="148" cy="38" r="5" fill="#d04a8a" class="pulse-glow"/>';
};
EA.sprout = function (u) {
  return '<defs>' + grad('y' + u, '#8ad06a', '#3a7a2a', '#16300c') + '</defs>' + shadow(28) +
    '<path d="M100 186 C96 168 100 152 98 140" stroke="#3a6a2a" stroke-width="7" stroke-linecap="round" fill="none"/>' +
    '<path d="M98 140 C80 136 72 120 78 108 C90 108 98 120 98 140 Z M100 138 C116 132 126 118 120 106 C108 106 100 118 100 138 Z" fill="url(#y' + u + ')"/>' +
    '<ellipse cx="99" cy="150" rx="16" ry="13" fill="url(#y' + u + ')"/>' + eyes(93, 148, 105, 148, 2.4, '#1a2a0a') +
    '<path d="M84 160 L76 158 L84 152 Z M114 160 L122 158 L114 152 Z M96 168 L92 176 L100 172 Z" fill="#c8e0a0"/>';
};
EA.b_colossus = function (u) {
  return '<defs>' + grad('g' + u, '#9aa08a', '#5a6050', '#22261c') + '<radialGradient id="gc' + u + '" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#e8ffb0"/><stop offset=".5" stop-color="#8ad04a"/><stop offset="1" stop-color="#3a7a1a" stop-opacity="0"/></radialGradient></defs>' + shadow(90) +
    '<g class="form-stand">' +
    '<path d="M62 186 L66 150 L88 150 L86 186 Z M114 186 L112 150 L134 150 L138 186 Z" fill="url(#g' + u + ')"/>' +
    '<path d="M44 150 C38 100 64 66 100 64 C136 66 162 100 156 150 C140 162 60 162 44 150 Z" fill="url(#g' + u + ')"/>' +
    '<path d="M50 98 C60 88 70 96 82 86 M118 86 C130 96 140 88 150 98 M58 136 C72 128 86 138 98 130" stroke="#5f8a3a" stroke-width="7" fill="none" stroke-linecap="round"/>' +
    '<circle cx="100" cy="112" r="20" fill="url(#gc' + u + ')" class="pulse-glow"/>' +
    '<path d="M44 96 C22 100 14 130 20 158 L40 160 C38 136 42 116 52 104 Z M156 96 C178 100 186 130 180 158 L160 160 C162 136 158 116 148 104 Z" fill="url(#g' + u + ')"/>' +
    '<rect x="14" y="152" width="30" height="20" rx="6" fill="url(#g' + u + ')"/><rect x="156" y="152" width="30" height="20" rx="6" fill="url(#g' + u + ')"/>' +
    '<path d="M76 66 C74 40 86 24 100 24 C114 24 126 40 124 66 Z" fill="url(#g' + u + ')"/>' + eyes(91, 48, 109, 48, 4, '#c8ff7a') +
    '<path d="M80 30 C88 24 96 30 104 24 C112 30 120 26 124 36" stroke="#5f8a3a" stroke-width="5" fill="none" stroke-linecap="round"/></g>' +
    '<g class="form-shell"><path d="M28 186 C24 120 60 76 100 76 C140 76 176 120 172 186 Z" fill="url(#g' + u + ')"/>' +
    '<path d="M44 120 L30 100 L54 112 Z M76 88 L70 64 L88 84 Z M124 84 L132 62 L136 90 Z M158 114 L174 96 L166 124 Z M100 80 L100 56 L110 80 Z" fill="#7a8a5a"/>' +
    '<path d="M44 150 C70 136 92 152 120 140 C140 132 152 142 164 150" stroke="#5f8a3a" stroke-width="8" fill="none" stroke-linecap="round"/>' +
    '<path d="M60 170 Q100 150 140 170" stroke="#22261c" stroke-width="4" fill="none"/>' + eyes(88, 168, 112, 168, 3, '#c8ff7a') + '</g>';
};
EA.b_witch = function (u) {
  var candles = '';
  var xs = [52, 76, 100, 124, 148], ys = [62, 46, 36, 46, 62];
  for (var i = 0; i < 5; i++) {
    candles += '<rect x="' + (xs[i] - 5) + '" y="' + ys[i] + '" width="10" height="20" rx="2" fill="#efe4cc"/>' +
      '<g class="cflame cf' + i + '"><circle cx="' + xs[i] + '" cy="' + (ys[i] - 8) + '" r="11" fill="url(#bf' + u + ')"/><path d="M' + xs[i] + ' ' + (ys[i] - 18) + ' C' + (xs[i] + 4) + ' ' + (ys[i] - 11) + ' ' + (xs[i] + 5) + ' ' + (ys[i] - 6) + ' ' + xs[i] + ' ' + (ys[i] - 2) + ' C' + (xs[i] - 5) + ' ' + (ys[i] - 6) + ' ' + (xs[i] - 4) + ' ' + (ys[i] - 11) + ' ' + xs[i] + ' ' + (ys[i] - 18) + ' Z" fill="#fff2c0"/></g>' +
      '<g class="csmoke cs' + i + '"><path d="M' + xs[i] + ' ' + (ys[i] - 2) + ' q-4 -8 2 -14 q6 -6 0 -14" stroke="#9a9aa8" stroke-width="2" fill="none" opacity=".5"/></g>';
  }
  return '<defs>' + grad('bw' + u, '#3a2a4a', '#1a1024', '#08040c') + '<radialGradient id="bf' + u + '" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff4c0"/><stop offset=".5" stop-color="#ff9a3a"/><stop offset="1" stop-color="#ff5a1a" stop-opacity="0"/></radialGradient></defs>' + shadow(70) +
    '<path d="M50 186 C56 140 70 110 84 96 L116 96 C130 110 144 140 150 186 Z" fill="url(#bw' + u + ')"/>' +
    '<path d="M60 186 C66 164 74 150 80 140 M140 186 C134 164 126 150 120 140 M100 186 V120" stroke="#4a3a5a" stroke-width="2" fill="none"/>' +
    '<path d="M46 84 Q100 66 154 84 L150 96 Q100 82 50 96 Z" fill="#6a5a3a"/>' +
    '<path d="M100 82 V36" stroke="#6a5a3a" stroke-width="5"/>' +
    '<path d="M52 84 C52 74 60 70 66 74 M148 84 C148 74 140 70 134 74" stroke="#6a5a3a" stroke-width="4" fill="none"/>' + candles +
    '<ellipse cx="100" cy="104" rx="16" ry="18" fill="#e8e0ec"/>' +
    '<path d="M90 102 L96 104 M110 102 L104 104" stroke="#2a1a2e" stroke-width="2.2"/>' + eyes(93, 106, 107, 106, 2.2, '#ffb347') +
    '<path d="M94 116 Q100 120 106 116" stroke="#7a2a4a" stroke-width="1.8" fill="none"/>' +
    '<path d="M84 126 C70 132 62 146 58 160 M116 126 C130 132 138 146 142 160" stroke="#1a1024" stroke-width="10" stroke-linecap="round"/>' +
    '<circle cx="58" cy="162" r="6" fill="#e8e0ec"/><circle cx="142" cy="162" r="6" fill="#e8e0ec"/>';
};
ART.enemy = function (key) {
  var u = U(), f = EA[key];
  return '<svg class="enemy-svg en-' + key + '" viewBox="0 0 200 200" aria-hidden="true">' + (f ? f(u) : EA.slime_s(u)) + '</svg>';
};
ART.hasEnemy = function (k) { return !!EA[k]; };

/* ============================ scenes ============================ */
ART.tower = function () {
  var u = U();
  var thorns = '';
  var r = rng(77);
  for (var i = 0; i < 46; i++) {
    var y = 120 + i * 13, side = i % 2 ? 1 : -1, x = 400 + side * (30 + (i % 5) * 6) - side * i * 0.25;
    thorns += '<path d="M' + x.toFixed(0) + ' ' + y + ' q' + (side * 40) + ' ' + (-10 - r() * 20).toFixed(0) + ' ' + (side * (60 + r() * 40)).toFixed(0) + ' ' + (10 + r() * 20).toFixed(0) + '" stroke="#0b0708" stroke-width="' + (3 + r() * 4).toFixed(1) + '" fill="none" stroke-linecap="round"/>';
  }
  return '<svg class="tower-svg" viewBox="0 0 800 800" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><defs>' +
    '<linearGradient id="sky' + u + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0c0a18"/><stop offset=".55" stop-color="#2a1626"/><stop offset=".85" stop-color="#5a2a22"/><stop offset="1" stop-color="#8a4a2a"/></linearGradient>' +
    '<radialGradient id="moon' + u + '" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff6dc"/><stop offset=".6" stop-color="#f2d9a6"/><stop offset="1" stop-color="#f2d9a6" stop-opacity="0"/></radialGradient>' +
    '<linearGradient id="tw' + u + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#050304"/><stop offset=".6" stop-color="#140c0e"/><stop offset="1" stop-color="#050304"/></linearGradient>' +
    '</defs><rect width="800" height="800" fill="url(#sky' + u + ')"/>' +
    '<circle cx="560" cy="190" r="110" fill="url(#moon' + u + ')" opacity=".55"/><circle cx="560" cy="190" r="54" fill="#f6e6c0" opacity=".9"/>' +
    '<path d="M0 700 C120 640 220 690 320 650 C420 610 520 670 620 640 C700 618 760 650 800 640 L800 800 L0 800 Z" fill="#120a0c"/>' +
    '<path d="M372 800 L360 260 L380 200 L376 140 L392 90 L400 40 L408 90 L424 140 L420 200 L440 260 L428 800 Z" fill="url(#tw' + u + ')"/>' +
    '<path d="M384 250 h8 v14 h-8 z M408 330 h8 v14 h-8 z M390 430 h7 v12 h-7 z M404 540 h8 v14 h-8 z" fill="#ffb35c" class="flicker"/>' +
    thorns +
    '<path d="M0 760 C100 730 200 770 300 744 C400 720 500 760 600 740 C700 720 760 750 800 744 L800 800 L0 800 Z" fill="#070405"/></svg>';
};
ART.lanternSpirit = function () {
  var u = U();
  return '<svg class="spirit-svg" viewBox="0 0 200 220" aria-hidden="true"><defs><radialGradient id="sg' + u + '" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff8dc"/><stop offset=".45" stop-color="#ffc870"/><stop offset="1" stop-color="#ff9a3a" stop-opacity="0"/></radialGradient></defs>' +
    '<circle cx="100" cy="110" r="96" fill="url(#sg' + u + ')" opacity=".55" class="pulse-glow"/>' +
    '<path d="M100 10 V40" stroke="#3a2a1a" stroke-width="4"/><path d="M76 40 h48 l8 14 h-64 z" fill="#3a2a1a"/>' +
    '<path d="M64 54 C56 90 56 136 64 172 L136 172 C144 136 144 90 136 54 Z" fill="#f6e2b0" opacity=".9"/>' +
    '<path d="M68 80 H132 M66 110 H134 M68 140 H132" stroke="#c89a50" stroke-width="2" opacity=".6"/>' +
    '<g class="flicker"><path d="M84 132 C78 116 84 104 90 96 C92 108 96 112 100 116 C102 104 106 96 112 88 C118 102 120 118 112 132 Z" fill="#ff9a3a"/><circle cx="88" cy="120" r="4" fill="#fff"/><circle cx="112" cy="120" r="4" fill="#fff"/></g>' +
    '<path d="M70 172 h60 l-8 14 h-44 z" fill="#3a2a1a"/></svg>';
};
ART.merchant = function () {
  var u = U();
  return '<svg class="merchant-svg" viewBox="0 0 220 200" aria-hidden="true"><defs>' + grad('mc' + u, '#4a3a2e', '#24180f', '#0c0806') + '<radialGradient id="ml' + u + '" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff2c8"/><stop offset=".5" stop-color="#ffb35c"/><stop offset="1" stop-color="#ff8a2a" stop-opacity="0"/></radialGradient></defs>' +
    '<ellipse cx="110" cy="190" rx="90" ry="8" fill="#000" opacity=".5"/>' +
    '<path d="M60 190 C60 130 76 90 110 80 C144 90 160 130 160 190 Z" fill="url(#mc' + u + ')"/>' +
    '<path d="M110 30 C86 30 76 50 78 78 L110 100 L142 78 C144 50 134 30 110 30 Z" fill="url(#mc' + u + ')"/>' +
    '<path d="M92 60 Q110 50 128 60 L126 84 Q110 92 94 84 Z" fill="#060403"/>' + eyes(102, 70, 118, 70, 2.6, '#ffd27a') +
    '<path d="M40 190 L40 120 L180 120 L180 190" fill="#3a2414"/><rect x="34" y="112" width="152" height="12" rx="3" fill="#6a4426"/>' +
    '<path d="M40 112 L56 92 L164 92 L180 112" fill="#8a2a1a"/><path d="M56 92 L64 112 M84 92 L88 112 M110 92 V112 M136 92 L132 112 M164 92 L156 112" stroke="#5a1a0e" stroke-width="2"/>' +
    '<path d="M168 92 L188 60" stroke="#3a2414" stroke-width="4"/><circle cx="190" cy="56" r="20" fill="url(#ml' + u + ')" class="flicker"/><rect x="184" y="48" width="12" height="16" rx="3" fill="#f6dca0" opacity=".9"/>' +
    '<g transform="translate(58 132) scale(.22)">' + GL.coin('#f2cc5a', '#8a6a10') + '</g><g transform="translate(140 130) scale(.22)">' + GL.pouch('#a97a4a', '#4a2e18') + '</g></svg>';
};
ART.campfire = function () {
  var u = U();
  return '<svg class="fire-svg" viewBox="0 0 200 160" aria-hidden="true"><defs><radialGradient id="cf' + u + '" cx="50%" cy="70%" r="60%"><stop offset="0" stop-color="#fff4c8"/><stop offset=".35" stop-color="#ffb347"/><stop offset=".7" stop-color="#ff5a1a"/><stop offset="1" stop-color="#8a1a0a" stop-opacity="0"/></radialGradient></defs>' +
    '<ellipse cx="100" cy="140" rx="90" ry="22" fill="#ff8a3a" opacity=".18" class="pulse-glow"/>' +
    '<path d="M40 146 L160 124 M44 124 L156 148" stroke="#3a2214" stroke-width="12" stroke-linecap="round"/>' +
    '<g class="fire"><path d="M100 22 C120 54 140 70 136 104 C134 128 118 140 100 140 C82 140 66 128 64 104 C60 78 80 66 84 42 C92 58 94 70 100 76 C106 58 102 40 100 22 Z" fill="url(#cf' + u + ')"/>' +
    '<path d="M100 70 C110 88 118 96 116 112 C114 126 108 132 100 132 C92 132 84 126 84 112 C82 98 94 90 100 70 Z" fill="#fff2c0"/></g>' +
    '<g fill="#3a3a40"><ellipse cx="44" cy="148" rx="12" ry="7"/><ellipse cx="70" cy="152" rx="11" ry="6"/><ellipse cx="130" cy="152" rx="11" ry="6"/><ellipse cx="156" cy="148" rx="12" ry="7"/></g></svg>';
};
ART.chest = function (open) {
  var u = U();
  return '<svg class="chest-svg' + (open ? ' open' : '') + '" viewBox="0 0 200 170" aria-hidden="true"><defs>' + grad('ch' + u, '#a8744a', '#6a3e20', '#2e1a0c') + '<radialGradient id="cl' + u + '" cx="50%" cy="100%" r="80%"><stop offset="0" stop-color="#fff6d0"/><stop offset=".5" stop-color="#ffd27a" stop-opacity=".7"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient></defs>' +
    '<ellipse cx="100" cy="160" rx="80" ry="8" fill="#000" opacity=".5"/>' +
    '<g class="chest-light"><path d="M40 84 L10 0 L190 0 L160 84 Z" fill="url(#cl' + u + ')"/></g>' +
    '<rect x="30" y="84" width="140" height="72" rx="6" fill="url(#ch' + u + ')"/>' +
    '<path d="M30 104 H170 M30 138 H170" stroke="#2e1a0c" stroke-width="3"/><path d="M50 84 V156 M150 84 V156" stroke="#c8a050" stroke-width="7"/>' +
    '<g class="chest-lid"><path d="M28 86 C28 56 58 44 100 44 C142 44 172 56 172 86 Z" fill="url(#ch' + u + ')"/><path d="M50 50 V86 M150 50 V86" stroke="#c8a050" stroke-width="7"/><path d="M28 86 H172" stroke="#2e1a0c" stroke-width="3"/></g>' +
    '<rect x="88" y="78" width="24" height="26" rx="4" fill="#d8b060" stroke="#6a4a10" stroke-width="2"/><circle cx="100" cy="90" r="4" fill="#3a2410"/></svg>';
};
ART.eventScene = function (ev) {
  var u = U(), tone = ev.tone || '#7a6a8a';
  var a = ev.art || ['eye'];
  return '<svg class="event-svg" viewBox="0 0 300 160" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs>' +
    '<radialGradient id="eb' + u + '" cx="50%" cy="60%" r="75%"><stop offset="0" stop-color="' + tone + '"/><stop offset=".7" stop-color="#140f10"/><stop offset="1" stop-color="#050404"/></radialGradient>' +
    '<linearGradient id="eg' + u + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff8e8"/><stop offset="1" stop-color="' + tone + '"/></linearGradient>' +
    '<filter id="ef' + u + '" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
    '<rect width="300" height="160" fill="url(#eb' + u + ')"/>' +
    '<g opacity=".18" stroke="#fff" fill="none">' + [1, 2, 3, 4, 5].map(function (i) { return '<circle cx="150" cy="86" r="' + (i * 22) + '"/>'; }).join('') + '</g>' +
    (a[1] ? '<g transform="translate(36 46) scale(.5)" opacity=".5">' + ART.glyph(a[1], tone, '#120c0c') + '</g><g transform="translate(214 40) scale(.42)" opacity=".4">' + ART.glyph(a[1], tone, '#120c0c') + '</g>' : '') +
    '<g filter="url(#ef' + u + ')" transform="translate(104 34) scale(.92)" class="float">' + ART.glyph(a[0], 'url(#eg' + u + ')', '#1a1212') + '</g>' +
    '<rect width="300" height="160" fill="none" stroke="rgba(255,240,210,.25)" stroke-width="2"/></svg>';
};
ART.cardBack = function () {
  var u = U();
  return '<svg class="back-svg" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="cb' + u + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a2418"/><stop offset="1" stop-color="#140a06"/></linearGradient></defs>' +
    '<rect x="2" y="2" width="96" height="136" rx="8" fill="url(#cb' + u + ')" stroke="#c8a050" stroke-width="2"/><rect x="9" y="9" width="82" height="122" rx="5" fill="none" stroke="#c8a050" stroke-opacity=".5"/>' +
    '<g transform="translate(25 38) scale(.5)">' + GL.vine('#c8a050') + '</g><path d="M50 30 L50 110" stroke="#c8a050" stroke-opacity=".25"/></svg>';
};
})();
