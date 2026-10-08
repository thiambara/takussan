/**
 * TCK-600 (ADR-0055 §6) — AC5g : la bannière lit la session sur le serveur du front, jamais dans un
 * stockage du navigateur (elle lisait `localStorage['takussan.impersonation']`, jeton compris).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ImpersonationBanner } from '../ImpersonationBanner';

const SESSION = {
  session_id: 7,
  impersonator: { id: 1, name: 'Ibrahima Fall' },
  target: { id: 42, name: 'Awa Diop' },
  expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  read_only: true,
};

function renderBanner() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      <ImpersonationBanner />
    </QueryClientProvider>,
  ));
}

function poserLeTemoin(): void {
  document.cookie = 'impersonation_active=1; path=/';
}

function retirerLeTemoin(): void {
  document.cookie = 'impersonation_active=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

const assign = vi.fn();
const locationOriginale = window.location;

describe('<ImpersonationBanner>', () => {
  beforeEach(() => {
    assign.mockClear();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...locationOriginale, assign },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    retirerLeTemoin();
    Object.defineProperty(window, 'location', { configurable: true, value: locationOriginale });
  });

  it('hors session, ne rend rien et n\'interroge rien', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderBanner();

    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId('impersonation-banner')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('pendant une session : cible, lecture seule, heure de fin ; « Quitter » termine et revient à la fiche', async () => {
    poserLeTemoin();
    const fetchMock = vi.fn(async (url: string) =>
      url === '/api/impersonation/current'
        ? new Response(JSON.stringify({ data: SESSION }), { status: 200 })
        : new Response(JSON.stringify({ data: { session_id: 7 } }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderBanner();

    const banniere = await screen.findByTestId('impersonation-banner');
    expect(banniere).toHaveTextContent('Lecture seule');
    expect(banniere).toHaveTextContent('Awa Diop');
    expect(banniere).toHaveTextContent(/\d{2}:\d{2}/);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Quitter' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/impersonation/stop', { method: 'POST' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/super-admin/users/42'));
  });

  it('une session que le serveur ne connaît plus ne s\'affiche pas', async () => {
    poserLeTemoin();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));

    renderBanner();

    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId('impersonation-banner')).not.toBeInTheDocument();
  });
});
