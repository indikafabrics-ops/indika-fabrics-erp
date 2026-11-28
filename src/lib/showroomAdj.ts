import { readJson, writeJson } from './masterStore';
import { slugShop } from './tradeStock';

/**
 * Hand corrections for showroom stock (no database change – Storage JSON  trade/adj__<shop>.json).
 *  edits   : changes to one Busy line (key = original Busy line key). Item / Design / Size / Colour / MRP / Price stay
 *            after a new Busy upload; a changed Qty belongs to ONE upload (qAsOn) and is not used after a newer upload.
 *  deleted : Busy lines the owner removed from the report (stay removed after a new upload).
 *  added   : lines typed by hand (new items). Counted only when dated AFTER the Busy "as on" date (never twice),
 *            or when ticked "Busy-ல் இல்லை → கூட்டவும்".
 * Busy's own file is never touched, so every change can be undone.
 */
export interface AdjEdit { item?: string; design?: string; size?: string; colour?: string; mrp?: number; price?: number; qty?: number; qAsOn?: string; at: string; by: string }
export interface AdjDeleted { at: string; by: string; label: string }
export interface AdjAdded { id: string; item: string; design: string; size: string; colour: string; mrp: number; price: number; qty: number; date: string; note: string; force?: boolean; at: string; by: string }
export interface AdjFile { edits: Record<string, AdjEdit>; deleted: Record<string, AdjDeleted>; added: AdjAdded[] }

export type AdjOp =
  | { t: 'edit'; k: string; f: Partial<Omit<AdjEdit, 'at' | 'by'>>; by: string }
  | { t: 'del'; k: string; label: string; by: string }
  | { t: 'undo'; k: string }
  | { t: 'add'; row: Omit<AdjAdded, 'at' | 'by' | 'id'> & { id?: string }; by: string }
  | { t: 'editAdd'; id: string; f: Partial<Omit<AdjAdded, 'id' | 'at' | 'by'>> }
  | { t: 'delAdd'; id: string }
  | { t: 'force'; id: string; on: boolean }
  | { t: 'clear' }
  | { t: 'drop'; keys: string[] };

export const ADJ_TABLE = 'json:showroom-adj';
const path = (key: string) => `catalog/trade/adj__${slugShop(key)}.json`;
export const adjKeyOfErp = (name: string) => 'erp-' + name;

export const emptyAdj = (): AdjFile => ({ edits: {}, deleted: {}, added: [] });

export async function loadAdj(key: string): Promise<AdjFile> {
  const raw: any = await readJson<any>(path(key));
  return {
    edits: raw.edits && typeof raw.edits === 'object' ? raw.edits : {},
    deleted: raw.deleted && typeof raw.deleted === 'object' ? raw.deleted : {},
    added: Array.isArray(raw.added) ? raw.added : []
  };
}

const nowIso = () => new Date().toISOString();

/** pure: apply one operation to an adjustment file */
export function applyOp(a: AdjFile, op: AdjOp): AdjFile {
  const out: AdjFile = { edits: { ...a.edits }, deleted: { ...a.deleted }, added: [...a.added] };
  switch (op.t) {
    case 'edit': out.edits[op.k] = { ...(out.edits[op.k] || {}), ...op.f, at: nowIso(), by: op.by } as AdjEdit; delete out.deleted[op.k]; break;
    case 'del': out.deleted[op.k] = { at: nowIso(), by: op.by, label: op.label }; delete out.edits[op.k]; break;
    case 'undo': delete out.edits[op.k]; delete out.deleted[op.k]; break;
    case 'add': out.added.push({ ...op.row, id: op.row.id || `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: nowIso(), by: op.by }); break;
    case 'editAdd': out.added = out.added.map(r => (r.id === op.id ? { ...r, ...op.f } : r)); break;
    case 'delAdd': out.added = out.added.filter(r => r.id !== op.id); break;
    case 'force': out.added = out.added.map(r => (r.id === op.id ? { ...r, force: op.on } : r)); break;
    case 'clear': out.edits = {}; out.deleted = {}; break;
    case 'drop': op.keys.forEach(k => { delete out.edits[k]; delete out.deleted[k]; }); break;
  }
  return out;
}

/** read the latest file, apply, write (so two people do not overwrite each other's earlier changes) */
export async function applyAdjOp(key: string, op: AdjOp): Promise<void> {
  const cur = await loadAdj(key);
  await writeJson(path(key), applyOp(cur, op));
}

export const adjCount = (a: AdjFile) => Object.keys(a.edits).length + Object.keys(a.deleted).length;
