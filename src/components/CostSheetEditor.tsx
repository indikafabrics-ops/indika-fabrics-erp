import { useEffect, useState } from 'react';
import { fetchAll } from '../lib/supabase';
import { money, num, parseModelLabel } from '../lib/helpers';
import { COST_STAGES, SAMPLE_LINES, clothCost, cutToPack, totalCost, loadCostSheets, saveCostSheet, deleteCostSheet, modelKey, stageSum, type CostLine, type CostSheet } from '../lib/costSheets';
import { Field, notify, styles } from './ui';

export default function CostSheetEditor() {
  const [sheets, setSheets] = useState<Record<string, CostSheet>>({});
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState('');
  const [consumption, setConsumption] = useState('');
  const [clothRate, setClothRate] = useState('');
  const [lines, setLines] = useState<CostLine[]>(SAMPLE_LINES.map(l => ({ ...l })));
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [newStage, setNewStage] = useState<CostLine['stage']>('Stitching');
  const [newRate, setNewRate] = useState('');
  const addLine = () => {
    if (!newName.trim()) return notify('வரியின் பெயர் தேவை (எ.கா. Zip).', 'err');
    setLines(ls => [...ls, { name: newName.trim(), stage: newStage, rate: num(newRate) }]);
    setNewName(''); setNewRate('');
  };

  const reload = () => loadCostSheets().then(setSheets).catch(() => undefined);
  useEffect(() => {
    reload();
    Promise.all([
      fetchAll('pommys_cutting_batches', 'product_model', undefined, 'batch_code').catch(() => []),
      fetchAll('pommys_production_wip', 'model_name').catch(() => []),
      fetchAll('pommys_ready_stock', 'model_name').catch(() => [])
    ]).then(([c, w, r]) => {
      const set = new Set<string>();
      [...c.map((x: any) => x.product_model), ...w.map((x: any) => x.model_name), ...r.map((x: any) => x.model_name)]
        .forEach(x => { const m = parseModelLabel(String(x || '')).model; if (m && m !== '-') set.add(m); });
      setModels(Array.from(set).sort());
    });
  }, []);

  const current: CostSheet = { model, consumption: num(consumption), clothRate: num(clothRate), lines };
  const edit = (m: string) => {
    const s = sheets[modelKey(m)];
    setModel(m);
    if (s) { setConsumption(String(s.consumption)); setClothRate(String(s.clothRate)); setLines(s.lines.map(l => ({ ...l }))); }
    else { setConsumption(''); setClothRate(''); setLines(SAMPLE_LINES.map(l => ({ ...l }))); }
  };
  const setLine = (i: number, patch: Partial<CostLine>) => setLines(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l));

  const save = async () => {
    if (busy) return;
    if (!model.trim()) return notify('Model பெயர் தேவை.', 'err');
    if (!(num(consumption) > 0)) return notify('Consumption (Meter / Pc) தேவை.', 'err');
    if (!(num(clothRate) > 0)) return notify('Cloth Rate தேவை.', 'err');
    if (lines.some(l => !l.name.trim())) return notify('எல்லா வரிக்கும் பெயர் தேவை.', 'err');
    if (lines.some(l => num(l.rate) < 0)) return notify('Rate எதிர்மறையாக இருக்க முடியாது.', 'err');
    setBusy(true);
    try { await saveCostSheet({ ...current, lines: lines.map(l => ({ ...l, rate: num(l.rate) })) }); await reload(); notify('Cost Sheet சேமிக்கப்பட்டது. Report-களில் Value தானாக வரும்.', 'ok'); }
    catch (e: any) { notify('சேமிக்க முடியவில்லை: ' + (e?.message || e), 'err'); }
    finally { setBusy(false); }
  };
  const del = async (m: string) => {
    if (!window.confirm(`${m} Cost Sheet-ஐ நீக்கவா?`)) return;
    try { await deleteCostSheet(m); await reload(); } catch (e: any) { notify('நீக்க முடியவில்லை: ' + (e?.message || e), 'err'); }
  };
  const missing = models.filter(m => !sheets[modelKey(m)]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {missing.length > 0 && (
        <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '8px', padding: '10px 14px', fontSize: '13px' }}>
          ⚠️ Costing போடாத Model: {missing.map(m => <button key={m} type="button" onClick={() => edit(m)} style={{ ...styles.secondaryBtn, margin: '2px 4px', padding: '4px 10px' }}>{m}</button>)}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
        <Field label="Model">
          <input list="cost-models" value={model} onChange={e => edit(e.target.value)} style={styles.input} placeholder="Model பெயர்" />
          <datalist id="cost-models">{models.map(m => <option key={m} value={m} />)}</datalist>
        </Field>
        <Field label="Consumption (Meter / Pc)"><input type="number" min="0" step="any" value={consumption} onChange={e => setConsumption(e.target.value)} style={styles.input} /></Field>
        <Field label="Cloth Rate / Meter (₹)"><input type="number" min="0" step="any" value={clothRate} onChange={e => setClothRate(e.target.value)} style={styles.input} /></Field>
        <Field label="Cloth Cost / Pc"><div style={{ ...styles.input, background: '#f1f5f9', fontWeight: 'bold' }}>₹ {money(clothCost(current))}</div></Field>
      </div>
      <div style={{ border: '2px dashed #93c5fd', background: '#eff6ff', borderRadius: '8px', padding: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', alignItems: 'end' }}>
        <Field label="➕ புதிய வரி பெயர் (எ.கா. Zip, Hook)"><input list="cost-line-names" value={newName} onChange={e => setNewName(e.target.value)} style={styles.input} placeholder="Zip" /><datalist id="cost-line-names">{Array.from(new Set([...SAMPLE_LINES.map(l => l.name), ...Object.values(sheets).flatMap(sh => sh.lines.map(l => l.name))])).map(n => <option key={n} value={n} />)}</datalist></Field>
        <Field label="Stage"><select value={newStage} onChange={e => setNewStage(e.target.value as any)} style={styles.input}>{COST_STAGES.map(st => <option key={st}>{st}</option>)}</select></Field>
        <Field label="₹ / Pc"><input type="number" min="0" step="any" value={newRate} onChange={e => setNewRate(e.target.value)} style={styles.input} /></Field>
        <button type="button" style={styles.primaryBtn} onClick={addLine}>+ சேர்</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '520px' }}>
          <thead><tr style={{ background: '#1e293b', color: 'white' }}><th style={styles.thSub}>Cut to Pack வரிசை</th><th style={styles.thSub}>எந்த Stage</th><th style={styles.thSub}>₹ / Pc</th><th style={styles.thSub} /></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={styles.td}><input value={l.name} onChange={e => setLine(i, { name: e.target.value })} style={styles.input} /></td>
                <td style={styles.td}><select value={l.stage} onChange={e => setLine(i, { stage: e.target.value as any })} style={styles.input}>{COST_STAGES.map(s => <option key={s}>{s}</option>)}</select></td>
                <td style={styles.td}><input type="number" min="0" step="any" value={l.rate} onChange={e => setLine(i, { rate: e.target.value as any })} style={{ ...styles.input, width: '90px' }} /></td>
                <td style={styles.td}><button type="button" style={styles.dangerBtn} onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" style={styles.secondaryBtn} onClick={() => setLines(ls => [...ls, { name: '', stage: 'Stitching', rate: 0 }])}>+ வரி சேர்</button>
        <button type="button" style={styles.secondaryBtn} onClick={() => setLines(SAMPLE_LINES.map(l => ({ ...l })))}>Sample Format-ஐ மீண்டும் நிரப்பு</button>
      </div>
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '14px', borderRadius: '8px', display: 'flex', gap: '20px', flexWrap: 'wrap', fontSize: '14px' }}>
        <div>Cloth: <b>₹ {money(clothCost(current))}</b></div>
        {COST_STAGES.map(s => <div key={s}>{s}: <b>₹ {money(stageSum(current, s))}</b></div>)}
        <div>Cut to Pack: <b>₹ {money(cutToPack(current))}</b></div>
        <div style={{ color: '#059669' }}>Costing: <b>₹ {money(totalCost(current))}</b></div>
      </div>
      <button type="button" disabled={busy} onClick={save} style={styles.primaryBtn}>{busy ? 'சேமிக்கிறது…' : '💾 Cost Sheet சேமி'}</button>

      <h4 style={{ margin: '8px 0 0 0' }}>சேமித்த Cost Sheet-கள்</h4>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ background: '#1e293b', color: 'white' }}>{['Model', 'Cloth', 'Cut to Pack', 'Costing', ''].map(h => <th key={h} style={styles.thSub}>{h}</th>)}</tr></thead>
        <tbody>
          {Object.values(sheets).length === 0 && <tr><td style={styles.td} colSpan={5}>இன்னும் எதுவும் இல்லை.</td></tr>}
          {Object.values(sheets).sort((a, b) => a.model.localeCompare(b.model)).map(s => (
            <tr key={s.model} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={styles.td}><b>{s.model}</b></td><td style={styles.td}>₹ {money(clothCost(s))}</td><td style={styles.td}>₹ {money(cutToPack(s))}</td><td style={styles.td}><b>₹ {money(totalCost(s))}</b></td>
              <td style={styles.td}><button type="button" style={styles.secondaryBtn} onClick={() => edit(s.model)}>✏️</button> <button type="button" style={styles.dangerBtn} onClick={() => del(s.model)}>🗑️</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
