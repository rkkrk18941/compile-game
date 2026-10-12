import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DIRS, DIR_KEYS, SIZE, MARK_KINDS } from '../core/constants.js';
import { shrineExitDirs } from '../core/geom.js';
import { Icon } from './icons.jsx';
import { colorClass, explorerColor } from './common.jsx';

const k = (x, y) => `${x},${y}`;

// ═════════════════ Stone board: the true 5×5 labyrinth ═════════════════
// tokens: [{ id, kind:'explorer'|'guard'|'guardian', pos, colorKey, label, dim, active, ring }]
export function StoneBoard({
  board, shrine, starts = {}, tokens = [], highlights = {}, onCell, mode = 'play', knowledge = null, trails = null, spot = null, compact,
}) {
  const exits = shrine?.index != null ? shrineExitDirs(shrine.shape, shrine.rotation) : [];
  const startAt = {};
  for (const [eid, p] of Object.entries(starts || {})) if (Number.isInteger(p)) startAt[p] = eid;
  // group tokens by cell for clustering
  const byCell = {};
  for (const t of tokens) { if (t.pos == null) continue; (byCell[t.pos] ||= []).push(t); }
  const placed = [];
  for (const [pos, list] of Object.entries(byCell)) {
    list.forEach((t, i) => placed.push({ ...t, slot: clusterSlot(i, list.length) }));
  }
  return (
    <div class={`stone ${mode} ${compact ? 'compact' : ''}`}>
      <div class="stone-grid">
        {board.map((kind, i) => {
          const x = i % SIZE, y = Math.floor(i / SIZE);
          const isShrine = kind === 'shrine' || i === shrine?.index;
          const h = highlights[i];
          const cls = isShrine ? 'st-shrinecell' : kind === 'wall' ? 'st-wall' : 'st-room';
          const tex = kind === 'wall' ? '' : `f${(x * 7 + y * 3) % 4}`;
          return (
            <button type="button" class={`st-cell ${cls} ${tex} ${h ? `hl-${h}` : ''}`} data-cell={i}
              aria-label={`${y + 1}行${x + 1}列 ${isShrine ? '石室' : kind === 'wall' ? '壁' : '部屋'}`}
              onClick={onCell ? () => onCell(i) : undefined} tabIndex={onCell ? 0 : -1}>
              {isShrine && <span class="st-shrine"><span class="rune" />{exits.map(d => <span class={`st-exit ex-${d}`} />)}</span>}
              {startAt[i] && mode !== 'play' && <span class={`st-start ${colorClass(explorerColor(startAt[i]))}`}><i>始</i></span>}
              {startAt[i] && mode === 'play' && <span class={`st-startdot ${colorClass(explorerColor(startAt[i]))}`} />}
              {knowledge && <KnowledgeMarks knowledge={knowledge} cell={i} />}
            </button>
          );
        })}
      </div>
      {trails && <Trails trails={trails} />}
      <div class="stone-tokens">
        {placed.map(t => <StoneToken key={t.id} t={t} />)}
      </div>
      {spot != null && <div class="stone-spot" style={spotStyle(spot)} />}
    </div>
  );
}

function spotStyle(pos) {
  const x = pos % SIZE, y = Math.floor(pos / SIZE);
  return { '--sx': `${(x + 0.5) * 20}%`, '--sy': `${(y + 0.5) * 20}%` };
}

function clusterSlot(i, n) {
  if (n <= 1) return { dx: 0, dy: 0, s: 1 };
  const layouts = {
    2: [[-0.2, 0], [0.2, 0]],
    3: [[-0.2, -0.16], [0.2, -0.16], [0, 0.2]],
    4: [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]],
    5: [[-0.22, -0.22], [0.22, -0.22], [0, 0], [-0.22, 0.22], [0.22, 0.22]],
  };
  const l = layouts[Math.min(5, n)][i % 5] || [0, 0];
  return { dx: l[0], dy: l[1], s: n >= 3 ? 0.72 : 0.82 };
}

