import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

// ---------- Shared styles ----------
export const styles = {
  card: { background: 'white', padding: '18px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.03)', minWidth: 0, boxSizing: 'border-box' as const },
  input: { padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', width: '100%', boxSizing: 'border-box' as const, outline: 'none' },
  tblInput: { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', width: '100%', boxSizing: 'border-box' as const, outline: 'none' },
  label: { display: 'block', fontSize: '12px', color: '#475569', marginBottom: '6px', fontWeight: 'bold' as const },
  primaryBtn: { background: '#2563eb', color: 'white', padding: '10px 18px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' as const, fontSize: '13px' },
  successBtn: { background: '#059669', color: 'white', padding: '12px 22px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' as const, fontSize: '14px' },
  secondaryBtn: { background: '#e2e8f0', color: '#475569', padding: '9px 14px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' as const, fontSize: '13px' },
  dangerBtn: { background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' as const, fontSize: '12px' },
  logoutBtn: { background: 'transparent', color: '#f87171', border: '1px solid #f87171', padding: '9px', borderRadius: '6px', width: '100%', cursor: 'pointer', fontWeight: 'bold' as const },
  menuItem: (isActive: boolean): CSSProperties => ({ padding: '12px 18px', cursor: 'pointer', color: isActive ? 'white' : '#94a3b8', background: isActive ? '#1e293b' : 'transparent', borderLeft: isActive ? '4px solid #dc2626' : '4px solid transparent', fontWeight: isActive ? 'bold' : 'normal', fontSize: '14px' }),
  thSub: { padding: '10px 8px', fontWeight: 'normal' as const, fontSize: '12px', borderRight: '1px solid #334155', whiteSpace: 'nowrap' as const },
  td: { padding: '8px', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', fontSize: '13px' }
};

// ---------- Toast messages (replaces blocking alert() popups) ----------
type ToastKind = 'ok' | 'err' | 'info' | 'warn';
interface ToastItem { id: number; message: string; kind: ToastKind }

let toastSeq = 0;
const toastListeners = new Set<(t: ToastItem) => void>();

export function notify(message: string, kind: ToastKind = 'ok') {
  const t: ToastItem = { id: ++toastSeq, message, kind };
  toastListeners.forEach(l => l(t));
}

const TOAST_COLORS: Record<ToastKind, { bg: string; border: string; color: string }> = {
  ok: { bg: '#ecfdf5', border: '#6ee7b7', color: '#065f46' },
  err: { bg: '#fef2f2', border: '#fca5a5', color: '#991b1b' },
  info: { bg: '#eff6ff', border: '#93c5fd', color: '#1e40af' },
  warn: { bg: '#fffbeb', border: '#fcd34d', color: '#92400e' }
};

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const listener = (t: ToastItem) => {
      setItems(prev => [...prev.slice(-3), t]);
      setTimeout(() => setItems(prev => prev.filter(x => x.id !== t.id)), t.kind === 'err' ? 9000 : 4500);
    };
    toastListeners.add(listener);
    return () => {
      toastListeners.delete(listener);
    };
  }, []);

  if (items.length === 0) return null;
  return (
    <div style={{ position: 'fixed', top: 'max(12px, env(safe-area-inset-top))', left: '50%', transform: 'translateX(-50%)', zIndex: 3000, display: 'flex', flexDirection: 'column', gap: '8px', width: 'min(520px, 94vw)' }}>
      {items.map(t => {
        const c = TOAST_COLORS[t.kind];
        return (
          <div
            key={t.id}
            role="status"
            onClick={() => setItems(prev => prev.filter(x => x.id !== t.id))}
            style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.color, padding: '11px 14px', borderRadius: '10px', fontSize: '13px', fontWeight: 'bold', boxShadow: '0 8px 20px rgba(0,0,0,0.12)', cursor: 'pointer', animation: 'toastIn 0.2s ease-out', lineHeight: 1.4 }}
          >
            {t.message}
          </div>
        );
      })}
    </div>
  );
}

