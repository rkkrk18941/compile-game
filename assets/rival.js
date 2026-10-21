/* PLAYROOM — 成長する敵 (the learning rival), shared by every game with CPU players.

   One rival per game per device. It starts as strong as the game's 最強 CPU and keeps:
     gen     its generation (第N世代)
     rec     its record against you { cpu, you, draw }
     params  the strategy values it has learned (each game says which, with Japanese labels)
     boost   how much more it thinks than 最強 (1 = the same; grows with every loss, up to the game's cap)
     log     what changed at each generation
   When it loses it learns: it thinks harder, and it trains against its previous self in the game's CPU worker
   (assets/rival-tune.js), keeping a change of strategy only when the change wins those practice games.
   It never uses anything a person at the table could not see; the games' CPUs decide from a player's view.

   Page:   var R = PLAYROOM_RIVAL.open('gensou-seven', { base: {...}, space: {...}, boostStep: 0.3, boostMax: 3 });
           (optional: boostLabel '記憶力' and boostUp '覚えられる長さをのばしました' where the boost is not thinking)
           R.params, R.boost, R.gen, R.rec
           R.result('cpu' | 'you' | 'draw')        → true when it should learn now
           PLAYROOM_RIVAL.learn(R, runTune)        overlay + learning; runTune(job) → Promise(result) from the worker
           PLAYROOM_RIVAL.cardHTML(R) / bindCard(el, R, onChange)   a small panel for the setup screen */
