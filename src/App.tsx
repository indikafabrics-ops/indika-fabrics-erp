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

type MenuKey =
  | 'dashboard'
  | 'grn'
  | 'cutting'
  | 'production'
  | 'storeroom'
  | 'readystock'
  | 'catalog'
  | 'costing'
  | 'tailor'
  | 'reports'
  | 'security'
  | 'yearclosing';

const MENU_ITEMS: { key: MenuKey; label: string; title: string }[] = [
  { key: 'dashboard', label: '🏠 Dashboard Overview', title: 'Pommys Garment ERP — Executive Dashboard' },
  { key: 'grn', label: '📥 Purchase & GRN', title: 'Goods Receipt Note (Master GRN)' },
  { key: 'cutting', label: '✂️ Fabric Issue & Cutting', title: 'Fabric Issue & Cutting Module' },
  { key: 'production', label: '🏭 Production WIP', title: 'Live Production Tracking (WIP)' },
  { key: 'storeroom', label: '🏪 Store Room & Trims', title: 'Store Room, Accessories & Trims Stock' },
  { key: 'readystock', label: '👕 Ready Stock Godown', title: 'Finished Ready Stock & Dispatch Register' },
  { key: 'catalog', label: '📒 Salesman Catalog', title: 'Salesman Design Catalog & Sample Rate Sheet' },
  { key: 'costing', label: '🧮 Costing & Rate Fixer', title: 'Garment Costing & Wholesale/Retail Rate Fixer' },
  { key: 'tailor', label: '🧵 Tailor Ledger & Jobwork', title: 'Tailor & Stitching Job-Work Ledger' },
  { key: 'reports', label: '📊 Master Reports & History', title: 'Godown, Ready Stock & Supplier History Reports' },
  { key: 'security', label: '🔐 Security & Admin', title: 'User Roles, Access Control & Audit Logs' },
  { key: 'yearclosing', label: '📁 Year Closing & Backup', title: 'Financial Year Closing & Data Backup Center' }
];

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
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f1f5f9', fontFamily: '"Segoe UI", Tahoma, sans-serif', padding: '16px' }}>
      <div style={{ background: 'white', padding: '45px 35px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.06)', width: '100%', maxWidth: '390px', textAlign: 'center' }}>
        <img
          src={POMMYS_LOGO_URL}
          alt="Pommys Logo"
          style={{ height: '70px', marginBottom: '16px', objectFit: 'contain' }}
          onError={(e) => {
            const img = e.currentTarget;
            img.onerror = null;
            img.src = "https://via.placeholder.com/180x60/dc2626/ffffff?text=POMMYS";
          }}
        />
        <p style={{ color: '#64748b', margin: '0 0 26px 0', fontSize: '14px', fontWeight: 'bold' }}>Corporate ERP Portal</p>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <input type="text" placeholder="User ID / Mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} style={styles.input} required />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={styles.input} required />
          {error && <p style={{ color: '#ef4444', fontSize: '13px', margin: 0 }}>{error}</p>}
          <button type="submit" disabled={loading} style={styles.primaryBtn}>{loading ? 'Authenticating...' : 'Secure Login'}</button>
        </form>
      </div>
    </div>
  );
}

