import { useEffect, useState } from 'react';
import { fetchAll } from '../lib/supabase';
import { money, num, r3 } from '../lib/helpers';
import { Field, styles } from '../components/ui';

export default function CostingModule() {
  const [stock, setStock] = useState<any[]>([]);
  const [stockId, setStockId] = useState('');
  const [fabricRate, setFabricRate] = useState('');
  const [consumption, setConsumption] = useState('');
  const [stitching, setStitching] = useState('55');
  const [trims, setTrims] = useState('15');
  const [packing, setPacking] = useState('0');
  const [wholesaleMargin, setWholesaleMargin] = useState('25');
  const [retailMargin, setRetailMargin] = useState('50');

  useEffect(() => {
    fetchAll('pommys_fabric_stock', 'id,item_name,design_no,color,rate_per_meter,gst_percentage')
      .then(rows => setStock(rows.filter(r => num(r.rate_per_meter) > 0).reverse()))
      .catch(() => setStock([]));
  }, []);

  const pick = (id: string) => {
    setStockId(id);
    const s = stock.find(x => String(x.id) === String(id));
    if (s) setFabricRate(String(s.rate_per_meter));
  };

  const fabricCost = num(fabricRate) * num(consumption);
  const totalCost = fabricCost + num(stitching) + num(trims) + num(packing);
  const wholesale = totalCost + (totalCost * num(wholesaleMargin)) / 100;
  const retail = totalCost + (totalCost * num(retailMargin)) / 100;

  const num_ = (value: string, set: (v: string) => void, extra: any = {}) => (
    <input type="number" min="0" step="any" value={value} onChange={e => set(e.target.value)} style={styles.input} {...extra} />
  );

  return (
    <div style={styles.card}>
      <h4 style={{ margin: '0 0 16px 0', color: '#0f172a' }}>🧮 Garment Costing & Rate Fixer</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        <div style={{ gridColumn: 'span 2' }}>
          <Field label="Fabric (Stock-ல் இருந்து Rate எடுக்க)">
            <select value={stockId} onChange={e => pick(e.target.value)} style={styles.input}>
              <option value="">-- Select Fabric (Optional) --</option>
              {stock.map(s => <option key={s.id} value={s.id}>{s.item_name} | {s.design_no}{s.color && s.color !== '-' ? ` (${s.color})` : ''} — ₹{s.rate_per_meter}/M</option>)}
            </select>
          </Field>
        </div>
        <Field label="Fabric Rate / Meter (₹)">{num_(fabricRate, setFabricRate)}</Field>
        <Field label="Consumption (Meter / Pc)">{num_(consumption, setConsumption)}</Field>
        <Field label="Stitching / Jobwork (₹)">{num_(stitching, setStitching)}</Field>
        <Field label="Trims (₹)">{num_(trims, setTrims)}</Field>
        <Field label="Packing / Other (₹)">{num_(packing, setPacking)}</Field>
        <Field label="Wholesale Margin (%)">{num_(wholesaleMargin, setWholesaleMargin)}</Field>
        <Field label="Retail Margin (%)">{num_(retailMargin, setRetailMargin)}</Field>
      </div>
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '16px', borderRadius: '8px', display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '14px' }}>
        <div><strong>Fabric Cost / Pc:</strong> ₹ {money(fabricCost)}{num(consumption) > 0 ? ` (${r3(num(consumption))} M)` : ''}</div>
        <div><strong>Net Cost / Pc:</strong> ₹ {money(totalCost)}</div>
        <div><strong style={{ color: '#059669' }}>Wholesale Rate: ₹ {money(wholesale)}</strong></div>
        <div><strong style={{ color: '#2563eb' }}>Retail Rate: ₹ {money(retail)}</strong></div>
      </div>
    </div>
  );
}
