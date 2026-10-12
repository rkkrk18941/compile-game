// Inline SVG icon set (24px grid, 1.8 stroke) + character emblems (48px grid).
const P = { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };

const paths = {
  hourglass: <g {...P}><path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9" /><path d="M9 18.5c1-1.2 5-1.2 6 0" /></g>,
  compass: <g {...P}><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></g>,
  steps: <g {...P}><path d="M8 4c1.5 0 2.5 2 2.5 4.5S9.4 13 8 13s-2.5-2-2.5-4.5S6.5 4 8 4zM6.5 15.5h3l-.3 2.6c-.2 1.1-2.2 1.1-2.4 0z" /><path d="M16 8c1.5 0 2.5 2 2.5 4.5S17.4 17 16 17s-2.5-2-2.5-4.5S14.5 8 16 8zM14.5 19.5h3" /></g>,
  search: <g {...P}><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5" /></g>,
  wall: <g {...P}><rect x="3" y="5" width="18" height="14" rx="1.5" /><path d="M3 9.7h18M3 14.3h18M9 5v4.7M15 5v4.7M6 9.7v4.6M12 9.7v4.6M18 9.7v4.6M9 14.3V19M15 14.3V19" /></g>,
  lantern: <g {...P}><path d="M9 4h6M10 4V2.5h4V4M8 6h8l-1 12H9z" /><path d="M8 18h8v2.5H8zM12 9.5c1.3 1.4 1.3 3 0 4.5-1.3-1.5-1.3-3.1 0-4.5z" /></g>,
  eye: <g {...P}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></g>,
  shield: <g {...P}><path d="M12 3l7.5 3v5.5c0 4.5-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5-7.5-9.5V6z" /><path d="M9 12l2 2 4-4.5" /></g>,
  moon: <g {...P}><path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z" /></g>,
  sword: <g {...P}><path d="M14.5 3.5H20v5.5L9.5 19.5l-5-5z" /><path d="M7 12l5 5M4.5 17.5L3 21l3.5-1.5" /></g>,
  crown: <g {...P}><path d="M4 18h16M5 18L3.5 7l5 4L12 5l3.5 6 5-4L19 18" /></g>,
  guard: <g {...P}><path d="M5.5 20.5V11l2.2-4.6h8.6l2.2 4.6v9.5z" /><path d="M8.6 11.6h2.4M13 11.6h2.4" stroke-width="2.4" /><path d="M9.5 16.2h5M12 6.4V3.6" /></g>,
  guardian: <g {...P}><path d="M5 20.5v-9l2.6-3.2 2.2 2.1L12 5.6l2.2 4.8 2.2-2.1 2.6 3.2v9z" /><path d="M8.6 13.4h2.4M13 13.4h2.4" stroke-width="2.4" /><path d="M9.4 17.4h5.2" /></g>,
  chat: <g {...P}><path d="M4 5.5h16v10H10l-4.5 3.5v-3.5H4z" /></g>,
  map: <g {...P}><path d="M3.5 6.5l5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2z" /><path d="M9 4.5v13M15 6.5v13" /></g>,
  layers: <g {...P}><path d="M12 3.5l9 4.5-9 4.5L3 8z" /><path d="M3 12.5l9 4.5 9-4.5M3 16.5l9 4.5 9-4.5" /></g>,
  scroll: <g {...P}><path d="M7 4h11a2 2 0 0 1 2 2v1h-4M7 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7" /><path d="M8.5 9h6M8.5 12.5h6M8.5 16h4" /></g>,
  gear: <g {...P}><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2L5.5 5.5" /></g>,
  sound: <g {...P}><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.6 7.6 0 0 1 0 11" /></g>,
  mute: <g {...P}><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M16 9.5l5 5M21 9.5l-5 5" /></g>,
  menu: <g {...P}><path d="M4 7h16M4 12h16M4 17h16" /></g>,
  close: <g {...P}><path d="M6 6l12 12M18 6L6 18" /></g>,
  check: <g {...P}><path d="M5 12.5l4.5 4.5L19 7.5" /></g>,
  warn: <g {...P}><path d="M12 3.5l9.5 16.5h-19z" /><path d="M12 10v4.5M12 17.5v.5" /></g>,
  hand: <g {...P}><path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v7.5c0 4-2.6 7-6.4 7-2.7 0-4.2-1.4-5.6-3.6L3.6 13a1.5 1.5 0 0 1 2.6-1.4L8 14" /></g>,
  exit: <g {...P}><path d="M14 4h5v16h-5" /><path d="M10 8l-4 4 4 4M6 12h10" /></g>,
  door: <g {...P}><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M3 21h18" /><circle cx="15" cy="12.5" r="1" fill="currentColor" /></g>,
  star: <g {...P}><path d="M12 3.5l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9L6.7 20l1.1-6-4.4-4.2 6-.8z" /></g>,
  question: <g {...P}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.2-2.5 4M12 17.2v.3" /></g>,
  pin: <g {...P}><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" /></g>,
  rotate: <g {...P}><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.5 4v4.5H15" /></g>,
  dice: <g {...P}><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9" cy="9" r="1.1" fill="currentColor" /><circle cx="15" cy="15" r="1.1" fill="currentColor" /><circle cx="15" cy="9" r="1.1" fill="currentColor" /><circle cx="9" cy="15" r="1.1" fill="currentColor" /></g>,
  trash: <g {...P}><path d="M4.5 7h15M9 7V4.5h6V7M6.5 7l1 13h9l1-13" /></g>,
  copy: <g {...P}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" /></g>,
  share: <g {...P}><circle cx="18" cy="5.5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="18.5" r="2.5" /><path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1" /></g>,
  user: <g {...P}><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20.5c1.2-3.8 4-5.5 7.5-5.5s6.3 1.7 7.5 5.5" /></g>,
  users: <g {...P}><circle cx="9" cy="8.5" r="3.3" /><path d="M2.8 19.5c1-3.3 3.3-4.8 6.2-4.8s5.2 1.5 6.2 4.8" /><path d="M15.5 5.5a3.2 3.2 0 0 1 0 6.2M17.5 14.9c1.9.6 3.2 2 3.8 4.6" /></g>,
  robot: <g {...P}><rect x="5" y="8" width="14" height="11" rx="3" /><path d="M12 4.5V8M9 13h.01M15 13h.01M9.5 16.5h5M3 13v2M21 13v2" /></g>,
  info: <g {...P}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.8v.3" /></g>,
  play: <g {...P}><path d="M8 5.5l10.5 6.5L8 18.5z" /></g>,
  pause: <g {...P}><path d="M8.5 5.5v13M15.5 5.5v13" /></g>,
  book: <g {...P}><path d="M12 6.5C10 5 7 4.5 3.5 5v13.5C7 18 10 18.5 12 20c2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z" /><path d="M12 6.5V20" /></g>,
  arrowN: <g {...P}><path d="M12 19V5M6 11l6-6 6 6" /></g>,
  arrowE: <g {...P}><path d="M5 12h14M13 6l6 6-6 6" /></g>,
  arrowS: <g {...P}><path d="M12 5v14M6 13l6 6 6-6" /></g>,
  arrowW: <g {...P}><path d="M19 12H5M11 6l-6 6 6 6" /></g>,
  move: <g {...P}><path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" /></g>,
  eraser: <g {...P}><path d="M16.5 4.5l4 4L10 19H5.5l-2-2z" /><path d="M9 8l7 7M5.5 19H20" /></g>,
  lock: <g {...P}><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></g>,
  spark: <g {...P}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" /></g>,
  qr: <g {...P}><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2.5v2.5H14zM18 18h2M20 14v2M14 20h2" /></g>,
};

