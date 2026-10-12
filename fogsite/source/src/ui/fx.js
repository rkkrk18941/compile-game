// Turns snapshot events into sound, cinematics, particles, fog pulses and haptics.
import { S, set, setUI, toast } from './store.js';
import { audio } from '../audio/audio.js';
import { CHARACTER_MAP, DIRS, PHASE_EFFECTS, EXPLORER_DEFS } from '../core/constants.js';

let lastId = -1;
let lastRoom = null;
let fog = null, motes = null;
const queue = [];
let showing = null, showTimer = 0;

export function bindFx(f, m) { fog = f; motes = m; }
export function resetFx() { lastId = -1; lastRoom = null; queue.length = 0; showing = null; clearTimeout(showTimer); set({ cine: null }); }

const idNum = (id) => parseInt(String(id).slice(1), 36) || 0;
const label = (snap, eid) => snap.explorers?.[eid]?.label || '';
const colorOf = (snap, eid) => snap.explorers?.[eid]?.colorKey || null;
const mine = (snap, eid) => (snap.you?.ownedExplorerIds || []).includes(eid);
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

export function haptic(pattern) {
  if (!S().settings.haptics) return;
  try { navigator.vibrate?.(pattern); } catch { /* ignore */ }
}
export function shake(strength = 1) {
  if (S().settings.reduced) return;
  const el = document.getElementById('root');
  if (!el) return;
  el.classList.remove('shake', 'shake-hard');
  void el.offsetWidth;
  el.classList.add(strength > 1 ? 'shake-hard' : 'shake');
  setTimeout(() => el.classList.remove('shake', 'shake-hard'), 650);
}
function flash(color, amt = 1) { fog?.flash(color, amt); }

// ───────── cinematic queue ─────────
export function cine(c) {
  const quality = S().settings.quality;
  const ms = Math.round((c.ms || 2000) * (quality === 'low' ? 0.7 : 1));
  if (c.replace) queue.length = 0;
  queue.push({ ...c, ms, id: Math.random().toString(36).slice(2) });
  if (queue.length > 6) queue.splice(0, queue.length - 6);
  drain();
}
function drain() {
  if (showing || !queue.length) return;
  showing = queue.shift();
  set({ cine: showing });
  showing.onShow?.();
  showTimer = setTimeout(() => { showing = null; set({ cine: null }); setTimeout(drain, 160); }, showing.ms);
}
export function skipCine() {
  if (!showing || showing.locked) return;
  clearTimeout(showTimer);
  showing = null; set({ cine: null });
  setTimeout(drain, 80);
}

// ───────── mood ─────────
function applyMood(snap) {
  const st = snap.stage, phase = snap.time?.phase || 1;
  const tint = { 1: [0.5, 0.66, 0.6], 2: [0.44, 0.57, 0.68], 3: [0.64, 0.6, 0.42], 4: [0.74, 0.36, 0.33] }[phase];
  if (st === 'lobby' || st === 'setup') { audio.setMood('title', 0); fog?.setMood({ tint: [0.5, 0.66, 0.6], density: 0.95 }); audio.setHeartbeat(false); return; }
  if (st === 'gameover') {
    const youWin = (snap.winner === 'ruins') === (snap.you.role === 'ruins');
    audio.setMood(youWin ? 'victory' : 'defeat', 0); audio.setHeartbeat(false);
    fog?.setMood({ tint: youWin ? [0.85, 0.72, 0.45] : [0.45, 0.2, 0.22], density: youWin ? 0.7 : 1.15 });
    return;
  }
  const expired = snap.time?.expired;
  audio.setMood(st === 'ruinsTurn' ? 'ruins' : 'explore', Math.min(3, phase - 1 + (expired ? 1 : 0)));
  audio.setHeartbeat(snap.time?.total <= 8);
  fog?.setMood({ tint: expired ? [0.6, 0.22, 0.24] : tint, density: st === 'ruinsTurn' ? 1.15 : 1 });
}

