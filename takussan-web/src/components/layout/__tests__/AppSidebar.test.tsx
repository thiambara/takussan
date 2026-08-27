import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { AppSidebar, buildNavItems } from '../AppSidebar';
import type { User, UserRole } from '@/types/user';

vi.mock('next/navigation', () => ({ usePathname: () => '/app' }));

function utilisateur(roles: UserRole[]): User {
  return {
    id: 1,
    first_name: 'Awa',
    last_name: 'Diop',
    full_name: 'Awa Diop',
    email: 'awa@example.test',
    roles,
  } as unknown as User;
}

/**
 * TCK-379 — AC3 : la table des `href` par rôle.
 *
 * Six entrées de `buildNavItems` étaient poussées SANS aucune condition de rôle : `/app/bookings`,
 * `/app/visits`, `/app/leases`, `/app/favorites`, `/app/saved-searches` et `/app/overview`. Le
 * dédoublonnage final masquait le défaut pour tous les rôles SAUF le prestataire — seul rôle à
 * qui ces entrées n'arrivaient que par là. Aucun test ne montait cette barre.
 *
 * ⚠ La table est écrite EN ENTIER et comparée EN ENTIER, pas par `not.toContain`. La différence
 * n'est pas cosmétique : `expect(hrefs).not.toContain('/app/bookings')` serait coché par une
 * régression qui retire l'entrée à TOUT LE MONDE. Ici, retirer `/app/leases` au locataire fait
 * rougir la ligne `tenant` — et c'est précisément le cinquième défaut que ce ticket a failli
 * fabriquer, le rôle `tenant` n'apparaissant nulle part ailleurs dans `buildNavItems`.
 */
const ATTENDU: Record<string, string[]> = {
  customer: [
    '/app', '/app/favorites', '/app/saved-searches', '/app/visits', '/app/bookings',
    '/app/maintenance', '/app/leases', '/app/payments', '/app/inventories',
    '/app/profile/reviews', '/app/messages', '/app/documents', '/app/overview',
  ],
  tenant: [
    '/app', '/app/favorites', '/app/saved-searches', '/app/messages', '/app/documents',
    '/app/overview', '/app/bookings', '/app/visits', '/app/leases',
  ],
  owner: [
    '/app', '/app/properties', '/app/favorites', '/app/saved-searches', '/app/bookings',
    '/app/maintenance', '/app/leases', '/app/payments', '/app/messages', '/app/documents',
    '/app/overview', '/app/overview/exports', '/app/customers', '/app/inventories',
    '/app/visits', '/app/calendar',
  ],
  agent: [
    '/app', '/app/properties', '/app/properties/new', '/app/favorites', '/app/saved-searches',
    '/app/bookings', '/app/leases', '/app/maintenance', '/app/messages', '/app/documents',
    '/app/overview', '/app/overview/exports', '/app/overview/agency', '/app/customers',
    '/app/inventories', '/app/visits', '/app/calendar', '/app/leases/onboarding-pending',
  ],
  agency_admin: [
    '/app', '/app/properties', '/app/properties/new', '/app/favorites', '/app/saved-searches',
    '/app/bookings', '/app/leases', '/app/maintenance', '/app/maintenance/providers',
    '/app/messages', '/app/documents', '/app/overview', '/app/overview/exports',
    '/app/overview/agency', '/app/overview/kpis', '/app/overview/alerts', '/app/owners',
    '/app/customers', '/app/inventories', '/app/visits', '/app/calendar',
    '/app/leases/onboarding-pending', '/admin',
  ],
  super_admin: [
    '/app', '/app/properties', '/app/properties/new', '/app/favorites', '/app/saved-searches',
    '/app/bookings', '/app/leases', '/app/maintenance', '/app/maintenance/providers',
    '/app/messages', '/app/documents', '/app/overview', '/app/overview/exports',
    '/app/overview/agency', '/app/overview/kpis', '/app/overview/alerts', '/app/owners',
    '/app/customers', '/app/inventories', '/app/visits', '/app/calendar',
    '/app/leases/onboarding-pending', '/admin',
  ],
  // Son métier, et rien d'autre : interventions, messagerie, documents (§1.8 de features.md).
  service_provider: ['/app', '/app/maintenance', '/app/messages', '/app/documents'],
};

describe('AppSidebar — table des href par rôle', () => {
  for (const [role, attendu] of Object.entries(ATTENDU)) {
    it(`${role} reçoit exactement ses entrées`, () => {
      const hrefs = buildNavItems(utilisateur([role as UserRole])).map((i) => i.href);
      expect(hrefs).toEqual(attendu);
    });
  }

  it('ne montre au prestataire ni réservations, ni baux, ni visites, ni statistiques — à l’écran', () => {
    // Le test de table ci-dessus porte sur le PRODUCTEUR. Celui-ci monte réellement la barre et
    // lit les `href` du DOM : si un jour une entrée était rendue ailleurs que par `buildNavItems`,
    // la table seule ne le verrait pas.
    render(withIntl(<AppSidebar user={utilisateur(['service_provider'])} />));
    const rendus = screen
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'))
      .filter((h): h is string => Boolean(h));

    for (const interdit of ['/app/bookings', '/app/leases', '/app/visits', '/app/overview']) {
      expect(rendus, `${interdit} ne concerne pas un prestataire`).not.toContain(interdit);
    }
    // …et il garde bien son métier : le retrait ne doit pas vider la barre.
    expect(rendus).toContain('/app/maintenance');
    expect(rendus).toContain('/app/messages');
    expect(rendus).toContain('/app/documents');
  });

  it('un compte prestataire ET locataire garde ses baux', () => {
    // `roles` est un tableau : la garde est un prédicat POSITIF, pas `!isServiceProvider`.
    // Cette assertion est ce qui interdit de la réécrire en négation.
    const hrefs = buildNavItems(utilisateur(['service_provider', 'tenant'])).map((i) => i.href);
    expect(hrefs).toContain('/app/leases');
    expect(hrefs).toContain('/app/bookings');
    expect(hrefs).toContain('/app/maintenance');
  });
});