function StoneToken({ t }) {
  const x = t.pos % SIZE, y = Math.floor(t.pos / SIZE);
  const style = { '--tx': x, '--ty': y, '--dx': t.slot.dx, '--dy': t.slot.dy, '--ts': t.slot.s };
  if (t.kind === 'explorer') {
    return <span class={`st-token explorer ${colorClass(t.colorKey)} ${t.active ? 'active' : ''} ${t.dim ? 'dim' : ''} ${t.ring ? 'ring-' + t.ring : ''}`} style={style}><span class="seal">{t.label}</span></span>;
  }
  return (
    <span class={`st-token ${t.kind} ${t.selected ? 'selected' : ''} ${t.frozen ? 'frozen' : ''} ${t.dim ? 'dim' : ''}`} style={style}>
      <span class="sigil"><Icon name={t.kind === 'guardian' ? 'guardian' : 'guard'} size={t.kind === 'guardian' ? 22 : 19} /></span>
    </span>
  );
}

function KnowledgeMarks({ knowledge, cell }) {
  const marks = knowledge[cell];
  if (!marks) return null;
  return <span class="st-know">{marks.map(m => <i class={`${colorClass(m.colorKey)} ${m.v}`} />)}</span>;
}

function Trails({ trails }) {
  // trails: [{ colorKey, points:[pos...], dashed }]
  const pt = (p) => `${(p % SIZE + 0.5) * 20},${(Math.floor(p / SIZE) + 0.5) * 20}`;
  return (
    <svg class="stone-trails" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {trails.map((t, i) => t.points.length > 1 && (
        <polyline key={i} class={`trail ${colorClass(t.colorKey)} ${t.dashed ? 'dashed' : ''} ${t.kind || ''}`}
          points={t.points.map((p, j) => { const [x, y] = pt(p).split(',').map(Number); const o = (i - trails.length / 2) * 0.9; return `${x + o},${y + o}`; }).join(' ')} />
      ))}
    </svg>
  );
}

