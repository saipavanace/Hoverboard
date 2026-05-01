# Platform security: authentication, RBAC, graph artifacts, audit

> **Note:** For onboarding external adopters, prefer the structured guides in **[README.md](README.md)** (documentation index), especially **[authentication.md](authentication.md)**, **[admin_guide.md](admin_guide.md)**, and **[architecture.md](architecture.md)**. This file remains a concise technical reference.

This document describes Hoverboard’s enterprise controls added alongside the legacy DR/VR workflows.

## Architecture overview

- **Graph-first model**: Domain objects are represented as **artifacts** (`artifacts`, `artifact_versions`) with immutable version rows. Legacy `drs` / `vrs` tables remain for API compatibility; new DR/VR rows sync into the graph automatically.
- **Links**: `artifact_links` connect artifacts (e.g. VR `verifies` DR). When a VR version changes, outgoing links are marked **`suspect`** for traceability review.
- **Audit**: Append-only **`audit_events`** (plus mirrored **`audit_log`** for ISO CSV compatibility).
- **Sessions**: Cookie `hb_session` (HTTP-only, `SameSite=Lax`), backed by **`sessions`** in SQLite.

## Authentication modes

### 1. Disabled auth (local development only)

In `hoverboard.config.json` or with **`HOVERBOARD_AUTH_DISABLED=true`**:

```json
"auth": {
  "disabled": true
}
```

All API routes behave as a privileged **system** user; **do not** deploy this mode to the internet. When disabled, the UI does not enforce normal login.

### 2. Enabling authentication

Set:

```json
"auth": {
  "disabled": false,
  "localLoginEnabled": true,
  "sessionTtlHours": 336,
  "defaultProjectRole": "engineer",
  "oidc": {
    "issuerUrl": "https://login.microsoftonline.com/<tenant>/v2.0",
    "clientId": "...",
    "clientSecret": "...",
    "redirectUri": "http://localhost:5179/api/auth/callback",
    "scopes": ["openid", "profile", "email"],
    "allowedDomains": ["yourcompany.com"],
    "autoCreateUsers": true
  }
}
```

Environment override: `HOVERBOARD_AUTH_DISABLED=true` forces disabled mode.

### First administrator (bootstrap)

When **no users** exist and auth is enabled:

`POST /api/auth/bootstrap-first-admin`

```json
{
  "email": "admin@yourcompany.com",
  "password": "<strong password>",
  "display_name": "Admin"
}
```

This creates a **system_admin** and **project_admin** on the default project.

### Local login

`POST /api/auth/login` with `{ "email", "password" }`. Passwords use **PBKDF2** (no plaintext storage).

### OIDC / SSO (Azure AD, Google, Okta, generic)

1. Register a confidential client with redirect URI matching **`auth.oidc.redirectUri`** (API origin, not the Vite port unless you terminate TLS there).
2. Fill **`issuerUrl`**, **`clientId`**, **`clientSecret`**.
3. Users hit **`GET /api/auth/oidc/start`** (add a “Sign in with SSO” button linking to this path on the API host, or proxy it).
4. **`allowedDomains`**: if non-empty, email domains must match for auto-provisioned users.
5. **`autoCreateUsers`**: when `true`, unknown `sub` creates a user with **`defaultProjectRole`**.

Provider examples:

| Provider | Issuer URL notes |
|----------|------------------|
| Azure AD | `https://login.microsoftonline.com/<tenant-id>/v2.0` |
| Google | `https://accounts.google.com` (verify OIDC discovery support) |
| Okta | `https://<domain>.okta.com/oauth2/default` |

## RBAC

**Global roles**: `system_admin`, `auditor`.

**Project roles**: `viewer`, `engineer`, `reviewer`, `approver`, `safety_manager`, `project_admin`.

Permissions are enforced on `/api/*` when auth is enabled (except public routes such as `/api/health`, `/api/config`, `/api/auth/*`).

## Sign-off authority

Table **`signoff_rules`** (per project): artifact type, ASIL, required project role, **independence level** I0–I3, **`allow_author_approval`**.

- **I1**: approver ≠ author  
- **I2**: different **team** (`users.team_id`)  
- **I3**: different **department** and not in the same **manager** chain  

Approvals compute **`signature_hash`** over `(artifact_version_id, user_id, timestamp, content_hash)`.

## Comments

**`artifact_comments`**: threaded via `parent_comment_id`, soft-delete via `deleted_at`, resolve/unresolve with audit events.

## Baselines

**`baselines`** + **`baseline_items`** freeze **`artifact_version_id`** per artifact for reproducibility. Export: `GET /api/admin/baselines/:id/export`.

## PostgreSQL migration notes

Schema uses ANSI-friendly types (`TEXT`, `INTEGER`, ISO timestamps in `TEXT`). Replace SQLite-specific helpers (`datetime('now')`) with `NOW()` when porting; session store can move to Redis or DB table unchanged.

## Troubleshooting

| Issue | Check |
|-------|--------|
| 401 on API after enabling auth | Bootstrap admin or sign in; cookie `hb_session` set? |
| OIDC redirect mismatch | `redirectUri` exactly matches IdP app registration |
| Domain rejected | `allowedDomains` vs user email |
| Comments fail FK | Users table populated; auth disabled uses **system@hoverboard.internal** |
