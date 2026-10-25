import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import { MaintenanceForm } from '../MaintenanceForm';

const routeur = { push: vi.fn(), back: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => routeur }));

const create = { mutateAsync: vi.fn(), isPending: false };
const upload = { mutateAsync: vi.fn(), isPending: false };

vi.mock('@/lib/queries/maintenance', () => ({
  useCreateMaintenanceRequest: () => create,
  useUploadMaintenancePhotos: () => upload,
}));

// La réduction passe par un canvas, que jsdom n'a pas : les fichiers passent tels quels.
vi.mock('@/lib/reduire-photo', () => ({
  reduirePhotos: async (files: File[]) => files,
}));

/**
 * TCK-2370 (P236.02) — les photos d'une demande neuve partaient en un seul `FormData` : 19 photos
 * réduites (1,4 Mo chacune, TCK-542) dépassent la borne du proxy (25 Mio). Elles partent une à
 * une, comme la clôture (TCK-2330), et la borne de 20 se lit au sélecteur.
 */
const MO = 1024 * 1024;

function photos(n: number): File[] {
  return Array.from(
    { length: n },
    (_, i) => new File([new Uint8Array(1.4 * MO)], `photo-${i + 1}.jpg`, { type: 'image/jpeg' }),
  );
}

function monter() {
  render(
    withIntl(
      <ToastProvider>
        <MaintenanceForm propertyId={3} />
        <Toaster />
      </ToastProvider>,
    ),
  );
  fireEvent.change(screen.getByLabelText(/Titre/), { target: { value: 'Fuite' } });
  fireEvent.change(screen.getByLabelText(/Description/), { target: { value: 'Sous l\'évier' } });
}

function choisir(fichiers: File[]) {
  fireEvent.change(screen.getByLabelText('Photos (optionnel)'), { target: { files: fichiers } });
}

describe('<MaintenanceForm> — photos une à une (P236.02)', () => {
  beforeEach(() => {
    routeur.push.mockReset();
    create.mutateAsync.mockReset();
    upload.mutateAsync.mockReset();
    create.mutateAsync.mockResolvedValue({ data: { id: 42 } });
  });

  it('19 photos partent en 19 appels d’une photo chacun, dans l’ordre', async () => {
    upload.mutateAsync.mockResolvedValue({});
    monter();
    const choisies = photos(19);
    choisir(choisies);
    fireEvent.click(screen.getByRole('button', { name: 'Signaler le problème' }));

    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/maintenance/42'));
    expect(upload.mutateAsync).toHaveBeenCalledTimes(19);
    expect(upload.mutateAsync.mock.calls.map(([v]) => v)).toEqual(
      choisies.map((photo) => ({ id: 42, files: [photo], collection: 'photos' })),
    );
  });

  it('le premier échec arrête l’envoi et lève l’avertissement', async () => {
    upload.mutateAsync.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('refus'));
    monter();
    choisir(photos(5));
    fireEvent.click(screen.getByRole('button', { name: 'Signaler le problème' }));

    expect(await screen.findByText('Photos non envoyées')).toBeInTheDocument();
    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/maintenance/42'));
    expect(upload.mutateAsync).toHaveBeenCalledTimes(2);
  });

  it('la borne de 20 se lit sous le sélecteur', () => {
    monter();
    expect(screen.getByLabelText('Photos (optionnel)')).toHaveAccessibleDescription('20 photos au plus.');
  });

  it('21 photos sont refusées et dites, et aucune ne part', async () => {
    upload.mutateAsync.mockResolvedValue({});
    monter();
    choisir(photos(21));

    expect(screen.getByRole('alert')).toHaveTextContent('21 photos choisies : 20 au plus. Choisissez-en moins.');
    fireEvent.click(screen.getByRole('button', { name: 'Signaler le problème' }));
    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/maintenance/42'));
    expect(upload.mutateAsync).not.toHaveBeenCalled();
  });
});
