import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { readTableFile } from '../lib/xlsx';
import { parseCsv } from '../lib/csv';
import { errMsg } from '../lib/supabase';
import {
  loadIndex, saveIndex, loadSnap, saveSnap, loadSales, saveSalesRange, removeSalesRange, monthsOf, parseStockReport, parseSalesReport,
  currentStock, totals, lineKey, datesBetween, missingDates, ymd, sizeLabel,
  type TradeIndex, type StockSnap, type ParsedStock, type ParsedSales, type SaleRow, type CurLine
} from '../lib/tradeStock';
import { logAction } from '../lib/audit';
import ShareBar from '../components/ShareBar';
import { Loading, ErrorBanner, TableWrap, EmptyRow, StatCard, notify, styles } from '../components/ui';

const money = (n: number) => Math.round(n).toLocaleString('en-IN');
const tabBtn = (a: boolean) => ({ ...(a ? styles.primaryBtn : styles.secondaryBtn), padding: '8px 14px', fontSize: '13px' });

interface PendStock { id: number; file: string; p: ParsedStock; shop: string; old: StockSnap | null; problems: string[]; notes: string[]; diff: { added: number; changed: number; gone: number; rows: (string | number)[][] }; busy?: boolean }
interface PendSales { id: number; file: string; p: ParsedSales; shop: string; problems: string[]; notes: string[]; replace: string[]; busy?: boolean }

let seq = 1;