// ───────── main entry ─────────
export function onSnapshot(prev, snap) {
  if (!snap) return;
  if (snap.roomCode !== lastRoom || !prev) {
    lastRoom = snap.roomCode;
    lastId = Math.max(-1, ...(snap.events || []).map(e => idNum(e.id)));
    applyMood(snap);
    return;
  }
  applyMood(snap);
  const fresh = (snap.events || []).filter(e => idNum(e.id) > lastId).sort((a, b) => idNum(a.id) - idNum(b.id));
  if (!fresh.length) return;
  lastId = idNum(fresh[fresh.length - 1].id);
  // collapse bursts of time ticks
  let timeTotal = 0;
  for (const ev of fresh) {
    if (ev.kind === 'time') { timeTotal += ev.amount; continue; }
    handle(ev, snap, prev);
  }
  if (timeTotal) {
    audio.play('tick', { n: timeTotal });
    set(s => ({ timePop: { n: timeTotal, k: (s.timePop?.k || 0) + 1 } }));
  }
}

function handle(ev, snap) {
  const role = snap.you.role;
  const me = snap.you.clientId;
  switch (ev.kind) {
    case 'start': {
      const c = ev.clue;
      cine({ kind: 'title', tone: 'jade', title: '探索開始', sub: '霧の遺跡に、探検家たちが散り散りに迷い込んだ', lines: c ? [`最初の手掛かり：石室の衛兵から${label(snap, c.target)}の探検家まで 最短 ${c.distance} マス`] : [], ms: 3600 });
      audio.play('round');
      break;
    }
    case 'round':
      if (ev.round > 1) cine({ kind: 'banner', tone: ev.final ? 'ward' : 'jade', title: ev.final ? '最終ラウンド' : `第${ev.round}ラウンド`, sub: ev.final ? '迷宮マスは尽きた。移動だけで最後の合流を' : '探検家の手番', ms: ev.final ? 2600 : 1500 });
      audio.play('round');
      break;
    case 'turn':
      if (mine(snap, ev.eid)) {
        cine({ kind: 'banner', tone: 'brass', color: colorOf(snap, ev.eid), title: 'あなたの手番', sub: `${label(snap, ev.eid)}の探検家`, ms: 1300 });
        audio.play('yourTurn'); haptic([20, 40, 30]);
      } else audio.play('turn');
      break;
    case 'explore':
      if (role === 'ruins' || mine(snap, ev.eid) || role === 'explorer') {
        const own = mine(snap, ev.eid);
        if (ev.result === 'open') audio.play(own ? 'reveal' : 'step');
        else { audio.play('thud'); if (own) { shake(1); haptic(60); } }
      }
      break;
    case 'move':
      if (mine(snap, ev.eid)) audio.play('walk', { n: 2 });
      break;
    case 'encounter':
      cine({ kind: 'strike', tone: 'ward', color: colorOf(snap, ev.eid), title: '遭遇', sub: `${label(snap, ev.eid)}の探検家が、霧の中で何かとすれ違った`, lines: ['時間 −1'], ms: 2100 });
      audio.play('encounter'); flash([0.7, 0.1, 0.06], 0.55); haptic([40, 60, 40]);
      break;
    case 'encounterCheck':
      if (role === 'ruins') { audio.play('ping'); haptic(25); }
      break;
    case 'abilityAsk':
      audio.play('ability');
      break;
    case 'ability': abilityCine(ev, snap); break;
    case 'phase': {
      const p = ev.phase;
      const eff = PHASE_EFFECTS[ev.ended];
      if (p >= 5) cine({ kind: 'phase', tone: 'ward', numeral: '∅', title: '迷宮マスが尽きた', lines: ['探索はもうできない', '最後の脱出の機会だけが残る'], ms: 4200, replace: false });
      else cine({ kind: 'phase', tone: p === 4 ? 'violet' : 'brass', numeral: ROMAN[p], title: `フェイズ ${p}`, lines: eff?.lines || [], ms: 3800 });
      audio.play('phase'); flash(p >= 4 ? [0.5, 0.12, 0.5] : [0.6, 0.45, 0.15], 0.45); haptic([30, 80, 30, 80, 60]);
      break;
    }
    case 'stage':
      if (ev.stage === 'ruinsTurn') {
        if (role === 'ruins') setUI({ selectedGuard: null }); // a fresh turn re-offers the obvious guard
        cine({ kind: 'banner', tone: 'ward', title: '遺跡役の手番', sub: role === 'ruins' ? `移動トークン ${ev.tokens} 枚。衛兵を動かして探検家を襲え` : '霧の奥で、何かが動き出す…', ms: 1800 });
        audio.play('whoosh');
      } else if (ev.stage === 'escape') {
        cine({ kind: 'banner', tone: 'jade', title: '脱出の相談', sub: '全員が同じ部屋にいると確信できるなら、脱出を', ms: 1500 });
      } else if (ev.stage === 'finalEscape') {
        cine({ kind: 'banner', tone: 'ward', title: '最後の脱出', sub: '時間は尽きた。全員で同じ部屋にいることを祈れ', ms: 2400 });
      } else if (ev.stage === 'prediction') {
        cine({ kind: 'banner', tone: 'jade', title: '行動予測', sub: role === 'ruins' ? '探検家が休憩か警戒かを伏せています' : '休憩するか、警戒するか。カードを伏せよう', ms: 1500 });
      }
      break;
    case 'ruinsMove':
      audio.play('rumble'); haptic(15);
      break;
    case 'enemyMove':
      audio.play('stoneMove');
      break;
    case 'attackDeclared':
      cine({ kind: 'strike', tone: 'ward', color: colorOf(snap, ev.eid), title: '衛兵の攻撃', sub: `${label(snap, ev.eid)}の探検家が狙われた`, lines: ['伏せたカードを公開…'], ms: 1700, locked: true });
      audio.play('attackDeclare'); haptic([30, 30, 30]);
      break;
    case 'attack': attackCine(ev, snap); break;
    case 'predictReveal': predictCine(ev, snap); break;
    case 'vote': audio.play('select'); break;
    case 'escapeAttempt':
      cine({ kind: 'suspense', tone: 'brass', title: '脱出を試みる', sub: '霧が晴れていく…', ms: 2400, locked: true, onShow: () => audio.play('drumroll') });
      cine({
        kind: 'result', tone: ev.success ? 'brass' : 'ward', title: ev.success ? '脱出成功' : '脱出失敗',
        sub: ev.success ? '全員が同じ部屋にいた' : (ev.final ? '時間切れ。霧はすべてを呑みこんだ' : '同じ部屋にいない探検家がいた'),
        ms: 3000, onShow: () => { audio.play(ev.success ? 'success' : 'fail'); if (ev.success) motes?.burst(innerWidth / 2, innerHeight / 2, '255,214,140', 70, 260); else flash([0.6, 0.06, 0.05], 1); },
      });
      break;
    case 'gameover':
      if (!snap.events.some(e => e.kind === 'escapeAttempt')) cine({ kind: 'result', tone: ev.winner === 'explorers' ? 'brass' : 'ward', title: ev.winner === 'explorers' ? '探検家の勝利' : '遺跡の勝利', sub: snap.resultText || '', ms: 2600 });
      break;
    case 'chat':
      if (ev.from !== me) {
        audio.play('chat');
        if (S().ui.tab !== 'talk') set(s => ({ unread: s.unread + 1 }));
        if (ev.stamp) toast(`${ev.name}：${ev.text}`, 'stamp', 2600);
      }
      break;
    case 'mark': if (ev.by !== snap.you.name) audio.play('ping'); break;
    case 'join': audio.play('join'); toast(`${ev.name} が参加しました`, 'info'); break;
    case 'disconnect': toast(`${ev.name} の接続が切れました（自動で再接続を待ちます）`, 'error', 4200); break;
    case 'reconnect': toast(`${ev.name} が戻ってきました`, 'info'); break;
    case 'hand': if (ev.wants && role === 'explorer') audio.play('ping'); break;
    default: break;
  }
}

