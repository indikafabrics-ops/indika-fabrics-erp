import type { CSSProperties } from 'react';
import { printDoc, docToText, openWhatsApp, exportDocCsv, type ShareDoc } from '../lib/share';

const btn = (bg: string): CSSProperties => ({ background: bg, color: 'white', border: 'none', padding: '7px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' });

/** 🖨️ Print · 📄 PDF · 📲 WhatsApp · 📊 Excel – the same four buttons on every report */
export default function ShareBar({ doc, phone, disabled }: { doc: ShareDoc; phone?: string; disabled?: boolean }) {
  const off = disabled || doc.rows.length === 0;
  const o: CSSProperties = off ? { opacity: 0.5, cursor: 'not-allowed' } : {};
  return (
    <div className="share-bar" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      <button type="button" disabled={off} onClick={() => printDoc(doc)} style={{ ...btn('#475569'), ...o }}>🖨️ Print</button>
      <button type="button" disabled={off} onClick={() => printDoc(doc)} title="Print window-ல் 'Save as PDF' தேர்வு செய்யவும்" style={{ ...btn('#dc2626'), ...o }}>📄 PDF</button>
      <button type="button" disabled={off} onClick={() => openWhatsApp(docToText(doc), phone)} style={{ ...btn('#16a34a'), ...o }}>📲 WhatsApp</button>
      <button type="button" disabled={off} onClick={() => exportDocCsv(doc)} style={{ ...btn('#059669'), ...o }}>📊 Excel</button>
    </div>
  );
}
