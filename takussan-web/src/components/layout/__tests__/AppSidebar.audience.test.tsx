/**
 * TCK-379 — l'AUDIENCE des entrées de la barre `/app` : qui voit quoi.
 *
 * ⚠ Ce fichier est le second de son nom parce que TCK-377 et TCK-379 ont écrit chacun le leur,
 * depuis deux branches parties du même point. Les fusionner en un seul aurait demandé de
 * renommer des identifiants des deux côtés — c'est-à-dire de réécrire deux suites pour n'en
 * garder qu'une. Elles mesurent des choses différentes et vivent donc côte à côte :
 * `AppSidebar.test.tsx` éprouve le surlignage, le regroupement et les compteurs ;
 * celui-ci éprouve le jeu d'`href` que chaque rôle reçoit.
 *
 * TCK-2478 (ADR-0089) — le jeu se lit désormais PAR PERSONA, sur le menu composé
 * (`composerMenu`) : action principale, groupes, « Plus », complément et carte. La table par rôle
 * de `buildNavItems` (supprimé) est remplacée par la table par persona ci-dessous ; l'écart, rôle
 * par rôle, est écrit dans les notes de TCK-2478.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { AppSidebar } from '../AppSidebar';
import { composerMenu, entreesDuMenu } from '@/lib/navigation/composer-menu';
import { resoudrePersona, type Persona } from '@/lib/navigation/personas';
import type { ContexteDeMenu } from '@/lib/navigation/types';
import { USER_ROLES, type User, type UserRole } from '@/types/user';

// P152.03 — les rôles système portent `properties.create` : « Publier un bien » se juge par elle.
vi.mock('@/hooks/useCan', () => ({
  useMyCapabilities: () => ({ data: { data: { agency_id: 1, capabilities: ['properties.create'] } } }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/app',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));
// TCK-2478 — l'en-tête d'espace monte le sélecteur de profil ; ce fichier lit le menu seul.
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({ data: undefined, isLoading: false }),
  useSwitchActiveProfile: () => ({ mutate: vi.fn(), isPending: false }),
}));

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

/** Tout ce que le menu composé rend : action principale, entrées des groupes, carte. */
function hrefsDuMenu(ctx: ContexteDeMenu, persona: Persona): string[] {
  const menu = composerMenu(ctx, persona);
  return [
    ...(menu.action ? [menu.action.href] : []),
    ...entreesDuMenu(menu).map((e) => e.href),
    ...(menu.carte ? [menu.carte.href] : []),
  ];
}

/** Le menu d'un compte sans profil actif connu : le persona que ses rôles résolvent. */
function hrefsDesRoles(roles: UserRole[]): string[] {
  return hrefsDuMenu({ roles, capacites: ['properties.create'] }, resoudrePersona({ roles }));
}

const PAGES_D_AGENCE = [
  '/app/agency/team', '/app/agency/roles', '/app/agency', '/app/agency/kyc', '/app/agency/billing',
  '/app/agency/finances', '/app/agency/moderation', '/app/agency/moderation/properties',
  '/app/agency/audit', '/app/agency/integrations',
];
const PAGES_DE_L_HOTE = ['/app/agency', '/app/agency/kyc', '/app/agency/billing', '/app/agency/finances', '/app/agency/integrations'];

/** Les huit comptes, sous les jeux de rôles que l'API émet (le plancher `customer` compris). */
const COMPTES: Record<Persona, ContexteDeMenu> = {
  client: { roles: ['customer'], capacites: null },
  locataire: { roles: ['customer', 'tenant'], capacites: null },
  bailleur: { roles: ['customer', 'owner'], capacites: null },
  agent: { roles: ['customer', 'agent'], capacites: ['properties.create'] },
  'admin-agence': { roles: ['customer', 'agency_admin'], capacites: ['properties.create'], cheminsAdmin: PAGES_D_AGENCE },
  hote: { roles: ['customer', 'agency_admin', 'owner'], capacites: ['properties.create'], cheminsAdmin: PAGES_DE_L_HOTE },
  prestataire: { roles: ['customer', 'service_provider'], capacites: [] },
  plateforme: { roles: ['customer', 'super_admin'], capacites: [], cheminsAdmin: PAGES_D_AGENCE },
};

