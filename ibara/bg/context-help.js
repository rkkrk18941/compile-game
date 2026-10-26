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
  return '<h3>ターン終了後に起きること</h3><p>全員のターンが終わると、終了時の効果を処理してから敵が行動します。下は今の状態での予告です。毒で敵が倒れたり、先の敵や仲間の効果で状態が変わると、結果も変わります。</p>' + cb.pcs().map(function (pc) { return E.player(cb, pc, run); }).join('') + cb.actionOrder().map(function (e) { return E.enemy(cb, e, run, me); }).join('') + '<p class="note">攻撃の数字はブロックで防ぐ前の値です。終了時のパワー・レリックなどは、それぞれの説明の条件で処理します。</p>';
};
/* Explain the consequences of technical card words before committing the card. */
E.cardGuide = function (c, pc) {
  if (!E.enabled()) return '';
  var tx = V.cardText(c.id, c.up), terms = H.findTerms(tx).filter(function (t) { return ['damage', 'attack', 'skill', 'cost', 'energy', 'hp', 'gold', 'hit'].indexOf(t.id) < 0; });
  if (!terms.length) return '';
  var concise = { wrath: 'アタックの各ヒット＋1。憤怒のまま全員のターンが終わると、自分に1ダメージ（ブロックで防げます）。', calm: '別の構えに変わった時にエナジー＋2。入った瞬間は増えません。', exhaust: '使うと廃棄札へ。この戦闘中は通常引き直せません。', ethereal: '使わずにターンを終えると廃棄され、この戦闘中は通常引き直せません。', retain: 'ターン終了時に捨てず、次の手札に残します。' };
  var h = terms.map(function (t) { return '<span><strong>' + esc(t.name) + '</strong>：' + esc(concise[t.id] || t.text) + '</span>'; }).join('');
  if (pc && pc.stance === 'calm' && /憤怒|ニュートラル/.test(tx)) h += '<span>今は平静なので、別の構えに変わるとエナジーを2得ます（上限6）。</span>';
  return '<span class="card-effect-guide" tabindex="0" aria-label="このカードで起きること">' + h + '</span>';
};
E.player = function (cb, pc, run) {
  if (!E.enabled() || !pc) return '';
  var text = '', name = pc.i === 0 && run.players.length === 1 ? 'あなた' : run.players[pc.i].name;
  if (pc.stance === 'wrath') {
    var bonus = 1 + cb.powSum(pc, 'SimmeringFury', function (p) { return p.up ? 2 : 1; });
    text += '現在の構えは憤怒。あなたのアタックは各ヒットに+' + bonus + '（ほかの補正を加える前）。憤怒のまま全員のターンが終わると、自分が1ダメージを受けます。これは敵の攻撃ではなく憤怒の代償で、ブロックで防げます。1ダメージは構えに入った瞬間ではなく、ターン終了時です。平静・通常の構えに変われば、この代償はなくなります。';
    text += '現在のブロックは' + pc.blk + '。他の防御効果がなければ、憤怒だけの1ダメージは' + (pc.blk >= 1 ? 'ブロックで防げます' : 'HPを1減らします') + '（先に処理されるカード・オーブ・レリックなどで変わります）。';
  } else if (pc.stance === 'calm') text += '現在の構えは平静。入った瞬間には何も増えません。憤怒や通常の構えに変わった時、エナジーを2得ます（上限6）。平静に入り直しても増えません。';
  if (pc.orbs && pc.orbs.length) text += '生成中のオーブ：' + pc.orbs.map(function (x) { return { lightning: 'ライトニング', frost: 'フロスト', dark: 'ダーク' }[x] || x; }).join('、') + '。';
  var status = (pc.weak ? '脱力' + pc.weak + '。' : '') + (pc.vuln ? '弱体化' + pc.vuln + '。' : '');
  if (!text && !status) return '';
  return '<section class="effect-guide player-effect-guide"><h4>' + esc(name) + 'に起きる効果</h4><p>' + esc(text + status) + '</p>' + E.terms(status + (pc.orbs && pc.orbs.length ? text.split('生成中')[1] : '')) + '</section>';
};
E.result = function (r, me) {
  var h = '<div class="room-result"><h3>' + esc(r.title) + '</h3>';
  if (r.choices.length) h += '<h4>選んだ内容</h4><ul>' + r.choices.map(function (x) { return '<li>' + esc((x.pi != null ? (r.rows.filter(function (p) { return p.i === x.pi; })[0] || {}).name || '' : '全員') + '：' + x.label) + '</li>'; }).join('') + '</ul>';
  if (r.changes && r.changes.length) h += '<div class="effect-guide">' + r.changes.map(function (text) { return '<p>' + esc(text) + '</p>'; }).join('') + '</div>';
  r.rows.forEach(function (p) {
    h += '<section class="result-player"><h4>' + esc(p.i === me ? 'あなたの結果' : p.name + 'の結果') + '</h4><table class="result-stats"><thead><tr><th>項目</th><th>前</th><th>後</th><th>変化</th></tr></thead><tbody>' + p.stats.map(function (x) { var delta = x.after - x.before; return '<tr><th>' + esc(x.label) + '</th><td>' + x.before + '</td><td>' + x.after + '</td><td>' + (delta > 0 ? '+' : '') + delta + '</td></tr>'; }).join('') + '</tbody></table>';
    var changes = 0;
    [['addedCards', '加わったカード'], ['removedCards', '除去したカード'], ['upgradedCards', 'アップグレードしたカード']].forEach(function (x) {
      if (!p[x[0]].length) return; changes++;
      h += '<h4>' + x[1] + '</h4>' + p[x[0]].map(function (c) { var tx = V.cardText(c.id, c.up); return '<div class="result-item"><b>' + esc(V.cardName(c)) + '</b><p>' + esc(tx) + '</p>' + E.terms(tx) + '</div>'; }).join('');
    });
    [['addedRelics', '得たレリック', S.RELICS], ['removedRelics', '失ったレリック', S.RELICS], ['addedPotions', '得たポーション', S.POTIONS], ['removedPotions', '失ったポーション', S.POTIONS]].forEach(function (x) {
      if (!p[x[0]].length) return; changes++;
      h += '<h4>' + x[1] + '</h4>' + p[x[0]].map(function (id) { var def = x[2][id] || { name: id, tx: '' }; return '<div class="result-item"><b>' + esc(def.name) + '</b><p>' + esc(def.tx) + '</p>' + E.terms(def.tx) + '</div>'; }).join('');
    });
    if (!changes) h += '<p>カード・レリック・ポーションの変更はありません。</p>';
    h += '</section>';
  });
  return h + '<p class="note">' + (r.nextKind === 'battle' ? '戦闘はまだ始まっていません。確認後、下のボタンで開始します。' : '結果は反映済みです。確認が終わったら下のボタンを押してください。') + '</p></div>';
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
