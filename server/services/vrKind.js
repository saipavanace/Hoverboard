/** Verification requirement kinds stored in `vrs.vr_kind` (same table as legacy VR). */
export const VR_KINDS = ['VR', 'SR', 'CR', 'AR'];

export function normalizeVrKind(raw) {
  if (raw === undefined || raw === null) return null;
  const k = String(raw).trim().toUpperCase();
  if (!k) return null;
  return VR_KINDS.includes(k) ? k : null;
}

/** Maps vr_kind to `nextPublicId(prefix, counterKey)`. */
export function kindToIdParts(kind) {
  switch (kind) {
    case 'SR':
      return { prefix: 'SR', counterKey: 'sr' };
    case 'CR':
      return { prefix: 'CR', counterKey: 'cr' };
    case 'AR':
      return { prefix: 'AR', counterKey: 'ar' };
    default:
      return { prefix: 'VR', counterKey: 'vr' };
  }
}
