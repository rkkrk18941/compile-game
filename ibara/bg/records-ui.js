/* スレイザスパイア — result screen, records screen, Today's Tower and seed controls (next-level update, 2026-11-13).
   Markup only; the logic is in bg/records.js (score, records, medals) and bg/daily.js (Today's Tower, seeds).
   ui.js calls these functions and keeps the actions (data-a) in its click handler. */
(function (root) {
'use strict';
var STS = root.STS, V = STS.View, D = STS.DATA, R = STS.Records, Y = STS.Daily, esc = V.esc;
var RU = STS.RecUI = {};
var NAMES = { normal: 'ひとりで遊ぶ', daily: '今日の塔', short: '短い冒険', coop: 'オンライン協力', downfall: 'Downfall' };
function chName(ch) { return (D.CHARS[ch] || {}).name || ch; }
function fmtDate(ms) { var d = new Date(ms + 9 * 3600000); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' ' + ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2); }
/* A number that counts up when shown (CSS), with the real number for screen readers and text search. */
function count(n, delay, cls) { return '<span class="nl-num ' + (cls || '') + '"><span class="sr">' + n + '</span><i class="nl-count" aria-hidden="true" style="--to:' + (n | 0) + ';--d:' + delay.toFixed(2) + 's"></i></span>'; }

/* ------------------------------------------------------------------ the tower: how far this adventure got */
function towerPos(act, bosses, victory, inBoss, acts) {
  if (victory) return Math.min(acts, Math.max(act, bosses));
  return Math.min(acts, (act - 1) + (bosses >= act ? 0.97 : inBoss ? 0.88 : 0.45));
}
function decode(value) { var f = value % 10; return { bosses: Math.floor(value / 100), act: Math.floor((value % 100) / 10), victory: f === 9, inBoss: f === 5 }; }
RU.towerSVG = function (run, rec) {
  var acts = run.short ? 1 : run.act >= 4 || (run.unlock && run.unlock.act4) ? 4 : 3;
  var reach = R.reach(run), inBoss = !!(run.room && run.room.t === 'B');
  var pos = towerPos(run.act || 1, run.bosses || 0, run.result === 'victory', inBoss, acts);
  var best = rec && rec.before && rec.before.reach ? decode(rec.before.reach) : null;
  var bpos = best ? towerPos(best.act || 1, best.bosses, best.victory, best.inBoss, acts) : null;
  var Hh = 210, top = 18, seg = (Hh - top - 16) / acts, x = 46;
  function y(p) { return Hh - 16 - p * seg; }
  var s = '<svg class="nl-tower" viewBox="0 0 150 ' + Hh + '" role="img" aria-label="到達点：' + esc(reach.label) + (best ? '。これまでの最高：' + esc(rec.before.reachLabel || '') : '') + '">';
  s += '<path d="M' + (x - 18) + ' ' + (Hh - 16) + ' L' + (x - 12) + ' ' + top + ' L' + (x + 12) + ' ' + top + ' L' + (x + 18) + ' ' + (Hh - 16) + ' Z" fill="#2a2018" stroke="#8a6a44" stroke-width="1.5"/>';
  for (var a = 1; a <= acts; a++) {
    var yy = y(a), w = 18 - (a / acts) * 6;
    s += '<line x1="' + (x - w) + '" y1="' + yy + '" x2="' + (x + w) + '" y2="' + yy + '" stroke="#8a6a44" stroke-width="1.2"/>';
    s += '<text x="' + (x - 24) + '" y="' + (yy + seg / 2 + 4) + '" text-anchor="end" class="nl-tower-act">' + (a === 4 ? '心臓' : '第' + a + '幕') + '</text>';
  }
  s += '<rect x="' + (x - 3) + '" y="' + y(pos) + '" width="6" height="' + Math.max(0, (Hh - 16) - y(pos)) + '" rx="3" fill="#f2c45a" class="nl-tower-fill"/>';
  if (bpos != null) s += '<g transform="translate(' + (x + 20) + ',' + y(bpos) + ')"><path d="M0 0 L10 -5 L10 5 Z" fill="#9cc8ff"/><text x="14" y="4" class="nl-tower-best">自己ベスト</text></g>';
  s += '<g class="nl-tower-now" transform="translate(' + x + ',' + y(pos) + ')"><circle r="7" fill="#f2c45a" stroke="#2a1d12" stroke-width="2"/><text x="-12" y="-11" class="nl-tower-here">今回</text></g>';
  return s + '</svg>';
};

/* ------------------------------------------------------------------ result screen */
/* ctx: { me, solo, sheet: unlock sheet, awardMsg, boxes, rec (from R.record), today, partyHTML } */
RU.result = function (run, ctx) {
  var win = run.result === 'victory', stop = run.result === 'stopped';
  var p = run.players[ctx.me] || run.players[0], rec = ctx.rec || null;
  var sc = rec ? rec.score : R.score(run, ctx.me), reach = rec ? rec.reach : R.reach(run);
  var kicker = run.daily ? '今日の塔 ' + Y.shortDate(run.daily) + (rec && rec.practice ? '（練習）' : '（本番）') : run.short ? '短い冒険（第1幕のみ）' : 'RESULT';
  var diff = run.mode === 'beginner' ? '初心者モード' : run.asc ? 'アセンション' + run.asc : '通常';
  var h = '<div class="result nl-result ' + (win ? 'win' : stop ? 'stop' : 'lose') + '">';
  h += '<div class="nl-res-head"><small>' + esc(kicker) + '</small><h1>' + (win ? '勝利！' : stop ? '冒険を終えた' : '敗北…') + '</h1>' +
    '<p>' + esc(reach.label) + '・' + esc(chName(p.ch)) + '・' + esc(diff) + (run.seeded ? '・シード指定' : '') + '</p>' +
    '<p class="nl-res-sub">倒したボス：' + run.bosses + '体（第' + run.act + '幕まで到達）' + (run.mode === 'beginner' ? '・初心者モード' : run.asc ? '・アセンション' + run.asc : '') + '</p></div>';
  // the tower and the score counted up line by line
  var lines = sc.lines, d = 0.25;
  h += '<div class="nl-res-main">' + RU.towerSVG(run, rec) + '<ol class="nl-tally" aria-label="スコアの内訳">';
  lines.forEach(function (l, i) {
    d = 0.25 + i * 0.22;
    h += '<li style="--d:' + d.toFixed(2) + 's"><span>' + esc(l.label) + (l.each ? ' <small>' + l.n + '×' + l.each + '</small>' : ' <small>' + l.n + '</small>') + '</span>' + count(l.pts, d) + '</li>';
  });
  if (!lines.length) h += '<li style="--d:.25s"><span>記録できる進み具合はありません</span><span class="nl-num">0</span></li>';
  var dt = 0.25 + lines.length * 0.22;
  if (sc.multText) h += '<li class="mult" style="--d:' + dt.toFixed(2) + 's"><span>倍率 <small>' + esc(sc.multText) + '</small></span><span class="nl-num">×' + sc.mult + '</span></li>';
  h += '<li class="total" style="--d:' + (dt + 0.2).toFixed(2) + 's"><span>スコア</span>' + count(sc.total, dt + 0.2, 'big') + '</li></ol></div>';
  if (rec && rec.counts && rec.newBest) h += '<p class="nl-best" style="--d:' + (dt + 0.7).toFixed(2) + 's">自己ベスト更新！（これまで ' + rec.before.best + '点）</p>';
  else if (rec && rec.counts && rec.before && rec.before.best === 0 && sc.total > 0) h += '<p class="nl-best" style="--d:' + (dt + 0.7).toFixed(2) + 's">初めての記録です</p>';
  if (rec && !rec.counts) h += '<p class="note nl-best-note">' + (rec.practice ? '今日の塔の練習です（本番の記録は変わりません）。' : 'シードを指定した冒険は、自己ベストと連勝には数えません。') + '</p>';
  // unlock boxes, one check at a time
  var n = ctx.boxes || (run.bosses + 1), s = ctx.sheet || {};
  h += '<div class="panel nl-boxes" style="max-width:420px;width:100%;text-align:left"><b>解放ボックス</b><div class="nl-boxrow" aria-label="解放ボックス' + n + '個">';
  for (var i = 0; i < n; i++) h += '<i class="nl-box" style="--d:' + (dt + 0.9 + i * 0.28).toFixed(2) + 's" aria-hidden="true"></i>';
  h += '</div><p class="small">' + esc(p.name) + '：ボックスを' + n + '個獲得しました。</p>' + (ctx.awardMsg ? '<p class="small">' + esc(ctx.awardMsg) + '</p>' : '') +
    (s.spare ? '<p class="small">余ったボックス ' + s.spare + '個を割り当ててください：</p><div class="row"><button class="btn sm" data-a="spare" data-v="colorless">無色カード（' + s.colorless + '/3）</button><button class="btn sm" data-a="spare" data-v="act4">第4幕（' + s.act4 + '/5）</button></div>' : '') + '</div>';
  // new medals and the next goal
  if (rec && rec.newMedals.length) h += '<div class="nl-medals-new"><b>新しい勲章</b>' + rec.newMedals.map(function (id) { var m = R.medal(id); return '<div class="nl-medal got"><i aria-hidden="true"></i><span><b>' + esc(m.name) + '</b><small>' + esc(m.tx) + '</small></span></div>'; }).join('') + '</div>';
  var goals = ctx.goals || [];
  if (goals.length) h += '<div class="nl-goal"><b>次の目標</b>' + goals.slice(0, 2).map(function (g) { return '<p>' + esc(g.text) + '</p>'; }).join('') + '</div>';
  // seed and sharing
  h += '<div class="nl-seed"><span>シード <b>' + esc(Y.formatSeed(run.seed)) + '</b></span><button class="btn sm ghost" data-a="copyseed" data-v="' + esc(Y.formatSeed(run.seed)) + '">コピー</button>' +
    (run.daily ? '<button class="btn sm" data-a="sharedaily">結果を共有</button>' : '') + '</div>';
  if (ctx.partyHTML) h += ctx.partyHTML;
  h += '<div class="result-actions" style="margin-top:18px;width:min(340px,90vw)">' + (ctx.solo ? '<button class="btn primary" data-a="playagain">もう一度遊ぶ</button><button class="btn" data-a="quit">タイトルへ</button>' : '<button class="btn primary" data-a="quit">タイトルへ</button>') +
    '<button class="btn ghost" data-a="go" data-v="records">記録を見る</button><button class="btn ghost" data-a="info" data-v="deck">デッキを見る</button></div></div>';
  return h;
};

/* ------------------------------------------------------------------ title screen */
RU.dailyButton = function (data, today) {
  var ch = Y.charFor(today), done = data.daily[today];
  var sub = Y.shortDate(today) + '・' + chName(ch) + '・' + (done ? (done.id ? '本番 ' + done.score + '点（以降は練習）' : '挑戦中（以降は練習）') : '1日1回の本番');
  return '<button class="btn nl-daily-btn" data-a="daily">今日の塔<span class="sub">' + esc(sub) + '</span></button>';
};
RU.titleBadge = function (data) {
  var m = data.title ? R.medal(data.title) : null, n = Object.keys(data.medals).length;
  if (!m && !n) return '';
  return '<div class="nl-title-badge" data-a="go" data-v="records" role="button" tabindex="0">' + (m ? '称号「' + esc(m.name) + '」' : '') + '<small>勲章 ' + n + '/' + R.MEDALS.length + '</small></div>';
};

/* ------------------------------------------------------------------ records screen */
RU.records = function (data, ui, today) {
  var tab = ui.recTab || 'normal';
  var h = '<div class="page records-page" data-keep="records"><div class="back"><button class="ibtn" data-a="title" aria-label="戻る">←</button><h2 style="margin:0">記録</h2></div>';
  h += RU.titleBadge(data) || '<p class="note">冒険を終えると、ここに記録と勲章が残ります。</p>';
  // Today's Tower
  var day = data.daily[today], streak = R.dailyStreak(data, day && day.id ? today : R.prevDay(today));
  h += '<section class="nl-rec-daily"><h3>今日の塔 <small>' + esc(Y.shortDate(today)) + '・' + esc(chName(Y.charFor(today))) + '</small></h3><p>' + (day && day.id ? '本番：' + esc(day.reach) + '・' + day.score + '点' : day ? '本番に挑戦中（あきらめた場合も1回と数えます）' : 'まだ挑戦していません') + '・連続 ' + streak + '日</p></section>';
  // per character
  h += '<div class="seg nl-rec-tabs" role="group" aria-label="冒険の種類">' + ['normal', 'daily', 'short', 'coop', 'downfall'].map(function (k) { return '<button type="button" data-a="rectab" data-v="' + k + '" class="' + (tab === k ? 'on' : '') + '" aria-pressed="' + (tab === k) + '">' + NAMES[k] + '</button>'; }).join('') + '</div>';
  var per = data.cats[tab] || {}, chars = Object.keys(per);
  if (!chars.length) h += '<p class="note">まだ記録がありません。</p>';
  else h += '<table class="nl-rec-table"><thead><tr><th>キャラクター</th><th>最高スコア</th><th>最高到達</th><th>勝利</th><th>連勝</th></tr></thead><tbody>' + chars.map(function (ch) {
    var x = per[ch];
    return '<tr><td>' + esc(chName(ch)) + '</td><td>' + x.best + '</td><td>' + esc(x.reachLabel || '—') + '</td><td>' + x.wins + '</td><td>' + x.streak + '<small>（最高' + x.bestStreak + '）</small></td></tr>';
  }).join('') + '</tbody></table>';
  // history (newest first)
  h += '<h3>最近の冒険 <small>' + data.history.length + '/' + R.MAX_HISTORY + '</small></h3><div class="nl-history">';
  if (!data.history.length) h += '<p class="note">まだありません。</p>';
  data.history.slice().reverse().forEach(function (x) {
    var tags = [NAMES[x.cat] || ''];
    if (x.seeded) tags.push('シード指定'); if (x.practice) tags.push('練習'); if (x.players > 1) tags.push(x.players + '人');
    h += '<button type="button" class="nl-hist' + (x.result === 'victory' ? ' win' : '') + '" data-a="recdetail" data-v="' + esc(x.id) + '"><img src="' + esc(V.heroImg(x.ch)) + '" alt=""><span><b>' + esc(chName(x.ch)) + '・' + esc(x.reach) + '</b><small>' + fmtDate(x.at) + '・' + esc(tags.filter(Boolean).join('・')) + (x.mode === 'beginner' ? '・初心者' : x.asc ? '・A' + x.asc : '') + '</small></span><em>' + x.score + '点</em></button>';
  });
  h += '</div>';
  // medals
  h += '<h3>勲章 <small>' + Object.keys(data.medals).length + '/' + R.MEDALS.length + '・タップで称号にする</small></h3><div class="nl-medals">' + R.MEDALS.map(function (m) {
    var got = data.medals[m.id];
    return '<button type="button" class="nl-medal' + (got ? ' got' : '') + (data.title === m.id ? ' on' : '') + '"' + (got ? ' data-a="settitle" data-v="' + m.id + '" aria-pressed="' + (data.title === m.id) + '"' : ' disabled') + '><i aria-hidden="true"></i><span><b>' + esc(got ? m.name : '？？？') + '</b><small>' + esc(m.tx) + '</small></span></button>';
  }).join('') + '</div>';
  h += '<p class="note">記録はこの端末に保存されます（協力プレイでも各自の端末に自分の記録）。勲章は飾りで、ゲームの強さは変わりません。</p></div>';
  // detail of one adventure
  var det = ui.recDetail ? data.history.filter(function (x) { return x.id === ui.recDetail; })[0] : null;
  if (det) {
    h += '<div class="sheet-back info-sheet nl-rec-back" data-a="recclose"><div class="sheet full nl-rec-detail" data-a="recbox" role="dialog" aria-modal="true" aria-label="冒険の記録"><h3>' + esc(chName(det.ch)) + '・' + esc(det.reach) + '・' + det.score + '点</h3>' +
      '<p class="sub">' + fmtDate(det.at) + '・シード ' + esc(Y.formatSeed(det.seed)) + (det.seeded ? '（シード指定）' : '') + '</p>' +
      '<h4>レリック（' + det.relics.length + '）</h4><div class="nl-det-relics">' + det.relics.map(function (id) { return '<span>' + V.relicIcon(id) + esc(V.relicName(id)) + '</span>'; }).join('') + '</div>' +
      '<h4>デッキ（' + det.deck.length + '枚）</h4><div class="cardgrid nl-det-deck">' + det.deck.map(function (x) { var up = /\+$/.test(x); return V.card({ id: x.replace(/\+$/, ''), up: up }, { cls: 'mini' }); }).join('') + '</div>' +
      '<div class="sheetbtns"><button class="btn ghost" data-a="copyseed" data-v="' + esc(Y.formatSeed(det.seed)) + '">シードをコピー</button><button class="btn primary" data-a="recclose">閉じる</button></div></div></div>';
  }
  return h;
};

/* ------------------------------------------------------------------ solo setup: the short adventure and a seed */
RU.soloExtras = function (st) {
  var shortOk = st.adv !== 'downfall';
  return '<div class="field nl-setup-extra"><label>冒険の長さ</label><div class="seg" role="group" aria-label="冒険の長さ">' +
    '<button type="button" data-a="setshort" data-v="0" class="' + (!st.short || !shortOk ? 'on' : '') + '" aria-pressed="' + !(st.short && shortOk) + '">通常（第1〜3幕）</button>' +
    '<button type="button" data-a="setshort" data-v="1" class="' + (st.short && shortOk ? 'on' : '') + '" aria-pressed="' + !!(st.short && shortOk) + '"' + (shortOk ? '' : ' disabled') + '>短い冒険（第1幕のみ）</button></div>' +
    '<p class="note">短い冒険は第1幕のボスを倒すと勝利です。記録は別枠、解放ボックスは倒したボスの数＋1。アセンションは解放されません。</p></div>' +
    '<div class="field nl-setup-extra"><label for="seedIn">シード（空欄でランダム）</label><input id="seedIn" class="txt" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="例：1234567890" value="' + esc(st.seedText || '') + '">' +
    '<p class="note">同じシード・同じ設定・同じ選択なら、最後まで同じ結果になります。指定した冒険は記録に「シード指定」と付き、自己ベストには数えません。</p></div>';
};
RU.menuSeed = function (run) {
  return '<div class="nl-seed menu-seed"><span>この冒険のシード <b>' + esc(Y.formatSeed(run.seed)) + '</b></span><button class="btn sm ghost" data-a="copyseed" data-v="' + esc(Y.formatSeed(run.seed)) + '">コピー</button></div>';
};
})(typeof window !== 'undefined' ? window : globalThis);
