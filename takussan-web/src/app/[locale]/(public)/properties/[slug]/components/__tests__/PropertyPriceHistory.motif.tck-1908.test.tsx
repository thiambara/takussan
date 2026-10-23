import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { withIntl, type LocaleDeTest } from '@/test/intl';

import { PropertyPriceHistory } from '../PropertyPriceHistory';

/**
 * TCK-1908 (piste P196.02) — le motif d'un changement de prix se lit en mots sur la fiche publique.
 *
 * La fiche rendait `item.reason` tel quel : sur une base seedée, le visiteur lisait
 * `market_adjustment`. L'assertion qui compte est la négative — le code brut absent de l'écran —,
 * et la positive empêche qu'elle passe parce que le motif aurait disparu. Un code que l'API
 * ajouterait sans libellé reste affiché brut, comme dans `PropertyPriceHistoryList`.
 */

function historique(reason: string | null, locale: LocaleDeTest = 'fr') {
  return render(
    withIntl(
      <PropertyPriceHistory
        history={[
          {
            id: 1,
            old_price: 150_000,
            new_price: 140_000,
            currency: 'XOF',
            reason,
            changed_at: '2026-10-12T10:00:00Z',
          },
        ]}
      />,
      locale,
    ),
  );
}

describe('<PropertyPriceHistory> — le motif est traduit (TCK-1908)', () => {
  it('en français, `market_adjustment` se lit « Ajustement au marché », jamais en code', () => {
    historique('market_adjustment');
    expect(screen.getByText('Ajustement au marché')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('market_adjustment');
  });

  it('en anglais, le motif suit la langue de la page', () => {
    historique('negotiation', 'en');
    expect(screen.getByText('Negotiation')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('negotiation');
  });

  it('un code inconnu reste affiché tel quel, en repli', () => {
    historique('code_inconnu');
    expect(screen.getByText('code_inconnu')).toBeInTheDocument();
  });
});
