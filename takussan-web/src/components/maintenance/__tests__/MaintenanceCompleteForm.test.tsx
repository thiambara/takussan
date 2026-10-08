import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { ApiError } from '@/lib/api';
import { MaintenanceCompleteForm } from '../MaintenanceCompleteForm';

const complete = { mutateAsync: vi.fn(), isPending: false };
const upload = { mutateAsync: vi.fn(), isPending: false };

vi.mock('@/lib/queries/maintenance', () => ({
  useCompleteMaintenanceRequest: () => complete,
  useUploadMaintenancePhotos: () => upload,
}));

// La réduction passe par un canvas, que jsdom n'a pas : les fichiers passent tels quels.
vi.mock('@/lib/reduire-photo', () => ({
  reduirePhotos: async (files: File[]) => files,
}));

/**
 * TCK-592 (P15, AC20) — les photos de fin voyagent DANS `PUT …/complete`. Elles partaient après la
 * transition par un second appel dont l'échec était avalé.
 */
describe('<MaintenanceCompleteForm>', () => {
  beforeEach(() => {
    complete.mutateAsync.mockReset();
    upload.mutateAsync.mockReset();
  });

  function choosePhoto() {
    const photo = new File(['x'], 'apres.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Photos après intervention'), { target: { files: [photo] } });
    return photo;
  }

  it('envoie les photos dans la complétion, sans requête d\'upload séparée', async () => {
    complete.mutateAsync.mockResolvedValue({ data: {} });
    render(withIntl(<MaintenanceCompleteForm id={7} onClose={() => undefined} />));
    const photo = choosePhoto();

    fireEvent.click(screen.getByRole('button', { name: 'Marquer terminé' }));

    await waitFor(() => expect(complete.mutateAsync).toHaveBeenCalledTimes(1));
    expect(complete.mutateAsync.mock.calls[0][0].photos).toEqual([photo]);
    expect(upload.mutateAsync).not.toHaveBeenCalled();
  });

  it('un échec de la complétion s\'affiche et garde les fichiers choisis', async () => {
    complete.mutateAsync.mockRejectedValue(new ApiError(500, { message: 'Erreur serveur' }));
    const onClose = vi.fn();
    render(withIntl(<MaintenanceCompleteForm id={7} onClose={onClose} />));
    choosePhoto();

    fireEvent.click(screen.getByRole('button', { name: 'Marquer terminé' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('1 photo sélectionnée.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(upload.mutateAsync).not.toHaveBeenCalled();
  });

  // verif-592, M1 — le coût réel est au donneur d'ordre : le prestataire ne le voit ni ne l'envoie.
  it('sans withCost (prestataire), aucun champ de coût et aucun coût envoyé', async () => {
    complete.mutateAsync.mockResolvedValue({ data: {} });
    render(withIntl(<MaintenanceCompleteForm id={7} onClose={() => undefined} />));

    expect(screen.queryByLabelText('Coût réel')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Marquer terminé' }));

    await waitFor(() => expect(complete.mutateAsync).toHaveBeenCalledTimes(1));
    expect(complete.mutateAsync.mock.calls[0][0].actual_cost).toBeUndefined();
  });

  it('avec withCost (donneur d\'ordre), le coût réel se saisit', () => {
    render(withIntl(<MaintenanceCompleteForm id={7} onClose={() => undefined} withCost />));

    expect(screen.getByLabelText('Coût réel')).toBeInTheDocument();
  });
});
