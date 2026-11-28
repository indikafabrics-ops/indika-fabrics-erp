import { useCallback, useEffect, useState } from 'react';
import { supabase, fetchAll, errMsg } from '../lib/supabase';
import { useMasters } from '../lib/useMasters';
import { num, r3 } from '../lib/helpers';
import { SelectNew, notify, styles } from '../components/ui';
import PhotoPick from '../components/PhotoPick';
import { PhotoSlots, SwatchSlots } from '../components/GallerySlots';
import { emptyPhotoSlot, emptySwatchSlot, resolvePhotoSlots, resolveSwatchSlots, type PhotoSlot, type SwatchSlot } from '../lib/gallery';
import { uploadPhoto } from '../lib/image';
import { saveDesignInfo } from '../lib/masterStore';
import { logAction } from '../lib/audit';
import ShareBar from '../components/ShareBar';
import type { ShareDoc } from '../lib/share';
import { saveBatchNames } from '../lib/batchNames';

async function makeNextBatchCode(): Promise<string> {
  const yy = String(new Date().getFullYear());
  try {
    const rows = await fetchAll('pommys_cutting_batches', 'batch_code', q => q.like('batch_code', `CUT-${yy}-%`), 'batch_code');
    let max = 0;
    rows.forEach((r: any) => {
      const m = String(r.batch_code).match(/^CUT-\d{4}-(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return `CUT-${yy}-${String(max + 1).padStart(3, '0')}`;
  } catch {
    return `CUT-${yy}-${Math.floor(1000 + Math.random() * 9000)}`;
  }
}

const emptyFabricRow = () => ({ stockId: '', issueMeters: '', photoFile: null as File | null });
const emptySizeRow = () => ({ size: '', pieces: '', consumption: '', price: '', mrp: '' });

export default function CuttingModule() {
  const masters = useMasters();
  const [stockList, setStockList] = useState<any[]>([]);
  const [fabricRows, setFabricRows] = useState<any[]>([emptyFabricRow()]);
  const [batchCode, setBatchCode] = useState('');
  const [model, setModel] = useState('');
  const [sizes, setSizes] = useState<any[]>([emptySizeRow()]);
  const [endBits, setEndBits] = useState('');
  const [photoSlots, setPhotoSlots] = useState<PhotoSlot[]>([emptyPhotoSlot()]);
  const [swatchSlots, setSwatchSlots] = useState<SwatchSlot[]>([emptySwatchSlot()]);
  const [numColors, setNumColors] = useState('');
  const [localName, setLocalName] = useState('');
  const [lastSlip, setLastSlip] = useState<ShareDoc | null>(null);
  const [fit, setFit] = useState('');
  const [material, setMaterial] = useState('');
  const [price, setPrice] = useState('');
  const [mrpAll, setMrpAll] = useState('');
  const [yieldInfo, setYieldInfo] = useState<{ batches: number; pcsPer100: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const fetchLiveStock = useCallback(async () => {
    try {
      const rows = await fetchAll('pommys_fabric_stock', '*', q => q.gt('available_meters', 0.01));
      setStockList(rows);
    } catch (err: any) {
      notify('Fabric Stock load தோல்வி: ' + errMsg(err), 'err');
    }
  }, []);

  useEffect(() => {
    fetchLiveStock();
    makeNextBatchCode().then(setBatchCode);
  }, [fetchLiveStock]);

  useEffect(() => {
    const m = model.trim();
    if (!m) { setYieldInfo(null); return; }
    let live = true;
    (async () => {
      try {
        const rows = await fetchAll('pommys_cutting_batches', 'batch_code,selected_fabrics_json,total_pieces', q => q.eq('product_model', m), 'batch_code');
        let meters = 0, pcs = 0, n = 0;
        rows.forEach((c: any) => {
          const mt = (Array.isArray(c.selected_fabrics_json) ? c.selected_fabrics_json : []).reduce((a: number, f: any) => a + num(f && f.issueMeters), 0);
          if (mt > 0 && num(c.total_pieces) > 0) { meters += mt; pcs += num(c.total_pieces); n++; }
        });
        if (live) setYieldInfo(n > 0 ? { batches: n, pcsPer100: (pcs / meters) * 100 } : null);
      } catch { if (live) setYieldInfo(null); }
    })();
    return () => { live = false; };
  }, [model]);

  const stockById = (id: string) => stockList.find(s => String(s.id) === String(id));

  const updateFabric = (idx: number, patch: any) =>
    setFabricRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const updateSize = (idx: number, patch: any) =>
    setSizes(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const totalIssued = fabricRows.reduce((s, r) => s + (r.stockId ? num(r.issueMeters) : 0), 0);
  const totalPieces = sizes.reduce((s, r) => s + num(r.pieces), 0);
  const allHaveConsumption = sizes.filter(s => num(s.pieces) > 0).length > 0 && sizes.filter(s => num(s.pieces) > 0).every(s => num(s.consumption) > 0);
  const usedMeters = sizes.reduce((s, r) => s + num(r.pieces) * num(r.consumption), 0);
  const suggestedEndBit = allHaveConsumption ? Math.max(0, r3(totalIssued - usedMeters)) : 0;
  const isFabricSelected = fabricRows.some(f => f.stockId && num(f.issueMeters) > 0);

  const expectedPcs = yieldInfo && totalIssued > 0 ? Math.round((yieldInfo.pcsPer100 * totalIssued) / 100) : 0;

  const handleSave = async () => {
    const validFabrics = fabricRows.filter(f => f.stockId && num(f.issueMeters) > 0);
    if (validFabrics.length === 0) return notify('குறைந்தது ஒரு Fabric தேர்வு செய்து Issue Meters உள்ளிடவும்!', 'err');
    const finalModel = model.trim();
    if (!finalModel) return notify('Model Name தேர்வு செய்யவும்!', 'err');
    if (totalPieces <= 0) return notify('குறைந்தது ஒரு Size-ல் Pieces உள்ளிடவும்!', 'err');
    const endBitVal = num(endBits);
    if (endBitVal < 0) return notify('End Bits எதிர்மறையாக இருக்க முடியாது.', 'err');
    if (endBitVal > totalIssued) return notify('End Bits அளவு Issue செய்த Meters-ஐ விட அதிகம்.', 'err');
    if (sizes.some(s => num(s.pieces) < 0 || num(s.consumption) < 0)) return notify('Pieces / Consumption எதிர்மறையாக இருக்க முடியாது.', 'err');
    const usableSizes = sizes.filter(s => num(s.pieces) > 0).map(s => ({ size: s.size || 'Free', pieces: num(s.pieces), consumption: num(s.consumption), price: num(s.price), mrp: num(s.mrp) }));

    if (expectedPcs > 0 && totalPieces > expectedPcs * 1.3 && !window.confirm(`இந்த Model-ன் முந்தைய Cutting-படி ${totalIssued} M துணிக்கு சுமார் ${expectedPcs} Pcs தான் வரும்; நீங்கள் ${totalPieces} Pcs உள்ளிட்டுள்ளீர்கள். சரியா? தொடரவா?`)) return;

    setSaving(true);
    let createdBatch = false;
    let createdWip = false;
    const deducted: { id: any; prev: number }[] = [];
    let code = batchCode;
    try {
      // 1) Re-read fabric stock now (another user may have used it since this page opened)
      const ids = validFabrics.map(f => f.stockId);
      const { data: fresh, error: freshErr } = await supabase.from('pommys_fabric_stock').select('id,item_name,design_no,color,available_meters').in('id', ids);
      if (freshErr || !fresh) throw freshErr || new Error('Stock read தோல்வி');

      // photos first (nothing is written to the database yet, so a failure here is harmless)
      let photoWarn = '';
      let modelImageUrl = '';
      let photoUrls: string[] = [];
      let swatchList: any[] = [];
      try {
        const p = await resolvePhotoSlots(photoSlots);
        photoUrls = p.urls; modelImageUrl = p.urls.find(u => u) || '';
        if (p.failed) photoWarn = ` (${p.failed} Model Photo ஏறவில்லை)`;
        const sw = await resolveSwatchSlots(swatchSlots);
        swatchList = sw.swatches;
        if (sw.failed) photoWarn += ` (${sw.failed} Colour Photo ஏறவில்லை)`;
      } catch { photoWarn = ' (Photo ஏறவில்லை)'; }

      const colorsCount = Math.max(0, Math.floor(num(numColors))) || chosenColors.length;
      const fabricsJson: any[] = [];
      for (const f of validFabrics) {
        const s = fresh.find((x: any) => String(x.id) === String(f.stockId));
        if (!s) throw new Error('தேர்வு செய்த Fabric Stock கிடைக்கவில்லை. Page-ஐ Refresh செய்யவும்.');
        const issue = num(f.issueMeters);
        if (issue > num(s.available_meters) + 0.0001) {
          throw new Error(`${s.item_name} | ${s.design_no}: Available ${num(s.available_meters)} M மட்டுமே உள்ளது (நீங்கள் ${issue} M கேட்டீர்கள்).`);
        }
        let colorImageUrl = '';
        if (f.photoFile) {
          try { colorImageUrl = await uploadPhoto(f.photoFile, 'models'); } catch { if (!photoWarn) photoWarn = ' (Color Photo ஏறவில்லை)'; }
        }
        fabricsJson.push({
          stockId: s.id, issueMeters: issue, item_name: s.item_name, design_no: s.design_no || '-', color: s.color || '-',
          model_image: modelImageUrl, color_image: colorImageUrl, colors_count: colorsCount,
          fit: fit.trim(), material: (material.trim() || s.item_name || ''), price: num(price), mrp: num(mrpAll)
        });
      }

      // 2) Make sure batch code is still unique
      const { data: existing } = await supabase.from('pommys_cutting_batches').select('batch_code').eq('batch_code', code).limit(1);
      if (!code || (existing && existing.length > 0)) code = await makeNextBatchCode();

      // 3) Save batch + WIP first, deduct stock last (so a failure never loses fabric)
      const { error: batchErr } = await supabase.from('pommys_cutting_batches').insert([{
        batch_code: code, selected_fabrics_json: fabricsJson, product_model: finalModel,
        size_pieces_json: usableSizes, total_pieces: totalPieces, end_bit_meters: endBitVal
      }]);
      if (batchErr) throw batchErr;
      createdBatch = true;

      const { error: wipErr } = await supabase.from('pommys_production_wip').insert([{
        batch_code: code, model_name: finalModel, total_pieces: totalPieces, current_status: 'Cutting'
      }]);
      if (wipErr) throw wipErr;
      createdWip = true;

      for (const f of fabricsJson) {
        const s = fresh.find((x: any) => String(x.id) === String(f.stockId));
        const prev = num(s.available_meters);
        const { error: updErr } = await supabase.from('pommys_fabric_stock').update({ available_meters: r3(Math.max(0, prev - f.issueMeters)) }).eq('id', f.stockId);
        if (updErr) throw updErr;
        deducted.push({ id: f.stockId, prev });
      }

      let warn = photoWarn;
      logAction(`Cutting Batch ${code}: ${finalModel}, ${totalPieces} Pcs`);
      setLastSlip({ title: `Cutting Slip — ${code}`, subtitle: `${finalModel}${localName.trim() ? ' • ' + localName.trim() : ''}`, headers: ['Size', 'Pieces'], rows: usableSizes.map(u => [u.size, u.pieces]), footer: [`மொத்தம்: ${totalPieces} Pcs`, ...fabricsJson.map(f => `${f.item_name} ${f.design_no || ''} ${f.color || ''}: ${f.issueMeters} M`)] });
      try { if (localName.trim()) await saveBatchNames({ [code]: localName.trim() }); } catch { warn += ' (Local Name சேமிக்கப்படவில்லை)'; }
      // remember Material / Fit / Size / Price per design so every later screen can show them
      try {
        const sizeText = usableSizes.map(u => u.size).join(', ');
        const rates: Record<string, { price?: number; mrp?: number }> = {};
        usableSizes.forEach(u => { if (u.price > 0 || u.mrp > 0) rates[u.size] = { price: u.price || undefined, mrp: u.mrp || undefined }; });
        const seen = new Set<string>();
        const entries: any[] = [];
        fabricsJson.forEach(f => {
          const k = `${f.design_no}`;
          if (seen.has(k)) return; seen.add(k);
          entries.push({ model: finalModel, design: f.design_no, material: f.material, fit: f.fit, sizes: sizeText, price: f.price, mrp: f.mrp, rates, photos: photoUrls, swatches: swatchList });
        });
        await saveDesignInfo(entries);
      } catch { warn += ' (Fit/Material/Price விவரம் சேமிக்கப்படவில்லை)'; }
      if (endBitVal > 0) {
        const { error: exErr } = await supabase.from('pommys_exceptions_stock').insert([{
          stock_type: 'END_BIT', ref_code: code, model_or_item: finalModel, color: '-', qty: endBitVal, unit: 'Mtr', remarks: 'Cutting End Bit'
        }]);
        // the cutting batch row also holds the end bit, so reports still count it
        if (exErr) warn = ' (End Bit log பதிவு ஆகவில்லை — ஆனால் Batch-ல் சேமிக்கப்பட்டது)';
      }

      notify(`🎉 Batch ${code} சேமிக்கப்பட்டு WIP-க்கு அனுப்பப்பட்டது!${warn}`, warn ? 'warn' : 'ok');
      setFabricRows([emptyFabricRow()]);
      setModel('');
      setSizes([emptySizeRow()]);
      setEndBits('');
      setPhotoSlots([emptyPhotoSlot()]); setSwatchSlots([emptySwatchSlot()]);
      setNumColors('');
      setFit(''); setMaterial(''); setPrice(''); setMrpAll(''); setLocalName('');
      setFormKey(k => k + 1);
      setBatchCode(await makeNextBatchCode());
      await fetchLiveStock();
      masters.reload();
    } catch (err: any) {
      // roll back anything that was already written
      for (const d of deducted) await supabase.from('pommys_fabric_stock').update({ available_meters: d.prev }).eq('id', d.id);
      if (createdWip) await supabase.from('pommys_production_wip').delete().eq('batch_code', code);
      if (createdBatch) await supabase.from('pommys_cutting_batches').delete().eq('batch_code', code);
      notify('Batch Save தோல்வி (எதுவும் மாற்றப்படவில்லை): ' + errMsg(err), 'err');
      await fetchLiveStock();
    } finally {
      setSaving(false);
    }
  };

  const chosenColors = Array.from(new Set(fabricRows.map(f => stockById(f.stockId)).filter(Boolean).map((st: any) => String(st.color || '').trim()).filter(c => c && c !== '-')));
  const chosenIds = fabricRows.map(f => String(f.stockId)).filter(Boolean);

  return (
    <div style={styles.card} key={formKey}>
      {lastSlip && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', color: '#166534', fontWeight: 'bold' }}>✅ {lastSlip.title} — Slip தயார்</span>
          <div style={{ display: 'flex', gap: '8px' }}><ShareBar doc={lastSlip} /><button type="button" onClick={() => setLastSlip(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>✕</button></div>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #f1f5f9', paddingBottom: '10px', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
        <h3 style={{ margin: 0, color: '#0f172a', fontSize: '17px' }}>✂️ Fabric Issue & Cutting</h3>
        <div style={{ background: '#eff6ff', border: '1px solid #93c5fd', color: '#1d4ed8', padding: '7px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px' }}>
          Batch Code: {batchCode || '...'}
        </div>
      </div>

      <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
        <label style={styles.label}>1. Godown Fabric தேர்வு செய்யவும்:</label>
        {stockList.length === 0 && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '10px', borderRadius: '8px', fontSize: '13px', marginBottom: '10px' }}>
            Godown-ல் Fabric Stock இல்லை. முதலில் "Purchase & Opening Stock"-ல் Fabric சேர்க்கவும்.
          </div>
        )}
        {fabricRows.map((fab, idx) => {
          const s = stockById(fab.stockId);
          const over = s && num(fab.issueMeters) > num(s.available_meters) + 0.0001;
          return (
            <div key={idx} style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={fab.stockId} onChange={e => updateFabric(idx, { stockId: e.target.value, issueMeters: '' })} style={{ ...styles.input, flex: '2 1 240px' }}>
                <option value="">-- Select Fabric / Design --</option>
                {stockList.filter(st => String(st.id) === String(fab.stockId) || !chosenIds.includes(String(st.id))).map(stock => (
                  <option key={stock.id} value={stock.id}>
                    {stock.item_name || 'Fabric'} | Design: {stock.design_no || '-'}{stock.color && stock.color !== '-' ? ` (${stock.color})` : ''} — Avail: {r3(num(stock.available_meters))} M
                  </option>
                ))}
              </select>
              <input
                type="number" min="0" step="any" placeholder={s ? `Max ${r3(num(s.available_meters))} M` : 'Issue Meters'}
                value={fab.issueMeters} onChange={e => updateFabric(idx, { issueMeters: e.target.value })}
                style={{ ...styles.input, flex: '1 1 130px', borderColor: over ? '#ef4444' : '#cbd5e1', background: over ? '#fef2f2' : 'white' }}
                disabled={!fab.stockId}
              />
              {s && (
                <button type="button" onClick={() => updateFabric(idx, { issueMeters: String(r3(num(s.available_meters))) })} style={{ ...styles.secondaryBtn, padding: '8px 10px', fontSize: '12px' }}>All</button>
              )}
              {s && (
                <PhotoPick file={fab.photoFile} onChange={f => updateFabric(idx, { photoFile: f })} label="📷 Color Photo" size={40} />
              )}
              {idx > 0 && (
                <button type="button" onClick={() => setFabricRows(fabricRows.filter((_, i) => i !== idx))} style={{ background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '6px', padding: '8px 14px', cursor: 'pointer', fontWeight: 'bold' }}>X</button>
              )}
            </div>
          );
        })}
        <button type="button" onClick={() => setFabricRows([...fabricRows, emptyFabricRow()])} style={{ ...styles.secondaryBtn, marginTop: '8px' }}>+ Add Another Fabric</button>
        {totalIssued > 0 && <div style={{ marginTop: '10px', fontSize: '13px', fontWeight: 'bold', color: '#0f172a' }}>மொத்தம் Issue: {r3(totalIssued)} M</div>}
      </div>

      <div style={{ opacity: isFabricSelected ? 1 : 0.5, pointerEvents: isFabricSelected ? 'auto' : 'none' }}>
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: '18px' }}>
          <div style={{ flex: '1 1 280px', maxWidth: '420px' }}>
            <label style={styles.label}>2. Model Name *</label>
            <SelectNew value={model} onChange={setModel} options={masters.models} placeholder="-- Select Model --" newLabel="+ Add New Model" />
            <label style={{ ...styles.label, marginTop: '12px' }}>No. of Colours (Optional)</label>
            <input type="number" min="0" step="1" placeholder={chosenColors.length ? `Auto: ${chosenColors.length}` : 'எ.கா. 3'} value={numColors} onChange={e => setNumColors(e.target.value)} style={{ ...styles.input, maxWidth: '160px' }} />
            {yieldInfo && totalIssued > 0 && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '6px 8px' }}>
                💡 முந்தைய {yieldInfo.batches} Batch-படி 100 M-க்கு சுமார் <b>{Math.round(yieldInfo.pcsPer100)}</b> Pcs. {r3(totalIssued)} M-க்கு சுமார் <b>{expectedPcs}</b> Pcs எதிர்பார்க்கலாம்.
              </div>
            )}
            {chosenColors.length > 0 && (
              <div style={{ marginTop: '6px', fontSize: '12px', color: '#475569' }}>🎨 Fabric Colors: <b>{chosenColors.join(', ')}</b> (Color பெயர் தேவையில்லை; எண்ணிக்கை மட்டும் போதும்)</div>
            )}
          </div>
          <div>
            <label style={styles.label}>Local Name (இந்த Batch-க்கு உங்கள் பெயர் — Optional)</label>
            <SelectNew value={localName} onChange={setLocalName} options={masters.localNames} placeholder="-- Local Name தேர்வு --" newLabel="+ New Local Name" />
          </div>
          <div>
            <label style={styles.label}>Material / Fit / Selling Price (இறுதி வரை தொடரும்)</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
              <SelectNew value={material} onChange={setMaterial} options={masters.materials} placeholder="-- Material (Auto: Fabric) --" newLabel="+ New Material" />
              <SelectNew value={fit} onChange={setFit} options={masters.fits} placeholder="-- Fit --" newLabel="+ New Fit" />
              <input type="number" min="0" step="any" placeholder="Selling Price ₹ (எல்லா Size)" value={price} onChange={e => setPrice(e.target.value)} style={styles.input} />
              <input type="number" min="0" step="any" placeholder="MRP ₹ (எல்லா Size)" value={mrpAll} onChange={e => setMrpAll(e.target.value)} style={styles.input} />
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>இங்கு ஒரு முறை உள்ளிட்டால் Godown, Catalog, Showroom வரை எல்லா இடத்திலும் தானாக வரும்.</div>
          </div>
          <div>
            <label style={styles.label}>Product Photos (Front / Back / Side / Close-up)</label>
            <PhotoSlots slots={photoSlots} onChange={setPhotoSlots} />
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>முதலில் 1 Photo; தேவையானால் + Add Photo (அதிகபட்சம் 4). Photo இல்லாவிட்டாலும் Save ஆகும்.</div>
            <label style={{ ...styles.label, marginTop: '12px' }}>Colour Squares (அதிகபட்சம் 6 — Fabric Photo அல்லது Colour பெயர்; Assorted-உம் உண்டு)</label>
            <SwatchSlots slots={swatchSlots} onChange={setSwatchSlots} />
            </div>
        </div>

        <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', marginBottom: '18px' }}>
          <label style={styles.label}>3. Size & Pieces * (ஒவ்வொரு Size-க்கும் தனி Rate / MRP கொடுக்கலாம்; காலியாக விட்டால் மேலே உள்ள பொது Rate வரும்)</label>
          {sizes.map((s, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
              <SelectNew value={s.size} onChange={v => updateSize(idx, { size: v })} options={masters.sizes} placeholder="-- Size --" newLabel="+ Other Size" />
              <input type="number" min="0" step="1" placeholder="Pieces *" value={s.pieces} onChange={e => updateSize(idx, { pieces: e.target.value })} style={styles.input} />
              <input type="number" min="0" step="any" placeholder="Size Rate ₹ (Opt)" value={s.price} onChange={e => updateSize(idx, { price: e.target.value })} style={styles.input} />
              <input type="number" min="0" step="any" placeholder="Size MRP ₹ (Opt)" value={s.mrp} onChange={e => updateSize(idx, { mrp: e.target.value })} style={styles.input} />
              <div style={{ display: 'flex', gap: '6px' }}>
                <input type="number" min="0" step="any" placeholder="Avg Mtr/Pc (Opt)" value={s.consumption} onChange={e => updateSize(idx, { consumption: e.target.value })} style={styles.input} />
                {sizes.length > 1 && (
                  <button type="button" onClick={() => setSizes(sizes.filter((_, i) => i !== idx))} style={{ background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '6px', padding: '0 10px', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                )}
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setSizes([...sizes, emptySizeRow()])} style={styles.secondaryBtn}>+ Add Size</button>
          <div style={{ marginTop: '10px', fontSize: '13px', fontWeight: 'bold', color: '#0f172a' }}>மொத்தம் Pieces: {totalPieces}</div>
        </div>

        <div style={{ borderTop: '2px solid #f1f5f9', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontWeight: 'bold', color: '#475569', fontSize: '13px' }}>End Bits (Meters - Opt):</label>
            <input type="number" min="0" step="any" placeholder="Meters" value={endBits} onChange={e => setEndBits(e.target.value)} style={{ ...styles.input, width: '120px' }} />
            {suggestedEndBit > 0 && String(r3(suggestedEndBit)) !== endBits && (
              <button type="button" onClick={() => setEndBits(String(r3(suggestedEndBit)))} style={{ ...styles.secondaryBtn, fontSize: '12px' }}>
                Auto: {r3(suggestedEndBit)} M
              </button>
            )}
          </div>
          <button type="button" onClick={handleSave} disabled={saving} style={styles.successBtn}>{saving ? 'Saving...' : '💾 Save Batch & Send to WIP'}</button>
        </div>
      </div>
    </div>
  );
}
