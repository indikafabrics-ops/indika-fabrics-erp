import { useCallback, useEffect, useState } from 'react';
import { fetchAll, errMsg } from '../lib/supabase';
import {
  computeShowroomLines, downloadCsv, loadStockSnapshot, mergeExceptionRows, money, num, r3, todayStr, uniqueSorted,
  type StockSnapshot
} from '../lib/helpers';
import { EmptyRow, ErrorBanner, ImagePreview, Loading, StatCard, TableWrap, styles } from '../components/ui';

type Tab = 'summary' | 'godown' | 'exceptions' | 'history';

const GODOWN = 'Central Godown';

export default function ReportsModule() {
  const [tab, setTab] = useState<Tab>('summary');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<string | null>(null);

  const [snapshot, setSnapshot] = useState<StockSnapshot | null>(null);
  const [readyStock, setReadyStock] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
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
      } else if (which === 'godown') {
        const rows = await fetchAll('pommys_fabric_stock', '*', q => q.gt('available_meters', 0.01));
        setFabric(rows.reverse());
      } else if (which === 'exceptions') {
        const [ex, cut] = await Promise.all([
          fetchAll('pommys_exceptions_stock', '*'),
          fetchAll('pommys_cutting_batches', 'batch_code,product_model,end_bit_meters', q => q.gt('end_bit_meters', 0), 'batch_code')
        ]);
        setExceptions(mergeExceptionRows(ex, cut).reverse());
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

  const exportStockCsv = () => {
    const rows: (string | number)[][] = [['Location / Showroom', 'Model', 'Design', 'Color', 'Pieces']];
    readyStock.forEach(r => rows.push([GODOWN, r.model_name || '-', r.design_no || '-', r.color || '-', num(r.ready_pieces)]));
    lines.forEach(l => rows.push([l.showroom, l.model, l.design, l.color, l.pcs]));
    downloadCsv(`pommys-stock-summary-${todayStr()}.csv`, rows);
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

  const exportHistoryCsv = () => {
    const rows: (string | number)[][] = [['Supplier', 'Bill No', 'Bill Date', 'Item', 'Design', 'Color', 'Total Qty', 'Net Qty', 'Rate', 'GST %', 'Value (incl GST)']];
    filteredHistory.forEach(b => {
      if (b.items.length === 0) rows.push([b.supplier_name, b.bill_no, b.bill_date || '', '', '', '', '', '', '', '', '']);
      b.items.forEach((s: any) => rows.push([b.supplier_name, b.bill_no, b.bill_date || '', s.item_name, s.design_no, s.color, num(s.total_meters), num(s.net_meters), num(s.rate_per_meter), num(s.gst_percentage), r3(itemValue(s))]));
    });
    downloadCsv(`pommys-supplier-history-${todayStr()}.csv`, rows);
  };

  const exportFabricCsv = () => {
    const rows: (string | number)[][] = [['Item', 'Design', 'Color', 'Available (M)', 'Rate / M', 'Value']];
    fabric.forEach(s => rows.push([s.item_name, s.design_no, s.color || '-', num(s.available_meters), num(s.rate_per_meter), r3(num(s.available_meters) * num(s.rate_per_meter))]));
    downloadCsv(`pommys-fabric-stock-${todayStr()}.csv`, rows);
  };

  const exportExceptionsCsv = () => {
    const rows: (string | number)[][] = [['Type', 'Ref / Batch', 'Item / Model', 'Color', 'Qty', 'Unit', 'Remarks']];
    exceptions.forEach(e => rows.push([e.stock_type === 'DAMAGE' ? 'Damage / Seconds' : 'End Bit', e.ref_code || '-', e.model_or_item || '-', e.color || '-', num(e.qty), e.unit || '', e.remarks || '']));
    downloadCsv(`pommys-endbit-damage-${todayStr()}.csv`, rows);
  };

  const tabBtn = (key: Tab, label: string) => (
    <button type="button" onClick={() => setTab(key)} style={{ ...styles.secondaryBtn, background: tab === key ? '#1e293b' : 'transparent', color: tab === key ? 'white' : '#475569' }}>{label}</button>
  );
  const csvBtn = (onClick: () => void) => (
    <button type="button" onClick={onClick} style={{ background: '#059669', color: 'white', border: 'none', padding: '8px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>⬇️ Export Excel (CSV)</button>
  );

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
          {tabBtn('history', '📅 Supplier History')}
        </div>
        <button type="button" onClick={() => load(tab)} style={styles.secondaryBtn}>↻ Refresh</button>
      </div>

      {error && <div style={{ marginBottom: '14px' }}><ErrorBanner message={error} onRetry={() => load(tab)} /></div>}
      {loading && <Loading />}

      {/* ---------------- SUMMARY ---------------- */}
      {tab === 'summary' && !loading && snapshot && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
            <StatCard label="Fabric Godown (M)" value={r3(snapshot.fabricMeters)} color="#2563eb" />
            <StatCard label="Production WIP (Pcs)" value={snapshot.wipPieces} color="#d97706" sub={Object.entries(snapshot.wipByStage).map(([k, v]) => `${k}: ${v}`).join(' • ')} />
            <StatCard label="Godown Ready (Pcs)" value={snapshot.godownPieces} color="#059669" />
            <StatCard label="Showrooms (Pcs)" value={snapshot.showroomPieces} color="#7c3aed" />
            <StatCard label="End Bits (M)" value={r3(snapshot.endBitMeters)} color="#ea580c" />
            <StatCard label="Damage" value={`${snapshot.damagePieces} Pcs`} color="#dc2626" sub={snapshot.damageMeters > 0 ? `+ ${r3(snapshot.damageMeters)} M fabric` : undefined} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <h4 style={{ margin: 0, color: '#0f172a' }}>👕 Ready Goods — Model / Design / Color வாரியாக (Godown + Showroom)</h4>
            {csvBtn(exportStockCsv)}
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
        </div>
      )}

      {/* ---------------- FABRIC GODOWN ---------------- */}
      {tab === 'godown' && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a' }}>
              மொத்தம்: {r3(fabricTotal)} M &nbsp;|&nbsp; மதிப்பு (GST தவிர): ₹ {money(fabricValue)}
            </div>
            {csvBtn(exportFabricCsv)}
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
            {csvBtn(exportExceptionsCsv)}
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
            {csvBtn(exportHistoryCsv)}
          </div>

          {filteredHistory.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>பொருந்தும் பதிவுகள் இல்லை.</p>
          ) : filteredHistory.map((bill, i) => (
            <div key={bill.id ?? i} style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '14px', marginBottom: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <div><strong>Supplier:</strong> {bill.supplier_name}{bill.supplier_place ? ` (${bill.supplier_place})` : ''} | <strong>Bill No:</strong> {bill.bill_no}</div>
                <div><strong>Date:</strong> {bill.bill_date || 'N/A'} | <strong>Value:</strong> ₹ {money(billValue(bill))}</div>
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

      {preview && <ImagePreview src={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

