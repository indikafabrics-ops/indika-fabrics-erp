import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { readTableFile } from '../lib/xlsx';
import { parseCsv } from '../lib/csv';
import { errMsg } from '../lib/supabase';
import {
  loadIndex, saveIndex, loadSnap, saveSnap, parseStockReport,
  currentStock, totals, unitCost, lineKey, ymd, sizeLabel,
  type TradeIndex, type StockSnap, type ParsedStock, type CurLine
} from '../lib/tradeStock';
import { logAction } from '../lib/audit';
import ShareBar from '../components/ShareBar';
import ShowroomStock from './ShowroomStock';
import { Loading, ErrorBanner, TableWrap, EmptyRow, StatCard, notify, styles } from '../components/ui';

const money = (n: number) => Math.round(n).toLocaleString('en-IN');
const tabBtn = (a: boolean) => ({ ...(a ? styles.primaryBtn : styles.secondaryBtn), padding: '8px 14px', fontSize: '13px' });

interface PendStock { id: number; file: string; p: ParsedStock; shop: string; old: StockSnap | null; problems: string[]; notes: string[]; diff: { added: number; changed: number; gone: number; rows: (string | number)[][] }; busy?: boolean }

let seq = 1;

export default function TradingModule({ user }: { user?: any }) {
  const [tab, setTab] = useState<'upload' | 'showroom' | 'calendar' | 'stock'>('upload');
  const [ix, setIx] = useState<TradeIndex>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendStock, setPendStock] = useState<PendStock[]>([]);
  const [reading, setReading] = useState('');

  const reload = useCallback(async () => {
    setError('');
    try { setIx(await loadIndex()); } catch (e: any) { setError('Load தோல்வி: ' + errMsg(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  const shops = Object.keys(ix).sort();

  // ------------------------------------------------------------ stock upload
  /** all safety checks of one Busy stock file (also re-run after the shop / date is typed by hand) */
  const evaluate = async (p: ParsedStock, shop: string, asOn: string) => {
    const problems: string[] = [], notes: string[] = [];
    let old: StockSnap | null = null;
    if (!shop) problems.push('கடை பெயர் இல்லை — கீழே கடையைத் தேர்வு / உள்ளிடவும்.');
    if (!asOn) problems.push('"As On" தேதி இல்லை — கீழே தேதியைத் தேர்வு செய்யவும்.');
    if (p.lines.length === 0) problems.push('Stock வரிகள் இல்லை.');
    if (p.reportTotal !== null && p.reportTotal !== p.qty) problems.push(`Report Total ${p.reportTotal} ≠ படித்த Qty ${p.qty}. கோப்பு முழுமையாக இல்லை.`);
    if (p.reportTotal === null) notes.push('Report-ல் Total வரி கிடைக்கவில்லை; Total சரிபார்க்க முடியவில்லை.');
    if (p.skipped) notes.push(`${p.skipped} வரிகள் புரியாமல் தவிர்க்கப்பட்டன.`);
    let diff: PendStock['diff'] = { added: 0, changed: 0, gone: 0, rows: [] };
    if (shop && asOn) {
      if (asOn > ymd(new Date())) problems.push(`"As On" தேதி (${asOn}) எதிர்காலத் தேதி.`);
      if (!ix[shop]) notes.push(`🆕 புதிய கடை "${shop}" சேர்க்கப்படும்.`);
      old = await loadSnap(shop);
      if (old) {
        if (asOn < old.asOn) problems.push(`இப்போதுள்ள Stock ${old.asOn}; இந்த file (${asOn}) பழையது — ஏற்ற முடியாது. சமீபத்திய file-ஐ ஏற்றவும்.`);
        else if (asOn === old.asOn) notes.push(`அதே தேதி (${asOn}) Stock ஏற்கனவே உள்ளது; இது அதை மாற்றும்.`);
        const exp = currentStock(old, []).lines; // the last upload IS the stock (no sales are taken off)
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
    return { problems, notes, old, diff };
  };

  /** file had no shop / date at the top (trimmed file): use what the user typed */
  const applyManual = async (x: PendStock, shop: string, asOn: string) => {
    const p = { ...x.p, showroom: shop.trim(), asOn };
    const ev = await evaluate(p, shop.trim(), asOn);
    setPendStock(prev => prev.map(y => (y.id === x.id ? { ...y, p, shop: shop.trim(), ...ev } : y)));
  };

  const onStockFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from((e.target.files || []) as ArrayLike<File>);
    e.target.value = '';
    for (const f of files) {
      setReading(`${f.name} படிக்கிறது...`);
      try {
        const p = parseStockReport(await readTableFile(f, parseCsv));
        const ev = await evaluate(p, p.showroom, p.asOn);
        setPendStock(prev => [...prev, { id: seq++, file: f.name, p, shop: p.showroom, ...ev }]);
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
      notify(`✅ ${x.shop}: ${t.qty} Pcs Stock சேமிக்கப்பட்டது (${snap.asOn}). Showroom Entry / Edit / Delete: "🏬 Showroom Stock" tab-ல்.`);
      setPendStock(prev => prev.filter(y => y.id !== x.id));
      await reload();
    } catch (err: any) {
      notify('Stock சேமிக்க முடியவில்லை: ' + errMsg(err), 'err');
      setPendStock(prev => prev.map(y => (y.id === x.id ? { ...y, busy: false } : y)));
    }
  };

  if (loading) return <Loading />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {error && <ErrorBanner message={error} onRetry={reload} />}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setTab('upload')} style={tabBtn(tab === 'upload')}>⬆️ Stock Upload</button>
        <button type="button" onClick={() => setTab('showroom')} style={tabBtn(tab === 'showroom')}>🏬 Showroom Stock (Busy + ERP)</button>
        <button type="button" onClick={() => setTab('calendar')} style={tabBtn(tab === 'calendar')}>📅 Upload நிலை</button>
        <button type="button" onClick={() => setTab('stock')} style={tabBtn(tab === 'stock')}>📦 Stock Report</button>
      </div>

      {tab === 'upload' && (
        <>
          <div style={styles.card}>
            <h4 style={{ margin: '0 0 6px 0' }}>📦 1. Busy Stock Report (BCN wise Stock Status) Upload</h4>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 10px 0' }}>Excel (.xlsx) அல்லது CSV தேர்வு செய்யுங்கள் — பல கடைகளின் கோப்புகளை ஒரே நேரத்தில் தேர்வு செய்யலாம். கடைப்பெயர், தேதி கோப்பிலிருந்தே எடுக்கப்படும். <b>கடைசியாக ஏற்றிய file-ன் Stock தான் இறுதி Stock</b> — பழையதை முழுவதும் மாற்றும் (சேராது, விற்பனை கழியாது). தினமும் இந்த ஒரு Report-ஐ ஏற்றினால் போதும்; Sales Report தேவையில்லை.</p>
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
                {(!x.shop || !x.p.asOn) && <ManualShopDate shops={shops} initShop={x.shop} initDate={x.p.asOn} onApply={(sh, d) => applyManual(x, sh, d)} />}
                {x.problems.map((m, i) => <div key={i} style={{ color: '#b91c1c', fontSize: '13px' }}>❌ {m}</div>)}
                {x.notes.map((m, i) => <div key={i} style={{ color: '#92400e', fontSize: '12px' }}>ℹ️ {m}</div>)}
                {x.p.warnings.length > 0 && <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 6, padding: '6px 10px', margin: '6px 0', fontSize: '12px' }}><b>⚠️ சரிபார்க்கவும் (எதுவும் மாற்றப்படவில்லை):</b>{x.p.warnings.slice(0, 8).map((m, i) => <div key={i}>• {m}</div>)}{x.p.warnings.length > 8 && <div>… +{x.p.warnings.length - 8}</div>}</div>}
                {x.old && <div style={{ fontSize: '13px', marginTop: '6px' }}>ERP-ல் இப்போதுள்ளதுடன் ஒப்பீடு: 🆕 புதியது <b>{x.diff.added}</b> • ✏️ மாற்றம் <b>{x.diff.changed}</b> • ➖ இல்லாதவை <b>{x.diff.gone}</b></div>}
                {x.diff.rows.length > 0 && <DiffTable rows={x.diff.rows} title={`Stock ஒப்பீடு — ${x.shop}`} />}
                <div style={{ marginTop: '10px' }}>
                  <button type="button" disabled={x.busy || x.problems.length > 0} onClick={() => saveStock(x)} style={{ ...styles.successBtn, opacity: x.problems.length ? 0.5 : 1 }}>{x.busy ? 'சேமிக்கிறது...' : '✅ உறுதி செய்து Stock சேமி'}</button>
                </div>
              </div>
            );
          })}

        </>
      )}

      {tab === 'showroom' && <ShowroomStock user={user} />}
      {tab === 'calendar' && <Calendar ix={ix} shops={shops} />}
      {tab === 'stock' && <StockReport ix={ix} shops={shops} />}
    </div>
  );
}

