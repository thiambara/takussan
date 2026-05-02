import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ImpersonationBanner } from '../ImpersonationBanner';
import {
  IMPERSONATION_EVENT,
  clearImpersonationSession,
  writeImpersonationSession,
} from '@/lib/impersonation';

function renderBanner() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ImpersonationBanner />
    </QueryClientProvider>,
  );
}

describe('<ImpersonationBanner>', () => {
  beforeEach(() => {
    clearImpersonationSession();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    clearImpersonationSession();
  });

  it('renders nothing when no impersonation session is active', () => {
    renderBanner();
    expect(screen.queryByTestId('impersonation-banner')).not.toBeInTheDocument();
  });

  it('appears when a session is written and disappears after stop', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ message: 'ok', revoked_count: 1 }), { status: 200 }),
    ) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    renderBanner();

    writeImpersonationSession({
      token: 'abc',
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      actor_id: 1,
      target_user_id: 42,
      target_label: 'Awa Diop',
    });
    // Force the storage event to propagate in jsdom (CustomEvent fired manually).
    window.dispatchEvent(new Event(IMPERSONATION_EVENT));

    await waitFor(() => expect(screen.getByTestId('impersonation-banner')).toBeInTheDocument());
    expect(screen.getByText(/Awa Diop/)).toBeInTheDocument();

    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: /Arrêter/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/super-admin/impersonate/stop',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    await waitFor(() => expect(screen.queryByTestId('impersonation-banner')).not.toBeInTheDocument());
  });

  it('hides itself when the session has expired', () => {
    writeImpersonationSession({
      token: 'abc',
      expires_at: new Date(Date.now() - 1000).toISOString(),
      actor_id: 1,
      target_user_id: 42,
    });
    renderBanner();
    expect(screen.queryByTestId('impersonation-banner')).not.toBeInTheDocument();
  });
});
