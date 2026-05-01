# Authentication

Hoverboard uses a **pluggable provider model**: the core login flow works with **normalized profiles** from each provider (see below). Supported provider categories:

1. **OIDC** — Google Workspace, Microsoft Entra ID (Azure AD), Okta, or any standards-compliant OpenID Connect issuer.
2. **LDAP / Active Directory** — Bind authentication against a corporate directory with configurable search and attribute mapping.
3. **Local password** — Bootstrap and admin recovery; can be restricted in production.

Authentication can be **disabled** only for development (not recommended for shared or production environments).

---

## Normalized user profile

Every provider maps sign-ins into a common shape used for provisioning and sync:

| Field | Meaning |
| --- | --- |
| **`provider`** | `oidc`, `ldap`, or `local` |
| **`provider_subject`** | Stable subject from the IdP / directory |
| **`providerIssuer`** | OIDC issuer URL or LDAP marker (used with subject to find accounts) |
| **`email`** | Primary email |
| **`display_name`** | Display name |
| **`groups`** | Directory / IdP group names (for role mapping) |
| **`department`** | Org unit / department |
| **`title`** | Job title (stored as `job_title` in the database) |
| **`manager_email`** | Manager’s email when resolvable |

After login the server:

1. Finds an existing user by **`provider_issuer` + `provider_subject`**.
2. If not found, optionally matches by **email** when **`auth.linkExistingUserByEmail`** is true (links the SSO identity to an existing row).
3. If **`autoCreateUsers`** is enabled for that provider, creates a user.
4. Optionally **syncs** department, title, manager, and groups when **`auth.syncProfileOnLogin`** is true; empty manual fields can be preserved when **`auth.allowManualProfileOverride`** is true.

---

## Modes at a glance

| Mode | When to use |
| --- | --- |
| **OIDC / SSO** | Production; Azure AD, Google Workspace, Okta, or any OIDC provider |
| **LDAP** | Enterprises using AD/LDAP bind and `memberOf` (or mapped group attributes) |
| **Local login** | Bootstrap, break-glass, air-gapped labs |
| **Auth disabled** | Solo developer only (`HOVERBOARD_AUTH_DISABLED=true`) |

Configuration lives in **`hoverboard.config.json`** under **`auth`**. See **[configuration.md](configuration.md)** for all keys.

---

## OIDC overview

Hoverboard uses the **`openid-client`** library with **OAuth 2.0 authorization code flow + PKCE**. Sequence:

1. User opens **`GET /api/auth/oidc/start`** (or “Login with SSO” in the UI when OIDC is configured).
2. Browser redirects to your IdP; user signs in.
3. IdP redirects to **`GET /api/auth/callback`** on the **API host** with `code` and `state`.
4. Server exchanges the code, validates tokens, provisions or updates the user, sets **`hb_session`** cookie.

**Critical:** The **`redirectUri`** in config must **exactly** match the redirect URI registered at the IdP (scheme, host, port, path). Default path suffix is **`/api/auth/callback`**.

Other important settings:

| Key | Purpose |
| --- | --- |
| **`issuerUrl`** | OIDC issuer base URL (provider-specific; see below) |
| **`clientId`**, **`clientSecret`** | Confidential client credentials |
| **`redirectUri`** | e.g. `https://api.example.com/api/auth/callback` |
| **`scopes`** | Usually `["openid", "profile", "email"]` |
| **`allowedDomains`** | If non-empty, only emails from these domains may auto-provision |
| **`autoCreateUsers`** | If `true`, first login creates a user with **`defaultProjectRole`** |
| **`groupsClaimPaths`** | Ordered list of JWT claim names to read groups from (e.g. `groups`, `roles`) |

**`publicAppUrl`:** After SSO, the server may redirect the browser to your SPA (e.g. `https://app.example.com`). Set this to your Vite/production front-end origin.

### Group → role mapping (OIDC and LDAP)

Configure **`auth.roleMappings`** (array of objects). Matching is **case-insensitive** on the provider group name.

| Field | Description |
| --- | --- |
| **`providerGroup`** | Directory / IdP group name (e.g. `hoverboard-admins`, `CN=DV-Reviewers,OU=Groups,DC=example,DC=com`) |
| **`globalRole`** | Optional global role to add (e.g. `system_admin`, `auditor`) |
| **`projectId`** | Optional numeric project id |
| **`projectRole`** | Optional project role to add for that project (e.g. `reviewer`, `approver`) |

Example: LDAP group **`hoverboard-admins`** → **`system_admin`**; Google group **`dv-reviewers@example.com`** → **`reviewer`** on project **1**.

Use the Admin **auth** tab to see configured mappings and **synced groups** (groups observed after users sign in).

---

## Azure AD (Microsoft Entra ID)

1. In Entra ID, register an application (**App registrations**).
2. Add a **client secret** (Certificates & secrets).
3. Under **Authentication**, add a **Web** redirect URI:  
   `https://<your-api-host>/api/auth/callback`
4. Under **API permissions**, add **Microsoft Graph** delegated permissions if you need profile/email (many setups work with default OIDC scopes).
5. Set **`issuerUrl`** to your tenant’s OIDC metadata base, for example:  
   `https://login.microsoftonline.com/<tenant-id>/v2.0`  
   (Directory (tenant) ID is in the Entra overview.)
6. Set **`clientId`** and **`clientSecret`** from the app registration.

**Example snippet:**

```json
"auth": {
  "disabled": false,
  "localLoginEnabled": true,
  "publicAppUrl": "https://hoverboard.example.com",
  "defaultProjectRole": "engineer",
  "oidc": {
    "issuerUrl": "https://login.microsoftonline.com/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/v2.0",
    "clientId": "your-application-client-id",
    "clientSecret": "your-secret",
    "redirectUri": "https://api.example.com/api/auth/callback",
    "scopes": ["openid", "profile", "email"],
    "allowedDomains": ["yourcompany.com"],
    "autoCreateUsers": true
  }
}
```

