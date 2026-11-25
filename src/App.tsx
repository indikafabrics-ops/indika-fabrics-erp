import HelpModule from './modules/HelpModule';
import { useEffect, useState, type FormEvent } from 'react';
import { hashPassword, isHashed, verifyPassword } from './lib/password';
import { supabase, POMMYS_LOGO_URL, errMsg } from './lib/supabase';
import { LOGIN_TABS, MENU_ITEMS, type MenuKey, type UserRole } from './lib/constants';
import { getEffectiveMenus, normalizeRole } from './lib/helpers';
import { ToastHost, styles } from './components/ui';
import DashboardHome from './modules/DashboardHome';
import GRNModule from './modules/GRNModule';
import CuttingModule from './modules/CuttingModule';
import ProductionModule from './modules/ProductionModule';
import StoreRoomModule from './modules/StoreRoomModule';
import ReadyStockModule from './modules/ReadyStockModule';
import CatalogModule from './modules/CatalogModule';
import CostingModule from './modules/CostingModule';
import TailorModule from './modules/TailorModule';
import ReportsModule from './modules/ReportsModule';
import SecurityModule from './modules/SecurityModule';
import RecordsModule from './modules/RecordsModule';
import ApprovalsModule from './modules/ApprovalsModule';
import { pendingCount } from './lib/approvals';
import YearClosingModule from './modules/YearClosingModule';

const SESSION_KEY = 'pommys_session_user_id';

const readSession = (): string | null => {
  try { return window.localStorage.getItem(SESSION_KEY); } catch { return null; }
};
const writeSession = (id: any) => {
  try {
    if (id === null) window.localStorage.removeItem(SESSION_KEY);
    else window.localStorage.setItem(SESSION_KEY, String(id));
  } catch { /* private mode – ignore */ }
};

