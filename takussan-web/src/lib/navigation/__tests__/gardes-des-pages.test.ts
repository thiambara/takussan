/**
 * Revue de TCK-2478 (M2, M3) — deux prédicats du catalogue qui contredisaient la garde de leur page :
 *
 *  · « Statistiques » (`/app/overview`) était ouverte à tout prestataire (plancher `customer`), que
 *    la page renvoie sur `/app` s'il n'est pas locataire — un lien vers une redirection ;
 *  · « Calendrier » (`/app/calendar`) était fermée au prestataire, que `assertCanReachCalendar` laisse
 *    entrer (TCK-591) — une page ouverte, absente du menu.
 *
 * L'attendu n'est PAS recopié du catalogue : il est lu sur la garde, EXÉCUTÉE pour chaque combinaison
 * de rôles (patron d'`acces-app.test.ts`). Si l'une bouge sans l'autre, une ligne rougit.
 */
import { describe, expect, it, vi } from 'vitest';
import { USER_ROLES, type UserRole } from '@/types/user';

class Redirection {
  constructor(readonly vers: string) {}
}

const { moi } = vi.hoisted(() => ({ moi: { roles: [] as UserRole[] } }));

vi.mock('next/navigation', () => ({
  redirect: (vers: string) => {
    throw new Redirection(vers);
  },
}));
// `agency_id: null` : la page n'aiguille l'admin sur son agence que s'il en a une ; sans agence, il va
// droit à la vue agence. Aucune lecture réseau.
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ({ id: 1, roles: moi.roles, agency_id: null }) }));
vi.mock('@/lib/session', () => ({ getToken: async () => null }));
vi.mock('@/lib/access/server-guards', () => ({ resolveAgencyOrNull: async () => null }));
vi.mock('@/lib/access/tableau-du-bailleur', () => ({
  vueBailleurOuverte: async () => true,
  repliDeLaVueBailleur: async () => '/app',
}));

const { assertCanReachCalendar } = await import('@/lib/auth/guards');
const { default: OverviewPage } = await import('@/app/(dashboard)/app/overview/page');
const { CATALOGUE } = await import('../catalogue');

const COMBINAISONS: UserRole[][] = Array.from({ length: 2 ** USER_ROLES.length }, (_, masque) =>
  USER_ROLES.filter((_, i) => (masque >> i) & 1),
);
const nom = (roles: UserRole[]) => roles.join('+') || '(aucun rôle)';
const destination = (id: string) => CATALOGUE.find((d) => d.id === id)!;

/** `/app/overview` est un aiguillage : « ouverte » = il mène à une vue, pas de retour sur `/app`. */
async function laVueSOuvre(roles: UserRole[]): Promise<boolean> {
  moi.roles = roles;
  try {
    await OverviewPage();
  } catch (e) {
    if (!(e instanceof Redirection)) throw e;
    return e.vers !== '/app';
  }
  throw new Error('la page d’aiguillage a rendu sans rediriger');
}

function leCalendrierSOuvre(roles: UserRole[]): boolean {
  try {
    assertCanReachCalendar(roles);
    return true;
  } catch (e) {
    if (!(e instanceof Redirection)) throw e;
    return false;
  }
}

describe('« Statistiques » — d’accord avec l’aiguillage de /app/overview (M2)', () => {
  it.each(COMBINAISONS.map((roles) => [nom(roles), roles] as const))('%s', async (_nom, roles) => {
    expect(destination('statistiques').accessible({ roles, capacites: [] })).toBe(await laVueSOuvre(roles));
  });

  it('le prestataire réel n’a pas « Statistiques », le prestataire locataire si', () => {
    expect(destination('statistiques').accessible({ roles: ['customer', 'service_provider'], capacites: [] })).toBe(false);
    expect(destination('statistiques').accessible({ roles: ['customer', 'service_provider', 'tenant'], capacites: [] })).toBe(true);
  });
});

describe('« Calendrier » — d’accord avec assertCanReachCalendar (M3)', () => {
  it.each(COMBINAISONS.map((roles) => [nom(roles), roles] as const))('%s', (_nom, roles) => {
    expect(destination('calendrier').accessible({ roles, capacites: [] })).toBe(leCalendrierSOuvre(roles));
  });
});
