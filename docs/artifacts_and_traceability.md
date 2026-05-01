# Artifacts and traceability

Hoverboard models requirements and verification as **artifacts** in a graph while keeping familiar **DR** and **VR** identifiers for users and APIs.

---

## Artifact model (DR, VR, …)

### Legacy tables (user-facing IDs)

- **`drs`** — Design requirements linked to a **spec_version**. Each row has a **`public_id`** (e.g. `DR-00001`).
- **`vrs`** — Verification requirements with **`public_id`** (e.g. `VR-00002`), metadata (status, priority, ASIL, …), and **`project_id`**.
- **`vr_dr_links`** — Many-to-many links between VRs and DRs.

### Graph tables (internal consistency)

- **`artifacts`** — Canonical record per DR/VR with **`artifact_type`**, **`project_id`**, **`external_id`** (matches public ID string).
- **`artifact_versions`** — Immutable content snapshots (**`content_json`**, hash).
- **`artifact_links`** — Directed relationships between artifacts with **`link_status`**.

**Legacy sync:** New or legacy DR/VR rows without **`artifact_id`** are **backfilled** into **`artifacts`** / **`artifact_versions`** by a sync step so comments and approvals attach to the graph.

---

## Versioning system

### Specifications

Each **spec** has ordered **spec_versions**: uploaded file, MIME type, **extracted_text**, **changelog** JSON (diff summary vs previous version).

Uploading a **new version**:

1. Computes change summary vs prior extracted text.
2. Updates **`latest_version_id`** on the spec.
3. May **mark DRs** (and linked VRs) **stale** when impacted text changes — see **Stale workflow** below.

### Artifacts (DR/VR)

Artifact **versions** capture structured **`content_json`** and a **content hash**. Approvals reference **`artifact_version_id`** so decisions bind to a specific revision.

---

## Traceability links

**`artifact_links`** connect artifacts (e.g. **VR verifies DR**). Each link has:

| Column | Purpose |
| --- | --- |
| **`link_type`** | Semantic relationship |
| **`link_status`** | **`valid`** or **`suspect`** |
| **`suspect_reason`** | Short machine-readable reason |

Links are created when the application establishes trace relationships between DR and VR artifacts.

---

## Suspect link behavior

When an **upstream** artifact changes version, outgoing trace links may be marked **suspect** so reviewers know downstream assumptions might be invalidated.

Implementation sketch:

- **Upstream change** → **`markOutgoingLinksSuspect(sourceArtifactId)`** sets **`link_status = 'suspect'`** on outgoing links that were **`valid`**.
- Separate helpers can mark **incoming** links when a target changes.

**Operational meaning:** Suspect links are **not** deleted — they flag **human review**: confirm the VR still verifies the DR after spec changes, then clear or update links per your process.

---

## Evidence management

### VR evidence links

VR rows carry **`evidence_links`** (structured references — URLs, paths, ticket IDs depending on how your team encodes them).

### Uploaded evidence files

The evidence subsystem stores files with SHA-256 dedupe and attaches them to artifacts per API routes under **`/api/projects/:projectId/evidence`** (see server **evidence** routes). Use this for formal attachments (logs, reports).

### Regression / coverage as evidence of execution

Ingesting regressions and coverage updates **metrics** and **VR coverage hits** (via **`vrLogRegex`** matching log lines). That supports **demonstration** that verification ran — complementary to narrative evidence links.

---

## End-to-end traceability story

**Example workflow:**

1. **Spec v3** uploaded → changelog identifies paragraph edits.
2. **DR-0012** tied to an excerpt → marked **stale** if the excerpt changed.
3. **VR-0040** linked to DR-0012 → may inherit stale signaling for planning.
4. Engineer updates VR text → new **artifact version**; **approval** records bind to that version hash.
5. **Regression ingest** shows VR-0040 referenced in logs → coverage metric improves.

Auditors can follow: **spec version → DR → VR → links → approvals → audit events**.

---

## Related documentation

- **[Reviews and approvals](reviews_and_approvals.md)** — Sign-off on artifact versions.
- **[Comments](comments.md)** — Discussion on **`artifact_id`**.
- **[Architecture](architecture.md)** — Schema overview.
