/**
 * Config shape (see docs/configuration.md):
 * - Legacy: string[] of allowed category values
 * - Nested: array of string | { name: string, children?: (string | CategoryNode)[] }
 * Stored values in DB are full paths: "Parent / Child" (space slash space).
 */
export function validateRequirementCategory(category, cfg) {
  const allowed = flattenAllowedCategoryValues(cfg.requirementCategories || []);
  if (!category || typeof category !== 'string') return 'category is required';
  const t = category.trim();
  if (!allowed.length) return null;
  if (!allowed.includes(t)) return `category must be one of: ${allowed.join(', ')}`;
  return null;
}

export function flattenAllowedCategoryValues(nodes, prefix = '') {
  if (!Array.isArray(nodes)) return [];
  const out = [];
  for (const node of nodes) {
    if (typeof node === 'string') {
      const v = node.trim();
      if (v) out.push(prefix ? `${prefix} / ${v}` : v);
    } else if (node && typeof node === 'object') {
      const name = String(node.name ?? '').trim();
      if (!name) continue;
      const path = prefix ? `${prefix} / ${name}` : name;
      const ch = node.children;
      if (!Array.isArray(ch) || ch.length === 0) {
        out.push(path);
      } else {
        for (const c of ch) {
          if (typeof c === 'string') {
            const v = c.trim();
            if (v) out.push(`${path} / ${v}`);
          } else if (c && typeof c === 'object' && String(c.name ?? '').trim()) {
            out.push(...flattenAllowedCategoryValues([c], path));
          }
        }
      }
    }
  }
  return [...new Set(out)];
}

/** SQL fragment for GET list filters: rows in this branch (exact path or descendants). */
export function sqlCategoryBranchClause(columnSql, prefix) {
  const p = String(prefix || '').trim();
  if (!p) return { clause: '', params: [] };
  return {
    clause: ` AND (${columnSql} = ? OR ${columnSql} LIKE ?)`,
    params: [p, `${p} / %`],
  };
}
