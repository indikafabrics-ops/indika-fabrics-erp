import { useCallback, useEffect, useState } from 'react';
import { supabase, fetchAll, errMsg } from '../lib/supabase';
import { loadBatchMeta, type BatchMeta } from '../lib/batchMeta';
import { WIP_STAGES } from '../lib/constants';
import { baseBatchCode, num } from '../lib/helpers';
import { logAction } from '../lib/audit';
import { loadBatchNames , nameFor } from '../lib/batchNames';
import { loadSizeLedger, loadCutSizes, saveSizeUpdates, sizesFor, sumSizes, fmtSizes, sortSizes, type SizeMap } from '../lib/sizeLedger';
import SizeQty from '../components/SizeQty';
import RowActions from '../components/RowActions';
import LocalNameEdit from '../components/LocalNameEdit';
import { uniqueNames } from '../lib/batchNames';
import { loadCostSheets, type CostSheet } from '../lib/costSheets';
import { loadClothPerPc, makeValuer } from '../lib/valuation';
import { loadDesignMaster, type DesignInfo } from '../lib/masterStore';
import StageReport from '../components/StageReport';
import ShareBar from '../components/ShareBar';
import { EmptyRow, ErrorBanner, Loading, TableWrap, notify, styles } from '../components/ui';

const NEXT_STATUS: Record<string, string> = {
  Cutting: 'Stitching',
  Stitching: 'QC Check',
  'QC Check': 'Packing',
  Packing: 'Ready Stock'
};

async function nextChildCode(base: string): Promise<string> {
  const taken = new Set<string>();
  for (const table of ['pommys_production_wip', 'pommys_ready_stock']) {
    const { data } = await supabase.from(table).select('batch_code').like('batch_code', `${base}-P%`);
    (data || []).forEach((r: any) => taken.add(String(r.batch_code)));
  }
  let n = 1;
  while (taken.has(`${base}-P${n}`)) n++;
  return `${base}-P${n}`;
}

