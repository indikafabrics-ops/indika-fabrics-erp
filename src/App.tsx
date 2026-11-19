import React, { useState, useEffect, useCallback } from 'react';
import { supabase, POMMYS_LOGO_URL, styles } from './supabaseClient';
import { T, type Lang } from './translations';
import DashboardHome from './components/DashboardHome';
import GRN from './components/GRN';
import Cutting from './components/Cutting';
import StoreRoom from './components/StoreRoom';
import ReadyStock from './components/ReadyStock';
import SalesmanCatalog from './components/SalesmanCatalog';
import CostingRateFixer from './components/CostingRateFixer';
import TailorLedger from './components/TailorLedger';
import Reports from './components/Reports';
import SecurityAdmin from './components/SecurityAdmin';
import YearClosingBackup from './components/YearClosingBackup';
import './App.css';

type LoginTab = 'ADMIN' | 'OFFICE' | 'SALESMAN' | 'CUSTOMER';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [lang, setLang] = useState<Lang>('en');

  const handleLogout = useCallback(
    async (reason = 'MANUAL_LOGOUT') => {
      if (user) {
        await supabase.from('pommys_audit_logs').insert([
          {
            user_mobile: user.mobile_number || '',
            user_name: user.full_name || '',
            user_role: user.role || '',
            login_tab: sessionStorage.getItem('pommys_login_tab') || 'PORTAL',
            action_type: reason,
            details: `Session ended (${reason})`,
          },
        ]);
      }
      sessionStorage.removeItem('pommys_login_tab');
      setUser(null);
    },
    [user]
  );

  useEffect(() => {
    if (!user) return;
    let timer = setTimeout(() => handleLogout('IDLE_TIMEOUT'), IDLE_TIMEOUT_MS);
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => handleLogout('IDLE_TIMEOUT'), IDLE_TIMEOUT_MS);
    };
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('click', resetTimer);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('click', resetTimer);
    };
  }, [user, handleLogout]);

  if (!user) {
    return (
      <FourTabLoginScreen
        lang={lang}
        setLang={setLang}
        onLogin={(loggedUser: any, tab: LoginTab) => {
          sessionStorage.setItem('pommys_login_tab', tab);
          setUser(loggedUser);
        }}
      />
    );
  }

  return (
    <Dashboard
      user={user}
      onUserUpdated={setUser}
      onLogout={() => handleLogout('MANUAL_LOGOUT')}
      lang={lang}
      setLang={setLang}
    />
  );
}

