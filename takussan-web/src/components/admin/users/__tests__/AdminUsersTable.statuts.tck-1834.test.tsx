/**
 * TCK-1834 (P146.04) — la table des tons d'`AdminUsersTable` est typée `Record<UserStatus, …>`,
 * donc porte les quatre cas, `deleted` compris. Elle ne décide plus du libellé : le dictionnaire
 * le fait (`t.has`). Ce test garde que le passage n'a rien changé à l'écran : les trois statuts
 * que `admin.users.status` nomme sont traduits, `deleted` (qu'il ne nomme pas) reste brut au lieu
 * de rendre le chemin de la clé.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { AdminUsersTable } from '../AdminUsersTable';
import type { AdminAgencyUserRow } from '@/types/admin-users';
import type { UserStatus } from '@/types/user';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function ligne(id: number, status: UserStatus): AdminAgencyUserRow {
  return {
    id,
    first_name: 'Awa',
    last_name: `Diop ${id}`,
    email: `awa${id}@example.test`,
    phone: null,
    status,
    last_login_at: null,
    created_at: '2026-01-01T00:00:00+00:00',
    roles: ['agent'],
  };
}

describe('statut du compte dans la console Équipe (TCK-1834)', () => {
  it('traduit les statuts nommés et laisse brut celui que le dictionnaire ne nomme pas', () => {
    const rows = [ligne(1, 'active'), ligne(2, 'inactive'), ligne(3, 'blocked'), ligne(4, 'deleted')];
    render(withIntl(<AdminUsersTable rows={rows} total={4} currentUserId={99} onSelect={vi.fn()} />));

    expect(within(screen.getByTestId('admin-user-row-1')).getByText('Actif')).toBeInTheDocument();
    expect(within(screen.getByTestId('admin-user-row-2')).getByText('Inactif')).toBeInTheDocument();
    expect(within(screen.getByTestId('admin-user-row-3')).getByText('Bloqué')).toBeInTheDocument();
    const supprime = within(screen.getByTestId('admin-user-row-4'));
    expect(supprime.getByText('deleted')).toBeInTheDocument();
    expect(supprime.queryByText(/admin\.users\.status/)).toBeNull();
  });
});
