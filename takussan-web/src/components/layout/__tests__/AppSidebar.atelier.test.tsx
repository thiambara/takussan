/**
 * TCK-2490 (ADR-0090 §2, §5, §7) — la colonne « Atelier » : son ordre de lecture (en-tête, action, « Aller à »,
 * zone qui défile, statut, compte), « Récents » et le pied du compte. Les compteurs et « Aujourd'hui » sont
 * éprouvés dans `AppSidebar.test.tsx`, les contrastes dans `AppSidebar.contraste.test.tsx`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { AccesAdminProvider } from '@/lib/access/acces-admin-contexte';
import { accesDepuis } from '@/lib/access/pages-admin';
import { clePagesRecentes } from '@/lib/navigation/pages-recentes';
import type { User, UserRole } from '@/types/user';
import { AppSidebar } from '../AppSidebar';
import { RECENTS_DE_LA_BARRE } from '../RecentsDeLaBarre';

const chemin = vi.hoisted(() => ({ courant: '/app' }));
const routeur = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));
const choisirLangue = vi.hoisted(() => vi.fn());
const deconnecter = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('next/navigation', () => ({
  usePathname: () => chemin.courant,
  useRouter: () => routeur,
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/hooks/useCan', () => ({
  useMyCapabilities: () => ({ data: { data: { agency_id: 7, capabilities: ['properties.create'] } } }),
}));
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({
    data: { data: [{ id: 4, agency: { name: 'Teranga Immo' } }], meta: { active_profile_id: 4 } },
    isLoading: false,
  }),
  useSwitchActiveProfile: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/components/chat-widget/useUnreadCount', () => ({ useUnreadCount: () => 0 }));
vi.mock('@/lib/queries/visits', () => ({ usePendingVisitsCount: () => ({}) }));
vi.mock('@/lib/queries/contact-leads', () => ({ useUnhandledLeadsCount: () => ({}) }));
vi.mock('@/lib/queries/credits-solde', () => ({ useSoldeCredits: () => null }));
vi.mock('@/lib/queries/demarrage-espace', () => ({ useDemarrageDeLEspace: () => ({}) }));
vi.mock('@/hooks/useChangementDeLangue', () => ({
  useChangementDeLangue: () => ({ locale: 'fr', enCours: false, choisir: choisirLangue }),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, token: null, logout: deconnecter }) }));
vi.mock('@/app/actions/notifications', () => ({
  getNotificationsAction: () => Promise.resolve({ ok: true, data: { data: [], meta: { total: 0, unread: 0, current_page: 1 } } }),
  markNotificationReadAction: vi.fn(),
  markNotificationUnreadAction: vi.fn(),
  markAllNotificationsReadAction: vi.fn(),
}));

const ROLES: UserRole[] = ['customer', 'agent'];
const USER = { id: 42, first_name: 'Awa', last_name: 'Diop', full_name: 'Awa Diop', email: 'awa@example.sn', roles: ROLES } as unknown as User;

function monter(onOuvrirPalette?: (depuis: HTMLElement) => void) {
  return render(
    withIntl(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AccesAdminProvider acces={accesDepuis({ roles: ROLES, agence: { kind: 'standard' }, capacites: [] })}>
          <AppSidebar modulesMasques={[]} user={USER} agencyIsStandard typeProfilActif={null} onOuvrirPalette={onOuvrirPalette} />
        </AccesAdminProvider>
      </QueryClientProvider>,
    ),
  );
}

/** Les liens du `<nav>`, dans l'ordre : [libellé, href]. */
const liensDuMenu = (racine: Element) =>
  Array.from(racine.querySelectorAll('nav a[href]')).map((a) => [a.textContent ?? '', a.getAttribute('href')!] as const);

beforeEach(() => {
  chemin.courant = '/app';
  window.localStorage.clear();
});
afterEach(() => cleanup());

