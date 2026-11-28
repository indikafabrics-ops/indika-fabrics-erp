import { useEffect, useState } from 'react';
import { fetchAll, errMsg } from '../lib/supabase';
import { r3, num, uniqueSorted, computeShowroomLines, sizeOfRow } from '../lib/helpers';
import { loadSizeLedger, loadCutSizes, sizesFor, sortSizes, NO_SIZE, type SizeMap } from '../lib/sizeLedger';
import { code128Svg } from '../lib/code128';
import ZoomViewer, { type ZoomItem } from '../components/ZoomViewer';
import { GalleryEditor } from '../components/GallerySlots';
import { loadModelPhotos } from '../lib/batchMeta';
import { loadBatchMeta } from '../lib/batchMeta';
import { loadDesignMaster, designLookup, type Swatch } from '../lib/masterStore';
import { SwatchChips } from '../components/GallerySlots';
import { loadBatchNames, nameFor } from '../lib/batchNames';
import { ErrorBanner, Loading, notify, styles } from '../components/ui';

function FabricCatalog({ hideCostRate, hideStockQty }: { hideCostRate: boolean; hideStockQty: boolean }) {
  const [designs, setDesigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [color, setColor] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const rows = await fetchAll('pommys_fabric_stock', 'id,item_name,design_no,color,rate_per_meter,image_url,available_meters');
        // one card per Design + Color (latest purchase wins for photo / rate)
        const map = new Map<string, any>();
        rows.forEach(r => {
          const key = `${String(r.design_no || '-').toLowerCase()}|${String(r.color || '-').toLowerCase()}|${String(r.item_name || '').toLowerCase()}`;
          const cur = map.get(key);
          map.set(key, {
            item_name: r.item_name, design_no: r.design_no, color: r.color,
            rate_per_meter: r.rate_per_meter || cur?.rate_per_meter,
            image_url: r.image_url || cur?.image_url,
            available: (cur?.available || 0) + num(r.available_meters)
          });
        });
        setDesigns(Array.from(map.values()).reverse());
      } catch (err: any) {
        setError('Catalog load தோல்வி: ' + errMsg(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const colors = uniqueSorted(designs.map(d => d.color));
  const q = search.trim().toLowerCase();
  const shown = designs.filter(d => {
    if (color && d.color !== color) return false;
    if (inStockOnly && d.available <= 0.01) return false;
    if (q && !`${d.design_no} ${d.item_name} ${d.color}`.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <div>
      {error && <div style={{ marginBottom: '12px' }}><ErrorBanner message={error} /></div>}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
        <input type="text" placeholder="🔍 Design / Item தேடுக..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...styles.input, maxWidth: '260px' }} />
        <select value={color} onChange={e => setColor(e.target.value)} style={{ ...styles.input, maxWidth: '180px' }}>
          <option value="">All Colors</option>
          {colors.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 'bold', color: '#475569', cursor: 'pointer' }}>
          <input type="checkbox" checked={inStockOnly} onChange={e => setInStockOnly(e.target.checked)} /> In Stock மட்டும்
        </label>
        <span style={{ fontSize: '12px', color: '#64748b' }}>{shown.length} Design(s)</span>
      </div>
      {loading ? <Loading /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '14px' }}>
          {shown.length === 0 ? <p style={{ color: '#64748b' }}>Catalog-ல் Design எதுவும் இல்லை.</p> : shown.map((d, i) => (
            <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', background: '#f8fafc' }}>
              {d.image_url ? (
                <img src={d.image_url} alt={d.design_no || 'Design'} loading="lazy" style={{ width: '100%', height: '160px', objectFit: 'cover', borderRadius: '6px', marginBottom: '10px' }} />
              ) : (
                <div style={{ height: '160px', background: '#e2e8f0', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px', color: '#64748b', fontSize: '12px' }}>No Image</div>
              )}
              <div style={{ fontWeight: 'bold', color: '#0f172a' }}>Design: {d.design_no || '-'}</div>
              <div style={{ fontSize: '12px', color: '#475569' }}>Item: {d.item_name || '-'}{d.color && d.color !== '-' ? ` | Color: ${d.color}` : ''}</div>
              <div style={{ fontSize: '12px', marginTop: '4px', fontWeight: 'bold', color: d.available > 0.01 ? '#059669' : '#dc2626' }}>
                {d.available > 0.01 ? (hideStockQty ? '✅ In Stock' : `✅ ${r3(d.available)} M available`) : '❌ Out of Stock'}
              </div>
              {!hideCostRate && <div style={{ fontSize: '13px', color: '#0369a1', fontWeight: 'bold', marginTop: '6px' }}>Fabric Rate: ₹{d.rate_per_meter || 0}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


interface ColorLine { color: string; godown: number; showroom: number }
interface GarmentCard { model: string; design: string; image: string; colorCount: number; colors: Map<string, ColorLine>; batches: Set<string>; names: Set<string>; material: string; fit: string; sizes: string; price: number; mrp: number; photos: string[]; swatches: Swatch[]; rates: { size: string; price: number; mrp: number }[]; sizeStock: Map<string, { godown: number; showroom: number }>; nameSizes: Map<string, SizeMap>; hideMain: boolean }

/** Salesman "menu card": one card per Model + Design with photo, colors and live stock. */
function GarmentCatalog({ hideStockQty, canEdit }: { hideStockQty: boolean; canEdit: boolean }) {
  const [cards, setCards] = useState<GarmentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [color, setColor] = useState('');
  const [inStockOnly, setInStockOnly] = useState(true);
  const [zoom, setZoom] = useState<{ items: ZoomItem[]; start: number } | null>(null);
  const [view, setView] = useState<'grid' | 'slide' | 'list'>('grid');
  const [slideIdx, setSlideIdx] = useState(0);
  const [editing, setEditing] = useState<{ model: string; design: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [labelCopies, setLabelCopies] = useState('1');
  const [touchX, setTouchX] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [ready, transfers, photos] = await Promise.all([
          fetchAll('pommys_ready_stock', '*'),
          fetchAll('pommys_showroom_transfers', '*'),
          loadModelPhotos()
        ]);
        const { photoOf, countOf } = photos;
        const readyRows = ready.filter((r: any) => num(r.ready_pieces) > 0);
        // rows that carry no design/color (older entries) are resolved from their cutting batch
        const meta = await loadBatchMeta(readyRows.map((r: any) => ({ batch_code: r.batch_code || '', model_name: r.model_name })));

        const map = new Map<string, GarmentCard>();
        const dm = designLookup(await loadDesignMaster());
        const bnames = await loadBatchNames().catch(() => ({} as Record<string, string>));
        const [ledger, cutSizes] = await Promise.all([loadSizeLedger().catch(() => ({} as Record<string, SizeMap>)), loadCutSizes().catch(() => ({} as Record<string, SizeMap>))]);
        const bump = (card: GarmentCard, sizes: SizeMap, where: 'godown' | 'showroom', nm: string) => {
          Object.entries(sizes).forEach(([sz, q]) => {
            const cur = card.sizeStock.get(sz) || { godown: 0, showroom: 0 };
            cur[where] += q; card.sizeStock.set(sz, cur);
            if (nm) { const ns = card.nameSizes.get(nm) || {}; ns[sz] = (ns[sz] || 0) + q; card.nameSizes.set(nm, ns); }
          });
        };
        const add = (model: string, design: string, col: string, godown: number, showroom: number, batch = '') => {
          const m = String(model || '-').trim() || '-';
          const d = String(design || '-').trim() || '-';
          const c = String(col || '-').trim() || '-';
          const key = `${m}|${d}`.toLowerCase();
          let card = map.get(key);
          if (!card) { const info = dm(m, d); card = { model: m, design: d, image: '', colorCount: 0, colors: new Map(), batches: new Set<string>(), names: new Set<string>(), material: info?.material || '', fit: info?.fit || '', sizes: info?.sizes || '', price: info?.price || 0, mrp: info?.mrp || 0, photos: (info?.photos || []).filter(Boolean), swatches: info?.swatches || [], rates: Object.entries(info?.rates || {}).map(([size, r]) => ({ size, price: Number(r.price || 0), mrp: Number(r.mrp || 0) })), sizeStock: new Map(), nameSizes: new Map(), hideMain: !!info?.hideMain }; map.set(key, card); }
          if (batch) { card.batches.add(batch); if (nameFor(bnames, batch)) card.names.add(nameFor(bnames, batch)); }
          const ck = c.toLowerCase();
          const line = card.colors.get(ck) || { color: c, godown: 0, showroom: 0 };
          line.godown += godown;
          line.showroom += showroom;
          card.colors.set(ck, line);
        };
        readyRows.forEach((r: any) => {
          const mm = meta[r.batch_code || ''];
          const design = r.design_no && r.design_no !== '-' ? r.design_no : mm?.design || '-';
          const col = r.color && r.color !== '-' ? r.color : mm?.color || '-';
          add(r.model_name, design, col, num(r.ready_pieces), 0, String(r.batch_code || ''));
          const tot = Math.floor(num(r.ready_pieces));
          const by = sizesFor(String(r.batch_code || ''), tot, ledger, cutSizes);
          const sizes = Object.keys(by).length ? by : { [NO_SIZE]: tot };
          const card = map.get(`${String(r.model_name || '-').trim() || '-'}|${String(design || '-').trim() || '-'}`.toLowerCase());
          if (card) bump(card, sizes, 'godown', nameFor(bnames, String(r.batch_code || '')));
        });
        computeShowroomLines(transfers).forEach(l => { if (l.pcs > 0) add(l.model, l.design, l.color, 0, l.pcs); });
        transfers.forEach((t: any) => {
          const q = num(t.transferred_pieces); if (!q) return;
          const card = map.get(`${String(t.model_name || '-').trim() || '-'}|${String(t.design_no || '-').trim() || '-'}`.toLowerCase());
          if (card) bump(card, { [sizeOfRow(t)]: q }, 'showroom', nameFor(bnames, String(t.batch_code || '')));
        });
        map.forEach(card => card.sizeStock.forEach((v, k) => { if (v.godown + v.showroom <= 0) card.sizeStock.delete(k); }));

        const list = Array.from(map.values());
        list.forEach(card => {
          card.colorCount = countOf(card.model, card.design);
          for (const line of card.colors.values()) {
            const img = photoOf(card.model, card.design, line.color);
            if (img) { card.image = card.image || img; }
          }
          if (card.hideMain) card.image = '';
          if (!card.image && !card.hideMain) card.image = photoOf(card.model, card.design, '-');
          if (!card.image && card.photos[0]) card.image = card.photos[0];
        });
        list.sort((a, b) => (a.model + a.design).localeCompare(b.model + b.design));
        setCards(list);
      } catch (err: any) {
        setError('Catalog load தோல்வி: ' + errMsg(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [reloadKey]);

  /** one barcode label per size (Code 128 = MODEL-DESIGN-SIZE) */
  const printSizeLabels = (card: GarmentCard) => {
    const sizes = sizeKeys(card).filter(sz => sz !== NO_SIZE);
    if (sizes.length === 0) return notify('இந்த Design-க்கு Size விவரம் இல்லை.', 'err');
    const w = window.open('', '_blank'); if (!w) return;
    const esc = (x: any) => String(x ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
    const ascii = (x: string) => x.replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, '-');
    const n = Math.max(1, Math.min(50, Number(labelCopies) || 1));
    const cards = sizes.map(sz => {
      const r = rateOf(card, sz); const code = ascii(`${card.model}-${card.design}-${sz}`);
      const one = `<div class="l">${code128Svg(code, 45, 2)}<div class="c">${esc(code)}</div><div class="s">${esc(card.model)} • ${esc(card.design)} • Size <b>${esc(sz)}</b></div>${r.mrp ? `<div class="m">MRP ₹${r.mrp}</div>` : ''}</div>`;
      return one.repeat(n);
    }).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Size Labels</title><style>body{font-family:Arial,sans-serif;margin:10px}.g{display:flex;flex-wrap:wrap;gap:8px}.l{border:1px dashed #64748b;padding:6px;width:220px;text-align:center;page-break-inside:avoid}.l svg{max-width:100%;height:auto}.c{font-size:11px}.s{font-size:12px}.m{font-weight:bold;font-size:15px}</style></head><body><div class="g">${cards}</div><script>window.onload=function(){setTimeout(function(){window.print()},500)}<\/script></body></html>`);
    w.document.close();
  };
  const shareCard = (card: GarmentCard, lines: ColorLine[]) => {
    const colors = lines.map(l => l.color).filter(c => c && c !== '-').join(', ');
    const text = [`*Pommys – ${card.model}*`, `Design: ${card.design}`, card.material ? `Material: ${card.material}` : '', card.fit ? `Fit: ${card.fit}` : '', card.sizes ? `Size: ${card.sizes}` : '', card.price > 0 ? `Price: ₹${card.price}${card.mrp > 0 ? ` (MRP ₹${card.mrp})` : ''}` : '', card.rates.length ? `Size Rate: ${card.rates.map(r => `${r.size} ₹${r.price || '-'}${r.mrp ? '/' + r.mrp : ''}`).join(', ')}` : '', colors ? `Colours: ${colors}` : '', card.image ? card.image : ''].filter(Boolean).join('\n');
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
  };

  const printSheet = () => {
    const esc = (t: string) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
    const body = shown.map(({ card, lines }) => `
      <div class="c">
        ${card.image ? `<img src="${esc(card.image)}"/>` : '<div class="np">No Photo</div>'}
        <b>${esc(card.model)}</b><br/>Design: ${esc(card.design)}${card.colorCount > 0 ? ` • ${card.colorCount} Colours` : ''}${!hideStockQty && card.batches.size ? `<br/>Batch: ${esc(Array.from(card.batches).join(', '))}${card.names.size ? ' (' + esc(Array.from(card.names).join(', ')) + ')' : ''}` : ''}${card.material ? `<br/>Material: ${esc(card.material)}` : ''}${card.fit ? ` • Fit: ${esc(card.fit)}` : ''}${card.sizes ? `<br/>Size: ${esc(card.sizes)}` : ''}${card.price > 0 ? `<br/><b>Price: ₹${card.price}${card.mrp > 0 ? ` • MRP ₹${card.mrp}` : ''}</b>` : ''}${card.rates.length ? `<br/>Size Rate: ${esc(card.rates.map(r => `${r.size} ₹${r.price || '-'}${r.mrp ? '/' + r.mrp : ''}`).join(', '))}` : ''}
        <div class="cl">${lines.map(l => esc(l.color === '-' ? 'Stock' : l.color) + (hideStockQty ? '' : ` (${l.godown + l.showroom})`)).join(' • ')}</div>
      </div>`).join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><meta charset="utf-8"><title>Pommys Catalog</title><style>
      body{font-family:sans-serif;margin:14px} h2{margin:0 0 10px}
      .g{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
      .c{border:1px solid #ccc;border-radius:8px;padding:8px;page-break-inside:avoid;font-size:13px}
      .c img{width:100%;height:210px;object-fit:cover;border-radius:6px;margin-bottom:6px}
      .np{height:210px;background:#eee;display:flex;align-items:center;justify-content:center;color:#777;margin-bottom:6px}
      .cl{color:#555;margin-top:4px;font-size:12px}
    </style></head><body><h2>Pommys Catalog – ${new Date().toLocaleDateString('en-IN')}</h2><div class="g">${body}</div>
    <script>window.onload=function(){setTimeout(function(){window.print()},600)}<\/script></body></html>`);
    w.document.close();
  };

  const sizeKeys = (card: GarmentCard) => Array.from(new Set([...Array.from(card.sizeStock.keys()), ...card.rates.map(r => r.size)])).sort(sortSizes);
  /** each size has its OWN rate; the design's general price is used only for a size that has none */
  const rateOf = (card: GarmentCard, size: string) => { const r = card.rates.find(x => x.size === size); return { price: r && r.price > 0 ? r.price : card.price, mrp: r && r.mrp > 0 ? r.mrp : card.mrp, own: !!(r && r.price > 0) }; };
  const zoomItemsOf = (card: GarmentCard): ZoomItem[] => {
    const items: ZoomItem[] = [];
    if (card.image) items.push({ src: card.image, label: `${card.model} ${card.design}` });
    card.photos.forEach((u, i) => { if (u && u !== card.image) items.push({ src: u, label: ['Front', 'Back', 'Side', 'Close-up'][i] || `Photo ${i + 1}` }); });
    card.swatches.forEach(sw => { if (sw.photo) items.push({ src: sw.photo, label: `Colour: ${sw.name || ''}`.trim() }); });
    return items;
  };
  const openZoom = (card: GarmentCard, start: number) => setZoom({ items: zoomItemsOf(card), start });
  const renderCard = (card: GarmentCard, lines: ColorLine[], big = false) => {
    const sizes = sizeKeys(card);
    const zi = zoomItemsOf(card);
    return (
      <div key={card.model + card.design} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', background: '#f8fafc' }}>
        {card.image ? (
          <img src={card.image} alt={card.design} loading="lazy" onClick={() => openZoom(card, 0)} style={{ width: '100%', height: big ? '320px' : '190px', objectFit: 'cover', borderRadius: '6px', marginBottom: '10px', cursor: 'zoom-in' }} />
        ) : (
          <div style={{ height: big ? '320px' : '190px', background: '#e2e8f0', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px', color: '#64748b', fontSize: '12px' }}>No Photo</div>
        )}
        {card.photos.length > 1 && (
          <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
            {card.photos.map((u, i) => <img key={i} src={u} alt={['Front', 'Back', 'Side', 'Close-up'][i] || ''} title={['Front', 'Back', 'Side', 'Close-up'][i] || ''} loading="lazy" onClick={() => { const at = zi.findIndex(x => x.src === u); openZoom(card, at < 0 ? 0 : at); }} style={{ width: 42, height: 42, objectFit: 'cover', borderRadius: 4, border: '1px solid #cbd5e1', cursor: 'zoom-in' }} />)}
          </div>
        )}
        {card.swatches.length > 0 && <div style={{ marginBottom: '8px' }}><SwatchChips swatches={card.swatches} size={34} onZoom={i => { const sw = card.swatches[i]; const at = sw.photo ? zi.findIndex(x => x.src === sw.photo) : -1; if (at >= 0) openZoom(card, at); }} /></div>}
        <div style={{ fontWeight: 'bold', color: '#0f172a', fontSize: '15px' }}>{card.model}</div>
        <div style={{ fontSize: '13px', color: '#475569', marginBottom: '4px' }}>Design: {card.design}{card.colorCount > 0 ? ` • 🎨 ${card.colorCount} Colours` : ''}</div>
        <div style={{ fontSize: '12px', color: '#334155', marginBottom: '8px', lineHeight: 1.6 }}>
          {!hideStockQty && card.batches.size > 0 && <div>Batch: <b>{Array.from(card.batches).join(', ')}</b></div>}
          {!hideStockQty && card.names.size > 0 && <div>Local Name: <b style={{ color: '#6d28d9', fontSize: '14px' }}>{Array.from(card.names).join(', ')}</b></div>}
          {card.material && <div>Material: <b>{card.material}</b></div>}
          {card.fit && <div>Fit: <b>{card.fit}</b></div>}
          {sizes.length === 0 && card.sizes && <div>Size: <b>{card.sizes}</b></div>}
          {sizes.length === 0 && card.price > 0 && <div>Price: <b style={{ color: '#b91c1c' }}>₹{card.price}</b>{card.mrp > 0 && <> • MRP: <b>₹{card.mrp}</b></>}</div>}
        </div>
        {sizes.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', background: 'white', marginBottom: '8px' }}>
            <thead><tr style={{ background: '#e2e8f0' }}><th style={{ padding: 4, textAlign: 'left' }}>Size</th><th style={{ padding: 4 }}>Rate</th><th style={{ padding: 4 }}>MRP</th>{!hideStockQty && <><th style={{ padding: 4 }}>Godown</th><th style={{ padding: 4 }}>Showroom</th><th style={{ padding: 4 }}>மொத்தம்</th></>}</tr></thead>
            <tbody>
              {sizes.map(sz => {
                const r = rateOf(card, sz); const st = card.sizeStock.get(sz) || { godown: 0, showroom: 0 };
                return (
                  <tr key={sz} style={{ borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <td style={{ padding: 4, textAlign: 'left', fontWeight: 'bold' }}>{sz}</td>
                    <td style={{ padding: 4, color: '#b91c1c', fontWeight: 'bold' }}>{r.price ? `₹${r.price}` : '-'}{r.price && !r.own ? '*' : ''}</td>
                    <td style={{ padding: 4 }}>{r.mrp ? `₹${r.mrp}` : '-'}</td>
                    {!hideStockQty && <><td style={{ padding: 4 }}>{st.godown}</td><td style={{ padding: 4 }}>{st.showroom}</td><td style={{ padding: 4, fontWeight: 'bold', color: st.godown + st.showroom > 0 ? '#059669' : '#dc2626' }}>{st.godown + st.showroom}</td></>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {sizes.some(sz => !rateOf(card, sz).own && rateOf(card, sz).price > 0) && <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '6px' }}>* இந்த Size-க்கு தனி Rate போடவில்லை — Design-ன் பொது Price காட்டப்படுகிறது.</div>}
        {!hideStockQty && card.nameSizes.size > 0 && (
          <div style={{ fontSize: '12px', marginBottom: '8px', background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '6px', padding: '6px 8px' }}>
            {Array.from(card.nameSizes.entries()).map(([nm, m]) => (
              <div key={nm}><b style={{ color: '#6d28d9', fontSize: '13px' }}>{nm}</b>: {Object.keys(m).sort(sortSizes).map(k => `${k} ${m[k]}`).join(' • ')}</div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {lines.map(l => {
            const total = l.godown + l.showroom;
            return (
              <div key={l.color} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 8px' }}>
                <span style={{ fontWeight: 'bold' }}>{l.color === '-' ? 'Stock' : l.color}</span>
                <span style={{ color: total > 0 ? '#059669' : '#dc2626', fontWeight: 'bold' }}>
                  {total > 0 ? (hideStockQty ? '✅ In Stock' : `${total} Pcs`) : '❌ Out'}
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
          <button type="button" onClick={() => shareCard(card, lines)} style={{ ...styles.secondaryBtn, flex: 1, padding: '6px', fontSize: '12px', background: '#dcfce7', color: '#166534' }}>📲 WhatsApp-ல் பகிர்</button>
          {canEdit && sizes.length > 0 && <button type="button" title="Size வாரி Barcode Label" onClick={() => printSizeLabels(card)} style={{ ...styles.secondaryBtn, padding: '6px 8px', fontSize: '12px' }}>🏷️</button>}
          {canEdit && <button type="button" onClick={() => setEditing({ model: card.model, design: card.design })} style={{ ...styles.secondaryBtn, flex: 1, padding: '6px', fontSize: '12px' }}>🖼️ Photo Edit / Delete</button>}
        </div>
        {!hideStockQty && (
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
            Godown {lines.reduce((s, l) => s + l.godown, 0)} • Showroom {lines.reduce((s, l) => s + l.showroom, 0)} Pcs
          </div>
        )}
      </div>
    );
  };

  const allColors = uniqueSorted(cards.flatMap(c => Array.from(c.colors.values()).map(l => l.color)));
  const q = search.trim().toLowerCase();
  const shown = cards.map(card => {
    const lines = Array.from(card.colors.values()).filter(l => (!color || l.color === color) && (!inStockOnly || l.godown + l.showroom > 0));
    return { card, lines };
  }).filter(x => x.lines.length > 0 && (!q || `${x.card.model} ${x.card.design} ${x.lines.map(l => l.color).join(' ')}${hideStockQty ? '' : ` ${Array.from(x.card.names).join(' ')} ${Array.from(x.card.batches).join(' ')}`}`.toLowerCase().includes(q)));

  return (
    <div>
      {error && <div style={{ marginBottom: '12px' }}><ErrorBanner message={error} /></div>}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
        <input type="text" placeholder={hideStockQty ? '🔍 Model / Design தேடுக...' : '🔍 Model / Design / Local Name தேடுக...'} value={search} onChange={e => setSearch(e.target.value)} style={{ ...styles.input, maxWidth: '260px' }} />
        <select value={color} onChange={e => setColor(e.target.value)} style={{ ...styles.input, maxWidth: '180px' }}>
          <option value="">All Colors</option>
          {allColors.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 'bold', color: '#475569', cursor: 'pointer' }}>
          <input type="checkbox" checked={inStockOnly} onChange={e => setInStockOnly(e.target.checked)} /> In Stock மட்டும்
        </label>
        <span style={{ fontSize: '12px', color: '#64748b' }}>{shown.length} Design(s)</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {([['grid', '▦ Grid'], ['slide', '🎞️ Slide'], ['list', '☰ List']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => { setView(k); setSlideIdx(0); }} style={{ ...styles.secondaryBtn, padding: '6px 12px', background: view === k ? '#1e293b' : '#e2e8f0', color: view === k ? 'white' : '#475569' }}>{l}</button>
          ))}
        </div>
        {canEdit && <label style={{ fontSize: '12px', color: '#475569' }}>🏷️ Label/Size <input type="number" min="1" max="50" value={labelCopies} onChange={e => setLabelCopies(e.target.value)} style={{ ...styles.input, width: '56px', display: 'inline-block' }} /></label>}
        <button type="button" onClick={printSheet} disabled={shown.length === 0} style={{ ...styles.secondaryBtn, marginLeft: 'auto' }}>🖨️ Print / PDF</button>
      </div>
      {loading ? <Loading /> : shown.length === 0 ? <p style={{ color: '#64748b' }}>Ready Stock-ல் Design எதுவும் இல்லை.</p> : (
        <>
          {view === 'grid' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px' }}>
              {shown.map(({ card, lines }) => renderCard(card, lines))}
            </div>
          )}
          {view === 'slide' && (() => {
            const idx = Math.min(slideIdx, shown.length - 1);
            const cur = shown[idx];
            return (
              <div onTouchStart={e => setTouchX(e.touches[0].clientX)} onTouchEnd={e => { if (touchX === null) return; const dx = e.changedTouches[0].clientX - touchX; setTouchX(null); if (Math.abs(dx) > 50) setSlideIdx(i => (dx < 0 ? Math.min(shown.length - 1, i + 1) : Math.max(0, i - 1))); }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
                  <button type="button" aria-label="Previous design" disabled={idx === 0} onClick={() => setSlideIdx(idx - 1)} style={{ ...styles.primaryBtn, fontSize: '18px', opacity: idx === 0 ? 0.4 : 1 }}>◀</button>
                  <b style={{ color: '#475569' }}>{idx + 1} / {shown.length} — இடம் / வலம் Swipe செய்யலாம்</b>
                  <button type="button" aria-label="Next design" disabled={idx >= shown.length - 1} onClick={() => setSlideIdx(idx + 1)} style={{ ...styles.primaryBtn, fontSize: '18px', opacity: idx >= shown.length - 1 ? 0.4 : 1 }}>▶</button>
                </div>
                <div style={{ maxWidth: '460px', margin: '0 auto' }}>{renderCard(cur.card, cur.lines, true)}</div>
              </div>
            );
          })()}
          {view === 'list' && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '760px', borderCollapse: 'collapse', background: 'white' }}>
                <thead><tr style={{ background: '#0f172a', color: 'white' }}>{['Photo', 'Model / Design', ...(hideStockQty ? [] : ['Local Name']), 'Colours', 'Size வாரி', 'Rate / MRP'].map(h => <th key={h} style={styles.thSub}>{h}</th>)}</tr></thead>
                <tbody>
                  {shown.map(({ card, lines }) => (
                    <tr key={card.model + card.design} style={{ borderBottom: '1px solid #e2e8f0', verticalAlign: 'top' }}>
                      <td style={styles.td}>{card.image ? <img src={card.image} alt={card.design} loading="lazy" onClick={() => openZoom(card, 0)} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, cursor: 'zoom-in' }} /> : <span style={{ color: '#94a3b8', fontSize: 11 }}>No Photo</span>}</td>
                      <td style={styles.td}><b>{card.model}</b><div style={{ fontSize: 12, color: '#475569' }}>Design: {card.design}</div></td>
                      {!hideStockQty && <td style={{ ...styles.td, fontWeight: 'bold', color: '#6d28d9' }}>{Array.from(card.names).join(', ') || '-'}</td>}
                      <td style={styles.td}>{lines.map(l => `${l.color === '-' ? 'Stock' : l.color}${hideStockQty ? '' : ` (${l.godown + l.showroom})`}`).join(', ')}</td>
                      <td style={styles.td}>{sizeKeys(card).map(sz => <div key={sz} style={{ fontSize: 12 }}><b>{sz}</b>{hideStockQty ? '' : `: ${(card.sizeStock.get(sz)?.godown || 0) + (card.sizeStock.get(sz)?.showroom || 0)}`}</div>)}</td>
                      <td style={styles.td}>{sizeKeys(card).map(sz => { const r = rateOf(card, sz); return <div key={sz} style={{ fontSize: 12 }}><b>{sz}</b> ₹{r.price || '-'}{r.mrp ? ` / ${r.mrp}` : ''}</div>; })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {zoom && <ZoomViewer items={zoom.items} start={zoom.start} onClose={() => setZoom(null)} />}
      {editing && <GalleryEditor model={editing.model} design={editing.design} onClose={() => setEditing(null)} onSaved={() => setReloadKey(k => k + 1)} />}
    </div>
  );
}

export default function CatalogModule({ hideCostRate, hideStockQty, canEdit = false }: { hideCostRate: boolean; hideStockQty: boolean; canEdit?: boolean }) {
  const [tab, setTab] = useState<'garments' | 'fabrics'>('garments');
  const tabBtn = (active: boolean) => ({ ...(active ? styles.primaryBtn : styles.secondaryBtn), padding: '8px 16px', fontSize: '13px' });
  return (
    <div style={styles.card}>
      <h4 style={{ margin: '0 0 14px 0', color: '#0f172a' }}>📒 Pommys Sample Catalog</h4>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button type="button" onClick={() => setTab('garments')} style={tabBtn(tab === 'garments')}>👕 Garments (Model / Design)</button>
        <button type="button" onClick={() => setTab('fabrics')} style={tabBtn(tab === 'fabrics')}>🧵 Fabrics</button>
      </div>
      {tab === 'garments' ? <GarmentCatalog hideStockQty={hideStockQty} canEdit={canEdit} /> : <FabricCatalog hideCostRate={hideCostRate} hideStockQty={hideStockQty} />}
    </div>
  );
}
