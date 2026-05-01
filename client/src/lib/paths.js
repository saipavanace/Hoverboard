/** Build project-scoped SPA paths: `/projects/:id/...` */
export function projectBase(projectId) {
  return `/projects/${projectId}`;
}

export function projectPath(projectId, segment) {
  const base = projectBase(projectId);
  if (segment == null || segment === '') return base;
  const s = String(segment).replace(/^\/+/, '');
  return `${base}/${s}`;
}
