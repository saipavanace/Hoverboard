# Configuration reference

Hoverboard merges **defaults** with **`hoverboard.config.json`** at the repository root (unless **`HOVERBOARD_CONFIG`** points elsewhere). Partial updates via **`saveConfig`** preserve unspecified keys.

Environment overrides:

| Variable | Effect |
| --- | --- |
| **`HOVERBOARD_CONFIG`** | Alternate JSON path |
| **`HOVERBOARD_DB_PATH`** | SQLite file location |
| **`HOVERBOARD_AUTH_DISABLED`** | `true` forces auth-disabled mode (development only; **do not** use in production) |

---

## Top-level schema

| Key | Type | Description |
| --- | --- | --- |
| **`projectName`** | string | Display name in shell/header contexts |
| **`companyName`** | string | Organization label for exports/reports |
| **`requirementCategories`** | string[] | Allowed **category** values for DRs and VRs; API rejects unknown values |
| **`regressionRoots`** | string[] | Directories scanned for regression ingestion (**paths readable by API host**) |
| **`releaseMetricWeights`** | object | Weights for combined readiness score (numeric; should sum ~1) |
| **`branding`** | object | `accent` (hex color), `logoUrl` (optional string\|null) |
| **`regressionParsers`** | `{ name, regex }[]` | Line classifiers for regression ingest |
| **`coverageRegex`** | object | See below |
| **`vrLogRegex`** | string | Regex to capture VR public IDs from log lines |
| **`auth`** | object | Authentication — **see dedicated section** |

---

## `releaseMetricWeights`

| Key | Role in dashboard score |
| --- | --- |
| **`passRate`** | Regression pass-rate proxy |
| **`functionalCov`** | Functional coverage term |
| **`codeCov`** | Code coverage term |
| **`vrCov`** | VR completion / coverage |
| **`drClosure`** | DR health / non-stale DR contribution |

---

## `coverageRegex`

| Key | Description |
| --- | --- |
| **`functional`** | Array of regex strings; **first capture group** = functional coverage % |
| **`code`** | Same for code coverage |

JSON files with keys like `functional_coverage` / `fcov` may be auto-detected by ingest helpers.

---

## `regressionParsers`

Each entry: **`{ "name": "fail", "regex": "FAIL\\b" }`**. Lines matching any parser count toward failure binning during directory ingest.

---

## Auth configuration (`auth`)

| Key | Type | Description |
| --- | --- | --- |
| **`disabled`** | boolean | **`false`** = login required (recommended). **`true`** = API runs as system user (**local dev only**) |
| **`sessionTtlHours`** | number | Cookie/session lifetime (hours) |
| **`localLoginEnabled`** | boolean | **`POST /api/auth/login`** enabled |
| **`localLoginDisabledInProduction`** | boolean | If `true`, reject local password login when **`NODE_ENV=production`** |
| **`publicAppUrl`** | string | SPA origin after OIDC redirect, e.g. `https://app.example.com` |
| **`defaultProjectRole`** | string | Role assigned on auto-provisioned users (e.g. `engineer`) |
| **`syncProfileOnLogin`** | boolean | Update name, department, title, manager from IdP/LDAP on each login |
| **`allowManualProfileOverride`** | boolean | If `true`, empty DB fields get IdP values; if `false`, manual fields are not overwritten |
| **`linkExistingUserByEmail`** | boolean | Link SSO/LDAP to an existing user row with the same email |
| **`roleMappings`** | array | `{ providerGroup, globalRole?, projectId?, projectRole? }[]` — see **[authentication.md](authentication.md)** |
| **`builtinAdmin`** | object | Reserved local break-glass account — see below |
| **`oidc`** | object | OIDC confidential client — see below |
| **`ldap`** | object | LDAP / AD — see below |

### `auth.builtinAdmin`

| Key | Type | Description |
| --- | --- | --- |
| **`email`** | string | Stored user email (default `admin@hoverboard.builtin`); migrated from that legacy address on startup if you change it |
| **`username`** | string | Login name typed at the password prompt (default `admin`); maps to **`email`** server-side |
| **`password`** | string | Optional; if set, used for the password hash on sync. **Omitted from GET `/api/config`** responses. Prefer **`HOVERBOARD_BUILTIN_ADMIN_PASSWORD`** in production |

Password resolution order: **`HOVERBOARD_BUILTIN_ADMIN_PASSWORD`** env → **`auth.builtinAdmin.password`** in the JSON file → default **`12345`** on first use if none set.

