// Procedural textures (stone floors, wall tops, fog, grain) baked once at startup into CSS variables.
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x6d2b79f5 >>> 0) / 4294967296); }

function canvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function noiseLayer(ctx, size, cells, alpha, r, tint = [255, 255, 255]) {
  const [g, gx] = canvas(cells, cells);
  const img = gx.createImageData(cells, cells);
  for (let i = 0; i < cells * cells; i++) {
    const v = r();
    img.data[i * 4] = tint[0] * v; img.data[i * 4 + 1] = tint[1] * v; img.data[i * 4 + 2] = tint[2] * v; img.data[i * 4 + 3] = 255;
  }
  gx.putImageData(img, 0, 0);
  ctx.save(); ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.globalCompositeOperation = 'overlay';
  ctx.drawImage(g, 0, 0, size, size);
  ctx.restore();
}

function cracks(ctx, size, r, n, color) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    let x = r() * size, y = r() * size, a = r() * Math.PI * 2;
    ctx.lineWidth = 0.6 + r() * 1.1;
    ctx.beginPath(); ctx.moveTo(x, y);
    const steps = 4 + Math.floor(r() * 8);
    for (let s = 0; s < steps; s++) { a += (r() - 0.5) * 1.3; x += Math.cos(a) * (3 + r() * 7); y += Math.sin(a) * (3 + r() * 7); ctx.lineTo(x, y); }
    ctx.stroke();
  }
  ctx.restore();
}

function bevel(ctx, size, light, dark, w = 5) {
  const gT = ctx.createLinearGradient(0, 0, 0, w); gT.addColorStop(0, light); gT.addColorStop(1, 'transparent');
  ctx.fillStyle = gT; ctx.fillRect(0, 0, size, w);
  const gL = ctx.createLinearGradient(0, 0, w, 0); gL.addColorStop(0, light); gL.addColorStop(1, 'transparent');
  ctx.fillStyle = gL; ctx.fillRect(0, 0, w, size);
  const gB = ctx.createLinearGradient(0, size, 0, size - w * 1.6); gB.addColorStop(0, dark); gB.addColorStop(1, 'transparent');
  ctx.fillStyle = gB; ctx.fillRect(0, size - w * 1.6, size, w * 1.6);
  const gR = ctx.createLinearGradient(size, 0, size - w * 1.6, 0); gR.addColorStop(0, dark); gR.addColorStop(1, 'transparent');
  ctx.fillStyle = gR; ctx.fillRect(size - w * 1.6, 0, w * 1.6, size);
}

function floorTile(seed) {
  const S = 128, [c, x] = canvas(S, S), r = rng(seed);
  const base = x.createLinearGradient(0, 0, S, S);
  base.addColorStop(0, '#1b2725'); base.addColorStop(1, '#111a18');
  x.fillStyle = base; x.fillRect(0, 0, S, S);
  noiseLayer(x, S, 6, 0.38, r); noiseLayer(x, S, 14, 0.24, r); noiseLayer(x, S, 40, 0.16, r);
  // flagstone seams
  x.save(); x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 1.4;
  const split = 0.35 + r() * 0.3;
  x.beginPath(); x.moveTo(0, S * split); x.lineTo(S * (0.4 + r() * 0.2), S * (split + (r() - 0.5) * 0.06)); x.lineTo(S, S * (split + (r() - 0.5) * 0.08)); x.stroke();
  x.beginPath(); const vx = S * (0.3 + r() * 0.4); x.moveTo(vx, S * split); x.lineTo(vx + (r() - 0.5) * 8, S); x.stroke();
  x.restore();
  cracks(x, S, r, 3, 'rgba(0,0,0,.28)');
  // moss specks
  for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(${90 + r() * 40},${130 + r() * 50},${90 + r() * 30},${0.05 + r() * 0.1})`; x.beginPath(); x.arc(r() * S, r() * S, 0.6 + r() * 2.2, 0, 7); x.fill(); }
  bevel(x, S, 'rgba(255,255,255,.07)', 'rgba(0,0,0,.45)', 6);
  return c.toDataURL('image/png');
}

function wallTile(seed) {
  const S = 128, [c, x] = canvas(S, S), r = rng(seed);
  const base = x.createLinearGradient(0, 0, 0, S);
  base.addColorStop(0, '#7b847c'); base.addColorStop(1, '#4f5a54');
  x.fillStyle = base; x.fillRect(0, 0, S, S);
  noiseLayer(x, S, 5, 0.5, r); noiseLayer(x, S, 18, 0.3, r); noiseLayer(x, S, 48, 0.22, r);
  // brick courses
  x.save(); x.strokeStyle = 'rgba(0,0,0,.42)'; x.lineWidth = 1.6;
  const rows = 3;
  for (let i = 1; i < rows; i++) { const y = (S / rows) * i + (r() - 0.5) * 4; x.beginPath(); x.moveTo(0, y); x.lineTo(S, y + (r() - 0.5) * 3); x.stroke(); }
  for (let i = 0; i < rows; i++) {
    const y0 = (S / rows) * i, y1 = (S / rows) * (i + 1), off = (i % 2) * S * 0.25;
    for (let k = 0; k < 2; k++) { const vx = off + k * S * 0.5 + (r() - 0.5) * 6; x.beginPath(); x.moveTo(vx, y0); x.lineTo(vx + (r() - 0.5) * 3, y1); x.stroke(); }
  }
  x.restore();
  x.save(); x.strokeStyle = 'rgba(255,255,255,.06)'; x.lineWidth = 1;
  for (let i = 0; i < 18; i++) { const px = r() * S, py = r() * S; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 10, py + (r() - 0.5) * 3); x.stroke(); }
  x.restore();
  cracks(x, S, r, 2, 'rgba(0,0,0,.3)');
  bevel(x, S, 'rgba(255,255,255,.13)', 'rgba(0,0,0,.5)', 7);
  return c.toDataURL('image/png');
}

function fogTile() {
  const S = 256, [c, x] = canvas(S, S), r = rng(7);
  x.clearRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) {
    const px = r() * S, py = r() * S, rad = 18 + r() * 60, a = 0.03 + r() * 0.07;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const gx = px + ox, gy = py + oy;
      if (gx + rad < 0 || gy + rad < 0 || gx - rad > S || gy - rad > S) continue;
      const g = x.createRadialGradient(gx, gy, 0, gx, gy, rad);
      g.addColorStop(0, `rgba(214,232,226,${a})`); g.addColorStop(1, 'rgba(214,232,226,0)');
      x.fillStyle = g; x.fillRect(gx - rad, gy - rad, rad * 2, rad * 2);
    }
  }
  return c.toDataURL('image/png');
}

function grainTile() {
  const S = 128, [c, x] = canvas(S, S), img = x.createImageData(S, S), r = rng(99);
  for (let i = 0; i < S * S; i++) { const v = 128 + (r() - 0.5) * 90; img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 22; }
  x.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

export function bakeTextures() {
  const root = document.documentElement.style;
  try {
    for (let i = 0; i < 4; i++) root.setProperty(`--tex-floor-${i}`, `url(${floorTile(11 + i * 97)})`);
    root.setProperty('--tex-wall', `url(${wallTile(5)})`);
    root.setProperty('--tex-wall-2', `url(${wallTile(41)})`);
    root.setProperty('--tex-fog', `url(${fogTile()})`);
    root.setProperty('--tex-grain', `url(${grainTile()})`);
  } catch (e) { /* canvas unavailable: CSS fallbacks are used */ }
}
