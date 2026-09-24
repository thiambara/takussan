/**
 * TCK-572 — dans la console, les bandeaux du site vivent DANS la zone qui défile.
 *
 * Mesuré le 2026-09-24 (Chrome headless, réponses de l'API substituées) : rendus par le layout
 * racine AVANT cette coque `h-dvh`, maintenance (76 px) et annonce (107 px) faisaient déborder le
 * document de 183 px à 320 ; défilé, la maintenance collante recouvrait la barre haute. jsdom ne
 * fait pas de mise en page : on garde la cause, c'est-à-dire l'endroit du DOM où le bandeau est
 * monté.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import type { User } from '@/types/user';
import { AppShell } from '../AppShell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/app',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => ({ get: () => null, toString: () => '' }),
}));

// Les compteurs des barres latérales sondent le réseau ; ce fichier éprouve une classe CSS.
vi.mock('@/components/chat-widget/useUnreadCount', () => ({
  useUnreadCount: () => 0,
}));
vi.mock('@/lib/queries/visits', () => ({ usePendingVisitsCount: () => ({}) }));
vi.mock('@/lib/queries/reviews-moderation', () => ({
  fetchModerationQueue: vi.fn(async () => ({ meta: { pending_count: 0 } })),
}));
vi.mock('@/lib/queries/property-moderation', () => ({
  fetchPropertyModerationQueue: vi.fn(async () => ({
    meta: { pending_count: 0 },
  })),
}));
vi.mock('@/hooks/useImpersonation', () => ({
  useImpersonationSession: () => null,
  useStopImpersonation: () => ({ mutate: vi.fn(), isPending: false }),
}));

// Les modales de bienvenue d'`AppShell` montent chacune leur propre requête : hors sujet ici.
vi.mock('@/components/agency/AgencyStandardWelcomeWizard', () => ({
  AgencyStandardWelcomeWizard: () => null,
}));
vi.mock('@/components/agent/AgentWelcomeWizard', () => ({
  AgentWelcomeWizard: () => null,
}));
vi.mock('@/components/customer/CustomerWelcomeWizard', () => ({
  CustomerWelcomeWizard: () => null,
}));
vi.mock('@/components/customer/MinimalProfileTriggerProvider', () => ({
  MinimalProfileTriggerProvider: ({
    children,
  }: {
    children: React.ReactNode;
  }) => children,
}));
vi.mock('@/components/owner/OwnerWelcomeWizard', () => ({
  OwnerWelcomeWizard: () => null,
}));
vi.mock('@/components/tenant/TenantWelcomeWizard', () => ({
  TenantWelcomeWizard: () => null,
}));

const user = {
  id: 1,
  first_name: 'Awa',
  last_name: 'Diop',
  email: 'awa@example.test',
  roles: ['agent'],
} as unknown as User;

const MAINTENANCE = {
  data: {
    active: false,
    show_banner: true,
    generated_at: '2026-09-24T10:00:00.000Z',
    window: {
      id: 9,
      starts_at: '2026-09-24T22:00:00.000Z',
      ends_at: '2026-09-24T23:00:00.000Z',
      mode: 'banner',
      severity: 'scheduled',
      messages: { fr: 'Maintenance ce soir' },
      banner_lead_minutes: 1440,
    },
  },
};

describe('AppShell — emplacement des bandeaux du site (TCK-572)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => MAINTENANCE }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('le bandeau est dans le <main> qui défile, après la barre haute, et n’allonge pas la coque', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      withIntl(
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <AppShell user={user}>
              <p>contenu</p>
            </AppShell>
          </ToastProvider>
        </QueryClientProvider>,
      ),
    );
    await screen.findByText(/Maintenance ce soir/);

    const bandeau = container.querySelector('[data-bandeau="maintenance"]');
    const main = container.querySelector('main');
    expect(bandeau).not.toBeNull();
    expect(main).toContainElement(bandeau as HTMLElement);
    // Avant le contenu de la page, dans la même zone de défilement.
    expect(bandeau!.compareDocumentPosition(screen.getByText('contenu')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