### `auth.oidc`

| Key | Type | Description |
| --- | --- | --- |
| **`issuerUrl`** | string | OIDC issuer (must expose `/.well-known/openid-configuration`) |
| **`clientId`** | string | Registered client id |
| **`clientSecret`** | string | Confidential client secret |
| **`redirectUri`** | string | Must equal IdP registration, e.g. `https://api:5179/api/auth/callback` |
| **`scopes`** | string[] | Default `["openid", "profile", "email"]` |
| **`allowedDomains`** | string[] | If non-empty, email domain allow-list for provisioned users |
| **`autoCreateUsers`** | boolean | Create DB user on first OIDC login |
| **`groupsClaimPaths`** | string[] | Claim names to read groups from (first present wins) |

**Security:** Prefer **secrets management** (vault, env-injected file) over committing **`clientSecret`** to git.

### `auth.ldap`

| Key | Type | Description |
| --- | --- | --- |
| **`enabled`** | boolean | Enable LDAP sign-in (**`POST /api/auth/ldap/login`**) and login UI |
| **`url`** | string | `ldap://` or `ldaps://` server |
| **`bindDn`** / **`bindPassword`** | Service account for search (optional if anonymous read allowed) |
| **`searchBase`** | Base DN for user search |
| **`userSearchFilter`** | Filter with `{{username}}` placeholder |
| **`userAttributeList`** | Comma-separated LDAP attributes to retrieve |
| **`emailAttribute`**, **`displayNameAttribute`**, **`departmentAttribute`**, **`titleAttribute`**, **`groupAttribute`** | Attribute mapping |
| **`autoCreateUsers`** | Create DB user on first LDAP login |
| **`tlsRejectUnauthorized`** | TLS certificate verification for LDAPS |

---

## Example full file

```json
{
  "projectName": "Hoverboard",
  "companyName": "Example Motors",
  "requirementCategories": ["System", "CHI", "DVE"],
  "regressionRoots": ["./sample-regressions"],
  "releaseMetricWeights": {
    "passRate": 0.25,
    "functionalCov": 0.2,
    "codeCov": 0.15,
    "vrCov": 0.15,
    "drClosure": 0.25
  },
  "branding": {
    "accent": "#0d9488",
    "logoUrl": null
  },
  "regressionParsers": [
    { "name": "fail", "regex": "FAIL\\b" },
    { "name": "fatal", "regex": "UVM_FATAL" }
  ],
  "coverageRegex": {
    "functional": ["functional\\s*coverage\\s*[:=]\\s*([0-9]+(?:\\.[0-9]+)?)\\s*%?"],
    "code": ["code\\s*coverage\\s*[:=]\\s*([0-9]+(?:\\.[0-9]+)?)\\s*%?"]
  },
  "vrLogRegex": "(?:UVM_INFO|uvm_info)[\\s\\S]{0,200}?\\b(VR-\\d{3,8})\\b",
  "auth": {
    "disabled": false,
    "sessionTtlHours": 336,
    "localLoginEnabled": true,
    "publicAppUrl": "http://localhost:5173",
    "defaultProjectRole": "engineer",
    "oidc": {
      "issuerUrl": "",
      "clientId": "",
      "clientSecret": "",
      "redirectUri": "http://localhost:5179/api/auth/callback",
      "scopes": ["openid", "profile", "email"],
      "allowedDomains": [],
      "autoCreateUsers": true
    }
  }
}
```

---

## Project config vs global config

- **Global** keys above apply server-wide.
- **Per-project** data (roles, teams, sign-off rules) lives in **SQLite**, not in this JSON — manage via **Admin** / APIs.

---

## Import-related tuning

| Topic | Keys / endpoints |
| --- | --- |
| Regression directories | **`regressionRoots`**, **`regressionParsers`**; **`POST /api/regressions/ingest-directory`** |
| Coverage logs | **`coverageRegex`**; **`POST /api/coverage/ingest-directory`** |
| VR mentions in logs | **`vrLogRegex`**; **`POST /api/vr-coverage/scan-directory`** |

---

## Runtime changes

**Settings** in the UI can **`PUT /api/config`** (requires permission) and rewrite the JSON file on disk — validate in staging before production.

---

## Related documentation

- **[Authentication](authentication.md)** — OIDC setup walkthroughs.
- **[Installation](installation.md)** — Environment variables.
- **[Troubleshooting](troubleshooting.md)** — Config mistakes.