function abilityCine(ev, snap) {
  const c = CHARACTER_MAP[ev.char];
  const who = `${label(snap, ev.eid)}の探検家${ev.via ? '（見習いが複製）' : ''}`;
  let result = '';
  if (ev.char === 'geographer') result = ev.results.map(r => `${DIRS[r.dir].label}は${r.cell === 'open' ? '部屋' : '壁'}`).join('　');
  else if (ev.char === 'archaeologist') result = `${DIRS[ev.dir].label}の壁は「${ev.wall === 'outer' ? '外壁' : '内壁'}」`;
  else if (ev.char === 'doctor') result = `${label(snap, ev.target)}の探検家の疲労が回復した`;
  else if (ev.char === 'monk') result = `${DIRS[ev.dir].label}の果てまでに内壁が ${ev.count} 個`;
  else if (ev.char === 'guide') result = `${label(snap, ev.target)}の探検家は「${DIRS[ev.dir].label}」の方角にいる`;
  else if (ev.char === 'mercenary') result = `動けなくなった衛兵：${ev.count} 体`;
  cine({ kind: 'ability', tone: 'brass', char: ev.char, color: colorOf(snap, ev.eid), title: c?.name || '能力', sub: who, lines: [result], ms: 3000 });
  audio.play('ability');
}

