import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfileCustomerSection } from '../ProfileCustomerSection';
import { withIntl } from '@/test/intl';
import type { User } from '@/types/user';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

function mockFetch(payload: unknown) {
  const fakeResponse = {
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
  const spy = vi.fn(async (..._args: Parameters<typeof fetch>) => fakeResponse);
  vi.stubGlobal('fetch', spy);
  return spy;
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    first_name: 'Aïssa',
    last_name: 'Diop',
    full_name: 'Aïssa Diop',
    email: 'aissa@example.test',
    phone: null,
    bio: null,
    avatar_url: null,
    email_verified_at: '2026-05-01T00:00:00Z',
    phone_verified_at: null,
    two_factor_enabled: false,
    roles: ['customer'],
    status: 'active',
    created_at: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

function renderSection(user: User) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(withIntl(
    <QueryClientProvider client={queryClient}>
      <ProfileCustomerSection user={user} />
    </QueryClientProvider>,
  ));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('<ProfileCustomerSection>', () => {
  it('renders no "Bientôt disponible" placeholders and no disabled inputs', async () => {
    mockFetch({ data: [] });
    renderSection(makeUser());

    await waitFor(() =>
      expect(screen.getByTestId('search-prefs-form')).toBeInTheDocument(),
    );

    expect(screen.queryByText(/bientôt disponible/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('pref-budget')).not.toBeDisabled();
    expect(screen.getByTestId('pref-cities')).not.toBeDisabled();
  });

  it('passes sparse fieldsets to /api/saved-searches', async () => {
    const fetchSpy = mockFetch({ data: [] });
    renderSection(makeUser());

    await waitFor(() =>
      expect(screen.getByTestId('search-prefs-form')).toBeInTheDocument(),
    );

    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain('/api/saved-searches');
    expect(url).toContain('fields%5Bsaved_searches%5D');
  });

  it('shows the unverified-email guard when email is not verified', async () => {
    mockFetch({
      data: [
        {
          id: 1,
          user_id: 1,
          name: 'Mes préférences',
          criteria: {},
          notification_frequency: 'off',
          is_active: true,
          results_count: 0,
          created_at: null,
        },
      ],
    });
    renderSection(makeUser({ email_verified_at: null }));

    await waitFor(() =>
      expect(screen.getByTestId('pref-alerts-unverified')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('pref-alerts-toggle')).toBeDisabled();
  });
});