// ---------- Select with "+ New" option ----------
interface SelectNewProps {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  newLabel?: string;
  style?: CSSProperties;
  disabled?: boolean;
  required?: boolean;
}

/**
 * Dropdown of existing values. Choose "+ New" to type a brand-new value;
 * the "▾" button goes back to the list. Typing is only needed for NEW values.
 */
export function SelectNew({ value, onChange, options, placeholder = '-- Select --', newLabel = '+ Add New', style, disabled, required }: SelectNewProps) {
  const [forceNew, setForceNew] = useState(false);
  const inList = value !== '' && options.includes(value);
  const showInput = forceNew || (value !== '' && !inList);
  const base: CSSProperties = style || styles.input;

  if (showInput) {
    return (
      <div style={{ display: 'flex', gap: '4px', alignItems: 'stretch' }}>
        <input
          type="text"
          autoFocus={forceNew}
          value={value}
          placeholder={newLabel.replace('+ ', '')}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          required={required}
          style={{ ...base, borderColor: '#3b82f6', flex: 1, minWidth: 0 }}
        />
        <button
          type="button"
          title="List-ல் இருந்து தேர்வு செய்ய"
          onClick={() => { setForceNew(false); onChange(''); }}
          style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: '4px', padding: '0 8px', cursor: 'pointer', fontWeight: 'bold', flexShrink: 0 }}
        >
          ▾
        </button>
      </div>
    );
  }

  return (
    <select
      value={inList ? value : ''}
      disabled={disabled}
      required={required}
      onChange={e => {
        if (e.target.value === '__NEW__') {
          setForceNew(true);
          onChange('');
        } else {
          onChange(e.target.value);
        }
      }}
      style={base}
    >
      <option value="">{placeholder}</option>
      {options.map(o => (
        <option key={o} value={o}>{o}</option>
      ))}
      <option value="__NEW__">{newLabel}</option>
    </select>
  );
}

// ---------- Small building blocks ----------
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label style={styles.label}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>{hint}</div>}
    </div>
  );
}

export function StatCard({ label, value, color, sub, onClick }: { label: string; value: ReactNode; color: string; sub?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{ ...styles.card, borderTop: `4px solid ${color}`, cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold', marginBottom: '8px' }}>{label}</div>
      <div style={{ fontSize: '25px', fontWeight: 'bold', color: '#0f172a' }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color, marginTop: '8px', fontWeight: 'bold' }}>{sub}</div>}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', padding: '12px 14px', borderRadius: '8px', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
      <span>⚠️ {message}</span>
      {onRetry && <button type="button" onClick={onRetry} style={styles.dangerBtn}>↻ Retry</button>}
    </div>
  );
}

export function Loading({ text = 'Loading...' }: { text?: string }) {
  return <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>⏳ {text}</div>;
}

export function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', padding: '20px', borderRadius: '10px', textAlign: 'center', maxWidth: '500px', width: '100%' }}>
        {children}
      </div>
    </div>
  );
}

export function ImagePreview({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <h4 style={{ margin: '0 0 15px 0' }}>Bill / Design Preview</h4>
      <img src={src} alt="Preview" style={{ width: '100%', maxHeight: '350px', objectFit: 'contain', borderRadius: '6px', marginBottom: '15px' }} />
      <button type="button" onClick={onClose} style={styles.primaryBtn}>Close</button>
    </Modal>
  );
}

export function TableWrap({ children, minWidth }: { children: ReactNode; minWidth: number }) {
  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', minWidth: `${minWidth}px`, borderCollapse: 'collapse', textAlign: 'left', background: 'white' }}>
        {children}
      </table>
    </div>
  );
}

export function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return (
    <tr>
      <td colSpan={cols} style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>{text}</td>
    </tr>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h4 style={{ margin: '0 0 14px 0', color: '#0f172a' }}>{children}</h4>;
}
