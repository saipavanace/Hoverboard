import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import JsonTextSearchField from '../components/JsonTextSearchField.jsx';
import { useProject } from '../context/ProjectContext.jsx';

export default function Admin() {
  const { user, loading, isAdmin, isSystemAdmin } = useAuth();
  const { projectId } = useProject();
  const canManageUsers = Boolean(user?.authDisabled || isSystemAdmin);
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [audit, setAudit] = useState([]);
  const [baselines, setBaselines] = useState([]);
  const [rules, setRules] = useState([]);
  const [authOverview, setAuthOverview] = useState(null);
  const [syncedGroups, setSyncedGroups] = useState([]);
  const [tab, setTab] = useState('users');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [teamForm, setTeamForm] = useState({ name: '', parent_team_id: '', department: '' });
  const [createUser, setCreateUser] = useState({
    email: '',
    username: '',
    display_name: '',
    password: '',
    global_roles: '',
    project_role: 'engineer',
    assignProject: true,
  });
  const [appCfg, setAppCfg] = useState(null);
  const [snapshotText, setSnapshotText] = useState('');
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [snapshotMeta, setSnapshotMeta] = useState('');

  useEffect(() => {
    api.config().then(setAppCfg).catch(() => setAppCfg({}));
  }, []);

  useEffect(() => {
    if (!canManageUsers && (tab === 'users' || tab === 'auth' || tab === 'audit')) {
      setTab('teams');
    }
  }, [canManageUsers, tab]);

  useEffect(() => {
    if (loading || !user) return;
    if (!user.authDisabled && !isAdmin) return;
    setError('');
    if (tab === 'users' && canManageUsers) {
      api
        .adminUsers()
        .then(setUsers)
        .catch((e) => setError(e.message));
    }
    if (tab === 'audit' && canManageUsers) {
      api
        .adminAudit(200)
        .then(setAudit)
        .catch((e) => setError(e.message));
    }
    if (tab === 'baselines') {
      api
        .adminBaselines()
        .then(setBaselines)
        .catch((e) => setError(e.message));
    }
    if (tab === 'signoff') {
      api
        .adminSignoffRules()
        .then(setRules)
        .catch((e) => setError(e.message));
    }
    if (tab === 'auth' && canManageUsers) {
      api
        .adminAuthOverview()
        .then(setAuthOverview)
        .catch((e) => setError(e.message));
      api
        .adminSyncedGroups()
        .then(setSyncedGroups)
        .catch((e) => setError(e.message));
    }
    if (tab === 'teams') {
      if (projectId) {
        api
          .teams(projectId)
          .then(setTeams)
          .catch((e) => setError(e.message));
      } else {
        setTeams([]);
      }
      if (canManageUsers) {
        api
          .adminUsers()
          .then(setUsers)
          .catch((e) => setError(e.message));
      }
    }
  }, [tab, user, isAdmin, loading, projectId, canManageUsers]);

  useEffect(() => {
    if (tab !== 'snapshot' || loading || !user) return;
    if (!user.authDisabled && !isSystemAdmin) return;
    setSnapshotBusy(true);
    setError('');
    api
      .adminFullSnapshot()
      .then((data) => {
        setSnapshotText(JSON.stringify(data, null, 2));
        setSnapshotMeta(data?.meta?.generatedAt ? String(data.meta.generatedAt) : '');
      })
      .catch((e) => setError(e.message))
      .finally(() => setSnapshotBusy(false));
  }, [tab, isSystemAdmin, user, loading]);

  useEffect(() => {
    if (!projectId || loading || !user || (!user.authDisabled && !isAdmin)) return;
    api
      .teams(projectId)
      .then(setTeams)
      .catch(() => setTeams([]));
  }, [projectId, loading, user, isAdmin]);

  async function patchUser(id, body) {
    setMsg('');
    setError('');
    try {
      await api.adminPatchUser(id, body);
      setMsg('Saved.');
      setUsers(await api.adminUsers());
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) {
    return (
      <>
        <h1 className="page-title">Administration</h1>
        <p className="page-lede">Loading…</p>
      </>
    );
  }

  if (!user?.authDisabled && !isAdmin) {
    return (
      <>
        <h1 className="page-title">Admin</h1>
        <p className="page-lede">You need administrator access to view this page.</p>
      </>
    );
  }

  const teamById = Object.fromEntries(teams.map((t) => [t.id, t]));
  const builtinAdminEmail = String(appCfg?.authUi?.builtinAdminEmail || '')
    .trim()
    .toLowerCase();

  return (
    <>
      <h1 className="page-title">Administration</h1>
      <p className="page-lede">
        {canManageUsers
          ? 'Users, teams, platform audit trail, baselines, and sign-off policies.'
          : 'Teams, baselines, and sign-off policies.'}{' '}
        Pick a project in the header to scope teams and hierarchy fields.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {[
          ...(canManageUsers
            ? ['users', 'auth', 'teams', 'audit', 'baselines', 'signoff']
            : ['teams', 'baselines', 'signoff']),
          ...(user?.authDisabled || isSystemAdmin ? ['snapshot'] : []),
        ].map((t) => (
          <button
            key={t}
            type="button"
            className={tab === t ? 'btn-primary' : ''}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: tab === t ? undefined : 'transparent',
              color: 'inherit',
              cursor: 'pointer',
            }}
            onClick={() => setTab(t)}
          >
            {t === 'snapshot' ? 'Data mirror' : t}
          </button>
        ))}
      </div>

      {error && (
        <p style={{ color: '#f87171' }} role="alert">
          {error}
        </p>
      )}
      {msg && (
        <p style={{ color: 'var(--muted)' }} role="status">
          {msg}
        </p>
      )}

      {tab === 'users' && canManageUsers && (
        <>
          <div className="card" style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.65rem' }}>Add local user</div>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
              Creates a password-capable account (local provider). For SSO, users typically appear after first sign-in; use
              this for service accounts, labs, or before IdP sync. Users sign in with <strong>email or username</strong>{' '}
              plus password. Global roles are comma-separated (e.g. <code>auditor</code>); use sparingly.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '0.65rem',
                alignItems: 'end',
              }}
            >
              <label>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Email</div>
                <input
                  className="field-input"
                  type="email"
                  value={createUser.email}
                  onChange={(e) => setCreateUser({ ...createUser, email: e.target.value })}
                  autoComplete="off"
                />
              </label>
              <label>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Username</div>
                <input
                  className="field-input"
                  type="text"
                  autoComplete="off"
                  value={createUser.username}
                  onChange={(e) => setCreateUser({ ...createUser, username: e.target.value })}
                  placeholder="e.g. jdoe"
                />
              </label>
              <label>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Display name</div>
                <input
                  className="field-input"
                  value={createUser.display_name}
                  onChange={(e) => setCreateUser({ ...createUser, display_name: e.target.value })}
                />
              </label>
              <label>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Initial password (optional)</div>
                <input
                  className="field-input"
                  type="password"
                  value={createUser.password}
                  onChange={(e) => setCreateUser({ ...createUser, password: e.target.value })}
                  autoComplete="new-password"
                />
              </label>
              <label>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Global roles</div>
                <input
                  className="field-input"
                  placeholder="e.g. auditor"
                  value={createUser.global_roles}
                  onChange={(e) => setCreateUser({ ...createUser, global_roles: e.target.value })}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Project role (selected project)</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
                    <input
                      type="checkbox"
                      checked={createUser.assignProject}
                      onChange={(e) => setCreateUser({ ...createUser, assignProject: e.target.checked })}
                      disabled={!projectId}
                    />
                    Assign
                  </label>
                  <select
                    className="field-input"
                    style={{ minWidth: 140 }}
                    value={createUser.project_role}
                    onChange={(e) => setCreateUser({ ...createUser, project_role: e.target.value })}
                    disabled={!projectId || !createUser.assignProject}
                  >
                    {['viewer', 'engineer', 'reviewer', 'approver', 'safety_manager', 'project_admin'].map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <button
                type="button"
                className="btn-primary"
                onClick={async () => {
                  setMsg('');
                  setError('');
                  try {
                    const global_roles = createUser.global_roles
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean);
                    await api.adminCreateUser({
                      email: createUser.email.trim(),
                      username: createUser.username.trim(),
                      display_name: createUser.display_name.trim(),
                      password: createUser.password || undefined,
                      global_roles,
                      project_roles:
                        projectId && createUser.assignProject
                          ? [{ project_id: projectId, role: createUser.project_role }]
                          : [],
                    });
                    setCreateUser({
                      email: '',
                      username: '',
                      display_name: '',
                      password: '',
                      global_roles: '',
                      project_role: 'engineer',
                      assignProject: true,
                    });
                    setMsg('User created.');
                    setUsers(await api.adminUsers());
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              >
                Create user
              </button>
            </div>
            {!projectId && (
              <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: '0.65rem', marginBottom: 0 }}>
                Select a project in the header to assign an initial project role.
              </p>
            )}
          </div>

          <div className="table-wrap">
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.65rem' }}>
              Team and reporting lines support independence checks (e.g. ISO 26262 I2/I3). Changing manager assignments may
              affect whether an approver is independent from the author.
            </p>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Email</th>
                  <th>Username</th>
                  <th>Name</th>
                  <th>Enabled</th>
                  <th>Department</th>
                  <th>Title</th>
                  <th>Team</th>
                  <th>Manager</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>{u.email}</td>
                    <td>
                      <input
                        className="field-input"
                        style={{ fontSize: '0.82rem', minWidth: 100 }}
                        defaultValue={u.username || ''}
                        key={`user-${u.id}-username-${u.username ?? ''}`}
                        disabled={Boolean(
                          builtinAdminEmail && u.email && u.email.toLowerCase() === builtinAdminEmail
                        )}
                        title={
                          builtinAdminEmail && u.email?.toLowerCase() === builtinAdminEmail
                            ? 'Built-in admin username is managed in server config'
                            : undefined
                        }
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          const cur = (u.username || '').trim();
                          if (v !== cur) {
                            patchUser(u.id, { username: v || null });
                          }
                        }}
                      />
                    </td>
                    <td>{u.display_name}</td>
                    <td>{u.enabled ? 'yes' : 'no'}</td>
                    <td>
                      <input
                        className="field-input"
                        style={{ fontSize: '0.82rem', minWidth: 120 }}
                        defaultValue={u.department || ''}
                        key={`dept-${u.id}-${u.department ?? ''}`}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (u.department || '')) {
                            patchUser(u.id, { department: v || null });
                          }
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="field-input"
                        style={{ fontSize: '0.82rem', minWidth: 120 }}
                        defaultValue={u.job_title || ''}
                        key={`title-${u.id}-${u.job_title ?? ''}`}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (u.job_title || '')) {
                            patchUser(u.id, { job_title: v || null });
                          }
                        }}
                      />
                    </td>
                    <td>
                      <select
                        className="field-input"
                        style={{ fontSize: '0.82rem', minWidth: 140 }}
                        value={u.team_id ?? ''}
                        disabled={!teams.length}
                        onChange={(e) =>
                          patchUser(u.id, {
                            team_id: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                      >
                        <option value="">—</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                            {t.department ? ` (${t.department})` : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className="field-input"
                        style={{ fontSize: '0.82rem', minWidth: 160 }}
                        value={u.manager_user_id ?? ''}
                        onChange={(e) =>
                          patchUser(u.id, {
                            manager_user_id: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                      >
                        <option value="">—</option>
                        {users
                          .filter((x) => x.id !== u.id)
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.display_name || x.email}
                            </option>
                          ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'auth' && canManageUsers && (
        <div className="card">
          <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginBottom: '1rem' }}>
            Auth providers and role mappings are configured in <code>hoverboard.config.json</code>; see the repository{' '}
            <code>docs/authentication.md</code>. This tab summarizes the running configuration (no secrets).
          </p>
          {authOverview && (
            <>
              <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Flags</div>
              <ul style={{ marginTop: 0, fontSize: '0.9rem' }}>
                <li>Local password login: {authOverview.localLoginEnabled ? 'on' : 'off'}</li>
                <li>Reject local login in production: {authOverview.localLoginDisabledInProduction ? 'yes' : 'no'}</li>
                <li>Sync profile on login: {authOverview.syncProfileOnLogin ? 'on' : 'off'}</li>
                <li>Manual profile override / IdP sync: {authOverview.allowManualProfileOverride ? 'allowed' : 'restricted'}</li>
                <li>Link existing user by email: {authOverview.linkExistingUserByEmail ? 'on' : 'off'}</li>
              </ul>
              <div style={{ fontWeight: 700, margin: '1rem 0 0.5rem' }}>Providers</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Type</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {authOverview.providers?.map((p) => (
                      <tr key={p.id}>
                        <td>{p.id}</td>
                        <td>{p.type}</td>
                        <td>
                          {p.configured != null && String(p.configured)}
                          {p.enabled != null && ` · enabled: ${p.enabled}`}
                          {p.issuerUrl && (
                            <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--muted)' }}>
                              issuer: {p.issuerUrl}
                            </span>
                          )}
                          {p.urlHint && (
                            <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--muted)' }}>
                              url: {p.urlHint}
                            </span>
                          )}
                          {p.groupsClaimPaths?.length > 0 && (
                            <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--muted)' }}>
                              groups claims: {p.groupsClaimPaths.join(', ')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontWeight: 700, margin: '1rem 0 0.5rem' }}>Group → role mappings</div>
              {authOverview.roleMappings?.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Provider group</th>
                        <th>Global role</th>
                        <th>Project ID</th>
                        <th>Project role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {authOverview.roleMappings.map((m, i) => (
                        <tr key={i}>
                          <td>{m.providerGroup || m.provider_group || '—'}</td>
                          <td>{m.globalRole || m.global_role || '—'}</td>
                          <td>{m.projectId ?? m.project_id ?? '—'}</td>
                          <td>{m.projectRole || m.project_role || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>None configured.</p>
              )}
            </>
          )}
          <div style={{ fontWeight: 700, margin: '1rem 0 0.5rem' }}>Synced directory groups</div>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 0 }}>
            Groups observed from OIDC/LDAP logins (used with mappings above).
          </p>
          {syncedGroups?.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Group</th>
                    <th>Users</th>
                  </tr>
                </thead>
                <tbody>
                  {syncedGroups.map((g, i) => (
                    <tr key={`${g.provider}-${g.group_name}-${i}`}>
                      <td>{g.provider}</td>
                      <td style={{ wordBreak: 'break-all' }}>{g.group_name}</td>
                      <td>{g.user_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>No synced groups yet (users must log in via SSO/LDAP).</p>
          )}
        </div>
      )}

      {tab === 'teams' && (
        <div className="card">
          {!projectId && (
            <p style={{ color: 'var(--muted)' }}>Select a project in the header to manage teams.</p>
          )}
          {projectId && (
            <>
              <div style={{ fontWeight: 700, marginBottom: '0.65rem' }}>Create team</div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '0.65rem',
                  marginBottom: '1rem',
                }}
              >
                <label>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Name</div>
                  <input
                    className="field-input"
                    value={teamForm.name}
                    onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })}
                  />
                </label>
                <label>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Parent team</div>
                  <select
                    className="field-input"
                    value={teamForm.parent_team_id}
                    onChange={(e) => setTeamForm({ ...teamForm, parent_team_id: e.target.value })}
                  >
                    <option value="">(none)</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Department</div>
                  <input
                    className="field-input"
                    value={teamForm.department}
                    placeholder="e.g. Vehicle dynamics"
                    onChange={(e) => setTeamForm({ ...teamForm, department: e.target.value })}
                  />
                </label>
              </div>
              <button
                type="button"
                className="btn-primary"
                style={{ marginBottom: '1rem' }}
                onClick={async () => {
                  setError('');
                  try {
                    await api.createTeam(projectId, {
                      name: teamForm.name.trim(),
                      parent_team_id: teamForm.parent_team_id
                        ? Number(teamForm.parent_team_id)
                        : null,
                      department: teamForm.department.trim() || null,
                    });
                    setTeamForm({ name: '', parent_team_id: '', department: '' });
                    setTeams(await api.teams(projectId));
                    setMsg('Team created.');
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              >
                Add team
              </button>

              <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Teams</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Name</th>
                      <th>Parent</th>
                      <th>Department</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teams.map((t) => (
                      <tr key={t.id}>
                        <td>{t.id}</td>
                        <td>{t.name}</td>
                        <td>{t.parent_team_id ? teamById[t.parent_team_id]?.name || t.parent_team_id : '—'}</td>
                        <td>{t.department || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'audit' && canManageUsers && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Actor</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>{a.occurred_at}</td>
                  <td>{a.action}</td>
                  <td>
                    {a.entity_type} {a.entity_id}
                  </td>
                  <td>{a.actor_user_id ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'baselines' && (
        <div className="card">
          <button
            type="button"
            className="btn-primary"
            style={{ marginBottom: '0.75rem' }}
            onClick={async () => {
              setMsg('');
              try {
                const name = window.prompt('Baseline name?', `baseline-${new Date().toISOString().slice(0, 10)}`);
                if (!name) return;
                const r = await api.adminCreateBaseline({ name, description: '' });
                setMsg(`Created baseline #${r.id} (${r.artifact_count} artifacts).`);
                const b = await api.adminBaselines();
                setBaselines(b);
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            Create baseline snapshot
          </button>
          <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
            {baselines.map((b) => (
              <li key={b.id}>
                {b.name} — {b.created_at}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'signoff' && (
        <div className="card">
          <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
            Rules enforce minimum role, independence (I0–I3), and author approval settings per artifact type / ASIL.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={async () => {
              try {
                await api.adminCreateSignoffRule({
                  artifact_type: 'VR',
                  required_project_role: 'approver',
                  independence_level: 1,
                  allow_author_approval: false,
                  enabled: true,
                });
                setRules(await api.adminSignoffRules());
                setMsg('Rule added.');
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            Add example VR rule (I1, no author approval)
          </button>
          <ul style={{ marginTop: '1rem' }}>
            {rules.map((r) => (
              <li key={r.id}>
                type={r.artifact_type || '*'} ASIL={r.asil_level || '*'} role={r.required_project_role} I
                {r.independence_level} author_ok={r.allow_author_approval ? 'yes' : 'no'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'snapshot' && (user?.authDisabled || isSystemAdmin) && (
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>Full data mirror</div>
          <p style={{ margin: '0 0 0.65rem', fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.45 }}>
            Read-only JSON export for inspection. Canonical state remains in SQLite tables.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.65rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn-ghost"
              disabled={snapshotBusy}
              onClick={async () => {
                setSnapshotBusy(true);
                setError('');
                setMsg('');
                try {
                  const data = await api.adminFullSnapshot();
                  setSnapshotText(JSON.stringify(data, null, 2));
                  setSnapshotMeta(data?.meta?.generatedAt ? String(data.meta.generatedAt) : '');
                  setMsg('Loaded live snapshot.');
                } catch (e) {
                  setError(e.message);
                } finally {
                  setSnapshotBusy(false);
                }
              }}
            >
              Refresh live
            </button>
          </div>
          {snapshotMeta ? (
            <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>{snapshotMeta}</div>
          ) : null}
          <JsonTextSearchField
            readOnly
            value={snapshotText}
            onChange={() => {}}
            minHeight={420}
            fontSize="0.78rem"
            lineHeight={1.45}
          />
        </div>
      )}
    </>
  );
}
