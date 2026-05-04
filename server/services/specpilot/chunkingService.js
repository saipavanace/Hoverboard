/**
 * Section-aware chunking: prefers headings and numbered sections; splits long sections with overlap.
 */

const MAX_TOKENS = 1100;
const MIN_TOKENS = 500;
const OVERLAP_TOKENS = 125;
const CHARS_PER_TOKEN = 4;

export function estimateTokens(s) {
  if (!s) return 0;
  return Math.max(1, Math.ceil(s.length / CHARS_PER_TOKEN));
}

function isHeadingLine(line) {
  const t = line.trim();
  if (!t) return false;
  if (/^#{1,6}\s+\S/.test(t)) return true;
  if (/^(chapter|section|appendix)\b/i.test(t)) return true;
  if (/^\d+(?:\.\d+)*\s+\S/.test(t) && t.length < 200) return true;
  if (/^[A-Z][A-Z0-9 _\-–—]{3,100}$/.test(t) && !t.includes('.') && t.split(/\s+/).length <= 12) return true;
  return false;
}

/**
 * If text looks like a markdown table, mark it.
 */
export function detectTableBlock(lines) {
  const joined = lines.join('\n').trim();
  if (!joined.includes('|')) return false;
  const pipeLines = lines.filter((l) => l.includes('|'));
  return pipeLines.length >= 2;
}

/**
 * Build hierarchical section path from heading stack.
 */
export function formatSectionPath(stack) {
  return stack.filter(Boolean).join(' > ');
}

/**
 * Split long text into overlapping windows (by character size derived from token targets).
 */
export function splitWithOverlap(text, maxTokens = MAX_TOKENS, overlapTokens = OVERLAP_TOKENS) {
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  const overlapChars = overlapTokens * CHARS_PER_TOKEN;
  if (text.length <= maxChars) return [text];
  const parts = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + maxChars);
    parts.push(text.slice(start, end));
    if (end >= text.length) break;
    start = Math.max(end - overlapChars, start + 1);
  }
  return parts;
}

/**
 * Parse plain text into sections; returns array of { sectionPath, heading, text, isTable, pageStart, pageEnd }.
 * @param {string} fullText
 * @param {{ totalPages?: number }} [opts]
 */
export function parseIntoSections(fullText, opts = {}) {
  const totalPages = opts.totalPages || null;
  const lines = String(fullText || '').split('\n');
  /** @type {{ sectionPath: string, heading: string, text: string, isTable: boolean, lineStart: number, lineEnd: number }[]} */
  const sections = [];
  let headingStack = [];
  let currentLines = [];
  let currentHeading = 'Preamble';
  let lineStart = 0;

  const flush = (endLine) => {
    if (!currentLines.length) return;
    const block = currentLines.join('\n').trim();
    if (!block) {
      currentLines = [];
      return;
    }
    const isTable = detectTableBlock(currentLines);
    const path = formatSectionPath(headingStack.length ? headingStack : [currentHeading]);
    sections.push({
      sectionPath: path,
      heading: currentHeading,
      text: block,
      isTable,
      lineStart,
      lineEnd: endLine,
    });
    currentLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isHeadingLine(line)) {
      flush(i - 1);
      const h = line.replace(/^#{1,6}\s+/, '').trim();
      // Pop stack for shallow numbered headings e.g. "2." after "1.1"
      const num = /^(\d+(?:\.\d+)*)\s/.exec(h);
      if (num) {
        const depth = num[1].split('.').length;
        headingStack = headingStack.slice(0, Math.max(0, depth - 1));
        headingStack.push(h.slice(0, 120));
      } else {
        headingStack = [h.slice(0, 120)];
      }
      currentHeading = h.slice(0, 200);
      lineStart = i;
    }
    currentLines.push(line);
  }
  flush(lines.length - 1);

  if (!sections.length && fullText.trim()) {
    sections.push({
      sectionPath: 'Document',
      heading: 'Document',
      text: fullText.trim(),
      isTable: false,
      lineStart: 0,
      lineEnd: lines.length - 1,
    });
  }

  // Approximate page numbers from line position
  const totalLines = Math.max(1, lines.length);
  return sections.map((s) => {
    let pageStart = null;
    let pageEnd = null;
    if (totalPages && totalPages > 0) {
      const r0 = s.lineStart / totalLines;
      const r1 = s.lineEnd / totalLines;
      pageStart = Math.max(1, Math.min(totalPages, Math.floor(r0 * totalPages) + 1));
      pageEnd = Math.max(1, Math.min(totalPages, Math.floor(r1 * totalPages) + 1));
    }
    return { ...s, pageStart, pageEnd };
  });
}

/**
 * Chunk sections into DB-ready rows (no ids — caller assigns).
 * @param {string} documentTitle
 * @param {ReturnType<typeof parseIntoSections>} sections
 */
export function chunkSections(documentTitle, sections) {
  const out = [];
  let chunkIndex = 0;
  for (const sec of sections) {
    const pieces = splitWithOverlap(sec.text, MAX_TOKENS, OVERLAP_TOKENS);
    for (const piece of pieces) {
      const tok = estimateTokens(piece);
      if (tok < MIN_TOKENS / 2 && pieces.length > 1 && piece.length < 80) continue;
      out.push({
        chunk_index: chunkIndex++,
        section_path: sec.sectionPath || documentTitle,
        heading: sec.heading,
        text: piece,
        page_start: sec.pageStart,
        page_end: sec.pageEnd ?? sec.pageStart,
        token_count: tok,
        is_table: sec.isTable ? 1 : 0,
        metadata_json: null,
      });
    }
  }
  return out;
}
