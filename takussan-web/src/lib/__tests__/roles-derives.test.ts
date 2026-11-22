import { describe, expect, it } from 'vitest';
import {
  getPrimaryRole,
  isCustomer,
  isCustomerOnly,
  isTenant,
} from '@/lib/roles';
import { composerMenu, entreesDuMenu } from '@/lib/navigation/composer-menu';
import { resoudrePersona } from '@/lib/navigation/personas';
import { USER_ROLES, type UserRole } from '@/types/user';

/**
 * TCK-492 — ce que la dérivation de `customer` et `tenant` change côté front.
 *
 * L'API émet désormais `customer` pour TOUTE identité authentifiée, et `tenant`
 * quand un bail est en cours. Quatre surfaces qui en dépendaient se rallument
 * — mais la même bascule retourne aussi le sens d'`isCustomer`, qui servait de
 * DISCRIMINANT à huit endroits.
 *
 * ⚠ C'est ce second effet que ces tests gardent, parce que c'est celui qu'un
 * correctif pressé fabrique : `buildNavItems` enchaîne
 * `if (isCustomer) … else if (isOwner) … else if (isAgent)`. Rallumer `customer`
 * sans relire cette chaîne aurait donné le menu d'un acheteur à tous les
 * professionnels du produit, et AUCUN test existant ne l'aurait vu — les tables
 * de `AppSidebar.test.tsx` sondent des rôles isolés (`['agent']`), jamais les
 * jeux que l'API émet réellement (`['agent', 'customer']`).
 */
/**
 * TCK-2478 (ADR-0089) — le menu lu ici est celui que la barre rend : la disposition du persona que
 * les rôles résolvent (aucun profil actif connu → le type dominant), composée par `composerMenu`.
 * Toutes les entrées comptent, l'action principale comprise, « Plus » et la carte aussi : la
 * question posée par ces tests est « le compte l'a-t-il au menu ? », pas « où ? ».
 *
 * Le docblock ci-dessus parle de `buildNavItems` et de sa chaîne `if … else if` : c'est le
 * mécanisme que ces tests ont gardé jusqu'à TCK-2477, supprimé par TCK-2478. Le piège qu'il décrit
 * survit sous une autre forme — `isCustomerOnly` décide de « client » dans le catalogue — et ces
 * mêmes assertions le gardent.
 */
// P152.03 — le rôle système de l'agent porte `properties.create`.
function menuDe(roles: UserRole[]) {
  const m = composerMenu({ roles, capacites: ['properties.create'] }, resoudrePersona({ roles }));
  return [...(m.action ? [m.action] : []), ...entreesDuMenu(m), ...(m.carte ? [m.carte] : [])];
}
const hrefs = (roles: UserRole[]) => menuDe(roles).map((e) => e.href);
const libelles = (roles: UserRole[]) => menuDe(roles).map((e) => e.labelKey);

describe('isCustomer est devenu un plancher, isCustomerOnly le discriminant', () => {
  it('isCustomer répond oui à un agent — et c’est correct, pas un défaut', () => {
    // `customer` est le plancher : un agent PEUT agir en client. La question
    // « ce compte peut-il réserver une visite ? » a toujours la même réponse.
    expect(isCustomer(['agent', 'customer'])).toBe(true);
  });

  it('isCustomerOnly répond non au même agent — c’est lui qui sépare', () => {
    expect(isCustomerOnly(['agent', 'customer'])).toBe(false);
    expect(isCustomerOnly(['customer'])).toBe(true);
  });

  it.each<[string, UserRole[]]>([
    ['bailleur', ['owner', 'customer']],
    ['agent', ['agent', 'customer']],
    ['admin d’agence', ['agency_admin', 'customer']],
    ['prestataire', ['service_provider', 'customer']],
    ['super-admin', ['super_admin', 'customer']],
  ])('un %s n’est jamais « client seulement », même avec un bail en cours', (_nom, roles) => {
    expect(isCustomerOnly(roles)).toBe(false);
    expect(isCustomerOnly([...roles, 'tenant'])).toBe(false);
  });
});

