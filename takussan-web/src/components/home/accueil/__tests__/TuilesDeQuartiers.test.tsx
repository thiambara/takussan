import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { QuartierDeLAccueil } from '@/lib/queries/raccourcis-de-l-accueil';
import { withIntl } from '@/test/intl';
import { TuilesDeQuartiers } from '../TuilesDeQuartiers';

/**
 * TCK-2844 (AC7, ADR-0109 §3) — la tuile d'un quartier avec photo est celle de la maquette (photo plein
 * cadre, dégradé, nom et compte en clair) ; sans photo, ou si la photo ne se charge pas, le motif
 * bogolan d'avant le ticket.
 *
 * Sous vitest, le loader par défaut de Next (`/_next/image?url=…`) tient lieu du `loaderFile`.
 */
const PHOTO = 'https://media.takussan.com/41/conversions/mermoz-display.webp?v=1700000000';

function monter(quartiers: readonly QuartierDeLAccueil[]) {
  return render(withIntl(<TuilesDeQuartiers ville="Dakar" quartiers={quartiers} />));
}

function tuile(nom: string): HTMLElement {
  return screen.getByRole('link', { name: new RegExp(nom) });
}

describe('<TuilesDeQuartiers /> — TCK-2844', () => {
  it('avec photo : la photo plein cadre, décorative, sous le dégradé de la maquette', () => {
    monter([{ nom: 'Mermoz', compte: 12, photo: PHOTO }]);

    const lien = tuile('Mermoz');
    expect(lien).toHaveAttribute('href', '/fr/properties?city=Dakar&location=Mermoz');

    const image = lien.querySelector('img');
    expect(image).not.toBeNull();
    expect(image).toHaveAttribute('alt', '');
    // Par le loader, jamais l'URL brute.
    expect(image!.getAttribute('src')).toContain(encodeURIComponent('/41/conversions/mermoz-display.webp'));
    expect(image!.getAttribute('sizes')).toBe('(min-width: 1024px) 13vw, (min-width: 640px) 25vw, 132px');
    expect(image!.className).toContain('object-cover');

    const degrade = within(lien).getByTestId('degrade-de-tuile');
    for (const c of ['bg-gradient-to-t', 'from-foreground/85', 'via-foreground/40', 'to-transparent', 'absolute', 'bottom-0']) {
      expect(degrade.className.split(/\s+/)).toContain(c);
    }
    // Nom et compte en clair, le compte à 85 % comme dans la maquette.
    expect(within(degrade).getByText('Mermoz').parentElement!.className).toContain('text-background');
    expect(within(degrade).getByText('12 annonces').className).toContain('opacity-85');
    expect(within(degrade).getByText('Mermoz')).toBeInTheDocument();
    expect(within(degrade).getByText('12 annonces')).toBeInTheDocument();
    expect(within(lien).queryByTestId('motif-de-tuile')).toBeNull();
    // Mêmes dimensions que la tuile sans photo.
    expect(lien.className.split(/\s+/)).toEqual(expect.arrayContaining(['size-[132px]', 'sm:aspect-square', 'sm:size-auto', 'focus-visible:ring-2']));
  });

  it('sans photo : la tuile d’avant le ticket, motif bogolan, aucune image', () => {
    monter([{ nom: 'Ngor', compte: 9, photo: null }]);

    const lien = tuile('Ngor');
    expect(lien.querySelector('img')).toBeNull();
    expect(within(lien).getByTestId('motif-de-tuile')).toBeInTheDocument();
    expect(within(lien).queryByTestId('degrade-de-tuile')).toBeNull();
    expect(lien.className.split(/\s+/)).toEqual(expect.arrayContaining(['bg-secondary', 'p-3', 'size-[132px]']));
    expect(within(lien).getByText('9 annonces').className).toContain('text-muted-foreground');
  });

  it('une photo qui ne se charge pas retombe sur le motif', () => {
    monter([{ nom: 'Mermoz', compte: 12, photo: PHOTO }]);

    const lien = tuile('Mermoz');
    fireEvent.error(lien.querySelector('img')!);

    expect(lien.querySelector('img')).toBeNull();
    expect(within(lien).getByTestId('motif-de-tuile')).toBeInTheDocument();
    expect(within(lien).getByText('Mermoz')).toBeInTheDocument();
  });

  it('chaque tuile suit sa propre photo', () => {
    monter([
      { nom: 'Mermoz', compte: 12, photo: PHOTO },
      { nom: 'Ngor', compte: 9, photo: null },
    ]);

    expect(tuile('Mermoz').querySelector('img')).not.toBeNull();
    expect(tuile('Ngor').querySelector('img')).toBeNull();
  });
});