function useIsCompact() {
  const [isCompact, setIsCompact] = useState<boolean>(() => (typeof window !== 'undefined' ? window.innerWidth < 1024 : false));
  useEffect(() => {
    const onResize = () => setIsCompact(window.innerWidth < 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return isCompact;
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [booting, setBooting] = useState<boolean>(() => readSession() !== null);

  // stay logged in after page refresh (the user record is re-read, so changed rights apply)
  useEffect(() => {
    const id = readSession();
    if (!id) return;
    (async () => {
      try {
        const { data } = await supabase.from('pommys_users').select('*').eq('id', id).limit(1);
        if (data && data[0]) setUser(data[0]);
        else writeSession(null);
      } catch {
        /* offline – show login */
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const handleLogin = (u: any) => { writeSession(u.id); setUser(u); };
  const handleLogout = () => { writeSession(null); setUser(null); };

  return (
    <>
      <ToastHost />
      {booting ? (
        <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontWeight: 'bold' }}>⏳ Loading...</div>
      ) : !user ? (
        <LoginScreen onLogin={handleLogin} />
      ) : (
        <Shell user={user} onLogout={handleLogout} />
      )}
    </>
  );
}

function LoginScreen({ onLogin }: { onLogin: (user: any) => void }) {
  const [selectedPortal, setSelectedPortal] = useState<UserRole>('ADMIN');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const meta = LOGIN_TABS.find(t => t.role === selectedPortal) || LOGIN_TABS[0];

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data, error: dbError } = await supabase
        .from('pommys_users')
        .select('*')
        .eq('mobile_number', mobile.trim())
        .limit(5);
      if (dbError) { setError('Server பிழை: ' + errMsg(dbError)); return; }
      let found: any = null;
      for (const u of data || []) {
        if (await verifyPassword(password.trim(), u.password)) { found = u; break; }
      }
      if (!found) { setError('Mobile Number அல்லது Password தவறு!'); return; }
      const actualRole = normalizeRole(found.role);
      if (actualRole !== selectedPortal) {
        setError(`Access Denied: இந்தக் கணக்கு ${actualRole} கணக்கு. மேலே ${actualRole} Login தேர்வு செய்யவும்.`);
        return;
      }
      // old plain-text password -> store it hashed from now on (best effort, login works either way)
      if (!isHashed(found.password)) {
        try { await supabase.from('pommys_users').update({ password: await hashPassword(password.trim()) }).eq('id', found.id); } catch { /* ignore */ }
      }
      onLogin(found);
    } catch (err: any) {
      setError('இணைய இணைப்பு பிழை: ' + errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f1f5f9', padding: 'max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom)) 16px' }}>
      <div style={{ background: 'white', padding: '28px 22px', borderRadius: '14px', boxShadow: '0 10px 25px rgba(0,0,0,0.06)', width: '100%', maxWidth: '460px', textAlign: 'center' }}>
        <img
          src={POMMYS_LOGO_URL}
          alt="Pommys Logo"
          style={{ height: '64px', marginBottom: '10px', objectFit: 'contain' }}
          onError={e => { const img = e.currentTarget; img.onerror = null; img.src = '/pommys-logo.png'; }}
        />
        <p style={{ color: '#475569', margin: '0 0 18px 0', fontSize: '14px', fontWeight: 'bold' }}>Select Login Option</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '18px' }}>
          {LOGIN_TABS.map(tab => {
            const on = selectedPortal === tab.role;
            return (
              <button key={tab.role} type="button" onClick={() => { setSelectedPortal(tab.role); setError(''); }}
                style={{ padding: '11px 10px', borderRadius: '8px', border: on ? '2px solid #0f172a' : '1px solid #cbd5e1', background: on ? '#0f172a' : '#f8fafc', color: on ? 'white' : '#1e293b', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
                {tab.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'inline-block', background: meta.badgeBg, color: meta.badgeColor, padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', marginBottom: '16px' }}>
          {meta.subtitle}
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input type="text" inputMode="tel" autoComplete="username" placeholder="User ID / Mobile Number" value={mobile} onChange={e => setMobile(e.target.value)} style={styles.input} required />
          <input type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} style={styles.input} required />
          {error && <p style={{ color: '#ef4444', fontSize: '13px', margin: 0, fontWeight: 'bold' }}>{error}</p>}
          <button type="submit" disabled={loading} style={styles.primaryBtn}>{loading ? 'Authenticating...' : `Login as ${selectedPortal}`}</button>
        </form>
      </div>
    </div>
  );
}

function Shell({ user, onLogout }: { user: any; onLogout: () => void }) {
  const isCompact = useIsCompact();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const role = normalizeRole(user?.role);
  const effectiveKeys = getEffectiveMenus(user);
  const allowedMenus = MENU_ITEMS.filter(m => effectiveKeys.includes(m.key));
  const [activeMenu, setActiveMenu] = useState<MenuKey>(allowedMenus[0]?.key || 'catalog');
  const [showHelp, setShowHelp] = useState(false);
  const [pending, setPending] = useState(0);
  useEffect(() => {
    if (role !== 'ADMIN') return;
    let alive = true;
    const run = () => pendingCount().then(n => { if (alive) setPending(n); });
    run();
    const t = setInterval(run, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [role, activeMenu]);
  const currentMeta = allowedMenus.find(m => m.key === activeMenu) || allowedMenus[0];
  const hasQuick = effectiveKeys.includes('grn') || effectiveKeys.includes('cutting') || effectiveKeys.includes('reports');

  const select = (key: MenuKey) => {
    setActiveMenu(key);
    setShowHelp(false);
    if (isCompact) setSidebarOpen(false);
  };

  const page = (key: MenuKey) => {
    switch (key) {
      case 'dashboard': return <DashboardHome onNavigate={select} allowedMenus={allowedMenus} />;
      case 'grn': return <GRNModule />;
      case 'cutting': return <CuttingModule />;
      case 'production': return <ProductionModule />;
      case 'storeroom': return <StoreRoomModule />;
      case 'readystock': return <ReadyStockModule user={user} canDelete={role === 'ADMIN' || role === 'OFFICE'} />;
      case 'catalog': return <CatalogModule hideCostRate={role === 'CUSTOMER'} hideStockQty={role === 'CUSTOMER'} />;
      case 'costing': return <CostingModule />;
      case 'tailor': return <TailorModule />;
      case 'reports': return <ReportsModule />;
      case 'records': return <RecordsModule user={user} />;
      case 'approvals': return <ApprovalsModule admin={user} />;
      case 'security': return <SecurityModule currentUser={user} />;
      case 'yearclosing': return <YearClosingModule />;
      default: return null;
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%', maxWidth: '100vw', overflowX: 'hidden', background: '#f8fafc' }}>
      {isCompact && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', zIndex: 998 }} />
      )}

      <div style={{
        width: '265px', maxWidth: '82vw', background: '#0f172a', color: 'white', display: 'flex', flexDirection: 'column', flexShrink: 0,
        ...(isCompact
          ? { position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 999, transform: sidebarOpen ? 'translateX(0)' : 'translateX(-105%)', transition: 'transform 0.25s ease-in-out', boxShadow: sidebarOpen ? '8px 0 24px rgba(0,0,0,0.35)' : 'none', paddingTop: 'env(safe-area-inset-top)' }
          : { position: 'sticky', top: 0, height: '100vh' })
      }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #1e293b', textAlign: 'center', background: 'white', position: 'relative' }}>
          {isCompact && (
            <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Close Menu"
              style={{ position: 'absolute', top: '10px', right: '10px', background: '#f1f5f9', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '6px', width: '30px', height: '30px', fontWeight: 'bold', cursor: 'pointer' }}>✕</button>
          )}
          <img src={POMMYS_LOGO_URL} alt="Pommys Logo" style={{ height: '42px', objectFit: 'contain' }}
            onError={e => { const img = e.currentTarget; img.onerror = null; img.src = '/pommys-logo.png'; }} />
          <div style={{ fontSize: '12px', color: '#475569', marginTop: '6px', fontWeight: 'bold' }}>{user?.full_name || 'User'} ({role})</div>
        </div>

        <div style={{ flex: 1, padding: '10px 0', display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto' }}>
          {allowedMenus.map(item => (
            <div key={item.key} style={styles.menuItem(activeMenu === item.key)} onClick={() => select(item.key)}>{item.label}{item.key === 'approvals' && pending > 0 && <span style={{ marginLeft: '8px', background: '#dc2626', color: 'white', borderRadius: '10px', padding: '1px 8px', fontSize: '11px', fontWeight: 'bold' }}>{pending}</span>}</div>
          ))}
          <div style={styles.menuItem(showHelp)} onClick={() => { setShowHelp(true); if (isCompact) setSidebarOpen(false); }}>📖 உதவி / Guide</div>
        </div>

        <div style={{ padding: '14px 16px max(14px, env(safe-area-inset-bottom)) 16px', borderTop: '1px solid #1e293b' }}>
          <button type="button" onClick={onLogout} style={styles.logoutBtn}>Logout</button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' }}>
        <div style={{ background: 'white', padding: isCompact ? 'max(12px, env(safe-area-inset-top)) 14px 12px 14px' : '14px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', position: 'sticky', top: 0, zIndex: 50 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: '1 1 auto' }}>
            {isCompact && (
              <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Open Menu"
                style={{ background: '#0f172a', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 12px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', flexShrink: 0 }}>☰ Menu</button>
            )}
            <h3 style={{ margin: 0, color: '#0f172a', fontSize: isCompact ? '15px' : '18px', lineHeight: 1.3, wordBreak: 'break-word' }}>{showHelp ? '📖 உதவி / Guide' : currentMeta?.title}</h3>
          </div>

          {hasQuick && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {effectiveKeys.includes('grn') && <button type="button" onClick={() => select('grn')} style={{ ...styles.secondaryBtn, padding: '6px 10px', fontSize: '12px' }}>+ Entry / Stock</button>}
              {effectiveKeys.includes('cutting') && <button type="button" onClick={() => select('cutting')} style={{ ...styles.secondaryBtn, padding: '6px 10px', fontSize: '12px' }}>+ Cutting</button>}
              {effectiveKeys.includes('reports') && <button type="button" onClick={() => select('reports')} style={{ ...styles.secondaryBtn, padding: '6px 10px', fontSize: '12px' }}>Reports</button>}
            </div>
          )}
        </div>

        <div style={{ flex: 1, padding: isCompact ? '14px 12px 60px 12px' : '22px', overflowY: 'auto', minWidth: 0 }}>
          {/* key = remount on menu change so every module loads fresh data */}
          <div key={showHelp ? 'help' : activeMenu}>{showHelp ? <HelpModule allowed={effectiveKeys} /> : page(activeMenu)}</div>
        </div>
      </div>
    </div>
  );
}
