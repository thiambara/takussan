import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfileSwitcher } from '../ProfileSwitcher';
import type { User } from '@/types/user';
import type { MyProfilesResponse } from '@/types/profile';

const refreshUserMock = vi.fn();
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, refreshUser: refreshUserMock }),
}));

// `useSwitchActiveProfile` (called unconditionally by <ProfileSwitcher>) reaches
// into `next/navigation` for `useRouter().refresh()` after a successful switch.
// The app router isn't mounted in vitest, so we stub a minimal compatible shape.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

// The mutation also calls `useToast().add(...)` on success/error. Avoid pulling
// in the full Base UI provider tree by stubbing the hook directly.
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ add: vi.fn() }),
}));

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    first_name: 'Awa',
    last_name: 'Diop',
    full_name: 'Awa Diop',
    email: 'awa@example.test',
    phone: null,
    bio: null,
    avatar_url: null,
    email_verified_at: null,
    phone_verified_at: null,
    two_factor_enabled: false,
    agency_id: null,
    roles: [],
    status: 'active',
    created_at: '2026-04-22T00:00:00Z',
    ...overrides,
  };
}

function renderWithFetch(
  user: User,
  fetchImpl: typeof fetch,
): { queryClient: QueryClient } {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  vi.stubGlobal('fetch', fetchImpl);
  render(
    <QueryClientProvider client={queryClient}>
      <ProfileSwitcher user={user} />
    </QueryClientProvider>,
  );
  return { queryClient };
}

const mockProfilesFetch = (body: MyProfilesResponse): typeof fetch =>
  vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

describe('<ProfileSwitcher>', () => {
  beforeEach(() => {
    refreshUserMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders nothing for a user without profiles or super_admin role', async () => {
    renderWithFetch(makeUser(), mockProfilesFetch({ data: [], meta: { active_profile_id: null, count: 0 } }));
    await waitFor(() => expect(screen.queryByTestId('profile-switcher-loading')).not.toBeInTheDocument());
    expect(screen.queryByTestId('profile-switcher-static')).not.toBeInTheDocument();
    expect(screen.queryByTestId('profile-switcher-trigger')).not.toBeInTheDocument();
    expect(screen.queryByTestId('profile-switcher-admin-label')).not.toBeInTheDocument();
  });

  it('renders an admin label for a super_admin without profiles', async () => {
    renderWithFetch(
      makeUser({ roles: ['super_admin'] }),
      mockProfilesFetch({ data: [], meta: { active_profile_id: null, count: 0 } }),
    );
    await waitFor(() => expect(screen.getByTestId('profile-switcher-admin-label')).toBeInTheDocument());
    expect(screen.queryByTestId('profile-switcher-trigger')).not.toBeInTheDocument();
  });

  it('renders a static label (no trigger) for a mono-profile user', async () => {
    const body: MyProfilesResponse = {
      data: [
        {
          id: 'agent:5',
          type: 'agent',
          numeric_id: 5,
          agency_id: 7,
          agency: { id: 7, name: 'Acme Immo', slug: 'acme' },
          status: 'active',
          created_at: '2026-04-22T00:00:00Z',
        },
      ],
      meta: { active_profile_id: 'agent:5', count: 1 },
    };
    renderWithFetch(makeUser(), mockProfilesFetch(body));
    await waitFor(() => expect(screen.getByTestId('profile-switcher-static')).toBeInTheDocument());
    expect(screen.queryByTestId('profile-switcher-trigger')).not.toBeInTheDocument();
  });

  it('renders a trigger and switches profile on click for multi-profile users', async () => {
    const body: MyProfilesResponse = {
      data: [
        {
          id: 'agent:5',
          type: 'agent',
          numeric_id: 5,
          agency_id: 7,
          agency: { id: 7, name: 'Acme Immo', slug: 'acme' },
          status: 'active',
          created_at: '2026-04-22T00:00:00Z',
        },
        {
          id: 'owner:9',
          type: 'owner',
          numeric_id: 9,
          agency_id: 11,
          agency: { id: 11, name: 'Baobab Real Estate', slug: 'baobab' },
          status: 'active',
          created_at: '2026-04-22T00:00:00Z',
        },
      ],
      meta: { active_profile_id: 'agent:5', count: 2 },
    };

    const switchedProfile = body.data[1];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith('/api/me/active-profile') && init?.method === 'PATCH') {
        return new Response(JSON.stringify({ data: switchedProfile }), { status: 200 });
      }
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;

    const { queryClient } = renderWithFetch(makeUser(), fetchMock);
    queryClient.setQueryData(['auth', 'me'], makeUser());

    await waitFor(() => expect(screen.getByTestId('profile-switcher-trigger')).toBeInTheDocument());
    const u = userEvent.setup();
    await u.click(screen.getByTestId('profile-switcher-trigger'));
    await waitFor(() => expect(screen.getByTestId('profile-switcher-item-owner:9')).toBeInTheDocument());
    await u.click(screen.getByTestId('profile-switcher-item-owner:9'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/me/active-profile',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
    await waitFor(() => expect(refreshUserMock).toHaveBeenCalled());
  });
});
