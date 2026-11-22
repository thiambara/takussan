/**
 * TCK-2819 (lot 3) — le repli de l'encadré « Coût d’entrée » (maquette a-3 : l'en-tête porte un chevron).
 *
 * La maquette ne dessine que l'état ouvert, sans dire quand l'encadré se ferme. Décision (lot 3) :
 * ouvert à chaque montage, l'état n'entre pas au brouillon, et le repli ne cache QUE les compteurs et
 * les charges — le total, ses composantes et la note restent lisibles (TCK-633 : on ne cache pas ce
 * que le locataire versera).
 *
 * | test | régression attrapée |
 * |---|---|
 * | ouvert au montage | un encadré qui s'ouvre fermé, compteurs invisibles à la première saisie |
 * | replier / rouvrir | un en-tête qui n'est pas un bouton, un `aria-expanded` qui ment |
 * | le total reste | un repli qui cache le total ou ses composantes (TCK-633) |
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';

import { withIntl } from '@/test/intl';
import type { PropertyFormValues } from '@/lib/schemas/property';
import { EncadreCoutDEntree } from '../wizard/EncadreCoutDEntree';

function monter() {
  function Harnais() {
    const form = useForm<PropertyFormValues>({
      defaultValues: {
        title: '', type: 'studio', contract_type: 'rent', rent_period: 'monthly', currency: 'XOF',
        city: 'Dakar', furnished: false, tag_ids: [], price: 250_000, advance_months: 2, deposit_months: 2,
      } as PropertyFormValues,
    });
    return <EncadreCoutDEntree form={form} />;
  }
  render(withIntl(<Harnais />));
  return within(screen.getByTestId('encadre-cout-d-entree'));
}

const enTete = () => screen.getByRole('button', { name: /coût d’entrée/i });

describe('EncadreCoutDEntree — le repli (maquette a-3, TCK-2819)', () => {
  it('ouvert au montage : l’en-tête est un bouton déplié, les compteurs se lisent', () => {
    const encadre = monter();
    expect(enTete()).toHaveAttribute('aria-expanded', 'true');
    expect(encadre.getByRole('spinbutton', { name: 'Mois d’avance' })).toBeVisible();
    expect(encadre.getByLabelText(/charges mensuelles/i)).toBeVisible();
  });

  it('replié : compteurs et charges disparaissent ; rouvert, ils reviennent avec leurs valeurs', async () => {
    const user = userEvent.setup();
    const encadre = monter();
    await user.click(enTete());
    expect(enTete()).toHaveAttribute('aria-expanded', 'false');
    // Cachés, non démontés : une erreur de saisie y resterait attachée, et la valeur ne bouge pas.
    expect(encadre.getByRole('spinbutton', { name: 'Mois d’avance', hidden: true })).not.toBeVisible();
    expect(encadre.getByLabelText(/charges mensuelles/i)).not.toBeVisible();
    expect(enTete()).toHaveAttribute('aria-controls', encadre.getByLabelText(/charges mensuelles/i).closest('[data-corps-du-cout]')?.id);

    await user.click(enTete());
    expect(enTete()).toHaveAttribute('aria-expanded', 'true');
    expect(encadre.getByRole('spinbutton', { name: 'Mois d’avance' })).toHaveAttribute('aria-valuenow', '2');
  });

  it('replié, le total, ses composantes et la note restent lisibles (TCK-633)', async () => {
    const user = userEvent.setup();
    const encadre = monter();
    await user.click(enTete());
    // (2 + 2) × 250 000 = 1 000 000.
    expect(encadre.getByTestId('total-a-l-entree')).toHaveTextContent(/^1\s000\s000\sF CFA$/);
    expect(encadre.getByText('2 mois d’avance, 2 mois de caution')).toBeVisible();
    expect(encadre.getByText(/fait foi/)).toBeVisible();
  });
});
