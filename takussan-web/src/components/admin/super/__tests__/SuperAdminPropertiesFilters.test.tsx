import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { SuperAdminPropertiesFilters } from '../SuperAdminPropertiesFilters';

const mockReplace = vi.fn();
const mockSearchParams = {
  get: vi.fn().mockReturnValue(null),
  toString: vi.fn().mockReturnValue(''),
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

describe('<SuperAdminPropertiesFilters>', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockSearchParams.get.mockReturnValue(null);
    mockSearchParams.toString.mockReturnValue('');
  });

  it('renders the agency filter populated from props', () => {
    render(
      <SuperAdminPropertiesFilters
        agencies={[
          { id: 1, name: 'Tabaski Immo' },
          { id: 2, name: 'Sahel Properties' },
        ]}
      />,
    );
    expect(screen.getByLabelText('Agence')).toBeTruthy();
    expect(screen.getByText('Tabaski Immo')).toBeTruthy();
    expect(screen.getByText('Sahel Properties')).toBeTruthy();
  });

  it('writes filter[agency_id] to the URL when an agency is picked', () => {
    render(
      <SuperAdminPropertiesFilters agencies={[{ id: 12, name: 'Pikine Real Estate' }]} />,
    );
    fireEvent.change(screen.getByLabelText('Agence'), { target: { value: '12' } });
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('filter%5Bagency_id%5D=12'),
    );
  });

  it('resets pagination when changing a filter', () => {
    mockSearchParams.toString.mockReturnValue('page=4');
    render(<SuperAdminPropertiesFilters agencies={[]} />);
    fireEvent.change(screen.getByLabelText('Statut'), { target: { value: 'available' } });
    const replaced = String(mockReplace.mock.calls[0][0]);
    expect(replaced).not.toContain('page=4');
    expect(replaced).toContain('filter%5Bstatus%5D=available');
  });

  it('debounces search via form submit so each keystroke does not refetch', () => {
    render(<SuperAdminPropertiesFilters agencies={[]} />);
    const input = screen.getByPlaceholderText(/Rechercher/);
    fireEvent.change(input, { target: { value: 'studio' } });
    expect(mockReplace).not.toHaveBeenCalled();
    fireEvent.submit(input.closest('form')!);
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('filter%5Bsearch%5D=studio'),
    );
  });
});
