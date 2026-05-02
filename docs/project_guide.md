# Project guide

A **project** (workspace) groups specifications, DRs, VRs, metrics, and settings. Your account must have at least one **project role** on a project to use its data.

---

## Creating a project

1. Sign in and open the **Projects** hub (`/projects`).
2. Click **Create project** (`/projects/new`).
3. Enter a **name** and optional **description**.
4. Optionally choose **Start from existing project** to **clone** structure from another workspace you can read (specs with files, DRs, VRs, links — see server **project clone** behavior).

After creation you become **project_admin** for that project and are taken into the project **dashboard**.

---

## Switching projects

Hoverboard is designed so you **explicitly choose** a workspace:

- Use **Open projects** in the header to return to **`/projects`**.
- Click a project card to enter it; the app stores the active project for API calls (**`X-Project-Id`**).

There is **no** project drop-down in the header anymore — navigation favors clarity between **Open projects** and **Create project**.

---

## Importing data

### Specifications

Inside **Specs**:

1. **Create** a specification record (identifier, name, folder optional).
2. **Upload** a new **version** (PDF, Word, etc.). The system extracts text for diffing and DR anchoring.

### Design requirements (DRs)

From the spec viewer or DR flows, create DRs tied to a **spec version**. Each DR gets a stable **public ID** (e.g. `DR-00042`).

### Verification requirements (VRs)

Under **Verification**, create VRs and **link** them to one or more DRs.

### Bulk / directory imports (CI side)

For regressions and logs (not a single UI wizard):

- Configure **`regressionRoots`** and parsers in **[configuration.md](configuration.md)**.
- Use API endpoints such as **`POST /api/regressions/ingest-directory`** with paths visible to the **API server**.

Data paths must be readable by the process running Node — mount shares or use an agent if regressions run elsewhere.

### Clone from existing project

Use **Create project → Start from existing project** to duplicate requirements structure without re-keying. Evidence and comments may not fully duplicate — treat clone as a **structural** starting point.

---

## Managing project configurations

### In-app Settings

The **Settings** page under a project can update merged configuration via **`PUT /api/config`** (requires permission). This rewrites **`hoverboard.config.json`** on the server.

### Categories and metrics

- **`requirementCategories`** — Allowed DR/VR **category** values; may be a flat string list or a nested tree (see **`docs/configuration.md`**). Stored values use path strings such as `Group / Item`. Invalid values are rejected by the API.
- **`releaseMetricWeights`** — How the dashboard combines pass rate, coverage, DR closure, etc.

### Branding

- **`branding.accent`**, **`branding.logoUrl`** — UI accent and optional logo (future/header use depends on UI version).

### Regression and coverage

Point **`regressionRoots`** at directories to scan; tune **`regressionParsers`**, **`coverageRegex`**, **`vrLogRegex`** to match your tool outputs.

---

## Workflow summary

```text
Projects hub → Open project OR Create project
    → Dashboard / Specs / DRs / VRs / …
    → Header: Open projects | Create project (return anytime)
```

---

## Related documentation

- **[Artifacts and traceability](artifacts_and_traceability.md)** — DR/VR meaning and links.
- **[Configuration](configuration.md)** — All keys.
- **[Audit and baselines](audit_and_baselines.md)** — Snapshots for your project.
