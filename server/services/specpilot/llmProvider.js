import { getSpecpilotEnv } from './config.js';

/**
 * OpenAI-compatible chat completion (JSON mode when requested).
 */
export async function chatCompletion(messages, options = {}) {
  const env = getSpecpilotEnv();
  if (!env.llmKey) {
    throw new Error('LLM API key not configured (set OPENAI_API_KEY for the Hoverboard server)');
  }
  const body = {
    model: env.llmModel,
    messages,
    temperature: options.temperature ?? 0.1,
    ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
  };
  const res = await fetch(env.llmUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.llmKey}`,
      ...(options.extraHeaders || {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM HTTP ${res.status}: ${errText.slice(0, 500)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('LLM returned no message content');
  return content;
}

/**
 * OpenAI-compatible embeddings API.
 * @returns {Promise<number[]>}
 */
export async function generateEmbedding(text) {
  const arr = await generateEmbeddings([text]);
  return arr[0];
}

/**
 * @returns {Promise<number[][]>}
 */
export async function generateEmbeddings(texts) {
  const env = getSpecpilotEnv();
  if (!env.embeddingKey) {
    throw new Error('Embedding API key not configured (set OPENAI_API_KEY or SPECPILOT_EMBEDDING_API_KEY)');
  }
  const res = await fetch(env.embeddingUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.embeddingKey}`,
    },
    body: JSON.stringify({
      model: env.embeddingModel,
      input: texts,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Embedding HTTP ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const list = data?.data || [];
  list.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return list.map((d) => {
    const v = d.embedding;
    if (!Array.isArray(v)) throw new Error('Invalid embedding vector');
    return v.map(Number);
  });
}
