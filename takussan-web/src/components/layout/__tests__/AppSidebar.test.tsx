/**
 * TCK-377 — La barre latérale de `/app`, éprouvée sur les quatre défauts que le ticket nomme.
 *
 * Chaque bloc ci-dessous est écrit pour ROUGIR sur la régression qu'il prétend garder, et chacun a
 * été rejoué par ablation (le détail est dans le rapport du ticket). En particulier :
 *
 *  - « surlignage sur une page fille » rougit si `pathname === item.href` revient ;
 *  - « une seule entrée active » rougit sur un préfixe NAÏF (sans départage par longueur) ;
 *  - l'ordre des sections rougit si {@link SECTION_ORDER} est réordonné ;
 *  - l'AC6 rougit si les compteurs sont armés en dur, **sur le composant monté** et pas seulement
 *    sur la fonction pure.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { LayoutDashboard } from 'lucide-react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User, UserRole } from '@/types/user';
import { withIntl } from '@/test/intl';
import {
  AppSidebar,
  buildNavItems,
  countersToPoll,
  groupBySection,
  withSectionHeadings,
  SECTION_ORDER,
  type NavItem,
} from '../AppSidebar';
import { AdminSidebar } from '../AdminSidebar';
import { resolveActiveHref, APP_EXACT_ROOTS } from '@/lib/navigation/active-path';

let pathname = '/app';
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}));

type OptionsDeSondage = { enabled?: boolean };
type ReponseCompteur = { data?: { meta: { total: number } } };

// Les deux compteurs sont MOQUÉS : ce fichier éprouve la barre latérale, pas le réseau. Les
// arguments sont capturés parce que l'AC6 porte précisément sur eux (`{ enabled }`).
const unreadMock = vi.fn<(options: OptionsDeSondage) => number>(() => 0);
vi.mock('@/components/chat-widget/useUnreadCount', () => ({
  useUnreadCount: (options: OptionsDeSondage = {}) => unreadMock(options),
}));

const pendingVisitsMock = vi.fn<(options: OptionsDeSondage) => ReponseCompteur>(() => ({}));
vi.mock('@/lib/queries/visits', () => ({
  usePendingVisitsCount: (options: OptionsDeSondage = {}) => pendingVisitsMock(options),
}));

// `AdminSidebar` sonde deux files de modération ; on ne teste ici que son `aria-current`.
vi.mock('@/lib/queries/reviews-moderation', () => ({
  fetchModerationQueue: vi.fn(async () => ({ meta: { pending_count: 0 } })),
}));
vi.mock('@/lib/queries/property-moderation', () => ({
  fetchPropertyModerationQueue: vi.fn(async () => ({ meta: { pending_count: 0 } })),
}));

function userWith(roles: UserRole[]): User {
  return {
    id: 1,
    first_name: 'Astou',
    last_name: 'Dieng',
    full_name: 'Astou Dieng',
    email: 'astou@example.com',
    phone: null,
    bio: null,
    avatar_url: null,
    email_verified_at: null,
    phone_verified_at: null,
    two_factor_enabled: false,
    roles,
    status: 'active',
    created_at: '2026-05-08T10:00:00.000000Z',
  };
}

function renderSidebar(roles: UserRole[], at: string) {
  pathname = at;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <AppSidebar user={userWith(roles)} agencyIsStandard />
      </QueryClientProvider>,
    ),
  );
}

/** Les entrées portant `aria-current="page"`, par leur libellé visible. */
function activeLabels(): string[] {
  return screen
    .getAllByRole('link')
    .filter((el) => el.getAttribute('aria-current') === 'page')
    .map((el) => el.textContent?.trim() ?? '');
}

beforeEach(() => {
  unreadMock.mockReset();
  unreadMock.mockReturnValue(0);
  pendingVisitsMock.mockReset();
  pendingVisitsMock.mockReturnValue({ data: undefined });
});

