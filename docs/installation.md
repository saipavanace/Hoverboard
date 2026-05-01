# Installation

This guide covers installing Hoverboard for **local development** and outlines **production** considerations.

---

## Prerequisites

| Requirement | Notes |
| --- | --- |
| **Node.js** | Version **20** or newer (LTS recommended) |
| **npm** | Comes with Node |
| **Operating system** | macOS, Linux, or Windows (paths in docs use Unix style; adjust for Windows) |
| **Optional** | Reverse proxy (nginx, Traefik) and TLS certificates for production |

Hoverboard does **not** require Docker, Redis, or PostgreSQL by default; persistence is **SQLite**.

---

## Repository layout

- **`server/`** — Express API (`node index.js`)
- **`client/`** — Vite + React SPA
- **`hoverboard.config.json`** — Runtime configuration (repository root by default)
- **`server/data/hoverboard.sqlite`** — Default database path (created automatically)

---

## Local setup

### 1. Clone and install dependencies

```bash
git clone <your-repo-url> hoverboard
cd hoverboard

npm install
npm install --prefix server
npm install --prefix client
```

### 2. Configuration file

Copy or create **`hoverboard.config.json`** at the repo root. Minimal example:

```json
{
  "projectName": "Hoverboard",
  "companyName": "Your org",
  "branding": { "accent": "#0d9488", "logoUrl": null }
}
```

See **[configuration.md](configuration.md)** for every key. Auth-related keys live under **`auth`** (see **[authentication.md](authentication.md)**).

### 3. Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| **`PORT`** | HTTP port for the API | `5179` |
| **`HOVERBOARD_DB_PATH`** | Full path to SQLite database file | `server/data/hoverboard.sqlite` |
| **`HOVERBOARD_CONFIG`** | Path to alternate JSON config file | `<repo>/hoverboard.config.json` |
| **`HOVERBOARD_AUTH_DISABLED`** | When `true`, disables login gates (development convenience) | unset (`false` behavior from config) |
| **`NODE_ENV`** | `production` affects cookie `Secure` flag and similar | `development` |

Example:

```bash
export HOVERBOARD_DB_PATH=/var/lib/hoverboard/app.sqlite
export PORT=8080
```

### 4. Run backend and frontend

**Development (recommended):** from the repository root, both processes together:

```bash
npm run dev
```

This typically starts:

- **API** — `http://localhost:5179` (or `$PORT`)
- **Client** — `http://localhost:5173` with **proxy** so the browser calls `/api` and `/uploads` on the same origin as the UI

**API only:**

```bash
cd server && npm run dev
# or production:
NODE_ENV=production node server/index.js
```

**Client only** (expects API reachable via proxy or env):

```bash
cd client && npm run dev
```

### 5. Verify

```bash
curl -s http://localhost:5179/api/health
```

Expect JSON: `{ "ok": true, "service": "hoverboard-api" }`.

Open **`http://localhost:5173`** in a browser and complete **[authentication](authentication.md)**.

---

## Database setup

- On **first start**, the server creates SQLite tables if missing and applies **lightweight migrations** (additive columns, etc.) automatically.
- No manual migration CLI is required for standard upgrades within this codebase.
- **Backup:** stop the server (or use SQLite online backup) and copy `HOVERBOARD_DB_PATH` regularly.

### Resetting a development database

```bash
rm -f server/data/hoverboard.sqlite
# Restart server — schema recreated; built-in admin re-seeded per server logic
```

**Warning:** This destroys all projects, users, and audit history.

---

## Migration instructions (upgrading between releases)

1. **Back up** the SQLite file and `hoverboard.config.json`.
2. **Pull** the new application version and run **`npm install`** in root, `server`, and `client`.
3. **Review** `docs/configuration.md` for new or renamed keys.
4. **Start** the server once; migrations run on startup.
5. Run **`npm test`** at the repo root to validate your environment.
6. For production, rebuild the client: **`npm run build`** and deploy **`client/dist`** with your static server.

If you maintain forked SQL or custom triggers, diff `server/db.js` between releases.

---

## Production deployment (outline)

1. Run the **API** behind TLS; set **`NODE_ENV=production`**.
2. Serve **`client/dist`** from nginx/CDN or embed behind the same host with `/api` routed to Node.
3. Set **`auth.oidc.publicAppUrl`** (and related auth fields) to your real SPA URL.
4. Configure **OIDC redirect URI** to **`https://<api-host>/api/auth/callback`** (must match IdP registration).
5. Do **not** rely on built-in `admin` / `12345` in production; prefer SSO and disable **`auth.localLoginEnabled`** if policy requires.

---

## Next steps

- **[Authentication](authentication.md)** — Enable SSO or local login.
- **[Configuration](configuration.md)** — Tune metrics, regressions, branding.
