import { useCallback, useEffect, useState } from 'react';
import { MENU_ITEMS, type MenuKey } from '../lib/constants';
import { loadStockSnapshot, r3, type StockSnapshot } from '../lib/helpers';
import { errMsg } from '../lib/supabase';
import { ErrorBanner, Loading, StatCard, styles } from '../components/ui';

export default function DashboardHome({ onNavigate, allowedMenus }: { onNavigate: (menu: MenuKey) => void; allowedMenus: typeof MENU_ITEMS }) {
  const [snap, setSnap] = useState<StockSnapshot | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setSnap(await loadStockSnapshot());
    } catch (err: any) {
      setError('Dashboard data load தோல்வி: ' + errMsg(err));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const can = (k: MenuKey) => allowedMenus.some(m => m.key === k);
  const go = (k: MenuKey, fallback: MenuKey = 'dashboard') => (can(k) ? () => onNavigate(k) : can(fallback) ? () => onNavigate(fallback) : undefined);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {error && <ErrorBanner message={error} onRetry={load} />}
      {!snap && !error && <Loading />}
      {snap && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))', gap: '14px' }}>
          <StatCard label="Godown Fabric Stock (M)" value={r3(snap.fabricMeters)} color="#2563eb" sub="Open Fabric Stock →" onClick={go('reports')} />
          <StatCard label="Production WIP (Pcs)" value={snap.wipPieces} color="#d97706" sub={`${snap.wipBatches} Active Batch(es) →`} onClick={go('production')} />
          <StatCard label="Godown Ready Pieces" value={snap.godownPieces} color="#059669" sub="Open Ready Stock →" onClick={go('readystock')} />
          <StatCard label="Showroom Stock (Pcs)" value={snap.showroomPieces} color="#7c3aed" sub="Open Showrooms →" onClick={go('readystock')} />
          <StatCard label="End Bits Stock (M)" value={r3(snap.endBitMeters)} color="#ea580c" sub="Open Reports →" onClick={go('reports')} />
          <StatCard label="Damage / Seconds (Pcs)" value={snap.damagePieces} color="#dc2626" sub={snap.damageMeters > 0 ? `+ ${r3(snap.damageMeters)} M fabric damage →` : 'Open Reports →'} onClick={go('reports')} />
          {snap.lowTrims > 0 && <StatCard label="Low Stock Trims" value={snap.lowTrims} color="#b45309" sub="Open Store Room →" onClick={go('storeroom')} />}
        </div>
      )}

      <div style={styles.card}>
        <h4 style={{ margin: '0 0 14px 0', color: '#0f172a' }}>Quick Navigation</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
          {allowedMenus.filter(m => m.key !== 'dashboard').map(item => (
            <button key={item.key} type="button" onClick={() => onNavigate(item.key)} style={{ ...styles.secondaryBtn, textAlign: 'left', background: '#f8fafc', border: '1px solid #cbd5e1', width: '100%' }}>
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
