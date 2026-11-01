import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/test/intl';
import type { RadarPublicationListing } from '@/types/radar';
import { PhotosReserve } from '../PhotosReserve';
import { annonce } from './mocks';

const url = (id: number, signature: string) => `https://media.takussan.test/reserve-${id}.jpg?signature=${signature}`;

function monter(a: RadarPublicationListing) {
  return withIntl(<PhotosReserve annonce={a} desactive={false} onRetirer={vi.fn()} onDeposer={vi.fn()} onRecuperer={vi.fn()} />);
}

const sources = () => screen.getAllByRole('img').map((img) => img.getAttribute('src'));

/**
 * TCK-2389 — chaque relecture de l'aperçu rend des URL signées neuves ; les vignettes ne se rechargent pas pour autant.
 */
describe('PhotosReserve — des vignettes qui ne se rechargent pas', () => {
  it('une photo garde l\'URL qu\'on lui a vue tant que son id reste, même quand l\'aperçu en rend une neuve', () => {
    const avant = annonce(12, { photos: [{ id: 1, url: url(1, 'a') }, { id: 2, url: url(2, 'a') }] });
    const { rerender } = render(monter(avant));
    expect(sources()).toEqual([url(1, 'a'), url(2, 'a')]);

    rerender(monter(annonce(12, { photos: [{ id: 1, url: url(1, 'b') }, { id: 2, url: url(2, 'b') }] })));

    expect(sources()).toEqual([url(1, 'a'), url(2, 'a')]);
  });

  it('une photo ajoutée entre deux relectures prend son URL, les autres gardent la leur', () => {
    const { rerender } = render(monter(annonce(12, { photos: [{ id: 1, url: url(1, 'a') }] })));

    rerender(monter(annonce(12, { photos: [{ id: 1, url: url(1, 'b') }, { id: 3, url: url(3, 'b') }] })));

    expect(sources()).toEqual([url(1, 'a'), url(3, 'b')]);
  });

  it('une vignette que le navigateur ne charge plus (signature échue) prend l\'URL courante', () => {
    const { rerender } = render(monter(annonce(12, { photos: [{ id: 1, url: url(1, 'a') }] })));
    rerender(monter(annonce(12, { photos: [{ id: 1, url: url(1, 'b') }] })));
    expect(sources()).toEqual([url(1, 'a')]);

    fireEvent.error(screen.getAllByRole('img')[0]);

    expect(sources()).toEqual([url(1, 'b')]);
  });
});
