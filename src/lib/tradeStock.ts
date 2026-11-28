import { readJson, writeJson } from './masterStore';
import { parseDateLoose, parseQty } from './csv';

/**
 * Trading stock + sales kept from Busy reports (no database change – Storage JSON):
 *  trade/index.json                 : every showroom, last stock "as on" date, which sales dates are loaded
 *  trade/stock__<showroom>.json     : { snap }  full stock snapshot (grouped by item/design/size/colour/MRP/price)
 *  trade/sales__<showroom>__<YYYY-MM>.json : { rows }  daily sales
 * Stock report = full picture  -> a new upload REPLACES the old one (never adds twice).
 * Sales report = per showroom + date -> uploading the same date again REPLACES that date.
 * Current stock = snapshot − sales dated after the snapshot "as on" date.
 */
export interface TLine { item: string; design: string; size: string; colour: string; mrp: number; cost: number; qty: number }
export interface StockSnap { showroom: string; asOn: string; uploadedAt: string; total: number; lines: TLine[] }
export interface SaleRow { date: string; item: string; design: string; size: string; colour: string; mrp: number; price: number; qty: number; amount: number; gst: number }
export interface DayInfo { rows: number; qty: number; amount: number; at: string; range?: string }
export interface ShopIndex { stockAsOn?: string; stockAt?: string; stockQty?: number; stockCost?: number; stockMrp?: number; salesDays: Record<string, DayInfo> }
export type TradeIndex = Record<string, ShopIndex>;

