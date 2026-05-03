import { describe, it, expect } from 'vitest';
import { recipientsForEvent } from './notifications.js';

describe('notifications.recipientsForEvent', () => {
  const cfg = {
    notifications: {
      enabled: true,
      subscriptions: [
        { event: 'spec_version_published', projectId: null, emails: ['a@x.com', 'b@x.com'] },
        { event: 'spec_version_published', projectId: 2, emails: ['proj2@x.com'] },
        { event: 'dr_stale_after_spec', emails: ['dr@x.com'] },
      ],
    },
  };

  it('collects global recipients when projectId is null', () => {
    expect(recipientsForEvent(cfg, 'spec_version_published', 1).sort()).toEqual(['a@x.com', 'b@x.com'].sort());
  });

  it('includes matching project-scoped emails', () => {
    expect(recipientsForEvent(cfg, 'spec_version_published', 2)).toContain('proj2@x.com');
    expect(recipientsForEvent(cfg, 'spec_version_published', 2)).toContain('a@x.com');
  });

  it('parses string emails on subscription row', () => {
    const c = {
      notifications: {
        subscriptions: [{ event: 'vr_orphan_stale', emails: ' one@test.org ; two@test.org ' }],
      },
    };
    expect(recipientsForEvent(c, 'vr_orphan_stale', null).sort()).toEqual(['one@test.org', 'two@test.org'].sort());
  });
});
