/* ---------- 人間界の建物・背景の描画 ---------- */
const CityArt = (() => {
  const MOON = 'rgba(150,165,215,0.32)';
  function R(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
  function win(g, x, y, w, h, st, lit, ruin) {
    if (ruin) {
      if (st < 0.22) { R(g, x - w * 0.3, y - h * 0.3, w * 1.6, h * 1.6, 'rgba(255,110,30,0.25)'); R(g, x, y, w, h, '#ff8a3a'); }
      else R(g, x, y, w, h, '#0d0908');
      return;
    }
    if (st < lit) {
      R(g, x - w * 0.35, y - h * 0.35, w * 1.7, h * 1.7, 'rgba(255,200,110,0.16)');
      R(g, x, y, w, h, '#ffcf7a');
    } else R(g, x, y, w, h, '#14110f');
  }
  function winC(g, x, y, w, h, st, lit, ruin, col) {
    if (ruin) { win(g, x, y, w, h, st, lit, true); return; }
    if (st < lit) { R(g, x - w * 0.3, y - h * 0.3, w * 1.6, h * 1.6, rgba(col, 0.15)); R(g, x, y, w, h, col); }
    else R(g, x, y, w, h, 'rgba(8,10,16,0.85)');
  }
  function grid(g, r, x0, y0, cols, rows, ww, wh, gx, gy, lit, ruin, col) {
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const x = x0 + i * (ww + gx), y = y0 - j * (wh + gy) - wh;
      if (col) winC(g, x, y, ww, wh, r(), lit, ruin, col); else win(g, x, y, ww, wh, r(), lit, ruin);
    }
  }
  function tri(g, x0, y0, x1, y1, x2, y2, c) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x2, y2); g.closePath(); g.fillStyle = c; g.fill(); }
  function edge(g, pts, c = MOON, lw = 0.35) { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.strokeStyle = c; g.lineWidth = lw; g.stroke(); }
  function hgrad(g, x0, x1, c0, c1, c2) { const gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, c0); gr.addColorStop(0.5, c1); gr.addColorStop(1, c2); return gr; }

  /* ---------- 中世 ---------- */
  function house(g, w, h, r, ruin, opt = {}) {
    const wallH = h * (opt.wallK || 0.58), roofTop = -h;
    const walls = ['#5b5040', '#544a3c', '#62553f', '#4e463a'];
    R(g, 0, -wallH, w, wallH, walls[Math.floor(r() * walls.length)]);
    g.strokeStyle = '#21180f'; g.lineWidth = 0.45;
    g.beginPath();
    for (let i = 0; i <= 3; i++) { const x = (w * i) / 3; g.moveTo(x, 0); g.lineTo(x, -wallH); }
    g.moveTo(0, -wallH * 0.5); g.lineTo(w, -wallH * 0.5);
    g.moveTo(0, -wallH * 0.5); g.lineTo(w / 3, -wallH); g.moveTo(w, -wallH * 0.5); g.lineTo((w * 2) / 3, -wallH);
    g.stroke();
    const nw = Math.max(1, Math.floor(w / 4));
    for (let i = 0; i < nw; i++) {
      const x = (w * (i + 0.5)) / nw - 0.6;
      win(g, x, -wallH * 0.85, 1.2, 1.3, r(), 0.55, ruin);
      if (wallH > 6 && r() < 0.6) win(g, x, -wallH * 0.38, 1.2, 1.3, r(), 0.45, ruin);
    }
    R(g, w * 0.5 - 0.7, -2.2, 1.4, 2.2, '#1d140d');
    const thatch = r() < 0.5;
    g.beginPath(); g.moveTo(-0.9, -wallH); g.lineTo(w * 0.5, roofTop); g.lineTo(w + 0.9, -wallH); g.closePath();
    g.fillStyle = thatch ? '#3f3522' : '#4a2a22'; g.fill();
    g.strokeStyle = thatch ? 'rgba(20,14,6,0.5)' : 'rgba(10,4,2,0.5)'; g.lineWidth = 0.3;
    for (let i = 1; i < 5; i++) {
      const y = -wallH - ((h - wallH) * i) / 5, k = i / 5;
      g.beginPath(); g.moveTo(-0.9 + (w * 0.5 + 0.9) * k, y); g.lineTo(w + 0.9 - (w * 0.5 + 0.9) * k, y); g.stroke();
    }
    edge(g, [-0.9, -wallH, w * 0.5, roofTop, w + 0.9, -wallH]);
    if (r() < 0.7) { const cx = w * (0.65 + r() * 0.15); R(g, cx, roofTop + (h - wallH) * 0.25, 1.1, (h - wallH) * 0.5, '#2b2621'); }
  }
  function barn(g, w, h, r, ruin) {
    const wallH = h * 0.5;
    R(g, 0, -wallH, w, wallH, '#4a2a20');
    g.strokeStyle = 'rgba(10,4,2,0.45)'; g.lineWidth = 0.25;
    for (let x = 1; x < w; x += 1.2) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, -wallH); g.stroke(); }
    R(g, w * 0.35, -wallH * 0.85, w * 0.3, wallH * 0.85, '#2a1711');
    g.strokeStyle = '#6a4a3a'; g.lineWidth = 0.35; g.beginPath(); g.moveTo(w * 0.35, -wallH * 0.85); g.lineTo(w * 0.65, 0); g.moveTo(w * 0.65, -wallH * 0.85); g.lineTo(w * 0.35, 0); g.stroke();
    g.beginPath(); g.moveTo(-0.6, -wallH); g.lineTo(w * 0.15, -h * 0.82); g.lineTo(w * 0.5, -h); g.lineTo(w * 0.85, -h * 0.82); g.lineTo(w + 0.6, -wallH); g.closePath();
    g.fillStyle = '#2f2a26'; g.fill();
    edge(g, [-0.6, -wallH, w * 0.15, -h * 0.82, w * 0.5, -h, w * 0.85, -h * 0.82, w + 0.6, -wallH]);
    win(g, w * 0.5 - 0.6, -h * 0.75, 1.2, 1.2, r(), 0.4, ruin);
  }
  function stoneTex(g, w, h, y0, c) {
    g.strokeStyle = c; g.lineWidth = 0.18;
    for (let y = 0, row = 0; y < h; y += 1.2, row++) {
      g.beginPath(); g.moveTo(0, y0 - y); g.lineTo(w, y0 - y); g.stroke();
      for (let x = (row % 2) * 1.5; x < w; x += 3) { g.beginPath(); g.moveTo(x, y0 - y); g.lineTo(x, y0 - y - 1.2); g.stroke(); }
    }
  }
  function stone(g, w, h, r, ruin) {
    const wallH = h * 0.7;
    R(g, 0, -wallH, w, wallH, '#4a4641');
    stoneTex(g, w, wallH, 0, 'rgba(15,14,12,0.35)');
    const floors = Math.max(1, Math.floor(wallH / 4.2));
    for (let f = 0; f < floors; f++) for (let i = 0; i < Math.floor(w / 3.5); i++) win(g, 1.5 + i * 3.5, -(f + 1) * 4 + 1, 1.3, 1.8, r(), 0.5, ruin);
    R(g, w * 0.5 - 0.8, -2.8, 1.6, 2.8, '#1a1512');
    g.beginPath(); g.moveTo(-0.6, -wallH); g.lineTo(w * 0.5, -h); g.lineTo(w + 0.6, -wallH); g.closePath(); g.fillStyle = '#2a2d33'; g.fill();
    edge(g, [-0.6, -wallH, w * 0.5, -h, w + 0.6, -wallH]);
  }
  function tavern(g, w, h, r, ruin) {
    house(g, w, h, r, ruin, { wallK: 0.66 });
    R(g, w + 0.2, -h * 0.42, 2.4, 1.6, '#3a2a1a');
    g.fillStyle = 'rgba(255,190,90,0.35)'; g.fillRect(w + 0.4, -h * 0.4, 2, 1.2);
  }
  function windmill(g, w, h, r, ruin) {
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.2, -h * 0.82); g.lineTo(w * 0.8, -h * 0.82); g.lineTo(w, 0); g.closePath();
    g.fillStyle = hgrad(g, 0, w, '#4b4338', '#5d5342', '#2e2922'); g.fill();
    stoneTex(g, w, h * 0.8, 0, 'rgba(10,8,6,0.25)');
    g.beginPath(); g.moveTo(w * 0.12, -h * 0.82); g.quadraticCurveTo(w * 0.5, -h * 1.02, w * 0.88, -h * 0.82); g.closePath(); g.fillStyle = '#2d2620'; g.fill();
    win(g, w * 0.5 - 0.6, -h * 0.5, 1.2, 1.6, r(), 0.6, ruin);
    R(g, w * 0.5 - 0.8, -2.4, 1.6, 2.4, '#1a1410');
  }
  function chapel(g, w, h, r, ruin) {
    const bodyH = h * 0.45;
    R(g, 0, -bodyH, w, bodyH, '#4e4a45');
    stoneTex(g, w, bodyH, 0, 'rgba(15,14,12,0.3)');
    g.beginPath(); g.moveTo(-0.5, -bodyH); g.lineTo(w * 0.5, -bodyH - w * 0.35); g.lineTo(w + 0.5, -bodyH); g.closePath(); g.fillStyle = '#2b2d33'; g.fill();
    const tw = w * 0.32, tx = w * 0.12;
    R(g, tx, -h * 0.7, tw, h * 0.7 - bodyH, '#56514b');
    tri(g, tx - 0.4, -h * 0.7, tx + tw / 2, -h + 1.2, tx + tw + 0.4, -h * 0.7, '#26282e');
    g.beginPath(); g.arc(tx + tw / 2, -h + 0.6, 0.8, 0, TAU); g.fillStyle = '#c9a85a'; g.fill();
    for (let i = 0; i < 3; i++) win(g, w * 0.5 + i * 2.2, -bodyH * 0.75, 1.0, 3, r(), 0.75, ruin);
    if (!ruin) { g.beginPath(); g.arc(tx + tw / 2, -h * 0.6, 1.2, 0, TAU); g.fillStyle = '#e8a64b'; g.fill(); }
    edge(g, [tx - 0.4, -h * 0.7, tx + tw / 2, -h + 1.2, tx + tw + 0.4, -h * 0.7]);
  }
  function tower(g, w, h, r, ruin) {
    const bodyH = h * 0.78;
    R(g, 0, -bodyH, w, bodyH, hgrad(g, 0, w, '#3a3733', '#57524b', '#2a2724'));
    stoneTex(g, w, bodyH, 0, 'rgba(10,9,8,0.28)');
    for (let i = 0; i < Math.floor(bodyH / 6); i++) win(g, w * 0.5 - 0.3, -4 - i * 6, 0.6, 2, r(), 0.45, ruin);
    tri(g, -1, -bodyH, w * 0.5, -h, w + 1, -bodyH, '#2c2537');
    edge(g, [-1, -bodyH, w * 0.5, -h, w + 1, -bodyH]);
    R(g, w * 0.5 - 0.1, -h - 3, 0.2, 3, '#555');
    g.fillStyle = '#7a1e22'; g.beginPath(); g.moveTo(w * 0.5 + 0.1, -h - 3); g.lineTo(w * 0.5 + 2.4, -h - 2.4); g.lineTo(w * 0.5 + 0.1, -h - 1.8); g.fill();
  }
  function wall(g, w, h, r, ruin) {
    R(g, 0, -h, w, h, '#45423e');
    stoneTex(g, w, h, 0, 'rgba(10,9,8,0.3)');
    for (let x = 0; x < w; x += 2.6) R(g, x, -h - 1.4, 1.5, 1.4, '#45423e');
    edge(g, [0, -h, w, -h]);
    for (let x = 4; x < w - 2; x += 9) {
      if (!ruin) { R(g, x - 1.5, -h * 0.7 - 1.5, 3, 3, 'rgba(255,170,70,0.12)'); R(g, x - 0.25, -h * 0.7, 0.5, 0.7, '#ffb050'); }
    }
  }
  function gate(g, w, h, r, ruin) {
    const tw = w * 0.32;
    for (const x0 of [0, w - tw]) {
      R(g, x0, -h, tw, h, hgrad(g, x0, x0 + tw, '#3a3733', '#56514b', '#2c2926'));
      stoneTex(g, tw, h, 0, 'rgba(10,9,8,0.28)');
      for (let x = x0; x < x0 + tw; x += 2.2) R(g, x, -h - 1.4, 1.3, 1.4, '#4a4642');
      for (let i = 0; i < 3; i++) win(g, x0 + tw / 2 - 0.3, -5 - i * 6, 0.6, 2, r(), 0.5, ruin);
    }
    R(g, tw, -h * 0.72, w - tw * 2, h * 0.72, '#4a4642');
    g.beginPath(); g.moveTo(tw + 1, 0); g.lineTo(tw + 1, -h * 0.36); g.quadraticCurveTo(w / 2, -h * 0.58, w - tw - 1, -h * 0.36); g.lineTo(w - tw - 1, 0); g.fillStyle = '#120e0c'; g.fill();
    g.strokeStyle = 'rgba(80,70,60,0.8)'; g.lineWidth = 0.3;
    for (let x = tw + 2; x < w - tw - 1; x += 1.4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, -h * 0.4); g.stroke(); }
    edge(g, [0, -h, tw, -h]); edge(g, [w - tw, -h, w, -h]);
  }
  function magetower(g, w, h, r, ruin) {
    const bodyH = h * 0.82;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.12, -bodyH); g.lineTo(w * 0.88, -bodyH); g.lineTo(w, 0); g.closePath();
    g.fillStyle = hgrad(g, 0, w, '#2c2838', '#4a4458', '#1f1c28'); g.fill();
    const rc = r() < 0.5 ? '#8f7bff' : '#5fd6ff';
    for (let i = 1; i < 5; i++) {
      const y = -(bodyH * i) / 5;
      if (!ruin) { R(g, w * 0.1, y - 0.8, w * 0.8, 1.6, rgba(rc, 0.12)); R(g, w * 0.12, y - 0.2, w * 0.76, 0.4, rgba(rc, 0.8)); }
      win(g, w * 0.5 - 0.4, y + 2, 0.8, 2.2, r(), 0.6, ruin);
    }
    tri(g, -0.6, -bodyH, w * 0.5, -h, w + 0.6, -bodyH, '#221d30');
    edge(g, [-0.6, -bodyH, w * 0.5, -h, w + 0.6, -bodyH]);
    if (!ruin) {
      g.beginPath(); g.arc(w * 0.5, -h - 1.5, 1.4, 0, TAU); g.fillStyle = rc; g.fill();
      const gr = g.createRadialGradient(w * 0.5, -h - 1.5, 0, w * 0.5, -h - 1.5, 6); gr.addColorStop(0, rgba(rc, 0.5)); gr.addColorStop(1, rgba(rc, 0));
      g.fillStyle = gr; g.fillRect(w * 0.5 - 6, -h - 7.5, 12, 12);
    }
  }
  function cathedral(g, w, h, r, ruin) {
    const naveH = h * 0.5, naveX = w * 0.28;
    R(g, naveX, -naveH, w - naveX, naveH, '#4b4743');
    stoneTex(g, w - naveX, naveH, 0, 'rgba(12,11,10,0.25)');
    tri(g, naveX - 1, -naveH, naveX + (w - naveX) / 2, -naveH - 12, w + 1, -naveH, '#2a2c33');
    for (let i = 0; i < 5; i++) {
      const x = naveX + 3 + i * ((w - naveX - 6) / 5);
      g.beginPath(); g.moveTo(x, -naveH * 0.2); g.lineTo(x, -naveH * 0.72); g.quadraticCurveTo(x + 1.3, -naveH * 0.86, x + 2.6, -naveH * 0.72); g.lineTo(x + 2.6, -naveH * 0.2); g.closePath();
      if (ruin) g.fillStyle = r() < 0.3 ? '#ff8a3a' : '#0e0a09';
      else { const cs = ['#c4603a', '#3a6ec4', '#c4a43a', '#7a3ac4']; g.fillStyle = cs[i % 4]; }
      g.fill();
    }
    for (let k = 0; k < 2; k++) {
      const tx = k === 0 ? 0 : naveX - 9, tw = 9, th = h * 0.72;
      R(g, tx, -th, tw, th, hgrad(g, tx, tx + tw, '#3c3935', '#56514b', '#2c2926'));
      stoneTex(g, tw, th, 0, 'rgba(10,9,8,0.25)');
      tri(g, tx - 0.5, -th, tx + tw / 2, -h, tx + tw + 0.5, -th, '#2a2c33');
      edge(g, [tx - 0.5, -th, tx + tw / 2, -h, tx + tw + 0.5, -th]);
      for (let i = 0; i < 4; i++) win(g, tx + tw / 2 - 0.6, -10 - i * 9, 1.2, 3.4, r(), 0.6, ruin);
    }
    R(g, 9, -h * 0.55, naveX - 18 + 0.01, h * 0.55, '#4f4b46');
    const rx = (naveX) / 2, ry = -h * 0.42;
    g.beginPath(); g.arc(rx, ry, 3.2, 0, TAU); g.fillStyle = ruin ? '#100b0a' : '#2a1a3a'; g.fill();
    if (!ruin) {
      const cs = ['#d0703a', '#3a7ad0', '#d0b43a', '#8a3ad0', '#3ad08a', '#d03a5a'];
      for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(rx, ry); g.arc(rx, ry, 2.8, (i * TAU) / 6, ((i + 1) * TAU) / 6); g.fillStyle = cs[i]; g.fill(); }
    }
    R(g, rx - 1.8, -5, 3.6, 5, '#140f0c');
    g.beginPath(); g.arc(naveX / 2, -h - 1, 1, 0, TAU); g.fillStyle = '#d4b060'; g.fill();
  }
  function castle(g, w, h, r, ruin) {
    const wallH = h * 0.4;
    R(g, 0, -wallH, w, wallH, '#45423e');
    stoneTex(g, w, wallH, 0, 'rgba(10,9,8,0.28)');
    for (let x = 0; x < w; x += 2.6) R(g, x, -wallH - 1.3, 1.5, 1.3, '#45423e');
    const kx = w * 0.3, kw = w * 0.4, kh = h * 0.78;
    R(g, kx, -kh, kw, kh - wallH, hgrad(g, kx, kx + kw, '#3c3935', '#55504a', '#2e2b28'));
    stoneTex(g, kw, kh - wallH, -wallH, 'rgba(10,9,8,0.25)');
    for (let x = kx; x < kx + kw; x += 2.4) R(g, x, -kh - 1.3, 1.4, 1.3, '#4a4642');
    for (let f = 0; f < 4; f++) for (let i = 0; i < 4; i++) win(g, kx + 2 + i * (kw / 4), -wallH - 3 - f * 6, 1.2, 2.2, r(), 0.65, ruin);
    for (const tx of [0, w * 0.18, w * 0.74, w - 8]) {
      const th = tx === 0 || tx === w - 8 ? h * 0.62 : h * 0.86, tw = 8;
      R(g, tx, -th, tw, th, hgrad(g, tx, tx + tw, '#36332f', '#524d47', '#282522'));
      tri(g, tx - 0.8, -th, tx + tw / 2, -th - 9, tx + tw + 0.8, -th, '#2c2537');
      edge(g, [tx - 0.8, -th, tx + tw / 2, -th - 9, tx + tw + 0.8, -th]);
      R(g, tx + tw / 2 - 0.1, -th - 12, 0.2, 3, '#555');
      g.fillStyle = '#7a1e22'; g.beginPath(); g.moveTo(tx + tw / 2 + 0.1, -th - 12); g.lineTo(tx + tw / 2 + 2.8, -th - 11.3); g.lineTo(tx + tw / 2 + 0.1, -th - 10.6); g.fill();
      for (let i = 0; i < 3; i++) win(g, tx + tw / 2 - 0.4, -wallH - 4 - i * 7, 0.8, 2, r(), 0.5, ruin);
    }
    R(g, w / 2 - 3, -6, 6, 6, '#120e0c');
  }
  function tree(g, w, h, r) {
    R(g, w / 2 - 0.5, -h * 0.35, 1, h * 0.35, '#1f1810');
    const cs = ['#1c2a1c', '#1a261a', '#223022'];
    for (let i = 0; i < 5; i++) {
      g.beginPath(); g.arc(w / 2 + (r() - 0.5) * w * 0.6, -h * 0.55 - r() * h * 0.3, w * (0.28 + r() * 0.15), 0, TAU);
      g.fillStyle = cs[i % 3]; g.fill();
    }
    g.beginPath(); g.arc(w / 2, -h * 0.8, w * 0.3, Math.PI * 1.1, Math.PI * 1.7); g.strokeStyle = 'rgba(140,160,200,0.18)'; g.lineWidth = 0.4; g.stroke();
  }

  /* ---------- 現代 ---------- */
  function house2(g, w, h, r, ruin) {
    const wallH = h * 0.62;
    const c = ['#55534f', '#4d4f52', '#5a5650'][Math.floor(r() * 3)];
    R(g, 0, -wallH, w, wallH, c);
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 0.15;
    for (let y = 0.6; y < wallH; y += 0.6) { g.beginPath(); g.moveTo(0, -y); g.lineTo(w, -y); g.stroke(); }
    win(g, 1.2, -wallH * 0.45, 2.2, 1.6, r(), 0.6, ruin); win(g, w - 3.4, -wallH * 0.45, 2.2, 1.6, r(), 0.6, ruin);
    win(g, w * 0.5 - 1, -wallH * 0.92, 2, 1.4, r(), 0.5, ruin);
    R(g, w * 0.5 - 0.6, -2.2, 1.2, 2.2, '#201c18');
    g.beginPath(); g.moveTo(-0.8, -wallH); g.lineTo(w * 0.5, -h); g.lineTo(w + 0.8, -wallH); g.closePath(); g.fillStyle = '#2a2e35'; g.fill();
    edge(g, [-0.8, -wallH, w * 0.5, -h, w + 0.8, -wallH]);
    R(g, w - 2.2, -wallH * 0.3, 1.6, 1, '#6a6a6a');
  }
  function shop(g, w, h, r, ruin) {
    R(g, 0, -h, w, h, '#3d3b3a');
    const signC = ['#ff3d6e', '#3dd6ff', '#ffd23d', '#7dff6a', '#ff8a3d'][Math.floor(r() * 5)];
    if (ruin) R(g, 0.8, -h * 0.42, w - 1.6, h * 0.36, '#0e0b0a');
    else {
      R(g, 0.8, -h * 0.42, w - 1.6, h * 0.36, '#d8e6e0');
      R(g, 0.8, -h * 0.42, w - 1.6, h * 0.36, 'rgba(255,240,200,0.35)');
      R(g, -1, -h * 0.48, w + 2, h * 0.5, 'rgba(230,240,255,0.06)');
    }
    R(g, -0.3, -h * 0.5, w + 0.6, 0.9, '#5a2a2a');
    if (!ruin) { R(g, 1, -h * 0.82, w - 2, h * 0.22, rgba(signC, 0.22)); R(g, 1.4, -h * 0.79, w - 2.8, h * 0.16, signC); }
    else R(g, 1.4, -h * 0.79, w - 2.8, h * 0.16, '#2a2422');
    for (let i = 0; i < Math.floor(w / 4); i++) win(g, 1.6 + i * 4, -h + 0.8, 2, 1, r(), 0.4, ruin);
    edge(g, [0, -h, w, -h]);
  }
  function apart(g, w, h, r, ruin) {
    R(g, 0, -h, w, h, hgrad(g, 0, w, '#4a4844', '#5a5753', '#3a3835'));
    const floors = Math.floor(h / 3);
    const cols = Math.max(2, Math.floor(w / 4));
    for (let f = 0; f < floors; f++) {
      const y = -f * 3 - 3;
      for (let i = 0; i < cols; i++) {
        const st = r();
        const col = st < 0.12 ? '#cfe6ff' : '#ffd99a';
        winC(g, 1 + i * ((w - 2) / cols), y + 0.6, (w - 2) / cols - 1, 1.8, st, 0.55, ruin, col);
      }
      R(g, 0, y + 2.4, w, 0.35, 'rgba(25,24,22,0.9)');
    }
    R(g, w * 0.6, -h - 3, 4, 3, '#3a3a3a');
    edge(g, [0, -h, w, -h]);
  }
  function danchi(g, w, h, r, ruin) {
    R(g, 0, -h, w, h, '#5a5852');
    const floors = Math.floor(h / 3);
    for (let f = 0; f < floors; f++) {
      const y = -f * 3 - 3;
      for (let x = 1; x < w - 2; x += 3.2) winC(g, x, y + 0.8, 2.2, 1.5, r(), 0.5, ruin, '#ffd99a');
      R(g, 0, y + 2.5, w, 0.4, '#3b3a37');
    }
    for (const sx of [w * 0.25, w * 0.72]) R(g, sx, -h - 1.5, 3, h + 1.5, '#4d4b47');
    edge(g, [0, -h, w, -h]);
  }
  function office(g, w, h, r, ruin) {
    R(g, 0, -h, w, h, hgrad(g, 0, w, '#1f2733', '#2e3a4a', '#171d26'));
    const cols = Math.floor(w / 2.4), rows = Math.floor(h / 3.4);
    for (let j = 0; j < rows; j++) {
      const litRow = r() < 0.5 ? 0.7 : 0.2;
      for (let i = 0; i < cols; i++) {
        const st = r();
        winC(g, 0.6 + i * 2.4, -j * 3.4 - 2.6, 1.6, 2.2, st, litRow, ruin, '#d6ebff');
      }
    }
    g.strokeStyle = 'rgba(140,160,190,0.12)'; g.lineWidth = 0.2;
    for (let i = 0; i <= cols; i++) { g.beginPath(); g.moveTo(i * 2.4 + 0.2, 0); g.lineTo(i * 2.4 + 0.2, -h); g.stroke(); }
    R(g, w * 0.2, -h - 2.4, w * 0.3, 2.4, '#262b33');
    R(g, w * 0.7, -h - 6, 0.3, 6, '#555');
    edge(g, [0, -h, w, -h], 'rgba(160,180,220,0.25)');
  }
  function tower2(g, w, h, r, ruin) {
    const tiers = [[0, w, h * 0.62], [w * 0.1, w * 0.8, h * 0.88], [w * 0.22, w * 0.56, h]];
    for (const [x0, ww, hh] of tiers) {
      R(g, x0, -hh, ww, hh, hgrad(g, x0, x0 + ww, '#18202b', '#2c3a4d', '#121820'));
      const cols = Math.floor(ww / 2.2), rows = Math.floor(hh / 3.2);
      for (let j = 0; j < rows; j++) {
        const lr = r() < 0.45 ? 0.75 : 0.15;
        for (let i = 0; i < cols; i++) winC(g, x0 + 0.5 + i * 2.2, -j * 3.2 - 2.4, 1.4, 2.0, r(), lr, ruin, '#d6ebff');
      }
      edge(g, [x0, -hh, x0 + ww, -hh], 'rgba(160,180,220,0.3)');
    }
    R(g, w * 0.5 - 0.25, -h - 14, 0.5, 14, '#5a5a5a');
    if (!ruin) {
      for (const [x, y] of [[w * 0.5, -h - 14], [w * 0.22, -h], [w * 0.78, -h]]) {
        const gr = g.createRadialGradient(x, y, 0, x, y, 3); gr.addColorStop(0, 'rgba(255,40,40,0.8)'); gr.addColorStop(1, 'rgba(255,40,40,0)');
        g.fillStyle = gr; g.fillRect(x - 3, y - 3, 6, 6);
      }
    }
  }
  function oiltank(g, w, h, r, ruin) {
    R(g, 0, -h, w, h, hgrad(g, 0, w, '#4c4e50', '#8a8c8e', '#3a3c3e'));
    g.beginPath(); g.ellipse(w / 2, -h, w / 2, 1.6, 0, Math.PI, TAU); g.fillStyle = '#6a6c6e'; g.fill();
    g.strokeStyle = 'rgba(30,30,30,0.6)'; g.lineWidth = 0.3;
    g.beginPath(); for (let i = 0; i <= 10; i++) { const x = (w * i) / 10, y = -(h * i) / 10; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke();
    for (let y = 3; y < h; y += 3) { g.beginPath(); g.moveTo(0, -y); g.lineTo(w, -y); g.strokeStyle = 'rgba(0,0,0,0.15)'; g.stroke(); }
    if (!ruin) { R(g, w - 1.5, -h - 0.6, 0.6, 0.6, '#ff3030'); }
    edge(g, [0, -h, w, -h], 'rgba(170,180,210,0.3)');
  }
  function refinery(g, w, h, r, ruin) {
    R(g, 0, -h * 0.35, w, h * 0.35, '#3a3c3e');
    const cols = [[w * 0.12, 3.2, h], [w * 0.32, 4, h * 0.8], [w * 0.55, 2.6, h * 0.95], [w * 0.75, 5, h * 0.6]];
    for (const [x, cw, ch] of cols) {
      R(g, x, -ch, cw, ch, hgrad(g, x, x + cw, '#3e4042', '#6a6c6e', '#2e3032'));
      for (let y = 4; y < ch; y += 5) R(g, x - 0.6, -y, cw + 1.2, 0.4, '#2a2c2e');
      if (!ruin) for (let y = 6; y < ch; y += 9) R(g, x + cw * 0.5 - 0.2, -y, 0.4, 0.4, '#ffd35a');
    }
    g.strokeStyle = '#555a5e'; g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(w * 0.15, -h * 0.5); g.lineTo(w * 0.35, -h * 0.5); g.lineTo(w * 0.35, -h * 0.3); g.lineTo(w * 0.78, -h * 0.3); g.stroke();
    R(g, w * 0.92, -h * 1.15, 1, h * 1.15, '#4a4c4e');
    if (!ruin) for (let i = 0; i < 8; i++) R(g, r() * w, -r() * h * 0.3, 0.5, 0.5, '#ffd35a');
  }
  function chimney(g, w, h, r, ruin) {
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.18, -h); g.lineTo(w * 0.82, -h); g.lineTo(w, 0); g.closePath();
    g.fillStyle = '#5a5a5a'; g.fill();
    for (let i = 0; i < 6; i++) {
      if (i % 2 === 0) {
        const y0 = -h + (i * h) / 14, y1 = y0 + h / 14;
        const k0 = 1 - (-y0) / h, k1 = 1 - (-y1) / h;
        g.beginPath(); g.moveTo(w * 0.18 * (1 - k0), y0); g.lineTo(w - w * 0.18 * (1 - k0), y0); g.lineTo(w - w * 0.18 * (1 - k1), y1); g.lineTo(w * 0.18 * (1 - k1), y1); g.closePath();
        g.fillStyle = '#7a2a26'; g.fill();
      }
    }
    if (!ruin) R(g, w / 2 - 0.3, -h - 0.6, 0.6, 0.6, '#ff3030');
  }
  function crane(g, w, h, r) {
    const mx = w * 0.7;
    g.strokeStyle = '#7a3a2a'; g.lineWidth = 0.5;
    for (const lx of [mx - 3, mx + 3]) { g.beginPath(); g.moveTo(lx, 0); g.lineTo(lx, -h * 0.8); g.stroke(); }
    for (let y = 0; y < h * 0.8; y += 4) { g.beginPath(); g.moveTo(mx - 3, -y); g.lineTo(mx + 3, -y - 4); g.moveTo(mx + 3, -y); g.lineTo(mx - 3, -y - 4); g.stroke(); }
    g.beginPath(); g.moveTo(0, -h * 0.82); g.lineTo(w, -h * 0.82); g.lineTo(w, -h * 0.86); g.lineTo(0, -h * 0.86); g.stroke();
    for (let x = 0; x < w; x += 3) { g.beginPath(); g.moveTo(x, -h * 0.82); g.lineTo(x + 1.5, -h * 0.86); g.stroke(); }
    R(g, mx - 3, -h * 0.82 - 4, 6, 4, '#5a3a2a');
    g.beginPath(); g.moveTo(w * 0.1, -h * 0.84); g.lineTo(w * 0.1, -h * 0.4); g.strokeStyle = '#888'; g.lineWidth = 0.15; g.stroke();
    R(g, w * 0.1 - 1, -h * 0.4, 2, 1.2, '#666');
    R(g, mx - 0.3, -h - 0.6, 0.6, 0.6, '#ff3030');
  }
  function power(g, w, h, r, ruin) {
    const cw = w * 0.45;
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(cw * 0.25, -h * 0.55, cw * 0.15, -h); g.lineTo(cw * 0.85, -h); g.quadraticCurveTo(cw * 0.75, -h * 0.55, cw, 0); g.closePath();
    g.fillStyle = hgrad(g, 0, cw, '#4a4a48', '#6e6e6a', '#383836'); g.fill();
    g.beginPath(); g.ellipse(cw / 2, -h, cw * 0.35, 1, 0, 0, TAU); g.fillStyle = '#222'; g.fill();
    R(g, cw + 2, -h * 0.5, w - cw - 2, h * 0.5, '#3e403e');
    for (let i = 0; i < 5; i++) win(g, cw + 4 + i * 4, -h * 0.35, 2.4, 1.6, r(), 0.8, ruin);
    for (let i = 0; i < 3; i++) R(g, cw + 4 + i * 6, -4, 4, 4, '#2c2e2c');
    if (!ruin) R(g, w - 2, -h * 0.5 - 1, 0.6, 0.6, '#ff3030');
  }
  function govt(g, w, h, r, ruin) {
    const baseH = h * 0.55;
    R(g, 0, -baseH, w, baseH, '#5a5650');
    R(g, -1, -baseH - 1.2, w + 2, 1.2, '#4a4640');
    for (let x = 3; x < w - 2; x += 4) { R(g, x, -baseH + 1, 1.6, baseH - 2, '#6e6a63'); }
    for (let f = 0; f < 3; f++) for (let x = 4.8; x < w - 3; x += 4) win(g, x, -baseH + 3 + f * 5, 1.4, 2.2, r(), 0.4, ruin);
    const dw = w * 0.32;
    R(g, w / 2 - dw / 2, -h * 0.72, dw, h * 0.72 - baseH, '#545049');
    g.beginPath(); g.ellipse(w / 2, -h * 0.72, dw * 0.45, h * 0.25, 0, Math.PI, TAU); g.fillStyle = '#3e4a46'; g.fill();
    edge(g, [w / 2 - dw * 0.45, -h * 0.72, w / 2, -h * 0.97, w / 2 + dw * 0.45, -h * 0.72]);
    R(g, w / 2 - 0.15, -h - 5, 0.3, 5, '#777');
    R(g, w / 2 + 0.15, -h - 5, 3.4, 2.2, '#8a2424');
    tri(g, -1, -baseH - 1.2, w * 0.15, -baseH - 6, w * 0.3, -baseH - 1.2, '#4a4640');
  }
  function radio(g, w, h, r, ruin) {
    const at = (y) => (w / 2) * (1 - Math.pow(y / h, 0.6) * 0.92);
    g.lineWidth = 0.5;
    const seg = 18;
    for (let i = 0; i < seg; i++) {
      const y0 = (h * i) / seg, y1 = (h * (i + 1)) / seg;
      g.strokeStyle = i % 2 === 0 ? '#9a3226' : '#b8b2a8';
      const a0 = at(y0), a1 = at(y1);
      g.beginPath();
      g.moveTo(w / 2 - a0, -y0); g.lineTo(w / 2 - a1, -y1); g.moveTo(w / 2 + a0, -y0); g.lineTo(w / 2 + a1, -y1);
      g.moveTo(w / 2 - a0, -y0); g.lineTo(w / 2 + a1, -y1); g.moveTo(w / 2 + a0, -y0); g.lineTo(w / 2 - a1, -y1);
      g.moveTo(w / 2 - a1, -y1); g.lineTo(w / 2 + a1, -y1);
      g.stroke();
    }
    const dy = h * 0.42, da = at(dy);
    R(g, w / 2 - da - 2, -dy - 4, da * 2 + 4, 4, '#2a2e36');
    for (let x = w / 2 - da - 1.5; x < w / 2 + da + 1.5; x += 1.4) win(g, x, -dy - 3.2, 0.9, 1.6, r(), 0.85, ruin);
    if (!ruin) for (let i = 1; i < 6; i++) { const y = (h * i) / 6; R(g, w / 2 - 0.3, -y, 0.6, 0.6, '#ff3030'); }
  }
  function highway(g, w, h, r, ruin) {
    for (let x = 6; x < w; x += 18) R(g, x, -h + 2, 3, h - 2, '#3a3a3a');
    R(g, 0, -h, w, 2.4, '#4a4a48');
    R(g, 0, -h - 1, w, 1, '#5a5a58');
    if (!ruin) for (let x = 3; x < w; x += 10) { R(g, x, -h - 4, 0.3, 3, '#666'); R(g, x - 0.5, -h - 4.2, 1.6, 0.5, '#ffe7a0'); }
  }

  /* ---------- 未来 ---------- */
  const NEON = ['#45e6ff', '#ff4fd8', '#7dffb0', '#ffb84f'];
  function neonLine(g, x0, y0, x1, y1, c, lw = 0.35) {
    g.strokeStyle = rgba(c, 0.2); g.lineWidth = lw * 5; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = c; g.lineWidth = lw; g.stroke();
  }
  function hab(g, w, h, r, ruin) {
    const c = NEON[Math.floor(r() * 2)];
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -h + 4); g.quadraticCurveTo(0, -h, 4, -h); g.lineTo(w - 4, -h); g.quadraticCurveTo(w, -h, w, -h + 4); g.lineTo(w, 0); g.closePath();
    g.fillStyle = hgrad(g, 0, w, '#141a26', '#222c3e', '#0e131c'); g.fill();
    for (let y = 4; y < h - 4; y += 4) {
      for (let x = 1.5; x < w - 2; x += 3) winC(g, x, -y - 1.2, 2.2, 1.2, r(), 0.6, ruin, '#9fe9ff');
    }
    if (!ruin) { neonLine(g, 0.4, 0, 0.4, -h + 4, c); neonLine(g, w - 0.4, 0, w - 0.4, -h + 4, c); neonLine(g, 4, -h + 0.4, w - 4, -h + 0.4, c); }
  }
  function spire(g, w, h, r, ruin) {
    const c = NEON[Math.floor(r() * 3)];
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.32, -h); g.lineTo(w * 0.68, -h); g.lineTo(w, 0); g.closePath();
    g.fillStyle = hgrad(g, 0, w, '#101624', '#1f2a40', '#0b0f19'); g.fill();
    for (let y = 6; y < h - 6; y += 5) {
      const k = 1 - y / h, half = (w / 2) * (0.32 + 0.68 * k) - 1.5;
      for (let x = w / 2 - half; x < w / 2 + half - 1; x += 2.6) winC(g, x, -y, 1.6, 1.4, r(), 0.5, ruin, '#a8f0ff');
    }
    if (!ruin) {
      neonLine(g, w / 2, 0, w / 2, -h, c, 0.4);
      for (const k of [0.45, 0.8]) { const y = -h * k, half = (w / 2) * (0.32 + 0.68 * (1 - k)); neonLine(g, w / 2 - half - 1.5, y, w / 2 + half + 1.5, y, c, 0.6); }
    }
    R(g, w / 2 - 0.2, -h - 18, 0.4, 18, '#3a4a5a');
    if (!ruin) { const gr = g.createRadialGradient(w / 2, -h - 18, 0, w / 2, -h - 18, 3); gr.addColorStop(0, 'rgba(255,60,90,0.9)'); gr.addColorStop(1, 'rgba(255,60,90,0)'); g.fillStyle = gr; g.fillRect(w / 2 - 3, -h - 21, 6, 6); }
  }
  function arco(g, w, h, r, ruin) {
    const tiers = 4;
    for (let i = 0; i < tiers; i++) {
      const k = i / tiers, ww = w * (1 - k * 0.55), x0 = (w - ww) / 2, hh = h * ((i + 1) / tiers);
      R(g, x0, -hh, ww, h / tiers + 0.5, hgrad(g, x0, x0 + ww, '#121a28', '#24324a', '#0d121c'));
      for (let y = -hh + 3; y < -hh + h / tiers - 1; y += 3) for (let x = x0 + 1.5; x < x0 + ww - 2; x += 2.6) winC(g, x, y, 1.6, 1.2, r(), 0.55, ruin, r() < 0.2 ? '#ffd28a' : '#a8f0ff');
      if (!ruin) {
        neonLine(g, x0, -hh, x0 + ww, -hh, NEON[i % 4], 0.6);
        g.fillStyle = 'rgba(80,200,120,0.6)'; for (let x = x0 + 1; x < x0 + ww - 1; x += 1.6) { g.beginPath(); g.arc(x, -hh - 0.6, 0.7, 0, TAU); g.fill(); }
      }
    }
    R(g, w / 2 - 0.3, -h - 26, 0.6, 26, '#3a4a5a');
  }
  function dome(g, w, h, r, ruin) {
    R(g, 0, -4, w, 4, '#1b2230');
    g.beginPath(); g.ellipse(w / 2, -4, w / 2, h - 4, 0, Math.PI, TAU); g.closePath();
    g.fillStyle = ruin ? 'rgba(20,26,36,0.95)' : 'rgba(60,170,170,0.28)'; g.fill();
    g.strokeStyle = 'rgba(160,230,255,0.45)'; g.lineWidth = 0.3; g.stroke();
    for (let i = 1; i < 6; i++) { g.beginPath(); g.ellipse(w / 2, -4, (w / 2) * (i / 6), h - 4, 0, Math.PI, TAU); g.stroke(); }
    if (!ruin) { for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(120,255,170,0.5)'; g.beginPath(); g.arc(w * 0.2 + r() * w * 0.6, -4 - r() * (h - 8) * 0.6, 0.8 + r(), 0, TAU); g.fill(); } }
  }
  function reactor(g, w, h, r, ruin) {
    R(g, 0, -h * 0.85, w, h * 0.85, hgrad(g, 0, w, '#141b28', '#283650', '#0f141e'));
    g.beginPath(); g.ellipse(w / 2, -h * 0.85, w / 2, 3, 0, Math.PI, TAU); g.fillStyle = '#1d2638'; g.fill();
    for (let x = 2; x < w; x += 4) R(g, x, -h * 0.85, 1, h * 0.85, 'rgba(0,0,0,0.25)');
    if (!ruin) {
      const gr = g.createRadialGradient(w / 2, -h * 0.45, 0, w / 2, -h * 0.45, w * 0.4); gr.addColorStop(0, 'rgba(200,250,255,1)'); gr.addColorStop(0.3, 'rgba(80,200,255,0.8)'); gr.addColorStop(1, 'rgba(40,120,255,0)');
      g.fillStyle = gr; g.fillRect(0, -h * 0.85, w, h * 0.8);
      R(g, w / 2 - 2.5, -h * 0.6, 5, h * 0.3, 'rgba(210,250,255,0.9)');
    }
    R(g, w * 0.2, -h, 2, h * 0.15, '#2a3446'); R(g, w * 0.7, -h, 2, h * 0.15, '#2a3446');
  }
  function pylon(g, w, h, r, ruin) {
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.38, -h * 0.9); g.lineTo(w * 0.62, -h * 0.9); g.lineTo(w, 0); g.closePath();
    g.fillStyle = hgrad(g, 0, w, '#1a2232', '#33425e', '#121826'); g.fill();
    if (!ruin) {
      neonLine(g, w / 2, -2, w / 2, -h * 0.88, '#45e6ff', 0.3);
      const gr = g.createRadialGradient(w / 2, -h * 0.95, 0, w / 2, -h * 0.95, 6); gr.addColorStop(0, 'rgba(220,255,255,1)'); gr.addColorStop(0.3, 'rgba(80,220,255,0.7)'); gr.addColorStop(1, 'rgba(80,220,255,0)');
      g.fillStyle = gr; g.fillRect(w / 2 - 6, -h * 0.95 - 6, 12, 12);
    }
  }
  function solar(g, w, h, r) {
    for (let x = 0; x < w - 3; x += 4.4) {
      R(g, x + 1.6, -h * 0.5, 0.6, h * 0.5, '#2a3040');
      g.beginPath(); g.moveTo(x, -h * 0.45); g.lineTo(x + 4, -h); g.lineTo(x + 4.2, -h + 0.8); g.lineTo(x + 0.2, -h * 0.35); g.closePath();
      g.fillStyle = '#1a2a52'; g.fill(); g.strokeStyle = 'rgba(120,170,255,0.4)'; g.lineWidth = 0.15; g.stroke();
    }
  }
  function aitower(g, w, h, r, ruin) {
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.18, -h * 0.75); g.lineTo(w * 0.38, -h); g.lineTo(w * 0.62, -h); g.lineTo(w * 0.82, -h * 0.75); g.lineTo(w, 0); g.closePath();
    g.fillStyle = hgrad(g, 0, w, '#0b0e18', '#1b2236', '#070910'); g.fill();
    for (let y = 8; y < h * 0.95; y += 6) {
      const half = y < h * 0.75 ? (w / 2) * (1 - (y / (h * 0.75)) * 0.64) : (w / 2) * 0.36 - ((y - h * 0.75) / (h * 0.25)) * w * 0.12;
      for (let x = w / 2 - half + 1.5; x < w / 2 + half - 2; x += 3) winC(g, x, -y, 1.6, 1.2, r(), 0.45, ruin, '#ff6a6a');
    }
    if (!ruin) {
      neonLine(g, w / 2, 0, w / 2, -h, '#ff3a5a', 0.5);
      const ey = -h * 0.82;
      const gr = g.createRadialGradient(w / 2, ey, 0, w / 2, ey, 14); gr.addColorStop(0, 'rgba(255,240,240,1)'); gr.addColorStop(0.2, 'rgba(255,40,70,0.9)'); gr.addColorStop(1, 'rgba(255,0,40,0)');
      g.fillStyle = gr; g.fillRect(w / 2 - 14, ey - 14, 28, 28);
      g.beginPath(); g.ellipse(w / 2, ey, 5, 2.4, 0, 0, TAU); g.fillStyle = '#fff'; g.fill();
      g.beginPath(); g.arc(w / 2, ey, 1.5, 0, TAU); g.fillStyle = '#ff1030'; g.fill();
    }
    R(g, w / 2 - 0.4, -h - 40, 0.8, 40, '#2a3446');
  }

  const DRAW = { cottage: (g, w, h, r, ru) => house(g, w, h, r, ru), house, barn, windmill, chapel, stone, tavern, tower, wall, gate, magetower, cathedral, castle, tree,
    house2, shop, apart, danchi, office, tower2, oiltank, refinery, chimney, crane, power, govt, radio, highway,
    hab, spire, arco, dome, reactor, pylon, solar, aitower };
  const TOP_EXTRA = { tower: 4, castle: 14, cathedral: 3, magetower: 9, tower2: 16, office: 7, apart: 4, radio: 2, spire: 22, arco: 28, aitower: 44, pylon: 8, govt: 6, chimney: 2, crane: 2, chapel: 2, danchi: 2 };

  /* 建物ごとにスプライト（無傷・損壊・瓦礫）を作る */
  function sprites(b, ppm) {
    const pad = 3, top = TOP_EXTRA[b.t] || 1;
    let s = ppm;
    const maxDim = 1300;
    s = Math.min(s, maxDim / (b.h + pad + top), maxDim / (b.w + pad * 2));
    const W = (b.w + pad * 2) * s, H = (b.h + pad + top) * s;
    const draw = DRAW[b.t];
    const make = (ruin) => {
      const c = makeCanvas(W, H), g = c.getContext('2d');
      g.translate(pad * s, (b.h + top) * s); g.scale(s, s);
      g.lineJoin = 'round';
      draw(g, b.w, b.h, mulberry32(b.seed), ruin);
      if (ruin && !BLD[b.t].deco) {
        const r = mulberry32(b.seed + 99);
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(-pad, -b.h - top, b.w + pad * 2, b.h + top + pad);
        for (let i = 0; i < 6; i++) {
          const x = r() * b.w, y = -r() * b.h, rr = 2 + r() * Math.min(b.w, b.h) * 0.3;
          const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
        }
        g.globalCompositeOperation = 'source-over';
        g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineWidth = 0.35;
        for (let i = 0; i < 4; i++) {
          let x = r() * b.w, y = -b.h * (0.5 + r() * 0.5);
          g.beginPath(); g.moveTo(x, y);
          for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 3; y += 1 + r() * b.h * 0.08; g.lineTo(x, y); }
          g.stroke();
        }
        g.globalCompositeOperation = 'destination-out';
        const bites = 1 + Math.floor(r() * 3);
        for (let i = 0; i < bites; i++) {
          const cx = r() * b.w, dep = b.h * (0.12 + r() * 0.25), wd = b.w * (0.2 + r() * 0.3);
          g.beginPath(); g.moveTo(cx - wd, -b.h - top - 2);
          const n = 6;
          for (let k = 0; k <= n; k++) { const x = cx - wd + (2 * wd * k) / n; const y = -b.h + dep * (1 - Math.pow((2 * k) / n - 1, 2)) * (0.6 + r() * 0.5); g.lineTo(x, y); }
          g.lineTo(cx + wd, -b.h - top - 2); g.closePath(); g.fill();
        }
        for (let i = 0; i < 2; i++) {
          if (b.h < 12) break;
          const x = b.w * (0.2 + r() * 0.6), y = -b.h * (0.25 + r() * 0.5), rr = Math.min(b.w, b.h) * (0.06 + r() * 0.08);
          g.beginPath(); for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU, d = rr * (0.6 + r() * 0.6); g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); } g.closePath(); g.fill();
        }
        g.globalCompositeOperation = 'source-over';
      }
      return c;
    };
    // 瓦礫
    const rw = b.w * 1.3, rh = clamp(b.h * 0.14, 2.2, 15);
    const RW = (rw + pad * 2) * s, RH = (rh + pad + 1) * s;
    const rub = makeCanvas(RW, RH), rg = rub.getContext('2d');
    rg.translate(pad * s, (rh + 1) * s); rg.scale(s, s);
    const r = mulberry32(b.seed + 5);
    const base = BLD[b.t].deco ? '#1a1f16' : ['#3a3530', '#2e2b28', '#35302b'][Math.floor(r() * 3)];
    rg.beginPath(); rg.moveTo(0, 0);
    const n = 9;
    for (let k = 0; k <= n; k++) { const x = (rw * k) / n, y = -rh * Math.sin((k / n) * Math.PI) * (0.6 + r() * 0.5); rg.lineTo(x, y); }
    rg.lineTo(rw, 0); rg.closePath();
    const gr = rg.createLinearGradient(0, -rh, 0, 0); gr.addColorStop(0, shade(base, 0.08)); gr.addColorStop(1, '#0e0c0b');
    rg.fillStyle = gr; rg.fill();
    for (let i = 0; i < 14; i++) {
      const x = r() * rw, y = -r() * rh * 0.7, cw = 0.6 + r() * 2.4;
      rg.save(); rg.translate(x, y); rg.rotate((r() - 0.5) * 1.4);
      rg.fillStyle = shade(base, -0.2 + r() * 0.3); rg.fillRect(-cw / 2, -cw / 3, cw, cw * 0.66); rg.restore();
    }
    rg.strokeStyle = '#4a3a30'; rg.lineWidth = 0.25;
    for (let i = 0; i < 5; i++) { const x = r() * rw; rg.beginPath(); rg.moveTo(x, -r() * rh * 0.4); rg.lineTo(x + (r() - 0.5) * 4, -rh * (0.5 + r() * 0.6)); rg.stroke(); }
    for (let i = 0; i < 8; i++) { rg.fillStyle = 'rgba(255,120,40,0.85)'; rg.fillRect(r() * rw, -r() * rh * 0.5, 0.4, 0.4); }
    return { intact: make(false), ruin: make(true), rubble: rub, s, pad, top, rw, rh };
  }

  /* ---------- 背景 ---------- */
  function strip(kind, layer, W, H, seed) {
    const c = makeCanvas(W, H), g = c.getContext('2d');
    const r = mulberry32(seed);
    const far = layer === 0;
    if (kind === 'medieval') {
      if (far) {
        g.beginPath(); g.moveTo(0, H);
        let y = H * 0.45;
        for (let x = 0; x <= W; x += 30) { y = clamp(y + (r() - 0.5) * H * 0.12, H * 0.2, H * 0.7); g.lineTo(x, y); }
        g.lineTo(W, H); g.closePath();
        g.fillStyle = '#151a2c'; g.fill();
        g.strokeStyle = 'rgba(140,155,210,0.2)'; g.lineWidth = 1.5; g.stroke();
      } else {
        g.fillStyle = '#0f1220';
        for (let x = 0; x < W; x += 14 + r() * 20) { const rr = 10 + r() * 22; g.beginPath(); g.arc(x, H * 0.72, rr, 0, TAU); g.fill(); }
        g.fillRect(0, H * 0.72, W, H * 0.3);
        for (let i = 0; i < 6; i++) {
          const x = r() * W, tw = 8 + r() * 14, th = H * (0.18 + r() * 0.25);
          g.fillRect(x, H * 0.72 - th, tw, th);
          g.beginPath(); g.moveTo(x - 3, H * 0.72 - th); g.lineTo(x + tw / 2, H * 0.72 - th - tw * 1.2); g.lineTo(x + tw + 3, H * 0.72 - th); g.fill();
          for (let k = 0; k < 3; k++) if (r() < 0.6) { g.fillStyle = 'rgba(255,190,100,0.7)'; g.fillRect(x + tw / 2 - 1, H * 0.72 - th + 6 + k * 10, 2, 3); g.fillStyle = '#0f1220'; }
        }
      }
    } else if (kind === 'modern') {
      const base = far ? '#121622' : '#0d1018';
      let x = 0;
      while (x < W) {
        const bw = (far ? 18 : 26) + r() * 40, bh = H * (far ? 0.2 + r() * 0.45 : 0.15 + r() * 0.55);
        g.fillStyle = base; g.fillRect(x, H - bh, bw, bh);
        for (let yy = H - bh + 5; yy < H - 4; yy += far ? 7 : 9) for (let xx = x + 3; xx < x + bw - 3; xx += far ? 5 : 7) {
          if (r() < (far ? 0.25 : 0.35)) { g.fillStyle = r() < 0.7 ? 'rgba(255,220,150,0.55)' : 'rgba(190,220,255,0.5)'; g.fillRect(xx, yy, far ? 2 : 3, far ? 2 : 3); }
        }
        if (r() < 0.4) { g.fillStyle = '#ff3030'; g.fillRect(x + bw / 2 - 1, H - bh - 3, 2, 2); }
        x += bw + r() * 6;
      }
    } else {
      let x = 0;
      const base = far ? '#0e1426' : '#0a0f1c';
      while (x < W) {
        const bw = (far ? 14 : 22) + r() * 34, bh = H * (far ? 0.3 + r() * 0.55 : 0.2 + r() * 0.55);
        g.fillStyle = base;
        g.beginPath(); g.moveTo(x, H); g.lineTo(x + bw * 0.2, H - bh); g.lineTo(x + bw * 0.8, H - bh); g.lineTo(x + bw, H); g.fill();
        const nc = NEON[Math.floor(r() * 4)];
        g.fillStyle = rgba(nc, far ? 0.35 : 0.55); g.fillRect(x + bw / 2 - 0.8, H - bh, 1.6, bh);
        for (let yy = H - bh + 8; yy < H - 4; yy += 8) if (r() < 0.4) { g.fillStyle = 'rgba(160,240,255,0.45)'; g.fillRect(x + bw * 0.3, yy, bw * 0.4, 1.5); }
        x += bw + r() * 10;
      }
      if (far) { g.fillStyle = 'rgba(12,18,34,0.9)'; for (let i = 0; i < 3; i++) { const px = r() * W, py = H * (0.15 + r() * 0.25); g.fillRect(px, py, 60 + r() * 60, 6); g.fillStyle = 'rgba(69,230,255,0.5)'; g.fillRect(px, py + 6, 60, 1); g.fillStyle = 'rgba(12,18,34,0.9)'; } }
    }
    return c;
  }

  const SKY = {
    medieval: ['#070a17', '#141a33', '#2f2536'],
    modern: ['#07080f', '#151827', '#3a2622'],
    future: ['#04060f', '#0d1630', '#2a1a3e'],
  };
  const GROUND = { medieval: ['#1d1913', '#0b0907'], modern: ['#1a1a1c', '#09090a'], future: ['#10141f', '#05070c'] };

  return { sprites, strip, SKY, GROUND, NEON };
})();
