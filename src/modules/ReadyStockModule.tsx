import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase, fetchAll, errMsg } from '../lib/supabase';
import type { ShowroomRecord } from '../lib/constants';
import { computeShowroomLines, num, todayStr } from '../lib/helpers';
import BusyImport from './BusyImport';
import { matchPhotosByName, uploadCatalogPhoto } from '../lib/image';
import { loadBatchMeta, loadModelPhotos } from '../lib/batchMeta';
import { EmptyRow, ErrorBanner, Loading, StatCard, TableWrap, notify, styles } from '../components/ui';

const rnd = () => Math.floor(1000 + Math.random() * 9000);

export default function ReadyStockModule({ canDelete }: { canDelete: boolean }) {
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
  const [transferQty, setTransferQty] = useState('');
  const [sizeNote, setSizeNote] = useState('');
  const [transferring, setTransferring] = useState(false);

  // showroom sale / return / damage
  const [adjLine, setAdjLine] = useState('');
  const [adjType, setAdjType] = useState<'SALE' | 'RETURN' | 'DAMAGE'>('SALE');
  const [adjQty, setAdjQty] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  const [deletingId, setDeletingId] = useState<any>(null);
  const [meta, setMeta] = useState<Record<string, { design: string; color: string }>>({});
  const [photoOf, setPhotoOf] = useState<(m: string, d: string, c: string) => string>(() => () => '');
  const [uploadingKey, setUploadingKey] = useState('');

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

  const lines = computeShowroomLines(transfers).filter(l => l.pcs !== 0);
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

  const handleTransfer = async (e: FormEvent) => {
    e.preventDefault();
    if (!targetShowroom) return notify('முதலில் Showroom சேர்க்கவும் / தேர்வு செய்யவும்.', 'err');
    if (!selectedStock) return notify('Ready Stock Batch தேர்வு செய்யவும்.', 'err');
    const pcs = Math.floor(num(transferQty));
    if (pcs <= 0) return notify('Transfer Pieces உள்ளிடவும்.', 'err');

    setTransferring(true);
    let challan = '';
    try {
      // fresh godown count
      const { data: cur, error: curErr } = await supabase.from('pommys_ready_stock').select('*').eq('id', selectedStock.id).limit(1);
      if (curErr || !cur || !cur[0]) throw curErr || new Error('Batch கிடைக்கவில்லை.');
      const available = num(cur[0].ready_pieces);
      if (pcs > available) throw new Error(`Godown-ல் ${available} Pcs மட்டுமே உள்ளது.`);

      challan = challanNo.trim() || `TRF-${new Date().getFullYear()}-${rnd()}`;
      const { error: insErr } = await supabase.from('pommys_showroom_transfers').insert([{
        challan_no: challan, transfer_date: transferDate || todayStr(), showroom_name: targetShowroom,
        batch_code: cur[0].batch_code, design_no: cur[0].design_no || '-', color: cur[0].color || '-',
        model_name: cur[0].model_name || '-', size_details: sizeNote.trim() || '-',
        transferred_pieces: pcs, status: 'Transferred to Showroom'
      }]);
      if (insErr) throw insErr;

      const { error: updErr } = await supabase.from('pommys_ready_stock').update({ ready_pieces: available - pcs }).eq('id', cur[0].id);
      if (updErr) {
        await supabase.from('pommys_showroom_transfers').delete().eq('challan_no', challan).eq('batch_code', cur[0].batch_code);
        throw updErr;
      }

      notify(`✅ ${pcs} pcs → ${targetShowroom} Showroom (Challan ${challan})`);
      setTransferQty(''); setChallanNo(''); setSizeNote(''); setSelectedStockId('');
      await loadAll();
    } catch (err: any) {
      notify('Transfer தோல்வி: ' + errMsg(err), 'err');
    } finally {
      setTransferring(false);
    }
  };

  // ---------- showroom sale / return / damage ----------
  const handleAdjust = async (e: FormEvent) => {
    e.preventDefault();
    const line = lines[Number(adjLine)];
    if (adjLine === '' || !line) return notify('Showroom Stock வரி தேர்வு செய்யவும்.', 'err');
    const pcs = Math.floor(num(adjQty));
    if (pcs <= 0) return notify('Pieces உள்ளிடவும்.', 'err');
    if (pcs > line.pcs) return notify(`${line.showroom}-ல் இந்த Item ${line.pcs} Pcs மட்டுமே உள்ளது.`, 'err');

    setAdjusting(true);
    try {
      const status = adjType === 'SALE' ? 'Showroom Sale' : adjType === 'RETURN' ? 'Returned to Godown' : 'Showroom Damage';
      const ref = `${adjType === 'SALE' ? 'SAL' : adjType === 'RETURN' ? 'RTN' : 'DMG'}-${rnd()}`;
      const { error: insErr } = await supabase.from('pommys_showroom_transfers').insert([{
        challan_no: ref, transfer_date: todayStr(), showroom_name: line.showroom, batch_code: ref,
        design_no: line.design, color: line.color, model_name: line.model, size_details: status,
        transferred_pieces: -pcs, status
      }]);
      if (insErr) throw insErr;

      if (adjType === 'RETURN') {
        const { error } = await supabase.from('pommys_ready_stock').insert([{ batch_code: ref, model_name: line.model, design_no: line.design, color: line.color, ready_pieces: pcs }]);
        if (error) throw error;
      }
      if (adjType === 'DAMAGE') {
        const { error } = await supabase.from('pommys_exceptions_stock').insert([{
          stock_type: 'DAMAGE', ref_code: ref, model_or_item: line.model, color: line.color, qty: pcs, unit: 'Pcs', remarks: `Showroom Damage (${line.showroom})`
        }]);
        if (error) throw error;
      }
      notify(`✅ ${line.showroom}: ${pcs} pcs ${status}`);
      setAdjQty(''); setAdjLine('');
      await loadAll();
    } catch (err: any) {
      notify('Save தோல்வி: ' + errMsg(err), 'err');
    } finally {
      setAdjusting(false);
    }
  };

  const handleDeleteReady = async (row: any) => {
    if (!window.confirm(`Delete batch "${row.batch_code}" (${row.ready_pieces} pcs) from Ready Stock?`)) return;
    setDeletingId(row.id);
    try {
      const { error: delErr } = await supabase.from('pommys_ready_stock').delete().eq('id', row.id);
      if (delErr) throw delErr;
      setReadyList(prev => prev.filter(item => item.id !== row.id));
    } catch (err: any) {
      notify('Delete தோல்வி: ' + errMsg(err), 'err');
    } finally {
      setDeletingId(null);
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
              <select value={selectedStockId} onChange={e => { setSelectedStockId(e.target.value); setTransferQty(''); }} style={styles.input}>
                <option value="">-- Choose Batch --</option>
                {readyList.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.model_name}{r.design_no && r.design_no !== '-' ? ` | ${r.design_no}` : ''}{r.color && r.color !== '-' ? ` (${r.color})` : ''} — {r.ready_pieces} Pcs [{r.batch_code}]
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={styles.label}>Transfer Pieces *</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input type="number" min="1" step="1" placeholder={selectedStock ? `Max ${selectedStock.ready_pieces}` : 'Pieces'} value={transferQty} onChange={e => setTransferQty(e.target.value)} style={styles.input} />
                {selectedStock && <button type="button" onClick={() => setTransferQty(String(selectedStock.ready_pieces))} style={{ ...styles.secondaryBtn, padding: '0 10px' }}>All</button>}
              </div>
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
              <select value={adjLine} onChange={e => setAdjLine(e.target.value)} style={styles.input}>
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
            <div><label style={styles.label}>Pieces *</label><input type="number" min="1" step="1" value={adjQty} onChange={e => setAdjQty(e.target.value)} style={styles.input} /></div>
            <button type="submit" disabled={adjusting} style={{ ...styles.primaryBtn, background: '#7c3aed' }}>{adjusting ? 'Saving...' : 'Save'}</button>
          </form>
        )}
      </div>

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
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
          <h4 style={{ margin: 0, color: '#0f172a' }}>👕 Central Godown Ready Stock</h4>
          <label style={{ background: '#fdf4ff', color: '#a21caf', border: '1px solid #e9a8f5', padding: '7px 12px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>
            {uploadingKey === '__bulk__' ? 'ஏற்றுகிறது...' : '📷 பல Photo ஒரே நேரத்தில் (File பெயர் = Design எண்)'}
            <input type="file" accept="image/*" multiple disabled={uploadingKey === '__bulk__'} style={{ display: 'none' }} onChange={e => { handleBulkPhotos(e.target.files); e.target.value = ''; }} />
          </label>
        </div>
        <TableWrap minWidth={720}>
          <thead>
            <tr style={{ background: '#0f172a', color: 'white' }}>
              <th style={styles.thSub}>Photo</th>
              <th style={styles.thSub}>Batch Code</th>
              <th style={styles.thSub}>Model</th>
              <th style={styles.thSub}>Design</th>
              <th style={styles.thSub}>Color</th>
              <th style={styles.thSub}>Godown Pcs</th>
              {canDelete && <th style={{ ...styles.thSub, width: '110px', textAlign: 'center' }}>Action</th>}
            </tr>
          </thead>
          <tbody>
            {readyList.length === 0 ? <EmptyRow cols={canDelete ? 7 : 6} text="Central Godown-ல் Ready Stock இல்லை." /> : readyList.map((r, idx) => (
              <tr key={r.id ?? idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={styles.td}>
                  {(() => {
                    const img = photoOf(r.model_name, designOf(r), colorOf(r));
                    const busy = uploadingKey === `${r.model_name}|${designOf(r)}`;
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {img ? <img src={img} alt="" loading="lazy" style={{ width: 38, height: 38, objectFit: 'cover', borderRadius: 6, border: '1px solid #cbd5e1' }} /> : null}
                        <label style={{ ...styles.secondaryBtn, padding: '5px 8px', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          {busy ? '...' : img ? '🔄' : '📷 Photo'}
                          <input type="file" accept="image/*" disabled={busy} onChange={e => { handlePhoto(r, e.target.files && e.target.files[0] ? e.target.files[0] : null); e.target.value = ''; }} style={{ display: 'none' }} />
                        </label>
                      </div>
                    );
                  })()}
                </td>
                <td style={styles.td}><strong>{r.batch_code}</strong></td>
                <td style={styles.td}>{r.model_name}</td>
                <td style={styles.td}>{designOf(r)}</td>
                <td style={styles.td}>{colorOf(r)}</td>
                <td style={{ ...styles.td, color: '#059669', fontWeight: 'bold' }}>{r.ready_pieces}</td>
                {canDelete && (
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    <button type="button" onClick={() => handleDeleteReady(r)} disabled={deletingId === r.id} style={styles.dangerBtn}>{deletingId === r.id ? '...' : '🗑️ Delete'}</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </div>

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
            </tr>
          </thead>
          <tbody>
            {transfers.length === 0 ? <EmptyRow cols={7} text="Showroom Stock பதிவுகள் இல்லை." /> : transfers.slice(0, 300).map((t, idx) => (
              <tr key={t.id ?? idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={styles.td}><strong>{t.challan_no}</strong></td>
                <td style={styles.td}>{t.transfer_date || '-'}</td>
                <td style={{ ...styles.td, fontWeight: 'bold', color: '#0369a1' }}>{t.showroom_name}</td>
                <td style={styles.td}>{t.model_name}</td>
                <td style={styles.td}>{t.design_no || '-'}{t.color && t.color !== '-' ? ` (${t.color})` : ''}</td>
                <td style={styles.td}>{t.status || t.size_details || '-'}</td>
                <td style={{ ...styles.td, fontWeight: 'bold', color: num(t.transferred_pieces) < 0 ? '#dc2626' : '#059669' }}>{t.transferred_pieces}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        {transfers.length > 300 && <p style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>சமீபத்திய 300 பதிவுகள் மட்டும் காட்டப்படுகின்றன. முழு விவரம்: Reports → Godown & Showroom → Export.</p>}
      </div>
    </div>
  );
}