// 2. Dashboard Layout with All Modules
function Dashboard({ user, onLogout }: { user: any; onLogout: () => void }) {
  const [activeMenu, setActiveMenu] = useState<MenuKey>('dashboard');
  const currentMeta = MENU_ITEMS.find(m => m.key === activeMenu) || MENU_ITEMS[0];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc', fontFamily: '"Segoe UI", Tahoma, sans-serif' }}>
      <div style={{ width: '265px', background: '#0f172a', color: 'white', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '18px', borderBottom: '1px solid #1e293b', textAlign: 'center', background: 'white' }}>
          <img
            src={POMMYS_LOGO_URL}
            alt="Pommys Logo"
            style={{ height: '44px', objectFit: 'contain' }}
            onError={(e) => {
              const img = e.currentTarget;
              img.onerror = null;
              img.src = "https://via.placeholder.com/180x60/dc2626/ffffff?text=POMMYS";
            }}
          />
          <div style={{ fontSize: '12px', color: '#475569', marginTop: '6px', fontWeight: 'bold' }}>
            {user?.full_name || 'Raja Admin'} ({user?.role || 'ADMIN'})
          </div>
        </div>

        <div style={{ flex: 1, padding: '10px 0', display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto' }}>
          {MENU_ITEMS.map(item => (
            <div
              key={item.key}
              style={styles.menuItem(activeMenu === item.key)}
              onClick={() => setActiveMenu(item.key)}
            >
              {item.label}
            </div>
          ))}
        </div>

        <div style={{ padding: '16px', borderTop: '1px solid #1e293b' }}>
          <button type="button" onClick={onLogout} style={styles.logoutBtn}>Logout</button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ background: 'white', padding: '14px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, color: '#0f172a', fontSize: '18px' }}>{currentMeta.title}</h3>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setActiveMenu('grn')} style={{ ...styles.secondaryBtn, padding: '6px 12px', fontSize: '12px' }}>+ New GRN</button>
            <button type="button" onClick={() => setActiveMenu('cutting')} style={{ ...styles.secondaryBtn, padding: '6px 12px', fontSize: '12px' }}>+ New Cutting</button>
            <button type="button" onClick={() => setActiveMenu('reports')} style={{ ...styles.secondaryBtn, padding: '6px 12px', fontSize: '12px' }}>Reports</button>
          </div>
        </div>

        <div style={{ flex: 1, padding: '22px', overflowY: 'auto' }}>
          {activeMenu === 'dashboard' && <DashboardHome onNavigate={setActiveMenu} />}
          {activeMenu === 'grn' && <GRNEntryForm />}
          {activeMenu === 'cutting' && <CuttingEntryModule />}
          {activeMenu === 'production' && <ProductionTracking />}
          {activeMenu === 'storeroom' && <StoreRoomModule />}
          {activeMenu === 'readystock' && <ReadyStockModule />}
          {activeMenu === 'catalog' && <SalesmanCatalogModule />}
          {activeMenu === 'costing' && <CostingRateFixerModule />}
          {activeMenu === 'tailor' && <TailorLedgerModule />}
          {activeMenu === 'reports' && <ReportsModule />}
          {activeMenu === 'security' && <SecurityAdminModule user={user} />}
          {activeMenu === 'yearclosing' && <YearClosingBackupModule />}
        </div>
      </div>
    </div>
  );
}

// 0. Executive Dashboard Overview
function DashboardHome({ onNavigate }: { onNavigate: (menu: MenuKey) => void }) {
  const [stats, setStats] = useState({
    fabricMeters: 0,
    wipCount: 0,
    readyPieces: 0,
    billsCount: 0
  });

  useEffect(() => {
    const loadStats = async () => {
      const { data: fabric } = await supabase.from('pommys_fabric_stock').select('available_meters');
      const { data: wip } = await supabase.from('pommys_production_wip').select('id').neq('current_status', 'Ready Stock');
      const { data: ready } = await supabase.from('pommys_ready_stock').select('ready_pieces');
      const { data: bills } = await supabase.from('pommys_grn_bills').select('id');

      const totalMeters = (fabric || []).reduce((acc: number, row: any) => acc + (Number(row.available_meters) || 0), 0);
      const totalReady = (ready || []).reduce((acc: number, row: any) => acc + (Number(row.ready_pieces) || 0), 0);

      setStats({
        fabricMeters: totalMeters,
        wipCount: (wip || []).length,
        readyPieces: totalReady,
        billsCount: (bills || []).length
      });
    };
    loadStats();
  }, []);

  const cards = [
    { label: 'Available Fabric Stock (M)', value: stats.fabricMeters.toFixed(2), color: '#2563eb', target: 'grn' as MenuKey },
    { label: 'Active WIP Batches', value: String(stats.wipCount), color: '#d97706', target: 'production' as MenuKey },
    { label: 'Finished Ready Pieces', value: String(stats.readyPieces), color: '#059669', target: 'readystock' as MenuKey },
    { label: 'Total GRN Bills', value: String(stats.billsCount), color: '#7c3aed', target: 'reports' as MenuKey }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        {cards.map((c, idx) => (
          <div
            key={idx}
            onClick={() => onNavigate(c.target)}
            style={{ ...styles.card, borderTop: `4px solid ${c.color}`, cursor: 'pointer' }}
          >
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold', marginBottom: '8px' }}>{c.label}</div>
            <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#0f172a' }}>{c.value}</div>
            <div style={{ fontSize: '11px', color: c.color, marginTop: '8px', fontWeight: 'bold' }}>Open Module →</div>
          </div>
        ))}
      </div>

      <div style={styles.card}>
        <h4 style={{ margin: '0 0 14px 0', color: '#0f172a' }}>Quick Navigation — All ERP Modules</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px' }}>
          {MENU_ITEMS.filter(m => m.key !== 'dashboard').map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item.key)}
              style={{ ...styles.secondaryBtn, textAlign: 'left', background: '#f8fafc', border: '1px solid #cbd5e1' }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// 3. GRN Master Form
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', background: '#f0f9ff', border: '1px solid #bae6fd', padding: '15px 25px', borderRadius: '8px', marginBottom: '25px', flexWrap: 'wrap' }}>
        <h4 style={{ margin: 0, color: '#0369a1', fontSize: '16px' }}>Select Inward Type:</h4>
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontWeight: bill.inwardType === 'OWN_FABRIC' ? 'bold' : 'normal' }}><input type="radio" name="inwardType" value="OWN_FABRIC" checked={bill.inwardType === 'OWN_FABRIC'} onChange={handleBillChange} /> 🏭 Own Fabric</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontWeight: bill.inwardType === 'RMG' ? 'bold' : 'normal' }}><input type="radio" name="inwardType" value="RMG" checked={bill.inwardType === 'RMG'} onChange={handleBillChange} /> 👕 RMG (Ready-Made)</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontWeight: bill.inwardType === 'JOB_WORK' ? 'bold' : 'normal' }}><input type="radio" name="inwardType" value="JOB_WORK" checked={bill.inwardType === 'JOB_WORK'} onChange={handleBillChange} /> ✂️ Job Work</label>
        </div>
      </div>

      <h4 style={{ color: '#0f172a', marginBottom: '15px', paddingBottom: '10px', borderBottom: '2px solid #f1f5f9' }}>A) Supplier & Logistics Details</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '18px', marginBottom: '30px' }}>
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
        <table style={{ width: '100%', minWidth: '1450px', borderCollapse: 'collapse', textAlign: 'left', background: 'white' }}>
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
              <th style={{ ...styles.thSub, width: '110px' }}>Return</th>
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '12px' }}>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #f1f5f9', paddingBottom: '10px', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h3 style={{ margin: 0, color: '#0f172a' }}>✂️ Fabric Issue & Cutting</h3>
        <button type="button" onClick={handleGenerateCode} style={styles.primaryBtn} disabled={!isFabricSelected}>Generate Batch Code ➡️</button>
      </div>
      {batchCode && <div style={{ background: '#dcfce7', color: '#166534', padding: '10px 15px', borderRadius: '8px', marginBottom: '20px', fontWeight: 'bold' }}>✓ Batch "{batchCode}" generated!</div>}
      <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '30px' }}>
        <label style={styles.label}>Select from Godown Stock (Multi-Fabric Support):</label>
        {selectedFabrics.map((fab, idx) => (
          <div key={idx} style={{ display: 'flex', gap: '15px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <select value={fab.stockId} onChange={(e) => handleFabricChange(idx, 'stockId', e.target.value)} style={{ ...styles.input, flex: 2, minWidth: '240px' }}>
              <option value="">-- Search Design & Color --</option>
              {stockList.map(stock => (
                <option key={stock.id} value={stock.id}>Design: {stock.design_no} | Color: {stock.color} | Available: {stock.available_meters} M</option>
              ))}
            </select>
            <input type="number" placeholder="Issue Meters" value={fab.issueMeters} onChange={(e) => handleFabricChange(idx, 'issueMeters', e.target.value)} style={{ ...styles.input, flex: 1, minWidth: '140px' }} disabled={!fab.stockId} />
            {idx > 0 && <button type="button" onClick={() => handleRemoveFabricRow(idx)} style={{ background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '6px', padding: '0 15px', cursor: 'pointer', fontWeight: 'bold' }}>X</button>}
          </div>
        ))}
        <button type="button" onClick={handleAddFabricRow} style={{ ...styles.secondaryBtn, marginTop: '10px' }}>+ Add Another Fabric</button>
      </div>
      <div style={{ opacity: isFabricSelected ? 1 : 0.5, pointerEvents: isFabricSelected ? 'auto' : 'none' }}>
        <h4 style={{ color: '#334155', marginBottom: '15px' }}>Cutting Details</h4>
        <div style={{ marginBottom: '20px', maxWidth: '420px' }}>
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
            <div key={idx} style={{ display: 'flex', gap: '15px', marginBottom: '10px', flexWrap: 'wrap' }}>
              <input type="text" placeholder="Size (L, XL)" value={s.size} onChange={(e) => handleSizeChange(idx, 'size', e.target.value)} style={{ ...styles.input, width: '150px' }} />
              <input type="number" placeholder="Pieces" value={s.pieces} onChange={(e) => handleSizeChange(idx, 'pieces', e.target.value)} style={{ ...styles.input, width: '150px' }} />
              <input type="number" placeholder="Consumption (M/Pc)" value={s.consumption} onChange={(e) => handleSizeChange(idx, 'consumption', e.target.value)} style={{ ...styles.input, width: '200px', borderColor: '#3b82f6' }} />
            </div>
          ))}
          <button type="button" onClick={handleAddSize} style={styles.secondaryBtn}>+ Add Size</button>
        </div>
        <div style={{ borderTop: '2px solid #f1f5f9', paddingTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
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
      <div style={{ overflowX: 'auto' }}>
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
    </div>
  );
}

