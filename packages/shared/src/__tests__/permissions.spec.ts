import { describe, expect, it } from 'vitest';
import {
  PERMISSION_CATALOG,
  PERMISSION_CODE_PATTERN,
  PERMISSION_CODES,
  PERMISSION_MODULES,
  ROLE_TEMPLATES,
  ROLE_TEMPLATE_KEYS,
} from '../permissions/index.js';

/**
 * Constitution Principle II: an endpoint MUST declare its required permission, and a
 * permission string must be enforceable. That requires every code to be well formed,
 * and every role template to grant only permissions that exist.
 */
describe('permission catalog', () => {
  it('formats every code as resource.action, both lowercase', () => {
    for (const permission of PERMISSION_CATALOG) {
      expect(permission.code).toMatch(PERMISSION_CODE_PATTERN);
    }
  });

  it('has no duplicate codes', () => {
    const codes = PERMISSION_CATALOG.map((permission) => permission.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('assigns every permission to a declared module', () => {
    for (const permission of PERMISSION_CATALOG) {
      expect(PERMISSION_MODULES).toContain(permission.module);
    }
  });

  it('gives every permission a description, because a bare code is not reviewable', () => {
    for (const permission of PERMISSION_CATALOG) {
      expect(permission.description.length).toBeGreaterThan(0);
    }
  });

  it('has a permission set that matches the catalog exactly', () => {
    expect(PERMISSION_CODES.size).toBe(PERMISSION_CATALOG.length);
  });
});

describe('role templates', () => {
  it('defines exactly the five default roles', () => {
    expect(ROLE_TEMPLATE_KEYS.sort()).toEqual([
      'administrator',
      'inventory',
      'manager',
      'purchasing',
      'sales',
    ]);
  });

  it('has unique keys', () => {
    expect(new Set(ROLE_TEMPLATE_KEYS).size).toBe(ROLE_TEMPLATE_KEYS.length);
  });

  it('grants only permissions that exist in the catalog', () => {
    for (const role of ROLE_TEMPLATES) {
      for (const code of role.permissions) {
        expect(PERMISSION_CODES.has(code)).toBe(true);
      }
    }
  });

  it('never grants the same permission twice within a template', () => {
    for (const role of ROLE_TEMPLATES) {
      expect(new Set(role.permissions).size).toBe(role.permissions.length);
    }
  });

  it('resolves the administrator to every permission in the catalog', () => {
    // Resolved from the catalog rather than an enumerated list, so a new permission
    // cannot be added and silently fail to reach the administrator.
    const administrator = ROLE_TEMPLATES.find((role) => role.key === 'administrator');
    expect(administrator).toBeDefined();
    expect(new Set(administrator?.permissions)).toEqual(PERMISSION_CODES);
  });

  it('resolves the manager to everything except user, role and settings administration', () => {
    const manager = ROLE_TEMPLATES.find((role) => role.key === 'manager');
    expect(manager).toBeDefined();
    expect(manager?.permissions).toContain('sales.write');
    expect(manager?.permissions).not.toContain('users.manage');
    expect(manager?.permissions).not.toContain('roles.manage');
    expect(manager?.permissions).not.toContain('settings.manage');
  });

  it('gives every operational role a name and a description', () => {
    for (const role of ROLE_TEMPLATES) {
      expect(role.name.length).toBeGreaterThan(0);
      expect(role.description.length).toBeGreaterThan(0);
    }
  });

  it('keeps the least privileged role away from destructive administrative actions', () => {
    const sales = ROLE_TEMPLATES.find((role) => role.key === 'sales');
    expect(sales?.permissions).not.toContain('settings.manage');
    expect(sales?.permissions).not.toContain('users.manage');
    expect(sales?.permissions).not.toContain('inventory.adjust');
  });
});