import { useCallback, useEffect, useMemo, useState } from 'react';
import { errMsg } from '../lib/supabase';
import { todayStr } from '../lib/helpers';
import { loadStockValue, type StockValRow } from '../lib/stockValue';
import { loadNet, saveDraft, saveSnap, deleteSnap, compute, emptySheet, sumE, type Sheet, type Entry, type Snap } from '../lib/netWorth';
import { logAction } from '../lib/audit';
import ShareBar from '../components/ShareBar';
import { ErrorBanner, Loading, TableWrap, notify, styles } from '../components/ui';

const money = (n: number) => Math.round(n).toLocaleString('en-IN');
const SUGG: Record<string, string[]> = {
  otherA: ['GST Input (வரவு)', 'Supplier Advance', 'Deposits / Rent Advance', 'Cheque வரவேண்டியது', 'Employee Advance'],
  otherL: ['GST Payable', 'Salary Payable', 'Tailor பாக்கி', 'Expenses Payable', 'Cheque கொடுக்க வேண்டியது'],
  bank: ['Bank A/c 1', 'Bank A/c 2', 'OD / CC Account'],
  fixed: ['Machinery', 'Furniture & Fittings', 'Vehicle', 'Building / Shop', 'Computer']
};

/** Admin only: S.D, S.C, Fixed Assets, Loans, Bank, Cash + live Stock value = Net result. Entries can be tried ("what-if") and saved as dated snapshots. */
export default function NetPositionModule() {
  const [sheet, setSheet] = useState<Sheet>(emptySheet());
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [stock, setStock] = useState<StockValRow[] | null>(null);
  const [error, setError] = useState('');
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const n = await loadNet(); setSheet(n.draft); setSnaps(n.snaps); setDirty(false);
      setStock(await loadStockValue());
    } catch (e: any) { setError('Load தோல்வி: ' + errMsg(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const stockTotal = (stock || []).reduce((a, r) => a + r.cost, 0);
  const stockMissing = (stock || []).reduce((a, r) => a + r.noCost, 0);
  const t = useMemo(() => compute(sheet, stockTotal), [sheet, stockTotal]);
  const prev = snaps[0];

  const setList = (k: 'sd' | 'sc' | 'fixed' | 'loans' | 'bank' | 'otherA' | 'otherL', list: Entry[]) => { setSheet(s => ({ ...s, [k]: list })); setDirty(true); };

  const saveD = async () => { setBusy(true); try { await saveDraft(sheet); setDirty(false); notify('✅ சேமிக்கப்பட்டது (Draft).', 'ok'); } catch (e: any) { notify(errMsg(e), 'err'); } finally { setBusy(false); } };
  const saveS = async () => {
    setBusy(true);
    try {
      const id = `${date}-${Date.now()}`;
      const s: Snap = { id, date, note: note.trim(), ts: new Date().toISOString(), sheet, stock: (stock || []).map(r => ({ label: r.label, cost: Math.round(r.cost) })), totals: t };
      await saveSnap(s, sheet); logAction(`Net Position Snapshot ${date}: Net ₹${money(t.net)}`);
      notify('✅ Snapshot சேமிக்கப்பட்டது.', 'ok'); setNote(''); setDirty(false); setSnaps((await loadNet()).snaps);
    } catch (e: any) { notify(errMsg(e), 'err'); } finally { setBusy(false); }
  };
  const del = async (id: string) => { if (!window.confirm('இந்த Snapshot-ஐ Delete செய்யவா?')) return; try { await deleteSnap(id); setSnaps((await loadNet()).snaps); } catch (e: any) { notify(errMsg(e), 'err'); } };

  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!stock) return <Loading />;

  const list = (k: 'sd' | 'sc' | 'fixed' | 'loans' | 'bank' | 'otherA' | 'otherL', title: string, nameLabel: string, color: string) => (
    <div style={{ ...styles.card, borderTop: `4px solid ${color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><b>{title}</b><b style={{ color }}>₹{money(sumE(sheet[k]))}</b></div>
      {sheet[k].map((e, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
          <input aria-label={`${title} பெயர் ${i + 1}`} list={`nl-${k}`} placeholder={nameLabel} value={e.name} onChange={ev => setList(k, sheet[k].map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)))} style={{ ...styles.tblInput, flex: 1 }} />
          <input aria-label={`${title} தொகை ${i + 1}`} type="number" placeholder="₹" value={e.amount} onChange={ev => setList(k, sheet[k].map((x, j) => (j === i ? { ...x, amount: ev.target.value } : x)))} style={{ ...styles.tblInput, width: 120 }} />
          <button type="button" onClick={() => setList(k, sheet[k].filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}>✕</button>
        </div>
      ))}
      <datalist id={`nl-${k}`}>{(SUGG[k] || []).map(o => <option key={o} value={o} />)}</datalist>
      <button type="button" onClick={() => setList(k, [...sheet[k], { name: '', amount: '' }])} style={{ ...styles.secondaryBtn, fontSize: 12, padding: '4px 10px' }}>+ சேர்</button>
    </div>
  );

  const rowsDoc = [
    ['Stock (ERP + Busy)', Math.round(t.stock)], ['Sundry Debtors (S.D)', Math.round(t.sd)], ['Fixed Assets', Math.round(t.fixed)], ['Bank', Math.round(t.bank)], ['Cash', Math.round(t.cash)], ['Other Assets', Math.round(t.otherA)], ['மொத்த சொத்து', Math.round(t.assets)],
    ['Sundry Creditors (S.C)', Math.round(t.sc)], ['Loans', Math.round(t.loans)], ['Other Liabilities', Math.round(t.otherL)], ['மொத்த கடன் / பாக்கி', Math.round(t.liab)], ['நிகர மதிப்பு (Net Worth)', Math.round(t.net)], ['Working Capital', Math.round(t.working)]
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ ...styles.card, borderLeft: '5px solid #0f172a' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0 }}>💰 Net Position (Admin மட்டும்)</h3>
          <ShareBar doc={{ title: 'Net Position', subtitle: `As on ${date}`, headers: ['விவரம்', '₹'], rows: rowsDoc, footer: [`நிகர மதிப்பு ₹${money(t.net)}`] }} />
        </div>
        <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 10px' }}>Stock மதிப்பு ERP + Busy-லிருந்து தானாக வரும். மற்றவற்றை நீங்கள் உள்ளிடுங்கள் — "Save" செய்யாமல் எண்களை மாற்றிப் பார்க்கலாம் (முடிவு உடனே மாறும்).</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <div style={{ background: '#ecfdf5', borderRadius: 8, padding: 10 }}><div style={{ fontSize: 12, color: '#047857' }}>மொத்த சொத்து</div><b style={{ fontSize: 20 }}>₹{money(t.assets)}</b></div>
          <div style={{ background: '#fef2f2', borderRadius: 8, padding: 10 }}><div style={{ fontSize: 12, color: '#b91c1c' }}>மொத்த கடன் / பாக்கி</div><b style={{ fontSize: 20 }}>₹{money(t.liab)}</b></div>
          <div style={{ background: t.net >= 0 ? '#eff6ff' : '#fff7ed', borderRadius: 8, padding: 10 }}><div style={{ fontSize: 12, color: '#1d4ed8' }}>நிகர மதிப்பு (Net Worth)</div><b data-testid="net" style={{ fontSize: 22, color: t.net >= 0 ? '#1d4ed8' : '#c2410c' }}>₹{money(t.net)}</b>{prev && <div style={{ fontSize: 11, color: '#64748b' }}>{prev.date}-லிருந்து {t.net - prev.totals.net >= 0 ? '▲' : '▼'} ₹{money(Math.abs(t.net - prev.totals.net))}</div>}</div>
          <div style={{ background: '#faf5ff', borderRadius: 8, padding: 10 }}><div style={{ fontSize: 12, color: '#7e22ce' }}>Working Capital</div><b style={{ fontSize: 20 }}>₹{money(t.working)}</b><div style={{ fontSize: 11, color: '#64748b' }}>Stock + S.D + Bank + Cash − S.C</div></div>
        </div>
      </div>

      <div style={styles.card}>
        <b>📦 Stock மதிப்பு (தானாக — Cost அடிப்படையில்)</b>
        <TableWrap minWidth={520}>
          <thead><tr style={{ background: '#0f172a', color: 'white' }}>{['விவரம்', 'Qty', 'Cost ₹', 'Cost இல்லாதது'].map(h => <th key={h} style={styles.thSub}>{h}</th>)}</tr></thead>
          <tbody>
            {stock.map(r => <tr key={r.label} style={{ borderBottom: '1px solid #e2e8f0' }}><td style={styles.td}>{r.label}</td><td style={styles.td}>{r.qty}</td><td style={styles.td}>₹{money(r.cost)}</td><td style={{ ...styles.td, color: r.noCost ? '#b45309' : '#64748b' }}>{r.noCost ? `⚠️ ${Math.round(r.noCost * 100) / 100}` : '-'}</td></tr>)}
            <tr style={{ background: '#f1f5f9', fontWeight: 'bold' }}><td style={styles.td}>மொத்த Stock</td><td style={styles.td}></td><td style={styles.td}>₹{money(stockTotal)}</td><td style={styles.td}>{stockMissing ? '⚠️' : ''}</td></tr>
          </tbody>
        </TableWrap>
        {stockMissing > 0 && <div style={{ fontSize: 12, color: '#92400e' }}>⚠️ Costing இல்லாத Stock மொத்தத்தில் சேரவில்லை (Cost Sheet போட்டால் சேரும்).</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        {list('sd', '👥 Sundry Debtors (S.D) — வர வேண்டியது', 'Party பெயர்', '#059669')}
        {list('bank', '🏦 Bank இருப்பு', 'Bank / Account', '#0369a1')}
        <div style={{ ...styles.card, borderTop: '4px solid #0891b2' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><b>💵 Cash in Hand</b><b style={{ color: '#0891b2' }}>₹{money(Number(sheet.cash) || 0)}</b></div>
          <input aria-label="Cash" type="number" placeholder="₹" value={sheet.cash} onChange={e => { setSheet(s => ({ ...s, cash: e.target.value })); setDirty(true); }} style={styles.input} />
        </div>
        {list('fixed', '🏭 Fixed Assets', 'Asset', '#7c3aed')}
        {list('otherA', '➕ மற்ற சொத்துகள் (Advance, GST Input…)', 'விவரம்', '#65a30d')}
        {list('sc', '🧾 Sundry Creditors (S.C) — கொடுக்க வேண்டியது', 'Party பெயர்', '#dc2626')}
        {list('loans', '🏛️ Loans', 'Loan / Lender', '#b91c1c')}
        {list('otherL', '➖ மற்ற கடன்கள் (GST Payable, Salary…)', 'விவரம்', '#ea580c')}
      </div>

      <div style={{ ...styles.card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" disabled={busy || !dirty} onClick={saveD} style={styles.secondaryBtn}>💾 Draft சேமி</button>
        <span style={{ color: '#94a3b8' }}>|</span>
        <input aria-label="Snapshot date" type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...styles.input, maxWidth: 160 }} />
        <input aria-label="Snapshot note" placeholder="குறிப்பு (எ.கா. மாத முடிவு)" value={note} onChange={e => setNote(e.target.value)} style={{ ...styles.input, maxWidth: 260 }} />
        <button type="button" disabled={busy} onClick={saveS} style={styles.primaryBtn}>📸 இந்தத் தேதிக்கு Snapshot சேமி</button>
        <button type="button" onClick={() => { if (window.confirm('எல்லா உள்ளீடுகளையும் அழிக்கவா? (Snapshot-கள் அழியாது)')) { setSheet(emptySheet()); setDirty(true); } }} style={styles.secondaryBtn}>🧹 புதிதாகத் தொடங்கு</button>
      </div>

      <div style={styles.card}>
        <b>🕒 சேமித்த Snapshot-கள் (மாற்றம் பார்க்க)</b>
        <TableWrap minWidth={760}>
          <thead><tr style={{ background: '#0f172a', color: 'white' }}>{['தேதி', 'குறிப்பு', 'Stock', 'S.D', 'Bank + Cash', 'S.C + Loans', 'Net Worth', 'முந்தையதிலிருந்து', ''].map(h => <th key={h} style={styles.thSub}>{h}</th>)}</tr></thead>
          <tbody>
            {snaps.length === 0 ? <tr><td style={styles.td} colSpan={9}>இன்னும் Snapshot இல்லை.</td></tr> : snaps.map((s, i) => {
              const older = snaps[i + 1]; const d = older ? s.totals.net - older.totals.net : null;
              return (
                <tr key={s.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={styles.td}><b>{s.date}</b></td><td style={styles.td}>{s.note || '-'}</td><td style={styles.td}>₹{money(s.totals.stock)}</td><td style={styles.td}>₹{money(s.totals.sd)}</td>
                  <td style={styles.td}>₹{money(s.totals.bank + s.totals.cash)}</td><td style={styles.td}>₹{money(s.totals.sc + s.totals.loans)}</td>
                  <td style={{ ...styles.td, fontWeight: 'bold' }}>₹{money(s.totals.net)}</td>
                  <td style={{ ...styles.td, color: d === null ? '#64748b' : d >= 0 ? '#059669' : '#dc2626' }}>{d === null ? '-' : `${d >= 0 ? '▲' : '▼'} ₹${money(Math.abs(d))}`}</td>
                  <td style={styles.td}>
                    <button type="button" onClick={() => { setSheet(s.sheet); setDirty(true); setDate(s.date); notify('இந்த Snapshot-ன் உள்ளீடுகள் ஏற்றப்பட்டன (Stock மதிப்பு இப்போதையது).', 'info'); }} style={{ ...styles.secondaryBtn, padding: '3px 8px', fontSize: 12 }}>ஏற்று</button>{' '}
                    <button type="button" onClick={() => del(s.id)} style={{ ...styles.dangerBtn, padding: '3px 8px', fontSize: 12 }}>🗑️</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      </div>
    </div>
  );
}