(function (root) {
  'use strict';
  var doc = root.document;
  var KEY = 'playroom.rival.';
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function read(id) { try { var s = root.localStorage.getItem(KEY + id); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function write(id, st) { try { root.localStorage.setItem(KEY + id, JSON.stringify(st)); } catch (e) { /* private mode: the rival forgets */ } }

  function fresh(cfg) { return { v: 1, gen: 1, rec: { cpu: 0, you: 0, draw: 0 }, params: clone(cfg.base || {}), boost: 1, log: [], seen: {}, born: Date.now() }; }

  function open(id, cfg) {
    cfg = cfg || {};
    var st = read(id);
    if (!st || st.v !== 1) st = fresh(cfg);
    // keep learned values that still exist, add new ones at their defaults, clamp to the current ranges
    var base = cfg.base || {}, space = cfg.space || {}, p = {};
    Object.keys(base).forEach(function (k) {
      var v = st.params && typeof st.params[k] === 'number' ? st.params[k] : base[k];
      if (space[k]) v = Math.max(space[k].min, Math.min(space[k].max, v));
      p[k] = v;
    });
    st.params = p;
    if (!st.rec) st.rec = { cpu: 0, you: 0, draw: 0 };
    if (!(st.boost >= 1)) st.boost = 1;
    st.boost = Math.min(st.boost, cfg.boostMax || 3);
    if (!st.seen) st.seen = {};
    var R = {
      id: id, cfg: cfg,
      get gen() { return st.gen; }, get rec() { return st.rec; }, get params() { return st.params; },
      get boost() { return st.boost; }, get log() { return st.log; }, get seen() { return st.seen; },
      name: cfg.name || '成長する敵',
      /* a finished game against the rival: 'cpu' (it won), 'you', or 'draw'. Returns true when it should learn. */
      result: function (outcome) {
        if (outcome === 'cpu') st.rec.cpu++; else if (outcome === 'you') st.rec.you++; else st.rec.draw++;
        write(id, st);
        return outcome === 'you';
      },
      /* what a game has noticed about how you play (it decides what to keep) */
      observe: function (fn) { try { fn(st.seen); } catch (e) { /* ignore */ } write(id, st); },
      /* adopt what a learning session produced */
      grow: function (res) {
        var before = st.boost;
        var step = cfg.boostStep == null ? 0.3 : cfg.boostStep;
        st.boost = Math.min(cfg.boostMax || 3, Math.round((st.boost + step) * 100) / 100);
        var changes = [];
        if (res && res.params) {
          Object.keys(st.params).forEach(function (k) {
            if (typeof res.params[k] === 'number' && Math.abs(res.params[k] - st.params[k]) > 1e-9) {
              changes.push({ k: k, from: st.params[k], to: res.params[k] });
              st.params[k] = res.params[k];
            }
          });
        }
        st.gen++;
        var entry = { gen: st.gen, at: Date.now(), boost: [before, st.boost], changes: changes, score: res && res.score || null, games: res && res.games || 0, tried: res && res.tried || 0, notes: (res && res.notes) || [] };
        st.log.push(entry);
        if (st.log.length > 40) st.log = st.log.slice(-40);
        write(id, st);
        return entry;
      },
      reset: function () { st = fresh(cfg); write(id, st); },
      save: function () { write(id, st); },
      describe: function (k) { return (space[k] && space[k].label) || k; }
    };
    return R;
  }

  /* ---------------------------------------------------------------- words */
  function boostText(b) { return '×' + (Math.round(b * 10) / 10).toFixed(1); }
  function boostLabel(R) { return R.cfg.boostLabel || '思考量'; }
  function changeText(R, c) {
    var sp = (R.cfg.space || {})[c.k] || {};
    var up = c.to > c.from;
    var word = up ? (sp.up || '強める') : (sp.down || '弱める');
    return '「' + (sp.label || c.k) + '」を' + word;
  }
  function recordText(R) { var r = R.rec; return 'あなた ' + r.you + '勝 ・ ' + R.name + ' ' + r.cpu + '勝' + (r.draw ? ' ・ 引き分け ' + r.draw : ''); }

  /* ---------------------------------------------------------------- looks (scoped, works on any game's theme) */
  var CSS = '' +
    '.rv-veil{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:16px;background:rgba(6,9,14,.72);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);font-family:"Zen Kaku Gothic New","BIZ UDPGothic","Hiragino Sans","Noto Sans JP",system-ui,sans-serif;color:#f3f1ea;animation:rvFade .2s ease-out}' +
    '@keyframes rvFade{from{opacity:0}}' +
    '.rv-box{width:min(420px,100%);max-height:calc(100dvh - 32px);overflow:auto;box-sizing:border-box;padding:22px 20px 18px;border-radius:20px;background:linear-gradient(165deg,#1d2733,#121820);border:1px solid rgba(160,230,190,.28);box-shadow:0 30px 80px rgba(0,0,0,.6);text-align:center}' +
    '.rv-box h3{margin:6px 0 4px;font-size:21px;font-weight:900;letter-spacing:.02em}' +
    '.rv-box p{margin:6px 0;font-size:13.5px;line-height:1.65;color:#c9d2cf}' +
    '.rv-ring{position:relative;width:132px;height:132px;margin:2px auto 8px}' +
    '.rv-ring svg{display:block;width:100%;height:100%;transform:rotate(-90deg)}' +
    '.rv-ring .bg{fill:none;stroke:rgba(255,255,255,.08);stroke-width:9}' +
    '.rv-ring .fg{fill:none;stroke:url(#rvGrad);stroke-width:9;stroke-linecap:round;transition:stroke-dashoffset .35s ease}' +
    '.rv-ring .mid{position:absolute;inset:0;display:grid;place-items:center;align-content:center;gap:0}' +
    '.rv-ring .mid small{font-size:11px;font-weight:700;color:#9fdcbc;letter-spacing:.08em}' +
    '.rv-ring .mid b{font-family:"Oswald","Big Shoulders Display",Georgia,serif;font-size:44px;line-height:1;color:#fff}' +
    '.rv-ring .mid span{font-size:11px;color:#c9d2cf}' +
    '.rv-ring.done .mid b{animation:rvPop .6s cubic-bezier(.2,1.6,.4,1)}' +
    '@keyframes rvPop{from{transform:scale(.4);opacity:0}}' +
    '.rv-live{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:10px 0 4px}' +
    '.rv-live div{padding:7px 4px;border-radius:10px;background:rgba(255,255,255,.05);font-size:10.5px;font-weight:700;color:#aab6b2}' +
    '.rv-live b{display:block;font-family:"Oswald",Georgia,serif;font-size:20px;line-height:1.15;color:#fff}' +
    '.rv-list{list-style:none;margin:10px 0 4px;padding:0;text-align:left;display:grid;gap:6px}' +
    '.rv-list li{display:flex;gap:9px;align-items:flex-start;padding:8px 10px;border-radius:10px;background:rgba(160,230,190,.07);border:1px solid rgba(160,230,190,.14);font-size:13px;line-height:1.5;color:#e9efe9}' +
    '.rv-list li i{flex:none;font-style:normal;width:20px;height:20px;border-radius:50%;display:grid;place-items:center;background:#3fbf7f;color:#08140d;font-size:12px;font-weight:900;margin-top:1px}' +
    '.rv-list li.same i{background:#5b6672;color:#fff}' +
    '.rv-btns{display:flex;gap:8px;margin-top:14px}' +
    '.rv-btns button{flex:1;min-height:46px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#f3f1ea;font:inherit;font-weight:800;font-size:15px;cursor:pointer}' +
    '.rv-btns button.go{background:linear-gradient(160deg,#4fd08d,#2e9c63);color:#06150d;border-color:#7fe0ad}' +
    '.rv-btns button:focus-visible{outline:3px solid #9fdcbc;outline-offset:2px}' +
    '.rv-card{box-sizing:border-box;display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 12px;align-items:center;padding:10px 12px;border-radius:12px;background:rgba(80,200,140,.09);border:1px solid rgba(110,210,160,.32);text-align:left;font-size:12.5px;line-height:1.45}' +
    '.rv-card .rv-gen{grid-row:1 / span 2;display:grid;place-items:center;width:52px;height:52px;border-radius:50%;background:radial-gradient(circle at 50% 40%,#3a8f66,#1a3a2b);border:2px solid #7fe0ad;color:#fff;font-weight:900;line-height:1}' +
    '.rv-card .rv-gen small{display:block;font-size:9px;font-weight:700;color:#bff0d5}' +
    '.rv-card .rv-gen b{display:block;font-size:20px;font-family:"Oswald",Georgia,serif}' +
    '.rv-card .rv-t{font-weight:900;font-size:13.5px}' +
    '.rv-card .rv-s{opacity:.82}' +
    '.rv-card .rv-a{grid-column:1 / -1;display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}' +
    '.rv-card .rv-a button{min-height:32px;padding:0 10px;border-radius:8px;border:1px solid currentColor;background:transparent;color:inherit;font:inherit;font-size:11.5px;font-weight:700;opacity:.85;cursor:pointer}' +
    '.rv-hist{text-align:left;margin:8px 0 0;padding:0;list-style:none;display:grid;gap:6px;font-size:12.5px;line-height:1.5}' +
    '.rv-hist li{padding:7px 10px;border-radius:9px;background:rgba(255,255,255,.05)}' +
    '.rv-hist li b{color:#9fdcbc}' +
    '@media (prefers-reduced-motion:reduce){.rv-veil,.rv-ring.done .mid b{animation:none}.rv-ring .fg{transition:none}}';
  function css() {
    if (!doc || doc.getElementById('rv-style')) return;
    var st = doc.createElement('style'); st.id = 'rv-style'; st.textContent = CSS; doc.head.appendChild(st);
  }

  /* ---------------------------------------------------------------- the setup-screen card */
  function cardHTML(R) {
    var last = R.log.length ? R.log[R.log.length - 1] : null;
    var think = (R.cfg.boostMax || 3) > 1 ? '（' + boostLabel(R) + ' ' + boostText(R.boost) + '）' : '';
    return '<div class="rv-card" data-rival="' + esc(R.id) + '"><div class="rv-gen"><small>第</small><b>' + R.gen + '</b><small>世代</small></div>' +
      '<div class="rv-t">' + esc(R.name) + think + '</div>' +
      '<div class="rv-s">' + esc(recordText(R)) + (last ? '' : '。最強と同じ強さから始まり、負けるたびに学習します。') + '</div>' +
      '<div class="rv-a"><button type="button" data-rv="hist">学習の記録</button><button type="button" data-rv="reset">第1世代からやり直す</button></div></div>';
  }
  function bindCard(el, R, onChange) {
    css();
    if (!el) return;
    el.querySelectorAll('[data-rv]').forEach(function (b) {
      b.onclick = function (e) {
        e.preventDefault(); e.stopPropagation();
        if (b.dataset.rv === 'hist') showHistory(R);
        if (b.dataset.rv === 'reset') confirmReset(R, onChange);
      };
    });
  }
  function overlay(html) {
    css();
    var v = doc.createElement('div');
    v.className = 'rv-veil';
    v.innerHTML = '<div class="rv-box" role="dialog" aria-modal="true">' + html + '</div>';
    doc.body.appendChild(v);
    return v;
  }
  function showHistory(R) {
    var items = R.log.slice().reverse().map(function (e) {
      var parts = e.boost[1] > e.boost[0] ? [boostLabel(R) + ' ' + boostText(e.boost[0]) + ' → ' + boostText(e.boost[1])] : [];
      (e.notes || []).forEach(function (t) { parts.push(t); });
      e.changes.forEach(function (c) { parts.push(changeText(R, c)); });
      if (e.score) parts.push('前の世代と練習 ' + e.score.w + '勝' + e.score.l + '敗');
      return '<li><b>第' + e.gen + '世代</b>　' + esc(parts.join('／')) + '</li>';
    }).join('');
    var v = overlay('<h3>' + esc(R.name) + 'の学習の記録</h3><p>' + esc(recordText(R)) + '</p><ul class="rv-hist">' + (items || '<li>まだ一度も負けていません。</li>') + '</ul><div class="rv-btns"><button type="button" class="go">閉じる</button></div>');
    v.querySelector('button').onclick = function () { v.remove(); };
    v.addEventListener('click', function (e) { if (e.target === v) v.remove(); });
  }
  function confirmReset(R, onChange) {
    var v = overlay('<h3>第1世代からやり直しますか？</h3><p>学習した作戦と対戦成績が消え、最強と同じ強さに戻ります。</p><div class="rv-btns"><button type="button" data-k="no">やめる</button><button type="button" data-k="yes" class="go">やり直す</button></div>');
    v.querySelectorAll('button').forEach(function (b) {
      b.onclick = function () { if (b.dataset.k === 'yes') { R.reset(); if (onChange) onChange(); } v.remove(); };
    });
  }

  /* ---------------------------------------------------------------- learning after a loss
     runTune(job, onProgress) → Promise({ params, score:{w,l,d}, games, tried }) — usually a message to the game's
     CPU worker. The overlay can be closed at once; the learning goes on and is saved when it finishes. */
  function learn(R, runTune, opts) {
    opts = opts || {};
    var C = 2 * Math.PI * 54;
    var v = overlay(
      '<svg width="0" height="0" style="position:absolute"><defs><linearGradient id="rvGrad" x1="0" x2="1"><stop offset="0" stop-color="#7fe0ad"/><stop offset="1" stop-color="#f2d27a"/></linearGradient></defs></svg>' +
      '<div class="rv-ring"><svg viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="54"/><circle class="fg" cx="60" cy="60" r="54" stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '"/></svg>' +
      '<div class="mid"><small>第</small><b>' + R.gen + '</b><span>世代</span></div></div>' +
      '<h3>' + esc(R.name) + 'が学習しています</h3>' +
      '<p class="rv-msg">' + esc(opts.msg || '負けた原因を探して、前の自分と練習試合をしています。') + '</p>' +
      (opts.noLive ? '' : '<div class="rv-live"><div>練習試合<b class="rv-g">0</b></div><div>試した作戦<b class="rv-t2">0</b></div><div>採用<b class="rv-a2">0</b></div></div>') +
      '<div class="rv-btns"><button type="button" class="rv-bg">あとで見る</button></div>');
    var ring = v.querySelector('.fg'), closed = false, t0 = Date.now(), timeMs = opts.timeMs || 16000;
    var tick = setInterval(function () { var k = Math.min(0.97, (Date.now() - t0) / timeMs); ring.style.strokeDashoffset = String(C * (1 - k)); }, 200);
    v.querySelector('.rv-bg').onclick = function () { closed = true; v.remove(); };
    var job = { params: clone(R.params), space: clone(R.cfg.space || {}), boost: R.boost, timeMs: timeMs, seed: (Math.random() * 4294967296) >>> 0, seen: clone(R.seen || {}) };
    if (opts.tune) for (var tk in opts.tune) job[tk] = opts.tune[tk];
    var onProgress = function (p) {
      if (closed || opts.noLive) return;
      if (p.games != null) v.querySelector('.rv-g').textContent = p.games;
      if (p.tried != null) v.querySelector('.rv-t2').textContent = p.tried;
      if (p.accepted != null) v.querySelector('.rv-a2').textContent = p.accepted;
    };
    var finish = function (res) {
      clearInterval(tick);
      if (opts.notes && opts.notes.length) { res = res || {}; res.notes = (res.notes || []).concat(opts.notes); }
      var entry = R.grow(res || null);
      if (opts.onDone) opts.onDone(entry);
      if (closed) return entry;
      ring.style.strokeDashoffset = '0';
      v.querySelector('.rv-ring').classList.add('done');
      v.querySelector('.mid b').textContent = R.gen;
      v.querySelector('h3').textContent = '第' + R.gen + '世代に成長しました';
      v.querySelector('.rv-msg').textContent = 'つぎの対戦から、この強さで相手をします。';
      var items = [];
      if (entry.boost[1] > entry.boost[0]) items.push('<li><i>↑</i><span>' + esc(R.cfg.boostUp || '考える量をふやしました') + '（' + boostLabel(R) + ' ' + boostText(entry.boost[0]) + ' → ' + boostText(entry.boost[1]) + '）</span></li>');
      (entry.notes || []).forEach(function (t) { items.push('<li><i>✓</i><span>' + esc(t) + '</span></li>'); });
      entry.changes.forEach(function (c) { items.push('<li><i>✓</i><span>' + esc(changeText(R, c)) + '</span></li>'); });
      if (!entry.changes.length && entry.tried) items.push('<li class="same"><i>＝</i><span>試した作戦（' + entry.tried + '案）は今の作戦に勝てなかったので、作戦はそのまま</span></li>');
      if (entry.score && entry.changes.length) items.push('<li><i>★</i><span>前の世代との練習試合　' + entry.score.w + '勝' + entry.score.l + '敗' + (entry.score.d ? entry.score.d + '分' : '') + '</span></li>');
      var live = v.querySelector('.rv-live'); if (live) live.remove();
      var btns = v.querySelector('.rv-btns');
      btns.insertAdjacentHTML('beforebegin', '<ul class="rv-list">' + items.join('') + '</ul>');
      btns.innerHTML = '<button type="button" class="go">つぎの対戦へ</button>';
      btns.querySelector('button').onclick = function () { v.remove(); };
      return entry;
    };
    var p;
    try { p = Promise.resolve(runTune(job, onProgress)); } catch (e) { p = Promise.resolve(null); }
    return p.then(finish, function () { return finish(null); });
  }

  /* a runTune for learn(): a fresh worker from the game's CPU worker script, so the CPU of the next game is never
     kept waiting. The worker answers { k: 'tune', job } with { k: 'progress', p } messages and { k: 'tuned', res }. */
  function workerTune(url, extra) {
    return function (job, onProgress) {
      return new Promise(function (resolve) {
        var w, done = false;
        var finish = function (res) { if (done) return; done = true; try { w.terminate(); } catch (e) { /* gone */ } resolve(res); };
        try { w = new Worker(url); } catch (e) { resolve(null); return; }
        w.onmessage = function (e) {
          var m = e.data || {};
          if (m.k === 'progress' && onProgress) onProgress(m.p || {});
          if (m.k === 'tuned') finish(m.res || null);
        };
        w.onerror = function () { finish(null); };
        var msg = { k: 'tune', job: job };
        if (extra) for (var key in extra) msg[key] = extra[key];
        w.postMessage(msg);
        setTimeout(function () { finish(null); }, (job.timeMs || 15000) + 20000);
      });
    };
  }

  root.PLAYROOM_RIVAL = { open: open, learn: learn, cardHTML: cardHTML, bindCard: bindCard, showHistory: showHistory, recordText: recordText, boostText: boostText, workerTune: workerTune };
})(typeof window !== 'undefined' ? window : this);
