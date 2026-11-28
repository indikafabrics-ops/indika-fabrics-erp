import { readJson, writeJson } from './masterStore';
import { fetchAll } from './supabase';
import { num } from './helpers';

/**
 * Size-wise stock that the database has no column for.
 * assets/catalog/sizes.json : { "<batch code>": { "S": 10, "M": 20 } }
 * A code lives in exactly one place at a time (a WIP stage, Godown …), so the code is enough as key.
 * Batches that were never split by size fall back to the sizes entered at Cutting (scaled to the pieces left).
 */
const PATH = 'catalog/sizes.json';
export type SizeMap = Record<string, number>;
export const NO_SIZE = '—';

export async function loadSizeLedger(): Promise<Record<string, SizeMap>> {
  const raw = await readJson<any>(PATH);
  const out: Record<string, SizeMap> = {};
  Object.entries(raw).forEach(([k, v]) => { if (v && typeof v === 'object') out[k] = v as SizeMap; });
  return out;
}

/** null removes the entry */
export async function saveSizeUpdates(updates: Record<string, SizeMap | null>): Promise<void> {
  const keys = Object.keys(updates);
  if (keys.length === 0) return;
  const all = await readJson<any>(PATH);
  keys.forEach(k => {
    const v = updates[k];
    if (!v || Object.values(v).every(n => !n)) delete all[k];
    else all[k] = Object.fromEntries(Object.entries(v).filter(([, n]) => n > 0));
  });
  await writeJson(PATH, all);
}

export async function loadCutSizes(): Promise<Record<string, SizeMap>> {
  const cut = await fetchAll('pommys_cutting_batches', 'batch_code,size_pieces_json', undefined, 'batch_code');
  const out: Record<string, SizeMap> = {};
  cut.forEach((c: any) => {
    const m: SizeMap = {};
    (Array.isArray(c.size_pieces_json) ? c.size_pieces_json : []).forEach((s: any) => { if (s?.size) m[String(s.size)] = (m[String(s.size)] || 0) + num(s.pieces); });
    out[c.batch_code] = m;
  });
  return out;
}

/** scale a size map so that it adds up to `total` (largest-remainder rounding) */
export function scaleTo(m: SizeMap, total: number): SizeMap {
  const keys = Object.keys(m).filter(k => m[k] > 0);
  const sum = keys.reduce((a, k) => a + m[k], 0);
  if (keys.length === 0 || sum <= 0) return total > 0 ? { [NO_SIZE]: total } : {};
  if (sum === total) return Object.fromEntries(keys.map(k => [k, m[k]]));
  const exact = keys.map(k => ({ k, v: (m[k] / sum) * total }));
  const out: SizeMap = Object.fromEntries(exact.map(e => [e.k, Math.floor(e.v)]));
  let left = total - Object.values(out).reduce((a, b) => a + b, 0);
  exact.sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)));
  for (let i = 0; left > 0; i = (i + 1) % exact.length, left--) out[exact[i].k] += 1;
  return out;
}

export const baseOf = (code: string) => String(code || '').replace(/(-P\d*)+$/, '');

/** sizes available for a WIP / Ready row */
export function sizesFor(code: string, total: number, ledger: Record<string, SizeMap>, cut: Record<string, SizeMap>): SizeMap {
  const own = ledger[code];
  if (own && Object.keys(own).length) {
    const sum = Object.values(own).reduce((a, b) => a + b, 0);
    return sum === total ? own : scaleTo(own, total);
  }
  return scaleTo(cut[baseOf(code)] || {}, total);
}

export const sumSizes = (m: SizeMap) => Object.values(m).reduce((a, b) => a + num(b), 0);

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL', 'Free', 'Free Size'];
export const sortSizes = (a: string, b: string) => {
  const ia = SIZE_ORDER.indexOf(a), ib = SIZE_ORDER.indexOf(b);
  if (ia >= 0 && ib >= 0) return ia - ib;
  if (ia >= 0) return -1;
  if (ib >= 0) return 1;
  return a.localeCompare(b, undefined, { numeric: true });
};
export const fmtSizes = (m: SizeMap) => Object.keys(m).sort(sortSizes).map(k => `${k}:${m[k]}`).join('  ');
