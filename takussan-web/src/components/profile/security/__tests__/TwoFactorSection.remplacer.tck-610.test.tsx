import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { withIntl } from '@/test/intl';
import { TwoFactorSection } from '../TwoFactorSection';

/**
 * TCK-610 (AC5) — un compte à 2FA remplace son appareil : le geste s'explique, `enable` passe par la
 * garde du step-up (l'API l'exige sur une 2FA active), le QR du NOUVEL appareil s'affiche, `confirm`
 * le prouve. Que l'ancien code ne passe plus est prouvé côté API (`TwoFactorRenewalTest`).
 */
const actions = vi.hoisted(() => ({
  twoFactorConfirmAction: vi.fn(),
  twoFactorDisableAction: vi.fn(),
  twoFactorEnableAction: vi.fn(),
  twoFactorRegenerateAction: vi.fn(),
}));
vi.mock('@/app/actions/security', () => actions);
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ refreshUser: vi.fn() }) }));

const REFUS = { ok: false, message: 'Second facteur requis.', code: 'two_factor_step_up_required' } as const;
const NOUVEAU = { ok: true, data: { secret: 'NOUVEAUSECRET', qr_url: 'otpauth://totp/x', qr_svg: null } } as const;

function monter(garde: GardeDoubleFacteurFn = vi.fn().mockResolvedValue(true)) {
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

describe('<TwoFactorSection> — remplacer l’appareil (TCK-610)', () => {
  it('le geste s’explique avant tout appel : l’ancien appareil cesse de marcher à la confirmation', async () => {
    monter();
    await userEvent.setup().click(screen.getByRole('button', { name: "Remplacer l'appareil" }));

    expect(screen.getByText(/l'ancien appareil cesse de fonctionner/)).toBeInTheDocument();
    expect(actions.twoFactorEnableAction).not.toHaveBeenCalled();
  });

  it('step-up, nouveau QR, confirmation : nouveaux codes de secours et appareil remplacé', async () => {
    actions.twoFactorEnableAction.mockResolvedValueOnce(REFUS).mockResolvedValueOnce(NOUVEAU);
    actions.twoFactorConfirmAction.mockResolvedValue({
      ok: true,
      data: { enabled: true, renewed: true, recovery_codes: ['NEUF1-NEUF2'] },
    });
    const garde = vi.fn().mockResolvedValue(true);
    monter(garde);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: "Remplacer l'appareil" }));
    await user.click(screen.getByRole('button', { name: 'Continuer' }));

    await waitFor(() => expect(screen.getByText('NOUVEAUSECRET')).toBeInTheDocument());
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
    expect(actions.twoFactorEnableAction).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Scannez ce code avec le nouvel appareil.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Code à 6 chiffres'), '654321');
    await user.click(screen.getByRole('button', { name: 'Confirmer le nouvel appareil' }));

    await waitFor(() => expect(screen.getByText('NEUF1-NEUF2')).toBeInTheDocument());
    expect(actions.twoFactorConfirmAction).toHaveBeenCalledWith('654321');
    expect(screen.getByText(/Appareil remplacé/)).toBeInTheDocument();
  });

  it('step-up refusé : aucun QR, l’explication reste avec le message du refus', async () => {
    actions.twoFactorEnableAction.mockResolvedValue(REFUS);
    monter(vi.fn().mockResolvedValue(false));
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: "Remplacer l'appareil" }));
    await user.click(screen.getByRole('button', { name: 'Continuer' }));

    await waitFor(() => expect(screen.getByText('Second facteur requis.')).toBeInTheDocument());
    expect(screen.queryByText('NOUVEAUSECRET')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeInTheDocument();
  });

  it('abandonner après le QR : retour aux gestes d’un facteur actif, rien n’est confirmé', async () => {
    actions.twoFactorEnableAction.mockResolvedValue(NOUVEAU);
    monter();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: "Remplacer l'appareil" }));
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    await waitFor(() => expect(screen.getByText('NOUVEAUSECRET')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByText('NOUVEAUSECRET')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Remplacer l'appareil" })).toBeInTheDocument();
    expect(actions.twoFactorConfirmAction).not.toHaveBeenCalled();
  });
});