describe('le menu latéral sous les jeux de rôles que l’API émet vraiment', () => {
  it('un acheteur pur porte ses réservations, ses visites et ses baux', () => {
    // AC4 — c'est le compte qui sort d'une inscription Google : aucun profil,
    // donc `roles: ['customer']` et rien d'autre. Avant TCK-492 il recevait
    // `[]` et n'avait qu'un tableau de bord vide.
    // TCK-2478 — les baux sont sous « Plus » (arbitrage 1 du porteur) : au menu quand même.
    const menu = hrefs(['customer']);
    expect(menu).toContain('/app/bookings');
    expect(menu).toContain('/app/visits');
    expect(menu).toContain('/app/leases');
  });

  it('un bailleur garde SON menu et n’hérite pas de celui de l’acheteur', () => {
    // La régression que `isCustomerOnly` empêche : `/app/properties` disparaît
    // et « Mes avis » de l'acheteur apparaît si la première branche l'emporte.
    // TCK-597 — le LIBELLÉ, plus le href : `/app/profile/reviews` est aussi la boîte des avis
    // reçus du bailleur (« Avis reçus »), qu'il reçoit à bon droit.
    const menu = hrefs(['owner', 'customer']);
    expect(menu).toContain('/app/properties');
    expect(libelles(['owner', 'customer'])).not.toContain('myReviews');
    expect(libelles(['owner', 'customer'])).toContain('receivedReviews');
  });

  it('un agent garde son menu d’agent', () => {
    const menu = hrefs(['agent', 'customer']);
    expect(menu).toContain('/app/properties/new');
    expect(menu).toContain('/app/customers');
    expect(libelles(['agent', 'customer'])).not.toContain('myReviews');
  });

  it('un bailleur qui loue par ailleurs ne reçoit pas ses baux en double', () => {
    // Le modèle est additif : ce compte porte `owner`, `customer` et `tenant`.
    // Deux blocs poussent `/app/leases` ; le dédoublonnage doit tenir.
    const menu = hrefs(['owner', 'customer', 'tenant']);
    expect(menu.filter((h) => h === '/app/leases')).toHaveLength(1);
  });

  it('un prestataire qui est aussi locataire garde ses baux, et pas ses biens', () => {
    const menu = hrefs(['service_provider', 'customer', 'tenant']);
    expect(menu).toContain('/app/leases');
    expect(menu).toContain('/app/maintenance');
    expect(menu).not.toContain('/app/properties');
  });
});

describe('les prédicats dérivés', () => {
  it('isTenant ne se déclenche que sur un bail en cours', () => {
    expect(isTenant(['customer'])).toBe(false);
    expect(isTenant(['customer', 'tenant'])).toBe(true);
  });

  /**
   * TCK-495 — deux cas vivaient ici sur `broker` : `isBroker()` et le
   * `getPrimaryRole` d'un courtier. Le prédicat est supprimé avec le rôle
   * (le courtier a depuis quitté le code, ADR-0030), et
   * la propriété que le second mesurait — **`getPrimaryRole` ne rend jamais
   * `null` à un compte qui porte un rôle** — n'est pas perdue : elle est
   * reprise ci-dessous sur l'union entière, ce qui la rend plus forte que sur
   * un seul rôle. C'est ce que TCK-494 reprochait au tableau littéral d'origine.
   */
  it('getPrimaryRole ne rend jamais null pour un rôle que l’API émet', () => {
    for (const role of USER_ROLES) {
      expect(getPrimaryRole([role]), `${role} doit avoir un rang`).toBe(role);
    }
  });

  it('getPrimaryRole préfère toujours le rôle professionnel au plancher', () => {
    expect(getPrimaryRole(['customer', 'tenant'])).toBe('tenant');
    expect(getPrimaryRole(['agency_admin', 'customer', 'tenant'])).toBe('agency_admin');
    expect(getPrimaryRole(['customer'])).toBe('customer');
  });
});
