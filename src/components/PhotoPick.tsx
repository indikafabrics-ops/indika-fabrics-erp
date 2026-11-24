import { useEffect, useMemo } from 'react';
import { styles } from './ui';

/** Camera / gallery photo picker with a small preview. */
export default function PhotoPick({ file, onChange, label, size = 64 }: { file: File | null; onChange: (f: File | null) => void; label: string; size?: number }) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      {url ? (
        <img src={url} alt="Photo" style={{ width: size, height: size, objectFit: 'cover', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
      ) : (
        <div style={{ width: size, height: size, borderRadius: '8px', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>📷</div>
      )}
      <label style={{ ...styles.secondaryBtn, cursor: 'pointer', fontSize: '12px', display: 'inline-block' }}>
        {file ? '🔄 மாற்று' : label}
        <input type="file" accept="image/*" onChange={e => onChange(e.target.files && e.target.files[0] ? e.target.files[0] : null)} style={{ display: 'none' }} />
      </label>
      {file && <button type="button" onClick={() => onChange(null)} style={{ background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>}
    </div>
  );
}
