import { describe, it, expect, vi } from 'vitest';

vi.mock('./middleware/auth.js', () => ({
  authDisabled: () => false,
}));

import { can } from './middleware/rbac.js';

describe('can() project permissions', () => {
  const viewer = { id: 1, global_roles: [], project_roles: { 1: ['viewer'] }, authDisabled: false };
  const engineer = { id: 2, global_roles: [], project_roles: { 1: ['engineer'] }, authDisabled: false };
  const approver = { id: 3, global_roles: [], project_roles: { 1: ['approver'] }, authDisabled: false };

  it('viewer cannot create DR or approve', () => {
    expect(can(viewer, 1, 'drs_write')).toBe(false);
    expect(can(viewer, 1, 'approvals_act')).toBe(false);
  });

  it('engineer can create DR but cannot approve', () => {
    expect(can(engineer, 1, 'drs_write')).toBe(true);
    expect(can(engineer, 1, 'approvals_act')).toBe(false);
  });

  it('approver can approve', () => {
    expect(can(approver, 1, 'approvals_act')).toBe(true);
  });
});
