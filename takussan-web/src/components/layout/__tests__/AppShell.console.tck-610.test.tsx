import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import type { User } from '@/types/user';
import { AppShell } from '../AppShell';

const navigation = vi.hoisted(() => ({ chemin: '/app' }));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.chemin,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => ({ get: () => null, toString: () => '' }),
}));

// Les compteurs des barres latérales sondent le réseau ; ce fichier éprouve l'entrée de la console.
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
const impersonation = vi.hoisted(() => ({ session: null as null | Record<string, unknown> }));
vi.mock('@/hooks/useImpersonation', () => ({
  useImpersonationCourante: () => ({ data: impersonation.session }),
  useQuitterImpersonation: () => ({ mutate: vi.fn(), isPending: false }),
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
  roles: ['customer'],
} as unknown as User;


/**
 * TCK-610 (AC6) — l'entrée « Console plateforme » suit le geste `platform.console.access` que le layout
 * lit (`accesALaConsole`) et que la coque passe à SES DEUX barres : la colonne (dès `md`) et le tiroir
 * (sous `md`). Un montage oublié laissait le téléphone sans entrée.
 */
function rendre(accesConsole?: boolean) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AppShell user={user} accesConsole={accesConsole}>
            <p>contenu</p>
          </AppShell>
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

describe('AppShell — entrée de la console des opérateurs (TCK-610)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: null }) }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('un opérateur `viewer` : l’entrée dans la colonne ET dans le tiroir', async () => {
    rendre(true);
    expect(screen.getAllByRole('link', { name: /^Console plateforme/ })).toHaveLength(1);

    await userEvent.setup().click(screen.getAllByRole('button', { name: /^Menu/ })[0]);
    const tiroir = await screen.findByRole('dialog');
    expect(within(tiroir).getByRole('link', { name: /^Console plateforme/ })).toHaveAttribute('href', '/super-admin');
  });

  it('sans le geste : aucune entrée', () => {
    rendre();
    expect(screen.queryByRole('link', { name: /^Console plateforme/ })).toBeNull();
  });
});
