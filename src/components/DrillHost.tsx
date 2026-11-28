import { useState, useCallback } from 'react';
import DetailModal from './DetailModal';
import { loadDrill, type DrillDoc, type DrillKind } from '../lib/drill';
import { errMsg } from '../lib/supabase';
import { notify } from './ui';

/** hook: const { open, node } = useDrill();  <StatCard onClick={() => open('fabric')} />  … {node} */
export function useDrill() {
  const [doc, setDoc] = useState<DrillDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const open = useCallback(async (kind: DrillKind) => {
    if (busy) return;
    setBusy(true);
    try { setDoc(await loadDrill(kind)); } catch (e: any) { notify('விவரம் load தோல்வி: ' + errMsg(e), 'err'); }
    setBusy(false);
  }, [busy]);
  const node = doc ? <DetailModal {...doc} onClose={() => setDoc(null)} /> : null;
  return { open, node, busy };
}
