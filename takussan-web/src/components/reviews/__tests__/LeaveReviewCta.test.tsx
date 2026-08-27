import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
// `withIntl` charge le VRAI `fr.json` : depuis TCK-292 ce composant passe par next-intl, et
// `messages={{}}` (ou l'absence de provider) rendrait la CLÉ. Assertions inchangées.
import { withIntl } from '@/test/intl';
import { LeaveReviewCta } from '../LeaveReviewCta';

describe('<LeaveReviewCta>', () => {
  it('renders a deep link to the public property page anchored on #avis', () => {
    render(withIntl(<LeaveReviewCta slug="villa-nord-dakar" propertyTitle="Villa Nord Dakar" />));

    const link = screen.getByRole('link', { name: /laisser un avis/i });
    // TCK-434 : le lien porte la langue, et l'ancre `#avis` la traverse — c'est cette seconde
    // moitié que le test garde.
    expect(link).toHaveAttribute('href', '/fr/properties/villa-nord-dakar#avis');
    expect(screen.getByText(/Villa Nord Dakar/)).toBeInTheDocument();
  });

  it('falls back to the generic prompt when no context is provided', () => {
    render(withIntl(<LeaveReviewCta slug="villa" />));
    expect(
      screen.getByText(/aide les prochains locataires/i),
    ).toBeInTheDocument();
  });

  it('uses the caller-provided context when present', () => {
    render(withIntl(<LeaveReviewCta slug="villa" context="Votre séjour est terminé." />));
    expect(screen.getByText('Votre séjour est terminé.')).toBeInTheDocument();
  });
});
