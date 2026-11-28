import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase, fetchAll, errMsg } from '../lib/supabase';
import { useMasters } from '../lib/useMasters';
import { money, num, parseModelLabel, todayStr } from '../lib/helpers';
import { loadSizeLedger, loadCutSizes, sizesFor, sortSizes, sumSizes, type SizeMap } from '../lib/sizeLedger';
import { loadBatchNames, nameFor, uniqueNames } from '../lib/batchNames';
import { loadTailorX, saveTailorX, WORKS, rateKey, dateOf, recPcsOf, type TailorStore, type TailorX } from '../lib/tailorX';
import RowActions from '../components/RowActions';
import ShareBar from '../components/ShareBar';
import SizeQty from '../components/SizeQty';
import { EmptyRow, ErrorBanner, Loading, SelectNew, TableWrap, notify, styles } from '../components/ui';

type Tab = 'ledger' | 'salary' | 'batch';
const baseCode = (c: string) => String(c || '').replace(/(-P\d*)+$/, '');
const sizeLines = (m?: SizeMap) => Object.keys(m || {}).sort(sortSizes).map(k => `${k}: ${(m as SizeMap)[k]}`);
const Lines = ({ m }: { m?: SizeMap }) => { const l = sizeLines(m); return l.length ? <div style={{ fontSize: '12px', lineHeight: 1.5 }}>{l.map(x => <div key={x}>{x}</div>)}</div> : <span style={{ color: '#94a3b8' }}>—</span>; };

