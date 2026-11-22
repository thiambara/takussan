/**
 * TCK-2619 — la feuille du compte (téléphone) ; mocks d'en-tête repris d'`AppShell.menu-et-credits.test.tsx`.
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

const pousser = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  usePathname: () => '/app',
  useRouter: () => ({ push: pousser, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
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


/**
 * TCK-2619 — au téléphone, le pied du compte (tiroir) et l'espace de l'en-tête d'accueil ouvrent une
 * FEUILLE DU BAS, et non un menu déroulant posé dans le tiroir. Dès `md`, le menu reste (relu ici en
 * témoin). `matchMedia` est piloté : jsdom n'en a pas (polyfill `matches: false` de `vitest.setup.ts`).
 */
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

const telephone = { valeur: false };
const matchMediaDOrigine = window.matchMedia;
beforeEach(() => {
  nonLusMock.mockReset();
  nonLusMock.mockReturnValue(0);
  demarrageMock.mockReset();
  demarrageMock.mockReturnValue({});
  soldeMock.mockReset();
  soldeMock.mockReturnValue(null);
  pousser.mockReset();
  telephone.valeur = true;
  window.matchMedia = (query: string) =>
    ({
      matches: query === '(width < 48rem)' ? telephone.valeur : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
});
afterEach(() => {
  window.matchMedia = matchMediaDOrigine;
  vi.unstubAllGlobals();
});

async function ouvrirLaFeuilleDepuisLeTiroir() {
  const user = userEvent.setup();
  await user.click(within(screen.getByRole('navigation', { name: 'Accès rapide' })).getByRole('button', { name: 'Menu' }));
  const tiroir = await screen.findByRole('dialog');
  await user.click(tiroir.querySelector<HTMLElement>('[data-slot="pied-du-compte"]')!);
  return { user, feuille: await screen.findByRole('dialog', { name: 'Mon compte' }) };
}

describe('TCK-2619 — le menu du compte en feuille du bas, au téléphone', () => {
  it('le pied du tiroir ouvre « Mon compte » : un dialogue, pas un menu, avec tout le contenu du menu', async () => {
    soldeMock.mockReturnValue(1250);
    monter(['agency_admin']);
    const { feuille } = await ouvrirLaFeuilleDepuisLeTiroir();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(feuille).toHaveAttribute('data-slot', 'feuille-du-bas');
    const contenu = within(feuille);
    expect(contenu.getByText('Awa Diop')).toBeInTheDocument();
    expect(contenu.getByText('awa@example.test')).toBeInTheDocument();
    expect(feuille.querySelector('[data-slot="solde-du-compte"]')?.textContent?.replace(/\s/g, ' ')).toBe('Crédits1 250');
    // TCK-2742 (AC3) — la ligne « Crédits » du compte garde `Coins` (app-coque a-5), quand l'entrée du menu
    // prend `CreditCard`.
    expect(feuille.querySelector('[data-slot="solde-du-compte"] svg.lucide-coins')).not.toBeNull();
    for (const nom of ['Mon profil', 'Préférences de notification', 'Voir le site public', 'Déconnexion']) {
      expect(contenu.getByRole('button', { name: nom })).toHaveClass('h-12');
    }
    // La langue : trois boutons à bascule, la langue active enfoncée.
    const langues = within(contenu.getByRole('group', { name: 'Langue' })).getAllByRole('button');
    expect(langues.map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['FR', 'true'],
      ['EN', 'false'],
      ['WO', 'false'],
    ]);
  });

  it('« Voir le site public » mène à l’accueil public et referme feuille et tiroir', async () => {
    monter(['agent']);
    const { user, feuille } = await ouvrirLaFeuilleDepuisLeTiroir();
    await user.click(within(feuille).getByRole('button', { name: 'Voir le site public' }));
    expect(pousser).toHaveBeenCalledWith('/fr');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // Réserve de la vérification (F6) — la ligne d'administration n'était éprouvée nulle part.
  it('l’admin d’agence a sa ligne « Administration » : elle mène à la première page ouverte et referme tout', async () => {
    const roles: UserRole[] = ['agency_admin'];
    const acces = accesDepuis({ roles, agence: { kind: 'standard' }, capacites: ['agency.update'] });
    expect(acces.chemins.length).toBeGreaterThan(0);
    monter(roles, acces);
    const { user, feuille } = await ouvrirLaFeuilleDepuisLeTiroir();
    const ligne = within(feuille).getByRole('button', { name: 'Administration' });
    expect(ligne).toHaveClass('h-12');
    await user.click(ligne);
    expect(pousser).toHaveBeenCalledWith(acces.chemins[0]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sans page d’administration ouverte, la ligne n’est pas rendue', async () => {
    monter(['agent'], { chemins: [], espaceIndividuel: false });
    const { feuille } = await ouvrirLaFeuilleDepuisLeTiroir();
    expect(within(feuille).getByRole('button', { name: 'Mon profil' })).toBeInTheDocument();
    expect(within(feuille).queryByRole('button', { name: 'Administration' })).toBeNull();
    expect(within(feuille).queryByRole('button', { name: 'Mon espace' })).toBeNull();
  });

  it('témoin — dès `md`, le pied de la colonne ouvre toujours le menu déroulant', async () => {
    telephone.valeur = false;
    monter(['agent']);
    await userEvent.setup().click(document.querySelector<HTMLElement>('aside [data-slot="pied-du-compte"]')!);
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Voir le site public' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Mon compte' })).toBeNull();
  });
});
