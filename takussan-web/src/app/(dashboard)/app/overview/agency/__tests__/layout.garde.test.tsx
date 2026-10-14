import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { User, UserRole } from '@/types/user';

/**
 * TCK-647 — la garde du layout de `/app/overview/agency` ne bouge pas (contrainte du ticket), et
 * elle porte désormais une seconde charge : c'est elle qui rend INATTEIGNABLE la branche
 * « agence `individual` » des files d'attente.
 *
 * Sous `/admin`, un super-admin passait la garde quelle que soit son agence (`pageAccessible`) : rattaché
 * à une agence `individual`, il atteignait cette branche — son seul chemin vivant. Ce layout-ci, lui,
 * juge le `kind` pour TOUT compte rattaché à une agence, super-admin compris : le cas
 * « super-admin + individual » ci-dessous est la preuve que la page fusionnée ne la rend plus.
 */
const { getMe, resolveAgency, getToken } = vi.hoisted(() => ({
  getMe: vi.fn(),
  resolveAgency: vi.fn(),
  getToken: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: (cible: string) => {
    throw new Error(`NEXT_REDIRECT ${cible}`);
  },
}));
vi.mock('@/app/actions/auth', () => ({ getMeAction: () => getMe() }));
vi.mock('@/lib/session', () => ({ getToken: () => getToken() }));
vi.mock('@/lib/access/server-guards', () => ({
  resolveAgencyOrNull: (...a: unknown[]) => resolveAgency(...a),
}));

const { default: Layout } = await import('../layout');

const moi = (roles: UserRole[], agency_id: number | null = 7) =>
  ({ id: 1, roles, agency_id }) as unknown as User;

const ENFANT = 'contenu-de-la-page';

beforeEach(() => {
  vi.clearAllMocks();
  getToken.mockResolvedValue('jeton');
  resolveAgency.mockResolvedValue({ id: 7, kind: 'standard' });
});

describe('/app/overview/agency — la garde du layout (inchangée par TCK-647)', () => {
  it.each([
    [['agent'], '/app/overview/agent'],
    [['owner'], '/app/overview'],
    [['customer', 'tenant'], '/app/overview'],
  ] as const)('%j est renvoyé vers %s', async (roles, cible) => {
    getMe.mockResolvedValue(moi([...roles]));
    await expect(Layout({ children: ENFANT })).rejects.toThrow(`NEXT_REDIRECT ${cible}`);
  });

  it("l'admin d'une agence individual est renvoyé vers /app", async () => {
    getMe.mockResolvedValue(moi(['agency_admin', 'owner']));
    resolveAgency.mockResolvedValue({ id: 7, kind: 'individual' });
    await expect(Layout({ children: ENFANT })).rejects.toThrow('NEXT_REDIRECT /app');
  });

  it('PREUVE — un super-admin rattaché à une agence individual est renvoyé lui aussi', async () => {
    getMe.mockResolvedValue(moi(['super_admin']));
    resolveAgency.mockResolvedValue({ id: 7, kind: 'individual' });
    await expect(Layout({ children: ENFANT })).rejects.toThrow('NEXT_REDIRECT /app');
  });

  it('kind illisible, ou pas de jeton : refus (fail-closed)', async () => {
    getMe.mockResolvedValue(moi(['agency_admin']));
    resolveAgency.mockResolvedValue(null);
    await expect(Layout({ children: ENFANT })).rejects.toThrow('NEXT_REDIRECT /app');

    getToken.mockResolvedValue(undefined);
    await expect(Layout({ children: ENFANT })).rejects.toThrow('NEXT_REDIRECT /app');
  });

  it("l'admin d'une agence standard passe, et le kind se lit pour DÉCIDER", async () => {
    getMe.mockResolvedValue(moi(['agency_admin']));
    await expect(Layout({ children: ENFANT })).resolves.toBeTruthy();
    expect(resolveAgency).toHaveBeenCalledWith('jeton', 7, 'overview/agency', 'decision');
  });

  it('un super-admin sans agence passe — la page lui dit « aucune agence »', async () => {
    getMe.mockResolvedValue(moi(['super_admin'], null));
    await expect(Layout({ children: ENFANT })).resolves.toBeTruthy();
    expect(resolveAgency).not.toHaveBeenCalled();
  });
});
