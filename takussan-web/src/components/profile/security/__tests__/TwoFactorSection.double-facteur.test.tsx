import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { withIntl } from '@/test/intl';
import { TwoFactorSection } from '../TwoFactorSection';

/**
 * TCK-1203 — régénérer les codes de secours exige un TOTP récent (`TwoFactorController@
 * regenerateRecoveryCodes`, liste `STEP_UP`). L'action serveur perdait le `code` du refus, et
 * l'écran affichait « code requis » sans champ pour le saisir.
 */
const actions = vi.hoisted(() => ({
  twoFactorConfirmAction: vi.fn(),
  twoFactorDisableAction: vi.fn(),
  twoFactorEnableAction: vi.fn(),
  twoFactorRegenerateAction: vi.fn(),
}));
vi.mock('@/app/actions/security', () => actions);

const REFUS = { ok: false, message: 'Second facteur requis.', code: 'two_factor_step_up_required' } as const;

function monter(garde: GardeDoubleFacteurFn) {
  render(
    withIntl(
      <ContexteGardeDoubleFacteur.Provider value={garde}>
        <TwoFactorSection enabled />
      </ContexteGardeDoubleFacteur.Provider>,
    ),
  );
}

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
});

describe('<TwoFactorSection> — second facteur', () => {
  it('la régénération : la garde s’ouvre, puis la régénération est rejouée', async () => {
    actions.twoFactorRegenerateAction
      .mockResolvedValueOnce(REFUS)
      .mockResolvedValueOnce({ ok: true, data: { recovery_codes: ['AAAA-BBBB'] } });
    const garde = vi.fn().mockResolvedValue(true);
    monter(garde);

    await userEvent.setup().click(screen.getByRole('button', { name: /Régénérer/ }));

    await waitFor(() => expect(screen.getByText('AAAA-BBBB')).toBeInTheDocument());
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
    expect(actions.twoFactorRegenerateAction).toHaveBeenCalledTimes(2);
  });

  it('la garde refusée : le message du refus reste affiché, rien n’est rejoué', async () => {
    actions.twoFactorRegenerateAction.mockResolvedValue(REFUS);
    const garde = vi.fn().mockResolvedValue(false);
    monter(garde);

    await userEvent.setup().click(screen.getByRole('button', { name: /Régénérer/ }));

    await waitFor(() => expect(screen.getByText('Second facteur requis.')).toBeInTheDocument());
    expect(actions.twoFactorRegenerateAction).toHaveBeenCalledTimes(1);
  });
});
