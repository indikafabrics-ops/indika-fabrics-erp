import { useState } from 'react';
import { saveBatchNames } from '../lib/batchNames';
import { notify, styles } from './ui';

/** Local Name of a batch: shown BOLD; ✏️ opens a small box (with the earlier names as suggestions). Saves ONLY the local name – never the Model. */
export default function LocalNameEdit({ code, name, options, onSaved }: { code: string; name: string; options: string[]; onSaved: (n: string) => void }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(name);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const t = v.trim();
    if (!t) return notify('Local Name காலியாக இருக்கக் கூடாது.', 'err');
    setBusy(true);
    try { await saveBatchNames({ [code]: t }); onSaved(t); setEdit(false); notify('Local Name சேமிக்கப்பட்டது.', 'ok'); }
    catch (e: any) { notify('சேமிக்க முடியவில்லை: ' + (e?.message || e), 'err'); }
    finally { setBusy(false); }
  };
  if (!edit) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <b style={{ color: '#6d28d9', fontSize: '14px' }}>{name || '-'}</b>
        <button type="button" title="Local Name போடு / மாற்று" onClick={() => { setV(name); setEdit(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px' }}>✏️</button>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
      <input list={`ln-${code}`} value={v} autoFocus onChange={e => setV(e.target.value)} placeholder="Local Name" style={{ ...styles.tblInput, width: '120px', fontWeight: 'bold' }} />
      <datalist id={`ln-${code}`}>{options.map(o => <option key={o} value={o} />)}</datalist>
      <button type="button" disabled={busy} onClick={save} style={{ ...styles.primaryBtn, padding: '4px 8px', fontSize: '11px' }}>✔</button>
      <button type="button" onClick={() => setEdit(false)} style={{ ...styles.secondaryBtn, padding: '4px 8px', fontSize: '11px' }}>✕</button>
    </div>
  );
}