describe('TCK-2490 (ADR-0090 §2) — l’ordre de la colonne est l’ordre de lecture', () => {
  it('marque → action principale → « Aller à » → zone qui défile (menu) → statut → compte', () => {
    const { container } = monter(() => {});
    const aside = container.querySelector('aside')!;
    const ordre = ['marque', 'action-principale', 'aller-a', 'defilement', 'pied-du-compte'].map(
      (slot) => aside.querySelector(`[data-slot="${slot}"]`)!,
    );
    ordre.forEach((el) => expect(el).not.toBeNull());
    for (let i = 1; i < ordre.length; i++) {
      // DOCUMENT_POSITION_FOLLOWING : l'élément suivant vient après, donc après au clavier.
      expect(ordre[i - 1].compareDocumentPosition(ordre[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(aside.querySelector('[data-slot="marque"]')).toHaveAttribute('href', '/');
    expect(aside.querySelector('[data-slot="defilement"] nav')).not.toBeNull();
  });

  it('« Aller à » n’existe que si la coque sait ouvrir la palette ; un clic la lui demande depuis la ligne', async () => {
    const { container, unmount } = monter();
    expect(container.querySelector('[data-slot="aller-a"]')).toBeNull();
    unmount();

    const ouvrir = vi.fn();
    const monte = monter(ouvrir);
    const ligne = monte.container.querySelector<HTMLElement>('[data-slot="aller-a"]')!;
    await userEvent.setup().click(ligne);
    expect(ouvrir).toHaveBeenCalledWith(ligne);
  });

  it('le pied du compte : le nom, puis « espace · rôle » ; son nom accessible est ce texte, il ouvre un menu', () => {
    const { container } = monter();
    const pied = container.querySelector<HTMLElement>('[data-slot="pied-du-compte"]')!;
    expect(pied.tagName).toBe('BUTTON');
    expect(pied).toHaveAttribute('aria-haspopup', 'menu');
    expect(pied).toHaveAccessibleName(/^Awa Diop,\s?Teranga Immo · Agent$/);
  });
});

describe('TCK-2491 (ADR-0090 §2) — l’en-tête de la colonne et le menu du compte', () => {
  it('en-tête : la marque, la cloche, puis « Replier » ; pas de cloche dans le tiroir (l’en-tête mobile a la sienne)', () => {
    const { container, unmount } = monter();
    const cloche = container.querySelector('aside [data-slot="cloche"]')!;
    expect(cloche).toHaveAccessibleName('Notifications');
    const marque = container.querySelector('aside [data-slot="marque"]')!;
    expect(marque.compareDocumentPosition(cloche) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cloche.compareDocumentPosition(container.querySelector('[data-slot="action-principale"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    unmount();

    const tiroir = render(
      withIntl(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <AccesAdminProvider acces={accesDepuis({ roles: ROLES, agence: { kind: 'standard' }, capacites: [] })}>
            <AppSidebar modulesMasques={[]} user={USER} agencyIsStandard typeProfilActif={null} tiroir />
          </AccesAdminProvider>
        </QueryClientProvider>,
      ),
    );
    expect(tiroir.container.querySelector('[data-slot="cloche"]')).toBeNull();
    expect(tiroir.container.querySelector('[data-slot="pied-du-compte"]')).not.toBeNull();
  });

  it('le menu : profil, préférences, langue (cochée), déconnexion — chaque choix fait ce que faisait la barre du haut', async () => {
    const u = userEvent.setup();
    const onNavigate = vi.fn();
    const { container } = render(
      withIntl(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <AccesAdminProvider acces={accesDepuis({ roles: ROLES, agence: { kind: 'standard' }, capacites: [] })}>
            <AppSidebar modulesMasques={[]} user={USER} agencyIsStandard typeProfilActif={null} tiroir onNavigate={onNavigate} />
          </AccesAdminProvider>
        </QueryClientProvider>,
      ),
    );
    const pied = container.querySelector<HTMLElement>('[data-slot="pied-du-compte"]')!;
    await u.click(pied);
    let menu = await screen.findByRole('menu');
    expect(within(menu).getByText('awa@example.sn')).toBeInTheDocument();
    // La langue : trois `menuitemradio`, la courante cochée, chacune nommée dans SA langue.
    const langues = within(menu).getAllByRole('menuitemradio');
    expect(langues.map((l) => [l.textContent, l.getAttribute('aria-checked'), l.getAttribute('lang')])).toEqual([
      ['FrançaisFR', 'true', 'fr'],
      ['EnglishEN', 'false', 'en'],
      ['WolofWO', 'false', 'wo'],
    ]);
    await u.click(langues[1]!);
    expect(choisirLangue).toHaveBeenCalledWith('en');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());

    // Le profil : le tiroir se referme (onNavigate), puis la navigation.
    await u.click(pied);
    menu = await screen.findByRole('menu');
    await u.click(within(menu).getByRole('menuitem', { name: 'Mon profil' }));
    expect(onNavigate).toHaveBeenCalled();
    expect(routeur.push).toHaveBeenCalledWith('/app/profile');

    await u.click(pied);
    menu = await screen.findByRole('menu');
    await u.click(within(menu).getByRole('menuitem', { name: 'Préférences de notification' }));
    expect(routeur.push).toHaveBeenCalledWith('/app/profile/notifications');

    // La déconnexion : la session tombe par le contexte, puis l'accueil localisé.
    await u.click(pied);
    menu = await screen.findByRole('menu');
    await u.click(within(menu).getByRole('menuitem', { name: 'Déconnexion' }));
    expect(deconnecter).toHaveBeenCalled();
    await waitFor(() => expect(routeur.replace).toHaveBeenCalledWith('/fr'));
  });
});

describe('TCK-2490 (ADR-0090 §7) — le rail', () => {
  it('un filet sépare les groupes (pas le premier) ; les titres y sont lus, jamais montrés', () => {
    const { container } = monter();
    const groupes = Array.from(container.querySelectorAll('nav [data-groupe]'));
    expect(groupes.length).toBeGreaterThan(2);
    groupes.forEach((g, i) => {
      const classes = g.className.split(/\s+/);
      if (i === 0) expect(classes).not.toContain('icones:border-t');
      else expect(classes).toEqual(expect.arrayContaining(['icones:border-t', 'icones:pt-2']));
      const titre = g.querySelector('p[id], button[aria-expanded] > span');
      if (titre) expect(titre.className.split(/\s+/)).toContain('icones:sr-only');
    });
  });
});

describe('TCK-2490 (ADR-0090 §5) — « Récents »', () => {
  it('rien sans page retenue : ni titre, ni liste', () => {
    const { container } = monter();
    expect(container.querySelector('[data-slot="recents"]')).toBeNull();
  });

  it('les pages retenues, résolues sur le menu : sans la page courante, sans doublon, sans chemin orphelin, quatre au plus', () => {
    // Les entrées réelles du menu de l'agent, lues sur un premier rendu : l'épreuve ne recopie aucun href.
    const premier = monter();
    const menu = liensDuMenu(premier.container).filter(([, href]) => href !== '/app');
    premier.unmount();
    expect(menu.length).toBeGreaterThan(RECENTS_DE_LA_BARRE + 1);

    const [courant, a, b, c, d, e] = menu;
    chemin.courant = courant[1];
    window.localStorage.setItem(
      clePagesRecentes(USER.id),
      JSON.stringify([
        courant[1], // la page courante : écartée
        `${a[1]}/12`, // une fiche sous l'entrée A : résolue sur A
        a[1], // A encore : doublon, écarté
        '/app/nulle-part-ailleurs', // aucune entrée ne la couvre : écartée
        b[1],
        c[1],
        d[1],
        e[1], // la cinquième : au-delà de quatre
      ]),
    );
    const { container } = monter();
    const recents = container.querySelector<HTMLElement>('[data-slot="recents"]')!;
    expect(within(recents).getByText('Récents')).toBeInTheDocument();
    const liens = within(recents).getAllByRole('link');
    expect(liens.map((l) => [l.textContent, l.getAttribute('href')])).toEqual(
      [a, b, c, d].map(([libelle, href]) => [libelle.replace(/\d+$/, ''), href]),
    );
    // Sans icône, et caché dans le rail (ADR-0090 §7).
    expect(recents.querySelector('svg')).toBeNull();
    expect(recents.className.split(/\s+/)).toContain('icones:hidden');
  });

  it('un stockage illisible ne casse rien : la colonne se rend sans « Récents »', () => {
    window.localStorage.setItem(clePagesRecentes(USER.id), '{pas du json');
    const { container } = monter();
    expect(container.querySelector('aside')).not.toBeNull();
    expect(container.querySelector('[data-slot="recents"]')).toBeNull();
  });
});
