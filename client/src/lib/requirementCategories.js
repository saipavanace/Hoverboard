/** Mirrors server/services/requirementCategories.js for offline / older APIs. */
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

/** Prefer server-computed list; otherwise derive from tree or legacy string[]. */
export function categoryOptionsFromConfig(cfg) {
  if (!cfg) return [];
  const pre = cfg.requirementCategoryValues;
  if (Array.isArray(pre) && pre.length) return pre;
  return flattenAllowedCategoryValues(cfg.requirementCategories || []);
}

/** `{ label, path, children }[]` for cascading filters (same shape as server tree). */
export function buildCategoryTree(nodes, prefix = '') {
  if (!Array.isArray(nodes)) return [];
  const out = [];
  for (const node of nodes) {
    if (typeof node === 'string') {
      const label = node.trim();
      if (!label) continue;
      const path = prefix ? `${prefix} / ${label}` : label;
      out.push({ label, path, children: [] });
    } else if (node && typeof node === 'object') {
      const name = String(node.name ?? '').trim();
      if (!name) continue;
      const path = prefix ? `${prefix} / ${name}` : name;
      const ch = node.children;
      let children = [];
      if (Array.isArray(ch) && ch.length > 0) {
        children = buildCategoryTree(ch, path);
      }
      out.push({ label: name, path, children });
    }
  }
  return out;
}
