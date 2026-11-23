import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase, errMsg } from '../lib/supabase';
import { ALL_MENU_KEYS, MENU_ITEMS, type MenuKey, type UserRole } from '../lib/constants';
import { getDefaultMenusForRole, getEffectiveMenus, normalizeRole } from '../lib/helpers';
import { ErrorBanner, StatCard, TableWrap, notify, styles } from '../components/ui';

export default function SecurityModule({ currentUser }: { currentUser: any }) {
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('OFFICE');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<any>(null);
  const [editName, setEditName] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('OFFICE');
  const [updatingId, setUpdatingId] = useState<any>(null);

  const [rightsUserId, setRightsUserId] = useState<any>(null);
  const [selectedRights, setSelectedRights] = useState<MenuKey[]>([]);
  const [savingRights, setSavingRights] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const loadUsers = useCallback(async () => {
    const { data, error: err } = await supabase.from('pommys_users').select('*').order('id', { ascending: true });
    if (err) setError('Users load தோல்வி: ' + errMsg(err));
    else { setError(''); setUsers(data || []); }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const countOf = (r: UserRole) => users.filter(u => normalizeRole(u.role) === r).length;

  const checkQuota = (targetRole: UserRole, excludeUserId?: any): boolean => {
    const others = users.filter(u => u.id !== excludeUserId);
    const n = others.filter(u => normalizeRole(u.role) === targetRole).length;
    if (targetRole === 'ADMIN' && n >= 1) { notify('Limit: ஒரு Admin கணக்கு மட்டுமே அனுமதி.', 'err'); return false; }
    if ((targetRole === 'OFFICE' || targetRole === 'SALESMAN') && n >= 5) { notify(`Limit: அதிகபட்சம் 5 ${targetRole} கணக்குகள் மட்டுமே.`, 'err'); return false; }
    return true;
  };

  const mobileTaken = (m: string, excludeId?: any) => users.some(u => String(u.mobile_number).trim() === m.trim() && u.id !== excludeId);

  const handleAddUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !mobile.trim() || !password.trim()) return notify('Name, Mobile, Password மூன்றும் தேவை.', 'err');
    if (mobileTaken(mobile)) return notify('இந்த Mobile Number-க்கு ஏற்கனவே கணக்கு உள்ளது.', 'err');
    if (!checkQuota(role)) return;
    setSaving(true);
    try {
      const { error: insErr } = await supabase.from('pommys_users').insert([{
        full_name: fullName.trim(), mobile_number: mobile.trim(), password: password.trim(), role, allowed_menus: getDefaultMenusForRole(role)
      }]);
      if (insErr) throw insErr;
      notify(`✅ ${fullName.trim()} (${role}) சேர்க்கப்பட்டது.`);
      setFullName(''); setMobile(''); setPassword('');
      await loadUsers();
    } catch (err: any) {
      notify('User சேர்க்க முடியவில்லை: ' + errMsg(err), 'err');
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

  const handleSaveEdit = async (u: any) => {
    if (!editName.trim() || !editMobile.trim() || !editPassword.trim()) return notify('Name, Mobile, Password தேவை.', 'err');
    if (mobileTaken(editMobile, u.id)) return notify('இந்த Mobile Number வேறொரு கணக்கில் உள்ளது.', 'err');
    const roleChanged = normalizeRole(u.role) !== editRole;
    if (roleChanged && !checkQuota(editRole, u.id)) return;
    setUpdatingId(u.id);
    try {
      const patch: any = { full_name: editName.trim(), mobile_number: editMobile.trim(), password: editPassword.trim(), role: editRole };
      // a new role must not keep the old role's menu rights
      if (roleChanged) patch.allowed_menus = getDefaultMenusForRole(editRole);
      const { error: updErr } = await supabase.from('pommys_users').update(patch).eq('id', u.id);
      if (updErr) throw updErr;
      notify('✅ User புதுப்பிக்கப்பட்டது.');
      setEditingId(null);
      await loadUsers();
    } catch (err: any) {
      notify('Update தோல்வி: ' + errMsg(err), 'err');
    } finally {
      setUpdatingId(null);
    }
  };

  const openRights = (u: any) => {
    setEditingId(null);
    setRightsUserId(u.id);
    setSelectedRights(getEffectiveMenus(u));
  };

  const toggleRight = (key: MenuKey) =>
    setSelectedRights(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));

  const handleSaveRights = async (userId: any) => {
    const finalMenus: MenuKey[] = selectedRights.length > 0 ? selectedRights : ['catalog'];
    setSavingRights(true);
    try {
      const { error: updErr } = await supabase.from('pommys_users').update({ allowed_menus: finalMenus }).eq('id', userId);
      if (updErr) throw updErr;
      notify('✅ Menu Rights சேமிக்கப்பட்டன. (அடுத்த Login-ல் பொருந்தும்)');
      setRightsUserId(null);
      await loadUsers();
    } catch (err: any) {
      notify('Rights save தோல்வி: ' + errMsg(err), 'err');
    } finally {
      setSavingRights(false);
    }
  };

  const handleDelete = async (u: any) => {
    if (u.id === currentUser?.id) return notify('தற்போது Login செய்துள்ள கணக்கை நீக்க முடியாது.', 'err');
    if (!window.confirm(`Delete user "${u.full_name}" (${u.mobile_number})?`)) return;
    const { error: delErr } = await supabase.from('pommys_users').delete().eq('id', u.id);
    if (delErr) notify('Delete தோல்வி: ' + errMsg(delErr), 'err');
    else loadUsers();
  };

  const rightsTarget = users.find(u => u.id === rightsUserId);
  const smallBtn = (bg: string, color: string, border: string) => ({ background: bg, color, border: `1px solid ${border}`, padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' as const });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {error && <ErrorBanner message={error} onRetry={loadUsers} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
        <StatCard label="ADMIN QUOTA" value={`${countOf('ADMIN')} / 1`} color="#dc2626" />
        <StatCard label="OFFICE STAFF QUOTA" value={`${countOf('OFFICE')} / 5`} color="#2563eb" />
        <StatCard label="SALESMAN QUOTA" value={`${countOf('SALESMAN')} / 5`} color="#d97706" />
        <StatCard label="CUSTOMERS (UNLIMITED)" value={`${countOf('CUSTOMER')} / ∞`} color="#059669" />
      </div>

      <div style={styles.card}>
        <h4 style={{ margin: '0 0 14px 0', color: '#0f172a' }}>➕ Create New User Login</h4>
        <form onSubmit={handleAddUser} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
          <input type="text" placeholder="Full Name / Shop Name" value={fullName} onChange={e => setFullName(e.target.value)} style={styles.input} />
          <input type="text" placeholder="Mobile Number (Username)" value={mobile} onChange={e => setMobile(e.target.value)} style={styles.input} />
          <input type="text" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} style={styles.input} />
          <select value={role} onChange={e => setRole(e.target.value as UserRole)} style={styles.input}>
            <option value="OFFICE">OFFICE (Max 5)</option>
            <option value="SALESMAN">SALESMAN (Max 5)</option>
            <option value="CUSTOMER">CUSTOMER (Unlimited)</option>
            <option value="ADMIN">ADMIN (Max 1)</option>
          </select>
          <button type="submit" disabled={saving} style={styles.primaryBtn}>{saving ? 'Saving...' : '+ Add User'}</button>
        </form>
      </div>

      {rightsTarget && (
        <div style={{ ...styles.card, border: '2px solid #2563eb', background: '#f8fafc' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <h4 style={{ margin: 0, color: '#0f172a' }}>🔐 Menu Rights: <span style={{ color: '#2563eb' }}>{rightsTarget.full_name}</span> ({normalizeRole(rightsTarget.role)})</h4>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" onClick={() => setSelectedRights([...ALL_MENU_KEYS])} style={{ ...styles.secondaryBtn, padding: '5px 10px', fontSize: '12px' }}>Select All</button>
              <button type="button" onClick={() => setSelectedRights(getDefaultMenusForRole(normalizeRole(rightsTarget.role)))} style={{ ...styles.secondaryBtn, padding: '5px 10px', fontSize: '12px' }}>Role Default</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '10px', marginBottom: '16px' }}>
            {MENU_ITEMS.map(m => {
              const checked = selectedRights.includes(m.key);
              return (
                <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', padding: '10px 12px', borderRadius: '8px', border: checked ? '1px solid #2563eb' : '1px solid #cbd5e1', cursor: 'pointer', fontSize: '13px', fontWeight: checked ? 'bold' : 'normal' }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleRight(m.key)} />
                  {m.label}
                </label>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => handleSaveRights(rightsTarget.id)} disabled={savingRights} style={styles.successBtn}>{savingRights ? 'Saving Rights...' : '💾 Save User Rights'}</button>
            <button type="button" onClick={() => setRightsUserId(null)} style={styles.secondaryBtn}>Cancel</button>
          </div>
        </div>
      )}

      <div style={styles.card}>
        <h4 style={{ margin: '0 0 14px 0', color: '#0f172a' }}>👥 Active Users & Rights</h4>
        <TableWrap minWidth={760}>
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
              const isSelf = u.id === currentUser?.id;
              return (
                <tr key={u.id ?? idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={styles.td}>{isEditing ? <input type="text" value={editName} onChange={e => setEditName(e.target.value)} style={styles.tblInput} /> : <strong>{u.full_name}</strong>}</td>
                  <td style={styles.td}>{isEditing ? <input type="text" value={editMobile} onChange={e => setEditMobile(e.target.value)} style={styles.tblInput} /> : u.mobile_number}</td>
                  <td style={styles.td}>
                    {isEditing ? <input type="text" value={editPassword} onChange={e => setEditPassword(e.target.value)} style={styles.tblInput} /> : (
                      <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                        <code>{revealed[u.id] ? u.password : '••••••'}</code>
                        <button type="button" onClick={() => setRevealed(prev => ({ ...prev, [u.id]: !prev[u.id] }))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }} title="Show / Hide">{revealed[u.id] ? '🙈' : '👁️'}</button>
                      </span>
                    )}
                  </td>
                  <td style={styles.td}>
                    {isEditing ? (
                      <select value={editRole} onChange={e => setEditRole(e.target.value as UserRole)} disabled={isSelf} style={styles.tblInput}>
                        <option value="ADMIN">ADMIN</option><option value="OFFICE">OFFICE</option><option value="SALESMAN">SALESMAN</option><option value="CUSTOMER">CUSTOMER</option>
                      </select>
                    ) : (
                      <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', background: r === 'ADMIN' ? '#fee2e2' : r === 'OFFICE' ? '#dbeafe' : r === 'SALESMAN' ? '#fef3c7' : '#dcfce7', color: r === 'ADMIN' ? '#b91c1c' : r === 'OFFICE' ? '#1d4ed8' : r === 'SALESMAN' ? '#b45309' : '#15803d' }}>{r}</span>
                    )}
                  </td>
                  <td style={styles.td}><span style={{ fontSize: '12px', color: '#334155', fontWeight: 'bold' }}>{getEffectiveMenus(u).length} / {ALL_MENU_KEYS.length} Menus</span></td>
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button type="button" onClick={() => handleSaveEdit(u)} disabled={updatingId === u.id} style={{ background: '#059669', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>{updatingId === u.id ? '...' : 'Save'}</button>
                        <button type="button" onClick={() => setEditingId(null)} style={{ background: '#e2e8f0', color: '#334155', border: 'none', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '5px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => openRights(u)} style={smallBtn('#eef2ff', '#4338ca', '#a5b4fc')}>🔐 Rights</button>
                        <button type="button" onClick={() => startEdit(u)} style={smallBtn('#dbeafe', '#1d4ed8', '#93c5fd')}>✏️ Edit</button>
                        {!isSelf && <button type="button" onClick={() => handleDelete(u)} style={smallBtn('#fee2e2', '#dc2626', '#fca5a5')}>Delete</button>}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      </div>
    </div>
  );
}
