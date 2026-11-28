import { readJson, writeJson } from './masterStore';

/**
 * Admin-only "Net Position" sheet kept in Storage (assets/catalog/networth.json) – no database change.
 * draft = what is on the screen now (also for "what-if" trials), snaps = saved dated snapshots.
 */
export interface Entry { name: string; amount: string }
export interface Sheet { sd: Entry[]; sc: Entry[]; fixed: Entry[]; loans: Entry[]; bank: Entry[]; cash: string; otherA: Entry[]; otherL: Entry[] }
export interface Snap { id: string; date: string; note: string; ts: string; sheet: Sheet; stock: { label: string; cost: number }[]; totals: Totals }
export interface Totals { stock: number; sd: number; fixed: number; bank: number; cash: number; otherA: number; assets: number; sc: number; loans: number; otherL: number; liab: number; net: number; working: number }

export const emptySheet = (): Sheet => ({ sd: [], sc: [], fixed: [], loans: [], bank: [], cash: '', otherA: [], otherL: [] });
const PATH = 'catalog/networth.json';
const n = (v: any) => { const x = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(x) ? x : 0; };
export const sumE = (l: Entry[]) => (l || []).reduce((a, e) => a + n(e.amount), 0);

export function compute(sh: Sheet, stock: number): Totals {
  const t = { stock, sd: sumE(sh.sd), fixed: sumE(sh.fixed), bank: sumE(sh.bank), cash: n(sh.cash), otherA: sumE(sh.otherA), sc: sumE(sh.sc), loans: sumE(sh.loans), otherL: sumE(sh.otherL) };
  const assets = t.stock + t.sd + t.fixed + t.bank + t.cash + t.otherA;
  const liab = t.sc + t.loans + t.otherL;
  // working capital: what is rotating in the business (no fixed assets, no loans)
  const working = t.stock + t.sd + t.bank + t.cash + t.otherA - t.sc - t.otherL;
  return { ...t, assets, liab, net: assets - liab, working };
}

export async function loadNet(): Promise<{ draft: Sheet; snaps: Snap[] }> {
  const raw = (await readJson<any>(PATH)) as any;
  const d = raw.draft && typeof raw.draft === 'object' ? raw.draft : {};
  const draft: Sheet = { ...emptySheet(), ...d };
  const snaps: Snap[] = Object.values(raw.snaps || {}) as Snap[];
  return { draft, snaps: snaps.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.ts).localeCompare(String(a.ts))) };
}

async function rawNet(): Promise<any> { return (await readJson<any>(PATH)) as any; }
export async function saveDraft(draft: Sheet): Promise<void> { const r = await rawNet(); await writeJson(PATH, { ...r, draft }); }
export async function saveSnap(s: Snap, draft: Sheet): Promise<void> { const r = await rawNet(); await writeJson(PATH, { ...r, draft, snaps: { ...(r.snaps || {}), [s.id]: s } }); }
export async function deleteSnap(id: string): Promise<void> { const r = await rawNet(); const snaps = { ...(r.snaps || {}) }; delete snaps[id]; await writeJson(PATH, { ...r, snaps }); }
