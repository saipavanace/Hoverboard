# Audit and baselines

Hoverboard supports **append-only audit history** and **baseline** concepts for teams demonstrating **what changed**, **when**, and **under which snapshot** of the program.

---

## Audit trail

### Events

Actions such as logins, DR/VR mutations, uploads, comments, and approvals append rows to persisted audit structures (see **`audit_events`** / mirrored **`audit_log`** in the server). Events typically include:

- **Actor** (user id or system)
- **Action** code (e.g. `LOGIN`, `COMMENT_CREATE`, `APPROVAL`)
- **Entity** type and id
- **Detail** JSON for context
- **Timestamp**

### Running audit checks

**In the UI:** Use the **Audit** navigation entry inside a project to browse recent activity (exact columns depend on version).

**Operationally:** Export or query SQLite **`audit_events`** for integration with SIEM or quarterly reviews — ensure **backup** strategy covers the DB file.

---

## Audit reports

There is no single PDF “audit report” button mandated by core docs — many teams combine:

1. **CSV / SQL export** of **`audit_log`** / **`audit_events`** for a date range.
2. **Artifact approval** listings with **signature hashes** from **[reviews_and_approvals.md](reviews_and_approvals.md)**.
3. **Requirement exports** (project-specific tooling may add PDF bundles).

---

## Baselines and snapshots

**Baselines** (see Admin **baselines** tab / API) represent recorded **program milestones** — e.g. “release candidate B” — against which you compare metrics or trace completeness.

**Typical use:**

1. Record a baseline at a gate **before** major spec churn.
2. Compare **DR closure**, **VR coverage**, or regression metrics **after** changes.

Implementation details follow **`baselines`** table contents in your deployment.

---

## Reproducibility

To **reproduce** an assessment months later:

1. **Database backup** from that date (or tagged migration).
2. **Configuration file** (`hoverboard.config.json`) revision from source control.
3. **Tool versions** (Node, Hoverboard commit hash) documented in your QMS.

Artifact **version hashes** and **approval signatures** provide **content-level** reproducibility without restoring the whole DB for read-only verification.

---

## Related documentation

- **[Architecture](architecture.md)** — Where audit tables live.
- **[Installation](installation.md)** — Backup path for SQLite.
