/** Displays API-reported Hoverboard release (ISO-friendly instance identifier). */
export default function ToolVersionBadge({ toolVersion, toolVersionMeta, variant = 'header' }) {
  if (!toolVersion) return null;
  const phase = toolVersionMeta?.phase;
  const title = phase ? `Hoverboard ${toolVersion} (${phase})` : `Hoverboard ${toolVersion}`;
  const small = variant === 'footer' || variant === 'login';
  return (
    <span
      style={{
        fontSize: small ? '0.68rem' : '0.72rem',
        color: 'var(--muted)',
        fontFamily: 'var(--mono, ui-monospace, monospace)',
        letterSpacing: '0.03em',
      }}
      title={title}
    >
      v{toolVersion}
    </span>
  );
}
