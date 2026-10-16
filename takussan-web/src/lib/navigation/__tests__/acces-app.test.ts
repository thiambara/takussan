/**
 * TCK-641 (AC2, AC3) — « Mes biens » ne s'affiche qu'à qui peut ouvrir `/app/properties`.
 *
 * L'attendu n'est PAS recopié de `peutOuvrirMesBiens` : il est lu sur la garde du layout de la page
 * (`assertCanReachAgentArea`), exécutée pour chaque combinaison de rôles. Si l'une des deux règles
 * bouge sans l'autre, une ligne du tableau rougit — c'est précisément le « lien qui mène à un
 * refus » que le ticket interdit.
 */
import { describe, expect, it, vi } from 'vitest';
import { USER_ROLES, type UserRole } from '@/types/user';

const REFUS = new Error('redirect');
vi.mock('next/navigation', () => ({
  redirect: () => {
    throw REFUS;
  },
}));

const { assertCanReachAgentArea } = await import('@/lib/auth/guards');
const { peutOuvrirMesBiens, voitLePortefeuille } = await import('../acces-app');

function laGardeLaisseEntrer(roles: UserRole[]): boolean {
  try {
    assertCanReachAgentArea(roles);
    return true;
  } catch (e) {
    if (e !== REFUS) throw e;
    return false;
  }
}

/** Toutes les combinaisons de rôles : 2^7 comptes, du compte sans rôle au compte qui les a tous. */
const COMBINAISONS: UserRole[][] = Array.from({ length: 2 ** USER_ROLES.length }, (_, masque) =>
  USER_ROLES.filter((_, i) => (masque >> i) & 1),
);

describe('peutOuvrirMesBiens — d’accord avec la garde de /app/properties', () => {
  it.each(COMBINAISONS.map((roles) => [roles.join('+') || '(aucun rôle)', roles] as const))(
    '%s',
    (_nom, roles) => {
      expect(peutOuvrirMesBiens(roles)).toBe(laGardeLaisseEntrer(roles));
    },
  );

  it('la branche « refus » est atteinte par des rôles réels (client, prestataire)', () => {
    expect(peutOuvrirMesBiens(['customer'])).toBe(false);
    expect(peutOuvrirMesBiens(['service_provider', 'customer'])).toBe(false);
    expect(peutOuvrirMesBiens(['owner', 'customer'])).toBe(true);
  });
});

describe('voitLePortefeuille — l’entrée « Crédits » de /app (TCK-633 lot F)', () => {
  it.each([
    [['agency_admin'], true],
    [['super_admin'], true],
    [['agent', 'customer'], false],
    [['owner', 'customer'], false],
    [['customer'], false],
  ] as Array<[UserRole[], boolean]>)('%j → %s', (roles, attendu) => {
    expect(voitLePortefeuille(roles)).toBe(attendu);
  });
});
