/**
 * TCK-2581 — « Créer sa fiche » depuis « Et maintenant ? » : le visiteur sans fiche arrive sur
 * `/app/customers/new?prenom=&nom=&telephone=`, et le formulaire part de ces valeurs (création
 * seulement ; un champ vide ne masque pas le défaut).
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { CustomerForm } from '../CustomerForm';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }) }));

const createCustomerAction = vi.fn();
vi.mock('@/app/actions/dashboard-customers', () => ({
  createCustomerAction: (...args: unknown[]) => createCustomerAction(...args),
  updateCustomerAction: vi.fn(),
}));

describe('CustomerForm — prérempli depuis la visite (TCK-2581)', () => {
  beforeEach(() => createCustomerAction.mockReset());

  it('part du prénom, du nom et du numéro du visiteur, et les envoie', async () => {
    createCustomerAction.mockResolvedValueOnce({ ok: true, data: { id: 9 } });
    const user = userEvent.setup();
    render(withIntl(<CustomerForm mode="create" initial={{ first_name: 'Mouhamed', last_name: 'Fall', phone: '+221770001122' }} onSuccess={vi.fn()} />));

    expect(screen.getByLabelText(/Prénom/)).toHaveValue('Mouhamed');
    expect(screen.getByLabelText(/^Nom/)).toHaveValue('Fall');
    await user.click(screen.getByRole('button', { name: 'Créer le client' }));
    await waitFor(() => expect(createCustomerAction).toHaveBeenCalledTimes(1));
    expect(createCustomerAction.mock.calls[0][0]).toMatchObject({ first_name: 'Mouhamed', last_name: 'Fall' });
    expect(String((createCustomerAction.mock.calls[0][0] as { phone?: string }).phone).replace(/\D/g, '')).toBe('221770001122');
  });

  it('un champ vide ne masque pas le défaut', () => {
    render(withIntl(<CustomerForm mode="create" initial={{ first_name: 'Mouhamed', last_name: '' }} onSuccess={vi.fn()} />));
    expect(screen.getByLabelText(/Prénom/)).toHaveValue('Mouhamed');
    expect(screen.getByLabelText(/^Nom/)).toHaveValue('');
  });
});