// 6. Store Room & Trims Module
function StoreRoomModule() {
  const [trims, setTrims] = useState([
    { id: 1, name: 'Lace Border (White/Color)', unit: 'Roll / Mtr', qty: 120, reorder: 30 },
    { id: 2, name: 'Elastic Band (1 inch)', unit: 'Roll', qty: 45, reorder: 15 },
    { id: 3, name: 'Poly Bag & Tag Set', unit: 'Packet', qty: 200, reorder: 50 }
  ]);
  const [itemName, setItemName] = useState('');
  const [unit, setUnit] = useState('Mtr');
  const [qty, setQty] = useState('');

  const addTrim = (e: FormEvent) => {
    e.preventDefault();
    if (!itemName || !qty) return;
    setTrims([{ id: Date.now(), name: itemName, unit, qty: Number(qty), reorder: 20 }, ...trims]);
    setItemName('');
    setQty('');
  };

  return (
    <div style={styles.card}>
      <h4 style={{ margin: '0 0 16px 0', color: '#0f172a' }}>🏪 Store Room, Trims & Accessories</h4>
      <form onSubmit={addTrim} style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <input type="text" placeholder="Trim / Accessory Name" value={itemName} onChange={(e) => setItemName(e.target.value)} style={{ ...styles.input, maxWidth: '260px' }} />
        <select value={unit} onChange={(e) => setUnit(e.target.value)} style={{ ...styles.input, maxWidth: '140px' }}>
          <option value="Mtr">Mtr</option>
          <option value="Roll">Roll</option>
          <option value="Packet">Packet</option>
          <option value="Pcs">Pcs</option>
        </select>
        <input type="number" placeholder="Quantity" value={qty} onChange={(e) => setQty(e.target.value)} style={{ ...styles.input, maxWidth: '140px' }} />
        <button type="submit" style={styles.primaryBtn}>+ Add Trim Stock</button>
      </form>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead><tr style={{ background: '#0f172a', color: 'white' }}>
          <th style={styles.thSub}>Trim / Accessory</th><th style={styles.thSub}>Unit</th><th style={styles.thSub}>Available Qty</th><th style={styles.thSub}>Status</th>
        </tr></thead>
        <tbody>
          {trims.map(t => (
            <tr key={t.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={styles.td}><strong>{t.name}</strong></td>
              <td style={styles.td}>{t.unit}</td>
              <td style={styles.td}>{t.qty}</td>
              <td style={styles.td}>{t.qty <= t.reorder ? '⚠️ Low Stock' : '✅ Sufficient'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 7. Ready Stock Godown Module
function ReadyStockModule() {
  const [readyList, setReadyList] = useState<any[]>([]);
  useEffect(() => {
    const loadReady = async () => {
      const { data } = await supabase.from('pommys_ready_stock').select('*').order('id', { ascending: false });
      if (data) setReadyList(data);
    };
    loadReady();
  }, []);

  return (
    <div style={styles.card}>
      <h4 style={{ margin: '0 0 16px 0', color: '#0f172a' }}>👕 Finished Ready Stock Godown</h4>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead><tr style={{ background: '#0f172a', color: 'white' }}>
          <th style={styles.thSub}>Batch Code</th><th style={styles.thSub}>Model</th><th style={styles.thSub}>Ready Pieces</th>
        </tr></thead>
        <tbody>
          {readyList.length === 0 ? (
            <tr><td colSpan={3} style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>No Ready Stock records found yet.</td></tr>
          ) : readyList.map((r, idx) => (
            <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={styles.td}><strong>{r.batch_code}</strong></td>
              <td style={styles.td}>{r.model_name}</td>
              <td style={{ ...styles.td, color: '#059669', fontWeight: 'bold' }}>{r.ready_pieces}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 8. Salesman Catalog Module
function SalesmanCatalogModule() {
  const [designs, setDesigns] = useState<any[]>([]);
  useEffect(() => {
    const loadDesigns = async () => {
      const { data } = await supabase.from('pommys_fabric_stock').select('item_name, design_no, color, rate_per_meter, image_url').order('id', { ascending: false });
      if (data) setDesigns(data);
    };
    loadDesigns();
  }, []);

  return (
    <div style={styles.card}>
      <h4 style={{ margin: '0 0 16px 0', color: '#0f172a' }}>📒 Salesman Design Catalog</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
        {designs.length === 0 ? (
          <p style={{ color: '#64748b' }}>No catalog designs available yet.</p>
        ) : designs.map((d, i) => (
          <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', background: '#f8fafc' }}>
            {d.image_url ? (
              <img src={d.image_url} alt={d.design_no || 'Design'} style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '6px', marginBottom: '10px' }} />
            ) : (
              <div style={{ height: '140px', background: '#e2e8f0', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px', color: '#64748b', fontSize: '12px' }}>No Image</div>
            )}
            <div style={{ fontWeight: 'bold', color: '#0f172a' }}>Design: {d.design_no || '-'}</div>
            <div style={{ fontSize: '12px', color: '#475569' }}>Item: {d.item_name || '-'} | Color: {d.color || '-'}</div>
            <div style={{ fontSize: '13px', color: '#059669', fontWeight: 'bold', marginTop: '6px' }}>Base Rate: ₹{d.rate_per_meter || 0}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 9. Costing & Rate Fixer Module
function CostingRateFixerModule() {
  const [fabricCost, setFabricCost] = useState('140');
  const [stitchingCost, setStitchingCost] = useState('55');
  const [trimsCost, setTrimsCost] = useState('15');
  const [marginPct, setMarginPct] = useState('25');

  const totalCost = (Number(fabricCost) || 0) + (Number(stitchingCost) || 0) + (Number(trimsCost) || 0);
  const sellingPrice = totalCost + (totalCost * (Number(marginPct) || 0)) / 100;

  return (
    <div style={styles.card}>
      <h4 style={{ margin: '0 0 16px 0', color: '#0f172a' }}>🧮 Garment Costing & Rate Fixer</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        <div><label style={styles.label}>Fabric Cost / Pc (₹)</label><input type="number" value={fabricCost} onChange={(e) => setFabricCost(e.target.value)} style={styles.input} /></div>
        <div><label style={styles.label}>Stitching / Jobwork (₹)</label><input type="number" value={stitchingCost} onChange={(e) => setStitchingCost(e.target.value)} style={styles.input} /></div>
        <div><label style={styles.label}>Trims & Packing (₹)</label><input type="number" value={trimsCost} onChange={(e) => setTrimsCost(e.target.value)} style={styles.input} /></div>
        <div><label style={styles.label}>Target Margin (%)</label><input type="number" value={marginPct} onChange={(e) => setMarginPct(e.target.value)} style={styles.input} /></div>
      </div>
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '16px', borderRadius: '8px', display: 'flex', gap: '30px', flexWrap: 'wrap' }}>
        <div><strong>Net Cost / Pc:</strong> ₹ {totalCost.toFixed(2)}</div>
        <div><strong style={{ color: '#059669' }}>Suggested Rate: ₹ {sellingPrice.toFixed(2)}</strong></div>
      </div>
    </div>
  );
}

// 10. Tailor Ledger & Jobwork Module
function TailorLedgerModule() {
  const [entries, setEntries] = useState([
    { id: 1, tailor: 'Murugan Stitching Unit', batch: 'CUT-2026-101', pcs: 120, rate: 50, status: 'In Stitching' }
  ]);
  const [tailor, setTailor] = useState('');
  const [batch, setBatch] = useState('');
  const [pcs, setPcs] = useState('');
  const [rate, setRate] = useState('50');

  const addEntry = (e: FormEvent) => {
    e.preventDefault();
    if (!tailor || !batch || !pcs) return;
    setEntries([{ id: Date.now(), tailor, batch, pcs: Number(pcs), rate: Number(rate) || 0, status: 'Issued' }, ...entries]);
    setTailor('');
    setBatch('');
    setPcs('');
  };

  return (
    <div style={styles.card}>
      <h4 style={{ margin: '0 0 16px 0', color: '#0f172a' }}>🧵 Tailor Ledger & Job-Work</h4>
      <form onSubmit={addEntry} style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <input type="text" placeholder="Tailor / Unit Name" value={tailor} onChange={(e) => setTailor(e.target.value)} style={{ ...styles.input, maxWidth: '220px' }} />
        <input type="text" placeholder="Batch Code" value={batch} onChange={(e) => setBatch(e.target.value)} style={{ ...styles.input, maxWidth: '170px' }} />
        <input type="number" placeholder="Pieces" value={pcs} onChange={(e) => setPcs(e.target.value)} style={{ ...styles.input, maxWidth: '120px' }} />
        <input type="number" placeholder="Rate / Pc" value={rate} onChange={(e) => setRate(e.target.value)} style={{ ...styles.input, maxWidth: '120px' }} />
        <button type="submit" style={styles.primaryBtn}>+ Record Jobwork</button>
      </form>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead><tr style={{ background: '#0f172a', color: 'white' }}>
          <th style={styles.thSub}>Tailor / Unit</th><th style={styles.thSub}>Batch</th><th style={styles.thSub}>Pieces</th><th style={styles.thSub}>Amount (₹)</th><th style={styles.thSub}>Status</th>
        </tr></thead>
        <tbody>
          {entries.map(en => (
            <tr key={en.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={styles.td}><strong>{en.tailor}</strong></td>
              <td style={styles.td}>{en.batch}</td>
              <td style={styles.td}>{en.pcs}</td>
              <td style={styles.td}>₹ {(en.pcs * en.rate).toFixed(2)}</td>
              <td style={styles.td}>{en.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 11. Security & Admin Module
function SecurityAdminModule({ user }: { user: any }) {
  return (
    <div style={styles.card}>
      <h4 style={{ margin: '0 0 12px 0', color: '#0f172a' }}>🔐 Security & Admin Controls</h4>
      <p style={{ color: '#475569', fontSize: '14px' }}>
        Logged in as: <strong>{user?.full_name || 'Raja Admin'}</strong> | Role: <strong>{user?.role || 'ADMIN'}</strong>
      </p>
      <p style={{ color: '#64748b', fontSize: '13px' }}>
        Database & Storage are connected to Supabase (`chaodxrbgiqotdxxvjcj.supabase.co`). Manage user accounts in the <code>pommys_users</code> table.
      </p>
    </div>
  );
}

// 12. Year Closing & Backup Module
function YearClosingBackupModule() {
  const [exporting, setExporting] = useState(false);

  const handleDownloadBackup = async () => {
    setExporting(true);
    try {
      const { data: bills } = await supabase.from('pommys_grn_bills').select('*');
      const { data: stock } = await supabase.from('pommys_fabric_stock').select('*');
      const { data: wip } = await supabase.from('pommys_production_wip').select('*');
      const { data: ready } = await supabase.from('pommys_ready_stock').select('*');

      const backupPayload = {
        exportedAt: new Date().toISOString(),
        brand: 'Pommys / Indika Fabrics ERP',
        bills: bills || [],
        fabricStock: stock || [],
        productionWip: wip || [],
        readyStock: ready || []
      };

      const blob = new Blob([JSON.stringify(backupPayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pommys-erp-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={styles.card}>
      <h4 style={{ margin: '0 0 12px 0', color: '#0f172a' }}>📁 Financial Year Closing & Backup</h4>
      <p style={{ color: '#475569', fontSize: '13px', marginBottom: '16px' }}>
        Download a complete JSON snapshot of GRN bills, fabric stock, WIP batches, and ready stock for archiving and year-end audit.
      </p>
      <button type="button" onClick={handleDownloadBackup} disabled={exporting} style={styles.primaryBtn}>
        {exporting ? 'Preparing Backup...' : '⬇️ Download Full ERP JSON Backup'}
      </button>
    </div>
  );
}

// 13. Master Reports with Supplier & Date Filters + Image Modal
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
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px', flexWrap: 'wrap' }}>
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
          <div style={{ display: 'flex', gap: '15px', background: '#f8fafc', padding: '15px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #cbd5e1', alignItems: 'center', flexWrap: 'wrap' }}>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
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
  card: { background: 'white', padding: '22px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.03)' },
  input: { padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', width: '100%', boxSizing: 'border-box' as const, outline: 'none' },
  tblInput: { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', width: '100%', boxSizing: 'border-box' as const, outline: 'none' },
  label: { display: 'block', fontSize: '12px', color: '#475569', marginBottom: '6px', fontWeight: 'bold' },
  primaryBtn: { background: '#2563eb', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  successBtn: { background: '#059669', color: 'white', padding: '12px 24px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' },
  secondaryBtn: { background: '#e2e8f0', color: '#475569', padding: '10px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  logoutBtn: { background: 'transparent', color: '#f87171', border: '1px solid #f87171', padding: '8px', borderRadius: '6px', width: '100%', cursor: 'pointer' },
  menuItem: (isActive: boolean) => ({ padding: '11px 18px', cursor: 'pointer', color: isActive ? 'white' : '#94a3b8', background: isActive ? '#1e293b' : 'transparent', borderLeft: isActive ? '4px solid #dc2626' : '4px solid transparent', fontWeight: isActive ? 'bold' : 'normal', fontSize: '13px' }),
  thGroup: { padding: '10px', fontSize: '13px', borderRight: '1px solid #1e293b', borderBottom: '1px solid #334155' },
  thSub: { padding: '10px 8px', fontWeight: 'normal', fontSize: '12px', borderRight: '1px solid #334155' },
  td: { padding: '8px', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', fontSize: '13px' }
};
