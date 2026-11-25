import { useMemo, useState } from 'react';
import ShareBar from './ShareBar';
import { styles } from './ui';
import type { Cell } from '../lib/share';

/** Big pop-up that shows the detail behind a number, with search, totals and the Share Bar */
export default function DetailModal({ title, subtitle, headers, rows, footer, summary, phone, onClose }: {
  title: string; subtitle?: string; headers: string[]; rows: Cell[][]; footer?: string[]; summary?: string; phone?: string; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? rows.filter(r => r.some(c => String(c ?? '').toLowerCase().includes(t))) : rows;
  }, [rows, q]);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.75)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '14px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '12px', width: '100%', maxWidth: '1100px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#0f172a' }}>{title}</div>
            {subtitle && <div style={{ fontSize: '12px', color: '#64748b' }}>{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} style={{ background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: '6px', padding: '6px 12px', fontWeight: 'bold', cursor: 'pointer' }}>✕ Close</button>
        </div>
        <div style={{ padding: '10px 18px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
          <input placeholder="🔍 தேடு..." value={q} onChange={e => setQ(e.target.value)} style={{ ...styles.input, maxWidth: '240px' }} />
          <div style={{ marginLeft: 'auto' }}><ShareBar doc={{ title, subtitle, headers, rows: shown, footer, summary }} phone={phone} /></div>
        </div>
        <div style={{ overflow: 'auto', padding: '0 18px 14px 18px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginTop: '10px' }}>
            <thead><tr style={{ background: '#0f172a', color: 'white' }}>{headers.map(h => <th key={h} style={{ ...styles.thSub, position: 'sticky', top: 0 }}>{h}</th>)}</tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={headers.length} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>பதிவுகள் இல்லை.</td></tr>}
              {shown.map((r, i) => <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>{r.map((c, j) => <td key={j} style={styles.td}>{String(c ?? '')}</td>)}</tr>)}
            </tbody>
          </table>
          {footer && footer.length > 0 && <div style={{ marginTop: '10px', fontWeight: 'bold', color: '#0f172a' }}>{footer.map((f, i) => <div key={i}>{f}</div>)}</div>}
        </div>
      </div>
    </div>
  );
}
