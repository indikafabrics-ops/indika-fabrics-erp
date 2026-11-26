import { useCallback, useEffect, useState } from 'react';
import { fetchAll, errMsg } from '../lib/supabase';
import {
  computeShowroomLines, downloadCsv, loadStockSnapshot, mergeExceptionRows, money, num, r3, todayStr, uniqueSorted,
  type StockSnapshot
} from '../lib/helpers';
import { useDrill } from '../components/DrillHost';
import { loadSupplierMaster } from '../lib/masterStore';
import { printDoc, docToText, openWhatsApp } from '../lib/share';
import ShareBar from '../components/ShareBar';
import InsightsReport from './InsightsReport';
import StageReport from '../components/StageReport';
import { loadBatchMeta, type BatchMeta } from '../lib/batchMeta';
import { loadBatchNames } from '../lib/batchNames';
import { loadSizeLedger, loadCutSizes, sizesFor, sortSizes, type SizeMap } from '../lib/sizeLedger';
import { baseBatchCode, computeShowroomSizeLines } from '../lib/helpers';
import { WIP_STAGES } from '../lib/constants';
import type { ShareDoc as ShareDocT } from '../lib/share';
import { EmptyRow, ErrorBanner, ImagePreview, Loading, StatCard, TableWrap, styles } from '../components/ui';

type Tab = 'summary' | 'godown' | 'exceptions' | 'history' | 'insights';

const GODOWN = 'Central Godown';

