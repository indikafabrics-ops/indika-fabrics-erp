import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAll, errMsg } from '../lib/supabase';
import { baseBatchCode, money, num, r3, todayStr } from '../lib/helpers';
import { loadBatchNames, nameFor } from '../lib/batchNames';
import { loadDesignMaster, designLookup, loadSupplierMaster } from '../lib/masterStore';
import { loadAlerts, type AlertCard } from '../lib/alerts';
import { loadAudit, type AuditEntry } from '../lib/audit';
import { code128Svg } from '../lib/code128';
import { docToText, openWhatsApp, type Cell } from '../lib/share';
import ShareBar from '../components/ShareBar';
import DetailModal from '../components/DetailModal';
import { Loading, TableWrap, EmptyRow, notify, styles } from '../components/ui';
import type { MenuKey } from '../lib/constants';

type Tab = 'daily' | 'search' | 'profit' | 'supplier' | 'alerts' | 'labels' | 'audit';

interface Data {
  bills: any[]; stock: any[]; cut: any[]; wip: any[]; ready: any[]; trf: any[]; tailor: any[]; exc: any[];
  names: Record<string, string>; price: (model: string, design: string) => number; suppliers: Record<string, any>;
}

const dateOf = (v: any) => String(v || '').slice(0, 10);

async function loadAll(): Promise<Data> {
  const safe = <T,>(p: Promise<T>, d: T) => p.catch(() => d);
  const [bills, stock, cut, wip, ready, trf, tailor, exc, names, dm, suppliers] = await Promise.all([
    fetchAll('pommys_grn_bills', '*'), fetchAll('pommys_fabric_stock', '*'), fetchAll('pommys_cutting_batches', '*', undefined, 'batch_code'),
    fetchAll('pommys_production_wip', '*'), fetchAll('pommys_ready_stock', '*'), fetchAll('pommys_showroom_transfers', '*'),
    safe(fetchAll('pommys_tailor_ledger', '*'), [] as any[]), fetchAll('pommys_exceptions_stock', '*'),
    safe(loadBatchNames(), {} as Record<string, string>), safe(loadDesignMaster(), {} as any), safe(loadSupplierMaster(), {} as any)
  ]);
  const look = designLookup(dm);
  return { bills, stock, cut, wip, ready, trf, tailor, exc, names, suppliers, price: (m, d) => look(m, d)?.price || 0 };
}

const fabricsOf = (c: any): any[] => (Array.isArray(c.selected_fabrics_json) ? c.selected_fabrics_json : []);

/** everything that happened to one cutting batch, purchase → showroom, plus cost */
function timeline(d: Data, code: string) {
  const c = d.cut.find(x => x.batch_code === code);
  const fabrics = c ? fabricsOf(c) : [];
  const stockById = new Map(d.stock.map(s => [String(s.id), s]));
  const billById = new Map(d.bills.map(b => [String(b.id), b]));
  const own = (x: any) => baseBatchCode(x.batch_code) === code;
  const wip = d.wip.filter(own), ready = d.ready.filter(own), trf = d.trf.filter(own), tail = d.tailor.filter(own);
  const dmg = d.exc.filter(e => e.stock_type === 'DAMAGE' && baseBatchCode(e.ref_code) === code && String(e.unit || 'Pcs') !== 'Mtr');
  const total = num(c?.total_pieces);
  const wipPcs = wip.filter(w => w.current_status !== 'Ready Stock').reduce((a, w) => a + num(w.total_pieces), 0);
  const godown = ready.reduce((a, r) => a + num(r.ready_pieces), 0);
  const inShop = trf.filter(t => num(t.transferred_pieces) > 0).reduce((a, t) => a + num(t.transferred_pieces), 0);
  const sold = trf.filter(t => num(t.transferred_pieces) < 0).reduce((a, t) => a + num(t.transferred_pieces), 0);
  const damage = dmg.reduce((a, e) => a + num(e.qty), 0);

  let fabricCost = 0;
  const purchase: Cell[][] = fabrics.map((f: any) => {
    const s: any = stockById.get(String(f.stockId)); const b: any = s ? billById.get(String(s.bill_id)) : null;
    const rate = num(s?.rate_per_meter); fabricCost += num(f.issueMeters) * rate;
    return [f.item_name || s?.item_name || '-', f.design_no || '-', f.color || '-', b?.supplier_name || '-', b?.bill_no || '-', dateOf(b?.bill_date), `${r3(num(f.issueMeters))} M`, `₹${rate}`];
  });
  const wages = tail.reduce((a, t) => a + num(t.pieces) * num(t.rate_per_pc), 0);
  const first = fabrics[0] || {};
  const price = d.price(c?.product_model, first.design_no || '-');
  const costPc = total > 0 ? (fabricCost + wages) / total : 0;
  return { c, purchase, wip, ready, trf, tail, total, wipPcs, godown, inShop, sold, damage, fabricCost, wages, costPc, price, margin: price > 0 ? price - costPc : 0 };
}

