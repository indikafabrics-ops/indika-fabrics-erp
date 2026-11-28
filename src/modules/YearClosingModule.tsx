import { useState } from 'react';
import { fetchAll, errMsg } from '../lib/supabase';
import { todayStr } from '../lib/helpers';
import { notify, styles } from '../components/ui';

// every business table (users / passwords are intentionally NOT exported)
const BACKUP_TABLES: { key: string; table: string; order: string }[] = [
  { key: 'bills', table: 'pommys_grn_bills', order: 'id' },
  { key: 'fabricStock', table: 'pommys_fabric_stock', order: 'id' },
  { key: 'cuttingBatches', table: 'pommys_cutting_batches', order: 'batch_code' },
  { key: 'productionWip', table: 'pommys_production_wip', order: 'id' },
  { key: 'readyStock', table: 'pommys_ready_stock', order: 'id' },
  { key: 'showrooms', table: 'pommys_showrooms', order: 'id' },
  { key: 'showroomTransfers', table: 'pommys_showroom_transfers', order: 'id' },
  { key: 'exceptionsStock', table: 'pommys_exceptions_stock', order: 'id' },
  { key: 'storeTrims', table: 'pommys_store_trims', order: 'id' },
  { key: 'tailorLedger', table: 'pommys_tailor_ledger', order: 'id' }
];

export default function YearClosingModule() {
  const [exporting, setExporting] = useState(false);

  const handleDownloadBackup = async () => {
    setExporting(true);
    try {
      const payload: Record<string, any> = { exportedAt: new Date().toISOString(), brand: 'Pommys Garment ERP' };
      const failed: string[] = [];
      for (const t of BACKUP_TABLES) {
        try {
          payload[t.key] = await fetchAll(t.table, '*', undefined, t.order);
        } catch (err: any) {
          payload[t.key] = [];
          failed.push(`${t.table} (${errMsg(err)})`);
        }
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pommys-erp-backup-${todayStr()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      try { localStorage.setItem('pommys_last_backup', todayStr()); } catch { /* ignore */ }
      if (failed.length > 0) notify(`Backup download ஆனது, ஆனால் இவை படிக்க முடியவில்லை: ${failed.join('; ')}`, 'warn');
      else notify('✅ முழு Backup download ஆனது.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={styles.card}>
      <h4 style={{ margin: '0 0 12px 0', color: '#0f172a' }}>📁 Financial Year Closing & Backup</h4>
      <p style={{ color: '#475569', fontSize: '13px', marginBottom: '16px', lineHeight: 1.6 }}>
        GRN Bills, Fabric Stock, Cutting Batches, WIP, Ready Stock, Showrooms & Transfers, End-Bit/Damage, Trims, Tailor Ledger — அனைத்தின் முழு JSON Backup. (பாதுகாப்புக்காக User / Password விவரங்கள் சேர்க்கப்படாது.)
        ஆண்டு முடிவில் மற்றும் பெரிய மாற்றங்களுக்கு முன் Backup எடுத்து வைக்கவும்.
      </p>
      <button type="button" onClick={handleDownloadBackup} disabled={exporting} style={styles.primaryBtn}>
        {exporting ? 'Preparing Backup...' : '⬇️ Download Full ERP JSON Backup'}
      </button>
    </div>
  );
}
