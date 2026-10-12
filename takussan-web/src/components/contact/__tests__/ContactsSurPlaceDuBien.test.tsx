/**
 * TCK-633 (lot C, vérification adverse) — les contacts sur place d'une annonce EXISTANTE : lus
 * (`GET …/contacts`), corrigés, retirés puis enregistrés d'un bloc (`PUT …/contacts`). Ils ne se
 * posaient qu'à la création.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { withIntl } from '@/test/intl';
import { ContactsSurPlaceDuBien } from '../ContactsSurPlaceDuBien';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }),
}));
const lireContactsDuBien = vi.fn();
vi.mock('../contacts-du-bien', async (original) => ({
  ...(await original<typeof import('../contacts-du-bien')>()),
  lireContactsDuBien: (...a: unknown[]) => lireContactsDuBien(...a),
}));
const replacePropertyContactsAction = vi.fn();
vi.mock('@/app/actions/property-contacts', () => ({
  replacePropertyContactsAction: (...a: unknown[]) => replacePropertyContactsAction(...a),
}));

const gardien = { label: 'Gardien', phone: '+221770000803', has_whatsapp: true };
const voisine = { label: 'Voisine', phone: '+221770000804', has_whatsapp: false };

function rendu() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={client}>
      <ContactsSurPlaceDuBien propertyId={7} />
    </QueryClientProvider>,
  ));
}

describe('<ContactsSurPlaceDuBien> — TCK-633', () => {
  beforeEach(() => {
    lireContactsDuBien.mockReset();
    replacePropertyContactsAction.mockReset();
  });

  it('lit les contacts déjà posés sur l’annonce', async () => {
    lireContactsDuBien.mockResolvedValue([gardien, voisine]);
    rendu();

    expect(await screen.findByDisplayValue('Gardien')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Voisine')).toBeInTheDocument();
    expect(lireContactsDuBien).toHaveBeenCalledWith('jeton', 7);
    // Rien n'a changé : rien à enregistrer.
    expect(screen.getByRole('button', { name: 'Enregistrer les contacts' })).toBeDisabled();
  });

  it('corrige un contact puis enregistre la liste entière', async () => {
    lireContactsDuBien.mockResolvedValue([gardien, voisine]);
    replacePropertyContactsAction.mockResolvedValue({ ok: true });
    rendu();

    fireEvent.change(await screen.findByDisplayValue('Gardien'), { target: { value: 'Gardien de nuit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les contacts' }));

    await waitFor(() => expect(replacePropertyContactsAction).toHaveBeenCalledWith(7, [
      { ...gardien, label: 'Gardien de nuit' },
      voisine,
    ]));
    expect(await screen.findByText('Contacts sur place enregistrés.')).toBeInTheDocument();
  });

  it('retire un contact, et le retrait s’enregistre', async () => {
    lireContactsDuBien.mockResolvedValue([gardien, voisine]);
    replacePropertyContactsAction.mockResolvedValue({ ok: true });
    rendu();

    await screen.findByDisplayValue('Gardien');
    fireEvent.click(screen.getByRole('button', { name: 'Retirer le contact 1' }));
    expect(screen.queryByDisplayValue('Gardien')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les contacts' }));

    await waitFor(() => expect(replacePropertyContactsAction).toHaveBeenCalledWith(7, [voisine]));
  });

  it('ajoute un contact à une annonce qui n’en a aucun', async () => {
    lireContactsDuBien.mockResolvedValue([]);
    replacePropertyContactsAction.mockResolvedValue({ ok: true });
    rendu();

    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter un contact' }));
    fireEvent.change(screen.getByLabelText('Qui ?'), { target: { value: 'Gardien' } });
    fireEvent.change(screen.getByLabelText('Numéro'), { target: { value: '770000803' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les contacts' }));

    await waitFor(() => expect(replacePropertyContactsAction).toHaveBeenCalledWith(7, [
      { label: 'Gardien', phone: '+221770000803', has_whatsapp: false },
    ]));
  });

  it('dit le refus du serveur et garde la saisie', async () => {
    lireContactsDuBien.mockResolvedValue([gardien]);
    replacePropertyContactsAction.mockResolvedValue({ ok: false, message: 'Ce numéro n’est pas joignable.' });
    rendu();

    fireEvent.change(await screen.findByDisplayValue('Gardien'), { target: { value: 'Concierge' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les contacts' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ce numéro n’est pas joignable.');
    expect(screen.getByDisplayValue('Concierge')).toBeInTheDocument();
  });

  // Correction du lot C, tour 2 — une lecture en échec (500, coupure) faisait disparaître le
  // panneau sans un mot : l'annonceur ignorait que ses contacts existaient, sans reprise possible.
  it('une lecture en échec se dit, et « Réessayer » relit', async () => {
    lireContactsDuBien
      .mockRejectedValueOnce(new ApiError(500, { message: 'Server Error' }))
      .mockResolvedValueOnce([gardien]);
    rendu();

    expect(await screen.findByRole('alert')).toHaveTextContent('Les contacts sur place n’ont pas pu être chargés.');
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByDisplayValue('Gardien')).toBeInTheDocument();
    expect(lireContactsDuBien).toHaveBeenCalledTimes(2);
  });

  it('un refus de lecture (403, 404) reste silencieux : la page l’aurait refusé', async () => {
    lireContactsDuBien.mockRejectedValue(new ApiError(403, { message: 'Forbidden' }));
    rendu();

    await waitFor(() => expect(lireContactsDuBien).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('contacts-du-bien-chargement')).not.toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByTestId('contacts-du-bien')).not.toBeInTheDocument();
  });
});
