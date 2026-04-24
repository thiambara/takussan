import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LeaveReviewCta } from '../LeaveReviewCta';

describe('<LeaveReviewCta>', () => {
  it('renders a deep link to the public property page anchored on #avis', () => {
    render(<LeaveReviewCta slug="villa-nord-dakar" propertyTitle="Villa Nord Dakar" />);

    const link = screen.getByRole('link', { name: /laisser un avis/i });
    expect(link).toHaveAttribute('href', '/properties/villa-nord-dakar#avis');
    expect(screen.getByText(/Villa Nord Dakar/)).toBeInTheDocument();
  });

  it('falls back to the generic prompt when no context is provided', () => {
    render(<LeaveReviewCta slug="villa" />);
    expect(
      screen.getByText(/aide les prochains locataires/i),
    ).toBeInTheDocument();
  });

  it('uses the caller-provided context when present', () => {
    render(<LeaveReviewCta slug="villa" context="Votre séjour est terminé." />);
    expect(screen.getByText('Votre séjour est terminé.')).toBeInTheDocument();
  });
});
