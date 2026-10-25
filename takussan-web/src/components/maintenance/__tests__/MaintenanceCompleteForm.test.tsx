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
 * TCK-592 (P15, AC20) — une photo de fin dont l'envoi échoue ne laisse pas la demande « terminée »
 * sans preuve : l'échec s'affiche et la transition n'a pas lieu.
 *
 * TCK-2330 (P222.02) — les photos partent UNE À UNE par `/photos` (`completion_photos`), AVANT
 * `/complete`, qui n'en porte plus. Le lot entier dans un corps dépassait la borne du proxy
 * (25 Mio) dès 19 photos réduites, et `max_file_uploads` (20) l'amputait en silence.
 */
describe('<MaintenanceCompleteForm>', () => {
  beforeEach(() => {
    complete.mutateAsync.mockReset();
    upload.mutateAsync.mockReset();
  });

  function choosePhotos(count = 1) {
    const photos = Array.from(
      { length: count },
      (_, i) => new File(['x'], `apres-${i + 1}.jpg`, { type: 'image/jpeg' }),
    );
    fireEvent.change(screen.getByLabelText('Photos après intervention'), { target: { files: photos } });
    return photos;
  }

  it('envoie chaque photo seule par /photos, puis termine sans photo', async () => {
    upload.mutateAsync.mockResolvedValue({ data: [] });
    complete.mutateAsync.mockResolvedValue({ data: {} });
    render(withIntl(<MaintenanceCompleteForm id={7} onClose={() => undefined} />));
    const [premiere, seconde] = choosePhotos(2);

    fireEvent.click(screen.getByRole('button', { name: 'Marquer terminé' }));

    await waitFor(() => expect(complete.mutateAsync).toHaveBeenCalledTimes(1));
    expect(upload.mutateAsync.mock.calls.map(([v]) => v)).toEqual([
      { id: 7, files: [premiere], collection: 'completion_photos' },
      { id: 7, files: [seconde], collection: 'completion_photos' },
    ]);
    expect(complete.mutateAsync.mock.calls[0][0].photos).toBeUndefined();
    expect(upload.mutateAsync.mock.invocationCallOrder[1]).toBeLessThan(
      complete.mutateAsync.mock.invocationCallOrder[0],
    );
  });

  it('s\'arrête au premier échec : rien n\'est terminé, et seules les photos non envoyées restent', async () => {
    upload.mutateAsync
      .mockResolvedValueOnce({ data: [] })
      .mockRejectedValueOnce(new ApiError(500, { message: 'Erreur serveur' }));
    const onClose = vi.fn();
    render(withIntl(<MaintenanceCompleteForm id={7} onClose={onClose} />));
    const [, seconde, troisieme] = choosePhotos(3);

    fireEvent.click(screen.getByRole('button', { name: 'Marquer terminé' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(upload.mutateAsync).toHaveBeenCalledTimes(2);
    expect(complete.mutateAsync).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('2 photos sélectionnées.')).toBeInTheDocument();

    // Réessayer ne renvoie pas la photo déjà jointe.
    upload.mutateAsync.mockResolvedValue({ data: [] });
    complete.mutateAsync.mockResolvedValue({ data: {} });
    fireEvent.click(screen.getByRole('button', { name: 'Marquer terminé' }));

    await waitFor(() => expect(complete.mutateAsync).toHaveBeenCalledTimes(1));
    expect(upload.mutateAsync.mock.calls.slice(2).map(([v]) => v.files)).toEqual([[seconde], [troisieme]]);
  });

  it('un échec de la complétion s\'affiche, et réessayer ne renvoie pas les photos déjà jointes', async () => {
    upload.mutateAsync.mockResolvedValue({ data: [] });
    complete.mutateAsync.mockRejectedValueOnce(new ApiError(500, { message: 'Erreur serveur' }));
    const onClose = vi.fn();
    render(withIntl(<MaintenanceCompleteForm id={7} onClose={onClose} />));
    choosePhotos(1);

    fireEvent.click(screen.getByRole('button', { name: 'Marquer terminé' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(upload.mutateAsync).toHaveBeenCalledTimes(1);

    complete.mutateAsync.mockResolvedValue({ data: {} });
    fireEvent.click(screen.getByRole('button', { name: 'Marquer terminé' }));

    await waitFor(() => expect(complete.mutateAsync).toHaveBeenCalledTimes(2));
    expect(upload.mutateAsync).toHaveBeenCalledTimes(1);
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
