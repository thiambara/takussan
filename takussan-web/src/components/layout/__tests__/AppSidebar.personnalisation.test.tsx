/**
 * TCK-2480 — la barre montée, avec le fournisseur des préférences : épingler au clavier, replier,
 * le rangement par persona, l'épingle périmée ignorée, l'échec rétabli, « Démarrer » masqué.
 *
 * Les `vi.mock` d'en-tête sont ceux d'`AppSidebar.test.tsx` (ce fichier éprouve la PERSONNALISATION,
 * pas le réseau ni le sélecteur de profil).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User, UserRole } from '@/types/user';
import type { ProfileType } from '@/types/profile';
import { withIntl } from '@/test/intl';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import type { Persona } from '@/lib/navigation/personas';
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
vi.mock('@/components/chat-widget/useUnreadCount', () => ({ useUnreadCount: () => 0 }));
vi.mock('@/lib/queries/visits', () => ({ usePendingVisitsCount: () => ({}) }));
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
  options: { navigation?: unknown; typeProfilActif?: ProfileType; agencyIsStandard?: boolean } = {},
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
        <PreferencesDuMenuProvider navigationInitiale={options.navigation} persona={persona} modeIconesInitial="complet">
          <AppSidebar
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
    await attendreLEnvoi();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(corps()).toEqual({ navigation: { v: 1, personas: { agent: { epingles: ['commissions'] } } } });

    // Désépingler, toujours au clavier : elle revient dans « Gestion ».
    within(groupe('Épinglés')).getByRole('button', { name: 'Épingler Commissions', pressed: true }).focus();
    await user.keyboard('{Enter}');
    expect(within(groupe('Gestion')).getByRole('link', { name: 'Commissions' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Épinglés' })).toBeNull();
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

  it('A9 — « Démarrer » masqué pour le persona : ni groupe, ni lecture', () => {
    demarrage.etapes = [{ code: 'premier_bien', faite: false }];
    const navigation = { v: 1, personas: { 'admin-agence': { demarrer_masque: true } } };
    const { container } = render(element(['customer', 'agency_admin'], 'admin-agence', { navigation }));
    expect(container.querySelector('[data-slot="demarrer"]')).toBeNull();
  });
});
