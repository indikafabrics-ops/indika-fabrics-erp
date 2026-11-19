import { useState, useEffect, type FormEvent, type ChangeEvent } from 'react';
import { createClient } from '@supabase/supabase-js';
import './App.css';

const supabaseUrl = 'https://chaodxrbgiqotdxxvjcj.supabase.co';
const supabaseKey = 'sb_publishable_RMyuFaMfVoiWybffGparzw_ePnF0LaI';
const supabase = createClient(supabaseUrl, supabaseKey);

const initialSuppliers = [
  { id: 1, name: 'TexFab India', address: 'Surat, Gujarat - 395002', gst: '24AAACC1206D1Z1' },
  { id: 2, name: 'Sri Ram Textiles', address: 'Tiruppur, TN - 641604', gst: '33AABCS1234H1Z5' }
];

const POMMYS_LOGO_URL = "https://chaodxrbgiqotdxxvjcj.supabase.co/storage/v1/object/public/assets/Pommys%20Logo%20Jepeg.jpg";

export default function App() {
  const [user, setUser] = useState<any>(null);
  if (!user) return <LoginScreen onLogin={setUser} />;
  return <Dashboard user={user} onLogout={() => setUser(null)} />;
}

// 1. Corporate Login
function LoginScreen({ onLogin }: { onLogin: (user: any) => void }) {
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { data, error: dbError } = await supabase
      .from('pommys_users')
      .select('*')
      .eq('mobile_number', mobile)
      .eq('password', password)
      .single();
    setLoading(false);
    if (dbError || !data) setError('Invalid Credentials!');
    else onLogin(data);
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f1f5f9', fontFamily: '"Segoe UI", Tahoma, sans-serif' }}>
      <div style={{ background: 'white', padding: '50px 40px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', width: '380px', textAlign: 'center' }}>
        <img
          src={POMMYS_LOGO_URL}
          alt="Pommys Logo"
          style={{ height: '70px', marginBottom: '20px', objectFit: 'contain' }}
          onError={(e) => {
            const img = e.currentTarget;
            img.onerror = null;
            img.src = "https://via.placeholder.com/180x60/dc2626/ffffff?text=POMMYS";
          }}
        />
        <p style={{ color: '#64748b', margin: '0 0 30px 0', fontSize: '14px', fontWeight: 'bold' }}>Corporate ERP Portal</p>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <input type="text" placeholder="User ID / Mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} style={styles.input} required />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={styles.input} required />
          {error && <p style={{ color: '#ef4444', fontSize: '13px', margin: 0 }}>{error}</p>}
          <button type="submit" disabled={loading} style={styles.primaryBtn}>{loading ? 'Authenticating...' : 'Secure Login'}</button>
        </form>
      </div>
    </div>
  );
}

