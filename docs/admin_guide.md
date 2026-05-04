# Administrator guide

This guide is for **system administrators** (`system_admin` global role) and **project administrators** (`project_admin` on a workspace). Some screens require **system administrator** privileges — notably **creating users** and **assigning global roles**.

---

## Admin panel overview

Administrators reach **Administration** from **`/projects/:projectId/admin`** (linked from the header when you have access). Tabs typically include:

| Tab | Typical audience |
| --- | --- |
| **users** | **System administrators only** — create users, edit directory fields |
| **auth** | **System administrators** — read-only summary of auth providers, **`roleMappings`**, and synced IdP/LDAP groups |
| **teams** | Project-scoped teams (may require project context) |
| **audit** | Administrative audit feed |
| **baselines** | Baseline records |
| **signoff** | Sign-off policy rules |
| **Data mirror** | **System administrators only** — full JSON snapshot of DB rows + derived metrics (see below) |

Exact visibility depends on your roles and server configuration. Non–system-admins may see **teams**, **baselines**, and **signoff** without the **users** / **auth** / **audit** tabs. The platform **audit** tab is for system administrators only.

---

## Creating users and login identities

**Adding login credentials** depends on how your deployment authenticates:

### Local (password) accounts

System administrators use the **Users** tab **Add local user** form (or **`POST /api/admin/users`**):

1. **Email**, **username**, and **display name** (required). Usernames are lowercase letters, digits, `.`, `_`, and `-` (max 64 characters). Users can sign in with **email or username** plus password. **Initial password** is optional (user can reset via your process or SSO later).
2. Optional **global roles** (comma-separated), e.g. `auditor` — use **`system_admin`** only when appropriate.
3. Optionally assign an initial **project role** for the **currently selected project** in the header (viewer … project_admin).

### SSO (OIDC) users

Users usually **do not** need manual account creation: on first successful SSO sign-in, Hoverboard can **auto-create** the user if **`auth.oidc.autoCreateUsers`** is true. You then assign or map **project roles** (and use **`auth.roleMappings`** to map IdP groups to global/project roles — see **[authentication.md](authentication.md)**).

You can still **create a local row first** (same email) and link on first SSO login when **`auth.linkExistingUserByEmail`** is true.

### LDAP users

Same as OIDC for provisioning: enable **`auth.ldap`**, then users sign in via the login page (**LDAP**) or **`POST /api/auth/ldap/login`**. Auto-create and group mapping follow **`auth.ldap.autoCreateUsers`** and **`auth.roleMappings`**.

**Operational tip:** Prefer **SSO or LDAP** in production; keep **local** accounts for integration users or controlled labs. Use **`auth.localLoginDisabledInProduction`** to harden password login if supported by your runbook.

### Directory fields (department, title, manager)

On the **Users** tab, edit **department** and **title** inline. Values may be **overwritten on next login** if **`auth.syncProfileOnLogin`** is on and **`auth.allowManualProfileOverride`** allows IdP sync — see **[authentication.md](authentication.md)**.

### Auth configuration summary

The **auth** tab lists enabled providers (without secrets), **`roleMappings`**, and **synced groups** seen from real logins. Changing providers or mappings is done in **`hoverboard.config.json`** (see **[configuration.md](configuration.md)**).

---

## Assigning roles

Hoverboard distinguishes:

### Global roles

Stored per user (examples):

- **`system_admin`** — Full platform administration (user directory, roles API).
- **`auditor`** — Read-heavy audit access patterns where configured.

### Project roles

Per **user + project** (examples from weakest to strongest):

`viewer` → `engineer` → `reviewer` → `approver` → `safety_manager` → `project_admin`

Higher roles **subsume** weaker capabilities for permission checks (e.g. an **approver** can perform engineer actions where policy allows).

**Workflow:**

