export type UserRole = 'ADMIN' | 'OFFICE' | 'SALESMAN' | 'CUSTOMER';

export type MenuKey =
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
  | 'records'
  | 'approvals'
  | 'security'
  | 'yearclosing';

export const ALL_MENU_KEYS: MenuKey[] = [
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
  'records',
  'approvals',
  'security',
  'yearclosing'
];

export const MENU_ITEMS: { key: MenuKey; label: string; title: string; roles: UserRole[] }[] = [
  { key: 'dashboard', label: '🏠 Dashboard Overview', title: 'Pommys Garment ERP — Executive Dashboard', roles: ['ADMIN', 'OFFICE'] },
  { key: 'grn', label: '📥 Purchase & Opening Stock', title: 'Purchase GRN, Opening & Trading Stock', roles: ['ADMIN', 'OFFICE'] },
  { key: 'cutting', label: '✂️ Fabric Issue & Cutting', title: 'Fabric Issue & Cutting Module', roles: ['ADMIN', 'OFFICE'] },
  { key: 'production', label: '🏭 Production WIP', title: 'Live Production Tracking (WIP)', roles: ['ADMIN', 'OFFICE'] },
  { key: 'storeroom', label: '🏪 Store Room & Trims', title: 'Store Room, Accessories & Trims Stock', roles: ['ADMIN', 'OFFICE'] },
  { key: 'readystock', label: '👕 Ready Stock & Showrooms', title: 'Ready Stock Godown & Retail Showroom Stock', roles: ['ADMIN', 'OFFICE', 'SALESMAN'] },
  { key: 'catalog', label: '📒 Salesman & Customer Catalog', title: 'Design Catalog & Sample Sheet', roles: ['ADMIN', 'OFFICE', 'SALESMAN', 'CUSTOMER'] },
  { key: 'costing', label: '🧮 Costing & Rate Fixer', title: 'Garment Costing & Wholesale/Retail Rate Fixer', roles: ['ADMIN'] },
  { key: 'tailor', label: '🧵 Tailor Ledger & Jobwork', title: 'Tailor & Stitching Job-Work Ledger', roles: ['ADMIN', 'OFFICE'] },
  { key: 'reports', label: '📊 Master Reports & Export', title: 'Stock Summary, Godown, Showroom, End-Bit/Damage & Supplier Reports', roles: ['ADMIN', 'OFFICE'] },
  { key: 'records', label: '✏️ Edit / Delete Records', title: 'Edit / Delete Records (Admin Approval)', roles: ['ADMIN', 'OFFICE'] },
  { key: 'approvals', label: '✅ Approvals', title: 'Edit / Delete Approvals (Admin)', roles: ['ADMIN'] },
  { key: 'security', label: '🔐 Security & Admin', title: 'User Roles, Rights & User Manager', roles: ['ADMIN'] },
  { key: 'yearclosing', label: '📁 Year Closing & Backup', title: 'Financial Year Closing & Data Backup Center', roles: ['ADMIN'] }
];

export const LOGIN_TABS: { role: UserRole; label: string; subtitle: string; badgeBg: string; badgeColor: string }[] = [
  { role: 'ADMIN', label: '🛡️ Admin', subtitle: 'Admin Portal Login', badgeBg: '#fee2e2', badgeColor: '#b91c1c' },
  { role: 'OFFICE', label: '🏢 Office', subtitle: 'Office Staff Portal Login', badgeBg: '#dbeafe', badgeColor: '#1d4ed8' },
  { role: 'SALESMAN', label: '👔 Salesman', subtitle: 'Salesman Portal Login', badgeBg: '#fef3c7', badgeColor: '#b45309' },
  { role: 'CUSTOMER', label: '🛍️ Customer', subtitle: 'Customer Catalog Login', badgeBg: '#dcfce7', badgeColor: '#15803d' }
];

export interface ShowroomRecord {
  id?: number;
  showroom_name: string;
  address?: string;
  phone?: string;
}

export type OpeningStageType =
  | 'FABRIC'
  | 'CUTPARTS'
  | 'WIP'
  | 'READY_GODOWN'
  | 'READY_SHOWROOM'
  | 'TRADING'
  | 'END_BIT'
  | 'DAMAGE';

export interface OpeningBulkRow {
  stage: OpeningStageType;
  model: string;
  designNo: string;
  color: string;
  qty: string;
  rate: string;
  showroom: string;
  batchCode: string;
  size?: string;
  fit?: string;
  material?: string;
  color2?: string;
  photo?: File | null;
}

export const PRESET_FITS = ['Regular', 'Loose', 'Slim', 'Free Size'];

export const WIP_STAGES = ['Cutting', 'Stitching', 'QC Check', 'Packing'];

export const DEFAULT_MODELS = ['Nighty', 'Night Suit', 'Kurti'];
export const PRESET_COLORS = ['Assorted', 'Black', 'White', 'Red', 'Blue', 'Green', 'Yellow', 'Pink', 'Maroon', 'Navy', 'Grey', 'Brown', 'Orange', 'Purple', 'Cream', 'Multi'];
export const PRESET_SIZES = ['Free', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'];
export const TRIM_UNITS = ['Mtr', 'Roll', 'Packet', 'Pcs', 'Kg', 'Box'];
export const GST_OPTIONS = ['0', '5', '12', '18'];

export const GST_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
