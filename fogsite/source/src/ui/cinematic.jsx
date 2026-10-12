import { skipCine } from './fx.js';
import { Emblem, Icon } from './icons.jsx';
import { colorClass } from './common.jsx';

function Ring({ tone }) {
  return (
    <svg class={`cine-ring ${tone}`} viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" stroke-width="1" stroke-opacity=".5" />
      <circle cx="100" cy="100" r="84" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="2 9" />
      <circle cx="100" cy="100" r="70" fill="none" stroke="currentColor" stroke-width="1" stroke-opacity=".35" stroke-dasharray="40 8 4 8" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map(a => <path d="M100 4v10" stroke="currentColor" stroke-width="2" transform={`rotate(${a} 100 100)`} />)}
    </svg>
  );
}

function CardFace({ card, color, small }) {
  return (
    <div class={`pcard ${card} ${small ? 'small' : ''} ${colorClass(color)}`}>
      <div class="pcard-inner">
        <div class="pcard-back"><span /></div>
        <div class="pcard-front">
          <Icon name={card === 'rest' ? 'moon' : 'eye'} size={small ? 22 : 40} />
          <b>{card === 'rest' ? '休憩' : '警戒'}</b>
        </div>
      </div>
    </div>
  );
}

export function Cinematic({ c }) {
  if (!c) return null;
  const tone = c.tone || 'jade';
  const style = { '--cine-ms': `${c.ms}ms` };
  const common = <>
    {c.title && <h2 class="cine-title">{c.title}</h2>}
    {c.sub && <p class="cine-sub">{c.sub}</p>}
    {c.lines?.filter(Boolean).map(l => <p class="cine-line">{l}</p>)}
  </>;
  let body;
  switch (c.kind) {
    case 'phase':
      body = <div class="cine-center">
        <div class="cine-glyph"><Ring tone={tone} /><span class="cine-numeral">{c.numeral}</span></div>
        {common}
      </div>;
      break;
    case 'ability':
      body = <div class="cine-center">
        <div class={`cine-glyph small ${colorClass(c.color)}`}><Ring tone={tone} /><span class="cine-emblem"><Emblem char={c.char} size={74} /></span></div>
        {common}
      </div>;
      break;
    case 'reveal':
      body = <div class="cine-center">
        <CardFace card={c.card} color={c.color} />
        {common}
      </div>;
      break;
    case 'cards':
      body = <div class="cine-center">
        <h2 class="cine-title">{c.title}</h2>
        <div class="cine-cards">
          {c.rows.map(r => (
            <div class={`cine-cardrow ${colorClass(r.color)}`}>
              <CardFace card={r.card || 'rest'} color={r.color} small />
              <span class="seal s">{r.label}</span><span class="who">{r.label}の探検家</span>
              {r.attacked && <span class="chip ward tiny">攻撃済</span>}
              {r.locked && <span class="chip brass tiny"><Icon name="lock" size={12} />警戒不可</span>}
            </div>
          ))}
        </div>
        {c.sub && <p class="cine-sub">{c.sub}</p>}
      </div>;
      break;
    case 'strike':
      body = <div class="cine-center"><div class="cine-slash" />{common}</div>;
      break;
    case 'suspense':
      body = <div class="cine-center"><div class="cine-glyph"><Ring tone={tone} /><span class="cine-pulse" /></div>{common}</div>;
      break;
    case 'banner':
      body = <div class={`cine-banner ${colorClass(c.color)}`}><div class="cine-banner-inner">{common}</div></div>;
      break;
    default:
      body = <div class="cine-center">{common}</div>;
  }
  return (
    <div class={`cine kind-${c.kind} tone-${tone}`} style={style} onClick={skipCine} role="status" aria-live="assertive" key={c.id}>
      <div class="cine-veil" />
      {body}
    </div>
  );
}
