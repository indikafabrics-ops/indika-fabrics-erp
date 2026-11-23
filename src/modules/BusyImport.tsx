import { useMemo, useState, type ChangeEvent } from 'react';
import { supabase, fetchAll, errMsg } from '../lib/supabase';
import { parseCsv, parseDateLoose, parseQty } from '../lib/csv';
import { computeShowroomLines, num, todayStr } from '../lib/helpers';
import { notify, styles } from '../components/ui';

const MAP_KEY = 'pommys_busy_item_map';
const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9஀-௿]+/g, '');
const lineKey = (l: { model: string; design: string; color: string }) => `${l.model}|${l.design}|${l.color}`;

const loadMap = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(MAP_KEY) || '{}'); } catch { return {}; } };
const saveMap = (m: Record<string, string>) => { try { localStorage.setItem(MAP_KEY, JSON.stringify(m)); } catch { /* ignore */ } };

const HEAD_HINTS: Record<string, RegExp> = {
  date: /date|dt|தேதி/i,
  bill: /bill|vch|voucher|invoice|inv|ref/i,
  item: /item|particular|product|description|name|article|பொருள்/i,
  qty: /qty|quantity|pcs|piece|nos|எண்/i,
  showroom: /showroom|branch|godown|store|party|customer|shop|கடை/i
};

interface Line { showroom: string; model: string; design: string; color: string; pcs: number }
interface Row { id: number; date: string; dateGuess: boolean; bill: string; item: string; qty: number; showroom: string; line: string; note: string }