// 2. Dashboard Layout
function Dashboard({ user, onLogout }: { user: any; onLogout: () => void }) {
  const [activeMenu, setActiveMenu] = useState('grn');
  return (
    <div style={{ display: 'flex', height: '100vh', background: '#f8fafc', fontFamily: '"Segoe UI", Tahoma, sans-serif' }}>
      <div style={{ width: '260px', background: '#0f172a', color: 'white', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #1e293b', textAlign: 'center', background: 'white' }}>
          <img
            src={POMMYS_LOGO_URL}
            alt="Pommys Logo"
            style={{ height: '45px', objectFit: 'contain' }}
            onError={(e) => {
              const img = e.currentTarget;
              img.onerror = null;
              img.src = "https://via.placeholder.com/180x60/dc2626/ffffff?text=POMMYS";
            }}
          />
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px', fontWeight: 'bold' }}>{user.full_name} ({user.role})</div>
        </div>
        <div style={{ flex: 1, padding: '15px 0', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <div style={styles.menuItem(activeMenu === 'grn')} onClick={() => setActiveMenu('grn')}>📥 Purchase & GRN</div>
          <div style={styles.menuItem(activeMenu === 'cutting')} onClick={() => setActiveMenu('cutting')}>✂️ Fabric Issue & Cutting</div>
          <div style={styles.menuItem(activeMenu === 'production')} onClick={() => setActiveMenu('production')}>🏭 Production WIP</div>
          <div style={styles.menuItem(activeMenu === 'reports')} onClick={() => setActiveMenu('reports')}>📊 Master Reports & History</div>
        </div>
        <div style={{ padding: '20px', borderTop: '1px solid #1e293b' }}><button onClick={onLogout} style={styles.logoutBtn}>Logout</button></div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ background: 'white', padding: '15px 25px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: '#334155', fontSize: '18px' }}>
            {activeMenu === 'grn' && 'Goods Receipt Note (Master GRN)'}
            {activeMenu === 'cutting' && 'Fabric Issue & Cutting Module'}
            {activeMenu === 'production' && 'Live Production Tracking (WIP)'}
            {activeMenu === 'reports' && 'Godown, Ready Stock & Supplier History Reports'}
          </h3>
        </div>
        <div style={{ flex: 1, padding: '25px', overflowY: 'auto' }}>
          {activeMenu === 'grn' && <GRNEntryForm />}
          {activeMenu === 'cutting' && <CuttingEntryModule />}
          {activeMenu === 'production' && <ProductionTracking />}
          {activeMenu === 'reports' && <ReportsModule />}
        </div>
      </div>
    </div>
  );
}

// 3. GRN Master Form (Fixed Add New Party Binding)
function GRNEntryForm() {
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const initialBillState = { inwardType: 'OWN_FABRIC', supplierName: '', supplierAddress: '', supplierGst: '', isNewSupplier: false, billNo: '', billDate: '', noOfBales: '', lrNo: '', lrDate: '', baleNo: '' };
  const initialItemState: any = { itemDetails: '', quality: '', width: '', meterFold: '', itemRate: '', gstPercentage: '5', designNo: '', color: '', imageFile: null as File | null, totalMeter: '', totalPieces: '', sizeDetails: '', damage: '', shortage: '', returnEntry: '', returnBooking: '' };

  const [bill, setBill] = useState(initialBillState);
  const [items, setItems] = useState<any[]>([{ ...initialItemState }]);
  const [saving, setSaving] = useState(false);
  const [selectedImageModal, setSelectedImageModal] = useState<string | null>(null);

  const isRMG = bill.inwardType === 'RMG';
  const isJobWork = bill.inwardType === 'JOB_WORK';

  const handleSupplierSelect = (e: ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'NEW') {
      setBill({ ...bill, supplierName: '', supplierAddress: '', supplierGst: '', isNewSupplier: true });
    } else if (val !== '') {
      const selected = suppliers.find(s => s.id === parseInt(val, 10));
      if (selected) {
        setBill({ ...bill, supplierName: selected.name, supplierAddress: selected.address, supplierGst: selected.gst, isNewSupplier: false });
      }
    } else {
      setBill({ ...bill, supplierName: '', supplierAddress: '', supplierGst: '', isNewSupplier: false });
    }
  };

  const handleBillChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setBill({ ...bill, [e.target.name]: e.target.value });
  const handleItemChange = (idx: number, field: string, val: any) => {
    const newItems = [...items];
    newItems[idx][field] = val;
    setItems(newItems);
  };
  const handleFileChange = (idx: number, file: File | null) => {
    const newItems = [...items];
    newItems[idx].imageFile = file;
    setItems(newItems);
  };
  const handleAddItem = () => setItems([...items, { ...initialItemState }]);

  const grandTotal = isJobWork ? 0 : items.reduce((sum, item) => {
    const qty = isRMG ? (Number(item.totalPieces) || 0) : (Number(item.totalMeter) || 0);
    const rate = Number(item.itemRate) || 0;
    const gst = Number(item.gstPercentage) || 0;
    const baseVal = qty * rate;
    return sum + baseVal + (baseVal * gst / 100);
  }, 0);

  const handleSaveGRN = async () => {
    if (!bill.supplierName || !bill.billNo) { alert("Please enter Supplier Name and Bill No."); return; }
    setSaving(true);
    try {
      const { data: billData, error: billError } = await supabase.from('pommys_grn_bills').insert([{
        supplier_name: bill.supplierName, supplier_place: bill.supplierAddress, gst_number: bill.supplierGst,
        bill_no: bill.billNo, bill_date: bill.billDate || null, lr_no: bill.lrNo, lr_date: bill.lrDate || null,
        bale_no: bill.baleNo, no_of_bales: bill.noOfBales ? parseInt(bill.noOfBales, 10) : null
      }]).select().single();
      if (billError) throw billError;

      const stockItems = [];
      for (const item of items) {
        let imageUrl = '';
        if (item.imageFile) {
          const fileExt = item.imageFile.name.split('.').pop();
          const fileName = `${Date.now()}-${Math.random()}.${fileExt}`;
          const { error: uploadErr } = await supabase.storage.from('assets').upload(fileName, item.imageFile);
          if (!uploadErr) {
            const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(fileName);
            imageUrl = publicUrl;
          }
        }

        const qty = isRMG ? (Number(item.totalPieces) || 0) : (Number(item.totalMeter) || 0);
        const dmg = Number(item.damage) || 0;
        const short = Number(item.shortage) || 0;
        const ret = Number(item.returnEntry) || 0;
        const netQty = qty - dmg - short - ret;

        stockItems.push({
          bill_id: billData.id, item_name: item.itemDetails, quality: item.quality, fabric_width: item.width, meter_fold: item.meterFold,
          rate_per_meter: isJobWork ? 0 : (Number(item.itemRate) || 0), gst_percentage: Number(item.gstPercentage) || 0,
          design_no: item.designNo, color: item.color, image_url: imageUrl,
          total_meters: qty, damage_meters: dmg, shortage_meters: short, return_booking_details: item.returnBooking,
          net_meters: netQty, available_meters: netQty
        });
      }

      const { error: stockError } = await supabase.from('pommys_fabric_stock').insert(stockItems);
      if (stockError) throw stockError;

      if (bill.isNewSupplier) {
        setSuppliers([...suppliers, { id: suppliers.length + 1, name: bill.supplierName, address: bill.supplierAddress, gst: bill.supplierGst }]);
      }

      alert("🎉 GRN saved successfully! Items added to Godown Stock.");
      setBill(initialBillState);
      setItems([{ ...initialItemState }]);
    } catch (err: any) {
      alert("Error saving data: " + (err?.message || String(err)));
    }
    setSaving(false);
  };

  return (
    <div style={styles.card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', background: '#f0f9ff', border: '1px solid #bae6fd', padding: '15px 25px', borderRadius: '8px', marginBottom: '25px' }}>
        <h4 style={{ margin: 0, color: '#0369a1', fontSize: '16px' }}>Select Inward Type:</h4>
        <div style={{ display: 'flex', gap: '15px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontWeight: bill.inwardType === 'OWN_FABRIC' ? 'bold' : 'normal' }}><input type="radio" name="inwardType" value="OWN_FABRIC" checked={bill.inwardType === 'OWN_FABRIC'} onChange={handleBillChange} /> 🏭 Own Fabric</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontWeight: bill.inwardType === 'RMG' ? 'bold' : 'normal' }}><input type="radio" name="inwardType" value="RMG" checked={bill.inwardType === 'RMG'} onChange={handleBillChange} /> 👕 RMG (Ready-Made)</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontWeight: bill.inwardType === 'JOB_WORK' ? 'bold' : 'normal' }}><input type="radio" name="inwardType" value="JOB_WORK" checked={bill.inwardType === 'JOB_WORK'} onChange={handleBillChange} /> ✂️ Job Work</label>
        </div>
      </div>
      <h4 style={{ color: '#0f172a', marginBottom: '15px', paddingBottom: '10px', borderBottom: '2px solid #f1f5f9' }}>A) Supplier & Logistics Details</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '35px' }}>
        <div>
          <label style={styles.label}>{isJobWork ? 'Client / Supplier Name' : 'Supplier Name'}</label>
          <select value={bill.isNewSupplier ? 'NEW' : suppliers.find(s => s.name === bill.supplierName)?.id || ''} onChange={handleSupplierSelect} style={styles.input}>
            <option value="">-- Select Existing --</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value="NEW" style={{ fontWeight: 'bold', color: '#2563eb' }}>+ Add New Party</option>
          </select>
          {bill.isNewSupplier && <input type="text" name="supplierName" placeholder="Enter New Party Name" value={bill.supplierName} onChange={handleBillChange} style={{ ...styles.input, marginTop: '10px', borderColor: '#2563eb' }} />}
        </div>
        <div><label style={styles.label}>Address</label><input type="text" name="supplierAddress" value={bill.supplierAddress} onChange={handleBillChange} disabled={!bill.isNewSupplier && bill.supplierName !== ''} style={styles.input} /></div>
        <div><label style={styles.label}>GST Number</label><input type="text" name="supplierGst" value={bill.supplierGst} onChange={handleBillChange} disabled={!bill.isNewSupplier && bill.supplierName !== ''} style={styles.input} /></div>
        <div><label style={styles.label}>{isJobWork ? 'Challan No.' : 'Bill No.'}</label><input type="text" name="billNo" value={bill.billNo} onChange={handleBillChange} style={styles.input} /></div>
        <div><label style={styles.label}>{isJobWork ? 'Challan Date' : 'Bill Date'}</label><input type="date" name="billDate" value={bill.billDate} onChange={handleBillChange} style={styles.input} /></div>
        <div><label style={styles.label}>No. of Bales</label><input type="number" name="noOfBales" value={bill.noOfBales} onChange={handleBillChange} style={styles.input} /></div>
        <div><label style={styles.label}>LR No.</label><input type="text" name="lrNo" value={bill.lrNo} onChange={handleBillChange} style={styles.input} /></div>
        <div><label style={styles.label}>LR Date</label><input type="date" name="lrDate" value={bill.lrDate} onChange={handleBillChange} style={styles.input} /></div>
        <div><label style={styles.label}>Bale No(s).</label><input type="text" name="baleNo" value={bill.baleNo} placeholder="Ex: B-101" onChange={handleBillChange} style={styles.input} /></div>
      </div>
      <h4 style={{ color: '#0f172a', marginBottom: '15px', paddingBottom: '10px', borderBottom: '2px solid #f1f5f9' }}>B) Inventory Breakdown</h4>
      <div style={{ overflowX: 'auto', marginBottom: '20px', border: '1px solid #cbd5e1', borderRadius: '8px' }}>
        <table style={{ width: '100%', minWidth: '1500px', borderCollapse: 'collapse', textAlign: 'left', background: 'white' }}>
          <thead>
            <tr style={{ background: '#0f172a', color: 'white', textAlign: 'center' }}>
              <th colSpan={isRMG ? 2 : 4} style={styles.thGroup}>Fabric Specifications</th>
              <th colSpan={3} style={styles.thGroup}>Design Variant</th>
              <th colSpan={isJobWork ? 1 : 4} style={styles.thGroup}>{isJobWork ? 'Quantity' : 'Pricing & GST (₹)'}</th>
              <th colSpan={3} style={styles.thGroup}>Deductions</th>
              <th style={{ ...styles.thGroup, background: '#059669', borderRight: 'none' }}>Final</th>
            </tr>
            <tr style={{ background: '#1e293b', color: '#e2e8f0' }}>
              <th style={{ ...styles.thSub, width: '120px' }}>Item Details</th>
              {!isRMG && <th style={{ ...styles.thSub, width: '90px' }}>Quality</th>}
              {!isRMG && <th style={{ ...styles.thSub, width: '70px' }}>Width</th>}
              {!isRMG && <th style={{ ...styles.thSub, width: '70px' }}>Fold</th>}
              {isRMG && <th style={{ ...styles.thSub, width: '90px', color: '#38bdf8' }}>Size</th>}
              <th style={{ ...styles.thSub, width: '90px' }}>Design No</th>
              <th style={{ ...styles.thSub, width: '90px' }}>Color</th>
              <th style={{ ...styles.thSub, width: '150px' }}>Image Upload / View</th>
              {!isJobWork && <th style={{ ...styles.thSub, width: '80px', color: '#fbbf24' }}>Rate</th>}
              {!isJobWork && <th style={{ ...styles.thSub, width: '70px', color: '#38bdf8' }}>GST %</th>}
              {!isRMG && <th style={{ ...styles.thSub, width: '90px' }}>Total Mtr</th>}
              {isRMG && <th style={{ ...styles.thSub, width: '90px' }}>Total Pcs</th>}
              {!isJobWork && <th style={{ ...styles.thSub, width: '100px' }}>Total Val</th>}
              <th style={{ ...styles.thSub, width: '70px' }}>Dmg</th>
              <th style={{ ...styles.thSub, width: '70px' }}>Short</th>
              <th style={{ ...styles.thSub, width: '120px' }}>Return</th>
              <th style={{ ...styles.thSub, width: '90px', background: '#059669', color: 'white', borderRight: 'none' }}>Net Stock</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const qty = isRMG ? (Number(item.totalPieces) || 0) : (Number(item.totalMeter) || 0);
              const rate = isJobWork ? 0 : (Number(item.itemRate) || 0);
              const gst = isJobWork ? 0 : (Number(item.gstPercentage) || 0);
              const baseVal = qty * rate;
              const totalVal = baseVal + (baseVal * gst / 100);
              const netStock = qty - (Number(item.damage) || 0) - (Number(item.shortage) || 0) - (Number(item.returnEntry) || 0);
              return (
                <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#f8fafc' : 'white' }}>
                  <td style={styles.td}><input type="text" value={item.itemDetails} onChange={(e) => handleItemChange(idx, 'itemDetails', e.target.value)} style={styles.tblInput} /></td>
                  {!isRMG && <td style={styles.td}><input type="text" value={item.quality} onChange={(e) => handleItemChange(idx, 'quality', e.target.value)} style={styles.tblInput} /></td>}
                  {!isRMG && <td style={styles.td}><input type="text" value={item.width} onChange={(e) => handleItemChange(idx, 'width', e.target.value)} style={styles.tblInput} /></td>}
                  {!isRMG && <td style={styles.td}><input type="text" value={item.meterFold} onChange={(e) => handleItemChange(idx, 'meterFold', e.target.value)} style={styles.tblInput} /></td>}
                  {isRMG && <td style={styles.td}><input type="text" value={item.sizeDetails} onChange={(e) => handleItemChange(idx, 'sizeDetails', e.target.value)} style={styles.tblInput} /></td>}
                  <td style={styles.td}><input type="text" value={item.designNo} onChange={(e) => handleItemChange(idx, 'designNo', e.target.value)} style={styles.tblInput} /></td>
                  <td style={styles.td}><input type="text" value={item.color} onChange={(e) => handleItemChange(idx, 'color', e.target.value)} style={styles.tblInput} /></td>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                      <input type="file" accept="image/*" onChange={(e) => handleFileChange(idx, e.target.files ? e.target.files[0] : null)} style={{ width: '100px', fontSize: '10px' }} />
                      {item.imageFile && <button type="button" onClick={() => setSelectedImageModal(URL.createObjectURL(item.imageFile))} style={{ background: '#e0f2fe', color: '#0369a1', border: 'none', padding: '3px 6px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>Preview</button>}
                    </div>
                  </td>
                  {!isJobWork && <td style={styles.td}><input type="number" value={item.itemRate} onChange={(e) => handleItemChange(idx, 'itemRate', e.target.value)} style={styles.tblInput} /></td>}
                  {!isJobWork && <td style={styles.td}>
                    <select value={item.gstPercentage} onChange={(e) => handleItemChange(idx, 'gstPercentage', e.target.value)} style={styles.tblInput}>
                      <option value="0">0%</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option>
                    </select>
                  </td>}
                  {!isRMG && <td style={styles.td}><input type="number" value={item.totalMeter} onChange={(e) => handleItemChange(idx, 'totalMeter', e.target.value)} style={{ ...styles.tblInput, border: '1px solid #3b82f6', background: '#eff6ff' }} /></td>}
                  {isRMG && <td style={styles.td}><input type="number" value={item.totalPieces} onChange={(e) => handleItemChange(idx, 'totalPieces', e.target.value)} style={{ ...styles.tblInput, border: '1px solid #3b82f6', background: '#eff6ff' }} /></td>}
                  {!isJobWork && <td style={styles.td}><strong style={{ color: '#334155' }}>₹ {totalVal.toFixed(2)}</strong></td>}
                  <td style={styles.td}><input type="number" value={item.damage} onChange={(e) => handleItemChange(idx, 'damage', e.target.value)} style={styles.tblInput} /></td>
                  <td style={styles.td}><input type="number" value={item.shortage} onChange={(e) => handleItemChange(idx, 'shortage', e.target.value)} style={styles.tblInput} /></td>
                  <td style={styles.td}><input type="number" value={item.returnEntry} placeholder="Qty" onChange={(e) => handleItemChange(idx, 'returnEntry', e.target.value)} style={styles.tblInput} /></td>
                  <td style={{ ...styles.td, background: '#f0fdf4', textAlign: 'center', borderRight: 'none' }}><strong style={{ color: netStock > 0 ? '#059669' : '#ef4444', fontSize: '15px' }}>{netStock.toFixed(2)}</strong></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <button type="button" onClick={handleAddItem} style={styles.secondaryBtn}>+ Add Row</button>
        {!isJobWork && <div style={{ fontSize: '18px', color: '#0f172a' }}>Grand Total (with GST): <strong style={{ color: '#dc2626' }}>₹ {grandTotal.toFixed(2)}</strong></div>}
        <button type="button" onClick={handleSaveGRN} disabled={saving} style={styles.successBtn}>{saving ? 'Saving...' : '💾 Save & Update Stock'}</button>
      </div>

      {selectedImageModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '20px', borderRadius: '10px', textAlign: 'center', maxWidth: '500px', width: '100%' }}>
            <h4 style={{ margin: '0 0 15px 0' }}>Design Preview</h4>
            <img src={selectedImageModal} alt="Design Preview" style={{ width: '100%', maxHeight: '350px', objectFit: 'contain', borderRadius: '6px', marginBottom: '15px' }} />
            <button type="button" onClick={() => setSelectedImageModal(null)} style={styles.primaryBtn}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// 4. Cutting Entry Module
function CuttingEntryModule() {
  const [stockList, setStockList] = useState<any[]>([]);
  const [selectedFabrics, setSelectedFabrics] = useState<any[]>([{ stockId: '', issueMeters: '' }]);
  const [batchCode, setBatchCode] = useState('');
  const predefinedModels = ['Nighty', 'Night Suit', 'Kurti'];
  const [modelSelection, setModelSelection] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [sizes, setSizes] = useState<any[]>([{ size: '', pieces: '', consumption: '' }]);
  const [endBits, setEndBits] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchLiveStock(); }, []);

  const fetchLiveStock = async () => {
    const { data, error } = await supabase.from('pommys_fabric_stock').select('*').gt('available_meters', 0.01);
    if (!error && data) setStockList(data);
  };

  const handleFabricChange = (idx: number, field: string, val: any) => {
    const newFabs = [...selectedFabrics];
    newFabs[idx][field] = val;
    setSelectedFabrics(newFabs);
  };
  const handleAddFabricRow = () => setSelectedFabrics([...selectedFabrics, { stockId: '', issueMeters: '' }]);
  const handleRemoveFabricRow = (idx: number) => {
    const newFabs = [...selectedFabrics];
    newFabs.splice(idx, 1);
    setSelectedFabrics(newFabs);
  };

  const handleGenerateCode = () => setBatchCode(`CUT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
  const handleAddSize = () => setSizes([...sizes, { size: '', pieces: '', consumption: '' }]);
  const handleSizeChange = (idx: number, field: string, val: any) => {
    const newSizes = [...sizes];
    newSizes[idx][field] = val;
    setSizes(newSizes);
  };

  const handleSaveBatch = async () => {
    const validFabrics = selectedFabrics.filter(f => f.stockId && f.issueMeters);
    if (!batchCode) return alert("Please Generate Code first!");
    if (validFabrics.length === 0) return alert("Please select at least one fabric!");
    const finalModel = modelSelection === 'NEW' ? customModel : modelSelection;
    if (!finalModel) return alert("Please select a Model Name!");

    setSaving(true);
    try {
      const totalPieces = sizes.reduce((sum, s) => sum + (Number(s.pieces) || 0), 0);

      const { error: batchErr } = await supabase.from('pommys_cutting_batches').insert([{
        batch_code: batchCode, selected_fabrics_json: validFabrics, product_model: finalModel,
        size_pieces_json: sizes, total_pieces: totalPieces, end_bit_meters: Number(endBits)
      }]);
      if (batchErr) throw batchErr;

      const { error: wipErr } = await supabase.from('pommys_production_wip').insert([{
        batch_code: batchCode, model_name: finalModel, total_pieces: totalPieces, current_status: 'Cutting'
      }]);
      if (wipErr) throw wipErr;

      for (const fab of validFabrics) {
        const stockObj = stockList.find(s => s.id === parseInt(fab.stockId, 10));
        if (stockObj) {
          const issued = Number(fab.issueMeters);
          const endBitVal = Number(endBits) || 0;
          const netDeduction = Math.max(0, issued - endBitVal);
          const newAvailable = Math.max(0, Number(stockObj.available_meters) - netDeduction);

          await supabase.from('pommys_fabric_stock').update({ available_meters: newAvailable }).eq('id', stockObj.id);
        }
      }
      alert(`🎉 Batch ${batchCode} saved successfully & sent to WIP!`);
      setSelectedFabrics([{ stockId: '', issueMeters: '' }]);
      setBatchCode('');
      setModelSelection('');
      setCustomModel('');
      setSizes([{ size: '', pieces: '', consumption: '' }]);
      setEndBits('');
      await fetchLiveStock();
    } catch (err: any) {
      alert("Error saving batch: " + (err?.message || String(err)));
    }
    setSaving(false);
  };
  const isFabricSelected = selectedFabrics.some(f => f.stockId && f.issueMeters);

  return (
    <div style={styles.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #f1f5f9', paddingBottom: '10px', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, color: '#0f172a' }}>✂️ Fabric Issue & Cutting</h3>
        <button type="button" onClick={handleGenerateCode} style={styles.primaryBtn} disabled={!isFabricSelected}>Generate Batch Code ➡️</button>
      </div>
      {batchCode && <div style={{ background: '#dcfce7', color: '#166534', padding: '10px 15px', borderRadius: '8px', marginBottom: '20px', fontWeight: 'bold' }}>✓ Batch "{batchCode}" generated!</div>}
      <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '30px' }}>
        <label style={styles.label}>Select from Godown Stock (Multi-Fabric Support):</label>
        {selectedFabrics.map((fab, idx) => (
          <div key={idx} style={{ display: 'flex', gap: '15px', marginBottom: '10px' }}>
            <select value={fab.stockId} onChange={(e) => handleFabricChange(idx, 'stockId', e.target.value)} style={{ ...styles.input, flex: 2 }}>
              <option value="">-- Search Design & Color --</option>
              {stockList.map(stock => (
                <option key={stock.id} value={stock.id}>Design: {stock.design_no} | Color: {stock.color} | Available: {stock.available_meters} M</option>
              ))}
            </select>
            <input type="number" placeholder="Issue Meters" value={fab.issueMeters} onChange={(e) => handleFabricChange(idx, 'issueMeters', e.target.value)} style={{ ...styles.input, flex: 1 }} disabled={!fab.stockId} />
            {idx > 0 && <button type="button" onClick={() => handleRemoveFabricRow(idx)} style={{ background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '6px', padding: '0 15px', cursor: 'pointer', fontWeight: 'bold' }}>X</button>}
          </div>
        ))}
        <button type="button" onClick={handleAddFabricRow} style={{ ...styles.secondaryBtn, marginTop: '10px' }}>+ Add Another Fabric</button>
      </div>
      <div style={{ opacity: isFabricSelected ? 1 : 0.5, pointerEvents: isFabricSelected ? 'auto' : 'none' }}>
        <h4 style={{ color: '#334155', marginBottom: '15px' }}>Cutting Details</h4>
        <div style={{ marginBottom: '20px', width: '50%' }}>
          <label style={styles.label}>Model Name:</label>
          <select value={modelSelection} onChange={(e) => setModelSelection(e.target.value)} style={{ ...styles.input, marginBottom: '10px' }}>
            <option value="">-- Select Model --</option>
            {predefinedModels.map(m => <option key={m} value={m}>{m}</option>)}
            <option value="NEW" style={{ fontWeight: 'bold', color: '#2563eb' }}>+ Add New Model</option>
          </select>
          {modelSelection === 'NEW' && <input type="text" placeholder="Enter New Model Name" value={customModel} onChange={(e) => setCustomModel(e.target.value)} style={{ ...styles.input, borderColor: '#3b82f6' }} />}
        </div>
        <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
          <label style={styles.label}>Size-wise Cutting & Consumption:</label>
          {sizes.map((s, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '15px', marginBottom: '10px' }}>
              <input type="text" placeholder="Size (L, XL)" value={s.size} onChange={(e) => handleSizeChange(idx, 'size', e.target.value)} style={{ ...styles.input, width: '150px' }} />
              <input type="number" placeholder="Pieces" value={s.pieces} onChange={(e) => handleSizeChange(idx, 'pieces', e.target.value)} style={{ ...styles.input, width: '150px' }} />
              <input type="number" placeholder="Consumption (M/Pc)" value={s.consumption} onChange={(e) => handleSizeChange(idx, 'consumption', e.target.value)} style={{ ...styles.input, width: '200px', borderColor: '#3b82f6' }} />
            </div>
          ))}
          <button type="button" onClick={handleAddSize} style={styles.secondaryBtn}>+ Add Size</button>
        </div>
        <div style={{ borderTop: '2px solid #f1f5f9', paddingTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            <label style={{ fontWeight: 'bold', color: '#dc2626' }}>End Bits (Meters):</label>
            <input type="number" placeholder="Meters" value={endBits} onChange={(e) => setEndBits(e.target.value)} style={{ ...styles.input, width: '120px' }} />
          </div>
          <button type="button" onClick={handleSaveBatch} disabled={saving} style={styles.successBtn}>{saving ? 'Saving...' : '💾 Save Batch & Send to WIP'}</button>
        </div>
      </div>
    </div>
  );
}

// 5. Production WIP Tracking
function ProductionTracking() {
  const [wipBatches, setWipBatches] = useState<any[]>([]);
  useEffect(() => { fetchWIP(); }, []);

  const fetchWIP = async () => {
    const { data } = await supabase.from('pommys_production_wip').select('*').neq('current_status', 'Ready Stock').order('id', { ascending: false });
    if (data) setWipBatches(data);
  };

  const updateStatus = async (batch: any, newStatus: string) => {
    await supabase.from('pommys_production_wip').update({ current_status: newStatus }).eq('id', batch.id);
    if (newStatus === 'Ready Stock') {
      await supabase.from('pommys_ready_stock').insert([{
        batch_code: batch.batch_code, model_name: batch.model_name, ready_pieces: batch.total_pieces
      }]);
      alert(`🎉 Batch ${batch.batch_code} moved to Ready Stock!`);
    }
    fetchWIP();
  };

  const getNextStatus = (current: string) => {
    if (current === 'Cutting') return 'Stitching';
    if (current === 'Stitching') return 'QC Check';
    if (current === 'QC Check') return 'Packing';
    if (current === 'Packing') return 'Ready Stock';
    return null;
  };

  return (
    <div style={styles.card}>
      <h3 style={{ margin: '0 0 20px 0', color: '#0f172a', borderBottom: '2px solid #f1f5f9', paddingBottom: '10px' }}>🏭 Live Production Tracking (WIP)</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', background: 'white' }}>
        <thead>
          <tr style={{ background: '#1e293b', color: 'white' }}>
            <th style={styles.thSub}>Batch Code</th>
            <th style={styles.thSub}>Model</th>
            <th style={styles.thSub}>Total Pcs</th>
            <th style={styles.thSub}>Current Status</th>
            <th style={styles.thSub}>Action (Move to Next)</th>
          </tr>
        </thead>
        <tbody>
          {wipBatches.length === 0 ? (
            <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>No Active Batches in WIP</td></tr>
          ) : wipBatches.map((batch, idx) => {
            const nextStat = getNextStatus(batch.current_status);
            return (
              <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={styles.td}><strong>{batch.batch_code}</strong></td>
                <td style={styles.td}>{batch.model_name}</td>
                <td style={styles.td}>{batch.total_pieces}</td>
                <td style={styles.td}>
                  <span style={{ background: '#fef3c7', color: '#b45309', padding: '5px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>{batch.current_status}</span>
                </td>
                <td style={styles.td}>
                  {nextStat && <button type="button" onClick={() => updateStatus(batch, nextStat)} style={{ ...styles.primaryBtn, padding: '6px 12px', fontSize: '12px' }}>Move to {nextStat} ➡️</button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// 6. Master Reports with Supplier & Date Filters + Image Modal
function ReportsModule() {
  const [tab, setTab] = useState('godown');
  const [godownStock, setGodownStock] = useState<any[]>([]);
  const [readyStock, setReadyStock] = useState<any[]>([]);
  const [supplierHistory, setSupplierHistory] = useState<any[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (tab === 'godown') fetchGodown();
    if (tab === 'ready') fetchReady();
    if (tab === 'history') fetchHistory();
  }, [tab]);

  const fetchGodown = async () => {
    const { data } = await supabase.from('pommys_fabric_stock').select('*').gt('available_meters', 0.01).order('id', { ascending: false });
    if (data) setGodownStock(data);
  };
  const fetchReady = async () => {
    const { data } = await supabase.from('pommys_ready_stock').select('*').order('id', { ascending: false });
    if (data) setReadyStock(data);
  };
  const fetchHistory = async () => {
    const { data: bills } = await supabase.from('pommys_grn_bills').select('*').order('bill_date', { ascending: false });
    const { data: stocks } = await supabase.from('pommys_fabric_stock').select('*');

    if (bills && stocks) {
      const combined = bills.map(bill => ({
        ...bill,
        pommys_fabric_stock: stocks.filter(st => st.bill_id === bill.id)
      }));
      setSupplierHistory(combined);
    }
  };

  const filteredHistory = supplierHistory.filter(bill => {
    const matchSupplier = selectedSupplier ? String(bill.supplier_name || '').toLowerCase().includes(selectedSupplier.toLowerCase()) : true;
    const billDate = bill.bill_date ? new Date(bill.bill_date) : null;
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;

    let matchDate = true;
    if (billDate) {
      if (start && billDate < start) matchDate = false;
      if (end && billDate > end) matchDate = false;
    } else if (start || end) {
      matchDate = false;
    }
    return matchSupplier && matchDate;
  });

  return (
    <div style={styles.card}>
      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px' }}>
        <button type="button" onClick={() => setTab('godown')} style={{ ...styles.secondaryBtn, background: tab === 'godown' ? '#1e293b' : 'transparent', color: tab === 'godown' ? 'white' : '#475569' }}>📦 Fabric Godown Stock</button>
        <button type="button" onClick={() => setTab('ready')} style={{ ...styles.secondaryBtn, background: tab === 'ready' ? '#1e293b' : 'transparent', color: tab === 'ready' ? 'white' : '#475569' }}>👕 Finished Ready Stock</button>
        <button type="button" onClick={() => setTab('history')} style={{ ...styles.secondaryBtn, background: tab === 'history' ? '#1e293b' : 'transparent', color: tab === 'history' ? 'white' : '#475569' }}>📅 Supplier Date-wise History</button>
      </div>

      {tab === 'godown' && (
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead><tr style={{ background: '#0f172a', color: 'white' }}>
            <th style={styles.thSub}>Item</th><th style={styles.thSub}>Design</th><th style={styles.thSub}>Color</th><th style={styles.thSub}>Design Photo</th><th style={styles.thSub}>Available (M)</th>
          </tr></thead>
          <tbody>
            {godownStock.map((s, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={styles.td}>{s.item_name}</td><td style={styles.td}>{s.design_no}</td><td style={styles.td}>{s.color}</td>
                <td style={styles.td}>
                  {s.image_url ? <button type="button" onClick={() => setSelectedImage(s.image_url)} style={{ background: '#e0f2fe', color: '#0369a1', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>View Photo</button> : 'No Image'}
                </td>
                <td style={{ ...styles.td, color: '#059669', fontWeight: 'bold' }}>{s.available_meters}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'ready' && (
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead><tr style={{ background: '#0f172a', color: 'white' }}>
            <th style={styles.thSub}>Batch Ref</th><th style={styles.thSub}>Model Name</th><th style={styles.thSub}>Ready Pieces</th>
          </tr></thead>
          <tbody>
            {readyStock.map((s, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={styles.td}>{s.batch_code}</td><td style={styles.td}>{s.model_name}</td>
                <td style={{ ...styles.td, color: '#059669', fontWeight: 'bold' }}>{s.ready_pieces}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'history' && (
        <div>
          <div style={{ display: 'flex', gap: '15px', background: '#f8fafc', padding: '15px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #cbd5e1', alignItems: 'center' }}>
            <div>
              <label style={styles.label}>Filter by Supplier:</label>
              <input type="text" placeholder="Search Supplier Name" value={selectedSupplier} onChange={(e) => setSelectedSupplier(e.target.value)} style={styles.tblInput} />
            </div>
            <div>
              <label style={styles.label}>From Date:</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={styles.tblInput} />
            </div>
            <div>
              <label style={styles.label}>To Date:</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={styles.tblInput} />
            </div>
            <div style={{ alignSelf: 'flex-end' }}>
              <button type="button" onClick={() => { setSelectedSupplier(''); setStartDate(''); setEndDate(''); }} style={{ ...styles.secondaryBtn, padding: '8px 12px', fontSize: '12px' }}>Clear Filters</button>
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>No matching records found.</p>
          ) : (
            filteredHistory.map((bill, i) => (
              <div key={i} style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '15px', marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', marginBottom: '10px' }}>
                  <div><strong>Supplier:</strong> {bill.supplier_name} | <strong>Bill No:</strong> {bill.bill_no}</div>
                  <div><strong>Date:</strong> {bill.bill_date || 'N/A'}</div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead><tr style={{ background: '#e2e8f0', color: '#334155' }}>
                    <th style={styles.thSub}>Item</th><th style={styles.thSub}>Design</th><th style={styles.thSub}>Color</th><th style={styles.thSub}>Rate</th><th style={styles.thSub}>GST %</th><th style={styles.thSub}>Net Qty</th><th style={styles.thSub}>Photo</th>
                  </tr></thead>
                  <tbody>
                    {bill.pommys_fabric_stock?.map((st: any, idx: number) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={styles.td}>{st.item_name}</td><td style={styles.td}>{st.design_no}</td><td style={styles.td}>{st.color}</td>
                        <td style={styles.td}>₹{st.rate_per_meter}</td><td style={styles.td}>{st.gst_percentage}%</td>
                        <td style={styles.td}>{st.net_meters}</td>
                        <td style={styles.td}>
                          {st.image_url ? <button type="button" onClick={() => setSelectedImage(st.image_url)} style={{ background: '#e0f2fe', color: '#0369a1', border: 'none', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>View</button> : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      )}

      {selectedImage && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '20px', borderRadius: '10px', textAlign: 'center', maxWidth: '500px', width: '100%' }}>
            <h4 style={{ margin: '0 0 15px 0' }}>Design Preview</h4>
            <img src={selectedImage} alt="Design Preview" style={{ width: '100%', maxHeight: '350px', objectFit: 'contain', borderRadius: '6px', marginBottom: '15px' }} />
            <button type="button" onClick={() => setSelectedImage(null)} style={styles.primaryBtn}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Centralized Styles
const styles = {
  card: { background: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.03)' },
  input: { padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', width: '100%', boxSizing: 'border-box' as const, outline: 'none' },
  tblInput: { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', width: '100%', boxSizing: 'border-box' as const, outline: 'none' },
  label: { display: 'block', fontSize: '12px', color: '#475569', marginBottom: '6px', fontWeight: 'bold' },
  primaryBtn: { background: '#2563eb', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  successBtn: { background: '#059669', color: 'white', padding: '12px 24px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' },
  secondaryBtn: { background: '#e2e8f0', color: '#475569', padding: '10px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  logoutBtn: { background: 'transparent', color: '#f87171', border: '1px solid #f87171', padding: '8px', borderRadius: '6px', width: '100%', cursor: 'pointer' },
  menuItem: (isActive: boolean) => ({ padding: '12px 20px', cursor: 'pointer', color: isActive ? 'white' : '#94a3b8', background: isActive ? '#1e293b' : 'transparent', borderLeft: isActive ? '4px solid #dc2626' : '4px solid transparent', fontWeight: isActive ? 'bold' : 'normal' }),
  thGroup: { padding: '10px', fontSize: '13px', borderRight: '1px solid #1e293b', borderBottom: '1px solid #334155' },
  thSub: { padding: '10px 8px', fontWeight: 'normal', fontSize: '12px', borderRight: '1px solid #334155' },
  td: { padding: '8px', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', fontSize: '13px' }
};
