import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://chaodxrbgiqotdxxvjcj.supabase.co';
const supabaseKey = 'sb_publishable_RMyuFaMfVoiWybffGparzw_ePnF0LaI';

export const supabase = createClient(supabaseUrl, supabaseKey);

export const POMMYS_LOGO_URL =
  'https://chaodxrbgiqotdxxvjcj.supabase.co/storage/v1/object/public/assets/Pommys%20Logo%20Jepeg.jpg';

/**
 * Supabase returns max 1000 rows per request. This helper pages through
 * ALL rows so totals / reports are never silently cut off.
 */
export async function fetchAll(
  table: string,
  columns: string = '*',
  apply?: (q: any) => any,
  orderBy: string | null = 'id'
): Promise<any[]> {
  const pageSize = 1000;
  const out: any[] = [];
  for (let from = 0; ; from += pageSize) {
    let q: any = supabase.from(table).select(columns);
    if (apply) q = apply(q);
    if (orderBy) q = q.order(orderBy, { ascending: true });
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) throw error;
    const rows: any[] = data || [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

export function errMsg(err: any): string {
  return String(err?.message || err?.details || err || 'Unknown error');
}
