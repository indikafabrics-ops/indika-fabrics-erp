import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase, fetchAll, errMsg } from '../lib/supabase';
import type { ShowroomRecord } from '../lib/constants';
import { computeShowroomLines, computeShowroomSizeLines, sizeOfRow, num, todayStr } from '../lib/helpers';
import { loadSizeLedger, loadCutSizes, saveSizeUpdates, sizesFor, sumSizes, fmtSizes, sortSizes, NO_SIZE, type SizeMap } from '../lib/sizeLedger';
import SizeQty from '../components/SizeQty';
import { GalleryEditor, SwatchChips } from '../components/GallerySlots';
import BusyImport from './BusyImport';
import { matchPhotosByName, uploadCatalogPhoto } from '../lib/image';
import { loadBatchMeta, loadModelPhotos } from '../lib/batchMeta';
import { loadDesignMaster, designLookup, rateFor, type DesignInfo } from '../lib/masterStore';
import { uniqueNames, loadBatchNames, saveBatchNames , nameFor } from '../lib/batchNames';
import { logAction } from '../lib/audit';
import ShareBar from '../components/ShareBar';
import { printDoc, docToText, openWhatsApp } from '../lib/share';
import RowActions from '../components/RowActions';
import ReadyEdit from '../components/ReadyEdit';
import { submitChange, isAdmin } from '../lib/approvals';
import LocalNameEdit from '../components/LocalNameEdit';
import { EmptyRow, ErrorBanner, Loading, StatCard, TableWrap, notify, styles } from '../components/ui';

const rnd = () => Math.floor(1000 + Math.random() * 9000);

