import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { withIntl, type LocaleDeTest } from '@/test/intl';
import type { PublicReview } from '../ReviewsSection';

/**
 * TCK-2522 (contre-vérification du 2026-11-09) — un avis de fiche dit d'où il parle, comme la
 * maquette (`?p=agence&a=d`, onglet Avis) : « Locataire · bail ». L'API sert le TYPE de la preuve
 * (`context_kind`) et lui seul ; sans contexte, aucune ligne — ni un libellé vide, ni la clé brute.
 */

vi.mock('@/components/reports/ReviewReportButton', () => ({ ReviewReportButton: () => null }));

import { ReviewsSection } from '../ReviewsSection';

function avis(id: number, context_kind: PublicReview['context_kind']): PublicReview {
  return {
    id,
    rating: 5,
    title: null,
    content: `Avis ${id}.`,
    author: { name: 'Moussa Sarr' },
    created_at: '2026-10-12T10:00:00+00:00',
    context_kind,
  };
}

function monte(reviews: PublicReview[], locale: LocaleDeTest = 'fr') {
  return render(withIntl(<ReviewsSection average={5} count={reviews.length} reviews={reviews} />, locale));
}

describe('<ReviewsSection> — le contexte de l’avis (TCK-2522)', () => {
  it.each([
    ['lease', 'Locataire · bail'],
    ['booking', 'Voyageur · séjour'],
    ['visit', 'Visiteur · visite'],
    ['maintenance_request', 'Demandeur · intervention'],
  ] as const)('« %s » s’écrit « %s »', (kind, libelle) => {
    monte([avis(1, kind)]);
    expect(screen.getByText(libelle)).toBeInTheDocument();
  });

  it('se traduit sous /en', () => {
    monte([avis(1, 'lease')], 'en');
    expect(screen.getByText('Tenant · lease')).toBeInTheDocument();
  });

  it('n’écrit rien quand le contexte est absent, nul ou inconnu', () => {
    const { container } = monte([
      avis(1, null),
      { ...avis(2, null), context_kind: undefined },
      avis(3, 'inconnu' as PublicReview['context_kind']),
    ]);
    expect(container.querySelectorAll('[data-contexte-avis]')).toHaveLength(0);
    expect(container.textContent).not.toMatch(/Locataire|Voyageur|Visiteur|Demandeur|inconnu|context/);
    // La ligne d'auteur reste entière, sans séparateur orphelin.
    for (const ligne of container.querySelectorAll('[data-auteur-avis]')) {
      expect(ligne.textContent?.trim()).not.toMatch(/·$/);
    }
  });

  it('pose le contexte sur la ligne de l’auteur, après le mois', () => {
    const { container } = monte([avis(1, 'lease')]);
    const ligne = container.querySelector('[data-auteur-avis]');
    expect(ligne?.textContent).toBe('Moussa S. · octobre 2026 · Locataire · bail');
  });
});
