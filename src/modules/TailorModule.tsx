import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase, fetchAll, errMsg } from '../lib/supabase';
import { useMasters } from '../lib/useMasters';
import { money, num } from '../lib/helpers';
import RowActions from '../components/RowActions';
import ShareBar from '../components/ShareBar';
import { EmptyRow, ErrorBanner, Loading, SelectNew, TableWrap, notify, styles } from '../components/ui';

export default function TailorModule({ user }: { user?: any }) {
  const masters = useMasters();
  const [entries, setEntries] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [tailor, setTailor] = useState('');
  const [batchId, setBatchId] = useState('');
  const [pcs, setPcs] = useState('');
  const [rate, setRate] = useState('');
  const [saving, setSaving] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [filterTailor, setFilterTailor] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [ledger, wip] = await Promise.all([
        fetchAll('pommys_tailor_ledger', '*'),
        fetchAll('pommys_production_wip', 'id,batch_code,model_name,total_pieces,current_status', q => q.neq('current_status', 'Ready Stock'))
      ]);
      ledger.sort((a, b) => num(b.id) - num(a.id));
      setEntries(ledger);
      setBatches(wip);
    } catch (err: any) {
      setError('Ledger load தோல்வி (pommys_tailor_ledger table இருக்கிறதா?): ' + errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedBatch = batches.find(b => String(b.id) === String(batchId));
  const alreadyIssued = selectedBatch
    ? entries.filter(e => e.batch_code === selectedBatch.batch_code).reduce((s, e) => s + num(e.pieces), 0)
    : 0;
  const remaining = selectedBatch ? Math.max(0, num(selectedBatch.total_pieces) - alreadyIssued) : 0;

  const handleTailor = (v: string) => {
    setTailor(v);
    if (masters.tailorRates[v] !== undefined && !rate) setRate(String(masters.tailorRates[v]));
  };

  const handleBatch = (id: string) => {
    setBatchId(id);
    const b = batches.find(x => String(x.id) === String(id));
    if (b) {
      const issued = entries.filter(e => e.batch_code === b.batch_code).reduce((s, e) => s + num(e.pieces), 0);
      setPcs(String(Math.max(0, num(b.total_pieces) - issued)));
    }
  };

  const addEntry = async (e: FormEvent) => {
    e.preventDefault();
    const name = tailor.trim();
    const p = Math.floor(num(pcs));
    if (!name) return notify('Tailor / Unit தேர்வு செய்யவும்.', 'err');
    if (!selectedBatch) return notify('Batch தேர்வு செய்யவும்.', 'err');
    if (p <= 0) return notify('Pieces உள்ளிடவும்.', 'err');
    if (num(rate) < 0) return notify('Rate எதிர்மறையாக இருக்க முடியாது.', 'err');
    if (p > remaining && !window.confirm(`இந்த Batch-ல் இன்னும் ${remaining} Pcs மட்டுமே Issue செய்யப்படாமல் உள்ளது. ${p} Pcs கொடுக்கவா?`)) return;

    setSaving(true);
    try {
      const { error: insErr } = await supabase.from('pommys_tailor_ledger').insert([{
        tailor_name: name, batch_code: selectedBatch.batch_code, pieces: p, rate_per_pc: num(rate), status: 'Issued'
      }]);
      if (insErr) throw insErr;
      notify(`✅ ${name} → ${selectedBatch.batch_code}: ${p} pcs Issue பதிவு.`);
      setTailor(''); setBatchId(''); setPcs(''); setRate('');
      setFormKey(k => k + 1);
      await load();
      masters.reload();
    } catch (err: any) {
      notify('Save தோல்வி: ' + errMsg(err), 'err');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (en: any, status: string) => {
    const { error: updErr } = await supabase.from('pommys_tailor_ledger').update({ status }).eq('id', en.id);
    if (updErr) notify('Update தோல்வி: ' + errMsg(updErr), 'err');
    else { notify(`✅ ${en.tailor_name} / ${en.batch_code}: ${status}`); load(); }
  };

  const removeEntry = async (en: any) => {
    if (!window.confirm(`${en.tailor_name} — ${en.batch_code} (${en.pieces} pcs) பதிவை நீக்கவா?`)) return;
    const { error: delErr } = await supabase.from('pommys_tailor_ledger').delete().eq('id', en.id);
    if (delErr) notify('Delete தோல்வி: ' + errMsg(delErr), 'err');
    else load();
  };

  const tailorNames = Array.from(new Set(entries.map(e => String(e.tailor_name))));
  const summary = tailorNames.map(name => {
    const rows = entries.filter(e => e.tailor_name === name);
    const pending = rows.filter(r => r.status === 'Issued');
    return {
      name,
      pendingPcs: pending.reduce((s, r) => s + num(r.pieces), 0),
      pendingAmt: pending.reduce((s, r) => s + num(r.pieces) * num(r.rate_per_pc), 0),
      doneAmt: rows.filter(r => r.status === 'Received').reduce((s, r) => s + num(r.pieces) * num(r.rate_per_pc), 0)
    };
  });
  const shown = filterTailor ? entries.filter(e => e.tailor_name === filterTailor) : entries;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={styles.card}>
        <h4 style={{ margin: '0 0 16px 0', color: '#0f172a' }}>🧵 Tailor Ledger & Job-Work — Issue</h4>
        {error && <div style={{ marginBottom: '12px' }}><ErrorBanner message={error} onRetry={load} /></div>}
        <form key={formKey} onSubmit={addEntry} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', alignItems: 'end' }}>
          <div>
            <label style={styles.label}>Tailor / Unit *</label>
            <SelectNew value={tailor} onChange={handleTailor} options={masters.tailors} placeholder="-- Select Tailor --" newLabel="+ New Tailor" />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={styles.label}>Production Batch *</label>
            <select value={batchId} onChange={e => handleBatch(e.target.value)} style={styles.input}>
              <option value="">-- Select Batch --</option>
              {batches.map(b => <option key={b.id} value={b.id}>{b.batch_code} | {b.model_name} | {b.total_pieces} Pcs | {b.current_status}</option>)}
            </select>
          </div>
          <div>
            <label style={styles.label}>Pieces *{selectedBatch ? ` (மீதம் ${remaining})` : ''}</label>
            <input type="number" min="1" step="1" value={pcs} onChange={e => setPcs(e.target.value)} style={styles.input} />
          </div>
          <div>
            <label style={styles.label}>Rate / Pc (₹)</label>
            <input type="number" min="0" step="any" value={rate} onChange={e => setRate(e.target.value)} style={styles.input} />
          </div>
          <button type="submit" disabled={saving} style={styles.primaryBtn}>{saving ? 'Saving...' : '+ Record Jobwork'}</button>
        </form>
      </div>

      {summary.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
          {summary.map(s => (
            <div key={s.name} style={{ ...styles.card, borderTop: '4px solid #7c3aed', padding: '14px', cursor: 'pointer', outline: filterTailor === s.name ? '2px solid #7c3aed' : 'none' }} onClick={() => setFilterTailor(filterTailor === s.name ? '' : s.name)}>
              <div style={{ fontWeight: 'bold', color: '#0f172a' }}>{s.name}</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>கையில் உள்ள (Pending): <strong style={{ color: '#d97706' }}>{s.pendingPcs} Pcs</strong></div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Pending Amount: <strong>₹ {money(s.pendingAmt)}</strong></div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Received Amount: <strong style={{ color: '#059669' }}>₹ {money(s.doneAmt)}</strong></div>
            </div>
          ))}
        </div>
      )}

      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <h4 style={{ margin: 0, color: '#0f172a' }}>Ledger {filterTailor && <span style={{ color: '#7c3aed' }}>— {filterTailor}</span>}</h4>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {filterTailor && <button type="button" style={styles.secondaryBtn} onClick={() => setFilterTailor('')}>Show All</button>}
            <ShareBar doc={{
              title: filterTailor ? `Tailor Statement — ${filterTailor}` : 'Tailor Ledger',
              headers: ['Tailor / Unit', 'Batch', 'Pieces', 'Rate', 'Amount ₹', 'Status'],
              rows: shown.map(en => [en.tailor_name, en.batch_code, num(en.pieces), num(en.rate_per_pc), money(num(en.pieces) * num(en.rate_per_pc)), en.status]),
              footer: [`மொத்தம்: ${shown.reduce((a, e) => a + num(e.pieces), 0)} Pcs | ₹ ${money(shown.reduce((a, e) => a + num(e.pieces) * num(e.rate_per_pc), 0))}`, `Received: ₹ ${money(shown.filter(e => e.status === 'Received').reduce((a, e) => a + num(e.pieces) * num(e.rate_per_pc), 0))} | பாக்கி (Issued): ₹ ${money(shown.filter(e => e.status === 'Issued').reduce((a, e) => a + num(e.pieces) * num(e.rate_per_pc), 0))}`]
            }} />
          </div>
        </div>
        {loading ? <Loading /> : (
          <TableWrap minWidth={720}>
            <thead>
              <tr style={{ background: '#0f172a', color: 'white' }}>
                <th style={styles.thSub}>Tailor / Unit</th>
                <th style={styles.thSub}>Batch</th>
                <th style={styles.thSub}>Pieces</th>
                <th style={styles.thSub}>Rate</th>
                <th style={styles.thSub}>Amount (₹)</th>
                <th style={styles.thSub}>Status</th>
                <th style={styles.thSub}>Action</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? <EmptyRow cols={7} text="Jobwork பதிவுகள் இல்லை" /> : shown.map(en => (
                <tr key={en.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={styles.td}><strong>{en.tailor_name}</strong></td>
                  <td style={styles.td}>{en.batch_code}</td>
                  <td style={styles.td}>{en.pieces}</td>
                  <td style={styles.td}>₹ {en.rate_per_pc}</td>
                  <td style={styles.td}>₹ {money(num(en.pieces) * num(en.rate_per_pc))}</td>
                  <td style={styles.td}>
                    <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', background: en.status === 'Received' ? '#dcfce7' : '#fef3c7', color: en.status === 'Received' ? '#15803d' : '#b45309' }}>{en.status}</span>
                  </td>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                      {en.status === 'Issued' && <button type="button" onClick={() => setStatus(en, 'Received')} style={{ background: '#059669', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>✔ Received</button>}
                      {en.status === 'Received' && <button type="button" onClick={() => setStatus(en, 'Issued')} style={{ ...styles.secondaryBtn, padding: '4px 10px', fontSize: '11px' }}>Undo</button>}
                      {user ? <RowActions user={user} table="pommys_tailor_ledger" row={en} label={`Tailor ${en.tailor_name} ${en.batch_code}`} fields={['tailor_name', 'batch_code', 'pieces', 'rate_per_pc', 'status']} onDone={load} /> : <button type="button" onClick={() => removeEntry(en)} style={{ ...styles.dangerBtn, padding: '4px 8px', fontSize: '11px' }}>🗑️</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
}
