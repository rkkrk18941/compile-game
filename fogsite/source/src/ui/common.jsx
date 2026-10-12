import { useEffect, useRef, useState } from 'preact/hooks';
import { S, set, closeSheet, markCoach } from './store.js';
import { audio } from '../audio/audio.js';
import { Icon, Emblem } from './icons.jsx';
import { CHARACTER_MAP, EXPLORER_DEFS } from '../core/constants.js';

export function Btn({ kind = '', size = '', block, sound = 'tap', onClick, children, class: cls = '', disabled, title, ...rest }) {
  return (
    <button
      type="button"
      class={`btn ${kind} ${size} ${block ? 'block' : ''} ${cls}`}
      disabled={disabled}
      title={title}
      onClick={(e) => { if (disabled) return; if (sound) audio.play(sound); onClick?.(e); }}
      {...rest}
    >{children}</button>
  );
}

export function Seg({ value, options, onChange, small }) {
  return (
    <div class={`seg ${small ? 'small' : ''}`} role="radiogroup">
      {options.map(o => (
        <button type="button" role="radio" aria-checked={value === o.value} class={value === o.value ? 'on' : ''} onClick={() => { audio.play('tap'); onChange(o.value); }} disabled={o.disabled}>
          {o.label}{o.sub && <span class="sub">{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label, sub }) {
  return (
    <label class={`toggle ${on ? 'on' : ''}`} onClick={(e) => { e.preventDefault(); audio.play('tap'); onChange(!on); }}>
      <span class="knob" role="switch" aria-checked={!!on} tabIndex={0} onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange(!on); } }} />
      <span class="grow"><span>{label}</span>{sub && <span class="tiny muted" style="display:block">{sub}</span>}</span>
    </label>
  );
}

export function colorClass(colorKey) { return colorKey ? `c-${colorKey}` : ''; }
export function explorerColor(eid) { return EXPLORER_DEFS.find(d => d.id === eid)?.colorKey; }

export function Seal({ eid, colorKey, label, size = '', glyph = true }) {
  const def = EXPLORER_DEFS.find(d => d.id === eid);
  const ck = colorKey || def?.colorKey;
  return <span class={`seal ${size} ${colorClass(ck)}`} aria-label={label || def?.name}>{glyph ? (label ?? def?.label ?? '') : ''}</span>;
}

export function CharacterBadge({ char }) {
  const c = CHARACTER_MAP[char];
  if (!c) return null;
  return <span class="chip brass charbadge"><Emblem char={char} size={16} />{c.name}</span>;
}

export function Sheet({ title, children, onClose, wide, tone = '' }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') (onClose || closeSheet)(); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  return (
    <div class="sheet-back" onClick={(e) => { if (e.target === e.currentTarget) (onClose || closeSheet)(); }}>
      <div class={`sheet ${wide ? 'wide' : ''} ${tone}`} role="dialog" aria-modal="true" aria-label={title}>
        <div class="sheet-grip" />
        <div class="sheet-head">
          <h3>{title}</h3>
          <button type="button" class="btn ghost iconbtn" aria-label="閉じる" onClick={() => { audio.play('back'); (onClose || closeSheet)(); }}><Icon name="close" /></button>
        </div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Toasts({ toasts }) {
  return (
    <div class="toasts" aria-live="polite">
      {toasts.map(t => <div key={t.id} class={`toast ${t.kind}`}>{t.kind === 'error' && <Icon name="warn" size={18} />}{t.kind === 'stamp' && <Icon name="chat" size={18} />}<span>{t.text}</span></div>)}
    </div>
  );
}

// Coach hint bubble (shown once per key while coach mode is on).
export function Coach({ id, children, when = true }) {
  const st = S();
  if (!when || !st.settings.coach || st.coachSeen[id]) return null;
  return (
    <div class="coach" role="note">
      <Icon name="lantern" size={18} />
      <div class="grow">{children}</div>
      <button type="button" class="btn ghost tiny" onClick={() => { audio.play('tap'); markCoach(id); }}>わかった</button>
    </div>
  );
}

export function Countdown({ deadline, total = 30000 }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  if (!deadline) return null;
  const left = Math.max(0, deadline - now);
  return (
    <div class="countdown" aria-label={`あと${Math.ceil(left / 1000)}秒で自動決定`}>
      <i style={{ width: `${(left / total) * 100}%` }} />
      <span>{Math.ceil(left / 1000)}秒後に自動で決定</span>
    </div>
  );
}

export function useNow(ms = 500) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

// Animated number (counts toward the target).
export function AnimNum({ value }) {
  const [shown, setShown] = useState(value);
  const ref = useRef(value);
  useEffect(() => {
    const from = ref.current, to = value;
    if (from === to) return;
    const t0 = performance.now(), dur = 520;
    let raf;
    const step = (t) => { const k = Math.min(1, (t - t0) / dur); const v = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))); setShown(v); if (k < 1) raf = requestAnimationFrame(step); else ref.current = to; };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); ref.current = to; };
  }, [value]);
  return <span class="num">{shown}</span>;
}

export function Empty({ icon = 'info', children }) {
  return <div class="empty"><Icon name={icon} size={20} /><div>{children}</div></div>;
}

export function sheetSet(kind, extra = {}) { set({ sheet: { kind, ...extra } }); }
