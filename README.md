# Hoverboard

Hoverboard is a **private**, **project-independent** web application for managing design requirements (DRs), verification requirements (VRs), specification versioning, regression intelligence, and ISO 26262-oriented compliance workflows. The UI targets the same class of workflows as tools like Simscope—status dashboards, signature-style regression binning, diagnostics drill-downs, and release readiness—while remaining configurable for any team or codebase.

**Stack (planned):** React, JavaScript, responsive layout, automated test suite.

---

## Repository visibility

This repository is intended to remain **private**. Access is granted only to collaborators you invite or via shared links you control (e.g., deployment behind authentication). Configure visibility in your Git host (GitHub/GitLab/etc.) under repository settings.

---

## Vision

- Extremely **fast** and **beautiful** UI with excellent **UX** and **responsive** navigation on desktop and tablet.
- **Read-only** spec viewing in-app after upload (no editing inside Hoverboard).
- **Traceability** from spec text → DR → VR → regressions, metrics, and release projection.
- **Adaptive release readiness**: early projections are intentionally conservative (“infinite” horizon) and **tighten automatically** as real velocity and quality signals accumulate.

---

## Feature roadmap

Legend: `[ ]` not started · `[x]` implemented

### Core spec & documents

- [ ] **1.** Upload documents (Word, PDF); view them inside the app with **no in-app editing** after ingest.
- [ ] **2.** Select text or a line in the document and choose **Create DR**; store the excerpt with a **unique DR ID** in the database.
- [ ] **6.** Organize specs by **version**, **name**, and stable **identifier**; on **new version upload**, compute a **automatic change list** (diff summary).

### DR / VR model & linking

- [ ] **3.** Author **VRs** (verification requirements) describing how each DR is verified.
- [ ] **4.** Link **VR ↔ DR** via unique DR IDs (many-to-many: multiple DRs per VR, multiple VRs per DR).
- [ ] **5.** Each **VR** has its own **unique ID** plus structured metadata (see below).

**Suggested VR fields (initial):**

| Field | Purpose |
| --- | --- |
| Unique VR ID | Stable primary key |
| Title / summary | Short description |
| Status | e.g. draft, ready, in verification, blocked, done |
| Linked DR IDs | Many-to-many relation |
| Priority / severity | Triage |
| Owner / assignee | Responsibility |
| Location / scope | Block, subsystem, bench, env tag |
| Verification method | Simulation, formal, FPGA, lab, review |
| Target milestone / gate | Aligns with ISO or internal gates |
| Evidence links | Logs, reports, waiver refs |
| Last updated / last verified | Freshness |

### Stale workflow (spec changes)

- [ ] **7.** When the change list affects text tied to existing DRs, mark those DRs and **all linked VRs** as **stale** with **consistent color coding** (and clear UX copy explaining why).

### Quality, UX & engineering

- [ ] **8.** Maintain an **automated test suite** for the webapp (unit/integration/e2e as appropriate) that stays green as the product evolves.
- [ ] **9.** **Responsive** layout and **easy navigation** (information architecture, keyboard-friendly patterns where sensible).

### ISO 26262 mode & reporting

- [ ] **10.** **ISO 26262 tracking mode** with a **rich, commercially credible** feature set (examples below—not exhaustive):

  - Safety plan / safety case artifact templates and export (structured sections).
  - Traceability reports: requirement ↔ verification ↔ evidence ↔ anomaly / change history.
  - ASIL tagging at DR/VR level with filtering and gap analysis.
  - Verification review records: checklist states, approvers, timestamps.
  - Tool qualification / process evidence placeholders (configurable per org).
  - Audit trail: who changed what, when (immutable event log for compliance reviews).
  - Export bundles (PDF/HTML/CSV) suitable for external audits.

### Metrics, regressions & “Simscope-class” analytics

Inspired by the reference screens (status dashboard, signature trends, error diagnostics, automation narrative)—implement **at least** the following, with room to exceed them:

- [ ] **12.** Dashboard metrics: **functional coverage**, **VR coverage**, **DR coverage**, and related KPIs.
- [ ] **13.** Ingest and interpret **regression paths** / result roots from configurable inputs (CI artifacts, directory layouts, or APIs).
- [ ] **14.** **Automatic regression binning** (signature-like grouping of failures with IDs, trends, states, and drill-down).
- [ ] **15.** Parity-plus with reference tool UX patterns: executive **status dashboard**, **signature trends** table with sparklines and triage states, **error diagnostics** drill-down (histogram, activity log, linking to rules/issues), **insights** (temporal, cross-block, ownership, shortest fails, links to bugs/check-ins/config/regressions/branches/builds). Aim for **clearer hierarchy, faster load, and saner defaults** than the references.

### Release readiness & projection

- [ ] **17.** A **single management-facing progress indicator** combining regression pass rate, functional coverage, code coverage, VR coverage, DR closure, and other configurable weights into **one release-distance score** with explanation (what moves the needle).
- [ ] **18.** **Adaptive projected release date**: early in the program the horizon stays **very uncertain** (effectively unbounded / “TBD”); as progress and cadence stabilize, the model **rapidly adapts** using historical throughput and quality gates—always surfacing **confidence** alongside the date.

### Configuration & multi-tenant portability

- [ ] **16.** **Project-independent** operation: fast onboarding via config (YAML/JSON/env) for project name, ID schemes, regression roots, coverage formats, issue tracker hooks, gates, weights for the release metric, and branding. **Document every configuration key** in-repo (e.g. `docs/configuration.md` once created).

---

## Technical notes (non-functional)

- **Privacy:** Keep the repo private; use authenticated deployment for any shared preview URLs.
- **Documents:** Word/PDF rendering is typically done via conversion or viewer libraries—implementation choices will respect read-only and audit requirements.
- **Performance:** Lazy routes, code splitting, memoization, and efficient table/virtualization for large signature lists.

---

## Development status

| Area | Status |
| --- | --- |
| React app scaffold | Not started |
| Backend / API | Not started |
| Database schema (DR/VR/spec versions) | Not started |
| Authentication / access control | Not started |

---

## License

Specify your license when ready (private/internal products often use a proprietary or custom license).

---

## Contributing

Internal contributors only; follow branch protection and review rules defined for this repository.