export default function ReadyStockModule({ canDelete, user }: { canDelete: boolean; user?: any }) {
  const [readyList, setReadyList] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [showrooms, setShowrooms] = useState<ShowroomRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // add showroom
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [addingShowroom, setAddingShowroom] = useState(false);

  // transfer
  const [selectedStockId, setSelectedStockId] = useState('');
  const [targetShowroom, setTargetShowroom] = useState('');
  const [challanNo, setChallanNo] = useState('');
  const [transferDate, setTransferDate] = useState(todayStr());
  const [transferBy, setTransferBy] = useState<Record<string, string>>({});
  const [ledger, setLedger] = useState<Record<string, SizeMap>>({});
  const [cutSizes, setCutSizes] = useState<Record<string, SizeMap>>({});
  const [sizeNote, setSizeNote] = useState('');
  const [transferring, setTransferring] = useState(false);

  // showroom sale / return / damage
  const [adjLine, setAdjLine] = useState('');
  const [adjType, setAdjType] = useState<'SALE' | 'RETURN' | 'DAMAGE'>('SALE');
  const [adjBy, setAdjBy] = useState<Record<string, string>>({});
  const [lastSale, setLastSale] = useState<any>(null);
  const [gallery, setGallery] = useState<{ model: string; design: string } | null>(null);
  const [adjusting, setAdjusting] = useState(false);

  const [meta, setMeta] = useState<Record<string, { design: string; color: string }>>({});
  const [photoOf, setPhotoOf] = useState<(m: string, d: string, c: string) => string>(() => () => '');
  const [uploadingKey, setUploadingKey] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});
  const [dm, setDm] = useState<(m: string, d: string) => DesignInfo | undefined>(() => () => undefined);

  const loadAll = useCallback(async () => {
    setError('');
    try {
      const [ready, trf, srData] = await Promise.all([
        fetchAll('pommys_ready_stock', '*'),
        fetchAll('pommys_showroom_transfers', '*'),
        fetchAll('pommys_showrooms', '*').catch(() => [] as any[])
      ]);
      ready.sort((a, b) => num(b.id) - num(a.id));
      trf.sort((a, b) => num(b.id) - num(a.id));
      const readyNow = ready.filter(r => num(r.ready_pieces) > 0);
      setReadyList(readyNow);
      try {
        setMeta(await loadBatchMeta(readyNow.map((r: any) => ({ batch_code: r.batch_code || '', model_name: r.model_name }))));
        try { setNames(await loadBatchNames()); } catch { /* optional */ }
        try { setLedger(await loadSizeLedger()); setCutSizes(await loadCutSizes()); } catch { /* optional */ }
        try { const lk = designLookup(await loadDesignMaster()); setDm(() => lk); } catch { /* optional */ }
        const ph = await loadModelPhotos();
        setPhotoOf(() => ph.photoOf);
      } catch { /* photos / labels are optional */ }
      setTransfers(trf);

      // showrooms that exist only inside old transfers are also shown
      let combined: ShowroomRecord[] = [...srData];
      const seen = new Set(combined.map(s => String(s.showroom_name || '').trim().toLowerCase()));
      trf.forEach((t: any) => {
        const name = String(t.showroom_name || '').trim();
        if (name && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          combined.push({ showroom_name: name, address: '' });
        }
      });
      setShowrooms(combined);
      setTargetShowroom(prev => prev || combined[0]?.showroom_name || '');
    } catch (err: any) {
      setError('Data load தோல்வி: ' + errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const designOf = (r: any) => (r.design_no && r.design_no !== '-' ? r.design_no : meta[r.batch_code || '']?.design || '-');
  const infoOf = (r: any) => dm(r.model_name, designOf(r));
  const colorOf = (r: any) => (r.color && r.color !== '-' ? r.color : meta[r.batch_code || '']?.color || '-');
  const handlePhoto = async (r: any, file: File | null) => {
    if (!file) return;
    const key = `${r.model_name}|${designOf(r)}`;
    setUploadingKey(key);
    try {
      await uploadCatalogPhoto(r.model_name, designOf(r), file);
      notify(`📷 ${r.model_name} / ${designOf(r)} Photo சேமிக்கப்பட்டது.`, 'ok');
      await loadAll();
    } catch (err: any) {
      notify('Photo ஏறவில்லை: ' + errMsg(err), 'err');
    } finally {
      setUploadingKey('');
    }
  };

  const handleBulkPhotos = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const seen = new Set<string>();
    const targets = readyList.map(r => ({ model: String(r.model_name || '').trim(), design: designOf(r) }))
      .filter(t => { const k = `${t.model}|${t.design}`.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    const { matched, unmatched } = matchPhotosByName(Array.from(list), targets);
    setUploadingKey('__bulk__');
    let ok = 0, fail = 0;
    for (const m of matched) {
      for (const t of m.targets) {
        try { await uploadCatalogPhoto(t.model, t.design, m.file); ok++; } catch { fail++; }
      }
    }
    setUploadingKey('');
    notify(`📷 ${ok} Design-க்கு Photo சேமிக்கப்பட்டது.${fail ? ` ❌ ${fail} தோல்வி.` : ''}${unmatched.length ? ` பொருந்தாதவை: ${unmatched.slice(0, 5).join(', ')}` : ''}`, fail || unmatched.length ? 'warn' : 'ok');
    await loadAll();
  };

  /** 🗑️ on one size line: only that size goes; the last size removes the whole batch row */
  const delSize = async (r: any, sk: string, szMap: SizeMap) => {
    const keys = Object.keys(szMap);
    const whole = keys.length <= 1 || sk === NO_SIZE;
    const q = whole ? Math.floor(num(r.ready_pieces)) : szMap[sk];
    if (!whole && !isAdmin(user)) return notify('ஒரு Size வரியை மட்டும் நீக்க Admin வேண்டும். (✏️ Edit-ல் Qty மாற்றலாம்; முழு Batch Delete கோரிக்கை அனுப்பலாம்.)', 'err');
    if (!window.confirm(whole ? `"${r.batch_code}" (${r.model_name}) முழுவதும் Delete செய்யவா?` : `${r.batch_code} — Size ${sk} (${q} Pcs) மட்டும் Delete செய்யவா?`)) return;
    try {
      const label = `Ready Stock ${r.batch_code} (${r.model_name})${whole ? '' : ' Size ' + sk}`;
      if (whole) {
        const res = await submitChange(user, { action: 'delete', table: 'pommys_ready_stock', rowId: r.id, label, before: r });
        if (res === 'done') { try { await saveSizeUpdates({ [r.batch_code]: null }); } catch { /* optional */ } }
        notify(res === 'done' ? '✅ Delete முடிந்தது.' : '📨 Delete கோரிக்கை Admin ஒப்புதலுக்கு அனுப்பப்பட்டது.', res === 'done' ? 'ok' : 'info');
      } else {
        const rest = { ...szMap }; delete rest[sk];
        await submitChange(user, { action: 'update', table: 'pommys_ready_stock', rowId: r.id, label, changes: { ready_pieces: sumSizes(rest) }, before: { ready_pieces: r.ready_pieces } });
        try { await saveSizeUpdates({ [r.batch_code]: rest }); } catch { notify('Size விவரம் சேமிக்க முடியவில்லை.', 'warn'); }
        notify(`✅ Size ${sk} நீக்கப்பட்டது.`, 'ok');
      }
      logAction(`Ready Stock Delete: ${label}`);
      await loadAll();
    } catch (err: any) { notify('Delete தோல்வி: ' + errMsg(err), 'err'); }
  };

  const lines = computeShowroomLines(transfers).filter(l => l.pcs !== 0);
  const sizeLines = computeShowroomSizeLines(transfers);
  const [rq, setRq] = useState('');
  const [editRow, setEditRow] = useState<{ r: any; size: string } | null>(null);
  const readyShown = readyList.filter(r => { const q = rq.trim().toLowerCase(); return !q || `${r.batch_code} ${nameFor(names, r.batch_code)} ${r.model_name} ${designOf(r)} ${colorOf(r)}`.toLowerCase().includes(q); });
  const totalGodownPcs = readyList.reduce((s, r) => s + num(r.ready_pieces), 0);
  const totalShowroomPcs = transfers.reduce((s, t) => s + num(t.transferred_pieces), 0);

  // ---------- add showroom ----------
  const handleAddShowroom = async (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return notify('Showroom Name உள்ளிடவும்.', 'err');
    if (showrooms.some(s => String(s.showroom_name).trim().toLowerCase() === name.toLowerCase())) {
      return notify(`"${name}" Showroom ஏற்கனவே உள்ளது.`, 'err');
    }
    setAddingShowroom(true);
    try {
      const { error: insErr } = await supabase.from('pommys_showrooms').insert([{ showroom_name: name, address: newAddress.trim(), phone: newPhone.trim() }]);
      if (insErr) throw insErr;
      notify(`✅ Showroom "${name}" சேர்க்கப்பட்டது.`);
      setTargetShowroom(name);
      setNewName(''); setNewAddress(''); setNewPhone('');
      await loadAll();
    } catch (err: any) {
      notify('Showroom சேர்க்க முடியவில்லை: ' + errMsg(err), 'err');
    } finally {
      setAddingShowroom(false);
    }
  };

  // ---------- transfer godown -> showroom ----------
  const selectedStock = readyList.find(r => String(r.id) === String(selectedStockId));

  const godownSizes = (r: any, pcs?: number): SizeMap => sizesFor(r.batch_code, Math.floor(num(pcs ?? r.ready_pieces)), ledger, cutSizes);

  const handleTransfer = async (e: FormEvent) => {
    e.preventDefault();
    if (!targetShowroom) return notify('முதலில் Showroom சேர்க்கவும் / தேர்வு செய்யவும்.', 'err');
    if (!selectedStock) return notify('Ready Stock Batch தேர்வு செய்யவும்.', 'err');

    setTransferring(true);
    let challan = '';
    try {
      // fresh godown count
      const { data: cur, error: curErr } = await supabase.from('pommys_ready_stock').select('*').eq('id', selectedStock.id).limit(1);
      if (curErr || !cur || !cur[0]) throw curErr || new Error('Batch கிடைக்கவில்லை.');
      const available = Math.floor(num(cur[0].ready_pieces));
      const avail = godownSizes(cur[0], available);
      const by: SizeMap = {};
      Object.keys(avail).forEach(sz => { by[sz] = Math.max(0, Math.floor(num(transferBy[sz]))); });
      for (const sz of Object.keys(avail)) if (by[sz] > avail[sz]) throw new Error(`Size ${sz}: Godown-ல் ${avail[sz]} Pcs மட்டுமே உள்ளது.`);
      const pcs = sumSizes(by);
      if (pcs <= 0) throw new Error('குறைந்தது ஒரு Size-ல் Transfer Pieces உள்ளிடவும்.');
      if (pcs > available) throw new Error(`Godown-ல் ${available} Pcs மட்டுமே உள்ளது.`);

      challan = challanNo.trim() || `TRF-${new Date().getFullYear()}-${rnd()}`;
      const rows = Object.keys(by).filter(sz => by[sz] > 0).map(sz => ({
        challan_no: challan, transfer_date: transferDate || todayStr(), showroom_name: targetShowroom,
        batch_code: cur[0].batch_code, design_no: cur[0].design_no || '-', color: cur[0].color || '-',
        model_name: cur[0].model_name || '-', size_details: sz === NO_SIZE ? (sizeNote.trim() || '-') : `Size ${sz}`,
        transferred_pieces: by[sz], status: 'Transferred to Showroom'
      }));
      const { error: insErr } = await supabase.from('pommys_showroom_transfers').insert(rows);
      if (insErr) throw insErr;

      const { error: updErr } = await supabase.from('pommys_ready_stock').update({ ready_pieces: available - pcs }).eq('id', cur[0].id);
      if (updErr) {
        await supabase.from('pommys_showroom_transfers').delete().eq('challan_no', challan).eq('batch_code', cur[0].batch_code);
        throw updErr;
      }

      const rest: SizeMap = {};
      Object.keys(avail).forEach(sz => { rest[sz] = avail[sz] - by[sz]; });
      try { await saveSizeUpdates({ [cur[0].batch_code]: rest }); } catch { notify('Size விவரம் சேமிக்க முடியவில்லை (Pcs சரியாக நகர்ந்துள்ளது).', 'warn'); }

      logAction(`Showroom Transfer ${challan}: ${pcs} pcs (${fmtSizes(by)}) → ${targetShowroom}`);
      notify(`✅ ${pcs} pcs → ${targetShowroom} Showroom (Challan ${challan})`);
      setTransferBy({}); setChallanNo(''); setSizeNote(''); setSelectedStockId('');
      await loadAll();
    } catch (err: any) {
      notify('Transfer தோல்வி: ' + errMsg(err), 'err');
    } finally {
      setTransferring(false);
    }
  };

  // ---------- showroom sale / return / damage ----------
  const adjSizes: SizeMap = (() => {
    const line = lines[Number(adjLine)];
    if (adjLine === '' || !line) return {};
    const out: SizeMap = {};
    sizeLines.filter(x => x.showroom === line.showroom && x.model === line.model && x.design === line.design && x.color === line.color && x.pcs > 0)
      .forEach(x => { out[x.size === '-' ? NO_SIZE : x.size] = x.pcs; });
    return out;
  })();
  const adjLineInfo = (() => { const l = lines[Number(adjLine)]; return l ? dm(l.model, l.design) : undefined; })();

  const handleAdjust = async (e: FormEvent) => {
    e.preventDefault();
    const line = lines[Number(adjLine)];
    if (adjLine === '' || !line) return notify('Showroom Stock வரி தேர்வு செய்யவும்.', 'err');
    const by: SizeMap = {};
    for (const sz of Object.keys(adjSizes)) {
      by[sz] = Math.max(0, Math.floor(num(adjBy[sz])));
      if (by[sz] > adjSizes[sz]) return notify(`Size ${sz}: ${line.showroom}-ல் ${adjSizes[sz]} Pcs மட்டுமே உள்ளது.`, 'err');
    }
    const pcs = sumSizes(by);
    if (pcs <= 0) return notify('குறைந்தது ஒரு Size-ல் Pieces உள்ளிடவும்.', 'err');
    if (pcs > line.pcs) return notify(`${line.showroom}-ல் இந்த Item ${line.pcs} Pcs மட்டுமே உள்ளது.`, 'err');

    setAdjusting(true);
    try {
      const status = adjType === 'SALE' ? 'Showroom Sale' : adjType === 'RETURN' ? 'Returned to Godown' : 'Showroom Damage';
      const ref = `${adjType === 'SALE' ? 'SAL' : adjType === 'RETURN' ? 'RTN' : 'DMG'}-${rnd()}`;
      const used = Object.keys(by).filter(sz => by[sz] > 0);
      const rows = used.map(sz => ({
        challan_no: ref, transfer_date: todayStr(), showroom_name: line.showroom, batch_code: ref,
        design_no: line.design, color: line.color, model_name: line.model,
        size_details: sz === NO_SIZE ? status : `${status} | Size ${sz}`,
        transferred_pieces: -by[sz], status
      }));
      const { error: insErr } = await supabase.from('pommys_showroom_transfers').insert(rows);
      if (insErr) throw insErr;

      if (adjType === 'RETURN') {
        const { error } = await supabase.from('pommys_ready_stock').insert([{ batch_code: ref, model_name: line.model, design_no: line.design, color: line.color, ready_pieces: pcs }]);
        if (error) throw error;
        const back: SizeMap = {}; used.forEach(sz => { back[sz] = by[sz]; });
        try { await saveSizeUpdates({ [ref]: back }); } catch { /* optional */ }
      }
      if (adjType === 'DAMAGE') {
        const { error } = await supabase.from('pommys_exceptions_stock').insert([{
          stock_type: 'DAMAGE', ref_code: ref, model_or_item: line.model, color: line.color, qty: pcs, unit: 'Pcs', remarks: `Showroom Damage (${line.showroom}) ${fmtSizes(by)}`.trim()
        }]);
        if (error) throw error;
      }
      if (adjType === 'SALE') {
        let total = 0;
        const slipRows = used.map(sz => {
          const r = rateFor(adjLineInfo, sz);
          total += r.price * by[sz];
          return [sz, by[sz], r.price || '-', r.mrp || '-', r.price ? r.price * by[sz] : '-'];
        });
        setLastSale({ title: `Sale ${ref}`, subtitle: `${line.showroom} • ${line.model} ${line.design !== '-' ? line.design : ''} ${line.color !== '-' ? '(' + line.color + ')' : ''}`, headers: ['Size', 'Qty', 'Rate ₹', 'MRP ₹', 'Amount ₹'], rows: slipRows, footer: [`மொத்தம்: ${pcs} Pcs • ₹${total}`] });
      }
      logAction(`${status} ${ref}: ${line.showroom} ${pcs} pcs (${fmtSizes(by)})`);
      notify(`✅ ${line.showroom}: ${pcs} pcs ${status}`);
      setAdjBy({}); setAdjLine('');
      await loadAll();
    } catch (err: any) {
      notify('Save தோல்வி: ' + errMsg(err), 'err');
    } finally {
      setAdjusting(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {error && <ErrorBanner message={error} onRetry={loadAll} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
        <StatCard label="CENTRAL GODOWN READY STOCK" value={`${totalGodownPcs} Pcs`} color="#059669" />
        <StatCard label="TOTAL RETAIL SHOWROOM STOCK" value={`${totalShowroomPcs} Pcs`} color="#2563eb" />
        <StatCard label="REGISTERED SHOWROOMS" value={showrooms.length} color="#7c3aed" />
      </div>

      <div style={styles.card}>
        <h4 style={{ margin: '0 0 12px 0', color: '#0f172a' }}>🏪 1. Add Retail Showroom</h4>
        <form onSubmit={handleAddShowroom} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <div><label style={styles.label}>Showroom Name *</label><input type="text" placeholder="Showroom Name" value={newName} onChange={e => setNewName(e.target.value)} style={styles.input} /></div>
          <div><label style={styles.label}>Full Address</label><input type="text" placeholder="Door No, Street, Area, City, Pincode" value={newAddress} onChange={e => setNewAddress(e.target.value)} style={styles.input} /></div>
          <div><label style={styles.label}>Phone (Optional)</label><input type="text" placeholder="Mobile / Landline" value={newPhone} onChange={e => setNewPhone(e.target.value)} style={styles.input} /></div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" disabled={addingShowroom} style={{ ...styles.successBtn, width: '100%' }}>{addingShowroom ? 'Saving...' : '+ Add Showroom'}</button>
          </div>
        </form>
      </div>

      <div style={styles.card}>
        <h4 style={{ margin: '0 0 14px 0', color: '#0f172a' }}>🚚 2. Transfer Ready Goods → Showroom</h4>
        {showrooms.length === 0 ? (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '12px', borderRadius: '8px', fontSize: '13px' }}>
            முதலில் மேலே <strong>Add Retail Showroom</strong> பகுதியில் Showroom சேர்க்கவும்.
          </div>
        ) : (
          <form onSubmit={handleTransfer} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '12px' }}>
            <div>
              <label style={styles.label}>Target Showroom *</label>
              <select value={targetShowroom} onChange={e => setTargetShowroom(e.target.value)} style={styles.input}>
                {showrooms.map((sr, i) => <option key={sr.id ?? i} value={sr.showroom_name}>{sr.showroom_name}{sr.address ? ` — ${sr.address}` : ''}</option>)}
              </select>
            </div>
            <div>
              <label style={styles.label}>Ready Stock Batch *</label>
              <select value={selectedStockId} onChange={e => { setSelectedStockId(e.target.value); setTransferBy({}); }} style={styles.input}>
                <option value="">-- Choose Batch --</option>
                {readyList.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.model_name}{r.design_no && r.design_no !== '-' ? ` | ${r.design_no}` : ''}{r.color && r.color !== '-' ? ` (${r.color})` : ''} — {r.ready_pieces} Pcs [{r.batch_code}]
                  </option>
                ))}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={styles.label}>Transfer Pieces * (Size வாரியாக — தேவையான Size-ல் மட்டும் உள்ளிடவும்)</label>
              {selectedStock ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <SizeQty avail={godownSizes(selectedStock)} value={transferBy} onChange={setTransferBy} placeholder="0" />
                  <button type="button" onClick={() => { const a = godownSizes(selectedStock); setTransferBy(Object.fromEntries(Object.entries(a).map(([k, v]) => [k, String(v)]))); }} style={{ ...styles.secondaryBtn, padding: '6px 12px' }}>All</button>
                  <span style={{ fontSize: '12px', color: '#475569' }}>மொத்தம்: <b>{sumSizes(Object.fromEntries(Object.entries(transferBy).map(([k, v]) => [k, Math.floor(num(v))])))}</b> / {selectedStock.ready_pieces}</span>
                </div>
              ) : <div style={{ fontSize: '12px', color: '#64748b' }}>முதலில் Batch தேர்வு செய்யவும்.</div>}
            </div>
            <div><label style={styles.label}>Size / Note (Optional)</label><input type="text" placeholder="Optional" value={sizeNote} onChange={e => setSizeNote(e.target.value)} style={styles.input} /></div>
            <div><label style={styles.label}>Challan No. (Optional)</label><input type="text" placeholder="Auto if blank" value={challanNo} onChange={e => setChallanNo(e.target.value)} style={styles.input} /></div>
            <div><label style={styles.label}>Transfer Date</label><input type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} style={styles.input} /></div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="submit" disabled={transferring} style={{ ...styles.primaryBtn, width: '100%' }}>{transferring ? 'Transferring...' : '🚚 Transfer Stock'}</button>
            </div>
          </form>
        )}
      </div>

      <div style={styles.card}>
        <h4 style={{ margin: '0 0 6px 0', color: '#0f172a' }}>🛒 3. Showroom Sale / Return / Damage</h4>
        <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>Showroom-ல் விற்றது, Godown-க்குத் திரும்பியது அல்லது Damage ஆனதைப் பதிவு செய்தால் Showroom Stock சரியாகக் குறையும்.</p>
        {lines.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: '13px' }}>Showroom-ல் Stock எதுவும் இல்லை.</p>
        ) : (
          <form onSubmit={handleAdjust} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '12px', alignItems: 'end' }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={styles.label}>Showroom Stock *</label>
              <select value={adjLine} onChange={e => { setAdjLine(e.target.value); setAdjBy({}); }} style={styles.input}>
                <option value="">-- Select Showroom / Item --</option>
                {lines.map((l, i) => (
                  <option key={i} value={i}>{l.showroom} | {l.model}{l.design !== '-' ? ` | ${l.design}` : ''}{l.color !== '-' ? ` (${l.color})` : ''} — {l.pcs} Pcs</option>
                ))}
              </select>
            </div>
            <div>
              <label style={styles.label}>Type</label>
              <select value={adjType} onChange={e => setAdjType(e.target.value as any)} style={styles.input}>
                <option value="SALE">🛒 Sold (விற்பனை)</option>
                <option value="RETURN">↩️ Return to Godown</option>
                <option value="DAMAGE">⚠️ Damage</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={styles.label}>Pieces * (Size வாரியாக)</label>
              {Object.keys(adjSizes).length === 0 ? <div style={{ fontSize: '12px', color: '#64748b' }}>முதலில் Showroom Stock வரி தேர்வு செய்யவும்.</div> : (
                <div>
                  <SizeQty avail={adjSizes} value={adjBy} onChange={setAdjBy} placeholder="0" />
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '6px', fontSize: '12px', color: '#475569' }}>
                    {Object.keys(adjSizes).map(sz => { const r = rateFor(adjLineInfo, sz); return <span key={sz}>{sz}: Rate {r.price ? `₹${r.price}` : '-'} • MRP {r.mrp ? `₹${r.mrp}` : '-'}</span>; })}
                  </div>
                </div>
              )}
            </div>
            <button type="submit" disabled={adjusting} style={{ ...styles.primaryBtn, background: '#7c3aed' }}>{adjusting ? 'Saving...' : 'Save'}</button>
          </form>
        )}
      </div>

      {lastSale && (
        <div style={{ ...styles.card, borderLeft: '4px solid #7c3aed' }}>
          <b>🧾 {lastSale.title}</b> <span style={{ color: '#64748b', fontSize: '12px' }}>{lastSale.subtitle}</span>
          <div style={{ margin: '6px 0' }}>{lastSale.footer[0]}</div>
          <ShareBar doc={lastSale} />
        </div>
      )}

      <BusyImport showrooms={showrooms.map(s => String(s.showroom_name).trim()).filter(Boolean)} onDone={loadAll} />

      <div style={styles.card}>
        <h4 style={{ margin: '0 0 14px 0', color: '#0f172a' }}>🏬 Showroom-Wise Stock</h4>
        {showrooms.length === 0 ? <p style={{ color: '#64748b', fontSize: '13px' }}>No showrooms added yet.</p> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '12px' }}>
            {showrooms.map((sr, idx) => {
              const own = lines.filter(l => l.showroom.toLowerCase() === String(sr.showroom_name).trim().toLowerCase());
              const total = own.reduce((s, l) => s + l.pcs, 0);
              return (
                <div key={idx} style={{ border: '1px solid #cbd5e1', borderRadius: '10px', padding: '14px', background: total > 0 ? '#f0f9ff' : '#f8fafc' }}>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a' }}>{sr.showroom_name}</div>
                  {sr.address && <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>{sr.address}</div>}
                  {sr.phone && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Ph: {sr.phone}</div>}
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0369a1', marginTop: '8px' }}>{total} Pcs</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{own.length} Variety</div>
                  <div style={{ marginTop: '8px' }}>
                    <ShareBar phone={sr.phone} doc={{ title: `Showroom Stock — ${sr.showroom_name}`, headers: ['Model', 'Design', 'Color', 'Pcs'], rows: own.filter(l => l.pcs !== 0).map(l => [l.model, l.design, l.color, l.pcs]), footer: [`மொத்தம்: ${total} Pcs`] }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
          <h4 style={{ margin: 0, color: '#0f172a' }}>👕 Central Godown Ready Stock</h4>
          <input type="text" placeholder="🔍 Local Name / Batch / Model / Design..." value={rq} onChange={e => setRq(e.target.value)} style={{ ...styles.input, maxWidth: '260px' }} />
          <ShareBar doc={{ title: 'Godown Ready Stock', headers: ['Batch', 'Local Name', 'Design', 'Model', 'Material', 'Fit', 'Size', 'Color', 'Price', 'MRP', 'Pcs'], rows: readyShown.flatMap((r: any) => { const m = godownSizes(r); const ks = Object.keys(m).length ? Object.keys(m).sort(sortSizes) : [NO_SIZE]; return ks.map(k => { const rt = rateFor(infoOf(r), k); return [r.batch_code, nameFor(names, r.batch_code) || '-', designOf(r), r.model_name, infoOf(r)?.material || '-', infoOf(r)?.fit || '-', k, colorOf(r), rt.price ? `₹${rt.price}` : '-', rt.mrp ? `₹${rt.mrp}` : '-', Object.keys(m).length ? m[k] : r.ready_pieces]; }); }), footer: [`மொத்தம்: ${readyList.reduce((a: number, r: any) => a + num(r.ready_pieces), 0)} Pcs`] }} />
          <label style={{ background: '#fdf4ff', color: '#a21caf', border: '1px solid #e9a8f5', padding: '7px 12px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>
            {uploadingKey === '__bulk__' ? 'ஏற்றுகிறது...' : '📷 பல Photo ஒரே நேரத்தில் (File பெயர் = Design எண்)'}
            <input type="file" accept="image/*" multiple disabled={uploadingKey === '__bulk__'} style={{ display: 'none' }} onChange={e => { handleBulkPhotos(e.target.files); e.target.value = ''; }} />
          </label>
        </div>
        <TableWrap minWidth={1200}>
          <thead>
            <tr style={{ background: '#0f172a', color: 'white' }}>
              <th style={styles.thSub}>Photo</th>
              <th style={styles.thSub}>Batch Code</th>
              <th style={styles.thSub}>Local Name</th>
              <th style={styles.thSub}>Design No</th>
              <th style={styles.thSub}>Model</th>
              <th style={styles.thSub}>Material</th>
              <th style={styles.thSub}>Fit</th>
              <th style={styles.thSub}>Size</th>
              <th style={styles.thSub}>Color</th>
              <th style={styles.thSub}>Price</th>
              <th style={styles.thSub}>MRP</th>
              <th style={styles.thSub}>Godown Pcs</th>
              {canDelete && user && <th style={{ ...styles.thSub, width: '170px', textAlign: 'center' }}>Action</th>}
            </tr>
          </thead>
          <tbody>
            {readyShown.length === 0 ? <EmptyRow cols={canDelete && user ? 13 : 12} text={readyList.length ? 'தேடலுக்கு பொருந்தும் வரி இல்லை.' : 'Central Godown-ல் Ready Stock இல்லை.'} /> : readyShown.flatMap((r, idx) => { const szMap = godownSizes(r); const szKeys = Object.keys(szMap).length ? Object.keys(szMap).sort(sortSizes) : [NO_SIZE]; return szKeys.map(sk => { const rt = rateFor(infoOf(r), sk); const qtyHere = Object.keys(szMap).length ? szMap[sk] : r.ready_pieces; return (
              <tr key={`${r.id ?? idx}-${sk}`} data-size={sk} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={styles.td}>
                  {(() => {
                    const img = photoOf(r.model_name, designOf(r), colorOf(r)) || infoOf(r)?.photos?.find(Boolean) || '';
                    const busy = uploadingKey === `${r.model_name}|${designOf(r)}`;
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {img ? <img src={img} alt="" loading="lazy" style={{ width: 38, height: 38, objectFit: 'cover', borderRadius: 6, border: '1px solid #cbd5e1' }} /> : null}
                        <label style={{ ...styles.secondaryBtn, padding: '5px 8px', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          {busy ? '...' : img ? '🔄' : '📷 Photo'}
                          <input type="file" accept="image/*" disabled={busy} onChange={e => { handlePhoto(r, e.target.files && e.target.files[0] ? e.target.files[0] : null); e.target.value = ''; }} style={{ display: 'none' }} />
                        </label>
                        <button type="button" title="4 Photo + Colour Squares" onClick={() => setGallery({ model: r.model_name, design: designOf(r) })} style={{ ...styles.secondaryBtn, padding: '5px 8px', fontSize: '11px' }}>🖼️</button>
                      </div>
                    );
                  })()}
                </td>
                <td style={styles.td}><strong>{r.batch_code}</strong></td>
                <td style={styles.td}>
                  <LocalNameEdit code={r.batch_code} name={nameFor(names, r.batch_code)} options={uniqueNames(names)} onSaved={n => setNames(p => ({ ...p, [r.batch_code]: n }))} />
                </td>
                <td style={styles.td}>{designOf(r)}</td>
                <td style={styles.td}>{r.model_name}</td>
                <td style={styles.td}>{infoOf(r)?.material || '-'}</td>
                <td style={styles.td}>{infoOf(r)?.fit || '-'}</td>
                <td style={{ ...styles.td, fontWeight: 'bold' }}>{sk === NO_SIZE ? '—' : sk}</td>
                <td style={styles.td}>{colorOf(r)}<SwatchChips swatches={infoOf(r)?.swatches} /></td>
                <td style={styles.td}>{rt.price ? `₹${rt.price}` : '-'}</td>
                <td style={styles.td}>{rt.mrp ? `₹${rt.mrp}` : '-'}</td>
                <td style={{ ...styles.td, color: '#059669', fontWeight: 'bold' }}>{qtyHere}</td>
                {canDelete && user && (
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                      <button type="button" onClick={() => setEditRow({ r, size: sk })} style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #7dd3fc', padding: '5px 9px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>✏️ Edit</button>
                      <button type="button" onClick={() => delSize(r, sk, szMap)} style={styles.dangerBtn}>🗑️ Delete</button>
                    </div>
                  </td>
                )}
              </tr>
            ); }); })}
          </tbody>
        </TableWrap>
      </div>

      {editRow && user && <ReadyEdit user={user} row={editRow.r} name={nameFor(names, editRow.r.batch_code)} info={infoOf(editRow.r)} sizes={(() => { const m = godownSizes(editRow.r); return Object.keys(m).length ? m : {}; })()} focusSize={editRow.size} nameOptions={uniqueNames(names)} onClose={() => setEditRow(null)} onDone={loadAll} />}

      <div style={styles.card}>
        <h4 style={{ margin: '0 0 14px 0', color: '#0f172a' }}>📄 Showroom Transfer, Sale & Opening Log</h4>
        <TableWrap minWidth={720}>
          <thead>
            <tr style={{ background: '#1e293b', color: 'white' }}>
              <th style={styles.thSub}>Challan / Ref</th>
              <th style={styles.thSub}>Date</th>
              <th style={styles.thSub}>Showroom</th>
              <th style={styles.thSub}>Model</th>
              <th style={styles.thSub}>Design / Color</th>
              <th style={styles.thSub}>Type</th>
              <th style={styles.thSub}>Pcs</th>
              <th style={styles.thSub}>Challan</th>
              {user && <th style={styles.thSub}>Action</th>}
            </tr>
          </thead>
          <tbody>
            {transfers.length === 0 ? <EmptyRow cols={user ? 9 : 8} text="Showroom Stock பதிவுகள் இல்லை." /> : transfers.slice(0, 300).map((t, idx) => (
              <tr key={t.id ?? idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={styles.td}><strong>{t.challan_no}</strong></td>
                <td style={styles.td}>{t.transfer_date || '-'}</td>
                <td style={{ ...styles.td, fontWeight: 'bold', color: '#0369a1' }}>{t.showroom_name}</td>
                <td style={styles.td}>{t.model_name}</td>
                <td style={styles.td}>{t.design_no || '-'}{t.color && t.color !== '-' ? ` (${t.color})` : ''}</td>
                <td style={styles.td}>{t.status || '-'}{sizeOfRow(t) !== '-' ? ` • ${sizeOfRow(t)}` : ''}</td>
                <td style={{ ...styles.td, fontWeight: 'bold', color: num(t.transferred_pieces) < 0 ? '#dc2626' : '#059669' }}>{t.transferred_pieces}</td>
                <td style={styles.td}>
                  {(() => {
                    const same = transfers.filter(x => x.challan_no === t.challan_no);
                    const doc = { title: `Challan ${t.challan_no}`, subtitle: `${t.showroom_name} • ${t.transfer_date || ''}`, headers: ['Batch', 'Model', 'Design', 'Color', 'Pcs'], rows: same.map(x => [x.batch_code || '-', x.model_name, x.design_no || '-', x.color || '-', x.transferred_pieces]), footer: [`மொத்தம்: ${same.reduce((a, x) => a + num(x.transferred_pieces), 0)} Pcs`] };
                    const ph = (showrooms.find(sr => String(sr.showroom_name).trim().toLowerCase() === String(t.showroom_name).trim().toLowerCase()) || {}).phone;
                    return (<div style={{ display: 'flex', gap: '4px' }}>
                      <button type="button" title="Challan Print" onClick={() => printDoc(doc)} style={{ background: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '3px 7px' }}>🖨️</button>
                      <button type="button" title="Challan WhatsApp" onClick={() => openWhatsApp(docToText(doc), ph)} style={{ background: '#dcfce7', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '3px 7px' }}>📲</button>
                    </div>);
                  })()}
                </td>
                {user && <td style={styles.td}><RowActions user={user} table="pommys_showroom_transfers" row={t} label={`Showroom ${t.challan_no} ${t.model_name}`} fields={['showroom_name', 'design_no', 'color', 'model_name', 'size_details', 'transferred_pieces']} onDone={loadAll} /></td>}
              </tr>
            ))}
          </tbody>
        </TableWrap>
        {transfers.length > 300 && <p style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>சமீபத்திய 300 பதிவுகள் மட்டும் காட்டப்படுகின்றன. முழு விவரம்: Reports → Godown & Showroom → Export.</p>}
      </div>
      {gallery && <GalleryEditor model={gallery.model} design={gallery.design} onClose={() => setGallery(null)} onSaved={loadAll} />}
    </div>
  );
}