function ManualShopDate({ shops, initShop, initDate, onApply }: { shops: string[]; initShop: string; initDate: string; onApply: (shop: string, date: string) => void }) {
  const [sh, setSh] = useState(initShop);
  const [d, setD] = useState(initDate);
  return (
    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '8px 10px', margin: '6px 0', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ fontSize: '12px', color: '#1e40af' }}>கோப்பின் மேலே கடை / தேதி இல்லை — நீங்களே உள்ளிடவும்:</span>
      <input aria-label="Showroom (Busy Branch)" list="tr-shops" placeholder="கடை (எ.கா. AMBATTUR)" value={sh} onChange={e => setSh(e.target.value)} style={{ ...styles.input, maxWidth: '200px' }} />
      <datalist id="tr-shops">{shops.map(x => <option key={x} value={x} />)}</datalist>
      <input aria-label="As On date" type="date" value={d} onChange={e => setD(e.target.value)} style={{ ...styles.input, maxWidth: '160px' }} />
      <button type="button" onClick={() => onApply(sh, d)} style={styles.primaryBtn}>✔ பயன்படுத்து</button>
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

function Calendar({ ix, shops }: { ix: TradeIndex; shops: string[] }) {
  const today = ymd(new Date());
  const ageOf = (d?: string) => (d ? Math.max(0, Math.round((new Date(today + 'T00:00:00').getTime() - new Date(d + 'T00:00:00').getTime()) / 86400000)) : 999);
  const rows = shops.map(s => { const e = ix[s]; const age = ageOf(e.stockAsOn); return { s, asOn: e.stockAsOn || '-', at: e.stockAt ? new Date(e.stockAt).toLocaleString('en-IN') : '-', qty: e.stockQty || 0, age, late: age > 1 }; });
  return (
    <div style={styles.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
        <h4 style={{ margin: 0 }}>📅 கடை வாரி Stock Upload நிலை</h4>
        <ShareBar doc={{ title: 'Busy Stock Upload நிலை', headers: ['கடை', 'Stock As On', 'Upload நேரம்', 'Pcs', 'நிலை'], rows: rows.map(r => [r.s, r.asOn, r.at, r.qty, r.late ? `⚠️ ${r.age} நாள் பழையது` : '✅ சமீபத்தியது']) }} />
      </div>
      {shops.length === 0 ? <p style={{ color: '#64748b' }}>இன்னும் எந்தக் கடையின் Stock-ம் ஏற்றப்படவில்லை.</p> : (
        <TableWrap minWidth={640}>
          <thead><tr style={{ background: '#0f172a', color: 'white' }}>{['கடை', 'Stock As On', 'Upload நேரம்', 'Pcs', 'நிலை'].map(h => <th key={h} style={styles.thSub}>{h}</th>)}</tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.s} style={{ borderBottom: '1px solid #e2e8f0', background: r.late ? '#fffbeb' : undefined }}>
              <td style={styles.td}><b>{r.s}</b></td><td style={styles.td}>{r.asOn}</td><td style={styles.td}>{r.at}</td><td style={styles.td}>{r.qty}</td>
              <td style={{ ...styles.td, color: r.late ? '#b45309' : '#15803d', fontWeight: 'bold' }}>{r.late ? `⚠️ ${r.age} நாள் பழையது — இன்றைய Stock ஏற்றவும்` : '✅ சமீபத்தியது'}</td>
            </tr>
          ))}</tbody>
        </TableWrap>
      )}
      <p style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>தினமும் "BCN wise Stock Status" ஒன்றை ஏற்றினால் போதும். கடைசியாக ஏற்றியதே இறுதி Stock.</p>
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
        const r = currentStock(snap, []);
        if (live) { setLines(r.lines); setSnapInfo({ asOn: snap.asOn, unmatched: r.unmatched.length }); }
      } catch (e: any) { notify(errMsg(e), 'err'); } finally { if (live) setBusy(false); }
    })();
    return () => { live = false; };
  }, [shop, ix]);

  const summary = shops.map(s => { const e = ix[s]; return { s, asOn: e.stockAsOn || '-', qty: e.stockQty || 0, cost: e.stockCost || 0, mrp: e.stockMrp || 0 }; });

  const groups = useMemo(() => {
    const t = q.trim().toLowerCase();
    const m = new Map<string, { item: string; qty: number; cost: number; mrp: number; ls: CurLine[] }>();
    lines.filter(l => l.qty !== 0 && (!t || `${l.item} ${l.design} ${l.colour}`.toLowerCase().includes(t))).forEach(l => {
      const g = m.get(l.item) || { item: l.item, qty: 0, cost: 0, mrp: 0, ls: [] };
      g.qty += l.qty; g.cost += l.qty * unitCost(l).cost; g.mrp += l.qty * l.mrp; g.ls.push(l); m.set(l.item, g);
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
          <h4 style={{ margin: 0 }}>🏬 எல்லாக் கடைகளும் (Cost = Sales Price −20%; இல்லையெனில் MRP × 50%)</h4>
          <ShareBar doc={{ title: 'Trading Stock — கடை வாரி', headers: ['கடை', 'Stock As On', 'Qty', 'Cost மதிப்பு ₹', 'MRP மதிப்பு ₹'], rows: summary.map(r => [r.s, r.asOn, r.qty, r.cost, r.mrp]), footer: [`மொத்த Qty: ${summary.reduce((a, r) => a + r.qty, 0)} • Cost ₹${money(summary.reduce((a, r) => a + r.cost, 0))} • MRP ₹${money(summary.reduce((a, r) => a + r.mrp, 0))} (கடைசி Upload-ன் Busy Stock)`] }} />
        </div>
        <TableWrap minWidth={640}>
          <thead><tr style={{ background: '#0f172a', color: 'white' }}>{['கடை', 'Stock As On', 'Qty', 'Cost ₹', 'MRP ₹', ''].map(h => <th key={h} style={styles.thSub}>{h}</th>)}</tr></thead>
          <tbody>{summary.length === 0 ? <EmptyRow cols={6} text="Stock Upload செய்யப்படவில்லை." /> : summary.map(r => (
            <tr key={r.s} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={styles.td}><b>{r.s}</b></td><td style={styles.td}>{r.asOn}</td><td style={{ ...styles.td, fontWeight: 'bold' }}>{r.qty}</td><td style={styles.td}>₹{money(r.cost)}</td><td style={styles.td}>₹{money(r.mrp)}</td>
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
            <div style={{ marginLeft: 'auto' }}><ShareBar doc={{ title: `Trading Stock — ${shop}`, subtitle: snapInfo ? `Stock As On ${snapInfo.asOn}` : '', headers: ['Item', 'Design', 'Size', 'Colour', 'MRP', 'Cost', 'Qty', 'Cost மதிப்பு', 'MRP மதிப்பு'], rows: groups.flatMap(g => g.ls.map(l => [l.item, l.design, sizeLabel(l.size), l.colour, l.mrp, l.cost, l.qty, Math.round(l.qty * l.cost), Math.round(l.qty * l.mrp)])), footer: [`மொத்தம்: ${tot.qty} Pcs • Cost ₹${money(tot.cost)} • MRP ₹${money(tot.mrp)}`] }} /></div>
          </div>
          {busy ? <Loading /> : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', marginBottom: '12px' }}>
                <StatCard label="மொத்த Pcs" value={tot.qty} color="#2563eb" />
                <StatCard label="Cost மதிப்பு" value={`₹${money(tot.cost)}`} color="#059669" />
                <StatCard label="MRP மதிப்பு" value={`₹${money(tot.mrp)}`} color="#7c3aed" />
                <StatCard label="எதிர்பார்க்கும் Margin" value={`₹${money(tot.mrp - tot.cost)}`} color="#d97706" />
              </div>
              {snapInfo && <div style={{ fontSize: '12px', color: '#475569', marginBottom: '8px' }}>Stock As On: <b>{snapInfo.asOn}</b></div>}
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
