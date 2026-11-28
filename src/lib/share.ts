import { downloadCsv, todayStr } from './helpers';

export type Cell = string | number;
export interface ShareDoc {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: Cell[][];
  /** bold last line(s), e.g. totals */
  footer?: string[];
  summary?: string;
}

const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/** Opens a clean print page (choose "Save as PDF" in the print window for a PDF – Tamil text stays correct). */
export function printDoc(doc: ShareDoc) {
  const w = window.open('', '_blank');
  if (!w) { alert('Pop-up தடுக்கப்பட்டுள்ளது. Browser-ல் Pop-up அனுமதிக்கவும்.'); return; }
  const head = doc.headers.map(h => `<th>${esc(h)}</th>`).join('');
  const body = doc.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>
    body{font-family:Arial,'Noto Sans Tamil',sans-serif;margin:18px;color:#0f172a}
    h2{margin:0 0 2px 0} .sub{color:#475569;font-size:12px;margin-bottom:10px}
    table{border-collapse:collapse;width:100%;font-size:12px} th,td{border:1px solid #94a3b8;padding:4px 6px;text-align:left}
    th{background:#0f172a;color:#fff} tr:nth-child(even) td{background:#f8fafc} .ft{margin-top:10px;font-weight:bold;font-size:13px}
    @media print{button{display:none}}
  </style></head><body>
  <h2>Pommys Garment — ${esc(doc.title)}</h2>
  <div class="sub">${esc(doc.subtitle || '')} ${doc.subtitle ? '•' : ''} தேதி: ${todayStr()}</div>
  <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
  ${(doc.footer || []).map(f => `<div class="ft">${esc(f)}</div>`).join('')}
  <script>window.onload=function(){setTimeout(function(){window.print()},500)}<\/script></body></html>`);
  w.document.close();
}

export function docToText(doc: ShareDoc, maxRows = 40): string {
  const lines: string[] = [`*Pommys — ${doc.title}*`];
  if (doc.subtitle) lines.push(doc.subtitle);
  lines.push(`தேதி: ${todayStr()}`, '');
  if (doc.summary) lines.push(doc.summary, '');
  doc.rows.slice(0, maxRows).forEach((r, i) => lines.push(`${i + 1}. ${r.filter(c => String(c ?? '') !== '' && String(c) !== '-').join(' | ')}`));
  if (doc.rows.length > maxRows) lines.push(`… மேலும் ${doc.rows.length - maxRows} வரிகள் (Excel / Print-ல் பார்க்கவும்)`);
  (doc.footer || []).forEach(f => lines.push('', `*${f}*`));
  return lines.join('\n');
}

export const cleanPhone = (p?: string): string => {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length === 10) return '91' + d;
  return d.length >= 11 ? d : '';
};

export function openWhatsApp(text: string, phone?: string) {
  const ph = cleanPhone(phone);
  window.open(`https://wa.me/${ph}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

export function exportDocCsv(doc: ShareDoc) {
  const name = doc.title.replace(/[^\w஀-௿]+/g, '-').replace(/-+/g, '-').slice(0, 40);
  downloadCsv(`pommys-${name}-${todayStr()}.csv`, [doc.headers, ...doc.rows, ...(doc.footer || []).map(f => [f])]);
}
