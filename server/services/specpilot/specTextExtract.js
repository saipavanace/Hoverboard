import fs from 'fs';
import mammoth from 'mammoth';

/**
 * Extract spec text with newlines preserved (for section chunking).
 * @param {string} filePath
 * @param {string} fileType - lowercased ext or mime hint
 * @param {string} [originalName]
 */
export async function extractSpecText(filePath, fileType, originalName = '') {
  const lower = (originalName || '').toLowerCase();
  const ext = (fileType || '').toLowerCase().replace(/^\./, '');

  if (ext === 'txt' || ext === 'md' || ext === 'markdown' || lower.endsWith('.txt') || lower.endsWith('.md')) {
    return fs.readFileSync(filePath, 'utf8');
  }

  if (ext === 'pdf' || lower.endsWith('.pdf')) {
    const pdfParse = (await import('pdf-parse')).default;
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    let text = (data.text || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
    // Keep paragraph breaks; trim spaces within lines
    return text
      .split('\n')
      .map((l) => l.replace(/[ \t]+/g, ' ').trim())
      .join('\n');
  }

  if (ext === 'docx' || lower.endsWith('.docx')) {
    const buf = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer: buf });
    return (result.value || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
  }

  throw new Error(`Unsupported spec document type: ${ext || originalName}`);
}

/**
 * Best-effort page number from PDF parse (1-based) when numpages is available.
 * @param {string} filePath
 */
export async function extractPdfWithPageEstimates(filePath) {
  const pdfParse = (await import('pdf-parse')).default;
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdfParse(dataBuffer);
  const numpages = data.numpages || 1;
  const text = (data.text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  return { text, numpages };
}
