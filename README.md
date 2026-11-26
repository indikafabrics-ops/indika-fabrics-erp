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
- Passwords: old plain-text passwords are converted to salted SHA-256 automatically at each user's next login;
  new / changed passwords are always stored hashed. (A stronger long-term step is Supabase Auth + RLS.)
  If a user forgets a password, Admin → Security → Edit → type a new one.
- Uploaded bill files are stored in Storage but not linked to a DB column.
- Dropdown lists (suppliers, items, designs, colors, models, tailors, showrooms)
  are built from existing data; use "+ New" to add a value.

## Photos & Catalog
- Cutting entry: Model Photo (optional), per-colour photo (optional), "No. of Colours" (optional).
  Photos are compressed in the browser and stored in the existing `assets` Storage bucket
  (folder `models/`). URLs are kept inside `selected_fabrics_json` (no schema change).
- Salesman Catalog → "Garments" tab: one card per Model + Design with photo, colours and live stock.
- Ready Stock → Central Godown table: every row has a "📷 Photo" button (opening stock, trading goods,
  or to replace a cutting photo). Stored in Storage `assets/catalog/<model>__<design>.jpg` (no schema change).
- Catalog → Garments: "WhatsApp-ல் பகிர்" button shares Model, Design, Colours and the photo link.

## Reports → "📈 Sales & Re-cut" (no extra entry needed)
Showroom-wise sales (date range), Low-stock / re-cut list, 60-day non-moving stock, tailor wages summary,
cutting yield per model. Also: Cutting piece estimate + warning, GRN price-rise alert, Catalog Print/PDF sheet.

## Busy Sales Import (Ready Stock & Showrooms → "Busy Sales Import")
Busy report (Item-wise Sales / Sales Register) → Excel → Save As CSV → upload (or paste).
Columns are auto-detected (changeable). Each line is matched to Model/Design/Color of that showroom's stock
(your manual choices are remembered in the browser). Rows that cannot be matched or exceed showroom stock are
skipped. Saved as "Showroom Sale" rows with challan_no `BUSY-<bill>-<n>`; re-importing the same file never duplicates.
Negative / zero quantities (sales returns) are ignored – record returns in the ERP manually.

## Old stock upload
Purchase & Opening Stock → Quick Opening: "📊 Excel / CSV Upload" (.xlsx or .csv) fills the rows for review,
"⬇️ Template" downloads the expected columns (Stage, Model, Design, Color, Showroom, Qty, Rate, Batch).
Ready Godown / Ready Showroom / Trading rows have a Photo picker (saved by Model + Design, shown in Catalog).
Busy Sales Import also accepts .xlsx now. Enter opening stock only once.

## Bulk photos
"📷 பல Photo ஒரே நேரத்தில்" (Opening Stock form and Ready Stock page): select many images at once.
File name = Design number (e.g. `D-101.jpg`) or `Nighty D-101.jpg` to target one model. Unmatched files are listed.

## Help
Sidebar → "📖 உதவி / Guide": Tamil step-by-step guide per module (only the modules a user is allowed to see), with Print / PDF.

## Latest additions
- Click any Dashboard / Reports card for the detail behind it; every report has Print · PDF · WhatsApp · Excel.
- Local Name per batch (Cutting / Opening Stock), shown in Godown, Catalog, Reports.
- Search & Analysis: Daily Summary, Search + Batch Timeline, Batch Profit, Supplier Account, alerts, Barcode labels, Audit Log.
- Edit / Delete go through Admin approval (Records + Approvals menus).
- Extra data (design master, supplier master, batch names, approvals, audit log) is kept as JSON files in the Storage bucket `assets/catalog/`.

## Size-wise stock, MRP, photos (latest)
- Production WIP has stage tabs (Cutting / Stitching / QC Check / Packing); moves and damage are entered size by size.
- Godown → Showroom transfers and showroom sales/returns/damage are size-wise (one `pommys_showroom_transfers` row per size, `size_details` = `Size M`).
- Size-wise stock for WIP/Godown lives in Storage `catalog/sizes.json` (no DB change); old stock falls back to the Cutting size split.
- Per-size Rate / MRP, up to 4 photos and up to 6 colour squares live in `catalog/designs.json` (`rates`, `mrp`, `photos`, `swatches`).
- Busy Import accepts an optional Size column.
- Back button on every inner page + browser/phone Back.

## Busy Stock & Sales (menu `trading`)
- Upload Busy BCN-wise Stock Status and Sales Analysis xlsx files (multi-file). Shop/date are read from the report header.
- Stock upload = replace snapshot per shop; Sales upload = replace by date range, so re-uploads never double count. Total-row checks and future-date checks block bad data.
- Current stock = latest snapshot minus sales dated after it. Busy "Sales Price" is used as Cost.
- Data lives in Storage JSON (`catalog/trade/*`), no DB schema change. ~1 MB JSON per shop.
- Upload calendar + Dashboard alert for missing dates; Stock and Sales reports per shop.
- Production WIP has a size-wise Stage Report; grant `trading` menu to Office users in Security.
