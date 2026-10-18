import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Money } from '../Money';

/**
 * Mock the agency-currency hook so the agency-driven branch can be exercised
 * without spinning a TanStack Query client + auth context. The unit test for
 * the hook itself lives in `src/hooks/__tests__/useAgencyCurrency.test.tsx`.
 */
const useAgencyCurrencyMock = vi.fn();
vi.mock('@/hooks/useAgencyCurrency', () => ({
  useAgencyCurrency: (...args: unknown[]) => useAgencyCurrencyMock(...args),
}));

// Normalise NBSP (U+00A0) and NNBSP (U+202F) so assertions stay deterministic.
const SPACE_RE = /[   ]/gu;
function normalize(value: string | null): string {
  return (value ?? '').replace(SPACE_RE, ' ');
}

describe('<Money />', () => {
  beforeEach(() => {
    useAgencyCurrencyMock.mockReset();
  });

  it('formats with an explicit currency without consulting the hook', () => {
    const { container } = render(<Money value={150_000} currency="XOF" />);
    expect(normalize(container.textContent)).toContain('150 000 F CFA');
    expect(useAgencyCurrencyMock).not.toHaveBeenCalled();
  });

  it('formats with an explicit EUR currency', () => {
    const { container } = render(<Money value={150_000.5} currency="EUR" />);
    expect(normalize(container.textContent)).toContain('150 000,50 €');
  });

  it('formats with USD with leading symbol', () => {
    render(<Money value={1234} currency="USD" />);
    expect(screen.getByText('$1,234.00')).toBeInTheDocument();
  });

  it('renders an empty string for null input', () => {
    const { container } = render(<Money value={null} currency="EUR" />);
    expect(container.textContent).toBe('');
  });

  it('falls back to the agency hook when no explicit currency is provided', () => {
    useAgencyCurrencyMock.mockReturnValue({
      currency: 'EUR',
      symbol: '€',
      formatter: (n: number) => `${n} €`,
      isLoading: false,
    });

    render(<Money value={42} agencyId={7} />);

    expect(useAgencyCurrencyMock).toHaveBeenCalledWith(7);
    expect(screen.getByText('42 €')).toBeInTheDocument();
  });

  it('renders the ISO code when showCurrencyCode is true', () => {
    render(<Money value={42} currency="EUR" showCurrencyCode />);
    expect(screen.getByText('EUR')).toBeInTheDocument();
  });
});
