import mammoth from 'mammoth';
import fs from 'fs';

/** Lazy-load pdf-parse (some builds need buffer) */
export async function extractText(filePath, mimeType, originalName = '') {
  const lower = (originalName || '').toLowerCase();
  if (
    mimeType === 'application/pdf' ||
    lower.endsWith('.pdf')
  ) {
    const pdfParse = (await import('pdf-parse')).default;
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return (data.text || '').replace(/\s+/g, ' ').trim();
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lower.endsWith('.docx')
  ) {
    const buf = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer: buf });
    return (result.value || '').replace(/\s+/g, ' ').trim();
  }
  throw new Error(`Unsupported document type: ${mimeType || originalName}`);
}

export function normalizeForMatch(s) {
  return (s || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
