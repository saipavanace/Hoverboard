import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const configPath =
  process.env.HOVERBOARD_CONFIG ||
  path.join(rootDir, 'hoverboard.config.json');

const defaults = {
  projectName: 'Hoverboard',
  companyName: 'Your org',
  requirementCategories: [
    'System',
    'CHI',
    'IOAIU',
    'DVE',
    'DCE',
    'GIU',
    'DMI',
    'DII',
  ],
  regressionRoots: ['./sample-regressions'],
  releaseMetricWeights: {
    passRate: 0.25,
    functionalCov: 0.2,
    codeCov: 0.15,
    vrCov: 0.15,
    drClosure: 0.25,
  },
  branding: {
    accent: '#0d9488',
    logoUrl: null,
  },
};

export function loadConfig() {
  let file = {};
  try {
    if (fs.existsSync(configPath)) {
      file = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch {
    /* ignore */
  }
  return {
    ...defaults,
    ...file,
    requirementCategories: file.requirementCategories ?? defaults.requirementCategories,
    regressionRoots: file.regressionRoots ?? defaults.regressionRoots,
    releaseMetricWeights: {
      ...defaults.releaseMetricWeights,
      ...(file.releaseMetricWeights || {}),
    },
    branding: { ...defaults.branding, ...(file.branding || {}) },
  };
}

export function saveConfig(partial) {
  const current = loadConfig();
  const next = {
    ...current,
    ...partial,
    requirementCategories: partial.requirementCategories ?? current.requirementCategories,
    releaseMetricWeights: {
      ...current.releaseMetricWeights,
      ...(partial.releaseMetricWeights || {}),
    },
    branding: { ...current.branding, ...(partial.branding || {}) },
  };
  fs.writeFileSync(configPath, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export { configPath };
