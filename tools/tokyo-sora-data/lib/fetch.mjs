// 取得元ファイルのダウンロード（キャッシュ・再試行・SHA-256記録）。
// キャッシュは tools/tokyo-sora-data/.cache/（git管理外）。同じURLは再取得しない。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const CACHE_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '.cache');

export function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

export function cachePath(url) {
  const u = new URL(url);
  const safe = (u.hostname + u.pathname).replace(/[^A-Za-z0-9._\-\/%]/g, '_').replace(/\.\.+/g, '_');
  return path.join(CACHE_DIR, safe + (u.search ? '_' + sha256(Buffer.from(u.search)).slice(0, 12) : ''));
}

/**
 * URLを取得してキャッシュのパスを返す。
 * @param {string} url
 * @param {{expectSha256?:string, retries?:number, log?:(s:string)=>void, accept404?:boolean, offline?:boolean}} [o]
 * @returns {Promise<{file:string, bytes:number, sha256:string, fromCache:boolean} | null>}
 */
export async function download(url, o = {}) {
  if (url.startsWith('file:')) {
    const file = decodeURIComponent(new URL(url).pathname);
    const buf = fs.readFileSync(file);
    return { file, bytes: buf.length, sha256: sha256(buf), fromCache: true };
  }
  const file = cachePath(url);
  if (fs.existsSync(file)) {
    const buf = fs.readFileSync(file);
    const h = sha256(buf);
    if (!o.expectSha256 || o.expectSha256 === h) return { file, bytes: buf.length, sha256: h, fromCache: true };
  }
  if (o.offline) throw new Error('offline and not cached: ' + url);
  const retries = o.retries ?? 3;
  let last;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'tokyo-sora-data (https://github.com/rkkrk18941/compile-game)' } });
      if (res.status === 404 && o.accept404) return null;
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
      const buf = Buffer.from(await res.arrayBuffer());
      const h = sha256(buf);
      if (o.expectSha256 && o.expectSha256 !== h) throw new Error(`sha256 mismatch for ${url}: ${h}`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + '.part', buf); fs.renameSync(file + '.part', file);
      o.log?.(`  取得 ${url} (${(buf.length / 1e6).toFixed(2)} MB)`);
      return { file, bytes: buf.length, sha256: h, fromCache: false };
    } catch (e) {
      last = e;
      if (/sha256 mismatch/.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw last;
}

export async function fetchJSON(url, o = {}) {
  const r = await download(url, o);
  return r ? JSON.parse(fs.readFileSync(r.file, 'utf8')) : null;
}
