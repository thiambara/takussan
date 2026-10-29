import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SuperAdminRadarPublishPage, { generateMetadata } from '../page';

/**
 * TCK-2389 — la page « Publier pour lui » : un identifiant qui n'est pas un entier positif est un 404,
 * avant tout rendu et tout appel ; sinon l’écran reçoit l'identifiant sous forme de nombre.
 */
const notFoundMock = vi.fn(() => {
  // `notFound()` de Next ne rend pas : il lève. Le mock fait pareil.
  throw new Error('NEXT_NOT_FOUND');
});

vi.mock('next/navigation', () => ({ notFound: () => notFoundMock() }));
vi.mock('next-intl/server', () => ({
  getTranslations: async (espace: string) => (cle: string) => `${espace}.${cle}`,
}));
vi.mock('@/components/admin/super/radar/publication/RadarPublication', () => ({
  RadarPublication: ({ id }: { id: number }) => <div data-testid="publication" data-id={id} data-type={typeof id} />,
}));

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('/super-admin/radar/advertisers/[id]/publish (TCK-2389)', () => {
  beforeEach(() => {
    notFoundMock.mockClear();
  });

  it.each(['abc', '0', '-3', '1.5', '', '1e'])('« %s » → notFound, sans rendre l’écran', async (id) => {
    await expect(SuperAdminRadarPublishPage(params(id))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it('un entier positif rend l’écran, avec un nombre', async () => {
    render(await SuperAdminRadarPublishPage(params('42')));
    const fiche = screen.getByTestId('publication');
    expect(fiche).toHaveAttribute('data-id', '42');
    expect(fiche).toHaveAttribute('data-type', 'number');
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('le titre de l\'onglet vient des messages de la publication', async () => {
    expect(await generateMetadata()).toEqual({ title: 'superAdmin.pages.radar.publication.metaTitle' });
  });
});
