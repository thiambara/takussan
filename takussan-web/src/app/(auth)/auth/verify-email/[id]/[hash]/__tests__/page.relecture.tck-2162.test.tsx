/**
 * TCK-2162 (P202.07) — la page de succès de la vérification d'e-mail relit le compte.
 *
 * Le layout racine et la page se rendent en parallèle : `/api/auth/me` peut être lu avant que la
 * page n'ait vérifié l'adresse, et le contexte gardait alors `email_verified_at: null`.
 *
 * Décision du porteur (2026-10-24) : sur la page de succès de la vérification d'e-mail, un
 * composant client appelle `refreshUser()` au montage quand un jeton est présent, comme TCK-2042.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { User } from '@/lib/auth';

const { getTokenMock, apiRequestMock } = vi.hoisted(() => ({
  getTokenMock: vi.fn(),
  apiRequestMock: vi.fn(),
}));

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/lib/session', () => ({ getToken: () => getTokenMock() }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));
vi.mock('@/lib/queries/favorites', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/favorites')>()),
  fetchAllFavoritePropertyIds: vi.fn().mockResolvedValue([]),
}));

const { AuthProvider, useAuth } = await import('@/context/AuthContext');
const { default: VerifyEmailHashPage } = await import('../page');

const NON_VERIFIE = { id: 7, first_name: 'Awa', email_verified_at: null } as unknown as User;
const VERIFIE = { ...NON_VERIFIE, email_verified_at: '2026-10-24T10:00:00Z' } as unknown as User;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  getTokenMock.mockReset();
  apiRequestMock.mockReset();
  fetchMock = vi.fn(async (entree: RequestInfo | URL) => {
    if (String(entree) === '/api/auth/me') {
      return { ok: true, status: 200, json: async () => VERIFIE };
    }
    return { ok: true, status: 200, json: async () => ({ data: [] }) };
  });
  vi.stubGlobal('fetch', fetchMock);
});

function Lecteur() {
  const { user } = useAuth();
  return <p data-testid="verifie">{user?.email_verified_at ?? 'non vérifiée'}</p>;
}

async function monter(token: string | undefined) {
  getTokenMock.mockResolvedValue(token);
  const page = await VerifyEmailHashPage({
    params: Promise.resolve({ id: '7', hash: 'abc' }),
    searchParams: Promise.resolve({ expires: '1', signature: 'sig' }),
  });
  return render(
    withIntl(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider initialUser={token ? NON_VERIFIE : null} initialToken={token ?? null}>
          {page}
          <Lecteur />
        </AuthProvider>
      </QueryClientProvider>,
    ),
  );
}

const lecturesDeMe = () => fetchMock.mock.calls.filter(([entree]) => String(entree) === '/api/auth/me');

describe('vérification d’e-mail par le lien : relecture du compte (TCK-2162, P202.07)', () => {
  it('connecté, la page de succès relit le compte et le contexte dit l’adresse vérifiée', async () => {
    apiRequestMock.mockResolvedValue({ message: 'ok' });
    await monter('jeton');

    await waitFor(() => expect(screen.getByTestId('verifie')).toHaveTextContent('2026-10-24T10:00:00Z'));
    expect(lecturesDeMe()).toHaveLength(1);
  });

  it('sans jeton, la page de succès ne relit rien', async () => {
    apiRequestMock.mockResolvedValue({ message: 'ok' });
    await monter(undefined);

    expect(screen.getByRole('link')).toHaveAttribute('href', '/auth/login');
    expect(lecturesDeMe()).toHaveLength(0);
  });

  it('un lien refusé ne relit rien', async () => {
    apiRequestMock.mockRejectedValue(new Error('signature invalide'));
    await monter('jeton');

    expect(screen.getByRole('link')).toHaveAttribute('href', '/auth/verify-email');
    expect(lecturesDeMe()).toHaveLength(0);
    expect(screen.getByTestId('verifie')).toHaveTextContent('non vérifiée');
  });
});
