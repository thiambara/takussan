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
import type { User, UserRole } from '@/types/user';
import { AppShell } from '../AppShell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/app',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

// Les compteurs et le solde sondent le réseau : ce fichier éprouve leur RENDU.
vi.mock('@/components/chat-widget/useUnreadCount', () => ({ useUnreadCount: () => 0 }));
vi.mock('@/lib/queries/visits', () => ({ usePendingVisitsCount: () => ({}) }));
vi.mock('@/lib/queries/contact-leads', () => ({ useUnhandledLeadsCount: () => ({}) }));
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

function monter(roles: UserRole[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <AppShell user={utilisateur(roles)} agencyIsStandard>
            <p>contenu</p>
          </AppShell>
        </ToastProvider>
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
  soldeMock.mockReset();
  soldeMock.mockReturnValue(null);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TCK-646 — le menu mobile de /app présente le même ordre (AC4)', () => {
  it.each([['agency_admin'], ['owner'], ['customer']] as UserRole[][])('%s', async (role) => {
    const { container } = monter([role]);
    const bureau = hrefs(container.querySelector('aside')!);
    const tiroir = await ouvrirLeTiroir();
    expect(hrefs(tiroir)).toEqual(bureau);
    expect(hrefs(tiroir)[0]).toBe('/app');
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
