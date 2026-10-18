/**
 * TCK-913 (P08.10) — prendre une photo depuis le téléphone, et la feuille du bas en `dvh`.
 *
 * - `MediaDropzone` n'ouvrait que la galerie : sans `capture`, la photo d'un état des lieux ou d'un
 *   bien se prenait dans l'appareil photo, puis se cherchait dans la galerie. Un second bouton
 *   « Prendre une photo » (`capture="environment"`) ouvre directement l'appareil, sur les écrans
 *   tactiles seulement (`pointer-fine:hidden`) : sur un ordinateur, `capture` est ignoré et le
 *   bouton doublerait la zone.
 * - `ui/sheet.tsx` plafonnait la feuille du haut et du bas à `90vh` : sur un téléphone, `vh` compte
 *   la barre d'adresse repliée, et le bas de la feuille passe sous elle. `PropertyListFilters`
 *   corrigeait déjà en `dvh` ; la primitive aussi.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

vi.mock('@/lib/reduire-photo', () => ({
  reduirePhoto: async (f: File) => f,
  reduirePhotos: async (fs: readonly File[]) => [...fs],
  reduirePhotosSousPlafond: async (fs: readonly File[]) => [...fs],
}));

import { MediaDropzone } from '../MediaManager';
import { StepPhotos } from '@/components/property-form/wizard/steps/StepPhotos';

const source = (fichier: string) => readFileSync(resolve(process.cwd(), fichier), 'utf8');

describe('MediaDropzone — « Prendre une photo » (TCK-913)', () => {
  it('avec `camera`, un second champ ouvre l’appareil photo et remet la photo prise', async () => {
    const onChange = vi.fn();
    render(withIntl(<MediaDropzone files={[]} onChange={onChange} onRemove={vi.fn()} camera />));

    const champ = screen.getByLabelText('Prendre une photo');
    expect(champ).toHaveAttribute('type', 'file');
    expect(champ).toHaveAttribute('capture', 'environment');
    expect(champ).not.toHaveAttribute('multiple');
    expect(champ.closest('label')).toHaveClass('pointer-fine:hidden');

    const photo = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(champ, { target: { files: [photo] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([photo]));
  });

  it('sans `camera`, la zone reste seule', () => {
    render(withIntl(<MediaDropzone files={[]} onChange={vi.fn()} onRemove={vi.fn()} />));
    expect(screen.queryByLabelText('Prendre une photo')).toBeNull();
  });

  it('les photos du bien proposent l’appareil photo', () => {
    render(withIntl(<StepPhotos files={[]} onChange={vi.fn()} onRemove={vi.fn()} error={null} />));
    expect(screen.getByLabelText('Prendre une photo')).toHaveAttribute('capture', 'environment');
  });

  it('l’état des lieux passe `camera` à sa zone (garde de source)', () => {
    const bloc = /<MediaDropzone\b[\s\S]*?\/>/.exec(source('src/components/inventory/InventoryDetail.tsx'));
    expect(bloc?.[0]).toMatch(/\bcamera\b/);
  });
});

describe('ui/sheet — hauteur dynamique (TCK-913)', () => {
  it('la feuille du haut et du bas se plafonne en dvh, jamais en vh', () => {
    const s = source('src/components/ui/sheet.tsx');
    expect(s).toContain('max-h-[90dvh]');
    expect(s).not.toMatch(/max-h-\[\d+vh\]/);
  });
});
