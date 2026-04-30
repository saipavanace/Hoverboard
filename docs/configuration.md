# Hoverboard configuration

Configuration merges defaults with `hoverboard.config.json` at the repository root (or the path in `HOVERBOARD_CONFIG`). Environment variables override sensitive deployment settings.

## File: `hoverboard.config.json`

| Key | Type | Description |
| --- | --- | --- |
| `projectName` | string | Shown in the shell header and exports. |
| `companyName` | string | Org label for reports / ISO bundles. |
| `regressionRoots` | string[] | Relative or absolute directories scanned for `.log`, `.txt`, `.out` files when using **Scan regression paths**. Failure-like lines are extracted for binning previews. |
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

## Changing configuration at runtime

Use **Settings** in the web UI to POST merged JSON to `/api/config`, which rewrites `hoverboard.config.json` on disk (same schema as above).
