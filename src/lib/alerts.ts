import { fetchAll } from './supabase';
import { baseBatchCode, num, r3 } from './helpers';
import { loadBatchNames , nameFor } from './batchNames';
import type { DrillDoc } from './drill';
import { loadIndex, missingDates, ymd } from './tradeStock';
import { loadCostSheets, modelKey } from './costSheets';
import { parseModelLabel } from './helpers';

export interface AlertCard { key: string; label: string; color: string; count: number; doc: DrillDoc }

const days = (d: any): number => {
  const t = d ? new Date(d).getTime() : NaN;
  return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86400000) : -1;
};

export const SLOW_FABRIC_DAYS = 60;
export const WIP_STUCK_DAYS = 15;
export const LOW_READY_PCS = 10;
export const HIGH_DAMAGE_PCT = 5;

/** the four warning cards shown on the Dashboard and in Search & Analysis */
export async function loadAlerts(): Promise<AlertCard[]> {
  const [fabric, wip, ready, exc, cut, names] = await Promise.all([
    fetchAll('pommys_fabric_stock', '*', q => q.gt('available_meters', 0.01)),
    fetchAll('pommys_production_wip', '*', q => q.neq('current_status', 'Ready Stock')),
    fetchAll('pommys_ready_stock', '*'),
    fetchAll('pommys_exceptions_stock', '*'),
    fetchAll('pommys_cutting_batches', 'batch_code,product_model,total_pieces', undefined, 'batch_code'),
    loadBatchNames().catch(() => ({} as Record<string, string>))
  ]);

  const slow = fabric.filter((f: any) => days(f.created_at) >= SLOW_FABRIC_DAYS)
    .sort((a: any, b: any) => days(b.created_at) - days(a.created_at));
  const stuck = wip.filter((w: any) => days(w.updated_at || w.created_at) >= WIP_STUCK_DAYS)
    .sort((a: any, b: any) => days(b.updated_at || b.created_at) - days(a.updated_at || a.created_at));

  const byDesign = new Map<string, { model: string; design: string; pcs: number }>();
  ready.forEach((r: any) => {
    const k = `${r.model_name}|${r.design_no}`.toLowerCase();
    const cur = byDesign.get(k) || { model: r.model_name || '-', design: r.design_no || '-', pcs: 0 };
    cur.pcs += num(r.ready_pieces); byDesign.set(k, cur);
  });
  const low = Array.from(byDesign.values()).filter(d => d.pcs < LOW_READY_PCS).sort((a, b) => a.pcs - b.pcs);

  const cutBy = new Map(cut.map((c: any) => [c.batch_code, c]));
  const dmgBy = new Map<string, number>();
  exc.filter((e: any) => e.stock_type === 'DAMAGE' && String(e.unit || 'Pcs') !== 'Mtr').forEach((e: any) => {
    const b = baseBatchCode(e.ref_code); if (!b) return;
    dmgBy.set(b, (dmgBy.get(b) || 0) + num(e.qty));
  });
  const hi = Array.from(dmgBy.entries()).map(([b, d]) => {
    const c: any = cutBy.get(b); const tot = num(c?.total_pieces);
    return { b, d, tot, pct: tot > 0 ? (d / tot) * 100 : 0, model: c?.product_model || '-' };
  }).filter(x => x.tot > 0 && x.pct >= HIGH_DAMAGE_PCT).sort((a, b) => b.pct - a.pct);

  // Busy uploads that are still pending (shops that already started uploading)
  let upload: AlertCard | null = null;
  try {
    const ix = await loadIndex();
    const old = ymd(new Date(Date.now() - 7 * 86400000));
    const rows = Object.keys(ix).sort().map(sh => {
      const miss = missingDates(ix[sh], 7);
      const stale = !ix[sh].stockAsOn || ix[sh].stockAsOn! < old;
      return { sh, miss, stale, asOn: ix[sh].stockAsOn || '-' };
    }).filter(r => r.miss.length > 0 || r.stale);
    upload = { key: 'upload', label: 'Busy Sales / Stock Upload பாக்கி உள்ள கடைகள்', color: '#0369a1', count: rows.length,
      doc: { title: 'Busy Upload பாக்கி', subtitle: 'கடந்த 7 நாள்', headers: ['கடை', 'Stock As On', 'Sales Upload இல்லாத தேதிகள்'], rows: rows.map(r => [r.sh, r.asOn + (r.stale ? ' ⚠️ பழையது' : ''), r.miss.join(', ') || '-']) } };
  } catch { upload = null; }

  // models with stock but no Cost Sheet
  let costing: AlertCard | null = null;
  try {
    const sheets = await loadCostSheets();
    const cnt = new Map<string, number>();
    wip.forEach((w: any) => { const m = parseModelLabel(String(w.model_name || '')).model; cnt.set(m, (cnt.get(m) || 0) + num(w.total_pieces)); });
    ready.forEach((r: any) => { const m = String(r.model_name || '-'); cnt.set(m, (cnt.get(m) || 0) + num(r.ready_pieces)); });
    const rows = Array.from(cnt.entries()).filter(([m, q]) => q > 0 && m !== '-' && !sheets[modelKey(m)]).sort((a, b) => b[1] - a[1]);
    costing = { key: 'costing', label: 'Costing (Cost Sheet) போடாத Model', color: '#be123c', count: rows.length,
      doc: { title: 'Costing போடவும்', subtitle: 'Costing & Rate Fixer → 📋 Cost Sheet', headers: ['Model', 'Stock Pcs'], rows: rows.map(([m, q]) => [m, q]) } };
  } catch { costing = null; }

  return [
    ...(upload ? [upload] : []),
    ...(costing ? [costing] : []),
    { key: 'slow', label: `${SLOW_FABRIC_DAYS} நாளுக்கு மேல் நகராத Fabric`, color: '#b45309', count: slow.length,
      doc: { title: 'மெதுவாக நகரும் Fabric', subtitle: `${SLOW_FABRIC_DAYS}+ நாள்`, headers: ['Item', 'Design', 'Color', 'Meters', 'நாள்'], rows: slow.map((f: any) => [f.item_name, f.design_no, f.color || '-', r3(num(f.available_meters)), days(f.created_at)]) } },
    { key: 'stuck', label: `${WIP_STUCK_DAYS} நாளுக்கு மேல் ஒரே Stage-ல் உள்ள Batch`, color: '#d97706', count: stuck.length,
      doc: { title: 'தாமதமாகும் Batch', subtitle: `${WIP_STUCK_DAYS}+ நாள்`, headers: ['Batch', 'Local Name', 'Stage', 'Model', 'Pcs', 'நாள்'], rows: stuck.map((w: any) => [w.batch_code, nameFor(names, w.batch_code) || '-', w.current_status, w.model_name || '-', num(w.total_pieces), days(w.updated_at || w.created_at)]) } },
    { key: 'low', label: `Godown-ல் ${LOW_READY_PCS} Pcs-க்கும் குறைவான Design`, color: '#7c3aed', count: low.length,
      doc: { title: 'குறைவான Ready Stock', headers: ['Model', 'Design', 'Pcs'], rows: low.map(d => [d.model, d.design, d.pcs]) } },
    { key: 'damage', label: `Damage ${HIGH_DAMAGE_PCT}%-க்கு மேல் உள்ள Batch`, color: '#dc2626', count: hi.length,
      doc: { title: 'அதிக Damage Batch', headers: ['Batch', 'Local Name', 'Model', 'Cut Pcs', 'Damage', '%'], rows: hi.map(x => [x.b, nameFor(names, x.b) || '-', x.model, x.tot, x.d, r3(x.pct)]) } }
  ];
}
