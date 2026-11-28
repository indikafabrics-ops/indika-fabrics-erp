import { useCallback, useEffect, useState } from 'react';
import { loadRequests, decideRequest, type ChangeRequest } from '../lib/approvals';
import { errMsg } from '../lib/supabase';
import { Loading, notify, styles } from '../components/ui';
import { STATUS_STYLE } from './RecordsModule';

const show = (v: any) => (v === null || v === undefined || v === '' ? '(காலி)' : String(v));

/** Admin screen: staff Edit / Delete requests wait here until approved. */
export default function ApprovalsModule({ admin }: { admin: any }) {
  const [list, setList] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  const load = useCallback(async () => {
    setLoading(true);
    try { setList(await loadRequests()); } catch (e: any) { notify(errMsg(e), 'err'); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = async (r: ChangeRequest, ok: boolean) => {
    if (ok && r.action === 'delete' && !window.confirm(`"${r.label}" நிரந்தரமாக Delete ஆகும். Approve செய்யவா?`)) return;
    setBusy(r.id);
    try {
      const res = await decideRequest(r, ok, admin);
      notify(res.status === 'approved' ? '✅ Approve செய்யப்பட்டு நடைமுறைப்படுத்தப்பட்டது.' : res.status === 'rejected' ? 'கோரிக்கை நிராகரிக்கப்பட்டது.' : `⚠️ நடைமுறை தோல்வி: ${res.note}`, res.status === 'failed' ? 'err' : 'ok');
      await load();
    } catch (e: any) { notify(errMsg(e), 'err'); }
    setBusy('');
  };

  if (loading) return <Loading />;
  const rows = list.filter(r => filter === 'all' || r.status === 'pending');
  return (
    <div style={styles.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
        <h4 style={{ margin: 0, color: '#0f172a' }}>✅ Approvals — Edit / Delete கோரிக்கைகள்</h4>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button type="button" onClick={() => setFilter('pending')} style={filter === 'pending' ? styles.primaryBtn : styles.secondaryBtn}>காத்திருப்பவை ({list.filter(r => r.status === 'pending').length})</button>
          <button type="button" onClick={() => setFilter('all')} style={filter === 'all' ? styles.primaryBtn : styles.secondaryBtn}>எல்லாம்</button>
        </div>
      </div>
      {rows.length === 0 && <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>கோரிக்கைகள் எதுவும் இல்லை.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {rows.map(r => {
          const st = STATUS_STYLE[r.status];
          return (
            <div key={r.id} style={{ border: '1px solid #cbd5e1', borderRadius: '10px', padding: '12px', background: r.status === 'pending' ? '#fffbeb' : '#f8fafc' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                <strong>{r.action === 'delete' ? '🗑️ DELETE' : '✏️ EDIT'} — {r.label}</strong>
                <span style={{ background: st.bg, color: st.color, borderRadius: '10px', padding: '2px 10px', fontWeight: 'bold', fontSize: '12px' }}>{st.text}</span>
              </div>
              <div style={{ fontSize: '12px', color: '#475569', margin: '4px 0' }}>
                கோரியவர்: <b>{r.byName}</b> • {new Date(r.ts).toLocaleString('en-IN')} • Table: {r.table}
              </div>
              {r.action === 'update' && r.changes && (
                <div style={{ fontSize: '13px', margin: '6px 0' }}>
                  {Object.keys(r.changes).filter(k => !k.startsWith('_')).map(k => (
                    <div key={k}><b>{k}</b>: <span style={{ color: '#b91c1c', textDecoration: 'line-through' }}>{show(r.before?.[k])}</span> → <span style={{ color: '#15803d', fontWeight: 'bold' }}>{show(r.changes![k])}</span></div>
                  ))}
                </div>
              )}
              {r.action === 'delete' && r.before && (
                <div style={{ fontSize: '12px', color: '#475569' }}>{Object.entries(r.before).filter(([, v]) => typeof v !== 'object').slice(0, 8).map(([k, v]) => `${k}: ${show(v)}`).join(' | ')}</div>
              )}
              {r.status === 'pending' ? (
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button type="button" disabled={busy === r.id} onClick={() => decide(r, true)} style={{ ...styles.primaryBtn, background: '#059669' }}>{busy === r.id ? '...' : '✅ Approve'}</button>
                  <button type="button" disabled={busy === r.id} onClick={() => decide(r, false)} style={styles.dangerBtn}>❌ Reject</button>
                </div>
              ) : (
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>{r.decidedBy} • {r.decidedAt ? new Date(r.decidedAt).toLocaleString('en-IN') : ''}{r.note ? ` • ${r.note}` : ''}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
