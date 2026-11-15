/**
 * TCK-2481 (ADR-0089 §3) — la barre d'onglets mobile de `/app`, montée seule, persona par persona.
 *
 * Ce qu'elle garde : les quatre onglets de chaque persona puis « Menu » (AC1), l'onglet actif lisible
 * sans la couleur seule (arbitrage 12), des compteurs qui sont CEUX du menu et ne sondent que sous
 * `md` (arbitrage 8), et des remplaçants tirés de la DISPOSITION, jamais des épingles de
 * l'utilisateur (arbitrage 6, TCK-2480).
 */
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withIntl } from '@/test/intl';
import type { IdDestination } from '@/lib/navigation/catalogue';
import type { PreferencesDeNavigation } from '@/lib/navigation/preferences';
import { NonLusQueryKeys } from '@/lib/queries/conversations-list';
import type { ProfileType } from '@/types/profile';
import type { User, UserRole } from '@/types/user';
import { ToastProvider } from '@/components/ui/toast';
import { BarreDOnglets } from '../BarreDOnglets';
import { REQUETE_DE_LA_BARRE } from '../plein-ecran';
import { PreferencesDuMenuProvider } from '../PreferencesDuMenu';

const etat = vi.hoisted(() => ({
  chemin: '/app',
  nonLus: 0,
  appels: [] as { enabled?: boolean }[],
  /** Les media queries interrogées (`window.matchMedia`). */
  requetes: [] as string[],
  /** Les onglets déclarés du client, remplacés le temps d'un test (`null` : ceux du dépôt). */
  ongletsDuClient: null as readonly string[] | null,
  /** TCK-2483 — les onglets déclarés de l'agent, remplacés le temps d'un test (`null` : ceux du dépôt). */
  ongletsDeLAgent: null as readonly string[] | null,
  /** TCK-2483 — les modules que l'agence masque, tels que la coque les passe à la barre. */
  modulesMasques: [] as readonly string[],
}));
vi.mock('next/navigation', () => ({
  usePathname: () => etat.chemin,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/hooks/useCan', () => ({
  useMyCapabilities: () => ({ data: { data: { agency_id: 1, capabilities: ['properties.create'] } } }),
}));
vi.mock('@/components/chat-widget/useUnreadCount', () => ({
  useUnreadCount: (o: { enabled?: boolean }) => {
    etat.appels.push(o);
    return o.enabled ? etat.nonLus : 0;
  },
}));
vi.mock('@/lib/queries/visits', () => ({ usePendingVisitsCount: () => ({}) }));
vi.mock('@/lib/queries/contact-leads', () => ({ useUnhandledLeadsCount: () => ({}) }));
vi.mock('@/lib/navigation/dispositions', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/navigation/dispositions')>();
  const client = original.DISPOSITIONS.client;
  const agent = original.DISPOSITIONS.agent;
  return {
    ...original,
    DISPOSITIONS: {
      ...original.DISPOSITIONS,
      get client() {
        return etat.ongletsDuClient
          ? { ...client, onglets: etat.ongletsDuClient as readonly IdDestination[] }
          : client;
      },
      get agent() {
        return etat.ongletsDeLAgent ? { ...agent, onglets: etat.ongletsDeLAgent as readonly IdDestination[] } : agent;
      },
    },
  };
});

/**
 * Simule un viewport (patron de `MessagesPage.test.tsx`) : `(max-width: Npx)` vaut `largeur <= N`,
 * `(width < Nrem)` vaut `largeur < N × policeRacine` — dans une media query, `rem` est la taille de
 * police PAR DÉFAUT du navigateur, un réglage d'accessibilité (16 px d'usine). Les requêtes posées
 * sont relevées dans `etat.requetes`.
 */
