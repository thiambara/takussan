/**
 * TCK-377 — La barre latérale de `/app`, éprouvée sur les quatre défauts que le ticket nomme.
 *
 * Chaque bloc ci-dessous est écrit pour ROUGIR sur la régression qu'il prétend garder, et chacun a
 * été rejoué par ablation (le détail est dans le rapport du ticket). En particulier :
 *
 *  - « surlignage sur une page fille » rougit si `pathname === item.href` revient ;
 *  - « une seule entrée active » rougit sur un préfixe NAÏF (sans départage par longueur) ;
 *  - « le jeu d'href par rôle » compare à un relevé pris sur le code d'AVANT le ticket, pas à une
 *    liste réécrite à la main depuis le nouveau code — sinon le test ne compare rien.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User, UserRole } from '@/types/user';
import { withIntl } from '@/test/intl';
import {
  AppSidebar,
  buildNavItems,
  countersToPoll,
  groupBySection,
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
 * Relevé pris sur le code d'AVANT TCK-377 (`git show HEAD~:…/AppSidebar.tsx`, `buildNavItems`
 * exécuté hors React pour les sept rôles). Ce ticket réorganise l'AFFICHAGE : il n'ajoute ni ne
 * retire aucune entrée à aucun rôle. Toute divergence ici est une régression de droits, pas un
 * détail de menu.
 */
const HREFS_AVANT_TICKET: Record<UserRole, string[]> = {
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
  it.each(Object.keys(HREFS_AVANT_TICKET) as UserRole[])(
    'le jeu d’href de %s est inchangé, à l’ordre près',
    (role) => {
      const apres = buildNavItems(userWith([role])).map((item) => item.href);
      expect([...apres].sort()).toEqual([...HREFS_AVANT_TICKET[role]].sort());
      expect(apres).toHaveLength(HREFS_AVANT_TICKET[role].length);
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

  it('le groupement s’efface quand une seule section est peuplée', () => {
    const items = buildNavItems(userWith(['agency_admin']))
      .filter((item) => item.section === 'manage');
    expect(groupBySection(items)).toHaveLength(1);
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

  it('un rôle ne sonde QUE les compteurs des entrées qu’il reçoit', () => {
    // ⚠ Ce test disait autre chose il y a une heure. Son auteur (TCK-377) avait épinglé le
    // constat « aucun des sept rôles ne perd une entrée comptée » et écrit, à la ligne
    // suivante : « si TCK-379 en gardait une, ce test rougirait — et c'est à ce moment-là que
    // la branche `enabled: false` deviendrait observable à l'écran. »
    //
    // C'est exactement ce qui est arrivé à la fusion : TCK-379 a retiré `/app/visits` au
    // prestataire, et le constat est passé au rouge. Le remettre à `2` aurait été effacer la
    // mesure ; le figer à `1` pour ce rôle aurait été recopier le résultat. Il devient donc
    // l'assertion qu'il annonçait : le jeu sondé est EXACTEMENT celui des entrées comptées
    // que le rôle reçoit — ce qui rougit aussi bien si un compteur s'arme sans son entrée que
    // si une entrée comptée cesse d'être sondée.
    for (const role of Object.keys(HREFS_AVANT_TICKET) as UserRole[]) {
      const items = buildNavItems(userWith([role]));
      const attendus = new Set(
        items.filter((item) => item.counterKey && !item.locked).map((item) => item.counterKey),
      );
      expect(countersToPoll(items)).toEqual(attendus);
      expect(attendus.size).toBeGreaterThan(0);
    }
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
