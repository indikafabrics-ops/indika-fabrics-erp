import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchAll, errMsg } from '../lib/supabase';
import { computeShowroomLines, downloadCsv, num, r3, todayStr } from '../lib/helpers';
import { loadBatchMeta } from '../lib/batchMeta';
import { EmptyRow, ErrorBanner, Loading, StatCard, TableWrap, styles } from '../components/ui';

const addDays = (d: string, n: number) => {
  const t = new Date(d + 'T00:00:00');
  t.setDate(t.getDate() + n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
};
const key = (m: string, d: string) => `${String(m || '-').trim()}|${String(d || '-').trim()}`;

interface Row { model: string; design: string; godown: number; showroom: number; wip: number; sold30: number; sold60: number }

export default function InsightsReport() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ready, setReady] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [wip, setWip] = useState<any[]>([]);
  const [cutting, setCutting] = useState<any[]>([]);
  const [tailor, setTailor] = useState<any[]>([]);
  const [meta, setMeta] = useState<Record<string, { design: string; color: string }>>({});

  const [from, setFrom] = useState(addDays(todayStr(), -29));
  const [to, setTo] = useState(todayStr());
  const [threshold, setThreshold] = useState('10');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [rd, tr, w, cut, tl] = await Promise.all([
        fetchAll('pommys_ready_stock', '*'),
        fetchAll('pommys_showroom_transfers', '*'),
        fetchAll('pommys_production_wip', 'id,batch_code,model_name,total_pieces,current_status', q => q.neq('current_status', 'Ready Stock')),
        fetchAll('pommys_cutting_batches', 'batch_code,product_model,selected_fabrics_json,total_pieces,end_bit_meters', undefined, 'batch_code'),
        fetchAll('pommys_tailor_ledger', '*').catch(() => [] as any[])
      ]);
      const readyNow = rd.filter((r: any) => num(r.ready_pieces) > 0);
      setReady(readyNow); setTransfers(tr); setWip(w); setCutting(cut); setTailor(tl);
      setMeta(await loadBatchMeta([...readyNow, ...w].map((r: any) => ({ batch_code: r.batch_code || '', model_name: r.model_name }))));
    } catch (err: any) {
      setError('Insights load தோல்வி: ' + errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // ---------- sales (showroom) ----------
  const isSale = (t: any) => String(t.status || '') === 'Showroom Sale';
  const salesIn = (a: string, b: string) => transfers.filter(t => isSale(t) && String(t.transfer_date || '').slice(0, 10) >= a && String(t.transfer_date || '').slice(0, 10) <= b);

  const salesRows = useMemo(() => {
    const map = new Map<string, { showroom: string; model: string; design: string; color: string; pcs: number }>();
    salesIn(from, to).forEach(t => {
      const k = [t.showroom_name, t.model_name, t.design_no, t.color].join('|').toLowerCase();
      const cur = map.get(k) || { showroom: t.showroom_name || '-', model: t.model_name || '-', design: t.design_no || '-', color: t.color || '-', pcs: 0 };
      cur.pcs += Math.abs(num(t.transferred_pieces));
      map.set(k, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.pcs - a.pcs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transfers, from, to]);
  const salesByShowroom = useMemo(() => {
    const m = new Map<string, number>();
    salesRows.forEach(r => m.set(r.showroom, (m.get(r.showroom) || 0) + r.pcs));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [salesRows]);
  const totalSold = salesRows.reduce((s, r) => s + r.pcs, 0);

  // ---------- reorder / slow ----------
  const stockRows: Row[] = useMemo(() => {
    const map = new Map<string, Row>();
    const get = (m: string, d: string) => {
      const k = key(m, d).toLowerCase();
      let r = map.get(k);
      if (!r) { r = { model: String(m || '-').trim(), design: String(d || '-').trim(), godown: 0, showroom: 0, wip: 0, sold30: 0, sold60: 0 }; map.set(k, r); }
      return r;
    };
    ready.forEach((r: any) => {
      const mm = meta[r.batch_code || ''];
      get(r.model_name, r.design_no && r.design_no !== '-' ? r.design_no : mm?.design || '-').godown += num(r.ready_pieces);
    });
    computeShowroomLines(transfers).forEach(l => { if (l.pcs > 0) get(l.model, l.design).showroom += l.pcs; });
    wip.forEach((b: any) => { get(b.model_name, meta[b.batch_code]?.design || '-').wip += num(b.total_pieces); });
    const today = todayStr();
    const d30 = addDays(today, -29), d60 = addDays(today, -59);
    transfers.filter(isSale).forEach(t => {
      const day = String(t.transfer_date || '').slice(0, 10);
      const r = get(t.model_name, t.design_no);
      if (day >= d60) r.sold60 += Math.abs(num(t.transferred_pieces));
      if (day >= d30) r.sold30 += Math.abs(num(t.transferred_pieces));
    });
    return Array.from(map.values());
  }, [ready, transfers, wip, meta]);

  const th = Math.max(0, Math.floor(num(threshold)));
  const reorder = stockRows
    .map(r => {
      const stock = r.godown + r.showroom;
      const perDay = r.sold30 / 30;
      const daysLeft = perDay > 0 ? stock / perDay : null;
      const low = stock + r.wip <= th || (daysLeft !== null && daysLeft < 15 && r.wip === 0);
      return { ...r, stock, daysLeft, low };
    })
    .filter(r => r.low && (r.sold60 > 0 || r.stock + r.wip > 0))
    .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
  const slow = stockRows.filter(r => r.godown + r.showroom > 0 && r.sold60 === 0)
    .sort((a, b) => (b.godown + b.showroom) - (a.godown + a.showroom));

  // ---------- tailor ----------
  const tailorRows = useMemo(() => {
    const map = new Map<string, { name: string; issued: number; received: number; pending: number; wagesDue: number; wagesPending: number; jobs: number }>();
    tailor.forEach((e: any) => {
      const name = String(e.tailor_name || '-').trim();
      const cur = map.get(name) || { name, issued: 0, received: 0, pending: 0, wagesDue: 0, wagesPending: 0, jobs: 0 };
      const pcs = num(e.pieces);
      const amt = pcs * num(e.rate_per_pc);
      cur.jobs += 1; cur.issued += pcs;
      if (String(e.status) === 'Received') { cur.received += pcs; cur.wagesDue += amt; } else { cur.pending += pcs; cur.wagesPending += amt; }
      map.set(name, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.pending - a.pending);
  }, [tailor]);

  // ---------- cutting yield ----------
  const yieldRows = useMemo(() => {
    const map = new Map<string, { model: string; batches: number; meters: number; pcs: number; endBit: number }>();
    cutting.forEach((c: any) => {
      const fabs = Array.isArray(c.selected_fabrics_json) ? c.selected_fabrics_json : [];
      const meters = fabs.reduce((s: number, f: any) => s + num(f && f.issueMeters), 0);
      if (meters <= 0 || num(c.total_pieces) <= 0) return;
      const model = String(c.product_model || '-').trim();
      const cur = map.get(model.toLowerCase()) || { model, batches: 0, meters: 0, pcs: 0, endBit: 0 };
      cur.batches += 1; cur.meters += meters; cur.pcs += num(c.total_pieces); cur.endBit += num(c.end_bit_meters);
      map.set(model.toLowerCase(), cur);
    });
    return Array.from(map.values()).sort((a, b) => b.pcs - a.pcs);
  }, [cutting]);

  const exportSales = () => {
    const rows: (string | number)[][] = [['Showroom', 'Model', 'Design', 'Color', 'Sold Pcs']];
    salesRows.forEach(r => rows.push([r.showroom, r.model, r.design, r.color, r.pcs]));
    downloadCsv(`pommys-showroom-sales-${from}-to-${to}.csv`, rows);
  };
  const exportReorder = () => {
    const rows: (string | number)[][] = [['Model', 'Design', 'Godown', 'Showroom', 'In Production', 'Sold (30 days)', 'Days of stock left']];
    reorder.forEach(r => rows.push([r.model, r.design, r.godown, r.showroom, r.wip, r.sold30, r.daysLeft === null ? '-' : Math.round(r.daysLeft)]));
    downloadCsv(`pommys-recut-list-${todayStr()}.csv`, rows);
  };

  const csvBtn = (onClick: () => void) => (
    <button type="button" onClick={onClick} style={{ background: '#059669', color: 'white', border: 'none', padding: '8px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>⬇️ Export Excel (CSV)</button>
  );
  const h = (t: string, extra?: ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', margin: '0 0 10px 0' }}>
      <h4 style={{ margin: 0, color: '#0f172a' }}>{t}</h4>{extra}
    </div>
  );

  if (loading) return <Loading />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {error && <ErrorBanner message={error} onRetry={load} />}

      {/* SALES */}
      <section>
        {h('🛍️ Showroom வாரி விற்பனை', csvBtn(exportSales))}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
          <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>From <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ ...styles.input, width: 'auto' }} /></label>
          <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>To <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ ...styles.input, width: 'auto' }} /></label>
          <button type="button" style={styles.secondaryBtn} onClick={() => { setFrom(addDays(todayStr(), -6)); setTo(todayStr()); }}>7 நாள்</button>
          <button type="button" style={styles.secondaryBtn} onClick={() => { setFrom(addDays(todayStr(), -29)); setTo(todayStr()); }}>30 நாள்</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '12px' }}>
          <StatCard label="மொத்த விற்பனை (Pcs)" value={totalSold} color="#059669" />
          {salesByShowroom.map(([name, pcs]) => <StatCard key={name} label={name} value={`${pcs} Pcs`} color="#7c3aed" />)}
        </div>
        <TableWrap minWidth={560}>
          <thead><tr style={{ background: '#0f172a', color: 'white' }}>
            <th style={styles.thSub}>Showroom</th><th style={styles.thSub}>Model</th><th style={styles.thSub}>Design</th><th style={styles.thSub}>Color</th><th style={styles.thSub}>Sold Pcs</th>
          </tr></thead>
          <tbody>
            {salesRows.length === 0 ? <EmptyRow cols={5} text="இந்தக் காலத்தில் விற்பனைப் பதிவு இல்லை." /> : salesRows.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={styles.td}>{r.showroom}</td><td style={styles.td}>{r.model}</td><td style={styles.td}>{r.design}</td><td style={styles.td}>{r.color}</td>
                <td style={{ ...styles.td, fontWeight: 'bold', color: '#059669' }}>{r.pcs}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        <p style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>Showroom Stock பக்கத்தில் "Sale" என்று பதிந்தவை மட்டுமே கணக்கில் வரும்.</p>
      </section>

      {/* REORDER */}
      <section>
        {h('🔁 மீண்டும் Cut செய்ய வேண்டியவை (Low Stock)', csvBtn(exportReorder))}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px', fontSize: '13px', color: '#475569' }}>
          மொத்த இருப்பு (Godown + Showroom + Production) இதற்குக் கீழ் இருந்தால்:
          <input type="number" min="0" value={threshold} onChange={e => setThreshold(e.target.value)} style={{ ...styles.input, width: '80px' }} /> Pcs
        </div>
        <TableWrap minWidth={720}>
          <thead><tr style={{ background: '#0f172a', color: 'white' }}>
            <th style={styles.thSub}>Model</th><th style={styles.thSub}>Design</th><th style={styles.thSub}>Godown</th><th style={styles.thSub}>Showroom</th>
            <th style={styles.thSub}>Production-ல்</th><th style={styles.thSub}>30 நாள் விற்பனை</th><th style={styles.thSub}>இருப்பு எத்தனை நாளுக்கு</th>
          </tr></thead>
          <tbody>
            {reorder.length === 0 ? <EmptyRow cols={7} text="✅ இப்போது எந்த Design-உம் குறைவாக இல்லை." /> : reorder.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #e2e8f0', background: r.stock + r.wip === 0 ? '#fef2f2' : undefined }}>
                <td style={styles.td}>{r.model}</td><td style={styles.td}>{r.design}</td><td style={styles.td}>{r.godown}</td><td style={styles.td}>{r.showroom}</td>
                <td style={styles.td}>{r.wip}</td><td style={styles.td}>{r.sold30}</td>
                <td style={{ ...styles.td, fontWeight: 'bold', color: '#dc2626' }}>{r.daysLeft === null ? '-' : `${Math.round(r.daysLeft)} நாள்`}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </section>

      {/* SLOW */}
      <section>
        {h('🐌 60 நாளாக விற்காத Stock')}
        <TableWrap minWidth={520}>
          <thead><tr style={{ background: '#0f172a', color: 'white' }}>
            <th style={styles.thSub}>Model</th><th style={styles.thSub}>Design</th><th style={styles.thSub}>Godown</th><th style={styles.thSub}>Showroom</th>
          </tr></thead>
          <tbody>
            {slow.length === 0 ? <EmptyRow cols={4} text="தேங்கிய Stock இல்லை." /> : slow.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}><td style={styles.td}>{r.model}</td><td style={styles.td}>{r.design}</td><td style={styles.td}>{r.godown}</td><td style={styles.td}>{r.showroom}</td></tr>
            ))}
          </tbody>
        </TableWrap>
        <p style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>Sale பதிவு செய்யாவிட்டால் Design "விற்கவில்லை" என்றே தெரியும்; அதனால் Showroom விற்பனையை Sale என்று பதிவு செய்யவும்.</p>
      </section>

      {/* TAILOR */}
      <section>
        {h('🧵 தையல்காரர் கணக்கு')}
        <TableWrap minWidth={640}>
          <thead><tr style={{ background: '#0f172a', color: 'white' }}>
            <th style={styles.thSub}>Tailor</th><th style={styles.thSub}>Issued Pcs</th><th style={styles.thSub}>Received Pcs</th><th style={styles.thSub}>Pending Pcs</th>
            <th style={styles.thSub}>கொடுக்க வேண்டிய கூலி (Received)</th><th style={styles.thSub}>Pending வேலை கூலி</th>
          </tr></thead>
          <tbody>
            {tailorRows.length === 0 ? <EmptyRow cols={6} text="Tailor பதிவு இல்லை." /> : tailorRows.map(r => (
              <tr key={r.name} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={styles.td}><strong>{r.name}</strong></td><td style={styles.td}>{r.issued}</td><td style={styles.td}>{r.received}</td>
                <td style={{ ...styles.td, color: r.pending > 0 ? '#d97706' : undefined, fontWeight: 'bold' }}>{r.pending}</td>
                <td style={{ ...styles.td, color: '#059669', fontWeight: 'bold' }}>₹{r.wagesDue.toLocaleString('en-IN')}</td>
                <td style={styles.td}>₹{r.wagesPending.toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </section>

      {/* YIELD */}
      <section>
        {h('✂️ Cutting Yield (Model வாரி)')}
        <TableWrap minWidth={600}>
          <thead><tr style={{ background: '#0f172a', color: 'white' }}>
            <th style={styles.thSub}>Model</th><th style={styles.thSub}>Batches</th><th style={styles.thSub}>துணி (M)</th><th style={styles.thSub}>Pieces</th>
            <th style={styles.thSub}>100 M-க்கு Pcs</th><th style={styles.thSub}>Piece-க்கு M</th><th style={styles.thSub}>End Bit %</th>
          </tr></thead>
          <tbody>
            {yieldRows.length === 0 ? <EmptyRow cols={7} text="Cutting பதிவு இல்லை." /> : yieldRows.map(r => (
              <tr key={r.model} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={styles.td}><strong>{r.model}</strong></td><td style={styles.td}>{r.batches}</td><td style={styles.td}>{r3(r.meters)}</td><td style={styles.td}>{r.pcs}</td>
                <td style={{ ...styles.td, fontWeight: 'bold' }}>{r3((r.pcs / r.meters) * 100)}</td>
                <td style={styles.td}>{r3(r.meters / r.pcs)}</td>
                <td style={styles.td}>{r3((r.endBit / r.meters) * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </section>
    </div>
  );
}
