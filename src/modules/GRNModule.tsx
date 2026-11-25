import { useState, type ChangeEvent, type FormEvent } from 'react';
import { supabase, errMsg } from '../lib/supabase';
import { useMasters, type Masters } from '../lib/useMasters';
import PhotoPick from '../components/PhotoPick';
import { matchPhotosByName, uploadCatalogPhoto } from '../lib/image';
import { parseCsv, parseQty } from '../lib/csv';
import { readTableFile } from '../lib/xlsx';
import { logAction } from '../lib/audit';
import { saveBatchNames, uniqueNames } from '../lib/batchNames';
import { saveSupplierDetail, saveDesignInfo } from '../lib/masterStore';
import { GST_OPTIONS, GST_REGEX, type OpeningBulkRow } from '../lib/constants';
import { downloadCsv, num, r3, money, todayStr } from '../lib/helpers';
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
  baleNo: '',
  baleList: [] as string[],
  supplierMobile: '',
  supplierAddress: '',
  supplierState: '',
  supplierEmail: '',
  supplierContact: ''
});

const emptyItem = (): any => ({
  itemDetails: '', quality: '', width: '', meterFold: '', itemRate: '', gstPercentage: '5',
  designNo: '', color: '', imageFile: null as File | null, totalMeter: '', totalPieces: '',
  sizeDetails: '', damage: '', shortage: '', returnEntry: '', returnBooking: '', discount: ''
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
    const disc = Math.min(100, Math.max(0, num(it.discount)));
    const base = qty * rate;
    const discAmt = (base * disc) / 100;
    const taxable = base - discAmt;
    const total = taxable + (taxable * gst) / 100;
    const netRate = rate * (1 - disc / 100);
    const net = Math.max(0, qty - num(it.damage) - num(it.shortage) - num(it.returnEntry));
    return { qty, rate, gst, total, net, disc, discAmt, netRate };
  };

  const grandTotal = items.reduce((sum, it) => sum + calc(it).total, 0);
  const totalDiscount = items.reduce((sum, it) => sum + calc(it).discAmt, 0);

  // ----- Supplier -----
  const handleSupplierChange = (name: string) => {
    clearDoubt('supplierName');
    const known = masters.suppliers.find(s => s.name === name);
    const det = masters.supplierDetails[name.trim().toLowerCase()];
    const cleared = name === '';
    setBill((prev: any) => ({
      ...prev,
      supplierName: name,
      supplierPlace: det?.place || (known ? known.place : cleared ? '' : prev.supplierPlace),
      supplierGst: det?.gst || (known ? known.gst : cleared ? '' : prev.supplierGst),
      supplierMobile: det ? det.mobile || '' : cleared || known ? '' : prev.supplierMobile,
      supplierAddress: det ? det.address || '' : cleared || known ? '' : prev.supplierAddress,
      supplierState: det ? det.state || '' : cleared || known ? '' : prev.supplierState,
      supplierEmail: det ? det.email || '' : cleared || known ? '' : prev.supplierEmail,
      supplierContact: det ? det.contact || '' : cleared || known ? '' : prev.supplierContact
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

  const setBaleCount = (v: string) => {
    const n = Math.max(0, Math.min(200, Math.floor(num(v))));
    setBill((prev: any) => {
      const list: string[] = Array.from({ length: n }, (_, i) => prev.baleList[i] || '');
      return { ...prev, noOfBales: v, baleList: list };
    });
  };
  const setBaleAt = (i: number, v: string) => setBill((prev: any) => ({ ...prev, baleList: prev.baleList.map((b: string, j: number) => (j === i ? v : b)) }));

  const saveSupplierNow = async () => {
    const name = String(bill.supplierName).trim();
    if (!name) return notify('முதலில் Supplier பெயர் தேர்வு செய்யவும்.', 'err');
    try {
      await saveSupplierDetail({ name, place: bill.supplierPlace, address: bill.supplierAddress, state: bill.supplierState, gst: String(bill.supplierGst).toUpperCase(), mobile: bill.supplierMobile, email: bill.supplierEmail, contact: bill.supplierContact });
      notify(`✅ "${name}" விவரங்கள் சேமிக்கப்பட்டன. இனி தேர்ந்தால் தானாக நிரம்பும்.`);
      await masters.reload();
    } catch (err: any) {
      notify('Supplier சேமிக்க முடியவில்லை: ' + errMsg(err), 'err');
    }
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

    // near-duplicate Design names (e.g. "D 101" vs "D-101") make the stock report split – ask first
    const norm = (x: string) => x.toLowerCase().replace(/[\s\-_./]/g, '');
    for (const it of used) {
      const dn = String(it.designNo || '').trim();
      if (!dn || masters.designs.includes(dn)) continue;
      const twin = masters.designs.find(x => norm(x) === norm(dn));
      if (twin && !window.confirm(`Design "${dn}" ஏற்கனவே "${twin}" என்ற பெயரில் உள்ளது. அதையே பயன்படுத்தவா?\n\nOK = "${twin}" பயன்படுத்து • Cancel = "${dn}" புதிய Design`)) continue;
      if (twin) it.designNo = twin;
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
        bale_no: [...(bill.baleList as string[]).map(x => x.trim()).filter(Boolean), bill.baleNo ? String(bill.baleNo).trim() : ''].filter(Boolean).join(', '),
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
          rate_per_meter: isJobWork ? 0 : Math.round(c.netRate * 10000) / 10000, // rate after discount
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

      try {
        await saveSupplierDetail({ name: supplierName, place: bill.supplierPlace, address: bill.supplierAddress, state: bill.supplierState, gst: gstNo, mobile: bill.supplierMobile, email: bill.supplierEmail, contact: bill.supplierContact });
      } catch { warn += ' ⚠️ Supplier விவரம் சேமிக்கப்படவில்லை.'; }

      logAction(`Purchase GRN சேமிப்பு: ${supplierName} / Bill ${bill.billNo} (${items.length} Item)`);
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
        <div><label style={styles.label}>Mobile</label><input type="text" name="supplierMobile" value={bill.supplierMobile} onChange={handleBillChange} placeholder="Optional" style={styles.input} /></div>
        <div><label style={styles.label}>State</label><input type="text" name="supplierState" value={bill.supplierState} onChange={handleBillChange} placeholder="Gujarat / Tamil Nadu..." style={styles.input} /></div>
        <div><label style={styles.label}>Email</label><input type="text" name="supplierEmail" value={bill.supplierEmail} onChange={handleBillChange} placeholder="Optional" style={styles.input} /></div>
        <div><label style={styles.label}>Contact Person</label><input type="text" name="supplierContact" value={bill.supplierContact} onChange={handleBillChange} placeholder="Optional" style={styles.input} /></div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={styles.label}>Address</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input type="text" name="supplierAddress" value={bill.supplierAddress} onChange={handleBillChange} placeholder="Full address (optional)" style={{ ...styles.input, flex: '1 1 320px' }} />
            <button type="button" onClick={saveSupplierNow} style={{ ...styles.secondaryBtn, whiteSpace: 'nowrap' }}>💾 Supplier விவரம் சேமி</button>
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>ஒரு முறை நிரப்பிச் சேமித்தால், அடுத்த முறை Supplier-ஐத் தேர்ந்ததும் எல்லா விவரமும் தானாக நிரம்பும் (Bill Save செய்யும்போதும் சேமிக்கப்படும்).</div>
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
        <div><label style={styles.label}>No. of Bales</label><input type="number" min="0" name="noOfBales" value={bill.noOfBales} onChange={e => setBaleCount(e.target.value)} style={styles.input} /></div>
        <div><label style={styles.label}>LR No.</label><input type="text" name="lrNo" value={bill.lrNo} onChange={handleBillChange} style={styles.input} /></div>
        {(bill.baleList as string[]).length === 0 && <div><label style={styles.label}>Bale No(s).</label><input type="text" name="baleNo" value={bill.baleNo} placeholder="Ex: B-101" onChange={handleBillChange} style={styles.input} /></div>}
      </div>
      {(bill.baleList as string[]).length > 0 && (
        <div style={{ marginBottom: '22px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#0f172a', marginBottom: '8px' }}>📦 Bale எண்கள் (ஒன்றன்கீழ் ஒன்றாக நிரப்பவும்)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '360px' }}>
            {(bill.baleList as string[]).map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '64px', fontSize: '12px', color: '#475569', fontWeight: 'bold' }}>Bale {i + 1}</span>
                <input type="text" value={b} onChange={e => setBaleAt(i, e.target.value)} placeholder="Bale No." style={styles.input} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', paddingBottom: '8px', borderBottom: '2px solid #f1f5f9', flexWrap: 'wrap', gap: '10px' }}>
        <h4 style={{ color: '#0f172a', margin: 0 }}>B) Inventory Breakdown (Damage / Short / Return கழிக்கப்படும்)</h4>
        <button type="button" onClick={handleAddColorVariant} style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd', padding: '6px 12px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>
          + Same Item, Another Color
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
        {items.map((item, idx) => {
          const c = calc(item);
          const first = idx === 0;
          const lastRate = num(masters.itemSpecs[String(item.itemDetails || '').trim()]?.rate_per_meter);
          const rise = !isJobWork && lastRate > 0 && c.netRate > lastRate + 0.0001;
          const fld = (label: string, node: any, extra: any = {}) => (
            <div style={extra}><label style={{ ...styles.label, fontSize: '12px' }}>{label}</label>{node}</div>
          );
          return (
            <div key={idx} style={{ border: '1px solid #cbd5e1', borderRadius: '10px', padding: '14px', background: idx % 2 === 0 ? '#f8fafc' : 'white' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <strong style={{ color: '#0f172a' }}>Item {idx + 1}</strong>
                {items.length > 1 && (
                  <button type="button" title="Remove" onClick={() => setItems(items.filter((_, i) => i !== idx))} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontWeight: 'bold' }}>✕ நீக்கு</button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
                {fld('Item *', <SelectNew value={item.itemDetails} onChange={v => handleItemName(idx, v)} options={masters.itemNames} placeholder="-- Item --" newLabel="+ New Item" style={first ? doubtStyle('itemDetails', styles.input) : styles.input} />)}
                {!isRMG && fld('Quality', tblSelect(item.quality, v => handleItemChange(idx, 'quality', v), masters.qualities, '-- Quality --', '+ New', styles.input))}
                {!isRMG && fld('Width', tblSelect(item.width, v => handleItemChange(idx, 'width', v), masters.widths, '-- Width --', '+ New', styles.input))}
                {!isRMG && fld('Fold', tblSelect(item.meterFold, v => handleItemChange(idx, 'meterFold', v), masters.folds, '-- Fold --', '+ New', styles.input))}
                {isRMG && fld('Size', tblSelect(item.sizeDetails, v => handleItemChange(idx, 'sizeDetails', v), masters.sizes, '-- Size --', '+ New', styles.input))}
                {fld('Design No', <SelectNew value={item.designNo} onChange={v => handleItemChange(idx, 'designNo', v)} options={masters.designs} placeholder="-- Design --" newLabel="+ New Design" style={first ? doubtStyle('designNo', styles.input) : styles.input} />)}
                {fld('Color', tblSelect(item.color, v => handleItemChange(idx, 'color', v), masters.colors, '-- Color --', '+ New Color', styles.input))}
                {fld('Image (Opt)', (
                  <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                    <input type="file" accept="image/*" onChange={e => updateItem(idx, { imageFile: e.target.files ? e.target.files[0] : null })} style={{ width: '150px', fontSize: '11px' }} />
                    {item.imageFile && <button type="button" onClick={() => setPreview(URL.createObjectURL(item.imageFile))} style={{ background: '#e0f2fe', color: '#0369a1', border: 'none', padding: '3px 6px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>Preview</button>}
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px', marginTop: '10px', alignItems: 'end' }}>
                {!isJobWork && fld('Rate', (
                  <>
                    <input type="number" min="0" step="any" value={item.itemRate} onChange={e => handleItemChange(idx, 'itemRate', e.target.value)} style={{ ...(first ? doubtStyle('itemRate', styles.input) : styles.input), ...(rise ? { borderColor: '#f59e0b', background: '#fffbeb' } : {}) }} />
                    {rise && <div style={{ fontSize: '10px', color: '#b45309', fontWeight: 'bold', marginTop: '2px' }}>⬆ கடந்த முறை ₹{lastRate}</div>}
                  </>
                ))}
                {!isJobWork && fld('Discount %', <input type="number" min="0" max="100" step="any" placeholder="0" value={item.discount} onChange={e => handleItemChange(idx, 'discount', e.target.value)} style={styles.input} />)}
                {!isJobWork && fld('GST %', (
                  <select value={item.gstPercentage} onChange={e => handleItemChange(idx, 'gstPercentage', e.target.value)} style={styles.input}>
                    {GST_OPTIONS.map(g => <option key={g} value={g}>{g}%</option>)}
                  </select>
                ))}
                {fld(isRMG ? 'Total Pcs *' : 'Total Mtr *', (
                  <input type="number" min="0" step="any" value={isRMG ? item.totalPieces : item.totalMeter}
                    onChange={e => handleItemChange(idx, isRMG ? 'totalPieces' : 'totalMeter', e.target.value)}
                    style={first && doubtFields.totalMeter ? doubtStyle('totalMeter', { ...styles.input, border: '1px solid #f59e0b' }) : { ...styles.input, border: '1px solid #3b82f6', background: '#eff6ff' }} />
                ))}
                {fld('Damage', <input type="number" min="0" step="any" value={item.damage} onChange={e => handleItemChange(idx, 'damage', e.target.value)} style={styles.input} />)}
                {fld('Short', <input type="number" min="0" step="any" value={item.shortage} onChange={e => handleItemChange(idx, 'shortage', e.target.value)} style={styles.input} />)}
                {fld('Return', <input type="number" min="0" step="any" placeholder="Qty" value={item.returnEntry} onChange={e => handleItemChange(idx, 'returnEntry', e.target.value)} style={styles.input} />)}
              </div>
              <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', marginTop: '10px', fontSize: '13px', alignItems: 'center' }}>
                {!isJobWork && c.discAmt > 0 && <span style={{ color: '#b45309' }}>Discount: <b>− ₹ {money(c.discAmt)}</b> (Net Rate ₹{r3(c.netRate)})</span>}
                {!isJobWork && <span>Total Value: <b style={{ color: '#334155' }}>₹ {money(c.total)}</b></span>}
                <span style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '3px 10px' }}>Net Stock: <b style={{ color: c.net > 0 ? '#059669' : '#ef4444' }}>{r3(c.net)}</b></span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '12px' }}>
        <button type="button" onClick={() => setItems([...items, emptyItem()])} style={styles.secondaryBtn}>+ Add Row</button>
        {!isJobWork && <div style={{ fontSize: '16px', color: '#0f172a' }}>{totalDiscount > 0 && <span style={{ fontSize: '13px', color: '#b45309', marginRight: '12px' }}>Discount − ₹ {money(totalDiscount)}</span>}Grand Total (with GST): <strong style={{ color: '#dc2626' }}>₹ {money(grandTotal)}</strong></div>}
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
    stage, model: '', designNo: '', color: '', qty: '', rate: '', showroom: '', batchCode: '', localName: '', size: '', fit: '', material: '', color2: ''
  });
  const [rows, setRows] = useState<OpeningBulkRow[]>([makeEmptyRow()]);
  const [saving, setSaving] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const change = (idx: number, field: keyof OpeningBulkRow, val: string) =>
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, [field]: val } : r)));

  const duplicate = (idx: number) =>
    setRows(prev => {
      const next = [...prev];
      next.splice(idx + 1, 0, { ...prev[idx], color: '', color2: '', qty: '', batchCode: '', localName: '', photo: null });
      return next;
    });

  const remove = (idx: number) => setRows(prev => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));

  const rnd = () => Math.floor(1000 + Math.random() * 9000);

  const stageFromText = (t: string): OpeningBulkRow['stage'] | '' => {
    const x = t.toLowerCase().replace(/[^a-z\u0b80-\u0bff]+/g, '');
    if (!x) return '';
    if (x.includes('trading')) return 'TRADING';
    if (x.includes('endbit')) return 'END_BIT';
    if (x.includes('damage') || x.includes('second')) return 'DAMAGE';
    if (x.includes('fabric') || x.includes('துணி')) return 'FABRIC';
    if (x.includes('cutpart')) return 'CUTPARTS';
    if (x.includes('wip') || x.includes('process') || x.includes('stitch')) return 'WIP';
    if (x.includes('showroom')) return 'READY_SHOWROOM';
    if (x.includes('godown') || x.includes('ready')) return 'READY_GODOWN';
    return '';
  };

  const bulkPhotos = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const isReady = (r: OpeningBulkRow) => ['READY_GODOWN', 'READY_SHOWROOM', 'TRADING'].includes(r.stage);
    const targets = rows.map((r, i) => ({ i, model: r.model.trim(), design: r.designNo.trim() })).filter(t => isReady(rows[t.i]) && t.model);
    const { matched, unmatched } = matchPhotosByName(Array.from(list), targets);
    const photoFor = new Map<number, File>();
    matched.forEach(m => m.targets.forEach(t => photoFor.set(t.i, m.file)));
    setRows(prev => prev.map((r, i) => (photoFor.has(i) ? { ...r, photo: photoFor.get(i)! } : r)));
    notify(`📷 ${matched.length} Photo பொருந்தின (${photoFor.size} வரிகளுக்கு).${unmatched.length ? ` பொருந்தாதவை: ${unmatched.slice(0, 5).join(', ')}` : ''} Design எண் இல்லாத வரிகளுக்கு Photo சேர்க்க முடியாது.`, unmatched.length ? 'warn' : 'ok');
  };

  const downloadTemplate = () => {
    downloadCsv('pommys-opening-stock-template.csv', [
      ['Stage', 'Model', 'Design', 'Color', 'Color 2', 'Material', 'Fit', 'Size', 'Showroom', 'Qty', 'Rate/Price', 'Batch', 'Local Name'],
      ['Ready Godown', 'Nighty', 'D-101', 'Red', 'White', 'Cotton', 'Regular', 'M', '', 120, 450, '', ''],
      ['Ready Godown', 'Nighty', 'D-102', 'Assorted', '', 'Cotton', 'Loose', 'L', '', 80, 450, '', ''],
      ['Ready Showroom', 'Nighty', 'D-101', 'Blue', '', 'Cotton', 'Regular', 'XL', 'Main Showroom', 40, 450, '', ''],
      ['Fabric', 'Cotton Print', 'D-55', 'Green', '', '', '', '', '', 250.5, 95, '', ''],
      ['WIP', 'Kurti', 'K-9', 'Black', '', '', '', '', '', 60, '', '', ''],
      ['End Bit', 'Cotton Print', 'D-55', 'Green', '', '', '', '', '', 3.5, '', '', ''],
      ['Damage', 'Nighty', 'D-101', 'Red', '', '', '', '', '', 4, '', '', '']
    ]);
    notify('Template download ஆனது. Stage: Fabric / Cutparts / WIP / Ready Godown / Ready Showroom / Trading / End Bit / Damage.', 'ok');
  };

  const importFile = async (f: File | null) => {
    if (!f) return;
    try {
      const t = await readTableFile(f, parseCsv);
      if (t.length < 2) return notify('கோப்பில் தரவு இல்லை.', 'err');
      const hi = t.findIndex(r => r.some(c => /qty|quantity|pcs|meter/i.test(c)) && r.some(c => /model|item|variety|design|stage|type/i.test(c)));
      const header = t[hi >= 0 ? hi : 0].map(c => c.toLowerCase());
      const find = (re: RegExp) => header.findIndex(c => re.test(c));
      const ci = {
        stage: find(/stage|type|stock/), model: find(/model|item|variety|name/), design: find(/design/), color: find(/^colou?r$|^colou?r\s*1/), color2: find(/colou?r\s*2|second/), material: find(/material|fabric type|quality/), fit: find(/^fit/), size: find(/^size/),
        showroom: find(/showroom|shop|branch/), qty: find(/qty|quantity|pcs|piece|meter|mtr/), localName: find(/local|nick|short name/), rate: find(/rate|price/), batch: find(/batch|code|ref/)
      };
      if (ci.model < 0 || ci.qty < 0) return notify('Model மற்றும் Qty column கோப்பில் தேவை. Template-ஐப் பாருங்கள்.', 'err');
      const get = (r: string[], i: number) => (i >= 0 ? (r[i] || '').trim() : '');
      const known = masters.showroomNames;
      const imported: OpeningBulkRow[] = [];
      let skipped = 0, noShowroom = 0;
      t.slice((hi >= 0 ? hi : 0) + 1).forEach(r => {
        const qty = parseQty(get(r, ci.qty));
        const model = get(r, ci.model);
        if (!model || !Number.isFinite(qty) || qty <= 0 || /^(grand\s*)?total/i.test(model)) return;
        const stage = ci.stage >= 0 ? stageFromText(get(r, ci.stage)) : 'READY_GODOWN';
        if (!stage) { skipped++; return; }
        let showroom = get(r, ci.showroom);
        if (showroom) {
          const n = showroom.toLowerCase().replace(/[^a-z0-9]+/g, '');
          const hit = known.find(k => k.toLowerCase().replace(/[^a-z0-9]+/g, '') === n);
          if (hit) showroom = hit; else { showroom = ''; noShowroom++; }
        }
        imported.push({ stage, model, designNo: get(r, ci.design), color: get(r, ci.color), color2: get(r, ci.color2), material: get(r, ci.material), fit: get(r, ci.fit), size: get(r, ci.size), qty: String(qty), rate: get(r, ci.rate), showroom, batchCode: get(r, ci.batch), localName: get(r, ci.localName) });
      });
      if (imported.length === 0) return notify('இறக்குமதி செய்யக்கூடிய வரிகள் இல்லை (Stage பெயர்கள் சரியா?).', 'err');
      setRows(prev => [...prev.filter(r => num(r.qty) > 0 || r.model.trim()), ...imported]);
      setFormKey(k => k + 1);
      notify(`✅ ${imported.length} வரிகள் ஏற்றப்பட்டன. கீழே சரிபார்த்து (Photo சேர்த்து) Save செய்யவும்.${skipped ? ` ${skipped} வரி Stage புரியாததால் தவிர்க்கப்பட்டன.` : ''}${noShowroom ? ` ${noShowroom} வரியில் Showroom பொருந்தவில்லை; தேர்வு செய்யவும்.` : ''}`, skipped || noShowroom ? 'warn' : 'ok');
    } catch (err: any) {
      notify(errMsg(err), 'err');
    }
  };

  const insertRow = async (row: OpeningBulkRow): Promise<string> => {
    const numQty = num(row.qty);
    const rateVal = num(row.rate);
    const modelText = row.model.trim() || 'Item';
    const designText = row.designNo.trim() || '-';
    const colorText = [row.color.trim(), (row.color2 || '').trim()].filter(Boolean).filter((c, i, a) => a.indexOf(c) === i).join(', ') || '-';
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
        design_no: designText, color: colorText, model_name: modelText, size_details: row.size?.trim() || 'Opening Stock',
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
    return batchText;
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const valid = rows.filter(r => num(r.qty) > 0);
    if (valid.length === 0) return notify('குறைந்தது ஒரு வரியில் Qty (> 0) உள்ளிடவும்.', 'err');
    const noModel = valid.find(r => !r.model.trim());
    if (noModel) return notify('எல்லா வரிகளிலும் Model / Variety தேர்வு செய்யவும்.', 'err');

    setSaving(true);
    const failed: OpeningBulkRow[] = [];
    let saved = 0, photos = 0, photoFail = 0;
    const localNames: Record<string, string> = {};
    let firstError = '';
    for (const row of valid) {
      try {
        const usedBatch = await insertRow(row);
        if (row.localName?.trim()) localNames[usedBatch] = row.localName.trim();
        saved++;
        if (row.photo && ['READY_GODOWN', 'READY_SHOWROOM', 'TRADING'].includes(row.stage)) {
          try { await uploadCatalogPhoto(row.stage === 'TRADING' ? `Trading: ${row.model.trim()}` : row.model.trim(), row.designNo.trim() || '-', row.photo); photos++; } catch { photoFail++; }
        }
      } catch (err: any) {
        failed.push(row);
        if (!firstError) firstError = errMsg(err);
      }
    }
    try {
      const readyOnes = valid.filter(r => !failed.includes(r) && ['READY_GODOWN', 'READY_SHOWROOM', 'TRADING'].includes(r.stage) && (r.size || r.fit || r.material || num(r.rate) > 0));
      if (readyOnes.length) await saveDesignInfo(readyOnes.map(r => ({ model: r.stage === 'TRADING' ? `Trading: ${r.model.trim()}` : r.model.trim(), design: r.designNo.trim() || '-', material: r.material, fit: r.fit, sizes: r.size, price: num(r.rate) })));
    } catch { /* details are optional */ }
    try { await saveBatchNames(localNames); } catch { /* optional */ }
    if (saved > 0) logAction(`Opening Stock சேமிப்பு: ${saved} வரி`);
    setSaving(false);

    if (failed.length === 0) {
      notify(`✅ ${saved} Stock வரி(கள்) சேமிக்கப்பட்டன!${photos ? ` 📷 ${photos} Photo.` : ''}${photoFail ? ` ⚠️ ${photoFail} Photo ஏறவில்லை (Ready Stock பக்கத்தில் மீண்டும் சேர்க்கலாம்).` : ''}`);
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
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <label style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #6ee7b7', padding: '7px 12px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>
            📊 Excel / CSV Upload
            <input type="file" accept=".xlsx,.csv,.txt,.tsv,text/csv" style={{ display: 'none' }} onChange={e => { importFile(e.target.files && e.target.files[0] ? e.target.files[0] : null); e.target.value = ''; }} />
          </label>
          <label style={{ background: '#fdf4ff', color: '#a21caf', border: '1px solid #e9a8f5', padding: '7px 12px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>
            📷 பல Photo ஒரே நேரத்தில்
            <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { bulkPhotos(e.target.files); e.target.value = ''; }} />
          </label>
          <button type="button" onClick={downloadTemplate} style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', padding: '7px 12px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>⬇️ Template</button>
        <button type="button" onClick={() => setRows(prev => [...prev, makeEmptyRow()])} style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd', padding: '7px 12px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>
          + Add Row
        </button>
        </div>
      </div>

      <form onSubmit={handleSave}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '14px' }}>
          {rows.map((row, idx) => {
            const isTrading = row.stage === 'TRADING';
            const needsShowroom = row.stage === 'READY_SHOWROOM' || isTrading;
            const isReady = ['READY_GODOWN', 'READY_SHOWROOM', 'TRADING'].includes(row.stage);
            const isFab = row.stage === 'FABRIC' || row.stage === 'END_BIT';
            const f = (label: string, node: any) => <div><label style={{ ...styles.label, fontSize: '12px' }}>{label}</label>{node}</div>;
            return (
              <div key={idx} style={{ border: '1px solid #cbd5e1', borderRadius: '10px', padding: '12px', background: idx % 2 === 0 ? '#f8fafc' : 'white' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '8px', flexWrap: 'wrap' }}>
                  <strong style={{ color: '#0f172a' }}>வரி {idx + 1}</strong>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button type="button" onClick={() => duplicate(idx)} title="Duplicate row" style={{ background: '#e0f2fe', color: '#0369a1', border: 'none', borderRadius: '4px', padding: '4px 9px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>+Copy</button>
                    {rows.length > 1 && <button type="button" onClick={() => remove(idx)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', padding: '4px 9px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>✕ நீக்கு</button>}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
                  {f('Stock Type / Stage *', (
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
                  ))}
                  {f('Model / Variety *', <SelectNew value={row.model} onChange={v => change(idx, 'model', v)} options={isFab ? masters.itemNames : masters.models} placeholder="-- Select --" newLabel="+ New" style={styles.tblInput} />)}
                  {f('Design (Opt)', <SelectNew value={row.designNo} onChange={v => change(idx, 'designNo', v)} options={masters.designs} placeholder="-- Design --" newLabel="+ New Design" style={styles.tblInput} />)}
                  {f('Color (Assorted தேர்வு உண்டு)', <SelectNew value={row.color} onChange={v => change(idx, 'color', v)} options={masters.colors} placeholder="-- Color --" newLabel="+ New Color" style={styles.tblInput} />)}
                  {isReady && f('Color 2 (Opt)', <SelectNew value={row.color2 || ''} onChange={v => change(idx, 'color2', v)} options={masters.colors} placeholder="-- 2nd Color --" newLabel="+ New Color" style={styles.tblInput} />)}
                  {isReady && f('Material', <SelectNew value={row.material || ''} onChange={v => change(idx, 'material', v)} options={masters.materials} placeholder="-- Material --" newLabel="+ New" style={styles.tblInput} />)}
                  {isReady && f('Fit', <SelectNew value={row.fit || ''} onChange={v => change(idx, 'fit', v)} options={masters.fits} placeholder="-- Fit --" newLabel="+ New" style={styles.tblInput} />)}
                  {isReady && f('Size', <SelectNew value={row.size || ''} onChange={v => change(idx, 'size', v)} options={masters.sizes} placeholder="-- Size --" newLabel="+ New Size" style={styles.tblInput} />)}
                  {needsShowroom && f('Showroom', (
                    <select value={row.showroom} onChange={e => change(idx, 'showroom', e.target.value)} style={styles.tblInput}>
                      <option value="">{isTrading ? 'Central Godown' : '-- Select Showroom --'}</option>
                      {masters.showroomNames.map(sr => <option key={sr} value={sr}>{sr}</option>)}
                    </select>
                  ))}
                  {f(isReady ? 'Selling Price ₹ (Opt)' : 'Rate (Opt)', <input type="number" min="0" step="any" placeholder="Optional" value={row.rate} onChange={e => change(idx, 'rate', e.target.value)} style={styles.tblInput} />)}
                  {isReady && f('Photo', <PhotoPick file={row.photo || null} onChange={ph => setRows(prev => prev.map((r, i) => (i === idx ? { ...r, photo: ph } : r)))} label="📷" size={34} />)}
                  {isReady && f('Local Name (Opt)', <SelectNew value={row.localName || ''} onChange={v => change(idx, 'localName', v)} options={masters.localNames} placeholder="-- Local Name --" newLabel="+ New Name" style={styles.tblInput} />)}
                  {f('Qty (Mtr / Pcs) *', <input type="number" min="0" step="any" placeholder="Qty *" value={row.qty} onChange={e => change(idx, 'qty', e.target.value)} style={{ ...styles.tblInput, borderColor: '#059669', background: '#f0fdf4' }} />)}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <button type="button" onClick={() => setRows(prev => [...prev, makeEmptyRow()])} style={styles.secondaryBtn}>+ Add Another Variety / Row</button>
          <button type="submit" disabled={saving} style={styles.successBtn}>{saving ? 'Saving...' : `💾 Save All (${rows.length} Row(s))`}</button>
        </div>
      </form>
    </div>
  );
}
