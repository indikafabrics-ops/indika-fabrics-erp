import { useEffect, useMemo, useState } from 'react';
import { styles, notify } from './ui';
import { errMsg } from '../lib/supabase';
import { PHOTO_LABELS, MAX_PHOTOS, MAX_SWATCHES, emptyPhotoSlot, emptySwatchSlot, photoSlotsFrom, swatchSlotsFrom, resolvePhotoSlots, resolveSwatchSlots, type PhotoSlot, type SwatchSlot } from '../lib/gallery';
import { loadDesignMaster, saveDesignInfo, designLookup, type Swatch } from '../lib/masterStore';
import { supabase } from '../lib/supabase';
import { catalogKey, uploadCatalogPhoto, listCatalogPhotos } from '../lib/image';
import { loadModelPhotos } from '../lib/batchMeta';

const useUrl = (file: File | null) => {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
};

const PHOTO_BOX = 78;

function PhotoBox({ slot, label, onChange, onRemove }: { slot: PhotoSlot; label: string; onChange: (s: PhotoSlot) => void; onRemove?: () => void }) {
  const preview = useUrl(slot.file) || slot.url;
  return (
    <div style={{ width: PHOTO_BOX + 8, textAlign: 'center' }}>
      <label title={`${label} Photo`} style={{ display: 'block', cursor: 'pointer' }}>
        <div style={{ width: PHOTO_BOX, height: PHOTO_BOX, margin: '0 auto', borderRadius: '8px', border: '1px dashed #94a3b8', background: '#f1f5f9', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
          {preview ? <img src={preview} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '📷'}
        </div>
        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files && e.target.files[0]; if (f) onChange({ url: slot.url, file: f }); e.target.value = ''; }} />
      </label>
      <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', marginTop: '3px' }}>{label}</div>
      {onRemove && (preview || true) && <button type="button" onClick={onRemove} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '11px', cursor: 'pointer' }}>✕ நீக்கு</button>}
    </div>
  );
}

/** product photos: starts with 1 box, "+ Add Photo" adds Back, Side, Close-up (max 4) */
export function PhotoSlots({ slots, onChange }: { slots: PhotoSlot[]; onChange: (s: PhotoSlot[]) => void }) {
  const list = slots.length ? slots : [emptyPhotoSlot()];
  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {list.map((s, i) => (
          <PhotoBox key={i} slot={s} label={PHOTO_LABELS[i] || `Photo ${i + 1}`}
            onChange={v => onChange(list.map((x, j) => (j === i ? v : x)))}
            onRemove={list.length > 1 || s.file || s.url ? () => onChange(list.length > 1 ? list.filter((_, j) => j !== i) : [emptyPhotoSlot()]) : undefined} />
        ))}
        {list.length < MAX_PHOTOS && (
          <button type="button" onClick={() => onChange([...list, emptyPhotoSlot()])} style={{ ...styles.secondaryBtn, alignSelf: 'center', fontSize: '12px' }}>+ Add Photo ({PHOTO_LABELS[list.length]})</button>
        )}
      </div>
    </div>
  );
}

function SwatchBox({ slot, onChange, onRemove }: { slot: SwatchSlot; onChange: (s: SwatchSlot) => void; onRemove: () => void }) {
  const preview = useUrl(slot.file) || slot.url;
  return (
    <div style={{ width: 92, textAlign: 'center' }}>
      <label style={{ display: 'block', cursor: 'pointer' }} title="Fabric Photo">
        <div style={{ width: 64, height: 64, margin: '0 auto', borderRadius: '6px', border: '2px solid #cbd5e1', background: '#f8fafc', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold', color: '#334155', padding: '2px', wordBreak: 'break-word' }}>
          {preview ? <img src={preview} alt={slot.name || 'Colour'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (slot.name || '🎨')}
        </div>
        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files && e.target.files[0]; if (f) onChange({ ...slot, file: f }); e.target.value = ''; }} />
      </label>
      <input type="text" placeholder="Colour பெயர்" value={slot.name} onChange={e => onChange({ ...slot, name: e.target.value })} style={{ ...styles.tblInput, width: '90px', marginTop: '4px', fontSize: '11px' }} />
      <button type="button" onClick={onRemove} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '11px', cursor: 'pointer' }}>✕ நீக்கு</button>
    </div>
  );
}

