import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SearchPreferencesForm } from '../SearchPreferencesForm';
import { withIntl } from '@/test/intl';
import type { SavedSearch } from '@/lib/queries/saved-searches';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

function mockFetch(response: { ok?: boolean; status?: number; payload: unknown }) {
  const fakeResponse = {
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: async () => response.payload,
    text: async () => JSON.stringify(response.payload),
  };
  const spy = vi.fn(async (..._args: Parameters<typeof fetch>) => fakeResponse);
  vi.stubGlobal('fetch', spy);
  return spy;
}

function renderForm(props: {
  initial: SavedSearch | null;
  emailVerified: boolean;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(withIntl(
    <QueryClientProvider client={queryClient}>
      <SearchPreferencesForm {...props} />
    </QueryClientProvider>,
  ));
}

const SAMPLE: SavedSearch = {
  id: 42,
  user_id: 1,
  name: 'Mes préférences',
  criteria: { type: ['apartment'], cities: ['Dakar'], price_max: 200_000 },
  notification_frequency: 'daily',
  is_active: true,
  results_count: 0,
  created_at: '2026-05-03T00:00:00Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('<SearchPreferencesForm>', () => {
  it('renders empty state when no SavedSearch provided', () => {
    renderForm({ initial: null, emailVerified: true });
    expect(screen.getByTestId('pref-budget')).toHaveValue(null);
    expect(screen.getByTestId('pref-cities')).toHaveValue('');
    expect(screen.getByTestId('pref-alerts-toggle')).not.toBeChecked();
  });

  it('hydrates form fields from an existing SavedSearch', () => {
    renderForm({ initial: SAMPLE, emailVerified: true });
    expect(screen.getByTestId('pref-budget')).toHaveValue(200_000);
    expect(screen.getByTestId('pref-cities')).toHaveValue('Dakar');
    expect(screen.getByTestId('pref-type-apartment')).toBeChecked();
    expect(screen.getByTestId('pref-alerts-toggle')).toBeChecked();
  });

  it('disables the alerts toggle when email is not verified', () => {
    renderForm({ initial: SAMPLE, emailVerified: false });
    expect(screen.getByTestId('pref-alerts-toggle')).toBeDisabled();
    expect(screen.getByTestId('pref-alerts-unverified')).toBeInTheDocument();
  });

  it('creates a SavedSearch via POST when none exists', async () => {
    const user = userEvent.setup();
    const fetchSpy = mockFetch({
      payload: { data: { ...SAMPLE, id: 99, criteria: { type: ['apartment'] } } },
      status: 201,
    });

    renderForm({ initial: null, emailVerified: true });
    await user.click(screen.getByTestId('pref-type-apartment'));
    await user.click(screen.getByTestId('pref-save'));

    await waitFor(() =>
      expect(screen.getByTestId('pref-feedback')).toHaveTextContent(
        /préférences enregistrées/i,
      ),
    );

    const call = fetchSpy.mock.calls[0];
    expect(String(call[0])).toContain('/api/saved-searches');
    expect((call[1] as RequestInit).method).toBe('POST');
    const body = JSON.parse(((call[1] as RequestInit).body as string) ?? '{}');
    expect(body.name).toBe('Mes préférences');
    expect(body.criteria.type).toEqual(['apartment']);
    expect(body.notification_frequency).toBe('off');
  });

  it('updates existing SavedSearch via PATCH and forces frequency=off when alerts toggled off', async () => {
    const user = userEvent.setup();
    const fetchSpy = mockFetch({
      payload: { data: { ...SAMPLE, notification_frequency: 'off' } },
    });

    renderForm({ initial: SAMPLE, emailVerified: true });
    await user.click(screen.getByTestId('pref-alerts-toggle'));
    await user.click(screen.getByTestId('pref-save'));

    await waitFor(() =>
      expect(screen.getByTestId('pref-feedback')).toHaveTextContent(
        /préférences enregistrées/i,
      ),
    );

    const call = fetchSpy.mock.calls[0];
    expect(String(call[0])).toContain('/api/saved-searches/42');
    expect((call[1] as RequestInit).method).toBe('PATCH');
    const body = JSON.parse(((call[1] as RequestInit).body as string) ?? '{}');
    expect(body.notification_frequency).toBe('off');
  });
});
