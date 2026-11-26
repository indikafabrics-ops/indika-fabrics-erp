import { useEffect, useState } from 'react';
import { fetchAll, errMsg } from '../lib/supabase';
import { r3, num, uniqueSorted, computeShowroomLines } from '../lib/helpers';
import { loadModelPhotos } from '../lib/batchMeta';
import { loadBatchMeta } from '../lib/batchMeta';
import { loadDesignMaster, designLookup, type Swatch } from '../lib/masterStore';
import { SwatchChips } from '../components/GallerySlots';
import { loadBatchNames, nameFor } from '../lib/batchNames';
import { ErrorBanner, ImagePreview, Loading, styles } from '../components/ui';

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
interface GarmentCard { model: string; design: string; image: string; colorCount: number; colors: Map<string, ColorLine>; batches: Set<string>; names: Set<string>; material: string; fit: string; sizes: string; price: number; mrp: number; photos: string[]; swatches: Swatch[]; rates: { size: string; price: number; mrp: number }[] }

/** Salesman "menu card": one card per Model + Design with photo, colors and live stock. */
function GarmentCatalog({ hideStockQty }: { hideStockQty: boolean }) {
  const [cards, setCards] = useState<GarmentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [color, setColor] = useState('');
  const [inStockOnly, setInStockOnly] = useState(true);
  const [preview, setPreview] = useState('');

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
        const add = (model: string, design: string, col: string, godown: number, showroom: number, batch = '') => {
          const m = String(model || '-').trim() || '-';
          const d = String(design || '-').trim() || '-';
          const c = String(col || '-').trim() || '-';
          const key = `${m}|${d}`.toLowerCase();
          let card = map.get(key);
          if (!card) { const info = dm(m, d); card = { model: m, design: d, image: '', colorCount: 0, colors: new Map(), batches: new Set<string>(), names: new Set<string>(), material: info?.material || '', fit: info?.fit || '', sizes: info?.sizes || '', price: info?.price || 0, mrp: info?.mrp || 0, photos: (info?.photos || []).filter(Boolean), swatches: info?.swatches || [], rates: Object.entries(info?.rates || {}).map(([size, r]) => ({ size, price: Number(r.price || info?.price || 0), mrp: Number(r.mrp || info?.mrp || 0) })) }; map.set(key, card); }
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
        });
        computeShowroomLines(transfers).forEach(l => { if (l.pcs > 0) add(l.model, l.design, l.color, 0, l.pcs); });

        const list = Array.from(map.values());
        list.forEach(card => {
          card.colorCount = countOf(card.model, card.design);
          for (const line of card.colors.values()) {
            const img = photoOf(card.model, card.design, line.color);
            if (img) { card.image = card.image || img; }
          }
          if (!card.image) card.image = photoOf(card.model, card.design, '-');
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
  }, []);

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

  const allColors = uniqueSorted(cards.flatMap(c => Array.from(c.colors.values()).map(l => l.color)));
  const q = search.trim().toLowerCase();
  const shown = cards.map(card => {
    const lines = Array.from(card.colors.values()).filter(l => (!color || l.color === color) && (!inStockOnly || l.godown + l.showroom > 0));
    return { card, lines };
  }).filter(x => x.lines.length > 0 && (!q || `${x.card.model} ${x.card.design} ${x.lines.map(l => l.color).join(' ')}`.toLowerCase().includes(q)));

  return (
    <div>
      {error && <div style={{ marginBottom: '12px' }}><ErrorBanner message={error} /></div>}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
        <input type="text" placeholder="🔍 Model / Design தேடுக..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...styles.input, maxWidth: '260px' }} />
        <select value={color} onChange={e => setColor(e.target.value)} style={{ ...styles.input, maxWidth: '180px' }}>
          <option value="">All Colors</option>
          {allColors.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 'bold', color: '#475569', cursor: 'pointer' }}>
          <input type="checkbox" checked={inStockOnly} onChange={e => setInStockOnly(e.target.checked)} /> In Stock மட்டும்
        </label>
        <span style={{ fontSize: '12px', color: '#64748b' }}>{shown.length} Design(s)</span>
        <button type="button" onClick={printSheet} disabled={shown.length === 0} style={{ ...styles.secondaryBtn, marginLeft: 'auto' }}>🖨️ Print / PDF</button>
      </div>
      {loading ? <Loading /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px' }}>
          {shown.length === 0 ? <p style={{ color: '#64748b' }}>Ready Stock-ல் Design எதுவும் இல்லை.</p> : shown.map(({ card, lines }) => (
            <div key={card.model + card.design} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', background: '#f8fafc' }}>
              {card.image ? (
                <img src={card.image} alt={card.design} loading="lazy" onClick={() => setPreview(card.image)} style={{ width: '100%', height: '190px', objectFit: 'cover', borderRadius: '6px', marginBottom: '10px', cursor: 'zoom-in' }} />
              ) : (
                <div style={{ height: '190px', background: '#e2e8f0', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px', color: '#64748b', fontSize: '12px' }}>No Photo</div>
              )}
              {card.photos.length > 1 && (
                <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                  {card.photos.map((u, i) => <img key={i} src={u} alt={['Front', 'Back', 'Side', 'Close-up'][i] || ''} title={['Front', 'Back', 'Side', 'Close-up'][i] || ''} loading="lazy" onClick={() => setPreview(u)} style={{ width: 42, height: 42, objectFit: 'cover', borderRadius: 4, border: '1px solid #cbd5e1', cursor: 'zoom-in' }} />)}
                </div>
              )}
              {card.swatches.length > 0 && <div style={{ marginBottom: '8px' }}><SwatchChips swatches={card.swatches} size={34} /></div>}
              <div style={{ fontWeight: 'bold', color: '#0f172a', fontSize: '15px' }}>{card.model}</div>
              <div style={{ fontSize: '13px', color: '#475569', marginBottom: '4px' }}>Design: {card.design}{card.colorCount > 0 ? ` • 🎨 ${card.colorCount} Colours` : ''}</div>
              <div style={{ fontSize: '12px', color: '#334155', marginBottom: '8px', lineHeight: 1.6 }}>
                {!hideStockQty && card.batches.size > 0 && <div>Batch: <b>{Array.from(card.batches).join(', ')}</b></div>}
                {!hideStockQty && card.names.size > 0 && <div>Local Name: <b>{Array.from(card.names).join(', ')}</b></div>}
                {card.material && <div>Material: <b>{card.material}</b></div>}
                {card.fit && <div>Fit: <b>{card.fit}</b></div>}
                {card.sizes && <div>Size: <b>{card.sizes}</b></div>}
                {card.price > 0 && <div>Price: <b style={{ color: '#b91c1c' }}>₹{card.price}</b>{card.mrp > 0 && <> • MRP: <b>₹{card.mrp}</b></>}</div>}
                {card.price === 0 && card.mrp > 0 && <div>MRP: <b>₹{card.mrp}</b></div>}
                {card.rates.length > 0 && <div>Size Rate: {card.rates.map(r => <span key={r.size} style={{ marginRight: '6px' }}><b>{r.size}</b> ₹{r.price || '-'}{r.mrp ? `/${r.mrp}` : ''}</span>)}</div>}
              </div>
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
              <button type="button" onClick={() => shareCard(card, lines)} style={{ ...styles.secondaryBtn, width: '100%', marginTop: '8px', padding: '6px', fontSize: '12px', background: '#dcfce7', color: '#166534' }}>📲 WhatsApp-ல் பகிர்</button>
              {!hideStockQty && (
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
                  Godown {lines.reduce((s, l) => s + l.godown, 0)} • Showroom {lines.reduce((s, l) => s + l.showroom, 0)} Pcs
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {preview && <ImagePreview src={preview} onClose={() => setPreview('')} />}
    </div>
  );
}

export default function CatalogModule({ hideCostRate, hideStockQty }: { hideCostRate: boolean; hideStockQty: boolean }) {
  const [tab, setTab] = useState<'garments' | 'fabrics'>('garments');
  const tabBtn = (active: boolean) => ({ ...(active ? styles.primaryBtn : styles.secondaryBtn), padding: '8px 16px', fontSize: '13px' });
  return (
    <div style={styles.card}>
      <h4 style={{ margin: '0 0 14px 0', color: '#0f172a' }}>📒 Pommys Sample Catalog</h4>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button type="button" onClick={() => setTab('garments')} style={tabBtn(tab === 'garments')}>👕 Garments (Model / Design)</button>
        <button type="button" onClick={() => setTab('fabrics')} style={tabBtn(tab === 'fabrics')}>🧵 Fabrics</button>
      </div>
      {tab === 'garments' ? <GarmentCatalog hideStockQty={hideStockQty} /> : <FabricCatalog hideCostRate={hideCostRate} hideStockQty={hideStockQty} />}
    </div>
  );
}