export default function ReportsModule() {
  const [tab, setTab] = useState<Tab>('summary');
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const drill = useDrill();
  const [supMaster, setSupMaster] = useState<Record<string, any>>({});
  useEffect(() => { loadSupplierMaster().then(setSupMaster).catch(() => undefined); }, []);

  const [snapshot, setSnapshot] = useState<StockSnapshot | null>(null);
  const [readyStock, setReadyStock] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [wip, setWip] = useState<any[]>([]);
  const [wipMeta, setWipMeta] = useState<Record<string, BatchMeta>>({});
  const [bnames, setBnames] = useState<Record<string, string>>({});
  const [ledger, setLedger] = useState<Record<string, SizeMap>>({});
  const [cutSizes, setCutSizes] = useState<Record<string, SizeMap>>({});
  const [stage, setStage] = useState<string>('Cutting');
  const [fabric, setFabric] = useState<any[]>([]);
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);

  const [supplier, setSupplier] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const load = useCallback(async (which: Tab) => {
    setLoading(true);
    setError('');
    try {
      if (which === 'summary') {
        const [snap, ready, trf] = await Promise.all([
          loadStockSnapshot(),
          fetchAll('pommys_ready_stock', '*'),
          fetchAll('pommys_showroom_transfers', '*')
        ]);
        setSnapshot(snap);
        setReadyStock(ready.filter(r => num(r.ready_pieces) > 0));
        setTransfers(trf);
        const w = await fetchAll('pommys_production_wip', '*', q => q.neq('current_status', 'Ready Stock'));
        setWip(w);
        setWipMeta(await loadBatchMeta(w));
        loadBatchNames().then(setBnames).catch(() => undefined);
        loadSizeLedger().then(setLedger).catch(() => undefined);
        loadCutSizes().then(setCutSizes).catch(() => undefined);
      } else if (which === 'godown') {
        const rows = await fetchAll('pommys_fabric_stock', '*', q => q.gt('available_meters', 0.01));
        setFabric(rows.reverse());
      } else if (which === 'exceptions') {
        const [ex, cut] = await Promise.all([
          fetchAll('pommys_exceptions_stock', '*'),
          fetchAll('pommys_cutting_batches', 'batch_code,product_model,end_bit_meters', q => q.gt('end_bit_meters', 0), 'batch_code')
        ]);
        setExceptions(mergeExceptionRows(ex, cut).reverse());
      } else if (which === 'insights') {
        // loaded inside InsightsReport
      } else {
        const [bills, stocks] = await Promise.all([
          fetchAll('pommys_grn_bills', '*'),
          fetchAll('pommys_fabric_stock', '*')
        ]);
        const byBill = new Map<string, any[]>();
        stocks.forEach(s => {
          const k = String(s.bill_id);
          byBill.set(k, [...(byBill.get(k) || []), s]);
        });
        const combined = bills.map(b => ({ ...b, items: byBill.get(String(b.id)) || [] }));
        combined.sort((a, b) => String(b.bill_date || '').localeCompare(String(a.bill_date || '')) || num(b.id) - num(a.id));
        setHistory(combined);
      }
    } catch (err: any) {
      setError('Report load தோல்வி: ' + errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);

  // ---------- derived: stock summary ----------
  const lines = computeShowroomLines(transfers).filter(l => l.pcs !== 0);
  const showroomNames = uniqueSorted(lines.map(l => l.showroom));
  const matrixMap = new Map<string, any>();
  const addMatrix = (model: string, design: string, color: string, loc: string, pcs: number) => {
    const m = String(model || '-'); const d = String(design || '-'); const c = String(color || '-');
    const key = [m, d, c].map(s => s.toLowerCase()).join('|');
    const row = matrixMap.get(key) || { model: m, design: d, color: c, loc: {} as Record<string, number> };
    row.loc[loc] = (row.loc[loc] || 0) + pcs;
    matrixMap.set(key, row);
  };
  readyStock.forEach(r => addMatrix(r.model_name, r.design_no, r.color, GODOWN, num(r.ready_pieces)));
  lines.forEach(l => addMatrix(l.model, l.design, l.color, l.showroom, l.pcs));
  const matrix = Array.from(matrixMap.values()).sort((a, b) => (a.model + a.design + a.color).localeCompare(b.model + b.design + b.color));
  const locations = [GODOWN, ...showroomNames];
  const rowTotal = (r: any) => Object.values(r.loc as Record<string, number>).reduce((s, v) => s + v, 0);

  // ---------- derived: size-wise ready goods + WIP sizes ----------
  const wipAvail = (code: string, total: number): SizeMap => {
    const own = ledger[code];
    const sz = wipMeta[code]?.size;
    if ((!own || !Object.keys(own).length) && !cutSizes[baseBatchCode(code)] && sz) return total > 0 ? { [sz]: total } : {};
    return sizesFor(code, total, ledger, cutSizes);
  };
  const sizeMap = new Map<string, any>();
  const addSz = (model: string, design: string, color: string, size: string, loc: string, pcs: number) => {
    const m = String(model || '-'), d = String(design || '-'), c = String(color || '-'), z = String(size || '—');
    const key = [m, d, c, z].map(x => x.toLowerCase()).join('|');
    const row = sizeMap.get(key) || { model: m, design: d, color: c, size: z, loc: {} as Record<string, number> };
    row.loc[loc] = (row.loc[loc] || 0) + pcs;
    sizeMap.set(key, row);
  };
  readyStock.forEach(r => {
    const tot = Math.floor(num(r.ready_pieces));
    const by = sizesFor(String(r.batch_code || ''), tot, ledger, cutSizes);
    if (!Object.keys(by).length) addSz(r.model_name, r.design_no, r.color, '—', GODOWN, tot);
    else Object.entries(by).forEach(([z, q]) => addSz(r.model_name, r.design_no, r.color, z, GODOWN, q));
  });
  computeShowroomSizeLines(transfers).filter(l => l.pcs !== 0).forEach(l => addSz(l.model, l.design, l.color, l.size, l.showroom, l.pcs));
  const sizeRows = Array.from(sizeMap.values()).sort((a, b) => (a.model + a.design + a.color).localeCompare(b.model + b.design + b.color) || sortSizes(a.size, b.size));
  const sizeDoc: ShareDocT = {
    title: 'Ready Goods — Size வாரி',
    headers: ['Model', 'Design', 'Colour', 'Size', ...locations, 'Total'],
    rows: sizeRows.map(r => [r.model, r.design, r.color, r.size, ...locations.map(l => r.loc[l] || 0), rowTotal(r)]),
    footer: [`மொத்தம்: ${sizeRows.reduce((a, r) => a + rowTotal(r), 0)} Pcs`]
  };

  // ---------- derived: history ----------
  const supplierOptions = uniqueSorted(history.map(h => h.supplier_name));
  const filteredHistory = history.filter(b => {
    if (supplier && b.supplier_name !== supplier) return false;
    const d = String(b.bill_date || '');
    if ((startDate || endDate) && !d) return false;
    if (startDate && d < startDate) return false;
    if (endDate && d > endDate) return false;
    return true;
  });
  const itemValue = (s: any) => {
    const base = num(s.total_meters) * num(s.rate_per_meter);
    return base + (base * num(s.gst_percentage)) / 100;
  };
  const billValue = (b: any) => b.items.reduce((sum: number, s: any) => sum + itemValue(s), 0);
  const historyTotal = filteredHistory.reduce((s, b) => s + billValue(b), 0);

  const tabBtn = (key: Tab, label: string) => (
    <button type="button" onClick={() => setTab(key)} style={{ ...styles.secondaryBtn, background: tab === key ? '#1e293b' : 'transparent', color: tab === key ? 'white' : '#475569' }}>{label}</button>
  );
  const stockDoc: ShareDocT = {
    title: 'Ready Goods Stock', headers: ['Model', 'Design', 'Color', ...locations, 'Total'],
    rows: matrix.map(r => [r.model, r.design, r.color, ...locations.map(l => r.loc[l] || 0), rowTotal(r)]),
    footer: [`TOTAL: ${matrix.reduce((s, r) => s + rowTotal(r), 0)} Pcs`]
  };
  const fabricDoc: ShareDocT = {
    title: 'Fabric Godown', headers: ['Item', 'Design', 'Color', 'Meters', 'Rate', 'Value'],
    rows: fabric.map(s => [s.item_name, s.design_no, s.color || '-', r3(num(s.available_meters)), num(s.rate_per_meter), money(num(s.available_meters) * num(s.rate_per_meter))]),
    footer: [`மொத்தம் ${r3(fabric.reduce((a, f) => a + num(f.available_meters), 0))} M | ₹ ${money(fabric.reduce((a, f) => a + num(f.available_meters) * num(f.rate_per_meter), 0))}`]
  };
  const exDoc: ShareDocT = {
    title: 'End Bits & Damage', headers: ['Type', 'Ref / Batch', 'Item / Model', 'Color', 'Qty', 'Remarks'],
    rows: exceptions.map(e => [e.stock_type === 'DAMAGE' ? 'Damage' : 'End Bit', e.ref_code || '-', e.model_or_item || '-', e.color || '-', `${num(e.qty)} ${e.unit || ''}`.trim(), e.remarks || '-'])
  };
  const histDoc: ShareDocT = {
    title: 'Supplier History', subtitle: supplier || 'All Suppliers', headers: ['Supplier', 'Bill No', 'Date', 'Item', 'Design', 'Color', 'Qty', 'Rate', 'Value'],
    rows: filteredHistory.flatMap(b => b.items.length === 0 ? [[b.supplier_name, b.bill_no, b.bill_date || '', '', '', '', '', '', '']] : b.items.map((s: any) => [b.supplier_name, b.bill_no, b.bill_date || '', s.item_name, s.design_no, s.color || '-', num(s.total_meters), num(s.rate_per_meter), money(itemValue(s))])),
    footer: [`${filteredHistory.length} Bill | மொத்தம் ₹ ${money(historyTotal)}`]
  };
  const supplierPhone = supMaster[String(supplier).trim().toLowerCase()]?.mobile as string | undefined;

  const fabricTotal = fabric.reduce((s, f) => s + num(f.available_meters), 0);
  const fabricValue = fabric.reduce((s, f) => s + num(f.available_meters) * num(f.rate_per_meter), 0);
  const exEndBit = exceptions.filter(e => e.stock_type === 'END_BIT').reduce((s, e) => s + num(e.qty), 0);
  const exDmgPcs = exceptions.filter(e => e.stock_type === 'DAMAGE' && String(e.unit || 'Pcs') !== 'Mtr').reduce((s, e) => s + num(e.qty), 0);
  const exDmgMtr = exceptions.filter(e => e.stock_type === 'DAMAGE' && String(e.unit || '') === 'Mtr').reduce((s, e) => s + num(e.qty), 0);

  return (
    <div style={styles.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {tabBtn('summary', '📊 Stock Summary')}
          {tabBtn('godown', '📦 Fabric Godown')}
          {tabBtn('exceptions', '⚠️ End Bits & Damage')}
          {tabBtn('insights', '📈 Sales & Re-cut')}
          {tabBtn('history', '📅 Supplier History')}
        </div>
        <button type="button" onClick={() => { setRefreshKey(k => k + 1); load(tab); }} style={styles.secondaryBtn}>↻ Refresh</button>
      </div>

      {error && <div style={{ marginBottom: '14px' }}><ErrorBanner message={error} onRetry={() => load(tab)} /></div>}
      {loading && <Loading />}

      {tab === 'insights' && <InsightsReport key={refreshKey} />}

      {/* ---------------- SUMMARY ---------------- */}
      {tab === 'summary' && !loading && snapshot && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
            <StatCard label="Fabric Godown (M)" value={r3(snapshot.fabricMeters)} color="#2563eb" onClick={() => drill.open('fabric')} sub="Click → விவரம்" />
            <StatCard label="Production WIP (Pcs)" value={snapshot.wipPieces} color="#d97706" onClick={() => drill.open('wip')} sub={Object.entries(snapshot.wipByStage).map(([k, v]) => `${k}: ${v}`).join(' • ') || 'Click → விவரம்'} />
            <StatCard label="Godown Ready (Pcs)" value={snapshot.godownPieces} color="#059669" onClick={() => drill.open('godown')} sub="Click → விவரம்" />
            <StatCard label="Showrooms (Pcs)" value={snapshot.showroomPieces} color="#7c3aed" onClick={() => drill.open('showroom')} sub="Click → விவரம்" />
            <StatCard label="End Bits (M)" value={r3(snapshot.endBitMeters)} color="#ea580c" onClick={() => drill.open('endbit')} sub="Click → விவரம்" />
            <StatCard label="Damage" value={`${snapshot.damagePieces} Pcs`} color="#dc2626" onClick={() => drill.open('damage')} sub={snapshot.damageMeters > 0 ? `+ ${r3(snapshot.damageMeters)} M fabric` : 'Click → விவரம்'} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <h4 style={{ margin: 0, color: '#0f172a' }}>👕 Ready Goods — Model / Design / Color வாரியாக (Godown + Showroom)</h4>
            <ShareBar doc={stockDoc} />
          </div>
          <TableWrap minWidth={520 + locations.length * 90}>
            <thead>
              <tr style={{ background: '#0f172a', color: 'white' }}>
                <th style={styles.thSub}>Model</th>
                <th style={styles.thSub}>Design</th>
                <th style={styles.thSub}>Color</th>
                {locations.map(l => <th key={l} style={{ ...styles.thSub, background: l === GODOWN ? '#065f46' : '#0c4a6e' }}>{l}</th>)}
                <th style={{ ...styles.thSub, background: '#7c2d12' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {matrix.length === 0 ? <EmptyRow cols={4 + locations.length} text="Ready Stock எதுவும் இல்லை." /> : matrix.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={styles.td}><strong>{r.model}</strong></td>
                  <td style={styles.td}>{r.design}</td>
                  <td style={styles.td}>{r.color}</td>
                  {locations.map(l => <td key={l} style={{ ...styles.td, color: r.loc[l] ? '#0f172a' : '#cbd5e1', fontWeight: r.loc[l] ? 'bold' : 'normal' }}>{r.loc[l] || 0}</td>)}
                  <td style={{ ...styles.td, fontWeight: 'bold', background: '#fff7ed' }}>{rowTotal(r)}</td>
                </tr>
              ))}
              {matrix.length > 0 && (
                <tr style={{ background: '#f1f5f9', fontWeight: 'bold' }}>
                  <td style={styles.td} colSpan={3}>TOTAL</td>
                  {locations.map(l => <td key={l} style={styles.td}>{matrix.reduce((s, r) => s + (r.loc[l] || 0), 0)}</td>)}
                  <td style={styles.td}>{matrix.reduce((s, r) => s + rowTotal(r), 0)}</td>
                </tr>
              )}
            </tbody>
          </TableWrap>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <h4 style={{ margin: 0, color: '#0f172a' }}>📏 Ready Goods — Size வாரியாக (Godown + Showroom)</h4>
            <ShareBar doc={sizeDoc} />
          </div>
          <TableWrap minWidth={620 + locations.length * 90}>
            <thead>
              <tr style={{ background: '#0f172a', color: 'white' }}>
                <th style={styles.thSub}>Model</th><th style={styles.thSub}>Design</th><th style={styles.thSub}>Color</th><th style={styles.thSub}>Size</th>
                {locations.map(l => <th key={l} style={{ ...styles.thSub, background: l === GODOWN ? '#065f46' : '#0c4a6e' }}>{l}</th>)}
                <th style={{ ...styles.thSub, background: '#7c2d12' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {sizeRows.length === 0 ? <EmptyRow cols={5 + locations.length} text="Ready Stock எதுவும் இல்லை." /> : sizeRows.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={styles.td}><strong>{r.model}</strong></td><td style={styles.td}>{r.design}</td><td style={styles.td}>{r.color}</td><td style={styles.td}><b>{r.size}</b></td>
                  {locations.map(l => <td key={l} style={{ ...styles.td, color: r.loc[l] ? '#0f172a' : '#cbd5e1' }}>{r.loc[l] || 0}</td>)}
                  <td style={{ ...styles.td, fontWeight: 'bold', background: '#fff7ed' }}>{rowTotal(r)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {WIP_STAGES.map(st => (
              <button key={st} type="button" onClick={() => setStage(st)} style={{ ...styles.secondaryBtn, background: stage === st ? '#1e293b' : 'transparent', color: stage === st ? 'white' : '#475569' }}>
                {st} ({wip.filter(w => w.current_status === st).reduce((a, w) => a + num(w.total_pieces), 0)})
              </button>
            ))}
          </div>
          <StageReport wip={wip} meta={wipMeta} names={bnames} availOf={wipAvail} stage={stage} />
        </div>
      )}

      {/* ---------------- FABRIC GODOWN ---------------- */}
      {tab === 'godown' && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a' }}>
              மொத்தம்: {r3(fabricTotal)} M &nbsp;|&nbsp; மதிப்பு (GST தவிர): ₹ {money(fabricValue)}
            </div>
            <ShareBar doc={fabricDoc} />
          </div>
          <TableWrap minWidth={680}>
            <thead>
              <tr style={{ background: '#0f172a', color: 'white' }}>
                <th style={styles.thSub}>Item</th><th style={styles.thSub}>Design</th><th style={styles.thSub}>Color</th><th style={styles.thSub}>Photo</th>
                <th style={styles.thSub}>Available (M)</th><th style={styles.thSub}>Rate</th><th style={styles.thSub}>Value (₹)</th>
              </tr>
            </thead>
            <tbody>
              {fabric.length === 0 ? <EmptyRow cols={7} text="Fabric Stock இல்லை." /> : fabric.map((s, i) => (
                <tr key={s.id ?? i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={styles.td}>{s.item_name}</td>
                  <td style={styles.td}>{s.design_no}</td>
                  <td style={styles.td}>{s.color || '-'}</td>
                  <td style={styles.td}>{s.image_url ? <button type="button" onClick={() => setPreview(s.image_url)} style={{ background: '#e0f2fe', color: '#0369a1', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>View Photo</button> : '-'}</td>
                  <td style={{ ...styles.td, color: '#059669', fontWeight: 'bold' }}>{r3(num(s.available_meters))}</td>
                  <td style={styles.td}>₹{s.rate_per_meter || 0}</td>
                  <td style={styles.td}>₹ {money(num(s.available_meters) * num(s.rate_per_meter))}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </div>
      )}

      {/* ---------------- EXCEPTIONS ---------------- */}
      {tab === 'exceptions' && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a' }}>
              End Bits: <span style={{ color: '#d97706' }}>{r3(exEndBit)} M</span> &nbsp;|&nbsp; Damage: <span style={{ color: '#dc2626' }}>{exDmgPcs} Pcs{exDmgMtr > 0 ? ` + ${r3(exDmgMtr)} M` : ''}</span>
            </div>
            <ShareBar doc={exDoc} />
          </div>
          <TableWrap minWidth={640}>
            <thead>
              <tr style={{ background: '#0f172a', color: 'white' }}>
                <th style={styles.thSub}>Type</th><th style={styles.thSub}>Ref / Batch</th><th style={styles.thSub}>Item / Model</th><th style={styles.thSub}>Qty</th><th style={styles.thSub}>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {exceptions.length === 0 ? <EmptyRow cols={5} text="End Bits / Damage பதிவுகள் இல்லை." /> : exceptions.map((ex, i) => (
                <tr key={ex.id ?? i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={styles.td}><strong style={{ color: ex.stock_type === 'DAMAGE' ? '#dc2626' : '#d97706' }}>{ex.stock_type === 'DAMAGE' ? 'Damage / Seconds' : 'End Bit'}</strong></td>
                  <td style={styles.td}>{ex.ref_code || '-'}</td>
                  <td style={styles.td}>{ex.model_or_item || '-'}</td>
                  <td style={{ ...styles.td, fontWeight: 'bold' }}>{ex.qty} {ex.unit || ''}</td>
                  <td style={styles.td}>{ex.remarks || '-'}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </div>
      )}

      {/* ---------------- SUPPLIER HISTORY ---------------- */}
      {tab === 'history' && !loading && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', background: '#f8fafc', padding: '14px', borderRadius: '8px', marginBottom: '16px', border: '1px solid #cbd5e1', alignItems: 'end' }}>
            <div>
              <label style={styles.label}>Supplier:</label>
              <select value={supplier} onChange={e => setSupplier(e.target.value)} style={styles.tblInput}>
                <option value="">All Suppliers</option>
                {supplierOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div><label style={styles.label}>From Date:</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={styles.tblInput} /></div>
            <div><label style={styles.label}>To Date:</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={styles.tblInput} /></div>
            <div><button type="button" onClick={() => { setSupplier(''); setStartDate(''); setEndDate(''); }} style={{ ...styles.secondaryBtn, padding: '8px 12px', fontSize: '12px', width: '100%' }}>Clear Filters</button></div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a' }}>{filteredHistory.length} Bill(s) &nbsp;|&nbsp; மொத்த மதிப்பு (GST உட்பட): ₹ {money(historyTotal)}</div>
            <ShareBar doc={histDoc} phone={supplierPhone} />
          </div>

          {filteredHistory.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>பொருந்தும் பதிவுகள் இல்லை.</p>
          ) : filteredHistory.map((bill, i) => (
            <div key={bill.id ?? i} style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '14px', marginBottom: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <div><strong>Supplier:</strong> {bill.supplier_name}{bill.supplier_place ? ` (${bill.supplier_place})` : ''} | <strong>Bill No:</strong> {bill.bill_no}</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span><strong>Date:</strong> {bill.bill_date || 'N/A'} | <strong>Value:</strong> ₹ {money(billValue(bill))}</span>
                  {(() => {
                    const doc = { title: `GRN Slip — Bill ${bill.bill_no}`, subtitle: `${bill.supplier_name}${bill.supplier_place ? ' (' + bill.supplier_place + ')' : ''} • ${bill.bill_date || ''} • Bale: ${bill.bale_no || '-'}`, headers: ['Item', 'Design', 'Color', 'Qty', 'Net Qty', 'Rate', 'GST %', 'Value'], rows: bill.items.map((st: any) => [st.item_name, st.design_no, st.color || '-', num(st.total_meters), num(st.net_meters), num(st.rate_per_meter), num(st.gst_percentage), money(itemValue(st))]), footer: [`Bill Value (GST உட்பட): ₹ ${money(billValue(bill))}`] };
                    const ph = supMaster[String(bill.supplier_name).trim().toLowerCase()]?.mobile;
                    return (<>
                      <button type="button" onClick={() => printDoc(doc)} style={{ background: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px', fontSize: '12px' }}>🖨️ Slip</button>
                      <button type="button" onClick={() => openWhatsApp(docToText(doc), ph)} style={{ background: '#dcfce7', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px', fontSize: '12px' }}>📲 WhatsApp</button>
                    </>);
                  })()}
                </div>
              </div>
              <TableWrap minWidth={640}>
                <thead>
                  <tr style={{ background: '#e2e8f0', color: '#334155' }}>
                    <th style={styles.thSub}>Item</th><th style={styles.thSub}>Design</th><th style={styles.thSub}>Color</th><th style={styles.thSub}>Rate</th>
                    <th style={styles.thSub}>GST %</th><th style={styles.thSub}>Total</th><th style={styles.thSub}>Net Qty</th><th style={styles.thSub}>Photo</th>
                  </tr>
                </thead>
                <tbody>
                  {bill.items.map((st: any, idx: number) => (
                    <tr key={st.id ?? idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={styles.td}>{st.item_name}</td><td style={styles.td}>{st.design_no}</td><td style={styles.td}>{st.color || '-'}</td>
                      <td style={styles.td}>₹{st.rate_per_meter}</td><td style={styles.td}>{st.gst_percentage}%</td>
                      <td style={styles.td}>{st.total_meters}</td><td style={styles.td}>{st.net_meters}</td>
                      <td style={styles.td}>{st.image_url ? <button type="button" onClick={() => setPreview(st.image_url)} style={{ background: '#e0f2fe', color: '#0369a1', border: 'none', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>View</button> : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </div>
          ))}
        </div>
      )}

      {drill.node}
      {preview && <ImagePreview src={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

