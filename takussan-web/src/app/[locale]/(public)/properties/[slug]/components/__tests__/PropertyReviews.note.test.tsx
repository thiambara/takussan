import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import {
  JETONS_CLAIR,
  JETONS_SOMBRE,
  SEUIL_NON_TEXTUEL,
  composer,
  contraste,
  fmt,
  litUtilitaireDeCouleur,
  resoudreCouleur,
  versRvb,
} from '@/test/contraste-wcag';
import type { PropertyReviewsResponse } from '@/types/review';

/**
 * TCK-660 (piste P07.04) — la note d'un avis se lit sans la vue.
 *
 * La note n'était portée que par cinq `<Star>`, que lucide marque `aria-hidden` : un lecteur
 * d'écran ne la rencontrait pas. Les étoiles vides, en `text-muted-foreground/40`, tombaient à
 * 1,78:1, sous les 3:1 d'un objet graphique (WCAG 2.2 §1.4.11).
 */

const REPONSE: PropertyReviewsResponse = {
  data: [
    {
      id: 1,
      rating: 4,
      title: null,
      content: 'Très bon séjour.',
      author: { id: 9, name: 'Awa', avatar_url: null },
      reply_content: null,
      replied_at: null,
      created_at: '2026-10-01T10:00:00Z',
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

function rendre(locale: 'fr' | 'en' = 'fr') {
  return render(
    withIntl(
      <PropertyReviews slug="villa" propertyId={1} averageRating={4} reviewsCount={1} />,
      locale,
    ),
  );
}

describe('<PropertyReviews> — la note de chaque avis', () => {
  it('porte un nom accessible qui dit la note', () => {
    rendre();
    expect(screen.getByRole('img', { name: '4 étoiles sur 5' })).toBeInTheDocument();
  });

  it('le nom suit la langue', () => {
    rendre('en');
    expect(screen.getByRole('img', { name: '4 stars out of 5' })).toBeInTheDocument();
  });

  for (const [theme, jetons] of [
    ['clair', JETONS_CLAIR],
    ['sombre', JETONS_SOMBRE],
  ] as const) {
    it(`les étoiles vides tiennent 3:1 sur la carte et sur la page, thème ${theme}`, () => {
      rendre();
      const etoiles = Array.from(screen.getByRole('listitem').querySelectorAll('svg.lucide-star'));
      expect(etoiles).toHaveLength(5);
      const vide = etoiles[4];
      const encre = Array.from(vide.classList)
        .map((c) => litUtilitaireDeCouleur(c, 'text'))
        .find((u) => u !== null && u.variante === '');
      expect(encre, 'étoile vide sans encre').toBeTruthy();
      for (const surface of ['card', 'background']) {
        const fond = versRvb(resoudreCouleur(surface, jetons));
        const trait = composer(versRvb(resoudreCouleur(encre!.jeton, jetons)), fond, encre!.alpha);
        const ratio = contraste(trait, fond);
        expect(ratio, `${theme}, sur --${surface} : ${fmt(ratio)}`).toBeGreaterThanOrEqual(
          SEUIL_NON_TEXTUEL,
        );
      }
    });
  }
});