/**
 * TCK-379 — AC3, repris par TCK-2478 : la table des `href` PAR PERSONA.
 *
 * TCK-379 avait trouvé six entrées poussées SANS aucune condition de rôle (`/app/bookings`,
 * `/app/visits`, `/app/leases`, `/app/favorites`, `/app/saved-searches`, `/app/overview`), que le
 * dédoublonnage masquait pour tous les rôles sauf le prestataire. La leçon reste : la table est
 * écrite EN ENTIER et comparée EN ENTIER, pas par `not.toContain`. `not.toContain('/app/bookings')`
 * serait coché par une régression qui retire l'entrée à TOUT LE MONDE ; ici, retirer `/app/leases`
 * au locataire fait rougir la ligne `locataire`.
 *
 * Ce que la table dit : l'ensemble des écrans qu'un persona atteint depuis sa barre — où que la
 * disposition les place (groupe, « Plus », action, carte). La PLACE est gardée ailleurs
 * (`dispositions-validees.test.ts`, `AppSidebar.test.tsx`) ; l'ensemble ici. Écart avec la table
 * par rôle d'avant TCK-2478 :
 *  - client et locataire : `/publish` est la carte (plus une ligne), `/properties` (« Chercher un
 *    bien », la recherche publique) entre comme action du client et dans « Mes recherches » ;
 *  - bailleur, agent, admin, hôte, plateforme : `/app/tasks` (« Mes tâches », TCK-591), qui était
 *    hors menu, et les pages d'agence que la table ouvre (avant : ajoutées par `avecSectionAgence`) ;
 *  - prestataire : le plancher `customer` lui ouvre, sous « Plus », ses réservations, visites,
 *    favoris, recherches et baux (`occupeUnLogement`, TCK-379, inchangé — le menu de `dev` les lui
 *    montrait déjà sous ce jeu de rôles ; l'ancienne table sondait `['service_provider']` seul, que
 *    l'API n'émet pas).
 *  - Revue de TCK-2478 — prestataire encore : `/app/overview` QUITTE sa table (M2 : la garde de la
 *    page le renvoie sur `/app` s'il n'est pas locataire, le lien menait à une redirection) et
 *    `/app/calendar` Y ENTRE (M3 : `assertCanReachCalendar` lui ouvre la page, TCK-591).
 */
const ATTENDU: Record<Persona, string[]> = {
  client: [
    '/properties', '/publish',
    '/app', '/app/messages', '/app/favorites', '/app/saved-searches', '/app/visits', '/app/bookings',
    '/app/documents', '/app/profile/reviews', '/app/overview',
    '/app/maintenance', '/app/leases', '/app/payments', '/app/inventories',
  ],
  locataire: [
    '/app/payments', '/publish',
    '/app', '/app/messages', '/app/leases', '/app/maintenance', '/app/inventories', '/app/documents',
    '/properties', '/app/favorites', '/app/saved-searches', '/app/visits', '/app/bookings',
    '/app/profile/reviews', '/app/overview',
  ],
  // TCK-587 — `/app/properties/new` sous « Proposer un bien à mon agence » : le bailleur hors
  // personnel y PROPOSE un bien, le serveur impose brouillon + privé.
  bailleur: [
    '/app/properties/new',
    '/app', '/app/messages', '/app/properties', '/app/leases', '/app/payments', '/app/inventories',
    '/app/leads', '/app/visits', '/app/bookings', '/app/calendar', '/app/maintenance',
    '/app/customers', '/app/profile/reviews', '/app/documents', '/app/overview', '/app/overview/exports',
    '/app/favorites', '/app/saved-searches', '/app/tasks',
  ],
  // TCK-595 (AC17 bis) — pas de « Vue agence » : l'API la refuse à l'agent.
  agent: [
    '/app/properties/new',
    '/app', '/app/messages', '/app/tasks', '/app/leads', '/app/customers', '/app/visits', '/app/calendar',
    '/app/properties', '/app/bookings', '/app/leases', '/app/leases/onboarding-pending', '/app/inventories',
    '/app/maintenance', '/app/commissions', '/app/profile/reviews', '/app/documents', '/app/overview',
    '/app/overview/exports', '/app/favorites', '/app/saved-searches',
  ],
  'admin-agence': [
    '/app/properties/new',
    '/app', '/app/overview/agency', '/app/messages', '/app/leads', '/app/visits', '/app/bookings',
    '/app/calendar', '/app/properties', '/app/owners', '/app/customers', '/app/leases',
    '/app/leases/onboarding-pending', '/app/commissions', '/app/credits', ...PAGES_D_AGENCE,
    '/app/overview', '/app/overview/kpis', '/app/overview/alerts', '/app/overview/exports',
    '/app/maintenance', '/app/maintenance/providers', '/app/inventories', '/app/documents',
    '/app/profile/reviews', '/app/tasks', '/app/favorites', '/app/saved-searches',
  ],
  hote: [
    '/app/properties/new',
    '/app', '/app/messages', '/app/properties', '/app/bookings', '/app/visits', '/app/calendar',
    '/app/leads', '/app/leases', '/app/inventories', '/app/maintenance', '/app/maintenance/providers',
    '/app/credits', ...PAGES_DE_L_HOTE, '/app/customers', '/app/overview', '/app/overview/exports',
    '/app/overview/kpis', '/app/overview/alerts', '/app/profile/reviews', '/app/documents', '/app/tasks',
    '/app/favorites', '/app/saved-searches', '/app/payments', '/app/commissions',
    '/app/leases/onboarding-pending', '/app/overview/agency', '/app/owners',
  ],
  // Son métier en tête — interventions, messagerie, documents (§1.8 de features.md) —, et sous
  // « Plus » ce que le plancher `customer` lui ouvre.
  prestataire: [
    '/app', '/app/maintenance', '/app/messages', '/app/documents',
    '/app/bookings', '/app/visits', '/app/favorites', '/app/saved-searches', '/app/leases', '/app/calendar',
  ],
  plateforme: [
    '/app/properties/new',
    '/app', '/app/overview/agency', '/app/messages', '/app/leads', '/app/visits', '/app/bookings',
    '/app/calendar', '/app/properties', '/app/owners', '/app/customers', '/app/leases',
    '/app/leases/onboarding-pending', '/app/commissions', '/app/credits', ...PAGES_D_AGENCE,
    '/app/overview', '/app/overview/kpis', '/app/overview/alerts', '/app/overview/exports',
    '/app/maintenance', '/app/maintenance/providers', '/app/inventories', '/app/documents',
    '/app/profile/reviews', '/app/tasks', '/app/favorites', '/app/saved-searches',
  ],
};

