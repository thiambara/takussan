import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { User, UserRole } from '@/types/user';

/**
 * TCK-379 — AC4 : `/app/overview` n'envoie plus un prestataire sur le tableau de bord LOCATAIRE.
 *
 * L'aiguillage écrivait `if (isServiceProvider(roles)) redirect('/app/overview/tenant')` : un
 * prestataire qui cliquait « Statistiques » atterrissait sur une vue qui lui répond
 * `has_customer_profile: false`. Aucun tableau de bord prestataire n'est spécifié
 * (`docs/features.md` §2.5) et en inventer un serait hors spec — il est donc ramené à `/app`.
 *
 * ⚠ Ce test EXÉCUTE la page. Une assertion sur le texte source (`expect(source).not.toContain`)
 * aurait été cochée par un déplacement de la ligne, et n'aurait rien dit du repli — or c'est le
 * repli qui compte : `/app/overview/page.tsx` finit par un `redirect('/app/overview/tenant')`
 * attrape-tout, donc supprimer la ligne coupable SANS rien mettre à la place laisse le
 * prestataire exactement là où il était.
 */

class RedirectionSimulee extends Error {
  constructor(readonly cible: string) {
    super(`NEXT_REDIRECT:${cible}`);
  }
}

vi.mock('next/navigation', () => ({
  redirect: (cible: string) => {
    throw new RedirectionSimulee(cible);
  },
}));

const me = vi.hoisted(() => ({ user: null as User | null }));

vi.mock('@/app/actions/auth', () => ({
  getMeAction: async () => me.user,
}));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton-de-test' }));
vi.mock('@/lib/access/server-guards', () => ({
  resolveAgencyOrNull: async () => ({ id: 1, kind: 'standard' }),
}));

function utilisateur(roles: UserRole[], agencyId: number | null = null): User {
  return { id: 1, roles, agency_id: agencyId } as unknown as User;
}

async function cibleDe(roles: UserRole[], agencyId: number | null = null): Promise<string> {
  me.user = utilisateur(roles, agencyId);
  const { default: OverviewPage } = await import('../page');
  try {
    await OverviewPage();
  } catch (e) {
    if (e instanceof RedirectionSimulee) return e.cible;
    throw e;
  }
  throw new Error('la page n’a redirigé nulle part');
}

describe('/app/overview — aiguillage par rôle', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('n’envoie plus un prestataire vers la vue locataire', async () => {
    expect(await cibleDe(['service_provider'])).not.toBe('/app/overview/tenant');
  });

  it('ramène le prestataire à son point d’entrée', async () => {
    expect(await cibleDe(['service_provider'])).toBe('/app');
  });

  it('laisse intacts les aiguillages des autres rôles', async () => {
    // La contrepartie : une régression qui renverrait TOUT LE MONDE vers `/app` cocherait les
    // deux assertions ci-dessus sans en cocher une seule de celles-ci.
    expect(await cibleDe(['customer'])).toBe('/app/overview/tenant');
    expect(await cibleDe(['tenant'])).toBe('/app/overview/tenant');
    expect(await cibleDe(['owner'])).toBe('/app/overview/owner');
    expect(await cibleDe(['agent'])).toBe('/app/overview/agent');
    expect(await cibleDe(['agency_admin'], 1)).toBe('/app/overview/agency');
  });

  it('un prestataire qui est AUSSI locataire garde sa vue locataire', async () => {
    // C'est son autre rôle qui la lui donne : la garde ne doit pas retirer un accès légitime.
    expect(await cibleDe(['service_provider', 'tenant'])).toBe('/app/overview/tenant');
  });
});
