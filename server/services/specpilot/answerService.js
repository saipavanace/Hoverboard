import crypto from 'crypto';
import { chatCompletion } from './llmProvider.js';
import { getSpecpilotEnv } from './config.js';
import { validateAnswerJson, notFoundAnswer, notFoundLlmNotConfiguredAnswer } from './answerValidation.js';

const SYSTEM_PROMPT = `You are SpecPilot, a bounded specification QA assistant for hardware verification.
You must answer only using the provided context chunks and linked Hoverboard artifacts.
Do not use general knowledge.
Do not guess.
Every factual claim must cite a source chunk or artifact identifier.
If the answer is not supported by the provided context, set status to "not_found" and shortAnswer to "Not found in uploaded specs."
If information is partial, set status to "partially_answered" and explain what is missing.
Prefer precise engineering language.
Keep uncertainty visible.
Return a single JSON object matching the schema exactly (no markdown fences).`;

function stripJsonFence(s) {
  let t = String(s || '').trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  return t.trim();
}

function formatChunksForPrompt(chunks, maxChars) {
  let used = 0;
  const parts = [];
  for (const c of chunks || []) {
    const block = [
      `chunk_id: ${c.chunk_id}`,
      `document: ${c.document_name}`,
      `section: ${c.section_path}`,
      `pages: ${c.page_start ?? '?'}–${c.page_end ?? '?'}`,
      `text:\n${c.text}`,
    ].join('\n');
    if (used + block.length > maxChars) break;
    parts.push(block);
    used += block.length;
  }
  return parts.join('\n\n---\n\n');
}

function formatArtifacts(a) {
  if (!a) return '(none)';
  return JSON.stringify(a, null, 2).slice(0, 12000);
}

/**
 * @returns {Promise<object>}
 */
export async function generateAnswer(params) {
  const env = getSpecpilotEnv();
  const { question, chunks, artifacts, strictCitationsOnly, retrievalMeta } = params;

  if (!chunks?.length) {
    const meta = retrievalMeta || {};
    let reason;
    if (meta.emptySelection) {
      reason =
        'No spec versions were selected. Choose at least one version in the Specifications list on SpecPilot, then ask again.';
    } else if ((meta.indexed_chunk_count ?? 0) === 0) {
      reason =
        'Nothing is indexed for the current document scope. Upload the PDF under Specifications, then run Reindex for that version so SpecPilot can search it.';
    } else {
      reason =
        'No chunks were assembled for this question. Try rephrasing with wording from the spec, or check that the right versions are selected.';
    }
    return {
      answer: notFoundAnswer(reason),
      model: null,
    };
  }

  if (!env.llmKey) {
    return {
      answer: notFoundLlmNotConfiguredAnswer(),
      model: null,
    };
  }

  const context = formatChunksForPrompt(chunks, env.maxContextChars);
  const userMsg = `Question:
${question}

Retrieved spec context:
${context}

Linked Hoverboard artifacts:
${formatArtifacts(artifacts)}

Strict citations only: ${strictCitationsOnly ? 'true' : 'false'}

Return JSON with this schema:
{
  "status": "answered" | "partially_answered" | "not_found",
  "shortAnswer": "string",
  "detailedAnswer": "string",
  "keyRules": [ { "rule": "string", "evidence": [ { "sourceType": "spec_chunk", "sourceId": "string", "documentName": "string", "sectionPath": "string", "pageStart": number, "pageEnd": number } ], "confidence": "high" | "medium" | "low" } ],
  "impactedDRs": [ { "id": "string", "title": "string", "impactReason": "string", "status": "linked" | "suggested" | "missing" } ],
  "vrCoverage": [ { "id": "string", "title": "string", "linkedDR": "string", "coverageStatus": "covered" | "partial" | "missing" | "unknown", "reason": "string" } ],
  "tests": [ { "name": "string", "proves": "string", "latestResult": "pass" | "fail" | "not_run" | "unknown", "evidence": "string" } ],
  "gaps": [ { "gap": "string", "recommendedAction": "string" } ],
  "citations": [ { "sourceId": "string", "documentName": "string", "sectionPath": "string", "pageStart": number, "pageEnd": number, "snippet": "string" } ],
  "suggestedActions": [ { "actionType": "create_dr" | "create_vr" | "link_test" | "review_spec" | "mark_gap", "title": "string", "description": "string" } ]
}`;

  let raw;
  try {
    raw = await chatCompletion(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMsg },
      ],
      { jsonMode: true }
    );
  } catch (e) {
    return {
      answer: notFoundAnswer(
        `The SpecPilot model request failed (${String(e?.message || e).slice(0, 240)}). Check OPENAI_API_KEY, OPENAI_BASE_URL / SPECPILOT_LLM_URL, and network access to the LLM endpoint.`
      ),
      model: env.llmModel,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(stripJsonFence(raw));
  } catch {
    return {
      answer: notFoundAnswer('The model returned invalid JSON; no grounded answer available.'),
      model: env.llmModel,
    };
  }

  const v = validateAnswerJson(parsed);
  if (!v.ok) {
    return {
      answer: notFoundAnswer(`Answer validation failed: ${v.error}`),
      model: env.llmModel,
    };
  }

  return { answer: v.value, model: env.llmModel };
}

export function answerCacheKey(question, documentIds, flags) {
  const h = crypto.createHash('sha256');
  h.update(String(question));
  h.update(JSON.stringify(documentIds || []));
  h.update(JSON.stringify(flags || {}));
  return h.digest('hex');
}
