import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';

import SuperAdminUsersPage from '../page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <SuperAdminUsersPage />
    </QueryClientProvider>,
  );
}

function mockFetch() {
  const response = {
    ok: true,
    json: async () => ({
      data: [],
      meta: { total: 0, current_page: 1, last_page: 1 },
    }),
  };
  const spy = vi.fn(async () => response);
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('super-admin users page', () => {
  it('requests only allowed user sparse fields', async () => {
    const spy = mockFetch();

    renderPage();

    await waitFor(() => expect(spy).toHaveBeenCalled());

    const url = new URL(String(spy.mock.calls[0][0]), 'http://localhost');
    const fields = url.searchParams.get('fields[users]')?.split(',') ?? [];

    expect(url.pathname).toBe('/api/super-admin-users');
    expect(fields).toEqual(expect.arrayContaining(['id', 'first_name', 'last_name', 'email', 'status']));
    expect(fields).not.toContain('full_name');
    expect(fields).not.toContain('roles');
    expect(url.searchParams.get('include')).toBe('roles');
  });
});
