import { vi } from 'vitest';

export function setupFetchMock(handlers) {
  const map = new Map();
  for (const [k, v] of Object.entries(handlers)) map.set(k, v);

  global.fetch = vi.fn(async (url, opts) => {
    const method = (opts?.method || 'GET').toUpperCase();
    const key = `${method} ${url}`;
    let entry = map.get(key);
    if (!entry) entry = map.get(`* ${url}`);
    if (!entry) {
      for (const [k, v] of map.entries()) {
        const [m, pattern] = k.split(' ');
        if ((m === '*' || m === method) && url.startsWith(pattern.replace(/\$$/, ''))) {
          entry = v;
          break;
        }
      }
    }
    if (!entry) {
      return {
        ok: true,
        json: async () => ({}),
      };
    }
    if (typeof entry === 'function') {
      const out = await entry({ url, opts, method });
      return out;
    }
    return {
      ok: true,
      json: async () => entry,
    };
  });

  return global.fetch;
}
