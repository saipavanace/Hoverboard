# SpecPilot

**SpecPilot** is a project feature that **answers questions about your uploaded specifications** using retrieved text from your docs plus a **language model (LLM)**. Answers are **grounded** in indexed spec chunks; the model is used to synthesize a structured response (citations, gaps, suggested actions), not to invent protocol facts from memory.

This page covers **how it works**, **how to enable it**, and **how operators set environment variables** on the Hoverboard **API server**.

---

## What you do in the UI

1. **Upload specs** the same way you already do: **Specifications** (or your project’s spec upload flow). SpecPilot does **not** replace that; it reads the same versioned spec content the system already stores.
2. Open **SpecPilot** in the app.
3. **Select** which spec version(s) to search (your team’s UI may list versions in a **Specifications** panel on SpecPilot).
4. Click **Reindex** for each version you want SpecPilot to use. **Uploading alone is not enough** — the server must **chunk and index** text (and optional embeddings) for that version. Wait until indexing shows **ready** (or your UI’s success state) before asking questions.
5. Enter a **question** and run **Ask**. If nothing matches strongly, the system may still return **breadth** context (early chunks) so the model can say what is or is not in the retrieved text.

If you see a message that the **model is not configured**, that is a **server API key** issue (see below), not missing PDFs.

---

## Why “Reindex” matters

- **Specifications** tab: stores files and extracted text.
- **SpecPilot Reindex**: builds **searchable chunks** (and embeddings when configured) tied to each **spec version**. Questions only search **indexed** content for the versions you select.

If you skip Reindex, SpecPilot has nothing (or too little) to retrieve.

---

## Server setup: API key (required)

SpecPilot needs an **OpenAI-compatible** chat API and, for best hybrid search, **embeddings** from the same ecosystem.

**Default configuration:** set **`OPENAI_API_KEY`** on the **process that runs the Hoverboard server** (same variable many tools use for OpenAI). Restart the server after changing environment variables.

| Variable | Required | Purpose |
| --- | --- | --- |
| **`OPENAI_API_KEY`** | **Yes** (for full SpecPilot behavior) | Authenticates **chat completions** and **embeddings** unless you override embedding settings below. |

Create a key in the [OpenAI API keys](https://platform.openai.com/api-keys) dashboard (Platform account, not the same as only using ChatGPT in a browser). Treat it as a **secret**: use your host’s secret store, `.env` files excluded from git, or Docker secrets — never commit keys.

---

## Optional environment variables

These tune endpoints and models. Defaults target **OpenAI**’s HTTP API.

| Variable | Effect |
| --- | --- |
| **`OPENAI_BASE_URL`** | If set (no trailing slash), chat URL becomes `{OPENAI_BASE_URL}/chat/completions` and embeddings `{OPENAI_BASE_URL}/embeddings` unless overridden below. Use this for many OpenAI-compatible proxies. |
| **`SPECPILOT_LLM_URL`** | Full URL for **chat completions** (overrides `OPENAI_BASE_URL` default for chat). |
| **`SPECPILOT_LLM_MODEL`** | Chat model id (default **`gpt-4o-mini`**). |
| **`SPECPILOT_EMBEDDING_URL`** | Full URL for **embeddings** (default OpenAI embeddings endpoint or derived from `OPENAI_BASE_URL`). |
| **`SPECPILOT_EMBEDDING_API_KEY`** | Separate API key for embeddings only (rare; defaults to **`OPENAI_API_KEY`**). |
| **`SPECPILOT_EMBEDDING_MODEL`** | Embedding model id (default **`text-embedding-3-small`**). |
| **`SPECPILOT_TOP_K`** | Max chunks passed into the prompt (default **10**). |
| **`SPECPILOT_MAX_CONTEXT_CHARS`** | Cap on total context size sent to the model. |
| **`SPECPILOT_VECTOR_WEIGHT`** / **`SPECPILOT_KEYWORD_WEIGHT`** | Hybrid retrieval blend (keyword FTS vs vector similarity), **0–1** style weights in code defaults. |

If **`OPENAI_API_KEY`** is unset, SpecPilot can still **list versions** and **reindex**, but **Ask** returns a **not configured** response instead of a synthesized answer.

---

## Retrieval behavior (short)

- **Keyword search** uses SQLite **FTS** over chunked text.
- **Vector search** (when embeddings exist and the embedding key works) combines with keywords for **hybrid** ranking.
- If a strict match returns nothing but chunks exist for your selection, the service may use a **breadth fallback** (early chunks) so the LLM can respond honestly about what was retrieved.

---

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| “SpecPilot model is **not configured**” | **`OPENAI_API_KEY`** on the API host; restart server. |
| “Nothing indexed” / empty retrieval | Run **Reindex** for the spec version; confirm status is **ready**. |
| Answers feel irrelevant | Rephrase using terms from the spec; narrow or widen selected versions. |
| LLM HTTP errors | Key validity, billing/quota, **`SPECPILOT_LLM_URL`** / **`OPENAI_BASE_URL`**, and outbound HTTPS from the server. |

---

## Related documentation

- **[Configuration reference](configuration.md)** — Global `hoverboard.config.json` keys (separate from SpecPilot env vars).
- **[Installation](installation.md)** — Where to set environment variables for dev and production.
- **[Project guide](project_guide.md)** — Spec uploads and project workflow.
