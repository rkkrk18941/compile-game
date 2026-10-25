/* Read-only help overlay; independent of gameplay prompts and network commands. */
(function (root) {
'use strict';
var S = root.STS, H = S.Help, V = S.View, esc = V.esc;
var U = S.HelpUI = {}, state = { open: false, key: null, query: '', group: '', context: '', stack: [] }, previousFocus;
var host = document.createElement('div'); host.id = 'referenceRoot'; document.body.appendChild(host);
var names = {}, words = [];
H.terms.forEach(function (t) { [t.name].concat(t.aliases).forEach(function (n) { if (n.length > 1 || n === 'X' || n === '毒') { if (!names[n]) { names[n] = t.key; words.push(n); } } }); });
words.sort(function (a, b) { return b.length - a.length; });
var re = new RegExp('(HPを[0-9０-９X]+失う|' + words.map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')', 'g');
H.mark = function (s, interactive) {
  var raw = String(s == null ? '' : s), out = '', at = 0;
  raw.replace(re, function (w, _, index) {
    out += esc(raw.slice(at, index));
    out += interactive ? '<button type="button" class="term-link" data-help="' + (names[w] || 'term:losehp') + '">' + esc(w) + '</button>' : '<span class="kw">' + esc(w) + '</span>';
    at = index + w.length; return w;
  });
  return out + esc(raw.slice(at));
};
U.button = function (key, label, cls) { return '<button type="button" class="btn ghost ' + (cls || 'sm') + '" data-help="' + esc(key || '') + '">' + esc(label || '？ 用語・効果を調べる') + '</button>'; };
U.related = function (text, exclude) {
  var ts = H.findTerms(text).filter(function (t) { return t.key !== exclude; });
  if (!ts.length) return '';
  return '<div class="help-related"><h3>この説明の用語</h3><div class="help-chips">' + ts.map(function (t) { return U.button(t.key, t.name); }).join('') + '</div></div>';
};
function captureContext() {
  var a = document.getElementById('app'); return a ? (a.innerText || a.textContent || '') : '';
}
function snapshot() { return { key: state.key, query: state.query, group: state.group, scroll: (host.querySelector('.help-body') || {}).scrollTop || 0 }; }
U.open = function (key) {
  if (!state.open) { previousFocus = document.activeElement; state.context = captureContext(); state.stack = []; }
  else state.stack.push(snapshot());
  state.open = true; state.key = key && H.get(key) ? key : null;
  if (!state.key) { state.query = ''; state.group = '今の画面'; }
  paint(true);
};
function close() {
  state.open = false; host.innerHTML = '';
  document.getElementById('app').inert = false;
  if (previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
}
function back() {
  var s = state.stack.pop();
  if (!s && !state.key) { close(); return; }
  if (!s) { state.key = null; state.query = ''; state.group = ''; paint(true); return; }
  Object.assign(state, s); paint(true); host.querySelector('.help-body').scrollTop = s.scroll;
}
function paragraphs(text) { return '<p>' + H.mark(text, true).replace(/\n/g, '<br>') + '</p>'; }
function steps(text) {
  return '<ol class="help-steps">' + String(text || '').split(/[。\n]+/).filter(Boolean).map(function (s) { return '<li>' + H.mark(s + '。', true) + '</li>'; }).join('') + '</ol>';
}
function cardEffect(id, up) {
  var d = S.CARDS[id], val = function (v) { return Array.isArray(v) ? v[up ? 1 : 0] : v; };
  var cost = up ? d.cu : d.c, traits = [], tx = V.cardText(id, up);
  if (val(d.ex)) traits.push('廃棄'); if (val(d.eth)) traits.push('エーテリアル'); if (val(d.ret)) traits.push('保留'); if (d.unplayable) traits.push('使用不可');
  var metadata = [V.TYPE[d.t], V.RARITY[d.r], S.DATA.CHARS[d.ch] ? S.DATA.CHARS[d.ch].name : d.t === 'C' ? '呪い' : d.t === 'T' ? '状態異常' : '無色カード'];
  var target = { E: '敵1体を選ぶ（ほかの列でも可）', R: '1列を選ぶ。その列の敵と共有ボスが対象', P: 'プレイヤーを1人選ぶ（自分も可）' }[d.tg];
  var h = '<div class="help-facts">' + paragraphs(metadata.join(' ／ ')) + paragraphs('必要なエナジー：' + (d.unplayable || cost == null ? '使用不可' : cost === 'X' ? 'X（支払う量を選ぶ）' : cost));
  if (target) h += paragraphs('対象：' + target);
  if (d.unlock) h += paragraphs('カード解放レベル' + d.unlock + 'で報酬などに追加');
  if (traits.length) h += paragraphs('性質：' + traits.join('・'));
  h += '</div><h3>' + (up ? 'アップグレード後の効果' : '通常の効果') + '</h3>' + steps(tx);
  h += paragraphs(d.unplayable ? '使えないカードです。手札にある時の効果や、ターン終了時の処理は本文のとおりに行います。' : d.t === 'P' ? '使うと場に置き、その戦闘中に書かれた条件で効果が働きます。' : val(d.ex) ? '使い終わると廃棄へ移動します。通常、この戦闘中は引き直せません。' : /このカードを山札/.test(tx) ? '使った後の置き場は本文に指定されています。' : '通常、使い終わると捨て札へ移動します。本文に別の置き場の指定があれば、その指定を優先します。');
  return h;
}
function detail(d) {
  var h = '<div class="help-category">' + esc(d.group) + '</div><h2 id="helpTitle">' + esc(d.name) + '</h2>', text = d.text;
  if (d.kind === 'card') {
    var c = S.CARDS[d.id];
    h += cardEffect(d.id, false);
    if (!c.noUpgrade && c.tx[1]) h += '<details class="help-upgrade"><summary>「+」に強化した時との違い</summary>' + cardEffect(d.id, true) + '</details>';
    h += U.related(text + ' コスト ' + (V.TYPE[c.t] || ''), d.key);
  } else if (d.kind === 'enemy') {
    var m = S.MONSTERS[d.id], rows = V.enemyReference(d.id, 0);
    h += paragraphs(V.PASSIVE[d.id] || '特別な常時能力の記載はありません。下の行動ごとの効果を確認してください。');
    h += paragraphs(m.type === 'die' ? 'ダイスの目で行動が決まります。戦闘中に敵を押すと、今の行動が分かります。' : m.type === 'single' ? '毎ターン、同じ行動を行います。' : '行動マーカーの位置や状態に応じて行動が決まります。戦闘中の表示で現在の行動を確認できます。');
    h += '<h3>通常の難易度での行動</h3><p class="note">以下は補正前の基本値です。筋力・脱力・弱体化や人数、遭遇の種類で変わります。現在の値は戦闘中の敵の詳細に表示します。</p>';
    rows.forEach(function (r) { h += '<div class="help-facts"><b>' + esc(r.k + '：' + r.name) + '</b>' + paragraphs(r.text.replace(/<[^>]*>/g, '')) + '</div>'; });
    var a1 = V.enemyReference(d.id, 1), a7 = V.enemyReference(d.id, 7), a10 = V.enemyReference(d.id, 10), a12 = V.enemyReference(d.id, 12);
    [[1, a1], [7, a7], [10, a10], [11, V.enemyReference(d.id, 11)], [12, a12]].forEach(function (tier) { if (JSON.stringify(tier[1]) !== JSON.stringify(rows)) { h += '<details class="help-upgrade"><summary>アセンション' + tier[0] + 'での行動</summary>'; tier[1].forEach(function (r) { h += '<p><b>' + esc(r.name) + '</b><br>' + H.mark(r.text.replace(/<[^>]*>/g, ''), true) + '</p>'; }); h += '</details>'; } });
    h += U.related(text, d.key);
  } else if (d.kind === 'hero') {
    h += paragraphs('初期HP：' + S.DATA.CHARS[d.id].hp) + steps(text) + U.related(text, d.key);
    h += '<h3>最初のデッキ</h3><div class="help-chips">';
    Array.from(new Set(S.DATA.CHARS[d.id].deck)).forEach(function (id) { var n = S.DATA.CHARS[d.id].deck.filter(function (x) { return x === id; }).length; h += U.button('card:' + id, S.CARDS[id].name + ' ×' + n); }); h += '</div>';
  } else if (d.kind === 'asc') {
    h += paragraphs(d.text) + paragraphs('この段階までの変更はすべて累積します。') + U.related('アセンション ' + d.text, d.key);
  } else {
    h += d.kind === 'term' ? paragraphs(text) : steps(text);
    if (d.kind === 'potion') { var pd = S.POTIONS[d.id]; h += paragraphs(pd.passive ? '持っていれば条件を満たした時に自動で働き、その後に消費されます。' : pd.dieOnly ? 'ダイス結果を受け入れる前の画面で使います。使用すると消費されます。' : '通常はプレイヤーのターン中に使い、使用後に消費されます。' + (pd.out ? '戦闘外でも使えます。' : '戦闘外では使えません。')); }
    if (d.kind === 'relic') { var rd = S.RELICS[d.id]; h += paragraphs(rd.onGain && /すぐに使い、捨てる/.test(rd.tx) ? '受け取るとすぐに効果を処理し、このレリック自体は捨てます。' : rd.activate ? '戦闘中、レリックのアイコンを押して「使う」を選ぶ能力です。回数制限は本文で確認してください。' : '持っていると、書かれた条件を満たした時に働きます。'); }
    if (d.example) h += '<div class="help-example"><b>例</b>' + paragraphs(d.example) + '</div>';
    h += U.related(text, d.key);
    if (d.key === 'term:ascension') { h += '<h3>各レベルで変わること</h3>'; S.DATA.ASCENSION.forEach(function (a, i) { if (a) h += '<div class="help-facts"><b>' + i + '：' + esc(a.name) + '</b>' + paragraphs(a.desc) + '</div>'; }); }
  }
  return h;
}
function indexHTML() {
  var groups = ['今の画面', '基本', '戦闘', 'カードの読み方', 'カードの種類', 'カードの置き場', 'キャラクター', '戦闘の進行', '冒険・解放', 'マップ', '協力プレイ', '状態異常・呪い', '敵の能力', 'アイテム', 'カード', 'レリック', 'ポーション', '敵', 'アセンション'];
  return '<h2 id="helpTitle">用語・効果の解説</h2><p class="note">分からない言葉や名前を検索できます。カード・レリック・ポーション・敵は未解放の内容も収録しています。</p>' +
    '<label for="helpSearch" class="small">用語・効果・名前で検索</label><input id="helpSearch" class="txt" type="search" placeholder="例：アセンション、毒、ストライク" value="' + esc(state.query) + '">' +
    '<div class="help-categories" aria-label="解説の分類">' + [''].concat(groups).map(function (g) { return '<button type="button" class="help-filter' + (state.group === g ? ' on' : '') + '" data-help-group="' + esc(g) + '" aria-pressed="' + (state.group === g) + '">' + esc(g || 'すべて') + '</button>'; }).join('') + '</div><div id="helpResults"></div>';
}
function results() {
  var list;
  if (state.group === '今の画面') {
    list = H.search(state.query).filter(function (d) { return d.kind === 'term' ? H.findTerms(state.context).indexOf(d) >= 0 : state.context.indexOf(d.name) >= 0; });
  } else list = H.search(state.query, state.group);
  var h = '<p class="note" role="status">' + list.length + '件</p>';
  h += list.map(function (d) { return '<button type="button" class="help-result" data-help="' + esc(d.key) + '"><span>' + esc(d.group) + '</span><b>' + esc(d.name) + '</b><p>' + esc(d.text.replace(/\n/g, ' ').slice(0, 90)) + (d.text.length > 90 ? '…' : '') + '</p></button>'; }).join('');
  if (!list.length) h += '<p>見つかりません。短い単語で検索するか、分類を「すべて」にしてください。</p>';
  host.querySelector('#helpResults').innerHTML = h;
}
function paint(focus) {
  var d = state.key && H.get(state.key);
  host.innerHTML = '<div class="help-back"><section class="help-dialog" role="dialog" aria-modal="true" aria-labelledby="helpTitle"><div class="help-nav"><button type="button" class="btn ghost sm" data-help-back>' + (state.stack.length ? '← 前の解説' : d ? '← 用語集' : '← ゲームへ戻る') + '</button><button type="button" class="btn ghost sm" data-help-close>閉じる</button></div><div class="help-body">' + (d ? detail(d) : indexHTML()) + '</div></section></div>';
  document.getElementById('app').inert = true;
  if (!d) results();
  if (focus) host.querySelector('[data-help-close]').focus({ preventScroll: true });
}
// Annotate only descriptive text, never an action button's hit area or a selected card's text.
U.annotate = function (app) {
  var nodes = app.querySelectorAll('.note, .evtext, .itemrow .t span, .acttable td, .ctype');
  Array.prototype.forEach.call(nodes, function (node) {
    if (node.closest('button, [data-help], .ctext')) return;
    var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT), texts = [], t;
    while ((t = walker.nextNode())) if (!t.parentElement.closest('[data-help], button, .kw')) texts.push(t);
    texts.forEach(function (t) { var marked = H.mark(t.textContent, true); if (marked.indexOf('data-help') < 0) return; var span = document.createElement('span'); span.innerHTML = marked; t.replaceWith(span); });
  });
};
document.addEventListener('click', function (ev) {
  var el = ev.target.closest('[data-help], [data-help-close], [data-help-back], [data-help-group]');
  if (!el) return;
  ev.preventDefault(); ev.stopImmediatePropagation();
  if (el.hasAttribute('data-help-close')) close();
  else if (el.hasAttribute('data-help-back')) back();
  else if (el.hasAttribute('data-help-group')) { state.group = el.getAttribute('data-help-group'); paint(false); }
  else U.open(el.getAttribute('data-help'));
});
document.addEventListener('input', function (ev) { if (ev.target.id === 'helpSearch') { state.query = ev.target.value; if (state.group === '今の画面' && state.query) { state.group = ''; Array.prototype.forEach.call(host.querySelectorAll('[data-help-group]'), function (el) { var on = el.getAttribute('data-help-group') === ''; el.classList.toggle('on', on); el.setAttribute('aria-pressed', String(on)); }); } results(); host.querySelector('.help-body').scrollTop = 0; } });
document.addEventListener('keydown', function (ev) {
  if (!state.open) return;
  if (ev.key === 'Escape') { ev.preventDefault(); close(); }
  if (ev.key === 'Tab') {
    var buttons = Array.prototype.filter.call(host.querySelectorAll('button, input, summary'), function (el) { return el.getClientRects().length > 0; }), first = buttons[0], last = buttons[buttons.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }
});
U.state = state;
})(window);
