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

const INITIAL_SHOWROOMS = [
  'Madurai',
  'Trichy',
  'Nellai',
  'Ambattur',
  'Tambaram',
  'Camp Road',
  'Medavakkam',
  'Salem',
  'Erode',
  'Guduvanchery'
];

const POMMYS_LOGO_URL = "https://chaodxrbgiqotdxxvjcj.supabase.co/storage/v1/object/public/assets/Pommys%20Logo%20Jepeg.jpg";

type UserRole = 'ADMIN' | 'OFFICE' | 'SALESMAN' | 'CUSTOMER';

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

const ALL_MENU_KEYS: MenuKey[] = [
  'dashboard',
  'grn',
  'cutting',
  'production',
  'storeroom',
  'readystock',
  'catalog',
  'costing',
  'tailor',
  'reports',
  'security',
  'yearclosing'
];

const MENU_ITEMS: { key: MenuKey; label: string; title: string; roles: UserRole[] }[] = [
  { key: 'dashboard', label: '🏠 Dashboard Overview', title: 'Pommys Garment ERP — Executive Dashboard', roles: ['ADMIN', 'OFFICE'] },
  { key: 'grn', label: '📥 Purchase & Opening Stock', title: 'Purchase GRN & Quick Opening Stock', roles: ['ADMIN', 'OFFICE'] },
  { key: 'cutting', label: '✂️ Fabric Issue & Cutting', title: 'Fabric Issue & Cutting Module', roles: ['ADMIN', 'OFFICE'] },
  { key: 'production', label: '🏭 Production WIP', title: 'Live Production Tracking (WIP)', roles: ['ADMIN', 'OFFICE'] },
  { key: 'storeroom', label: '🏪 Store Room & Trims', title: 'Store Room, Accessories & Trims Stock', roles: ['ADMIN', 'OFFICE'] },
  { key: 'readystock', label: '👕 Ready Stock & Showrooms', title: 'Ready Stock Godown & Retail Showroom Stock', roles: ['ADMIN', 'OFFICE', 'SALESMAN'] },
  { key: 'catalog', label: '📒 Salesman & Customer Catalog', title: 'Design Catalog & Sample Sheet', roles: ['ADMIN', 'OFFICE', 'SALESMAN', 'CUSTOMER'] },
  { key: 'costing', label: '🧮 Costing & Rate Fixer', title: 'Garment Costing & Wholesale/Retail Rate Fixer', roles: ['ADMIN'] },
  { key: 'tailor', label: '🧵 Tailor Ledger & Jobwork', title: 'Tailor & Stitching Job-Work Ledger', roles: ['ADMIN', 'OFFICE'] },
  { key: 'reports', label: '📊 Master Reports & Export', title: 'Godown, Showroom Stock & Supplier History Reports', roles: ['ADMIN', 'OFFICE'] },
  { key: 'security', label: '🔐 Security & Admin', title: 'User Roles, Rights & User Manager', roles: ['ADMIN'] },
  { key: 'yearclosing', label: '📁 Year Closing & Backup', title: 'Financial Year Closing & Data Backup Center', roles: ['ADMIN'] }
];

const LOGIN_TABS: { role: UserRole; label: string; subtitle: string; badgeBg: string; badgeColor: string }[] = [
  { role: 'ADMIN', label: '🛡️ Admin', subtitle: 'Admin Portal Login', badgeBg: '#fee2e2', badgeColor: '#b91c1c' },
  { role: 'OFFICE', label: '🏢 Office', subtitle: 'Office Staff Portal Login', badgeBg: '#dbeafe', badgeColor: '#1d4ed8' },
  { role: 'SALESMAN', label: '👔 Salesman', subtitle: 'Salesman Portal Login', badgeBg: '#fef3c7', badgeColor: '#b45309' },
  { role: 'CUSTOMER', label: '🛍️ Customer', subtitle: 'Customer Catalog Login', badgeBg: '#dcfce7', badgeColor: '#15803d' }
];

function normalizeRole(rawRole: any): UserRole {
  const upper = String(rawRole || 'CUSTOMER').toUpperCase();
  if (upper === 'ADMIN') return 'ADMIN';
  if (upper === 'OFFICE') return 'OFFICE';
  if (upper === 'SALESMAN') return 'SALESMAN';
  return 'CUSTOMER';
}

function getDefaultMenusForRole(role: UserRole): MenuKey[] {
  return MENU_ITEMS.filter(m => m.roles.includes(role)).map(m => m.key);
}

function getEffectiveMenus(userObj: any): MenuKey[] {
  const role = normalizeRole(userObj?.role);
  if (role === 'ADMIN') return ALL_MENU_KEYS;
  if (Array.isArray(userObj?.allowed_menus) && userObj.allowed_menus.length > 0) {
    return userObj.allowed_menus.filter((k: any) => ALL_MENU_KEYS.includes(k));
  }
  return getDefaultMenusForRole(role);
}

