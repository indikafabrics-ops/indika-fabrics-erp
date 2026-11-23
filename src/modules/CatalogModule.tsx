import { useEffect, useState } from 'react';
import { fetchAll, errMsg } from '../lib/supabase';
import { r3, num, uniqueSorted } from '../lib/helpers';
import { ErrorBanner, Loading, styles } from '../components/ui';

export default function CatalogModule({ hideCostRate, hideStockQty }: { hideCostRate: boolean; hideStockQty: boolean }) {
  const [designs, setDesigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [color, setColor] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const rows = await fetchAll('pommys_fabric_stock', 'id,item_name,design_no,color,rate_per_meter,image_url,available_meters');
        // one card per Design + Color (latest purchase wins for photo / rate)
        const map = new Map<string, any>();
        rows.forEach(r => {
          const key = `${String(r.design_no || '-').toLowerCase()}|${String(r.color || '-').toLowerCase()}|${String(r.item_name || '').toLowerCase()}`;
          const cur = map.get(key);
          map.set(key, {
            item_name: r.item_name, design_no: r.design_no, color: r.color,
            rate_per_meter: r.rate_per_meter || cur?.rate_per_meter,
            image_url: r.image_url || cur?.image_url,
            available: (cur?.available || 0) + num(r.available_meters)
          });
        });
        setDesigns(Array.from(map.values()).reverse());
      } catch (err: any) {
        setError('Catalog load தோல்வி: ' + errMsg(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const colors = uniqueSorted(designs.map(d => d.color));
  const q = search.trim().toLowerCase();
  const shown = designs.filter(d => {
    if (color && d.color !== color) return false;
    if (inStockOnly && d.available <= 0.01) return false;
    if (q && !`${d.design_no} ${d.item_name} ${d.color}`.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <div style={styles.card}>
      <h4 style={{ margin: '0 0 14px 0', color: '#0f172a' }}>📒 Pommys Design Catalog</h4>
      {error && <div style={{ marginBottom: '12px' }}><ErrorBanner message={error} /></div>}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
        <input type="text" placeholder="🔍 Design / Item தேடுக..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...styles.input, maxWidth: '260px' }} />
        <select value={color} onChange={e => setColor(e.target.value)} style={{ ...styles.input, maxWidth: '180px' }}>
          <option value="">All Colors</option>
          {colors.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 'bold', color: '#475569', cursor: 'pointer' }}>
          <input type="checkbox" checked={inStockOnly} onChange={e => setInStockOnly(e.target.checked)} /> In Stock மட்டும்
        </label>
        <span style={{ fontSize: '12px', color: '#64748b' }}>{shown.length} Design(s)</span>
      </div>
      {loading ? <Loading /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '14px' }}>
          {shown.length === 0 ? <p style={{ color: '#64748b' }}>Catalog-ல் Design எதுவும் இல்லை.</p> : shown.map((d, i) => (
            <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', background: '#f8fafc' }}>
              {d.image_url ? (
                <img src={d.image_url} alt={d.design_no || 'Design'} loading="lazy" style={{ width: '100%', height: '160px', objectFit: 'cover', borderRadius: '6px', marginBottom: '10px' }} />
              ) : (
                <div style={{ height: '160px', background: '#e2e8f0', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px', color: '#64748b', fontSize: '12px' }}>No Image</div>
              )}
              <div style={{ fontWeight: 'bold', color: '#0f172a' }}>Design: {d.design_no || '-'}</div>
              <div style={{ fontSize: '12px', color: '#475569' }}>Item: {d.item_name || '-'}{d.color && d.color !== '-' ? ` | Color: ${d.color}` : ''}</div>
              <div style={{ fontSize: '12px', marginTop: '4px', fontWeight: 'bold', color: d.available > 0.01 ? '#059669' : '#dc2626' }}>
                {d.available > 0.01 ? (hideStockQty ? '✅ In Stock' : `✅ ${r3(d.available)} M available`) : '❌ Out of Stock'}
              </div>
              {!hideCostRate && <div style={{ fontSize: '13px', color: '#0369a1', fontWeight: 'bold', marginTop: '6px' }}>Fabric Rate: ₹{d.rate_per_meter || 0}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