export default function TradingModule({ user }: { user?: any }) {
  const [tab, setTab] = useState<'upload' | 'calendar' | 'stock' | 'sales'>('upload');
  const [ix, setIx] = useState<TradeIndex>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendStock, setPendStock] = useState<PendStock[]>([]);
  const [pendSales, setPendSales] = useState<PendSales[]>([]);
  const [reading, setReading] = useState('');

  const reload = useCallback(async () => {
    setError('');
    try { setIx(await loadIndex()); } catch (e: any) { setError('Load தோல்வி: ' + errMsg(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  const shops = Object.keys(ix).sort();

  // ------------------------------------------------------------ stock upload
  const onStockFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from((e.target.files || []) as ArrayLike<File>);
    e.target.value = '';
    for (const f of files) {
      setReading(`${f.name} படிக்கிறது...`);
      try {
        const p = parseStockReport(await readTableFile(f, parseCsv));
        const shop = p.showroom;
        const problems: string[] = [], notes: string[] = [];
        let old: StockSnap | null = null;
        if (!shop) problems.push('கோப்பில் Branch பெயர் இல்லை.');
        if (!p.asOn) problems.push('"As On" தேதி கோப்பில் இல்லை.');
        if (p.lines.length === 0) problems.push('Stock வரிகள் இல்லை.');
        if (p.reportTotal !== null && p.reportTotal !== p.qty) problems.push(`Report Total ${p.reportTotal} ≠ படித்த Qty ${p.qty}. கோப்பு முழுமையாக இல்லை.`);
        if (p.reportTotal === null) notes.push('Report-ல் Total வரி கிடைக்கவில்லை; Total சரிபார்க்க முடியவில்லை.');
        if (p.skipped) notes.push(`${p.skipped} வரிகள் புரியாமல் தவிர்க்கப்பட்டன.`);
        let diff: PendStock['diff'] = { added: 0, changed: 0, gone: 0, rows: [] };
        if (shop && p.asOn) {
          if (p.asOn > ymd(new Date())) problems.push(`"As On" தேதி (${p.asOn}) எதிர்காலத் தேதி.`);
          if (!ix[shop]) notes.push(`🆕 புதிய கடை "${shop}" சேர்க்கப்படும்.`);
          old = await loadSnap(shop);
          if (old) {
            if (p.asOn < old.asOn) problems.push(`ERP-ல் ஏற்கனவே புதிய Stock (${old.asOn}) உள்ளது. பழைய (${p.asOn}) Report ஏற்ற முடியாது.`);
            else if (p.asOn === old.asOn) notes.push(`அதே தேதி (${p.asOn}) Stock ஏற்கனவே உள்ளது; இது அதை மாற்றும்.`);
            const sales = await loadSales(shop, monthsOf(ix[shop]));
            const exp = currentStock(old, sales).lines;
            const em = new Map(exp.map(l => [lineKey(l), l.qty]));
            const nm = new Map(p.lines.map(l => [lineKey(l), l]));
            const rows: (string | number)[][] = [];
            p.lines.forEach(l => {
              const was = em.get(lineKey(l));
              if (was === undefined) { diff.added++; rows.push(['🆕 புதியது', l.item, l.design, sizeLabel(l.size), l.colour, 0, l.qty]); }
              else if (was !== l.qty) { diff.changed++; rows.push(['✏️ மாற்றம்', l.item, l.design, sizeLabel(l.size), l.colour, was, l.qty]); }
            });
            exp.forEach(l => { if (l.qty !== 0 && !nm.has(lineKey(l))) { diff.gone++; rows.push(['➖ இல்லை', l.item, l.design, sizeLabel(l.size), l.colour, l.qty, 0]); } });
            diff.rows = rows;
          } else notes.push('முதல் Stock Upload (ஒப்பிட பழைய Stock இல்லை).');
        }
        setPendStock(prev => [...prev, { id: seq++, file: f.name, p, shop, old, problems, notes, diff }]);
      } catch (err: any) { notify(`${f.name}: ${errMsg(err)}`, 'err'); }
    }
    setReading('');
  };

  const saveStock = async (x: PendStock) => {
    if (x.problems.length) return;
    setPendStock(prev => prev.map(y => (y.id === x.id ? { ...y, busy: true } : y)));
    try {
      const snap: StockSnap = { showroom: x.shop, asOn: x.p.asOn, uploadedAt: new Date().toISOString(), total: x.p.qty, lines: x.p.lines };
      await saveSnap(snap);
      const t = totals(snap.lines);
      const cur = await loadIndex(); // fresh – another upload may have changed it
      cur[x.shop] = { salesDays: {}, ...(cur[x.shop] || {}), stockAsOn: snap.asOn, stockAt: snap.uploadedAt, stockQty: t.qty, stockCost: Math.round(t.cost), stockMrp: Math.round(t.mrp) };
      await saveIndex(cur);
      logAction(`Busy Stock Upload ${x.shop} as on ${snap.asOn}: ${t.qty} pcs`);
      notify(`✅ ${x.shop}: ${t.qty} Pcs Stock சேமிக்கப்பட்டது (${snap.asOn}).`);
      setPendStock(prev => prev.filter(y => y.id !== x.id));
      await reload();
    } catch (err: any) {
      notify('Stock சேமிக்க முடியவில்லை: ' + errMsg(err), 'err');
      setPendStock(prev => prev.map(y => (y.id === x.id ? { ...y, busy: false } : y)));
    }
  };

  // ------------------------------------------------------------ sales upload
  const onSalesFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from((e.target.files || []) as ArrayLike<File>);
    e.target.value = '';
    for (const f of files) {
      setReading(`${f.name} படிக்கிறது...`);
      try {
        const p = parseSalesReport(await readTableFile(f, parseCsv));
        const problems: string[] = [], notes: string[] = [], replace: string[] = [];
        const shop = p.showroom;
        if (!shop) problems.push('கோப்பில் கடைப்பெயர் (MC : ...) இல்லை.');
        if (!p.from || !p.to) problems.push('கோப்பில் தேதி (From ... to ...) இல்லை.');
        if (p.rows.length === 0) problems.push('விற்பனை வரிகள் இல்லை.');
        if (p.reportQty !== null && p.reportQty !== p.qty) problems.push(`Report Total Qty ${p.reportQty} ≠ படித்த Qty ${p.qty}.`);
        if (p.reportAmount !== null && Math.abs(p.reportAmount - p.amount) > 1) problems.push(`Report Total Amount ${p.reportAmount} ≠ படித்த Amount ${p.amount}.`);
        if (p.reportQty === null) notes.push('Report-ல் Total வரி கிடைக்கவில்லை; Total சரிபார்க்க முடியவில்லை.');
        if (p.to && p.to > ymd(new Date())) problems.push(`தேதி (${p.to}) எதிர்காலத் தேதி.`);
        if (p.from && p.to && p.from > p.to) problems.push('From தேதி To தேதியைவிடப் பெரியது.');
        const days = p.from && p.to ? datesBetween(p.from, p.to) : [];
        if (days.length > 62) notes.push(`${days.length} நாள் Report; உறுதி செய்யவும்.`);
        if (!p.hasDateCol && days.length > 1) notes.push(`பல நாள் Report (${p.from} → ${p.to}); தேதி வாரியாகப் பிரிக்க முடியாது, ${p.to} தேதியில் சேமிக்கப்படும்.`);
        if (shop && !ix[shop]) notes.push(`🆕 புதிய கடை "${shop}" சேர்க்கப்படும்.`);
        if (shop && ix[shop]) days.forEach(d => { if (ix[shop].salesDays[d]) replace.push(d); });
        if (replace.length) notes.push(`⚠️ இந்தத் தேதிகள் ஏற்கனவே உள்ளன, மாற்றப்படும் (சேராது): ${replace.slice(0, 6).join(', ')}${replace.length > 6 ? '…' : ''}`);
        if (shop && ix[shop]?.stockAsOn && p.to && p.to <= (ix[shop].stockAsOn as string)) notes.push(`இந்த விற்பனை Stock (${ix[shop].stockAsOn}) தேதிக்கு முந்தையது; Stock-ல் மீண்டும் கழியாது.`);
        setPendSales(prev => [...prev, { id: seq++, file: f.name, p, shop, problems, notes, replace }]);
      } catch (err: any) { notify(`${f.name}: ${errMsg(err)}`, 'err'); }
    }
    setReading('');
  };

  const saveSalesFile = async (x: PendSales) => {
    if (x.problems.length) return;
    setPendSales(prev => prev.map(y => (y.id === x.id ? { ...y, busy: true } : y)));
    try {
      const { p, shop } = x;
      const stamp = new Date().toISOString();
      await saveSalesRange(shop, p.from, p.to, p.rows);
      const cur = await loadIndex();
      const e = { salesDays: {}, ...(cur[shop] || {}) } as TradeIndex[string];
      const days = datesBetween(p.from, p.to);
      days.forEach(d => { delete e.salesDays[d]; });
      const by: Record<string, SaleRow[]> = {};
      p.rows.forEach(r => { (by[r.date] = by[r.date] || []).push(r); });
      days.forEach(d => {
        const rs = by[d] || [];
        e.salesDays[d] = { rows: rs.length, qty: rs.reduce((a, r) => a + r.qty, 0), amount: Math.round(rs.reduce((a, r) => a + r.amount, 0)), at: stamp, ...(!p.hasDateCol && days.length > 1 ? { range: `${p.from}→${p.to}` } : {}) };
      });
      cur[shop] = e;
      await saveIndex(cur);
      logAction(`Busy Sales Upload ${shop} ${p.from}→${p.to}: ${p.qty} pcs ₹${p.amount}`);
      notify(`✅ ${shop}: ${p.rows.length} வரிகள், ${p.qty} Pcs, ₹${money(p.amount)} சேமிக்கப்பட்டது.`);
      setPendSales(prev => prev.filter(y => y.id !== x.id));
      await reload();
    } catch (err: any) {
      notify('Sales சேமிக்க முடியவில்லை: ' + errMsg(err), 'err');
      setPendSales(prev => prev.map(y => (y.id === x.id ? { ...y, busy: false } : y)));
    }
  };

  const undoDay = async (shop: string, d: string) => {
    if (!window.confirm(`${shop} — ${d} விற்பனையை நீக்கவா?`)) return;
    try {
      const info = ix[shop]?.salesDays[d];
      const [from, to] = info?.range ? info.range.split('→') : [d, d];
      await removeSalesRange(shop, from, to);
      const cur = await loadIndex();
      datesBetween(from, to).forEach(x => { if (cur[shop]) delete cur[shop].salesDays[x]; });
      await saveIndex(cur);
      logAction(`Busy Sales நீக்கம் ${shop} ${from}→${to}`);
      notify('நீக்கப்பட்டது.');
      await reload();
    } catch (err: any) { notify(errMsg(err), 'err'); }
  };

  const admin = String(user?.role || '').toUpperCase() === 'ADMIN';

  if (loading) return <Loading />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {error && <ErrorBanner message={error} onRetry={reload} />}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setTab('upload')} style={tabBtn(tab === 'upload')}>⬆️ Upload</button>
        <button type="button" onClick={() => setTab('calendar')} style={tabBtn(tab === 'calendar')}>📅 Upload நிலை</button>
        <button type="button" onClick={() => setTab('stock')} style={tabBtn(tab === 'stock')}>📦 Stock Report</button>
        <button type="button" onClick={() => setTab('sales')} style={tabBtn(tab === 'sales')}>🧾 Sales Report</button>
      </div>

      {tab === 'upload' && (
        <>
          <div style={styles.card}>
            <h4 style={{ margin: '0 0 6px 0' }}>📦 1. Busy Stock Report (BCN wise Stock Status) Upload</h4>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 10px 0' }}>Excel (.xlsx) தேர்வு செய்யுங்கள் — பல கடைகளின் கோப்புகளை ஒரே நேரத்தில் தேர்வு செய்யலாம். கடைப்பெயர், தேதி கோப்பிலிருந்தே எடுக்கப்படும். புதிய Stock பழையதை <b>மாற்றும்</b> (சேராது), அதனால் தினசரி / வாராந்திர / மாதாந்திரம் எப்போது ஏற்றினாலும் இரட்டிப்பாகாது.</p>
            <input type="file" multiple accept=".xlsx,.csv,.txt,.tsv" onChange={onStockFiles} />
          </div>
          {reading && <div style={{ ...styles.card, color: '#1d4ed8' }}>⏳ {reading}</div>}
          {pendStock.map(x => {
            const t = totals(x.p.lines);
            return (
              <div key={x.id} style={{ ...styles.card, borderLeft: `4px solid ${x.problems.length ? '#dc2626' : '#059669'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <b>📄 {x.file}</b>
                  <button type="button" onClick={() => setPendStock(prev => prev.filter(y => y.id !== x.id))} style={styles.secondaryBtn}>✕ தவிர்</button>
                </div>
                <div style={{ fontSize: '13px', margin: '8px 0' }}>கடை: <b>{x.shop || '-'}</b> • As On: <b>{x.p.asOn || '-'}</b> • <b>{x.p.lines.length}</b> வரிகள் • <b>{t.qty}</b> Pcs • Cost ₹{money(t.cost)} • MRP ₹{money(t.mrp)}</div>
                {x.problems.map((m, i) => <div key={i} style={{ color: '#b91c1c', fontSize: '13px' }}>❌ {m}</div>)}
                {x.notes.map((m, i) => <div key={i} style={{ color: '#92400e', fontSize: '12px' }}>ℹ️ {m}</div>)}
                {x.old && <div style={{ fontSize: '13px', marginTop: '6px' }}>ERP-ல் இப்போதுள்ளதுடன் ஒப்பீடு: 🆕 புதியது <b>{x.diff.added}</b> • ✏️ மாற்றம் <b>{x.diff.changed}</b> • ➖ இல்லாதவை <b>{x.diff.gone}</b></div>}
                {x.diff.rows.length > 0 && <DiffTable rows={x.diff.rows} title={`Stock ஒப்பீடு — ${x.shop}`} />}
                <div style={{ marginTop: '10px' }}>
                  <button type="button" disabled={x.busy || x.problems.length > 0} onClick={() => saveStock(x)} style={{ ...styles.successBtn, opacity: x.problems.length ? 0.5 : 1 }}>{x.busy ? 'சேமிக்கிறது...' : '✅ உறுதி செய்து Stock சேமி'}</button>
                </div>
              </div>
            );
          })}

          <div style={styles.card}>
            <h4 style={{ margin: '0 0 6px 0' }}>🧾 2. Busy Sales Report (Sales Analysis) Upload</h4>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 10px 0' }}>ஒரு நாள், ஒரு வாரம் அல்லது ஒரு மாதம் — எந்தக் காலத்து Report-ஐயும் ஏற்றலாம். அதே தேதியை மீண்டும் ஏற்றினால் பழையது மாற்றப்படும் (சேராது). Report Total-உடன் பொருந்தாவிட்டால் சேமிக்காது.</p>
            <input type="file" multiple accept=".xlsx,.csv,.txt,.tsv" onChange={onSalesFiles} />
          </div>
          {pendSales.map(x => (
            <div key={x.id} style={{ ...styles.card, borderLeft: `4px solid ${x.problems.length ? '#dc2626' : '#059669'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <b>📄 {x.file}</b>
                <button type="button" onClick={() => setPendSales(prev => prev.filter(y => y.id !== x.id))} style={styles.secondaryBtn}>✕ தவிர்</button>
              </div>
              <div style={{ fontSize: '13px', margin: '8px 0' }}>கடை: <b>{x.shop || '-'}</b> • தேதி: <b>{x.p.from}{x.p.to !== x.p.from ? ` → ${x.p.to}` : ''}</b> • <b>{x.p.rows.length}</b> வரிகள் • <b>{x.p.qty}</b> Pcs • ₹<b>{money(x.p.amount)}</b>{x.p.reportQty !== null ? ' • ✅ Report Total பொருந்தியது' : ''}</div>
              {x.problems.map((m, i) => <div key={i} style={{ color: '#b91c1c', fontSize: '13px' }}>❌ {m}</div>)}
              {x.notes.map((m, i) => <div key={i} style={{ color: '#92400e', fontSize: '12px' }}>ℹ️ {m}</div>)}
              <div style={{ marginTop: '10px' }}>
                <button type="button" disabled={x.busy || x.problems.length > 0} onClick={() => saveSalesFile(x)} style={{ ...styles.successBtn, opacity: x.problems.length ? 0.5 : 1 }}>{x.busy ? 'சேமிக்கிறது...' : '✅ உறுதி செய்து Sales சேமி'}</button>
              </div>
            </div>
          ))}
        </>
      )}

      {tab === 'calendar' && <Calendar ix={ix} shops={shops} admin={admin} onUndo={undoDay} />}
      {tab === 'stock' && <StockReport ix={ix} shops={shops} />}
      {tab === 'sales' && <SalesReport ix={ix} shops={shops} />}
    </div>
  );
}

function DiffTable({ rows, title }: { rows: (string | number)[][]; title: string }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => { const t = q.trim().toLowerCase(); return (t ? rows.filter(r => r.some(c => String(c).toLowerCase().includes(t))) : rows); }, [rows, q]);
  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '6px' }}>
        <input placeholder="🔍 தேடு..." value={q} onChange={e => setQ(e.target.value)} style={{ ...styles.input, maxWidth: '220px' }} />
        <span style={{ fontSize: '12px', color: '#64748b' }}>{shown.length} வரிகள் (முதல் 200 காட்டப்படுகின்றன)</span>
        <div style={{ marginLeft: 'auto' }}><ShareBar doc={{ title, headers: ['நிலை', 'Item', 'Design', 'Size', 'Colour', 'ERP Qty', 'புதிய Qty'], rows: shown }} /></div>
      </div>
      <div style={{ maxHeight: '260px', overflow: 'auto' }}>
        <TableWrap minWidth={640}>
          <thead><tr style={{ background: '#0f172a', color: 'white' }}>{['நிலை', 'Item', 'Design', 'Size', 'Colour', 'ERP Qty', 'புதிய Qty'].map(h => <th key={h} style={styles.thSub}>{h}</th>)}</tr></thead>
          <tbody>{shown.slice(0, 200).map((r, i) => <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>{r.map((c, j) => <td key={j} style={styles.td}>{c}</td>)}</tr>)}</tbody>
        </TableWrap>
      </div>
    </div>
  );
}

