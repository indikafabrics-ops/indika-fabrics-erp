import { supabase } from './supabase';
import { catalogKey } from './image';

/**
 * "Masters" kept as small JSON files in the existing Storage bucket (assets/catalog/…),
 * so no database table has to be changed:
 *  - designs.json   : Material, Fit, Sizes, Selling price per Model + Design
 *  - suppliers.json : full supplier details (entered once, filled automatically afterwards)
 */
export async function readJson<T>(path: string): Promise<Record<string, T>> {
  try {
    const { data, error } = await supabase.storage.from('assets').download(path);
    if (error || !data) return {};
    const parsed = JSON.parse(await data.text());
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function writeJson(path: string, obj: unknown): Promise<void> {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  const { error } = await supabase.storage.from('assets').upload(path, blob, { upsert: true, contentType: 'application/json', cacheControl: '0' });
  if (error) throw error;
}

// ---------------------------------------------------------------- designs
export interface Swatch { name: string; photo?: string }

export interface DesignInfo {
  model: string;
  design: string;
  material?: string;
  fit?: string;
  sizes?: string; // "M, L, XL"
  price?: number;
  mrp?: number;
  /** size-wise selling rate / MRP: { M: {price: 450, mrp: 599} } */
  rates?: Record<string, { price?: number; mrp?: number }>;
  /** up to 4 product photos: Front, Back, Side, Close-up */
  photos?: string[];
  /** up to 6 colour squares: fabric photo and/or colour name */
  swatches?: Swatch[];
}

const DESIGN_PATH = 'catalog/designs.json';
const designKey = (model: string, design: string) => catalogKey(model, design);

export const splitSizes = (s: string | undefined) => String(s || '').split(/[,/]+/).map(x => x.trim()).filter(Boolean);

export async function loadDesignMaster(): Promise<Record<string, DesignInfo>> {
  return readJson<DesignInfo>(DESIGN_PATH);
}

/** returns a lookup(model, design) over a loaded master; "-" designs fall back to nothing */
export function designLookup(master: Record<string, DesignInfo>) {
  return (model: string, design: string): DesignInfo | undefined => master[designKey(model, design)];
}

/** merge details for one or more Model+Design pairs (empty values never erase existing ones) */
export async function saveDesignInfo(entries: DesignInfo[], opts?: { replaceSizes?: boolean }): Promise<void> {
  const master = await loadDesignMaster();
  entries.forEach(e => {
    if (!e.model) return;
    const k = designKey(e.model, e.design || '-');
    const old = master[k] || { model: e.model, design: e.design || '-' };
    const sizes = opts?.replaceSizes
      ? (e.sizes ?? old.sizes)
      : Array.from(new Set([...splitSizes(old.sizes), ...splitSizes(e.sizes)])).join(', ') || old.sizes;
    master[k] = {
      ...old,
      model: e.model,
      design: e.design || '-',
      material: e.material?.trim() || old.material,
      fit: e.fit?.trim() || old.fit,
      sizes,
      price: e.price && e.price > 0 ? e.price : old.price,
      mrp: e.mrp && e.mrp > 0 ? e.mrp : old.mrp,
      rates: e.rates ? { ...(old.rates || {}), ...e.rates } : old.rates,
      photos: e.photos && e.photos.length ? e.photos : old.photos,
      swatches: e.swatches && e.swatches.length ? e.swatches : old.swatches
    };
  });
  await writeJson(DESIGN_PATH, master);
}

// -------------------------------------------------------------- suppliers
export interface SupplierDetail {
  name: string;
  place?: string;
  address?: string;
  state?: string;
  gst?: string;
  mobile?: string;
  email?: string;
  contact?: string;
}

const SUPPLIER_PATH = 'catalog/suppliers.json';

export async function loadSupplierMaster(): Promise<Record<string, SupplierDetail>> {
  return readJson<SupplierDetail>(SUPPLIER_PATH);
}

export async function saveSupplierDetail(d: SupplierDetail): Promise<void> {
  const name = d.name.trim();
  if (!name) return;
  const master = await loadSupplierMaster();
  const k = name.toLowerCase();
  const old = master[k] || { name };
  const merged: SupplierDetail = { ...old, name };
  (['place', 'address', 'state', 'gst', 'mobile', 'email', 'contact'] as const).forEach(f => {
    const v = (d[f] || '').trim();
    if (v) merged[f] = v;
  });
  master[k] = merged;
  await writeJson(SUPPLIER_PATH, master);
}

/** selling rate & MRP for one size of a design (size-wise value first, then the design's general value) */
export function rateFor(info: DesignInfo | undefined, size: string): { price: number; mrp: number } {
  const r = info?.rates?.[size];
  return { price: Number(r?.price || info?.price || 0), mrp: Number(r?.mrp || info?.mrp || 0) };
}
