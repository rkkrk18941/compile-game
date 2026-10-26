/* Every card face (all cards, plain and upgraded) at hand, picker and zoom sizes: the name stays inside the banner,
   the effect text stays inside the printed description panel, nothing is drawn outside the card.
   Needs Playwright + Chromium and the static server (node serve.js).
   node tools/ibara-card-fit-check.cjs [http://localhost:8788/ibara/] */
'use strict';
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const base = process.argv[2] || 'http://localhost:8788/ibara/';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.goto(base + '?fitcheck=' + Date.now());
  await page.waitForTimeout(400);
  const result = await page.evaluate(async () => {
    const S = window.STS, V = S.View;
    const widths = [58, 66, 74, 90, 120, 160, 230];
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:1200px;display:flex;flex-wrap:wrap;gap:12px;z-index:999;background:#000';
    document.body.appendChild(host);
    const ids = Object.keys(S.CARDS);
    const bad = [], stats = {};
    for (const w of widths) {
      let html = '';
      ids.forEach(id => { [false, true].forEach(up => { if (up && !(S.CARDS[id].tx || [])[1]) return; html += '<div style="--cw:' + w + 'px">' + V.card({ id, up }, { attrs: 'data-id="' + id + '" data-up="' + up + '"' }) + '</div>'; }); });
      host.innerHTML = html;
      host.querySelectorAll('.card .ctext > span').forEach(x => window.STS_FIT_PREP && window.STS_FIT_PREP(x));
      S.UI.fitCards(host);
      let minFs = 99, clipped = 0, n = 0;
      host.querySelectorAll('.card').forEach(card => {
        n++;
        const cr = card.getBoundingClientRect(), t = card.querySelector('.ctext > span'), box = card.querySelector('.ctext'), nm = card.querySelector('.cname > span'), nb = card.querySelector('.cname');
        const br = box.getBoundingClientRect(), tr = t.getBoundingClientRect(), nr = nm.getBoundingClientRect(), nbr = nb.getBoundingClientRect();
        const fs = parseFloat(getComputedStyle(t).fontSize);
        minFs = Math.min(minFs, fs);
        if (box.classList.contains('clip')) clipped++;
        const label = card.getAttribute('data-id') + (card.getAttribute('data-up') === 'true' ? '+' : '') + '@' + w;
        // text block inside the panel box and the box inside the card
        if (t.scrollHeight > box.clientHeight + 1 && !box.classList.contains('clip')) bad.push(label + ' text taller than panel');
        if (t.scrollWidth > box.clientWidth + 1) bad.push(label + ' text wider than panel');
        if (br.left < cr.left - 0.5 || br.right > cr.right + 0.5 || br.bottom > cr.bottom + 0.5) bad.push(label + ' panel outside card');
        if (nm.scrollWidth > nb.clientWidth + 1) bad.push(label + ' name wider than banner');
        if (nbr.left < cr.left - 0.5 || nbr.right > cr.right + 0.5) bad.push(label + ' banner outside card');
      });
      stats[w] = { cards: n, minFont: +minFs.toFixed(2), clipped };
    }
    host.remove();
    return { bad, stats };
  });
  console.log(JSON.stringify(result.stats));
  if (result.bad.length) { console.error(result.bad.slice(0, 40).join('\n')); process.exitCode = 1; }
  else console.log('ok: every card name and effect text stays inside its printed area at all sizes');
  await browser.close();
})().catch(e => { console.error(e); process.exitCode = 1; });
