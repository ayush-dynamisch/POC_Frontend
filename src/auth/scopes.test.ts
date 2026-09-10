// Run: npm test  (tsc + node --test, no framework, no new dependency)
//
// Guards the mirror in scopes.ts against the backend's ROLE_SCOPES. The five
// scopes below are the ones that gate a button in this UI; if the backend
// table moves and this file is not updated, this is what fails.
import assert from 'node:assert/strict';
import test from 'node:test';

import { hasScope, type Scope } from './scopes.ts';
import type { Role } from '../types/index.ts';

const ROLES: Role[] = ['super_admin', 'admin', 'compliance_officer', 'hr', 'clinician'];

// Transcribed from the Role -> Permission matrix in the backend's docs/permissions.md.
const GRANTED: Record<Scope, Role[]> = {
  'users:create': ['admin', 'hr'],
  'documents:update': ['admin', 'compliance_officer', 'hr'],
  'credentials:verify': ['admin', 'compliance_officer', 'hr'],
  'compliance:read': ['admin', 'compliance_officer', 'hr', 'clinician'],
  'compliance:report': ['admin', 'compliance_officer'],
  'audit_logs:read': ['super_admin', 'admin', 'compliance_officer'],
};

test('hasScope matches the backend role/scope matrix', () => {
  for (const [scope, granted] of Object.entries(GRANTED) as [Scope, Role[]][]) {
    for (const role of ROLES) {
      assert.equal(
        hasScope(role, scope),
        granted.includes(role),
        `${role} / ${scope}`,
      );
    }
  }
});

test('an unauthenticated user holds nothing', () => {
  assert.equal(hasScope(undefined, 'compliance:report'), false);
});