const BASE = 'catalog/trade/';
export const slugShop = (s: string) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'shop';
export const N = (s: any) => String(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
const num = (v: any) => { const n = parseQty(String(v ?? '')); return Number.isFinite(n) ? n : 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;

export const lineKey = (x: { item: string; design: string; size: string; colour: string; mrp: number; cost?: number; price?: number }) =>
  [N(x.item), N(x.design), N(x.size), N(x.colour), r2(x.mrp), r2((x.cost ?? x.price) || 0)].join('|');
const looseKey = (x: { item: string; design: string; size: string; colour: string; mrp: number }) => [N(x.item), N(x.design), N(x.size), N(x.colour), r2(x.mrp)].join('|');
const looser = (x: { item: string; design: string; size: string; colour: string }) => [N(x.item), N(x.design), N(x.size), N(x.colour)].join('|');

/** "XL-169" -> XL ; "XXL - 97" -> XXL ; "M (LADIES)" -> M ; "32B" stays */
export function sizeLabel(p2: string): string {
  const s = String(p2 || '').trim().toUpperCase();
  if (!s) return '-';
  const m = s.match(/^(XXS|XS|XXL|XL|[2-6]XL|S|M|L|FREE)(?![A-Z0-9])/);
  if (m) return m[1] === 'FREE' ? 'Free' : m[1];
  return s;
}

// ---------------------------------------------------------------- storage
export async function loadIndex(): Promise<TradeIndex> {
  const raw: any = await readJson<any>(BASE + 'index.json');
  const out: TradeIndex = {};
  Object.entries(raw).forEach(([k, v]: [string, any]) => { if (v && typeof v === 'object') out[k] = { salesDays: {}, ...v }; });
  return out;
}
export async function saveIndex(ix: TradeIndex) { await writeJson(BASE + 'index.json', ix); }

export async function loadSnap(shop: string): Promise<StockSnap | null> {
  const raw: any = await readJson<any>(`${BASE}stock__${slugShop(shop)}.json`);
  return raw && raw.snap && Array.isArray(raw.snap.lines) ? raw.snap as StockSnap : null;
}
export async function saveSnap(snap: StockSnap) { await writeJson(`${BASE}stock__${slugShop(snap.showroom)}.json`, { snap }); }

const monthOf = (d: string) => d.slice(0, 7);
export async function loadSales(shop: string, months: string[]): Promise<SaleRow[]> {
  const out: SaleRow[] = [];
  for (const m of months) {
    const raw: any = await readJson<any>(`${BASE}sales__${slugShop(shop)}__${m}.json`);
    if (Array.isArray(raw.rows)) out.push(...raw.rows);
  }
  return out;
}
export const monthsOf = (ix: ShopIndex | undefined) => Array.from(new Set(Object.keys(ix?.salesDays || {}).map(monthOf))).sort();

/** replaces all rows whose date lies in [from, to] by `rows`, month by month */
export async function saveSalesRange(shop: string, from: string, to: string, rows: SaleRow[]) {
  const months = new Set<string>([monthOf(from), monthOf(to), ...rows.map(r => monthOf(r.date))]);
  for (const m of Array.from(months).sort()) {
    const path = `${BASE}sales__${slugShop(shop)}__${m}.json`;
    const raw: any = await readJson<any>(path);
    const old: SaleRow[] = Array.isArray(raw.rows) ? raw.rows : [];
    const keep = old.filter(r => !(r.date >= from && r.date <= to));
    const add = rows.filter(r => monthOf(r.date) === m);
    await writeJson(path, { rows: [...keep, ...add] });
  }
}
export async function removeSalesRange(shop: string, from: string, to: string) { await saveSalesRange(shop, from, to, []); }

// ---------------------------------------------------------------- parsing
const findHeader = (t: string[][], test: (r: string[]) => boolean) => { for (let i = 0; i < Math.min(t.length, 40); i++) if (test(t[i])) return i; return -1; };
const col = (h: string[], re: RegExp, not?: RegExp) => h.findIndex(c => re.test(c.trim()) && !(not && not.test(c)));
const preamble = (t: string[][], upto: number) => {
  let shop = '', asOn = '', from = '', to = '';
  t.slice(0, upto).forEach(r => r.forEach(c => {
    const s = String(c || '');
    let m = s.match(/(?:branch|mc|showroom|store)\s*:\s*([^;|]+?)\s*$/i);
    if (m && !shop && !/^all\b/i.test(m[1])) shop = m[1].trim();
    m = s.match(/as\s*on\s*:?\s*(\S+)/i);
    if (m && !asOn) asOn = parseDateLoose(m[1]);
    m = s.match(/from\s+(\S+)\s+to\s+(\S+)/i);
    if (m && !from) { from = parseDateLoose(m[1]); to = parseDateLoose(m[2]); }
  }));
  return { shop, asOn, from, to };
};

export interface ParsedStock { showroom: string; asOn: string; lines: TLine[]; qty: number; reportTotal: number | null; skipped: number }
export function parseStockReport(t: string[][]): ParsedStock {
  const hi = findHeader(t, r => r.some(c => /^bcn/i.test(c.trim())) && r.some(c => /^item/i.test(c.trim())));
  if (hi < 0) throw new Error('இது BCN-wise Stock Status Report போல இல்லை (Item Details, BCN column தேவை).');
  const h = t[hi];
  const c = { item: col(h, /^item/i), design: col(h, /design/i), size: col(h, /size/i), colour: col(h, /colou?r/i), mrp: col(h, /^mrp/i), cost: col(h, /sales\s*price|^rate|cost/i), qty: col(h, /^qty\.?$/i), bcn: col(h, /^bcn/i), total: col(h, /^total\s*qty/i) };
  if (c.item < 0 || c.qty < 0) throw new Error('Item / Qty column கிடைக்கவில்லை.');
  const pre = preamble(t, hi);
  const map = new Map<string, TLine>();
  let item = '', qty = 0, skipped = 0, reportTotal: number | null = null;
  t.slice(hi + 1).forEach(r => {
    const first = (r[c.item] || '').trim();
    if (/^total$/i.test((r[1] || '').trim()) || /^(grand\s*)?total$/i.test(first)) { const q = num(r[c.qty]); if (q) reportTotal = q; return; }
    if (first) item = first;
    const bcn = c.bcn >= 0 ? (r[c.bcn] || '').trim() : '';
    const design = c.design >= 0 ? (r[c.design] || '').trim() : '';
    if (!item || (!bcn && !design && !num(r[c.qty]))) { if (bcn || design) skipped++; return; }
    const q = r[c.qty] !== undefined && String(r[c.qty]).trim() !== '' ? num(r[c.qty]) : 1;
    if (!q) return;
    const line: TLine = { item: item.replace(/\s+/g, ' '), design, size: c.size >= 0 ? (r[c.size] || '').trim() : '', colour: c.colour >= 0 ? (r[c.colour] || '').trim() : '', mrp: num(r[c.mrp]), cost: num(r[c.cost]), qty: 0 };
    const k = lineKey(line);
    const cur = map.get(k) || line;
    cur.qty += q; qty += q; map.set(k, cur);
  });
  return { showroom: pre.shop, asOn: pre.asOn, lines: Array.from(map.values()), qty, reportTotal, skipped };
}

export interface ParsedSales { showroom: string; from: string; to: string; hasDateCol: boolean; rows: SaleRow[]; qty: number; amount: number; reportQty: number | null; reportAmount: number | null }
export function parseSalesReport(t: string[][]): ParsedSales {
  const hi = findHeader(t, r => r.some(c => /^item/i.test(c.trim())) && r.some(c => /nett?\s*sale\s*qty|net\s*qty/i.test(c)));
  if (hi < 0) throw new Error('இது Sales Analysis Report போல இல்லை (Item Details, Nett Sale Qty column தேவை).');
  const h = t[hi];
  const c = { item: col(h, /^item/i), design: col(h, /design/i), size: col(h, /size/i), colour: col(h, /colou?r/i), mrp: col(h, /^mrp/i), price: col(h, /sales\s*price/i), qty: col(h, /nett?\s*sale\s*qty|net\s*qty/i), amt: col(h, /nett?\s*sale\s*amt|net\s*amount/i), gst: col(h, /gst/i), date: col(h, /^date$/i) };
  const pre = preamble(t, hi);
  const rows: SaleRow[] = [];
  let reportQty: number | null = null, reportAmount: number | null = null, qty = 0, amount = 0;
  t.slice(hi + 1).forEach(r => {
    const item = (r[c.item] || '').trim();
    if (/^(grand\s*)?total$/i.test(item) || (!item && /^total$/i.test((r[c.item + 4] || r[c.price] || '').trim()))) { reportQty = num(r[c.qty]); reportAmount = c.amt >= 0 ? num(r[c.amt]) : null; return; }
    if (/total/i.test(r.join(' ')) && !item) { reportQty = num(r[c.qty]); reportAmount = c.amt >= 0 ? num(r[c.amt]) : null; return; }
    if (!item) return;
    const q = num(r[c.qty]);
    if (!q) return;
    const date = (c.date >= 0 ? parseDateLoose(r[c.date] || '') : '') || pre.to;
    const row: SaleRow = { date, item: item.replace(/\s+/g, ' '), design: c.design >= 0 ? (r[c.design] || '').trim() : '', size: c.size >= 0 ? (r[c.size] || '').trim() : '', colour: c.colour >= 0 ? (r[c.colour] || '').trim() : '', mrp: num(r[c.mrp]), price: num(r[c.price]), qty: q, amount: c.amt >= 0 ? num(r[c.amt]) : 0, gst: c.gst >= 0 ? num(r[c.gst]) : 0 };
    rows.push(row); qty += q; amount += row.amount;
  });
  return { showroom: pre.shop, from: pre.from || pre.to, to: pre.to || pre.from, hasDateCol: c.date >= 0, rows, qty, amount: r2(amount), reportQty, reportAmount };
}

// ---------------------------------------------------------------- current stock
export interface CurLine extends TLine { sold: number }
/** snapshot − sales after the snapshot date. Sales that match nothing in the snapshot are returned separately. */
export function currentStock(snap: StockSnap, sales: SaleRow[]): { lines: CurLine[]; unmatched: SaleRow[] } {
  const lines: CurLine[] = snap.lines.map(l => ({ ...l, sold: 0 }));
  const exact = new Map<string, CurLine>(), loose = new Map<string, CurLine[]>(), looser2 = new Map<string, CurLine[]>();
  lines.forEach(l => {
    exact.set(lineKey(l), l);
    const a = looseKey(l); loose.set(a, [...(loose.get(a) || []), l]);
    const b = looser(l); looser2.set(b, [...(looser2.get(b) || []), l]);
  });
  const unmatched: SaleRow[] = [];
  sales.filter(s => s.date > snap.asOn).forEach(s => {
    const target = exact.get(lineKey({ ...s, cost: s.price })) || (loose.get(looseKey(s)) || [])[0] || (looser2.get(looser(s)) || [])[0];
    if (target) { target.qty -= s.qty; target.sold += s.qty; } else unmatched.push(s);
  });
  return { lines, unmatched };
}

export const totals = (ls: TLine[]) => ls.reduce((a, l) => ({ qty: a.qty + l.qty, cost: a.cost + l.qty * l.cost, mrp: a.mrp + l.qty * l.mrp }), { qty: 0, cost: 0, mrp: 0 });

// ---------------------------------------------------------------- dates
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const a = new Date(from + 'T00:00:00'), b = new Date(to + 'T00:00:00');
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return out;
  for (let d = a; d <= b && out.length < 400; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) out.push(ymd(d));
  return out;
}
/** dates in the last `days` days (yesterday backwards) that have no sales upload for this showroom */
export function missingDates(ix: ShopIndex | undefined, days = 7): string[] {
  if (!ix) return [];
  const today = new Date();
  const to = ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
  const from = ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - days));
  return datesBetween(from, to).filter(d => !ix.salesDays[d]);
}
