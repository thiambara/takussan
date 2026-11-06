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

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
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
const attendreLEnvoi = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(DELAI_D_ENVOI_MS);
  });

describe('TCK-2480 — personnaliser le menu depuis la barre', () => {
  it('AC1 — au clavier : Tab mène de « Commissions » à son épingle ; Entrée la monte dans « Épinglés »', async () => {
    const user = utilisateur();
    render(element(AGENT_ET_BAILLEUR, 'agent', { typeProfilActif: 'agent' }));
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

  it('A6 — « Épinglés » ouvre le `<nav>`, titré, AVANT « Démarrer »', () => {
    demarrage.etapes = [
      { code: 'premier_bien', faite: false },
      { code: 'kyc', faite: false },
      { code: 'equipe', faite: false },
    ];
    const navigation = { v: 1, personas: { 'admin-agence': { epingles: ['commissions'] } } };
    render(element(['customer', 'agency_admin'], 'admin-agence', { navigation }));
    const nav = screen.getByRole('navigation', { name: fr.nav.sidebar.navLabel });
    const blocs = [...nav.children];
    expect(blocs[0]).toHaveAttribute('data-groupe', 'epingles');
    expect(within(blocs[0] as HTMLElement).getByText('Épinglés')).toBeInTheDocument();
    expect(blocs[1]?.querySelector('[data-slot="demarrer"]') ?? blocs[1]).toHaveAttribute('data-slot', 'demarrer');
  });

  it('A7 — l’action principale ne s’épingle pas (« Paiements » du locataire), le reste oui', () => {
    render(element(['customer', 'tenant'], 'locataire'));
    expect(screen.queryByRole('button', { name: 'Épingler Paiements' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Épingler Mon bail' })).toBeInTheDocument();
  });

  it('A7 — une ligne cadenassée ne s’épingle pas (« Vue agence » de l’hôte, agence `individual`)', () => {
    render(element(['customer', 'agency_admin', 'owner'], 'hote', { agencyIsStandard: false }));
    // Les deux lignes cadenassées de l'hôte sont sous « Plus », replié : `hidden: true`.
    const cadenassees = screen.getAllByTitle(fr.nav.sidebar.proLocked);
    expect(cadenassees.map((c) => c.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('Vue agence')]),
    );
    expect(screen.queryByRole('button', { name: 'Épingler Vue agence', hidden: true })).toBeNull();
    expect(screen.getByRole('button', { name: 'Épingler Messagerie' })).toBeInTheDocument();
  });

  it('A6 — « Épinglés » est titré même quand aucun titre de section ne paraît (prestataire)', () => {
    const navigation = { v: 1, personas: { prestataire: { epingles: ['messagerie'] } } };
    render(element(['customer', 'service_provider'], 'prestataire', { navigation }));
    expect(within(groupe('Épinglés')).getByRole('link', { name: 'Messagerie' })).toBeInTheDocument();
  });

  it('A7 — le complément « Aussi … » ne s’épingle pas', () => {
    render(element(AGENT_ET_BAILLEUR, 'agent', { typeProfilActif: 'agent' }));
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
    expect(tiroir.querySelector('nav')!.contains(document.activeElement)).toBe(true);
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
    // TCK-2490 (ADR-0090 §1, §7) — 272 px, rail de 60 px : en px, comme la maquette validée (la base
    // de 90 % du bureau, TCK-635, ne les rétrécit pas).
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
  const cadenassee = () => screen.getByRole('link', { name: new RegExp(`^Vue agence`) });

  it('au survol : le libellé ET la raison du cadenas', async () => {
    const user = utilisateur();
    rendreLHote('icones');
    expect(cadenassee()).toHaveAttribute('aria-disabled', 'true');
    // Une seule bulle : pas de `title` natif par-dessus l'infobulle.
    expect(cadenassee()).not.toHaveAttribute('title');
    await user.hover(cadenassee());
    await waitFor(() => expect(bulles()).toHaveLength(1));
    expect(bulles()[0]).toContain('Vue agence');
    expect(bulles()[0]).toContain(fr.nav.sidebar.proLocked);
  });

  it('au focus clavier aussi', async () => {
    rendreLHote('icones');
    act(() => cadenassee().focus());
    await waitFor(() => expect(bulles().join(' ')).toContain('Vue agence'));
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
