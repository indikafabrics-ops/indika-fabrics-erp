import { supabase, fetchAll } from './supabase';
import { catalogKey, listCatalogPhotos } from './image';
import { baseBatchCode, parseModelLabel, uniqueSorted } from './helpers';

export interface BatchMeta {
  model: string;
  design: string;
  color: string;
  size?: string;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Finds Design & Color of production batches.
 * - Batches created from Cutting: read from the cutting batch's fabrics.
 * - Opening-stock batches ("Nighty - D12 (Red)"): parsed from the label.
 * Key of the result = the batch code exactly as stored (including -P1 child suffix).
 */
export async function loadBatchMeta(batches: { batch_code: string; model_name?: string }[]): Promise<Record<string, BatchMeta>> {
  const result: Record<string, BatchMeta> = {};
  const bases = Array.from(new Set(batches.map(b => baseBatchCode(b.batch_code)).filter(Boolean)));

  const cuttingByBase: Record<string, any> = {};
  for (const part of chunk(bases, 40)) {
    const { data } = await supabase
      .from('pommys_cutting_batches')
      .select('batch_code,product_model,selected_fabrics_json')
      .in('batch_code', part);
    (data || []).forEach((c: any) => { cuttingByBase[c.batch_code] = c; });
  }

  // fabric rows for old cutting batches that do not carry design/color inside the json
  const missingIds = new Set<string>();
  Object.values(cuttingByBase).forEach((c: any) => {
    (Array.isArray(c.selected_fabrics_json) ? c.selected_fabrics_json : []).forEach((f: any) => {
      if (f && f.stockId && f.design_no === undefined) missingIds.add(String(f.stockId));
    });
  });
  const fabricById: Record<string, any> = {};
  for (const part of chunk(Array.from(missingIds), 40)) {
    const { data } = await supabase.from('pommys_fabric_stock').select('id,design_no,color').in('id', part);
    (data || []).forEach((f: any) => { fabricById[String(f.id)] = f; });
  }

  batches.forEach(b => {
    const base = baseBatchCode(b.batch_code);
    const cut = cuttingByBase[base];
    if (cut) {
      const fabs: any[] = Array.isArray(cut.selected_fabrics_json) ? cut.selected_fabrics_json : [];
      const designs: string[] = [];
      const colors: string[] = [];
      fabs.forEach(f => {
        const src = f.design_no !== undefined ? f : fabricById[String(f.stockId)] || {};
        designs.push(src.design_no);
        colors.push(src.color);
      });
      result[b.batch_code] = {
        model: cut.product_model || b.model_name || '-',
        design: uniqueSorted(designs).join(', ') || '-',
        color: uniqueSorted(colors).join(', ') || '-'
      };
    } else {
      result[b.batch_code] = parseModelLabel(b.model_name || '');
    }
  });

  return result;
}

const pk = (model: string, design: string, color: string) =>
  [model, design, color].map(x => String(x || '-').trim().toLowerCase()).join('|');

/**
 * Garment photos entered at Cutting. Lookup order: Model+Design+Color photo, then Model+Design, then Model.
 * Newest cutting batch wins.
 */
export async function loadModelPhotos(): Promise<{ photoOf: (model: string, design: string, color: string) => string; countOf: (model: string, design: string) => number }> {
  const map = new Map<string, string>();
  const counts = new Map<string, number>();
  try {
    const rows = await fetchAll('pommys_cutting_batches', 'batch_code,product_model,selected_fabrics_json', undefined, 'batch_code'); // oldest first, newest overwrites
    rows.forEach((c: any) => {
      const model = c.product_model;
      (Array.isArray(c.selected_fabrics_json) ? c.selected_fabrics_json : []).forEach((f: any) => {
        if (!f) return;
        if (Number(f.colors_count) > 0) counts.set(pk(model, f.design_no, '*'), Number(f.colors_count));
        const main = f.model_image || '';
        if (main) {
          map.set(pk(model, '*', '*'), main);
          map.set(pk(model, f.design_no, '*'), main);
        }
        const own = f.color_image || main;
        if (own) map.set(pk(model, f.design_no, f.color), own);
      });
    });
  } catch { /* photos are optional */ }
  const manual = await listCatalogPhotos();
  return {
    photoOf: (model, design, color) => manual.get(catalogKey(model, design)) || map.get(pk(model, design, color)) || map.get(pk(model, design, '*')) || '',
    countOf: (model, design) => counts.get(pk(model, design, '*')) || 0
  };
}