1. Identify the **project** (workspace) the person must access.
2. Grant at least one **project role** so **`userHasProjectAccess`** succeeds and APIs scoped with **`X-Project-Id`** work.
3. Elevate **approver** / **safety_manager** only where ISO-style approvals apply.

---

## Managing teams and hierarchy

**Teams** belong to a **project**. Administrators with **`admin_teams`** (typically **project_admin**) can:

- Create **teams** with optional **parent team** (hierarchy).
- Set **department** labels for independence checks.

**User hierarchy** (manager chain) is maintained on the **user** record:

- **`team_id`** — Associates a person with a team for **independence level I2** (different team from author).
- **`manager_user_id`** — Reporting chain for **I3** checks (same department / chain constraints).

When editing managers, the API rejects **circular** assignments.

**Example:** Approver Alice reviews a VR authored by Bob. If sign-off rules require **I2**, Alice must not share Bob’s **team_id** if the rule evaluates team separation.

---

## Assigning project access

Project access is **not** implied by SSO alone (unless **`autoCreateUsers`** provisions a default role on a default project — deployment-specific).

Standard pattern:

1. User logs in via SSO → user row exists.
2. **System administrator** assigns **`user_project_roles`** for each project: `(user_id, project_id, role)`.

Users without a role on a project receive **403** on project-scoped APIs.

---

## Configuring sign-off authority rules

**Sign-off rules** live per **project** in the **`signoff_rules`** table (managed via Admin **signoff** UI/API where enabled).

Each rule can specify:

| Field | Meaning |
| --- | --- |
| **`artifact_type`** | e.g. DR vs VR, or wildcard |
| **`asil_level`** | ASIL tier or blank for “any” |
| **`required_project_role`** | Minimum project role of approver (ordering: viewer … project_admin) |
| **`independence_level`** | **I0–I3** style separation (see **[reviews_and_approvals.md](reviews_and_approvals.md)**) |
| **`allow_author_approval`** | Whether the artifact author may approve their own work |
| **`enabled`** | On/off |

Rules are evaluated in **ID order**; the engine returns the **first failure** reason if any rule blocks approval.

**Example policy snippet (conceptual):**

- VR artifacts at ASIL D require **approver** role, **I2** independence, author cannot approve.

Implement by adding rows via Admin or API; test with a draft VR and a non-author approver account.

---

## Full data mirror (system administrator)

The **Data mirror** tab shows **one JSON document** that reflects how Hoverboard sees the database at refresh time:

| Section | Contents |
| --- | --- |
| **`meta`** | Schema version, ISO timestamp, operational notes |
| **`config`** | Merged **`hoverboard.config.json`** (same shape as **`GET /api/config`** internally) |
| **`tables`** | Row arrays keyed by SQLite table name for DRs, VRs, specs, regressions, coverage, users (minus secrets—see below), etc. |
| **`computed`** | **Derived only** — per-project dashboard metrics and recent **`coverage_metrics`** history for inspection; editing these keys does **not** change behavior unless underlying rows change |

### Canonical data vs this snapshot

- **Source of truth** is always the **normal relational tables** (`drs`, `vrs`, `regression_failure_lines`, `regression_signature_requirements`, `regression_signatures`, …). The JSON is a **read-only export / inspection view**, not a parallel database.

### API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | **`/api/admin/full-snapshot`** | Live snapshot built from the current DB (same document as **Refresh live** in the UI) |

Password hashes are exported as **`[REDACTED]`**.

---

## Built-in administrator guardrails

The reserved built-in account (**`admin`**) cannot be modified through normal admin PATCH/role APIs — use SSO and dedicated service accounts for ongoing operations.

---

## Related documentation

- **[Architecture](architecture.md)** — Relational tables as the source of truth; JSON mirror is export-only.
- **[Authentication](authentication.md)** — SSO and local login.
- **[Reviews and approvals](reviews_and_approvals.md)** — Independence levels in detail.
- **[Configuration](configuration.md)** — `defaultProjectRole`, OIDC, session TTL.
