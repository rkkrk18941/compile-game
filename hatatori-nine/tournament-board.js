// Tournament table presentation copied from Nanafushigi Duel.
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function roundName(t, r) {
  const total = t.rounds.length ? Math.ceil(Math.log2(Math.max(2, t.entrants.length))) : 1;
  const left = total - r;
  return left === 0 ? '決勝' : left === 1 ? '準決勝' : left === 2 ? '準々決勝' : r + '回戦';
}


export function tourBoardHTML(t) {
  const name = (eid) => { const e = t.entrants.find((x) => x.eid === eid); return e ? e.name : '—'; };
  let h = '';
  if (t.over && t.champion != null) h += '<div class="champ">👑 優勝 ' + esc(name(t.champion)) + '</div>';
  if (t.format === 'league') {
    h += '<table class="stand"><thead><tr><th></th><th>名前</th><th>勝点</th><th>勝</th><th>分</th><th>負</th><th>旗差</th></tr></thead><tbody>';
    t.standings.forEach((r, i) => { h += '<tr class="' + (i === 0 && r.played ? 'top' : '') + '"><td class="rk">' + (i + 1) + '</td><td class="n">' + esc(r.name) + (r.cpu ? ' <small style="color:var(--dim)">CPU</small>' : '') + '</td><td>' + r.p + '</td><td>' + r.w + '</td><td>' + r.d + '</td><td>' + r.l + '</td><td>' + (r.vp > 0 ? '+' : '') + r.vp + '</td></tr>'; });
    h += '</tbody></table><div class="ctitle">試合</div><div class="mlist">';
    let nextMarked = false;
    t.matches.forEach((m) => {
      const live = m.status === 'live', done = m.status === 'done';
      const isNext = !nextMarked && m.status === 'wait'; if (isNext) nextMarked = true;
      const sc = done && m.score ? (m.seats[0] === m.a ? m.score[0] + '-' + m.score[1] : m.score[1] + '-' + m.score[0]) : live ? '対戦中' : '—';
      const cls = (eid) => (done ? (m.winner === eid ? 'w' : m.winner === -1 ? '' : 'l') : '');
      h += '<div class="mrow' + (live ? ' live' : isNext ? ' next' : '') + '"><span class="r">第' + m.round + '節</span><span class="p ' + cls(m.a) + '">' + esc(name(m.a)) + '</span><span class="sc">' + sc + (done && m.how && m.how !== 'count' ? '<br><small>' + (({ breakthrough: '突破', envelopment: '包囲', draw: '引分' }[m.how] || '旗数')) + '</small>' : '') + '</span><span class="p ' + cls(m.b) + '">' + esc(name(m.b)) + '</span></div>';
    });
    h += '</div>';
  } else if (t.format === 'cup') {
    h += '<div class="bracket">';
    t.rounds.forEach((ids, r) => {
      h += '<div class="bcol"><h5>' + esc(roundName(t, r + 1)) + '</h5>';
      ids.forEach((id) => {
        const m = t.matches[id];
        const row = (eid, s) => { const done = m.status === 'done'; const c = done ? (m.winner === eid ? 'w' : 'l') : ''; return '<div class="' + c + '"><span>' + (eid == null ? (m.bye ? '（不戦）' : '…') : esc(name(eid))) + '</span><b>' + (s != null ? s : '') + '</b></div>'; };
        const sa = m.score && m.seats ? (m.seats[0] === m.a ? m.score[0] : m.score[1]) : null, sb = m.score && m.seats ? (m.seats[0] === m.a ? m.score[1] : m.score[0]) : null;
        h += '<div class="bm' + (m.status === 'live' ? ' live' : '') + '">' + row(m.a, sa) + row(m.b, sb) + (m.lot ? '<small>引分・抽選で勝ち上がり</small>' : '') + '</div>';
      });
      h += '</div>';
    });
    h += '</div>';
    h += '<div class="ctitle">勝敗</div><table class="stand"><tbody>' + t.standings.map((r) => '<tr><td class="n" style="color:' + (r.alive ? '#ffe7a6' : 'var(--dim)') + '">' + esc(r.name) + '</td><td>' + r.w + '勝' + r.l + '敗</td></tr>').join('') + '</tbody></table>';
  }
  return h;
}
