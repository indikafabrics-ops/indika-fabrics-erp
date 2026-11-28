import { useCallback, useEffect, useMemo, useState } from 'react';
import { errMsg } from '../lib/supabase';
import { num } from '../lib/helpers';
import { downloadCsv } from '../lib/helpers';
import { loadCtx, loadAllShowrooms, saveShopMap, sumLines, erpNameFor, type Ctx, type ShopBuilt, type SLine } from '../lib/showroomStock';
import { logAction } from '../lib/audit';
import ShareBar from '../components/ShareBar';
import { EmptyRow, ErrorBanner, Loading, TableWrap, notify, styles } from '../components/ui';

const money = (n: number) => Math.round(n).toLocaleString('en-IN');
const MAX_ROWS = 300;

/** One page for every showroom: Busy stock + ERP transfers, stock and value, no double counting */
export default function ShowroomStock() {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [data, setData] = useState<{ built: ShopBuilt[]; erpOnly: { name: string; lines: SLine[] }[] } | null>(null);
  const [error, setError] = useState('');
  const [sel, setSel] = useState('');
  const [q, setQ] = useState('');
  const [showMap, setShowMap] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try { const c = await loadCtx(); setCtx(c); setData(await loadAllShowrooms(c)); } catch (e: any) { setError('Load தோல்வி: ' + errMsg(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    return [
      ...data.built.map(b => ({ key: b.shop, name: b.shop, asOn: b.asOn, busy: sumLines(b.lines.filter(l => l.source === 'Busy')), erp: sumLines(b.lines.filter(l => l.source === 'ERP')), warn: b.unmatchedSales })),
      ...data.erpOnly.map(e => ({ key: 'erp:' + e.name, name: e.name + ' (ERP மட்டும்)', asOn: '-', busy: sumLines([]), erp: sumLines(e.lines), warn: 0 }))
    ];
  }, [data]);
  const grand = rows.reduce((a, r) => ({ pcs: a.pcs + r.busy.pcs + r.erp.pcs, cost: a.cost + r.busy.cost + r.erp.cost, mrp: a.mrp + r.busy.mrp + r.erp.mrp, noCost: a.noCost + r.busy.noCost + r.erp.noCost }), { pcs: 0, cost: 0, mrp: 0, noCost: 0 });

  const lines: SLine[] = useMemo(() => {
    if (!data || !sel) return [];
    if (sel.startsWith('erp:')) return data.erpOnly.find(e => 'erp:' + e.name === sel)?.lines || [];
    return data.built.find(b => b.shop === sel)?.lines || [];
  }, [data, sel]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return lines.filter(l => !t || `${l.item} ${l.design} ${l.colour} ${l.size} ${l.source}`.toLowerCase().includes(t)).sort((a, b) => (a.item + a.design).localeCompare(b.item + b.design) || a.size.localeCompare(b.size, undefined, { numeric: true }));
  }, [lines, q]);
  const shownSum = sumLines(shown);

  const saveMap = async (shop: string, erp: string) => {
    if (!ctx) return;
    try { const sm = { ...ctx.sm, map: { ...ctx.sm.map, [shop]: erp } }; await saveShopMap(sm); logAction(`Showroom இணைப்பு: ${shop} → ${erp || 'இல்லை'}`); notify('✅ இணைப்பு சேமிக்கப்பட்டது.', 'ok'); await load(); } catch (e: any) { notify(errMsg(e), 'err'); }
  };
  const toggleForce = async (id: string, on: boolean) => {
    if (!ctx) return;
    try { const force = { ...ctx.sm.force }; if (on) force[id] = true; else delete force[id]; await saveShopMap({ ...ctx.sm, force }); await load(); } catch (e: any) { notify(errMsg(e), 'err'); }
  };

  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!data || !ctx) return <Loading />;

  const cur = data.built.find(b => b.shop === sel);
  const early = cur && cur.erp ? ctx.transfers.filter(t => String(t.showroom_name || '').trim() === cur.erp && num(t.transferred_pieces) > 0 && String(t.transfer_date || '').slice(0, 10) <= cur.asOn).sort((a, b) => String(b.transfer_date).localeCompare(String(a.transfer_date))).slice(0, 25) : [];
  const forced = cur && cur.erp ? ctx.transfers.filter(t => ctx.sm.force[String(t.id)] && String(t.showroom_name || '').trim() === cur.erp) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
          <h4 style={{ margin: 0 }}>🏬 Showroom Stock — Busy + ERP (Stock & Value)</h4>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setShowMap(v => !v)} style={styles.secondaryBtn}>🔗 Busy கடை ↔ ERP Showroom</button>
            <ShareBar doc={{ title: 'Showroom Stock — கடை வாரி', subtitle: 'Busy Stock + ERP Transfer (Busy தேதிக்குப் பிறகு)', headers: ['கடை', 'As On', 'Busy Pcs', 'Busy Cost ₹', 'ERP Pcs', 'ERP Cost ₹', 'மொத்தம் Pcs', 'மொத்தம் Cost ₹', 'MRP மதிப்பு ₹', 'Cost இல்லாத Pcs'], rows: rows.map(r => [r.name, r.asOn, r.busy.pcs, Math.round(r.busy.cost), r.erp.pcs, Math.round(r.erp.cost), r.busy.pcs + r.erp.pcs, Math.round(r.busy.cost + r.erp.cost), Math.round(r.busy.mrp + r.erp.mrp), r.busy.noCost + r.erp.noCost]), footer: [`மொத்தம் ${grand.pcs} Pcs • Cost ₹${money(grand.cost)} • MRP ₹${money(grand.mrp)}`] }} />
          </div>
        </div>
        <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 8px 0' }}>Busy Cost = Sales Price −20% (இல்லையெனில் MRP × 50%). ERP Transfer, Busy "As On" தேதிக்குப் பிறகு (அல்லது "Busy-ல் இல்லை" என்று குறித்தவை) மட்டும் சேரும் — இரட்டிப்பாகாது.</p>
        {showMap && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, marginBottom: 10 }}>
            <div style={{ fontSize: '12px', color: '#475569', marginBottom: 6 }}>ஒவ்வொரு Busy கடைக்கும் அதற்குரிய ERP Showroom-ஐத் தேர்வு செய்யவும் (பெயர் ஒன்றாக இருந்தால் தானாகப் பொருந்தும்):</div>
            {data.built.map(b => (
              <div key={b.shop} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                <b style={{ minWidth: 150 }}>{b.shop}</b> →
                <select aria-label={`ERP Showroom for ${b.shop}`} value={erpNameFor(b.shop, ctx.sm.map, ctx.erpNames)} onChange={e => saveMap(b.shop, e.target.value)} style={{ ...styles.input, maxWidth: 240 }}>
                  <option value="">(இணைப்பு இல்லை)</option>
                  {ctx.erpNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
        <TableWrap minWidth={900}>
          <thead><tr style={{ background: '#0f172a', color: 'white' }}>{['கடை', 'Busy As On', 'Busy Pcs', 'Busy Cost ₹', 'ERP Pcs', 'ERP Cost ₹', 'மொத்தம் Pcs', 'மொத்தம் Cost ₹', 'MRP மதிப்பு ₹', 'Cost இல்லை', ''].map(h => <th key={h} style={styles.thSub}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 ? <EmptyRow cols={11} text="Busy Stock இன்னும் Upload செய்யப்படவில்லை." /> : rows.map(r => (
              <tr key={r.key} style={{ borderBottom: '1px solid #e2e8f0', background: sel === r.key ? '#eff6ff' : undefined }}>
                <td style={styles.td}><b>{r.name}</b></td><td style={styles.td}>{r.asOn}</td>
                <td style={styles.td}>{r.busy.pcs}</td><td style={styles.td}>₹{money(r.busy.cost)}</td>
                <td style={styles.td}>{r.erp.pcs}</td><td style={styles.td}>₹{money(r.erp.cost)}</td>
                <td style={{ ...styles.td, fontWeight: 'bold', color: '#059669' }}>{r.busy.pcs + r.erp.pcs}</td>
                <td style={{ ...styles.td, fontWeight: 'bold' }}>₹{money(r.busy.cost + r.erp.cost)}</td>
                <td style={styles.td}>₹{money(r.busy.mrp + r.erp.mrp)}</td>
                <td style={{ ...styles.td, color: r.busy.noCost + r.erp.noCost ? '#b45309' : '#64748b' }}>{r.busy.noCost + r.erp.noCost ? `⚠️ ${r.busy.noCost + r.erp.noCost} Pcs` : '-'}</td>
                <td style={styles.td}><button type="button" onClick={() => { setSel(r.key); setQ(''); }} style={{ ...styles.secondaryBtn, padding: '4px 10px', fontSize: '12px' }}>விவரம் →</button></td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr style={{ background: '#f1f5f9', fontWeight: 'bold' }}>
                <td style={styles.td}>மொத்தம் (எல்லா Showroom)</td><td style={styles.td}></td><td style={styles.td} colSpan={4}></td>
                <td style={styles.td}>{grand.pcs}</td><td style={styles.td}>₹{money(grand.cost)}</td><td style={styles.td}>₹{money(grand.mrp)}</td>
                <td style={styles.td}>{grand.noCost ? `⚠️ ${grand.noCost} Pcs` : '-'}</td><td style={styles.td}></td>
              </tr>
            )}
          </tbody>
        </TableWrap>
        {grand.noCost > 0 && <div style={{ fontSize: '12px', color: '#92400e', marginTop: 6 }}>⚠️ Cost இல்லாத Pcs (MRP, Sales Price இல்லை அல்லது ERP Costing இல்லை) மொத்தத்தில் சேரவில்லை.</div>}
      </div>

      {sel && (
        <div style={styles.card}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
            <h4 style={{ margin: 0 }}>📦 {rows.find(r => r.key === sel)?.name}</h4>
            <input placeholder="🔍 Item / Design / Colour / Size / Busy / ERP..." value={q} onChange={e => setQ(e.target.value)} style={{ ...styles.input, maxWidth: 280 }} />
            <span style={{ fontSize: 12, color: '#64748b' }}>{shown.length} வரிகள் • {shownSum.pcs} Pcs • Cost ₹{money(shownSum.cost)} • MRP ₹{money(shownSum.mrp)}</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button type="button" onClick={() => downloadCsv(`showroom-stock-${sel.replace(/[^a-z0-9]+/gi, '-')}.csv`, [['Source', 'Item', 'Design', 'Size', 'Colour', 'MRP', 'Price', 'Qty', 'Cost/Pc', 'Cost Value', 'MRP Value', 'Basis'], ...shown.map(l => [l.source, l.item, l.design, l.size, l.colour, l.mrp, l.price, l.qty, Math.round(l.unit * 100) / 100, Math.round(l.qty * l.unit), Math.round(l.qty * l.mrp), l.basis])])} style={styles.secondaryBtn}>⬇️ CSV</button>
              <ShareBar doc={{ title: `Showroom Stock — ${rows.find(r => r.key === sel)?.name}`, headers: ['Source', 'Item', 'Design', 'Size', 'Colour', 'MRP', 'Price', 'Qty', 'Cost ₹', 'MRP மதிப்பு ₹'], rows: shown.slice(0, 1500).map(l => [l.source, l.item, l.design, l.size, l.colour, l.mrp, l.price, l.qty, Math.round(l.qty * l.unit), Math.round(l.qty * l.mrp)]), footer: [`${shownSum.pcs} Pcs • Cost ₹${money(shownSum.cost)} • MRP ₹${money(shownSum.mrp)}${shown.length > 1500 ? ' • (முதல் 1500 வரிகள்)' : ''}`] }} />
            </div>
          </div>
          {cur && cur.unmatchedSales > 0 && <div style={{ fontSize: 12, color: '#92400e', marginBottom: 6 }}>ℹ️ {cur.unmatchedSales} Busy விற்பனை வரிகள் எந்த Stock வரியுடனும் பொருந்தவில்லை (புதிதாக ERP-யிலிருந்து வந்த Item-ன் விற்பனையாக இருக்கலாம்).</div>}
          <TableWrap minWidth={980}>
            <thead><tr style={{ background: '#0f172a', color: 'white' }}>{['Source', 'Item', 'Design', 'Size', 'Colour', 'MRP', 'Price', 'Qty', 'Cost/Pc', 'Cost மதிப்பு', 'MRP மதிப்பு', 'அடிப்படை'].map(h => <th key={h} style={styles.thSub}>{h}</th>)}</tr></thead>
            <tbody>
              {shown.length === 0 ? <EmptyRow cols={12} text="வரிகள் இல்லை." /> : shown.slice(0, MAX_ROWS).map((l, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #e2e8f0', background: l.source === 'ERP' ? '#faf5ff' : undefined }}>
                  <td style={styles.td}><b style={{ color: l.source === 'ERP' ? '#6d28d9' : '#0369a1' }}>{l.source}</b></td>
                  <td style={styles.td}><b>{l.item}</b></td><td style={styles.td}>{l.design}</td><td style={styles.td}>{l.size}</td><td style={styles.td}>{l.colour}</td>
                  <td style={styles.td}>{l.mrp ? `₹${l.mrp}` : '-'}</td><td style={styles.td}>{l.price ? `₹${l.price}` : '-'}</td>
                  <td style={{ ...styles.td, fontWeight: 'bold', color: l.qty < 0 ? '#dc2626' : undefined }}>{l.qty}</td>
                  <td style={styles.td}>{l.missing ? '⚠️' : `₹${(Math.round(l.unit * 100) / 100).toLocaleString('en-IN')}`}</td>
                  <td style={styles.td}>{l.missing ? '⚠️' : `₹${money(l.qty * l.unit)}`}</td><td style={styles.td}>₹{money(l.qty * l.mrp)}</td>
                  <td style={{ ...styles.td, fontSize: 11, color: '#64748b' }}>{l.basis}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          {shown.length > MAX_ROWS && <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>முதல் {MAX_ROWS} வரிகள் மட்டும் காட்டப்படுகின்றன — தேடுங்கள் அல்லது ⬇️ CSV-ல் முழுவதும் பெறுங்கள்.</div>}

          {cur && cur.erp && (
            <div style={{ marginTop: 14, background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 8, padding: 10 }}>
              <b>🔗 ERP Transfer (Busy தேதி {cur.asOn}-க்கு முன் / அன்று):</b>
              <div style={{ fontSize: 12, color: '#64748b', margin: '4px 0 6px' }}>இவை Busy-ல் ஏற்கனவே ஏறியதாகக் கருதப்பட்டுள்ளன. கடை Busy-ல் இன்னும் ஏற்றாத Transfer இருந்தால் குறியிடவும் — அது கூடுதலாகச் சேரும்.</div>
              {early.length === 0 && forced.length === 0 && <div style={{ fontSize: 12 }}>அத்தகைய Transfer இல்லை.</div>}
              {[...forced, ...early.filter(t => !ctx.sm.force[String(t.id)])].map(t => (
                <label key={t.id} style={{ display: 'flex', gap: 8, fontSize: 12, padding: '2px 0', cursor: 'pointer' }}>
                  <input type="checkbox" aria-label={`Busy-ல் இல்லை ${t.challan_no}`} checked={!!ctx.sm.force[String(t.id)]} onChange={e => toggleForce(String(t.id), e.target.checked)} />
                  {String(t.transfer_date || '').slice(0, 10)} • {t.challan_no} • {t.model_name} {t.design_no} {t.color} {sizeLbl(t)} • <b>{t.transferred_pieces} Pcs</b> — Busy-ல் இல்லை → கூட்டவும்
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const sizeLbl = (t: any) => { const s = String(t.size_details || ''); return s && s !== 'Opening Stock' ? s : ''; };
