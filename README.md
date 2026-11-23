# Pommys Garment ERP

React 19 + TypeScript + Vite + Supabase.

## Setup
```
npm install
npm run build     # check for errors
npm run dev       # run locally
```

## Supabase tables (existing schema, unchanged)
pommys_users, pommys_grn_bills, pommys_fabric_stock, pommys_cutting_batches,
pommys_production_wip, pommys_ready_stock, pommys_showrooms,
pommys_showroom_transfers, pommys_exceptions_stock, pommys_store_trims,
pommys_tailor_ledger

## Notes
- Showroom Sale / Return / Damage are saved as NEGATIVE `transferred_pieces`
  rows in `pommys_showroom_transfers`. Check your column accepts negatives.
- Opening Stock must be entered only once.
- Passwords are plain text in `pommys_users`. Move to Supabase Auth / hashing + RLS.
- Uploaded bill files are stored in Storage but not linked to a DB column.
- Dropdown lists (suppliers, items, designs, colors, models, tailors, showrooms)
  are built from existing data; use "+ New" to add a value.