/**
 * Le jeu d'`href` attendu par rôle — **et ce docblock a été faux pendant une heure**, ce qui est la
 * raison pour laquelle il commence par le dire.
 *
 * Il annonçait « relevé pris sur le code d'AVANT TCK-377 […] toute divergence ici est une
 * régression de droits ». C'était vrai de six lignes sur sept. **Pas de la septième :** la ligne
 * `service_provider` a été RÉGÉNÉRÉE depuis le code d'APRÈS TCK-379, qui lui retire délibérément
 * réservations, baux, visites, favoris, recherches sauvegardées et statistiques. *Une table
 * recopiée du résultat n'affirme plus rien sur ce résultat* — et une phrase qui promet le
 * contraire est pire que pas de phrase, parce qu'on ne s'en méfie pas.
 *
 * Ce que cette table est réellement, aujourd'hui :
 *
 *  - pour `customer`, `tenant`, `agent`, `agency_admin`, `owner`, `super_admin` : un relevé
 *    d'AVANT TCK-377, que ni TCK-377 (qui n'ajoute qu'un `section:`) ni TCK-379 (qui ne touche
 *    qu'au prestataire) ne devaient bouger. Une divergence y est une régression de droits.
 *  - pour `service_provider` : la SPEC, pas un relevé — `docs/features.md` §1.8 et §2.5 ne lui
 *    accordent que ses interventions, sa messagerie et ses documents. C'est
 *    `AppSidebar.audience.test.tsx` qui porte cette justification en entier, avec la même table.
 *
 * ⚠ **La table est donc dupliquée entre les deux fichiers, et il faut éditer les DEUX.** La
 * duplication n'est pas gratuite : c'est elle qui rend l'AC6 ci-dessous indépendant. Le jeu sondé
 * y est dérivé de CETTE table plus {@link COMPTEUR_PAR_HREF}, jamais du prédicat de
 * `countersToPoll` — sans quoi le test se comparerait à lui-même.
 */
