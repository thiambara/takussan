import { describe, expect, it } from 'vitest';
import {
  getPrimaryRole,
  isBroker,
  isCustomer,
  isCustomerOnly,
  isTenant,
} from '@/lib/roles';
import { buildNavItems } from '@/components/layout/AppSidebar';
import type { User, UserRole } from '@/types/user';

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
function compte(roles: UserRole[]): User {
  return {
    id: 1,
    first_name: 'A',
    last_name: 'T',
    full_name: 'A T',
    email: 'a@t.sn',
    phone: null,
    bio: null,
    avatar_url: null,
    email_verified_at: null,
    phone_verified_at: null,
    two_factor_enabled: false,
    agency_id: null,
    roles,
    status: 'active',
    created_at: '2026-08-31T00:00:00Z',
  };
}

const hrefs = (roles: UserRole[]) => buildNavItems(compte(roles)).map((i) => i.href);

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
    ['courtier', ['broker', 'customer']],
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
    const menu = hrefs(['customer']);
    expect(menu).toContain('/app/bookings');
    expect(menu).toContain('/app/visits');
    expect(menu).toContain('/app/leases');
  });

  it('un bailleur garde SON menu et n’hérite pas de celui de l’acheteur', () => {
    // La régression que `isCustomerOnly` empêche : `/app/properties` disparaît
    // et `/app/profile/reviews` apparaît si la première branche l'emporte.
    const menu = hrefs(['owner', 'customer']);
    expect(menu).toContain('/app/properties');
    expect(menu).not.toContain('/app/profile/reviews');
  });

  it('un agent garde son menu d’agent', () => {
    const menu = hrefs(['agent', 'customer']);
    expect(menu).toContain('/app/properties/new');
    expect(menu).toContain('/app/customers');
    expect(menu).not.toContain('/app/profile/reviews');
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

  it('isBroker existe enfin — le rôle était émis et n’avait aucun prédicat', () => {
    expect(isBroker(['broker', 'customer'])).toBe(true);
    expect(isBroker(['customer'])).toBe(false);
  });

  it('getPrimaryRole rend broker plutôt que null pour un courtier', () => {
    // Le tableau littéral qu'il employait omettait `broker` : un courtier
    // obtenait `null`, c'est-à-dire « aucun rôle » pour un compte qui en porte
    // un. `Record<UserRole, number>` rend l'oubli impossible à recommencer.
    expect(getPrimaryRole(['broker', 'customer'])).toBe('broker');
  });

  it('getPrimaryRole préfère toujours le rôle professionnel au plancher', () => {
    expect(getPrimaryRole(['customer', 'tenant'])).toBe('tenant');
    expect(getPrimaryRole(['agency_admin', 'customer', 'tenant'])).toBe('agency_admin');
    expect(getPrimaryRole(['customer'])).toBe('customer');
  });
});
