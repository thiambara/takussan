/**
 * TCK-2836 — une sélection en cours, déclarée par l'écran, prend la place de la barre d'onglets au
 * téléphone : un mécanisme de COQUE (`BarreDeSelectionDeLaCoque`, déclaration `selection`), pas d'écran.
 *
 * jsdom ne lit ni les media queries ni la géométrie : ce qui est éprouvé ici, c'est la STRUCTURE — la
 * barre d'onglets retirée, la barre de l'écran DANS l'emplacement de la coque (en flux : le `<main>`
 * rétrécit, rien ne passe dessous) devenu le bas de l'écran (zone sûre), et la barre d'onglets rendue
 * dès que l'écran qui l'a déclarée est démonté (AC4, AC5). Le placement est relevé au navigateur à
 * 390 et 1280 (notes du ticket).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import type { User } from '@/types/user';
import { AppShell } from '../AppShell';
import { BarreDeSelectionDeLaCoque } from '../BarreDeSelectionDeLaCoque';

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/properties',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/hooks/useCan', () => ({
  useMyCapabilities: () => ({ data: { data: { agency_id: 1, capabilities: ['properties.create'] } } }),
}));
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({ data: undefined, isLoading: false }),
  useSwitchActiveProfile: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/app/actions/notifications', () => ({
  getNotificationsAction: () => Promise.resolve({ ok: true, data: { data: [], meta: { total: 0, unread: 0, current_page: 1 } } }),
  markNotificationReadAction: vi.fn(),
  markNotificationUnreadAction: vi.fn(),
  markAllNotificationsReadAction: vi.fn(),
}));
vi.mock('@/components/chat-widget/useUnreadCount', () => ({ useUnreadCount: () => 0 }));
vi.mock('@/lib/queries/visits', () => ({ usePendingVisitsCount: () => ({}) }));
vi.mock('@/lib/queries/contact-leads', () => ({ useUnhandledLeadsCount: () => ({}) }));
vi.mock('@/lib/queries/demarrage-espace', () => ({ useDemarrageDeLEspace: () => ({}) }));
vi.mock('@/lib/queries/credits-solde', () => ({ useSoldeCredits: () => null }));
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

const USER = { id: 1, first_name: 'Awa', last_name: 'Diop', full_name: 'Awa Diop', email: 'awa@example.test', roles: ['customer', 'agent', 'agency_admin'] } as unknown as User;

function coque(contenu: React.ReactNode) {
  return withIntl(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <AppShell user={USER} agencyIsStandard>
          {contenu}
        </AppShell>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const barreDOnglets = (c: HTMLElement) => c.querySelector('[data-slot="barre-onglets"]');
const racine = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-portee-app]')!;
const emplacement = (c: HTMLElement) => c.querySelector<HTMLElement>('#emplacement-barre-d-action')!;

function Selection() {
  return (
    <BarreDeSelectionDeLaCoque aria-label="Actions groupées">
      <span>2 biens sélectionnés</span>
      <button type="button">Archiver</button>
    </BarreDeSelectionDeLaCoque>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
});
afterEach(() => vi.unstubAllGlobals());

describe('TCK-2836 — une sélection déclarée prend la place de la barre d’onglets', () => {
  it('sans sélection, la barre d’onglets est là', () => {
    const { container } = render(coque(<p>liste</p>));
    expect(barreDOnglets(container)).not.toBeNull();
    expect(racine(container)).toHaveAttribute('data-barre-onglets');
  });

  it('AC1/AC5 — pendant une sélection : plus de barre d’onglets, la barre de l’écran occupe le bas (emplacement en flux, zone sûre)', () => {
    const { container } = render(coque(<><p>liste</p><Selection /></>));
    expect(barreDOnglets(container)).toBeNull();
    expect(racine(container)).not.toHaveAttribute('data-barre-onglets');
    // Le bas de l'écran : l'emplacement ajoute la zone sûre (`env(safe-area-inset-bottom)`).
    expect(emplacement(container)).toHaveAttribute('data-bas-de-l-ecran');
    const barre = screen.getByRole('region', { name: 'Actions groupées' });
    // EN FLUX, dans l'emplacement de la coque, après le `<main>` : il rétrécit, rien ne passe dessous (AC2).
    expect(emplacement(container).contains(barre)).toBe(true);
    expect(container.querySelector('main')!.contains(barre)).toBe(false);
    expect(barre.className).not.toMatch(/\bfixed\b/);
    expect(barre.className).toContain('env(safe-area-inset-bottom)');
    expect(barre.className.split(/\s+/)).toContain('md:hidden');
    expect(within(barre).getByRole('button', { name: 'Archiver' })).toBeInTheDocument();
  });

  it('AC4/AC5 — l’écran qui a déclaré la sélection démonté (navigation, sélection vidée), la barre d’onglets revient', () => {
    const { container, rerender } = render(coque(<><p>liste</p><Selection /></>));
    expect(barreDOnglets(container)).toBeNull();
    rerender(coque(<p>page suivante</p>));
    expect(barreDOnglets(container)).not.toBeNull();
    expect(racine(container)).toHaveAttribute('data-barre-onglets');
    expect(emplacement(container)).not.toHaveAttribute('data-bas-de-l-ecran');
    expect(screen.queryByRole('region', { name: 'Actions groupées' })).toBeNull();
  });

  it('hors de la coque (aucun emplacement, aucun fournisseur), la barre se rend en flux là où elle est écrite, sans lever', () => {
    render(withIntl(<Selection />));
    expect(screen.getByRole('region', { name: 'Actions groupées' })).toBeInTheDocument();
  });
});
