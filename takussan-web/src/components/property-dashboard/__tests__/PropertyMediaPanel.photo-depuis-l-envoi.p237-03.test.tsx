import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { withIntl } from '@/test/intl';

const actions = vi.hoisted(() => ({
  fetchPropertyMediaAction: vi.fn(),
  uploadPropertyPhotosAction: vi.fn(),
  reorderPropertyMediaAction: vi.fn(),
  deletePropertyMediaAction: vi.fn(),
}));
vi.mock('@/app/actions/dashboard-properties', () => actions);

// La réduction passe par un canvas, que jsdom n'a pas : les fichiers passent tels quels.
vi.mock('@/lib/reduire-photo', () => ({
  reduirePhotos: async (files: File[]) => files,
  reduirePhotosSousPlafond: async (files: File[]) => files,
}));

import { PropertyMediaPanel } from '../PropertyMediaPanel';

/**
 * TCK-2370 (P237.03) — une photo de bien envoyée était cherchée par une relecture de la liste ;
 * une relecture en échec rendait `[]`, et la ligne passait à « envoyée » sans photo dans la grille.
 * La photo est rendue depuis la réponse de l'envoi : l'API rend déjà les médias créés.
 */
describe('<PropertyMediaPanel> — la photo envoyée vient de la réponse de l’envoi', () => {
  beforeEach(() => {
    for (const action of Object.values(actions)) action.mockReset();
    actions.fetchPropertyMediaAction
      .mockResolvedValueOnce({ ok: true, data: [] })
      .mockResolvedValue({ ok: false, message: 'relecture en panne' });
    actions.uploadPropertyPhotosAction.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 51,
          thumbnail: 'https://api.test/m/51/thumb.jpg',
          preview: 'https://api.test/m/51/preview.jpg',
          full: 'https://api.test/m/51/full.jpg',
          original: 'https://api.test/m/51/original.jpg',
        },
      ],
    });
  });

  it('la ligne « envoyée » a sa photo dans la grille, sans relire la liste', async () => {
    const { container } = render(withIntl(<PropertyMediaPanel propertyId={8} />));
    const input = await screen.findByTestId('media-manager-input');

    fireEvent.change(input, {
      target: { files: [new File(['x'], 'salon.jpg', { type: 'image/jpeg' })] },
    });

    await waitFor(() => expect(container.querySelector('[data-status="done"]')).not.toBeNull());
    const tuiles = screen.getAllByTestId('media-tile');
    expect(tuiles).toHaveLength(1);
    expect(tuiles[0].querySelector('img')).toHaveAttribute('src', 'https://api.test/m/51/thumb.jpg');
    expect(actions.fetchPropertyMediaAction).toHaveBeenCalledTimes(1);
  });
});
