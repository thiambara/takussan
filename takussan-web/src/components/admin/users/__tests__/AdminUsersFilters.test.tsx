import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { AdminUsersFilters } from '../AdminUsersFilters';

const mockReplace = vi.fn();
const mockSearchParams = {
  get: vi.fn().mockReturnValue(null),
  toString: vi.fn().mockReturnValue(''),
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

describe('<AdminUsersFilters>', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockSearchParams.get.mockReturnValue(null);
    mockSearchParams.toString.mockReturnValue('');
  });

  it('renders status and role selects (no agency filter — scope is server-side)', () => {
    render(withIntl(<AdminUsersFilters />));
    expect(screen.getByLabelText('Statut')).toBeTruthy();
    expect(screen.getByLabelText('Rôle')).toBeTruthy();
    expect(screen.queryByLabelText('Agence')).toBeNull();
  });

  it('writes filter[role] to the URL when a role is picked', async () => {
    const user = userEvent.setup();
    render(withIntl(<AdminUsersFilters />));

    // The role filter is a Base UI Select — open the popup, pick "Agent".
    await user.click(screen.getByLabelText('Rôle'));
    const agentOption = await screen.findByRole('option', { name: /^Agent$/ });
    await user.click(agentOption);

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('filter%5Brole%5D=agent'),
    );
  });

  it('resets pagination when changing a filter', async () => {
    mockSearchParams.toString.mockReturnValue('page=4');
    const user = userEvent.setup();
    render(withIntl(<AdminUsersFilters />));

    await user.click(screen.getByLabelText('Statut'));
    const bannedOption = await screen.findByRole('option', { name: /Bloqu/i });
    await user.click(bannedOption);

    const replaced = String(mockReplace.mock.calls[0][0]);
    expect(replaced).not.toContain('page=4');
    expect(replaced).toContain('filter%5Bstatus%5D=banned');
  });

  it('debounces search via form submit so each keystroke does not refetch', () => {
    render(withIntl(<AdminUsersFilters />));
    const input = screen.getByPlaceholderText(/Rechercher/);
    fireEvent.change(input, { target: { value: 'amadou' } });
    expect(mockReplace).not.toHaveBeenCalled();
    fireEvent.submit(input.closest('form')!);
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('filter%5Bsearch%5D=amadou'),
    );
  });
});
