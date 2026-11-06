/**
 * TCK-2481 (ADR-0089 §3) — la coque `/app` montée en entier, avec sa barre d'onglets mobile.
 *
 * Ce qu'elle garde : plus de burger dans la barre haute, « Menu » ouvre le tiroir et en récupère le
 * focus — au clavier ET au doigt (AC3, arbitrage 10) ; pas de barre en plein écran (AC4) ; la barre
 * suit le `<main>` dans le document, le lien d'évitement restant le premier focalisable (arbitrage 9).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import type { User, UserRole } from '@/types/user';
import { AppShell } from '../AppShell';

const nav = vi.hoisted(() => ({ chemin: '/app' }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.chemin,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

// En-tête recopié d'`AppShell.menu-et-credits.test.tsx` : les compteurs, le solde, l'impersonation
// et les assistants sondent le réseau ; ce fichier éprouve la coque.
vi.mock('@/hooks/useCan', () => ({
  useMyCapabilities: () => ({ data: { data: { agency_id: 1, capabilities: ['properties.create'] } } }),
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

function monter(roles: UserRole[], chemin = '/app') {
  nav.chemin = chemin;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = {
    id: 1,
    first_name: 'Awa',
    last_name: 'Diop',
    full_name: 'Awa Diop',
    email: 'awa@example.test',
    roles,
  } as unknown as User;
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <AppShell user={user} agencyIsStandard>
            <p>contenu</p>
          </AppShell>
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

const boutonMenu = () =>
  within(screen.getByRole('navigation', { name: 'Accès rapide' })).getByRole('button', { name: 'Menu' });

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TCK-2481 — AC3 : aucun burger ; « Menu » ouvre le tiroir et rend le focus', () => {
  it('la barre haute ne porte plus « Ouvrir le menu »', () => {
    monter(['customer', 'agent']);
    expect(screen.queryByRole('button', { name: 'Ouvrir le menu' })).toBeNull();
    expect(within(screen.getByRole('banner')).queryByRole('button', { name: 'Menu' })).toBeNull();
  });

  it('au clavier : Entrée ouvre, `aria-expanded` suit, Échap rend le focus à « Menu »', async () => {
    const user = userEvent.setup();
    monter(['customer', 'agent']);
    const menu = boutonMenu();
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(menu).toHaveAttribute('aria-haspopup', 'dialog');
    menu.focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('dialog');
    // Le tiroir modal rend la barre `inert` : on relit le même nœud, pas un `getByRole`.
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(menu).toHaveFocus());
  });

  it('au doigt : l’appui ne focalise pas le bouton (Safari iOS), le tiroir lui rend quand même le focus', async () => {
    monter(['customer', 'agent']);
    const menu = boutonMenu();
    fireEvent.click(menu); // ne déplace PAS le focus, comme un appui sur iOS
    expect(menu).not.toHaveFocus();
    await screen.findByRole('dialog');
    await userEvent.setup().keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(menu).toHaveFocus());
  });

  it('un lien du tiroir le referme', async () => {
    monter(['customer', 'agent']);
    fireEvent.click(boutonMenu());
    const tiroir = await screen.findByRole('dialog');
    fireEvent.click(within(tiroir).getAllByRole('link', { name: /Demandes/ })[0]!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  /**
   * Revue adverse, M1 — « Menu » est le DERNIER focalisable du document : y rendre le focus après une
   * navigation laisse toute la nouvelle page AVANT lui, et Tab sort du document. Fermé par un lien,
   * le tiroir ne force rien ; Échap et le voile gardent « Menu » (arbitrage 10).
   */
  it('au clavier, un lien du tiroir le referme SANS rendre le focus à « Menu »', async () => {
    const user = userEvent.setup();
    monter(['customer', 'agent']);
    const menu = boutonMenu();
    menu.focus();
    await user.keyboard('{Enter}');
    const tiroir = await screen.findByRole('dialog');
    within(tiroir).getAllByRole('link', { name: /Demandes/ })[0]!.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Le rendu du focus est asynchrone (Base UI) : on lui laisse le temps d'avoir lieu à tort.
    await new Promise((r) => setTimeout(r, 50));
    expect(menu).not.toHaveFocus();
  });

  it('après une navigation, Échap rend de nouveau le focus à « Menu »', async () => {
    const user = userEvent.setup();
    monter(['customer', 'agent']);
    const menu = boutonMenu();
    menu.focus();
    await user.keyboard('{Enter}');
    const tiroir = await screen.findByRole('dialog');
    within(tiroir).getAllByRole('link', { name: /Demandes/ })[0]!.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    menu.focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(menu).toHaveFocus());
  });
});

describe('TCK-2481 — AC4 : pas de barre en plein écran', () => {
  it('/app/properties/new : ni barre, ni marque de la coque', () => {
    const { container } = monter(['customer', 'agent'], '/app/properties/new');
    expect(screen.queryByRole('navigation', { name: 'Accès rapide' })).toBeNull();
    expect(container.querySelector('[data-barre-onglets]')).toBeNull();
  });

  it('/app : la barre, et la coque qui la porte le dit (`data-barre-onglets`)', () => {
    const { container } = monter(['customer', 'agent']);
    expect(screen.getByRole('navigation', { name: 'Accès rapide' })).toBeInTheDocument();
    expect(container.querySelector('[data-barre-onglets]')).not.toBeNull();
  });
});

describe('TCK-2481 — ordre du document (arbitrage 9)', () => {
  it('la barre suit le <main> ; le lien d’évitement reste le premier focalisable', () => {
    const { container } = monter(['customer', 'agent']);
    const main = container.querySelector('main')!;
    const barre = screen.getByRole('navigation', { name: 'Accès rapide' });
    expect(main.compareDocumentPosition(barre) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(main.contains(barre)).toBe(false);
    expect(container.querySelector('a[href], button')).toHaveAttribute('href', '#contenu-principal');
  });
});
