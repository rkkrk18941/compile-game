/* Contextual explanations. Read-only: facts come from the same definitions and forecast as play. */
(function (root) {
'use strict';
var S = root.STS, V = S.View, H = S.Help, esc = V.esc;
var E = S.Explain = {};
E.enabled = function () { return true; };
E.terms = function (text, inline) {
  if (!E.enabled()) return '';
  var terms = H.findTerms(String(text || ''));
  if (!terms.length) return '';
  var tag = inline ? 'span' : 'div';
  return '<' + tag + ' class="effect-terms">' + terms.map(function (t) {
    return '<' + tag + ' class="effect-term"><b>' + esc(t.name) + '</b>：' + esc(t.text) + '</' + tag + '>';
  }).join('') + '</' + tag + '>';
};
/* Keep only the selected die ability, including later sentences such as temporary Strength expiring. */
E.dieText = function (id, fi) {
  var d = S.RELICS[id], f = d && d.die && d.die[fi];
  if (!f) return d ? d.tx : '';
  var tx = d.tx, re = /ダイス([1-6](?:・[1-6])*)[：:]/g, matches = [], m;
  while ((m = re.exec(tx))) matches.push({ start: m.index, end: re.lastIndex, faces: m[1].split('・').map(Number) });
  for (var i = 0; i < matches.length; i++) {
    var part = matches[i];
    if (f.f.every(function (n) { return part.faces.indexOf(n) >= 0; })) return tx.slice(part.end, matches[i + 1] ? matches[i + 1].start : tx.length).trim();
  }
  return tx;
};
/* The existing option ID includes owner, relic and die-ability index; this also works with older hosts. */
E.ability = function (o, run) {
  var m = /^([0-9]+):([^:]+):([0-9]+)$/.exec(String(o.id)), p, d;
  if (!m || !run || !(p = run.players[+m[1]]) || !(d = S.RELICS[m[2]]) || !d.die || !d.die[+m[3]]) return null;
  if (!p.relics.some(function (r) { return r.id === m[2]; })) return null;
  return { owner: +m[1], id: m[2], fi: +m[3], text: E.dieText(m[2], +m[3]) };
};
E.option = function (o, run, me) {
  if (!E.enabled()) return '';
  var a = E.ability(o, run), text = a ? a.text : o.relic ? V.relicText(o.relic) : o.potion ? V.potionText(o.potion) : o.card ? V.cardText(o.card.id, o.card.up) : o.label;
  var h = '';
  if (a) h = '<span class="choice-effect"><b>選ぶと：</b>' + (a.id === 'PenNib' ? '敵を1体選び、' : '') + esc(text) + '<span class="choice-owner">効果を処理する人：' + esc(a.owner === me ? 'あなた' : run.players[a.owner].name) + '。必要なら、その人が対象を選びます。</span><span class="choice-owner">名前の後の数字は通常の発動に必要な出目です。今回はこの能力を選んで発動できます。</span></span>';
  return h + E.terms(text, true);
};
E.prompt = function (q) {
  if (!E.enabled() || !q || !/^(enemy|player|row|cards|deck|confirm)$/.test(q.type)) return '';
  var name = String(q.title || '').split('：')[0], id = Object.keys(S.RELICS).filter(function (id) { return S.RELICS[id].name === name; })[0];
  if (!id) return '';
  var text = S.RELICS[id].tx;
  return '<aside class="effect-guide"><b>' + esc(name) + 'の効果</b><p>' + esc(text) + '</p>' + E.terms(text) + '</aside>';
};
E.guardian = function (e, a) {
  if (!e || e.id !== 'Guardian') return '';
  if (a && a.name === '防御モードB') return '「B」は防御モードの2番目の行動名です。①表示のダメージで攻撃 ②自分の筋力を1増やす ③次のラウンドから攻撃モードに戻る、の順です。増えた筋力は今回の攻撃には乗らず、以後の各ヒットに加算されます。';
  if (a && a.name === '防御モードA') return '「A」は防御モードの1番目の行動名です。表示のダメージで攻撃し、次の行動は防御モードBになります。';
  if (a && a.name === 'モードシフト') return '敵ターン開始時にガーディアンのブロックが残っていれば攻撃します。ブロックが0なら攻撃せず、次のラウンドから防御モードになります。';
  return '';
};
E.enemy = function (cb, e, run, me) {
  if (!E.enabled()) return '';
  var a = cb.currentAction(e), text = E.guardian(e, a), passive = V.PASSIVE[e.id] || '';
  var h = '<section class="effect-guide"><h4>' + esc((S.MONSTERS[e.id] || {}).name) + '：' + esc(a ? a.name : '未確定') + '</h4>';
  if (text) h += '<p>' + esc(text) + '</p>';
  h += V.intentHTML(cb, e, a, run, me);
  if (e.mode === 'defense' && e.id === 'Guardian') h += '<p class="effect-warning">今は鋭い外殻が有効：アタックを使うたび、使った人に1ダメージ。ブロックで防げます。ペン先や毒の効果だけならアタック使用には当たりません。</p>';
  else if (passive) h += '<p>' + esc(passive) + '</p>';
  return h + E.terms(V.actionText(e, a) + ' ' + passive) + '</section>';
};
E.turn = function (run, me) {
  var cb = S.Session.query(run);
  if (!cb) return '';
  return '<h3>ターン終了後に起きること</h3><p>全員のターンが終わると、終了時の効果を処理してから敵が行動します。下は今の状態での予告です。毒で敵が倒れたり、先の敵や仲間の効果で状態が変わると、結果も変わります。</p>' + cb.actionOrder().map(function (e) { return E.enemy(cb, e, run, me); }).join('') + '<p class="note">攻撃の数字はブロックで防ぐ前の値です。終了時のパワー・レリックなどは、それぞれの説明の条件で処理します。</p>';
};
/* Auto-activation captions stay in the battle log too. */
E.relicCaption = function (id, fi) {
  if (!E.enabled()) return '';
  var d = S.RELICS[id];
  if (!d) return '';
  var text = fi == null ? d.tx : E.dieText(id, fi);
  var terms = H.findTerms(text).filter(function (t) { return /^(weak|vulnerable|poison|strength|block|exhaust|retain|scry)$/.test(t.id); });
  var brief = { weak: '各ヒットの攻撃ダメージ−1。アタック処理後に1減る。', vulnerable: 'アタックから受ける各ヒットが2倍。アタック処理後に1減る（攻撃側の脱力とは相殺）。', poison: '全員のターン終了時に、数と同じHPを奪う。自動では減らない。', strength: '以後のアタックの各ヒットに加算。', block: 'ダメージを先に引き受ける盾。' };
  return text + (terms.length ? ' ' + terms.map(function (t) { return t.name + '：' + (brief[t.id] || t.text); }).join(' ') : '');
};
})(typeof window !== 'undefined' ? window : globalThis);