export default function BusyImport({ showrooms, onDone }: { showrooms: string[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [table, setTable] = useState<string[][]>([]);
  const [headerIdx, setHeaderIdx] = useState(0);
  const [cols, setCols] = useState<Record<string, number>>({ date: -1, bill: -1, item: -1, qty: -1, showroom: -1 });
  const [defaultShowroom, setDefaultShowroom] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState('');
  const [result, setResult] = useState('');

  const headers = table[headerIdx] || [];

  const guessHeader = (t: string[][]) => {
    for (let i = 0; i < Math.min(t.length, 20); i++) {
      const r = t[i];
      if (r.some(c => HEAD_HINTS.item.test(c)) && r.some(c => HEAD_HINTS.qty.test(c))) return i;
    }
    return 0;
  };

  const ingest = (text: string) => {
    const t = parseCsv(text);
    if (t.length < 2) return notify('கோப்பில் தரவு இல்லை அல்லது படிக்க முடியவில்லை. CSV ஆகச் சேமித்து முயலவும்.', 'err');
    const h = guessHeader(t);
    setTable(t);
    setHeaderIdx(h);
    const next: Record<string, number> = { date: -1, bill: -1, item: -1, qty: -1, showroom: -1 };
    t[h].forEach((c, i) => {
      (Object.keys(next) as string[]).forEach(k => { if (next[k] === -1 && HEAD_HINTS[k].test(c)) next[k] = i; });
    });
    // "Name"/"Party" style columns can clash: keep item and showroom different
    if (next.showroom === next.item) next.showroom = -1;
    setCols(next);
    setResult('');
    setRows([]);
    refreshLines();
  };

  const refreshLines = async () => {
    try {
      const tr = await fetchAll('pommys_showroom_transfers', '*');
      setLines(computeShowroomLines(tr).filter(l => l.pcs > 0));
    } catch (err: any) { notify('Showroom Stock load தோல்வி: ' + errMsg(err), 'err'); }
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (/\.xlsx?$/i.test(f.name)) { notify('Excel கோப்பில் File → Save As → CSV (Comma delimited) ஆகச் சேமித்து அதை ஏற்றவும்.', 'warn'); e.target.value = ''; return; }
    ingest(await f.text());
    e.target.value = '';
  };

  const matchLine = (item: string, showroom: string, remembered: Record<string, string>): string => {
    const cands = lines.filter(l => l.showroom.toLowerCase() === showroom.toLowerCase());
    const mem = remembered[norm(item)];
    if (mem && cands.some(l => lineKey(l) === mem)) return mem;
    const n = norm(item);
    let best = 0, bestKeys: string[] = [];
    cands.forEach(l => {
      let sc = 0;
      if (l.design !== '-' && n.includes(norm(l.design))) sc += 3;
      if (l.color !== '-' && n.includes(norm(l.color))) sc += 2;
      if (l.model !== '-' && n.includes(norm(l.model))) sc += 1;
      if (sc > best) { best = sc; bestKeys = [lineKey(l)]; } else if (sc === best && sc > 0) bestKeys.push(lineKey(l));
    });
    return best >= 3 && bestKeys.length === 1 ? bestKeys[0] : '';
  };

  const buildRows = () => {
    if (cols.item < 0 || cols.qty < 0) return notify('Item மற்றும் Qty column-ஐத் தேர்வு செய்யவும்.', 'err');
    if (!defaultShowroom && cols.showroom < 0) return notify('Showroom தேர்வு செய்யவும்.', 'err');
    const remembered = loadMap();
    const body = table.slice(headerIdx + 1);
    const out: Row[] = [];
    const perBill: Record<string, number> = {};
    body.forEach((r, i) => {
      const item = (r[cols.item] || '').trim();
      const q = parseQty(r[cols.qty]);
      if (!item || /^(grand\s*)?total/i.test(item) || !Number.isFinite(q)) return;
      let note = '';
      if (q <= 0) return; // sales returns / zero rows are not imported
      if (!Number.isInteger(q)) note = 'Qty முழு எண் அல்ல';
      const dateRaw = cols.date >= 0 ? r[cols.date] || '' : '';
      const date = parseDateLoose(dateRaw);
      const bill = cols.bill >= 0 ? (r[cols.bill] || '').trim() : '';
      let showroom = defaultShowroom;
      if (cols.showroom >= 0) {
        const raw = norm(r[cols.showroom] || '');
        const hit = showrooms.find(s => norm(s) === raw) || showrooms.find(s => raw && (raw.includes(norm(s)) || norm(s).includes(raw)));
        showroom = hit || defaultShowroom;
        if (!hit && !defaultShowroom) note = note || 'Showroom பொருந்தவில்லை';
      }
      const k = `${bill || date || 'NA'}`;
      perBill[k] = (perBill[k] || 0) + 1;
      out.push({
        id: i, date: date || todayStr(), dateGuess: !date, bill: `${k}-${perBill[k]}`, item, qty: Math.round(q), showroom,
        line: showroom ? matchLine(item, showroom, remembered) : '', note
      });
    });
    if (out.length === 0) return notify('இறக்குமதி செய்யக்கூடிய விற்பனை வரிகள் இல்லை (Item / Qty column சரியா?).', 'err');
    setRows(out);
    setResult('');
  };

  const setRow = (id: number, patch: Partial<Row>) => setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));

  const changeLine = (r: Row, v: string) => {
    setRow(r.id, { line: v });
    if (v) { const m = loadMap(); m[norm(r.item)] = v; saveMap(m); }
  };
  const changeShowroom = (r: Row, v: string) => setRow(r.id, { showroom: v, line: v ? matchLine(r.item, v, loadMap()) : '' });

  // running stock check so two rows for the same item cannot exceed what the showroom holds
  const checked = useMemo(() => {
    const left = new Map<string, number>();
    lines.forEach(l => left.set(`${l.showroom.toLowerCase()}|${lineKey(l)}`, l.pcs));
    return rows.map(r => {
      if (!r.line || !r.showroom) return { r, ok: false, why: 'Item பொருத்த வேண்டும்' };
      if (r.note && !r.note.startsWith('Showroom')) return { r, ok: false, why: r.note };
      const k = `${r.showroom.toLowerCase()}|${r.line}`;
      const have = left.get(k) ?? 0;
      if (r.qty > have) return { r, ok: false, why: `Showroom-ல் ${have} Pcs மட்டுமே` };
      left.set(k, have - r.qty);
      return { r, ok: true, why: '' };
    });
  }, [rows, lines]);
  const okCount = checked.filter(c => c.ok).length;

  const doImport = async () => {
    const todo = checked.filter(c => c.ok).map(c => c.r);
    if (todo.length === 0) return notify('இறக்குமதி செய்ய ஒரு வரியும் தயாராக இல்லை.', 'err');
    if (!window.confirm(`${todo.length} விற்பனை வரிகளை Showroom Stock-ல் இருந்து குறைக்கவா?`)) return;
    setBusy(true);
    try {
      // fresh read: duplicates and stock may have changed since the preview
      const tr = await fetchAll('pommys_showroom_transfers', '*');
      const existing = new Set(tr.map((t: any) => String(t.challan_no || '')));
      const left = new Map<string, number>();
      computeShowroomLines(tr).forEach(l => left.set(`${l.showroom.toLowerCase()}|${lineKey(l)}`, l.pcs));
      let done = 0, dup = 0;
      const failed: string[] = [];
      for (const r of todo) {
        const ref = `BUSY-${r.bill}`;
        if (existing.has(ref)) { dup++; continue; }
        const [model, design, color] = r.line.split('|');
        const k = `${r.showroom.toLowerCase()}|${r.line}`;
        const have = left.get(k) ?? 0;
        if (r.qty > have) { failed.push(`${r.item} (${r.qty} > ${have})`); continue; }
        const { error } = await supabase.from('pommys_showroom_transfers').insert([{
          challan_no: ref, transfer_date: r.date, showroom_name: r.showroom, batch_code: ref,
          design_no: design, color, model_name: model, size_details: 'Busy Sale', transferred_pieces: -r.qty, status: 'Showroom Sale'
        }]);
        if (error) { failed.push(`${r.item}: ${errMsg(error)}`); continue; }
        left.set(k, have - r.qty);
        done++;
      }
      setResult(`✅ ${done} வரிகள் பதிவு • ${dup} ஏற்கனவே ஏற்றப்பட்டவை தவிர்க்கப்பட்டன${failed.length ? ` • ❌ ${failed.length} தோல்வி: ${failed.slice(0, 4).join('; ')}` : ''}`);
      notify(`Busy Sales: ${done} பதிவு ஆனது.`, failed.length ? 'warn' : 'ok');
      setRows([]);
      await refreshLines();
      onDone();
    } catch (err: any) {
      notify('Import தோல்வி: ' + errMsg(err), 'err');
    } finally {
      setBusy(false);
    }
  };

  const colSel = (k: string, label: string) => (
    <div>
      <label style={styles.label}>{label}</label>
      <select value={cols[k]} onChange={e => setCols({ ...cols, [k]: Number(e.target.value) })} style={styles.input}>
        <option value={-1}>— இல்லை —</option>
        {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
      </select>
    </div>
  );

  return (
    <div style={styles.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <h4 style={{ margin: 0, color: '#0f172a' }}>📥 Busy Sales Import</h4>
        <span style={{ color: '#64748b', fontSize: '13px' }}>{open ? '▲ மூடு' : '▼ திற'}</span>
      </div>
      {open && (
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
            Busy-ல் Item-wise Sales / Sales Register report-ஐ Excel-ல் திறந்து <b>Save As → CSV</b> ஆகச் சேமித்து இங்கே ஏற்றவும். விற்பனை Showroom Stock-ல் இருந்து தானாகக் குறையும்; அதே கோப்பை மீண்டும் ஏற்றினாலும் இரட்டிப்பாகாது.
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="file" accept=".csv,.txt,.tsv,text/csv" onChange={onFile} />
            <span style={{ fontSize: '12px', color: '#64748b' }}>அல்லது Report-ஐ Copy செய்து கீழே Paste செய்து "படி" அழுத்தவும்</span>
          </div>
          <textarea value={paste} onChange={e => setPaste(e.target.value)} placeholder="Paste report here (optional)" rows={3} style={{ ...styles.input, fontFamily: 'monospace' }} />
          {paste.trim() && <div><button type="button" onClick={() => ingest(paste)} style={styles.secondaryBtn}>படி</button></div>}

          {table.length > 0 && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
                {colSel('date', 'Date column')}
                {colSel('bill', 'Bill No column')}
                {colSel('item', 'Item column *')}
                {colSel('qty', 'Qty column *')}
                {colSel('showroom', 'Showroom column')}
                <div>
                  <label style={styles.label}>Showroom (கோப்பில் இல்லையெனில்)</label>
                  <select value={defaultShowroom} onChange={e => setDefaultShowroom(e.target.value)} style={styles.input}>
                    <option value="">-- Select --</option>
                    {showrooms.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div><button type="button" onClick={buildRows} style={styles.primaryBtn}>முன்னோட்டம் காட்டு</button></div>
            </>
          )}

          {rows.length > 0 && (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: '820px', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead><tr style={{ background: '#0f172a', color: 'white' }}>
                    <th style={styles.thSub}>Date</th><th style={styles.thSub}>Busy Item</th><th style={styles.thSub}>Qty</th>
                    <th style={styles.thSub}>Showroom</th><th style={styles.thSub}>ERP Item (Model / Design / Color)</th><th style={styles.thSub}>நிலை</th>
                  </tr></thead>
                  <tbody>
                    {checked.map(({ r, ok, why }) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid #e2e8f0', background: ok ? undefined : '#fef2f2' }}>
                        <td style={styles.td}>{r.date}{r.dateGuess ? ' ⚠️' : ''}</td>
                        <td style={styles.td}>{r.item}</td>
                        <td style={styles.td}><b>{r.qty}</b></td>
                        <td style={styles.td}>
                          <select value={r.showroom} onChange={e => changeShowroom(r, e.target.value)} style={styles.tblInput}>
                            <option value="">--</option>
                            {showrooms.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td style={styles.td}>
                          <select value={r.line} onChange={e => changeLine(r, e.target.value)} style={styles.tblInput}>
                            <option value="">— தவிர் / தேர்வு —</option>
                            {lines.filter(l => l.showroom.toLowerCase() === r.showroom.toLowerCase()).map(l => (
                              <option key={lineKey(l)} value={lineKey(l)}>{l.model} / {l.design} / {l.color} ({l.pcs} Pcs)</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ ...styles.td, color: ok ? '#059669' : '#dc2626', fontWeight: 'bold' }}>{ok ? '✅ தயார்' : `❌ ${why}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" onClick={doImport} disabled={busy || okCount === 0} style={styles.successBtn}>{busy ? 'Importing...' : `✅ ${okCount} வரிகளை Import செய்`}</button>
                <span style={{ fontSize: '12px', color: '#64748b' }}>❌ வரிகள் தவிர்க்கப்படும். Item-ஐ ஒரு முறை தேர்ந்தால் அடுத்த முறை தானாகப் பொருந்தும். ⚠️ = தேதி புரியவில்லை, இன்றைய தேதி எடுக்கப்பட்டது.</span>
              </div>
            </>
          )}
          {result && <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', padding: '10px', borderRadius: '8px', fontSize: '13px' }}>{result}</div>}
        </div>
      )}
    </div>
  );
}