/** colour squares: starts with 1, "+ Add Colour" up to 6; photo OR written name (or both) */
export function SwatchSlots({ slots, onChange }: { slots: SwatchSlot[]; onChange: (s: SwatchSlot[]) => void }) {
  const list = slots.length ? slots : [emptySwatchSlot()];
  return (
    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {list.map((s, i) => (
        <SwatchBox key={i} slot={s} onChange={v => onChange(list.map((x, j) => (j === i ? v : x)))} onRemove={() => onChange(list.length > 1 ? list.filter((_, j) => j !== i) : [emptySwatchSlot()])} />
      ))}
      {list.length < MAX_SWATCHES && (
        <div style={{ alignSelf: 'center', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <button type="button" onClick={() => onChange([...list, emptySwatchSlot()])} style={{ ...styles.secondaryBtn, fontSize: '12px' }}>+ Add Colour ({list.length}/{MAX_SWATCHES})</button>
          <button type="button" onClick={() => onChange([...list.filter(x => x.name || x.url || x.file), { ...emptySwatchSlot(), name: 'Assorted' }].slice(0, MAX_SWATCHES))} style={{ ...styles.secondaryBtn, fontSize: '11px' }}>Assorted</button>
        </div>
      )}
    </div>
  );
}

/** read-only colour squares (Catalog / Godown) */
export function SwatchChips({ swatches, size = 30, onZoom }: { swatches?: Swatch[]; size?: number; onZoom?: (i: number) => void }) {
  if (!swatches || swatches.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      {swatches.map((s, i) => (
        <div key={i} title={s.name || 'Colour'} onClick={onZoom ? () => onZoom(i) : undefined} style={{ cursor: onZoom ? 'zoom-in' : undefined, width: size, height: size, borderRadius: '4px', border: '1px solid #cbd5e1', overflow: 'hidden', background: '#f1f5f9', fontSize: Math.max(8, size / 4), fontWeight: 'bold', color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', lineHeight: 1.05, wordBreak: 'break-word' }}>
          {s.photo ? <img src={s.photo} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : s.name}
        </div>
      ))}
    </div>
  );
}

/** pop-up to add / change photos and colour squares of any Model + Design (Godown, Catalog …) */
export function GalleryEditor({ model, design, onClose, onSaved }: { model: string; design: string; onClose: () => void; onSaved?: () => void }) {
  const [photos, setPhotos] = useState<PhotoSlot[]>([emptyPhotoSlot()]);
  const [swatches, setSwatches] = useState<SwatchSlot[]>([emptySwatchSlot()]);
  const [busy, setBusy] = useState(false);
  const [mainUrl, setMainUrl] = useState('');
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [mainGone, setMainGone] = useState(false);
  const mainPreview = useUrl(mainFile) || (mainGone ? '' : mainUrl);
  useEffect(() => {
    loadDesignMaster().then(async m => {
      const info = designLookup(m)(model, design);
      setPhotos(photoSlotsFrom(info?.photos));
      setSwatches(swatchSlotsFrom(info?.swatches));
      if (!info?.hideMain) { try { setMainUrl((await loadModelPhotos()).photoOf(model, design, '-')); } catch { /* optional */ } }
    }).catch(() => undefined);
  }, [model, design]);

  const save = async () => {
    setBusy(true);
    try {
      const p = await resolvePhotoSlots(photos);
      const s = await resolveSwatchSlots(swatches);
      let hideMain: boolean | undefined;
      if (mainFile) { await uploadCatalogPhoto(model, design, mainFile); hideMain = false; }
      else if (mainGone && mainUrl) {
        hideMain = true;
        try { if ((await listCatalogPhotos()).has(catalogKey(model, design))) await supabase.storage.from('assets').remove([`catalog/${catalogKey(model, design)}.jpg`]); } catch { /* the photo is hidden anyway */ }
      }
      await saveDesignInfo([{ model, design, photos: p.urls, swatches: s.swatches, ...(hideMain !== undefined ? { hideMain } : {}) }], { replaceMedia: true });
      notify(`✅ ${model} / ${design} Photo & Colour சேமிக்கப்பட்டது.${p.failed + s.failed ? ` (${p.failed + s.failed} படம் ஏறவில்லை)` : ''}`, p.failed + s.failed ? 'warn' : 'ok');
      onSaved?.();
      onClose();
    } catch (err: any) {
      notify('சேமிக்க முடியவில்லை: ' + errMsg(err), 'err');
    } finally { setBusy(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.75)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '14px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '12px', width: '100%', maxWidth: '640px', maxHeight: '92vh', overflow: 'auto', padding: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <b style={{ color: '#0f172a' }}>🖼️ {model} / {design} — Photos & Colours</b>
          <button type="button" onClick={onClose} style={{ background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: '6px', padding: '6px 12px', fontWeight: 'bold', cursor: 'pointer' }}>← Back</button>
        </div>
        <label style={styles.label}>Main Photo (Catalog முகப்புப் படம்)</label>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ width: 78, height: 78, borderRadius: 8, border: '1px dashed #94a3b8', background: '#f1f5f9', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{mainPreview ? <img src={mainPreview} alt="Main" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '📷'}</div>
          <label style={{ ...styles.secondaryBtn, cursor: 'pointer' }}>🔄 {mainPreview ? 'மாற்று' : 'சேர்'}<input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files && e.target.files[0]; if (f) { setMainFile(f); setMainGone(false); } e.target.value = ''; }} /></label>
          {mainPreview && <button type="button" style={styles.dangerBtn} onClick={() => { setMainFile(null); setMainGone(true); }}>🗑️ நீக்கு</button>}
        </div>
        <label style={styles.label}>Product Photos (Front / Back / Side / Close-up — முதலில் 1, தேவையானால் + Add)</label>
        <PhotoSlots slots={photos} onChange={setPhotos} />
        <label style={{ ...styles.label, marginTop: '16px' }}>Colour Squares (அதிகபட்சம் 6 — Fabric Photo அல்லது Colour பெயர்)</label>
        <SwatchSlots slots={swatches} onChange={setSwatches} />
        <button type="button" disabled={busy} onClick={save} style={{ ...styles.primaryBtn, width: '100%', marginTop: '16px' }}>{busy ? 'Saving...' : '💾 Save'}</button>
      </div>
    </div>
  );
}
