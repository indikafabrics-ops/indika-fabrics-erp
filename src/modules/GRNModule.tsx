import { useState, type ChangeEvent, type FormEvent } from 'react';
import { supabase, errMsg } from '../lib/supabase';
import { useMasters, type Masters } from '../lib/useMasters';
import { GST_OPTIONS, GST_REGEX, type OpeningBulkRow } from '../lib/constants';
import { num, r3, money, todayStr } from '../lib/helpers';
import { extractTextFromBillFile, parseBillTextToFields } from '../lib/bill';
import { ImagePreview, SelectNew, notify, styles } from '../components/ui';

type InwardType = 'OWN_FABRIC' | 'RMG' | 'JOB_WORK';

const emptyBill = () => ({
  inwardType: 'OWN_FABRIC' as InwardType,
  supplierName: '',
  supplierPlace: '',
  supplierGst: '',
  billNo: '',
  billDate: todayStr(),
  noOfBales: '',
  lrNo: '',
  lrDate: '',
  baleNo: ''
});

const emptyItem = (): any => ({
  itemDetails: '', quality: '', width: '', meterFold: '', itemRate: '', gstPercentage: '5',
  designNo: '', color: '', imageFile: null as File | null, totalMeter: '', totalPieces: '',
  sizeDetails: '', damage: '', shortage: '', returnEntry: '', returnBooking: ''
});

export default function GRNModule() {
  const masters = useMasters();
  const [mode, setMode] = useState<'GRN' | 'OPENING'>('GRN');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setMode('GRN')} style={{ ...styles.secondaryBtn, background: mode === 'GRN' ? '#0f172a' : '#e2e8f0', color: mode === 'GRN' ? 'white' : '#334155' }}>
          📥 Purchase & GRN Entry
        </button>
        <button type="button" onClick={() => setMode('OPENING')} style={{ ...styles.secondaryBtn, background: mode === 'OPENING' ? '#059669' : '#e2e8f0', color: mode === 'OPENING' ? 'white' : '#334155' }}>
          ⚡ Quick Opening & Trading Stock (Multi-Row)
        </button>
      </div>
      {/* both stay mounted so half-filled data is not lost when switching tabs */}
      <div style={{ display: mode === 'GRN' ? 'block' : 'none' }}><GRNForm masters={masters} /></div>
      <div style={{ display: mode === 'OPENING' ? 'block' : 'none' }}><OpeningStockForm masters={masters} /></div>
    </div>
  );
}

