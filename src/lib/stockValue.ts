import { fetchAll } from './supabase';
import { num, parseModelLabel } from './helpers';
import { loadDesignMaster } from './masterStore';
import { loadCostSheets, type ValueStage } from './costSheets';
import { loadClothPerPc, makeValuer } from './valuation';
import { loadSizeLedger, loadCutSizes, sizesFor, type SizeMap } from './sizeLedger';
import { loadBatchMeta } from './batchMeta';
import { loadCtx, loadAllShowrooms, sumLines } from './showroomStock';
import { WIP_STAGES } from './constants';

export interface StockValRow { label: string; qty: string; cost: number; noCost: number }

/** Cost value of everything in stock (Cloth → Cut parts → WIP stages → Godown → Showrooms) – same rules as Master Reports */
export async function loadStockValue(): Promise<StockValRow[]> {
  const [fabric, wip, ready, designs, sheets, clothPc, ledger, cutSizes] = await Promise.all([
    fetchAll('pommys_fabric_stock', '*', q => q.gt('available_meters', 0.01)),
    fetchAll('pommys_production_wip', '*', q => q.neq('current_status', 'Ready Stock')),
    fetchAll('pommys_ready_stock', '*', q => q.gt('ready_pieces', 0)),
    loadDesignMaster(), loadCostSheets(), loadClothPerPc().catch(() => ({} as Record<string, number>)),
    loadSizeLedger().catch(() => ({} as Record<string, SizeMap>)), loadCutSizes().catch(() => ({} as Record<string, SizeMap>))
  ]);
  const meta = await loadBatchMeta(wip.map((w: any) => ({ batch_code: w.batch_code, model_name: w.model_name })));
  const valuer = makeValuer(sheets, clothPc, designs);
  const rows: StockValRow[] = [];
  rows.push({ label: '🧵 Cloth (Fabric Godown)', qty: Math.round(fabric.reduce((a: number, f: any) => a + num(f.available_meters), 0) * 100) / 100 + ' M', cost: fabric.reduce((a: number, f: any) => a + num(f.available_meters) * num(f.rate_per_meter), 0), noCost: fabric.filter((f: any) => !(num(f.rate_per_meter) > 0)).reduce((a: number, f: any) => a + num(f.available_meters), 0) });
  WIP_STAGES.forEach(st => {
    let cost = 0, pcs = 0, noCost = 0;
    wip.filter((w: any) => w.current_status === st).forEach((w: any) => {
      const model = meta[w.batch_code]?.model || parseModelLabel(String(w.model_name || '')).model;
      const design = meta[w.batch_code]?.design || '-';
      const q = Math.floor(num(w.total_pieces)); pcs += q;
      const by = sizesFor(w.batch_code, q, ledger, cutSizes);
      const v = valuer(model, design, Object.keys(by).length ? by : { '—': q }, st as ValueStage, w.batch_code);
      cost += v.value; noCost += v.missing;
    });
    rows.push({ label: (st === 'Cutting' ? '✂️ Cut Parts — ' : '🏭 ') + st, qty: pcs + ' Pcs', cost, noCost });
  });
  let gc = 0, gp = 0, gn = 0;
  ready.forEach((r: any) => {
    const q = Math.floor(num(r.ready_pieces)); gp += q;
    const by = sizesFor(String(r.batch_code || ''), q, ledger, cutSizes);
    const v = valuer(String(r.model_name || '-'), String(r.design_no || '-'), Object.keys(by).length ? by : { '—': q }, 'Ready', String(r.batch_code || ''));
    gc += v.value; gn += v.missing;
  });
  rows.push({ label: '👕 Godown Ready Goods', qty: gp + ' Pcs', cost: gc, noCost: gn });
  try {
    const c = await loadCtx();
    const { built, erpOnly } = await loadAllShowrooms(c);
    const all = sumLines([...built.flatMap(b => b.lines), ...erpOnly.flatMap(e => e.lines)]);
    rows.push({ label: '🏬 Showrooms (Busy + ERP)', qty: all.pcs + ' Pcs', cost: all.cost, noCost: all.noCost });
  } catch { rows.push({ label: '🏬 Showrooms (Busy + ERP)', qty: '-', cost: 0, noCost: 0 }); }
  return rows;
}
