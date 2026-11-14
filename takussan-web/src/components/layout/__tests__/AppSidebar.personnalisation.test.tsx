/**
 * TCK-2480 — la barre montée, avec le fournisseur des préférences : épingler au clavier, replier,
 * le rangement par persona, l'épingle périmée ignorée, l'échec rétabli, « Démarrer » masqué.
 *
 * Les `vi.mock` d'en-tête sont ceux d'`AppSidebar.test.tsx` (ce fichier éprouve la PERSONNALISATION,
 * pas le réseau ni le sélecteur de profil).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User, UserRole } from '@/types/user';
import type { ProfileType } from '@/types/profile';
import { withIntl } from '@/test/intl';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import type { Persona } from '@/lib/navigation/personas';
import type { ModeIcones } from '@/lib/navigation/mode-icones';
import fr from '@/messages/fr.json';
import { AppSidebar } from '../AppSidebar';
import { DELAI_D_ENVOI_MS, PreferencesDuMenuProvider } from '../PreferencesDuMenu';

const capacitesLues = vi.hoisted(() => ({ liste: ['properties.create'] as string[] }));
vi.mock('@/hooks/useCan', () => ({
  useMyCapabilities: () => ({ data: { data: { agency_id: 1, capabilities: capacitesLues.liste } } }),
}));
const chemin = vi.hoisted(() => ({ courant: '/app' }));
vi.mock('next/navigation', () => ({
  usePathname: () => chemin.courant,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({ data: undefined, isLoading: false }),
  useSwitchActiveProfile: () => ({ mutate: vi.fn(), isPending: false }),
}));
// TCK-2480 (A11) — des messages non lus quand `nonLus.n` est posé : « Aujourd'hui » paraît (TCK-2490).
const nonLus = vi.hoisted(() => ({ n: 0 }));
vi.mock('@/components/chat-widget/useUnreadCount', () => ({ useUnreadCount: () => nonLus.n }));
// Revue adverse (I1) — des visites en attente quand `visites.n` est posé : le client les voit sur « Mes
// visites » (hors de ses priorités, donc hors d'« Aujourd'hui »).
const visites = vi.hoisted(() => ({ n: 0 }));
vi.mock('@/lib/queries/visits', () => ({
  usePendingVisitsCount: () => (visites.n > 0 ? { data: { meta: { total: visites.n } } } : {}),
}));
vi.mock('@/lib/queries/contact-leads', () => ({ useUnhandledLeadsCount: () => ({}) }));
// « Démarrer » : trois étapes à faire quand `demarrage.etapes` est posé, muet sinon.
const demarrage = vi.hoisted(() => ({ etapes: null as { code: string; faite: boolean }[] | null }));
vi.mock('@/lib/queries/demarrage-espace', () => ({
  useDemarrageDeLEspace: ({ enabled }: { enabled: boolean }) =>
    enabled && demarrage.etapes ? { data: { data: { etapes: demarrage.etapes } } } : {},
}));
vi.mock('@/lib/queries/credits-solde', () => ({ useSoldeCredits: () => null }));
vi.mock('@/lib/queries/reviews-moderation', () => ({
  fetchModerationQueue: () => Promise.resolve({ meta: { total: 0 } }),
}));
vi.mock('@/lib/queries/property-moderation', () => ({
  fetchPropertyModerationQueue: () => Promise.resolve({ meta: { total: 0 } }),
}));

// Réserve de la vérification de TCK-2619 (F19) — le glisser-déposer des épingles. jsdom n'a pas de mise en
// page : un vrai geste de pointeur n'y désigne aucune cible fiable (tous les rectangles sont nuls). Le
// `DndContext` réel reste monté ; on retient seulement le `onDragEnd` que la barre lui passe, pour le
// rejouer avec la fin de geste que @dnd-kit rendrait (`active`, `over`).
const finDuGlisser = vi.hoisted(() => ({ rappel: null as null | ((e: unknown) => void) }));
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@dnd-kit/core')>();
  const { createElement } = await import('react');
  return {
    ...original,
    DndContext: (props: import('@dnd-kit/core').DndContextProps) => {
      finDuGlisser.rappel = (props.onDragEnd as (e: unknown) => void) ?? null;
      return createElement(original.DndContext, props);
    },
  };
});

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  finDuGlisser.rappel = null;
  vi.useFakeTimers({ shouldAdvanceTime: true });
  demarrage.etapes = null;
  nonLus.n = 0;
  visites.n = 0;
  chemin.courant = '/app';
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const AGENT_ET_BAILLEUR: UserRole[] = ['customer', 'agent', 'owner'];

function element(
  roles: UserRole[],
  persona: Persona,
  options: {
    navigation?: unknown;
    typeProfilActif?: ProfileType;
    agencyIsStandard?: boolean;
    modeIcones?: ModeIcones;
  } = {},
) {
  const user = {
    id: 1,
    first_name: 'Awa',
    last_name: 'Diop',
    full_name: 'Awa Diop',
    email: 'awa@example.sn',
    roles,
    agency_id: 7,
    preferences: { navigation: options.navigation },
  } as unknown as User;
  return withIntl(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <PreferencesDuMenuProvider
          navigationInitiale={options.navigation}
          persona={persona}
          modeIconesInitial={options.modeIcones ?? 'complet'}
        >
          <AppSidebar modulesMasques={[]}
            user={user}
            agencyIsStandard={options.agencyIsStandard ?? true}
            typeProfilActif={options.typeProfilActif ?? null}
          />
        </PreferencesDuMenuProvider>
        <Toaster />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const utilisateur = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
const groupe = (nom: string) => screen.getByRole('group', { name: nom });
const corps = (appel = 0) => JSON.parse(String(fetchMock.mock.calls[appel][1]?.body)) as unknown;
// TCK-2619 — punaises et poignées n'existent qu'en mode « Modifier le menu » : on y entre d'abord.
const entrerEnEdition = (racine: HTMLElement = document.body) =>
  act(() => within(racine).getByRole('button', { name: fr.nav.sidebar.edition.modifier }).click());
const attendreLEnvoi = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(DELAI_D_ENVOI_MS);
  });

describe('TCK-2480 — personnaliser le menu depuis la barre', () => {
  it('AC1 — au clavier : Tab mène de « Commissions » à son épingle ; Entrée la monte dans « Épinglés »', async () => {
    const user = utilisateur();
    render(element(AGENT_ET_BAILLEUR, 'agent', { typeProfilActif: 'agent' }));
    entrerEnEdition();
    within(groupe('Gestion')).getByRole('link', { name: 'Commissions' }).focus();
    await user.tab();
    expect(document.activeElement).toBe(
      within(groupe('Gestion')).getByRole('button', { name: 'Épingler Commissions', pressed: false }),
    );
    await user.keyboard('{Enter}');

    expect(within(groupe('Épinglés')).getByRole('link', { name: 'Commissions' })).toBeInTheDocument();
    expect(within(groupe('Gestion')).queryByRole('link', { name: 'Commissions' })).toBeNull();
    // Revue (I2) — le focus suit l'épingle à sa nouvelle place, il ne tombe pas sur `<body>`.
    expect(document.activeElement).toBe(
      within(groupe('Épinglés')).getByRole('button', { name: 'Épingler Commissions', pressed: true }),
    );
    await attendreLEnvoi();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(corps()).toEqual({ navigation: { v: 1, personas: { agent: { epingles: ['commissions'] } } } });

    // Désépingler, toujours au clavier et SANS replacer le focus : elle revient dans « Gestion », et le
    // focus avec elle.
    await user.keyboard('{Enter}');
    expect(within(groupe('Gestion')).getByRole('link', { name: 'Commissions' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Épinglés' })).toBeNull();
    expect(document.activeElement).toBe(
      within(groupe('Gestion')).getByRole('button', { name: 'Épingler Commissions', pressed: false }),
    );
    // Et Tab repart de là : la cible suivante du menu, pas le haut du document.
    await user.tab();
    expect(document.activeElement?.closest('nav')).toBe(screen.getByRole('navigation', { name: fr.nav.sidebar.navLabel }));
  });

  it('I2 — deux montages (barre et tiroir) : le focus reste dans celui où l’on a appuyé', async () => {
    const user = utilisateur();
    const compte = {
      id: 1,
      first_name: 'Awa',
      last_name: 'Diop',
      roles: ['customer', 'agent'],
      agency_id: 7,
      preferences: {},
    } as unknown as User;
    render(
      withIntl(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <ToastProvider>
            <PreferencesDuMenuProvider navigationInitiale={undefined} persona="agent" modeIconesInitial="complet">
              <AppSidebar modulesMasques={[]} user={compte} agencyIsStandard />
              <AppSidebar modulesMasques={[]} user={compte} agencyIsStandard tiroir />
            </PreferencesDuMenuProvider>
          </ToastProvider>
        </QueryClientProvider>,
      ),
    );
    const tiroir = document.querySelectorAll('aside')[1] as HTMLElement;
    entrerEnEdition(tiroir);
    within(tiroir).getByRole('button', { name: 'Épingler Commissions' }).focus();
    await user.keyboard('{Enter}');
    expect(tiroir.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toHaveAccessibleName('Épingler Commissions');
    expect(document.activeElement).toHaveAttribute('aria-pressed', 'true');
  });

  it('AC2 — le même compte, profil actif bailleur, n’a pas les épingles de l’agent', () => {
    // « Messagerie » : une destination que le bailleur ouvre AUSSI — sans elle, le cas resterait vert
    // même si la barre lisait les préférences de l’agent (« Commissions » est fermée au bailleur).
    const navigation = { v: 1, personas: { agent: { epingles: ['messagerie', 'commissions'] } } };
    render(element(AGENT_ET_BAILLEUR, 'bailleur', { navigation, typeProfilActif: 'owner' }));
    expect(screen.getByRole('link', { name: 'Messagerie' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Épinglés' })).toBeNull();
  });

  it('AC2 — et le geste du bailleur s’écrit sous `bailleur`, l’agent réécrit tel quel', async () => {
    const user = utilisateur();
    const navigation = { v: 1, personas: { agent: { epingles: ['commissions'] } } };
    render(element(AGENT_ET_BAILLEUR, 'bailleur', { navigation, typeProfilActif: 'owner' }));
    entrerEnEdition();
    await user.click(screen.getAllByRole('button', { name: /^Épingler / })[0]!);
    await attendreLEnvoi();
    const envoye = corps() as { navigation: { personas: Record<string, unknown> } };
    expect(envoye.navigation.personas.agent).toEqual({ epingles: ['commissions'] });
    expect(Object.keys(envoye.navigation.personas).sort()).toEqual(['agent', 'bailleur']);
  });

  it('AC4 — une épingle inconnue ou inaccessible n’est pas rendue', () => {
    const navigation = { v: 1, personas: { agent: { epingles: ['disparue', 'agence-equipe', 'commissions'] } } };
    render(element(['customer', 'agent'], 'agent', { navigation }));
    expect(
      within(groupe('Épinglés'))
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Commissions']);
  });

  it('A6 — « Épinglés » ouvre le menu, titré, AVANT « Démarrer »', () => {
    demarrage.etapes = [
      { code: 'premier_bien', faite: false },
      { code: 'kyc', faite: false },
      { code: 'equipe', faite: false },
    ];
    const navigation = { v: 1, personas: { 'admin-agence': { epingles: ['commissions'] } } };
    render(element(['customer', 'agency_admin'], 'admin-agence', { navigation }));
    // Suite de la revue adverse (a) — le repère couvre toute la colonne ; le menu en est un bloc.
    const nav = screen.getByRole('navigation', { name: fr.nav.sidebar.navLabel });
    const menu = nav.querySelector<HTMLElement>('[data-slot="menu"]')!;
    const blocs = [...menu.children];
    expect(blocs[0]).toHaveAttribute('data-groupe', 'epingles');
    expect(within(blocs[0] as HTMLElement).getByText('Épinglés')).toBeInTheDocument();
    expect(blocs[1]?.querySelector('[data-slot="demarrer"]') ?? blocs[1]).toHaveAttribute('data-slot', 'demarrer');
  });

  it('A7 — l’action principale ne s’épingle pas (« Paiements » du locataire), le reste oui', () => {
    render(element(['customer', 'tenant'], 'locataire'));
    entrerEnEdition();
    expect(screen.queryByRole('button', { name: 'Épingler Paiements' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Épingler Mon bail' })).toBeInTheDocument();
  });

  // TCK-2628 — « Vue agence » est devenue un onglet de « Rapports », jamais cadenassé : la ligne
  // cadenassée qui reste à l'hôte d'une agence `individual` est « Propriétaires ».
  it('A7 — une ligne cadenassée ne s’épingle pas (« Propriétaires » de l’hôte, agence `individual`)', () => {
    render(element(['customer', 'agency_admin', 'owner'], 'hote', { agencyIsStandard: false }));
    entrerEnEdition();
    // La ligne cadenassée de l'hôte est sous « Plus », replié : `hidden: true`.
    const cadenassees = screen.getAllByTitle(fr.nav.sidebar.proLocked);
    expect(cadenassees.map((c) => c.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('Propriétaires')]),
    );
    expect(screen.queryByRole('button', { name: 'Épingler Propriétaires', hidden: true })).toBeNull();
    expect(screen.getByRole('button', { name: 'Épingler Messagerie' })).toBeInTheDocument();
  });

  it('A6 — « Épinglés » est titré même quand aucun titre de section ne paraît (prestataire)', () => {
    const navigation = { v: 1, personas: { prestataire: { epingles: ['messagerie'] } } };
    render(element(['customer', 'service_provider'], 'prestataire', { navigation }));
    expect(within(groupe('Épinglés')).getByRole('link', { name: 'Messagerie' })).toBeInTheDocument();
  });

  it('A7 — le complément « Aussi … » ne s’épingle pas', () => {
    render(element(AGENT_ET_BAILLEUR, 'agent', { typeProfilActif: 'agent' }));
    entrerEnEdition();
    const aussi = document.querySelector('[data-groupe="aussi"]') as HTMLElement;
    expect(aussi).not.toBeNull();
    expect(within(aussi).queryAllByRole('button', { name: /^Épingler / })).toEqual([]);
  });

  it('A7 — cinq épingles : celle d’une autre ligne est refusée, et le dit', async () => {
    const user = utilisateur();
    const navigation = {
      v: 1,
      personas: { agent: { epingles: ['commissions', 'baux', 'demandes', 'clients', 'calendrier'] } },
    };
    render(element(['customer', 'agent'], 'agent', { navigation }));
    entrerEnEdition();
    const visites = screen.getByRole('button', { name: 'Épingler Visites' });
    expect(visites).toHaveAttribute('aria-disabled', 'true');
    expect(visites).toHaveAttribute('title', fr.nav.sidebar.epingle.plein);
    await user.click(visites);
    await attendreLEnvoi();
    expect(fetchMock).not.toHaveBeenCalled();
    // Une épinglée se désépingle toujours.
    expect(screen.getByRole('button', { name: 'Épingler Commissions', pressed: true })).not.toHaveAttribute('aria-disabled');
  });

  it('A8 — replier « Gestion » d’un clic sur son titre : enregistré pour le persona', async () => {
    const user = utilisateur();
    render(element(['customer', 'agent'], 'agent'));
    const titre = within(groupe('Gestion')).getByRole('button', { name: 'Gestion' });
    expect(titre).toHaveAttribute('aria-expanded', 'true');
    await user.click(titre);
    expect(within(groupe('Gestion')).getByRole('button', { name: 'Gestion' })).toHaveAttribute('aria-expanded', 'false');
    await attendreLEnvoi();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(corps()).toEqual({ navigation: { v: 1, personas: { agent: { replies: ['gestion'] } } } });
  });

  it('A8 — rouvrir « Plus » (replié par défaut) s’enregistre dans `ouverts` ; le replier efface l’écart', async () => {
    const user = utilisateur();
    render(element(['customer', 'agent'], 'agent'));
    const plus = () => within(groupe('Plus')).getByRole('button', { name: 'Plus' });
    expect(plus()).toHaveAttribute('aria-expanded', 'false');
    await user.click(plus());
    expect(plus()).toHaveAttribute('aria-expanded', 'true');
    await attendreLEnvoi();
    expect(corps(0)).toEqual({ navigation: { v: 1, personas: { agent: { ouverts: ['plus'] } } } });
    await user.click(plus());
    await attendreLEnvoi();
    expect(corps(1)).toEqual({ navigation: null });
  });

  it('A8 — l’ouverture automatique sur la page active ne s’enregistre jamais, ni sa refermeture', async () => {
    const user = utilisateur();
    chemin.courant = '/app/documents';
    render(element(['customer', 'agent'], 'agent'));
    const plus = () => within(groupe('Plus')).getByRole('button', { name: 'Plus' });
    expect(plus()).toHaveAttribute('aria-expanded', 'true');
    await user.click(plus());
    expect(plus()).toHaveAttribute('aria-expanded', 'false');
    await attendreLEnvoi();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('M2 — « Épinglés » replié : épingler le déplie, la ligne reste sous les yeux (une seule écriture)', async () => {
    const user = utilisateur();
    const navigation = { v: 1, personas: { agent: { epingles: ['messagerie'], replies: ['epingles'] } } };
    render(element(AGENT_ET_BAILLEUR, 'agent', { typeProfilActif: 'agent', navigation }));
    const titre = () => within(groupe('Épinglés')).getByRole('button', { name: 'Épinglés' });
    expect(titre()).toHaveAttribute('aria-expanded', 'false');
    entrerEnEdition();
    await user.click(within(groupe('Gestion')).getByRole('button', { name: 'Épingler Commissions' }));
    expect(titre()).toHaveAttribute('aria-expanded', 'true');
    const lien = within(groupe('Épinglés')).getByRole('link', { name: 'Commissions' });
    expect(lien.closest('[hidden]')).toBeNull();
    await attendreLEnvoi();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(corps()).toEqual({ navigation: { v: 1, personas: { agent: { epingles: ['messagerie', 'commissions'] } } } });
  });

  it('A8 — un repli enregistré se relit au montage', () => {
    render(element(['customer', 'agent'], 'agent', { navigation: { v: 1, personas: { agent: { replies: ['gestion'] } } } }));
    expect(within(groupe('Gestion')).getByRole('button', { name: 'Gestion' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('un échec d’écriture rétablit le menu et le dit', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 500 }));
    const user = utilisateur();
    render(element(['customer', 'agent'], 'agent'));
    entrerEnEdition();
    within(groupe('Gestion')).getByRole('button', { name: 'Épingler Commissions' }).focus();
    await user.keyboard('{Enter}');
    expect(within(groupe('Épinglés')).getByRole('link', { name: 'Commissions' })).toBeInTheDocument();
    await attendreLEnvoi();
    expect(screen.getByText(fr.nav.sidebar.preferences.echec)).toBeInTheDocument();
    expect(within(groupe('Gestion')).getByRole('link', { name: 'Commissions' })).toBeInTheDocument();
  });

  it('A9 — la croix de « Démarrer » l’enregistre pour le persona, et il disparaît', async () => {
    demarrage.etapes = [{ code: 'premier_bien', faite: false }];
    const user = utilisateur();
    const { container } = render(element(['customer', 'agency_admin'], 'admin-agence'));
    expect(container.querySelector('[data-slot="demarrer"]')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: fr.nav.sidebar.demarrer.masquer }));
    expect(container.querySelector('[data-slot="demarrer"]')).toBeNull();
    await attendreLEnvoi();
    expect(corps()).toEqual({ navigation: { v: 1, personas: { 'admin-agence': { demarrer_masque: true } } } });
  });

  it.each([
    ['sans épingle', undefined],
    ['avec « Épinglés » au-dessus', { v: 1, personas: { 'admin-agence': { epingles: ['commissions'] } } }],
  ])('A9 (revue, focus) — au clavier, la croix de « Démarrer » passe le focus au premier élément du menu qui SUIT (%s)', async (_cas, navigation) => {
    demarrage.etapes = [{ code: 'premier_bien', faite: false }];
    const user = utilisateur();
    render(element(['customer', 'agency_admin'], 'admin-agence', { navigation }));
    const nav = screen.getByRole('navigation', { name: fr.nav.sidebar.navLabel });
    // L'attendu, relevé AVANT le geste : le premier focalisable visible du premier groupe après « Démarrer ».
    const suivant = [
      ...nav.querySelectorAll<HTMLElement>('[data-groupe]:not([data-groupe="epingles"]) :is(a[href], button, [tabindex="0"])'),
    ].find((el) => el.closest('[hidden]') === null);
    expect(suivant).toBeDefined();
    screen.getByRole('button', { name: fr.nav.sidebar.demarrer.masquer }).focus();
    await user.keyboard('{Enter}');
    expect(document.querySelector('[data-slot="demarrer"]')).toBeNull();
    expect(document.activeElement).toBe(suivant);
  });

  it('A9 (revue, focus) — barre et tiroir : la croix du tiroir garde le focus dans le tiroir', async () => {
    demarrage.etapes = [{ code: 'premier_bien', faite: false }];
    const user = utilisateur();
    const compte = { id: 1, first_name: 'Awa', roles: ['customer', 'agency_admin'], agency_id: 7, preferences: {} } as unknown as User;
    render(
      withIntl(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <ToastProvider>
            <PreferencesDuMenuProvider navigationInitiale={undefined} persona="admin-agence" modeIconesInitial="complet">
              <AppSidebar modulesMasques={[]} user={compte} agencyIsStandard />
              <AppSidebar modulesMasques={[]} user={compte} agencyIsStandard tiroir />
            </PreferencesDuMenuProvider>
          </ToastProvider>
        </QueryClientProvider>,
      ),
    );
    const tiroir = document.querySelectorAll('aside')[1] as HTMLElement;
    within(tiroir).getByRole('button', { name: fr.nav.sidebar.demarrer.masquer }).focus();
    await user.keyboard('{Enter}');
    expect(document.querySelector('[data-slot="demarrer"]')).toBeNull();
    expect(tiroir.querySelector<HTMLElement>('[data-slot="menu"]')!.contains(document.activeElement)).toBe(true);
  });

  it('A9 — « Démarrer » masqué pour le persona : ni groupe, ni lecture', () => {
    demarrage.etapes = [{ code: 'premier_bien', faite: false }];
    const navigation = { v: 1, personas: { 'admin-agence': { demarrer_masque: true } } };
    const { container } = render(element(['customer', 'agency_admin'], 'admin-agence', { navigation }));
    expect(container.querySelector('[data-slot="demarrer"]')).toBeNull();
  });
});

describe('TCK-2480 — AC5 : rendu serveur sans saut (largeur et épingles)', () => {
  const navigation = { v: 1, personas: { agent: { epingles: ['commissions'] } } };

  it.each([
    ['auto', 'auto'],
    ['complet', 'complet'],
    ['icones', 'icones'],
  ] as const)('mode %s : `data-menu="%s"` est DANS le HTML serveur, avec la largeur réduite en variante', (mode, attendu) => {
    const html = renderToString(element(['customer', 'agent'], 'agent', { navigation, modeIcones: mode }));
    const conteneur = document.createElement('div');
    conteneur.innerHTML = html;
    const barre = conteneur.querySelector('aside')!;
    expect(barre.getAttribute('data-menu')).toBe(attendu);
    // TCK-2490 (ADR-0090 §1, §7) — 272 px, rail de 60 px : en px, comme la maquette validée (la densité
    // ×0,9 du bureau, ADR-0107, ne touche pas les px).
    expect(barre.className).toContain('w-[272px]');
    expect(barre.className).toContain('icones:w-[60px]');
    // Les épingles aussi sont au premier octet.
    expect(conteneur.querySelector('[data-groupe="epingles"]')?.textContent).toContain('Commissions');
  });

  it('l’hydratation ne change ni la barre ni les épingles, et ne signale aucun écart', async () => {
    const erreurs = vi.spyOn(console, 'error').mockImplementation(() => {});
    const avertissements = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const recuperees: unknown[] = [];
    const jsx = element(['customer', 'agent'], 'agent', { navigation, modeIcones: 'auto' });
    const conteneur = document.createElement('div');
    conteneur.innerHTML = renderToString(jsx);
    document.body.appendChild(conteneur);
    const htmlAvant = conteneur.querySelector('aside')!.outerHTML;
    const classeAvant = conteneur.querySelector('aside')!.className;
    await act(async () => {
      hydrateRoot(conteneur, jsx, { onRecoverableError: (e) => recuperees.push(e) });
    });
    expect(conteneur.querySelector('aside')!.className).toBe(classeAvant);
    expect(conteneur.querySelector('aside')!.getAttribute('data-menu')).toBe('auto');
    expect(conteneur.querySelector('[data-groupe="epingles"]')).not.toBeNull();
    expect(recuperees).toEqual([]);
    expect([...erreurs.mock.calls, ...avertissements.mock.calls].flat().join(' ')).not.toMatch(/hydrat/i);
    expect(htmlAvant.length).toBeGreaterThan(0);
    erreurs.mockRestore();
    avertissements.mockRestore();
    conteneur.remove();
  });

  it('le tiroir n’est jamais réduit, quel que soit le mode', () => {
    // `tiroir` : la barre du `Sheet` (AppShell).
    const html = renderToString(
      withIntl(
        <QueryClientProvider client={new QueryClient()}>
          <ToastProvider>
            <PreferencesDuMenuProvider navigationInitiale={undefined} persona="agent" modeIconesInitial="icones">
              <AppSidebar modulesMasques={[]} user={{ id: 1, roles: ['customer', 'agent'], agency_id: 7 } as unknown as User} agencyIsStandard tiroir />
            </PreferencesDuMenuProvider>
          </ToastProvider>
        </QueryClientProvider>,
      ),
    );
    expect(html).toContain('data-menu="complet"');
    // A10 — et la bascule n'y est pas : on ne réduit pas un tiroir.
    expect(html).not.toContain(fr.nav.sidebar.icones.reduire);
  });

  it('la bascule du pied de barre choisit le mode OPPOSÉ à l’état effectif', async () => {
    const user = utilisateur();
    render(element(['customer', 'agent'], 'agent', { modeIcones: 'complet' }));
    await user.click(screen.getByRole('button', { name: /Réduire la barre/ }));
    expect(document.querySelector('aside')).toHaveAttribute('data-menu', 'icones');
    await user.click(screen.getByRole('button', { name: /Déplier la barre/ }));
    expect(document.querySelector('aside')).toHaveAttribute('data-menu', 'complet');
  });
});

describe('TCK-2480 — A11 : les variantes compactes ne sont rendues que si la barre peut se réduire', () => {
  // TCK-2490 (ADR-0090 §3, §6, §7) — plus de variante compacte à doubler : « Aujourd'hui » est le même
  // bloc dans le rail (revue adverse, I1 : ses lignes y deviennent des icônes à point), la ligne de mise
  // en location est UNE ligne dans tous les modes (son texte passe en `sr-only`, son titre en infobulle).
  it('en `complet` : « Aujourd’hui » paraît, une seule ligne de mise en location, pas de « Déplier »', () => {
    nonLus.n = 3;
    render(element(['customer'], 'client', { modeIcones: 'complet' }));
    expect(screen.getByRole('region', { name: fr.nav.sidebar.aujourdhui.titre })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Mettre un bien en location/ })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Déplier la barre/ })).toBeNull();
  });

  // Revue adverse (I1) — « Aujourd'hui » se cachait dans le rail, et le point de l'entrée comptée qui
  // devait le relayer vivait, dans un groupe replié, dans une liste `inert` de hauteur nulle : rien ne
  // signalait l'attente. Il reste : chaque ligne devient son icône, marquée d'un point.
  it('réduite : « Aujourd’hui » reste, chaque ligne en icône marquée d’un point ; l’entrée comptée ne le double pas (M3)', () => {
    nonLus.n = 3;
    render(element(['customer'], 'client', { modeIcones: 'icones' }));
    const classes = (el: Element | null) => (el?.getAttribute('class') ?? '').split(/\s+/);
    // (jsdom n'applique pas le CSS : on lit les variantes du rail.)
    const bloc = screen.getByRole('region', { name: fr.nav.sidebar.aujourdhui.titre });
    expect(classes(bloc)).not.toContain('icones:hidden');
    const ligne = within(bloc).getByRole('link', { name: /^Messages non lus,\s?3$/ });
    expect(classes(ligne.querySelector('[data-slot="point-aujourdhui"]'))).toEqual(
      expect.arrayContaining(['hidden', 'icones:block', 'bg-primary', 'rounded-full']),
    );
    // Le nombre quitte l'œil, jamais la lecture : `sr-only`, pas `hidden`.
    const compte = classes(ligne.querySelector('[data-slot="compte-aujourdhui"]'));
    expect(compte).toContain('icones:sr-only');
    expect(compte).not.toContain('icones:hidden');
    // M3 — la messagerie ne porte ni nombre ni point : le compte ne paraît qu'une fois ; il reste lu.
    const messagerie = within(screen.getByRole('navigation')).getByRole('link', { name: /^Messagerie/ });
    expect(messagerie.querySelector('[data-slot="compteur-entree"]')).toBeNull();
    expect(messagerie).toHaveAccessibleName(/^Messagerie\s?3 messages non lus$/);
    expect(screen.getAllByRole('link', { name: /Mettre un bien en location/ })).toHaveLength(1);
  });

  it('réduite : l’infobulle d’une ligne dit libellé et nombre — 99+ au-delà, le vrai compte restant lu', async () => {
    nonLus.n = 250;
    const user = utilisateur();
    render(element(['customer'], 'client', { modeIcones: 'icones' }));
    const ligne = within(screen.getByRole('region', { name: fr.nav.sidebar.aujourdhui.titre })).getByRole('link');
    expect(ligne).toHaveAccessibleName(/^Messages non lus,\s?250$/);
    await user.hover(ligne);
    await waitFor(() =>
      expect([...document.querySelectorAll('[data-slot="tooltip-content"]')].map((b) => b.textContent)).toEqual([
        'Messages non lus · 99+',
      ]),
    );
  });

  it('réduite : aucun point dans une liste repliée (`inert`, hauteur nulle) ; le témoin ouvert en porte un', () => {
    // « Mes visites » du client : un compte hors de ses priorités, qui reste sur son entrée (M3).
    visites.n = 2;
    const replie = { v: 1, personas: { client: { replies: ['mes-demarches'] } } };
    const { unmount } = render(element(['customer'], 'client', { modeIcones: 'icones', navigation: replie }));
    const liste = document.querySelector('[data-groupe="mes-demarches"] [inert]');
    expect(liste, 'le groupe est bien replié').not.toBeNull();
    expect(liste!.querySelector('[data-slot="compteur-entree"]'), 'le compteur est là').not.toBeNull();
    expect(document.querySelectorAll('[inert] [data-slot="point-entree"]')).toHaveLength(0);
    unmount();

    render(element(['customer'], 'client', { modeIcones: 'icones' }));
    expect(document.querySelectorAll('[data-groupe="mes-demarches"] [data-slot="point-entree"]')).toHaveLength(1);
  });

  // Suite de la revue adverse (b) — le compte d'une entrée repliée, absent d'« Aujourd'hui », ne doit pas
  // disparaître du rail : le groupe replié le signale sur son chevron, seule icône visible du groupe, du
  // même point que les lignes d'« Aujourd'hui », et son nom comme son infobulle donnent le nombre.
  it('réduite : un groupe replié qui cache un compte hors « Aujourd’hui » le signale sur son chevron', async () => {
    visites.n = 2;
    const user = utilisateur();
    const replie = { v: 1, personas: { client: { replies: ['mes-demarches'] } } };
    render(element(['customer'], 'client', { modeIcones: 'icones', navigation: replie }));
    const bascule = document.querySelector<HTMLElement>('[data-groupe="mes-demarches"] > button[aria-expanded="false"]')!;
    expect(bascule, 'le chevron du groupe replié').not.toBeNull();
    const classes = (el: Element | null) => (el?.getAttribute('class') ?? '').split(/\s+/);
    expect(classes(bascule.querySelector('[data-slot="point-groupe"]'))).toEqual(
      expect.arrayContaining(['hidden', 'icones:block', 'bg-primary', 'rounded-full']),
    );
    expect(bascule).toHaveAccessibleName(/^Mes démarches,?\s?2 demandes de visite en attente$/);
    await user.hover(bascule);
    await waitFor(() =>
      expect([...document.querySelectorAll('[data-slot="tooltip-content"]')].map((b) => b.textContent)).toEqual([
        'Mes démarches · 2 demandes de visite en attente',
      ]),
    );
  });

  it('réduite : pas de signal sur un groupe ouvert, ni sans compte, ni pour un compte déjà dans « Aujourd’hui »', () => {
    visites.n = 2;
    const { unmount } = render(element(['customer'], 'client', { modeIcones: 'icones' }));
    expect(document.querySelectorAll('[data-slot="point-groupe"]'), 'groupe ouvert').toHaveLength(0);
    unmount();
    visites.n = 0;
    const replie = { v: 1, personas: { client: { replies: ['mes-demarches'] } } };
    const r2 = render(element(['customer'], 'client', { modeIcones: 'icones', navigation: replie }));
    expect(document.querySelectorAll('[data-slot="point-groupe"]'), 'sans compte').toHaveLength(0);
    r2.unmount();
    // Les visites de l'agent sont une de ses priorités : dans « Aujourd'hui », jamais signalées deux fois,
    // même repliées dans « Prospection ».
    visites.n = 2;
    const prospection = { v: 1, personas: { agent: { replies: ['prospection'] } } };
    render(element(['customer', 'agent'], 'agent', { modeIcones: 'icones', navigation: prospection }));
    expect(document.querySelector('[data-groupe="prospection"] > button[aria-expanded="false"]'), 'replié').not.toBeNull();
    expect(document.querySelectorAll('[data-slot="point-aujourdhui"]').length, 'dans « Aujourd’hui »').toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-slot="point-groupe"]'), 'déjà dans « Aujourd’hui »').toHaveLength(0);
  });

  // Dernier point de la revue adverse — barre DÉPLIÉE, même motif que (b) : le titre d'un groupe replié
  // montre le compte qu'« Aujourd'hui » ne porte pas, en chiffres de compteur, au bord droit des
  // compteurs ; le nombre entre dans le nom du bouton. Déplié, le titre se tait : le compte est sur l'entrée.
  it('dépliée : le titre d’un groupe replié montre le compte caché, et le rend à l’entrée une fois déplié', async () => {
    visites.n = 2;
    const user = utilisateur();
    const replie = { v: 1, personas: { client: { replies: ['mes-demarches'] } } };
    render(element(['customer'], 'client', { modeIcones: 'complet', navigation: replie }));
    const groupe = document.querySelector<HTMLElement>('[data-groupe="mes-demarches"]')!;
    const bascule = groupe.querySelector<HTMLElement>(':scope > button[aria-expanded="false"]')!;
    const compte = bascule.querySelector('[data-slot="compte-groupe"]');
    expect(compte, 'le nombre sur le titre').not.toBeNull();
    expect(compte).toHaveTextContent(/^2$/);
    expect(compte).toHaveAttribute('aria-hidden', 'true');
    const classesDuCompte = (compte!.getAttribute('class') ?? '').split(/\s+/);
    // Les chiffres d'un compteur (`STYLE_COMPTEUR`), poussés au bord droit, cachés dans le rail (qui a son point).
    expect(classesDuCompte).toEqual(expect.arrayContaining(['ml-auto', 'tabular-nums', 'text-primary-deep', 'icones:hidden']));
    expect(bascule.lastElementChild, 'dernier enfant : le bord droit').toBe(compte);
    expect(bascule).toHaveAccessibleName(/^Mes démarches,?\s?2 demandes de visite en attente$/);

    await user.click(bascule);
    const ouvert = groupe.querySelector<HTMLElement>(':scope > button[aria-expanded="true"]')!;
    expect(ouvert.querySelector('[data-slot="compte-groupe"]'), 'déplié, le titre se tait').toBeNull();
    expect(ouvert).toHaveAccessibleName('Mes démarches');
    expect(groupe.querySelector('a[href="/app/visits"] [data-slot="compteur-entree"]')).toHaveTextContent('2');
  });

  it('dépliée : au-delà de 99, le titre montre « 99+ », et son nom garde le vrai compte', () => {
    visites.n = 150;
    const replie = { v: 1, personas: { client: { replies: ['mes-demarches'] } } };
    render(element(['customer'], 'client', { modeIcones: 'complet', navigation: replie }));
    const bascule = document.querySelector<HTMLElement>('[data-groupe="mes-demarches"] > button[aria-expanded="false"]')!;
    expect(bascule.querySelector('[data-slot="compte-groupe"]')).toHaveTextContent(/^99\+$/);
    expect(bascule).toHaveAccessibleName(/^Mes démarches,?\s?150 demandes de visite en attente$/);
  });

  it('en `auto`, la bascule porte les DEUX libellés (le CSS en montre un) ; en `icones`, seul « Déplier »', () => {
    const { unmount } = render(element(['customer', 'agent'], 'agent', { modeIcones: 'auto' }));
    const bascule = document.querySelector('aside button[data-slot="bascule-icones"]') as HTMLElement;
    expect(bascule).toHaveTextContent(fr.nav.sidebar.icones.reduire);
    expect(bascule).toHaveTextContent(fr.nav.sidebar.icones.deplier);
    unmount();
    render(element(['customer', 'agent'], 'agent', { modeIcones: 'icones' }));
    expect(screen.getByRole('button', { name: fr.nav.sidebar.icones.deplier })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: fr.nav.sidebar.icones.reduire })).toBeNull();
  });
});

/**
 * Revue de TCK-2480 (M1) — barre réduite : le libellé d'une ligne passe en infobulle. Une ligne
 * cadenassée (agence `individual`) l'avait perdue : seule restait une icône et un `title` « réservé ».
 */
