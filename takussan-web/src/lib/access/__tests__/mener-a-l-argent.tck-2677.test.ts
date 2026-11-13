import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { User, UserRole } from '@/types/user';

/**
 * TCK-2677 — qui `/app/payments` mène à « Argent » : l'admin de l'agence active (standard), et lui
 * seul. Mêmes doublures que `pages-admin-server.test.ts`.
 */
const resolveAgency = vi.fn();
const apiRequest = vi.fn();
const getToken = vi.fn();

vi.mock('@/app/actions/auth', () => ({ getMeAction: vi.fn() }));
vi.mock('@/lib/session', () => ({ getToken: () => getToken(), getActiveProfileId: async () => 'p' }));
vi.mock('@/lib/access/server-guards', () => ({
  ROUTE_VERIF_INDISPONIBLE: '/verification-indisponible',
  resolveAgencyOrNull: (...a: unknown[]) => resolveAgency(...a),
}));
vi.mock('@/lib/api', () => ({ ApiError: class extends Error {}, apiRequest: (...a: unknown[]) => apiRequest(...a) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

const { menerALArgent } = await import('../pages-admin-server');

const moi = (roles: UserRole[], agency_id: number | null = 7) => ({ id: 1, roles, agency_id }) as unknown as User;

beforeEach(() => {
  vi.clearAllMocks();
  getToken.mockResolvedValue('jeton');
  resolveAgency.mockResolvedValue({ id: 7, kind: 'standard' });
});

describe('TCK-2677 — menerALArgent', () => {
  it('l’admin d’une agence standard y va (le rôle client du compte n’y change rien)', async () => {
    expect(await menerALArgent(moi(['agency_admin', 'customer']))).toBe(true);
    // La lecture de l'agence est celle de l'affichage : une panne ne fait pas tomber la page.
    expect(resolveAgency).toHaveBeenCalledWith('jeton', 7, 'pages-admin', 'affichage');
    // Aucune capacité lue : la page « Argent » n'en exige pas.
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('l’hôte (agence individual) garde /app/payments', async () => {
    resolveAgency.mockResolvedValue({ id: 7, kind: 'individual' });
    expect(await menerALArgent(moi(['agency_admin', 'customer']))).toBe(false);
  });

  it('un kind illisible laisse l’ancien écran — jamais l’hôte mené à « Argent » par défaut', async () => {
    resolveAgency.mockResolvedValue(null);
    expect(await menerALArgent(moi(['agency_admin']))).toBe(false);
  });

  it('sans jeton, l’agence n’est pas lue : pas de redirection', async () => {
    getToken.mockResolvedValue(undefined);
    expect(await menerALArgent(moi(['agency_admin']))).toBe(false);
  });

  // TCK-2749 — il y va aussi : son relevé de gérance est dans « Argent », registre « Reversements ».
  it('l’admin qui est aussi bailleur y va', async () => {
    expect(await menerALArgent(moi(['agency_admin', 'owner']))).toBe(true);
  });

  it('l’admin bailleur d’une agence individual (l’hôte) garde /app/payments', async () => {
    resolveAgency.mockResolvedValue({ id: 7, kind: 'individual' });
    expect(await menerALArgent(moi(['agency_admin', 'owner']))).toBe(false);
  });

  it.each<[string, UserRole[], number | null]>([
    ['l’agent', ['agent', 'customer'], 7],
    ['le locataire', ['tenant', 'customer'], 7],
    ['le bailleur', ['owner', 'customer'], 7],
    ['le client', ['customer'], null],
    ['le super-admin, même dans une agence', ['super_admin', 'agency_admin'], 7],
    ['un admin sans agence', ['agency_admin'], null],
  ])('%s n’y va pas', async (_nom, roles, agence) => {
    expect(await menerALArgent(moi(roles, agence))).toBe(false);
  });
});
