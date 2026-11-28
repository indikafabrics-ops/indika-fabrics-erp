import { readJson, writeJson } from './masterStore';

/** Who did what – kept in assets/catalog/audit.json (latest 600 entries). Visible to Admin only. */
const PATH = 'catalog/audit.json';
export interface AuditEntry { id: string; ts: string; who: string; role: string; text: string }

let actor: { who: string; role: string } = { who: 'unknown', role: '' };
export const setAuditUser = (u: any) => { actor = { who: String(u?.full_name || u?.username || 'unknown'), role: String(u?.role || '') }; };

export async function loadAudit(): Promise<AuditEntry[]> {
  const all = await readJson<AuditEntry>(PATH);
  return Object.values(all).sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
}

/** fire-and-forget: never blocks or breaks the real work */
export function logAction(text: string) {
  (async () => {
    try {
      const all = await readJson<AuditEntry>(PATH);
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      all[id] = { id, ts: new Date().toISOString(), ...actor, text };
      const keys = Object.keys(all).sort();
      if (keys.length > 600) keys.slice(0, keys.length - 600).forEach(k => delete all[k]);
      await writeJson(PATH, all);
    } catch { /* audit is best-effort */ }
  })();
}
