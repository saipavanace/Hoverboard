# Hoverboard documentation

Welcome. These guides are written for **end users**, **project leads**, and **platform administrators** adopting Hoverboard at a new organization. No prior knowledge of this product is assumed.

## Start here

1. **[Installation](installation.md)** — Get the application running in development or production.
2. **[Authentication](authentication.md)** — Sign-in options: enterprise SSO or local accounts.
3. **[Project guide](project_guide.md)** — Create a project and day-to-day navigation.

## By role

| If you… | Read |
| --- | --- |
| Install or operate the server | [Installation](installation.md), [Configuration](configuration.md), [Troubleshooting](troubleshooting.md) |
| Manage users and policies | [Admin guide](admin_guide.md), [Authentication](authentication.md) |
| Author requirements and verification | [Project guide](project_guide.md), [Artifacts & traceability](artifacts_and_traceability.md) |
| Run reviews / approvals | [Reviews & approvals](reviews_and_approvals.md), [Comments](comments.md) |
| Support audits | [Audit & baselines](audit_and_baselines.md), [Artifacts & traceability](artifacts_and_traceability.md) |

## End-to-end workflow (example)

A typical flow from requirement to audit evidence:

1. **Upload** a specification and create **DRs** from excerpts ([Project guide](project_guide.md), [Artifacts](artifacts_and_traceability.md)).
2. Author **VRs** and **link** them to DRs.
3. Run **regression / coverage** ingest so VR and DR coverage metrics update ([Configuration](configuration.md) for paths and regex).
4. Discuss in **comments**; resolve threads when addressed ([Comments](comments.md)).
5. Obtain **approvals** under your **sign-off rules** (roles + independence) ([Reviews & approvals](reviews_and_approvals.md)).
6. Rely on the **audit trail** and **baselines** for reproducibility ([Audit & baselines](audit_and_baselines.md)).

## Reference

- **[Architecture](architecture.md)** — How the server, database, and artifact graph fit together.
- **[Configuration](configuration.md)** — Every configuration key.
- **[Troubleshooting](troubleshooting.md)** — SSO, permissions, approvals.

---

*Documentation version aligns with the repository; when upgrading between releases, re-read Installation and Configuration for breaking changes.*