function useIsMobileOrTablet() {
  const [isCompact, setIsCompact] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  );

  useEffect(() => {
    const handleResize = () => setIsCompact(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isCompact;
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  if (!user) return <LoginScreen onLogin={setUser} />;
  return <Dashboard user={user} onLogout={() => setUser(null)} />;
}

// 1. 4 Separate Role Login Options
function LoginScreen({ onLogin }: { onLogin: (user: any) => void }) {
  const [selectedPortal, setSelectedPortal] = useState<UserRole>('ADMIN');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const activePortalMeta = LOGIN_TABS.find(t => t.role === selectedPortal) || LOGIN_TABS[0];

  const handlePortalSwitch = (role: UserRole) => {
    setSelectedPortal(role);
    setError('');
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data, error: dbError } = await supabase
      .from('pommys_users')
      .select('*')
      .eq('mobile_number', mobile.trim())
      .eq('password', password.trim())
      .single();
    setLoading(false);

    if (dbError || !data) {
      setError('Invalid Credentials!');
      return;
    }

    const actualRole = normalizeRole(data.role);
    if (actualRole !== selectedPortal) {
      setError(`Access Denied: This account belongs to ${actualRole}. Please use the ${actualRole} login option.`);
      return;
    }

    onLogin(data);
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: '#f1f5f9',
      fontFamily: '"Segoe UI", Tahoma, sans-serif',
      padding: 'max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom)) 16px',
      boxSizing: 'border-box'
    }}>
      <div style={{ background: 'white', padding: '28px 22px', borderRadius: '14px', boxShadow: '0 10px 25px rgba(0,0,0,0.06)', width: '100%', maxWidth: '460px', textAlign: 'center', boxSizing: 'border-box' }}>
        <img
          src={POMMYS_LOGO_URL}
          alt="Pommys Logo"
          style={{ height: '64px', marginBottom: '10px', objectFit: 'contain' }}
          onError={(e) => {
            const img = e.currentTarget;
            img.onerror = null;
            img.src = "https://via.placeholder.com/180x60/dc2626/ffffff?text=POMMYS";
          }}
        />
        <p style={{ color: '#475569', margin: '0 0 18px 0', fontSize: '14px', fontWeight: 'bold' }}>
          Select Login Option
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '18px' }}>
          {LOGIN_TABS.map(tab => {
            const isSelected = selectedPortal === tab.role;
            return (
              <button
                key={tab.role}
                type="button"
                onClick={() => handlePortalSwitch(tab.role)}
                style={{
                  padding: '11px 10px',
                  borderRadius: '8px',
                  border: isSelected ? '2px solid #0f172a' : '1px solid #cbd5e1',
                  background: isSelected ? '#0f172a' : '#f8fafc',
                  color: isSelected ? 'white' : '#1e293b',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div style={{
          display: 'inline-block',
          background: activePortalMeta.badgeBg,
          color: activePortalMeta.badgeColor,
          padding: '4px 12px',
          borderRadius: '20px',
          fontSize: '12px',
          fontWeight: 'bold',
          marginBottom: '16px'
        }}>
          {activePortalMeta.subtitle}
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input type="text" placeholder="User ID / Mobile Number" value={mobile} onChange={(e) => setMobile(e.target.value)} style={styles.input} required />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={styles.input} required />
          {error && <p style={{ color: '#ef4444', fontSize: '13px', margin: 0, fontWeight: 'bold' }}>{error}</p>}
          <button type="submit" disabled={loading} style={styles.primaryBtn}>
            {loading ? 'Authenticating...' : `Login as ${selectedPortal}`}
          </button>
        </form>
      </div>
    </div>
  );
}

// 2. Responsive Dashboard Layout
function Dashboard({ user, onLogout }: { user: any; onLogout: () => void }) {
  const isCompact = useIsMobileOrTablet();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const role = normalizeRole(user?.role);
  const effectiveMenuKeys = getEffectiveMenus(user);
  const allowedMenus = MENU_ITEMS.filter(m => effectiveMenuKeys.includes(m.key));
  const defaultMenu: MenuKey = allowedMenus[0]?.key || 'catalog';

  const [activeMenu, setActiveMenu] = useState<MenuKey>(defaultMenu);
  const currentMeta = allowedMenus.find(m => m.key === activeMenu) || allowedMenus[0];

  const hasQuickActions = effectiveMenuKeys.includes('grn') || effectiveMenuKeys.includes('cutting') || effectiveMenuKeys.includes('reports');

  const handleSelectMenu = (key: MenuKey) => {
    setActiveMenu(key);
    if (isCompact) setSidebarOpen(false);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%', maxWidth: '100vw', overflowX: 'hidden', background: '#f8fafc', fontFamily: '"Segoe UI", Tahoma, sans-serif' }}>
      {isCompact && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            zIndex: 998
          }}
        />
      )}

      <div
        style={{
          width: '265px',
          maxWidth: '82vw',
          background: '#0f172a',
          color: 'white',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          ...(isCompact
            ? {
                position: 'fixed',
                top: 0,
                left: 0,
                bottom: 0,
                zIndex: 999,
                transform: sidebarOpen ? 'translateX(0)' : 'translateX(-105%)',
                transition: 'transform 0.25s ease-in-out',
                boxShadow: sidebarOpen ? '8px 0 24px rgba(0,0,0,0.35)' : 'none',
                paddingTop: 'env(safe-area-inset-top)'
              }
            : {})
        }}
      >
        <div style={{ padding: '16px', borderBottom: '1px solid #1e293b', textAlign: 'center', background: 'white', position: 'relative' }}>
          {isCompact && (
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close Menu"
              style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                background: '#f1f5f9',
                color: '#0f172a',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                width: '30px',
                height: '30px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
          )}
          <img
            src={POMMYS_LOGO_URL}
            alt="Pommys Logo"
            style={{ height: '42px', objectFit: 'contain' }}
            onError={(e) => {
              const img = e.currentTarget;
              img.onerror = null;
              img.src = "https://via.placeholder.com/180x60/dc2626/ffffff?text=POMMYS";
            }}
          />
          <div style={{ fontSize: '12px', color: '#475569', marginTop: '6px', fontWeight: 'bold' }}>
            {user?.full_name || 'User'} ({role})
          </div>
        </div>

        <div style={{ flex: 1, padding: '10px 0', display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto' }}>
          {allowedMenus.map(item => (
            <div
              key={item.key}
              style={styles.menuItem(activeMenu === item.key)}
              onClick={() => handleSelectMenu(item.key)}
            >
              {item.label}
            </div>
          ))}
        </div>

        <div style={{ padding: '14px 16px max(14px, env(safe-area-inset-bottom)) 16px', borderTop: '1px solid #1e293b' }}>
          <button type="button" onClick={onLogout} style={styles.logoutBtn}>Logout</button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' }}>
        <div
          style={{
            background: 'white',
            padding: isCompact
              ? 'max(12px, env(safe-area-inset-top)) 14px 12px 14px'
              : '14px 24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
            position: 'sticky',
            top: 0,
            zIndex: 50
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: '1 1 auto' }}>
            {isCompact && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open Menu"
                style={{
                  background: '#0f172a',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  fontSize: '15px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                ☰ Menu
              </button>
            )}
            <h3
              style={{
                margin: 0,
                color: '#0f172a',
                fontSize: isCompact ? '15px' : '18px',
                lineHeight: 1.3,
                wordBreak: 'break-word'
              }}
            >
              {currentMeta?.title}
            </h3>
          </div>

          {hasQuickActions && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {effectiveMenuKeys.includes('grn') && (
                <button type="button" onClick={() => handleSelectMenu('grn')} style={{ ...styles.secondaryBtn, padding: '6px 10px', fontSize: '12px' }}>+ Entry / Stock</button>
              )}
              {effectiveMenuKeys.includes('cutting') && (
                <button type="button" onClick={() => handleSelectMenu('cutting')} style={{ ...styles.secondaryBtn, padding: '6px 10px', fontSize: '12px' }}>+ Cutting</button>
              )}
              {effectiveMenuKeys.includes('reports') && (
                <button type="button" onClick={() => handleSelectMenu('reports')} style={{ ...styles.secondaryBtn, padding: '6px 10px', fontSize: '12px' }}>Reports</button>
              )}
            </div>
          )}
        </div>

        <div style={{ flex: 1, padding: isCompact ? '14px 12px 60px 12px' : '22px', overflowY: 'auto', minWidth: 0 }}>
          {activeMenu === 'dashboard' && <DashboardHome onNavigate={handleSelectMenu} allowedMenus={allowedMenus} />}
          {activeMenu === 'grn' && <GRNEntryForm />}
          {activeMenu === 'cutting' && <CuttingEntryModule />}
          {activeMenu === 'production' && <ProductionTracking />}
          {activeMenu === 'storeroom' && <StoreRoomModule />}
          {activeMenu === 'readystock' && <ReadyStockShowroomModule canDelete={role === 'ADMIN'} />}
          {activeMenu === 'catalog' && <SalesmanCatalogModule hideCostRate={role === 'CUSTOMER'} />}
          {activeMenu === 'costing' && <CostingRateFixerModule />}
          {activeMenu === 'tailor' && <TailorLedgerModule />}
          {activeMenu === 'reports' && <ReportsModule />}
          {activeMenu === 'security' && <SecurityAdminModule currentUser={user} />}
          {activeMenu === 'yearclosing' && <YearClosingBackupModule />}
        </div>
      </div>
    </div>
  );
}

// 0. Executive Dashboard Overview
function DashboardHome({ onNavigate, allowedMenus }: { onNavigate: (menu: MenuKey) => void; allowedMenus: typeof MENU_ITEMS }) {
  const [stats, setStats] = useState({
    fabricMeters: 0,
    wipCount: 0,
    readyPieces: 0,
    transferredPieces: 0
  });

  useEffect(() => {
    const loadStats = async () => {
      const { data: fabric } = await supabase.from('pommys_fabric_stock').select('available_meters');
      const { data: wip } = await supabase.from('pommys_production_wip').select('id').neq('current_status', 'Ready Stock');
      const { data: ready } = await supabase.from('pommys_ready_stock').select('ready_pieces');
      const { data: transfers } = await supabase.from('pommys_showroom_transfers').select('transferred_pieces');

      const totalMeters = (fabric || []).reduce((acc: number, row: any) => acc + (Number(row.available_meters) || 0), 0);
      const totalReady = (ready || []).reduce((acc: number, row: any) => acc + (Number(row.ready_pieces) || 0), 0);
      const totalTransferred = (transfers || []).reduce((acc: number, row: any) => acc + (Number(row.transferred_pieces) || 0), 0);

      setStats({
        fabricMeters: totalMeters,
        wipCount: (wip || []).length,
        readyPieces: totalReady,
        transferredPieces: totalTransferred
      });
    };
    loadStats();
  }, []);

  const cards = [
    { label: 'Godown Fabric Stock (M)', value: stats.fabricMeters.toFixed(2), color: '#2563eb', target: 'grn' as MenuKey },
    { label: 'Active WIP Batches', value: String(stats.wipCount), color: '#d97706', target: 'production' as MenuKey },
    { label: 'Godown Ready Pieces', value: String(stats.readyPieces), color: '#059669', target: 'readystock' as MenuKey },
    { label: 'Showroom Stock (Transferred)', value: String(stats.transferredPieces), color: '#7c3aed', target: 'readystock' as MenuKey }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
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
        <h4 style={{ margin: '0 0 14px 0', color: '#0f172a' }}>Quick Navigation</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
          {allowedMenus.filter(m => m.key !== 'dashboard').map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item.key)}
              style={{ ...styles.secondaryBtn, textAlign: 'left', background: '#f8fafc', border: '1px solid #cbd5e1', width: '100%' }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// 3. Low-Entry GRN + Quick Opening Stock (Color Optional Everywhere)
function GRNEntryForm() {
  const [mode, setMode] = useState<'GRN' | 'OPENING'>('GRN');
  const [openingStage, setOpeningStage] = useState<'FABRIC' | 'CUTPARTS' | 'WIP' | 'READY'>('FABRIC');
  const [openingModel, setOpeningModel] = useState('Nighty');
  const [openingDesign, setOpeningDesign] = useState('');
  const [openingColor, setOpeningColor] = useState('');
  const [openingQty, setOpeningQty] = useState('');
  const [openingBatch, setOpeningBatch] = useState('');
  const [savingOpening, setSavingOpening] = useState(false);

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

  const handleAddColorVariant = () => {
    const last = items[items.length - 1] || initialItemState;
    setItems([
      ...items,
      {
        ...initialItemState,
        itemDetails: last.itemDetails,
        quality: last.quality,
        width: last.width,
        meterFold: last.meterFold,
        itemRate: last.itemRate,
        gstPercentage: last.gstPercentage,
        designNo: last.designNo,
        color: ''
      }
    ]);
  };

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
          bill_id: billData.id,
          item_name: item.itemDetails || 'Fabric',
          quality: item.quality,
          fabric_width: item.width,
          meter_fold: item.meterFold,
          rate_per_meter: isJobWork ? 0 : (Number(item.itemRate) || 0),
          gst_percentage: Number(item.gstPercentage) || 0,
          design_no: item.designNo || '-',
          color: item.color?.trim() || '-',
          image_url: imageUrl,
          total_meters: qty,
          damage_meters: dmg,
          shortage_meters: short,
          return_booking_details: item.returnBooking,
          net_meters: netQty,
          available_meters: netQty
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

  const handleSaveOpeningStock = async (e: FormEvent) => {
    e.preventDefault();
    const numQty = Number(openingQty);
    if (!numQty || numQty <= 0) {
      alert('Please enter valid Meter / Pieces quantity.');
      return;
    }
    const batchLabel = openingBatch.trim() || `OPN-${openingStage}-${Math.floor(1000 + Math.random() * 9000)}`;
    const colorVal = openingColor.trim() || '-';
    setSavingOpening(true);
    try {
      if (openingStage === 'FABRIC') {
        const { error } = await supabase.from('pommys_fabric_stock').insert([{
          item_name: openingModel.trim() || 'Opening Fabric',
          design_no: openingDesign.trim() || batchLabel,
          color: colorVal,
          total_meters: numQty,
          net_meters: numQty,
          available_meters: numQty,
          rate_per_meter: 0,
          gst_percentage: 5
        }]);
        if (error) throw error;
      } else if (openingStage === 'CUTPARTS' || openingStage === 'WIP') {
        const statusVal = openingStage === 'CUTPARTS' ? 'Cutting' : 'Stitching';
        const { error } = await supabase.from('pommys_production_wip').insert([{
          batch_code: batchLabel,
          model_name: `${openingModel.trim() || 'Garment'}${openingDesign.trim() ? ` - ${openingDesign.trim()}` : ''}${openingColor.trim() ? ` (${openingColor.trim()})` : ''}`,
          total_pieces: numQty,
          current_status: statusVal
        }]);
        if (error) throw error;
      } else if (openingStage === 'READY') {
        const { error } = await supabase.from('pommys_ready_stock').insert([{
          batch_code: batchLabel,
          model_name: openingModel.trim() || 'Garment',
          design_no: openingDesign.trim() || '-',
          color: colorVal,
          ready_pieces: numQty
        }]);
        if (error) throw error;
      }

      alert(`✅ ${openingStage} stock (${numQty}) saved successfully!`);
      setOpeningDesign('');
      setOpeningColor('');
      setOpeningQty('');
      setOpeningBatch('');
    } catch (err: any) {
      alert('Error saving opening entry: ' + (err?.message || String(err)));
    } finally {
      setSavingOpening(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setMode('GRN')}
          style={{ ...styles.secondaryBtn, background: mode === 'GRN' ? '#0f172a' : '#e2e8f0', color: mode === 'GRN' ? 'white' : '#334155' }}
        >
          📥 Purchase & GRN Entry
        </button>
        <button
          type="button"
          onClick={() => setMode('OPENING')}
          style={{ ...styles.secondaryBtn, background: mode === 'OPENING' ? '#059669' : '#e2e8f0', color: mode === 'OPENING' ? 'white' : '#334155' }}
        >
          ⚡ Quick Opening Stock (Fabric / Cutparts / WIP / Ready)
        </button>
      </div>

      {mode === 'OPENING' ? (
        <div style={styles.card}>
          <h4 style={{ margin: '0 0 10px 0', color: '#0f172a' }}>⚡ Quick Opening Stock Upload (Low Entry — Color Optional)</h4>
          <p style={{ fontSize: '13px', color: '#475569', marginTop: 0 }}>
            Stage மற்றும் Qty மட்டும் கொடுத்தால் போதும்; Batch Code மற்றும் Color அவசியமில்லை என்றால் காலியாக விடலாம்.
          </p>
          <form onSubmit={handleSaveOpeningStock} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
            <div>
              <label style={styles.label}>1. Stock Stage *</label>
              <select value={openingStage} onChange={(e) => setOpeningStage(e.target.value as any)} style={styles.input}>
                <option value="FABRIC">Fabric Stock (Meters)</option>
                <option value="CUTPARTS">Cutparts (Pieces)</option>
                <option value="WIP">On-Process / Stitching WIP (Pieces)</option>
                <option value="READY">Ready Goods Godown (Pieces)</option>
              </select>
            </div>
            <div>
              <label style={styles.label}>2. Model / Item *</label>
              <input type="text" placeholder="Nighty / Kurti / Night Suit" value={openingModel} onChange={(e) => setOpeningModel(e.target.value)} style={styles.input} required />
            </div>
            <div>
              <label style={styles.label}>3. Meters / Pieces Qty *</label>
              <input type="number" placeholder="Enter Qty" value={openingQty} onChange={(e) => setOpeningQty(e.target.value)} style={styles.input} required />
            </div>
            <div>
              <label style={styles.label}>Design No (Optional)</label>
              <input type="text" placeholder="Optional" value={openingDesign} onChange={(e) => setOpeningDesign(e.target.value)} style={styles.input} />
            </div>
            <div>
              <label style={styles.label}>Color (Optional)</label>
              <input type="text" placeholder="Optional" value={openingColor} onChange={(e) => setOpeningColor(e.target.value)} style={styles.input} />
            </div>
            <div>
              <label style={styles.label}>Batch / Ref (Optional)</label>
              <input type="text" placeholder="Auto if blank" value={openingBatch} onChange={(e) => setOpeningBatch(e.target.value)} style={styles.input} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="submit" disabled={savingOpening} style={{ ...styles.successBtn, width: '100%' }}>
                {savingOpening ? 'Saving...' : '+ Add Stock'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div style={styles.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', background: '#f0f9ff', border: '1px solid #bae6fd', padding: '14px 16px', borderRadius: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <h4 style={{ margin: 0, color: '#0369a1', fontSize: '15px' }}>Select Inward Type:</h4>
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontWeight: bill.inwardType === 'OWN_FABRIC' ? 'bold' : 'normal' }}><input type="radio" name="inwardType" value="OWN_FABRIC" checked={bill.inwardType === 'OWN_FABRIC'} onChange={handleBillChange} /> 🏭 Own Fabric</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontWeight: bill.inwardType === 'RMG' ? 'bold' : 'normal' }}><input type="radio" name="inwardType" value="RMG" checked={bill.inwardType === 'RMG'} onChange={handleBillChange} /> 👕 RMG (Ready-Made)</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontWeight: bill.inwardType === 'JOB_WORK' ? 'bold' : 'normal' }}><input type="radio" name="inwardType" value="JOB_WORK" checked={bill.inwardType === 'JOB_WORK'} onChange={handleBillChange} /> ✂️ Job Work</label>
            </div>
          </div>

          <h4 style={{ color: '#0f172a', marginBottom: '14px', paddingBottom: '8px', borderBottom: '2px solid #f1f5f9' }}>A) Supplier & Bill Details</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px', marginBottom: '24px' }}>
            <div>
              <label style={styles.label}>{isJobWork ? 'Client / Supplier Name *' : 'Supplier Name *'}</label>
              <select value={bill.isNewSupplier ? 'NEW' : suppliers.find(s => s.name === bill.supplierName)?.id || ''} onChange={handleSupplierSelect} style={styles.input}>
                <option value="">-- Select Existing --</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                <option value="NEW" style={{ fontWeight: 'bold', color: '#2563eb' }}>+ Add New Party</option>
              </select>
              {bill.isNewSupplier && <input type="text" name="supplierName" placeholder="Enter New Party Name" value={bill.supplierName} onChange={handleBillChange} style={{ ...styles.input, marginTop: '10px', borderColor: '#2563eb' }} />}
            </div>
            <div><label style={styles.label}>{isJobWork ? 'Challan No. *' : 'Bill No. *'}</label><input type="text" name="billNo" value={bill.billNo} onChange={handleBillChange} style={styles.input} /></div>
            <div><label style={styles.label}>{isJobWork ? 'Challan Date' : 'Bill Date'}</label><input type="date" name="billDate" value={bill.billDate} onChange={handleBillChange} style={styles.input} /></div>
            <div><label style={styles.label}>No. of Bales</label><input type="number" name="noOfBales" value={bill.noOfBales} onChange={handleBillChange} style={styles.input} /></div>
            <div><label style={styles.label}>LR No.</label><input type="text" name="lrNo" value={bill.lrNo} onChange={handleBillChange} style={styles.input} /></div>
            <div><label style={styles.label}>Bale No(s).</label><input type="text" name="baleNo" value={bill.baleNo} placeholder="Ex: B-101" onChange={handleBillChange} style={styles.input} /></div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', paddingBottom: '8px', borderBottom: '2px solid #f1f5f9', flexWrap: 'wrap', gap: '10px' }}>
            <h4 style={{ color: '#0f172a', margin: 0 }}>B) Inventory Breakdown (Color is Optional)</h4>
            <button type="button" onClick={handleAddColorVariant} style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd', padding: '6px 12px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>
              + Duplicate Row for Another Color (Optional)
            </button>
          </div>

          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: '20px', border: '1px solid #cbd5e1', borderRadius: '8px' }}>
            <table style={{ width: '100%', minWidth: '1320px', borderCollapse: 'collapse', textAlign: 'left', background: 'white' }}>
              <thead>
                <tr style={{ background: '#0f172a', color: 'white', textAlign: 'center' }}>
                  <th colSpan={isRMG ? 2 : 4} style={styles.thGroup}>Fabric Specifications</th>
                  <th colSpan={3} style={styles.thGroup}>Design Variant (Color Optional)</th>
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
                  <th style={{ ...styles.thSub, width: '100px' }}>Color (Opt)</th>
                  <th style={{ ...styles.thSub, width: '150px' }}>Image (Opt)</th>
                  {!isJobWork && <th style={{ ...styles.thSub, width: '80px', color: '#fbbf24' }}>Rate</th>}
                  {!isJobWork && <th style={{ ...styles.thSub, width: '70px', color: '#38bdf8' }}>GST %</th>}
                  {!isRMG && <th style={{ ...styles.thSub, width: '90px' }}>Total Mtr *</th>}
                  {isRMG && <th style={{ ...styles.thSub, width: '90px' }}>Total Pcs *</th>}
                  {!isJobWork && <th style={{ ...styles.thSub, width: '100px' }}>Total Val</th>}
                  <th style={{ ...styles.thSub, width: '70px' }}>Dmg</th>
                  <th style={{ ...styles.thSub, width: '70px' }}>Short</th>
                  <th style={{ ...styles.thSub, width: '90px' }}>Return</th>
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
                      <td style={styles.td}><input type="text" placeholder="Item" value={item.itemDetails} onChange={(e) => handleItemChange(idx, 'itemDetails', e.target.value)} style={styles.tblInput} /></td>
                      {!isRMG && <td style={styles.td}><input type="text" value={item.quality} onChange={(e) => handleItemChange(idx, 'quality', e.target.value)} style={styles.tblInput} /></td>}
                      {!isRMG && <td style={styles.td}><input type="text" value={item.width} onChange={(e) => handleItemChange(idx, 'width', e.target.value)} style={styles.tblInput} /></td>}
                      {!isRMG && <td style={styles.td}><input type="text" value={item.meterFold} onChange={(e) => handleItemChange(idx, 'meterFold', e.target.value)} style={styles.tblInput} /></td>}
                      {isRMG && <td style={styles.td}><input type="text" value={item.sizeDetails} onChange={(e) => handleItemChange(idx, 'sizeDetails', e.target.value)} style={styles.tblInput} /></td>}
                      <td style={styles.td}><input type="text" value={item.designNo} onChange={(e) => handleItemChange(idx, 'designNo', e.target.value)} style={styles.tblInput} /></td>
                      <td style={styles.td}><input type="text" placeholder="Optional" value={item.color} onChange={(e) => handleItemChange(idx, 'color', e.target.value)} style={styles.tblInput} /></td>
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

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '12px' }}>
            <button type="button" onClick={handleAddItem} style={styles.secondaryBtn}>+ Add Row</button>
            {!isJobWork && <div style={{ fontSize: '16px', color: '#0f172a' }}>Grand Total (with GST): <strong style={{ color: '#dc2626' }}>₹ {grandTotal.toFixed(2)}</strong></div>}
            <button type="button" onClick={handleSaveGRN} disabled={saving} style={styles.successBtn}>{saving ? 'Saving...' : '💾 Save & Update Stock'}</button>
          </div>
        </div>
      )}

      {selectedImageModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '16px' }}>
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
    const activeBatch = batchCode || `CUT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    if (validFabrics.length === 0) return alert("Please select at least one fabric!");
    const finalModel = modelSelection === 'NEW' ? customModel : modelSelection;
    if (!finalModel) return alert("Please select a Model Name!");

    setSaving(true);
    try {
      const totalPieces = sizes.reduce((sum, s) => sum + (Number(s.pieces) || 0), 0);

      const { error: batchErr } = await supabase.from('pommys_cutting_batches').insert([{
        batch_code: activeBatch, selected_fabrics_json: validFabrics, product_model: finalModel,
        size_pieces_json: sizes, total_pieces: totalPieces, end_bit_meters: Number(endBits) || 0
      }]);
      if (batchErr) throw batchErr;

      const { error: wipErr } = await supabase.from('pommys_production_wip').insert([{
        batch_code: activeBatch, model_name: finalModel, total_pieces: totalPieces, current_status: 'Cutting'
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
      alert(`🎉 Batch ${activeBatch} saved & sent to WIP!`);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #f1f5f9', paddingBottom: '10px', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
        <h3 style={{ margin: 0, color: '#0f172a', fontSize: '17px' }}>✂️ Fabric Issue & Cutting</h3>
        <button type="button" onClick={handleGenerateCode} style={styles.secondaryBtn} disabled={!isFabricSelected}>
          {batchCode ? `Batch: ${batchCode}` : 'Auto Batch Code'}
        </button>
      </div>
      <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
        <label style={styles.label}>1. Select Fabric from Godown Stock:</label>
        {selectedFabrics.map((fab, idx) => (
          <div key={idx} style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <select value={fab.stockId} onChange={(e) => handleFabricChange(idx, 'stockId', e.target.value)} style={{ ...styles.input, flex: '2 1 220px' }}>
              <option value="">-- Select Fabric / Design --</option>
              {stockList.map(stock => (
                <option key={stock.id} value={stock.id}>
                  {stock.item_name || 'Fabric'} | Design: {stock.design_no || '-'} {stock.color && stock.color !== '-' ? `(${stock.color})` : ''} — Avail: {stock.available_meters} M
                </option>
              ))}
            </select>
            <input type="number" placeholder="Issue Meters" value={fab.issueMeters} onChange={(e) => handleFabricChange(idx, 'issueMeters', e.target.value)} style={{ ...styles.input, flex: '1 1 130px' }} disabled={!fab.stockId} />
            {idx > 0 && <button type="button" onClick={() => handleRemoveFabricRow(idx)} style={{ background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '6px', padding: '8px 14px', cursor: 'pointer', fontWeight: 'bold' }}>X</button>}
          </div>
        ))}
        <button type="button" onClick={handleAddFabricRow} style={{ ...styles.secondaryBtn, marginTop: '8px' }}>+ Add Another Fabric</button>
      </div>
      <div style={{ opacity: isFabricSelected ? 1 : 0.5, pointerEvents: isFabricSelected ? 'auto' : 'none' }}>
        <div style={{ marginBottom: '18px', maxWidth: '420px' }}>
          <label style={styles.label}>2. Model Name *</label>
          <select value={modelSelection} onChange={(e) => setModelSelection(e.target.value)} style={{ ...styles.input, marginBottom: '10px' }}>
            <option value="">-- Select Model --</option>
            {predefinedModels.map(m => <option key={m} value={m}>{m}</option>)}
            <option value="NEW" style={{ fontWeight: 'bold', color: '#2563eb' }}>+ Add New Model</option>
          </select>
          {modelSelection === 'NEW' && <input type="text" placeholder="Enter New Model Name" value={customModel} onChange={(e) => setCustomModel(e.target.value)} style={{ ...styles.input, borderColor: '#3b82f6' }} />}
        </div>
        <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', marginBottom: '18px' }}>
          <label style={styles.label}>3. Size & Pieces *</label>
          {sizes.map((s, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '10px' }}>
              <input type="text" placeholder="Size (L, XL / Free)" value={s.size} onChange={(e) => handleSizeChange(idx, 'size', e.target.value)} style={styles.input} />
              <input type="number" placeholder="Pieces *" value={s.pieces} onChange={(e) => handleSizeChange(idx, 'pieces', e.target.value)} style={styles.input} />
              <input type="number" placeholder="Avg Mtr/Pc (Opt)" value={s.consumption} onChange={(e) => handleSizeChange(idx, 'consumption', e.target.value)} style={styles.input} />
            </div>
          ))}
          <button type="button" onClick={handleAddSize} style={styles.secondaryBtn}>+ Add Size</button>
        </div>
        <div style={{ borderTop: '2px solid #f1f5f9', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontWeight: 'bold', color: '#475569', fontSize: '13px' }}>End Bits (Opt):</label>
            <input type="number" placeholder="Meters" value={endBits} onChange={(e) => setEndBits(e.target.value)} style={{ ...styles.input, width: '120px' }} />
          </div>
          <button type="button" onClick={handleSaveBatch} disabled={saving} style={styles.successBtn}>{saving ? 'Saving...' : '💾 Save Batch & Send to WIP'}</button>
        </div>
      </div>
    </div>
  );
}

// 5. Production WIP Tracking (Full or Partial Piece Movement)
function ProductionTracking() {
  const [wipBatches, setWipBatches] = useState<any[]>([]);
  const [moveQtyMap, setMoveQtyMap] = useState<Record<number, string>>({});

  useEffect(() => { fetchWIP(); }, []);

  const fetchWIP = async () => {
    const { data } = await supabase.from('pommys_production_wip').select('*').neq('current_status', 'Ready Stock').order('id', { ascending: false });
    if (data) setWipBatches(data);
  };

  const getNextStatus = (current: string) => {
    if (current === 'Cutting') return 'Stitching';
    if (current === 'Stitching') return 'QC Check';
    if (current === 'QC Check') return 'Packing';
    if (current === 'Packing') return 'Ready Stock';
    return null;
  };

  const handleMoveBatch = async (batch: any, newStatus: string) => {
    const totalPcs = Number(batch.total_pieces) || 0;
    const rawInput = moveQtyMap[batch.id];
    const pcsToMove = rawInput !== undefined && rawInput !== '' ? Number(rawInput) : totalPcs;

    if (!pcsToMove || pcsToMove <= 0 || pcsToMove > totalPcs) {
      alert(`Enter valid piece count between 1 and ${totalPcs}.`);
      return;
    }

    if (pcsToMove < totalPcs) {
      const remaining = totalPcs - pcsToMove;
      await supabase.from('pommys_production_wip').update({ total_pieces: remaining }).eq('id', batch.id);
      if (newStatus === 'Ready Stock') {
        await supabase.from('pommys_ready_stock').insert([{
          batch_code: `${batch.batch_code}-P`,
          model_name: batch.model_name,
          color: '-',
          ready_pieces: pcsToMove
        }]);
      } else {
        await supabase.from('pommys_production_wip').insert([{
          batch_code: `${batch.batch_code}-P`,
          model_name: batch.model_name,
          total_pieces: pcsToMove,
          current_status: newStatus
        }]);
      }
      alert(`✅ ${pcsToMove} pcs moved to ${newStatus}; ${remaining} pcs remain in ${batch.current_status}.`);
    } else {
      await supabase.from('pommys_production_wip').update({ current_status: newStatus }).eq('id', batch.id);
      if (newStatus === 'Ready Stock') {
        await supabase.from('pommys_ready_stock').insert([{
          batch_code: batch.batch_code,
          model_name: batch.model_name,
          color: '-',
          ready_pieces: totalPcs
        }]);
        alert(`🎉 Batch ${batch.batch_code} (${totalPcs} pcs) moved to Ready Stock!`);
      }
    }

    setMoveQtyMap(prev => ({ ...prev, [batch.id]: '' }));
    fetchWIP();
  };

  return (
    <div style={styles.card}>
      <h3 style={{ margin: '0 0 10px 0', color: '#0f172a', borderBottom: '2px solid #f1f5f9', paddingBottom: '10px', fontSize: '17px' }}>🏭 Live Production Tracking (WIP)</h3>
      <p style={{ fontSize: '12px', color: '#64748b', marginTop: 0 }}>
        முழு பீஸ்களையும் நகர்த்த Move Qty காலியாக விடலாம்; பகுதி பீஸ்களை மட்டும் நகர்த்த எண்ணிக்கையை உள்ளிடலாம்.
      </p>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', minWidth: '640px', borderCollapse: 'collapse', textAlign: 'left', background: 'white' }}>
          <thead>
            <tr style={{ background: '#1e293b', color: 'white' }}>
              <th style={styles.thSub}>Batch Code</th>
              <th style={styles.thSub}>Model</th>
              <th style={styles.thSub}>Total Pcs</th>
              <th style={styles.thSub}>Current Status</th>
              <th style={styles.thSub}>Partial Pcs (Opt)</th>
              <th style={styles.thSub}>Action</th>
            </tr>
          </thead>
          <tbody>
            {wipBatches.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>No Active Batches in WIP</td></tr>
            ) : wipBatches.map((batch, idx) => {
              const nextStat = getNextStatus(batch.current_status);
              return (
                <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={styles.td}><strong>{batch.batch_code}</strong></td>
                  <td style={styles.td}>{batch.model_name}</td>
                  <td style={styles.td}><strong>{batch.total_pieces}</strong></td>
                  <td style={styles.td}>
                    <span style={{ background: '#fef3c7', color: '#b45309', padding: '5px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{batch.current_status}</span>
                  </td>
                  <td style={styles.td}>
                    <input
                      type="number"
                      placeholder={`All (${batch.total_pieces})`}
                      value={moveQtyMap[batch.id] || ''}
                      onChange={(e) => setMoveQtyMap(prev => ({ ...prev, [batch.id]: e.target.value }))}
                      style={{ ...styles.tblInput, width: '95px' }}
                    />
                  </td>
                  <td style={styles.td}>
                    {nextStat && <button type="button" onClick={() => handleMoveBatch(batch, nextStat)} style={{ ...styles.primaryBtn, padding: '6px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}>Move to {nextStat} ➡️</button>}
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
  const [trims, setTrims] = useState<any[]>([]);
  const [itemName, setItemName] = useState('');
  const [unit, setUnit] = useState('Mtr');
  const [qty, setQty] = useState('');

  const loadTrims = async () => {
    const { data, error } = await supabase.from('pommys_store_trims').select('*').order('id', { ascending: false });
    if (!error && data) {
      setTrims(data);
    } else {
      setTrims([
        { id: 1, item_name: 'Lace Border', unit: 'Mtr', qty: 120, reorder_level: 30 },
        { id: 2, item_name: 'Elastic Band (1 inch)', unit: 'Roll', qty: 45, reorder_level: 15 }
      ]);
    }
  };

  useEffect(() => { loadTrims(); }, []);

  const addTrim = async (e: FormEvent) => {
    e.preventDefault();
    if (!itemName.trim() || !qty) return;
    const payload = { item_name: itemName.trim(), unit, qty: Number(qty), reorder_level: 20 };
    const { error } = await supabase.from('pommys_store_trims').insert([payload]);
    if (error) {
      setTrims([{ id: Date.now(), ...payload }, ...trims]);
    } else {
      await loadTrims();
    }
    setItemName('');
    setQty('');
  };

  return (
    <div style={styles.card}>
      <h4 style={{ margin: '0 0 16px 0', color: '#0f172a' }}>🏪 Store Room, Trims & Accessories</h4>
      <form onSubmit={addTrim} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '20px' }}>
        <input type="text" placeholder="Trim / Accessory Name" value={itemName} onChange={(e) => setItemName(e.target.value)} style={styles.input} />
        <select value={unit} onChange={(e) => setUnit(e.target.value)} style={styles.input}>
          <option value="Mtr">Mtr</option>
          <option value="Roll">Roll</option>
          <option value="Packet">Packet</option>
          <option value="Pcs">Pcs</option>
        </select>
        <input type="number" placeholder="Quantity" value={qty} onChange={(e) => setQty(e.target.value)} style={styles.input} />
        <button type="submit" style={styles.primaryBtn}>+ Add Trim Stock</button>
      </form>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', minWidth: '480px', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead><tr style={{ background: '#0f172a', color: 'white' }}>
            <th style={styles.thSub}>Trim / Accessory</th><th style={styles.thSub}>Unit</th><th style={styles.thSub}>Available Qty</th><th style={styles.thSub}>Status</th>
          </tr></thead>
          <tbody>
            {trims.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={styles.td}><strong>{t.item_name}</strong></td>
                <td style={styles.td}>{t.unit}</td>
                <td style={styles.td}>{t.qty}</td>
                <td style={styles.td}>{Number(t.qty) <= Number(t.reorder_level || 20) ? '⚠️ Low Stock' : '✅ Sufficient'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 7. Ready Stock Godown + Retail Showroom Stock Transfer & Bifurcation
function ReadyStockShowroomModule({ canDelete }: { canDelete: boolean }) {
  const [readyList, setReadyList] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [showrooms, setShowrooms] = useState<string[]>(INITIAL_SHOWROOMS);
  const [newShowroomName, setNewShowroomName] = useState('');

  const [selectedStockId, setSelectedStockId] = useState('');
  const [targetShowroom, setTargetShowroom] = useState(INITIAL_SHOWROOMS[0]);
  const [challanNo, setChallanNo] = useState('');
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [transferQty, setTransferQty] = useState('');
  const [sizeNote, setSizeNote] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadAll = async () => {
    const { data: ready } = await supabase.from('pommys_ready_stock').select('*').order('id', { ascending: false });
    if (ready) setReadyList(ready.filter((r: any) => Number(r.ready_pieces) > 0));

    const { data: trf, error: trfErr } = await supabase.from('pommys_showroom_transfers').select('*').order('id', { ascending: false });
    if (!trfErr && trf) {
      setTransfers(trf);
      const customBranches = Array.from(new Set(trf.map((x: any) => x.showroom_name).filter(Boolean)));
      setShowrooms(prev => Array.from(new Set([...prev, ...customBranches])));
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleAddShowroom = () => {
    const trimmed = newShowroomName.trim();
    if (!trimmed) return;
    if (!showrooms.includes(trimmed)) {
      setShowrooms(prev => [...prev, trimmed]);
    }
    setTargetShowroom(trimmed);
    setNewShowroomName('');
  };

  const handleTransferToShowroom = async (e: FormEvent) => {
    e.preventDefault();
    const stockRow = readyList.find(r => String(r.id) === String(selectedStockId));
    const pcsToSend = Number(transferQty);

    if (!stockRow) {
      alert('Please select a Ready Stock batch from Godown.');
      return;
    }
    const availablePcs = Number(stockRow.ready_pieces) || 0;
    if (!pcsToSend || pcsToSend <= 0 || pcsToSend > availablePcs) {
      alert(`Enter valid transfer pieces (Available in Godown: ${availablePcs}).`);
      return;
    }

    setTransferring(true);
    try {
      const generatedChallan = challanNo.trim() || `TRF-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

      const { error: insErr } = await supabase.from('pommys_showroom_transfers').insert([{
        challan_no: generatedChallan,
        transfer_date: transferDate || new Date().toISOString().slice(0, 10),
        showroom_name: targetShowroom,
        batch_code: stockRow.batch_code,
        design_no: stockRow.design_no || '-',
        color: stockRow.color || '-',
        model_name: stockRow.model_name || '-',
        size_details: sizeNote.trim() || '-',
        transferred_pieces: pcsToSend,
        status: 'Transferred to Showroom'
      }]);
      if (insErr) throw insErr;

      const remainingGodownPcs = Math.max(0, availablePcs - pcsToSend);
      const { error: updErr } = await supabase
        .from('pommys_ready_stock')
        .update({ ready_pieces: remainingGodownPcs })
        .eq('id', stockRow.id);
      if (updErr) throw updErr;

      alert(`✅ ${pcsToSend} pcs transferred to ${targetShowroom} Showroom!`);
      setTransferQty('');
      setChallanNo('');
      setSizeNote('');
      setSelectedStockId('');
      await loadAll();
    } catch (err: any) {
      alert('Transfer failed: ' + (err?.message || String(err)));
    } finally {
      setTransferring(false);
    }
  };

  const handleDeleteReady = async (row: any) => {
    const confirmed = window.confirm(`Delete batch "${row.batch_code}" (${row.ready_pieces} pcs) from Ready Stock?`);
    if (!confirmed) return;

    setDeletingId(row.id);
    try {
      const { error } = await supabase.from('pommys_ready_stock').delete().eq('id', row.id);
      if (error) {
        alert('Error deleting record: ' + error.message);
      } else {
        setReadyList(prev => prev.filter(item => item.id !== row.id));
      }
    } finally {
      setDeletingId(null);
    }
  };

  const totalGodownPcs = readyList.reduce((sum, r) => sum + (Number(r.ready_pieces) || 0), 0);
  const totalShowroomPcs = transfers.reduce((sum, t) => sum + (Number(t.transferred_pieces) || 0), 0);

  const showroomTotals = showrooms.map(branch => {
    const branchRows = transfers.filter(t => t.showroom_name === branch);
    const totalPcs = branchRows.reduce((s, r) => s + (Number(r.transferred_pieces) || 0), 0);
    return { branch, totalPcs, challanCount: branchRows.length };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
        <div style={{ ...styles.card, borderTop: '4px solid #059669' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>CENTRAL GODOWN READY STOCK</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#059669', marginTop: '4px' }}>{totalGodownPcs} Pcs</div>
        </div>
        <div style={{ ...styles.card, borderTop: '4px solid #2563eb' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>TOTAL RETAIL SHOWROOM STOCK</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2563eb', marginTop: '4px' }}>{totalShowroomPcs} Pcs</div>
        </div>
        <div style={{ ...styles.card, borderTop: '4px solid #7c3aed' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>OVERALL FINISHED STOCK</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0f172a', marginTop: '4px' }}>{totalGodownPcs + totalShowroomPcs} Pcs</div>
        </div>
      </div>

      <div style={styles.card}>
        <h4 style={{ margin: '0 0 14px 0', color: '#0f172a' }}>🚚 Transfer Ready Goods to Retail Showroom (Low Entry)</h4>
        <form onSubmit={handleTransferToShowroom} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
          <div>
            <label style={styles.label}>1. Select Ready Stock Batch *</label>
            <select value={selectedStockId} onChange={(e) => setSelectedStockId(e.target.value)} style={styles.input} required>
              <option value="">-- Choose Batch --</option>
              {readyList.map(r => (
                <option key={r.id} value={r.id}>
                  {r.batch_code} | {r.model_name} {r.color && r.color !== '-' ? `(${r.color})` : ''} — {r.ready_pieces} Pcs
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={styles.label}>2. Target Retail Showroom *</label>
            <select value={targetShowroom} onChange={(e) => setTargetShowroom(e.target.value)} style={styles.input}>
              {showrooms.map(sr => <option key={sr} value={sr}>{sr}</option>)}
            </select>
          </div>
          <div>
            <label style={styles.label}>3. Transfer Pieces *</label>
            <input type="number" placeholder="Pieces to Send" value={transferQty} onChange={(e) => setTransferQty(e.target.value)} style={styles.input} required />
          </div>
          <div>
            <label style={styles.label}>Size / Note (Optional)</label>
            <input type="text" placeholder="Optional" value={sizeNote} onChange={(e) => setSizeNote(e.target.value)} style={styles.input} />
          </div>
          <div>
            <label style={styles.label}>Challan No. (Optional)</label>
            <input type="text" placeholder="Auto if blank" value={challanNo} onChange={(e) => setChallanNo(e.target.value)} style={styles.input} />
          </div>
          <div>
            <label style={styles.label}>Transfer Date</label>
            <input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} style={styles.input} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" disabled={transferring} style={{ ...styles.primaryBtn, width: '100%' }}>
              {transferring ? 'Transferring...' : '🚚 Transfer Stock'}
            </button>
          </div>
        </form>

        <div style={{ display: 'flex', gap: '8px', marginTop: '14px', paddingTop: '12px', borderTop: '1px dashed #cbd5e1', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="New Showroom / Branch Name"
            value={newShowroomName}
            onChange={(e) => setNewShowroomName(e.target.value)}
            style={{ ...styles.tblInput, maxWidth: '220px' }}
          />
          <button type="button" onClick={handleAddShowroom} style={{ ...styles.secondaryBtn, padding: '7px 12px', fontSize: '12px' }}>
            + Add Showroom Branch
          </button>
        </div>
      </div>

      <div style={styles.card}>
        <h4 style={{ margin: '0 0 14px 0', color: '#0f172a' }}>🏬 Showroom-Wise Stock Bifurcation (Branch Stock)</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: '10px' }}>
          {showroomTotals.map(item => (
            <div
              key={item.branch}
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: '10px',
                padding: '12px',
                background: item.totalPcs > 0 ? '#f0f9ff' : '#f8fafc'
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#0f172a' }}>{item.branch}</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0369a1', marginTop: '6px' }}>{item.totalPcs} Pcs</div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>{item.challanCount} Challan(s)</div>
            </div>
          ))}
        </div>
      </div>

      <div style={styles.card}>
        <h4 style={{ margin: '0 0 14px 0', color: '#0f172a' }}>👕 Central Godown Ready Stock</h4>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: '500px', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#0f172a', color: 'white' }}>
                <th style={styles.thSub}>Batch Code</th>
                <th style={styles.thSub}>Model</th>
                <th style={styles.thSub}>Color (Opt)</th>
                <th style={styles.thSub}>Godown Pcs</th>
                {canDelete && <th style={{ ...styles.thSub, width: '110px', textAlign: 'center' }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {readyList.length === 0 ? (
                <tr><td colSpan={canDelete ? 5 : 4} style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>No Ready Stock in Central Godown.</td></tr>
              ) : readyList.map((r, idx) => (
                <tr key={r.id ?? idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={styles.td}><strong>{r.batch_code}</strong></td>
                  <td style={styles.td}>{r.model_name}</td>
                  <td style={styles.td}>{r.color || '-'}</td>
                  <td style={{ ...styles.td, color: '#059669', fontWeight: 'bold' }}>{r.ready_pieces}</td>
                  {canDelete && (
                    <td style={{ ...styles.td, textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleDeleteReady(r)}
                        disabled={deletingId === r.id}
                        style={{
                          background: '#fee2e2',
                          color: '#dc2626',
                          border: '1px solid #fca5a5',
                          padding: '5px 10px',
                          borderRadius: '6px',
                          cursor: deletingId === r.id ? 'not-allowed' : 'pointer',
                          fontWeight: 'bold',
                          fontSize: '12px'
                        }}
                      >
                        {deletingId === r.id ? '...' : '🗑️ Delete'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={styles.card}>
        <h4 style={{ margin: '0 0 14px 0', color: '#0f172a' }}>📄 Showroom Transfer Challan Register</h4>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: '620px', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#1e293b', color: 'white' }}>
                <th style={styles.thSub}>Challan No</th>
                <th style={styles.thSub}>Date</th>
                <th style={styles.thSub}>Showroom</th>
                <th style={styles.thSub}>Batch / Model</th>
                <th style={styles.thSub}>Note / Color</th>
                <th style={styles.thSub}>Sent Pcs</th>
              </tr>
            </thead>
            <tbody>
              {transfers.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>No showroom stock transfers recorded yet.</td></tr>
              ) : transfers.map((t, idx) => (
                <tr key={t.id ?? idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={styles.td}><strong>{t.challan_no}</strong></td>
                  <td style={styles.td}>{t.transfer_date || '-'}</td>
                  <td style={{ ...styles.td, fontWeight: 'bold', color: '#0369a1' }}>{t.showroom_name}</td>
                  <td style={styles.td}>{t.batch_code} — {t.model_name}</td>
                  <td style={styles.td}>{t.size_details || '-'} {t.color && t.color !== '-' ? `(${t.color})` : ''}</td>
                  <td style={{ ...styles.td, fontWeight: 'bold', color: '#059669' }}>{t.transferred_pieces}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// 8. Salesman & Customer Catalog Module
function SalesmanCatalogModule({ hideCostRate }: { hideCostRate: boolean }) {
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
      <h4 style={{ margin: '0 0 16px 0', color: '#0f172a' }}>📒 Pommys Design Catalog</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '14px' }}>
        {designs.length === 0 ? (
          <p style={{ color: '#64748b' }}>No catalog designs available yet.</p>
        ) : designs.map((d, i) => (
          <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', background: '#f8fafc' }}>
            {d.image_url ? (
              <img src={d.image_url} alt={d.design_no || 'Design'} style={{ width: '100%', height: '160px', objectFit: 'cover', borderRadius: '6px', marginBottom: '10px' }} />
            ) : (
              <div style={{ height: '160px', background: '#e2e8f0', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px', color: '#64748b', fontSize: '12px' }}>No Image</div>
            )}
            <div style={{ fontWeight: 'bold', color: '#0f172a' }}>Design: {d.design_no || '-'}</div>
            <div style={{ fontSize: '12px', color: '#475569' }}>
              Item: {d.item_name || '-'}{d.color && d.color !== '-' ? ` | Color: ${d.color}` : ''}
            </div>
            {!hideCostRate && (
              <div style={{ fontSize: '13px', color: '#059669', fontWeight: 'bold', marginTop: '6px' }}>Base Rate: ₹{d.rate_per_meter || 0}</div>
            )}
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        <div><label style={styles.label}>Fabric Cost / Pc (₹)</label><input type="number" value={fabricCost} onChange={(e) => setFabricCost(e.target.value)} style={styles.input} /></div>
        <div><label style={styles.label}>Stitching / Jobwork (₹)</label><input type="number" value={stitchingCost} onChange={(e) => setStitchingCost(e.target.value)} style={styles.input} /></div>
        <div><label style={styles.label}>Trims & Packing (₹)</label><input type="number" value={trimsCost} onChange={(e) => setTrimsCost(e.target.value)} style={styles.input} /></div>
        <div><label style={styles.label}>Target Margin (%)</label><input type="number" value={marginPct} onChange={(e) => setMarginPct(e.target.value)} style={styles.input} /></div>
      </div>
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '16px', borderRadius: '8px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        <div><strong>Net Cost / Pc:</strong> ₹ {totalCost.toFixed(2)}</div>
        <div><strong style={{ color: '#059669' }}>Suggested Rate: ₹ {sellingPrice.toFixed(2)}</strong></div>
      </div>
    </div>
  );
}

// 10. Tailor Ledger & Jobwork Module
function TailorLedgerModule() {
  const [entries, setEntries] = useState<any[]>([]);
  const [tailor, setTailor] = useState('');
  const [batch, setBatch] = useState('');
  const [pcs, setPcs] = useState('');
  const [rate, setRate] = useState('50');

  const loadLedger = async () => {
    const { data, error } = await supabase.from('pommys_tailor_ledger').select('*').order('id', { ascending: false });
    if (!error && data) {
      setEntries(data);
    } else {
      setEntries([
        { id: 1, tailor_name: 'Murugan Stitching Unit', batch_code: 'CUT-2026-101', pieces: 120, rate_per_pc: 50, status: 'In Stitching' }
      ]);
    }
  };

  useEffect(() => { loadLedger(); }, []);

  const addEntry = async (e: FormEvent) => {
    e.preventDefault();
    if (!tailor.trim() || !batch.trim() || !pcs) return;
    const payload = {
      tailor_name: tailor.trim(),
      batch_code: batch.trim(),
      pieces: Number(pcs),
      rate_per_pc: Number(rate) || 0,
      status: 'Issued'
    };
    const { error } = await supabase.from('pommys_tailor_ledger').insert([payload]);
    if (error) {
      setEntries([{ id: Date.now(), ...payload }, ...entries]);
    } else {
      await loadLedger();
    }
    setTailor('');
    setBatch('');
    setPcs('');
  };

  return (
    <div style={styles.card}>
      <h4 style={{ margin: '0 0 16px 0', color: '#0f172a' }}>🧵 Tailor Ledger & Job-Work</h4>
      <form onSubmit={addEntry} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '20px' }}>
        <input type="text" placeholder="Tailor / Unit Name" value={tailor} onChange={(e) => setTailor(e.target.value)} style={styles.input} />
        <input type="text" placeholder="Batch Code" value={batch} onChange={(e) => setBatch(e.target.value)} style={styles.input} />
        <input type="number" placeholder="Pieces" value={pcs} onChange={(e) => setPcs(e.target.value)} style={styles.input} />
        <input type="number" placeholder="Rate / Pc" value={rate} onChange={(e) => setRate(e.target.value)} style={styles.input} />
        <button type="submit" style={styles.primaryBtn}>+ Record Jobwork</button>
      </form>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', minWidth: '520px', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead><tr style={{ background: '#0f172a', color: 'white' }}>
            <th style={styles.thSub}>Tailor / Unit</th><th style={styles.thSub}>Batch</th><th style={styles.thSub}>Pieces</th><th style={styles.thSub}>Amount (₹)</th><th style={styles.thSub}>Status</th>
          </tr></thead>
          <tbody>
            {entries.map(en => (
              <tr key={en.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={styles.td}><strong>{en.tailor_name}</strong></td>
                <td style={styles.td}>{en.batch_code}</td>
                <td style={styles.td}>{en.pieces}</td>
                <td style={styles.td}>₹ {(Number(en.pieces) * Number(en.rate_per_pc || 0)).toFixed(2)}</td>
                <td style={styles.td}>{en.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 11. Security & Admin User Manager
function SecurityAdminModule({ currentUser }: { currentUser: any }) {
  const [users, setUsers] = useState<any[]>([]);
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('OFFICE');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('OFFICE');
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const [rightsUserId, setRightsUserId] = useState<number | null>(null);
  const [selectedRights, setSelectedRights] = useState<MenuKey[]>([]);
  const [savingRights, setSavingRights] = useState(false);

  const loadUsers = async () => {
    const { data } = await supabase.from('pommys_users').select('*').order('id', { ascending: true });
    if (data) setUsers(data);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const adminCount = users.filter(u => normalizeRole(u.role) === 'ADMIN').length;
  const officeCount = users.filter(u => normalizeRole(u.role) === 'OFFICE').length;
  const salesmanCount = users.filter(u => normalizeRole(u.role) === 'SALESMAN').length;
  const customerCount = users.filter(u => normalizeRole(u.role) === 'CUSTOMER').length;

  const checkQuota = (targetRole: UserRole, excludeUserId?: number) => {
    const others = users.filter(u => u.id !== excludeUserId);
    if (targetRole === 'ADMIN' && others.filter(u => normalizeRole(u.role) === 'ADMIN').length >= 1) {
      alert('Limit reached: Only 1 Admin account is allowed.');
      return false;
    }
    if (targetRole === 'OFFICE' && others.filter(u => normalizeRole(u.role) === 'OFFICE').length >= 5) {
      alert('Limit reached: Maximum 5 Office Staff accounts allowed.');
      return false;
    }
    if (targetRole === 'SALESMAN' && others.filter(u => normalizeRole(u.role) === 'SALESMAN').length >= 5) {
      alert('Limit reached: Maximum 5 Salesman accounts allowed.');
      return false;
    }
    return true;
  };

  const handleAddUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !mobile.trim() || !password.trim()) {
      alert('Please enter Name, Mobile Number and Password.');
      return;
    }
    if (!checkQuota(role)) return;

    setSaving(true);
    try {
      const defaultMenus = getDefaultMenusForRole(role);
      const { error } = await supabase.from('pommys_users').insert([{
        full_name: fullName.trim(),
        mobile_number: mobile.trim(),
        password: password.trim(),
        role,
        allowed_menus: defaultMenus
      }]);
      if (error) {
        alert('Error creating user: ' + error.message);
      } else {
        setFullName('');
        setMobile('');
        setPassword('');
        await loadUsers();
      }
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (u: any) => {
    setRightsUserId(null);
    setEditingId(u.id);
    setEditName(u.full_name || '');
    setEditMobile(u.mobile_number || '');
    setEditPassword(u.password || '');
    setEditRole(normalizeRole(u.role));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditMobile('');
    setEditPassword('');
  };

  const handleSaveEdit = async (userId: number) => {
    if (!editName.trim() || !editMobile.trim() || !editPassword.trim()) {
      alert('Name, Mobile Number and Password are required.');
      return;
    }
    if (!checkQuota(editRole, userId)) return;

    setUpdatingId(userId);
    try {
      const { error } = await supabase
        .from('pommys_users')
        .update({
          full_name: editName.trim(),
          mobile_number: editMobile.trim(),
          password: editPassword.trim(),
          role: editRole
        })
        .eq('id', userId);
      if (error) {
        alert('Error updating user: ' + error.message);
      } else {
        setEditingId(null);
        await loadUsers();
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const openRightsEditor = (u: any) => {
    setEditingId(null);
    setRightsUserId(u.id);
    setSelectedRights(getEffectiveMenus(u));
  };

  const toggleRightMenu = (key: MenuKey) => {
    setSelectedRights(prev =>
      prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key]
    );
  };

  const handleSaveRights = async (userId: number) => {
    const finalMenus: MenuKey[] = selectedRights.length > 0 ? selectedRights : ['catalog'];
    setSavingRights(true);
    try {
      const { error } = await supabase
        .from('pommys_users')
        .update({ allowed_menus: finalMenus })
        .eq('id', userId);
      if (error) {
        alert('Error saving rights: ' + error.message);
      } else {
        setRightsUserId(null);
        await loadUsers();
      }
    } finally {
      setSavingRights(false);
    }
  };

  const handleDeleteUser = async (u: any) => {
    if (u.id === currentUser?.id) {
      alert('You cannot delete your currently logged-in Admin account.');
      return;
    }
    if (!window.confirm(`Delete user "${u.full_name}" (${u.mobile_number})?`)) return;
    const { error } = await supabase.from('pommys_users').delete().eq('id', u.id);
    if (error) alert('Error deleting user: ' + error.message);
    else loadUsers();
  };

  const rightsTargetUser = users.find(u => u.id === rightsUserId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
        <div style={{ ...styles.card, borderTop: '4px solid #dc2626' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>ADMIN QUOTA</div>
          <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#0f172a', marginTop: '4px' }}>{adminCount} / 1</div>
        </div>
        <div style={{ ...styles.card, borderTop: '4px solid #2563eb' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>OFFICE STAFF QUOTA</div>
          <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#0f172a', marginTop: '4px' }}>{officeCount} / 5</div>
        </div>
        <div style={{ ...styles.card, borderTop: '4px solid #d97706' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>SALESMAN QUOTA</div>
          <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#0f172a', marginTop: '4px' }}>{salesmanCount} / 5</div>
        </div>
        <div style={{ ...styles.card, borderTop: '4px solid #059669' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>CUSTOMERS (UNLIMITED)</div>
          <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#059669', marginTop: '4px' }}>{customerCount} / ∞</div>
        </div>
      </div>

      <div style={styles.card}>
        <h4 style={{ margin: '0 0 14px 0', color: '#0f172a' }}>➕ Create New User Login (Office / Salesman / Customer)</h4>
        <form onSubmit={handleAddUser} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
          <input type="text" placeholder="Full Name / Shop Name" value={fullName} onChange={(e) => setFullName(e.target.value)} style={styles.input} required />
          <input type="text" placeholder="Mobile Number (Username)" value={mobile} onChange={(e) => setMobile(e.target.value)} style={styles.input} required />
          <input type="text" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={styles.input} required />
          <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} style={styles.input}>
            <option value="OFFICE">OFFICE (Max 5)</option>
            <option value="SALESMAN">SALESMAN (Max 5)</option>
            <option value="CUSTOMER">CUSTOMER (Unlimited)</option>
            <option value="ADMIN">ADMIN (Max 1)</option>
          </select>
          <button type="submit" disabled={saving} style={styles.primaryBtn}>{saving ? 'Saving...' : '+ Add User'}</button>
        </form>
      </div>

      {rightsTargetUser && (
        <div style={{ ...styles.card, border: '2px solid #2563eb', background: '#f8fafc' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <h4 style={{ margin: 0, color: '#0f172a' }}>
              🔐 Menu Rights for: <span style={{ color: '#2563eb' }}>{rightsTargetUser.full_name}</span> ({normalizeRole(rightsTargetUser.role)})
            </h4>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" onClick={() => setSelectedRights([...ALL_MENU_KEYS])} style={{ ...styles.secondaryBtn, padding: '5px 10px', fontSize: '12px' }}>Select All</button>
              <button type="button" onClick={() => setSelectedRights(getDefaultMenusForRole(normalizeRole(rightsTargetUser.role)))} style={{ ...styles.secondaryBtn, padding: '5px 10px', fontSize: '12px' }}>Role Default</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '10px', marginBottom: '16px' }}>
            {MENU_ITEMS.map(m => {
              const checked = selectedRights.includes(m.key);
              return (
                <label
                  key={m.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'white',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: checked ? '1px solid #2563eb' : '1px solid #cbd5e1',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: checked ? 'bold' : 'normal'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleRightMenu(m.key)}
                  />
                  {m.label}
                </label>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => handleSaveRights(rightsTargetUser.id)}
              disabled={savingRights}
              style={styles.successBtn}
            >
              {savingRights ? 'Saving Rights...' : '💾 Save User Rights'}
            </button>
            <button
              type="button"
              onClick={() => setRightsUserId(null)}
              style={styles.secondaryBtn}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={styles.card}>
        <h4 style={{ margin: '0 0 14px 0', color: '#0f172a' }}>👥 Active User Credentials & Rights List</h4>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: '720px', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#0f172a', color: 'white' }}>
                <th style={styles.thSub}>Name</th>
                <th style={styles.thSub}>Mobile (Username)</th>
                <th style={styles.thSub}>Password</th>
                <th style={styles.thSub}>Role</th>
                <th style={styles.thSub}>Allowed Menus</th>
                <th style={{ ...styles.thSub, textAlign: 'center', width: '230px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, idx) => {
                const isEditing = editingId === u.id;
                const r = normalizeRole(u.role);
                const effMenus = getEffectiveMenus(u);
                return (
                  <tr key={u.id ?? idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={styles.td}>
                      {isEditing ? (
                        <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} style={styles.tblInput} />
                      ) : (
                        <strong>{u.full_name}</strong>
                      )}
                    </td>
                    <td style={styles.td}>
                      {isEditing ? (
                        <input type="text" value={editMobile} onChange={(e) => setEditMobile(e.target.value)} style={styles.tblInput} />
                      ) : (
                        u.mobile_number
                      )}
                    </td>
                    <td style={styles.td}>
                      {isEditing ? (
                        <input type="text" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} style={styles.tblInput} />
                      ) : (
                        <code>{u.password}</code>
                      )}
                    </td>
                    <td style={styles.td}>
                      {isEditing ? (
                        <select value={editRole} onChange={(e) => setEditRole(e.target.value as UserRole)} style={styles.tblInput}>
                          <option value="ADMIN">ADMIN</option>
                          <option value="OFFICE">OFFICE</option>
                          <option value="SALESMAN">SALESMAN</option>
                          <option value="CUSTOMER">CUSTOMER</option>
                        </select>
                      ) : (
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          background: r === 'ADMIN' ? '#fee2e2' : r === 'OFFICE' ? '#dbeafe' : r === 'SALESMAN' ? '#fef3c7' : '#dcfce7',
                          color: r === 'ADMIN' ? '#b91c1c' : r === 'OFFICE' ? '#1d4ed8' : r === 'SALESMAN' ? '#b45309' : '#15803d'
                        }}>
                          {r}
                        </span>
                      )}
                    </td>
                    <td style={styles.td}>
                      <span style={{ fontSize: '12px', color: '#334155', fontWeight: 'bold' }}>
                        {effMenus.length} / {ALL_MENU_KEYS.length} Menus
                      </span>
                    </td>
                    <td style={{ ...styles.td, textAlign: 'center' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(u.id)}
                            disabled={updatingId === u.id}
                            style={{ background: '#059669', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                          >
                            {updatingId === u.id ? '...' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            style={{ background: '#e2e8f0', color: '#334155', border: 'none', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '5px', justifyContent: 'center', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => openRightsEditor(u)}
                            style={{ background: '#eef2ff', color: '#4338ca', border: '1px solid #a5b4fc', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                          >
                            🔐 Rights
                          </button>
                          <button
                            type="button"
                            onClick={() => startEdit(u)}
                            style={{ background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                          >
                            ✏️ Edit
                          </button>
                          {u.id !== currentUser?.id && (
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(u)}
                              style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
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
      const { data: transfers } = await supabase.from('pommys_showroom_transfers').select('*');

      const backupPayload = {
        exportedAt: new Date().toISOString(),
        brand: 'Pommys / Indika Fabrics ERP',
        bills: bills || [],
        fabricStock: stock || [],
        productionWip: wip || [],
        readyStock: ready || [],
        showroomTransfers: transfers || []
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
        Download a complete JSON snapshot of GRN bills, fabric stock, WIP batches, ready stock, and showroom transfers for archiving and year-end audit.
      </p>
      <button type="button" onClick={handleDownloadBackup} disabled={exporting} style={styles.primaryBtn}>
        {exporting ? 'Preparing Backup...' : '⬇️ Download Full ERP JSON Backup'}
      </button>
    </div>
  );
}

// 13. Master Reports with Godown, Showroom Bifurcation, Supplier History & CSV Export
function ReportsModule() {
  const [tab, setTab] = useState<'showrooms' | 'godown' | 'history'>('showrooms');
  const [godownStock, setGodownStock] = useState<any[]>([]);
  const [readyStock, setReadyStock] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [supplierHistory, setSupplierHistory] = useState<any[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (tab === 'godown') fetchGodown();
    if (tab === 'showrooms') fetchShowroomBifurcation();
    if (tab === 'history') fetchHistory();
  }, [tab]);

  const fetchGodown = async () => {
    const { data } = await supabase.from('pommys_fabric_stock').select('*').gt('available_meters', 0.01).order('id', { ascending: false });
    if (data) setGodownStock(data);
  };

  const fetchShowroomBifurcation = async () => {
    const { data: ready } = await supabase.from('pommys_ready_stock').select('*').order('id', { ascending: false });
    const { data: trf } = await supabase.from('pommys_showroom_transfers').select('*').order('id', { ascending: false });
    if (ready) setReadyStock(ready.filter((r: any) => Number(r.ready_pieces) > 0));
    if (trf) setTransfers(trf);
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

  const exportStockCsv = () => {
    const rows = [
      ['Location / Showroom', 'Challan / Batch', 'Model', 'Color (Optional)', 'Pieces'],
      ...readyStock.map(r => ['Central Godown', r.batch_code || '-', r.model_name || '-', r.color || '-', String(r.ready_pieces || 0)]),
      ...transfers.map(t => [t.showroom_name || '-', `${t.challan_no || '-'} (${t.batch_code || '-'})`, t.model_name || '-', t.color || '-', String(t.transferred_pieces || 0)])
    ];
    const csvContent = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pommys-godown-showroom-stock-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

  const branchSummaryMap: Record<string, number> = {};
  transfers.forEach(t => {
    const b = t.showroom_name || 'Unknown Branch';
    branchSummaryMap[b] = (branchSummaryMap[b] || 0) + (Number(t.transferred_pieces) || 0);
  });

  return (
    <div style={styles.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setTab('showrooms')} style={{ ...styles.secondaryBtn, background: tab === 'showrooms' ? '#1e293b' : 'transparent', color: tab === 'showrooms' ? 'white' : '#475569' }}>🏬 Godown & Showroom Stock</button>
          <button type="button" onClick={() => setTab('godown')} style={{ ...styles.secondaryBtn, background: tab === 'godown' ? '#1e293b' : 'transparent', color: tab === 'godown' ? 'white' : '#475569' }}>📦 Fabric Godown Stock</button>
          <button type="button" onClick={() => setTab('history')} style={{ ...styles.secondaryBtn, background: tab === 'history' ? '#1e293b' : 'transparent', color: tab === 'history' ? 'white' : '#475569' }}>📅 Supplier History</button>
        </div>
        {tab === 'showrooms' && (
          <button type="button" onClick={exportStockCsv} style={{ background: '#059669', color: 'white', border: 'none', padding: '8px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
            ⬇️ Export Excel (CSV)
          </button>
        )}
      </div>

      {tab === 'showrooms' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
            <div style={{ border: '1px solid #86efac', background: '#f0fdf4', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#166534' }}>Central Godown</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#059669', marginTop: '4px' }}>
                {readyStock.reduce((a, b) => a + (Number(b.ready_pieces) || 0), 0)} Pcs
              </div>
            </div>
            {Object.entries(branchSummaryMap).map(([branch, pcs]) => (
              <div key={branch} style={{ border: '1px solid #bae6fd', background: '#f0f9ff', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#0369a1' }}>{branch}</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0284c7', marginTop: '4px' }}>{pcs} Pcs</div>
              </div>
            ))}
          </div>

          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', minWidth: '520px', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead><tr style={{ background: '#0f172a', color: 'white' }}>
                <th style={styles.thSub}>Location / Showroom</th><th style={styles.thSub}>Challan / Batch</th><th style={styles.thSub}>Model</th><th style={styles.thSub}>Color (Opt)</th><th style={styles.thSub}>Pieces</th>
              </tr></thead>
              <tbody>
                {readyStock.map((r, i) => (
                  <tr key={`g-${i}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={styles.td}><strong>Central Godown</strong></td>
                    <td style={styles.td}>{r.batch_code}</td>
                    <td style={styles.td}>{r.model_name}</td>
                    <td style={styles.td}>{r.color || '-'}</td>
                    <td style={{ ...styles.td, color: '#059669', fontWeight: 'bold' }}>{r.ready_pieces}</td>
                  </tr>
                ))}
                {transfers.map((t, i) => (
                  <tr key={`s-${i}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={styles.td}><strong style={{ color: '#0369a1' }}>{t.showroom_name}</strong></td>
                    <td style={styles.td}>{t.challan_no} ({t.batch_code})</td>
                    <td style={styles.td}>{t.model_name}</td>
                    <td style={styles.td}>{t.color || '-'}</td>
                    <td style={{ ...styles.td, color: '#0284c7', fontWeight: 'bold' }}>{t.transferred_pieces}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'godown' && (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: '540px', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead><tr style={{ background: '#0f172a', color: 'white' }}>
              <th style={styles.thSub}>Item</th><th style={styles.thSub}>Design</th><th style={styles.thSub}>Color (Opt)</th><th style={styles.thSub}>Design Photo</th><th style={styles.thSub}>Available (M)</th>
            </tr></thead>
            <tbody>
              {godownStock.map((s, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={styles.td}>{s.item_name}</td><td style={styles.td}>{s.design_no}</td><td style={styles.td}>{s.color || '-'}</td>
                  <td style={styles.td}>
                    {s.image_url ? <button type="button" onClick={() => setSelectedImage(s.image_url)} style={{ background: '#e0f2fe', color: '#0369a1', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>View Photo</button> : '-'}
                  </td>
                  <td style={{ ...styles.td, color: '#059669', fontWeight: 'bold' }}>{s.available_meters}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'history' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', background: '#f8fafc', padding: '14px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #cbd5e1', alignItems: 'end' }}>
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
            <div>
              <button type="button" onClick={() => { setSelectedSupplier(''); setStartDate(''); setEndDate(''); }} style={{ ...styles.secondaryBtn, padding: '8px 12px', fontSize: '12px', width: '100%' }}>Clear Filters</button>
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>No matching records found.</p>
          ) : (
            filteredHistory.map((bill, i) => (
              <div key={i} style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '14px', marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                  <div><strong>Supplier:</strong> {bill.supplier_name} | <strong>Bill No:</strong> {bill.bill_no}</div>
                  <div><strong>Date:</strong> {bill.bill_date || 'N/A'}</div>
                </div>
                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <table style={{ width: '100%', minWidth: '580px', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead><tr style={{ background: '#e2e8f0', color: '#334155' }}>
                      <th style={styles.thSub}>Item</th><th style={styles.thSub}>Design</th><th style={styles.thSub}>Color (Opt)</th><th style={styles.thSub}>Rate</th><th style={styles.thSub}>GST %</th><th style={styles.thSub}>Net Qty</th><th style={styles.thSub}>Photo</th>
                    </tr></thead>
                    <tbody>
                      {bill.pommys_fabric_stock?.map((st: any, idx: number) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={styles.td}>{st.item_name}</td><td style={styles.td}>{st.design_no}</td><td style={styles.td}>{st.color || '-'}</td>
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
              </div>
            ))
          )}
        </div>
      )}

      {selectedImage && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '16px' }}>
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
  card: { background: 'white', padding: '18px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.03)', minWidth: 0, boxSizing: 'border-box' as const },
  input: { padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', width: '100%', boxSizing: 'border-box' as const, outline: 'none' },
  tblInput: { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', width: '100%', boxSizing: 'border-box' as const, outline: 'none' },
  label: { display: 'block', fontSize: '12px', color: '#475569', marginBottom: '6px', fontWeight: 'bold' },
  primaryBtn: { background: '#2563eb', color: 'white', padding: '10px 18px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' },
  successBtn: { background: '#059669', color: 'white', padding: '12px 22px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' },
  secondaryBtn: { background: '#e2e8f0', color: '#475569', padding: '9px 14px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' },
  logoutBtn: { background: 'transparent', color: '#f87171', border: '1px solid #f87171', padding: '9px', borderRadius: '6px', width: '100%', cursor: 'pointer', fontWeight: 'bold' },
  menuItem: (isActive: boolean) => ({ padding: '12px 18px', cursor: 'pointer', color: isActive ? 'white' : '#94a3b8', background: isActive ? '#1e293b' : 'transparent', borderLeft: isActive ? '4px solid #dc2626' : '4px solid transparent', fontWeight: isActive ? 'bold' : 'normal', fontSize: '14px' }),
  thGroup: { padding: '10px', fontSize: '13px', borderRight: '1px solid #1e293b', borderBottom: '1px solid #334155' },
  thSub: { padding: '10px 8px', fontWeight: 'normal', fontSize: '12px', borderRight: '1px solid #334155', whiteSpace: 'nowrap' as const },
  td: { padding: '8px', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', fontSize: '13px' }
};
