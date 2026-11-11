/**
 * TCK-646 (AC4) et TCK-642 (AC2, AC3, AC5) — la coque `/app` montée en entier : la barre haute,
 * la barre latérale de bureau et le tiroir (le « menu mobile » de `/app`).
 *
 * Le tiroir rend le MÊME `AppSidebar` que la barre de bureau : c'est ce qui garantit l'AC4 de
 * TCK-646. Ce fichier le constate sur le DOM, au lieu de le déduire du code : si un jour le tiroir
 * rendait autre chose, l'ordre comparé ici divergerait.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import { AccesAdminProvider } from '@/lib/access/acces-admin-contexte';
import { accesDepuis, type AccesAdmin } from '@/lib/access/pages-admin';
import type { User, UserRole } from '@/types/user';
import { AppShell } from '../AppShell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/app',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

// P152.03 — les rôles système portent `properties.create` : l'action « Publier un bien » de
// l'admin d'agence se juge par elle (sans lecture, le personnel n'a aucune entrée de création).
vi.mock('@/hooks/useCan', () => ({
  useMyCapabilities: () => ({ data: { data: { agency_id: 1, capabilities: ['properties.create'] } } }),
}));

// Les compteurs et le solde sondent le réseau : ce fichier éprouve leur RENDU.
// TCK-2479 — le compte des non-lus est réglable : la bande « À traiter » doit paraître dans le tiroir.
const nonLusMock = vi.hoisted(() => vi.fn<() => number>(() => 0));
vi.mock('@/components/chat-widget/useUnreadCount', () => ({ useUnreadCount: () => nonLusMock() }));
vi.mock('@/lib/queries/visits', () => ({ usePendingVisitsCount: () => ({}) }));
vi.mock('@/lib/queries/contact-leads', () => ({ useUnhandledLeadsCount: () => ({}) }));
// TCK-2479 — « Démarrer » : réglable, muet par défaut.
const demarrageMock = vi.hoisted(() => vi.fn<() => { data?: unknown }>(() => ({})));
vi.mock('@/lib/queries/demarrage-espace', () => ({ useDemarrageDeLEspace: () => demarrageMock() }));
const soldeMock = vi.hoisted(() => vi.fn<(o: { enabled: boolean }) => number | null>(() => null));
vi.mock('@/lib/queries/credits-solde', () => ({
  useSoldeCredits: (o: { enabled: boolean }) => soldeMock(o),
}));
vi.mock('@/hooks/useImpersonation', () => ({
  useImpersonationCourante: () => ({ data: null }),
  useQuitterImpersonation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/components/agency/AgencyStandardWelcomeWizard', () => ({ AgencyStandardWelcomeWizard: () => null }));
vi.mock('@/components/agent/AgentWelcomeWizard', () => ({ AgentWelcomeWizard: () => null }));
vi.mock('@/components/customer/CustomerWelcomeWizard', () => ({ CustomerWelcomeWizard: () => null }));
vi.mock('@/components/customer/MinimalProfileTriggerProvider', () => ({
  MinimalProfileTriggerProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/owner/OwnerWelcomeWizard', () => ({ OwnerWelcomeWizard: () => null }));
vi.mock('@/components/tenant/TenantWelcomeWizard', () => ({ TenantWelcomeWizard: () => null }));

function utilisateur(roles: UserRole[]): User {
  return { id: 1, first_name: 'Awa', last_name: 'Diop', full_name: 'Awa Diop', email: 'awa@example.test', roles } as unknown as User;
}

function monter(roles: UserRole[], acces?: AccesAdmin) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const coque = (
    <AppShell user={utilisateur(roles)} agencyIsStandard>
      <p>contenu</p>
    </AppShell>
  );
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>{acces ? <AccesAdminProvider acces={acces}>{coque}</AccesAdminProvider> : coque}</ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

const hrefs = (racine: Element) =>
  Array.from(racine.querySelectorAll('[data-slot="menu"] a')).map((a) => a.getAttribute('href'));

/** TCK-2481 — sous `md`, « Menu » de la barre d'onglets est la seule porte du tiroir (le burger est parti). */
const boutonMenu = () =>
  within(screen.getByRole('navigation', { name: 'Accès rapide' })).getByRole('button', { name: 'Menu' });

async function ouvrirLeTiroir() {
  const user = userEvent.setup();
  await user.click(boutonMenu());
  return screen.findByRole('dialog');
}

/** Les noms accessibles normalisés (espace fine insécable des milliers → espace). */
const nomNormalise = (attendu: string) => (nom: string) => nom.replace(/\s/g, ' ') === attendu;

