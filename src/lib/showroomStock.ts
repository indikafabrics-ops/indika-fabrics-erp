import { readJson, writeJson, loadDesignMaster, designLookup, rateFor, type DesignInfo } from './masterStore';
import { fetchAll } from './supabase';
import { loadIndex, loadSnap, loadSales, monthsOf, currentStock, unitCost, lineKey, N, sizeLabel, type TradeIndex } from './tradeStock';
import { loadAdj, adjKeyOfErp, type AdjFile, type AdjAdded } from './showroomAdj';
import { loadCostSheets } from './costSheets';
import { loadClothPerPc, makeValuer, type Valuer } from './valuation';
import { sizeOfRow, num, loadStockSnapshot, type StockSnapshot } from './helpers';

/**
 * Showroom stock = Busy snapshot (minus Busy sales after the "as on" date)
 *                + ERP transfers made AFTER that date (or ticked "not in Busy yet").
 * Transfers dated on / before the Busy date are already inside the Busy file, so they are never added twice.
 * Cost of a Busy piece: Sales Price −20 %, else MRP × 50 %. ERP pieces: Cost Sheet … (same rules as Master Reports).
 */
export interface SLine { source: 'Busy' | 'ERP' | 'Manual'; key: string; item: string; design: string; size: string; colour: string; mrp: number; price: number; qty: number; unit: number; basis: string; missing: boolean; sold?: number; edited?: boolean; date?: string; note?: string }
export interface ShopBuilt {
  shop: string; erp: string; asOn: string; lines: SLine[]; unmatchedSales: number; extra: number;
  /** key of the hand-correction file (Busy shop name, or "erp-<name>") */
  adjKey: string; adj: AdjFile; erpOnly?: boolean;
  /** hand-typed lines dated on / before the Busy date (probably already in Busy) – not counted until ticked */
  notCounted: AdjAdded[];
  /** edited-qty lines that belong to an older Busy upload (not applied) */
  staleQty: string[];
  /** edits / deletions whose Busy line no longer exists */
  orphans: string[];
}
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
    const cur = map.get(k) || { source: 'ERP' as const, key: 'erp|' + k, item: model, design, size, colour, mrp: info.mrp, price: info.price, qty: 0, unit: 0, basis: v.basis, missing: false, _val: 0, _miss: 0 } as any;
    cur.qty += q; cur._val += sign * v.value; cur._miss += sign * v.missing;
    if (v.basis !== '-') cur.basis = v.basis;
    map.set(k, cur);
  });
  return Array.from(map.values()).filter((l: any) => l.qty > 0).map((l: any) => {
    const left = l.qty;
    return { source: 'ERP', key: l.key, item: l.item, design: l.design, size: l.size, colour: l.colour, mrp: l.mrp, price: l.price, qty: left, unit: l._miss > 0 && l._val <= 0 ? 0 : l._val / left, basis: l._miss > 0 ? (l._val > 0 ? l.basis + ' + ⚠️' : '⚠️ Costing இல்லை') : l.basis, missing: l._miss > 0 };
  });
}

const manualLine = (r: AdjAdded): SLine => {
  const u = unitCost({ cost: r.price, mrp: r.mrp });
  return { source: 'Manual', key: r.id, item: r.item, design: r.design, size: sizeLabel(r.size), colour: r.colour, mrp: r.mrp, price: r.price, qty: r.qty, unit: u.cost, basis: u.basis, missing: u.basis === '-', date: r.date, note: r.note };
};

