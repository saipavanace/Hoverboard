import { loadConfig } from '../config.js';
import { sendMail } from './emailSend.js';

/** @typedef {'spec_version_published' | 'dr_stale_after_spec' | 'vr_orphan_stale'} NotificationEventKey */

export const NOTIFICATION_EVENTS = {
  SPEC_VERSION_PUBLISHED: 'spec_version_published',
  DR_STALE_AFTER_SPEC: 'dr_stale_after_spec',
  VR_ORPHAN_STALE: 'vr_orphan_stale',
};

/**
 * Collect unique recipient emails for an event and optional project scope.
 * @param {number | string | null | undefined} projectId
 */
export function recipientsForEvent(cfg, eventKey, projectId) {
  const subs = cfg.notifications?.subscriptions || [];
  const pid = projectId != null && projectId !== '' ? Number(projectId) : null;
  const matches = subs.filter((s) => {
    if (s.event !== eventKey) return false;
    const sp = s.projectId;
    if (sp == null || sp === '') return true;
    if (pid == null || Number.isNaN(pid)) return false;
    return Number(sp) === pid;
  });
  const set = new Set();
  for (const s of matches) {
    const list = normalizeEmailList(s.emails);
    for (const e of list) set.add(e);
  }
  return [...set];
}

function normalizeEmailList(raw) {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(/[\s,;]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Send immediately (await). Use scheduleNotification from HTTP handlers to avoid blocking.
 */
export async function dispatchNotification(eventKey, projectId, { subject, text, html }) {
  const cfg = loadConfig();
  if (!cfg.notifications?.enabled) return { skipped: true, reason: 'disabled' };
  const to = recipientsForEvent(cfg, eventKey, projectId);
  if (!to.length) return { skipped: true, reason: 'no_subscribers' };
  return sendMail(cfg, { to, subject, text, html });
}

export function scheduleNotification(eventKey, projectId, payload) {
  dispatchNotification(eventKey, projectId, payload).then(
    (r) => {
      if (r?.skipped) return;
      if (r && !r.ok) console.error('[notifications]', eventKey, r.error);
    },
    (err) => console.error('[notifications]', eventKey, err)
  );
}