export function Icon({ name, size = 22, className = '', title, style }) {
  return (
    <svg class={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden={title ? undefined : 'true'} role={title ? 'img' : undefined} style={style}>
      {title && <title>{title}</title>}
      {paths[name] || paths.question}
    </svg>
  );
}

// ───────── character emblems ─────────
const E = { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
const emblems = {
  guide: <g {...E}><circle cx="24" cy="24" r="17" /><circle cx="24" cy="24" r="12.5" stroke-dasharray="1.5 3" /><path d="M24 6.5v4M24 37.5v4M41.5 24h-4M10.5 24h-4" /><path d="M24 12.5l4.2 11.5L24 35.5 19.8 24z" /><path d="M24 12.5l4.2 11.5h-8.4z" fill="currentColor" fill-opacity=".35" /><circle cx="24" cy="24" r="1.8" fill="currentColor" /></g>,
  geographer: <g {...E}><path d="M8 13l10.5-4 11 4L40 9v26l-10.5 4-11-4L8 39z" /><path d="M18.5 9v26M29.5 13v26" /><path d="M11.5 20.5h4M11.5 26h4M22 17h4M33 22h4M22 30h4" stroke-opacity=".6" /><path d="M34 16.5c0 3-3 6.5-3 6.5s-3-3.5-3-6.5a3 3 0 0 1 6 0z" fill="currentColor" fill-opacity=".3" /></g>,
  archaeologist: <g {...E}><path d="M9 33.5l9-12 8 4.5 6-8 7 15.5z" fill="currentColor" fill-opacity=".14" /><path d="M14 28.5l3 1.5M24 30l2-3" /><path d="M31.5 7.5l6 6-12.5 12.5-6-6z" /><path d="M19 20l-7.5 7.5" /><path d="M8.5 39.5h31" /></g>,
  doctor: <g {...E}><path d="M10 17h28a2 2 0 0 1 2 2v17a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3V19a2 2 0 0 1 2-2z" /><path d="M18 17v-3.5a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3V17" /><path d="M24 22v11M18.5 27.5h11" stroke-width="2.6" /></g>,
  mercenary: <g {...E}><path d="M24 6.5l13 5v10c0 8.5-5.6 15-13 19-7.4-4-13-10.5-13-19v-10z" /><path d="M17 17l14 14M31 17L17 31" /><path d="M15.5 15.5l3 3M32.5 15.5l-3 3" /></g>,
  monk: <g {...E}><circle cx="24" cy="24" r="16" stroke-dasharray="0.1 4.2" stroke-width="3.2" /><path d="M12 24s5-7 12-7 12 7 12 7-5 7-12 7-12-7-12-7z" /><circle cx="24" cy="24" r="3.4" fill="currentColor" fill-opacity=".55" /><path d="M24 40v4.5M21.5 44.5h5" /></g>,
  apprentice: <g {...E}><path d="M24 15.5c-3.5-2.5-8.5-3-14-2v23c5.5-1 10.5-.5 14 2 3.5-2.5 8.5-3 14-2v-23c-5.5-1-10.5-.5-14 2z" /><path d="M24 15.5v23" /><path d="M36.5 4.5c-5 2.5-9.5 8-11 15l1.8.8c2.6-5.7 6.2-10.4 10.2-13.3" /><path d="M27 21.5l-1.5 3.5" /></g>,
};
export function Emblem({ char, size = 48, className = '' }) {
  return <svg class={`emblem ${className}`} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">{emblems[char] || emblems.guide}</svg>;
}

// Logo mark: a labyrinth sigil inside a ring.
export function LogoMark({ size = 84 }) {
  return (
    <svg class="logomark" width={size} height={size} viewBox="0 0 96 96" aria-hidden="true">
      <defs>
        <linearGradient id="lmg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6d796" /><stop offset="1" stop-color="#b9853a" /></linearGradient>
      </defs>
      <g fill="none" stroke="url(#lmg)" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="48" cy="48" r="44" stroke-width="1.5" stroke-opacity=".7" />
        <circle cx="48" cy="48" r="39" stroke-width="1" stroke-dasharray="1 4" stroke-opacity=".7" />
        <path stroke-width="3.2" d="M28 28h40v40H36V36h24v24H44V44h8" />
        <path stroke-width="1.4" stroke-opacity=".55" d="M48 4v8M48 84v8M4 48h8M84 48h8" />
      </g>
      <circle cx="52" cy="48" r="3.2" fill="#f6d796" />
    </svg>
  );
}
