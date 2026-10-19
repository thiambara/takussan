/**
 * TCK-905 (P31.04) — l'espace applicatif a son lien d'évitement, devant la barre haute et la
 * barre latérale, comme la console super-admin (TCK-359). Avant ce ticket, `AppShell` rendait un
 * `<main>` sans `id` ni `tabIndex`, et aucun lien n'y menait.
 *
 * jsdom ne fait aucune navigation par fragment : c'est le `onClick` du lien qui déplace le focus,
 * et c'est lui que ce test exécute.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
vi.mock('@/components/chat-widget/useUnreadCount', () => ({ useUnreadCount: () => 0 }));
vi.mock('@/lib/queries/visits', () => ({ usePendingVisitsCount: () => ({}) }));
vi.mock('@/lib/queries/reviews-moderation', () => ({
  fetchModerationQueue: vi.fn(async () => ({ meta: { pending_count: 0 } })),
}));
vi.mock('@/lib/queries/property-moderation', () => ({
  fetchPropertyModerationQueue: vi.fn(async () => ({ meta: { pending_count: 0 } })),
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

const user = {
  id: 1,
  first_name: 'Awa',
  last_name: 'Diop',
  email: 'awa@example.test',
  roles: ['agent'],
} as unknown as User;

function rendre() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
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
}

describe('AppShell — lien d’évitement (TCK-905, P31.04)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: null }) }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('précède la barre haute et vise un <main> focalisable par programme', () => {
    const { container } = rendre();

    const lien = screen.getByRole('link', { name: 'Aller au contenu principal' });
    const main = container.querySelector('main');
    expect(container.querySelector('a[href], button')).toBe(lien);
    expect(main).not.toBeNull();
    expect(lien).toHaveAttribute('href', `#${main!.id}`);
    expect(main!.id).not.toBe('');
    expect(main).toHaveAttribute('tabindex', '-1');
  });

  it('déplace le focus dans <main> quand on l’active', async () => {
    const utilisateur = userEvent.setup();
    const { container } = rendre();

    await utilisateur.click(screen.getByRole('link', { name: 'Aller au contenu principal' }));

    expect(document.activeElement).toBe(container.querySelector('main'));
  });
});
