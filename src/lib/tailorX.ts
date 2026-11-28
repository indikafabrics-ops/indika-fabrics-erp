import { readJson, writeJson } from './masterStore';
import { modelKey } from './costSheets';
import type { SizeMap } from './sizeLedger';

/**
 * Extra Tailor-Ledger details kept in Storage JSON (the table itself is not changed):
 *  per ledger row id: work (Full / 1st Work / 2nd Work), size-wise pieces, issue date, received date and pieces
 *  rates: last rate used for "<model>|<work>"
 */
export interface TailorX { work?: string; sizes?: SizeMap; date?: string; recDate?: string; recPcs?: number; recSizes?: SizeMap }
export const WORKS = ['Full', '1st Work', '2nd Work'];
const PATH = 'catalog/tailorx.json';

export interface TailorStore { rows: Record<string, TailorX>; rates: Record<string, number> }

export async function loadTailorX(): Promise<TailorStore> {
  const j = await readJson<any>(PATH);
  return { rows: (j.rows || {}) as Record<string, TailorX>, rates: (j.rates || {}) as Record<string, number> };
}
/** re-reads first so two people never overwrite each other */
export async function saveTailorX(patch: { rows?: Record<string, TailorX | null>; rates?: Record<string, number> }): Promise<void> {
  const cur = await loadTailorX();
  Object.entries(patch.rows || {}).forEach(([id, v]) => { if (v === null) delete cur.rows[id]; else cur.rows[id] = { ...(cur.rows[id] || {}), ...v }; });
  Object.assign(cur.rates, patch.rates || {});
  await writeJson(PATH, cur);
}
export const rateKey = (model: string, work: string) => `${modelKey(model)}|${work}`;
export const dateOf = (en: any, x?: TailorX): string => x?.date || String(en.created_at || '').slice(0, 10) || '';
/** pieces actually received (falls back to the issued pieces for old entries) */
export const recPcsOf = (en: any, x?: TailorX): number => (x?.recPcs !== undefined ? x.recPcs : Number(en.pieces) || 0);
