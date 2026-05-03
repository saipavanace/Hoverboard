export function findMatchStarts(haystack, needle, caseSensitive) {
  if (!needle) return [];
  const h = caseSensitive ? haystack : haystack.toLowerCase();
  const n = caseSensitive ? needle : needle.toLowerCase();
  const out = [];
  let i = 0;
  while (i <= h.length - n.length) {
    const j = h.indexOf(n, i);
    if (j === -1) break;
    out.push(j);
    i = j + 1;
  }
  return out;
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** HTML mirror for find highlights while the search field keeps focus. */
export function buildJsonFindMirrorHtml(jsonStr, matchStart, matchLen, markClass = 'json-text-search-mark') {
  if (matchStart < 0 || matchLen <= 0 || matchStart + matchLen > jsonStr.length) {
    return escapeHtml(jsonStr);
  }
  return (
    escapeHtml(jsonStr.slice(0, matchStart)) +
    `<mark class="${markClass}">` +
    escapeHtml(jsonStr.slice(matchStart, matchStart + matchLen)) +
    '</mark>' +
    escapeHtml(jsonStr.slice(matchStart + matchLen))
  );
}

export function scrollTextareaToCharIndex(textarea, charIndex) {
  const val = textarea.value;
  const idx = Math.max(0, Math.min(charIndex, val.length));
  const before = val.slice(0, idx);
  const lineNumber = before.split('\n').length - 1;
  const style = window.getComputedStyle(textarea);
  let lineHeightPx = 18;
  const lh = style.lineHeight;
  if (lh && lh !== 'normal') {
    const n = parseFloat(lh);
    if (!Number.isNaN(n)) lineHeightPx = n;
  } else {
    lineHeightPx = Math.round((parseFloat(style.fontSize) || 13) * 1.35);
  }
  const padTop = parseFloat(style.paddingTop) || 0;
  const lineTop = lineNumber * lineHeightPx + padTop;
  const viewH = textarea.clientHeight;
  textarea.scrollTop = Math.max(0, lineTop - viewH * 0.35);
}

export function focusSelectAndScroll(textarea, start, needleLen, options = {}) {
  const { focusEditor = true, onAfterScroll } = options;
  const end = start + needleLen;
  if (focusEditor) textarea.focus({ preventScroll: true });
  textarea.setSelectionRange(start, end);
  scrollTextareaToCharIndex(textarea, start);
  onAfterScroll?.();
  requestAnimationFrame(() => {
    textarea.setSelectionRange(start, end);
    scrollTextareaToCharIndex(textarea, start);
    if (focusEditor) textarea.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    onAfterScroll?.();
  });
}