/**
 * Le SOCLE — ce que le catalogue ouvre à n'importe quel compte authentifié,
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
 * Vérifié par ablation (TCK-495) : remettre l'alias `broker` dans `TYPE_MAP`
 * faisait rougir ce test en le nommant. Le courtier a depuis quitté le code
 * (ADR-0030) ; un alias sans écran ajouté demain rougirait de même.
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
        + `ni servis par le menu : ${inconnus.join(', ')}`,
    ).toEqual([]);
  });

  it('chaque alias de TYPE_MAP ouvre au moins un écran au-delà du socle', () => {
    const nus: string[] = [];
    for (const alias of aliasCommutables()) {
      const hrefs = hrefsDesRoles([alias as UserRole]);
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

describe('AppSidebar — table des href par persona (TCK-2478)', () => {
  for (const [persona, attendu] of Object.entries(ATTENDU) as [Persona, string[]][]) {
    it(`${persona} atteint exactement ses écrans`, () => {
      const hrefs = hrefsDuMenu(COMPTES[persona], persona);
      expect([...new Set(hrefs)].sort()).toEqual([...attendu].sort());
      expect(new Set(attendu).size, 'la table ne cite aucun écran deux fois').toBe(attendu.length);
    });
  }

  it('ne montre au prestataire seul ni réservations, ni baux, ni visites, ni statistiques — à l’écran', () => {
    // La table ci-dessus porte sur le PRODUCTEUR. Celui-ci monte réellement la barre et lit les
    // `href` du DOM : si un jour une entrée était rendue ailleurs que par le menu composé, la table
    // seule ne le verrait pas.
    // ⚠ TCK-2478 — `['service_provider']` SANS le plancher `customer` : c'est la garde du prédicat
    // POSITIF de TCK-379 (`occupeUnLogement`), que ce rôle seul ne satisfait pas. Sous le jeu que
    // l'API émet (`customer` en plus), ces écrans lui sont ouverts sous « Plus » (table ci-dessus).
    // TCK-377 a ajouté un compteur en `useQuery` dans cette barre : la monter hors d'un
    // `QueryClientProvider` lève. `retry: false` pour que l'échec du mock soit immédiat.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      withIntl(
        <QueryClientProvider client={client}>
          <AppSidebar user={utilisateur(['service_provider'])} />
        </QueryClientProvider>,
      ),
    );
    // `hidden: true` : un lien sous « Plus », replié, est au menu — il compte.
    const rendus = screen
      .getAllByRole('link', { hidden: true })
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
    // Cette assertion est ce qui interdit de la réécrire en négation. Les baux sont sous « Plus »
    // ou dans un groupe — peu importe : le test lit l'ensemble rendu.
    const hrefs = hrefsDesRoles(['service_provider', 'tenant', 'customer']);
    expect(hrefs).toContain('/app/leases');
    expect(hrefs).toContain('/app/bookings');
    expect(hrefs).toContain('/app/maintenance');
  });
});
