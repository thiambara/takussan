import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { CustomerListFilters } from '../CustomerListFilters';
import { withIntl } from '@/test/intl';

const mockReplace = vi.fn();
const mockSearchParams = {
  get: vi.fn().mockReturnValue(null),
  toString: vi.fn().mockReturnValue(''),
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

describe('CustomerListFilters', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockSearchParams.get.mockReturnValue(null);
    mockSearchParams.toString.mockReturnValue('');
  });

  it('renders without tag filter when no crmTags provided', () => {
    render(withIntl(<CustomerListFilters />));
    expect(screen.queryByRole('button', { name: /Filtrer par tags/i })).toBeNull();
  });

  it('renders tag filter button when crmTags provided', () => {
    render(withIntl(
      <CustomerListFilters
        crmTags={[
          { id: 1, name: 'vip', color: null },
          { id: 2, name: 'prospect', color: null },
        ]}
      />,
    ));
    expect(screen.getByRole('button', { name: /Filtrer par tags/i })).toBeTruthy();
  });

  it('opens the tag popover on button click', () => {
    render(withIntl(
      <CustomerListFilters
        crmTags={[{ id: 1, name: 'vip', color: null }]}
      />,
    ));
    const btn = screen.getByRole('button', { name: /Filtrer par tags/i });
    fireEvent.click(btn);
    expect(screen.getByText('Tags clients')).toBeTruthy();
    expect(screen.getByText('vip')).toBeTruthy();
  });

  it('calls router.replace with tags param when a tag is toggled', () => {
    render(withIntl(
      <CustomerListFilters
        crmTags={[{ id: 1, name: 'vip', color: null }]}
      />,
    ));
    fireEvent.click(screen.getByRole('button', { name: /Filtrer par tags/i }));
    fireEvent.click(screen.getByText('vip'));
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('tags=vip'));
  });

  it('shows active tag count badge when tags are active', () => {
    mockSearchParams.get.mockImplementation((key: string) =>
      key === 'tags' ? 'vip,prospect' : null,
    );
    render(withIntl(
      <CustomerListFilters
        crmTags={[
          { id: 1, name: 'vip', color: null },
          { id: 2, name: 'prospect', color: null },
        ]}
      />,
    ));
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('shows clear button when tags are active', () => {
    mockSearchParams.get.mockImplementation((key: string) =>
      key === 'tags' ? 'vip' : null,
    );
    render(withIntl(
      <CustomerListFilters
        crmTags={[{ id: 1, name: 'vip', color: null }]}
      />,
    ));
    fireEvent.click(screen.getByRole('button', { name: /Tags/i }));
    expect(screen.getByText('Tout effacer')).toBeTruthy();
  });
});
