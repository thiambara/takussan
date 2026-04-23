import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { TeamManagement } from '../TeamManagement';

// ─── Mocks ───────────────────────────────────────────────────────────────────
const mockFetchMembers = vi.fn();
const mockAddMember = vi.fn();
const mockUpdateRole = vi.fn();
const mockRemoveMember = vi.fn();

vi.mock('@/lib/queries/agency-members', () => ({
  fetchAgencyMembers: (...args: unknown[]) => mockFetchMembers(...args),
  addAgencyMember: (...args: unknown[]) => mockAddMember(...args),
  updateAgencyMemberRole: (...args: unknown[]) => mockUpdateRole(...args),
  removeAgencyMember: (...args: unknown[]) => mockRemoveMember(...args),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, token: 'fake-token', isLoading: false }),
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

function makeMember(overrides: Partial<{
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  roles: string[];
}> = {}) {
  return {
    id: overrides.id ?? 1,
    first_name: overrides.first_name ?? 'Ada',
    last_name: overrides.last_name ?? 'Lovelace',
    full_name: `${overrides.first_name ?? 'Ada'} ${overrides.last_name ?? 'Lovelace'}`,
    email: overrides.email ?? 'ada@example.com',
    phone: null,
    bio: null,
    avatar_url: null,
    email_verified_at: null,
    agency_id: 1,
    roles: overrides.roles ?? ['agent'],
    status: 'active' as const,
    created_at: '2025-01-01T00:00:00Z',
  };
}

describe('<TeamManagement>', () => {
  beforeEach(() => {
    mockFetchMembers.mockReset();
    mockAddMember.mockReset();
    mockUpdateRole.mockReset();
    mockRemoveMember.mockReset();
  });

  it('renders the members table from the API response', async () => {
    mockFetchMembers.mockResolvedValue({
      data: [
        makeMember({ id: 1, first_name: 'Ada' }),
        makeMember({ id: 2, first_name: 'Grace', last_name: 'Hopper', email: 'grace@example.com' }),
      ],
      meta: { total: 2, current_page: 1, last_page: 1, per_page: 20 },
      links: { first: null, last: null, prev: null, next: null },
    });

    render(wrap(<TeamManagement agencyId={1} currentUserId={999} />));

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('2 membres')).toBeInTheDocument();
  });

  it('opens the invite dialog when the CTA is clicked', async () => {
    mockFetchMembers.mockResolvedValue({
      data: [],
      meta: { total: 0, current_page: 1, last_page: 1, per_page: 20 },
      links: { first: null, last: null, prev: null, next: null },
    });

    const user = userEvent.setup();
    render(wrap(<TeamManagement agencyId={1} currentUserId={999} />));

    await waitFor(() => expect(mockFetchMembers).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: /inviter un agent/i }));

    // Dialog title visible
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it('guards the remove action on the last agency admin', async () => {
    mockFetchMembers.mockResolvedValue({
      data: [makeMember({ id: 5, roles: ['agency_admin'] })],
      meta: { total: 1, current_page: 1, last_page: 1, per_page: 20 },
      links: { first: null, last: null, prev: null, next: null },
    });

    const user = userEvent.setup();
    render(wrap(<TeamManagement agencyId={1} currentUserId={999} />));

    await screen.findByText('Ada Lovelace');

    // Open the action menu for the sole agency admin.
    await user.click(screen.getByRole('button', { name: /actions pour/i }));

    const removeItem = await screen.findByText(/retirer de l'agence/i);
    // The menu item is disabled via aria; clicking should not trigger the mutation.
    await user.click(removeItem);
    expect(mockRemoveMember).not.toHaveBeenCalled();
  });

  it('calls updateAgencyMemberRole when promoting an agent', async () => {
    mockFetchMembers.mockResolvedValue({
      data: [
        makeMember({ id: 5, roles: ['agent'] }),
        makeMember({ id: 6, first_name: 'Alan', last_name: 'Turing', roles: ['agency_admin'] }),
      ],
      meta: { total: 2, current_page: 1, last_page: 1, per_page: 20 },
      links: { first: null, last: null, prev: null, next: null },
    });
    mockUpdateRole.mockResolvedValue({ data: { user_id: 5, role: 'agency_admin', roles: ['agency_admin'] } });

    const user = userEvent.setup();
    render(wrap(<TeamManagement agencyId={1} currentUserId={999} />));

    await screen.findByText('Ada Lovelace');

    const rows = screen.getAllByRole('button', { name: /actions pour/i });
    await user.click(rows[0]);

    const promote = await screen.findByText(/promouvoir administrateur/i);
    await user.click(promote);

    await waitFor(() => expect(mockUpdateRole).toHaveBeenCalled());
    expect(mockUpdateRole).toHaveBeenCalledWith(1, 5, 'agency_admin', 'fake-token');
  });
});
