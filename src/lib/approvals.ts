import { supabase } from './supabase';
import { readJson, writeJson } from './masterStore';
import { logAction } from './audit';
import { ADJ_TABLE, applyAdjOp, type AdjOp } from './showroomAdj';

/**
 * Edit / Delete approval queue.
 * Staff (Office / Salesman) never change or remove a saved record directly: the change is filed as a request
 * (kept in Storage: assets/catalog/requests.json) and waits in the Admin login.
 * Only when the Admin approves is the change really written to the database. Admin's own changes run at once.
 */
const PATH = 'catalog/requests.json';

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'failed';

export interface ChangeRequest {
  id: string;
  ts: string;
  by: string;
  byName: string;
  action: 'update' | 'delete';
  table: string;
  rowId: string | number;
  label: string;
  changes?: Record<string, any>;
  before?: Record<string, any>;
  status: RequestStatus;
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
}

export async function loadRequests(): Promise<ChangeRequest[]> {
  const all = await readJson<ChangeRequest>(PATH);
  return Object.values(all).sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
}

async function saveRequest(r: ChangeRequest) {
  const all = await readJson<ChangeRequest>(PATH); // re-read so two people do not overwrite each other
  all[r.id] = r;
  await writeJson(PATH, all);
}

/** really perform the change in the database */
export async function executeChange(r: Pick<ChangeRequest, 'action' | 'table' | 'rowId' | 'changes'>): Promise<void> {
  // Showroom hand corrections live in Storage JSON, not in a table: apply the saved operation
  if (r.table === ADJ_TABLE) {
    const op = r.changes?._op as AdjOp | undefined;
    if (!op) throw new Error('மாற்றத் தகவல் இல்லை.');
    await applyAdjOp(String(r.rowId), op);
    return;
  }
  const { data, error: readErr } = await supabase.from(r.table).select('id').eq('id', r.rowId).limit(1);
  if (readErr) throw readErr;
  if (!data || data.length === 0) throw new Error('இந்த Record இப்போது இல்லை (ஏற்கனவே நீக்கப்பட்டிருக்கலாம்).');
  if (r.action === 'delete') {
    const { error } = await supabase.from(r.table).delete().eq('id', r.rowId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from(r.table).update(r.changes || {}).eq('id', r.rowId);
    if (error) throw error;
  }
}

export const isAdmin = (user: any) => String(user?.role || '').toUpperCase() === 'ADMIN';

/** Admin → runs now ('done'); anybody else → queued for Admin approval ('queued') */
export async function submitChange(user: any, input: { action: 'update' | 'delete'; table: string; rowId: string | number; label: string; changes?: Record<string, any>; before?: Record<string, any> }): Promise<'done' | 'queued'> {
  if (isAdmin(user)) {
    await executeChange(input);
    return 'done';
  }
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await saveRequest({
    id, ts: new Date().toISOString(), by: String(user?.username || user?.full_name || 'staff'), byName: String(user?.full_name || user?.username || 'Staff'),
    ...input, status: 'pending'
  });
  return 'queued';
}

export async function decideRequest(r: ChangeRequest, approve: boolean, admin: any, note = ''): Promise<ChangeRequest> {
  const next: ChangeRequest = { ...r, decidedBy: String(admin?.full_name || admin?.username || 'Admin'), decidedAt: new Date().toISOString(), note };
  if (!approve) {
    next.status = 'rejected';
  } else {
    try {
      await executeChange(r);
      next.status = 'approved';
    } catch (err: any) {
      next.status = 'failed';
      next.note = String(err?.message || err);
    }
  }
  await saveRequest(next);
  logAction(`${approve ? 'Approve' : 'Reject'} (${next.status}): ${r.label}`);
  return next;
}

export async function pendingCount(): Promise<number> {
  try { return (await loadRequests()).filter(r => r.status === 'pending').length; } catch { return 0; }
}
