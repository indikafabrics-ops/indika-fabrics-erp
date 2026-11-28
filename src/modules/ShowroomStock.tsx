import { useCallback, useEffect, useMemo, useState } from 'react';
import { errMsg } from '../lib/supabase';
import { num, downloadCsv, todayStr } from '../lib/helpers';
import { loadCtx, loadAllShowrooms, saveShopMap, sumLines, erpNameFor, type Ctx, type ShopBuilt, type SLine } from '../lib/showroomStock';
import { ADJ_TABLE, type AdjOp, type AdjAdded } from '../lib/showroomAdj';
import { submitChange, isAdmin } from '../lib/approvals';
import { logAction } from '../lib/audit';
import ShareBar from '../components/ShareBar';
import { EmptyRow, ErrorBanner, Loading, TableWrap, notify, styles } from '../components/ui';

const money = (n: number) => Math.round(n).toLocaleString('en-IN');
const MAX_ROWS = 300;
const SIZE_HINTS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', 'Free'];
type View = 'lines' | 'items' | 'sizes' | 'alerts';

const labelOfKey = (k: string) => { const p = k.split('|'); return [p[0], p[1], p[2], p[3]].filter(x => x && x !== '-').join(' '); };
const nameOf = (b: ShopBuilt) => (b.erpOnly ? b.shop + ' (ERP மட்டும்)' : b.shop);

interface FormVals { item: string; design: string; size: string; colour: string; mrp: string; price: string; qty: string; date: string; note: string }

