/**
 * TCK-2819 (lot 2) — le dépôt de photos de l'assistant d'après la maquette `app-entree-publier` (a-4).
 *
 * | test | régression attrapée |
 * |---|---|
 * | tuiles et zone | une tuile ou la zone qui ne désigne plus le champ de fichier (geste mort) |
 * | vignettes | « Couverture » absente ou posée sur une autre que la première ; une croix sous 44 px |
 * | « Ajouter » | une tuile qui reste quand le plafond est atteint |
 * | plafond | onze photos acceptées (règle de `MediaDropzone` perdue en changeant de dessin) |
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { DepotDePhotos } from '../wizard/DepotDePhotos';

const photo = (n: string) => new File(['x'], n, { type: 'image/jpeg' });

function monter(files: File[] = [], onChange = vi.fn(), onRemove = vi.fn()) {
  const rendu = render(withIntl(<DepotDePhotos files={files} onChange={onChange} onRemove={onRemove} error={null} />));
  return { ...rendu, onChange, onRemove };
}

describe('DepotDePhotos (maquette a-4)', () => {
  it('« Prendre une photo », « Choisir dans la galerie » et la zone du bureau désignent les champs de fichier', () => {
    const { container } = monter();
    const galerie = screen.getByTestId('media-dropzone-input');
    const camera = container.querySelector('input[capture="environment"]') as HTMLInputElement;
    expect(camera).not.toBeNull();

    const versGalerie = container.querySelectorAll(`label[for="${galerie.id}"]`);
    expect(versGalerie.length).toBe(2); // tuile du téléphone + zone du bureau
    expect(versGalerie[0]).toHaveTextContent('Choisir dans la galerie');
    expect(versGalerie[1]).toHaveTextContent('Glissez-déposez vos photos ici');
    expect(container.querySelector(`label[for="${camera.id}"]`)).toHaveTextContent('Prendre une photo');
    expect(screen.getByText('JPG, PNG ou WebP · 10 Mo max par photo.')).toBeInTheDocument();
    expect(screen.getByText(/aucune photo pour l.instant/i)).toBeInTheDocument();
  });

  it('les vignettes : « Couverture » sur la première seule, une croix de 44 px, « Ajouter » pour la suite', async () => {
    const user = userEvent.setup();
    const { onRemove } = monter([photo('salon.jpg'), photo('cuisine.jpg')]);

    expect(screen.getByText('2 photos sur 10')).toBeInTheDocument();
    expect(screen.getByText('La première est la photo principale')).toBeInTheDocument();
    const [premiere, seconde] = screen.getAllByRole('listitem');
    expect(within(premiere).getByText('Couverture')).toBeInTheDocument();
    expect(within(seconde).queryByText('Couverture')).not.toBeInTheDocument();

    const retirer = screen.getByRole('button', { name: 'Retirer cuisine.jpg' });
    expect(retirer).toHaveClass('size-11');
    await user.click(retirer);
    expect(onRemove).toHaveBeenCalledWith(1);
    expect(screen.getByText('Ajouter').closest('label')).toHaveAttribute('for', screen.getByTestId('media-dropzone-input').id);
  });

  it('au plafond de dix, plus de tuile « Ajouter »', () => {
    monter(Array.from({ length: 10 }, (_, i) => photo(`p${i}.jpg`)));
    expect(screen.queryByText('Ajouter')).not.toBeInTheDocument();
  });

  it('une photo de trop est refusée, comme dans `MediaDropzone`', async () => {
    const { onChange } = monter(Array.from({ length: 9 }, (_, i) => photo(`p${i}.jpg`)));
    fireEvent.change(screen.getByTestId('media-dropzone-input'), { target: { files: [photo('a.jpg'), photo('b.jpg')] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Maximum 10 fichiers.');
    await waitFor(() => expect(onChange).not.toHaveBeenCalled());
  });
});
