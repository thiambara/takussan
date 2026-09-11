import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { conditionValues } from '@/lib/schemas/property';
import { NewBuildChip, porteUnBadgeNeuf } from '../NewBuildChip';

/**
 * TCK-508 — le badge des cartes publiques. Ce qu'il garde : « Neuf » et « Sur plan » s'affichent,
 * et SURTOUT les trois autres états n'en portent aucun — « À rénover » posé sur une photo serait
 * un repoussoir, pas une information.
 */
describe('NewBuildChip (TCK-508)', () => {
  it('AC6 — un bien neuf porte « Neuf », un bien sur plan « Sur plan »', () => {
    const { unmount } = render(withIntl(<NewBuildChip condition="new" />));
    expect(screen.getByText('Neuf')).toBeInTheDocument();
    unmount();

    render(withIntl(<NewBuildChip condition="off_plan" />));
    expect(screen.getByText('Sur plan')).toBeInTheDocument();
  });

  it('AC6 — « À rénover », « Bon état », « Rénové » et l’absence d’état ne rendent rien', () => {
    for (const condition of ['to_renovate', 'good', 'renovated', null, undefined] as const) {
      const { container, unmount } = render(withIntl(<NewBuildChip condition={condition} />));
      expect(container.textContent, String(condition)).toBe('');
      unmount();
    }
  });

  it('deux des cinq états exactement sont un argument de vente', () => {
    expect(conditionValues.filter(porteUnBadgeNeuf)).toEqual(['off_plan', 'new']);
  });
});