const HREFS_PAR_ROLE: Record<UserRole, string[]> = {
  customer: [
    '/app', '/app/favorites', '/app/saved-searches', '/app/visits', '/app/bookings',
    '/app/maintenance', '/app/leases', '/app/payments', '/app/inventories',
    '/app/profile/reviews', '/app/messages', '/app/documents', '/app/overview',
  ],
  tenant: [
    '/app', '/app/favorites', '/app/saved-searches', '/app/messages', '/app/documents',
    '/app/overview', '/app/bookings', '/app/visits', '/app/leases',
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
  owner: [
    '/app', '/app/properties', '/app/favorites', '/app/saved-searches', '/app/bookings',
    '/app/maintenance', '/app/leases', '/app/payments', '/app/messages', '/app/documents',
    '/app/overview', '/app/overview/exports', '/app/customers', '/app/inventories',
    '/app/visits', '/app/calendar',
  ],
  // TCK-379 — ce relevé figeait le comportement d'AVANT : le prestataire recevait
  // favoris, recherches sauvegardées, statistiques, réservations, visites et baux, dont
  // `docs/features.md` §2.5 ne lui accorde rien. La liste suit le correctif, elle ne le
  // précède pas — et `AppSidebar.audience.test.tsx` mesure la même chose autrement.
  service_provider: ['/app', '/app/maintenance', '/app/messages', '/app/documents'],
  super_admin: [
    '/app', '/app/properties', '/app/properties/new', '/app/favorites', '/app/saved-searches',
    '/app/bookings', '/app/leases', '/app/maintenance', '/app/maintenance/providers',
    '/app/messages', '/app/documents', '/app/overview', '/app/overview/exports',
    '/app/overview/agency', '/app/overview/kpis', '/app/overview/alerts', '/app/owners',
    '/app/customers', '/app/inventories', '/app/visits', '/app/calendar',
    '/app/leases/onboarding-pending', '/admin',
  ],
};

const ROLES = Object.keys(HREFS_PAR_ROLE) as UserRole[];

/**
 * Les DEUX seules entrées comptées, et le compteur que chacune porte — **écrit ici, à la main**.
 *
 * C'est la seconde moitié de l'indépendance de l'AC6. Le jeu sondé attendu se dérive de
 * {@link HREFS_PAR_ROLE} et de cette correspondance ; il ne se dérive PAS de `item.counterKey`,
 * qui est ce que le composant produit. Un test qui recalculerait l'attendu avec le prédicat de
 * `countersToPoll` ne pourrait plus rougir sur une erreur de ce prédicat — c'est exactement ce
 * qu'il faisait avant, et il a survécu à la mutation qui armait les deux compteurs en dur.
 */
const COMPTEUR_PAR_HREF: Record<string, 'unreadMessages' | 'pendingVisits'> = {
  '/app/messages': 'unreadMessages',
  '/app/visits': 'pendingVisits',
};

/** Ce qu'un rôle DOIT sonder, déduit de sa ligne de la table et de rien d'autre. */
function sondesAttendues(role: UserRole): Set<'unreadMessages' | 'pendingVisits'> {
  const cles = new Set<'unreadMessages' | 'pendingVisits'>();
  for (const href of HREFS_PAR_ROLE[role]) {
    const cle = COMPTEUR_PAR_HREF[href];
    if (cle) cles.add(cle);
  }
  return cles;
}

describe('AC1 — surlignage sur une page fille', () => {
  it('allume « Mes biens » sur /app/properties/42', () => {
    renderSidebar(['agency_admin'], '/app/properties/42');
    expect(activeLabels()).toEqual(['Mes biens']);
  });

  it.each([
    ['/app/leases/7', 'Baux'],
    ['/app/bookings/12', 'Réservations'],
    ['/app/visits/3', 'Visites'],
    ['/app/maintenance/9', 'Maintenance'],
    ['/app/documents/4', 'Documents'],
    ['/app/inventories/5', 'États des lieux'],
    ['/app/customers/8', 'Clients (CRM)'],
    ['/app/leases/new', 'Baux'],
    ['/app/customers/new', 'Clients (CRM)'],
    ['/app/inventories/new', 'États des lieux'],
    ['/app/maintenance/new', 'Maintenance'],
  ])('allume la bonne entrée sur %s', (route, label) => {
    renderSidebar(['agency_admin'], route);
    expect(activeLabels()).toEqual([label]);
  });
});

describe('AC2 — jamais deux entrées allumées sur des routes imbriquées', () => {
  // Cinq couples, pas trois : le ticket n'en nommait que trois et manquait
  // `/app/maintenance` ⊃ `/app/maintenance/providers` et `/app/overview` ⊃ ses quatre filles.
  it.each([
    ['/app/properties/new', 'Publier un bien'],
    ['/app/leases/onboarding-pending', 'Onboardings en attente'],
    ['/app/maintenance/providers', 'Carnet prestataires'],
    ['/app/overview/kpis', 'KPIs'],
    ['/app/overview/exports', 'Exports'],
  ])('%s n’allume que « %s »', (route, label) => {
    renderSidebar(['agency_admin'], route);
    expect(activeLabels()).toEqual([label]);
  });

  it('la racine /app ne devient le parent de rien', () => {
    renderSidebar(['agency_admin'], '/app/profile');
    expect(activeLabels()).toEqual([]);
  });

  it('/app allume « Tableau de bord », et lui seul', () => {
    renderSidebar(['agency_admin'], '/app');
    expect(activeLabels()).toEqual(['Tableau de bord']);
  });

  it('un préfixe SANS départage par longueur allumerait deux entrées — la preuve', () => {
    const hrefs = ['/app/properties', '/app/properties/new'];
    const naif = hrefs.filter((h) => '/app/properties/new'.startsWith(h));
    expect(naif).toHaveLength(2);
    expect(resolveActiveHref('/app/properties/new', hrefs, APP_EXACT_ROOTS))
      .toBe('/app/properties/new');
  });
});

describe('AC3 — aria-current="page"', () => {
  it('AppSidebar le porte sur l’entrée active', () => {
    renderSidebar(['agency_admin'], '/app/leases/7');
    expect(screen.getByRole('link', { name: 'Baux' })).toHaveAttribute('aria-current', 'page');
  });

  it('AdminSidebar le porte aussi', () => {
    pathname = '/admin/settings/tags';
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      withIntl(
        <QueryClientProvider client={client}>
          <AdminSidebar user={userWith(['super_admin'])} agencyIsStandard />
        </QueryClientProvider>,
      ),
    );
    const actifs = screen
      .getAllByRole('link')
      .filter((el) => el.getAttribute('aria-current') === 'page');
    expect(actifs).toHaveLength(1);
    expect(actifs[0]).toHaveTextContent('Paramètres');
  });

  it('AdminSidebar n’allume plus DEUX modérations sur /admin/moderation/properties', () => {
    pathname = '/admin/moderation/properties';
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      withIntl(
        <QueryClientProvider client={client}>
          <AdminSidebar user={userWith(['super_admin'])} agencyIsStandard />
        </QueryClientProvider>,
      ),
    );
    const actifs = screen
      .getAllByRole('link')
      .filter((el) => el.getAttribute('aria-current') === 'page');
    expect(actifs).toHaveLength(1);
  });
});

