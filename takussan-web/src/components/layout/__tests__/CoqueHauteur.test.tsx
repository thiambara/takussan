/**
 * TCK-503 — la hauteur des trois coques de tableau de bord, gardée sur l'UNITÉ.
 *
 * ⚠ Ce que jsdom ne peut PAS éprouver, et pourquoi le test a cette forme : `100vh` et `100dvh`
 * valent la même chose partout sauf sur un navigateur mobile à barre d'adresse rétractable —
 * jsdom n'en a pas, Chrome de bureau non plus (mesuré : `Emulation.setDeviceMetricsOverride` rend
 * `vh == svh == lvh == dvh`, cf. le relevé du ticket). Aucune assertion de géométrie ne peut donc
 * distinguer la coque juste de la fausse. **C'est l'unité écrite qui est le fait gardé**, comme
 * pour la messagerie un cran plus bas (TCK-501, `MessagesPage.test.tsx`).
 *
 * Le défaut gardé, mesuré au navigateur le 2026-08-31 : le document de `/app/*` ne défile
 * NULLE PART (`scrollHeight - clientHeight === 0` sur 6 pages), donc la barre d'adresse ne se
 * rétracte jamais, donc `100vh` reste la hauteur SANS barre pendant toute la vie de la page. La
 * bande du bas — exactement la hauteur de la barre — est hors de portée : sur `/app/properties`,
 * la pagination est à 24 px du bord bas de la coque.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import type { User } from '@/types/user';
import { AppShell } from '../AppShell';
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

const user = {
  id: 1,
  first_name: 'Awa',
  last_name: 'Diop',
  email: 'awa@example.test',
  roles: ['agent'],
} as unknown as User;

function monter(noeud: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { container } = render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{noeud}</ToastProvider>
      </QueryClientProvider>,
    ),
  );
  const coque = container.querySelector('div');
  if (!coque) throw new Error('aucune coque rendue');
  // Pin : la coque est bien la boîte qui porte le `<main>`, pas un enrobage quelconque.
  expect(coque.querySelector('main')).not.toBeNull();
  return coque;
}

const COQUES: ReadonlyArray<readonly [string, React.ReactNode]> = [
  [
    'AppShell',
    <AppShell key='app' user={user}>
      <p>contenu</p>
    </AppShell>,
  ],
  [
    'AdminShell',
    <AdminShell key='admin' user={user}>
      <p>contenu</p>
    </AdminShell>,
  ],
  [
    'SuperAdminShell',
    <SuperAdminShell key='super' user={user}>
      <p>contenu</p>
    </SuperAdminShell>,
  ],
];

describe('TCK-503 — hauteur des coques de tableau de bord', () => {
  /**
   * AC4 — l'ablation. Rétablir `h-screen` (c'est-à-dire `100vh`) sur l'une des trois coques doit
   * rougir ici, et le `not.toContain('h-screen')` est ce qui l'assure : une assertion qui se
   * contenterait d'exiger `h-dvh` resterait verte sur `h-screen h-dvh`, où c'est la dernière
   * déclarée qui gagne.
   */
  it.each(COQUES)(
    '%s occupe le viewport dynamique, jamais `100vh`',
    (_nom, noeud) => {
      const coque = monter(noeud);

      expect(coque).toHaveClass('h-dvh');
      expect(coque.className).not.toContain('h-screen');
      expect(coque.className).not.toContain('100vh');
    },
  );

  /**
   * AC3 — au-dessus de `md`, rien ne bouge : la barre latérale reste pleine hauteur et c'est le
   * `main` seul qui défile. Les deux classes qui le portent sont solidaires de la hauteur de la
   * coque — `md:h-full` ne résout que contre un parent à hauteur DÉFINIE, ce que `h-dvh` reste
   * exactement comme `h-screen` l'était.
   */
  it.each(COQUES)(
    '%s garde la barre latérale pleine hauteur et le `main` seul défilant',
    (_nom, noeud) => {
      const coque = monter(noeud);

      expect(coque.querySelector('.md\\:h-full')).not.toBeNull();
      const main = coque.querySelector('main');
      expect(main).toHaveClass('overflow-y-auto');
      expect(main).toHaveClass('min-h-0');
      expect(main).toHaveClass('flex-1');
    },
  );
});
