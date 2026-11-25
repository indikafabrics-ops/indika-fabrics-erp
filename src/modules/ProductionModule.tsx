import { useCallback, useEffect, useState } from 'react';
import { supabase, fetchAll, errMsg } from '../lib/supabase';
import { loadBatchMeta, type BatchMeta } from '../lib/batchMeta';
import { WIP_STAGES } from '../lib/constants';
import { baseBatchCode, num } from '../lib/helpers';
import { logAction } from '../lib/audit';
import { loadBatchNames , nameFor } from '../lib/batchNames';
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

export default function ProductionModule() {
  const [wip, setWip] = useState<any[]>([]);
  const [meta, setMeta] = useState<Record<string, BatchMeta>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moveQty, setMoveQty] = useState<Record<string, string>>({});
  const [damageQty, setDamageQty] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<any>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const rows = await fetchAll('pommys_production_wip', '*', q => q.neq('current_status', 'Ready Stock'));
      rows.sort((a, b) => num(b.id) - num(a.id));
      setWip(rows);
      setMeta(await loadBatchMeta(rows));
      loadBatchNames().then(setNames).catch(() => undefined);
    } catch (err: any) {
      setError('WIP load தோல்வி: ' + errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
      const dmg = Math.floor(Math.max(0, num(damageQty[key])));
      if (dmg >= total) throw new Error(`Damage (${dmg}) மொத்த Pieces (${total})-ஐ விடக் குறைவாக இருக்க வேண்டும்.`);

      const usable = total - dmg;
      const raw = moveQty[key];
      const pcsToMove = raw !== undefined && raw !== '' ? Math.floor(num(raw)) : usable;
      if (!pcsToMove || pcsToMove <= 0 || pcsToMove > usable) throw new Error(`நகர்த்தும் Pieces 1 முதல் ${usable} வரை இருக்க வேண்டும்.`);

      const base = baseBatchCode(b.batch_code);
      const m = meta[b.batch_code] || { model: b.model_name, design: '-', color: '-' };
      const remaining = total - dmg - pcsToMove;
      const toReady = newStatus === 'Ready Stock';

      // 1) damaged pieces → log
      if (dmg > 0) {
        const { error } = await supabase.from('pommys_exceptions_stock').insert([{
          stock_type: 'DAMAGE', ref_code: b.batch_code, model_or_item: b.model_name, color: m.color || '-',
          qty: dmg, unit: 'Pcs', remarks: `WIP Damage (${b.current_status})`
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
        logAction(`WIP நகர்வு ${batch.batch_code}: ${pcsToMove} pcs → ${newStatus}`);
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
        notify(toReady ? `🎉 Batch ${b.batch_code} (${pcsToMove} pcs) Ready Stock-க்கு வந்தது!` : `✅ Batch ${b.batch_code} → ${newStatus}`);
      }

      setMoveQty(prev => ({ ...prev, [key]: '' }));
      setDamageQty(prev => ({ ...prev, [key]: '' }));
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
        {stageTotals.map(s => (
          <div key={s.stage} style={{ ...styles.card, borderTop: '4px solid #d97706', padding: '14px' }}>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>{s.stage}</div>
            <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#0f172a', marginTop: '4px' }}>{s.pcs} Pcs</div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>{s.batches} Batch(es)</div>
          </div>
        ))}
      </div>

      <div style={styles.card}>
        <h3 style={{ margin: '0 0 10px 0', color: '#0f172a', borderBottom: '2px solid #f1f5f9', paddingBottom: '10px', fontSize: '17px' }}>🏭 Live Production Tracking (WIP)</h3>
        <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>
          முழு Batch-ஐ நகர்த்த Partial Pcs காலியாக விடவும். சிலவற்றை மட்டும் நகர்த்த எண்ணிக்கையை உள்ளிடவும். Damage / Seconds இருந்தால் Damage கட்டத்தில் உள்ளிடவும்.
        </p>
        {error && <ErrorBanner message={error} onRetry={load} />}
        {!loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
            <ShareBar doc={{ title: 'Production WIP', headers: ['Batch Code', 'Local Name', 'Stage', 'Model', 'Design', 'Color', 'Pcs'], rows: wip.map(b => [b.batch_code, nameFor(names, b.batch_code) || '-', b.current_status, b.model_name || meta[b.batch_code]?.model || '-', meta[b.batch_code]?.design || '-', meta[b.batch_code]?.color || '-', num(b.total_pieces)]), footer: [`மொத்தம்: ${wip.reduce((a, b) => a + num(b.total_pieces), 0)} Pcs`] }} />
          </div>
        )}
        {loading ? <Loading /> : (
          <TableWrap minWidth={900}>
            <thead>
              <tr style={{ background: '#1e293b', color: 'white' }}>
                <th style={styles.thSub}>Batch Code</th>
                <th style={styles.thSub}>Model</th>
                <th style={styles.thSub}>Design / Color</th>
                <th style={styles.thSub}>Total Pcs</th>
                <th style={styles.thSub}>Current Status</th>
                <th style={styles.thSub}>Partial Pcs (Opt)</th>
                <th style={styles.thSub}>Damage Pcs (Opt)</th>
                <th style={styles.thSub}>Action</th>
              </tr>
            </thead>
            <tbody>
              {wip.length === 0 ? <EmptyRow cols={8} text="WIP-ல் Active Batch எதுவும் இல்லை" /> : wip.map(batch => {
                const next = NEXT_STATUS[batch.current_status];
                const m = meta[batch.batch_code];
                const key = String(batch.id);
                return (
                  <tr key={batch.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={styles.td}><strong>{batch.batch_code}</strong>{nameFor(names, batch.batch_code) && <div style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 'bold' }}>{nameFor(names, batch.batch_code)}</div>}</td>
                    <td style={styles.td}>{m?.model || batch.model_name}</td>
                    <td style={styles.td}>{m ? `${m.design}${m.color && m.color !== '-' ? ` / ${m.color}` : ''}` : '-'}</td>
                    <td style={styles.td}><strong>{batch.total_pieces}</strong></td>
                    <td style={styles.td}>
                      <span style={{ background: '#fef3c7', color: '#b45309', padding: '5px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{batch.current_status}</span>
                    </td>
                    <td style={styles.td}>
                      <input type="number" min="0" step="1" placeholder={`All (${batch.total_pieces})`} value={moveQty[key] || ''} onChange={e => setMoveQty(prev => ({ ...prev, [key]: e.target.value }))} style={{ ...styles.tblInput, width: '90px' }} />
                    </td>
                    <td style={styles.td}>
                      <input type="number" min="0" step="1" placeholder="0" value={damageQty[key] || ''} onChange={e => setDamageQty(prev => ({ ...prev, [key]: e.target.value }))} style={{ ...styles.tblInput, width: '75px', borderColor: '#fca5a5' }} />
                    </td>
                    <td style={styles.td}>
                      {next ? (
                        <button type="button" disabled={busyId !== null} onClick={() => handleMove(batch, next)} style={{ ...styles.primaryBtn, padding: '6px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}>
                          {busyId === batch.id ? '...' : `Move to ${next} ➡️`}
                        </button>
                      ) : <span style={{ fontSize: '12px', color: '#64748b' }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
}
