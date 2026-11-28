import { readJson, writeJson, loadDesignMaster, designLookup, rateFor, type DesignInfo } from './masterStore';
import { fetchAll } from './supabase';
import { loadIndex, loadSnap, loadSales, monthsOf, currentStock, unitCost, N, sizeLabel, type TradeIndex } from './tradeStock';
import { loadCostSheets } from './costSheets';
import { loadClothPerPc, makeValuer, type Valuer } from './valuation';
import { sizeOfRow, num } from './helpers';

/**
 * Showroom stock = Busy snapshot (minus Busy sales after the "as on" date)
 *                + ERP transfers made AFTER that date (or ticked "not in Busy yet").
 * Transfers dated on / before the Busy date are already inside the Busy file, so they are never added twice.
 * Cost of a Busy piece: Sales Price −20 %, else MRP × 50 %. ERP pieces: Cost Sheet … (same rules as Master Reports).
 */
export interface SLine { source: 'Busy' | 'ERP'; item: string; design: string; size: string; colour: string; mrp: number; price: number; qty: number; unit: number; basis: string; missing: boolean }
export interface ShopBuilt { shop: string; erp: string; asOn: string; lines: SLine[]; unmatchedSales: number; extra: number }
export interface Sum { pcs: number; cost: number; mrp: number; noCost: number }
export interface ShopMapFile { map: Record<string, string>; force: Record<string, boolean> }

const MAP_PATH = 'catalog/trade/shopmap.json';

export async function loadShopMap(): Promise<ShopMapFile> {
  const raw = (await readJson<any>(MAP_PATH)) as any;
  return { map: raw.map && typeof raw.map === 'object' ? raw.map : {}, force: raw.force && typeof raw.force === 'object' ? raw.force : {} };
}
export async function saveShopMap(m: ShopMapFile): Promise<void> { await writeJson(MAP_PATH, m); }

const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** ERP showroom that belongs to a Busy shop: the saved mapping, else the same name */
export function erpNameFor(shop: string, map: Record<string, string>, erpNames: string[]): string {
  if (map[shop] !== undefined) return map[shop];
  return erpNames.find(n => norm(n) === norm(shop)) || '';
}

export interface Ctx { ix: TradeIndex; designs: Record<string, DesignInfo>; valuer: Valuer; transfers: any[]; sm: ShopMapFile; erpNames: string[] }

export async function loadCtx(): Promise<Ctx> {
  const [ix, designs, sheets, clothPc, transfers, sm, showrooms] = await Promise.all([
    loadIndex(), loadDesignMaster(), loadCostSheets(), loadClothPerPc().catch(() => ({} as Record<string, number>)),
    fetchAll('pommys_showroom_transfers', '*'), loadShopMap(), fetchAll('pommys_showrooms', '*').catch(() => [] as any[])
  ]);
  const erpNames = Array.from(new Set([...(showrooms as any[]).map(s => String(s.showroom_name || '').trim()), ...(transfers as any[]).map(t => String(t.showroom_name || '').trim())].filter(Boolean))).sort();
  return { ix, designs, valuer: makeValuer(sheets, clothPc, designs), transfers, sm, erpNames };
}

/** ERP rows -> priced lines. sign: rows with a negative qty (sale / return) reduce the value */
function erpLines(rows: any[], c: Ctx): SLine[] {
  const lookup = designLookup(c.designs);
  const map = new Map<string, SLine>();
  rows.forEach(t => {
    const q = num(t.transferred_pieces); if (!q) return;
    const model = String(t.model_name || '-').trim() || '-', design = String(t.design_no || '-').trim() || '-', colour = String(t.color || '-').trim() || '-', size = sizeOfRow(t);
    const v = c.valuer(model, design, { [size]: Math.abs(q) }, 'Ready', String(t.batch_code || ''));
    const sign = q < 0 ? -1 : 1;
    const info = rateFor(lookup(model, design), size);
    const k = [model, design, colour, size].map(x => x.toLowerCase()).join('|');
    const cur = map.get(k) || { source: 'ERP' as const, item: model, design, size, colour, mrp: info.mrp, price: info.price, qty: 0, unit: 0, basis: v.basis, missing: false, _val: 0, _miss: 0 } as any;
    cur.qty += q; cur._val += sign * v.value; cur._miss += sign * v.missing;
    if (v.basis !== '-') cur.basis = v.basis;
    map.set(k, cur);
  });
  return Array.from(map.values()).filter((l: any) => l.qty > 0).map((l: any) => {
    const left = l.qty;
    return { source: 'ERP', item: l.item, design: l.design, size: l.size, colour: l.colour, mrp: l.mrp, price: l.price, qty: left, unit: l._miss > 0 && l._val <= 0 ? 0 : l._val / left, basis: l._miss > 0 ? (l._val > 0 ? l.basis + ' + ⚠️' : '⚠️ Costing இல்லை') : l.basis, missing: l._miss > 0 };
  });
}

export async function buildShop(shop: string, c: Ctx): Promise<ShopBuilt | null> {
  const snap = await loadSnap(shop);
  if (!snap) return null;
  const sales = await loadSales(shop, monthsOf(c.ix[shop]));
  const cs = currentStock(snap, sales);
  const busy: SLine[] = cs.lines.filter(l => l.qty !== 0).map(l => {
    const u = unitCost(l);
    return { source: 'Busy', item: l.item, design: l.design, size: sizeLabel(l.size), colour: l.colour, mrp: l.mrp, price: l.cost, qty: l.qty, unit: u.cost, basis: u.basis, missing: u.basis === '-' };
  });
  const erp = erpNameFor(shop, c.sm.map, c.erpNames);
  let extra = 0, lines = busy;
  if (erp) {
    const rows = c.transfers.filter(t => String(t.showroom_name || '').trim() === erp && num(t.transferred_pieces) > 0 && (String(t.transfer_date || '').slice(0, 10) > snap.asOn || c.sm.force[String(t.id)]));
    const el = erpLines(rows, c);
    extra = el.reduce((a, l) => a + l.qty, 0);
    lines = [...busy, ...el];
  }
  return { shop, erp, asOn: snap.asOn, lines, unmatchedSales: cs.unmatched.length, extra };
}

/** ERP showrooms that have no Busy shop: all their transfers / sales net */
export function buildErpOnly(name: string, c: Ctx): SLine[] {
  return erpLines(c.transfers.filter(t => String(t.showroom_name || '').trim() === name), c);
}

export const sumLines = (ls: SLine[]): Sum => ls.reduce((a, l) => ({ pcs: a.pcs + l.qty, cost: a.cost + l.qty * l.unit, mrp: a.mrp + l.qty * l.mrp, noCost: a.noCost + (l.missing ? l.qty : 0) }), { pcs: 0, cost: 0, mrp: 0, noCost: 0 });

/** every showroom: Busy shops (with ERP additions) + ERP-only showrooms */
export async function loadAllShowrooms(c: Ctx): Promise<{ built: ShopBuilt[]; erpOnly: { name: string; lines: SLine[] }[] }> {
  const shops = Object.keys(c.ix).sort();
  const built: ShopBuilt[] = [];
  for (const s of shops) { const b = await buildShop(s, c); if (b) built.push(b); }
  const used = new Set(built.map(b => b.erp).filter(Boolean));
  const erpOnly = c.erpNames.filter(n => !used.has(n)).map(n => ({ name: n, lines: buildErpOnly(n, c) })).filter(x => x.lines.length > 0);
  return { built, erpOnly };
}

export { N };
