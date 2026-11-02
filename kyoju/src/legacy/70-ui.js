/* ---------- 画面 ---------- */
const UI = (() => {
  const S = () => Store.state;
  const $ = (q, r = document) => r.querySelector(q);
  const $$ = (q, r = document) => Array.from(r.querySelectorAll(q));
  let tab = 'home';
  let forgeMode = 'swap', forgeSel = null;
  let buildSel = {};
  const ko = { a: null, b: null, src: 'own', lethal: false };
  let worldOpen = null;
  let stageOpen = false;
  const anims = new Set();
  const TEAR = '<svg class="tear" viewBox="0 0 11 15" aria-hidden="true"><path d="M5.5 .6C4.1 3.6.6 6.8.6 9.7c0 2.8 2.2 4.8 4.9 4.8s4.9-2 4.9-4.8C10.4 6.8 6.9 3.6 5.5.6Z" fill="#1b0c12" stroke="#bb9352" stroke-width="1.1"/><path d="M3.3 9.9c.1 1.3.8 2.2 1.9 2.6" stroke="#bb9352" stroke-opacity=".6" fill="none"/></svg>';
  const cost = (n) => `<span class="cost">${TEAR}<span class="num">${fmt(n)}</span></span>`;

  /* ---------- 共通 ---------- */
  function findOwn(id) { return S().beasts.find((b) => b.id === id); }
  function findAny(id) { const s = S(); return s.beasts.find((b) => b.id === id) || s.shop.beasts.find((b) => b.id === id) || s.wild.find((b) => b.id === id); }
  function findPart(id) {
    const s = S();
    const direct = s.parts.find((p) => p.id === id) || s.shop.parts.find((p) => p.id === id);
    if (direct) return direct;
    for (const b of s.beasts.concat(s.shop.beasts, s.wild)) for (const sl of SLOTS) if (b.parts[sl].id === id) return b.parts[sl];
    return null;
  }
  function save() { Store.save(); updatePurse(); }
  function updatePurse() { const el = $('#kokurui'); if (el) el.textContent = fmt(S().kokurui); }
  let toastT = null;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2200);
  }
  function snd(n, o) { if (S().settings.sound) Sound.play(n, o); }
  function music(mode, intensity) { if (S().settings.sound) Sound.music(mode, intensity); }
  /* 実績チェック：満たしたものを保存し、toastで知らせる */
  function checkAchv() {
    const s = S();
    const news = newAchievements(s);
    if (!news.length) return;
    s.achv.push(...news);
    Store.save();
    news.forEach((id, i) => setTimeout(() => toast(`実績「${ACHV[id].name}」を達成した`), 500 + i * 900));
    snd('level');
  }
  function elemChip(st) { return `<span class="chip el-${st.elem}">${ELEM[st.elem].name}・${esc(st.special)}</span>`; }
  function stats5(st) {
    return `<div class="stats5"><div><span>体力</span><b>${fmt(st.hp)}</b></div><div><span>攻撃</span><b>${fmt(st.atk)}</b></div><div><span>防御</span><b>${fmt(st.def)}</b></div><div><span>魔力</span><b>${fmt(st.pow)}</b></div><div><span>速度</span><b>${st.spd.toFixed(1)}</b></div></div>`;
  }
  function beastCard(b, opts = {}) {
    const st = beastStats(b);
    return `<button class="card" data-act="${opts.act || 'beast'}" data-id="${b.id}">
      <canvas class="pt" data-b="${b.id}" role="img" aria-label="${esc(b.name)}の姿"></canvas>
      ${opts.corner || ''}
      <div class="body">
        <div class="row"><span class="name">${esc(b.name)}</span></div>
        <div class="row"><span class="lv">Lv.${b.level}</span>${elemChip(st)}<span class="power">戦力 <b class="num">${fmt(powerOf(st))}</b></span></div>
        ${stats5(st)}
        ${b.traits.length ? `<div class="row">${b.traits.map((t) => `<span class="chip trait">${TRAITS[t].name}</span>`).join('')}</div>` : ''}
        ${opts.extra || ''}
      </div></button>`;
  }
  function partLabel(p) { return `${esc(partName(p))}${p.plus ? ` <span class="plus">+${p.plus}</span>` : ''}`; }
  function partStatText(p) {
    const s = partStats(p), names = { hp: '体力', atk: '攻撃', def: '防御', pow: '魔力', spd: '速度', reg: '再生' };
    return Object.keys(s).map((k) => `${names[k]} ${k === 'spd' ? (s[k] >= 0 ? '+' : '') + s[k].toFixed(1) : '+' + Math.round(s[k] * (k === 'hp' ? 1.5 : 1))}`).join('・');
  }
  function pose(i) { const A = BeastArt.anim(); A.t = 1.1 + (i || 0) * 0.7; return A; }
  function paint(root) {
    $$('canvas[data-b]', root).forEach((c, i) => { const b = findAny(c.dataset.b); if (b) BeastArt.portrait(c, BeastArt.visOf(b), { A: pose(i) }); });
    $$('canvas[data-p]', root).forEach((c) => { const p = findPart(c.dataset.p); if (p) partPortrait(c, p); });
    $$('canvas[data-w]', root).forEach((c) => worldBanner(c, WORLDS.find((w) => w.id === c.dataset.w)));
  }
  function partPortrait(c, p) {
    const parts = {};
    for (const s of SLOTS) parts[s] = { sp: p.sp, slot: s, id: 'ghost-' + s };
    parts[p.slot] = p;
    BeastArt.portrait(c, BeastArt.visOfParts(parts, { ghost: p.slot }), { A: pose(0), fitW: 0.9, fitH: 0.82 });
  }
  function worldBanner(c, w) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round((c.clientWidth || 340) * dpr), H = Math.round((c.clientHeight || 145) * dpr);
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const sky = CityArt.SKY[w.kind];
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, sky[0]); gr.addColorStop(0.6, sky[1]); gr.addColorStop(1, sky[2]);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const far = CityArt.strip(w.kind, 0, W, Math.round(H * 0.62), hashStr(w.id));
    const near = CityArt.strip(w.kind, 1, W, Math.round(H * 0.48), hashStr(w.id) + 3);
    if (w.kind === 'medieval') {
      const mx = W * 0.8, my = H * 0.26, mr = H * 0.1;
      const mg = g.createRadialGradient(mx, my, 0, mx, my, mr * 4);
      mg.addColorStop(0, 'rgba(220,225,255,0.35)'); mg.addColorStop(1, 'rgba(220,225,255,0)');
      g.fillStyle = mg; g.fillRect(0, 0, W, H);
      g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fillStyle = '#e4e1d6'; g.fill();
    }
    g.drawImage(far, 0, H - far.height - H * 0.1);
    g.drawImage(near, 0, H - near.height);
    const fallen = w.regions.filter((r) => S().prog[r.id] && S().prog[r.id].fallen).length;
    if (fallen) {
      const fg = g.createLinearGradient(0, H * 0.3, 0, H);
      fg.addColorStop(0, 'rgba(255,90,30,0)'); fg.addColorStop(1, `rgba(255,90,30,${0.12 * fallen})`);
      g.fillStyle = fg; g.fillRect(0, 0, W, H);
    }
    const sh = g.createLinearGradient(0, 0, 0, H);
    sh.addColorStop(0.6, 'rgba(25,18,26,0)'); sh.addColorStop(1, 'rgba(25,18,26,0.85)');
    g.fillStyle = sh; g.fillRect(0, 0, W, H);
  }
  let loopOn = false, lastT = 0;
  function animate(canvas, getV, opts = {}) { anims.add({ canvas, getV, A: BeastArt.anim(), opts, next: 3 + Math.random() * 2 }); if (!loopOn) { loopOn = true; lastT = performance.now(); requestAnimationFrame(animLoop); } }
  function animLoop(now) {
    if (stageOpen || document.hidden) { lastT = now; requestAnimationFrame(animLoop); return; }
    if (now - lastT < 1000 / 30) { requestAnimationFrame(animLoop); return; }
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    for (const a of anims) {
      if (!a.canvas.isConnected) { anims.delete(a); continue; }
      a.A.t += dt;
      a.next -= dt;
      if (a.next < 0) { a.roar = 1.4; a.next = 5 + Math.random() * 3; }
      if (a.roar > 0) a.roar -= dt;
      const r = a.roar > 0 ? Math.sin(Math.min(1, (1.4 - a.roar) / 1.4) * Math.PI) : 0;
      a.A.mouth = r; a.A.charge = r * 0.8; a.A.roar = r * 0.6;
      const c = a.canvas, dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
      if (w < 2 || h < 2) continue;
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      BeastArt.portraitDraw(c.getContext('2d'), w, h, a.getV(), a.A, a.opts);
    }
    if (anims.size) requestAnimationFrame(animLoop); else loopOn = false;
  }

  /* ---------- シート ---------- */
  function closeSheet() { const b = $('.sheet-back'); if (b) b.remove(); }
  function sheet(title, body, opts = {}) {
    closeSheet();
    const back = document.createElement('div');
    back.className = 'sheet-back';
    back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sheet-head"><h2>${esc(title)}</h2>${opts.noClose ? '' : '<button class="close" aria-label="閉じる">×</button>'}</div>${body}</div>`;
    if (!opts.noClose) {
      back.addEventListener('click', (e) => { if (e.target === back) closeSheet(); });
      $('.close', back).addEventListener('click', closeSheet);
    }
    document.body.appendChild(back);
    paint(back);
    return $('.sheet', back);
  }
  function confirmSheet(title, body, okLabel, onOk, danger) {
    const sh = sheet(title, `${body}<div class="btn-row"><button class="btn ghost" data-x="no">やめる</button><button class="btn ${danger ? 'primary' : 'primary'}" data-x="ok">${okLabel}</button></div>`);
    $('[data-x="no"]', sh).onclick = closeSheet;
    $('[data-x="ok"]', sh).onclick = () => { closeSheet(); onOk(); };
  }

  /* ---------- 魔神殿 ---------- */
  function homeHTML() {
    const s = S();
    const fallen = fallenCount(s), worlds = WORLDS.filter((w) => !w.sealed && worldFallen(s, w)).length;
    const poor = !s.beasts.length && s.kokurui < 320;
    return `<section class="screen">
      <div class="page-head"><span class="eyebrow">第${s.cycle + 1}の巡り</span><h1>魔神殿</h1>
        <p>配下の巨獣を育て、人間界へ放て。街が壊れるほど、人々の絶望は黒涙となって玉座に滴る。</p></div>
      <div class="ledger"><div><b class="num">${fallen}<small class="muted">/${regionTotal()}</small></b><span>陥落させた街</span></div><div><b class="num">${worlds}<small class="muted">/${WORLDS.filter((w) => !w.sealed).length}</small></b><span>滅ぼした人間界</span></div><div><b class="num">${fmt(s.stats.earned)}</b><span>集めた黒涙</span></div></div>
      <div class="sec-wrap"><h2 class="sec">配下の巨獣 <small>${s.beasts.length} / 12 体</small></h2>
        ${s.beasts.length ? `<div class="cards two">${s.beasts.map((b) => beastCard(b)).join('')}</div>` : `<div class="empty-note">配下の巨獣がいない。冥府の市で購うか、部位の蔵から組み上げよう。</div>`}
        ${poor ? `<button class="btn primary" data-act="mercy">魔界の野良巨獣を従える（無償）</button>` : ''}
      </div>
      <div class="sec-wrap"><h2 class="sec">部位の蔵 <small>${s.parts.length} 個</small></h2>
        <p class="muted small">巨獣を解体すると部位がここに入る。改造で付け替えたり、新しい巨獣を組み上げたりできる。</p>
        <div class="btn-row"><button class="btn" data-act="parts">部位の蔵を開く</button><button class="btn" data-act="records">記録（図鑑・実績）</button></div></div>
    </section>`;
  }
  function openBeast(id) {
    const b = findOwn(id);
    if (!b) return;
    const st = beastStats(b);
    const need = xpNeed(b.level);
    const ref = { hp: 20000, atk: 700, def: 360, pow: 800, spd: 14, reg: 40 };
    const bar = (k, label, v, txt) => `<span>${label}</span><div class="bar"><i style="width:${Math.round(clamp(Math.log(1 + v) / Math.log(1 + ref[k]), 0.03, 1) * 100)}%"></i></div><b>${txt}</b>`;
    const body = `<canvas class="stage-big" id="detailCv" role="img" aria-label="${esc(b.name)}の姿"></canvas>
      <div class="row" style="display:flex;gap:10px;align-items:center"><span class="lv">Lv.${b.level}</span><div class="xpbar" style="flex:1"><i style="width:${Math.round((b.xp / need) * 100)}%"></i></div><span class="small muted num">${fmt(b.xp)} / ${fmt(need)}</span></div>
      <div class="statgrid">
        ${bar('hp', '体力', st.hp, fmt(st.hp))}${bar('atk', '攻撃', st.atk, fmt(st.atk))}${bar('def', '防御', st.def, fmt(st.def))}
        ${bar('pow', '魔力', st.pow, fmt(st.pow))}${bar('spd', '速度', st.spd, st.spd.toFixed(1))}${bar('reg', '再生', st.reg, st.reg.toFixed(1) + '/秒')}
      </div>
      <dl class="kv">
        <dt>全高</dt><dd class="num">${Math.round(st.height)} m　<span class="muted small">戦力 ${fmt(powerOf(st))}</span></dd>
        <dt>必殺</dt><dd>${elemChip(st)}<br><span class="small muted">${FORMS[st.form].desc}</span></dd>
        <dt>背</dt><dd>${ABIL[st.abil].name}<span class="small muted">　${ABIL[st.abil].desc}</span></dd>
        <dt>脚</dt><dd>${ARCH.legs[st.legs].noun}<span class="small muted">　${ARCH.legs[st.legs].note}</span></dd>
        ${ARCH.arms[st.arms].note ? `<dt>腕</dt><dd>${ARCH.arms[st.arms].noun}<span class="small muted">　${ARCH.arms[st.arms].note}</span></dd>` : ''}
        ${ARCH.tail[st.tail].note ? `<dt>尾</dt><dd>${ARCH.tail[st.tail].noun}<span class="small muted">　${ARCH.tail[st.tail].note}</span></dd>` : ''}
        <dt>変異</dt><dd>${b.traits.length ? b.traits.map((t) => `<span class="chip trait">${TRAITS[t].name}</span> <span class="small muted">${TRAITS[t].desc}</span>`).join('<br>') : '<span class="muted small">まだない（Lv.10ごと、または殺し合いで得る）</span>'}</dd>
      </dl>
      <div class="list">${SLOTS.map((s) => `<div class="item"><canvas data-p="${b.parts[s].id}" role="img" aria-label="${esc(partName(b.parts[s]))}"></canvas><div class="t"><b>${SLOT_JA[s]}　${partLabel(b.parts[s])}</b><small>${esc(partSub(b.parts[s]))}</small></div></div>`).join('')}</div>
      <p class="small muted">戦歴：侵攻 ${b.raids} 回・蠱毒の勝利 ${b.wins} 回・喰らった巨獣 ${b.kills} 体</p>
      <div class="btn-row"><button class="btn primary" data-x="invade">侵攻に出す</button><button class="btn" data-x="forge">改造する</button><button class="btn" data-x="kodoku">蠱毒へ</button></div>
      <div class="btn-row"><button class="btn ghost small" data-x="rename">名を変える</button><button class="btn ghost small" data-x="dismantle">解体する</button></div>`;
    const sh = sheet(b.name, body);
    animate($('#detailCv', sh), () => BeastArt.visOf(b));
    sh.addEventListener('click', (e) => {
      const x = e.target.closest('[data-x]'); if (!x) return;
      const k = x.dataset.x;
      if (k === 'invade') { closeSheet(); setTab('invade'); toast('侵攻する街を選ぶ'); }
      if (k === 'forge') { closeSheet(); forgeMode = 'swap'; forgeSel = b.id; setTab('forge'); }
      if (k === 'kodoku') { closeSheet(); ko.a = b.id; if (ko.b === b.id) ko.b = null; setTab('kodoku'); }
      if (k === 'dismantle') openDismantle(b.id);
      if (k === 'rename') openRename(b.id);
    });
  }
  function openRename(id) {
    const b = findOwn(id);
    const sh = sheet('名を変える', `<label class="small muted" for="nameIn">新しい名（12文字まで）</label><input class="name-in" id="nameIn" maxlength="12" value="${esc(b.name)}"><div class="btn-row"><button class="btn ghost" data-x="auto">部位から名付ける</button><button class="btn primary" data-x="ok">決める</button></div>`);
    const inp = $('#nameIn', sh);
    $('[data-x="auto"]', sh).onclick = () => { inp.value = beastNameFor(b.parts); };
    $('[data-x="ok"]', sh).onclick = () => {
      const v = inp.value.trim().slice(0, 12);
      if (!v) { toast('名を入れてください'); return; }
      b.name = v; b.custom = v !== beastNameFor(b.parts);
      save(); closeSheet(); render(); toast('名を「' + v + '」に改めた');
    };
  }
  function openParts(filter) {
    const s = S();
    const f = filter || 'all';
    const list = s.parts.filter((p) => f === 'all' || p.slot === f).sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) || partTier(b) - partTier(a) || (b.plus || 0) - (a.plus || 0));
    const chips = `<div class="seg" role="group" aria-label="部位で絞り込む">${['all', ...SLOTS].map((k) => `<button data-f="${k}" aria-pressed="${k === f}">${k === 'all' ? '全て' : SLOT_JA[k]}</button>`).join('')}</div>`;
    const rows = list.length ? `<div class="list">${list.map((p) => `<div class="item"><canvas data-p="${p.id}" role="img" aria-label="${esc(partName(p))}"></canvas><div class="t"><b>${partLabel(p)} <span class="muted small">${TIER_STAR[partTier(p)]}</span></b><small>${esc(partSub(p))}</small><small>${partStatText(p)}</small></div><button class="btn small" data-sell="${p.id}">売る ${cost(sellPrice(p))}</button></div>`).join('')}</div>` : `<div class="empty-note">この蔵は空だ。</div>`;
    const sh = sheet('部位の蔵', `<p class="small muted">部位は改造で使う。要らない部位は黒涙に換えられる。</p>${chips}${rows}`);
    sh.addEventListener('click', (e) => {
      const fb = e.target.closest('[data-f]'); if (fb) { openParts(fb.dataset.f); return; }
      const sb = e.target.closest('[data-sell]');
      if (sb) {
        const i = s.parts.findIndex((p) => p.id === sb.dataset.sell); if (i < 0) return;
        const p = s.parts[i]; s.parts.splice(i, 1); s.kokurui += sellPrice(p); save(); snd('buy');
        toast(partName(p) + 'を売った（＋' + sellPrice(p) + '）');
        openParts(f); render();
      }
    });
  }

  /* ---------- 改造 ---------- */
  function forgeHTML() {
    const s = S();
    const seg = `<div class="seg" role="group" aria-label="改造の種類">${[['swap', '換装'], ['build', '組成'], ['split', '解体']].map(([k, l]) => `<button data-act="fmode" data-m="${k}" aria-pressed="${forgeMode === k}">${l}</button>`).join('')}</div>`;
    let inner = '';
    if (forgeMode === 'swap') {
      if (!s.beasts.length) inner = `<div class="empty-note">換装できる巨獣がいない。</div>`;
      else {
        if (!forgeSel || !findOwn(forgeSel)) forgeSel = s.beasts[0].id;
        const b = findOwn(forgeSel), st = beastStats(b);
        inner = `<div class="picker" role="group" aria-label="巨獣を選ぶ">${s.beasts.map((x) => `<button class="pick" data-act="fpick" data-id="${x.id}" aria-pressed="${x.id === forgeSel}"><canvas data-b="${x.id}" role="img" aria-label="${esc(x.name)}"></canvas><span>${esc(x.name)}<small>Lv.${x.level}</small></span></button>`).join('')}</div>
          <canvas class="stage-big" id="forgeCv" role="img" aria-label="${esc(b.name)}の姿"></canvas>
          <div class="row" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="name" style="font-family:var(--f-display);font-weight:800;font-size:18px">${esc(b.name)}</span><span class="lv">Lv.${b.level}</span>${elemChip(st)}</div>
          ${stats5(st)}
          <div class="slots">${SLOTS.map((sl) => { const p = b.parts[sl]; const n = s.parts.filter((q) => q.slot === sl).length; return `<button class="slot" data-act="slot" data-slot="${sl}"><span class="k">${SLOT_JA[sl]}</span><span class="t"><b>${partLabel(p)}</b><small>${esc(partSub(p))}・候補 ${n}</small></span></button>`; }).join('')}</div>
          <p class="small muted">部位を選ぶと、蔵にある同じ部位の候補が出る。外した部位は蔵に戻る。</p>`;
      }
    } else if (forgeMode === 'build') {
      const picked = SLOTS.filter((sl) => buildSel[sl] && s.parts.find((p) => p.id === buildSel[sl]));
      const all = picked.length === 6;
      const ok = all && s.kokurui >= PRICE.assemble && s.beasts.length < 12;
      const name = all ? beastNameFor(Object.fromEntries(SLOTS.map((sl) => [sl, s.parts.find((p) => p.id === buildSel[sl])]))) : '';
      inner = `<p class="muted small">蔵の部位を六つ選び、魂の器に収めて新しい巨獣を生む。代価は ${PRICE.assemble} 黒涙。</p>
        <canvas class="stage-big" id="buildCv" role="img" aria-label="組み上げる巨獣の姿"></canvas>
        <div class="slots">${SLOTS.map((sl) => { const p = buildSel[sl] && s.parts.find((q) => q.id === buildSel[sl]); const n = s.parts.filter((q) => q.slot === sl).length; return `<button class="slot ${p ? '' : 'empty'}" data-act="bslot" data-slot="${sl}"><span class="k">${SLOT_JA[sl]}</span><span class="t"><b>${p ? partLabel(p) : '未選択'}</b><small>${p ? esc(partSub(p)) : `蔵に ${n} 個`}</small></span></button>`; }).join('')}</div>
        ${all ? `<p style="margin:0">生まれる巨獣：<b style="font-family:var(--f-display);font-size:17px">${esc(name)}</b></p>` : ''}
        <button class="btn primary wide" data-act="build" ${ok ? '' : 'disabled'}>組み上げる ${cost(PRICE.assemble)}</button>
        ${s.beasts.length >= 12 ? '<p class="small muted">配下は12体までだ。</p>' : ''}`;
    } else {
      inner = `<p class="muted small">巨獣を解体すると、六つの部位が蔵に戻る。育てた巨獣の部位ほど強化（+）される。解体した巨獣は戻らない。</p>
        ${s.beasts.length ? `<div class="list">${s.beasts.map((b) => `<div class="item"><canvas data-b="${b.id}" role="img" aria-label="${esc(b.name)}"></canvas><div class="t"><b>${esc(b.name)}</b><small>Lv.${b.level}・部位 +${Math.floor(b.level / 5)}・返る黒涙 ${fmt(dismantleRefund(b))}</small></div><button class="btn small" data-act="split" data-id="${b.id}">解体</button></div>`).join('')}</div>` : `<div class="empty-note">解体できる巨獣がいない。</div>`}`;
    }
    return `<section class="screen"><div class="page-head"><span class="eyebrow">巨獣を造り替える</span><h1>改造</h1><p>他の巨獣を解体して得た部位を組み合わせる。人間界の弱点に合わせて頭（必殺の属性）を付け替えるのが近道だ。</p></div>${seg}${inner}</section>`;
  }
  function dismantleRefund(b) { return 20 + b.level * 15; }
  function openDismantle(id) {
    const b = findOwn(id);
    if (!b) return;
    const up = Math.floor(b.level / 5);
    const rows = SLOTS.map((sl) => { const p = b.parts[sl]; return `<div class="item"><canvas data-p="${p.id}" role="img" aria-label="${esc(partName(p))}"></canvas><div class="t"><b>${esc(partName(p))} <span class="plus">+${Math.min(9, (p.plus || 0) + up)}</span></b><small>${esc(partSub(p))}</small></div></div>`; }).join('');
    confirmSheet(b.name + 'を解体する', `<p class="small muted">この巨獣は消え、次の部位と ${fmt(dismantleRefund(b))} 黒涙が残る。</p><div class="list">${rows}</div>`, '解体する', () => {
      const s = S();
      s.beasts = s.beasts.filter((x) => x.id !== b.id);
      for (const sl of SLOTS) { const p = b.parts[sl]; p.plus = Math.min(9, (p.plus || 0) + up); p.id = uid(); s.parts.push(p); }
      s.kokurui += dismantleRefund(b);
      if (forgeSel === b.id) forgeSel = null;
      if (ko.a === b.id) ko.a = null; if (ko.b === b.id) ko.b = null;
      save(); snd('collapse', { size: 40 }); toast(b.name + 'を解体した。部位は蔵へ');
      render();
    }, true);
  }
  function diffHTML(a, b) {
    const ks = [['hp', '体力'], ['atk', '攻撃'], ['def', '防御'], ['pow', '魔力'], ['spd', '速度']];
    return `<span class="diff">${ks.map(([k, l]) => { const d = b[k] - a[k]; if (Math.abs(d) < 0.05) return ''; const v = k === 'spd' ? d.toFixed(1) : Math.round(d); return `<span class="${d > 0 ? 'up' : 'down'}">${l} ${d > 0 ? '+' : ''}${v}</span>`; }).join('')}${a.elem !== b.elem || a.form !== b.form ? `<span class="up">必殺：${esc(b.special)}</span>` : ''}</span>`;
  }
  function openSlot(slot) {
    const s = S(), b = findOwn(forgeSel);
    if (!b) return;
    const base = beastStats(b);
    const cands = s.parts.filter((p) => p.slot === slot);
    let prev = null;
    const rows = cands.length ? `<div class="list">${cands.map((p) => { const ns = beastStats(Object.assign({}, b, { parts: Object.assign({}, b.parts, { [slot]: p }) })); return `<div class="item" data-prev="${p.id}"><canvas data-p="${p.id}" role="img" aria-label="${esc(partName(p))}"></canvas><div class="t"><b>${partLabel(p)} <span class="muted small">${TIER_STAR[partTier(p)]}</span></b><small>${esc(partSub(p))}</small>${diffHTML(base, ns)}</div><button class="btn small primary" data-swap="${p.id}">換装</button></div>`; }).join('')}</div>` : `<div class="empty-note">蔵に${SLOT_JA[slot]}の部位がない。巨獣を解体するか、冥府の市で買おう。</div>`;
    const sh = sheet(`${SLOT_JA[slot]}を付け替える`, `<canvas class="stage-big" id="swapCv" role="img" aria-label="換装後の姿"></canvas><p class="small muted">候補に触れると換装後の姿を見られる。いまの部位：${partLabel(b.parts[slot])}</p>${rows}`);
    animate($('#swapCv', sh), () => BeastArt.visOf(b, prev ? { override: Object.assign({}, b.parts, { [slot]: prev }) } : {}));
    sh.addEventListener('click', (e) => {
      const sw = e.target.closest('[data-swap]');
      if (sw) {
        const i = s.parts.findIndex((p) => p.id === sw.dataset.swap); if (i < 0) return;
        const np = s.parts[i], old = b.parts[slot];
        const auto = !b.custom;
        s.parts.splice(i, 1); s.parts.push(old); b.parts[slot] = np;
        if (auto) b.name = beastNameFor(b.parts);
        save(); snd('forge'); closeSheet(); render(); toast(partName(np) + 'を換装した');
        return;
      }
      const it = e.target.closest('[data-prev]');
      if (it) { prev = s.parts.find((p) => p.id === it.dataset.prev) || null; $$('[data-prev]', sh).forEach((r) => r.style.background = r === it ? 'rgba(140,31,29,0.18)' : ''); }
    });
  }
  function openBuildSlot(slot) {
    const s = S();
    const cands = s.parts.filter((p) => p.slot === slot);
    const rows = cands.length ? `<div class="list">${cands.map((p) => `<div class="item"><canvas data-p="${p.id}" role="img" aria-label="${esc(partName(p))}"></canvas><div class="t"><b>${partLabel(p)} <span class="muted small">${TIER_STAR[partTier(p)]}</span></b><small>${esc(partSub(p))}</small><small>${partStatText(p)}</small></div><button class="btn small ${buildSel[slot] === p.id ? '' : 'primary'}" data-pick="${p.id}">${buildSel[slot] === p.id ? '選択中' : '選ぶ'}</button></div>`).join('')}</div>` : `<div class="empty-note">蔵に${SLOT_JA[slot]}の部位がない。</div>`;
    const sh = sheet(`${SLOT_JA[slot]}を選ぶ`, rows);
    sh.addEventListener('click', (e) => { const pk = e.target.closest('[data-pick]'); if (pk) { buildSel[slot] = pk.dataset.pick; closeSheet(); render(); } });
  }
  function buildVis() {
    const s = S();
    const picked = SLOTS.map((sl) => buildSel[sl] && s.parts.find((p) => p.id === buildSel[sl])).filter(Boolean);
    const sp = picked.length ? picked[0].sp : 'varga';
    const parts = {};
    let ghost = false;
    for (const sl of SLOTS) {
      const p = buildSel[sl] && s.parts.find((q) => q.id === buildSel[sl]);
      if (p) parts[sl] = p; else { parts[sl] = { sp, slot: sl, id: 'g' + sl }; ghost = true; }
    }
    const V = BeastArt.visOfParts(parts);
    if (ghost) for (const sl of SLOTS) if (!(buildSel[sl] && s.parts.find((q) => q.id === buildSel[sl]))) V.P[sl].pal = BeastArt.visOfParts(parts, { ghost: '__' }).P[sl].pal;
    return V;
  }

  /* ---------- 蠱毒 ---------- */
  function kodokuHTML() {
    const s = S();
    if (ko.a && !findOwn(ko.a)) ko.a = null;
    if (!ko.a && s.beasts[0]) ko.a = s.beasts[0].id;
    const opp = ko.src === 'own' ? s.beasts.filter((b) => b.id !== ko.a) : s.wild;
    if (ko.b && !opp.find((b) => b.id === ko.b)) ko.b = null;
    const a = ko.a && findOwn(ko.a), b = ko.b && opp.find((x) => x.id === ko.b);
    const seg = `<div class="seg" role="group" aria-label="戦わせ方"><button data-act="kmode" data-v="0" aria-pressed="${!ko.lethal}">調練（死なない）</button><button data-act="kmode" data-v="1" aria-pressed="${ko.lethal}">殺し合い（喰らう）</button></div>`;
    const wild = ko.src === 'wild';
    const note = wild ? '野良巨獣との戦いは常に命懸けだ。勝てば喰らって力を奪い、負けても配下は逃げ帰る。'
      : ko.lethal ? '勝った巨獣は敗れた巨獣を喰らい、能力の一部と変異を奪う。敗れた巨獣は死ぬ。'
        : '体力が二割を切った方が負け。どちらも死なず、勝者は多くの経験を得る。';
    let vs = '';
    if (a && b) {
      const pa = powerOf(beastStats(a)), pb = powerOf(beastStats(b));
      const xpW = fightXp(b.level, ko.lethal || wild);
      vs = `<div class="cards two">${beastCard(a, { act: 'none', corner: '<span class="chip plain tag-corner" style="background:rgba(0,0,0,.5)">挑戦者</span>' })}${beastCard(b, { act: 'none', corner: `<span class="chip plain tag-corner" style="background:rgba(0,0,0,.5)">${wild ? '野良巨獣' : '相手'}</span>` })}</div>
        <p class="small muted" style="margin:0">戦力 ${fmt(pa)} 対 ${fmt(pb)}。挑戦者が勝てば経験 ${fmt(xpW)}${ko.lethal || wild ? '・相手の力を喰らう' : ''}。</p>`;
    }
    return `<section class="screen"><div class="page-head"><span class="eyebrow">壺の底の殺し合い</span><h1>蠱毒</h1><p>巨獣同士を戦わせて鍛える。殺し合わせれば、より強くなる。</p></div>
      ${s.beasts.length ? `
      ${wild ? '' : seg}
      <p class="small muted" style="margin:0">${note}</p>
      <div class="sec-wrap"><h2 class="sec">挑戦者 <small>配下から選ぶ</small></h2>
        <div class="picker" role="group" aria-label="挑戦者">${s.beasts.map((x) => `<button class="pick" data-act="ka" data-id="${x.id}" aria-pressed="${x.id === ko.a}"><canvas data-b="${x.id}" role="img" aria-label="${esc(x.name)}"></canvas><span>${esc(x.name)}<small>Lv.${x.level}・戦力 ${fmt(powerOf(beastStats(x)))}</small></span></button>`).join('')}</div></div>
      <div class="sec-wrap"><h2 class="sec">相手</h2>
        <div class="seg" role="group" aria-label="相手の種類"><button data-act="ksrc" data-v="own" aria-pressed="${!wild}">配下の巨獣</button><button data-act="ksrc" data-v="wild" aria-pressed="${wild}">魔界の野良巨獣</button></div>
        ${opp.length ? `<div class="picker" role="group" aria-label="相手">${opp.map((x) => `<button class="pick" data-act="kb" data-id="${x.id}" aria-pressed="${x.id === ko.b}"><canvas data-b="${x.id}" role="img" aria-label="${esc(x.name)}"></canvas><span>${esc(x.name)}<small>Lv.${x.level}・戦力 ${fmt(powerOf(beastStats(x)))}</small></span></button>`).join('')}</div>` : `<div class="empty-note">${wild ? '野良巨獣は侵攻のあとにまた現れる。' : '戦わせる相手がいない。巨獣を増やそう。'}</div>`}
      </div>
      ${vs}
      <button class="btn primary wide" data-act="kgo" ${a && b ? '' : 'disabled'}>戦わせる</button>` : `<div class="empty-note">戦わせる巨獣がいない。</div>`}
    </section>`;
  }

  /* ---------- 冥府の市 ---------- */
  function marketHTML() {
    const s = S();
    const mt = maxTier(s);
    return `<section class="screen"><div class="page-head"><span class="eyebrow">黒涙で購う</span><h1>冥府の市</h1><p>人々の絶望から結ばれた黒涙で、巨獣や部位を買う。品は侵攻のたびに入れ替わり、街を落とすほど強い種が並ぶ。</p></div>
      <p class="small muted" style="margin:0">いま並ぶ種：${TIER_STAR[mt]} まで${mt < 4 ? `（あと ${[0, 1, 3, 5][mt] - fallenCount(s) - s.cycle * 12} 街の陥落で次の格）` : ''}</p>
      <div class="sec-wrap"><h2 class="sec">巨獣</h2>
        ${s.shop.beasts.length ? `<div class="cards two">${s.shop.beasts.map((b) => beastCard(b, { act: 'none', extra: `<button class="btn primary small" data-act="buyb" data-id="${b.id}" ${s.kokurui >= b.price && s.beasts.length < 12 ? '' : 'disabled'}>購う ${cost(b.price)}</button><span class="small muted">${TIER_STAR[SPECIES[b.parts.head.sp].tier]}　${esc(SPECIES[b.parts.head.sp].desc)}</span>` })).join('')}</div>` : `<div class="empty-note">売り切れた。</div>`}
      </div>
      <div class="sec-wrap"><h2 class="sec">部位</h2>
        ${s.shop.parts.length ? `<div class="list">${s.shop.parts.map((p) => `<div class="item"><canvas data-p="${p.id}" role="img" aria-label="${esc(partName(p))}"></canvas><div class="t"><b>${partLabel(p)} <span class="muted small">${TIER_STAR[partTier(p)]}</span></b><small>${esc(partSub(p))}</small><small>${partStatText(p)}</small></div><button class="btn small primary" data-act="buyp" data-id="${p.id}" ${s.kokurui >= p.price ? '' : 'disabled'}>${cost(p.price)}</button></div>`).join('')}</div>` : `<div class="empty-note">売り切れた。</div>`}
      </div>
      <div class="sec-wrap"><h2 class="sec">秘薬</h2>
        <div class="list">
          <div class="item"><div class="t"><b>変異薬</b><small>巨獣ひとりに、ランダムな変異をひとつ宿す（四つまで）。</small></div><button class="btn small primary" data-act="potion" data-v="mutagen" ${s.kokurui >= PRICE.mutagen ? '' : 'disabled'}>${cost(PRICE.mutagen)}</button></div>
          <div class="item"><div class="t"><b>成長の血</b><small>巨獣ひとりに、次の段階までの半分の経験を与える。</small></div><button class="btn small primary" data-act="potion" data-v="potion" ${s.kokurui >= PRICE.potion ? '' : 'disabled'}>${cost(PRICE.potion)}</button></div>
        </div></div>
      <button class="btn wide" data-act="refresh" ${s.kokurui >= PRICE.refresh ? '' : 'disabled'}>品を入れ替える ${cost(PRICE.refresh)}</button>
    </section>`;
  }
  function openPotion(kind) {
    const s = S();
    const list = s.beasts.filter((b) => kind !== 'mutagen' || b.traits.length < 4);
    const price = kind === 'mutagen' ? PRICE.mutagen : PRICE.potion;
    const sh = sheet(kind === 'mutagen' ? '変異薬を与える' : '成長の血を与える', list.length ? `<div class="list">${list.map((b) => `<div class="item"><canvas data-b="${b.id}" role="img" aria-label="${esc(b.name)}"></canvas><div class="t"><b>${esc(b.name)}</b><small>Lv.${b.level}・変異 ${b.traits.length}/4</small></div><button class="btn small primary" data-give="${b.id}">与える</button></div>`).join('')}</div>` : `<div class="empty-note">与えられる巨獣がいない。</div>`);
    sh.addEventListener('click', (e) => {
      const gv = e.target.closest('[data-give]'); if (!gv) return;
      const b = findOwn(gv.dataset.give); if (!b || s.kokurui < price) return;
      s.kokurui -= price;
      if (kind === 'mutagen') { const t = randomTraitFor(b); if (t) b.traits.push(t); toast(`${b.name}に変異「${TRAITS[t].name}」が宿った`); }
      else { const r = addXp(b, Math.max(120, xpNeed(b.level) * 0.5)); toast(`${b.name}は血を啜った${r.levels ? `（Lv.${b.level}）` : ''}`); }
      save(); snd('level'); closeSheet(); render();
    });
  }

  /* ---------- 侵攻（3D の王国） ---------- */
  function kingdom() { return WORLDS.find((w) => w.stage3d); }
  function worldHeadHTML(w) {
    const s = S();
    const fallen = w.regions.filter((r) => s.prog[r.id] && s.prog[r.id].fallen).length;
    return `<div class="world on">
          <canvas data-w="${w.id}" role="img" aria-label="${esc(w.name)}の夜景"></canvas>
          <div class="body"><h3>${esc(w.name)}<small>${esc(w.era)}</small></h3><span class="small muted">${esc(w.blurb)}</span>
            <div class="sw"><div class="s"><div class="lbl">強み</div><ul>${w.strengths.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div><div class="w"><div class="lbl">弱み</div><ul>${w.weaknesses.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div></div>
            <div class="pips">${w.regions.map((r) => `<i class="${s.prog[r.id] && s.prog[r.id].fallen ? 'on' : ''}"></i>`).join('')}<span>${fallen === w.regions.length ? 'この人間界は滅びた' : `陥落 ${fallen} / ${w.regions.length}`}</span></div>
          </div></div>`;
  }
  function invadeHTML() {
    const s = S();
    const w = kingdom();
    const others = WORLDS.filter((x) => !x.stage3d);
    return `<section class="screen"><div class="page-head"><span class="eyebrow">人間界へ</span><h1>侵攻</h1><p>巨獣を人間界へ放つ。峠を越えた巨獣は街道を進み、村も城塞都市も王都も踏み潰していく。人間は大砲と剣と祈りで抗い、巨獣が倒れるまで戦いは終わらない。その一部始終を、空から、住民の目から、巨獣の目から見届けよう。</p></div>
      <div class="sec-wrap">${worldHeadHTML(w)}
        <div class="regions">${w.regions.map((r, i) => { const pr = s.prog[r.id]; return `<div class="region k3row"><span class="idx">${'一二三四五'[i]}</span><span><b>${esc(r.name)}</b><small>${esc(r.sub)}・峠から ${r.km.toFixed(1)} km・人口 ${fmt(r.pop)}・危険度 <span class="danger">${'☠'.repeat(Math.ceil(r.D / 1.3))}</span></small></span><span class="st">${pr && pr.fallen ? '<span class="stamp">陥落</span>' : ''}${pr ? `<span class="num">最高 ${Math.round(pr.best * 100)}%</span>` : '<span>未踏</span>'}</span></div>`; }).join('')}</div>
        <button class="btn primary wide" data-act="kingdom">巨獣を送り込む</button>
      </div>
      ${others.map((x) => `<div class="sec-wrap">${worldHeadHTML(x)}
        <p class="small muted" style="margin:0">門は開いた。巨獣は街を左から右へ進む。薙ぎと必殺は自分の手で放て（キー：J＝薙ぐ／K＝必殺／↑↓＝速度／Esc＝撤退）。速度を「止」にすると、その場で建物を削り続けられる。壊滅率 ${Math.round(REGION_TARGET * 100)}% で陥落。地域は前の街を落とすと順に開く。</p>
        <div class="regions">${x.regions.map((r, i) => { const pr = s.prog[r.id]; const un = regionUnlocked(s, x, i); return `<div class="region" ${un ? '' : 'disabled'}><span class="idx">${'一二三四五'[i]}</span><span><b>${esc(r.name)}</b><small>${esc(r.sub)}・全長 ${fmt(r.len)} m・危険度 <span class="danger">${'☠'.repeat(Math.ceil(r.D / 1.3))}</span>${r.boss ? `・${esc(UNITS[r.boss.u].name)}` : ''}</small></span><span class="st">${pr && pr.fallen ? '<span class="stamp">陥落</span>' : ''}${pr ? `<span class="num">最高 ${Math.round(pr.best * 100)}%</span>` : un ? '<span>未踏</span>' : '<span>未解放</span>'}<button class="btn small primary" data-act="raid" data-w="${x.id}" data-r="${r.id}" ${un ? '' : 'disabled'}>侵攻</button></span></div>`; }).join('')}</div>
      </div>`).join('')}
    </section>`;
  }
  /* ---------- Raid（2D侵攻）への導線 ---------- */
  function openRaidPicker(wid, rid) {
    const s = S();
    const w = WORLDS.find((x) => x.id === wid), r = w && w.regions.find((x) => x.id === rid);
    if (!w || !r) return;
    const idx = w.regions.indexOf(r);
    if (!regionUnlocked(s, w, idx)) { toast('前の街を陥落させると開く'); return; }
    if (!s.beasts.length) { toast('送り込める巨獣がいない'); return; }
    const list = s.beasts.map((b) => { const st = beastStats(b); return `<div class="item"><canvas data-b="${b.id}" role="img" aria-label="${esc(b.name)}"></canvas><div class="t"><b>${esc(b.name)} <span class="lv">Lv.${b.level}</span></b><small>${ELEM[st.elem].name}・${esc(st.special)}　戦力 ${fmt(powerOf(st))}　体高 ${Math.round(st.height)}m</small><span class="row" style="display:flex;gap:6px;flex-wrap:wrap">${advChip(w, st)}</span></div><button class="btn small primary" data-rgo="${b.id}">放つ</button></div>`; }).join('');
    const sh = sheet(`${r.name}へ`, `<p class="small muted" style="margin:0">${esc(w.name)}・${esc(r.sub)}。敵の火力は王国より苛烈だ。属性の相性（弱点を突く頭への換装）が効く。陥落には壊滅率 ${Math.round(REGION_TARGET * 100)}% が必要。</p><div class="list">${list}</div>`);
    sh.addEventListener('click', (e) => {
      const g = e.target.closest('[data-rgo]'); if (g) { closeSheet(); startRaid(findOwn(g.dataset.rgo), w, r); }
    });
  }
  function advChip(w, st) {
    const m = w.elemMul[st.elem] || 1;
    if (m > 1.05) return `<span class="chip good">弱点を突く ×${m}</span>`;
    if (m < 0.95) return `<span class="chip bad">効きにくい ×${m}</span>`;
    return `<span class="chip plain">属性 等倍</span>`;
  }
  let startStop = 0;
  function openKingdom() {
    const s = S();
    const w = kingdom();
    if (!s.beasts.length) { toast('送り込める巨獣がいない'); return; }
    // 出現地点：峠か、陥落させた集落の先
    const starts = [{ i: 0, label: 'グラウ峠から' }];
    w.regions.forEach((r, i) => { if (i < w.regions.length - 1 && s.prog[r.id] && s.prog[r.id].fallen) starts.push({ i: i + 1, label: `${w.regions[i + 1].name.replace('城塞都市', '').replace('王都アルディナ', '王都')}の手前から` }); });
    if (!starts.some((x) => x.i === startStop)) startStop = 0;
    const list = s.beasts.map((b) => { const st = beastStats(b); return `<div class="item"><canvas data-b="${b.id}" role="img" aria-label="${esc(b.name)}"></canvas><div class="t"><b>${esc(b.name)} <span class="lv">Lv.${b.level}</span></b><small>${ELEM[st.elem].name}・${esc(st.special)}　戦力 ${fmt(powerOf(st))}　体高 ${Math.round(st.height)}m</small><span class="row" style="display:flex;gap:6px;flex-wrap:wrap">${advChip(w, st)}${st.elem === 'curse' ? '<span class="chip plain">闇：黒涙 +20%</span>' : ''}</span></div><button class="btn small primary" data-go="${b.id}">送る</button></div>`; }).join('');
    const sh = sheet(w.name + 'へ', `<p class="small muted" style="margin:0">巨獣は街道を西へ進み、集落を一つずつ蹂躙する。倒されるか、王都が陥落するまで続く。撤退もできる。初めて陥落させた集落ごとに褒美の黒涙が出る。</p>
      ${starts.length > 1 ? `<div class="seg" role="group" aria-label="出現地点">${starts.map((x) => `<button data-st="${x.i}" aria-pressed="${x.i === startStop}">${esc(x.label)}</button>`).join('')}</div>` : ''}
      <div class="list">${list}</div>`);
    sh.addEventListener('click', (e) => {
      const st = e.target.closest('[data-st]'); if (st) { startStop = +st.dataset.st; openKingdom(); return; }
      const g = e.target.closest('[data-go]'); if (g) { closeSheet(); start3D(findOwn(g.dataset.go), startStop); }
    });
  }
  function descOf(b, st) {
    const parts = {};
    for (const sl of SLOTS) { const p = b.parts[sl]; parts[sl] = { sp: p.sp, arch: SPECIES[p.sp].parts[sl], pal: SPECIES[p.sp].pal }; }
    return { parts, seed: (hashStr(b.id) % 1000) / 1000 + 0.1, sizeF: st.sizeF, elem: st.elem };
  }
  /* ---------- 3D の舞台 ---------- */
  function start3D(beast, from) {
    if (!beast) return;
    if (!window.Kyoju3D) { toast('3D の舞台を読み込めなかった'); return; }
    Sound.unlock();
    const s = S();
    const st = beastStats(beast);
    stageOpen = true;
    music('battle', 0.6);
    let stage = null;
    window.Kyoju3D.start({
      desc: descOf(beast, st), stats: st, beastName: beast.name, quality: s.settings.quality, cycle: s.cycle,
      sound: s.settings.sound ? Sound : null, startStop: from || 0, startHour: 15.5,
      onEnd: (res, stg) => {
        const ap = apply3D(beast, st, res);
        result3D(stg, beast, res, ap);
      },
    }).then((stg) => { stage = stg; }).catch((e) => {
      stageOpen = false; Sound.stopAmbient(); music('temple', 0.22);
      document.querySelectorAll('.k3').forEach((el) => el.remove());
      sheet('3Dの起動に失敗しました', '<p>ブラウザが3D描画を開始できませんでした。ほかの3Dゲームのタブを閉じ、ブラウザを開き直して再試行してください。</p><p class="small muted">WebGL 2に対応したブラウザが必要です。巨獣や育成の記録は保持されています。</p><button class="btn primary wide" data-retry>軽量設定で再試行</button>');
      $('[data-retry]').onclick = () => { s.settings.quality = 'low'; save(); closeSheet(); start3D(beast, from); };
      console.error(e);
    });
  }
  function apply3D(beast, st, res) {
    const s = S();
    const w = kingdom();
    let kok = res.kokurui * (st.elem === 'curse' ? 1.2 : 1) * (st.traits && st.traits.includes('despair') ? 1.15 : 1);
    let bonus = 0;
    const newly = [];
    for (const r of w.regions) {
      const p = res.progress[r.sid];
      if (!p || (!p.destr && !p.fallen)) continue;
      const pr = s.prog[r.id] || (s.prog[r.id] = { fallen: false, best: 0, raids: 0 });
      pr.raids++; pr.best = Math.max(pr.best, p.fallen ? Math.max(0.6, p.destr) : p.destr);
      if (p.fallen && !pr.fallen) { pr.fallen = true; newly.push(r); bonus += firstFallBonus(r.D, s.cycle); }
    }
    kok = Math.round(kok + bonus);
    s.kokurui += kok; s.stats.earned += kok; s.stats.raids++; s.stats.destroyed += res.bld; s.stats.kills += res.soldiers;
    const own = findOwn(beast.id);
    let lv = { levels: 0, traits: [] };
    if (own) { own.raids = (own.raids || 0) + 1; own.kills = (own.kills || 0) + res.soldiers; lv = addXp(own, res.xp); }
    s.shop = genShop(s); s.wild = genWild(s);
    Store.save();
    updatePurse();
    checkAchv();
    return { kok, bonus, newly, lv, level: own ? own.level : beast.level, worldFallenNow: newly.length && worldFallen(s, w), allFallen: newly.length && fallenCount(s) === regionTotal() };
  }
  function result3D(stage, beast, res, ap) {
    const title = { razed: '王国滅亡', repelled: '討伐された', retreat: '撤退' }[res.reason] || '終幕';
    const sub = { razed: '王城は崩れ、王都は炎に沈んだ。アルディナ王国は滅んだ。', repelled: `人間の抵抗に、${beast.name}は倒れた。${res.lastBlow ? `とどめは${res.lastBlow}。` : ''}魂は魔界へ還る。`, retreat: `${beast.name}を魔界へ呼び戻した。` }[res.reason] || '';
    const el = document.createElement('div');
    el.className = 'result k3-result';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '侵攻の結果');
    const w = kingdom();
    const towns = w.regions.map((r) => { const p = res.progress[r.sid]; if (!p || (!p.destr && !p.fallen)) return ''; return `<div><span>${esc(r.name)}</span><b>${Math.round(p.destr * 100)}%${p.fallen ? '　壊滅' : ''}${ap.newly.includes(r) ? '（初）' : ''}</b></div>`; }).join('');
    el.innerHTML = `<h2>${title}</h2><p class="small muted" style="margin:0;text-align:center">${esc(sub)}</p>
      ${ap.worldFallenNow ? `<p style="margin:0;text-align:center;font-family:var(--f-display);font-weight:800;letter-spacing:.1em;color:#ff9a80">人間界「${esc(w.name)}」は滅びた</p>` : ''}
      <div class="lines">
        ${towns}
        <div><span>壊した建物</span><b>${fmt(res.bld)} 棟</b></div>
        <div><span>犠牲になった人々</span><b>${fmt(res.dead)} 人</b></div>
        <div><span>退けた兵</span><b>${fmt(res.soldiers)}</b></div>
        <div><span>得た黒涙</span><b>＋${fmt(ap.kok)}${ap.bonus ? `（初陥落 ＋${fmt(ap.bonus)}）` : ''}</b></div>
        <div><span>${esc(beast.name)}の経験</span><b>＋${fmt(res.xp)}${ap.lv.levels ? `　Lv.${ap.level} に成長` : ''}</b></div>
        ${ap.lv.traits.map((t) => `<div><span>変異の覚醒</span><b>${TRAITS[t].name}</b></div>`).join('')}
      </div>
      <div class="btn-row"><button class="btn" data-x="stay">景色を眺める</button><button class="btn" data-x="again">もう一度</button><button class="btn primary" data-x="home">魔神殿へ</button></div>`;
    stage.root.appendChild(el);
    if (ap.lv.levels) snd('level');
    const close = () => {
      stage.close(); Sound.stopAmbient(); music('temple', 0.22); stageOpen = false; render();
      if (ap.allFallen) openEnding();
    };
    el.addEventListener('click', (e) => {
      const x = e.target.closest('[data-x]'); if (!x) return;
      if (x.dataset.x === 'stay') { el.remove(); stage.showFinish(() => result3D(stage, beast, res, Object.assign({}, ap, { lv: { levels: 0, traits: [] } }))); }
      if (x.dataset.x === 'home') { close(); setTab('home'); }
      if (x.dataset.x === 'again') { close(); const b = findOwn(beast.id); if (b) start3D(b, startStop); }
    });
  }
  function openEnding() {
    const s = S();
    const sh = sheet('黙示録、成る', `<div class="intro"><p>三つの人間界は灰に沈み、<br>最後の祈りも途絶えた。<br>玉座には黒涙が満ちている。</p></div>
      <p class="small muted">次の巡りへ進むと、人間界は再び栄え、より強く抗う。配下の巨獣と部位、黒涙はそのまま引き継がれ、得られる黒涙も増える。</p>
      <div class="btn-row"><button class="btn ghost" data-x="stay">このまま眺める</button><button class="btn primary" data-x="next">次の巡りへ</button></div>`, { noClose: true });
    $('[data-x="stay"]', sh).onclick = closeSheet;
    $('[data-x="next"]', sh).onclick = () => { s.cycle++; s.prog = {}; s.shop = genShop(s); s.wild = genWild(s); save(); closeSheet(); setTab('invade'); toast(`第${s.cycle + 1}の巡りが始まった`); };
  }

  /* ---------- Raid（2D横スクロール侵攻）の舞台 ---------- */
  function startRaid(beast, w, r) {
    if (!beast || !w || !r) return;
    Sound.unlock();
    const s = S();
    const st0 = beastStats(beast);
    stageOpen = true;
    music('battle', 0.55);
    const stage = document.createElement('div');
    stage.className = 'stage raid';
    stage.innerHTML = `<canvas aria-label="${esc(r.name)}を進む${esc(beast.name)}"></canvas>
      <div class="caption" aria-live="polite"></div>
      <div class="hud hud-top">
        <div class="hud-row"><span class="hud-title">${esc(r.name)}　<span class="muted" style="font-size:12px">${esc(w.name)}</span></span><span class="hud-clock" data-h="clock"></span></div>
        <div class="hpline"><span class="nm">${esc(beast.name)}</span><div class="hp"><i data-h="hp" style="width:100%"></i></div><span class="hpnum" data-h="hpnum"></span></div>
        <div class="meter"><i data-h="destr" style="width:0%"></i><span class="mark" style="left:${REGION_TARGET * 100}%"></span></div>
        <div class="meter-label"><span>壊滅率（${Math.round(REGION_TARGET * 100)}%で陥落）</span><b data-h="destrnum">0%</b></div>
        <div class="bossbar" data-h="bossbar" hidden><span data-h="bossname"></span><div class="hp enemy"><i data-h="bosshp" style="width:100%"></i></div></div>
      </div>
      <div class="hud hud-bottom"><div class="ctrls">
        <button class="ctrl" data-c="speed">速度：並</button>
        <button class="ctrl grow" data-c="swipe">薙ぐ<small style="display:block;font-size:10px;opacity:.7">J / Space</small></button>
        <button class="ctrl grow power" data-c="spec" disabled>必殺 ${esc(st0.special)}<span class="cd gauge" data-h="gauge" style="width:30%"></span></button>
        <button class="ctrl" data-c="exit">撤退</button>
      </div></div>`;
    document.body.appendChild(stage);
    const sim = new RaidSim(beast, w, r, { cycle: s.cycle });
    const capEl = $('.caption', stage);
    let capT = null;
    const view = new RaidView($('canvas', stage), sim, {
      sound: s.settings.sound ? Sound : null,
      onCaption: (text) => { capEl.textContent = text; capEl.classList.add('on'); clearTimeout(capT); capT = setTimeout(() => capEl.classList.remove('on'), 2600); },
    });
    const onResize = () => view.resize();
    window.addEventListener('resize', onResize);
    const speedBtn = $('[data-c="speed"]', stage), specBtn = $('[data-c="spec"]', stage);
    const speedName = () => ['止', '遅', '並', '速'][sim.speedLv];
    speedBtn.onclick = () => { sim.cycleSpeed(); speedBtn.textContent = '速度：' + speedName(); if (s.settings.sound) Sound.music('battle', 0.4 + sim.speedLv * 0.12); };
    $('[data-c="swipe"]', stage).onclick = () => sim.swipe();
    specBtn.onclick = () => sim.special();
    $('[data-c="exit"]', stage).onclick = () => sim.retreat();
    const onKey = (e) => {
      if (e.repeat) return;
      const k = e.code;
      if (k === 'KeyJ' || k === 'Space') { e.preventDefault(); sim.swipe(); }
      else if (k === 'KeyK' || k === 'Enter') { sim.special(); }
      else if (k === 'ArrowUp' || k === 'KeyW') { sim.setSpeed(sim.speedLv + 1); speedBtn.textContent = '速度：' + speedName(); }
      else if (k === 'ArrowDown' || k === 'KeyS') { sim.setSpeed(sim.speedLv - 1); speedBtn.textContent = '速度：' + speedName(); }
      else if (k === 'Escape') sim.retreat();
    };
    window.addEventListener('keydown', onKey);
    let running = true, last = performance.now(), applied = null, shown = false;
    const hpEl = $('[data-h="hp"]', stage), hpNum = $('[data-h="hpnum"]', stage), deEl = $('[data-h="destr"]', stage), deNum = $('[data-h="destrnum"]', stage),
      gaugeEl = $('[data-h="gauge"]', stage), clockEl = $('[data-h="clock"]', stage), bossBar = $('[data-h="bossbar"]', stage), bossHp = $('[data-h="bosshp"]', stage), bossName = $('[data-h="bossname"]', stage);
    const close = () => {
      running = false;
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
      stage.remove(); stageOpen = false;
      music('temple', 0.22);
      render();
      if (applied && applied.allFallen) openEnding();
    };
    const frame = (now) => {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!document.hidden) {
        sim.step(dt);
        view.update(dt);
        view.render();
        hpEl.style.width = Math.max(0, (sim.hp / sim.max) * 100).toFixed(1) + '%';
        hpNum.textContent = `${fmt(Math.max(0, sim.hp))} / ${fmt(sim.max)}`;
        const rate = sim.done ? sim.done.destr : sim.destrRate();
        deEl.style.width = (rate * 100).toFixed(1) + '%';
        deNum.textContent = Math.round(rate * 100) + '%' + (rate >= REGION_TARGET ? '　陥落圏' : '');
        gaugeEl.style.width = sim.gauge.toFixed(0) + '%';
        specBtn.disabled = sim.gauge < 100;
        clockEl.textContent = `${esc(r.name)}　残り ${fmt(Math.max(0, sim.len - sim.x))} m`;
        if (sim.boss && sim.boss.alive) { bossBar.hidden = false; bossName.textContent = sim.boss.U.name; bossHp.style.width = Math.max(0, (sim.boss.hp / sim.boss.max) * 100).toFixed(1) + '%'; }
        else bossBar.hidden = true;
        if (sim.done && !applied) applied = applyRaid(beast, w, r, sim.done);
        if (sim.done && !shown && sim.endT > 1.4) { shown = true; resultRaid(stage, beast, w, r, sim.done, applied, close, () => { close(); const b = findOwn(beast.id); if (b) startRaid(b, w, r); }); }
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  function applyRaid(beast, w, r, res) {
    const s = S();
    const st = beastStats(beast);
    const pr = s.prog[r.id] || (s.prog[r.id] = { fallen: false, best: 0, raids: 0 });
    pr.raids++; pr.best = Math.max(pr.best, res.destr);
    let bonus = 0, newly = false;
    if (res.fallen && !pr.fallen) { pr.fallen = true; newly = true; bonus = firstFallBonus(r.D, s.cycle); }
    let kok = regionReward(r.D, s.cycle) * clamp(res.destr / REGION_TARGET, 0, 1);
    if (st.elem === 'curse') kok *= 1.2;
    if (st.traits.includes('despair')) kok *= 1.15;
    kok = Math.round(kok) + bonus;
    s.kokurui += kok; s.stats.earned += kok; s.stats.raids++; s.stats.destroyed += res.bld; s.stats.kills += res.soldiers;
    const own = findOwn(beast.id);
    let lv = { levels: 0, traits: [] };
    if (own) { own.raids = (own.raids || 0) + 1; own.kills = (own.kills || 0) + res.soldiers; lv = addXp(own, res.xp); }
    s.shop = genShop(s); s.wild = genWild(s);
    Store.save();
    updatePurse();
    checkAchv();
    return { kok, bonus, newly, lv, level: own ? own.level : beast.level, worldFallenNow: newly && worldFallen(s, w), allFallen: newly && fallenCount(s) === regionTotal() };
  }
  function resultRaid(stage, beast, w, r, res, ap, close, again) {
    const title = res.fallen ? '陥落' : res.reason === 'dead' ? '討伐された' : res.reason === 'retreat' ? '撤退' : '街を抜けた';
    const sub = res.fallen ? `${r.name}は壊滅した。` : res.reason === 'dead' ? `人間の抵抗に、${beast.name}は倒れた。魂は魔界へ還る。` : res.reason === 'retreat' ? `${beast.name}を魔界へ呼び戻した。` : `街を抜けたが、壊滅には届かなかった（${Math.round(REGION_TARGET * 100)}%で陥落）。`;
    const el = document.createElement('div');
    el.className = 'result';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '侵攻の結果');
    el.innerHTML = `<h2>${title}</h2>
      ${res.fallen ? '<span class="stamp fallen">陥落</span>' : ''}
      <p class="small muted" style="margin:0;text-align:center">${esc(sub)}</p>
      ${ap.worldFallenNow ? `<p style="margin:0;text-align:center;font-family:var(--f-display);font-weight:800;letter-spacing:.1em;color:#ff9a80">人間界「${esc(w.name)}」は滅びた</p>` : ''}
      <div class="big">${Math.round(res.destr * 100)}<small>% 壊滅</small></div>
      <div class="lines">
        <div><span>壊した建物</span><b>${fmt(res.bld)} 棟</b></div>
        <div><span>犠牲になった人々</span><b>${fmt(res.dead)} 人</b></div>
        <div><span>退けた兵・兵器</span><b>${fmt(res.soldiers)}</b></div>
        <div><span>得た黒涙</span><b>＋${fmt(ap.kok)}${ap.bonus ? `（初陥落 ＋${fmt(ap.bonus)}）` : ''}</b></div>
        <div><span>${esc(beast.name)}の経験</span><b>＋${fmt(res.xp)}${ap.lv.levels ? `　Lv.${ap.level} に成長` : ''}</b></div>
        ${ap.lv.traits.map((t) => `<div><span>変異の覚醒</span><b>${TRAITS[t].name}</b></div>`).join('')}
      </div>
      <div class="btn-row"><button class="btn" data-x="again">もう一度</button><button class="btn primary" data-x="home">魔神殿へ</button></div>`;
    stage.appendChild(el);
    if (ap.lv.levels) snd('level');
    el.addEventListener('click', (e) => {
      const x = e.target.closest('[data-x]'); if (!x) return;
      if (x.dataset.x === 'home') close();
      if (x.dataset.x === 'again') again();
    });
  }

  /* ---------- 蠱毒の舞台 ---------- */
  function startFight() {
    const s = S();
    const a = findOwn(ko.a);
    const wild = ko.src === 'wild';
    const b = wild ? s.wild.find((x) => x.id === ko.b) : findOwn(ko.b);
    if (!a || !b) return;
    Sound.unlock();
    music('kodoku', 0.5);
    const lethal = wild || ko.lethal;
    const fight = new Fight(a, b, { lethal });
    const stage = document.createElement('div');
    stage.className = 'stage';
    stage.innerHTML = `<canvas aria-label="蠱毒の壺で戦う二体の巨獣"></canvas>
      <div class="hud hud-top">
        <div class="hud-row"><span class="hud-title">蠱毒の壺　<span class="muted" style="font-size:12px">${lethal ? '殺し合い' : '調練'}</span></span></div>
        <div class="hpline"><span class="nm">${esc(a.name)}</span><div class="hp"><i id="fA" style="width:100%"></i></div></div>
        <div class="hpline"><span class="nm">${esc(b.name)}</span><div class="hp enemy"><i id="fB" style="width:100%"></i></div></div>
      </div>
      <div class="hud hud-bottom"><div class="ctrls"><button class="ctrl" id="fSpeed">×1</button><button class="ctrl grow" id="fSkip">決着まで飛ばす</button></div></div>`;
    document.body.appendChild(stage);
    stageOpen = true;
    const view = new FightView($('canvas', stage), fight, { sound: s.settings.sound ? Sound : null });
    let speed = 1, acc = 0, last = performance.now(), running = true, shown = false, applied = null;
    const onResize = () => view.resize();
    window.addEventListener('resize', onResize);
    $('#fSpeed', stage).onclick = (e) => { speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; e.currentTarget.textContent = '×' + speed; };
    $('#fSkip', stage).onclick = () => { let n = 0; while (!fight.done && n++ < 6000) { fight.step(1 / 30); fight.ev = fight.ev.filter((e) => e.k === 'end'); } };
    const close = () => { running = false; window.removeEventListener('resize', onResize); stage.remove(); stageOpen = false; music('temple', 0.22); render(); };
    const fa = $('#fA', stage), fb = $('#fB', stage);
    const frame = (now) => {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      acc += dt * speed;
      let n = 0;
      while (acc >= 1 / 30 && n < 10) { fight.step(1 / 30); acc -= 1 / 30; n++; }
      if (n >= 10) acc = 0;
      view.update(dt * speed);
      view.render();
      fa.style.width = Math.max(0, (fight.F[0].hp / fight.F[0].max) * 100).toFixed(1) + '%';
      fb.style.width = Math.max(0, (fight.F[1].hp / fight.F[1].max) * 100).toFixed(1) + '%';
      if (fight.done && !applied) applied = applyFight(fight, a, b, wild, lethal);
      if (fight.done && !shown && view.endT > 2.4) { shown = true; showFightResult(stage, fight, applied, close); }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  function applyFight(fight, a, b, wild, lethal) {
    const s = S();
    const aWon = fight.winner.model === a;
    const W = aWon ? a : b, L = aWon ? b : a;
    const out = { aWon, winner: W, loser: L, xpW: 0, xpL: 0, lvW: null, lvL: null, gains: null, trait: null, died: null, wild, lethal };
    if (!lethal) {
      out.xpW = fightXp(L.level, false); out.xpL = Math.round(out.xpW * 0.5);
      out.lvW = addXp(W, out.xpW); out.lvL = addXp(L, out.xpL);
      W.wins = (W.wins || 0) + 1;
    } else if (wild) {
      if (aWon) {
        out.xpW = fightXp(b.level, true); out.lvW = addXp(a, out.xpW);
        const d = devour(a, b); out.gains = d.gains; out.trait = d.trait;
        a.wins = (a.wins || 0) + 1; a.kills = (a.kills || 0) + 1;
        s.wild = s.wild.filter((x) => x.id !== b.id);
        if (!s.wild.length) s.wild = genWild(s);
        out.died = b;
      } else { out.xpL = Math.round(fightXp(b.level, false) * 0.3); out.lvL = addXp(a, out.xpL); }
    } else {
      out.xpW = fightXp(L.level, true); out.lvW = addXp(W, out.xpW);
      const d = devour(W, L); out.gains = d.gains; out.trait = d.trait;
      W.wins = (W.wins || 0) + 1; W.kills = (W.kills || 0) + 1;
      s.beasts = s.beasts.filter((x) => x.id !== L.id);
      out.died = L;
      if (ko.a === L.id) ko.a = W.id;
      ko.b = null;
    }
    if (!wild || aWon) s.stats.kwins = (s.stats.kwins || 0) + 1; // 自軍の勝利を蠱毒通算勝ちに数える
    Store.save();
    checkAchv();
    return out;
  }
  function showFightResult(stage, fight, r, close) {
    const el = document.createElement('div');
    el.className = 'result';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '蠱毒の結果');
    const g = r.gains;
    let title = r.aWon ? '勝利' : '敗北';
    if (!r.lethal) title = r.winner.name + 'の勝ち';
    const lines = [];
    if (r.xpW) lines.push(`<div><span>${esc(r.winner.name)}の経験</span><b>＋${fmt(r.xpW)}${r.lvW && r.lvW.levels ? `　Lv.${r.winner.level}` : ''}</b></div>`);
    if (r.xpL) lines.push(`<div><span>${esc(r.wild ? fight.F[0].model.name : r.loser.name)}の経験</span><b>＋${fmt(r.xpL)}</b></div>`);
    if (g) lines.push(`<div><span>喰らって得た力</span><b>体力＋${fmt(g.hp)}・攻撃＋${fmt(g.atk)}・魔力＋${fmt(g.pow)}</b></div>`);
    if (r.trait) lines.push(`<div><span>奪った変異</span><b>${TRAITS[r.trait].name}</b></div>`);
    for (const lv of [r.lvW, r.lvL]) if (lv) for (const t of lv.traits) lines.push(`<div><span>変異の覚醒</span><b>${TRAITS[t].name}</b></div>`);
    const sub = r.died ? `${esc(r.died.name)}は${esc(r.winner.name)}に喰われた。` : r.wild && !r.aWon ? `${esc(r.loser.name)}は傷を負い、逃げ帰った。` : '二体とも生きて壺を出た。';
    el.innerHTML = `<h2>${title}</h2><p class="small muted" style="margin:0;text-align:center">${sub}</p><div class="lines">${lines.join('')}</div><div class="btn-row"><button class="btn primary" data-x="ok">壺を出る</button></div>`;
    stage.appendChild(el);
    if ((r.lvW && r.lvW.levels) || (r.lvL && r.lvL.levels)) snd('level');
    $('[data-x="ok"]', el).onclick = close;
  }

  /* ---------- 記録（図鑑・実績） ---------- */
  function openRecords() {
    const s = S();
    const seen = seenSpecies(s);
    const spRows = Object.entries(SPECIES).map(([id, sp]) => {
      const got = seen.has(id);
      return `<div class="item"><div class="t"><b>${got ? esc(sp.kanji) + '（' + esc(sp.kana.join('')) + '）' : '？？？'} <span class="muted small">${got ? TIER_STAR[sp.tier] + '・' + ELEM[sp.elem].name : '未確認'}</span></b><small>${got ? esc(sp.desc) : 'この種の部位や巨獣を手に入れると、記録に残る。'}</small></div></div>`;
    }).join('');
    const achRows = Object.entries(ACHV).map(([id, a]) => {
      const done = (s.achv || []).includes(id);
      return `<div class="item"><div class="t"><b>${done ? '◆' : '◇'} ${esc(a.name)}</b><small>${esc(a.desc)}${done ? '（達成）' : ''}</small></div></div>`;
    }).join('');
    sheet('記録', `<div class="sec-wrap"><h2 class="sec">巨獣図鑑 <small>${seen.size} / ${Object.keys(SPECIES).length} 種</small></h2><div class="list">${spRows}</div></div>
      <div class="sec-wrap"><h2 class="sec">実績 <small>${(s.achv || []).length} / ${Object.keys(ACHV).length}</small></h2><div class="list">${achRows}</div></div>`);
  }

  /* ---------- 設定・導入 ---------- */
  function openSettings() {
    const s = S();
    const sh = sheet('設定', `
      <div class="sec-wrap"><h2 class="sec">音</h2><div class="seg" role="group" aria-label="音"><button data-x="snd1" aria-pressed="${s.settings.sound}">鳴らす</button><button data-x="snd0" aria-pressed="${!s.settings.sound}">消す</button></div></div>
      <div class="sec-wrap"><h2 class="sec">描画の質</h2><div class="seg" role="group" aria-label="描画の質">${[['auto', '自動'], ['low', '軽量'], ['std', '標準'], ['high', '高画質']].map(([k, l]) => `<button data-x="q-${k}" aria-pressed="${s.settings.quality === k}">${l}</button>`).join('')}</div><p class="small muted" style="margin:0">おすすめは「自動」。端末に合わせて木・影・粒子を調整し、プレイ中も負荷に応じて解像度を調整する。「高画質」は影と光のにじみを優先。画面揺れは初期状態でOFF。</p></div>
      <div class="sec-wrap"><h2 class="sec">記録</h2><p class="small muted" style="margin:0">進行はこの端末に自動で保存される。ブラウザのデータを消すと記録も消えるため注意。</p>
        <div class="btn-row"><button class="btn" data-x="records">図鑑・実績を見る</button><button class="btn ghost" data-x="reset">最初からやり直す</button></div></div>`);
    sh.addEventListener('click', (e) => {
      const x = e.target.closest('[data-x]'); if (!x) return;
      const k = x.dataset.x;
      if (k === 'records') { openRecords(); return; }
      if (k === 'snd1' || k === 'snd0') { s.settings.sound = k === 'snd1'; Sound.on = s.settings.sound; if (s.settings.sound) { Sound.unlock(); Sound.play('ui'); } else Sound.stopMusic(); save(); openSettings(); }
      if (k.startsWith('q-')) { s.settings.quality = k.slice(2); save(); openSettings(); }
      if (k === 'reset') confirmSheet('最初からやり直す', '<p class="small muted">配下の巨獣・部位・黒涙・陥落させた街がすべて消える。元には戻せない。</p>', '消してやり直す', () => { Store.state = newState(); Store.state.intro = true; save(); tab = 'home'; render(); toast('新たな魔神として目覚めた'); }, true);
    });
  }
  function openIntro() {
    const sh = sheet('巨獣黙示録', `<div class="intro"><p>汝は魔神。<br>幾つもの人間界を喰らう者。<br>巨獣を造り、鍛え、放て。<br>人の世の灯がすべて消えるまで。</p></div>
      <p class="small muted" style="margin:0">手元には二体の巨獣と少しの黒涙がある。まずは「侵攻」から巨獣をアルディナ王国へ放ってみよう。峠のふもとのミルト村から、街道は王都まで続いている。剣と魔法の世界は炎に弱い。</p>
      <button class="btn primary wide" data-x="go">玉座に就く</button>`, { noClose: true });
    $('[data-x="go"]', sh).onclick = () => { Sound.unlock(); S().intro = true; save(); closeSheet(); setTab('invade'); render(); };
  }

  /* ---------- 描画と操作 ---------- */
  function setTab(t) {
    tab = t;
    $$('#tabs button').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === t ? 'page' : 'false'));
    if (!stageOpen && t === 'home') music('temple', 0.22);
    render();
    window.scrollTo(0, 0);
  }
  function render() {
    const main = $('#screen');
    const html = { home: homeHTML, forge: forgeHTML, kodoku: kodokuHTML, market: marketHTML, invade: invadeHTML }[tab]();
    main.innerHTML = html;
    paint(main);
    updatePurse();
    if (tab === 'forge' && forgeMode === 'swap' && $('#forgeCv')) animate($('#forgeCv'), () => { const b = findOwn(forgeSel); return b ? BeastArt.visOf(b) : null; });
    if (tab === 'forge' && forgeMode === 'build' && $('#buildCv')) animate($('#buildCv'), buildVis);
  }
  function onMain(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act, id = el.dataset.id, s = S();
    snd('ui');
    switch (act) {
      case 'beast': openBeast(id); break;
      case 'parts': openParts(); break;
      case 'mercy': {
        const sp = pick(Object.keys(SPECIES).filter((k) => SPECIES[k].tier === 1));
        s.beasts.push(speciesBeast(sp)); save(); render(); toast('魔界の野良巨獣を従えた'); break;
      }
      case 'fmode': forgeMode = el.dataset.m; render(); break;
      case 'fpick': forgeSel = id; render(); break;
      case 'slot': openSlot(el.dataset.slot); break;
      case 'bslot': openBuildSlot(el.dataset.slot); break;
      case 'build': {
        const parts = {};
        for (const sl of SLOTS) { const p = s.parts.find((q) => q.id === buildSel[sl]); if (!p) return; parts[sl] = p; }
        if (s.kokurui < PRICE.assemble || s.beasts.length >= 12) return;
        s.parts = s.parts.filter((p) => !SLOTS.some((sl) => parts[sl] === p));
        const b = newBeast(parts);
        s.beasts.push(b); s.kokurui -= PRICE.assemble; buildSel = {};
        save(); snd('roar', { big: true }); forgeMode = 'swap'; forgeSel = b.id; render(); toast(b.name + 'が生まれた');
        break;
      }
      case 'split': openDismantle(id); break;
      case 'kmode': ko.lethal = el.dataset.v === '1'; render(); break;
      case 'ka': ko.a = id; if (ko.b === id) ko.b = null; render(); break;
      case 'ksrc': ko.src = el.dataset.v; ko.b = null; render(); break;
      case 'kb': ko.b = id; render(); break;
      case 'kgo': {
        const b = ko.src === 'wild' ? s.wild.find((x) => x.id === ko.b) : findOwn(ko.b);
        if (ko.src === 'own' && ko.lethal && b) confirmSheet('殺し合わせる', `<p class="small muted">負けた方は死に、勝った方に喰われる。${esc(findOwn(ko.a).name)} と ${esc(b.name)}、どちらかを失う。</p>`, '壺に放り込む', startFight, true);
        else startFight();
        break;
      }
      case 'buyb': {
        const i = s.shop.beasts.findIndex((b) => b.id === id); if (i < 0) return;
        const b = s.shop.beasts[i];
        if (s.kokurui < b.price || s.beasts.length >= 12) return;
        s.kokurui -= b.price; s.shop.beasts.splice(i, 1);
        delete b.price; b.id = uid(); s.beasts.push(b);
        save(); snd('buy'); render(); toast(b.name + 'を購った');
        break;
      }
      case 'buyp': {
        const i = s.shop.parts.findIndex((p) => p.id === id); if (i < 0) return;
        const p = s.shop.parts[i];
        if (s.kokurui < p.price) return;
        s.kokurui -= p.price; s.shop.parts.splice(i, 1);
        delete p.price; p.id = uid(); s.parts.push(p);
        save(); snd('buy'); render(); toast(partName(p) + 'を蔵に収めた');
        break;
      }
      case 'potion': openPotion(el.dataset.v); break;
      case 'refresh': if (s.kokurui >= PRICE.refresh) { s.kokurui -= PRICE.refresh; s.shop = genShop(s); save(); render(); toast('市の品が入れ替わった'); } break;
      case 'kingdom': openKingdom(); break;
      case 'raid': openRaidPicker(el.dataset.w, el.dataset.r); break;
      case 'records': openRecords(); break;
      default: break;
    }
  }
  function init() {
    $('#screen').addEventListener('click', onMain);
    $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) { snd('ui'); setTab(b.dataset.tab); } });
    $('#settingsBtn').addEventListener('click', openSettings);
    $('#purse').addEventListener('click', () => setTab('market'));
    document.addEventListener('pointerdown', () => { if (S().settings.sound) Sound.unlock(); }, { once: true });
    Sound.on = S().settings.sound;
    setTab('home');
    if (!S().intro) openIntro();
  }
  function refresh() { if (!stageOpen) { closeSheet(); render(); } }
  return { init, refresh, busy: () => stageOpen, toast, render };
})();
