/**
 * Hoverboard tool version (ISO 26262–friendly identification of the qualified software instance).
 *
 * Scheme: semantic versioning with explicit pre-release tags until GA.
 *   MAJOR.MINOR.PATCH[-prerelease]
 *
 * - MAJOR — incompatible API/schema/process changes (re-qualification impact).
 * - MINOR — backward-compatible features.
 * - PATCH — fixes without contract changes.
 *
 * Pre-release (ordered): alpha < beta < rc < stable. During beta track use e.g. 0.x.y-beta.N;
 * first stable GA target is 1.0.0.
 *
 * Canonical value lives in server/package.json `version` (always shipped with the API/Docker image).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readVersionFromPackage(pkgPath) {
  try {
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const j = JSON.parse(raw);
    if (j.version && typeof j.version === 'string') return j.version.trim();
  } catch {
    /* ignore */
  }
  return null;
}

let _cached;

/** Release identifier string, e.g. `0.1.0-beta.1`. */
export function getToolVersion() {
  if (_cached != null) return _cached;
  const serverPkg = path.join(__dirname, '..', 'package.json');
  const fromServer = readVersionFromPackage(serverPkg);
  if (fromServer) {
    _cached = fromServer;
    return _cached;
  }
  const rootPkg = path.join(__dirname, '..', '..', 'package.json');
  _cached = readVersionFromPackage(rootPkg) || '0.0.0-dev';
  return _cached;
}

/** Structured pieces for APIs and audit (semver-ish parse). */
export function getToolVersionMeta() {
  const version = getToolVersion();
  const m = version.match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/
  );
  return {
    version,
    major: m ? Number(m[1]) : null,
    minor: m ? Number(m[2]) : null,
    patch: m ? Number(m[3]) : null,
    prerelease: m?.[4] ?? null,
    build: m?.[5] ?? null,
    phase: inferPhase(version, m?.[4]),
  };
}

function inferPhase(full, prerelease) {
  if (!prerelease) return full.startsWith('0.') ? 'pre-1.0' : 'stable';
  const p = prerelease.toLowerCase();
  if (p.includes('alpha')) return 'alpha';
  if (p.includes('beta')) return 'beta';
  if (p.startsWith('rc')) return 'rc';
  return 'prerelease';
}