export async function buildShop(shop: string, c: Ctx): Promise<ShopBuilt | null> {
  const snap = await loadSnap(shop);
  if (!snap) return null;
  const [sales, adj] = await Promise.all([loadSales(shop, monthsOf(c.ix[shop])), loadAdj(shop)]);
  const cs = currentStock(snap, sales);
  const seen = new Set<string>(), staleQty: string[] = [];
  const busy: SLine[] = [];
  cs.lines.forEach(l => {
    const k = lineKey(l); seen.add(k);
    if (adj.deleted[k]) return;
    const e = adj.edits[k];
    let qty = l.qty;
    if (e && e.qty !== undefined) { if (e.qAsOn === snap.asOn) qty = e.qty - l.sold; else staleQty.push(k); }
    if (qty === 0) return;
    const mrp = e?.mrp ?? l.mrp, price = e?.price ?? l.cost;
    const u = unitCost({ cost: price, mrp });
    busy.push({ source: 'Busy', key: k, sold: l.sold, edited: !!e, item: e?.item ?? l.item, design: e?.design ?? l.design, size: sizeLabel(e?.size ?? l.size), colour: e?.colour ?? l.colour, mrp, price, qty, unit: u.cost, basis: u.basis + (e ? ' ✎' : ''), missing: u.basis === '-' });
  });
  const orphans = [...Object.keys(adj.edits), ...Object.keys(adj.deleted)].filter(k => !seen.has(k));
  const counted = adj.added.filter(r => r.date > snap.asOn || r.force);
  const notCounted = adj.added.filter(r => !(r.date > snap.asOn || r.force));
  const erp = erpNameFor(shop, c.sm.map, c.erpNames);
  let extra = 0, lines = [...busy, ...counted.map(manualLine)];
  if (erp) {
    const rows = c.transfers.filter(t => String(t.showroom_name || '').trim() === erp && num(t.transferred_pieces) > 0 && (String(t.transfer_date || '').slice(0, 10) > snap.asOn || c.sm.force[String(t.id)]));
    const el = erpLines(rows, c);
    extra = el.reduce((a, l) => a + l.qty, 0);
    lines = [...lines, ...el];
  }
  return { shop, erp, asOn: snap.asOn, lines, unmatchedSales: cs.unmatched.length, extra, adjKey: shop, adj, notCounted, staleQty, orphans };
}

/** ERP showroom that has no Busy shop: all its transfers / sales net (+ hand-typed lines) */
export async function buildErpOnly(name: string, c: Ctx): Promise<ShopBuilt> {
  const adjKey = adjKeyOfErp(name);
  const adj = await loadAdj(adjKey);
  const lines = [...erpLines(c.transfers.filter(t => String(t.showroom_name || '').trim() === name), c), ...adj.added.map(manualLine)];
  return { shop: name, erp: name, asOn: '', lines, unmatchedSales: 0, extra: 0, adjKey, adj, erpOnly: true, notCounted: [], staleQty: [], orphans: [] };
}

export const sumLines = (ls: SLine[]): Sum => ls.reduce((a, l) => ({ pcs: a.pcs + l.qty, cost: a.cost + l.qty * l.unit, mrp: a.mrp + l.qty * l.mrp, noCost: a.noCost + (l.missing ? l.qty : 0) }), { pcs: 0, cost: 0, mrp: 0, noCost: 0 });

/** every showroom: Busy shops (with ERP additions) + the other ERP showrooms (ERP-only) */
export async function loadAllShowrooms(c: Ctx): Promise<ShopBuilt[]> {
  const shops = Object.keys(c.ix).sort();
  const built: ShopBuilt[] = [];
  for (const s of shops) { const b = await buildShop(s, c); if (b) built.push(b); }
  const used = new Set(built.map(b => b.erp).filter(Boolean));
  for (const n of c.erpNames.filter(n => !used.has(n))) built.push(await buildErpOnly(n, c));
  return built;
}

export interface ShowTotals extends Sum { byShop: { shop: string; pcs: number; cost: number; mrp: number }[] }
export const totalsOf = (built: ShopBuilt[]): ShowTotals => {
  const all = sumLines(built.flatMap(b => b.lines));
  return { ...all, byShop: built.map(b => { const t = sumLines(b.lines); return { shop: b.shop, pcs: t.pcs, cost: t.cost, mrp: t.mrp }; }) };
};

/** Dashboard / Reports headline numbers with the unified (Busy + ERP + hand-typed) showroom count */
export async function loadStockSnapshotFull(): Promise<StockSnapshot> {
  const snap = await loadStockSnapshot();
  try {
    const built = await loadAllShowrooms(await loadCtx());
    return { ...snap, showroomPieces: totalsOf(built).pcs };
  } catch { return snap; }
}

export { N };
