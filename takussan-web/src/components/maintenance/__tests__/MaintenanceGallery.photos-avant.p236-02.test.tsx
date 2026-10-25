import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { ApiError } from '@/lib/api';
import type { MaintenanceRequest } from '@/types/maintenance';
import { MaintenanceGallery } from '../MaintenanceGallery';

const upload = { mutateAsync: vi.fn(), isPending: false, isError: false, error: null };

vi.mock('@/lib/queries/maintenance', () => ({
  useUploadMaintenancePhotos: () => upload,
}));

// La réduction passe par un canvas, que jsdom n'a pas : les fichiers passent tels quels.
vi.mock('@/lib/reduire-photo', () => ({
  reduirePhotos: async (files: File[]) => files,
}));

/**
 * TCK-2370 (P236.02) — les photos « avant » du prestataire partaient en un seul `FormData` :
 * 19 photos réduites dépassent la borne du proxy (25 Mio). Elles partent une à une, comme la
 * clôture (TCK-2330) : le premier échec arrête tout et se dit, une photo jointe sort de la
 * sélection, et la borne de 20 se lit au sélecteur.
 */
const MO = 1024 * 1024;

function photos(n: number): File[] {
  return Array.from(
    { length: n },
    (_, i) => new File([new Uint8Array(1.4 * MO)], `avant-${i + 1}.jpg`, { type: 'image/jpeg' }),
  );
}

const demande = {
  id: 9,
  media: { photos: [], before_photos: [], completion_photos: [] },
  abilities: { can_upload_before_photos: true },
} as unknown as MaintenanceRequest;

function choisir(fichiers: File[]) {
  fireEvent.change(screen.getByLabelText('Photos avant intervention'), { target: { files: fichiers } });
}

describe('<MaintenanceGallery> — photos « avant » une à une (P236.02)', () => {
  beforeEach(() => {
    upload.mutateAsync.mockReset();
  });

  it('19 photos partent en 19 appels d’une photo chacun', async () => {
    upload.mutateAsync.mockResolvedValue({});
    render(withIntl(<MaintenanceGallery request={demande} />));
    const choisies = photos(19);
    choisir(choisies);

    fireEvent.click(screen.getByRole('button', { name: 'Envoyer 19 photos' }));

    await waitFor(() => expect(upload.mutateAsync).toHaveBeenCalledTimes(19));
    expect(upload.mutateAsync.mock.calls.map(([v]) => v)).toEqual(
      choisies.map((photo) => ({ id: 9, files: [photo], collection: 'before_photos' })),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled());
  });

  it('le premier échec arrête l’envoi, se dit, et réessayer n’envoie que le reste', async () => {
    upload.mutateAsync
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new ApiError(413, { code: 'payload_too_large' }));
    render(withIntl(<MaintenanceGallery request={demande} />));
    const [premiere, ...reste] = photos(4);
    choisir([premiere, ...reste]);

    fireEvent.click(screen.getByRole('button', { name: 'Envoyer 4 photos' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "L'envoi dépasse 25 Mo : envoyez moins de fichiers à la fois, ou des fichiers plus légers.",
    );
    expect(upload.mutateAsync).toHaveBeenCalledTimes(2);

    upload.mutateAsync.mockReset();
    upload.mutateAsync.mockResolvedValue({});
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer 3 photos' }));

    await waitFor(() => expect(upload.mutateAsync).toHaveBeenCalledTimes(3));
    expect(upload.mutateAsync.mock.calls.map(([v]) => v.files[0])).toEqual(reste);
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('la borne de 20 se lit sous le sélecteur', () => {
    render(withIntl(<MaintenanceGallery request={demande} />));
    expect(screen.getByLabelText('Photos avant intervention')).toHaveAccessibleDescription(
      '20 photos au plus.',
    );
  });

  it('21 photos sont refusées et dites, et rien ne part', () => {
    render(withIntl(<MaintenanceGallery request={demande} />));
    choisir(photos(21));

    expect(screen.getByRole('alert')).toHaveTextContent('21 photos choisies : 20 au plus. Choisissez-en moins.');
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled();
    expect(upload.mutateAsync).not.toHaveBeenCalled();
  });
});
