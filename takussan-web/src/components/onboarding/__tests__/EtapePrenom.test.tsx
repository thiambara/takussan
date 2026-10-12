import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import frMessages from '@/messages/fr.json';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
}));

const setUser = vi.fn();
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 4, first_name: '', last_name: '' }, setUser }),
}));

const updateProfileAction = vi.fn();
vi.mock('@/app/actions/auth', () => ({
  updateProfileAction: (fd: FormData) => updateProfileAction(fd),
}));

import { EtapePrenom } from '../EtapePrenom';

const T = frMessages.onboarding.intention.name;

function monter() {
  return render(
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      <EtapePrenom />
    </NextIntlClientProvider>,
  );
}

/** TCK-624 — le prénom demandé à la porte de sortie, une fois, à un compte né sans nom. */
describe('<EtapePrenom>', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exige le prénom, sans appeler l’API', async () => {
    const user = userEvent.setup();
    monter();

    await user.click(screen.getByRole('button', { name: T.submit }));

    expect(await screen.findByRole('alert')).toHaveTextContent(T.required);
    expect(updateProfileAction).not.toHaveBeenCalled();
  });

  it('enregistre prénom et nom, met le compte à jour, puis laisse la page décider de la suite', async () => {
    updateProfileAction.mockResolvedValue({ ok: true, user: { first_name: 'Awa', last_name: '' } });
    const user = userEvent.setup();
    monter();

    await user.type(screen.getByLabelText(T.firstName), '  Awa ');
    await user.click(screen.getByRole('button', { name: T.submit }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    const fd = updateProfileAction.mock.calls[0]![0] as FormData;
    expect(fd.get('first_name')).toBe('Awa');
    expect(fd.get('last_name')).toBe('');
    expect(setUser).toHaveBeenCalledWith(expect.objectContaining({ first_name: 'Awa' }));
  });

  it('dit l’échec et ne quitte pas l’écran', async () => {
    updateProfileAction.mockResolvedValue({ ok: false, message: 'Refusé.' });
    const user = userEvent.setup();
    monter();

    await user.type(screen.getByLabelText(T.firstName), 'Awa');
    await user.click(screen.getByRole('button', { name: T.submit }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Refusé.');
    expect(refresh).not.toHaveBeenCalled();
  });
});
