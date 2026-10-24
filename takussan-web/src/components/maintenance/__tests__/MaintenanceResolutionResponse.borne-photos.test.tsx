import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import type { MaintenanceRequest } from '@/types/maintenance';
import { MaintenanceResolutionResponse } from '../MaintenanceResolutionResponse';

const contest = { mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false, error: null };
const confirm = { mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false, error: null };

vi.mock('@/lib/queries/maintenance', () => ({
  useConfirmMaintenanceResolution: () => confirm,
  useContestMaintenanceResolution: () => contest,
}));

// Les photos partent telles quelles : la réduction n'est pas l'objet de ce test.
vi.mock('@/lib/reduire-photo', () => ({
  reduirePhotos: async (files: File[]) => files,
}));

const request = {
  id: 7,
  status: 'resolved',
  abilities: { can_confirm_resolution: true, can_contest_resolution: true },
} as unknown as MaintenanceRequest;

const photo = (i: number) => new File(['x'], `photo-${i}.jpg`, { type: 'image/jpeg' });

/**
 * TCK-1889 (P195.02) — au-delà de cinq photos (`max:5` de `ContestMaintenanceResolutionRequest`),
 * la sélection est refusée avec le message de `MediaDropzone`, au lieu d'être coupée en silence
 * à l'envoi.
 */
describe('<MaintenanceResolutionResponse> — cinq photos au plus', () => {
  beforeEach(() => {
    contest.mutateAsync.mockReset();
    contest.mutateAsync.mockResolvedValue(undefined);
  });

  const ouvrir = () => {
    render(withIntl(<MaintenanceResolutionResponse request={request} />));
    fireEvent.click(screen.getByRole('button', { name: 'Le problème persiste' }));
    fireEvent.change(screen.getByLabelText("Qu'est-ce qui ne va pas ?"), { target: { value: 'Fuite encore' } });
  };

  it('six photos choisies : message visible, et rien ne part tronqué', async () => {
    ouvrir();
    fireEvent.change(screen.getByLabelText('Photos (facultatif)'), {
      target: { files: [1, 2, 3, 4, 5, 6].map(photo) },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Maximum 5 fichiers.');

    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await vi.waitFor(() => expect(contest.mutateAsync).toHaveBeenCalled());
    expect(contest.mutateAsync).toHaveBeenCalledWith({ comment: 'Fuite encore', photos: undefined });
  });

  it('cinq photos choisies : aucun message, les cinq partent', async () => {
    ouvrir();
    const cinq = [1, 2, 3, 4, 5].map(photo);
    fireEvent.change(screen.getByLabelText('Photos (facultatif)'), { target: { files: cinq } });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await vi.waitFor(() => expect(contest.mutateAsync).toHaveBeenCalled());
    expect(contest.mutateAsync).toHaveBeenCalledWith({ comment: 'Fuite encore', photos: cinq });
  });
});
