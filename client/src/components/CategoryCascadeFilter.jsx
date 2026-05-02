/**
 * Nested category picks: each level adds a select to the right until a leaf is chosen.
 * `value` is the path sent to the API (prefix match includes all DRs/VRs under that branch).
 *
 * Empty / "All" uses a sentinel so controlled `<select>` always matches an `<option>` (avoids
 * browsers/React failing to apply `value=""` when clearing).
 */
/** Must not match any allowed category path from config. */
const CLEAR_VALUE = '__HB_FILTER_CLEAR__';

export default function CategoryCascadeFilter({
  roots,
  value,
  onChange,
  showHeaderLabel = true,
  /** First-level empty option label (filters default to “All”). Ignored when `hideRootClear`. */
  rootClearLabel = 'All',
  /** When true, root select has no “empty” choice (e.g. VR create — category always required). */
  hideRootClear = false,
}) {
  const raw = String(value ?? '').trim();
  const segments = raw
    ? raw
        .split(' / ')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  if (hideRootClear && (!Array.isArray(roots) || roots.length === 0)) return null;

  const selects = [];
  let depth = 0;
  let options = roots;

  while (depth < 64) {
    /** Capture loop index per iteration — `depth` is mutated below; handlers must not close over it. */
    const levelDepth = depth;

    const selectedPathForLevel =
      segments.length > depth ? segments.slice(0, depth + 1).join(' / ') : '';

    let emptyMarker =
      selectedPathForLevel === '' ? CLEAR_VALUE : selectedPathForLevel;
    if (hideRootClear && levelDepth === 0 && selectedPathForLevel === '' && options[0]) {
      emptyMarker = options[0].path;
    }

    const showClearOption = !(hideRootClear && levelDepth === 0);

    selects.push(
      <select
        key={`cat-${levelDepth}-${emptyMarker}`}
        className="field-input"
        aria-label={levelDepth === 0 ? 'Category' : `Subcategory ${levelDepth}`}
        style={{ minWidth: levelDepth === 0 ? '160px' : '140px' }}
        value={emptyMarker}
        onChange={(e) => {
          const picked = e.currentTarget.value;
          if (picked === CLEAR_VALUE) {
            const next = segments.slice(0, levelDepth).join(' / ') || '';
            onChange(next);
          } else {
            onChange(picked);
          }
        }}
      >
        {showClearOption ? (
          <option value={CLEAR_VALUE}>
            {levelDepth === 0 ? rootClearLabel : 'Any (this level)'}
          </option>
        ) : null}
        {options.map((n) => (
          <option key={n.path} value={n.path}>
            {n.label}
          </option>
        ))}
      </select>
    );

    const chosen =
      segments.length > depth
        ? options.find((n) => n.path === segments.slice(0, depth + 1).join(' / '))
        : null;

    if (!chosen?.children?.length) break;
    options = chosen.children;
    depth += 1;
  }

  if (!selects.length) return null;

  const rowStyle = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    alignItems: 'flex-start',
    minWidth: 0,
  };

  /* With showHeaderLabel=false, parent supplies the label (same pattern as other filter fields). */
  if (!showHeaderLabel) {
    return (
      <div key={raw || '_category-filter-none'} style={rowStyle}>
        {selects}
      </div>
    );
  }

  return (
    <div
      key={raw || '_category-filter-none'}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}
    >
      <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Category</div>
      <div style={rowStyle}>{selects}</div>
    </div>
  );
}
