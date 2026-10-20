import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { ComponentProps } from 'react';

import { withIntl } from '@/test/intl';
import type { PropertyPhoto } from '@/types/property';
import { PropertyGalleryMosaic } from '../PropertyGalleryMosaic';
import { PropertyMobileGallery } from '../PropertyMobileGallery';

/**
 * TCK-1088 (P69.06) — **un seul `priority` par fiche, sur `PropertyMobileGallery`.**
 *
 * La fiche monte ses deux galeries (`hidden md:block` et `md:hidden`), chacune avec `priority`
 * sur sa première photo : le `<head>` portait deux préchargements de la même photo (384w et
 * 640w), demandée deux fois (mesuré par l'explorateur, 2,1 s puis 4,1 s). `priority` ne paraît pas
 * dans le DOM sous jsdom : `next/image` est remplacé par une image qui l'expose.
 */
vi.mock('next/image', () => ({
  default: ({ priority, fill: _fill, ...props }: ComponentProps<'img'> & { priority?: boolean; fill?: boolean }) => (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img {...props} data-priority={priority ? 'true' : 'false'} />
  ),
}));

const photo = (id: number): PropertyPhoto =>
  ({ id, thumbnail: `/t${id}.webp`, preview: `/p${id}.webp`, full: `/f${id}.webp`, original: `/o${id}.webp` }) as PropertyPhoto;

/** La galerie mobile suit la photo visible par un `IntersectionObserver`, que jsdom n'a pas. */
class ObservateurInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
});

describe('les deux galeries de la fiche : un seul préchargement', () => {
  it.each([1, 2, 3, 4, 5, 6])('%i photo(s) : un seul `priority`, sur la galerie mobile', (n) => {
    const photos = Array.from({ length: n }, (_, i) => photo(i + 1));
    const { container } = render(
      withIntl(
        <>
          <div data-galerie="mosaique">
            <PropertyGalleryMosaic photos={photos} title="Villa" onOpenLightbox={vi.fn()} />
          </div>
          <div data-galerie="mobile">
            <PropertyMobileGallery photos={photos} title="Villa" onOpenLightbox={vi.fn()} />
          </div>
        </>,
      ),
    );

    const prioritaires = Array.from(container.querySelectorAll('img[data-priority="true"]'));
    expect(prioritaires).toHaveLength(1);
    expect(prioritaires[0].closest('[data-galerie]')?.getAttribute('data-galerie')).toBe('mobile');
  });
});
