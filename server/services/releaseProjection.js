/**
 * Combined release readiness score (0–100) and adaptive projected date.
 * Early phase: confidence low, date null ("TBD").
 */
export function computeReleaseReadiness(input, weights, historyDays = []) {
  const w = {
    passRate: weights.passRate ?? 0.25,
    functionalCov: weights.functionalCov ?? 0.2,
    codeCov: weights.codeCov ?? 0.15,
    vrCov: weights.vrCov ?? 0.15,
    drClosure: weights.drClosure ?? 0.25,
  };
  const norm = (x) => Math.max(0, Math.min(100, Number(x) || 0));
  const score =
    norm(input.passRate) * w.passRate +
    norm(input.functionalCoverage) * w.functionalCov +
    norm(input.codeCoverage) * w.codeCov +
    norm(input.vrCoverage) * w.vrCov +
    norm(input.drClosure) * w.drClosure;

  const sumW = w.passRate + w.functionalCov + w.codeCov + w.vrCov + w.drClosure;
  const normalizedScore = sumW > 0 ? score / sumW : 0;

  const days = historyDays.filter((d) => typeof d === 'number' && d > 0);
  const n = days.length;
  let confidence = 0;
  let projectedDate = null;
  let projectionNote = 'Insufficient velocity history — projection is TBD.';

  if (n >= 3 && normalizedScore > 5) {
    const avgDelta = days.reduce((a, b) => a + b, 0) / n;
    const variance =
      days.reduce((acc, d) => acc + (d - avgDelta) ** 2, 0) / n;
    const stability = Math.max(0, 1 - Math.min(1, Math.sqrt(variance) / (avgDelta || 1)));
    confidence = Math.min(1, (n / 14) * 0.5 + stability * 0.5);

    const remaining = Math.max(0, 100 - normalizedScore);
    const dailyProgress =
      remaining > 0 ? Math.max(0.01, (100 - normalizedScore) / (avgDelta * n || 1)) : 0;
    const daysToTarget =
      dailyProgress > 0 ? remaining / (normalizedScore / (n * avgDelta || 1) || 0.5) : 0;

    if (confidence > 0.15 && Number.isFinite(daysToTarget) && daysToTarget < 5000) {
      const ms = Date.now() + daysToTarget * 86400000;
      projectedDate = new Date(ms).toISOString().slice(0, 10);
      projectionNote = `Based on ${n} cadence samples and current score velocity.`;
    }
  }

  if (n < 3 || normalizedScore < 3) {
    projectedDate = null;
    projectionNote =
      'Early phase: horizon unbounded until more progress samples exist.';
    confidence = Math.min(confidence, 0.1);
  }

  return {
    score: Math.round(normalizedScore * 10) / 10,
    projectedReleaseDate: projectedDate,
    confidence: Math.round(confidence * 100) / 100,
    projectionNote,
    weightsUsed: w,
  };
}
