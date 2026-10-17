/**
 * TCK-754 (P07.10) — la visionneuse ouverte est un dialogue NOMMÉ : sans nom, un lecteur d'écran
 * annonce « dialogue » sans dire de quoi.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { PropertyPhoto } from '@/types/property';

import { PropertyLightbox } from '../PropertyLightbox';

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));

const photos = [
  { id: 1, url: 'https://example.test/1.jpg' },
  { id: 2, url: 'https://example.test/2.jpg' },
] as unknown as PropertyPhoto[];

describe('<PropertyLightbox> (TCK-754)', () => {
  it('nomme la visionneuse par le titre du bien', async () => {
    render(withIntl(<PropertyLightbox photos={photos} open startIndex={0} onClose={() => {}} title="Villa Ngor" />));
    expect(await screen.findByRole('dialog', { name: 'Photos : Villa Ngor' })).toBeInTheDocument();
  });
});
