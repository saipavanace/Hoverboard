# Troubleshooting

Practical fixes for common deployment and workflow issues. Always capture **API response body** and **server logs** when escalating.

---

## Common errors

### `401 authentication required`

- User has no session cookie — complete login ([authentication.md](authentication.md)).
- **`HOVERBOARD_AUTH_DISABLED`** unset but cookies cleared — sign in again.
- Reverse proxy stripping **`Cookie`** headers — fix proxy config.

### `403 forbidden` on project APIs

- Missing **project role** — administrator must assign **[admin_guide.md](admin_guide.md)** `user_project_roles`.
- Wrong **`X-Project-Id`** header — UI normally sets this from selected project; API clients must send it explicitly.

### `404 not found` on specs / DRs / VRs

- Entity deleted or wrong **project** scope.
- **Stale browser cache** — hard refresh.

### `409 conflict` / unique constraint

- Duplicate **email** on user create, or duplicate **slug** on project — pick a different value.

### `500 project clone failed`

- Source project inaccessible or clone threw — check server logs; verify **`copy_from_project_id`** and permissions.

---

## SSO issues

| Symptom | Checks |
| --- | --- |
| **501 OIDC not configured** | All of **`issuerUrl`**, **`clientId`**, **`clientSecret`**, **`redirectUri`** filled |
| **Redirect URI mismatch** | IdP app registration **exactly** equals **`auth.oidc.redirectUri`** |
| **invalid OAuth state** | Multiple replicas without sticky sessions / shared DB for **`oauth_states`**; try single instance |
| **Domain rejected** | Adjust **`allowedDomains`** or IdP email claims |
| **HTTP vs HTTPS** | Production must use **HTTPS** and **`Secure` cookies** (`NODE_ENV=production`) |

---

## Permission issues

1. Confirm user **`global_roles`** and **`project_roles`** via **`GET /api/auth/me`** (when logged in).
2. **`system_admin`** bypasses project checks for listing projects — others need explicit **project membership**.
3. **Auditor** global role may read broadly — confirm **[RBAC]** expectations with your deployment doc.

---

## Approval failures

See detailed table in **[reviews_and_approvals.md](reviews_and_approvals.md)**. Quick checklist:

- Approver **project role** rank vs **`required_project_role`**
- **`allow_author_approval`**
- **Independence I1–I3** — teams, departments, managers on user records

---

## Database locked / SQLite errors

- Another process holds the file — stop duplicate API processes writing the same path.
- NFS locking quirks — prefer **local disk** for SQLite in production or migrate to a supported client-server DB (future fork).

---

## Debug tips

1. **`curl http://localhost:5179/api/health`** — API up?
2. **`GET /api/config`** — Returns **`authUi`** flags (`authDisabled`, `localLoginEnabled`, `oidcConfigured`).
3. **Browser devtools → Application → Cookies** — `hb_session` present after login?
4. **Server console** — Stack traces on 500s.
5. **`NODE_ENV`** and **`PORT`** — Confirm which process answers on which interface (bind `0.0.0.0` behind firewall as needed).

---

## Related documentation

- **[Installation](installation.md)** — Ports and env vars.
- **[Authentication](authentication.md)** — OIDC details.
