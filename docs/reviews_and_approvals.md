# Reviews and approvals

Hoverboard supports **structured approvals** on artifact versions with **role gates** and **independence rules** suitable for safety-oriented processes (e.g. ISO 26262-style separation of roles).

---

## Review workflow (conceptual)

1. **Author** creates or updates a DR/VR; content is stored as an **artifact version**.
2. **Reviewers** inspect diffs, comments, and trace links (possibly **suspect** after upstream changes).
3. **Approver** (per policy) records an **approval** decision on the **current artifact version**.
4. **Audit** stores who approved, when, and a **signature hash** over version identity + user + time.

Exact UI placement depends on your build; approvals are exposed via **`/api/graph/artifacts/:artifactId/approvals`** patterns (see server **platform** routes).

---

## Approval flow (technical)

When an approval is submitted:

1. Server loads **artifact**, **current artifact_version**, and **signoff_rules** for the **project**.
2. **`evaluateSignoff`** checks each **enabled** rule matching artifact type and ASIL.
3. If all checks pass, an **`artifact_approvals`** row is inserted with a **SHA-256** **`signature_hash`** derived from version hash, user, and timestamp.

If any rule fails, the API returns **400** with a **reason** string.

---

## Digital signatures

**`signature_hash`** is computed from stable fields (`artifact_version_id`, `user_id`, timestamp, `content_hash`) so the record **binds** the approval to a specific content revision — not merely to the artifact ID.

Store export bundles with audit logs for external assessors.

---

## Independence rules (I0–I3)

Rules are configured per **project** in **`signoff_rules.independence_level`** (integer **0–3**). The evaluation engine applies **stricter** checks as the level increases:

| Level | Meaning (implemented behavior) |
| --- | --- |
| **I0** | Role and author/approver policy only; no extra independence constraints beyond **`allow_author_approval`**. |
| **I1** | Approver must **not** be the **same user** as the author when policy requires independence (paired with **`allow_author_approval`** semantics). |
| **I2** | Requires **different `team_id`** between approver and author when both have teams assigned (organization separation). |
| **I3** | Stricter: **same department** or **shared management chain** between approver and author causes failure — intended to approximate independence from management influence. |

**Note:** Independence uses **`users.team_id`**, **`users.department`**, and **`manager_user_id`** chain walking — maintain accurate **Admin** user data for meaningful I2/I3.

---

## Common approval failures and fixes

| Message / situation | Cause | Fix |
| --- | --- | --- |
| **Approver needs role at least: …** | User lacks **`required_project_role`** strength | Grant **approver** (or higher) on the project |
| **Author cannot approve** | Rule has **`allow_author_approval: false`** | Have a different user approve |
| **Independence I1** | Approver same as author | Choose another approver |
| **Independence I2** | Same **team** as author | Move approver to another team or adjust teams |
| **Independence I3** | Same department or reporting chain | Assign approver outside department/chain |
| **No rules** | Empty **`signoff_rules`** | Engine returns **ok** — add rules if you expect enforcement |

---

## Example narrative (DR → VR → test → approval → audit)

1. **DR-0007** created from spec text; synced to artifact **A₁**.
2. **VR-0015** written to verify DR-0007; artifact **A₂** linked to **A₁**.
3. CI ingests logs; VR-0015 gains **coverage** hits — supports review.
4. **Approver** (not the author, correct role, passes I2) approves **A₂** current version → **`artifact_approvals`** row + **signature_hash**.
5. **Audit** lists `COMMENT_CREATE`, `APPROVAL`, etc., for assessors.

---

## Related documentation

- **[Admin guide](admin_guide.md)** — Configure **`signoff_rules`**.
- **[Audit and baselines](audit_and_baselines.md)** — Evidence of decisions over time.
