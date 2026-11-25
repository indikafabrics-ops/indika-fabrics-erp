/** Bill photo / PDF  ->  text  ->  fields. Everything is best-effort; doubtful fields are highlighted for the user. */

async function ocrImage(source: any): Promise<string> {
  const Tesseract: any = await import('tesseract.js');
  const result = await Tesseract.recognize(source, 'eng');
  return String(result?.data?.text || '').trim();
}

export async function extractTextFromBillFile(file: File): Promise<string> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (!isPdf) {
    try {
      return await ocrImage(file);
    } catch {
      return '';
    }
  }

  try {
    const pdfjsLib: any = await import('pdfjs-dist');
    // pdf.js needs its worker file – without this line PDF reading always fails
    try {
      const workerMod: any = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerMod.default;
    } catch {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let p = 1; p <= Math.min(pdf.numPages, 3); p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      fullText += (content.items || []).map((it: any) => it.str || '').join(' ') + '\n';
    }
    fullText = fullText.trim();
    if (fullText.length >= 30) return fullText;

    // scanned PDF (no text layer): draw page 1 and OCR it
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    return await ocrImage(canvas);
  } catch {
    return '';
  }
}

export interface ParsedBill {
  billNo: string;
  billDate: string;
  gstList: string[];
  itemDetails: string;
  designNo: string;
  itemRate: string;
  totalMeter: string;
  totalPieces: string;
  doubtFields: Record<string, boolean>;
}

export function parseBillTextToFields(rawText: string): ParsedBill {
  // Bill number: first token after Invoice/Bill/Challan that really contains a digit
  let extractedBillNo = '';
  const billRe = /(?:invoice|inv|bill|challan|dc)\s*(?:no\.?|number|#)?\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9\-/]*)/gi;
  let bm: RegExpExecArray | null;
  while ((bm = billRe.exec(rawText)) !== null) {
    const token = bm[1];
    if (/\d/.test(token) && token.length >= 2) {
      extractedBillNo = token;
      break;
    }
  }

  let extractedBillDate = '';
  const isoMatch = rawText.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/);
  const dmyMatch = rawText.match(/\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2}|\d{2})\b/);
  if (isoMatch) {
    extractedBillDate = `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  } else if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3].length === 2 ? `20${dmyMatch[3]}` : dmyMatch[3];
    extractedBillDate = `${year}-${month}-${day}`;
  }

  const gstList = Array.from(
    new Set((rawText.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/gi) || []).map(g => g.toUpperCase()))
  );

  const mtrMatch = rawText.match(/(\d+(?:\.\d+)?)\s*(?:mtr|mtrs|meter|meters|m\b)/i);
  const pcsMatch = rawText.match(/(\d+(?:\.\d+)?)\s*(?:pcs|pc|piece|pieces)/i);
  const extractedMeter = mtrMatch ? mtrMatch[1] : '';
  const extractedPieces = pcsMatch ? pcsMatch[1] : '';

  const rateMatch = rawText.match(/(?:rate|rt|price)\s*[:\-@]?\s*(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)/i);
  const extractedRate = rateMatch ? rateMatch[1] : '';

  const designMatch = rawText.match(/(?:design|dsn|style)\s*(?:no\.?|#)?\s*[:\-]?\s*([A-Za-z0-9\-]*\d[A-Za-z0-9\-]*)/i);
  const extractedDesign = designMatch ? designMatch[1] : '';

  return {
    billNo: extractedBillNo,
    billDate: extractedBillDate,
    gstList,
    itemDetails: extractedDesign ? `Design ${extractedDesign}` : '',
    designNo: extractedDesign,
    itemRate: extractedRate,
    totalMeter: extractedMeter,
    totalPieces: extractedPieces,
    doubtFields: {
      supplierName: true,
      billNo: !extractedBillNo,
      billDate: !extractedBillDate,
      itemDetails: true,
      designNo: !extractedDesign,
      itemRate: !extractedRate,
      totalMeter: !extractedMeter && !extractedPieces
    }
  };
}
