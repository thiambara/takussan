import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { AccesAdmin } from '@/lib/access/pages-admin';
import type { User } from '@/types/user';

/**
 * TCK-633 (lot B) — le layout `/app` fournit les pages admin accessibles à la coque — et donc à la
 * section d'agence de sa barre (TCK-649).
 */
const { getMe, accesAdmin, capacitesAmorcees, sonde, sondeDuCache } = vi.hoisted(() => ({
  getMe: vi.fn(),
  accesAdmin: vi.fn(),
  capacitesAmorcees: vi.fn(),
  sonde: vi.fn(),
  sondeDuCache: vi.fn(),
}));

vi.mock('@/app/actions/auth', () => ({ getMeAction: () => getMe() }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/access/server-guards', () => ({
  resolveAgencyOrNull: async () => ({ id: 7, kind: 'individual', status: 'active' }),
}));
vi.mock('@/lib/access/pages-admin-server', () => ({
  accesAdmin: (u: User) => accesAdmin(u),
  capacitesAmorcees: (u: User) => capacitesAmorcees(u),
}));
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
      sondeDuCache(useQueryClient().getQueryData(['me', 'capabilities', 'active']));
      return null;
    },
  };
});

const { default: AppLayout } = await import('../layout');

/** La racine de l'application monte toujours un `QueryClientProvider` (`QueryProvider`). */
function avecCache(ui: ReactNode) {
  return <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;
}

describe('layout /app — le fournisseur d’accès (TCK-633)', () => {
  it('fournit à la coque les pages admin accessibles', async () => {
    const user = { id: 1, roles: ['agency_admin'], agency_id: 7 } as unknown as User;
    const acces: AccesAdmin = { chemins: ['/app/agency'], espaceIndividuel: true };
    getMe.mockResolvedValue(user);
    accesAdmin.mockResolvedValue(acces);

    capacitesAmorcees.mockResolvedValue(null);

    render(avecCache(await AppLayout({ children: null })));

    expect(accesAdmin).toHaveBeenCalledWith(user);
    expect(sonde).toHaveBeenLastCalledWith(acces);
  });
});

/**
 * TCK-1278 (P136.02) — les capacités que le rendu serveur a lues pour un `agency_admin` amorcent
 * la clé `['me','capabilities','active']` du navigateur, celle que lit `useCan`.
 */
describe('layout /app — les capacités amorcées (TCK-1278)', () => {
  it('amorce le cache des capacités du profil actif avec la lecture du serveur', async () => {
    const user = { id: 1, roles: ['agency_admin'], agency_id: 7 } as unknown as User;
    getMe.mockResolvedValue(user);
    accesAdmin.mockResolvedValue({ chemins: [], espaceIndividuel: false });
    capacitesAmorcees.mockResolvedValue({
      reponse: { agency_id: 7, capabilities: ['invoices.create'] },
      lueA: Date.now(),
    });

    render(avecCache(await AppLayout({ children: null })));

    expect(capacitesAmorcees).toHaveBeenCalledWith(user);
    expect(sondeDuCache).toHaveBeenLastCalledWith({ data: { agency_id: 7, capabilities: ['invoices.create'] } });
  });
});
