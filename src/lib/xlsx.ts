/**
 * Minimal .xlsx reader (first worksheet -> rows of text). No extra library: an .xlsx is a zip of XML files and
 * modern browsers can inflate it with DecompressionStream.
 */
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buf: ArrayBuffer): Promise<Record<string, Uint8Array>> {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Excel கோப்பு படிக்க முடியவில்லை');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out: Record<string, Uint8Array> = {};
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!/^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(name)) continue;
    const lnl = dv.getUint16(lho + 26, true);
    const lel = dv.getUint16(lho + 28, true);
    const start = lho + 30 + lnl + lel;
    const raw = u8.subarray(start, start + csize);
    out[name] = method === 0 ? raw : await inflateRaw(raw);
  }
  return out;
}

const colIndex = (ref: string) => {
  const letters = (ref.match(/^[A-Z]+/i) || ['A'])[0].toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export async function readXlsx(file: File): Promise<string[][]> {
  const files = await unzip(await file.arrayBuffer());
  const dec = new TextDecoder();
  const parser = new DOMParser();
  const shared: string[] = [];
  if (files['xl/sharedStrings.xml']) {
    const doc = parser.parseFromString(dec.decode(files['xl/sharedStrings.xml']), 'application/xml');
    Array.from(doc.getElementsByTagName('si')).forEach(si => {
      shared.push(Array.from(si.getElementsByTagName('t')).map(t => t.textContent || '').join(''));
    });
  }
  const sheetName = Object.keys(files).filter(k => k.startsWith('xl/worksheets/')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0];
  if (!sheetName) throw new Error('Excel-ல் Sheet இல்லை');
  const doc = parser.parseFromString(dec.decode(files[sheetName]), 'application/xml');
  const rows: string[][] = [];
  Array.from(doc.getElementsByTagName('row')).forEach(rowEl => {
    const cells: string[] = [];
    Array.from(rowEl.getElementsByTagName('c')).forEach(c => {
      const idx = colIndex(c.getAttribute('r') || 'A1');
      const t = c.getAttribute('t');
      let val = '';
      if (t === 'inlineStr') val = Array.from(c.getElementsByTagName('t')).map(x => x.textContent || '').join('');
      else {
        const v = c.getElementsByTagName('v')[0]?.textContent || '';
        val = t === 's' ? shared[Number(v)] ?? '' : v;
      }
      while (cells.length < idx) cells.push('');
      cells[idx] = String(val).trim();
    });
    if (cells.some(x => x !== '')) rows.push(cells);
  });
  return rows;
}

/** CSV / TSV / Excel file -> rows of text */
export async function readTableFile(file: File, parseCsv: (t: string) => string[][]): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) return readXlsx(file);
  if (/\.xls$/i.test(file.name)) throw new Error('பழைய .xls கோப்பு: Excel-ல் திறந்து Save As → Excel Workbook (.xlsx) அல்லது CSV ஆகச் சேமித்து ஏற்றவும்.');
  return parseCsv(await file.text());
}
