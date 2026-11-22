/**
 * Revue de TCK-2478 (M2, M3) — deux prédicats du catalogue qui contredisaient la garde de leur page :
 *
 *  · « Statistiques » (`/app/overview`) était ouverte à tout prestataire (plancher `customer`), que
 *    la page renvoie sur `/app` s'il n'est pas locataire — un lien vers une redirection (depuis
 *    TCK-2625, la page renvoie sur `/app` tout compte qui n'est ni admin, ni agent, ni bailleur).
 *    TCK-2628 — l'entrée est devenue « Rapports » (`/app/reports`) : son prédicat se juge sur la garde
 *    de la section, `garderLesRapports`, avec la VRAIE résolution de la persona (`lireLeContexteDesRapports`) ;
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
vi.mock('@/lib/session', () => ({ getToken: async () => null, getActiveProfileId: async () => undefined }));
vi.mock('@/lib/access/pages-admin-server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/access/pages-admin-server')>()),
  accesAdmin: async () => ({ chemins: [], espaceIndividuel: false }),
  capacitesDuProfilActif: async () => [],
}));
vi.mock('@/lib/access/server-guards', () => ({ resolveAgencyOrNull: async () => null }));
vi.mock('@/lib/access/tableau-du-bailleur', () => ({
  vueBailleurOuverte: async () => true,
  repliDeLaVueBailleur: async () => '/app',
}));

const { assertCanReachCalendar } = await import('@/lib/auth/guards');
const { garderLesRapports } = await import('@/lib/rapports/gardes-serveur');
const { CATALOGUE } = await import('../catalogue');

const COMBINAISONS: UserRole[][] = Array.from({ length: 2 ** USER_ROLES.length }, (_, masque) =>
  USER_ROLES.filter((_, i) => (masque >> i) & 1),
);
const nom = (roles: UserRole[]) => roles.join('+') || '(aucun rôle)';
const destination = (id: string) => CATALOGUE.find((d) => d.id === id)!;

/** « Rapports » s'ouvre-t-il ? La garde de la section passe, ou renvoie sur `/app` (persona sans rapports). */
async function lesRapportsSOuvrent(roles: UserRole[]): Promise<boolean> {
  moi.roles = roles;
  try {
    await garderLesRapports();
    return true;
  } catch (e) {
    if (!(e instanceof Redirection)) throw e;
    if (e.vers !== '/app') throw new Error(`redirection inattendue : ${e.vers}`);
    return false;
  }
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

describe('« Rapports » — d’accord avec la garde de /app/reports (M2, TCK-2628)', () => {
  it.each(COMBINAISONS.map((roles) => [nom(roles), roles] as const))('%s', async (_nom, roles) => {
    expect(destination('rapports').accessible({ roles, capacites: [] })).toBe(await lesRapportsSOuvrent(roles));
  });

  it('le prestataire n’a pas « Rapports » ; TCK-2625 : le locataire et le client non plus (leur vue est l’accueil)', () => {
    expect(destination('rapports').accessible({ roles: ['customer', 'service_provider'], capacites: [] })).toBe(false);
    expect(destination('rapports').accessible({ roles: ['customer', 'service_provider', 'tenant'], capacites: [] })).toBe(false);
    expect(destination('rapports').accessible({ roles: ['customer', 'tenant'], capacites: [] })).toBe(false);
    expect(destination('rapports').accessible({ roles: ['customer', 'owner'], capacites: [] })).toBe(true);
  });
});

describe('« Calendrier » — d’accord avec assertCanReachCalendar (M3)', () => {
  it.each(COMBINAISONS.map((roles) => [nom(roles), roles] as const))('%s', (_nom, roles) => {
    expect(destination('calendrier').accessible({ roles, capacites: [] })).toBe(leCalendrierSOuvre(roles));
  });
});
