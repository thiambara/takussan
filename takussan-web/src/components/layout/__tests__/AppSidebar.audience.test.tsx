/**
 * TCK-379 — l'AUDIENCE des entrées de la barre `/app` : qui voit quoi.
 *
 * ⚠ Ce fichier est le second de son nom parce que TCK-377 et TCK-379 ont écrit chacun le leur,
 * depuis deux branches parties du même point. Les fusionner en un seul aurait demandé de
 * renommer des identifiants des deux côtés — c'est-à-dire de réécrire deux suites pour n'en
 * garder qu'une. Elles mesurent des choses différentes et vivent donc côte à côte :
 * `AppSidebar.test.tsx` éprouve le surlignage, le regroupement et les compteurs ;
 * celui-ci éprouve le jeu d'`href` que chaque rôle reçoit.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { AppSidebar, buildNavItems } from '../AppSidebar';
import { USER_ROLES, type User, type UserRole } from '@/types/user';

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
  // TCK-492 — le locataire reçoit désormais le parcours client COMPLET, et pas
  // un sous-ensemble. Ce n'est pas un élargissement décidé ici : `buildNavItems`
  // ouvre son bloc client sur `isCustomerOnly`, et quelqu'un dont le seul rôle
  // est `tenant` n'a aucun profil professionnel. L'ancienne ligne mesurait un
  // monde où `customer` n'était jamais émis — un locataire y arrivait sans lui,
  // ce qui ne se produit plus : l'API émet toujours `customer` avec `tenant`.
  tenant: [
    '/app', '/app/favorites', '/app/saved-searches', '/app/visits', '/app/bookings',
    '/app/maintenance', '/app/leases', '/app/payments', '/app/inventories',
    '/app/profile/reviews', '/app/messages', '/app/documents', '/app/overview',
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

/**
 * Le SOCLE — ce que `buildNavItems` donne à n'importe quel compte authentifié,
 * sans considération de rôle. Trois entrées, lisibles dans les lignes ci-dessus :
 * elles sont l'intersection de toutes.
 */
const SOCLE = ['/app', '/app/messages', '/app/documents'];

/**
 * TCK-495 AC2 — **aucun profil commutable ne mène nulle part.**
 *
 * `ActiveProfileResolver::TYPE_MAP` est la liste de ce qu'un compte peut CHOISIR
 * dans le sélecteur d'espaces. Un alias qui s'y trouve et qui n'ouvre rien de
 * plus que le socle est le défaut que ce ticket a soldé : le courtier existait
 * comme profil commutable, avec ses tables, ses factories et son entrée dans le
 * sélecteur, et n'avait **aucune** route API ni page front. Quiconque en
 * obtenait un pouvait le sélectionner et se retrouvait devant un produit qui ne
 * le connaissait pas.
 *
 * ⚠ Cette garde lit le FICHIER PHP, comme celles de TCK-329 et TCK-494 — pas un
 * commentaire, pas la recopie front. Elle échoue bruyamment si elle ne trouve
 * pas sa source : un ensemble vide n'est pas une propriété tenue, c'est la
 * forme de vacuité qui ressemble le plus à un succès.
 *
 * ⚠ **Ce qu'elle ne prouve pas** : que les écrans ouverts soient les BONS, ni
 * qu'ils existent réellement à ces `href`. C'est un plancher — « ce rôle mène
 * quelque part » —, pas une preuve de justesse. La table `ATTENDU` ci-dessus est
 * ce qui juge du détail.
 *
 * Vérifié par ablation : remettre `'broker' => BrokerProfile::class` dans
 * `TYPE_MAP` fait rougir ce test en nommant `broker`.
 */
const RESOLVER_PHP = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', '..', '..',
  'takussan-api', 'app', 'Services', 'Profiles', 'ActiveProfileResolver.php',
);

function aliasCommutables(): string[] {
  const php = readFileSync(RESOLVER_PHP, 'utf8');
  const bloc = /public const TYPE_MAP\s*=\s*\[([\s\S]*?)\];/.exec(php);
  expect(bloc, `TYPE_MAP introuvable dans ${RESOLVER_PHP}`).not.toBeNull();
  const alias = [...bloc![1].matchAll(/'([a-z_]+)'\s*=>/g)].map((m) => m[1]);
  expect(
    alias.length,
    'aucun alias extrait de TYPE_MAP — la garde n’aurait rien vérifié',
  ).toBeGreaterThan(0);
  return alias;
}

describe('TCK-495 — aucun profil commutable ne mène nulle part', () => {
  /**
   * ⚠ **Ce cas est en DEUX temps, et le premier a été ajouté après une ablation
   * qui n'a pas rougi.** Écrite en un temps — « le menu de cet alias dépasse le
   * socle » —, la garde était VIDE pour le cas même qu'elle prétendait
   * attraper : un alias absent de `UserRole` n'est reconnu par aucun prédicat,
   * `isCustomerOnly()` le rend donc `true`, et `buildNavItems` lui sert le
   * parcours client COMPLET. Remettre `broker` dans `TYPE_MAP` la laissait
   * verte, en lui faisant mesurer un menu d'acheteur attribué par défaut.
   *
   * *Un rôle inconnu qui reçoit le menu le plus fourni est le pire des faux
   * verts : la garde lit « il mène quelque part » là où le produit ne sait pas
   * qui il est.* D'où le premier temps — l'alias doit être un rôle que le front
   * connaît — avant le second.
   */
  it('chaque alias de TYPE_MAP est un rôle que le front connaît', () => {
    const inconnus = aliasCommutables().filter((a) => !(USER_ROLES as readonly string[]).includes(a));
    expect(
      inconnus,
      `ces profils sont commutables mais absents de UserRole, donc ni reconnus `
        + `ni servis par buildNavItems : ${inconnus.join(', ')}`,
    ).toEqual([]);
  });

  it('chaque alias de TYPE_MAP ouvre au moins un écran au-delà du socle', () => {
    const nus: string[] = [];
    for (const alias of aliasCommutables()) {
      const hrefs = buildNavItems(utilisateur([alias as UserRole])).map((i) => i.href);
      if (hrefs.every((h) => SOCLE.includes(h))) nus.push(alias);
    }
    expect(
      nus,
      `ces profils sont proposés au choix et n’ouvrent aucun écran : ${nus.join(', ')}`,
    ).toEqual([]);
  });

  it('le courtier n’est plus proposé au choix — l’occurrence qui a motivé la garde', () => {
    expect(aliasCommutables()).not.toContain('broker');
  });
});

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
    // TCK-377 a ajouté un compteur en `useQuery` dans cette barre : la monter hors d'un
    // `QueryClientProvider` lève désormais. `retry: false` pour que l'échec du mock soit
    // immédiat plutôt que réessayé trois fois.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      withIntl(
        <QueryClientProvider client={client}>
          <AppSidebar user={utilisateur(['service_provider'])} />
        </QueryClientProvider>,
      ),
    );
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
