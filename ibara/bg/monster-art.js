/* Monster portraits for enemies that have no rendered sprite in this build (Acts II–IV). Original vector drawings in
   the spirit of each enemy's appearance; see ART_CREDITS.md. Each entry is an inline SVG (viewBox 0 0 200 200). */
(function (root) {
'use strict';
var STS = root.STS || (root.STS = {});
var M = STS.MonsterArt = STS.MonsterArt || {};
var O = ' stroke="#140c0a" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"';
function svg(body, defs) {
  return '<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">' + (defs ? '<defs>' + defs + '</defs>' : '') +
    '<ellipse cx="100" cy="188" rx="62" ry="9" fill="rgba(0,0,0,.45)"/>' + body + '</svg>';
}
function rg(id, a, b) { return '<radialGradient id="' + id + '" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></radialGradient>'; }
function lg(id, a, b) { return '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient>'; }
function eye(x, y, r, c) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + (c || '#fff6c0') + '"/><circle cx="' + x + '" cy="' + y + '" r="' + (r * 0.45) + '" fill="#140c0a"/>'; }

/* ---------------- Act II ---------------- */
M.chosen = svg(
  '<path d="M60 186 L72 92 Q100 62 128 92 L140 186 Z" fill="url(#chR)"' + O + '/>' +
  '<path d="M74 96 Q100 40 126 96 Q114 84 100 84 Q86 84 74 96 Z" fill="#20305e"' + O + '/>' +
  '<ellipse cx="100" cy="92" rx="17" ry="20" fill="#f1ead8"' + O + '/>' +
  '<path d="M90 88 h7 M103 88 h7" stroke="#140c0a" stroke-width="3"/><path d="M94 102 q6 4 12 0" stroke="#7a1d12" stroke-width="2.5" fill="none"/>' +
  '<path d="M58 120 Q40 100 46 70" fill="none" stroke="#c9a14a" stroke-width="5"/><circle cx="46" cy="66" r="8" fill="#e05a3a"' + O + '/>' +
  '<path d="M80 140 Q100 150 120 140" fill="none" stroke="#c9a14a" stroke-width="4"/>',
  lg('chR', '#3b58a8', '#16224a'));
M.byrd = svg(
  '<path d="M100 150 Q58 150 52 112 Q50 80 86 72 Q118 66 132 92 Q144 126 116 148 Z" fill="url(#byR)"' + O + '/>' +
  '<path d="M60 112 Q22 92 18 60 Q48 76 70 92 Z" fill="#5a4aa8"' + O + '/><path d="M138 108 Q176 88 182 56 Q152 74 128 92 Z" fill="#5a4aa8"' + O + '/>' +
  '<path d="M124 90 L170 104 L126 112 Z" fill="#f0b840"' + O + '/>' + eye(110, 88, 8) +
  '<path d="M84 150 v22 M98 152 v22 M80 172 h8 M94 174 h8" stroke="#f0b840" stroke-width="4"/>' +
  '<path d="M84 70 Q90 50 104 56 Q96 62 98 72" fill="#7a68d0"' + O + '/>',
  rg('byR', '#8a7ae0', '#3a2a7a'));
M.centurion = svg(
  '<path d="M66 186 L72 116 Q100 100 128 116 L134 186 Z" fill="#7a2a1a"' + O + '/>' +
  '<path d="M70 120 Q100 104 130 120 L126 160 Q100 170 74 160 Z" fill="url(#ceR)"' + O + '/>' +
  '<path d="M76 70 Q100 40 124 70 L122 104 Q100 112 78 104 Z" fill="url(#ceR)"' + O + '/>' +
  '<path d="M86 82 h28 v8 h-28 z" fill="#140c0a"/><path d="M100 40 Q118 24 132 34 Q116 36 104 48" fill="#c43a2a"' + O + '/>' +
  '<path d="M40 112 Q36 150 58 172 Q74 150 70 110 Q54 104 40 112 Z" fill="#c9962a"' + O + '/><circle cx="55" cy="138" r="7" fill="#7a2a1a"/>' +
  '<path d="M150 70 L136 170" stroke="#d8d0c0" stroke-width="7"/><path d="M146 66 l8 -4 2 10 z" fill="#d8d0c0"' + O + '/>',
  lg('ceR', '#e8c066', '#8a5a1c'));
M.mystic = svg(
  '<path d="M62 186 Q70 110 100 86 Q130 110 138 186 Z" fill="url(#myR)"' + O + '/>' +
  '<path d="M78 98 Q100 46 122 98 Q100 88 78 98 Z" fill="#e8e0f8"' + O + '/>' +
  '<ellipse cx="100" cy="98" rx="13" ry="14" fill="#2a1a3a"/><circle cx="95" cy="96" r="2.5" fill="#9ef0ff"/><circle cx="105" cy="96" r="2.5" fill="#9ef0ff"/>' +
  '<path d="M146 60 L132 184" stroke="#b08a50" stroke-width="5"/><circle cx="147" cy="56" r="11" fill="url(#myG)"' + O + '/>' +
  '<path d="M76 130 Q100 140 124 130" fill="none" stroke="#c9a14a" stroke-width="4"/>',
  lg('myR', '#f4f0ff', '#8a7aa8') + rg('myG', '#ffffff', '#5ad0ff'));
M['shelled-parasite'] = svg(
  '<path d="M36 170 Q30 96 100 70 Q170 96 164 170 Z" fill="url(#spR)"' + O + '/>' +
  '<path d="M52 160 Q50 110 100 92 M148 160 Q150 110 100 92 M100 92 V168" fill="none" stroke="#2a4a20" stroke-width="3"/>' +
  '<path d="M100 72 Q120 40 150 50 Q132 56 126 74" fill="#e88aa0"' + O + '/><circle cx="148" cy="50" r="7" fill="#e88aa0"' + O + '/>' +
  '<path d="M70 168 q-4 14 -14 18 M130 168 q4 14 14 18" stroke="#140c0a" stroke-width="5" fill="none"/>',
  rg('spR', '#9ad070', '#3a6a28'));
M['snake-plant'] = svg(
  '<path d="M70 186 Q60 160 76 150 L124 150 Q140 160 130 186 Z" fill="#7a4a2a"' + O + '/>' +
  '<path d="M100 150 Q96 110 70 90 M100 150 Q106 104 132 82 M100 150 Q100 120 100 70" fill="none" stroke="#3a8a3a" stroke-width="9"/>' +
  '<path d="M52 92 Q66 70 86 86 Q70 106 52 92 Z" fill="url(#snR)"' + O + '/><path d="M118 80 Q136 56 154 76 Q136 96 118 80 Z" fill="url(#snR)"' + O + '/>' +
  '<path d="M84 64 Q100 40 116 64 Q100 86 84 64 Z" fill="url(#snR)"' + O + '/>' +
  '<path d="M58 90 l8 -2 M124 78 l10 -2 M92 64 l16 0" stroke="#fff" stroke-width="2.5"/>',
  rg('snR', '#c070d0', '#5a2070'));
M.snecko = svg(
  '<path d="M60 186 Q48 140 70 110 Q100 92 130 110 Q152 140 140 186 Z" fill="url(#skR)"' + O + '/>' +
  '<path d="M140 170 Q176 160 180 130 Q170 150 146 150" fill="#4a8a7a"' + O + '/>' +
  '<ellipse cx="100" cy="76" rx="44" ry="38" fill="url(#skR)"' + O + '/>' +
  '<circle cx="100" cy="74" r="25" fill="#fff4c8"' + O + '/><circle cx="100" cy="74" r="15" fill="#e0a020"/><ellipse cx="100" cy="74" rx="4" ry="13" fill="#140c0a"/>' +
  '<path d="M82 104 Q100 112 118 104" fill="none" stroke="#140c0a" stroke-width="3"/>',
  rg('skR', '#7ac0a8', '#2a5a4a'));
M['bronze-orb'] = svg(
  '<path d="M100 20 L110 56 L90 56 Z M100 176 L110 140 L90 140 Z" fill="#c9962a"' + O + '/>' +
  '<circle cx="100" cy="98" r="44" fill="url(#boR)"' + O + '/><circle cx="100" cy="98" r="18" fill="url(#boE)"' + O + '/><circle cx="100" cy="98" r="6" fill="#140c0a"/>' +
  '<path d="M64 80 Q80 66 96 62" stroke="#fff3c8" stroke-width="4" fill="none" opacity=".7"/>',
  rg('boR', '#f0d070', '#7a5a14') + rg('boE', '#ffffff', '#4ad0ff'));
M['torch-head'] = svg(
  '<path d="M70 186 L74 120 Q100 108 126 120 L130 186 Z" fill="url(#thR)"' + O + '/>' +
  '<path d="M72 120 Q100 70 128 120 Z" fill="#6a6a70"' + O + '/>' +
  '<path d="M80 92 Q74 56 92 40 Q92 60 100 62 Q104 36 120 26 Q116 54 126 66 Q130 80 120 94 Z" fill="url(#thF)"/>' +
  eye(92, 104, 5, '#ffcf40') + eye(110, 104, 5, '#ffcf40'),
  lg('thR', '#8a8a90', '#3a3a42') + lg('thF', '#fff0a0', '#e04a10'));
M['book-of-stabbing'] = svg(
  '<path d="M40 150 L100 128 L160 150 L160 70 L100 50 L40 70 Z" fill="#5a2a1a"' + O + '/>' +
  '<path d="M48 142 L100 122 L152 142 L152 76 L100 58 L48 76 Z" fill="#f0e6c8"' + O + '/><path d="M100 58 V122" stroke="#140c0a" stroke-width="3"/>' +
  '<path d="M60 80 L20 40 M70 70 L48 22 M140 70 L160 24 M148 84 L184 46 M78 140 L60 186 M126 140 L144 184" stroke="#dfe4ea" stroke-width="6"/>' +
  '<path d="M64 90 h26 M64 100 h22 M110 92 h26 M112 102 h22" stroke="#9a8a6a" stroke-width="3"/>' +
  eye(100, 92, 9, '#e04a3a'));
M.taskmaster = svg(
  '<path d="M48 186 Q40 120 100 104 Q160 120 152 186 Z" fill="url(#tmR)"' + O + '/>' +
  '<path d="M66 108 Q100 30 134 108 Q100 96 66 108 Z" fill="#6a1a14"' + O + '/>' +
  '<ellipse cx="100" cy="104" rx="20" ry="16" fill="#c8d870"' + O + '/>' + eye(93, 102, 4, '#ffe060') + eye(107, 102, 4, '#ffe060') +
  '<path d="M150 140 Q186 120 176 80 Q170 110 140 120" fill="none" stroke="#5a3a1a" stroke-width="5"/>',
  lg('tmR', '#b02a1a', '#4a0e08'));
M['bronze-automaton'] = svg(
  '<path d="M56 186 L62 112 L138 112 L144 186 Z" fill="url(#baR)"' + O + '/>' +
  '<path d="M40 116 Q30 150 44 176 L60 170 L58 118 Z M160 116 Q170 150 156 176 L140 170 L142 118 Z" fill="url(#baR)"' + O + '/>' +
  '<path d="M70 112 L72 60 Q100 36 128 60 L130 112 Z" fill="url(#baR)"' + O + '/>' +
  '<rect x="80" y="70" width="40" height="14" rx="6" fill="#140c0a"/><circle cx="100" cy="77" r="5" fill="#4ad0ff"/>' +
  '<circle cx="100" cy="146" r="12" fill="#4ad0ff"' + O + '/><path d="M100 36 V20" stroke="#c9962a" stroke-width="5"/>',
  lg('baR', '#f0d070', '#8a5a14'));
M.champ = svg(
  '<path d="M58 186 L64 116 Q100 98 136 116 L142 186 Z" fill="url(#chpR)"' + O + '/>' +
  '<path d="M64 116 Q48 128 44 160 L58 164 Q62 140 72 130 Z M136 116 Q152 128 156 160 L142 164 Q138 140 128 130 Z" fill="#d89a6a"' + O + '/>' +
  '<path d="M74 92 Q100 46 126 92 L124 112 Q100 120 76 112 Z" fill="#a8a8b0"' + O + '/><path d="M86 90 h28 v6 h-28 z" fill="#140c0a"/>' +
  '<path d="M100 48 Q116 22 140 26 Q118 34 110 52" fill="#c43a2a"' + O + '/>' +
  '<path d="M160 60 L144 170" stroke="#e8e8f0" stroke-width="8"/><path d="M28 120 Q40 104 56 112 Q60 140 44 156 Q28 146 28 120 Z" fill="#c9962a"' + O + '/>',
  lg('chpR', '#c47a4a', '#6a3a1a'));
M.collector = svg(
  '<path d="M52 186 Q50 110 100 80 Q150 110 148 186 Q124 172 100 186 Q76 172 52 186 Z" fill="url(#coR)"' + O + '/>' +
  '<path d="M70 96 Q100 30 130 96 Q100 84 70 96 Z" fill="#2a1a4a"' + O + '/>' +
  '<ellipse cx="100" cy="92" rx="18" ry="15" fill="#140c0a"/>' + eye(93, 92, 4, '#c0ff40') + eye(107, 92, 4, '#c0ff40') +
  '<path d="M150 120 Q170 110 172 90" stroke="#5a4a3a" stroke-width="4" fill="none"/><circle cx="172" cy="82" r="12" fill="url(#coL)"' + O + '/>',
  lg('coR', '#5a3a8a', '#1a0e2a') + rg('coL', '#e0ffb0', '#3a8a10'));

/* ---------------- Act III ---------------- */
M.darkling = svg(
  '<path d="M44 186 Q36 120 70 96 Q100 80 130 96 Q164 120 156 186 Z" fill="url(#daR)"' + O + '/>' +
  '<path d="M70 98 L58 60 L84 88 M130 98 L142 60 L116 88" fill="#2a2a3a"' + O + '/>' +
  eye(84, 120, 8, '#e8f0ff') + eye(116, 120, 8, '#e8f0ff') + '<path d="M80 150 l8 8 8 -8 8 8 8 -8 8 8" stroke="#e8f0ff" stroke-width="3" fill="none"/>',
  rg('daR', '#4a4a5e', '#0e0e16'));
M.exploder = svg(
  '<circle cx="100" cy="112" r="56" fill="url(#exR)"' + O + '/>' +
  '<path d="M100 56 Q108 34 128 30" stroke="#5a3a1a" stroke-width="5" fill="none"/><path d="M128 30 l8 -10 2 12 10 2 -12 6" fill="#ffd040"/>' +
  '<circle cx="100" cy="112" r="20" fill="url(#exC)"/>' + '<path d="M60 90 Q70 76 84 70" stroke="#fff" stroke-width="4" fill="none" opacity=".4"/>',
  rg('exR', '#8a6a5a', '#2a1a14') + rg('exC', '#fff6b0', '#e0400a'));
M.repulsor = svg(
  '<path d="M100 40 L118 86 L166 100 L118 116 L100 164 L82 116 L34 100 L82 86 Z" fill="url(#reR)"' + O + '/>' +
  '<circle cx="100" cy="100" r="18" fill="#e8f8ff"' + O + '/><circle cx="100" cy="100" r="8" fill="#2a6ad0"/>',
  rg('reR', '#9ad0ff', '#1a4a8a'));
M.spiker = svg(
  '<circle cx="100" cy="110" r="44" fill="url(#skrR)"' + O + '/>' +
  [0, 40, 80, 120, 160, 200, 240, 280, 320].map(function (a) {
    var r = a * Math.PI / 180, x1 = 100 + Math.cos(r) * 40, y1 = 110 + Math.sin(r) * 40, x2 = 100 + Math.cos(r) * 74, y2 = 110 + Math.sin(r) * 74;
    var xl = 100 + Math.cos(r - 0.2) * 40, yl = 110 + Math.sin(r - 0.2) * 40, xr = 100 + Math.cos(r + 0.2) * 40, yr = 110 + Math.sin(r + 0.2) * 40;
    return '<path d="M' + xl.toFixed(1) + ' ' + yl.toFixed(1) + ' L' + x2.toFixed(1) + ' ' + y2.toFixed(1) + ' L' + xr.toFixed(1) + ' ' + yr.toFixed(1) + ' Z" fill="#d8b8a0"' + O + '/>';
  }).join('') + eye(90, 104, 6, '#ffe060') + eye(110, 104, 6, '#ffe060'),
  rg('skrR', '#c06a4a', '#5a2210'));
M['orb-walker'] = svg(
  '<path d="M60 130 L36 184 M80 140 L70 186 M120 140 L130 186 M140 130 L164 184" stroke="#6a6a72" stroke-width="7"/>' +
  '<path d="M48 130 Q50 70 100 62 Q150 70 152 130 Z" fill="url(#owR)"' + O + '/>' +
  '<circle cx="100" cy="104" r="22" fill="url(#owE)"' + O + '/><circle cx="100" cy="104" r="8" fill="#e8ffff"/>',
  lg('owR', '#a8a8b8', '#3a3a48') + rg('owE', '#c0ffff', '#10a0c0'));
M['spire-growth'] = svg(
  '<path d="M40 186 Q70 120 50 60 Q90 110 92 186 Z" fill="url(#sgR)"' + O + '/>' +
  '<path d="M90 186 Q110 100 96 30 Q140 100 128 186 Z" fill="url(#sgR)"' + O + '/>' +
  '<path d="M124 186 Q150 130 166 80 Q178 140 160 186 Z" fill="url(#sgR)"' + O + '/>' +
  '<circle cx="96" cy="40" r="6" fill="#ff7a8a"/><circle cx="52" cy="66" r="5" fill="#ff7a8a"/><circle cx="164" cy="88" r="5" fill="#ff7a8a"/>',
  lg('sgR', '#5ad0b8', '#1a5a50'));
M.transient = svg(
  '<path d="M60 190 Q66 120 100 80 Q134 120 140 190 Q120 176 100 190 Q80 176 60 190 Z" fill="url(#trR)" opacity=".9"' + O + '/>' +
  '<circle cx="100" cy="72" r="26" fill="url(#trR)"' + O + '/>' + eye(91, 70, 5, '#ffffff') + eye(109, 70, 5, '#ffffff') +
  '<path d="M60 130 Q30 120 26 96 M140 130 Q170 120 174 96" stroke="#c8a0ff" stroke-width="5" fill="none" opacity=".7"/>',
  rg('trR', '#e8d8ff', '#6a4aa8'));
M.maw = svg(
  '<path d="M30 160 Q24 70 100 56 Q176 70 170 160 Q100 184 30 160 Z" fill="url(#maR)"' + O + '/>' +
  '<path d="M48 120 Q100 70 152 120 Q100 168 48 120 Z" fill="#2a0808"' + O + '/>' +
  '<path d="M58 112 l8 14 8 -16 8 18 8 -18 8 18 8 -18 8 18 8 -16 8 14" fill="#f0ead8"/><path d="M62 132 l10 -10 8 12 8 -12 8 12 8 -12 8 12 8 -12 8 12 10 -10" fill="#f0ead8"/>' +
  eye(76, 80, 6, '#ffcf40') + eye(124, 80, 6, '#ffcf40'),
  rg('maR', '#6a4a5a', '#1e1218'));
M['writhing-mass'] = svg(
  '<path d="M40 180 Q30 110 70 80 Q100 60 130 80 Q170 110 160 180 Z" fill="url(#wmR)"' + O + '/>' +
  '<path d="M60 100 Q30 60 52 30 M100 76 Q96 36 118 16 M140 100 Q176 70 168 34 M50 150 Q14 140 12 112 M150 150 Q186 142 188 112" fill="none" stroke="#7aa040" stroke-width="9"/>' +
  eye(84, 120, 9, '#ff4a6a') + eye(118, 112, 7, '#ff4a6a') + eye(104, 146, 6, '#ff4a6a'),
  rg('wmR', '#4a5a2a', '#121808'));
M['giant-head'] = svg(
  '<path d="M34 186 Q24 70 100 40 Q176 70 166 186 Z" fill="url(#ghR)"' + O + '/>' +
  '<path d="M62 100 Q76 88 90 100 M110 100 Q124 88 138 100" stroke="#140c0a" stroke-width="5" fill="none"/>' +
  '<ellipse cx="76" cy="112" rx="9" ry="6" fill="#ffd040"/><ellipse cx="124" cy="112" rx="9" ry="6" fill="#ffd040"/>' +
  '<path d="M100 112 L92 140 H108 Z" fill="#6a6a70"' + O + '/><path d="M72 160 Q100 172 128 160" stroke="#140c0a" stroke-width="5" fill="none"/>' +
  '<path d="M50 70 L64 84 M150 70 L136 84 M40 130 l14 4 M160 130 l-14 4" stroke="#5a5a62" stroke-width="3"/>',
  lg('ghR', '#9a9aa4', '#3a3a44'));
M.nemesis = svg(
  '<path d="M50 190 Q56 110 100 70 Q144 110 150 190 Q126 176 100 190 Q74 176 50 190 Z" fill="url(#neR)"' + O + '/>' +
  '<path d="M70 86 Q100 30 130 86 Q100 74 70 86 Z" fill="#1a0e1e"' + O + '/>' + eye(92, 82, 5, '#ff6a20') + eye(108, 82, 5, '#ff6a20') + eye(100, 94, 4, '#ff6a20') +
  '<path d="M152 40 L150 180" stroke="#5a3a2a" stroke-width="6"/><path d="M152 40 Q110 30 92 62 Q120 46 150 56 Z" fill="#d8dce4"' + O + '/>' +
  '<path d="M62 120 Q40 110 44 88 Q56 104 70 104" fill="#ff8a20" opacity=".8"/>',
  lg('neR', '#3a1a3a', '#0e060e'));
M.reptomancer = svg(
  '<path d="M56 186 Q62 116 100 92 Q138 116 144 186 Z" fill="url(#rpR)"' + O + '/>' +
  '<path d="M76 100 Q100 40 124 100 Q100 88 76 100 Z" fill="#3a6a2a"' + O + '/>' +
  '<path d="M84 96 Q100 70 116 96 Q100 108 84 96 Z" fill="#7ac050"' + O + '/>' + eye(94, 92, 3.5, '#ffe040') + eye(106, 92, 3.5, '#ffe040') +
  '<path d="M146 70 Q170 90 152 120 Q140 140 160 160" stroke="#7ac050" stroke-width="7" fill="none"/>' +
  '<path d="M30 140 Q50 120 66 136" stroke="#7ac050" stroke-width="6" fill="none"/>',
  lg('rpR', '#7a3aa8', '#2a0e3a'));
M['awakened-one'] = svg(
  '<path d="M100 60 Q40 40 14 80 Q50 76 60 100 Q30 110 26 140 Q60 120 76 130 Z" fill="#1a1a2a"' + O + '/>' +
  '<path d="M100 60 Q160 40 186 80 Q150 76 140 100 Q170 110 174 140 Q140 120 124 130 Z" fill="#1a1a2a"' + O + '/>' +
  '<path d="M68 186 Q70 110 100 86 Q130 110 132 186 Z" fill="url(#awR)"' + O + '/>' +
  '<circle cx="100" cy="74" r="20" fill="url(#awR)"' + O + '/>' + eye(100, 72, 7, '#7ae0ff') +
  '<path d="M84 56 L74 34 M116 56 L126 34" stroke="#c9a14a" stroke-width="4"/>',
  lg('awR', '#4a4a6a', '#14141e'));
M['time-eater'] = svg(
  '<path d="M30 180 Q22 90 100 60 Q178 90 170 180 Z" fill="url(#teR)"' + O + '/>' +
  '<circle cx="100" cy="118" r="34" fill="#f0e6c8"' + O + '/><path d="M100 118 V94 M100 118 L118 128" stroke="#140c0a" stroke-width="4"/>' +
  '<path d="M100 88 v6 M100 142 v6 M70 118 h6 M124 118 h6" stroke="#140c0a" stroke-width="3"/>' +
  '<path d="M40 100 Q10 80 20 50 Q36 70 52 76" fill="#a050c0"' + O + '/>' + eye(70, 76, 6, '#ffcf40') + eye(130, 76, 6, '#ffcf40'),
  rg('teR', '#c070e0', '#3a0e5a'));

/* ---------------- Act IV ---------------- */
M['spire-shield'] = svg(
  '<path d="M100 20 L164 46 Q170 130 100 186 Q30 130 36 46 Z" fill="url(#ssR)"' + O + '/>' +
  '<path d="M100 36 L150 56 Q152 122 100 166 Q48 122 50 56 Z" fill="none" stroke="#e8c066" stroke-width="4"/>' +
  eye(84, 90, 8, '#7ae0ff') + eye(116, 90, 8, '#7ae0ff') + '<path d="M84 128 Q100 120 116 128" stroke="#140c0a" stroke-width="4" fill="none"/>',
  lg('ssR', '#5a7aa8', '#1a2a4a'));
M['spire-spear'] = svg(
  '<path d="M64 186 L72 112 Q100 96 128 112 L136 186 Z" fill="url(#sspR)"' + O + '/>' +
  '<path d="M78 112 Q100 50 122 112 Q100 100 78 112 Z" fill="#3a1a1a"' + O + '/>' + eye(92, 100, 5, '#ff6a40') + eye(108, 100, 5, '#ff6a40') +
  '<path d="M30 186 L150 20" stroke="#c9a14a" stroke-width="7"/><path d="M150 20 L176 6 L162 34 Z" fill="#e8e8f0"' + O + '/>' +
  '<path d="M140 150 L184 120 M146 162 L190 140" stroke="#e8e8f0" stroke-width="5"/>',
  lg('sspR', '#a83a2a', '#3a0e0a'));
M['corrupt-heart'] = svg(
  '<path d="M100 178 Q22 120 30 70 Q38 30 78 34 Q96 38 100 58 Q104 38 122 34 Q162 30 170 70 Q178 120 100 178 Z" fill="url(#hrR)"' + O + '/>' +
  '<path d="M60 70 Q72 56 88 60" stroke="#ffb0b0" stroke-width="5" fill="none" opacity=".6"/>' +
  '<path d="M100 58 Q96 100 70 120 M100 58 Q110 100 132 112 M100 100 V150" stroke="#5a0a14" stroke-width="4" fill="none"/>' +
  '<path d="M30 70 Q10 60 8 36 M170 70 Q190 60 192 36 M50 140 Q24 160 18 186 M150 140 Q176 160 182 186" stroke="#5a0a14" stroke-width="6" fill="none"/>' +
  eye(100, 96, 9, '#ffd040'),
  rg('hrR', '#ff5a6a', '#6a0a1a'));
})(typeof window !== 'undefined' ? window : globalThis);
