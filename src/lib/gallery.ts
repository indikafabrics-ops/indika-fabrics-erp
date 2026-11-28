import { uploadPhoto } from './image';
import type { Swatch } from './masterStore';

export const PHOTO_LABELS = ['Front', 'Back', 'Side', 'Close-up'];
export const MAX_PHOTOS = 4;
export const MAX_SWATCHES = 6;

/** a slot is an already-saved picture (url) and/or a freshly chosen file */
export interface PhotoSlot { url: string; file: File | null }
export interface SwatchSlot { name: string; url: string; file: File | null }

export const emptyPhotoSlot = (): PhotoSlot => ({ url: '', file: null });
export const emptySwatchSlot = (): SwatchSlot => ({ name: '', url: '', file: null });

export const photoSlotsFrom = (urls?: string[]): PhotoSlot[] => (urls && urls.length ? urls.map(u => ({ url: u, file: null })) : [emptyPhotoSlot()]);
export const swatchSlotsFrom = (sw?: Swatch[]): SwatchSlot[] => (sw && sw.length ? sw.map(x => ({ name: x.name || '', url: x.photo || '', file: null })) : [emptySwatchSlot()]);

/**
 * Uploads the new files and returns the final list of urls.
 * The position is kept (Front, Back …) – an empty middle slot keeps its place as ''.
 */
export async function resolvePhotoSlots(slots: PhotoSlot[]): Promise<{ urls: string[]; failed: number }> {
  const urls: string[] = [];
  let failed = 0;
  for (const s of slots) {
    if (s.file) {
      try { urls.push(await uploadPhoto(s.file, 'models')); } catch { failed++; urls.push(s.url || ''); }
    } else urls.push(s.url || '');
  }
  while (urls.length && !urls[urls.length - 1]) urls.pop();
  return { urls, failed };
}

export async function resolveSwatchSlots(slots: SwatchSlot[]): Promise<{ swatches: Swatch[]; failed: number }> {
  const out: Swatch[] = [];
  let failed = 0;
  for (const s of slots) {
    let photo = s.url || '';
    if (s.file) { try { photo = await uploadPhoto(s.file, 'swatches'); } catch { failed++; } }
    const name = s.name.trim();
    if (photo || name) out.push({ name, photo: photo || undefined });
  }
  return { swatches: out, failed };
}
