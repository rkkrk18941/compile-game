// 最小のZIP読み取り（中央ディレクトリ、無圧縮/Deflate、ZIP64対応）。
// PLATEAUのコードリストZIPや、配布ZIP（数GB）から必要なファイルだけを取り出すのに使う。
import fs from 'node:fs';
import zlib from 'node:zlib';

export function openZip(file) {
  const fd = fs.openSync(file, 'r');
  const size = fs.fstatSync(fd).size;
  const read = (pos, len) => { const b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, pos); return b; };
  const tailLen = Math.min(size, 65557 + 20);
  const tail = read(size - tailLen, tailLen);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip: ' + file);
  let count = tail.readUInt16LE(eocd + 10), cdSize = tail.readUInt32LE(eocd + 12), cdOff = tail.readUInt32LE(eocd + 16);
  if (cdOff === 0xffffffff || count === 0xffff) {
    const loc = eocd - 20;
    if (loc >= 0 && tail.readUInt32LE(loc) === 0x07064b50) {
      const z64 = Number(tail.readBigUInt64LE(loc + 8));
      const r = read(z64, 56);
      count = Number(r.readBigUInt64LE(32)); cdSize = Number(r.readBigUInt64LE(40)); cdOff = Number(r.readBigUInt64LE(48));
    }
  }
  const cd = read(cdOff, cdSize);
  const entries = new Map();
  for (let p = 0, n = 0; n < count && p < cd.length; n++) {
    if (cd.readUInt32LE(p) !== 0x02014b50) break;
    const method = cd.readUInt16LE(p + 10), flags = cd.readUInt16LE(p + 8);
    let csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24);
    const nl = cd.readUInt16LE(p + 28), el = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32);
    let off = cd.readUInt32LE(p + 42);
    const nameBuf = cd.subarray(p + 46, p + 46 + nl);
    const name = (flags & 0x800) ? nameBuf.toString('utf8') : decodeName(nameBuf);
    const extra = cd.subarray(p + 46 + nl, p + 46 + nl + el);
    for (let q = 0; q + 4 <= extra.length;) {
      const id = extra.readUInt16LE(q), len = extra.readUInt16LE(q + 2);
      if (id === 1) {
        let k = q + 4;
        if (usize === 0xffffffff) { usize = Number(extra.readBigUInt64LE(k)); k += 8; }
        if (csize === 0xffffffff) { csize = Number(extra.readBigUInt64LE(k)); k += 8; }
        if (off === 0xffffffff) { off = Number(extra.readBigUInt64LE(k)); k += 8; }
      }
      q += 4 + len;
    }
    entries.set(name, { name, method, csize, usize, off });
    p += 46 + nl + el + cl;
  }
  return {
    entries,
    read(name) {
      const e = entries.get(name);
      if (!e) return null;
      const lh = read(e.off, 30);
      const start = e.off + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
      const data = read(start, e.csize);
      if (e.method === 0) return data;
      if (e.method === 8) return zlib.inflateRawSync(data);
      throw new Error('unsupported zip method ' + e.method + ' for ' + name);
    },
    close() { fs.closeSync(fd); },
  };
}

// PLATEAUのZIPは通常UTF-8フラグ付きだが、念のためShift_JISの名前も読む
function decodeName(buf) {
  const utf = buf.toString('utf8');
  if (!utf.includes('�')) return utf;
  try { return new TextDecoder('shift_jis').decode(buf); } catch { return utf; }
}
