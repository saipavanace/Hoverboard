# Hoverboard

Hoverboard is a web application for **hardware/software verification–oriented teams** who need traceability from specifications through **design requirements (DRs)** and **verification requirements (VRs)** to regressions, metrics, evidence, and audit-ready records. It supports **multi-project workspaces**, **role-based access**, optional **SSO (OIDC)**, an **artifact graph** for traceability, **threaded comments**, **approvals with independence rules**, and **ISO 26262–style** reporting hooks.

**Stack:** React (Vite), Express API, SQLite (better-sqlite3), Vitest.

---

## Features

| Area | Capabilities |
| --- | --- |
| **Specifications** | Upload PDF/Word; versioned ingests; change summaries between versions; read-only in-app viewing |
| **DRs / VRs** | Stable public IDs (e.g. `DR-00001`, `VR-00001`); categories, ASIL, linking many-to-many |
| **Traceability** | Artifact graph (DR/VR as artifacts), links between artifacts, **suspect** links when upstream changes |
| **Quality & CI** | Regression directory ingest, signature-style binning, coverage ingestion, VR hit detection from logs |
| **Release** | Combined readiness score and adaptive projection from configurable weights |
| **Collaboration** | Comments on artifacts with author identity; resolve workflow |
| **Governance** | Audit trail, baselines, sign-off rules (role + independence I0–I3), approval hashes |
| **Administration** | Users, global/project roles, teams/hierarchy, project access — **system administrators** manage directory-level functions |

---

## Quick start

### Option A — Node.js on your machine (development)

**Prerequisites:** Node.js **20+**, npm.

From the repository root:

```bash
npm install
npm install --prefix server
npm install --prefix client
npm run dev
```

| Service | URL |
| --- | --- |
| **Web UI** | [http://localhost:5173](http://localhost:5173) — proxies `/api` and `/uploads` to the API |
| **API** | [http://localhost:5179](http://localhost:5179) — set `PORT` to change |

### Option B — Docker only (no Node on the host)

**Prerequisites:** [Docker](https://docs.docker.com/get-docker/) and Docker Compose v2.

```bash
docker compose up -d --build
```

Open **[http://localhost:8080](http://localhost:8080)** — UI and API on one port. Database and uploads persist in a Docker volume. Full steps: **[Docker quickstart](docs/docker-quickstart.md)**.

---

1. Open the web app; sign in (see [Authentication](docs/authentication.md)).
2. On first visit after login, use **Open projects** to pick a workspace or **Create project** to start fresh (optionally **start from** an existing project to copy structure).
3. Inside a project: **Specs**, **Design requirements**, **Verification**, **Dashboard**, etc.

**Built-in administrator (local/password):** username **`admin`**, password **`12345`** — seeded when the server starts; intended for initial setup and small deployments. Change operational policy via SSO and disable local login in production if required.

**Tests and production build:**

```bash
npm test              # client + server tests
npm run build           # client bundle → client/dist
npm start               # production API; also serves client/dist when built (NODE_ENV=production)
```

For production without installing Node on the server, use **`docker compose`** — see **[docs/docker-quickstart.md](docs/docker-quickstart.md)**.

---

## UI overview

- **Project hub** (`/projects`): Lists projects you can access; **Create project** adds a new workspace. The header offers **Open projects** and **Create project** while you work inside a project so you can return here anytime.
- **Project workspace**: Sidebar navigation — Dashboard, Specs, DRs, VRs, Signatures, Regressions, ISO 26262, Audit, Settings. **Admin** (system administrators) appears in the header for administration pages scoped to the current project route.
- **Specs**: Upload and version documents; create DRs from selections.
- **DRs / VRs**: Tables and detail flows; traceability and stale marking when specifications change.
- **Dashboard**: Metrics and release readiness snapshot.

Screenshots can be added under `docs/images/` in your deployment; the UI uses a responsive shell with light/dark theme toggle.

---

## Documentation

Full documentation for adopters and administrators:

| Document | Description |
| --- | --- |
| [Documentation index](docs/README.md) | Central map of all guides |
| [Installation](docs/installation.md) | Prerequisites, env vars, database, running services |
| [Docker quickstart](docs/docker-quickstart.md) | Run without Node on the host; compose, volumes, SSO config |
| [Authentication](docs/authentication.md) | SSO (Azure AD, Google, Okta, generic OIDC), local login |
| [Admin guide](docs/admin_guide.md) | Users, roles, teams, sign-off rules |
| [Project guide](docs/project_guide.md) | Projects, switching, import, settings |
| [Artifacts & traceability](docs/artifacts_and_traceability.md) | DR/VR model, versioning, links, evidence |
| [Reviews & approvals](docs/reviews_and_approvals.md) | Approvals, independence, signatures |
| [Comments](docs/comments.md) | Collaboration on artifacts |
| [Audit & baselines](docs/audit_and_baselines.md) | Compliance-oriented features |
| [Configuration](docs/configuration.md) | Full config schema |
| [Troubleshooting](docs/troubleshooting.md) | Common errors and fixes |
| [Architecture](docs/architecture.md) | System design and data model |

Legacy reference: [Platform security](docs/platform-security.md) (overlap with authentication and RBAC; prefer the guides above for onboarding).

---

## Security note

Do not expose the API to the public internet without **TLS**, **authentication enabled**, and **review of default credentials**. Use SSO in production where possible.

---

## License

Specify your organization’s license (proprietary, internal use, etc.).

---

## Contributing

Internal contributors: follow your team’s branch protection and code review rules.
