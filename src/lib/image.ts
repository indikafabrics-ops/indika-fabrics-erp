import { supabase } from './supabase';

/** Shrinks a phone photo (often 3-5 MB) to ~1000px JPEG so uploads are fast and the catalog loads quickly. */
export async function compressImage(file: File, maxSide = 1000, quality = 0.8): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/** Uploads a photo to the existing "assets" bucket and returns its public URL (throws on failure). */
export async function uploadPhoto(file: File, folder: string): Promise<string> {
  const blob = await compressImage(file);
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const { error } = await supabase.storage.from('assets').upload(path, blob, { contentType: blob.type || 'image/jpeg' });
  if (error) throw error;
  return supabase.storage.from('assets').getPublicUrl(path).data.publicUrl;
}

// ---- Manual catalog photos (any Model + Design: opening stock, trading goods, or replacing a cutting photo) ----
const slug = (x: string) => String(x || '-').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || '-';
export const catalogKey = (model: string, design: string) => `${slug(model)}__${slug(design)}`;

export async function uploadCatalogPhoto(model: string, design: string, file: File): Promise<string> {
  const blob = await compressImage(file);
  const path = `catalog/${catalogKey(model, design)}.jpg`;
  const { error } = await supabase.storage.from('assets').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  return supabase.storage.from('assets').getPublicUrl(path).data.publicUrl + '?t=' + Date.now();
}

/** key (see catalogKey) -> public URL of the manually uploaded photo */
export async function listCatalogPhotos(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const { data } = await supabase.storage.from('assets').list('catalog', { limit: 1000 });
    (data || []).forEach((f: any) => {
      if (!f || !/\.jpg$/i.test(f.name || '')) return;
      const url = supabase.storage.from('assets').getPublicUrl('catalog/' + f.name).data.publicUrl;
      out.set(f.name.replace(/\.jpg$/i, ''), url + '?t=' + encodeURIComponent(String(f.updated_at || f.created_at || '')));
    });
  } catch { /* optional */ }
  return out;
}
