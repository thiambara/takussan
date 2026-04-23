import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { FavoriteButton } from '../FavoriteButton';

// ─── Mocks ───────────────────────────────────────────────────────────────────
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/properties',
  useSearchParams: () => new URLSearchParams(''),
}));

// Default: no user (anonymous). Individual tests override.
let authUser: { id: number } | null = null;
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: authUser, token: null, isLoading: false }),
}));

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <NextIntlClientProvider locale="fr" messages={{}}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}

describe('<FavoriteButton>', () => {
  beforeEach(() => {
    push.mockReset();
    authUser = null;
    localStorage.clear();
  });

  it('renders with aria-label reflecting the initial state', () => {
    render(wrap(<FavoriteButton propertyId={42} />));
    expect(
      screen.getByRole('button', { name: /ajouter aux favoris/i }),
    ).toBeInTheDocument();
  });

  it('redirects to login when the user is anonymous and requireAuth=true', async () => {
    const user = userEvent.setup();
    render(wrap(<FavoriteButton propertyId={42} />));
    await user.click(screen.getByRole('button'));
    expect(push).toHaveBeenCalledWith(
      expect.stringMatching(/^\/auth\/login\?redirect=/),
    );
  });

  it('persists to localStorage when requireAuth=false and user is anonymous', async () => {
    const user = userEvent.setup();
    render(wrap(<FavoriteButton propertyId={99} requireAuth={false} />));
    await user.click(screen.getByRole('button'));
    expect(push).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('takussan.favorites') ?? '[]')).toContain(99);
    // Toggle off
    await user.click(screen.getByRole('button'));
    expect(JSON.parse(localStorage.getItem('takussan.favorites') ?? '[]')).not.toContain(99);
  });
});
