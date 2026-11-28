import { useCallback, useEffect, useState } from 'react';
import { MENU_ITEMS, MENU_GROUP, type MenuKey } from '../lib/constants';
import { r3, type StockSnapshot } from '../lib/helpers';
import { loadStockSnapshotFull } from '../lib/showroomStock';
import { errMsg } from '../lib/supabase';
import { loadAlerts, type AlertCard } from '../lib/alerts';
import DetailModal from '../components/DetailModal';
import { useDrill } from '../components/DrillHost';
import { ErrorBanner, Loading, StatCard, styles } from '../components/ui';

export default function DashboardHome({ onNavigate, allowedMenus }: { onNavigate: (menu: MenuKey) => void; allowedMenus: typeof MENU_ITEMS }) {
  const [snap, setSnap] = useState<StockSnapshot | null>(null);
  const [error, setError] = useState('');
  const drill = useDrill();
  const [alerts, setAlerts] = useState<AlertCard[]>([]);
  const [alertOpen, setAlertOpen] = useState<AlertCard | null>(null);
  useEffect(() => { loadAlerts().then(setAlerts).catch(() => undefined); }, []);
  const lastBackup = (() => { try { return localStorage.getItem('pommys_last_backup') || ''; } catch { return ''; } })();
  const backupDays = lastBackup ? Math.floor((Date.now() - new Date(lastBackup).getTime()) / 86400000) : 999;

  const load = useCallback(async () => {
    setError('');
    try {
      setSnap(await loadStockSnapshotFull());
    } catch (err: any) {
      setError('Dashboard data load தோல்வி: ' + errMsg(err));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const can = (k: MenuKey) => allowedMenus.some(m => m.key === k);
  const go = (k: MenuKey, fallback: MenuKey = 'dashboard') => (can(k) ? () => onNavigate(k) : can(fallback) ? () => onNavigate(fallback) : undefined);

  const navBtn = (item: typeof MENU_ITEMS[number], accent: string) => (
    <button key={item.key} type="button" onClick={() => onNavigate(item.key)} style={{ ...styles.secondaryBtn, textAlign: 'left', background: '#f8fafc', border: '1px solid #cbd5e1', borderLeft: `4px solid ${accent}`, width: '100%' }}>
      {item.label}
    </button>
  );
  const group = (g: 'entry' | 'report' | 'admin') => allowedMenus.filter(m => MENU_GROUP[m.key] === g);
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {error && <ErrorBanner message={error} onRetry={load} />}

      {/* ---------------- ENTRY (always on top) ---------------- */}
      {group('entry').length > 0 && (
        <div style={{ ...styles.card, borderTop: '4px solid #f59e0b' }}>
          <h4 style={{ margin: '0 0 14px 0', color: '#0f172a' }}>✍️ Entry — Quick Navigation</h4>
          <div style={grid}>{group('entry').map(item => navBtn(item, '#f59e0b'))}</div>
        </div>
      )}

      {/* ---------------- REPORT ---------------- */}
      <div style={{ ...styles.card, borderTop: '4px solid #0ea5e9', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <h4 style={{ margin: 0, color: '#0f172a' }}>📊 Report</h4>
        {!snap && !error && <Loading />}
        {snap && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))', gap: '14px' }}>
            <StatCard label="Godown Fabric Stock (M)" value={r3(snap.fabricMeters)} color="#2563eb" sub="Click → விவரம் / Print / WhatsApp" onClick={() => drill.open('fabric')} />
            <StatCard label="Production WIP (Pcs)" value={snap.wipPieces} color="#d97706" sub={`${snap.wipBatches} Active Batch(es) → விவரம்`} onClick={() => drill.open('wip')} />
            <StatCard label="Godown Ready Pieces" value={snap.godownPieces} color="#059669" sub="Click → விவரம்" onClick={() => drill.open('godown')} />
            <StatCard label="Showroom Stock (Pcs)" value={snap.showroomPieces} color="#7c3aed" sub={snap.showroomBusy !== undefined ? `Busy ${snap.showroomBusy} • Entry ${snap.showroomEntry} → விவரம்` : 'Click → விவரம்'} onClick={() => drill.open('showroom')} />
            <StatCard label="End Bits Stock (M)" value={r3(snap.endBitMeters)} color="#ea580c" sub="Click → விவரம்" onClick={() => drill.open('endbit')} />
            <StatCard label="Damage / Seconds (Pcs)" value={snap.damagePieces} color="#dc2626" sub={snap.damageMeters > 0 ? `+ ${r3(snap.damageMeters)} M fabric damage →` : 'Click → விவரம்'} onClick={() => drill.open('damage')} />
            {snap.lowTrims > 0 && <StatCard label="Low Stock Trims" value={snap.lowTrims} color="#b45309" sub="Open Store Room →" onClick={go('storeroom')} />}
          </div>
        )}
        {group('report').length > 0 && <div style={grid}>{group('report').map(item => navBtn(item, '#0ea5e9'))}</div>}
        {alerts.some(a => a.count > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '10px' }}>
            {alerts.filter(a => a.count > 0).map(a => (
              <div key={a.key} onClick={() => setAlertOpen(a)} style={{ background: 'white', borderLeft: `5px solid ${a.color}`, borderRadius: '8px', padding: '10px 12px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', cursor: 'pointer' }}>
                <div style={{ fontSize: '22px', fontWeight: 'bold', color: a.color }}>🚨 {a.count}</div>
                <div style={{ fontSize: '12px', color: '#475569' }}>{a.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {drill.node}
      {alertOpen && <DetailModal {...alertOpen.doc} onClose={() => setAlertOpen(null)} />}

      {/* ---------------- ADMIN ---------------- */}
      {(group('admin').length > 0 || (can('yearclosing') && backupDays >= 7)) && (
        <div style={{ ...styles.card, borderTop: '4px solid #64748b', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h4 style={{ margin: 0, color: '#0f172a' }}>⚙️ Admin</h4>
          {can('yearclosing') && backupDays >= 7 && (
            <div onClick={() => onNavigate('yearclosing')} style={{ background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: 'bold' }}>
              💾 {lastBackup ? `கடைசி Backup ${backupDays} நாள் முன்பு` : 'இன்னும் Backup எடுக்கவில்லை'} — Click செய்து Backup எடுக்கவும்.
            </div>
          )}
          {group('admin').length > 0 && <div style={grid}>{group('admin').map(item => navBtn(item, '#64748b'))}</div>}
        </div>
      )}
    </div>
  );
}
