import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { withIntl, type LocaleDeTest } from '@/test/intl';
import type { PropertyReviewsResponse } from '@/types/review';

/**
 * TCK-721 (piste P06.05) — les dates de la fiche publique suivent la langue de la page.
 *
 * `PropertyReviews` et `PropertyPriceHistory` formataient leurs dates par
 * `toLocaleDateString('fr-FR', …)`, quelle que soit la locale : sous `/en`, la fiche affichait
 * « 12 oct. 2026 ». L'assertion qui compte est la négative — en `en`, aucune forme française —,
 * et la positive en `fr` empêche qu'elle passe parce que la date aurait disparu.
 */

const LE_12_OCTOBRE = '2026-10-12T10:00:00Z';

const REPONSE: PropertyReviewsResponse = {
  data: [
    {
      id: 1,
      rating: 4,
      title: null,
      content: 'Très bon séjour.',
      author: { id: 9, name: 'Awa', avatar_url: null },
      reply_content: 'Merci !',
      replied_at: LE_12_OCTOBRE,
      created_at: LE_12_OCTOBRE,
    },
  ],
  meta: { total: 1, current_page: 1, average: 4, distribution: { 5: 0, 4: 1, 3: 0, 2: 0, 1: 0 } },
};

vi.mock('@/hooks/usePropertyReviews', () => ({
  usePropertyReviews: () => ({
    data: REPONSE,
    loading: false,
    error: null,
    submit: vi.fn(),
    reply: vi.fn(),
    refetch: vi.fn(),
  }),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/app/actions/property', () => ({ getReviewEligibility: vi.fn() }));
vi.mock('@/components/reports/ReviewReportButton', () => ({ ReviewReportButton: () => null }));

import { PropertyReviews } from '../PropertyReviews';
import { PropertyPriceHistory } from '../PropertyPriceHistory';

function avis(locale: LocaleDeTest) {
  return render(
    withIntl(
      <PropertyReviews slug="villa" propertyId={1} averageRating={4} reviewsCount={1} />,
      locale,
    ),
  );
}

function historique(locale: LocaleDeTest) {
  return render(
    withIntl(
      <PropertyPriceHistory
        history={[
          {
            id: 1,
            old_price: 150_000,
            new_price: 140_000,
            currency: 'XOF',
            reason: null,
            changed_at: LE_12_OCTOBRE,
          },
        ]}
      />,
      locale,
    ),
  );
}

/** Le texte des `<time>` rendus, espaces insécables normalisés. */
function dates(): string[] {
  return Array.from(document.querySelectorAll('time')).map((t) =>
    (t.textContent ?? '').replace(/\s/g, ' ').trim(),
  );
}

describe('<PropertyReviews> — la date des avis suit la langue (TCK-721)', () => {
  it('en anglais, la date de l’avis et celle de la réponse ne sont pas françaises', () => {
    avis('en');
    expect(screen.getByText('Awa')).toBeInTheDocument();
    expect(dates()).toEqual(['12 Oct 2026']);
    expect(screen.getByTestId('review-reply').textContent).toContain('12 Oct 2026');
    expect(document.body.textContent).not.toMatch(/oct\.|octobre/);
  });

  it('en français, la date reste française', () => {
    avis('fr');
    expect(dates()).toEqual(['12 oct. 2026']);
  });
});

describe('<PropertyPriceHistory> — la date d’un changement de prix suit la langue (TCK-721)', () => {
  it('en anglais, la date n’est pas française', () => {
    historique('en');
    expect(dates()).toEqual(['12 Oct 2026']);
    expect(document.body.textContent).not.toMatch(/oct\.|octobre/);
  });

  it('en français, la date reste française', () => {
    historique('fr');
    expect(dates()).toEqual(['12 oct. 2026']);
  });
});
