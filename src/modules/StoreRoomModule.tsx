import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase, fetchAll, errMsg } from '../lib/supabase';
import { TRIM_UNITS } from '../lib/constants';
import { num, uniqueSorted } from '../lib/helpers';
import ShareBar from '../components/ShareBar';
import { EmptyRow, ErrorBanner, Loading, SelectNew, TableWrap, notify, styles } from '../components/ui';

export default function StoreRoomModule() {
  const [trims, setTrims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [itemName, setItemName] = useState('');
  const [unit, setUnit] = useState('Mtr');
  const [qty, setQty] = useState('');
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN');
  const [minLevel, setMinLevel] = useState('20');
  const [saving, setSaving] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const load = useCallback(async () => {
    setError('');
    try {
      const rows = await fetchAll('pommys_store_trims', '*');
      rows.sort((a, b) => String(a.item_name).localeCompare(String(b.item_name)));
      setTrims(rows);
    } catch (err: any) {
      setError('Trims load தோல்வி (pommys_store_trims table இருக்கிறதா?): ' + errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const existing = trims.find(t => String(t.item_name).trim().toLowerCase() === itemName.trim().toLowerCase());

  const handleItemChange = (v: string) => {
    setItemName(v);
    const found = trims.find(t => t.item_name === v);
    if (found) setUnit(found.unit || 'Mtr');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const name = itemName.trim();
    const q = num(qty);
    if (!name) return notify('Trim / Accessory தேர்வு செய்யவும்.', 'err');
    if (q <= 0) return notify('Quantity 0-ஐ விடப் பெரிதாக இருக்க வேண்டும்.', 'err');

    setSaving(true);
    try {
      if (existing) {
        const { data: cur, error: curErr } = await supabase.from('pommys_store_trims').select('qty').eq('id', existing.id).limit(1);
        if (curErr || !cur || !cur[0]) throw curErr || new Error('Item கிடைக்கவில்லை');
        const newQty = direction === 'IN' ? num(cur[0].qty) + q : num(cur[0].qty) - q;
        if (newQty < 0) throw new Error(`Stock-ல் ${num(cur[0].qty)} ${existing.unit} மட்டுமே உள்ளது.`);
        const { error: updErr } = await supabase.from('pommys_store_trims').update({ qty: newQty }).eq('id', existing.id);
        if (updErr) throw updErr;
        notify(`✅ ${name}: ${direction === 'IN' ? '+' : '-'}${q} ${existing.unit} → மீதம் ${newQty}`);
      } else {
        if (direction === 'OUT') throw new Error('இந்த Item Stock-ல் இல்லை. முதலில் "IN" ஆகச் சேர்க்கவும்.');
        const { error: insErr } = await supabase.from('pommys_store_trims').insert([{ item_name: name, unit, qty: q, reorder_level: num(minLevel) || 20 }]);
        if (insErr) throw insErr;
        notify(`✅ புதிய Item "${name}" சேர்க்கப்பட்டது.`);
      }
      setItemName('');
      setQty('');
      setFormKey(k => k + 1);
      await load();
    } catch (err: any) {
      notify(errMsg(err), 'err');
    } finally {
      setSaving(false);
    }
  };

  const saveMin = async (row: any, value: string) => {
    const v = num(value);
    if (v === num(row.reorder_level)) return;
    const { error: updErr } = await supabase.from('pommys_store_trims').update({ reorder_level: v }).eq('id', row.id);
    if (updErr) notify('Min level save தோல்வி: ' + errMsg(updErr), 'err');
    else { notify('Min Level புதுப்பிக்கப்பட்டது.', 'info'); load(); }
  };

  const lowCount = trims.filter(t => num(t.qty) <= num(t.reorder_level ?? 20)).length;

  return (
    <div style={styles.card}>
      <h4 style={{ margin: '0 0 16px 0', color: '#0f172a' }}>🏪 Store Room, Trims & Accessories</h4>
      {error && <div style={{ marginBottom: '14px' }}><ErrorBanner message={error} onRetry={load} /></div>}

      <form key={formKey} onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '20px', alignItems: 'end' }}>
        <div>
          <label style={styles.label}>Trim / Accessory</label>
          <SelectNew value={itemName} onChange={handleItemChange} options={uniqueSorted(trims.map(t => t.item_name))} placeholder="-- Select Item --" newLabel="+ New Item" />
        </div>
        <div>
          <label style={styles.label}>IN / OUT</label>
          <select value={direction} onChange={e => setDirection(e.target.value as 'IN' | 'OUT')} style={styles.input}>
            <option value="IN">➕ IN (வாங்கியது)</option>
            <option value="OUT">➖ OUT (பயன்படுத்தியது)</option>
          </select>
        </div>
        <div>
          <label style={styles.label}>Unit</label>
          <select value={existing ? existing.unit : unit} onChange={e => setUnit(e.target.value)} disabled={!!existing} style={styles.input}>
            {TRIM_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <label style={styles.label}>Quantity</label>
          <input type="number" min="0" step="any" placeholder="Quantity" value={qty} onChange={e => setQty(e.target.value)} style={styles.input} />
        </div>
        {!existing && itemName.trim() && (
          <div>
            <label style={styles.label}>Min Level (Low alert)</label>
            <input type="number" min="0" value={minLevel} onChange={e => setMinLevel(e.target.value)} style={styles.input} />
          </div>
        )}
        <button type="submit" disabled={saving} style={{ ...styles.primaryBtn, background: direction === 'IN' ? '#059669' : '#d97706' }}>
          {saving ? 'Saving...' : direction === 'IN' ? '+ Add Stock' : '− Issue Stock'}
        </button>
      </form>

      {lowCount > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', marginBottom: '14px' }}>
          ⚠️ {lowCount} Item(s) குறைந்த Stock-ல் உள்ளன
        </div>
      )}

      {!loading && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
          <ShareBar doc={{ title: 'Store Room Trims', headers: ['Trim', 'Unit', 'Available', 'Min Level', 'Status'], rows: trims.map(t => [t.item_name, t.unit, num(t.qty), num(t.reorder_level ?? 20), num(t.qty) <= num(t.reorder_level ?? 20) ? 'LOW' : 'OK']), footer: [`குறைவான Stock: ${trims.filter(t => num(t.qty) <= num(t.reorder_level ?? 20)).length}`] }} />
        </div>
      )}
      {loading ? <Loading /> : (
        <TableWrap minWidth={560}>
          <thead>
            <tr style={{ background: '#0f172a', color: 'white' }}>
              <th style={styles.thSub}>Trim / Accessory</th>
              <th style={styles.thSub}>Unit</th>
              <th style={styles.thSub}>Available Qty</th>
              <th style={styles.thSub}>Min Level</th>
              <th style={styles.thSub}>Status</th>
            </tr>
          </thead>
          <tbody>
            {trims.length === 0 ? <EmptyRow cols={5} text="Trims Stock எதுவும் இல்லை" /> : trims.map(t => {
              const low = num(t.qty) <= num(t.reorder_level ?? 20);
              return (
                <tr key={t.id} style={{ borderBottom: '1px solid #e2e8f0', background: low ? '#fffbeb' : 'white' }}>
                  <td style={styles.td}><strong>{t.item_name}</strong></td>
                  <td style={styles.td}>{t.unit}</td>
                  <td style={{ ...styles.td, fontWeight: 'bold' }}>{t.qty}</td>
                  <td style={styles.td}>
                    <input type="number" min="0" defaultValue={t.reorder_level ?? 20} onBlur={e => saveMin(t, e.target.value)} style={{ ...styles.tblInput, width: '80px' }} />
                  </td>
                  <td style={styles.td}>{low ? '⚠️ Low Stock' : '✅ Sufficient'}</td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </div>
  );
}
