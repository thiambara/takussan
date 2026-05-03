import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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
    render(<AdminUsersFilters />);
    expect(screen.getByLabelText('Statut')).toBeTruthy();
    expect(screen.getByLabelText('Rôle')).toBeTruthy();
    expect(screen.queryByLabelText('Agence')).toBeNull();
  });

  it('writes filter[role] to the URL when a role is picked', () => {
    render(<AdminUsersFilters />);
    fireEvent.change(screen.getByLabelText('Rôle'), { target: { value: 'agent' } });
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('filter%5Brole%5D=agent'),
    );
  });

  it('resets pagination when changing a filter', () => {
    mockSearchParams.toString.mockReturnValue('page=4');
    render(<AdminUsersFilters />);
    fireEvent.change(screen.getByLabelText('Statut'), { target: { value: 'banned' } });
    const replaced = String(mockReplace.mock.calls[0][0]);
    expect(replaced).not.toContain('page=4');
    expect(replaced).toContain('filter%5Bstatus%5D=banned');
  });

  it('debounces search via form submit so each keystroke does not refetch', () => {
    render(<AdminUsersFilters />);
    const input = screen.getByPlaceholderText(/Rechercher/);
    fireEvent.change(input, { target: { value: 'amadou' } });
    expect(mockReplace).not.toHaveBeenCalled();
    fireEvent.submit(input.closest('form')!);
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('filter%5Bsearch%5D=amadou'),
    );
  });
});
