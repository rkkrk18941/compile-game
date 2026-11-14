/* スレイザスパイア — Today's Tower and seeds (next-level update, 2026-11-13). No DOM.
   Today's Tower: the date in Japan (UTC+9, changes at midnight JST) gives the seed and the character, so everyone
   climbs the same tower that day. The conditions are fixed (character buffs on, normal difficulty, no Ascension,
   card unlock level 3, Colorless cards, no Act IV), so the tower is the same whatever this device has unlocked.
   No server, no ranking: results are shared as text. */
(function (root) {
'use strict';
var STS = root.STS || (root.STS = {});
var Y = STS.Daily = {};
Y.CHARS = ['R', 'G', 'B', 'W'];
Y.URL = 'https://rkkrk18941.github.io/compile-game/ibara/';

/* 'YYYY-MM-DD' of the given moment (ms) in Japan time. */
Y.dateJST = function (ms) { return new Date((ms == null ? Date.now() : ms) + 9 * 3600000).toISOString().slice(0, 10); };
function fnv(str) {
  var h = 0x811c9dc5;
  for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  // final mix, so that neighbouring dates do not give neighbouring seeds
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16;
  return h >>> 0;
}
Y.seedFor = function (date) { return fnv('ibara-daily-v1-' + date) || 1; };
Y.charFor = function (date) { return Y.CHARS[fnv('ibara-daily-hero-' + date) % Y.CHARS.length]; };
/* The new-run settings of the day's tower (STS.Game.newRun). */
Y.config = function (date, name) {
  var ch = Y.charFor(date), D = STS.DATA;
  var unlock = {}; Y.CHARS.forEach(function (k) { unlock[k] = 3; });
  return { players: [{ name: name || (D && D.CHARS[ch] ? D.CHARS[ch].name : ''), ch: ch, unlock: 3 }], mode: 'normal', asc: 0, adv: 'normal', seed: Y.seedFor(date),
    colorless: true, act4: false, charUnlock: unlock, buff: true, daily: date };
};
/* 11/13 */
Y.shortDate = function (date) { var m = /^\d{4}-(\d{2})-(\d{2})$/.exec(date || ''); return m ? (+m[1]) + '/' + (+m[2]) : date; };
/* 「スレイザスパイア 今日の塔 11/13｜サイレント｜第2幕ボスまで｜482点」 and the public address. */
Y.shareText = function (date, ch, reachLabel, score, practice) {
  var D = STS.DATA, name = D && D.CHARS[ch] ? D.CHARS[ch].name : ch;
  return 'スレイザスパイア 今日の塔 ' + Y.shortDate(date) + '｜' + name + '｜' + reachLabel + '｜' + score + '点' + (practice ? '（練習）' : '');
};

/* Seeds: shown as a plain number; typed seeds accept digits only (spaces and commas are ignored). */
Y.formatSeed = function (seed) { return String(seed >>> 0); };
Y.parseSeed = function (text) {
  var t = String(text == null ? '' : text).replace(/[\s,_　]/g, '').replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
  if (!/^\d{1,10}$/.test(t)) return null;
  var n = Number(t);
  if (!(n >= 1 && n <= 4294967295)) return null;
  return n >>> 0;
};
})(typeof window !== 'undefined' ? window : globalThis);
