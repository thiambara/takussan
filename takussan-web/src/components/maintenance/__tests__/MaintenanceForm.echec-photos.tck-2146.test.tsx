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
 * TCK-2146 (P222.01) — l'échec de l'envoi des photos d'une demande neuve tombait dans un
 * `catch {}` vide : le demandeur arrivait sur une fiche sans photo, sans rien en savoir.
 */
describe('<MaintenanceForm> — échec de l\'envoi des photos', () => {
  beforeEach(() => {
    routeur.push.mockReset();
    create.mutateAsync.mockReset();
    upload.mutateAsync.mockReset();
    create.mutateAsync.mockResolvedValue({ data: { id: 42 } });
  });

  function remplirEtEnvoyer() {
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
    const photo = new File(['x'], 'fuite.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Photos (optionnel)'), { target: { files: [photo] } });
    fireEvent.click(screen.getByRole('button', { name: 'Signaler le problème' }));
  }

  it('un envoi de photos refusé lève l\'avertissement, et mène quand même à la fiche', async () => {
    upload.mutateAsync.mockRejectedValue(new Error('413'));
    remplirEtEnvoyer();

    expect(await screen.findByText('Photos non envoyées')).toBeInTheDocument();
    expect(
      screen.getByText('La demande est créée, mais ses photos n\'ont pas pu être envoyées.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/maintenance/42'));
    expect(create.mutateAsync).toHaveBeenCalledTimes(1);
  });

  it('un envoi de photos réussi ne lève aucun avertissement', async () => {
    upload.mutateAsync.mockResolvedValue({});
    remplirEtEnvoyer();

    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/maintenance/42'));
    expect(upload.mutateAsync).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Photos non envoyées')).not.toBeInTheDocument();
  });
});
