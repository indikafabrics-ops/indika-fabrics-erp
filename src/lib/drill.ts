import { fetchAll } from './supabase';
import { mergeExceptionRows, money, num, r3 } from './helpers';
import { loadCtx, loadAllShowrooms } from './showroomStock';
import { loadBatchMeta } from './batchMeta';
import { loadBatchNames , nameFor } from './batchNames';
import { loadDesignMaster, designLookup } from './masterStore';
import { loadSizeLedger, loadCutSizes, sizesFor, fmtSizes } from './sizeLedger';
import type { Cell } from './share';

export type DrillKind = 'fabric' | 'wip' | 'godown' | 'showroom' | 'endbit' | 'damage';
export interface DrillDoc { title: string; subtitle?: string; headers: string[]; rows: Cell[][]; footer?: string[]; summary?: string }

const age = (d: any): string => {
  if (!d) return '-';
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? `${Math.max(0, Math.floor((Date.now() - t) / 86400000))} நாள்` : '-';
};

/** loads the detail rows behind a dashboard / report number */
export async function loadDrill(kind: DrillKind): Promise<DrillDoc> {
  if (kind === 'fabric') {
    const [stock, bills] = await Promise.all([
      fetchAll('pommys_fabric_stock', '*', q => q.gt('available_meters', 0.01)),
      fetchAll('pommys_grn_bills', 'id,supplier_name,bill_no')
    ]);
    const bm = new Map(bills.map((b: any) => [String(b.id), b]));
    const rows: Cell[][] = stock.map((s: any) => {
      const b: any = bm.get(String(s.bill_id));
      const m = num(s.available_meters);
      return [s.item_name || '-', s.design_no || '-', s.color || '-', b?.supplier_name || '-', b?.bill_no || '-', r3(m), `₹${s.rate_per_meter || 0}`, money(m * num(s.rate_per_meter)), age(s.created_at)];
    });
    const tot = stock.reduce((a: number, s: any) => a + num(s.available_meters), 0);
    const val = stock.reduce((a: number, s: any) => a + num(s.available_meters) * num(s.rate_per_meter), 0);
    return { title: 'Fabric Godown (Meters)', headers: ['Item', 'Design', 'Color', 'Supplier', 'Bill No', 'Meters', 'Rate', 'Value ₹', 'Age'], rows, footer: [`மொத்தம்: ${r3(tot)} M | மதிப்பு: ₹ ${money(val)}`], summary: `மொத்த Fabric: ${r3(tot)} M (₹ ${money(val)})` };
  }
  if (kind === 'wip') {
    const wip = await fetchAll('pommys_production_wip', '*', q => q.neq('current_status', 'Ready Stock'));
    const [meta, names, ledger, cut] = await Promise.all([loadBatchMeta(wip), loadBatchNames().catch(() => ({} as Record<string, string>)), loadSizeLedger().catch(() => ({})), loadCutSizes().catch(() => ({}))]);
    const rows: Cell[][] = wip.map((w: any) => {
      const m = meta[w.batch_code];
      const sz = m?.size ? `${m.size}:${num(w.total_pieces)}` : fmtSizes(sizesFor(w.batch_code, Math.floor(num(w.total_pieces)), ledger, cut)).replace('—:', '');
      return [w.batch_code, nameFor(names, w.batch_code) || '-', w.current_status, m?.model || w.model_name || '-', m?.design || '-', sz || '-', m?.color || '-', num(w.total_pieces), age(w.updated_at || w.created_at)];
    });
    rows.sort((a, b) => String(a[2]).localeCompare(String(b[2])) || String(a[3]).localeCompare(String(b[3])) || String(a[0]).localeCompare(String(b[0])));
    const tot = wip.reduce((a: number, w: any) => a + num(w.total_pieces), 0);
    const stages: Record<string, number> = {};
    wip.forEach((w: any) => { stages[w.current_status] = (stages[w.current_status] || 0) + num(w.total_pieces); });
    return { title: 'Production WIP (Pcs)', headers: ['Batch Code', 'Local Name', 'Stage', 'Model', 'Design', 'Size', 'Color', 'Pcs', 'Age'], rows, footer: [`மொத்தம்: ${tot} Pcs • ${wip.length} Batch`, Object.entries(stages).map(([k, v]) => `${k}: ${v}`).join(' • ')], summary: `WIP மொத்தம் ${tot} Pcs (${wip.length} Batch) — ${Object.entries(stages).map(([k, v]) => `${k} ${v}`).join(', ')}` };
  }
  if (kind === 'godown') {
    const ready = (await fetchAll('pommys_ready_stock', '*')).filter((r: any) => num(r.ready_pieces) > 0);
    const [meta, names, dm] = await Promise.all([loadBatchMeta(ready), loadBatchNames().catch(() => ({} as Record<string, string>)), loadDesignMaster().then(designLookup).catch(() => (() => undefined) as any)]);
    const rows: Cell[][] = ready.map((r: any) => {
      const m = meta[r.batch_code];
      const design = r.design_no && r.design_no !== '-' ? r.design_no : m?.design || '-';
      const i = dm(r.model_name, design);
      return [r.batch_code, nameFor(names, r.batch_code) || '-', design, r.model_name || '-', i?.material || '-', i?.fit || '-', i?.sizes || '-', r.color && r.color !== '-' ? r.color : m?.color || '-', i?.price ? `₹${i.price}` : '-', num(r.ready_pieces)];
    });
    const tot = ready.reduce((a: number, r: any) => a + num(r.ready_pieces), 0);
    return { title: 'Godown Ready Stock (Pcs)', headers: ['Batch Code', 'Local Name', 'Design No', 'Model', 'Material', 'Fit', 'Size', 'Color', 'Price', 'Pcs'], rows, footer: [`மொத்தம்: ${tot} Pcs`], summary: `Godown Ready: ${tot} Pcs` };
  }
  if (kind === 'showroom') {
    const built = await loadAllShowrooms(await loadCtx());
    const lines = built.flatMap(b => b.lines.filter(l => l.qty !== 0).map(l => ({ shop: b.shop, ...l })));
    const rows: Cell[][] = lines.map(l => [l.shop, l.source === 'Manual' ? 'கை' : l.source, l.item, l.design, l.size, l.colour, l.qty]);
    const tot = lines.reduce((a, l) => a + l.qty, 0);
    const byShop: Record<string, number> = {};
    lines.forEach(l => { byShop[l.shop] = (byShop[l.shop] || 0) + l.qty; });
    return { title: 'Showroom Stock (Pcs) — Busy + ERP', headers: ['Showroom', 'Source', 'Item / Model', 'Design', 'Size', 'Color', 'Pcs'], rows, footer: [`மொத்தம்: ${tot} Pcs`, ...Object.entries(byShop).map(([k, v]) => `${k}: ${v} Pcs`)], summary: `Showroom மொத்தம் ${tot} Pcs` };
  }
  const [ex, cut] = await Promise.all([
    fetchAll('pommys_exceptions_stock', '*'),
    fetchAll('pommys_cutting_batches', 'batch_code,product_model,end_bit_meters', q => q.gt('end_bit_meters', 0), 'batch_code')
  ]);
  const all = mergeExceptionRows(ex, cut);
  const isDmg = kind === 'damage';
  const pick = all.filter(e => (isDmg ? e.stock_type === 'DAMAGE' : e.stock_type === 'END_BIT') && num(e.qty) !== 0);
  const rows: Cell[][] = pick.map(e => [e.ref_code || '-', e.model_or_item || '-', e.color || '-', `${r3(num(e.qty))} ${e.unit || ''}`.trim(), e.remarks || '-']);
  const tot = pick.reduce((a, e) => a + num(e.qty), 0);
  return { title: isDmg ? 'Damage / Seconds' : 'End Bits (Meters)', headers: ['Ref / Batch', 'Item / Model', 'Color', 'Qty', 'Remarks'], rows, footer: [`மொத்தம்: ${r3(tot)}`], summary: `${isDmg ? 'Damage' : 'End Bits'} மொத்தம் ${r3(tot)}` };
}
