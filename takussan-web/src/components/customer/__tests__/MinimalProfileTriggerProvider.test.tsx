import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';

import { MinimalProfileTriggerProvider } from '../MinimalProfileTriggerProvider';
// TCK-1089 — la feuille passe par `next/dynamic` : son module est importé ici pour que sa première
// ouverture ne paie pas la transformation à froid sous vitest (piège de TCK-1041).
import '../CustomerMinimalProfileSheet';
import { useTriggerMinimalProfileOnce } from '@/hooks/useTriggerMinimalProfileOnce';
import * as AuthContext from '@/context/AuthContext';
import frMessages from '@/messages/fr.json';

type FetchMock = ReturnType<typeof vi.fn>;

function setupFetchSequence(
  responses: Array<{ status?: number; json?: () => Promise<unknown> }>,
): FetchMock {
  const mock = vi.fn();
  responses.forEach((r) => {
    mock.mockImplementationOnce(async () => ({
      ok: (r.status ?? 200) >= 200 && (r.status ?? 200) < 300,
      status: r.status ?? 200,
      json: r.json ?? (async () => ({})),
    }));
  });
  // Default for any extra calls — return an empty success.
  mock.mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
  }));
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

function mockAuth(authed: boolean) {
  const value = authed
    ? {
        user: { id: 1, first_name: 'Alice', last_name: 'X', email: 'a@b.c' },
        token: 'tk',
        isLoading: false,
        setUser: vi.fn(),
        refreshUser: vi.fn(),
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
      }
    : { user: null, token: null, isLoading: false };
  vi.spyOn(AuthContext, 'useAuth').mockReturnValue(
    value as unknown as ReturnType<typeof AuthContext.useAuth>,
  );
}

function Wrapper({ children, roles }: { children: ReactNode; roles: string[] }) {
  // TCK-1766 — les clés vues passent par une entrée de cache TanStack partagée (`useAccueilsVus`).
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="fr" messages={frMessages as never}>
        <MinimalProfileTriggerProvider roles={roles}>{children}</MinimalProfileTriggerProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

// Le pré-chargement `GET /api/me/welcome-seen` est APPELÉ avant que `seen` ne passe à `false`
// (il reste `res.json()` et le rendu) : tant que `seen` vaut `null`, un déclenchement est ignoré,
// exprès. Attendre le seul appel de `fetch` puis cliquer une fois est donc une course, perdue sous
// la charge de la CI (run 39787278156). On reclique jusqu'à l'ouverture : avant elle, un clic est
// sans effet, et après, `consumedRef` rend les suivants inertes.
async function declencherJusquALouverture() {
  await waitFor(() => {
    fireEvent.click(screen.getByTestId('fire'));
    expect(screen.getByTestId('customer-minimal-profile-title')).toBeInTheDocument();
  });
}

function TriggerButton() {
  const { triggerIfNeeded } = useTriggerMinimalProfileOnce();
  return (
    <button data-testid="fire" onClick={() => triggerIfNeeded()}>
      fire
    </button>
  );
}

describe('MinimalProfileTriggerProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the sheet on the first trigger when key not seen', async () => {
    mockAuth(true);
    setupFetchSequence([{ status: 200, json: async () => ({ data: [] }) }]);

    render(
      <Wrapper roles={['customer']}>
        <TriggerButton />
      </Wrapper>,
    );

    // Wait for the welcome-seen pre-fetch to land before firing.
    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as FetchMock).mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
    });

    await declencherJusquALouverture();
  });

  it('does NOT open the sheet on subsequent triggers (single-shot per session)', async () => {
    mockAuth(true);
    setupFetchSequence([{ status: 200, json: async () => ({ data: [] }) }]);

    render(
      <Wrapper roles={['customer']}>
        <TriggerButton />
      </Wrapper>,
    );

    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as FetchMock).mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
    });

    await declencherJusquALouverture();

    // Skip closes + marks seen.
    fireEvent.click(screen.getByTestId('customer-minimal-profile-skip'));
    await waitFor(() =>
      expect(screen.queryByTestId('customer-minimal-profile-title')).not.toBeInTheDocument(),
    );

    // 2nd trigger must be a no-op.
    fireEvent.click(screen.getByTestId('fire'));
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 10));
    });
    expect(screen.queryByTestId('customer-minimal-profile-title')).not.toBeInTheDocument();
  });

  it('does nothing for non-customer roles', async () => {
    mockAuth(true);
    const fetchMock = setupFetchSequence([
      { status: 200, json: async () => ({ data: [] }) },
    ]);

    render(
      <Wrapper roles={['agent']}>
        <TriggerButton />
      </Wrapper>,
    );

    fireEvent.click(screen.getByTestId('fire'));
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 10));
    });

    expect(screen.queryByTestId('customer-minimal-profile-title')).not.toBeInTheDocument();
    // Pre-fetch is gated too — non-customers never hit /api/me/welcome-seen.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not open if the welcome-seen prefetch already includes the key', async () => {
    mockAuth(true);
    setupFetchSequence([
      { status: 200, json: async () => ({ data: ['customer-profile-minimal'] }) },
    ]);

    render(
      <Wrapper roles={['customer']}>
        <TriggerButton />
      </Wrapper>,
    );

    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as FetchMock).mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
    });

    fireEvent.click(screen.getByTestId('fire'));
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 10));
    });

    expect(screen.queryByTestId('customer-minimal-profile-title')).not.toBeInTheDocument();
  });

  // P125.03 / P145.01 (TCK-1281) — `PATCH /api/me` n'accepte que l'E.164 : la feuille saisit le
  // numéro par `PhoneInput`, et c'est la valeur composée qui part, jamais la frappe telle quelle.
  it.each([
    ['77 000 00 00', '+221770000000'],
    ['+221 77 000 00 01', '+221770000001'],
  ])('envoie la saisie « %s » en E.164 (%s)', async (saisie, attendu) => {
    mockAuth(true);
    const fetchMock = setupFetchSequence([{ status: 200, json: async () => ({ data: [] }) }]);

    render(
      <Wrapper roles={['customer']}>
        <TriggerButton />
      </Wrapper>,
    );
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1));
    await declencherJusquALouverture();

    fireEvent.change(screen.getByLabelText(frMessages.customer.minimalProfile.phoneLabel), {
      target: { value: saisie },
    });
    fireEvent.click(screen.getByTestId('customer-minimal-profile-save'));

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(
        ([url, init]) => url === '/api/me' && (init as RequestInit)?.method === 'PATCH',
      );
      expect(patch).toBeDefined();
      expect(JSON.parse((patch![1] as RequestInit).body as string)).toEqual({ phone: attendu });
    });
  });
});

export {};