export default function TailorModule({ user }: { user?: any }) {
  const masters = useMasters();
  const [tab, setTab] = useState<Tab>('ledger');
  const [entries, setEntries] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [tx, setTx] = useState<TailorStore>({ rows: {}, rates: {} });
  const [ledger, setLedger] = useState<Record<string, SizeMap>>({});
  const [cutSizes, setCutSizes] = useState<Record<string, SizeMap>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [tailor, setTailor] = useState('');
  const [batchId, setBatchId] = useState('');
  const [work, setWork] = useState('Full');
  const [date, setDate] = useState(todayStr());
  const [pcs, setPcs] = useState('');
  const [sizeBy, setSizeBy] = useState<Record<string, string>>({});
  const [rate, setRate] = useState('');
  const [rateTouched, setRateTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [filterTailor, setFilterTailor] = useState('');
  const [recOpen, setRecOpen] = useState<string>('');
  const [recDate, setRecDate] = useState(todayStr());
  const [recPcs, setRecPcs] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [led, wip] = await Promise.all([
        fetchAll('pommys_tailor_ledger', '*'),
        fetchAll('pommys_production_wip', 'id,batch_code,model_name,total_pieces,current_status', q => q.neq('current_status', 'Ready Stock'))
      ]);
      led.sort((a, b) => num(b.id) - num(a.id));
      setEntries(led);
      setBatches(wip);
      loadTailorX().then(setTx).catch(() => undefined);
      loadSizeLedger().then(setLedger).catch(() => undefined);
      loadCutSizes().then(setCutSizes).catch(() => undefined);
      loadBatchNames().then(setNames).catch(() => undefined);
    } catch (err: any) {
      setError('Ledger load தோல்வி (pommys_tailor_ledger table இருக்கிறதா?): ' + errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const xOf = (en: any): TailorX | undefined => tx.rows[String(en.id)];
  const modelOfBatch = (code: string) => {
    const b = batches.find(x => x.batch_code === code);
    return parseModelLabel(String(b?.model_name || '')).model || '';
  };
  const selectedBatch = batches.find(b => String(b.id) === String(batchId));
  const selModel = selectedBatch ? parseModelLabel(String(selectedBatch.model_name || '')).model : '';
  const alreadyIssued = selectedBatch
    ? entries.filter(e => e.batch_code === selectedBatch.batch_code && (xOf(e)?.work || 'Full') === work).reduce((s, e) => s + num(e.pieces), 0)
    : 0;
  const remaining = selectedBatch ? Math.max(0, num(selectedBatch.total_pieces) - alreadyIssued) : 0;

  /** sizes of the selected batch still free for THIS work */
  const freeSizes: SizeMap = (() => {
    if (!selectedBatch) return {};
    const total = Math.floor(num(selectedBatch.total_pieces));
    let av = sizesFor(selectedBatch.batch_code, total, ledger, cutSizes);
    if (!Object.keys(av).length) { const sz = parseModelLabel(String(selectedBatch.model_name || '')).size; if (sz && total > 0) av = { [sz]: total }; }
    const free: SizeMap = { ...av };
    entries.filter(e => e.batch_code === selectedBatch.batch_code && (xOf(e)?.work || 'Full') === work).forEach(e => {
      Object.entries(xOf(e)?.sizes || {}).forEach(([k, q]) => { if (free[k] !== undefined) free[k] = Math.max(0, free[k] - num(q)); });
    });
    Object.keys(free).forEach(k => { if (free[k] <= 0) delete free[k]; });
    return free;
  })();
  const hasSizes = Object.keys(freeSizes).length > 0;
  // choosing a batch / work pre-fills the whole free balance size by size (edit to give less)
  const freeKey = batchId + '|' + work + '|' + Object.entries(freeSizes).map(([k, v]) => k + v).join(',');
  useEffect(() => {
    const f: Record<string, string> = {};
    Object.entries(freeSizes).forEach(([k, v]) => { f[k] = String(v); });
    setSizeBy(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freeKey]);
  const sizeTotal = Math.floor(Object.values(sizeBy).reduce((a, v) => a + num(v), 0));

  const suggestRate = (t: string, model: string, w: string) => {
    const k = tx.rates[rateKey(model, w)];
    if (k !== undefined) return String(k);
    return masters.tailorRates[t] !== undefined ? String(masters.tailorRates[t]) : '';
  };
  const refreshRate = (t: string, model: string, w: string) => { if (!rateTouched) setRate(suggestRate(t, model, w)); };

  const handleTailor = (v: string) => { setTailor(v); refreshRate(v, selModel, work); };
  const handleWork = (w: string) => { setWork(w); setSizeBy({}); refreshRate(tailor, selModel, w); };
  const handleBatch = (id: string) => {
    setBatchId(id); setSizeBy({});
    const b = batches.find(x => String(x.id) === String(id));
    if (b) {
      const m = parseModelLabel(String(b.model_name || '')).model;
      const issued = entries.filter(e => e.batch_code === b.batch_code && (xOf(e)?.work || 'Full') === work).reduce((s, e) => s + num(e.pieces), 0);
      setPcs(String(Math.max(0, num(b.total_pieces) - issued)));
      refreshRate(tailor, m, work);
    }
  };

  const addEntry = async (e: FormEvent) => {
    e.preventDefault();
    const name = tailor.trim();
    if (!name) return notify('Tailor / Unit தேர்வு செய்யவும்.', 'err');
    if (!selectedBatch) return notify('Batch தேர்வு செய்யவும்.', 'err');
    const sizes: SizeMap = {};
    Object.entries(sizeBy).forEach(([k, v]) => { const q = Math.floor(num(v)); if (q > 0) sizes[k] = q; });
    const p = hasSizes ? sumSizes(sizes) : Math.floor(num(pcs));
    if (p <= 0) return notify(hasSizes ? 'குறைந்தது ஒரு Size-ல் Pieces உள்ளிடவும்.' : 'Pieces உள்ளிடவும்.', 'err');
    for (const k of Object.keys(sizes)) if (freeSizes[k] !== undefined && sizes[k] > freeSizes[k]) return notify(`Size ${k}: மீதம் ${freeSizes[k]} Pcs மட்டுமே.`, 'err');
    if (num(rate) < 0) return notify('Rate எதிர்மறையாக இருக்க முடியாது.', 'err');
    if (!hasSizes && p > remaining && !window.confirm(`இந்த Batch-ல் இன்னும் ${remaining} Pcs மட்டுமே Issue செய்யப்படாமல் உள்ளது. ${p} Pcs கொடுக்கவா?`)) return;

    setSaving(true);
    try {
      const { data, error: insErr } = await supabase.from('pommys_tailor_ledger').insert([{
        tailor_name: name, batch_code: selectedBatch.batch_code, pieces: p, rate_per_pc: num(rate), status: 'Issued'
      }]).select();
      if (insErr) throw insErr;
      const newId = data && data[0] ? String(data[0].id) : '';
      try {
        const x: TailorX = { work, date, ...(Object.keys(sizes).length ? { sizes } : {}) };
        await saveTailorX({ ...(newId ? { rows: { [newId]: x } } : {}), rates: { [rateKey(selModel, work)]: num(rate) } });
      } catch { notify('Work / Size விவரம் சேமிக்க முடியவில்லை (Pcs பதிவாகிவிட்டது).', 'warn'); }
      notify(`✅ ${name} → ${selectedBatch.batch_code} (${work}): ${p} pcs Issue பதிவு.`);
      setTailor(''); setBatchId(''); setPcs(''); setRate(''); setSizeBy({}); setRateTouched(false); setWork('Full');
      setFormKey(k => k + 1);
      await load();
      masters.reload();
    } catch (err: any) {
      notify('Save தோல்வி: ' + errMsg(err), 'err');
    } finally {
      setSaving(false);
    }
  };

  const doReceive = async (en: any) => {
    const p = Math.floor(num(recPcs));
    if (!(p >= 0) || p > num(en.pieces)) return notify(`Received Pcs 0 முதல் ${en.pieces} வரை இருக்க வேண்டும்.`, 'err');
    if (!recDate) return notify('Received தேதி தேவை.', 'err');
    try {
      const { error: updErr } = await supabase.from('pommys_tailor_ledger').update({ status: 'Received' }).eq('id', en.id);
      if (updErr) throw updErr;
      const issued = xOf(en)?.sizes;
      const recSizes = issued && p === num(en.pieces) ? issued : undefined;
      await saveTailorX({ rows: { [String(en.id)]: { recDate, recPcs: p, ...(recSizes ? { recSizes } : {}) } } });
      notify(`✅ ${en.tailor_name} / ${en.batch_code}: ${p} Pcs Received${p < num(en.pieces) ? ` (குறைவு ${num(en.pieces) - p})` : ''}`);
      setRecOpen('');
      load();
    } catch (err: any) { notify('Update தோல்வி: ' + errMsg(err), 'err'); }
  };

  const undoReceive = async (en: any) => {
    const { error: updErr } = await supabase.from('pommys_tailor_ledger').update({ status: 'Issued' }).eq('id', en.id);
    if (updErr) return notify('Update தோல்வி: ' + errMsg(updErr), 'err');
    try { await saveTailorX({ rows: { [String(en.id)]: { recDate: '', recPcs: undefined } } }); } catch { /* optional */ }
    notify(`↩️ ${en.tailor_name} / ${en.batch_code}: மீண்டும் Issued`);
    load();
  };

  const removeEntry = async (en: any) => {
    if (!window.confirm(`${en.tailor_name} — ${en.batch_code} (${en.pieces} pcs) பதிவை நீக்கவா?`)) return;
    const { error: delErr } = await supabase.from('pommys_tailor_ledger').delete().eq('id', en.id);
    if (delErr) notify('Delete தோல்வி: ' + errMsg(delErr), 'err');
    else load();
  };

  const tailorNames = Array.from(new Set(entries.map(e => String(e.tailor_name))));
  const amt = (en: any) => (en.status === 'Received' ? recPcsOf(en, xOf(en)) : num(en.pieces)) * num(en.rate_per_pc);
  const summary = tailorNames.map(name => {
    const rows = entries.filter(e => e.tailor_name === name);
    const pending = rows.filter(r => r.status === 'Issued');
    const got = rows.filter(r => r.status === 'Received');
    return {
      name,
      pendingPcs: pending.reduce((s, r) => s + num(r.pieces), 0),
      pendingAmt: pending.reduce((s, r) => s + num(r.pieces) * num(r.rate_per_pc), 0),
      doneAmt: got.reduce((s, r) => s + amt(r), 0),
      short: got.reduce((s, r) => s + Math.max(0, num(r.pieces) - recPcsOf(r, xOf(r))), 0)
    };
  });
  const shown = filterTailor ? entries.filter(e => e.tailor_name === filterTailor) : entries;
  const bName = (code: string) => nameFor(names, code);
  const tabBtn = (k: Tab, label: string) => (
    <button type="button" onClick={() => setTab(k)} style={{ ...styles.secondaryBtn, background: tab === k ? '#1e293b' : 'transparent', color: tab === k ? 'white' : '#475569' }}>{label}</button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {tabBtn('ledger', '🧵 Ledger / Issue')}{tabBtn('salary', '💰 சம்பளம் (தேதி வாரி)')}{tabBtn('batch', '📒 Batch வாரி சம்பளம்')}
      </div>

      {tab === 'ledger' && <>
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
              {batches.map(b => <option key={b.id} value={b.id}>{b.batch_code}{bName(b.batch_code) ? ` (${bName(b.batch_code)})` : ''} | {b.model_name} | {b.total_pieces} Pcs | {b.current_status}</option>)}
            </select>
          </div>
          <div>
            <label style={styles.label}>வேலை (Work) *</label>
            <select value={work} onChange={e => handleWork(e.target.value)} style={styles.input}>{WORKS.map(w => <option key={w}>{w}</option>)}</select>
          </div>
          <div>
            <label style={styles.label}>Date *</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={styles.input} />
          </div>
          <div>
            <label style={styles.label}>Rate / Pc (₹) — {work}</label>
            <input type="number" min="0" step="any" value={rate} onChange={e => { setRate(e.target.value); setRateTouched(true); }} style={styles.input} />
          </div>
          {selectedBatch && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={styles.label}>Size வாரி Pieces * ({work}-க்கு மீதம் {hasSizes ? sumSizes(freeSizes) : remaining})</label>
              {hasSizes
                ? <><SizeQty avail={freeSizes} value={sizeBy} onChange={setSizeBy} placeholder="0" /><div style={{ fontSize: '12px', color: '#0369a1', marginTop: '4px' }}>மொத்தம்: <b>{sizeTotal}</b> Pcs</div></>
                : <input type="number" min="1" step="1" value={pcs} onChange={e => setPcs(e.target.value)} style={styles.input} placeholder="Pieces" />}
            </div>
          )}
          <button type="submit" disabled={saving} style={styles.primaryBtn}>{saving ? 'Saving...' : '+ Record Jobwork'}</button>
        </form>
        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>ஒரு Garment-ஐ இரண்டாகப் பிரித்துத் தைக்கக் கொடுத்தால்: ஒரே Batch-க்கு "1st Work" மற்றும் "2nd Work" எனத் தனித்தனியாக (தனி Tailor, தனி Rate) பதிவு செய்யவும். ஒவ்வொரு Work-க்கும் தனி மீதம் கணக்கிடப்படும்.</div>
      </div>

      {summary.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
          {summary.map(s => (
            <div key={s.name} style={{ ...styles.card, borderTop: '4px solid #7c3aed', padding: '14px', cursor: 'pointer', outline: filterTailor === s.name ? '2px solid #7c3aed' : 'none' }} onClick={() => setFilterTailor(filterTailor === s.name ? '' : s.name)}>
              <div style={{ fontWeight: 'bold', color: '#0f172a' }}>{s.name}</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>கையில் உள்ள (Pending): <strong style={{ color: '#d97706' }}>{s.pendingPcs} Pcs</strong></div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Pending Amount: <strong>₹ {money(s.pendingAmt)}</strong></div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Received Amount: <strong style={{ color: '#059669' }}>₹ {money(s.doneAmt)}</strong></div>
              {s.short > 0 && <div style={{ fontSize: '12px', color: '#b91c1c', fontWeight: 'bold' }}>⚠️ குறைவாக வந்தது: {s.short} Pcs</div>}
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
              headers: ['Date', 'Tailor / Unit', 'Batch', 'Local Name', 'Work', 'Size', 'Pieces', 'Rate', 'Amount ₹', 'Status'],
              rows: shown.map(en => [dateOf(en, xOf(en)) || '-', en.tailor_name, en.batch_code, bName(en.batch_code) || '-', xOf(en)?.work || '-', sizeLines(xOf(en)?.sizes).join(', ') || '-', num(en.pieces), num(en.rate_per_pc), money(amt(en)), en.status]),
              footer: [`மொத்தம்: ${shown.reduce((a, e) => a + num(e.pieces), 0)} Pcs | ₹ ${money(shown.reduce((a, e) => a + amt(e), 0))}`]
            }} />
          </div>
        </div>
        {loading ? <Loading /> : (
          <TableWrap minWidth={980}>
            <thead>
              <tr style={{ background: '#0f172a', color: 'white' }}>
                <th style={styles.thSub}>Date</th>
                <th style={styles.thSub}>Tailor / Unit</th>
                <th style={styles.thSub}>Batch / Local Name</th>
                <th style={styles.thSub}>Work</th>
                <th style={styles.thSub}>Size</th>
                <th style={styles.thSub}>Total Pcs</th>
                <th style={styles.thSub}>Rate</th>
                <th style={styles.thSub}>Amount (₹)</th>
                <th style={styles.thSub}>Status</th>
                <th style={styles.thSub}>Action</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? <EmptyRow cols={10} text="Jobwork பதிவுகள் இல்லை" /> : shown.map(en => {
                const x = xOf(en);
                const short = en.status === 'Received' ? Math.max(0, num(en.pieces) - recPcsOf(en, x)) : 0;
                return (
                <tr key={en.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={styles.td}>{dateOf(en, x) || '-'}{x?.recDate ? <div style={{ fontSize: '11px', color: '#059669' }}>Recd: {x.recDate}</div> : null}</td>
                  <td style={styles.td}><strong>{en.tailor_name}</strong></td>
                  <td style={styles.td}>{en.batch_code}{bName(en.batch_code) ? <div style={{ fontWeight: 'bold', color: '#6d28d9', fontSize: '14px' }}>{bName(en.batch_code)}</div> : null}</td>
                  <td style={styles.td}>{x?.work || '-'}</td>
                  <td style={styles.td}><Lines m={x?.sizes} /></td>
                  <td style={styles.td}><b>{en.pieces}</b>{en.status === 'Received' && x?.recPcs !== undefined ? <div style={{ fontSize: '11px', color: short ? '#b91c1c' : '#059669' }}>Recd {x.recPcs}{short ? ` (குறைவு ${short})` : ''}</div> : null}</td>
                  <td style={styles.td}>₹ {en.rate_per_pc}</td>
                  <td style={styles.td}>₹ {money(amt(en))}</td>
                  <td style={styles.td}>
                    <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', background: en.status === 'Received' ? '#dcfce7' : '#fef3c7', color: en.status === 'Received' ? '#15803d' : '#b45309' }}>{en.status}</span>
                  </td>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                      {en.status === 'Issued' && recOpen !== String(en.id) && <button type="button" onClick={() => { setRecOpen(String(en.id)); setRecDate(todayStr()); setRecPcs(String(en.pieces)); }} style={{ background: '#059669', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>✔ Received</button>}
                      {en.status === 'Issued' && recOpen === String(en.id) && (
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <input type="date" value={recDate} onChange={e => setRecDate(e.target.value)} style={{ ...styles.tblInput, width: '130px' }} />
                          <input type="number" min="0" max={en.pieces} step="1" value={recPcs} onChange={e => setRecPcs(e.target.value)} style={{ ...styles.tblInput, width: '70px' }} title="வந்த Pcs" />
                          <button type="button" onClick={() => doReceive(en)} style={{ ...styles.primaryBtn, padding: '4px 8px', fontSize: '11px' }}>✔</button>
                          <button type="button" onClick={() => setRecOpen('')} style={{ ...styles.secondaryBtn, padding: '4px 8px', fontSize: '11px' }}>✕</button>
                        </div>
                      )}
                      {en.status === 'Received' && <button type="button" onClick={() => undoReceive(en)} style={{ ...styles.secondaryBtn, padding: '4px 10px', fontSize: '11px' }}>Undo</button>}
                      {user ? <RowActions user={user} table="pommys_tailor_ledger" row={en} label={`Tailor ${en.tailor_name} ${en.batch_code}`} fields={['tailor_name', 'batch_code', 'pieces', 'rate_per_pc', 'status']} onDone={load} /> : <button type="button" onClick={() => removeEntry(en)} style={styles.dangerBtn}>🗑️</button>}
                    </div>
                  </td>
                </tr>
              );})}
            </tbody>
          </TableWrap>
        )}
      </div>
      </>}

      {tab === 'salary' && <SalaryTab entries={entries} tx={tx} names={names} tailorNames={tailorNames} modelOf={modelOfBatch} />}
      {tab === 'batch' && <BatchTab entries={entries} tx={tx} names={names} modelOf={modelOfBatch} />}
    </div>
  );
}

// ---------------------------------------------------------------- salary by tailor + date range
function SalaryTab({ entries, tx, names, tailorNames, modelOf }: { entries: any[]; tx: TailorStore; names: Record<string, string>; tailorNames: string[]; modelOf: (c: string) => string }) {
  const [who, setWho] = useState('');
  const [from, setFrom] = useState(() => todayStr().slice(0, 8) + '01');
  const [to, setTo] = useState(todayStr());
  const [advance, setAdvance] = useState('');
  const [deduct, setDeduct] = useState('');
  // salary is only for RECEIVED entries; the date is the Received date (old entries: the entry date)
  const rows = entries.filter(e => e.status === 'Received' && (!who || e.tailor_name === who)).map(e => {
    const x = tx.rows[String(e.id)];
    const d = x?.recDate || dateOf(e, x);
    const p = recPcsOf(e, x);
    return { e, x, d, p, amount: p * num(e.rate_per_pc) };
  }).filter(r => (!from || !r.d || r.d >= from) && (!to || !r.d || r.d <= to))
    .sort((a, b) => a.e.tailor_name.localeCompare(b.e.tailor_name) || String(a.d).localeCompare(String(b.d)));
  const totalPcs = rows.reduce((a, r) => a + r.p, 0);
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const net = total - num(advance) - num(deduct);
  const byWork = ['Full', '1st Work', '2nd Work'].map(w => ({ w, pcs: rows.filter(r => (r.x?.work || 'Full') === w).reduce((a, r) => a + r.p, 0), amt: rows.filter(r => (r.x?.work || 'Full') === w).reduce((a, r) => a + r.amount, 0) })).filter(r => r.pcs > 0);
  const nm = (c: string) => nameFor(names, c);
  const doc = {
    title: `Tailor சம்பளம் — ${who || 'எல்லோரும்'}`, subtitle: `${from || '…'} முதல் ${to || '…'} (Received மட்டும்)`,
    headers: ['தேதி', 'Tailor', 'Batch', 'Local Name', 'Model', 'Work', 'Size', 'Pcs', 'Rate', 'தொகை ₹'],
    rows: rows.map(r => [r.d || '-', r.e.tailor_name, r.e.batch_code, nm(r.e.batch_code) || '-', modelOf(r.e.batch_code) || '-', r.x?.work || '-', sizeLines(r.x?.recSizes || r.x?.sizes).join(', ') || '-', r.p, num(r.e.rate_per_pc), money(r.amount)]),
    footer: [`மொத்தம்: ${totalPcs} Pcs | ₹ ${money(total)}`, ...(num(advance) ? [`Advance: − ₹ ${money(num(advance))}`] : []), ...(num(deduct) ? [`பிடித்தம்: − ₹ ${money(num(deduct))}`] : []), `நிகரச் சம்பளம்: ₹ ${money(net)}`]
  };
  return (
    <div style={styles.card}>
      <h4 style={{ margin: '0 0 12px 0', color: '#0f172a' }}>💰 Tailor சம்பளம் — தேதி வாரி (Received ஆனவை மட்டும்)</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '12px' }}>
        <div><label style={styles.label}>Tailor</label><select value={who} onChange={e => setWho(e.target.value)} style={styles.input}><option value="">-- எல்லோரும் --</option>{tailorNames.map(t => <option key={t}>{t}</option>)}</select></div>
        <div><label style={styles.label}>Start Date</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} style={styles.input} /></div>
        <div><label style={styles.label}>End Date</label><input type="date" value={to} onChange={e => setTo(e.target.value)} style={styles.input} /></div>
        <div><label style={styles.label}>Advance ₹ (கழிக்க)</label><input type="number" min="0" step="any" value={advance} onChange={e => setAdvance(e.target.value)} style={styles.input} /></div>
        <div><label style={styles.label}>பிடித்தம் ₹</label><input type="number" min="0" step="any" value={deduct} onChange={e => setDeduct(e.target.value)} style={styles.input} /></div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}><ShareBar doc={doc} /></div>
      <TableWrap minWidth={900}>
        <thead><tr style={{ background: '#0f172a', color: 'white' }}>{['தேதி', 'Tailor', 'Batch / Local Name', 'Model', 'Work', 'Size', 'Pcs', 'Rate', 'தொகை ₹'].map(h => <th key={h} style={styles.thSub}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 ? <EmptyRow cols={9} text="இந்தக் காலத்தில் Received பதிவுகள் இல்லை" /> : rows.map(r => (
            <tr key={r.e.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={styles.td}>{r.d || '-'}</td><td style={styles.td}><b>{r.e.tailor_name}</b></td>
              <td style={styles.td}>{r.e.batch_code}{nm(r.e.batch_code) ? <div style={{ fontWeight: 'bold', color: '#6d28d9', fontSize: '14px' }}>{nm(r.e.batch_code)}</div> : null}</td>
              <td style={styles.td}>{modelOf(r.e.batch_code) || '-'}</td><td style={styles.td}>{r.x?.work || '-'}</td>
              <td style={styles.td}><Lines m={r.x?.recSizes || r.x?.sizes} /></td>
              <td style={styles.td}><b>{r.p}</b></td><td style={styles.td}>₹ {r.e.rate_per_pc}</td><td style={{ ...styles.td, fontWeight: 'bold' }}>₹ {money(r.amount)}</td>
            </tr>
          ))}
          {rows.length > 0 && <tr style={{ background: '#f1f5f9', fontWeight: 'bold' }}><td style={styles.td} colSpan={6}>மொத்தம்</td><td style={styles.td}>{totalPcs}</td><td style={styles.td} /><td style={styles.td}>₹ {money(total)}</td></tr>}
        </tbody>
      </TableWrap>
      <div style={{ marginTop: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px', display: 'flex', gap: '18px', flexWrap: 'wrap', fontSize: '14px' }}>
        {byWork.map(b => <div key={b.w}>{b.w}: <b>{b.pcs} Pcs / ₹ {money(b.amt)}</b></div>)}
        <div>மொத்தம்: <b>₹ {money(total)}</b></div>
        {(num(advance) > 0 || num(deduct) > 0) && <div>Advance + பிடித்தம்: <b>− ₹ {money(num(advance) + num(deduct))}</b></div>}
        <div style={{ color: '#047857', fontSize: '16px' }}>நிகரச் சம்பளம்: <b>₹ {money(net)}</b></div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- salary ledger by batch code
function BatchTab({ entries, tx, names, modelOf }: { entries: any[]; tx: TailorStore; names: Record<string, string>; modelOf: (c: string) => string }) {
  const [q, setQ] = useState('');
  const codes = Array.from(new Set(entries.map(e => baseCode(e.batch_code)))).sort();
  const nm = (c: string) => nameFor(names, c);
  const label = (c: string) => `${c}${nm(c) ? ` (${nm(c)})` : ''}`;
  const match = (c: string) => !q.trim() || label(c).toLowerCase().includes(q.trim().toLowerCase());
  const [sel, setSel] = useState('');
  const list = codes.filter(match);
  const cur = sel && codes.includes(sel) ? sel : '';
  const rows = entries.filter(e => baseCode(e.batch_code) === cur).sort((a, b) => num(a.id) - num(b.id));
  const issued = rows.reduce((a, e) => a + num(e.pieces), 0);
  const got = rows.filter(e => e.status === 'Received').reduce((a, e) => a + recPcsOf(e, tx.rows[String(e.id)]), 0);
  const wages = rows.reduce((a, e) => a + (e.status === 'Received' ? recPcsOf(e, tx.rows[String(e.id)]) : 0) * num(e.rate_per_pc), 0);
  const pending = rows.filter(e => e.status === 'Issued').reduce((a, e) => a + num(e.pieces) * num(e.rate_per_pc), 0);
  const doc = {
    title: `Batch சம்பளம் — ${cur ? label(cur) : ''}`, headers: ['தேதி', 'Tailor', 'Batch', 'Work', 'Size', 'Issued', 'Received', 'Rate', 'தொகை ₹', 'Status'],
    rows: rows.map(e => { const x = tx.rows[String(e.id)]; return [dateOf(e, x) || '-', e.tailor_name, e.batch_code, x?.work || '-', sizeLines(x?.sizes).join(', ') || '-', num(e.pieces), e.status === 'Received' ? recPcsOf(e, x) : 0, num(e.rate_per_pc), money((e.status === 'Received' ? recPcsOf(e, x) : 0) * num(e.rate_per_pc)), e.status]; }),
    footer: [`Issued ${issued} | Received ${got} | குறைவு ${Math.max(0, issued - got - rows.filter(e => e.status === 'Issued').reduce((a, e) => a + num(e.pieces), 0))}`, `கொடுத்த சம்பளம் (Received): ₹ ${money(wages)}`, `பாக்கி (Issued): ₹ ${money(pending)}`]
  };
  return (
    <div style={styles.card}>
      <h4 style={{ margin: '0 0 12px 0', color: '#0f172a' }}>📒 Batch Code வாரி சம்பள Ledger</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '12px' }}>
        <div><label style={styles.label}>தேடு (Batch / Local Name)</label><input value={q} onChange={e => setQ(e.target.value)} style={styles.input} placeholder="Batch அல்லது Local Name" /></div>
        <div><label style={styles.label}>Batch ({list.length})</label>
          <select value={cur} onChange={e => setSel(e.target.value)} style={styles.input}><option value="">-- Batch தேர்வு --</option>{list.map(c => <option key={c} value={c}>{label(c)}{modelOf(c) ? ` | ${modelOf(c)}` : ''}</option>)}</select></div>
      </div>
      {!cur ? <div style={{ color: '#64748b', fontSize: '13px' }}>Batch-ஐத் தேர்வு செய்தால் அந்த Batch-ஐ யார் எவ்வளவு தைத்தார்கள், என்ன சம்பளம் என்று தெரியும் (-P Child Batch-களும் சேரும்).</div> : <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
          <div style={{ fontSize: '16px' }}><b>{cur}</b> {nm(cur) && <b style={{ color: '#6d28d9' }}>— {nm(cur)}</b>}</div>
          <ShareBar doc={doc} />
        </div>
        <TableWrap minWidth={860}>
          <thead><tr style={{ background: '#0f172a', color: 'white' }}>{['தேதி', 'Tailor', 'Batch', 'Work', 'Size', 'Issued', 'Received', 'Rate', 'தொகை ₹', 'Status'].map(h => <th key={h} style={styles.thSub}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map(e => { const x = tx.rows[String(e.id)]; const rp = e.status === 'Received' ? recPcsOf(e, x) : 0; return (
              <tr key={e.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={styles.td}>{dateOf(e, x) || '-'}</td><td style={styles.td}><b>{e.tailor_name}</b></td><td style={styles.td}>{e.batch_code}</td><td style={styles.td}>{x?.work || '-'}</td>
                <td style={styles.td}><Lines m={x?.sizes} /></td><td style={styles.td}>{e.pieces}</td><td style={styles.td}>{e.status === 'Received' ? rp : '-'}</td>
                <td style={styles.td}>₹ {e.rate_per_pc}</td><td style={{ ...styles.td, fontWeight: 'bold' }}>₹ {money(rp * num(e.rate_per_pc))}</td><td style={styles.td}>{e.status}</td>
              </tr>); })}
            <tr style={{ background: '#f1f5f9', fontWeight: 'bold' }}><td style={styles.td} colSpan={5}>மொத்தம்</td><td style={styles.td}>{issued}</td><td style={styles.td}>{got}</td><td style={styles.td} /><td style={styles.td}>₹ {money(wages)}</td><td style={styles.td} /></tr>
          </tbody>
        </TableWrap>
        <div style={{ marginTop: '10px', fontSize: '14px', display: 'flex', gap: '18px', flexWrap: 'wrap' }}>
          <div>கொடுத்த சம்பளம் (Received): <b>₹ {money(wages)}</b></div>
          <div>பாக்கி (Issued): <b>₹ {money(pending)}</b></div>
          {got > 0 && <div>ஒரு Pc-க்கு சராசரி: <b>₹ {money(wages / got)}</b></div>}
        </div>
      </>}
    </div>
  );
}
