/**
 * TCK-2765 (AC1, AC4) — quand le layout racine a dépassé sa borne sur `/api/auth/me`
 * (`initialUser = null` sous un jeton), la coque de `/app`, qui a lu le compte, le pose dans
 * `AuthContext` : l'agent voit l'état vide du personnel, pas celui d'un visiteur.
 *
 * Le test rend le VRAI layout `(dashboard)` autour du vrai état vide de la messagerie, sous le vrai
 * `AuthProvider` né sans compte : retirer `<CompteDeLaCoque>` du layout rend ce test rouge (AC4).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { User } from '@/lib/auth';
import { withIntl } from '@/test/intl';

const agent = {
  id: 7,
  first_name: 'Moussa',
  roles: ['agent'],
  two_factor_enabled: false,
} as unknown as User;

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/app/messages',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/i18n/messages', async () => ({
  messagesPour: async () => (await import('@/messages/fr.json')).default,
}));
vi.mock('@/app/actions/auth', () => ({ getMeAction: vi.fn(async () => agent) }));
vi.mock('@/app/actions/account-deletion', () => ({
  getAccountDeletionRequestAction: vi.fn(async () => ({ ok: true, data: null })),
}));

const { default: DashboardGroupLayout } = await import('../layout');
const { AuthProvider } = await import('@/context/AuthContext');
const { EtatVideDeLaMessagerie } = await import('@/components/messages/EtatVideDeLaMessagerie');

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () =>
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('la coque de /app pose le compte qu’elle a lu (TCK-2765)', () => {
  it('AC1 — layout racine à `null` sous un jeton, coque à l’agent : l’état vide du personnel', async () => {
    const coque = await DashboardGroupLayout({ children: <EtatVideDeLaMessagerie onNouvelle={() => {}} /> });
    render(
      withIntl(
        <QueryClientProvider client={new QueryClient()}>
          <AuthProvider initialUser={null} initialToken="jeton">
            {coque}
          </AuthProvider>
        </QueryClientProvider>,
      ),
    );

    expect(await screen.findByRole('button', { name: 'Écrire à un client' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Aucune conversation' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Parcourir les annonces' })).not.toBeInTheDocument();
  });
});