describe('AC4 — le regroupement ne change AUCUN droit', () => {
  it.each(Object.keys(HREFS_PAR_ROLE) as UserRole[])(
    'le jeu d’href de %s est inchangé, à l’ordre près',
    (role) => {
      const apres = buildNavItems(userWith([role])).map((item) => item.href);
      expect([...apres].sort()).toEqual([...HREFS_PAR_ROLE[role]].sort());
      expect(apres).toHaveLength(HREFS_PAR_ROLE[role].length);
    },
  );

  it('les 23 entrées d’un agency_admin sont réparties en sections, toutes connues', () => {
    const items = buildNavItems(userWith(['agency_admin']));
    expect(items).toHaveLength(23);
    for (const item of items) expect(SECTION_ORDER).toContain(item.section);
    const groupes = groupBySection(items);
    expect(groupes.length).toBeGreaterThan(1);
    expect(groupes.flatMap((g) => g.items)).toHaveLength(23);
  });

  it('un rôle sans catalogue ne voit aucune césure vide', () => {
    const groupes = groupBySection(buildNavItems(userWith(['customer'])));
    expect(groupes.map((g) => g.section)).not.toContain('catalog');
    expect(groupes.flatMap((g) => g.items)).toHaveLength(13);
  });

  it('les en-têtes de section sont peints pour un agency_admin', () => {
    renderSidebar(['agency_admin'], '/app');
    for (const libelle of ['CATALOGUE', 'DÉCOUVRIR', 'DEMANDES', 'ENGAGEMENTS', 'PILOTAGE']) {
      // Les en-têtes sont mis en capitales par CSS (`uppercase`) : on cherche le texte SOURCE.
      expect(
        screen.getByText(libelle.charAt(0) + libelle.slice(1).toLowerCase(), { exact: false }),
      ).toBeInTheDocument();
    }
  });

  /**
   * D5 — l'ORDRE des sections, qui n'était testé nulle part.
   *
   * Le test au-dessus vérifie la PRÉSENCE des cinq en-têtes, jamais leur séquence : mutation
   * mesurée le 2026-08-27 — `SECTION_ORDER` intégralement inversé (« Administration » en haut de
   * la barre, « Tableau de bord » en bas) → **88/88 verts**. Or l'ordre EST la thèse du ticket
   * (« découvrir → demander → s'engager → piloter »), pas un détail de présentation.
   *
   * La séquence est lue DANS LE DOM et comparée à une liste écrite à la main : la dériver de
   * `SECTION_ORDER` reviendrait à comparer la constante à elle-même.
   */
  it('les en-têtes paraissent dans l’ordre du parcours métier, pas dans un autre', () => {
    const { container } = renderSidebar(['agency_admin'], '/app');
    const entetes = Array.from(container.querySelectorAll('nav p')).map((p) =>
      p.textContent?.trim(),
    );
    expect(entetes).toEqual([
      'Catalogue',
      'Découvrir',
      'Demandes',
      'Engagements',
      'Pilotage',
      'Administration',
    ]);
  });

  it('le groupement s’efface quand une seule section est peuplée', () => {
    const items = buildNavItems(userWith(['agency_admin']))
      .filter((item) => item.section === 'manage');
    expect(groupBySection(items)).toHaveLength(1);
    expect(withSectionHeadings(groupBySection(items))).toBe(false);
  });

  /**
   * D4 — l'effacement du groupement, qui n'était gardé nulle part.
   *
   * Mutation mesurée le 2026-08-27 : `withHeadings = true` en dur → **88/88 verts**. Le seul test
   * proche appelait `groupBySection` sur une liste filtrée à la main et n'atteignait jamais la
   * décision. Et il ne pouvait pas l'atteindre : dans sa forme `groups.length > 1`, la règle
   * n'était **basculée par aucun utilisateur** — `/app`, `/app/messages` et `/app/documents` sont
   * poussées sans condition de rôle, donc tout compte a au moins deux groupes, y compris un
   * compte sans aucun rôle. *Une règle qu'aucune entrée ne peut violer n'est pas gardable.*
   *
   * Elle est désormais atteinte par un rôle réel (cf. le test suivant).
   */
  it.each([
    ['une seule section, même bien remplie', ['manage', 'manage', 'manage'], false],
    ['deux sections libellées à UNE entrée chacune', ['requests', 'engagements'], false],
    ['deux sections dont une libellée à deux entrées', ['requests', 'requests', 'admin'], true],
    ['la seule section à deux entrées est `primary`, qui n’a pas de libellé',
      ['primary', 'primary', 'admin'], false],
  ])('en-têtes — %s', (_cas, sections, attendu) => {
    const items = (sections as NavItem['section'][]).map((section, index) => ({
      href: `/app/x${index}`,
      labelKey: 'dashboard',
      icon: LayoutDashboard,
      section,
    }));
    expect(withSectionHeadings(groupBySection(items))).toBe(attendu);
  });

  it('le prestataire, avec quatre entrées, ne se voit infliger AUCUNE césure', () => {
    // Le rôle le moins loti : `/app`, `/app/maintenance`, `/app/messages`, `/app/documents`.
    // Deux sections libellées y portaient UNE entrée chacune — trois césures pour quatre lignes,
    // ce que la Direction UX du ticket nomme explicitement comme le défaut à ne pas produire.
    const { container } = renderSidebar(['service_provider'], '/app');
    expect(container.querySelectorAll('nav p')).toHaveLength(0);
    // …et la barre n'est pas vidée pour autant : le contrat d'href du rôle est intact.
    const rendus = Array.from(container.querySelectorAll('nav a')).map((a) =>
      a.getAttribute('href'),
    );
    // À l'ordre près : le DOM suit `SECTION_ORDER`, la table suit l'ordre de poussée.
    expect([...rendus].sort()).toEqual([...HREFS_PAR_ROLE.service_provider].sort());
  });
});

