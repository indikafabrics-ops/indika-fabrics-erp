import { useEffect, useState } from 'react';
import { styles } from './ui';

export interface ZoomItem { src: string; label?: string }

/** full-screen viewer: + / − / mouse wheel / double-click zoom, drag-scroll to pan, ◀ ▶ to go through all photos and colour squares */
export default function ZoomViewer({ items, start = 0, onClose }: { items: ZoomItem[]; start?: number; onClose: () => void }) {
  const [i, setI] = useState(Math.min(Math.max(0, start), Math.max(0, items.length - 1)));
  const [z, setZ] = useState(1);
  const go = (d: number) => { setI(p => (p + d + items.length) % items.length); setZ(1); };
  const zoom = (d: number) => setZ(p => Math.min(5, Math.max(1, +(p + d).toFixed(2))));
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); if (e.key === '+') zoom(0.5); if (e.key === '-') zoom(-0.5); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);
  if (!items.length) return null;
  const it = items[i];
  const btn = { ...styles.secondaryBtn, padding: '6px 12px', fontSize: '15px' } as const;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.92)', zIndex: 2000, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '10px', color: 'white', flexWrap: 'wrap' }}>
        <b style={{ flex: 1, minWidth: 120 }}>{it.label || 'Photo'} ({i + 1}/{items.length})</b>
        <button type="button" aria-label="Zoom out" style={btn} onClick={() => zoom(-0.5)}>−</button>
        <span style={{ minWidth: 44, textAlign: 'center' }}>{Math.round(z * 100)}%</span>
        <button type="button" aria-label="Zoom in" style={btn} onClick={() => zoom(0.5)}>+</button>
        <button type="button" style={btn} onClick={() => setZ(1)}>Reset</button>
        <button type="button" style={{ ...btn, background: '#fee2e2', color: '#b91c1c' }} onClick={onClose}>✕ Close</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', position: 'relative', WebkitOverflowScrolling: 'touch' }}
        onWheel={e => { if (e.ctrlKey || true) { e.preventDefault(); zoom(e.deltaY < 0 ? 0.25 : -0.25); } }}>
        <img src={it.src} alt={it.label || 'Photo'} onDoubleClick={() => setZ(z > 1 ? 1 : 2.5)} style={{ display: 'block', margin: '0 auto', width: `${z * 100}%`, maxWidth: z === 1 ? '100%' : 'none', maxHeight: z === 1 ? 'calc(100vh - 70px)' : 'none', objectFit: 'contain', cursor: z > 1 ? 'zoom-out' : 'zoom-in' }} />
        {items.length > 1 && <>
          <button type="button" aria-label="Previous" onClick={() => go(-1)} style={{ ...btn, position: 'fixed', left: 8, top: '50%', fontSize: '22px' }}>◀</button>
          <button type="button" aria-label="Next" onClick={() => go(1)} style={{ ...btn, position: 'fixed', right: 8, top: '50%', fontSize: '22px' }}>▶</button>
        </>}
      </div>
    </div>
  );
}
