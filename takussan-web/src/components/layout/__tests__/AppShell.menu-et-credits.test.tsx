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
  Array.from(racine.querySelectorAll('nav a')).map((a) => a.getAttribute('href'));

async function ouvrirLeTiroir() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));
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

/** Tous les liens de la barre, dans l'ordre : action principale, menu, carte, pied. */
const tousLesLiens = (racine: Element) =>
  Array.from(racine.querySelectorAll('a')).map((a) => a.getAttribute('href'));
/** Les titres des groupes, et l'état de leur bascule. */
const groupes = (racine: Element) =>
  Array.from(racine.querySelectorAll('[data-groupe]')).map((g) => [
    g.getAttribute('data-groupe'),
    g.querySelector(':scope > button')?.getAttribute('aria-expanded') ?? null,
  ]);

describe('TCK-646 — le menu mobile de /app présente le même ordre (AC4)', () => {
  // TCK-2478 — la barre porte aussi l'action principale (hors du `<nav>`), les groupes repliés et la
  // carte du client : le tiroir doit les présenter à l'identique, pas seulement les liens du `<nav>`.
  it.each([
    [['agency_admin'], '/app/properties/new'],
    [['owner'], '/app/properties/new'],
    [['customer'], '/fr/properties'],
  ] as [UserRole[], string][])('%j', async (roles, action) => {
    const { container } = monter([...roles, 'customer']);
    const bureau = container.querySelector('aside')!;
    const tiroir = await ouvrirLeTiroir();
    expect(hrefs(tiroir)).toEqual(hrefs(bureau));
    expect(hrefs(tiroir)[0]).toBe('/app');
    expect(tousLesLiens(tiroir).filter((h) => h !== '/')).toEqual(tousLesLiens(bureau).filter((h) => h !== '/'));
    expect(groupes(tiroir)).toEqual(groupes(bureau));
    expect(tiroir.querySelector('[data-slot="action-principale"]')).toHaveAttribute('href', action);
  });
});

describe('TCK-2479 — la bande « À traiter » est aussi dans le tiroir', () => {
  it('mêmes pastilles qu’à la barre de bureau ; un clic referme le tiroir', async () => {
    nonLusMock.mockReturnValue(3);
    const { container } = monter(['agent']);
    const bureau = container.querySelector('aside')!;
    const deLaBande = (racine: Element) =>
      within(within(racine as HTMLElement).getByRole('region', { name: 'À traiter' }))
        .getAllByRole('link')
        .map((l) => [l.getAttribute('aria-label'), l.getAttribute('href')]);
    // Lue AVANT l'ouverture : le tiroir modal rend la barre de bureau `inert`.
    const auBureau = deLaBande(bureau);
    expect(auBureau).toEqual([['3 messages non lus', '/app/messages']]);

    const tiroir = await ouvrirLeTiroir();
    expect(deLaBande(tiroir)).toEqual(auBureau);
    await userEvent.setup().click(within(tiroir).getByRole('link', { name: '3 messages non lus' }));
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
      expect(racine.querySelector('nav')!.firstElementChild).toBe(groupe);
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

describe('TCK-642 — la pastille de la barre haute', () => {
  it('admin d’espace : le solde, qui mène à /app/credits, montré dès `md`', () => {
    soldeMock.mockReturnValue(1250);
    monter(['agency_admin']);
    const pastille = within(screen.getByRole('banner')).getByRole('link', {
      name: nomNormalise('Crédits : 1 250 crédits'),
    });
    expect(pastille).toHaveAttribute('href', '/app/credits');
    expect(pastille.className).toContain('hidden');
    expect(pastille.className).toContain('md:inline-flex');
  });

  it('sans droit sur le portefeuille : ni pastille, ni lecture du solde par la barre (AC2)', () => {
    soldeMock.mockReturnValue(1250);
    monter(['agent']);
    expect(within(screen.getByRole('banner')).queryByRole('link', { name: /Crédits/ })).toBeNull();
    // La barre latérale arme le solde par la présence de l'entrée — absente pour l'agent.
    for (const [options] of soldeMock.mock.calls) expect(options.enabled).toBe(false);
  });

  it('solde inconnu (refus, panne, chargement) : aucune pastille, aucun « 0 » (AC5)', () => {
    soldeMock.mockReturnValue(null);
    monter(['agency_admin']);
    const barre = screen.getByRole('banner');
    expect(barre.querySelector('[data-slot="pastille-credits"]')).toBeNull();
    expect(within(barre).queryByText('0')).toBeNull();
  });

  it('dans le tiroir : l’entrée « Crédits » porte le solde et mène à /app/credits (AC3)', async () => {
    soldeMock.mockReturnValue(12);
    monter(['agency_admin']);
    const tiroir = await ouvrirLeTiroir();
    const entree = within(tiroir).getByRole('link', { name: 'Crédits : 12 crédits' });
    expect(entree).toHaveAttribute('href', '/app/credits');
    expect(entree).toHaveTextContent('12');
  });
});

describe('TCK-1035 (P68.08) — le bouton du menu dit si le tiroir est ouvert', () => {
  it('aria-expanded suit l’ouverture du tiroir', async () => {
    monter(['agency_admin']);
    const bouton = screen.getByRole('button', { name: 'Ouvrir le menu' });
    expect(bouton).toHaveAttribute('aria-expanded', 'false');

    await ouvrirLeTiroir();
    // Le tiroir modal rend la barre `inert` : on relit le même nœud, pas un `getByRole`.
    expect(bouton).toHaveAttribute('aria-expanded', 'true');
  });
});