function FourTabLoginScreen({
  lang,
  setLang,
  onLogin,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  onLogin: (u: any, tab: LoginTab) => void;
}) {
  const [activeTab, setActiveTab] = useState<LoginTab>('ADMIN');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const tabMeta: Record<LoginTab, { title: string; subtitle: string; accent: string }> = {
    ADMIN: { title: '👑 Admin Login', subtitle: 'Full Control, Costing, User Rights & Password Manager', accent: '#dc2626' },
    OFFICE: { title: '🏢 Office Login', subtitle: 'GRN, Cutting, Store Room & Ready Stock Portal', accent: '#2563eb' },
    SALESMAN: { title: '📱 Salesman Login', subtitle: 'Live Photo Catalog & Order Booking Portal', accent: '#7c3aed' },
    CUSTOMER: { title: '🛍️ Customer Login', subtitle: 'Track Your Orders & Dispatch Status', accent: '#059669' },
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const cleanId = mobile.trim();
      const { data: foundUser, error: findErr } = await supabase
        .from('pommys_users')
        .select('*')
        .eq('mobile_number', cleanId)
        .single();

      if (findErr || !foundUser) {
        setError('Invalid User ID / Mobile or Password!');
        setLoading(false);
        return;
      }

      if (foundUser.is_active === false) {
        setError('இந்த கணக்கு தற்காலிகமாக முடக்கப்பட்டுள்ளது (Account Inactive). Admin-ஐத் தொடர்பு கொள்ளவும்.');
        setLoading(false);
        return;
      }

      if (foundUser.locked_until && new Date(foundUser.locked_until).getTime() > Date.now()) {
        setError('தொடர்ந்து தவறான முயற்சிகள் காரணமாக கணக்கு தற்காலிகமாகப் பூட்டப்பட்டுள்ளது.');
        setLoading(false);
        return;
      }

      const userRole = String(foundUser.role || '').toUpperCase();
      if (userRole !== activeTab) {
        await supabase.from('pommys_audit_logs').insert([
          {
            user_mobile: cleanId,
            user_name: foundUser.full_name || cleanId,
            user_role: userRole,
            login_tab: activeTab,
            action_type: 'UNAUTHORIZED_TAB_ATTEMPT',
            details: `Blocked ${userRole} user from logging into ${activeTab} tab`,
          },
        ]);
        setError(`❌ இந்த "${activeTab}" டேபில் "${userRole}" கணக்கு நுழைய அனுமதியில்லை! சரியான டேபில் லாகின் செய்யவும்.`);
        setLoading(false);
        return;
      }

      if (foundUser.password !== password) {
        const nextAttempts = (Number(foundUser.failed_attempts) || 0) + 1;
        const lockTime = nextAttempts >= 5 ? new Date(Date.now() + 10 * 60 * 1000).toISOString() : null;
        await supabase
          .from('pommys_users')
          .update({ failed_attempts: nextAttempts, locked_until: lockTime })
          .eq('id', foundUser.id);
        setError(nextAttempts >= 5 ? '5 தவறான முயற்சிகள்! 10 நிமிடங்களுக்கு கணக்கு பூட்டப்பட்டது.' : 'Invalid Password!');
        setLoading(false);
        return;
      }

      await supabase
        .from('pommys_users')
        .update({ failed_attempts: 0, locked_until: null })
        .eq('id', foundUser.id);

      await supabase.from('pommys_audit_logs').insert([
        {
          user_mobile: foundUser.mobile_number,
          user_name: foundUser.full_name,
          user_role: userRole,
          login_tab: activeTab,
          action_type: 'LOGIN_SUCCESS',
          details: `Logged in via ${activeTab} tab`,
        },
      ]);

      setLoading(false);
      onLogin({ ...foundUser, role: userRole }, activeTab);
    } catch (err: any) {
      setError('Login Error: ' + (err?.message || String(err)));
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f1f5f9', fontFamily: '"Segoe UI", Tahoma, sans-serif', padding: '16px' }}>
      <div style={{ background: 'white', padding: '32px', borderRadius: '14px', boxShadow: '0 12px 30px rgba(0,0,0,0.08)', width: '440px', maxWidth: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <img src={POMMYS_LOGO_URL} alt="Pommys Logo" style={{ height: '48px', objectFit: 'contain' }} />
          <button
            type="button"
            onClick={() => setLang(lang === 'en' ? 'ta' : 'en')}
            style={{ background: '#e0f2fe', color: '#0369a1', border: 'none', padding: '5px 12px', borderRadius: '20px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
          >
            🌐 {lang === 'en' ? 'தமிழ்' : 'English'}
          </button>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '18px' }}>
          <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#334155' }}>{T[lang].appTitle}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', background: '#f1f5f9', padding: '6px', borderRadius: '10px', marginBottom: '18px' }}>
          {(['ADMIN', 'OFFICE', 'SALESMAN', 'CUSTOMER'] as LoginTab[]).map((tKey) => {
            const isSel = activeTab === tKey;
            return (
              <button
                key={tKey}
                type="button"
                onClick={() => {
                  setActiveTab(tKey);
                  setError('');
                }}
                style={{
                  padding: '8px 4px',
                  border: 'none',
                  borderRadius: '7px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  background: isSel ? tabMeta[tKey].accent : 'transparent',
                  color: isSel ? 'white' : '#475569',
                }}
              >
                {tKey}
              </button>
            );
          })}
        </div>

        <div style={{ background: '#f8fafc', borderLeft: `4px solid ${tabMeta[activeTab].accent}`, padding: '10px 14px', borderRadius: '6px', marginBottom: '18px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#0f172a' }}>{tabMeta[activeTab].title}</div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{tabMeta[activeTab].subtitle}</div>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={styles.label}>{activeTab} User ID / Mobile *</label>
            <input type="text" placeholder="Enter User ID / Mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} style={styles.input} required />
          </div>

          <div>
            <label style={styles.label}>Password *</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPwd ? 'text' : 'password'}
                placeholder="Enter Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ ...styles.input, paddingRight: '42px' }}
                required
              />
              <button
                type="button"
                onClick={() => setShowPwd(!showPwd)}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px' }}
              >
                {showPwd ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '10px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{ ...styles.primaryBtn, background: tabMeta[activeTab].accent, padding: '12px' }}>
            {loading ? 'Verifying...' : `Secure Login (${activeTab})`}
          </button>
        </form>
      </div>
    </div>
  );
}

function Dashboard({
  user,
  onUserUpdated,
  onLogout,
  lang,
  setLang,
}: {
  user: any;
  onUserUpdated: (u: any) => void;
  onLogout: () => void;
  lang: Lang;
  setLang: (l: Lang) => void;
}) {
  const t = T[lang];
  const role = String(user?.role || '').toUpperCase();
  const isAdmin = role === 'ADMIN';
  const perms = user?.permissions_json || {};

  const canDashboard = isAdmin || perms.dashboard !== false;
  const canGrn = isAdmin || Boolean(perms.grn);
  const canCutting = isAdmin || Boolean(perms.cutting);
  const canStoreRoom = isAdmin || Boolean(perms.store_room);
  const canReadyStock = isAdmin || Boolean(perms.ready_stock);
  const canSalesman = isAdmin || Boolean(perms.salesman);
  const canReports = isAdmin || Boolean(perms.reports);

  const defaultMenu =
    role === 'CUSTOMER' ? 'customer_portal' : role === 'SALESMAN' ? 'salesman' : canDashboard ? 'dashboard' : 'security';

  const [activeMenu, setActiveMenu] = useState(defaultMenu);
  const [cuttingTab, setCuttingTab] = useState<'grn' | 'cutting'>(canGrn ? 'grn' : 'cutting');

  const menuItem = (isActive: boolean) => ({
    padding: '12px 20px',
    cursor: 'pointer',
    color: isActive ? 'white' : '#94a3b8',
    background: isActive ? '#1e293b' : 'transparent',
    borderLeft: isActive ? '4px solid #dc2626' : '4px solid transparent',
    fontWeight: isActive ? 'bold' : 'normal',
    fontSize: '13px',
  });

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#f8fafc', fontFamily: '"Segoe UI", Tahoma, sans-serif' }}>
      <div style={{ width: '255px', background: '#0f172a', color: 'white', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px', borderBottom: '1px solid #1e293b', textAlign: 'center', background: 'white' }}>
          <img src={POMMYS_LOGO_URL} alt="Pommys" style={{ height: '45px', objectFit: 'contain' }} />
          <div style={{ fontSize: '12px', color: '#0f172a', marginTop: '6px', fontWeight: 'bold' }}>{user.full_name}</div>
          <div style={{ fontSize: '11px', color: '#dc2626', fontWeight: 'bold' }}>[{role} PORTAL]</div>
        </div>

        <div style={{ flex: 1, padding: '14px 0', display: 'flex', flexDirection: 'column', gap: '3px', overflowY: 'auto' }}>
          {role !== 'CUSTOMER' && canDashboard && (
            <div style={menuItem(activeMenu === 'dashboard')} onClick={() => setActiveMenu('dashboard')}>{t.dashboard}</div>
          )}
          {(canGrn || canCutting) && (
            <div style={menuItem(activeMenu === 'cutting_room')} onClick={() => setActiveMenu('cutting_room')}>{t.cuttingRoom}</div>
          )}
          {canStoreRoom && (
            <div style={menuItem(activeMenu === 'store_room')} onClick={() => setActiveMenu('store_room')}>{t.storeRoom}</div>
          )}
          {canReadyStock && (
            <div style={menuItem(activeMenu === 'ready_stock')} onClick={() => setActiveMenu('ready_stock')}>{t.readyStock}</div>
          )}
          {canSalesman && (
            <div style={menuItem(activeMenu === 'salesman')} onClick={() => setActiveMenu('salesman')}>{t.salesman}</div>
          )}
          {role === 'CUSTOMER' && (
            <div style={menuItem(activeMenu === 'customer_portal')} onClick={() => setActiveMenu('customer_portal')}>{t.customerPortal}</div>
          )}
          {isAdmin && (
            <div style={menuItem(activeMenu === 'costing')} onClick={() => setActiveMenu('costing')}>🧮 Costing & Rate Fix</div>
          )}
          {(isAdmin || canStoreRoom) && (
            <div style={menuItem(activeMenu === 'tailor_ledger')} onClick={() => setActiveMenu('tailor_ledger')}>📒 Tailor Wages Ledger</div>
          )}
          {canReports && (
            <div style={menuItem(activeMenu === 'reports')} onClick={() => setActiveMenu('reports')}>{t.reports}</div>
          )}
          {isAdmin && (
            <div style={menuItem(activeMenu === 'year_backup')} onClick={() => setActiveMenu('year_backup')}>💾 FY Closing & Backup</div>
          )}
          <div style={menuItem(activeMenu === 'security')} onClick={() => setActiveMenu('security')}>{t.securityAdmin}</div>
        </div>

        <div style={{ padding: '14px', borderTop: '1px solid #1e293b' }}>
          <button onClick={onLogout} style={{ background: 'transparent', color: '#f87171', border: '1px solid #f87171', padding: '8px', borderRadius: '6px', width: '100%', cursor: 'pointer', fontWeight: 'bold' }}>
            {t.logout}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ background: 'white', padding: '14px 25px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {activeMenu !== defaultMenu && (
              <button
                onClick={() => setActiveMenu(defaultMenu)}
                style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
              >
                {t.back}
              </button>
            )}
            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '17px' }}>
              {activeMenu === 'dashboard' && t.dashboard}
              {activeMenu === 'cutting_room' && t.cuttingRoom}
              {activeMenu === 'store_room' && t.storeRoom}
              {activeMenu === 'ready_stock' && t.readyStock}
              {activeMenu === 'salesman' && t.salesman}
              {activeMenu === 'customer_portal' && t.customerPortal}
              {activeMenu === 'costing' && '🧮 Costing & Rate Fix'}
              {activeMenu === 'tailor_ledger' && '📒 Tailor Wages Ledger'}
              {activeMenu === 'reports' && t.reports}
              {activeMenu === 'year_backup' && '💾 FY Closing & Backup'}
              {activeMenu === 'security' && t.securityAdmin}
            </h3>
          </div>

          <button
            onClick={() => setLang(lang === 'en' ? 'ta' : 'en')}
            style={{ background: '#0f172a', color: 'white', border: 'none', padding: '7px 14px', borderRadius: '20px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
          >
            🌐 {lang === 'en' ? 'தமிழ்' : 'English'}
          </button>
        </div>

        <div style={{ flex: 1, padding: '22px', overflowY: 'auto' }}>
          {activeMenu === 'dashboard' && <DashboardHome lang={lang} onNavigate={setActiveMenu} />}

          {activeMenu === 'cutting_room' && (
            <div>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '18px' }}>
                {canGrn && (
                  <button
                    onClick={() => setCuttingTab('grn')}
                    style={{ ...styles.secondaryBtn, background: cuttingTab === 'grn' ? '#2563eb' : '#e2e8f0', color: cuttingTab === 'grn' ? 'white' : '#334155' }}
                  >
                    {t.billGrn}
                  </button>
                )}
                {canCutting && (
                  <button
                    onClick={() => setCuttingTab('cutting')}
                    style={{ ...styles.secondaryBtn, background: cuttingTab === 'cutting' ? '#2563eb' : '#e2e8f0', color: cuttingTab === 'cutting' ? 'white' : '#334155' }}
                  >
                    {t.cuttingTab}
                  </button>
                )}
              </div>
              {cuttingTab === 'grn' && canGrn ? <GRN lang={lang} /> : canCutting ? <Cutting lang={lang} /> : null}
            </div>
          )}

          {activeMenu === 'store_room' && canStoreRoom && <StoreRoom user={user} lang={lang} />}
          {activeMenu === 'ready_stock' && canReadyStock && <ReadyStock user={user} lang={lang} />}
          {activeMenu === 'salesman' && canSalesman && <SalesmanCatalog user={user} lang={lang} />}
          {activeMenu === 'customer_portal' && <CustomerOrdersView user={user} lang={lang} />}
          {activeMenu === 'costing' && isAdmin && <CostingRateFixer lang={lang} />}
          {(isAdmin || canStoreRoom) && activeMenu === 'tailor_ledger' && <TailorLedger user={user} lang={lang} />}
          {canReports && activeMenu === 'reports' && <Reports user={user} lang={lang} />}
          {isAdmin && activeMenu === 'year_backup' && <YearClosingBackup user={user} lang={lang} />}
          {activeMenu === 'security' && <SecurityAdmin user={user} lang={lang} onUserUpdated={onUserUpdated} />}
        </div>
      </div>
    </div>
  );
}

