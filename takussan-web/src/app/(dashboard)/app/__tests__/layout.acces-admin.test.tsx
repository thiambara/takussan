import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

import type { AccesAdmin } from '@/lib/access/pages-admin';
import type { User } from '@/types/user';

/**
 * TCK-633 (lot B) — le layout `/app` fournit les pages admin accessibles à la coque — et donc à la
 * section d'agence de sa barre (TCK-649).
 */
const { getMe, accesAdmin, sonde } = vi.hoisted(() => ({
  getMe: vi.fn(),
  accesAdmin: vi.fn(),
  sonde: vi.fn(),
}));

vi.mock('@/app/actions/auth', () => ({ getMeAction: () => getMe() }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/access/server-guards', () => ({
  resolveAgencyOrNull: async () => ({ id: 7, kind: 'individual', status: 'active' }),
}));
vi.mock('@/lib/access/pages-admin-server', () => ({ accesAdmin: (u: User) => accesAdmin(u) }));
vi.mock('@/lib/queries/agency-upgrade', () => ({ fetchAgencyUpgradeRequests: async () => ({ data: [] }) }));
vi.mock('@/i18n/messages', () => ({ messagesPour: async () => ({}) }));
vi.mock('@/i18n/IntlProvider', () => ({
  IntlProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/layout/AppShell', async () => {
  const { useAccesAdmin } = await import('@/lib/access/acces-admin-contexte');
  return {
    AppShell: () => {
      sonde(useAccesAdmin());
      return null;
    },
  };
});

const { default: AppLayout } = await import('../layout');

describe('layout /app — le fournisseur d’accès (TCK-633)', () => {
  it('fournit à la coque les pages admin accessibles', async () => {
    const user = { id: 1, roles: ['agency_admin'], agency_id: 7 } as unknown as User;
    const acces: AccesAdmin = { chemins: ['/app/agency'], espaceIndividuel: true };
    getMe.mockResolvedValue(user);
    accesAdmin.mockResolvedValue(acces);

    render(await AppLayout({ children: null }));

    expect(accesAdmin).toHaveBeenCalledWith(user);
    expect(sonde).toHaveBeenLastCalledWith(acces);
  });
});
