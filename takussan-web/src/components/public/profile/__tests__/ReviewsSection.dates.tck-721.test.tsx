import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { withIntl, type LocaleDeTest } from '@/test/intl';

/**
 * TCK-721 (piste P06.05) — le mois des avis de la fiche publique d'agence et d'agent suit la
 * langue de la page. Il était figé en `toLocaleDateString('fr-FR', …)` : « Awa · octobre 2026 »
 * sous `/en`.
 */

vi.mock('@/components/reports/ReviewReportButton', () => ({ ReviewReportButton: () => null }));

import { ReviewsSection } from '../ReviewsSection';

function monte(locale: LocaleDeTest) {
  return render(
    withIntl(
      <ReviewsSection
        average={4}
        count={1}
        reviews={[
          {
            id: 1,
            rating: 4,
            title: null,
            content: 'Très réactif.',
            author: { name: 'Awa Diop' },
            created_at: '2026-10-12T10:00:00Z',
          },
        ]}
      />,
      locale,
    ),
  );
}

describe('<ReviewsSection> — le mois de l’avis suit la langue (TCK-721)', () => {
  it('en anglais, le mois n’est pas français', () => {
    monte('en');
    expect(screen.getByText(/Awa D\./).textContent).toContain('October 2026');
    expect(document.body.textContent).not.toContain('octobre');
  });

  it('en français, le mois reste français', () => {
    monte('fr');
    expect(screen.getByText(/Awa D\./).textContent).toContain('octobre 2026');
  });
});
