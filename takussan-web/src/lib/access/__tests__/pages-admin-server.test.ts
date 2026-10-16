import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { User, UserRole } from '@/types/user';

/**
 * TCK-633 (lot B) — la garde des pages d'administration, sous `/app/agency/*` depuis TCK-649.
 *
 * Trois issues, et chacune a son test : la page s'ouvre ; la page est refusée et l'on va à la
 * PREMIÈRE page accessible (`/app` s'il n'y en a aucune) ; on n'a pas pu vérifier, et l'on va à
 * `/verification-indisponible` — jamais « non » déguisé.
 */
const getMe = vi.fn();
const resolveAgency = vi.fn();
const apiRequest = vi.fn();
const getToken = vi.fn();
const getActiveProfileId = vi.fn();

vi.mock('@/app/actions/auth', () => ({ getMeAction: () => getMe() }));
vi.mock('@/lib/session', () => ({
  getToken: () => getToken(),
  getActiveProfileId: () => getActiveProfileId(),
}));
vi.mock('@/lib/access/server-guards', () => ({
  ROUTE_VERIF_INDISPONIBLE: '/verification-indisponible',
  resolveAgencyOrNull: (...a: unknown[]) => resolveAgency(...a),
}));
vi.mock('@/lib/api', () => {
  class ApiError extends Error {
    constructor(
      public readonly status: number,
      public readonly data: unknown = null,
    ) {
      super(`API error ${status}`);
    }
  }
  return { ApiError, apiRequest: (...a: unknown[]) => apiRequest(...a) };
});
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT ${url}`), { digest: `NEXT_REDIRECT;replace;${url};307;` });
  },
}));

const { ApiError } = await import('@/lib/api');
const { accesAdmin, garderPageAdmin } = await import('../pages-admin-server');

const moi = (roles: UserRole[], agency_id: number | null = 7) =>
  ({ id: 1, roles, agency_id }) as unknown as User;

function capacites(liste: string[]) {
  apiRequest.mockResolvedValue({ data: { agency_id: 7, capabilities: liste } });
}

beforeEach(() => {
  vi.clearAllMocks();
  getToken.mockResolvedValue('jeton');
  getActiveProfileId.mockResolvedValue('agency_admin:12');
  resolveAgency.mockResolvedValue({ id: 7, kind: 'standard' });
  capacites(['agency.update_billing']);
});

describe('garderPageAdmin — une page refusée renvoie à la première accessible', () => {
  it('un solo sur /app/agency/team est renvoyé vers /app/agency', async () => {
    getMe.mockResolvedValue(moi(['agency_admin', 'customer']));
    resolveAgency.mockResolvedValue({ id: 7, kind: 'individual' });
    await expect(garderPageAdmin('/app/agency/team')).rejects.toThrow(/^NEXT_REDIRECT \/app\/agency$/);
  });

  // TCK-649, AC3 — l'exemple du ticket : `/app/agency/roles` refusé à l'admin d'une agence
  // `individual` renvoie vers SA première page accessible. Le 307 tient à l'absence de toute
  // frontière de suspension au-dessus de la page (`etats-de-route.test.ts`).
  it('AC3 — un solo sur /app/agency/roles est renvoyé vers /app/agency, sa première page', async () => {
    getMe.mockResolvedValue(moi(['agency_admin', 'owner', 'customer']));
    resolveAgency.mockResolvedValue({ id: 7, kind: 'individual' });
    await expect(garderPageAdmin('/app/agency/roles')).rejects.toMatchObject({
      digest: 'NEXT_REDIRECT;replace;/app/agency;307;',
    });
  });

  it("un solo ouvre /app/agency, sans qu'on lise ni son agence ni ses capacités", async () => {
    getMe.mockResolvedValue(moi(['agency_admin']));
    await expect(garderPageAdmin('/app/agency')).resolves.toBeUndefined();
    expect(resolveAgency).not.toHaveBeenCalled();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("un admin standard ouvre /app/agency/team, et l'agence est lue pour DÉCIDER", async () => {
    getMe.mockResolvedValue(moi(['agency_admin']));
    await expect(garderPageAdmin('/app/agency/team')).resolves.toBeUndefined();
    expect(resolveAgency).toHaveBeenCalledWith('jeton', 7, 'pages-admin', 'decision');
  });

  it('kind illisible : refus, vers une page qui ne l’exige pas', async () => {
    getMe.mockResolvedValue(moi(['agency_admin']));
    resolveAgency.mockResolvedValue(null);
    await expect(garderPageAdmin('/app/agency/audit')).rejects.toThrow(/^NEXT_REDIRECT \/app\/agency$/);
  });

  it('sans jeton : refus, comme un kind illisible (fail-closed)', async () => {
    getMe.mockResolvedValue(moi(['agency_admin']));
    getToken.mockResolvedValue(undefined);
    await expect(garderPageAdmin('/app/agency/team')).rejects.toThrow(/^NEXT_REDIRECT \/app\/agency$/);
    expect(resolveAgency).not.toHaveBeenCalled();
  });

  it("un compte sans aucune page d'admin est renvoyé vers /app", async () => {
    getMe.mockResolvedValue(moi(['owner', 'customer'], null));
    await expect(garderPageAdmin('/app/agency')).rejects.toThrow(/^NEXT_REDIRECT \/app$/);
  });

  it('un super-admin ouvre tout, sans lire ni agence ni capacités', async () => {
    getMe.mockResolvedValue(moi(['super_admin'], null));
    for (const chemin of ['/app/agency/roles', '/app/agency/team', '/app/agency/audit', '/app/agency/billing'] as const) {
      await expect(garderPageAdmin(chemin)).resolves.toBeUndefined();
    }
    expect(resolveAgency).not.toHaveBeenCalled();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe('garderPageAdmin — la capacité', () => {
  it('reversements : ouverts avec agency.update_billing, hint de profil transmis', async () => {
    getMe.mockResolvedValue(moi(['agency_admin']));
    await expect(garderPageAdmin('/app/agency/billing')).resolves.toBeUndefined();
    expect(apiRequest).toHaveBeenCalledWith('/api/me/capabilities', {
      token: 'jeton',
      activeProfileId: 'agency_admin:12',
    });
  });

  it('reversements : refusés sans la capacité', async () => {
    getMe.mockResolvedValue(moi(['agency_admin']));
    resolveAgency.mockResolvedValue({ id: 7, kind: 'individual' });
    capacites([]);
    await expect(garderPageAdmin('/app/agency/billing')).rejects.toThrow(/^NEXT_REDIRECT \/app\/agency$/);
  });

  it("capacités illisibles (500) : « je n'ai pas pu vérifier », pas « non »", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getMe.mockResolvedValue(moi(['agency_admin']));
    apiRequest.mockRejectedValue(new ApiError(500, null));
    await expect(garderPageAdmin('/app/agency/billing')).rejects.toThrow(
      /^NEXT_REDIRECT \/verification-indisponible$/,
    );
  });

  it('403 sur les capacités : un refus, silencieux', async () => {
    getMe.mockResolvedValue(moi(['agency_admin']));
    apiRequest.mockRejectedValue(new ApiError(403, null));
    // TCK-647 — la première page accessible n'est plus le tableau de bord, parti de la table.
    await expect(garderPageAdmin('/app/agency/billing')).rejects.toThrow(/^NEXT_REDIRECT \/app\/agency\/team$/);
  });
});

describe('accesAdmin', () => {
  it('rend les pages du solo et « espace individuel », agence lue pour AFFICHER', async () => {
    getMe.mockResolvedValue(moi(['agency_admin']));
    resolveAgency.mockResolvedValue({ id: 7, kind: 'individual' });
    expect(await accesAdmin()).toEqual({
      chemins: [
        '/app/agency',
        '/app/agency/kyc',
        '/app/agency/billing',
        '/app/agency/finances',
        '/app/agency/finances/reconciliation',
        '/app/agency/integrations',
      ],
      espaceIndividuel: true,
    });
    expect(resolveAgency).toHaveBeenCalledWith('jeton', 7, 'pages-admin', 'affichage');
  });

  it("prend l'utilisateur qu'on lui passe, sans relire la session", async () => {
    await accesAdmin(moi(['agency_admin']));
    expect(getMe).not.toHaveBeenCalled();
  });
});
