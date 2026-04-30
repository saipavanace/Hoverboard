import { diffLines } from 'diff';

export function buildChangeSummary(oldText, newText) {
  const oldStr = oldText || '';
  const newStr = newText || '';
  const parts = diffLines(oldStr, newStr);
  const additions = [];
  const removals = [];
  let lineOld = 1;
  let lineNew = 1;
  for (const part of parts) {
    const lines = part.value.split('\n');
    if (part.removed) {
      removals.push(...lines.filter(Boolean).slice(0, 500));
      lineOld += lines.length;
    } else if (part.added) {
      additions.push(...lines.filter(Boolean).slice(0, 500));
      lineNew += lines.length;
    } else {
      lineOld += lines.length;
      lineNew += lines.length;
    }
  }
  return {
    summary: `${removals.length} removed line(s), ${additions.length} added line(s) (approx.)`,
    additions: additions.slice(0, 50),
    removals: removals.slice(0, 50),
    stats: {
      addedLines: additions.length,
      removedLines: removals.length,
    },
  };
}
