/** Small CSV / TSV parser (quotes, commas inside quotes, ; , tab or | delimiter auto-detected). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/).find(l => l.trim()) || '';
  const delims = [',', ';', '\t', '|'];
  const delim = delims.map(d => ({ d, n: firstLine.split(d).length })).sort((a, b) => b.n - a.n)[0].d;
  const rows: string[][] = [];
  let row: string[] = [], cell = '', inQ = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQ) {
      if (ch === '"') { if (clean[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell.trim()); cell = '';
      if (row.some(c => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some(c => c !== '')) rows.push(row);
  return rows;
}

const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** dd-mm-yyyy, dd/mm/yy, yyyy-mm-dd, dd-Mon-yyyy  ->  yyyy-mm-dd (or '' when not understood) */
export function parseDateLoose(v: string): string {
  const s = String(v || '').trim();
  const p = (n: number) => String(n).padStart(2, '0');
  if (/^\d{5}(\.\d+)?$/.test(s) && +s > 20000 && +s < 80000) { // Excel serial date
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 86400000);
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  }
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${p(+m[2])}-${p(+m[3])}`;
  m = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return `${y}-${p(+m[2])}-${p(+m[1])}`; }
  m = s.match(/^(\d{1,2})[-/. ]([A-Za-z]{3})[a-z]*[-/. ,]*(\d{2,4})/);
  if (m && MON[m[2].toLowerCase()]) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return `${y}-${p(MON[m[2].toLowerCase()])}-${p(+m[1])}`; }
  return '';
}

export function parseQty(v: string): number {
  const n = parseFloat(String(v || '').replace(/,/g, '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}