describe('TCK-2480 — M1 : barre réduite, la ligne cadenassée a son infobulle', () => {
  const navigation = { v: 1, personas: { hote: { ouverts: ['plus'] } } };
  const bulles = () => [...document.querySelectorAll('[data-slot="tooltip-content"]')].map((b) => b.textContent);
  const rendreLHote = (modeIcones: ModeIcones) =>
    render(element(['customer', 'agency_admin', 'owner'], 'hote', { agencyIsStandard: false, modeIcones, navigation }));
  const cadenassee = () => screen.getByRole('link', { name: new RegExp(`^Propriétaires`) });

  it('au survol : le libellé ET la raison du cadenas', async () => {
    const user = utilisateur();
    rendreLHote('icones');
    expect(cadenassee()).toHaveAttribute('aria-disabled', 'true');
    // Une seule bulle : pas de `title` natif par-dessus l'infobulle.
    expect(cadenassee()).not.toHaveAttribute('title');
    await user.hover(cadenassee());
    await waitFor(() => expect(bulles()).toHaveLength(1));
    expect(bulles()[0]).toContain('Propriétaires');
    expect(bulles()[0]).toContain(fr.nav.sidebar.proLocked);
  });

  it('au focus clavier aussi', async () => {
    rendreLHote('icones');
    act(() => cadenassee().focus());
    await waitFor(() => expect(bulles().join(' ')).toContain('Propriétaires'));
  });

  it('témoin : une ligne ordinaire a la même infobulle (son libellé)', async () => {
    const user = utilisateur();
    rendreLHote('icones');
    await user.hover(screen.getByRole('link', { name: 'Messagerie' }));
    await waitFor(() => expect(bulles()).toEqual(['Messagerie']));
  });

  it('barre dépliée : aucune infobulle, le cadenas garde son `title`', async () => {
    const user = utilisateur();
    rendreLHote('complet');
    expect(cadenassee()).toHaveAttribute('title', fr.nav.sidebar.proLocked);
    await user.hover(cadenassee());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(bulles()).toEqual([]);
  });
});