function largeurDeFenetre(largeurPx: number, { policeRacine = 16 } = {}): void {
  window.matchMedia = ((query: string) => {
    etat.requetes.push(query);
    const max = /\(max-width:\s*(\d+)px\)/.exec(query);
    const sous = /^\(width < ([\d.]+)rem\)$/.exec(query);
    return {
      matches:
        (max !== null && largeurPx <= Number(max[1])) ||
        (sous !== null && largeurPx < Number(sous[1]) * policeRacine),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
}

interface Compte {
  readonly roles: UserRole[];
  readonly typeProfilActif?: ProfileType;
  readonly agencyIsStandard?: boolean;
}
const COMPTES: Record<string, Compte> = {
  client: { roles: ['customer'] },
  locataire: { roles: ['customer', 'tenant'] },
  bailleur: { roles: ['customer', 'owner'], typeProfilActif: 'owner' },
  agent: { roles: ['customer', 'agent'] },
  'admin-agence': { roles: ['customer', 'agency_admin'] },
  hote: { roles: ['customer', 'agency_admin', 'owner'], agencyIsStandard: false },
  prestataire: { roles: ['customer', 'service_provider'] },
  plateforme: { roles: ['customer', 'super_admin'] },
};

function monter(persona: string, chemin = '/app', navigation?: PreferencesDeNavigation, menuOuvert = false) {
  etat.chemin = chemin;
  const compte = COMPTES[persona];
  const user = {
    id: 1,
    first_name: 'Awa',
    last_name: 'Diop',
    full_name: 'Awa Diop',
    email: 'awa@example.test',
    roles: compte.roles,
  } as unknown as User;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Un nouvel arbre à chaque appel : `relire()` re-rend la barre, qui relit alors `etat.nonLus`.
  const arbre = () => {
    const barre = (
      <BarreDOnglets
        user={user}
        agencyIsStandard={compte.agencyIsStandard ?? true}
        typeProfilActif={compte.typeProfilActif ?? null}
        modulesMasques={etat.modulesMasques}
        menuOuvert={menuOuvert}
        onOuvrirMenu={vi.fn()}
        refMenu={createRef<HTMLButtonElement>()}
      />
    );
    return withIntl(
      <QueryClientProvider client={client}>
        {navigation ? (
          // Le fournisseur des préférences signale un échec d'enregistrement par un toast.
          <ToastProvider>
            <PreferencesDuMenuProvider navigationInitiale={navigation} persona="client" modeIconesInitial="complet">
              {barre}
            </PreferencesDuMenuProvider>
          </ToastProvider>
        ) : (
          barre
        )}
      </QueryClientProvider>,
    );
  };
  const rendu = render(arbre());
  return { ...rendu, client, relire: () => rendu.rerender(arbre()) };
}

const barre = () => screen.getByRole('navigation', { name: 'Accès rapide' });
const onglets = () =>
  within(barre())
    .getAllByRole('link')
    .map((a) => [a.textContent, a.getAttribute('href')]);

beforeEach(() => {
  etat.nonLus = 0;
  etat.appels.length = 0;
  etat.requetes.length = 0;
  etat.ongletsDuClient = null;
  etat.ongletsDeLAgent = null;
  etat.modulesMasques = [];
  largeurDeFenetre(1366);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
});

describe('TCK-2481 → TCK-2618 — AC1 : quatre onglets par persona, puis « Menu »', () => {
  // TCK-2618 — « Messages » partout ; l'agent, l'admin d'agence et le bailleur changent de cases.
  const MESSAGES = ['Messages', '/app/messages'];
  it.each([
    ['client', [['Accueil', '/app'], ['Favoris', '/app/favorites'], ['Visites', '/app/visits'], MESSAGES]],
    ['locataire', [['Accueil', '/app'], ['Paiements', '/app/payments'], ['Interventions', '/app/maintenance'], MESSAGES]],
    ['bailleur', [['Accueil', '/app'], ['Biens', '/app/properties'], ['Loyers', '/app/payments'], MESSAGES]],
    ['agent', [['Aujourd’hui', '/app'], ['Demandes', '/app/leads'], ['Clients', '/app/customers'], MESSAGES]],
    ['admin-agence', [['Accueil', '/app'], ['Argent', '/app/agency/finances'], ['Biens', '/app/properties'], MESSAGES]],
    ['hote', [['Accueil', '/app'], ['Mes biens', '/app/properties'], ['Réservations', '/app/bookings'], MESSAGES]],
    ['prestataire', [['Accueil', '/app'], ['Interventions', '/app/maintenance'], MESSAGES, ['Documents', '/app/documents']]],
    ['plateforme', [['Accueil', '/app'], ['Demandes', '/app/leads'], ['Biens', '/app/properties'], MESSAGES]],
  ] as [string, string[][]][])('%s', (persona, attendus) => {
    monter(persona);
    expect(onglets()).toEqual(attendus);
    const items = within(barre()).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(within(items.at(-1)!).getByRole('button', { name: 'Menu' })).toBeInTheDocument();
  });

  it.each([
    ['agent', 'Sun'],
    ['admin-agence', 'Wallet'],
    ['bailleur', 'Wallet'],
  ])('TCK-2618 — %s : l’icône de la maquette (%s) sur son onglet propre', (persona, icone) => {
    monter(persona);
    const lien = within(barre()).getByRole('link', {
      name: { agent: 'Aujourd’hui', 'admin-agence': 'Argent', bailleur: 'Loyers' }[persona]!,
    });
    expect(lien.querySelector('svg')!.getAttribute('class')).toContain(`lucide-${icone === 'Sun' ? 'sun' : 'wallet'}`);
  });

  it('la barre ne vit que sous md', () => {
    monter('agent');
    expect(barre()).toHaveClass('md:hidden');
  });
});

describe('TCK-2481 × TCK-2480 — un remplaçant vient de la disposition, jamais des épingles (arbitrage 6)', () => {
  // Le client épingle « Documents » (TCK-2480 : l'entrée quitte « Plus » pour « Épinglés », EN TÊTE du
  // menu rendu) ; un onglet déclaré n'est rendu par rien (`demandes`, les contacts reçus, n'est pas au
  // menu du client — `paiements`, si : le catalogue l'ajoute sous « Plus »). La destination suivante
  // de la DISPOSITION est « Favoris » — sur le menu rendu, ce serait « Documents ».
  it('onglet absent, documents épinglé : « Favoris » prend sa place', () => {
    etat.ongletsDuClient = ['tableau-de-bord', 'demandes', 'visites', 'messagerie'];
    monter('client', '/app', { v: 1, personas: { client: { epingles: ['documents'] } } });
    expect(onglets()).toEqual([
      ['Accueil', '/app'],
      ['Favoris', '/app/favorites'],
      ['Visites', '/app/visits'],
      ['Messages', '/app/messages'],
    ]);
  });

  it('les onglets du dépôt ne bougent pas quand on épingle', () => {
    monter('client', '/app', { v: 1, personas: { client: { epingles: ['documents', 'visites'] } } });
    expect(onglets()).toEqual([
      ['Accueil', '/app'],
      ['Favoris', '/app/favorites'],
      ['Visites', '/app/visits'],
      ['Messages', '/app/messages'],
    ]);
  });
});

describe('TCK-2481 — l’onglet actif, lisible sans la couleur seule', () => {
  it('sous-page d’un onglet : il porte aria-current et l’indicateur, les autres rien', () => {
    monter('agent', '/app/leads/12');
    const demandes = within(barre()).getByRole('link', { name: 'Demandes' });
    expect(demandes).toHaveAttribute('aria-current', 'page');
    expect(demandes).toHaveClass('font-semibold');
    expect(demandes.querySelector('[data-slot="indicateur-onglet"]')).not.toBeNull();
    expect(barre().querySelectorAll('[aria-current]')).toHaveLength(1);
    expect(barre().querySelectorAll('[data-slot="indicateur-onglet"]')).toHaveLength(1);
  });

  it('TCK-2618 — l’icône de l’onglet actif est en couleur primaire, celle des autres non', () => {
    monter('agent', '/app/leads/12');
    const icones = [...barre().querySelectorAll('a [data-slot="icone-onglet"]')];
    expect(icones).toHaveLength(4);
    const primaires = icones.filter((i) => i.getAttribute('class')!.split(/\s+/).includes('text-primary'));
    expect(primaires).toHaveLength(1);
    expect(primaires[0].closest('a')).toHaveAttribute('aria-current', 'page');
  });

  it('TCK-2618 (maquette « Menu (tiroir) ») — tiroir ouvert : « Menu » est mis en avant, la page garde aria-current', () => {
    monter('admin-agence', '/app', undefined, true);
    const menu = within(barre()).getByRole('button', { name: 'Menu' });
    const accueil = within(barre()).getByRole('link', { name: 'Accueil' });
    expect(menu).toHaveClass('font-semibold', 'text-foreground');
    expect(menu.querySelector('[data-slot="indicateur-onglet"]')).not.toBeNull();
    expect(menu.querySelector('[data-slot="icone-onglet"]')!.getAttribute('class')!.split(/\s+/)).toContain('text-primary');
    // La page courante reste annoncée comme telle, mais ne se lit plus en avant.
    expect(accueil).toHaveAttribute('aria-current', 'page');
    expect(accueil).not.toHaveClass('font-semibold');
    expect(accueil.querySelector('[data-slot="indicateur-onglet"]')).toBeNull();
    expect(accueil.querySelector('[data-slot="icone-onglet"]')!.getAttribute('class')!.split(/\s+/)).not.toContain('text-primary');
    expect(barre().querySelectorAll('[data-slot="indicateur-onglet"]')).toHaveLength(1);
  });

  it('TCK-2618 — tiroir fermé : « Menu » reste éteint', () => {
    monter('admin-agence', '/app');
    const menu = within(barre()).getByRole('button', { name: 'Menu' });
    expect(menu).not.toHaveClass('font-semibold');
    expect(menu.querySelector('[data-slot="indicateur-onglet"]')).toBeNull();
    expect(menu.querySelector('[data-slot="icone-onglet"]')!.getAttribute('class')!.split(/\s+/)).not.toContain('text-primary');
  });

  it('page hors onglets (`/app/leases`) : aucun onglet allumé — `/app` est une racine exacte', () => {
    monter('agent', '/app/leases');
    expect(barre().querySelectorAll('[aria-current]')).toHaveLength(0);
  });

  // TCK-2801 (fiche TCK-2628, O7) — une page du menu qui n'est aucun des onglets : « Menu » se lit en avant
  // (trait, gras, icône), comme dans les maquettes (`onglet="menu"`) ; une page qui EST un onglet l'éteint.
  it('TCK-2801 — `/app/reports` (page du menu, aucun onglet) : « Menu » mis en avant, sans `aria-current`', () => {
    monter('admin-agence', '/app/reports');
    const menu = within(barre()).getByRole('button', { name: 'Menu' });
    expect(menu).toHaveClass('font-semibold', 'text-foreground');
    expect(menu.querySelector('[data-slot="indicateur-onglet"]')).not.toBeNull();
    expect(menu.querySelector('[data-slot="icone-onglet"]')!.getAttribute('class')!.split(/\s+/)).toContain('text-primary');
    expect(menu.hasAttribute('aria-current')).toBe(false);
    expect(barre().querySelectorAll('[data-slot="indicateur-onglet"]')).toHaveLength(1);
  });

  it('TCK-2801 — une page qui est un onglet, ou hors du menu : « Menu » reste éteint', () => {
    for (const chemin of ['/app', '/app/une-page-hors-du-menu']) {
      const { unmount } = monter('admin-agence', chemin);
      expect(within(barre()).getByRole('button', { name: 'Menu' })).not.toHaveClass('font-semibold');
      unmount();
    }
  });
});

describe('TCK-2481 — les compteurs, ceux du menu', () => {
  it('sous md : la pastille, et un nom accessible qui CONTIENT le libellé visible', () => {
    largeurDeFenetre(390);
    etat.nonLus = 3;
    monter('agent');
    const messagerie = within(barre()).getByRole('link', { name: 'Messages, 3 messages non lus' });
    const pastille = messagerie.querySelector('[data-slot="pastille-onglet"]');
    expect(pastille).toHaveTextContent('3');
    expect(pastille).toHaveAttribute('aria-hidden', 'true');
  });

  it('au-delà de 99 : « 99+ », sans texte en dur ; le nom accessible garde le compte exact', () => {
    largeurDeFenetre(390);
    etat.nonLus = 120;
    monter('agent');
    const messagerie = within(barre()).getByRole('link', { name: 'Messages, 120 messages non lus' });
    expect(messagerie.querySelector('[data-slot="pastille-onglet"]')).toHaveTextContent('99+');
  });

  it('à zéro : ni pastille ni mot de plus', () => {
    largeurDeFenetre(390);
    monter('agent');
    expect(within(barre()).getByRole('link', { name: 'Messages' })).toBeInTheDocument();
    expect(barre().querySelector('[data-slot="pastille-onglet"]')).toBeNull();
  });

  it('sous md : la barre sonde les compteurs de SES onglets', () => {
    largeurDeFenetre(390);
    monter('agent');
    expect(etat.appels.some((o) => o.enabled === true)).toBe(true);
  });

  it('dès md (barre masquée) : aucun sondage', () => {
    largeurDeFenetre(1366);
    monter('agent');
    expect(etat.appels.length).toBeGreaterThan(0);
    for (const o of etat.appels) expect(o.enabled).toBe(false);
  });
});

describe('TCK-2481 (revue, M5) — le seuil JS de la barre est la plage CSS, en rem', () => {
  /**
   * `md:hidden` est `@media (width >= 48rem)`, et la règle du dock `(width < 48rem)` : des rem, qui
   * suivent la taille de police par défaut du navigateur. Un seuil JS en px (`max-width: 767px`)
   * décroche dès qu'elle dépasse 16 px — à 20 px, `md` vaut 960 px : entre 768 et 959 px la barre
   * était visible, mais ne sondait rien (« Messagerie » à 0).
   */
  it('police par défaut à 20 px, fenêtre de 800 px : la barre est affichée par le CSS, elle sonde', () => {
    largeurDeFenetre(800, { policeRacine: 20 });
    monter('agent');
    expect(etat.appels.some((o) => o.enabled === true)).toBe(true);
  });

  it('la requête interrogée est EXACTEMENT la plage de la règle CSS (`REQUETE_DE_LA_BARRE`)', () => {
    largeurDeFenetre(390);
    monter('agent');
    expect(etat.requetes).toContain(REQUETE_DE_LA_BARRE);
    expect(etat.requetes.some((q) => /px/.test(q))).toBe(false);
  });
});

describe('TCK-2481 (revue, I1) — une région live annonce les nouveaux non-lus sous md (WCAG 4.1.3)', () => {
  /**
   * Le bouton flottant mobile portait la seule région `aria-live` du compte de non-lus visible sous
   * `md` ; il ne se rend plus sur `/app`, et la pastille de l'onglet est muette (`aria-hidden`) — un
   * `aria-label` qui change n'est annoncé par aucun lecteur d'écran. La barre porte donc la région,
   * avec le texte du bouton retiré (`messaging.widget.unreadInline`).
   *
   * Elle n'annonce qu'un CHANGEMENT : vide au montage, et la première lecture du compte (0 pendant
   * le chargement, puis N) est une ligne de base, pas une nouvelle.
   */
  const region = () => {
    const regions = barre().querySelectorAll('[aria-live]');
    expect(regions).toHaveLength(1);
    return regions[0]!;
  };
  /** La requête partagée du compte a été lue (ce que `useUnreadCount` lit aussi). */
  const compteLu = (client: QueryClient) =>
    act(() => {
      client.setQueryData(NonLusQueryKeys.total, { data: [], meta: { unread_total: etat.nonLus } });
    });

  it('sous md : une région polie et masquée à l’œil, dans la barre (`md:hidden`), vide au montage', () => {
    largeurDeFenetre(390);
    etat.nonLus = 4;
    const { client, relire } = monter('agent');
    compteLu(client);
    relire();
    expect(region()).toHaveAttribute('aria-live', 'polite');
    expect(region()).toHaveClass('sr-only');
    expect(barre()).toHaveClass('md:hidden');
    expect(region()).toHaveTextContent(/^$/);
  });

  it('le compte monte : la région reçoit le texte du bouton retiré', () => {
    largeurDeFenetre(390);
    etat.nonLus = 4;
    const { client, relire } = monter('agent');
    compteLu(client);
    relire();
    etat.nonLus = 5;
    relire();
    expect(region()).toHaveTextContent('5 non lus');
  });

  it('le compte baisse : la région se vide — remonter au même compte s’annonce encore', () => {
    largeurDeFenetre(390);
    etat.nonLus = 4;
    const { client, relire } = monter('agent');
    compteLu(client);
    relire();
    etat.nonLus = 5;
    relire();
    etat.nonLus = 4;
    relire();
    expect(region()).toHaveTextContent(/^$/);
    etat.nonLus = 5;
    relire();
    expect(region()).toHaveTextContent('5 non lus');
  });

  it('premier chargement (0, puis le compte lu) : rien n’est annoncé ; la hausse suivante, si', () => {
    largeurDeFenetre(390);
    etat.nonLus = 0; // `useUnreadCount` rend 0 tant que la requête n'a pas répondu
    const { client, relire } = monter('agent');
    etat.nonLus = 4;
    relire();
    expect(region()).toHaveTextContent(/^$/);
    compteLu(client);
    relire();
    expect(region()).toHaveTextContent(/^$/);
    etat.nonLus = 6;
    relire();
    expect(region()).toHaveTextContent('6 non lus');
  });

  it('dès md (barre masquée, aucun sondage) : la région n’annonce rien', () => {
    largeurDeFenetre(1366);
    etat.nonLus = 4;
    const { client, relire } = monter('agent');
    compteLu(client);
    relire();
    etat.nonLus = 9;
    relire();
    expect(region()).toHaveTextContent(/^$/);
  });
});

/**
 * TCK-2483 (ADR-0089, amendement « modules par agence », AC10) — la barre d'onglets MONTÉE lit les
 * groupes de la disposition jugés avec les modules que l'agence masque : un onglet vers une destination
 * masquée n'est pas rendu, il cède sa place à la destination suivante de la disposition.
 *
 * Aucun onglet déclaré du dépôt n'est une destination de module (`modules.test.ts` le refuse) : le test
 * déclare donc « Calendrier » parmi les onglets de l'agent, le temps du test, pour éprouver la voie.
 */
describe('TCK-2483 — AC10 : un onglet vers une destination masquée n’est pas rendu', () => {
  const ONGLETS = ['tableau-de-bord', 'demandes', 'calendrier', 'messagerie'];

  it('témoin : sans module masqué, « Calendrier » est un onglet de l’agent', () => {
    etat.ongletsDeLAgent = ONGLETS;
    monter('agent');
    expect(onglets()).toEqual([
      ['Aujourd’hui', '/app'],
      ['Demandes', '/app/leads'],
      ['Calendrier', '/app/calendar'],
      ['Messages', '/app/messages'],
    ]);
  });

  it('l’agence masque `calendar` : l’onglet part, la destination suivante de la disposition le remplace', () => {
    etat.ongletsDeLAgent = ONGLETS;
    etat.modulesMasques = ['calendar'];
    monter('agent');
    const rendus = onglets();
    expect(rendus.map(([, href]) => href)).not.toContain('/app/calendar');
    // « Tâches » : la première entrée de la disposition de l'agent qui n'est pas un onglet déclaré.
    expect(rendus).toEqual([
      ['Aujourd’hui', '/app'],
      ['Demandes', '/app/leads'],
      ['Tâches', '/app/tasks'],
      ['Messages', '/app/messages'],
    ]);
  });

  // Un onglet déclaré que rien ne rend (`absent`) cède sa place à la première entrée de la disposition
  // qui n'est PAS un onglet déclaré. Les onglets au-delà du quatrième ne sont pas rendus mais restent
  // déclarés : ils écartent `messagerie` … `visites` de la réserve, dont la tête devient « Calendrier ».
  const RESERVE_SUR_LE_CALENDRIER = [
    'absent', 'tableau-de-bord', 'messagerie', 'taches', 'demandes', 'clients', 'visites',
  ];

  it('témoin : sans module masqué, le remplaçant est « Calendrier »', () => {
    etat.ongletsDeLAgent = RESERVE_SUR_LE_CALENDRIER;
    monter('agent');
    expect(onglets()[0]).toEqual(['Calendrier', '/app/calendar']);
  });

  it('un remplaçant n’est jamais une destination masquée', () => {
    etat.ongletsDeLAgent = RESERVE_SUR_LE_CALENDRIER;
    etat.modulesMasques = ['calendar'];
    monter('agent');
    const hrefs = onglets().map(([, href]) => href);
    expect(hrefs).not.toContain('/app/calendar');
    expect(hrefs).toEqual(['/app/properties', '/app', '/app/messages', '/app/tasks']);
  });
});

// TCK-2691:début
/**
 * TCK-2691 (ADR-0106, C4) — les cotes de la maquette : `gap-1` entre l'icône et le libellé, libellé à
 * l'interligne 16,5 px (`leading-normal` de 11 px), icônes au trait 1,75, trait actif arrondi plein. La
 * hauteur (64 px + zone sûre) est la variable de `globals.css` (`CoqueHauteur.test.tsx`).
 */
describe('TCK-2691 (C4) — la barre d’onglets aux cotes de la maquette', () => {
  it('chaque case : 4 px entre l’icône et le libellé, interligne `leading-normal`, icône au trait 1,75', () => {
    largeurDeFenetre(390);
    monter('agent', '/app/leads');
    const cases = [...within(barre()).getAllByRole('link'), within(barre()).getByRole('button', { name: 'Menu' })];
    expect(cases).toHaveLength(5);
    for (const c of cases) {
      const classes = c.className.split(/\s+/);
      expect(classes).toEqual(expect.arrayContaining(['gap-1', 'leading-normal']));
      expect(classes).not.toContain('gap-0.5');
      expect(classes).not.toContain('leading-tight');
      expect(c.querySelector('svg')!.getAttribute('stroke-width')).toBe('1.75');
    }
  });

  it('le trait de l’onglet actif est arrondi aux deux bouts (`rounded-full`), comme la maquette', () => {
    largeurDeFenetre(390);
    monter('agent', '/app/leads');
    const actif = within(barre()).getByRole('link', { current: 'page' });
    const trait = actif.querySelector('[data-slot="indicateur-onglet"]')!;
    expect(trait.className.split(/\s+/)).toEqual(expect.arrayContaining(['rounded-full', 'inset-x-4', 'h-0.5', 'bg-primary']));
    expect(trait.className).not.toContain('rounded-b-full');
  });
});
// TCK-2691:fin
