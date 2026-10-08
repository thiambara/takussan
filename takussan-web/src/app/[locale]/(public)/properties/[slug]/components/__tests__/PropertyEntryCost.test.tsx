import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { PropertyEntryCost } from '../PropertyEntryCost';

/**
 * TCK-598 (V9, AC8) — le bloc « Coût d'entrée » de la fiche. Le total affiché est celui de l'API :
 * le test lui donne un total que les lignes ne permettraient pas de retrouver, pour qu'une addition
 * refaite côté front se voie.
 */
const NBSP = /[  ]/g;
const texte = (el: HTMLElement) => (el.textContent ?? '').replace(NBSP, ' ');

describe('<PropertyEntryCost>', () => {
  it('une ligne par poste renseigné, et le total de l’API mis en évidence', () => {
    render(
      withIntl(
        <PropertyEntryCost
          currency="XOF"
          entryCost={{ advance_months: 2, deposit_months: 2, agency_fee_months: 1, monthly_charges: 10_000, total: 1_520_000 }}
        />,
      ),
    );

    expect(screen.getByRole('heading', { name: 'Coût d’entrée'.replace('’', "'") })).toBeInTheDocument();
    expect(screen.getByText('Avance')).toBeInTheDocument();
    expect(screen.getByText('Caution')).toBeInTheDocument();
    expect(screen.getByText("Frais d'agence")).toBeInTheDocument();
    expect(screen.getAllByText('2 mois')).toHaveLength(2);
    expect(screen.getByText('1 mois')).toBeInTheDocument();
    expect(texte(screen.getByText(/10 000/))).toContain('10 000');
    expect(screen.getByText("Total à l'entrée")).toBeInTheDocument();
    expect(texte(screen.getByTestId('cout-d-entree-total'))).toContain('1 520 000');
  });

  it('le total n’est PAS recalculé : il est rendu tel que l’API le donne', () => {
    render(
      withIntl(
        <PropertyEntryCost
          currency="XOF"
          entryCost={{ advance_months: 1, deposit_months: null, agency_fee_months: null, monthly_charges: null, total: 123_456 }}
        />,
      ),
    );
    expect(texte(screen.getByTestId('cout-d-entree-total'))).toContain('123 456');
    // Un poste non renseigné n'a pas de ligne.
    expect(screen.queryByText('Caution')).not.toBeInTheDocument();
  });

  it('un demi-mois de frais se lit « 0,5 mois »', () => {
    render(
      withIntl(
        <PropertyEntryCost
          currency="XOF"
          entryCost={{ advance_months: null, deposit_months: null, agency_fee_months: 0.5, monthly_charges: null, total: 75_001 }}
        />,
      ),
    );
    expect(screen.getByText('0,5 mois')).toBeInTheDocument();
  });

  it('`null` : le bloc est absent, pas affiché à zéro', () => {
    const { container } = render(withIntl(<PropertyEntryCost currency="XOF" entryCost={null} />));
    expect(container).toBeEmptyDOMElement();
  });
});
