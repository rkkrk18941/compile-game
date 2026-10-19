/* Local touch layout. Rectangles use percentages of the playfield / touch area.
   Slot order is supplied by app.js, so changing layout never reshuffles a match. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NR_LAYOUT = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var KEY = 'obake.layout.v1';
  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function rect(r, fallback) {
    r = r || {}; fallback = fallback || { x: 0, y: 0, w: 100, h: 100 };
    function n(k) { return typeof r[k] === 'number' && isFinite(r[k]) ? r[k] : fallback[k]; }
    var w = clamp(n('w'), 3, 100), h = clamp(n('h'), 3, 100);
    return { x: clamp(n('x'), 0, 100 - w), y: clamp(n('y'), 0, 100 - h), w: w, h: h };
  }
  function defaults(orientation, preset) {
    var wide = orientation === 'landscape', two = preset === 'two';
    var c = { card: wide ? { x: 0, y: 0, w: 74, h: 100 } : { x: 0, y: 0, w: 100, h: two ? 57 : 70 },
      tap: wide ? { x: 78, y: 0, w: 22, h: 100 } : { x: 0, y: two ? 61 : 74, w: 100, h: two ? 39 : 26 }, slots: [] };
    for (var i = 0; i < 5; i++) {
      c.slots.push(wide ? { x: 4, y: i * 20 + 1, w: 92, h: 18, art: 100 } : two ?
        { x: i < 3 ? i * 34 : 17 + (i - 3) * 34, y: i < 3 ? 0 : 52, w: 32, h: 48, art: 100 } :
        { x: i * 20 + 1, y: 2, w: 18, h: 96, art: 100 });
    }
    return c;
  }
  function normalize(raw, orientation) {
    var d = defaults(orientation); raw = raw || {};
    return { card: rect(raw.card, d.card), tap: rect(raw.tap, d.tap), slots: d.slots.map(function (s, i) {
      var r = raw.slots && raw.slots[i], out = rect(r, s);
      out.art = r && typeof r.art === 'number' && isFinite(r.art) ? clamp(r.art, 25, 100) : 100; return out;
    }) };
  }
  function overlaps(a, b) { return a.x < b.x + b.w - 0.01 && a.x + a.w > b.x + 0.01 && a.y < b.y + b.h - 0.01 && a.y + a.h > b.y + 0.01; }
  function issues(c) {
    var out = [];
    if (overlaps(c.card, c.tap)) out.push('カード表示エリアとタップエリアが重なっています。');
    c.slots.forEach(function (s, i) { c.slots.slice(i + 1).forEach(function (t, j) {
      if (overlaps(s, t)) out.push('コマ' + (i + 1) + 'とコマ' + (i + j + 2) + 'の当たり判定が重なっています。');
    }); }); return out;
  }
  function position(el, r) { ['x', 'y', 'w', 'h'].forEach(function (k, i) { el.style[['left', 'top', 'width', 'height'][i]] = r[k] + '%'; }); }
  function orientation() { return window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait'; }
  var settings, fields = [], deps;
  function read() {
    var raw; try { raw = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* blocked or corrupt */ }
    settings = { portrait: normalize(raw && raw.portrait, 'portrait'), landscape: normalize(raw && raw.landscape, 'landscape') };
    // Recover from invalid saved overlapping configurations as well as malformed data.
    ['portrait', 'landscape'].forEach(function (k) { if (issues(settings[k]).length) settings[k] = defaults(k); });
  }
  function apply() {
    var c = settings[orientation()];
    fields = fields.filter(function (f) { return f.isConnected; });
    fields.forEach(function (f) {
      position(f.querySelector('.layout-card'), c.card);
      position(f.querySelector('.layout-tap'), c.tap);
      f.querySelectorAll('.pc').forEach(function (b, i) { position(b, c.slots[i]); b.style.setProperty('--piece-art', c.slots[i].art + '%'); });
    });
  }
  function attach(parent, stage, pieces) {
    var f = stage.parentElement.classList.contains('playfield') ? stage.parentElement : document.createElement('div');
    if (!f.classList.contains('playfield')) { f.className = 'playfield'; parent.insertBefore(f, stage); f.appendChild(stage); f.appendChild(pieces); }
    stage.classList.add('layout-card'); pieces.classList.add('layout-tap');
    if (fields.indexOf(f) < 0) fields.push(f);
    apply();
  }
  function init(o) { deps = o; read(); window.addEventListener('resize', apply); }
  function open(onClose) {
    var D = deps.D, A = deps.A, order = deps.order().slice(), draft = copy(settings), key = orientation(), selected = 'card';
    var h = '<h3 id="layoutTitle">表示・タップ範囲の設定</h3><p class="note">枠を選んでドラッグすると移動、右下の丸でサイズ変更。数値でも調整できます。<b>青はカード、緑はコマのエリア、オレンジの四角は実際の当たり判定</b>です。空白部分は反応しません。</p>' +
      '<div class="seg" id="layoutOrientation"><button type="button" data-v="portrait">縦画面</button><button type="button" data-v="landscape">横画面</button></div>' +
      '<div class="layout-preview" id="layoutPreview" aria-label="配置プレビュー"><div class="layout-region layout-preview-card" data-layout="card"><span class="layout-label">カード表示エリア</span><div class="layout-sample">' + A.cardFace(D.CARDS[0]) + '</div><span class="layout-handle" data-resize></span></div><div class="layout-region layout-preview-tap" data-layout="tap"><span class="layout-label">タップエリア</span><span class="layout-handle" data-resize></span>' +
      order.map(function (x, i) { return '<div class="layout-slot" data-layout="' + i + '"><span class="layout-slot-art">' + A.piece(x) + '</span><span class="layout-slot-name">' + (i + 1) + ' ' + D.NAME[x] + '</span><span class="layout-handle" data-resize></span></div>'; }).join('') + '</div></div>' +
      '<label class="field"><span>調整するもの</span><select class="input" id="layoutSelect"><option value="card">カード表示エリア</option><option value="tap">タップエリア全体</option>' +
      order.map(function (x, i) { return '<option value="' + i + '">コマ' + (i + 1) + '：' + D.NAME[x] + '</option>'; }).join('') + '</select></label>' +
      '<div class="layout-values">' + ['左から', '上から', '幅', '高さ'].map(function (name, i) { return '<label>' + name + '（%）<input class="input" data-rect="' + ['x', 'y', 'w', 'h'][i] + '" type="number" inputmode="decimal" min="0" max="100" step="0.1"></label>'; }).join('') + '</div>' +
      '<label class="field" id="layoutArtField" hidden><span>コマの絵の大きさ（当たり判定はそのまま） <output id="layoutArtValue"></output></span><input id="layoutArt" type="range" min="25" max="100" step="1"></label>' +
      '<p class="note" id="layoutSize"></p><p class="note warn" id="layoutWarnings" role="status"></p>' +
      '<div class="row"><button class="btn sm" type="button" data-layout-preset="row">標準の配置</button><button class="btn sm" type="button" data-layout-preset="two">3個＋2個に配置</button></div>' +
      '<p class="note">縦・横の設定は別々に、このブラウザへ保存します。1台でふたりでは両側に反映します。コマの並び順は今までどおりモード開始時に決まり、設定で動かすのは各位置の枠です。</p>' +
      '<div class="row"><button class="btn ghost" type="button" data-close>キャンセル</button><button class="btn primary" id="layoutSave" type="button">保存して戻る</button></div>';
    var m = deps.modal(h, { wide: true, onClose: onClose }), preview = m.querySelector('#layoutPreview');
    m.querySelector('[role="dialog"]').setAttribute('aria-labelledby', 'layoutTitle');
    function target() { var c = draft[key]; return selected === 'card' || selected === 'tap' ? c[selected] : c.slots[+selected]; }
    function draw() {
      var c = draft[key];
      preview.classList.toggle('is-landscape', key === 'landscape');
      var live = fields.find(function (f) { return f.getBoundingClientRect().width > 0; });
      if (key === orientation()) {
        var r = live && live.getBoundingClientRect();
        preview.style.aspectRatio = r ? r.width + '/' + r.height : key === 'portrait' ? '370/540' : '760/270';
      } else preview.style.aspectRatio = key === 'portrait' ? '370/540' : '760/270';
      preview.querySelectorAll('[data-layout]').forEach(function (el) {
        var id = el.dataset.layout, v = id === 'card' || id === 'tap' ? c[id] : c.slots[+id];
        position(el, v); el.classList.toggle('selected', id === selected);
        if (v.art) el.style.setProperty('--piece-art', v.art + '%');
      });
      m.querySelectorAll('#layoutOrientation button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === key)); });
      m.querySelector('#layoutSelect').value = selected;
      var t = target();
      m.querySelectorAll('[data-rect]').forEach(function (input) { if (document.activeElement !== input) input.value = Math.round(t[input.dataset.rect] * 10) / 10; });
      m.querySelector('#layoutArtField').hidden = selected === 'card' || selected === 'tap';
      m.querySelector('#layoutArt').value = t.art || 100; m.querySelector('#layoutArtValue').textContent = (t.art || 100) + '%';
      var errs = issues(c); m.querySelector('#layoutWarnings').textContent = errs.join(' ');
      var other = key === 'portrait' ? 'landscape' : 'portrait';
      m.querySelector('#layoutSave').disabled = !!(errs.length || issues(draft[other]).length);
      var small = c.slots.some(function (s) { return preview.clientWidth * c.tap.w / 100 * s.w / 100 < 44 || preview.clientHeight * c.tap.h / 100 * s.h / 100 < 44; });
      m.querySelector('#layoutSize').textContent = small ? 'プレビューでは小さい枠があります。押しやすくするには幅・高さを広げてください。' : '枠の内側だけが反応します。間隔を空けると誤タップを減らせます。';
      m.querySelector('[data-layout-preset="two"]').disabled = key === 'landscape';
    }
    m.querySelector('#layoutSelect').addEventListener('change', function (e) { selected = e.target.value; draw(); });
    m.querySelector('#layoutOrientation').addEventListener('click', function (e) { var b = e.target.closest('[data-v]'); if (b) { key = b.dataset.v; draw(); } });
    m.querySelectorAll('[data-rect]').forEach(function (input) {
      input.addEventListener('input', function () {
        if (input.value === '' || !isFinite(input.valueAsNumber)) return;
        var t = target(), prop = input.dataset.rect, value = input.valueAsNumber;
        if (prop === 'x' || prop === 'y') t[prop] = clamp(value, 0, 100 - t[prop === 'x' ? 'w' : 'h']);
        else { t[prop] = clamp(value, 3, 100); var pos = prop === 'w' ? 'x' : 'y'; t[pos] = clamp(t[pos], 0, 100 - t[prop]); }
        draw();
      });
      input.addEventListener('blur', draw);
    });
    m.querySelector('#layoutArt').addEventListener('input', function (e) { target().art = +e.target.value; draw(); });
    m.querySelectorAll('[data-layout-preset]').forEach(function (b) { b.addEventListener('click', function () { draft[key] = defaults(key, b.dataset.layoutPreset); selected = 'tap'; draw(); }); });
    var drag = null;
    preview.addEventListener('pointerdown', function (e) {
      var el = e.target.closest('[data-layout]'); if (!el || e.button > 0) return;
      e.preventDefault(); selected = el.dataset.layout; draw();
      var parent = selected === 'card' || selected === 'tap' ? preview : preview.querySelector('.layout-preview-tap');
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, start: copy(target()), size: parent.getBoundingClientRect(), resize: !!e.target.closest('[data-resize]') };
      preview.setPointerCapture(e.pointerId);
    });
    preview.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = (e.clientX - drag.x) / drag.size.width * 100, dy = (e.clientY - drag.y) / drag.size.height * 100, t = target(), s = drag.start;
      if (drag.resize) { t.w = clamp(s.w + dx, 3, 100 - s.x); t.h = clamp(s.h + dy, 3, 100 - s.y); }
      else { t.x = clamp(s.x + dx, 0, 100 - s.w); t.y = clamp(s.y + dy, 0, 100 - s.h); }
      draw();
    });
    function stopDrag() { drag = null; }
    preview.addEventListener('pointerup', stopDrag); preview.addEventListener('pointercancel', stopDrag); preview.addEventListener('lostpointercapture', stopDrag);
    m.querySelector('#layoutSave').addEventListener('click', function () {
      if (issues(draft.portrait).length || issues(draft.landscape).length) return;
      try { localStorage.setItem(KEY, JSON.stringify(draft)); } catch (e) { m.querySelector('#layoutWarnings').textContent = '設定を保存できませんでした。ブラウザの保存設定を確認してください。'; return; }
      settings = copy(draft); apply(); deps.close();
    });
    draw();
  }
  return { defaults: defaults, normalize: normalize, overlaps: overlaps, issues: issues, init: init, attach: attach, apply: apply, open: open };
});
