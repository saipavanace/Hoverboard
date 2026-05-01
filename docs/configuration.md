# Hoverboard configuration

Configuration merges defaults with `hoverboard.config.json` at the repository root (or the path in `HOVERBOARD_CONFIG`). Environment variables override sensitive deployment settings.

## File: `hoverboard.config.json`

| Key | Type | Description |
| --- | --- | --- |
| `projectName` | string | Shown in the shell header and exports. |
| `companyName` | string | Org label for reports / ISO bundles. |
| `requirementCategories` | string[] | Allowed **category** values for both DRs and VRs (shown in dropdowns; API rejects values not in this list). |
| `regressionRoots` | string[] | Relative or absolute directories scanned for `.log`, `.txt`, `.out` files when using **Scan regression paths**. Failure-like lines are extracted for binning previews. |
| `regressionParsers` | array of `{ name, regex }` | Per-line failure regexes used by `/api/regressions/ingest-directory` to classify a line as a failure (case-insensitive). Defaults: `FAIL`, `ERROR`, `ASSERT`, `timeout`, `UVM_FATAL`. |
| `coverageRegex.functional` | string[] | Regex sources whose **first capture group** is the functional coverage percent. JSON files containing `functional_coverage` / `fcov` keys are auto-detected. |
| `coverageRegex.code` | string[] | Same as above, for **code coverage**. |
| `vrLogRegex` | string | Regex source whose first capture group is a VR id (e.g. `VR-00012`). Default scopes to UVM_INFO/UVM_NOTE log lines. |
| `releaseMetricWeights` | object | Weights for the combined release score (must sum sensibly to ~1): |
| `releaseMetricWeights.passRate` | number | Weight for regression pass rate proxy. |
| `releaseMetricWeights.functionalCov` | number | Functional coverage term. |
| `releaseMetricWeights.codeCov` | number | Code coverage term. |
| `releaseMetricWeights.vrCov` | number | VR completion coverage. |
| `releaseMetricWeights.drClosure` | number | DR health / non-stale DR ratio term. |
| `branding.accent` | string (hex) | Primary accent used in navigation chrome. |
| `branding.logoUrl` | string \| null | Optional logo URL for future header branding. |

## Environment variables

| Variable | Description |
| --- | --- |
| `PORT` | API port (default `5179`). |
| `HOVERBOARD_DB_PATH` | SQLite file location (default `server/data/hoverboard.sqlite`). |
| `HOVERBOARD_CONFIG` | Alternate path to JSON config file. |

## Connecting regressions

Hoverboard reads from directories visible to the **API host**. Three endpoints are exposed for a directory like `/scratch/.../regression/<timestamp>/`:

- `POST /api/regressions/ingest-directory` — `{ "path": "..." }` walks the tree, applies `regressionParsers`, bins failures into signatures.
- `POST /api/coverage/ingest-directory` — `{ "path": "..." }` extracts functional + code coverage using `coverageRegex` (JSON files auto-detected).
- `POST /api/vr-coverage/scan-directory` — `{ "path": "...", "strictUvmInfo": true }` greps logs using `vrLogRegex`; matched VR IDs are credited as covered. **DR coverage is derived: a DR is covered when every linked VR is covered.**

If scratch lives on a remote server the API can't see, the recommended pattern is a **sync agent** (CI step or cron on the regression host) that:

1. Locates the regression directory and either rsyncs it into a path the API can read, or
2. Calls these HTTP endpoints directly with the in-host path.

## Changing configuration at runtime

Use **Settings** in the web UI to POST merged JSON to `/api/config`, which rewrites `hoverboard.config.json` on disk (same schema as above).
