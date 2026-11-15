import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { User } from '@/types/user';

/**
 * TCK-2477 (ADR-0089 §2) — le layout `/app` lit le profil ACTIF et en descend le type à la coque :
 * c'est lui, et non l'union de `roles`, qui choisit la disposition du menu.
 */
const { getMe, profilActif, sonde, espaces } = vi.hoisted(() => ({
  getMe: vi.fn(),
  profilActif: vi.fn<() => Promise<string | undefined>>(),
  sonde: vi.fn(),
  espaces: vi.fn<() => Promise<unknown[] | null>>(async () => null),
}));

vi.mock('@/app/actions/auth', () => ({ getMeAction: () => getMe() }));
vi.mock('@/lib/espaces-serveur', () => ({ espacesAChoisir: () => espaces() }));
vi.mock('@/components/profile/ChoixDEspace', () => ({
  ChoixDEspace: (props: { espaces: unknown[] }) => <p data-testid="choix-d-espace">{props.espaces.length} espaces</p>,
}));
vi.mock('@/lib/session', () => ({
  getToken: async () => 'jeton',
  getActiveProfileId: () => profilActif(),
  getModeIconesDuMenu: async () => 'auto' as const,
}));
vi.mock('@/lib/access/server-guards', () => ({
  resolveAgencyOrNull: async () => ({ id: 7, kind: 'standard', status: 'active' }),
}));
vi.mock('@/lib/access/pages-admin-server', () => ({
  accesAdmin: async () => ({ chemins: [], espaceIndividuel: false }),
  capacitesAmorcees: async () => null,
}));
vi.mock('@/lib/queries/agency-upgrade', () => ({ fetchAgencyUpgradeRequests: async () => ({ data: [] }) }));
vi.mock('@/i18n/messages', () => ({ messagesPour: async () => ({}) }));
vi.mock('@/i18n/IntlProvider', () => ({
  IntlProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/layout/AppShell', () => ({
  AppShell: (props: { typeProfilActif?: unknown }) => {
    sonde(props.typeProfilActif);
    return null;
  },
}));

const { default: AppLayout } = await import('../layout');

const ADMIN_ET_BAILLEUR = { id: 1, roles: ['customer', 'agency_admin', 'owner'], agency_id: 7 } as unknown as User;

async function rendre() {
  render(<QueryClientProvider client={new QueryClient()}>{await AppLayout({ children: null })}</QueryClientProvider>);
}

describe('layout /app — le type du profil actif (TCK-2477)', () => {
  it('descend le type lu sur le cookie `active_profile_id`', async () => {
    getMe.mockResolvedValue(ADMIN_ET_BAILLEUR);
    profilActif.mockResolvedValue('owner:3');
    await rendre();
    expect(sonde).toHaveBeenLastCalledWith('owner');
  });

  it('rien de lisible (cookie absent, impersonation) : `null`, le persona se déduit des rôles', async () => {
    getMe.mockResolvedValue(ADMIN_ET_BAILLEUR);
    profilActif.mockResolvedValue(undefined);
    await rendre();
    expect(sonde).toHaveBeenLastCalledWith(null);
  });

  it('TCK-2621 — sans cookie, le profil que l’API a LIÉ décide (dernier espace retenu) : l’admin garde le menu de l’admin', async () => {
    getMe.mockResolvedValue({ ...ADMIN_ET_BAILLEUR, active_profile_id: 'agency_admin:7' });
    profilActif.mockResolvedValue(undefined);
    await rendre();
    expect(sonde).toHaveBeenLastCalledWith('agency_admin');
  });

  it('TCK-2621 — le cookie l’emporte sur le profil lié', async () => {
    getMe.mockResolvedValue({ ...ADMIN_ET_BAILLEUR, active_profile_id: 'agency_admin:7' });
    profilActif.mockResolvedValue('owner:3');
    await rendre();
    expect(sonde).toHaveBeenLastCalledWith('owner');
  });
});

describe('layout /app — l’écran « Choisir un espace » (TCK-2621)', () => {
  it('des espaces à choisir : l’écran À LA PLACE de la coque', async () => {
    sonde.mockClear();
    getMe.mockResolvedValue({ id: 176, roles: ['customer'], agency_id: null, active_profile_id: null } as unknown as User);
    profilActif.mockResolvedValue(undefined);
    espaces.mockResolvedValueOnce([{ id: 'agent:5' }, { id: 'owner:9' }]);
    await rendre();
    expect(screen.getByTestId('choix-d-espace')).toHaveTextContent('2 espaces');
    expect(sonde).not.toHaveBeenCalled();
  });
});

