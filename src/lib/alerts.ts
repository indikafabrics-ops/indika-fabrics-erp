import { fetchAll } from './supabase';
import { baseBatchCode, num, r3 } from './helpers';
import { loadBatchNames , nameFor } from './batchNames';
import type { DrillDoc } from './drill';
import { loadIndex, ymd } from './tradeStock';
import { loadCostSheets, modelKey } from './costSheets';
import { loadTailorX, recPcsOf, dateOf } from './tailorX';
import { parseModelLabel } from './helpers';
import { loadSizeLedger, loadCutSizes, sizesFor, sortSizes, NO_SIZE, type SizeMap } from './sizeLedger';

export interface AlertCard { key: string; label: string; color: string; count: number; doc: DrillDoc }

const days = (d: any): number => {
  const t = d ? new Date(d).getTime() : NaN;
  return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86400000) : -1;
};

export const SLOW_FABRIC_DAYS = 60;
export const WIP_STUCK_DAYS = 15;
export const LOW_READY_PCS = 10;
export const HIGH_DAMAGE_PCT = 5;
export const LOW_SIZE_PCS = 2;      // a size with this few pieces ...
export const FULL_RUN_PCS = 10;     // ... while the design still has this many in total

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

  // Busy Stock Upload: the latest BCN-wise file is the stock – flag shops whose stock is older than yesterday
  let upload: AlertCard | null = null;
  try {
    const ix = await loadIndex();
    const old = ymd(new Date(Date.now() - 86400000));
    const rows = Object.keys(ix).sort().map(sh => ({ sh, stale: !ix[sh].stockAsOn || ix[sh].stockAsOn! < old, asOn: ix[sh].stockAsOn || '-' })).filter(r => r.stale);
    upload = { key: 'upload', label: 'இன்றைய Busy Stock Upload பாக்கி உள்ள கடைகள்', color: '#0369a1', count: rows.length,
      doc: { title: 'Busy Stock Upload பாக்கி', subtitle: 'தினமும் "BCN wise Stock Status" ஏற்றவும்', headers: ['கடை', 'Stock As On'], rows: rows.map(r => [r.sh, r.asOn]) } };
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

  // tailor: pieces received short, or not received for 7+ days
  let tailorCard: AlertCard | null = null;
  try {
    const [led, tx] = await Promise.all([fetchAll('pommys_tailor_ledger', '*'), loadTailorX()]);
    const rows: (string | number)[][] = [];
    led.forEach((e: any) => {
      const x = tx.rows[String(e.id)];
      if (e.status === 'Received') {
        const sh = num(e.pieces) - recPcsOf(e, x);
        if (sh > 0) rows.push([e.tailor_name, e.batch_code, nameFor(names, e.batch_code) || '-', num(e.pieces), recPcsOf(e, x), `குறைவு ${sh} Pcs`]);
      } else {
        const d = days(dateOf(e, x));
        if (d >= 7) rows.push([e.tailor_name, e.batch_code, nameFor(names, e.batch_code) || '-', num(e.pieces), 0, `${d} நாள் Receive ஆகவில்லை`]);
      }
    });
    tailorCard = { key: 'tailor', label: 'Tailor-ல் குறைவு / 7+ நாள் வராத Pcs', color: '#a21caf', count: rows.length,
      doc: { title: 'Tailor பாக்கி / குறைவு', headers: ['Tailor', 'Batch', 'Local Name', 'Issued', 'Received', 'நிலை'], rows } };
  } catch { tailorCard = null; }

  // Godown: a size is (almost) finished although the design still has stock
  let lowSize: AlertCard | null = null;
  try {
    const [ledger, cutSizes] = await Promise.all([loadSizeLedger().catch(() => ({} as Record<string, SizeMap>)), loadCutSizes().catch(() => ({} as Record<string, SizeMap>))]);
    const bySize = new Map<string, { model: string; design: string; sizes: Record<string, number> }>();
    ready.forEach((r: any) => {
      const tot = Math.floor(num(r.ready_pieces)); if (tot <= 0) return;
      const k = `${r.model_name}|${r.design_no}`.toLowerCase();
      const cur = bySize.get(k) || { model: r.model_name || '-', design: r.design_no || '-', sizes: {} };
      const sz = sizesFor(String(r.batch_code || ''), tot, ledger, cutSizes);
      Object.entries(Object.keys(sz).length ? sz : { [NO_SIZE]: tot }).forEach(([a, q]) => { cur.sizes[a] = (cur.sizes[a] || 0) + q; });
      bySize.set(k, cur);
    });
    const rows: (string | number)[][] = [];
    bySize.forEach(d => {
      const keys = Object.keys(d.sizes).filter(x => x !== NO_SIZE);
      const total = Object.values(d.sizes).reduce((a, b) => a + b, 0);
      if (keys.length < 2 || total < FULL_RUN_PCS) return;
      const short = keys.sort(sortSizes).filter(x => d.sizes[x] <= LOW_SIZE_PCS);
      if (short.length) rows.push([d.model, d.design, short.map(x => `${x}: ${d.sizes[x]}`).join(', '), keys.map(x => `${x}:${d.sizes[x]}`).join('  '), total]);
    });
    lowSize = { key: 'lowsize', label: `Godown-ல் Size முடியப்போகும் Design (≤ ${LOW_SIZE_PCS} Pcs)`, color: '#0e7490', count: rows.length,
      doc: { title: 'Size முடியப்போகிறது', subtitle: `ஒரு Size ${LOW_SIZE_PCS} Pcs-க்கும் குறைவு; Design-ல் மொத்தம் ${FULL_RUN_PCS}+ Pcs`, headers: ['Model', 'Design', 'குறைந்த Size', 'எல்லா Size', 'மொத்தம்'], rows } };
  } catch { lowSize = null; }

  return [
    ...(upload ? [upload] : []),
    ...(lowSize ? [lowSize] : []),
    ...(tailorCard ? [tailorCard] : []),
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
