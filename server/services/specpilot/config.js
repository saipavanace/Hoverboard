/**
 * SpecPilot environment (no hard-coded provider; URLs from env).
 */
function openaiBase() {
  const b = process.env.OPENAI_BASE_URL;
  return b ? b.replace(/\/$/, '') : '';
}

export function getSpecpilotEnv() {
  const ob = openaiBase();
  return {
    llmUrl: process.env.SPECPILOT_LLM_URL || (ob ? `${ob}/chat/completions` : 'https://api.openai.com/v1/chat/completions'),
    llmKey: process.env.OPENAI_API_KEY || '',
    llmModel: process.env.SPECPILOT_LLM_MODEL || 'gpt-4o-mini',
    embeddingUrl:
      process.env.SPECPILOT_EMBEDDING_URL || (ob ? `${ob}/embeddings` : 'https://api.openai.com/v1/embeddings'),
    embeddingKey: process.env.SPECPILOT_EMBEDDING_API_KEY || process.env.OPENAI_API_KEY || '',
    embeddingModel: process.env.SPECPILOT_EMBEDDING_MODEL || 'text-embedding-3-small',
    topKChunks: Number(process.env.SPECPILOT_TOP_K) || 10,
    maxContextChars: Number(process.env.SPECPILOT_MAX_CONTEXT_CHARS) || 32000,
    hybridVectorWeight: Number(process.env.SPECPILOT_VECTOR_WEIGHT) || 0.55,
    hybridKeywordWeight: Number(process.env.SPECPILOT_KEYWORD_WEIGHT) || 0.45,
  };
}
