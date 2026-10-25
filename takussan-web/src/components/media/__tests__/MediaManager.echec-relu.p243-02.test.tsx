import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { MediaManager, type MediaItem } from '../MediaManager';

/**
 * P243.02 (TCK-2371) — un geste refusé de la grille remettait l'instantané ENTIER pris avant lui.
 * Deux gestes en vol se recouvraient : une suppression refusée après une autre acceptée faisait
 * reparaître la photo supprimée en base. Décision du porteur : sur l'échec, la liste se relit.
 */
vi.mock('@/lib/reduire-photo', () => ({
  reduirePhoto: vi.fn(async (f: File) => f),
  reduirePhotos: vi.fn(async (fs: readonly File[]) => [...fs]),
  reduirePhotosSousPlafond: vi.fn(async (fs: readonly File[]) => [...fs]),
}));

const PHOTOS: MediaItem[] = [
  { id: 1, thumbnail: 't1', order: 1 },
  { id: 2, thumbnail: 't2', order: 2 },
  { id: 3, thumbnail: 't3', order: 3 },
];

const vignettes = () =>
  screen.getAllByTestId('media-tile').map((tuile) => tuile.querySelector('img')?.getAttribute('src'));

function differee() {
  let rejeter!: (e: Error) => void;
  const promesse = new Promise<void>((_, r) => {
    rejeter = r;
  });
  return { promesse, rejeter };
}

describe('<MediaManager> — un geste refusé relit la liste (P243.02)', () => {
  it('suppression de 1 refusée après celle de 2 acceptée : la grille rend 1 et 3, pas 2', async () => {
    const refus = differee();
    const onDelete = vi.fn(async (id: number) => (id === 1 ? refus.promesse : undefined));
    // Le serveur, relu : 2 est supprimée, 1 ne l'est pas.
    const onRelire = vi.fn(async () => [PHOTOS[0], PHOTOS[2]]);
    render(withIntl(
      <MediaManager items={PHOTOS} onUpload={vi.fn()} onReorder={vi.fn()} onDelete={onDelete} onRelire={onRelire} />,
    ));

    const [supprimer1, supprimer2] = screen.getAllByRole('button', { name: /supprimer/i });
    await userEvent.click(supprimer1);
    await userEvent.click(supprimer2);
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(2));
    refus.rejeter(new Error('refusé'));

    await waitFor(() => expect(onRelire).toHaveBeenCalled());
    await waitFor(() => expect(vignettes()).toEqual(['t1', 't3']));
  });

  it('suppression de 1 refusée pendant que celle de 2 est en vol : 2 ne reparaît pas avant sa réponse', async () => {
    const refus = differee();
    const enVol = new Promise<void>(() => {});
    const onDelete = vi.fn(async (id: number) => (id === 1 ? refus.promesse : enVol));
    // Relue avant que la suppression de 2 n'aboutisse : le serveur la porte encore.
    const onRelire = vi.fn(async () => PHOTOS);
    render(withIntl(
      <MediaManager items={PHOTOS} onUpload={vi.fn()} onReorder={vi.fn()} onDelete={onDelete} onRelire={onRelire} />,
    ));

    const [supprimer1, supprimer2] = screen.getAllByRole('button', { name: /supprimer/i });
    await userEvent.click(supprimer1);
    await userEvent.click(supprimer2);
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(2));
    refus.rejeter(new Error('refusé'));

    await waitFor(() => expect(onRelire).toHaveBeenCalled());
    await waitFor(() => expect(vignettes()).toEqual(['t1', 't3']));
  });

  it('un réordonnancement refusé rend l’ordre relu du serveur', async () => {
    const onReorder = vi.fn(async () => {
      throw new Error('refusé');
    });
    const onRelire = vi.fn(async () => [PHOTOS[2], PHOTOS[0], PHOTOS[1]]);
    render(withIntl(
      <MediaManager items={PHOTOS} onUpload={vi.fn()} onReorder={onReorder} onDelete={vi.fn()} onRelire={onRelire} />,
    ));

    await userEvent.click(screen.getAllByRole('button', { name: /couverture/i })[0]);

    await waitFor(() => expect(vignettes()).toEqual(['t3', 't1', 't2']));
  });
});