/** One page for every showroom: Busy stock + ERP transfers + hand entries, stock and value, no double counting */
export default function ShowroomStock({ user, onTotals }: { user?: any; onTotals?: (pcs: number) => void }) {
  const admin = isAdmin(user);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [data, setData] = useState<ShopBuilt[] | null>(null);
  const [error, setError] = useState('');
  const [sel, setSel] = useState('');
  const [q, setQ] = useState('');
  const [view, setView] = useState<View>('lines');
  const [showMap, setShowMap] = useState(false);
  const [form, setForm] = useState<{ mode: 'add' | 'edit'; line?: SLine } | null>(null);

  const load = useCallback(async () => {
    setError('');
    try { const c = await loadCtx(); setCtx(c); const d = await loadAllShowrooms(c); setData(d); onTotals?.(sumLines(d.flatMap(b => b.lines)).pcs); } catch (e: any) { setError('Load தோல்வி: ' + errMsg(e)); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => (data || []).map(b => ({
    key: b.adjKey, name: nameOf(b), asOn: b.asOn || '-',
    busy: sumLines(b.lines.filter(l => l.source === 'Busy')), erp: sumLines(b.lines.filter(l => l.source === 'ERP')), man: sumLines(b.lines.filter(l => l.source === 'Manual'))
  })), [data]);
  const tot = (r: { busy: any; erp: any; man: any }) => ({ pcs: r.busy.pcs + r.erp.pcs + r.man.pcs, cost: r.busy.cost + r.erp.cost + r.man.cost, mrp: r.busy.mrp + r.erp.mrp + r.man.mrp, noCost: r.busy.noCost + r.erp.noCost + r.man.noCost });
  const grand = rows.reduce((a, r) => { const t = tot(r); return { pcs: a.pcs + t.pcs, cost: a.cost + t.cost, mrp: a.mrp + t.mrp, noCost: a.noCost + t.noCost }; }, { pcs: 0, cost: 0, mrp: 0, noCost: 0 });

  const cur = data?.find(b => b.adjKey === sel);
  const lines: SLine[] = cur?.lines || [];
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return lines.filter(l => !t || `${l.item} ${l.design} ${l.colour} ${l.size} ${l.source}`.toLowerCase().includes(t)).sort((a, b) => (a.item + a.design).localeCompare(b.item + b.design) || a.size.localeCompare(b.size, undefined, { numeric: true }));
  }, [lines, q]);
  const shownSum = sumLines(shown);

  // ---- summaries for the report views (selected showroom)
  const byItems = useMemo(() => {
    const m = new Map<string, { item: string; design: string; pcs: number; cost: number; mrp: number; sizes: Set<string> }>();
    lines.forEach(l => { const k = (l.item + '|' + l.design).toUpperCase(); const c = m.get(k) || { item: l.item, design: l.design, pcs: 0, cost: 0, mrp: 0, sizes: new Set<string>() }; c.pcs += l.qty; c.cost += l.qty * l.unit; c.mrp += l.qty * l.mrp; c.sizes.add(l.size); m.set(k, c); });
    return Array.from(m.values()).sort((a, b) => b.cost - a.cost || b.pcs - a.pcs);
  }, [lines]);
  const bySizes = useMemo(() => {
    const m = new Map<string, { size: string; pcs: number; cost: number; mrp: number; items: number }>();
    lines.forEach(l => { const k = l.size.toUpperCase(); const c = m.get(k) || { size: l.size, pcs: 0, cost: 0, mrp: 0, items: 0 }; c.pcs += l.qty; c.cost += l.qty * l.unit; c.mrp += l.qty * l.mrp; c.items += 1; m.set(k, c); });
    return Array.from(m.values()).sort((a, b) => b.pcs - a.pcs);
  }, [lines]);
  const alerts = useMemo(() => {
    const out: { kind: string; l: SLine }[] = [];
    lines.forEach(l => {
      if (l.qty < 0) out.push({ kind: '🔴 மைனஸ் Stock', l });
      else if (l.qty > 100) out.push({ kind: '🟠 பெரிய Qty (>100)', l });
      if (l.missing) out.push({ kind: '⚠️ Cost இல்லை', l });
      if (l.qty > 0 && l.qty <= 2) out.push({ kind: '🟡 குறைந்த Stock (≤2)', l });
    });
    return out;
  }, [lines]);

  // ---- changes (Admin: at once, others: Admin approval)
  const run = async (b: ShopBuilt, op: AdjOp, label: string): Promise<boolean> => {
    try {
      const res = await submitChange(user, { action: 'update', table: ADJ_TABLE, rowId: b.adjKey, label: `Showroom ${b.shop}: ${label}`, changes: { 'மாற்றம்': label, _op: op } });
      logAction(`Showroom ${b.shop}: ${label}${res === 'queued' ? ' (ஒப்புதலுக்கு)' : ''}`);
      if (res === 'done') { notify('✅ சேமிக்கப்பட்டது.', 'ok'); await load(); } else notify('📨 Admin ஒப்புதலுக்கு அனுப்பப்பட்டது — அவர் Approve செய்த பின் பொருந்தும்.', 'info');
      return true;
    } catch (e: any) { notify('சேமிக்க முடியவில்லை: ' + errMsg(e), 'err'); return false; }
  };
  const who = String(user?.full_name || user?.username || 'staff');

  const saveMap = async (shop: string, erp: string) => {
    if (!ctx) return;
    try { const sm = { ...ctx.sm, map: { ...ctx.sm.map, [shop]: erp } }; await saveShopMap(sm); logAction(`Showroom இணைப்பு: ${shop} → ${erp || 'இல்லை'}`); notify('✅ இணைப்பு சேமிக்கப்பட்டது.', 'ok'); await load(); } catch (e: any) { notify(errMsg(e), 'err'); }
  };
  const toggleForce = async (id: string, on: boolean) => {
    if (!ctx) return;
    try { const force = { ...ctx.sm.force }; if (on) force[id] = true; else delete force[id]; await saveShopMap({ ...ctx.sm, force }); await load(); } catch (e: any) { notify(errMsg(e), 'err'); }
  };

  const delLine = async (b: ShopBuilt, l: SLine) => {
    const desc = `${l.item} ${l.design} ${l.size} ${l.colour} (${l.qty} Pcs)`;
    if (!window.confirm(`${desc}\n\nஇந்த வரியை Showroom Stock-ல் இருந்து நீக்கவா?${l.source === 'Busy' ? '\n(Busy file மாறாது — எப்போது வேண்டுமானாலும் மீட்டெடுக்கலாம்.)' : ''}`)) return;
    if (l.source === 'Manual') await run(b, { t: 'delAdd', id: l.key }, `🗑️ கை Entry நீக்கம்: ${desc}`);
    else await run(b, { t: 'del', k: l.key, label: desc, by: who }, `🗑️ நீக்கம்: ${desc}`);
  };

  const submitForm = async (b: ShopBuilt, v: FormVals, mode: 'add' | 'edit', line?: SLine): Promise<boolean> => {
    const item = v.item.trim(); if (!item) { notify('Item பெயர் தேவை.', 'err'); return false; }
    const qty = Math.round(num(v.qty)); const mrp = Math.max(0, num(v.mrp)); const price = Math.max(0, num(v.price));
    if (v.qty.trim() === '' || !Number.isFinite(qty)) { notify('Qty உள்ளிடவும்.', 'err'); return false; }
    if (qty <= 0) { notify('Qty 0-க்கு மேல் இருக்க வேண்டும் (நீக்க 🗑️ பயன்படுத்தவும்).', 'err'); return false; }
    if (qty > 100 && !window.confirm(`Qty ${qty} மிகப் பெரியது. சரியா?`)) return false;
    if (!(mrp > 0) && !(price > 0)) { if (!window.confirm('MRP, Price இரண்டுமே இல்லை — Cost கணக்கிட முடியாது (⚠️ எனக் காட்டும்). தொடரவா?')) return false; }
    const design = v.design.trim() || '-', size = v.size.trim() || '-', colour = v.colour.trim() || '-';
    if (mode === 'add') {
      const date = v.date || todayStr();
      return run(b, { t: 'add', row: { item, design, size, colour, mrp, price, qty, date, note: v.note.trim() }, by: who }, `➕ புதிய வரி: ${item} ${design} ${size} ${colour} × ${qty}`);
    }
    if (!line) return false;
    if (line.source === 'Manual') {
      return run(b, { t: 'editAdd', id: line.key, f: { item, design, size, colour, mrp, price, qty, note: v.note.trim(), date: v.date || line.date || todayStr() } }, `✏️ கை Entry திருத்தம்: ${item} ${design} ${size} × ${qty}`);
    }
    const f: any = {};
    if (item !== line.item) f.item = item;
    if (design !== line.design) f.design = design;
    if (size !== line.size) f.size = size;
    if (colour !== line.colour) f.colour = colour;
    if (mrp !== line.mrp) f.mrp = mrp;
    if (price !== line.price) f.price = price;
    if (qty !== line.qty) { f.qty = qty + (line.sold || 0); f.qAsOn = b.asOn; }
    if (!Object.keys(f).length) { notify('மாற்றம் எதுவும் இல்லை.', 'info'); return false; }
    return run(b, { t: 'edit', k: line.key, f, by: who }, `✏️ திருத்தம்: ${labelOfKey(line.key) || line.item}${f.qty !== undefined ? ` Qty ${line.qty}→${qty}` : ''}`);
  };

  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!data || !ctx) return <Loading />;

  const early = cur && !cur.erpOnly && cur.erp ? ctx.transfers.filter(t => String(t.showroom_name || '').trim() === cur.erp && num(t.transferred_pieces) > 0 && String(t.transfer_date || '').slice(0, 10) <= cur.asOn).sort((a, b) => String(b.transfer_date).localeCompare(String(a.transfer_date))).slice(0, 25) : [];
  const forced = cur && !cur.erpOnly && cur.erp ? ctx.transfers.filter(t => ctx.sm.force[String(t.id)] && String(t.showroom_name || '').trim() === cur.erp) : [];
  const adjEdits = cur ? Object.entries(cur.adj.edits) : [];
  const adjDel = cur ? Object.entries(cur.adj.deleted) : [];
  const adjTotal = adjEdits.length + adjDel.length;
  const sizeLbl = (t: any) => { const s = String(t.size_details || ''); return s && s !== 'Opening Stock' ? s : ''; };

  const viewBtn = (k: View, label: string) => <button type="button" onClick={() => setView(k)} style={{ ...styles.secondaryBtn, background: view === k ? '#1e293b' : '#e2e8f0', color: view === k ? 'white' : '#475569', padding: '6px 12px', fontSize: 12 }}>{label}</button>;
  const smallBtn = { ...styles.secondaryBtn, padding: '4px 8px', fontSize: '12px' } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
          <h4 style={{ margin: 0 }}>🏬 Showroom Stock — Busy + ERP + கை Entry (Stock & Value)</h4>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setShowMap(v => !v)} style={styles.secondaryBtn}>🔗 Busy கடை ↔ ERP Showroom</button>
            <ShareBar doc={{ title: 'Showroom Stock — கடை வாரி', subtitle: 'Busy Stock + ERP Transfer (Busy தேதிக்குப் பிறகு) + கை Entry', headers: ['கடை', 'As On', 'Busy Pcs', 'Busy Cost ₹', 'ERP Pcs', 'ERP Cost ₹', 'கை Pcs', 'கை Cost ₹', 'மொத்தம் Pcs', 'மொத்தம் Cost ₹', 'MRP மதிப்பு ₹', 'Cost இல்லாத Pcs'], rows: rows.map(r => { const t = tot(r); return [r.name, r.asOn, r.busy.pcs, Math.round(r.busy.cost), r.erp.pcs, Math.round(r.erp.cost), r.man.pcs, Math.round(r.man.cost), t.pcs, Math.round(t.cost), Math.round(t.mrp), t.noCost]; }), footer: [`மொத்தம் ${grand.pcs} Pcs • Cost ₹${money(grand.cost)} • MRP ₹${money(grand.mrp)}`] }} />
          </div>
        </div>
        <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 8px 0' }}>Busy Cost = Sales Price −20% (இல்லையெனில் MRP × 50%). ERP Transfer, Busy "As On" தேதிக்குப் பிறகு (அல்லது "Busy-ல் இல்லை" என்று குறித்தவை) மட்டும் சேரும் — இரட்டிப்பாகாது. Busy வரிகளை ✏️ திருத்தலாம் / 🗑️ நீக்கலாம் — Busy file மாறாது, மாற்றங்களை எப்போதும் திரும்பப் பெறலாம்.{admin ? '' : ' (உங்கள் மாற்றங்கள் Admin ஒப்புதலுக்குப் போகும்.)'}</p>
        {showMap && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, marginBottom: 10 }}>
            <div style={{ fontSize: '12px', color: '#475569', marginBottom: 6 }}>ஒவ்வொரு Busy கடைக்கும் அதற்குரிய ERP Showroom-ஐத் தேர்வு செய்யவும் (பெயர் ஒன்றாக இருந்தால் தானாகப் பொருந்தும்):</div>
            {data.filter(b => !b.erpOnly).map(b => (
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
        <TableWrap minWidth={1100}>
          <thead><tr style={{ background: '#0f172a', color: 'white' }}>{['கடை', 'Busy As On', 'Busy Pcs', 'Busy Cost ₹', 'ERP Pcs', 'ERP Cost ₹', 'கை Pcs', 'கை Cost ₹', 'மொத்தம் Pcs', 'மொத்தம் Cost ₹', 'MRP மதிப்பு ₹', 'Cost இல்லை', ''].map(h => <th key={h} style={styles.thSub}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 ? <EmptyRow cols={13} text="Busy Stock இன்னும் Upload செய்யப்படவில்லை; ERP Showroom-உம் இல்லை." /> : rows.map(r => { const t = tot(r); return (
              <tr key={r.key} style={{ borderBottom: '1px solid #e2e8f0', background: sel === r.key ? '#eff6ff' : undefined }}>
                <td style={styles.td}><b>{r.name}</b></td><td style={styles.td}>{r.asOn}</td>
                <td style={styles.td}>{r.busy.pcs}</td><td style={styles.td}>₹{money(r.busy.cost)}</td>
                <td style={styles.td}>{r.erp.pcs}</td><td style={styles.td}>₹{money(r.erp.cost)}</td>
                <td style={styles.td}>{r.man.pcs}</td><td style={styles.td}>₹{money(r.man.cost)}</td>
                <td style={{ ...styles.td, fontWeight: 'bold', color: '#059669' }}>{t.pcs}</td>
                <td style={{ ...styles.td, fontWeight: 'bold' }}>₹{money(t.cost)}</td>
                <td style={styles.td}>₹{money(t.mrp)}</td>
                <td style={{ ...styles.td, color: t.noCost ? '#b45309' : '#64748b' }}>{t.noCost ? `⚠️ ${t.noCost} Pcs` : '-'}</td>
                <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => { setSel(r.key); setQ(''); setView('lines'); }} style={smallBtn}>விவரம் →</button>{' '}
                  <button type="button" aria-label={`Entry ${r.name}`} onClick={() => { setSel(r.key); setQ(''); setView('lines'); setForm({ mode: 'add' }); }} style={{ ...smallBtn, background: '#dcfce7', color: '#166534' }}>➕ Entry</button>
                </td>
              </tr>
            ); })}
            {rows.length > 0 && (
              <tr style={{ background: '#f1f5f9', fontWeight: 'bold' }}>
                <td style={styles.td}>மொத்தம் (எல்லா Showroom)</td><td style={styles.td}></td><td style={styles.td} colSpan={6}></td>
                <td style={styles.td}>{grand.pcs}</td><td style={styles.td}>₹{money(grand.cost)}</td><td style={styles.td}>₹{money(grand.mrp)}</td>
                <td style={styles.td}>{grand.noCost ? `⚠️ ${grand.noCost} Pcs` : '-'}</td><td style={styles.td}></td>
              </tr>
            )}
          </tbody>
        </TableWrap>
        {grand.noCost > 0 && <div style={{ fontSize: '12px', color: '#92400e', marginTop: 6 }}>⚠️ Cost இல்லாத Pcs (MRP, Sales Price இல்லை அல்லது ERP Costing இல்லை) மொத்தத்தில் சேரவில்லை. வரியை ✏️ திருத்தி MRP / Price போடலாம்.</div>}
      </div>

      {cur && (
        <div style={styles.card}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
            <h4 style={{ margin: 0 }}>📦 {nameOf(cur)}</h4>
            <span style={{ fontSize: 12, color: '#64748b' }}>{lines.length} வரிகள் • {sumLines(lines).pcs} Pcs • Cost ₹{money(sumLines(lines).cost)} • MRP ₹{money(sumLines(lines).mrp)}</span>
            <button type="button" onClick={() => setForm({ mode: 'add' })} style={{ ...styles.primaryBtn, background: '#059669', marginLeft: 'auto' }}>➕ புதிய வரி (Entry)</button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {viewBtn('lines', '📋 வரிகள் (Edit / Delete)')}{viewBtn('items', '🧾 Item வாரி')}{viewBtn('sizes', '📏 Size வாரி')}{viewBtn('alerts', `⚠️ கவனிக்க (${alerts.length})`)}
          </div>

          {cur.unmatchedSales > 0 && <div style={{ fontSize: 12, color: '#92400e', marginBottom: 6 }}>ℹ️ {cur.unmatchedSales} Busy விற்பனை வரிகள் எந்த Stock வரியுடனும் பொருந்தவில்லை (புதிதாக ERP-யிலிருந்து வந்த Item-ன் விற்பனையாக இருக்கலாம்).</div>}
          {cur.staleQty.length > 0 && (
            <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: 8, marginBottom: 8 }}>
              ⚠️ {cur.staleQty.length} Qty திருத்தங்கள் பழைய Busy Upload-க்கு உரியவை — புதிய Upload-ன் Qty-யே பயன்படுத்தப்படுகிறது. (Item / Design / MRP / Price திருத்தங்கள் தொடர்கின்றன.) கீழே "கை மாற்றங்கள்" பட்டியலில் அவற்றை நீக்கலாம்.
            </div>
          )}

          {view === 'lines' && (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                <input placeholder="🔍 Item / Design / Colour / Size / Busy / ERP..." value={q} onChange={e => setQ(e.target.value)} style={{ ...styles.input, maxWidth: 280 }} />
                <span style={{ fontSize: 12, color: '#64748b' }}>{shown.length} வரிகள் • {shownSum.pcs} Pcs • Cost ₹{money(shownSum.cost)} • MRP ₹{money(shownSum.mrp)}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button type="button" onClick={() => downloadCsv(`showroom-stock-${cur.adjKey.replace(/[^a-z0-9]+/gi, '-')}.csv`, [['Source', 'Item', 'Design', 'Size', 'Colour', 'MRP', 'Price', 'Qty', 'Cost/Pc', 'Cost Value', 'MRP Value', 'Basis'], ...shown.map(l => [l.source, l.item, l.design, l.size, l.colour, l.mrp, l.price, l.qty, Math.round(l.unit * 100) / 100, Math.round(l.qty * l.unit), Math.round(l.qty * l.mrp), l.basis])])} style={styles.secondaryBtn}>⬇️ CSV</button>
                  <ShareBar doc={{ title: `Showroom Stock — ${nameOf(cur)}`, headers: ['Source', 'Item', 'Design', 'Size', 'Colour', 'MRP', 'Price', 'Qty', 'Cost ₹', 'MRP மதிப்பு ₹'], rows: shown.slice(0, 1500).map(l => [l.source, l.item, l.design, l.size, l.colour, l.mrp, l.price, l.qty, Math.round(l.qty * l.unit), Math.round(l.qty * l.mrp)]), footer: [`${shownSum.pcs} Pcs • Cost ₹${money(shownSum.cost)} • MRP ₹${money(shownSum.mrp)}${shown.length > 1500 ? ' • (முதல் 1500 வரிகள்)' : ''}`] }} />
                </div>
              </div>
              <TableWrap minWidth={1060}>
                <thead><tr style={{ background: '#0f172a', color: 'white' }}>{['Source', 'Item', 'Design', 'Size', 'Colour', 'MRP', 'Price', 'Qty', 'Cost/Pc', 'Cost மதிப்பு', 'MRP மதிப்பு', 'அடிப்படை', 'Edit / Delete'].map(h => <th key={h} style={styles.thSub}>{h}</th>)}</tr></thead>
                <tbody>
                  {shown.length === 0 ? <EmptyRow cols={13} text="வரிகள் இல்லை — ➕ புதிய வரி மூலம் சேர்க்கலாம்." /> : shown.slice(0, MAX_ROWS).map(l => (
                    <tr key={l.source + l.key} data-line={l.key} style={{ borderBottom: '1px solid #e2e8f0', background: l.source === 'ERP' ? '#faf5ff' : l.source === 'Manual' ? '#f0fdf4' : l.edited ? '#fffbeb' : undefined }}>
                      <td style={styles.td}><b style={{ color: l.source === 'ERP' ? '#6d28d9' : l.source === 'Manual' ? '#166534' : '#0369a1' }}>{l.source === 'Manual' ? 'கை' : l.source}</b></td>
                      <td style={styles.td}><b>{l.item}</b></td><td style={styles.td}>{l.design}</td><td style={styles.td}>{l.size}</td><td style={styles.td}>{l.colour}</td>
                      <td style={styles.td}>{l.mrp ? `₹${l.mrp}` : '-'}</td><td style={styles.td}>{l.price ? `₹${l.price}` : '-'}</td>
                      <td style={{ ...styles.td, fontWeight: 'bold', color: l.qty < 0 ? '#dc2626' : undefined }}>{l.qty}</td>
                      <td style={styles.td}>{l.missing ? '⚠️' : `₹${(Math.round(l.unit * 100) / 100).toLocaleString('en-IN')}`}</td>
                      <td style={styles.td}>{l.missing ? '⚠️' : `₹${money(l.qty * l.unit)}`}</td><td style={styles.td}>₹{money(l.qty * l.mrp)}</td>
                      <td style={{ ...styles.td, fontSize: 11, color: '#64748b' }}>{l.basis}{l.date ? ` • ${l.date}` : ''}</td>
                      <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                        {l.source === 'ERP' ? <span style={{ fontSize: 11, color: '#6d28d9' }} title="ERP Transfer வரிகளை Ready Stock பக்கத்தின் கீழுள்ள 'Showroom Transfer, Sale & Opening Log'-ல் Edit / Delete செய்யவும்">Log-ல்</span> : (
                          <>
                            <button type="button" aria-label={`Edit ${l.item} ${l.size}`} onClick={() => setForm({ mode: 'edit', line: l })} style={smallBtn}>✏️</button>{' '}
                            <button type="button" aria-label={`Delete ${l.item} ${l.size}`} onClick={() => delLine(cur, l)} style={styles.dangerBtn}>🗑️</button>
                            {l.source === 'Busy' && l.edited && <>{' '}<button type="button" aria-label={`Undo ${l.item} ${l.size}`} title="Busy original-க்குத் திரும்பு" onClick={() => run(cur, { t: 'undo', k: l.key }, `↩ மீட்பு: ${labelOfKey(l.key)}`)} style={smallBtn}>↩</button></>}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
              {shown.length > MAX_ROWS && <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>முதல் {MAX_ROWS} வரிகள் மட்டும் காட்டப்படுகின்றன — தேடுங்கள் அல்லது ⬇️ CSV-ல் முழுவதும் பெறுங்கள்.</div>}
            </>
          )}

          {view === 'items' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>{byItems.length} Item/Design • Cost மதிப்பு அதிகமானவை முதலில்</span>
                <button type="button" style={styles.secondaryBtn} onClick={() => downloadCsv('showroom-items.csv', [['Item', 'Design', 'Sizes', 'Pcs', 'Cost', 'MRP Value'], ...byItems.map(x => [x.item, x.design, x.sizes.size, x.pcs, Math.round(x.cost), Math.round(x.mrp)])])}>⬇️ CSV</button>
              </div>
              <TableWrap minWidth={700}>
                <thead><tr style={{ background: '#0f172a', color: 'white' }}>{['Item', 'Design', 'Size எண்ணிக்கை', 'Pcs', 'Cost மதிப்பு ₹', 'MRP மதிப்பு ₹'].map(h => <th key={h} style={styles.thSub}>{h}</th>)}</tr></thead>
                <tbody>{byItems.length === 0 ? <EmptyRow cols={6} text="வரிகள் இல்லை." /> : byItems.slice(0, 200).map((x, i) => <tr key={i}><td style={styles.td}><b>{x.item}</b></td><td style={styles.td}>{x.design}</td><td style={styles.td}>{x.sizes.size}</td><td style={styles.td}>{x.pcs}</td><td style={styles.td}>₹{money(x.cost)}</td><td style={styles.td}>₹{money(x.mrp)}</td></tr>)}</tbody>
              </TableWrap>
              {byItems.length > 200 && <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>முதல் 200 மட்டும் — முழுவதும் ⬇️ CSV.</div>}
            </>
          )}

          {view === 'sizes' && (
            <TableWrap minWidth={600}>
              <thead><tr style={{ background: '#0f172a', color: 'white' }}>{['Size', 'வரிகள்', 'Pcs', 'Cost மதிப்பு ₹', 'MRP மதிப்பு ₹'].map(h => <th key={h} style={styles.thSub}>{h}</th>)}</tr></thead>
              <tbody>{bySizes.length === 0 ? <EmptyRow cols={5} text="வரிகள் இல்லை." /> : bySizes.map(x => <tr key={x.size}><td style={styles.td}><b>{x.size}</b></td><td style={styles.td}>{x.items}</td><td style={styles.td}>{x.pcs}</td><td style={styles.td}>₹{money(x.cost)}</td><td style={styles.td}>₹{money(x.mrp)}</td></tr>)}</tbody>
            </TableWrap>
          )}

          {view === 'alerts' && (
            <>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>சரிபார்க்க வேண்டிய வரிகள். 🗑️/✏️ வரிகள் tab-ல் திருத்தலாம்.</div>
              <TableWrap minWidth={760}>
                <thead><tr style={{ background: '#0f172a', color: 'white' }}>{['வகை', 'Source', 'Item', 'Design', 'Size', 'Colour', 'Qty', 'MRP', 'Price'].map(h => <th key={h} style={styles.thSub}>{h}</th>)}</tr></thead>
                <tbody>{alerts.length === 0 ? <EmptyRow cols={9} text="✅ கவனிக்க வேண்டியவை எதுவும் இல்லை." /> : alerts.slice(0, 200).map((a, i) => <tr key={i}><td style={styles.td}>{a.kind}</td><td style={styles.td}>{a.l.source}</td><td style={styles.td}><b>{a.l.item}</b></td><td style={styles.td}>{a.l.design}</td><td style={styles.td}>{a.l.size}</td><td style={styles.td}>{a.l.colour}</td><td style={styles.td}>{a.l.qty}</td><td style={styles.td}>{a.l.mrp || '-'}</td><td style={styles.td}>{a.l.price || '-'}</td></tr>)}</tbody>
              </TableWrap>
              {alerts.length > 200 && <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>முதல் 200 மட்டும் காட்டப்படுகின்றன.</div>}
            </>
          )}

          {(adjTotal > 0 || cur.orphans.length > 0 || cur.notCounted.length > 0) && (
            <div style={{ marginTop: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                <b>🛠️ கை மாற்றங்கள் ({adjEdits.length} திருத்தம் • {adjDel.length} நீக்கம்)</b>
                {adjTotal > 0 && <button type="button" style={{ ...styles.dangerBtn, marginLeft: 'auto' }} onClick={() => { if (window.confirm('இந்தக் கடையின் எல்லாத் திருத்தங்கள் / நீக்கங்களையும் அழித்து Busy original-க்குத் திரும்பவா? (கை Entry வரிகள் அழியாது)')) run(cur, { t: 'clear' }, '↩ எல்லா மாற்றங்களும் அழிப்பு'); }}>↩ எல்லாவற்றையும் Busy original-க்குத் திருப்பு</button>}
              </div>
              {adjEdits.map(([k, e]) => (
                <div key={k} style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center', padding: '2px 0' }}>
                  ✏️ {labelOfKey(k)} — {[e.item && `Item→${e.item}`, e.design && `Design→${e.design}`, e.size && `Size→${e.size}`, e.colour && `Colour→${e.colour}`, e.mrp !== undefined && `MRP→${e.mrp}`, e.price !== undefined && `Price→${e.price}`, e.qty !== undefined && `Qty→${e.qty}${e.qAsOn === cur.asOn ? '' : ' (பழைய Upload)'}`].filter(Boolean).join(', ')}
                  <button type="button" style={smallBtn} onClick={() => run(cur, { t: 'undo', k }, `↩ மீட்பு: ${labelOfKey(k)}`)}>↩ மீட்டெடு</button>
                </div>
              ))}
              {adjDel.map(([k, d]) => (
                <div key={k} style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center', padding: '2px 0' }}>
                  🗑️ {d.label || labelOfKey(k)} <span style={{ color: '#64748b' }}>({d.by})</span>
                  <button type="button" style={smallBtn} aria-label={`Restore ${labelOfKey(k)}`} onClick={() => run(cur, { t: 'undo', k }, `↩ மீட்பு: ${labelOfKey(k)}`)}>↩ மீட்டெடு</button>
                </div>
              ))}
              {cur.orphans.length > 0 && (
                <div style={{ fontSize: 12, color: '#92400e', marginTop: 6 }}>
                  ℹ️ {cur.orphans.length} மாற்றங்கள் இப்போதைய Busy file-ல் இல்லாத வரிகளுக்கு உரியவை (பயன்படவில்லை).{' '}
                  <button type="button" style={smallBtn} onClick={() => run(cur, { t: 'drop', keys: cur.orphans }, '🧹 பயன்படாத மாற்றங்கள் அழிப்பு')}>🧹 அழி</button>
                </div>
              )}
              {cur.notCounted.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 12, color: '#92400e' }}>⚠️ கை Entry (Busy தேதி {cur.asOn}-க்கு முன் / அன்று) — Busy-ல் ஏற்கனவே இருக்கலாம் என்பதால் கூட்டப்படவில்லை. Busy-ல் இல்லை என்றால் குறியிடவும்:</div>
                  {cur.notCounted.map((r: AdjAdded) => (
                    <label key={r.id} style={{ display: 'flex', gap: 8, fontSize: 12, padding: '2px 0', alignItems: 'center' }}>
                      <input type="checkbox" aria-label={`கூட்டவும் ${r.item}`} checked={!!r.force} onChange={e => run(cur, { t: 'force', id: r.id, on: e.target.checked }, `கை Entry கூட்டு: ${r.item}`)} />
                      {r.date} • {r.item} {r.design} {r.size} {r.colour} • <b>{r.qty} Pcs</b>
                      <button type="button" style={smallBtn} onClick={() => run(cur, { t: 'delAdd', id: r.id }, `🗑️ கை Entry நீக்கம்: ${r.item}`)}>🗑️</button>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {cur.erp && !cur.erpOnly && (
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

      {form && cur && <LineForm key={form.mode + (form.line?.key || '')} b={cur} mode={form.mode} line={form.line} onClose={() => setForm(null)} onSubmit={async v => { if (await submitForm(cur, v, form.mode, form.line)) setForm(null); }} />}
    </div>
  );
}

function LineForm({ b, mode, line, onClose, onSubmit }: { b: ShopBuilt; mode: 'add' | 'edit'; line?: SLine; onClose: () => void; onSubmit: (v: FormVals) => Promise<void> }) {
  const [v, setV] = useState<FormVals>({
    item: line?.item || '', design: line && line.design !== '-' ? line.design : '', size: line && line.size !== '-' ? line.size : '', colour: line && line.colour !== '-' ? line.colour : '',
    mrp: line?.mrp ? String(line.mrp) : '', price: line?.price ? String(line.price) : '', qty: line ? String(line.qty) : '', date: line?.date || todayStr(), note: line?.note || ''
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof FormVals, val: string) => setV(p => ({ ...p, [k]: val }));
  const isManual = mode === 'add' || line?.source === 'Manual';
  const inp = (label: string, k: keyof FormVals, extra?: { type?: string; list?: string; hint?: string }) => (
    <div>
      <label style={styles.label}>{label}</label>
      <input aria-label={label} type={extra?.type || 'text'} list={extra?.list} value={v[k]} onChange={e => set(k, e.target.value)} style={styles.input} />
      {extra?.hint && <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{extra.hint}</div>}
    </div>
  );
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', padding: 20, borderRadius: 10, maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <h4 style={{ margin: '0 0 4px 0' }}>{mode === 'add' ? '➕ புதிய Showroom வரி' : '✏️ வரியைத் திருத்து'} — {nameOf(b)}</h4>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
          {mode === 'add' ? 'Busy-ல் இல்லாத புதிய Item-ஐ இங்கே சேர்க்கவும். (ERP-யிலிருந்து அனுப்பிய Item-ஐ "Ready Stock → Transfer" மூலம் அனுப்பவும்.)' : line?.source === 'Busy' ? 'Busy file மாறாது; உங்கள் திருத்தம் தனியாகச் சேமிக்கப்படும் — ↩ மூலம் திரும்பப் பெறலாம்.' : 'கை Entry வரி.'}
        </div>
        <datalist id="sz-hints">{SIZE_HINTS.map(s => <option key={s} value={s} />)}</datalist>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          {inp('Item பெயர் *', 'item')}{inp('Design', 'design')}{inp('Size', 'size', { list: 'sz-hints' })}{inp('Colour', 'colour')}
          {inp('MRP ₹', 'mrp', { type: 'number' })}{inp('Sales Price ₹', 'price', { type: 'number', hint: 'இல்லையெனில் Cost = MRP × 50%' })}
          {inp('Qty (Pcs) *', 'qty', { type: 'number' })}
          {isManual && inp('தேதி', 'date', { type: 'date', hint: b.asOn ? `Busy தேதி ${b.asOn}-க்குப் பிறகு இருந்தால் மட்டும் கூட்டப்படும்` : undefined })}
        </div>
        {isManual && <div style={{ marginTop: 10 }}>{inp('குறிப்பு', 'note')}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={styles.secondaryBtn}>Cancel</button>
          <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await onSubmit(v); } finally { setBusy(false); } }} style={styles.successBtn}>{busy ? 'Saving...' : mode === 'add' ? '💾 சேர்' : '💾 சேமி'}</button>
        </div>
      </div>
    </div>
  );
}