function Calendar({ ix, shops, admin, onUndo }: { ix: TradeIndex; shops: string[]; admin: boolean; onUndo: (shop: string, d: string) => void }) {
  const days = useMemo(() => { const t = new Date(); return datesBetween(ymd(new Date(t.getFullYear(), t.getMonth(), t.getDate() - 13)), ymd(new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1))); }, []);
  const missRows = shops.map(s => [s, ix[s].stockAsOn || 'இல்லை', missingDates(ix[s], 7).join(', ') || '✅ எல்லாம் ஏற்றப்பட்டது']);
  return (
    <div style={styles.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
        <h4 style={{ margin: 0 }}>📅 கடை வாரி Upload நிலை (கடந்த 14 நாள்)</h4>
        <ShareBar doc={{ title: 'Busy Upload பாக்கி (கடந்த 7 நாள்)', headers: ['கடை', 'Stock As On', 'Sales Upload இல்லாத தேதிகள்'], rows: missRows }} />
      </div>
      {shops.length === 0 ? <p style={{ color: '#64748b' }}>இன்னும் எந்தக் கடையின் Report-ம் ஏற்றப்படவில்லை.</p> : (
        <TableWrap minWidth={900}>
          <thead><tr style={{ background: '#0f172a', color: 'white' }}><th style={styles.thSub}>கடை</th><th style={styles.thSub}>Stock As On</th>{days.map(d => <th key={d} style={{ ...styles.thSub, fontSize: '10px', padding: '6px 3px' }}>{d.slice(5)}</th>)}</tr></thead>
          <tbody>{shops.map(s => (
            <tr key={s} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={styles.td}><b>{s}</b></td>
              <td style={styles.td}>{ix[s].stockAsOn || '❌'}</td>
              {days.map(d => { const i = ix[s].salesDays[d]; return (
                <td key={d} style={{ ...styles.td, textAlign: 'center', padding: '4px 2px', background: i ? '#f0fdf4' : '#fef2f2' }} title={i ? `${i.qty} Pcs ₹${i.amount}${i.range ? ' (' + i.range + ')' : ''}` : 'Upload இல்லை'}>
                  {i ? <span style={{ cursor: admin ? 'pointer' : 'default' }} onClick={() => admin && onUndo(s, d)}>✅</span> : '❌'}
                </td>
              ); })}
            </tr>
          ))}</tbody>
        </TableWrap>
      )}
      <p style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>✅ மேல் Admin அழுத்தினால் அந்த நாளின் Upload நீக்கப்படும் (தவறாக ஏற்றியிருந்தால்). ❌ = அந்த நாள் Sales Upload இல்லை.</p>
    </div>
  );
}

