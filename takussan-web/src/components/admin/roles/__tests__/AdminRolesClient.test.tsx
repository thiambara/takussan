import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';

import { AdminRolesClient } from '../AdminRolesClient';

const { rolesPayload, cataloguePayload } = vi.hoisted(() => ({
  rolesPayload: {
    data: [
      {
        id: 1,
        name: 'agency_admin',
        guard_name: 'web',
        team_id: null,
        scope: 'global',
        is_predefined: true,
        permissions: [],
      },
      {
        id: 7,
        name: 'comptable',
        guard_name: 'web',
        team_id: 5,
        scope: 'agency',
        is_predefined: false,
        permissions: [{ id: 11, name: 'properties.view' }],
      },
    ],
  },
  cataloguePayload: {
    data: [
      {
        resource: 'properties',
        permissions: [
          { id: 11, name: 'properties.view', action: 'view' },
        ],
      },
    ],
  },
}));

vi.mock('@/lib/queries/admin-roles', () => ({
  ADMIN_ROLES_FIELDS: ['id', 'name', 'guard_name', 'team_id'],
  fetchRoles: vi.fn().mockResolvedValue(rolesPayload),
  fetchPermissionsCatalogue: vi.fn().mockResolvedValue(cataloguePayload),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
}));

function renderWith(canManage: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider locale="fr" messages={{ common: { actions: { close: 'Fermer' } } }}>
      <QueryClientProvider client={client}>
        <AdminRolesClient canManage={canManage} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('<AdminRolesClient>', () => {
  it('renders the forbidden state when the actor lacks the permission', () => {
    renderWith(false);
    expect(screen.getByTestId('admin-roles-forbidden')).toBeTruthy();
    expect(screen.queryByTestId('admin-roles-loading')).toBeNull();
  });

  it('shows a loading skeleton while data resolves', () => {
    renderWith(true);
    expect(screen.getByTestId('admin-roles-loading')).toBeTruthy();
  });

  it('renders the list and editor once data lands', async () => {
    renderWith(true);
    expect(await screen.findByTestId('roles-list-predefined')).toBeTruthy();
    expect(screen.getByTestId('roles-list-custom')).toBeTruthy();
    expect(screen.getByTestId('role-row-agency_admin')).toBeTruthy();
    expect(screen.getByTestId('role-row-comptable')).toBeTruthy();
    expect(screen.getByTestId('create-role-trigger')).toBeTruthy();
    // Initial selection lands on the first custom role.
    expect(screen.getByTestId('role-row-comptable').dataset.selected).toBe('true');
  });
});