function CustomerOrdersView({ user, lang }: { user: any; lang: Lang }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCustomerOrders();
  }, []);

  const loadCustomerOrders = async () => {
    setLoading(true);
    const { data } = await supabase.from('pommys_sales_orders').select('*').order('id', { ascending: false });
    const nameKey = String(user?.full_name || '').toLowerCase();
    const filtered = (data || []).filter(
      (o) => !nameKey || String(o.buyer_name || '').toLowerCase().includes(nameKey) || (data || []).length <= 20
    );
    setOrders(filtered);
    setLoading(false);
  };

  return (
    <div style={styles.card}>
      <h4 style={{ margin: '0 0 14px 0', color: '#0f172a' }}>
        {T[lang].customerPortal} — {user.full_name}
      </h4>
      {loading ? (
        <div>Loading...</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#0f172a', color: 'white' }}>
                <th style={styles.thSub}>Order No</th>
                <th style={styles.thSub}>Buyer</th>
                <th style={styles.thSub}>Model / Size</th>
                <th style={styles.thSub}>Qty</th>
                <th style={styles.thSub}>Rate (₹)</th>
                <th style={styles.thSub}>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td style={styles.td}><strong>{o.order_no}</strong></td>
                  <td style={styles.td}>{o.buyer_name}</td>
                  <td style={styles.td}>{o.model_name} ({o.size})</td>
                  <td style={styles.td}><strong>{o.ordered_qty}</strong></td>
                  <td style={styles.td}>₹{o.rate || 0}</td>
                  <td style={styles.td}>
                    <span style={{ background: o.status === 'DISPATCHED' ? '#dcfce7' : '#fef3c7', color: o.status === 'DISPATCHED' ? '#166534' : '#b45309', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}>
                      {o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
