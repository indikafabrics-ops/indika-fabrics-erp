import { useCallback, useEffect, useState } from 'react';
import { fetchAll } from './supabase';
import { DEFAULT_MODELS, PRESET_COLORS, PRESET_FITS, PRESET_SIZES, type ShowroomRecord } from './constants';
import { uniqueSorted } from './helpers';
import { loadDesignMaster, loadSupplierMaster, splitSizes, type DesignInfo, type SupplierDetail } from './masterStore';

export interface SupplierInfo {
  name: string;
  place: string;
  gst: string;
}

export interface Masters {
  loading: boolean;
  suppliers: SupplierInfo[];
  supplierDetails: Record<string, SupplierDetail>;
  designMaster: Record<string, DesignInfo>;
  fits: string[];
  materials: string[];
  supplierNames: string[];
  itemNames: string[];
  qualities: string[];
  widths: string[];
  folds: string[];
  designs: string[];
  colors: string[];
  models: string[];
  sizes: string[];
  tailors: string[];
  trimNames: string[];
  showrooms: ShowroomRecord[];
  showroomNames: string[];
  /** latest specs used for an item name – used to pre-fill a new GRN row */
  itemSpecs: Record<string, any>;
  /** latest rate used for each tailor */
  tailorRates: Record<string, number>;
  reload: () => Promise<void>;
}

const EMPTY: Masters = {
  loading: true,
  suppliers: [],
  supplierDetails: {},
  designMaster: {},
  fits: PRESET_FITS,
  materials: [],
  supplierNames: [],
  itemNames: [],
  qualities: [],
  widths: [],
  folds: [],
  designs: [],
  colors: PRESET_COLORS,
  models: DEFAULT_MODELS,
  sizes: PRESET_SIZES,
  tailors: [],
  trimNames: [],
  showrooms: [],
  showroomNames: [],
  itemSpecs: {},
  tailorRates: {},
  reload: async () => {}
};

const safe = (p: Promise<any[]>) => p.catch(() => [] as any[]);

/**
 * Loads every "pick-list" (suppliers, items, designs, colors, models, tailors, showrooms…)
 * from data that was already entered earlier, so the user SELECTS instead of typing again.
 */
export function useMasters(): Masters {
  const [state, setState] = useState<Masters>(EMPTY);

  const load = useCallback(async () => {
    const [supplierDetails, designMaster] = await Promise.all([loadSupplierMaster(), loadDesignMaster()]);
    const [bills, fabric, ready, cutting, showrooms, tailor, trims] = await Promise.all([
      safe(fetchAll('pommys_grn_bills', 'id,supplier_name,supplier_place,gst_number')),
      safe(fetchAll('pommys_fabric_stock', 'id,item_name,quality,fabric_width,meter_fold,design_no,color,rate_per_meter,gst_percentage')),
      safe(fetchAll('pommys_ready_stock', 'id,model_name,design_no,color')),
      safe(fetchAll('pommys_cutting_batches', 'batch_code,product_model', undefined, 'batch_code')),
      safe(fetchAll('pommys_showrooms', '*')),
      safe(fetchAll('pommys_tailor_ledger', 'id,tailor_name,rate_per_pc')),
      safe(fetchAll('pommys_store_trims', 'id,item_name'))
    ]);

    // rows are ascending by id – later (newer) rows overwrite older ones
    const supplierMap = new Map<string, SupplierInfo>();
    bills.forEach(b => {
      const name = String(b.supplier_name || '').trim();
      if (!name) return;
      const old = supplierMap.get(name.toLowerCase());
      supplierMap.set(name.toLowerCase(), {
        name: old?.name || name,
        place: String(b.supplier_place || '').trim() || old?.place || '',
        gst: String(b.gst_number || '').trim() || old?.gst || ''
      });
    });
    Object.values(supplierDetails).forEach(d => {
      const k = d.name.toLowerCase();
      const old = supplierMap.get(k);
      supplierMap.set(k, { name: old?.name || d.name, place: d.place || old?.place || '', gst: d.gst || old?.gst || '' });
    });
    const suppliers = Array.from(supplierMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    const itemSpecs: Record<string, any> = {};
    fabric.forEach(f => {
      const key = String(f.item_name || '').trim();
      if (key) itemSpecs[key] = f;
    });

    const readyModels = ready
      .map(r => String(r.model_name || ''))
      .filter(m => m && !m.startsWith('Trading:'));

    const tailorRates: Record<string, number> = {};
    tailor.forEach(t => {
      const name = String(t.tailor_name || '').trim();
      if (name) tailorRates[name] = Number(t.rate_per_pc) || 0;
    });

    const showroomNames = uniqueSorted(showrooms.map((s: any) => s.showroom_name));

    setState({
      loading: false,
      suppliers,
      supplierDetails: Object.fromEntries(Object.values(supplierDetails).map(d => [d.name.toLowerCase(), d])),
      designMaster,
      fits: uniqueSorted([...PRESET_FITS, ...Object.values(designMaster).map(d => d.fit || '')]),
      materials: uniqueSorted([...fabric.map(f => f.item_name), ...Object.values(designMaster).map(d => d.material || '')]),
      supplierNames: suppliers.map(s => s.name),
      itemNames: uniqueSorted(fabric.map(f => f.item_name)),
      qualities: uniqueSorted(fabric.map(f => f.quality)),
      widths: uniqueSorted(fabric.map(f => f.fabric_width)),
      folds: uniqueSorted(fabric.map(f => f.meter_fold)),
      designs: uniqueSorted([...fabric.map(f => f.design_no), ...ready.map(r => r.design_no)]),
      colors: uniqueSorted([...PRESET_COLORS, ...fabric.map(f => f.color), ...ready.map(r => r.color)]),
      models: uniqueSorted([...DEFAULT_MODELS, ...cutting.map(c => c.product_model), ...readyModels]),
      sizes: uniqueSorted([...PRESET_SIZES, ...Object.values(designMaster).flatMap(d => splitSizes(d.sizes))]),
      tailors: uniqueSorted(Object.keys(tailorRates)),
      trimNames: uniqueSorted(trims.map(t => t.item_name)),
      showrooms: showrooms as ShowroomRecord[],
      showroomNames,
      itemSpecs,
      tailorRates,
      reload: async () => {}
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}
