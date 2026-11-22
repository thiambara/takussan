import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { TradesMultiSelect } from '../TradesMultiSelect';

/**
 * TCK-2713 — le prestataire déclare les deux métiers qui servent les catégories `cleaning` et
 * `pest_control` : sans eux, ces demandes n'avaient aucun prestataire suggéré.
 */
describe('TradesMultiSelect — métiers neufs (TCK-2713)', () => {
  it('propose « Nettoyage » et « Désinsectisation », libellés, et les rend cochables', async () => {
    const onChange = vi.fn();
    render(withIntl(<TradesMultiSelect value={[]} onChange={onChange} />));

    await userEvent.click(screen.getByRole('checkbox', { name: 'Nettoyage' }));
    expect(onChange).toHaveBeenLastCalledWith(['cleaning']);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Désinsectisation' }));
    expect(onChange).toHaveBeenLastCalledWith(['pest_control']);
  });
});
