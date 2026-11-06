import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { User } from '@/types/user';
import type { ModeIcones } from '@/lib/navigation/mode-icones';

/**
 * TCK-2480 (AC5) — le layout `/app` lit le mode icônes de l'APPAREIL (cookie `menu_icones`) et le
 * descend à la coque : la largeur de la barre est ainsi dans le HTML serveur, rien ne saute à
 * l'hydratation.
 */
const { getMe, modeLu, sonde } = vi.hoisted(() => ({
  getMe: vi.fn(),
  modeLu: vi.fn<() => Promise<ModeIcones>>(),
  sonde: vi.fn(),
}));

vi.mock('@/app/actions/auth', () => ({ getMeAction: () => getMe() }));
vi.mock('@/lib/session', () => ({
  getToken: async () => 'jeton',
  getActiveProfileId: async () => undefined,
  getModeIconesDuMenu: () => modeLu(),
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
  AppShell: (props: { modeIcones?: unknown }) => {
    sonde(props.modeIcones);
    return null;
  },
}));

const { default: AppLayout } = await import('../layout');

const ADMIN_ET_BAILLEUR = { id: 1, roles: ['customer', 'agency_admin', 'owner'], agency_id: 7 } as unknown as User;

async function rendre() {
  render(<QueryClientProvider client={new QueryClient()}>{await AppLayout({ children: null })}</QueryClientProvider>);
}

describe('layout /app — le mode icônes de l’appareil (TCK-2480, AC5)', () => {
  it.each(['auto', 'icones', 'complet'] as const)('descend `%s`, lu sur le cookie, à la coque', async (mode) => {
    getMe.mockResolvedValue(ADMIN_ET_BAILLEUR);
    modeLu.mockResolvedValue(mode);
    await rendre();
    expect(sonde).toHaveBeenLastCalledWith(mode);
  });
});
