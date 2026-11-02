// PLATEAUの建物テクスチャ（建物ごとの画像）を、タイルごとのテクスチャアトラスへ詰め直す。
// - 使われているUV範囲だけを切り出す（未使用部分を配信しない）
// - 実寸あたりの画素密度（px/m）をそろえて縮小し、タイル単位の画素予算に収める
// - 各画像の周囲に端の画素を複製した余白を付け、ミップマップ時のにじみを抑える
// CityGMLのUVは左下原点、glTFは左上原点。
import sharp from 'sharp';

sharp.cache(false);

/**
 * @param {{key:string, src:string|Buffer, uvBox:number[], scale:number}[]} items
 *   uvBox = [u0,v0,u1,v1]（CityGML UV, 1を超える繰り返しも可）, scale = 元画像に対する縮小率(0〜1]
 * @param {{pageSize?:number, padding?:number, quality?:number, background?:string, concurrency?:number}} opts
 */
export async function buildAtlas(items, opts = {}) {
  const P = opts.pageSize ?? 2048, pad = opts.padding ?? 4, q = opts.quality ?? 82;
  const meta = new Map();
  const conc = opts.concurrency ?? 6;
  // 1) 切り出し・縮小
  const parts = [];
  await pool(items, conc, async (it) => {
    let m = meta.get(it.src);
    if (!m) { m = await sharp(it.src).metadata(); meta.set(it.src, m); }
    const W = m.width, H = m.height;
    let [u0, v0, u1, v1] = it.uvBox.map((x, i) => (i < 2 ? Math.max(-4, x) : Math.min(5, x)));
    if (!(u1 > u0)) u1 = u0 + 1 / W;
    if (!(v1 > v0)) v1 = v0 + 1 / H;
    const left = Math.floor(u0 * W), right = Math.ceil(u1 * W), top = Math.floor((1 - v1) * H), bottom = Math.ceil((1 - v0) * H);
    const cw = Math.max(1, right - left), ch = Math.max(1, bottom - top);
    let w = Math.max(2, Math.round(cw * it.scale)), h = Math.max(2, Math.round(ch * it.scale));
    const lim = P - 2 * pad;
    if (w > lim || h > lim) { const k = Math.min(lim / w, lim / h); w = Math.max(2, Math.floor(w * k)); h = Math.max(2, Math.floor(h * k)); }
    // 範囲外（繰り返し）なら元画像を繰り返して広げてから切り出す
    const exL = Math.max(0, -left), exT = Math.max(0, -top), exR = Math.max(0, right - W), exB = Math.max(0, bottom - H);
    let img = sharp(it.src).removeAlpha().toColourspace('srgb');
    if (exL || exT || exR || exB) {
      // repeat は1周期分まで。大きな繰り返しは端で打ち切る（極端な例のみ）
      const cap = (n, s) => Math.min(n, s * 4);
      img = sharp(await img.extend({ left: cap(exL, W), top: cap(exT, H), right: cap(exR, W), bottom: cap(exB, H), extendWith: 'repeat' }).toBuffer());
    }
    const L = left + Math.min(exL, W * 4), T = top + Math.min(exT, H * 4);
    const buf = await img.extract({ left: Math.max(0, L), top: Math.max(0, T), width: cw, height: ch })
      .resize(w, h, { fit: 'fill', kernel: 'lanczos3' })
      .extend({ top: pad, bottom: pad, left: pad, right: pad, extendWith: 'copy' })
      .raw().toBuffer({ resolveWithObject: true });
    parts.push({ key: it.key, W, H, left, top, cw, ch, w, h, raw: buf.data, ch3: buf.info.channels });
  });
  // 2) 棚詰め（高さの高い順に左から並べ、溢れたら次の段・次のページ）。
  //    ページ幅を何通りか試し、合計面積（＝GPUメモリ）が最小になる幅を使う
  parts.sort((a, b) => b.h - a.h || b.w - a.w || (a.key < b.key ? -1 : 1));
  const maxW = Math.max(...parts.map((p) => p.w + 2 * pad));
  const shelf = (W) => {
    const pages = [];
    const newPage = () => { const pg = { items: [], x: 0, y: 0, shelf: 0, used: 0, width: W }; pages.push(pg); return pg; };
    let page = null;
    const pos = [];
    for (const p of parts) {
      const pw = p.w + 2 * pad, ph = p.h + 2 * pad;
      if (!page) page = newPage();
      if (page.x + pw > W) { page.y += page.shelf; page.x = 0; page.shelf = 0; }
      if (page.y + ph > P) page = newPage();
      pos.push([pages.length - 1, page.x, page.y]);
      page.items.push(p);
      page.x += pw; page.shelf = Math.max(page.shelf, ph); page.used = Math.max(page.used, page.y + ph);
    }
    const area = pages.reduce((a, pg) => a + W * Math.ceil(pg.used / 4) * 4, 0);
    return { pages, pos, area };
  };
  let best = null;
  for (let W = P; W >= Math.max(64, maxW); W = Math.floor(W / 2)) { const r = shelf(W); if (!best || r.area < best.area) best = r; }
  for (const W of [P * 0.75, P * 0.625].map((v) => Math.ceil(v / 4) * 4)) if (W >= maxW) { const r = shelf(W); if (r.area < best.area) best = r; }
  const pages = best.pages;
  parts.forEach((p, i) => { [p.page, p.x, p.y] = best.pos[i]; });
  // 3) 合成
  const out = { pages: [], map: new Map() };
  for (let i = 0; i < pages.length; i++) {
    const pg = pages[i];
    const width = pg.width, height = Math.min(P, Math.ceil(pg.used / 4) * 4);
    const comp = pg.items.map((p) => ({ input: p.raw, raw: { width: p.w + 2 * pad, height: p.h + 2 * pad, channels: p.ch3 }, left: p.x, top: p.y }));
    const jpeg = await sharp({ create: { width, height, channels: 3, background: opts.background || '#808080' } })
      .composite(comp).jpeg({ quality: q, mozjpeg: true, chromaSubsampling: '4:2:0' }).toBuffer();
    out.pages.push({ width, height, jpeg, texels: width * height });
    for (const p of pg.items) out.map.set(p.key, { page: i, x: p.x + pad, y: p.y + pad, w: p.w, h: p.h, W: p.W, H: p.H, left: p.left, top: p.top, cw: p.cw, ch: p.ch, pageW: width, pageH: height });
  }
  return out;
}

/** CityGMLのUV(u,v) → アトラス上のglTF UV */
export function mapUV(m, u, v) {
  const sx = u * m.W, sy = (1 - v) * m.H; // 元画像の画素（左上原点）
  const X = m.x + ((sx - m.left) / m.cw) * m.w;
  const Y = m.y + ((sy - m.top) / m.ch) * m.h;
  return [X / m.pageW, Y / m.pageH];
}

async function pool(items, n, fn) {
  let i = 0;
  const run = async () => { while (i < items.length) { const k = i++; await fn(items[k]); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
}
