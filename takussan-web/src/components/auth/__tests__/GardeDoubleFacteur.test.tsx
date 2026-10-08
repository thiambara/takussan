import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { ApiError } from '@/lib/api';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { GardeDoubleFacteur } from '../GardeDoubleFacteur';
import { useGardeDoubleFacteur } from '../garde-double-facteur-contexte';

/**
 * TCK-589 — un refus « second facteur » se résout sur place, puis l'action est rejouée.
 */
const apiRequestMock = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));
const logoutMock = vi.fn();
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'jeton', refreshUser: vi.fn(), logout: logoutMock }),
}));
vi.mock('@/app/actions/security', () => ({
  twoFactorEnableAction: vi.fn(),
  twoFactorConfirmAction: vi.fn(),
}));

const action = vi.fn();

function Bouton() {
  const garde = useGardeDoubleFacteur();
  const [etat, setEtat] = useState('');
  return (
    <>
      <button
        type="button"
        onClick={() => {
          avecGardeDoubleFacteur(action, garde).then(
            () => setEtat('fait'),
            () => setEtat('refusé'),
          );
        }}
      >
        Publier
      </button>
      <output>{etat}</output>
    </>
  );
}

beforeEach(() => {
  action.mockReset();
  apiRequestMock.mockReset();
  logoutMock.mockReset();
});

describe('GardeDoubleFacteur', () => {
  it('step-up : un jeton révoqué après trop d’échecs ferme la session sans rejouer', async () => {
    const user = userEvent.setup();
    action.mockRejectedValueOnce(new ApiError(403, { code: 'two_factor_step_up_required' }));
    apiRequestMock.mockRejectedValue(new ApiError(401, { code: 'two_factor_step_up_revoked' }));
    render(withIntl(<GardeDoubleFacteur><Bouton /></GardeDoubleFacteur>));

    await user.click(screen.getByRole('button', { name: 'Publier' }));
    await user.type(await screen.findByLabelText('Code à 6 chiffres'), '000000');
    await user.click(screen.getByRole('button', { name: 'Confirmer' }));

    expect(
      await screen.findByText('Trop de codes invalides : cette session est fermée. Reconnectez-vous.'),
    ).toBeInTheDocument();
    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('step-up : demande le code, le vérifie, puis rejoue l’action', async () => {
    const user = userEvent.setup();
    action
      .mockRejectedValueOnce(new ApiError(403, { code: 'two_factor_step_up_required' }))
      .mockResolvedValueOnce('ok');
    apiRequestMock.mockResolvedValue({ data: { valid_until: '2026-10-07T12:10:00Z' } });
    render(withIntl(<GardeDoubleFacteur><Bouton /></GardeDoubleFacteur>));

    await user.click(screen.getByRole('button', { name: 'Publier' }));
    expect(await screen.findByText('Confirmez que c’est bien vous')).toBeInTheDocument();
    const champ = screen.getByLabelText('Code à 6 chiffres');
    expect(champ).toHaveAttribute('autocomplete', 'one-time-code');
    expect(champ).toHaveAttribute('inputmode', 'numeric');
    await user.type(champ, '123456');
    await user.click(screen.getByRole('button', { name: 'Confirmer' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('fait'));
    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/auth/two-factor/step-up',
      expect.objectContaining({ method: 'POST', body: { code: '123456' }, token: 'jeton' }),
    );
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('code refusé (422) : message explicite, la boîte reste ouverte, rien n’est rejoué', async () => {
    const user = userEvent.setup();
    action.mockRejectedValue(new ApiError(403, { code: 'two_factor_step_up_required' }));
    apiRequestMock.mockRejectedValue(new ApiError(422, { message: 'invalid' }));
    render(withIntl(<GardeDoubleFacteur><Bouton /></GardeDoubleFacteur>));

    await user.click(screen.getByRole('button', { name: 'Publier' }));
    await user.type(await screen.findByLabelText('Code à 6 chiffres'), '000000');
    await user.click(screen.getByRole('button', { name: 'Confirmer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ce code n’est pas valide');
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('annuler : l’erreur d’origine remonte', async () => {
    const user = userEvent.setup();
    action.mockRejectedValue(new ApiError(403, { code: 'two_factor_step_up_required' }));
    render(withIntl(<GardeDoubleFacteur><Bouton /></GardeDoubleFacteur>));

    await user.click(screen.getByRole('button', { name: 'Publier' }));
    await user.click(await screen.findByRole('button', { name: 'Annuler' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('refusé'));
  });

  it('second facteur requis : l’enrôlement s’ouvre sur place, sans « Plus tard »', async () => {
    const user = userEvent.setup();
    action.mockRejectedValue(new ApiError(403, { code: 'two_factor_required' }));
    render(withIntl(<GardeDoubleFacteur><Bouton /></GardeDoubleFacteur>));

    await user.click(screen.getByRole('button', { name: 'Publier' }));

    expect(await screen.findByText('Activez la double authentification')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Configurer maintenant' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Plus tard' })).not.toBeInTheDocument();
  });
});