---

## Google

1. Open **Google Cloud Console** → APIs & Services → **Credentials**.
2. Create **OAuth 2.0 Client ID** (Web application).
3. Authorized redirect URIs: `https://<api-host>/api/auth/callback`
4. **`issuerUrl`** for Google is typically:  
   `https://accounts.google.com`
5. Use the Google-provided **client ID** and **client secret** in Hoverboard config.

Restrict login to your domain with **`allowedDomains`** (e.g. `["yourcompany.com"]`).

---

## Okta

1. In Okta Admin, create an **OIDC** application (Web).
2. Sign-in redirect URI: `https://<api-host>/api/auth/callback`
3. **`issuerUrl`** is usually:  
   `https://<your-org>.okta.com/oauth2/default`  
   (or your custom authorization server URL from Okta’s OpenID configuration.)
4. Copy **Client ID** and **Client secret** into **`auth.oidc`**.

---

## Generic OIDC

Any standards-compliant OIDC provider works if you supply:

- **`issuerUrl`** — Must expose `/.well-known/openid-configuration`
- **Confidential client** with **`clientSecret`** (Hoverboard uses client secret post)
- **Redirect URI** registered at the provider

Test discovery:

```bash
curl -s "<issuerUrl>/.well-known/openid-configuration" | head
```

---

## LDAP / Active Directory

Enable **`auth.ldap.enabled`** and set **`auth.ldap.url`** (e.g. `ldaps://dc.example.com:636` or `ldap://...`). The server performs a **service bind** (optional **`bindDn`** / **`bindPassword`**), searches for the user under **`searchBase`** using **`userSearchFilter`** (placeholders `{{username}}`), then **binds as the user** to verify the password.

| Key | Purpose |
| --- | --- |
| **`tlsRejectUnauthorized`** | When using LDAPS, whether to verify TLS certificates (`true` in production) |
| **`userSearchFilter`** | e.g. `(sAMAccountName={{username}})` or `(uid={{username}})` |
| **`userAttributeList`** | Attributes to fetch (mail, cn, department, title, memberOf, …) |
| **`emailAttribute`**, **`displayNameAttribute`**, **`departmentAttribute`**, **`titleAttribute`**, **`groupAttribute`** | Map LDAP attributes to the normalized profile |
| **`autoCreateUsers`** | Whether first successful LDAP login creates a DB user |

**Login:** **`POST /api/auth/ldap/login`** with JSON **`{ "username", "password" }`**, or use the **LDAP** section on the login page when LDAP is enabled.

Groups are typically taken from **`memberOf`** (full DNs). Use **`roleMappings`** with the same strings your IdP sends (often full **CN=…** paths).

---

## Local admin fallback

When **`auth.localLoginEnabled`** is `true`, users can sign in with **`POST /api/auth/login`** (used by the login form).

Set **`auth.localLoginDisabledInProduction`** to enforce disabling password login when **`NODE_ENV=production`** (break-glass overrides should use SSO or console access).

**Built-in administrator** (break-glass account) is configured under **`auth.builtinAdmin`**:

| Key | Purpose |
| --- | --- |
| **`email`** | Canonical email stored in the `users` table (default `admin@hoverboard.builtin`) |
| **`username`** | Short login id typed at the UI (default `admin`); the server maps this to **`email`** |
| **`password`** | Optional; stored in **`hoverboard.config.json`** only if you set it (GET API omits it). Prefer **`HOVERBOARD_BUILTIN_ADMIN_PASSWORD`** |

If no env or file password is set, the effective password defaults to **`12345`** until you configure one. On each **`ensureBuiltinAdmin`** run (server startup and after saving Settings / config), the hash is refreshed from env → file password → that default.

The **numeric database user id** cannot be reassigned; change **`email`** / **`username`** / password via configuration or **Settings** (requires **`settings_write`**), not the Admin user PATCH API.

Use this only for **initial setup** or **controlled environments**. Prefer SSO/LDAP and tighten local login for production.

**Bootstrap API:** If the database has **zero** users and auth is enabled, `POST /api/auth/bootstrap-first-admin` can create the first admin (see **[platform-security.md](platform-security.md)**). This is unnecessary when the built-in admin already exists.

---

## Troubleshooting login issues

| Symptom | Things to check |
| --- | --- |
| **501 OIDC not configured** | Fill `issuerUrl`, `clientId`, `clientSecret`, `redirectUri`; restart API |
| **Redirect mismatch** | IdP redirect URI must match **`auth.oidc.redirectUri`** character-for-character |
| **Invalid OAuth state** | Clock skew, multiple API instances without shared DB, or stale cookies — clear cookies and retry |
| **User blocked / domain** | Check **`allowedDomains`**; empty list allows all domains (subject to IdP) |
| **401 on API after login** | Cookie `hb_session` not sent — ensure same-site policy, HTTPS in production, correct proxy headers |
| **Local login disabled** | Set **`auth.localLoginEnabled`: true** or use SSO |
| **Always logged in as “Local”** | **`HOVERBOARD_AUTH_DISABLED=true`** or **`auth.disabled`: true** — remove for real auth |

Browser tip: use devtools **Network** tab to confirm `/api/auth/callback` returns **302** to your app and **Set-Cookie** for `hb_session`.

---

## Next steps

- **[Admin guide](admin_guide.md)** — Assign roles after users appear.
- **[Troubleshooting](troubleshooting.md)** — Expanded diagnostics.