function attackCine(ev, snap) {
  const name = `${label(snap, ev.eid)}の探検家`;
  if (ev.type === 'super') {
    cine({ kind: 'strike', tone: 'violet', color: colorOf(snap, ev.eid), title: '守護神の超攻撃', sub: `${name}に命中。警戒は通じない`, lines: ['時間 −3'], ms: 2600, onShow: () => { audio.play('superhit'); setTimeout(() => { shake(2); flash([0.55, 0.1, 0.6], 1); haptic([80, 50, 120]); }, 520); } });
  } else if (ev.result === 'hit') {
    cine({ kind: 'reveal', tone: 'ward', card: 'rest', color: colorOf(snap, ev.eid), title: '命中', sub: `${name}は休憩していた`, lines: ['時間 −3'], ms: 2500, onShow: () => { audio.play('flip'); setTimeout(() => { audio.play('hit'); shake(2); flash([0.75, 0.1, 0.05], 1); haptic([90, 40, 90]); }, 380); } });
  } else {
    cine({ kind: 'reveal', tone: 'jade', card: 'alert', color: colorOf(snap, ev.eid), title: '防御', sub: `${name}は警戒していた`, lines: ['攻撃を防いだ'], ms: 2300, onShow: () => { audio.play('flip'); setTimeout(() => audio.play('block'), 380); } });
  }
}

function predictCine(ev, snap) {
  const res = ev.results || {};
  const rows = Object.keys(res).map(eid => ({ eid, color: colorOf(snap, eid), label: label(snap, eid), card: res[eid].card, attacked: res[eid].attacked, locked: !res[eid].attacked && res[eid].card === 'alert' }));
  const locks = rows.filter(r => r.locked);
  cine({ kind: 'cards', tone: 'jade', title: '予測カード公開', rows, sub: locks.length ? `${locks.map(r => r.label).join('・')}の警戒は空振り。次は警戒できない` : '遺跡役の手番が終わった', ms: 2900, onShow: () => { audio.play('flip'); if (locks.length) setTimeout(() => audio.play('lock'), 500); } });
}

export const explorerDef = (id) => EXPLORER_DEFS.find(d => d.id === id);
