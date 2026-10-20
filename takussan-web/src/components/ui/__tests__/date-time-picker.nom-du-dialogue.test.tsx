import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DateTimePicker } from '../date-time-picker';
import { withIntl } from '@/test/intl';

/**
 * TCK-1034 (piste P68.05) — le popover du sélecteur de date et d'heure rendait `role="dialog"`
 * sans nom accessible (axe `aria-dialog-name`). Il porte désormais le nom de son déclencheur :
 * l'`aria-label` reçu quand l'appelant en passe un, sinon le texte du déclencheur par
 * `aria-labelledby` (5 des 6 appelants ne passent pas d'`aria-label`).
 */
describe('<DateTimePicker> — nom du dialogue', () => {
  it('nomme le popover par l’aria-label reçu', async () => {
    const user = userEvent.setup();
    render(withIntl(
      <DateTimePicker value="" onValueChange={vi.fn()} aria-label="Date de début" />,
    ));

    await user.click(screen.getByRole('button', { name: 'Date de début' }));
    // Le popover est bien ouvert : c'est son NOM qui est en cause, pas son montage.
    await screen.findByRole('dialog');

    expect(await screen.findByRole('dialog', { name: 'Date de début' })).toBeInTheDocument();
  });

  it('nomme le popover par le texte du déclencheur, sans aria-label', async () => {
    const user = userEvent.setup();
    render(withIntl(
      <DateTimePicker value="" onValueChange={vi.fn()} placeholder="Échéance de la tâche" />,
    ));

    await user.click(screen.getByRole('button', { name: 'Échéance de la tâche' }));

    expect(await screen.findByRole('dialog', { name: 'Échéance de la tâche' })).toBeInTheDocument();
  });
});