function StockReport({ ix, shops }: { ix: TradeIndex; shops: string[] }) {
  const [shop, setShop] = useState('');
  const [lines, setLines] = useState<CurLine[]>([]);
  const [snapInfo, setSnapInfo] = useState<{ asOn: string; unmatched: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string>('');

  useEffect(() => {
    if (!shop) { setLines([]); setSnapInfo(null); return; }
    let live = true;
    (async () => {
      setBusy(true);
      try {
        const snap = await loadSnap(shop);
        if (!snap) { if (live) { setLines([]); setSnapInfo(null); } return; }
        const sales = await loadSales(shop, monthsOf(ix[shop]));
        const r = currentStock(snap, sales);
        if (live) { setLines(r.lines); setSnapInfo({ asOn: snap.asOn, unmatched: r.unmatched.length }); }
      } catch (e: any) { notify(errMsg(e), 'err'); } finally { if (live) setBusy(false); }
    })();
    return () => { live = false; };
  }, [shop, ix]);

  const summary = shops.map(s => {
    const e = ix[s];
    const sold = Object.entries(e.salesDays).filter(([d]) => d > (e.stockAsOn || '9999')).reduce((a, [, v]) => a + v.qty, 0);
    return { s, asOn: e.stockAsOn || '-', qty: (e.stockQty || 0) - sold, cost: e.stockCost || 0, mrp: e.stockMrp || 0, sold };
  });

  const groups = useMemo(() => {
    const t = q.trim().toLowerCase();
    const m = new Map<string, { item: string; qty: number; cost: number; mrp: number; ls: CurLine[] }>();
    lines.filter(l => l.qty !== 0 && (!t || `${l.item} ${l.design} ${l.colour}`.toLowerCase().includes(t))).forEach(l => {
      const g = m.get(l.item) || { item: l.item, qty: 0, cost: 0, mrp: 0, ls: [] };
      g.qty += l.qty; g.cost += l.qty * l.cost; g.mrp += l.qty * l.mrp; g.ls.push(l); m.set(l.item, g);
    });
    return Array.from(m.values()).sort((a, b) => b.cost - a.cost);
  }, [lines, q]);
  const tot = totals(lines);
  const bySize = useMemo(() => { const m = new Map<string, number>(); lines.forEach(l => { const k = sizeLabel(l.size); m.set(k, (m.get(k) || 0) + l.qty); }); return Array.from(m.entries()).filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]); }, [lines]);
  const neg = lines.filter(l => l.qty < 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
          <h4 style={{ margin: 0 }}>🏬 எல்லாக் கடைகளும் (Cost = Busy Sales Price)</h4>
          <ShareBar doc={{ title: 'Trading Stock — கடை வாரி', headers: ['கடை', 'Stock As On', 'Qty (இப்போது)', 'Cost மதிப்பு ₹', 'MRP மதிப்பு ₹'], rows: summary.map(r => [r.s, r.asOn, r.qty, r.cost, r.mrp]), footer: [`மொத்த Qty: ${summary.reduce((a, r) => a + r.qty, 0)} • Cost ₹${money(summary.reduce((a, r) => a + r.cost, 0))} • MRP ₹${money(summary.reduce((a, r) => a + r.mrp, 0))} (Cost, MRP: Stock As On நாளில்)`] }} />
        </div>
        <TableWrap minWidth={640}>
          <thead><tr style={{ background: '#0f172a', color: 'white' }}>{['கடை', 'Stock As On', 'Qty (இப்போது)', 'அதன்பின் விற்றது', 'Cost ₹', 'MRP ₹', ''].map(h => <th key={h} style={styles.thSub}>{h}</th>)}</tr></thead>
          <tbody>{summary.length === 0 ? <EmptyRow cols={7} text="Stock Upload செய்யப்படவில்லை." /> : summary.map(r => (
            <tr key={r.s} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={styles.td}><b>{r.s}</b></td><td style={styles.td}>{r.asOn}</td><td style={{ ...styles.td, fontWeight: 'bold' }}>{r.qty}</td><td style={styles.td}>{r.sold}</td><td style={styles.td}>₹{money(r.cost)}</td><td style={styles.td}>₹{money(r.mrp)}</td>
              <td style={styles.td}><button type="button" onClick={() => setShop(r.s)} style={{ ...styles.secondaryBtn, padding: '4px 10px', fontSize: '12px' }}>விவரம் →</button></td>
            </tr>
          ))}</tbody>
        </TableWrap>
      </div>

      {shop && (
        <div style={styles.card}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
            <h4 style={{ margin: 0 }}>📦 {shop}</h4>
            <select value={shop} onChange={e => setShop(e.target.value)} style={{ ...styles.input, maxWidth: '220px' }}>{shops.map(s => <option key={s} value={s}>{s}</option>)}</select>
            <input placeholder="🔍 Item / Design / Colour தேடு..." value={q} onChange={e => setQ(e.target.value)} style={{ ...styles.input, maxWidth: '260px' }} />
            <div style={{ marginLeft: 'auto' }}><ShareBar doc={{ title: `Trading Stock — ${shop}`, subtitle: snapInfo ? `Stock As On ${snapInfo.asOn} + அதன்பின் விற்பனை கழிப்பு` : '', headers: ['Item', 'Design', 'Size', 'Colour', 'MRP', 'Cost', 'Qty', 'Cost மதிப்பு', 'MRP மதிப்பு'], rows: groups.flatMap(g => g.ls.map(l => [l.item, l.design, sizeLabel(l.size), l.colour, l.mrp, l.cost, l.qty, Math.round(l.qty * l.cost), Math.round(l.qty * l.mrp)])), footer: [`மொத்தம்: ${tot.qty} Pcs • Cost ₹${money(tot.cost)} • MRP ₹${money(tot.mrp)}`] }} /></div>
          </div>
          {busy ? <Loading /> : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', marginBottom: '12px' }}>
                <StatCard label="மொத்த Pcs" value={tot.qty} color="#2563eb" />
                <StatCard label="Cost மதிப்பு" value={`₹${money(tot.cost)}`} color="#059669" />
                <StatCard label="MRP மதிப்பு" value={`₹${money(tot.mrp)}`} color="#7c3aed" />
                <StatCard label="எதிர்பார்க்கும் Margin" value={`₹${money(tot.mrp - tot.cost)}`} color="#d97706" />
              </div>
              {snapInfo && <div style={{ fontSize: '12px', color: '#475569', marginBottom: '8px' }}>Stock As On: <b>{snapInfo.asOn}</b>{snapInfo.unmatched > 0 ? ` • ⚠️ Stock-ல் பொருந்தாத ${snapInfo.unmatched} விற்பனை வரிகள் (Qty மொத்தத்தில் கழியவில்லை)` : ''}</div>}
              {neg.length > 0 && <div style={{ color: '#b91c1c', fontSize: '13px', marginBottom: '8px' }}>⚠️ {neg.length} வரிகளில் Qty எதிர்மறை (Busy-ல் புதிய Stock Report ஏற்றினால் சரியாகும்): {neg.slice(0, 3).map(l => `${l.item} ${sizeLabel(l.size)} (${l.qty})`).join('; ')}</div>}
              {bySize.length > 0 && <div style={{ fontSize: '12px', marginBottom: '10px' }}><b>Size வாரி:</b> {bySize.slice(0, 14).map(([s, n]) => `${s}: ${n}`).join(' • ')}</div>}
              <TableWrap minWidth={720}>
                <thead><tr style={{ background: '#0f172a', color: 'white' }}>{['Item', 'Qty', 'Cost ₹', 'MRP ₹', ''].map(h => <th key={h} style={styles.thSub}>{h}</th>)}</tr></thead>
                {groups.length === 0 && <tbody><EmptyRow cols={5} text="Stock இல்லை." /></tbody>}
                {groups.slice(0, 300).map(g => (
                    <tbody key={g.item}>
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={styles.td}><b>{g.item}</b></td><td style={styles.td}>{g.qty}</td><td style={styles.td}>₹{money(g.cost)}</td><td style={styles.td}>₹{money(g.mrp)}</td>
                        <td style={styles.td}><button type="button" onClick={() => setOpen(open === g.item ? '' : g.item)} style={{ ...styles.secondaryBtn, padding: '3px 9px', fontSize: '12px' }}>{open === g.item ? '▲' : '▼ Size / Colour'}</button></td>
                      </tr>
                      {open === g.item && (
                        <tr><td colSpan={5} style={{ ...styles.td, background: '#f8fafc' }}>
                          <TableWrap minWidth={560}>
                            <thead><tr>{['Design', 'Size', 'Colour', 'MRP', 'Cost', 'Qty'].map(h => <th key={h} style={styles.thSub}>{h}</th>)}</tr></thead>
                            <tbody>{g.ls.sort((a, b) => sizeLabel(a.size).localeCompare(sizeLabel(b.size), undefined, { numeric: true })).map((l, i) => <tr key={i}><td style={styles.td}>{l.design}</td><td style={styles.td}>{l.size}</td><td style={styles.td}>{l.colour}</td><td style={styles.td}>₹{l.mrp}</td><td style={styles.td}>₹{l.cost}</td><td style={{ ...styles.td, fontWeight: 'bold', color: l.qty < 0 ? '#dc2626' : undefined }}>{l.qty}</td></tr>)}</tbody>
                          </TableWrap>
                        </td></tr>
                      )}
                    </tbody>
                  ))}
              </TableWrap>
              {groups.length > 300 && <p style={{ fontSize: '12px', color: '#64748b' }}>முதல் 300 Item காட்டப்படுகின்றன; தேடலைப் பயன்படுத்தவும். Print/Excel-ல் எல்லாம் வரும்.</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SalesReport({ ix, shops }: { ix: TradeIndex; shops: string[] }) {
  const today = new Date();
  const [from, setFrom] = useState(ymd(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [to, setTo] = useState(ymd(today));
  const [shop, setShop] = useState('');
  const [rows, setRows] = useState<(SaleRow & { shop: string })[]>([]);
  const [busy, setBusy] = useState(false);
  const [by, setBy] = useState<'shop' | 'size' | 'item' | 'day'>('shop');

  const run = async () => {
    setBusy(true);
    try {
      const out: (SaleRow & { shop: string })[] = [];
      const months = datesBetween(from, to).map(d => d.slice(0, 7)).filter((m, i, a) => a.indexOf(m) === i);
      for (const s of shop ? [shop] : shops) {
        const ms = months.filter(m => monthsOf(ix[s]).includes(m));
        (await loadSales(s, ms)).forEach(r => { if (r.date >= from && r.date <= to) out.push({ ...r, shop: s }); });
      }
      setRows(out);
    } catch (e: any) { notify(errMsg(e), 'err'); } finally { setBusy(false); }
  };

  const agg = useMemo(() => {
    const m = new Map<string, { k: string; qty: number; amt: number; mrp: number }>();
    rows.forEach(r => {
      const k = by === 'shop' ? r.shop : by === 'size' ? sizeLabel(r.size) : by === 'item' ? r.item : r.date;
      const g = m.get(k) || { k, qty: 0, amt: 0, mrp: 0 };
      g.qty += r.qty; g.amt += r.amount; g.mrp += r.qty * r.mrp; m.set(k, g);
    });
    return Array.from(m.values()).sort((a, b) => (by === 'day' ? a.k.localeCompare(b.k) : b.amt - a.amt));
  }, [rows, by]);
  const tq = rows.reduce((a, r) => a + r.qty, 0), ta = rows.reduce((a, r) => a + r.amount, 0), tm = rows.reduce((a, r) => a + r.qty * r.mrp, 0);
  const label = { shop: 'கடை', size: 'Size', item: 'Item', day: 'தேதி' }[by];
  const disc = (g: { amt: number; mrp: number }) => (g.mrp > 0 ? `${Math.round((1 - (g.amt * 1.05) / g.mrp) * 100)}%` : '-');

  return (
    <div style={styles.card}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '12px' }}>
        <div><label style={styles.label}>From</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} style={styles.input} /></div>
        <div><label style={styles.label}>To</label><input type="date" value={to} onChange={e => setTo(e.target.value)} style={styles.input} /></div>
        <div><label style={styles.label}>கடை</label><select value={shop} onChange={e => setShop(e.target.value)} style={styles.input}><option value="">எல்லாக் கடையும்</option>{shops.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
        <div><label style={styles.label}>வாரியாக</label><select value={by} onChange={e => setBy(e.target.value as any)} style={styles.input}><option value="shop">கடை வாரி</option><option value="size">Size வாரி</option><option value="item">Item வாரி</option><option value="day">தேதி வாரி</option></select></div>
        <button type="button" onClick={run} disabled={busy} style={styles.primaryBtn}>{busy ? '...' : 'Report காட்டு'}</button>
        <div style={{ marginLeft: 'auto' }}><ShareBar doc={{ title: `Trading Sales — ${label} வாரி`, subtitle: `${from} → ${to}${shop ? ' • ' + shop : ''}`, headers: [label, 'Qty', 'விற்பனை ₹ (GST நீங்கலாக)', 'MRP மதிப்பு ₹', 'தள்ளுபடி %'], rows: agg.map(g => [g.k, g.qty, Math.round(g.amt), Math.round(g.mrp), disc(g)]), footer: [`மொத்தம்: ${tq} Pcs • ₹${money(ta)}`] }} /></div>
      </div>
      {rows.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', marginBottom: '12px' }}>
        <StatCard label="விற்ற Pcs" value={tq} color="#2563eb" /><StatCard label="விற்பனை (GST நீங்கலாக)" value={`₹${money(ta)}`} color="#059669" /><StatCard label="MRP மதிப்பு" value={`₹${money(tm)}`} color="#7c3aed" />
      </div>}
      <TableWrap minWidth={560}>
        <thead><tr style={{ background: '#0f172a', color: 'white' }}>{[label, 'Qty', 'விற்பனை ₹', 'MRP மதிப்பு ₹', 'தள்ளுபடி % (GST உட்பட)'].map(h => <th key={h} style={styles.thSub}>{h}</th>)}</tr></thead>
        <tbody>{agg.length === 0 ? <EmptyRow cols={5} text="காலத்தைத் தேர்ந்து 'Report காட்டு' அழுத்தவும்." /> : agg.slice(0, 400).map(g => <tr key={g.k} style={{ borderBottom: '1px solid #e2e8f0' }}><td style={styles.td}><b>{g.k}</b></td><td style={styles.td}>{g.qty}</td><td style={styles.td}>₹{money(g.amt)}</td><td style={styles.td}>₹{money(g.mrp)}</td><td style={styles.td}>{disc(g)}</td></tr>)}</tbody>
      </TableWrap>
    </div>
  );
}
