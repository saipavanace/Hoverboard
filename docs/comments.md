# Comments

Discussion on artifacts enables **peer review**, **clarification**, and **resolution tracking** without altering requirement identifiers.

---

## Where comments live

Comments attach to **artifacts** (`artifact_id`) in **`artifact_comments`**. The UI loads them via graph APIs (e.g. **`GET /api/graph/artifacts/:artifactId/comments`**).

DR and VR **legacy tables** sync into artifacts, so DR/VR detail views resolve **`artifact_id`** and show the same thread.

---

## Adding comments

1. Open a **DR** or **VR** (or **artifact detail**) where your role includes **`comments_write`** for that project.
2. Enter text in the discussion panel and submit.
3. The server records **`author_user_id`** and timestamp.

**Identity:** The list shows **`display_name`** and email-derived labels so **everyone with read access** sees **who** said what — supporting transparent collaboration.

---

## Resolving comments

Users with **`comments_write`** may **resolve** a comment when the concern is addressed:

- Resolved comments show a **resolved** badge in the UI.
- Resolution is stored on the comment row (`resolved`, resolver user, timestamp per schema).

**Tip:** Use resolution for **actionable** threads (questions answered, scope clarified). Leave informational notes unresolved if your process does not require closure.

---

## Collaboration workflow (example)

**Scenario:** VR-0020 must clarify verification environment.

1. **Reviewer** posts: “Please confirm stimulus matches production IO mapping.”
2. **Author** updates VR text (new **artifact version**) and replies in comments with rationale.
3. **Reviewer** clicks **Resolve** after verifying the new version.
4. **Approver** proceeds under **[reviews_and_approvals.md](reviews_and_approvals.md)** rules.

---

## Permissions

| Action | Typical permission |
| --- | --- |
| View comments | **`specs_read`** / artifact read path for the project |
| Post / resolve | **`comments_write`** |

Global **auditor** roles may have read-only access to traces depending on deployment — confirm with your **[admin guide](admin_guide.md)** roles.

---

## Related documentation

- **[Artifacts and traceability](artifacts_and_traceability.md)** — Artifact IDs and DR/VR linkage.
- **[Reviews and approvals](reviews_and_approvals.md)** — After discussion stabilizes content.
