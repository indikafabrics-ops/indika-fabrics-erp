import { sortSizes, type SizeMap } from '../lib/sizeLedger';
import { styles } from './ui';

/** one small box per size: "M (20)  [ 5 ]" – blank box = nothing */
export default function SizeQty({ avail, value, onChange, placeholder = '0', tone = '#0f172a' }: {
  avail: SizeMap; value: Record<string, string>; onChange: (v: Record<string, string>) => void; placeholder?: string; tone?: string;
}) {
  const keys = Object.keys(avail).sort(sortSizes);
  if (keys.length === 0) return <span style={{ fontSize: '12px', color: '#64748b' }}>—</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
      {keys.map(k => (
        <label key={k} style={{ display: 'flex', flexDirection: 'column', fontSize: '10px', color: tone, fontWeight: 'bold', width: '58px' }}>
          {k} <span style={{ color: '#64748b', fontWeight: 'normal' }}>({avail[k]})</span>
          <input type="number" min="0" max={avail[k]} step="1" placeholder={placeholder} value={value[k] || ''}
            onChange={e => onChange({ ...value, [k]: e.target.value })} style={{ ...styles.tblInput, padding: '5px 4px' }} />
        </label>
      ))}
    </div>
  );
}
