import { useState } from 'react';
import type { MenuKey } from '../lib/constants';
import { styles } from '../components/ui';

interface Section { key: MenuKey | 'all'; icon: string; title: string; steps: string[]; tips?: string[] }

const SECTIONS: Section[] = [
  {
    key: 'all', icon: '🧭', title: 'முழு ஓட்டம் (முதலில் இதைப் படியுங்கள்)',
    steps: [
      'துணி வாங்கினால் → "Purchase & Opening Stock"-ல் Bill பதிவு (GRN).',
      'துணியை வெட்டினால் → "Fabric Issue & Cutting"-ல் Cutting பதிவு. துணி Stock தானாகக் குறையும்.',
      'தைக்கக் கொடுத்தால் → "Tailor Ledger"-ல் தையல்காரர் பெயர் + Batch தேர்வு.',
      'தையல் நிலை மாறும்போது → "Production WIP"-ல் "Move to ..." அழுத்தவும். கடைசி நிலை முடிந்தால் ஆடை Godown Ready Stock-க்குப் போகும்.',
      'கடைக்கு அனுப்பினால் → "Ready Stock & Showrooms"-ல் Transfer.',
      'கடையில் விற்றால் → அதே பக்கத்தில் Sale பதிவு (அல்லது Busy Report-ஐ Import).',
      'இருப்பு, விற்பனை, குறைவான Design பார்க்க → "Master Reports".'
    ],
    tips: ['எல்லா இடத்திலும் முடிந்தவரை பட்டியலிலிருந்து தேர்வு செய்யுங்கள்; புதிய பெயர் மட்டும் "+ New" அழுத்தித் தட்டச்சு செய்யுங்கள்.', 'ஒரே பெயரை வெவ்வேறு எழுத்துப்பிழையில் தட்டச்சு செய்யாதீர்கள்; அப்போது Report-ல் தனித்தனியாகப் பிரியும்.']
  },
  {
    key: 'grn', icon: '📥', title: 'Purchase GRN (துணி வாங்கிய Bill)',
    steps: [
      '"Purchase & Opening Stock" → "Purchase & GRN Entry".',
      'Supplier-ஐப் பட்டியலிலிருந்து தேர்வு செய்யுங்கள். ஊர், GST தானாக நிரம்பும். புதிய Supplier என்றால் "+ New".',
      'Bill எண், Bill தேதி போடுங்கள். Bill படம்/PDF இருந்தால் ஏற்றினால் விவரங்கள் தானாக நிரம்பும் (சரிபார்த்துக்கொள்ளுங்கள்).',
      'ஒவ்வொரு துணிக்கும் ஒரு வரி: Item தேர்ந்தால் Quality, Width, Rate தானாக வரும். Design, Color தேர்வு செய்து Meters போடுங்கள்.',
      'Damage / Shortage / Return இருந்தால் மட்டும் அந்தக் கட்டத்தில் போடுங்கள்.',
      'விலை கடந்த முறையை விட அதிகமானால் மஞ்சள் எச்சரிக்கை வரும்; சரிபார்க்கவும்.',
      'கடைசியில் Save. அதே Bill எண் ஏற்கனவே இருந்தால் எச்சரிக்கும்.'
    ],
    tips: ['ஒரு Bill-ல் பல துணிகள் இருந்தால் "+ Add Row" அழுத்தவும்.']
  },
  {
    key: 'grn', icon: '📊', title: 'பழைய Stock-ஐ Excel-ல் ஏற்றுதல் (ஒரே ஒரு முறை)',
    steps: [
      '"Purchase & Opening Stock" → "Quick Opening & Trading Stock".',
      '"⬇️ Template" அழுத்தி கோப்பை எடுங்கள்.',
      'Excel-ல் உங்கள் பழைய Stock-ஐ நிரப்புங்கள். Stage: Fabric, Cutparts, WIP, Ready Godown, Ready Showroom, Trading, End Bit, Damage. Design எண்ணை மறக்காமல் எழுதுங்கள்.',
      '"📊 Excel / CSV Upload" அழுத்தி அந்தக் கோப்பை ஏற்றுங்கள். வரிகள் கீழே வரும்; சரிபார்க்கலாம்.',
      'Photo சேர்க்க: படங்களை Design எண் பெயரில் சேமித்து (D-101.jpg) "📷 பல Photo ஒரே நேரத்தில்" அழுத்தி எல்லாவற்றையும் ஒரே முறை தேர்ந்தெடுக்கவும்.',
      'எல்லாம் சரியாக இருந்தால் "Save All".'
    ],
    tips: ['பழைய Stock-ஐ ஒரே ஒரு முறை மட்டும் ஏற்றுங்கள்; மீண்டும் ஏற்றினால் இரட்டிப்பாகும்.', 'முதலில் 5 வரிகளுடன் சோதித்துப் பாருங்கள்.']
  },
  {
    key: 'cutting', icon: '✂️', title: 'Cutting பதிவு',
    steps: [
      '"Fabric Issue & Cutting" திறக்கவும். Batch எண் தானாக வரும்.',
      'எந்தத் துணியை வெட்டினீர்கள் என்று பட்டியலிலிருந்து தேர்வு செய்து, எத்தனை மீட்டர் எடுத்தீர்கள் என்று போடுங்கள் ("All" அழுத்தினால் முழுத் துணி).',
      'Model தேர்வு செய்யுங்கள். முந்தைய Cutting-படி எத்தனை Piece வரும் என்ற கணிப்பு நீல நிறத்தில் வரும்.',
      'Model Photo சேர்க்கலாம் (விருப்பம்). ஒவ்வொரு Color-க்கும் தனிப் படம், "No. of Colours" எண்ணிக்கையும் விருப்பம்.',
      'Size தேர்ந்து Pieces போடுங்கள் (பல Size இருந்தால் வரிகளைச் சேர்க்கவும்).',
      'மீதித் துணி (End Bit) தானாகப் பரிந்துரைக்கப்படும்; சரியா என்று பார்த்து Save Batch.'
    ],
    tips: ['கணிப்பை விட 30%க்கு மேல் Pieces போட்டால் "சரியா?" என்று கேட்கும்; எண்ணைச் சரிபாருங்கள்.', 'இருப்பை விட அதிகத் துணி எடுக்க முடியாது.']
  },
  {
    key: 'production', icon: '🏭', title: 'Production WIP (தையல் நிலைகள்)',
    steps: [
      '"Production WIP" திறந்தால் ஒவ்வொரு நிலையிலும் (Cutting, Stitching, QC, Packing) உள்ள Batch-கள் தெரியும்.',
      'அடுத்த நிலைக்கு நகர்த்த: எத்தனை Pieces என்று போட்டு "Move to ..." அழுத்தவும். பாதி மட்டும் நகர்த்தலாம்; மீதி அதே நிலையில் இருக்கும்.',
      'சேதமான துண்டுகள் இருந்தால் Damage என்று பதியுங்கள்.',
      'Packing முடிந்து "Ready Stock"-க்கு நகர்த்தினால் ஆடை Godown Ready Stock-ல் சேரும்.'
    ]
  },
  {
    key: 'tailor', icon: '🧵', title: 'Tailor Ledger (தையல்காரர் கணக்கு)',
    steps: [
      '"Tailor Ledger & Jobwork" திறக்கவும்.',
      'தையல்காரரைப் பட்டியலிலிருந்து தேர்ந்து, Batch-ஐத் தேர்வு செய்யுங்கள். Rate தானாக வரும்.',
      'எத்தனை Pieces கொடுத்தீர்கள் என்று போட்டு Save (நிலை: Issued).',
      'தைத்துத் திரும்ப வந்ததும் அந்த வரியில் "Received" என்று மாற்றுங்கள். தவறாக மாற்றினால் Undo உண்டு.',
      'யாருக்கு எவ்வளவு கூலி கொடுக்க வேண்டும் என்பது Reports → "Sales & Re-cut"-ல் தெரியும்.'
    ]
  },
  {
    key: 'storeroom', icon: '🏪', title: 'Store Room & Trims',
    steps: [
      '"Store Room & Trims" திறக்கவும்.',
      'Trim (பட்டன், ஜிப், லேஸ்...) வந்தால் IN, எடுத்தால் OUT என்று Item-ஐத் தேர்ந்து எண்ணிக்கை போடுங்கள்.',
      'குறைந்தபட்ச அளவு (Min Level) வைத்தால், குறையும்போது Dashboard-ல் எச்சரிக்கை வரும்.'
    ]
  },
  {
    key: 'readystock', icon: '👕', title: 'Ready Stock, Showroom, விற்பனை',
    steps: [
      'முதல் முறை: "Add Showroom" மூலம் கடைகளைச் சேர்க்கவும்.',
      'Godown-லிருந்து கடைக்கு அனுப்ப: Transfer பகுதியில் Batch, Showroom, Pieces தேர்வு செய்து Save.',
      'கடையில் விற்றது / திரும்பியது / சேதம்: "Showroom Sale / Return / Damage" பகுதியில் Showroom + Item தேர்ந்து Type (Sold / Return / Damage), Pieces போடுங்கள்.',
      'Busy-ல் விற்பனை பதிந்திருந்தால்: "📥 Busy Sales Import" திறந்து Busy Report-ஐ (Excel/CSV) ஏற்றுங்கள் → "முன்னோட்டம் காட்டு" → ✅ வரிகளை Import செய்.',
      'Photo சேர்க்க: வரிசையில் 📷 Photo, அல்லது மேலே "📷 பல Photo ஒரே நேரத்தில்" (File பெயர் = Design எண்).'
    ],
    tips: ['விற்பனையை "Sale" என்று பதிவு செய்தால்தான் Reports-ல் விற்பனை, Low Stock கணக்குகள் சரியாக வரும்.', 'Busy Import-ல் அதே கோப்பை மீண்டும் ஏற்றினாலும் இரட்டிப்பாகாது.']
  },
  {
    key: 'catalog', icon: '📒', title: 'Catalog (Salesman மாதிரி அட்டை)',
    steps: [
      '"Salesman & Customer Catalog" → "👕 Garments": Design வாரியாகப் படத்துடன் அட்டை தெரியும்.',
      'தேடல் பெட்டியில் Model/Design தட்டச்சு செய்யலாம்; Color-ஐப் பட்டியலிலிருந்து தேர்ந்து வடிகட்டலாம்.',
      'படத்தைத் தொட்டால் பெரிதாகும். "📲 WhatsApp-ல் பகிர்" அழுத்தினால் Design + Photo இணைப்பு வாடிக்கையாளருக்குச் செல்லும்.',
      '"🖨️ Print / PDF" அழுத்தினால் படங்களுடன் அச்சுத் தாள் வரும்; PDF ஆகச் சேமித்து WhatsApp-ல் அனுப்பலாம்.'
    ]
  },
  {
    key: 'reports', icon: '📊', title: 'Reports',
    steps: [
      '"Master Reports & Export" திறந்து மேலே உள்ள tab-களைத் தேர்வு செய்யுங்கள்.',
      'Stock Summary: Model/Design/Color வாரியாக Godown, Showroom இருப்பு.',
      'Fabric Godown: துணி இருப்பும் மதிப்பும். End Bits & Damage: மீதித் துணி, சேதம்.',
      '📈 Sales & Re-cut: Showroom வாரி விற்பனை, மீண்டும் Cut செய்ய வேண்டியவை, தேங்கிய Stock, தையல்காரர் கூலி, Cutting Yield.',
      'Supplier History: Supplier வாரி வாங்கிய விவரம். ஒவ்வொரு tab-லும் "Export Excel (CSV)" உண்டு.'
    ]
  },
  {
    key: 'analysis', icon: '🔎', title: 'Search & Analysis, Print / PDF / WhatsApp',
    steps: [
      'Dashboard-ல் எந்த Card-ஐயும் Click செய்தால் அதன் பின்னாலுள்ள முழு விவரம் (Batch, Design, Color, Supplier…) வரும். அங்கே தேடலாம்.',
      'எல்லா Report-லும் 🖨️ Print · 📄 PDF · 📲 WhatsApp · 📊 Excel பொத்தான்கள் உண்டு. PDF வேண்டுமானால் Print Window-ல் "Save as PDF" தேர்வு செய்யவும்.',
      'Cutting-ல் ஒவ்வொரு Batch-க்கும் "Local Name" (உங்கள் பெயர்) தேர்வு செய்யலாம். அது Godown, Catalog, Reports-ல் Batch Code-உடன் வரும்.',
      '"Search & Analysis": Daily Summary (இன்று என்ன நடந்தது), Search + Batch Timeline (வாங்கியது முதல் விற்பனை வரை), Batch Profit, Supplier Account, எச்சரிக்கைகள், Barcode Label, Audit Log (Admin).',
      'Supplier / Showroom-க்கு Mobile எண் சேமித்திருந்தால் WhatsApp நேரடியாக அந்த எண்ணுக்குத் திறக்கும்.'
    ],
    tips: ['Barcode Label-ஐ Scan செய்தால் Batch Code Search பெட்டியில் விழும்.', 'Dashboard-ல் 7 நாளுக்கு மேல் Backup எடுக்காவிட்டால் நினைவூட்டல் வரும்.']
  },
  {
    key: 'records', icon: '✏️', title: 'Edit / Delete & Admin Approval',
    steps: [
      '"Edit / Delete Records" பக்கத்தில் Table தேர்வு செய்து, தேடி, வரியின் ✏️ Edit அல்லது 🗑️ Delete அழுத்தவும் (Ready Stock Godown பட்டியலிலும் இதே பொத்தான்கள் உண்டு).',
      'Office / Salesman செய்தால் மாற்றம் உடனே நடக்காது. அது Admin Login-இல் "Approvals" பக்கத்தில் காத்திருக்கும். "என் கோரிக்கைகள்" பட்டியலில் நிலை தெரியும்.',
      'Admin "✅ Approve" அழுத்தினால் மட்டுமே Edit/Delete நடக்கும்; "❌ Reject" செய்தால் எதுவும் மாறாது. Admin செய்தால் உடனே நடக்கும்.',
      'Admin மெனுவில் காத்திருக்கும் கோரிக்கைகளின் எண்ணிக்கை சிவப்பு எண்ணாகத் தெரியும். Office பயனருக்கு இந்த மெனு தெரிய, Security-ல் "Edit / Delete Records" உரிமை கொடுக்கவும்.'
    ],
    tips: ['நிறம் பல இருந்தால் "Assorted" தேர்வு செய்யலாம்; இரண்டு நிறம் என்றால் Color 2-ஐயும் தேர்வு செய்யுங்கள்.', 'Cutting-ல் Material, Fit, Price ஒரு முறை போட்டால் Godown, Catalog வரை தானாக வரும்.']
  },
  {
    key: 'all', icon: '📏', title: 'Size வாரியாக Qty, Rate / MRP, Photos, Colour Squares',
    steps: [
      'Production WIP-ல் மேலே Cutting / Stitching / QC Check / Packing Tab-கள் உண்டு; ஒவ்வொரு Tab-லும் அந்த Stage-ன் Stock மட்டும் தெரியும்.',
      'நகர்த்தும்போது ஒவ்வொரு Size-க்கும் தனிக் கட்டம் வரும் (எ.கா. M 5, L 2). எதுவும் உள்ளிடாவிட்டால் மீதமுள்ள முழு Qty நகரும்; Damage-ம் Size வாரியாக உள்ளிடலாம்.',
      'Godown → Showroom Transfer-லும் Size வாரியாக எத்தனை வேண்டுமானாலும் தேர்வு செய்யலாம். Showroom Sale / Return / Damage-லும் Size வாரியாக Qty; Rate & MRP தானாக வரும்; விற்பனை Slip-ஐ Print / WhatsApp செய்யலாம்.',
      'Cutting-ல் ஒவ்வொரு Size வரியிலும் "Size Rate ₹" மற்றும் "Size MRP ₹" தரலாம். காலியாக விட்டால் மேலே உள்ள பொது Selling Price / MRP பயன்படும். MRP தனி; Selling Rate தனி.',
      'Product Photo: முதலில் 1 கட்டம்; "+ Add Photo" மூலம் Back, Side, Close-up (அதிகபட்சம் 4). Colour Squares: முதலில் 1; "+ Add Colour" (அதிகபட்சம் 6). ஒவ்வொன்றிலும் Fabric Photo அல்லது Colour பெயர் (Assorted-உம் உண்டு).',
      'Godown பட்டியலில் 🖼️ பொத்தானால் எந்த Design-க்கும் Photo / Colour Squares பின்னரும் சேர்க்கலாம். Catalog-ல் Photo வரிசை, Colour Square, MRP, Size Rate தெரியும்.',
      'Busy Sales Import-ல் "Size column" இருந்தால் Size வாரியாகவே Stock குறையும்.',
      'எந்தப் பக்கத்திலும் உள்ளே சென்றால் மேலே "← Back" பொத்தான் வரும்; Phone / Browser Back-உம் வேலை செய்யும்.'
    ],
    tips: ['பழைய Stock-க்கு Size விவரம் Cutting-ல் உள்ள Size விகிதத்தில் மதிப்பிடப்படும். "—" என்றால் Size தெரியாது.']
  },
  {
    key: 'security', icon: '🔐', title: 'Security & Admin (Admin மட்டும்)',
    steps: [
      'புதிய பயனர்: பெயர், Mobile, Password, Role (Admin / Office / Salesman / Customer) தேர்ந்து சேர்க்கவும்.',
      'Role-க்கு ஏற்ப எந்த Menu தெரிய வேண்டும் என்பது தானாக அமையும்.',
      'Password மறந்தால்: அந்த நபரின் வரியில் Edit → புதிய Password போட்டுச் சேமிக்கவும். (பழைய Password-ஐப் பார்க்க முடியாது.)'
    ]
  },
  {
    key: 'yearclosing', icon: '📁', title: 'Year Closing & Backup',
    steps: [
      'வாரம் ஒருமுறை "Year Closing & Backup" திறந்து Backup (JSON) எடுத்துப் பாதுகாப்பான இடத்தில் வையுங்கள்.',
      'ஆண்டு முடிவில் இதை எடுத்து வைத்துவிட்டு, புதிய ஆண்டுக்கு Opening Stock சரிபார்க்கவும்.'
    ]
  },
  {
    key: 'trading', icon: '📦', title: 'Busy Stock & Sales Upload (12 கடைகள்)',
    steps: [
      '"📦 Busy Stock & Sales" → ⬆️ Upload: Busy-ல் இருந்து BCN-wise Stock Status (xlsx) மற்றும் Sales Analysis (xlsx) கோப்புகளை ஒரே நேரத்தில் பல கோப்புகளாகவும் தேர்வு செய்யலாம்.',
      'கடை பெயர், தேதி கோப்பின் மேல் வரிகளிலிருந்து தானாக எடுக்கப்படும். சரிபார்த்து (புதியது / மாறியது / நீக்கப்பட்டது) பின் Save செய்யவும்.',
      'Stock = அந்தத் தேதிக்கான முழு Snapshot (மீண்டும் போட்டால் பழையதை மாற்றும்). Sales = தேதி வாரி மாற்றம் (அதே தேதியை மீண்டும் போட்டால் இரட்டிப்பாகாது).',
      'தினசரி, வாரம், மாதம் என எந்த வரம்பிலும் Upload செய்யலாம். தவறு இருந்தால் (Total பொருந்தவில்லை, எதிர்கால தேதி) Save ஆகாது.',
      '📅 Upload நிலை: எந்தக் கடைக்கு எந்தத் தேதி Upload ஆகவில்லை என்று காட்டும்; பாக்கி தேதிகளை WhatsApp-ல் அனுப்பலாம்.',
      '📦 Stock Report: கடை வாரி / Item → Size → Colour வாரி Stock, Cost (Busy Sales Price), MRP, Margin. 🧾 Sales Report: கடை / Size / Item / நாள் வாரி.'
    ],
    tips: ['Busy "Sales Price" தான் Cost ஆகக் கணக்கிடப்படும்.', 'Stock கோப்பிற்கு பிறகான Sales தானாக கழிக்கப்பட்டு தற்போதைய Stock காட்டும்.']
  },
  {
    key: 'costing', icon: '📋', title: 'Cost Sheet & Stock Value (Cloth → Ready Goods)',
    steps: [
      '"Costing & Rate Fixer" → 📋 Cost Sheet: Model தேர்வு செய்து Consumption (Meter/Pc) மற்றும் Cloth Rate போடவும்.',
      'Cut to Pack வரிசையில் (Cutting, Assorting, Stitching, Overlock, Label, Button, Tag, Packing, Freight…) ஒவ்வொன்றுக்கும் ₹/Pc போடவும். ஒவ்வொரு வரியும் எந்த Stage-க்கு உரியது என்பதைத் தேர்வு செய்யலாம்.',
      'Cloth + Cut to Pack = Costing. சேமித்தால் Master Reports → 💰 Stock Value மற்றும் Production Stage Report-ல் Value தானாக வரும்.',
      'Value Stage வாரி கூடும்: Cloth → Cut Parts (Cloth + Cutting) → Stitching → QC → Packing → Ready Goods (Overhead சேர்த்து முழு Cost).',
      'Cost Sheet இல்லாத Model-க்கு Value இப்படி வரும்: (1) Production Stage-ல் உள்ள Batch → Cutting-ல் எடுத்த துணியின் தொகை (Meter × Rate); (2) Opening Stock (batch OPN-…) மட்டும் → Selling Price − 20%. புதிய Item-க்கு Cost Sheet போட்டால் போதும். "அடிப்படை" column-ல் எது பயன்பட்டது என்று தெரியும்.',
      'Cost Sheet சேமித்த உடனே அந்த Model-ன் Value தானாக Cost Sheet-க்கு மாறும்.',
      'Cost Sheet-ம் Selling Price-ம் இல்லாத Model வரி "⚠️" என்று காட்டும்; அது மொத்தத்தில் சேராது. Dashboard-லும் எச்சரிக்கை வரும்.'
    ],
    tips: ['Ready Goods MRP Value, Cutting-ல் போட்ட MRP-லிருந்து வரும்.', 'Cost Sheet Model பெயரில் சேமிக்கப்படுகிறது (Size வாரி மாறுபாடு இல்லை).']
  },
  {
    key: 'all', icon: '📊', title: 'Production Stage Report',
    steps: [
      'Production WIP → கீழே "Stage Report": தேர்வு செய்த Stage-ல் Model / Design / Colour வாரி Size-wise எண்ணிக்கை மற்றும் மொத்தம்.',
      'அதன் கீழ் எல்லா Stage-ன் Batch, Pcs, பழைய Batch நாள் ஒரே அட்டவணையில்.',
      'Opening Stock "… - XXL SIZE" என்றிருந்தால் அது Design அல்ல, Size ஆகக் கருதப்படும்.',
      'Print / PDF / WhatsApp / Excel பொத்தான்கள் மூலம் அறிக்கையை பகிரலாம்.'
    ]
  },
  {
    key: 'all', icon: '🆕', title: 'புதிய வசதிகள் (Opening Stock, Tailor, Catalog)',
    steps: [
      'Quick Opening: Stage-ல் QC Check, Packing சேர்ந்துள்ளது; Fabric / End Bit / Damage தவிர மற்றவற்றுக்கு Size Column உண்டு — "+ அடுத்த Size" மூலம் ஒவ்வொரு Size-க்கும் தனி வரி.',
      'Model தேர்வு செய்தால் அந்த Model-ன் Design மட்டுமே பட்டியலில் வரும்; முன்பு போட்ட பெயர்கள் தானாக பட்டியலில் வரும் (மீண்டும் Type செய்ய வேண்டாம்).',
      'Production WIP: Local Name-க்கு ✏️ பொத்தான் பயன்படுத்தவும் (Model Name மாறாது). Size ஒவ்வொன்றும் தனி வரி.',
      'Tailor Ledger: Date, Size, Total; 1st Work / 2nd Work தனி Rate; Salary tab (Tailor + Start/End Date, Received மட்டும், Advance/Deduction); Batch tab (Batch வாரி கூலி).',
      'Catalog: Grid / Slide / List பார்வை; Size வாரி Rate / MRP; Staff-க்கு Godown / Showroom / Local Name வாரி Size Stock; Customer-க்கு Stock Qty தெரியாது (In Stock / Out மட்டும்).',
      'Catalog Photo / Colour படத்தை தொட்டால் Zoom (+ / − / ◀ ▶). Staff-க்கு "🖼️ Photo Edit / Delete" பொத்தான் உண்டு.',
      'Size முடியப்போகும் Design: Godown-ல் ஒரு Size 2 Pcs-க்கும் குறைவு என்றால் Dashboard / எச்சரிக்கையில் வரும்.',
      'Catalog-ல் 🏷️ பொத்தான்: ஒவ்வொரு Size-க்கும் Barcode Label (Model-Design-Size). "Label/Size" கட்டத்தில் எத்தனை Copy என்று போடலாம்.',
      'Local Name-ஆல் தேடலாம்: Production WIP, Ready Stock, Catalog (Staff).',
      'Ready Stock (Godown): ஒவ்வொரு Size-க்கும் தனி வரி — Photo, Batch, Local Name, Design, Model, Material, Fit, Size, Colour, Price, MRP, Qty எல்லாம் நிரம்பி வரும். ✏️ Edit-ல் எல்லா விவரமும் (Local Name, Material, Fit, Size வாரி Qty / Rate / MRP, Photo) மாற்றலாம்; 🗑️ Delete அந்த Size-ஐ மட்டும் நீக்கும் (ஒரு Size மட்டும் நீக்க Admin வேண்டும்).',
      'Quick Opening: Selling Price அருகில் MRP உண்டு; "+ அடுத்த Size" அழுத்தினால் Rate/MRP தானே வரும். Size வாரி Rate/MRP Catalog அட்டவணையில் தெரியும்.',
      'Quick Opening Save செய்யும் முன் ஏற்கனவே அதே Model / Design / Colour Opening இருந்தால் எச்சரிக்கை வரும்.'
    ]
  },
  {
    key: 'trading', icon: '🏬', title: 'Showroom Stock (Busy + ERP) & Net Position',
    steps: [
      'Showroom Stock-ஐ Quick Opening-ல் உள்ளிட வேண்டாம். Busy-ல் இறக்கிய "BCN wise Stock Status" file-ஐ மாற்றாமல் "Busy Stock & Sales" → Upload-ல் போடுங்கள்.',
      'File-ன் மேலே கடை / தேதி இல்லாவிட்டால் (வெட்டிய file) கடை பெயரையும் தேதியையும் நீங்களே உள்ளிடலாம். 100-க்கு மேல் Qty, மைனஸ் Qty, MRP / Price இல்லாத வரிகள் மஞ்சள் எச்சரிக்கையாகக் காட்டப்படும்; எதுவும் மாற்றப்படாது.',
      '"🏬 Showroom Stock (Busy + ERP)" tab: கடை வாரி Busy Pcs + Cost, ERP Pcs + Cost, மொத்தம், MRP மதிப்பு. ERP Transfer, Busy "As On" தேதிக்குப் பிறகு மட்டும் சேரும். முதலில் "Busy கடை ↔ ERP Showroom" இணைப்பைச் சரிபார்க்கவும்.',
      'Busy Cost = Sales Price −20%; Sales Price இல்லையெனில் MRP × 50%. "அடிப்படை" column-ல் தெரியும்.',
      'Busy-ல் இன்னும் ஏறாத பழைய Transfer இருந்தால் கடை விவரத்தின் கீழ் "Busy-ல் இல்லை → கூட்டவும்" என்று குறிக்கவும்.',
      'Ready Stock → "⬇️ Busy Format Excel": ERP Godown Stock-ஐ Busy Report வரிசையில் Download செய்யலாம் (BCN காலி).',
      '💰 Net Position (Admin மட்டும்): Stock மதிப்பு தானாக; S.D, S.C, Fixed Assets, Loans, Bank, Cash, மற்ற சொத்து / கடன்களை உள்ளிட்டால் Net Worth உடனே தெரியும். "Save" செய்யாமல் மாற்றி முயற்சிக்கலாம்; தேதிக்கு Snapshot சேமித்தால் மாற்றத்தை ஒப்பிடலாம்.'
    ]
  },
  {
    key: 'all', icon: '⚠️', title: 'பொதுவான தவறுகள் (தவிர்க்க)',
    steps: [
      'ஒரே Stock-ஐ இரண்டு முறை பதிவு செய்வது (குறிப்பாக Opening Stock).',
      'Showroom விற்பனையை Sale என்று பதிவு செய்யாமல் விடுவது.',
      'Design / Color-ஐப் பட்டியலில் தேடாமல் புதிதாகத் தட்டச்சு செய்வது (பெயர் வேறுபடும்).',
      'Save அழுத்திய பிறகு பச்சைச் செய்தி வரும் வரை பக்கத்தை மூடுவது.',
      'எண் தவறாகப் போட்டுவிட்டால் எச்சரிக்கை வரும்; கவனமாகப் படித்துவிட்டுத் தொடருங்கள்.'
    ]
  }
];

