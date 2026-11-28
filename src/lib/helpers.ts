import { ALL_MENU_KEYS, MENU_ITEMS, type MenuKey, type UserRole } from './constants';
import { fetchAll } from './supabase';

export function normalizeRole(rawRole: any): UserRole {
  const upper = String(rawRole || 'CUSTOMER').toUpperCase();
  if (upper === 'ADMIN') return 'ADMIN';
  if (upper === 'OFFICE') return 'OFFICE';
  if (upper === 'SALESMAN') return 'SALESMAN';
  return 'CUSTOMER';
}

export function getDefaultMenusForRole(role: UserRole): MenuKey[] {
  return MENU_ITEMS.filter(m => m.roles.includes(role)).map(m => m.key);
}

export function getEffectiveMenus(userObj: any): MenuKey[] {
  const role = normalizeRole(userObj?.role);
  if (role === 'ADMIN') return ALL_MENU_KEYS;
  if (Array.isArray(userObj?.allowed_menus) && userObj.allowed_menus.length > 0) {
    return userObj.allowed_menus.filter((k: any) => ALL_MENU_KEYS.includes(k));
  }
  return getDefaultMenusForRole(role);
}

export const num = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** round to 3 decimals – avoids 0.1+0.2 style float noise in meters */
export const r3 = (n: number): number => Math.round(n * 1000) / 1000;

export const fmt = (n: any, digits = 2): string => {
  const v = num(n);
  return String(Math.round(v * Math.pow(10, digits)) / Math.pow(10, digits));
};

