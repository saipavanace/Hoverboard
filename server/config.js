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
  regressionParsers: [
    { name: 'fail', regex: 'FAIL\\b' },
    { name: 'error', regex: 'ERROR\\b' },
    { name: 'assert', regex: 'ASSERT' },
    { name: 'timeout', regex: 'timeout' },
    { name: 'fatal', regex: 'UVM_FATAL' },
  ],
  coverageRegex: {
    functional: [
      'functional\\s*coverage\\s*[:=]\\s*([0-9]+(?:\\.[0-9]+)?)\\s*%?',
      '\\bfcov\\s*[:=]\\s*([0-9]+(?:\\.[0-9]+)?)\\s*%?',
    ],
    code: [
      'code\\s*coverage\\s*[:=]\\s*([0-9]+(?:\\.[0-9]+)?)\\s*%?',
      '\\bccov\\s*[:=]\\s*([0-9]+(?:\\.[0-9]+)?)\\s*%?',
    ],
  },
  vrLogRegex: '(?:UVM_INFO|uvm_info|UVM_NOTE)[\\s\\S]{0,200}?\\b(VR-\\d{3,8})\\b',
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
    regressionParsers: file.regressionParsers ?? defaults.regressionParsers,
    coverageRegex: { ...defaults.coverageRegex, ...(file.coverageRegex || {}) },
    vrLogRegex: file.vrLogRegex ?? defaults.vrLogRegex,
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