export default function HelpModule({ allowed }: { allowed: string[] }) {
  const [open, setOpen] = useState<number | null>(0);
  const visible = SECTIONS.filter(s => s.key === 'all' || allowed.includes(s.key));

  const printGuide = () => {
    const esc = (t: string) => t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
    const body = visible.map(s => `<h3>${s.icon} ${esc(s.title)}</h3><ol>${s.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>${s.tips ? `<ul>${s.tips.map(x => `<li><i>${esc(x)}</i></li>`).join('')}</ul>` : ''}`).join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><meta charset="utf-8"><title>Pommys ERP – பயன்பாட்டு வழிகாட்டி</title><style>body{font-family:sans-serif;margin:20px;line-height:1.55} h2{margin:0 0 8px} h3{margin:18px 0 4px;border-bottom:1px solid #ccc;padding-bottom:3px;page-break-after:avoid} li{margin:3px 0}</style></head><body><h2>Pommys Garment ERP – பயன்பாட்டு வழிகாட்டி</h2>${body}<script>window.onload=function(){setTimeout(function(){window.print()},500)}<\/script></body></html>`);
    w.document.close();
  };

  return (
    <div style={styles.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div>
          <h4 style={{ margin: 0, color: '#0f172a' }}>📖 பயன்பாட்டு வழிகாட்டி (படிப்படியாக)</h4>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>தலைப்பை அழுத்தினால் படிகள் திறக்கும். உங்களுக்கு அனுமதி உள்ள பகுதிகள் மட்டும் தெரியும்.</div>
        </div>
        <button type="button" onClick={printGuide} style={styles.secondaryBtn}>🖨️ Print / PDF</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {visible.map((s, i) => (
          <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', background: open === i ? '#f8fafc' : 'white' }}>
            <div onClick={() => setOpen(open === i ? null : i)} style={{ padding: '12px 14px', cursor: 'pointer', fontWeight: 'bold', color: '#0f172a', display: 'flex', justifyContent: 'space-between' }}>
              <span>{s.icon} {s.title}</span><span style={{ color: '#64748b' }}>{open === i ? '▲' : '▼'}</span>
            </div>
            {open === i && (
              <div style={{ padding: '0 14px 14px 14px' }}>
                <ol style={{ margin: '0 0 0 18px', padding: 0, lineHeight: 1.7, fontSize: '14px', color: '#1e293b' }}>
                  {s.steps.map((x, j) => <li key={j}>{x}</li>)}
                </ol>
                {s.tips && (
                  <div style={{ marginTop: '10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '8px 10px', fontSize: '13px', color: '#92400e' }}>
                    {s.tips.map((x, j) => <div key={j}>💡 {x}</div>)}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
