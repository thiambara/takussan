import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { attendAucuneCleBrute } from '@/test/cles-brutes';
import SuperAdminUsersPage from '../page';

const mockReplace = vi.fn();
const mockPush = vi.fn();
const mockSearchParams = {
  get: vi.fn().mockReturnValue(null),
  toString: vi.fn().mockReturnValue(''),
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  // `withIntl` charge le VRAI `fr.json` : depuis TCK-291, la page rend son état vide et son bloc
  // d'erreur via next-intl, et sans provider `useTranslations` LÈVE.
  return render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <SuperAdminUsersPage />
      </QueryClientProvider>,
    ),
  );
}

function mockFetch(data: unknown[] = []) {
  const response = {
    ok: true,
    json: async () => ({
      data,
      meta: { total: 0, current_page: 1, last_page: 1 },
    }),
  };
  const spy = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<typeof response>>(async () => response);
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mockReplace.mockReset();
  mockPush.mockReset();
  mockSearchParams.get.mockReturnValue(null);
  mockSearchParams.toString.mockReturnValue('');
});

describe('super-admin users page', () => {
  it('requests only allowed user sparse fields', async () => {
    const spy = mockFetch();

    renderPage();

    await waitFor(() => expect(spy).toHaveBeenCalled());

    const url = new URL(String(spy.mock.calls[0][0]), 'http://localhost');
    const fields = url.searchParams.get('fields[users]')?.split(',') ?? [];

    expect(url.pathname).toBe('/api/super-admin-users');
    expect(fields).toEqual(expect.arrayContaining(['id', 'first_name', 'last_name', 'email', 'phone', 'status', 'email_verified_at', 'two_factor_enabled', 'last_login_at']));
    expect(fields).not.toContain('full_name');
    expect(fields).not.toContain('roles');
    expect(url.searchParams.get('include')).toBe('roles,agentProfiles,ownerProfiles');
  });

  it('renders role badges, agencies and security columns', async () => {
    mockFetch([
      {
        id: 7,
        first_name: 'Awa',
        last_name: 'Ndiaye',
        full_name: 'Awa Ndiaye',
        email: 'awa@example.test',
        phone: '+221770000000',
        status: 'active',
        email_verified_at: '2026-05-01T10:00:00+00:00',
        two_factor_enabled: true,
        last_login_at: '2026-05-08T12:00:00+00:00',
        roles: [{ name: 'agent', team_id: 3 }],
        agencies: [{ id: 3, name: 'Dakar Immo', slug: 'dakar-immo' }],
      },
    ]);

    renderPage();

    expect(await screen.findByText('Awa Ndiaye')).toBeInTheDocument();
    expect(screen.getAllByText('agent').length).toBeGreaterThan(0);
    expect(screen.getByText(/Agences : Dakar Immo/)).toBeInTheDocument();
    expect(screen.getAllByText(/Email vérifié/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2FA activée/).length).toBeGreaterThan(0);
  });

  it('sends role and agency filters to the server', async () => {
    const user = userEvent.setup();
    const spy = mockFetch();

    renderPage();
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    // Pick the role via the shadcn (base-ui) Select trigger.
    await user.click(screen.getByLabelText('Rôle'));
    const agentOption = await screen.findByRole('option', { name: 'Agent' });
    await user.click(agentOption);

    await user.type(screen.getByPlaceholderText('ID agence'), '12');

    await waitFor(() => expect(spy.mock.calls.length).toBeGreaterThanOrEqual(3));

    const url = new URL(String(spy.mock.calls.at(-1)?.[0]), 'http://localhost');
    expect(url.searchParams.get('filter[role]')).toBe('agent');
    expect(url.searchParams.get('filter[agency_id]')).toBe('12');
  });

  it('mirrors the role filter to the URL (?role=…) — AC3 TCK-243', async () => {
    const user = userEvent.setup();
    mockFetch();

    renderPage();

    await user.click(screen.getByLabelText('Rôle'));
    const agentOption = await screen.findByRole('option', { name: 'Agent' });
    await user.click(agentOption);

    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('role=agent'));
  });

  it('hydrates the role filter from the URL on mount — AC3 TCK-243', async () => {
    mockSearchParams.get.mockImplementation((key: string) => (key === 'role' ? 'agent' : null));
    mockSearchParams.toString.mockReturnValue('role=agent');
    const spy = mockFetch();

    renderPage();

    await waitFor(() => expect(spy).toHaveBeenCalled());
    const url = new URL(String(spy.mock.calls[0][0]), 'http://localhost');
    expect(url.searchParams.get('filter[role]')).toBe('agent');
  });

  it('drops ?role from the URL when the role filter is cleared', async () => {
    const user = userEvent.setup();
    mockSearchParams.get.mockImplementation((key: string) => (key === 'role' ? 'agent' : null));
    mockSearchParams.toString.mockReturnValue('role=agent');
    mockFetch();

    renderPage();

    await user.click(screen.getByLabelText('Rôle'));
    const allRoles = await screen.findByRole('option', { name: 'Tous rôles' });
    await user.click(allRoles);

    expect(mockReplace).toHaveBeenCalled();
    const replaced = String(mockReplace.mock.calls.at(-1)?.[0]);
    expect(replaced).not.toContain('role=agent');
  });
  /**
   * TCK-292 (2026-08-22) — le chemin d'ERREUR n'était parcouru par AUCUN test, et c'est
   * exactement ce qui a laissé vivre le défaut : `fetchUsers` levait
   * `Object.assign(new Error('Users fetch failed'), …)`, un `Error` NU. `messageErreurApi` ne le
   * reconnaissait ni comme `ApiError`, ni comme forme technique (`/^API error \d+/`), ni comme
   * sentinelle de framework — il retombait donc dans « un `Error` nu transporte un message DÉJÀ
   * traduit » et rendait « Users fetch failed » TEL QUEL dans les trois langues. Le repli
   * `t('error')` n'était atteint par aucun chemin.
   *
   * Ce test-ci n'assère pas seulement le bon libellé : il refuse aussi la chaîne fautive, sans
   * quoi une régression qui rendrait les DEUX passerait au vert.
   */
  it("rend le libellé TRADUIT quand le BFF échoue — jamais le message anglais de l'Error", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    })));

    renderPage();

    // Le libellé attendu vient du CODE d'erreur dérivé du 500 (`errors.api.serverError`), et non
    // du repli `t('error')` : c'est justement ce que `throw new ApiError(res.status, data)` rend
    // possible et qu'un `Error` nu rendait inatteignable.
    expect(
      await screen.findByText('Le serveur a rencontré une erreur. Réessayez dans un instant.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Users fetch failed/)).not.toBeInTheDocument();
    attendAucuneCleBrute(document.body);
  });
});