/**
 * Revue adverse de TCK-2490 (M2) — un même bord droit pour les nombres, les puces et les touches : l'épingle
 * invisible gardait au repos sa place (28 px + 4 px). TCK-2619 — elle n'est plus RENDUE hors du mode
 * « Modifier le menu » : au repos, aucune place réservée, par construction ; en édition, sa largeur.
 * (jsdom n'applique pas le CSS : on lit les classes ; le bord droit est relevé au navigateur.)
 */
describe('revue adverse (M2) — l’épingle ne réserve sa place que là où elle s’affiche', () => {
  const classes = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/);

  it('au repos : aucune épingle ; en édition, chacune à sa largeur, toujours visible', () => {
    render(element(['customer', 'agent'], 'agent', { modeIcones: 'complet' }));
    expect(document.querySelectorAll('button[data-epingle]')).toHaveLength(0);
    entrerEnEdition();
    const epingle = document.querySelector('button[data-epingle][aria-pressed="false"]')!;
    expect(epingle).not.toBeNull();
    expect(classes(epingle)).toEqual(expect.arrayContaining(['size-7', 'mr-1']));
    for (const cache of ['w-0', 'opacity-0', 'hidden', 'invisible']) expect(classes(epingle)).not.toContain(cache);
  });
});

describe('TCK-2619 — le mode « Modifier le menu » (tiroir et colonne)', () => {
  const epingler = /^Épingler /;

  it('AC3 — aucune punaise avant le geste ; après, chaque ligne épinglable en porte une (le tiroir est relevé à 390)', () => {
    render(element(AGENT_ET_BAILLEUR, 'agent', { typeProfilActif: 'agent' }));
    expect(screen.queryAllByRole('button', { name: epingler, hidden: true })).toEqual([]);
    expect(document.querySelector('[data-poignee]')).toBeNull();
    entrerEnEdition();
    const punaises = screen.getAllByRole('button', { name: epingler, hidden: true });
    // Chaque lien du menu rendu hors du complément « Aussi … » (non épinglable) a sa punaise, une seule.
    const liens = [...document.querySelectorAll('[data-slot="menu"] [data-groupe]:not([data-groupe="aussi"]) a[href]')];
    expect(liens.length).toBeGreaterThan(3);
    expect(punaises).toHaveLength(liens.length);
    for (const lien of liens) {
      expect(lien.closest('[data-ligne]')?.querySelector('button[data-epingle]'), lien.textContent ?? '').not.toBeNull();
    }
  });

  it('le bandeau dit la limite et le compte ; « Terminé » retire punaises et poignées, et rend le focus', () => {
    const navigation = { v: 1, personas: { agent: { epingles: ['commissions', 'baux'] } } };
    render(element(['customer', 'agent'], 'agent', { navigation }));
    entrerEnEdition();
    const bandeau = document.querySelector<HTMLElement>('[data-slot="bandeau-d-edition"]')!;
    expect(bandeau).toHaveTextContent('Épinglez jusqu’à 5 pages');
    expect(bandeau).toHaveTextContent('2 sur 5 · glissez pour ordonner');
    const terminer = within(bandeau).getByRole('button', { name: 'Terminé' });
    expect(document.activeElement).toBe(terminer);
    act(() => terminer.click());
    expect(document.querySelector('[data-slot="bandeau-d-edition"]')).toBeNull();
    expect(screen.queryAllByRole('button', { name: epingler })).toEqual([]);
    expect(document.querySelector('[data-poignee]')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: fr.nav.sidebar.edition.modifier }));
  });

  it('réordonner deux épingles au clavier écrit le nouvel ordre, et la poignée garde le focus', async () => {
    const user = utilisateur();
    const navigation = { v: 1, personas: { agent: { epingles: ['commissions', 'baux'] } } };
    render(element(['customer', 'agent'], 'agent', { navigation }));
    const ordre = () => within(groupe('Épinglés')).getAllByRole('link').map((a) => a.textContent);
    expect(ordre()).toEqual(['Commissions', 'Baux']);
    entrerEnEdition();
    // Une poignée par épingle, et aucune ailleurs.
    expect([...document.querySelectorAll('[data-poignee]')].map((p) => p.getAttribute('data-poignee'))).toEqual([
      'commissions',
      'baux',
    ]);
    within(groupe('Épinglés')).getByRole('button', { name: /^Déplacer Baux/ }).focus();
    await user.keyboard('{ArrowUp}');
    expect(ordre()).toEqual(['Baux', 'Commissions']);
    expect(document.activeElement).toHaveAttribute('data-poignee', 'baux');
    await attendreLEnvoi();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(corps()).toEqual({ navigation: { v: 1, personas: { agent: { epingles: ['baux', 'commissions'] } } } });
    // Au bord, la flèche ne déplace rien et n'écrit rien de plus.
    await user.keyboard('{ArrowUp}');
    await attendreLEnvoi();
    expect(ordre()).toEqual(['Baux', 'Commissions']);
  });

  it('réordonner en glissant : déposer « Visites » sur « Commissions » écrit le nouvel ordre ; un dépôt hors cible ou sur soi ne fait rien', async () => {
    const navigation = { v: 1, personas: { agent: { epingles: ['commissions', 'baux', 'visites'] } } };
    render(element(['customer', 'agent'], 'agent', { navigation }));
    const ordre = () => within(groupe('Épinglés')).getAllByRole('link').map((a) => a.textContent);
    expect(ordre()).toEqual(['Commissions', 'Baux', 'Visites']);
    // Hors édition, pas de contexte de glisser : rien à rejouer.
    expect(finDuGlisser.rappel).toBeNull();
    entrerEnEdition();
    const deposer = (active: string, over: string | null) =>
      act(() => finDuGlisser.rappel!({ active: { id: active }, over: over === null ? null : { id: over } }));
    expect(finDuGlisser.rappel).toBeTypeOf('function');

    deposer('baux', null);
    deposer('baux', 'baux');
    await attendreLEnvoi();
    expect(ordre()).toEqual(['Commissions', 'Baux', 'Visites']);
    expect(fetchMock).not.toHaveBeenCalled();

    deposer('visites', 'commissions');
    expect(ordre()).toEqual(['Visites', 'Commissions', 'Baux']);
    // La poignée de l'épingle déplacée garde le focus, comme au clavier.
    expect(document.activeElement).toHaveAttribute('data-poignee', 'visites');
    await attendreLEnvoi();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(corps()).toEqual({ navigation: { v: 1, personas: { agent: { epingles: ['visites', 'commissions', 'baux'] } } } });
  });

  it('en édition, la colonne ne montre que ce qui s’épingle : ni « Aujourd’hui », ni « Récents », ni l’action', () => {
    nonLus.n = 3;
    render(element(AGENT_ET_BAILLEUR, 'agent', { typeProfilActif: 'agent' }));
    expect(document.querySelector('[data-slot="aujourdhui"]')).not.toBeNull();
    entrerEnEdition();
    expect(document.querySelector('[data-slot="aujourdhui"]')).toBeNull();
    expect(document.querySelector('[data-slot="action-principale"]')).toBeNull();
    expect(document.querySelector('[data-slot="modifier-le-menu"]')).toBeNull();
  });

  it('en édition, la tête de colonne ne garde que la marque : ni cloche, ni bascule ; « Terminé » les rend', () => {
    render(element(AGENT_ET_BAILLEUR, 'agent', { typeProfilActif: 'agent' }));
    expect(document.querySelector('[data-slot="cloche"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="bascule-icones"]')).not.toBeNull();
    entrerEnEdition();
    expect(document.querySelector('[data-slot="marque"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="cloche"]')).toBeNull();
    expect(document.querySelector('[data-slot="bascule-icones"]')).toBeNull();
    act(() => screen.getByRole('button', { name: 'Terminé' }).click());
    expect(document.querySelector('[data-slot="cloche"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="bascule-icones"]')).not.toBeNull();
  });
});

describe('TCK-2619 — epinglesApresDeplacement', () => {
  it('déplace au rang voulu, borné ; une épingle absente ne bouge rien', async () => {
    const { epinglesApresDeplacement } = await import('@/lib/navigation/preferences');
    expect(epinglesApresDeplacement(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    expect(epinglesApresDeplacement(['a', 'b', 'c'], 'a', 1)).toEqual(['b', 'a', 'c']);
    expect(epinglesApresDeplacement(['a', 'b', 'c'], 'a', 9)).toEqual(['b', 'c', 'a']);
    expect(epinglesApresDeplacement(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(epinglesApresDeplacement(['a', 'b'], 'z', 0)).toEqual(['a', 'b']);
  });
});