// ═════════════════ Survey map: an explorer's own notebook ═════════════════
// map: { localPos, discovered, wallKinds }
// extras: { teamCells: Map(key->{v,colorKey}), ghosts:[{x,y,colorKey,label}], meet:{x,y}, marks:[{x,y,kind}], notes:[{x,y,icon}] }
export function SurveyMap({ map, colorKey, label, active, blocked, canExplore = true, onStep, onPath, extras = {}, showFrontier = true, mini, title }) {
  const ref = useRef(null);
  const [box, setBox] = useState({ w: 340, h: 340 });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const lp = map?.localPos || { x: 0, y: 0 };
  const disc = map?.discovered || {};
  const view = useMemo(() => {
    let minX = lp.x - 1, maxX = lp.x + 1, minY = lp.y - 1, maxY = lp.y + 1;
    const take = (x, y) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); };
    for (const key of Object.keys(disc)) { const [x, y] = key.split(',').map(Number); take(x, y); }
    for (const g of extras.ghosts || []) take(g.x, g.y);
    if (extras.meet) take(extras.meet.x, extras.meet.y);
    for (const m of extras.marks || []) take(m.x, m.y);
    minX -= 1; maxX += 1; minY -= 1; maxY += 1;
    // keep at least 5×5, at most 9×9 around the explorer
    while (maxX - minX + 1 < 5) { minX--; if (maxX - minX + 1 < 5) maxX++; }
    while (maxY - minY + 1 < 5) { minY--; if (maxY - minY + 1 < 5) maxY++; }
    if (maxX - minX + 1 > 9) { minX = Math.max(minX, lp.x - 4); maxX = minX + 8; }
    if (maxY - minY + 1 > 9) { minY = Math.max(minY, lp.y - 4); maxY = minY + 8; }
    const cols = maxX - minX + 1, rows = maxY - minY + 1;
    const pad = mini ? 6 : 14;
    const cell = Math.floor(Math.min((box.w - pad * 2) / cols, (box.h - pad * 2) / rows, mini ? 34 : 70));
    const ox = Math.round((box.w - cell * cols) / 2), oy = Math.round((box.h - cell * rows) / 2);
    return { minX, maxX, minY, maxY, cols, rows, cell, ox, oy };
  }, [box.w, box.h, JSON.stringify(disc), lp.x, lp.y, JSON.stringify(extras.ghosts || []), extras.meet?.x, extras.meet?.y, (extras.marks || []).length]);

  // reachable known rooms (for tap-to-walk) via BFS over own map
  const paths = useMemo(() => {
    const out = new Map([[k(lp.x, lp.y), []]]);
    const q = [[lp.x, lp.y]];
    for (let h = 0; h < q.length; h++) {
      const [x, y] = q[h];
      for (const d of DIR_KEYS) {
        const nx = x + DIRS[d].dx, ny = y + DIRS[d].dy, nk = k(nx, ny);
        if (out.has(nk)) continue;
        const v = disc[nk];
        if (v !== 'open' && v !== 'start') continue;
        out.set(nk, [...out.get(k(x, y)), d]);
        q.push([nx, ny]);
      }
    }
    return out;
  }, [JSON.stringify(disc), lp.x, lp.y]);

  const cells = [];
  const { cell } = view;
  for (let y = view.minY; y <= view.maxY; y++) for (let x = view.minX; x <= view.maxX; x++) {
    const key = k(x, y), v = disc[key];
    const left = view.ox + (x - view.minX) * cell, top = view.oy + (y - view.minY) * cell;
    const adjDir = DIR_KEYS.find(d => lp.x + DIRS[d].dx === x && lp.y + DIRS[d].dy === y);
    const isHere = x === lp.x && y === lp.y;
    let act = null;
    if (active && onStep && !blocked) {
      if (adjDir && !v && canExplore) act = { kind: 'explore', dir: adjDir };
      else if (adjDir && (v === 'open' || v === 'start')) act = { kind: 'move', dir: adjDir };
      else if (!adjDir && !isHere && (v === 'open' || v === 'start') && paths.get(key)?.length) act = { kind: 'path', dirs: paths.get(key) };
    }
    const team = !v ? extras.teamCells?.get(key) : null;
    const wk = map?.wallKinds?.[key];
    cells.push(
      <div key={key} class={`sv-cell ${v ? (v === 'wall' ? 'sv-wall' : 'sv-room') : 'sv-unknown'} ${act ? 'act act-' + act.kind : ''}`}
        style={{ transform: `translate(${left}px, ${top}px)`, width: `${cell}px`, height: `${cell}px` }}
        role={act ? 'button' : undefined} tabIndex={act ? 0 : -1}
        aria-label={act ? (act.kind === 'explore' ? `${DIRS[act.dir].label}を探索（時間−1）` : act.kind === 'move' ? `${DIRS[act.dir].label}へ移動` : 'ここまで移動') : undefined}
        onClick={act ? () => (act.kind === 'path' ? onPath?.(act.dirs) : onStep(act.kind, act.dir)) : undefined}
        onKeyDown={act ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act.kind === 'path' ? onPath?.(act.dirs) : onStep(act.kind, act.dir); } } : undefined}>
        {v ? <span key={`ink-${v}`} class={`ink ${v === 'wall' ? 'ink-wall' : 'ink-room'} ${wk ? 'wk-' + wk : ''}`}>
          {v === 'start' && <span class="sv-start">始</span>}
          {wk && <span class="sv-wk">{wk === 'outer' ? '外' : '内'}</span>}
        </span> : <span class="fogwash" />}
        {team && <span class={`sv-team ${team.v} ${colorClass(team.colorKey)}`} />}
        {act?.kind === 'explore' && <span class="sv-act"><Icon name="search" size={Math.max(14, cell * 0.3)} /><b>探索</b><i>⌛1</i></span>}
        {act?.kind === 'move' && <span class="sv-act move"><Icon name="steps" size={Math.max(14, cell * 0.3)} /><b>移動</b></span>}
      </div>,
    );
  }
  const pos = (x, y) => ({ transform: `translate(${view.ox + (x - view.minX) * cell}px, ${view.oy + (y - view.minY) * cell}px)`, width: `${cell}px`, height: `${cell}px` });
  const lx = view.ox + (lp.x - view.minX + 0.5) * cell, ly = view.oy + (lp.y - view.minY + 0.5) * cell;
  return (
    <div ref={ref} class={`survey ${mini ? 'mini' : ''} ${active ? 'is-active' : ''} ${colorClass(colorKey)}`} style={{ '--lx': `${lx}px`, '--ly': `${ly}px`, '--cell': `${cell}px` }}>
      <div class="sv-paper" />
      <div class="sv-layer">
        {cells}
        {(extras.marks || []).map(m => <div class={`sv-mark mk-${m.kind}`} style={pos(m.x, m.y)}><span>{MARK_KINDS[m.kind]?.sym}</span></div>)}
        {extras.meet && <div class="sv-mark mk-meet" style={pos(extras.meet.x, extras.meet.y)}><span>◎</span></div>}
        {(extras.notes || []).map(n => <div class="sv-note" style={pos(n.x, n.y)}><Icon name={n.icon} size={Math.max(12, cell * 0.26)} /></div>)}
        {(extras.ghosts || []).map(g => <div class={`sv-ghost ${colorClass(g.colorKey)}`} style={pos(g.x, g.y)}><span class="seal s">{g.label}</span></div>)}
        <div class={`sv-me ${colorClass(colorKey)} ${active ? 'active' : ''}`} style={pos(lp.x, lp.y)}><span class="seal">{label}</span></div>
      </div>
      <div class="sv-light" />
      {!mini && <div class="sv-compass" aria-hidden="true"><span class="n">北</span><i /></div>}
      {title && <div class="sv-title">{title}</div>}
    </div>
  );
}