export default function ProductionModule({ user }: { user?: any }) {
  const [wip, setWip] = useState<any[]>([]);
  const [meta, setMeta] = useState<Record<string, BatchMeta>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moveBy, setMoveBy] = useState<Record<string, Record<string, string>>>({});
  const [damageBy, setDamageBy] = useState<Record<string, Record<string, string>>>({});
  const [ledger, setLedger] = useState<Record<string, SizeMap>>({});
  const [cutSizes, setCutSizes] = useState<Record<string, SizeMap>>({});
  const [sheets, setSheets] = useState<Record<string, CostSheet>>({});
  const [clothPc, setClothPc] = useState<Record<string, number>>({});
  const [designs, setDesigns] = useState<Record<string, DesignInfo>>({});
  useEffect(() => { loadCostSheets().then(setSheets).catch(() => undefined); loadClothPerPc().then(setClothPc).catch(() => undefined); loadDesignMaster().then(setDesigns).catch(() => undefined); }, []);
  const [tab, setTab] = useState<string>('Cutting');
  const [busyId, setBusyId] = useState<any>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const rows = await fetchAll('pommys_production_wip', '*', q => q.neq('current_status', 'Ready Stock'));
      rows.sort((a, b) => num(b.id) - num(a.id));
      setWip(rows);
      setMeta(await loadBatchMeta(rows));
      loadBatchNames().then(setNames).catch(() => undefined);
      loadSizeLedger().then(setLedger).catch(() => undefined);
      loadCutSizes().then(setCutSizes).catch(() => undefined);
    } catch (err: any) {
      setError('WIP load தோல்வி: ' + errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /** sizes of a WIP row: size ledger -> Cutting sizes -> size written in an opening-stock label ("... - XL SIZE") */
  const availOf = (code: string, total: number): SizeMap => {
    const own = ledger[code];
    if ((!own || !Object.keys(own).length) && !cutSizes[baseBatchCode(code)] && meta[code]?.size) return total > 0 ? { [meta[code].size as string]: total } : {};
    return sizesFor(code, total, ledger, cutSizes);
  };

  const handleMove = async (batch: any, newStatus: string) => {
    if (busyId) return;
    setBusyId(batch.id);
    const key = String(batch.id);
    let insertedChild: { table: string; code: string } | null = null;
    try {
      // fresh copy – the screen may be old
      const { data: cur, error: curErr } = await supabase.from('pommys_production_wip').select('*').eq('id', batch.id).limit(1);
      if (curErr || !cur || !cur[0]) throw new Error('Batch கிடைக்கவில்லை. Refresh செய்யவும்.');
      const b = cur[0];
      if (b.current_status !== batch.current_status) {
        await load();
        throw new Error('இந்த Batch ஏற்கனவே வேறு Stage-க்கு நகர்த்தப்பட்டுள்ளது. List புதுப்பிக்கப்பட்டது.');
      }

      const total = Math.floor(num(b.total_pieces));
      const avail = availOf(b.batch_code, total);
      const dmgIn = damageBy[key] || {};
      const movIn = moveBy[key] || {};
      const dmgBy: SizeMap = {}; const movBy: SizeMap = {};
      Object.keys(avail).forEach(sz => { dmgBy[sz] = Math.max(0, Math.floor(num(dmgIn[sz]))); });
      const dmg = sumSizes(dmgBy);
      for (const sz of Object.keys(avail)) if (dmgBy[sz] > avail[sz]) throw new Error(`Size ${sz}: Damage (${dmgBy[sz]}) இருப்பை (${avail[sz]}) விட அதிகம்.`);
      if (dmg >= total) throw new Error(`Damage (${dmg}) மொத்த Pieces (${total})-ஐ விடக் குறைவாக இருக்க வேண்டும்.`);

      const anyMove = Object.keys(avail).some(sz => num(movIn[sz]) > 0);
      Object.keys(avail).forEach(sz => {
        const usableSz = avail[sz] - dmgBy[sz];
        movBy[sz] = anyMove ? Math.max(0, Math.floor(num(movIn[sz]))) : usableSz; // nothing typed → move everything that is left
      });
      for (const sz of Object.keys(avail)) if (movBy[sz] > avail[sz] - dmgBy[sz]) throw new Error(`Size ${sz}: நகர்த்தும் ${movBy[sz]} Pcs, இருப்பு ${avail[sz] - dmgBy[sz]} மட்டுமே.`);
      const pcsToMove = sumSizes(movBy);
      if (pcsToMove <= 0) throw new Error('நகர்த்த குறைந்தது ஒரு Size-ல் Qty தேவை.');
      const remainBy: SizeMap = {};
      Object.keys(avail).forEach(sz => { remainBy[sz] = avail[sz] - dmgBy[sz] - movBy[sz]; });
      const remaining = sumSizes(remainBy);

      const base = baseBatchCode(b.batch_code);
      const m = meta[b.batch_code] || { model: b.model_name, design: '-', color: '-' };
      const toReady = newStatus === 'Ready Stock';
      const ledgerUpdates: Record<string, SizeMap | null> = {};

      // 1) damaged pieces → log
      if (dmg > 0) {
        const { error } = await supabase.from('pommys_exceptions_stock').insert([{
          stock_type: 'DAMAGE', ref_code: b.batch_code, model_or_item: b.model_name, color: m.color || '-',
          qty: dmg, unit: 'Pcs', remarks: `WIP Damage (${b.current_status}) ${fmtSizes(dmgBy)}`.trim()
        }]);
        if (error) throw error;
      }

      const readyRow = (code: string) => ({
        batch_code: code,
        model_name: m.model || b.model_name,
        design_no: m.design || '-',
        color: m.color || '-',
        ready_pieces: pcsToMove
      });

      if (remaining > 0) {
        // 2) partial move: create the child batch FIRST, then reduce the parent
        const childCode = await nextChildCode(base);
        if (toReady) {
          const { error } = await supabase.from('pommys_ready_stock').insert([readyRow(childCode)]);
          if (error) throw error;
          insertedChild = { table: 'pommys_ready_stock', code: childCode };
        } else {
          const { error } = await supabase.from('pommys_production_wip').insert([{
            batch_code: childCode, model_name: b.model_name, total_pieces: pcsToMove, current_status: newStatus
          }]);
          if (error) throw error;
          insertedChild = { table: 'pommys_production_wip', code: childCode };
        }
        const { error: updErr } = await supabase.from('pommys_production_wip').update({ total_pieces: remaining }).eq('id', b.id);
        if (updErr) throw updErr;
        ledgerUpdates[childCode] = movBy;
        ledgerUpdates[b.batch_code] = remainBy;
        logAction(`WIP நகர்வு ${batch.batch_code}: ${pcsToMove} pcs (${fmtSizes(movBy)}) → ${newStatus}`);
        notify(`✅ ${pcsToMove} pcs → ${newStatus}${dmg > 0 ? ` (${dmg} damage பதிவு)` : ''}; ${remaining} pcs ${b.current_status}-ல் மீதம்.`);
      } else {
        // 3) whole batch moves
        if (toReady) {
          const { error } = await supabase.from('pommys_ready_stock').insert([readyRow(b.batch_code)]);
          if (error) throw error;
          insertedChild = { table: 'pommys_ready_stock', code: b.batch_code };
        }
        const { error: updErr } = await supabase.from('pommys_production_wip').update({ current_status: newStatus, total_pieces: pcsToMove }).eq('id', b.id);
        if (updErr) throw updErr;
        ledgerUpdates[b.batch_code] = movBy;
        logAction(`WIP நகர்வு ${batch.batch_code}: முழு Batch (${fmtSizes(movBy)}) → ${newStatus}`);
        notify(toReady ? `🎉 Batch ${b.batch_code} (${pcsToMove} pcs) Ready Stock-க்கு வந்தது!` : `✅ Batch ${b.batch_code} → ${newStatus}`);
      }

      try { await saveSizeUpdates(ledgerUpdates); } catch { notify('Size விவரம் சேமிக்க முடியவில்லை (Pcs சரியாக நகர்ந்துள்ளது).', 'warn'); }
      setMoveBy(prev => ({ ...prev, [key]: {} }));
      setDamageBy(prev => ({ ...prev, [key]: {} }));
      await load();
    } catch (err: any) {
      if (insertedChild) {
        await supabase.from(insertedChild.table).delete().eq('batch_code', insertedChild.code);
      }
      notify(errMsg(err), 'err');
    } finally {
      setBusyId(null);
    }
  };

  const stageTotals = WIP_STAGES.map(s => ({
    stage: s,
    pcs: wip.filter(w => w.current_status === s).reduce((a, w) => a + num(w.total_pieces), 0),
    batches: wip.filter(w => w.current_status === s).length
  }));
  const [pq, setPq] = useState('');
  const hit = (w: any) => { const q = pq.trim().toLowerCase(); if (!q) return true; const m = meta[w.batch_code]; return `${w.batch_code} ${nameFor(names, w.batch_code)} ${w.model_name} ${m?.design || ''} ${m?.color || ''}`.toLowerCase().includes(q); };
  const shown = wip.filter(w => w.current_status === tab && hit(w));
  const next = NEXT_STATUS[tab];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
        {stageTotals.map(s => (
          <div key={s.stage} onClick={() => setTab(s.stage)} style={{ ...styles.card, cursor: 'pointer', borderTop: `4px solid ${tab === s.stage ? '#1d4ed8' : '#d97706'}`, padding: '14px' }}>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>{s.stage}</div>
            <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#0f172a', marginTop: '4px' }}>{s.pcs} Pcs</div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>{s.batches} Batch(es)</div>
          </div>
        ))}
      </div>

      <div style={styles.card}>
        <h3 style={{ margin: '0 0 10px 0', color: '#0f172a', borderBottom: '2px solid #f1f5f9', paddingBottom: '10px', fontSize: '17px' }}>🏭 Live Production Tracking (WIP)</h3>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {stageTotals.map(s => (
            <button key={s.stage} type="button" onClick={() => setTab(s.stage)} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', background: tab === s.stage ? '#1e293b' : '#f8fafc', color: tab === s.stage ? 'white' : '#334155' }}>
              {s.stage} ({s.pcs})
            </button>
          ))}
        </div>
        <input type="text" placeholder="🔍 Local Name / Batch / Model / Design தேடுக..." value={pq} onChange={e => setPq(e.target.value)} style={{ ...styles.input, maxWidth: '320px', marginBottom: '10px' }} />
        <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>
          Size வாரியாக "நகர்த்த" கட்டங்களில் எண்ணிக்கை உள்ளிடவும். எதுவும் உள்ளிடாவிட்டால் மீதமுள்ள முழு Qty நகரும். Damage இருந்தால் சிவப்பு கட்டங்களில் Size வாரியாக உள்ளிடவும்.
        </p>
        {error && <ErrorBanner message={error} onRetry={load} />}
        {!loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
            <ShareBar doc={{ title: `Production WIP – ${tab}`, headers: ['Batch Code', 'Local Name', 'Stage', 'Model', 'Design', 'Color', 'Size', 'Pcs'], rows: shown.flatMap(b => { const av = availOf(b.batch_code, Math.floor(num(b.total_pieces))); const ks = Object.keys(av).sort(sortSizes); return (ks.length ? ks : ['—']).map(sz => [b.batch_code, nameFor(names, b.batch_code) || '-', b.current_status, b.model_name || meta[b.batch_code]?.model || '-', meta[b.batch_code]?.design || '-', meta[b.batch_code]?.color || '-', sz, ks.length ? av[sz] : num(b.total_pieces)]); }), footer: [`மொத்தம்: ${shown.reduce((a, b) => a + num(b.total_pieces), 0)} Pcs`] }} />
          </div>
        )}
        {loading ? <Loading /> : (
          <TableWrap minWidth={900}>
            <thead>
              <tr style={{ background: '#1e293b', color: 'white' }}>
                <th style={styles.thSub}>Batch Code / Local Name</th>
                <th style={styles.thSub}>Model</th>
                <th style={styles.thSub}>Design / Color</th>
                <th style={styles.thSub}>Size</th>
                <th style={styles.thSub}>Qty (Pcs)</th>
                <th style={styles.thSub}>நகர்த்த (Opt)</th>
                <th style={styles.thSub}>Damage (Opt)</th>
                <th style={styles.thSub}>Action</th>
              </tr>
            </thead>
            {shown.length === 0 ? <tbody><EmptyRow cols={8} text={`${tab}-ல் Active Batch எதுவும் இல்லை`} /></tbody> : shown.map(batch => {
              const m = meta[batch.batch_code];
              const key = String(batch.id);
              const total = Math.floor(num(batch.total_pieces));
              const avail = availOf(batch.batch_code, total);
              const szs = Object.keys(avail).sort(sortSizes);
              const lines = szs.length ? szs : ['—'];
              const span = lines.length;
              return (
                <tbody key={batch.id} style={{ borderBottom: '2px solid #cbd5e1' }}>
                  {lines.map((sz, i) => (
                    <tr key={sz} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      {i === 0 && <>
                        <td style={styles.td} rowSpan={span}><strong>{batch.batch_code}</strong><LocalNameEdit code={batch.batch_code} name={nameFor(names, batch.batch_code)} options={uniqueNames(names)} onSaved={n => setNames(p => ({ ...p, [batch.batch_code]: n }))} /><div style={{ fontSize: '11px', color: '#64748b' }}>மொத்தம் {batch.total_pieces} Pcs</div></td>
                        <td style={styles.td} rowSpan={span}>{m?.model || batch.model_name}</td>
                        <td style={styles.td} rowSpan={span}>{m ? `${m.design}${m.color && m.color !== '-' ? ` / ${m.color}` : ''}` : '-'}</td>
                      </>}
                      <td style={{ ...styles.td, fontWeight: 'bold' }}>{sz}</td>
                      <td style={{ ...styles.td, fontWeight: 'bold' }}>{szs.length ? avail[sz] : total}</td>
                      <td style={styles.td}>{szs.length ? <input type="number" min="0" max={avail[sz]} step="1" placeholder="All" value={(moveBy[key] || {})[sz] || ''} onChange={e => setMoveBy(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [sz]: e.target.value } }))} style={{ ...styles.tblInput, width: '70px' }} /> : '—'}</td>
                      <td style={styles.td}>{szs.length ? <input type="number" min="0" max={avail[sz]} step="1" placeholder="0" value={(damageBy[key] || {})[sz] || ''} onChange={e => setDamageBy(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [sz]: e.target.value } }))} style={{ ...styles.tblInput, width: '70px', borderColor: '#fca5a5' }} /> : '—'}</td>
                      {i === 0 && (
                        <td style={styles.td} rowSpan={span}>
                          {next ? (
                            <button type="button" disabled={busyId !== null} onClick={() => handleMove(batch, next)} style={{ ...styles.primaryBtn, padding: '6px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}>
                              {busyId === batch.id ? '...' : `Move to ${next} ➡️`}
                            </button>
                          ) : <span style={{ fontSize: '12px', color: '#64748b' }}>—</span>}
                          {user && <RowActions user={user} table="pommys_production_wip" row={batch} label={`WIP ${batch.batch_code}`} fields={['model_name', 'total_pieces', 'current_status']} labels={{ model_name: 'Model Name (Local Name இங்கே அல்ல — Local Name-க்கு ✏️ பயன்படுத்தவும்)', total_pieces: 'Total Pcs', current_status: 'Stage' }} onDone={load} />}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              );
            })}
          </TableWrap>
        )}
      </div>

      <StageReport wip={wip} meta={meta} names={names} availOf={availOf} stage={tab} valuer={makeValuer(sheets, clothPc, designs)} />
    </div>
  );
}
