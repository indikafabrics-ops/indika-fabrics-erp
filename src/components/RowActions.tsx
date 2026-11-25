import { useState } from 'react';
import { submitChange } from '../lib/approvals';
import { errMsg } from '../lib/supabase';
import { Modal, notify, styles } from './ui';

const HIDDEN = new Set(['id', 'created_at', 'updated_at']);

/** columns that can be edited as plain text / numbers (JSON & unknown objects are left alone) */
export const editableKeys = (row: any): string[] =>
  Object.keys(row || {}).filter(k => !HIDDEN.has(k) && (row[k] === null || ['string', 'number'].includes(typeof row[k])));

/**
 * ✏️ Edit and 🗑️ Delete for one saved record.
 * Admin: done at once.  Office / Salesman: becomes a request that waits for Admin approval.
 */
export default function RowActions({ user, table, row, label, onDone, fields }: {
  user: any; table: string; row: any; label: string; onDone?: () => void; fields?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const keys = fields || editableKeys(row);
  const admin = String(user?.role || '').toUpperCase() === 'ADMIN';

  const done = (r: 'done' | 'queued', what: string) => {
    notify(r === 'done' ? `✅ ${what} முடிந்தது.` : `📨 ${what} கோரிக்கை Admin ஒப்புதலுக்கு அனுப்பப்பட்டது. Admin Approve செய்தபின் நடக்கும்.`, r === 'done' ? 'ok' : 'info');
    onDone?.();
  };

  const startEdit = () => {
    const v: Record<string, string> = {};
    keys.forEach(k => { v[k] = row[k] === null || row[k] === undefined ? '' : String(row[k]); });
    setVals(v);
    setOpen(true);
  };

  const save = async () => {
    const changes: Record<string, any> = {};
    const before: Record<string, any> = {};
    keys.forEach(k => {
      const old = row[k] === null || row[k] === undefined ? '' : String(row[k]);
      if (vals[k] === old) return;
      before[k] = row[k];
      changes[k] = typeof row[k] === 'number' ? (vals[k] === '' ? 0 : Number(vals[k])) : vals[k];
      if (typeof row[k] === 'number' && !Number.isFinite(changes[k])) changes[k] = row[k];
    });
    if (Object.keys(changes).length === 0) { setOpen(false); return; }
    setBusy(true);
    try {
      done(await submitChange(user, { action: 'update', table, rowId: row.id, label, changes, before }), 'Edit');
      setOpen(false);
    } catch (err: any) {
      notify('Edit தோல்வி: ' + errMsg(err), 'err');
    } finally { setBusy(false); }
  };

  const del = async () => {
    if (!window.confirm(admin ? `"${label}" நிரந்தரமாக Delete செய்யவா?` : `"${label}" Delete செய்ய Admin-இடம் கோரிக்கை அனுப்பவா?`)) return;
    setBusy(true);
    try {
      done(await submitChange(user, { action: 'delete', table, rowId: row.id, label, before: row }), 'Delete');
    } catch (err: any) {
      notify('Delete தோல்வி: ' + errMsg(err), 'err');
    } finally { setBusy(false); }
  };

  return (
    <>
      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
        <button type="button" onClick={startEdit} disabled={busy} style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #7dd3fc', padding: '5px 9px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>✏️ Edit</button>
        <button type="button" onClick={del} disabled={busy} style={styles.dangerBtn}>🗑️ Delete</button>
      </div>
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <h4 style={{ margin: '0 0 4px 0', color: '#0f172a' }}>✏️ Edit — {label}</h4>
          <div style={{ fontSize: '12px', color: admin ? '#047857' : '#b45309', marginBottom: '10px' }}>
            {admin ? 'Admin: உடனே மாற்றப்படும்.' : 'மாற்றம் Admin ஒப்புதலுக்குப் பிறகே நடைமுறைக்கு வரும்.'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px', maxHeight: '60vh', overflowY: 'auto', textAlign: 'left' }}>
            {keys.map(k => (
              <div key={k}>
                <label style={{ ...styles.label, fontSize: '11px' }}>{k}</label>
                <input type={typeof row[k] === 'number' ? 'number' : 'text'} step="any" value={vals[k] ?? ''} onChange={e => setVals(p => ({ ...p, [k]: e.target.value }))} style={styles.input} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '14px' }}>
            <button type="button" onClick={() => setOpen(false)} style={styles.secondaryBtn}>Cancel</button>
            <button type="button" onClick={save} disabled={busy} style={styles.primaryBtn}>{busy ? '...' : admin ? 'Save' : 'Admin-க்கு அனுப்பு'}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
