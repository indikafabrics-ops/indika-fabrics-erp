import { readJson, writeJson } from './masterStore';

/** Local (own) name for each batch – chosen per batch. Stored as assets/catalog/batchnames.json { "<batch code>": "name" } */
const PATH = 'catalog/batchnames.json';

export async function loadBatchNames(): Promise<Record<string, string>> {
  const raw = await readJson<any>(PATH);
  const out: Record<string, string> = {};
  Object.entries(raw).forEach(([k, v]) => { if (typeof v === 'string') out[k] = v; });
  return out;
}

export async function saveBatchNames(entries: Record<string, string>): Promise<void> {
  const clean = Object.entries(entries).filter(([k, v]) => k && v && v.trim());
  if (clean.length === 0) return;
  const all = await loadBatchNames();
  clean.forEach(([k, v]) => { all[k] = v.trim(); });
  await writeJson(PATH, all as any);
}

export const uniqueNames = (m: Record<string, string>) => Array.from(new Set(Object.values(m))).sort((a, b) => a.localeCompare(b));

/** child codes (…-P1) share the name of their base cutting batch */
export const nameFor = (m: Record<string, string>, code: string): string => m[code] || m[String(code || '').replace(/(-P\d*)+$/, '')] || '';
