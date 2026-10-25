import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { User, UserRole } from '@/types/user';

/**
 * TCK-2260 (P116.07) — l'API ouvre `GET /api/dashboard/owner` au bailleur, et à l'admin qui détient
 * `reports.view_agency` (`DashboardOwnerController`). Le layout suit : l'admin dont le rôle retire
 * la capacité ne voit plus l'état d'erreur de la page, il est renvoyé à la première page qu'il peut
 * ouvrir, comme pour le journal (`garderPageAdmin`). Le layout est EXÉCUTÉ ; seuls ses appels de
 * bord sont simulés.
 */
const { getMe, capacites, accesAdmin } = vi.hoisted(() => ({
  getMe: vi.fn(),
  capacites: vi.fn<() => Promise<readonly string[] | null>>(),
  accesAdmin: vi.fn<(u: unknown) => Promise<{ chemins: string[]; espaceIndividuel: boolean }>>(),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
vi.mock('@/app/actions/auth', () => ({ getMeAction: () => getMe() }));
vi.mock('@/lib/access/pages-admin-server', () => ({
  capacitesDuProfilActif: () => capacites(),
  accesAdmin: (u: unknown) => accesAdmin(u),
}));

const { default: Layout } = await import('../layout');

const moi = (roles: UserRole[]) => ({ id: 1, roles, agency_id: 7 }) as unknown as User;

describe('layout /app/overview/owner (TCK-2260)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capacites.mockResolvedValue(['reports.view_agency']);
    accesAdmin.mockResolvedValue({ chemins: ['/app/agency', '/app/agency/finances'], espaceIndividuel: false });
  });

  it('le bailleur entre sans capacité d’agence', async () => {
    getMe.mockResolvedValue(moi(['owner', 'customer']));
    capacites.mockResolvedValue([]);
    await expect(Layout({ children: null })).resolves.toBeTruthy();
  });

  it('l’admin qui détient reports.view_agency entre', async () => {
    getMe.mockResolvedValue(moi(['agency_admin', 'customer']));
    await expect(Layout({ children: null })).resolves.toBeTruthy();
  });

  it('l’admin sans reports.view_agency est renvoyé à la première page qu’il peut ouvrir', async () => {
    getMe.mockResolvedValue(moi(['agency_admin', 'customer']));
    capacites.mockResolvedValue(['agency.update']);
    await expect(Layout({ children: null })).rejects.toThrow(/^NEXT_REDIRECT \/app\/agency$/);
  });

  it('sans aucune page ouverte, il est renvoyé à /app', async () => {
    getMe.mockResolvedValue(moi(['agency_admin', 'customer']));
    capacites.mockResolvedValue([]);
    accesAdmin.mockResolvedValue({ chemins: [], espaceIndividuel: false });
    await expect(Layout({ children: null })).rejects.toThrow(/^NEXT_REDIRECT \/app$/);
  });

  it('capacités illisibles : la vérification indisponible, pas l’état d’erreur', async () => {
    getMe.mockResolvedValue(moi(['agency_admin', 'customer']));
    capacites.mockResolvedValue(null);
    await expect(Layout({ children: null })).rejects.toThrow('NEXT_REDIRECT /verification-indisponible');
  });

  it('un compte ni bailleur ni admin reste renvoyé vers /app/overview', async () => {
    getMe.mockResolvedValue(moi(['agent', 'customer']));
    await expect(Layout({ children: null })).rejects.toThrow(/^NEXT_REDIRECT \/app\/overview$/);
  });
});
