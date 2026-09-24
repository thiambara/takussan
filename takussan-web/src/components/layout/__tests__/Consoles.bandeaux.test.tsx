/**
 * TCK-572 — les deux consoles (`/admin`, `/super-admin`) montent les bandeaux du site DANS leur zone
 * qui défile, comme `AppShell`.
 *
 * Mesuré le 2026-09-24 (Chrome headless, réponses de l'API substituées) : sur /admin, le bandeau
 * rendu par le layout racine précédait la coque `h-dvh` — à 320 px, bandeau 0..76, barre 76..132,
 * document 716 px pour un écran de 640. jsdom ne fait pas de mise en page : on garde la cause,
 * l'endroit du DOM où le bandeau est monté.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import type { User } from '@/types/user';
import { AdminShell } from '../AdminShell';
import { SuperAdminShell } from '../SuperAdminShell';

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

function utilisateur(roles: string[]): User {
  return {
    id: 1,
    first_name: 'Awa',
    last_name: 'Diop',
    email: 'awa@example.test',
    roles,
  } as unknown as User;
}

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

const COQUES = [
  ['AdminShell', (enfants: React.ReactNode) => <AdminShell user={utilisateur(['agency_admin'])}>{enfants}</AdminShell>],
  ['SuperAdminShell', (enfants: React.ReactNode) => <SuperAdminShell user={utilisateur(['super_admin'])}>{enfants}</SuperAdminShell>],
] as const;

describe('Consoles — emplacement des bandeaux du site (TCK-572)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => MAINTENANCE }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(COQUES)('%s : le bandeau est dans le <main> qui défile, avant le contenu', async (_nom, coque) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      withIntl(
        <QueryClientProvider client={queryClient}>
          <ToastProvider>{coque(<p>contenu</p>)}</ToastProvider>
        </QueryClientProvider>,
      ),
    );
    await screen.findByText(/Maintenance ce soir/);

    const bandeau = container.querySelector('[data-bandeau="maintenance"]');
    const main = container.querySelector('main');
    expect(bandeau).not.toBeNull();
    expect(main).toContainElement(bandeau as HTMLElement);
    expect(bandeau!.compareDocumentPosition(screen.getByText('contenu')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Un seul emplacement affiché : celui de la page.
    expect(container.querySelectorAll('[data-bandeau="maintenance"]')).toHaveLength(1);
  });
});