export const money = (n: any): string =>
  num(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Local (India) date as YYYY-MM-DD – not UTC, so it never shows yesterday after midnight */
export function todayStr(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function uniqueSorted(values: any[]): string[] {
  const set = new Set<string>();
  values.forEach(v => {
    const s = String(v ?? '').trim();
    if (s && s !== '-') set.add(s);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
}

/** CUT-2026-001-P2-P  ->  CUT-2026-001 */
export function baseBatchCode(code: string): string {
  return String(code || '').replace(/(-P\d*)+$/, '');
}

/** "Nighty - D12 (Red)" -> { model: 'Nighty', design: 'D12', color: 'Red' } */
export function parseModelLabel(label: string): { model: string; design: string; color: string; size?: string } {
  const text = String(label || '').trim();
  const m = text.match(/^(.*?)(?: - ([^()]+?))?(?: \(([^)]+)\))?$/);
  if (!m) return { model: text, design: '-', color: '-' };
  let design = (m[2] || '-').trim();
  let size: string | undefined;
  // "JASMINE NIGHTY - XXL SIZE" : the part after " - " is a SIZE, not a design number
  const sz = design.match(/^(XXS|XS|XXL|XL|[2-6]\s?XL|S|M|L|FREE)\s*SIZE$/i);
  if (sz) { size = sz[1].replace(/\s+/g, '').toUpperCase(); if (size === 'FREE') size = 'Free'; design = '-'; }
  return { model: (m[1] || text).trim(), design, color: (m[3] || '-').trim(), ...(size ? { size } : {}) };
}

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  // BOM so Excel opens Tamil / special characters correctly
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * End bits are saved in BOTH pommys_cutting_batches and pommys_exceptions_stock.
 * This merges them WITHOUT counting the same batch twice.
 */
export function mergeExceptionRows(exceptions: any[], cutting: any[]): any[] {
  const seen = new Set<string>();
  (exceptions || []).forEach(e => {
    if (e.stock_type === 'END_BIT') seen.add(String(e.ref_code || ''));
  });
  const extra = (cutting || [])
    .filter(c => num(c.end_bit_meters) > 0 && !seen.has(String(c.batch_code || '')))
    .map(c => ({
      id: `cut-${c.batch_code}`,
      stock_type: 'END_BIT',
      ref_code: c.batch_code,
      model_or_item: c.product_model || '-',
      color: '-',
      qty: c.end_bit_meters,
      unit: 'Mtr',
      remarks: 'Cutting Batch End Bit'
    }));
  return [...(exceptions || []), ...extra];
}

export interface ShowroomLine {
  showroom: string;
  model: string;
  design: string;
  color: string;
  pcs: number;
}

/** Net showroom stock = sum of transfers (+) and sales/returns (-) grouped by showroom/model/design/color */
export function computeShowroomLines(transfers: any[]): ShowroomLine[] {
  const map = new Map<string, ShowroomLine>();
  (transfers || []).forEach(t => {
    const showroom = String(t.showroom_name || '').trim() || 'Unknown';
    const model = String(t.model_name || '-').trim() || '-';
    const design = String(t.design_no || '-').trim() || '-';
    const color = String(t.color || '-').trim() || '-';
    const key = [showroom, model, design, color].map(s => s.toLowerCase()).join('|');
    const cur = map.get(key) || { showroom, model, design, color, pcs: 0 };
    cur.pcs += num(t.transferred_pieces);
    map.set(key, cur);
  });
  return Array.from(map.values()).sort((a, b) =>
    (a.showroom + a.model + a.design + a.color).localeCompare(b.showroom + b.model + b.design + b.color)
  );
}

export interface StockSnapshot {
  fabricMeters: number;
  wipBatches: number;
  wipPieces: number;
  wipByStage: Record<string, number>;
  godownPieces: number;
  showroomPieces: number;
  /** split of showroomPieces: Busy report file vs Entry (ERP transfers + hand entries) – set by loadStockSnapshotFull */
  showroomBusy?: number;
  showroomEntry?: number;
  endBitMeters: number;
  damagePieces: number;
  damageMeters: number;
  lowTrims: number;
}

/** One place for every headline number – Dashboard and Reports always agree */
export async function loadStockSnapshot(): Promise<StockSnapshot> {
  const [fabric, wip, ready, transfers, cutting, exceptions, trims] = await Promise.all([
    fetchAll('pommys_fabric_stock', 'id,available_meters'),
    fetchAll('pommys_production_wip', 'id,current_status,total_pieces', q => q.neq('current_status', 'Ready Stock')),
    fetchAll('pommys_ready_stock', 'id,ready_pieces'),
    fetchAll('pommys_showroom_transfers', 'id,transferred_pieces'),
    fetchAll('pommys_cutting_batches', 'batch_code,product_model,end_bit_meters', undefined, 'batch_code'),
    fetchAll('pommys_exceptions_stock', 'id,stock_type,ref_code,qty,unit'),
    fetchAll('pommys_store_trims', 'id,qty,reorder_level').catch(() => [] as any[])
  ]);

  const merged = mergeExceptionRows(exceptions, cutting);
  const wipByStage: Record<string, number> = {};
  wip.forEach((w: any) => {
    wipByStage[w.current_status] = (wipByStage[w.current_status] || 0) + num(w.total_pieces);
  });

  const sum = (rows: any[], f: string) => rows.reduce((a, r) => a + num(r[f]), 0);
  const damageRows = merged.filter(e => e.stock_type === 'DAMAGE');

  return {
    fabricMeters: sum(fabric, 'available_meters'),
    wipBatches: wip.length,
    wipPieces: sum(wip, 'total_pieces'),
    wipByStage,
    godownPieces: sum(ready, 'ready_pieces'),
    showroomPieces: sum(transfers, 'transferred_pieces'),
    endBitMeters: sum(merged.filter(e => e.stock_type === 'END_BIT'), 'qty'),
    damagePieces: sum(damageRows.filter(e => String(e.unit || 'Pcs') !== 'Mtr'), 'qty'),
    damageMeters: sum(damageRows.filter(e => String(e.unit || '') === 'Mtr'), 'qty'),
    lowTrims: trims.filter((t: any) => num(t.qty) <= num(t.reorder_level ?? 20)).length
  };
}

/** size of a showroom row: "Size M", "Showroom Sale | Size M" or a plain "M" (old opening stock) – otherwise "-" */
export function sizeOfRow(t: any): string {
  const raw = String(t?.size_details || '').trim();
  const m = raw.match(/(?:^|\|\s*)(?:Size\s+)?(XXS|XS|S|M|L|XL|XXL|[2-6]XL|Free(?: Size)?|\d{1,3})\s*$/i);
  return m ? m[1].toUpperCase().replace('FREE SIZE', 'Free').replace(/^FREE$/, 'Free') : '-';
}

export interface ShowroomSizeLine extends ShowroomLine { size: string }

/** same as computeShowroomLines but one line per size */
export function computeShowroomSizeLines(transfers: any[]): ShowroomSizeLine[] {
  const map = new Map<string, ShowroomSizeLine>();
  (transfers || []).forEach(t => {
    const showroom = String(t.showroom_name || '').trim() || 'Unknown';
    const model = String(t.model_name || '-').trim() || '-';
    const design = String(t.design_no || '-').trim() || '-';
    const color = String(t.color || '-').trim() || '-';
    const size = sizeOfRow(t);
    const key = [showroom, model, design, color, size].map(x => x.toLowerCase()).join('|');
    const cur = map.get(key) || { showroom, model, design, color, size, pcs: 0 };
    cur.pcs += num(t.transferred_pieces);
    map.set(key, cur);
  });
  return Array.from(map.values()).sort((a, b) => (a.showroom + a.model + a.design + a.color + a.size).localeCompare(b.showroom + b.model + b.design + b.color + b.size));
}
