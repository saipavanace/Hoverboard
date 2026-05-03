import { describe, it, expect } from 'vitest';
import { normalizeSnapshotForApply, parseSnapshotJson } from './parseSnapshotJson.js';

describe('parseSnapshotJson', () => {
  it('parses strict JSON', () => {
    expect(parseSnapshotJson('{"meta":{"schemaVersion":1}}')).toEqual({ meta: { schemaVersion: 1 } });
  });

  it('allows trailing commas (JSON5)', () => {
    expect(parseSnapshotJson('{ "a": 1, }')).toEqual({ a: 1 });
  });

  it('returns null for empty / whitespace (so Apply is not sent as {})', () => {
    expect(parseSnapshotJson('')).toBeNull();
    expect(parseSnapshotJson('  \n')).toBeNull();
  });
});

describe('normalizeSnapshotForApply', () => {
  it('returns null when input is null', () => {
    expect(normalizeSnapshotForApply(null)).toBeNull();
  });

  it('unwraps snapshot wrapper object', () => {
    const inner = { meta: { schemaVersion: 1 }, tables: { projects: [{ id: 1 }] } };
    expect(normalizeSnapshotForApply({ snapshot: inner })).toEqual(inner);
  });

  it('builds tables from root-level row arrays', () => {
    expect(
      normalizeSnapshotForApply({
        meta: {},
        projects: [],
        specs: [],
      })
    ).toEqual({
      meta: {},
      tables: { projects: [], specs: [] },
    });
  });
});
