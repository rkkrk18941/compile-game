// 官公庁のCSV（Shift_JIS が多い）を読む。UTF-8（BOM有無）と Shift_JIS を自動判別する。
export function decodeText(buf) {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return new TextDecoder('utf-8').decode(buf.subarray(3));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { return new TextDecoder('shift_jis').decode(buf); }
}

/** RFC 4180 程度の CSV 解析（引用符・改行入りセルに対応） */
export function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export const nfkc = (s) => String(s ?? '').normalize('NFKC').trim();
export const isNumericCell = (s) => /^-?\d+(\.\d+)?$/.test(nfkc(s).replace(/,/g, ''));
export const num = (s) => { const t = nfkc(s).replace(/,/g, ''); return t === '' || t === '-' ? null : Number(t); };

/**
 * 複数行の見出しを列ごとに縦に連結し、キーワードで列を探す。
 * 見出し行 = 最初の数値データ行（先頭セルが数値）より前の行。
 */
export function headerIndex(rows) {
  let first = rows.findIndex((r) => isNumericCell(r[0]) && r.filter(isNumericCell).length >= 5);
  if (first < 0) first = rows.length;
  const head = rows.slice(0, first);
  const width = Math.max(0, ...rows.slice(first, first + 50).map((r) => r.length), ...head.map((r) => r.length));
  const labels = [];
  for (let c = 0; c < width; c++) {
    // 結合セルは空になるので、同じ行の左の値を引き継ぐ（上段の大見出し）
    const parts = head.map((r, i) => {
      if (nfkc(r[c])) return nfkc(r[c]);
      if (i < head.length - 1) for (let k = c - 1; k >= 0; k--) if (nfkc(r[k])) return nfkc(r[k]);
      return '';
    });
    labels.push(parts.filter(Boolean).join('/').replace(/\s+/g, ''));
  }
  return { first, labels };
}

/** labels から、must の語をすべて含み、not の語を含まない最初の列 */
export function findColumn(labels, must, not = []) {
  const ok = (l) => must.every((m) => l.includes(m)) && !not.some((n) => l.includes(n));
  return labels.findIndex((l) => ok(l) || ok(l.replace(/\//g, '')));
}
