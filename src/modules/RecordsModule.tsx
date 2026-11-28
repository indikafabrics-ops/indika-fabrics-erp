import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAll, errMsg } from '../lib/supabase';
import { loadRequests, type ChangeRequest } from '../lib/approvals';
import RowActions, { editableKeys } from '../components/RowActions';
import { EmptyRow, ErrorBanner, Loading, TableWrap, styles } from '../components/ui';

const TABLES: { table: string; label: string; show: string[] }[] = [
  { table: 'pommys_grn_bills', label: '📥 Purchase Bills (GRN)', show: ['bill_no', 'bill_date', 'supplier_name', 'bale_no'] },
  { table: 'pommys_fabric_stock', label: '🧵 Fabric Stock', show: ['item_name', 'design_no', 'color', 'available_meters'] },
  { table: 'pommys_cutting_batches', label: '✂️ Cutting Batches', show: ['batch_code', 'product_model', 'total_pieces', 'end_bit_meters'] },
  { table: 'pommys_production_wip', label: '🏭 Production WIP', show: ['batch_code', 'model_name', 'total_pieces', 'current_status'] },
  { table: 'pommys_ready_stock', label: '👕 Ready Stock (Godown)', show: ['batch_code', 'model_name', 'design_no', 'color', 'ready_pieces'] },
  { table: 'pommys_showroom_transfers', label: '🏬 Showroom Transfers / Sales', show: ['challan_no', 'showroom_name', 'model_name', 'transferred_pieces', 'status'] },
  { table: 'pommys_exceptions_stock', label: '⚠️ End Bits / Damage', show: ['stock_type', 'ref_code', 'model_or_item', 'qty'] },
  { table: 'pommys_store_trims', label: '🏪 Store Room Trims', show: [] },
  { table: 'pommys_tailor_ledger', label: '🧵 Tailor Ledger', show: [] }
];

export const STATUS_STYLE: Record<string, { bg: string; color: string; text: string }> = {
  pending: { bg: '#fef3c7', color: '#b45309', text: '⏳ காத்திருக்கிறது' },
  approved: { bg: '#dcfce7', color: '#15803d', text: '✅ Approved' },
  rejected: { bg: '#fee2e2', color: '#b91c1c', text: '❌ Rejected' },
  failed: { bg: '#fee2e2', color: '#b91c1c', text: '⚠️ தோல்வி' }
};

/** Edit / Delete for every saved record. Admin = immediately; others = request for Admin approval. */
export default function RecordsModule({ user }: { user: any }) {
  const [table, setTable] = useState(TABLES[0].table);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [mine, setMine] = useState<ChangeRequest[]>([]);
  const admin = String(user?.role || '').toUpperCase() === 'ADMIN';

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await fetchAll(table, '*');
      data.sort((a: any, b: any) => Number(b.id) - Number(a.id));
      setRows(data);
      if (!admin) {
        const all = await loadRequests();
        setMine(all.filter(r => r.by === String(user?.username || user?.full_name || 'staff')).slice(0, 15));
      }
    } catch (err: any) { setError(errMsg(err)); setRows([]); }
    setLoading(false);
  }, [table, admin, user]);

  useEffect(() => { load(); }, [load]);

  const cfg = TABLES.find(t => t.table === table)!;
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const f = t ? rows.filter(r => Object.values(r).some(v => typeof v !== 'object' && String(v ?? '').toLowerCase().includes(t))) : rows;
    return f.slice(0, 150);
  }, [rows, q]);
  const cols = cfg.show.length ? cfg.show : rows[0] ? editableKeys(rows[0]).slice(0, 5) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={styles.card}>
        <h4 style={{ margin: '0 0 6px 0', color: '#0f172a' }}>✏️ Edit / 🗑️ Delete — எல்லா Records</h4>
        <div style={{ fontSize: '12px', color: '#475569', marginBottom: '12px' }}>
          {admin ? 'Admin: மாற்றம் உடனே நடக்கும்.' : 'நீங்கள் Edit / Delete கோரினால் அது Admin Login-இல் காத்திருக்கும்; Admin Approve செய்த பின்தான் நடக்கும்.'}
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <select value={table} onChange={e => { setTable(e.target.value); setQ(''); }} style={{ ...styles.input, maxWidth: '300px' }}>
            {TABLES.map(t => <option key={t.table} value={t.table}>{t.label}</option>)}
          </select>
          <input placeholder="🔍 தேடு (Bill No, Design, Batch...)" value={q} onChange={e => setQ(e.target.value)} style={{ ...styles.input, maxWidth: '300px' }} />
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading ? <Loading /> : (
        <div style={styles.card}>
          <TableWrap minWidth={640}>
            <thead>
              <tr style={{ background: '#0f172a', color: 'white' }}>
                {cols.map(c => <th key={c} style={styles.thSub}>{c}</th>)}
                <th style={{ ...styles.thSub, textAlign: 'center', width: '170px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? <EmptyRow cols={cols.length + 1} text="Records இல்லை." /> : shown.map((r, i) => (
                <tr key={r.id ?? i}>
                  {cols.map(c => <td key={c} style={styles.td}>{typeof r[c] === 'object' ? '…' : String(r[c] ?? '-')}</td>)}
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    <RowActions user={user} table={table} row={r} label={`${cfg.label.replace(/^\S+\s/, '')} #${r.id}${r[cols[0]] ? ` (${r[cols[0]]})` : ''}`} onDone={load} />
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          {rows.length > shown.length && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>முதல் 150 மட்டும் காட்டப்படுகிறது — தேடலைப் பயன்படுத்தவும்.</div>}
        </div>
      )}

      {!admin && mine.length > 0 && (
        <div style={styles.card}>
          <h4 style={{ margin: '0 0 10px 0', color: '#0f172a' }}>📨 என் கோரிக்கைகள்</h4>
          {mine.map(r => {
            const st = STATUS_STYLE[r.status];
            return (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', padding: '6px 0', borderBottom: '1px solid #e2e8f0', fontSize: '13px' }}>
                <span>{r.action === 'delete' ? '🗑️ Delete' : '✏️ Edit'} — {r.label}</span>
                <span style={{ background: st.bg, color: st.color, borderRadius: '10px', padding: '2px 10px', fontWeight: 'bold', fontSize: '12px' }}>{st.text}{r.note ? ` (${r.note})` : ''}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