beforeEach(() => {
  nonLusMock.mockReset();
  nonLusMock.mockReturnValue(0);
  demarrageMock.mockReset();
  demarrageMock.mockReturnValue({});
  soldeMock.mockReset();
  soldeMock.mockReturnValue(null);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Tous les liens de la barre, dans l'ordre : action principale, menu, carte, pied. TCK-2619 — sans la
 * marque, qui mène désormais à `/app` comme l'accueil du menu.
 */
const tousLesLiens = (racine: Element) =>
  Array.from(racine.querySelectorAll('a:not([data-slot="marque"])')).map((a) => a.getAttribute('href'));
/** Les titres des groupes, et l'état de leur bascule. */
const groupes = (racine: Element) =>
  Array.from(racine.querySelectorAll('[data-groupe]')).map((g) => [
    g.getAttribute('data-groupe'),
    g.querySelector(':scope > button')?.getAttribute('aria-expanded') ?? null,
  ]);

describe('TCK-646 — le menu mobile de /app présente le même ordre (AC4)', () => {
  // TCK-2478 — la barre porte aussi l'action principale (hors du menu), les groupes repliés et la
  // carte du client : le tiroir doit les présenter à l'identique, pas seulement les liens du menu.
  // TCK-2489 (ADR-0090 §4) — le tableau de bord n'ouvre plus le menu que pour l'admin d'agence : le
  // premier lien est celui de la disposition, au tiroir comme au bureau.
  it.each([
    [['agency_admin'], '/app/properties/new', '/app'],
    [['owner'], '/app/properties/new', '/app/messages'],
    [['customer'], '/fr/properties', '/app/messages'],
  ] as [UserRole[], string, string][])('%j', async (roles, action, premier) => {
    const { container } = monter([...roles, 'customer']);
    const bureau = container.querySelector('aside')!;
    const tiroir = await ouvrirLeTiroir();
    expect(hrefs(tiroir)).toEqual(hrefs(bureau));
    // Le premier lien après l'action : le tableau de bord de l'admin d'agence est hissé EN TÊTE, hors du menu,
    // dans le repère de la colonne (revue adverse de TCK-2490, 3 et a) ; les autres menus s'ouvrent sur leur première entrée.
    for (const barre of [bureau, tiroir]) {
      expect(tousLesLiens(barre).filter((h) => h !== '/' && h !== action)[0]).toBe(premier);
    }
    expect(tousLesLiens(tiroir).filter((h) => h !== '/')).toEqual(tousLesLiens(bureau).filter((h) => h !== '/'));
    expect(groupes(tiroir)).toEqual(groupes(bureau));
    expect(tiroir.querySelector('[data-slot="action-principale"]')).toHaveAttribute('href', action);
  });
});

// TCK-2490 (ADR-0090 §3) — la bande « À traiter » est devenue le bloc « Aujourd’hui » : des lignes
// libellées par l'action, même contrat au tiroir.
describe('TCK-2479 / TCK-2490 — « Aujourd’hui » est aussi dans le tiroir', () => {
  it('mêmes lignes qu’à la barre de bureau ; un clic referme le tiroir', async () => {
    nonLusMock.mockReturnValue(3);
    const { container } = monter(['agent']);
    const bureau = container.querySelector('aside')!;
    const duBloc = (racine: Element) =>
      within(within(racine as HTMLElement).getByRole('region', { name: 'Aujourd’hui' }))
        .getAllByRole('link')
        .map((l) => [l.textContent, l.getAttribute('href')]);
    // Lu AVANT l'ouverture : le tiroir modal rend la barre de bureau `inert`.
    const auBureau = duBloc(bureau);
    expect(auBureau).toEqual([['Messages non lus, 3', '/app/messages']]);

    const tiroir = await ouvrirLeTiroir();
    expect(duBloc(tiroir)).toEqual(auBureau);
    const region = within(tiroir).getByRole('region', { name: 'Aujourd’hui' });
    await userEvent.setup().click(within(region).getByRole('link', { name: /^Messages non lus,\s?3$/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('TCK-2479 — « Démarrer » est aussi dans le tiroir', () => {
  it('mêmes étapes qu’à la barre de bureau, en tête du menu ; un clic referme le tiroir', async () => {
    demarrageMock.mockReturnValue({
      data: { data: { etapes: [{ code: 'premier_bien', faite: true }, { code: 'kyc', faite: false }, { code: 'equipe', faite: false }] } },
    });
    // Revue de TCK-2479 (M6) — chaque étape est jugée par la garde de SA page : l'accès aux pages
    // d'agence est celui que le layout de `/app` fournit (sans lui, le repli ne connaît aucune
    // capacité et `/app/agency/kyc`, qui exige `agency.update_kyc`, est fermé).
    const roles: UserRole[] = ['agency_admin', 'customer'];
    const { container } = monter(
      roles,
      accesDepuis({ roles, agence: { kind: 'standard' }, capacites: ['agency.update', 'agency.update_kyc'] }),
    );
    const etapes = (racine: Element) => {
      const groupe = within(racine as HTMLElement).getByRole('group', { name: 'Démarrer' });
      expect(racine.querySelector<HTMLElement>('[data-slot="menu"]')!.firstElementChild).toBe(groupe);
      return within(groupe).getAllByRole('link').map((l) => l.getAttribute('href'));
    };
    // Lues AVANT l'ouverture : le tiroir modal rend la barre de bureau `inert`.
    const auBureau = etapes(container.querySelector('aside')!);
    expect(auBureau).toEqual(['/app/agency/kyc', '/app/agency/team']);

    const tiroir = await ouvrirLeTiroir();
    expect(etapes(tiroir)).toEqual(auBureau);
    await userEvent.setup().click(within(tiroir).getByRole('link', { name: /Inviter un premier membre/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

// TCK-2491 (ADR-0090 §2) — la barre haute et sa pastille sont parties : le solde se lit sur l'entrée
// « Crédits » de la colonne (à toutes les largeurs) et dans le menu du compte.
describe('TCK-642, repris par TCK-2491 — le solde dans la colonne et le menu du compte', () => {
  const colonne = () => document.querySelector('aside')!;
  async function ouvrirLeMenuDuCompte() {
    await userEvent.setup().click(colonne().querySelector<HTMLElement>('[data-slot="pied-du-compte"]')!);
    return screen.findByRole('menu');
  }

  it('admin d’espace : l’entrée « Crédits » porte le solde et mène à /app/credits ; le menu du compte aussi', async () => {
    soldeMock.mockReturnValue(1250);
    monter(['agency_admin']);
    const entree = within(colonne()).getByRole('link', { name: nomNormalise('Crédits : 1 250 crédits') });
    expect(entree).toHaveAttribute('href', '/app/credits');
    // TCK-2742 — l'entrée du menu prend la carte des maquettes ; la ligne du compte garde ses pièces (AC3).
    expect(entree.querySelector('svg.lucide-credit-card')).not.toBeNull();
    const menu = await ouvrirLeMenuDuCompte();
    const ligne = menu.querySelector('[data-slot="solde-du-compte"]')!;
    expect(ligne.textContent?.replace(/\s/g, ' ')).toBe('Crédits1 250');
    expect(ligne.querySelector('svg.lucide-coins')).not.toBeNull();
  });

  it('sans droit sur le portefeuille : ni ligne de solde, ni lecture du solde (AC2)', async () => {
    soldeMock.mockReturnValue(1250);
    monter(['agent']);
    // Le menu du compte et la colonne n'arment le solde que pour qui voit le portefeuille.
    for (const [options] of soldeMock.mock.calls) expect(options.enabled).toBe(false);
    const menu = await ouvrirLeMenuDuCompte();
    expect(menu.querySelector('[data-slot="solde-du-compte"]')).toBeNull();
  });

  it('solde inconnu (refus, panne, chargement) : aucune ligne, aucun « 0 » (AC5)', async () => {
    soldeMock.mockReturnValue(null);
    monter(['agency_admin']);
    expect(colonne().querySelector('[data-slot="valeur-entree"]')).toBeNull();
    const menu = await ouvrirLeMenuDuCompte();
    expect(menu.querySelector('[data-slot="solde-du-compte"]')).toBeNull();
    expect(within(menu).queryByText('0')).toBeNull();
  });

  it('dans le tiroir : l’entrée « Crédits » porte le solde et mène à /app/credits (AC3)', async () => {
    soldeMock.mockReturnValue(12);
    monter(['agency_admin']);
    const tiroir = await ouvrirLeTiroir();
    const entree = within(tiroir).getByRole('link', { name: 'Crédits : 12 crédits' });
    expect(entree).toHaveAttribute('href', '/app/credits');
    expect(entree).toHaveTextContent('12');
    expect(entree.querySelector('svg.lucide-credit-card')).not.toBeNull(); // TCK-2742
  });
});

describe('TCK-1035, repris par TCK-2481 — « Menu » dit si le tiroir est ouvert', () => {
  it('aria-expanded suit l’ouverture du tiroir', async () => {
    monter(['agency_admin']);
    const bouton = boutonMenu();
    expect(bouton).toHaveAttribute('aria-expanded', 'false');

    await ouvrirLeTiroir();
    // Le tiroir modal rend la barre `inert` : on relit le même nœud, pas un `getByRole`.
    expect(bouton).toHaveAttribute('aria-expanded', 'true');
  });
});
