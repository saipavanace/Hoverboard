# Docker quickstart (no Node.js on the host)

Use this path when you run **Linux** (or any OS) and **do not** want to install Node.js locally. Everything runs inside containers; you only need **Docker** and **Docker Compose**.

---

## Prerequisites

| Requirement | Notes |
| --- | --- |
| **Docker Engine** | 20.10+ recommended |
| **Docker Compose** | v2 (`docker compose` plugin) |

Verify:

```bash
docker --version
docker compose version
```

---

## Run Hoverboard in one command

From the **repository root** (where `docker-compose.yml` lives):

```bash
docker compose up -d --build
```

| Item | Default |
| --- | --- |
| **URL** | [http://localhost:8080](http://localhost:8080) — UI and API on **one port** |
| **Host port** | `8080` → container `5179` |

Use another host port:

```bash
HOVERBOARD_HTTP_PORT=3000 docker compose up -d --build
```

Stop:

```bash
docker compose down
```

Data survives `down` because it lives in a **Docker volume** (`hoverboard_data`), not in the container filesystem.

---

## What gets persisted

| Path in container | Contents |
| --- | --- |
| **`/data/hoverboard.sqlite`** | SQLite database (`HOVERBOARD_DB_PATH`) |
| **`/data/uploads`** | Uploaded spec/evidence files (`HOVERBOARD_UPLOADS_DIR`) |

Both sit on the **`hoverboard_data`** volume unless you change `docker-compose.yml`.

---

## Configure SSO, branding, and safety limits

1. Copy the sample config and edit:

   ```bash
   cp hoverboard.config.json my-config.json
   # Edit OIDC / LDAP / auth settings — see authentication.md and configuration.md
   ```

2. Mount it in **`docker-compose.yml`** (uncomment and adjust):

   ```yaml
   volumes:
     - hoverboard_data:/data
     - ./my-config.json:/app/hoverboard.config.json:ro
   ```

3. Recreate the container:

   ```bash
   docker compose up -d --build
   ```

Alternatively set **`HOVERBOARD_CONFIG`** to a path inside the container and mount a **directory** containing your JSON.

See **[authentication.md](authentication.md)** for Azure AD, Google, Okta, and LDAP. See **[configuration.md](configuration.md)** for every key.

---

## Environment variables (Docker)

These are already set in `docker-compose.yml`; override as needed:

| Variable | Purpose |
| --- | --- |
| **`HOVERBOARD_DB_PATH`** | SQLite file (default `/data/hoverboard.sqlite`) |
| **`HOVERBOARD_UPLOADS_DIR`** | Upload storage (default `/data/uploads`) |
| **`HOVERBOARD_CONFIG`** | Optional alternate path to JSON config |
| **`PORT`** | Inside container (default `5179`); map host port with `HOVERBOARD_HTTP_PORT` |

---

## TLS and reverse proxies

For HTTPS in production, put **nginx**, **Traefik**, or a cloud load balancer **in front** of the published port. Forward:

- **HTTP(S)** to the container port you mapped (e.g. `8080`).
- Ensure **`auth.oidc.redirectUri`** and **`auth.publicAppUrl`** in config match your real public URLs.

---

## Troubleshooting

| Issue | What to try |
| --- | --- |
| **Port in use** | Set `HOVERBOARD_HTTP_PORT` to a free port |
| **Blank page** | Ensure image was built with `docker compose build`; client is baked into the image |
| **Lost data** | Don’t use `docker compose down -v` — that **deletes** named volumes |
| **Permission errors on `/data`** | On Linux with rootless Docker, check volume ownership |

More help: **[troubleshooting.md](troubleshooting.md)** and **[installation.md](installation.md)**.

---

## Development vs Docker

| Goal | Approach |
| --- | --- |
| **Hack on code** | Install Node 20+ and use `npm run dev` (see root **README.md**) |
| **Run a shared server** | Use this Docker flow |

The Docker image runs **`NODE_ENV=production`** and serves the **built** SPA from `client/dist` together with the API.
