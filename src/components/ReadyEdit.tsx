import { useState } from 'react';
import { submitChange, isAdmin } from '../lib/approvals';
import { saveSizeUpdates, NO_SIZE, sortSizes, type SizeMap } from '../lib/sizeLedger';
import { saveDesignInfo, type DesignInfo } from '../lib/masterStore';
import { saveBatchNames } from '../lib/batchNames';
import { logAction } from '../lib/audit';
import { errMsg } from '../lib/supabase';
import { num } from '../lib/helpers';
import { PRESET_FITS, PRESET_SIZES } from '../lib/constants';
import { GalleryEditor } from './GallerySlots';
import { Modal, notify, styles } from './ui';

interface SzRow { size: string; qty: string; price: string; mrp: string }

/**
 * Full edit of one Godown (Ready Stock) record: every column that is shown in the list.
 * DB columns (batch / model / design / colour / pcs) go through the normal Admin approval flow;
 * Local Name, Material, Fit, Price, MRP, size-wise Qty / Rate / MRP are kept in the Storage JSON masters (no DB change).
 */
export default function ReadyEdit({ user, row, name, info, sizes, focusSize, nameOptions, onClose, onDone }: {
  user: any; row: any; name: string; info?: DesignInfo; sizes: SizeMap; focusSize?: string; nameOptions: string[]; onClose: () => void; onDone: () => void;
}) {
  const admin = isAdmin(user);
  const [batch, setBatch] = useState(String(row.batch_code || ''));
  const [model, setModel] = useState(String(row.model_name || ''));
  const [design, setDesign] = useState(String(row.design_no || ''));
  const [color, setColor] = useState(String(row.color || ''));
  const [localName, setLocalName] = useState(name || '');
  const [material, setMaterial] = useState(info?.material || '');
  const [fit, setFit] = useState(info?.fit || '');
  const [price, setPrice] = useState(info?.price ? String(info.price) : '');
  const [mrp, setMrp] = useState(info?.mrp ? String(info.mrp) : '');
  const [rows, setRows] = useState<SzRow[]>(() => {
    const keys = Object.keys(sizes).sort(sortSizes);
    return (keys.length ? keys : [NO_SIZE]).map(k => ({
      size: k === NO_SIZE ? '' : k, qty: String(sizes[k] ?? row.ready_pieces ?? ''),
      price: info?.rates?.[k]?.price ? String(info.rates[k].price) : '', mrp: info?.rates?.[k]?.mrp ? String(info.rates[k].mrp) : ''
    }));
  });
  const [busy, setBusy] = useState(false);
  const [gallery, setGallery] = useState(false);

  const total = rows.reduce((s, r) => s + Math.max(0, Math.floor(num(r.qty))), 0);
  const setRow = (i: number, k: keyof SzRow, v: string) => setRows(p => p.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const save = async () => {
    const used = rows.filter(r => num(r.qty) > 0 || r.size.trim());
    const labels = used.map(r => r.size.trim());
    if (used.length > 1 && labels.some(l => !l)) return notify('பல Size இருந்தால் ஒவ்வொரு வரிக்கும் Size பெயர் போடவும்.', 'err');
    if (new Set(labels.map(l => l.toLowerCase())).size !== labels.length) return notify('ஒரே Size இரண்டு முறை உள்ளது.', 'err');
    if (total <= 0) return notify('மொத்த Qty 0-க்கு மேல் இருக்க வேண்டும் (முழுவதும் நீக்க 🗑️ Delete பயன்படுத்தவும்).', 'err');
    if (!model.trim()) return notify('Model காலியாக இருக்கக் கூடாது.', 'err');
    const oldTotal = Math.floor(num(row.ready_pieces));
    if (!admin && total !== oldTotal) return notify(`மொத்த Qty (${oldTotal}) மாற்ற Admin வேண்டும். Size-களுக்குள் பிரிக்கலாம் (மொத்தம் ${oldTotal} ஆக இருக்க வேண்டும்).`, 'err');
    if (!admin && batch.trim() !== String(row.batch_code)) return notify('Batch Code மாற்ற Admin வேண்டும்.', 'err');

    setBusy(true);
    try {
      const oldCode = String(row.batch_code);
      const code = admin ? batch.trim() || oldCode : oldCode;
      const next: Record<string, any> = { batch_code: code, model_name: model.trim(), design_no: design.trim(), color: color.trim(), ready_pieces: total };
      const changes: Record<string, any> = {}; const before: Record<string, any> = {};
      Object.entries(next).forEach(([k, v]) => { const o = row[k] === null || row[k] === undefined ? '' : row[k]; if (String(o) !== String(v)) { changes[k] = v; before[k] = row[k]; } });
      let queued = false;
      if (Object.keys(changes).length) {
        const r = await submitChange(user, { action: 'update', table: 'pommys_ready_stock', rowId: row.id, label: `Ready Stock ${oldCode} (${row.model_name})`, changes, before });
        queued = r === 'queued';
      }
      const jm = admin ? model.trim() : String(row.model_name);
      const jd = admin ? (design.trim() || '-') : String(row.design_no || '-');
      const warn: string[] = [];
      try {
        const map: SizeMap = {};
        used.forEach(r => { const q = Math.floor(num(r.qty)); if (q > 0) map[r.size.trim() || NO_SIZE] = (map[r.size.trim() || NO_SIZE] || 0) + q; });
        const onlyNone = Object.keys(map).length === 1 && map[NO_SIZE] !== undefined;
        const upd: Record<string, SizeMap | null> = { [code]: onlyNone ? null : map };
        if (code !== oldCode) upd[oldCode] = null;
        await saveSizeUpdates(upd);
      } catch { warn.push('Size Qty'); }
      try {
        if (localName.trim() && (localName.trim() !== name || code !== oldCode)) await saveBatchNames({ [code]: localName.trim() });
      } catch { warn.push('Local Name'); }
      try {
        const rates: Record<string, { price?: number; mrp?: number }> = {};
        used.forEach(r => { const s = r.size.trim(); if (s && (num(r.price) > 0 || num(r.mrp) > 0)) rates[s] = { price: num(r.price) || undefined, mrp: num(r.mrp) || undefined }; });
        await saveDesignInfo([{ model: jm, design: jd, material, fit, price: num(price), mrp: num(mrp), sizes: Object.keys(rates).join(', ') || undefined, rates: Object.keys(rates).length ? rates : undefined }]);
      } catch { warn.push('Material / Fit / Rate'); }
      logAction(`Ready Stock முழு Edit: ${oldCode}`);
      notify(queued ? '📨 DB மாற்றம் Admin ஒப்புதலுக்கு அனுப்பப்பட்டது; மற்ற விவரங்கள் சேமிக்கப்பட்டன.' : '✅ Edit முடிந்தது.', warn.length ? 'warn' : 'ok');
      if (warn.length) notify(`⚠️ இவை சேமிக்க முடியவில்லை: ${warn.join(', ')}`, 'warn');
      onDone(); onClose();
    } catch (err: any) {
      notify('Edit தோல்வி: ' + errMsg(err), 'err');
    } finally { setBusy(false); }
  };

  const delAll = async () => {
    if (!window.confirm(admin ? `"${row.batch_code}" முழு Batch-ஐயும் (எல்லா Size) Delete செய்யவா?` : 'முழு Batch Delete செய்ய Admin-இடம் கோரிக்கை அனுப்பவா?')) return;
    setBusy(true);
    try {
      const r = await submitChange(user, { action: 'delete', table: 'pommys_ready_stock', rowId: row.id, label: `Ready Stock ${row.batch_code} (${row.model_name})`, before: row });
      if (r === 'done') { try { await saveSizeUpdates({ [String(row.batch_code)]: null }); } catch { /* optional */ } }
      logAction(`Ready Stock Delete ${r === 'done' ? 'செய்யப்பட்டது' : 'கோரிக்கை'}: ${row.batch_code}`);
      notify(r === 'done' ? '✅ Delete முடிந்தது.' : '📨 Delete கோரிக்கை Admin ஒப்புதலுக்கு அனுப்பப்பட்டது.', r === 'done' ? 'ok' : 'info');
      onDone(); onClose();
    } catch (err: any) { notify('Delete தோல்வி: ' + errMsg(err), 'err'); } finally { setBusy(false); }
  };

  const L = ({ t, children }: { t: string; children: any }) => <div><label style={{ ...styles.label, fontSize: '11px' }}>{t}</label>{children}</div>;
  return (
    <>
      <Modal onClose={onClose}>
        <h4 style={{ margin: '0 0 4px 0', color: '#0f172a' }}>✏️ முழு Edit — {row.batch_code} ({row.model_name})</h4>
        <div style={{ fontSize: '12px', color: admin ? '#047857' : '#b45309', marginBottom: '10px' }}>
          {admin ? 'Admin: உடனே மாற்றப்படும்.' : 'Batch / Model / Design / Colour மாற்றம் Admin ஒப்புதலுக்குப் பிறகு. Local Name, Material, Fit, Rate, MRP, Size பிரிவு உடனே சேமிக்கப்படும்.'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', maxHeight: '64vh', overflowY: 'auto', textAlign: 'left' }}>
          <L t="Batch Code"><input aria-label="Batch Code" value={batch} disabled={!admin} onChange={e => setBatch(e.target.value)} style={styles.input} /></L>
          <L t="Local Name"><input aria-label="Local Name" list="re-ln" value={localName} onChange={e => setLocalName(e.target.value)} style={{ ...styles.input, fontWeight: 'bold' }} /><datalist id="re-ln">{nameOptions.map(o => <option key={o} value={o} />)}</datalist></L>
          <L t="Model"><input aria-label="Model" value={model} onChange={e => setModel(e.target.value)} style={styles.input} /></L>
          <L t="Design No"><input aria-label="Design No" value={design} onChange={e => setDesign(e.target.value)} style={styles.input} /></L>
          <L t="Colour"><input aria-label="Colour" value={color} onChange={e => setColor(e.target.value)} style={styles.input} /></L>
          <L t="Material"><input aria-label="Material" value={material} onChange={e => setMaterial(e.target.value)} style={styles.input} /></L>
          <L t="Fit"><input aria-label="Fit" list="re-fit" value={fit} onChange={e => setFit(e.target.value)} style={styles.input} /><datalist id="re-fit">{PRESET_FITS.map(o => <option key={o} value={o} />)}</datalist></L>
          <L t="பொது Price ₹"><input aria-label="Price" type="number" value={price} onChange={e => setPrice(e.target.value)} style={styles.input} /></L>
          <L t="பொது MRP ₹"><input aria-label="MRP" type="number" value={mrp} onChange={e => setMrp(e.target.value)} style={styles.input} /></L>
        </div>
        <div style={{ marginTop: '12px', fontWeight: 'bold', fontSize: '13px' }}>Size வாரி Qty / Rate / MRP <span style={{ color: '#64748b', fontWeight: 'normal' }}>(மொத்தம் {total} Pcs)</span></div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginTop: '4px' }}>
          <thead><tr style={{ background: '#e2e8f0' }}>{['Size', 'Qty', 'Rate ₹', 'MRP ₹', ''].map(h => <th key={h} style={{ padding: 4, textAlign: 'left' }}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ background: focusSize !== undefined && (r.size || NO_SIZE) === focusSize ? '#fef9c3' : undefined }}>
                <td style={{ padding: 2 }}><input aria-label={`Size ${i + 1}`} list="re-sz" value={r.size} placeholder="Size" onChange={e => setRow(i, 'size', e.target.value)} style={{ ...styles.tblInput, width: '90px' }} /></td>
                <td style={{ padding: 2 }}><input aria-label={`Qty ${i + 1}`} type="number" min="0" step="1" value={r.qty} onChange={e => setRow(i, 'qty', e.target.value)} style={{ ...styles.tblInput, width: '80px' }} /></td>
                <td style={{ padding: 2 }}><input aria-label={`Rate ${i + 1}`} type="number" min="0" value={r.price} onChange={e => setRow(i, 'price', e.target.value)} style={{ ...styles.tblInput, width: '80px' }} /></td>
                <td style={{ padding: 2 }}><input aria-label={`MRP ${i + 1}`} type="number" min="0" value={r.mrp} onChange={e => setRow(i, 'mrp', e.target.value)} style={{ ...styles.tblInput, width: '80px' }} /></td>
                <td style={{ padding: 2 }}>{rows.length > 1 && <button type="button" title="இந்த Size வரியை நீக்கு" onClick={() => setRows(p => p.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>✕</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id="re-sz">{PRESET_SIZES.map(o => <option key={o} value={o} />)}</datalist>
        <button type="button" onClick={() => setRows(p => [...p, { size: '', qty: '', price: p[p.length - 1]?.price || '', mrp: p[p.length - 1]?.mrp || '' }])} style={{ ...styles.secondaryBtn, marginTop: '6px', fontSize: '12px' }}>+ Size சேர்</button>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', flexWrap: 'wrap', marginTop: '14px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="button" onClick={() => setGallery(true)} style={styles.secondaryBtn}>🖼️ Photo / Colour</button>
            <button type="button" onClick={delAll} disabled={busy} style={styles.dangerBtn}>🗑️ முழு Batch Delete</button>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={onClose} style={styles.secondaryBtn}>Cancel</button>
            <button type="button" onClick={save} disabled={busy} style={styles.primaryBtn}>{busy ? '...' : 'Save'}</button>
          </div>
        </div>
      </Modal>
      {gallery && <GalleryEditor model={row.model_name} design={String(row.design_no || '-')} onClose={() => setGallery(false)} onSaved={onDone} />}
    </>
  );
}