export default function AnalysisModule({ user, onNavigate }: { user: any; onNavigate?: (k: MenuKey) => void }) {
  const admin = String(user?.role || '').toUpperCase() === 'ADMIN';
  const [tab, setTab] = useState<Tab>('daily');
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [alerts, setAlerts] = useState<AlertCard[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [date, setDate] = useState(todayStr());
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [alertDoc, setAlertDoc] = useState<AlertCard | null>(null);
  const [sup, setSup] = useState('');
  const [labelSel, setLabelSel] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      setData(await loadAll());
      loadAlerts().then(setAlerts).catch(() => undefined);
      if (admin) loadAudit().then(setAudit).catch(() => undefined);
    } catch (e: any) { setError(errMsg(e)); }
    setLoading(false);
  }, [admin]);
  useEffect(() => { load(); }, [load]);
  void onNavigate;

  // ---------- Daily ----------
  const daily = useMemo(() => {
    if (!data) return null;
    const rows: Cell[][] = [];
    const bills = data.bills.filter(b => dateOf(b.bill_date) === date);
    bills.forEach(b => rows.push(['வாங்கியது', `${b.supplier_name} / Bill ${b.bill_no}`, data.stock.filter(s => String(s.bill_id) === String(b.id)).reduce((a, s) => a + num(s.total_meters), 0) + ' M']));
    const cuts = data.cut.filter(c => dateOf(c.created_at) === date);
    cuts.forEach(c => rows.push(['வெட்டியது', `${c.batch_code} ${nameFor(data.names, c.batch_code)} ${c.product_model || ''}`.trim(), num(c.total_pieces) + ' Pcs']));
    const tail = data.tailor.filter(t => dateOf(t.created_at) === date);
    tail.forEach(t => rows.push(['தையலுக்குக் கொடுத்தது', `${t.tailor_name} / ${t.batch_code}`, num(t.pieces) + ' Pcs']));
    const moves = data.trf.filter(t => dateOf(t.transfer_date) === date);
    moves.filter(t => num(t.transferred_pieces) > 0 && !String(t.challan_no).startsWith('OPN')).forEach(t => rows.push(['Showroom-க்கு அனுப்பியது', `${t.showroom_name} / ${t.model_name} ${t.design_no || ''}`, num(t.transferred_pieces) + ' Pcs']));
    moves.filter(t => num(t.transferred_pieces) < 0).forEach(t => rows.push([t.status === 'Showroom Sale' ? 'விற்பனை' : String(t.status || 'Return/Damage'), `${t.showroom_name} / ${t.model_name} ${t.design_no || ''}`, Math.abs(num(t.transferred_pieces)) + ' Pcs']));
    const soldPcs = moves.filter(t => t.status === 'Showroom Sale').reduce((a, t) => a + Math.abs(num(t.transferred_pieces)), 0);
    const summary = `வாங்கிய Bill: ${bills.length} | Cutting: ${cuts.length} Batch (${cuts.reduce((a, c) => a + num(c.total_pieces), 0)} Pcs) | தையலுக்கு: ${tail.reduce((a, t) => a + num(t.pieces), 0)} Pcs | விற்பனை: ${soldPcs} Pcs`;
    return { rows, summary };
  }, [data, date]);

  // ---------- Search ----------
  const results = useMemo(() => {
    if (!data || q.trim().length < 2) return null;
    const t = q.trim().toLowerCase();
    const has = (...v: any[]) => v.some(x => String(x ?? '').toLowerCase().includes(t));
    const batches = data.cut.filter(c => has(c.batch_code, c.product_model, nameFor(data.names, c.batch_code), ...fabricsOf(c).flatMap((f: any) => [f.design_no, f.color, f.item_name])));
    // a local name search also finds child codes
    const fabric = data.stock.filter(s => num(s.available_meters) > 0 && has(s.item_name, s.design_no, s.color));
    const ready = data.ready.filter(r => num(r.ready_pieces) > 0 && has(r.batch_code, r.model_name, r.design_no, r.color, nameFor(data.names, r.batch_code)));
    return { batches, fabric, ready };
  }, [data, q]);

  const tl = open && data ? timeline(data, open) : null;

  // ---------- Profit ----------
  const profitRows = useMemo(() => {
    if (!data) return [] as Cell[][];
    return data.cut.slice().reverse().map(c => {
      const t = timeline(data, c.batch_code);
      return [c.batch_code, nameFor(data.names, c.batch_code) || '-', c.product_model || '-', t.total, money(t.fabricCost), money(t.wages), r3(t.costPc), t.price || '-', t.price ? r3(t.margin) : '-', t.price && t.costPc ? `${r3((t.margin / t.price) * 100)}%` : '-'] as Cell[];
    });
  }, [data]);

  // ---------- Supplier ----------
  const suppliers = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { name: string; bills: any[] }>();
    data.bills.forEach(b => { const k = String(b.supplier_name); const c = map.get(k) || { name: k, bills: [] }; c.bills.push(b); map.set(k, c); });
    return Array.from(map.values()).map(s => {
      const items = data.stock.filter(x => s.bills.some(b => String(b.id) === String(x.bill_id)));
      const value = items.reduce((a, x) => { const base = num(x.total_meters) * num(x.rate_per_meter); return a + base + (base * num(x.gst_percentage)) / 100; }, 0);
      return { ...s, meters: items.reduce((a, x) => a + num(x.total_meters), 0), value, items, last: s.bills.map(b => dateOf(b.bill_date)).sort().pop() || '' };
    }).sort((a, b) => b.value - a.value);
  }, [data]);

  const supDetail = suppliers.find(s => s.name === sup);
  const rateTrend = useMemo(() => {
    if (!supDetail) return [] as Cell[][];
    const byItem = new Map<string, any[]>();
    supDetail.items.forEach((x: any) => { const a = byItem.get(x.item_name) || []; a.push(x); byItem.set(x.item_name, a); });
    return Array.from(byItem.entries()).map(([item, a]) => {
      const sorted = a.slice().sort((x, y) => num(x.id) - num(y.id));
      const f = num(sorted[0].rate_per_meter), l = num(sorted[sorted.length - 1].rate_per_meter);
      return [item, a.reduce((s, x) => s + num(x.total_meters), 0), f, l, f > 0 ? `${r3(((l - f) / f) * 100)}%` : '-'] as Cell[];
    });
  }, [supDetail]);

  // ---------- Labels ----------
  const printLabels = () => {
    if (!data || labelSel.length === 0) return notify('Label வேண்டிய Batch-ஐத் தேர்வு செய்யவும்.', 'err');
    const w = window.open('', '_blank'); if (!w) return;
    const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
    const cards = labelSel.map(code => {
      const c = data.cut.find(x => x.batch_code === code); const f0 = c ? fabricsOf(c)[0] || {} : {};
      return `<div class="l">${code128Svg(code, 50, 2)}<div class="c">${esc(code)}</div><div>${esc(nameFor(data.names, code))}</div><div class="s">${esc(c?.product_model || '')} ${esc(f0.design_no || '')} ${esc(f0.color || '')}</div></div>`;
    }).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Labels</title><style>body{font-family:Arial,sans-serif;margin:10px}.g{display:flex;flex-wrap:wrap;gap:8px}.l{border:1px dashed #64748b;padding:6px;width:240px;text-align:center;page-break-inside:avoid}.l svg{max-width:100%;height:auto}.c{font-weight:bold;font-size:14px}.s{font-size:11px;color:#334155}</style></head><body><div class="g">${cards}</div><script>window.onload=function(){setTimeout(function(){window.print()},500)}<\/script></body></html>`);
    w.document.close();
  };

  const tabBtn = (k: Tab, label: string) => <button key={k} type="button" onClick={() => setTab(k)} style={{ ...styles.secondaryBtn, background: tab === k ? '#1e293b' : 'transparent', color: tab === k ? 'white' : '#475569' }}>{label}</button>;
  const th = (h: string) => <th key={h} style={styles.thSub}>{h}</th>;

  return (
    <div style={styles.card}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px', marginBottom: '16px' }}>
        {tabBtn('daily', '📅 Daily Summary')}{tabBtn('search', '🔎 Search & Batch Timeline')}{tabBtn('profit', '💰 Batch Profit')}{tabBtn('supplier', '🏭 Supplier Account')}
        {tabBtn('alerts', `🚨 எச்சரிக்கை${alerts.reduce((a, x) => a + x.count, 0) ? ` (${alerts.reduce((a, x) => a + x.count, 0)})` : ''}`)}{tabBtn('labels', '🏷️ Barcode Label')}{admin && tabBtn('audit', '🕵️ Audit Log')}
        <button type="button" onClick={load} style={{ ...styles.secondaryBtn, marginLeft: 'auto' }}>↻ Refresh</button>
      </div>
      {error && <div style={{ color: '#b91c1c', marginBottom: '10px' }}>⚠️ {error}</div>}
      {loading && <Loading />}

      {!loading && data && tab === 'daily' && daily && (
        <div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...styles.input, maxWidth: '180px' }} />
            <ShareBar doc={{ title: `Daily Summary — ${date}`, headers: ['வகை', 'விவரம்', 'அளவு'], rows: daily.rows, summary: daily.summary, footer: [daily.summary] }} />
            <button type="button" onClick={() => openWhatsApp(docToText({ title: `Daily Summary ${date}`, headers: [], rows: daily.rows, summary: daily.summary }))} style={{ ...styles.secondaryBtn }}>📲 என் WhatsApp-க்கு</button>
          </div>
          <div style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: '8px', padding: '10px', marginBottom: '10px', fontWeight: 'bold', color: '#1e3a8a' }}>{daily.summary}</div>
          <TableWrap minWidth={520}><thead><tr style={{ background: '#0f172a', color: 'white' }}>{['வகை', 'விவரம்', 'அளவு'].map(th)}</tr></thead>
            <tbody>{daily.rows.length === 0 ? <EmptyRow cols={3} text="இந்த நாளுக்குப் பதிவுகள் இல்லை." /> : daily.rows.map((r, i) => <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>{r.map((c, j) => <td key={j} style={styles.td}>{c}</td>)}</tr>)}</tbody></TableWrap>
        </div>
      )}

      {!loading && data && tab === 'search' && (
        <div>
          <input autoFocus placeholder="🔎 Batch Code / Local Name / Design / Color / Model / Item… (Barcode Scanner-ஐயும் இங்கே பயன்படுத்தலாம்)" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && results?.batches.length === 1) setOpen(results.batches[0].batch_code); }} style={{ ...styles.input, marginBottom: '12px' }} />
          {!results && <p style={{ color: '#64748b', fontSize: '13px' }}>குறைந்தது 2 எழுத்து தட்டவும்.</p>}
          {results && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <h4 style={{ margin: '0 0 6px 0' }}>✂️ Batch ({results.batches.length}) — Click செய்தால் முழு பயணம்</h4>
                <TableWrap minWidth={560}><thead><tr style={{ background: '#0f172a', color: 'white' }}>{['Batch', 'Local Name', 'Model', 'Pcs', 'Design / Color'].map(th)}</tr></thead>
                  <tbody>{results.batches.length === 0 ? <EmptyRow cols={5} text="பொருந்தும் Batch இல்லை." /> : results.batches.slice(0, 60).map(c => (
                    <tr key={c.batch_code} onClick={() => setOpen(c.batch_code)} style={{ cursor: 'pointer', borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ ...styles.td, color: '#2563eb', fontWeight: 'bold' }}>{c.batch_code}</td><td style={{ ...styles.td, fontWeight: 'bold', color: '#6d28d9' }}>{nameFor(data.names, c.batch_code) || '-'}</td><td style={styles.td}>{c.product_model}</td><td style={styles.td}>{num(c.total_pieces)}</td>
                      <td style={styles.td}>{fabricsOf(c).map((f: any) => `${f.design_no || '-'} ${f.color || ''}`.trim()).join(' | ')}</td>
                    </tr>))}</tbody></TableWrap>
              </div>
              <div>
                <h4 style={{ margin: '0 0 6px 0' }}>🧵 Fabric Godown ({results.fabric.length})</h4>
                <TableWrap minWidth={480}><thead><tr style={{ background: '#0f172a', color: 'white' }}>{['Item', 'Design', 'Color', 'Meters'].map(th)}</tr></thead>
                  <tbody>{results.fabric.length === 0 ? <EmptyRow cols={4} text="இல்லை." /> : results.fabric.slice(0, 60).map((s, i) => <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}><td style={styles.td}>{s.item_name}</td><td style={styles.td}>{s.design_no}</td><td style={styles.td}>{s.color || '-'}</td><td style={styles.td}>{r3(num(s.available_meters))}</td></tr>)}</tbody></TableWrap>
              </div>
              <div>
                <h4 style={{ margin: '0 0 6px 0' }}>👕 Godown Ready ({results.ready.length})</h4>
                <TableWrap minWidth={480}><thead><tr style={{ background: '#0f172a', color: 'white' }}>{['Batch', 'Local Name', 'Model', 'Design', 'Color', 'Pcs'].map(th)}</tr></thead>
                  <tbody>{results.ready.length === 0 ? <EmptyRow cols={6} text="இல்லை." /> : results.ready.slice(0, 60).map((r, i) => <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}><td style={styles.td}>{r.batch_code}</td><td style={styles.td}>{nameFor(data.names, r.batch_code) || '-'}</td><td style={styles.td}>{r.model_name}</td><td style={styles.td}>{r.design_no}</td><td style={styles.td}>{r.color}</td><td style={styles.td}>{r.ready_pieces}</td></tr>)}</tbody></TableWrap>
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && data && tab === 'profit' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
            <div style={{ fontSize: '12px', color: '#64748b' }}>Cost = Fabric (Discount-க்குப் பின் Rate × Meters) + தையல் கூலி. GST, Trims சேராது. Price = Cutting-ல் போட்ட Selling Price.</div>
            <ShareBar doc={{ title: 'Batch Profit', headers: ['Batch', 'Local Name', 'Model', 'Pcs', 'Fabric ₹', 'Wages ₹', 'Cost/Pc', 'Price', 'Margin/Pc', 'Margin %'], rows: profitRows }} />
          </div>
          <TableWrap minWidth={900}><thead><tr style={{ background: '#0f172a', color: 'white' }}>{['Batch', 'Local Name', 'Model', 'Pcs', 'Fabric ₹', 'Wages ₹', 'Cost/Pc', 'Price', 'Margin/Pc', 'Margin %'].map(th)}</tr></thead>
            <tbody>{profitRows.length === 0 ? <EmptyRow cols={10} text="Batch இல்லை." /> : profitRows.map((r, i) => <tr key={i} onClick={() => setOpen(String(r[0]))} style={{ cursor: 'pointer', borderBottom: '1px solid #e2e8f0', background: typeof r[8] === 'number' && (r[8] as number) < 0 ? '#fef2f2' : 'white' }}>{r.map((c, j) => <td key={j} style={styles.td}>{c}</td>)}</tr>)}</tbody></TableWrap>
        </div>
      )}

      {!loading && data && tab === 'supplier' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
            <h4 style={{ margin: 0 }}>🏭 Supplier வாரியாக வாங்கியது</h4>
            <ShareBar doc={{ title: 'Supplier Account', headers: ['Supplier', 'Bills', 'Meters', 'Value ₹ (GST உட்பட)', 'கடைசி Bill'], rows: suppliers.map(s => [s.name, s.bills.length, r3(s.meters), money(s.value), s.last]) }} />
          </div>
          <TableWrap minWidth={560}><thead><tr style={{ background: '#0f172a', color: 'white' }}>{['Supplier', 'Bills', 'Meters', 'Value ₹ (GST உட்பட)', 'கடைசி Bill'].map(th)}</tr></thead>
            <tbody>{suppliers.length === 0 ? <EmptyRow cols={5} text="Bill இல்லை." /> : suppliers.map(s => <tr key={s.name} onClick={() => setSup(s.name)} style={{ cursor: 'pointer', background: sup === s.name ? '#eff6ff' : 'white', borderBottom: '1px solid #e2e8f0' }}><td style={{ ...styles.td, fontWeight: 'bold', color: '#2563eb' }}>{s.name}</td><td style={styles.td}>{s.bills.length}</td><td style={styles.td}>{r3(s.meters)}</td><td style={styles.td}>₹ {money(s.value)}</td><td style={styles.td}>{s.last || '-'}</td></tr>)}</tbody></TableWrap>
          {supDetail && (
            <div style={{ marginTop: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
                <h4 style={{ margin: 0 }}>{supDetail.name} — Item Rate மாற்றம் (முதல் → கடைசி Bill, Discount-க்குப் பின்)</h4>
                <ShareBar phone={data.suppliers[supDetail.name.trim().toLowerCase()]?.mobile} doc={{ title: `Supplier Account — ${supDetail.name}`, headers: ['Item', 'Total M', 'முதல் Rate', 'கடைசி Rate', 'மாற்றம்'], rows: rateTrend, footer: [`${supDetail.bills.length} Bill | ₹ ${money(supDetail.value)}`] }} />
              </div>
              <TableWrap minWidth={480}><thead><tr style={{ background: '#e2e8f0' }}>{['Item', 'Total M', 'முதல் Rate', 'கடைசி Rate', 'மாற்றம்'].map(th)}</tr></thead>
                <tbody>{rateTrend.map((r, i) => <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>{r.map((c, j) => <td key={j} style={styles.td}>{c}</td>)}</tr>)}</tbody></TableWrap>
            </div>
          )}
        </div>
      )}

      {!loading && tab === 'alerts' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px' }}>
          {alerts.length === 0 && <p style={{ color: '#64748b' }}>கணக்கிடுகிறது…</p>}
          {alerts.map(a => (
            <div key={a.key} onClick={() => setAlertDoc(a)} style={{ ...styles.card, borderTop: `4px solid ${a.color}`, cursor: 'pointer' }}>
              <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>{a.label}</div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: a.count ? a.color : '#16a34a' }}>{a.count}</div>
              <div style={{ fontSize: '11px', color: a.color }}>{a.count ? 'Click → விவரம்' : '✅ பிரச்சினை இல்லை'}</div>
            </div>
          ))}
        </div>
      )}

      {!loading && data && tab === 'labels' && (
        <div>
          <p style={{ fontSize: '13px', color: '#475569' }}>Batch-ஐத் தேர்வு செய்து Label அச்சிடுங்கள் (Code 128 Barcode). Barcode Scanner-ஆல் Scan செய்தால் அந்த Batch Code "Search" பெட்டியில் விழும்.</p>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setLabelSel(data.cut.map(c => c.batch_code))} style={styles.secondaryBtn}>எல்லாம்</button>
            <button type="button" onClick={() => setLabelSel([])} style={styles.secondaryBtn}>எதுவுமில்லை</button>
            <button type="button" onClick={printLabels} style={styles.primaryBtn}>🏷️ Labels Print ({labelSel.length})</button>
          </div>
          <div style={{ maxHeight: '320px', overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px' }}>
            {data.cut.slice().reverse().map(c => (
              <label key={c.batch_code} style={{ display: 'flex', gap: '8px', padding: '4px 0', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={labelSel.includes(c.batch_code)} onChange={e => setLabelSel(s => e.target.checked ? [...s, c.batch_code] : s.filter(x => x !== c.batch_code))} />
                <b>{c.batch_code}</b> {nameFor(data.names, c.batch_code)} — {c.product_model} ({num(c.total_pieces)} Pcs)
              </label>
            ))}
          </div>
        </div>
      )}

      {tab === 'audit' && admin && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
            <h4 style={{ margin: 0 }}>🕵️ யார், எப்போது, என்ன செய்தார்</h4>
            <ShareBar doc={{ title: 'Audit Log', headers: ['நேரம்', 'யார்', 'Role', 'செயல்'], rows: audit.map(a => [new Date(a.ts).toLocaleString('en-IN'), a.who, a.role, a.text]) }} />
          </div>
          <TableWrap minWidth={600}><thead><tr style={{ background: '#0f172a', color: 'white' }}>{['நேரம்', 'யார்', 'Role', 'செயல்'].map(th)}</tr></thead>
            <tbody>{audit.length === 0 ? <EmptyRow cols={4} text="பதிவுகள் இல்லை." /> : audit.slice(0, 200).map(a => <tr key={a.id} style={{ borderBottom: '1px solid #e2e8f0' }}><td style={styles.td}>{new Date(a.ts).toLocaleString('en-IN')}</td><td style={styles.td}>{a.who}</td><td style={styles.td}>{a.role}</td><td style={styles.td}>{a.text}</td></tr>)}</tbody></TableWrap>
        </div>
      )}

      {alertDoc && <DetailModal {...alertDoc.doc} onClose={() => setAlertDoc(null)} />}

      {open && tl && tl.c && data && (
        <DetailModal
          title={`Batch பயணம் — ${open}${nameFor(data.names, open) ? ' (' + nameFor(data.names, open) + ')' : ''}`}
          subtitle={`${tl.c.product_model || ''} • Cut ${tl.total} Pcs • ${dateOf(tl.c.created_at)}`}
          headers={['படி', 'விவரம்', 'அளவு']}
          rows={[
            ...tl.purchase.map(p => ['1. வாங்கியது', `${p[0]} ${p[1]} ${p[2]} — ${p[3]} / Bill ${p[4]} (${p[5]}) @ ${p[7]}`, p[6]] as Cell[]),
            ['2. Cutting', `${tl.c.product_model} — Sizes: ${(Array.isArray(tl.c.size_pieces_json) ? tl.c.size_pieces_json : []).map((s: any) => `${s.size}:${s.pieces}`).join(', ') || '-'}${num(tl.c.end_bit_meters) > 0 ? ` • End Bit ${r3(num(tl.c.end_bit_meters))} M` : ''}`, `${tl.total} Pcs`],
            ...tl.tail.map(t => ['3. தையல்', `${t.tailor_name} — ${t.status} @ ₹${t.rate_per_pc}`, `${num(t.pieces)} Pcs`] as Cell[]),
            ...tl.wip.filter(w => w.current_status !== 'Ready Stock').map(w => ['4. Production', `${w.batch_code} — ${w.current_status}`, `${num(w.total_pieces)} Pcs`] as Cell[]),
            ...tl.ready.map(r => ['5. Godown Ready', `${r.batch_code} ${r.model_name} ${r.design_no || ''} ${r.color || ''}`, `${num(r.ready_pieces)} Pcs`] as Cell[]),
            ...tl.trf.map(t => [num(t.transferred_pieces) < 0 ? '7. விற்பனை/Return' : '6. Showroom', `${t.showroom_name} (${t.challan_no}) ${t.status || ''}`, `${num(t.transferred_pieces)} Pcs`] as Cell[]),
            ...(tl.damage > 0 ? [['Damage', 'Damage / Seconds', `${tl.damage} Pcs`] as Cell[]] : [])
          ]}
          footer={[
            `Fabric ₹${money(tl.fabricCost)} + கூலி ₹${money(tl.wages)} = Cost/Pc ₹${r3(tl.costPc)}${tl.price ? ` | Price ₹${tl.price} | Margin/Pc ₹${r3(tl.margin)}` : ' | (Selling Price போடவில்லை)'}`,
            `இப்போது: Production ${tl.wipPcs} • Godown ${tl.godown} • Showroom-ல் அனுப்பியது ${tl.inShop} • விற்றது/திரும்பியது ${Math.abs(tl.sold)} • Damage ${tl.damage}`
          ]}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
