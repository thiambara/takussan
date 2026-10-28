import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SuperAdminRadarListingPage, { generateMetadata } from '../page';

/**
 * TCK-2387 — la page de la fiche : un identifiant qui n'est pas un entier positif est un 404, avant
 * tout rendu et tout appel ; sinon la fiche reçoit l'identifiant sous forme de nombre.
 */
const notFoundMock = vi.fn(() => {
  // `notFound()` de Next ne rend pas : il lève. Le mock fait pareil.
  throw new Error('NEXT_NOT_FOUND');
});

vi.mock('next/navigation', () => ({ notFound: () => notFoundMock() }));
vi.mock('next-intl/server', () => ({
  getTranslations: async (espace: string) => (cle: string) => `${espace}.${cle}`,
}));
vi.mock('@/components/admin/super/radar/fiche/RadarListingFiche', () => ({
  RadarListingFiche: ({ id }: { id: number }) => <div data-testid="fiche" data-id={id} data-type={typeof id} />,
}));

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('/super-admin/radar/[id] (TCK-2387)', () => {
  beforeEach(() => {
    notFoundMock.mockClear();
  });

  it.each(['abc', '0', '-3', '1.5', '', '1e'])('« %s » → notFound, sans rendre la fiche', async (id) => {
    await expect(SuperAdminRadarListingPage(params(id))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it('un entier positif rend la fiche, avec un nombre', async () => {
    render(await SuperAdminRadarListingPage(params('42')));
    const fiche = screen.getByTestId('fiche');
    expect(fiche).toHaveAttribute('data-id', '42');
    expect(fiche).toHaveAttribute('data-type', 'number');
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('le titre de l\'onglet vient des messages de la fiche', async () => {
    expect(await generateMetadata()).toEqual({ title: 'superAdmin.pages.radar.listing.metaTitle' });
  });
});
