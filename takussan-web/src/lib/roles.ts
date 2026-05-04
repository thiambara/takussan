import type { UserRole } from '@/types/user';

export function isAgent(roles: UserRole[]): boolean {
  return roles.includes('agent');
}

export function isOwner(roles: UserRole[]): boolean {
  return roles.includes('owner');
}

export function isCustomer(roles: UserRole[]): boolean {
  return roles.includes('customer');
}

export function isAdmin(roles: UserRole[]): boolean {
  return roles.includes('agency_admin') || roles.includes('super_admin');
}

export function isSuperAdmin(roles: UserRole[]): boolean {
  return roles.includes('super_admin');
}

export function isServiceProvider(roles: UserRole[]): boolean {
  return roles.includes('service_provider');
}

export function isTenant(roles: UserRole[]): boolean {
  return roles.includes('tenant');
}

export function getPrimaryRole(roles: UserRole[]): UserRole | null {
  const priority: UserRole[] = [
    'super_admin',
    'agency_admin',
    'agent',
    'owner',
    'service_provider',
    'tenant',
    'customer',
  ];
  return priority.find((r) => roles.includes(r)) ?? null;
}