describe('AC5 — un compteur ne s’affiche ni à zéro ni en échec', () => {
  it('rien à zéro', () => {
    unreadMock.mockReturnValue(0);
    pendingVisitsMock.mockReturnValue({ data: { meta: { total: 0 } } });
    renderSidebar(['agency_admin'], '/app');
    expect(screen.queryByLabelText(/message non lu|messages non lus/)).toBeNull();
    expect(screen.queryByLabelText(/demande de visite|demandes de visite/)).toBeNull();
  });

  it('rien quand la requête échoue (data undefined)', () => {
    unreadMock.mockReturnValue(0);
    pendingVisitsMock.mockReturnValue({ data: undefined });
    renderSidebar(['agency_admin'], '/app');
    expect(screen.queryByLabelText(/demande de visite|demandes de visite/)).toBeNull();
    expect(screen.queryByText('—')).toBeNull();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('la pastille paraît, avec son libellé accessible, dès qu’il y a quelque chose', () => {
    unreadMock.mockReturnValue(3);
    pendingVisitsMock.mockReturnValue({ data: { meta: { total: 7 } } });
    renderSidebar(['agency_admin'], '/app');
    expect(screen.getByLabelText('3 messages non lus')).toHaveTextContent('3');
    expect(screen.getByLabelText('7 demandes de visite en attente')).toHaveTextContent('7');
  });

  it('au-delà de 99, la pastille dit 99+ sans mentir sur son libellé', () => {
    unreadMock.mockReturnValue(140);
    renderSidebar(['agency_admin'], '/app');
    expect(screen.getByLabelText('140 messages non lus')).toHaveTextContent('99+');
  });
});

describe('AC6 — aucun sondage pour un rôle qui ne voit pas l’entrée comptée', () => {
  it('les deux compteurs sont armés quand les deux entrées sont là', () => {
    renderSidebar(['agency_admin'], '/app');
    expect(unreadMock).toHaveBeenCalledWith({ enabled: true });
    expect(pendingVisitsMock).toHaveBeenCalledWith({ enabled: true });
  });

  it('countersToPoll n’arme que ce que la liste contient', () => {
    const items = buildNavItems(userWith(['agency_admin']));
    const sansVisites = items.filter((item) => item.href !== '/app/visits');
    expect(countersToPoll(sansVisites).has('pendingVisits')).toBe(false);
    expect(countersToPoll(sansVisites).has('unreadMessages')).toBe(true);
    expect(countersToPoll([]).size).toBe(0);
  });

  it('une entrée cadenassée n’est pas sondée', () => {
    const cadenasse: NavItem[] = buildNavItems(userWith(['agency_admin']))
      .map((item) => (item.counterKey ? { ...item, locked: true } : item));
    expect(countersToPoll(cadenasse).size).toBe(0);
  });

  /**
   * ⚠ **Ce bloc a été refait après une revue adverse, et la raison est la plus instructive du
   * lot.** Sa version précédente écrivait :
   *
   * ```ts
   * const attendus = new Set(items.filter((i) => i.counterKey && !i.locked).map((i) => i.counterKey));
   * expect(countersToPoll(items)).toEqual(attendus);
   * ```
   *
   * `item.counterKey && !item.locked` est **le corps même de `countersToPoll`**, appliqué au
   * MÊME `items`. Le test se comparait donc à son sujet : aucune erreur de ce prédicat, et
   * aucun changement de garde de rôle, ne pouvait le faire rougir. Sa seule clause falsifiable
   * était `attendus.size > 0`. *Une tautologie coûte plus cher qu'un test absent : elle occupe
   * la place de celui qui manquait.*
   *
   * Elle avait elle-même remplacé un `expect(…​.size).toBe(2)` devenu faux quand TCK-379 a
   * retiré `/app/visits` au prestataire. Le nombre figé n'est donc pas la réponse non plus.
   * L'attendu est ici DÉRIVÉ de deux sources indépendantes du composant :
   * {@link HREFS_PAR_ROLE} (qui voit quoi) et {@link COMPTEUR_PAR_HREF} (quelle entrée porte
   * quel compteur), toutes deux écrites à la main.
   */
  it.each(ROLES)('countersToPoll rend, pour %s, le jeu déduit de ses href', (role) => {
    expect(countersToPoll(buildNavItems(userWith([role])))).toEqual(sondesAttendues(role));
  });

  /**
   * D2 — l'AC6 éprouvé **sur le composant monté**, et non sur la fonction pure.
   *
   * La fonction pouvait être juste et le composant l'ignorer : mutation mesurée le 2026-08-27 —
   * `useUnreadCount({ enabled: true })` et `usePendingVisitsCount({ enabled: true })` écrits en
   * dur, `countersToPoll` jamais appelée par le rendu → **88/88 verts**. Aucun test ne montait
   * alors la barre d'un rôle pour qui la bonne réponse est `false`.
   */
  it.each(ROLES)('la barre montée pour %s n’arme que les compteurs de ses entrées', (role) => {
    const sondes = sondesAttendues(role);
    renderSidebar([role], '/app');
    expect(unreadMock).toHaveBeenCalledWith({ enabled: sondes.has('unreadMessages') });
    expect(pendingVisitsMock).toHaveBeenCalledWith({ enabled: sondes.has('pendingVisits') });
  });

  it('la branche « pas de sondage » est atteinte par un rôle RÉEL', () => {
    // Sans cette clause, les deux `it.each` ci-dessus seraient verts dans un monde où tous les
    // rôles sondent tout — c'est-à-dire dans le monde d'avant TCK-379, où l'AC6 était coché par
    // une branche que personne n'exécutait. Le prestataire garde ses messages et perd ses
    // visites : c'est CE rôle qui rend `enabled: false` observable à l'écran.
    expect([...sondesAttendues('service_provider')]).toEqual(['unreadMessages']);
    const jamaisSondees = ROLES.filter((role) => !sondesAttendues(role).has('pendingVisits'));
    expect(jamaisSondees).toEqual(['service_provider']);
  });
});

describe('accessibilité du <nav>', () => {
  it('la navigation porte un nom accessible', () => {
    renderSidebar(['customer'], '/app');
    expect(screen.getByRole('navigation', { name: 'Navigation du tableau de bord' }))
      .toBeInTheDocument();
  });

  it('chaque lien de la barre porte un anneau de focus', () => {
    renderSidebar(['customer'], '/app');
    for (const lien of screen.getAllByRole('link')) {
      expect(lien.className).toContain('focus-visible:ring-2');
      expect(lien.className).toContain('focus-visible:ring-ring');
    }
  });

  it('l’entrée cadenassée garde sa sémantique et perd son opacité illisible', () => {
    pathname = '/app';
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      withIntl(
        <QueryClientProvider client={client}>
          <AppSidebar user={userWith(['agency_admin'])} agencyIsStandard={false} />
        </QueryClientProvider>,
      ),
    );
    // TROIS entrées sont cadenassées pour un agency_admin `individual` : « Vue agence »,
    // « Bailleurs » et « Administration » (`/admin` figure aussi dans `PRO_ROUTES`).
    const cadenasses = screen.getAllByTitle('Réservé aux comptes pro');
    expect(cadenasses).toHaveLength(3);
    for (const entree of cadenasses) {
      expect(entree).toHaveAttribute('aria-disabled', 'true');
      expect(entree.querySelector('svg')).not.toBeNull();
      // `opacity-60` composait `--muted-foreground` à 2,51:1 sur `--card`. Sans lui : 5,72:1.
      expect(entree.className).not.toContain('opacity-60');
    }
  });
});