// ======================================================================
// Purchase GRN
// ======================================================================
function GRNForm({ masters }: { masters: Masters }) {
  const [bill, setBill] = useState<any>(emptyBill());
  const [items, setItems] = useState<any[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);

  const [billFile, setBillFile] = useState<File | null>(null);
  const [billPreviewUrl, setBillPreviewUrl] = useState<string | null>(null);
  const [extractingBill, setExtractingBill] = useState(false);
  const [extractionNote, setExtractionNote] = useState('');
  const [doubtFields, setDoubtFields] = useState<Record<string, boolean>>({});

  const isRMG = bill.inwardType === 'RMG';
  const isJobWork = bill.inwardType === 'JOB_WORK';

  const doubtStyle = (key: string, base: any) =>
    doubtFields[key] ? { ...base, borderColor: '#f59e0b', background: '#fffbeb' } : base;

  const clearDoubt = (key: string) => {
    const k = key === 'totalPieces' ? 'totalMeter' : key;
    if (doubtFields[k]) setDoubtFields(prev => ({ ...prev, [k]: false }));
  };

  const calc = (it: any) => {
    const qty = num(isRMG ? it.totalPieces : it.totalMeter);
    const rate = isJobWork ? 0 : num(it.itemRate);
    const gst = isJobWork ? 0 : num(it.gstPercentage);
    const base = qty * rate;
    const total = base + (base * gst) / 100;
    const net = Math.max(0, qty - num(it.damage) - num(it.shortage) - num(it.returnEntry));
    return { qty, rate, gst, total, net };
  };

  const grandTotal = items.reduce((sum, it) => sum + calc(it).total, 0);

  // ----- Supplier -----
  const handleSupplierChange = (name: string) => {
    clearDoubt('supplierName');
    const known = masters.suppliers.find(s => s.name === name);
    setBill((prev: any) => ({
      ...prev,
      supplierName: name,
      supplierPlace: known ? known.place : name === '' ? '' : prev.supplierPlace,
      supplierGst: known ? known.gst : name === '' ? '' : prev.supplierGst
    }));
  };

  const handleBillChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    clearDoubt(name);
    setBill((prev: any) => ({ ...prev, [name]: value }));
  };

  // ----- Items -----
  const updateItem = (idx: number, patch: any) => {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const handleItemChange = (idx: number, field: string, val: any) => {
    clearDoubt(field);
    updateItem(idx, { [field]: val });
  };
  const handleItemName = (idx: number, name: string) => {
    clearDoubt('itemDetails');
    const spec = masters.itemSpecs[name];
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const next = { ...it, itemDetails: name };
      if (spec) {
        // pre-fill only EMPTY cells from the last purchase of this item
        if (!it.quality) next.quality = String(spec.quality || '');
        if (!it.width) next.width = String(spec.fabric_width || '');
        if (!it.meterFold) next.meterFold = String(spec.meter_fold || '');
        if (!it.itemRate && spec.rate_per_meter) next.itemRate = String(spec.rate_per_meter);
        if (spec.gst_percentage !== undefined && spec.gst_percentage !== null) next.gstPercentage = String(spec.gst_percentage);
      }
      return next;
    }));
  };

  const handleAddColorVariant = () => {
    const last = items[items.length - 1] || emptyItem();
    setItems([...items, {
      ...emptyItem(),
      itemDetails: last.itemDetails, quality: last.quality, width: last.width, meterFold: last.meterFold,
      itemRate: last.itemRate, gstPercentage: last.gstPercentage, designNo: last.designNo, sizeDetails: last.sizeDetails
    }]);
  };

  // ----- Bill photo / PDF -----
  const handleBillFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files ? e.target.files[0] : null;
    if (!file) return;
    setBillFile(file);
    setBillPreviewUrl(file.type.startsWith('image/') ? URL.createObjectURL(file) : null);

    setExtractingBill(true);
    setExtractionNote('');
    try {
      const text = await extractTextFromBillFile(file);
      if (!text) {
        setExtractionNote('⚠️ Bill-லிருந்து தானாகப் படிக்க முடியவில்லை — மஞ்சள் நிற Doubt கட்டங்களை Manual ஆக நிரப்பவும்.');
        setDoubtFields({ supplierName: true, billNo: true, billDate: true, itemDetails: true, itemRate: true, totalMeter: true });
        return;
      }
      const parsed = parseBillTextToFields(text);

      // supplier: recognised only when the GST on the bill belongs to a supplier we already know
      const knownSupplier = masters.suppliers.find(s => s.gst && parsed.gstList.includes(s.gst.toUpperCase()));
      setBill((prev: any) => {
        const next = { ...prev, billNo: parsed.billNo || prev.billNo, billDate: parsed.billDate || prev.billDate };
        if (knownSupplier && !prev.supplierName) {
          next.supplierName = knownSupplier.name;
          next.supplierPlace = knownSupplier.place;
          next.supplierGst = knownSupplier.gst;
        } else if (!prev.supplierGst && parsed.gstList[0]) {
          next.supplierGst = parsed.gstList[0];
        }
        return next;
      });

      setItems(prev => {
        const updated = [...prev];
        updated[0] = {
          ...updated[0],
          itemDetails: parsed.itemDetails || updated[0].itemDetails,
          designNo: parsed.designNo || updated[0].designNo,
          itemRate: parsed.itemRate || updated[0].itemRate,
          totalMeter: !isRMG && parsed.totalMeter ? parsed.totalMeter : updated[0].totalMeter,
          totalPieces: isRMG && parsed.totalPieces ? parsed.totalPieces : updated[0].totalPieces
        };
        return updated;
      });

      setDoubtFields({ ...parsed.doubtFields, supplierName: !knownSupplier });
      setExtractionNote('✅ கிடைத்த விவரங்கள் தானாக நிரப்பப்பட்டுள்ளன. மஞ்சள் நிற (Doubt) கட்டங்களை மட்டும் சரிபார்த்து நிரப்பவும்.');
    } finally {
      setExtractingBill(false);
    }
  };

  // ----- Save -----
  const handleSave = async () => {
    const supplierName = String(bill.supplierName).trim();
    const billNo = String(bill.billNo).trim();
    if (!supplierName || !billNo) return notify('Supplier Name மற்றும் Bill No. இரண்டும் தேவை.', 'err');

    const gstNo = String(bill.supplierGst).trim().toUpperCase();
    if (gstNo && !GST_REGEX.test(gstNo)) return notify('GST Number தவறாக உள்ளது (15 எழுத்து வடிவம்). சரிபார்க்கவும் அல்லது காலியாக விடவும்.', 'err');

    const used = items.filter(it => calc(it).qty > 0);
    if (used.length === 0) return notify(`குறைந்தது ஒரு வரியில் ${isRMG ? 'Total Pcs' : 'Total Mtr'} உள்ளிடவும்.`, 'err');

    for (const it of used) {
      const c = calc(it);
      const label = it.itemDetails || it.designNo || 'Item';
      if ([it.damage, it.shortage, it.returnEntry, it.itemRate].some(v => num(v) < 0)) return notify(`"${label}": எதிர்மறை (minus) எண் உள்ளிட முடியாது.`, 'err');
      if (num(it.damage) + num(it.shortage) + num(it.returnEntry) > c.qty) return notify(`"${label}": Damage + Short + Return அளவு Total-ஐ விட அதிகமாக உள்ளது.`, 'err');
    }

    setSaving(true);
    let billId: any = null;
    try {
      const { data: dup } = await supabase.from('pommys_grn_bills').select('id').eq('supplier_name', supplierName).eq('bill_no', billNo).limit(1);
      if (dup && dup.length > 0) {
        const again = window.confirm(`"${supplierName}" — Bill No. ${billNo} ஏற்கனவே பதிவு செய்யப்பட்டுள்ளது.\nமீண்டும் சேர்த்தால் Stock இரட்டிப்பாகும். தொடரவா?`);
        if (!again) return;
      }

      if (billFile) {
        const ext = billFile.name.split('.').pop();
        await supabase.storage.from('assets').upload(`bills/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`, billFile);
      }

      const { data: billData, error: billError } = await supabase.from('pommys_grn_bills').insert([{
        supplier_name: supplierName,
        supplier_place: String(bill.supplierPlace).trim(),
        gst_number: gstNo,
        bill_no: billNo,
        bill_date: bill.billDate || null,
        lr_no: bill.lrNo,
        lr_date: bill.lrDate || null,
        bale_no: bill.baleNo,
        no_of_bales: bill.noOfBales ? parseInt(bill.noOfBales, 10) : null
      }]).select().single();
      if (billError) throw billError;
      billId = billData.id;

      const stockItems: any[] = [];
      const exceptionRows: any[] = [];
      const readyRows: any[] = [];
      let imageFailures = 0;

      for (let idx = 0; idx < used.length; idx++) {
        const item = used[idx];
        let imageUrl = '';
        if (item.imageFile) {
          const ext = item.imageFile.name.split('.').pop();
          const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
          const { error: upErr } = await supabase.storage.from('assets').upload(fileName, item.imageFile);
          if (upErr) imageFailures++;
          else imageUrl = supabase.storage.from('assets').getPublicUrl(fileName).data.publicUrl;
        }

        const c = calc(item);
        const dmg = num(item.damage);
        const itemName = (item.itemDetails || (isRMG ? 'Garment' : 'Fabric')).trim();
        const color = String(item.color || '').trim() || '-';
        const design = String(item.designNo || '').trim() || '-';

        if (dmg > 0) {
          exceptionRows.push({
            stock_type: 'DAMAGE',
            ref_code: billNo,
            model_or_item: itemName,
            color,
            qty: dmg,
            unit: isRMG ? 'Pcs' : 'Mtr',
            remarks: `GRN Damage (${supplierName})`
          });
        }

        // Ready-made (trading) goods are NOT fabric: they go to Ready Stock, never to the cutting list
        if (isRMG) {
          readyRows.push({
            batch_code: `GRN-${billNo}-${idx + 1}`,
            model_name: `Trading: ${itemName}`,
            design_no: design,
            color,
            ready_pieces: c.net
          });
        }

        stockItems.push({
          bill_id: billId,
          item_name: isJobWork ? `[Job Work] ${itemName}` : itemName,
          quality: isRMG ? item.sizeDetails : item.quality,
          fabric_width: item.width,
          meter_fold: item.meterFold,
          rate_per_meter: isJobWork ? 0 : c.rate,
          gst_percentage: isJobWork ? 0 : c.gst,
          design_no: design,
          color,
          image_url: imageUrl,
          total_meters: c.qty,
          damage_meters: dmg,
          shortage_meters: num(item.shortage),
          return_booking_details: item.returnBooking,
          net_meters: c.net,
          available_meters: isRMG ? 0 : c.net
        });
      }

      const { error: stockError } = await supabase.from('pommys_fabric_stock').insert(stockItems);
      if (stockError) {
        await supabase.from('pommys_grn_bills').delete().eq('id', billId); // no orphan bill
        billId = null;
        throw stockError;
      }

      let warn = '';
      if (readyRows.length > 0) {
        const { error } = await supabase.from('pommys_ready_stock').insert(readyRows);
        if (error) warn += ` ⚠️ Ready Stock பதிவு தோல்வி: ${errMsg(error)}`;
      }
      if (exceptionRows.length > 0) {
        const { error } = await supabase.from('pommys_exceptions_stock').insert(exceptionRows);
        if (error) warn += ` ⚠️ Damage பதிவு தோல்வி: ${errMsg(error)}`;
      }
      if (imageFailures > 0) warn += ` ⚠️ ${imageFailures} Photo Upload ஆகவில்லை.`;

      notify(`🎉 GRN சேமிக்கப்பட்டது! Stock புதுப்பிக்கப்பட்டது.${warn}`, warn ? 'warn' : 'ok');
      setBill(emptyBill());
      setItems([emptyItem()]);
      setBillFile(null);
      setBillPreviewUrl(null);
      setExtractionNote('');
      setDoubtFields({});
      setFormKey(k => k + 1);
      await masters.reload();
    } catch (err: any) {
      notify('Save தோல்வி: ' + errMsg(err), 'err');
    } finally {
      setSaving(false);
    }
  };

  const radio = (value: InwardType, label: string) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontWeight: bill.inwardType === value ? 'bold' : 'normal' }}>
      <input type="radio" name="inwardType" value={value} checked={bill.inwardType === value} onChange={handleBillChange} /> {label}
    </label>
  );

  const th = (text: string, extra: any = {}) => <th style={{ ...styles.thSub, ...extra }}>{text}</th>;
  const tblSelect = (value: string, onChange: (v: string) => void, options: string[], placeholder: string, newLabel: string, style?: any) => (
    <SelectNew value={value} onChange={onChange} options={options} placeholder={placeholder} newLabel={newLabel} style={style || styles.tblInput} />
  );

  return (
    <div style={styles.card} key={formKey}>
      {/* Bill upload */}
      <div style={{ background: '#f0fdf4', border: '1px solid #86efac', padding: '14px 16px', borderRadius: '10px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 'bold', color: '#166534', fontSize: '14px' }}>📄 Upload Bill (Photo / PDF) — Auto-Fill (விருப்பம்)</div>
            <div style={{ fontSize: '12px', color: '#15803d', marginTop: '2px' }}>
              Bill Upload செய்தால் விவரங்கள் தானாக நிரப்பப்படும்; மஞ்சள் நிற (⚠️ Doubt) கட்டங்களை மட்டும் சரிபார்க்கவும்.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="file" accept="image/*,application/pdf" onChange={handleBillFileUpload} style={{ fontSize: '12px', maxWidth: '230px' }} />
            {billPreviewUrl && (
              <button type="button" onClick={() => setPreview(billPreviewUrl)} style={{ background: '#e0f2fe', color: '#0369a1', border: 'none', padding: '7px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                👁️ View Bill
              </button>
            )}
          </div>
        </div>
        {(extractingBill || extractionNote) && (
          <div style={{ marginTop: '10px', fontSize: '12px', fontWeight: 'bold', color: extractingBill ? '#b45309' : '#0f172a' }}>
            {extractingBill ? '⏳ Bill-லிருந்து விவரங்கள் எடுக்கப்படுகின்றன...' : extractionNote}
          </div>
        )}
      </div>

      {/* Inward type */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', background: '#f0f9ff', border: '1px solid #bae6fd', padding: '14px 16px', borderRadius: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <h4 style={{ margin: 0, color: '#0369a1', fontSize: '15px' }}>Inward Type:</h4>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
          {radio('OWN_FABRIC', '🏭 Own Fabric')}
          {radio('RMG', '👕 RMG / Trading (Ready-made)')}
          {radio('JOB_WORK', '✂️ Job Work')}
        </div>
      </div>

      <h4 style={{ color: '#0f172a', marginBottom: '14px', paddingBottom: '8px', borderBottom: '2px solid #f1f5f9' }}>A) Supplier & Bill Details</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <div>
          <label style={styles.label}>
            {isJobWork ? 'Client / Supplier Name *' : 'Supplier Name *'}
            {doubtFields.supplierName && <span style={{ color: '#b45309', marginLeft: '6px' }}>(⚠️ Doubt - Verify)</span>}
          </label>
          <SelectNew
            value={bill.supplierName}
            onChange={handleSupplierChange}
            options={masters.supplierNames}
            placeholder="-- Select Supplier --"
            newLabel="+ Add New Party"
            style={doubtStyle('supplierName', styles.input)}
          />
        </div>
        <div>
          <label style={styles.label}>Supplier Place</label>
          <input type="text" name="supplierPlace" value={bill.supplierPlace} onChange={handleBillChange} placeholder="Surat / Tiruppur..." style={styles.input} />
        </div>
        <div>
          <label style={styles.label}>Supplier GST No.</label>
          <input type="text" name="supplierGst" value={bill.supplierGst} onChange={e => setBill((p: any) => ({ ...p, supplierGst: e.target.value.toUpperCase() }))} placeholder="Optional" maxLength={15} style={styles.input} />
        </div>
        <div>
          <label style={styles.label}>
            {isJobWork ? 'Challan No. *' : 'Bill No. *'}
            {doubtFields.billNo && <span style={{ color: '#b45309', marginLeft: '6px' }}>(⚠️ Doubt)</span>}
          </label>
          <input type="text" name="billNo" value={bill.billNo} onChange={handleBillChange} style={doubtStyle('billNo', styles.input)} />
        </div>
        <div>
          <label style={styles.label}>
            {isJobWork ? 'Challan Date' : 'Bill Date'}
            {doubtFields.billDate && <span style={{ color: '#b45309', marginLeft: '6px' }}>(⚠️ Doubt)</span>}
          </label>
          <input type="date" name="billDate" value={bill.billDate} onChange={handleBillChange} style={doubtStyle('billDate', styles.input)} />
        </div>
        <div><label style={styles.label}>No. of Bales</label><input type="number" min="0" name="noOfBales" value={bill.noOfBales} onChange={handleBillChange} style={styles.input} /></div>
        <div><label style={styles.label}>LR No.</label><input type="text" name="lrNo" value={bill.lrNo} onChange={handleBillChange} style={styles.input} /></div>
        <div><label style={styles.label}>Bale No(s).</label><input type="text" name="baleNo" value={bill.baleNo} placeholder="Ex: B-101" onChange={handleBillChange} style={styles.input} /></div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', paddingBottom: '8px', borderBottom: '2px solid #f1f5f9', flexWrap: 'wrap', gap: '10px' }}>
        <h4 style={{ color: '#0f172a', margin: 0 }}>B) Inventory Breakdown (Damage / Short / Return கழிக்கப்படும்)</h4>
        <button type="button" onClick={handleAddColorVariant} style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd', padding: '6px 12px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>
          + Same Item, Another Color
        </button>
      </div>

      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: '20px', border: '1px solid #cbd5e1', borderRadius: '8px' }}>
        <table style={{ width: '100%', minWidth: isRMG ? '1250px' : '1500px', borderCollapse: 'collapse', textAlign: 'left', background: 'white' }}>
          <thead>
            <tr style={{ background: '#0f172a', color: 'white' }}>
              {th('Item *', { minWidth: '150px' })}
              {!isRMG && th('Quality', { minWidth: '110px' })}
              {!isRMG && th('Width', { minWidth: '90px' })}
              {!isRMG && th('Fold', { minWidth: '90px' })}
              {isRMG && th('Size', { color: '#38bdf8', minWidth: '90px' })}
              {th('Design No', { minWidth: '120px' })}
              {th('Color', { minWidth: '120px' })}
              {th('Image (Opt)', { minWidth: '150px' })}
              {!isJobWork && th('Rate', { color: '#fbbf24', width: '80px' })}
              {!isJobWork && th('GST %', { color: '#38bdf8', width: '75px' })}
              {th(isRMG ? 'Total Pcs *' : 'Total Mtr *', { width: '95px' })}
              {!isJobWork && th('Total Val (₹)', { width: '105px' })}
              {th('Dmg', { width: '70px' })}
              {th('Short', { width: '70px' })}
              {th('Return', { width: '75px' })}
              {th('Net Stock', { width: '90px', background: '#059669', color: 'white' })}
              {th('', { width: '40px' })}
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const c = calc(item);
              const first = idx === 0;
              return (
                <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#f8fafc' : 'white' }}>
                  <td style={styles.td}>
                    <SelectNew
                      value={item.itemDetails}
                      onChange={v => handleItemName(idx, v)}
                      options={masters.itemNames}
                      placeholder="-- Item --"
                      newLabel="+ New Item"
                      style={first ? doubtStyle('itemDetails', styles.tblInput) : styles.tblInput}
                    />
                  </td>
                  {!isRMG && <td style={styles.td}>{tblSelect(item.quality, v => handleItemChange(idx, 'quality', v), masters.qualities, '-- Quality --', '+ New')}</td>}
                  {!isRMG && <td style={styles.td}>{tblSelect(item.width, v => handleItemChange(idx, 'width', v), masters.widths, '-- Width --', '+ New')}</td>}
                  {!isRMG && <td style={styles.td}>{tblSelect(item.meterFold, v => handleItemChange(idx, 'meterFold', v), masters.folds, '-- Fold --', '+ New')}</td>}
                  {isRMG && <td style={styles.td}>{tblSelect(item.sizeDetails, v => handleItemChange(idx, 'sizeDetails', v), masters.sizes, '-- Size --', '+ New')}</td>}
                  <td style={styles.td}>
                    <SelectNew
                      value={item.designNo}
                      onChange={v => handleItemChange(idx, 'designNo', v)}
                      options={masters.designs}
                      placeholder="-- Design --"
                      newLabel="+ New Design"
                      style={first ? doubtStyle('designNo', styles.tblInput) : styles.tblInput}
                    />
                  </td>
                  <td style={styles.td}>{tblSelect(item.color, v => handleItemChange(idx, 'color', v), masters.colors, '-- Color --', '+ New Color')}</td>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                      <input type="file" accept="image/*" onChange={e => updateItem(idx, { imageFile: e.target.files ? e.target.files[0] : null })} style={{ width: '100px', fontSize: '10px' }} />
                      {item.imageFile && (
                        <button type="button" onClick={() => setPreview(URL.createObjectURL(item.imageFile))} style={{ background: '#e0f2fe', color: '#0369a1', border: 'none', padding: '3px 6px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>Preview</button>
                      )}
                    </div>
                  </td>
                  {!isJobWork && (
                    <td style={styles.td}>
                      {(() => {
                        const last = num(masters.itemSpecs[String(item.itemDetails || '').trim()]?.rate_per_meter);
                        const rise = !isJobWork && last > 0 && num(item.itemRate) > last + 0.0001;
                        return (
                          <>
                            <input type="number" min="0" step="any" value={item.itemRate} onChange={e => handleItemChange(idx, 'itemRate', e.target.value)} style={{ ...(first ? doubtStyle('itemRate', styles.tblInput) : styles.tblInput), ...(rise ? { borderColor: '#f59e0b', background: '#fffbeb' } : {}) }} title={rise ? `கடந்த முறை ₹${last}` : undefined} />
                            {rise && <div style={{ fontSize: '10px', color: '#b45309', fontWeight: 'bold', marginTop: '2px' }}>⬆ கடந்த முறை ₹{last}</div>}
                          </>
                        );
                      })()}
                    </td>
                  )}
                  {!isJobWork && (
                    <td style={styles.td}>
                      <select value={item.gstPercentage} onChange={e => handleItemChange(idx, 'gstPercentage', e.target.value)} style={styles.tblInput}>
                        {GST_OPTIONS.map(g => <option key={g} value={g}>{g}%</option>)}
                      </select>
                    </td>
                  )}
                  <td style={styles.td}>
                    <input
                      type="number" min="0" step="any"
                      value={isRMG ? item.totalPieces : item.totalMeter}
                      onChange={e => handleItemChange(idx, isRMG ? 'totalPieces' : 'totalMeter', e.target.value)}
                      style={first && doubtFields.totalMeter
                        ? doubtStyle('totalMeter', { ...styles.tblInput, border: '1px solid #f59e0b' })
                        : { ...styles.tblInput, border: '1px solid #3b82f6', background: '#eff6ff' }}
                    />
                  </td>
                  {!isJobWork && <td style={styles.td}><strong style={{ color: '#334155' }}>₹ {money(c.total)}</strong></td>}
                  <td style={styles.td}><input type="number" min="0" step="any" value={item.damage} onChange={e => handleItemChange(idx, 'damage', e.target.value)} style={styles.tblInput} /></td>
                  <td style={styles.td}><input type="number" min="0" step="any" value={item.shortage} onChange={e => handleItemChange(idx, 'shortage', e.target.value)} style={styles.tblInput} /></td>
                  <td style={styles.td}><input type="number" min="0" step="any" value={item.returnEntry} placeholder="Qty" onChange={e => handleItemChange(idx, 'returnEntry', e.target.value)} style={styles.tblInput} /></td>
                  <td style={{ ...styles.td, background: '#f0fdf4', textAlign: 'center' }}>
                    <strong style={{ color: c.net > 0 ? '#059669' : '#ef4444', fontSize: '15px' }}>{r3(c.net)}</strong>
                  </td>
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    {items.length > 1 && (
                      <button type="button" title="Remove row" onClick={() => setItems(items.filter((_, i) => i !== idx))} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', padding: '4px 7px', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '12px' }}>
        <button type="button" onClick={() => setItems([...items, emptyItem()])} style={styles.secondaryBtn}>+ Add Row</button>
        {!isJobWork && <div style={{ fontSize: '16px', color: '#0f172a' }}>Grand Total (with GST): <strong style={{ color: '#dc2626' }}>₹ {money(grandTotal)}</strong></div>}
        <button type="button" onClick={handleSave} disabled={saving} style={styles.successBtn}>{saving ? 'Saving...' : '💾 Save & Update Stock'}</button>
      </div>

      {preview && <ImagePreview src={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

// ======================================================================
// Quick Opening / Trading stock (multi-row)
// ======================================================================
function OpeningStockForm({ masters }: { masters: Masters }) {
  const makeEmptyRow = (stage: OpeningBulkRow['stage'] = 'FABRIC'): OpeningBulkRow => ({
    stage, model: '', designNo: '', color: '', qty: '', rate: '', showroom: '', batchCode: ''
  });
  const [rows, setRows] = useState<OpeningBulkRow[]>([makeEmptyRow()]);
  const [saving, setSaving] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const change = (idx: number, field: keyof OpeningBulkRow, val: string) =>
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, [field]: val } : r)));

  const duplicate = (idx: number) =>
    setRows(prev => {
      const next = [...prev];
      next.splice(idx + 1, 0, { ...prev[idx], color: '', qty: '', batchCode: '' });
      return next;
    });

  const remove = (idx: number) => setRows(prev => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));

  const rnd = () => Math.floor(1000 + Math.random() * 9000);

  const insertRow = async (row: OpeningBulkRow) => {
    const numQty = num(row.qty);
    const rateVal = num(row.rate);
    const modelText = row.model.trim() || 'Item';
    const designText = row.designNo.trim() || '-';
    const colorText = row.color.trim() || '-';
    const batchText = row.batchCode.trim() || `OPN-${row.stage}-${rnd()}`;
    const today = todayStr();

    if (row.stage === 'FABRIC') {
      const { error } = await supabase.from('pommys_fabric_stock').insert([{
        item_name: modelText, design_no: designText, color: colorText,
        total_meters: numQty, net_meters: numQty, available_meters: numQty,
        rate_per_meter: rateVal, gst_percentage: 5
      }]);
      if (error) throw error;
    } else if (row.stage === 'CUTPARTS' || row.stage === 'WIP') {
      const { error } = await supabase.from('pommys_production_wip').insert([{
        batch_code: batchText,
        model_name: `${modelText}${designText !== '-' ? ` - ${designText}` : ''}${colorText !== '-' ? ` (${colorText})` : ''}`,
        total_pieces: numQty,
        current_status: row.stage === 'CUTPARTS' ? 'Cutting' : 'Stitching'
      }]);
      if (error) throw error;
    } else if (row.stage === 'READY_GODOWN') {
      const { error } = await supabase.from('pommys_ready_stock').insert([{
        batch_code: batchText, model_name: modelText, design_no: designText, color: colorText, ready_pieces: numQty
      }]);
      if (error) throw error;
    } else if (row.stage === 'READY_SHOWROOM') {
      const chosen = row.showroom.trim();
      if (!chosen) throw new Error('Showroom Opening Stock-க்கு Showroom தேர்வு செய்யவும் (முதலில் "Ready Stock & Showrooms"-ல் Showroom சேர்க்கவும்).');
      const { error } = await supabase.from('pommys_showroom_transfers').insert([{
        challan_no: `OPN-${rnd()}`, transfer_date: today, showroom_name: chosen, batch_code: batchText,
        design_no: designText, color: colorText, model_name: modelText, size_details: 'Opening Stock',
        transferred_pieces: numQty, status: 'Showroom Opening Stock'
      }]);
      if (error) throw error;
    } else if (row.stage === 'TRADING') {
      const target = row.showroom.trim();
      if (target) {
        const { error } = await supabase.from('pommys_showroom_transfers').insert([{
          challan_no: `TRD-${rnd()}`, transfer_date: today, showroom_name: target, batch_code: batchText,
          design_no: designText, color: colorText, model_name: `Trading: ${modelText}`,
          size_details: rateVal > 0 ? `Rate ₹${rateVal}` : 'Trading Variety',
          transferred_pieces: numQty, status: 'Trading Showroom Stock'
        }]);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('pommys_ready_stock').insert([{
          batch_code: batchText, model_name: `Trading: ${modelText}`, design_no: designText, color: colorText, ready_pieces: numQty
        }]);
        if (error) throw error;
      }
    } else {
      const isEndBit = row.stage === 'END_BIT';
      const { error } = await supabase.from('pommys_exceptions_stock').insert([{
        stock_type: isEndBit ? 'END_BIT' : 'DAMAGE',
        ref_code: batchText,
        model_or_item: `${modelText}${designText !== '-' ? ` (${designText})` : ''}`,
        color: colorText, qty: numQty, unit: isEndBit ? 'Mtr' : 'Pcs',
        remarks: rateVal > 0 ? `Rate ₹${rateVal}` : 'Opening Entry'
      }]);
      if (error) throw error;
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const valid = rows.filter(r => num(r.qty) > 0);
    if (valid.length === 0) return notify('குறைந்தது ஒரு வரியில் Qty (> 0) உள்ளிடவும்.', 'err');
    const noModel = valid.find(r => !r.model.trim());
    if (noModel) return notify('எல்லா வரிகளிலும் Model / Variety தேர்வு செய்யவும்.', 'err');

    setSaving(true);
    const failed: OpeningBulkRow[] = [];
    let saved = 0;
    let firstError = '';
    for (const row of valid) {
      try {
        await insertRow(row);
        saved++;
      } catch (err: any) {
        failed.push(row);
        if (!firstError) firstError = errMsg(err);
      }
    }
    setSaving(false);

    if (failed.length === 0) {
      notify(`✅ ${saved} Stock வரி(கள்) சேமிக்கப்பட்டன!`);
      setRows([makeEmptyRow()]);
      setFormKey(k => k + 1);
    } else {
      // keep ONLY the failed rows so a second click never saves the good rows twice
      notify(`${saved} வரி சேமிக்கப்பட்டன; ${failed.length} வரி தோல்வி: ${firstError}`, 'err');
      setRows(failed);
      setFormKey(k => k + 1);
    }
    if (saved > 0) masters.reload();
  };

  return (
    <div style={styles.card} key={formKey}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <div>
          <h4 style={{ margin: 0, color: '#0f172a' }}>⚡ Quick Opening & Multi-Variety Trading Stock</h4>
          <div style={{ fontSize: '12px', color: '#475569', marginTop: '3px' }}>
            Fabric, Cutparts, WIP, Godown Ready, Showroom Opening, End Bits, Damage அல்லது Trading Varieties — பல வரிகளை ஒரே நேரத்தில் சேர்த்து Save செய்யலாம். (ஒரு Stock-ஐ ஒரு முறை மட்டும் உள்ளிடவும்.)
          </div>
        </div>
        <button type="button" onClick={() => setRows(prev => [...prev, makeEmptyRow()])} style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd', padding: '7px 12px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>
          + Add Row
        </button>
      </div>

      <form onSubmit={handleSave}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: '14px', border: '1px solid #cbd5e1', borderRadius: '8px' }}>
          <table style={{ width: '100%', minWidth: '1100px', borderCollapse: 'collapse', textAlign: 'left', background: 'white' }}>
            <thead>
              <tr style={{ background: '#0f172a', color: 'white' }}>
                <th style={styles.thSub}>Stock Type / Stage *</th>
                <th style={styles.thSub}>Model / Variety *</th>
                <th style={styles.thSub}>Design (Opt)</th>
                <th style={styles.thSub}>Color (Opt)</th>
                <th style={styles.thSub}>Showroom</th>
                <th style={styles.thSub}>Rate (Opt)</th>
                <th style={styles.thSub}>Qty (Mtr / Pcs) *</th>
                <th style={{ ...styles.thSub, textAlign: 'center', width: '110px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const isTrading = row.stage === 'TRADING';
                const needsShowroom = row.stage === 'READY_SHOWROOM' || isTrading;
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#f8fafc' : 'white' }}>
                    <td style={styles.td}>
                      <select value={row.stage} onChange={e => change(idx, 'stage', e.target.value)} style={styles.tblInput}>
                        <option value="FABRIC">Fabric (Meters - Godown)</option>
                        <option value="CUTPARTS">Cutparts (Pieces)</option>
                        <option value="WIP">On-Process WIP (Pieces)</option>
                        <option value="READY_GODOWN">Ready Goods (Central Godown)</option>
                        <option value="READY_SHOWROOM">Ready Stock (Showroom Opening)</option>
                        <option value="TRADING">Trading Item (Variety)</option>
                        <option value="END_BIT">End Bits (Meters)</option>
                        <option value="DAMAGE">Damage / Seconds (Pieces)</option>
                      </select>
                    </td>
                    <td style={styles.td}>
                      <SelectNew
                        value={row.model}
                        onChange={v => change(idx, 'model', v)}
                        options={row.stage === 'FABRIC' || row.stage === 'END_BIT' ? masters.itemNames : masters.models}
                        placeholder="-- Select --"
                        newLabel="+ New"
                        style={styles.tblInput}
                      />
                    </td>
                    <td style={styles.td}>
                      <SelectNew value={row.designNo} onChange={v => change(idx, 'designNo', v)} options={masters.designs} placeholder="-- Design --" newLabel="+ New Design" style={styles.tblInput} />
                    </td>
                    <td style={styles.td}>
                      <SelectNew value={row.color} onChange={v => change(idx, 'color', v)} options={masters.colors} placeholder="-- Color --" newLabel="+ New Color" style={styles.tblInput} />
                    </td>
                    <td style={styles.td}>
                      {needsShowroom ? (
                        <select value={row.showroom} onChange={e => change(idx, 'showroom', e.target.value)} style={styles.tblInput}>
                          <option value="">{isTrading ? 'Central Godown' : '-- Select Showroom --'}</option>
                          {masters.showroomNames.map(sr => <option key={sr} value={sr}>{sr}</option>)}
                        </select>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>Godown / WIP</span>
                      )}
                    </td>
                    <td style={styles.td}>
                      <input type="number" min="0" step="any" placeholder="Optional" value={row.rate} onChange={e => change(idx, 'rate', e.target.value)} style={styles.tblInput} />
                    </td>
                    <td style={styles.td}>
                      <input type="number" min="0" step="any" placeholder="Qty *" value={row.qty} onChange={e => change(idx, 'qty', e.target.value)} style={{ ...styles.tblInput, borderColor: '#059669', background: '#f0fdf4' }} />
                    </td>
                    <td style={{ ...styles.td, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                        <button type="button" onClick={() => duplicate(idx)} title="Duplicate row" style={{ background: '#e0f2fe', color: '#0369a1', border: 'none', borderRadius: '4px', padding: '4px 7px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>+Copy</button>
                        {rows.length > 1 && (
                          <button type="button" onClick={() => remove(idx)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', padding: '4px 7px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>✕</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <button type="button" onClick={() => setRows(prev => [...prev, makeEmptyRow()])} style={styles.secondaryBtn}>+ Add Another Variety / Row</button>
          <button type="submit" disabled={saving} style={styles.successBtn}>{saving ? 'Saving...' : `💾 Save All (${rows.length} Row(s))`}</button>
        </div>
      </form>
    </div>
  );
}
