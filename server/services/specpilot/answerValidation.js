const STATUSES = new Set(['answered', 'partially_answered', 'not_found']);
const CONF = new Set(['high', 'medium', 'low']);

export function validateAnswerJson(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'not an object' };
  if (!STATUSES.has(raw.status)) return { ok: false, error: 'invalid status' };
  if (typeof raw.shortAnswer !== 'string') return { ok: false, error: 'shortAnswer' };
  if (typeof raw.detailedAnswer !== 'string') return { ok: false, error: 'detailedAnswer' };
  if (!Array.isArray(raw.keyRules)) return { ok: false, error: 'keyRules' };
  for (const r of raw.keyRules) {
    if (typeof r?.rule !== 'string') return { ok: false, error: 'keyRules.rule' };
    if (!CONF.has(r?.confidence)) return { ok: false, error: 'keyRules.confidence' };
    if (!Array.isArray(r?.evidence)) return { ok: false, error: 'keyRules.evidence' };
  }
  if (!Array.isArray(raw.impactedDRs)) return { ok: false, error: 'impactedDRs' };
  if (!Array.isArray(raw.vrCoverage)) return { ok: false, error: 'vrCoverage' };
  if (!Array.isArray(raw.tests)) return { ok: false, error: 'tests' };
  if (!Array.isArray(raw.gaps)) return { ok: false, error: 'gaps' };
  if (!Array.isArray(raw.citations)) return { ok: false, error: 'citations' };
  if (!Array.isArray(raw.suggestedActions)) return { ok: false, error: 'suggestedActions' };
  return { ok: true, value: raw };
}

export function notFoundAnswer(reason = 'No matching spec chunks were retrieved.') {
  return {
    status: 'not_found',
    shortAnswer: 'Not found in uploaded specs.',
    detailedAnswer: reason,
    keyRules: [],
    impactedDRs: [],
    vrCoverage: [],
    tests: [],
    gaps: [{ gap: 'Insufficient evidence in retrieved context.', recommendedAction: 'Upload or index the relevant specification sections.' }],
    citations: [],
    suggestedActions: [{ actionType: 'review_spec', title: 'Review uploaded specifications', description: 'Ensure the relevant document is uploaded and indexed.' }],
  };
}

/** When chunks exist but the server has no LLM key — not a spec/indexing problem. */
export function notFoundLlmNotConfiguredAnswer() {
  const detail =
    'Set OPENAI_API_KEY in the Hoverboard server environment, then restart the server. Optional: OPENAI_BASE_URL or SPECPILOT_LLM_URL, plus SPECPILOT_LLM_MODEL, for a non-default OpenAI-compatible endpoint.';
  return {
    status: 'not_found',
    shortAnswer: 'SpecPilot model is not configured on the server.',
    detailedAnswer: detail,
    keyRules: [],
    impactedDRs: [],
    vrCoverage: [],
    tests: [],
    gaps: [
      {
        gap: 'No LLM API key is available to turn retrieved spec text into an answer.',
        recommendedAction: 'Add OPENAI_API_KEY to the process that runs the Hoverboard API (OpenAI or compatible provider).',
      },
    ],
    citations: [],
    suggestedActions: [
      {
        actionType: 'mark_gap',
        title: 'Configure SpecPilot LLM',
        description: detail,
      },
    ],
  };
}
