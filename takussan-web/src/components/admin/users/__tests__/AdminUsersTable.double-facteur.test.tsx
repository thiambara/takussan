import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { AdminUsersTable } from '../AdminUsersTable';
import type { AdminAgencyUserRow } from '@/types/admin-users';

/** TCK-589 — colonne « Double authentification » de la console Équipe. */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const membre = (id: number, two_factor_enabled: boolean | undefined): AdminAgencyUserRow => ({
  id,
  first_name: 'Awa',
  last_name: `Diop ${id}`,
  email: `awa${id}@example.test`,
  phone: null,
  status: 'active',
  last_login_at: null,
  created_at: '2026-01-01T00:00:00+00:00',
  roles: ['agent'],
  ...(two_factor_enabled === undefined ? {} : { two_factor_enabled }),
});

describe('colonne 2FA de la console Équipe', () => {
  it('activée, non activée, et ABSENTE (jamais lue comme « non activée »)', () => {
    render(
      withIntl(
        <AdminUsersTable
          rows={[membre(1, true), membre(2, false), membre(3, undefined)]}
          total={3}
          currentUserId={99}
          onSelect={vi.fn()}
        />,
      ),
    );

    expect(screen.getByRole('columnheader', { name: 'Double authentification' })).toBeInTheDocument();
    expect(within(screen.getByTestId('admin-user-row-1')).getByText('Activée')).toBeInTheDocument();
    expect(within(screen.getByTestId('admin-user-row-2')).getByText('Non activée')).toBeInTheDocument();
    const inconnue = within(screen.getByTestId('admin-user-row-3'));
    expect(inconnue.getByText('Non communiquée')).toBeInTheDocument();
    expect(inconnue.queryByText('Non activée')).toBeNull();
  });
});
