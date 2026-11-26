import { WIP_STAGES } from '../lib/constants';
import { money, num } from '../lib/helpers';
import { nameFor } from '../lib/batchNames';
import { sortSizes, type SizeMap } from '../lib/sizeLedger';
import type { BatchMeta } from '../lib/batchMeta';
import ShareBar from './ShareBar';
import { EmptyRow, TableWrap, styles } from './ui';

/** Stage-wise report: Model / Design / Colour rows × Size columns for the selected stage + all-stage summary */
export default function StageReport({ wip, meta, names, availOf, stage, costOf }: { wip: any[]; meta: Record<string, BatchMeta>; names: Record<string, string>; availOf: (code: string, total: number) => SizeMap; stage: string; costOf?: (model: string, stage: string) => number | undefined }) {
  const ageDays = (w: any) => { const t = new Date(w.updated_at || w.created_at || '').getTime(); return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 86400000)) : -1; };
  const sum = WIP_STAGES.map(st => {
    const ws = wip.filter(w => w.current_status === st);
    return { st, batches: ws.length, pcs: ws.reduce((a, w) => a + num(w.total_pieces), 0), oldest: ws.reduce((a, w) => Math.max(a, ageDays(w)), -1) };
  });
  const rowsFor = wip.filter(w => w.current_status === stage);
  const sizes = Array.from(new Set(rowsFor.flatMap(w => Object.keys(availOf(w.batch_code, Math.floor(num(w.total_pieces))))))).sort(sortSizes);
  const grp = new Map<string, { model: string; design: string; color: string; by: SizeMap; pcs: number; batches: string[] }>();
  rowsFor.forEach(w => {
    const m = meta[w.batch_code];
    const model = m?.model || w.model_name || '-', design = m?.design || '-', color = m?.color || '-';
    const k = `${model}|${design}|${color}`;
    const g = grp.get(k) || { model, design, color, by: {}, pcs: 0, batches: [] };
    const a = availOf(w.batch_code, Math.floor(num(w.total_pieces)));
    Object.entries(a).forEach(([sz, q]) => { g.by[sz] = (g.by[sz] || 0) + q; });
    g.pcs += num(w.total_pieces); g.batches.push(w.batch_code); grp.set(k, g);
  });
  const list = Array.from(grp.values()).sort((a, b) => (a.model + a.design).localeCompare(b.model + b.design));
  const withCost = !!costOf;
  const cpp = (g: { model: string }) => costOf ? costOf(g.model, stage) : undefined;
  const heads = ['Model', 'Design', 'Colour', ...sizes, 'மொத்தம்', ...(withCost ? ['Cost ₹/Pc', 'Value ₹'] : []), 'Batch'];
  const body = list.map(g => [g.model, g.design, g.color, ...sizes.map(sz => g.by[sz] || ''), g.pcs, ...(withCost ? [cpp(g) === undefined ? '⚠️ Costing போடவும்' : money(cpp(g) as number), cpp(g) === undefined ? '-' : money((cpp(g) as number) * g.pcs)] : []), g.batches.map(c => nameFor(names, c) ? `${c} (${nameFor(names, c)})` : c).join(', ')]);
  const valTot = list.reduce((a, g) => a + (cpp(g) === undefined ? 0 : (cpp(g) as number) * g.pcs), 0);
  const noCostPcs = list.reduce((a, g) => a + (cpp(g) === undefined ? g.pcs : 0), 0);
  const colTot = sizes.map(sz => list.reduce((a, g) => a + (g.by[sz] || 0), 0));
  return (
    <div style={styles.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
        <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>📊 Stage Report — {stage}: Model / Design / Size வாரி</h3>
        <ShareBar doc={{ title: `Production Stage Report — ${stage}`, headers: heads, rows: body, footer: [`மொத்தம்: ${rowsFor.reduce((a, w) => a + num(w.total_pieces), 0)} Pcs • ${rowsFor.length} Batch`, ...(withCost ? [`Stock Value (Cost): ₹ ${money(valTot)}` + (noCostPcs ? ` • ⚠️ Costing இல்லாத ${noCostPcs} Pcs சேரவில்லை` : '')] : []), sizes.length ? 'Size மொத்தம்: ' + sizes.map((sz, i) => `${sz} ${colTot[i]}`).join(' • ') : ''].filter(Boolean)}} />
      </div>
      <TableWrap minWidth={600}>
        <thead><tr style={{ background: '#1e293b', color: 'white' }}>{heads.map(h => <th key={h} style={styles.thSub}>{h}</th>)}</tr></thead>
        <tbody>
          {body.length === 0 ? <EmptyRow cols={heads.length} text={`${stage}-ல் Stock இல்லை`} /> : body.map((r, i) => <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>{r.map((c, j) => <td key={j} style={{ ...styles.td, fontWeight: j === 3 + sizes.length ? 'bold' : undefined }}>{c}</td>)}</tr>)}
          {body.length > 0 && <tr style={{ background: '#f1f5f9', fontWeight: 'bold' }}><td style={styles.td} colSpan={3}>மொத்தம்</td>{colTot.map((t, i) => <td key={i} style={styles.td}>{t}</td>)}<td style={styles.td}>{list.reduce((a, g) => a + g.pcs, 0)}</td>{withCost && <><td style={styles.td} /><td style={styles.td}>₹ {money(valTot)}</td></>}<td style={styles.td} /></tr>}
        </tbody>
      </TableWrap>
      <h4 style={{ margin: '16px 0 8px 0', fontSize: '14px', color: '#0f172a' }}>எல்லா Stage-ம் ஒரே பார்வையில்</h4>
      <TableWrap minWidth={420}>
        <thead><tr style={{ background: '#1e293b', color: 'white' }}>{['Stage', 'Batch', 'Pcs', 'பழைய Batch (நாள்)'].map(h => <th key={h} style={styles.thSub}>{h}</th>)}</tr></thead>
        <tbody>
          {sum.map(r => <tr key={r.st} style={{ borderBottom: '1px solid #e2e8f0' }}><td style={styles.td}><b>{r.st}</b></td><td style={styles.td}>{r.batches}</td><td style={styles.td}>{r.pcs}</td><td style={styles.td}>{r.oldest >= 0 ? r.oldest : '-'}</td></tr>)}
          <tr style={{ background: '#f1f5f9', fontWeight: 'bold' }}><td style={styles.td}>மொத்தம்</td><td style={styles.td}>{sum.reduce((a, r) => a + r.batches, 0)}</td><td style={styles.td}>{sum.reduce((a, r) => a + r.pcs, 0)}</td><td style={styles.td} /></tr>
        </tbody>
      </TableWrap>
    </div>
  );
}