// ═════════════════ Team board: tracing-paper overlays on a 7×7 frame ═════════════════
// layers: { eid: {x,y,by,t} } ; maps: {eid: map}; marks: [...]
export function TeamBoardView({ explorers, maps, layers, marks = [], issues = [], tool, selected, onSelect, onDrop, onMark, readonly, candidates = [], showCurrent = true }) {
  const ref = useRef(null);
  const [w, setW] = useState(320);
  const [drag, setDrag] = useState(null); // { eid, startX, startY, ox, oy, x, y }
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const cell = w / 7;
  const effective = { ...layers };
  if (drag) effective[drag.eid] = { ...(layers[drag.eid] || {}), x: drag.x, y: drag.y };
  const issueAt = new Map();
  for (const is of issues) issueAt.set(k(is.x, is.y), is);
  const ids = Object.keys(explorers);
  const order = [...ids.filter(id => id !== selected), ...ids.filter(id => id === selected)];

  const clampFor = (eid, x, y) => {
    const m = maps[eid]; let minX = 0, maxX = 0, minY = 0, maxY = 0;
    for (const key of Object.keys(m.discovered)) { const [a, b] = key.split(',').map(Number); minX = Math.min(minX, a); maxX = Math.max(maxX, a); minY = Math.min(minY, b); maxY = Math.max(maxY, b); }
    return { x: Math.max(0 - minX, Math.min(6 - maxX, x)), y: Math.max(0 - minY, Math.min(6 - maxY, y)) };
  };

  const onPointerDown = (e) => {
    if (readonly) return;
    const rect = ref.current.getBoundingClientRect();
    const bx = Math.floor((e.clientX - rect.left) / cell), by = Math.floor((e.clientY - rect.top) / cell);
    if (tool !== 'move') { if (bx >= 0 && by >= 0 && bx < 7 && by < 7) onMark?.(bx, by, tool); return; }
    // pick the topmost layer under the finger, else the selected one
    let target = selected && effective[selected] ? selected : null;
    for (const id of [...order].reverse()) {
      const L = effective[id]; if (!L) continue;
      if (maps[id].discovered[k(bx - L.x, by - L.y)]) { target = id; break; }
    }
    if (!target || !effective[target]) return;
    if (target !== selected) onSelect?.(target);
    e.preventDefault();
    ref.current.setPointerCapture?.(e.pointerId);
    const L = effective[target];
    setDrag({ eid: target, startX: e.clientX, startY: e.clientY, ox: L.x, oy: L.y, x: L.x, y: L.y, moved: false });
  };
  const onPointerMove = (e) => {
    if (!drag) return;
    const dx = Math.round((e.clientX - drag.startX) / cell), dy = Math.round((e.clientY - drag.startY) / cell);
    const c = clampFor(drag.eid, drag.ox + dx, drag.oy + dy);
    if (c.x !== drag.x || c.y !== drag.y) setDrag({ ...drag, x: c.x, y: c.y, moved: true });
  };
  const onPointerUp = () => {
    if (!drag) return;
    const d = drag; setDrag(null);
    if (d.moved && (d.x !== d.ox || d.y !== d.oy)) onDrop?.(d.eid, d.x, d.y);
  };

  const cells = [];
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const ring = x === 0 || y === 0 || x === 6 || y === 6;
    const is = issueAt.get(k(x, y));
    cells.push(<div class={`tb-cell ${ring ? 'ring' : ''} ${is ? 'issue' : ''}`} style={{ left: `${x * cell}px`, top: `${y * cell}px`, width: `${cell}px`, height: `${cell}px` }}>{is && <span class="tb-x" />}</div>);
  }
  return (
    <div class={`tracing ${readonly ? 'readonly' : ''} tool-${tool}`} ref={ref}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      style={{ '--cell': `${cell}px` }}>
      <div class="tb-paper" />
      {cells}
      <span class="tb-ringlabel n">外壁</span><span class="tb-ringlabel s">外壁</span>
      {candidates.map(c => <div class="tb-cand" style={{ left: `${c.x * cell}px`, top: `${c.y * cell}px`, width: `${cell}px`, height: `${cell}px` }} />)}
      {order.map(eid => {
        const L = effective[eid]; if (!L) return null;
        const m = maps[eid], e = explorers[eid];
        return (
          <div class={`tb-layer ${colorClass(e.colorKey)} ${eid === selected ? 'sel' : ''} ${drag?.eid === eid ? 'dragging' : ''}`} key={eid}>
            {Object.entries(m.discovered).map(([key, v]) => {
              const [lx, ly] = key.split(',').map(Number);
              const x = L.x + lx, y = L.y + ly;
              return <div class={`tb-ink ${v === 'wall' ? 'wall' : 'room'} ${v === 'start' ? 'start' : ''}`} style={{ left: `${x * cell}px`, top: `${y * cell}px`, width: `${cell}px`, height: `${cell}px` }}>{v === 'start' && <i>始</i>}</div>;
            })}
            {showCurrent && <div class="tb-cur" style={{ left: `${(L.x + m.localPos.x) * cell}px`, top: `${(L.y + m.localPos.y) * cell}px`, width: `${cell}px`, height: `${cell}px` }}><span class="seal s">{e.label}</span></div>}
          </div>
        );
      })}
      {marks.map(mk => <div class={`tb-mark mk-${mk.kind}`} style={{ left: `${mk.x * cell}px`, top: `${mk.y * cell}px`, width: `${cell}px`, height: `${cell}px` }} title={`${MARK_KINDS[mk.kind]?.label}（${mk.by}）`}><span>{MARK_KINDS[mk.kind]?.sym}</span></div>)}
    </div>
  );
}
