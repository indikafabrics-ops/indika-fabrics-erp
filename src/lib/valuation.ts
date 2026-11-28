import { fetchAll } from './supabase';
import { num } from './helpers';
import { designLookup, rateFor, type DesignInfo } from './masterStore';
import { costAt, sheetFor, type CostSheet, type ValueStage } from './costSheets';
import { baseOf, sumSizes, type SizeMap } from './sizeLedger';

/** When no Cost Sheet exists: Selling price minus this % is taken as the cost */
export const FALLBACK_DISCOUNT = 20;

export const isOpening = (code?: string) => /^OPN/i.test(String(code || ''));

export interface Val { value: number; missing: number; basis: string }

/** Cutting batch -> cloth amount per cut piece (issued meters x fabric rate, GST excluded) */
export async function loadClothPerPc(): Promise<Record<string, number>> {
  const [batches, fabric] = await Promise.all([
    fetchAll('pommys_cutting_batches', 'batch_code,selected_fabrics_json,total_pieces', undefined, 'batch_code'),
    fetchAll('pommys_fabric_stock', 'id,rate_per_meter')
  ]);
  const rate = new Map<string, number>();
  fabric.forEach((f: any) => rate.set(String(f.id), num(f.rate_per_meter)));
  const out: Record<string, number> = {};
  batches.forEach((b: any) => {
    const pcs = num(b.total_pieces);
    if (!(pcs > 0)) return;
    let list: any[] = [];
    try { list = typeof b.selected_fabrics_json === 'string' ? JSON.parse(b.selected_fabrics_json) : (b.selected_fabrics_json || []); } catch { list = []; }
    const amt = (Array.isArray(list) ? list : []).reduce((a, f) => a + num(f.issueMeters) * (rate.get(String(f.stockId)) || 0), 0);
    if (amt > 0) out[String(b.batch_code)] = amt / pcs;
  });
  return out;
}

/**
 * Value of a quantity, by priority:
 *  1) Cost Sheet of the model (stage-wise cost)
 *  2) Production stages: cloth amount actually issued in Cutting (per piece)
 *  3) Selling price - 20 %  (OPENING stock only, batch code OPN-…)
 *  otherwise: counted as "missing" (never ₹0 in the total silently)
 */
export function makeValuer(sheets: Record<string, CostSheet>, clothPc: Record<string, number>, designs: Record<string, DesignInfo>) {
  const lookup = designLookup(designs);
  const priceOf = (model: string, design: string, size: string): number => {
    const direct = rateFor(lookup(model, design), size).price;
    if (direct > 0 || (design && design !== '-')) return direct;
    // opening stock without a design: average selling price of that model
    const ms = Object.values(designs).filter(d => String(d.model || '').toUpperCase() === String(model).toUpperCase());
    const ps = ms.map(d => rateFor(d, size).price).filter(p => p > 0);
    return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 0;
  };
  return (model: string, design: string, bySize: SizeMap, stage: ValueStage, batchCode?: string): Val => {
    const pcs = sumSizes(bySize);
    if (!(pcs > 0)) return { value: 0, missing: 0, basis: '-' };
    const c = costAt(sheetFor(sheets, model), stage);
    if (c !== undefined) return { value: c * pcs, missing: 0, basis: 'Costing' };
    if (stage !== 'Cloth' && batchCode) {
      const cp = clothPc[batchCode] ?? clothPc[baseOf(batchCode)];
      if (cp > 0) return { value: cp * pcs, missing: 0, basis: 'Cutting Cloth' };
    }
    // Selling price - 20 % is ONLY for opening stock; new items need a Cost Sheet (or have Cutting cloth)
    if (!isOpening(batchCode)) return { value: 0, missing: pcs, basis: '-' };
    let value = 0, missing = 0;
    Object.entries(bySize).forEach(([sz, q]) => {
      const p = priceOf(model, design, sz);
      if (p > 0) value += p * (1 - FALLBACK_DISCOUNT / 100) * q; else missing += q;
    });
    return { value, missing, basis: missing < pcs ? `Selling −${FALLBACK_DISCOUNT}%` : '-' };
  };
}
export type Valuer = ReturnType<typeof makeValuer>;
