import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { withIntl, type LocaleDeTest } from '@/test/intl';

/**
 * TCK-1781 (piste P175.05) — l'API rend `author.name` nul pour un auteur effacé ou sans nom : la
 * fiche publique d'agence et d'agent écrit le repli dans la langue du lecteur.
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
            author: { name: null },
            created_at: null,
          },
        ]}
      />,
      locale,
    ),
  );
}

describe('<ReviewsSection> — auteur sans nom (TCK-1781)', () => {
  it('écrit « Anonyme » en français', () => {
    monte('fr');
    expect(screen.getByText('Anonyme')).toBeInTheDocument();
  });

  it('écrit « Anonymous » en anglais', () => {
    monte('en');
    expect(screen.getByText('Anonymous')).toBeInTheDocument();
  });
});
